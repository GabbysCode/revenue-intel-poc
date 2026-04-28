#!/usr/bin/env python3
"""Upload local synthetic data to Databricks Unity Catalog via SQL Statement API."""

import os
import sys
import json
import time
import requests

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "..", "backend"))
from synthetic.generate import generate_all

DATABRICKS_HOST = (os.environ.get("DATABRICKS_HOST") or "").rstrip("/")
DATABRICKS_TOKEN = os.environ.get("DATABRICKS_TOKEN", "")
WAREHOUSE_ID = os.environ.get("WAREHOUSE_ID", "")
TARGET_CATALOG = os.environ.get("UC_CATALOG", "revintel")
TARGET_SCHEMA = os.environ.get("UC_SCHEMA", "poc")

if not (DATABRICKS_HOST and DATABRICKS_TOKEN and WAREHOUSE_ID):
    sys.stderr.write(
        "ERROR: set DATABRICKS_HOST, DATABRICKS_TOKEN and WAREHOUSE_ID in your environment.\n"
        "       (Optional: UC_CATALOG, UC_SCHEMA — default to revintel.poc.)\n"
    )
    sys.exit(2)

HEADERS = {
    "Authorization": f"Bearer {DATABRICKS_TOKEN}",
    "Content-Type": "application/json",
}
SQL_URL = f"{DATABRICKS_HOST}/api/2.0/sql/statements/"

BATCH_SIZE = 500


def run_sql(statement, wait="50s"):
    resp = requests.post(SQL_URL, headers=HEADERS, json={
        "statement": statement,
        "warehouse_id": WAREHOUSE_ID,
        "wait_timeout": wait,
    })
    data = resp.json()
    state = data.get("status", {}).get("state", "")

    if state == "PENDING":
        stmt_id = data.get("statement_id", "")
        for _ in range(60):
            time.sleep(2)
            poll = requests.get(f"{SQL_URL}{stmt_id}", headers=HEADERS).json()
            state = poll.get("status", {}).get("state", "")
            if state in ("SUCCEEDED", "FAILED", "CANCELED", "CLOSED"):
                break
        if state != "SUCCEEDED":
            err = poll.get("status", {}).get("error", {}).get("message", "Unknown")
            print(f"  FAILED: {err}")
            return False

    if state == "SUCCEEDED":
        return True

    err = data.get("status", {}).get("error", {}).get("message", "")
    if not err:
        err = data.get("message", str(data))
    print(f"  FAILED: {err}")
    return False


def escape(val):
    if val is None:
        return "NULL"
    if isinstance(val, bool):
        return "TRUE" if val else "FALSE"
    if isinstance(val, (int, float)):
        return str(val)
    s = str(val).replace("'", "''").replace("\\", "\\\\")
    return f"'{s}'"


def upload_table(table_name, df, schema):
    full_name = f"{TARGET_CATALOG}.{TARGET_SCHEMA}.{table_name}"
    cols = list(df.columns)

    print(f"\n--- {full_name} ({len(df)} rows) ---")

    # Drop and create
    run_sql(f"DROP TABLE IF EXISTS {full_name}")
    col_defs = ", ".join(f"{c} {schema[c]}" for c in cols)
    if not run_sql(f"CREATE TABLE {full_name} ({col_defs})"):
        return False

    # Insert in batches
    total = len(df)
    for start in range(0, total, BATCH_SIZE):
        end = min(start + BATCH_SIZE, total)
        batch = df.iloc[start:end]

        values_list = []
        for _, row in batch.iterrows():
            vals = ", ".join(escape(row[c]) for c in cols)
            values_list.append(f"({vals})")

        sql = f"INSERT INTO {full_name} ({', '.join(cols)}) VALUES {', '.join(values_list)}"
        if not run_sql(sql):
            print(f"  Failed at batch {start}-{end}")
            return False

        pct = round(end / total * 100)
        print(f"  Inserted {end}/{total} ({pct}%)")

    print(f"  ✓ {full_name} complete")
    return True


TABLE_SCHEMAS = {
    "dim_regions": {
        "region_id": "STRING",
        "name": "STRING",
    },
    "dim_service_lines": {
        "service_line_id": "STRING",
        "name": "STRING",
    },
    "dim_clients": {
        "client_id": "STRING",
        "name": "STRING",
        "industry": "STRING",
        "region_id": "STRING",
        "tier": "STRING",
        "acquisition_date": "STRING",
    },
    "fact_revenue": {
        "date": "STRING",
        "client_id": "STRING",
        "service_line_id": "STRING",
        "region_id": "STRING",
        "booked_revenue": "DOUBLE",
        "recognized_revenue": "DOUBLE",
        "billed_amount": "DOUBLE",
        "collected_amount": "DOUBLE",
        "wip_balance": "DOUBLE",
        "ar_balance": "DOUBLE",
        "margin_pct": "DOUBLE",
    },
    "fact_pipeline": {
        "opportunity_id": "STRING",
        "client_id": "STRING",
        "service_line_id": "STRING",
        "region_id": "STRING",
        "stage": "STRING",
        "probability": "DOUBLE",
        "expected_close": "STRING",
        "deal_value": "DOUBLE",
    },
    "fact_forecasts": {
        "forecast_date": "STRING",
        "period": "STRING",
        "region_id": "STRING",
        "service_line_id": "STRING",
        "forecast_revenue": "DOUBLE",
        "actual_revenue": "DOUBLE",
        "model_version": "STRING",
    },
    "dq_audit_log": {
        "table_name": "STRING",
        "check_name": "STRING",
        "timestamp": "STRING",
        "passed": "BOOLEAN",
        "failed_count": "INT",
        "details": "STRING",
    },
    "fact_revenue_versions": {
        "date": "STRING",
        "client_id": "STRING",
        "service_line_id": "STRING",
        "region_id": "STRING",
        "booked_revenue": "DOUBLE",
        "recognized_revenue": "DOUBLE",
        "billed_amount": "DOUBLE",
        "collected_amount": "DOUBLE",
        "wip_balance": "DOUBLE",
        "ar_balance": "DOUBLE",
        "margin_pct": "DOUBLE",
        "version_id": "INT",
        "version_date": "STRING",
    },
}

UPLOAD_ORDER = [
    "dim_regions",
    "dim_service_lines",
    "dim_clients",
    "fact_revenue",
    "fact_pipeline",
    "fact_forecasts",
    "dq_audit_log",
    "fact_revenue_versions",
]


def main():
    print("=== Databricks Unity Catalog Upload ===\n")
    print("Generating synthetic data locally...")
    data = generate_all()
    print()

    for table_name in UPLOAD_ORDER:
        df = data[table_name]
        schema = TABLE_SCHEMAS[table_name]
        if not upload_table(table_name, df, schema):
            print(f"\n✗ Failed on {table_name}. Stopping.")
            sys.exit(1)

    print(f"\n\n=== All 8 tables uploaded to {TARGET_CATALOG}.{TARGET_SCHEMA} ===")
    print("Genie Space should now resolve all tables.")


if __name__ == "__main__":
    main()
