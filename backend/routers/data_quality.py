from fastapi import APIRouter, Query
from db.connection import query
from typing import Optional

router = APIRouter()


@router.get("/report")
async def dq_report():
    latest = query("""
        SELECT
            table_name,
            check_name,
            passed,
            failed_count,
            details,
            timestamp
        FROM dq_audit_log
        WHERE timestamp = (SELECT MAX(timestamp) FROM dq_audit_log)
        ORDER BY table_name, check_name
    """)

    summary = query("""
        SELECT
            COUNT(*) as total_checks,
            SUM(CASE WHEN passed THEN 1 ELSE 0 END) as passed,
            SUM(CASE WHEN NOT passed THEN 1 ELSE 0 END) as failed,
            ROUND(SUM(CASE WHEN passed THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as score
        FROM dq_audit_log
        WHERE timestamp = (SELECT MAX(timestamp) FROM dq_audit_log)
    """)

    s = summary.iloc[0]
    return {
        "overall_score": float(s["score"]),
        "total_checks": int(s["total_checks"]),
        "passed": int(s["passed"]),
        "failed": int(s["failed"]),
        "checks": latest.to_dict(orient="records"),
    }


@router.get("/history")
async def dq_history(
    days: int = Query(90),
    table: Optional[str] = Query(None),
):
    table_filter = f"AND table_name = '{table}'" if table else ""
    df = query(f"""
        SELECT
            CAST(CAST(timestamp AS TIMESTAMP) AS DATE) as date,
            ROUND(SUM(CASE WHEN passed THEN 1 ELSE 0 END) * 100.0 / COUNT(*), 1) as score,
            COUNT(*) as total_checks,
            SUM(failed_count) as total_failures
        FROM dq_audit_log
        WHERE CAST(timestamp AS TIMESTAMP) >= CURRENT_DATE - INTERVAL '{days} days'
        {table_filter}
        GROUP BY CAST(CAST(timestamp AS TIMESTAMP) AS DATE)
        ORDER BY date
    """)
    return {
        "history": [
            {
                "date": str(row["date"]),
                "score": float(row["score"]),
                "total_checks": int(row["total_checks"]),
                "total_failures": int(row["total_failures"]),
            }
            for _, row in df.iterrows()
        ]
    }


@router.get("/anomalies")
async def dq_anomalies(
    limit: int = Query(50),
):
    df = query(f"""
        SELECT
            table_name,
            check_name,
            timestamp,
            failed_count,
            details
        FROM dq_audit_log
        WHERE NOT passed AND failed_count > 0
        ORDER BY timestamp DESC, failed_count DESC
        LIMIT {limit}
    """)
    return {"anomalies": df.to_dict(orient="records")}
