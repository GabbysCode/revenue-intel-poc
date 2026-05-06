/**
 * API proxying lives in src/app/api/[...path]/route.ts (App Router catch-all
 * Route Handler) so the Node process can mint and inject a service-principal
 * Bearer token on the backend hop. The previous `rewrites()` proxy was
 * silent and unauthenticated — fine locally but always 401 in deployed apps.
 *
 * BACKEND_UPSTREAM is consumed by the Route Handler at request time. Set it
 * via app.yaml (deployed) or .env.local (dev). Defaults to 127.0.0.1:8000.
 */

/** @type {import('next').NextConfig} */
const nextConfig = {};

module.exports = nextConfig;
