# API Reference

Complete REST API documentation for WA-AKG Business.

Base URL: `http://localhost:4040/api`

## Authentication

### POST /api/auth/login

Login with email and password.

**Request:**
```json
{
  "email": "cs@wa-akg.local",
  "password": "cs123"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOi...",
  "refreshToken": "uuid-uuid",
  "user": {
    "id": "uuid",
    "name": "CS Agent",
    "email": "cs@wa-akg.local",
    "role": "cs"
  }
}
```

**Errors:**
- `400` — Email and password required
- `401` — Invalid credentials

---

### POST /api/auth/refresh

Get new access token using refresh token.

**Request:**
```json
{
  "refreshToken": "uuid-uuid"
}
```

**Response (200):**
```json
{
  "accessToken": "eyJhbGciOi...",
  "user": { "id": "uuid", "name": "...", "email": "...", "role": "..." }
}
```

---

### POST /api/auth/logout

Invalidate session. Requires Bearer token.

**Request:**
```json
{
  "refreshToken": "uuid-uuid"
}
```

**Response (200):**
```json
{ "success": true }
```

---

### GET /api/auth/me

Get current user info. Requires Bearer token.

**Response (200):**
```json
{
  "userId": "uuid",
  "role": "cs"
}
```

---

## Conversations

All conversation endpoints require authentication.

### GET /api/conversations

List conversations with cursor pagination.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `status` | string | Filter: `bot`, `waiting`, `active`, `resolved` |
| `mine` | boolean | `true` = only conversations claimed by me |
| `cursor` | string | Conversation ID for pagination |
| `limit` | number | Items per page (default: 20) |

**Response (200):**
```json
{
  "conversations": [
    {
      "id": "uuid",
      "wa_number": "6281234567890",
      "customer_name": "John Doe",
      "status": "waiting",
      "claimed_by": null,
      "customer_id": "uuid",
      "created_at": "2026-06-14T10:00:00.000Z",
      "updated_at": "2026-06-14T10:05:00.000Z"
    }
  ],
  "nextCursor": "uuid",
  "hasMore": true
}
```

---

### GET /api/conversations/queue-count

Get current waiting queue size.

**Response (200):**
```json
{ "count": 5 }
```

---

### GET /api/conversations/:id

Get conversation metadata.

**Response (200):**
```json
{
  "id": "uuid",
  "wa_number": "6281234567890",
  "customer_name": "John Doe",
  "status": "active",
  "claimed_by": "uuid",
  "customer_id": "uuid",
  "created_at": "...",
  "updated_at": "..."
}
```

---

### GET /api/conversations/:id/messages

Get messages for a conversation with cursor pagination.

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `cursor` | string | Message ID for pagination |
| `limit` | number | Items per page (default: 30) |
| `direction` | string | `older` (default) or `newer` |

**Response (200):**
```json
{
  "messages": [
    {
      "id": "uuid",
      "conversation_id": "uuid",
      "sender": "customer",
      "cs_id": null,
      "content": "Halo, saya ingin tanya stok",
      "wa_message_id": "WA_ID_xxx",
      "created_at": "2026-06-14T10:00:00.000Z"
    }
  ],
  "nextCursor": "uuid",
  "hasMore": false
}
```

---

### POST /api/conversations/:id/claim

Claim a waiting conversation. Requires `cs` role or higher.

**Response (200):**
```json
{
  "id": "uuid",
  "status": "active",
  "claimed_by": "uuid",
  ...
}
```

**Errors:**
- `404` — Conversation not found
- `400` — Already claimed or resolved

---

### POST /api/conversations/:id/transfer

Transfer a conversation to another CS.

**Request:**
```json
{
  "toCsId": "target-user-uuid"
}
```

**Response (200):**
```json
{ ... conversation ... }
```

---

### POST /api/conversations/:id/resolve

Resolve a conversation. Triggers AI session summary generation.

**Response (200):**
```json
{
  "id": "uuid",
  "status": "resolved",
  ...
}
```

---

### POST /api/conversations/:id/messages

Send a message as CS to the customer via WhatsApp.

**Request:**
```json
{
  "content": "Halo, ada yang bisa saya bantu?"
}
```

**Response (200):**
```json
{
  "messageId": "uuid",
  "conversationId": "uuid",
  "isNewSession": false
}
```

---

## Customers

### GET /api/customers/:waNumber

Get customer profile. Includes returning customer info.

**Response (200):**
```json
{
  "id": "uuid",
  "wa_number": "6281234567890",
  "display_name": "John Doe",
  "total_sessions": 3,
  "last_summary": "Percakapan tentang stok produk A...",
  "last_active_at": "2026-06-10T15:00:00.000Z",
  "previousSessions": 3,
  "isReturning": true
}
```

---

## Admin Endpoints

All admin endpoints require `admin` or `super_admin` role.

### Bot Configuration

#### GET /api/admin/bot-config
Get current bot configuration.

#### PUT /api/admin/bot-config
Update bot configuration.

**Request:**
```json
{
  "persona_name": "CS Bot WA",
  "system_prompt": "Anda adalah customer service profesional...",
  "business_info": "Bisnis: ...\nJam Operasional: ...",
  "escalation_keywords": "cs, customer service, agent, #chatcs"
}
```

---

### Stock Configuration

#### GET /api/admin/stock-config
#### PUT /api/admin/stock-config

**Request:**
```json
{
  "source_type": "google_sheets",
  "config_json": "{\"spreadsheet_id\":\"...\",\"sheet_name\":\"Stok\"}",
  "is_active": true
}
```

#### GET /api/admin/stock/preview
Preview current stock data.

**Response (200):**
```json
{
  "data": [
    { "name": "Produk A", "qty": 100, "price": 50000 },
    { "name": "Produk B", "qty": 50, "price": 75000 }
  ]
}
```

---

### User Management

#### GET /api/admin/users
List all users.

#### POST /api/admin/users
Create a new user.

**Request:**
```json
{
  "name": "New CS",
  "email": "newcs@example.com",
  "password": "password123",
  "role": "cs"
}
```

#### PUT /api/admin/users/:id
Update user (all fields optional).

**Request:**
```json
{
  "name": "Updated Name",
  "is_active": false,
  "role": "admin"
}
```

#### DELETE /api/admin/users/:id
Soft-delete user (sets `is_active = false`).

---

### Gateway

#### GET /api/admin/gateway/status
Get WhatsApp connection status.

**Response (200):**
```json
{
  "status": "connected",
  "phoneNumber": "6281234567890"
}
```

#### GET /api/admin/gateway/qr
Get QR code for WA login.

#### POST /api/admin/gateway/disconnect
Disconnect WA session.

---

### Audit Log

#### GET /api/admin/audit-log
Get latest 100 audit log entries.

---

## Notifications

### GET /api/notifications/vapid-public-key
Get VAPID public key for frontend push subscription.

### POST /api/notifications/subscribe
Register a push subscription.

**Request:**
```json
{
  "endpoint": "https://fcm.googleapis.com/...",
  "keys": { "p256dh": "...", "auth": "..." },
  "userAgent": "Mozilla/5.0 ..."
}
```

### DELETE /api/notifications/unsubscribe
Remove a push subscription.

**Request:**
```json
{ "endpoint": "https://fcm.googleapis.com/..." }
```

### GET /api/notifications/preferences
Get user notification preferences.

### PUT /api/notifications/preferences
Update notification preference.

**Request:**
```json
{
  "notif_type": "queue_update",
  "is_enabled": false,
  "dnd_start": "22:00",
  "dnd_end": "07:00"
}
```

---

## Seed

### POST /api/seed

Seed database with default users and configuration. Idempotent — does nothing if users already exist.

---

## Health

### GET /api/health

**Response (200):**
```json
{ "status": "ok", "timestamp": "2026-06-14T10:00:00.000Z" }
```
