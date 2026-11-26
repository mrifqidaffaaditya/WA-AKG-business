# Panduan Instalasi Lengkap — WA-AKG Business

Panduan ini menuntun dari server kosong sampai aplikasi berjalan, WhatsApp tersambung, bot AI aktif, dan stok produk terbaca. Ada dua jalur instalasi:

| Jalur | Cocok untuk | Waktu |
|---|---|---|
| **A. Docker Compose** (direkomendasikan) | Hampir semua kasus, deploy cepat & reproducible | ±10 menit |
| **B. Native + PM2** | VPS kecil (RAM ≤ 1 GB), aaPanel, tanpa Docker | ±20 menit |

Pilih **satu** jalur saja.

---

## Daftar Isi

1. [Prasyarat](#1-prasyarat)
2. [Persiapan Awal (semua jalur)](#2-persiapan-awal-semua-jalur)
3. [Jalur A — Instalasi dengan Docker](#3-jalur-a--instalasi-dengan-docker)
4. [Jalur B — Instalasi Native + PM2](#4-jalur-b--instalasi-native--pm2)
5. [Reverse Proxy, Domain & SSL](#5-reverse-proxy-domain--ssl)
6. [Menyambungkan WhatsApp](#6-menyambungkan-whatsapp)
7. [Mengaktifkan Bot AI](#7-mengaktifkan-bot-ai)
8. [Integrasi Stok Produk](#8-integrasi-stok-produk)
9. [Pesan Interaktif (Tombol & Menu)](#9-pesan-interaktif-tombol--menu)
10. [Uji Coba End-to-End](#10-uji-coba-end-to-end)
11. [Keamanan & Ganti Password](#11-keamanan--ganti-password)
12. [Backup & Restore](#12-backup--restore)
13. [Update / Upgrade](#13-update--upgrade)
14. [Troubleshooting](#14-troubleshooting)
15. [Checklist Go-Live](#15-checklist-go-live)

---

## 1. Prasyarat

### Perangkat & Sistem Operasi

| Komponen | Minimum | Rekomendasi |
|---|---|---|
| OS | Ubuntu 22.04 / Debian 12 | Ubuntu 24.04 LTS |
| CPU | 1 vCPU | 2 vCPU |
| RAM | 1 GB (native/PM2) | 2 GB (Docker) |
| Disk | 5 GB | 20 GB |
| Node.js (jalur B) | 20 LTS | 22 LTS |
| Docker Engine (jalur A) | 24+ | terbaru |
| Docker Compose (jalur A) | v2+ | terbaru |

### Yang Harus Disiapkan

- **Nomor WhatsApp** yang **belum** login di WhatsApp Web/Desktop mana pun. Nomor yang sedang aktif di WhatsApp Web akan memutus sesi lain.
- **API key AI** — OpenAI, OpenRouter, Groq, atau endpoint apa pun yang kompatibel OpenAI (`/v1/chat/completions`).
- **Domain** (opsional tapi sangat disarankan untuk produksi) + akses DNS.
- **Akses SSH** ke server dengan hak `sudo`.

### Cek cepat kondisi server

```bash
# OS & arsitektur
cat /etc/os-release | head -3
uname -m            # harus x86_64 atau aarch64

# RAM & disk
free -h
df -h /

# Port yang dipakai aplikasi harus kosong
ss -tulpn | grep -E ':(4040|4041|4005|4000)\b' || echo "Port bebas"
```

Jika ada output pada pengecekan port, hentikan service yang memakai port tersebut atau ubah port aplikasi di `.env`.

---

## 2. Persiapan Awal (semua jalur)

### 2.1 Clone repositori

```bash
sudo apt update && sudo apt install -y git curl
git clone https://github.com/mrifqidaffaaditya/WA-AKG-business.git
cd WA-AKG-business
```

### 2.2 Buat file `.env`

```bash
cp .env.example .env
```

### 2.3 Isi variabel wajib

Buka `.env` (`nano .env`) lalu sesuaikan. **Minimal 5 variabel ini harus diisi benar:**

```bash
# Port
APP_PORT=4005              # port internal backend
FRONTEND_PORT=4041         # port internal frontend
PORT=4040                  # port publik (nginx / akses browser)

# Keamanan — WAJIB diganti, dan harus BERBEDA satu sama lain
APP_SECRET=<hasil openssl rand -hex 32>
REFRESH_SECRET=<hasil openssl rand -hex 32>

# AI
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-xxxxxxxxxxxxxxxx
AI_MODEL=gpt-4o

# URL publik frontend (untuk CORS & cookie)
FRONTEND_URL=https://wa.domain-anda.com
CORS_ORIGIN=https://wa.domain-anda.com
```

Generate secret dengan aman:

```bash
openssl rand -hex 32   # jalankan 2x, hasil pertama untuk APP_SECRET, kedua untuk REFRESH_SECRET
```

> **Penting:** `APP_SECRET` dan `REFRESH_SECRET` **tidak boleh sama**. Jika sama, refresh token bisa dipakai sebagai access token.

### 2.4 Variabel opsional yang sering dipakai

```bash
TIMEZONE=Asia/Jakarta
RATE_LIMIT_ENABLED=true
ALLOW_LOCAL_WEBHOOKS=false      # true hanya saat testing webhook ke localhost/LAN
SEED_SUPER_ADMIN_PASSWORD=...   # kosongkan agar password acak dibuat otomatis
SEED_ADMIN_PASSWORD=...
SEED_CS_PASSWORD=...
```

Referensi lengkap: [CONFIGURATION.md](./CONFIGURATION.md).

---

## 3. Jalur A — Instalasi dengan Docker

### 3.1 Install Docker + Compose

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER
newgrp docker            # atau logout & login ulang
docker --version && docker compose version
```

### 3.2 Build & jalankan

```bash
cd WA-AKG-business
docker compose up -d --build
```

Build pertama memerlukan **3–8 menit** (mengunduh dependency, termasuk `git` + `openssh-client` yang dibutuhkan library Baileys). Build berikutnya jauh lebih cepat karena cache.

### 3.3 Pantau proses start

```bash
docker compose ps
docker compose logs -f backend
```

Yang harus terlihat di log backend:

```
[migrate] ... (tidak ada error)
[seed] Seeded superadmin@wa-akg.local
[stock] Periodic sync started (60s)
Server running on port 4005
```

Tekan `Ctrl+C` untuk keluar dari mode log (container tetap berjalan).

### 3.4 Verifikasi health

```bash
curl -s http://127.0.0.1:4005/api/health
# {"status":"ok", ...}
```

Buka `http://IP-SERVER:4041` di browser → halaman login muncul. Untuk produksi, lanjut ke [bagian 5](#5-reverse-proxy-domain--ssl) agar bisa diakses lewat domain + HTTPS.

### 3.5 Perintah harian Docker

```bash
docker compose logs -f backend        # lihat log realtime
docker compose restart backend        # restart backend saja
docker compose down                   # hentikan semua
docker compose up -d                  # nyalakan lagi (tanpa rebuild)
docker compose up -d --build          # rebuild setelah update kode
```

### 3.6 Jika build gagal karena cache korup

```bash
docker system prune -af
docker compose up -d --build
```

---

## 4. Jalur B — Instalasi Native + PM2

Cocok untuk VPS kecil atau server aaPanel yang tidak memakai Docker.

### 4.1 Install Node.js 22 + PM2

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs build-essential git ca-certificates openssh-client
sudo npm install -g pm2
node -v    # v22.x
pm2 -v
```

`git`, `ca-certificates`, dan `openssh-client` wajib ada karena dibutuhkan saat instalasi library WhatsApp (Baileys).

### 4.2 Install dependency & build backend

```bash
cd WA-AKG-business/backend
npm ci || npm install
npm run build           # hasil kompilasi ke dist/
```

### 4.3 Migrasi database & seed akun awal

```bash
npx tsx src/db/migrate.ts
npx tsx src/db/seed-runner.ts
```

Database SQLite akan dibuat otomatis di `backend/data/wa_akg.db` (sesuai `DB_PATH`).

### 4.4 Install dependency & build frontend

```bash
cd ../frontend
npm ci || npm install
npm run build
```

### 4.5 Jalankan dengan PM2

Dari root proyek:

```bash
cd /path/ke/WA-AKG-business
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup            # ikuti perintah yang dicetak agar auto-start saat reboot
```

Cek status:

```bash
pm2 status
pm2 logs wa-akg-business-backend --lines 50
```

### 4.6 Perintah harian PM2

```bash
pm2 restart wa-akg-business-backend
pm2 restart wa-akg-business-frontend
pm2 logs
pm2 monit
```

> **Catatan:** `ecosystem.config.cjs` menggunakan path absolut (`/home/aditya/project/WA-AKG-business/...`). Sesuaikan `cwd` jika proyek Anda berada di direktori lain.

---

## 5. Reverse Proxy, Domain & SSL

Frontend berjalan di `4041` dan backend di `4005`. Agar bisa diakses lewat satu domain dengan HTTPS, gunakan reverse proxy.

### 5.1 Opsi 1 — aaPanel (paling umum di sini)

1. Buat website baru di aaPanel dengan domain `wa.domain-anda.com`, **tanpa** PHP.
2. Buka **Settings → Configuration File** dan tempel konfigurasi dari [`nginx/aapanel.conf`](../nginx/aapanel.conf). Inti yang harus ada:

```nginx
location /socket.io/ {
    proxy_pass http://127.0.0.1:4005;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_read_timeout 3600s;
}

location /api/ {
    proxy_pass http://127.0.0.1:4005;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_read_timeout 300s;
    client_max_body_size 25m;
}

location / {
    proxy_pass http://127.0.0.1:4041;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
}
```

3. Aktifkan **SSL → Let's Encrypt** di aaPanel, centang **Force HTTPS**.
4. Reload nginx.

**Kenapa `location /socket.io/` dan `/api/` dipisah?** Agar WebSocket (notifikasi realtime) dan upload file berjalan langsung ke backend, bukan melewati Next.js.

### 5.2 Opsi 2 — Nginx standalone

Gunakan [`nginx/nginx.full.conf`](../nginx/nginx.full.conf) sebagai template, atau aktifkan service `nginx` di `docker-compose.yml` (barisnya masih dikomentari).

### 5.3 Opsi 3 — Cloudflare Tunnel (tanpa buka port)

```bash
cloudflared tunnel login
cloudflared tunnel create wa-akg
cloudflared tunnel route dns wa-akg wa.domain-anda.com
cloudflared tunnel run --url http://127.0.0.1:4040 wa-akg
```

Jika memakai Cloudflare, pastikan `FRONTEND_URL` dan `CORS_ORIGIN` memakai domain `https://`, dan **jangan** aktifkan "Under Attack Mode" untuk path `/api/` dan `/socket.io/`.

### 5.4 Update `.env` setelah domain aktif

```bash
FRONTEND_URL=https://wa.domain-anda.com
CORS_ORIGIN=https://wa.domain-anda.com
```

Lalu restart: `docker compose restart backend` (atau `pm2 restart wa-akg-business-backend`).

---

## 6. Menyambungkan WhatsApp

1. Login sebagai **super admin**.
2. Buka **Admin Panel → Gateway**.
3. Tunggu QR code muncul (5–20 detik). Jika kosong, klik **Restart Gateway**.
4. Di ponsel: **WhatsApp → Pengaturan → Perangkat Tertaut → Tautkan Perangkat** → scan QR.
5. Status berubah menjadi **connected** dan nomor tampil.
6. Kirim pesan uji dari nomor lain ke nomor tersebut — bot akan membalas.

**Hal yang sering bikin gagal:**

- Nomor masih login di WhatsApp Web di browser lain → logout dulu.
- Folder `sessions/` tidak writable.
- Server di belakang proxy tanpa header `Upgrade` untuk WebSocket → QR tidak ter-update (lihat bagian 5).

Detail lanjutan: [WHATSAPP.md](./WHATSAPP.md).

---

## 7. Mengaktifkan Bot AI

1. **Admin Panel → Bot Config**.
2. Isi:
   - **Persona / Nama Bot** — misal "Sari dari Toko ABC".
   - **System Prompt** — aturan utama bot (gaya bahasa, larangan, cara menawarkan produk).
   - **Business Info** — jam operasional, alamat, kebijakan retur, ongkir. Jam operasional dibaca otomatis sehingga bot tahu kapan toko buka/tutup.
   - **Escalation Keywords** — kata yang memicu transfer ke CS (mis. `cs`, `admin`, `komplain`).
3. Aktifkan toggle **Bot Aktif**, lalu **Simpan Konfigurasi**.
4. Uji: kirim "halo" → bot membalas sesuai persona.

**Cek koneksi AI:** jika bot membalas "Maaf, saya tidak dapat memproses permintaan Anda saat ini", biasanya `AI_API_KEY`, `AI_BASE_URL`, atau `AI_MODEL` salah. Lihat `docker compose logs backend` untuk pesan error aslinya.

---

## 8. Integrasi Stok Produk

Buka **Admin Panel → Stok**. Panel baru memakai formulir ramah, bukan JSON mentah:

1. Pilih sumber: **Google Sheets**, **MySQL**, atau **PostgreSQL**.
2. Isi field yang muncul (link spreadsheet / host database, kolom nama-harga-stok).
3. Untuk Google Sheets, tempel **isi JSON Service Account** langsung ke panel (tidak wajib menyimpan file).
4. Klik **Tes Koneksi** → harus muncul "Ditemukan N produk".
5. Klik **Simpan** → data otomatis disinkronkan.
6. Klik **Preview** untuk memeriksa hasil normalisasi (nama, harga Rupiah, label stok).
7. Aktifkan toggle **Aktifkan Sinkronisasi Stok**.

Status sync (berhasil/gagal, waktu terakhir, jumlah produk, pesan error) tampil di kartu atas panel.

Panduan langkah demi langkah pembuatan Service Account Google & contoh tabel database: [STOCK.md](./STOCK.md).

---

## 9. Pesan Interaktif (Tombol & Menu)

Di jendela chat CS, klik ikon **Sparkles** di sebelah tombol lampiran:

- **Template cepat:** Konfirmasi, Penawaran, Menu dari Stok, Menu Layanan, Follow-up.
- **Mode Tombol:** hingga 10 tombol, tipe *Balasan Cepat*, *Buka Link*, *Telepon*, atau *Salin Kode*.
- **Mode Daftar:** menu bertingkat dengan judul bagian + deskripsi; bisa diisi otomatis dari data stok.

Bot AI juga dapat mengirim tombol sendiri lewat tool `kirim_pilihan_interaktif` saat pelanggan perlu memilih menu/konfirmasi. Detail & contoh API: [INTERACTIVE.md](./INTERACTIVE.md).

---

## 10. Uji Coba End-to-End

Lakukan berurutan; jika satu langkah gagal, perbaiki dulu sebelum lanjut.

| # | Langkah | Hasil yang diharapkan |
|---|---|---|
| 1 | Buka domain di browser | Halaman login tampil, tidak ada error SSL |
| 2 | Login `superadmin@wa-akg.local` | Masuk ke Admin Panel |
| 3 | Admin → Gateway | Status **connected** |
| 4 | Kirim "halo" dari WhatsApp lain | Bot membalas dalam < 10 detik |
| 5 | Ketik `#chatcs` | Muncul di daftar **Waiting** pada dashboard CS |
| 6 | Login sebagai CS, klaim chat | Status jadi **Active**, CS bisa membalas |
| 7 | CS klik ikon Sparkles → kirim menu | Pelanggan menerima tombol/menu native |
| 8 | Pelanggan menekan tombol | Balasan masuk ke chat sebagai pesan pelanggan |
| 9 | Admin → Stok → Preview | Daftar produk + harga + label stok benar |
| 10 | Tanya "stok Produk A?" ke bot | Bot menjawab sesuai data stok |
| 11 | Notifikasi browser | Muncul saat ada chat baru (jika VAPID diisi) |

---

## 11. Keamanan & Ganti Password

Akun seed:

| Role | Email | Password default |
|---|---|---|
| Super Admin | `superadmin@wa-akg.local` | `admin123` |
| Admin | `admin@wa-akg.local` | `admin123` |
| CS Agent | `cs@wa-akg.local` | `cs123` |

**Segera ganti setelah login pertama** (menu Profil / Manajemen User). Jika lupa dan perlu reset dari nol, atur `SEED_*_PASSWORD` di `.env` lalu jalankan ulang seed (hanya bekerja pada database yang belum punya user tersebut, atau via panel user).

Checklist keamanan minimum:

- [ ] `APP_SECRET` & `REFRESH_SECRET` acak, berbeda, minimal 32 byte.
- [ ] `NODE_ENV=production`.
- [ ] HTTPS aktif, HTTP dialihkan ke HTTPS.
- [ ] Password akun seed sudah diganti.
- [ ] User database stok memakai hak **read-only**.
- [ ] `ALLOW_LOCAL_WEBHOOKS=false`.
- [ ] Firewall hanya membuka 22, 80, 443 (port 4005/4041/4040 tidak diekspos publik).

Firewall contoh (UFW):

```bash
sudo ufw allow 22/tcp
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable
```

---

## 12. Backup & Restore

### Docker

```bash
# Backup database + sesi WhatsApp
docker run --rm -v wa-akg-business_app_data:/data -v $(pwd):/backup alpine \
  tar czf /backup/wa-akg-data-$(date +%F).tar.gz -C /data .

# Restore
docker run --rm -v wa-akg-business_app_data:/data -v $(pwd):/backup alpine \
  sh -c "cd /data && tar xzf /backup/wa-akg-data-YYYY-MM-DD.tar.gz"
docker compose restart backend
```

### Native

```bash
tar czf wa-akg-backup-$(date +%F).tar.gz \
  backend/data/wa_akg.db backend/sessions backend/public/uploads .env
```

> **Penting:** `backend/sessions/` berisi kredensial WhatsApp. Simpan backup di tempat aman dan terenkripsi. Tanpa folder ini Anda harus scan QR ulang.

---

## 13. Update / Upgrade

### Docker

```bash
cd WA-AKG-business
git pull
docker compose up -d --build
docker compose logs -f backend    # pastikan migrasi berjalan tanpa error
```

Migrasi database dijalankan otomatis oleh `docker-entrypoint.sh` saat container start.

### Native

```bash
cd WA-AKG-business
git pull

cd backend && npm install && npm run build && npx tsx src/db/migrate.ts
cd ../frontend && npm install && npm run build

pm2 restart wa-akg-business-backend wa-akg-business-frontend
```

**Selalu backup database sebelum upgrade.**

---

## 14. Troubleshooting

### Aplikasi tidak bisa dibuka

| Gejala | Penyebab umum | Solusi |
|---|---|---|
| `ERR_CONNECTION_REFUSED` | Container mati / port salah | `docker compose ps`, cek `.env` |
| Halaman putih, 502 | Frontend belum siap / crash | `docker compose logs frontend` |
| Redirect loop di `/login` | Cookie `access_token` tidak ter-set | Pastikan domain sama (tanpa beda `www`), HTTPS konsisten, `CORS_ORIGIN` benar |
| Login sukses tapi balik ke login | `APP_SECRET` berubah setelah token dibuat | Login ulang; jangan ubah secret tanpa alasan |

### WhatsApp

| Gejala | Solusi |
|---|---|
| QR tidak muncul | `docker compose restart backend`; pastikan folder `sessions/` writable |
| QR muncul lalu "logged out" | Nomor dipakai di WhatsApp Web lain — logout di sana, scan ulang |
| Status connected tapi bot diam | Cek `AI_API_KEY`, lihat log backend |
| Pesan masuk tapi tidak muncul di dashboard | WebSocket gagal — cek blok `location /socket.io/` |
| Putus berulang tiap beberapa menit | Nomor dipakai di perangkat lain, atau sesi korup: hapus isi `sessions/` lalu scan ulang |

### Bot AI

| Gejala | Solusi |
|---|---|
| "Maaf, saya tidak dapat memproses..." | Key/model/base URL salah, atau kuota habis |
| Jawaban tidak sesuai gaya | Perbaiki System Prompt & Business Info |
| Bot tidak tahu jam buka | Isi jam operasional di Business Info, cek `TIMEZONE` |
| Bot mengirim teks padahal minta tombol | Pastikan model mendukung *function calling* |

### Stok

| Gejala | Solusi |
|---|---|
| "File kredensial tidak ditemukan" | Tempel JSON Service Account di panel, atau perbaiki path |
| "Isi JSON Service Account tidak valid" | Copy ulang seluruh isi file `.json` (termasuk kurung kurawal) |
| "Cannot resolve host" | Host database salah / DNS tidak terjangkau dari container |
| "Blocked connection to restricted address" | Host mengarah ke `169.254.x.x` (metadata) — memang diblokir |
| Data kosong padahal ada isinya | Cek nama sheet, baris header, dan huruf kolom (A/B/C) |
| Harga/stok tampil aneh | Pastikan kolom benar; format `50.000` dan `50000` sama-sama didukung |
| Perubahan spreadsheet tidak muncul | Sync otomatis tiap 60 detik — atau klik **Sinkron Sekarang** |

### Build

| Gejala | Solusi |
|---|---|
| `ETXTBSY` saat `npm install` | `docker system prune -af` lalu build ulang |
| Build backend gagal di Baileys | Pastikan `git`, `openssh-client`, `ca-certificates` terpasang di image builder |
| `next build` kehabisan memori | Tambah swap atau set `NODE_OPTIONS=--max-old-space-size=1024` |
| TypeScript error memblok build | `cd backend && npx tsc --noEmit` / `cd frontend && npx tsc --noEmit` untuk daftar error |

### Database

```bash
# Cek file DB (Docker)
docker compose exec backend ls -lh /app/data

# Cek migrasi terakhir
docker compose logs backend | grep -i migrate
```

Jika database korup dan data boleh hilang:

```bash
docker compose down
docker volume rm wa-akg-business_app_data
docker compose up -d --build
```

---

## 15. Checklist Go-Live

- [ ] `.env` final: secret acak & berbeda, `NODE_ENV=production`, `FRONTEND_URL`/`CORS_ORIGIN` = domain HTTPS.
- [ ] Domain + SSL aktif, HTTP → HTTPS redirect.
- [ ] WhatsApp **connected** dan stabil ≥ 30 menit.
- [ ] Bot AI menjawab benar untuk 5 pertanyaan umum.
- [ ] Escalation (`#chatcs` / kata kunci) memindahkan chat ke antrean CS.
- [ ] Stok tersinkron & **Preview** menampilkan harga/stok benar.
- [ ] Pesan interaktif terkirim dan balasan pelanggan terbaca.
- [ ] Password semua akun default sudah diganti.
- [ ] Backup otomatis harian dijadwalkan (`cron`).
- [ ] Monitoring: `docker compose ps` / `pm2 status` + health check `/api/health`.

---

## Lampiran — Referensi Cepat

| Kebutuhan | Perintah |
|---|---|
| Lihat log backend (Docker) | `docker compose logs -f backend` |
| Restart backend (Docker) | `docker compose restart backend` |
| Rebuild penuh | `docker compose up -d --build` |
| Health check | `curl http://127.0.0.1:4005/api/health` |
| Typecheck backend | `cd backend && npx tsc --noEmit` |
| Typecheck frontend | `cd frontend && npx tsc --noEmit` |
| Migrasi DB manual | `cd backend && npx tsx src/db/migrate.ts` |
| Seed manual | `cd backend && npx tsx src/db/seed-runner.ts` |
| Log PM2 | `pm2 logs wa-akg-business-backend` |

Dokumen terkait: [WHATSAPP.md](./WHATSAPP.md) · [STOCK.md](./STOCK.md) · [INTERACTIVE.md](./INTERACTIVE.md) · [CONFIGURATION.md](./CONFIGURATION.md) · [DEPLOYMENT.md](./DEPLOYMENT.md) · [API.md](./API.md)
