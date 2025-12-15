from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.models import LeaderboardEntry, User
from app.schemas.game import LeaderboardEntryModel, LeaderboardResponse


class LeaderboardService:
    def __init__(self, session: AsyncSession) -> None:
        self.session = session

    async def get_leaderboard(self) -> LeaderboardResponse:
        result = await self.session.execute(
            select(LeaderboardEntry)
            .options(selectinload(LeaderboardEntry.user))
            .order_by(LeaderboardEntry.total_points.desc())
        )
        entries = []
        for entry in result.scalars().all():
            entries.append(
                LeaderboardEntryModel(
                    user_id=entry.user_id,
                    display_name=entry.user.display_name,
                    total_points=entry.total_points,
                    wins=entry.wins,
                    second_places=entry.second_places,
                    third_places=entry.third_places,
                    losses=entry.losses,
                    games_played=entry.games_played,
                    updated_at=entry.updated_at,
                )
            )
        return LeaderboardResponse(entries=entries)
