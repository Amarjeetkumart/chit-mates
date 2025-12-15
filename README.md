# Chit Multiplayer Card Game

Real-time multiplayer card passing game for four players featuring FastAPI backend, React frontend, WebSocket updates, and PostgreSQL persistence.

## Project Structure

- `backend/` – FastAPI application with game logic, WebSocket broadcasting, and database access via SQLAlchemy.
- `frontend/` – React + TypeScript client powered by Vite, Zustand, and React Query.
- `docker-compose.yml` – Development stack including PostgreSQL, backend API, and frontend dev server.

## Getting Started

### Prerequisites

- Docker and Docker Compose **or**
- Python 3.11+, Poetry, Node.js 20+

### Run with Docker

```bash
# From the repository root
docker compose up --build
```

Services exposed:

- API: http://localhost:8000/api
- Frontend: http://localhost:5173
- PostgreSQL: localhost:5432 (user/password: postgres/postgres)

### Local Development (without Docker)

1. **Backend**
   ```bash
   cd backend
   poetry install
   cp .env.example .env  # adjust if needed
   poetry run uvicorn app.main:app --reload --port 8000
   ```

2. **Frontend**
   ```bash
   cd frontend
   npm install
   npm run dev -- --host 0.0.0.0 --port 5173
   ```

3. **Environment Variables**

   - Frontend:
     ```bash
     export VITE_API_BASE_URL=http://localhost:8000/api
     export VITE_WS_BASE_URL=ws://localhost:8000
     ```
   - Backend (optional overrides in `.env`):
     - `DATABASE_URL` – Async SQLAlchemy URL (defaults to local Postgres)

## Key Features

- Room creation and join flow with unique room codes.
- Turn-based card passing enforcing no-repeat rule per sender/receiver pair.
- Multi-round gameplay with persistent leaderboard tracking outcomes.
- WebSocket push notifications for room state and live game updates.
- REST endpoints for room management, gameplay actions, and leaderboard queries.

## Testing & Linting

- Backend tests (pytest): `poetry run pytest`
- Backend lint (ruff): `poetry run ruff check .`
- Frontend lint: `npm run lint`

## API Overview

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/rooms/create` | POST | Create a room and host player |
| `/api/rooms/join` | POST | Join existing room |
| `/api/rooms/{code}` | GET | Fetch current room state |
| `/api/game/start` | POST | Start game for room |
| `/api/game/pass-card` | POST | Pass a card during turn |
| `/api/game/state/{id}` | GET | Current game state snapshot |
| `/api/game/next-round` | POST | Begin next round |
| `/api/leaderboard` | GET | Leaderboard standings |
| `/ws/rooms/{code}` | WS | Real-time room & game events |

## Database Schema

SQLAlchemy models cover:

- `users`, `rooms`, `room_players`
- `games`, `game_players`, `rounds`, `cards`, `moves`
- `leaderboard`

The FastAPI lifespan hook automatically creates tables in debug mode. For production, use migrations (Alembic) as needed.

## Notes

- Default configuration allows all CORS origins; adjust in `app/core/config.py` for production.
- WebSocket URLs derive from `VITE_WS_BASE_URL` or the API base URL.
- Frontend state persists select session data in `localStorage` to survive refreshes.
