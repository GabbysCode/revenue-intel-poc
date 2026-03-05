from fastapi import APIRouter, Query
from db.connection import query

router = APIRouter()


@router.get("/versions")
async def list_versions():
    df = query("""
        SELECT DISTINCT
            version_id,
            version_date,
            COUNT(*) as record_count,
            SUM(booked_revenue) as total_revenue
        FROM fact_revenue_versions
        GROUP BY version_id, version_date
        ORDER BY version_id
    """)
    return {
        "versions": [
            {
                "version_id": int(row["version_id"]),
                "version_date": row["version_date"],
                "record_count": int(row["record_count"]),
                "total_revenue": round(row["total_revenue"], 2),
            }
            for _, row in df.iterrows()
        ]
    }


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
    df = query(f"""
        SELECT
            a.date,
            a.region_id,
            a.service_line_id,
            a.booked_revenue as v{v1}_revenue,
            b.booked_revenue as v{v2}_revenue,
            (b.booked_revenue - a.booked_revenue) as revenue_diff,
            CASE WHEN a.booked_revenue > 0
                 THEN ROUND((b.booked_revenue - a.booked_revenue) / a.booked_revenue * 100, 2)
                 ELSE 0 END as pct_change
        FROM fact_revenue_versions a
        JOIN fact_revenue_versions b
            ON a.date = b.date
            AND a.client_id = b.client_id
            AND a.service_line_id = b.service_line_id
        WHERE a.version_id = {v1} AND b.version_id = {v2}
        {region_filter}
        ORDER BY ABS(b.booked_revenue - a.booked_revenue) DESC
        LIMIT 200
    """)

    summary = query(f"""
        SELECT
            'v{v1}' as version,
            SUM(booked_revenue) as total_revenue,
            COUNT(*) as records
        FROM fact_revenue_versions WHERE version_id = {v1}
        UNION ALL
        SELECT
            'v{v2}' as version,
            SUM(booked_revenue) as total_revenue,
            COUNT(*) as records
        FROM fact_revenue_versions WHERE version_id = {v2}
    """)

    return {
        "v1": v1,
        "v2": v2,
        "summary": summary.to_dict(orient="records"),
        "differences": df.to_dict(orient="records"),
        "total_rows_compared": len(df),
    }
