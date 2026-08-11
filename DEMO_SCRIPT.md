# RevIntel — Demo Script

A presenter script for the RevIntel POC: eight acts, each tying a screen to a
reason the platform belongs on Databricks, plus a closing argument for building
the dashboard as a Databricks App.

**Runtime:** ~28 minutes for the full path, ~12 for the short path (Acts 1, 6, 8).
**Audience:** CFO / Finance Director and their data leadership. Adjust the
technical depth in the "Why this is better on Databricks" beats accordingly.

> **Read [Presenter honesty notes](#presenter-honesty-notes) before you
> present.** Several panels are deliberate simulations. A technical buyer will
> ask, and the demo survives the question easily if you're ahead of it.

---

## Before you start

| Check | Command / action |
|---|---|
| Backend up | `make backend` → <http://localhost:8000/docs> responds |
| Frontend up | `make frontend` → <http://localhost:3000> loads |
| Data seeded | `make seed` (regenerates the DuckDB file) |
| Live Feed warmed | Open `/live` ~60s early so events have accumulated |
| Genie (optional) | `DATABRICKS_HOST` / `DATABRICKS_TOKEN` / `GENIE_SPACE_ID` set, else chat runs local-only |

Open tabs in demo order — `/`, `/live`, `/cashflow`, `/forecasting`,
`/scenarios`, `/time-travel`, `/data-quality` — so you're never typing URLs
while talking.

---

## Act 0 — The problem (2 min, no screen)

> "Every month your finance team rebuilds the same picture by hand. Bookings
> live in Salesforce. Billing sits in Oracle. Collections are in SAP. Margin
> comes out of the ERP. Someone exports four spreadsheets, reconciles them over
> three days, and by the time the pack reaches the board it describes a company
> that existed three weeks ago.
>
> The cost isn't the three days. It's that nobody can ask a follow-up question.
> 'Why did Advisory margin drop in EMEA?' means another cycle. So people stop
> asking, and decisions get made on the version of the numbers that happened to
> land in the deck.
>
> What I'm about to show you is one place where the numbers live, and where the
> follow-up question takes ten seconds instead of another week."

---

## Act 1 — The unified dashboard (4 min)

**Screen:** `/` — Analytics

**Do:** Land on the dashboard. Let the eight KPI tiles and the revenue trend
settle before speaking. Switch between the **Revenue Attribution** and
**Billings & Collections** tabs. Change the date range. Change the region
filter to EMEA and let everything recompute.

> "One screen: revenue, margin, billed, collected, orders, AR balance, WIP, and
> collections rate. These aren't four dashboards stitched together — it's one
> query layer over one copy of the data.
>
> Watch what happens when I scope this to EMEA. Every tile, the trend, and the
> attribution mix all move together, because they're all derived from the same
> tables rather than from four separately-maintained extracts. There's no
> reconciliation step here, because there's nothing to reconcile."

**Why this is better on Databricks:**

> "The reason those four source systems can sit behind one filter is that
> they've been landed into one governed place. In a Databricks deployment that's
> Unity Catalog: Salesforce, Oracle, SAP, and the ERP land as Delta tables in
> one catalog, with one permission model and one lineage graph across all of
> them. The alternative — a warehouse for finance, a lake for data science, a
> BI extract for the board — is what creates the reconciliation problem in the
> first place."

---

## Act 2 — Live Feed (3 min)

**Screen:** `/live`

**Do:** Point at the events arriving on their own. Point out the four source
systems in the connector panel and the events-per-minute counter.

> "This is the same picture, live. Every row is a business event as it lands:
> a booking from Salesforce, an invoice from Oracle, a payment from SAP, a
> margin adjustment from the ERP. Nobody refreshed anything — that's a stream.
>
> For a monthly board pack, live data is a nice-to-have. For a credit
> controller chasing a payment, or a partner deciding whether to staff a
> project next week, it's the whole job."

**Why this is better on Databricks:**

> "The important part is what *isn't* here: a second system. The same Delta
> tables serving the board pack are being appended to in real time. On
> Databricks that's Lakeflow / Structured Streaming writing into the same
> tables your BI reads, with exactly-once guarantees — so streaming and batch
> can't disagree with each other. Most architectures end up with a fast path
> and a slow path that give two different revenue numbers, and then a standing
> meeting to reconcile them."

---

## Act 3 — Cash flow (3 min)

**Screen:** `/cashflow`

**Do:** Walk the waterfall left to right — booked, recognised, billed,
collected. Then the DSO meter, then AR aging.

> "This is where the money actually goes. Booked at the left, collected at the
> right, and every step where value leaks in between. The gap between billed
> and collected is working capital sitting in someone else's bank account.
>
> DSO here" — point — "is the single number your treasury team is judged on,
> and the aging buckets tell you which conversations to have this week rather
> than which quarter to worry about."

**Why this is better on Databricks:**

> "That waterfall is one SQL query across the full grain of the data — not a
> pre-aggregated cube built overnight. Serverless SQL warehouses mean you can
> ask it at the client level across the whole history and get an answer in
> seconds, then scale to zero when the quarter-end rush is over. You're not
> pre-building every aggregate you might need, which is what makes traditional
> BI so slow to change when the question changes."

---

## Act 4 — Forecasting (4 min)

**Screen:** `/forecasting`

**Do:** Show the forecast with its confidence bands. Change the horizon.
Switch between models in the comparison panel. Land on Recommended Actions.

> "Forward-looking, not backward. The shaded bands matter more than the line —
> this is a range with a confidence interval, not a single number pretending to
> be certain. When you take a forecast to a board, the honest version is
> 'between here and here, most likely there.'
>
> The model comparison is there because no single model wins everywhere. And
> the recommended actions turn the forecast into something a human can act on
> this week."

**Why this is better on Databricks:**

> "Forecasting on the same platform as the data is the point. No extract to a
> data science environment, no copy that drifts out of date, no separate
> permission model for the modelling team. On Databricks the model trains where
> the data already lives, gets versioned in Unity Catalog alongside the tables
> it was trained on, and is tracked in MLflow — so when the board asks 'what
> did we forecast in March and why', you can answer with the exact model
> version and the exact training data. That's very hard to reconstruct when
> your models live on someone's laptop or in a separate ML tool."

---

## Act 5 — Scenario planning (3 min)

**Screen:** `/scenarios`

**Do:** Set revenue growth to something ambitious, push DSO out by 15 days,
run it. Show the P10/P50/P90 spread and the tornado chart.

> "This is the 'what if' conversation, with numbers. I'm moving five levers —
> growth, churn, win rate, a macro factor, and DSO — and running a thousand
> simulations against the actual book of business.
>
> The output isn't one answer, it's a distribution: the pessimistic case, the
> likely case, the optimistic case. And the tornado chart ranks which lever
> actually matters. That reframes the planning conversation from 'what number
> do we commit to' into 'which lever do we pull first'."

**Why this is better on Databricks:**

> "A thousand iterations across the full dataset is a compute problem. On
> Databricks that's elastic — you ask for it, it runs, you stop paying. The
> version of this analysis that runs in a spreadsheet has to shrink the
> problem until it fits: fewer iterations, fewer levers, aggregated inputs. You
> end up making the model worse to fit the tool."

---

## Act 6 — Time travel (4 min) ← *strongest Databricks-native story*

**Screen:** `/time-travel`

**Do:** Show the three versions — Q2 Close, Q3 Restatement, Year-End
Adjustment. Show the revenue delta between them. Open the diff viewer and drill
into which region and service line actually moved.

> "Here's the question that ends careers: 'the number you gave the board in Q2
> doesn't match the number in the annual report — which one was wrong?'
>
> Usually answering that means restoring a backup, or trusting someone's
> memory. Here I just pick the two versions and ask. Q2 Close versus the Q3
> Restatement, and the diff shows me not just that the total moved, but exactly
> which region and which service line moved it, row by row.
>
> That's the difference between 'we think it was a late Advisory adjustment in
> EMEA' and being able to show it."

**Why this is better on Databricks:**

> "This one is close to free on Databricks and genuinely hard anywhere else.
> Delta Lake keeps the transaction log, so every table is queryable as of a
> previous version or timestamp — `SELECT ... VERSION AS OF 3`. You get audit
> and restatement history as a property of the storage format, not as a
> data-warehousing project someone has to design, build, and maintain. For a
> regulated finance function, that's often the single line item that justifies
> the platform."

---

## Act 7 — Data quality (3 min)

**Screen:** `/data-quality`

**Do:** Show the overall score, the trend, then the anomaly table with real
failures in it.

> "Every number I've shown you is worth exactly as much as the data underneath
> it, so this screen is about earning the right to trust the other six.
>
> Null checks, range checks, freshness, duplicates, schema — running
> continuously across the core tables, scored over time. And crucially it shows
> failures" — point at the anomaly table — "rather than a permanent green tick.
> A quality dashboard that's always 100% is a quality dashboard nobody reads.
>
> When a tile on the main dashboard looks wrong, this tells you whether it's
> the business or the pipeline before anyone escalates."

**Why this is better on Databricks:**

> "Quality here is part of the pipeline, not a separate audit. Lakeflow
> expectations let you declare the rules with the transformation, so bad rows
> get quarantined at write time, and Lakehouse Monitoring tracks drift on the
> tables themselves. Combined with lineage in Unity Catalog, when a check fails
> you can see every downstream dashboard and model affected — which is the
> question everyone actually asks, and the one that's nearly impossible to
> answer with a bolt-on quality tool."

---

## Act 8 — Ask it in English (3 min)

**Screen:** any page, chat panel — then **Generate Executive Summary**

**Do:** Ask two or three questions in the chat. Then press Generate Executive
Summary and read a couple of lines aloud.

Good questions, because the seeded data has real signal behind them:

- "What was total revenue in 2025?"
- "Which service line is growing fastest?"
- "Why does Audit revenue peak in Q4 and Q1?" — the generator gives Audit &
  Assurance a genuine Q4/Q1 seasonal peak, and Tax & Legal a Q2 peak, so the
  answer reflects a real pattern in the data rather than a canned response.

> "Everything I've shown you so far assumes someone built the screen first. This
> is the other half: the CFO asks a question nobody anticipated, in English, and
> gets an answer from the same governed tables.
>
> And this" — Generate Executive Summary — "is the three-day pack, written in a
> few seconds, from live data."

**Why this is better on Databricks:**

> "Two things make this safe rather than a gimmick. First, Genie answers from
> your actual schema with Unity Catalog permissions applied — so it can't leak
> a region a user isn't entitled to see, and it shows you the SQL it ran, which
> means the answer is auditable. Second, the summary runs on Foundation Model
> APIs inside the platform, so your revenue figures never leave Databricks to
> reach a model. Every 'add AI to our finance data' project eventually hits
> those two walls — governance and data residency — and this is what clearing
> them looks like."

---

## Closing — why the dashboard itself is a Databricks App (3 min)

This is the architectural argument. Worth making explicitly, because it's the
part people don't expect.

> "One last thing, and it's about how this is delivered rather than what it
> shows. This is a custom React front end and a Python API — and it's running
> *inside* Databricks, as a Databricks App, right next to the data."

**What that buys you:**

- **No second stack to secure.** The app is behind workspace SSO. There's no
  separate login, no public ingress, no auth service to build. Access is the
  workspace permission model you already run — `CAN_USE` on an app is the same
  kind of grant as access to a table.
- **The data never leaves the platform.** The API queries governed tables in
  place. Compare that with the usual pattern — a BI extract or a nightly copy
  into an app database — where every copy is a new place to secure, a new thing
  to reconcile, and a new residency question.
- **Unity Catalog governance still applies.** The app runs as an identity, and
  that identity's grants decide what it can read. You don't re-implement
  row-level security in application code.
- **No infrastructure.** No VPC, load balancer, container registry, or
  Kubernetes. Deployment is source plus an `app.yaml`; the platform builds and
  runs it. Secrets come from secret scopes rather than environment files.
- **Full design freedom.** This is the honest reason to choose an App over a
  standard dashboard: the streaming feed, the scenario sliders, the version
  diff viewer, and the branded exec layout are all bespoke interactions. A
  governed dashboard tool can't express them.

**Be straight about the trade-off** — it makes the recommendation credible:

> "I wouldn't build everything this way. AI/BI dashboards are the right answer
> for standard reporting: no code, nothing to maintain, and Genie built in. An
> App is the right answer when the interaction is the product — write-back,
> simulation, bespoke workflow, a branded experience for the board. Most
> organisations want both, and the good news is they run on the same data with
> the same governance."

**Close:**

> "So: four source systems, one governed copy, one place to ask questions —
> streaming, forecasting, scenarios, restatement history, and quality all on
> the same platform, with the interface built where the data already lives.
>
> The obvious next step is a scoped pilot on your real numbers. One service
> line, one region, your actual Salesforce and Oracle feeds, four to six weeks.
> The screens you've seen become the acceptance criteria."

---

## Q&A — likely questions

| Question | Answer |
|---|---|
| "Is this our data?" | No — synthetic, ~500 clients over 2023–2025, shaped to look like a professional services book. Deliberate, so we can share it freely. Your pilot would use real feeds. |
| "How long to stand this up for real?" | The platform and ingestion in weeks, not quarters. The long pole is source access and agreeing metric definitions, not the technology. |
| "We already have Power BI / Tableau." | Keep it. This is about the layer underneath — one governed copy of the data. Point your existing BI at the same tables; nothing here requires replacing it. |
| "What about the streaming — do we need Kafka?" | Not necessarily. Lakeflow reads from message queues, cloud storage, or CDC off your source databases. Many customers start with CDC and add streaming later. |
| "Can we trust the AI answers?" | Genie shows the SQL it ran and honours Unity Catalog permissions, so answers are auditable and scoped. Treat it as a very fast analyst whose work you can check, not an oracle. |
| "Who can see what?" | Unity Catalog grants, enforced consistently for the dashboard, the chat, and the notebooks. One permission model rather than one per tool. |
| "What does it cost to run?" | Serverless compute scales to zero between uses; the app tier is small. A pilot's real cost is people, and we'd size the platform properly against your volumes. |

---

## Presenter honesty notes

Know these before you demo. Every one of them is fine to say out loud, and
saying it first builds far more credibility than getting caught.

- **The data is synthetic.** Generated locally — ~500 clients, monthly revenue
  across 2023–2025, 4 regions, 6 service lines. The seasonality is real and
  intentional (Audit peaks Q4/Q1, Tax peaks Q2), so "why does this move" style
  questions have genuine signal.
- **The Live Feed is a simulator.** `services/stream_simulator.py` generates
  plausible events every 2–5 seconds and labels them Salesforce / Oracle / SAP
  / Internal ERP. It demonstrates the UX of streaming, not a live connection.
  Say "simulated feed" and the point still lands.
- **The forecast models are stand-ins.** They're labelled Prophet and XGBoost
  but are simplified implementations — a trend-plus-seasonality decomposition
  and a gradient-boosted lag model — with a little noise added. Directionally
  honest, not production forecasting. If asked, the real answer is "in a pilot
  this is a proper model in MLflow."
- **Scenario sensitivities include random jitter.** The tornado ranking is
  illustrative. Talk about it as "which levers matter most", not precise
  attribution.
- **Time travel is a versioned table, not Delta time travel.** The three
  snapshots live in `fact_revenue_versions`. It's a faithful demonstration of
  what Delta gives you natively, implemented in the POC's own schema. The
  Databricks capability it represents is real; this specific screen isn't
  calling `VERSION AS OF`.
- **The query engine is DuckDB inside the app.** The POC ships a local DuckDB
  file so it runs anywhere. It stands in for a SQL warehouse over Delta. Don't
  claim the demo is executing on Databricks compute unless you've wired it up.
- **Genie may be in local fallback.** Without `DATABRICKS_HOST`,
  `DATABRICKS_TOKEN`, and `GENIE_SPACE_ID`, the chat answers from local SQL and
  returns `"source": "local_fallback"`. Still a good demo — just don't
  attribute it to Genie when it isn't.

### Deployment status — read this before promising a live URL

This build runs locally via `make dev`. It does **not** currently include the
Databricks Apps scaffolding — there's no `app.yaml` or packaged wheel on this
commit, so it can't be deployed to Apps as-is.

The Apps deploy tooling and the four-KPI build it was written for live on the
`wip/deploy-and-logging-fixes` branch and at commit `c9c2b22`. What is deployed
in the `tellr-dev` workspace right now is the **four-KPI build**, not this one:

- Frontend: <https://revintel-frontend-7474645249186749.aws.databricksapps.com>
- Backend: <https://revintel-backend-7474645249186749.aws.databricksapps.com>

So if you plan to demo the Databricks Apps closing argument against a live
deployment, either demo the four-KPI build, or port the `app.yaml` +
wheel-packaging scaffolding onto this build first. Presenting this build from
`localhost` while making the "it runs inside Databricks" argument is fine —
just describe the architecture rather than implying the local instance is it.
