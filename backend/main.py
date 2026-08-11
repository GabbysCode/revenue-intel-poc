import asyncio
import os
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from db.connection import init_db
from routers import dashboard, forecasting, scenarios, time_travel, data_quality, nlp, cashflow, stream
from services.stream_simulator import simulator


@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()
    task = asyncio.create_task(simulator.run())
    yield
    simulator.stop()
    task.cancel()
    try:
        await task
    except asyncio.CancelledError:
        pass


app = FastAPI(
    title="RevIntel - Revenue Intelligence Platform",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://127.0.0.1:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(dashboard.router, prefix="/api/dashboard", tags=["Dashboard"])
app.include_router(forecasting.router, prefix="/api/forecasting", tags=["Forecasting"])
app.include_router(scenarios.router, prefix="/api/scenarios", tags=["Scenarios"])
app.include_router(time_travel.router, prefix="/api/time-travel", tags=["Time Travel"])
app.include_router(data_quality.router, prefix="/api/data-quality", tags=["Data Quality"])
app.include_router(nlp.router, prefix="/api/nlp", tags=["NLP"])
app.include_router(cashflow.router, prefix="/api/cashflow", tags=["Cash Flow"])
app.include_router(stream.router, prefix="/api/stream", tags=["Live Stream"])


@app.get("/api/health")
async def health():
    return {"status": "ok", "platform": "RevIntel POC"}
