"""
Payment obligations, mark-paid, bulk-paid endpoints.
"""

from typing import Optional, List
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta

from fastapi import APIRouter, HTTPException, Depends, Query
from starlette.requests import Request

from core.config import supabase, limiter
from core.models import (
    CurrentUser, PaymentUpdateRequest, GeneratePaymentsRequest,
    BulkMarkPaidRequest, MGLRRequest,
)
from core.dependencies import get_current_user, get_org_filter, require_permission
from services.extraction import get_num, get_val

router = APIRouter(prefix="/api", tags=["payments"])


@router.get("/payments", dependencies=[Depends(require_permission("view_payments"))])
async def list_payments(
    outlet_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    period_year: Optional[int] = Query(None),
    period_month: Optional[int] = Query(None),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List payment records with optional filters (paginated)."""
    offset = (page - 1) * page_size

    count_query = supabase.table("payment_records").select("id", count="exact")
    data_query = supabase.table("payment_records").select(
        "*, obligations(type, frequency, amount), outlets(name, city)"
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
async def update_payment(
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
        update_data["paid_at"] = datetime.utcnow().isoformat()
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
async def list_obligations(
    outlet_id: Optional[str] = Query(None),
    active_only: bool = Query(True),
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
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
async def generate_payment_records(
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
async def bulk_mark_paid(body: BulkMarkPaidRequest):
    """Bulk mark payments as paid -- by IDs or by month/year."""
    updated = 0

    if body.payment_ids:
        for pid in body.payment_ids:
            supabase.table("payment_records").update({
                "status": "paid",
                "paid_amount": supabase.table("payment_records").select("due_amount").eq("id", pid).single().execute().data.get("due_amount", 0),
            }).eq("id", pid).execute()
            updated += 1
    elif body.month and body.year:
        query = supabase.table("payment_records").select("id, due_amount").in_("status", ["pending", "due", "overdue", "upcoming"])
        if body.org_id:
            query = query.eq("org_id", body.org_id)
        payments = query.execute().data or []
        for p in payments:
            due_date_str = p.get("due_date", "")
            if due_date_str:
                try:
                    dd = date.fromisoformat(due_date_str)
                    if dd.month == body.month and dd.year == body.year:
                        supabase.table("payment_records").update({
                            "status": "paid",
                            "paid_amount": p.get("due_amount", 0),
                        }).eq("id", p["id"]).execute()
                        updated += 1
                except (ValueError, TypeError):
                    pass

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
        start = f"{year}-{month}-01"
        m = int(month)
        y = int(year)
        if m == 12:
            end = f"{y+1}-01-01"
        else:
            end = f"{y}-{m+1:02d}-01"
    except (ValueError, IndexError):
        raise HTTPException(status_code=400, detail="Invalid month format. Use YYYY-MM")

    query = supabase.table("obligations").select("id, type, amount, due_date").gte("due_date", start).lt("due_date", end).in_("status", ["upcoming", "pending", "due", "overdue"])
    if org_id:
        query = query.eq("org_id", org_id)
    result = query.execute()

    marked = 0
    for ob in (result.data or []):
        supabase.table("obligations").update({
            "status": "paid",
            "paid_amount": ob.get("amount"),
            "paid_date": date.today().isoformat(),
        }).eq("id", ob["id"]).execute()
        marked += 1

    return {"status": "ok", "marked_paid": marked, "month": month_str}


@router.post("/calculate-mglr", dependencies=[Depends(require_permission("view_payments"))])
async def calculate_mglr(body: MGLRRequest):
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
