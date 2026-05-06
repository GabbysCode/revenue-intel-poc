/**
 * Service-principal OAuth M2M token cache for the frontend → backend hop.
 *
 * Why this exists: each Databricks App has its own auth proxy. The browser
 * is logged in to the *frontend* app, but `next.config.js rewrites()` (or
 * any plain server-side proxy) forwards requests to the *backend* app
 * with no Authorization header — backend's proxy returns 401 before our
 * Python ever runs. Solution: mint a workspace OAuth M2M token using a
 * service principal that has "Can use" permission on the backend app, and
 * inject it as `Authorization: Bearer <token>` on the proxy hop.
 *
 * Env vars (REVINTEL_SP_* preferred, falls back to TELLR_SP_* so you can
 * reuse the same SP for both backend access and Tellr Pattern C):
 *
 *   REVINTEL_SP_CLIENT_ID      / TELLR_SP_CLIENT_ID
 *   REVINTEL_SP_CLIENT_SECRET  / TELLR_SP_CLIENT_SECRET
 *   REVINTEL_WORKSPACE_HOST    / TELLR_WORKSPACE_HOST    / BACKEND_UPSTREAM (host part)
 *
 * Tokens are cached process-wide and refreshed 60s before expiry. On a 401
 * from the backend, the proxy invalidates the cache and retries once
 * with a freshly-minted token (handles the rare clock-skew race).
 */

const EARLY_REFRESH_S = 60;

let cachedToken: string | null = null;
let cachedExpEpoch = 0;
// Single in-flight mint promise so concurrent requests don't all pummel OIDC.
let mintInFlight: Promise<string> | null = null;

function workspaceHost(): string {
  const explicit =
    process.env.REVINTEL_WORKSPACE_HOST ||
    process.env.TELLR_WORKSPACE_HOST ||
    "";
  if (explicit) return explicit.replace(/\/$/, "");
  // Last resort: derive from BACKEND_UPSTREAM (only valid when the backend
  // is itself a Databricks App — local dev uses 127.0.0.1 and SP auth is
  // off anyway).
  const upstream = process.env.BACKEND_UPSTREAM || "";
  if (upstream.startsWith("https://")) {
    try {
      const u = new URL(upstream);
      return `${u.protocol}//${u.host}`;
    } catch {
      return "";
    }
  }
  return "";
}

function spCreds(): { clientId: string; clientSecret: string } | null {
  const clientId =
    process.env.REVINTEL_SP_CLIENT_ID || process.env.TELLR_SP_CLIENT_ID || "";
  const clientSecret =
    process.env.REVINTEL_SP_CLIENT_SECRET ||
    process.env.TELLR_SP_CLIENT_SECRET ||
    "";
  if (!clientId.trim() || !clientSecret.trim()) return null;
  return { clientId: clientId.trim(), clientSecret: clientSecret.trim() };
}

/** True when at least one env var combination is wired up. */
export function isBackendSPConfigured(): boolean {
  return Boolean(spCreds()) && Boolean(workspaceHost());
}

/** Force the next call to mint a fresh token. Used after a 401 from the backend. */
export function invalidateBackendSPToken(): void {
  cachedToken = null;
  cachedExpEpoch = 0;
}

async function mintToken(): Promise<string> {
  const creds = spCreds();
  const host = workspaceHost();
  if (!creds || !host) {
    throw new Error(
      "Backend SP not configured: set REVINTEL_SP_CLIENT_ID, REVINTEL_SP_CLIENT_SECRET, and REVINTEL_WORKSPACE_HOST (or the matching TELLR_SP_* fallbacks)."
    );
  }

  const tokenUrl = `${host}/oidc/v1/token`;
  const basic = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString("base64");
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    scope: "all-apis",
  });

  const resp = await fetch(tokenUrl, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!resp.ok) {
    const text = await resp.text();
    throw new Error(`OIDC token mint failed: HTTP ${resp.status} ${text.slice(0, 300)}`);
  }
  const json = (await resp.json()) as { access_token?: string; expires_in?: number };
  if (!json.access_token) {
    throw new Error("OIDC token response missing access_token");
  }
  const ttl = Math.max(json.expires_in ?? 3600, 60);
  cachedToken = json.access_token;
  cachedExpEpoch = Math.floor(Date.now() / 1000) + ttl;
  return json.access_token;
}

/**
 * Returns a fresh-enough SP access token, or null if the SP is not configured.
 *
 * Caller can decide what to do when null: the backend proxy will handle
 * unauthenticated calls if the backend is publicly accessible (rare), or
 * return 401 (the case we're solving).
 */
export async function getBackendSPToken(): Promise<string | null> {
  if (!isBackendSPConfigured()) return null;
  const now = Math.floor(Date.now() / 1000);
  if (cachedToken && cachedExpEpoch - EARLY_REFRESH_S > now) {
    return cachedToken;
  }
  if (!mintInFlight) {
    mintInFlight = mintToken().finally(() => {
      mintInFlight = null;
    });
  }
  return mintInFlight;
}
