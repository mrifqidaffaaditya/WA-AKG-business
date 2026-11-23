# WA-AKG Business
  <img src="https://cdn.keidev.my.id/main-web/portfolio/1781699694661-image.png" />

> **Open-source multi-user WhatsApp Customer Service platform** with AI chatbot, queue system, real-time notifications, and stock integration.
>
> 

[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

<p align="center">
  <img src="https://img.shields.io/badge/backend-Express-339933?logo=express" />
  <img src="https://img.shields.io/badge/frontend-Next.js_14-black?logo=next.js" />
  <img src="https://img.shields.io/badge/wa_gateway-Baileys-25D366?logo=whatsapp" />
  <img src="https://img.shields.io/badge/database-SQLite_(Drizzle)-003B57?logo=sqlite" />
  <img src="https://img.shields.io/badge/ORM-Drizzle-c5f74f?logo=drizzle" />
  <img src="https://img.shields.io/badge/realtime-Socket.io-010101?logo=socket.io" />
  <img src="https://img.shields.io/badge/proxy-Nginx-009639?logo=nginx" />
  <img src="https://img.shields.io/badge/style-Tailwind_CSS-06B6D4?logo=tailwindcss" />
</p>

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Architecture](#architecture)
- [Tech Stack](#tech-stack)
- [Quick Start](#quick-start)
- [Environment Variables](#environment-variables)
- [Default Credentials](#default-credentials)
- [Documentation](#documentation)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

WA-AKG Business is a complete **WhatsApp Customer Service Management Platform** that allows businesses to:

1. **Automate** first-response with an AI chatbot (OpenAI-compatible)
2. **Queue** customer conversations and let CS agents claim them
3. **Notify** agents in real-time via WebSocket and browser push notifications
4. **Integrate** stock data from Google Sheets or relational databases
5. **Manage** everything from an admin dashboard — bot persona, users, stock config, and audit logs

The system uses **Baileys** as WhatsApp gateway (no WhatsApp Business API required — just a phone number) and supports **multi-user RBAC** (Super Admin, Admin, CS Agent).

---

## Features

### AI Chatbot
- OpenAI-compatible API (GPT-4o, GPT-4, any provider)
- Configurable persona, system prompt, business info, escalation keywords
- Auto-detects escalation triggers and routes to human CS
- Customer can type `#chatcs` to request human agent

### Queue & Conversation Management
- Waiting queue with real-time broadcast to all CS agents
- First-claim system — conversation is bound to the claiming CS
- Transfer conversations between CS agents
- Resolve conversations with AI-generated session summary
- View full chat history including bot session
- Customer rating system (1-5 stars)

### Real-time Notifications
- WebSocket (Socket.io) for in-app live updates
- Web Push API + Service Worker for browser notifications
- Native browser notification fallback
- Web Audio API sound notification on new messages
- Floating claim popup for new waiting chats
- Per-user notification preferences (toggle on/off per type)
- **WhatsApp Group Notifications** — configurable log notifications to WhatsApp group (new customer, CS request, claim, resolve)

### Stock Integration
- Google Sheets via Service Account (no OAuth refresh needed)
- MySQL / PostgreSQL as alternative stock source
- Flexible column mapping from admin dashboard
- Cached with configurable TTL
- Bot answers stock questions with real-time data

### Returning Customer Detection
- Identifies customers by WhatsApp number across sessions
- Injects previous session summary into bot context
- "Returning Customer" badge in CS dashboard
- AI-generated session summaries on conversation resolve

### Infinity Scroll
- Cursor-based pagination for chat messages (30 per batch)
- Cursor-based pagination for conversation list (20 per batch)
- Scroll position preserved when loading older messages
- Auto-scroll to latest message on room entry

### Webhooks & Real-time Event Streaming
- Outgoing webhooks with HMAC-SHA256 signature verification (`X-WA-AKG-Signature`)
- Automatic retry mechanism (up to 3 attempts with exponential backoff)
- SSRF protection against private IP & cloud metadata addresses
- Real-time delivery monitoring via WebSocket & Admin UI
- Supported events: `message.received`, `message.sent`, `conversation.created`, `conversation.status_changed`, `conversation.claimed`, `conversation.resolved`, `stock.updated`, `ping`

### Developer REST API (v1) & Interactive Docs
- Public Developer API at `/api/v1` with granular API Key scoping (`messages:send`, `broadcast`, `conversations:read`, etc.)
- Single and bulk staggered WhatsApp message delivery
- Interactive OpenAPI 3.0 documentation served at `/api/docs`
- JSON specification at `/api/docs/openapi.json`
- In-dashboard API Key management with zero-knowledge SHA-256 key storage

### Dashboard
- **CS Panel:** Waiting Queue, My Chats, All Chats tabs, inline chat window, drag-and-drop file upload, queue badge, claim popup, sound notifications
- **Admin Panel:** Bot config, Stock config, User CRUD, Gateway status + QR, Webhooks manager, API Keys manager, Embedded Docs, CS Settings (signature, quick replies, auto-reply, WA group notifications), CS Performance table (per-user stats + ratings), Audit log
- **Dark theme** (OLED-friendly) — no light-mode elements
- **Premium modals** — all native alert/confirm replaced with custom dark-themed modals

### Security
- **0 npm audit vulnerabilities** across frontend and backend dependencies
- JWT access token (15 min) httpOnly cookie + refresh token (7 days)
- API Keys stored as SHA-256 hashes with constant-time verification (`crypto.timingSafeEqual`)
- Webhook signature verification with HMAC-SHA256
- SSRF protection on outgoing webhooks and database connectors
- Bcrypt password hashing (12 rounds) with dummy comparison against user enumeration
- Role-Based Access Control (super_admin, admin, cs)
- Next.js server-side middleware (auth guard + role check before render)
- Backend middleware (conversation access validation: 404 vs 403)
- Frontend client-side guards (URL cleanup, null safety)
- Rate limiting on API keys, login, profile, and refresh endpoints
- Session invalidation on logout
- Strict CORS policy & security response headers (CSP, HSTS, X-Content-Type-Options)
- Audit log for all admin + CS actions (claim, resolve, config changes, API key creation, webhooks)

---

## Architecture & Deployment Options

WA-AKG Business supports both **PM2 Native** and **Docker Compose** architectures:

```
Browser / Cloudflare Tunnel
             │
             ▼
aaPanel / Nginx Reverse Proxy (Port 80/443 or 4040)
             │
             ├── /api/*       ──→ Backend: 4005 (Express REST API v1 & Docs)
             ├── /socket.io/* ──→ Backend: 4005 (Realtime WebSocket)
             ├── /uploads/*   ──→ Backend: 4005 (Media files)
             └── /*           ──→ Frontend: 4041 (Next.js 15 Standalone UI)
```

### Production Options:
1. **PM2 Native Deployment (Ultra-Lightweight, ~150MB RAM)**:
   - Runs backend on `4005` and frontend on `4041` with host Redis (`127.0.0.1:6379`).
   - Reverse-proxied via aaPanel Nginx (snippet available at `nginx/aapanel.conf`).
2. **Docker Compose**:
   - `backend` and `frontend` in containers (`network_mode: host` by default).
   - `redis` and `nginx` included as optional commented-out services for standalone environments.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Node.js 22 + Express 4/5 + Socket.io 4 |
| **Frontend** | Next.js 15 (App Router, Standalone), React 19, Tailwind CSS |
| **WA Gateway** | [Baileys](https://github.com/WhiskeySockets/Baileys) |
| **Auth** | JWT (access + refresh tokens) + bcrypt |
| **Database** | SQLite via [Drizzle ORM](https://orm.drizzle.team/) |
| **Realtime** | [Socket.io](https://socket.io/) |
| **Push Notif** | [web-push](https://github.com/web-push-libs/web-push) (VAPID) |
| **AI** | OpenAI-compatible API (any provider) |
| **Process Manager**| PM2 (`ecosystem.config.cjs`) |
| **Proxy** | aaPanel Nginx / Standalone Nginx (`nginx/aapanel.conf`) |

---

## Quick Start

### Option A: PM2 Native (Instant & Lightweight)

```bash
git clone https://github.com/mrifqidaffaaditya/WA-AKG-business.git
cd WA-AKG-business

# Configure .env
cp .env.example .env

# Run migrations and seed runner
cd backend && npm install && npm run build && npm run db:push && npm run seed && cd ..
cd frontend && npm install && npm run build && cd ..

# Launch via PM2
pm2 start ecosystem.config.cjs && pm2 save
```

### Option B: Docker Compose

```bash
git clone https://github.com/mrifqidaffaaditya/WA-AKG-business.git
cd WA-AKG-business
cp .env.example .env
docker compose up -d
```

### Manual (Development)

```bash
git clone https://github.com/mrifqidaffaaditya/WA-AKG-business.git
cd WA-AKG-business

cp .env.example .env

# Backend
cd backend && npm install && cp ../.env .env && npx tsx src/db/migrate.ts && npx tsx src/seed-runner.ts && npm run dev

# Frontend (separate terminal)
cd frontend && npm install && npm run dev
```

### Connect WhatsApp

1. Login as admin → **Admin Panel → Gateway**
2. Scan QR code with WhatsApp mobile
3. Status: **connected** — ready!

---

## Environment Variables

<details>
<summary>Click to expand full <code>.env</code> reference</summary>

```bash
# App
PORT=4040
APP_PORT=4000
APP_SECRET=your-secret-change-me
NODE_ENV=production
FRONTEND_URL=http://localhost:4040

# AI (OpenAI-compatible)
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
AI_MAX_TOKENS=1024

# Database
DB_PATH=file:./data/wa_akg.db

# Redis
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_EXT_PORT=6380

# VAPID (npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
VAPID_SUBJECT=mailto:admin@yourdomain.com

# Frontend
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_VAPID_KEY=

# Settings
MESSAGES_PAGE_SIZE=30
CONVERSATIONS_PAGE_SIZE=20
MESSAGES_SOFT_CAP=5000
NOTIF_QUEUE_THRESHOLD=5
NOTIF_DEBOUNCE_SECONDS=30
CONTEXT_EXPIRY_DAYS=90
```

</details>

---

## Default Credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | `superadmin@wa-akg.local` | `admin123` |
| Admin | `admin@wa-akg.local` | `admin123` |
| CS Agent | `cs@wa-akg.local` | `cs123` |

> **Change passwords immediately** after first login in production!

---

## Documentation

Full documentation is available in the [`/docs`](./docs) directory:

| Document | Description |
|---|---|
| [Architecture](./docs/ARCHITECTURE.md) | System design & data flow |
| [Configuration](./docs/CONFIGURATION.md) | All config options explained |
| [WhatsApp Setup](./docs/WHATSAPP.md) | WhatsApp Gateway setup & troubleshooting |
| [API Reference](./docs/API.md) | Complete REST API endpoints |

---

## Contributing

We welcome contributions! See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for guidelines.

### Development

```bash
# Backend dev (hot reload)
cd backend && npm run dev

# Frontend dev (hot reload)
cd frontend && npm run dev

# Type checking
cd backend && npx tsc --noEmit
cd frontend && npm run typecheck
```

---

## License

MIT © [WA-AKG Business Contributors](https://github.com/mrifqidaffaaditya/WA-AKG-business)

---

<p align="center">
  Created by the WA-AKG Business community
</p>

