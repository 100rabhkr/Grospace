"""
CRUD agreements, confirm-and-activate, save-draft endpoints.
"""


import uuid
import logging

from fastapi import APIRouter, HTTPException, Depends, Query
from starlette.requests import Request

from core.config import supabase, limiter, log_activity
from core.models import (
    ConfirmActivateRequest, UpdateAgreementRequest, SaveDraftRequest,
)
from core.dependencies import require_permission
from services.extraction import (
    get_or_create_demo_org, create_outlet_from_extraction,
    create_agreement_record, generate_obligations, generate_alerts,
    get_val, get_num, get_date, get_section,
)
from services.sheets_service import write_agreement_to_sheet

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["agreements"])


@router.get("/test-sheets")
def test_sheets_write():
    """Debug endpoint to test Google Sheets integration."""
    import os
    import traceback

    has_spreadsheet_id = bool(os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID"))
    has_creds_json = bool(os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON"))
    creds_json_preview = (os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON") or "")[:50]

    # Try direct connection — bypass _get_sheet to get real error
    connection_error = None
    try:
        import json as _json
        import gspread
        from google.oauth2.service_account import Credentials

        creds_raw = os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON", "")
        spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID", "")
        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]
        creds_info = _json.loads(creds_raw)
        creds = Credentials.from_service_account_info(creds_info, scopes=scopes)
        client = gspread.authorize(creds)
        spreadsheet = client.open_by_key(spreadsheet_id)
        sheet = spreadsheet.sheet1
        connection_error = f"OK — connected to '{spreadsheet.title}', sheet '{sheet.title}'"
    except Exception:
        connection_error = traceback.format_exc()

    try:
        result = write_agreement_to_sheet(
            agreement_id="test-debug",
            outlet_name="Debug Test",
            city="Test City",
            state="Test State",
            landlord="Test",
            tenant="Test",
            brand="Test",
            property_type="Test",
            monthly_rent=1000,
            security_deposit=5000,
            cam_monthly=500,
            lease_start="2024-01-01",
            lease_end="2029-01-01",
            lock_in_months=12,
            escalation_pct=10,
            rent_model="fixed",
            area_sqft=500,
            rent_per_sqft=2,
            total_monthly_outflow=1500,
            risk_flags_count=0,
            status="test",
            document_filename="test.pdf",
        )
        return {
            "write_result": result,
            "has_spreadsheet_id": has_spreadsheet_id,
            "has_creds_json": has_creds_json,
            "creds_json_preview": creds_json_preview,
            "connection_error": connection_error,
        }
    except Exception as e:
        return {
            "write_result": False,
            "error": str(e),
            "traceback": traceback.format_exc(),
            "has_spreadsheet_id": has_spreadsheet_id,
            "has_creds_json": has_creds_json,
            "creds_json_preview": creds_json_preview,
            "connection_error": connection_error,
        }


@router.get("/agreements", dependencies=[Depends(require_permission("view_agreements"))])
def list_agreements(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    """List agreements with outlet info (paginated)."""
    offset = (page - 1) * page_size
    count_result = supabase.table("agreements").select("id", count="exact").execute()
    total = count_result.count or 0
    result = supabase.table("agreements").select(
        "*, outlets(name, city, address, property_type, status)"
    ).order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@router.get("/agreements/{agreement_id}", dependencies=[Depends(require_permission("view_agreements"))])
def get_agreement(agreement_id: str):
    """Get a single agreement with full details."""
    result = supabase.table("agreements").select("*, outlets(*)").eq("id", agreement_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    obligations = supabase.table("obligations").select("*").eq("agreement_id", agreement_id).execute()
    alerts = supabase.table("alerts").select("*").eq("agreement_id", agreement_id).order("trigger_date").execute()

    return {
        "agreement": result.data,
        "obligations": obligations.data,
        "alerts": alerts.data,
    }


@router.patch("/agreements/{agreement_id}", dependencies=[Depends(require_permission("edit_agreements"))])
def update_agreement(agreement_id: str, body: UpdateAgreementRequest):
    """Update extracted fields on an agreement (sparse dot-notation merge)."""
    current = supabase.table("agreements").select("extracted_data").eq("id", agreement_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    extracted = current.data.get("extracted_data") or {}

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

    shortcuts = {}
    shortcut_map = {
        "parties.lessor_name": "lessor_name",
        "parties.lessee_name": "lessee_name",
        "rent.monthly_rent": "monthly_rent",
        "charges.cam_monthly": "cam_monthly",
        "rent.revenue_share_pct": "revenue_share_pct",
        "lease_term.lease_start_date": "lease_start_date",
        "lease_term.lease_expiry_date": "lease_expiry_date",
        "lease_term.lock_in_period": "lock_in_period",
        "deposits.security_deposit": "security_deposit",
    }
    if body.field_updates:
        for dot_key, new_val in body.field_updates.items():
            if dot_key in shortcut_map:
                col = shortcut_map[dot_key]
                if col in ("monthly_rent", "cam_monthly", "security_deposit", "revenue_share_pct"):
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
            log_activity(org_id, None, "agreement", agreement_id, "fields_edited", {
                "fields": list(body.field_updates.keys()),
            })

    return {"agreement": result.data[0] if result.data else None}


@router.delete("/agreements/{agreement_id}", dependencies=[Depends(require_permission("manage_org_settings"))])
def delete_agreement(agreement_id: str):
    """Delete an agreement and all related data (admin only)."""
    # Get agreement for audit log
    agreement = supabase.table("agreements").select("org_id, lessor_name, filename, outlet_id").eq("id", agreement_id).single().execute()
    if not agreement.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    org_id = agreement.data["org_id"]

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
        auth_header = request.headers.get("authorization", "")
        if auth_header.startswith("Bearer "):
            try:
                from core.config import supabase as sb
                token = auth_header.split(" ", 1)[1]
                user_result = sb.auth.get_user(token)
                if user_result and user_result.user:
                    profile = sb.table("profiles").select("org_id").eq("id", user_result.user.id).single().execute()
                    if profile.data and profile.data.get("org_id"):
                        org_id = profile.data["org_id"]
            except Exception:
                pass
    if not org_id:
        org_id = get_or_create_demo_org()

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

    except Exception as rpc_err:
        if "confirm_and_activate_tx" in str(rpc_err):
            # Migration not run yet — fall back to sequential inserts
            logger.warning("confirm_and_activate_tx RPC not found, using sequential fallback")
            outlet_id = None
            agreement_id = None
            try:
                outlet_id = create_outlet_from_extraction(req.extraction, org_id)
                agreement_id = create_agreement_record(
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
                obligations = generate_obligations(req.extraction, agreement_id, outlet_id, org_id)
                alerts = generate_alerts(req.extraction, agreement_id, outlet_id, org_id)

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
                    from routes.critical_dates import populate_critical_dates_from_extraction
                    populate_critical_dates_from_extraction(
                        agreement_id, org_id, outlet_id, req.extraction,
                    )
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
                        supabase.table("obligations").delete().eq("agreement_id", agreement_id).execute()
                        supabase.table("alerts").delete().eq("agreement_id", agreement_id).execute()
                        supabase.table("agreements").delete().eq("id", agreement_id).execute()
                    if outlet_id:
                        other = supabase.table("agreements").select("id").eq("outlet_id", outlet_id).execute()
                        if not other.data:
                            supabase.table("outlets").delete().eq("id", outlet_id).execute()
                except Exception:
                    pass
                raise HTTPException(status_code=500, detail=str(e))
        else:
            raise HTTPException(status_code=500, detail=str(rpc_err))

    # Get uploader name for sheets
    uploader_name = None
    try:
        if 'user_result' in dir() and user_result and user_result.user:
            profile = supabase.table("profiles").select("full_name, email").eq("id", user_result.user.id).single().execute()
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
            # Try to get org_id from authenticated user
            auth_header = request.headers.get("authorization", "")
            if auth_header.startswith("Bearer "):
                try:
                    token = auth_header.split(" ", 1)[1]
                    user_result = supabase.auth.get_user(token)
                    if user_result and user_result.user:
                        profile = supabase.table("profiles").select("org_id").eq("id", user_result.user.id).single().execute()
                        if profile.data and profile.data.get("org_id"):
                            org_id = profile.data["org_id"]
                except Exception as e:
                    logger.warning(f"Failed to extract org_id from token: {e}")
        if not org_id:
            org_id = get_or_create_demo_org()
        extraction = body.extraction or {}

        # Create a minimal placeholder outlet for the draft (outlet_id is NOT NULL in agreements)
        from services.extraction import get_val, get_section
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
