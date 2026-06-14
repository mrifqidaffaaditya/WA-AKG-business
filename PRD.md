# Product Requirements Document (PRD)
## WhatsApp CS Management Platform

**Versi:** 1.2.0  
**Tanggal:** 14 Juni 2026  
**Status:** Draft  
**Changelog:**
- v1.1.0 — Tambah sistem notifikasi browser (Push Notification)
- v1.2.0 — Tambah optimisasi returning customer & infinity scroll riwayat chat

---

## 1. Ringkasan Eksekutif

Platform web berbasis multi-user untuk mengelola layanan pelanggan (Customer Service) melalui WhatsApp. Sistem mengintegrasikan chatbot AI sebagai lini pertama respons, mekanisme antrian dan klaim percakapan oleh CS, manajemen stok terintegrasi (Google Sheets & Database), serta konfigurasi persona/perilaku bot melalui dashboard admin.

---

## 2. Latar Belakang & Masalah

Banyak bisnis yang menggunakan WhatsApp sebagai saluran CS menghadapi masalah:
- Tidak ada sistem antrian terstruktur untuk percakapan masuk
- CS kewalahan merespons tanpa prioritas yang jelas
- Informasi stok produk tersebar dan tidak terintegrasi
- Tidak ada mekanisme AI untuk menjawab pertanyaan umum secara otomatis
- Tidak ada visibilitas lintas tim terhadap percakapan yang sedang berjalan

---

## 3. Tujuan Produk

- Mengotomasi respons pertama dengan chatbot AI berbasis OpenAI-compatible API
- Menyediakan sistem antrian dan klaim percakapan untuk tim CS
- Mengintegrasikan data stok secara real-time dari Google Sheets atau database relasional
- Memberikan admin kontrol penuh atas persona, perilaku bot, dan informasi bisnis
- Mendukung multi-user CS dengan role-based access control

---

## 4. Pengguna (User Personas)

### 4.1 Admin Bisnis
- Mengonfigurasi persona dan perilaku chatbot
- Mengelola informasi bisnis dan stok
- Menambah/menghapus akun CS
- Melihat semua percakapan dan log

### 4.2 Customer Service (CS)
- Menerima notifikasi percakapan masuk
- Mengklaim dan menangani percakapan
- Melihat riwayat chat dari bot ke customer

### 4.3 Customer (End User)
- Berinteraksi melalui WhatsApp
- Dilayani terlebih dahulu oleh bot
- Bisa meminta bicara dengan CS menggunakan command `#chatcs`

---

## 5. Alur Sistem (User Flow)

```
Customer kirim pesan ke nomor WA
         ↓
   Bot AI merespons otomatis
         ↓
   Customer bertanya ke bot
         ↓
  [Customer ketik #chatcs]
  atau [Bot deteksi eskalasi]
         ↓
  Customer masuk antrian (Waiting Queue)
         ↓
  Notifikasi broadcast ke semua CS aktif
         ↓
  CS mengklaim percakapan (First-claim)
         ↓
  CS menangani percakapan secara langsung
         ↓
  Percakapan ditutup / diselesaikan
```

---

## 6. Fitur Utama

### 6.1 WhatsApp Gateway Integration

- **Library:** WhatsApp Web.js atau Baileys (dapat dikonfigurasi, default Baileys karena lebih stabil untuk multi-session)
- **Multi-session support** untuk kemungkinan penambahan nomor di masa depan
- **QR Code login** melalui dashboard
- **Status koneksi** real-time di dashboard
- **Webhook/event handler** untuk pesan masuk, status pesan, dan disconnect

### 6.2 Chatbot AI

- Berbasis **OpenAI-compatible completion API** (dapat diganti provider lain via `.env`)
- Konfigurasi endpoint, model, dan API key melalui environment variable
- Admin dapat mengatur:
  - **Persona/Soul:** nama bot, gaya bicara, karakter
  - **Instruksi sistem (system prompt):** perilaku dasar bot
  - **Informasi bisnis:** jam operasional, alamat, kebijakan, FAQ
  - **Konteks stok:** bot dapat menjawab ketersediaan produk secara real-time
- Bot **otomatis mendeteksi** kata kunci atau permintaan eskalasi ke CS
- Command khusus customer: **`#chatcs`** → langsung masuk antrian, broadcast notif ke CS

### 6.3 Sistem Antrian & Manajemen Percakapan

- **Waiting Queue:** daftar customer yang menunggu dilayani CS
- **Broadcast notifikasi** ke semua CS yang sedang aktif/login saat ada customer baru di antrian
- **Claim system:** CS bisa mengklaim percakapan (percakapan terikat ke CS tersebut sebagai penanggun jawab)
- **Open access:** CS lain tetap bisa membaca percakapan meski sudah diklaim
- **Transfer:** CS bisa mentransfer percakapan ke CS lain
- **Status percakapan:** `bot`, `waiting`, `active`, `resolved`
- **Riwayat chat lengkap** dari awal (termasuk sesi bot) tersedia untuk semua CS

### 6.4 Dashboard Web App

#### Panel CS
- Daftar percakapan: Tab `Waiting`, `My Chats`, `All Chats`
- Notifikasi real-time (WebSocket / SSE)
- Jendela chat langsung dalam dashboard
- Badge jumlah antrian

#### Panel Admin
- **Bot Configuration:** sistem prompt, persona, soul, instruksi khusus
- **Business Info:** informasi yang diinject ke konteks bot
- **Stok Management:** konfigurasi sumber data stok
- **User Management:** CRUD akun CS, assign role
- **Log & History:** riwayat semua percakapan
- **Gateway Status:** koneksi WhatsApp, QR scan, reconnect

### 6.5 Integrasi Stok

#### Google Sheets
- Otentikasi menggunakan **Service Account (JSON credential)** — tidak perlu OAuth refresh berulang
- Admin mengonfigurasi:
  - **Spreadsheet ID**
  - **Sheet name**
  - **Mapping kolom:** kolom nama produk, kolom stok, kolom harga, dsb. (fleksibel, bisa diatur dari dashboard)
  - **Header row** (baris ke berapa header dimulai)
- Data stok di-cache dan di-refresh secara periodik (interval dapat dikonfigurasi)
- Bot dapat membaca stok secara real-time saat menjawab pertanyaan customer

#### Database Relasional
- Support: **MySQL/MariaDB** dan **PostgreSQL**
- Konfigurasi via dashboard atau `.env`
- Admin mengonfigurasi:
  - Connection string / host, port, user, password, database name
  - Nama tabel stok
  - Mapping kolom (nama produk, jumlah stok, harga, dll.)
- Dapat digunakan sebagai alternatif atau pelengkap Google Sheets

### 6.6 Autentikasi & Keamanan

- **JWT (JSON Web Token)** dengan access token (short-lived) + refresh token (long-lived, stored httpOnly cookie)
- **Bcrypt** untuk hashing password
- **Role-Based Access Control (RBAC):**
  - `super_admin`: akses penuh termasuk konfigurasi sistem
  - `admin`: manajemen bot, stok, user CS
  - `cs`: akses ke percakapan dan antrian
- **Rate limiting** pada endpoint login (brute-force protection)
- **CORS policy** ketat
- **HTTPS-only** di production
- **Session invalidation** saat logout atau perubahan password
- **Audit log** untuk aksi sensitif (perubahan konfigurasi bot, hapus user, dsb.)

### 6.7 Sistem Notifikasi Browser (Push Notification)

Notifikasi browser memastikan CS dan Admin tetap mendapat informasi meski tab dashboard tidak sedang aktif atau jendela browser diminimize.

#### Teknologi
- **Web Push API** (standar browser modern) dengan library **web-push** di sisi server
- **Service Worker** di sisi frontend untuk menerima dan menampilkan notifikasi saat halaman tidak aktif
- **VAPID (Voluntary Application Server Identification)** untuk otentikasi push server ke browser

#### Alur Subscription
```
CS/Admin login ke dashboard
         ↓
Browser meminta izin notifikasi (Notification.requestPermission())
         ↓
User menyetujui izin
         ↓
Browser menghasilkan PushSubscription object
(endpoint + keys: p256dh + auth)
         ↓
Frontend mengirim PushSubscription ke backend
POST /api/notifications/subscribe
         ↓
Backend menyimpan subscription ke tabel push_subscriptions
         ↓
Saat ada event (pesan baru, antrian, dll)
Backend mengirim web push ke semua subscription aktif user terkait
         ↓
Service Worker menerima push event → tampilkan notifikasi OS
```

#### Jenis Notifikasi

| Notifikasi | Target | Trigger | Isi |
|---|---|---|---|
| Customer baru di antrian | Semua CS aktif | `#chatcs` / eskalasi bot | "🔔 [Nama/No WA] menunggu dilayani CS" |
| Pesan baru di chat aktif | CS yang mengklaim | Customer kirim pesan | "💬 [Nama Customer]: [preview pesan]" |
| Chat diklaim CS lain | CS lain yang memantau | CS mengklaim percakapan | "✅ [Nama CS] mengambil percakapan [Customer]" |
| Chat ditransfer ke CS | CS tujuan transfer | Aksi transfer | "📨 Percakapan dari [Customer] dialihkan ke Anda" |
| WA Gateway disconnect | Admin | Koneksi WA terputus | "⚠️ WhatsApp Gateway terputus, perlu reconnect" |
| Antrian menumpuk | Admin | Queue > threshold tertentu | "🚨 [N] customer menunggu, tidak ada CS aktif" |

#### Konfigurasi Notifikasi per User
Setiap user (CS/Admin) dapat mengatur preferensi notifikasi dari halaman profil/settings dashboard:
- Toggle aktif/nonaktif per jenis notifikasi
- Pilihan mode: **semua perangkat** (multi-device push) atau **perangkat ini saja**
- Notifikasi dapat dinonaktifkan sementara (Do Not Disturb) dengan jadwal jam tertentu

#### Perilaku Notifikasi
- Jika **tab dashboard aktif dan terfokus** → notifikasi browser tidak ditampilkan, cukup in-app toast/badge
- Jika **tab tidak aktif / browser minimize** → notifikasi OS muncul via Service Worker
- Notifikasi memiliki **action button**: misal "Lihat Chat" yang langsung membuka percakapan
- Notifikasi otomatis hilang setelah 10 detik (configurable), atau saat user klik
- Maksimal **1 notifikasi per percakapan dalam 30 detik** (debounce) untuk mencegah spam notif saat customer kirim pesan cepat berturut-turut

#### Multi-Device Support
- Satu akun CS dapat subscribe dari beberapa perangkat/browser
- Semua subscription aktif dari akun yang sama akan menerima push secara bersamaan
- Saat user logout, subscription dari perangkat tersebut dihapus dari server

#### Fallback
- Jika browser tidak mendukung Web Push API (sangat jarang di browser modern) → fallback ke **in-app notification only** (WebSocket toast)
- Jika push gagal terkirim (subscription expired/invalid) → server otomatis menghapus subscription tersebut dari database

### 6.8 Optimisasi Returning Customer

Saat customer yang **pernah chat sebelumnya** mengirim pesan baru, sistem tidak memperlakukan mereka sebagai stranger. Riwayat interaksi sebelumnya dimanfaatkan untuk memberikan konteks lebih baik ke bot dan CS.

#### Deteksi Returning Customer
- Identifikasi berdasarkan **nomor WhatsApp** — unik per customer
- Saat pesan masuk, backend langsung query: apakah nomor ini pernah memiliki `conversation` sebelumnya?
- Jika ya → customer dikategorikan sebagai **returning customer**

#### Konteks untuk Chatbot AI
- Bot menerima **ringkasan sesi terakhir** sebagai tambahan system prompt (bukan seluruh history mentah):
  - Nama customer (jika pernah disebutkan)
  - Topik utama percakapan sebelumnya
  - Status terakhir (resolved, transferred, dsb.)
  - Tanggal sesi terakhir
- Ringkasan dibuat otomatis oleh AI saat percakapan di-resolve dan disimpan ke kolom `last_summary` di tabel `customers`
- Bot dapat menyapa customer secara personal: *"Halo [Nama], selamat datang kembali!"*
- Ringkasan diinjeksikan ke konteks bot **hanya jika sesi terakhir < 90 hari** (configurable via env `CONTEXT_EXPIRY_DAYS`)

#### Tampilan di Dashboard CS
- Label **"Pelanggan Lama"** / badge khusus pada percakapan dari returning customer
- CS dapat melihat **ringkasan sesi-sesi sebelumnya** dalam satu panel samping tanpa harus scroll manual ke atas ribuan pesan
- Jumlah total sesi sebelumnya ditampilkan: *"3 percakapan sebelumnya"*

#### Tabel `customers`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID | Primary key |
| wa_number | VARCHAR UNIQUE | Nomor WA customer |
| display_name | VARCHAR | Nama dari profil WA atau disebut sendiri |
| total_sessions | INT | Jumlah total percakapan sepanjang waktu |
| last_conversation_id | UUID FK | ID percakapan terakhir |
| last_summary | TEXT | Ringkasan AI dari sesi terakhir |
| last_active_at | TIMESTAMP | Waktu pesan terakhir |
| created_at | TIMESTAMP | Pertama kali chat |

---

### 6.9 Infinity Scroll Riwayat Chat & Daftar Percakapan

Menghindari load semua data sekaligus dari database untuk menjaga performa dashboard, terutama saat riwayat percakapan dan pesan sudah dalam jumlah besar.

#### A. Infinity Scroll — Riwayat Pesan dalam Percakapan (Chat Window)

**Masalah:** Satu percakapan bisa berisi ratusan hingga ribuan pesan (terutama sesi panjang dengan bot). Memuat semuanya sekaligus memberatkan browser dan database.

**Solusi: Cursor-based Pagination**

- Saat CS membuka percakapan, sistem hanya memuat **N pesan terbaru** (default: 30 pesan) dari bawah ke atas
- Untuk memuat pesan lebih lama, CS **scroll ke atas** → trigger load batch berikutnya
- Menggunakan **cursor pagination** berbasis `created_at` + `id` (bukan offset), agar tidak ada duplikasi/skip pesan meski ada pesan baru masuk secara bersamaan
- Indikator loading muncul di bagian atas chat saat fetch sedang berjalan
- Posisi scroll dipertahankan setelah batch baru dimuat (tidak loncat ke atas)
- Jika sudah mencapai pesan pertama → indikator "Awal percakapan" ditampilkan, tidak ada fetch lagi

**Query Parameter:**
```
GET /api/conversations/:id/messages?cursor=<message_id>&limit=30&direction=older
```

**Response:**
```json
{
  "messages": [...],
  "next_cursor": "msg_uuid_xxx",
  "has_more": true
}
```

#### B. Infinity Scroll — Daftar Percakapan (Conversation List)

**Masalah:** Bisnis yang aktif bisa memiliki ribuan percakapan. Memuat semua ke sidebar membebani performa.

**Solusi: Cursor-based Pagination pada List**

- Sidebar daftar percakapan memuat **20 item pertama** saat dibuka
- Saat CS scroll ke bawah mendekati ujung list → otomatis fetch 20 item berikutnya
- Sorting default: **terbaru aktif di atas** (`updated_at DESC`)
- Filter tetap bekerja dengan pagination: `?status=waiting&cursor=...&limit=20`
- Pesan baru yang masuk real-time via WebSocket **disisipkan ke posisi teratas** tanpa reload ulang seluruh list

**Query Parameter:**
```
GET /api/conversations?status=waiting&cursor=<conversation_id>&limit=20
```

#### C. Optimisasi Database

- Index wajib pada tabel `messages`: `(conversation_id, created_at DESC, id DESC)`
- Index wajib pada tabel `conversations`: `(status, updated_at DESC)`
- Index pada tabel `customers`: `(wa_number)` — untuk lookup returning customer
- Query pesan menggunakan `WHERE created_at < :cursor_time AND id < :cursor_id` — tidak pernah `OFFSET` untuk menghindari full table scan
- **Soft cap**: jika satu percakapan melampaui **5.000 pesan**, sistem otomatis menutup sesi tersebut dan membuat percakapan baru yang terhubung ke customer yang sama (linked via `customer_id`)

#### D. Perilaku UX

| Kondisi | Perilaku |
|---|---|
| Buka percakapan pertama kali | Load 30 pesan terbaru, scroll posisi di bawah |
| Scroll ke atas mendekati top | Fetch 30 pesan lebih lama, scroll position dipertahankan |
| Pesan baru masuk via WebSocket | Append di bawah tanpa refetch, auto-scroll jika CS sudah di bawah |
| CS sedang baca pesan lama (scroll atas) | Pesan baru masuk → badge "1 pesan baru ↓" tanpa auto-scroll |
| Sudah di pesan paling awal | Tampilkan label "Awal percakapan", hentikan fetch |
| Daftar percakapan scroll ke bawah | Fetch halaman berikutnya, append ke list |

---

```env
# App
APP_PORT=4040
APP_SECRET=your_jwt_secret
NODE_ENV=production

# WhatsApp Gateway
WA_LIBRARY=baileys  # atau whatsapp-web.js
WA_SESSION_PATH=./sessions

# AI Provider (OpenAI-compatible)
AI_BASE_URL=https://api.openai.com/v1
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
AI_MAX_TOKENS=1024

# Database Utama (App)
DB_TYPE=postgres  # atau mysql
DB_HOST=localhost
DB_PORT=5432
DB_NAME=wa_akg_db
DB_USER=wa_akg_user
DB_PASS=secret

# Stok via DB (opsional)
STOCK_DB_TYPE=mysql
STOCK_DB_HOST=localhost
STOCK_DB_PORT=3306
STOCK_DB_NAME=stok_db
STOCK_DB_USER=root
STOCK_DB_PASS=secret
STOCK_TABLE=products
STOCK_COL_NAME=nama_produk
STOCK_COL_QTY=stok
STOCK_COL_PRICE=harga

# Google Sheets (opsional)
GSHEET_CREDENTIALS_PATH=./credentials/service-account.json
GSHEET_SPREADSHEET_ID=1BxiMV...
GSHEET_SHEET_NAME=Stok
GSHEET_HEADER_ROW=1
GSHEET_COL_NAME=A
GSHEET_COL_QTY=B
GSHEET_COL_PRICE=C
# Returning Customer
CONTEXT_EXPIRY_DAYS=90         # batas hari ringkasan sesi lama masih diinjeksikan ke bot

# Pagination
MESSAGES_PAGE_SIZE=30          # jumlah pesan per batch infinity scroll
CONVERSATIONS_PAGE_SIZE=20     # jumlah percakapan per batch di sidebar
MESSAGES_SOFT_CAP=5000         # batas pesan per sesi sebelum auto-close & buat sesi baru
 (generate dengan: npx web-push generate-vapid-keys)
VAPID_PUBLIC_KEY=BExamplePublicKey...
VAPID_PRIVATE_KEY=ExamplePrivateKey...
VAPID_SUBJECT=mailto:admin@yourdomain.com

# Notifikasi
NOTIF_QUEUE_THRESHOLD=5        # jumlah antrian sebelum alert ke admin
NOTIF_DEBOUNCE_SECONDS=30      # interval minimum notif per percakapan


---

## 8. Arsitektur Sistem

```
┌─────────────────────────────────────────────┐
│              Web App (Frontend)              │
│         React / Next.js + Tailwind           │
└────────────────────┬────────────────────────┘
                     │ REST API + WebSocket
┌────────────────────▼────────────────────────┐
│              Backend (Node.js)               │
│         Express / Fastify + Socket.io        │
│                                             │
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
      ├── PostgreSQL / MySQL (App DB)
      ├── Google Sheets API (Service Account)
      ├── Stock DB (MySQL/PostgreSQL)
      └── OpenAI-compatible API (AI Provider)
```

---

## 9. Model Data (Ringkasan)

### Tabel `users`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID | Primary key |
| name | VARCHAR | Nama CS/Admin |
| email | VARCHAR | Email login |
| password_hash | VARCHAR | Bcrypt hash |
| role | ENUM | super_admin, admin, cs |
| is_active | BOOLEAN | Status aktif |
| created_at | TIMESTAMP | |

### Tabel `conversations`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID | Primary key |
| wa_number | VARCHAR | No WA customer |
| customer_name | VARCHAR | Nama customer (dari WA profile) |
| status | ENUM | bot, waiting, active, resolved |
| claimed_by | UUID FK | CS yang mengklaim |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### Tabel `messages`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID | Primary key |
| conversation_id | UUID FK | |
| sender | ENUM | customer, bot, cs |
| cs_id | UUID FK nullable | Jika sender = cs |
| content | TEXT | Isi pesan |
| wa_message_id | VARCHAR | ID pesan di WA |
| created_at | TIMESTAMP | |

### Tabel `bot_config`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID | Primary key |
| persona_name | VARCHAR | Nama bot |
| system_prompt | TEXT | Instruksi utama |
| business_info | TEXT | Info bisnis untuk konteks |
| escalation_keywords | TEXT | Kata kunci eskalasi ke CS |
| updated_by | UUID FK | |
| updated_at | TIMESTAMP | |

### Tabel `push_subscriptions`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID FK | Akun CS/Admin pemilik subscription |
| endpoint | TEXT | Push endpoint URL dari browser |
| p256dh | TEXT | Public key enkripsi |
| auth | TEXT | Auth secret |
| user_agent | VARCHAR | Identifikasi perangkat/browser |
| created_at | TIMESTAMP | |
| last_used_at | TIMESTAMP | Update tiap push berhasil |

### Tabel `notification_preferences`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID | Primary key |
| user_id | UUID FK | |
| notif_type | VARCHAR | Jenis notifikasi (lihat 6.7) |
| is_enabled | BOOLEAN | Default: true |
| dnd_start | TIME nullable | Jam mulai Do Not Disturb |
| dnd_end | TIME nullable | Jam selesai Do Not Disturb |

### Tabel `stock_config`
| Kolom | Tipe | Keterangan |
|---|---|---|
| id | UUID | Primary key |
| source_type | ENUM | google_sheets, mysql, postgresql |
| config_json | JSONB | Konfigurasi koneksi & mapping kolom |
| is_active | BOOLEAN | |
| updated_at | TIMESTAMP | |

---

## 10. API Endpoint (Ringkasan)

### Auth
- `POST /api/auth/login` — Login, return JWT + refresh token
- `POST /api/auth/refresh` — Refresh access token
- `POST /api/auth/logout` — Invalidate session

### Conversations
- `GET /api/conversations` — List percakapan dengan cursor pagination (`?status=&cursor=&limit=`)
- `GET /api/conversations/:id` — Detail percakapan (tanpa pesan, metadata saja)
- `GET /api/conversations/:id/messages` — Pesan dengan cursor pagination (`?cursor=&limit=&direction=older`)
- `POST /api/conversations/:id/claim` — CS mengklaim percakapan
- `POST /api/conversations/:id/transfer` — Transfer ke CS lain
- `POST /api/conversations/:id/resolve` — Tutup percakapan (trigger pembuatan ringkasan AI)

### Customers
- `GET /api/customers/:wa_number` — Data customer + total sesi + ringkasan sesi terakhir

### Messages
- `POST /api/conversations/:id/messages` — CS kirim pesan ke customer


- `GET /api/admin/bot-config` — Ambil konfigurasi bot
- `PUT /api/admin/bot-config` — Update konfigurasi bot

### Stock Config (Admin)
- `GET /api/admin/stock-config` — Ambil konfigurasi stok
- `PUT /api/admin/stock-config` — Update konfigurasi stok
- `GET /api/admin/stock/preview` — Preview data stok dari sumber aktif

### Users (Admin)
- `GET /api/admin/users` — List semua user
- `POST /api/admin/users` — Tambah user CS
- `PUT /api/admin/users/:id` — Edit user
- `DELETE /api/admin/users/:id` — Hapus user

### Notifikasi Browser
- `POST /api/notifications/subscribe` — Daftarkan PushSubscription dari browser
- `DELETE /api/notifications/unsubscribe` — Hapus subscription perangkat saat ini
- `GET /api/notifications/vapid-public-key` — Ambil VAPID public key untuk frontend
- `GET /api/notifications/preferences` — Ambil preferensi notifikasi user
- `PUT /api/notifications/preferences` — Update preferensi notifikasi user

### Gateway
- `GET /api/gateway/status` — Status koneksi WA
- `GET /api/gateway/qr` — Ambil QR code untuk login WA
- `POST /api/gateway/disconnect` — Disconnect sesi WA

---

## 11. Real-time Events (WebSocket)

| Event | Arah | Payload |
|---|---|---|
| `conversation:new` | Server → CS | Data percakapan baru |
| `conversation:claimed` | Server → CS | ID percakapan + CS yang klaim |
| `conversation:message` | Server → CS | Pesan baru di percakapan |
| `conversation:status` | Server → CS | Perubahan status percakapan |
| `queue:update` | Server → CS | Jumlah antrian terkini |
| `gateway:status` | Server → Admin | Status koneksi WA berubah |
| `notification:push_failed` | Server → Admin | Subscription expired/invalid dihapus |
| `notification:queue_alert` | Server → Admin | Antrian melebihi threshold |

---

## 12. Kriteria Penerimaan (Acceptance Criteria)

- [ ] Returning customer dikenali dari nomor WA dan bot menyapa secara personal menggunakan nama/konteks sesi sebelumnya
- [ ] Ringkasan sesi dibuat otomatis oleh AI saat percakapan di-resolve dan tersimpan ke database
- [ ] Dashboard CS menampilkan badge "Pelanggan Lama" dan jumlah sesi sebelumnya
- [ ] Riwayat pesan dalam chat window hanya memuat 30 pesan terbaru saat pertama dibuka
- [ ] Scroll ke atas di chat window memuat 30 pesan lebih lama tanpa mengubah posisi scroll yang sedang dilihat
- [ ] Pesan baru masuk via WebSocket disisipkan di bawah tanpa reload; jika CS sedang scroll atas, muncul badge "pesan baru ↓"
- [ ] Daftar percakapan di sidebar memuat 20 item per batch dan fetch otomatis saat scroll ke bawah
- [ ] Query pesan menggunakan cursor-based pagination (bukan OFFSET) untuk performa konsisten
- [ ] Customer mengirim pesan → bot merespons dalam < 3 detik
- [ ] Notifikasi browser muncul dengan action button "Lihat Chat" yang langsung membuka percakapan terkait
- [ ] Satu akun CS yang login di 2 perangkat berbeda keduanya menerima push notification
- [ ] Notifikasi tidak muncul lebih dari 1 kali per 30 detik untuk percakapan yang sama (debounce)
- [ ] User dapat menonaktifkan jenis notifikasi tertentu dari halaman preferensi
- [ ] Subscription yang sudah tidak valid otomatis dihapus dari database
- [ ] Admin menerima notifikasi saat WA Gateway terputus
- [ ] Admin menerima alert saat antrian melebihi threshold yang dikonfigurasi
- [ ] Customer mengetik `#chatcs` → muncul notifikasi di semua CS yang online dalam < 2 detik
- [ ] CS dapat mengklaim percakapan dan melanjutkan chat tanpa kehilangan riwayat
- [ ] Admin dapat mengubah persona bot dan perubahan berlaku pada sesi chat berikutnya
- [ ] Stok dari Google Sheets dapat diakses bot tanpa re-autentikasi OAuth
- [ ] Data stok dapat dikonfigurasi kolom-kolomnya dari dashboard (fleksibel)
- [ ] Login gagal 5x berturut-turut → akun dikunci sementara
- [ ] JWT refresh token dapat diinvalidasi saat logout
- [ ] Semua aksi admin tercatat di audit log

---

## 13. Non-Functional Requirements

| Aspek | Target |
|---|---|
| Uptime | 99.5% |
| Latensi respons bot | < 3 detik (tergantung AI provider) |
| Latensi notifikasi real-time | < 2 detik |
| Kapasitas concurrent CS | Minimal 50 user |
| Kapasitas percakapan aktif | Minimal 500 concurrent |
| Latensi load pesan (per batch) | < 300ms untuk 30 pesan (dengan index) |
| Latensi load daftar percakapan | < 200ms per halaman (20 item) |

---

## 14. Tech Stack Rekomendasi

| Layer | Teknologi |
|---|---|
| Frontend | Next.js 14+ (App Router), Tailwind CSS, Socket.io-client |
| Backend | Node.js, Fastify atau Express, Socket.io |
| WA Gateway | Baileys (direkomendasikan) |
| Database App | PostgreSQL |
| ORM | Prisma atau Drizzle |
| Auth | JWT + bcrypt |
| AI Provider | OpenAI-compatible (configurable via .env) |
| Google Sheets | googleapis (Service Account) |
| Push Notification | web-push (VAPID), Service Worker API |
| Cache & Queue | BullMQ + Redis (ringkasan AI async, cache stok) |
| Deployment | Docker Compose |

---

## 15. Milestone & Prioritas

### Phase 1 — Core (MVP)
- [ ] Auth sistem (login, JWT, RBAC)
- [ ] Integrasi Baileys (WA Gateway, QR login)
- [ ] Chatbot AI (sistem prompt, OpenAI API)
- [ ] Alur bot → antrian → CS (claim system)
- [ ] Dashboard CS (list chat, klaim, balas)
- [ ] Command `#chatcs`
- [ ] Notifikasi real-time (WebSocket)
- [ ] Sistem notifikasi browser (Web Push / Service Worker, izin & subscription)
- [ ] Preferensi notifikasi per user (enable/disable per jenis)
- [ ] Infinity scroll pesan dalam chat window (cursor-based pagination)
- [ ] Infinity scroll daftar percakapan di sidebar

### Phase 2 — Admin, Stok & Returning Customer
- [ ] Panel admin konfigurasi bot (persona, system prompt, info bisnis)
- [ ] Integrasi Google Sheets (Service Account, mapping kolom fleksibel)
- [ ] Integrasi database stok (MySQL/PostgreSQL)
- [ ] Preview stok dari dashboard
- [ ] Sistem returning customer (deteksi, ringkasan AI, badge di dashboard)
- [ ] Auto-generate ringkasan sesi saat percakapan di-resolve (async via BullMQ)

### Phase 3 — Polish & Produksi
- [ ] Audit log
- [ ] Transfer percakapan antar CS
- [ ] Rate limiting & brute-force protection
- [ ] Auto-close sesi & buat sesi baru saat pesan melampaui soft cap (5.000)
- [ ] Docker Compose deployment
- [ ] Dokumentasi setup & konfigurasi

---

## 16. Risiko & Mitigasi

| Risiko | Mitigasi |
|---|---|
| WhatsApp memblokir nomor karena otomasi | Gunakan Baileys dengan session persistence; hindari spam; tambahkan delay natural antar pesan |
| Google Sheets credential bocor | Simpan credential di server, tidak pernah dikirim ke frontend; enkripsi di rest |
| AI provider down | Fallback message ke customer; alert ke admin |
| Database stok tidak sinkron | Cache dengan TTL + manual refresh endpoint |
| Push subscription expired tanpa diketahui | Server hapus subscription otomatis saat push gagal (410 Gone); frontend re-subscribe saat user buka dashboard |
| Ringkasan AI gagal dibuat saat resolve | Job retry via BullMQ; CS tetap bisa resolve meski ringkasan gagal, job di-queue ulang hingga 3x |
| Customer ganti nomor WA | Tidak otomatis terdeteksi sebagai returning; CS bisa merge manual via dashboard |
| Cursor pagination tidak konsisten saat pesan baru masuk bersamaan | Gunakan keyset pagination `(created_at, id)` yang stabil; pesan baru hanya append via WebSocket |

---

*Dokumen ini merupakan dasar perencanaan teknis dan produk. Detail implementasi dapat berubah sesuai kebutuhan tim development.*
