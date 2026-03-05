from fastapi import APIRouter
from models.schemas import NLPQueryRequest, ExecSummaryRequest
from services.genie_engine import ask_genie, generate_executive_summary

router = APIRouter()


@router.post("/query")
async def nlp_query(req: NLPQueryRequest):
    result = await ask_genie(req.question)
    return result


@router.post("/executive-summary")
async def executive_summary(req: ExecSummaryRequest):
    result = await generate_executive_summary(
        period_start=req.period_start,
        period_end=req.period_end,
        region=req.region,
    )
    return result
