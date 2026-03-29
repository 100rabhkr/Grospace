"""
Lease Events Engine — full lifecycle event management.
Handles critical dates, notice windows, escalation triggers, task assignment,
India-specific compliance events (TDS, GST RCM, registration, deposit top-up).
"""

import uuid
import logging
from datetime import date, timedelta
from typing import Optional

from fastapi import APIRouter, HTTPException, Depends, Query
from pydantic import BaseModel

from core.config import supabase
from core.dependencies import require_permission
from services.extraction import get_val, get_num, get_section

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["events"])


# ============================================
# MODELS
# ============================================

class EventCreate(BaseModel):
    agreement_id: str
    date_value: str
    label: str
    event_type: str = "custom"
    date_type: str = "custom"
    priority: str = "medium"
    notes: Optional[str] = None
    assigned_to: Optional[str] = None
    amount: Optional[float] = None
    is_recurring: bool = False
    recurrence_frequency: Optional[str] = None
    alert_days: Optional[list[int]] = None


class EventUpdate(BaseModel):
    label: Optional[str] = None
    date_value: Optional[str] = None
    status: Optional[str] = None
    task_status: Optional[str] = None
    priority: Optional[str] = None
    assigned_to: Optional[str] = None
    escalated_to: Optional[str] = None
    notes: Optional[str] = None
    amount: Optional[float] = None


# ============================================
# LIST / READ
# ============================================

@router.get(
    "/agreements/{agreement_id}/events",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def list_events(agreement_id: str):
    """List all events for an agreement with live days_remaining."""
    result = (
        supabase.table("critical_dates")
        .select("*, agreement_clauses(category, summary)")
        .eq("agreement_id", agreement_id)
        .order("date_value", desc=False)
        .execute()
    )
    today = date.today()
    entries = result.data or []
    for entry in entries:
        d = entry.get("date_value")
        if d:
            days = (date.fromisoformat(d) - today).days
            entry["days_remaining"] = days
            # Auto-mark overdue
            if days < 0 and entry.get("task_status") == "pending":
                entry["task_status"] = "overdue"
    return {"events": entries, "count": len(entries)}


@router.get(
    "/events/upcoming",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def list_upcoming_events(
    days: int = Query(90, description="Look-ahead window in days"),
    event_type: Optional[str] = None,
    priority: Optional[str] = None,
):
    """List all upcoming events across the portfolio within N days."""
    today = date.today()
    cutoff = (today + timedelta(days=days)).isoformat()

    query = (
        supabase.table("critical_dates")
        .select("*, agreements(lessor_name, lessee_name, brand_name), outlets(name, city)")
        .gte("date_value", today.isoformat())
        .lte("date_value", cutoff)
        .order("date_value", desc=False)
    )
    if event_type:
        query = query.eq("event_type", event_type)
    if priority:
        query = query.eq("priority", priority)

    result = query.execute()
    entries = result.data or []
    for entry in entries:
        d = entry.get("date_value")
        if d:
            entry["days_remaining"] = (date.fromisoformat(d) - today).days
    return {"events": entries, "count": len(entries)}


@router.get(
    "/events/overdue",
    dependencies=[Depends(require_permission("view_agreements"))],
)
def list_overdue_events():
    """List all overdue events (past date, not completed)."""
    today = date.today()
    result = (
        supabase.table("critical_dates")
        .select("*, agreements(lessor_name, lessee_name, brand_name), outlets(name, city)")
        .lt("date_value", today.isoformat())
        .in_("task_status", ["pending", "in_progress"])
        .order("date_value", desc=False)
        .execute()
    )
    entries = result.data or []
    for entry in entries:
        d = entry.get("date_value")
        if d:
            entry["days_remaining"] = (date.fromisoformat(d) - today).days
    return {"events": entries, "count": len(entries)}


# ============================================
# CREATE / UPDATE / DELETE
# ============================================

@router.post(
    "/events",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def create_event(body: EventCreate):
    """Create a new lease event manually."""
    # Get org_id and outlet_id from agreement
    agreement = (
        supabase.table("agreements")
        .select("org_id, outlet_id")
        .eq("id", body.agreement_id)
        .single()
        .execute()
    )
    if not agreement.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    entry = {
        "id": str(uuid.uuid4()),
        "agreement_id": body.agreement_id,
        "org_id": agreement.data["org_id"],
        "outlet_id": agreement.data.get("outlet_id"),
        "date_value": body.date_value,
        "date_type": body.date_type,
        "event_type": body.event_type,
        "label": body.label,
        "priority": body.priority,
        "status": "upcoming",
        "task_status": "pending",
        "notes": body.notes,
        "assigned_to": body.assigned_to,
        "amount": body.amount,
        "is_recurring": body.is_recurring,
        "recurrence_frequency": body.recurrence_frequency,
        "alert_days": body.alert_days or [180, 90, 60, 30, 14, 7],
    }

    result = supabase.table("critical_dates").insert(entry).execute()
    return {"event": result.data[0] if result.data else entry}


@router.patch(
    "/events/{event_id}",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def update_event(event_id: str, body: EventUpdate):
    """Update an event's status, assignment, or details."""
    updates = body.model_dump(exclude_none=True)
    if not updates:
        raise HTTPException(status_code=400, detail="No fields to update")

    updates["updated_at"] = "now()"

    # Mark completion timestamp
    if updates.get("task_status") == "completed":
        updates["completed_at"] = "now()"

    result = (
        supabase.table("critical_dates")
        .update(updates)
        .eq("id", event_id)
        .execute()
    )
    if not result.data:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"event": result.data[0]}


@router.delete(
    "/events/{event_id}",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def delete_event(event_id: str):
    """Delete an event."""
    result = supabase.table("critical_dates").delete().eq("id", event_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Event not found")
    return {"deleted": True}


# ============================================
# ASSIGNMENT
# ============================================

@router.post(
    "/events/{event_id}/assign",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def assign_event(event_id: str, user_id: str, role: str = "assignee"):
    """Assign a user to an event."""
    entry = {
        "id": str(uuid.uuid4()),
        "event_id": event_id,
        "user_id": user_id,
        "role": role,
    }
    try:
        supabase.table("event_assignees").insert(entry).execute()
    except Exception:
        raise HTTPException(status_code=409, detail="User already assigned")

    # Also set primary assigned_to on the event
    if role == "assignee":
        supabase.table("critical_dates").update(
            {"assigned_to": user_id, "task_status": "in_progress", "updated_at": "now()"}
        ).eq("id", event_id).execute()

    return {"assigned": True}


# ============================================
# ESCALATION CHECK (called by cron or manually)
# ============================================

@router.post(
    "/events/check-escalations",
    dependencies=[Depends(require_permission("manage_org_settings"))],
)
def check_escalations():
    """
    Scan all pending events and escalate overdue ones.
    Should be called daily by a cron job.
    """
    today = date.today()

    # Find pending events past their date
    overdue = (
        supabase.table("critical_dates")
        .select("id, date_value, task_status, assigned_to, escalation_after_days, priority")
        .in_("task_status", ["pending", "in_progress"])
        .lt("date_value", today.isoformat())
        .execute()
    )

    escalated = 0
    marked_overdue = 0

    for event in (overdue.data or []):
        event_date = date.fromisoformat(event["date_value"])
        days_overdue = (today - event_date).days
        esc_days = event.get("escalation_after_days") or 7

        if event["task_status"] == "pending":
            # Mark as overdue
            supabase.table("critical_dates").update(
                {"task_status": "overdue", "updated_at": "now()"}
            ).eq("id", event["id"]).execute()
            marked_overdue += 1

        if days_overdue >= esc_days and event["task_status"] != "escalated":
            # Escalate
            supabase.table("critical_dates").update(
                {"task_status": "escalated", "priority": "critical", "updated_at": "now()"}
            ).eq("id", event["id"]).execute()
            escalated += 1

    # Generate recurring events (TDS, GST RCM, etc.)
    recurring = (
        supabase.table("critical_dates")
        .select("*")
        .eq("is_recurring", True)
        .lte("next_occurrence", today.isoformat())
        .execute()
    )

    generated = 0
    for event in (recurring.data or []):
        freq = event.get("recurrence_frequency")
        if not freq:
            continue

        # Calculate next occurrence
        if freq == "monthly":
            delta = timedelta(days=30)
        elif freq == "quarterly":
            delta = timedelta(days=90)
        else:
            delta = timedelta(days=365)

        next_date = date.fromisoformat(event["next_occurrence"]) + delta

        # Create new event instance
        new_event = {
            "id": str(uuid.uuid4()),
            "agreement_id": event["agreement_id"],
            "org_id": event["org_id"],
            "outlet_id": event.get("outlet_id"),
            "date_type": event["date_type"],
            "event_type": event.get("event_type", "custom"),
            "date_value": next_date.isoformat(),
            "label": event["label"],
            "priority": event.get("priority", "medium"),
            "status": "upcoming",
            "task_status": "pending",
            "amount": event.get("amount"),
            "alert_days": event.get("alert_days", [30, 14, 7]),
        }
        try:
            supabase.table("critical_dates").insert(new_event).execute()
            # Update next_occurrence on the template
            supabase.table("critical_dates").update(
                {"next_occurrence": next_date.isoformat()}
            ).eq("id", event["id"]).execute()
            generated += 1
        except Exception as e:
            logger.error(f"Failed to generate recurring event: {e}")

    return {
        "marked_overdue": marked_overdue,
        "escalated": escalated,
        "recurring_generated": generated,
    }


# ============================================
# INDIA-SPECIFIC EVENT GENERATORS
# ============================================

@router.post(
    "/agreements/{agreement_id}/events/generate-india",
    dependencies=[Depends(require_permission("edit_agreements"))],
)
def generate_india_events(agreement_id: str):
    """
    Generate India-specific compliance events for an agreement:
    - Registration deadline (T+60 from signing)
    - Security deposit top-up on escalation
    - TDS filing reminders (monthly)
    - GST RCM triggers (if landlord unregistered)
    """
    agreement = (
        supabase.table("agreements")
        .select("*")
        .eq("id", agreement_id)
        .single()
        .execute()
    )
    if not agreement.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    agr = agreement.data
    org_id = agr["org_id"]
    outlet_id = agr.get("outlet_id")
    events = []
    today = date.today()

    # 1. Registration deadline (60 days from signing/commencement)
    commencement = agr.get("lease_commencement_date")
    if commencement:
        reg_deadline = date.fromisoformat(commencement) + timedelta(days=60)
        if reg_deadline >= today:
            events.append({
                "date_type": "registration_due",
                "event_type": "registration_deadline",
                "date_value": reg_deadline.isoformat(),
                "label": "Lease registration deadline (60 days from commencement)",
                "priority": "high",
                "alert_days": [30, 14, 7, 3],
            })

    # 2. Security deposit top-up on escalation dates
    monthly_rent = agr.get("monthly_rent") or 0
    deposit_months = agr.get("security_deposit_months") or 6
    extracted = agr.get("extracted_data") or {}
    rent_section = extracted.get("rent") if isinstance(extracted, dict) else {}
    if isinstance(rent_section, dict):
        esc_pct = get_num(rent_section.get("escalation_percentage"))
        esc_freq = get_num(rent_section.get("escalation_frequency_years")) or 1

        if esc_pct and esc_pct > 0 and commencement and monthly_rent > 0:
            from dateutil.relativedelta import relativedelta
            base_date = date.fromisoformat(commencement)
            expiry = agr.get("lease_expiry_date")
            for i in range(1, 10):
                esc_date = base_date + relativedelta(years=int(esc_freq * i))
                if expiry and esc_date > date.fromisoformat(expiry):
                    break
                if esc_date < today:
                    continue
                # Calculate top-up amount
                new_rent = monthly_rent * ((1 + esc_pct / 100) ** i)
                old_deposit = monthly_rent * deposit_months
                new_deposit = new_rent * deposit_months
                topup = round(new_deposit - old_deposit, 2)

                if topup > 0:
                    events.append({
                        "date_type": "custom",
                        "event_type": "security_deposit_topup",
                        "date_value": esc_date.isoformat(),
                        "label": f"Security deposit top-up due (Year {int(esc_freq * i) + 1} escalation)",
                        "priority": "medium",
                        "amount": topup,
                        "amount_formula": f"New deposit ({deposit_months} months × ₹{new_rent:,.0f}) - Old deposit",
                        "alert_days": [60, 30, 14],
                    })

    # 3. TDS filing reminders (monthly recurring)
    if monthly_rent * 12 > 240000:
        events.append({
            "date_type": "custom",
            "event_type": "tds_filing",
            "date_value": (today.replace(day=7) + timedelta(days=30)).isoformat(),
            "label": "TDS on rent — Form 26QC filing due (7th of month)",
            "priority": "medium",
            "is_recurring": True,
            "recurrence_frequency": "monthly",
            "next_occurrence": (today.replace(day=7) + timedelta(days=30)).isoformat(),
            "amount": round(monthly_rent * 0.10, 2),
            "alert_days": [7, 3, 1],
        })

    # 4. GST RCM trigger (if landlord might be unregistered)
    landlord_gstin = agr.get("landlord_gstin")
    if not landlord_gstin and monthly_rent > 0:
        events.append({
            "date_type": "custom",
            "event_type": "gst_rcm",
            "date_value": (today.replace(day=20) + timedelta(days=30)).isoformat(),
            "label": "GST RCM liability — landlord unregistered, tenant must self-assess",
            "priority": "high",
            "is_recurring": True,
            "recurrence_frequency": "monthly",
            "next_occurrence": (today.replace(day=20) + timedelta(days=30)).isoformat(),
            "amount": round(monthly_rent * 0.18, 2),
            "alert_days": [7, 3],
        })

    # Insert all events
    if events:
        entries = []
        for e in events:
            entry = {
                "id": str(uuid.uuid4()),
                "agreement_id": agreement_id,
                "org_id": org_id,
                "outlet_id": outlet_id,
                "status": "upcoming",
                "task_status": "pending",
                **e,
            }
            entries.append(entry)

        try:
            supabase.table("critical_dates").insert(entries).execute()
        except Exception as ex:
            logger.error(f"Failed to create India events: {ex}")

    return {"events_created": len(events), "events": events}


# ============================================
# AUTO-POPULATE FROM EXTRACTION
# ============================================

def populate_critical_dates_from_extraction(
    agreement_id: str,
    org_id: str,
    outlet_id: str | None,
    extraction: dict,
):
    """
    Auto-generate critical dates from extracted lease data.
    Called during confirm-and-activate.
    """
    lease_term = get_section(extraction, "lease_term")
    rent = get_section(extraction, "rent")
    deposits = get_section(extraction, "deposits")

    if not lease_term:
        return []

    dates_to_create = []
    today = date.today()

    # 1. Lease expiry
    expiry = get_val(lease_term.get("lease_expiry_date"))
    if isinstance(expiry, str) and expiry != "not_found":
        try:
            exp_date = date.fromisoformat(expiry)
            dates_to_create.append({
                "date_type": "lease_expiry",
                "event_type": "lease_expiry",
                "date_value": expiry,
                "label": "Lease expiry date",
                "priority": "critical",
            })

            # 2. Notice deadline
            notice_months = get_num(lease_term.get("notice_period_months"))
            if notice_months and notice_months > 0:
                notice_date = exp_date - timedelta(days=int(notice_months * 30))
                dates_to_create.append({
                    "date_type": "notice_deadline",
                    "event_type": "notice_deadline",
                    "date_value": notice_date.isoformat(),
                    "label": f"Last day to give notice ({int(notice_months)} months before expiry)",
                    "priority": "critical",
                })

                # Renewal window
                dates_to_create.append({
                    "date_type": "custom",
                    "event_type": "renewal_option",
                    "date_value": notice_date.isoformat(),
                    "label": f"Renewal decision window opens ({int(notice_months)} months before expiry)",
                    "priority": "high",
                })

            # 3. Security deposit refund
            refund_days = get_num(deposits.get("security_deposit_refund_days") if deposits else None)
            if refund_days and refund_days > 0:
                refund_date = exp_date + timedelta(days=int(refund_days))
                dates_to_create.append({
                    "date_type": "security_deposit_refund",
                    "event_type": "custom",
                    "date_value": refund_date.isoformat(),
                    "label": f"Security deposit refund due ({int(refund_days)} days after expiry)",
                    "priority": "medium",
                })
        except (ValueError, TypeError):
            pass

    # 4. Lock-in end
    lock_in_months = get_num(lease_term.get("lock_in_months"))
    commencement = get_val(lease_term.get("lease_commencement_date"))
    if lock_in_months and commencement and isinstance(commencement, str) and commencement != "not_found":
        try:
            from dateutil.relativedelta import relativedelta
            comm_date = date.fromisoformat(commencement)
            lock_in_end = comm_date + relativedelta(months=int(lock_in_months))
            dates_to_create.append({
                "date_type": "lock_in_end",
                "event_type": "lock_in_end",
                "date_value": lock_in_end.isoformat(),
                "label": f"Lock-in period ends ({int(lock_in_months)} months)",
                "priority": "high",
            })
        except (ValueError, ImportError):
            pass

    # 5. Rent commencement
    rent_comm = get_val(lease_term.get("rent_commencement_date"))
    if rent_comm and isinstance(rent_comm, str) and rent_comm != "not_found":
        try:
            date.fromisoformat(rent_comm)
            dates_to_create.append({
                "date_type": "rent_commencement",
                "event_type": "rent_commencement",
                "date_value": rent_comm,
                "label": "Rent commencement date",
                "priority": "medium",
            })
        except ValueError:
            pass

    # 6. Fit-out end
    fit_out_days = get_num(lease_term.get("fit_out_period_days"))
    if fit_out_days and commencement and isinstance(commencement, str) and commencement != "not_found":
        try:
            comm_date = date.fromisoformat(commencement)
            fit_out_end = comm_date + timedelta(days=int(fit_out_days))
            dates_to_create.append({
                "date_type": "fit_out_end",
                "event_type": "fit_out_end",
                "date_value": fit_out_end.isoformat(),
                "label": f"Fit-out period ends ({int(fit_out_days)} days)",
                "priority": "medium",
            })
        except ValueError:
            pass

    # 7. Escalation dates
    if rent and commencement and isinstance(commencement, str) and commencement != "not_found":
        esc_pct = get_num(rent.get("escalation_percentage"))
        esc_freq = get_num(rent.get("escalation_frequency_years")) or 1
        if esc_pct and esc_pct > 0:
            try:
                from dateutil.relativedelta import relativedelta
                comm_date = date.fromisoformat(commencement)
                for i in range(1, 10):
                    esc_date = comm_date + relativedelta(years=int(esc_freq * i))
                    if expiry and isinstance(expiry, str):
                        if esc_date > date.fromisoformat(expiry):
                            break
                    dates_to_create.append({
                        "date_type": "escalation_due",
                        "event_type": "rent_escalation",
                        "date_value": esc_date.isoformat(),
                        "label": f"Rent escalation {esc_pct}% (Year {int(esc_freq * i) + 1})",
                        "priority": "medium",
                    })
            except (ValueError, ImportError):
                pass

    # 8. Registration deadline (India-specific: 60 days)
    if commencement and isinstance(commencement, str) and commencement != "not_found":
        try:
            comm_date = date.fromisoformat(commencement)
            reg_date = comm_date + timedelta(days=60)
            dates_to_create.append({
                "date_type": "registration_due",
                "event_type": "registration_deadline",
                "date_value": reg_date.isoformat(),
                "label": "Lease registration deadline (60 days from commencement)",
                "priority": "high",
            })
        except ValueError:
            pass

    # Insert all dates
    if not dates_to_create:
        return []

    entries = []
    for d in dates_to_create:
        entry = {
            "id": str(uuid.uuid4()),
            "agreement_id": agreement_id,
            "org_id": org_id,
            "outlet_id": outlet_id,
            "status": "upcoming" if d["date_value"] >= today.isoformat() else "expired",
            "task_status": "pending",
            "alert_days": [180, 90, 60, 30, 14, 7],
            **d,
        }
        entries.append(entry)

    try:
        supabase.table("critical_dates").insert(entries).execute()
        logger.info(f"Created {len(entries)} events for agreement {agreement_id}")
    except Exception as e:
        logger.error(f"Failed to create events: {e}")

    return entries
