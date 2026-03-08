"""
Tests for authentication and role-based access control.
Covers CurrentUser model, get_current_user dependency, get_org_filter,
and role-based behavior (platform_admin vs org_admin vs org_member).
"""

import pytest
from unittest.mock import MagicMock
from tests.conftest import _make_query_builder


class TestCurrentUserModel:
    """Tests for the CurrentUser Pydantic model."""

    def test_defaults(self, patched_app):
        user = patched_app.CurrentUser(user_id="u1", email="test@example.com")
        assert user.role == "org_member"
        assert user.org_id is None

    def test_all_fields(self, patched_app):
        user = patched_app.CurrentUser(
            user_id="u1", email="admin@co.com", role="platform_admin", org_id="org-1"
        )
        assert user.user_id == "u1"
        assert user.email == "admin@co.com"
        assert user.role == "platform_admin"
        assert user.org_id == "org-1"


class TestGetOrgFilter:
    """Tests for get_org_filter — determines data visibility by role."""

    def test_no_user_returns_none(self, patched_app):
        """Unauthenticated requests see all data (backward compat)."""
        assert patched_app.get_org_filter(None) is None

    def test_platform_admin_sees_all(self, patched_app):
        """Platform admins have no org filter (see everything)."""
        user = patched_app.CurrentUser(
            user_id="u1", email="admin@grospace.app", role="platform_admin", org_id="org-1"
        )
        assert patched_app.get_org_filter(user) is None

    def test_org_admin_sees_own_org(self, patched_app):
        """Org admins are restricted to their own org_id."""
        user = patched_app.CurrentUser(
            user_id="u2", email="mgr@company.com", role="org_admin", org_id="org-42"
        )
        assert patched_app.get_org_filter(user) == "org-42"

    def test_org_member_sees_own_org(self, patched_app):
        """Regular members are restricted to their own org_id."""
        user = patched_app.CurrentUser(
            user_id="u3", email="staff@company.com", role="org_member", org_id="org-42"
        )
        assert patched_app.get_org_filter(user) == "org-42"

    def test_org_user_without_org_id(self, patched_app):
        """User with no org_id returns None (shouldn't happen, but safe)."""
        user = patched_app.CurrentUser(
            user_id="u4", email="orphan@example.com", role="org_member", org_id=None
        )
        assert patched_app.get_org_filter(user) is None


class TestGetCurrentUser:
    """Tests for get_current_user dependency (JWT parsing)."""

    @pytest.mark.asyncio
    async def test_no_header_returns_none(self, patched_app):
        result = await patched_app.get_current_user(authorization=None)
        assert result is None

    @pytest.mark.asyncio
    async def test_malformed_header_returns_none(self, patched_app):
        result = await patched_app.get_current_user(authorization="Token abc")
        assert result is None

    @pytest.mark.asyncio
    async def test_empty_bearer_returns_none(self, patched_app, mock_supabase):
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        result = await patched_app.get_current_user(authorization="Bearer fake-token")
        assert result is None

    @pytest.mark.asyncio
    async def test_valid_token_returns_user(self, patched_app, mock_supabase):
        mock_user = MagicMock()
        mock_user.id = "user-123"
        mock_user.email = "test@example.com"
        mock_supabase.auth.get_user.return_value = MagicMock(user=mock_user)
        mock_supabase.table.return_value = _make_query_builder(
            data={"role": "org_admin", "org_id": "org-55"}
        )

        result = await patched_app.get_current_user(authorization="Bearer valid-jwt")
        assert result is not None
        assert result.user_id == "user-123"
        assert result.email == "test@example.com"
        assert result.role == "org_admin"
        assert result.org_id == "org-55"

    @pytest.mark.asyncio
    async def test_exception_returns_none(self, patched_app, mock_supabase):
        mock_supabase.auth.get_user.side_effect = Exception("Auth error")
        result = await patched_app.get_current_user(authorization="Bearer bad-token")
        assert result is None
        mock_supabase.auth.get_user.side_effect = None


class TestProfileEndpointAuth:
    """Integration: /api/profile requires authentication."""

    def test_profile_unauthenticated(self, client, patched_app, mock_supabase):
        """GET /api/profile without auth returns 401."""
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        resp = client.get("/api/profile")
        assert resp.status_code == 401

    def test_update_profile_unauthenticated(self, client, patched_app, mock_supabase):
        """PATCH /api/profile without auth returns 401."""
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        resp = client.patch("/api/profile", json={"full_name": "Test"})
        assert resp.status_code == 401


class TestRoleBasedPaymentFiltering:
    """Verify that the payments endpoint respects org filtering."""

    def test_payments_no_auth_sees_all(self, client, mock_supabase):
        """Without auth header, no org filter is applied."""
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        mock_supabase.table.return_value = _make_query_builder(data=[], count=0)
        resp = client.get("/api/payments")
        assert resp.status_code == 200

    def test_obligations_no_auth(self, client, mock_supabase):
        mock_supabase.auth.get_user.return_value = MagicMock(user=None)
        mock_supabase.table.return_value = _make_query_builder(data=[], count=0)
        resp = client.get("/api/obligations")
        assert resp.status_code == 200
