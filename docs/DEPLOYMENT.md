# Deployment & Reverse Proxy Guide

WA-AKG Business supports two flexible production setups:
1. **PM2 Native Deployment (Recommended)** — Ultra-lightweight (~150MB total RAM, instant startup, no Docker build overhead).
2. **Docker Compose** — Containerized frontend & backend using host Redis (or optional containerized Redis/Nginx).

---

## 1. Port Allocation Overview

| Service | Internal Port | Exposed Via | Description |
| :--- | :---: | :---: | :--- |
| **Backend** | `4005` | `127.0.0.1:4005` | Express.js, Baileys WhatsApp, REST API v1, WebSockets (`/socket.io`), Webhooks |
| **Frontend** | `4041` | `127.0.0.1:4041` | Next.js 15 Standalone UI (App Router, OLED dark theme) |
| **Redis** | `6379` | `127.0.0.1:6379` | aaPanel native Redis service (job queues & cache) |
| **Public Gateway** | `80` / `443` | aaPanel / Nginx / Cloudflare | Reverse proxy handling HTTPS, domain routing & WebSocket upgrades |

---

## 2. aaPanel Nginx Reverse Proxy Setup

In aaPanel, when you create a Reverse Proxy for `/` pointing to `http://127.0.0.1:4041`, aaPanel automatically generates `location ^~ / { ... }`. 

To route WebSockets (`/socket.io/`), REST API (`/api/`), and media (`/uploads/`) directly to the backend without causing a `duplicate location "/"` error:

1. In aaPanel, create a standard **Reverse Proxy**:
   - Proxy Name: `wa-akg-frontend`
   - Target URL: `http://127.0.0.1:4041`
   - Sent Domain: `$host`
2. Next, go to **Website Settings** ➔ **Customized Configuration Files** (or File Extension):
3. Add the following rules (available at `nginx/aapanel.conf`):

```nginx
# 1. Realtime WebSockets (Socket.io)
location ^~ /socket.io/ {
    proxy_pass http://127.0.0.1:4005/socket.io/;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 86400s;
    proxy_send_timeout 86400s;
    proxy_buffering off;
}

# 2. Backend REST API v1, Auth & Docs
location ^~ /api/ {
    proxy_pass http://127.0.0.1:4005/api/;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_connect_timeout 60s;
    proxy_read_timeout 300s;
}

# 3. WhatsApp Media & Attachments
location ^~ /uploads/ {
    proxy_pass http://127.0.0.1:4005/uploads/;
    proxy_http_version 1.1;
    proxy_set_header Host $http_host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    expires 30d;
}
```

---

## 3. Cloudflare Tunnel Setup

When using Cloudflare Tunnel (via Zero Trust / `cloudflared`):
- **Ingress Rule Target**: Point the public hostname `wa-akg-business.aikeigroup.net` to:
  - **Option A (Via aaPanel Nginx)**: `http://localhost:80` (or `http://127.0.0.1:80`) — aaPanel automatically handles the paths and WebSockets.
  - **Option B (Direct to Next.js)**: `http://127.0.0.1:4041` — Ensure WebSockets are enabled in the Cloudflare dashboard.

---

## 4. PM2 Native Operation

### Start Services
```bash
# Start backend and frontend via PM2
pm2 start ecosystem.config.cjs
pm2 save
```

### Commands
```bash
# Check running status
pm2 status

# View backend logs
pm2 logs wa-akg-business-backend

# View frontend logs
pm2 logs wa-akg-business-frontend

# Restart after code changes
pm2 restart ecosystem.config.cjs --update-env
```

---

## 5. Docker Compose (Alternative)

If you prefer containerized deployment:

```bash
# Start backend and frontend containers
docker compose up -d

# Check container status
docker compose ps
docker compose logs -f
```

*Note: In `docker-compose.yml`, `redis` and `nginx` are provided as commented-out services for environments without native aaPanel or host reverse proxies.*

---

## 6. Backups

### SQLite Database
```bash
# Daily backup
cp backend/data/wa_akg.db backups/wa-akg-$(date +%Y%m%d).db
```

### WhatsApp Sessions
```bash
# Backup credentials
tar -czf backups/sessions-$(date +%Y%m%d).tar.gz backend/sessions/
```
