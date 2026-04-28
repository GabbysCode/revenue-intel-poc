from typing import Literal

from fastapi import APIRouter, Query, Request

from ..models.schemas import NLPQueryRequest, ExecSummaryRequest
from ..services.genie_engine import ask_genie, generate_executive_summary
from ..services.persona_scope import effective_region

router = APIRouter()


# Tab-aware suggested prompts. The Overview tab uses the four canonical
# example prompts from the brief; each drill-down focuses the chips on its
# KPI to match the user's mental model.
SUGGESTED_PROMPTS: dict[str, list[str]] = {
    "overview": [
        "Which KPI is the largest contributor to the revenue drop?",
        "Is rate per hour the reason for the revenue decline, or is it lower volume?",
        "Why did chargeable hours drop in December?",
        "How are we tracking against budget across all four KPIs YTD?",
    ],
    "chargeable-hours": [
        "Why did chargeable hours drop in December?",
        "Which capability has the largest YTD chargeable hours gap to budget?",
        "Show monthly chargeable hours by capability for 2025.",
        "Which region is dragging chargeable hours below plan?",
    ],
    "rate-per-hour": [
        "Is rate per hour above or below budget by capability?",
        "Has rate per hour compressed in 2025 vs 2024?",
        "Which capability has the highest weighted hourly rate?",
        "Show rate per hour trend for the last 12 months.",
    ],
    "gross-fee-days": [
        "How are gross fee days tracking vs budget YTD?",
        "Which capability is delivering the most gross fee days in Q4?",
        "Compare gross fee days month over month for 2025.",
        "Show gross fee days by region for the current quarter.",
    ],
    "unbilled-days": [
        "Which capability has the highest unbilled days right now?",
        "How have unbilled days trended over the last 12 months?",
        "Where is the WIP risk concentrated by region?",
        "Are unbilled days within budget in the latest month?",
    ],
}

ContextKey = Literal[
    "overview", "chargeable-hours", "rate-per-hour", "gross-fee-days", "unbilled-days"
]


@router.get("/suggested-prompts")
async def suggested_prompts(context: ContextKey = Query("overview")) -> dict:
    return {
        "context": context,
        "prompts": SUGGESTED_PROMPTS.get(context, SUGGESTED_PROMPTS["overview"]),
    }


@router.post("/query")
async def nlp_query(request: Request, req: NLPQueryRequest):
    try:
        eff = effective_region(None, getattr(request.state, "persona", None))
        return await ask_genie(req.question, region=eff)
    except Exception as e:  # noqa: BLE001 — return 200 with error payload for UI
        return {
            "error": str(e),
            "question": req.question,
            "response": {
                "status": "error",
                "text": f"Request failed: {e}",
            },
        }


@router.post("/executive-summary")
async def executive_summary(request: Request, req: ExecSummaryRequest):
    try:
        eff = effective_region(req.region, getattr(request.state, "persona", None))
        return await generate_executive_summary(
            period_start=req.period_start,
            period_end=req.period_end,
            region=eff,
        )
    except Exception as e:
        return {"error": str(e), "summary": f"Summary unavailable: {e}"}
