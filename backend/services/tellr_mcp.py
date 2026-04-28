"""
Tellr deck generation over MCP — supports Pattern A (Databricks Apps OBO) and
Pattern B (external caller with OAuth U2M bearer token), auto-picking based on
whether an `x-forwarded-email` is present on the inbound request.

Docs: https://robertwhiffin.github.io/ai-slide-generator/docs/technical/mcp-server/
      https://robertwhiffin.github.io/ai-slide-generator/docs/technical/mcp-integration-guide/

PATs (dapi...) are rejected for Apps MCP — use an OAuth U2M token, e.g.:
  databricks auth token -p <profile> | jq -r .access_token

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

import httpx
from fastapi import Request

logger = logging.getLogger(__name__)

DEFAULT_POLL_SECONDS = 2.0
DEFAULT_DEADLINE_SECONDS = 600.0

PatternId = Literal["A", "B"]


@dataclass(frozen=True)
class TellrAuthContext:
    """Resolved auth shape for a single Tellr MCP call.

    - Pattern A (Databricks Apps OBO): the Apps runtime injects the user's
      identity via `x-forwarded-email`; the call carries no Authorization
      header — Apps handles OBO downstream. We forward the email so Tellr
      can scope the deck to that user's Genie permissions.

    - Pattern B (external caller): we attach an OAuth U2M bearer token from
      the server's environment (DATABRICKS_OAUTH_TOKEN / TELLR_OAUTH_TOKEN).
    """

    pattern: PatternId
    base_url: str
    forwarded_email: Optional[str] = None
    bearer_token: Optional[str] = None

    def headers(self) -> dict[str, str]:
        h: dict[str, str] = {
            "Content-Type": "application/json",
            "Accept": "application/json, text/event-stream",
        }
        if self.pattern == "A" and self.forwarded_email:
            h["x-forwarded-email"] = self.forwarded_email
        if self.pattern == "B" and self.bearer_token:
            h["Authorization"] = f"Bearer {self.bearer_token}"
        return h


def detect_pattern(request: Optional[Request]) -> PatternId:
    """Pattern A iff inbound request carries `x-forwarded-email`, else Pattern B."""
    if request is None:
        return "B"
    fwd = (request.headers.get("x-forwarded-email") or "").strip()
    return "A" if fwd else "B"


def resolve_auth_context(request: Optional[Request]) -> TellrAuthContext:
    base = (os.environ.get("TELLR_BASE_URL") or "").strip().rstrip("/")
    pattern = detect_pattern(request)
    if pattern == "A":
        fwd = (request.headers.get("x-forwarded-email") if request else "") or ""
        return TellrAuthContext(pattern="A", base_url=base, forwarded_email=fwd.strip() or None)
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


async def mcp_post(
    client: httpx.AsyncClient, url: str, body: dict[str, Any], base_headers: dict[str, str]
) -> httpx.Response:
    return await client.post(url, json=body, headers=base_headers, timeout=120.0)


async def mcp_open_session(
    client: httpx.AsyncClient, murl: str, base_headers: dict[str, str]
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
    r = await mcp_post(client, murl, init_body, base_headers)
    r.raise_for_status()
    decode_mcp_response(r)
    sid = r.headers.get("mcp-session-id")
    extra: dict[str, str] = {}
    if sid:
        extra["mcp-session-id"] = sid
    merged = {**base_headers, **extra}
    note: dict[str, Any] = {"jsonrpc": "2.0", "method": "notifications/initialized"}
    await mcp_post(client, murl, note, merged)
    return extra


async def mcp_call_tool(
    client: httpx.AsyncClient,
    murl: str,
    base_headers: dict[str, str],
    name: str,
    arguments: dict[str, Any],
    req_id: int,
) -> dict[str, Any]:
    sess = await mcp_open_session(client, murl, base_headers)
    merged = {**base_headers, **sess}
    body: dict[str, Any] = {
        "jsonrpc": "2.0",
        "id": req_id,
        "method": "tools/call",
        "params": {"name": name, "arguments": arguments},
    }
    r = await mcp_post(client, murl, body, merged)
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
    headers = auth.headers()
    ns = min(max(int(num_slides), 1), 50)
    create_args: dict[str, Any] = {
        "prompt": prompt,
        "num_slides": ns,
        "correlation_id": cid,
    }
    async with httpx.AsyncClient() as client:
        payload = await mcp_call_tool(client, murl, headers, "create_deck", create_args, req_id=2)
        start = json.loads(result_text_from_payload(payload))
    start["correlation_id"] = cid
    return start


async def get_deck_status_call(
    auth: TellrAuthContext, session_id: str, request_id: str
) -> dict[str, Any]:
    murl = mcp_url(auth.base_url)
    headers = auth.headers()
    async with httpx.AsyncClient() as client:
        payload = await mcp_call_tool(
            client,
            murl,
            headers,
            "get_deck_status",
            {"session_id": session_id, "request_id": request_id},
            req_id=3,
        )
    return json.loads(result_text_from_payload(payload))


async def get_deck_call(
    auth: TellrAuthContext, session_id: str, request_id: str
) -> dict[str, Any]:
    """`get_deck` is idempotent on a ready deck — used by the PDF endpoint."""
    murl = mcp_url(auth.base_url)
    headers = auth.headers()
    async with httpx.AsyncClient() as client:
        payload = await mcp_call_tool(
            client,
            murl,
            headers,
            "get_deck",
            {"session_id": session_id, "request_id": request_id},
            req_id=4,
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
    """True iff Tellr base URL + (token for B / forwarded-email for A) are present."""
    base = (os.environ.get("TELLR_BASE_URL") or "").strip()
    if not base:
        return False
    if auth is None:
        # Fall back to env-only Pattern B check.
        tok = (os.environ.get("DATABRICKS_OAUTH_TOKEN") or os.environ.get("TELLR_OAUTH_TOKEN", "")).strip()
        return bool(tok)
    if auth.pattern == "A":
        return bool(auth.forwarded_email)
    return bool(auth.bearer_token)
