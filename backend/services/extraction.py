"""
AI extraction logic: schemas, Gemini calls, document processing, risk detection.
"""

import os
import re
import json
import uuid
import httpx
import fitz  # PyMuPDF
import pdfplumber
from io import BytesIO
from typing import Optional
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from PIL import Image
from pdf2image import convert_from_bytes

import google.generativeai as genai

from core.config import (
    supabase, model, model_pro,
    SUPPORTED_PDF_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS,
    CITY_ABBREVIATIONS,
)
from services.ocr_service import extract_text_cloud_vision, extract_text_with_bboxes
from services.email_service import dispatch_notification


# ============================================
# SCHEMAS
# ============================================

LEASE_EXTRACTION_SCHEMA = {
    "parties": {
        "lessor_name": "string — full legal name of the property owner / licensor / landlord",
        "lessor_address": "string — registered address of the lessor as stated in the document",
        "lessee_name": "string — full legal name of the tenant / licensee / occupant",
        "lessee_address": "string — registered address of the lessee as stated in the document",
        "lessee_cin": "string — Corporate Identification Number (CIN) of the lessee company, if mentioned",
        "leasing_consultant": "string — name of the broker / leasing consultant / agent, if any",
        "brand_name": "string — brand or trade name under which the lessee will operate at the premises",
    },
    "premises": {
        "property_name": "string — name of the mall, building, or commercial complex",
        "full_address": "string — complete street address including landmark, locality, city, state, pincode",
        "locality": "string — neighbourhood/area name, e.g. Rajouri Garden, Koramangala, Connaught Place",
        "city": "string — city name (e.g. Mumbai, Delhi, Bengaluru)",
        "state": "string — Indian state name (e.g. Maharashtra, Karnataka)",
        "pincode": "string — 6-digit Indian PIN code",
        "property_type": "enum: mall/high_street/cloud_kitchen/metro/transit/cyber_park/hospital/college/educational_hub",
        "floor": "string — floor number or level (e.g. 'Ground Floor', '2nd Floor', 'Lower Ground')",
        "unit_number": "string — shop/unit/suite number within the property",
        "super_area_sqft": "number — total super built-up area in square feet (includes common areas)",
        "covered_area_sqft": "number — covered/built-up area in square feet",
        "carpet_area_sqft": "number — usable carpet area in square feet (excludes walls, common areas)",
        "loading_factor": "string — loading factor percentage or ratio (super area / carpet area)",
        "parking_slots": "number — number of parking slots allocated to tenant",
        "parking_details": "string — parking arrangement details (e.g. 'basement level 2, 4 car slots')",
        "signage_rights": "string — signage/branding rights description (e.g. 'external facade signage, pylon sign')",
        "signage_approval_required": "boolean — whether landlord approval needed for signage changes",
    },
    "lease_term": {
        "loi_date": "date — date of the Letter of Intent, in YYYY-MM-DD format",
        "lease_term_years": "number — total lease duration in years",
        "lease_term_structure": "string — description of the term structure (e.g. '9 years = 3+3+3')",
        "renewal_terms": "string — renewal clause summary including renewal period and conditions",
        "lock_in_months": "number — lock-in period in MONTHS (convert from years if needed: 3 years = 36 months). Commonly stated in months in Indian leases.",
        "notice_period_months": "number — notice period required before exit, in months",
        "fit_out_period_days": "number — fit-out/build-out period in days",
        "fit_out_rent_free": "boolean — whether fit-out period is rent-free (true/false)",
        "lease_commencement_date": "date/formula — lease start date or formula (e.g. '60 days from handover')",
        "rent_commencement_date": "date/formula — date when rent payments begin (may differ from lease commencement)",
        "lease_expiry_date": "date/calculated — lease end date, calculated from commencement + term if not explicit",
    },
    "rent": {
        "rent_model": "enum: fixed/revenue_share/hybrid_mglr/percentage_only",
        "rent_schedule": "json array of yearly rent details — look for rent amounts in both words and figures (e.g. 'Rs. 2,85,000/- (Rupees Two Lakhs Eighty Five Thousand Only)')",
        "escalation_percentage": "number — annual/periodic rent escalation percentage (typically 5-15% in India)",
        "escalation_frequency_years": "number — how often escalation applies (e.g. every 1, 2, or 3 years)",
        "escalation_basis": "string — basis for escalation (e.g. 'fixed percentage', 'CPI-linked', 'market rate')",
        "mglr_payment_day": "number — day of the month when MGLR/rent is due",
        "revenue_reconciliation_day": "number — day of the month for revenue share reconciliation",
    },
    "charges": {
        "cam_rate_per_sqft": "number — Common Area Maintenance charge per square foot per month",
        "cam_area_basis": "enum: super_area/covered_area — which area measurement CAM is calculated on",
        "cam_monthly": "number — total monthly CAM amount in INR",
        "cam_escalation_pct": "number — annual CAM escalation percentage",
        "hvac_rate_per_sqft": "number — HVAC / air-conditioning charge per square foot",
        "electricity_load_kw": "number — sanctioned electricity load in kilowatts",
        "electricity_metering": "enum: prepaid/actual/sub_meter — how electricity is billed",
        "operating_hours": "string — permitted operating hours (e.g. '10 AM to 10 PM')",
        "gst_percentage": "number — GST rate applicable on rent/CAM (typically 18% in India for commercial leases)",
        "marketing_charges_monthly": "number — monthly marketing/promotion charges (mall-specific) in INR",
        "marketing_charges_per_sqft": "number — marketing charges per sqft if applicable",
    },
    "deposits": {
        "security_deposit_amount": "number — total security deposit amount in INR",
        "security_deposit_months": "number — security deposit expressed as number of months of rent",
        "security_deposit_basis": "string — how deposit is calculated (e.g. 'equivalent to 6 months rent')",
        "security_deposit_refund_days": "number — number of days for deposit refund after lease termination",
        "cam_deposit_amount": "number — separate CAM deposit amount, if any",
        "utility_deposit_per_kw": "number — utility/electricity deposit per KW of sanctioned load",
    },
    "legal": {
        "usage_restriction": "string — permitted use of premises (e.g. 'restaurant', 'retail', 'QSR')",
        "brand_change_allowed": "boolean — whether the lessee can change the operating brand",
        "structural_alterations_allowed": "boolean — whether structural modifications are permitted",
        "subletting_allowed": "boolean",
        "signage_approval_required": "boolean",
        "jurisdiction_city": "string",
        "arbitration": "boolean",
        "late_payment_interest_pct": "number",
        "tds_obligations": "boolean",
        "relocation_clause": "boolean",
        "force_majeure_clause": "boolean — whether force majeure clause exists",
        "force_majeure_details": "string — force majeure coverage details (pandemic, lockdown, government restrictions)",
        "exclusivity_clause": "boolean — whether exclusivity/non-compete clause exists for tenant's business category",
        "exclusivity_details": "string — exclusivity clause details",
        "co_tenancy_clause": "boolean — whether co-tenancy clause exists (relevant for malls)",
        "subleasing_allowed": "boolean — whether subleasing/assignment to group entities is permitted",
        "subleasing_conditions": "string — conditions for subleasing if allowed",
        "trading_hours": "string — required trading/operating hours (e.g. '10 AM to 10 PM daily')",
        "title_clear": "boolean — whether landlord has confirmed clear title",
    },
    "franchise": {
        "franchise_model": "enum: FOFO/FOCO/COCO/FICO/direct_lease",
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


# ============================================
# HELPER FUNCTIONS
# ============================================

def extract_text_from_pdf(pdf_bytes: bytes) -> str:
    """Extract text from a PDF using PyMuPDF, with page markers for source linking."""
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for i, page in enumerate(doc):
        text += f"\n--- PAGE {i + 1} ---\n"
        text += page.get_text()
    doc.close()
    return text


# ============================================
# IMPROVEMENT 1: DUAL EXTRACTION (PyMuPDF + Cloud Vision)
# ============================================

async def extract_text_dual(pdf_bytes: bytes) -> tuple[str, str, str]:
    """
    Run both PyMuPDF and Cloud Vision extraction in parallel.
    Returns (merged_text, pymupdf_text, cloud_vision_text).
    Merges results: Cloud Vision fills gaps where PyMuPDF fails (tables, scans).
    """
    pymupdf_text = extract_text_from_pdf(pdf_bytes)
    cloud_vision_text = ""

    # Only run Cloud Vision if PyMuPDF text is sparse (<500 chars)
    # For clean text PDFs, PyMuPDF is sufficient and faster
    pymupdf_len = len(pymupdf_text.strip())
    if pymupdf_len < 500:
        print(f"[DUAL] PyMuPDF sparse ({pymupdf_len} chars), running Cloud Vision...")
        try:
            images = pdf_bytes_to_images(pdf_bytes)
            if images:
                cloud_vision_text = extract_text_cloud_vision(images)
        except Exception as e:
            print(f"[DUAL] Cloud Vision failed: {e}")
    else:
        print(f"[DUAL] PyMuPDF sufficient ({pymupdf_len} chars), skipping Cloud Vision")

    # Merge strategy: use PyMuPDF as base, supplement with Cloud Vision
    pymupdf_len = len(pymupdf_text.strip())
    cv_len = len(cloud_vision_text.strip())

    if pymupdf_len >= 100 and cv_len >= 100:
        # Both have content — use the longer one as primary, but keep both
        if cv_len > pymupdf_len * 1.3:
            # Cloud Vision got significantly more text (likely tables/scans)
            merged = cloud_vision_text
            print(f"[DUAL] Cloud Vision primary ({cv_len} chars vs PyMuPDF {pymupdf_len})")
        else:
            merged = pymupdf_text
            print(f"[DUAL] PyMuPDF primary ({pymupdf_len} chars vs Cloud Vision {cv_len})")
    elif cv_len >= 100:
        merged = cloud_vision_text
        print(f"[DUAL] Cloud Vision only ({cv_len} chars)")
    elif pymupdf_len >= 100:
        merged = pymupdf_text
        print(f"[DUAL] PyMuPDF only ({pymupdf_len} chars)")
    else:
        merged = pymupdf_text or cloud_vision_text
        print("[DUAL] Both sparse — using whatever is available")

    return merged, pymupdf_text, cloud_vision_text


# ============================================
# IMPROVEMENT 2: PDFPLUMBER TABLE EXTRACTION
# ============================================

def extract_tables_from_pdf(pdf_bytes: bytes) -> str:
    """
    Use pdfplumber to extract tables (rent schedules, charges) from PDF.
    Returns formatted table text with page markers.
    """
    table_text = ""
    try:
        with pdfplumber.open(BytesIO(pdf_bytes)) as pdf:
            for i, page in enumerate(pdf.pages):
                tables = page.extract_tables()
                if tables:
                    table_text += f"\n--- TABLE DATA FROM PAGE {i + 1} ---\n"
                    for t_idx, table in enumerate(tables):
                        if not table:
                            continue
                        table_text += f"[Table {t_idx + 1}]\n"
                        for row in table:
                            cleaned_row = [str(cell).strip() if cell else "" for cell in row]
                            table_text += " | ".join(cleaned_row) + "\n"
                        table_text += "\n"
    except Exception as e:
        print(f"[TABLES] pdfplumber extraction failed: {e}")

    if table_text.strip():
        print(f"[TABLES] Extracted {len(table_text)} chars of table data")
    return table_text


# ============================================
# IMPROVEMENT 3: VALIDATE EXTRACTED VALUES AGAINST SOURCE
# ============================================

def validate_values_against_source(extraction: dict, source_text: str) -> dict:
    """
    Search for each extracted value in the original document text.
    If a value isn't found, downgrade confidence to 'low'.
    Returns updated confidence dict.
    """
    source_lower = source_text.lower().replace(",", "").replace(" ", "")
    validated_confidence = {}

    for section_key, section_data in extraction.items():
        if not isinstance(section_data, dict):
            continue
        for field_key, field_val in section_data.items():
            dot_key = f"{section_key}.{field_key}"

            # Extract the actual value
            val = field_val
            reported_conf = "high"
            if isinstance(field_val, dict) and "value" in field_val:
                val = field_val["value"]
                reported_conf = field_val.get("confidence", "high")

            if val is None or val == "" or val == "not_found":
                validated_confidence[dot_key] = "not_found"
                continue

            # Skip arrays and complex objects
            if isinstance(val, (list, dict)):
                validated_confidence[dot_key] = reported_conf
                continue

            # Search for the value in source text
            val_str = str(val).lower().replace(",", "").replace(" ", "")
            if len(val_str) < 2:
                validated_confidence[dot_key] = reported_conf
                continue

            found = val_str in source_lower

            # For numbers, also try with/without formatting
            if not found and val_str.replace(".", "").isdigit():
                # Try the raw number
                found = val_str in source_lower
                # Try without decimals
                if not found:
                    found = val_str.split(".")[0] in source_lower

            if found:
                validated_confidence[dot_key] = reported_conf
            else:
                # Value not found in source — downgrade unless already low/not_found
                if reported_conf == "high":
                    validated_confidence[dot_key] = "medium"
                    print(f"[VALIDATE] Downgraded {dot_key}='{str(val)[:30]}' from high→medium (not found in source)")
                elif reported_conf == "medium":
                    validated_confidence[dot_key] = "low"
                    print(f"[VALIDATE] Downgraded {dot_key}='{str(val)[:30]}' from medium→low (not found in source)")
                else:
                    validated_confidence[dot_key] = reported_conf

    return validated_confidence


# ============================================
# IMPROVEMENT 4: TWO-PASS EXTRACTION (FOCUSED RETRY)
# ============================================

async def focused_retry_extraction(text: str, extraction: dict, confidence: dict, doc_type: str) -> dict:
    """
    Second pass: re-extract only the fields that came back as 'not_found' or 'low'.
    Uses a focused prompt that tells Gemini exactly which fields to look for.
    """
    missing_fields = []
    for key, conf in confidence.items():
        if conf in ("not_found", "low"):
            missing_fields.append(key)

    if not missing_fields or len(missing_fields) < 3:
        return extraction  # Not enough missing fields to justify a retry

    print(f"[RETRY] Focused retry for {len(missing_fields)} missing/low fields: {missing_fields[:10]}...")

    retry_prompt = (
        "You are re-examining a document because the first extraction pass missed some fields.\n"
        "FOCUS ONLY on finding these specific fields:\n\n"
        + "\n".join(f"- {f}" for f in missing_fields)
        + "\n\n"
        "Return a JSON object with ONLY these fields (use the same section.field structure).\n"
        "Look VERY carefully — check tables, footnotes, annexures, and supplementary clauses.\n"
        "Indian lease terminology: MGLR=minimum guaranteed rent, CAM=maintenance, L&L=leave and license.\n\n"
        f"DOCUMENT TEXT:\n{text[:12000]}"
    )

    try:
        response = model_pro.generate_content(
            retry_prompt,
            generation_config=genai.GenerationConfig(
                response_mime_type="application/json",
                temperature=0,
            ),
        )
        retry_result = json.loads(response.text)
        if isinstance(retry_result, list) and len(retry_result) > 0:
            retry_result = retry_result[0]

        if isinstance(retry_result, dict):
            filled = 0
            for section_key, section_data in retry_result.items():
                if not isinstance(section_data, dict):
                    continue
                if section_key not in extraction:
                    extraction[section_key] = {}
                for field_key, field_val in section_data.items():
                    dot_key = f"{section_key}.{field_key}"
                    if dot_key in missing_fields:
                        # Check if the retry actually found something
                        val = field_val
                        if isinstance(field_val, dict) and "value" in field_val:
                            val = field_val["value"]
                        if val and val != "not_found" and val != "":
                            extraction[section_key][field_key] = field_val
                            filled += 1

            print(f"[RETRY] Filled {filled}/{len(missing_fields)} previously missing fields")

    except Exception as e:
        print(f"[RETRY] Focused retry failed: {e}")

    return extraction


# ============================================
# IMPROVEMENT 7: CROSS-FIELD VALIDATION RULES
# ============================================

def cross_field_validation(extraction: dict, confidence: dict) -> list[str]:
    """
    Run sanity checks across related fields.
    Returns list of validation warnings.
    """
    warnings = []

    rent = extraction.get("rent", {})
    charges = extraction.get("charges", {})
    deposits = extraction.get("deposits", {})
    lease_term = extraction.get("lease_term", {})

    def _num(val):
        if isinstance(val, dict) and "value" in val:
            val = val["value"]
        if val is None or val == "" or val == "not_found":
            return None
        try:
            return float(str(val).replace(",", ""))
        except (ValueError, TypeError):
            return None

    def _date(val):
        if isinstance(val, dict) and "value" in val:
            val = val["value"]
        if not val or val == "not_found":
            return None
        try:
            return date.fromisoformat(str(val))
        except (ValueError, TypeError):
            return None

    # 1. total_monthly_outflow >= monthly_rent + cam_monthly
    monthly_rent = _num(rent.get("monthly_rent")) or _num(rent.get("mglr_monthly"))
    cam = _num(charges.get("cam_monthly"))
    total_outflow = _num(rent.get("total_monthly_outflow"))
    if monthly_rent and cam and total_outflow:
        expected_min = monthly_rent + cam
        if total_outflow < expected_min * 0.9:
            warnings.append(f"total_monthly_outflow ({total_outflow}) is less than rent ({monthly_rent}) + CAM ({cam}) = {expected_min}")

    # 2. lease_expiry_date > lease_commencement_date
    commencement = _date(lease_term.get("lease_commencement_date"))
    expiry = _date(lease_term.get("lease_expiry_date"))
    if commencement and expiry and expiry <= commencement:
        warnings.append(f"lease_expiry_date ({expiry}) must be after commencement ({commencement})")

    # 3. security_deposit ≈ monthly_rent × deposit_months
    deposit = _num(deposits.get("security_deposit_amount"))
    deposit_months = _num(deposits.get("security_deposit_months"))
    if deposit and deposit_months and monthly_rent:
        expected_deposit = monthly_rent * deposit_months
        if abs(deposit - expected_deposit) > expected_deposit * 0.3:
            warnings.append(f"security_deposit ({deposit}) doesn't match rent ({monthly_rent}) × {deposit_months} months = {expected_deposit}")

    # 4. escalation_pct between 3-25%
    esc_pct = _num(rent.get("escalation_percentage"))
    if esc_pct is not None:
        if esc_pct < 1 or esc_pct > 30:
            warnings.append(f"escalation_percentage ({esc_pct}%) is outside normal range (3-25%)")

    # 5. lock_in_months < total lease months
    lock_in = _num(lease_term.get("lock_in_months"))
    term_years = _num(lease_term.get("lease_term_years"))
    if lock_in and term_years:
        total_months = term_years * 12
        if lock_in > total_months:
            warnings.append(f"lock_in_months ({lock_in}) exceeds total lease term ({total_months} months)")

    # 6. rent_commencement should be >= lease_commencement
    rent_comm = _date(lease_term.get("rent_commencement_date"))
    if rent_comm and commencement and rent_comm < commencement:
        warnings.append(f"rent_commencement_date ({rent_comm}) is before lease_commencement ({commencement})")

    if warnings:
        print(f"[CROSS-VALIDATE] {len(warnings)} issues found: {warnings}")

    return warnings


# ============================================
# IMPROVEMENT 6: INDIAN LEASE TEMPLATES
# ============================================

INDIAN_LEASE_TEMPLATES = {
    "maharashtra_ll": (
        "This is a Maharashtra Leave and License agreement. Key terminology:\n"
        "- Licensor = Landlord/Owner, Licensee = Tenant\n"
        "- 'Leave and License' = rental agreement type common in Maharashtra\n"
        "- License fee = monthly rent\n"
        "- Must be registered within 2 months of execution\n"
        "- Standard stamp duty: 0.25% of total license fee + deposit\n"
        "- Lock-in typically 12-36 months, notice period 1-3 months\n"
    ),
    "delhi_lease": (
        "This is a Delhi lease deed. Key terminology:\n"
        "- Lessor = Landlord, Lessee = Tenant\n"
        "- Lease deed is a more formal, longer document\n"
        "- Stamp duty: 2% of average annual rent × term\n"
        "- Common to have escalation clauses (5-15% every 1-3 years)\n"
        "- Security deposit typically 3-10 months of rent\n"
    ),
    "franchise": (
        "This is a franchise agreement for a commercial property. Key terminology:\n"
        "- Franchisor = brand owner, Franchisee = operator\n"
        "- Franchise fee, royalty, and revenue share are common\n"
        "- May include MGLR (Minimum Guaranteed License Revenue)\n"
        "- Hybrid model: higher of fixed rent or revenue share\n"
    ),
    "karnataka_license": (
        "This is a Karnataka commercial license agreement. Key terminology:\n"
        "- License agreement (not lease) — shorter term, fewer rights\n"
        "- Stamp duty: 0.5-1% of total consideration\n"
        "- Common in Bangalore IT/commercial spaces\n"
    ),
}

def detect_lease_template(text: str) -> str:
    """Detect which Indian lease template to use based on document content."""
    text_lower = text[:5000].lower()

    if "leave and license" in text_lower or "licensor" in text_lower:
        if "maharashtra" in text_lower or "mumbai" in text_lower or "pune" in text_lower or "thane" in text_lower:
            return "maharashtra_ll"
    if "franchise" in text_lower or "franchisor" in text_lower or "franchisee" in text_lower:
        return "franchise"
    if "bangalore" in text_lower or "bengaluru" in text_lower or "karnataka" in text_lower:
        return "karnataka_license"
    if "delhi" in text_lower or "noida" in text_lower or "gurgaon" in text_lower or "gurugram" in text_lower:
        return "delhi_lease"

    return ""


# ============================================
# GOOGLE DOCUMENT AI (optional — enhanced table/form extraction)
# ============================================

async def extract_with_document_ai(pdf_bytes: bytes) -> str:
    """
    Use Google Document AI for superior table/form extraction.
    Falls back gracefully if not configured (DOCUMENT_AI_PROCESSOR env var).
    Returns extracted text with page markers.
    """
    processor_name = os.getenv("DOCUMENT_AI_PROCESSOR")
    if not processor_name:
        return ""  # Not configured, skip

    try:
        from google.cloud import documentai_v1 as documentai

        client = documentai.DocumentProcessorServiceClient()

        raw_document = documentai.RawDocument(
            content=pdf_bytes,
            mime_type="application/pdf",
        )

        request = documentai.ProcessRequest(
            name=processor_name,
            raw_document=raw_document,
        )

        result = client.process_document(request=request)
        document = result.document

        # Build text with page markers
        doc_text = ""
        for i, page in enumerate(document.pages):
            doc_text += f"\n--- PAGE {i + 1} ---\n"

            # Extract tables specifically
            for table in page.tables:
                doc_text += "[TABLE]\n"
                for row in table.header_rows:
                    cells = []
                    for cell in row.cells:
                        cell_text = _get_docai_text(cell.layout, document.text)
                        cells.append(cell_text.strip())
                    doc_text += " | ".join(cells) + "\n"
                for row in table.body_rows:
                    cells = []
                    for cell in row.cells:
                        cell_text = _get_docai_text(cell.layout, document.text)
                        cells.append(cell_text.strip())
                    doc_text += " | ".join(cells) + "\n"
                doc_text += "\n"

            # Extract form fields (key-value pairs)
            for field in page.form_fields:
                key = _get_docai_text(field.field_name, document.text).strip()
                value = _get_docai_text(field.field_value, document.text).strip()
                if key and value:
                    doc_text += f"{key}: {value}\n"

        # Also include the full OCR text
        if document.text:
            doc_text += "\n--- FULL OCR TEXT ---\n" + document.text

        print(f"[DOCAI] Extracted {len(doc_text)} chars with {len(document.pages)} pages")
        return doc_text

    except ImportError:
        print("[DOCAI] google-cloud-documentai not installed. Skipping.")
        return ""
    except Exception as e:
        print(f"[DOCAI] Document AI failed: {e}")
        return ""


def _get_docai_text(layout, full_text: str) -> str:
    """Helper to extract text from Document AI layout element."""
    if not layout or not layout.text_anchor or not layout.text_anchor.text_segments:
        return ""
    result = ""
    for segment in layout.text_anchor.text_segments:
        start = int(segment.start_index) if segment.start_index else 0
        end = int(segment.end_index)
        result += full_text[start:end]
    return result


def clean_ocr_text(raw_text: str) -> str:
    """Post-process OCR output for better formatting and readability."""
    if not raw_text or not raw_text.strip():
        return raw_text

    lines = raw_text.split("\n")
    cleaned_lines = []
    prev_line = ""

    for line in lines:
        line = line.rstrip()

        if not line.strip():
            if not prev_line.strip():
                continue
            cleaned_lines.append("")
            prev_line = line
            continue

        stripped = line.strip()
        if re.match(r"^(page\s*\d+\s*(of\s*\d+)?|^\d+\s*$)", stripped, re.IGNORECASE):
            prev_line = line
            continue

        if (
            prev_line.strip()
            and cleaned_lines
            and not prev_line.strip().endswith((".", ":", ";", "!", "?", "-", "\u2014", "|"))
            and not stripped.startswith(("\u2022", "-", "\u2013", "\u25a0", "\u25cf", "(", "[", "ARTICLE", "Section", "Clause"))
            and stripped[0:1].islower()
            and len(prev_line.strip()) > 20
        ):
            cleaned_lines[-1] = cleaned_lines[-1].rstrip() + " " + stripped
            prev_line = cleaned_lines[-1]
            continue

        segments = re.split(r"\s{3,}", stripped)
        if len(segments) >= 3:
            line = "    ".join(s.strip() for s in segments if s.strip())
        else:
            line = re.sub(r"  +", " ", line)

        line = re.sub(r"(Rs\.?\s?)O(\d)", r"\g<1>0\2", line)
        line = re.sub(r"(\u20b9\s?)O(\d)", r"\g<1>0\2", line)

        cleaned_lines.append(line)
        prev_line = line

    result = "\n".join(cleaned_lines)
    result = re.sub(r"\n{3,}", "\n\n", result)
    return result.strip()


def get_file_type(filename: str) -> str:
    """Determine file type from filename extension."""
    if not filename:
        return "unknown"
    ext = os.path.splitext(filename.lower())[1]
    if ext in SUPPORTED_PDF_EXTENSIONS:
        return "pdf"
    if ext in SUPPORTED_IMAGE_EXTENSIONS:
        return "image"
    return "unknown"


def pdf_bytes_to_images(pdf_bytes: bytes, max_pages: int = 20, dpi: int = 200) -> list:
    """Convert PDF bytes to a list of PIL Images."""
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


async def download_file(file_url: str) -> bytes:
    """Download a file from Supabase storage."""
    async with httpx.AsyncClient() as client:
        response = await client.get(file_url)
        response.raise_for_status()
        return response.content


# ============================================
# CLASSIFICATION
# ============================================

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


# ============================================
# FIELD VALIDATION & CLEANUP
# ============================================

_CURRENCY_RE = re.compile(r"^[\s₹]*(Rs\.?|INR)\s*", re.IGNORECASE)


def _strip_currency(value):
    """Remove Rs., INR, ₹ prefixes and commas, return a numeric value or None."""
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return value
    if not isinstance(value, str):
        return value
    cleaned = _CURRENCY_RE.sub("", str(value)).replace(",", "").replace("₹", "").strip()
    try:
        return float(cleaned) if "." in cleaned else int(cleaned)
    except (ValueError, TypeError):
        return value  # Return original if not parseable


def _normalize_date(value) -> Optional[str]:
    """Convert various date formats to ISO YYYY-MM-DD. Returns None if unparseable."""
    if value is None or value in ("", "not_found", "N/A"):
        return None
    if not isinstance(value, str):
        return None

    v = value.strip()

    # Already ISO
    if re.match(r"^\d{4}-\d{2}-\d{2}$", v):
        return v

    # Try common Indian and international formats
    formats = [
        "%d-%m-%Y", "%d/%m/%Y", "%d.%m.%Y",    # DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY
        "%Y/%m/%d", "%m/%d/%Y",                  # YYYY/MM/DD, MM/DD/YYYY
        "%d %b %Y", "%d %B %Y",                  # 01 Jan 2024, 01 January 2024
        "%d-%b-%Y", "%d-%B-%Y",                  # 01-Jan-2024, 01-January-2024
        "%B %d, %Y", "%b %d, %Y",                # January 01, 2024, Jan 01, 2024
        "%d %b, %Y", "%d %B, %Y",                # 01 Jan, 2024
        "%d/%m/%y", "%d-%m-%y",                   # DD/MM/YY, DD-MM-YY
    ]
    for fmt in formats:
        try:
            return datetime.strptime(v, fmt).date().isoformat()
        except (ValueError, AttributeError):
            continue

    return None  # Return None if no format matched; keep original in caller


def _normalize_indian_amount(value) -> Optional[float]:
    """Convert Indian monetary notation (lakhs/crores) to numeric value.

    Handles:
    - "2.85 lakhs" -> 285000
    - "1.5 crores" -> 15000000
    - "Rs. 2,85,000/-" -> 285000
    - "INR 50L" -> 5000000
    - "3Cr" -> 30000000
    """
    if value is None:
        return None
    if isinstance(value, (int, float)):
        return float(value)
    if not isinstance(value, str):
        return None

    s = str(value).strip()
    if not s:
        return None

    # Strip currency prefixes
    s = _CURRENCY_RE.sub("", s).replace("₹", "").strip()
    # Remove trailing /-
    s = re.sub(r"/-\s*$", "", s).strip()

    # Check for lakhs/crores notation
    lakh_match = re.match(r"^([\d,]+(?:\.\d+)?)\s*(?:lakhs?|lacs?|L)\b", s, re.IGNORECASE)
    crore_match = re.match(r"^([\d,]+(?:\.\d+)?)\s*(?:crores?|Cr)\b", s, re.IGNORECASE)

    if crore_match:
        num_str = crore_match.group(1).replace(",", "")
        try:
            return float(num_str) * 10000000
        except ValueError:
            pass

    if lakh_match:
        num_str = lakh_match.group(1).replace(",", "")
        try:
            return float(num_str) * 100000
        except ValueError:
            pass

    # Standard number with commas (Indian style: 2,85,000 or Western: 285,000)
    cleaned = s.replace(",", "").strip()
    try:
        return float(cleaned) if "." in cleaned else float(int(cleaned))
    except (ValueError, TypeError):
        return None


def _validate_and_clean_fields(result: dict, text: str) -> dict:
    """Validate and fix common extraction mistakes in-place.

    Includes:
    - Currency stripping and lakhs/crores normalization
    - Date format normalization to ISO
    - Percentage field validation (0-100 range)
    - Monthly vs annual rent detection
    - Cross-validation: rent_schedule vs monthly_rent consistency
    """
    if not result or not isinstance(result, dict):
        return result

    # --- Recursively process nested dicts ---
    for key, val in result.items():
        if isinstance(val, dict):
            result[key] = _validate_and_clean_fields(val, text)

    # --- Strip currency symbols and normalize monetary fields ---
    monetary_fields = [
        "monthly_rent", "security_deposit", "cam_charges", "cam_monthly",
        "stamp_duty", "registration_charges", "total_monthly_outflow",
        "monthly_rent_per_sqft", "fit_out_cost", "maintenance_charges",
        "security_deposit_amount", "cam_deposit_amount", "total_amount",
        "current_charges", "previous_balance", "taxes_and_surcharges",
        "late_fee", "revised_rent", "revised_cam", "revised_security_deposit",
        "mglr_monthly", "rent_per_sqft", "mglr_per_sqft",
    ]
    for field in monetary_fields:
        if field in result and result[field] is not None:
            normalized = _normalize_indian_amount(result[field])
            if normalized is not None:
                result[field] = normalized
            else:
                result[field] = _strip_currency(result[field])

    # --- Normalize date fields to ISO YYYY-MM-DD ---
    date_fields = [
        "lease_commencement_date", "rent_commencement_date", "lease_expiry_date",
        "loi_date", "date_of_issue", "valid_from", "valid_to",
        "bill_date", "due_date", "billing_period_from", "billing_period_to",
        "effective_date", "execution_date", "reference_agreement_date",
        "revised_lease_expiry",
    ]
    for field in date_fields:
        if field in result and isinstance(result[field], str):
            normalized = _normalize_date(result[field])
            if normalized:
                result[field] = normalized

    # --- Validate percentage fields (0-100 range) ---
    percentage_fields = [
        "escalation_percentage", "cam_escalation_pct", "late_payment_interest_pct",
        "revised_escalation_pct",
    ]
    for field in percentage_fields:
        val = result.get(field)
        if isinstance(val, (int, float)):
            if val > 100:
                result[field] = None
            elif val < 0:
                result[field] = abs(val) if abs(val) <= 100 else None

    # --- Monthly rent: detect likely annual values ---
    rent = result.get("monthly_rent")
    if isinstance(rent, (int, float)) and rent > 1000000:
        text_lower = text.lower()
        if "per month" not in text_lower and "p.m." not in text_lower and "/month" not in text_lower:
            result["monthly_rent"] = round(rent / 12, 2)

    # --- Lease dates: swap if expiry < commencement ---
    commencement = result.get("lease_commencement_date")
    expiry = result.get("lease_expiry_date")
    if commencement and expiry and isinstance(commencement, str) and isinstance(expiry, str):
        try:
            dt_start = datetime.strptime(commencement, "%Y-%m-%d")
            dt_end = datetime.strptime(expiry, "%Y-%m-%d")
            if dt_end < dt_start:
                result["lease_commencement_date"] = expiry
                result["lease_expiry_date"] = commencement
        except (ValueError, TypeError):
            pass

    # --- Security deposit months: extract number from strings like "6 months" ---
    sd_months = result.get("security_deposit_months")
    if isinstance(sd_months, str):
        match = re.search(r"(\d+)", sd_months)
        result["security_deposit_months"] = int(match.group(1)) if match else None

    # --- Cross-validation: derive monthly_rent from rent_schedule if missing ---
    rent_section = result.get("rent", result)  # Handle both flat and nested structures
    if isinstance(rent_section, dict):
        rent_schedule = rent_section.get("rent_schedule")
        monthly_rent_val = rent_section.get("monthly_rent") if rent_section is result else result.get("monthly_rent")

        if isinstance(rent_schedule, list) and len(rent_schedule) > 0:
            first_entry = rent_schedule[0]
            if isinstance(first_entry, dict):
                schedule_rent = (
                    _normalize_indian_amount(first_entry.get("mglr_monthly"))
                    or _normalize_indian_amount(first_entry.get("monthly_rent"))
                    or _normalize_indian_amount(first_entry.get("rent"))
                )
                # If monthly_rent is missing but rent_schedule has data, derive it
                if schedule_rent and (monthly_rent_val is None or monthly_rent_val in ("", "not_found")):
                    if rent_section is result:
                        result["monthly_rent"] = schedule_rent
                    print(f"[VALIDATION] Derived monthly_rent={schedule_rent} from rent_schedule")

    return result


def _post_extraction_validation(extraction: dict, confidence: dict, doc_type: str) -> dict:
    """Run post-extraction validation checks on the extracted data.

    Checks:
    - Required fields are present and non-empty
    - Rent values are > 0 when present
    - Date fields are valid ISO dates
    - Fields with confidence < 0.5 (i.e. 'low' or 'not_found') are flagged as needs_review

    Returns a dict with:
    - 'valid': bool — whether the extraction passes basic validation
    - 'needs_review_fields': list of field names with low confidence that need manual review
    - 'validation_errors': list of human-readable error strings
    """
    needs_review_fields = []
    validation_errors = []

    # --- Mark low-confidence fields as needs_review ---
    for field_key, conf_level in confidence.items():
        if conf_level in ("low", "not_found"):
            needs_review_fields.append(field_key)

    # --- Required fields check (for lease/LOI documents) ---
    if doc_type in ("lease_loi", "franchise_agreement"):
        required_fields = {
            "lessor_name": "parties",
            "lessee_name": "parties",
            "city": "premises",
            "lease_commencement_date": "lease_term",
        }
        for field, section in required_fields.items():
            section_data = extraction.get(section, {})
            if isinstance(section_data, dict):
                val = section_data.get(field)
                if val is None or val == "" or val == "not_found" or val == "N/A":
                    validation_errors.append(f"Required field '{field}' is missing from the document.")
                    if field not in needs_review_fields:
                        needs_review_fields.append(field)

    # --- Rent validation: check rent > 0 ---
    rent_section = extraction.get("rent", {})
    if isinstance(rent_section, dict):
        rent_schedule = rent_section.get("rent_schedule")
        if isinstance(rent_schedule, list) and len(rent_schedule) > 0:
            first_entry = rent_schedule[0]
            if isinstance(first_entry, dict):
                rent_val = (
                    first_entry.get("mglr_monthly")
                    or first_entry.get("monthly_rent")
                    or first_entry.get("rent")
                )
                if rent_val is not None:
                    try:
                        if float(rent_val) <= 0:
                            validation_errors.append("Monthly rent is 0 or negative — please verify.")
                    except (ValueError, TypeError):
                        pass

    # --- Date validation: check dates are valid ISO ---
    date_fields_to_check = [
        ("lease_term", "lease_commencement_date"),
        ("lease_term", "lease_expiry_date"),
        ("lease_term", "rent_commencement_date"),
    ]
    for section, field in date_fields_to_check:
        section_data = extraction.get(section, {})
        if isinstance(section_data, dict):
            val = section_data.get(field)
            if val and isinstance(val, str):
                if not re.match(r"^\d{4}-\d{2}-\d{2}$", val):
                    # Not a strict error since formulas are valid, but flag if it looks like a bad date
                    if re.search(r"\d", val) and not any(kw in val.lower() for kw in ("days", "from", "after", "upon", "within")):
                        validation_errors.append(f"Date field '{field}' has non-standard format: '{val}'. Please verify.")
                        if field not in needs_review_fields:
                            needs_review_fields.append(field)

    return {
        "valid": len(validation_errors) == 0,
        "needs_review_fields": needs_review_fields,
        "validation_errors": validation_errors,
    }


# ============================================
# EXTRACTION
# ============================================

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
        f"You are an expert document extraction specialist for Indian commercial real estate with 20+ years experience. "
        f"Your task is to VERY CAREFULLY extract data from this {doc_type_label}. "
        "ACCURACY IS CRITICAL — every number, date, and name must be exact.\n\n"
        "INSTRUCTIONS:\n"
        "1. Read the ENTIRE document thoroughly before extracting ANY field.\n"
        "2. For monetary amounts: Look for Rs., INR, ₹ symbols. Convert words like 'lakh' and 'crore' to numbers "
        "(1 lakh = 100000, 1 crore = 10000000). Handle Indian numbering: 2,85,000 = 285000.\n"
        "3. For dates: Use YYYY-MM-DD format. If only month/year given, use first of month. "
        "Handle Indian date formats: DD/MM/YYYY, DD-MM-YYYY, DD.MM.YYYY.\n"
        "4. For areas: Distinguish between super area, carpet area, and covered area carefully.\n"
        "5. For rent: Check if the stated rent is monthly or annual — always return MONTHLY values.\n"
        "6. For escalation: Look for phrases like 'escalation of X% every Y years' or 'annual increment'.\n"
        "7. If a field's value is calculated from a formula (e.g., '60 days from handover'), "
        "return the formula as a string rather than guessing a date.\n"
        "8. For each field, also return a confidence score: 'high', 'medium', 'low', or 'not_found'.\n"
        "8b. SOURCE REFERENCES: For each extracted field, ALSO return 'source_page' (the page number where you found it, "
        "starting from 1) and 'source_quote' (the exact 10-30 word quote from the document where this value appears). "
        "Format each field as: {\"value\": <extracted_value>, \"confidence\": \"high|medium|low\", \"source_page\": <int>, "
        "\"source_quote\": \"<exact text from document>\"}. If you cannot identify the page, omit source_page.\n"
        "9. Cross-verify extracted values — if rent is 2,85,000/month, total outflow should be >= that.\n"
        "10. Pay special attention to: party names (lessor vs lessee), lock-in periods, notice periods.\n"
        "11. EXTRACT ALL FIELDS even if confidence is low — mark as 'low' confidence rather than skipping. "
        "Only use 'not_found' if the field is truly absent from the document.\n"
        "12. If the document is bilingual (Hindi/English), extract data from BOTH languages. "
        "Hindi terms to recognize: किरायेदार (tenant/lessee), मकान मालिक (lessor/landlord), "
        "किराया (rent), जमा राशि (deposit), अवधि (term/period), नवीनीकरण (renewal).\n\n"
        "INDIAN LEASE TERMINOLOGY TO WATCH FOR:\n"
        "- MGLR = Minimum Guaranteed License/Lease Revenue (the fixed rent floor in hybrid deals)\n"
        "- CAM = Common Area Maintenance charges\n"
        "- Fit-out period = rent-free period for tenant to build out the space\n"
        "- Lock-in period = period during which tenant cannot exit (typically 3-5 years)\n"
        "- Notice period = advance notice required before exit (typically 3-6 months)\n"
        "- Revenue share / percentage rent = tenant pays % of revenue in addition to or instead of fixed rent\n"
        "- Hybrid model = MGLR (fixed minimum) + revenue share above threshold\n"
        "- Escalation = annual/periodic rent increase (typically 5-15% every 1-3 years)\n"
        "- Security deposit = refundable deposit (often expressed as N months of rent)\n"
        "- Leave and License = type of commercial lease common in Maharashtra\n"
        "- Licensee/Licensor = same as Lessee/Lessor in L&L agreements\n"
        "- TDS = Tax Deducted at Source (tenant obligation to deduct tax on rent)\n"
        "- Stamp duty, registration charges\n"
        "- CTO/CTE = Consent to Operate / Consent to Establish\n\n"
        "COMMON INDIAN LEASE FORMAT EXAMPLES:\n"
        "- Rent schedule often appears as a table: Year 1: Rs X/sqft, Year 2: Rs Y/sqft, etc.\n"
        "- 'Rs. 2,85,000/- per month' or 'INR 2.85 Lakhs per month' = 285000 monthly\n"
        "- 'Escalation @ 5% p.a.' or '5% increase after every 12 months'\n"
        "- 'Security Deposit equivalent to 6 months rent' = 6 * monthly_rent\n"
        "- 'Lock-in period of 3 years from rent commencement date'\n"
        "- 'Fit-out period of 60 days from handover, rent-free'\n\n"
        "HANDLING COMMON INDIAN LEASE FORMATS:\n"
        "- Look for rent amounts stated in BOTH words and figures — e.g. 'Rs. 2,85,000/- (Rupees Two Lakhs Eighty Five Thousand Only per month)'. "
        "If words and figures conflict, prefer the figure.\n"
        "- GST is typically 18% in India for commercial lease rentals. Look for 'GST @18%', 'plus applicable GST', 'exclusive of GST'.\n"
        "- Lock-in period is commonly stated in months (e.g. '36 months') or years (e.g. '3 years'). Always convert to MONTHS.\n"
        "- Indian lease agreements often have rent stated as 'per month' OR 'per annum' — read carefully and always return MONTHLY values.\n"
        "- Stamp duty and registration clauses are common — note which party bears the cost.\n"
        "- 'Leave and License' agreements (common in Maharashtra) use 'Licensor/Licensee' instead of 'Lessor/Lessee'.\n\n"
        "Return valid JSON matching this schema:\n"
        f"{json.dumps(schema, indent=2)}\n\n"
    )

    # Add Indian lease template hint (Improvement #6)
    template_key = detect_lease_template(text)
    if template_key and template_key in INDIAN_LEASE_TEMPLATES:
        prompt += f"DOCUMENT TYPE HINT:\n{INDIAN_LEASE_TEMPLATES[template_key]}\n\n"

    prompt += f"DOCUMENT TEXT:\n{text}"

    # First extraction pass (with retry on failure)
    result = {}
    for attempt in range(2):
        try:
            use_prompt = prompt
            if attempt == 1:
                # Simplified retry prompt — shorter text, explicit instructions
                use_prompt = (
                    f"Extract ALL fields from this {doc_type_label} as JSON.\n"
                    f"Schema:\n{json.dumps(schema, indent=2)}\n\n"
                    f"DOCUMENT TEXT (first 10000 chars):\n{text[:10000]}"
                )
                print(f"[EXTRACTION] Retrying with simplified prompt (attempt {attempt + 1})")

            # Truncate document text to avoid exceeding context window
            # Keep first 15K chars — covers most lease content (typically 5-8K for core clauses)
            if attempt == 0 and len(use_prompt) > 20000:
                # Find the "DOCUMENT TEXT:" marker and truncate after it
                marker = "DOCUMENT TEXT:"
                marker_pos = use_prompt.find(marker)
                if marker_pos > 0:
                    preamble = use_prompt[:marker_pos + len(marker)]
                    doc_text = use_prompt[marker_pos + len(marker):]
                    use_prompt = preamble + doc_text[:15000]
                    print(f"[EXTRACTION] Truncated prompt from {len(prompt)} to {len(use_prompt)} chars")

            # Use Pro model for maximum accuracy — quality over speed
            print(f"[EXTRACTION] Attempt {attempt + 1}: Sending prompt ({len(use_prompt)} chars) to {model_pro.model_name}...")
            response = model_pro.generate_content(
                use_prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0,
                    max_output_tokens=16384,
                ),
            )

            if not response.text:
                print(f"[EXTRACTION] Attempt {attempt + 1}: Empty response! Candidates: {response.candidates}, Feedback: {getattr(response, 'prompt_feedback', 'N/A')}")
                continue

            print(f"[EXTRACTION] Attempt {attempt + 1}: Got {len(response.text)} chars response")
            parsed = json.loads(response.text)
            if isinstance(parsed, list) and len(parsed) > 0:
                parsed = parsed[0]
            if isinstance(parsed, dict) and parsed:
                print(f"[EXTRACTION] Attempt {attempt + 1}: Extracted {len(parsed)} top-level keys: {list(parsed.keys())}")
                result = parsed
                break
            else:
                print(f"[EXTRACTION] Attempt {attempt + 1}: Parsed but empty/invalid: {type(parsed)}")
        except (json.JSONDecodeError, Exception) as e:
            print(f"[EXTRACTION] Attempt {attempt + 1} failed: {type(e).__name__}: {e}")
            if hasattr(e, 'response'):
                print(f"[EXTRACTION] Response details: {getattr(e, 'response', 'N/A')}")
            if attempt == 1:
                result = {}  # Give up after retry

    # Field-level validation and cleanup
    if result and doc_type in ("lease_loi", "franchise_agreement", "supplementary_agreement"):
        result = _validate_and_clean_fields(result, text)

    # Verification pass — ask Gemini to double-check critical fields
    if result and doc_type in ("lease_loi", "franchise_agreement"):
        verify_prompt = (
            "You previously extracted this data from a lease document. "
            "VERIFY the following critical fields against the original text. "
            "If ANY value is wrong, return the corrected JSON. If all correct, return the same JSON.\n\n"
            "CRITICAL FIELDS TO VERIFY:\n"
            "- Monthly rent amount (must be MONTHLY, not annual)\n"
            "- Party names (who is lessor/licensor vs lessee/licensee — do NOT swap them)\n"
            "- Property name / mall name — OCR may have misread stylized fonts. "
            "Use context clues from the full document to correct obvious OCR errors in names. "
            "Example: 'PELX PLAZA' is likely 'FELIX PLAZA', 'HLUX MALL' is likely 'FLUX MALL'. "
            "Check if the name appears correctly elsewhere in the document.\n"
            "- Lease commencement and expiry dates (commencement must be BEFORE expiry)\n"
            "- Lock-in period (in months)\n"
            "- Security deposit (amount and number of months)\n"
            "- Area measurements (carpet vs super area)\n"
            "- CAM / maintenance charges (monthly amount)\n"
            "- Escalation percentage (should be reasonable: typically 3-25%. If > 25%, double-check.)\n"
            "- Notice period (in months)\n"
            "- Total monthly outflow should approximately equal: rent + CAM + maintenance + other charges. "
            "If it doesn't add up, fix the individual values.\n\n"
            f"Extracted data:\n{json.dumps(result, indent=2)}\n\n"
            f"Original text (first 8000 chars):\n{text[:8000]}"
        )
        try:
            verify_resp = model_pro.generate_content(
                verify_prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0,
                ),
            )
            verified = json.loads(verify_resp.text)
            if isinstance(verified, list) and len(verified) > 0:
                verified = verified[0]
            if isinstance(verified, dict) and verified:
                result = verified
        except Exception:
            pass  # Keep original extraction if verification fails

    return result


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
        f"You are an expert document extraction specialist for Indian commercial real estate with 20+ years experience. "
        f"Look at ALL document page images VERY CAREFULLY. Read every word, number, and date.\n\n"
        "ACCURACY IS CRITICAL — every number, date, and name must be exact.\n\n"
        "INSTRUCTIONS:\n"
        "1. Examine EVERY page thoroughly before extracting.\n"
        "2. For monetary amounts: Look for Rs., INR, ₹. Convert 'lakh'/'crore' to numbers "
        "(1 lakh = 100000, 1 crore = 10000000). Handle Indian numbering: 2,85,000 = 285000.\n"
        "3. For dates: Use YYYY-MM-DD format. Handle Indian formats: DD/MM/YYYY, DD-MM-YYYY.\n"
        "4. For rent: Always return MONTHLY values.\n"
        "5. Distinguish lessor (owner/licensor) from lessee (tenant/licensee) carefully.\n"
        "6. For each field, return an object with: {\"value\": ..., \"confidence\": \"high\"|\"medium\"|\"low\"|\"not_found\", \"source_page\": N} where source_page is the page number (1-indexed) where you found this data.\n"
        "7. If handwritten, do your best to read accurately.\n"
        "8. If a value is a formula (e.g., '60 days from handover'), return as string.\n"
        "9. EXTRACT ALL FIELDS even if confidence is low — mark as 'low' confidence rather than skipping.\n"
        "10. If the document is bilingual (Hindi/English), extract data from BOTH languages.\n\n"
        "INDIAN LEASE TERMINOLOGY:\n"
        "- MGLR = Minimum Guaranteed License/Lease Revenue (fixed rent floor in hybrid deals)\n"
        "- CAM = Common Area Maintenance charges\n"
        "- Fit-out period = rent-free period for tenant buildout\n"
        "- Lock-in = period during which tenant cannot exit (commonly stated in months in India)\n"
        "- Revenue share / hybrid model = MGLR + % of revenue above threshold\n"
        "- Leave and License = type of commercial lease (common in Maharashtra)\n"
        "- Licensee/Licensor = same as Lessee/Lessor in L&L agreements\n"
        "- GST is typically 18% in India for commercial leases\n\n"
        "IMPORTANT: Look for rent amounts in both words and figures. "
        "Lock-in period is commonly stated in months. "
        "If amounts appear in both words and numerals, prefer the numeral.\n\n"
        f"Extract fields for this {doc_type_label}.\n"
        f"Schema:\n{json.dumps(schema, indent=2)}"
    )

    try:
        page_images = images[:8]
        print(f"[VISION EXTRACT] Starting extraction with {len(page_images)} page images for doc_type={doc_type}")

        # --- Attempt 1: JSON mode ---
        result = None
        try:
            content = [prompt] + page_images
            response = model_pro.generate_content(
                content,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0,
                ),
            )
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

        # --- Attempt 2: Plain text mode ---
        if result is None:
            print("[VISION EXTRACT] Retrying without JSON mode...")
            try:
                response2 = model_pro.generate_content(
                    [prompt + "\n\nIMPORTANT: Return ONLY valid JSON. No markdown fences, no explanation."] + page_images,
                    generation_config=genai.GenerationConfig(temperature=0),
                )
                raw = response2.text.strip()
                print(f"[VISION EXTRACT] Plain mode response length: {len(raw)}")
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
                ocr_response = model_pro.generate_content(
                    [ocr_prompt] + page_images,
                    generation_config=genai.GenerationConfig(temperature=0),
                )
                ocr_text = ocr_response.text.strip()
                print(f"[VISION EXTRACT] Gemini OCR produced {len(ocr_text)} chars")
                if len(ocr_text) >= 50:
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


# ============================================
# CONFIDENCE & RISK FLAGS
# ============================================

def calculate_confidence(extraction: dict) -> dict:
    """Calculate granular confidence scores for each field in the extraction.

    Confidence levels (from best to worst):
    - "high": Value present and looks well-formed (proper format, reasonable range)
    - "medium": Value present but may have quality issues (unusual format, edge-case values)
    - "low": Value present but likely unreliable (very short, placeholder-like, out of range)
    - "not_found": Field is missing, empty, or explicitly marked as not found
    """
    if not isinstance(extraction, dict):
        return {}
    confidence = {}

    def _assess_field_confidence(field_key: str, field_val) -> str:
        """Assess confidence for a single field based on value quality signals."""
        # Explicit not_found
        if field_val is None or field_val == "" or field_val == "not_found" or field_val == "N/A":
            return "not_found"

        # If it's a dict with explicit confidence from the model
        if isinstance(field_val, dict) and "confidence" in field_val:
            model_conf = str(field_val["confidence"]).lower()
            if model_conf in ("high", "medium", "low", "not_found"):
                return model_conf

        # If it's a dict with value + confidence structure
        if isinstance(field_val, dict) and "value" in field_val:
            inner_val = field_val.get("value")
            inner_conf = field_val.get("confidence", "").lower() if isinstance(field_val.get("confidence"), str) else ""
            if inner_conf in ("high", "medium", "low", "not_found"):
                return inner_conf
            field_val = inner_val  # Assess the inner value below

        # Check quality signals based on field type
        if field_val is None or field_val == "" or field_val == "not_found":
            return "not_found"

        # Date fields
        if field_key.endswith("_date") or field_key in ("valid_from", "valid_to", "loi_date"):
            if isinstance(field_val, str):
                if re.match(r"^\d{4}-\d{2}-\d{2}$", field_val):
                    return "high"
                elif re.search(r"\d", field_val):
                    return "medium"  # Has numbers but not ISO format
                else:
                    return "low"  # Formula or text description

        # Numeric fields
        if isinstance(field_val, (int, float)):
            if field_val == 0:
                return "medium"  # Zero could be intentional or extraction failure
            return "high"

        # String fields
        if isinstance(field_val, str):
            stripped = field_val.strip()
            if len(stripped) < 2:
                return "low"
            if stripped.lower() in ("na", "n/a", "nil", "none", "-", "unknown", "not specified", "not mentioned"):
                return "not_found"
            if len(stripped) < 5 and not any(c.isdigit() for c in stripped):
                return "medium"
            return "high"

        # Lists
        if isinstance(field_val, list):
            return "high" if len(field_val) > 0 else "not_found"

        # Booleans
        if isinstance(field_val, bool):
            return "high"

        return "medium"

    for section_key, section_val in extraction.items():
        if isinstance(section_val, dict):
            for field_key, field_val in section_val.items():
                if field_key.endswith("_confidence"):
                    # Use model-provided confidence directly
                    conf_val = str(field_val).lower()
                    confidence[field_key.replace("_confidence", "")] = (
                        conf_val if conf_val in ("high", "medium", "low", "not_found") else "medium"
                    )
                else:
                    confidence[field_key] = _assess_field_confidence(field_key, field_val)
        else:
            # Top-level fields (non-nested)
            if not section_key.endswith("_confidence"):
                confidence[section_key] = _assess_field_confidence(section_key, section_val)

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
        "clause_text (relevant text from document), source_page (page number where the clause appears, 1-indexed)\n\n"
        f"Extracted lease data:\n{json.dumps(extraction, indent=2)}\n\n"
        f"Full document text:\n{text[:8000]}"
    )

    response = model_pro.generate_content(
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
            "clause_text (relevant text from document), source_page (page number where the clause appears, 1-indexed)\n\n"
            f"Extracted lease data:\n{json.dumps(extraction, indent=2)}"
        )
        content = [prompt] + images[:10]
        response = model_pro.generate_content(
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


def _detect_india_specific_risk_flags(extraction: dict) -> list:
    """Detect India-specific commercial lease risk flags from extracted structured data."""
    flags = []
    flag_id_start = 100  # Use 100+ range to avoid collision with AI-generated flag IDs (1-8)

    # Helper to reach into nested sections (unwraps {value, confidence} objects)
    def _get(section: str, key: str, default=None):
        sec = extraction.get(section, {})
        if not isinstance(sec, dict):
            return default
        val = sec.get(key, default)
        if isinstance(val, dict) and "value" in val:
            return val["value"]
        return val

    # --- 1. No force majeure clause ---
    force_majeure = _get("legal", "force_majeure_clause")
    if not force_majeure:
        flags.append({
            "flag_id": flag_id_start + 1,
            "severity": "medium",
            "explanation": "No force majeure clause found. Rent obligations may continue during pandemics, lockdowns, or government restrictions.",
            "clause_text": "",
        })

    # --- 2. No exclusivity clause ---
    exclusivity = _get("legal", "exclusivity_clause")
    if not exclusivity:
        flags.append({
            "flag_id": flag_id_start + 2,
            "severity": "medium",
            "explanation": "No exclusivity clause. Landlord may lease adjacent spaces to direct competitors.",
            "clause_text": "",
        })

    # --- 3. No co-tenancy clause (mall only) ---
    property_type = _get("premises", "property_type")
    prop_type_lower = (property_type or "").lower().strip()
    co_tenancy = _get("legal", "co_tenancy_clause")
    if prop_type_lower == "mall" and not co_tenancy:
        flags.append({
            "flag_id": flag_id_start + 3,
            "severity": "low",
            "explanation": "No co-tenancy clause for mall property. No rent relief if anchor tenants leave.",
            "clause_text": "",
        })

    # --- 4. Long lock-in period (> 36 months) ---
    lock_in_months = _get("lease_term", "lock_in_months")
    try:
        lock_in_val = float(lock_in_months) if lock_in_months is not None else None
    except (ValueError, TypeError):
        lock_in_val = None
    if lock_in_val is not None and lock_in_val > 36:
        flags.append({
            "flag_id": flag_id_start + 4,
            "severity": "medium",
            "explanation": f"Lock-in period exceeds 3 years ({int(lock_in_val)} months). Consider negotiating shorter lock-in to reduce risk.",
            "clause_text": "",
        })

    # --- 5. No subleasing allowed ---
    subleasing = _get("legal", "subleasing_allowed")
    if subleasing is False or (isinstance(subleasing, str) and subleasing.lower() in ("false", "no", "not permitted")):
        flags.append({
            "flag_id": flag_id_start + 5,
            "severity": "low",
            "explanation": "Subleasing/assignment not permitted. May limit flexibility for franchise or group entity transfers.",
            "clause_text": "",
        })

    # --- 6. High escalation (> 10%) ---
    escalation_pct = _get("rent", "escalation_percentage")
    try:
        esc_val = float(escalation_pct) if escalation_pct is not None else None
    except (ValueError, TypeError):
        esc_val = None
    if esc_val is not None and esc_val > 10:
        flags.append({
            "flag_id": flag_id_start + 6,
            "severity": "medium",
            "explanation": f"Escalation rate of {esc_val}% exceeds typical market range (5-7% annually).",
            "clause_text": "",
        })

    # --- 7. No parking allocation (mall or high_street) ---
    parking_slots = _get("premises", "parking_slots")
    if prop_type_lower in ("mall", "high_street") and (parking_slots is None or parking_slots == "" or parking_slots == 0):
        flags.append({
            "flag_id": flag_id_start + 7,
            "severity": "low",
            "explanation": "No parking slots allocated. Customer access may be affected.",
            "clause_text": "",
        })

    # --- 8. Security deposit > 6 months ---
    sd_months = _get("deposits", "security_deposit_months")
    try:
        sd_val = float(sd_months) if sd_months is not None else None
    except (ValueError, TypeError):
        sd_val = None
    if sd_val is not None and sd_val > 6:
        flags.append({
            "flag_id": flag_id_start + 8,
            "severity": "medium",
            "explanation": f"Security deposit equivalent to {int(sd_val)} months exceeds typical range (3-6 months).",
            "clause_text": "",
        })

    return flags


# ============================================
# EXTRACTION MERGE & DERIVATION HELPERS
# ============================================

def _merge_extractions(primary: dict, secondary: dict, primary_conf: dict, secondary_conf: dict) -> int:
    """Merge fields from secondary extraction into primary where primary has not_found/low confidence.

    Only fills in fields that are missing or low-confidence in primary.
    Returns the number of fields merged.
    """
    merged = 0
    for key, sec_val in secondary.items():
        if isinstance(sec_val, dict) and isinstance(primary.get(key), dict):
            # Recurse into nested sections
            for field_key, field_val in sec_val.items():
                if field_key.endswith("_confidence"):
                    continue
                pri_section = primary[key]
                pri_field_conf = primary_conf.get(field_key, "not_found")
                sec_field_conf = secondary_conf.get(field_key, "not_found")

                # Fill if primary is not_found/low and secondary is better
                if pri_field_conf in ("not_found", "low") and sec_field_conf in ("high", "medium"):
                    if field_val is not None and field_val != "" and field_val != "not_found":
                        pri_section[field_key] = field_val
                        primary_conf[field_key] = sec_field_conf
                        merged += 1
        elif not isinstance(sec_val, dict):
            # Top-level field
            pri_conf = primary_conf.get(key, "not_found")
            sec_conf = secondary_conf.get(key, "not_found")

            if pri_conf in ("not_found", "low") and sec_conf in ("high", "medium"):
                if sec_val is not None and sec_val != "" and sec_val != "not_found":
                    primary[key] = sec_val
                    primary_conf[key] = sec_conf
                    merged += 1
    return merged


def _derive_missing_fields(extraction: dict, confidence: dict):
    """Try to derive missing fields from related extracted data.

    Examples:
    - If monthly_rent is missing but rent_schedule exists, derive from first entry
    - If lease_expiry_date is missing but commencement + term_years exist, calculate it
    - If cam_monthly is missing but cam_rate_per_sqft and area exist, calculate it
    - If security_deposit_amount is missing but months and monthly_rent exist, calculate it
    """
    rent = extraction.get("rent", {})
    lease_term = extraction.get("lease_term", {})
    charges = extraction.get("charges", {})
    deposits = extraction.get("deposits", {})
    premises = extraction.get("premises", {})

    if not isinstance(rent, dict):
        rent = {}
    if not isinstance(lease_term, dict):
        lease_term = {}
    if not isinstance(charges, dict):
        charges = {}
    if not isinstance(deposits, dict):
        deposits = {}
    if not isinstance(premises, dict):
        premises = {}

    # --- Derive monthly_rent from rent_schedule ---
    monthly_rent_val = _get_nested_val(rent, "monthly_rent")
    rent_schedule = rent.get("rent_schedule")
    if monthly_rent_val is None and isinstance(rent_schedule, list) and len(rent_schedule) > 0:
        first = rent_schedule[0]
        if isinstance(first, dict):
            derived = (
                _get_nested_num(first, "mglr_monthly")
                or _get_nested_num(first, "monthly_rent")
                or _get_nested_num(first, "rent")
            )
            if derived:
                rent["monthly_rent"] = derived
                confidence["monthly_rent"] = "medium"
                print(f"[DERIVE] monthly_rent={derived} from rent_schedule")

    # --- Derive lease_expiry_date from commencement + term_years ---
    expiry_val = _get_nested_val(lease_term, "lease_expiry_date")
    commencement_val = _get_nested_val(lease_term, "lease_commencement_date")
    term_years = _get_nested_num(lease_term, "lease_term_years")
    if expiry_val is None and commencement_val and term_years:
        try:
            comm_date = date.fromisoformat(str(commencement_val))
            expiry_date = comm_date + relativedelta(years=int(term_years))
            lease_term["lease_expiry_date"] = expiry_date.isoformat()
            confidence["lease_expiry_date"] = "medium"
            print(f"[DERIVE] lease_expiry_date={expiry_date.isoformat()} from commencement + {term_years} years")
        except (ValueError, TypeError):
            pass

    # --- Derive cam_monthly from cam_rate_per_sqft * area ---
    cam_monthly_val = _get_nested_num(charges, "cam_monthly")
    cam_rate = _get_nested_num(charges, "cam_rate_per_sqft")
    if cam_monthly_val is None and cam_rate:
        area_basis = _get_nested_val(charges, "cam_area_basis") or "super_area"
        area = None
        if "super" in str(area_basis).lower():
            area = _get_nested_num(premises, "super_area_sqft")
        if area is None:
            area = _get_nested_num(premises, "covered_area_sqft") or _get_nested_num(premises, "super_area_sqft")
        if area:
            derived_cam = round(cam_rate * area, 2)
            charges["cam_monthly"] = derived_cam
            confidence["cam_monthly"] = "medium"
            print(f"[DERIVE] cam_monthly={derived_cam} from {cam_rate}/sqft * {area} sqft")

    # --- Derive security_deposit_amount from months * monthly_rent ---
    sd_amount = _get_nested_num(deposits, "security_deposit_amount")
    sd_months = _get_nested_num(deposits, "security_deposit_months")
    final_monthly_rent = _get_nested_num(rent, "monthly_rent")
    if sd_amount is None and sd_months and final_monthly_rent:
        derived_sd = round(sd_months * final_monthly_rent, 2)
        deposits["security_deposit_amount"] = derived_sd
        confidence["security_deposit_amount"] = "medium"
        print(f"[DERIVE] security_deposit_amount={derived_sd} from {sd_months} months * {final_monthly_rent}")


def _get_nested_val(section: dict, key: str):
    """Get value from a section, handling {value, confidence} wrapper objects."""
    val = section.get(key)
    if val is None or val in ("", "not_found", "N/A", "null"):
        return None
    if isinstance(val, dict) and "value" in val:
        v = val["value"]
        if v in (None, "", "not_found", "N/A", "null"):
            return None
        return v
    return val


def _get_nested_num(section: dict, key: str) -> Optional[float]:
    """Get numeric value from a section, handling wrappers."""
    v = _get_nested_val(section, key)
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    try:
        return float(str(v).replace(",", ""))
    except (ValueError, TypeError):
        return None


# ============================================
# UNIVERSAL DOCUMENT PROCESSOR
# ============================================

async def process_document(file_bytes: bytes, filename: str) -> dict:
    """
    Universal document processor. Handles PDFs (text-based, scanned, mixed)
    and image files. Never raises — always returns a result dict.
    """
    extraction_method = "unknown"
    text = ""
    images = []
    ocr_pages = []  # Word-level bounding boxes for scanned doc highlighting
    doc_type = "lease_loi"
    extraction = {}
    confidence = {}
    risk_flags = []
    error_message = None

    try:
        file_type = get_file_type(filename)

        # --- Step 1: Get content — DUAL EXTRACTION (Improvement #1) ---
        import time as _time
        _extraction_start = _time.time()

        table_text = ""
        if file_type == "pdf":
            # Run dual extraction: PyMuPDF + Cloud Vision
            try:
                text, pymupdf_text, cv_text = await extract_text_dual(file_bytes)
            except Exception:
                text = ""
                pymupdf_text = ""
                cv_text = ""

            # Extract tables with pdfplumber (Improvement #2)
            try:
                table_text = extract_tables_from_pdf(file_bytes)
            except Exception as e:
                print(f"[PROCESS] Table extraction failed: {e}")

            # Try Document AI if configured (best quality for tables/forms)
            docai_text = ""
            try:
                docai_text = await extract_with_document_ai(file_bytes)
                if docai_text and len(docai_text.strip()) > len(text.strip()) * 1.2:
                    print(f"[PROCESS] Document AI produced better results ({len(docai_text)} vs {len(text.strip())} chars)")
                    text = docai_text
                    table_text = ""  # Already included in docai_text
                    extraction_method = "document_ai"
            except Exception as e:
                print(f"[PROCESS] Document AI skipped: {e}")

            print(f"[PROCESS] Dual extraction: {len(text.strip())} chars, tables: {len(table_text.strip())} chars")

            # Need at least 500 chars of actual content for text-based extraction
            # Scanned PDFs often have ~100-200 chars of metadata but no real content
            min_text_threshold = 500
            if len(text.strip()) >= min_text_threshold:
                extraction_method = "text+cloud_vision" if cv_text else "text"
                # Append table data to text for Gemini context (preserving page markers)
                if table_text.strip():
                    text = text + "\n\n" + table_text
                # Extract bboxes for highlighting if Cloud Vision was used
                # Run in background — don't block extraction
                if cv_text and not ocr_pages:
                    try:
                        if not images:
                            images = pdf_bytes_to_images(file_bytes)
                        if images:
                            # Only extract bboxes for first 5 pages to save time
                            bbox_images = images[:5]
                            bbox_result = extract_text_with_bboxes(bbox_images)
                            ocr_pages = bbox_result.get("pages", [])
                            print(f"[PROCESS] BBox extraction: {sum(len(p.get('words', [])) for p in ocr_pages)} words across {len(ocr_pages)} pages (of {len(images)} total)")
                    except Exception as bbox_err:
                        print(f"[PROCESS] BBox extraction failed: {bbox_err}")
            else:
                print(f"[PROCESS] Text too sparse ({len(text.strip())} chars < {min_text_threshold}), falling back to vision...")
                images = pdf_bytes_to_images(file_bytes)
                print(f"[PROCESS] Converted PDF to {len(images)} page images")
                if images:
                    # Extract text + bounding boxes together
                    bbox_result = extract_text_with_bboxes(images)
                    cloud_vision_text = bbox_result.get("text", "")
                    ocr_pages = bbox_result.get("pages", [])
                    print(f"[PROCESS] Cloud Vision OCR: {len(cloud_vision_text.strip())} chars, {sum(len(p.get('words', [])) for p in ocr_pages)} words with bboxes")
                    if len(cloud_vision_text.strip()) >= 100:
                        text = cloud_vision_text
                        if table_text.strip():
                            text = text + "\n\n" + table_text
                        extraction_method = "cloud_vision"
                    else:
                        extraction_method = "vision"
                else:
                    extraction_method = "text" if text.strip() else "failed"

        elif file_type == "image":
            images = load_image_bytes(file_bytes)
            if images:
                bbox_result = extract_text_with_bboxes(images)
                cloud_vision_text = bbox_result.get("text", "")
                ocr_pages = bbox_result.get("pages", [])
                if len(cloud_vision_text.strip()) >= 100:
                    text = cloud_vision_text
                    extraction_method = "cloud_vision"
                else:
                    extraction_method = "vision"
            else:
                extraction_method = "failed"

        else:
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
        if extraction_method in ("text", "cloud_vision", "text+cloud_vision", "document_ai") and text:
            text = clean_ocr_text(text)

        # --- Step 2: Classify ---
        if extraction_method in ("text", "cloud_vision", "text+cloud_vision", "document_ai"):
            doc_type = await classify_document(text)
        elif extraction_method == "vision":
            doc_type = await classify_document_vision(images)

        # --- Step 3: Extract structured data ---
        print(f"[PROCESS] Using extraction method: {extraction_method}, doc_type: {doc_type}")
        if extraction_method in ("text", "cloud_vision", "text+cloud_vision", "document_ai"):
            extraction = await extract_structured_data(text, doc_type)
        elif extraction_method == "vision":
            extraction = await extract_structured_data_vision(images, doc_type)
            # Also do OCR pass to get raw text for OCR view + Q&A
            if images and len((text or "").strip()) < 500:
                try:
                    ocr_prompt = (
                        "You are an OCR specialist. Transcribe ALL visible text from these document page images.\n"
                        "Rules:\n"
                        "- Before each page's text, write: --- PAGE X ---\n"
                        "- Include EVERY word, number, date, address, and clause exactly as written\n"
                        "- Preserve paragraph structure and line breaks\n"
                        "- For tables, format as aligned text\n"
                        "- If handwritten, do your best to read it\n"
                        "- Do NOT summarize or skip any content\n"
                        "Begin transcription:"
                    )
                    # Process in batches of 5 pages to avoid token limits
                    all_ocr_text = ""
                    for batch_start in range(0, len(images), 5):
                        batch = images[batch_start:batch_start + 5]
                        batch_prompt = ocr_prompt if batch_start == 0 else f"Continue transcribing from page {batch_start + 1}:"
                        ocr_content = [batch_prompt] + batch
                        ocr_response = model.generate_content(
                            ocr_content,
                            generation_config=genai.GenerationConfig(temperature=0, max_output_tokens=16000),
                        )
                        all_ocr_text += (ocr_response.text or "") + "\n"
                    text = all_ocr_text.strip()
                    text = ocr_response.text or ""
                    print(f"[PROCESS] Gemini OCR pass: {len(text)} chars extracted for OCR view")
                except Exception as ocr_err:
                    print(f"[PROCESS] Gemini OCR pass failed: {ocr_err}")
        print(f"[PROCESS] Extraction result: {len(extraction)} top-level keys")

        # --- Step 4: Calculate confidence ---
        confidence = calculate_confidence(extraction)

        # --- Step 4.5: Fallback — retry with Cloud Vision OCR if text extraction gave low confidence ---
        # Skip if already >60s to avoid timeout during demo
        _step4_elapsed = _time.time() - _extraction_start
        if (
            _step4_elapsed < 60
            and extraction_method in ("text", "text+cloud_vision")
            and extraction
            and doc_type in ("lease_loi", "franchise_agreement")
        ):
            not_found_count = sum(1 for v in confidence.values() if v == "not_found")
            low_count = sum(1 for v in confidence.values() if v == "low")
            total_fields = len(confidence)

            # If >40% of fields are not_found or low, retry with OCR
            if total_fields > 0 and (not_found_count + low_count) / total_fields > 0.4:
                print(f"[PROCESS] Low confidence on text extraction ({not_found_count} not_found, {low_count} low out of {total_fields}). Retrying with Cloud Vision OCR...")
                try:
                    if not images:
                        images = pdf_bytes_to_images(file_bytes)
                    if images:
                        ocr_text = extract_text_cloud_vision(images)
                        if len(ocr_text.strip()) >= 100:
                            ocr_text = clean_ocr_text(ocr_text)
                            ocr_extraction = await extract_structured_data(ocr_text, doc_type)
                            ocr_confidence = calculate_confidence(ocr_extraction)
                            ocr_not_found = sum(1 for v in ocr_confidence.values() if v == "not_found")
                            ocr_low = sum(1 for v in ocr_confidence.values() if v == "low")

                            # Use OCR result if it's better
                            if (ocr_not_found + ocr_low) < (not_found_count + low_count):
                                print(f"[PROCESS] OCR fallback produced better results ({ocr_not_found} not_found, {ocr_low} low). Using OCR extraction.")
                                extraction = ocr_extraction
                                confidence = ocr_confidence
                                text = ocr_text
                                extraction_method = "cloud_vision_fallback"
                            else:
                                # Merge: fill in not_found fields from OCR result
                                merged_count = _merge_extractions(extraction, ocr_extraction, confidence, ocr_confidence)
                                if merged_count > 0:
                                    print(f"[PROCESS] Merged {merged_count} fields from OCR fallback into text extraction.")
                                    confidence = calculate_confidence(extraction)
                                    extraction_method = "text+cloud_vision"
                except Exception as e:
                    print(f"[PROCESS] OCR fallback failed: {type(e).__name__}: {e}")

        # --- Step 4.6: Validate extracted values against source text (Improvement #3) ---
        if extraction and text and extraction_method != "vision":
            source_validated_confidence = validate_values_against_source(extraction, text)
            # Merge: only downgrade confidence, never upgrade
            for key, validated_conf in source_validated_confidence.items():
                existing = confidence.get(key)
                conf_order = {"not_found": 0, "low": 1, "medium": 2, "high": 3}
                if existing and conf_order.get(validated_conf, 2) < conf_order.get(existing, 2):
                    confidence[key] = validated_conf

        # --- Step 4.65: Two-pass focused retry (Improvement #4) ---
        # Skip if extraction already took >90s (avoid timeout during demo)
        _elapsed = _time.time() - _extraction_start
        if extraction and text and doc_type in ("lease_loi", "franchise_agreement") and _elapsed < 90:
            not_found_count = sum(1 for v in confidence.values() if v in ("not_found", "low"))
            if not_found_count >= 5:
                extraction = await focused_retry_extraction(text, extraction, confidence, doc_type)
        elif _elapsed >= 90:
            print(f"[PROCESS] Skipping focused retry — extraction already took {_elapsed:.0f}s")

        # Recalculate confidence after retry
        if extraction:
            confidence = calculate_confidence(extraction)

        # --- Step 4.7: Derive missing fields from related extracted data ---
        if extraction and doc_type in ("lease_loi", "franchise_agreement"):
            _derive_missing_fields(extraction, confidence)

        # --- Step 4.75: Cross-field validation rules (Improvement #7) ---
        cross_field_warnings = []
        if extraction and doc_type in ("lease_loi", "franchise_agreement"):
            cross_field_warnings = cross_field_validation(extraction, confidence)

        # --- Step 4.8: Post-extraction validation ---
        validation_result = _post_extraction_validation(extraction, confidence, doc_type)
        if validation_result["needs_review_fields"]:
            print(f"[PROCESS] Fields needing review: {validation_result['needs_review_fields']}")
        if validation_result["validation_errors"]:
            print(f"[PROCESS] Validation issues: {validation_result['validation_errors']}")

        # --- Step 5: Detect risk flags ---
        if doc_type == "lease_loi":
            try:
                if extraction_method in ("text", "cloud_vision", "cloud_vision_fallback", "text+cloud_vision"):
                    risk_flags = await detect_risk_flags(text, extraction)
                elif extraction_method == "vision":
                    risk_flags = await detect_risk_flags_vision(images, extraction)
            except Exception:
                risk_flags = []

            # --- Step 5.1: Add India-specific code-based risk flags ---
            india_flags = _detect_india_specific_risk_flags(extraction)
            if india_flags:
                # Deduplicate: avoid adding a code-based flag if the AI already flagged a similar concern
                existing_explanations = {f.get("explanation", "").lower()[:40] for f in risk_flags if isinstance(f, dict)}
                for flag in india_flags:
                    short_key = flag["explanation"].lower()[:40]
                    if short_key not in existing_explanations:
                        risk_flags.append(flag)

        if extraction_method == "failed":
            error_message = "Could not extract content from this file. The file may be empty, corrupt, or in an unsupported format."

    except Exception as e:
        error_message = f"Processing error: {str(e)}"
        extraction_method = "failed"

    # Build validation info (may not exist if process failed before that step)
    validation_info = locals().get("validation_result", {
        "valid": False, "needs_review_fields": [], "validation_errors": ["Extraction did not complete."]
    })

    return {
        "status": "success" if extraction_method != "failed" else "partial",
        "document_type": doc_type,
        "extraction": extraction,
        "confidence": confidence,
        "risk_flags": risk_flags,
        "filename": filename,
        "text_length": len(text),
        "extraction_method": extraction_method,
        "error": error_message,
        "document_text": text if text and len(text.strip()) >= 100 else None,
        "ocr_pages": ocr_pages if ocr_pages else None,
        "needs_review_fields": validation_info.get("needs_review_fields", []),
        "validation_errors": validation_info.get("validation_errors", []),
        "cross_field_warnings": locals().get("cross_field_warnings", []),
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

    new_org = supabase.table("organizations").insert({
        "id": str(uuid.uuid4()),
        "name": "GroSpace Demo",
    }).execute()
    return new_org.data[0]["id"]


def generate_site_code(city: str, locality: str, org_id: str) -> str:
    """Generate a unique site code like 'DelRG-01' for an outlet."""
    city_lower = (city or "").strip().lower()
    city_abbr = CITY_ABBREVIATIONS.get(city_lower, (city or "XXX")[:3].title())

    if locality and locality.strip():
        words = locality.strip().split()
        loc_abbr = "".join(w[0].upper() for w in words if w)[:3]
    else:
        loc_abbr = "XX"

    prefix = f"{city_abbr}{loc_abbr}"

    try:
        existing = supabase.table("outlets").select("site_code").eq("org_id", org_id).ilike("site_code", f"{prefix}-%").execute()
        seq = len(existing.data) + 1
    except Exception:
        seq = 1

    return f"{prefix}-{seq:02d}"


def build_outlet_data(extraction: dict, org_id: str) -> dict:
    """Build outlet data dict without inserting. For use with transactional RPC."""
    premises = get_section(extraction, "premises")
    parties = get_section(extraction, "parties")
    franchise = get_section(extraction, "franchise")

    prop_type = get_val(premises.get("property_type"))
    valid_types = {"mall", "high_street", "cloud_kitchen", "metro", "transit", "cyber_park", "hospital", "college", "educational_hub"}
    if prop_type and prop_type.lower() in valid_types:
        prop_type = prop_type.lower()
    else:
        prop_type = None

    fm = get_val(franchise.get("franchise_model"))
    valid_fm = {"FOFO", "FOCO", "COCO", "FICO", "direct_lease"}
    if fm and fm.upper() in valid_fm:
        fm = fm.upper()
    else:
        fm = None

    city = get_val(premises.get("city"))
    locality = get_val(premises.get("locality"))
    site_code = generate_site_code(city, locality, org_id)

    outlet_data = {
        "id": str(uuid.uuid4()),
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
    return {k: v for k, v in outlet_data.items() if v is not None}


def build_agreement_data(extraction: dict, doc_type: str, risk_flags: list, confidence: dict,
                         filename: str, org_id: str, document_text: Optional[str] = None,
                         document_url: Optional[str] = None, file_hash: Optional[str] = None,
                         custom_notes: Optional[str] = None, custom_clauses: Optional[list] = None) -> dict:
    """Build agreement data dict without inserting. For use with transactional RPC."""
    parties = get_section(extraction, "parties")
    lease_term = get_section(extraction, "lease_term")
    rent = get_section(extraction, "rent")
    charges = get_section(extraction, "charges")
    deposits = get_section(extraction, "deposits")
    legal = get_section(extraction, "legal")

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
    total = (monthly_rent or 0) + (cam_monthly or 0)

    rm = get_val(rent.get("rent_model"))
    valid_rm = {"fixed", "revenue_share", "hybrid_mglr", "percentage_only"}
    if rm and rm.lower() in valid_rm:
        rm = rm.lower()
    else:
        rm = None

    agreement_data = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "type": doc_type,
        "status": "active",
        "document_filename": filename,
        "document_url": document_url,
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
        "file_hash": file_hash,
        "custom_notes": custom_notes,
        "custom_clauses": custom_clauses or [],
        "confirmed_at": datetime.utcnow().isoformat(),
    }

    commencement = get_date(lease_term.get("lease_commencement_date"))
    lock_in_months = get_num(lease_term.get("lock_in_months"))
    if commencement and lock_in_months:
        try:
            comm_date = date.fromisoformat(commencement)
            lock_in_end = comm_date + relativedelta(months=int(lock_in_months))
            agreement_data["lock_in_end_date"] = lock_in_end.isoformat()
        except (ValueError, TypeError):
            pass

    return {k: v for k, v in agreement_data.items() if v is not None}


def build_obligations_data(extraction: dict, org_id: str) -> list:
    """Build obligations data list without inserting. For use with transactional RPC.
    outlet_id and agreement_id are injected by the RPC function."""
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

    rent_schedule = get_val(rent.get("rent_schedule"))
    monthly_rent = None
    if isinstance(rent_schedule, list) and len(rent_schedule) > 0:
        first = rent_schedule[0]
        if isinstance(first, dict):
            monthly_rent = get_num(first.get("mglr_monthly")) or get_num(first.get("monthly_rent")) or get_num(first.get("rent"))

    if monthly_rent:
        obligations.append({
            "org_id": org_id, "type": "rent", "frequency": "monthly", "amount": monthly_rent,
            "due_day_of_month": payment_day, "start_date": start_date, "end_date": end_date,
            "escalation_pct": esc_pct, "escalation_frequency_years": int(esc_freq) if esc_freq else None,
            "next_escalation_date": next_esc, "is_active": True,
        })

    cam_monthly = get_num(charges.get("cam_monthly"))
    if cam_monthly:
        cam_esc = get_num(charges.get("cam_escalation_pct"))
        obligations.append({
            "org_id": org_id, "type": "cam", "frequency": "monthly", "amount": cam_monthly,
            "due_day_of_month": payment_day, "start_date": lease_comm or start_date, "end_date": end_date,
            "escalation_pct": cam_esc, "is_active": True,
        })

    hvac_rate = get_num(charges.get("hvac_rate_per_sqft"))
    if hvac_rate:
        area = get_num(premises.get("covered_area_sqft")) or get_num(premises.get("super_area_sqft"))
        if area:
            area_basis = get_val(charges.get("hvac_area_basis")) or "covered_area"
            obligations.append({
                "org_id": org_id, "type": "hvac", "frequency": "monthly", "amount": hvac_rate * area,
                "amount_formula": f"{hvac_rate}/sqft x {area} sqft ({area_basis})",
                "due_day_of_month": payment_day, "start_date": lease_comm or start_date, "end_date": end_date,
                "is_active": True,
            })

    elec_load = get_num(charges.get("electricity_load_kw"))
    if elec_load:
        obligations.append({
            "org_id": org_id, "type": "electricity", "frequency": "monthly", "amount": None,
            "amount_formula": f"Actual metered ({elec_load} KW load)",
            "due_day_of_month": payment_day, "start_date": lease_comm or start_date, "end_date": end_date,
            "is_active": True,
        })

    sec_dep = get_num(deposits.get("security_deposit_amount"))
    if sec_dep:
        obligations.append({
            "org_id": org_id, "type": "security_deposit", "frequency": "one_time",
            "amount": sec_dep, "start_date": lease_comm or start_date, "is_active": True,
        })

    cam_dep = get_num(deposits.get("cam_deposit_amount"))
    if cam_dep:
        obligations.append({
            "org_id": org_id, "type": "cam_deposit", "frequency": "one_time",
            "amount": cam_dep, "start_date": lease_comm or start_date, "is_active": True,
        })

    util_dep_per_kw = get_num(deposits.get("utility_deposit_per_kw"))
    if util_dep_per_kw and elec_load:
        obligations.append({
            "org_id": org_id, "type": "utility_deposit", "frequency": "one_time",
            "amount": util_dep_per_kw * elec_load,
            "amount_formula": f"{util_dep_per_kw}/KW x {elec_load} KW",
            "start_date": lease_comm or start_date, "is_active": True,
        })

    # Add IDs and clean None values from each obligation
    for obl in obligations:
        obl["id"] = str(uuid.uuid4())
    return [{k: v for k, v in obl.items() if v is not None} for obl in obligations]


def build_alerts_data(extraction: dict, org_id: str) -> list:
    """Build alerts data list without inserting. For use with transactional RPC.
    outlet_id and agreement_id are injected by the RPC function."""
    alerts = []
    lease_term = get_section(extraction, "lease_term")
    rent = get_section(extraction, "rent")

    lease_expiry = get_date(lease_term.get("lease_expiry_date"))
    lease_comm = get_date(lease_term.get("lease_commencement_date"))
    rent_comm = get_date(lease_term.get("rent_commencement_date"))
    lock_in_months = get_num(lease_term.get("lock_in_months"))
    esc_pct = get_num(rent.get("escalation_percentage"))
    esc_freq = get_num(rent.get("escalation_frequency_years"))

    if lease_expiry:
        exp_date = date.fromisoformat(lease_expiry)
        for lead in [180, 90, 30, 7]:
            trigger = exp_date - timedelta(days=lead)
            if trigger >= date.today():
                alerts.append({
                    "org_id": org_id, "type": "lease_expiry",
                    "severity": "high" if lead <= 30 else "medium",
                    "title": f"Lease expiry in {lead} days",
                    "message": f"Lease expires on {lease_expiry}. {lead} days remaining.",
                    "trigger_date": trigger.isoformat(), "lead_days": lead,
                    "reference_date": lease_expiry, "status": "pending",
                })

    if lock_in_months and lease_comm:
        try:
            comm = date.fromisoformat(lease_comm)
            lock_end = comm + relativedelta(months=int(lock_in_months))
            for lead in [90, 30]:
                trigger = lock_end - timedelta(days=lead)
                if trigger >= date.today():
                    alerts.append({
                        "org_id": org_id, "type": "lock_in_expiry", "severity": "medium",
                        "title": f"Lock-in expires in {lead} days",
                        "message": f"Lock-in period ends on {lock_end.isoformat()}.",
                        "trigger_date": trigger.isoformat(), "lead_days": lead,
                        "reference_date": lock_end.isoformat(), "status": "pending",
                    })
        except (ValueError, TypeError):
            pass

    if esc_pct and esc_freq and (rent_comm or lease_comm):
        try:
            base = date.fromisoformat(rent_comm or lease_comm)
            esc_date = base + relativedelta(years=int(esc_freq))
            while esc_date < date.today():
                esc_date += relativedelta(years=int(esc_freq))
            for lead in [90, 30, 7]:
                trigger = esc_date - timedelta(days=lead)
                if trigger >= date.today():
                    alerts.append({
                        "org_id": org_id, "type": "escalation", "severity": "medium",
                        "title": f"Rent escalation in {lead} days",
                        "message": f"Rent escalation of {esc_pct}% due on {esc_date.isoformat()}.",
                        "trigger_date": trigger.isoformat(), "lead_days": lead,
                        "reference_date": esc_date.isoformat(), "status": "pending",
                    })
        except (ValueError, TypeError):
            pass

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
                        "org_id": org_id, "type": "rent_due", "severity": "medium",
                        "title": f"Rent due on {due.strftime('%d %b %Y')}",
                        "message": f"Monthly rent payment due on {due.isoformat()}.",
                        "trigger_date": trigger.isoformat(), "lead_days": 7,
                        "reference_date": due.isoformat(), "status": "pending",
                    })
        except (ValueError, TypeError):
            pass

    # Add IDs to each alert
    for alert in alerts:
        alert["id"] = str(uuid.uuid4())
    return alerts


def create_outlet_from_extraction(extraction: dict, org_id: str) -> str:
    """Create an outlet from extracted premises data. Returns outlet_id."""
    premises = get_section(extraction, "premises")
    parties = get_section(extraction, "parties")
    franchise = get_section(extraction, "franchise")

    prop_type = get_val(premises.get("property_type"))
    valid_types = {"mall", "high_street", "cloud_kitchen", "metro", "transit", "cyber_park", "hospital", "college", "educational_hub"}
    if prop_type and prop_type.lower() in valid_types:
        prop_type = prop_type.lower()
    else:
        prop_type = None

    fm = get_val(franchise.get("franchise_model"))
    valid_fm = {"FOFO", "FOCO", "COCO", "FICO", "direct_lease"}
    if fm and fm.upper() in valid_fm:
        fm = fm.upper()
    else:
        fm = None

    city = get_val(premises.get("city"))
    locality = get_val(premises.get("locality"))
    site_code = generate_site_code(city, locality, org_id)

    outlet_data = {
        "id": str(uuid.uuid4()),
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

    outlet_data = {k: v for k, v in outlet_data.items() if v is not None}
    try:
        result = supabase.table("outlets").insert(outlet_data).execute()
    except Exception as e:
        # If locality column doesn't exist (migration_008 not run), retry without it
        if "locality" in str(e):
            outlet_data.pop("locality", None)
            result = supabase.table("outlets").insert(outlet_data).execute()
        else:
            raise
    return result.data[0]["id"]


def create_agreement_record(extraction: dict, doc_type: str, risk_flags: list, confidence: dict,
                            filename: str, org_id: str, outlet_id: str, document_text: Optional[str] = None,
                            document_url: Optional[str] = None) -> str:
    """Create an agreement record. Returns agreement_id."""
    parties = get_section(extraction, "parties")
    lease_term = get_section(extraction, "lease_term")
    rent = get_section(extraction, "rent")
    charges = get_section(extraction, "charges")
    deposits = get_section(extraction, "deposits")
    legal = get_section(extraction, "legal")

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

    total = (monthly_rent or 0) + (cam_monthly or 0)

    rm = get_val(rent.get("rent_model"))
    valid_rm = {"fixed", "revenue_share", "hybrid_mglr", "percentage_only"}
    if rm and rm.lower() in valid_rm:
        rm = rm.lower()
    else:
        rm = None

    agreement_data = {
        "id": str(uuid.uuid4()),
        "org_id": org_id,
        "outlet_id": outlet_id,
        "type": doc_type,
        "status": "active",
        "document_filename": filename,
        "document_url": document_url,
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
    }

    commencement = get_date(lease_term.get("lease_commencement_date"))
    lock_in_months = get_num(lease_term.get("lock_in_months"))
    if commencement and lock_in_months:
        try:
            comm_date = date.fromisoformat(commencement)
            lock_in_end = comm_date + relativedelta(months=int(lock_in_months))
            agreement_data["lock_in_end_date"] = lock_in_end.isoformat()
        except (ValueError, TypeError):
            pass

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
            "org_id": org_id, "agreement_id": agreement_id, "outlet_id": outlet_id,
            "type": "rent", "frequency": "monthly", "amount": monthly_rent,
            "due_day_of_month": payment_day, "start_date": start_date, "end_date": end_date,
            "escalation_pct": esc_pct, "escalation_frequency_years": int(esc_freq) if esc_freq else None,
            "next_escalation_date": next_esc, "is_active": True,
        })

    # 2. CAM obligation (monthly)
    cam_monthly = get_num(charges.get("cam_monthly"))
    if cam_monthly:
        cam_esc = get_num(charges.get("cam_escalation_pct"))
        obligations.append({
            "org_id": org_id, "agreement_id": agreement_id, "outlet_id": outlet_id,
            "type": "cam", "frequency": "monthly", "amount": cam_monthly,
            "due_day_of_month": payment_day, "start_date": lease_comm or start_date, "end_date": end_date,
            "escalation_pct": cam_esc, "is_active": True,
        })

    # 3. HVAC obligation (monthly)
    hvac_rate = get_num(charges.get("hvac_rate_per_sqft"))
    if hvac_rate:
        area_basis = get_val(charges.get("hvac_area_basis")) or "covered_area"
        area = get_num(premises.get("covered_area_sqft")) or get_num(premises.get("super_area_sqft"))
        if area:
            hvac_monthly = hvac_rate * area
            obligations.append({
                "org_id": org_id, "agreement_id": agreement_id, "outlet_id": outlet_id,
                "type": "hvac", "frequency": "monthly", "amount": hvac_monthly,
                "amount_formula": f"{hvac_rate}/sqft x {area} sqft ({area_basis})",
                "due_day_of_month": payment_day, "start_date": lease_comm or start_date, "end_date": end_date,
                "is_active": True,
            })

    # 4. Electricity obligation (monthly - variable)
    elec_load = get_num(charges.get("electricity_load_kw"))
    if elec_load:
        obligations.append({
            "org_id": org_id, "agreement_id": agreement_id, "outlet_id": outlet_id,
            "type": "electricity", "frequency": "monthly", "amount": None,
            "amount_formula": f"Actual metered ({elec_load} KW load)",
            "due_day_of_month": payment_day, "start_date": lease_comm or start_date, "end_date": end_date,
            "is_active": True,
        })

    # 5. Security deposit (one-time)
    sec_dep = get_num(deposits.get("security_deposit_amount"))
    if sec_dep:
        obligations.append({
            "org_id": org_id, "agreement_id": agreement_id, "outlet_id": outlet_id,
            "type": "security_deposit", "frequency": "one_time", "amount": sec_dep,
            "start_date": lease_comm or start_date, "is_active": True,
        })

    # 6. CAM deposit (one-time)
    cam_dep = get_num(deposits.get("cam_deposit_amount"))
    if cam_dep:
        obligations.append({
            "org_id": org_id, "agreement_id": agreement_id, "outlet_id": outlet_id,
            "type": "cam_deposit", "frequency": "one_time", "amount": cam_dep,
            "start_date": lease_comm or start_date, "is_active": True,
        })

    # 7. Utility deposit (one-time)
    util_dep_per_kw = get_num(deposits.get("utility_deposit_per_kw"))
    if util_dep_per_kw and elec_load:
        obligations.append({
            "org_id": org_id, "agreement_id": agreement_id, "outlet_id": outlet_id,
            "type": "utility_deposit", "frequency": "one_time", "amount": util_dep_per_kw * elec_load,
            "amount_formula": f"{util_dep_per_kw}/KW x {elec_load} KW",
            "start_date": lease_comm or start_date, "is_active": True,
        })

    # Insert obligations, skipping None values
    created = []
    for obl in obligations:
        obl["id"] = str(uuid.uuid4())
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
                    "org_id": org_id, "outlet_id": outlet_id, "agreement_id": agreement_id,
                    "type": "lease_expiry", "severity": "high" if lead <= 30 else "medium",
                    "title": f"Lease expiry in {lead} days",
                    "message": f"Lease expires on {lease_expiry}. {lead} days remaining.",
                    "trigger_date": trigger.isoformat(), "lead_days": lead,
                    "reference_date": lease_expiry, "status": "pending",
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
                        "org_id": org_id, "outlet_id": outlet_id, "agreement_id": agreement_id,
                        "type": "lock_in_expiry", "severity": "medium",
                        "title": f"Lock-in expires in {lead} days",
                        "message": f"Lock-in period ends on {lock_end.isoformat()}.",
                        "trigger_date": trigger.isoformat(), "lead_days": lead,
                        "reference_date": lock_end.isoformat(), "status": "pending",
                    })
        except (ValueError, TypeError):
            pass

    # 3. Escalation alerts at 90, 30, 7 days before
    if esc_pct and esc_freq and (rent_comm or lease_comm):
        try:
            base = date.fromisoformat(rent_comm or lease_comm)
            esc_date = base + relativedelta(years=int(esc_freq))
            while esc_date < date.today():
                esc_date += relativedelta(years=int(esc_freq))
            for lead in [90, 30, 7]:
                trigger = esc_date - timedelta(days=lead)
                if trigger >= date.today():
                    alerts.append({
                        "org_id": org_id, "outlet_id": outlet_id, "agreement_id": agreement_id,
                        "type": "escalation", "severity": "medium",
                        "title": f"Rent escalation in {lead} days",
                        "message": f"Rent escalation of {esc_pct}% due on {esc_date.isoformat()}.",
                        "trigger_date": trigger.isoformat(), "lead_days": lead,
                        "reference_date": esc_date.isoformat(), "status": "pending",
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
                        "org_id": org_id, "outlet_id": outlet_id, "agreement_id": agreement_id,
                        "type": "rent_due", "severity": "medium",
                        "title": f"Rent due on {due.strftime('%d %b %Y')}",
                        "message": f"Monthly rent payment due on {due.isoformat()}.",
                        "trigger_date": trigger.isoformat(), "lead_days": 7,
                        "reference_date": due.isoformat(), "status": "pending",
                    })
        except (ValueError, TypeError):
            pass

    # Insert alerts and dispatch notifications
    created = []
    for alert in alerts:
        alert["id"] = str(uuid.uuid4())
        result = supabase.table("alerts").insert(alert).execute()
        inserted = result.data[0]
        created.append(inserted)
        try:
            dispatch_notification(org_id, inserted)
        except Exception:
            pass  # Notification failure should not break alert creation
    return created
