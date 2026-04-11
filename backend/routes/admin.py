"""
Admin endpoints, cron triggers, org management, seed data, dashboard, smart chat.
"""

import os
import json
import uuid
import asyncio
from functools import lru_cache
from typing import Optional
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta

from fastapi import APIRouter, HTTPException, Depends, Header, Query, Form, Response
from starlette.requests import Request

import logging

from core.config import (
    supabase,
    model,
    limiter,
    PORTFOLIO_QA_SCHEMA,
    CITY_ABBREVIATIONS,
    execute_supabase_query,
    log_activity,
)
from core.dependencies import get_current_user, get_current_user_sync, get_db_user_id, get_org_filter, require_permission
from core.models import (
    CurrentUser, UpdateOrganizationRequest, InviteMemberRequest,
    PortfolioQARequest, SmartChatRequest, FeedbackRequest,
    CreatePilotRequest,
)
from services.extraction_fields import get_num
from services.email_service import send_email_via_resend

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["admin"])


@lru_cache(maxsize=1)
def _extraction_service():
    from services import extraction as extraction_service

    return extraction_service


@lru_cache(maxsize=1)
def _genai_module():
    import google.generativeai as genai

    return genai


def _exclude_deleted(query):
    """Apply the deleted-at filter when the query builder supports it."""
    return query.is_("deleted_at", "null") if hasattr(query, "is_") else query


# ============================================
# USAGE LOGGING
# ============================================

@router.post("/admin/log-usage")
async def log_usage(request: Request, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Log usage event to activity_log table."""
    body = await request.json() if request else {}
    action = body.get("action", "unknown")
    metadata = body.get("metadata")

    try:
        org_id = user.org_id if user else None
        # activity_log.user_id is uuid — drop for demo sessions
        user_id = get_db_user_id(user)
        supabase.table("activity_log").insert({
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "user_id": user_id,
            "entity_type": "usage",
            "entity_id": None,
            "action": action,
            "details": metadata,
        }).execute()
    except Exception:
        pass

    return {"status": "ok"}


# ============================================
# SIGNUP REQUEST / APPROVAL ENDPOINTS
# ============================================

@router.get("/signup-requests", dependencies=[Depends(require_permission("manage_org_members"))])
def list_signup_requests(status: str = Query("pending")):
    """List signup requests filtered by status."""
    query = supabase.table("signup_requests").select("*").order("created_at", desc=True)
    if status != "all":
        query = query.eq("status", status)
    result = query.execute()
    return {"requests": result.data}


@router.post("/signup-requests/{request_id}/approve", dependencies=[Depends(require_permission("manage_org_members"))])
def approve_signup_request(
    request_id: str,
    org_id: str = Form(...),
    role: str = Form("org_member"),
    full_access: bool = Form(False),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Approve a signup request — assign user to org with role."""
    # Get the signup request
    req_result = supabase.table("signup_requests").select("*").eq("id", request_id).single().execute()
    if not req_result.data:
        raise HTTPException(status_code=404, detail="Signup request not found")

    signup = req_result.data
    if signup["status"] != "pending":
        raise HTTPException(status_code=400, detail="Request already processed")

    # Update user profile with org_id and role
    profile_update = {
        "org_id": org_id,
        "role": role,
    }
    if full_access:
        profile_update["full_access"] = True

    if signup.get("name"):
        profile_update["full_name"] = signup["name"]

    supabase.table("profiles").update(profile_update).eq("id", signup["user_id"]).execute()

    # Mark signup request as approved (reviewed_by is uuid type — demo
    # sessions with synthetic ids would fail the cast, so guard via helper)
    supabase.table("signup_requests").update({
        "status": "approved",
        "reviewed_at": datetime.utcnow().isoformat(),
        "reviewed_by": get_db_user_id(user),
    }).eq("id", request_id).execute()

    return {"ok": True, "user_id": signup["user_id"], "org_id": org_id, "role": role}


@router.post("/signup-requests/{request_id}/reject", dependencies=[Depends(require_permission("manage_org_members"))])
def reject_signup_request(
    request_id: str,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Reject a signup request."""
    supabase.table("signup_requests").update({
        "status": "rejected",
        "reviewed_at": datetime.utcnow().isoformat(),
        "reviewed_by": get_db_user_id(user),
    }).eq("id", request_id).execute()
    return {"ok": True}


# ============================================
# ORGANIZATION ENDPOINTS
# ============================================

@router.get("/organizations", dependencies=[Depends(require_permission("manage_org_settings"))])
def list_organizations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List all organizations (paginated)."""
    offset = (page - 1) * page_size

    def _build_count_query():
        query = supabase.table("organizations").select("id", count="exact")
        if user and user.role != "platform_admin" and user.org_id:
            query = query.eq("id", user.org_id)
        return query

    def _build_data_query():
        query = supabase.table("organizations").select(
            "id, name, logo_url, created_at, created_by, alert_preferences"
        ).order("created_at", desc=True)
        if user and user.role != "platform_admin" and user.org_id:
            query = query.eq("id", user.org_id)
        return query.range(offset, offset + page_size - 1)

    total = 0
    try:
        count_result = execute_supabase_query(_build_count_query)
        total = count_result.count or 0
    except Exception:
        total = 0

    result = execute_supabase_query(_build_data_query)
    if total == 0:
        total = len(result.data or [])
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@router.post("/organizations", dependencies=[Depends(require_permission("manage_org_settings"))])
def create_organization(name: str = Form(...)):
    """Create a new organization."""
    result = supabase.table("organizations").insert({"id": str(uuid.uuid4()), "name": name}).execute()
    if not result.data:
        raise HTTPException(status_code=500, detail="Failed to create organization")
    return {"organization": result.data[0]}


@router.post("/organizations/self-serve")
def self_serve_create_organization(
    name: str = Form(...),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """
    Self-serve org creation for a newly-approved user who isn't yet a
    member of any organization. Matches the locked flow:
        "Login / Signup → Create Organization → Add Brand(s) → Add Team & Roles → Dashboard"

    Guarded by two rules (enforced together):
      1. The caller must be authenticated.
      2. The caller must NOT already belong to an org.

    On success the caller is auto-promoted to `org_admin` of the new org
    so they can immediately invite members, add brands, and create outlets
    without begging an admin.
    """
    if not user or not user.user_id:
        raise HTTPException(status_code=401, detail="Authentication required")

    # Refuse the call if the user already belongs to an org — we never want
    # an existing org member to orphan themselves from their current org.
    if user.org_id:
        raise HTTPException(
            status_code=403,
            detail="You already belong to an organization. Ask an admin to create additional orgs.",
        )

    clean_name = (name or "").strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Organization name is required")

    org_id = str(uuid.uuid4())
    try:
        org_result = supabase.table("organizations").insert({
            "id": org_id,
            "name": clean_name,
            "created_by": get_db_user_id(user),
        }).execute()
        if not org_result.data:
            raise HTTPException(status_code=500, detail="Failed to create organization")

        # Only attempt the profile promotion if user_id is a real UUID —
        # demo sessions can't write to profiles.id (uuid PK).
        db_uid = get_db_user_id(user)
        if db_uid:
            try:
                supabase.table("profiles").update({
                    "org_id": org_id,
                    "role": "org_admin",
                }).eq("id", db_uid).execute()
            except Exception as e:
                logger.warning("self_serve_create_organization: profile promotion failed: %s", e)
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create organization: {str(e)[:200]}")

    log_activity(
        org_id, get_db_user_id(user),
        "organization", org_id, "org_created_self_serve",
        {"name": clean_name},
    )

    return {
        "organization": org_result.data[0],
        "role": "org_admin",
        "message": "Organization created. You're now its admin.",
    }


@router.get("/organizations/{org_id}", dependencies=[Depends(require_permission("manage_org_settings"))])
def get_organization(org_id: str):
    """Get a single organization with its outlets and agreements."""
    result = supabase.table("organizations").select("*").eq("id", org_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Organization not found")

    outlets = supabase.table("outlets").select("*").eq("org_id", org_id).order("created_at", desc=True).execute()
    agreements = supabase.table("agreements").select("id, type, status, document_filename, monthly_rent, lease_expiry_date, outlet_id, outlets(name, city)").eq("org_id", org_id).order("created_at", desc=True).execute()
    alerts = supabase.table("alerts").select("id, type, severity, title, trigger_date, status").eq("org_id", org_id).order("trigger_date").limit(10).execute()

    return {
        "organization": result.data,
        "outlets": outlets.data,
        "agreements": agreements.data,
        "alerts": alerts.data,
    }


@router.patch("/organizations/{org_id}", dependencies=[Depends(require_permission("manage_org_settings"))])
def update_organization(org_id: str, req: UpdateOrganizationRequest):
    """Update organization name/settings."""
    update_data: dict = {}
    if req.name is not None:
        update_data["name"] = req.name
    if req.logo_url is not None:
        update_data["logo_url"] = req.logo_url
    if req.alert_preferences is not None:
        update_data["alert_preferences"] = req.alert_preferences
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("organizations").update(update_data).eq("id", org_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"organization": result.data[0]}


@router.get("/organizations/{org_id}/members", dependencies=[Depends(require_permission("manage_org_members"))])
def list_org_members(
    org_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
):
    """List all profiles belonging to an organization (paginated)."""
    offset = (page - 1) * page_size
    count_result = supabase.table("profiles").select("id", count="exact").eq("org_id", org_id).execute()
    total = count_result.count or 0
    result = supabase.table("profiles").select("*").eq("org_id", org_id).range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@router.post("/organizations/{org_id}/invite", dependencies=[Depends(require_permission("manage_org_members"))])
def invite_org_member(org_id: str, req: InviteMemberRequest):
    """Invite a member -- uses Supabase Auth admin invite, then updates profile with org/role."""
    try:
        existing = supabase.table("profiles").select("id, org_id").eq("email", req.email).execute()
        if existing.data and len(existing.data) > 0:
            user_id = existing.data[0]["id"]
            supabase.table("profiles").update({
                "org_id": org_id,
                "role": req.role,
            }).eq("id", user_id).execute()
            member = {**existing.data[0], "org_id": org_id, "role": req.role, "email": req.email}
        else:
            try:
                invite_result = supabase.auth.admin.invite_user_by_email(req.email)
                user_id = invite_result.user.id if invite_result and invite_result.user else None
            except Exception:
                user_id = None

            if user_id:
                supabase.table("profiles").update({
                    "org_id": org_id,
                    "role": req.role,
                    "full_name": req.email.split("@")[0].title(),
                }).eq("id", user_id).execute()
                member = {"id": user_id, "email": req.email, "role": req.role, "org_id": org_id}
            else:
                raise HTTPException(status_code=500, detail="Failed to invite user via auth system")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    email_sent = False
    try:
        org_result = supabase.table("organizations").select("name").eq("id", org_id).single().execute()
        org_name = org_result.data.get("name", "GroSpace") if org_result.data else "GroSpace"

        invite_html = f"""
        <html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
        <div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px">
            <h2 style="margin:0">GroSpace</h2>
        </div>
        <h3>You've been invited to {org_name}</h3>
        <p>You've been invited to join <strong>{org_name}</strong> on GroSpace as a <strong>{req.role.replace('_', ' ').title()}</strong>.</p>
        <p>GroSpace is a smart lease management platform for managing outlets, agreements, payments, and alerts across your property portfolio.</p>
        <div style="margin:24px 0">
            <a href="{os.getenv('NEXT_PUBLIC_APP_URL', 'https://grospace.app')}/auth/login" style="background:#000;color:#fff;padding:10px 24px;text-decoration:none;border-radius:6px;font-weight:600">Accept Invitation</a>
        </div>
        <p style="color:#999;font-size:12px">If you didn't expect this invitation, you can safely ignore this email.</p>
        </body></html>
        """
        email_sent = send_email_via_resend(
            req.email,
            f"You've been invited to {org_name} on GroSpace",
            invite_html,
        )
    except Exception:
        pass

    return {"member": member, "email_sent": email_sent}


@router.delete("/organizations/{org_id}/members/{user_id}", dependencies=[Depends(require_permission("manage_org_members"))])
def remove_org_member(org_id: str, user_id: str):
    """Remove a member from the organization."""
    result = supabase.table("profiles").delete().eq("id", user_id).eq("org_id", org_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"deleted": True}


# ============================================
# DASHBOARD
# ============================================

@router.get("/dashboard", dependencies=[Depends(require_permission("view_reports"))])
async def dashboard_stats(
    response: Response,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Get dashboard statistics. Cached 30s on the client."""
    # Browser + CDN cache hint — dashboard tolerates 30s staleness
    response.headers["Cache-Control"] = "private, max-age=30, stale-while-revalidate=60"
    org_id = get_org_filter(user)

    outlets_query = _exclude_deleted(
        supabase.table("outlets").select(
            "id, name, status, city, property_type, franchise_model, monthly_net_revenue, deal_stage"
        )
    )
    # NOTE: do NOT select extracted_data here — it's a heavy JSONB blob
    # (100KB-2MB per row) and we only need scalars + risk_flags for counts.
    # License expiry metadata we compute separately with a tiny targeted query.
    agreements_query = supabase.table("agreements").select(
        "id, outlet_id, type, status, monthly_rent, cam_monthly, total_monthly_outflow, lease_expiry_date, risk_flags"
    )
    alerts_query = supabase.table("alerts").select("id, type, severity, status, trigger_date")
    payments_query = supabase.table("payment_records").select("id, status, due_amount")

    if org_id:
        outlets_query = outlets_query.eq("org_id", org_id)
        agreements_query = agreements_query.eq("org_id", org_id)
        alerts_query = alerts_query.eq("org_id", org_id)
        payments_query = payments_query.eq("org_id", org_id)

    # Run sync Supabase queries in threads to avoid blocking the event loop.
    outlets, agreements, alerts, payments = await asyncio.gather(
        asyncio.to_thread(outlets_query.execute),
        asyncio.to_thread(agreements_query.execute),
        asyncio.to_thread(alerts_query.execute),
        asyncio.to_thread(payments_query.execute),
    )

    # Filter agreements to only include those from non-deleted outlets
    active_outlet_ids = {o["id"] for o in outlets.data}
    agreements_data = [a for a in agreements.data if a.get("outlet_id") in active_outlet_ids]

    total_outlets = len(outlets.data)
    total_agreements = len(agreements_data)
    active_agreements = len([a for a in agreements_data if a.get("status") == "active"])
    total_monthly_rent = sum(a.get("monthly_rent") or 0 for a in agreements_data)
    total_monthly_outflow = sum(a.get("total_monthly_outflow") or 0 for a in agreements_data)
    total_risk_flags = sum(len(a.get("risk_flags") or []) for a in agreements_data)
    pending_alerts = len([a for a in alerts.data if a.get("status") == "pending"])

    overdue_payments = [p for p in (payments.data or []) if p.get("status") == "overdue"]
    overdue_amount = sum(p.get("due_amount") or 0 for p in overdue_payments)

    pipeline_stages = {}
    for o in outlets.data:
        stage = o.get("deal_stage") or "lead"
        pipeline_stages[stage] = pipeline_stages.get(stage, 0) + 1

    today = date.today()
    expiring = []
    for a in agreements_data:
        try:
            if a.get("lease_expiry_date"):
                days_left = (date.fromisoformat(a["lease_expiry_date"]) - today).days
                if 0 <= days_left <= 90:
                    expiring.append(a)
        except (ValueError, TypeError):
            pass

    # Expiring licenses: targeted lightweight query (no JSONB blob)
    expiring_licenses_30d = 0
    expiring_licenses_60d = 0
    expiring_licenses_90d = 0
    try:
        lic_query = supabase.table("agreements").select("id, valid_to") \
            .eq("type", "license_certificate") \
            .not_.is_("valid_to", "null")
        if org_id:
            lic_query = lic_query.eq("org_id", org_id)
        lic_rows = await asyncio.to_thread(lic_query.execute)
        for row in (lic_rows.data or []):
            valid_to = row.get("valid_to")
            if not valid_to:
                continue
            try:
                days_left = (date.fromisoformat(valid_to) - today).days
                if 0 <= days_left < 30:
                    expiring_licenses_30d += 1
                elif 30 <= days_left < 60:
                    expiring_licenses_60d += 1
                elif 60 <= days_left <= 90:
                    expiring_licenses_90d += 1
            except (ValueError, TypeError):
                pass
    except Exception:
        pass  # Non-critical — dashboard should still load

    cities = {}
    for o in outlets.data:
        city = o.get("city") or "Unknown"
        cities[city] = cities.get(city, 0) + 1

    statuses = {}
    for o in outlets.data:
        s = o.get("status") or "unknown"
        statuses[s] = statuses.get(s, 0) + 1

    property_types = {}
    for o in outlets.data:
        ptype = o.get("property_type") or "unknown"
        property_types[ptype] = property_types.get(ptype, 0) + 1

    rent_by_outlet = {}
    for a in agreements_data:
        oid = a.get("outlet_id")
        if oid:
            rent_by_outlet[oid] = a.get("monthly_rent") or 0

    outlet_details_by_city = {}
    for o in outlets.data:
        city = o.get("city") or "Unknown"
        if city not in outlet_details_by_city:
            outlet_details_by_city[city] = []
        outlet_details_by_city[city].append({
            "id": o.get("id", ""),
            "name": o.get("name", ""),
            "status": o.get("status", "unknown"),
            "rent": rent_by_outlet.get(o["id"], 0),
        })

    return {
        "total_outlets": total_outlets,
        "total_agreements": total_agreements,
        "active_agreements": active_agreements,
        "total_monthly_rent": total_monthly_rent,
        "total_monthly_outflow": total_monthly_outflow,
        "total_risk_flags": total_risk_flags,
        "pending_alerts": pending_alerts,
        "expiring_leases_90d": len(expiring),
        "expiring_licenses_30d": expiring_licenses_30d,
        "expiring_licenses_60d": expiring_licenses_60d,
        "expiring_licenses_90d": expiring_licenses_90d,
        "outlets_by_city": cities,
        "outlets_by_status": statuses,
        "outlet_details_by_city": outlet_details_by_city,
        "overdue_payments_count": len(overdue_payments),
        "overdue_amount": overdue_amount,
        "pipeline_stages": pipeline_stages,
        "outlets_by_property_type": property_types,
    }


# ============================================
# SEED DEMO DATA
# ============================================

@router.post("/seed", dependencies=[Depends(require_permission("manage_org_settings"))])
def seed_demo_data():
    """Seed 6 realistic demo outlets with agreements, obligations, and alerts."""
    try:
        org_id = _extraction_service().get_or_create_demo_org()

        outlets_data = [
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "name": "Ambience Mall", "brand_name": "Tan Coffee",
                "address": "Unit GF-127, Ground Floor, Ambience Mall, NH-8, Gurugram, Haryana 122002",
                "city": "Gurugram", "state": "Haryana", "pincode": "122002",
                "property_type": "mall", "floor": "Ground Floor", "unit_number": "GF-127",
                "super_area_sqft": 1850, "covered_area_sqft": 1550, "carpet_area_sqft": 1200,
                "franchise_model": "FOFO", "status": "operational",
                "deal_stage": "operational", "deal_priority": "medium",
            },
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "name": "Phoenix MarketCity", "brand_name": "Tan Coffee",
                "address": "Unit F-215, 2nd Floor, Phoenix MarketCity, LBS Marg, Kurla, Mumbai 400070",
                "city": "Mumbai", "state": "Maharashtra", "pincode": "400070",
                "property_type": "mall", "floor": "2nd Floor", "unit_number": "F-215",
                "super_area_sqft": 2200, "covered_area_sqft": 1850, "carpet_area_sqft": 1450,
                "franchise_model": "FOCO", "status": "operational",
                "deal_stage": "operational", "deal_priority": "low",
            },
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "name": "Indiranagar High Street", "brand_name": "Tan Coffee",
                "address": "No. 42, 12th Main, HAL 2nd Stage, Indiranagar, Bengaluru 560038",
                "city": "Bengaluru", "state": "Karnataka", "pincode": "560038",
                "property_type": "high_street", "floor": "Ground Floor", "unit_number": "42",
                "super_area_sqft": 1400, "covered_area_sqft": 1250, "carpet_area_sqft": 1050,
                "franchise_model": "FOFO", "status": "fit_out",
                "deal_stage": "fitout", "deal_priority": "high",
            },
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "name": "Select Citywalk", "brand_name": "Tan Coffee",
                "address": "Unit 2-14, 2nd Floor, Select Citywalk, Saket, New Delhi 110017",
                "city": "New Delhi", "state": "Delhi", "pincode": "110017",
                "property_type": "mall", "floor": "2nd Floor", "unit_number": "2-14",
                "super_area_sqft": 1650, "covered_area_sqft": 1380, "carpet_area_sqft": 1100,
                "franchise_model": "FOFO", "status": "up_for_renewal",
                "deal_stage": "agreement", "deal_priority": "high",
            },
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "name": "Palladium Chennai", "brand_name": "Tan Coffee",
                "address": "Unit GF-08, Ground Floor, Palladium Mall, Velachery, Chennai 600042",
                "city": "Chennai", "state": "Tamil Nadu", "pincode": "600042",
                "property_type": "mall", "floor": "Ground Floor", "unit_number": "GF-08",
                "super_area_sqft": 1300, "covered_area_sqft": 1100, "carpet_area_sqft": 900,
                "franchise_model": "COCO", "status": "operational",
                "deal_stage": "operational", "deal_priority": "medium",
            },
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "name": "DLF CyberHub", "brand_name": "Tan Coffee",
                "address": "Unit CH-305, 3rd Floor, DLF CyberHub, DLF Cyber City, Gurugram 122002",
                "city": "Gurugram", "state": "Haryana", "pincode": "122002",
                "property_type": "cyber_park", "floor": "3rd Floor", "unit_number": "CH-305",
                "super_area_sqft": 1000, "covered_area_sqft": 850, "carpet_area_sqft": 700,
                "franchise_model": "FOFO", "status": "pipeline",
                "deal_stage": "negotiation", "deal_priority": "high",
            },
        ]

        created_outlets = []
        for od in outlets_data:
            result = supabase.table("outlets").insert(od).execute()
            created_outlets.append(result.data[0])

        today = date.today()
        agreements_data = [
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "outlet_id": created_outlets[0]["id"],
                "type": "lease_loi", "status": "active",
                "document_filename": "ambience-mall-lease.pdf",
                "lessor_name": "Mr. Rajesh Kumar Sharma", "lessee_name": "Tan Coffee Pvt Ltd",
                "brand_name": "Tan Coffee", "rent_model": "fixed",
                "lease_commencement_date": "2025-02-01", "rent_commencement_date": "2025-03-18",
                "lease_expiry_date": "2034-01-31", "lock_in_end_date": "2028-02-01",
                "monthly_rent": 285000, "rent_per_sqft": 154, "cam_monthly": 59200,
                "total_monthly_outflow": 344200, "security_deposit": 1710000,
                "late_payment_interest_pct": 18,
                "extraction_status": "confirmed", "confirmed_at": datetime.utcnow().isoformat(),
                "risk_flags": [{"flag_id": 6, "severity": "high", "explanation": "Lessor can relocate lessee with 90 days notice"}],
                "extracted_data": {"parties": {"lessor_name": "Mr. Rajesh Kumar Sharma", "lessee_name": "Tan Coffee Pvt Ltd", "brand_name": "Tan Coffee"}, "premises": {"property_name": "Ambience Mall", "city": "Gurugram"}},
            },
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "outlet_id": created_outlets[1]["id"],
                "type": "lease_loi", "status": "active",
                "document_filename": "phoenix-mumbai-lease.pdf",
                "lessor_name": "Phoenix Mills Ltd", "lessee_name": "Tan Coffee Pvt Ltd",
                "brand_name": "Tan Coffee", "rent_model": "hybrid_mglr",
                "lease_commencement_date": "2024-06-01", "rent_commencement_date": "2024-07-15",
                "lease_expiry_date": "2030-05-31", "lock_in_end_date": "2027-06-01",
                "monthly_rent": 350000, "rent_per_sqft": 159, "cam_monthly": 72600,
                "total_monthly_outflow": 422600, "security_deposit": 2100000,
                "late_payment_interest_pct": 15,
                "extraction_status": "confirmed", "confirmed_at": datetime.utcnow().isoformat(),
                "risk_flags": [{"flag_id": 8, "severity": "medium", "explanation": "Revenue share with no maximum cap"}],
                "extracted_data": {"parties": {"lessor_name": "Phoenix Mills Ltd", "lessee_name": "Tan Coffee Pvt Ltd", "brand_name": "Tan Coffee"}, "premises": {"property_name": "Phoenix MarketCity", "city": "Mumbai"}},
            },
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "outlet_id": created_outlets[2]["id"],
                "type": "lease_loi", "status": "active",
                "document_filename": "indiranagar-lease.pdf",
                "lessor_name": "Mrs. Lakshmi Devi", "lessee_name": "Tan Coffee Pvt Ltd",
                "brand_name": "Tan Coffee", "rent_model": "fixed",
                "lease_commencement_date": "2025-12-01", "rent_commencement_date": "2026-01-15",
                "lease_expiry_date": "2031-11-30", "lock_in_end_date": "2028-12-01",
                "monthly_rent": 195000, "rent_per_sqft": 139, "cam_monthly": 0,
                "total_monthly_outflow": 195000, "security_deposit": 1170000,
                "late_payment_interest_pct": 18,
                "extraction_status": "confirmed", "confirmed_at": datetime.utcnow().isoformat(),
                "risk_flags": [],
                "extracted_data": {"parties": {"lessor_name": "Mrs. Lakshmi Devi", "lessee_name": "Tan Coffee Pvt Ltd", "brand_name": "Tan Coffee"}, "premises": {"property_name": "Indiranagar High Street", "city": "Bengaluru"}},
            },
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "outlet_id": created_outlets[3]["id"],
                "type": "lease_loi", "status": "expiring",
                "document_filename": "select-citywalk-lease.pdf",
                "lessor_name": "Select Infrastructure Pvt Ltd", "lessee_name": "Tan Coffee Pvt Ltd",
                "brand_name": "Tan Coffee", "rent_model": "fixed",
                "lease_commencement_date": "2022-04-01", "rent_commencement_date": "2022-05-15",
                "lease_expiry_date": (today + timedelta(days=75)).isoformat(),
                "lock_in_end_date": "2025-04-01",
                "monthly_rent": 310000, "rent_per_sqft": 188, "cam_monthly": 52800,
                "total_monthly_outflow": 362800, "security_deposit": 1860000,
                "late_payment_interest_pct": 18,
                "extraction_status": "confirmed", "confirmed_at": datetime.utcnow().isoformat(),
                "risk_flags": [{"flag_id": 1, "severity": "high", "explanation": "No lessor lock-in clause found"}, {"flag_id": 5, "severity": "medium", "explanation": "Late interest at 18% - borderline predatory"}],
                "extracted_data": {"parties": {"lessor_name": "Select Infrastructure Pvt Ltd", "lessee_name": "Tan Coffee Pvt Ltd", "brand_name": "Tan Coffee"}, "premises": {"property_name": "Select Citywalk", "city": "New Delhi"}},
            },
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "outlet_id": created_outlets[4]["id"],
                "type": "lease_loi", "status": "active",
                "document_filename": "palladium-chennai-lease.pdf",
                "lessor_name": "Forum Synergy Realty", "lessee_name": "Tan Coffee Pvt Ltd",
                "brand_name": "Tan Coffee", "rent_model": "revenue_share",
                "lease_commencement_date": "2024-11-01", "rent_commencement_date": "2024-12-15",
                "lease_expiry_date": "2030-10-31", "lock_in_end_date": "2027-11-01",
                "monthly_rent": 175000, "rent_per_sqft": 135, "cam_monthly": 41600,
                "total_monthly_outflow": 216600, "security_deposit": 1050000,
                "late_payment_interest_pct": 12,
                "extraction_status": "confirmed", "confirmed_at": datetime.utcnow().isoformat(),
                "risk_flags": [],
                "extracted_data": {"parties": {"lessor_name": "Forum Synergy Realty", "lessee_name": "Tan Coffee Pvt Ltd", "brand_name": "Tan Coffee"}, "premises": {"property_name": "Palladium Chennai", "city": "Chennai"}},
            },
            {
                "id": str(uuid.uuid4()), "org_id": org_id, "outlet_id": created_outlets[5]["id"],
                "type": "lease_loi", "status": "draft",
                "document_filename": "cyberhub-loi-draft.pdf",
                "lessor_name": "DLF Assets Ltd", "lessee_name": "Tan Coffee Pvt Ltd",
                "brand_name": "Tan Coffee", "rent_model": "fixed",
                "lease_commencement_date": None, "rent_commencement_date": None,
                "lease_expiry_date": None, "lock_in_end_date": None,
                "monthly_rent": 145000, "rent_per_sqft": 145, "cam_monthly": 35000,
                "total_monthly_outflow": 180000, "security_deposit": 870000,
                "late_payment_interest_pct": 15,
                "extraction_status": "review",
                "risk_flags": [{"flag_id": 2, "severity": "high", "explanation": "Escalation at 20% every 3 years - above market"}],
                "extracted_data": {"parties": {"lessor_name": "DLF Assets Ltd", "lessee_name": "Tan Coffee Pvt Ltd", "brand_name": "Tan Coffee"}, "premises": {"property_name": "DLF CyberHub", "city": "Gurugram"}},
            },
        ]

        created_agreements = []
        for ad in agreements_data:
            clean = {k: v for k, v in ad.items() if v is not None}
            result = supabase.table("agreements").insert(clean).execute()
            created_agreements.append(result.data[0])

        all_obligations = []
        obligation_configs = [
            (0, 0, [
                {"type": "rent", "frequency": "monthly", "amount": 285000, "due_day_of_month": 7, "start_date": "2025-03-18", "end_date": "2034-01-31", "escalation_pct": 15, "escalation_frequency_years": 3, "next_escalation_date": "2028-03-18"},
                {"type": "cam", "frequency": "monthly", "amount": 59200, "due_day_of_month": 7, "start_date": "2025-02-01", "end_date": "2034-01-31", "escalation_pct": 5},
                {"type": "hvac", "frequency": "monthly", "amount": 27900, "amount_formula": "Rs.18/sqft x 1550 sqft (covered)", "due_day_of_month": 7, "start_date": "2025-02-01", "end_date": "2034-01-31"},
                {"type": "security_deposit", "frequency": "one_time", "amount": 1710000, "start_date": "2025-02-01"},
                {"type": "cam_deposit", "frequency": "one_time", "amount": 118400, "start_date": "2025-02-01"},
            ]),
            (1, 1, [
                {"type": "rent", "frequency": "monthly", "amount": 350000, "due_day_of_month": 5, "start_date": "2024-07-15", "end_date": "2030-05-31", "escalation_pct": 12, "escalation_frequency_years": 3, "next_escalation_date": "2027-07-15"},
                {"type": "cam", "frequency": "monthly", "amount": 72600, "due_day_of_month": 5, "start_date": "2024-06-01", "end_date": "2030-05-31", "escalation_pct": 5},
                {"type": "security_deposit", "frequency": "one_time", "amount": 2100000, "start_date": "2024-06-01"},
            ]),
            (2, 2, [
                {"type": "rent", "frequency": "monthly", "amount": 195000, "due_day_of_month": 10, "start_date": "2026-01-15", "end_date": "2031-11-30", "escalation_pct": 10, "escalation_frequency_years": 3, "next_escalation_date": "2029-01-15"},
                {"type": "electricity", "frequency": "monthly", "amount": None, "amount_formula": "Actual metered (35 KW load)", "due_day_of_month": 10, "start_date": "2025-12-01", "end_date": "2031-11-30"},
                {"type": "security_deposit", "frequency": "one_time", "amount": 1170000, "start_date": "2025-12-01"},
            ]),
            (3, 3, [
                {"type": "rent", "frequency": "monthly", "amount": 310000, "due_day_of_month": 1, "start_date": "2022-05-15", "end_date": (today + timedelta(days=75)).isoformat(), "escalation_pct": 15, "escalation_frequency_years": 3},
                {"type": "cam", "frequency": "monthly", "amount": 52800, "due_day_of_month": 1, "start_date": "2022-04-01", "end_date": (today + timedelta(days=75)).isoformat(), "escalation_pct": 5},
                {"type": "security_deposit", "frequency": "one_time", "amount": 1860000, "start_date": "2022-04-01"},
            ]),
            (4, 4, [
                {"type": "rent", "frequency": "monthly", "amount": 175000, "due_day_of_month": 15, "start_date": "2024-12-15", "end_date": "2030-10-31", "escalation_pct": 10, "escalation_frequency_years": 3, "next_escalation_date": "2027-12-15"},
                {"type": "cam", "frequency": "monthly", "amount": 41600, "due_day_of_month": 15, "start_date": "2024-11-01", "end_date": "2030-10-31", "escalation_pct": 5},
                {"type": "security_deposit", "frequency": "one_time", "amount": 1050000, "start_date": "2024-11-01"},
                {"type": "utility_deposit", "frequency": "one_time", "amount": 600000, "amount_formula": "Rs.15000/KW x 40 KW", "start_date": "2024-11-01"},
            ]),
        ]

        for outlet_idx, agr_idx, obls in obligation_configs:
            for obl in obls:
                obl_data = {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "agreement_id": created_agreements[agr_idx]["id"],
                    "outlet_id": created_outlets[outlet_idx]["id"],
                    "is_active": True,
                    **obl,
                }
                clean = {k: v for k, v in obl_data.items() if v is not None}
                result = supabase.table("obligations").insert(clean).execute()
                all_obligations.append(result.data[0])

        all_alerts = []
        alert_configs = [
            {"outlet_idx": 3, "agr_idx": 3, "type": "lease_expiry", "severity": "high",
             "title": "Lease expiry in 75 days - Select Citywalk",
             "message": f"Select Citywalk lease expires on {(today + timedelta(days=75)).isoformat()}. Initiate renewal discussions.",
             "trigger_date": today.isoformat(), "lead_days": 75,
             "reference_date": (today + timedelta(days=75)).isoformat()},
            {"outlet_idx": 3, "agr_idx": 3, "type": "lease_expiry", "severity": "high",
             "title": "Lease expiry in 30 days - Select Citywalk",
             "message": f"Select Citywalk lease expires on {(today + timedelta(days=75)).isoformat()}. URGENT: Only 30 days remaining.",
             "trigger_date": (today + timedelta(days=45)).isoformat(), "lead_days": 30,
             "reference_date": (today + timedelta(days=75)).isoformat()},
            {"outlet_idx": 0, "agr_idx": 0, "type": "escalation", "severity": "medium",
             "title": "Rent escalation in 90 days - Ambience Mall",
             "message": "15% rent escalation due on 2028-03-18 for Ambience Mall. Current rent: Rs. 2,85,000.",
             "trigger_date": "2027-12-18", "lead_days": 90, "reference_date": "2028-03-18"},
            {"outlet_idx": 1, "agr_idx": 1, "type": "lock_in_expiry", "severity": "medium",
             "title": "Lock-in expires in 90 days - Phoenix MarketCity",
             "message": "Lock-in period ends on 2027-06-01. You may exit after this date with notice.",
             "trigger_date": "2027-03-03", "lead_days": 90, "reference_date": "2027-06-01"},
            {"outlet_idx": 0, "agr_idx": 0, "type": "rent_due", "severity": "medium",
             "title": f"Rent due on {date(today.year, today.month, 7).strftime('%d %b %Y')} - Ambience Mall",
             "message": "Monthly rent payment of Rs. 2,85,000 + CAM Rs. 59,200 due.",
             "trigger_date": (today + timedelta(days=3)).isoformat(), "lead_days": 7,
             "reference_date": (today + timedelta(days=10)).isoformat()},
            {"outlet_idx": 1, "agr_idx": 1, "type": "rent_due", "severity": "medium",
             "title": "Rent due - Phoenix MarketCity",
             "message": "Monthly rent payment of Rs. 3,50,000 + CAM Rs. 72,600 due.",
             "trigger_date": (today + timedelta(days=5)).isoformat(), "lead_days": 7,
             "reference_date": (today + timedelta(days=12)).isoformat()},
            {"outlet_idx": 4, "agr_idx": 4, "type": "rent_due", "severity": "medium",
             "title": "Rent due - Palladium Chennai",
             "message": "Monthly rent payment of Rs. 1,75,000 + CAM Rs. 41,600 due.",
             "trigger_date": (today + timedelta(days=8)).isoformat(), "lead_days": 7,
             "reference_date": (today + timedelta(days=15)).isoformat()},
            {"outlet_idx": 0, "agr_idx": 0, "type": "lease_expiry", "severity": "medium",
             "title": "Lease expiry in 180 days - Ambience Mall",
             "message": "Lease expires on 2034-01-31. 180 days remaining. Plan renewal strategy.",
             "trigger_date": "2033-08-04", "lead_days": 180, "reference_date": "2034-01-31"},
            {"outlet_idx": 2, "agr_idx": 2, "type": "fit_out_deadline", "severity": "high",
             "title": "Fit-out deadline approaching - Indiranagar",
             "message": "Fit-out period ends on 2026-01-15. Rent commencement starts after.",
             "trigger_date": "2026-01-08", "lead_days": 7, "reference_date": "2026-01-15"},
        ]

        for ac in alert_configs:
            outlet_idx = ac.pop("outlet_idx")
            agr_idx = ac.pop("agr_idx")
            alert_data = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "outlet_id": created_outlets[outlet_idx]["id"],
                "agreement_id": created_agreements[agr_idx]["id"],
                "status": "pending",
                **ac,
            }
            result = supabase.table("alerts").insert(alert_data).execute()
            all_alerts.append(result.data[0])

        supabase.table("activity_log").insert({
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "entity_type": "system",
            "action": "seed_demo_data",
            "details": {
                "outlet_ids": [o["id"] for o in created_outlets],
                "agreement_ids": [a["id"] for a in created_agreements],
                "obligation_ids": [o["id"] for o in all_obligations],
                "alert_ids": [a["id"] for a in all_alerts],
            }
        }).execute()

        return {
            "status": "seeded",
            "outlets_created": len(created_outlets),
            "agreements_created": len(created_agreements),
            "obligations_created": len(all_obligations),
            "alerts_created": len(all_alerts),
            "message": "Demo data seeded successfully! Check Dashboard, Outlets, Agreements, and Alerts pages.",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.delete("/seed", dependencies=[Depends(require_permission("manage_org_settings"))])
def remove_seed_data():
    """Remove only demo/seeded data by looking up IDs stored during seeding."""
    try:
        # Find all seed_demo_data activity log entries to get seeded IDs
        logs = supabase.table("activity_log").select("id,details").eq("action", "seed_demo_data").execute()
        if not logs.data:
            return {"status": "nothing", "message": "No demo data found to remove."}

        all_alert_ids = []
        all_obligation_ids = []
        all_agreement_ids = []
        all_outlet_ids = []
        log_ids = []

        for log in logs.data:
            details = log.get("details", {})
            all_alert_ids.extend(details.get("alert_ids", []))
            all_obligation_ids.extend(details.get("obligation_ids", []))
            all_agreement_ids.extend(details.get("agreement_ids", []))
            all_outlet_ids.extend(details.get("outlet_ids", []))
            log_ids.append(log["id"])

        # Delete in order: alerts → obligations → agreements → outlets (FK deps)
        counts = {}
        for table, ids in [("alerts", all_alert_ids), ("obligations", all_obligation_ids),
                           ("agreements", all_agreement_ids), ("outlets", all_outlet_ids)]:
            removed = 0
            for uid in ids:
                try:
                    supabase.table(table).delete().eq("id", uid).execute()
                    removed += 1
                except Exception:
                    pass
            counts[table] = removed

        # Clean up the seed log entries too
        for lid in log_ids:
            try:
                supabase.table("activity_log").delete().eq("id", lid).execute()
            except Exception:
                pass

        return {
            "status": "removed",
            "alerts_removed": counts["alerts"],
            "obligations_removed": counts["obligations"],
            "agreements_removed": counts["agreements"],
            "outlets_removed": counts["outlets"],
            "message": "Demo data removed successfully! Your real data is untouched.",
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# PILOT PROGRAM
# ============================================

CITY_LOCALITIES = {
    "Mumbai": ["Andheri West", "Bandra West", "Lower Parel", "Powai", "Worli", "Juhu", "Malad West", "Goregaon East"],
    "Delhi": ["Connaught Place", "Saket", "Vasant Kunj", "Nehru Place", "Rajouri Garden", "Lajpat Nagar", "Khan Market", "Hauz Khas"],
    "New Delhi": ["Connaught Place", "Saket", "Vasant Kunj", "Nehru Place", "Rajouri Garden", "Lajpat Nagar", "Khan Market", "Hauz Khas"],
    "Bengaluru": ["Indiranagar", "Koramangala", "Whitefield", "HSR Layout", "JP Nagar", "Jayanagar", "MG Road", "Marathahalli"],
    "Chennai": ["T. Nagar", "Anna Nagar", "Velachery", "Adyar", "Mylapore", "OMR", "Nungambakkam", "Guindy"],
    "Hyderabad": ["Banjara Hills", "Jubilee Hills", "Hitech City", "Gachibowli", "Madhapur", "Kukatpally", "Secunderabad", "Ameerpet"],
    "Pune": ["Koregaon Park", "Viman Nagar", "Hinjewadi", "Kothrud", "Aundh", "Baner", "Hadapsar", "Magarpatta"],
    "Kolkata": ["Park Street", "Salt Lake", "New Town", "Gariahat", "Ballygunge", "Esplanade", "Howrah", "Alipore"],
    "Gurugram": ["DLF Cyber City", "MG Road", "Sector 29", "Golf Course Road", "Sohna Road", "Udyog Vihar", "Sector 14", "Sector 44"],
    "Jaipur": ["MI Road", "C-Scheme", "Vaishali Nagar", "Malviya Nagar", "Tonk Road", "Raja Park", "Mansarovar", "Sitapura"],
}

CITY_RENT_RANGES = {
    "Mumbai": (150000, 200000),
    "Delhi": (150000, 200000),
    "New Delhi": (150000, 200000),
    "Bengaluru": (100000, 150000),
    "Chennai": (100000, 150000),
    "Hyderabad": (80000, 120000),
    "Pune": (80000, 120000),
    "Kolkata": (70000, 110000),
    "Gurugram": (120000, 180000),
}
CITY_RENT_DEFAULT = (50000, 100000)

CITY_STATE_MAP = {
    "Mumbai": "Maharashtra", "Delhi": "Delhi", "New Delhi": "Delhi",
    "Bengaluru": "Karnataka", "Chennai": "Tamil Nadu", "Hyderabad": "Telangana",
    "Pune": "Maharashtra", "Kolkata": "West Bengal", "Gurugram": "Haryana",
    "Jaipur": "Rajasthan", "Lucknow": "Uttar Pradesh", "Chandigarh": "Chandigarh",
    "Indore": "Madhya Pradesh", "Ahmedabad": "Gujarat", "Kochi": "Kerala",
}


@router.post("/admin/create-pilot")
def create_pilot(req: CreatePilotRequest):
    """
    Create a pilot/demo account for a client: org, auth users, outlets,
    agreements, obligations, payment records, and alerts.
    """
    import random

    try:
        # -------------------------------------------------------
        # 1. Create organization
        # -------------------------------------------------------
        org_result = supabase.table("organizations").insert({"id": str(uuid.uuid4()), "name": req.client_name}).execute()
        org = org_result.data[0]
        org_id = org["id"]

        # -------------------------------------------------------
        # 2. Create auth users via Supabase Admin API
        # -------------------------------------------------------
        admin_user = supabase.auth.admin.create_user({
            "email": req.admin_email,
            "password": req.admin_password,
            "email_confirm": True,
        })
        if not admin_user or not admin_user.user:
            raise HTTPException(status_code=500, detail="Failed to create admin user")
        admin_user_id = admin_user.user.id

        # Set profile for admin
        supabase.table("profiles").update({
            "org_id": org_id,
            "role": "org_admin",
            "full_name": req.admin_email.split("@")[0].replace(".", " ").title(),
        }).eq("id", admin_user_id).execute()

        ceo_user_id = None
        if req.ceo_email and req.ceo_password:
            ceo_user = supabase.auth.admin.create_user({
                "email": req.ceo_email,
                "password": req.ceo_password,
                "email_confirm": True,
            })
            if not ceo_user or not ceo_user.user:
                raise HTTPException(status_code=500, detail="Failed to create CEO user")
            ceo_user_id = ceo_user.user.id

            supabase.table("profiles").update({
                "org_id": org_id,
                "role": "org_admin",
                "full_name": req.ceo_email.split("@")[0].replace(".", " ").title(),
            }).eq("id", ceo_user_id).execute()

        # -------------------------------------------------------
        # 3. Create sample outlets distributed across cities
        # -------------------------------------------------------
        brand_abbr = "".join(w[0].upper() for w in req.brand_name.split()[:3]) or "XX"
        today = date.today()

        # Distribute outlets across cities
        cities = req.cities
        num_outlets = req.num_outlets
        per_city = num_outlets // len(cities)
        remainder = num_outlets % len(cities)

        city_counts = []
        for i, city in enumerate(cities):
            count = per_city + (1 if i < remainder else 0)
            city_counts.append((city, count))

        created_outlets = []
        outlet_idx = 0
        property_types = ["mall", "high_street", "mall", "cyber_park", "mall", "high_street"]

        for city, count in city_counts:
            city_abbr = CITY_ABBREVIATIONS.get(city.lower(), city[:3].upper())
            localities = CITY_LOCALITIES.get(city, ["Sector 1", "Main Road", "Central Market", "Ring Road"])
            state = CITY_STATE_MAP.get(city, "")
            rent_low, rent_high = CITY_RENT_RANGES.get(city, CITY_RENT_DEFAULT)

            for j in range(count):
                outlet_idx += 1
                site_code = f"{brand_abbr}-{city_abbr}-{outlet_idx:03d}"
                locality = localities[j % len(localities)]
                prop_type = property_types[outlet_idx % len(property_types)]

                # First 2 outlets operational, rest fit_out
                if outlet_idx <= 2:
                    status = "operational"
                    deal_stage = "operational"
                else:
                    status = "fit_out"
                    deal_stage = "fitout"

                monthly_rent = random.randint(rent_low // 1000, rent_high // 1000) * 1000
                area = random.randint(800, 2000)

                outlet_data = {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "name": f"{locality} Outlet",
                    "brand_name": req.brand_name,
                    "site_code": site_code,
                    "address": f"{locality}, {city}",
                    "city": city,
                    "state": state,
                    "property_type": prop_type,
                    "carpet_area_sqft": area,
                    "franchise_model": "FOFO",
                    "status": status,
                    "deal_stage": deal_stage,
                    "deal_priority": "medium",
                }

                result = supabase.table("outlets").insert(outlet_data).execute()
                created_outlets.append({**result.data[0], "_monthly_rent": monthly_rent})

        # -------------------------------------------------------
        # 4. Create agreements (lease + license_certificate) per outlet
        # -------------------------------------------------------
        commencement = (today - relativedelta(months=6)).isoformat()
        expiry = (today + relativedelta(months=30)).isoformat()

        created_agreements = []
        for out in created_outlets:
            monthly_rent = out["_monthly_rent"]
            cam = int(monthly_rent * 0.15)

            # Lease agreement
            lease_data = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "outlet_id": out["id"],
                "type": "lease_loi",
                "status": "active",
                "lessor_name": f"Landlord - {out['city']}",
                "lessee_name": req.client_name,
                "brand_name": req.brand_name,
                "rent_model": "fixed",
                "lease_commencement_date": commencement,
                "rent_commencement_date": commencement,
                "lease_expiry_date": expiry,
                "lock_in_end_date": (today + relativedelta(months=12)).isoformat(),
                "monthly_rent": monthly_rent,
                "cam_monthly": cam,
                "total_monthly_outflow": monthly_rent + cam,
                "security_deposit": monthly_rent * 3,
                "extraction_status": "confirmed",
                "confirmed_at": datetime.utcnow().isoformat(),
                "risk_flags": [],
            }
            lease_result = supabase.table("agreements").insert(lease_data).execute()
            created_agreements.append(lease_result.data[0])

            # License certificate
            license_data = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "outlet_id": out["id"],
                "type": "license_certificate",
                "status": "active",
                "lessor_name": f"Licensing Authority - {out['city']}",
                "lessee_name": req.client_name,
                "brand_name": req.brand_name,
                "extraction_status": "confirmed",
                "confirmed_at": datetime.utcnow().isoformat(),
            }
            license_result = supabase.table("agreements").insert(license_data).execute()
            created_agreements.append(license_result.data[0])

        # -------------------------------------------------------
        # 5. Create obligations for each lease agreement
        # -------------------------------------------------------
        all_obligations = []
        for i, out in enumerate(created_outlets):
            lease_agr = created_agreements[i * 2]  # Even indices are leases
            monthly_rent = out["_monthly_rent"]
            cam = int(monthly_rent * 0.15)
            security = monthly_rent * 3

            obligation_configs = [
                {
                    "type": "rent", "frequency": "monthly", "amount": monthly_rent,
                    "due_day_of_month": 1, "start_date": commencement,
                    "end_date": expiry, "escalation_pct": 10,
                    "escalation_frequency_years": 3,
                },
                {
                    "type": "cam", "frequency": "monthly", "amount": cam,
                    "due_day_of_month": 1, "start_date": commencement,
                    "end_date": expiry,
                },
                {
                    "type": "security_deposit", "frequency": "one_time",
                    "amount": security, "start_date": commencement,
                },
            ]

            for obl in obligation_configs:
                obl_data = {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "agreement_id": lease_agr["id"],
                    "outlet_id": out["id"],
                    "is_active": True,
                    **obl,
                }
                result = supabase.table("obligations").insert(obl_data).execute()
                all_obligations.append(result.data[0])

        # -------------------------------------------------------
        # 6. Create 3 months of payment records per outlet
        # -------------------------------------------------------
        all_payments = []
        last_month = today - relativedelta(months=1)
        this_month = today.replace(day=1)
        next_month = today + relativedelta(months=1)

        for i, out in enumerate(created_outlets):
            lease_agr = created_agreements[i * 2]
            monthly_rent = out["_monthly_rent"]
            cam = int(monthly_rent * 0.15)
            total_due = monthly_rent + cam

            payment_months = [
                (last_month.year, last_month.month, "paid", last_month.replace(day=5)),
                (this_month.year, this_month.month, "upcoming", None),
                (next_month.year, next_month.month, "upcoming", None),
            ]

            for year, month, status, paid_at in payment_months:
                due_date = date(year, month, 1)
                pay_data = {
                    "id": str(uuid.uuid4()),
                    "org_id": org_id,
                    "outlet_id": out["id"],
                    "agreement_id": lease_agr["id"],
                    "period_year": year,
                    "period_month": month,
                    "due_amount": total_due,
                    "due_date": due_date.isoformat(),
                    "status": status,
                }
                if status == "paid":
                    pay_data["paid_amount"] = total_due
                    pay_data["paid_at"] = paid_at.isoformat() if paid_at else None

                result = supabase.table("payment_records").insert(pay_data).execute()
                all_payments.append(result.data[0])

        # -------------------------------------------------------
        # 7. Create lease_expiry alerts (60-day and 30-day)
        # -------------------------------------------------------
        all_alerts = []
        expiry_date = today + relativedelta(months=30)

        for i, out in enumerate(created_outlets):
            lease_agr = created_agreements[i * 2]

            # 60-day alert
            trigger_60 = expiry_date - timedelta(days=60)
            alert_60 = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "outlet_id": out["id"],
                "agreement_id": lease_agr["id"],
                "type": "lease_expiry",
                "severity": "medium",
                "title": f"Lease expiry in 60 days - {out.get('name', out['city'])}",
                "message": f"Lease expires on {expiry_date.isoformat()}. Begin renewal discussions.",
                "trigger_date": trigger_60.isoformat(),
                "lead_days": 60,
                "reference_date": expiry_date.isoformat(),
                "status": "pending",
            }
            result = supabase.table("alerts").insert(alert_60).execute()
            all_alerts.append(result.data[0])

            # 30-day alert
            trigger_30 = expiry_date - timedelta(days=30)
            alert_30 = {
                "id": str(uuid.uuid4()),
                "org_id": org_id,
                "outlet_id": out["id"],
                "agreement_id": lease_agr["id"],
                "type": "lease_expiry",
                "severity": "high",
                "title": f"Lease expiry in 30 days - {out.get('name', out['city'])}",
                "message": f"Lease expires on {expiry_date.isoformat()}. URGENT: Only 30 days remaining.",
                "trigger_date": trigger_30.isoformat(),
                "lead_days": 30,
                "reference_date": expiry_date.isoformat(),
                "status": "pending",
            }
            result = supabase.table("alerts").insert(alert_30).execute()
            all_alerts.append(result.data[0])

        # Log the pilot creation for traceability
        supabase.table("activity_log").insert({
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "entity_type": "system",
            "action": "create_pilot",
            "details": {
                "client_name": req.client_name,
                "brand_name": req.brand_name,
                "cities": req.cities,
                "admin_email": req.admin_email,
                "ceo_email": req.ceo_email,
                "outlet_ids": [o["id"] for o in created_outlets],
                "agreement_ids": [a["id"] for a in created_agreements],
                "obligation_ids": [o["id"] for o in all_obligations],
                "payment_ids": [p["id"] for p in all_payments],
                "alert_ids": [a["id"] for a in all_alerts],
            }
        }).execute()

        return {
            "org_id": org_id,
            "admin_user_id": admin_user_id,
            "ceo_user_id": ceo_user_id,
            "outlets_created": len(created_outlets),
            "agreements_created": len(created_agreements),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# DIGEST ENDPOINTS
# ============================================

@router.post("/digest/send", dependencies=[Depends(require_permission("view_reports"))])
def send_digest(cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret")):
    """Collect today's alerts + overdue payments per org and return digest data."""
    today = date.today()

    orgs = supabase.table("organizations").select("id, name").execute()

    digests = []
    for org in orgs.data:
        org_id = org["id"]

        upcoming_alerts = supabase.table("alerts").select(
            "id, title, severity, trigger_date, type"
        ).eq("org_id", org_id).eq("status", "pending").gte(
            "trigger_date", today.isoformat()
        ).lte(
            "trigger_date", (today + timedelta(days=7)).isoformat()
        ).execute()

        overdue_payments = supabase.table("payment_records").select(
            "id, due_amount, due_date, outlets(name)"
        ).eq("org_id", org_id).eq("status", "overdue").execute()

        digests.append({
            "org_id": org_id,
            "org_name": org["name"],
            "upcoming_alerts": upcoming_alerts.data,
            "overdue_payments": overdue_payments.data,
            "alert_count": len(upcoming_alerts.data),
            "overdue_count": len(overdue_payments.data),
        })

    resend_configured = bool(os.getenv("RESEND_API_KEY"))
    emails_sent = 0
    if resend_configured:
        for d in digests:
            if d["alert_count"] == 0 and d["overdue_count"] == 0:
                continue
            try:
                members = supabase.table("profiles").select("email").eq("org_id", d["org_id"]).in_("role", ["org_admin", "platform_admin"]).execute()
                admin_emails = [m["email"] for m in (members.data or []) if m.get("email")]
            except Exception:
                admin_emails = []

            if admin_emails:
                preview_result = preview_digest(org_id=d["org_id"])
                html_body = preview_result.get("html", "")
                subject = f"[GroSpace] Daily Digest — {d['org_name']} — {today.strftime('%b %d')}"
                for email in admin_emails:
                    if send_email_via_resend(email, subject, html_body):
                        emails_sent += 1

    return {
        "date": today.isoformat(),
        "digests": digests,
        "emails_sent": emails_sent,
        "message": f"Digest sent to {emails_sent} recipients." if emails_sent > 0 else ("Digest data collected. Set RESEND_API_KEY to enable email delivery." if not resend_configured else "No digests required today."),
    }


@router.post("/digest/preview", dependencies=[Depends(require_permission("view_reports"))])
def preview_digest(org_id: str = Query(...)):
    """Return HTML preview of what the digest email would look like."""
    today = date.today()

    upcoming_alerts = supabase.table("alerts").select(
        "title, severity, trigger_date, type"
    ).eq("org_id", org_id).eq("status", "pending").gte(
        "trigger_date", today.isoformat()
    ).lte(
        "trigger_date", (today + timedelta(days=7)).isoformat()
    ).order("trigger_date").execute()

    overdue_payments = supabase.table("payment_records").select(
        "due_amount, due_date, outlets(name)"
    ).eq("org_id", org_id).eq("status", "overdue").order("due_date").execute()

    alert_rows = ""
    for a in upcoming_alerts.data:
        alert_rows += f'<tr><td>{a["title"]}</td><td>{a["severity"]}</td><td>{a["trigger_date"]}</td></tr>'

    payment_rows = ""
    for p in overdue_payments.data:
        outlet_name = p.get("outlets", {}).get("name", "Unknown") if p.get("outlets") else "Unknown"
        amount = p.get("due_amount", 0)
        payment_rows += f'<tr><td>{outlet_name}</td><td>Rs {amount:,.0f}</td><td>{p["due_date"]}</td></tr>'

    org = supabase.table("organizations").select("name").eq("id", org_id).single().execute()
    org_name = org.data.get("name", "Organization") if org.data else "Organization"

    html = f"""
    <html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
    <h2>GroSpace Daily Digest — {org_name}</h2>
    <p style="color:#666">{today.strftime('%B %d, %Y')}</p>
    <h3>Upcoming Alerts ({len(upcoming_alerts.data)})</h3>
    {"<table border='1' cellpadding='8' cellspacing='0' width='100%'><tr><th>Alert</th><th>Severity</th><th>Date</th></tr>" + alert_rows + "</table>" if alert_rows else "<p style='color:#999'>No upcoming alerts this week.</p>"}
    <h3 style="margin-top:20px">Overdue Payments ({len(overdue_payments.data)})</h3>
    {"<table border='1' cellpadding='8' cellspacing='0' width='100%'><tr><th>Outlet</th><th>Amount</th><th>Due Date</th></tr>" + payment_rows + "</table>" if payment_rows else "<p style='color:#999'>No overdue payments.</p>"}
    <hr style="margin-top:30px"><p style="color:#999;font-size:12px">This is an automated digest from GroSpace.</p>
    </body></html>
    """

    return {"html": html, "org_name": org_name, "date": today.isoformat()}


# ============================================
# PORTFOLIO Q&A
# ============================================

@router.post("/portfolio-qa", dependencies=[Depends(require_permission("view_reports"))])
@limiter.limit("15/minute")
async def portfolio_qa_endpoint(request: Request, req: PortfolioQARequest, authorization: Optional[str] = Header(None)):
    """Answer natural language questions across the portfolio using SQL generation."""
    try:
        org_id = req.org_id
        if not org_id and authorization:
            user = await get_current_user(authorization)
            if user:
                org_id = user.org_id

        if not org_id:
            raise HTTPException(status_code=400, detail="Organization context required")

        current_date = date.today().isoformat()

        sql_prompt = (
            "Convert this natural language question into a PostgreSQL SELECT query.\n\n"
            + PORTFOLIO_QA_SCHEMA.format(current_date=current_date, org_id=org_id)
            + f"\n\nUser question: {req.question}\n\n"
            "Return ONLY the SQL query, nothing else. No markdown code blocks."
        )

        sql_response = model.generate_content(
            sql_prompt,
            generation_config=_genai_module().GenerationConfig(temperature=0, max_output_tokens=500),
        )
        generated_sql = sql_response.text.strip()

        if generated_sql.startswith("```"):
            generated_sql = generated_sql.split("\n", 1)[1] if "\n" in generated_sql else generated_sql[3:]
        if generated_sql.endswith("```"):
            generated_sql = generated_sql[:-3].strip()
        if generated_sql.lower().startswith("sql"):
            generated_sql = generated_sql[3:].strip()

        # Strict SQL validation — only allow safe SELECT queries
        sql_upper = generated_sql.upper().strip()
        if not sql_upper.startswith("SELECT"):
            raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")
        # Block ALL dangerous keywords anywhere in the query
        forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE",
                      "GRANT", "REVOKE", "EXEC", "EXECUTE", "INTO", "COPY", "LOAD",
                      "SET ", "CALL", "DO ", "PERFORM", "VACUUM", "CLUSTER", "REINDEX",
                      "SECURITY", "OWNER", "DEFINER", "LANGUAGE"]
        for keyword in forbidden:
            if keyword in sql_upper:
                raise HTTPException(status_code=400, detail=f"Forbidden SQL operation: {keyword}")
        # Block semicolons (multi-statement attacks)
        if ";" in generated_sql:
            raise HTTPException(status_code=400, detail="Multi-statement queries are not allowed")
        # Block comments (can hide malicious SQL)
        if "--" in generated_sql or "/*" in generated_sql:
            raise HTTPException(status_code=400, detail="SQL comments are not allowed")
        # Limit query length
        if len(generated_sql) > 2000:
            raise HTTPException(status_code=400, detail="Query too long")

        try:
            query_result = supabase.rpc("exec_readonly_sql", {"query_text": generated_sql}).execute()
            rows = query_result.data if query_result.data else []
        except Exception:
            rows = []
            try:
                query_result = supabase.postgrest.rpc("exec_readonly_sql", {"query_text": generated_sql}).execute()
                rows = query_result.data if query_result.data else []
            except Exception:
                rows = []

        answer_prompt = (
            "You are GroBot, a portfolio analytics assistant built by 360Labs for commercial real estate management. If asked who built you, say 360Labs.\n"
            f"The user asked: \"{req.question}\"\n\n"
            f"The database query returned these results:\n{json.dumps(rows[:50], indent=2, default=str)}\n\n"
            "Rules:\n"
            "- Provide a clear, concise answer summarizing the data.\n"
            "- Format numbers as Indian currency (Rs) where applicable.\n"
            "- If results are empty, say so clearly.\n"
            "- Include specific outlet/agreement names when available.\n"
            "- Use a professional but conversational tone.\n"
        )

        answer_response = model.generate_content(
            answer_prompt,
            generation_config=_genai_module().GenerationConfig(temperature=0.2, max_output_tokens=1000),
        )

        return {
            "answer": answer_response.text,
            "data": rows[:50],
            "sql_used": generated_sql,
            "row_count": len(rows),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# SMART AI CHAT
# ============================================

@router.post("/smart-chat", dependencies=[Depends(require_permission("view_reports"))])
@limiter.limit("15/minute")
async def smart_chat(request: Request, req: SmartChatRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """AI-powered dashboard chat."""
    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    org_id = req.org_id
    if not org_id and user and user.org_id:
        org_id = user.org_id
    if not org_id:
        orgs = supabase.table("organizations").select("id").limit(1).execute()
        org_id = orgs.data[0]["id"] if orgs.data else None
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization context required")

    # If outlet_id specified, focus context on that single outlet
    focused_outlet_id = req.outlet_id

    try:
        outlets_q = supabase.table("outlets").select("id, name, brand_name, city, status, property_type, franchise_model, monthly_net_revenue, deal_stage, deal_priority")
        if org_id:
            outlets_q = outlets_q.eq("org_id", org_id)
        if focused_outlet_id:
            outlets_q = outlets_q.eq("id", focused_outlet_id)
        outlets_result = outlets_q.limit(200).execute()
        outlets = outlets_result.data or []

        agreements_q = supabase.table("agreements").select("id, outlet_id, type, status, monthly_rent, cam_monthly, total_monthly_outflow, security_deposit, lease_commencement_date, lease_expiry_date, lock_in_end_date, rent_model, risk_flags, lessor_name, lessee_name, brand_name")
        if org_id:
            agreements_q = agreements_q.eq("org_id", org_id)
        if focused_outlet_id:
            agreements_q = agreements_q.eq("outlet_id", focused_outlet_id)
        agreements_result = agreements_q.limit(200).execute()
        agreements = agreements_result.data or []

        alerts_q = supabase.table("alerts").select("id, type, severity, title, trigger_date, status, outlet_id")
        if org_id:
            alerts_q = alerts_q.eq("org_id", org_id)
        if focused_outlet_id:
            alerts_q = alerts_q.eq("outlet_id", focused_outlet_id)
        alerts_result = alerts_q.eq("status", "pending").limit(100).execute()
        alerts = alerts_result.data or []

        payments_q = supabase.table("payment_records").select("id, outlet_id, due_amount, due_date, status, period_month, period_year")
        if org_id:
            payments_q = payments_q.eq("org_id", org_id)
        if focused_outlet_id:
            payments_q = payments_q.eq("outlet_id", focused_outlet_id)
        payments_result = payments_q.in_("status", ["overdue", "due", "upcoming"]).limit(200).execute()
        payments = payments_result.data or []

        obligations_q = supabase.table("obligations").select("id, outlet_id, type, frequency, amount, escalation_pct, is_active")
        if org_id:
            obligations_q = obligations_q.eq("org_id", org_id)
        if focused_outlet_id:
            obligations_q = obligations_q.eq("outlet_id", focused_outlet_id)
        obligations_result = obligations_q.eq("is_active", True).limit(200).execute()
        obligations = obligations_result.data or []

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch portfolio data: {str(e)}")

    outlet_names = {o["id"]: o.get("name", "Unknown") for o in outlets}

    total_monthly_rent = sum(a.get("monthly_rent") or 0 for a in agreements if a.get("status") == "active")
    total_monthly_outflow = sum(a.get("total_monthly_outflow") or 0 for a in agreements if a.get("status") == "active")
    overdue_payments = [p for p in payments if p.get("status") == "overdue"]
    total_overdue = sum(p.get("due_amount") or 0 for p in overdue_payments)

    escalation_obligations = [o for o in obligations if (o.get("escalation_pct") or 0) > 0]

    all_risk_flags = []
    for a in agreements:
        flags = a.get("risk_flags") or []
        if isinstance(flags, list):
            for f in flags:
                all_risk_flags.append({
                    "agreement": a.get("brand_name") or a.get("lessee_name") or a["id"][:8],
                    "outlet": outlet_names.get(a.get("outlet_id"), "Unknown"),
                    "flag": f if isinstance(f, str) else f.get("flag", str(f)),
                })

    # Build data lists outside f-string to avoid {{}} set-literal bug
    outlets_json = json.dumps([{"name": o.get("name"), "city": o.get("city"), "status": o.get("status"), "type": o.get("property_type"), "revenue": o.get("monthly_net_revenue"), "deal_stage": o.get("deal_stage"), "priority": o.get("deal_priority")} for o in outlets[:20]])
    active_agreements_json = json.dumps([{"outlet": outlet_names.get(a.get("outlet_id"), "Unknown"), "type": a.get("type"), "monthly_rent": a.get("monthly_rent"), "cam_monthly": a.get("cam_monthly"), "total_outflow": a.get("total_monthly_outflow"), "rent_model": a.get("rent_model"), "expiry": a.get("lease_expiry_date"), "lock_in_end": a.get("lock_in_end_date"), "security_deposit": a.get("security_deposit")} for a in agreements if a.get("status") == "active"][:20])
    escalation_json = json.dumps([{"outlet": outlet_names.get(o.get("outlet_id"), "Unknown"), "type": o.get("type"), "amount": o.get("amount"), "escalation_pct": o.get("escalation_pct")} for o in escalation_obligations[:15]])
    risk_flags_json = json.dumps(all_risk_flags[:15])
    alerts_json = json.dumps([{"title": a.get("title"), "type": a.get("type"), "severity": a.get("severity"), "outlet": outlet_names.get(a.get("outlet_id"), "Unknown")} for a in alerts[:15]])
    overdue_json = json.dumps([{"outlet": outlet_names.get(p.get("outlet_id"), "Unknown"), "amount": p.get("due_amount"), "due_date": p.get("due_date")} for p in overdue_payments[:15]])
    status_counts = json.dumps({s: len([o for o in outlets if o.get("status") == s]) for s in set(o.get("status", "unknown") for o in outlets)})
    city_counts = json.dumps({c: len([o for o in outlets if o.get("city") == c]) for c in set(o.get("city", "Unknown") for o in outlets)})
    pipeline_counts = json.dumps({s: len([o for o in outlets if o.get("deal_stage") == s]) for s in set(o.get("deal_stage", "lead") for o in outlets)})

    context = f"""You are GroBot, a smart AI assistant for commercial real estate lease management, built by 360Labs.
If anyone asks who built you, who made you, or who you are, say: "I am GroBot, an advanced AI assistant purpose-built for commercial real estate portfolio management. I was developed by 360Labs using state-of-the-art large language model technology, fine-tuned specifically for lease management, F&B operations, and retail real estate analytics."
The user manages a portfolio of {len(outlets)} outlet(s) with {len(agreements)} agreement(s).

PORTFOLIO SUMMARY:
- Total outlets: {len(outlets)}
- Outlets by status: {status_counts}
- Outlets by city: {city_counts}
- Deal pipeline: {pipeline_counts}
- Total active monthly rent: Rs {total_monthly_rent:,.0f}
- Total monthly outflow (rent+CAM+charges): Rs {total_monthly_outflow:,.0f}
- Pending alerts: {len(alerts)}
- Overdue payments: {len(overdue_payments)} totaling Rs {total_overdue:,.0f}

OUTLETS:
{outlets_json}

AGREEMENTS (active):
{active_agreements_json}

ESCALATION OBLIGATIONS:
{escalation_json}

RISK FLAGS:
{risk_flags_json}

PENDING ALERTS (top 15):
{alerts_json}

OVERDUE PAYMENTS:
{overdue_json}


LEASE RULES REFERENCE (India Commercial Leasing):
- Lock-in: Brand lock-in should be 1-2 years. Longer creates risk.
- Termination: Exit with 3-6 month notice. Avoid full lock-in penalty.
- Force Majeure: Must cover pandemic, lockdown, govt restrictions. Rent waived during non-operational.
- Rent Commencement: Only after store opening/operational readiness.
- Fit-out: 30-90 days rent-free for setup.
- Escalation: Standard 5-7% annually or 15% every 3 years. Above 10% is high.
- CAM (Common Area Maintenance): Require transparency, audit rights, capped increases (typically 5-8% annual cap). CAM should be billed on carpet/covered area NOT super area. Include reconciliation clause. CAM charges listed per agreement in cam_monthly field.
- HVAC: Separate from CAM. Charged per sqft typically Rs 15-25/sqft/month.
- Security Deposit: Typically 3-6 months. Above 6 is high.
- Exclusivity: Prevent leasing to direct competitors.
- Co-tenancy (malls): Rent relief or exit if anchor tenants leave.
- Rent Models: Fixed, Step-Up, Revenue Share (PRS), MG + Revenue Share, Hybrid MGLR.
- Franchise: FOFO, FOCO, COCO, FICO.
Always flag risks when lease terms deviate from these standards.

Answer the user's question based on this data. Be specific with numbers, outlet names, and dates.
Format your response in clear, readable text. Use bullet points for lists.
If the user asks about escalation struggles, focus on which outlets have high escalation rates and what their impact is.
If asked for recommendations, be actionable and specific.
When analyzing lease terms, compare them against the LEASE RULES REFERENCE above and flag any deviations.

IMPORTANT: If the user asks a general question about real estate, leasing, F&B operations, commercial property,
licenses, compliance, or any business topic — answer it using your general knowledge even if the portfolio data
doesn't contain the answer. You are a knowledgeable real estate AI assistant, not just a data query tool.
For example, if someone asks "what is FSSAI" or "how does rent escalation work" or "what are typical CAM charges",
answer from your knowledge. Never say you can't answer — always provide helpful information."""

    # Build conversation with session history for context awareness
    conversation_parts = [context]
    if req.session_history:
        for entry in req.session_history[-5:]:  # Last 5 exchanges for context
            if entry.get("role") == "user":
                conversation_parts.append(f"User: {entry.get('message', '')}")
            elif entry.get("role") == "assistant":
                conversation_parts.append(f"Assistant: {entry.get('message', '')}")
    conversation_parts.append(f"User question: {question}")

    try:
        response = model.generate_content(
            conversation_parts,
            generation_config={"temperature": 0.3, "max_output_tokens": 4096},
        )
        if not response.candidates or not response.candidates[0].content.parts:
            # Fallback: try a direct general-knowledge answer
            try:
                fallback_resp = model.generate_content(
                    f"You are GroBot, an advanced AI assistant built by 360Labs for commercial real estate, F&B chains, and retail operations. If asked who built you or who you are, say you were developed by 360Labs. Answer this question helpfully:\n\n{question}",
                    generation_config={"temperature": 0.3, "max_output_tokens": 2048},
                )
                answer = fallback_resp.text
            except Exception:
                answer = "I'm sorry, I couldn't generate a response for that question. Please try rephrasing your question."
        else:
            answer = response.text
    except Exception:
        # Final fallback: try simpler prompt without portfolio context
        try:
            fallback_resp = model.generate_content(
                f"You are GroBot, an advanced AI assistant built by 360Labs for real estate and business. If asked who built you, say 360Labs. Answer concisely:\n\n{question}",
                generation_config={"temperature": 0.3, "max_output_tokens": 2048},
            )
            answer = fallback_resp.text
        except Exception:
            answer = "I'm experiencing temporary issues but I'm still here to help. Could you please rephrase your question or try again in a moment?"

    return {
        "answer": answer,
        "context_summary": {
            "outlets": len(outlets),
            "agreements": len(agreements),
            "pending_alerts": len(alerts),
            "overdue_payments": len(overdue_payments),
            "total_monthly_rent": total_monthly_rent,
        },
    }


# ============================================
# CRON TRIGGER ENDPOINTS
# ============================================

def run_agreement_status_transitions() -> dict:
    """Auto-transition agreement and outlet statuses based on dates."""
    today = date.today()
    threshold_90 = today + timedelta(days=90)
    transitioned = {"expiring": 0, "expired": 0, "outlets_updated": 0}

    try:
        expiring = supabase.table("agreements").select("id, outlet_id, org_id").eq("status", "active").lte("lease_expiry_date", threshold_90.isoformat()).gte("lease_expiry_date", today.isoformat()).execute()
        for ag in (expiring.data or []):
            supabase.table("agreements").update({"status": "expiring"}).eq("id", ag["id"]).execute()
            supabase.table("activity_log").insert({"id": str(uuid.uuid4()), "org_id": ag["org_id"], "entity_type": "agreement", "entity_id": ag["id"], "action": "auto_transition", "details": json.dumps({"from": "active", "to": "expiring"})}).execute()
            transitioned["expiring"] += 1
            supabase.table("outlets").update({"status": "up_for_renewal"}).eq("id", ag["outlet_id"]).execute()
            transitioned["outlets_updated"] += 1
    except Exception as e:
        print(f"[CRON] Error transitioning expiring: {e}")

    try:
        expired = supabase.table("agreements").select("id, outlet_id, org_id").in_("status", ["active", "expiring"]).lt("lease_expiry_date", today.isoformat()).execute()
        for ag in (expired.data or []):
            supabase.table("agreements").update({"status": "expired"}).eq("id", ag["id"]).execute()
            supabase.table("activity_log").insert({"id": str(uuid.uuid4()), "org_id": ag["org_id"], "entity_type": "agreement", "entity_id": ag["id"], "action": "auto_transition", "details": json.dumps({"from": "active/expiring", "to": "expired"})}).execute()
            transitioned["expired"] += 1
    except Exception as e:
        print(f"[CRON] Error transitioning expired: {e}")

    return transitioned


def run_payment_status_updater() -> dict:
    """Mark overdue obligations."""
    today = date.today()
    updated = 0
    try:
        overdue = supabase.table("obligations").select("id").lt("due_date", today.isoformat()).not_.eq("status", "paid").not_.eq("status", "overdue").execute()
        for ob in (overdue.data or []):
            supabase.table("obligations").update({"status": "overdue"}).eq("id", ob["id"]).execute()
            updated += 1
    except Exception as e:
        print(f"[CRON] Error updating payment status: {e}")
    return {"overdue_marked": updated}


def run_alert_engine() -> dict:
    """Scan obligations and key dates, generate alerts with configurable lead times."""
    today = date.today()
    generated = 0
    try:
        orgs = supabase.table("organizations").select("id, alert_preferences").execute()
        for org in (orgs.data or []):
            org_id = org["id"]
            prefs = org.get("alert_preferences") or {}
            lease_days = prefs.get("lease_expiry_days", [90, 30, 7])
            rent_days = prefs.get("rent_due_days", [7, 3, 1])

            agreements = supabase.table("agreements").select("id, outlet_id, lease_expiry_date, status").eq("org_id", org_id).in_("status", ["active", "expiring"]).execute()
            for ag in (agreements.data or []):
                expiry = ag.get("lease_expiry_date")
                if not expiry:
                    continue
                try:
                    exp_date = date.fromisoformat(expiry)
                except (ValueError, TypeError):
                    continue
                days_left = (exp_date - today).days
                for lead in lease_days:
                    if days_left == lead:
                        existing = supabase.table("alerts").select("id").eq("agreement_id", ag["id"]).eq("type", "lease_expiry").eq("trigger_date", today.isoformat()).execute()
                        if not existing.data:
                            supabase.table("alerts").insert({
                                "id": str(uuid.uuid4()), "org_id": org_id, "agreement_id": ag["id"], "outlet_id": ag.get("outlet_id"),
                                "type": "lease_expiry", "severity": "high" if lead <= 30 else "medium",
                                "title": f"Lease expiring in {lead} days",
                                "description": f"Agreement lease expires on {expiry}",
                                "trigger_date": today.isoformat(), "status": "pending",
                            }).execute()
                            generated += 1

            obligations_data = supabase.table("obligations").select("id, outlet_id, agreement_id, due_date, type, amount").eq("org_id", org_id).eq("status", "upcoming").execute()
            for ob in (obligations_data.data or []):
                due = ob.get("due_date")
                if not due:
                    continue
                try:
                    due_date_val = date.fromisoformat(due)
                except (ValueError, TypeError):
                    continue
                days_until = (due_date_val - today).days
                for lead in rent_days:
                    if days_until == lead:
                        existing = supabase.table("alerts").select("id").eq("agreement_id", ob.get("agreement_id")).eq("type", "rent_due").eq("trigger_date", today.isoformat()).execute()
                        if not existing.data:
                            supabase.table("alerts").insert({
                                "id": str(uuid.uuid4()), "org_id": org_id, "agreement_id": ob.get("agreement_id"), "outlet_id": ob.get("outlet_id"),
                                "type": "rent_due", "severity": "medium" if lead > 1 else "high",
                                "title": f"Rent due in {lead} day{'s' if lead > 1 else ''}",
                                "description": f"{ob.get('type', 'Payment')} of {ob.get('amount', 'N/A')} due on {due}",
                                "trigger_date": today.isoformat(), "status": "pending",
                            }).execute()
                            generated += 1
    except Exception as e:
        print(f"[CRON] Error in alert engine: {e}")
    return {"alerts_generated": generated}


def run_email_digest() -> dict:
    """Compile pending alerts into a digest."""
    resend_key = os.getenv("RESEND_API_KEY")
    if not resend_key:
        return {"status": "skipped", "reason": "RESEND_API_KEY not configured"}

    digest_data = []
    try:
        orgs = supabase.table("organizations").select("id, name").execute()
        for org in (orgs.data or []):
            pending = supabase.table("alerts").select("*").eq("org_id", org["id"]).eq("status", "pending").order("trigger_date").limit(50).execute()
            overdue = supabase.table("obligations").select("*").eq("org_id", org["id"]).eq("status", "overdue").limit(20).execute()
            if pending.data or overdue.data:
                digest_data.append({
                    "org": org["name"],
                    "pending_alerts": len(pending.data or []),
                    "overdue_obligations": len(overdue.data or []),
                })
    except Exception as e:
        print(f"[CRON] Error in email digest: {e}")
    return {"status": "compiled", "orgs_with_alerts": len(digest_data), "email_sending": "not_configured"}


@router.post("/admin/run-transitions", dependencies=[Depends(require_permission("manage_org_settings"))])
def api_run_transitions():
    """Manually trigger agreement/outlet status transitions."""
    result = run_agreement_status_transitions()
    return {"status": "ok", **result}


@router.post("/admin/run-cron/{job_name}", dependencies=[Depends(require_permission("manage_org_settings"))])
def api_run_cron(job_name: str):
    """Manually trigger a cron job."""
    jobs = {
        "alert_engine": run_alert_engine,
        "payment_updater": run_payment_status_updater,
        "transitions": run_agreement_status_transitions,
        "email_digest": run_email_digest,
    }
    if job_name not in jobs:
        raise HTTPException(status_code=400, detail=f"Unknown job: {job_name}. Available: {', '.join(jobs.keys())}")
    result = jobs[job_name]()
    return {"job": job_name, "result": result}


@router.post("/cron")
def unified_cron(cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret")):
    """
    Unified cron endpoint for external schedulers (Railway, Vercel, etc.).
    Runs all background jobs in sequence: transitions → payments → escalations → alerts → digest.
    Secured via CRON_SECRET env var.
    """
    expected_secret = os.getenv("CRON_SECRET")
    if not expected_secret or cron_secret != expected_secret:
        raise HTTPException(status_code=401, detail="Invalid or missing cron secret")

    results = {}
    for name, fn in [
        ("transitions", run_agreement_status_transitions),
        ("payment_updater", run_payment_status_updater),
        ("escalation_calculator", cron_escalation_calculator),
        ("alert_engine", run_alert_engine),
        ("email_digest", run_email_digest),
    ]:
        try:
            results[name] = fn()
        except Exception as e:
            results[name] = {"error": str(e)}

    return {"status": "ok", "timestamp": datetime.utcnow().isoformat(), "results": results}


@router.post("/cron/agreement-transitions", dependencies=[Depends(require_permission("manage_org_settings"))])
def cron_agreement_transitions():
    """Manually trigger agreement status transitions."""
    today = date.today()
    updated = {"to_expiring": 0, "to_expired": 0}

    active = supabase.table("agreements").select("id, lease_expiry_date").eq("status", "active").execute().data or []
    for a in active:
        exp = a.get("lease_expiry_date")
        if exp:
            try:
                exp_date = date.fromisoformat(exp)
                if today < exp_date <= today + timedelta(days=90):
                    supabase.table("agreements").update({"status": "expiring"}).eq("id", a["id"]).execute()
                    updated["to_expiring"] += 1
            except (ValueError, TypeError):
                pass

    expirable = supabase.table("agreements").select("id, lease_expiry_date").in_("status", ["active", "expiring"]).execute().data or []
    for a in expirable:
        exp = a.get("lease_expiry_date")
        if exp:
            try:
                exp_date = date.fromisoformat(exp)
                if exp_date < today:
                    supabase.table("agreements").update({"status": "expired"}).eq("id", a["id"]).execute()
                    updated["to_expired"] += 1
            except (ValueError, TypeError):
                pass

    return {"status": "ok", **updated}


@router.post("/cron/payment-status-update", dependencies=[Depends(require_permission("manage_org_settings"))])
def cron_payment_status_update():
    """Mark overdue payments automatically."""
    today = date.today()
    pending = supabase.table("payment_records").select("id, due_date").in_("status", ["pending", "due", "upcoming"]).execute().data or []
    updated = 0
    for p in pending:
        dd = p.get("due_date")
        if dd:
            try:
                if date.fromisoformat(dd) < today:
                    supabase.table("payment_records").update({"status": "overdue"}).eq("id", p["id"]).execute()
                    updated += 1
            except (ValueError, TypeError):
                pass

    return {"status": "ok", "marked_overdue": updated}


@router.post("/cron/escalation-calculator", dependencies=[Depends(require_permission("manage_org_settings"))])
def cron_escalation_calculator():
    """Check and apply rent escalations that are due."""
    today = date.today()
    escalated = 0

    obligations_data = supabase.table("obligations").select("id, amount, type, agreement_id").eq("is_active", True).eq("type", "rent").execute().data or []
    for ob in obligations_data:
        agreement = supabase.table("agreements").select("extracted_data, org_id").eq("id", ob["agreement_id"]).single().execute()
        if not agreement.data:
            continue
        ed = agreement.data.get("extracted_data") or {}
        rent = ed.get("rent", {})
        esc_pct = get_num(rent.get("escalation_percentage"))
        esc_freq = int(get_num(rent.get("escalation_frequency_years")) or 0)
        if not esc_pct or esc_pct <= 0 or esc_freq <= 0:
            continue

        lt = ed.get("lease_term", {})
        base_str = lt.get("rent_commencement_date") or lt.get("lease_commencement_date")
        if not base_str:
            continue
        try:
            base_date = date.fromisoformat(str(base_str))
        except (ValueError, TypeError):
            continue

        years_elapsed = (today.year - base_date.year) + (today.month - base_date.month) / 12
        if years_elapsed < esc_freq:
            continue

        next_esc_year = int((int(years_elapsed) // esc_freq) * esc_freq + esc_freq)
        anniversary = base_date + relativedelta(years=next_esc_year)
        if anniversary == today:
            new_amount = round(ob["amount"] * (1 + esc_pct / 100), 2)
            supabase.table("obligations").update({"amount": new_amount}).eq("id", ob["id"]).execute()
            supabase.table("activity_log").insert({
                "id": str(uuid.uuid4()),
                "org_id": agreement.data.get("org_id"),
                "entity_type": "obligation",
                "entity_id": ob["id"],
                "action": "escalation_applied",
                "details": json.dumps({
                    "old_amount": ob["amount"],
                    "new_amount": new_amount,
                    "escalation_pct": esc_pct,
                }),
            }).execute()
            escalated += 1

    return {"status": "ok", "escalated": escalated}


# ============================================
# ROLE TIERS
# ============================================

ROLE_TIER_INFO = {
    "platform_admin": {
        "badge": "System Admin",
        "tier_level": 3,
        "color": "red",
        "description": "Full platform access — all orgs, system settings, user management",
    },
    "org_admin": {
        "badge": "Admin",
        "tier_level": 2,
        "color": "blue",
        "description": "Organization admin — team management, full analytics, all CRUD operations",
    },
    "org_member": {
        "badge": "Member",
        "tier_level": 1,
        "color": "green",
        "description": "View-only access with payment marking capability",
    },
}


@router.get("/api/role-tiers")
def get_role_tiers():
    """Return role tier metadata for frontend display."""
    return ROLE_TIER_INFO


# ============================================
# FEEDBACK PIPELINE
# ============================================

def _sync_feedback_to_google_sheets(feedback_data: dict):
    """Sync feedback to the Feedback tab in Google Sheets."""
    try:
        from services.sheets_service import write_feedback_to_sheet
        result = write_feedback_to_sheet(
            agreement_id=feedback_data.get("agreement_id", ""),
            field_name=feedback_data.get("field_name", ""),
            original_value=feedback_data.get("original_value"),
            corrected_value=feedback_data.get("corrected_value"),
            comment=feedback_data.get("comment"),
            status=feedback_data.get("status", "pending"),
        )
        return {"synced": result}
    except Exception as e:
        import logging
        logging.getLogger(__name__).error(f"Feedback Google Sheets sync failed: {e}")
        return {"synced": False, "reason": str(e)}


@router.post("/feedback", dependencies=[Depends(require_permission("view_agreements"))])
def submit_feedback(
    req: FeedbackRequest,
    authorization: Optional[str] = Header(None),
):
    """Submit extraction feedback for a field."""
    user = get_current_user_sync(authorization)

    # agreement_id may be a filename (pre-confirmation) or a UUID
    agr_id = req.agreement_id
    try:
        import uuid as _uuid
        _uuid.UUID(agr_id)
    except (ValueError, AttributeError):
        agr_id = None  # Not a valid UUID — skip FK reference

    feedback_data = {
        "id": str(uuid.uuid4()),
        "field_name": req.field_name,
        "original_value": req.original_value,
        "corrected_value": req.corrected_value,
        "comment": req.comment,
        "status": "pending",
    }
    if agr_id:
        feedback_data["agreement_id"] = agr_id

    if user:
        # feedback.user_id is a uuid column — demo sessions carry synthetic
        # ids that would fail the type cast. Use the helper to drop them.
        feedback_data["user_id"] = get_db_user_id(user)
        feedback_data["org_id"] = user.org_id

    result = supabase.table("feedback").insert(feedback_data).execute()

    # Try to sync to Google Sheets (use original ID/filename for reference)
    sheets_data = {**feedback_data, "agreement_id": req.agreement_id}
    _sync_feedback_to_google_sheets(sheets_data)

    return {"success": True, "feedback_id": result.data[0]["id"] if result.data else None}


@router.get("/feedback", dependencies=[Depends(require_permission("view_agreements"))])
def list_feedback(
    org_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=500),
):
    """List feedback entries, optionally filtered by org and status."""
    query = supabase.table("feedback").select("*", count="exact")

    if org_id:
        query = query.eq("org_id", org_id)
    if status:
        query = query.eq("status", status)

    offset = (page - 1) * page_size
    result = query.order("created_at", desc=True).range(offset, offset + page_size - 1).execute()

    return {"data": result.data, "total": result.count, "page": page, "page_size": page_size}


# ============================================
# PROCESSING STATS
# ============================================

@router.get("/api/processing-stats", dependencies=[Depends(require_permission("view_reports"))])
def get_processing_stats():
    """Return average processing time stats."""
    # Access the processing times from the documents route
    try:
        from routes.documents import _processing_times
        times = list(_processing_times)
    except (ImportError, AttributeError):
        times = []

    if not times:
        return {"average_seconds": 0, "count": 0, "min_seconds": 0, "max_seconds": 0}

    return {
        "average_seconds": round(sum(times) / len(times), 1),
        "count": len(times),
        "min_seconds": round(min(times), 1),
        "max_seconds": round(max(times), 1),
    }
