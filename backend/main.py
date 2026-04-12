"""
GroSpace AI Backend Service
FastAPI service for document processing, AI extraction, Q&A, and risk analysis.
Deployed on Railway.
"""

import os
import asyncio
from datetime import datetime, timezone

try:
    import sentry_sdk
except ImportError:
    sentry_sdk = None  # type: ignore[assignment]
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from core.config import limiter
from routes import auth, documents, outlets, agreements, payments, alerts, pipeline, admin, reports, contacts, leasebot, revenue, rent_schedules, critical_dates, india_compliance, brands

# ============================================
# SENTRY MONITORING
# ============================================

_sentry_dsn = os.getenv("SENTRY_DSN", "")
if _sentry_dsn and sentry_sdk:
    sentry_sdk.init(
        dsn=_sentry_dsn,
        environment=os.getenv("RAILWAY_ENVIRONMENT", "development"),
        traces_sample_rate=0.1,
        send_default_pii=False,
        integrations=[],
    )

# ============================================
# APP SETUP
# ============================================

app = FastAPI(title="GroSpace AI Service", version="1.0.0")

# Endpoints that involve AI processing need longer timeouts
_LONG_TIMEOUT_PATHS = {
    "/api/upload-and-extract", "/api/extract", "/api/qa",
    "/api/risk-flags", "/api/classify", "/api/smart-chat",
    "/api/portfolio-qa", "/api/seed", "/api/cron",
    "/api/leasebot/analyze",
}

# Request timeout middleware — kills hung requests
class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        timeout = 600.0 if any(path.startswith(p) for p in _LONG_TIMEOUT_PATHS) else 30.0
        try:
            return await asyncio.wait_for(call_next(request), timeout=timeout)
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=504,
                content={"detail": "Request timed out. Please try again."},
            )

app.add_middleware(TimeoutMiddleware)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS - restrict to known production and development origins
_env_origins = os.getenv("ALLOWED_ORIGINS", "")
_frontend_url = os.getenv("FRONTEND_URL", "")
# DNS/Subdomain: Set CUSTOM_DOMAIN=https://app.yourdomain.com to allow custom domain access
# DNS Setup: 1) Add CNAME record pointing your subdomain to your Vercel/Railway deployment
#            2) Set CUSTOM_DOMAIN env var in Railway/Vercel to the full https URL
#            3) Update FRONTEND_URL if the custom domain replaces the default
_custom_domain = os.getenv("CUSTOM_DOMAIN", "")
_is_production = os.getenv("RAILWAY_ENVIRONMENT", "") == "production" or os.getenv("NODE_ENV", "") == "production"

_dev_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:3001",
    "http://127.0.0.1:3001",
]

_prod_origins = [
    "https://grospace-sandy.vercel.app",
]

ALLOWED_ORIGINS = list(set(filter(None, [
    *(_prod_origins),
    *([] if _is_production else _dev_origins),
    _frontend_url,
    *([_custom_domain] if _custom_domain.startswith("https://") else []),
    *(_env_origins.split(",") if _env_origins else []),
])))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Org-Id", "X-Request-ID"],
    max_age=600,
)

# ============================================
# HEALTH CHECK
# ============================================

@app.get("/api/health")
async def health_check():
    env = os.getenv("RAILWAY_ENVIRONMENT", "development")

    # Keep Railway health checks fast and predictable.
    # Opt into the DB probe only when explicitly enabled.
    db_status = "unchecked"
    should_check_db = os.getenv("HEALTHCHECK_INCLUDE_DB", "").lower() in {"1", "true", "yes"}
    if should_check_db:
        try:
            from core.config import supabase as sb
            await asyncio.wait_for(
                asyncio.to_thread(
                    lambda: sb.table("outlets").select("id", count="exact").limit(1).execute()
                ),
                timeout=3.0,
            )
            db_status = "ok"
        except asyncio.TimeoutError:
            db_status = "timeout"
        except Exception:
            db_status = "unreachable"

    return {
        "status": "healthy",
        "service": "grospace-ai",
        "version": "1.0.0",
        "environment": env,
        "timestamp": datetime.now(timezone.utc).isoformat(),
        "checks": {"database": db_status},
    }

# ============================================
# REGISTER ROUTERS
# ============================================

app.include_router(auth.router)
app.include_router(documents.router)
app.include_router(outlets.router)
app.include_router(agreements.router)
app.include_router(payments.router)
app.include_router(alerts.router)
app.include_router(pipeline.router)
app.include_router(admin.router)
app.include_router(reports.router)
app.include_router(contacts.router)
app.include_router(leasebot.router)
app.include_router(revenue.router)
app.include_router(rent_schedules.router)
app.include_router(critical_dates.router)
app.include_router(india_compliance.router)
app.include_router(brands.router)


# ============================================
# STARTUP: stale extraction-job sweeper
# ============================================
# Railway restarts kill in-flight asyncio tasks. Any job that was mid-
# extraction at the time of the restart stays in "processing" forever
# (heartbeat dies, no failed state). On startup we do a one-shot sweep:
# any job updated more than N minutes ago gets marked as failed so the
# user sees a clear error instead of a permanent spinner.
@app.on_event("startup")
async def _sweep_stale_extraction_jobs_on_startup():
    import logging
    _logger = logging.getLogger("startup-sweeper")
    try:
        from core.config import supabase
        stale_minutes = max(5, int(os.getenv("STALE_EXTRACTION_JOB_MINUTES", "10")))
        cutoff = datetime.now(timezone.utc).timestamp() - (stale_minutes * 60)
        # Grab everything still marked processing; decide in Python so we
        # don't depend on a specific Postgres timestamp dialect in PostgREST.
        rows = supabase.table("extraction_jobs").select(
            "id, updated_at, created_at"
        ).eq("status", "processing").execute()
        marked = 0
        for row in (rows.data or []):
            ts_str = row.get("updated_at") or row.get("created_at") or ""
            try:
                # Normalize ISO 8601 — supabase returns "2026-04-11T20:27:14.388675+00:00"
                ts = datetime.fromisoformat(ts_str.replace("Z", "+00:00")).timestamp()
            except Exception:
                continue
            if ts < cutoff:
                try:
                    supabase.table("extraction_jobs").update({
                        "status": "failed",
                        "error": "Processing took longer than expected. Please upload again.",
                        "updated_at": datetime.now(timezone.utc).isoformat(),
                    }).eq("id", row["id"]).execute()
                    marked += 1
                except Exception as sweep_e:
                    _logger.warning("stale sweep: failed to mark %s: %s", row.get("id"), sweep_e)
        if marked:
            _logger.warning("stale sweep: marked %d extraction jobs as failed on startup", marked)
    except Exception as e:
        _logger.warning("stale sweep: top-level failure: %s", e)


# ============================================
# STARTUP: Super Admin bootstrap
# ============================================
# Idempotent check that ensures admin@grospace.com exists in Supabase auth
# with the hardcoded password and role='platform_admin'. If Super Admin has
# changed their password via the reset flow, this does NOT overwrite it —
# we only set the password when the user is being created for the first time.
SUPER_ADMIN_EMAIL = os.getenv("SUPER_ADMIN_EMAIL", "admin@grospace.com")
SUPER_ADMIN_PASSWORD = os.getenv("SUPER_ADMIN_PASSWORD", "admin@grospace2026")


@app.on_event("startup")
async def _bootstrap_super_admin_account():
    """
    Ensure admin@grospace.com exists as a platform_admin with a known
    password. Handles four possible states idempotently:

      A. Profile exists + correct role           → no-op
      B. Profile exists + wrong role             → repin role, keep password
      C. Auth user exists but profile missing    → sync profile, reset password
      D. Neither auth user nor profile exist     → create both with hardcoded password

    All paths are non-blocking and log loudly on drift. This runs on every
    startup so you can rotate SUPER_ADMIN_PASSWORD via env var + restart.
    """
    import logging
    _logger = logging.getLogger("super-admin-bootstrap")
    try:
        from core.config import supabase

        # Step 1 — look up the profile
        existing_profile = None
        try:
            r = supabase.table("profiles").select(
                "id, email, role"
            ).eq("email", SUPER_ADMIN_EMAIL).limit(1).execute()
            if r.data:
                existing_profile = r.data[0]
        except Exception as e:
            _logger.warning("super-admin: profile lookup failed: %s", e)
            return

        # State A / B: profile exists
        if existing_profile:
            if existing_profile.get("role") != "platform_admin":
                try:
                    supabase.table("profiles").update({"role": "platform_admin"}).eq(
                        "id", existing_profile["id"]
                    ).execute()
                    _logger.warning("super-admin: repinned role -> platform_admin")
                except Exception as e:
                    _logger.warning("super-admin: repin failed: %s", e)
            _logger.info("super-admin: profile present, role OK")
            return

        # Step 2 — profile missing. See if an auth user already exists for this email.
        existing_auth_user_id: str | None = None
        try:
            listed = supabase.auth.admin.list_users()
            users_iter = listed if isinstance(listed, list) else (getattr(listed, "users", []) or [])
            for u in users_iter:
                ue = u.email if hasattr(u, "email") else u.get("email")
                if ue and ue.lower() == SUPER_ADMIN_EMAIL.lower():
                    existing_auth_user_id = u.id if hasattr(u, "id") else u.get("id")
                    break
        except Exception as e:
            _logger.warning("super-admin: list_users failed: %s", e)

        # State C: auth user exists, profile missing
        if existing_auth_user_id:
            # Reset password so Super Admin can always log in with the hardcoded value
            try:
                supabase.auth.admin.update_user_by_id(
                    existing_auth_user_id,
                    {"password": SUPER_ADMIN_PASSWORD},
                )
            except Exception as pw_e:
                _logger.warning("super-admin: password reset failed: %s", pw_e)
            try:
                supabase.table("profiles").insert({
                    "id": existing_auth_user_id,
                    "email": SUPER_ADMIN_EMAIL,
                    "full_name": "Super Admin",
                    "role": "platform_admin",
                }).execute()
                _logger.warning(
                    "super-admin: SYNCED profile for existing auth user %s",
                    SUPER_ADMIN_EMAIL,
                )
            except Exception as ins_e:
                _logger.warning("super-admin: profile insert failed: %s", ins_e)
            return

        # State D: create both
        try:
            created = supabase.auth.admin.create_user({
                "email": SUPER_ADMIN_EMAIL,
                "password": SUPER_ADMIN_PASSWORD,
                "email_confirm": True,
                "user_metadata": {
                    "full_name": "Super Admin",
                    "is_super_admin": True,
                },
            })
            new_user_id = None
            if hasattr(created, "user") and created.user:
                new_user_id = created.user.id
            elif isinstance(created, dict):
                new_user_id = (created.get("user") or {}).get("id")
            if not new_user_id:
                _logger.warning("super-admin: create_user returned no id")
                return
            supabase.table("profiles").insert({
                "id": new_user_id,
                "email": SUPER_ADMIN_EMAIL,
                "full_name": "Super Admin",
                "role": "platform_admin",
            }).execute()
            _logger.warning(
                "super-admin: BOOTSTRAPPED new account %s",
                SUPER_ADMIN_EMAIL,
            )
        except Exception as e:
            _logger.warning("super-admin: create failed: %s", e)
    except Exception as e:
        _logger.warning("super-admin bootstrap: top-level failure: %s", e)


# ============================================
# ENTRYPOINT
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
