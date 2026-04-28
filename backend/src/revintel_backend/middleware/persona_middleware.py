import os

from starlette.datastructures import MutableHeaders
from starlette.middleware.base import BaseHTTPMiddleware

from ..services.persona_scope import normalize_persona


# Local dev flag — when set, we inject `x-forwarded-email` so the Tellr router
# detects Pattern A (Databricks Apps OBO) without an actual Apps wrapper in
# front of the API. Useful before a demo to exercise the Pattern A code path.
SIMULATE_PATTERN_A = os.getenv("SIMULATE_PATTERN_A", "").strip().lower() in {"1", "true", "yes"}
SIMULATED_PATTERN_A_EMAIL = os.getenv("SIMULATE_PATTERN_A_EMAIL", "demo@kpmg.com").strip()


class PersonaStateMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        raw = (request.headers.get("x-revintel-persona") or request.query_params.get("persona") or "").strip()
        request.state.persona = normalize_persona(raw)

        if SIMULATE_PATTERN_A and not request.headers.get("x-forwarded-email"):
            # Mutate the inbound request scope so downstream handlers see the
            # forwarded-email header. (Starlette `MutableHeaders` against the
            # raw scope is the only way; `request.headers` is read-only.)
            mh = MutableHeaders(scope=request.scope)
            mh["x-forwarded-email"] = SIMULATED_PATTERN_A_EMAIL

        return await call_next(request)
