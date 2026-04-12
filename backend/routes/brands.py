"""
Brands CRUD — org-scoped first-class entity. Per the locked flow, brands
are created once per organization and outlets pick from the curated list
instead of carrying freeform brand text.
"""

import logging
import uuid
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel

from core.config import supabase, log_activity
from core.models import CurrentUser
from core.dependencies import (
    get_current_user, get_db_user_id, get_org_filter, require_permission,
)

router = APIRouter(prefix="/api", tags=["brands"])
logger = logging.getLogger(__name__)


class CreateBrandRequest(BaseModel):
    name: str
    logo_url: Optional[str] = None
    notes: Optional[str] = None


class UpdateBrandRequest(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    notes: Optional[str] = None


@router.get("/brands", dependencies=[Depends(require_permission("view_outlets"))])
def list_brands(user: Optional[CurrentUser] = Depends(get_current_user)):
    """
    List brands visible to the caller. Platform admin sees all.

    If the brands table hasn't been provisioned yet (migration_030 not run),
    transparently fall back to deriving distinct brand names from
    outlets.brand_name so the UI has something to show. No scary warning.
    """
    try:
        query = supabase.table("brands").select("*").order("name")
        org_id = get_org_filter(user)
        if org_id:
            query = query.eq("org_id", org_id)
        result = query.execute()
        return {"brands": result.data or []}
    except Exception as e:
        logger.info("list_brands: brands table unavailable, falling back to outlets.brand_name: %s", str(e)[:120])
        # Derive brands from outlets — inline fallback so the Settings UI
        # doesn't look broken. Read-only (no CRUD) until migration applied.
        try:
            outlets_query = supabase.table("outlets").select("brand_name, org_id")
            org_id = get_org_filter(user)
            if org_id:
                outlets_query = outlets_query.eq("org_id", org_id)
            outlets_result = outlets_query.execute()
            seen: dict[str, dict] = {}
            for row in (outlets_result.data or []):
                bn = (row.get("brand_name") or "").strip()
                if not bn:
                    continue
                key = bn.lower()
                if key not in seen:
                    seen[key] = {
                        "id": f"derived:{key}",
                        "org_id": row.get("org_id"),
                        "name": bn,
                        "notes": "Derived from existing outlets (brands table pending)",
                        "logo_url": None,
                        "derived": True,
                    }
            return {"brands": sorted(seen.values(), key=lambda b: b["name"].lower())}
        except Exception:
            return {"brands": []}


@router.post("/brands", dependencies=[Depends(require_permission("manage_org_settings"))])
def create_brand(
    req: CreateBrandRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Create a brand under the caller's org."""
    if not user:
        raise HTTPException(status_code=401, detail="Authentication required")

    clean_name = (req.name or "").strip()
    if not clean_name:
        raise HTTPException(status_code=400, detail="Brand name is required")

    org_id = user.org_id
    if not org_id:
        # Platform admin creating a brand without being attached to an org
        # is ambiguous — ask them to pass it explicitly via a different path.
        raise HTTPException(
            status_code=400,
            detail="Caller is not attached to any organization",
        )

    row = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "name": clean_name,
        "logo_url": req.logo_url,
        "notes": req.notes,
        "created_by": get_db_user_id(user),
    }
    clean = {k: v for k, v in row.items() if v is not None}

    try:
        result = supabase.table("brands").insert(clean).execute()
    except Exception as e:
        # Catch the unique constraint violation and surface a friendly error
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(
                status_code=409,
                detail=f"A brand named '{clean_name}' already exists in your organization",
            )
        raise HTTPException(status_code=500, detail=f"Failed to create brand: {str(e)[:200]}")

    log_activity(org_id, get_db_user_id(user), "brand", row["id"], "brand_created", {
        "name": clean_name,
    })

    return {"brand": result.data[0] if result.data else clean}


@router.patch("/brands/{brand_id}", dependencies=[Depends(require_permission("manage_org_settings"))])
def update_brand(
    brand_id: str,
    req: UpdateBrandRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Update a brand. Org-scoped — cannot touch another org's brands."""
    existing = supabase.table("brands").select("id, org_id, name").eq("id", brand_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Brand not found")

    caller_org = get_org_filter(user)
    if caller_org and existing.data.get("org_id") != caller_org:
        raise HTTPException(status_code=404, detail="Brand not found")

    update_data: dict = {}
    if req.name is not None:
        clean_name = req.name.strip()
        if not clean_name:
            raise HTTPException(status_code=400, detail="Brand name cannot be empty")
        update_data["name"] = clean_name
    if req.logo_url is not None:
        update_data["logo_url"] = req.logo_url
    if req.notes is not None:
        update_data["notes"] = req.notes

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    try:
        result = supabase.table("brands").update(update_data).eq("id", brand_id).execute()
    except Exception as e:
        if "unique" in str(e).lower() or "duplicate" in str(e).lower():
            raise HTTPException(status_code=409, detail="Another brand with this name already exists")
        raise HTTPException(status_code=500, detail=f"Failed to update brand: {str(e)[:200]}")

    if not result.data:
        raise HTTPException(status_code=404, detail="Brand not found")

    # If the name changed, cascade the new name to denormalized brand_name
    # columns on outlets + agreements so existing filters stay accurate.
    if "name" in update_data:
        try:
            supabase.table("outlets").update({"brand_name": update_data["name"]}).eq("brand_id", brand_id).execute()
            supabase.table("agreements").update({"brand_name": update_data["name"]}).eq("brand_id", brand_id).execute()
        except Exception as e:
            logger.warning("update_brand: failed to cascade name to outlets/agreements: %s", e)

    org_id = existing.data.get("org_id")
    if org_id:
        log_activity(org_id, get_db_user_id(user), "brand", brand_id, "brand_updated", {
            "fields": list(update_data.keys()),
        })

    return {"brand": result.data[0]}


@router.delete("/brands/{brand_id}", dependencies=[Depends(require_permission("manage_org_settings"))])
def delete_brand(
    brand_id: str,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """
    Delete a brand. Outlets/agreements that reference it have their
    brand_id cleared (ON DELETE SET NULL in the FK) but their brand_name
    text column is preserved so historical reports still read.
    """
    existing = supabase.table("brands").select("id, org_id, name").eq("id", brand_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Brand not found")

    caller_org = get_org_filter(user)
    if caller_org and existing.data.get("org_id") != caller_org:
        raise HTTPException(status_code=404, detail="Brand not found")

    try:
        supabase.table("brands").delete().eq("id", brand_id).execute()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete brand: {str(e)[:200]}")

    org_id = existing.data.get("org_id")
    if org_id:
        log_activity(org_id, get_db_user_id(user), "brand", brand_id, "brand_deleted", {
            "name": existing.data.get("name"),
        })

    return {"deleted": True}
