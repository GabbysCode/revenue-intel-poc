from contextlib import asynccontextmanager

import duckdb
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse

from middleware.persona_middleware import PersonaStateMiddleware
from db.connection import init_db
from routers import dashboard, nlp, tellr, kpis, data


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
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3})(:\d+)?$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Tellr-Deck-Url"],
)
app.add_middleware(PersonaStateMiddleware)


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
