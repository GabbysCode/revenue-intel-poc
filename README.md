# RevIntel - AI-Enabled Revenue Intelligence Platform

A POC prototype demonstrating a unified revenue intelligence platform built on Databricks Lakehouse architecture. Replaces fragmented spreadsheets, Salesforce, Oracle, and SAP with a single source of truth for region-wide revenue, billings, and collections.

## Quick Start

```bash
# 1. Install dependencies
make setup

# 2. Start development servers (backend :8000, frontend :3000)
make dev
```

Or with Docker:
```bash
docker-compose up --build
```

Then open [http://localhost:3000](http://localhost:3000).

## Architecture

```
┌─────────────────────────────────────────────────┐
│              Next.js Frontend (:3000)            │
│  Dashboard │ Forecasting │ Scenarios │ Cash Flow │
│  Time Travel │ Data Quality │ NLP Assistant      │
└──────────────────────┬──────────────────────────┘
                       │ REST API
┌──────────────────────▼──────────────────────────┐
│              FastAPI Backend (:8000)              │
│  Hybrid Forecast Engine (Prophet + XGBoost)      │
│  Monte Carlo Scenario Engine                     │
│  Data Quality Engine                             │
│  Databricks Genie Integration                    │
└──────────────────────┬──────────────────────────┘
                       │
┌──────────────────────▼──────────────────────────┐
│     DuckDB (local) / Delta Lake (Databricks)     │
│  Synthetic Data: 500 clients, 4 regions,         │
│  6 service lines, 3 years of revenue data        │
└─────────────────────────────────────────────────┘
```

## Features

### Dashboard
- 8 KPI cards with period-over-period deltas
- Revenue trend chart (revenue vs collections)
- Revenue attribution by service line (donut chart)
- Executive summary generator

### Forecasting
- Hybrid engine: Prophet (trend/seasonality) + XGBoost (ML features)
- Confidence intervals (80% and 95%)
- Model accuracy comparison (MAPE, RMSE)
- Interactive prediction tester

### Scenario Planning
- Monte Carlo simulation (1000 iterations)
- Adjustable parameters: growth, churn, win rate, DSO, macro
- P10/P50/P90 projections with fan charts
- Sensitivity tornado diagram

### Time Travel
- Delta Lake-style data versioning
- Version timeline with metadata
- Side-by-side diff viewer
- Point-in-time queries

### Data Quality
- Automated quality scoring
- Check results by table (null, range, freshness, duplicates)
- Quality trend over time
- Anomaly detection table

### Cash Flow
- Revenue waterfall (booked → recognized → billed → collected)
- DSO gauge meter
- AR aging by service line

### NLP Assistant (Databricks Genie)
- Natural language questions about revenue data
- SQL generation and result display
- Executive summary generation
- Powered by Databricks Genie Spaces API

## Databricks Integration

To connect to your Databricks workspace, set these environment variables:

```bash
export DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
export DATABRICKS_TOKEN=dapi_your_token_here
export GENIE_SPACE_ID=your_genie_space_id_here
```

Without these, the platform runs with a local analytics fallback for the NLP features.

## Tech Stack

- **Frontend**: Next.js 14, React 18, TypeScript, Tailwind CSS, Recharts
- **Backend**: Python, FastAPI, DuckDB
- **ML**: Prophet-style decomposition, Gradient Boosting ensemble
- **NLP**: Databricks Genie Spaces API
- **Data**: Synthetic generation with Faker, NumPy, pandas

## Project Structure

```
revintel-poc/
├── backend/
│   ├── main.py              # FastAPI application
│   ├── routers/             # API route handlers
│   ├── services/            # Business logic (forecast, scenario, genie)
│   ├── synthetic/           # Data generation
│   ├── db/                  # Database connection
│   └── models/              # Pydantic schemas
├── frontend/
│   ├── src/app/             # Next.js pages
│   ├── src/components/      # React components
│   └── src/lib/             # Utilities, API client, constants
├── docker-compose.yml
├── Makefile
└── README.md
```
