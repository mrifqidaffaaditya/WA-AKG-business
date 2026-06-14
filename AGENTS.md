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
- **Typecheck**: `cd backend && npx tsc --noEmit`
- **Migration auto** — `docker-entrypoint.sh` runs `tsx src/db/migrate.ts` then `seed-runner.ts`
- **Seeds**: superadmin@wa-akg.local/admin123, admin@wa-akg.local/admin123, cs@wa-akg.local/cs123
- **Auth keys**: `accessToken` (15min) + `refreshToken` (7d). Access token also set as httpOnly cookie for Next.js middleware.
- **API format**: `POST /api/auth/login` returns `{ accessToken, user: { id, name, email, role } }`
- **GET /api/auth/me** returns `{ user: { id, name, email, role } }` — MUST wrap in `user`
- **Socket.io** auth via `socket.auth.token` (JWT access token)
- **Trust proxy** enabled for X-Forwarded-For (nginx reverse proxy)
- Get logs inside container: `docker compose logs backend`
- Backend Dockerfile builder: node:22-slim, needs `git + openssh-client + ca-certificates` for Baileys
- **DB Migration**: New columns use `addColumnIfNotExists()` utility (ALTER TABLE with PRAGMA check)
- **CS Config fields**: `wa_group_notif_enabled` (bool), `wa_group_jid` (text)
- **New services**: `waGroupNotif.ts` — WhatsApp group notification sender
- **Audit**: Now covers `claim_conversation`, `resolve_conversation` in addition to admin actions
- **Middleware**: `requireConversationAccess` validates conversation existence + CS access rights
- **CS Stats**: `GET /api/admin/cs-stats` — per-user claimed/resolved/active/rating stats

## Frontend
- **Build**: `cd frontend && npm run build`
- **Typecheck**: `cd frontend && npx tsc --noEmit`
- **UI theme**: OLED dark ONLY (slate-950 bg, slate-900 cards, slate-800 borders)
- **No native `alert()`/`confirm()`** → use `<Modal>` from `@/components/Modal`
- **API calls**: `apiFetch('/api/admin/bot-config')` — prefix `/api` already in URL
- **Auth tokens**: stored in localStorage as `access_token` + `refresh_token`
- **`apiFetch`**: returns raw `Response` object → caller handles `.json()`/`.ok`
- **`src/lib/utils.ts`**: `timeAgo()`, `formatPhone()` (null-safe), `playBeep()`
- **Next.js rewrites**: `/api/*` → `backend:4000/api/*`, `/socket.io/*` → `backend:4000/socket.io/*`
- **Next.js middleware** (`src/middleware.ts`): Server-side auth guard — decodes JWT from `access_token` cookie, redirects unauthenticated → `/login?return_to=...`, CS → no access to `/admin`
- **Login page**: Supports `?return_to=` callback for redirect after auth
- **CS Config Panel**: Has success/error modal feedback. WA group notification toggle + JID input.
- **CSPerformanceTable**: In admin dashboard showing per-CS stats
- **`formatPhone`**: Now null-safe — returns `"-"` for null/undefined input

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
- **DB migrations must add new columns at end of migrate script with `addColumnIfNotExists`**
- **Middleware must check `isLogin` before redirecting to avoid redirect loops**
