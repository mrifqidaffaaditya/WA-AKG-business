# Changelog

## [3.5.0] — 2026-06-16

### Added
- **Customer Notes System** — Per-WhatsApp-number notes that persist across conversations. A new "Catatan" button in the chat header opens a panel showing the full note history for that number (newest first, with author, rating, and timestamp). The current conversation's note is highlighted. Notes can be edited at any time (not only at resolve) via an edit modal, so any CS can record or update context that the rest of the team sees. Edits broadcast a `note:updated` socket event so an open notes panel refreshes live for other agents.
  - Backend: `getNotesByWaNumber` and `updateConversationNote` services; `GET /api/conversations/by-number/:wa_number/notes` and `PATCH /api/conversations/:id/note` routes (4000-char limit, audit-logged). Reuses the existing `conversations.review` column — no migration required, and historical resolve notes appear automatically.
- **Reusable UI Primitives** — New `frontend/src/components/ui.tsx` with accessible `Toggle` (`role="switch"` + `aria-checked`), `Button`, `Spinner`, and `StatusBadge` components, replacing copy-pasted markup across the admin panels, chat, and shell.

### Changed
- **Full UI Redesign — Warm Charcoal + Amber** — Replaced the navy/slate + emerald palette with a warm charcoal base and amber accent across every page and component, driven by centralized tokens in `tailwind.config.ts` and `globals.css`. The former cool rainbow (blue/purple/violet/indigo/cyan/teal) was collapsed to a single sanctioned cool accent (`sky`, for the Bot status) plus warm tones; `red` danger states moved to `rose`. App background `#1a1612`, panels `#1f1b14`, accent amber `#f59e0b`.
- **Accessibility** — Modal now has `role="dialog"`, `aria-modal`, a focus trap, focus restore on close, and background scroll-lock. Added a global keyboard `:focus-visible` ring, `aria-label`s on all icon-only buttons, `htmlFor`/`id` on form fields, and `aria-hidden` on decorative icons. Fixed WCAG contrast on amber-fill buttons (dark `slate-950` ink instead of white).
- **Performance / Mobile** — Reduced heavy `backdrop-blur` (16–20px → 12–14px, and 6px on screens ≤640px) to cut scroll jank on mobile GPUs.
- **Chat Composer Interactions** — Send button now shows an in-flight state and is disabled while sending (prevents double-send); on failure the message text, file, and reply are restored instead of lost. The reply textarea auto-grows and resets after send. Added client-side file-size validation (16 MB) before base64 encoding.
- **Cookie-Based Authentication** — The access token is no longer persisted to `localStorage` (held in memory only), and is no longer appended to media URLs as a `?token=` query param. The backend `authenticate` middleware, `/uploads` route, and websocket handshake now read the existing httpOnly `access_token` cookie (Authorization header retained as a backward-compatible fallback). This removes the XSS token-exfiltration path and stops tokens leaking into access logs, browser history, and `Referer` headers.

### Fixed
- **Modal Focus Stealing** — Fixed a bug where typing a single character in a modal field (e.g. the resolve note) bounced focus to the close button. The focus-setup effect no longer depends on the per-render `onClose`/keydown callbacks (it runs only on open), and initial focus now targets the first input/textarea rather than the close (X) button. This also resolves the "Catatan Penyelesaian tidak berfungsi" report.
- **Logout Stuck / Loop** — After the memory-only token change, logout skipped the backend call on a fresh page load (no in-memory token), leaving the httpOnly cookies in place so middleware kept redirecting the user back in. Logout now always calls `/api/auth/logout` with credentials so the server revokes the refresh token and clears cookies.
- **Deactivated User Still Had Access** — A valid (unexpired) JWT kept working for up to 15 minutes after an admin deactivated a user. `authenticate` now verifies the account still exists and is active on every request, and deactivating a user (`is_active = false`) immediately revokes their refresh tokens.
- **Avatar Gradient Purged by Tailwind** — `avatarGradient` built dynamic class names (`from-${hue}-500`) that Tailwind purges at build time, leaving avatars gradient-less. Replaced with complete static class strings; also guarded against empty user names (`userName[0]` crash).
- **Conversation Claim Race Condition** — `claimConversation` now reports `rowsAffected` from its atomic guarded update; the claim route returns `409 Conflict` when a concurrent claim loses, instead of falsely reporting success with the winner's data. The UI shows a clear "Sudah diklaim CS lain" message.

### Security
- **JWT Secret Guard (all environments)** — Empty `APP_SECRET`/`REFRESH_SECRET` now fail startup in every environment (previously only in production), and the two secrets must differ. Prevents tokens being signed with an empty secret if `NODE_ENV` is unset.
- **Login Rate-Limit Hardening** — Login is now keyed by client IP + submitted email and refresh by client IP (via `ipKeyGenerator`), instead of a token that collapsed all unauthenticated attempts into a single shared `"anonymous"` bucket (which allowed a single attacker to lock out all logins and gave no per-attacker brute-force limit).
- **Constant-Time Login** — The login handler always runs exactly one `bcrypt.compare` (against a dummy hash when the email is unknown), removing the timing difference that allowed email enumeration.
- **cs-config Input Validation** — `PUT /api/admin/cs-config` now validates field allowlist, types, lengths, and WhatsApp group JID format before persisting (was spreading `req.body` directly).
- **SSRF Guard in Stock Connector** — The MySQL/PostgreSQL stock connector resolves the admin-supplied host and blocks the cloud metadata service / link-local range (`169.254.0.0/16`, `fe80::/10`) as defense in depth. Private LAN ranges remain allowed for legitimate self-hosted databases.

### Notes
- The repository's `.env` `APP_SECRET`/`REFRESH_SECRET` must be set to random, distinct 32+ byte values. If they still hold the `.env.example` placeholder values, JWTs can be forged — generate new secrets and restart the backend (all sessions will be invalidated).

## [3.4.2] — 2026-06-15

### Added
- **Hold Status Toggle** — Customer Service agents can now toggle conversation status between "Active" and "On Hold" (via responsive Hold/Resume buttons in the header that collapse to icon-only on mobile devices). On Hold conversations are styled with a premium orange badge.
- **Inactivity Warning Message** — Added an inactivity warning feature before automatic session close. Configurable via "Peringatan Timeout (menit sebelum close)" in the admin bot configuration. If there is no activity for the designated period, the bot automatically sends a warning message asking if they wish to remain connected.
- **Reactivation Group Notification** — When a resolved session is reactivated (either by a CS sending a message or other actions), a specific `notifyReactivate` group notification (`[timestamp] 🔄 Sesi Diaktifkan Kembali`) is dispatched to the configured WhatsApp group log.
- **Database Schema Updates** — Rebuilt conversations CHECK constraint to include the `'hold'` status, and added columns `session_timeout_warning_mins` to `bot_config` and `warning_sent` to `conversations`.

### Fixed
- **Password Length Validation** — Adjusted the minimum password length requirement from `6` characters to `5` characters in authentication and admin routes, allowing the default Customer Service seed account (`cs@wa-akg.local` / `cs123`) to pass validation and log in successfully.
- **WhatsApp Gateway Reconnection** — Fixed a critical bug in the WhatsApp Gateway connection update handler where it would fail to reconnect automatically for common disconnect reasons such as connection loss (`connectionLost`), connection closed (`connectionClosed`), or connection replacement (`connectionReplaced`). Updated `isRestart` logic to reconnect for all disconnect reasons except an explicit logout (`loggedOut`).
- **Session Timeout Background Job** — Restructured and fixed the session timeout check background worker to run correctly every 60s, checking and automatically resolving idle active conversations. Hold conversations are exempt from timeout.
- **Chat Bubble Alignment** — Fixed mobile/desktop alignment where customer message bubbles are left-aligned and Customer Service (CS) message bubbles are right-aligned.
- **Admin Save Error Feedback** — Improved error feedback on the admin configuration page. Validates relationship warnings (e.g. warning timeout must be less than session timeout) and displays custom server error messages in the modal instead of a generic failure message.
- **New Conversation Visibility** — Fixed bug where new customer sessions (status `bot`) did not auto-appear in the CS chat list. Backend now broadcasts `conversation:new` immediately after conversation creation (not only on escalation). Frontend handler always inserts into the "all" and "waiting" tabs, while browser notifications and popup banners only trigger on `"waiting"` (escalated) conversations.
- **Login Page Stuck Loading** — Fixed `/login` page hanging indefinitely on refresh or `?return_to=` redirect. Added 8-second AbortController timeouts to all `fetch()` calls in `api.ts` (`makeRequest`, `refreshAccessToken`) so that a slow or unreachable backend no longer keeps `loading=true` forever. Abort/timeout errors now propagate as status 408 to fail fast. Also guarded `router.push("/login")` in `useAuth.tsx` `fetchUser` to skip the redirect when already on the login page, preventing unnecessary soft navigation loops. Added hard 10s fallback timeout in `AuthProvider` and 8s force-render fallback in `LoginForm` as defense-in-depth.
- **Role Hierarchy & Security** — Implemented strict role hierarchy: `super_admin` (level 3) > `admin` (level 2) > `cs` (level 1). Enforced server-side: users can only create/edit/delete users with lower role levels, cannot modify themselves, and cannot assign roles at or above their own level. Token revocation now fires on role changes (not just password changes). Frontend admin panel: role dropdowns filter to only allowed lower roles, Edit/Delete/Toggle buttons are disabled for higher/same-role and self users with contextual tooltips.
- **Login Page Null Role Crash** — Fixed `Cannot read properties of null (reading 'role')` error on login page. Changed `user.role` to `user?.role` in redirect effect at `login/page.tsx:51`.

### Known Issues
- **Admin Users Page — `Cannot read properties of null (reading 'role')`** — Pada halaman `/admin?tab=users`, muncul error: `Uncaught TypeError: Cannot read properties of null (reading 'role')` di chunk `page-7751581f67938be3.js`. Error terjadi di fungsi `W` dalam admin page, kemungkinan dari komponen `UserPanel` setelah penambahan hierarchy role (`canModify`, `allowedRoles`). Seluruh akses `user.role` di source admin sudah menggunakan `?.` — kemungkinan Next.js build cache tidak meng-invalidate chunk hash. Perlu investigasi lebih lanjut.

## [3.4.1] — 2026-06-15

### Added
- **WhatsApp Message Reply/Quote Feature** — Fully supported two-way message quoting (CS ➔ Customer and Customer ➔ CS). Displays a nested quote preview card inside message bubbles with the original sender's name and quoted content.
- **Database Schema & Migrations** — Added `reply_to_content` and `reply_to_sender` columns to the `messages` table. The migrator automatically adds these columns on startup if missing.
- **Incoming Reply Parsing** — WhatsApp webhook listener now parses `contextInfo` of incoming messages, automatically resolving and logging quoted message IDs, contents, and sender names (CS, Bot, or Customer).
- **Reply UI in CS Panel** — Added a hover reply button next to message bubbles and a floating reply preview bar above the message input area (with a close button to clear).

### Fixed
- **Reactivate Resolved Conversations** — Sending a message to a resolved conversation now automatically reactivates it to `active` status and claims it for the sending agent, instead of blocking with a 400 `"Conversation is resolved"` error. Broadcasts state changes to websockets, writes an audit log, and triggers group notifications.
- **Session Timeout Input Field** — Fixed UI bug where deleting the last digit of the timeout input instantly forced it back to `30`. Allows empty strings while typing, validating and defaulting to `30` only on save.
- **PUT `/api/admin/bot-config` 400 Error** — Fixed a type mismatch validation error where `escalation_keywords` was sent as a comma-separated string from the frontend but required as an array by the backend. The backend now accepts both string and array formats.

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

