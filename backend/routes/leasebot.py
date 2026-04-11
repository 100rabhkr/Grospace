"""
Leasebot: public-facing lease analysis tool.
No auth required for analyze/preview; auth required for full results and conversion.
"""

import os
import uuid
import logging
from functools import lru_cache
from typing import Optional

from fastapi import APIRouter, HTTPException, UploadFile, File, Header
from starlette.requests import Request

from core.config import supabase, limiter
from core.dependencies import get_current_user, get_db_user_id
from services.extraction_fields import get_num, get_or_create_demo_org, get_val

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/leasebot", tags=["leasebot"])


@lru_cache(maxsize=1)
def _extraction_service():
    from services import extraction as extraction_service

    return extraction_service


def _calculate_health_score(risk_flags: list) -> int:
    """
    Calculate a health score (0-100) from risk flags.
    Start at 100, subtract 15 per high-severity flag, 8 per medium,
    weighted by confidence.
    """
    score = 100
    for flag in risk_flags:
        severity = (flag.get("severity") or "medium").lower()
        confidence = float(flag.get("confidence", 1.0))
        if severity == "high":
            score -= int(15 * confidence)
        elif severity == "medium":
            score -= int(8 * confidence)
        else:
            score -= int(4 * confidence)
    return max(0, min(100, score))


def _build_preview(analysis: dict) -> dict:
    """Build a public preview from an analysis record."""
    extraction = analysis.get("extraction") or {}
    risk_flags = analysis.get("risk_flags") or []

    premises = extraction.get("premises") or {}
    rent = extraction.get("rent") or {}

    # Extract sample fields
    property_name = get_val(premises.get("property_name"))
    city = get_val(premises.get("city"))

    # Try to get monthly rent from rent_schedule
    rent_schedule = get_val(rent.get("rent_schedule"))
    monthly_rent = None
    if isinstance(rent_schedule, list) and len(rent_schedule) > 0:
        first_year = rent_schedule[0]
        if isinstance(first_year, dict):
            monthly_rent = get_num(first_year.get("mglr_monthly")) or get_num(first_year.get("monthly_rent"))
    if monthly_rent is None:
        monthly_rent = get_num(rent.get("monthly_rent"))

    return {
        "health_score": analysis.get("health_score"),
        "document_type": analysis.get("document_type"),
        "risk_count": len(risk_flags),
        "sample_fields": {
            "property": property_name if property_name != "not_found" else None,
            "city": city if city != "not_found" else None,
            "rent": monthly_rent,
        },
    }


@router.post("/analyze")
@limiter.limit("5/minute")
async def analyze(request: Request, file: UploadFile = File(...)):
    """
    Public endpoint: upload a PDF lease document for AI analysis.
    No authentication required. Rate-limited to 5/minute per IP.
    """
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB

    try:
        filename = file.filename or "unknown.pdf"
        file_bytes = await file.read()

        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(
                status_code=413,
                detail=f"File too large ({len(file_bytes) / (1024 * 1024):.1f}MB). Maximum is 50MB.",
            )

        if not file_bytes or len(file_bytes) == 0:
            raise HTTPException(status_code=400, detail="Uploaded file is empty.")

        # Process document through existing AI pipeline
        result = await _extraction_service().process_document(file_bytes, filename)

        extraction = result.get("extraction", {})
        risk_flags = result.get("risk_flags", [])
        document_type = result.get("document_type", "lease_loi")
        document_text = result.get("document_text")

        # Calculate health score
        health_score = _calculate_health_score(risk_flags)

        # Get client IP
        ip_address = request.client.host if request.client else None

        # Store in leasebot_analyses table
        analysis_id = str(uuid.uuid4())
        insert_data = {
            "id": analysis_id,
            "document_type": document_type,
            "extraction": extraction,
            "risk_flags": risk_flags,
            "health_score": health_score,
            "document_text": document_text,
            "ip_address": ip_address,
        }

        insert_result = supabase.table("leasebot_analyses").insert(insert_data).execute()
        token = insert_result.data[0]["token"] if insert_result.data else None

        if not token:
            raise HTTPException(status_code=500, detail="Failed to create analysis record.")

        # Build preview
        preview = _build_preview({
            "extraction": extraction,
            "risk_flags": risk_flags,
            "health_score": health_score,
            "document_type": document_type,
        })

        return {"token": token, "preview": preview}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Leasebot analyze error: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {str(e)}")


@router.get("/results/{token}")
async def get_results(
    token: str,
    authorization: Optional[str] = Header(None),
    full: Optional[str] = None,
    request: Request = None,
):
    """
    Get analysis results by token.
    - Unauthenticated: returns preview only (health_score, document_type, risk_count, 3 sample fields).
    - Authenticated or full=true: returns full extraction, risk_flags, all fields.
    """
    # Look up analysis
    result = supabase.table("leasebot_analyses").select("*").eq("token", token).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Analysis not found or expired.")

    analysis = result.data

    # Check authentication via JWT or demo session cookie
    user = await get_current_user(authorization)
    is_demo = False
    if not user and request:
        demo_cookie = request.cookies.get("grospace-demo-session")
        demo_secret = os.getenv("DEMO_SESSION_SECRET", "")
        is_demo = bool(demo_cookie and demo_secret and demo_cookie == demo_secret)

    if user or is_demo:
        # Authenticated or demo user: return full data
        return {
            "token": token,
            "health_score": analysis.get("health_score"),
            "document_type": analysis.get("document_type"),
            "extraction": analysis.get("extraction"),
            "risk_flags": analysis.get("risk_flags"),
            "created_at": analysis.get("created_at"),
            "converted": analysis.get("converted_at") is not None,
            "agreement_id": analysis.get("agreement_id"),
            "authenticated": True,
        }
    else:
        # Unauthenticated: return preview only
        preview = _build_preview(analysis)
        return {
            "token": token,
            "authenticated": False,
            **preview,
        }


@router.post("/convert/{token}")
async def convert(
    token: str,
    authorization: Optional[str] = Header(None),
):
    """
    Convert a leasebot analysis into a full outlet + agreement.
    Requires authentication.
    """
    user = await get_current_user(authorization)
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required to convert analysis.")

    # Look up analysis
    result = supabase.table("leasebot_analyses").select("*").eq("token", token).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Analysis not found or expired.")

    analysis = result.data

    if analysis.get("converted_at"):
        return {
            "agreement_id": analysis.get("agreement_id"),
            "outlet_id": None,
            "message": "This analysis has already been converted.",
        }

    extraction = analysis.get("extraction") or {}
    document_type = analysis.get("document_type") or "lease_loi"
    risk_flags = analysis.get("risk_flags") or []

    # Get or create org for the user
    org_id = user.org_id
    if not org_id:
        org_id = get_or_create_demo_org()

    # Create outlet + agreement (reuse confirm-and-activate pattern)
    outlet_id = None
    agreement_id = None

    try:
        extraction_service = _extraction_service()
        outlet_id = extraction_service.create_outlet_from_extraction(extraction, org_id)
        agreement_id = extraction_service.create_agreement_record(
            extraction=extraction,
            doc_type=document_type,
            risk_flags=risk_flags,
            confidence={},
            filename="leasebot-upload.pdf",
            org_id=org_id,
            outlet_id=outlet_id,
            document_text=analysis.get("document_text"),
            document_url=None,
        )

        # Generate obligations and alerts
        extraction_service.generate_obligations(extraction, agreement_id, outlet_id, org_id)
        extraction_service.generate_alerts(extraction, agreement_id, outlet_id, org_id)

        # Update leasebot_analyses record (user_id is uuid — drop for demo sessions)
        supabase.table("leasebot_analyses").update({
            "converted_at": "now()",
            "user_id": get_db_user_id(user),
            "agreement_id": agreement_id,
        }).eq("token", token).execute()

        return {
            "agreement_id": agreement_id,
            "outlet_id": outlet_id,
        }

    except Exception as e:
        # Rollback on failure
        try:
            if agreement_id:
                supabase.table("obligations").delete().eq("agreement_id", agreement_id).execute()
                supabase.table("alerts").delete().eq("agreement_id", agreement_id).execute()
                supabase.table("agreements").delete().eq("id", agreement_id).execute()
            if outlet_id:
                other = supabase.table("agreements").select("id").eq("outlet_id", outlet_id).execute()
                if not other.data:
                    supabase.table("outlets").delete().eq("id", outlet_id).execute()
        except Exception:
            pass
        logger.error(f"Leasebot convert error: {e}")
        raise HTTPException(status_code=500, detail=str(e))
