# Installation Guide

Quick setup instructions for WA-AKG Business.

## Prerequisites

| Requirement | Minimum Version | Notes |
|---|---|---|
| Docker Engine | 24+ | For Docker deployment |
| Docker Compose | v2+ | Included with Docker Desktop |
| Git | 2.0+ | For cloning the repo |
| WhatsApp Account | — | A phone number not already linked to WhatsApp Web |
| OpenAI API Key | — | Or compatible provider (see [Configuration](./CONFIGURATION.md#ai-provider)) |

## Docker Quick Start

### 1. Clone the Repository

```bash
git clone https://github.com/mrifqidaffaaditya/WA-AKG-business.git
cd WA-AKG-business
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your values:

- `APP_SECRET` — generate with `openssl rand -hex 32`
- `AI_API_KEY` — your OpenAI or compatible API key
- `CORS_ORIGIN` — your frontend URL (default: `http://localhost:4041`)
- See [Configuration](./CONFIGURATION.md) for all available variables

### 3. Start Services

```bash
docker compose up -d
```

This single command handles:
- Installing all npm dependencies
- Creating and migrating the SQLite database (`wa_akg.db`)
- Seeding default users
- Starting backend on `http://localhost:4040`
- Starting frontend on `http://localhost:4041`

## Default Credentials

| Role | Email | Password |
|---|---|---|
| Super Admin | superadmin@wa-akg.local | admin123 |
| Admin | admin@wa-akg.local | admin123 |
| CS Agent | cs@wa-akg.local | cs123 |

## Login

1. Open `http://localhost:4041` in your browser
2. Login with one of the seeded accounts
3. CS agents will see the CS Dashboard
4. Admins will see the Admin Panel

## Connect WhatsApp

1. Login as admin or super_admin
2. Navigate to **Admin Panel → Gateway**
3. Wait for the QR code to appear
4. Open WhatsApp on your phone → Settings → Linked Devices → Link a Device
5. Scan the QR code
6. Gateway status changes to "connected"

## Configure the AI Bot

1. Go to **Admin Panel → Bot Config**
2. Set:
   - **Persona Name** — how the bot introduces itself
   - **System Prompt** — core instructions for the bot
   - **Business Info** — business hours, address, policies, FAQ
   - **Escalation Keywords** — words that trigger transfer to human CS
3. Click **Simpan Konfigurasi**

## Test the Flow

1. Send a WhatsApp message to the connected number
2. The bot should respond automatically
3. Type `#chatcs` to request a human CS agent
4. In the CS Dashboard, a new conversation appears under **Waiting**
5. CS clicks **Klaim Chat** to take the conversation
6. CS can reply directly from the dashboard

## Development Setup (Non-Docker)

For local development without Docker:

```bash
git clone https://github.com/mrifqidaffaaditya/WA-AKG-business.git
cd WA-AKG-business

cp .env.example .env
# Edit .env with required values

# Backend
cd backend
npm install
npx drizzle-kit push
npm run dev      # → http://localhost:4040

# Frontend
cd ../frontend
npm install
npm run dev      # → http://localhost:4041

# Seed database
curl -X POST http://localhost:4040/api/seed
```

## Troubleshooting

### Port already in use

```bash
lsof -i :4040
lsof -i :4041
```

### Database issues

```bash
rm -f data/wa_akg.db
docker compose up -d
```

### QR code doesn't appear

- Make sure the WhatsApp number is not already linked to WhatsApp Web on another device/session
- Check `sessions/` directory exists and is writable
- Restart: `docker compose restart`

### Push notifications not working

- Ensure VAPID keys are set in `.env`
- Generate new keys: `npx web-push generate-vapid-keys`
- Browser must support Web Push API (Chrome, Firefox, Edge)

## Next Steps

- [Configure stock data source](./STOCK.md)
- [Deploy to production](./DEPLOYMENT.md)
- [Explore the API](./API.md)
