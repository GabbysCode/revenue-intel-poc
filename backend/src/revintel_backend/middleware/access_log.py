"""Per-request access log focused on auth signal visibility.

Why this exists: most production 401s on `/api/kpis/*` and friends are NOT
from our Python code — they're from the Databricks Apps proxy in front of
the backend rejecting the request before it ever reaches FastAPI. When a
request DOES reach us, we still want to see exactly which auth signals
arrived (and which didn't) so we can correlate with the apps proxy logs.

Every request emits two log lines:
  - request_in  (DEBUG): pre-handler — full inbound auth signal summary
  - request_out (INFO/WARNING): post-handler — status, elapsed, signals

WARNING level on 4xx/5xx makes 401s pop in `databricks apps logs` filters.

We never log raw bearer tokens or full forwarded-email addresses; tokens
get an 8-char prefix (enough to correlate, not enough to use) and emails
are reduced to their domain.
"""
from __future__ import annotations

import logging
import time
from typing import Optional

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import Response

logger = logging.getLogger("revintel.access")


def _token_prefix(value: Optional[str], n: int = 8) -> str:
    """8-char prefix is enough to correlate calls without leaking the token."""
    if not value:
        return "(none)"
    if len(value) <= n:
        return "***"
    return f"{value[:n]}..."


def _email_domain(email: Optional[str]) -> str:
    """Reduce email to domain — proves Apps proxy injection without leaking PII."""
    if not email:
        return "(none)"
    if "@" not in email:
        return "(invalid)"
    return "@" + email.split("@", 1)[1]


def _auth_scheme(authorization: Optional[str]) -> str:
    if not authorization:
        return "(none)"
    parts = authorization.split(" ", 1)
    return parts[0] if parts else "(malformed)"


def _cookie_names(cookie_header: Optional[str]) -> list[str]:
    """Names only — cookie values can carry session tokens, never log them."""
    if not cookie_header:
        return []
    names: list[str] = []
    for pair in cookie_header.split(";"):
        pair = pair.strip()
        if not pair:
            continue
        name = pair.split("=", 1)[0].strip()
        if name:
            names.append(name)
    return names


class AccessLogMiddleware(BaseHTTPMiddleware):
    """Logs request_in/request_out with auth signal presence flags.

    Skips the FastAPI docs endpoints to keep logs focused on real API traffic.
    """

    SKIP_PATHS = {"/docs", "/redoc", "/openapi.json", "/favicon.ico"}

    async def dispatch(self, request: Request, call_next):
        path = request.url.path
        if path in self.SKIP_PATHS:
            return await call_next(request)

        method = request.method
        h = request.headers
        authorization = h.get("authorization")
        fwd_email = h.get("x-forwarded-email")
        fwd_user = h.get("x-forwarded-user")
        fwd_token_present = bool(h.get("x-forwarded-access-token"))
        persona = h.get("x-revintel-persona")
        host = h.get("host")
        x_forwarded_host = h.get("x-forwarded-host")
        x_real_ip = h.get("x-real-ip") or h.get("x-forwarded-for", "").split(",")[0].strip() or None
        cookie_names = _cookie_names(h.get("cookie"))

        logger.debug(
            "request_in method=%s path=%s host=%s xfh=%s xri=%s "
            "auth=%s scheme=%s auth_prefix=%s "
            "fwd_email=%s fwd_user=%s fwd_token_present=%s "
            "persona=%s cookies=%d cookie_names=%s",
            method, path, host, x_forwarded_host or "(none)", x_real_ip or "(none)",
            "yes" if authorization else "no", _auth_scheme(authorization),
            _token_prefix((authorization or "").split(" ", 1)[-1] if " " in (authorization or "") else None),
            _email_domain(fwd_email), fwd_user or "(none)", "yes" if fwd_token_present else "no",
            persona or "(none)", len(cookie_names), ",".join(cookie_names) or "(none)",
        )

        t0 = time.perf_counter()
        try:
            response: Response = await call_next(request)
        except Exception:
            elapsed_ms = (time.perf_counter() - t0) * 1000.0
            logger.exception(
                "request_error method=%s path=%s elapsed_ms=%.1f "
                "auth=%s scheme=%s fwd_email=%s persona=%s",
                method, path, elapsed_ms,
                "yes" if authorization else "no", _auth_scheme(authorization),
                _email_domain(fwd_email), persona or "(none)",
            )
            raise

        elapsed_ms = (time.perf_counter() - t0) * 1000.0
        level = logging.WARNING if response.status_code >= 400 else logging.INFO
        logger.log(
            level,
            "request_out method=%s path=%s status=%d elapsed_ms=%.1f "
            "auth=%s scheme=%s fwd_email=%s persona=%s",
            method, path, response.status_code, elapsed_ms,
            "yes" if authorization else "no", _auth_scheme(authorization),
            _email_domain(fwd_email), persona or "(none)",
        )
        return response
