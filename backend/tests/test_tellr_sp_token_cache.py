"""TellrSPTokenCache — Pattern C (service-principal OAuth M2M) token plumbing.

What we're guarding against:
  - Token gets re-minted on every call (would crush the OIDC endpoint).
  - Token is held past expiry and surfaces a 401 mid-deck-generation.
  - OIDC failures get swallowed and the caller sees a 401 from Tellr
    instead of the real RuntimeError from the OIDC endpoint.
"""
from __future__ import annotations

import time

import httpx
import pytest
import respx

from revintel_backend.services.tellr_mcp import TellrSPTokenCache


pytestmark = pytest.mark.asyncio

WORKSPACE = "https://workspace.cloud.databricks.com"
OIDC_URL = f"{WORKSPACE}/oidc/v1/token"


def _good_token_response(token: str = "minted_tok_1", ttl: int = 3600) -> httpx.Response:
    return httpx.Response(200, json={"access_token": token, "expires_in": ttl, "token_type": "Bearer"})


# ---------------------------------------------------------------------------
# Happy-path mint
# ---------------------------------------------------------------------------

class TestMint:
    @respx.mock
    async def test_first_call_mints_via_OIDC_and_returns_access_token(self):
        route = respx.post(OIDC_URL).mock(return_value=_good_token_response("minted_tok_1"))
        cache = TellrSPTokenCache(WORKSPACE, "client_id_xyz", "client_secret_abc")
        tok = await cache.token()
        assert tok == "minted_tok_1"
        assert route.call_count == 1

    @respx.mock
    async def test_request_uses_HTTP_Basic_auth_with_client_id_and_secret(self):
        route = respx.post(OIDC_URL).mock(return_value=_good_token_response())
        cache = TellrSPTokenCache(WORKSPACE, "my_cid", "my_secret")
        await cache.token()
        sent = route.calls.last.request
        # HTTP Basic header is base64("my_cid:my_secret")
        import base64
        expected = "Basic " + base64.b64encode(b"my_cid:my_secret").decode()
        assert sent.headers["authorization"] == expected

    @respx.mock
    async def test_request_body_uses_client_credentials_grant_with_all_apis_scope(self):
        route = respx.post(OIDC_URL).mock(return_value=_good_token_response())
        cache = TellrSPTokenCache(WORKSPACE, "cid", "secret")
        await cache.token()
        body = route.calls.last.request.content.decode()
        # Body is form-encoded
        assert "grant_type=client_credentials" in body
        assert "scope=all-apis" in body


# ---------------------------------------------------------------------------
# Caching + freshness window
# ---------------------------------------------------------------------------

class TestCaching:
    @respx.mock
    async def test_second_call_within_freshness_window_does_not_re_mint(self):
        route = respx.post(OIDC_URL).mock(return_value=_good_token_response(ttl=3600))
        cache = TellrSPTokenCache(WORKSPACE, "cid", "secret")
        t1 = await cache.token()
        t2 = await cache.token()
        assert t1 == t2 == "minted_tok_1"
        assert route.call_count == 1, "second call should be served from cache"

    @respx.mock
    async def test_token_re_minted_when_within_60s_of_expiry(self):
        """We refresh 60s early to avoid handing out a token that
        Tellr would reject mid-call."""
        route = respx.post(OIDC_URL).mock(
            side_effect=[
                _good_token_response("first_token", ttl=3600),
                _good_token_response("second_token", ttl=3600),
            ]
        )
        cache = TellrSPTokenCache(WORKSPACE, "cid", "secret")
        await cache.token()
        # Push our cached expiry to 30s in the future — inside the 60s early-refresh window
        cache._exp = time.time() + 30
        tok = await cache.token()
        assert tok == "second_token"
        assert route.call_count == 2

    @respx.mock
    async def test_invalidate_forces_re_mint_on_next_call(self):
        """Used by the one-shot 401-retry path."""
        route = respx.post(OIDC_URL).mock(
            side_effect=[
                _good_token_response("first_token"),
                _good_token_response("second_token"),
            ]
        )
        cache = TellrSPTokenCache(WORKSPACE, "cid", "secret")
        first = await cache.token()
        cache.invalidate()
        second = await cache.token()
        assert first == "first_token"
        assert second == "second_token"
        assert route.call_count == 2


# ---------------------------------------------------------------------------
# Error surfacing
# ---------------------------------------------------------------------------

class TestOIDCErrors:
    @respx.mock
    async def test_OIDC_401_raises_RuntimeError_with_status_code_in_message(self):
        respx.post(OIDC_URL).mock(
            return_value=httpx.Response(401, json={"error": "invalid_client", "error_description": "bad secret"})
        )
        cache = TellrSPTokenCache(WORKSPACE, "wrong_cid", "wrong_secret")
        with pytest.raises(RuntimeError, match="401"):
            await cache.token()

    @respx.mock
    async def test_OIDC_500_raises_RuntimeError_including_response_body(self):
        respx.post(OIDC_URL).mock(
            return_value=httpx.Response(500, text="oidc service unavailable")
        )
        cache = TellrSPTokenCache(WORKSPACE, "cid", "secret")
        with pytest.raises(RuntimeError, match="oidc service unavailable"):
            await cache.token()

    @respx.mock
    async def test_OIDC_200_without_access_token_raises_RuntimeError(self):
        """Defends against an OIDC server that returns 200 with an empty body."""
        respx.post(OIDC_URL).mock(return_value=httpx.Response(200, json={"expires_in": 3600}))
        cache = TellrSPTokenCache(WORKSPACE, "cid", "secret")
        with pytest.raises(RuntimeError, match="missing access_token"):
            await cache.token()

    @respx.mock
    async def test_after_OIDC_failure_a_subsequent_call_retries(self):
        """A failed mint leaves the cache empty so the next call tries fresh."""
        respx.post(OIDC_URL).mock(
            side_effect=[
                httpx.Response(401, json={"error": "invalid_client"}),
                _good_token_response("recovered_token"),
            ]
        )
        cache = TellrSPTokenCache(WORKSPACE, "cid", "secret")
        with pytest.raises(RuntimeError):
            await cache.token()
        # Second attempt — perhaps after the operator rotated the secret
        tok = await cache.token()
        assert tok == "recovered_token"
