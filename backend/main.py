"""
GroSpace AI Backend Service
FastAPI service for document processing, AI extraction, Q&A, and risk analysis.
Deployed on Railway.
"""

import os
import json
import uuid
import httpx
import fitz  # PyMuPDF
from io import BytesIO
from typing import Optional, List
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai
from supabase import create_client, Client

load_dotenv()

app = FastAPI(title="GroSpace AI Service", version="1.0.0")

# CORS - allow Vercel and localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Clients
supabase: Client = create_client(
    os.getenv("SUPABASE_URL", ""),
    os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
)

genai.configure(api_key=os.getenv("GEMINI_API_KEY", ""))
model = genai.GenerativeModel("gemini-2.5-pro")


# ============================================
# SCHEMAS
# ============================================

LEASE_EXTRACTION_SCHEMA = {
    "parties": {
        "lessor_name": "string",
        "lessor_address": "string",
        "lessee_name": "string",
        "lessee_address": "string",
        "lessee_cin": "string",
        "leasing_consultant": "string",
        "brand_name": "string",
    },
    "premises": {
        "property_name": "string",
        "full_address": "string",
        "city": "string",
        "state": "string",
        "pincode": "string",
        "property_type": "enum: mall/high_street/cloud_kitchen/metro/transit/cyber_park/hospital/college",
        "floor": "string",
        "unit_number": "string",
        "super_area_sqft": "number",
        "covered_area_sqft": "number",
        "carpet_area_sqft": "number",
        "loading_factor": "string",
    },
    "lease_term": {
        "loi_date": "date",
        "lease_term_years": "number",
        "lease_term_structure": "string",
        "renewal_terms": "string",
        "lock_in_months": "number",
        "notice_period_months": "number",
        "fit_out_period_days": "number",
        "fit_out_rent_free": "boolean",
        "lease_commencement_date": "date/formula",
        "rent_commencement_date": "date/formula",
        "lease_expiry_date": "date/calculated",
    },
    "rent": {
        "rent_model": "enum: fixed/revenue_share/hybrid_mglr/percentage_only",
        "rent_schedule": "json array of yearly rent details",
        "escalation_percentage": "number",
        "escalation_frequency_years": "number",
        "escalation_basis": "string",
        "mglr_payment_day": "number",
        "revenue_reconciliation_day": "number",
    },
    "charges": {
        "cam_rate_per_sqft": "number",
        "cam_area_basis": "enum: super_area/covered_area",
        "cam_monthly": "number",
        "cam_escalation_pct": "number",
        "hvac_rate_per_sqft": "number",
        "electricity_load_kw": "number",
        "electricity_metering": "enum: prepaid/actual/sub_meter",
        "operating_hours": "string",
    },
    "deposits": {
        "security_deposit_amount": "number",
        "security_deposit_months": "number",
        "security_deposit_basis": "string",
        "security_deposit_refund_days": "number",
        "cam_deposit_amount": "number",
        "utility_deposit_per_kw": "number",
    },
    "legal": {
        "usage_restriction": "string",
        "brand_change_allowed": "boolean",
        "structural_alterations_allowed": "boolean",
        "subletting_allowed": "boolean",
        "signage_approval_required": "boolean",
        "jurisdiction_city": "string",
        "arbitration": "boolean",
        "late_payment_interest_pct": "number",
        "tds_obligations": "boolean",
        "relocation_clause": "boolean",
    },
    "franchise": {
        "franchise_model": "enum: FOFO/FOCO/COCO/direct_lease",
        "profit_split": "string",
        "operator_entity": "string",
        "investor_entity": "string",
    },
}

LICENSE_EXTRACTION_SCHEMA = {
    "certificate_type": "enum: CTO/CTE/FSSAI/trade_license/fire_noc/liquor_license/health_license/signage_permit",
    "issuing_authority": "string",
    "certificate_number": "string",
    "consent_order_number": "string",
    "entity_name": "string",
    "entity_address": "string",
    "activity_category": "string",
    "compliance_category": "string",
    "date_of_issue": "date",
    "valid_from": "date",
    "valid_to": "date",
    "key_conditions_summary": "string (3-5 line AI summary)",
    "signatory_name": "string",
    "signatory_designation": "string",
}

RISK_FLAGS = [
    {"id": 1, "name": "No lessor lock-in", "condition": "Lessor can terminate but lessee is locked in", "severity": "high"},
    {"id": 2, "name": "High escalation", "condition": "Escalation > 15% per cycle", "severity": "high"},
    {"id": 3, "name": "No rent-free fit-out", "condition": "Fit-out period is 0 days or not mentioned", "severity": "medium"},
    {"id": 4, "name": "Excessive security deposit", "condition": "Deposit > 6 months of rent", "severity": "medium"},
    {"id": 5, "name": "Predatory late interest", "condition": "Late payment interest > 18% p.a.", "severity": "medium"},
    {"id": 6, "name": "Unilateral relocation", "condition": "Lessor can relocate lessee without consent", "severity": "high"},
    {"id": 7, "name": "No renewal option", "condition": "No renewal clause or at sole discretion of lessor", "severity": "medium"},
    {"id": 8, "name": "Uncapped revenue share", "condition": "Revenue share with no maximum cap", "severity": "medium"},
]


# ============================================
# REQUEST/RESPONSE MODELS
# ============================================

class ExtractRequest(BaseModel):
    file_url: str
    agreement_id: str

class ClassifyRequest(BaseModel):
    text: str

class QARequest(BaseModel):
    agreement_id: str
    question: str
    document_text: Optional[str] = None

class RiskFlagRequest(BaseModel):
    agreement_id: str
    extracted_data: dict
    document_text: Optional[str] = None


class ConfirmActivateRequest(BaseModel):
    """Request to confirm extraction and create outlet + agreement + obligations + alerts."""
    extraction: dict
    document_type: str
    risk_flags: list = []
    confidence: dict = {}
    filename: str
    org_id: Optional[str] = None  # If None, use/create demo org


class PaymentUpdateRequest(BaseModel):
    status: str  # paid, partially_paid, overdue, upcoming, due
    paid_amount: Optional[float] = None
    notes: Optional[str] = None


class GeneratePaymentsRequest(BaseModel):
    months_ahead: int = 3


class SnoozeRequest(BaseModel):
    days: int = 7


class AssignRequest(BaseModel):
    user_id: str


# ============================================
# AUTH MIDDLEWARE
# ============================================

class CurrentUser(BaseModel):
    user_id: str
    email: str
    role: str = "org_member"
    org_id: Optional[str] = None


async def get_current_user(authorization: Optional[str] = Header(None)) -> Optional[CurrentUser]:
    """Extract and validate user from Supabase JWT. Returns None if unauthenticated."""
    if not authorization or not authorization.startswith("Bearer "):
        return None

    token = authorization.split(" ", 1)[1]
    try:
        user_response = supabase.auth.get_user(token)
        user = user_response.user
        if not user:
            return None

        profile = supabase.table("profiles").select("role, org_id").eq("id", user.id).single().execute()
        return CurrentUser(
            user_id=user.id,
            email=user.email or "",
            role=profile.data.get("role", "org_member") if profile.data else "org_member",
            org_id=profile.data.get("org_id") if profile.data else None,
        )
    except Exception:
        return None


def get_org_filter(user: Optional[CurrentUser]) -> Optional[str]:
    """Get org_id filter. Platform admins see all, org users see their org only."""
    if not user:
        return None  # No auth — show all (backward compat for demo)
    if user.role == "platform_admin":
        return None  # Platform admins see everything
    return user.org_id


# ============================================
# HELPER FUNCTIONS
# ============================================

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from a PDF using PyMuPDF."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text


async def download_file(file_url: str) -> bytes:
    """Download a file from Supabase storage."""
    async with httpx.AsyncClient() as client:
        response = await client.get(file_url)
        response.raise_for_status()
        return response.content


async def classify_document(text: str) -> str:
    """Classify a document as lease_loi, license_certificate, or franchise_agreement."""
    prompt = (
        "Classify this document as one of: lease_loi, license_certificate, franchise_agreement. "
        "Return only the classification label, nothing else.\n\n"
        f"Document text (first 2000 characters):\n{text[:2000]}"
    )

    response = model.generate_content(prompt)
    label = response.text.strip().lower()
    valid = {"lease_loi", "license_certificate", "franchise_agreement"}
    return label if label in valid else "lease_loi"


async def extract_structured_data(text: str, doc_type: str) -> dict:
    """Extract structured data from document text using LLM."""
    schema = LEASE_EXTRACTION_SCHEMA if doc_type == "lease_loi" else LICENSE_EXTRACTION_SCHEMA

    prompt = (
        "You are a lease abstraction specialist for Indian commercial real estate. "
        "Extract the following fields from this lease/LOI document. "
        "Return valid JSON matching the schema below. "
        "For each field, also return a confidence score: 'high', 'medium', 'low', or 'not_found'. "
        "If a field's value is calculated from a formula (e.g., '60 days from handover'), "
        "return the formula as a string rather than guessing a date.\n\n"
        f"Schema:\n{json.dumps(schema, indent=2)}\n\n"
        f"Document text:\n{text}"
    )

    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=0,
        ),
    )

    return json.loads(response.text)


def calculate_confidence(extraction: dict) -> dict:
    """Calculate confidence scores for each field in the extraction."""
    confidence = {}
    for section_key, section_val in extraction.items():
        if isinstance(section_val, dict):
            for field_key, field_val in section_val.items():
                if field_key.endswith("_confidence"):
                    confidence[field_key.replace("_confidence", "")] = field_val
                elif field_val is None or field_val == "" or field_val == "not_found":
                    confidence[field_key] = "not_found"
                else:
                    confidence[field_key] = "high"
    return confidence


async def detect_risk_flags(text: str, extraction: dict) -> list:
    """Detect risk flags in a lease document."""
    prompt = (
        "You are a commercial lease risk analyst specializing in Indian F&B and retail leases. "
        "Analyze this lease for the following risk conditions and return flags for any that apply:\n\n"
        "1. No lessor lock-in: Lessor can terminate but lessee is locked\n"
        "2. High escalation: Escalation percentage > 15% per cycle\n"
        "3. No rent-free fit-out: No rent-free period mentioned\n"
        "4. Excessive security deposit: Deposit equivalent > 6 months rent\n"
        "5. Predatory late interest: Late payment interest > 18% p.a.\n"
        "6. Unilateral relocation: Lessor can relocate lessee without consent\n"
        "7. No renewal option: No renewal right for lessee\n"
        "8. Uncapped revenue share: Revenue share with no cap/maximum\n\n"
        "For each flag found, return a JSON object with a top-level key 'flags' containing an array of objects with: "
        "flag_id (1-8), severity ('high' or 'medium'), explanation (one-line summary), "
        "clause_text (relevant text from document)\n\n"
        f"Extracted lease data:\n{json.dumps(extraction, indent=2)}\n\n"
        f"Full document text:\n{text[:8000]}"
    )

    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=0,
        ),
    )

    result = json.loads(response.text)
    return result.get("flags", result.get("risk_flags", []))


# ============================================
# CONFIRM & ACTIVATE HELPERS
# ============================================

def get_val(field_data):
    """Extract the raw value from a Gemini field (handles {value, confidence} objects)."""
    if field_data is None:
        return None
    if isinstance(field_data, dict) and "value" in field_data:
        v = field_data["value"]
        if v in (None, "", "not_found", "N/A", "null"):
            return None
        return v
    if field_data in ("not_found", "N/A", "", "null"):
        return None
    return field_data


def get_num(field_data):
    """Extract a numeric value from a field."""
    v = get_val(field_data)
    if v is None:
        return None
    try:
        return float(v)
    except (ValueError, TypeError):
        return None


def get_date(field_data) -> Optional[str]:
    """Try to parse a date string from a field. Returns ISO date string or None."""
    v = get_val(field_data)
    if v is None:
        return None
    if isinstance(v, str):
        # Try common date formats
        for fmt in ("%Y-%m-%d", "%d-%m-%Y", "%d/%m/%Y", "%Y/%m/%d", "%d %b %Y", "%d %B %Y"):
            try:
                return datetime.strptime(v.strip(), fmt).date().isoformat()
            except (ValueError, AttributeError):
                continue
    return None


def get_section(extraction: dict, section_name: str) -> dict:
    """Get a section from extraction data, handling nested value objects."""
    section = extraction.get(section_name, {})
    if isinstance(section, dict) and "value" in section:
        section = section["value"] if isinstance(section["value"], dict) else {}
    return section if isinstance(section, dict) else {}


def get_or_create_demo_org() -> str:
    """Get or create the demo organization, returns org_id."""
    result = supabase.table("organizations").select("id").eq("name", "GroSpace Demo").limit(1).execute()
    if result.data and len(result.data) > 0:
        return result.data[0]["id"]

    # Create demo org
    new_org = supabase.table("organizations").insert({
        "name": "GroSpace Demo",
    }).execute()
    return new_org.data[0]["id"]


def create_outlet_from_extraction(extraction: dict, org_id: str) -> str:
    """Create an outlet from extracted premises data. Returns outlet_id."""
    premises = get_section(extraction, "premises")
    parties = get_section(extraction, "parties")
    franchise = get_section(extraction, "franchise")

    # Determine property type
    prop_type = get_val(premises.get("property_type"))
    valid_types = {"mall", "high_street", "cloud_kitchen", "metro", "transit", "cyber_park", "hospital", "college"}
    if prop_type and prop_type.lower() in valid_types:
        prop_type = prop_type.lower()
    else:
        prop_type = None

    # Franchise model
    fm = get_val(franchise.get("franchise_model"))
    valid_fm = {"FOFO", "FOCO", "COCO", "direct_lease"}
    if fm and fm.upper() in valid_fm:
        fm = fm.upper()
    else:
        fm = None

    outlet_data = {
        "org_id": org_id,
        "name": get_val(premises.get("property_name")) or get_val(parties.get("brand_name")) or "New Outlet",
        "brand_name": get_val(parties.get("brand_name")),
        "address": get_val(premises.get("full_address")),
        "city": get_val(premises.get("city")),
        "state": get_val(premises.get("state")),
        "pincode": get_val(premises.get("pincode")),
        "property_type": prop_type,
        "floor": get_val(premises.get("floor")),
        "unit_number": get_val(premises.get("unit_number")),
        "super_area_sqft": get_num(premises.get("super_area_sqft")),
        "covered_area_sqft": get_num(premises.get("covered_area_sqft")),
        "carpet_area_sqft": get_num(premises.get("carpet_area_sqft")),
        "franchise_model": fm,
        "status": "fit_out",
    }

    # Remove None values
    outlet_data = {k: v for k, v in outlet_data.items() if v is not None}
    result = supabase.table("outlets").insert(outlet_data).execute()
    return result.data[0]["id"]


def create_agreement_record(extraction: dict, doc_type: str, risk_flags: list, confidence: dict,
                            filename: str, org_id: str, outlet_id: str) -> str:
    """Create an agreement record. Returns agreement_id."""
    parties = get_section(extraction, "parties")
    lease_term = get_section(extraction, "lease_term")
    rent = get_section(extraction, "rent")
    charges = get_section(extraction, "charges")
    deposits = get_section(extraction, "deposits")
    legal = get_section(extraction, "legal")

    # Calculate monthly rent from rent_schedule or rent fields
    monthly_rent = None
    rent_per_sqft = None
    rent_schedule = get_val(rent.get("rent_schedule"))
    if isinstance(rent_schedule, list) and len(rent_schedule) > 0:
        first_year = rent_schedule[0]
        if isinstance(first_year, dict):
            monthly_rent = get_num(first_year.get("mglr_monthly")) or get_num(first_year.get("monthly_rent")) or get_num(first_year.get("rent"))
            rent_per_sqft = get_num(first_year.get("mglr_per_sqft")) or get_num(first_year.get("rent_per_sqft"))

    cam_monthly = get_num(charges.get("cam_monthly"))
    security_deposit = get_num(deposits.get("security_deposit_amount"))

    # Total monthly outflow
    total = (monthly_rent or 0) + (cam_monthly or 0)

    # Rent model
    rm = get_val(rent.get("rent_model"))
    valid_rm = {"fixed", "revenue_share", "hybrid_mglr", "percentage_only"}
    if rm and rm.lower() in valid_rm:
        rm = rm.lower()
    else:
        rm = None

    agreement_data = {
        "org_id": org_id,
        "outlet_id": outlet_id,
        "type": doc_type,
        "status": "active",
        "document_filename": filename,
        "extracted_data": extraction,
        "extraction_status": "confirmed",
        "extraction_confidence": confidence,
        "risk_flags": risk_flags,
        "lessor_name": get_val(parties.get("lessor_name")),
        "lessee_name": get_val(parties.get("lessee_name")),
        "brand_name": get_val(parties.get("brand_name")),
        "lease_commencement_date": get_date(lease_term.get("lease_commencement_date")),
        "rent_commencement_date": get_date(lease_term.get("rent_commencement_date")),
        "lease_expiry_date": get_date(lease_term.get("lease_expiry_date")),
        "rent_model": rm,
        "monthly_rent": monthly_rent,
        "rent_per_sqft": rent_per_sqft,
        "cam_monthly": cam_monthly,
        "total_monthly_outflow": total if total > 0 else None,
        "security_deposit": security_deposit,
        "late_payment_interest_pct": get_num(legal.get("late_payment_interest_pct")),
        "confirmed_at": datetime.utcnow().isoformat(),
    }

    # Compute lock_in_end_date from lock_in_months + commencement
    commencement = get_date(lease_term.get("lease_commencement_date"))
    lock_in_months = get_num(lease_term.get("lock_in_months"))
    if commencement and lock_in_months:
        try:
            comm_date = date.fromisoformat(commencement)
            lock_in_end = comm_date + relativedelta(months=int(lock_in_months))
            agreement_data["lock_in_end_date"] = lock_in_end.isoformat()
        except (ValueError, TypeError):
            pass

    # Remove None values
    agreement_data = {k: v for k, v in agreement_data.items() if v is not None}
    result = supabase.table("agreements").insert(agreement_data).execute()
    return result.data[0]["id"]


def generate_obligations(extraction: dict, agreement_id: str, outlet_id: str, org_id: str) -> list:
    """Auto-generate obligations from extracted data per PRD Section 4.4."""
    obligations = []
    lease_term = get_section(extraction, "lease_term")
    rent = get_section(extraction, "rent")
    charges = get_section(extraction, "charges")
    deposits = get_section(extraction, "deposits")
    premises = get_section(extraction, "premises")

    rent_comm = get_date(lease_term.get("rent_commencement_date"))
    lease_comm = get_date(lease_term.get("lease_commencement_date"))
    lease_expiry = get_date(lease_term.get("lease_expiry_date"))
    start_date = rent_comm or lease_comm
    end_date = lease_expiry

    # Escalation info
    esc_pct = get_num(rent.get("escalation_percentage"))
    esc_freq = get_num(rent.get("escalation_frequency_years"))
    next_esc = None
    if start_date and esc_freq:
        try:
            sd = date.fromisoformat(start_date)
            next_esc = (sd + relativedelta(years=int(esc_freq))).isoformat()
        except (ValueError, TypeError):
            pass

    payment_day = int(get_num(rent.get("mglr_payment_day")) or 7)

    # 1. Rent obligation (monthly)
    rent_schedule = get_val(rent.get("rent_schedule"))
    monthly_rent = None
    if isinstance(rent_schedule, list) and len(rent_schedule) > 0:
        first = rent_schedule[0]
        if isinstance(first, dict):
            monthly_rent = get_num(first.get("mglr_monthly")) or get_num(first.get("monthly_rent")) or get_num(first.get("rent"))

    if monthly_rent:
        obligations.append({
            "org_id": org_id,
            "agreement_id": agreement_id,
            "outlet_id": outlet_id,
            "type": "rent",
            "frequency": "monthly",
            "amount": monthly_rent,
            "due_day_of_month": payment_day,
            "start_date": start_date,
            "end_date": end_date,
            "escalation_pct": esc_pct,
            "escalation_frequency_years": int(esc_freq) if esc_freq else None,
            "next_escalation_date": next_esc,
            "is_active": True,
        })

    # 2. CAM obligation (monthly)
    cam_monthly = get_num(charges.get("cam_monthly"))
    if cam_monthly:
        cam_esc = get_num(charges.get("cam_escalation_pct"))
        obligations.append({
            "org_id": org_id,
            "agreement_id": agreement_id,
            "outlet_id": outlet_id,
            "type": "cam",
            "frequency": "monthly",
            "amount": cam_monthly,
            "due_day_of_month": payment_day,
            "start_date": lease_comm or start_date,
            "end_date": end_date,
            "escalation_pct": cam_esc,
            "is_active": True,
        })

    # 3. HVAC obligation (monthly) - calculated from rate * area
    hvac_rate = get_num(charges.get("hvac_rate_per_sqft"))
    if hvac_rate:
        area_basis = get_val(charges.get("hvac_area_basis")) or "covered_area"
        area = get_num(premises.get("covered_area_sqft")) or get_num(premises.get("super_area_sqft"))
        if area:
            hvac_monthly = hvac_rate * area
            obligations.append({
                "org_id": org_id,
                "agreement_id": agreement_id,
                "outlet_id": outlet_id,
                "type": "hvac",
                "frequency": "monthly",
                "amount": hvac_monthly,
                "amount_formula": f"{hvac_rate}/sqft x {area} sqft ({area_basis})",
                "due_day_of_month": payment_day,
                "start_date": lease_comm or start_date,
                "end_date": end_date,
                "is_active": True,
            })

    # 4. Electricity obligation (monthly - variable)
    elec_load = get_num(charges.get("electricity_load_kw"))
    if elec_load:
        obligations.append({
            "org_id": org_id,
            "agreement_id": agreement_id,
            "outlet_id": outlet_id,
            "type": "electricity",
            "frequency": "monthly",
            "amount": None,
            "amount_formula": f"Actual metered ({elec_load} KW load)",
            "due_day_of_month": payment_day,
            "start_date": lease_comm or start_date,
            "end_date": end_date,
            "is_active": True,
        })

    # 5. Security deposit (one-time)
    sec_dep = get_num(deposits.get("security_deposit_amount"))
    if sec_dep:
        obligations.append({
            "org_id": org_id,
            "agreement_id": agreement_id,
            "outlet_id": outlet_id,
            "type": "security_deposit",
            "frequency": "one_time",
            "amount": sec_dep,
            "start_date": lease_comm or start_date,
            "is_active": True,
        })

    # 6. CAM deposit (one-time)
    cam_dep = get_num(deposits.get("cam_deposit_amount"))
    if cam_dep:
        obligations.append({
            "org_id": org_id,
            "agreement_id": agreement_id,
            "outlet_id": outlet_id,
            "type": "cam_deposit",
            "frequency": "one_time",
            "amount": cam_dep,
            "start_date": lease_comm or start_date,
            "is_active": True,
        })

    # 7. Utility deposit (one-time)
    util_dep_per_kw = get_num(deposits.get("utility_deposit_per_kw"))
    if util_dep_per_kw and elec_load:
        obligations.append({
            "org_id": org_id,
            "agreement_id": agreement_id,
            "outlet_id": outlet_id,
            "type": "utility_deposit",
            "frequency": "one_time",
            "amount": util_dep_per_kw * elec_load,
            "amount_formula": f"{util_dep_per_kw}/KW x {elec_load} KW",
            "start_date": lease_comm or start_date,
            "is_active": True,
        })

    # Insert obligations, skipping None values
    created = []
    for obl in obligations:
        clean = {k: v for k, v in obl.items() if v is not None}
        result = supabase.table("obligations").insert(clean).execute()
        created.append(result.data[0])
    return created


def generate_alerts(extraction: dict, agreement_id: str, outlet_id: str, org_id: str) -> list:
    """Auto-generate alerts from extracted dates per PRD Section 4.6."""
    alerts = []
    lease_term = get_section(extraction, "lease_term")
    rent = get_section(extraction, "rent")

    lease_expiry = get_date(lease_term.get("lease_expiry_date"))
    lease_comm = get_date(lease_term.get("lease_commencement_date"))
    rent_comm = get_date(lease_term.get("rent_commencement_date"))
    lock_in_months = get_num(lease_term.get("lock_in_months"))
    esc_pct = get_num(rent.get("escalation_percentage"))
    esc_freq = get_num(rent.get("escalation_frequency_years"))

    # 1. Lease Expiry alerts at 180, 90, 30, 7 days before
    if lease_expiry:
        exp_date = date.fromisoformat(lease_expiry)
        for lead in [180, 90, 30, 7]:
            trigger = exp_date - timedelta(days=lead)
            if trigger >= date.today():
                alerts.append({
                    "org_id": org_id,
                    "outlet_id": outlet_id,
                    "agreement_id": agreement_id,
                    "type": "lease_expiry",
                    "severity": "high" if lead <= 30 else "medium",
                    "title": f"Lease expiry in {lead} days",
                    "message": f"Lease expires on {lease_expiry}. {lead} days remaining.",
                    "trigger_date": trigger.isoformat(),
                    "lead_days": lead,
                    "reference_date": lease_expiry,
                    "status": "pending",
                })

    # 2. Lock-in Expiry alerts at 90, 30 days before
    if lock_in_months and lease_comm:
        try:
            comm = date.fromisoformat(lease_comm)
            lock_end = comm + relativedelta(months=int(lock_in_months))
            for lead in [90, 30]:
                trigger = lock_end - timedelta(days=lead)
                if trigger >= date.today():
                    alerts.append({
                        "org_id": org_id,
                        "outlet_id": outlet_id,
                        "agreement_id": agreement_id,
                        "type": "lock_in_expiry",
                        "severity": "medium",
                        "title": f"Lock-in expires in {lead} days",
                        "message": f"Lock-in period ends on {lock_end.isoformat()}.",
                        "trigger_date": trigger.isoformat(),
                        "lead_days": lead,
                        "reference_date": lock_end.isoformat(),
                        "status": "pending",
                    })
        except (ValueError, TypeError):
            pass

    # 3. Escalation alerts at 90, 30, 7 days before
    if esc_pct and esc_freq and (rent_comm or lease_comm):
        try:
            base = date.fromisoformat(rent_comm or lease_comm)
            esc_date = base + relativedelta(years=int(esc_freq))
            # Generate for next upcoming escalation
            while esc_date < date.today():
                esc_date += relativedelta(years=int(esc_freq))
            for lead in [90, 30, 7]:
                trigger = esc_date - timedelta(days=lead)
                if trigger >= date.today():
                    alerts.append({
                        "org_id": org_id,
                        "outlet_id": outlet_id,
                        "agreement_id": agreement_id,
                        "type": "escalation",
                        "severity": "medium",
                        "title": f"Rent escalation in {lead} days",
                        "message": f"Rent escalation of {esc_pct}% due on {esc_date.isoformat()}.",
                        "trigger_date": trigger.isoformat(),
                        "lead_days": lead,
                        "reference_date": esc_date.isoformat(),
                        "status": "pending",
                    })
        except (ValueError, TypeError):
            pass

    # 4. Monthly rent due alerts (7 days before, for next 6 months)
    payment_day = int(get_num(rent.get("mglr_payment_day")) or 7)
    start = rent_comm or lease_comm
    if start:
        try:
            today = date.today()
            for m in range(6):
                due = date(today.year, today.month, min(payment_day, 28)) + relativedelta(months=m)
                trigger = due - timedelta(days=7)
                if trigger >= today:
                    alerts.append({
                        "org_id": org_id,
                        "outlet_id": outlet_id,
                        "agreement_id": agreement_id,
                        "type": "rent_due",
                        "severity": "medium",
                        "title": f"Rent due on {due.strftime('%d %b %Y')}",
                        "message": f"Monthly rent payment due on {due.isoformat()}.",
                        "trigger_date": trigger.isoformat(),
                        "lead_days": 7,
                        "reference_date": due.isoformat(),
                        "status": "pending",
                    })
        except (ValueError, TypeError):
            pass

    # Insert alerts
    created = []
    for alert in alerts:
        result = supabase.table("alerts").insert(alert).execute()
        created.append(result.data[0])
    return created


# ============================================
# API ENDPOINTS
# ============================================

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "grospace-ai", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/upload-and-extract")
async def upload_and_extract(file: UploadFile = File(...)):
    """Upload a PDF directly and extract structured data. No DB required."""
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(status_code=400, detail="Only PDF files are supported")

    try:
        pdf_bytes = await file.read()

        # Extract text from PDF
        text = extract_text_from_pdf(pdf_bytes)
        if len(text.strip()) < 100:
            raise HTTPException(status_code=400, detail="Could not extract text from PDF. It may be a scanned document.")

        # Classify document type
        doc_type = await classify_document(text)

        # Extract structured data
        extraction = await extract_structured_data(text, doc_type)

        # Calculate confidence scores
        confidence = calculate_confidence(extraction)

        # Detect risk flags (for leases)
        risk_flags = []
        if doc_type == "lease_loi":
            risk_flags = await detect_risk_flags(text, extraction)

        return {
            "status": "success",
            "document_type": doc_type,
            "extraction": extraction,
            "confidence": confidence,
            "risk_flags": risk_flags,
            "filename": file.filename,
            "text_length": len(text),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/classify")
async def classify_endpoint(req: ClassifyRequest):
    """Classify document type from text."""
    try:
        doc_type = await classify_document(req.text)
        return {"document_type": doc_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/extract")
async def extract_endpoint(req: ExtractRequest):
    """Process an uploaded document: download, extract text, classify, extract data, detect risks."""
    try:
        # 1. Download PDF from storage
        pdf_bytes = await download_file(req.file_url)

        # 2. Extract text
        text = extract_text_from_pdf(pdf_bytes)
        is_scanned = len(text.strip()) < 100

        if is_scanned:
            # For scanned PDFs, we'd use vision model. For now, return error.
            return {
                "status": "failed",
                "error": "Scanned PDF detected. Vision extraction not yet implemented.",
                "agreement_id": req.agreement_id,
            }

        # 3. Classify document type
        doc_type = await classify_document(text)

        # 4. Extract structured data
        extraction = await extract_structured_data(text, doc_type)

        # 5. Calculate confidence scores
        confidence = calculate_confidence(extraction)

        # 6. Detect risk flags (for leases)
        risk_flags = []
        if doc_type == "lease_loi":
            risk_flags = await detect_risk_flags(text, extraction)

        # 7. Update agreement record in Supabase
        supabase.table("agreements").update({
            "extracted_data": extraction,
            "extraction_confidence": confidence,
            "risk_flags": risk_flags,
            "extraction_status": "review",
            "type": doc_type,
        }).eq("id", req.agreement_id).execute()

        return {
            "status": "review",
            "agreement_id": req.agreement_id,
            "document_type": doc_type,
            "extraction": extraction,
            "confidence": confidence,
            "risk_flags": risk_flags,
        }

    except Exception as e:
        # Update status to failed
        supabase.table("agreements").update({
            "extraction_status": "failed",
        }).eq("id", req.agreement_id).execute()
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/qa")
async def qa_endpoint(req: QARequest):
    """Answer questions about a specific agreement document."""
    try:
        # Get document text if not provided
        document_text = req.document_text
        if not document_text:
            result = supabase.table("agreements").select("extracted_data, document_url").eq("id", req.agreement_id).single().execute()
            if result.data and result.data.get("document_url"):
                pdf_bytes = await download_file(result.data["document_url"])
                document_text = extract_text_from_pdf(pdf_bytes)

        if not document_text:
            raise HTTPException(status_code=404, detail="Document text not available")

        # Get extraction summary
        result = supabase.table("agreements").select("extracted_data").eq("id", req.agreement_id).single().execute()
        extraction_summary = json.dumps(result.data.get("extracted_data", {}), indent=2) if result.data else ""

        prompt = (
            "You are an AI assistant helping users understand their commercial lease documents. "
            "You have access to the full text of a specific lease/agreement document.\n\n"
            "Rules:\n"
            "- Only answer based on the document provided. Do not make assumptions.\n"
            "- Quote relevant clause text when answering.\n"
            "- If the answer is not in the document, say so clearly.\n"
            "- Keep answers concise but complete.\n"
            "- Use simple language, avoid unnecessary legal jargon.\n\n"
            f"Document text:\n{document_text[:12000]}\n\n"
            f"Extracted data summary:\n{extraction_summary[:4000]}\n\n"
            f"User question: {req.question}"
        )

        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.1,
                max_output_tokens=1000,
            ),
        )

        answer = response.text
        return {"answer": answer, "agreement_id": req.agreement_id}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/risk-flags")
async def risk_flags_endpoint(req: RiskFlagRequest):
    """Analyze document for risk flags."""
    try:
        document_text = req.document_text or ""
        if not document_text:
            result = supabase.table("agreements").select("document_url").eq("id", req.agreement_id).single().execute()
            if result.data and result.data.get("document_url"):
                pdf_bytes = await download_file(result.data["document_url"])
                document_text = extract_text_from_pdf(pdf_bytes)

        flags = await detect_risk_flags(document_text, req.extracted_data)

        # Update agreement
        supabase.table("agreements").update({
            "risk_flags": flags,
        }).eq("id", req.agreement_id).execute()

        return {"risk_flags": flags, "agreement_id": req.agreement_id}

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/confirm-and-activate")
async def confirm_and_activate(req: ConfirmActivateRequest):
    """
    Confirm extraction and create outlet + agreement + obligations + alerts.
    This is the core "Confirm & Activate" flow from PRD Journey 2 steps 7-12.
    """
    try:
        # 1. Get or create organization
        org_id = req.org_id
        if not org_id:
            org_id = get_or_create_demo_org()

        # 2. Create outlet from extracted premises data
        outlet_id = create_outlet_from_extraction(req.extraction, org_id)

        # 3. Create agreement record
        agreement_id = create_agreement_record(
            extraction=req.extraction,
            doc_type=req.document_type,
            risk_flags=req.risk_flags,
            confidence=req.confidence,
            filename=req.filename,
            org_id=org_id,
            outlet_id=outlet_id,
        )

        # 4. Auto-generate obligations
        obligations = generate_obligations(req.extraction, agreement_id, outlet_id, org_id)

        # 5. Schedule alerts
        alerts = generate_alerts(req.extraction, agreement_id, outlet_id, org_id)

        # 6. Log activity
        supabase.table("activity_log").insert({
            "org_id": org_id,
            "entity_type": "agreement",
            "entity_id": agreement_id,
            "action": "confirm_and_activate",
            "details": {
                "outlet_id": outlet_id,
                "document_type": req.document_type,
                "filename": req.filename,
                "obligations_created": len(obligations),
                "alerts_created": len(alerts),
                "risk_flags_count": len(req.risk_flags),
            }
        }).execute()

        return {
            "status": "activated",
            "agreement_id": agreement_id,
            "outlet_id": outlet_id,
            "obligations_created": len(obligations),
            "alerts_created": len(alerts),
            "message": f"Agreement activated. {len(obligations)} obligations and {len(alerts)} alerts created.",
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/api/organizations")
async def list_organizations():
    """List all organizations."""
    result = supabase.table("organizations").select("*").order("created_at", desc=True).execute()
    return {"organizations": result.data}


@app.post("/api/organizations")
async def create_organization(name: str = Form(...)):
    """Create a new organization."""
    result = supabase.table("organizations").insert({"name": name}).execute()
    return {"organization": result.data[0]}


@app.get("/api/organizations/{org_id}")
async def get_organization(org_id: str):
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


@app.get("/api/agreements")
async def list_agreements():
    """List all agreements with outlet info."""
    result = supabase.table("agreements").select("*, outlets(name, city, address, property_type, status)").order("created_at", desc=True).execute()
    return {"agreements": result.data}


@app.get("/api/agreements/{agreement_id}")
async def get_agreement(agreement_id: str):
    """Get a single agreement with full details."""
    result = supabase.table("agreements").select("*, outlets(*)").eq("id", agreement_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    # Also get obligations
    obligations = supabase.table("obligations").select("*").eq("agreement_id", agreement_id).execute()

    # Also get alerts
    alerts = supabase.table("alerts").select("*").eq("agreement_id", agreement_id).order("trigger_date").execute()

    return {
        "agreement": result.data,
        "obligations": obligations.data,
        "alerts": alerts.data,
    }


@app.get("/api/outlets")
async def list_outlets():
    """List all outlets."""
    result = supabase.table("outlets").select("*, agreements(id, type, status, monthly_rent, lease_expiry_date, risk_flags)").order("created_at", desc=True).execute()
    return {"outlets": result.data}


@app.get("/api/outlets/{outlet_id}")
async def get_outlet(outlet_id: str):
    """Get a single outlet with agreements, obligations, and alerts."""
    result = supabase.table("outlets").select("*").eq("id", outlet_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    agreements = supabase.table("agreements").select("*").eq("outlet_id", outlet_id).execute()
    obligations = supabase.table("obligations").select("*").eq("outlet_id", outlet_id).execute()
    alerts = supabase.table("alerts").select("*").eq("outlet_id", outlet_id).order("trigger_date").execute()

    return {
        "outlet": result.data,
        "agreements": agreements.data,
        "obligations": obligations.data,
        "alerts": alerts.data,
    }


@app.get("/api/alerts")
async def list_alerts():
    """List all alerts."""
    result = supabase.table("alerts").select("*, outlets(name, city), agreements(type, document_filename)").order("trigger_date").execute()
    return {"alerts": result.data}


@app.get("/api/dashboard")
async def dashboard_stats():
    """Get dashboard statistics."""
    outlets = supabase.table("outlets").select("id, status, city, property_type, franchise_model").execute()
    agreements = supabase.table("agreements").select("id, status, monthly_rent, cam_monthly, total_monthly_outflow, lease_expiry_date, risk_flags").execute()
    obligations = supabase.table("obligations").select("id, type, amount, is_active").execute()
    alerts = supabase.table("alerts").select("id, type, severity, status, trigger_date").execute()

    # Calculate stats
    total_outlets = len(outlets.data)
    total_agreements = len(agreements.data)
    active_agreements = len([a for a in agreements.data if a.get("status") == "active"])
    total_monthly_rent = sum(a.get("monthly_rent") or 0 for a in agreements.data)
    total_monthly_outflow = sum(a.get("total_monthly_outflow") or 0 for a in agreements.data)
    total_risk_flags = sum(len(a.get("risk_flags") or []) for a in agreements.data)
    pending_alerts = len([a for a in alerts.data if a.get("status") == "pending"])

    # Expiring leases (next 90 days)
    today = date.today()
    expiring = [a for a in agreements.data if a.get("lease_expiry_date") and
                0 <= (date.fromisoformat(a["lease_expiry_date"]) - today).days <= 90]

    # Outlets by city
    cities = {}
    for o in outlets.data:
        city = o.get("city") or "Unknown"
        cities[city] = cities.get(city, 0) + 1

    # Outlets by status
    statuses = {}
    for o in outlets.data:
        s = o.get("status") or "unknown"
        statuses[s] = statuses.get(s, 0) + 1

    return {
        "total_outlets": total_outlets,
        "total_agreements": total_agreements,
        "active_agreements": active_agreements,
        "total_monthly_rent": total_monthly_rent,
        "total_monthly_outflow": total_monthly_outflow,
        "total_risk_flags": total_risk_flags,
        "pending_alerts": pending_alerts,
        "expiring_leases_90d": len(expiring),
        "outlets_by_city": cities,
        "outlets_by_status": statuses,
    }


@app.post("/api/seed")
async def seed_demo_data():
    """Seed 6 realistic demo outlets with agreements, obligations, and alerts for demo purposes."""
    try:
        # Get or create demo org
        org_id = get_or_create_demo_org()

        # ---- 6 Demo Outlets ----
        outlets_data = [
            {
                "org_id": org_id, "name": "Ambience Mall", "brand_name": "Tan Coffee",
                "address": "Unit GF-127, Ground Floor, Ambience Mall, NH-8, Gurugram, Haryana 122002",
                "city": "Gurugram", "state": "Haryana", "pincode": "122002",
                "property_type": "mall", "floor": "Ground Floor", "unit_number": "GF-127",
                "super_area_sqft": 1850, "covered_area_sqft": 1550, "carpet_area_sqft": 1200,
                "franchise_model": "FOFO", "status": "operational",
            },
            {
                "org_id": org_id, "name": "Phoenix MarketCity", "brand_name": "Tan Coffee",
                "address": "Unit F-215, 2nd Floor, Phoenix MarketCity, LBS Marg, Kurla, Mumbai 400070",
                "city": "Mumbai", "state": "Maharashtra", "pincode": "400070",
                "property_type": "mall", "floor": "2nd Floor", "unit_number": "F-215",
                "super_area_sqft": 2200, "covered_area_sqft": 1850, "carpet_area_sqft": 1450,
                "franchise_model": "FOCO", "status": "operational",
            },
            {
                "org_id": org_id, "name": "Indiranagar High Street", "brand_name": "Tan Coffee",
                "address": "No. 42, 12th Main, HAL 2nd Stage, Indiranagar, Bengaluru 560038",
                "city": "Bengaluru", "state": "Karnataka", "pincode": "560038",
                "property_type": "high_street", "floor": "Ground Floor", "unit_number": "42",
                "super_area_sqft": 1400, "covered_area_sqft": 1250, "carpet_area_sqft": 1050,
                "franchise_model": "FOFO", "status": "fit_out",
            },
            {
                "org_id": org_id, "name": "Select Citywalk", "brand_name": "Tan Coffee",
                "address": "Unit 2-14, 2nd Floor, Select Citywalk, Saket, New Delhi 110017",
                "city": "New Delhi", "state": "Delhi", "pincode": "110017",
                "property_type": "mall", "floor": "2nd Floor", "unit_number": "2-14",
                "super_area_sqft": 1650, "covered_area_sqft": 1380, "carpet_area_sqft": 1100,
                "franchise_model": "FOFO", "status": "up_for_renewal",
            },
            {
                "org_id": org_id, "name": "Palladium Chennai", "brand_name": "Tan Coffee",
                "address": "Unit GF-08, Ground Floor, Palladium Mall, Velachery, Chennai 600042",
                "city": "Chennai", "state": "Tamil Nadu", "pincode": "600042",
                "property_type": "mall", "floor": "Ground Floor", "unit_number": "GF-08",
                "super_area_sqft": 1300, "covered_area_sqft": 1100, "carpet_area_sqft": 900,
                "franchise_model": "COCO", "status": "operational",
            },
            {
                "org_id": org_id, "name": "DLF CyberHub", "brand_name": "Tan Coffee",
                "address": "Unit CH-305, 3rd Floor, DLF CyberHub, DLF Cyber City, Gurugram 122002",
                "city": "Gurugram", "state": "Haryana", "pincode": "122002",
                "property_type": "cyber_park", "floor": "3rd Floor", "unit_number": "CH-305",
                "super_area_sqft": 1000, "covered_area_sqft": 850, "carpet_area_sqft": 700,
                "franchise_model": "FOFO", "status": "pipeline",
            },
        ]

        created_outlets = []
        for od in outlets_data:
            result = supabase.table("outlets").insert(od).execute()
            created_outlets.append(result.data[0])

        # ---- 6 Demo Agreements ----
        today = date.today()
        agreements_data = [
            {
                "org_id": org_id, "outlet_id": created_outlets[0]["id"],
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
                "org_id": org_id, "outlet_id": created_outlets[1]["id"],
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
                "org_id": org_id, "outlet_id": created_outlets[2]["id"],
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
                "org_id": org_id, "outlet_id": created_outlets[3]["id"],
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
                "org_id": org_id, "outlet_id": created_outlets[4]["id"],
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
                "org_id": org_id, "outlet_id": created_outlets[5]["id"],
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

        # ---- Obligations for each active agreement ----
        all_obligations = []
        obligation_configs = [
            # (outlet_idx, agreement_idx, obligations_list)
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
                    "org_id": org_id,
                    "agreement_id": created_agreements[agr_idx]["id"],
                    "outlet_id": created_outlets[outlet_idx]["id"],
                    "is_active": True,
                    **obl,
                }
                clean = {k: v for k, v in obl_data.items() if v is not None}
                result = supabase.table("obligations").insert(clean).execute()
                all_obligations.append(result.data[0])

        # ---- Alerts ----
        all_alerts = []
        alert_configs = [
            # Lease expiry alerts for Select Citywalk (expiring in 75 days)
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
            # Escalation alerts for Ambience Mall
            {"outlet_idx": 0, "agr_idx": 0, "type": "escalation", "severity": "medium",
             "title": "Rent escalation in 90 days - Ambience Mall",
             "message": "15% rent escalation due on 2028-03-18 for Ambience Mall. Current rent: Rs. 2,85,000.",
             "trigger_date": "2027-12-18", "lead_days": 90, "reference_date": "2028-03-18"},
            # Lock-in expiry alert for Phoenix Mumbai
            {"outlet_idx": 1, "agr_idx": 1, "type": "lock_in_expiry", "severity": "medium",
             "title": "Lock-in expires in 90 days - Phoenix MarketCity",
             "message": "Lock-in period ends on 2027-06-01. You may exit after this date with notice.",
             "trigger_date": "2027-03-03", "lead_days": 90, "reference_date": "2027-06-01"},
            # Rent due alerts (upcoming months)
            {"outlet_idx": 0, "agr_idx": 0, "type": "rent_due", "severity": "medium",
             "title": f"Rent due on {date(today.year, today.month, 7).strftime('%d %b %Y')} - Ambience Mall",
             "message": "Monthly rent payment of Rs. 2,85,000 + CAM Rs. 59,200 due.",
             "trigger_date": (today + timedelta(days=3)).isoformat(), "lead_days": 7,
             "reference_date": (today + timedelta(days=10)).isoformat()},
            {"outlet_idx": 1, "agr_idx": 1, "type": "rent_due", "severity": "medium",
             "title": f"Rent due - Phoenix MarketCity",
             "message": "Monthly rent payment of Rs. 3,50,000 + CAM Rs. 72,600 due.",
             "trigger_date": (today + timedelta(days=5)).isoformat(), "lead_days": 7,
             "reference_date": (today + timedelta(days=12)).isoformat()},
            {"outlet_idx": 4, "agr_idx": 4, "type": "rent_due", "severity": "medium",
             "title": f"Rent due - Palladium Chennai",
             "message": "Monthly rent payment of Rs. 1,75,000 + CAM Rs. 41,600 due.",
             "trigger_date": (today + timedelta(days=8)).isoformat(), "lead_days": 7,
             "reference_date": (today + timedelta(days=15)).isoformat()},
            # Lease expiry far-out alerts for Ambience Mall
            {"outlet_idx": 0, "agr_idx": 0, "type": "lease_expiry", "severity": "medium",
             "title": "Lease expiry in 180 days - Ambience Mall",
             "message": "Lease expires on 2034-01-31. 180 days remaining. Plan renewal strategy.",
             "trigger_date": "2033-08-04", "lead_days": 180, "reference_date": "2034-01-31"},
            # Fit-out deadline for Indiranagar
            {"outlet_idx": 2, "agr_idx": 2, "type": "fit_out_deadline", "severity": "high",
             "title": "Fit-out deadline approaching - Indiranagar",
             "message": "Fit-out period ends on 2026-01-15. Rent commencement starts after.",
             "trigger_date": "2026-01-08", "lead_days": 7, "reference_date": "2026-01-15"},
        ]

        for ac in alert_configs:
            outlet_idx = ac.pop("outlet_idx")
            agr_idx = ac.pop("agr_idx")
            alert_data = {
                "org_id": org_id,
                "outlet_id": created_outlets[outlet_idx]["id"],
                "agreement_id": created_agreements[agr_idx]["id"],
                "status": "pending",
                **ac,
            }
            result = supabase.table("alerts").insert(alert_data).execute()
            all_alerts.append(result.data[0])

        # Log activity
        supabase.table("activity_log").insert({
            "org_id": org_id,
            "entity_type": "system",
            "action": "seed_demo_data",
            "details": {
                "outlets_created": len(created_outlets),
                "agreements_created": len(created_agreements),
                "obligations_created": len(all_obligations),
                "alerts_created": len(all_alerts),
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


# ============================================
# PAYMENT TRACKING ENDPOINTS
# ============================================

@app.get("/api/payments")
async def list_payments(
    outlet_id: Optional[str] = Query(None),
    status: Optional[str] = Query(None),
    period_year: Optional[int] = Query(None),
    period_month: Optional[int] = Query(None),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List payment records with optional filters."""
    query = supabase.table("payment_records").select(
        "*, obligations(type, frequency, amount), outlets(name, city)"
    )

    org_id = get_org_filter(user)
    if org_id:
        query = query.eq("org_id", org_id)
    if outlet_id:
        query = query.eq("outlet_id", outlet_id)
    if status:
        query = query.eq("status", status)
    if period_year:
        query = query.eq("period_year", period_year)
    if period_month:
        query = query.eq("period_month", period_month)

    result = query.order("due_date", desc=True).execute()
    return {"payments": result.data}


@app.patch("/api/payments/{payment_id}")
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


@app.get("/api/obligations")
async def list_obligations(
    outlet_id: Optional[str] = Query(None),
    active_only: bool = Query(True),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List obligations with optional filters."""
    query = supabase.table("obligations").select(
        "*, outlets(name, city), agreements(type, document_filename, brand_name)"
    )

    org_id = get_org_filter(user)
    if org_id:
        query = query.eq("org_id", org_id)
    if outlet_id:
        query = query.eq("outlet_id", outlet_id)
    if active_only:
        query = query.eq("is_active", True)

    result = query.order("type").execute()
    return {"obligations": result.data}


@app.post("/api/payments/generate")
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

            # Skip if before obligation start
            if start_date and f"{period_year}-{period_month:02d}" < start_date[:7]:
                continue
            # Skip if after obligation end
            if end_date and f"{period_year}-{period_month:02d}" > end_date[:7]:
                continue

            # Check if record already exists
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


# ============================================
# ALERT ACTION ENDPOINTS
# ============================================

@app.patch("/api/alerts/{alert_id}/acknowledge")
async def acknowledge_alert(
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


@app.patch("/api/alerts/{alert_id}/snooze")
async def snooze_alert(
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


@app.patch("/api/alerts/{alert_id}/assign")
async def assign_alert(
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
# REPORTS ENDPOINT
# ============================================

@app.get("/api/reports")
async def get_reports(user: Optional[CurrentUser] = Depends(get_current_user)):
    """Joined outlet report: outlets + agreements + payments for the report table."""
    org_id = get_org_filter(user)

    # Fetch outlets
    outlets_q = supabase.table("outlets").select("*")
    if org_id:
        outlets_q = outlets_q.eq("org_id", org_id)
    outlets_result = outlets_q.order("created_at", desc=True).execute()

    # Fetch agreements
    agreements_q = supabase.table("agreements").select("*")
    if org_id:
        agreements_q = agreements_q.eq("org_id", org_id)
    agreements_result = agreements_q.execute()

    # Fetch overdue payments
    payments_q = supabase.table("payment_records").select("outlet_id, due_amount, status").eq("status", "overdue")
    if org_id:
        payments_q = payments_q.eq("org_id", org_id)
    payments_result = payments_q.execute()

    # Build overdue lookup by outlet_id
    overdue_by_outlet: dict = {}
    for p in payments_result.data:
        oid = p.get("outlet_id")
        overdue_by_outlet[oid] = overdue_by_outlet.get(oid, 0) + (p.get("due_amount") or 0)

    # Build report rows
    report = []
    for outlet in outlets_result.data:
        outlet_id = outlet["id"]
        outlet_agreements = [
            a for a in agreements_result.data
            if a.get("outlet_id") == outlet_id and a.get("type") == "lease_loi"
        ]
        primary = next(
            (a for a in outlet_agreements if a.get("status") in ("active", "expiring")),
            outlet_agreements[0] if outlet_agreements else None,
        )

        monthly_rent = (primary.get("monthly_rent") or 0) if primary else 0
        cam_monthly = (primary.get("cam_monthly") or 0) if primary else 0
        total_outflow = (primary.get("total_monthly_outflow") or 0) if primary else 0
        rent_per_sqft = (primary.get("rent_per_sqft") or 0) if primary else 0
        lease_expiry = (primary.get("lease_expiry_date") or "") if primary else ""
        risk_flags = (primary.get("risk_flags") or []) if primary else []

        revenue = outlet.get("monthly_net_revenue")
        rent_to_revenue = None
        if revenue and revenue > 0 and total_outflow > 0:
            rent_to_revenue = round((total_outflow / revenue) * 100, 1)

        days_to_expiry = None
        if lease_expiry:
            try:
                exp = date.fromisoformat(lease_expiry)
                days_to_expiry = (exp - date.today()).days
            except (ValueError, TypeError):
                pass

        report.append({
            "outlet_id": outlet_id,
            "outlet_name": outlet.get("name", ""),
            "brand": outlet.get("brand_name", ""),
            "city": outlet.get("city", ""),
            "state": outlet.get("state", ""),
            "property_type": outlet.get("property_type", ""),
            "franchise_model": outlet.get("franchise_model", ""),
            "outlet_status": outlet.get("status", ""),
            "super_area": outlet.get("super_area_sqft") or 0,
            "monthly_rent": monthly_rent,
            "rent_per_sqft": rent_per_sqft,
            "monthly_cam": cam_monthly,
            "total_outflow": total_outflow,
            "lease_expiry": lease_expiry,
            "days_to_expiry": days_to_expiry,
            "revenue": revenue,
            "rent_to_revenue": rent_to_revenue,
            "risk_flags_count": len(risk_flags),
            "overdue_amount": overdue_by_outlet.get(outlet_id, 0),
        })

    return {"report": report}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
