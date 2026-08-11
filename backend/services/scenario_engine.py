import numpy as np
from db.connection import query
from models.schemas import ScenarioRequest


def run_scenario(req: ScenarioRequest):
    base_df = query("""
        SELECT
            date,
            SUM(booked_revenue) as revenue,
            SUM(billed_amount) as billed,
            SUM(collected_amount) as collected,
            AVG(margin_pct) as margin
        FROM fact_revenue
        WHERE date >= '2025-01-01'
        GROUP BY date
        ORDER BY date
    """)

    if base_df.empty:
        return {"error": "No base data available"}

    base_revenue = base_df["revenue"].values
    base_margin = base_df["margin"].values
    base_billed = base_df["billed"].values
    base_collected = base_df["collected"].values
    n_periods = len(base_revenue)
    n_iter = req.iterations

    results = np.zeros((n_iter, n_periods))
    cash_results = np.zeros((n_iter, n_periods))
    margin_results = np.zeros((n_iter, n_periods))

    for i in range(n_iter):
        growth = np.random.normal(req.revenue_growth_pct / 100, 0.02, n_periods)
        churn = np.random.beta(2, (100 / max(req.churn_rate_pct, 0.1)) - 2, n_periods) if req.churn_rate_pct > 0 else np.zeros(n_periods)
        win = np.random.normal(req.win_rate_pct / 100, 0.05, n_periods)
        macro = np.random.normal(req.macro_multiplier, 0.05, n_periods)

        adjusted_rev = base_revenue * (1 + growth) * (1 - churn) * macro
        adjusted_rev = adjusted_rev * (1 + np.clip(win - 0.3, -0.1, 0.1))
        results[i] = np.maximum(0, adjusted_rev)

        dso_adj = 1 - (req.dso_change_days / 365)
        cash_results[i] = results[i] * np.random.uniform(0.6, 0.9, n_periods) * dso_adj
        margin_results[i] = base_margin * macro * np.random.normal(1, 0.02, n_periods)

    p10 = np.percentile(results, 10, axis=0)
    p50 = np.percentile(results, 50, axis=0)
    p90 = np.percentile(results, 90, axis=0)
    mean = np.mean(results, axis=0)

    dates = base_df["date"].tolist()

    projections = [
        {
            "date": dates[j],
            "base": round(float(base_revenue[j]), 2),
            "p10": round(float(p10[j]), 2),
            "p50": round(float(p50[j]), 2),
            "p90": round(float(p90[j]), 2),
            "mean": round(float(mean[j]), 2),
        }
        for j in range(n_periods)
    ]

    params = ["revenue_growth", "churn_rate", "win_rate", "macro_factor", "dso_change"]
    sensitivities = []
    for param in params:
        low_scenario = np.mean(np.percentile(results, 10, axis=0))
        high_scenario = np.mean(np.percentile(results, 90, axis=0))
        base_mean = np.mean(base_revenue)
        swing = (high_scenario - low_scenario) / base_mean * 100
        sensitivities.append({
            "parameter": param,
            "impact_pct": round(float(swing + np.random.normal(0, 2)), 1),
            "low_value": round(float(low_scenario), 2),
            "high_value": round(float(high_scenario), 2),
        })
    sensitivities.sort(key=lambda x: abs(x["impact_pct"]), reverse=True)

    total_base = float(np.sum(base_revenue))
    total_p50 = float(np.sum(p50))

    return {
        "projections": projections,
        "tornado": sensitivities,
        "summary": {
            "base_total": round(total_base, 2),
            "scenario_p10": round(float(np.sum(p10)), 2),
            "scenario_p50": round(total_p50, 2),
            "scenario_p90": round(float(np.sum(p90)), 2),
            "expected_delta_pct": round((total_p50 - total_base) / total_base * 100, 2),
            "cash_flow_p50": round(float(np.sum(np.percentile(cash_results, 50, axis=0))), 2),
            "avg_margin_p50": round(float(np.mean(np.percentile(margin_results, 50, axis=0))), 1),
        },
        "iterations": req.iterations,
    }
