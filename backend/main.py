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
from routes import auth, documents, outlets, agreements, payments, alerts, pipeline, admin, reports, contacts, leasebot, revenue, rent_schedules, critical_dates

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
        timeout = 180.0 if any(path.startswith(p) for p in _LONG_TIMEOUT_PATHS) else 30.0
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

    # Optional Supabase connectivity check
    db_status = "ok"
    try:
        from core.config import supabase as sb
        sb.table("outlets").select("id", count="exact").limit(1).execute()
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

# ============================================
# ENTRYPOINT
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
