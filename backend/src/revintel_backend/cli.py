"""Console entry point for the wheel: `revintel-backend` runs uvicorn.

Honours port resolution in this order:
    --port <n> (CLI)
    $DATABRICKS_APP_PORT (Databricks Apps)
    $PORT                 (generic PaaS)
    8000                  (local default)

Host defaults to 0.0.0.0 so the platform proxy can reach us. Override
either with --host / --port for local tinkering.
"""
from __future__ import annotations

import argparse
import logging
import os

import uvicorn


def _resolve_port(cli_port: int | None) -> int:
    if cli_port is not None:
        return cli_port
    for env_var in ("DATABRICKS_APP_PORT", "PORT"):
        v = (os.environ.get(env_var) or "").strip()
        if v:
            try:
                return int(v)
            except ValueError:
                continue
    return 8000


def main() -> None:
    parser = argparse.ArgumentParser(
        prog="revintel-backend",
        description="Run the RevIntel FastAPI backend (uvicorn).",
    )
    parser.add_argument("--host", default="0.0.0.0", help="Host to bind (default: 0.0.0.0).")
    parser.add_argument(
        "--port",
        type=int,
        default=None,
        help="Port to bind. Defaults to $DATABRICKS_APP_PORT, then $PORT, then 8000.",
    )
    parser.add_argument(
        "--reload",
        action="store_true",
        help="Enable uvicorn auto-reload (local dev only — never use in deployed apps).",
    )
    parser.add_argument(
        "--log-level",
        default=os.environ.get("LOG_LEVEL", "info"),
        help="uvicorn log level (default: info, or $LOG_LEVEL).",
    )
    args = parser.parse_args()

    # Configure root logging so our package's loggers (revintel.access, the
    # tellr_mcp module logger, etc.) surface in databricks apps logs at
    # INFO by default. Without this, only uvicorn's own loggers emit and
    # our access-log middleware lines vanish.
    log_level_value = getattr(logging, args.log_level.upper(), logging.INFO)
    logging.basicConfig(
        level=log_level_value,
        format="%(asctime)s %(levelname)s %(name)s %(message)s",
        datefmt="%Y-%m-%dT%H:%M:%S",
    )
    # Make sure our two most-watched loggers are at the configured level
    # even if some upstream import beat us to basicConfig.
    for name in ("revintel.access", "revintel_backend.services.tellr_mcp"):
        logging.getLogger(name).setLevel(log_level_value)

    uvicorn.run(
        "revintel_backend.main:app",
        host=args.host,
        port=_resolve_port(args.port),
        reload=args.reload,
        log_level=args.log_level,
    )


if __name__ == "__main__":
    main()
