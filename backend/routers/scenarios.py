from fastapi import APIRouter
from models.schemas import ScenarioRequest
from services.scenario_engine import run_scenario

router = APIRouter()


@router.post("/run")
async def run_scenario_endpoint(req: ScenarioRequest):
    result = run_scenario(req)
    return result
