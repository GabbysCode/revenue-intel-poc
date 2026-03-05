from fastapi import APIRouter, Query
from db.connection import query
from services.forecast_engine import run_forecast
from typing import Optional

router = APIRouter()


@router.get("/predict")
async def predict(
    horizon: int = Query(6, ge=1, le=24),
    model: str = Query("hybrid"),
    region: Optional[str] = Query(None),
    service_line: Optional[str] = Query(None),
):
    result = run_forecast(horizon=horizon, model_type=model, region=region, service_line=service_line)
    return result


@router.get("/accuracy")
async def forecast_accuracy():
    df = query("""
        SELECT
            model_version,
            AVG(ABS(forecast_revenue - actual_revenue) / NULLIF(actual_revenue, 0)) * 100 as mape,
            SQRT(AVG(POWER(forecast_revenue - actual_revenue, 2))) as rmse,
            COUNT(*) as n_predictions
        FROM fact_forecasts
        WHERE actual_revenue > 0
        GROUP BY model_version
    """)
    return {
        "models": [
            {
                "model": row["model_version"],
                "mape": round(row["mape"], 2),
                "rmse": round(row["rmse"], 2),
                "n_predictions": int(row["n_predictions"]),
            }
            for _, row in df.iterrows()
        ]
    }


@router.get("/history")
async def forecast_history(
    region: Optional[str] = Query(None),
    service_line: Optional[str] = Query(None),
):
    filters = []
    if region:
        filters.append(f"region_id = '{region}'")
    if service_line:
        filters.append(f"service_line_id = '{service_line}'")
    where = "WHERE " + " AND ".join(filters) if filters else ""

    df = query(f"""
        SELECT
            period,
            model_version,
            SUM(forecast_revenue) as forecast,
            SUM(actual_revenue) as actual
        FROM fact_forecasts
        {where}
        GROUP BY period, model_version
        ORDER BY period
    """)
    return {
        "history": [
            {
                "period": row["period"],
                "model": row["model_version"],
                "forecast": round(row["forecast"], 2),
                "actual": round(row["actual"], 2),
            }
            for _, row in df.iterrows()
        ]
    }
