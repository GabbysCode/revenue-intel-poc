# Databricks notebook source
# MAGIC %md
# MAGIC # RevIntel POC — Unity Catalog Setup
# MAGIC Run all cells to create the `revintel.poc` schema and seed all 8 tables.

# COMMAND ----------

# Create catalog and schema
spark.sql("CREATE CATALOG IF NOT EXISTS revintel")
spark.sql("CREATE SCHEMA IF NOT EXISTS revintel.poc")
spark.sql("USE CATALOG revintel")
spark.sql("USE SCHEMA poc")
print("✓ Catalog and schema ready: revintel.poc")

# COMMAND ----------

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
import uuid

np.random.seed(42)

REGIONS = [
    {"region_id": "R001", "name": "Americas"},
    {"region_id": "R002", "name": "EMEA"},
    {"region_id": "R003", "name": "APAC"},
    {"region_id": "R004", "name": "UK"},
]

SERVICE_LINES = [
    {"service_line_id": "SL01", "name": "Audit & Assurance"},
    {"service_line_id": "SL02", "name": "Tax & Legal"},
    {"service_line_id": "SL03", "name": "Advisory"},
    {"service_line_id": "SL04", "name": "Consulting"},
    {"service_line_id": "SL05", "name": "Risk & Compliance"},
    {"service_line_id": "SL06", "name": "Technology"},
]

INDUSTRIES = [
    "Financial Services", "Healthcare", "Technology", "Energy",
    "Manufacturing", "Retail", "Government", "Telecommunications",
    "Real Estate", "Media & Entertainment",
]

TIERS = ["Platinum", "Gold", "Silver", "Bronze"]

PIPELINE_STAGES = [
    {"stage": "Prospect", "probability": 0.10},
    {"stage": "Qualification", "probability": 0.25},
    {"stage": "Proposal", "probability": 0.50},
    {"stage": "Negotiation", "probability": 0.75},
    {"stage": "Closed Won", "probability": 1.00},
    {"stage": "Closed Lost", "probability": 0.00},
]

SEASONAL_FACTORS = {
    "SL01": [1.3, 1.1, 0.8, 0.7, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.4],
    "SL02": [0.9, 1.0, 1.3, 1.4, 1.2, 0.8, 0.7, 0.8, 0.9, 1.0, 1.0, 0.9],
    "SL03": [1.0, 1.0, 1.0, 1.1, 1.1, 1.0, 0.9, 0.9, 1.0, 1.1, 1.1, 1.0],
    "SL04": [0.8, 0.9, 1.0, 1.1, 1.1, 1.2, 1.1, 0.9, 1.0, 1.1, 1.0, 0.9],
    "SL05": [1.1, 1.0, 1.0, 1.0, 0.9, 0.9, 1.0, 1.0, 1.1, 1.1, 1.2, 1.1],
    "SL06": [0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.2, 1.1, 1.0, 1.0, 1.1, 1.0],
}

REGION_WEIGHTS = {"R001": 0.40, "R002": 0.25, "R003": 0.15, "R004": 0.20}
SL_BASE_REVENUE = {"SL01": 5000, "SL02": 4000, "SL03": 3500, "SL04": 4500, "SL05": 2500, "SL06": 3000}

print("✓ Constants defined")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 1. dim_regions

# COMMAND ----------

df_regions = spark.createDataFrame(pd.DataFrame(REGIONS))
df_regions.write.mode("overwrite").saveAsTable("revintel.poc.dim_regions")
print(f"✓ dim_regions: {df_regions.count()} rows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 2. dim_service_lines

# COMMAND ----------

df_sl = spark.createDataFrame(pd.DataFrame(SERVICE_LINES))
df_sl.write.mode("overwrite").saveAsTable("revintel.poc.dim_service_lines")
print(f"✓ dim_service_lines: {df_sl.count()} rows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 3. dim_clients

# COMMAND ----------

from faker import Faker
fake = Faker()
Faker.seed(42)

clients = []
for i in range(500):
    region = np.random.choice(REGIONS, p=[0.35, 0.30, 0.15, 0.20])
    tier = np.random.choice(TIERS, p=[0.05, 0.15, 0.35, 0.45])
    clients.append({
        "client_id": f"C{i+1:04d}",
        "name": fake.company(),
        "industry": np.random.choice(INDUSTRIES),
        "region_id": region["region_id"],
        "tier": tier,
        "acquisition_date": fake.date_between(start_date="-8y", end_date="-1y").isoformat(),
    })

clients_pdf = pd.DataFrame(clients)
df_clients = spark.createDataFrame(clients_pdf)
df_clients.write.mode("overwrite").saveAsTable("revintel.poc.dim_clients")
print(f"✓ dim_clients: {df_clients.count()} rows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 4. fact_revenue

# COMMAND ----------

dates = pd.date_range("2023-01-01", "2025-12-31", freq="MS")
rev_rows = []
for date in dates:
    month_idx = date.month - 1
    for _, client in clients_pdf.iterrows():
        n_services = np.random.choice([1, 2, 3], p=[0.5, 0.35, 0.15])
        chosen_sls = np.random.choice(SERVICE_LINES, size=n_services, replace=False)
        for sl in chosen_sls:
            sl_id = sl["service_line_id"]
            tier_mult = {"Platinum": 4.0, "Gold": 2.5, "Silver": 1.5, "Bronze": 1.0}[client["tier"]]
            region_mult = REGION_WEIGHTS.get(client["region_id"], 1.0) * 2.5
            seasonal = SEASONAL_FACTORS[sl_id][month_idx]
            base = SL_BASE_REVENUE[sl_id] * tier_mult * region_mult * seasonal
            noise = np.random.normal(1.0, 0.15)
            booked = max(0, base * noise)

            recognition_lag = np.random.uniform(0.7, 1.0)
            billing_lag = np.random.uniform(0.6, 0.95)

            quarter = (date.month - 1) // 3
            year_drift = (date.year - 2023) * 0.04
            q_center = [0.82, 0.72, 0.60, 0.50][quarter] - year_drift
            collection_rate = float(np.clip(np.random.normal(q_center, 0.08), 0.25, 0.95))
            margin = np.random.uniform(0.15, 0.45)

            rev_rows.append({
                "date": date.strftime("%Y-%m-%d"),
                "client_id": client["client_id"],
                "service_line_id": sl_id,
                "region_id": client["region_id"],
                "booked_revenue": round(float(booked), 2),
                "recognized_revenue": round(float(booked * recognition_lag), 2),
                "billed_amount": round(float(booked * billing_lag), 2),
                "collected_amount": round(float(booked * billing_lag * collection_rate), 2),
                "wip_balance": round(float(booked * (1 - billing_lag)), 2),
                "ar_balance": round(float(booked * billing_lag * (1 - collection_rate)), 2),
                "margin_pct": round(float(margin * 100), 1),
            })

revenue_pdf = pd.DataFrame(rev_rows)
df_revenue = spark.createDataFrame(revenue_pdf)
df_revenue.write.mode("overwrite").saveAsTable("revintel.poc.fact_revenue")
print(f"✓ fact_revenue: {df_revenue.count()} rows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 5. fact_pipeline

# COMMAND ----------

pipe_rows = []
for _ in range(2000):
    client = clients_pdf.sample(1).iloc[0]
    stage_info = np.random.choice(PIPELINE_STAGES)
    sl = np.random.choice(SERVICE_LINES)
    deal_value = float(np.random.lognormal(mean=10, sigma=1.2))
    pipe_rows.append({
        "opportunity_id": str(uuid.uuid4())[:12],
        "client_id": client["client_id"],
        "service_line_id": sl["service_line_id"],
        "region_id": client["region_id"],
        "stage": stage_info["stage"],
        "probability": float(stage_info["probability"]),
        "expected_close": fake.date_between(start_date="today", end_date="+12m").isoformat(),
        "deal_value": round(deal_value, 2),
    })

df_pipeline = spark.createDataFrame(pd.DataFrame(pipe_rows))
df_pipeline.write.mode("overwrite").saveAsTable("revintel.poc.fact_pipeline")
print(f"✓ fact_pipeline: {df_pipeline.count()} rows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 6. fact_forecasts

# COMMAND ----------

fc_rows = []
forecast_dates = pd.date_range("2024-01-01", "2025-12-01", freq="MS")
for fd in forecast_dates:
    for region in REGIONS:
        for sl in SERVICE_LINES:
            mask = (
                (revenue_pdf["region_id"] == region["region_id"]) &
                (revenue_pdf["service_line_id"] == sl["service_line_id"]) &
                (revenue_pdf["date"] == fd.strftime("%Y-%m-%d"))
            )
            actual = float(revenue_pdf.loc[mask, "booked_revenue"].sum())
            for model_v in ["prophet_v1", "xgboost_v1", "hybrid_v1"]:
                bias = {"prophet_v1": 0.03, "xgboost_v1": -0.02, "hybrid_v1": 0.005}[model_v]
                noise = float(np.random.normal(bias, 0.08))
                forecast = actual * (1 + noise) if actual > 0 else 0
                fc_rows.append({
                    "forecast_date": fd.strftime("%Y-%m-%d"),
                    "period": fd.strftime("%Y-%m"),
                    "region_id": region["region_id"],
                    "service_line_id": sl["service_line_id"],
                    "forecast_revenue": round(max(0, forecast), 2),
                    "actual_revenue": round(actual, 2),
                    "model_version": model_v,
                })

df_forecasts = spark.createDataFrame(pd.DataFrame(fc_rows))
df_forecasts.write.mode("overwrite").saveAsTable("revintel.poc.fact_forecasts")
print(f"✓ fact_forecasts: {df_forecasts.count()} rows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 7. dq_audit_log

# COMMAND ----------

dq_rows = []
tables = ["fact_revenue", "fact_pipeline", "dim_clients"]
checks = ["null_check", "range_check", "freshness_check", "duplicate_check", "schema_check"]
dq_dates = pd.date_range("2024-06-01", "2025-12-31", freq="D")
for date in dq_dates:
    for table in tables:
        for check in checks:
            passed = bool(np.random.random() > 0.08)
            failed_count = 0 if passed else int(np.random.exponential(5)) + 1
            dq_rows.append({
                "table_name": table,
                "check_name": check,
                "timestamp": date.strftime("%Y-%m-%d %H:%M:%S"),
                "passed": passed,
                "failed_count": failed_count,
                "details": "" if passed else f"Found {failed_count} violations",
            })

df_dq = spark.createDataFrame(pd.DataFrame(dq_rows))
df_dq.write.mode("overwrite").saveAsTable("revintel.poc.dq_audit_log")
print(f"✓ dq_audit_log: {df_dq.count()} rows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## 8. fact_revenue_versions

# COMMAND ----------

VERSION_SCENARIOS = [
    {"version_id": 1, "version_date": "2025-06-01", "region_mult": {}, "sl_mult": {}, "noise_std": 0.0},
    {
        "version_id": 2, "version_date": "2025-09-01",
        "region_mult": {"R001": 0.92, "R002": 1.14, "R003": 1.06, "R004": 1.03},
        "sl_mult": {"SL01": 1.12, "SL04": 0.82, "SL05": 1.08, "SL06": 0.95},
        "noise_std": 0.05, "collection_adj": 1.08, "margin_shift": 1.5,
    },
    {
        "version_id": 3, "version_date": "2025-12-01",
        "region_mult": {"R001": 0.97, "R002": 1.20, "R003": 1.25, "R004": 1.10},
        "sl_mult": {"SL01": 1.05, "SL03": 1.15, "SL04": 0.78, "SL06": 1.30},
        "noise_std": 0.06, "collection_adj": 0.90, "margin_shift": -2.0,
    },
]

all_versions = []
for scenario in VERSION_SCENARIOS:
    version = revenue_pdf.copy()
    vid = scenario["version_id"]

    if vid > 1:
        r_factors = version["region_id"].map(scenario["region_mult"]).fillna(1.0)
        s_factors = version["service_line_id"].map(scenario["sl_mult"]).fillna(1.0)
        noise = np.random.normal(1.0, scenario["noise_std"], size=len(version))
        combined = r_factors * s_factors * noise
        coll_adj = scenario.get("collection_adj", 1.0)
        margin_shift = scenario.get("margin_shift", 0.0)

        version["booked_revenue"] = (version["booked_revenue"] * combined).round(2)
        version["recognized_revenue"] = (version["recognized_revenue"] * combined).round(2)
        version["billed_amount"] = (version["billed_amount"] * combined).round(2)
        version["collected_amount"] = (version["collected_amount"] * combined * coll_adj).round(2)
        version["ar_balance"] = (version["billed_amount"] - version["collected_amount"]).clip(lower=0).round(2)
        version["wip_balance"] = (version["booked_revenue"] - version["billed_amount"]).clip(lower=0).round(2)
        version["margin_pct"] = (version["margin_pct"] + margin_shift).clip(5, 55).round(1)

    version["version_id"] = vid
    version["version_date"] = scenario["version_date"]
    all_versions.append(version)

versions_pdf = pd.concat(all_versions, ignore_index=True)
df_versions = spark.createDataFrame(versions_pdf)
df_versions.write.mode("overwrite").saveAsTable("revintel.poc.fact_revenue_versions")
print(f"✓ fact_revenue_versions: {df_versions.count()} rows")

# COMMAND ----------

# MAGIC %md
# MAGIC ## Verification

# COMMAND ----------

print("\n=== revintel.poc tables ===")
for t in spark.catalog.listTables("revintel.poc"):
    count = spark.table(f"revintel.poc.{t.name}").count()
    print(f"  {t.name}: {count:,} rows")
print("\n✓ All 8 tables created successfully. Genie Space is ready.")
