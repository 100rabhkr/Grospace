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
    "Status", "Document Filename",
]

FEEDBACK_HEADERS = [
    "Timestamp", "Agreement ID", "Field Name",
    "Original Value", "Corrected Value", "Comment", "Status",
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
    except Exception:
        sheet.insert_row(SHEET_HEADERS, 1)

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
        return sheet

    # Ensure headers exist
    try:
        first_row = sheet.row_values(1)
        if not first_row or first_row[0] != FEEDBACK_HEADERS[0]:
            sheet.insert_row(FEEDBACK_HEADERS, 1)
    except Exception:
        sheet.insert_row(FEEDBACK_HEADERS, 1)

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
            outlet_name or "",
            city or "",
            state or "",
            landlord or "",
            tenant or "",
            brand or "",
            property_type or "",
            monthly_rent or "",
            security_deposit or "",
            cam_monthly or "",
            lease_start or "",
            lease_end or "",
            lock_in_months or "",
            escalation_pct or "",
            rent_model or "",
            area_sqft or "",
            rent_per_sqft or "",
            total_monthly_outflow or "",
            risk_flags_count,
            status,
            document_filename or "",
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
