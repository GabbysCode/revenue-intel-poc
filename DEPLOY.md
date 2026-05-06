# Deploying RevIntel to Databricks Apps

RevIntel ships as **two separate Databricks Apps**: a FastAPI backend and a Next.js frontend. The browser only ever talks to the frontend's origin; the frontend's Node process proxies `/api/*` to the backend over HTTPS.

```
Browser ──► revintel-frontend (Next.js) ──► revintel-backend (FastAPI) ──► Tellr (ai-slide-generator)
                                                                       └─► Databricks Genie
```

This doc covers everything from the workspace decision down to post-deploy smoke tests. For local development, see [`QUICKSTART.md`](QUICKSTART.md) instead.

---

## 1. Pick the workspace (this drives the auth pattern)

Tellr is a Databricks App, which means it lives in a specific workspace. Where you deploy RevIntel relative to that workspace decides which auth pattern you can use:

| You deploy RevIntel into… | Tellr auth | What you have to set up | Notes |
|---|---|---|---|
| **The same workspace as Tellr** | Pattern A (forwarded identity) | Nothing extra. The Apps proxy injects the human user's email and Tellr trusts it. | Cleanest auth story. Decks attribute to the actual user. RevIntel lives in the Tellr workspace though, which may not be the right long-term home. |
| **A different workspace** (or an arbitrary cloud workspace) | Pattern C (service-principal OAuth M2M) | A service principal in the *Tellr* workspace, granted app-level access on the Tellr app, plus its OAuth client secret stored as an env var on the RevIntel backend. | Decks attribute to the SP, not the human user — that's a Tellr-side limitation. Pattern C tokens auto-refresh, so there's no manual rotation. |

Both options use the same RevIntel code — `detect_pattern()` in `backend/services/tellr_mcp.py` picks per request based on what's available.

> **Pattern B** (a static `DATABRICKS_OAUTH_TOKEN` minted with `databricks auth token`) is local-dev-only. It works in production but tokens expire in ~1 hour and there's no auto-refresh, so you'd be back here re-deploying every hour. Don't use B in production.

---

## 2. One-time prerequisites

1. **Databricks CLI ≥ 0.230** (`brew install databricks/tap/databricks` or download from [the releases page](https://github.com/databricks/cli/releases)).
2. **`jq`** (`brew install jq` or `apt-get install jq`).
3. **An auth profile pointing at the target workspace.** Run:
   ```bash
   databricks auth login --host https://<your-workspace>.cloud.databricks.com --profile revintel-deploy
   ```
   This profile is what you'll pass to `deploy.sh`.
4. **App-level access on the Tellr app** for whichever identity is going to call it (the human user for Pattern A; the SP for Pattern C). A workspace admin in the Tellr workspace grants this from the Tellr app's *Permissions* tab.

### Pattern C only — create the service principal

This step lives in the **Tellr workspace** (not the RevIntel workspace), and needs a workspace admin there.

1. Account console → *User management* → *Service principals* → **Add service principal**. Give it a name like `revintel-tellr-sp`.
2. Add it to the Tellr workspace and grant it app access on the Tellr app:
   ```bash
   databricks apps update <tellr-app-name> \
     --json '{"resources":[{"name":"sp","servicePrincipal":{"name":"revintel-tellr-sp","permission":"CAN_USE"}}]}' \
     -p tellr-workspace-profile
   ```
3. Mint an OAuth secret for the SP:
   ```bash
   databricks service-principal-secrets create \
     --service-principal-id <sp-application-id> \
     -p tellr-workspace-profile
   ```
   Capture both `client_id` and `secret` from the response — the secret is shown once and never again.
4. You'll plug those two values into `TELLR_SP_CLIENT_ID` / `TELLR_SP_CLIENT_SECRET` on the RevIntel backend in step 4 below.

---

## 3. Deploy with the helper script

```bash
./databricks/deploy.sh revintel-deploy            # uses default app names
# or
./databricks/deploy.sh revintel-deploy revintel-backend revintel-frontend
```

The script:

1. **Builds the backend wheel** (`backend/dist/revintel_backend-<ver>-py3-none-any.whl`).
2. Imports a slim deploy bundle (`app.yaml` + `dist/`) → `/Workspace/Users/<me>/revintel/backend`. The raw `src/` tree is **not** uploaded — the wheel contains everything the runtime needs.
3. Imports `frontend/` → `/Workspace/Users/<me>/revintel/frontend`.
4. Creates both apps if they don't exist.
5. Deploys the backend.
6. Reads the backend's URL via `databricks apps get` and writes it into `BACKEND_UPSTREAM` on the frontend.
7. Deploys the frontend.

It does **not** set Tellr or Genie env vars — those live outside source control.

### Manual fallback

If `deploy.sh` doesn't fit your workflow:

```bash
# Backend — build the wheel and ship just the wheel + app.yaml
make wheel
STAGE=$(mktemp -d) && mkdir -p "$STAGE/dist"
cp backend/app.yaml          "$STAGE/"
cp backend/dist/*.whl        "$STAGE/dist/"
databricks workspace import-dir "$STAGE" /Workspace/Users/$USER/revintel/backend --overwrite -p $PROFILE
databricks apps create --json '{"name":"revintel-backend"}' -p $PROFILE
databricks apps deploy revintel-backend --source-code-path /Workspace/Users/$USER/revintel/backend -p $PROFILE

# Read backend URL
BACKEND_URL=$(databricks apps get revintel-backend -p $PROFILE -o json | jq -r '.url')

# Frontend
databricks workspace import-dir frontend /Workspace/Users/$USER/revintel/frontend --overwrite -p $PROFILE
databricks apps create --json '{"name":"revintel-frontend"}' -p $PROFILE
databricks apps update revintel-frontend \
  --json "{\"name\":\"revintel-frontend\",\"env\":[{\"name\":\"BACKEND_UPSTREAM\",\"value\":\"$BACKEND_URL\"}]}" -p $PROFILE
databricks apps deploy revintel-frontend --source-code-path /Workspace/Users/$USER/revintel/frontend -p $PROFILE
```

---

## 4. Set the runtime env vars (the part `deploy.sh` doesn't do)

Set these on the **backend** app:

```bash
databricks apps update revintel-backend --json @- -p $PROFILE <<EOF
{
  "name": "revintel-backend",
  "env": [
    { "name": "TELLR_BASE_URL",        "value": "https://<tellr-app-host>.databricksapps.com" },

    # Pattern C only — leave these out for same-workspace (Pattern A) deploys
    { "name": "TELLR_SP_CLIENT_ID",    "value": "<sp-client-id>" },
    { "name": "TELLR_SP_CLIENT_SECRET","valueFrom": "tellr/sp_client_secret" },

    # Genie (optional — without it the NLP pane uses local DuckDB)
    { "name": "DATABRICKS_HOST",       "value": "https://<your-workspace>.cloud.databricks.com" },
    { "name": "DATABRICKS_TOKEN",      "valueFrom": "genie/pat" },
    { "name": "GENIE_SPACE_ID",        "value": "<genie-space-id>" }
  ]
}
EOF
```

`valueFrom` references Databricks Apps secrets. Create them with:

```bash
databricks apps secrets put-secret revintel-backend tellr/sp_client_secret --string-value '<the-actual-secret>' -p $PROFILE
databricks apps secrets put-secret revintel-backend genie/pat              --string-value 'dapi...'              -p $PROFILE
```

Then re-deploy so the new env block takes effect:

```bash
databricks apps deploy revintel-backend --source-code-path /Workspace/Users/$USER/revintel/backend -p $PROFILE
```

---

## 5. Smoke tests

```bash
BACKEND_URL=$(databricks apps get revintel-backend -p $PROFILE -o json | jq -r '.url')
FRONTEND_URL=$(databricks apps get revintel-frontend -p $PROFILE -o json | jq -r '.url')

# Backend health
curl -s "$BACKEND_URL/api/health" | jq

# Tellr config — confirm the right pattern was detected
curl -s "$BACKEND_URL/api/tellr/health" | jq
# Expected for Pattern A: {"configured": true, "pattern": "A", ...}
# Expected for Pattern C: {"configured": true, "pattern": "C", "sp_cache_present": true, ...}

# Open the app
open "$FRONTEND_URL"
```

Then in the browser: pick a persona on `/login` → go to `/` → press **Export to Presentation**. You should see the deck progress modal, and a finished PDF/HTML download when it completes.

If `/api/tellr/health` reports the wrong pattern, check that `x-forwarded-email` is being injected (Pattern A) or that the SP env vars are populated (Pattern C). The Apps logs (`databricks apps logs revintel-backend -p $PROFILE`) will show the exact request headers if you bump the backend's log level.

---

## 5a. Diagnosing 401s

When deck export 401s in production, work through this checklist instead of guessing:

1. **Hit `/api/tellr/health` first** to see which pattern the backend detected and which auth signals it has. The four flags (`base_url_set`, `forwarded_email_present`, `sp_cache_present`, `bearer_token_present`) tell you *exactly* which env var or header is missing.
2. **Run the diagnostic script** (`backend/scripts/diagnose_tellr.py`) — it reproduces the exact upstream call the backend would make and prints the outbound headers and raw response. It depends only on `httpx` (already a runtime dep), so you can run it from inside the deployed app's terminal.

   ```bash
   # Hit health on the deployed backend
   python backend/scripts/diagnose_tellr.py health \
       --backend https://revintel-backend.<your-workspace>.databricksapps.com

   # Probe Tellr directly with the current env vars (auto-detects pattern)
   python backend/scripts/diagnose_tellr.py probe

   # Force a Pattern A probe (simulate Apps proxy)
   python backend/scripts/diagnose_tellr.py probe --as-pattern A --forwarded-email me@co.com

   # Verify SP creds can mint a token (Pattern C only)
   python backend/scripts/diagnose_tellr.py mint-sp
   ```

3. **Run the test suite** (`make test`) before deploying. The `backend/tests/` suite covers every 401 path: pattern detection precedence, header shape per pattern, SP token cache lifecycle (mint, freshness window, invalidation), the one-shot 401-retry contract, and the `_ensure_configured` 503 messages. If a future code change accidentally regresses the auth plumbing, the suite catches it before the deploy goes out.

The most common production 401 causes:

| Symptom (from `diagnose_tellr.py probe`) | Likely cause | Fix |
|---|---|---|
| Pattern A 401 with no `Authorization` header sent | RevIntel is NOT in the same workspace as Tellr (proxy didn't inject identity) | Switch to Pattern C, OR redeploy into Tellr's workspace |
| Pattern A 401 with `Authorization` set | Caller-supplied identity headers leaking through (regression) | Check `TellrAuthContext.headers()` Pattern A branch; the test suite guards this |
| Pattern B 401 with bearer starting `dapi…` | PAT used instead of OAuth U2M token | Re-mint with `databricks auth token -p <profile>` |
| Pattern B 401 with valid-looking JWT | Token expired (~1h lifetime) | Re-mint, or move to Pattern A/C for production |
| Pattern C 401, `mint-sp` succeeds | SP minted a token but Tellr rejects it | The SP isn't a Tellr workspace member, or doesn't have *Can use* on the Tellr app |
| Pattern C 401, `mint-sp` also fails | OIDC config bad | Check `TELLR_WORKSPACE_HOST` matches the SP's workspace; verify client id + secret |

---

## 6. Token refresh & lifecycle

- **Pattern A** — no tokens involved; the Apps proxy handles identity each request.
- **Pattern C** — the in-process `TellrSPTokenCache` mints once and refreshes 60 seconds before expiry. There's also a one-shot 401 retry that forces a fresh mint, so the rare clock-skew race doesn't surface as a user-visible error. **Zero manual refresh needed.**
- **Pattern B** — tokens expire in ~1 hour with no refresh. Don't use in production.

If you ever rotate the SP secret, just update the Apps secret and re-deploy — no code change.

---

## 7. Releasing a new backend wheel

The repo tracks a prebuilt wheel under `releases/` so locked-down deployers can ship without a Python toolchain (see [`DEPLOY_OPTION_A.md`](DEPLOY_OPTION_A.md)). After any backend code change, refresh that wheel:

```bash
make wheel              # builds backend/dist/<wheel> and copies it into releases/
git add releases/ backend/src/
git commit -m "Bump backend wheel to <new-version-or-sha>"
git push
```

Anyone running `git pull` afterwards picks up the new wheel automatically. `databricks/deploy.sh` prefers `releases/<wheel>` over building from source, so they never need to invoke `make wheel` themselves.

> If you bump `version` in `backend/pyproject.toml`, delete the old `releases/revintel_backend-<old-version>-*.whl` before committing — the directory should only ever hold one wheel per supported version.

---

## 8. Day-2 ops

| Task | Command |
|---|---|
| Re-deploy after a code change | `./databricks/deploy.sh $PROFILE` |
| Tail logs | `databricks apps logs <app-name> -p $PROFILE` |
| Stop / start | `databricks apps stop <app-name> -p $PROFILE` / `start` |
| Delete | `databricks apps delete <app-name> -p $PROFILE` |
| Update env vars without redeploying source | `databricks apps update <app-name> --json '{...}' -p $PROFILE` (then `apps deploy` to apply) |

---

## 9. Known gotchas

- **DuckDB is ephemeral.** `init_db()` re-seeds on missing `fact_revenue`, and synthetic data regenerates in seconds, so this is fine for the demo. The seed file lives at `<cwd>/data/revintel.duckdb` by default — override with `REVINTEL_DB_PATH` in the backend app's env if you want it elsewhere (e.g. `/tmp/revintel/revintel.duckdb`). If you ever need persistence across container restarts, switch to Lakebase or mount a UC volume.
- **Backend cold start is fast** because the deployed `app.yaml` does `pip install dist/revintel_backend-*.whl` (one wheel, all deps pinned in metadata) instead of `pip install -r requirements.txt` (resolves and downloads every dep). The wheel is built locally before each deploy, so the deployed bytes are identical to whatever you tested.
- **Frontend build runs at app start.** First deploy is slow (≈90s for `npm ci && npm run build`); subsequent deploys reuse the layer cache. If you want a faster first deploy, switch to a Dockerfile-based deploy and pre-build the image.
- **Genie still uses PATs.** Apps reject PATs but the Genie REST API doesn't, so `DATABRICKS_TOKEN=dapi...` is fine for the NLP pane. If you want SP-only, swap `genie_engine.py` to mint OAuth tokens via the same `TellrSPTokenCache` shape — out of scope for this PR.
- **Persona picker stays on `/login`.** Even with Pattern A's `x-forwarded-email` available, we deliberately do not auto-select a persona — the picker is part of the demo affordance.
