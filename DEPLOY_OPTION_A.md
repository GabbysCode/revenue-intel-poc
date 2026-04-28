# Deploy RevIntel — Option A (locked-down laptop, no Python toolchain needed)

This is the **share-with-a-colleague** guide for deploying RevIntel as two
Databricks Apps (`revintel-backend` + `revintel-frontend`) into the **same
workspace as the Tellr app**. The Apps proxy injects user identity and no
service principal is needed (Pattern A auth).

The repo ships a **pre-built backend wheel** under `releases/`, so you do
not need to install Python build tools, set up a venv, or run `pip
install` locally. You just need Git, Node.js (for the frontend build),
the Databricks CLI, and the system Python that comes with macOS / Linux
(or a single python.org installer on Windows).

If you have `make`, `jq`, and `bash`, [`DEPLOY.md`](DEPLOY.md) is shorter.

---

## 0. One-time prerequisites

Each row below has install paths that don't need `sudo` or Homebrew.

| Tool | macOS / Linux | Windows |
|---|---|---|
| Git | preinstalled, or [git-scm.com](https://git-scm.com/downloads) | `winget install Git.Git` |
| Node.js ≥ 18 + npm ≥ 9 | [nodejs.org installer](https://nodejs.org/en/download) | `winget install OpenJS.NodeJS.LTS` |
| Python 3 (any 3.x ≥ 3.8) | preinstalled (`python3 --version`) | `winget install Python.Python.3.11` |
| Databricks CLI ≥ 0.230 | Download macOS/Linux binary from [GitHub releases](https://github.com/databricks/cli/releases) → unzip → put `databricks` on `$PATH` | Same — grab the `windows_amd64` zip, unzip, add the folder to `PATH` |

You also need:

1. **Workspace access** to the Tellr workspace: `https://fevm-db-tellr-dev-workspace.cloud.databricks.com`
2. **App-level access** on the Tellr app — ask whoever owns Tellr to add your user on its *Permissions* tab. The Tellr app is `db-tellr-dev` in that workspace.

> Verify your installs: `git --version`, `node --version`, `npm --version`, `python3 --version`, `databricks --version`. All five must succeed before you continue.

---

## 1. Clone the repo

```bash
git clone https://github.com/GabbysCode/revenue-intel-poc.git
cd revenue-intel-poc
```

Confirm the prebuilt wheel is present:

```bash
ls releases/
# → revintel_backend-0.1.0-py3-none-any.whl
```

That's the wheel you'll deploy. **No `pip install`, no `python -m build`, no backend venv setup needed.**

---

## 2. Authenticate the Databricks CLI

```bash
databricks auth login \
  --host https://fevm-db-tellr-dev-workspace.cloud.databricks.com \
  --profile tellr-dev
```

A browser pops up — sign in. Then sanity-check (uses stdlib Python instead of `jq`):

```bash
databricks current-user me -p tellr-dev -o json > me.json
python3 -c "import json; print(json.load(open('me.json'))['userName'])"
# → your.name@databricks.com
```

**Note your username** — replace `<YOUR.USERNAME>` everywhere below with the value the command above printed (e.g. `jane.doe@databricks.com`).

---

## 3. Stage the backend deploy bundle

The deployed backend only needs two files: the spec (`app.yaml`) and the wheel from `releases/`.

### macOS / Linux

```bash
mkdir -p /tmp/revintel-deploy/dist
cp backend/app.yaml /tmp/revintel-deploy/app.yaml
cp releases/revintel_backend-*.whl /tmp/revintel-deploy/dist/
ls /tmp/revintel-deploy /tmp/revintel-deploy/dist
```

### Windows PowerShell

```powershell
$stage = Join-Path $env:TEMP "revintel-deploy"
Remove-Item -Recurse -Force $stage -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Path "$stage\dist" | Out-Null
Copy-Item backend\app.yaml "$stage\app.yaml"
Copy-Item releases\revintel_backend-*.whl "$stage\dist\"
Get-ChildItem $stage, "$stage\dist"
```

---

## 4. Import both apps' source into the workspace

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

The frontend upload takes a minute (it's the bigger of the two, but `node_modules/` and `.next/` are excluded — they're built on the Databricks side).

---

## 5. Create both apps (idempotent — re-runs are safe)

```bash
databricks apps create --json "{\"name\":\"revintel-backend\",\"description\":\"RevIntel FastAPI backend\"}"  -p tellr-dev
databricks apps create --json "{\"name\":\"revintel-frontend\",\"description\":\"RevIntel Next.js frontend\"}" -p tellr-dev
```

> If the apps already exist, you'll see a `RESOURCE_ALREADY_EXISTS` error — ignore it.

---

## 6. Deploy the backend (first pass)

```bash
databricks apps deploy revintel-backend \
  --source-code-path "/Workspace/Users/<YOUR.USERNAME>/revintel/backend" \
  -p tellr-dev
```

Takes ~1-2 minutes. Databricks Apps runs `pip install dist/revintel_backend-*.whl` and starts the `revintel-backend` console entry point.

---

## 7. Wire the frontend to the backend URL

Get the backend URL into a file, then build the frontend env JSON with stdlib Python (no `jq`, no heredocs):

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
```

You should see `BACKEND_URL = https://revintel-backend-…databricksapps.com` and a 4-line JSON file. Apply it:

```bash
databricks apps update revintel-frontend --json @frontend-env.json -p tellr-dev
```

---

## 8. Deploy the frontend

```bash
databricks apps deploy revintel-frontend \
  --source-code-path "/Workspace/Users/<YOUR.USERNAME>/revintel/frontend" \
  -p tellr-dev
```

First-time deploy is slow (~90 s) because it runs `npm ci && npm run build` on the Databricks side. Subsequent deploys are quick.

---

## 9. Tell the backend where Tellr is

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

## 10. Smoke test

```bash
databricks apps get revintel-backend  -p tellr-dev -o json > be.json
databricks apps get revintel-frontend -p tellr-dev -o json > fe.json

python3 -c "
import json
print('BACKEND :', json.load(open('be.json')).get('url') or json.load(open('be.json')).get('app_url'))
print('FRONTEND:', json.load(open('fe.json')).get('url') or json.load(open('fe.json')).get('app_url'))
"
```

Take the printed `BACKEND` URL and open these two paths in your browser (the apps are behind workspace auth, so the browser-based check is easier than `curl`):

- `<BACKEND_URL>/api/health` → `{"status": "ok", "platform": "RevIntel POC"}`
- `<BACKEND_URL>/api/tellr/health` → must show `"pattern": "A"` and `"configured": true`. If you see `"pattern": "B"` you're not in the same workspace as Tellr, or app-level access on the Tellr app is missing.

Then open the `FRONTEND` URL, pick any persona on `/login`, land on the dashboard, and click **Export to Presentation**. The deck progress modal should run to "ready" and download a PDF.

---

## Re-deploying after a code change

The maintainer rebuilds the wheel via `make wheel` (which refreshes both `backend/dist/` and `releases/`) and commits it. To pick up that new wheel and redeploy, you just run:

```bash
git pull origin main
# Re-stage with the new wheel:
rm -rf /tmp/revintel-deploy && mkdir -p /tmp/revintel-deploy/dist
cp backend/app.yaml /tmp/revintel-deploy/app.yaml
cp releases/revintel_backend-*.whl /tmp/revintel-deploy/dist/
# Re-import + redeploy backend:
databricks workspace import-dir /tmp/revintel-deploy \
  "/Workspace/Users/<YOUR.USERNAME>/revintel/backend" \
  --overwrite -p tellr-dev
databricks apps deploy revintel-backend \
  --source-code-path "/Workspace/Users/<YOUR.USERNAME>/revintel/backend" \
  -p tellr-dev
```

If the frontend changed too, rerun steps 4 (frontend half) and 8.

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
| `releases/` is empty | The version of the repo you cloned predates the wheel artifacts. `git pull origin main` and re-check, or fall back to building locally (`pip install -e backend && pip install build && cd backend && python -m build --wheel --outdir dist && cp dist/*.whl ../releases/`). |
| `databricks: command not found` | The CLI binary isn't on `$PATH`. `which databricks` (macOS / Linux) or `where.exe databricks` (Windows). Re-add the folder it lives in to `PATH`. |
| `databricks apps deploy` → `PERMISSION_DENIED` | Your CLI auth profile doesn't have permission to create / deploy apps in the Tellr workspace. Ask a workspace admin to grant the `workspace.apps:CAN_MANAGE` privilege. |
| `/api/tellr/health` shows `"pattern": "B"` | You deployed into the wrong workspace (Pattern A only works in the same workspace as Tellr). Re-run from step 2 with the correct workspace host. |
| Tellr export → 401 / 403 | App-level access on the Tellr app is missing. Tellr owner must add your user (the human one, not a service principal) on the Tellr app's *Permissions* tab. |
| Frontend opens but every API call returns 502 | `BACKEND_UPSTREAM` didn't get set on the frontend. Re-run step 7 and confirm: `databricks apps get revintel-frontend -p tellr-dev -o json > fe.json && python3 -c "import json; print(json.load(open('fe.json')).get('env'))"` |

If you're stuck after 30 minutes, ping the RevIntel maintainer with the output of:

```bash
databricks apps get revintel-backend  -p tellr-dev -o json > be.json
databricks apps get revintel-frontend -p tellr-dev -o json > fe.json
databricks apps logs revintel-backend  -p tellr-dev > be.log 2>&1   # Ctrl-C after a few seconds
databricks apps logs revintel-frontend -p tellr-dev > fe.log 2>&1   # Ctrl-C after a few seconds
```

…and attach the four files. That's enough context to debug almost anything.
