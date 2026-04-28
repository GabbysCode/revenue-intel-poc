#!/usr/bin/env bash
# =============================================================================
# Deploy RevIntel to Databricks Apps (backend + frontend, two separate apps).
#
# Usage:
#   ./databricks/deploy.sh <profile> [<backend-app-name>] [<frontend-app-name>]
#
# Args:
#   profile             A databricks CLI profile that points at the workspace
#                       you want to deploy into.
#   backend-app-name    Defaults to "revintel-backend".
#   frontend-app-name   Defaults to "revintel-frontend".
#
# What this does:
#   1. Imports backend/  → /Workspace/Users/<me>/revintel/backend
#   2. Imports frontend/ → /Workspace/Users/<me>/revintel/frontend
#   3. Creates the two apps if they don't already exist.
#   4. Deploys the backend app from its workspace folder.
#   5. Reads the backend app's URL and writes it into the frontend app's
#      BACKEND_UPSTREAM env var.
#   6. Deploys the frontend app.
#
# What this does NOT do:
#   - Set TELLR_BASE_URL / Pattern C SP secrets / Genie creds — set those
#     manually via the Apps UI or `databricks apps update --json` BEFORE
#     re-running this script. They live in the app spec, not the source.
#   - Create a service principal for Pattern C — see DEPLOY.md.
#
# Requires: databricks CLI ≥ 0.230, jq.
# =============================================================================
set -euo pipefail

PROFILE="${1:-}"
BACKEND_APP="${2:-revintel-backend}"
FRONTEND_APP="${3:-revintel-frontend}"

if [[ -z "$PROFILE" ]]; then
  echo "Usage: $0 <databricks-profile> [<backend-app>] [<frontend-app>]" >&2
  exit 1
fi

for cmd in databricks jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Required command '$cmd' not found in PATH." >&2
    exit 1
  fi
done

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$REPO_ROOT"

ME=$(databricks current-user me -p "$PROFILE" -o json | jq -r '.userName')
if [[ -z "$ME" || "$ME" == "null" ]]; then
  echo "Could not resolve current user from profile '$PROFILE'. Run 'databricks auth login -p $PROFILE' first." >&2
  exit 1
fi

WS_ROOT="/Workspace/Users/${ME}/revintel"
BACKEND_WS="${WS_ROOT}/backend"
FRONTEND_WS="${WS_ROOT}/frontend"

echo "==> Profile:     $PROFILE"
echo "==> User:        $ME"
echo "==> Workspace:   $WS_ROOT"
echo "==> Backend app: $BACKEND_APP"
echo "==> Frontend app: $FRONTEND_APP"
echo

# -----------------------------------------------------------------------------
# 1. Sync source into the workspace
# -----------------------------------------------------------------------------
echo "==> Importing backend source -> $BACKEND_WS"
databricks workspace import-dir backend "$BACKEND_WS" \
  --overwrite \
  --exclude-from <(printf '%s\n' '.venv/' '__pycache__/' '*.pyc' 'data/*.duckdb' '.env' '.pytest_cache/') \
  -p "$PROFILE"

echo "==> Importing frontend source -> $FRONTEND_WS"
databricks workspace import-dir frontend "$FRONTEND_WS" \
  --overwrite \
  --exclude-from <(printf '%s\n' 'node_modules/' '.next/' 'tsconfig.tsbuildinfo' '.env.local' '*.log') \
  -p "$PROFILE"

# -----------------------------------------------------------------------------
# 2. Create apps (idempotent — no-op if they already exist)
# -----------------------------------------------------------------------------
ensure_app() {
  local name="$1"
  local desc="$2"
  if databricks apps get "$name" -p "$PROFILE" >/dev/null 2>&1; then
    echo "==> App '$name' already exists; skipping create."
  else
    echo "==> Creating app '$name'."
    databricks apps create --json "{\"name\": \"$name\", \"description\": \"$desc\"}" -p "$PROFILE" >/dev/null
  fi
}

ensure_app "$BACKEND_APP" "RevIntel FastAPI backend"
ensure_app "$FRONTEND_APP" "RevIntel Next.js frontend"

# -----------------------------------------------------------------------------
# 3. Deploy backend
# -----------------------------------------------------------------------------
echo "==> Deploying backend ($BACKEND_APP) from $BACKEND_WS"
databricks apps deploy "$BACKEND_APP" --source-code-path "$BACKEND_WS" -p "$PROFILE"

# Resolve the backend's HTTPS URL so we can wire it into the frontend.
BACKEND_URL=$(databricks apps get "$BACKEND_APP" -p "$PROFILE" -o json | jq -r '.url // .app_url // empty')
if [[ -z "$BACKEND_URL" ]]; then
  echo "WARNING: could not read backend app URL — the frontend BACKEND_UPSTREAM will not be auto-wired." >&2
  echo "         Set it manually: databricks apps update $FRONTEND_APP --json '{\"resources\":[],\"env\":[{\"name\":\"BACKEND_UPSTREAM\",\"value\":\"<backend-url>\"}]}'" >&2
else
  echo "==> Backend URL: $BACKEND_URL"
  echo "==> Patching frontend BACKEND_UPSTREAM to point at the backend."
  databricks apps update "$FRONTEND_APP" \
    --json "{\"name\":\"$FRONTEND_APP\",\"resources\":[],\"env\":[{\"name\":\"BACKEND_UPSTREAM\",\"value\":\"$BACKEND_URL\"}]}" \
    -p "$PROFILE" >/dev/null
fi

# -----------------------------------------------------------------------------
# 4. Deploy frontend
# -----------------------------------------------------------------------------
echo "==> Deploying frontend ($FRONTEND_APP) from $FRONTEND_WS"
databricks apps deploy "$FRONTEND_APP" --source-code-path "$FRONTEND_WS" -p "$PROFILE"

FRONTEND_URL=$(databricks apps get "$FRONTEND_APP" -p "$PROFILE" -o json | jq -r '.url // .app_url // empty')

cat <<EOF

==> Done.
    Backend:  ${BACKEND_URL:-<unknown>}
    Frontend: ${FRONTEND_URL:-<unknown>}

Smoke tests:
    curl -s "${BACKEND_URL:-<backend-url>}/api/health" | jq
    curl -s "${BACKEND_URL:-<backend-url>}/api/tellr/health" | jq
    open "${FRONTEND_URL:-<frontend-url>}"

Don't forget: TELLR_BASE_URL, Pattern C SP creds (if cross-workspace), and
Genie creds need to be set on the BACKEND app (not in source). See DEPLOY.md.
EOF
