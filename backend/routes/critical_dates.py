"""
Critical date engine: auto-calculate and track all lease lifecycle deadlines.
Notice periods, lock-in ends, escalation triggers, renewal windows, etc.
"""

import uuid
import logging
from datetime import date, timedelta

from fastapi import APIRouter, HTTPException, Depends

from core.config import supabase
from core.dependencies import require_permission
from services.extraction import get_val, get_num, get_section

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["critical-dates"])


@router.get(
    "/agreements/{agreement_id}/critical-dates",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def list_critical_dates(agreement_id: str):
    """List all critical dates for an agreement with live days_remaining."""
    result = (
        supabase.table("critical_dates")
        .select("*")
        .eq("agreement_id", agreement_id)
        .order("date_value", desc=False)
        .execute()
    )
    today = date.today()
    entries = result.data or []
    for entry in entries:
        d = entry.get("date_value")
        if d:
            entry["days_remaining"] = (date.fromisoformat(d) - today).days
    return {"critical_dates": entries, "count": len(entries)}


@router.get(
    "/critical-dates/upcoming",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def list_upcoming_critical_dates(days: int = 90):
    """List all upcoming critical dates across the portfolio within N days."""
    today = date.today()
    cutoff = (today + timedelta(days=days)).isoformat()

    result = (
        supabase.table("critical_dates")
        .select("*, agreements(lessor_name, lessee_name, brand_name), outlets(name, city)")
        .eq("status", "upcoming")
        .gte("date_value", today.isoformat())
        .lte("date_value", cutoff)
        .order("date_value", desc=False)
        .execute()
    )

    entries = result.data or []
    for entry in entries:
        d = entry.get("date_value")
        if d:
            entry["days_remaining"] = (date.fromisoformat(d) - today).days
    return {"critical_dates": entries, "count": len(entries)}


@router.patch(
    "/critical-dates/{date_id}",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def update_critical_date_status(date_id: str, status: str = "acknowledged"):
    """Update status of a critical date (acknowledge, action, expire)."""
    valid = {"upcoming", "acknowledged", "actioned", "expired"}
    if status not in valid:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {valid}")

    result = (
        supabase.table("critical_dates")
        .update({"status": status, "updated_at": "now()"})
        .eq("id", date_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Critical date not found")
    return {"entry": result.data[0]}


def populate_critical_dates_from_extraction(
    agreement_id: str,
    org_id: str,
    outlet_id: str | None,
    extraction: dict,
):
    """
    Auto-generate critical dates from extracted lease data.
    Called during confirm-and-activate.
    """
    lease_term = get_section(extraction, "lease_term")
    rent = get_section(extraction, "rent")
    deposits = get_section(extraction, "deposits")

    if not lease_term:
        return []

    dates_to_create = []
    today = date.today()

    # 1. Lease expiry
    expiry = get_val(lease_term.get("lease_expiry_date"))
    if isinstance(expiry, str) and expiry != "not_found":
        try:
            exp_date = date.fromisoformat(expiry)
            dates_to_create.append({
                "date_type": "lease_expiry",
                "date_value": expiry,
                "label": "Lease expiry date",
            })

            # 2. Notice deadline (derive from notice_period_months)
            notice_months = get_num(lease_term.get("notice_period_months"))
            if notice_months and notice_months > 0:
                notice_date = exp_date - timedelta(days=int(notice_months * 30))
                dates_to_create.append({
                    "date_type": "notice_deadline",
                    "date_value": notice_date.isoformat(),
                    "label": f"Last day to give notice ({int(notice_months)} months before expiry)",
                })

            # 3. Security deposit refund (typically 30-90 days after expiry)
            refund_days = get_num(
                deposits.get("security_deposit_refund_days") if deposits else None
            )
            if refund_days and refund_days > 0:
                refund_date = exp_date + timedelta(days=int(refund_days))
                dates_to_create.append({
                    "date_type": "security_deposit_refund",
                    "date_value": refund_date.isoformat(),
                    "label": f"Security deposit refund due ({int(refund_days)} days after expiry)",
                })
        except (ValueError, TypeError):
            pass

    # 4. Lock-in end date
    lock_in_months = get_num(lease_term.get("lock_in_months"))
    commencement = get_val(lease_term.get("lease_commencement_date"))
    if lock_in_months and commencement and isinstance(commencement, str) and commencement != "not_found":
        try:
            from dateutil.relativedelta import relativedelta
            comm_date = date.fromisoformat(commencement)
            lock_in_end = comm_date + relativedelta(months=int(lock_in_months))
            dates_to_create.append({
                "date_type": "lock_in_end",
                "date_value": lock_in_end.isoformat(),
                "label": f"Lock-in period ends ({int(lock_in_months)} months from commencement)",
            })
        except (ValueError, ImportError):
            pass

    # 5. Rent commencement
    rent_comm = get_val(lease_term.get("rent_commencement_date"))
    if rent_comm and isinstance(rent_comm, str) and rent_comm != "not_found":
        try:
            date.fromisoformat(rent_comm)
            dates_to_create.append({
                "date_type": "rent_commencement",
                "date_value": rent_comm,
                "label": "Rent commencement date",
            })
        except ValueError:
            pass

    # 6. Fit-out end
    fit_out_days = get_num(lease_term.get("fit_out_period_days"))
    if fit_out_days and commencement and isinstance(commencement, str) and commencement != "not_found":
        try:
            comm_date = date.fromisoformat(commencement)
            fit_out_end = comm_date + timedelta(days=int(fit_out_days))
            dates_to_create.append({
                "date_type": "fit_out_end",
                "date_value": fit_out_end.isoformat(),
                "label": f"Fit-out period ends ({int(fit_out_days)} days from commencement)",
            })
        except ValueError:
            pass

    # 7. Escalation dates (annual/periodic)
    if rent and commencement and isinstance(commencement, str) and commencement != "not_found":
        esc_pct = get_num(rent.get("escalation_percentage"))
        esc_freq = get_num(rent.get("escalation_frequency_years")) or 1
        if esc_pct and esc_pct > 0:
            try:
                from dateutil.relativedelta import relativedelta
                comm_date = date.fromisoformat(commencement)
                for i in range(1, 10):  # Up to 10 escalation events
                    esc_date = comm_date + relativedelta(years=int(esc_freq * i))
                    if expiry and isinstance(expiry, str):
                        if esc_date > date.fromisoformat(expiry):
                            break
                    dates_to_create.append({
                        "date_type": "escalation_due",
                        "date_value": esc_date.isoformat(),
                        "label": f"Rent escalation {esc_pct}% (Year {int(esc_freq * i) + 1})",
                    })
            except (ValueError, ImportError):
                pass

    # Insert all dates
    if not dates_to_create:
        return []

    entries = []
    for d in dates_to_create:
        entry = {
            "id": str(uuid.uuid4()),
            "agreement_id": agreement_id,
            "org_id": org_id,
            "outlet_id": outlet_id,
            "status": "upcoming" if d["date_value"] >= today.isoformat() else "expired",
            **d,
        }
        entries.append(entry)

    try:
        supabase.table("critical_dates").insert(entries).execute()
        logger.info(f"Created {len(entries)} critical dates for agreement {agreement_id}")
    except Exception as e:
        logger.error(f"Failed to create critical dates: {e}")

    return entries
