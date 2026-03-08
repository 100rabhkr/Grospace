"""
Tests for alert generation engine.
Verifies lease expiry alerts, lock-in alerts, escalation alerts,
rent-due alerts, severity levels, and configurable lead times.
"""

import pytest
from unittest.mock import MagicMock, patch
from datetime import date, timedelta
from dateutil.relativedelta import relativedelta
from tests.conftest import _make_query_builder


def _build_extraction(
    lease_comm="2024-01-01",
    rent_comm="2024-02-01",
    lease_expiry=None,
    lock_in_months=None,
    esc_pct=None,
    esc_freq=None,
    payment_day=5,
):
    """Build a minimal extraction dict for alert generation tests."""
    # Default expiry to 3 years from now so alerts fire
    if lease_expiry is None:
        lease_expiry = (date.today() + timedelta(days=365)).isoformat()

    return {
        "lease_term": {
            "lease_commencement_date": lease_comm,
            "rent_commencement_date": rent_comm,
            "lease_expiry_date": lease_expiry,
            "lock_in_months": lock_in_months,
        },
        "rent": {
            "escalation_percentage": esc_pct,
            "escalation_frequency_years": esc_freq,
            "mglr_payment_day": payment_day,
        },
    }


def _alert_inserts(inserted):
    """Filter captured inserts to only those that look like alert rows (have 'type' key)."""
    return [a for a in inserted if "type" in a and "trigger_date" in a]


class TestLeaseExpiryAlerts:
    """Lease expiry alerts at 180, 90, 30, 7 days before expiry."""

    def test_creates_expiry_alerts(self, patched_app, mock_supabase):
        """Should create alerts for each lead-time that is still in the future."""
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        # Expiry 200 days from now -> all 4 lead times should fire
        expiry = (date.today() + timedelta(days=200)).isoformat()
        extraction = _build_extraction(lease_expiry=expiry)
        patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")

        expiry_alerts = [a for a in _alert_inserts(inserted) if a.get("type") == "lease_expiry"]
        lead_days = sorted([a["lead_days"] for a in expiry_alerts])
        assert lead_days == [7, 30, 90, 180]

    def test_severity_high_for_30_and_7_days(self, patched_app, mock_supabase):
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        expiry = (date.today() + timedelta(days=200)).isoformat()
        extraction = _build_extraction(lease_expiry=expiry)
        patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")

        expiry_alerts = {a["lead_days"]: a["severity"] for a in _alert_inserts(inserted) if a["type"] == "lease_expiry"}
        assert expiry_alerts[7] == "high"
        assert expiry_alerts[30] == "high"
        assert expiry_alerts[90] == "medium"
        assert expiry_alerts[180] == "medium"

    def test_skips_past_trigger_dates(self, patched_app, mock_supabase):
        """If expiry is only 20 days away, 180- and 90-day alerts are skipped."""
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        expiry = (date.today() + timedelta(days=20)).isoformat()
        extraction = _build_extraction(lease_expiry=expiry)
        patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")

        expiry_alerts = [a for a in _alert_inserts(inserted) if a["type"] == "lease_expiry"]
        lead_days = [a["lead_days"] for a in expiry_alerts]
        assert 180 not in lead_days
        assert 90 not in lead_days
        assert 7 in lead_days

    def test_no_expiry_date_no_alerts(self, patched_app, mock_supabase):
        """No lease_expiry_date => no lease expiry alerts."""
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        extraction = {
            "lease_term": {"lease_commencement_date": "2024-01-01"},
            "rent": {},
        }
        patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")
        expiry_alerts = [a for a in _alert_inserts(inserted) if a.get("type") == "lease_expiry"]
        assert len(expiry_alerts) == 0


class TestLockInExpiryAlerts:
    """Lock-in expiry alerts at 90, 30 days before lock-in end."""

    def test_creates_lockin_alerts(self, patched_app, mock_supabase):
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        # Lock-in = 12 months from a recent commencement so end is in the future
        comm = (date.today() - timedelta(days=30)).isoformat()
        extraction = _build_extraction(lease_comm=comm, lock_in_months=12)
        patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")

        lockin = [a for a in _alert_inserts(inserted) if a["type"] == "lock_in_expiry"]
        assert len(lockin) >= 1
        for a in lockin:
            assert a["severity"] == "medium"

    def test_no_lockin_months_no_alerts(self, patched_app, mock_supabase):
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        extraction = _build_extraction(lock_in_months=None)
        patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")

        lockin = [a for a in _alert_inserts(inserted) if a.get("type") == "lock_in_expiry"]
        assert len(lockin) == 0


class TestEscalationAlerts:
    """Escalation alerts at 90, 30, 7 days before next escalation date."""

    def test_creates_escalation_alerts(self, patched_app, mock_supabase):
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        # Rent comm = 1 year ago minus 30 days, freq=1yr -> escalation soon
        rent_comm = (date.today() - relativedelta(years=1) + timedelta(days=120)).isoformat()
        extraction = _build_extraction(rent_comm=rent_comm, esc_pct=10, esc_freq=1)
        patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")

        esc = [a for a in _alert_inserts(inserted) if a["type"] == "escalation"]
        assert len(esc) >= 1
        for a in esc:
            assert a["severity"] == "medium"
            assert "10" in a["message"]  # Should mention the percentage

    def test_no_escalation_no_alerts(self, patched_app, mock_supabase):
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        extraction = _build_extraction(esc_pct=None, esc_freq=None)
        patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")

        esc = [a for a in _alert_inserts(inserted) if a.get("type") == "escalation"]
        assert len(esc) == 0


class TestRentDueAlerts:
    """Monthly rent due alerts — 7 days before each due date, for next 6 months."""

    def test_creates_rent_due_alerts(self, patched_app, mock_supabase):
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        extraction = _build_extraction(payment_day=10)
        patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")

        rent_due = [a for a in _alert_inserts(inserted) if a["type"] == "rent_due"]
        # Should create up to 6 monthly rent-due alerts
        assert len(rent_due) >= 1
        assert len(rent_due) <= 6
        for a in rent_due:
            assert a["lead_days"] == 7
            assert a["severity"] == "medium"


class TestAlertMetadata:
    """Verify all alerts carry correct metadata."""

    def test_alerts_have_required_fields(self, patched_app, mock_supabase):
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        expiry = (date.today() + timedelta(days=200)).isoformat()
        extraction = _build_extraction(lease_expiry=expiry, lock_in_months=24)
        patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")

        alerts = _alert_inserts(inserted)
        assert len(alerts) > 0
        for a in alerts:
            assert "org_id" in a
            assert "outlet_id" in a
            assert "agreement_id" in a
            assert "type" in a
            assert "severity" in a
            assert "title" in a
            assert "message" in a
            assert "trigger_date" in a
            assert "status" in a
            assert a["status"] == "pending"
            assert a["org_id"] == "org-1"

    def test_dispatch_notification_called(self, patched_app, mock_supabase):
        """After inserting each alert, dispatch_notification should be called."""
        inserted = []
        qb = _make_query_builder(data=[{"id": "alert-1", "type": "lease_expiry", "severity": "medium", "title": "test"}])
        qb.insert = lambda data: (inserted.append(data), qb)[1]
        mock_supabase.table.return_value = qb

        expiry = (date.today() + timedelta(days=200)).isoformat()
        extraction = _build_extraction(lease_expiry=expiry)

        import services.extraction as _extraction_svc
        with patch.object(_extraction_svc, "dispatch_notification") as mock_dispatch:
            patched_app.generate_alerts(extraction, "agr-1", "out-1", "org-1")
            # dispatch_notification should be called for each inserted alert
            assert mock_dispatch.call_count >= 1


class TestNotificationChannels:
    """Tests for get_notification_channels routing logic."""

    def test_default_returns_email_true(self, patched_app, mock_supabase):
        """When org has no prefs, default to email=True, whatsapp=False."""
        mock_supabase.table.return_value = _make_query_builder(
            data={"alert_preferences": None}
        )
        result = patched_app.get_notification_channels("org-1", "rent_due")
        assert result["email"] is True
        assert result["whatsapp"] is False

    def test_exception_returns_safe_defaults(self, patched_app, mock_supabase):
        """If DB call fails, should return safe defaults."""
        mock_supabase.table.side_effect = Exception("DB down")
        result = patched_app.get_notification_channels("org-1", "rent_due")
        assert result["email"] is True
        assert result["whatsapp"] is False
        mock_supabase.table.side_effect = None  # Reset
