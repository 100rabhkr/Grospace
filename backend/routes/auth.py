"""
Authentication, login, profile endpoints.
"""

from typing import Optional
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from core.config import supabase
from core.models import CurrentUser, UpdateProfileRequest, AlertPreferencesRequest
from core.dependencies import get_current_user, require_permission

router = APIRouter(prefix="/api", tags=["auth"])


class PasswordResetRequest(BaseModel):
    new_password: str


@router.get("/profile")
def get_profile(user: Optional[CurrentUser] = Depends(get_current_user)):
    """Get the current user's profile."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("profiles").select("*").eq("id", user.user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"profile": result.data}


@router.post("/auth/reset-password")
def reset_own_password(
    req: PasswordResetRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """
    Change the currently-authenticated user's password. Used by:
      1. The force-reset-on-first-login flow (must_reset_password=True)
      2. The Settings → Account → Change Password button (any user, any role)

    Also clears the must_reset_password flag if it was set.
    """
    if not user or not user.user_id:
        raise HTTPException(status_code=401, detail="Not authenticated")

    new_pw = (req.new_password or "").strip()
    if len(new_pw) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")

    try:
        supabase.auth.admin.update_user_by_id(user.user_id, {"password": new_pw})
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Password update failed: {str(e)[:200]}")

    # Clear the must_reset_password flag if the profile column exists
    try:
        supabase.table("profiles").update({"must_reset_password": False}).eq("id", user.user_id).execute()
    except Exception:
        pass  # Column may not exist yet on older schemas

    return {"status": "ok", "message": "Password updated"}


@router.patch("/profile")
def update_profile(req: UpdateProfileRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
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
def get_alert_preferences(org_id: str):
    """Get alert preferences for an organization."""
    result = supabase.table("organizations").select("alert_preferences").eq("id", org_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"preferences": result.data.get("alert_preferences") or {}}


@router.put("/alert-preferences/{org_id}", dependencies=[Depends(require_permission("manage_org_settings"))])
def save_alert_preferences(org_id: str, req: AlertPreferencesRequest):
    """Save alert preferences for an organization."""
    result = supabase.table("organizations").update({"alert_preferences": req.preferences}).eq("id", org_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"preferences": req.preferences}
