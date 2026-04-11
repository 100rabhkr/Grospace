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


def _resolve_current_user_from_token(token: str) -> Optional[CurrentUser]:
    now = time.monotonic()
    cache_key = _get_cache_key(token)
    cached = _auth_cache.get(cache_key)
    if cached and cached[0] > now:
        return cached[1]

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
