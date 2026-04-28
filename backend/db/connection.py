import duckdb
import os

DB_PATH = os.path.join(os.path.dirname(__file__), "..", "data", "revintel.duckdb")

_conn: duckdb.DuckDBPyConnection | None = None

# Long-lived read-only handle so:
# - many parallel API requests and multiple uvicorn processes can all read
# - no long-lived R/W here (that would keep an exclusive file lock; a second
#   backend or reload process then fails with "Could not set lock" and 500s)
def get_conn() -> duckdb.DuckDBPyConnection:
    global _conn
    if _conn is None:
        _conn = duckdb.connect(DB_PATH, read_only=True)
    return _conn


_KPI_VIEWS_SQL = """
CREATE OR REPLACE VIEW vw_kpi_monthly AS
SELECT
    date_trunc('month', CAST(r.date AS DATE))                AS period,
    r.region_id,
    r.service_line_id,
    s.name                                                   AS service_line_name,
    SUM(COALESCE(r.chargeable_hours, 0))                     AS chargeable_hours,
    CASE
        WHEN SUM(COALESCE(r.chargeable_hours, 0)) > 0
        THEN SUM(COALESCE(r.chargeable_hours, 0) * COALESCE(r.hourly_rate, 0))
             / SUM(COALESCE(r.chargeable_hours, 0))
        ELSE 0
    END                                                      AS hourly_rate,
    SUM(COALESCE(r.gross_fee_days, 0))                       AS gross_fee_days,
    AVG(COALESCE(r.unbilled_days, 0))                        AS unbilled_days,
    SUM(COALESCE(r.budget_chargeable_hours, 0))              AS budget_chargeable_hours,
    CASE
        WHEN SUM(COALESCE(r.budget_chargeable_hours, 0)) > 0
        THEN SUM(COALESCE(r.budget_chargeable_hours, 0)
                 * COALESCE(r.budget_hourly_rate, 0))
             / SUM(COALESCE(r.budget_chargeable_hours, 0))
        ELSE 0
    END                                                      AS budget_hourly_rate,
    SUM(COALESCE(r.budget_gross_fee_days, 0))                AS budget_gross_fee_days,
    AVG(COALESCE(r.budget_unbilled_days, 0))                 AS budget_unbilled_days,
    SUM(COALESCE(r.booked_revenue, 0))                       AS booked_revenue,
    SUM(COALESCE(r.billed_amount, 0))                        AS billed_amount
FROM fact_revenue r
LEFT JOIN dim_service_lines s ON r.service_line_id = s.service_line_id
GROUP BY 1, 2, 3, 4;

CREATE OR REPLACE VIEW vw_kpi_summary AS
SELECT
    period,
    region_id,
    SUM(COALESCE(chargeable_hours, 0))                                AS chargeable_hours,
    CASE
        WHEN SUM(COALESCE(chargeable_hours, 0)) > 0
        THEN SUM(COALESCE(chargeable_hours, 0) * COALESCE(hourly_rate, 0))
             / SUM(COALESCE(chargeable_hours, 0))
        ELSE 0
    END                                                               AS hourly_rate,
    SUM(COALESCE(gross_fee_days, 0))                                  AS gross_fee_days,
    AVG(COALESCE(unbilled_days, 0))                                   AS unbilled_days,
    SUM(COALESCE(budget_chargeable_hours, 0))                         AS budget_chargeable_hours,
    CASE
        WHEN SUM(COALESCE(budget_chargeable_hours, 0)) > 0
        THEN SUM(COALESCE(budget_chargeable_hours, 0)
                 * COALESCE(budget_hourly_rate, 0))
             / SUM(COALESCE(budget_chargeable_hours, 0))
        ELSE 0
    END                                                               AS budget_hourly_rate,
    SUM(COALESCE(budget_gross_fee_days, 0))                           AS budget_gross_fee_days,
    AVG(COALESCE(budget_unbilled_days, 0))                            AS budget_unbilled_days,
    SUM(COALESCE(booked_revenue, 0))                                  AS booked_revenue,
    SUM(COALESCE(billed_amount, 0))                                   AS billed_amount
FROM vw_kpi_monthly
GROUP BY 1, 2;
"""


def init_db() -> None:
    """One-shot R/W open to create/seed/refresh KPI views, then close — never keep R/W for request handlers."""
    global _conn
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = duckdb.connect(DB_PATH)
    try:
        tables = conn.execute(
            "SELECT table_name FROM information_schema.tables WHERE table_schema='main'"
        ).fetchall()
        table_names = [t[0] for t in tables]
        if "fact_revenue" not in table_names:
            from synthetic.generate import generate_all
            from synthetic.seed import seed_database

            data = generate_all()
            seed_database(conn, data)
            print("Database seeded with synthetic data.")
        else:
            print(f"Database already contains {len(table_names)} tables.")
        # Always (re)create KPI views so schema changes propagate without a manual reseed.
        conn.execute(_KPI_VIEWS_SQL)
        print("KPI views ready: vw_kpi_monthly, vw_kpi_summary.")
    finally:
        conn.close()
        _conn = None


def query(sql: str, params=None):
    conn = get_conn()
    if params:
        return conn.execute(sql, params).fetchdf()
    return conn.execute(sql).fetchdf()
