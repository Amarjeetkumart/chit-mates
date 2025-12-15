from fastapi import APIRouter

from app.api.routes import game, leaderboard, rooms, ws

api_router = APIRouter()
api_router.include_router(rooms.router, prefix="/rooms", tags=["rooms"])
api_router.include_router(game.router, prefix="/game", tags=["game"])
api_router.include_router(leaderboard.router, prefix="/leaderboard", tags=["leaderboard"])
api_router.include_router(ws.router, prefix="/ws", tags=["ws"])
