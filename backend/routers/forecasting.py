from fastapi import APIRouter, Query
from db.connection import query
from services.forecast_engine import run_forecast
from typing import Optional
import numpy as np

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


REGION_NAMES = {"R001": "Americas", "R002": "EMEA", "R003": "APAC", "R004": "UK"}
SL_NAMES = {
    "SL01": "Audit & Assurance", "SL02": "Tax & Legal", "SL03": "Advisory",
    "SL04": "Consulting", "SL05": "Risk & Compliance", "SL06": "Technology",
}


@router.get("/recommendations")
async def recommendations(
    region: Optional[str] = Query(None),
):
    region_filter = f"AND region_id = '{region}'" if region else ""
    actions = []

    # 1. Identify service line trends (H2 vs H1)
    sl_trend = query(f"""
        SELECT
            service_line_id,
            SUM(CASE WHEN date >= '2025-07-01' THEN booked_revenue ELSE 0 END) as recent,
            SUM(CASE WHEN date >= '2025-01-01' AND date < '2025-07-01' THEN booked_revenue ELSE 0 END) as prior
        FROM fact_revenue
        WHERE date >= '2025-01-01'
        {region_filter}
        GROUP BY service_line_id
    """)
    growth_lines = []
    for _, row in sl_trend.iterrows():
        if row["prior"] > 0:
            change_pct = (row["recent"] - row["prior"]) / row["prior"] * 100
            sl_name = SL_NAMES.get(row["service_line_id"], row["service_line_id"])
            if change_pct < -5:
                actions.append({
                    "priority": "high",
                    "category": "Revenue at Risk",
                    "title": f"{sl_name} revenue declining {abs(change_pct):.0f}%",
                    "description": f"{sl_name} dropped from ${row['prior']:,.0f} to ${row['recent']:,.0f} H1→H2. Review pipeline and client retention strategies.",
                    "metric": round(change_pct, 1),
                    "metric_label": "HoH change",
                })
            else:
                growth_lines.append((sl_name, change_pct, row["recent"]))

    growth_lines.sort(key=lambda x: x[1], reverse=True)
    if growth_lines:
        top = growth_lines[0]
        actions.append({
            "priority": "low",
            "category": "Growth Opportunity",
            "title": f"{top[0]} leading growth at +{top[1]:.0f}%",
            "description": f"{top[0]} reached ${top[2]:,.0f} in H2. Consider increasing staffing and capacity allocation to sustain momentum.",
            "metric": round(top[1], 1),
            "metric_label": "HoH change",
        })

    # 2. Collection risk per region
    coll = query(f"""
        SELECT
            region_id,
            SUM(billed_amount) as billed,
            SUM(collected_amount) as collected,
            SUM(ar_balance) as ar
        FROM fact_revenue
        WHERE date >= '2025-01-01'
        {region_filter}
        GROUP BY region_id
    """)
    worst_coll = None
    for _, row in coll.iterrows():
        if row["billed"] > 0:
            coll_rate = row["collected"] / row["billed"] * 100
            if worst_coll is None or coll_rate < worst_coll[1]:
                worst_coll = (row["region_id"], coll_rate, row["ar"])

    if worst_coll:
        region_name = REGION_NAMES.get(worst_coll[0], worst_coll[0])
        coll_rate = worst_coll[1]
        priority = "high" if coll_rate < 70 else "medium"
        actions.append({
            "priority": priority,
            "category": "Cash Flow Risk",
            "title": f"{region_name} collection rate at {coll_rate:.0f}%",
            "description": f"AR balance of ${worst_coll[2]:,.0f} in {region_name}. Escalate aged receivables and review credit terms for at-risk accounts.",
            "metric": round(coll_rate, 1),
            "metric_label": "Collection rate",
        })

    # 3. Margin analysis
    margin = query(f"""
        SELECT
            service_line_id,
            AVG(margin_pct) as avg_margin,
            MIN(margin_pct) as min_margin,
            MAX(margin_pct) as max_margin
        FROM fact_revenue
        WHERE date >= '2025-01-01'
        {region_filter}
        GROUP BY service_line_id
        ORDER BY avg_margin ASC
    """)
    if not margin.empty:
        worst = margin.iloc[0]
        sl_name = SL_NAMES.get(worst["service_line_id"], worst["service_line_id"])
        avg_m = float(worst["avg_margin"])
        spread = float(worst["max_margin"]) - float(worst["min_margin"])
        actions.append({
            "priority": "medium" if avg_m < 28 else "low",
            "category": "Margin Alert" if avg_m < 28 else "Margin Insight",
            "title": f"{sl_name} has lowest margin at {avg_m:.1f}%",
            "description": f"Margin ranges from {float(worst['min_margin']):.0f}% to {float(worst['max_margin']):.0f}% ({spread:.0f}pp spread). Review pricing strategy, utilization, and project staffing mix.",
            "metric": round(avg_m, 1),
            "metric_label": "Avg margin",
        })

    # 4. Forecast trend direction
    forecast_data = run_forecast(horizon=6, model_type="hybrid", region=region)
    fc = forecast_data.get("forecast", [])
    hist = forecast_data.get("historical", [])
    if len(fc) >= 2:
        first_rev = fc[0].get("revenue", 0)
        last_rev = fc[-1].get("revenue", 0)
        if first_rev > 0:
            fc_trend = (last_rev - first_rev) / first_rev * 100
            total_forecast = sum(f.get("revenue", 0) for f in fc)
            if fc_trend < -3:
                actions.append({
                    "priority": "high",
                    "category": "Forecast Warning",
                    "title": f"Forecast projects {abs(fc_trend):.0f}% revenue decline",
                    "description": f"6-month forecast totals ${total_forecast:,.0f}, trending from ${first_rev:,.0f}/mo to ${last_rev:,.0f}/mo. Accelerate pipeline conversion and review win rates.",
                    "metric": round(fc_trend, 1),
                    "metric_label": "6-mo trend",
                })
            else:
                actions.append({
                    "priority": "low",
                    "category": "Growth Signal",
                    "title": f"Forecast projects +{fc_trend:.0f}% revenue growth",
                    "description": f"6-month forecast totals ${total_forecast:,.0f}, growing from ${first_rev:,.0f}/mo to ${last_rev:,.0f}/mo. Ensure delivery capacity scales to meet demand.",
                    "metric": round(fc_trend, 1),
                    "metric_label": "6-mo trend",
                })

    # 5. Forecast confidence width
    if len(fc) >= 1:
        last_fc = fc[-1]
        u95 = last_fc.get("upper_95", 0)
        l95 = last_fc.get("lower_95", 0)
        mid = last_fc.get("revenue", 1)
        if mid > 0:
            uncertainty = (u95 - l95) / mid * 100
            if uncertainty > 30:
                actions.append({
                    "priority": "medium",
                    "category": "Forecast Uncertainty",
                    "title": f"Confidence band widening to ±{uncertainty/2:.0f}%",
                    "description": f"The 95% confidence interval for month 6 spans ${l95:,.0f} to ${u95:,.0f}. High variance in recent data. Consider shorter planning horizons or scenario analysis.",
                    "metric": round(uncertainty, 1),
                    "metric_label": "Band width",
                })

    # 6. Pipeline coverage
    pipe = query(f"""
        SELECT SUM(deal_value * probability) as weighted_pipeline
        FROM fact_pipeline
        WHERE stage NOT IN ('Closed Won', 'Closed Lost')
        {"AND region_id = '" + region + "'" if region else ""}
    """)
    recent_rev = query(f"""
        SELECT SUM(booked_revenue) / 3 as monthly_avg
        FROM fact_revenue
        WHERE date >= '2025-10-01'
        {region_filter}
    """)
    if not pipe.empty and not recent_rev.empty:
        wp = float(pipe.iloc[0]["weighted_pipeline"] or 0)
        monthly = float(recent_rev.iloc[0]["monthly_avg"] or 1)
        coverage = wp / (monthly * 6) if monthly > 0 else 0
        if coverage < 1.0:
            actions.append({
                "priority": "high",
                "category": "Pipeline Gap",
                "title": f"Pipeline coverage at {coverage:.1f}x (target: 2.0x)",
                "description": f"Weighted pipeline of ${wp:,.0f} covers only {coverage:.1f}x of the next 6 months' projected revenue. Increase business development activity.",
                "metric": round(coverage, 2),
                "metric_label": "Coverage ratio",
            })
        else:
            actions.append({
                "priority": "low" if coverage >= 2.0 else "medium",
                "category": "Pipeline Health",
                "title": f"Pipeline coverage at {coverage:.1f}x",
                "description": f"Weighted pipeline of ${wp:,.0f} provides {coverage:.1f}x coverage against 6-month target. {'Strong position — focus on conversion velocity.' if coverage >= 2.0 else 'Below 2.0x target — ramp prospecting.'}",
                "metric": round(coverage, 2),
                "metric_label": "Coverage ratio",
            })

    priority_order = {"high": 0, "medium": 1, "low": 2}
    actions.sort(key=lambda a: priority_order.get(a["priority"], 99))

    return {"recommendations": actions}
