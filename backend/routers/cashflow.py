from fastapi import APIRouter, Query
from db.connection import query
from typing import Optional

router = APIRouter()


@router.get("/waterfall")
async def cashflow_waterfall(
    period_start: str = Query("2025-01-01"),
    period_end: str = Query("2025-12-31"),
    region: Optional[str] = Query(None),
):
    region_filter = f"AND region_id = '{region}'" if region else ""
    df = query(f"""
        SELECT
            date,
            SUM(booked_revenue) as booked,
            SUM(recognized_revenue) as recognized,
            SUM(billed_amount) as billed,
            SUM(collected_amount) as collected,
            SUM(wip_balance) as wip,
            SUM(ar_balance) as ar
        FROM fact_revenue
        WHERE date >= '{period_start}' AND date <= '{period_end}'
        {region_filter}
        GROUP BY date
        ORDER BY date
    """)
    return {
        "waterfall": [
            {
                "date": row["date"],
                "booked": round(row["booked"], 2),
                "recognized": round(row["recognized"], 2),
                "billed": round(row["billed"], 2),
                "collected": round(row["collected"], 2),
                "wip": round(row["wip"], 2),
                "ar": round(row["ar"], 2),
            }
            for _, row in df.iterrows()
        ]
    }


@router.get("/dso")
async def dso_metrics(
    period_start: str = Query("2025-01-01"),
    period_end: str = Query("2025-12-31"),
    region: Optional[str] = Query(None),
):
    region_filter = f"AND region_id = '{region}'" if region else ""
    df = query(f"""
        SELECT
            SUM(ar_balance) as total_ar,
            SUM(billed_amount) as total_billed,
            CASE WHEN SUM(billed_amount) > 0
                 THEN ROUND(SUM(ar_balance) / (SUM(billed_amount) / 365.0), 1)
                 ELSE 0 END as dso_days
        FROM fact_revenue
        WHERE date >= '{period_start}' AND date <= '{period_end}'
        {region_filter}
    """)
    row = df.iloc[0]
    return {
        "dso_days": float(row["dso_days"]),
        "total_ar": round(float(row["total_ar"]), 2),
        "total_billed": round(float(row["total_billed"]), 2),
    }


@router.get("/ar-aging")
async def ar_aging(
    region: Optional[str] = Query(None),
):
    region_filter = f"WHERE r.region_id = '{region}'" if region else ""
    df = query(f"""
        SELECT
            s.name as service_line,
            SUM(r.ar_balance) as ar_balance,
            SUM(r.billed_amount) as billed,
            SUM(r.collected_amount) as collected
        FROM fact_revenue r
        JOIN dim_service_lines s ON r.service_line_id = s.service_line_id
        {region_filter}
        GROUP BY s.name
        ORDER BY ar_balance DESC
    """)

    total_ar = df["ar_balance"].sum()
    buckets = []
    for _, row in df.iterrows():
        buckets.append({
            "service_line": row["service_line"],
            "ar_balance": round(row["ar_balance"], 2),
            "billed": round(row["billed"], 2),
            "collected": round(row["collected"], 2),
            "pct_of_total": round(row["ar_balance"] / total_ar * 100, 1) if total_ar > 0 else 0,
        })
    return {"aging_buckets": buckets, "total_ar": round(total_ar, 2)}
