"""
Pydantic request/response models used across the API.
"""

from typing import Optional, List
from pydantic import BaseModel


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
    document_url: Optional[str] = None  # URL to the uploaded document in storage
    file_hash: Optional[str] = None  # SHA256 hash for duplicate detection
    custom_notes: Optional[str] = None  # User-added notes during review
    custom_clauses: Optional[list] = None  # User-added custom clauses [{name, value}]


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
    name: Optional[str] = None
    city: Optional[str] = None
    address: Optional[str] = None
    property_type: Optional[str] = None
    floor: Optional[str] = None
    unit_number: Optional[str] = None
    monthly_net_revenue: Optional[float] = None
    status: Optional[str] = None
    site_code: Optional[str] = None
    business_category: Optional[str] = None
    company_name: Optional[str] = None
    super_area_sqft: Optional[float] = None
    covered_area_sqft: Optional[float] = None
    carpet_area_sqft: Optional[float] = None
    notes: Optional[str] = None


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
    outlet_id: Optional[str] = None  # Focus context on specific outlet
    session_history: Optional[list] = None  # Previous Q&A pairs for context


class SaveDraftRequest(BaseModel):
    extracted_data: dict
    risk_flags: list = []


class BulkMarkPaidRequest(BaseModel):
    payment_ids: Optional[List[str]] = None
    month: Optional[int] = None
    year: Optional[int] = None
    org_id: Optional[str] = None


class MGLRRequest(BaseModel):
    outlet_id: str
    dine_in_revenue: float
    delivery_revenue: float


class CurrentUser(BaseModel):
    user_id: str
    email: str
    role: str = "org_member"
    org_id: Optional[str] = None


class FeedbackRequest(BaseModel):
    agreement_id: str
    field_name: str
    original_value: Optional[str] = None
    corrected_value: Optional[str] = None
    comment: Optional[str] = None


class CreatePilotRequest(BaseModel):
    client_name: str
    brand_name: str
    cities: List[str]
    num_outlets: int
    admin_email: str
    admin_password: str
    ceo_email: Optional[str] = None
    ceo_password: Optional[str] = None


class UpsertRevenueRequest(BaseModel):
    month: int
    year: int
    dine_in_revenue: Optional[float] = None
    delivery_revenue: Optional[float] = None
    total_revenue: Optional[float] = None
    source: Optional[str] = "manual"
    notes: Optional[str] = None


class CreateObligationRequest(BaseModel):
    type: str  # rent, cam, electricity, water, hvac, insurance, property_tax, custom
    custom_label: Optional[str] = None
    amount: float
    frequency: str = "monthly"  # monthly, quarterly, yearly, one_time
    due_day: Optional[int] = None  # day of month
    start_date: Optional[str] = None  # ISO date
    end_date: Optional[str] = None  # ISO date
    notes: Optional[str] = None


class UpdateObligationRequest(BaseModel):
    type: Optional[str] = None
    custom_label: Optional[str] = None
    amount: Optional[float] = None
    frequency: Optional[str] = None
    due_day: Optional[int] = None
    start_date: Optional[str] = None
    end_date: Optional[str] = None
    notes: Optional[str] = None
