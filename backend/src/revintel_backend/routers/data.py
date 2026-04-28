"""Data ingestion stub.

This is a placeholder for the demo-fallback CSV/Excel upload path. In v1 the
demo runs entirely off the synthetic seed in `backend/data/revintel.duckdb`,
so this endpoint advertises a 501 with a clear next step rather than silently
failing on customer-uploaded files.

# TODO(demo-fallback): wire `pandas.read_csv(...)` (and `.read_excel(...)`)
# into a `DuckDB upsert` over `fact_revenue` with column mapping driven by
# the request body. Useful when an SA wants to demo on a customer's own
# extract instead of the synthetic seed. Adding the UploadFile parameter back
# requires `python-multipart` in requirements.txt.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException

router = APIRouter()


@router.post("/upload", status_code=501)
async def upload_data() -> dict[str, str]:
    """Return 501 with a structured payload so the frontend can render a clear demo-fallback message."""
    raise HTTPException(
        status_code=501,
        detail={
            "code": "ingestion_not_implemented",
            "message": (
                "Customer-data ingestion is not yet wired up. The dashboard runs on the "
                "synthetic seed in backend/data/revintel.duckdb. See the demo-fallback TODO "
                "in backend/routers/data.py."
            ),
        },
    )
