"""Shared pytest fixtures.

Tellr pattern detection reads environment variables on every request and
caches the SP token in a module-global. Tests need both wiped between
cases or you get cross-contamination that's a nightmare to debug.
"""
from __future__ import annotations

import pytest

from revintel_backend.services import tellr_mcp


# Every Tellr-related env var the production code reads. Listing them
# explicitly (rather than wiping all of os.environ) keeps any unrelated
# venv settings intact.
TELLR_ENV_VARS = (
    "TELLR_BASE_URL",
    "TELLR_WORKSPACE_HOST",
    "TELLR_SP_CLIENT_ID",
    "TELLR_SP_CLIENT_SECRET",
    "TELLR_OAUTH_TOKEN",
    "DATABRICKS_OAUTH_TOKEN",
    "SIMULATE_PATTERN_A",
)


@pytest.fixture(autouse=True)
def _clean_tellr_env(monkeypatch):
    """Strip every Tellr env var so each test starts from a blank slate."""
    for var in TELLR_ENV_VARS:
        monkeypatch.delenv(var, raising=False)
    yield


@pytest.fixture(autouse=True)
def _reset_sp_cache():
    """The SP token cache is a module-global; tests must not leak it across cases."""
    tellr_mcp._SP_CACHE = None
    yield
    tellr_mcp._SP_CACHE = None
