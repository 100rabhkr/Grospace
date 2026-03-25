"""
Revenue tracking endpoints: monthly revenue per outlet, CSV upload, org-wide summary.
"""

import csv
import io
from typing import Optional
from datetime import datetime

from fastapi import APIRouter, HTTPException, Depends, Query, UploadFile, File
from difflib import SequenceMatcher

from core.config import supabase, log_activity
from core.models import CurrentUser, UpsertRevenueRequest
from core.dependencies import get_current_user, get_org_filter, require_permission

router = APIRouter(prefix="/api", tags=["revenue"])


@router.post("/outlets/{outlet_id}/revenue", dependencies=[Depends(require_permission("edit_outlets"))])
def upsert_revenue(
    outlet_id: str,
    req: UpsertRevenueRequest,
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Upsert monthly revenue for an outlet (insert or update on conflict)."""
    # Verify outlet exists and get org_id
    outlet = supabase.table("outlets").select("id, org_id").eq("id", outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    org_id = outlet.data.get("org_id")
    if not org_id:
        raise HTTPException(status_code=400, detail="Outlet has no org_id")

    total = req.total_revenue
    if total is None and req.dine_in_revenue is not None and req.delivery_revenue is not None:
        total = req.dine_in_revenue + req.delivery_revenue

    # Check if record exists
    existing = supabase.table("outlet_revenue").select("id").eq(
        "outlet_id", outlet_id
    ).eq("month", req.month).eq("year", req.year).execute()

    data = {
        "outlet_id": outlet_id,
        "org_id": org_id,
        "month": req.month,
        "year": req.year,
        "dine_in_revenue": req.dine_in_revenue,
        "delivery_revenue": req.delivery_revenue,
        "total_revenue": total,
        "source": req.source or "manual",
        "notes": req.notes,
        "updated_at": datetime.utcnow().isoformat(),
    }
    clean = {k: v for k, v in data.items() if v is not None}

    if existing.data:
        result = supabase.table("outlet_revenue").update(clean).eq(
            "id", existing.data[0]["id"]
        ).execute()
    else:
        result = supabase.table("outlet_revenue").insert(clean).execute()

    if org_id:
        log_activity(org_id, user.user_id if user else None, "outlet", outlet_id, "revenue_recorded", {
            "month": req.month,
            "year": req.year,
            "total_revenue": total,
        })

    return {"revenue": result.data[0] if result.data else clean}


@router.get("/outlets/{outlet_id}/revenue", dependencies=[Depends(require_permission("view_outlets"))])
def list_revenue(
    outlet_id: str,
    start_month: Optional[int] = Query(None, ge=1, le=12),
    start_year: Optional[int] = Query(None, ge=2020, le=2100),
    end_month: Optional[int] = Query(None, ge=1, le=12),
    end_year: Optional[int] = Query(None, ge=2020, le=2100),
):
    """List revenue records for an outlet with optional date range filter."""
    query = supabase.table("outlet_revenue").select("*").eq("outlet_id", outlet_id)

    if start_year:
        if start_month:
            # Filter: (year > start_year) OR (year = start_year AND month >= start_month)
            query = query.or_(
                f"year.gt.{start_year},and(year.eq.{start_year},month.gte.{start_month})"
            )
        else:
            query = query.gte("year", start_year)

    if end_year:
        if end_month:
            query = query.or_(
                f"year.lt.{end_year},and(year.eq.{end_year},month.lte.{end_month})"
            )
        else:
            query = query.lte("year", end_year)

    result = query.order("year", desc=True).order("month", desc=True).execute()
    return {"items": result.data or []}


@router.post("/revenue/upload-csv", dependencies=[Depends(require_permission("edit_outlets"))])
async def upload_revenue_csv(
    file: UploadFile = File(...),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Parse a CSV file of revenue data, fuzzy-match outlet names, and import."""
    if not file.filename or not file.filename.lower().endswith(".csv"):
        raise HTTPException(status_code=400, detail="Only CSV files are supported")

    file_bytes = await file.read()
    try:
        text = file_bytes.decode("utf-8-sig")
    except UnicodeDecodeError:
        text = file_bytes.decode("latin-1")

    reader = csv.DictReader(io.StringIO(text))
    if not reader.fieldnames:
        raise HTTPException(status_code=400, detail="Empty or invalid CSV file")

    # Normalize headers
    normalized_headers = [h.strip().lower().replace(" ", "_") for h in reader.fieldnames]
    _ = normalized_headers  # used for format detection

    # Fetch all outlets for fuzzy matching
    org_id = get_org_filter(user)
    outlet_query = supabase.table("outlets").select("id, name, org_id")
    if org_id:
        outlet_query = outlet_query.eq("org_id", org_id)
    outlets_result = outlet_query.execute()
    outlets = outlets_result.data or []

    # Build name -> outlet map
    outlet_map = {}
    for o in outlets:
        outlet_map[o["name"].lower().strip()] = o

    imported = 0
    skipped = 0
    errors = []

    for row_num, row in enumerate(reader, start=2):
        # Normalize row keys
        norm_row = {}
        for k, v in row.items():
            norm_row[k.strip().lower().replace(" ", "_")] = (v or "").strip()

        outlet_name = norm_row.get("outlet", "") or norm_row.get("outlet_name", "")
        if not outlet_name:
            errors.append({"row": row_num, "error": "Missing outlet name"})
            continue

        # Fuzzy match outlet
        matched_outlet = _fuzzy_match_outlet(outlet_name, outlet_map)
        if not matched_outlet:
            errors.append({"row": row_num, "error": f"No matching outlet for '{outlet_name}'"})
            skipped += 1
            continue

        try:
            month = int(norm_row.get("month", "0"))
            year = int(norm_row.get("year", "0"))
            if month < 1 or month > 12 or year < 2020 or year > 2100:
                raise ValueError("Invalid month/year")
        except (ValueError, TypeError):
            errors.append({"row": row_num, "error": "Invalid month or year"})
            skipped += 1
            continue

        dine_in = _parse_number(norm_row.get("dine_in") or norm_row.get("dine_in_revenue"))
        delivery = _parse_number(norm_row.get("delivery") or norm_row.get("delivery_revenue"))
        total = _parse_number(norm_row.get("revenue") or norm_row.get("total_revenue") or norm_row.get("total"))

        if total is None and dine_in is not None and delivery is not None:
            total = dine_in + delivery
        elif total is None and dine_in is None and delivery is None:
            errors.append({"row": row_num, "error": "No revenue data found"})
            skipped += 1
            continue

        outlet_id = matched_outlet["id"]
        o_org_id = matched_outlet.get("org_id")

        # Check for existing record
        existing = supabase.table("outlet_revenue").select("id").eq(
            "outlet_id", outlet_id
        ).eq("month", month).eq("year", year).execute()

        data = {
            "outlet_id": outlet_id,
            "org_id": o_org_id,
            "month": month,
            "year": year,
            "source": "csv",
            "updated_at": datetime.utcnow().isoformat(),
        }
        if dine_in is not None:
            data["dine_in_revenue"] = dine_in
        if delivery is not None:
            data["delivery_revenue"] = delivery
        if total is not None:
            data["total_revenue"] = total

        try:
            if existing.data:
                supabase.table("outlet_revenue").update(data).eq("id", existing.data[0]["id"]).execute()
            else:
                supabase.table("outlet_revenue").insert(data).execute()
            imported += 1
        except Exception as e:
            errors.append({"row": row_num, "error": str(e)})
            skipped += 1

    return {"imported": imported, "skipped": skipped, "errors": errors[:50]}


@router.get("/revenue/summary", dependencies=[Depends(require_permission("view_outlets"))])
def revenue_summary(
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Org-wide revenue totals by month for the dashboard."""
    org_id = get_org_filter(user)

    query = supabase.table("outlet_revenue").select("month, year, total_revenue, dine_in_revenue, delivery_revenue")
    if org_id:
        query = query.eq("org_id", org_id)

    result = query.order("year").order("month").execute()
    rows = result.data or []

    # Aggregate by (year, month)
    monthly: dict = {}
    for r in rows:
        key = f"{r['year']}-{r['month']:02d}" if r.get('month') else None
        if not key:
            continue
        if key not in monthly:
            monthly[key] = {"month": r["month"], "year": r["year"], "total_revenue": 0, "dine_in_revenue": 0, "delivery_revenue": 0, "outlet_count": 0}
        monthly[key]["total_revenue"] += float(r.get("total_revenue") or 0)
        monthly[key]["dine_in_revenue"] += float(r.get("dine_in_revenue") or 0)
        monthly[key]["delivery_revenue"] += float(r.get("delivery_revenue") or 0)
        monthly[key]["outlet_count"] += 1

    # Sort by year-month
    summary = sorted(monthly.values(), key=lambda x: (x["year"], x["month"]))

    return {"summary": summary}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _fuzzy_match_outlet(name: str, outlet_map: dict, threshold: float = 0.7) -> dict | None:
    """Fuzzy match an outlet name against the outlet map."""
    name_lower = name.lower().strip()

    # Exact match first
    if name_lower in outlet_map:
        return outlet_map[name_lower]

    # Fuzzy match
    best_match = None
    best_ratio = 0
    for key, outlet in outlet_map.items():
        ratio = SequenceMatcher(None, name_lower, key).ratio()
        if ratio > best_ratio and ratio >= threshold:
            best_ratio = ratio
            best_match = outlet

    return best_match


def _parse_number(val: str | None) -> float | None:
    """Parse a numeric string, handling commas and currency symbols."""
    if not val:
        return None
    val = val.strip().replace(",", "").replace("₹", "").replace("$", "").replace(" ", "")
    try:
        return float(val)
    except (ValueError, TypeError):
        return None
