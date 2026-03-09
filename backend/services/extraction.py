"""
AI extraction logic: schemas, Gemini calls, document processing, risk detection.
"""

import os
import re
import json
import httpx
import fitz  # PyMuPDF
from io import BytesIO
from typing import Optional
from datetime import datetime, date, timedelta
from dateutil.relativedelta import relativedelta
from PIL import Image
from pdf2image import convert_from_bytes

import google.generativeai as genai

from core.config import (
    supabase, model,
    SUPPORTED_PDF_EXTENSIONS, SUPPORTED_IMAGE_EXTENSIONS,
    CITY_ABBREVIATIONS,
)
from services.ocr_service import extract_text_cloud_vision
from services.email_service import dispatch_notification


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


def _validate_and_clean_fields(result: dict, text: str) -> dict:
    """Validate and fix common extraction mistakes in-place."""
    if not result or not isinstance(result, dict):
        return result

    # --- Strip currency symbols from monetary fields ---
    monetary_fields = [
        "monthly_rent", "security_deposit", "cam_charges",
        "stamp_duty", "registration_charges", "total_monthly_outflow",
        "monthly_rent_per_sqft", "fit_out_cost", "maintenance_charges",
    ]
    for field in monetary_fields:
        if field in result and result[field] is not None:
            result[field] = _strip_currency(result[field])

    # --- Monthly rent: detect likely annual values ---
    rent = result.get("monthly_rent")
    if isinstance(rent, (int, float)) and rent > 1000000:
        text_lower = text.lower()
        if "per month" not in text_lower and "p.m." not in text_lower and "/month" not in text_lower:
            # Likely annual — divide by 12
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

    # --- Escalation percentage sanity check ---
    esc = result.get("escalation_percentage")
    if isinstance(esc, (int, float)) and esc > 100:
        result["escalation_percentage"] = None

    return result


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
        "2. For monetary amounts: Look for Rs., INR, ₹ symbols. Convert words like 'lakh' and 'crore' to numbers.\n"
        "3. For dates: Use YYYY-MM-DD format. If only month/year given, use first of month.\n"
        "4. For areas: Distinguish between super area, carpet area, and covered area carefully.\n"
        "5. For rent: Check if the stated rent is monthly or annual — always return MONTHLY values.\n"
        "6. For escalation: Look for phrases like 'escalation of X% every Y years' or 'annual increment'.\n"
        "7. If a field's value is calculated from a formula (e.g., '60 days from handover'), "
        "return the formula as a string rather than guessing a date.\n"
        "8. For each field, also return a confidence score: 'high', 'medium', 'low', or 'not_found'.\n"
        "9. Cross-verify extracted values — if rent is 2,85,000/month, total outflow should be >= that.\n"
        "10. Pay special attention to: party names (lessor vs lessee), lock-in periods, notice periods.\n\n"
        "Return valid JSON matching this schema:\n"
        f"{json.dumps(schema, indent=2)}\n\n"
        f"DOCUMENT TEXT:\n{text}"
    )

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

            response = model.generate_content(
                use_prompt,
                generation_config=genai.GenerationConfig(
                    response_mime_type="application/json",
                    temperature=0,
                ),
            )

            parsed = json.loads(response.text)
            if isinstance(parsed, list) and len(parsed) > 0:
                parsed = parsed[0]
            if isinstance(parsed, dict) and parsed:
                result = parsed
                break
        except (json.JSONDecodeError, Exception) as e:
            print(f"[EXTRACTION] Attempt {attempt + 1} failed: {type(e).__name__}: {e}")
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
            verify_resp = model.generate_content(
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
        "2. For monetary amounts: Look for Rs., INR, ₹. Convert 'lakh'/'crore' to numbers.\n"
        "3. For dates: Use YYYY-MM-DD format.\n"
        "4. For rent: Always return MONTHLY values.\n"
        "5. Distinguish lessor (owner) from lessee (tenant) carefully.\n"
        "6. For each field, return a confidence score: 'high', 'medium', 'low', or 'not_found'.\n"
        "7. If handwritten, do your best to read accurately.\n"
        "8. If a value is a formula (e.g., '60 days from handover'), return as string.\n\n"
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
            response = model.generate_content(
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
                response2 = model.generate_content(
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
                ocr_response = model.generate_content(
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
                cloud_vision_text = extract_text_cloud_vision(images)
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


def create_outlet_from_extraction(extraction: dict, org_id: str) -> str:
    """Create an outlet from extracted premises data. Returns outlet_id."""
    premises = get_section(extraction, "premises")
    parties = get_section(extraction, "parties")
    franchise = get_section(extraction, "franchise")

    prop_type = get_val(premises.get("property_type"))
    valid_types = {"mall", "high_street", "cloud_kitchen", "metro", "transit", "cyber_park", "hospital", "college"}
    if prop_type and prop_type.lower() in valid_types:
        prop_type = prop_type.lower()
    else:
        prop_type = None

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
        result = supabase.table("alerts").insert(alert).execute()
        inserted = result.data[0]
        created.append(inserted)
        try:
            dispatch_notification(org_id, inserted)
        except Exception:
            pass  # Notification failure should not break alert creation
    return created
