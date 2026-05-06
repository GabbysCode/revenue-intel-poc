"""Pattern detection precedence: A (forwarded-email present) → C (SP env set) → B (fallback).

These are the gateway tests for diagnosing 401s — if the wrong pattern is
detected at request time, the wrong auth headers (or none) get sent and
Tellr rejects the call. Run these first when chasing a 401.
"""
from __future__ import annotations

from typing import Optional

import pytest
from starlette.datastructures import Headers

from revintel_backend.services import tellr_mcp


class _FakeRequest:
    """Minimal stand-in for fastapi.Request — we only need .headers."""

    def __init__(self, headers: Optional[dict[str, str]] = None):
        self.headers = Headers(headers or {})


# ---------------------------------------------------------------------------
# detect_pattern()
# ---------------------------------------------------------------------------

class TestDetectPattern:
    def test_no_request_no_env_falls_back_to_pattern_B(self):
        assert tellr_mcp.detect_pattern(None) == "B"

    def test_x_forwarded_email_present_returns_pattern_A(self):
        req = _FakeRequest({"x-forwarded-email": "user@example.com"})
        assert tellr_mcp.detect_pattern(req) == "A"

    def test_x_forwarded_email_present_wins_even_if_SP_creds_set(self, monkeypatch):
        """A wins over C when both signals are present (matches docstring precedence)."""
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        monkeypatch.setenv("TELLR_SP_CLIENT_ID", "cid")
        monkeypatch.setenv("TELLR_SP_CLIENT_SECRET", "secret")
        req = _FakeRequest({"x-forwarded-email": "user@example.com"})
        assert tellr_mcp.detect_pattern(req) == "A"

    def test_SP_creds_present_returns_pattern_C(self, monkeypatch):
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        monkeypatch.setenv("TELLR_SP_CLIENT_ID", "cid")
        monkeypatch.setenv("TELLR_SP_CLIENT_SECRET", "secret")
        assert tellr_mcp.detect_pattern(None) == "C"

    def test_partial_SP_creds_falls_back_to_pattern_B(self, monkeypatch):
        """Half-set Pattern C config silently downgrades to B — common 401 cause."""
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        monkeypatch.setenv("TELLR_SP_CLIENT_ID", "cid")
        # TELLR_SP_CLIENT_SECRET deliberately not set
        assert tellr_mcp.detect_pattern(None) == "B"

    def test_SP_creds_set_but_no_workspace_host_falls_back_to_B(self, monkeypatch):
        """Without TELLR_BASE_URL or TELLR_WORKSPACE_HOST we can't resolve OIDC issuer."""
        monkeypatch.setenv("TELLR_SP_CLIENT_ID", "cid")
        monkeypatch.setenv("TELLR_SP_CLIENT_SECRET", "secret")
        # Neither TELLR_BASE_URL nor TELLR_WORKSPACE_HOST set
        assert tellr_mcp.detect_pattern(None) == "B"

    def test_TELLR_WORKSPACE_HOST_override_unblocks_pattern_C(self, monkeypatch):
        """When TELLR_BASE_URL is unset, TELLR_WORKSPACE_HOST is enough for Pattern C."""
        monkeypatch.setenv("TELLR_WORKSPACE_HOST", "https://workspace.cloud.databricks.com")
        monkeypatch.setenv("TELLR_SP_CLIENT_ID", "cid")
        monkeypatch.setenv("TELLR_SP_CLIENT_SECRET", "secret")
        assert tellr_mcp.detect_pattern(None) == "C"

    @pytest.mark.parametrize("blank", ["", "   ", "\t\n"])
    def test_blank_x_forwarded_email_does_not_trigger_pattern_A(self, blank):
        req = _FakeRequest({"x-forwarded-email": blank})
        assert tellr_mcp.detect_pattern(req) == "B"

    @pytest.mark.parametrize("blank_pair", [("", "secret"), ("cid", ""), ("   ", "secret"), ("cid", "  ")])
    def test_blank_SP_creds_do_not_trigger_pattern_C(self, monkeypatch, blank_pair):
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        monkeypatch.setenv("TELLR_SP_CLIENT_ID", blank_pair[0])
        monkeypatch.setenv("TELLR_SP_CLIENT_SECRET", blank_pair[1])
        assert tellr_mcp.detect_pattern(None) == "B"


# ---------------------------------------------------------------------------
# resolve_auth_context()
# ---------------------------------------------------------------------------

class TestResolveAuthContext:
    def test_pattern_A_carries_forwarded_email(self, monkeypatch):
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com/")  # trailing slash
        req = _FakeRequest({"x-forwarded-email": "user@example.com"})
        ctx = tellr_mcp.resolve_auth_context(req)
        assert ctx.pattern == "A"
        assert ctx.forwarded_email == "user@example.com"
        assert ctx.bearer_token is None
        assert ctx.sp_cache is None
        # Trailing slash on TELLR_BASE_URL is normalised away
        assert ctx.base_url == "https://tellr.app.databricksapps.com"

    def test_pattern_C_carries_sp_cache(self, monkeypatch):
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        monkeypatch.setenv("TELLR_SP_CLIENT_ID", "cid")
        monkeypatch.setenv("TELLR_SP_CLIENT_SECRET", "secret")
        ctx = tellr_mcp.resolve_auth_context(None)
        assert ctx.pattern == "C"
        assert ctx.sp_cache is not None
        assert ctx.bearer_token is None
        assert ctx.forwarded_email is None

    def test_pattern_B_uses_DATABRICKS_OAUTH_TOKEN(self, monkeypatch):
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        monkeypatch.setenv("DATABRICKS_OAUTH_TOKEN", "oauth_user_token_123")
        ctx = tellr_mcp.resolve_auth_context(None)
        assert ctx.pattern == "B"
        assert ctx.bearer_token == "oauth_user_token_123"
        assert ctx.sp_cache is None

    def test_pattern_B_DATABRICKS_OAUTH_TOKEN_takes_precedence_over_TELLR_OAUTH_TOKEN(self, monkeypatch):
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        monkeypatch.setenv("DATABRICKS_OAUTH_TOKEN", "preferred")
        monkeypatch.setenv("TELLR_OAUTH_TOKEN", "legacy")
        ctx = tellr_mcp.resolve_auth_context(None)
        assert ctx.bearer_token == "preferred"

    def test_pattern_B_no_token_yields_none(self, monkeypatch):
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        ctx = tellr_mcp.resolve_auth_context(None)
        assert ctx.pattern == "B"
        assert ctx.bearer_token is None  # router will reject this with 503
