/**
 * Catch-all API proxy: browser → frontend Node → backend.
 *
 * Replaces the silent `next.config.js rewrites()` proxy with one that
 * actually authenticates to the backend's Databricks Apps proxy. Without
 * the SP Bearer here, every /api/* call returns 401 in the deployed
 * two-app topology — that's the KPI 401 you're seeing.
 *
 * The handler:
 *   1. Builds outbound headers (drops hop-by-hop, preserves everything else
 *      including X-RevIntel-Persona which apiFetch sets for persona scope).
 *   2. Mints/uses cached SP token via getBackendSPToken() and injects
 *      `Authorization: Bearer <sp>`.
 *   3. Forwards method + body + query string to ${BACKEND_UPSTREAM}/api/<path>.
 *   4. On 401 with SP auth, invalidates the cache and retries once with a
 *      freshly-minted token (handles the rare clock-skew race).
 *   5. Streams the response back unchanged (status + headers + body).
 *
 * Logging is deliberately verbose at INFO so `databricks apps logs
 * revintel-frontend` shows every hop:
 *   proxy_in   method path auth=sp|none persona=...
 *   proxy_out  method path status elapsed_ms auth=...
 *   proxy_retry_401 method path (only on the SP retry path)
 */

import { NextRequest, NextResponse } from "next/server";
import {
  getBackendSPToken,
  invalidateBackendSPToken,
  isBackendSPConfigured,
} from "@/lib/backend-sp-token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const BACKEND_UPSTREAM = (
  process.env.BACKEND_UPSTREAM || "http://127.0.0.1:8000"
).replace(/\/$/, "");

const HOP_BY_HOP = new Set([
  "host",
  "connection",
  "content-length",
  "transfer-encoding",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailers",
  "upgrade",
]);

function buildOutboundHeaders(req: NextRequest): Headers {
  const out = new Headers();
  req.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase())) out.set(key, value);
  });
  return out;
}

async function readBody(req: NextRequest): Promise<ArrayBuffer | null> {
  if (req.method === "GET" || req.method === "HEAD") return null;
  try {
    return await req.arrayBuffer();
  } catch {
    return null;
  }
}

async function attemptUpstream(
  targetUrl: string,
  method: string,
  headers: Headers,
  body: ArrayBuffer | null,
): Promise<Response> {
  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
  };
  if (body) {
    init.body = body;
    // Required by Node's undici when sending a body on a non-GET fetch.
    init.duplex = "half";
  }
  return fetch(targetUrl, init);
}

async function proxy(
  req: NextRequest,
  ctx: { params: Promise<{ path: string[] }> },
): Promise<Response> {
  const { path } = await ctx.params;
  const subpath = path.join("/");
  const url = new URL(req.url);
  const targetUrl = `${BACKEND_UPSTREAM}/api/${subpath}${url.search}`;

  const t0 = performance.now();
  const persona = req.headers.get("x-revintel-persona") ?? "(none)";
  const outHeaders = buildOutboundHeaders(req);

  // Inject the SP Bearer if we have one. If not configured, fall through
  // unauthenticated — fine for local dev where the backend has no proxy
  // in front, and produces a clear 401 in the deployed app that the
  // backend's access log + this log line will both pinpoint.
  let authMode: "sp" | "none" = "none";
  if (isBackendSPConfigured()) {
    try {
      const tok = await getBackendSPToken();
      if (tok) {
        outHeaders.set("Authorization", `Bearer ${tok}`);
        authMode = "sp";
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.warn(`[revintel-frontend] sp_mint_failed path=/api/${subpath} error=${msg}`);
    }
  }

  console.log(
    `[revintel-frontend] proxy_in method=${req.method} path=/api/${subpath} ` +
      `auth=${authMode} persona=${persona} upstream=${BACKEND_UPSTREAM}`,
  );

  const body = await readBody(req);

  let upstream: Response;
  try {
    upstream = await attemptUpstream(targetUrl, req.method, outHeaders, body);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error(
      `[revintel-frontend] proxy_error method=${req.method} path=/api/${subpath} ` +
        `error="${msg}" elapsed_ms=${(performance.now() - t0).toFixed(1)}`,
    );
    return NextResponse.json(
      {
        error: "Backend unreachable from frontend Node process.",
        upstream: BACKEND_UPSTREAM,
        detail: msg,
      },
      { status: 502 },
    );
  }

  // One-shot 401 retry: fresh-mint the SP token and try again. Don't retry
  // when we sent no auth (no token to refresh) or on the retry's own 401.
  if (upstream.status === 401 && authMode === "sp") {
    console.warn(
      `[revintel-frontend] proxy_retry_401 method=${req.method} path=/api/${subpath} ` +
        `(invalidating SP cache and retrying once)`,
    );
    invalidateBackendSPToken();
    try {
      const fresh = await getBackendSPToken();
      if (fresh) {
        outHeaders.set("Authorization", `Bearer ${fresh}`);
        upstream = await attemptUpstream(targetUrl, req.method, outHeaders, body);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      console.error(`[revintel-frontend] sp_remint_failed path=/api/${subpath} error=${msg}`);
    }
  }

  const elapsed = (performance.now() - t0).toFixed(1);
  const logLevel = upstream.status >= 400 ? "warn" : "log";
  console[logLevel](
    `[revintel-frontend] proxy_out method=${req.method} path=/api/${subpath} ` +
      `status=${upstream.status} auth=${authMode} elapsed_ms=${elapsed}`,
  );

  // Mirror the upstream response unchanged. Strip the same hop-by-hop
  // headers on the way back (especially content-encoding/content-length
  // which Next will recompute) so streamed/chunked responses don't break.
  const respHeaders = new Headers();
  upstream.headers.forEach((value, key) => {
    if (!HOP_BY_HOP.has(key.toLowerCase()) && key.toLowerCase() !== "content-encoding") {
      respHeaders.set(key, value);
    }
  });

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: respHeaders,
  });
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
export const HEAD = proxy;
export const OPTIONS = proxy;
