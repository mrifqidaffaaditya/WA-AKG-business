# Changelog

## [3.4.0] — 2026-06-15

### Added
- **Real-Time Business Hours for Chatbot AI** — The AI chatbot now receives the current day, time, and store open/closed status as hidden context. Parses `business_info` text (e.g., "Senin-Jumat 09:00-17:00 WIB") to determine real-time open/closed status. Injected into `[INFORMASI BISNIS]` system prompt block. Format: `Waktu sekarang: Selasa, 17:23 WIB. Status toko: BUKA (tutup jam 17:00).`
- **`TIMEZONE` Environment Variable** — New `TIMEZONE` env var (default: `Asia/Jakarta`) to configure the timezone used for business hours detection via IANA timezone IDs.
- **Conversation List Search** — Search/filter input in the CS conversation sidebar. Filters by customer name, WhatsApp number, or last message content in real-time.
- **Virtuoso Virtualized List** — Replaced plain `.map()` rendering with `react-virtuoso` for O(1) DOM rendering regardless of list size. Smooth scrolling with hundreds/thousands of conversations.
- **Rate Limiting Toggle** — `RATE_LIMIT_ENABLED` env var (default: `true`). Set to `false` to disable all rate limits globally. All rate limiters have conditional passthrough wrappers.

### Changed
- **CS Conversation Access** — Removed 403 restriction. Any CS agent can now view any conversation even if claimed by another CS. Removed "Akses Terbatas" modal from frontend. Browser notifications and sound alerts now play for all active chat messages regardless of which CS claimed the conversation.
- **Rate Limiting Key** — Rate limits now keyed by auth token (not IP) to work behind Cloudflare/nginx. All limits raised: API 300/min, refresh 20/15min, login 10/15min.
- **Default CS Tab** — Default tab changed from "Semua" to "My Chat" (`mine`) for both new CS sessions and middleware redirects.
- **Static Tabs + Search** — Tab bar and search input are now fixed `shrink-0` elements in the conversation sidebar, not part of the scrollable virtualized list.
- **Chat List Stability** — New incoming messages no longer reorder the conversation list (in-place update instead of splice+unshift).
- **Conversation Click** — Clicking a chat now uses `window.history.replaceState` instead of `router.replace`, eliminating Next.js SSR roundtrip / page refresh.
- **Mobile Chat Header** — Compact layout: smaller avatar, icon-only Claim/Resolve buttons (labels visible on `sm:`+), flex-wrap avatar+status+info to prevent overlap on narrow screens.
- **WA Group Notification URLs** — Fixed from `?tab=all&chatId=X` to `/cs/X?tab=all` path segments. Timestamps now honor `TIMEZONE` env var.
- **Login Page** — Removed middleware redirect from `/login` → `/dashboard` (was causing infinite loops with expired cookies). Fixed `fetchUser` never setting `loading = false` on success.

### Fixed
- **SQLite WAL Migration Error** — `PRAGMA journal_mode = WAL` now runs before `BEGIN TRANSACTION` to avoid SQLite error.
- **IPv6 Rate Limit Crash** — Custom `keyGenerator` no longer accesses `req.ip` directly, fixing express-rate-limit v7+ validation error.

## [3.3.0] — 2026-06-14

### Added
- **WhatsApp Group Notifications** — Configurable real-time log notifications sent to a WhatsApp group: new customer, CS request/escalation, chat claimed, chat resolved. Includes timestamp, customer name, phone number, CS name, rating, and clickable URL.
- **`!jid` Command** — Send `!jid` in any WhatsApp chat/group to instantly get the JID of that chat, for easy group notification configuration.
- **CS Performance Dashboard** — New table in Admin Dashboard showing per-CS stats: total claimed, resolved, active count, and average rating with real-time online status indicators.
- **CS Config Success/Error Modal** — The CS Settings panel now shows proper success/error modal feedback after saving (was previously silent).
- **Audit Log for CS Actions** — Claim and resolve conversations are now recorded in the audit log with customer and CS details.
- **Conversation Access Middleware** — Backend middleware validates conversation access before processing requests, separating 404 (not found) from 403 (forbidden) responses.
- **Next.js Middleware (Auth Guard)** — Server-side middleware validates JWT from `access_token` cookie before page render: redirects unauthenticated users to `/login?return_to=...`, blocks CS from accessing `/admin`, validates `chatId` UUID format.
- **`return_to` Callback on Login** — After authentication redirect to `/login`, users are automatically redirected back to their original destination.
- **`access_token` HTTP-Only Cookie** — Backend now sets `access_token` as an httpOnly cookie (in addition to localStorage) for server-side middleware auth validation.
- **CS Stats API** — `GET /api/admin/cs-stats` — Returns per-user conversation statistics for the performance dashboard.

### Changed
- **Audit Log Query** — Changed from `ORDER BY created_at ASC` to `DESC` (newest first), added user name via `LEFT JOIN`.
- **Conversation Access Control** — CS agents can now view conversations in `waiting`/`bot` status (queue), 403 only for conversations claimed by another CS.

### Fixed
- **`formatPhone` crash** — Fixed `Cannot read properties of undefined (reading 'replace')` when `wa_number` is null/undefined.
- **404 chatId cleanup** — Invalid `chatId` in URL now auto-redirects to clean URL instead of silently failing.
- **Looping login redirect** — Middleware no longer redirects `/login` to `/login` when token is missing.
- **DB Migration** — Added auto-migration for new `cs_config` columns (`wa_group_notif_enabled`, `wa_group_jid`) via `addColumnIfNotExists` utility.

## [3.2.0] — 2026-06-14

### Added
- **Online/Offline User Tracking** — Added real-time user online tracking via socket connections and displayed on the user table in the admin panel with a pulsing green dot indicator.
- **Database-backed CS Signatures** — Moved automatic CS signature configuration into SQLite (`csConfig` table) instead of a local configuration file, allowing editing and configuration persistence in the database.

### Changed
- **CS Tab Panel Order** — Swapped order of chat tabs in both desktop sidebar and mobile top navigation views to: `My Chat` -> `Antrean` (Queue) -> `Semua` (All).
- **Phone Number Formatting** — Simplified `formatPhone` to remove all spaces, hyphens, and return a clean unified digit format prefixed with a `+` (e.g. `+6287748687946`).
- **Duplicate & Blank Message Prevention** — Improved orchestrator to ignore empty status/read/delivery reports from Baileys, filter out self-sent (`fromMe: true`) messages, and drop duplicates by checking `waMessageId` against SQLite.
- **LID Conversation Mapping** — Updated orchestrator to automatically map unknown numbers/LID senders (`key.senderPn || remoteJid`) to extract the real JID/phone number.
- **Emoji-free Markdown Documentation** — Stripped all emojis from all markdown documentation files (including README, PRD, docs) and updated all table-of-contents links for a cleaner, fully professional presentation.

### Fixed
- **LID Decryption Error ("Menunggu Pesan")** — Fixed WhatsApp decryption failure when agent replies to contacts using a LID by dynamically mapping and routing agent messages to their corresponding active LID JID stored in the customer database record.
- **Baileys Retry Decryption Error ("Menunggu Pesan")** — Implemented the required `getMessage` handler and `msgRetryCounterCache` (using custom Map store and database fallbacks) in the Baileys socket options to enable successful decryption retries without external `makeInMemoryStore` export dependency.
- **Chatbot Prompt Confusion & Summary Leakage** — Improved chatbot system prompt boundaries and instructions to prevent the bot from repeating the historical session summary back to returning customers, and added robust fallback handling to respond naturally to very short or ambiguous customer messages (like "p").
- **SQLite3 Binding Error on Media Messages** — Fixed database insert crash for image/video/document messages caused by `fileLength` returning as a custom `Long` object from Baileys instead of a standard JS number, which SQLite3 could not bind.

## [3.1.0] — 2026-06-14


### UI Redesign — Sidebar Navigation & Chat Stability

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

### v3 Rewrite — Split Architecture with Nginx

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

