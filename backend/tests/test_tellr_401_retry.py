"""_post_with_auth_retry — the one-shot 401 retry that absorbs SP token races.

The contract:
  - Pattern A 401 → returned as-is (no token to refresh; the proxy is the
    source of truth for identity).
  - Pattern B 401 → returned as-is (token is static, came from env, we
    can't refresh it without operator intervention).
  - Pattern C 401 → invalidate SP cache → mint fresh token → retry once.
    If THAT also 401s, return the second response (do not loop forever).

These tests are the most useful 401 diagnostic we have. If you see
401s in production on Pattern C and the retry isn't kicking in, this
suite is what proves whether the bug is in the retry logic or upstream.
"""
from __future__ import annotations

from typing import Optional

import httpx
import pytest

from revintel_backend.services.tellr_mcp import (
    TellrAuthContext,
    _post_with_auth_retry,
)


pytestmark = pytest.mark.asyncio

MCP_URL = "https://tellr.app.databricksapps.com/mcp/"


class _RecordingSPCache:
    """Stand-in for TellrSPTokenCache that records invalidate() calls and
    rotates the token each mint so we can assert the retry used a fresh value."""

    def __init__(self):
        self._counter = 0
        self.invalidate_calls = 0

    async def token(self) -> str:
        self._counter += 1
        return f"sp_token_v{self._counter}"

    def invalidate(self) -> None:
        self.invalidate_calls += 1


def _mock_client(responses: list[httpx.Response]) -> httpx.AsyncClient:
    """Build an AsyncClient backed by an in-memory MockTransport that yields
    `responses` in order. Per-call captures land in `client._captured_requests`."""
    captured: list[httpx.Request] = []
    iterator = iter(responses)

    def _handler(request: httpx.Request) -> httpx.Response:
        captured.append(request)
        try:
            return next(iterator)
        except StopIteration:  # pragma: no cover (tests should size responses correctly)
            raise AssertionError("MockTransport was called more times than there are scripted responses")

    transport = httpx.MockTransport(_handler)
    client = httpx.AsyncClient(transport=transport)
    client._captured_requests = captured  # type: ignore[attr-defined]
    return client


# ---------------------------------------------------------------------------
# Pattern A
# ---------------------------------------------------------------------------

class TestPatternANoRetry:
    async def test_pattern_A_401_is_returned_as_is(self):
        """Pattern A has no token to refresh — return the 401 immediately."""
        ctx = TellrAuthContext(
            pattern="A",
            base_url="https://tellr.app.databricksapps.com",
            forwarded_email="user@example.com",
        )
        async with _mock_client([httpx.Response(401, json={"error": "forbidden"})]) as client:
            resp = await _post_with_auth_retry(client, MCP_URL, {}, {}, ctx)
        assert resp.status_code == 401
        assert len(client._captured_requests) == 1, "must NOT retry on Pattern A"

    async def test_pattern_A_200_returned_unchanged(self):
        ctx = TellrAuthContext(
            pattern="A",
            base_url="https://tellr.app.databricksapps.com",
            forwarded_email="user@example.com",
        )
        async with _mock_client([httpx.Response(200, json={"ok": True})]) as client:
            resp = await _post_with_auth_retry(client, MCP_URL, {}, {}, ctx)
        assert resp.status_code == 200


# ---------------------------------------------------------------------------
# Pattern B
# ---------------------------------------------------------------------------

class TestPatternBNoRetry:
    async def test_pattern_B_401_is_returned_as_is(self):
        """Pattern B token is static (env var). If it's expired, the operator
        has to mint a new one — we can't recover without their help."""
        ctx = TellrAuthContext(
            pattern="B",
            base_url="https://tellr.app.databricksapps.com",
            bearer_token="static_user_token",
        )
        async with _mock_client([httpx.Response(401, json={"error": "expired"})]) as client:
            resp = await _post_with_auth_retry(client, MCP_URL, {}, {}, ctx)
        assert resp.status_code == 401
        assert len(client._captured_requests) == 1, "must NOT retry on Pattern B"


# ---------------------------------------------------------------------------
# Pattern C — the only pattern that retries
# ---------------------------------------------------------------------------

class TestPatternCRetry:
    async def test_pattern_C_401_invalidates_cache_and_retries_once_with_fresh_token(self):
        cache = _RecordingSPCache()
        ctx = TellrAuthContext(
            pattern="C",
            base_url="https://tellr.app.databricksapps.com",
            sp_cache=cache,
        )
        responses = [
            httpx.Response(401, json={"error": "expired_token"}),
            httpx.Response(200, json={"ok": True}),
        ]
        base_headers = {
            "Content-Type": "application/json",
            "Authorization": "Bearer sp_token_v0",  # the "stale" token the caller computed
            "mcp-session-id": "session-abc",         # non-auth header that must survive the retry
        }
        async with _mock_client(responses) as client:
            resp = await _post_with_auth_retry(client, MCP_URL, {"jsonrpc": "2.0"}, base_headers, ctx)

        assert resp.status_code == 200
        assert cache.invalidate_calls == 1, "401 must trigger cache invalidate"
        assert len(client._captured_requests) == 2, "retry must fire exactly once"

        # The retry must (a) use a fresh Bearer minted from the cache, and
        # (b) preserve the mcp-session-id header set by the caller.
        retry_req = client._captured_requests[1]
        assert retry_req.headers["authorization"] == "Bearer sp_token_v1"
        assert retry_req.headers["mcp-session-id"] == "session-abc"

    async def test_pattern_C_200_on_first_call_does_not_invalidate_cache(self):
        cache = _RecordingSPCache()
        ctx = TellrAuthContext(
            pattern="C",
            base_url="https://tellr.app.databricksapps.com",
            sp_cache=cache,
        )
        async with _mock_client([httpx.Response(200, json={"ok": True})]) as client:
            resp = await _post_with_auth_retry(client, MCP_URL, {}, {}, ctx)
        assert resp.status_code == 200
        assert cache.invalidate_calls == 0
        assert len(client._captured_requests) == 1

    async def test_pattern_C_second_401_returned_as_is_not_looping(self):
        """If the retry also fails, give up — don't infinite-loop on bad creds."""
        cache = _RecordingSPCache()
        ctx = TellrAuthContext(
            pattern="C",
            base_url="https://tellr.app.databricksapps.com",
            sp_cache=cache,
        )
        responses = [
            httpx.Response(401, json={"error": "expired"}),
            httpx.Response(401, json={"error": "still_expired"}),
        ]
        async with _mock_client(responses) as client:
            resp = await _post_with_auth_retry(client, MCP_URL, {}, {}, ctx)
        assert resp.status_code == 401
        assert cache.invalidate_calls == 1, "still invalidates exactly once"
        assert len(client._captured_requests) == 2, "exactly one retry, no third attempt"

    async def test_pattern_C_with_no_sp_cache_does_not_retry(self):
        """Defensive: a malformed Pattern C context (sp_cache=None) shouldn't
        crash the retry logic — it should just return the 401 as-is."""
        ctx = TellrAuthContext(
            pattern="C",
            base_url="https://tellr.app.databricksapps.com",
            sp_cache=None,
        )
        async with _mock_client([httpx.Response(401)]) as client:
            resp = await _post_with_auth_retry(client, MCP_URL, {}, {}, ctx)
        assert resp.status_code == 401
        assert len(client._captured_requests) == 1
