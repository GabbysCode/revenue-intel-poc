from fastapi import APIRouter, Query, Request
from typing import Optional

from ..db.connection import query
from ..services.persona_scope import effective_region, context_meta

router = APIRouter()


@router.get("/kpis")
async def get_kpis(
    request: Request,
    region: Optional[str] = Query(None),
    period_start: str = Query("2025-01-01"),
    period_end: str = Query("2025-12-31"),
):
    persona = getattr(request.state, "persona", None)
    eff = effective_region(region, persona)
    region_filter = f"AND region_id = '{eff}'" if eff else ""

    current = query(f"""
        SELECT
            SUM(booked_revenue) as revenue,
            SUM(billed_amount) as billed,
            SUM(collected_amount) as collected,
            COUNT(*) as total_orders,
            AVG(margin_pct) as avg_margin,
            SUM(ar_balance) as ar_balance,
            SUM(wip_balance) as wip_balance
        FROM fact_revenue
        WHERE date >= '{period_start}' AND date <= '{period_end}'
        {region_filter}
    """)

    prev_start = str(int(period_start[:4]) - 1) + period_start[4:]
    prev_end = str(int(period_end[:4]) - 1) + period_end[4:]
    previous = query(f"""
        SELECT
            SUM(booked_revenue) as revenue,
            SUM(billed_amount) as billed,
            SUM(collected_amount) as collected,
            COUNT(*) as total_orders,
            AVG(margin_pct) as avg_margin,
            SUM(ar_balance) as ar_balance,
            SUM(wip_balance) as wip_balance
        FROM fact_revenue
        WHERE date >= '{prev_start}' AND date <= '{prev_end}'
        {region_filter}
    """)

    def delta_pct(curr, prev):
        if prev and prev > 0:
            return round(((curr - prev) / prev) * 100, 2)
        return 0.0

    c = current.iloc[0]
    p = previous.iloc[0]

    return {
        "context": context_meta(request, region, eff),
        "kpis": [
            {"label": "Revenue", "value": round(c["revenue"] or 0, 2), "delta": delta_pct(c["revenue"] or 0, p["revenue"] or 0), "prefix": "$"},
            {"label": "Avg Margin", "value": round(c["avg_margin"] or 0, 1), "delta": delta_pct(c["avg_margin"] or 0, p["avg_margin"] or 0), "suffix": "%"},
            {"label": "Billed", "value": round(c["billed"] or 0, 2), "delta": delta_pct(c["billed"] or 0, p["billed"] or 0), "prefix": "$"},
            {"label": "Collected", "value": round(c["collected"] or 0, 2), "delta": delta_pct(c["collected"] or 0, p["collected"] or 0), "prefix": "$"},
            {"label": "Total Orders", "value": int(c["total_orders"] or 0), "delta": delta_pct(c["total_orders"] or 0, p["total_orders"] or 0)},
            {"label": "AR Balance", "value": round(c["ar_balance"] or 0, 2), "delta": delta_pct(c["ar_balance"] or 0, p["ar_balance"] or 0), "prefix": "$"},
            {"label": "WIP Balance", "value": round(c["wip_balance"] or 0, 2), "delta": delta_pct(c["wip_balance"] or 0, p["wip_balance"] or 0), "prefix": "$"},
            {"label": "Collections Rate", "value": round((c["collected"] / c["billed"] * 100) if c["billed"] else 0, 1), "delta": delta_pct(
                (c["collected"] / c["billed"] * 100) if c["billed"] else 0,
                (p["collected"] / p["billed"] * 100) if p["billed"] else 0,
            ), "suffix": "%"},
        ],
    }


@router.get("/revenue-trend")
async def get_revenue_trend(
    request: Request,
    granularity: str = Query("month"),
    region: Optional[str] = Query(None),
):
    eff = effective_region(region, getattr(request.state, "persona", None))
    region_filter = f"AND region_id = '{eff}'" if eff else ""
    df = query(f"""
        SELECT
            date,
            SUM(booked_revenue) as revenue,
            SUM(collected_amount) as collected
        FROM fact_revenue
        WHERE date >= '2024-01-01'
        {region_filter}
        GROUP BY date
        ORDER BY date
    """)
    return {
        "context": context_meta(request, region, eff),
        "trend": [
            {
                "date": row["date"],
                "revenue": round(row["revenue"], 2),
                "collected": round(row["collected"], 2),
            }
            for _, row in df.iterrows()
        ],
    }


@router.get("/attribution")
async def get_attribution(
    request: Request,
    period_start: str = Query("2025-01-01"),
    period_end: str = Query("2025-12-31"),
    region: Optional[str] = Query(None),
):
    eff = effective_region(region, getattr(request.state, "persona", None))
    region_filter = f"AND r.region_id = '{eff}'" if eff else ""
    df = query(f"""
        SELECT
            s.name as service_line,
            SUM(r.booked_revenue) as revenue,
            COUNT(*) as order_count
        FROM fact_revenue r
        JOIN dim_service_lines s ON r.service_line_id = s.service_line_id
        WHERE r.date >= '{period_start}' AND r.date <= '{period_end}'
        {region_filter}
        GROUP BY s.name
        ORDER BY revenue DESC
    """)
    total = float(df["revenue"].sum()) if not df.empty else 0.0
    return {
        "context": context_meta(request, region, eff),
        "attribution": [
            {
                "service_line": row["service_line"],
                "revenue": round(float(row["revenue"]), 2),
                "percentage": round(float(row["revenue"]) / total * 100, 1) if total > 0 else 0,
                "order_count": int(row["order_count"]),
            }
            for _, row in df.iterrows()
        ],
        "total_revenue": round(total, 2),
    }
