"""
Tellr deck generation over MCP — three auth patterns, picked at request time.

Docs: https://robertwhiffin.github.io/ai-slide-generator/docs/technical/mcp-server/
      https://robertwhiffin.github.io/ai-slide-generator/docs/technical/mcp-integration-guide/

Pattern A — Same-workspace Databricks App → Tellr (forwarded identity).
  When RevIntel is itself a Databricks App in the same workspace as Tellr, the
  Apps proxy STRIPS any caller-supplied `Authorization` / `x-forwarded-*`
  headers and INJECTS proxy-attested identity headers on the inbound side.
  Tellr trusts those, so on the outbound side we send NO auth headers at all
  (sending `x-forwarded-email` ourselves is incorrect — the proxy does it).

Pattern C — Cross-workspace deploy (Service Principal OAuth M2M).
  When RevIntel is deployed outside the Tellr workspace, Pattern A is not
  available. We use a Databricks service principal in the Tellr workspace
  (`client_credentials` grant against `<tellr-workspace>/oidc/v1/token`) and
  cache the ~1-hour access token in-process, refreshing 60 s before expiry.
  Decks are attributed to the SP, not the human user — Tellr docs gotcha.

Pattern B — External caller with a static OAuth U2M bearer token (local dev).
  Mint with `databricks auth token -p <profile> | jq -r .access_token` and
  drop in `DATABRICKS_OAUTH_TOKEN`. PATs (dapi…) are rejected by Apps MCP.

Pattern detection precedence (per request):
  inbound has `x-forwarded-email`        → A
  TELLR_SP_CLIENT_ID + TELLR_SP_CLIENT_SECRET set → C
  otherwise                              → B

MCP v1 has no export_pptx/pdf on the wire; we build PDF from get_deck_status's
html_document. Direct PPTX/Google Slides export is captured under TODO(v1.1).
"""
from __future__ import annotations

import os
import asyncio
import json
from xml.sax.saxutils import escape
import logging
import re
import time
import uuid
from dataclasses import dataclass
from io import BytesIO
from typing import Any, Literal, Optional
from urllib.parse import urlparse

import httpx
from fastapi import Request

logger = logging.getLogger(__name__)

DEFAULT_POLL_SECONDS = 2.0
DEFAULT_DEADLINE_SECONDS = 600.0

PatternId = Literal["A", "B", "C"]


def _tellr_workspace_host() -> str:
    """Workspace host used as the OIDC token issuer for Pattern C.

    Defaults to the host part of TELLR_BASE_URL, but can be overridden with
    TELLR_WORKSPACE_HOST when the app's URL and the workspace's OIDC issuer
    differ (rare — but possible behind custom domains).
    """
    override = (os.environ.get("TELLR_WORKSPACE_HOST") or "").strip().rstrip("/")
    if override:
        return override
    base = (os.environ.get("TELLR_BASE_URL") or "").strip()
    if not base:
        return ""
    parsed = urlparse(base)
    if not parsed.scheme or not parsed.netloc:
        return ""
    return f"{parsed.scheme}://{parsed.netloc}"


class TellrSPTokenCache:
    """Per-process Pattern C token cache.

    Mints OAuth M2M access tokens via the workspace's OIDC token endpoint
    (`<workspace>/oidc/v1/token`, `grant_type=client_credentials`,
    `scope=all-apis`) and caches them with a 60 s early-refresh margin so
    we never hand out a token that's about to expire mid-flight.
    """

    _EARLY_REFRESH_S = 60

    def __init__(self, workspace_host: str, client_id: str, client_secret: str) -> None:
        self._workspace = workspace_host.rstrip("/")
        self._client_id = client_id
        self._client_secret = client_secret
        self._token: Optional[str] = None
        self._exp: float = 0.0
        self._lock = asyncio.Lock()

    def _is_fresh(self) -> bool:
        return bool(self._token) and (self._exp - self._EARLY_REFRESH_S) > time.time()

    def invalidate(self) -> None:
        """Force the next `token()` call to mint a fresh one (used after a 401)."""
        self._token = None
        self._exp = 0.0

    async def token(self) -> str:
        if self._is_fresh():
            return self._token  # type: ignore[return-value]
        async with self._lock:
            if self._is_fresh():
                return self._token  # type: ignore[return-value]
            url = f"{self._workspace}/oidc/v1/token"
            data = {"grant_type": "client_credentials", "scope": "all-apis"}
            async with httpx.AsyncClient(timeout=30.0) as client:
                resp = await client.post(
                    url,
                    data=data,
                    auth=(self._client_id, self._client_secret),
                    headers={"Accept": "application/json"},
                )
            if resp.status_code != 200:
                raise RuntimeError(
                    f"Tellr SP token endpoint returned {resp.status_code}: {resp.text[:300]}"
                )
            payload = resp.json()
            access = payload.get("access_token")
            ttl = int(payload.get("expires_in", 3600))
            if not access:
                raise RuntimeError("Tellr SP token response missing access_token")
            self._token = access
            self._exp = time.time() + max(ttl, 60)
            return access


_SP_CACHE: Optional[TellrSPTokenCache] = None


def _get_sp_cache() -> Optional[TellrSPTokenCache]:
    """Lazily build the Pattern C cache from env vars; None if Pattern C isn't configured."""
    global _SP_CACHE
    cid = (os.environ.get("TELLR_SP_CLIENT_ID") or "").strip()
    secret = (os.environ.get("TELLR_SP_CLIENT_SECRET") or "").strip()
    host = _tellr_workspace_host()
    if not (cid and secret and host):
        return None
    if _SP_CACHE is None or _SP_CACHE._client_id != cid or _SP_CACHE._workspace != host.rstrip("/"):
        _SP_CACHE = TellrSPTokenCache(workspace_host=host, client_id=cid, client_secret=secret)
    return _SP_CACHE


def _sp_configured() -> bool:
    return _get_sp_cache() is not None


@dataclass(frozen=True)
class TellrAuthContext:
    """Resolved auth shape for a single Tellr MCP call. See module docstring."""

    pattern: PatternId
    base_url: str
    forwarded_email: Optional[str] = None
    bearer_token: Optional[str] = None
    sp_cache: Optional[TellrSPTokenCache] = None

    async def headers(self) -> dict[str, str]:
        h: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.pattern == "A":
            # Apps proxy injects identity headers on Tellr's side; we send none.
            return h
        if self.pattern == "C" and self.sp_cache is not None:
            h["Authorization"] = f"Bearer {await self.sp_cache.token()}"
            return h
        if self.pattern == "B" and self.bearer_token:
            h["Authorization"] = f"Bearer {self.bearer_token}"
        return h


def detect_pattern(request: Optional[Request]) -> PatternId:
    """A → C → B precedence (see module docstring)."""
    if request is not None:
        fwd = (request.headers.get("x-forwarded-email") or "").strip()
        if fwd:
            return "A"
    if _sp_configured():
        return "C"
    return "B"


def resolve_auth_context(request: Optional[Request]) -> TellrAuthContext:
    base = (os.environ.get("TELLR_BASE_URL") or "").strip().rstrip("/")
    pattern = detect_pattern(request)
    if pattern == "A":
        fwd = (request.headers.get("x-forwarded-email") if request else "") or ""
        return TellrAuthContext(pattern="A", base_url=base, forwarded_email=fwd.strip() or None)
    if pattern == "C":
        return TellrAuthContext(pattern="C", base_url=base, sp_cache=_get_sp_cache())
    token = (os.environ.get("DATABRICKS_OAUTH_TOKEN") or os.environ.get("TELLR_OAUTH_TOKEN", "")).strip()
    return TellrAuthContext(pattern="B", base_url=base, bearer_token=token or None)


def mcp_url(base: str) -> str:
    b = (base or "").rstrip("/")
    return f"{b}/mcp/"


def decode_mcp_response(resp: httpx.Response) -> dict[str, Any]:
    ct = (resp.headers.get("content-type") or "").lower()
    if "event-stream" in ct:
        for line in resp.text.splitlines():
            if line.startswith("data:"):
                return json.loads(line[5:].strip())
        raise RuntimeError("MCP returned SSE but no data: line")
    return resp.json()


def result_text_from_payload(payload: dict[str, Any]) -> str:
    r = payload.get("result")
    if not r:
        raise RuntimeError(f"MCP no result: {payload!r}")
    if r.get("isError"):
        parts = r.get("content") or []
        t = parts[0].get("text", str(r)) if parts else str(r)
        raise RuntimeError(t)
    content = r.get("content") or []
    if not content:
        raise RuntimeError("MCP result has no content")
    return str(content[0].get("text", ""))


async def _post_with_auth_retry(
    client: httpx.AsyncClient,
    url: str,
    body: dict[str, Any],
    base_headers: dict[str, str],
    auth: Optional[TellrAuthContext],
) -> httpx.Response:
    """POST and, for Pattern C, retry exactly once on 401 after invalidating the SP token cache.

    Catches the rare race where Tellr accepts our token mint but rejects it on
    use (clock skew, edge token rotation). Pattern A and B do not retry — A has
    no token to refresh, and B's token came from the user's static env var.
    """
    resp = await client.post(url, json=body, headers=base_headers, timeout=120.0)
    if (
        resp.status_code == 401
        and auth is not None
        and auth.pattern == "C"
        and auth.sp_cache is not None
    ):
        logger.info("Tellr returned 401 on Pattern C; refreshing SP token and retrying once")
        auth.sp_cache.invalidate()
        retry_headers = await auth.headers()
        # Carry over any non-auth headers the caller added (e.g. mcp-session-id).
        merged = {**base_headers, **retry_headers}
        resp = await client.post(url, json=body, headers=merged, timeout=120.0)
    return resp


async def mcp_post(
    client: httpx.AsyncClient,
    url: str,
    body: dict[str, Any],
    base_headers: dict[str, str],
    auth: Optional[TellrAuthContext] = None,
) -> httpx.Response:
    return await _post_with_auth_retry(client, url, body, base_headers, auth)


async def mcp_open_session(
    client: httpx.AsyncClient,
    murl: str,
    base_headers: dict[str, str],
    auth: Optional[TellrAuthContext] = None,
) -> dict[str, str]:
    init_body: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": 1,
        "method": "initialize",
        "params": {
            "protocolVersion": "2025-03-26",
            "capabilities": {},
            "clientInfo": {"name": "revintel-poc", "version": "0.1"},
        },
    }
    r = await mcp_post(client, murl, init_body, base_headers, auth=auth)
    r.raise_for_status()
    decode_mcp_response(r)
    sid = r.headers.get("mcp-session-id")
    extra: dict[str, str] = {}
    if sid:
        extra["mcp-session-id"] = sid
    merged = {**base_headers, **extra}
    note: dict[str, Any] = {"jsonrpc": "2.0", "method": "notifications/initialized"}
    await mcp_post(client, murl, note, merged, auth=auth)
    return extra


async def mcp_call_tool(
    client: httpx.AsyncClient,
    murl: str,
    base_headers: dict[str, str],
    name: str,
    arguments: dict[str, Any],
    req_id: int,
    auth: Optional[TellrAuthContext] = None,
) -> dict[str, Any]:
    sess = await mcp_open_session(client, murl, base_headers, auth=auth)
    merged = {**base_headers, **sess}
    body: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
    }
    r = await mcp_post(client, murl, body, merged, auth=auth)
    r.raise_for_status()
    return decode_mcp_response(r)


def _strip_html_to_text(html: str) -> str:
    t = re.sub(r"(?is)<script.*?>.*?</script>", " ", html)
    t = re.sub(r"(?i)<script[^>]*?/>", " ", t)
    t = re.sub(r"(?i)<style.*?>.*?</style>", " ", t)
    t = re.sub(r"<[^>]+>", " ", t)
    t = re.sub(r"\s+", " ", t).strip()
    return t[:20000] if t else "No text content."


def text_to_pdf_bytes_reportlab(text: str) -> bytes:
    """Plain-text PDF when HTML→PDF (xhtml2pdf) is unavailable or Tellr HTML is too complex."""
    from reportlab.lib import colors
    from reportlab.lib.pagesizes import letter
    from reportlab.lib.styles import ParagraphStyle, getSampleStyleSheet
    from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer

    buf = BytesIO()
    doc = SimpleDocTemplate(
        buf,
        pagesize=letter,
        rightMargin=50,
        leftMargin=50,
        topMargin=50,
        bottomMargin=50,
    )
    styles = getSampleStyleSheet()
    style = ParagraphStyle(
        "body",
        parent=styles["Normal"],
        textColor=colors.HexColor("#111111"),
        fontSize=9,
        leading=12,
    )
    t = (text or "").strip() or "(empty)"
    safe = escape(t).replace("\n", "<br/>")
    story = [Paragraph(safe, style), Spacer(1, 12)]
    doc.build(story)
    return buf.getvalue()


def html_to_pdf_bytes(html: str, *, plain_fallback: str | None = None) -> bytes:
    """Tellr's html_document → PDF via xhtml2pdf, else ReportLab from plain_fallback or stripped HTML text."""
    fallback = (plain_fallback or _strip_html_to_text(html) or "Executive deck (no text content)").strip()

    if html and len(html.strip()) > 80:
        try:
            from xhtml2pdf import pisa

            out = BytesIO()
            cleaned = re.sub(
                r"<script[^>]*>[\s\S]*?</script>",
                "",
                html,
                flags=re.IGNORECASE,
            )
            cleaned = re.sub(
                r"<script[^>]*/>",
                "",
                cleaned,
                flags=re.IGNORECASE,
            )
            pisa_status = pisa.CreatePDF(  # type: ignore[operator]
                src=cleaned,
                dest=out,
                encoding="utf-8",
            )
            if not bool(getattr(pisa_status, "err", None)):  # type: ignore[attr-defined]
                data = out.getvalue()
                if data and len(data) >= 200:
                    return data
        except Exception as e:  # noqa: BLE001 — any render failure → text PDF
            logger.info("xhtml2pdf failed, using text PDF fallback: %s", e)
    return text_to_pdf_bytes_reportlab(fallback)


def build_executive_deck_prompt(
    summary: str, period_start: str | None, period_end: str | None, region: str | None
) -> str:
    p = f"Time period: {period_start or 'N/A'} through {period_end or 'N/A'}"
    if region:
        p += f". Region: {region}"
    return (
        f"Create a professional executive board-ready slide deck (clear titles, bullet points, "
        f"one key chart or metric per slide where appropriate) based on the following material.\n\n"
        f"--- Context ---\n{p}\n\n--- Source narrative ---\n{summary}\n"
    )


async def create_deck_start(
    auth: TellrAuthContext,
    prompt: str,
    *,
    num_slides: int = 10,
    correlation_id: Optional[str] = None,
) -> dict[str, Any]:
    """Kick off a Tellr deck and return immediately with `session_id` + `request_id`.

    Returns the parsed JSON payload from `tools/call create_deck` so the caller
    can hand `session_id` / `request_id` back to the browser for polling.
    """
    murl = mcp_url(auth.base_url)
    cid = correlation_id or f"revintel-{uuid.uuid4().hex[:10]}"
    headers = await auth.headers()
    ns = min(max(int(num_slides), 1), 50)
    create_args: dict[str, Any] = {
        "prompt": prompt,
        "num_slides": ns,
        "correlation_id": cid,
    }
    async with httpx.AsyncClient() as client:
        payload = await mcp_call_tool(
            client, murl, headers, "create_deck", create_args, req_id=2, auth=auth
        )
        start = json.loads(result_text_from_payload(payload))
    start["correlation_id"] = cid
    return start


async def get_deck_status_call(
    auth: TellrAuthContext, session_id: str, request_id: str
) -> dict[str, Any]:
    murl = mcp_url(auth.base_url)
    headers = await auth.headers()
    async with httpx.AsyncClient() as client:
        payload = await mcp_call_tool(
            client,
            murl,
            headers,
            "get_deck_status",
            {"session_id": session_id, "request_id": request_id},
            req_id=3,
            auth=auth,
        )
    return json.loads(result_text_from_payload(payload))


async def get_deck_call(
    auth: TellrAuthContext, session_id: str, request_id: str
) -> dict[str, Any]:
    """`get_deck` is idempotent on a ready deck — used by the PDF endpoint."""
    murl = mcp_url(auth.base_url)
    headers = await auth.headers()
    async with httpx.AsyncClient() as client:
        payload = await mcp_call_tool(
            client,
            murl,
            headers,
            "get_deck",
            {"session_id": session_id, "request_id": request_id},
            req_id=4,
            auth=auth,
        )
    return json.loads(result_text_from_payload(payload))


async def create_deck_and_wait_ready(
    auth: TellrAuthContext,
    prompt: str,
    *,
    num_slides: int = 10,
    correlation_id: Optional[str] = None,
    poll_seconds: float = DEFAULT_POLL_SECONDS,
    deadline_seconds: float = DEFAULT_DEADLINE_SECONDS,
) -> dict[str, Any]:
    """Convenience wrapper used by tests / health probes: starts and polls in-process."""
    start = await create_deck_start(auth, prompt, num_slides=num_slides, correlation_id=correlation_id)
    session_id = start["session_id"]
    request_id = start["request_id"]
    deadline = time.time() + deadline_seconds
    while time.time() < deadline:
        await asyncio.sleep(poll_seconds)
        data = await get_deck_status_call(auth, session_id, request_id)
        st = data.get("status", "")
        if st == "ready":
            return data
        if st == "failed":
            raise RuntimeError(data.get("error", "Deck generation failed"))
    raise TimeoutError("Tellr did not return ready within deadline")


def tellr_configured(auth: Optional[TellrAuthContext] = None) -> bool:
    """True iff Tellr base URL + the auth bits required by the resolved pattern are present."""
    base = (os.environ.get("TELLR_BASE_URL") or "").strip()
    if not base:
        return False
    if auth is None:
        # Env-only check: any of Pattern C (SP creds) or Pattern B (static token).
        if _sp_configured():
            return True
        tok = (os.environ.get("DATABRICKS_OAUTH_TOKEN") or os.environ.get("TELLR_OAUTH_TOKEN", "")).strip()
        return bool(tok)
    if auth.pattern == "A":
        return bool(auth.forwarded_email)
    if auth.pattern == "C":
        return auth.sp_cache is not None
    return bool(auth.bearer_token)
