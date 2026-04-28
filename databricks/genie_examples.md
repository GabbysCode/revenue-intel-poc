# Genie example questions (RevIntel exec dashboard)

Paste these into your Databricks Genie space (the one referenced by
`GENIE_SPACE_ID` in `backend/.env`) under "Example questions" so the four
prompt chips on the dashboard hit trained answers. The first question —
"Why did chargeable hours drop in December?" — is the demo's marquee
narrative; the others round out the four exec KPIs.

## Schema notes

The dashboard reads from `fact_revenue` and the two derived views
`vw_kpi_monthly` (region + capability monthly grain) and `vw_kpi_summary`
(region monthly rollup). Both views wrap every KPI column in `COALESCE` so
missing fact rows never blow up the API.

The four exec KPIs:

| KPI | Column | Aggregator | Direction |
| --- | --- | --- | --- |
| Chargeable Hours | `chargeable_hours` | `SUM` | higher is better |
| Rate Per Hour | `hourly_rate` | hours-weighted mean | higher is better |
| Gross Fee Days | `gross_fee_days` | `SUM` | higher is better |
| Unbilled Days | `unbilled_days` | `AVG` | **lower** is better |

Budget twins use the `budget_*` prefix (`budget_chargeable_hours` etc).

The synthetic seed encodes a **December chargeable-hours dip of `*0.88`** at
generation time (see `DECEMBER_HOURS_DIP` in
`backend/synthetic/generate.py`) — Christmas leave / shorter working month
— with rate held flat. This is what the marquee question pivots on.

## Marquee question — December dip (volume-driven)

**Q:** Why did chargeable hours drop in December?

**Expected SQL (canonical answer):**

```sql
SELECT
    date_trunc('month', CAST(date AS DATE)) AS period,
    SUM(chargeable_hours)                   AS chargeable_hours
FROM fact_revenue
WHERE date >= '2025-10-01' AND date <= '2025-12-31'
GROUP BY 1
ORDER BY 1
```

Returns roughly:

| period      | chargeable_hours |
| ----------- | ----------------:|
| 2025-10-01  | ~9,000           |
| 2025-11-01  | ~9,200           |
| 2025-12-01  | ~7,800           |

**Expected narrative:** Chargeable hours fell ~15% Nov→Dec while the weighted
hourly rate held flat. Volume-driven (fewer billable working days due to
Christmas leave), not rate compression. Capability mix unchanged.

The dashboard infers `highlight = chargeable-hours` from the result columns
(only `chargeable_hours` maps to a KPI), so the Chargeable Hours tab lights
up automatically.

## Rate-vs-volume decomposition

**Q:** Is rate per hour the reason for the revenue decline, or is it lower
volume?

**Expected SQL:**

```sql
SELECT
    date_trunc('month', CAST(date AS DATE)) AS period,
    SUM(chargeable_hours)            AS chargeable_hours,
    AVG(hourly_rate)                 AS hourly_rate,
    SUM(booked_revenue)              AS booked_revenue
FROM fact_revenue
WHERE date >= '2025-09-01' AND date <= '2025-12-31'
GROUP BY 1
ORDER BY 1
```

**Expected narrative:** Volume-driven. Hourly rate held within ±2% across the
quarter; chargeable hours moved ~15% in December. ~80/20 volume vs rate
contribution.

This response intentionally returns *two* KPI columns
(`chargeable_hours` + `hourly_rate`), so the dashboard does **not** light up
a single tab — the answer is cross-KPI.

## Largest contributor

**Q:** Which KPI is the largest contributor to the revenue drop?

**Expected SQL:** Same as the marquee question — ranks the four KPIs by
variance vs budget over the trailing quarter, expects `chargeable_hours` at
the top.

## Budget vs actuals YTD

**Q:** How are we tracking against budget across all four KPIs YTD?

**Expected SQL (one option):**

```sql
SELECT
    SUM(chargeable_hours)     AS chargeable_hours,
    SUM(budget_chargeable_hours)
                              AS budget_chargeable_hours,
    AVG(hourly_rate)          AS hourly_rate,
    AVG(budget_hourly_rate)   AS budget_hourly_rate,
    SUM(gross_fee_days)       AS gross_fee_days,
    SUM(budget_gross_fee_days)
                              AS budget_gross_fee_days,
    AVG(unbilled_days)        AS unbilled_days,
    AVG(budget_unbilled_days) AS budget_unbilled_days
FROM fact_revenue
WHERE date >= '2025-01-01' AND date <= '2025-12-31'
```

**Expected narrative:** Hours and gross fee days finishing ~6% behind budget
(the December dip drives most of that). Rate within tolerance. Unbilled
days well inside the 28-day budget — WIP discipline is healthy.
