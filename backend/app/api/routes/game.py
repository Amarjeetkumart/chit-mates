from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Path, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
from app.schemas.game import (
    GameStartRequest,
    GameStateResponse,
    NextRoundRequest,
    NextRoundResponse,
    PassCardRequest,
    PassCardResponse,
)
from app.services.game_service import GameService

router = APIRouter()


@router.post("/start", response_model=GameStateResponse)
async def start_game(
    payload: GameStartRequest,
    session: AsyncSession = Depends(get_session),
) -> GameStateResponse:
    service = GameService(session)
    try:
        result = await service.start_game(payload)
        return result
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.post("/pass-card", response_model=PassCardResponse)
async def pass_card(
    payload: PassCardRequest,
    session: AsyncSession = Depends(get_session),
) -> PassCardResponse:
    service = GameService(session)
    try:
        response = await service.pass_card(payload)
        return response
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc


@router.get("/state/{game_id}", response_model=GameStateResponse)
async def get_game_state(
    game_id: UUID = Path(..., description="ID of the game"),
    session: AsyncSession = Depends(get_session),
) -> GameStateResponse:
    service = GameService(session)
    return await service.get_game_state(game_id)


@router.post("/next-round", response_model=NextRoundResponse)
async def next_round(
    payload: NextRoundRequest,
    session: AsyncSession = Depends(get_session),
) -> NextRoundResponse:
    service = GameService(session)
    try:
        response = await service.start_next_round(payload)
        return response
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc
