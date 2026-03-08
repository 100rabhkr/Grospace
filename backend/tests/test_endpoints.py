"""
Tests for API endpoints: health check, CORS, rate limiting, and basic CRUD.
Uses FastAPI TestClient for synchronous HTTP testing.
"""

from unittest.mock import MagicMock
from tests.conftest import _make_query_builder


class TestHealthCheck:
    """GET /api/health — basic liveness probe."""

    def test_returns_200(self, client):
        resp = client.get("/api/health")
        assert resp.status_code == 200

    def test_returns_healthy_status(self, client):
        data = client.get("/api/health").json()
        assert data["status"] == "healthy"

    def test_returns_service_name(self, client):
        data = client.get("/api/health").json()
        assert data["service"] == "grospace-ai"

    def test_returns_timestamp(self, client):
        data = client.get("/api/health").json()
        assert "timestamp" in data
        # Timestamp should be an ISO string
        assert "T" in data["timestamp"]


class TestCORSHeaders:
    """Verify CORS middleware is configured correctly."""

    def test_cors_allows_localhost(self, client):
        resp = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        # FastAPI CORS middleware should respond with allow headers
        assert resp.status_code == 200
        assert "access-control-allow-origin" in resp.headers

    def test_cors_allows_methods(self, client):
        resp = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "POST",
            },
        )
        allow_methods = resp.headers.get("access-control-allow-methods", "")
        # Should allow all methods (configured with ["*"])
        assert "POST" in allow_methods or "*" in allow_methods

    def test_cors_credentials_allowed(self, client):
        resp = client.options(
            "/api/health",
            headers={
                "Origin": "http://localhost:3000",
                "Access-Control-Request-Method": "GET",
            },
        )
        assert resp.headers.get("access-control-allow-credentials") == "true"


class TestListEndpoints:
    """Basic list endpoints should return paginated results."""

    def test_list_organizations(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_query_builder(data=[], count=0)
        resp = client.get("/api/organizations")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data
        assert "total" in data
        assert "page" in data
        assert data["page"] == 1

    def test_list_agreements(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_query_builder(data=[], count=0)
        resp = client.get("/api/agreements")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data

    def test_list_outlets(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_query_builder(data=[], count=0)
        resp = client.get("/api/outlets")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data

    def test_list_alerts(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_query_builder(data=[], count=0)
        resp = client.get("/api/alerts")
        assert resp.status_code == 200
        data = resp.json()
        assert "items" in data

    def test_pagination_params(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_query_builder(data=[], count=0)
        resp = client.get("/api/organizations?page=2&page_size=10")
        assert resp.status_code == 200
        data = resp.json()
        assert data["page"] == 2
        assert data["page_size"] == 10


class TestGetSingleResource:
    """GET endpoints for individual resources."""

    def test_get_organization_not_found(self, client, mock_supabase):
        """Non-existent org should 404."""
        mock_supabase.table.return_value = _make_query_builder(data=None)
        resp = client.get("/api/organizations/nonexistent-id")
        # The endpoint calls .single() which returns None data -> 404
        assert resp.status_code == 404

    def test_get_agreement_not_found(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_query_builder(data=None)
        resp = client.get("/api/agreements/nonexistent-id")
        assert resp.status_code == 404

    def test_get_outlet_not_found(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_query_builder(data=None)
        resp = client.get("/api/outlets/nonexistent-id")
        assert resp.status_code == 404


class TestPaymentEndpoints:
    """Payment update validation."""

    def test_invalid_payment_status(self, client, mock_supabase):
        """Updating payment with invalid status should 400."""
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        resp = client.patch(
            "/api/payments/pay-1",
            json={"status": "invalid_status"},
        )
        assert resp.status_code == 400

    def test_valid_payment_status(self, client, mock_supabase):
        """Updating with valid status should succeed."""
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        mock_supabase.table.return_value = _make_query_builder(
            data=[{"id": "pay-1", "status": "paid"}]
        )
        resp = client.patch(
            "/api/payments/pay-1",
            json={"status": "paid"},
        )
        assert resp.status_code == 200


class TestOutletUpdate:
    """PATCH /api/outlets/{id} validation."""

    def test_invalid_outlet_status(self, client, mock_supabase):
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        mock_supabase.table.return_value = _make_query_builder(
            data={"status": "operational", "monthly_net_revenue": None, "org_id": "org-1"}
        )
        resp = client.patch(
            "/api/outlets/out-1",
            json={"status": "bogus_status"},
        )
        assert resp.status_code == 400

    def test_no_fields_to_update(self, client, mock_supabase):
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        mock_supabase.table.return_value = _make_query_builder(
            data={"status": "operational", "monthly_net_revenue": None, "org_id": "org-1"}
        )
        resp = client.patch("/api/outlets/out-1", json={})
        assert resp.status_code == 400


class TestAlertActions:
    """Alert acknowledge/snooze/assign endpoints."""

    def test_acknowledge_alert(self, client, mock_supabase):
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        mock_supabase.table.return_value = _make_query_builder(
            data=[{"id": "alert-1", "status": "acknowledged"}]
        )
        resp = client.patch("/api/alerts/alert-1/acknowledge")
        assert resp.status_code == 200

    def test_snooze_alert(self, client, mock_supabase):
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        mock_supabase.table.return_value = _make_query_builder(
            data=[{"id": "alert-1", "status": "snoozed", "trigger_date": "2025-04-01"}]
        )
        resp = client.patch(
            "/api/alerts/alert-1/snooze",
            json={"days": 14},
        )
        assert resp.status_code == 200


class TestDashboard:
    """GET /api/dashboard — aggregate statistics."""

    def test_dashboard_returns_stats(self, client, mock_supabase):
        mock_supabase.table.return_value = _make_query_builder(data=[], count=0)
        resp = client.get("/api/dashboard")
        assert resp.status_code == 200
        data = resp.json()
        assert "total_outlets" in data
        assert "total_agreements" in data
        assert "pending_alerts" in data
        assert "outlets_by_city" in data
