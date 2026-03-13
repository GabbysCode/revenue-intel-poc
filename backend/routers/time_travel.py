from fastapi import APIRouter, Query
from db.connection import query

router = APIRouter()


VERSION_LABELS = {
    1: "Q2 Close",
    2: "Q3 Restatement",
    3: "Year-End Adjustment",
}


@router.get("/versions")
async def list_versions():
    df = query("""
        SELECT
            version_id,
            version_date,
            COUNT(*) as record_count,
            SUM(booked_revenue) as total_revenue,
            AVG(margin_pct) as avg_margin,
            SUM(collected_amount) as total_collected
        FROM fact_revenue_versions
        GROUP BY version_id, version_date
        ORDER BY version_id
    """)
    versions = []
    prev_revenue = None
    for _, row in df.iterrows():
        vid = int(row["version_id"])
        total = round(row["total_revenue"], 2)
        delta_pct = round((total - prev_revenue) / prev_revenue * 100, 2) if prev_revenue else 0.0
        versions.append({
            "version_id": vid,
            "version_date": row["version_date"],
            "label": VERSION_LABELS.get(vid, f"Version {vid}"),
            "record_count": int(row["record_count"]),
            "total_revenue": total,
            "delta_pct": delta_pct,
            "avg_margin": round(float(row["avg_margin"]), 1),
            "total_collected": round(float(row["total_collected"]), 2),
        })
        prev_revenue = total
    return {"versions": versions}


@router.get("/query")
async def query_version(
    version: int = Query(...),
    table: str = Query("fact_revenue_versions"),
    region: str = Query(None),
    limit: int = Query(100),
):
    region_filter = f"AND region_id = '{region}'" if region else ""
    df = query(f"""
        SELECT date, client_id, service_line_id, region_id,
               booked_revenue, recognized_revenue, billed_amount,
               collected_amount, margin_pct
        FROM fact_revenue_versions
        WHERE version_id = {version}
        {region_filter}
        ORDER BY date DESC, booked_revenue DESC
        LIMIT {limit}
    """)
    return {
        "version": version,
        "row_count": len(df),
        "data": df.to_dict(orient="records"),
    }


@router.get("/diff")
async def diff_versions(
    v1: int = Query(...),
    v2: int = Query(...),
    region: str = Query(None),
):
    region_filter = f"AND a.region_id = '{region}'" if region else ""

    agg = query(f"""
        SELECT
            a.date,
            a.region_id,
            a.service_line_id,
            SUM(a.booked_revenue) as v1_revenue,
            SUM(b.booked_revenue) as v2_revenue,
            SUM(b.booked_revenue) - SUM(a.booked_revenue) as revenue_diff,
            CASE WHEN SUM(a.booked_revenue) > 0
                 THEN ROUND((SUM(b.booked_revenue) - SUM(a.booked_revenue)) / SUM(a.booked_revenue) * 100, 2)
                 ELSE 0 END as pct_change
        FROM fact_revenue_versions a
        JOIN fact_revenue_versions b
            ON a.date = b.date
            AND a.client_id = b.client_id
            AND a.service_line_id = b.service_line_id
            AND a.region_id = b.region_id
        WHERE a.version_id = {v1} AND b.version_id = {v2}
        {region_filter}
        GROUP BY a.date, a.region_id, a.service_line_id
        HAVING ABS(SUM(b.booked_revenue) - SUM(a.booked_revenue)) > 100
        ORDER BY ABS(SUM(b.booked_revenue) - SUM(a.booked_revenue)) DESC
        LIMIT 200
    """)

    totals = query(f"""
        SELECT
            SUM(CASE WHEN version_id = {v1} THEN booked_revenue ELSE 0 END) as v1_total,
            SUM(CASE WHEN version_id = {v2} THEN booked_revenue ELSE 0 END) as v2_total
        FROM fact_revenue_versions
        WHERE version_id IN ({v1}, {v2})
    """)

    v1_total = round(float(totals.iloc[0]["v1_total"] or 0), 2)
    v2_total = round(float(totals.iloc[0]["v2_total"] or 0), 2)

    rows = []
    for _, row in agg.iterrows():
        rows.append({
            "date": row["date"],
            "region_id": row["region_id"],
            "service_line_id": row["service_line_id"],
            "v1_revenue": round(float(row["v1_revenue"]), 2),
            "v2_revenue": round(float(row["v2_revenue"]), 2),
            "revenue_diff": round(float(row["revenue_diff"]), 2),
            "pct_change": round(float(row["pct_change"]), 2),
        })

    return {
        "v1": v1,
        "v2": v2,
        "v1_total_revenue": v1_total,
        "v2_total_revenue": v2_total,
        "delta": round(v2_total - v1_total, 2),
        "rows": rows,
        "total_rows_compared": len(rows),
    }
