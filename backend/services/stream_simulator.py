import asyncio
import json
import random
import uuid
from datetime import datetime, timezone
from collections import deque

from db.connection import get_conn

SOURCE_SYSTEMS = {
    "booking": {"source": "Salesforce", "descriptions": [
        "New engagement: {sl} advisory project",
        "Contract renewal: {client}",
        "Expansion deal: additional {sl} scope",
        "New client onboarding: {sl}",
        "SOW signed: {sl} transformation",
    ]},
    "billing": {"source": "Oracle", "descriptions": [
        "Invoice generated: {sl} services",
        "Milestone billing: {client} project",
        "Monthly retainer invoice: {sl}",
        "Final billing: {client} engagement",
        "Progress billing: {sl} phase 2",
    ]},
    "collection": {"source": "SAP", "descriptions": [
        "Payment received: {client}",
        "Wire transfer cleared: {sl} invoice",
        "ACH payment processed: {client}",
        "Partial payment received: {client}",
        "Full settlement: {sl} engagement",
    ]},
    "margin_update": {"source": "Internal ERP", "descriptions": [
        "Margin adjustment: {sl} reforecast",
        "Rate card update: {client}",
        "Utilization revision: {sl} team",
        "Cost reallocation: {client} project",
        "FX impact adjustment: {region}",
    ]},
}

AMOUNT_RANGES = {
    "booking": (50_000, 500_000),
    "billing": (20_000, 300_000),
    "collection": (15_000, 250_000),
    "margin_update": (-50_000, 80_000),
}

EVENT_WEIGHTS = [0.30, 0.30, 0.25, 0.15]


class StreamSimulator:
    def __init__(self):
        self.events: deque = deque(maxlen=200)
        self.subscribers: list[asyncio.Queue] = []
        self.running = False
        self.started_at: datetime | None = None
        self.total_events = 0
        self._clients_cache = None
        self._stats = {"booking": 0, "billing": 0, "collection": 0, "margin_update": 0}

    def _load_clients(self):
        if self._clients_cache is not None:
            return
        conn = get_conn()
        clients_df = conn.execute("""
            SELECT c.client_id, c.name, c.region_id, r.name as region_name
            FROM dim_clients c
            JOIN dim_regions r ON c.region_id = r.region_id
            LIMIT 100
        """).fetchdf()
        service_lines_df = conn.execute(
            "SELECT service_line_id, name FROM dim_service_lines"
        ).fetchdf()
        self._clients_cache = {
            "clients": clients_df.to_dict("records"),
            "service_lines": service_lines_df.to_dict("records"),
        }

    def _generate_event(self) -> dict:
        self._load_clients()
        event_type = random.choices(
            list(SOURCE_SYSTEMS.keys()), weights=EVENT_WEIGHTS, k=1
        )[0]
        info = SOURCE_SYSTEMS[event_type]
        client = random.choice(self._clients_cache["clients"])
        sl = random.choice(self._clients_cache["service_lines"])
        lo, hi = AMOUNT_RANGES[event_type]
        amount = round(random.uniform(lo, hi), 2)

        desc_template = random.choice(info["descriptions"])
        description = desc_template.format(
            sl=sl["name"], client=client["name"], region=client["region_name"]
        )

        event = {
            "id": f"evt_{uuid.uuid4().hex[:12]}",
            "timestamp": datetime.now(timezone.utc).isoformat(),
            "type": event_type,
            "source_system": info["source"],
            "client_id": client["client_id"],
            "client_name": client["name"],
            "region": client["region_name"],
            "region_id": client["region_id"],
            "service_line": sl["name"],
            "service_line_id": sl["service_line_id"],
            "amount": amount,
            "description": description,
        }
        return event

    def _persist_event(self, event: dict):
        try:
            conn = get_conn()
            conn.execute("""
                INSERT INTO fact_live_events
                (event_id, timestamp, event_type, source_system, client_id, client_name,
                 region_id, region_name, service_line_id, service_line_name, amount, description)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            """, [
                event["id"], event["timestamp"], event["type"], event["source_system"],
                event["client_id"], event["client_name"], event["region_id"], event["region"],
                event["service_line_id"], event["service_line"], event["amount"], event["description"],
            ])
        except Exception:
            pass

    def subscribe(self) -> asyncio.Queue:
        queue: asyncio.Queue = asyncio.Queue(maxsize=50)
        self.subscribers.append(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue):
        if queue in self.subscribers:
            self.subscribers.remove(queue)

    async def _broadcast(self, event: dict):
        data = json.dumps(event)
        dead = []
        for q in self.subscribers:
            try:
                q.put_nowait(data)
            except asyncio.QueueFull:
                dead.append(q)
        for q in dead:
            self.subscribers.remove(q)

    async def run(self):
        self.running = True
        self.started_at = datetime.now(timezone.utc)
        self._ensure_table()

        while self.running:
            event = self._generate_event()
            self.events.append(event)
            self.total_events += 1
            self._stats[event["type"]] += 1
            self._persist_event(event)
            await self._broadcast(event)
            await asyncio.sleep(random.uniform(2, 5))

    def _ensure_table(self):
        conn = get_conn()
        conn.execute("""
            CREATE TABLE IF NOT EXISTS fact_live_events (
                event_id VARCHAR PRIMARY KEY,
                timestamp VARCHAR,
                event_type VARCHAR,
                source_system VARCHAR,
                client_id VARCHAR,
                client_name VARCHAR,
                region_id VARCHAR,
                region_name VARCHAR,
                service_line_id VARCHAR,
                service_line_name VARCHAR,
                amount DOUBLE,
                description VARCHAR
            )
        """)

    def stop(self):
        self.running = False

    def get_status(self) -> dict:
        uptime = 0
        if self.started_at:
            uptime = (datetime.now(timezone.utc) - self.started_at).total_seconds()
        events_per_min = (self.total_events / max(uptime, 1)) * 60

        return {
            "running": self.running,
            "uptime_seconds": round(uptime),
            "total_events": self.total_events,
            "events_per_minute": round(events_per_min, 1),
            "subscribers": len(self.subscribers),
            "source_systems": [
                {"name": "Salesforce", "type": "booking", "events": self._stats["booking"], "status": "connected"},
                {"name": "Oracle", "type": "billing", "events": self._stats["billing"], "status": "connected"},
                {"name": "SAP", "type": "collection", "events": self._stats["collection"], "status": "connected"},
                {"name": "Internal ERP", "type": "margin_update", "events": self._stats["margin_update"], "status": "connected"},
            ],
        }

    def get_recent(self, limit: int = 50) -> list[dict]:
        items = list(self.events)
        return items[-limit:][::-1]


simulator = StreamSimulator()
