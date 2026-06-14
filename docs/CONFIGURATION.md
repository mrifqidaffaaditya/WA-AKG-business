# Configuration Reference

Complete reference for all environment variables and configuration options.

All variables are set in the root `.env` file.

## Environment Variables

### Core Application

| Variable | Default | Description |
|---|---|---|
| `APP_PORT` | `4040` | Backend server port |
| `APP_SECRET` | _(required)_ | Secret key for JWT signing. Generate: `openssl rand -hex 32` |
| `NODE_ENV` | `production` | `development` or `production`. Controls logging verbosity |

### AI Provider

WA-AKG Business uses OpenAI-compatible API. Any provider that implements the `/v1/chat/completions` endpoint will work.

| Variable | Default | Description |
|---|---|---|
| `AI_BASE_URL` | `https://api.openai.com/v1` | API base URL |
| `AI_API_KEY` | _(required)_ | API key for authentication |
| `AI_MODEL` | `gpt-4o` | Model name to use |
| `AI_MAX_TOKENS` | `1024` | Maximum tokens per bot response |

**Alternative providers:**
- **Groq:** `AI_BASE_URL=https://api.groq.com/openai/v1`, `AI_MODEL=llama-3.3-70b-versatile`
- **Together AI:** `AI_BASE_URL=https://api.together.xyz/v1`, `AI_MODEL=meta-llama/Llama-3.3-70B-Instruct-Turbo`
- **Local LLM (Ollama):** `AI_BASE_URL=http://localhost:11434/v1`, `AI_MODEL=llama3`

### Database

| Variable | Default | Description |
|---|---|---|
| `DB_PATH` | `./data/wa_akg.db` | SQLite database file path. Use `file:` prefix for libsql |

### WhatsApp Gateway

| Variable | Default | Description |
|---|---|---|
| `WA_LIBRARY` | `baileys` | WA library (only baileys supported currently) |
| `WA_SESSION_PATH` | `./sessions` | Directory for WA session credentials |

### VAPID Keys (Web Push)

Required for browser push notifications. Generate with:

```bash
npx web-push generate-vapid-keys
```

| Variable | Default | Description |
|---|---|---|
| `VAPID_PUBLIC_KEY` | _(required)_ | VAPID public key |
| `VAPID_PRIVATE_KEY` | _(required)_ | VAPID private key |
| `VAPID_SUBJECT` | `mailto:admin@yourdomain.com` | Contact info for push service |

### Redis (Optional)

Used for BullMQ job queue (async AI summary generation). Not required for basic functionality.

| Variable | Default | Description |
|---|---|---|
| `REDIS_HOST` | `localhost` | Redis server host |
| `REDIS_PORT` | `6380` | Redis server port |

### External Stock Database (Optional)

Alternative stock source using MySQL or PostgreSQL.

| Variable | Default | Description |
|---|---|---|
| `STOCK_DB_TYPE` | — | `mysql` or `postgresql` |
| `STOCK_DB_HOST` | `localhost` | Database host |
| `STOCK_DB_PORT` | `3306` (mysql) / `5432` (postgresql) | Database port |
| `STOCK_DB_NAME` | — | Database name |
| `STOCK_DB_USER` | — | Database user |
| `STOCK_DB_PASS` | — | Database password |
| `STOCK_TABLE` | `products` | Table name |
| `STOCK_COL_NAME` | `nama_produk` | Column for product name |
| `STOCK_COL_QTY` | `stok` | Column for stock quantity |
| `STOCK_COL_PRICE` | `harga` | Column for price |

### Google Sheets (Optional)

| Variable | Default | Description |
|---|---|---|
| `GSHEET_CREDENTIALS_PATH` | `./credentials/service-account.json` | Path to service account JSON |
| `GSHEET_SPREADSHEET_ID` | — | Google Sheets spreadsheet ID (from URL) |
| `GSHEET_SHEET_NAME` | `Stok` | Sheet/tab name |
| `GSHEET_HEADER_ROW` | `1` | Row number where header starts |
| `GSHEET_COL_NAME` | `A` | Column letter for product name |
| `GSHEET_COL_QTY` | `B` | Column letter for stock quantity |
| `GSHEET_COL_PRICE` | `C` | Column letter for price |

### Behavior Settings

| Variable | Default | Description |
|---|---|---|
| `CONTEXT_EXPIRY_DAYS` | `90` | Days before returning customer context is considered stale |
| `MESSAGES_PAGE_SIZE` | `30` | Messages per batch in infinity scroll |
| `CONVERSATIONS_PAGE_SIZE` | `20` | Conversations per batch in sidebar |
| `MESSAGES_SOFT_CAP` | `5000` | Max messages per session before auto-close |
| `NOTIF_QUEUE_THRESHOLD` | `5` | Queue count that triggers admin alert |
| `NOTIF_DEBOUNCE_SECONDS` | `30` | Minimum seconds between push notifications per conversation |
| `CORS_ORIGIN` | `http://localhost:4041` | Allowed CORS origin (frontend URL) |

## Admin Dashboard Configuration

Beyond environment variables, these are configured through the Admin Panel:

### Bot Config
- Persona name and system prompt
- Business information injected into bot context
- Escalation keywords (comma-separated)

### CS Config
- Auto-signature toggle + template (with `{name}` placeholder)
- Quick reply shortcuts (one per line)
- Auto-reply on claim: toggle + message template
- Auto-reply on resolve: toggle + message template
- **WhatsApp Group Notifications:** toggle + group JID input
  - Sends real-time log to WhatsApp group: new customer, CS request, chat claimed, chat resolved
  - Get JID by sending `!jid` in the group chat

### Stock Config
- Source type (none, google_sheets, mysql, postgresql)
- Connection details as JSON config
- Enable/disable toggle

### Notification Preferences
Per-user settings for each notification type:
- `queue_update` — New customer in queue
- `new_message` — New message in active chat
- `chat_transfer` — Chat transferred to you
- `gateway_disconnect` — WA connection lost (admin only)
- `queue_alert` — Queue exceeds threshold (admin only)
