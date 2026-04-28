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

> **No Homebrew, no PowerShell 7+, or otherwise locked-down laptop?**
> Skip ahead to [Locked-down laptops](#locked-down-laptops) for no-admin
> install paths and a fully Docker-only route.

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

make setup        # creates backend/.venv, installs the backend wheel in
                  # editable mode, installs npm deps, seeds DuckDB
make dev          # backend on :8000 (via the `revintel-backend` entry
                  # point), frontend on :3000
```

> The backend is now an installable Python package (`revintel-backend`).
> `make setup` runs `pip install -e backend`, which means edits in
> `backend/src/revintel_backend/` show up live without rebuilding the
> wheel — same fast inner loop, but `make dev` exercises the same console
> entry point that ships in the deployed Databricks App.

Open <http://localhost:3000>.

> The dashboard works fully offline — the four headline KPIs, drill-downs
> and prompt chips all run against the local DuckDB seed. Genie + Tellr
> only kick in once you fill in `backend/.env`.

### 2a. (Optional) Build the wheel for deployment

```bash
make wheel
# → backend/dist/revintel_backend-0.1.0-py3-none-any.whl
```

The wheel is what ships to Databricks Apps via `databricks/deploy.sh` —
see [`DEPLOY.md`](DEPLOY.md). Building it locally first is a useful smoke
test that the package metadata, dependencies, and entry point all resolve
cleanly. You don't need to build it for local dev.

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

> 🛈 **This whole section is local-dev only.** It walks you through Pattern B
> (a static OAuth U2M bearer token in `DATABRICKS_OAUTH_TOKEN`), which is the
> easiest path on a laptop but expires every hour and has no auto-refresh.
> When you deploy RevIntel as Databricks Apps you switch to Pattern A
> (same workspace as Tellr, identity injected by the Apps proxy — no token)
> or Pattern C (cross-workspace deploy, service-principal OAuth M2M with
> auto-refresh). See [`DEPLOY.md`](DEPLOY.md) for that flow.

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
  "sp_cache_present": false,
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

If you'd like to skip the manual refresh dance entirely, deploy as
Databricks Apps and use Pattern A or Pattern C — both handle token
plumbing for you (Pattern A has no tokens, Pattern C auto-refreshes).
See [`DEPLOY.md`](DEPLOY.md).

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

---

## Locked-down laptops

You don't need Homebrew, PowerShell 7+, or admin rights to run RevIntel.
Pick the row that matches what your laptop won't let you do.

### macOS without Homebrew

| Tool | No-Homebrew install |
|------|---------------------|
| **Python 3.11** | Official `.pkg` installer from <https://www.python.org/downloads/macos/> — no admin needed when installed for the current user. |
| **Node.js / npm** | `nvm` is a pure shell script that installs into `~/.nvm` (no sudo): `curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh \| bash && nvm install 18` |
| **Databricks CLI** | The official static-binary script (Homebrew is just one option): `curl -fsSL https://raw.githubusercontent.com/databricks/setup-cli/main/install.sh \| sh` — pass `-b ~/bin` for a userland install. |
| **`jq`** | Static binary download: `curl -L -o ~/bin/jq https://github.com/jqlang/jq/releases/latest/download/jq-macos-arm64 && chmod +x ~/bin/jq` (use `jq-macos-amd64` on Intel). |
| **`make`** | Comes with Xcode Command Line Tools: `xcode-select --install` (single GUI prompt, no Apple ID needed). |

### Windows on Windows PowerShell 5.1 (no PS 7+)

The QUICKSTART commands are bash-shaped, so the cleanest fix is to **stop
using PowerShell entirely**.

**Best option — Git Bash** (ships with Git for Windows, no admin):

Download from <https://git-scm.com/download/win>, then run every command
in this guide from the Git Bash prompt — `curl`, `kill`, `make`
substitutions below, etc. all work as-is.

**If even Git Bash is blocked**, use the native Windows installers:

| Tool | Native Windows install |
|------|------------------------|
| **Python 3.11** | `.exe` installer from <https://www.python.org/downloads/windows/>. Pick "Install for me only" — no admin needed. |
| **Node.js** | `.msi` installer from <https://nodejs.org/en/download> (user-scope install). |
| **Databricks CLI** | Download `databricks_cli_*_windows_amd64.zip` from <https://github.com/databricks/cli/releases>, unzip into `%USERPROFILE%\bin`, add that folder to your `Path`. |
| **`jq`** | Grab `jq-windows-amd64.exe` from <https://github.com/jqlang/jq/releases>, rename to `jq.exe`, drop on your `Path`. |
| **`make`** | Skip it — see the [`make`-free commands](#make-free-equivalents) below. |

### `jq`-free alternative (works everywhere)

Wherever this guide says `… | jq -r .access_token`, swap in this Python
one-liner — Python is already a prereq:

```bash
databricks auth token -p tellr | python -c "import json,sys;print(json.load(sys.stdin)['access_token'])"
```

### `make`-free equivalents

The Makefile is convenience wrappers around three things. Direct
equivalents:

```bash
# instead of `make setup`
python3.11 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip
backend/.venv/bin/pip install -r backend/requirements.txt
cd frontend && npm install && cd ..
backend/.venv/bin/python -c "import sys; sys.path.insert(0,'backend'); from db.connection import init_db; init_db()"

# instead of `make dev` — open two terminals
# terminal 1
cd backend && ../backend/.venv/bin/uvicorn main:app --reload --port 8000
# terminal 2
cd frontend && npx next dev
```

On Windows replace `backend/.venv/bin/...` with `backend\.venv\Scripts\...`.

### "Skip the install entirely" — Docker-only route

If your laptop **can run Docker Desktop** (or [Rancher Desktop](https://rancherdesktop.io/)
or [Podman Desktop](https://podman-desktop.io/) — both free and side-step
the Docker license question), you can run the entire app with **zero
local Python or Node**:

```bash
git clone https://github.com/GabbysCode/revenue-intel-poc.git
cd revenue-intel-poc
cp backend/.env.example backend/.env       # fill in your values
docker compose up --build
```

The repo's `docker-compose.yml` builds the backend (Python 3.11) and
frontend (Node) images and wires them together — only Docker is needed
on the host. Open <http://localhost:3000>.

If even Docker is off-limits, **GitHub Codespaces** or any **VS Code
Dev Container** runs the whole stack in a browser tab on someone else's
machine — no local install at all.
