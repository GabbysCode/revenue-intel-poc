# Multi-stage build: build the wheel in a builder image, install only the
# wheel + its runtime deps in the final image. The result is a small, fast
# image where every byte that runs is the same wheel that ships to
# Databricks Apps.
FROM python:3.11-slim AS builder

WORKDIR /build

RUN pip install --no-cache-dir --upgrade pip build

COPY pyproject.toml ./
COPY src ./src
COPY README.md* ./

RUN python -m build --wheel --outdir /wheels


FROM python:3.11-slim

WORKDIR /app

# Install the wheel — pip resolves all runtime deps from pyproject.toml.
COPY --from=builder /wheels/*.whl /tmp/
RUN pip install --no-cache-dir /tmp/*.whl && rm -f /tmp/*.whl

# Writable directory for the seeded DuckDB file (matches REVINTEL_DB_PATH default).
RUN mkdir -p /app/data
ENV REVINTEL_DB_PATH=/app/data/revintel.duckdb

EXPOSE 8000

# Use the console_scripts entry point so the image stays in sync with
# however the wheel is run anywhere else (Databricks Apps, local pip install, etc.).
CMD ["revintel-backend", "--host", "0.0.0.0", "--port", "8000"]
