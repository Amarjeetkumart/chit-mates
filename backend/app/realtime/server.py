from __future__ import annotations

from typing import Sequence

import socketio
from fastapi import FastAPI

from app.core.config import settings


_ALLOWED_ORIGINS: Sequence[str] | str
if not settings.cors_allow_origins:
    _ALLOWED_ORIGINS = []
elif "*" in settings.cors_allow_origins:
    _ALLOWED_ORIGINS = "*"
else:
    _ALLOWED_ORIGINS = settings.cors_allow_origins

sio = socketio.AsyncServer(
    async_mode="asgi",
    cors_allowed_origins=_ALLOWED_ORIGINS,
    cors_credentials=settings.cors_allow_credentials,
    ping_interval=settings.websocket_ping_interval,
    ping_timeout=settings.websocket_ping_interval * 2,
    logger=settings.debug,
    engineio_logger=settings.debug,
)


def create_socket_app(app: FastAPI) -> socketio.ASGIApp:
    """Wrap the FastAPI application with the Socket.IO ASGI bridge."""

    return socketio.ASGIApp(
        sio,
        other_asgi_app=app,
        socketio_path="/ws/socket.io",
    )
