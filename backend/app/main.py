from __future__ import annotations

from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.router import api_router
from app.core.config import settings
from app.core.logging import configure_logging
from app.db.base import Base
from app.db.session import engine
from app.realtime import create_socket_app
import app.realtime.events  # noqa: F401 - ensure handlers are registered

configure_logging(settings.debug)


@asynccontextmanager
async def lifespan(app: FastAPI):
    if settings.debug:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
    yield


fastapi_app = FastAPI(title=settings.project_name, debug=settings.debug, lifespan=lifespan)

fastapi_app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_allow_origins,
    allow_credentials=settings.cors_allow_credentials,
    allow_methods=settings.cors_allow_methods,
    allow_headers=settings.cors_allow_headers,
)

fastapi_app.include_router(api_router, prefix=settings.api_prefix)


@fastapi_app.get("/health", tags=["health"])
async def health_check() -> dict[str, str]:
    return {"status": "ok"}


app = create_socket_app(fastapi_app)

# Re-export FastAPI application for tests if needed
api_app = fastapi_app
