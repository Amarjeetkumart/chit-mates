from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, Field


class APIModel(BaseModel):
    model_config = {
        "from_attributes": True,
        "populate_by_name": True,
    }


class IdentifierModel(APIModel):
    id: UUID = Field(description="Unique identifier")
    created_at: datetime | None = Field(default=None, description="Entity creation timestamp")
