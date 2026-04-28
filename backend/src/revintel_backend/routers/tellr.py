"""Tellr router — async deck flow (create → status → PDF) plus a health probe.

Async flow lets the browser keep its own poll cadence (2s then 5s, see the
DeckProgressModal) instead of holding open a 10-min POST. The plan calls
out v1.1 follow-ups (`# TODO(v1.1)`) for direct PPTX / Google Slides export
once Tellr exposes those wire-level tools.
"""
from __future__ import annotations

import logging
from typing import Any, Optional

from fastapi import APIRouter, HTTPException, Query, Request, Response
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from ..services.persona_scope import effective_region
from ..services.tellr_mcp import (
    TellrAuthContext,
    build_executive_deck_prompt,
    create_deck_start,
    get_deck_call,
    get_deck_status_call,
    html_to_pdf_bytes,
    resolve_auth_context,
    tellr_configured,
)

router = APIRouter()
logger = logging.getLogger(__name__)


class KpiSnapshot(BaseModel):
    """Current values for the four exec KPIs — Tellr v1 is prompt-only and does
    not call Genie itself, so the frontend embeds the cards' values here and
    we splice them into the prompt body."""

    chargeable_hours: Optional[float] = None
    hourly_rate: Optional[float] = None
    gross_fee_days: Optional[float] = None
    unbilled_days: Optional[float] = None


class CreateExecutiveDeckRequest(BaseModel):
    summary: str = Field(..., min_length=1)
    period_start: Optional[str] = None
    period_end: Optional[str] = None
    region: Optional[str] = None
    capability: Optional[str] = None
    num_slides: int = Field(default=10, ge=1, le=50)
    kpi_snapshot: KpiSnapshot = Field(default_factory=KpiSnapshot)


def _ensure_configured(auth: TellrAuthContext) -> None:
    if not auth.base_url:
        raise HTTPException(
            status_code=503,
            detail="Tellr is not configured. Set TELLR_BASE_URL on the API server.",
        )
    if auth.pattern == "A" and not auth.forwarded_email:
        raise HTTPException(
            status_code=503,
            detail="Tellr Pattern A detected but `x-forwarded-email` is missing on the inbound request.",
        )
    if auth.pattern == "C" and auth.sp_cache is None:
        raise HTTPException(
            status_code=503,
            detail=(
                "Tellr Pattern C requires TELLR_SP_CLIENT_ID and TELLR_SP_CLIENT_SECRET, plus "
                "either TELLR_BASE_URL or TELLR_WORKSPACE_HOST so we can resolve the OIDC token endpoint."
            ),
        )
    if auth.pattern == "B" and not auth.bearer_token:
        raise HTTPException(
            status_code=503,
            detail=(
                "Tellr Pattern B requires DATABRICKS_OAUTH_TOKEN (preferred) or TELLR_OAUTH_TOKEN; "
                "PATs (dapi…) are rejected by Apps MCP. For deployed apps, prefer Pattern A "
                "(same workspace as Tellr) or Pattern C (service principal in the Tellr workspace)."
            ),
        )


def _decorate_prompt_with_kpis(base: str, kpi_snapshot: KpiSnapshot) -> str:
    snapshot = kpi_snapshot.model_dump(exclude_none=True)
    if not snapshot:
        return base
    fmt = []
    if "chargeable_hours" in snapshot:
        fmt.append(f"- Chargeable hours: {snapshot['chargeable_hours']:.0f}")
    if "hourly_rate" in snapshot:
        fmt.append(f"- Rate per hour: £{snapshot['hourly_rate']:.0f}")
    if "gross_fee_days" in snapshot:
        fmt.append(f"- Gross fee days: {snapshot['gross_fee_days']:.0f}")
    if "unbilled_days" in snapshot:
        fmt.append(f"- Unbilled days: {snapshot['unbilled_days']:.1f}")
    return f"{base}\n\n--- KPI snapshot (current values) ---\n" + "\n".join(fmt) + "\n"


@router.get("/health")
async def tellr_health(request: Request) -> dict[str, Any]:
    """Surface detected pattern + auth-presence flags so SAs can debug from the browser.

    Patterns:
      A — same-workspace App, identity injected by the Apps proxy (no token).
      C — cross-workspace deploy via service-principal OAuth M2M (auto-refresh).
      B — local dev, static OAuth U2M bearer in DATABRICKS_OAUTH_TOKEN.
    """
    auth = resolve_auth_context(request)
    return {
        "configured": tellr_configured(auth),
        "pattern": auth.pattern,
        "base_url_set": bool(auth.base_url),
        "forwarded_email_present": bool(auth.forwarded_email),
        "sp_cache_present": auth.sp_cache is not None,
        "bearer_token_present": bool(auth.bearer_token),
    }


@router.post("/create-executive-deck")
async def create_executive_deck(request: Request, body: CreateExecutiveDeckRequest) -> dict[str, Any]:
    auth = resolve_auth_context(request)
    _ensure_configured(auth)
    eff = effective_region(body.region, getattr(request.state, "persona", None))
    base_prompt = build_executive_deck_prompt(body.summary, body.period_start, body.period_end, eff)
    prompt = _decorate_prompt_with_kpis(base_prompt, body.kpi_snapshot)
    try:
        start = await create_deck_start(auth, prompt, num_slides=body.num_slides)
    except Exception as e:  # noqa: BLE001
        logger.exception("Tellr create_deck failed")
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {
        "session_id": start.get("session_id"),
        "request_id": start.get("request_id"),
        "correlation_id": start.get("correlation_id"),
        "status": "pending",
        "pattern": auth.pattern,
    }


@router.get("/deck-status")
async def deck_status(
    request: Request,
    session_id: str = Query(...),
    request_id: str = Query(...),
) -> dict[str, Any]:
    auth = resolve_auth_context(request)
    _ensure_configured(auth)
    try:
        data = await get_deck_status_call(auth, session_id, request_id)
    except Exception as e:  # noqa: BLE001
        logger.exception("Tellr get_deck_status failed")
        raise HTTPException(status_code=502, detail=str(e)) from e
    return {
        "status": data.get("status"),
        "deck_url": data.get("deck_url"),
        "html_document": data.get("html_document"),
        "error": data.get("error"),
    }


@router.get("/deck-pdf")
async def deck_pdf(
    request: Request,
    session_id: str = Query(...),
    request_id: str = Query(...),
) -> Response:
    """Idempotent PDF endpoint — calls `get_deck` and renders the html_document.

    # TODO(v1.1): when Tellr exposes `tools/call export_pptx | export_google_slides`
    #             on the wire, swap this server-side render for a passthrough.
    """
    auth = resolve_auth_context(request)
    _ensure_configured(auth)
    try:
        data = await get_deck_call(auth, session_id, request_id)
    except Exception as e:  # noqa: BLE001
        logger.exception("Tellr get_deck failed")
        raise HTTPException(status_code=502, detail=str(e)) from e

    html = (data.get("html_document") or "").strip()
    deck_url = (data.get("deck_url") or "").strip()
    if not html:
        return JSONResponse(
            status_code=409,
            content={"error": "Deck not ready yet — poll /deck-status first.", "deck_url": deck_url or None},
        )
    try:
        pdf = html_to_pdf_bytes(html, plain_fallback=None)
    except Exception as e:  # noqa: BLE001
        logger.exception("PDF build failed after ready deck")
        return JSONResponse(
            status_code=422,
            content={"error": str(e), "deck_url": deck_url or None},
        )
    headers: dict[str, str] = {
        "Content-Disposition": 'attachment; filename="revintel-executive-deck.pdf"',
    }
    if deck_url:
        headers["X-Tellr-Deck-Url"] = deck_url
    return Response(content=pdf, media_type="application/pdf", headers=headers)


