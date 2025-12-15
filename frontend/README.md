# Chit Game Frontend

React + TypeScript client for the Chit multiplayer card passing game. Provides room creation/join flows, real-time game board, and leaderboard views backed by FastAPI APIs.

## Available Scripts

```bash
npm install          # install dependencies
npm run dev          # start Vite dev server (http://localhost:5173)
npm run build        # create production build
npm run preview      # preview built assets
npm run lint         # run ESLint
```

## Environment Variables

- `VITE_API_BASE_URL` – Base URL for REST API (default `http://localhost:8000/api`).
- `VITE_WS_BASE_URL` – Base URL for WebSocket server (default derived from API URL).

Set these in a `.env` file at the project root or export in your shell.

## Project Highlights

- React Router for navigation across home, lobby, game board, and leaderboard.
- React Query for data fetching and caching, with auto-refetch.
- Zustand store with localStorage persistence for session continuity.
- WebSocket client that subscribes to room and game updates.
- Modern UI styling provided in `src/index.css`.

## Folder Structure

- `src/api` – Axios clients for backend endpoints.
- `src/routes` – Page-level components.
- `src/store` – Zustand state management.
- `src/services` – WebSocket helpers.
- `src/types` – Shared API contracts.
