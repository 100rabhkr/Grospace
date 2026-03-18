"""Outlet contacts CRUD."""
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel
from typing import Optional
import uuid

from core.config import supabase
from core.dependencies import get_current_user, get_org_filter
from core.models import CurrentUser

router = APIRouter(prefix="/api", tags=["contacts"])


class ContactCreate(BaseModel):
    name: str
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


class ContactUpdate(BaseModel):
    name: Optional[str] = None
    designation: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    notes: Optional[str] = None


@router.get("/outlets/{outlet_id}/contacts")
async def list_contacts(outlet_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """List all contacts for an outlet."""
    result = supabase.table("outlet_contacts").select("*").eq("outlet_id", outlet_id).order("created_at").execute()
    return {"contacts": result.data}


@router.post("/outlets/{outlet_id}/contacts")
async def add_contact(outlet_id: str, req: ContactCreate, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Add a contact to an outlet."""
    org_id = get_org_filter(user)
    if not org_id:
        outlet = supabase.table("outlets").select("org_id").eq("id", outlet_id).single().execute()
        org_id = outlet.data.get("org_id") if outlet.data else None

    data = {
        "id": str(uuid.uuid4()),
        "outlet_id": outlet_id,
        "org_id": org_id or outlet_id,
        "name": req.name,
        "designation": req.designation,
        "phone": req.phone,
        "email": req.email,
        "notes": req.notes,
    }
    result = supabase.table("outlet_contacts").insert(data).execute()
    return {"contact": result.data[0] if result.data else data}


@router.patch("/contacts/{contact_id}")
async def update_contact(contact_id: str, req: ContactUpdate, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Update a contact."""
    updates = {k: v for k, v in req.model_dump().items() if v is not None}
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")
    result = supabase.table("outlet_contacts").update(updates).eq("id", contact_id).execute()
    return {"contact": result.data[0] if result.data else {}}


@router.delete("/contacts/{contact_id}")
async def delete_contact(contact_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Delete a contact."""
    supabase.table("outlet_contacts").delete().eq("id", contact_id).execute()
    return {"ok": True}
