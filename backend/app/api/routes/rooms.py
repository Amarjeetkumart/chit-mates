from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.dependencies import get_session
from app.schemas.room import (
    RoomCreateRequest,
    RoomCreateResponse,
    RoomJoinRequest,
    RoomJoinResponse,
    RoomPlayerRead,
    RoomRead,
)
from app.services.room_service import RoomService
from app.services.event_bus import broadcast_room_event

router = APIRouter()


@router.post("/create", response_model=RoomCreateResponse, status_code=status.HTTP_201_CREATED)
async def create_room(
    payload: RoomCreateRequest,
    session: AsyncSession = Depends(get_session),
) -> RoomCreateResponse:
    service = RoomService(session)
    try:
        room, host_player = await service.create_room(payload)
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    room = await service.get_room_by_code(room.code)
    host = next((player for player in room.players if player.id == host_player.id), None)
    if host is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Host player not found")

    room_schema = RoomRead.model_validate(room)
    host_schema = RoomPlayerRead.model_validate(host)
    await broadcast_room_event(
        room_schema.code,
        {
            "type": "room_state",
            "payload": room_schema.model_dump(mode="json"),
        },
    )

    return RoomCreateResponse(
        room=room_schema,
        host=host_schema,
        total_rounds=room.configured_rounds,
    )


@router.post("/join", response_model=RoomJoinResponse)
async def join_room(
    payload: RoomJoinRequest,
    session: AsyncSession = Depends(get_session),
) -> RoomJoinResponse:
    service = RoomService(session)
    try:
        room, player = await service.join_room(payload)
        await session.commit()
    except ValueError as exc:
        await session.rollback()
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail=str(exc)) from exc

    room = await service.get_room_by_code(room.code)
    player_full = next((rp for rp in room.players if rp.id == player.id), None)
    if player_full is None:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Player not found in room")

    room_schema = RoomRead.model_validate(room)
    player_schema = RoomPlayerRead.model_validate(player_full)

    await broadcast_room_event(
        room_schema.code,
        {
            "type": "room_state",
            "payload": room_schema.model_dump(mode="json"),
        },
    )

    return RoomJoinResponse(
        room=room_schema,
        player=player_schema,
    )


@router.get("/{room_code}", response_model=RoomRead)
async def get_room(
    room_code: str,
    session: AsyncSession = Depends(get_session),
) -> RoomRead:
    service = RoomService(session)
    try:
        room = await service.get_room_by_code(room_code)
        return RoomRead.model_validate(room)
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=str(exc)) from exc
