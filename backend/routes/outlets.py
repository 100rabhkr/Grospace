"""
CRUD outlets endpoints.
"""

from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query

from core.config import supabase, log_activity
from core.models import CurrentUser, UpdateOutletRequest
from core.dependencies import get_current_user, require_permission

router = APIRouter(prefix="/api", tags=["outlets"])


@router.get("/outlets", dependencies=[Depends(require_permission("view_outlets"))])
async def list_outlets(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List outlets (paginated)."""
    offset = (page - 1) * page_size
    count_result = supabase.table("outlets").select("id", count="exact").execute()
    total = count_result.count or 0
    result = supabase.table("outlets").select(
        "*, agreements(id, type, status, monthly_rent, lease_expiry_date, risk_flags)"
    ).order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@router.get("/outlets/{outlet_id}", dependencies=[Depends(require_permission("view_outlets"))])
async def get_outlet(outlet_id: str):
    """Get a single outlet with agreements, obligations, alerts, and documents."""
    result = supabase.table("outlets").select("*").eq("id", outlet_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    agreements = supabase.table("agreements").select("*").eq("outlet_id", outlet_id).execute()
    obligations = supabase.table("obligations").select("*").eq("outlet_id", outlet_id).execute()
    alerts = supabase.table("alerts").select("*").eq("outlet_id", outlet_id).order("trigger_date").execute()
    documents = supabase.table("documents").select("*").eq("outlet_id", outlet_id).order("uploaded_at", desc=True).execute()

    return {
        "outlet": result.data,
        "agreements": agreements.data,
        "obligations": obligations.data,
        "alerts": alerts.data,
        "documents": documents.data if documents.data else [],
    }


@router.patch("/outlets/{outlet_id}", dependencies=[Depends(require_permission("edit_outlets"))])
async def update_outlet(outlet_id: str, req: UpdateOutletRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Update outlet fields (revenue, status)."""
    current = supabase.table("outlets").select("status, monthly_net_revenue, org_id").eq("id", outlet_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    update_data: dict = {}
    if req.monthly_net_revenue is not None:
        update_data["monthly_net_revenue"] = req.monthly_net_revenue
        update_data["revenue_updated_at"] = datetime.utcnow().isoformat()
    if req.status is not None:
        valid_statuses = {"pipeline", "fit_out", "operational", "up_for_renewal", "renewed", "closed"}
        if req.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        update_data["status"] = req.status
    if req.site_code is not None:
        update_data["site_code"] = req.site_code
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("outlets").update(update_data).eq("id", outlet_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    org_id = current.data.get("org_id")
    user_id = user.user_id if user else None
    if org_id:
        if req.status is not None and req.status != current.data.get("status"):
            log_activity(org_id, user_id, "outlet", outlet_id, "status_changed", {
                "old_status": current.data.get("status"),
                "new_status": req.status,
            })
        if req.monthly_net_revenue is not None:
            log_activity(org_id, user_id, "outlet", outlet_id, "revenue_updated", {
                "old_revenue": current.data.get("monthly_net_revenue"),
                "new_revenue": req.monthly_net_revenue,
            })

    return {"outlet": result.data[0]}
