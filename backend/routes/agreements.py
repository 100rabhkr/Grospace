"""
CRUD agreements, confirm-and-activate, save-draft endpoints.
"""


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

router = APIRouter(prefix="/api", tags=["agreements"])


@router.get("/agreements", dependencies=[Depends(require_permission("view_agreements"))])
async def list_agreements(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
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
async def get_agreement(agreement_id: str):
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
async def update_agreement(agreement_id: str, body: UpdateAgreementRequest):
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


@router.post("/confirm-and-activate", dependencies=[Depends(require_permission("create_agreements"))])
@limiter.limit("10/minute")
async def confirm_and_activate(request: Request, req: ConfirmActivateRequest):
    """
    Confirm extraction and create outlet + agreement + obligations + alerts.
    Uses manual rollback if any step fails.
    """
    outlet_id = None
    agreement_id = None
    try:
        org_id = req.org_id
        if not org_id:
            org_id = get_or_create_demo_org()

        outlet_id = create_outlet_from_extraction(req.extraction, org_id)

        agreement_id = create_agreement_record(
            extraction=req.extraction,
            doc_type=req.document_type,
            risk_flags=req.risk_flags,
            confidence=req.confidence,
            filename=req.filename,
            org_id=org_id,
            outlet_id=outlet_id,
            document_text=req.document_text,
            document_url=req.document_url,
        )

        obligations = generate_obligations(req.extraction, agreement_id, outlet_id, org_id)
        alerts = generate_alerts(req.extraction, agreement_id, outlet_id, org_id)

        supabase.table("activity_log").insert({
            "org_id": org_id,
            "entity_type": "agreement",
            "entity_id": agreement_id,
            "action": "confirm_and_activate",
            "details": {
                "outlet_id": outlet_id,
                "document_type": req.document_type,
                "filename": req.filename,
                "obligations_created": len(obligations),
                "alerts_created": len(alerts),
                "risk_flags_count": len(req.risk_flags),
            }
        }).execute()

        # Write to Google Sheets (non-blocking, won't fail the request)
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
            )
        except Exception as sheets_err:
            import logging
            logging.getLogger(__name__).error(f"Google Sheets write failed: {sheets_err}")

        return {
            "status": "activated",
            "agreement_id": agreement_id,
            "outlet_id": outlet_id,
            "obligations_created": len(obligations),
            "alerts_created": len(alerts),
            "message": f"Agreement activated. {len(obligations)} obligations and {len(alerts)} alerts created.",
        }

    except Exception as e:
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


@router.patch("/agreements/{agreement_id}/save-draft", dependencies=[Depends(require_permission("edit_agreements"))])
async def save_as_draft(agreement_id: str, body: SaveDraftRequest):
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
