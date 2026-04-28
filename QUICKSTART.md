# RevIntel — Quick Start

Get the app running locally in ~5 minutes, with Genie chat and Tellr deck
export wired up. If you only want the offline demo (no Databricks), jump
straight to [step 2](#2-install--run).

---

## 0. Prerequisites

| Tool | Version | Check |
|------|---------|-------|
| Python | 3.11+ | `python3.11 --version` |
| Node.js | 18+ | `node --version` |
| npm | 9+ | `npm --version` |
| Databricks CLI | 0.230+ | `databricks --version` — needed for Tellr (OAuth U2M) |
| `jq` | any | `jq --version` — used in token snippets below |
| Make | any (optional) | `make --version` |

Install Databricks CLI:

```bash
brew tap databricks/tap && brew install databricks
```

---

## 1. Configure Databricks (skip for offline-only)

You need three things to make the chat answer real Genie questions:

### a. Find your Genie space ID

1. Open your Databricks workspace.
2. Sidebar → **Genie** → open the space you want RevIntel to query.
3. Copy the ID from the URL: `…/genie/rooms/<GENIE_SPACE_ID>?o=…`.
4. Make sure the space is pointed at your `revintel.poc` schema (or the
   schema that holds the `fact_revenue` / `vw_kpi_*` tables — see
   [`databricks/genie_examples.md`](databricks/genie_examples.md)).

### b. Mint a PAT for Genie

```bash
# Settings → Developer → Access tokens → Generate new token
export DATABRICKS_TOKEN=dapi...
```

PATs are fine for the Genie REST API. They are **not** fine for Tellr —
see step 3.

### c. (Optional) Mirror the synthetic dataset into Unity Catalog

If your Genie space points at a fresh catalog, push the demo data first:

```bash
export DATABRICKS_HOST=https://<workspace>.cloud.databricks.com
export DATABRICKS_TOKEN=dapi...
export WAREHOUSE_ID=<your_sql_warehouse_id>
export UC_CATALOG=revintel        # optional, default revintel
export UC_SCHEMA=poc              # optional, default poc

python databricks/upload_to_databricks.py
```

The script generates the data locally then drops + creates + batch-inserts
all 8 tables (`dim_*`, `fact_*`, `dq_audit_log`). Then paste the
canonical questions from
[`databricks/genie_examples.md`](databricks/genie_examples.md) into your
Genie space's "Example questions" so the dashboard's prompt chips hit
trained answers.

---

## 2. Install & run

```bash
git clone https://github.com/GabbysCode/revenue-intel-poc.git
cd revenue-intel-poc

cp backend/.env.example backend/.env       # fill this in next
cp frontend/.env.example frontend/.env.local   # optional

make setup        # creates backend/.venv, installs deps, seeds DuckDB
make dev          # backend on :8000, frontend on :3000
```

Open <http://localhost:3000>.

> The dashboard works fully offline — the four headline KPIs, drill-downs
> and prompt chips all run against the local DuckDB seed. Genie + Tellr
> only kick in once you fill in `backend/.env`.

---

## 3. Wire up Genie chat

Edit `backend/.env`:

```env
DATABRICKS_HOST=https://<workspace>.cloud.databricks.com
DATABRICKS_TOKEN=dapi_your_personal_access_token
GENIE_SPACE_ID=<the id from step 1a>
```

Restart the backend (uvicorn reloads `.py` files but **not** `.env`):

```bash
# from the repo root
lsof -ti:8000 | xargs kill -9
make backend
```

Verify with the floating chat panel — ask "Why did chargeable hours drop
in December?". A green Genie pill on the answer means it routed to your
space; otherwise the local engine answered.

---

## 4. Tellr deck export

Tellr is the [`ai-slide-generator`](https://robertwhiffin.github.io/ai-slide-generator/)
Databricks App. RevIntel's **Export to Presentation** button calls its MCP
endpoint, polls until the deck is ready, and downloads a PDF.

### a. One-time CLI setup

```bash
# Replace <tellr-workspace-host> with the workspace that hosts the Tellr App.
# This opens a browser to complete OAuth U2M; tokens are cached locally.
databricks auth login --host <tellr-workspace-host> --profile tellr
```

### b. Mint an OAuth U2M token

```bash
databricks auth token -p tellr | jq -r .access_token
```

> ⚠️ **Tellr rejects PATs (`dapi…`).** It is a Databricks App and only
> accepts OAuth U2M access tokens. The CLI manages refresh tokens for
> you — re-run the command above whenever you need a fresh access
> token.

### c. Paste into `backend/.env`

```env
TELLR_BASE_URL=https://<tellr-app-slug>-<workspace-id>.<region>.databricksapps.com
DATABRICKS_OAUTH_TOKEN=<paste the access token from step b>
```

### d. Restart the backend

```bash
lsof -ti:8000 | xargs kill -9
make backend
```

### e. Verify

```bash
curl -s http://localhost:8000/api/tellr/health | jq
```

You should see:

```json
{
  "configured": true,
  "pattern": "B",
  "base_url_set": true,
  "forwarded_email_present": false,
  "bearer_token_present": true
}
```

Then click **Export to Presentation** on the dashboard. A modal shows the
deck progress (`pending` → `ready`), then auto-downloads a PDF.

### f. Token lifetime — the most common gotcha

Databricks U2M access tokens live **~1 hour**. When that lapses, every
Tellr call returns `401 Unauthorized` and the modal shows
`Generation failed.`

Recovery:

```bash
# 1. Mint a fresh token
databricks auth token -p tellr | jq -r .access_token

# 2. Replace DATABRICKS_OAUTH_TOKEN= in backend/.env

# 3. Restart the backend (uvicorn --reload doesn't watch .env)
lsof -ti:8000 | xargs kill -9
make backend
```

If you'd like the backend to refresh the token automatically, see the
TODOs in `backend/services/tellr_mcp.py` — the simplest path is to shell
out to `databricks auth token -p <profile>` lazily on each request.

---

## 5. Optional polish

### Login screen "Open Genie room →" link

Set in `frontend/.env.local`:

```env
NEXT_PUBLIC_GENIE_ROOM_URL=https://<workspace>/genie/rooms/<space-id>?o=<org-id>
```

Leave unset to hide the link entirely.

### Demo access code

Gate the persona picker on a shared secret:

```env
# frontend/.env.local
NEXT_PUBLIC_DEMO_ACCESS_CODE=letmein
```

The login form renders an "Access code" input only when this is set.

---

## 6. Verifying everything end-to-end

```bash
# Health
curl -s http://localhost:8000/api/health
# → {"status":"ok","platform":"RevIntel POC"}

# Tellr ready?
curl -s http://localhost:8000/api/tellr/health | jq

# Live KPIs
curl -s "http://localhost:8000/api/kpis/summary?view=ytd&period_start=2025-01-01&period_end=2025-12-31" | jq '.kpis | keys'
# → ["chargeable-hours","gross-fee-days","rate-per-hour","unbilled-days"]

# Genie via the chat endpoint (requires DATABRICKS_* set)
curl -s -X POST http://localhost:8000/api/nlp/chat \
  -H "Content-Type: application/json" \
  -d '{"question":"Why did chargeable hours drop in December?"}' | jq '.engine'
# → "genie"  (or "local" if Genie isn't configured)
```

If all four pass, you're done.
