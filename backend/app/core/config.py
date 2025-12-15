from functools import lru_cache
from typing import Annotated

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    debug: bool = Field(default=False)
    api_prefix: str = Field(default="/api")
    project_name: str = Field(default="Chit Game Service")
    database_url: str = Field(
        default="postgresql+asyncpg://postgres:postgres@db:5432/chit_game",
        validation_alias="DATABASE_URL",
    )
    cors_allow_origins: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_methods: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_headers: list[str] = Field(default_factory=lambda: ["*"])
    cors_allow_credentials: bool = Field(default=True)
    websocket_ping_interval: int = Field(default=20)
    default_rounds: int = Field(default=1)

    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )


@lru_cache()
def get_settings() -> Settings:
    return Settings()


settings: Annotated[Settings, "Application settings"] = get_settings()
