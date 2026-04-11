"""
Core configuration: environment variables, constants, shared clients, and helpers.
"""

from __future__ import annotations

import os
import time
from functools import lru_cache

from dotenv import load_dotenv
from httpx import ConnectError, ConnectTimeout, ReadError, ReadTimeout, RemoteProtocolError, Timeout, WriteError
from slowapi import Limiter
from slowapi.util import get_remote_address
from supabase import Client, ClientOptions, create_client

load_dotenv()

# ============================================
# CONSTANTS
# ============================================

SUPPORTED_IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".bmp", ".tiff", ".tif"}
SUPPORTED_PDF_EXTENSIONS = {".pdf"}
SUPPORTED_EXTENSIONS = SUPPORTED_PDF_EXTENSIONS | SUPPORTED_IMAGE_EXTENSIONS

ALERT_TYPES_LIST = [
    "rent_due", "cam_due", "escalation", "lease_expiry", "license_expiry",
    "lock_in_expiry", "renewal_window", "fit_out_deadline", "deposit_installment",
    "revenue_reconciliation", "custom",
]

DEAL_STAGES = ["lead", "site_visit", "negotiation", "loi", "agreement", "fitout", "operational", "closed"]

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

ROLE_PERMISSIONS = {
    # Can do everything (CEO)
    "platform_admin": {"*"},
    # Full CRUD on their org + member management (Admin)
    "org_admin": {
        "view_outlets", "create_outlets", "edit_outlets", "delete_outlets",
        "view_agreements", "create_agreements", "edit_agreements", "delete_agreements",
        "view_alerts", "assign_alerts", "acknowledge_alerts",
        "view_payments", "update_payments",
        "view_reports", "export_reports",
        "manage_org_settings", "manage_org_members",
    },
    # Operations read + light updates (Manager)
    "org_member": {
        "view_outlets", "view_agreements", "view_alerts", "acknowledge_alerts",
        "view_payments", "update_payments", "view_reports",
    },
    # Read-only financial view (CFO) — can see all financial data,
    # run reports, export, but cannot create/edit/delete anything
    "finance_viewer": {
        "view_outlets", "view_agreements", "view_alerts",
        "view_payments", "view_reports", "export_reports",
    },
}

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

# ============================================
# SHARED CLIENTS
# ============================================


class _LazyClientProxy:
    """Small proxy so heavy SDK clients are created only on first real use."""

    def __init__(self, factory):
        self._factory = factory

    def __getattr__(self, item):
        return getattr(self._factory(), item)


@lru_cache(maxsize=1)
def get_supabase_client() -> Client:
    return create_client(
        os.getenv("SUPABASE_URL", ""),
        os.getenv("SUPABASE_SERVICE_ROLE_KEY", ""),
        options=ClientOptions(
            postgrest_client_timeout=Timeout(10.0, connect=5.0),
        ),
    )


@lru_cache(maxsize=1)
def _get_genai_module():
    import google.generativeai as genai

    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        print("[CONFIG] WARNING: GEMINI_API_KEY is not set — extraction will fail.", flush=True)
    genai.configure(api_key=api_key)
    return genai


@lru_cache(maxsize=1)
def get_fast_model():
    genai = _get_genai_module()
    # Allow env override so we can switch models without a redeploy
    model_name = os.getenv("GEMINI_FAST_MODEL", "gemini-2.5-flash").strip()
    return genai.GenerativeModel(model_name)


def _normalize_gemini_model_name(model_name: str) -> str:
    aliases = {
        # The Gemini API currently exposes 3.1 Pro as a preview model name.
        "gemini-3.1-pro": "gemini-3.1-pro-preview",
    }
    return aliases.get(model_name, model_name)


@lru_cache(maxsize=1)
def get_pro_model():
    genai = _get_genai_module()
    # Gemini 3.1 Pro. Keep a compatibility alias for envs that omit the preview suffix.
    # Override with GEMINI_PRO_MODEL env var if you ever need to switch without redeploy.
    model_name = _normalize_gemini_model_name(os.getenv("GEMINI_PRO_MODEL", "gemini-3.1-pro-preview").strip())
    return genai.GenerativeModel(model_name)


genai = _LazyClientProxy(_get_genai_module)
supabase: Client = _LazyClientProxy(get_supabase_client)
model = _LazyClientProxy(get_fast_model)  # Fast model for classification, Q&A, light tasks
model_pro = _LazyClientProxy(get_pro_model)  # Best model for extraction, risk analysis, vision OCR

limiter = Limiter(key_func=get_remote_address)

TRANSIENT_SUPABASE_ERRORS = (
    RemoteProtocolError,
    ReadTimeout,
    ConnectTimeout,
    ConnectError,
    ReadError,
    WriteError,
)

# ============================================
# ACTIVITY LOG HELPER
# ============================================

def log_activity(org_id: str, user_id: str | None, entity_type: str, entity_id: str, action: str, details: dict | None = None):
    """Insert an activity log entry. Non-blocking — failures are silently ignored."""
    import uuid
    try:
        supabase.table("activity_log").insert({
            "id": str(uuid.uuid4()),
            "org_id": org_id,
            "user_id": user_id,
            "entity_type": entity_type,
            "entity_id": entity_id,
            "action": action,
            "details": details or {},
        }).execute()
    except Exception:
        pass  # Activity logging should never break the main flow


def execute_supabase_query(factory, retries: int = 1, retry_delay_seconds: float = 0.25):
    """Execute a Supabase/PostgREST query with a small retry budget for transient transport errors."""
    for attempt in range(retries + 1):
        try:
            return factory().execute()
        except TRANSIENT_SUPABASE_ERRORS:
            if attempt >= retries:
                raise
            time.sleep(retry_delay_seconds * (attempt + 1))
