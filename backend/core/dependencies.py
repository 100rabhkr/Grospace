"""
FastAPI dependencies: authentication, permissions, rate limiter.
"""

import os
from typing import Optional
from fastapi import Header, HTTPException
from starlette.requests import Request

from core.config import supabase, ROLE_PERMISSIONS
from core.models import CurrentUser

# Demo mode: when DEMO_MODE=true, allow unauthenticated access (for demo/development only)
DEMO_MODE = os.getenv("DEMO_MODE", "true").lower() == "true"


def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[CurrentUser]:
    """Extract and validate user from Supabase JWT. Returns None if unauthenticated."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.split(" ", 1)[1]
    try:
        user_response = supabase.auth.get_user(token)
        user = user_response.user
        if not user:
            return None

        profile = supabase.table("profiles").select("role, org_id").eq("id", user.id).single().execute()
        return CurrentUser(
            user_id=user.id,
            email=user.email or "",
            role=profile.data.get("role", "org_member") if profile.data else "org_member",
            org_id=profile.data.get("org_id") if profile.data else None,
        )
    except Exception:
        return None


def get_org_filter(user: Optional[CurrentUser]) -> Optional[str]:
    """Get org_id filter. Platform admins see all, org users see their org only."""
    if not user:
        if DEMO_MODE:
            return None  # Demo mode: show all data for unauthenticated users
        raise HTTPException(status_code=401, detail="Authentication required")
    if user.role == "platform_admin":
        return None  # Platform admins see everything
    return user.org_id


def check_role_permission(user_role: str, action: str) -> bool:
    """Check if a user role has permission for a given action."""
    perms = ROLE_PERMISSIONS.get(user_role, set())
    return "*" in perms or action in perms


def require_permission(action: str):
    """FastAPI dependency that checks role permission. Use with Depends()."""
    def _check(request: Request, authorization: Optional[str] = Header(None)):
        # Extract user from auth token
        user = None
        if authorization and authorization.startswith("Bearer "):
            token = authorization.replace("Bearer ", "")
            try:
                user_result = supabase.auth.get_user(token)
                if user_result and user_result.user:
                    user_id = user_result.user.id
                    profile = supabase.table("profiles").select("role").eq("id", user_id).single().execute()
                    if profile.data:
                        user = {"id": user_id, "role": profile.data.get("role", "org_member")}
            except Exception:
                pass

        if not user:
            if DEMO_MODE:
                # Demo mode: allow unauthenticated access with org_member permissions
                return None
            raise HTTPException(status_code=401, detail="Authentication required")

        if not check_role_permission(user["role"], action):
            raise HTTPException(status_code=403, detail=f"Insufficient permissions. Required: {action}")
        return user
    return _check
