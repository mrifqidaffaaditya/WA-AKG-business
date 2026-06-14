# Changelog

## [3.0.0] — 2026-06-14

### 🎉 v3 Rewrite — Split Architecture with Nginx

Complete rewrite from a single-container Next.js 15 monolith into a clean split architecture with Nginx reverse proxy. Only one port (4040) is exposed to the outside world.

### Added
- **Nginx reverse proxy** — all traffic through port 4040, routes `/api/*` → backend:4000, `/*` → frontend:4041
- **Separate Express backend** — Node.js + Express + Socket.io on port 4000 (internal only)
- **Separate Next.js frontend** — Next.js 14 + Tailwind CSS on port 4041 (internal only)
- **Clean separation** — `backend/` and `frontend/` are independent packages with their own `package.json`, `tsconfig.json`, `Dockerfile`
- **Direct SQL migration** — `migrate.ts` using `@libsql/client` to avoid interactive drizzle-kit prompt
- **CustomModal component** — all native `alert()`/`confirm()` replaced with premium dark-themed modal
- **Drag-and-drop file upload** — glassmorphic overlay, file size validation
- **Auto-scroll** — instant scroll to bottom on chat room entry, smooth scroll for new messages
- **URL persistence** — `?tab=mine&chatId=...` preserves state across page refreshes
- **Auto-navigate** — claiming a chat switches to "My Chats" tab and opens the claimed room
- **Session auto-close** — idle sessions auto-resolve after configurable timeout
- **Rating system** — customer can rate CS service 1-5 after session resolves
- **Browser sound notification** — Web Audio API beep on new messages
- **New chat popup** — floating card at bottom-right when new customer enters queue

### Changed
- **Architecture** — 4 Docker containers (nginx + frontend + backend + redis) instead of 1
- **WA Gateway** — Baileys for WhatsApp connectivity
- **Auth** — JWT access token (15 min) + refresh token (7 days) directly, no NextAuth dependency
- **Port** — Only 4040 exposed; backend:4000 and frontend:4041 are internal Docker network only
- **Database** — SQLite via `@libsql/client` + drizzle-orm, snake_case columns
- **API** — Express REST API with separate route handlers
- **Docker** — Each service has its own Dockerfile, unified via `docker-compose.yml`
- **UI** — Full dark theme (slate-950/900/800), no light-mode elements, clean + professional
- **Real-time** — Socket.io with JWT auth token, user rooms + role rooms

### Removed
- NextAuth.js — replaced with direct JWT implementation
- Monolith Dockerfile — split into backend + frontend + nginx
- Native `alert()`/`confirm()` — all replaced with `CustomModal`

## [2.0.0] — 2026-06-14
See git history for v2 changelog details.

## [1.2.0] — 2026-06-14
### Added
- Returning Customer Detection
- AI Session Summaries
- Infinity Scroll — Chat Messages (cursor-based pagination)
- Infinity Scroll — Conversation List (cursor-based pagination)
- Messages soft cap (5,000)

## [1.1.0] — 2026-06-14
### Added
- Browser Push Notifications via Web Push API + Service Worker
- VAPID key support
- Per-user notification preferences
- Do Not Disturb scheduling
- Notification debounce (30s)

## [1.0.0] — 2026-06-14
### Added
- JWT Auth + RBAC (super_admin, admin, cs)
- WhatsApp Gateway (Baileys)
- AI Chatbot (OpenAI-compatible)
- Conversation Management (queue, claim, transfer, resolve)
- Real-time Events (Socket.io)
- CS Dashboard
- Admin Dashboard
- Stock Integration
- Docker Compose deployment

