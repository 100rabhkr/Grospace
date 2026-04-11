"""
Payment obligations, mark-paid, bulk-paid endpoints.
"""

import uuid
from typing import Optional
from datetime import datetime, date, timedelta, timezone
from dateutil.relativedelta import relativedelta

from fastapi import APIRouter, HTTPException, Depends, Query
from starlette.requests import Request

from core.config import supabase, limiter
from core.models import (
    CurrentUser, PaymentUpdateRequest, GeneratePaymentsRequest,
    BulkMarkPaidRequest, MGLRRequest, CreateObligationRequest, UpdateObligationRequest,
)
from core.dependencies import get_current_user, get_org_filter, require_permission
from services.extraction_fields import get_num

router = APIRouter(prefix="/api", tags=["payments"])


@router.get("/payments", dependencies=[Depends(require_permission("view_payments"))])
def list_payments(
    outlet_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    period_year: Optional[int] = Query(None),
    period_month: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List payment records with optional filters (paginated)."""
    offset = (page - 1) * page_size

    count_query = supabase.table("payment_records").select("id", count="exact")
    data_query = supabase.table("payment_records").select(
        "*, obligations(type, frequency, amount, custom_label, source), outlets(name, city, brand_name, company_name)"
    )

    org_id = get_org_filter(user)
    if org_id:
        count_query = count_query.eq("org_id", org_id)
        data_query = data_query.eq("org_id", org_id)
    if outlet_id:
        count_query = count_query.eq("outlet_id", outlet_id)
        data_query = data_query.eq("outlet_id", outlet_id)
    if status:
        count_query = count_query.eq("status", status)
        data_query = data_query.eq("status", status)
    if period_year:
        count_query = count_query.eq("period_year", period_year)
        data_query = data_query.eq("period_year", period_year)
    if period_month:
        count_query = count_query.eq("period_month", period_month)
        data_query = data_query.eq("period_month", period_month)

    count_result = count_query.execute()
    total = count_result.count or 0
    result = data_query.order("due_date", desc=True).range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@router.patch("/payments/{payment_id}", dependencies=[Depends(require_permission("update_payments"))])
def update_payment(
    payment_id: str,
    req: PaymentUpdateRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Update a payment record (mark paid, overdue, etc.)."""
    valid_statuses = {"paid", "partially_paid", "overdue", "upcoming", "due"}
    if req.status not in valid_statuses:
        raise HTTPException(status_code=400, detail=f"Invalid status. Must be one of: {', '.join(valid_statuses)}")

    update_data: dict = {"status": req.status}
    if req.status == "paid":
        update_data["paid_at"] = datetime.now(timezone.utc).isoformat()
    if req.paid_amount is not None:
        update_data["paid_amount"] = req.paid_amount
    if req.notes is not None:
        update_data["notes"] = req.notes
    if user:
        update_data["marked_by"] = user.user_id

    result = supabase.table("payment_records").update(update_data).eq("id", payment_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Payment record not found")

    return {"payment": result.data[0]}


@router.get("/obligations", dependencies=[Depends(require_permission("view_payments"))])
def list_obligations(
    outlet_id: Optional[str] = Query(None),
    active_only: bool = Query(True),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=500),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List obligations with optional filters (paginated)."""
    offset = (page - 1) * page_size

    count_query = supabase.table("obligations").select("id", count="exact")
    data_query = supabase.table("obligations").select(
        "*, outlets(name, city), agreements(type, document_filename, brand_name)"
    )

    org_id = get_org_filter(user)
    if org_id:
        count_query = count_query.eq("org_id", org_id)
        data_query = data_query.eq("org_id", org_id)
    if outlet_id:
        count_query = count_query.eq("outlet_id", outlet_id)
        data_query = data_query.eq("outlet_id", outlet_id)
    if active_only:
        count_query = count_query.eq("is_active", True)
        data_query = data_query.eq("is_active", True)

    count_result = count_query.execute()
    total = count_result.count or 0
    result = data_query.order("type").range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@router.post("/payments/generate", dependencies=[Depends(require_permission("update_payments"))])
def generate_payment_records(
    req: GeneratePaymentsRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Generate payment records from active recurring obligations for upcoming months."""
    query = supabase.table("obligations").select("*").eq("is_active", True).neq("frequency", "one_time")

    org_id = get_org_filter(user)
    if org_id:
        query = query.eq("org_id", org_id)

    obligations = query.execute()
    today = date.today()
    created_count = 0

    for obl in obligations.data:
        due_day = obl.get("due_day_of_month") or 1
        start_date = obl.get("start_date")
        end_date = obl.get("end_date")

        for m_offset in range(req.months_ahead):
            target = today + relativedelta(months=m_offset)
            period_month = target.month
            period_year = target.year

            if start_date and f"{period_year}-{period_month:02d}" < start_date[:7]:
                continue
            if end_date and f"{period_year}-{period_month:02d}" > end_date[:7]:
                continue

            existing = supabase.table("payment_records").select("id").eq(
                "obligation_id", obl["id"]
            ).eq("period_month", period_month).eq("period_year", period_year).execute()

            if existing.data:
                continue

            actual_day = min(due_day, 28)
            due_date_val = date(period_year, period_month, actual_day)

            if due_date_val < today:
                p_status = "overdue"
            elif due_date_val <= today + timedelta(days=7):
                p_status = "due"
            else:
                p_status = "upcoming"

            payment_data = {
                "id": str(uuid.uuid4()),
                "org_id": obl["org_id"],
                "obligation_id": obl["id"],
                "outlet_id": obl["outlet_id"],
                "period_month": period_month,
                "period_year": period_year,
                "due_date": due_date_val.isoformat(),
                "due_amount": obl.get("amount"),
                "status": p_status,
            }
            clean = {k: v for k, v in payment_data.items() if v is not None}
            supabase.table("payment_records").insert(clean).execute()
            created_count += 1

    return {"created": created_count, "message": f"Generated {created_count} payment records."}


@router.post("/payments/bulk-mark-paid", dependencies=[Depends(require_permission("update_payments"))])
def bulk_mark_paid(body: BulkMarkPaidRequest):
    """Bulk mark payments as paid -- by IDs or by month/year."""
    updated = 0

    now_iso = datetime.now(timezone.utc).isoformat()

    if body.payment_ids:
        # Batch update: single UPDATE for all matching IDs
        result = (
            supabase.table("payment_records")
            .update({"status": "paid", "paid_at": now_iso})
            .in_("id", body.payment_ids)
            .in_("status", ["pending", "due", "overdue", "upcoming"])
            .execute()
        )
        updated = len(result.data) if result.data else 0
    elif body.month and body.year:
        # Fetch IDs first (needed for org_id scoping), then batch update
        query = (
            supabase.table("payment_records")
            .select("id")
            .eq("period_month", body.month)
            .eq("period_year", body.year)
            .in_("status", ["pending", "due", "overdue", "upcoming"])
        )
        if body.org_id:
            query = query.eq("org_id", body.org_id)
        ids = [r["id"] for r in (query.execute().data or [])]
        if ids:
            result = (
                supabase.table("payment_records")
                .update({"status": "paid", "paid_at": now_iso})
                .in_("id", ids)
                .execute()
            )
            updated = len(result.data) if result.data else 0

    return {"status": "ok", "updated_count": updated}


@router.post("/payments/mark-all-paid", dependencies=[Depends(require_permission("update_payments"))])
@limiter.limit("5/minute")
async def mark_all_paid(request: Request):
    """Mark all pending/upcoming obligations for a given month as paid."""
    body = await request.json()
    month_str = body.get("month")  # e.g., "2026-03"
    org_id = body.get("org_id")
    if not month_str:
        raise HTTPException(status_code=400, detail="month is required (YYYY-MM)")

    try:
        year, month = month_str.split("-")
        m = int(month)
        y = int(year)
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")

    query = supabase.table("payment_records").select("id, due_amount").eq(
        "period_month", m
    ).eq("period_year", y).in_(
        "status", ["upcoming", "pending", "due", "overdue"]
    )
    if org_id:
        query = query.eq("org_id", org_id)
    result = query.execute()

    now_iso = datetime.now(timezone.utc).isoformat()
    ids = [r["id"] for r in (result.data or [])]
    marked = 0
    if ids:
        update_result = (
            supabase.table("payment_records")
            .update({"status": "paid", "paid_at": now_iso})
            .in_("id", ids)
            .execute()
        )
        marked = len(update_result.data) if update_result.data else 0

    return {"status": "ok", "marked_paid": marked, "month": month_str}


@router.post("/calculate-mglr", dependencies=[Depends(require_permission("view_payments"))])
def calculate_mglr(body: MGLRRequest):
    """Calculate hybrid MGLR rent for an outlet based on revenue."""
    agreements = supabase.table("agreements").select("*").eq("outlet_id", body.outlet_id).eq("status", "active").execute().data or []
    if not agreements:
        raise HTTPException(status_code=404, detail="No active agreement found for this outlet")

    agreement = agreements[0]
    ed = agreement.get("extracted_data") or {}
    rent = ed.get("rent", {})
    rent_model = rent.get("rent_model", "fixed")

    if rent_model != "hybrid_mglr":
        return {"rent_model": rent_model, "message": "Not a hybrid MGLR agreement", "payable_rent": agreement.get("monthly_rent", 0)}

    schedule = rent.get("rent_schedule", [])
    first = schedule[0] if schedule else {}
    mglr = get_num(first.get("mglr_monthly")) or get_num(first.get("monthly_rent")) or 0
    rev_share_pct = get_num(first.get("revenue_share_pct")) or get_num(rent.get("revenue_share_pct")) or 0

    total_revenue = body.dine_in_revenue + body.delivery_revenue
    revenue_share = total_revenue * (rev_share_pct / 100) if rev_share_pct > 0 else 0
    payable_rent = max(mglr, revenue_share)

    return {
        "rent_model": "hybrid_mglr",
        "mglr": mglr,
        "revenue_share_pct": rev_share_pct,
        "total_revenue": total_revenue,
        "revenue_share_amount": round(revenue_share, 2),
        "payable_rent": round(payable_rent, 2),
        "higher_of": "revenue_share" if revenue_share > mglr else "mglr",
    }


# ============================================
# CUSTOM OBLIGATIONS
# ============================================

@router.post("/outlets/{outlet_id}/obligations", dependencies=[Depends(require_permission("update_payments"))])
def create_obligation(
    outlet_id: str,
    req: CreateObligationRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Create a custom (manual) obligation for an outlet."""
    outlet = supabase.table("outlets").select("id, org_id").eq("id", outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    org_id = outlet.data.get("org_id")

    valid_types = {"rent", "cam", "electricity", "water", "hvac", "insurance", "property_tax", "custom"}
    if req.type not in valid_types:
        raise HTTPException(status_code=400, detail=f"Invalid type. Must be one of: {', '.join(valid_types)}")

    if req.type == "custom" and not req.custom_label:
        raise HTTPException(status_code=400, detail="custom_label is required when type is 'custom'")

    valid_frequencies = {"monthly", "quarterly", "yearly", "one_time"}
    if req.frequency not in valid_frequencies:
        raise HTTPException(status_code=400, detail=f"Invalid frequency. Must be one of: {', '.join(valid_frequencies)}")

    obl_data = {
        "id": str(uuid.uuid4()),
        "outlet_id": outlet_id,
        "org_id": org_id,
        "type": req.type,
        "custom_label": req.custom_label,
        "amount": req.amount,
        "frequency": req.frequency,
        "due_day_of_month": req.due_day,
        "start_date": req.start_date,
        "end_date": req.end_date,
        "notes": req.notes,
        "source": "manual",
        "is_active": True,
    }
    clean = {k: v for k, v in obl_data.items() if v is not None}

    result = supabase.table("obligations").insert(clean).execute()
    return {"obligation": result.data[0] if result.data else clean}


@router.patch("/obligations/{obligation_id}", dependencies=[Depends(require_permission("update_payments"))])
def update_obligation(
    obligation_id: str,
    req: UpdateObligationRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Update a manual obligation. Only source='manual' obligations can be edited."""
    existing = supabase.table("obligations").select("id, source").eq("id", obligation_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Obligation not found")

    if existing.data.get("source") != "manual":
        raise HTTPException(status_code=403, detail="Only manually created obligations can be edited")

    update_data: dict = {}
    if req.type is not None:
        update_data["type"] = req.type
    if req.custom_label is not None:
        update_data["custom_label"] = req.custom_label
    if req.amount is not None:
        update_data["amount"] = req.amount
    if req.frequency is not None:
        update_data["frequency"] = req.frequency
    if req.due_day is not None:
        update_data["due_day_of_month"] = req.due_day
    if req.start_date is not None:
        update_data["start_date"] = req.start_date
    if req.end_date is not None:
        update_data["end_date"] = req.end_date
    if req.notes is not None:
        update_data["notes"] = req.notes

    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("obligations").update(update_data).eq("id", obligation_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Obligation not found")

    return {"obligation": result.data[0]}


@router.delete("/obligations/{obligation_id}", dependencies=[Depends(require_permission("update_payments"))])
def delete_obligation(
    obligation_id: str,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Delete a manual obligation. Only source='manual' obligations can be deleted."""
    existing = supabase.table("obligations").select("id, source").eq("id", obligation_id).single().execute()
    if not existing.data:
        raise HTTPException(status_code=404, detail="Obligation not found")

    if existing.data.get("source") != "manual":
        raise HTTPException(status_code=403, detail="Only manually created obligations can be deleted")

    supabase.table("obligations").delete().eq("id", obligation_id).execute()
    return {"deleted": True}
