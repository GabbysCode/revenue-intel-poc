#!/usr/bin/env python3
"""Lower-level uploader: reads a pickled `{table_name: DataFrame}` dict from
/tmp/revintel_data.pkl (or PICKLE_PATH) and pushes batches via the SQL
Statement API. Use this when you want to skip regenerating data from scratch.

All connection details are required from the environment — no defaults baked
in. See README.md → "Push synthetic data to Unity Catalog".
"""
import os
import pickle
import sys
import time

import requests

DATABRICKS_HOST = (os.environ.get("DATABRICKS_HOST") or "").rstrip("/")
DATABRICKS_TOKEN = os.environ.get("DATABRICKS_TOKEN", "")
WAREHOUSE_ID = os.environ.get("WAREHOUSE_ID", "")
TARGET_CATALOG = os.environ.get("UC_CATALOG", "revintel")
TARGET_SCHEMA = os.environ.get("UC_SCHEMA", "poc")
PICKLE_PATH = os.environ.get("PICKLE_PATH", "/tmp/revintel_data.pkl")

if not (DATABRICKS_HOST and DATABRICKS_TOKEN and WAREHOUSE_ID):
    sys.stderr.write(
        "ERROR: set DATABRICKS_HOST, DATABRICKS_TOKEN and WAREHOUSE_ID in your environment.\n"
    )
    sys.exit(2)

HEADERS = {"Authorization": f"Bearer {DATABRICKS_TOKEN}", "Content-Type": "application/json"}
SQL_URL = f"{DATABRICKS_HOST}/api/2.0/sql/statements/"
BATCH = 400

def run_sql(stmt):
    r = requests.post(SQL_URL, headers=HEADERS, json={"statement": stmt, "warehouse_id": WAREHOUSE_ID, "wait_timeout": "50s"})
    d = r.json()
    state = d.get("status",{}).get("state","")
    if state == "PENDING":
        sid = d.get("statement_id","")
        for _ in range(120):
            time.sleep(2)
            p = requests.get(f"{SQL_URL}{sid}", headers=HEADERS).json()
            state = p.get("status",{}).get("state","")
            if state in ("SUCCEEDED","FAILED","CANCELED","CLOSED"):
                if state != "SUCCEEDED":
                    print(f"    ERR: {p.get('status',{}).get('error',{}).get('message','?')}")
                    return False
                return True
    if state == "SUCCEEDED":
        return True
    print(f"    ERR: {d.get('status',{}).get('error',{}).get('message', d.get('message','?'))}")
    return False

def esc(v):
    if v is None: return "NULL"
    if isinstance(v, bool): return "TRUE" if v else "FALSE"
    if isinstance(v, (int,float)): return str(v)
    return "'" + str(v).replace("'","''") + "'"

SCHEMAS = {
    "dim_regions": "region_id STRING, name STRING",
    "dim_service_lines": "service_line_id STRING, name STRING",
    "dim_clients": "client_id STRING, name STRING, industry STRING, region_id STRING, tier STRING, acquisition_date STRING",
    "fact_revenue": "date STRING, client_id STRING, service_line_id STRING, region_id STRING, booked_revenue DOUBLE, recognized_revenue DOUBLE, billed_amount DOUBLE, collected_amount DOUBLE, wip_balance DOUBLE, ar_balance DOUBLE, margin_pct DOUBLE",
    "fact_pipeline": "opportunity_id STRING, client_id STRING, service_line_id STRING, region_id STRING, stage STRING, probability DOUBLE, expected_close STRING, deal_value DOUBLE",
    "fact_forecasts": "forecast_date STRING, period STRING, region_id STRING, service_line_id STRING, forecast_revenue DOUBLE, actual_revenue DOUBLE, model_version STRING",
    "dq_audit_log": "table_name STRING, check_name STRING, timestamp STRING, passed BOOLEAN, failed_count INT, details STRING",
    "fact_revenue_versions": "date STRING, client_id STRING, service_line_id STRING, region_id STRING, booked_revenue DOUBLE, recognized_revenue DOUBLE, billed_amount DOUBLE, collected_amount DOUBLE, wip_balance DOUBLE, ar_balance DOUBLE, margin_pct DOUBLE, version_id INT, version_date STRING",
}

ORDER = ["dim_regions","dim_service_lines","dim_clients","fact_revenue","fact_pipeline","fact_forecasts","dq_audit_log","fact_revenue_versions"]

with open(PICKLE_PATH, "rb") as f:
    data = pickle.load(f)

target = sys.argv[1] if len(sys.argv) > 1 else None

for tbl in ORDER:
    if target and tbl != target:
        continue
    df = data[tbl]
    cols = list(df.columns)
    full = f"{TARGET_CATALOG}.{TARGET_SCHEMA}.{tbl}"
    total = len(df)
    print(f"\n=== {full} ({total} rows) ===", flush=True)

    print("  Dropping...", flush=True)
    run_sql(f"DROP TABLE IF EXISTS {full}")
    print("  Creating...", flush=True)
    if not run_sql(f"CREATE TABLE {full} ({SCHEMAS[tbl]})"):
        sys.exit(1)

    for start in range(0, total, BATCH):
        end = min(start + BATCH, total)
        batch = df.iloc[start:end]
        vals = ", ".join("(" + ", ".join(esc(row[c]) for c in cols) + ")" for _, row in batch.iterrows())
        sql = f"INSERT INTO {full} ({', '.join(cols)}) VALUES {vals}"
        if not run_sql(sql):
            print(f"  FAILED at {start}-{end}", flush=True)
            sys.exit(1)
        pct = round(end/total*100)
        print(f"  {end}/{total} ({pct}%)", flush=True)

    print(f"  ✓ {full} done", flush=True)

print("\n✓ Upload complete!", flush=True)
