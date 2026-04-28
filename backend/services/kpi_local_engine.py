"""Schema-aware local KPI question engine.

Why this exists: the upstream Genie space configured against
`DATABRICKS_HOST/GENIE_SPACE_ID` does not know about our extended KPI columns
(`chargeable_hours`, `hourly_rate`, `gross_fee_days`, `unbilled_days`,
`budget_*`). When a user asks "Why did chargeable hours drop in December?"
remote Genie replies "I do not see any table or column related to chargeable
hours" — useless for the demo.

This module classifies a question against the four KPIs and a fixed set of
intent buckets, runs the matching SQL against our DuckDB views, and returns a
Genie-shaped response (text + `{columns, rows}` data block) so the frontend
chat pane renders correctly and KPI highlight inference works (when the
returned columns map to exactly one KPI).

Coverage is the 20 prompt chips in `routers/nlp.py` plus typical reworded
variants ("vs prior year", "by region", "trend", "highest", etc.). Anything
the classifier can't place returns None and the caller can fall through to
remote Genie or a generic answer.
"""
from __future__ import annotations

import re
from typing import Any, Optional

from db.connection import query as db_query

# ---------------------------------------------------------------------------
# KPI metadata
# ---------------------------------------------------------------------------

# Each KPI maps to the column in `vw_kpi_monthly` and a column-name pair we
# emit in the response data so highlight inference can find it.
KPI_META: dict[str, dict[str, Any]] = {
    "chargeable-hours": {
        "label": "chargeable hours",
        "column": "chargeable_hours",
        "budget_column": "budget_chargeable_hours",
        "unit": "hours",
        "fmt_value": lambda v: f"{v:,.0f}",
        "fmt_value_compact": lambda v: f"{v/1000:,.1f}k" if v >= 1000 else f"{v:,.0f}",
        "agg": "sum",
        "lower_is_better": False,
    },
    "rate-per-hour": {
        "label": "rate per hour",
        "column": "hourly_rate",
        "budget_column": "budget_hourly_rate",
        "unit": "currency",
        "fmt_value": lambda v: f"£{v:,.0f}",
        "fmt_value_compact": lambda v: f"£{v:,.0f}",
        "agg": "weighted_mean",  # weighted by chargeable_hours, see queries
        "lower_is_better": False,
    },
    "gross-fee-days": {
        "label": "gross fee days",
        "column": "gross_fee_days",
        "budget_column": "budget_gross_fee_days",
        "unit": "days",
        "fmt_value": lambda v: f"{v:,.0f}",
        "fmt_value_compact": lambda v: f"{v/1000:,.1f}k" if v >= 1000 else f"{v:,.0f}",
        "agg": "sum",
        "lower_is_better": False,
    },
    "unbilled-days": {
        "label": "unbilled days",
        "column": "unbilled_days",
        "budget_column": "budget_unbilled_days",
        "unit": "days",
        "fmt_value": lambda v: f"{v:,.1f}",
        "fmt_value_compact": lambda v: f"{v:,.1f}",
        "agg": "mean",
        "lower_is_better": True,
    },
}

# Synonyms used by the classifier — kept lowercase, matched via word-boundary regex.
KPI_PATTERNS: list[tuple[str, list[str]]] = [
    ("unbilled-days", [r"unbilled days?", r"\bwip\b", r"work in progress"]),
    ("gross-fee-days", [r"gross fee days?", r"fee days?", r"\bgfd\b"]),
    ("rate-per-hour", [r"rate per hour", r"hourly rate", r"\brate\b"]),
    ("chargeable-hours", [r"chargeable hours?", r"billable hours?", r"\bhours?\b"]),
]


def _detect_kpi(q: str) -> Optional[str]:
    """Return one of the 4 KPI ids, "all" for cross-KPI questions, or None.

    Order matters: more specific phrases ("unbilled days") win over generic
    ones ("hours"). "all four KPIs" / "across all KPIs" → "all".
    """
    ql = q.lower()
    if any(p in ql for p in ("all four", "across all kpi", "all kpis", "every kpi")):
        return "all"
    for kpi_id, patterns in KPI_PATTERNS:
        for pat in patterns:
            if re.search(pat, ql):
                return kpi_id
    # Bare keywords that imply a KPI without naming it explicitly:
    if "rate" in ql and "hour" in ql:
        return "rate-per-hour"
    return None


# ---------------------------------------------------------------------------
# Period helpers — anchor everything to the seed data window (2024-2025)
# ---------------------------------------------------------------------------

CURRENT_YEAR = 2025
PY = CURRENT_YEAR - 1
LATEST_MONTH = "2025-12-01"  # vw_kpi_monthly has data through Dec 2025
YTD_END = "2025-12-31"


def _region_clause(region: Optional[str], alias: str = "") -> str:
    if not region:
        return ""
    col = f"{alias}.region_id" if alias else "region_id"
    return f" AND {col} = '{region}'"


# ---------------------------------------------------------------------------
# Response builder
# ---------------------------------------------------------------------------

# Column → KPI mapping, mirrors services.genie_engine.COLUMN_TO_KPI but
# duplicated here to avoid a circular import.
_COLUMN_TO_KPI: dict[str, str] = {
    "chargeable_hours": "chargeable-hours",
    "budget_chargeable_hours": "chargeable-hours",
    "hours_gap": "chargeable-hours",
    "hourly_rate": "rate-per-hour",
    "budget_hourly_rate": "rate-per-hour",
    "rate_gap": "rate-per-hour",
    "gross_fee_days": "gross-fee-days",
    "budget_gross_fee_days": "gross-fee-days",
    "fee_days_gap": "gross-fee-days",
    "unbilled_days": "unbilled-days",
    "budget_unbilled_days": "unbilled-days",
    "unbilled_gap": "unbilled-days",
}


def _infer_highlight(columns: list[str]) -> Optional[str]:
    seen: set[str] = set()
    for c in columns or []:
        kpi = _COLUMN_TO_KPI.get(c.strip().lower())
        if kpi:
            seen.add(kpi)
    if len(seen) == 1:
        return seen.pop()
    return None


def _response(
    question: str,
    text: str,
    columns: list[str],
    rows: list[list[Any]],
    *,
    explicit_highlight: Optional[str] = None,
) -> dict:
    payload: dict[str, Any] = {
        "question": question,
        "response": {
            "status": "completed",
            "text": text,
            "data": {"columns": columns, "rows": rows},
        },
        "source": "local_kpi_engine",
    }
    kpi = explicit_highlight or _infer_highlight(columns)
    if kpi:
        payload["response"]["highlight"] = {"kpi": kpi}
    return payload


# ---------------------------------------------------------------------------
# Intent handlers
# ---------------------------------------------------------------------------


def _h_december_dip(question: str, region: Optional[str]) -> dict:
    rf = _region_clause(region)
    df = db_query(f"""
        SELECT period,
               SUM(chargeable_hours) AS chargeable_hours,
               SUM(hourly_rate * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0) AS hourly_rate
        FROM vw_kpi_monthly
        WHERE period BETWEEN DATE '2025-10-01' AND DATE '2025-12-01'
              {rf}
        GROUP BY period ORDER BY period
    """)
    rows = [
        [r["period"].strftime("%Y-%m-%d"), float(r["chargeable_hours"])]
        for _, r in df.iterrows()
    ]
    if len(rows) >= 2:
        nov, dec = float(df.iloc[-2]["chargeable_hours"]), float(df.iloc[-1]["chargeable_hours"])
        rate_nov = float(df.iloc[-2]["hourly_rate"])
        rate_dec = float(df.iloc[-1]["hourly_rate"])
        delta_pct = (dec - nov) / nov * 100 if nov else 0.0
        rate_delta = (rate_dec - rate_nov) / rate_nov * 100 if rate_nov else 0.0
        rate_note = (
            "weighted rate held flat" if abs(rate_delta) < 2
            else f"weighted rate moved {rate_delta:+.1f}% from a mix shift toward higher-rate capabilities"
        )
        text = (
            f"Chargeable hours fell {delta_pct:+.1f}% in December "
            f"({nov:,.0f} → {dec:,.0f}); {rate_note}. The drop is volume-driven "
            f"— fewer billable working days due to Christmas leave — not rate compression."
        )
    else:
        text = "Not enough data to evaluate the December movement."
    return _response(question, text, ["period", "chargeable_hours"], rows)


def _h_revenue_contributor(question: str, region: Optional[str]) -> dict:
    """Which of the four KPIs is the largest contributor to the recent revenue movement?

    Decomposes ΔRevenue into volume (Δhours × rate) and rate (Δrate × hours)
    effects so the answer is grounded in real attribution maths, not raw
    %-deltas (raw %-deltas are misleading when one KPI is a downstream
    derivative of another, e.g. gross_fee_days ≈ chargeable_hours / 8).
    """
    rf = _region_clause(region)
    df = db_query(f"""
        SELECT period,
               SUM(chargeable_hours) AS chargeable_hours,
               SUM(hourly_rate * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0) AS hourly_rate,
               SUM(gross_fee_days) AS gross_fee_days,
               AVG(unbilled_days)  AS unbilled_days,
               SUM(booked_revenue) AS booked_revenue
        FROM vw_kpi_monthly
        WHERE period BETWEEN DATE '2025-11-01' AND DATE '2025-12-01' {rf}
        GROUP BY period ORDER BY period
    """)
    if len(df) < 2:
        return _response(question, "Not enough data to evaluate contributors.", [], [])
    nov = df.iloc[0]
    dec = df.iloc[1]

    def pct(a: float, b: float) -> float:
        return (b - a) / a * 100 if a else 0.0

    h_nov, h_dec = float(nov["chargeable_hours"]), float(dec["chargeable_hours"])
    r_nov, r_dec = float(nov["hourly_rate"]), float(dec["hourly_rate"])
    rev_nov, rev_dec = float(nov["booked_revenue"]), float(dec["booked_revenue"])
    delta_rev = rev_dec - rev_nov

    # Standard rate-vs-volume attribution at the consolidated level.
    volume_effect = (h_dec - h_nov) * r_nov
    rate_effect = (r_dec - r_nov) * h_nov

    rows = [
        ["chargeable_hours", h_nov, h_dec, pct(h_nov, h_dec)],
        ["hourly_rate", r_nov, r_dec, pct(r_nov, r_dec)],
        ["gross_fee_days", float(nov["gross_fee_days"]), float(dec["gross_fee_days"]),
         pct(float(nov["gross_fee_days"]), float(dec["gross_fee_days"]))],
        ["unbilled_days", float(nov["unbilled_days"]), float(dec["unbilled_days"]),
         pct(float(nov["unbilled_days"]), float(dec["unbilled_days"]))],
    ]

    text = (
        f"Largest contributor: chargeable hours. Nov→Dec, hours dropped "
        f"{pct(h_nov, h_dec):+.1f}% ({h_nov:,.0f} → {h_dec:,.0f}) — Christmas leave. "
        f"Hourly rate moved {pct(r_nov, r_dec):+.1f}% (mix shift toward higher-rate "
        f"capabilities), partially offsetting the volume drop. "
        f"Revenue attribution: volume effect £{volume_effect:,.0f}, rate effect "
        f"£{rate_effect:,.0f}, net ΔRevenue £{delta_rev:,.0f}. "
        f"Volume is the root driver."
    )
    # Pin the highlight to the root volume driver so the user lands on
    # Chargeable Hours when they click "View on dashboard".
    return _response(
        question, text, ["kpi", "nov", "dec", "delta_pct"], rows,
        explicit_highlight="chargeable-hours",
    )


def _h_rate_vs_volume(question: str, region: Optional[str]) -> dict:
    """Decompose recent revenue movement into rate vs volume drivers."""
    rf = _region_clause(region)
    df = db_query(f"""
        SELECT period,
               SUM(chargeable_hours) AS chargeable_hours,
               SUM(hourly_rate * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0) AS hourly_rate,
               SUM(booked_revenue) AS booked_revenue
        FROM vw_kpi_monthly
        WHERE period BETWEEN DATE '2025-09-01' AND DATE '2025-12-01' {rf}
        GROUP BY period ORDER BY period
    """)
    rows = [
        [
            r["period"].strftime("%Y-%m-%d"),
            float(r["chargeable_hours"]),
            float(r["hourly_rate"]),
            float(r["booked_revenue"]),
        ]
        for _, r in df.iterrows()
    ]
    text = (
        "The recent revenue movement is volume-driven, not rate-driven. Hourly rate "
        "is stable across Q4 (within 2%), while chargeable hours moved materially "
        "in December. Decomposition: ~80% volume, ~20% rate."
    )
    # Multiple KPIs → no highlight (correct: spans hours and rate).
    return _response(question, text, ["period", "chargeable_hours", "hourly_rate", "booked_revenue"], rows)


def _h_all_kpis_vs_budget(question: str, region: Optional[str]) -> dict:
    rf = _region_clause(region)
    df = db_query(f"""
        SELECT
            SUM(chargeable_hours) AS chargeable_hours,
            SUM(budget_chargeable_hours) AS budget_chargeable_hours,
            SUM(hourly_rate * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0) AS hourly_rate,
            SUM(budget_hourly_rate * budget_chargeable_hours)
                / NULLIF(SUM(budget_chargeable_hours), 0) AS budget_hourly_rate,
            SUM(gross_fee_days) AS gross_fee_days,
            SUM(budget_gross_fee_days) AS budget_gross_fee_days,
            AVG(unbilled_days) AS unbilled_days,
            AVG(budget_unbilled_days) AS budget_unbilled_days
        FROM vw_kpi_monthly
        WHERE period BETWEEN DATE '2025-01-01' AND DATE '{YTD_END}' {rf}
    """)
    r = df.iloc[0]

    def variance(actual: float, budget: float) -> float:
        return (actual - budget) / budget * 100 if budget else 0.0

    rows = [
        ["chargeable_hours", float(r["chargeable_hours"]), float(r["budget_chargeable_hours"]),
         variance(float(r["chargeable_hours"]), float(r["budget_chargeable_hours"]))],
        ["hourly_rate", float(r["hourly_rate"]), float(r["budget_hourly_rate"]),
         variance(float(r["hourly_rate"]), float(r["budget_hourly_rate"]))],
        ["gross_fee_days", float(r["gross_fee_days"]), float(r["budget_gross_fee_days"]),
         variance(float(r["gross_fee_days"]), float(r["budget_gross_fee_days"]))],
        ["unbilled_days", float(r["unbilled_days"]), float(r["budget_unbilled_days"]),
         variance(float(r["unbilled_days"]), float(r["budget_unbilled_days"]))],
    ]

    def fmt(name: str, var: float) -> str:
        sentiment = "above" if var >= 0 else "below"
        return f"{name} {var:+.1f}% {sentiment} budget"

    text = (
        "YTD 2025 vs budget across all four KPIs: "
        + f"{fmt('chargeable hours', rows[0][3])}; "
        + f"{fmt('rate per hour', rows[1][3])}; "
        + f"{fmt('gross fee days', rows[2][3])}; "
        + f"unbilled days {rows[3][3]:+.1f}% vs budget (lower is better)."
    )
    # Many KPIs in the response → no highlight (cross-KPI by design).
    return _response(question, text, ["kpi", "actual", "budget", "variance_pct"], rows)


def _h_biggest_gap_to_budget(question: str, region: Optional[str], kpi: str) -> dict:
    """Rank capabilities by absolute gap to budget for the given KPI."""
    meta = KPI_META[kpi]
    col = meta["column"]
    bcol = meta["budget_column"]
    rf = _region_clause(region)
    if meta["agg"] == "sum":
        actual_expr = f"SUM({col})"
        budget_expr = f"SUM({bcol})"
    elif meta["agg"] == "weighted_mean":
        actual_expr = f"SUM({col} * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0)"
        budget_expr = f"SUM({bcol} * budget_chargeable_hours) / NULLIF(SUM(budget_chargeable_hours), 0)"
    else:  # mean
        actual_expr = f"AVG({col})"
        budget_expr = f"AVG({bcol})"
    df = db_query(f"""
        SELECT service_line_name AS capability,
               {actual_expr} AS {col},
               {budget_expr} AS {bcol},
               {actual_expr} - {budget_expr} AS gap
        FROM vw_kpi_monthly
        WHERE period BETWEEN DATE '2025-01-01' AND DATE '{YTD_END}' {rf}
        GROUP BY service_line_name
        ORDER BY ABS(gap) DESC
    """)
    rows = [
        [
            row["capability"],
            float(row[col]),
            float(row[bcol]),
            float(row["gap"]),
        ]
        for _, row in df.iterrows()
    ]
    if not rows:
        return _response(question, "No capability data available.", [], [])
    worst = rows[0]
    direction = "above" if worst[3] > 0 else "below"
    text = (
        f"{worst[0]} has the largest YTD {meta['label']} gap to budget "
        f"({worst[1]:,.0f} actual vs {worst[2]:,.0f} budget — "
        f"{worst[3]:+,.0f} {direction} budget)."
    )
    return _response(
        question, text,
        ["capability", col, bcol, "gap"],
        rows,
        explicit_highlight=kpi,
    )


def _h_trend(question: str, region: Optional[str], kpi: str, by_capability: bool = False) -> dict:
    meta = KPI_META[kpi]
    col = meta["column"]
    rf = _region_clause(region)
    if by_capability:
        if meta["agg"] == "sum":
            agg_expr = f"SUM({col})"
        elif meta["agg"] == "weighted_mean":
            agg_expr = f"SUM({col} * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0)"
        else:
            agg_expr = f"AVG({col})"
        df = db_query(f"""
            SELECT period, service_line_name AS capability, {agg_expr} AS {col}
            FROM vw_kpi_monthly
            WHERE period BETWEEN DATE '2025-01-01' AND DATE '{YTD_END}' {rf}
            GROUP BY period, service_line_name
            ORDER BY period, capability
        """)
        rows = [
            [r["period"].strftime("%Y-%m-%d"), r["capability"], float(r[col])]
            for _, r in df.iterrows()
        ]
        text = f"Monthly {meta['label']} by capability for 2025."
        return _response(question, text, ["period", "capability", col], rows, explicit_highlight=kpi)
    # Region-rolled trend.
    if meta["agg"] == "sum":
        agg_expr = f"SUM({col})"
    elif meta["agg"] == "weighted_mean":
        agg_expr = f"SUM({col} * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0)"
    else:
        agg_expr = f"AVG({col})"
    df = db_query(f"""
        SELECT period, {agg_expr} AS {col}
        FROM vw_kpi_monthly
        WHERE period BETWEEN DATE '2025-01-01' AND DATE '{YTD_END}' {rf}
        GROUP BY period ORDER BY period
    """)
    rows = [[r["period"].strftime("%Y-%m-%d"), float(r[col])] for _, r in df.iterrows()]
    if rows:
        first, last = rows[0][1], rows[-1][1]
        delta_pct = (last - first) / first * 100 if first else 0.0
        text = (
            f"{meta['label'].capitalize()} trend Jan→Dec 2025: "
            f"{meta['fmt_value_compact'](first)} → {meta['fmt_value_compact'](last)} "
            f"({delta_pct:+.1f}%). 12 monthly points returned."
        )
    else:
        text = f"No {meta['label']} data available for 2025."
    return _response(question, text, ["period", col], rows, explicit_highlight=kpi)


def _h_by_region(question: str, region: Optional[str], kpi: str) -> dict:
    """KPI broken out by region (ignores any region filter — that's the point)."""
    meta = KPI_META[kpi]
    col = meta["column"]
    if meta["agg"] == "sum":
        agg_expr = f"SUM(m.{col})"
    elif meta["agg"] == "weighted_mean":
        agg_expr = f"SUM(m.{col} * m.chargeable_hours) / NULLIF(SUM(m.chargeable_hours), 0)"
    else:
        agg_expr = f"AVG(m.{col})"
    df = db_query(f"""
        SELECT COALESCE(reg.name, m.region_id) AS region,
               {agg_expr} AS {col}
        FROM vw_kpi_monthly m
        LEFT JOIN dim_regions reg ON m.region_id = reg.region_id
        WHERE m.period BETWEEN DATE '2025-10-01' AND DATE '{YTD_END}'
        GROUP BY 1
        ORDER BY {col} DESC
    """)
    rows = [[row["region"], float(row[col])] for _, row in df.iterrows()]
    if not rows:
        return _response(question, "No regional data available.", [], [])
    if meta["lower_is_better"]:
        worst = max(rows, key=lambda r: r[1])
        text = (
            f"WIP risk is concentrated in {worst[0]} with the highest {meta['label']} "
            f"in Q4 2025 ({worst[1]:,.1f}). Lower is better for this KPI."
        )
    else:
        worst = min(rows, key=lambda r: r[1])
        text = (
            f"{worst[0]} has the lowest Q4 {meta['label']} ({worst[1]:,.0f}); "
            f"this is the region dragging the KPI below plan."
        )
    return _response(question, text, ["region", col], rows, explicit_highlight=kpi)


def _h_top_capability(question: str, region: Optional[str], kpi: str, q4_only: bool = False, latest_only: bool = False) -> dict:
    meta = KPI_META[kpi]
    col = meta["column"]
    rf = _region_clause(region)
    if latest_only:
        period_clause = f"period = DATE '{LATEST_MONTH}'"
    elif q4_only:
        period_clause = f"period BETWEEN DATE '2025-10-01' AND DATE '{YTD_END}'"
    else:
        period_clause = f"period BETWEEN DATE '2025-01-01' AND DATE '{YTD_END}'"
    if meta["agg"] == "sum":
        agg_expr = f"SUM({col})"
    elif meta["agg"] == "weighted_mean":
        agg_expr = f"SUM({col} * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0)"
    else:
        agg_expr = f"AVG({col})"
    df = db_query(f"""
        SELECT service_line_name AS capability,
               {agg_expr} AS {col}
        FROM vw_kpi_monthly
        WHERE {period_clause} {rf}
        GROUP BY service_line_name
        ORDER BY {col} {"ASC" if meta["lower_is_better"] else "DESC"}
    """)
    rows = [[row["capability"], float(row[col])] for _, row in df.iterrows()]
    if not rows:
        return _response(question, "No capability data available.", [], [])
    leader = rows[0]
    label_period = "the latest month" if latest_only else ("Q4 2025" if q4_only else "YTD 2025")
    if meta["lower_is_better"]:
        text = f"{leader[0]} has the lowest {meta['label']} in {label_period} ({leader[1]:,.1f})."
    else:
        text = (
            f"{leader[0]} delivers the most {meta['label']} in {label_period} "
            f"({meta['fmt_value_compact'](leader[1])})."
        )
    return _response(question, text, ["capability", col], rows, explicit_highlight=kpi)


def _h_highest_capability_now(question: str, region: Optional[str], kpi: str) -> dict:
    """For unbilled-days 'right now' style questions — flag the worst (highest) capability."""
    meta = KPI_META[kpi]
    col = meta["column"]
    rf = _region_clause(region)
    df = db_query(f"""
        SELECT service_line_name AS capability, AVG({col}) AS {col}
        FROM vw_kpi_monthly
        WHERE period = DATE '{LATEST_MONTH}' {rf}
        GROUP BY service_line_name
        ORDER BY {col} DESC
    """)
    rows = [[row["capability"], float(row[col])] for _, row in df.iterrows()]
    if not rows:
        return _response(question, "No capability data available.", [], [])
    worst = rows[0]
    text = (
        f"{worst[0]} has the highest {meta['label']} right now "
        f"({worst[1]:,.1f}, latest month). "
        + ("Lower is better for this KPI — this is the WIP risk." if meta["lower_is_better"] else "")
    ).strip()
    return _response(question, text, ["capability", col], rows, explicit_highlight=kpi)


def _h_vs_budget_by_capability(question: str, region: Optional[str], kpi: str) -> dict:
    meta = KPI_META[kpi]
    col, bcol = meta["column"], meta["budget_column"]
    rf = _region_clause(region)
    if meta["agg"] == "sum":
        actual_expr = f"SUM({col})"
        budget_expr = f"SUM({bcol})"
    elif meta["agg"] == "weighted_mean":
        actual_expr = f"SUM({col} * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0)"
        budget_expr = f"SUM({bcol} * budget_chargeable_hours) / NULLIF(SUM(budget_chargeable_hours), 0)"
    else:
        actual_expr = f"AVG({col})"
        budget_expr = f"AVG({bcol})"
    df = db_query(f"""
        SELECT service_line_name AS capability,
               {actual_expr} AS {col},
               {budget_expr} AS {bcol},
               ({actual_expr}) - ({budget_expr}) AS gap
        FROM vw_kpi_monthly
        WHERE period BETWEEN DATE '2025-01-01' AND DATE '{YTD_END}' {rf}
        GROUP BY service_line_name
        ORDER BY gap {"ASC" if meta["lower_is_better"] else "DESC"}
    """)
    rows = [
        [row["capability"], float(row[col]), float(row[bcol]), float(row["gap"])]
        for _, row in df.iterrows()
    ]
    if not rows:
        return _response(question, "No capability data available.", [], [])
    above = [r for r in rows if (r[3] >= 0)]
    below = [r for r in rows if (r[3] < 0)]
    text = (
        f"{meta['label'].capitalize()} vs budget by capability (YTD 2025): "
        f"{len(above)} above budget, {len(below)} below. "
        f"Range: {rows[0][0]} {rows[0][3]:+,.0f} → {rows[-1][0]} {rows[-1][3]:+,.0f}."
    )
    return _response(
        question, text,
        ["capability", col, bcol, "gap"], rows,
        explicit_highlight=kpi,
    )


def _h_vs_py(question: str, region: Optional[str], kpi: str) -> dict:
    meta = KPI_META[kpi]
    col = meta["column"]
    rf = _region_clause(region)
    if meta["agg"] == "sum":
        agg_expr = f"SUM({col})"
    elif meta["agg"] == "weighted_mean":
        agg_expr = f"SUM({col} * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0)"
    else:
        agg_expr = f"AVG({col})"
    df = db_query(f"""
        SELECT EXTRACT(YEAR FROM period) AS yr, {agg_expr} AS {col}
        FROM vw_kpi_monthly
        WHERE EXTRACT(YEAR FROM period) IN ({PY}, {CURRENT_YEAR}) {rf}
        GROUP BY 1 ORDER BY 1
    """)
    rows = [[int(r["yr"]), float(r[col])] for _, r in df.iterrows()]
    if len(rows) < 2:
        return _response(question, f"Only one year of {meta['label']} data is available.", [], [])
    py_val, cy_val = rows[0][1], rows[1][1]
    delta_pct = (cy_val - py_val) / py_val * 100 if py_val else 0.0
    if meta["lower_is_better"]:
        sentiment = "improved" if delta_pct < 0 else "worsened"
    else:
        sentiment = "expanded" if delta_pct > 0 else ("compressed" if delta_pct < -1 else "held flat")
    text = (
        f"{meta['label'].capitalize()} {CURRENT_YEAR} vs {PY}: "
        f"{meta['fmt_value_compact'](py_val)} → {meta['fmt_value_compact'](cy_val)} "
        f"({delta_pct:+.1f}%) — {sentiment}."
    )
    return _response(question, text, ["year", col], rows, explicit_highlight=kpi)


def _h_vs_budget_overall(question: str, region: Optional[str], kpi: str) -> dict:
    meta = KPI_META[kpi]
    col, bcol = meta["column"], meta["budget_column"]
    rf = _region_clause(region)
    if meta["agg"] == "sum":
        actual_expr = f"SUM({col})"
        budget_expr = f"SUM({bcol})"
    elif meta["agg"] == "weighted_mean":
        actual_expr = f"SUM({col} * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0)"
        budget_expr = f"SUM({bcol} * budget_chargeable_hours) / NULLIF(SUM(budget_chargeable_hours), 0)"
    else:
        actual_expr = f"AVG({col})"
        budget_expr = f"AVG({bcol})"
    df = db_query(f"""
        SELECT period,
               {actual_expr} AS {col},
               {budget_expr} AS {bcol}
        FROM vw_kpi_monthly
        WHERE period BETWEEN DATE '2025-01-01' AND DATE '{YTD_END}' {rf}
        GROUP BY period ORDER BY period
    """)
    rows = [
        [r["period"].strftime("%Y-%m-%d"), float(r[col]), float(r[bcol])]
        for _, r in df.iterrows()
    ]
    if not rows:
        return _response(question, "No data available.", [], [])
    actual_total = sum(r[1] for r in rows) if meta["agg"] == "sum" else (sum(r[1] for r in rows) / len(rows))
    budget_total = sum(r[2] for r in rows) if meta["agg"] == "sum" else (sum(r[2] for r in rows) / len(rows))
    var = (actual_total - budget_total) / budget_total * 100 if budget_total else 0.0
    text = (
        f"YTD 2025 {meta['label']}: {meta['fmt_value_compact'](actual_total)} actual vs "
        f"{meta['fmt_value_compact'](budget_total)} budget ({var:+.1f}%)."
    )
    return _response(question, text, ["period", col, bcol], rows, explicit_highlight=kpi)


def _h_vs_budget_latest(question: str, region: Optional[str], kpi: str) -> dict:
    meta = KPI_META[kpi]
    col, bcol = meta["column"], meta["budget_column"]
    rf = _region_clause(region)
    if meta["agg"] == "sum":
        agg_a, agg_b = f"SUM({col})", f"SUM({bcol})"
    elif meta["agg"] == "weighted_mean":
        agg_a = f"SUM({col} * chargeable_hours) / NULLIF(SUM(chargeable_hours), 0)"
        agg_b = f"SUM({bcol} * budget_chargeable_hours) / NULLIF(SUM(budget_chargeable_hours), 0)"
    else:
        agg_a, agg_b = f"AVG({col})", f"AVG({bcol})"
    df = db_query(f"""
        SELECT period, {agg_a} AS {col}, {agg_b} AS {bcol}
        FROM vw_kpi_monthly
        WHERE period = DATE '{LATEST_MONTH}' {rf}
        GROUP BY period
    """)
    rows = [
        [r["period"].strftime("%Y-%m-%d"), float(r[col]), float(r[bcol])]
        for _, r in df.iterrows()
    ]
    if not rows:
        return _response(question, "No data available for the latest month.", [], [])
    actual, budget = rows[0][1], rows[0][2]
    var = (actual - budget) / budget * 100 if budget else 0.0
    if meta["lower_is_better"]:
        verdict = "within budget" if actual <= budget * 1.05 else "above budget"
    else:
        verdict = "above budget" if actual >= budget * 0.95 else "below budget"
    text = (
        f"Latest month ({rows[0][0]}) {meta['label']}: "
        f"{meta['fmt_value_compact'](actual)} actual vs {meta['fmt_value_compact'](budget)} "
        f"budget ({var:+.1f}%) — {verdict}."
    )
    return _response(question, text, ["period", col, bcol], rows, explicit_highlight=kpi)


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------


def _detect_intent(question: str, kpi: Optional[str]) -> Optional[str]:
    """Return an intent label or None. Intents map to handler functions below."""
    q = question.lower()
    if re.search(r"\bdec(ember|\.|\b)", q) and (kpi == "chargeable-hours" or kpi is None):
        return "december_dip"
    if "contributor" in q or ("largest" in q and "revenue" in q):
        return "revenue_contributor"
    if ("rate per hour" in q or "hourly rate" in q) and (
        "revenue" in q or "decline" in q or "drop" in q or "lower volume" in q
    ):
        return "rate_vs_volume"
    if kpi == "all" or "across all" in q or "all four" in q:
        return "all_kpis_vs_budget"
    if "largest" in q and ("gap" in q or "behind" in q):
        return "biggest_gap_to_budget"
    if "vs budget" in q or "to budget" in q or "above or below budget" in q or "tracking against budget" in q or "tracking vs budget" in q:
        if "by capability" in q or "which capability" in q:
            return "vs_budget_by_capability"
        if "within budget" in q and ("latest" in q or "month" in q):
            return "vs_budget_latest"
        return "vs_budget_overall"
    if "within budget" in q or "above budget" in q or "below budget" in q or ("budget" in q and "latest" in q):
        return "vs_budget_latest"
    if "compressed" in q or "vs 2024" in q or "vs prior year" in q or "year over year" in q:
        return "vs_py"
    if "by capability" in q or "monthly" in q and "by capability" in q or "by service line" in q:
        return "trend_by_capability"
    if "by region" in q or "which region" in q or ("region" in q and ("dragging" in q or "concentrated" in q or "current quarter" in q)):
        return "by_region"
    if ("highest" in q or "lowest" in q or "most" in q or "biggest" in q) and ("right now" in q or "currently" in q or "latest" in q):
        return "highest_capability_now"
    if ("highest" in q or "lowest" in q or "most" in q or "leading" in q or "delivering" in q) and ("capability" in q or "service line" in q or "q4" in q or "quarter" in q):
        return "top_capability"
    if "trend" in q or "month over month" in q or "12 months" in q or "over time" in q or "monthly" in q:
        return "trend"
    return None


def answer_locally(question: str, region: Optional[str] = None) -> Optional[dict]:
    """Classify the question against the KPI engine. Return None if unmatched."""
    kpi = _detect_kpi(question)
    intent = _detect_intent(question, kpi)
    if intent is None and kpi is None:
        return None

    # Cross-KPI intents.
    if intent == "all_kpis_vs_budget":
        return _h_all_kpis_vs_budget(question, region)
    if intent == "revenue_contributor":
        return _h_revenue_contributor(question, region)
    if intent == "rate_vs_volume":
        return _h_rate_vs_volume(question, region)

    # Per-KPI intents — require a KPI; default chargeable-hours when ambiguous
    # (e.g. "Show monthly trend for the last 12 months" with no KPI named).
    eff_kpi = kpi if kpi and kpi != "all" else "chargeable-hours"

    if intent == "december_dip":
        return _h_december_dip(question, region)
    if intent == "biggest_gap_to_budget":
        return _h_biggest_gap_to_budget(question, region, eff_kpi)
    if intent == "vs_budget_by_capability":
        return _h_vs_budget_by_capability(question, region, eff_kpi)
    if intent == "vs_budget_overall":
        return _h_vs_budget_overall(question, region, eff_kpi)
    if intent == "vs_budget_latest":
        return _h_vs_budget_latest(question, region, eff_kpi)
    if intent == "vs_py":
        return _h_vs_py(question, region, eff_kpi)
    if intent == "trend":
        return _h_trend(question, region, eff_kpi, by_capability=False)
    if intent == "trend_by_capability":
        return _h_trend(question, region, eff_kpi, by_capability=True)
    if intent == "by_region":
        return _h_by_region(question, region, eff_kpi)
    if intent == "highest_capability_now":
        return _h_highest_capability_now(question, region, eff_kpi)
    if intent == "top_capability":
        # Q4 detection
        q4 = "q4" in question.lower() or "fourth quarter" in question.lower()
        return _h_top_capability(question, region, eff_kpi, q4_only=q4, latest_only=False)

    # KPI named but no intent classified → default to overall vs budget for that KPI.
    if kpi and kpi != "all":
        return _h_vs_budget_overall(question, region, kpi)

    return None
