# Changelog

## [3.2.0] — 2026-06-14

### Added
- **Online/Offline User Tracking** — Added real-time user online tracking via socket connections and displayed on the user table in the admin panel with a pulsing green dot indicator.
- **Database-backed CS Signatures** — Moved automatic CS signature configuration into SQLite (`csConfig` table) instead of a local configuration file, allowing editing and configuration persistence in the database.

### Changed
- **CS Tab Panel Order** — Swapped order of chat tabs in both desktop sidebar and mobile top navigation views to: `My Chat` -> `Antrean` (Queue) -> `Semua` (All).
- **Phone Number Formatting** — Simplified `formatPhone` to remove all spaces, hyphens, and return a clean unified digit format prefixed with a `+` (e.g. `+6287748687946`).
- **Duplicate & Blank Message Prevention** — Improved orchestrator to ignore empty status/read/delivery reports from Baileys, filter out self-sent (`fromMe: true`) messages, and drop duplicates by checking `waMessageId` against SQLite.
- **LID Conversation Mapping** — Updated orchestrator to automatically map unknown numbers/LID senders (`key.senderPn || remoteJid`) to extract the real JID/phone number.

## [3.1.0] — 2026-06-14


### 🎨 UI Redesign — Sidebar Navigation & Chat Stability

### Added
- **Expandable sidebar** — collapsible sidebar (w-16 ↔ w-56) with smooth transition, replacing icon-only left rail
- **Cross-panel navigation** — "Panel CS" button in admin sidebar, "Panel Admin" button in CS sidebar, one-click role switching
- **Sidebar tab labels + active indicators** — emerald dot indicator on active tab, full text labels when expanded
- **"All" tab in CS sidebar** — view all conversations regardless of status
- **Queue badge** — Waiting count badge in CS sidebar nav (real-time via Socket.io `queue:update`)

### Changed
- **Sidebar is primary navigation** — removed duplicate top tab bars from admin and CS pages; sidebar handles all routing
- **Admin Dashboard cards** — gradient backgrounds, colored borders, hover arrow effect, 28px stat values, uppercase labels
- **Dashboard distribution chart** — percentage labels per bar, color-coded dots
- **Login page** — radial emerald gradient backdrop, glow icon, spinner on submit button, footer copyright
- **Gateway panel** — gradient card backgrounds, shadow pulse dot for connected state, border-accent status cards
- **User table** — uppercase header labels, dot indicators for active/inactive, bordered role badges
- **Audit log** — action pills in slate badges, improved row hover states
- **ConversationList** — emerald left-border on selected item, bordered status badges, spinner loader
- **ChatWindow** — separated scroll restore logic via `useEffect`, `loadingMoreRef` prevents double-load race condition, fixed scroll jank when loading long messages
- **Scrollbar** — 5px transparent track, thinner thumb for cleaner look
- **All pages** — marked `dynamic = "force-dynamic"` in layouts to prevent `useSearchParams` SSR bailout during build

### Fixed
- Sidebar navigation not responding — removed conflicting top tab bars
- Chat message scroll breaking on long messages — replaced `scrollIntoView` with direct `scrollTop`, fixed scroll anchor restoration on history load
- Build failure on `/admin` and `/cs` due to `useSearchParams` in prerender — added `force-dynamic` to layouts

### Removed
- Duplicate top tab bars from admin and CS pages (redundant with sidebar)
- `handleTabChange` / `updateTab` from CS page (sidebar handles it)
- Unused `Modal` import and orphan dead modal from CS page

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

