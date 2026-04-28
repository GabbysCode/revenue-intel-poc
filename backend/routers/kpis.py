"""Executive KPI router — Overview + four drill-downs.

The dashboard reads from `vw_kpi_summary` (region-rolled monthly grain) and
`vw_kpi_monthly` (region + capability monthly grain). Both views wrap every KPI
column in COALESCE so missing fact rows never blow up the API.

Sparkline contract (locked, plan §B-2):
    `sparkline` is always the trailing 12 calendar months ending at `period_end`,
    regardless of `view=ytd|current_month`. The toggle only affects the
    aggregates (`current`, `budget`, `prior_year`).
"""
from __future__ import annotations

from datetime import date as date_t
from typing import Any, Literal, Optional

from fastapi import APIRouter, HTTPException, Query, Request

from db.connection import query
from services.persona_scope import context_meta, effective_region

router = APIRouter()

KpiId = Literal["chargeable-hours", "rate-per-hour", "gross-fee-days", "unbilled-days"]

# All four KPIs the exec dashboard tracks. `column` is the column in the KPI
# views; `lower_is_better` flips the variance colouring (only `unbilled-days`
# wants red on growth).
KPIS: dict[str, dict[str, Any]] = {
    "chargeable-hours": {
        "column": "chargeable_hours",
        "budget_column": "budget_chargeable_hours",
        "label": "Chargeable Hours",
        "unit": "hours",
        "format": "compact",
        "lower_is_better": False,
        "aggregator": "sum",
    },
    "rate-per-hour": {
        "column": "hourly_rate",
        "budget_column": "budget_hourly_rate",
        "label": "Rate Per Hour",
        "unit": "currency",
        "format": "currency",
        "lower_is_better": False,
        # rate is already a per-hour weighted average in the views.
        "aggregator": "mean",
    },
    "gross-fee-days": {
        "column": "gross_fee_days",
        "budget_column": "budget_gross_fee_days",
        "label": "Gross Fee Days",
        "unit": "days",
        "format": "compact",
        "lower_is_better": False,
        "aggregator": "sum",
    },
    "unbilled-days": {
        "column": "unbilled_days",
        "budget_column": "budget_unbilled_days",
        "label": "Unbilled Days",
        "unit": "days",
        "format": "decimal",
        "lower_is_better": True,
        "aggregator": "mean",
    },
}


def _region_clause(region: Optional[str], alias: str = "") -> tuple[str, list[Any]]:
    if not region:
        return "", []
    col = f"{alias}.region_id" if alias else "region_id"
    return f" AND {col} = ?", [region]


def _resolve_period(
    view: str,
    period_start: Optional[str],
    period_end: Optional[str],
) -> tuple[date_t, date_t, date_t, date_t]:
    """Return (current_start, current_end, prior_start, prior_end) — all month-aligned."""
    end = date_t.fromisoformat(period_end) if period_end else date_t(2025, 12, 31)
    start = (
        date_t.fromisoformat(period_start)
        if period_start
        else date_t(end.year, 1, 1)
    )
    if view == "current_month":
        # Snap to the month containing period_end.
        cur_start = date_t(end.year, end.month, 1)
        cur_end = end
    else:  # ytd: from start of year to period_end (defaults already point there)
        cur_start = start
        cur_end = end
    # Prior year: same window, shifted back 12 months.
    prior_start = date_t(cur_start.year - 1, cur_start.month, cur_start.day)
    prior_end = date_t(cur_end.year - 1, cur_end.month, cur_end.day)
    return cur_start, cur_end, prior_start, prior_end


def _trailing_12_window(period_end: Optional[str]) -> tuple[date_t, date_t]:
    end = date_t.fromisoformat(period_end) if period_end else date_t(2025, 12, 31)
    end = date_t(end.year, end.month, 1)  # snap to first-of-month
    # 12 months inclusive → start = end shifted back 11 months
    yr = end.year - (1 if end.month <= 11 else 0)
    mo = end.month - 11
    if mo <= 0:
        mo += 12
    return date_t(yr, mo, 1), end


def _aggregate_value(
    rows: list[dict[str, Any]], column: str, kind: str
) -> Optional[float]:
    if not rows:
        return None
    vals = [float(r.get(column) or 0.0) for r in rows]
    if not vals:
        return None
    if kind == "mean":
        return sum(vals) / len(vals)
    return sum(vals)


def _percent_change(current: Optional[float], baseline: Optional[float]) -> Optional[float]:
    if current is None or baseline is None or abs(baseline) < 1e-9:
        return None
    return (current - baseline) / baseline * 100.0


def _capability_label(sl_id: str, name: Optional[str]) -> str:
    return name or sl_id


def _period_to_date_str(p: Any) -> str:
    """Normalize a DuckDB DATE / pandas Timestamp / str to YYYY-MM-DD for the wire."""
    if hasattr(p, "date"):
        return p.date().isoformat()
    if hasattr(p, "isoformat"):
        return p.isoformat()[:10]
    return str(p)[:10]


@router.get("/capabilities")
async def list_capabilities(request: Request) -> dict[str, Any]:
    """Capability dropdown source — driven by `dim_service_lines` so labels stay in sync with the seed."""
    df = query(
        "SELECT service_line_id AS id, name FROM dim_service_lines ORDER BY service_line_id"
    )
    return {
        "items": df.to_dict(orient="records"),
        "context": context_meta(request, None, None),
    }


@router.get("/summary")
async def kpi_summary(
    request: Request,
    view: Literal["ytd", "current_month"] = Query("ytd"),
    period_start: Optional[str] = Query(None),
    period_end: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    capability: Optional[str] = Query(None),
) -> dict[str, Any]:
    eff = effective_region(region, getattr(request.state, "persona", None))
    cur_start, cur_end, prior_start, prior_end = _resolve_period(view, period_start, period_end)
    spark_start, spark_end = _trailing_12_window(period_end or cur_end.isoformat())

    region_clause, region_params = _region_clause(eff)
    cap_clause = ""
    cap_params: list[Any] = []
    if capability:
        cap_clause = " AND service_line_id = ?"
        cap_params = [capability]

    # Source: capability filter forces `vw_kpi_monthly` (which carries
    # service_line_id); otherwise use the smaller `vw_kpi_summary`.
    if capability:
        base_view = "vw_kpi_monthly"
    else:
        base_view = "vw_kpi_summary"

    def _window_rows(start: date_t, end: date_t) -> list[dict[str, Any]]:
        sql = (
            f"SELECT * FROM {base_view} WHERE period >= CAST(? AS DATE) AND period <= CAST(? AS DATE)"
            f"{region_clause}{cap_clause}"
        )
        params = [start.isoformat(), end.isoformat(), *region_params, *cap_params]
        df = query(sql, params)
        return df.to_dict(orient="records") if not df.empty else []

    current_rows = _window_rows(cur_start, cur_end)
    prior_rows = _window_rows(prior_start, prior_end)

    # Locked sparkline window — always 12 months ending at period_end, regardless of `view`.
    sql_spark = (
        f"SELECT period AS period, "
        f"  SUM(COALESCE(chargeable_hours, 0))                              AS chargeable_hours, "
        f"  CASE WHEN SUM(COALESCE(chargeable_hours, 0)) > 0 "
        f"       THEN SUM(COALESCE(chargeable_hours, 0) * COALESCE(hourly_rate, 0)) "
        f"            / SUM(COALESCE(chargeable_hours, 0)) ELSE 0 END       AS hourly_rate, "
        f"  SUM(COALESCE(gross_fee_days, 0))                                AS gross_fee_days, "
        f"  AVG(COALESCE(unbilled_days, 0))                                 AS unbilled_days "
        f"FROM {base_view} WHERE period >= CAST(? AS DATE) AND period <= CAST(? AS DATE)"
        f"{region_clause}{cap_clause} GROUP BY period ORDER BY period"
    )
    spark_df = query(
        sql_spark,
        [spark_start.isoformat(), spark_end.isoformat(), *region_params, *cap_params],
    )
    spark_rows = spark_df.to_dict(orient="records") if not spark_df.empty else []

    summary: dict[str, Any] = {}
    for kpi_id, meta in KPIS.items():
        col = meta["column"]
        bcol = meta["budget_column"]
        kind = meta["aggregator"]
        current = _aggregate_value(current_rows, col, kind)
        budget = _aggregate_value(current_rows, bcol, kind)
        prior_year = _aggregate_value(prior_rows, col, kind)
        sparkline = [
            {"period": _period_to_date_str(r["period"]), "value": float(r.get(col) or 0.0)}
            for r in spark_rows
        ]
        summary[kpi_id] = {
            "label": meta["label"],
            "unit": meta["unit"],
            "format": meta["format"],
            "lower_is_better": meta["lower_is_better"],
            "current": current,
            "budget": budget,
            "prior_year": prior_year,
            "vs_budget_pct": _percent_change(current, budget),
            "vs_py_pct": _percent_change(current, prior_year),
            "sparkline": sparkline,
        }

    return {
        "view": view,
        "period": {
            "current_start": cur_start.isoformat(),
            "current_end": cur_end.isoformat(),
            "prior_start": prior_start.isoformat(),
            "prior_end": prior_end.isoformat(),
            "sparkline_start": spark_start.isoformat(),
            "sparkline_end": spark_end.isoformat(),
        },
        "filters": {"region": eff, "capability": capability},
        "context": context_meta(request, region, eff),
        "kpis": summary,
    }


@router.get("/{kpi_id}")
async def kpi_drilldown(
    kpi_id: str,
    request: Request,
    view: Literal["ytd", "current_month"] = Query("ytd"),
    period_start: Optional[str] = Query(None),
    period_end: Optional[str] = Query(None),
    region: Optional[str] = Query(None),
    capability: Optional[str] = Query(None),
) -> dict[str, Any]:
    if kpi_id not in KPIS:
        raise HTTPException(status_code=404, detail=f"Unknown KPI '{kpi_id}'")
    meta = KPIS[kpi_id]
    col = meta["column"]
    bcol = meta["budget_column"]
    kind = meta["aggregator"]

    eff = effective_region(region, getattr(request.state, "persona", None))
    cur_start, cur_end, _, _ = _resolve_period(view, period_start, period_end)
    spark_start, _ = _trailing_12_window(period_end or cur_end.isoformat())

    region_clause, region_params = _region_clause(eff)
    cap_clause = ""
    cap_params: list[Any] = []
    if capability:
        cap_clause = " AND service_line_id = ?"
        cap_params = [capability]

    # Trend — trailing 12 months at the requested grain.
    agg_expr = (
        f"AVG(COALESCE({col}, 0))"
        if kind == "mean"
        else f"SUM(COALESCE({col}, 0))"
    )
    bud_expr = (
        f"AVG(COALESCE({bcol}, 0))"
        if kind == "mean"
        else f"SUM(COALESCE({bcol}, 0))"
    )
    trend_sql = (
        f"SELECT period, {agg_expr} AS value, {bud_expr} AS budget "
        f"FROM vw_kpi_monthly WHERE period >= CAST(? AS DATE) AND period <= CAST(? AS DATE)"
        f"{region_clause}{cap_clause} GROUP BY period ORDER BY period"
    )
    trend_df = query(
        trend_sql,
        [spark_start.isoformat(), cur_end.isoformat(), *region_params, *cap_params],
    )
    trend = [
        {
            "period": _period_to_date_str(r["period"]),
            "value": float(r["value"] or 0.0),
            "budget": float(r["budget"] or 0.0),
        }
        for r in trend_df.to_dict(orient="records")
    ]

    # Capability breakdown — current period, all six service lines so the bar
    # chart never has gaps even when a capability is filtered out.
    cap_sql = (
        f"SELECT m.service_line_id AS id, "
        f"       MAX(m.service_line_name) AS name, "
        f"       {agg_expr.replace(col, 'm.' + col)} AS value, "
        f"       {bud_expr.replace(bcol, 'm.' + bcol)} AS budget "
        f"FROM vw_kpi_monthly m WHERE m.period >= CAST(? AS DATE) AND m.period <= CAST(? AS DATE)"
        f"{_region_clause(eff, 'm')[0]} GROUP BY m.service_line_id ORDER BY value DESC"
    )
    cap_df = query(
        cap_sql,
        [cur_start.isoformat(), cur_end.isoformat(), *region_params],
    )
    capability_breakdown = [
        {
            "id": r["id"],
            "name": _capability_label(r["id"], r.get("name")),
            "value": float(r["value"] or 0.0),
            "budget": float(r["budget"] or 0.0),
        }
        for r in cap_df.to_dict(orient="records")
    ]

    # YTD vs budget cumulative path so the chart can show the gap evolving.
    ytd_sql = (
        f"SELECT period, {agg_expr} AS value, {bud_expr} AS budget "
        f"FROM vw_kpi_monthly WHERE period >= CAST(? AS DATE) AND period <= CAST(? AS DATE)"
        f"{region_clause}{cap_clause} GROUP BY period ORDER BY period"
    )
    ytd_start = date_t(cur_end.year, 1, 1)
    ytd_df = query(
        ytd_sql,
        [ytd_start.isoformat(), cur_end.isoformat(), *region_params, *cap_params],
    )
    ytd_rows = ytd_df.to_dict(orient="records")
    ytd_vs_budget: list[dict[str, Any]] = []
    cum_actual = 0.0
    cum_budget = 0.0
    for r in ytd_rows:
        v = float(r["value"] or 0.0)
        b = float(r["budget"] or 0.0)
        if kind == "sum":
            cum_actual += v
            cum_budget += b
        else:  # mean: keep period-level value, no cumulation
            cum_actual = v
            cum_budget = b
        ytd_vs_budget.append({
            "period": _period_to_date_str(r["period"]),
            "actual": cum_actual,
            "budget": cum_budget,
        })

    return {
        "id": kpi_id,
        "label": meta["label"],
        "unit": meta["unit"],
        "format": meta["format"],
        "lower_is_better": meta["lower_is_better"],
        "view": view,
        "period": {
            "current_start": cur_start.isoformat(),
            "current_end": cur_end.isoformat(),
            "trend_start": spark_start.isoformat(),
            "trend_end": cur_end.isoformat(),
        },
        "filters": {"region": eff, "capability": capability},
        "trend": trend,
        "capability_breakdown": capability_breakdown,
        "ytd_vs_budget": ytd_vs_budget,
        "context": context_meta(request, region, eff),
    }
