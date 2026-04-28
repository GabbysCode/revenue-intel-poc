from __future__ import annotations

from typing import Any, Optional
from fastapi import Request

VALID_PERSONAS = frozenset({"cfo", "regional", "fpna", "data", "executive"})

# When the UI / query does not pass region=, this maps persona → default org scope (R002 = EMEA in seed data)
DEFAULT_REGION_BY_PERSONA: dict[str, Optional[str]] = {
    "cfo": None,  # global
    "regional": "R002",  # EMEA
    "fpna": None,
    "data": None,
    "executive": None,  # global, lighter slices can be done in the API layer
}


def normalize_persona(p: Optional[str]) -> Optional[str]:
    if not p:
        return None
    p = str(p).strip().lower()
    return p if p in VALID_PERSONAS else None


def effective_region(explicit_region: Optional[str], persona: Optional[str]) -> Optional[str]:
    e = (explicit_region or "").strip() or None
    if e:
        return e
    pid = normalize_persona(persona) or "cfo"
    return DEFAULT_REGION_BY_PERSONA.get(pid)


def context_meta(request: Request, explicit_region: Optional[str], eff: Optional[str]) -> dict[str, Any]:
    p = normalize_persona(getattr(request.state, "persona", None))
    pid = p or "cfo"
    from_persona = not ((explicit_region or "").strip()) and (eff is not None) and (
        DEFAULT_REGION_BY_PERSONA.get(pid) == eff
    )
    return {
        "persona": pid,
        "region": eff,
        "region_filter_source": "query" if (explicit_region or "").strip() else ("persona_default" if from_persona else "none"),
    }


def parse_persona_header_value(raw: str) -> Optional[str]:
    return normalize_persona(raw)
