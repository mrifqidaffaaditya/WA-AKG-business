# API Reference

Complete REST API documentation for WA-AKG Business.

- Base URL Internal / Gateway: `http://localhost:4040/api`
- Developer REST API v1 Base: `http://localhost:4040/api/v1`
- Interactive OpenAPI Docs: `http://localhost:4040/api/docs`
- OpenAPI 3.0 Specification: `http://localhost:4040/api/docs/openapi.json`
- Webhooks Specification & Guide: [WEBHOOKS.md](./WEBHOOKS.md)

---

## Developer REST API (v1)

Developer API memungkinkan integrasi eksternal (CRM, ERP, Zapier, skrip backend) menggunakan autentikasi API Key (`X-API-Key: akg_live_...` atau `Authorization: Bearer akg_live_...`).

### POST /api/v1/messages/send

Mengirimkan pesan WhatsApp tunggal (teks atau media).

**Headers:**
- `X-API-Key`: `akg_live_...`
- `Content-Type`: `application/json`

**Request Body:**
```json
{
  "to": "6281234567890",
  "content": "Halo, pesanan Anda #12345 sudah dikirim!",
  "contentType": "text",
  "mediaUrl": "https://example.com/receipt.pdf",
  "fileName": "receipt.pdf"
}
```

**Response (200 OK):**
```json
{
  "success": true,
  "messageId": "msg_01HXYZ...",
  "conversationId": "conv_01HABC...",
  "waMessageId": "3EB0B0F39D5...",
  "to": "6281234567890",
  "sentAt": "2026-11-23T12:00:00.000Z"
}
```

---

### POST /api/v1/messages/interactive

Mengirim pesan interaktif (tombol / menu daftar) ke satu nomor. Butuh scope `messages:send`.

**Request Body:**
```json
{
  "to": "6281234567890",
  "title": "Konfirmasi",
  "body": "Lanjutkan pesanan ini?",
  "footer": "Pilih salah satu",
  "options": [
    { "label": "Ya", "value": "yes" },
    { "label": "Tidak", "value": "no" }
  ]
}
```

Selain `options`, bentuk `buttons` atau `sections` juga diterima. Lihat [INTERACTIVE.md](./INTERACTIVE.md).

**Response (200 OK):**
```json
{
  "success": true,
  "messageId": "msg_01HXYZ...",
  "conversationId": "conv_01HABC...",
  "waMessageId": "3EB0B0F39D5...",
  "to": "6281234567890",
  "sentAt": "2026-11-26T09:00:00.000Z"
}
```

---

### POST /api/v1/messages/broadcast

Mengirim pesan massal ke banyak nomor dengan proteksi delay bertahap (*staggered delivery*).

**Request Body:**
```json
{
  "recipients": ["6281234567890", "6289876543210"],
  "content": "Pengumuman promo spesial hari ini!",
  "delayMs": 800
}
```

**Response (202 Accepted):**
```json
{
  "success": true,
  "queued": 2,
  "staggerDelayMs": 800,
  "estimatedDurationSeconds": 2,
  "message": "Broadcast queued and delivering in background"
}
```

---

### GET /api/v1/conversations

Daftar percakapan dengan filter status dan pagination cursor.

**Query Parameters:**
- `status`: `bot` | `waiting` | `active` | `resolved` | `hold`
- `limit`: default `20` (maksimum `100`)
- `cursor`: cursor pagination

---

### GET /api/v1/conversations/:id/messages

Mengambil riwayat percakapan.

---

### PATCH /api/v1/conversations/:id/status

Mengubah status percakapan (`waiting`, `active`, `resolved`, `hold`).

---

### POST /api/v1/conversations/:id/resolve

Menyelesaikan sesi percakapan.

---

### GET /api/v1/stock & POST /api/v1/stock/sync

Membaca inventaris stok produk dan memicu sinkronisasi on-demand dari datasource.

---

### GET /api/v1/gateway/status

Mengecek status koneksi WhatsApp Gateway (connected, connecting, disconnected, dan QR code).

---

## Authentication (CS & Admin Portal)

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

### Conversation Access Control

All conversation detail endpoints (`GET /:id`, `GET /:id/messages`, `POST /:id/resolve`) require conversation access:
- `404` — Conversation not found
- `403` — CS agent cannot access a conversation claimed by another CS (unless `waiting`/`bot` status)
- Admins and super_admins have unrestricted access

---

### GET /api/conversations/cs-config

Get CS configuration (quick replies, signature, auto-reply templates, group notification settings).

**Response (200):**
```json
{
  "signatureEnabled": true,
  "signatureTemplate": " - {name}",
  "quickReplies": ["Halo, ada yang bisa kami bantu?", "..."],
  "autoReplyClaimEnabled": true,
  "autoReplyClaim": "Halo, dengan CS {name} di sini. Ada yang bisa saya bantu?",
  "autoReplyResolveEnabled": true,
  "autoReplyResolve": "Terima kasih telah menghubungi kami...",
  "waGroupNotifEnabled": false,
  "waGroupJid": ""
}
```

---

### POST /api/conversations/:id/claim

Claim a waiting conversation. Requires `cs` role or higher. Creates audit log entry and sends WhatsApp group notification (if configured).

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

Resolve a conversation. Triggers AI session summary generation. Creates audit log entry and sends WhatsApp group notification (if configured).

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

### POST /api/conversations/:id/interactive

Send a rich interactive message (buttons or a list menu) as CS. Automatically claims a `bot`/`waiting` conversation and re-opens a `resolved` one.

**Request (buttons):**
```json
{
  "title": "Konfirmasi",
  "body": "Lanjutkan pesanan ini?",
  "footer": "Pilih salah satu",
  "buttons": [
    { "type": "quick_reply", "displayText": "✅ Ya", "id": "confirm_yes" },
    { "type": "cta_url", "displayText": "🌐 Katalog", "url": "https://toko.example.com" }
  ]
}
```

**Request (list menu / simplified options):**
```json
{
  "title": "Katalog",
  "body": "Silakan pilih produk:",
  "options": [
    { "label": "Kopi Arabika", "value": "kopi", "description": "Rp 85.000" },
    { "label": "Kopi Robusta", "value": "robusta", "description": "Rp 65.000" }
  ]
}
```

`options` with ≤3 entries becomes quick-reply buttons; more than 3 becomes a single-select list. A full `buttons: [{ "type": "single_select", "title": "...", "sections": [...] }]` is also accepted.

**Response (201):** the saved message row, including `"media_type": "interactive"`.

See [INTERACTIVE.md](./INTERACTIVE.md) for the complete guide.

### GET /api/conversations/stock-menu

Stock items shaped for the interactive menu builder.

**Response (200):**
```json
{
  "items": [
    { "id": "produk_1", "name": "Kopi Arabika", "price": 85000, "stock": 12, "priceLabel": "Rp 85.000", "stockLabel": "tersedia (12)" }
  ]
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

Returns the saved configuration with secrets masked (`***`), a friendly `fields` object for the admin form, and the latest sync `status`.

```json
{
  "source_type": "google_sheets",
  "is_active": true,
  "config": { "spreadsheet_id": "1Bxi...", "credentials_json": "***" },
  "fields": { "spreadsheetId": "1Bxi...", "sheetName": "Stok", "colName": "A", "colPrice": "B", "colStock": "C" },
  "status": {
    "last_synced_at": "2026-11-26T09:00:00.000Z",
    "last_sync_status": "success",
    "last_sync_error": null,
    "last_item_count": 24
  }
}
```

#### PUT /api/admin/stock-config

Accepts either friendly `fields` (recommended) or a raw `config_json` object/string. Empty or `***` secrets never overwrite the stored value.

```json
{
  "source_type": "google_sheets",
  "is_active": true,
  "fields": {
    "spreadsheetId": "https://docs.google.com/spreadsheets/d/1Bxi.../edit",
    "sheetName": "Stok",
    "headerRow": 1,
    "colName": "A",
    "colPrice": "B",
    "colStock": "C",
    "credentialsJson": "{ \"type\": \"service_account\", ... }"
  }
}
```

Saving triggers an immediate sync and returns the same shape as `GET`.

#### POST /api/admin/stock-config/test

Tests a candidate configuration without saving it.

```json
{ "source_type": "mysql", "fields": { "host": "127.0.0.1", "database": "stok", "table": "products", "user": "readonly", "password": "..." } }
```

**Response:** `{ "ok": true, "count": 24, "sample": [...] }` or `{ "ok": false, "error": "..." }`.

#### POST /api/admin/stock-config/sync

Forces a fresh sync: `{ "success": true, "count": 24, "status": { ... } }`.

#### GET /api/admin/stock/preview

Normalized stock rows.

**Response (200):**
```json
[
  { "name": "Produk A", "price": 50000, "stock": 100, "priceLabel": "Rp 50.000", "stockLabel": "tersedia (100)" }
]
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
Get latest audit log entries (DESC order, newest first, with user names).

**Query Parameters:**
| Param | Type | Description |
|---|---|---|
| `limit` | number | Items per page (default: 50) |

---

### CS Stats

#### GET /api/admin/cs-stats
Get per-CS performance statistics.

**Response (200):**
```json
[
  {
    "id": "uuid",
    "name": "CS Agent",
    "role": "cs",
    "is_online": true,
    "total_claimed": 45,
    "total_resolved": 38,
    "avg_rating": 4.2,
    "active_count": 2
  }
]
```

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
