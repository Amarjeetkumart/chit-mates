from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.event_bus import manager

router = APIRouter()


@router.websocket("/rooms/{room_code}")
async def room_updates(websocket: WebSocket, room_code: str) -> None:
    await websocket.accept()
    await manager.connect(room_code, websocket)
    try:
        while True:
            await websocket.receive_json()
            # WebSocket is primarily used for server push; ignore incoming messages for now
    except WebSocketDisconnect:
        await manager.disconnect(room_code, websocket)
    except Exception:
        await manager.disconnect(room_code, websocket)
        raise
