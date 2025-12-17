"""Realtime communication utilities (Socket.IO chat and voice)."""

from .server import create_socket_app, sio  # noqa: F401
from .events import trigger_voice_shutdown  # noqa: F401
