"""
Extraction Benchmark: Claude vs Gemini 3.1 Pro + Document AI vs Gemini 3.1 Pro Only
Run: python3 benchmark.py <path_to_pdf>
"""

import os
import sys
import json
import time
from datetime import datetime
from dotenv import load_dotenv

load_dotenv()

# ============================================
# CONFIG
# ============================================

GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")
ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY", "")  # Set this for Claude benchmark
DOCUMENT_AI_PROCESSOR = os.getenv("DOCUMENT_AI_PROCESSOR", "")

SCHEMA = {
    "parties": ["lessor_name", "lessee_name", "brand_name", "lessor_address", "lessee_address", "lessee_cin", "leasing_consultant"],
    "premises": ["property_name", "full_address", "city", "state", "pincode", "property_type", "floor", "unit_number", "super_area_sqft", "carpet_area_sqft", "covered_area_sqft", "locality", "loading_factor", "parking_slots", "parking_details", "signage_rights", "signage_approval_required"],
    "lease_term": ["loi_date", "lease_term_years", "lease_term_structure", "renewal_terms", "lock_in_months", "notice_period_months", "fit_out_period_days", "fit_out_rent_free", "lease_commencement_date", "rent_commencement_date", "lease_expiry_date"],
    "rent": ["rent_model", "rent_schedule", "escalation_percentage", "escalation_frequency_years", "escalation_basis", "mglr_payment_day", "revenue_reconciliation_day"],
    "charges": ["cam_rate_per_sqft", "cam_area_basis", "cam_monthly", "cam_escalation_pct", "hvac_rate_per_sqft", "electricity_load_kw", "electricity_metering", "operating_hours", "gst_percentage", "marketing_charges_monthly", "marketing_charges_per_sqft"],
    "deposits": ["security_deposit_amount", "security_deposit_months", "security_deposit_basis", "security_deposit_refund_days", "cam_deposit_amount", "utility_deposit_per_kw"],
    "legal": ["usage_restriction", "brand_change_allowed", "structural_alterations_allowed", "subletting_allowed", "jurisdiction_city", "arbitration", "late_payment_interest_pct", "tds_obligations", "relocation_clause", "force_majeure_clause", "force_majeure_details", "exclusivity_clause", "exclusivity_details", "co_tenancy_clause", "subleasing_allowed", "subleasing_conditions", "trading_hours", "title_clear", "assignment_rights"],
    "franchise": ["franchise_model", "profit_split", "operator_entity", "investor_entity"],
}

TOTAL_FIELDS = sum(len(v) for v in SCHEMA.values())

# ============================================
# TEXT EXTRACTION
# ============================================

def extract_text_pymupdf(pdf_bytes):
    import fitz
    doc = fitz.open(stream=pdf_bytes, filetype="pdf")
    text = ""
    for i, page in enumerate(doc):
        text += f"\n--- PAGE {i+1} ---\n"
        text += page.get_text()
    return text, len(doc)


def extract_text_document_ai(pdf_bytes):
    """Use Document AI for superior text extraction."""
    if not DOCUMENT_AI_PROCESSOR:
        return None

    try:
        from google.cloud import documentai_v1 as documentai
        from google.oauth2.service_account import Credentials

        creds_json = os.getenv("GOOGLE_CLOUD_CREDENTIALS_JSON")
        if creds_json:
            info = json.loads(creds_json)
            creds = Credentials.from_service_account_info(info)
            client = documentai.DocumentProcessorServiceClient(credentials=creds)
        else:
            client = documentai.DocumentProcessorServiceClient()

        raw_document = documentai.RawDocument(content=pdf_bytes, mime_type="application/pdf")
        request = documentai.ProcessRequest(name=DOCUMENT_AI_PROCESSOR, raw_document=raw_document)

        result = client.process_document(request=request)
        document = result.document

        doc_text = ""
        for page_idx, page in enumerate(document.pages):
            doc_text += f"\n--- PAGE {page_idx + 1} ---\n"
            for block in page.blocks:
                block_text = document.text[block.layout.text_anchor.text_segments[0].start_index:block.layout.text_anchor.text_segments[-1].end_index] if block.layout.text_anchor.text_segments else ""
                doc_text += block_text + "\n"
            # Tables
            for table in page.tables:
                doc_text += "\n[TABLE]\n"
                for row in table.header_rows:
                    cells = []
                    for cell in row.cells:
                        start = cell.layout.text_anchor.text_segments[0].start_index if cell.layout.text_anchor.text_segments else 0
                        end = cell.layout.text_anchor.text_segments[-1].end_index if cell.layout.text_anchor.text_segments else 0
                        cells.append(document.text[start:end].strip())
                    doc_text += " | ".join(cells) + "\n"
                for row in table.body_rows:
                    cells = []
                    for cell in row.cells:
                        start = cell.layout.text_anchor.text_segments[0].start_index if cell.layout.text_anchor.text_segments else 0
                        end = cell.layout.text_anchor.text_segments[-1].end_index if cell.layout.text_anchor.text_segments else 0
                        cells.append(document.text[start:end].strip())
                    doc_text += " | ".join(cells) + "\n"
                doc_text += "[/TABLE]\n"

        return doc_text
    except Exception as e:
        print(f"  Document AI failed: {e}")
        return None


# ============================================
# EXTRACTION PROMPT (shared)
# ============================================

EXTRACTION_PROMPT = """You are an expert lease document extraction specialist for Indian commercial real estate.
Extract ALL fields from this lease document. Return valid JSON matching the schema below.

RULES:
1. Extract EVERY field — mark as "not_found" only if truly absent
2. For monetary amounts: convert lakhs/crores to numbers (1 lakh = 100000)
3. For dates: use YYYY-MM-DD format
4. For rent: always return MONTHLY values
5. For each field return: {"value": <val>, "confidence": "high|medium|low", "source_page": <int>}
6. CAM/maintenance charges are in EVERY Indian lease — search carefully
7. Search the ENTIRE document including annexures and schedules

SCHEMA:
{schema}

DOCUMENT TEXT:
{text}"""


# ============================================
# GEMINI EXTRACTION
# ============================================

def extract_gemini(text, model_name="gemini-3.1-pro-preview"):
    import google.generativeai as genai
    genai.configure(api_key=GEMINI_API_KEY)
    model = genai.GenerativeModel(model_name)

    prompt = EXTRACTION_PROMPT.format(
        schema=json.dumps(SCHEMA, indent=2),
        text=text[:100000]
    )

    start = time.time()
    response = model.generate_content(
        prompt,
        generation_config=genai.GenerationConfig(
            response_mime_type="application/json",
            temperature=0,
            max_output_tokens=16384,
        ),
    )
    duration = time.time() - start

    try:
        result = json.loads(response.text)
        if isinstance(result, list):
            result = result[0]
        return result, duration
    except Exception as e:
        print(f"  Gemini parse error: {e}")
        return {}, duration


# ============================================
# CLAUDE EXTRACTION
# ============================================

def extract_claude(text):
    if not ANTHROPIC_API_KEY:
        print("  ANTHROPIC_API_KEY not set — skipping Claude benchmark")
        return None, 0

    try:
        import anthropic
    except ImportError:
        print("  anthropic package not installed — run: pip install anthropic")
        return None, 0

    client = anthropic.Anthropic(api_key=ANTHROPIC_API_KEY)

    prompt = EXTRACTION_PROMPT.format(
        schema=json.dumps(SCHEMA, indent=2),
        text=text[:100000]
    )

    start = time.time()
    response = client.messages.create(
        model="claude-sonnet-4-20250514",
        max_tokens=16384,
        messages=[{"role": "user", "content": prompt}],
    )
    duration = time.time() - start

    try:
        # Extract JSON from response
        content = response.content[0].text
        # Find JSON in response
        json_start = content.find("{")
        json_end = content.rfind("}") + 1
        if json_start >= 0 and json_end > json_start:
            result = json.loads(content[json_start:json_end])
            return result, duration
    except Exception as e:
        print(f"  Claude parse error: {e}")
    return {}, duration


# ============================================
# SCORING
# ============================================

def score_extraction(result):
    """Score an extraction result against the schema."""
    filled = 0
    high_conf = 0
    with_source_page = 0
    total = TOTAL_FIELDS
    section_scores = {}

    for section, fields in SCHEMA.items():
        section_data = result.get(section, {})
        if not isinstance(section_data, dict):
            section_scores[section] = {"filled": 0, "total": len(fields), "pct": 0}
            continue

        s_filled = 0
        for field in fields:
            val = section_data.get(field)
            if val is None:
                continue
            # Unwrap {value, confidence} objects
            if isinstance(val, dict) and "value" in val:
                actual_val = val["value"]
                conf = val.get("confidence", "")
                has_page = bool(val.get("source_page"))
            else:
                actual_val = val
                conf = ""
                has_page = False

            if actual_val and str(actual_val) not in ("", "not_found", "N/A", "None", "null"):
                filled += 1
                s_filled += 1
                if conf == "high":
                    high_conf += 1
                if has_page:
                    with_source_page += 1

        section_scores[section] = {
            "filled": s_filled,
            "total": len(fields),
            "pct": round(s_filled / len(fields) * 100) if fields else 0,
        }

    return {
        "total_fields": total,
        "filled": filled,
        "fill_rate": round(filled / total * 100, 1),
        "high_confidence": high_conf,
        "with_source_page": with_source_page,
        "sections": section_scores,
    }


# ============================================
# MAIN
# ============================================

def main():
    if len(sys.argv) < 2:
        print("Usage: python3 benchmark.py <path_to_pdf>")
        print("Set ANTHROPIC_API_KEY env var to include Claude in benchmark")
        sys.exit(1)

    pdf_path = sys.argv[1]
    print(f"\n{'='*60}")
    print("EXTRACTION BENCHMARK")
    print(f"{'='*60}")
    print(f"File: {os.path.basename(pdf_path)}")
    print(f"Size: {os.path.getsize(pdf_path) / 1024:.0f} KB")

    with open(pdf_path, "rb") as f:
        pdf_bytes = f.read()

    # Extract text
    print("\n--- Text Extraction ---")
    pymupdf_text, num_pages = extract_text_pymupdf(pdf_bytes)
    print(f"PyMuPDF: {len(pymupdf_text)} chars, {num_pages} pages")

    docai_text = extract_text_document_ai(pdf_bytes)
    if docai_text:
        print(f"Document AI: {len(docai_text)} chars")
    else:
        print("Document AI: not configured")

    results = {}

    # Benchmark 1: Gemini 3.1 Pro only (with PyMuPDF text)
    print("\n--- Benchmark 1: Gemini 3.1 Pro Only ---")
    gemini_result, gemini_time = extract_gemini(pymupdf_text)
    gemini_score = score_extraction(gemini_result)
    gemini_score["time"] = round(gemini_time, 1)
    results["Gemini 3.1 Pro Only"] = gemini_score
    print(f"  Time: {gemini_time:.1f}s")
    print(f"  Fields: {gemini_score['filled']}/{gemini_score['total_fields']} ({gemini_score['fill_rate']}%)")
    print(f"  High confidence: {gemini_score['high_confidence']}")
    print(f"  Source pages: {gemini_score['with_source_page']}")

    # Benchmark 2: Gemini 3.1 Pro + Document AI
    if docai_text:
        print("\n--- Benchmark 2: Gemini 3.1 Pro + Document AI ---")
        gemini_docai_result, gemini_docai_time = extract_gemini(docai_text)
        gemini_docai_score = score_extraction(gemini_docai_result)
        gemini_docai_score["time"] = round(gemini_docai_time, 1)
        results["Gemini 3.1 Pro + Document AI"] = gemini_docai_score
        print(f"  Time: {gemini_docai_time:.1f}s")
        print(f"  Fields: {gemini_docai_score['filled']}/{gemini_docai_score['total_fields']} ({gemini_docai_score['fill_rate']}%)")
        print(f"  High confidence: {gemini_docai_score['high_confidence']}")
        print(f"  Source pages: {gemini_docai_score['with_source_page']}")
    else:
        print("\n--- Benchmark 2: Skipped (Document AI not configured) ---")

    # Benchmark 3: Claude
    print("\n--- Benchmark 3: Claude Sonnet ---")
    claude_result, claude_time = extract_claude(pymupdf_text)
    if claude_result is not None:
        claude_score = score_extraction(claude_result)
        claude_score["time"] = round(claude_time, 1)
        results["Claude Sonnet"] = claude_score
        print(f"  Time: {claude_time:.1f}s")
        print(f"  Fields: {claude_score['filled']}/{claude_score['total_fields']} ({claude_score['fill_rate']}%)")
        print(f"  High confidence: {claude_score['high_confidence']}")
        print(f"  Source pages: {claude_score['with_source_page']}")
    else:
        print("  Skipped — no API key")

    # Generate Report
    print(f"\n{'='*60}")
    print("BENCHMARK REPORT")
    print(f"{'='*60}")
    print(f"Document: {os.path.basename(pdf_path)} ({num_pages} pages)")
    print(f"Date: {datetime.now().strftime('%Y-%m-%d %H:%M')}")
    print(f"Total schema fields: {TOTAL_FIELDS}")
    print()

    # Summary table
    print(f"{'Method':<35} {'Fields':<12} {'Fill %':<10} {'High Conf':<12} {'Source Pg':<12} {'Time':<10}")
    print(f"{'-'*90}")
    for name, score in results.items():
        print(f"{name:<35} {score['filled']:<12} {score['fill_rate']:<10} {score['high_confidence']:<12} {score['with_source_page']:<12} {score['time']}s")

    # Section breakdown
    print("\n--- Section Breakdown (fill %) ---")
    sections = list(SCHEMA.keys())
    header = f"{'Section':<15}" + "".join(f"{name[:20]:<22}" for name in results.keys())
    print(header)
    print("-" * len(header))
    for section in sections:
        row = f"{section:<15}"
        for name, score in results.items():
            s = score["sections"].get(section, {})
            pct = s.get("pct", 0)
            filled = s.get("filled", 0)
            total = s.get("total", 0)
            row += f"{filled}/{total} ({pct}%){'':>10}"
        print(row)

    # Winner
    print("\n--- Winner ---")
    best = max(results.items(), key=lambda x: (x[1]["filled"], x[1]["high_confidence"]))
    print(f"  {best[0]}: {best[1]['filled']} fields, {best[1]['high_confidence']} high confidence")

    # Save JSON report
    report = {
        "document": os.path.basename(pdf_path),
        "pages": num_pages,
        "date": datetime.now().isoformat(),
        "total_fields": TOTAL_FIELDS,
        "results": results,
    }
    report_path = pdf_path.rsplit(".", 1)[0] + "_benchmark.json"
    with open(report_path, "w") as f:
        json.dump(report, f, indent=2)
    print(f"\nFull report saved: {report_path}")


if __name__ == "__main__":
    main()
