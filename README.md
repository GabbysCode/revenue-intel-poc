# RevIntel — Revenue Intelligence POC

A demo platform that pulls four executive KPIs into one place, layers a
Databricks Genie chat on top, and lets users export the current view to a
Tellr-generated slide deck. Designed to feel like a single source of truth
for revenue performance instead of the usual sprawl of spreadsheets, CRM
exports, and finance reports.

| Layer | Stack |
|-------|-------|
| Frontend | Next.js 14, React 18, TypeScript, Tailwind, Recharts |
| Backend | FastAPI (Python 3.11), DuckDB, httpx |
| AI | Databricks Genie Spaces API (chat), Tellr `ai-slide-generator` MCP (deck export) |
| Data | DuckDB-backed synthetic dataset, optionally mirrored into Unity Catalog |

> **Looking to get up and running?** See [`QUICKSTART.md`](QUICKSTART.md) for a
> 5-minute setup including Genie + Tellr wiring.

---

## What's in the dashboard

### Headline KPIs (with live data)

| KPI | Aggregator | Direction | Detail page |
|-----|------------|-----------|-------------|
| Chargeable Hours | `SUM(chargeable_hours)` | higher is better | `/chargeable-hours` |
| Rate Per Hour | hours-weighted mean of `hourly_rate` | higher is better | `/rate-per-hour` |
| Gross Fee Days | `SUM(gross_fee_days)` | higher is better | `/gross-fee-days` |
| Unbilled Days | `AVG(unbilled_days)` | **lower** is better | `/unbilled-days` |

Each card shows the current value, variance vs. budget, variance vs. prior
year, and a sparkline. Clicking a card opens a drill-down with a trend
chart, a capability breakdown, and a YTD-vs-budget waterfall.

### Reserved KPI tiles (placeholders)

The dashboard also ships four placeholder tiles ready to be wired up to
real data sources. They render a dashed "Awaiting data" tile until the
backend exposes them under `/api/kpis/summary`:

- **Sales Forecast** — pipeline / commit / best-case vs. quota
- **Chargeability** — billable hours as a % of available hours
- **Delivery Financials** — engagement-level margin, WIP, recoverability
- **Staff Attrition** — rolling 12-month voluntary leaver rate

To activate one, add the KPI to the backend's `/api/kpis/summary` response,
flip `placeholder: false` for it in `frontend/src/app/page.tsx`, and swap
the stub page for `<KpiDrillDown kpi="..." />` (see existing live-data
pages for the exact pattern).

### Genie chat (right-hand pane)

Natural-language KPI questions routed through Databricks Genie. The
backend tries the local KPI engine first (deterministic SQL on DuckDB),
and falls back to your configured Genie space for anything it can't
answer schema-only. The four prompt chips on the dashboard (December
dip, rate-vs-volume, biggest contributor, budget vs actuals YTD) are
designed to land on the canonical answers documented in
[`databricks/genie_examples.md`](databricks/genie_examples.md).

If `DATABRICKS_HOST` / `DATABRICKS_TOKEN` / `GENIE_SPACE_ID` are unset,
the chat still runs — it just stays in local-only mode.

### Tellr "Export to Presentation"

The dashboard's **Export to Presentation** button creates an executive
deck via the Tellr `ai-slide-generator` Databricks App, polls until
ready, and returns a PDF render of the deck (`html_document` →
`xhtml2pdf` with a ReportLab fallback). Authentication is OAuth U2M;
see [`QUICKSTART.md`](QUICKSTART.md#tellr-deck-export) for the token
flow and the most common `401 Unauthorized` fix.

### Personas

Six demo personas (CFO, FD, Service Line Lead, FP&A Analyst, Data
Steward, Exec Sponsor) selectable on `/login`. Each persona has a
default region and a permission scope enforced by
`backend/middleware/persona_middleware.py` and
`backend/services/persona_scope.py`.

---

## Project layout

```
revintel-poc/
├── README.md                      # this file
├── QUICKSTART.md                  # 5-min setup + Genie + Tellr wiring
├── Makefile                       # make setup / make dev
├── docker-compose.yml             # docker compose up
├── backend/
│   ├── main.py                    # FastAPI app, lifespan, middleware, routers
│   ├── requirements.txt
│   ├── .env.example               # copy to .env
│   ├── routers/
│   │   ├── kpis.py                # /api/kpis/summary, /api/kpis/{id}
│   │   ├── data.py                # /api/data/* (catalog metadata for the chat)
│   │   ├── nlp.py                 # /api/nlp/* (Genie chat)
│   │   ├── tellr.py               # /api/tellr/* (deck create / status / pdf)
│   │   └── dashboard.py           # legacy endpoints kept for back-compat
│   ├── services/
│   │   ├── kpi_local_engine.py    # deterministic local KPI SQL
│   │   ├── genie_engine.py        # Databricks Genie client (with local fallback)
│   │   ├── tellr_mcp.py           # Tellr MCP client (Pattern A + Pattern B auth)
│   │   └── persona_scope.py       # row-level region scoping per persona
│   ├── middleware/
│   │   └── persona_middleware.py  # injects persona state from cookie / header
│   ├── synthetic/
│   │   └── generate.py            # generates the 30k-row demo dataset
│   ├── db/
│   │   └── connection.py          # DuckDB connection + view DDL
│   └── data/                      # DuckDB file (gitignored)
├── frontend/
│   ├── package.json
│   ├── next.config.js             # /api/* proxy → BACKEND_UPSTREAM
│   ├── .env.example               # copy to .env.local (optional)
│   └── src/
│       ├── app/                   # Next.js App Router pages
│       │   ├── page.tsx           # dashboard (4 live KPIs + 4 placeholders)
│       │   ├── chargeable-hours/  # … and the other live KPI drill-downs
│       │   ├── sales-forecast/    # … and the placeholder pages
│       │   └── login/             # persona picker
│       ├── components/
│       │   ├── kpi/               # KpiSummaryCard, KpiTrendChart, etc.
│       │   ├── tellr/             # ExportToPresentationButton + DeckProgressModal
│       │   ├── nlp/ChatPane.tsx   # Genie chat pane
│       │   └── layout/            # AppShell, Sidebar, ExecHeader, ThemeToggle
│       └── lib/
│           ├── use-kpis.ts        # /api/kpis/* React hooks
│           ├── personas.ts        # persona definitions + GENIE_ROOM_URL
│           ├── apiFetch.ts        # fetch helper that forwards persona headers
│           └── filter-state.tsx   # global region / capability / period filter
└── databricks/
    ├── genie_examples.md          # SQL + narratives to seed your Genie space
    ├── seed_unity_catalog.py      # notebook-style script — creates revintel.poc.*
    ├── upload_to_databricks.py    # one-shot uploader (uses SQL Statement API)
    └── do_upload.py               # incremental uploader from a local pickle
```

---

## Running it

The fastest path is in [`QUICKSTART.md`](QUICKSTART.md). For reference:

```bash
make setup        # creates backend/.venv, installs Python + npm deps, seeds DuckDB
make dev          # starts backend on :8000 and frontend on :3000 in parallel
```

App: <http://localhost:3000>. API docs: <http://localhost:8000/docs>.

### Docker

```bash
cp backend/.env.example backend/.env  # fill in your values first
docker compose up --build
```

### Make targets

| Command | Purpose |
|---------|---------|
| `make setup` | venv + npm install + seed DuckDB |
| `make dev` | run backend + frontend together |
| `make backend` | backend only (`uvicorn main:app --reload --port 8000`) |
| `make frontend` | frontend only (`next dev`) |
| `make seed` | regenerate synthetic data |
| `make clean` | nuke `.venv`, `node_modules`, `.next`, DuckDB file |

---

## Push synthetic data to Unity Catalog (optional)

If you want Genie to query against real Delta tables instead of the local
DuckDB file, mirror the synthetic dataset into Unity Catalog:

```bash
export DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
export DATABRICKS_TOKEN=dapi_...
export WAREHOUSE_ID=your_sql_warehouse_id
export UC_CATALOG=revintel        # optional — default revintel
export UC_SCHEMA=poc              # optional — default poc

python databricks/upload_to_databricks.py
```

The script generates the data locally, then drops + creates + batch-inserts
all 8 tables (`dim_*`, `fact_*`, `dq_audit_log`) under `${UC_CATALOG}.${UC_SCHEMA}`.
Point your Genie space at the same catalog/schema and add the questions in
[`databricks/genie_examples.md`](databricks/genie_examples.md) so the
dashboard prompt chips hit cached answers.

---

## API surface (backend)

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/health` | liveness probe |
| GET | `/api/kpis/summary` | headline values + sparklines for all KPIs |
| GET | `/api/kpis/{id}` | drill-down (trend, capability mix, YTD-vs-budget) |
| GET | `/api/data/...` | catalog / metadata helpers used by the chat |
| POST | `/api/nlp/chat` | natural-language KPI question (local → Genie) |
| GET | `/api/tellr/health` | Tellr config + auth pattern probe |
| POST | `/api/tellr/create-executive-deck` | kicks off async deck creation |
| GET | `/api/tellr/deck-status` | poll a Tellr deck (`pending` \| `ready` \| `failed`) |
| GET | `/api/tellr/deck-pdf` | PDF render of a ready deck |

---

## Troubleshooting

| Symptom | Likely cause / fix |
|---------|--------------------|
| `python3.11: command not found` | `brew install python@3.11` |
| Port 8000 / 3000 already in use | `lsof -ti:8000 \| xargs kill -9` (same for 3000) |
| Frontend pages stuck loading, console shows `ECONNREFUSED 127.0.0.1:8000` | Backend not running — `make backend` |
| `Bus error: 10` on seed | DuckDB file lock — stop the backend first, then re-seed |
| Dashboard cards say "KPI unavailable" | Backend started before DuckDB seed completed — restart backend |
| Tellr export → `401 Unauthorized` | OAuth U2M token expired — re-mint, paste into `.env`, restart backend. Detail in [`QUICKSTART.md`](QUICKSTART.md#tellr-deck-export). |
| Tellr export → `503 PAT rejected` | You used a `dapi…` PAT; Apps require an OAuth U2M token. |
| Genie chat answers in "local" mode only | One of `DATABRICKS_HOST` / `DATABRICKS_TOKEN` / `GENIE_SPACE_ID` is missing |

---

## Synthetic data

The local DuckDB seed (`make seed`) populates roughly:

- **500 clients** across 4 regions (Americas, EMEA, APAC, UK) and 4 tiers
- **~30k monthly revenue rows** (Jan 2023 – Dec 2025) with realistic
  seasonality and a deliberate **December chargeable-hours dip
  (`*0.88`)** so the marquee Genie answer ("Why did chargeable hours
  drop in December?") has a real signal to find
- **2,000 pipeline opportunities** across all stages
- **1,728 forecast records** with actuals for accuracy backtesting
- **8,685 data-quality audit entries** over 18 months
- **3 versioned revenue snapshots** for time-travel demos
