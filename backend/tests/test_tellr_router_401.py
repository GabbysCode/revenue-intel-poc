"""Router-layer integration tests for /api/tellr/* — covers the 503 messages
that prevent us from sending obviously misconfigured requests upstream
(which would surface as opaque 401s) plus /api/tellr/health which is the
first thing to check when chasing a deployed-app 401.

Uses FastAPI's TestClient against a tiny app that mounts ONLY the tellr
router so we don't have to spin up DuckDB / persona middleware / etc.
"""
from __future__ import annotations

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from revintel_backend.routers import tellr as tellr_router
from revintel_backend.routers.tellr import _ensure_configured
from revintel_backend.services.tellr_mcp import TellrAuthContext


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(tellr_router.router, prefix="/api/tellr")
    return TestClient(app)


# ---------------------------------------------------------------------------
# /api/tellr/health — the diagnostic endpoint
# ---------------------------------------------------------------------------

class TestHealthEndpoint:
    def test_no_config_reports_pattern_B_and_not_configured(self, client):
        resp = client.get("/api/tellr/health")
        assert resp.status_code == 200
        body = resp.json()
        assert body["pattern"] == "B"
        assert body["configured"] is False
        assert body["base_url_set"] is False
        assert body["forwarded_email_present"] is False
        assert body["sp_cache_present"] is False
        assert body["bearer_token_present"] is False

    def test_pattern_A_detected_when_x_forwarded_email_header_sent(self, client, monkeypatch):
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        resp = client.get("/api/tellr/health", headers={"x-forwarded-email": "user@example.com"})
        body = resp.json()
        assert body["pattern"] == "A"
        assert body["configured"] is True
        assert body["forwarded_email_present"] is True

    def test_pattern_C_detected_when_SP_env_set(self, client, monkeypatch):
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        monkeypatch.setenv("TELLR_SP_CLIENT_ID", "cid")
        monkeypatch.setenv("TELLR_SP_CLIENT_SECRET", "secret")
        resp = client.get("/api/tellr/health")
        body = resp.json()
        assert body["pattern"] == "C"
        assert body["configured"] is True
        assert body["sp_cache_present"] is True

    def test_pattern_B_detected_when_only_DATABRICKS_OAUTH_TOKEN_set(self, client, monkeypatch):
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        monkeypatch.setenv("DATABRICKS_OAUTH_TOKEN", "static_user_oauth_token")
        resp = client.get("/api/tellr/health")
        body = resp.json()
        assert body["pattern"] == "B"
        assert body["configured"] is True
        assert body["bearer_token_present"] is True


# ---------------------------------------------------------------------------
# _ensure_configured — the function that turns config-bug 401s into 503s
# ---------------------------------------------------------------------------

class TestEnsureConfigured:
    def test_missing_base_url_raises_503(self):
        ctx = TellrAuthContext(pattern="B", base_url="", bearer_token="x")
        with pytest.raises(Exception) as exc:
            _ensure_configured(ctx)
        assert exc.value.status_code == 503
        assert "TELLR_BASE_URL" in exc.value.detail

    def test_pattern_A_without_forwarded_email_raises_503(self):
        ctx = TellrAuthContext(
            pattern="A",
            base_url="https://tellr.app.databricksapps.com",
            forwarded_email=None,
        )
        with pytest.raises(Exception) as exc:
            _ensure_configured(ctx)
        assert exc.value.status_code == 503
        assert "x-forwarded-email" in exc.value.detail

    def test_pattern_C_without_sp_cache_raises_503_with_actionable_message(self):
        ctx = TellrAuthContext(
            pattern="C",
            base_url="https://tellr.app.databricksapps.com",
            sp_cache=None,
        )
        with pytest.raises(Exception) as exc:
            _ensure_configured(ctx)
        assert exc.value.status_code == 503
        # Message must mention BOTH env vars so a deployer knows what to set
        assert "TELLR_SP_CLIENT_ID" in exc.value.detail
        assert "TELLR_SP_CLIENT_SECRET" in exc.value.detail

    def test_pattern_B_without_token_raises_503_warning_about_PATs(self):
        """The classic local-dev 401 footgun — using a PAT (dapi…) instead
        of an OAuth U2M token. The 503 message must call this out."""
        ctx = TellrAuthContext(
            pattern="B",
            base_url="https://tellr.app.databricksapps.com",
            bearer_token=None,
        )
        with pytest.raises(Exception) as exc:
            _ensure_configured(ctx)
        assert exc.value.status_code == 503
        assert "PATs" in exc.value.detail
        assert "DATABRICKS_OAUTH_TOKEN" in exc.value.detail
        assert "Pattern A" in exc.value.detail or "Pattern C" in exc.value.detail

    def test_well_formed_pattern_A_passes(self):
        ctx = TellrAuthContext(
            pattern="A",
            base_url="https://tellr.app.databricksapps.com",
            forwarded_email="user@example.com",
        )
        # Should not raise
        _ensure_configured(ctx)

    def test_well_formed_pattern_B_passes(self):
        ctx = TellrAuthContext(
            pattern="B",
            base_url="https://tellr.app.databricksapps.com",
            bearer_token="oauth_token",
        )
        _ensure_configured(ctx)


# ---------------------------------------------------------------------------
# Endpoint-level: misconfigured calls produce 503, NOT a passthrough 401
# ---------------------------------------------------------------------------

class TestEndpointGuards:
    def test_create_deck_with_no_config_returns_503_not_401(self, client):
        """If the user never set TELLR_BASE_URL, the deploy bug surfaces as
        a clear 503 'not configured' instead of a baffling 401 from Tellr."""
        resp = client.post(
            "/api/tellr/create-executive-deck",
            json={"summary": "hi"},
        )
        assert resp.status_code == 503
        assert "TELLR_BASE_URL" in resp.json()["detail"]

    def test_deck_status_with_no_config_returns_503(self, client):
        resp = client.get("/api/tellr/deck-status?session_id=s&request_id=r")
        assert resp.status_code == 503

    def test_deck_pdf_with_no_config_returns_503(self, client):
        resp = client.get("/api/tellr/deck-pdf?session_id=s&request_id=r")
        assert resp.status_code == 503

    def test_pattern_B_with_no_token_returns_503_with_PAT_warning(self, client, monkeypatch):
        """Reproduces the most common 401 scenario: TELLR_BASE_URL set but
        DATABRICKS_OAUTH_TOKEN missing or only TELLR_OAUTH_TOKEN=<PAT>."""
        monkeypatch.setenv("TELLR_BASE_URL", "https://tellr.app.databricksapps.com")
        # No DATABRICKS_OAUTH_TOKEN, no SP creds
        resp = client.post("/api/tellr/create-executive-deck", json={"summary": "hi"})
        assert resp.status_code == 503
        assert "PATs" in resp.json()["detail"]
