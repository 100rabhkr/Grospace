"""
Alerts CRUD, notification, reminder endpoints.
"""

from typing import Optional
from datetime import datetime, date, timedelta

from fastapi import APIRouter, HTTPException, Depends, Query

from core.config import supabase, log_activity
from core.models import (
    CurrentUser, SnoozeRequest, AssignRequest,
    CreateReminderRequest, UpdateReminderRequest,
)
from core.dependencies import get_current_user, require_permission
from services.email_service import dispatch_notification

router = APIRouter(prefix="/api", tags=["alerts"])


@router.get("/alerts", dependencies=[Depends(require_permission("view_alerts"))])
def list_alerts(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List all alerts (paginated)."""
    offset = (page - 1) * page_size
    count_result = supabase.table("alerts").select("id", count="exact").execute()
    total = count_result.count or 0
    result = supabase.table("alerts").select(
        "*, outlets(name, city), agreements(type, document_filename)"
    ).order("trigger_date").range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@router.patch("/alerts/{alert_id}/acknowledge", dependencies=[Depends(require_permission("acknowledge_alerts"))])
def acknowledge_alert(
    alert_id: str,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Mark an alert as acknowledged."""
    update_data: dict = {
        "status": "acknowledged",
        "acknowledged_at": datetime.utcnow().isoformat(),
    }
    if user:
        update_data["acknowledged_by"] = user.user_id

    result = supabase.table("alerts").update(update_data).eq("id", alert_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"alert": result.data[0]}


@router.patch("/alerts/{alert_id}/snooze", dependencies=[Depends(require_permission("acknowledge_alerts"))])
def snooze_alert(
    alert_id: str,
    req: SnoozeRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Snooze an alert for a specified number of days."""
    snoozed_until = (date.today() + timedelta(days=req.days)).isoformat()
    update_data: dict = {
        "status": "snoozed",
        "snoozed_until": snoozed_until,
    }

    result = supabase.table("alerts").update(update_data).eq("id", alert_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"alert": result.data[0]}


@router.patch("/alerts/{alert_id}/assign", dependencies=[Depends(require_permission("assign_alerts"))])
def assign_alert(
    alert_id: str,
    req: AssignRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Assign an alert to a user."""
    update_data: dict = {"assigned_to": req.user_id}

    result = supabase.table("alerts").update(update_data).eq("id", alert_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Alert not found")

    return {"alert": result.data[0]}


# ============================================
# CUSTOM REMINDERS CRUD
# ============================================

@router.post("/reminders", dependencies=[Depends(require_permission("view_alerts"))])
def create_reminder(
    req: CreateReminderRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Create a custom reminder (alert with type='custom')."""
    valid_severities = {"high", "medium", "low", "info"}
    if req.severity not in valid_severities:
        raise HTTPException(status_code=400, detail="Invalid severity")

    org_id = None
    if user and user.org_id:
        org_id = user.org_id
    elif req.outlet_id:
        outlet = supabase.table("outlets").select("org_id").eq("id", req.outlet_id).single().execute()
        if outlet.data:
            org_id = outlet.data["org_id"]

    if not org_id:
        orgs = supabase.table("organizations").select("id").limit(1).execute()
        org_id = orgs.data[0]["id"] if orgs.data else None

    if not org_id:
        raise HTTPException(status_code=400, detail="Could not determine organization")

    alert_data: dict = {
        "org_id": org_id,
        "type": "custom",
        "title": req.title,
        "message": req.message,
        "trigger_date": req.trigger_date,
        "severity": req.severity,
        "status": "pending",
    }
    if req.outlet_id:
        alert_data["outlet_id"] = req.outlet_id
    if req.agreement_id:
        alert_data["agreement_id"] = req.agreement_id

    result = supabase.table("alerts").insert(alert_data).execute()

    if result.data and org_id:
        try:
            dispatch_notification(org_id, result.data[0])
        except Exception:
            pass

    if result.data and org_id:
        reminder = result.data[0]
        entity_type = "outlet" if req.outlet_id else "agreement" if req.agreement_id else "organization"
        entity_id = req.outlet_id or req.agreement_id or org_id
        log_activity(org_id, user.user_id if user else None, entity_type, entity_id, "reminder_created", {
            "reminder_id": reminder.get("id"),
            "title": req.title,
            "trigger_date": req.trigger_date,
        })

    return {"reminder": result.data[0] if result.data else None}


@router.patch("/reminders/{reminder_id}", dependencies=[Depends(require_permission("view_alerts"))])
def update_reminder(reminder_id: str, req: UpdateReminderRequest):
    """Update a custom reminder. Only type='custom' alerts can be edited."""
    existing = supabase.table("alerts").select("type, org_id, outlet_id").eq("id", reminder_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if existing.data.get("type") != "custom":
        raise HTTPException(status_code=403, detail="Only custom reminders can be edited")

    update_data: dict = {}
    if req.title is not None:
        update_data["title"] = req.title
    if req.message is not None:
        update_data["message"] = req.message
    if req.trigger_date is not None:
        update_data["trigger_date"] = req.trigger_date
    if req.severity is not None:
        update_data["severity"] = req.severity
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("alerts").update(update_data).eq("id", reminder_id).execute()

    org_id = existing.data.get("org_id")
    if org_id:
        entity_id = existing.data.get("outlet_id") or org_id
        entity_type = "outlet" if existing.data.get("outlet_id") else "organization"
        log_activity(org_id, None, entity_type, entity_id, "reminder_updated", {
            "reminder_id": reminder_id,
            "updated_fields": list(update_data.keys()),
        })

    return {"reminder": result.data[0] if result.data else None}


@router.delete("/reminders/{reminder_id}", dependencies=[Depends(require_permission("view_alerts"))])
def delete_reminder(reminder_id: str):
    """Delete a custom reminder. Only type='custom' alerts can be deleted."""
    existing = supabase.table("alerts").select("type").eq("id", reminder_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Reminder not found")
    if existing.data.get("type") != "custom":
        raise HTTPException(status_code=403, detail="Only custom reminders can be deleted")

    supabase.table("alerts").delete().eq("id", reminder_id).execute()
    return {"deleted": True}


# ============================================
# ACTIVITY LOG ENDPOINT
# ============================================

@router.get("/activity-log", dependencies=[Depends(require_permission("view_reports"))])
def get_activity_log(
    entity_type: str = Query(...),
    entity_id: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
):
    """Get activity log for a specific entity."""
    result = supabase.table("activity_log").select(
        "id, action, details, created_at, user_id, profiles(full_name, email)"
    ).eq("entity_type", entity_type).eq("entity_id", entity_id).order(
        "created_at", desc=True
    ).limit(limit).execute()

    items = []
    for row in result.data:
        profile = row.get("profiles") or {}
        items.append({
            "id": row["id"],
            "action": row["action"],
            "details": row.get("details") or {},
            "created_at": row["created_at"],
            "user_name": profile.get("full_name") or profile.get("email") or "System",
        })

    return {"items": items}
