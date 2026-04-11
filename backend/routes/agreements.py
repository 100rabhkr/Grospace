"""
CRUD agreements, confirm-and-activate, save-draft endpoints.
"""


import uuid
import logging
from functools import lru_cache

from fastapi import APIRouter, HTTPException, Depends, Query
from starlette.requests import Request

from typing import Optional

from core.config import supabase, limiter, log_activity
from core.dependencies import get_current_user, get_current_user_sync, get_org_filter, require_permission
from core.models import (
    ConfirmActivateRequest, CurrentUser, UpdateAgreementRequest, SaveDraftRequest,
)
from services.extraction_fields import get_date, get_num, get_section, get_val

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["agreements"])


@lru_cache(maxsize=1)
def _extraction_service():
    from services import extraction as extraction_service

    return extraction_service


@router.get("/agreements", dependencies=[Depends(require_permission("view_agreements"))])
async def list_agreements(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List agreements with outlet info (paginated). Scoped to caller's org."""
    offset = (page - 1) * page_size
    org_id = get_org_filter(user)

    count_query = supabase.table("agreements").select("id", count="exact")
    if org_id:
        count_query = count_query.eq("org_id", org_id)
    count_result = count_query.execute()
    total = count_result.count or 0

    query = supabase.table("agreements").select(
        "*, outlets(name, city, address, property_type, status)"
    )
    if org_id:
        query = query.eq("org_id", org_id)
    result = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@router.get("/agreements/{agreement_id}", dependencies=[Depends(require_permission("view_agreements"))])
async def get_agreement(agreement_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Get a single agreement with full details. 404 if outside caller's org."""
    result = supabase.table("agreements").select("*, outlets(*)").eq("id", agreement_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    # Multi-tenant guard: non-admins can only access their own org
    org_id = get_org_filter(user)
    if org_id and result.data.get("org_id") != org_id:
        raise HTTPException(status_code=404, detail="Agreement not found")

    obligations = supabase.table("obligations").select("*").eq("agreement_id", agreement_id).limit(200).execute()
    alerts = supabase.table("alerts").select("*").eq("agreement_id", agreement_id).order("trigger_date").limit(200).execute()

    return {
        "agreement": result.data,
        "obligations": obligations.data,
        "alerts": alerts.data,
    }


@router.patch("/agreements/{agreement_id}", dependencies=[Depends(require_permission("edit_agreements"))])
async def update_agreement(
    agreement_id: str,
    body: UpdateAgreementRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Update extracted fields on an agreement (sparse dot-notation merge). Org-scoped."""
    current = supabase.table("agreements").select("extracted_data, org_id").eq("id", agreement_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    org_id = get_org_filter(user)
    if org_id and current.data.get("org_id") != org_id:
        raise HTTPException(status_code=404, detail="Agreement not found")

    extracted = current.data.get("extracted_data") or {}
    import copy
    old_extracted = copy.deepcopy(extracted)

    if body.field_updates:
        for dot_key, new_val in body.field_updates.items():
            parts = dot_key.split(".", 1)
            if len(parts) == 2:
                section, field = parts
                if section not in extracted:
                    extracted[section] = {}
                if isinstance(extracted[section], dict):
                    existing = extracted[section].get(field)
                    if isinstance(existing, dict) and "value" in existing:
                        existing["value"] = new_val
                        extracted[section][field] = existing
                    else:
                        extracted[section][field] = new_val

    # Mirror edits into denormalized columns on the agreements table.
    # IMPORTANT: Only keys whose target column actually exists in schema.sql are listed here.
    # Fields like `revenue_share_pct` and `lock_in_period` live in extracted_data JSON only.
    shortcuts = {}
    shortcut_map = {
        "parties.lessor_name": "lessor_name",
        "parties.lessee_name": "lessee_name",
        "rent.monthly_rent": "monthly_rent",
        "charges.cam_monthly": "cam_monthly",
        "lease_term.lease_commencement_date": "lease_commencement_date",
        "lease_term.lease_start_date": "lease_commencement_date",  # alias (extraction schema name)
        "lease_term.rent_commencement_date": "rent_commencement_date",
        "lease_term.lease_expiry_date": "lease_expiry_date",
        "deposits.security_deposit": "security_deposit",
    }
    if body.field_updates:
        for dot_key, new_val in body.field_updates.items():
            if dot_key in shortcut_map:
                col = shortcut_map[dot_key]
                if col in ("monthly_rent", "cam_monthly", "security_deposit"):
                    try:
                        shortcuts[col] = float(str(new_val).replace(",", ""))
                    except (ValueError, TypeError):
                        shortcuts[col] = new_val
                else:
                    shortcuts[col] = new_val

    update_payload = {"extracted_data": extracted, **shortcuts}

    if body.extracted_data:
        update_payload["extracted_data"] = body.extracted_data

    result = supabase.table("agreements").update(update_payload).eq("id", agreement_id).execute()

    if result.data and body.field_updates:
        agr = result.data[0]
        org_id = agr.get("org_id")
        if org_id:
            # Build change details with old/new values for audit trail
            changes = {}
            for field_key, new_val in body.field_updates.items():
                old_val = old_extracted.get(field_key.split(".")[-1]) if "." not in field_key else None
                if "." in field_key:
                    parts = field_key.split(".")
                    section = old_extracted.get(parts[0], {})
                    if isinstance(section, dict):
                        raw = section.get(parts[1])
                        old_val = raw.get("value") if isinstance(raw, dict) and "value" in raw else raw
                changes[field_key] = {"old": old_val, "new": new_val}
            log_activity(org_id, None, "agreement", agreement_id, "fields_edited", {
                "fields": list(body.field_updates.keys()),
                "changes": changes,
            })

    return {"agreement": result.data[0] if result.data else None}


@router.delete("/agreements/{agreement_id}", dependencies=[Depends(require_permission("manage_org_settings"))])
async def delete_agreement(
    agreement_id: str,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Delete an agreement and all related data (admin only). Org-scoped."""
    # Get agreement for audit log
    agreement = supabase.table("agreements").select("org_id, lessor_name, filename, outlet_id").eq("id", agreement_id).single().execute()
    if not agreement.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    org_id = agreement.data["org_id"]

    # Multi-tenant guard: even an org_admin cannot delete another org's agreement
    user_org = get_org_filter(user)
    if user_org and org_id != user_org:
        raise HTTPException(status_code=404, detail="Agreement not found")

    # Cascade delete related data
    supabase.table("rent_schedules").delete().eq("agreement_id", agreement_id).execute()
    supabase.table("critical_dates").delete().eq("agreement_id", agreement_id).execute()
    supabase.table("agreement_clauses").delete().eq("agreement_id", agreement_id).execute()
    supabase.table("obligations").delete().eq("agreement_id", agreement_id).execute()
    supabase.table("alerts").delete().eq("agreement_id", agreement_id).execute()
    supabase.table("agreements").delete().eq("id", agreement_id).execute()

    # Audit log
    log_activity(org_id, None, "agreement", agreement_id, "agreement_deleted", {
        "lessor_name": agreement.data.get("lessor_name"),
        "filename": agreement.data.get("filename"),
    })

    return {"deleted": True, "agreement_id": agreement_id}


@router.post("/confirm-and-activate", dependencies=[Depends(require_permission("create_agreements"))])
@limiter.limit("10/minute")
async def confirm_and_activate(request: Request, req: ConfirmActivateRequest):
    """
    Confirm extraction and create outlet + agreement + obligations + alerts.
    Uses a single DB transaction via PL/pgSQL RPC for atomicity.
    Falls back to sequential inserts if migration_015 hasn't been run yet.
    """
    import logging
    logger = logging.getLogger(__name__)

    org_id = req.org_id
    if not org_id:
        # Try to get org_id from the authenticated user's profile
        current_user = get_current_user_sync(request.headers.get("authorization", ""))
        if current_user and current_user.org_id:
            org_id = current_user.org_id
    if not org_id:
        org_id = _extraction_service().get_or_create_demo_org()

    # Prepare all data objects upfront
    from services.extraction import (
        build_outlet_data, build_agreement_data,
        build_obligations_data, build_alerts_data,
    )

    outlet_data = build_outlet_data(req.extraction, org_id)
    agreement_data = build_agreement_data(
        req.extraction, req.document_type, req.risk_flags, req.confidence,
        req.filename, org_id, req.document_text, req.document_url, req.file_hash,
        req.custom_notes, req.custom_clauses,
    )
    obligations_data = build_obligations_data(req.extraction, org_id)
    alerts_data = build_alerts_data(req.extraction, org_id)

    document_data = None
    if req.document_url and req.filename:
        document_data = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "file_url": req.document_url,
            "filename": req.filename,
            "file_type": "lease_agreement",
        }

    activity_data = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "entity_type": "agreement",
        "action": "confirm_and_activate",
        "details": {
            "document_type": req.document_type,
            "filename": req.filename,
            "risk_flags_count": len(req.risk_flags),
        },
    }

    # Try transactional RPC first (requires migration_015)
    try:
        result = supabase.rpc("confirm_and_activate_tx", {
            "p_outlet": outlet_data,
            "p_agreement": agreement_data,
            "p_document": document_data,
            "p_obligations": obligations_data,
            "p_alerts": alerts_data,
            "p_activity": activity_data,
        }).execute()

        tx_result = result.data
        outlet_id = tx_result["outlet_id"]
        agreement_id = tx_result["agreement_id"]
        obligations_created = tx_result["obligations_created"]
        alerts_created = tx_result["alerts_created"]

        # RPC path does not populate critical dates, rent schedules, or
        # clauses — call them here so the event system is fully seeded.
        try:
            from routes.critical_dates import (
                populate_critical_dates_from_extraction,
                back_link_alerts_and_obligations_to_events,
            )
            populate_critical_dates_from_extraction(
                agreement_id, org_id, outlet_id, req.extraction,
            )
            # Back-link alerts/obligations created by the RPC to matching events
            # so the Event → Reminder + Payment model is honored end-to-end.
            back_link_alerts_and_obligations_to_events(agreement_id)
        except Exception as e:
            logger.warning("RPC path: failed to populate critical dates: %s", e)

        try:
            from routes.rent_schedules import populate_rent_schedule_from_extraction
            rent_section = get_section(req.extraction, "rent")
            rent_sched = get_val(rent_section.get("rent_schedule")) if rent_section else None
            lease_term_s = get_section(req.extraction, "lease_term")
            lc_date = get_val(lease_term_s.get("lease_commencement_date")) if lease_term_s else None
            le_date = get_val(lease_term_s.get("lease_expiry_date")) if lease_term_s else None
            if isinstance(rent_sched, list) and len(rent_sched) > 0:
                populate_rent_schedule_from_extraction(
                    agreement_id, org_id, rent_sched,
                    lease_commencement=lc_date if isinstance(lc_date, str) else None,
                    lease_expiry=le_date if isinstance(le_date, str) else None,
                )
        except Exception as e:
            logger.warning("RPC path: failed to populate rent schedule: %s", e)

        try:
            from routes.india_compliance import populate_clauses_from_extraction
            populate_clauses_from_extraction(agreement_id, org_id, req.extraction)
        except Exception as e:
            logger.warning("RPC path: failed to extract clauses: %s", e)

    except Exception as rpc_err:
        if "confirm_and_activate_tx" in str(rpc_err):
            # Migration not run yet — fall back to sequential inserts
            logger.warning("confirm_and_activate_tx RPC not found, using sequential fallback")
            outlet_id = None
            agreement_id = None
            try:
                extraction_service = _extraction_service()
                outlet_id = extraction_service.create_outlet_from_extraction(req.extraction, org_id)
                agreement_id = extraction_service.create_agreement_record(
                    extraction=req.extraction, doc_type=req.document_type,
                    risk_flags=req.risk_flags, confidence=req.confidence,
                    filename=req.filename, org_id=org_id, outlet_id=outlet_id,
                    document_text=req.document_text, document_url=req.document_url,
                )
                if req.document_url and req.filename:
                    try:
                        supabase.table("documents").insert({
                            "id": str(uuid.uuid4()), "org_id": org_id,
                            "outlet_id": outlet_id, "agreement_id": agreement_id,
                            "file_url": req.document_url, "filename": req.filename,
                            "file_type": "lease_agreement",
                        }).execute()
                    except Exception:
                        pass
                obligations = extraction_service.generate_obligations(req.extraction, agreement_id, outlet_id, org_id)
                alerts = extraction_service.generate_alerts(req.extraction, agreement_id, outlet_id, org_id)

                # Auto-populate rent schedule from extracted rent_schedule array
                try:
                    from routes.rent_schedules import populate_rent_schedule_from_extraction
                    rent_section = get_section(req.extraction, "rent")
                    rent_sched = get_val(rent_section.get("rent_schedule")) if rent_section else None
                    lease_term = get_section(req.extraction, "lease_term")
                    lc_date = get_val(lease_term.get("lease_commencement_date")) if lease_term else None
                    le_date = get_val(lease_term.get("lease_expiry_date")) if lease_term else None
                    if isinstance(rent_sched, list) and len(rent_sched) > 0:
                        populate_rent_schedule_from_extraction(
                            agreement_id, org_id, rent_sched,
                            lease_commencement=lc_date if isinstance(lc_date, str) else None,
                            lease_expiry=le_date if isinstance(le_date, str) else None,
                        )
                except Exception as e:
                    logger.warning(f"Failed to populate rent schedule: {e}")

                # Auto-populate critical dates from extraction
                try:
                    from routes.critical_dates import (
                        populate_critical_dates_from_extraction,
                        back_link_alerts_and_obligations_to_events,
                    )
                    populate_critical_dates_from_extraction(
                        agreement_id, org_id, outlet_id, req.extraction,
                    )
                    # Back-link alerts/obligations to matching events
                    back_link_alerts_and_obligations_to_events(agreement_id)
                except Exception as e:
                    logger.warning(f"Failed to populate critical dates: {e}")

                # Auto-extract clauses from legal section
                try:
                    from routes.india_compliance import populate_clauses_from_extraction
                    populate_clauses_from_extraction(agreement_id, org_id, req.extraction)
                except Exception as e:
                    logger.warning(f"Failed to extract clauses: {e}")
                obligations_created = len(obligations)
                alerts_created = len(alerts)
                supabase.table("activity_log").insert({
                    "id": str(uuid.uuid4()),
                    "org_id": org_id, "entity_type": "agreement",
                    "entity_id": agreement_id, "action": "confirm_and_activate",
                    "details": {
                        "outlet_id": outlet_id, "document_type": req.document_type,
                        "filename": req.filename, "obligations_created": obligations_created,
                        "alerts_created": alerts_created, "risk_flags_count": len(req.risk_flags),
                    }
                }).execute()
            except Exception as e:
                # Manual rollback for sequential path
                try:
                    if agreement_id:
                        supabase.table("critical_dates").delete().eq("agreement_id", agreement_id).execute()
                        supabase.table("rent_schedules").delete().eq("agreement_id", agreement_id).execute()
                        supabase.table("agreement_clauses").delete().eq("agreement_id", agreement_id).execute()
                        supabase.table("obligations").delete().eq("agreement_id", agreement_id).execute()
                        supabase.table("alerts").delete().eq("agreement_id", agreement_id).execute()
                        supabase.table("agreements").delete().eq("id", agreement_id).execute()
                    if outlet_id:
                        other = supabase.table("agreements").select("id").eq("outlet_id", outlet_id).execute()
                        if not other.data:
                            supabase.table("outlets").delete().eq("id", outlet_id).execute()
                except Exception:
                    logger.error("Rollback cleanup failed for agreement %s", agreement_id)
                raise HTTPException(status_code=500, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=str(rpc_err))

    # Get uploader name for sheets
    uploader_name = None
    try:
        if current_user and current_user.user_id:
            profile = supabase.table("profiles").select("full_name, email").eq("id", current_user.user_id).single().execute()
            if profile.data:
                uploader_name = profile.data.get("full_name") or profile.data.get("email")
    except Exception:
        pass

    # Write to Google Sheets (non-blocking, outside transaction)
    try:
        premises = get_section(req.extraction, "premises")
        parties = get_section(req.extraction, "parties")
        lease_term = get_section(req.extraction, "lease_term")
        rent = get_section(req.extraction, "rent")
        charges = get_section(req.extraction, "charges")
        deposits = get_section(req.extraction, "deposits")

        rent_schedule = get_val(rent.get("rent_schedule"))
        m_rent = None
        r_per_sqft = None
        if isinstance(rent_schedule, list) and len(rent_schedule) > 0:
            first_year = rent_schedule[0]
            if isinstance(first_year, dict):
                m_rent = get_num(first_year.get("mglr_monthly")) or get_num(first_year.get("monthly_rent"))
                r_per_sqft = get_num(first_year.get("mglr_per_sqft")) or get_num(first_year.get("rent_per_sqft"))

        cam = get_num(charges.get("cam_monthly"))
        sec_dep = get_num(deposits.get("security_deposit_amount"))
        total_outflow = (m_rent or 0) + (cam or 0)

        from services.sheets_service import write_agreement_to_sheet

        write_agreement_to_sheet(
            agreement_id=agreement_id,
            outlet_name=get_val(premises.get("property_name")) or get_val(parties.get("brand_name")) or "New Outlet",
            city=get_val(premises.get("city")) or "",
            state=get_val(premises.get("state")) or "",
            landlord=get_val(parties.get("lessor_name")),
            tenant=get_val(parties.get("lessee_name")),
            brand=get_val(parties.get("brand_name")),
            property_type=get_val(premises.get("property_type")),
            monthly_rent=m_rent,
            security_deposit=sec_dep,
            cam_monthly=cam,
            lease_start=get_date(lease_term.get("lease_commencement_date")),
            lease_end=get_date(lease_term.get("lease_expiry_date")),
            lock_in_months=get_num(lease_term.get("lock_in_months")),
            escalation_pct=get_num(rent.get("escalation_percentage")),
            rent_model=get_val(rent.get("rent_model")),
            area_sqft=get_num(premises.get("super_area_sqft")),
            rent_per_sqft=r_per_sqft,
            total_monthly_outflow=total_outflow if total_outflow > 0 else None,
            risk_flags_count=len(req.risk_flags),
            status="active",
            document_filename=req.filename,
            uploaded_by=uploader_name,
        )
    except Exception as sheets_err:
        logger.error(f"Google Sheets write failed: {sheets_err}")

    return {
        "status": "activated",
        "agreement_id": agreement_id,
        "outlet_id": outlet_id,
        "obligations_created": obligations_created,
        "alerts_created": alerts_created,
        "message": f"Agreement activated. {obligations_created} obligations and {alerts_created} alerts created.",
    }


@router.post("/agreements/create-draft", dependencies=[Depends(require_permission("edit_agreements"))])
def create_draft(body: ConfirmActivateRequest, request: Request):
    """Create a new draft agreement without creating outlet, obligations, or alerts."""
    try:
        org_id = body.org_id
        if not org_id:
            current_user = get_current_user_sync(request.headers.get("authorization", ""))
            org_id = current_user.org_id if current_user else None
        if not org_id:
            org_id = _extraction_service().get_or_create_demo_org()
        extraction = body.extraction or {}

        # Create a minimal placeholder outlet for the draft (outlet_id is NOT NULL in agreements)
        premises = get_section(extraction, "premises")
        parties = get_section(extraction, "parties")
        outlet_id = str(uuid.uuid4())
        minimal_outlet = {
            "id": outlet_id,
            "org_id": org_id,
            "name": get_val(premises.get("property_name")) or get_val(parties.get("brand_name")) or "Draft Outlet",
            "status": "fit_out",
        }
        supabase.table("outlets").insert(minimal_outlet).execute()

        # Create a minimal agreement record in draft status
        agreement_data = {
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "outlet_id": outlet_id,
            "type": body.document_type or "lease_loi",
            "extracted_data": extraction,
            "risk_flags": [rf.dict() if hasattr(rf, "dict") else rf for rf in (body.risk_flags or [])],
            "extraction_confidence": body.confidence or {},
            "document_filename": body.filename or "unknown",
            "document_text": body.document_text,
            "document_url": body.document_url,
            "file_hash": body.file_hash,
            "status": "draft",
        }

        # Clean None values
        clean = {k: v for k, v in agreement_data.items() if v is not None}
        result = supabase.table("agreements").insert(clean).execute()

        agreement_id = result.data[0]["id"] if result.data else clean["id"]

        log_activity(
            org_id=org_id,
            user_id=None,
            entity_type="agreement",
            entity_id=agreement_id,
            action="create_draft",
            details={"agreement_id": agreement_id, "filename": body.filename},
        )

        return {
            "status": "draft_saved",
            "agreement_id": agreement_id,
            "message": "Draft saved successfully. You can find it in Agreements with 'Draft' status.",
        }
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save draft: {str(e)}")


@router.patch("/agreements/{agreement_id}/save-draft", dependencies=[Depends(require_permission("edit_agreements"))])
def save_as_draft(agreement_id: str, body: SaveDraftRequest):
    """Save extraction as draft without creating obligations/alerts."""
    current = supabase.table("agreements").select("id").eq("id", agreement_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    update_data = {
        "extracted_data": body.extracted_data,
        "risk_flags": body.risk_flags,
        "status": "draft",
    }
    supabase.table("agreements").update(update_data).eq("id", agreement_id).execute()
    return {"status": "ok", "agreement_id": agreement_id, "message": "Saved as draft"}
