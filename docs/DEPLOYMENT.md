# Deployment Guide

Production deployment for WA-AKG Business.

## Docker Compose (Recommended)

```bash
# 1. Clone the repository
git clone https://github.com/mrifqidaffaaditya/WA-AKG-business.git
cd WA-AKG-business

# 2. Configure environment
cp .env.example .env
# Edit .env with production values:
#   APP_SECRET — strong random string (openssl rand -hex 32)
#   AI_API_KEY — your OpenAI or compatible API key
#   VAPID_PUBLIC_KEY — generate with npx web-push generate-vapid-keys
#   VAPID_PRIVATE_KEY
#   CORS_ORIGIN — your production frontend URL
#   NODE_ENV=production

# 3. Start services (auto-install, auto-migrate, auto-seed)
docker compose up -d
```

### Services

| Service | Port | Description |
|---|---|---|
| `frontend` | 4041 | Next.js production server |
| `backend` | 4040 | Express API + WebSocket |
| `redis` | 6380 | Cache & job queue |

---

## Reverse Proxy (Nginx)

```nginx
server {
    listen 443 ssl http2;
    server_name wa-akg.yourdomain.com;

    # Frontend
    location / {
        proxy_pass http://localhost:4041;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    # Backend API
    location /api/ {
        proxy_pass http://localhost:4040;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # WebSocket
    location /socket.io/ {
        proxy_pass http://localhost:4040;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
    }
}
```

---

## Environment Validation Checklist

Before going to production:

- [ ] `APP_SECRET` set to a strong random value (not default)
- [ ] `NODE_ENV=production`
- [ ] `AI_API_KEY` set
- [ ] `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` set
- [ ] `CORS_ORIGIN` set to production frontend URL
- [ ] HTTPS enabled on reverse proxy
- [ ] Firewall blocks direct access to ports 4040/4041
- [ ] Database backed up regularly

---

## Backup

### SQLite Database

```bash
# Simple file backup
cp data/wa_akg.db "backups/wa-akg-$(date +%Y%m%d-%H%M%S).db"

# Cron job (daily at 2am)
0 2 * * * cp /path/to/WA-AKG-business/data/wa_akg.db /path/to/backups/wa-akg-$(date +\%Y\%m\%d).db
```

### WA Sessions

```bash
# Backup session files
tar -czf "backups/sessions-$(date +%Y%m%d).tar.gz" sessions/
```

**Never commit session files to git.** They contain authentication credentials.
