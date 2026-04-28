# Deploy RevIntel — Option A (locked-down laptop, no `make` / `jq` / `brew`)

This is the **share-with-a-colleague** guide for deploying RevIntel as two
Databricks Apps (`revintel-backend` + `revintel-frontend`) into the **same
workspace as the Tellr app**, where the Apps proxy injects user identity and
no service principal is needed (Pattern A auth).

It uses **only** Python, Node, Git, and the Databricks CLI — no Make,
no jq, no Homebrew, no bash heredocs, so it works on a fully locked-down
macOS / Linux / Windows box.

If you have `make`, `jq`, and `bash`, [`DEPLOY.md`](DEPLOY.md) is shorter.

---

## 0. One-time prerequisites

Each row below has install paths that don't need `sudo` or Homebrew.

| Tool | macOS / Linux | Windows |
|---|---|---|
| Python ≥ 3.11 | [python.org installer](https://www.python.org/downloads/) | python.org installer or `winget install Python.Python.3.11` |
| Node.js ≥ 18 + npm ≥ 9 | [nodejs.org installer](https://nodejs.org/en/download) or `nvm install 20` | nodejs.org installer or `winget install OpenJS.NodeJS.LTS` |
| Git | [git-scm.com](https://git-scm.com/downloads) | `winget install Git.Git` |
| Databricks CLI ≥ 0.230 | Download the macOS/Linux binary from [GitHub releases](https://github.com/databricks/cli/releases) → unzip → put `databricks` on `$PATH` | Same — grab the `.zip` for `windows_amd64`, unzip, add the folder to `PATH` |

You also need, **before deploying**:

1. **Workspace access** to the Tellr workspace: `https://fevm-db-tellr-dev-workspace.cloud.databricks.com`.
2. **App-level access** on the Tellr app — ask whoever owns Tellr to add your user on its *Permissions* tab. The Tellr app is `db-tellr-dev` in that workspace.

> **Verify your installs** with `python3.11 --version`, `node --version`, `npm --version`, `git --version`, `databricks --version`. All five must succeed before you continue.

---

## 1. Clone the repo

```bash
git clone https://github.com/GabbysCode/revenue-intel-poc.git
cd revenue-intel-poc
```

---

## 2. Set up the backend Python environment

We're skipping `make setup` and running the steps it would have run, by hand.

### macOS / Linux

```bash
python3.11 -m venv backend/.venv
backend/.venv/bin/pip install --upgrade pip build
backend/.venv/bin/pip install -e backend
```

### Windows PowerShell

```powershell
py -3.11 -m venv backend\.venv
backend\.venv\Scripts\pip.exe install --upgrade pip build
backend\.venv\Scripts\pip.exe install -e backend
```

> The `pip install -e backend` step pulls every dependency listed in `backend/pyproject.toml` (FastAPI, uvicorn, DuckDB, httpx, etc.). It takes 1-2 minutes.

---

## 3. Build the wheel that gets deployed

### macOS / Linux

```bash
rm -rf backend/dist backend/build
cd backend
../backend/.venv/bin/python -m build --wheel --outdir dist
cd ..
ls backend/dist/                                  # should show revintel_backend-0.1.0-py3-none-any.whl
```

### Windows PowerShell

```powershell
Remove-Item -Recurse -Force backend\dist, backend\build -ErrorAction SilentlyContinue
cd backend
..\backend\.venv\Scripts\python.exe -m build --wheel --outdir dist
cd ..
Get-ChildItem backend\dist
```

> If the build step fails with `ModuleNotFoundError: build`, fall back to the offline-friendly path that uses the setuptools already in your venv:
>
> macOS / Linux: `cd backend && ../backend/.venv/bin/pip wheel . --no-deps --no-build-isolation -w dist && cd ..`
>
> Windows: `cd backend; ..\backend\.venv\Scripts\pip.exe wheel . --no-deps --no-build-isolation -w dist; cd ..`

---

## 4. Authenticate the Databricks CLI

```bash
databricks auth login \
  --host https://fevm-db-tellr-dev-workspace.cloud.databricks.com \
  --profile tellr-dev
```

A browser pops up — sign in. Then sanity-check (replaces `jq` with stdlib Python so you don't need to install anything extra):

```bash
databricks current-user me -p tellr-dev -o json > me.json
python3 -c "import json; print(json.load(open('me.json'))['userName'])"
# → your.name@databricks.com
```

Save your username for the rest of this guide. Replace `<YOUR.USERNAME>` everywhere below with the value the command above printed (e.g. `jane.doe@databricks.com`). On macOS / Linux you can also do `export ME="$(python3 -c "import json; print(json.load(open('me.json'))['userName'])")"` and use `$ME` in place of `<YOUR.USERNAME>`.

---

## 5. Stage the backend deploy bundle

The deployed backend only needs two files: the spec (`app.yaml`) and the wheel. Stage them in a separate folder so the workspace upload doesn't drag along the source tree.

### macOS / Linux

```bash
mkdir -p /tmp/revintel-deploy/dist
cp backend/app.yaml /tmp/revintel-deploy/app.yaml
cp backend/dist/revintel_backend-*.whl /tmp/revintel-deploy/dist/
ls /tmp/revintel-deploy /tmp/revintel-deploy/dist
```

### Windows PowerShell

```powershell
$stage = Join-Path $env:TEMP "revintel-deploy"
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$stage\dist" | Out-Null
Copy-Item backend\app.yaml "$stage\app.yaml"
Copy-Item backend\dist\revintel_backend-*.whl "$stage\dist\"
Get-ChildItem $stage, "$stage\dist"
```

---

## 6. Import the source into the workspace

Run twice — once for backend, once for frontend.

### macOS / Linux

```bash
databricks workspace import-dir /tmp/revintel-deploy \
  "/Workspace/Users/<YOUR.USERNAME>/revintel/backend" \
  --overwrite -p tellr-dev

databricks workspace import-dir frontend \
  "/Workspace/Users/<YOUR.USERNAME>/revintel/frontend" \
  --overwrite -p tellr-dev
```

### Windows PowerShell

```powershell
databricks workspace import-dir "$stage" `
  "/Workspace/Users/<YOUR.USERNAME>/revintel/backend" `
  --overwrite -p tellr-dev

databricks workspace import-dir frontend `
  "/Workspace/Users/<YOUR.USERNAME>/revintel/frontend" `
  --overwrite -p tellr-dev
```

The frontend upload takes a minute (it's the bigger of the two). It does **not** include `node_modules/` or `.next/` — those get built on the Databricks side.

---

## 7. Create the two apps (idempotent — re-runs are safe)

```bash
databricks apps create --json "{\"name\":\"revintel-backend\",\"description\":\"RevIntel FastAPI backend\"}"  -p tellr-dev
databricks apps create --json "{\"name\":\"revintel-frontend\",\"description\":\"RevIntel Next.js frontend\"}" -p tellr-dev
```

> If the apps already exist, you'll see a `RESOURCE_ALREADY_EXISTS` error — ignore it.

---

## 8. Deploy the backend

```bash
databricks apps deploy revintel-backend \
  --source-code-path "/Workspace/Users/<YOUR.USERNAME>/revintel/backend" \
  -p tellr-dev
```

This takes ~1-2 minutes. The Apps runtime runs `pip install dist/revintel_backend-*.whl` and starts the `revintel-backend` console entry point.

---

## 9. Tell the frontend where the backend is

Get the backend URL into a file, then build the frontend env JSON with Python (no `jq`, no heredocs):

```bash
databricks apps get revintel-backend -p tellr-dev -o json > be.json
python3 -c "
import json
be  = json.load(open('be.json'))
url = be.get('url') or be.get('app_url') or ''
print('BACKEND_URL =', url)
open('frontend-env.json', 'w').write(json.dumps({
    'name': 'revintel-frontend',
    'env': [{'name': 'BACKEND_UPSTREAM', 'value': url}],
}, indent=2))
"
cat frontend-env.json   # Windows: type frontend-env.json
```

You should see `BACKEND_URL = https://revintel-backend-…databricksapps.com` and a 4-line JSON file. Apply it:

```bash
databricks apps update revintel-frontend --json @frontend-env.json -p tellr-dev
```

---

## 10. Deploy the frontend

```bash
databricks apps deploy revintel-frontend \
  --source-code-path "/Workspace/Users/<YOUR.USERNAME>/revintel/frontend" \
  -p tellr-dev
```

First-time deploy is slow (~90 s) because it runs `npm ci && npm run build` on the Databricks side. Subsequent deploys are quick.

---

## 11. Tell the backend where Tellr is

Same Python-builds-the-JSON pattern:

```bash
python3 -c "
import json
open('backend-env.json', 'w').write(json.dumps({
    'name': 'revintel-backend',
    'env': [
        {'name': 'TELLR_BASE_URL',
         'value': 'https://db-tellr-dev-7474645249186749.aws.databricksapps.com'}
    ],
}, indent=2))
"
databricks apps update revintel-backend --json @backend-env.json -p tellr-dev
```

Re-deploy the backend so the new env block takes effect:

```bash
databricks apps deploy revintel-backend \
  --source-code-path "/Workspace/Users/<YOUR.USERNAME>/revintel/backend" \
  -p tellr-dev
```

> **Optional (Genie chat):** if you also want the natural-language assistant on the right-hand pane to answer real questions, add `DATABRICKS_HOST`, `DATABRICKS_TOKEN` (a PAT works for Genie), and `GENIE_SPACE_ID` to the same env block above before re-deploying. Without them the chat falls back to the local DuckDB engine — every other page works fine.

---

## 12. Smoke test

```bash
databricks apps get revintel-backend  -p tellr-dev -o json > be.json
databricks apps get revintel-frontend -p tellr-dev -o json > fe.json

python3 -c "
import json
print('BACKEND :', json.load(open('be.json')).get('url') or json.load(open('be.json')).get('app_url'))
print('FRONTEND:', json.load(open('fe.json')).get('url') or json.load(open('fe.json')).get('app_url'))
"
```

Take the printed `BACKEND` URL and curl the two health endpoints (the backend is behind workspace auth, so curl from your authenticated browser via the URL bar is easier than curl from a terminal):

- `<BACKEND_URL>/api/health` — should return `{"status": "ok", "platform": "RevIntel POC"}`.
- `<BACKEND_URL>/api/tellr/health` — must show `"pattern": "A"` and `"configured": true`. If it shows `"pattern": "B"` you're not in the same workspace as Tellr, or app-level access on the Tellr app is missing.

Then open the `FRONTEND` URL, pick any persona on `/login`, land on the dashboard, and click **Export to Presentation**. The deck progress modal should run to "ready" and download a PDF.

---

## Re-deploying after a code change

You'll repeat steps 3, 5, 6, 8, and 10 (build wheel → restage → re-import → deploy backend → deploy frontend). The env-var steps (9, 11) only need to run again when the Tellr URL or backend URL actually change.

---

## Tailing logs while debugging

```bash
databricks apps logs revintel-backend  -p tellr-dev
databricks apps logs revintel-frontend -p tellr-dev
```

Press Ctrl-C to stop.

---

## Common gotchas

| Symptom | Fix |
|---|---|
| `databricks: command not found` | The CLI binary isn't on `$PATH`. Verify with `which databricks` (macOS / Linux) or `where.exe databricks` (Windows). Re-add the folder it lives in to `PATH`. |
| `python3.11: command not found` | Either install from python.org, or use whatever Python you have ≥ 3.11 — replace `python3.11` with `python3` everywhere and re-check `python3 --version`. |
| `pip install -e backend` is slow / fails | If you're behind a corporate proxy, run `pip config set global.proxy http://your.proxy:port`. If your security policy blocks PyPI, you'll need to ask for an exception — RevIntel has 12 runtime deps, all standard. |
| `python -m build` → `ModuleNotFoundError: build` | Use the offline-friendly fallback shown in step 3: `pip wheel . --no-deps --no-build-isolation -w dist`. |
| `databricks apps deploy` → `PERMISSION_DENIED` | Your CLI auth profile doesn't have permission to create/deploy apps in the Tellr workspace. Ask a workspace admin to grant the `workspace.apps:CAN_MANAGE` privilege. |
| `/api/tellr/health` shows `"pattern": "B"` | You deployed into the wrong workspace (Pattern A only works in the same workspace as Tellr). Re-run from step 4 with the correct workspace host. |
| Tellr export → 401 / 403 | App-level access on the Tellr app is missing. Tellr owner must add your user (the human one, not a service principal) on the Tellr app's *Permissions* tab. |
| Frontend opens but every API call returns 502 | `BACKEND_UPSTREAM` didn't get set on the frontend. Re-run step 9 and confirm with `databricks apps get revintel-frontend -p tellr-dev -o json > fe.json && python3 -c "import json; print(json.load(open('fe.json')).get('env'))"` |

If you're stuck after 30 minutes, ping the RevIntel maintainer with the output of:

```bash
databricks apps get revintel-backend  -p tellr-dev -o json > be.json
databricks apps get revintel-frontend -p tellr-dev -o json > fe.json
databricks apps logs revintel-backend  -p tellr-dev > be.log 2>&1   # Ctrl-C after a few seconds
databricks apps logs revintel-frontend -p tellr-dev > fe.log 2>&1   # Ctrl-C after a few seconds
```

…and attach the four files. That's enough context to debug almost anything.
