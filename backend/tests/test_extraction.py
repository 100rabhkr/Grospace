"""
Tests for the extraction pipeline: classification, structured extraction,
confidence scoring, risk flag detection, and helper utilities.
"""

import json
import pytest


# ---------------------------------------------------------------
# Helper function tests (no async, no external calls)
# ---------------------------------------------------------------

class TestGetVal:
    """Tests for get_val — unwraps Gemini {value, confidence} objects."""

    def test_plain_string(self, patched_app):
        assert patched_app.get_val("hello") == "hello"

    def test_plain_number(self, patched_app):
        assert patched_app.get_val(42) == 42

    def test_none(self, patched_app):
        assert patched_app.get_val(None) is None

    def test_value_confidence_wrapper(self, patched_app):
        assert patched_app.get_val({"value": "Delhi", "confidence": "high"}) == "Delhi"

    def test_not_found_string(self, patched_app):
        assert patched_app.get_val("not_found") is None

    def test_empty_string(self, patched_app):
        assert patched_app.get_val("") is None

    def test_na_string(self, patched_app):
        assert patched_app.get_val("N/A") is None

    def test_value_wrapper_with_not_found(self, patched_app):
        assert patched_app.get_val({"value": "not_found"}) is None


class TestGetNum:
    """Tests for get_num — numeric extraction."""

    def test_integer(self, patched_app):
        assert patched_app.get_num(100) == 100.0

    def test_string_number(self, patched_app):
        assert patched_app.get_num("42.5") == 42.5

    def test_none(self, patched_app):
        assert patched_app.get_num(None) is None

    def test_non_numeric_string(self, patched_app):
        assert patched_app.get_num("hello") is None

    def test_wrapped_number(self, patched_app):
        assert patched_app.get_num({"value": 99.9, "confidence": "high"}) == 99.9


class TestGetDate:
    """Tests for get_date — date parsing from various formats."""

    def test_iso_format(self, patched_app):
        assert patched_app.get_date("2025-01-15") == "2025-01-15"

    def test_dd_mm_yyyy_dash(self, patched_app):
        assert patched_app.get_date("15-01-2025") == "2025-01-15"

    def test_dd_mm_yyyy_slash(self, patched_app):
        assert patched_app.get_date("15/01/2025") == "2025-01-15"

    def test_dd_mon_yyyy(self, patched_app):
        assert patched_app.get_date("15 Jan 2025") == "2025-01-15"

    def test_none(self, patched_app):
        assert patched_app.get_date(None) is None

    def test_unparseable(self, patched_app):
        assert patched_app.get_date("not a date") is None


class TestGetSection:
    """Tests for get_section — extracts nested sections."""

    def test_normal_section(self, patched_app):
        data = {"parties": {"lessor_name": "ABC"}}
        result = patched_app.get_section(data, "parties")
        assert result == {"lessor_name": "ABC"}

    def test_missing_section(self, patched_app):
        result = patched_app.get_section({}, "parties")
        assert result == {}

    def test_wrapped_section(self, patched_app):
        data = {"parties": {"value": {"lessor_name": "XYZ"}, "confidence": "high"}}
        result = patched_app.get_section(data, "parties")
        assert result == {"lessor_name": "XYZ"}


class TestCalculateConfidence:
    """Tests for calculate_confidence — field-level confidence scoring."""

    def test_all_filled(self, patched_app):
        extraction = {
            "parties": {"lessor_name": "ABC", "lessee_name": "XYZ"},
        }
        conf = patched_app.calculate_confidence(extraction)
        assert conf["lessor_name"] == "high"
        assert conf["lessee_name"] == "high"

    def test_missing_field(self, patched_app):
        extraction = {
            "parties": {"lessor_name": None, "lessee_name": "XYZ"},
        }
        conf = patched_app.calculate_confidence(extraction)
        assert conf["lessor_name"] == "not_found"
        assert conf["lessee_name"] == "high"

    def test_explicit_confidence(self, patched_app):
        extraction = {
            "parties": {"lessor_name": "ABC", "lessor_name_confidence": "medium"},
        }
        conf = patched_app.calculate_confidence(extraction)
        assert conf["lessor_name"] == "medium"

    def test_empty_extraction(self, patched_app):
        assert patched_app.calculate_confidence({}) == {}

    def test_non_dict_extraction(self, patched_app):
        assert patched_app.calculate_confidence("invalid") == {}


class TestGetFileType:
    """Tests for get_file_type — extension-based file type detection."""

    def test_pdf(self, patched_app):
        assert patched_app.get_file_type("lease.pdf") == "pdf"

    def test_jpg(self, patched_app):
        assert patched_app.get_file_type("scan.jpg") == "image"

    def test_png(self, patched_app):
        assert patched_app.get_file_type("doc.PNG") == "image"

    def test_unknown(self, patched_app):
        assert patched_app.get_file_type("doc.docx") == "unknown"

    def test_empty(self, patched_app):
        assert patched_app.get_file_type("") == "unknown"


class TestCleanOcrText:
    """Tests for clean_ocr_text — post-processing OCR artifacts."""

    def test_collapses_blank_lines(self, patched_app):
        raw = "Line 1\n\n\n\n\nLine 2"
        result = patched_app.clean_ocr_text(raw)
        assert "\n\n\n" not in result
        assert "Line 1" in result
        assert "Line 2" in result

    def test_removes_page_numbers(self, patched_app):
        raw = "Some content\nPage 3 of 10\nMore content"
        result = patched_app.clean_ocr_text(raw)
        assert "Page 3 of 10" not in result

    def test_empty_input(self, patched_app):
        assert patched_app.clean_ocr_text("") == ""
        assert patched_app.clean_ocr_text("   ") == "   "

    def test_none_input(self, patched_app):
        assert patched_app.clean_ocr_text(None) is None


# ---------------------------------------------------------------
# Schema validation tests
# ---------------------------------------------------------------

class TestExtractionSchemas:
    """Verify the extraction schemas have the expected structure."""

    def test_lease_schema_has_required_sections(self, patched_app):
        schema = patched_app.LEASE_EXTRACTION_SCHEMA
        for section in ("parties", "premises", "lease_term", "rent", "charges", "deposits", "legal", "franchise"):
            assert section in schema, f"Missing section: {section}"

    def test_license_schema_has_dates(self, patched_app):
        schema = patched_app.LICENSE_EXTRACTION_SCHEMA
        assert "valid_from" in schema
        assert "valid_to" in schema
        assert "date_of_issue" in schema

    def test_bill_schema_has_amount(self, patched_app):
        schema = patched_app.BILL_EXTRACTION_SCHEMA
        assert "total_amount" in schema
        assert "due_date" in schema

    def test_supplementary_schema_has_changes(self, patched_app):
        schema = patched_app.SUPPLEMENTARY_AGREEMENT_SCHEMA
        assert "changes" in schema
        assert isinstance(schema["changes"], dict)


# ---------------------------------------------------------------
# Async extraction tests (mock Gemini)
# ---------------------------------------------------------------

class TestClassifyDocument:
    """Tests for classify_document — LLM-based classification."""

    @pytest.mark.asyncio
    async def test_valid_classification(self, patched_app, mock_gemini_model):
        mock_gemini_model.generate_content.return_value.text = "lease_loi"
        result = await patched_app.classify_document("This is a lease agreement for...")
        assert result == "lease_loi"

    @pytest.mark.asyncio
    async def test_unknown_label_defaults_to_lease(self, patched_app, mock_gemini_model):
        mock_gemini_model.generate_content.return_value.text = "some_garbage"
        result = await patched_app.classify_document("Random text")
        assert result == "lease_loi"

    @pytest.mark.asyncio
    async def test_bill_classification(self, patched_app, mock_gemini_model):
        mock_gemini_model.generate_content.return_value.text = "bill"
        result = await patched_app.classify_document("Electricity bill for March 2025")
        assert result == "bill"

    @pytest.mark.asyncio
    async def test_license_classification(self, patched_app, mock_gemini_model):
        mock_gemini_model.generate_content.return_value.text = "  license_certificate  "
        result = await patched_app.classify_document("FSSAI Certificate")
        assert result == "license_certificate"


class TestExtractStructuredData:
    """Tests for extract_structured_data — LLM-based extraction with JSON mode."""

    @pytest.mark.asyncio
    async def test_returns_dict(self, patched_app, mock_gemini_model):
        mock_gemini_model.generate_content.return_value.text = json.dumps({
            "parties": {"lessor_name": "Test Corp"}
        })
        result = await patched_app.extract_structured_data("doc text", "lease_loi")
        assert isinstance(result, dict)
        assert result["parties"]["lessor_name"] == "Test Corp"

    @pytest.mark.asyncio
    async def test_unwraps_list_response(self, patched_app, mock_gemini_model):
        mock_gemini_model.generate_content.return_value.text = json.dumps([
            {"parties": {"lessor_name": "Wrapped"}}
        ])
        result = await patched_app.extract_structured_data("doc text", "lease_loi")
        assert result["parties"]["lessor_name"] == "Wrapped"

    @pytest.mark.asyncio
    async def test_non_dict_result_returns_empty(self, patched_app, mock_gemini_model):
        mock_gemini_model.generate_content.return_value.text = '"just a string"'
        result = await patched_app.extract_structured_data("doc text", "lease_loi")
        assert result == {}

    @pytest.mark.asyncio
    async def test_uses_correct_schema_for_bill(self, patched_app, mock_gemini_model):
        mock_gemini_model.generate_content.return_value.text = json.dumps({
            "bill_type": "electricity",
            "total_amount": 5000,
        })
        result = await patched_app.extract_structured_data("bill text", "bill")
        assert result["bill_type"] == "electricity"
