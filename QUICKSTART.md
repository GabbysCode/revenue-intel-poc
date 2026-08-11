# RevIntel Classic — Quickstart

Get the full dashboard running locally in about three minutes. No Databricks
account, no cloud resources, no credentials required — the POC ships a
synthetic dataset and a local query engine, so it runs entirely on your laptop.

---

## TL;DR

```bash
git clone -b revintel-classic https://github.com/GabbysCode/revenue-intel-poc.git
cd revenue-intel-poc
make setup && make dev
```

Then open <http://localhost:3000>.

`make setup` takes ~1 minute (Python venv + npm install + seeds the database).
`make dev` runs the API on :8000 and the UI on :3000 together.

---

## Prerequisites

| Tool | Version | Check | If missing |
|---|---|---|---|
| Python | 3.11 | `python3.11 --version` | macOS: `brew install python@3.11` · Ubuntu: `sudo apt install python3.11 python3.11-venv` |
| Node.js | 18+ | `node --version` | macOS: `brew install node` · or [nodejs.org](https://nodejs.org) |
| Make | any | `make --version` | macOS: `xcode-select --install` · Ubuntu: `sudo apt install build-essential` |

Python **3.11 specifically** — the Makefile calls `python3.11` by name, and the
pinned `numpy==1.26.4` has no prebuilt wheels for 3.13+. If your `python3.11`
lives elsewhere, override it rather than editing the Makefile:

```bash
make setup PYTHON=/full/path/to/python3.11
```

No Make, or on Windows without WSL? See [Without Make](#without-make).

---

## Step by step

### 1. Clone the branch

```bash
git clone -b revintel-classic https://github.com/GabbysCode/revenue-intel-poc.git
cd revenue-intel-poc
```

### 2. Install and seed

```bash
make setup
```

This creates `backend/.venv`, installs the Python and npm dependencies, and
generates the synthetic dataset into `backend/data/revintel.duckdb`:

- 500 clients across 4 regions (Americas, EMEA, APAC, UK) and 6 service lines
- ~30k monthly revenue rows spanning 2023–2025, with real seasonality
  (Audit peaks Q4/Q1, Tax peaks Q2) so trend questions have genuine signal
- 2,000 pipeline opportunities and 1,728 forecast records
- A data-quality audit log, and three revenue snapshots for the time-travel view

### 3. Run it

```bash
make dev
```

| Service | URL |
|---|---|
| Dashboard | <http://localhost:3000> |
| API | <http://localhost:8000> |
| API docs (Swagger) | <http://localhost:8000/docs> |

Stop both with `Ctrl+C`.

### 4. Confirm it's healthy

```bash
curl http://127.0.0.1:8000/api/health
# {"status":"ok","platform":"RevIntel POC"}
```

Use `127.0.0.1` rather than `localhost` in terminal checks — the API binds IPv4
only, and on some systems `localhost` resolves to IPv6 first and appears to hang.
Browsers handle this themselves, so <http://localhost:3000> is fine.

---

## What you should see

Seven screens, all reading from the same seeded dataset:

| Screen | Path | What it shows |
|---|---|---|
| Dashboard | `/` | Eight KPI tiles, revenue trend, attribution mix, live feed sidebar |
| Live Feed | `/live` | Simulated events streaming in from Salesforce / Oracle / SAP / ERP |
| Cash Flow | `/cashflow` | Booked → collected waterfall, DSO meter, AR aging |
| Forecasting | `/forecasting` | Forecast with confidence bands, model comparison, recommended actions |
| Scenarios | `/scenarios` | Five planning levers, 1,000-iteration simulation, P10/P50/P90, tornado chart |
| Time Travel | `/time-travel` | Three revenue versions with a row-level diff between any two |
| Data Quality | `/data-quality` | Quality score, trend, and a live anomaly table |

The Live Feed needs a few seconds to accumulate events — new ones arrive every
2–5 seconds.

Presenting this? [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md) is a full walkthrough with a
per-screen narrative and notes on which panels are simulated.

---

## Optional: connect Databricks Genie

The natural-language chat and **Generate Executive Summary** both work out of
the box, answering from local SQL. To route them through a real Genie space
instead:

```bash
cp .env.example backend/.env
```

Fill in the three values and restart the backend:

```
DATABRICKS_HOST=https://your-workspace.cloud.databricks.com
DATABRICKS_TOKEN=dapi_your_token_here
GENIE_SPACE_ID=your_genie_space_id_here
```

With any of them missing, responses fall back to the local engine and are
tagged `"source": "local_fallback"` — useful for telling the two apart while
demoing. `backend/.env` is gitignored.

---

## Docker

If you'd rather not install Python and Node:

```bash
docker compose up --build
```

Same URLs. First build takes a few minutes; after that it's cached. Stop with
`docker compose down`.

---

## Everyday commands

| Command | What it does |
|---|---|
| `make setup` | Full install: venv, npm, seed data |
| `make dev` | Run API and UI together |
| `make backend` | API only, with autoreload, on :8000 |
| `make frontend` | UI only on :3000 |
| `make seed` | Regenerate the synthetic dataset |
| `make clean` | Remove the venv, `node_modules`, `.next`, and the database |
| `docker compose up --build` | Run both in containers |

---

## Without Make

Two terminals. Terminal 1:

```bash
python3.11 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt
cd backend
../backend/.venv/bin/python -c "from db.connection import init_db; init_db()"
../backend/.venv/bin/uvicorn main:app --reload --port 8000
```

Terminal 2:

```bash
cd frontend
npm install
npx next dev
```

On Windows PowerShell, swap `backend/.venv/bin/` for `backend\.venv\Scripts\`.

---

## Troubleshooting

| Symptom | Cause and fix |
|---|---|
| `make: python3.11: No such file` | Python 3.11 isn't on your PATH. Install it, or `make setup PYTHON=/path/to/python3.11`. |
| `Conflicting lock is held ... revintel.duckdb` | DuckDB allows one writer. Another backend (or a stray `make seed`) still holds the file. Stop it — `lsof -nP -iTCP:8000 -sTCP:LISTEN` to find it — then retry. |
| Port 8000 or 3000 already in use | `lsof -ti:8000 \| xargs kill -9` (same for 3000). |
| Dashboard loads but every tile is empty | The API isn't up. Check `curl http://127.0.0.1:8000/api/health` and look for errors in the `make dev` output. |
| `curl` to `localhost:8000` hangs, browser works | IPv6 resolution. Use `127.0.0.1`. |
| Charts blank after `make clean` | The database was deleted along with everything else. Run `make seed`. |
| `npm install` fails on a corporate network | Behind a proxy, set `npm config set registry <your-mirror>`, or use the Docker path. |
| Live Feed empty | Give it 10–15 seconds; events are generated every 2–5 seconds. |

---

## Deploying beyond your laptop

**This branch runs locally and in Docker.** It does not include the Databricks
Apps packaging — there's no `app.yaml` or built wheel here, so
`databricks apps deploy` won't work against it as-is.

That scaffolding (app specs, wheel packaging, and a `deploy.sh` that provisions
both apps) was built for the four-KPI variant of RevIntel and lives on:

- `wip/deploy-and-logging-fixes` — deploy tooling, current
- `main` @ `c9c2b22` — the four-KPI build it targets

Porting it to this build means adding a `backend/app.yaml` and
`frontend/app.yaml`, packaging the backend as a wheel (this build uses a flat
`backend/` layout with top-level imports, so it needs a `src/` package layout
first), and wiring a service principal for the frontend-to-backend hop. It's a
half-day of work, not a five-minute change.

For a demo, running locally is usually the right call anyway — it's faster to
start, has no cloud dependency, and nothing in the walkthrough requires the app
to be hosted.

---

## How it fits together

```
frontend (Next.js 14, :3000)
   │  next.config.js rewrites /api/* ──▶ http://localhost:8000
   ▼
backend (FastAPI, :8000)
   │  routers: dashboard · cashflow · forecasting · scenarios
   │           time-travel · data-quality · nlp · stream
   ▼
DuckDB (backend/data/revintel.duckdb)
   └─ seeded from backend/synthetic/generate.py
```

Because the frontend proxies `/api/*` to the backend, you don't need to set
`NEXT_PUBLIC_API_URL` for local development.
