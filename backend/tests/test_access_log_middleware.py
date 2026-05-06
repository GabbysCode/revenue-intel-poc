"""Access log middleware — focused on auth signal visibility WITHOUT leakage.

Whenever production 401s show up on /api/kpis/* or /api/data/*, the first
question is "what did the backend actually receive?" These tests guard:

  - Every request emits request_in (DEBUG) and request_out (INFO/WARNING)
  - 4xx/5xx responses surface at WARNING (so they pop in log filters)
  - Bearer tokens are NEVER logged in full — only an 8-char prefix
  - Cookies are NEVER logged in full — only the cookie names
  - Emails are reduced to their domain
  - X-RevIntel-Persona is logged for cross-referencing with persona scope
"""
from __future__ import annotations

import logging

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from revintel_backend.middleware.access_log import (
    AccessLogMiddleware,
    _cookie_names,
    _email_domain,
    _token_prefix,
)


@pytest.fixture
def client_and_logs(caplog) -> tuple[TestClient, pytest.LogCaptureFixture]:
    """Tiny app with just the access-log middleware so no other layer
    pollutes the captured log records."""
    app = FastAPI()
    app.add_middleware(AccessLogMiddleware)

    @app.get("/api/ok")
    async def ok() -> dict[str, str]:
        return {"ok": "yes"}

    @app.get("/api/boom")
    async def boom():
        from fastapi import HTTPException

        raise HTTPException(status_code=401, detail="nope")

    caplog.set_level(logging.DEBUG, logger="revintel.access")
    return TestClient(app), caplog


# ---------------------------------------------------------------------------
# Pure helpers — quick to verify, easy to regression-guard
# ---------------------------------------------------------------------------

class TestRedactionHelpers:
    def test_token_prefix_returns_first_8_chars_with_ellipsis(self):
        assert _token_prefix("eyJabcdefghijklmnop") == "eyJabcde..."

    def test_token_prefix_short_value_is_fully_masked(self):
        assert _token_prefix("short") == "***"

    def test_token_prefix_none(self):
        assert _token_prefix(None) == "(none)"

    def test_email_domain_only(self):
        assert _email_domain("alice@example.com") == "@example.com"

    def test_email_domain_invalid(self):
        assert _email_domain("not-an-email") == "(invalid)"

    def test_email_domain_none(self):
        assert _email_domain(None) == "(none)"

    def test_cookie_names_extracts_just_keys(self):
        names = _cookie_names("_databricks_session=secret_value; theme=dark; ")
        assert names == ["_databricks_session", "theme"]
        # Values must NOT appear
        joined = ",".join(names)
        assert "secret_value" not in joined
        assert "dark" not in joined


# ---------------------------------------------------------------------------
# End-to-end through the middleware
# ---------------------------------------------------------------------------

class TestAccessLogEmission:
    def test_successful_call_emits_request_in_DEBUG_and_request_out_INFO(self, client_and_logs):
        client, caplog = client_and_logs
        r = client.get("/api/ok")
        assert r.status_code == 200

        records = [r for r in caplog.records if r.name == "revintel.access"]
        msgs = [r.getMessage() for r in records]
        assert any(m.startswith("request_in") and "/api/ok" in m for m in msgs)
        assert any(m.startswith("request_out") and "status=200" in m for m in msgs)

        # request_out for 200 must be INFO (not WARNING)
        out_record = next(r for r in records if r.getMessage().startswith("request_out"))
        assert out_record.levelno == logging.INFO

    def test_401_surfaces_at_WARNING_so_it_pops_in_log_filters(self, client_and_logs):
        client, caplog = client_and_logs
        r = client.get("/api/boom")
        assert r.status_code == 401

        out_records = [
            r for r in caplog.records
            if r.name == "revintel.access" and r.getMessage().startswith("request_out")
        ]
        assert len(out_records) == 1
        assert out_records[0].levelno == logging.WARNING
        assert "status=401" in out_records[0].getMessage()

    def test_bearer_token_never_appears_in_full_in_logs(self, client_and_logs):
        client, caplog = client_and_logs
        client.get(
            "/api/ok",
            headers={"authorization": "Bearer eyJabcdefghijklmnop_VERY_SECRET"},
        )
        log_text = "\n".join(r.getMessage() for r in caplog.records if r.name == "revintel.access")
        assert "VERY_SECRET" not in log_text, "REGRESSION: middleware leaked the bearer token"
        # 8-char prefix is acceptable for correlation
        assert "eyJabcde" in log_text

    def test_cookie_values_never_appear_in_full_in_logs(self, client_and_logs):
        client, caplog = client_and_logs
        client.get(
            "/api/ok",
            headers={"cookie": "_databricks_session=THE_SECRET_VALUE; theme=dark"},
        )
        log_text = "\n".join(r.getMessage() for r in caplog.records if r.name == "revintel.access")
        assert "THE_SECRET_VALUE" not in log_text, "REGRESSION: middleware leaked a cookie value"
        # Cookie names ARE logged for visibility
        assert "_databricks_session" in log_text

    def test_full_email_never_appears_in_full_in_logs(self, client_and_logs):
        client, caplog = client_and_logs
        client.get("/api/ok", headers={"x-forwarded-email": "alice.smith@kpmg.com"})
        log_text = "\n".join(r.getMessage() for r in caplog.records if r.name == "revintel.access")
        assert "alice.smith@kpmg.com" not in log_text
        # Domain alone IS logged — proves the proxy is injecting identity
        assert "@kpmg.com" in log_text

    def test_persona_header_is_logged_for_cross_reference(self, client_and_logs):
        client, caplog = client_and_logs
        client.get("/api/ok", headers={"x-revintel-persona": "regional-emea"})
        log_text = "\n".join(r.getMessage() for r in caplog.records if r.name == "revintel.access")
        assert "persona=regional-emea" in log_text

    def test_skip_paths_emit_no_logs(self, client_and_logs):
        client, caplog = client_and_logs
        # Hitting a skipped path with a non-existent route would 404, but
        # the middleware short-circuits before logging — so caplog stays empty.
        client.get("/openapi.json")  # FastAPI handles this; middleware skipped it
        revintel_records = [r for r in caplog.records if r.name == "revintel.access"]
        assert revintel_records == [], "openapi.json should not produce access log noise"


# ---------------------------------------------------------------------------
# whoami endpoint — debug surface for diagnosing 401s in production
# ---------------------------------------------------------------------------

class TestWhoamiEndpoint:
    """Ensures /api/auth/whoami echoes auth signals correctly and never leaks tokens."""

    def test_whoami_returns_no_auth_signals_when_caller_sends_none(self):
        from revintel_backend.main import app
        client = TestClient(app)
        body = client.get("/api/auth/whoami").json()
        assert body["auth_header"]["present"] is False
        assert body["auth_header"]["scheme"] is None
        assert body["x_forwarded_email"] is None
        assert body["x_forwarded_access_token_present"] is False

    def test_whoami_echoes_signals_but_only_token_prefix(self):
        from revintel_backend.main import app
        client = TestClient(app)
        body = client.get(
            "/api/auth/whoami",
            headers={
                "authorization": "Bearer eyJabcdefghijklmnop_DO_NOT_LEAK",
                "x-forwarded-email": "user@example.com",
                "x-forwarded-user": "user",
                "x-revintel-persona": "executive",
            },
        ).json()
        assert body["auth_header"]["present"] is True
        assert body["auth_header"]["scheme"] == "Bearer"
        assert body["auth_header"]["token_prefix"].startswith("eyJabcde")
        assert "DO_NOT_LEAK" not in str(body), "whoami leaked the bearer token!"
        assert body["x_forwarded_email"] == "user@example.com"
        assert body["x_revintel_persona"] == "executive"
