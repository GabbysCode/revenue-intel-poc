"""TellrAuthContext.headers() — outbound header shape per pattern.

The single most important Pattern-A invariant: outbound calls must NOT
include `x-forwarded-email` or `Authorization`. The Apps proxy strips
caller-supplied identity headers and re-injects its own; sending one
ourselves would either be ignored (best case) or trigger `401 invalid
forwarded identity` (worst case). This is the bug that originally
prompted the Phase 1 refactor — these tests guard against regression.
"""
from __future__ import annotations

from typing import Optional

import pytest

from revintel_backend.services.tellr_mcp import TellrAuthContext


class _FakeSPCache:
    """Stand-in for TellrSPTokenCache that returns a fixed token."""

    def __init__(self, token: str = "sp_token_abc"):
        self._fixed = token
        self.token_calls = 0

    async def token(self) -> str:
        self.token_calls += 1
        return self._fixed

    def invalidate(self) -> None:  # pragma: no cover (not used in this file)
        pass


pytestmark = pytest.mark.asyncio


# ---------------------------------------------------------------------------
# Pattern A — proxy-injected identity, NO outbound auth
# ---------------------------------------------------------------------------

class TestPatternAHeaders:
    async def test_pattern_A_sends_no_authorization_header(self):
        ctx = TellrAuthContext(
            pattern="A",
            base_url="https://tellr.app.databricksapps.com",
            forwarded_email="user@example.com",
        )
        h = await ctx.headers()
        assert "Authorization" not in h

    async def test_pattern_A_does_not_forward_x_forwarded_email_outbound(self):
        """REGRESSION GUARD: this header MUST stay client-side. The Apps
        proxy injects its own and rejects caller-supplied versions."""
        ctx = TellrAuthContext(
            pattern="A",
            base_url="https://tellr.app.databricksapps.com",
            forwarded_email="user@example.com",
        )
        h = await ctx.headers()
        assert "x-forwarded-email" not in {k.lower() for k in h}

    async def test_pattern_A_only_sends_content_type_and_accept(self):
        ctx = TellrAuthContext(
            pattern="A",
            base_url="https://tellr.app.databricksapps.com",
            forwarded_email="user@example.com",
        )
        h = await ctx.headers()
        assert set(h.keys()) == {"Content-Type", "Accept"}
        assert h["Content-Type"] == "application/json"
        assert h["Accept"] == "application/json, text/event-stream"


# ---------------------------------------------------------------------------
# Pattern B — static OAuth U2M Bearer
# ---------------------------------------------------------------------------

class TestPatternBHeaders:
    async def test_pattern_B_sends_authorization_bearer(self):
        ctx = TellrAuthContext(
            pattern="B",
            base_url="https://tellr.app.databricksapps.com",
            bearer_token="eyJraWQiOi.fake.jwt",
        )
        h = await ctx.headers()
        assert h["Authorization"] == "Bearer eyJraWQiOi.fake.jwt"

    async def test_pattern_B_with_no_token_omits_authorization(self):
        """Misconfigured Pattern B (no token) sends bare headers — router
        catches this with 503 before we'd ever try the call."""
        ctx = TellrAuthContext(
            pattern="B",
            base_url="https://tellr.app.databricksapps.com",
            bearer_token=None,
        )
        h = await ctx.headers()
        assert "Authorization" not in h


# ---------------------------------------------------------------------------
# Pattern C — service-principal OAuth M2M Bearer (from cache)
# ---------------------------------------------------------------------------

class TestPatternCHeaders:
    async def test_pattern_C_calls_sp_cache_for_token(self):
        cache = _FakeSPCache(token="sp_minted_xyz")
        ctx = TellrAuthContext(
            pattern="C",
            base_url="https://tellr.app.databricksapps.com",
            sp_cache=cache,
        )
        h = await ctx.headers()
        assert h["Authorization"] == "Bearer sp_minted_xyz"
        assert cache.token_calls == 1

    async def test_pattern_C_with_no_cache_omits_authorization(self):
        """Belt-and-braces: should never happen at runtime (router guards)."""
        ctx = TellrAuthContext(
            pattern="C",
            base_url="https://tellr.app.databricksapps.com",
            sp_cache=None,
        )
        h = await ctx.headers()
        assert "Authorization" not in h

    async def test_pattern_C_propagates_token_errors(self):
        """If the SP cache raises, the caller sees the error — not a silent 401."""
        class _ExplodingCache:
            async def token(self) -> str:
                raise RuntimeError("OIDC endpoint returned 401: invalid_client")

            def invalidate(self) -> None:  # pragma: no cover
                pass

        ctx = TellrAuthContext(
            pattern="C",
            base_url="https://tellr.app.databricksapps.com",
            sp_cache=_ExplodingCache(),
        )
        with pytest.raises(RuntimeError, match="OIDC endpoint returned 401"):
            await ctx.headers()
