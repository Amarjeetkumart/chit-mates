from fastapi import APIRouter, Depends
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
from app.schemas.game import LeaderboardResponse
from app.services.leaderboard_service import LeaderboardService

router = APIRouter()


@router.get("", response_model=LeaderboardResponse)
async def get_leaderboard(session: AsyncSession = Depends(get_session)) -> LeaderboardResponse:
    service = LeaderboardService(session)
    return await service.get_leaderboard()
