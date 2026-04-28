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

> **Local-only setup?** See [`QUICKSTART.md`](QUICKSTART.md) for a 5-minute
> path including Genie + Tellr wiring.
>
> **Deploying to Databricks Apps?** See [`DEPLOY.md`](DEPLOY.md) — covers
> the workspace decision (Pattern A vs Pattern C), service-principal setup,
> the `databricks/deploy.sh` helper, and post-deploy smoke tests.
>
> **Locked-down laptop (no `make` / `jq` / `brew` / Python toolchain)?**
> See [`DEPLOY_OPTION_A.md`](DEPLOY_OPTION_A.md) — fully manual Pattern A
> (same-workspace) deploy that uses the **prebuilt wheel checked into
> `releases/`**, so you don't need a backend Python venv at all. Just
> Git, Node, system Python, and the Databricks CLI. Includes macOS /
> Linux / Windows command variants.

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
`xhtml2pdf` with a ReportLab fallback). Three auth patterns are supported:

- **Pattern A** — same-workspace Databricks App; the Apps proxy injects
  the user's identity (no token needed). Used in production deploys.
- **Pattern C** — cross-workspace deploys; service-principal OAuth M2M
  with auto-refresh. See [`DEPLOY.md`](DEPLOY.md).
- **Pattern B** — local dev only; static OAuth U2M token in
  `DATABRICKS_OAUTH_TOKEN`. See
  [`QUICKSTART.md`](QUICKSTART.md#tellr-deck-export).

### Personas

Six demo personas (CFO, FD, Service Line Lead, FP&A Analyst, Data
Steward, Exec Sponsor) selectable on `/login`. Each persona has a
default region and a permission scope enforced by
`revintel_backend.middleware.persona_middleware` and
`revintel_backend.services.persona_scope`.

---

## Project layout

The backend ships as an installable Python package (`revintel-backend`)
under a PEP 621 `src/` layout, so it builds to a single wheel that any
runtime — local Python, Docker, Databricks Apps — can `pip install`.

```
revintel-poc/
├── README.md                      # this file
├── QUICKSTART.md                  # 5-min setup + Genie + Tellr wiring
├── DEPLOY.md                      # Databricks Apps deployment guide
├── Makefile                       # make setup / make dev / make wheel
├── docker-compose.yml             # docker compose up
├── backend/
│   ├── pyproject.toml             # PEP 621 metadata + pinned deps
│   ├── requirements.txt           # back-compat shim → pip install -e .
│   ├── .env.example               # copy to .env
│   ├── app.yaml                   # Databricks Apps spec (installs wheel)
│   ├── Dockerfile                 # multi-stage: build wheel → install wheel
│   ├── dist/                      # built wheels (gitignored, made by `make wheel`)
│   ├── data/                      # DuckDB file (gitignored)
│   └── src/revintel_backend/      # the actual package
│       ├── __init__.py
│       ├── main.py                # FastAPI app, lifespan, middleware, routers
│       ├── cli.py                 # `revintel-backend` console entry point
│       ├── routers/
│       │   ├── kpis.py            # /api/kpis/summary, /api/kpis/{id}
│       │   ├── data.py            # /api/data/* (catalog metadata for the chat)
│       │   ├── nlp.py             # /api/nlp/* (Genie chat)
│       │   ├── tellr.py           # /api/tellr/* (deck create / status / pdf)
│       │   └── dashboard.py       # legacy endpoints kept for back-compat
│       ├── services/
│       │   ├── kpi_local_engine.py
│       │   ├── genie_engine.py    # Databricks Genie client (local fallback)
│       │   ├── tellr_mcp.py       # Tellr MCP client (Patterns A / B / C)
│       │   └── persona_scope.py
│       ├── middleware/persona_middleware.py
│       ├── db/connection.py       # DuckDB connection + view DDL
│       ├── models/schemas.py
│       └── synthetic/generate.py
├── frontend/
│   ├── package.json
│   ├── next.config.js             # /api/* proxy → BACKEND_UPSTREAM
│   ├── .env.example               # copy to .env.local (optional)
│   ├── app.yaml                   # Databricks Apps spec (next build + start)
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
├── databricks/
│   ├── deploy.sh                  # opinionated deploy helper (see DEPLOY.md)
│   ├── genie_examples.md          # SQL + narratives to seed your Genie space
│   ├── seed_unity_catalog.py      # notebook-style script — creates revintel.poc.*
│   ├── upload_to_databricks.py    # one-shot uploader (uses SQL Statement API)
│   └── do_upload.py               # incremental uploader from a local pickle
├── releases/                      # tracked: prebuilt backend wheel for locked-down deploys
│   └── revintel_backend-<ver>-py3-none-any.whl
├── DEPLOY.md                      # Databricks Apps deployment guide
└── DEPLOY_OPTION_A.md             # locked-down Pattern A deploy (uses prebuilt wheel)
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
| `make wheel` | build `backend/dist/revintel_backend-<ver>-py3-none-any.whl` |
| `make clean` | nuke `.venv`, `node_modules`, `.next`, `dist/`, DuckDB file |

---

## Deploying to Databricks Apps

RevIntel is structured as two Databricks Apps (FastAPI backend + Next.js frontend) so you can host the demo behind your workspace's auth and let it talk directly to Tellr without per-user OAuth tokens.

The backend is shipped as a **pre-built wheel**, so the deploy is just:

```bash
make wheel                         # builds backend/dist/revintel_backend-*.whl
./databricks/deploy.sh <profile>   # ships wheel + app.yaml, deploys both apps
```

`deploy.sh` builds the wheel itself before importing, so the `make wheel` step is optional but useful for catching build errors locally first.

Why a wheel? Cold-start time on Databricks Apps drops from a `pip install -r requirements.txt` (resolves and downloads ~12 packages) to `pip install <single-wheel>` (one cached resolution), and the deployed bytes are identical to whatever `make wheel` produced on your laptop — no editable-install drift.

The full deploy flow, workspace-vs-Tellr decision (Pattern A same-workspace vs Pattern C service-principal), service-principal setup, env / secrets management, and post-deploy smoke tests all live in [`DEPLOY.md`](DEPLOY.md). Read that before your first deploy.

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
| `python3.11: command not found` | `brew install python@3.11` (the wheel needs Python ≥ 3.11) |
| `make wheel` fails with `ModuleNotFoundError: build` | `backend/.venv/bin/pip install build` then re-run, or use the offline path `pip wheel . --no-deps --no-build-isolation -w dist` from `backend/`. |
| `revintel-backend: command not found` after install | The wheel installed but the venv's `bin/` isn't on `$PATH`. Use `<venv>/bin/revintel-backend` directly, or `python -m revintel_backend.cli`. |
| Port 8000 / 3000 already in use | `lsof -ti:8000 \| xargs kill -9` (same for 3000) |
| Frontend pages stuck loading, console shows `ECONNREFUSED 127.0.0.1:8000` | Backend not running — `make backend` |
| `Bus error: 10` on seed | DuckDB file lock — stop the backend first, then re-seed |
| Dashboard cards say "KPI unavailable" | Backend started before DuckDB seed completed — restart backend |
| Tellr export → `401 Unauthorized` (local dev) | OAuth U2M token expired — re-mint, paste into `.env`, restart backend. Detail in [`QUICKSTART.md`](QUICKSTART.md#tellr-deck-export). |
| Tellr export → `401 Unauthorized` (deployed app) | If on Pattern C, the SP secret was rotated; update the Apps secret and re-deploy. The in-process token cache will mint fresh on next call. |
| Tellr export → `503 PAT rejected` | You used a `dapi…` PAT; Apps require an OAuth U2M token (Pattern B), Pattern A, or Pattern C. |
| `/api/tellr/health` returns `pattern: "B"` in production | The Apps proxy didn't inject `x-forwarded-email` (so A is unavailable) and SP creds aren't set (so C is unavailable). Wire up Pattern A or C — Pattern B is local-dev-only. |
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
