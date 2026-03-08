"""
Authentication, login, profile endpoints.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends, Query

from core.config import supabase
from core.models import CurrentUser, UpdateProfileRequest, AlertPreferencesRequest
from core.dependencies import get_current_user, require_permission

router = APIRouter(prefix="/api", tags=["auth"])


@router.get("/profile")
async def get_profile(user: Optional[CurrentUser] = Depends(get_current_user)):
    """Get the current user's profile."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("profiles").select("*").eq("id", user.user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"profile": result.data}


@router.patch("/profile")
async def update_profile(req: UpdateProfileRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Update the current user's profile."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    update_data: dict = {}
    if req.full_name is not None:
        update_data["full_name"] = req.full_name
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("profiles").update(update_data).eq("id", user.user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"profile": result.data[0]}


@router.get("/alert-preferences/{org_id}", dependencies=[Depends(require_permission("manage_org_settings"))])
async def get_alert_preferences(org_id: str):
    """Get alert preferences for an organization."""
    result = supabase.table("organizations").select("alert_preferences").eq("id", org_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"preferences": result.data.get("alert_preferences") or {}}


@router.put("/alert-preferences/{org_id}", dependencies=[Depends(require_permission("manage_org_settings"))])
async def save_alert_preferences(org_id: str, req: AlertPreferencesRequest):
    """Save alert preferences for an organization."""
    result = supabase.table("organizations").update({"alert_preferences": req.preferences}).eq("id", org_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"preferences": req.preferences}
