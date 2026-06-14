# Architecture Overview

System design, data flow, and component interaction for WA-AKG Business.

## High-Level Architecture

```
┌─────────────────────────────────────────────┐
│              Web App (Frontend)              │
│         Next.js 14 + Tailwind CSS            │
└────────────────────┬────────────────────────┘
                     │ REST API + WebSocket
┌────────────────────▼────────────────────────┐
│              Backend (Node.js)               │
│         Express + Socket.io                  │
│                                              │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Auth     │  │ Chat     │  │ Bot      │  │
│  │ Service  │  │ Manager  │  │ Service  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Stock    │  │ WA       │  │ Admin    │  │
│  │ Service  │  │ Gateway  │  │ Service  │  │
│  └──────────┘  └──────────┘  └──────────┘  │
└─────┬───────────────────────────────────────┘
      │
      ├── SQLite (App DB via Drizzle ORM)
      ├── Google Sheets API (Service Account)
      ├── MySQL/PostgreSQL (External Stock DB)
      └── OpenAI-compatible API (AI Provider)
```

## Message Flow

### Normal Bot Conversation

```
Customer → WhatsApp → Baileys Gateway → orchestrator.ts
                                            │
                                   ┌────────▼────────┐
                                   │ Find/Create       │
                                   │ Customer + Conv   │
                                   └────────┬────────┘
                                            │
                                   ┌────────▼────────┐
                                   │ Save customer     │
                                   │ message to DB     │
                                   └────────┬────────┘
                                            │
                                   ┌────────▼────────┐
                                   │ Get AI response   │
                                   │ (chatbot service) │
                                   └────────┬────────┘
                                            │
                                   ┌────────▼────────┐
                                   │ Save bot response │
                                   │ Send via WA       │
                                   │ Broadcast to CS   │
                                   └──────────────────┘
```

### Escalation Flow (#chatcs or auto-detection)

```
Customer → #chatcs → orchestrator.ts
                        │
               ┌────────▼────────┐
               │ Set conversation  │
               │ status = waiting  │
               └────────┬────────┘
                        │
               ┌────────▼────────┐
               │ Broadcast to all  │
               │ CS via Socket.io  │
               └────────┬────────┘
                        │
               ┌────────▼────────┐
               │ Push notification │
               │ to all CS devices │
               └────────┬────────┘
                        │
               ┌────────▼────────┐
               │ CS claims chat    │
               │ (first-claim)     │
               └────────┬────────┘
                        │
               ┌────────▼────────┐
               │ status = active   │
               │ Direct WA send    │
               └──────────────────┘
```

## Database Schema

### Core Tables

**users** — CS agents and admins
```
id (PK), name, email (UNIQUE), password_hash (bcrypt),
role (super_admin|admin|cs), is_active, created_at
```

**conversations** — chat sessions
```
id (PK), customer_id (FK→customers), wa_number, customer_name,
status (bot|waiting|active|resolved), claimed_by (FK→users),
created_at, updated_at
```

**messages** — individual messages
```
id (PK), conversation_id (FK→conversations),
sender (customer|bot|cs), cs_id (FK→users, nullable),
content, wa_message_id, created_at
```

**customers** — end-user profiles
```
id (PK), wa_number (UNIQUE), display_name,
total_sessions, last_conversation_id (FK→conversations),
last_summary, last_active_at, created_at
```

### Configuration Tables

**bot_config** — single-row AI bot settings
**cs_config** — single-row CS settings (signature, auto-reply, WA group notifications)
**stock_config** — stock data source configuration
**push_subscriptions** — browser push subscription per user/device
**notification_preferences** — per-user per-type notification toggles

### System Tables

**refresh_tokens** — JWT refresh tokens for session management
**audit_log** — admin action tracking

## Cursor-Based Pagination

All list endpoints use **cursor-based pagination** (keyset), never offset-based:

```sql
-- Messages: order by (created_at DESC, id DESC)
SELECT * FROM messages
WHERE conversation_id = ?
  AND created_at < :cursor_created_at
  AND id < :cursor_id
ORDER BY created_at DESC, id DESC
LIMIT 31

-- Conversations: order by updated_at DESC
SELECT * FROM conversations
WHERE status = ?
  AND updated_at < :cursor_updated_at
ORDER BY updated_at DESC
LIMIT 21
```

The extra row (+1) determines `has_more`. This approach avoids OFFSET performance degradation.

## WebSocket Events

| Event | Direction | Payload |
|---|---|---|
| `conversation:new` | Server → CS | New conversation in queue |
| `conversation:claimed` | Server → CS | Conversation claimed by another CS |
| `conversation:message` | Server → CS | New message in conversation |
| `conversation:status` | Server → CS | Status change (active, resolved) |
| `queue:update` | Server → CS | Updated queue count |
| `gateway:status` | Server → Admin | WA connection status change |

## Security Model

1. **Authentication:** JWT access token (15 min) sent in `Authorization: Bearer` header AND stored as httpOnly cookie for middleware
2. **Refresh:** Long-lived refresh token (7 days) stored in DB, re-issued on use
3. **Password hashing:** bcrypt with 12 salt rounds
4. **RBAC:** Next.js middleware (server-side) + Express middleware (backend) check roles before processing
5. **Rate limiting:** Login endpoint limited to 5 requests per 15 minutes
6. **CORS:** Only allows the configured frontend origin
7. **Audit log:** All admin + CS mutations recorded with user ID, action, entity, and timestamp
8. **Defense in Depth:** 3-layer protection — Next.js middleware (before render) → Backend middleware (before handler) → Frontend client guards

## WhatsApp Group Notifications

Configurable real-time log notifications sent to a WhatsApp group:

```
[14/06/2026 10:30] 🆕 Pelanggan Baru
👤 Nama: Budi Santoso
📱 No: +6281234567890

[14/06/2026 10:35] ⏳ Request CS
👤 Nama: Budi Santoso
📱 No: +6281234567890
🔗 https://example.com/cs?tab=all&chatId=xxx

[14/06/2026 10:40] ✅ Chat Diklaim
👤 Pelanggan: Budi Santoso
🧑‍💼 CS: Adi Pratama
🔗 https://example.com/cs?tab=all&chatId=xxx

[14/06/2026 11:00] ✅ Chat Diselesaikan
👤 Pelanggan: Budi Santoso
🧑‍💼 CS: Adi Pratama
⭐ 5/5
🔗 https://example.com/cs?tab=all&chatId=xxx
```

Configuration via Admin Panel > Settings CS > WhatsApp Group Notifications. Get group JID by sending `!jid` command in the group chat.
