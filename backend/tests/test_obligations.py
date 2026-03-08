"""
Tests for obligation generation logic.
Verifies that generate_obligations produces the correct obligation types,
amounts, frequencies, dates, and escalation info from extraction data.
"""

import pytest
from unittest.mock import MagicMock, call
from datetime import date
from tests.conftest import _make_query_builder


class TestGenerateObligationsRent:
    """Rent obligation generation."""

    def test_creates_rent_obligation(self, patched_app, mock_supabase, sample_lease_extraction):
        """Monthly rent obligation is created from rent_schedule."""
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-1", "type": "rent"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        result = patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        # Should have created multiple obligations (rent, cam, hvac, electricity, deposits)
        assert len(result) > 0
        rent = [d for d in inserted_data if d.get("type") == "rent"]
        assert len(rent) == 1

    def test_rent_amount_from_schedule(self, patched_app, mock_supabase, sample_lease_extraction):
        """Rent amount should come from the first year of rent_schedule."""
        inserted_data = []
        original_insert = _make_query_builder(data=[{"id": "obl-x"}])

        def capture_insert(data):
            inserted_data.append(data)
            return original_insert

        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = capture_insert
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        rent_obligs = [d for d in inserted_data if d.get("type") == "rent"]
        assert len(rent_obligs) == 1
        assert rent_obligs[0]["amount"] == 150000
        assert rent_obligs[0]["frequency"] == "monthly"
        assert rent_obligs[0]["due_day_of_month"] == 5

    def test_rent_escalation_info(self, patched_app, mock_supabase, sample_lease_extraction):
        """Rent obligation should carry escalation percentage and frequency."""
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        rent = [d for d in inserted_data if d.get("type") == "rent"][0]
        assert rent["escalation_pct"] == 10
        assert rent["escalation_frequency_years"] == 1

    def test_rent_dates(self, patched_app, mock_supabase, sample_lease_extraction):
        """Rent obligation start_date = rent_commencement_date, end_date = lease_expiry_date."""
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        rent = [d for d in inserted_data if d.get("type") == "rent"][0]
        assert rent["start_date"] == "2025-02-01"
        assert rent["end_date"] == "2030-01-01"


class TestGenerateObligationsCAM:
    """CAM obligation generation."""

    def test_creates_cam_obligation(self, patched_app, mock_supabase, sample_lease_extraction):
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        cam = [d for d in inserted_data if d.get("type") == "cam"]
        assert len(cam) == 1
        assert cam[0]["amount"] == 25000
        assert cam[0]["frequency"] == "monthly"

    def test_cam_escalation(self, patched_app, mock_supabase, sample_lease_extraction):
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        cam = [d for d in inserted_data if d.get("type") == "cam"][0]
        assert cam["escalation_pct"] == 5


class TestGenerateObligationsHVAC:
    """HVAC obligation = rate_per_sqft * area."""

    def test_hvac_calculated_amount(self, patched_app, mock_supabase, sample_lease_extraction):
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        hvac = [d for d in inserted_data if d.get("type") == "hvac"]
        assert len(hvac) == 1
        # 15 per sqft * 1200 covered_area
        assert hvac[0]["amount"] == 15 * 1200


class TestGenerateObligationsDeposits:
    """One-time deposit obligations."""

    def test_security_deposit(self, patched_app, mock_supabase, sample_lease_extraction):
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        sec_dep = [d for d in inserted_data if d.get("type") == "security_deposit"]
        assert len(sec_dep) == 1
        assert sec_dep[0]["amount"] == 900000
        assert sec_dep[0]["frequency"] == "one_time"

    def test_cam_deposit(self, patched_app, mock_supabase, sample_lease_extraction):
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        cam_dep = [d for d in inserted_data if d.get("type") == "cam_deposit"]
        assert len(cam_dep) == 1
        assert cam_dep[0]["amount"] == 50000

    def test_utility_deposit(self, patched_app, mock_supabase, sample_lease_extraction):
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        util_dep = [d for d in inserted_data if d.get("type") == "utility_deposit"]
        assert len(util_dep) == 1
        # 2000 per KW * 50 KW
        assert util_dep[0]["amount"] == 2000 * 50


class TestGenerateObligationsEdgeCases:
    """Edge cases and missing data."""

    def test_no_rent_schedule_no_rent_obligation(self, patched_app, mock_supabase):
        """When rent_schedule is missing, no rent obligation should be created."""
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        extraction = {
            "lease_term": {"lease_commencement_date": "2025-01-01"},
            "rent": {},
            "charges": {},
            "deposits": {},
            "premises": {},
        }
        patched_app.generate_obligations(extraction, "agr-1", "out-1", "org-1")
        rent = [d for d in inserted_data if d.get("type") == "rent"]
        assert len(rent) == 0

    def test_empty_extraction(self, patched_app, mock_supabase):
        """Empty extraction should produce zero obligations."""
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        result = patched_app.generate_obligations({}, "agr-1", "out-1", "org-1")
        assert result == []

    def test_default_payment_day(self, patched_app, mock_supabase):
        """When mglr_payment_day is missing, default to day 7."""
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        extraction = {
            "lease_term": {"rent_commencement_date": "2025-01-01", "lease_expiry_date": "2030-01-01"},
            "rent": {
                "rent_schedule": [{"monthly_rent": 100000}],
                # no mglr_payment_day
            },
            "charges": {},
            "deposits": {},
            "premises": {},
        }
        patched_app.generate_obligations(extraction, "agr-1", "out-1", "org-1")
        rent = [d for d in inserted_data if d.get("type") == "rent"]
        assert len(rent) == 1
        assert rent[0]["due_day_of_month"] == 7

    def test_all_obligations_have_org_and_ids(self, patched_app, mock_supabase, sample_lease_extraction):
        """Every obligation should carry org_id, agreement_id, outlet_id."""
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-99", "out-99", "org-99"
        )

        for obl in inserted_data:
            assert obl["org_id"] == "org-99"
            assert obl["agreement_id"] == "agr-99"
            assert obl["outlet_id"] == "out-99"

    def test_electricity_obligation_has_no_amount(self, patched_app, mock_supabase, sample_lease_extraction):
        """Electricity obligation amount is None (variable), but has formula."""
        inserted_data = []
        qb = _make_query_builder(data=[{"id": "obl-x"}])
        qb.insert = lambda data: (inserted_data.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        patched_app.generate_obligations(
            sample_lease_extraction, "agr-1", "out-1", "org-1"
        )

        elec = [d for d in inserted_data if d.get("type") == "electricity"]
        assert len(elec) == 1
        # amount should not be in cleaned dict (it's None and gets stripped)
        assert "amount" not in elec[0] or elec[0].get("amount") is None
        assert "amount_formula" in elec[0]
        assert "50" in elec[0]["amount_formula"]
