import os
import asyncio
import httpx
from dotenv import load_dotenv

load_dotenv()

DATABRICKS_HOST = os.getenv("DATABRICKS_HOST", "")
DATABRICKS_TOKEN = os.getenv("DATABRICKS_TOKEN", "")
GENIE_SPACE_ID = os.getenv("GENIE_SPACE_ID", "")

HEADERS = {
    "Authorization": f"Bearer {DATABRICKS_TOKEN}",
    "Content-Type": "application/json",
}
BASE_URL = f"{DATABRICKS_HOST.rstrip('/')}/api/2.0/genie/spaces/{GENIE_SPACE_ID}"


async def ask_genie(question: str) -> dict:
    """Send a natural language question to Databricks Genie and poll for results."""
    if not all([DATABRICKS_HOST, DATABRICKS_TOKEN, GENIE_SPACE_ID]):
        return _mock_genie_response(question)

    async with httpx.AsyncClient(timeout=60.0) as client:
        conv_resp = await client.post(
            f"{BASE_URL}/start-conversation",
            headers=HEADERS,
            json={"content": question},
        )
        if conv_resp.status_code != 200:
            return {"error": f"Failed to start conversation: {conv_resp.text}", "question": question}

        data = conv_resp.json()
        conversation_id = data.get("conversation_id", "")
        message_id = data.get("message_id", "")

        result = await _poll_message(client, conversation_id, message_id)
        return {
            "question": question,
            "conversation_id": conversation_id,
            "response": result,
        }


async def _poll_message(client: httpx.AsyncClient, conversation_id: str, message_id: str, max_attempts: int = 30) -> dict:
    """Poll Genie for the message result until completed."""
    for _ in range(max_attempts):
        resp = await client.get(
            f"{BASE_URL}/conversations/{conversation_id}/messages/{message_id}",
            headers=HEADERS,
        )
        if resp.status_code != 200:
            return {"status": "error", "detail": resp.text}

        msg = resp.json()
        status = msg.get("status", "")

        if status == "COMPLETED":
            attachments = msg.get("attachments", [])
            result = {"status": "completed", "text": "", "sql": "", "data": None}

            text_parts = []
            for att in attachments:
                if "text" in att:
                    text_parts.append(att["text"].get("content", ""))
                elif "query" in att:
                    query_att = att["query"]
                    result["sql"] = query_att.get("query", "")
                    result["description"] = query_att.get("description", "")
                    statement_id = query_att.get("statement_id", "")
                    if statement_id:
                        result["statement_id"] = statement_id
                    row_count = query_att.get("query_result_metadata", {}).get("row_count")
                    if row_count is not None:
                        result["row_count"] = row_count

            query_result = msg.get("query_result", {})
            stmt_id = query_result.get("statement_id", result.get("statement_id", ""))
            if stmt_id and not result.get("data"):
                try:
                    sr = await client.get(
                        f"{DATABRICKS_HOST.rstrip('/')}/api/2.0/sql/statements/{stmt_id}",
                        headers=HEADERS,
                    )
                    if sr.status_code == 200:
                        sr_data = sr.json()
                        manifest = sr_data.get("manifest", {})
                        columns = [c.get("name", "") for c in manifest.get("schema", {}).get("columns", [])]
                        chunks = sr_data.get("result", {}).get("data_array", [])
                        if columns and chunks:
                            result["data"] = {"columns": columns, "rows": chunks}
                except Exception:
                    pass

            result["text"] = "\n\n".join(text_parts)
            return result

        if status in ("FAILED", "CANCELLED"):
            return {"status": status.lower(), "detail": msg.get("error", "Unknown error")}

        await asyncio.sleep(2)

    return {"status": "timeout", "detail": "Genie did not respond in time"}


async def generate_executive_summary(period_start: str, period_end: str, region: str = None) -> dict:
    """Generate an executive summary using Databricks Foundation Model APIs or Genie."""
    region_clause = f" for the {region} region" if region else ""
    prompt = (
        f"Generate a concise executive summary of revenue performance "
        f"from {period_start} to {period_end}{region_clause}. "
        f"Include key metrics: total revenue, billing efficiency, collection rates, "
        f"margin trends, and top/bottom performing service lines. "
        f"Highlight risks and opportunities."
    )

    if not all([DATABRICKS_HOST, DATABRICKS_TOKEN, GENIE_SPACE_ID]):
        return _mock_executive_summary(period_start, period_end, region)

    result = await ask_genie(prompt)
    return {
        "period": f"{period_start} to {period_end}",
        "region": region or "All Regions",
        "summary": result.get("response", {}).get("text", "Summary generation in progress..."),
        "generated_by": "Databricks Genie",
    }


def _mock_genie_response(question: str) -> dict:
    """Fallback mock response when Databricks credentials are not configured."""
    from db.connection import query as db_query

    q_lower = question.lower()

    if any(w in q_lower for w in ["revenue", "total", "how much"]):
        df = db_query("SELECT SUM(booked_revenue) as total FROM fact_revenue WHERE date >= '2025-01-01'")
        total = round(float(df.iloc[0]["total"]), 2)
        return {
            "question": question,
            "response": {
                "status": "completed",
                "text": f"Total booked revenue for 2025 is ${total:,.2f}.",
                "sql": "SELECT SUM(booked_revenue) as total FROM fact_revenue WHERE date >= '2025-01-01'",
                "data": {"columns": ["total"], "rows": [[total]]},
            },
            "source": "local_fallback",
        }

    if any(w in q_lower for w in ["top", "best", "highest"]):
        df = db_query("""
            SELECT s.name, SUM(r.booked_revenue) as revenue
            FROM fact_revenue r JOIN dim_service_lines s ON r.service_line_id = s.service_line_id
            WHERE r.date >= '2025-01-01' GROUP BY s.name ORDER BY revenue DESC LIMIT 5
        """)
        rows = [[row["name"], round(row["revenue"], 2)] for _, row in df.iterrows()]
        return {
            "question": question,
            "response": {
                "status": "completed",
                "text": f"The top performing service line is {rows[0][0]} with ${rows[0][1]:,.2f} in revenue.",
                "sql": "SELECT ... GROUP BY service_line ORDER BY revenue DESC LIMIT 5",
                "data": {"columns": ["service_line", "revenue"], "rows": rows},
            },
            "source": "local_fallback",
        }

    if any(w in q_lower for w in ["region", "geography", "where"]):
        df = db_query("""
            SELECT reg.name, SUM(r.booked_revenue) as revenue
            FROM fact_revenue r JOIN dim_regions reg ON r.region_id = reg.region_id
            WHERE r.date >= '2025-01-01' GROUP BY reg.name ORDER BY revenue DESC
        """)
        rows = [[row["name"], round(row["revenue"], 2)] for _, row in df.iterrows()]
        return {
            "question": question,
            "response": {
                "status": "completed",
                "text": f"Revenue by region: " + ", ".join(f"{r[0]}: ${r[1]:,.2f}" for r in rows),
                "sql": "SELECT region, SUM(booked_revenue) ... GROUP BY region",
                "data": {"columns": ["region", "revenue"], "rows": rows},
            },
            "source": "local_fallback",
        }

    return {
        "question": question,
        "response": {
            "status": "completed",
            "text": "I can answer questions about revenue, service lines, regions, billing, and collections. Try asking about total revenue, top service lines, or regional performance.",
            "sql": "",
            "data": None,
        },
        "source": "local_fallback",
    }


def _mock_executive_summary(period_start: str, period_end: str, region: str = None) -> dict:
    from db.connection import query as db_query

    region_filter = f"AND region_id = '{region}'" if region else ""
    df = db_query(f"""
        SELECT
            SUM(booked_revenue) as revenue,
            SUM(billed_amount) as billed,
            SUM(collected_amount) as collected,
            AVG(margin_pct) as margin,
            COUNT(DISTINCT client_id) as clients
        FROM fact_revenue
        WHERE date >= '{period_start}' AND date <= '{period_end}'
        {region_filter}
    """)
    r = df.iloc[0]
    rev = float(r["revenue"])
    billed = float(r["billed"])
    collected = float(r["collected"])
    margin = float(r["margin"])
    clients = int(r["clients"])
    coll_rate = (collected / billed * 100) if billed > 0 else 0

    summary = (
        f"**Executive Revenue Summary ({period_start} to {period_end})**\n\n"
        f"Total booked revenue reached **${rev:,.0f}** across **{clients}** active client accounts. "
        f"Billing efficiency stands at **{billed/rev*100:.1f}%** of booked revenue, "
        f"with a collection rate of **{coll_rate:.1f}%**.\n\n"
        f"Average margin across all engagements is **{margin:.1f}%**. "
        f"{'The margin trend is healthy and above target.' if margin > 25 else 'Margins are under pressure and require attention.'}\n\n"
        f"**Key Risks:** DSO trending {'above' if coll_rate < 75 else 'within'} target range. "
        f"AR concentration in top accounts warrants monitoring.\n\n"
        f"**Opportunities:** Pipeline conversion rates suggest room for growth in Advisory and Technology service lines."
    )

    return {
        "period": f"{period_start} to {period_end}",
        "region": region or "All Regions",
        "summary": summary,
        "generated_by": "Local Analytics Engine (configure Databricks for Genie-powered summaries)",
    }
