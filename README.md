# KPMG Revenue Intel — AI-Enabled Revenue Intelligence Platform

A POC prototype demonstrating a unified revenue intelligence platform that replaces fragmented spreadsheets, Salesforce, Oracle, and SAP with a single source of truth for region-wide revenue, billings, and collections.

Built on a Databricks Lakehouse architecture with a hybrid forecasting engine, scenario planning, and natural language capabilities.

---

## Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Python | 3.11+ | `python3.11 --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Make | any | `make --version` |

## Quick Start

```bash
# 1. Clone the repo
git clone https://github.com/your-org/revintel-poc.git
cd revintel-poc

# 2. Install all dependencies and seed the database
make setup

# 3. Start both servers
make dev
```

The app will be available at **http://localhost:3000**.

The backend API runs at **http://localhost:8000** (Swagger docs at `/docs`).

### Step-by-step (without Make)

```bash
# Backend
cd backend
python3.11 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python -c "from db.connection import init_db; init_db()"
uvicorn main:app --reload --port 8000

# Frontend (in a separate terminal)
cd frontend
npm install
npx next dev
```

---

## What the App Does

KPMG Revenue Intel provides a unified analytics platform across seven core modules:

### 1. Dashboard (`/`)
The main landing page with real-time KPIs and revenue analytics.
- **8 KPI cards** — Revenue, Margin, Billed, Collected, Orders, AR Balance, WIP, Collections Rate — each with period-over-period deltas
- **Revenue trend chart** — historical revenue vs. collections over time
- **Attribution pie chart** — revenue breakdown by service line
- **Live feed panel** — real-time event stream from simulated source systems
- **Executive summary** — AI-generated narrative of financial performance
- **Filters** — all data responds to the region dropdown and date range selector in the header

### 2. Live Feed (`/live`)
Real-time data stream simulating events from Salesforce, Oracle, SAP, and internal systems.
- Server-Sent Events (SSE) for zero-latency updates
- Events include bookings, billings, collections, and margin updates
- Source system status indicators
- Running totals that accumulate in real time
- Pulsing "Live" indicator in the header across all pages

### 3. Cash Flow (`/cashflow`)
Billing, collections, and receivables analytics.
- **Waterfall chart** — tracks revenue through booked → recognized → billed → collected stages
- **DSO gauge** — Days Sales Outstanding meter with color-coded thresholds
- **AR aging** — outstanding receivables broken down by service line

### 4. Forecasting (`/forecasting`)
AI-powered revenue predictions with actionable recommendations.
- **Forecast chart** — historical data + predicted revenue with 80% and 95% confidence bands
- **Hybrid engine** — combines Prophet (trend/seasonality decomposition) with XGBoost (gradient boosting on lag features), weighted 60/40
- **Recommended actions** — data-driven insights generated from forecast trends, collection rates, margins, pipeline coverage, and service line performance
- **Model comparison** — MAPE and RMSE accuracy metrics for Prophet, XGBoost, and Hybrid models
- **Prediction tester** — interactive panel to change horizon (1–24 months), model type, and region; updates the main chart on run

### 5. Scenario Planning (`/scenarios`)
Monte Carlo simulation and what-if analysis.
- **5 adjustable parameters** — revenue growth %, DSO change, churn rate, win rate, macro multiplier
- **1,000-iteration Monte Carlo simulation** producing P10/P50/P90 projections
- **Fan chart** — visualises the range of outcomes over time
- **Sensitivity tornado** — shows which parameter has the most impact on results
- **Summary stats** — base total, expected delta, cash flow projection, average margin

### 6. Time Travel (`/time-travel`)
Delta Lake-style data versioning to compare historical snapshots.
- **Version timeline** — three versions representing different business events:
  - v1 "Q2 Close" — baseline ($111.8M)
  - v2 "Q3 Restatement" — audit corrections, EMEA ramp (+0.6%)
  - v3 "Year-End Adjustment" — APAC expansion, tech boom (+10.8%)
- **Version comparison** — auto-selects v1 vs v3 on load; dropdowns to choose any pair
- **Impact by region** — visual bar chart of net revenue change per region
- **Diff table** — row-level differences showing period, region name, service line name, both values, absolute diff, and % change
- Region and service line IDs are resolved to human-readable names

### 7. Data Quality (`/data-quality`)
Automated data integrity monitoring.
- **Quality scorecard** — overall score from automated checks (null, range, freshness, duplicate, schema)
- **Trend chart** — quality score over time
- **Anomaly table** — individual check failures with details

### NLP Assistant (floating panel)
Available on every page via the chat icon in the bottom-right corner.
- Natural language questions about revenue data
- Powered by Databricks Genie Spaces API (falls back to local analytics without credentials)
- Returns SQL, tabular data, and narrative answers

---

## Filters

Every data page includes two global filters in the header:

| Filter | Options | Effect |
|--------|---------|--------|
| **Date Range** | FY 2025, FY 2024, H1/H2 2025, Q1–Q4 2025, All Time | Filters KPIs, charts, waterfall, and summaries to the selected period |
| **Region** | All Regions, Americas, EMEA, APAC, UK | Filters all data components to the selected region |

---

## Architecture

```
┌──────────────────────────────────────────────────────┐
│               Next.js Frontend (:3000)                │
│  Dashboard │ Live Feed │ Cash Flow │ Forecasting      │
│  Scenarios │ Time Travel │ Data Quality │ NLP Chat    │
└─────────────────────┬────────────────────────────────┘
                      │ REST API + SSE
┌─────────────────────▼────────────────────────────────┐
│               FastAPI Backend (:8000)                  │
│  Hybrid Forecast Engine (Prophet + XGBoost)           │
│  Monte Carlo Scenario Engine                          │
│  Stream Simulator (real-time event generation)        │
│  Data Quality Engine                                  │
│  Databricks Genie Integration                         │
│  Recommended Actions Engine                           │
└─────────────────────┬────────────────────────────────┘
                      │
┌─────────────────────▼────────────────────────────────┐
│      DuckDB (local) / Delta Lake (Databricks)         │
│  Synthetic data: 500 clients, 4 regions,              │
│  6 service lines, 3 years of transactional data       │
│  3 versioned snapshots for time-travel                │
└──────────────────────────────────────────────────────┘
```

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind CSS, Recharts |
| Backend | Python 3.11, FastAPI, Uvicorn |
| Database | DuckDB (local analytical DB) |
| ML / Forecasting | Prophet-style decomposition, Gradient Boosting (scikit-learn), Monte Carlo simulation |
| NLP | Databricks Genie Spaces API |
| Real-time | Server-Sent Events (SSE) |
| Data Generation | Faker, NumPy, pandas |

## Project Structure

```
revintel-poc/
├── backend/
│   ├── main.py                  # FastAPI app, lifespan, router registration
│   ├── requirements.txt         # Python dependencies
│   ├── .env                     # Databricks credentials (not committed)
│   ├── routers/
│   │   ├── dashboard.py         # KPIs, revenue trend, attribution
│   │   ├── cashflow.py          # Waterfall, DSO, AR aging
│   │   ├── forecasting.py       # Predict, accuracy, history, recommendations
│   │   ├── scenarios.py         # Monte Carlo simulation
│   │   ├── time_travel.py       # Versions, diff, point-in-time query
│   │   ├── data_quality.py      # Scorecard, trend, anomalies
│   │   ├── stream.py            # SSE events, status, recent
│   │   └── nlp.py               # Genie chat, executive summary
│   ├── services/
│   │   ├── forecast_engine.py   # Prophet + XGBoost hybrid model
│   │   ├── scenario_engine.py   # Monte Carlo simulation engine
│   │   ├── stream_simulator.py  # Real-time event generator
│   │   └── genie_engine.py      # Databricks Genie API client
│   ├── synthetic/
│   │   ├── generate.py          # Synthetic data generation (500 clients, revenue, pipeline, forecasts, versions)
│   │   └── seed.py              # Database seeding
│   ├── db/
│   │   └── connection.py        # DuckDB connection and query helper
│   └── data/
│       └── revintel.duckdb      # Generated database file (not committed)
├── frontend/
│   ├── package.json
│   ├── src/
│   │   ├── app/                 # Next.js pages (/, /live, /cashflow, /forecasting, /scenarios, /time-travel, /data-quality)
│   │   ├── components/
│   │   │   ├── layout/          # Sidebar, Header
│   │   │   ├── dashboard/       # KPICardGrid, RevenueTrendChart, AttributionPieChart
│   │   │   ├── cashflow/        # WaterfallChart, DSOMeter, ARAgingChart
│   │   │   ├── forecasting/     # ForecastChart, ModelComparison, PredictionTester, RecommendedActions
│   │   │   ├── scenarios/       # ScenarioBuilder, ScenarioResults
│   │   │   ├── time-travel/     # VersionTimeline, DiffViewer
│   │   │   ├── data-quality/    # DQScorecard, DQTrendChart, AnomalyTable
│   │   │   ├── live/            # LiveFeedPanel
│   │   │   ├── nlp/             # ChatPanel, ExecSummaryModal
│   │   │   └── shared/          # MetricCard, ChartContainer, FilterDropdown
│   │   └── lib/
│   │       ├── constants.ts     # Regions, service lines, nav items, chart colors
│   │       ├── formatters.ts    # Currency and percentage formatters
│   │       └── useEventStream.ts # SSE React hook
│   └── public/
│       └── kpmg-logo.png        # KPMG logo
├── Makefile                     # Build and run commands
├── docker-compose.yml           # Docker setup
├── .gitignore
└── README.md
```

## Databricks Integration (Optional)

To enable the NLP assistant with Databricks Genie, create `backend/.env`:

```env
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=your_personal_access_token
GENIE_SPACE_ID=your_genie_space_id
```

Without these credentials, the NLP chat falls back to a local analytics mode. All other features (dashboard, forecasting, scenarios, etc.) work fully offline with the local DuckDB database.

## Make Commands

| Command | Description |
|---------|-------------|
| `make setup` | Install all dependencies and seed the database |
| `make dev` | Start backend (:8000) and frontend (:3000) concurrently |
| `make backend` | Start only the backend |
| `make frontend` | Start only the frontend |
| `make seed` | Regenerate synthetic data |
| `make clean` | Remove database, node_modules, .next cache, and venv |

## Synthetic Data

The app auto-generates realistic data on first run:

- **500 clients** across 4 regions (Americas 35%, EMEA 30%, UK 20%, APAC 15%) and 4 tiers
- **~30,000 monthly revenue records** spanning Jan 2023 – Dec 2025 with seasonal patterns per service line
- **2,000 pipeline opportunities** across all stages
- **1,728 forecast records** with actuals for model accuracy measurement
- **8,685 data quality audit entries** over 18 months
- **3 versioned revenue snapshots** with scenario-driven variation for time-travel demos

## Troubleshooting

| Issue | Fix |
|-------|-----|
| `python3.11: command not found` | Install Python 3.11 via Homebrew: `brew install python@3.11` |
| `pip install` SSL errors | Add `--trusted-host pypi.org --trusted-host files.pythonhosted.org` |
| Port 3000/8000 already in use | Kill existing processes: `lsof -ti:3000 \| xargs kill -9` |
| Frontend shows 404 on all content | Backend is not running — start it with `make backend` |
| "Bus error: 10" on seed | DuckDB file lock — stop the backend first, then re-seed |
| Live feed not updating | SSE connects directly to `:8000` — ensure backend is running |
