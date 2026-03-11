"""
GroSpace AI Backend Service
FastAPI service for document processing, AI extraction, Q&A, and risk analysis.
Deployed on Railway.
"""

import os
import asyncio
from datetime import datetime

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from starlette.middleware.base import BaseHTTPMiddleware

from core.config import limiter

# Import all route modules
from routes import auth, documents, outlets, agreements, payments, alerts, pipeline, admin, reports, contacts

# ============================================
# APP SETUP
# ============================================

app = FastAPI(title="GroSpace AI Service", version="1.0.0")

# Request timeout middleware — kills any request that takes longer than 30s
class TimeoutMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        try:
            return await asyncio.wait_for(call_next(request), timeout=30.0)
        except asyncio.TimeoutError:
            return JSONResponse(
                status_code=504,
                content={"detail": "Request timed out. Please try again."},
            )

app.add_middleware(TimeoutMiddleware)

# Rate limiter
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS - allow Vercel deployment, localhost, and configured origins
_env_origins = os.getenv("ALLOWED_ORIGINS", "")
_frontend_url = os.getenv("FRONTEND_URL", "")
ALLOWED_ORIGINS = list(set(filter(None, [
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3002",
    "http://localhost:3003",
    "https://grospace-sandy.vercel.app",
    _frontend_url,
    *(_env_origins.split(",") if _env_origins else []),
])))

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ============================================
# HEALTH CHECK
# ============================================

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "grospace-ai", "timestamp": datetime.utcnow().isoformat()}

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

# ============================================
# ENTRYPOINT
# ============================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("backend.main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
