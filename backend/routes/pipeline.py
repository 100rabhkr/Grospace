"""
Deal pipeline, showcase endpoints.
"""

import uuid
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query

from core.config import supabase, DEAL_STAGES, log_activity
from core.models import (
    CurrentUser, MovePipelineRequest, UpdatePipelineDealRequest,
    CreateShowcaseRequest, UpdateShowcaseRequest,
)
from core.dependencies import get_current_user, get_org_filter, require_permission

router = APIRouter(prefix="/api", tags=["pipeline"])


@router.get("/pipeline", dependencies=[Depends(require_permission("view_outlets"))])
def get_pipeline(user: Optional[CurrentUser] = Depends(get_current_user)):
    """Get all outlets grouped by deal_stage for the Kanban board."""
    org_id = get_org_filter(user)

    query = supabase.table("outlets").select(
        "id, name, city, status, deal_stage, deal_stage_entered_at, deal_notes, deal_priority, "
        "property_type, super_area_sqft, created_at, agreements(id, type, status, monthly_rent)"
    )
    if org_id:
        query = query.eq("org_id", org_id)
    result = query.order("deal_stage_entered_at", desc=False).execute()

    # Map legacy stage names to current ones
    legacy_map = {"loi_signed": "loi", "fit_out": "fitout"}

    stages: dict = {stage: [] for stage in DEAL_STAGES}
    for outlet in result.data:
        stage = outlet.get("deal_stage") or "lead"
        stage = legacy_map.get(stage, stage)
        if stage not in stages:
            stage = "lead"
        stages[stage].append(outlet)

    return {"stages": stages}


@router.patch("/pipeline/move", dependencies=[Depends(require_permission("edit_outlets"))])
def move_pipeline_card(req: MovePipelineRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Move an outlet to a new deal stage."""
    if req.new_stage not in DEAL_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {', '.join(DEAL_STAGES)}")

    current = supabase.table("outlets").select("deal_stage, org_id").eq("id", req.outlet_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    old_stage = current.data.get("deal_stage") or "lead"
    update_data: dict = {
        "deal_stage": req.new_stage,
        "deal_stage_entered_at": datetime.utcnow().isoformat(),
    }
    if req.deal_notes is not None:
        update_data["deal_notes"] = req.deal_notes

    result = supabase.table("outlets").update(update_data).eq("id", req.outlet_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    org_id = current.data.get("org_id")
    if org_id:
        log_activity(org_id, user.user_id if user else None, "outlet", req.outlet_id, "deal_stage_changed", {
            "old_stage": old_stage,
            "new_stage": req.new_stage,
        })

    return {"outlet": result.data[0]}


@router.patch("/pipeline/{outlet_id}", dependencies=[Depends(require_permission("edit_outlets"))])
def update_pipeline_deal(outlet_id: str, req: UpdatePipelineDealRequest):
    """Update deal priority or notes without changing stage."""
    update_data: dict = {}
    if req.deal_priority is not None:
        if req.deal_priority not in ("low", "medium", "high"):
            raise HTTPException(status_code=400, detail="Invalid priority. Must be low, medium, or high")
        update_data["deal_priority"] = req.deal_priority
    if req.deal_notes is not None:
        update_data["deal_notes"] = req.deal_notes
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("outlets").update(update_data).eq("id", outlet_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")
    return {"outlet": result.data[0]}


# ============================================
# SHOWCASE ENDPOINTS
# ============================================

@router.post("/showcase", dependencies=[Depends(require_permission("view_outlets"))])
def create_showcase(req: CreateShowcaseRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Create a shareable showcase token for an outlet."""
    outlet = supabase.table("outlets").select("org_id, name").eq("id", req.outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    insert_data: dict = {
        "id": str(uuid.uuid4()),
        "org_id": outlet.data["org_id"],
        "outlet_id": req.outlet_id,
        "include_financials": req.include_financials,
    }
    if req.title:
        insert_data["title"] = req.title
    else:
        insert_data["title"] = f"{outlet.data.get('name', 'Outlet')} Showcase"
    if req.description:
        insert_data["description"] = req.description
    if req.expires_at:
        insert_data["expires_at"] = req.expires_at
    if user:
        insert_data["created_by"] = user.user_id

    result = supabase.table("showcase_tokens").insert(insert_data).execute()
    return {"showcase": result.data[0] if result.data else None}


@router.get("/showcase", dependencies=[Depends(require_permission("view_outlets"))])
def list_showcases(
    outlet_id: Optional[str] = Query(None),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List showcase tokens for the org."""
    org_id = get_org_filter(user)
    query = supabase.table("showcase_tokens").select("*, outlets(name, city)")
    if org_id:
        query = query.eq("org_id", org_id)
    if outlet_id:
        query = query.eq("outlet_id", outlet_id)
    result = query.order("created_at", desc=True).execute()
    return {"showcases": result.data}


@router.patch("/showcase/{token_id}", dependencies=[Depends(require_permission("edit_outlets"))])
def update_showcase(token_id: str, req: UpdateShowcaseRequest):
    """Update a showcase token."""
    update_data: dict = {}
    if req.title is not None:
        update_data["title"] = req.title
    if req.description is not None:
        update_data["description"] = req.description
    if req.include_financials is not None:
        update_data["include_financials"] = req.include_financials
    if req.is_active is not None:
        update_data["is_active"] = req.is_active
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("showcase_tokens").update(update_data).eq("id", token_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Showcase token not found")
    return {"showcase": result.data[0]}


@router.get("/showcase/public/{token}")
def get_public_showcase(token: str):
    """Public endpoint -- no auth required. Returns outlet info for a valid showcase token."""
    result = supabase.table("showcase_tokens").select(
        "*, outlets(id, name, brand_name, address, city, state, property_type, floor, unit_number, "
        "super_area_sqft, covered_area_sqft, status, franchise_model)"
    ).eq("token", token).eq("is_active", True).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Showcase not found or inactive")

    showcase = result.data

    if showcase.get("expires_at"):
        from datetime import datetime as dt
        try:
            exp = dt.fromisoformat(showcase["expires_at"].replace("Z", "+00:00"))
            if exp < dt.now(exp.tzinfo):
                raise HTTPException(status_code=404, detail="This showcase link has expired")
        except (ValueError, TypeError):
            pass

    outlet = showcase.get("outlets") or {}
    outlet_id = showcase.get("outlet_id")

    agreements = supabase.table("agreements").select(
        "type, status, lease_commencement_date, lease_expiry_date, monthly_rent, cam_monthly, "
        "security_deposit, total_monthly_outflow"
    ).eq("outlet_id", outlet_id).eq("status", "active").execute()

    response: dict = {
        "title": showcase.get("title"),
        "description": showcase.get("description"),
        "outlet": outlet,
        "agreements": [],
    }

    if showcase.get("include_financials") and agreements.data:
        response["agreements"] = agreements.data
    elif agreements.data:
        response["agreements"] = [
            {k: v for k, v in a.items() if k not in ("monthly_rent", "cam_monthly", "security_deposit", "total_monthly_outflow")}
            for a in agreements.data
        ]

    return response
