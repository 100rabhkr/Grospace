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
from core.dependencies import get_current_user, get_db_user_id, get_org_filter, require_permission


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
    """Create a new outlet. Always scoped to the caller's organization —
    refuses to guess if the caller has no org_id rather than silently
    dropping the outlet into a random org's workspace."""
    import logging as _logging
    _logger = _logging.getLogger(__name__)

    org_id: Optional[str] = user.org_id if user else None

    # If the token didn't carry an org_id, try to resolve it from the
    # caller's profile. Surface failures instead of silently falling
    # through to "grab the first org in the DB".
    if not org_id and user and user.user_id:
        try:
            profile = supabase.table("profiles").select("org_id").eq("id", user.user_id).single().execute()
            if profile.data and profile.data.get("org_id"):
                org_id = profile.data["org_id"]
        except Exception as e:
            _logger.warning("create_outlet: profile lookup for user %s failed: %s", user.user_id, e)

    # Platform admins don't have their own org but ARE allowed to create
    # outlets. For them the "first org in the DB" fallback is acceptable
    # as a last resort so platform-admin seeding works. Everyone else
    # MUST have a real org_id — no silent cross-tenant leaks.
    if not org_id:
        is_platform_admin = bool(user and user.role == "platform_admin")
        if is_platform_admin:
            try:
                orgs = supabase.table("organizations").select("id").limit(1).execute()
                org_id = orgs.data[0]["id"] if orgs.data else None
            except Exception as e:
                _logger.warning("create_outlet: platform_admin org fallback failed: %s", e)
        if not org_id:
            raise HTTPException(
                status_code=400,
                detail="Your account isn't attached to any organization. Create one from the pending-approval screen or ask an admin to assign you.",
            )

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
        log_activity(org_id, get_db_user_id(user), "outlet", outlet_data["id"], "outlet_created", {
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

    # Multi-tenant guard — prevent cross-tenant profile photo writes. Without
    # this an attacker who guessed a valid outlet_id could overwrite another
    # org's outlet photo.
    caller_org = get_org_filter(user)
    if caller_org and outlet.data.get("org_id") != caller_org:
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

    # Multi-tenant guard — don't let an admin in Org A delete Org B's outlet.
    org_id = outlet.data.get("org_id")
    caller_org = get_org_filter(user)
    if caller_org and org_id and org_id != caller_org:
        raise HTTPException(status_code=404, detail="Outlet not found")

    if outlet.data.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Outlet is already deleted")

    # outlets.deleted_by is `uuid REFERENCES auth.users(id)` — demo sessions
    # carry synthetic non-UUID ids that would fail the FK. Pass None for demos.
    deleted_by_uuid = get_db_user_id(user)

    # Soft delete — set timestamp, don't actually remove
    try:
        supabase.table("outlets").update({
            "deleted_at": datetime.utcnow().isoformat(),
            "deleted_by": deleted_by_uuid,
        }).eq("id", outlet_id).execute()
    except Exception as e:
        # Surface the real DB error to the caller instead of a generic 500
        raise HTTPException(status_code=500, detail=f"Failed to delete outlet: {str(e)[:200]}")

    # Log to activity
    if org_id:
        log_activity(org_id, deleted_by_uuid, "outlet", outlet_id, "outlet_deleted", {
            "name": outlet.data.get("name"),
            "city": outlet.data.get("city"),
            "brand_name": outlet.data.get("brand_name"),
        })

    # Log to Google Sheets (non-critical, never block the delete on this)
    try:
        from services.sheets_service import write_deletion_to_sheet
        profile_name = None
        if deleted_by_uuid:
            try:
                profile = supabase.table("profiles").select("full_name, email").eq("id", deleted_by_uuid).single().execute()
                if profile.data:
                    profile_name = profile.data.get("full_name") or profile.data.get("email")
            except Exception:
                pass
        # Demo users: use their display name from the token role instead of "Unknown"
        if not profile_name and user:
            profile_name = user.email or "Demo user"
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
    outlet = supabase.table("outlets").select("id, deleted_at, org_id, name, brand_name").eq("id", outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    # Multi-tenant guard
    caller_org = get_org_filter(user)
    if caller_org and outlet.data.get("org_id") and outlet.data["org_id"] != caller_org:
        raise HTTPException(status_code=404, detail="Outlet not found")

    if not outlet.data.get("deleted_at"):
        raise HTTPException(status_code=400, detail="Outlet is not deleted")

    supabase.table("outlets").update({
        "deleted_at": None,
        "deleted_by": None,
    }).eq("id", outlet_id).execute()

    org_id = outlet.data.get("org_id")
    if org_id:
        log_activity(org_id, get_db_user_id(user), "outlet", outlet_id, "outlet_restored", {
            "name": outlet.data.get("name"),
        })

    # Audit to sheets
    try:
        from services.sheets_service import write_deletion_audit_row
        write_deletion_audit_row(
            action="restore",
            entity_type="outlet",
            entity_id=outlet_id,
            title=outlet.data.get("name") or "",
            outlet_id=outlet_id,
            outlet_name=outlet.data.get("name") or "",
            brand=outlet.data.get("brand_name") or "",
            deleted_by=(user.email if user else "") or "",
            org_id=org_id or "",
        )
    except Exception:
        pass

    return {"restored": True, "outlet_id": outlet_id}


@router.delete("/outlets/{outlet_id}/forever", dependencies=[Depends(require_permission("manage_org_settings"))])
def delete_outlet_forever(outlet_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """
    Permanently delete an outlet and all its downstream data. Only works
    on outlets already in the recycle bin (deleted_at IS NOT NULL) so this
    can't bypass the soft-delete safety. Cascades across agreements,
    documents, events, payments, alerts, obligations, rent_schedules,
    agreement_clauses, outlet_contacts, outlet_revenue, showcase_tokens.
    """
    outlet = supabase.table("outlets").select("*").eq("id", outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    caller_org = get_org_filter(user)
    org_id = outlet.data.get("org_id")
    if caller_org and org_id and org_id != caller_org:
        raise HTTPException(status_code=404, detail="Outlet not found")
    if not outlet.data.get("deleted_at"):
        raise HTTPException(
            status_code=400,
            detail="Outlet must be in the recycle bin before permanent deletion",
        )

    # Grab agreements first so we can cascade their children by agreement_id
    agreements_rows = supabase.table("agreements").select("id").eq("outlet_id", outlet_id).execute()
    agreement_ids = [r["id"] for r in (agreements_rows.data or [])]

    # Cascade delete everything that hangs off the outlet. Order matters
    # for FK direction: delete leaves first, then branches, then outlet.
    try:
        # Leaf tables that reference agreement_id
        if agreement_ids:
            for table in (
                "rent_schedules", "agreement_clauses", "critical_dates",
                "payment_records", "obligations", "alerts",
            ):
                try:
                    supabase.table(table).delete().in_("agreement_id", agreement_ids).execute()
                except Exception as e:
                    import logging
                    logging.getLogger(__name__).warning(
                        "delete_outlet_forever: %s by agreement_ids failed: %s", table, e
                    )
        # Leaf tables that reference outlet_id directly
        for table in (
            "payment_records", "obligations", "alerts", "critical_dates",
            "outlet_contacts", "outlet_revenue", "showcase_tokens",
            "documents",
        ):
            try:
                supabase.table(table).delete().eq("outlet_id", outlet_id).execute()
            except Exception as e:
                import logging
                logging.getLogger(__name__).warning(
                    "delete_outlet_forever: %s by outlet_id failed: %s", table, e
                )
        # Agreements themselves
        supabase.table("agreements").delete().eq("outlet_id", outlet_id).execute()
        # Finally the outlet row
        supabase.table("outlets").delete().eq("id", outlet_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Permanent delete failed: {str(e)[:200]}")

    if org_id:
        log_activity(org_id, get_db_user_id(user), "outlet", outlet_id, "outlet_deleted_forever", {
            "name": outlet.data.get("name"),
            "agreements_cascaded": len(agreement_ids),
        })

    # Audit to sheets (unified audit tab)
    try:
        from services.sheets_service import write_deletion_audit_row
        display_name = None
        if user:
            display_name = user.email or "Demo user"
        write_deletion_audit_row(
            action="delete_forever",
            entity_type="outlet",
            entity_id=outlet_id,
            title=outlet.data.get("name") or "",
            outlet_id=outlet_id,
            outlet_name=outlet.data.get("name") or "",
            brand=outlet.data.get("brand_name") or "",
            status_before=outlet.data.get("status") or "",
            deleted_by=display_name or "Unknown",
            org_id=org_id or "",
            notes=f"Cascaded {len(agreement_ids)} agreement(s) + all events/payments/obligations/alerts",
        )
    except Exception:
        pass

    return {"deleted_forever": True, "outlet_id": outlet_id, "cascaded_agreements": len(agreement_ids)}
