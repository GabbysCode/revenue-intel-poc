from pydantic import BaseModel
from typing import Optional


class ScenarioRequest(BaseModel):
    revenue_growth_pct: float = 0.0
    dso_change_days: float = 0.0
    churn_rate_pct: float = 5.0
    win_rate_pct: float = 30.0
    macro_multiplier: float = 1.0
    service_line_mix: Optional[dict[str, float]] = None
    iterations: int = 1000


class NLPQueryRequest(BaseModel):
    question: str


class ExecSummaryRequest(BaseModel):
    period_start: str
    period_end: str
    region: Optional[str] = None
