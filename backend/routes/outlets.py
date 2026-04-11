"""
CRUD outlets endpoints.
"""

import os
import uuid
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from pydantic import BaseModel

from core.config import supabase, log_activity
from core.models import CurrentUser, UpdateOutletRequest
from core.dependencies import get_current_user, get_org_filter, require_permission


class CreateOutletRequest(BaseModel):
    name: str
    city: Optional[str] = None

router = APIRouter(prefix="/api", tags=["outlets"])


def _exclude_deleted(query):
    """Apply the deleted-at filter when the query builder supports it."""
    return query.is_("deleted_at", "null") if hasattr(query, "is_") else query


@router.get("/outlets", dependencies=[Depends(require_permission("view_outlets"))])
async def list_outlets(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=200),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List outlets (paginated). Scoped to caller's org."""
    offset = (page - 1) * page_size
    org_id = get_org_filter(user)

    count_query = supabase.table("outlets").select("id", count="exact")
    if org_id:
        count_query = count_query.eq("org_id", org_id)
    count_result = _exclude_deleted(count_query).execute()
    total = count_result.count or 0

    query = supabase.table("outlets").select(
        "*, agreements(id, type, status, monthly_rent, lease_expiry_date, risk_flags)"
    )
    if org_id:
        query = query.eq("org_id", org_id)
    result = _exclude_deleted(query).order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@router.post("/outlets", dependencies=[Depends(require_permission("edit_outlets"))])
def create_outlet(req: CreateOutletRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Create a new outlet."""
    org_id = user.org_id if user else None
    if not org_id:
        try:
            if user:
                profile = supabase.table("profiles").select("org_id").eq("id", user.user_id).single().execute()
                org_id = profile.data.get("org_id") if profile.data else None
        except Exception:
            pass
    if not org_id:
        orgs = supabase.table("organizations").select("id").limit(1).execute()
        org_id = orgs.data[0]["id"] if orgs.data else None
    if not org_id:
        raise HTTPException(status_code=400, detail="Could not determine organization")

    outlet_data = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "name": req.name,
        "city": req.city,
        "status": "pipeline",
    }
    clean = {k: v for k, v in outlet_data.items() if v is not None}
    result = supabase.table("outlets").insert(clean).execute()

    if result.data and org_id:
        log_activity(org_id, user.user_id if user else None, "outlet", outlet_data["id"], "outlet_created", {
            "name": req.name,
            "city": req.city,
        })

    return {"outlet": result.data[0] if result.data else clean}


@router.get("/outlets/deleted", dependencies=[Depends(require_permission("manage_org_settings"))])
async def list_deleted_outlets(user: Optional[CurrentUser] = Depends(get_current_user)):
    """List soft-deleted outlets (recycle bin). Scoped to caller's org."""
    org_id = get_org_filter(user)
    query = supabase.table("outlets").select("*, agreements(id, type, status)")
    if org_id:
        query = query.eq("org_id", org_id)
    result = query.not_.is_("deleted_at", "null").order("deleted_at", desc=True).execute()
    return {"items": result.data or []}


@router.get("/outlets/{outlet_id}", dependencies=[Depends(require_permission("view_outlets"))])
async def get_outlet(outlet_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Get a single outlet with agreements, obligations, alerts, and documents. Org-scoped."""
    result = supabase.table("outlets").select("*").eq("id", outlet_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    # Multi-tenant guard
    org_id = get_org_filter(user)
    if org_id and result.data.get("org_id") != org_id:
        raise HTTPException(status_code=404, detail="Outlet not found")

    agreements = supabase.table("agreements").select("*").eq("outlet_id", outlet_id).limit(50).execute()
    obligations = supabase.table("obligations").select("*").eq("outlet_id", outlet_id).limit(200).execute()
    alerts = supabase.table("alerts").select("*").eq("outlet_id", outlet_id).order("trigger_date").limit(200).execute()
    documents = supabase.table("documents").select("*").eq("outlet_id", outlet_id).order("uploaded_at", desc=True).limit(100).execute()

    # Fetch critical dates/events for this outlet
    try:
        critical_dates = supabase.table("critical_dates").select("*").eq("outlet_id", outlet_id).order("date_value").execute()
        critical_dates_data = critical_dates.data or []
    except Exception:
        critical_dates_data = []

    return {
        "outlet": result.data,
        "agreements": agreements.data,
        "obligations": obligations.data,
        "alerts": alerts.data,
        "documents": documents.data if documents.data else [],
        "criticalDates": critical_dates_data,
    }


@router.patch("/outlets/{outlet_id}", dependencies=[Depends(require_permission("edit_outlets"))])
def update_outlet(outlet_id: str, req: UpdateOutletRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Update outlet fields (revenue, status). Org-scoped."""
    current = supabase.table("outlets").select("status, monthly_net_revenue, org_id").eq("id", outlet_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    # Multi-tenant guard
    user_org = get_org_filter(user)
    if user_org and current.data.get("org_id") != user_org:
        raise HTTPException(status_code=404, detail="Outlet not found")

    update_data: dict = {}
    if req.monthly_net_revenue is not None:
        update_data["monthly_net_revenue"] = req.monthly_net_revenue
        update_data["revenue_updated_at"] = datetime.utcnow().isoformat()
    if req.status is not None:
        valid_statuses = {"pipeline", "fit_out", "operational", "up_for_renewal", "renewed", "closed"}
        if req.status not in valid_statuses:
            raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")
        update_data["status"] = req.status
    if req.site_code is not None:
        update_data["site_code"] = req.site_code
    # Direct text fields
    for field in ("name", "city", "address", "property_type", "floor", "unit_number",
                  "business_category", "company_name", "notes"):
        val = getattr(req, field, None)
        if val is not None:
            update_data[field] = val
    # Numeric area fields
    for field in ("super_area_sqft", "covered_area_sqft", "carpet_area_sqft"):
        val = getattr(req, field, None)
        if val is not None:
            update_data[field] = val
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("outlets").update(update_data).eq("id", outlet_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    org_id = current.data.get("org_id")
    user_id = user.user_id if user else None
    if org_id:
        if req.status is not None and req.status != current.data.get("status"):
            log_activity(org_id, user_id, "outlet", outlet_id, "status_changed", {
                "old_status": current.data.get("status"),
                "new_status": req.status,
            })
        if req.monthly_net_revenue is not None:
            log_activity(org_id, user_id, "outlet", outlet_id, "revenue_updated", {
                "old_revenue": current.data.get("monthly_net_revenue"),
                "new_revenue": req.monthly_net_revenue,
            })

    # Log changes to Google Sheets
    try:
        from services.sheets_service import write_changelog_to_sheet
        profile_name = None
        if user and user.user_id:
            try:
                profile = supabase.table("profiles").select("full_name, email").eq("id", user.user_id).single().execute()
                if profile.data:
                    profile_name = profile.data.get("full_name") or profile.data.get("email")
            except Exception:
                pass
        outlet_name = current.data.get("name", "") if current.data else ""
        for field, new_val in update_data.items():
            old_val = current.data.get(field, "") if current.data else ""
            if str(old_val) != str(new_val):
                write_changelog_to_sheet(
                    outlet_id=outlet_id,
                    outlet_name=outlet_name,
                    action="field_updated",
                    changed_by=profile_name or "Unknown",
                    field=field,
                    old_value=str(old_val) if old_val is not None else "--",
                    new_value=str(new_val) if new_val is not None else "--",
                )
    except Exception:
        pass  # Non-critical

    return {"outlet": result.data[0]}


@router.post("/outlets/{outlet_id}/profile-photo", dependencies=[Depends(require_permission("edit_outlets"))])
async def upload_profile_photo(
    outlet_id: str,
    file: UploadFile = File(...),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Upload a profile/cover photo for an outlet."""
    outlet = supabase.table("outlets").select("id, org_id").eq("id", outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    file_bytes = await file.read()
    if len(file_bytes) > 10 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum 10MB.")

    ext = os.path.splitext((file.filename or "photo").lower())[1] or ".jpg"
    storage_path = f"profile-photos/{outlet_id}{ext}"

    try:
        # Delete old photo if exists
        try:
            supabase.storage.from_("documents").remove([storage_path])
        except Exception:
            pass

        supabase.storage.from_("documents").upload(storage_path, file_bytes, {
            "content-type": file.content_type or "image/jpeg",
            "upsert": "true",
        })
        signed = supabase.storage.from_("documents").create_signed_url(storage_path, 31536000)
        photo_url = signed.get("signedURL") or signed.get("signedUrl")
        if not photo_url:
            photo_url = supabase.storage.from_("documents").get_public_url(storage_path)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Upload failed: {str(e)}")

    supabase.table("outlets").update({"profile_photo_url": photo_url}).eq("id", outlet_id).execute()

    return {"url": photo_url}


@router.delete("/outlets/{outlet_id}", dependencies=[Depends(require_permission("manage_org_settings"))])
def delete_outlet(outlet_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Soft-delete an outlet (admin/CEO only). Sets deleted_at timestamp."""
    outlet = supabase.table("outlets").select("*").eq("id", outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    if outlet.data.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Outlet is already deleted")

    org_id = outlet.data.get("org_id")
    deleted_by = user.user_id if user else None

    # Soft delete — set timestamp, don't actually remove
    supabase.table("outlets").update({
        "deleted_at": datetime.utcnow().isoformat(),
        "deleted_by": deleted_by,
    }).eq("id", outlet_id).execute()

    # Log to activity
    if org_id:
        log_activity(org_id, deleted_by, "outlet", outlet_id, "outlet_deleted", {
            "name": outlet.data.get("name"),
            "city": outlet.data.get("city"),
            "brand_name": outlet.data.get("brand_name"),
        })

    # Log to Google Sheets
    try:
        from services.sheets_service import write_deletion_to_sheet
        profile_name = None
        if deleted_by:
            try:
                profile = supabase.table("profiles").select("full_name, email").eq("id", deleted_by).single().execute()
                if profile.data:
                    profile_name = profile.data.get("full_name") or profile.data.get("email")
            except Exception:
                pass
        write_deletion_to_sheet(
            outlet_id=outlet_id,
            outlet_name=outlet.data.get("name", ""),
            city=outlet.data.get("city", ""),
            brand=outlet.data.get("brand_name", ""),
            deleted_by=profile_name or "Unknown",
            org_id=org_id or "",
        )
    except Exception:
        pass  # Non-critical

    return {"deleted": True, "outlet_id": outlet_id}


@router.patch("/outlets/{outlet_id}/restore", dependencies=[Depends(require_permission("manage_org_settings"))])
def restore_outlet(outlet_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Restore a soft-deleted outlet (admin/CEO only)."""
    outlet = supabase.table("outlets").select("id, deleted_at, org_id, name").eq("id", outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    if not outlet.data.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Outlet is not deleted")

    supabase.table("outlets").update({
        "deleted_at": None,
        "deleted_by": None,
    }).eq("id", outlet_id).execute()

    org_id = outlet.data.get("org_id")
    if org_id:
        log_activity(org_id, user.user_id if user else None, "outlet", outlet_id, "outlet_restored", {
            "name": outlet.data.get("name"),
        })

    return {"restored": True, "outlet_id": outlet_id}
