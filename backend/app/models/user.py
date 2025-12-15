from __future__ import annotations

import uuid
from datetime import datetime

from sqlalchemy import DateTime, String
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    display_name: Mapped[str] = mapped_column(String(64), unique=True, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=datetime.utcnow, nullable=False)

    rooms: Mapped[list["RoomPlayer"]] = relationship(back_populates="user", cascade="all, delete-orphan")
    leaderboard_entry: Mapped["LeaderboardEntry"] = relationship(back_populates="user", uselist=False)

    def __repr__(self) -> str:
        return f"User(id={self.id}, display_name={self.display_name})"
