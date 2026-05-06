from contextlib import asynccontextmanager
from typing import Any

import duckdb
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from .middleware.access_log import AccessLogMiddleware
from .middleware.persona_middleware import PersonaStateMiddleware
from .db.connection import init_db
from .routers import dashboard, nlp, tellr, kpis, data


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="RevIntel - Revenue Intelligence Platform",
    version="0.2.0",
    lifespan=lifespan,
)

# CORS (inner) then Persona (outer) — Starlette `add_middleware` order: last registered wraps first.
# In the deployed two-app topology the browser talks only to the frontend's
# origin (its `*.databricksapps.com` host) and the frontend's Node process
# proxies `/api/*` to the backend, so CORS isn't actually triggered for the
# happy path. We still allow the apps regex so direct browser calls
# (e.g. file downloads) and ad-hoc curl from a developer's machine work.
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=(
        r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$"
        r"|https://[a-z0-9-]+\.databricksapps\.com"
    ),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Tellr-Deck-Url"],
)
app.add_middleware(PersonaStateMiddleware)

# Access log is registered LAST so it wraps everything else (Starlette
# `add_middleware` order: last registered runs outermost). That guarantees
# we see every request's auth signals + final status code, even ones that
# the persona middleware or CORS rejects before any router runs.
app.add_middleware(AccessLogMiddleware)


@app.exception_handler(duckdb.IOException)
async def duckdb_io_error_handler(_request: Request, exc: duckdb.IOException) -> JSONResponse:
    text = str(exc)
    is_lock = "lock" in text.lower() or "conflict" in text.lower()
    return JSONResponse(
        status_code=503 if is_lock else 500,
        content={
            "detail": text
            if not is_lock
            else "DuckDB file is locked, usually by another process using the same database. "
            "Stop duplicate uvicorn/docker backends or a script holding revintel.duckdb open, then try again. "
            f"({text})"
        },
    )


app.include_router(kpis.router, prefix="/api/kpis", tags=["KPIs"])
app.include_router(data.router, prefix="/api/data", tags=["Data"])
app.include_router(nlp.router, prefix="/api/nlp", tags=["NLP"])
app.include_router(tellr.router, prefix="/api/tellr", tags=["Tellr"])
# Dashboard endpoints survive for legacy callers but the new UI doesn't depend on them.
app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])


@app.get("/api/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "platform": "RevIntel POC"}


@app.get("/api/auth/whoami")
async def whoami(request: Request) -> dict[str, Any]:
    """Echo back every auth signal the backend received.

    First port of call when chasing a 401 on /api/kpis/* (or any other
    backend endpoint). Hit it from the deployed frontend and from the
    deployed backend's URL directly to compare:

      * Direct backend hit (browser → backend's `*.databricksapps.com`):
        what the Apps proxy injects when a user is logged in.
      * Through-frontend hit (browser → frontend → rewrite to backend):
        what the proxy injects on the server-to-server hop.
        If `auth_header.scheme` is missing here, the frontend's rewrite
        isn't authenticating to the backend — that's the KPI 401 cause.

    Token values are NEVER returned, only their 8-char prefix. Email is
    returned in full because this endpoint is intended for live debugging
    and the email is already in the proxy logs.
    """
    auth_header = request.headers.get("authorization", "")
    auth_scheme: str | None = None
    auth_prefix: str | None = None
    if " " in auth_header:
        scheme, _, value = auth_header.partition(" ")
        auth_scheme = scheme
        auth_prefix = (value[:8] + "...") if len(value) > 8 else "***"
    elif auth_header:
        auth_scheme = "(malformed)"

    cookie_names: list[str] = []
    for pair in (request.headers.get("cookie") or "").split(";"):
        pair = pair.strip()
        if pair:
            cookie_names.append(pair.split("=", 1)[0].strip())

    return {
        "method": request.method,
        "path": request.url.path,
        "host": request.headers.get("host"),
        "x_forwarded_host": request.headers.get("x-forwarded-host"),
        "x_real_ip": request.headers.get("x-real-ip")
        or (request.headers.get("x-forwarded-for", "").split(",")[0].strip() or None),
        "user_agent": request.headers.get("user-agent"),
        "auth_header": {
            "present": bool(auth_header),
            "scheme": auth_scheme,
            "token_prefix": auth_prefix,
        },
        "x_forwarded_email": request.headers.get("x-forwarded-email"),
        "x_forwarded_user": request.headers.get("x-forwarded-user"),
        "x_forwarded_access_token_present": bool(request.headers.get("x-forwarded-access-token")),
        "x_revintel_persona": request.headers.get("x-revintel-persona"),
        "persona_resolved": getattr(request.state, "persona", None),
        "cookies": {"count": len(cookie_names), "names": cookie_names},
    }
