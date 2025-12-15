from uuid import UUID

from pydantic import BaseModel, Field

from app.schemas.common import APIModel


class UserCreate(BaseModel):
    display_name: str = Field(min_length=1, max_length=64)


class UserRead(APIModel):
    id: UUID
    display_name: str
