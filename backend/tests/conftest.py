"""
Shared fixtures for GroSpace backend tests.
Mocks external services: Supabase, Gemini, Resend, MSG91.
"""

import os
import sys
import json
import types
import pytest
from unittest.mock import MagicMock, patch, AsyncMock
from datetime import date, datetime

# Ensure backend package is importable
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

# ---------------------------------------------------------------------------
# Set dummy env vars BEFORE importing main (main.py calls create_client at
# module level, so we need valid-looking strings to avoid SDK errors).
# ---------------------------------------------------------------------------
os.environ.setdefault("SUPABASE_URL", "https://fake.supabase.co")
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "fake-service-role-key")
os.environ.setdefault("GEMINI_API_KEY", "fake-gemini-key")
os.environ.setdefault("RESEND_API_KEY", "")
os.environ.setdefault("MSG91_AUTH_KEY", "")

# ---------------------------------------------------------------------------
# Pre-install mock modules for heavy/unavailable C-extension dependencies
# so that `import main` does not fail in the test environment.
# ---------------------------------------------------------------------------
for _mod_name in (
    "fitz",
    "pdf2image",
    "PIL",
    "PIL.Image",
    "dotenv",
    "python-dotenv",
    "google",
    "google.generativeai",
    "google.cloud",
    "google.cloud.vision",
    "supabase",
    "slowapi",
    "slowapi.util",
    "slowapi.errors",
    "sentry_sdk",
):
    if _mod_name not in sys.modules:
        sys.modules[_mod_name] = MagicMock()

# Ensure google.cloud.vision is accessible as a sub-attribute too
_gc = sys.modules["google.cloud"]
_gc.vision = sys.modules["google.cloud.vision"]

# google module hierarchy
_g = sys.modules["google"]
_g.cloud = _gc
_g.generativeai = sys.modules["google.generativeai"]

# PIL.Image needs to be a proper mock with an Open method
_pil = sys.modules["PIL"]
_pil.Image = sys.modules["PIL.Image"]

# dotenv
sys.modules["dotenv"].load_dotenv = MagicMock()

# slowapi needs specific attributes
_slowapi = sys.modules["slowapi"]
_slowapi.Limiter = MagicMock(return_value=MagicMock())
_slowapi._rate_limit_exceeded_handler = MagicMock()
sys.modules["slowapi.util"].get_remote_address = MagicMock()

# RateLimitExceeded must be a real exception class for add_exception_handler
class _FakeRateLimitExceeded(Exception):
    pass

sys.modules["slowapi.errors"].RateLimitExceeded = _FakeRateLimitExceeded

# supabase.create_client should return a MagicMock
sys.modules["supabase"].create_client = MagicMock(return_value=MagicMock())
sys.modules["supabase"].Client = MagicMock

# google.generativeai stubs
_genai = sys.modules["google.generativeai"]
_genai.configure = MagicMock()
_genai.GenerativeModel = MagicMock(return_value=MagicMock())
_genai.GenerationConfig = MagicMock()


# ---------------------------------------------------------------------------
# Helper: chainable mock that mimics the Supabase query-builder pattern
#   supabase.table("x").select("y").eq("k", "v").execute()
# ---------------------------------------------------------------------------
class _SupabaseResponse:
    """Mimics the postgrest response object."""
    def __init__(self, data=None, count=None):
        self.data = data or []
        self.count = count if count is not None else len(self.data)


class _QueryBuilder:
    """Chainable mock for supabase.table(...).select(...).eq(...).execute()."""
    def __init__(self, data=None, count=None):
        self._data = data or []
        self._count = count

    # Every chainable method just returns self
    def select(self, *a, **kw):   return self
    def insert(self, *a, **kw):   return self
    def update(self, *a, **kw):   return self
    def delete(self, *a, **kw):   return self
    def upsert(self, *a, **kw):   return self
    def eq(self, *a, **kw):       return self
    def neq(self, *a, **kw):      return self
    def in_(self, *a, **kw):      return self
    def ilike(self, *a, **kw):    return self
    def gte(self, *a, **kw):      return self
    def lte(self, *a, **kw):      return self
    def order(self, *a, **kw):    return self
    def limit(self, *a, **kw):    return self
    def range(self, *a, **kw):    return self
    def single(self):             return self

    def execute(self):
        return _SupabaseResponse(self._data, self._count)


@pytest.fixture()
def mock_supabase():
    """Return a MagicMock Supabase client whose .table() returns a QueryBuilder."""
    client = MagicMock()

    # Default: table() returns an empty QueryBuilder
    client.table.return_value = _QueryBuilder()

    # Auth stubs
    client.auth.get_user.return_value = MagicMock(user=None)
    client.auth.admin.invite_user_by_email.return_value = MagicMock(user=None)

    return client


def _make_query_builder(data=None, count=None):
    """Convenience factory exposed to tests."""
    return _QueryBuilder(data=data, count=count)


@pytest.fixture()
def query_builder():
    return _make_query_builder


@pytest.fixture()
def mock_gemini_model():
    """Return a MagicMock Gemini GenerativeModel."""
    model = MagicMock()
    response = MagicMock()
    response.text = "{}"
    response.candidates = []
    model.generate_content.return_value = response
    return model


class _AppProxy:
    """Proxy that exposes functions from all backend modules as if they were on main."""
    def __init__(self, main_mod, config_mod, modules):
        self._main = main_mod
        self._config = config_mod
        self._modules = modules  # list of imported modules to search

    @property
    def app(self):
        return self._main.app

    def __getattr__(self, name):
        # Check main first
        if hasattr(self._main, name):
            return getattr(self._main, name)
        # Check config
        if hasattr(self._config, name):
            return getattr(self._config, name)
        # Check all sub-modules
        for mod in self._modules:
            if hasattr(mod, name):
                return getattr(mod, name)
        raise AttributeError(f"No attribute '{name}' found in any backend module")


@pytest.fixture()
def patched_app(mock_supabase, mock_gemini_model):
    """
    Import main.py with Supabase + Gemini patched out, return a proxy object
    that exposes functions from all backend modules.
    """
    import main as _main
    import core.config as _config
    import core.dependencies as _deps
    import core.models as _models

    # Import service and route modules
    _extra_modules = [_deps, _models]
    try:
        import services.extraction as _extraction
        _extra_modules.append(_extraction)
    except Exception:
        pass
    try:
        import services.email_service as _email
        _extra_modules.append(_email)
    except Exception:
        pass
    try:
        import services.whatsapp_service as _whatsapp
        _extra_modules.append(_whatsapp)
    except Exception:
        pass

    # Import route modules
    for rmod_name in ['routes.auth', 'routes.documents', 'routes.outlets', 'routes.agreements',
                      'routes.payments', 'routes.alerts', 'routes.pipeline', 'routes.admin', 'routes.reports']:
        try:
            mod = __import__(rmod_name, fromlist=[rmod_name.split('.')[-1]])
            _extra_modules.append(mod)
        except Exception:
            pass

    # Swap module-level clients so every function uses our mocks
    _orig_sb = _config.supabase
    _orig_model = _config.model
    _config.supabase = mock_supabase
    _config.model = mock_gemini_model

    # Also make sure genai.GenerationConfig is available
    _config.genai.GenerationConfig = MagicMock()

    # Patch supabase/model in all imported sub-modules
    _patched = []
    for mod in _extra_modules:
        if hasattr(mod, 'supabase'):
            _patched.append((mod, 'supabase', getattr(mod, 'supabase')))
            mod.supabase = mock_supabase
        if hasattr(mod, 'model'):
            _patched.append((mod, 'model', getattr(mod, 'model')))
            mod.model = mock_gemini_model

    proxy = _AppProxy(_main, _config, _extra_modules)
    yield proxy

    # Restore originals
    _config.supabase = _orig_sb
    _config.model = _orig_model
    for mod, attr, orig_val in _patched:
        setattr(mod, attr, orig_val)


@pytest.fixture()
def client(patched_app):
    """TestClient for the FastAPI app."""
    from fastapi.testclient import TestClient
    return TestClient(patched_app.app)


# ---------------------------------------------------------------------------
# Reusable sample extraction data
# ---------------------------------------------------------------------------
@pytest.fixture()
def sample_lease_extraction():
    return {
        "parties": {
            "lessor_name": "ABC Realty Pvt Ltd",
            "lessee_name": "XYZ Foods Pvt Ltd",
            "brand_name": "Cafe Delight",
            "lessor_address": "123 MG Road, Delhi",
            "lessee_address": "456 Park Street, Mumbai",
        },
        "premises": {
            "property_name": "Metro Mall",
            "full_address": "Unit 101, Metro Mall, Rajouri Garden, New Delhi 110027",
            "locality": "Rajouri Garden",
            "city": "New Delhi",
            "state": "Delhi",
            "pincode": "110027",
            "property_type": "mall",
            "floor": "1st Floor",
            "unit_number": "101",
            "super_area_sqft": 1500,
            "covered_area_sqft": 1200,
            "carpet_area_sqft": 1000,
        },
        "lease_term": {
            "lease_commencement_date": "2025-01-01",
            "rent_commencement_date": "2025-02-01",
            "lease_expiry_date": "2030-01-01",
            "lease_term_years": 5,
            "lock_in_months": 36,
            "notice_period_months": 3,
            "fit_out_period_days": 30,
            "fit_out_rent_free": True,
        },
        "rent": {
            "rent_model": "fixed",
            "rent_schedule": [
                {"year": 1, "monthly_rent": 150000, "rent_per_sqft": 100},
                {"year": 2, "monthly_rent": 165000, "rent_per_sqft": 110},
            ],
            "escalation_percentage": 10,
            "escalation_frequency_years": 1,
            "mglr_payment_day": 5,
        },
        "charges": {
            "cam_monthly": 25000,
            "cam_escalation_pct": 5,
            "hvac_rate_per_sqft": 15,
            "electricity_load_kw": 50,
        },
        "deposits": {
            "security_deposit_amount": 900000,
            "cam_deposit_amount": 50000,
            "utility_deposit_per_kw": 2000,
        },
        "legal": {
            "late_payment_interest_pct": 18,
            "subletting_allowed": False,
        },
        "franchise": {
            "franchise_model": "FOFO",
        },
    }


@pytest.fixture()
def sample_license_extraction():
    return {
        "certificate_type": "FSSAI",
        "issuing_authority": "FSSAI",
        "certificate_number": "12345678901234",
        "entity_name": "XYZ Foods Pvt Ltd",
        "entity_address": "Unit 101, Metro Mall, New Delhi",
        "date_of_issue": "2025-01-15",
        "valid_from": "2025-01-15",
        "valid_to": "2028-01-14",
        "key_conditions_summary": "Food business operator license for restaurant operations.",
    }


@pytest.fixture()
def sample_bill_extraction():
    return {
        "bill_type": "electricity",
        "provider_name": "BSES Rajdhani",
        "consumer_name": "XYZ Foods Pvt Ltd",
        "bill_date": "2025-03-01",
        "due_date": "2025-03-15",
        "total_amount": 45000,
        "units_consumed": 3000,
        "rate_per_unit": 12.5,
        "payment_status": "unpaid",
    }
