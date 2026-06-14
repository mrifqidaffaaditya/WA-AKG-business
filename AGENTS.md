# AGENTS.md — OpenCode Agent Instructions

## Project Architecture
- **`backend/`** — Express.js + Socket.io + Baileys (WhatsApp) + SQLite/Drizzle ORM, port 4000
- **`frontend/`** — Next.js latest (App Router) + Tailwind CSS, port 4041
- **`nginx.conf`** — Reverse proxy, only port 4040 exposed to host
- **`docker-compose.yml`** — 4 services: nginx, frontend, backend, redis

## Build & Deploy
```bash
docker compose down
docker compose up --build        # Full rebuild + run
# If build cache corrupt:
docker system prune -af          # Clean ALL docker cache + volumes
docker compose up --build        # Retry
```

## Backend
- **Build**: `cd backend && npm run build` (tsc → dist/)
- **Migration auto** — `docker-entrypoint.sh` runs `tsx src/db/migrate.ts` then `seed-runner.ts`
- **Seeds**: superadmin@wa-akg.local/admin123, admin@wa-akg.local/admin123, cs@wa-akg.local/cs123
- **Auth keys**: `accessToken` (15min) + `refreshToken` (7d)
- **API format**: `POST /api/auth/login` returns `{ accessToken, user: { id, name, email, role } }`
- **GET /api/auth/me** returns `{ user: { id, name, email, role } }` — MUST wrap in `user`
- **Socket.io** auth via `socket.auth.token` (JWT access token)
- **Trust proxy** enabled for X-Forwarded-For (nginx reverse proxy)
- Get logs inside container: `docker compose logs backend`
- Backend Dockerfile builder: node:22-slim, needs `git + openssh-client + ca-certificates` for Baileys

## Frontend
- **Build**: `cd frontend && npm run build`
- **UI theme**: OLED dark ONLY (slate-950 bg, slate-900 cards, slate-800 borders)
- **No native `alert()`/`confirm()`** → use `<CustomModal>` from `@/components/Modal`
- **API calls**: `apiFetch('/api/admin/bot-config')` — prefix `/api` already in URL
- **Auth tokens**: stored in localStorage as `access_token` + `refresh_token`
- **`apiFetch`**: returns raw `Response` object → caller handles `.json()`/`.ok`
- **`src/lib/utils.ts`**: `timeAgo()`, `formatPhone()`, `playBeep()`
- **Next.js rewrites**: `/api/*` → `backend:4000/api/*`, `/socket.io/*` → `backend:4000/socket.io/*`

## TypeScript
- Frontend typecheck: `cd frontend && npx tsc --noEmit`
- Backend build: `cd backend && npm run build` (compiles to `dist/`)
- Root `tsconfig.json` excludes `frontend/` and `backend/` folders
- If TS errors block build, use `// @ts-nocheck` as last resort

## Critical Gotchas
- `@whiskeysockets/baileys` needs `git` + `ca-certificates` in Docker build stage
- `npm install` may fail with ETXTBSY on esbuild — run `docker system prune -af` and retry
- Backend `/api/auth/me` MUST return `{ user: { ... } }` not bare `{ id, name }`
- Refresh token body field: `{ refreshToken }` (camelCase)
- Frontend manifest.json should NOT reference non-existent icon files
- Push notification: gracefully handle missing VAPID keys → fallback to Notification API
- WebSocket auth uses `socket.auth.token`, not query params
- Admin page: apiFetch uses `/api/admin/...` path, response MUST be array for `e.map`
