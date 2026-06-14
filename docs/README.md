# WA-AKG Business Documentation

Welcome to the official WA-AKG Business documentation.

## Contents

| Document | Description |
|---|---|
| [Installation Guide](./INSTALLATION.md) | Detailed step-by-step setup instructions |
| [Configuration Reference](./CONFIGURATION.md) | All environment variables and their usage |
| [Architecture Overview](./ARCHITECTURE.md) | System design, data flow, and component interaction |
| [API Reference](./API.md) | Complete REST API endpoints with request/response examples |
| [Deployment Guide](./DEPLOYMENT.md) | Production deployment with Docker Compose, PM2, and reverse proxy |
| [WhatsApp Setup](./WHATSAPP.md) | WhatsApp Gateway setup, QR login, troubleshooting |
| [Stock Integration](./STOCK.md) | Google Sheets and database stock configuration |

## Quick Navigation

### For New Users
Start with [Installation](./INSTALLATION.md) → [WhatsApp Setup](./WHATSAPP.md)

### For Developers
Start with [Architecture](./ARCHITECTURE.md) → [API Reference](./API.md)

### For DevOps
Start with [Configuration](./CONFIGURATION.md) → [Deployment](./DEPLOYMENT.md)

## Quick Deploy (Docker)

```bash
cp .env.example .env   # Edit APP_SECRET & AI_API_KEY
docker compose up -d
```

Open `http://localhost:4040` — just one container, one port.
