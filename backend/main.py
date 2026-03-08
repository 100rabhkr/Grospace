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
from PIL import Image
from pdf2image import convert_from_bytes

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends, Header, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
import google.generativeai as genai
from google.cloud import vision as cloud_vision
from supabase import create_client, Client
from starlette.requests import Request
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded

load_dotenv()

# Supported file types
SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif"}
SUPPORTED_PDF_EXTENSIONS = {".pdf"}
SUPPORTED_EXTENSIONS = SUPPORTED_PDF_EXTENSIONS | SUPPORTED_IMAGE_EXTENSIONS

app = FastAPI(title="GroSpace AI Service", version="1.0.0")

limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# CORS - allow Vercel deployment, localhost, and configured frontend
ALLOWED_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:3001",
    os.getenv("FRONTEND_URL", ""),
]
# Filter out empty strings
ALLOWED_ORIGINS = [o for o in ALLOWED_ORIGINS if o]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS or ["*"],
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
model = genai.GenerativeModel("gemini-2.5-flash")


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
        "locality": "string (neighbourhood/area name, e.g. Rajouri Garden, Koramangala, Connaught Place)",
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

BILL_EXTRACTION_SCHEMA = {
    "bill_type": "enum: electricity/water/property_tax/gas/internet/maintenance/rental_invoice/other",
    "provider_name": "string",
    "provider_account_number": "string",
    "consumer_name": "string",
    "consumer_address": "string",
    "bill_number": "string",
    "bill_date": "date",
    "billing_period_from": "date",
    "billing_period_to": "date",
    "due_date": "date",
    "total_amount": "number",
    "previous_balance": "number",
    "current_charges": "number",
    "taxes_and_surcharges": "number",
    "late_fee": "number",
    "units_consumed": "number (for electricity/water/gas)",
    "rate_per_unit": "number",
    "meter_number": "string",
    "payment_status": "enum: paid/unpaid/overdue/partial",
    "payment_mode": "string",
    "property_name": "string",
    "city": "string",
}

SUPPLEMENTARY_AGREEMENT_SCHEMA = {
    "amendment_type": "enum: rent_revision/term_extension/area_change/party_change/addendum/side_letter/noc/other",
    "reference_agreement_date": "date",
    "reference_agreement_number": "string",
    "parties": {
        "party_a_name": "string",
        "party_b_name": "string",
    },
    "premises": {
        "property_name": "string",
        "full_address": "string",
        "city": "string",
    },
    "effective_date": "date",
    "changes": {
        "revised_rent": "number",
        "revised_escalation_pct": "number",
        "revised_lock_in_months": "number",
        "revised_lease_expiry": "date",
        "revised_area_sqft": "number",
        "revised_cam": "number",
        "revised_security_deposit": "number",
        "other_changes": "string (AI summary of changes not captured above)",
    },
    "reason_for_amendment": "string",
    "mutual_consent": "boolean",
    "key_conditions_summary": "string (3-5 line AI summary)",
    "signatory_names": "list of strings",
    "execution_date": "date",
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
    session_id: Optional[str] = None

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
    document_text: Optional[str] = None  # Cached OCR/extracted text for Q&A


class PaymentUpdateRequest(BaseModel):
    status: str  # paid, partially_paid, overdue, upcoming, due
    paid_amount: Optional[float] = None
    notes: Optional[str] = None


class PortfolioQARequest(BaseModel):
    question: str
    org_id: Optional[str] = None


class GeneratePaymentsRequest(BaseModel):
    months_ahead: int = 3


class SnoozeRequest(BaseModel):
    days: int = 7


class AssignRequest(BaseModel):
    user_id: str


class UpdateAgreementRequest(BaseModel):
    """Sparse update of agreement extracted_data via dot-notation keys."""
    field_updates: Optional[dict] = None  # e.g. {"parties.lessor_name": "New Name"}
    extracted_data: Optional[dict] = None  # Full replacement (rare)


class UpdateOrganizationRequest(BaseModel):
    name: Optional[str] = None
    logo_url: Optional[str] = None
    alert_preferences: Optional[dict] = None


class InviteMemberRequest(BaseModel):
    email: str
    role: str = "org_member"


class UpdateProfileRequest(BaseModel):
    full_name: Optional[str] = None


class AlertPreferencesRequest(BaseModel):
    preferences: dict  # { alert_type: { lead_days, email_enabled } }


class UpdateOutletRequest(BaseModel):
    monthly_net_revenue: Optional[float] = None
    status: Optional[str] = None
    site_code: Optional[str] = None


class CreateReminderRequest(BaseModel):
    title: str
    message: Optional[str] = None
    trigger_date: str  # ISO date string
    severity: str = "medium"
    outlet_id: Optional[str] = None
    agreement_id: Optional[str] = None


class UpdateReminderRequest(BaseModel):
    title: Optional[str] = None
    message: Optional[str] = None
    trigger_date: Optional[str] = None
    severity: Optional[str] = None


class MovePipelineRequest(BaseModel):
    outlet_id: str
    new_stage: str
    deal_notes: Optional[str] = None


class UpdatePipelineDealRequest(BaseModel):
    deal_priority: Optional[str] = None
    deal_notes: Optional[str] = None


class CreateShowcaseRequest(BaseModel):
    outlet_id: str
    title: Optional[str] = None
    description: Optional[str] = None
    include_financials: bool = False
    expires_at: Optional[str] = None


class UpdateShowcaseRequest(BaseModel):
    title: Optional[str] = None
    description: Optional[str] = None
    include_financials: Optional[bool] = None
    is_active: Optional[bool] = None


class SmartChatRequest(BaseModel):
    question: str
    org_id: Optional[str] = None


# ============================================
# ACTIVITY LOG HELPER
# ============================================

def log_activity(org_id: str, user_id: str | None, entity_type: str, entity_id: str, action: str, details: dict | None = None):
    """Insert an activity log entry. Non-blocking — failures are silently ignored."""
    try:
        supabase.table("activity_log").insert({
            "org_id": org_id,
            "user_id": user_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "details": details or {},
        }).execute()
    except Exception:
        pass  # Activity logging should never break the main flow


# ============================================
# NOTIFICATION ROUTING HELPERS
# ============================================

ALERT_TYPES_LIST = [
    "rent_due", "cam_due", "escalation", "lease_expiry", "license_expiry",
    "lock_in_expiry", "renewal_window", "fit_out_deadline", "deposit_installment",
    "revenue_reconciliation", "custom",
]

def get_notification_channels(org_id: str, alert_type: str, severity: str = "medium") -> dict:
    """Determine which channels (email, whatsapp) to use for an alert.
    Returns {"email": bool, "whatsapp": bool}."""
    try:
        result = supabase.table("organizations").select("alert_preferences").eq("id", org_id).single().execute()
        prefs = (result.data or {}).get("alert_preferences") or {}
        notif_prefs = prefs.get("notification_preferences") or {}
        routes = notif_prefs.get("routes") or {}

        # Check per-type route first
        if alert_type in routes:
            route = routes[alert_type]
            return {
                "email": route.get("email", True),
                "whatsapp": route.get("whatsapp", False),
            }

        # Fall back to severity-based defaults
        if severity == "high":
            defaults = notif_prefs.get("default_high_severity", {"email": True, "whatsapp": True})
        else:
            defaults = notif_prefs.get("default_normal", {"email": True, "whatsapp": False})

        return {
            "email": defaults.get("email", True),
            "whatsapp": defaults.get("whatsapp", False),
        }
    except Exception:
        return {"email": True, "whatsapp": False}


def send_email_via_resend(to_email: str, subject: str, html_body: str) -> bool:
    """Send an email using the Resend API. Returns True on success."""
    resend_api_key = os.getenv("RESEND_API_KEY")
    if not resend_api_key:
        return False
    try:
        import requests
        resp = requests.post(
            "https://api.resend.com/emails",
            headers={
                "Authorization": f"Bearer {resend_api_key}",
                "Content-Type": "application/json",
            },
            json={
                "from": os.getenv("RESEND_FROM_EMAIL", "GroSpace <notifications@grospace.app>"),
                "to": [to_email],
                "subject": subject,
                "html": html_body,
            },
            timeout=10,
        )
        return resp.status_code in (200, 201)
    except Exception:
        return False


def send_whatsapp_via_msg91(phone_number: str, template_name: str, variables: dict) -> bool:
    """Send a WhatsApp message using MSG91 API. Returns True on success."""
    msg91_auth_key = os.getenv("MSG91_AUTH_KEY")
    msg91_template_id = os.getenv("MSG91_WHATSAPP_TEMPLATE_ID", "")
    if not msg91_auth_key or not phone_number:
        return False
    try:
        import requests
        # MSG91 WhatsApp API
        payload = {
            "integrated_number": os.getenv("MSG91_INTEGRATED_NUMBER", ""),
            "content_type": "template",
            "payload": {
                "messaging_product": "whatsapp",
                "type": "template",
                "template": {
                    "name": template_name or msg91_template_id,
                    "language": {"code": "en", "policy": "deterministic"},
                    "components": [
                        {
                            "type": "body",
                            "parameters": [
                                {"type": "text", "text": str(v)} for v in variables.values()
                            ],
                        }
                    ],
                },
                "to": phone_number,
            },
        }
        resp = requests.post(
            "https://api.msg91.com/api/v5/whatsapp/whatsapp-outbound-message/bulk/",
            headers={
                "authkey": msg91_auth_key,
                "Content-Type": "application/json",
            },
            json=payload,
            timeout=10,
        )
        return resp.status_code in (200, 201)
    except Exception:
        return False


def build_alert_email_html(alert: dict, org_name: str = "GroSpace") -> str:
    """Build an HTML email body for an alert notification."""
    severity = alert.get("severity", "medium")
    severity_color = {"high": "#dc2626", "medium": "#f59e0b", "low": "#3b82f6", "info": "#6b7280"}.get(severity, "#6b7280")
    return f"""
    <html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
    <div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px">
        <h2 style="margin:0">GroSpace Alert</h2>
        <p style="color:#666;margin:5px 0 0 0">{org_name}</p>
    </div>
    <div style="background:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;padding:16px;margin-bottom:16px">
        <div style="display:inline-block;background:{severity_color};color:white;padding:2px 8px;border-radius:9999px;font-size:11px;font-weight:600;text-transform:uppercase;margin-bottom:8px">{severity}</div>
        <h3 style="margin:8px 0 4px 0">{alert.get("title", "Alert")}</h3>
        <p style="color:#666;margin:0">{alert.get("message", "")}</p>
        <p style="color:#999;font-size:12px;margin:8px 0 0 0">Trigger date: {alert.get("trigger_date", "N/A")}</p>
    </div>
    <p style="color:#999;font-size:11px">This is an automated alert from GroSpace. Log in to manage your alerts.</p>
    </body></html>
    """


def dispatch_notification(org_id: str, alert: dict):
    """Route an alert to the appropriate channels and send via Resend/MSG91."""
    alert_type = alert.get("type", "custom")
    severity = alert.get("severity", "medium")
    channels = get_notification_channels(org_id, alert_type, severity)

    results = {"email": None, "whatsapp": None}

    # Log the routing decision
    log_activity(org_id, None, "alert", alert.get("id", ""), "notification_routed", {
        "alert_type": alert_type,
        "severity": severity,
        "channels": channels,
        "title": alert.get("title", ""),
    })

    # Get org info for email content
    try:
        org_result = supabase.table("organizations").select("name, alert_preferences").eq("id", org_id).single().execute()
        org_name = org_result.data.get("name", "GroSpace") if org_result.data else "GroSpace"
        alert_prefs = (org_result.data or {}).get("alert_preferences") or {}
        notif_prefs = alert_prefs.get("notification_preferences") or {}
    except Exception:
        org_name = "GroSpace"
        notif_prefs = {}

    # Send email if configured
    if channels.get("email"):
        # Try to get org admin emails
        try:
            members = supabase.table("profiles").select("email").eq("org_id", org_id).in_("role", ["org_admin", "platform_admin"]).execute()
            emails = [m["email"] for m in (members.data or []) if m.get("email")]
        except Exception:
            emails = []

        if emails:
            html_body = build_alert_email_html(alert, org_name)
            subject = f"[GroSpace] {severity.upper()}: {alert.get('title', 'Alert')}"
            for email in emails:
                sent = send_email_via_resend(email, subject, html_body)
                if results["email"] is None:
                    results["email"] = sent

    # Send WhatsApp if configured
    if channels.get("whatsapp"):
        whatsapp_number = notif_prefs.get("whatsapp_number", "")
        if whatsapp_number:
            sent = send_whatsapp_via_msg91(
                whatsapp_number,
                "grospace_alert",
                {
                    "title": alert.get("title", "Alert"),
                    "severity": severity,
                    "trigger_date": alert.get("trigger_date", "N/A"),
                },
            )
            results["whatsapp"] = sent

    # Log delivery results
    log_activity(org_id, None, "alert", alert.get("id", ""), "notification_sent", {
        "channels": channels,
        "results": results,
    })

    return {**channels, "results": results}


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


def clean_ocr_text(raw_text: str) -> str:
    """Post-process OCR output for better formatting and readability.

    Fixes common OCR artifacts:
    - Broken lines mid-word/mid-sentence
    - Excessive whitespace and blank lines
    - Common character misreads (|/l/1, 0/O)
    - Header/footer repetition removal
    - Table-like alignment preservation
    """
    import re
    if not raw_text or not raw_text.strip():
        return raw_text

    lines = raw_text.split("\n")
    cleaned_lines = []
    prev_line = ""

    for line in lines:
        # Strip trailing whitespace but preserve leading (indentation)
        line = line.rstrip()

        # Skip empty lines if previous was also empty (collapse multiple blanks)
        if not line.strip():
            if not prev_line.strip():
                continue
            cleaned_lines.append("")
            prev_line = line
            continue

        # Remove common header/footer patterns (page numbers, repeated headers)
        stripped = line.strip()
        if re.match(r"^(page\s*\d+\s*(of\s*\d+)?|^\d+\s*$)", stripped, re.IGNORECASE):
            prev_line = line
            continue

        # Fix broken lines: if previous line doesn't end with sentence-ending punctuation
        # or a colon, and current line starts with lowercase, join them
        if (
            prev_line.strip()
            and cleaned_lines
            and not prev_line.strip().endswith((".", ":", ";", "!", "?", "-", "—", "|"))
            and not stripped.startswith(("•", "-", "–", "■", "●", "(", "[", "ARTICLE", "Section", "Clause"))
            and stripped[0:1].islower()
            and len(prev_line.strip()) > 20
        ):
            # Join with previous line
            cleaned_lines[-1] = cleaned_lines[-1].rstrip() + " " + stripped
            prev_line = cleaned_lines[-1]
            continue

        # Normalize multiple spaces within a line (but preserve table-like columns)
        # If line has 3+ segments separated by 3+ spaces, it's likely a table row — preserve
        segments = re.split(r"\s{3,}", stripped)
        if len(segments) >= 3:
            # Table-like row: normalize to tab-separated
            line = "    ".join(s.strip() for s in segments if s.strip())
        else:
            # Normal text: collapse multiple spaces to single
            line = re.sub(r"  +", " ", line)

        # Fix common OCR character substitutions in monetary contexts
        line = re.sub(r"(Rs\.?\s?)O(\d)", r"\g<1>0\2", line)
        line = re.sub(r"(₹\s?)O(\d)", r"\g<1>0\2", line)

        cleaned_lines.append(line)
        prev_line = line

    result = "\n".join(cleaned_lines)

    # Final cleanup: remove more than 2 consecutive newlines
    result = re.sub(r"\n{3,}", "\n\n", result)

    return result.strip()


def get_file_type(filename: str) -> str:
    """Determine file type from filename extension. Returns 'pdf', 'image', or 'unknown'."""
    if not filename:
        return "unknown"
    ext = os.path.splitext(filename.lower())[1]
    if ext in SUPPORTED_PDF_EXTENSIONS:
        return "pdf"
    if ext in SUPPORTED_IMAGE_EXTENSIONS:
        return "image"
    return "unknown"


def pdf_bytes_to_images(pdf_bytes: bytes, max_pages: int = 20, dpi: int = 200) -> list:
    """Convert PDF bytes to a list of PIL Images. Caps at max_pages to limit memory."""
    try:
        images = convert_from_bytes(pdf_bytes, dpi=dpi, last_page=max_pages, fmt="jpeg")
        return images
    except Exception:
        return []


def load_image_bytes(file_bytes: bytes) -> list:
    """Load image file bytes as a list containing one PIL Image."""
    try:
        img = Image.open(BytesIO(file_bytes))
        img = img.convert("RGB")
        return [img]
    except Exception:
        return []


def extract_text_cloud_vision(images: list) -> str:
    """Use Google Cloud Vision API for high-accuracy OCR on page images."""
    try:
        client = cloud_vision.ImageAnnotatorClient()
        full_text = ""
        for img in images:
            buf = BytesIO()
            img.save(buf, format="PNG")
            image = cloud_vision.Image(content=buf.getvalue())
            response = client.document_text_detection(image=image)
            if response.error.message:
                continue
            if response.full_text_annotation:
                full_text += response.full_text_annotation.text + "\n\n"
        return full_text.strip()
    except Exception as e:
        print(f"[CLOUD VISION] OCR failed: {type(e).__name__}: {e}")
        return ""


async def download_file(file_url: str) -> bytes:
    """Download a file from Supabase storage."""
    async with httpx.AsyncClient() as client:
        response = await client.get(file_url)
        response.raise_for_status()
        return response.content


async def classify_document(text: str) -> str:
    """Classify a document into one of the supported types."""
    prompt = (
        "Classify this document as one of: lease_loi, license_certificate, franchise_agreement, bill, supplementary_agreement. "
        "Guidelines:\n"
        "- lease_loi: Lease agreements, Letters of Intent, rent agreements, leave & license for commercial property\n"
        "- license_certificate: Compliance certificates (CTO, CTE, FSSAI, trade license, fire NOC, health license)\n"
        "- franchise_agreement: FOFO/FOCO/COCO franchise contracts\n"
        "- bill: Utility bills (electricity, water, gas), property tax receipts, maintenance invoices, rental invoices\n"
        "- supplementary_agreement: Addendums, amendments, side letters, rent revision letters, NOCs, supplementary deeds\n"
        "Return only the classification label, nothing else.\n\n"
        f"Document text (first 2000 characters):\n{text[:2000]}"
    )

    response = model.generate_content(prompt)
    label = response.text.strip().lower()
    valid = {"lease_loi", "license_certificate", "franchise_agreement", "bill", "supplementary_agreement"}
    return label if label in valid else "lease_loi"


async def extract_structured_data(text: str, doc_type: str) -> dict:
    """Extract structured data from document text using LLM."""
    schema_map = {
        "lease_loi": LEASE_EXTRACTION_SCHEMA,
        "license_certificate": LICENSE_EXTRACTION_SCHEMA,
        "franchise_agreement": LEASE_EXTRACTION_SCHEMA,
        "bill": BILL_EXTRACTION_SCHEMA,
        "supplementary_agreement": SUPPLEMENTARY_AGREEMENT_SCHEMA,
    }
    schema = schema_map.get(doc_type, LEASE_EXTRACTION_SCHEMA)

    doc_type_label = {
        "lease_loi": "lease/LOI document",
        "license_certificate": "compliance certificate or license",
        "franchise_agreement": "franchise agreement",
        "bill": "utility bill, tax receipt, or invoice",
        "supplementary_agreement": "supplementary agreement, addendum, or amendment",
    }.get(doc_type, "document")

    prompt = (
        f"You are a document extraction specialist for Indian commercial real estate. "
        f"Extract the following fields from this {doc_type_label}. "
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

    result = json.loads(response.text)
    # Gemini sometimes wraps the result in a list — unwrap it
    if isinstance(result, list) and len(result) > 0:
        result = result[0]
    return result if isinstance(result, dict) else {}


def calculate_confidence(extraction: dict) -> dict:
    """Calculate confidence scores for each field in the extraction."""
    if not isinstance(extraction, dict):
        return {}
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
    if isinstance(result, list):
        return result
    return result.get("flags", result.get("risk_flags", []))


# ============================================
# VISION-BASED FUNCTIONS (scanned PDFs, images, handwritten docs)
# ============================================

async def classify_document_vision(images: list) -> str:
    """Classify a document from its page images using Gemini vision."""
    try:
        prompt = (
            "Look at these document page images. "
            "Classify this document as one of: lease_loi, license_certificate, franchise_agreement, bill, supplementary_agreement. "
            "Guidelines:\n"
            "- lease_loi: Lease agreements, Letters of Intent, rent agreements\n"
            "- license_certificate: Compliance certificates (CTO, CTE, FSSAI, trade license, fire NOC)\n"
            "- franchise_agreement: FOFO/FOCO/COCO franchise contracts\n"
            "- bill: Utility bills (electricity, water, gas), property tax receipts, invoices\n"
            "- supplementary_agreement: Addendums, amendments, side letters, rent revision letters\n"
            "Return only the classification label, nothing else."
        )
        content = [prompt] + images[:3]
        response = model.generate_content(content)
        label = response.text.strip().lower()
        valid = {"lease_loi", "license_certificate", "franchise_agreement", "bill", "supplementary_agreement"}
        return label if label in valid else "lease_loi"
    except Exception:
        return "lease_loi"


async def extract_structured_data_vision(images: list, doc_type: str) -> dict:
    """Extract structured data from document page images using Gemini vision."""
    schema_map = {
        "lease_loi": LEASE_EXTRACTION_SCHEMA,
        "license_certificate": LICENSE_EXTRACTION_SCHEMA,
        "franchise_agreement": LEASE_EXTRACTION_SCHEMA,
        "bill": BILL_EXTRACTION_SCHEMA,
        "supplementary_agreement": SUPPLEMENTARY_AGREEMENT_SCHEMA,
    }
    schema = schema_map.get(doc_type, LEASE_EXTRACTION_SCHEMA)

    doc_type_label = {
        "lease_loi": "lease/LOI document",
        "license_certificate": "compliance certificate or license",
        "franchise_agreement": "franchise agreement",
        "bill": "utility bill, tax receipt, or invoice",
        "supplementary_agreement": "supplementary agreement, addendum, or amendment",
    }.get(doc_type, "document")

    prompt = (
        f"You are a document extraction specialist for Indian commercial real estate. "
        f"Look at these document page images carefully. "
        f"Extract the following fields from this {doc_type_label}. "
        "Return valid JSON matching the schema below. "
        "For each field, also return a confidence score: 'high', 'medium', 'low', or 'not_found'. "
        "If a field's value is calculated from a formula (e.g., '60 days from handover'), "
        "return the formula as a string rather than guessing a date. "
        "If the document is handwritten, do your best to read the handwriting.\n\n"
        f"Schema:\n{json.dumps(schema, indent=2)}"
    )

    try:
        # Limit pages to avoid token overflow
        page_images = images[:8]
        print(f"[VISION EXTRACT] Starting extraction with {len(page_images)} page images for doc_type={doc_type}")

        # --- Attempt 1: JSON mode ---
        result = None
        try:
            content = [prompt] + page_images
            response = model.generate_content(
                content,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0,
                ),
            )
            # Check if response has content
            if response.candidates and response.candidates[0].content.parts:
                raw_text = response.text.strip()
                print(f"[VISION EXTRACT] JSON mode response length: {len(raw_text)}")
                if raw_text:
                    result = json.loads(raw_text)
            else:
                finish_reason = response.candidates[0].finish_reason if response.candidates else "no candidates"
                print(f"[VISION EXTRACT] JSON mode empty response. Finish reason: {finish_reason}")
        except Exception as e1:
            print(f"[VISION EXTRACT] JSON mode failed: {type(e1).__name__}: {e1}")

        # --- Attempt 2: Plain text mode (no response_mime_type) ---
        if result is None:
            print("[VISION EXTRACT] Retrying without JSON mode...")
            try:
                response2 = model.generate_content(
                    [prompt + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no explanation."] + page_images,
                    generation_config=genai.GenerationConfig(temperature=0),
                )
                raw = response2.text.strip()
                print(f"[VISION EXTRACT] Plain mode response length: {len(raw)}")
                # Strip markdown fences if present
                if raw.startswith("```"):
                    raw = raw.split("\n", 1)[-1].rsplit("```", 1)[0].strip()
                if raw:
                    result = json.loads(raw)
            except Exception as e2:
                print(f"[VISION EXTRACT] Plain mode also failed: {type(e2).__name__}: {e2}")

        # --- Attempt 3: Gemini OCR then text extraction ---
        if result is None:
            print("[VISION EXTRACT] Attempting Gemini OCR fallback...")
            try:
                ocr_prompt = (
                    "Read all the text in these document page images. "
                    "Transcribe everything you can see, preserving the structure. "
                    "Include all names, dates, numbers, addresses, and terms."
                )
                ocr_response = model.generate_content(
                    [ocr_prompt] + page_images,
                    generation_config=genai.GenerationConfig(temperature=0),
                )
                ocr_text = ocr_response.text.strip()
                print(f"[VISION EXTRACT] Gemini OCR produced {len(ocr_text)} chars")
                if len(ocr_text) >= 50:
                    # Now use text-based extraction on the OCR output
                    result = await extract_structured_data(ocr_text, doc_type)
                    print(f"[VISION EXTRACT] OCR fallback extracted {len(result)} top-level keys")
            except Exception as e3:
                print(f"[VISION EXTRACT] OCR fallback failed: {type(e3).__name__}: {e3}")

        if result is None:
            print("[VISION EXTRACT] All attempts failed, returning empty dict")
            return {}

        if isinstance(result, list) and len(result) > 0:
            result = result[0]
        if not isinstance(result, dict):
            print(f"[VISION EXTRACT] Unexpected result type: {type(result)}")
            return {}

        field_count = sum(1 for v in result.values() if v is not None and v != "" and v != "not_found")
        print(f"[VISION EXTRACT] Success! {field_count} non-empty fields from {len(page_images)} pages")
        return result
    except Exception as e:
        print(f"[VISION EXTRACT] Unexpected error: {type(e).__name__}: {e}")
        import traceback
        traceback.print_exc()
        return {}


async def detect_risk_flags_vision(images: list, extraction: dict) -> list:
    """Detect risk flags from document images using Gemini vision."""
    try:
        prompt = (
            "You are a commercial lease risk analyst specializing in Indian F&B and retail leases. "
            "Look at these document page images and the extracted data below. "
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
            f"Extracted lease data:\n{json.dumps(extraction, indent=2)}"
        )
        content = [prompt] + images[:10]
        response = model.generate_content(
            content,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0,
            ),
        )
        result = json.loads(response.text)
        if isinstance(result, list):
            return result
        return result.get("flags", result.get("risk_flags", []))
    except Exception:
        return []


# ============================================
# UNIVERSAL DOCUMENT PROCESSOR
# ============================================

async def process_document(file_bytes: bytes, filename: str) -> dict:
    """
    Universal document processor. Handles PDFs (text-based, scanned, mixed)
    and image files. Never raises — always returns a result dict.

    Fallback chain:
    1. For PDFs: try text extraction first (fast, cheap)
    2. If text < 100 chars OR image file: use vision extraction
    3. If vision fails: return minimal result with low confidence
    """
    extraction_method = "unknown"
    text = ""
    images = []
    doc_type = "lease_loi"
    extraction = {}
    confidence = {}
    risk_flags = []
    error_message = None

    try:
        file_type = get_file_type(filename)

        # --- Step 1: Get content (text and/or images) ---
        if file_type == "pdf":
            try:
                text = extract_text_from_pdf(file_bytes)
            except Exception:
                text = ""

            print(f"[PROCESS] PDF text extraction: {len(text.strip())} chars")

            if len(text.strip()) >= 100:
                extraction_method = "text"
            else:
                images = pdf_bytes_to_images(file_bytes)
                print(f"[PROCESS] Converted PDF to {len(images)} page images")
                if images:
                    # Try Cloud Vision OCR first for scanned PDFs
                    cloud_vision_text = extract_text_cloud_vision(images)
                    print(f"[PROCESS] Cloud Vision OCR: {len(cloud_vision_text.strip())} chars")
                    if len(cloud_vision_text.strip()) >= 100:
                        text = cloud_vision_text
                        extraction_method = "cloud_vision"
                    else:
                        extraction_method = "vision"
                else:
                    extraction_method = "text" if text.strip() else "failed"

        elif file_type == "image":
            images = load_image_bytes(file_bytes)
            if images:
                # Try Cloud Vision OCR first for images
                cloud_vision_text = extract_text_cloud_vision(images)
                if len(cloud_vision_text.strip()) >= 100:
                    text = cloud_vision_text
                    extraction_method = "cloud_vision"
                else:
                    extraction_method = "vision"
            else:
                extraction_method = "failed"

        else:
            # Unknown file type — try PDF parsing first, then image
            try:
                text = extract_text_from_pdf(file_bytes)
                if len(text.strip()) >= 100:
                    extraction_method = "text"
                else:
                    images = pdf_bytes_to_images(file_bytes)
                    if images:
                        cloud_vision_text = extract_text_cloud_vision(images)
                        if len(cloud_vision_text.strip()) >= 100:
                            text = cloud_vision_text
                            extraction_method = "cloud_vision"
                        else:
                            extraction_method = "vision"
                    else:
                        extraction_method = "failed"
            except Exception:
                images = load_image_bytes(file_bytes)
                if images:
                    cloud_vision_text = extract_text_cloud_vision(images)
                    if len(cloud_vision_text.strip()) >= 100:
                        text = cloud_vision_text
                        extraction_method = "cloud_vision"
                    else:
                        extraction_method = "vision"
                else:
                    extraction_method = "failed"

        # --- Step 1.5: Clean OCR text ---
        if extraction_method in ("text", "cloud_vision") and text:
            text = clean_ocr_text(text)

        # --- Step 2: Classify ---
        if extraction_method in ("text", "cloud_vision"):
            doc_type = await classify_document(text)
        elif extraction_method == "vision":
            doc_type = await classify_document_vision(images)

        # --- Step 3: Extract structured data ---
        print(f"[PROCESS] Using extraction method: {extraction_method}, doc_type: {doc_type}")
        if extraction_method in ("text", "cloud_vision"):
            extraction = await extract_structured_data(text, doc_type)
        elif extraction_method == "vision":
            extraction = await extract_structured_data_vision(images, doc_type)
        print(f"[PROCESS] Extraction result: {len(extraction)} top-level keys")

        # --- Step 4: Calculate confidence ---
        confidence = calculate_confidence(extraction)

        # --- Step 5: Detect risk flags ---
        if doc_type == "lease_loi":
            try:
                if extraction_method in ("text", "cloud_vision"):
                    risk_flags = await detect_risk_flags(text, extraction)
                elif extraction_method == "vision":
                    risk_flags = await detect_risk_flags_vision(images, extraction)
            except Exception:
                risk_flags = []

        if extraction_method == "failed":
            error_message = "Could not extract content from this file. The file may be empty, corrupt, or in an unsupported format."

    except Exception as e:
        error_message = f"Processing error: {str(e)}"
        extraction_method = "failed"

    return {
        "status": "success" if extraction_method != "failed" else "partial",
        "document_type": doc_type,
        "extraction": extraction,
        "confidence": confidence,
        "risk_flags": risk_flags,
        "filename": filename,
        "document_text": text if extraction_method in ("text", "cloud_vision") else None,
        "text_length": len(text),
        "extraction_method": extraction_method,
        "error": error_message,
        "document_text": text if text and len(text.strip()) >= 100 else None,
    }


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


# City abbreviation map for site codes
CITY_ABBREVIATIONS = {
    "delhi": "Del", "new delhi": "Del", "mumbai": "Mum", "bengaluru": "Blr", "bangalore": "Blr",
    "hyderabad": "Hyd", "chennai": "Chn", "kolkata": "Kol", "pune": "Pun", "ahmedabad": "Ahm",
    "jaipur": "Jai", "lucknow": "Lkn", "chandigarh": "Chd", "indore": "Ind", "bhopal": "Bpl",
    "nagpur": "Nag", "patna": "Pat", "vadodara": "Vad", "surat": "Sur", "kochi": "Koc",
    "coimbatore": "Cbe", "thiruvananthapuram": "Tvm", "visakhapatnam": "Viz", "vijayawada": "Vjw",
    "gurgaon": "Gur", "gurugram": "Gur", "noida": "Noi", "ghaziabad": "Ghz", "faridabad": "Far",
    "dehradun": "Deh", "ranchi": "Ran", "bhubaneswar": "Bhu", "guwahati": "Guw", "raipur": "Rai",
    "ludhiana": "Lud", "amritsar": "Amr", "kanpur": "Kan", "agra": "Agr", "varanasi": "Var",
    "mysuru": "Mys", "mysore": "Mys", "mangaluru": "Mng", "mangalore": "Mng", "hubli": "Hub",
    "nashik": "Nsk", "aurangabad": "Aur", "thane": "Thn", "navi mumbai": "NMm",
    "rajkot": "Rjk", "jodhpur": "Jdp", "udaipur": "Udp", "kota": "Kot",
    "gwalior": "Gwl", "jalandhar": "Jal", "meerut": "Mrt", "allahabad": "Ald", "prayagraj": "Ald",
    "trivandrum": "Tvm", "madurai": "Mad", "tiruchirappalli": "Tri", "salem": "Slm",
    "jammu": "Jam", "srinagar": "Srn", "shimla": "Shm", "panaji": "Pnj", "goa": "Goa",
    "siliguri": "Slg", "durgapur": "Drg", "jamshedpur": "Jms", "bokaro": "Bok",
}


def generate_site_code(city: str, locality: str, org_id: str) -> str:
    """Generate a unique site code like 'DelRG-01' for an outlet."""
    # City abbreviation
    city_lower = (city or "").strip().lower()
    city_abbr = CITY_ABBREVIATIONS.get(city_lower, (city or "XXX")[:3].title())

    # Locality abbreviation: first letter of each word, uppercase, max 3 chars
    if locality and locality.strip():
        words = locality.strip().split()
        loc_abbr = "".join(w[0].upper() for w in words if w)[:3]
    else:
        loc_abbr = "XX"

    prefix = f"{city_abbr}{loc_abbr}"

    # Find next sequence number for this prefix within the org
    try:
        existing = supabase.table("outlets").select("site_code").eq("org_id", org_id).ilike("site_code", f"{prefix}-%").execute()
        seq = len(existing.data) + 1
    except Exception:
        seq = 1

    return f"{prefix}-{seq:02d}"


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

    city = get_val(premises.get("city"))
    locality = get_val(premises.get("locality"))
    site_code = generate_site_code(city, locality, org_id)

    outlet_data = {
        "org_id": org_id,
        "name": get_val(premises.get("property_name")) or get_val(parties.get("brand_name")) or "New Outlet",
        "brand_name": get_val(parties.get("brand_name")),
        "address": get_val(premises.get("full_address")),
        "city": city,
        "locality": locality,
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
        "site_code": site_code,
    }

    # Remove None values
    outlet_data = {k: v for k, v in outlet_data.items() if v is not None}
    result = supabase.table("outlets").insert(outlet_data).execute()
    return result.data[0]["id"]


def create_agreement_record(extraction: dict, doc_type: str, risk_flags: list, confidence: dict,
                            filename: str, org_id: str, outlet_id: str, document_text: Optional[str] = None) -> str:
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
        "document_text": document_text,
        "confirmed_at": datetime.utcnow().isoformat(),
        "document_text": document_text,
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

    # Insert alerts and dispatch notifications
    created = []
    for alert in alerts:
        result = supabase.table("alerts").insert(alert).execute()
        inserted = result.data[0]
        created.append(inserted)
        try:
            dispatch_notification(org_id, inserted)
        except Exception:
            pass  # Notification failure should not break alert creation
    return created


# ============================================
# API ENDPOINTS
# ============================================

@app.get("/api/health")
async def health_check():
    return {"status": "healthy", "service": "grospace-ai", "timestamp": datetime.utcnow().isoformat()}


@app.post("/api/upload-and-extract")
@limiter.limit("5/minute")
async def upload_and_extract(request: Request, file: UploadFile = File(...)):
    """Upload a document (PDF or image) and extract structured data."""
    MAX_FILE_SIZE = 50 * 1024 * 1024  # 50MB
    ALLOWED_TYPES = {
        "application/pdf", "image/png", "image/jpeg", "image/webp",
        "image/gif", "image/bmp", "image/tiff",
    }
    ALLOWED_EXTENSIONS = {".pdf", ".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif"}

    try:
        filename = file.filename or "unknown"
        file_ext = ("." + filename.rsplit(".", 1)[-1]).lower() if "." in filename else ""
        content_type = file.content_type or ""

        if content_type not in ALLOWED_TYPES and file_ext not in ALLOWED_EXTENSIONS:
            raise HTTPException(status_code=400, detail=f"Unsupported file type: {content_type or file_ext}. Upload a PDF or image.")

        file_bytes = await file.read()

        if len(file_bytes) > MAX_FILE_SIZE:
            raise HTTPException(status_code=413, detail=f"File too large ({len(file_bytes) / (1024*1024):.1f}MB). Maximum is 50MB.")

        if not file_bytes or len(file_bytes) == 0:
            return {
                "status": "partial",
                "document_type": "lease_loi",
                "extraction": {},
                "confidence": {},
                "risk_flags": [],
                "filename": filename,
                "text_length": 0,
                "extraction_method": "failed",
                "error": "Uploaded file is empty.",
            }

        result = await process_document(file_bytes, filename)
        return result

    except Exception as e:
        return {
            "status": "partial",
            "document_type": "lease_loi",
            "extraction": {},
            "confidence": {},
            "risk_flags": [],
            "filename": file.filename or "unknown",
            "text_length": 0,
            "extraction_method": "failed",
            "error": f"Unexpected error: {str(e)}",
        }


@app.post("/api/classify")
async def classify_endpoint(req: ClassifyRequest):
    """Classify document type from text."""
    try:
        doc_type = await classify_document(req.text)
        return {"document_type": doc_type}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/api/extract")
@limiter.limit("10/minute")
async def extract_endpoint(request: Request, req: ExtractRequest):
    """Process an uploaded document from Supabase URL. Handles PDFs, scanned docs, and images."""
    try:
        file_bytes = await download_file(req.file_url)
        filename = req.file_url.split("/")[-1].split("?")[0] or "document.pdf"

        result = await process_document(file_bytes, filename)

        # Update agreement record in Supabase
        update_data = {
            "extracted_data": result["extraction"],
            "extraction_confidence": result["confidence"],
            "risk_flags": result["risk_flags"],
            "extraction_status": "review",
            "type": result["document_type"],
        }
        if result.get("document_text"):
            update_data["document_text"] = result["document_text"]
        supabase.table("agreements").update(update_data).eq("id", req.agreement_id).execute()

        return {
            "status": "review",
            "agreement_id": req.agreement_id,
            "document_type": result["document_type"],
            "extraction": result["extraction"],
            "confidence": result["confidence"],
            "risk_flags": result["risk_flags"],
            "extraction_method": result["extraction_method"],
        }

    except Exception as e:
        try:
            supabase.table("agreements").update({
                "extraction_status": "failed",
            }).eq("id", req.agreement_id).execute()
        except Exception:
            pass
        return {
            "status": "failed",
            "agreement_id": req.agreement_id,
            "error": str(e),
            "extraction": {},
            "confidence": {},
            "risk_flags": [],
        }


@app.post("/api/qa")
@limiter.limit("20/minute")
async def qa_endpoint(request: Request, req: QARequest):
    """Answer questions about a specific agreement document with conversation history."""
    try:
        # Fetch agreement data from DB
        result = supabase.table("agreements").select("extracted_data, document_url, document_text").eq("id", req.agreement_id).single().execute()
        if not result.data:
            raise HTTPException(status_code=404, detail="Agreement not found")

        extracted_data = result.data.get("extracted_data", {})
        doc_url = result.data.get("document_url")
        cached_text = result.data.get("document_text")

        # --- Conversation history ---
        session_id = req.session_id
        conversation_history = []
        if session_id:
            try:
                sess = supabase.table("document_qa_sessions").select("messages").eq("id", session_id).single().execute()
                if sess.data:
                    conversation_history = sess.data.get("messages", []) or []
            except Exception:
                pass

        formatted_history = ""
        if conversation_history:
            last_messages = conversation_history[-10:]
            for msg in last_messages:
                role = msg.get("role", "user")
                text_content = msg.get("content", "")
                formatted_history += f"{'User' if role == 'user' else 'Assistant'}: {text_content}\n\n"

        # --- Get document text (use cached text first, then fallback to re-download) ---
        document_text = cached_text or req.document_text
        if not document_text and doc_url:
            try:
                pdf_bytes = await download_file(doc_url)
                document_text = extract_text_from_pdf(pdf_bytes)
            except Exception:
                document_text = None

        # If text extraction failed (scanned doc), try Cloud Vision OCR first, then Gemini vision
        if (not document_text or len(document_text.strip()) < 100) and doc_url:
            try:
                if not locals().get("pdf_bytes"):
                    pdf_bytes = await download_file(doc_url)
                images = pdf_bytes_to_images(pdf_bytes)
                if images:
                    # Try Cloud Vision OCR first
                    cloud_text = extract_text_cloud_vision(images)
                    if len(cloud_text.strip()) >= 100:
                        document_text = clean_ocr_text(cloud_text)
                    else:
                        # Fall back to Gemini vision Q&A
                        history_block = f"\nConversation history:\n{formatted_history}\n" if formatted_history else ""
                        qa_prompt = (
                            "You are an AI assistant helping users understand their commercial lease documents. "
                            "Look at these document page images carefully.\n\n"
                            "Rules:\n"
                            "- Only answer based on the document provided. Do not make assumptions.\n"
                            "- ALWAYS quote the relevant clause text from the document in your answer using blockquotes.\n"
                            "- Include the section/clause number if identifiable.\n"
                            "- If the answer is not in the document, say so clearly.\n"
                            "- Keep answers concise but complete.\n"
                            f"{history_block}\n"
                            f"User question: {req.question}"
                        )
                        content = [qa_prompt] + images[:15]
                        response = model.generate_content(
                            content,
                            generation_config=genai.GenerationConfig(temperature=0.1, max_output_tokens=1500),
                        )
                        answer = response.text
                        # Save to session
                        session_id = _save_qa_session(session_id, req.agreement_id, req.question, answer, conversation_history)
                        return {"answer": answer, "agreement_id": req.agreement_id, "session_id": session_id}
            except Exception:
                pass

        # Build context from whatever we have
        extraction_summary = json.dumps(extracted_data, indent=2) if extracted_data else ""
        history_block = f"\nConversation history:\n{formatted_history}\n" if formatted_history else ""

        if document_text and len(document_text.strip()) >= 100:
            prompt = (
                "You are an AI assistant helping users understand their commercial lease documents. "
                "You have access to the full text of a specific lease/agreement document.\n\n"
                "Rules:\n"
                "- Only answer based on the document provided. Do not make assumptions.\n"
                "- ALWAYS quote the relevant clause text from the document in your answer using blockquotes (> quote).\n"
                "- Include the section/clause number if identifiable.\n"
                "- If the answer is not in the document, say so clearly.\n"
                "- Keep answers concise but complete.\n"
                "- Use simple language, avoid unnecessary legal jargon.\n"
                f"{history_block}\n"
                f"Document text:\n{document_text[:12000]}\n\n"
                f"Extracted data summary:\n{extraction_summary[:4000]}\n\n"
                f"User question: {req.question}"
            )
        elif extraction_summary and extraction_summary != "{}":
            prompt = (
                "You are an AI assistant helping users understand their commercial lease documents. "
                "You have access to the AI-extracted structured data from this agreement.\n\n"
                "Rules:\n"
                "- Only answer based on the extracted data provided. Do not make assumptions.\n"
                "- If the specific information is not in the extracted data, say so clearly.\n"
                "- Keep answers concise but complete.\n"
                "- Use simple language, avoid unnecessary legal jargon.\n"
                f"{history_block}\n"
                f"Extracted agreement data:\n{extraction_summary[:12000]}\n\n"
                f"User question: {req.question}"
            )
        else:
            raise HTTPException(status_code=404, detail="No document data available for this agreement")

        response = model.generate_content(
            prompt,
            generation_config=genai.GenerationConfig(
                temperature=0.1,
                max_output_tokens=1500,
            ),
        )

        answer = response.text

        # Save to conversation session
        session_id = _save_qa_session(session_id, req.agreement_id, req.question, answer, conversation_history)

        return {"answer": answer, "agreement_id": req.agreement_id, "session_id": session_id}

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


def _save_qa_session(session_id: Optional[str], agreement_id: str, question: str, answer: str, history: list) -> str:
    """Save Q&A exchange to document_qa_sessions table. Returns session_id."""
    new_messages = history + [
        {"role": "user", "content": question},
        {"role": "assistant", "content": answer},
    ]
    try:
        if session_id:
            supabase.table("document_qa_sessions").update({
                "messages": new_messages,
                "updated_at": datetime.utcnow().isoformat(),
            }).eq("id", session_id).execute()
            return session_id
        else:
            new_id = str(uuid.uuid4())
            supabase.table("document_qa_sessions").insert({
                "id": new_id,
                "agreement_id": agreement_id,
                "messages": new_messages,
                "created_at": datetime.utcnow().isoformat(),
                "updated_at": datetime.utcnow().isoformat(),
            }).execute()
            return new_id
    except Exception:
        return session_id or str(uuid.uuid4())


@app.post("/api/risk-flags")
@limiter.limit("10/minute")
async def risk_flags_endpoint(request: Request, req: RiskFlagRequest):
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
@limiter.limit("10/minute")
async def confirm_and_activate(request: Request, req: ConfirmActivateRequest):
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
            document_text=req.document_text,
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
async def list_organizations(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List all organizations (paginated)."""
    offset = (page - 1) * page_size
    count_result = supabase.table("organizations").select("id", count="exact").execute()
    total = count_result.count or 0
    result = supabase.table("organizations").select("*").order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


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
async def list_agreements(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List agreements with outlet info (paginated)."""
    offset = (page - 1) * page_size
    count_result = supabase.table("agreements").select("id", count="exact").execute()
    total = count_result.count or 0
    result = supabase.table("agreements").select(
        "*, outlets(name, city, address, property_type, status)"
    ).order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


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


@app.patch("/api/agreements/{agreement_id}")
async def update_agreement(agreement_id: str, body: UpdateAgreementRequest):
    """Update extracted fields on an agreement (sparse dot-notation merge)."""
    # Fetch current agreement
    current = supabase.table("agreements").select("extracted_data").eq("id", agreement_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    extracted = current.data.get("extracted_data") or {}

    # Apply dot-notation field_updates into extracted_data
    if body.field_updates:
        for dot_key, new_val in body.field_updates.items():
            parts = dot_key.split(".", 1)
            if len(parts) == 2:
                section, field = parts
                if section not in extracted:
                    extracted[section] = {}
                if isinstance(extracted[section], dict):
                    existing = extracted[section].get(field)
                    # Preserve confidence wrapper if it exists
                    if isinstance(existing, dict) and "value" in existing:
                        existing["value"] = new_val
                        extracted[section][field] = existing
                    else:
                        extracted[section][field] = new_val

    # Build top-level shortcut updates from extracted_data
    shortcuts = {}
    shortcut_map = {
        "parties.lessor_name": "lessor_name",
        "parties.lessee_name": "lessee_name",
        "rent.monthly_rent": "monthly_rent",
        "charges.cam_monthly": "cam_monthly",
        "rent.revenue_share_pct": "revenue_share_pct",
        "lease_term.lease_start_date": "lease_start_date",
        "lease_term.lease_expiry_date": "lease_expiry_date",
        "lease_term.lock_in_period": "lock_in_period",
        "deposits.security_deposit": "security_deposit",
    }
    if body.field_updates:
        for dot_key, new_val in body.field_updates.items():
            if dot_key in shortcut_map:
                col = shortcut_map[dot_key]
                # For numeric columns, try to convert
                if col in ("monthly_rent", "cam_monthly", "security_deposit", "revenue_share_pct"):
                    try:
                        shortcuts[col] = float(str(new_val).replace(",", ""))
                    except (ValueError, TypeError):
                        shortcuts[col] = new_val
                else:
                    shortcuts[col] = new_val

    update_payload = {"extracted_data": extracted, **shortcuts}

    # Full replace of extracted_data if provided
    if body.extracted_data:
        update_payload["extracted_data"] = body.extracted_data

    result = supabase.table("agreements").update(update_payload).eq("id", agreement_id).execute()

    # Log activity
    if result.data and body.field_updates:
        agr = result.data[0]
        org_id = agr.get("org_id")
        if org_id:
            log_activity(org_id, None, "agreement", agreement_id, "fields_edited", {
                "fields": list(body.field_updates.keys()),
            })

    return {"agreement": result.data[0] if result.data else None}


@app.get("/api/outlets")
async def list_outlets(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List outlets (paginated)."""
    offset = (page - 1) * page_size
    count_result = supabase.table("outlets").select("id", count="exact").execute()
    total = count_result.count or 0
    result = supabase.table("outlets").select(
        "*, agreements(id, type, status, monthly_rent, lease_expiry_date, risk_flags)"
    ).order("created_at", desc=True).range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@app.get("/api/outlets/{outlet_id}")
async def get_outlet(outlet_id: str):
    """Get a single outlet with agreements, obligations, alerts, and documents."""
    result = supabase.table("outlets").select("*").eq("id", outlet_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    agreements = supabase.table("agreements").select("*").eq("outlet_id", outlet_id).execute()
    obligations = supabase.table("obligations").select("*").eq("outlet_id", outlet_id).execute()
    alerts = supabase.table("alerts").select("*").eq("outlet_id", outlet_id).order("trigger_date").execute()
    documents = supabase.table("documents").select("*").eq("outlet_id", outlet_id).order("uploaded_at", desc=True).execute()

    return {
        "outlet": result.data,
        "agreements": agreements.data,
        "obligations": obligations.data,
        "alerts": alerts.data,
        "documents": documents.data if documents.data else [],
    }


@app.patch("/api/outlets/{outlet_id}")
async def update_outlet(outlet_id: str, req: UpdateOutletRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Update outlet fields (revenue, status)."""
    # Fetch current outlet for change tracking
    current = supabase.table("outlets").select("status, monthly_net_revenue, org_id").eq("id", outlet_id).single().execute()
    if not current.data:
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
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("outlets").update(update_data).eq("id", outlet_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    # Log activity
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

    return {"outlet": result.data[0]}


# ============================================
# DOCUMENT MANAGEMENT (Drive-like multi-doc per outlet)
# ============================================

@app.get("/api/outlets/{outlet_id}/documents")
async def list_outlet_documents(outlet_id: str):
    """List all documents for an outlet."""
    result = supabase.table("documents").select("*").eq("outlet_id", outlet_id).order("uploaded_at", desc=True).execute()
    return {"documents": result.data if result.data else []}


@app.post("/api/outlets/{outlet_id}/documents")
async def upload_outlet_document(
    outlet_id: str,
    file: UploadFile = File(...),
    category: str = Form("other"),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """Upload a document to an outlet (Drive-like multi-doc support)."""
    # Validate outlet exists
    outlet = supabase.table("outlets").select("id, org_id").eq("id", outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    org_id = outlet.data.get("org_id")

    # Read file
    file_bytes = await file.read()
    file_size = len(file_bytes)
    if file_size > 50 * 1024 * 1024:
        raise HTTPException(status_code=413, detail="File too large. Maximum 50MB allowed.")

    # Determine file type
    filename = file.filename or "document"
    ext = os.path.splitext(filename.lower())[1]
    file_type = "pdf" if ext == ".pdf" else ("image" if ext in {".jpg", ".jpeg", ".png"} else "other")

    # Upload to Supabase storage
    storage_path = f"documents/{org_id}/{outlet_id}/{uuid.uuid4()}{ext}"
    try:
        supabase.storage.from_("documents").upload(storage_path, file_bytes, {
            "content-type": file.content_type or "application/octet-stream"
        })
        file_url = supabase.storage.from_("documents").get_public_url(storage_path)
    except Exception:
        # Fallback — store reference without actual upload
        file_url = f"storage://{storage_path}"

    # Save document record
    doc_data = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "outlet_id": outlet_id,
        "file_url": file_url,
        "filename": filename,
        "file_type": category or file_type,
        "file_size_bytes": file_size,
        "uploaded_by": user.user_id if user else None,
    }

    result = supabase.table("documents").insert(doc_data).execute()

    # Log activity
    if org_id:
        log_activity(org_id, user.user_id if user else None, "document", doc_data["id"], "uploaded", {
            "filename": filename,
            "outlet_id": outlet_id,
            "category": category,
        })

    return {"document": result.data[0] if result.data else doc_data}


@app.delete("/api/documents/{document_id}")
async def delete_document(document_id: str, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Delete a document."""
    doc = supabase.table("documents").select("id, org_id, file_url, filename, outlet_id").eq("id", document_id).single().execute()
    if not doc.data:
        raise HTTPException(status_code=404, detail="Document not found")

    # Delete from storage if possible
    try:
        file_url = doc.data.get("file_url", "")
        if "storage://" in file_url:
            path = file_url.replace("storage://", "")
            supabase.storage.from_("documents").remove([path])
    except Exception:
        pass

    # Delete record
    supabase.table("documents").delete().eq("id", document_id).execute()

    # Log
    org_id = doc.data.get("org_id")
    if org_id:
        log_activity(org_id, user.user_id if user else None, "document", document_id, "deleted", {
            "filename": doc.data.get("filename"),
            "outlet_id": doc.data.get("outlet_id"),
        })

    return {"deleted": True}


@app.get("/api/alerts")
async def list_alerts(
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


@app.get("/api/dashboard")
async def dashboard_stats():
    """Get dashboard statistics."""
    outlets = supabase.table("outlets").select("id, name, status, city, property_type, franchise_model, monthly_net_revenue, deal_stage").execute()
    agreements = supabase.table("agreements").select("id, outlet_id, status, monthly_rent, cam_monthly, total_monthly_outflow, lease_expiry_date, risk_flags").execute()
    obligations = supabase.table("obligations").select("id, type, amount, is_active").execute()
    alerts = supabase.table("alerts").select("id, type, severity, status, trigger_date").execute()
    payments = supabase.table("payment_records").select("id, status, due_amount").execute()

    # Calculate stats
    total_outlets = len(outlets.data)
    total_agreements = len(agreements.data)
    active_agreements = len([a for a in agreements.data if a.get("status") == "active"])
    total_monthly_rent = sum(a.get("monthly_rent") or 0 for a in agreements.data)
    total_monthly_outflow = sum(a.get("total_monthly_outflow") or 0 for a in agreements.data)
    total_risk_flags = sum(len(a.get("risk_flags") or []) for a in agreements.data)
    pending_alerts = len([a for a in alerts.data if a.get("status") == "pending"])

    # Payment stats
    overdue_payments = [p for p in (payments.data or []) if p.get("status") == "overdue"]
    overdue_amount = sum(p.get("due_amount") or 0 for p in overdue_payments)

    # Pipeline stats
    pipeline_stages = {}
    for o in outlets.data:
        stage = o.get("deal_stage") or "lead"
        pipeline_stages[stage] = pipeline_stages.get(stage, 0) + 1

    # Expiring leases (next 90 days)
    today = date.today()
    expiring = []
    for a in agreements.data:
        try:
            if a.get("lease_expiry_date"):
                days_left = (date.fromisoformat(a["lease_expiry_date"]) - today).days
                if 0 <= days_left <= 90:
                    expiring.append(a)
        except (ValueError, TypeError):
            pass

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

    # Outlet details by city (for map hover cards)
    rent_by_outlet = {}
    for a in agreements.data:
        oid = a.get("outlet_id")
        if oid:
            rent_by_outlet[oid] = a.get("monthly_rent") or 0

    outlet_details_by_city = {}
    for o in outlets.data:
        city = o.get("city") or "Unknown"
        if city not in outlet_details_by_city:
            outlet_details_by_city[city] = []
        outlet_details_by_city[city].append({
            "id": o.get("id", ""),
            "name": o.get("name", ""),
            "status": o.get("status", "unknown"),
            "rent": rent_by_outlet.get(o["id"], 0),
        })

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
        "outlet_details_by_city": outlet_details_by_city,
        "overdue_payments_count": len(overdue_payments),
        "overdue_amount": overdue_amount,
        "pipeline_stages": pipeline_stages,
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
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List payment records with optional filters (paginated)."""
    offset = (page - 1) * page_size

    # Build count query with same filters
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
# CUSTOM REMINDERS CRUD
# ============================================

@app.post("/api/reminders")
async def create_reminder(
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

    # Dispatch notification for the new reminder
    if result.data and org_id:
        try:
            dispatch_notification(org_id, result.data[0])
        except Exception:
            pass

    # Log activity
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


@app.patch("/api/reminders/{reminder_id}")
async def update_reminder(reminder_id: str, req: UpdateReminderRequest):
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

    # Log activity
    org_id = existing.data.get("org_id")
    if org_id:
        entity_id = existing.data.get("outlet_id") or org_id
        entity_type = "outlet" if existing.data.get("outlet_id") else "organization"
        log_activity(org_id, None, entity_type, entity_id, "reminder_updated", {
            "reminder_id": reminder_id,
            "updated_fields": list(update_data.keys()),
        })

    return {"reminder": result.data[0] if result.data else None}


@app.delete("/api/reminders/{reminder_id}")
async def delete_reminder(reminder_id: str):
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

@app.get("/api/activity-log")
async def get_activity_log(
    entity_type: str = Query(...),
    entity_id: str = Query(...),
    limit: int = Query(50, ge=1, le=200),
):
    """Get activity log for a specific entity (outlet, agreement, organization)."""
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


# ============================================
# DEAL PIPELINE ENDPOINTS
# ============================================

DEAL_STAGES = ["lead", "site_visit", "negotiation", "loi_signed", "fit_out", "operational"]

@app.get("/api/pipeline")
async def get_pipeline(user: Optional[CurrentUser] = Depends(get_current_user)):
    """Get all outlets grouped by deal_stage for the Kanban board."""
    org_id = get_org_filter(user)

    query = supabase.table("outlets").select(
        "id, name, city, status, deal_stage, deal_stage_entered_at, deal_notes, deal_priority, "
        "created_at, agreements(id, type, status, monthly_rent)"
    )
    if org_id:
        query = query.eq("org_id", org_id)
    result = query.order("deal_stage_entered_at", desc=False).execute()

    stages: dict = {stage: [] for stage in DEAL_STAGES}
    for outlet in result.data:
        stage = outlet.get("deal_stage") or "lead"
        if stage not in stages:
            stage = "lead"
        stages[stage].append(outlet)

    return {"stages": stages}


@app.patch("/api/pipeline/move")
async def move_pipeline_card(req: MovePipelineRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Move an outlet to a new deal stage."""
    if req.new_stage not in DEAL_STAGES:
        raise HTTPException(status_code=400, detail=f"Invalid stage. Must be one of: {', '.join(DEAL_STAGES)}")

    # Get current outlet
    current = supabase.table("outlets").select("deal_stage, org_id").eq("id", req.outlet_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    old_stage = current.data.get("deal_stage") or "lead"
    update_data: dict = {
        "deal_stage": req.new_stage,
        "deal_stage_entered_at": datetime.utcnow().isoformat(),
    }
    if req.deal_notes is not None:
        update_data["deal_notes"] = req.deal_notes

    result = supabase.table("outlets").update(update_data).eq("id", req.outlet_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    # Log activity
    org_id = current.data.get("org_id")
    if org_id:
        log_activity(org_id, user.user_id if user else None, "outlet", req.outlet_id, "deal_stage_changed", {
            "old_stage": old_stage,
            "new_stage": req.new_stage,
        })

    return {"outlet": result.data[0]}


@app.patch("/api/pipeline/{outlet_id}")
async def update_pipeline_deal(outlet_id: str, req: UpdatePipelineDealRequest):
    """Update deal priority or notes without changing stage."""
    update_data: dict = {}
    if req.deal_priority is not None:
        if req.deal_priority not in ("low", "medium", "high"):
            raise HTTPException(status_code=400, detail="Invalid priority. Must be low, medium, or high")
        update_data["deal_priority"] = req.deal_priority
    if req.deal_notes is not None:
        update_data["deal_notes"] = req.deal_notes
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("outlets").update(update_data).eq("id", outlet_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Outlet not found")
    return {"outlet": result.data[0]}


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


# ============================================
# SHOWCASE ENDPOINTS
# ============================================

@app.post("/api/showcase")
async def create_showcase(req: CreateShowcaseRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Create a shareable showcase token for an outlet."""
    # Get outlet to determine org_id
    outlet = supabase.table("outlets").select("org_id, name").eq("id", req.outlet_id).single().execute()
    if not outlet.data:
        raise HTTPException(status_code=404, detail="Outlet not found")

    insert_data: dict = {
        "org_id": outlet.data["org_id"],
        "outlet_id": req.outlet_id,
        "include_financials": req.include_financials,
    }
    if req.title:
        insert_data["title"] = req.title
    else:
        insert_data["title"] = f"{outlet.data.get('name', 'Outlet')} Showcase"
    if req.description:
        insert_data["description"] = req.description
    if req.expires_at:
        insert_data["expires_at"] = req.expires_at
    if user:
        insert_data["created_by"] = user.user_id

    result = supabase.table("showcase_tokens").insert(insert_data).execute()
    return {"showcase": result.data[0] if result.data else None}


@app.get("/api/showcase")
async def list_showcases(
    outlet_id: Optional[str] = Query(None),
    user: Optional[CurrentUser] = Depends(get_current_user),
):
    """List showcase tokens for the org (optionally filtered by outlet)."""
    org_id = get_org_filter(user)
    query = supabase.table("showcase_tokens").select("*, outlets(name, city)")
    if org_id:
        query = query.eq("org_id", org_id)
    if outlet_id:
        query = query.eq("outlet_id", outlet_id)
    result = query.order("created_at", desc=True).execute()
    return {"showcases": result.data}


@app.patch("/api/showcase/{token_id}")
async def update_showcase(token_id: str, req: UpdateShowcaseRequest):
    """Update a showcase token."""
    update_data: dict = {}
    if req.title is not None:
        update_data["title"] = req.title
    if req.description is not None:
        update_data["description"] = req.description
    if req.include_financials is not None:
        update_data["include_financials"] = req.include_financials
    if req.is_active is not None:
        update_data["is_active"] = req.is_active
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("showcase_tokens").update(update_data).eq("id", token_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Showcase token not found")
    return {"showcase": result.data[0]}


@app.get("/api/showcase/public/{token}")
async def get_public_showcase(token: str):
    """Public endpoint — no auth required. Returns outlet info for a valid showcase token."""
    result = supabase.table("showcase_tokens").select(
        "*, outlets(id, name, brand_name, address, city, state, property_type, floor, unit_number, "
        "super_area_sqft, covered_area_sqft, status, franchise_model)"
    ).eq("token", token).eq("is_active", True).single().execute()

    if not result.data:
        raise HTTPException(status_code=404, detail="Showcase not found or inactive")

    showcase = result.data

    # Check expiry
    if showcase.get("expires_at"):
        from datetime import datetime as dt
        try:
            exp = dt.fromisoformat(showcase["expires_at"].replace("Z", "+00:00"))
            if exp < dt.now(exp.tzinfo):
                raise HTTPException(status_code=404, detail="This showcase link has expired")
        except (ValueError, TypeError):
            pass

    outlet = showcase.get("outlets") or {}
    outlet_id = showcase.get("outlet_id")

    # Get active agreement summary
    agreements = supabase.table("agreements").select(
        "type, status, lease_commencement_date, lease_expiry_date, monthly_rent, cam_monthly, "
        "security_deposit, total_monthly_outflow"
    ).eq("outlet_id", outlet_id).eq("status", "active").execute()

    response: dict = {
        "title": showcase.get("title"),
        "description": showcase.get("description"),
        "outlet": outlet,
        "agreements": [],
    }

    if showcase.get("include_financials") and agreements.data:
        response["agreements"] = agreements.data
    elif agreements.data:
        # Strip financial data
        response["agreements"] = [
            {k: v for k, v in a.items() if k not in ("monthly_rent", "cam_monthly", "security_deposit", "total_monthly_outflow")}
            for a in agreements.data
        ]

    return response


# ============================================
# SETTINGS ENDPOINTS
# ============================================

@app.patch("/api/organizations/{org_id}")
async def update_organization(org_id: str, req: UpdateOrganizationRequest):
    """Update organization name/settings."""
    update_data: dict = {}
    if req.name is not None:
        update_data["name"] = req.name
    if req.logo_url is not None:
        update_data["logo_url"] = req.logo_url
    if req.alert_preferences is not None:
        update_data["alert_preferences"] = req.alert_preferences
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("organizations").update(update_data).eq("id", org_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"organization": result.data[0]}


@app.get("/api/organizations/{org_id}/members")
async def list_org_members(
    org_id: str,
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
):
    """List all profiles belonging to an organization (paginated)."""
    offset = (page - 1) * page_size
    count_result = supabase.table("profiles").select("id", count="exact").eq("org_id", org_id).execute()
    total = count_result.count or 0
    result = supabase.table("profiles").select("*").eq("org_id", org_id).range(offset, offset + page_size - 1).execute()
    return {"items": result.data, "total": total, "page": page, "page_size": page_size}


@app.post("/api/organizations/{org_id}/invite")
async def invite_org_member(org_id: str, req: InviteMemberRequest):
    """Invite a member — uses Supabase Auth admin invite, then updates profile with org/role."""
    try:
        # Check if user already exists in profiles
        existing = supabase.table("profiles").select("id, org_id").eq("email", req.email).execute()
        if existing.data and len(existing.data) > 0:
            # User exists — update their org_id and role
            user_id = existing.data[0]["id"]
            supabase.table("profiles").update({
                "org_id": org_id,
                "role": req.role,
            }).eq("id", user_id).execute()
            member = {**existing.data[0], "org_id": org_id, "role": req.role, "email": req.email}
        else:
            # New user — use Supabase Auth admin invite (creates auth.users entry + sends magic link)
            try:
                invite_result = supabase.auth.admin.invite_user_by_email(req.email)
                user_id = invite_result.user.id if invite_result and invite_result.user else None
            except Exception:
                user_id = None

            if user_id:
                # The trigger auto-creates a profile; update it with org/role
                supabase.table("profiles").update({
                    "org_id": org_id,
                    "role": req.role,
                    "full_name": req.email.split("@")[0].title(),
                }).eq("id", user_id).execute()
                member = {"id": user_id, "email": req.email, "role": req.role, "org_id": org_id}
            else:
                raise HTTPException(status_code=500, detail="Failed to invite user via auth system")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))

    # Send invitation email
    email_sent = False
    try:
        org_result = supabase.table("organizations").select("name").eq("id", org_id).single().execute()
        org_name = org_result.data.get("name", "GroSpace") if org_result.data else "GroSpace"

        invite_html = f"""
        <html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
        <div style="border-bottom:2px solid #000;padding-bottom:10px;margin-bottom:20px">
            <h2 style="margin:0">GroSpace</h2>
        </div>
        <h3>You've been invited to {org_name}</h3>
        <p>You've been invited to join <strong>{org_name}</strong> on GroSpace as a <strong>{req.role.replace('_', ' ').title()}</strong>.</p>
        <p>GroSpace is a smart lease management platform for managing outlets, agreements, payments, and alerts across your property portfolio.</p>
        <div style="margin:24px 0">
            <a href="{os.getenv('NEXT_PUBLIC_APP_URL', 'https://grospace.app')}/auth/login" style="background:#000;color:#fff;padding:10px 24px;text-decoration:none;border-radius:6px;font-weight:600">Accept Invitation</a>
        </div>
        <p style="color:#999;font-size:12px">If you didn't expect this invitation, you can safely ignore this email.</p>
        </body></html>
        """
        email_sent = send_email_via_resend(
            req.email,
            f"You've been invited to {org_name} on GroSpace",
            invite_html,
        )
    except Exception:
        pass  # Email failure should not break the invite

    return {"member": member, "email_sent": email_sent}


@app.delete("/api/organizations/{org_id}/members/{user_id}")
async def remove_org_member(org_id: str, user_id: str):
    """Remove a member from the organization."""
    result = supabase.table("profiles").delete().eq("id", user_id).eq("org_id", org_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Member not found")
    return {"deleted": True}


@app.get("/api/profile")
async def get_profile(user: Optional[CurrentUser] = Depends(get_current_user)):
    """Get the current user's profile."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    result = supabase.table("profiles").select("*").eq("id", user.user_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"profile": result.data}


@app.patch("/api/profile")
async def update_profile(req: UpdateProfileRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """Update the current user's profile."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    update_data: dict = {}
    if req.full_name is not None:
        update_data["full_name"] = req.full_name
    if not update_data:
        raise HTTPException(status_code=400, detail="No fields to update")

    result = supabase.table("profiles").update(update_data).eq("id", user.user_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Profile not found")
    return {"profile": result.data[0]}


@app.get("/api/alert-preferences/{org_id}")
async def get_alert_preferences(org_id: str):
    """Get alert preferences for an organization."""
    result = supabase.table("organizations").select("alert_preferences").eq("id", org_id).single().execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"preferences": result.data.get("alert_preferences") or {}}


@app.put("/api/alert-preferences/{org_id}")
async def save_alert_preferences(org_id: str, req: AlertPreferencesRequest):
    """Save alert preferences for an organization."""
    result = supabase.table("organizations").update({"alert_preferences": req.preferences}).eq("id", org_id).execute()
    if not result.data:
        raise HTTPException(status_code=404, detail="Organization not found")
    return {"preferences": req.preferences}


# ============================================
# EMAIL DIGEST STUB
# ============================================

@app.post("/api/digest/send")
async def send_digest(cron_secret: Optional[str] = Header(None, alias="X-Cron-Secret")):
    """Collect today's alerts + overdue payments per org and return digest data.
    Ready to wire to Resend/SendGrid later — just add the send call."""
    # In production, validate cron_secret against an env var
    today = date.today()

    # Get all orgs
    orgs = supabase.table("organizations").select("id, name").execute()

    digests = []
    for org in orgs.data:
        org_id = org["id"]

        # Upcoming alerts (next 7 days)
        upcoming_alerts = supabase.table("alerts").select(
            "id, title, severity, trigger_date, type"
        ).eq("org_id", org_id).eq("status", "pending").gte(
            "trigger_date", today.isoformat()
        ).lte(
            "trigger_date", (today + timedelta(days=7)).isoformat()
        ).execute()

        # Overdue payments
        overdue_payments = supabase.table("payment_records").select(
            "id, due_amount, due_date, outlets(name)"
        ).eq("org_id", org_id).eq("status", "overdue").execute()

        digests.append({
            "org_id": org_id,
            "org_name": org["name"],
            "upcoming_alerts": upcoming_alerts.data,
            "overdue_payments": overdue_payments.data,
            "alert_count": len(upcoming_alerts.data),
            "overdue_count": len(overdue_payments.data),
        })

    # Send emails if Resend is configured
    resend_configured = bool(os.getenv("RESEND_API_KEY"))
    emails_sent = 0
    if resend_configured:
        for d in digests:
            if d["alert_count"] == 0 and d["overdue_count"] == 0:
                continue
            # Get org admins
            try:
                members = supabase.table("profiles").select("email").eq("org_id", d["org_id"]).in_("role", ["org_admin", "platform_admin"]).execute()
                admin_emails = [m["email"] for m in (members.data or []) if m.get("email")]
            except Exception:
                admin_emails = []

            if admin_emails:
                # Build digest HTML
                preview_result = await preview_digest(org_id=d["org_id"])
                html_body = preview_result.get("html", "")
                subject = f"[GroSpace] Daily Digest — {d['org_name']} — {today.strftime('%b %d')}"
                for email in admin_emails:
                    if send_email_via_resend(email, subject, html_body):
                        emails_sent += 1

    return {
        "date": today.isoformat(),
        "digests": digests,
        "emails_sent": emails_sent,
        "message": f"Digest sent to {emails_sent} recipients." if emails_sent > 0 else ("Digest data collected. Set RESEND_API_KEY to enable email delivery." if not resend_configured else "No digests required today."),
    }


@app.post("/api/digest/preview")
async def preview_digest(org_id: str = Query(...)):
    """Return HTML preview of what the digest email would look like."""
    today = date.today()

    upcoming_alerts = supabase.table("alerts").select(
        "title, severity, trigger_date, type"
    ).eq("org_id", org_id).eq("status", "pending").gte(
        "trigger_date", today.isoformat()
    ).lte(
        "trigger_date", (today + timedelta(days=7)).isoformat()
    ).order("trigger_date").execute()

    overdue_payments = supabase.table("payment_records").select(
        "due_amount, due_date, outlets(name)"
    ).eq("org_id", org_id).eq("status", "overdue").order("due_date").execute()

    # Simple HTML preview
    alert_rows = ""
    for a in upcoming_alerts.data:
        alert_rows += f'<tr><td>{a["title"]}</td><td>{a["severity"]}</td><td>{a["trigger_date"]}</td></tr>'

    payment_rows = ""
    for p in overdue_payments.data:
        outlet_name = p.get("outlets", {}).get("name", "Unknown") if p.get("outlets") else "Unknown"
        amount = p.get("due_amount", 0)
        payment_rows += f'<tr><td>{outlet_name}</td><td>Rs {amount:,.0f}</td><td>{p["due_date"]}</td></tr>'

    org = supabase.table("organizations").select("name").eq("id", org_id).single().execute()
    org_name = org.data.get("name", "Organization") if org.data else "Organization"

    html = f"""
    <html><body style="font-family:sans-serif;max-width:600px;margin:auto;padding:20px">
    <h2>GroSpace Daily Digest — {org_name}</h2>
    <p style="color:#666">{today.strftime('%B %d, %Y')}</p>
    <h3>Upcoming Alerts ({len(upcoming_alerts.data)})</h3>
    {"<table border='1' cellpadding='8' cellspacing='0' width='100%'><tr><th>Alert</th><th>Severity</th><th>Date</th></tr>" + alert_rows + "</table>" if alert_rows else "<p style='color:#999'>No upcoming alerts this week.</p>"}
    <h3 style="margin-top:20px">Overdue Payments ({len(overdue_payments.data)})</h3>
    {"<table border='1' cellpadding='8' cellspacing='0' width='100%'><tr><th>Outlet</th><th>Amount</th><th>Due Date</th></tr>" + payment_rows + "</table>" if payment_rows else "<p style='color:#999'>No overdue payments.</p>"}
    <hr style="margin-top:30px"><p style="color:#999;font-size:12px">This is an automated digest from GroSpace.</p>
    </body></html>
    """

    return {"html": html, "org_name": org_name, "date": today.isoformat()}


# ============================================
# CROSS-PORTFOLIO Q&A
# ============================================

PORTFOLIO_QA_SCHEMA = """You have access to a PostgreSQL database with these tables:

- outlets (id uuid, name text, brand_name text, address text, city text, state text, status text, property_type text, franchise_model text, monthly_net_revenue numeric, deal_stage text, org_id uuid)
- agreements (id uuid, outlet_id uuid, org_id uuid, type text, status text, lease_commencement_date date, lease_expiry_date date, monthly_rent numeric, cam_monthly numeric, total_monthly_outflow numeric, security_deposit numeric, escalation_percentage numeric, rent_model text)
- obligations (id uuid, outlet_id uuid, org_id uuid, type text, amount numeric, frequency text, next_escalation_date date, is_active boolean)
- alerts (id uuid, outlet_id uuid, org_id uuid, type text, severity text, title text, trigger_date date, status text)
- payment_records (id uuid, outlet_id uuid, org_id uuid, status text, due_amount numeric, paid_amount numeric, due_date date, period_year int, period_month int)

Important notes:
- All monetary values are in Indian Rupees (INR).
- The current date is {current_date}.
- Always filter by org_id = '{org_id}' for data security.
- Only generate SELECT queries. Never INSERT, UPDATE, DELETE, DROP, or ALTER.
- Return valid PostgreSQL SQL only, no markdown or explanation.
- Join tables using outlet_id or id as appropriate.
- For city/state/name filters, use ILIKE for case-insensitive matching.
"""


@app.post("/api/portfolio-qa")
@limiter.limit("15/minute")
async def portfolio_qa_endpoint(request: Request, req: PortfolioQARequest, authorization: Optional[str] = Header(None)):
    """Answer natural language questions across the portfolio using SQL generation."""
    try:
        # Get user and org_id
        org_id = req.org_id
        if not org_id and authorization:
            try:
                token = authorization.replace("Bearer ", "")
                user_resp = supabase.auth.get_user(token)
                if user_resp and user_resp.user:
                    profile = supabase.table("profiles").select("org_id").eq("id", user_resp.user.id).single().execute()
                    if profile.data:
                        org_id = profile.data.get("org_id")
            except Exception:
                pass

        if not org_id:
            raise HTTPException(status_code=400, detail="Organization context required")

        current_date = date.today().isoformat()

        # Step 1: Generate SQL from natural language
        sql_prompt = (
            "Convert this natural language question into a PostgreSQL SELECT query.\n\n"
            + PORTFOLIO_QA_SCHEMA.format(current_date=current_date, org_id=org_id)
            + f"\n\nUser question: {req.question}\n\n"
            "Return ONLY the SQL query, nothing else. No markdown code blocks."
        )

        sql_response = model.generate_content(
            sql_prompt,
            generation_config=genai.GenerationConfig(temperature=0, max_output_tokens=500),
        )
        generated_sql = sql_response.text.strip()

        # Clean up SQL (remove markdown code blocks if present)
        if generated_sql.startswith("```"):
            generated_sql = generated_sql.split("\n", 1)[1] if "\n" in generated_sql else generated_sql[3:]
        if generated_sql.endswith("```"):
            generated_sql = generated_sql[:-3].strip()
        if generated_sql.lower().startswith("sql"):
            generated_sql = generated_sql[3:].strip()

        # Safety check: only SELECT queries allowed
        sql_upper = generated_sql.upper().strip()
        if not sql_upper.startswith("SELECT"):
            raise HTTPException(status_code=400, detail="Only SELECT queries are allowed")
        forbidden = ["INSERT", "UPDATE", "DELETE", "DROP", "ALTER", "TRUNCATE", "CREATE", "GRANT", "REVOKE"]
        for keyword in forbidden:
            if keyword in sql_upper.split("SELECT", 1)[0] or f" {keyword} " in f" {sql_upper} ":
                # Allow keywords appearing in WHERE clauses as values (e.g., status = 'active')
                # but reject if they appear as SQL commands
                if sql_upper.index(keyword) < sql_upper.index("FROM") if "FROM" in sql_upper else True:
                    raise HTTPException(status_code=400, detail=f"Forbidden SQL operation: {keyword}")

        # Step 2: Execute the query
        try:
            query_result = supabase.rpc("exec_readonly_sql", {"query_text": generated_sql}).execute()
            rows = query_result.data if query_result.data else []
        except Exception:
            # If RPC not available, try direct table queries as fallback
            rows = []
            try:
                # Simple fallback: run via postgrest if possible
                query_result = supabase.postgrest.rpc("exec_readonly_sql", {"query_text": generated_sql}).execute()
                rows = query_result.data if query_result.data else []
            except Exception:
                rows = []

        # Step 3: Generate natural language answer from results
        answer_prompt = (
            "You are a helpful portfolio analytics assistant for a commercial real estate management platform.\n"
            f"The user asked: \"{req.question}\"\n\n"
            f"The database query returned these results:\n{json.dumps(rows[:50], indent=2, default=str)}\n\n"
            "Rules:\n"
            "- Provide a clear, concise answer summarizing the data.\n"
            "- Format numbers as Indian currency (Rs) where applicable.\n"
            "- If results are empty, say so clearly.\n"
            "- Include specific outlet/agreement names when available.\n"
            "- Use a professional but conversational tone.\n"
        )

        answer_response = model.generate_content(
            answer_prompt,
            generation_config=genai.GenerationConfig(temperature=0.2, max_output_tokens=1000),
        )

        return {
            "answer": answer_response.text,
            "data": rows[:50],
            "sql_used": generated_sql,
            "row_count": len(rows),
        }

    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# ============================================
# SMART AI CHAT (Dashboard AI Assistant)
# ============================================

@app.post("/api/smart-chat")
@limiter.limit("15/minute")
async def smart_chat(request: Request, req: SmartChatRequest, user: Optional[CurrentUser] = Depends(get_current_user)):
    """AI-powered dashboard chat — ask questions about your portfolio data.
    Queries the database, builds context, and uses Gemini to answer."""
    question = req.question.strip()
    if not question:
        raise HTTPException(status_code=400, detail="Question is required")

    # Determine org scope
    org_id = req.org_id
    if not org_id and user and user.org_id:
        org_id = user.org_id
    if not org_id:
        # Fallback: try to get first org
        orgs = supabase.table("organizations").select("id").limit(1).execute()
        org_id = orgs.data[0]["id"] if orgs.data else None
    if not org_id:
        raise HTTPException(status_code=400, detail="Organization context required")

    # Gather comprehensive portfolio data for AI context
    try:
        # Outlets summary
        outlets_q = supabase.table("outlets").select("id, name, brand_name, city, status, property_type, franchise_model, monthly_net_revenue, deal_stage, deal_priority")
        if org_id:
            outlets_q = outlets_q.eq("org_id", org_id)
        outlets_result = outlets_q.limit(200).execute()
        outlets = outlets_result.data or []

        # Agreements summary
        agreements_q = supabase.table("agreements").select("id, outlet_id, type, status, monthly_rent, cam_monthly, total_monthly_outflow, security_deposit, lease_commencement_date, lease_expiry_date, lock_in_end_date, rent_model, risk_flags, lessor_name, lessee_name, brand_name")
        if org_id:
            agreements_q = agreements_q.eq("org_id", org_id)
        agreements_result = agreements_q.limit(200).execute()
        agreements = agreements_result.data or []

        # Alerts summary
        alerts_q = supabase.table("alerts").select("id, type, severity, title, trigger_date, status, outlet_id")
        if org_id:
            alerts_q = alerts_q.eq("org_id", org_id)
        alerts_result = alerts_q.eq("status", "pending").limit(100).execute()
        alerts = alerts_result.data or []

        # Payments summary (overdue + upcoming)
        payments_q = supabase.table("payment_records").select("id, outlet_id, due_amount, due_date, status, period_month, period_year")
        if org_id:
            payments_q = payments_q.eq("org_id", org_id)
        payments_result = payments_q.in_("status", ["overdue", "due", "upcoming"]).limit(200).execute()
        payments = payments_result.data or []

        # Obligations summary
        obligations_q = supabase.table("obligations").select("id, outlet_id, type, frequency, amount, escalation_pct, is_active")
        if org_id:
            obligations_q = obligations_q.eq("org_id", org_id)
        obligations_result = obligations_q.eq("is_active", True).limit(200).execute()
        obligations = obligations_result.data or []

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch portfolio data: {str(e)}")

    # Build outlet name lookup
    outlet_names = {o["id"]: o.get("name", "Unknown") for o in outlets}

    # Compute summary stats
    total_monthly_rent = sum(a.get("monthly_rent") or 0 for a in agreements if a.get("status") == "active")
    total_monthly_outflow = sum(a.get("total_monthly_outflow") or 0 for a in agreements if a.get("status") == "active")
    overdue_payments = [p for p in payments if p.get("status") == "overdue"]
    total_overdue = sum(p.get("due_amount") or 0 for p in overdue_payments)

    # Escalation data
    escalation_obligations = [o for o in obligations if (o.get("escalation_pct") or 0) > 0]

    # Risk flags
    all_risk_flags = []
    for a in agreements:
        flags = a.get("risk_flags") or []
        if isinstance(flags, list):
            for f in flags:
                all_risk_flags.append({
                    "agreement": a.get("brand_name") or a.get("lessee_name") or a["id"][:8],
                    "outlet": outlet_names.get(a.get("outlet_id"), "Unknown"),
                    "flag": f if isinstance(f, str) else f.get("flag", str(f)),
                })

    # Build context for Gemini
    context = f"""You are GroSpace AI, a smart assistant for commercial real estate lease management.
The user manages a portfolio of {len(outlets)} outlet(s) with {len(agreements)} agreement(s).

PORTFOLIO SUMMARY:
- Total outlets: {len(outlets)}
- Outlets by status: {json.dumps({s: len([o for o in outlets if o.get("status") == s]) for s in set(o.get("status", "unknown") for o in outlets)})}
- Outlets by city: {json.dumps({c: len([o for o in outlets if o.get("city") == c]) for c in set(o.get("city", "Unknown") for o in outlets)})}
- Deal pipeline: {json.dumps({s: len([o for o in outlets if o.get("deal_stage") == s]) for s in set(o.get("deal_stage", "lead") for o in outlets)})}
- Total active monthly rent: Rs {total_monthly_rent:,.0f}
- Total monthly outflow (rent+CAM+charges): Rs {total_monthly_outflow:,.0f}
- Pending alerts: {len(alerts)}
- Overdue payments: {len(overdue_payments)} totaling Rs {total_overdue:,.0f}

OUTLETS:
{json.dumps([{{"name": o.get("name"), "city": o.get("city"), "status": o.get("status"), "type": o.get("property_type"), "revenue": o.get("monthly_net_revenue"), "deal_stage": o.get("deal_stage"), "priority": o.get("deal_priority")}} for o in outlets[:20]])}

AGREEMENTS (active):
{json.dumps([{{"outlet": outlet_names.get(a.get("outlet_id"), "Unknown"), "type": a.get("type"), "monthly_rent": a.get("monthly_rent"), "total_outflow": a.get("total_monthly_outflow"), "rent_model": a.get("rent_model"), "expiry": a.get("lease_expiry_date"), "lock_in_end": a.get("lock_in_end_date")}} for a in agreements if a.get("status") == "active"][:20])}

ESCALATION OBLIGATIONS:
{json.dumps([{{"outlet": outlet_names.get(o.get("outlet_id"), "Unknown"), "type": o.get("type"), "amount": o.get("amount"), "escalation_pct": o.get("escalation_pct")}} for o in escalation_obligations[:15]])}

RISK FLAGS:
{json.dumps(all_risk_flags[:15])}

PENDING ALERTS (top 15):
{json.dumps([{{"title": a.get("title"), "type": a.get("type"), "severity": a.get("severity"), "outlet": outlet_names.get(a.get("outlet_id"), "Unknown")}} for a in alerts[:15]])}

OVERDUE PAYMENTS:
{json.dumps([{{"outlet": outlet_names.get(p.get("outlet_id"), "Unknown"), "amount": p.get("due_amount"), "due_date": p.get("due_date")}} for p in overdue_payments[:15]])}


Answer the user's question based on this data. Be specific with numbers, outlet names, and dates.
Format your response in clear, readable text. Use bullet points for lists.
If the user asks about escalation struggles, focus on which outlets have high escalation rates and what their impact is.
If asked for recommendations, be actionable and specific."""

    try:
        response = model.generate_content(
            [context, f"User question: {question}"],
            generation_config={"temperature": 0.3, "max_output_tokens": 4096},
        )
        # Handle cases where Gemini returns no valid parts (safety filter, empty response)
        if not response.candidates or not response.candidates[0].content.parts:
            finish_reason = response.candidates[0].finish_reason if response.candidates else "unknown"
            answer = "I'm sorry, I couldn't generate a response for that question. Please try rephrasing your question."
        else:
            answer = response.text
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"AI generation failed: {str(e)}")

    return {
        "answer": answer,
        "context_summary": {
            "outlets": len(outlets),
            "agreements": len(agreements),
            "pending_alerts": len(alerts),
            "overdue_payments": len(overdue_payments),
            "total_monthly_rent": total_monthly_rent,
        },
    }


# ============================================
# SAVE AS DRAFT
# ============================================

class SaveDraftRequest(BaseModel):
    extracted_data: dict
    risk_flags: list = []

@app.patch("/api/agreements/{agreement_id}/save-draft")
async def save_as_draft(agreement_id: str, body: SaveDraftRequest):
    """Save extraction as draft without creating obligations/alerts."""
    current = supabase.table("agreements").select("id").eq("id", agreement_id).single().execute()
    if not current.data:
        raise HTTPException(status_code=404, detail="Agreement not found")

    update_data = {
        "extracted_data": body.extracted_data,
        "risk_flags": body.risk_flags,
        "status": "draft",
    }
    result = supabase.table("agreements").update(update_data).eq("id", agreement_id).execute()
    return {"status": "ok", "agreement_id": agreement_id, "message": "Saved as draft"}


# ============================================
# BULK MARK PAID
# ============================================

class BulkMarkPaidRequest(BaseModel):
    payment_ids: Optional[List[str]] = None
    month: Optional[int] = None
    year: Optional[int] = None
    org_id: Optional[str] = None

@app.post("/api/payments/bulk-mark-paid")
async def bulk_mark_paid(body: BulkMarkPaidRequest):
    """Bulk mark payments as paid — by IDs or by month/year."""
    updated = 0

    if body.payment_ids:
        for pid in body.payment_ids:
            supabase.table("payment_records").update({
                "status": "paid",
                "paid_amount": supabase.table("payment_records").select("due_amount").eq("id", pid).single().execute().data.get("due_amount", 0),
            }).eq("id", pid).execute()
            updated += 1
    elif body.month and body.year:
        # Fetch all pending/due/overdue payments for that month
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


# ============================================
# MGLR CALCULATION
# ============================================

class MGLRRequest(BaseModel):
    outlet_id: str
    dine_in_revenue: float
    delivery_revenue: float

@app.post("/api/calculate-mglr")
async def calculate_mglr(body: MGLRRequest):
    """Calculate hybrid MGLR rent for an outlet based on revenue."""
    # Get outlet's agreement with rent schedule
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
# CRON TRIGGER ENDPOINTS (manual trigger)
# ============================================

@app.post("/api/cron/agreement-transitions")
async def cron_agreement_transitions():
    """Manually trigger agreement status transitions."""
    today = date.today()
    updated = {"to_expiring": 0, "to_expired": 0}

    # Active → expiring (within 90 days of expiry)
    active = supabase.table("agreements").select("id, lease_expiry_date").eq("status", "active").execute().data or []
    for a in active:
        exp = a.get("lease_expiry_date")
        if exp:
            try:
                exp_date = date.fromisoformat(exp)
                if today < exp_date <= today + timedelta(days=90):
                    supabase.table("agreements").update({"status": "expiring"}).eq("id", a["id"]).execute()
                    updated["to_expiring"] += 1
            except (ValueError, TypeError):
                pass

    # Active/expiring → expired (past expiry)
    expirable = supabase.table("agreements").select("id, lease_expiry_date").in_("status", ["active", "expiring"]).execute().data or []
    for a in expirable:
        exp = a.get("lease_expiry_date")
        if exp:
            try:
                exp_date = date.fromisoformat(exp)
                if exp_date < today:
                    supabase.table("agreements").update({"status": "expired"}).eq("id", a["id"]).execute()
                    updated["to_expired"] += 1
            except (ValueError, TypeError):
                pass

    return {"status": "ok", **updated}


@app.post("/api/cron/payment-status-update")
async def cron_payment_status_update():
    """Mark overdue payments automatically."""
    today = date.today()
    pending = supabase.table("payment_records").select("id, due_date").in_("status", ["pending", "due", "upcoming"]).execute().data or []
    updated = 0
    for p in pending:
        dd = p.get("due_date")
        if dd:
            try:
                if date.fromisoformat(dd) < today:
                    supabase.table("payment_records").update({"status": "overdue"}).eq("id", p["id"]).execute()
                    updated += 1
            except (ValueError, TypeError):
                pass

    return {"status": "ok", "marked_overdue": updated}


@app.post("/api/cron/escalation-calculator")
async def cron_escalation_calculator():
    """Check and apply rent escalations that are due."""
    today = date.today()
    escalated = 0

    obligations = supabase.table("obligations").select("id, amount, type, agreement_id").eq("is_active", True).eq("type", "rent").execute().data or []
    for ob in obligations:
        agreement = supabase.table("agreements").select("extracted_data, org_id").eq("id", ob["agreement_id"]).single().execute()
        if not agreement.data:
            continue
        ed = agreement.data.get("extracted_data") or {}
        rent = ed.get("rent", {})
        esc_pct = get_num(rent.get("escalation_percentage"))
        esc_freq = int(get_num(rent.get("escalation_frequency_years")) or 0)
        if not esc_pct or esc_pct <= 0 or esc_freq <= 0:
            continue

        lt = ed.get("lease_term", {})
        base_str = lt.get("rent_commencement_date") or lt.get("lease_commencement_date")
        if not base_str:
            continue
        try:
            base_date = date.fromisoformat(str(base_str))
        except (ValueError, TypeError):
            continue

        from dateutil.relativedelta import relativedelta as rd
        years_elapsed = (today.year - base_date.year) + (today.month - base_date.month) / 12
        if years_elapsed < esc_freq:
            continue

        next_esc_year = int((int(years_elapsed) // esc_freq) * esc_freq + esc_freq)
        anniversary = base_date + rd(years=next_esc_year)
        if anniversary == today:
            new_amount = round(ob["amount"] * (1 + esc_pct / 100), 2)
            supabase.table("obligations").update({"amount": new_amount}).eq("id", ob["id"]).execute()
            # Log
            supabase.table("activity_log").insert({
                "org_id": agreement.data.get("org_id"),
                "entity_type": "obligation",
                "entity_id": ob["id"],
                "action": "escalation_applied",
                "details": json.dumps({
                    "old_amount": ob["amount"],
                    "new_amount": new_amount,
                    "escalation_pct": esc_pct,
                }),
            }).execute()
            escalated += 1

    return {"status": "ok", "escalated": escalated}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
