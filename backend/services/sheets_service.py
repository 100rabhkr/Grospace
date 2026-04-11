"""
Google Sheets integration — writes confirmed agreement data and feedback to a shared spreadsheet.
"""

import os
import json
import logging
from datetime import datetime
from typing import Optional

logger = logging.getLogger(__name__)

SHEET_HEADERS = [
    "Timestamp", "Agreement ID", "Outlet Name", "City", "State",
    "Landlord", "Tenant", "Brand", "Property Type",
    "Monthly Rent", "Security Deposit", "CAM Charges",
    "Lease Start", "Lease End", "Lock-in (months)",
    "Escalation %", "Rent Model", "Area (sqft)",
    "Rent/sqft", "Total Monthly Outflow", "Risk Flags",
    "Status", "Document Filename", "Uploaded By",
]

FEEDBACK_HEADERS = [
    "Timestamp", "Agreement ID", "Field Name",
    "Original Value", "Corrected Value", "Comment", "Status",
]

DELETION_HEADERS = [
    "Timestamp", "Outlet ID", "Outlet Name", "City", "Brand",
    "Deleted By", "Org ID",
]

# Unified deletion audit trail that covers every entity type (outlet,
# agreement, extraction_job) and distinguishes soft-delete from
# permanent "delete forever".
DELETION_AUDIT_HEADERS = [
    "Timestamp", "Action", "Entity Type", "Entity ID", "Title",
    "Related Outlet ID", "Related Outlet Name", "Brand", "Status Before",
    "Deleted By", "Org ID", "Notes",
]


def _get_spreadsheet():
    """Connect to Google Sheets spreadsheet. Fresh connection each time."""
    spreadsheet_id = os.getenv("GOOGLE_SHEETS_SPREADSHEET_ID")
    creds_json_str = os.getenv("GOOGLE_SHEETS_CREDENTIALS_JSON")
    creds_path = os.getenv(
        "GOOGLE_SHEETS_CREDENTIALS_PATH",
        os.path.join(os.path.dirname(os.path.dirname(__file__)), "google-sheets-credentials.json"),
    )

    if not spreadsheet_id:
        logger.warning("GOOGLE_SHEETS_SPREADSHEET_ID not set — disabled")
        return None

    try:
        import gspread
        from google.oauth2.service_account import Credentials

        scopes = [
            "https://www.googleapis.com/auth/spreadsheets",
            "https://www.googleapis.com/auth/drive",
        ]

        if creds_json_str:
            creds_info = json.loads(creds_json_str)
            creds = Credentials.from_service_account_info(creds_info, scopes=scopes)
        elif os.path.exists(creds_path):
            creds = Credentials.from_service_account_file(creds_path, scopes=scopes)
        else:
            logger.warning("No Google Sheets credentials found")
            return None

        client = gspread.authorize(creds)
        return client.open_by_key(spreadsheet_id)

    except Exception as e:
        logger.error(f"Failed to connect to Google Sheets: {e}")
        return None


def _format_sheet_headers(sheet):
    """Apply professional formatting to the header row."""
    try:
        # Bold + gray background for header row
        sheet.format("1:1", {
            "textFormat": {"bold": True},
            "backgroundColor": {"red": 0.95, "green": 0.96, "blue": 0.97},
        })
        # Freeze header row
        sheet.freeze(rows=1)
    except Exception as e:
        logger.warning(f"Failed to format sheet headers: {e}")


def _get_sheet():
    """Get the main agreements sheet (Sheet1)."""
    spreadsheet = _get_spreadsheet()
    if not spreadsheet:
        return None

    sheet = spreadsheet.sheet1

    # Ensure headers exist
    try:
        first_row = sheet.row_values(1)
        if not first_row or first_row[0] != SHEET_HEADERS[0]:
            sheet.insert_row(SHEET_HEADERS, 1)
            _format_sheet_headers(sheet)
    except Exception:
        sheet.insert_row(SHEET_HEADERS, 1)
        _format_sheet_headers(sheet)

    return sheet


def _get_feedback_sheet():
    """Get or create the Feedback sheet tab."""
    spreadsheet = _get_spreadsheet()
    if not spreadsheet:
        return None

    try:
        sheet = spreadsheet.worksheet("Feedback")
    except Exception:
        # Sheet doesn't exist — create it
        sheet = spreadsheet.add_worksheet(title="Feedback", rows=1000, cols=len(FEEDBACK_HEADERS))
        sheet.insert_row(FEEDBACK_HEADERS, 1)
        _format_sheet_headers(sheet)
        return sheet

    # Ensure headers exist
    try:
        first_row = sheet.row_values(1)
        if not first_row or first_row[0] != FEEDBACK_HEADERS[0]:
            sheet.insert_row(FEEDBACK_HEADERS, 1)
            _format_sheet_headers(sheet)
    except Exception:
        sheet.insert_row(FEEDBACK_HEADERS, 1)
        _format_sheet_headers(sheet)

    return sheet


def write_agreement_to_sheet(
    agreement_id: str,
    outlet_name: str,
    city: str,
    state: str,
    landlord: Optional[str],
    tenant: Optional[str],
    brand: Optional[str],
    property_type: Optional[str],
    monthly_rent: Optional[float],
    security_deposit: Optional[float],
    cam_monthly: Optional[float],
    lease_start: Optional[str],
    lease_end: Optional[str],
    lock_in_months: Optional[float],
    escalation_pct: Optional[float],
    rent_model: Optional[str],
    area_sqft: Optional[float],
    rent_per_sqft: Optional[float],
    total_monthly_outflow: Optional[float],
    risk_flags_count: int = 0,
    status: str = "active",
    document_filename: Optional[str] = None,
    uploaded_by: Optional[str] = None,
) -> bool:
    """Append a row to Google Sheet. Returns True on success."""
    sheet = _get_sheet()
    if sheet is None:
        logger.error("Google Sheets not available — _get_sheet() returned None")
        return False

    try:
        row = [
            datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            agreement_id,
            outlet_name or "--",
            city or "--",
            state or "--",
            landlord or "--",
            tenant or "--",
            brand or "--",
            property_type or "--",
            monthly_rent or "--",
            security_deposit or "--",
            cam_monthly or "--",
            lease_start or "--",
            lease_end or "--",
            lock_in_months or "--",
            escalation_pct or "--",
            rent_model or "--",
            area_sqft or "--",
            rent_per_sqft or "--",
            total_monthly_outflow or "--",
            risk_flags_count,
            status,
            document_filename or "--",
            uploaded_by or "",
        ]
        sheet.append_row(row, value_input_option="USER_ENTERED")
        logger.info(f"Wrote agreement {agreement_id} to Google Sheet")
        return True

    except Exception as e:
        logger.error(f"Failed to write to Google Sheet: {e}")
        return False


def write_feedback_to_sheet(
    agreement_id: str,
    field_name: str,
    original_value: Optional[str] = None,
    corrected_value: Optional[str] = None,
    comment: Optional[str] = None,
    status: str = "pending",
) -> bool:
    """Append a feedback row to the Feedback sheet tab. Returns True on success."""
    sheet = _get_feedback_sheet()
    if sheet is None:
        logger.error("Feedback sheet not available")
        return False

    try:
        row = [
            datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            agreement_id or "",
            field_name or "",
            original_value or "",
            corrected_value or "",
            comment or "",
            status,
        ]
        sheet.append_row(row, value_input_option="USER_ENTERED")
        logger.info(f"Wrote feedback for {agreement_id}/{field_name} to Google Sheet")
        return True

    except Exception as e:
        logger.error(f"Failed to write feedback to Google Sheet: {e}")
        return False


def _get_deletions_sheet():
    """Get or create the Deletions sheet tab."""
    spreadsheet = _get_spreadsheet()
    if not spreadsheet:
        return None
    try:
        sheet = spreadsheet.worksheet("Deletions")
    except Exception:
        sheet = spreadsheet.add_worksheet(title="Deletions", rows=1000, cols=len(DELETION_HEADERS))
        sheet.insert_row(DELETION_HEADERS, 1)
        _format_sheet_headers(sheet)
        return sheet
    try:
        first_row = sheet.row_values(1)
        if not first_row or first_row[0] != DELETION_HEADERS[0]:
            sheet.insert_row(DELETION_HEADERS, 1)
            _format_sheet_headers(sheet)
    except Exception:
        sheet.insert_row(DELETION_HEADERS, 1)
    return sheet


def write_deletion_to_sheet(
    outlet_id: str,
    outlet_name: str,
    city: str,
    brand: str,
    deleted_by: str,
    org_id: str,
) -> bool:
    """Append a deletion log row to the Deletions sheet tab."""
    sheet = _get_deletions_sheet()
    if sheet is None:
        return False
    try:
        row = [
            datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            outlet_id,
            outlet_name or "--",
            city or "--",
            brand or "--",
            deleted_by or "--",
            org_id,
        ]
        sheet.append_row(row, value_input_option="USER_ENTERED")
        logger.info(f"Wrote deletion of outlet {outlet_id} to Google Sheet")
        return True
    except Exception as e:
        logger.error(f"Failed to write deletion to Google Sheet: {e}")
        return False


CHANGELOG_HEADERS = [
    "Timestamp", "Outlet ID", "Outlet Name", "Action", "Changed By",
    "Field", "Old Value", "New Value",
]


def _get_changelog_sheet():
    """Get or create the Change Log sheet tab."""
    spreadsheet = _get_spreadsheet()
    if not spreadsheet:
        return None
    try:
        sheet = spreadsheet.worksheet("Change Log")
    except Exception:
        sheet = spreadsheet.add_worksheet(title="Change Log", rows=5000, cols=len(CHANGELOG_HEADERS))
        sheet.insert_row(CHANGELOG_HEADERS, 1)
        _format_sheet_headers(sheet)
        return sheet
    try:
        first_row = sheet.row_values(1)
        if not first_row or first_row[0] != CHANGELOG_HEADERS[0]:
            sheet.insert_row(CHANGELOG_HEADERS, 1)
            _format_sheet_headers(sheet)
    except Exception:
        sheet.insert_row(CHANGELOG_HEADERS, 1)
    return sheet


def write_changelog_to_sheet(
    outlet_id: str,
    outlet_name: str,
    action: str,
    changed_by: str,
    field: str = "",
    old_value: str = "",
    new_value: str = "",
) -> bool:
    """Append a change log entry to the Change Log sheet tab."""
    sheet = _get_changelog_sheet()
    if sheet is None:
        return False
    try:
        row = [
            datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            outlet_id,
            outlet_name or "--",
            action,
            changed_by or "--",
            field or "--",
            old_value or "--",
            new_value or "--",
        ]
        sheet.append_row(row, value_input_option="USER_ENTERED")
        return True
    except Exception as e:
        logger.error(f"Failed to write changelog: {e}")
        return False


# ============================================================================
# Unified Deletion Audit Tab
# ============================================================================
# Single sheet tab that captures every delete / restore / permanent-delete
# operation across outlets, agreements, and extraction jobs. Fed by the
# delete/restore endpoints via write_deletion_audit_row().

def _get_deletion_audit_sheet():
    """Get or create the Deletion Audit sheet tab."""
    spreadsheet = _get_spreadsheet()
    if not spreadsheet:
        return None
    try:
        sheet = spreadsheet.worksheet("Deletion Audit")
    except Exception:
        sheet = spreadsheet.add_worksheet(
            title="Deletion Audit",
            rows=5000,
            cols=len(DELETION_AUDIT_HEADERS),
        )
        sheet.insert_row(DELETION_AUDIT_HEADERS, 1)
        _format_sheet_headers(sheet)
        return sheet
    try:
        first_row = sheet.row_values(1)
        if not first_row or first_row[0] != DELETION_AUDIT_HEADERS[0]:
            sheet.insert_row(DELETION_AUDIT_HEADERS, 1)
            _format_sheet_headers(sheet)
    except Exception:
        sheet.insert_row(DELETION_AUDIT_HEADERS, 1)
    return sheet


def write_deletion_audit_row(
    *,
    action: str,           # "soft_delete" | "restore" | "delete_forever"
    entity_type: str,      # "outlet" | "agreement" | "extraction_job"
    entity_id: str,
    title: str = "",
    outlet_id: str = "",
    outlet_name: str = "",
    brand: str = "",
    status_before: str = "",
    deleted_by: str = "",
    org_id: str = "",
    notes: str = "",
) -> bool:
    """Append a unified deletion / restore / permanent-delete audit row."""
    sheet = _get_deletion_audit_sheet()
    if sheet is None:
        return False
    try:
        row = [
            datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            action,
            entity_type,
            entity_id,
            title or "--",
            outlet_id or "--",
            outlet_name or "--",
            brand or "--",
            status_before or "--",
            deleted_by or "--",
            org_id or "--",
            notes or "--",
        ]
        sheet.append_row(row, value_input_option="USER_ENTERED")
        logger.info(
            "Deletion audit: %s %s %s by %s",
            action, entity_type, entity_id, deleted_by,
        )
        return True
    except Exception as e:
        logger.error(f"Failed to write deletion audit row: {e}")
        return False


# ============================================================================
# Per-org Activity Tab
# ============================================================================
# Every organization gets its own sheet tab named "<BrandName> (<last-4>)".
# Every activity_log entry for that org is mirrored here so Super Admin can
# audit exactly what's happening inside each customer's workspace.

ORG_ACTIVITY_HEADERS = [
    "Timestamp", "Action", "Actor", "Entity Type", "Entity ID", "Details",
]


def get_or_create_org_activity_tab(org_id: str, tab_name: str):
    """
    Get or create the per-org activity tab. Idempotent — safe to call on
    every write. Returns the worksheet object or None if Sheets is not
    configured.
    """
    spreadsheet = _get_spreadsheet()
    if not spreadsheet:
        return None
    safe_name = (tab_name or f"org_{org_id[-8:]}")[:100]  # Google Sheets tab limit
    try:
        sheet = spreadsheet.worksheet(safe_name)
    except Exception:
        try:
            sheet = spreadsheet.add_worksheet(
                title=safe_name,
                rows=5000,
                cols=len(ORG_ACTIVITY_HEADERS),
            )
            sheet.insert_row(ORG_ACTIVITY_HEADERS, 1)
            _format_sheet_headers(sheet)
        except Exception as e:
            logger.error(f"Failed to create org activity tab '{safe_name}': {e}")
            return None
    # Ensure header row exists (survives manual edits)
    try:
        first_row = sheet.row_values(1)
        if not first_row or first_row[0] != ORG_ACTIVITY_HEADERS[0]:
            sheet.insert_row(ORG_ACTIVITY_HEADERS, 1)
            _format_sheet_headers(sheet)
    except Exception:
        pass
    return sheet


def write_org_activity(
    *,
    org_id: str,
    sheet_tab_name: Optional[str] = None,
    action: str,
    actor: str = "",
    entity_type: str = "",
    entity_id: str = "",
    details: Optional[dict] = None,
) -> bool:
    """
    Append a row to the org's activity tab. Non-blocking — returns False
    if the Sheet write fails (never raises).
    """
    # Resolve the tab name if not given — read from organizations.sheet_tab_name
    if not sheet_tab_name:
        try:
            from core.config import supabase
            r = supabase.table("organizations").select(
                "name, sheet_tab_name"
            ).eq("id", org_id).single().execute()
            if r.data:
                sheet_tab_name = r.data.get("sheet_tab_name") or f"{r.data.get('name', 'Org')} ({org_id[-4:]})"
        except Exception:
            pass
    if not sheet_tab_name:
        sheet_tab_name = f"Org {org_id[-4:]}"

    sheet = get_or_create_org_activity_tab(org_id, sheet_tab_name)
    if sheet is None:
        return False

    try:
        import json as _json
        details_str = _json.dumps(details or {}, separators=(",", ":"), default=str)[:500]
    except Exception:
        details_str = str(details or "")[:500]

    try:
        row = [
            datetime.utcnow().strftime("%Y-%m-%d %H:%M:%S"),
            action or "",
            actor or "",
            entity_type or "",
            entity_id or "",
            details_str,
        ]
        sheet.append_row(row, value_input_option="USER_ENTERED")
        return True
    except Exception as e:
        logger.error(f"Failed to write org activity row to '{sheet_tab_name}': {e}")
        return False
