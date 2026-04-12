"""
FastAPI dependencies: authentication, permissions, rate limiter.
"""

from __future__ import annotations

import hashlib
import os
import time
from typing import Optional
from fastapi import Header, HTTPException
from starlette.requests import Request

from core.config import supabase, ROLE_PERMISSIONS
from core.models import CurrentUser


_AUTH_CACHE_TTL_SECONDS = 30.0
_AUTH_CACHE_MAX_ITEMS = 512
_auth_cache: dict[str, tuple[float, Optional[CurrentUser]]] = {}
_REQUIRE_AUTH_IN_PRODUCTION = (
    os.getenv("REQUIRE_AUTH", "").lower() in {"1", "true", "yes"}
    or os.getenv("RAILWAY_ENVIRONMENT", "").lower() == "production"
    or os.getenv("NODE_ENV", "").lower() == "production"
)


def _get_cache_key(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def _prune_auth_cache(now: float) -> None:
    expired = [key for key, (expires_at, _) in _auth_cache.items() if expires_at <= now]
    for key in expired:
        _auth_cache.pop(key, None)

    while len(_auth_cache) > _AUTH_CACHE_MAX_ITEMS:
        oldest_key = min(_auth_cache.items(), key=lambda item: item[1][0])[0]
        _auth_cache.pop(oldest_key, None)


_VALID_DEMO_ROLES = {"platform_admin", "org_admin", "org_member", "finance_viewer"}


def _resolve_demo_user_from_token(token: str) -> Optional[CurrentUser]:
    """
    Parse a demo bearer token of the form:
        demo:<role>:<user_id>     full form
        demo:<role>               user_id defaults to 'demo-user'
    Returns a synthetic CurrentUser so demo sessions (cookie-based,
    no real Supabase JWT) can still authenticate against the backend.

    Platform admin demo users have org_id=None so get_org_filter()
    returns None and they see all orgs (matches the old demo behavior).
    """
    if not token.startswith("demo:"):
        return None
    parts = token.split(":", 2)
    if len(parts) < 2:
        return None
    role = parts[1] if parts[1] in _VALID_DEMO_ROLES else "platform_admin"
    user_id = parts[2] if len(parts) > 2 and parts[2] else "demo-user"
    return CurrentUser(
        user_id=user_id,
        email="demo@grospace.com",
        role=role,
        org_id=None,
    )


def _resolve_current_user_from_token(token: str) -> Optional[CurrentUser]:
    now = time.monotonic()
    cache_key = _get_cache_key(token)
    cached = _auth_cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

    # Demo-session shortcut — no network call, instant resolve
    demo_user = _resolve_demo_user_from_token(token)
    if demo_user is not None:
        _prune_auth_cache(now)
        _auth_cache[cache_key] = (now + _AUTH_CACHE_TTL_SECONDS, demo_user)
        return demo_user

    try:
        user_response = supabase.auth.get_user(token)
        user = user_response.user
        if not user:
            resolved = None
        else:
            profile = (
                supabase.table("profiles")
                .select("role, org_id")
                .eq("id", user.id)
                .single()
                .execute()
            )
            resolved = CurrentUser(
                user_id=user.id,
                email=user.email or "",
                role=profile.data.get("role", "org_member") if profile.data else "org_member",
                org_id=profile.data.get("org_id") if profile.data else None,
            )
    except Exception:
        resolved = None

    _prune_auth_cache(now)
    _auth_cache[cache_key] = (now + _AUTH_CACHE_TTL_SECONDS, resolved)
    return resolved


def get_current_user_sync(authorization: Optional[str] = None) -> Optional[CurrentUser]:
    """Synchronous auth resolver for direct calls inside sync route helpers."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.split(" ", 1)[1]
    return _resolve_current_user_from_token(token)


async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[CurrentUser]:
    """Extract and validate user from Supabase JWT. Returns None if unauthenticated."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.split(" ", 1)[1]
    return _resolve_current_user_from_token(token)


def get_org_filter(user: Optional[CurrentUser]) -> Optional[str]:
    """Get org_id filter. Platform admins see all, org users see their org only."""
    if not user:
        return None  # No auth — show all (backward compat for demo)
    if user.role == "platform_admin":
        return None  # Platform admins see everything
    return user.org_id


def get_db_user_id(user: Optional[CurrentUser]) -> Optional[str]:
    """
    Return `user.user_id` only if it is a real UUID that the database can
    accept for `uuid REFERENCES auth.users(id)` columns (deleted_by,
    created_by, uploaded_by, acknowledged_by, etc.).

    Demo sessions carry synthetic IDs like "srabhjot-singh" that would fail
    the UUID cast / FK. For those, return None — nullable DB columns will
    accept it cleanly and audit trail still gets the org_id + action.
    """
    if not user or not user.user_id:
        return None
    try:
        import uuid as _uuid
        _uuid.UUID(user.user_id)
        return user.user_id
    except (ValueError, AttributeError):
        return None


def check_role_permission(user_role: str, action: str) -> bool:
    """Check if a user role has permission for a given action."""
    perms = ROLE_PERMISSIONS.get(user_role, set())
    return "*" in perms or action in perms


def require_permission(action: str):
    """FastAPI dependency that checks role permission. Use with Depends()."""
    async def _check(request: Request, authorization: Optional[str] = Header(None)):
        user = await get_current_user(authorization)

        if not user:
            if _REQUIRE_AUTH_IN_PRODUCTION:
                raise HTTPException(status_code=401, detail="Not authenticated")
            return None

        if not check_role_permission(user.role, action):
            raise HTTPException(status_code=403, detail=f"Insufficient permissions. Required: {action}")
        return user
    return _check
