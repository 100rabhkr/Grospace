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
from typing import Optional
from datetime import datetime

from fastapi import FastAPI, HTTPException, UploadFile, File, Form, Depends
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
model = genai.GenerativeModel("gemini-1.5-pro")


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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=int(os.getenv("PORT", "8000")), reload=True)
