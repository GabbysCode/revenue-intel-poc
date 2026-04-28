/**
 * Upstream for API rewrites (Node runs this, not the browser).
 * Use 127.0.0.1 to avoid some machines resolving `localhost` to ::1 while uvicorn is IPv4-only.
 * In Docker, set BACKEND_UPSTREAM=http://backend:8000
 */
const BACKEND_UPSTREAM = (process.env.BACKEND_UPSTREAM || "http://127.0.0.1:8000").replace(
  /\/$/,
  ""
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${BACKEND_UPSTREAM}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
