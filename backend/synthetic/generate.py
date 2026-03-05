import pandas as pd
import numpy as np
from faker import Faker
from datetime import datetime, timedelta
import uuid

fake = Faker()
Faker.seed(42)
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
    "SL01": [1.3, 1.1, 0.8, 0.7, 0.6, 0.7, 0.8, 0.9, 1.0, 1.1, 1.2, 1.4],  # Audit peaks Q4/Q1
    "SL02": [0.9, 1.0, 1.3, 1.4, 1.2, 0.8, 0.7, 0.8, 0.9, 1.0, 1.0, 0.9],  # Tax peaks Q2
    "SL03": [1.0, 1.0, 1.0, 1.1, 1.1, 1.0, 0.9, 0.9, 1.0, 1.1, 1.1, 1.0],  # Advisory steady
    "SL04": [0.8, 0.9, 1.0, 1.1, 1.1, 1.2, 1.1, 0.9, 1.0, 1.1, 1.0, 0.9],  # Consulting peaks mid-year
    "SL05": [1.1, 1.0, 1.0, 1.0, 0.9, 0.9, 1.0, 1.0, 1.1, 1.1, 1.2, 1.1],  # Risk steady-high
    "SL06": [0.8, 0.9, 1.0, 1.0, 1.1, 1.2, 1.2, 1.1, 1.0, 1.0, 1.1, 1.0],  # Tech ramps mid-year
}

REGION_WEIGHTS = {"R001": 0.40, "R002": 0.25, "R003": 0.15, "R004": 0.20}
SL_BASE_REVENUE = {"SL01": 5000, "SL02": 4000, "SL03": 3500, "SL04": 4500, "SL05": 2500, "SL06": 3000}


def generate_clients(n=500):
    clients = []
    for i in range(n):
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
    return pd.DataFrame(clients)


def generate_revenue(clients_df, start_date="2023-01-01", end_date="2025-12-31"):
    dates = pd.date_range(start_date, end_date, freq="MS")
    rows = []
    for date in dates:
        month_idx = date.month - 1
        for _, client in clients_df.iterrows():
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
                collection_rate = np.random.uniform(0.5, 0.9)
                margin = np.random.uniform(0.15, 0.45)

                rows.append({
                    "date": date.strftime("%Y-%m-%d"),
                    "client_id": client["client_id"],
                    "service_line_id": sl_id,
                    "region_id": client["region_id"],
                    "booked_revenue": round(booked, 2),
                    "recognized_revenue": round(booked * recognition_lag, 2),
                    "billed_amount": round(booked * billing_lag, 2),
                    "collected_amount": round(booked * billing_lag * collection_rate, 2),
                    "wip_balance": round(booked * (1 - billing_lag), 2),
                    "ar_balance": round(booked * billing_lag * (1 - collection_rate), 2),
                    "margin_pct": round(margin * 100, 1),
                })
    return pd.DataFrame(rows)


def generate_pipeline(clients_df, n=2000):
    rows = []
    for _ in range(n):
        client = clients_df.sample(1).iloc[0]
        stage_info = np.random.choice(PIPELINE_STAGES)
        sl = np.random.choice(SERVICE_LINES)
        deal_value = np.random.lognormal(mean=10, sigma=1.2)
        rows.append({
            "opportunity_id": str(uuid.uuid4())[:12],
            "client_id": client["client_id"],
            "service_line_id": sl["service_line_id"],
            "region_id": client["region_id"],
            "stage": stage_info["stage"],
            "probability": stage_info["probability"],
            "expected_close": fake.date_between(start_date="today", end_date="+12m").isoformat(),
            "deal_value": round(deal_value, 2),
        })
    return pd.DataFrame(rows)


def generate_forecasts(revenue_df):
    rows = []
    forecast_dates = pd.date_range("2024-01-01", "2025-12-01", freq="MS")
    for fd in forecast_dates:
        for region in REGIONS:
            for sl in SERVICE_LINES:
                mask = (
                    (revenue_df["region_id"] == region["region_id"]) &
                    (revenue_df["service_line_id"] == sl["service_line_id"]) &
                    (revenue_df["date"] == fd.strftime("%Y-%m-%d"))
                )
                actual = revenue_df.loc[mask, "booked_revenue"].sum()
                for model_v in ["prophet_v1", "xgboost_v1", "hybrid_v1"]:
                    bias = {"prophet_v1": 0.03, "xgboost_v1": -0.02, "hybrid_v1": 0.005}[model_v]
                    noise = np.random.normal(bias, 0.08)
                    forecast = actual * (1 + noise) if actual > 0 else 0
                    rows.append({
                        "forecast_date": fd.strftime("%Y-%m-%d"),
                        "period": fd.strftime("%Y-%m"),
                        "region_id": region["region_id"],
                        "service_line_id": sl["service_line_id"],
                        "forecast_revenue": round(max(0, forecast), 2),
                        "actual_revenue": round(actual, 2),
                        "model_version": model_v,
                    })
    return pd.DataFrame(rows)


def generate_dq_audit_log():
    rows = []
    tables = ["fact_revenue", "fact_pipeline", "dim_clients"]
    checks = ["null_check", "range_check", "freshness_check", "duplicate_check", "schema_check"]
    dates = pd.date_range("2024-06-01", "2025-12-31", freq="D")
    for date in dates:
        for table in tables:
            for check in checks:
                passed = np.random.random() > 0.08
                failed_count = 0 if passed else int(np.random.exponential(5)) + 1
                rows.append({
                    "table_name": table,
                    "check_name": check,
                    "timestamp": date.strftime("%Y-%m-%d %H:%M:%S"),
                    "passed": passed,
                    "failed_count": failed_count,
                    "details": "" if passed else f"Found {failed_count} violations",
                })
    return pd.DataFrame(rows)


def generate_revenue_versions(revenue_df):
    """Generate multiple 'versions' of fact_revenue for time-travel simulation."""
    versions = []
    version_dates = ["2025-06-01", "2025-09-01", "2025-12-01"]
    for i, vdate in enumerate(version_dates):
        version = revenue_df.copy()
        if i > 0:
            adjustment = np.random.normal(1.0, 0.03, size=len(version))
            version["booked_revenue"] = (version["booked_revenue"] * adjustment).round(2)
            version["recognized_revenue"] = (version["recognized_revenue"] * adjustment).round(2)
            version["billed_amount"] = (version["billed_amount"] * adjustment).round(2)
        version["version_id"] = i + 1
        version["version_date"] = vdate
        versions.append(version)
    return pd.concat(versions, ignore_index=True)


def generate_all():
    print("Generating synthetic data...")
    clients = generate_clients(500)
    print(f"  -> {len(clients)} clients")

    revenue = generate_revenue(clients)
    print(f"  -> {len(revenue)} revenue records")

    pipeline = generate_pipeline(clients, 2000)
    print(f"  -> {len(pipeline)} pipeline opportunities")

    forecasts = generate_forecasts(revenue)
    print(f"  -> {len(forecasts)} forecast records")

    dq_log = generate_dq_audit_log()
    print(f"  -> {len(dq_log)} DQ audit entries")

    revenue_versions = generate_revenue_versions(revenue)
    print(f"  -> {len(revenue_versions)} revenue version records")

    return {
        "dim_clients": clients,
        "dim_regions": pd.DataFrame(REGIONS),
        "dim_service_lines": pd.DataFrame(SERVICE_LINES),
        "fact_revenue": revenue,
        "fact_pipeline": pipeline,
        "fact_forecasts": forecasts,
        "dq_audit_log": dq_log,
        "fact_revenue_versions": revenue_versions,
    }
