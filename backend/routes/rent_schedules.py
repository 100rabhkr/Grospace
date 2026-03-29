"""
CRUD for structured rent schedule entries per agreement.
Auto-populates from extraction rent_schedule array on confirm-and-activate.
"""

import uuid
import logging
from datetime import date
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from core.config import supabase
from core.dependencies import require_permission

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["rent-schedules"])


class RentScheduleEntry(BaseModel):
    period_label: str
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    base_rent: float = 0
    rent_per_sqft: Optional[float] = None
    cam_monthly: float = 0
    hvac_monthly: float = 0
    insurance_monthly: float = 0
    taxes_monthly: float = 0
    gst_pct: float = 18
    revenue_share_pct: Optional[float] = None
    notes: Optional[str] = None


class RentScheduleUpdate(BaseModel):
    period_label: Optional[str] = None
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    base_rent: Optional[float] = None
    rent_per_sqft: Optional[float] = None
    cam_monthly: Optional[float] = None
    hvac_monthly: Optional[float] = None
    insurance_monthly: Optional[float] = None
    taxes_monthly: Optional[float] = None
    gst_pct: Optional[float] = None
    revenue_share_pct: Optional[float] = None
    notes: Optional[str] = None


@router.get(
    "/agreements/{agreement_id}/rent-schedule",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def list_rent_schedule(agreement_id: str):
    """List all rent schedule entries for an agreement, ordered by period_start."""
    result = (
        supabase.table("rent_schedules")
        .select("*")
        .eq("agreement_id", agreement_id)
        .order("period_start", desc=False)
        .execute()
    )

    # Mark current period
    today = date.today()
    entries = result.data or []
    for entry in entries:
        start = entry.get("period_start")
        end = entry.get("period_end")
        entry["is_current"] = bool(
            start and end and start <= today.isoformat() <= end
        )

    return {"rent_schedule": entries, "count": len(entries)}


@router.post(
    "/agreements/{agreement_id}/rent-schedule",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def add_rent_schedule_entry(agreement_id: str, body: RentScheduleEntry):
    """Add a new rent schedule entry to an agreement."""
    # Get org_id from agreement
    agreement = (
        supabase.table("agreements")
        .select("org_id")
        .eq("id", agreement_id)
        .single()
        .execute()
    )
    if not agreement.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    entry_data = {
        "id": str(uuid.uuid4()),
        "agreement_id": agreement_id,
        "org_id": agreement.data["org_id"],
        **body.model_dump(exclude_none=True),
    }

    result = supabase.table("rent_schedules").insert(entry_data).execute()
    return {"entry": result.data[0] if result.data else entry_data}


@router.patch(
    "/rent-schedule/{entry_id}",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def update_rent_schedule_entry(entry_id: str, body: RentScheduleUpdate):
    """Update a rent schedule entry."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = (
        supabase.table("rent_schedules")
        .update(updates)
        .eq("id", entry_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Rent schedule entry not found")
    return {"entry": result.data[0]}


@router.delete(
    "/rent-schedule/{entry_id}",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def delete_rent_schedule_entry(entry_id: str):
    """Delete a rent schedule entry."""
    result = (
        supabase.table("rent_schedules")
        .delete()
        .eq("id", entry_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Rent schedule entry not found")
    return {"deleted": True}


@router.post(
    "/agreements/{agreement_id}/rent-schedule/generate-escalation",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def generate_escalation_schedule(
    agreement_id: str,
    escalation_pct: float = 5.0,
    escalation_frequency_years: int = 1,
    num_years: int = 5,
):
    """
    Generate rent schedule entries with escalation applied.
    Takes the first existing entry as the base and projects forward.
    """
    # Get agreement details
    agreement = (
        supabase.table("agreements")
        .select("org_id, lease_commencement_date, lease_expiry_date, monthly_rent, cam_monthly")
        .eq("id", agreement_id)
        .single()
        .execute()
    )
    if not agreement.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    agr = agreement.data
    org_id = agr["org_id"]

    # Get existing schedule to use as base, or fall back to agreement fields
    existing = (
        supabase.table("rent_schedules")
        .select("*")
        .eq("agreement_id", agreement_id)
        .order("period_start", desc=False)
        .limit(1)
        .execute()
    )

    if existing.data:
        base_rent = existing.data[0].get("base_rent") or 0
        base_cam = existing.data[0].get("cam_monthly") or 0
        base_sqft = existing.data[0].get("rent_per_sqft")
    else:
        base_rent = agr.get("monthly_rent") or 0
        base_cam = agr.get("cam_monthly") or 0
        base_sqft = None

    commencement = agr.get("lease_commencement_date")
    if not commencement:
        raise HTTPException(status_code=400, detail="Lease commencement date required")

    # Delete existing schedule entries for this agreement
    supabase.table("rent_schedules").delete().eq("agreement_id", agreement_id).execute()

    # Generate escalated schedule
    from dateutil.relativedelta import relativedelta

    base_date = date.fromisoformat(commencement)
    entries = []
    current_rent = base_rent
    current_cam = base_cam
    current_sqft = base_sqft

    for year in range(num_years):
        # Apply escalation after the first frequency period
        if year > 0 and year % escalation_frequency_years == 0:
            current_rent = round(current_rent * (1 + escalation_pct / 100), 2)
            current_cam = round(current_cam * (1 + escalation_pct / 100), 2)
            if current_sqft:
                current_sqft = round(current_sqft * (1 + escalation_pct / 100), 2)

        period_start = (base_date + relativedelta(years=year)).isoformat()
        period_end = (base_date + relativedelta(years=year + 1, days=-1)).isoformat()

        # Clamp to expiry
        expiry = agr.get("lease_expiry_date")
        if expiry and period_end > expiry:
            period_end = expiry
        if expiry and period_start > expiry:
            break

        entries.append({
            "id": str(uuid.uuid4()),
            "agreement_id": agreement_id,
            "org_id": org_id,
            "period_label": f"Year {year + 1}",
            "period_start": period_start,
            "period_end": period_end,
            "base_rent": current_rent,
            "rent_per_sqft": current_sqft,
            "cam_monthly": current_cam,
            "gst_pct": 18,
        })

    if entries:
        supabase.table("rent_schedules").insert(entries).execute()

    return {
        "generated": len(entries),
        "escalation_pct": escalation_pct,
        "frequency_years": escalation_frequency_years,
        "entries": entries,
    }


def populate_rent_schedule_from_extraction(
    agreement_id: str,
    org_id: str,
    rent_schedule_data: list,
    lease_commencement: str | None = None,
    lease_expiry: str | None = None,
):
    """
    Auto-populate rent_schedules table from the extracted rent_schedule array.
    Called during confirm-and-activate.
    """
    if not rent_schedule_data or not isinstance(rent_schedule_data, list):
        return []

    entries = []
    for i, item in enumerate(rent_schedule_data):
        if not isinstance(item, dict):
            continue

        # Extract period label
        period = (
            item.get("year")
            or item.get("period")
            or item.get("years")
            or f"Year {i + 1}"
        )
        if isinstance(period, (int, float)):
            period = f"Year {int(period)}"

        # Extract values — handle both direct values and {value, confidence} objects
        def get_num_val(v):
            if isinstance(v, dict) and "value" in v:
                v = v["value"]
            if v is None or v == "" or v == "not_found":
                return None
            try:
                return float(str(v).replace(",", ""))
            except (ValueError, TypeError):
                return None

        base_rent = (
            get_num_val(item.get("mglr_monthly"))
            or get_num_val(item.get("monthly_rent"))
            or get_num_val(item.get("rent"))
            or get_num_val(item.get("amount"))
            or 0
        )

        rent_per_sqft = (
            get_num_val(item.get("mglr_per_sqft"))
            or get_num_val(item.get("rent_per_sqft"))
            or get_num_val(item.get("mglr_rate_per_sqft"))
            or get_num_val(item.get("per_sqft"))
        )

        rev_share = (
            get_num_val(item.get("revenue_share_net_sales_pct"))
            or get_num_val(item.get("revenue_share_takeaway_dining"))
            or get_num_val(item.get("revenue_share"))
        )

        cam = get_num_val(item.get("cam_monthly")) or 0

        # Estimate period dates if lease dates available
        period_start = None
        period_end = None
        if lease_commencement:
            try:
                from dateutil.relativedelta import relativedelta

                base_date = date.fromisoformat(lease_commencement)
                period_start = (base_date + relativedelta(years=i)).isoformat()
                period_end = (
                    base_date + relativedelta(years=i + 1, days=-1)
                ).isoformat()
                # Clamp end date to lease expiry
                if lease_expiry and period_end > lease_expiry:
                    period_end = lease_expiry
            except (ValueError, ImportError):
                pass

        entry = {
            "id": str(uuid.uuid4()),
            "agreement_id": agreement_id,
            "org_id": org_id,
            "period_label": str(period),
            "period_start": period_start,
            "period_end": period_end,
            "base_rent": base_rent,
            "rent_per_sqft": rent_per_sqft,
            "cam_monthly": cam,
            "gst_pct": 18,
            "revenue_share_pct": rev_share,
        }

        # Remove None values
        clean = {k: v for k, v in entry.items() if v is not None}
        entries.append(clean)

    if entries:
        try:
            supabase.table("rent_schedules").insert(entries).execute()
            logger.info(
                f"Populated {len(entries)} rent schedule entries for agreement {agreement_id}"
            )
        except Exception as e:
            logger.error(f"Failed to populate rent schedule: {e}")

    return entries
