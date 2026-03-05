import asyncio
import json
from fastapi import APIRouter, Query
from fastapi.responses import StreamingResponse
from services.stream_simulator import simulator

router = APIRouter()


@router.get("/events")
async def stream_events():
    queue = simulator.subscribe()

    async def event_generator():
        try:
            yield f"data: {json.dumps({'type': 'connected', 'message': 'Stream connected'})}\n\n"
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {data}\n\n"
                except asyncio.TimeoutError:
                    yield f": keepalive\n\n"
        except asyncio.CancelledError:
            pass
        finally:
            simulator.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/status")
async def stream_status():
    return simulator.get_status()


@router.get("/recent")
async def recent_events(limit: int = Query(50, ge=1, le=200)):
    return {"events": simulator.get_recent(limit)}
