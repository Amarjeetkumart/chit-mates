from __future__ import annotations

import asyncio
from typing import Any, Dict, Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: Dict[str, Set[WebSocket]] = {}
        self._lock = asyncio.Lock()

    async def connect(self, room_code: str, websocket: WebSocket) -> None:
        async with self._lock:
            clients = self._rooms.setdefault(room_code, set())
            clients.add(websocket)

    async def disconnect(self, room_code: str, websocket: WebSocket) -> None:
        async with self._lock:
            clients = self._rooms.get(room_code)
            if not clients:
                return
            clients.discard(websocket)
            if not clients:
                self._rooms.pop(room_code, None)

    async def broadcast(self, room_code: str, message: dict[str, Any]) -> None:
        async with self._lock:
            clients = list(self._rooms.get(room_code, set()))
        for websocket in clients:
            try:
                await websocket.send_json(message)
            except RuntimeError:
                # Connection might be closed; ignore for now
                pass


manager = ConnectionManager()


async def broadcast_room_event(room_code: str, event: dict[str, Any]) -> None:
    await manager.broadcast(room_code, event)
