"""
Reports data endpoints.
"""

from typing import Optional
from datetime import date

from fastapi import APIRouter, Depends

from core.config import supabase
from core.models import CurrentUser
from core.dependencies import get_current_user, get_org_filter, require_permission

router = APIRouter(prefix="/api", tags=["reports"])


@router.get("/reports", dependencies=[Depends(require_permission("view_reports"))])
def get_reports(user: Optional[CurrentUser] = Depends(get_current_user)):
    """Joined outlet report: outlets + agreements + payments for the report table."""
    org_id = get_org_filter(user)

    outlets_q = supabase.table("outlets").select("*")
    if org_id:
        outlets_q = outlets_q.eq("org_id", org_id)
    outlets_result = outlets_q.order("created_at", desc=True).limit(500).execute()

    agreements_q = supabase.table("agreements").select("id, org_id, outlet_id, type, status, lessor_name, lessee_name, brand_name, monthly_rent, cam_monthly, total_monthly_outflow, security_deposit, lease_commencement_date, lease_expiry_date, rent_model")
    if org_id:
        agreements_q = agreements_q.eq("org_id", org_id)
    agreements_result = agreements_q.limit(500).execute()

    payments_q = supabase.table("payment_records").select("outlet_id, due_amount, status").eq("status", "overdue")
    if org_id:
        payments_q = payments_q.eq("org_id", org_id)
    payments_result = payments_q.limit(1000).execute()

    overdue_by_outlet: dict = {}
    for p in payments_result.data:
        oid = p.get("outlet_id")
        overdue_by_outlet[oid] = overdue_by_outlet.get(oid, 0) + (p.get("due_amount") or 0)

    report = []
    for outlet in outlets_result.data:
        outlet_id = outlet["id"]
        outlet_agreements = [
            a for a in agreements_result.data
            if a.get("outlet_id") == outlet_id and a.get("type") == "lease_loi"
        ]
        primary = next(
            (a for a in outlet_agreements if a.get("status") in ("active", "expiring")),
            outlet_agreements[0] if outlet_agreements else None,
        )

        monthly_rent = (primary.get("monthly_rent") or 0) if primary else 0
        cam_monthly = (primary.get("cam_monthly") or 0) if primary else 0
        total_outflow = (primary.get("total_monthly_outflow") or 0) if primary else 0
        rent_per_sqft = (primary.get("rent_per_sqft") or 0) if primary else 0
        lease_expiry = (primary.get("lease_expiry_date") or "") if primary else ""
        risk_flags = (primary.get("risk_flags") or []) if primary else []

        revenue = outlet.get("monthly_net_revenue")
        rent_to_revenue = None
        if revenue and revenue > 0 and total_outflow > 0:
            rent_to_revenue = round((total_outflow / revenue) * 100, 1)

        days_to_expiry = None
        if lease_expiry:
            try:
                exp = date.fromisoformat(lease_expiry)
                days_to_expiry = (exp - date.today()).days
            except (ValueError, TypeError):
                pass

        report.append({
            "outlet_id": outlet_id,
            "outlet_name": outlet.get("name", ""),
            "brand": outlet.get("brand_name", ""),
            "city": outlet.get("city", ""),
            "state": outlet.get("state", ""),
            "property_type": outlet.get("property_type", ""),
            "franchise_model": outlet.get("franchise_model", ""),
            "outlet_status": outlet.get("status", ""),
            "super_area": outlet.get("super_area_sqft") or 0,
            "monthly_rent": monthly_rent,
            "rent_per_sqft": rent_per_sqft,
            "monthly_cam": cam_monthly,
            "total_outflow": total_outflow,
            "lease_expiry": lease_expiry,
            "days_to_expiry": days_to_expiry,
            "revenue": revenue,
            "rent_to_revenue": rent_to_revenue,
            "risk_flags_count": len(risk_flags),
            "overdue_amount": overdue_by_outlet.get(outlet_id, 0),
        })

    return {"report": report}
