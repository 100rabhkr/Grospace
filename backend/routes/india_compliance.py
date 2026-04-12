"""
India-specific compliance: stamp duty, registration, TDS, GST, lock-in, clauses.
"""

import uuid
import logging
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from core.config import supabase
from core.dependencies import require_permission
from services.extraction_fields import get_section, get_val

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["india-compliance"])

# ============================================
# STAMP DUTY RATES BY STATE
# ============================================

STAMP_DUTY_RATES = {
    "maharashtra": {"lease": 0.25, "license": 0.25, "max_cap": None, "notes": "0.25% of total rent + deposit for L&L"},
    "delhi": {"lease": 2.0, "license": 2.0, "max_cap": None, "notes": "2% of avg annual rent x term"},
    "karnataka": {"lease": 1.0, "license": 0.5, "max_cap": None, "notes": "1% of total consideration"},
    "tamil_nadu": {"lease": 1.0, "license": 1.0, "max_cap": None, "notes": "1% of total rent"},
    "telangana": {"lease": 0.4, "license": 0.4, "max_cap": None, "notes": "0.4% of total consideration"},
    "uttar_pradesh": {"lease": 2.0, "license": 2.0, "max_cap": None, "notes": "2% of annual rent x term"},
    "west_bengal": {"lease": 1.0, "license": 0.5, "max_cap": None, "notes": "1% of rent for lease"},
    "rajasthan": {"lease": 1.0, "license": 0.5, "max_cap": None, "notes": "1% of total rent for lease"},
    "gujarat": {"lease": 1.0, "license": 0.5, "max_cap": None, "notes": "1% of total rent"},
    "haryana": {"lease": 1.5, "license": 1.5, "max_cap": None, "notes": "1.5% of annual rent x term"},
}


@router.get("/stamp-duty/calculate")
def calculate_stamp_duty(
    state: str = Query(..., description="State name (lowercase)"),
    monthly_rent: float = Query(...),
    lease_term_years: float = Query(default=3),
    security_deposit: float = Query(default=0),
    doc_type: str = Query(default="lease"),
):
    """Calculate estimated stamp duty based on state-wise rates."""
    state_key = state.lower().replace(" ", "_")
    rates = STAMP_DUTY_RATES.get(state_key)

    if not rates:
        return {
            "state": state,
            "stamp_duty": None,
            "message": f"Stamp duty rates not available for {state}. Please check local Sub-Registrar office.",
            "available_states": list(STAMP_DUTY_RATES.keys()),
        }

    rate_key = "license" if doc_type == "license_certificate" else "lease"
    rate_pct = rates.get(rate_key, rates["lease"])

    total_rent = monthly_rent * 12 * lease_term_years
    total_consideration = total_rent + security_deposit
    stamp_duty = round(total_consideration * rate_pct / 100, 2)

    return {
        "state": state,
        "rate_pct": rate_pct,
        "total_consideration": total_consideration,
        "stamp_duty": stamp_duty,
        "registration_fee": round(stamp_duty * 0.1, 2),  # ~10% of stamp duty typically
        "notes": rates.get("notes", ""),
    }


# ============================================
# TDS TRACKING
# ============================================

@router.get(
    "/agreements/{agreement_id}/tds-summary",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def get_tds_summary(agreement_id: str):
    """Calculate TDS liability for an agreement."""
    agreement = (
        supabase.table("agreements")
        .select("monthly_rent, tds_applicable, tds_rate_pct, landlord_pan, lessor_name, lease_commencement_date, lease_expiry_date")
        .eq("id", agreement_id)
        .single()
        .execute()
    )
    if not agreement.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    agr = agreement.data
    monthly_rent = agr.get("monthly_rent") or 0
    annual_rent = monthly_rent * 12
    tds_rate = agr.get("tds_rate_pct") or 10

    # TDS applies if annual rent > 2.4 lakhs
    tds_applicable = annual_rent > 240000
    monthly_tds = round(monthly_rent * tds_rate / 100, 2) if tds_applicable else 0

    return {
        "agreement_id": agreement_id,
        "monthly_rent": monthly_rent,
        "annual_rent": annual_rent,
        "tds_applicable": tds_applicable,
        "tds_rate_pct": tds_rate,
        "monthly_tds": monthly_tds,
        "annual_tds": round(monthly_tds * 12, 2),
        "landlord_pan": agr.get("landlord_pan"),
        "lessor_name": agr.get("lessor_name"),
        "deposit_due_day": "7th of following month",
        "threshold": "Rs 2,40,000/year",
    }


# ============================================
# GST BREAKDOWN
# ============================================

@router.get(
    "/agreements/{agreement_id}/gst-breakdown",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def get_gst_breakdown(agreement_id: str):
    """Calculate GST breakdown for monthly rent outflow."""
    agreement = (
        supabase.table("agreements")
        .select("monthly_rent, cam_monthly, total_monthly_outflow, gst_applicable, gst_rate_pct, landlord_gstin, tenant_gstin")
        .eq("id", agreement_id)
        .single()
        .execute()
    )
    if not agreement.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    agr = agreement.data
    base = agr.get("monthly_rent") or 0
    cam = agr.get("cam_monthly") or 0
    gst_rate = agr.get("gst_rate_pct") or 18
    taxable = base + cam

    # Determine CGST+SGST or IGST based on state (simplified: assume intra-state)
    cgst = round(taxable * gst_rate / 200, 2)
    sgst = cgst
    total_gst = cgst + sgst
    total_with_gst = taxable + total_gst

    return {
        "agreement_id": agreement_id,
        "taxable_amount": taxable,
        "base_rent": base,
        "cam": cam,
        "gst_rate_pct": gst_rate,
        "cgst": cgst,
        "sgst": sgst,
        "igst": 0,
        "total_gst": total_gst,
        "total_with_gst": total_with_gst,
        "landlord_gstin": agr.get("landlord_gstin"),
        "tenant_gstin": agr.get("tenant_gstin"),
        "itc_eligible": True,
        "note": "GST @18% on commercial rent. CGST+SGST for intra-state, IGST for inter-state.",
    }


# ============================================
# LOCK-IN + SECURITY DEPOSIT
# ============================================

@router.get(
    "/agreements/{agreement_id}/lock-in-summary",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def get_lock_in_summary(agreement_id: str):
    """Get lock-in period status and early exit penalty estimate."""
    from datetime import date

    agreement = (
        supabase.table("agreements")
        .select("lock_in_end_date, lease_commencement_date, lease_expiry_date, monthly_rent, lock_in_penalty_months, security_deposit, security_deposit_months, security_deposit_interest_bearing, security_deposit_refund_days")
        .eq("id", agreement_id)
        .single()
        .execute()
    )
    if not agreement.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    agr = agreement.data
    today = date.today()
    lock_in_end = agr.get("lock_in_end_date")
    monthly_rent = agr.get("monthly_rent") or 0

    in_lock_in = False
    lock_in_days_remaining = None
    early_exit_penalty = None

    if lock_in_end:
        lock_in_date = date.fromisoformat(lock_in_end)
        in_lock_in = today < lock_in_date
        lock_in_days_remaining = (lock_in_date - today).days if in_lock_in else 0

        if in_lock_in:
            # Penalty = remaining months of lock-in rent
            remaining_months = lock_in_days_remaining / 30
            penalty_months = agr.get("lock_in_penalty_months") or remaining_months
            early_exit_penalty = round(monthly_rent * penalty_months, 2)

    return {
        "agreement_id": agreement_id,
        "in_lock_in": in_lock_in,
        "lock_in_end_date": lock_in_end,
        "lock_in_days_remaining": lock_in_days_remaining,
        "early_exit_penalty": early_exit_penalty,
        "security_deposit": agr.get("security_deposit"),
        "security_deposit_months": agr.get("security_deposit_months"),
        "security_deposit_interest_bearing": agr.get("security_deposit_interest_bearing"),
        "security_deposit_refund_days": agr.get("security_deposit_refund_days"),
    }


# ============================================
# CLAUSE EXTRACTION + CRUD
# ============================================

class ClauseCreate(BaseModel):
    category: str
    clause_text: str
    summary: Optional[str] = None
    page_number: Optional[int] = None
    source_quote: Optional[str] = None
    risk_level: str = "neutral"
    responsibility: Optional[str] = None


@router.get(
    "/agreements/{agreement_id}/clauses",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def list_clauses(agreement_id: str, category: Optional[str] = None):
    """List all extracted clauses for an agreement."""
    query = supabase.table("agreement_clauses").select("*").eq("agreement_id", agreement_id)
    if category:
        query = query.eq("category", category)
    result = query.order("category").execute()
    return {"clauses": result.data or [], "count": len(result.data or [])}


@router.post(
    "/agreements/{agreement_id}/clauses",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def add_clause(agreement_id: str, body: ClauseCreate):
    """Add a clause to an agreement."""
    agreement = supabase.table("agreements").select("org_id").eq("id", agreement_id).single().execute()
    if not agreement.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    entry = {
        "id": str(uuid.uuid4()),
        "agreement_id": agreement_id,
        "org_id": agreement.data["org_id"],
        **body.model_dump(exclude_none=True),
    }
    result = supabase.table("agreement_clauses").insert(entry).execute()
    return {"clause": result.data[0] if result.data else entry}


@router.delete(
    "/clauses/{clause_id}",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def delete_clause(clause_id: str):
    """Delete a clause."""
    result = supabase.table("agreement_clauses").delete().eq("id", clause_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Clause not found")
    return {"deleted": True}


@router.get(
    "/clauses/search",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def search_clauses(category: str, q: Optional[str] = None):
    """Search clauses across all agreements by category and optional text."""
    query = (
        supabase.table("agreement_clauses")
        .select("*, agreements(lessor_name, lessee_name, brand_name, outlets(name, city))")
        .eq("category", category)
    )
    if q:
        query = query.ilike("clause_text", f"%{q}%")
    result = query.order("created_at", desc=True).limit(50).execute()
    return {"clauses": result.data or [], "count": len(result.data or [])}


def populate_clauses_from_extraction(
    agreement_id: str,
    org_id: str,
    extraction: dict,
):
    """Auto-extract and store clause data from the extraction result."""
    legal = get_section(extraction, "legal")
    if not legal:
        return []

    clause_map = {
        "exclusive_use_rights": "exclusive_use",
        "subletting_clause": "subletting",
        "subletting_allowed": "subletting",
        "hvac_responsibility": "hvac_maintenance",
        "hvac_maintenance": "hvac_maintenance",
        "renewal_terms": "renewal_option",
        "termination_clause": "termination",
        "termination_rights": "termination",
        "signage_rights": "signage",
        "operating_hours": "operating_hours",
        "insurance_requirements": "insurance",
        "insurance_clause": "insurance",
        "force_majeure": "force_majeure",
        "indemnity_clause": "indemnity",
        "arbitration_clause": "arbitration",
        "tds_clause": "tds",
        "gst_clause": "gst",
        "stamp_duty_bearer": "stamp_duty",
        "registration_clause": "registration",
    }

    clauses = []
    for field_key, category in clause_map.items():
        val = get_val(legal.get(field_key))
        if val and isinstance(val, str) and val != "not_found" and len(val) > 5:
            # Check for source reference
            raw = legal.get(field_key)
            page = None
            quote = None
            if isinstance(raw, dict):
                page = raw.get("source_page")
                quote = raw.get("source_quote")

            # Determine responsibility from text
            responsibility = None
            val_lower = val.lower()
            if "landlord" in val_lower or "lessor" in val_lower or "licensor" in val_lower:
                responsibility = "landlord"
            elif "tenant" in val_lower or "lessee" in val_lower or "licensee" in val_lower:
                responsibility = "tenant"
            elif "shared" in val_lower or "jointly" in val_lower or "both" in val_lower:
                responsibility = "shared"

            clauses.append({
                "id": str(uuid.uuid4()),
                "agreement_id": agreement_id,
                "org_id": org_id,
                "category": category,
                "clause_text": val,
                "page_number": page,
                "source_quote": quote,
                "responsibility": responsibility,
            })

    if clauses:
        try:
            supabase.table("agreement_clauses").insert(clauses).execute()
            logger.info(f"Extracted {len(clauses)} clauses for agreement {agreement_id}")
        except Exception as e:
            logger.error(f"Failed to store clauses: {e}")

    return clauses
