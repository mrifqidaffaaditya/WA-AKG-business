# Integrasi Stok

Hubungkan data produk agar bot AI bisa menjawab pertanyaan stok dan harga secara otomatis, dan agar menu interaktif bisa diisi produk nyata.

Sumber data yang didukung:

| Sumber | Cocok untuk | Yang dibutuhkan |
|---|---|---|
| **Google Sheets** | Toko kecil, data diurus manual | Service Account + spreadsheet di-share |
| **MySQL** | Toko dengan aplikasi/ERP sendiri | Host, database, tabel, user read-only |
| **PostgreSQL** | Sama seperti MySQL | Host, database, tabel, user read-only |

Sinkronisasi berjalan otomatis **setiap 60 detik** dan bisa dipicu manual kapan saja.

---

## 1. Panel Admin (cara baru, tanpa JSON)

Buka **Admin Panel → Stok**. Panel terdiri dari tiga bagian:

### a. Kartu Status

| Field | Arti |
|---|---|
| **Status** | `Tersinkron` / `Gagal sync` / `Menyinkronkan` / `Belum aktif` |
| **Terakhir Sync** | Waktu sync terakhir (relatif, mis. "2 menit lalu") |
| **Jumlah Produk** | Banyak baris yang berhasil dibaca |
| **Pesan error** | Alasan kegagalan terakhir, dalam bahasa manusia |

### b. Form Sumber Data

Pilih salah satu kartu sumber, lalu isi field yang muncul. Tidak ada JSON yang perlu ditulis.

**Google Sheets**

| Field | Contoh | Catatan |
|---|---|---|
| Link atau ID Spreadsheet | `https://docs.google.com/spreadsheets/d/1Bxi.../edit` | URL lengkap atau ID saja |
| Nama Sheet | `Stok` | Harus sama persis dengan tab sheet |
| Baris Header | `1` | Baris judul kolom |
| Kolom Nama | `A` | Huruf kolom |
| Kolom Harga | `B` | |
| Kolom Stok | `C` | |
| Path File Service Account | `credentials/service-account.json` | Opsional jika JSON ditempel |
| Atau Tempel JSON Service Account | `{ "type": "service_account", ... }` | **Disarankan** — tidak perlu upload file |

**MySQL / PostgreSQL**

| Field | Contoh |
|---|---|
| Host | `127.0.0.1` atau `db.toko.com` |
| Port | `3306` (MySQL) / `5432` (PostgreSQL) |
| Nama Database | `stok_db` |
| Tabel Produk | `products` |
| Username | `readonly_user` |
| Password | `••••••••` (kosongkan jika tidak diubah) |
| Kolom Nama / Stok / Harga | `nama_produk` / `stok` / `harga` |

### c. Tombol Aksi

| Tombol | Fungsi |
|---|---|
| **Simpan** | Simpan konfigurasi lalu langsung sinkronkan |
| **Tes Koneksi** | Uji konfigurasi **tanpa menyimpan**, tampilkan jumlah baris + contoh produk |
| **Sinkron Sekarang** | Paksa ambil ulang data dari sumber |
| **Preview** | Tabel hasil normalisasi (nama, harga Rupiah, label stok) |

### d. Mode Lanjutan (JSON)

Masih tersedia untuk kebutuhan khusus. Jika dibuka, isi JSON di situ yang dipakai saat Simpan/Tes. Format internal:

```json
{
  "spreadsheet_id": "1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgVE2upms",
  "sheet_name": "Stok",
  "header_row": 1,
  "columns": { "name": "A", "price": "B", "stock": "C" },
  "credentials_json": { "type": "service_account", "...": "..." }
}
```

---

## 2. Google Sheets — Langkah Lengkap

### Langkah 1: Buat Service Account

1. Buka [Google Cloud Console](https://console.cloud.google.com/).
2. Buat project baru (atau pilih yang ada).
3. Aktifkan **Google Sheets API**: **APIs & Services → Library** → cari "Google Sheets API" → **Enable**.
4. Buat Service Account: **APIs & Services → Credentials → Create Credentials → Service Account**.
   - Nama: `wa-akg-stock-reader`
   - Klik **Done** (tidak perlu grant role apa pun).
5. Buat key: klik service account → **Keys → Add Key → Create New Key → JSON** → file `.json` terunduh.

### Langkah 2: Bagikan Spreadsheet

1. Buka spreadsheet → **Share**.
2. Tambahkan email service account (field `client_email` di file JSON), mis. `wa-akg-stock-reader@project.iam.gserviceaccount.com`.
3. Beri akses **Viewer** saja.

### Langkah 3: Isi Panel

1. Tempel **link spreadsheet** ke field pertama.
2. Tempel **seluruh isi file JSON** ke textarea "Atau Tempel JSON Service Account".
3. Isi nama sheet, baris header, dan kolom.
4. Klik **Tes Koneksi** → harus muncul "Ditemukan N baris data".
5. Klik **Simpan**, lalu aktifkan toggle **Aktifkan Sinkronisasi Stok**.

> Jika memilih path file, simpan di `backend/credentials/service-account.json` dan isi field path. Di Docker, file harus berada di dalam volume/container (mount dulu), sehingga **menempel JSON lebih praktis**.

### Format Spreadsheet

| A | B | C |
|---|---|---|
| Nama Produk | Harga | Stok |
| Produk A | 50000 | 100 |
| Produk B | 75000 | 50 |
| Produk C | 25000 | 0 |

- Baris 1 = header (dapat diubah lewat **Baris Header**).
- Huruf kolom dapat diubah lewat field **Kolom Nama/Harga/Stok**.
- Baris tanpa nama produk otomatis dilewati.

---

## 3. Database — Langkah Lengkap

### MySQL

```sql
CREATE TABLE products (
  id INT PRIMARY KEY AUTO_INCREMENT,
  nama_produk VARCHAR(255) NOT NULL,
  stok INT NOT NULL DEFAULT 0,
  harga DECIMAL(12,2)
);

INSERT INTO products (nama_produk, stok, harga) VALUES
  ('Produk A', 100, 50000),
  ('Produk B', 50, 75000);

-- User read-only (disarankan)
CREATE USER 'readonly_user'@'%' IDENTIFIED BY 'password_kuat';
GRANT SELECT ON stok_db.products TO 'readonly_user'@'%';
FLUSH PRIVILEGES;
```

Isi panel: host, port `3306`, database `stok_db`, tabel `products`, user `readonly_user`, kolom `nama_produk` / `stok` / `harga`.

### PostgreSQL

```sql
CREATE TABLE products (
  id SERIAL PRIMARY KEY,
  nama_produk VARCHAR(255) NOT NULL,
  stok INTEGER NOT NULL DEFAULT 0,
  harga NUMERIC(12,2)
);

CREATE USER readonly_user WITH PASSWORD 'password_kuat';
GRANT SELECT ON products TO readonly_user;
```

Isi panel: port `5432`, sisanya sama.

> **Tips Docker:** jika database ada di host dan backend berjalan di container dengan `network_mode: host`, gunakan `127.0.0.1`. Jika memakai bridge network, gunakan `host.docker.internal` (tambahkan `extra_hosts: ["host.docker.internal:host-gateway"]`).

---

## 4. Normalisasi Data

Sistem menerima berbagai nama kolom umum:

| Jenis | Nama kolom yang dikenali |
|---|---|
| Nama produk | `name`, `nama_produk`, `product`, `produk`, `title` |
| Harga | `harga`, `price`, `unit_price`, `harga_jual` |
| Stok | `stok`, `stock`, `qty`, `quantity`, `jumlah` |

Format angka yang didukung: `50000`, `50.000`, `50,000`, `Rp 50.000`, `50.000,00`.

Label stok yang dihasilkan:

| Nilai stok | Label |
|---|---|
| `0` atau kurang | `habis` |
| `1–5` | `stok terbatas (N)` |
| `> 5` | `tersedia (N)` |
| tidak diketahui | *(kosong)* |

---

## 5. Bagaimana Bot Memakai Data Stok

Konteks stok disuntikkan ke system prompt setiap kali bot membalas:

```
[STOK PRODUK]
- Produk A — Rp 50.000 — tersedia (100)
- Produk B — Rp 75.000 — stok terbatas (4)
- Produk C — Rp 25.000 — habis
…dan 12 produk lainnya.
```

Maksimal 40 produk ditampilkan agar prompt tidak membengkak. Jika pelanggan bertanya "Produk A masih ada?", bot menjawab sesuai label di atas.

Data yang sama juga dipakai untuk **Menu dari Stok** di pesan interaktif (lihat [INTERACTIVE.md](./INTERACTIVE.md)).

---

## 6. API

Semua endpoint di bawah butuh JWT `super_admin`.

### `GET /api/admin/stock-config`

```json
{
  "id": "stock_...",
  "source_type": "google_sheets",
  "is_active": true,
  "updated_at": "2026-11-26T09:00:00.000Z",
  "config": { "spreadsheet_id": "1Bxi...", "credentials_json": "***" },
  "fields": {
    "spreadsheetId": "1Bxi...",
    "sheetName": "Stok",
    "headerRow": 1,
    "colName": "A",
    "colPrice": "B",
    "colStock": "C",
    "credentialsPath": "",
    "credentialsJson": ""
  },
  "status": {
    "last_synced_at": "2026-11-26T09:00:00.000Z",
    "last_sync_status": "success",
    "last_sync_error": null,
    "last_item_count": 24,
    "runtime": { "status": "success", "itemCount": 24, "sourceType": "google_sheets" }
  }
}
```

Nilai sensitif (`password`, `credentials_json`, `api_key`, `secret`, `token`) selalu dimask `***`.

### `PUT /api/admin/stock-config`

Terima **salah satu** dari:

```json
{ "source_type": "google_sheets", "is_active": true, "fields": { "spreadsheetId": "...", "sheetName": "Stok", "colName": "A", "colPrice": "B", "colStock": "C" } }
```

atau

```json
{ "source_type": "mysql", "is_active": true, "config_json": { "host": "127.0.0.1", "port": 3306, "database": "stok_db", "table": "products", "user": "readonly_user", "password": "rahasia" } }
```

**Secret aman:** field sensitif yang dikirim kosong atau `***` **tidak** menimpa nilai lama. Jadi menyimpan form tanpa mengisi ulang password tidak akan menghapus password tersimpan.

Respons berisi objek yang sama dengan `GET` (config ter-mask + status sync terbaru).

### `POST /api/admin/stock-config/test`

Uji kandidat konfigurasi tanpa menyimpan:

```json
{ "source_type": "mysql", "fields": { "host": "127.0.0.1", "database": "stok_db", "table": "products", "user": "readonly_user", "password": "rahasia" } }
```

```json
{ "ok": true, "count": 24, "sample": [{ "name": "Produk A", "priceLabel": "Rp 50.000", "stockLabel": "tersedia (100)" }], "source_type": "mysql" }
```

Jika gagal: `{ "ok": false, "count": 0, "sample": [], "error": "..." }`.

### `POST /api/admin/stock-config/sync`

Paksa sinkronisasi konfigurasi tersimpan.

```json
{ "success": true, "status": { "status": "success", "itemCount": 24, "lastSyncedAt": "..." }, "count": 24 }
```

### `GET /api/admin/stock/preview`

Tabel hasil normalisasi:

```json
[ { "name": "Produk A", "price": 50000, "stock": 100, "priceLabel": "Rp 50.000", "stockLabel": "tersedia (100)" } ]
```

### `GET /api/conversations/stock-menu`

Daftar ringkas untuk builder menu interaktif (maks. 30 produk): `{ "items": [{ "id", "name", "price", "stock", "priceLabel", "stockLabel" }] }`.

### `GET /api/v1/stock` & `POST /api/v1/stock/sync`

API publik (API key + scope). `sync` mengembalikan `{ success, message, count, syncedAt, status }` dan memancarkan webhook `stock.updated`.

---

## 7. Caching & Sinkronisasi

- Data disimpan di memori selama **60 detik**; permintaan beruntun tidak memanggil sumber data berulang.
- Sync otomatis berjalan di background tiap 60 detik.
- Jika sync gagal, **cache lama dipertahankan** agar bot tidak tiba-tiba menjawab "semua habis".
- Mengubah konfigurasi atau menekan **Sinkron Sekarang** membersihkan cache dan memaksa ambil ulang.

---

## 8. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| `Spreadsheet ID / URL belum diisi` | Field link kosong | Isi link/ID spreadsheet |
| `File kredensial tidak ditemukan/tidak valid` | Path salah / file tidak ada di container | Tempel JSON di panel |
| `Isi JSON Service Account tidak valid` | Copy JSON terpotong | Salin ulang seluruh isi file `.json` |
| `The caller does not have permission` | Spreadsheet belum di-share ke `client_email` | Share sebagai Viewer |
| `Requested entity was not found` | ID spreadsheet atau nama sheet salah | Cek ulang keduanya |
| `Cannot resolve host` | Host database salah / tidak terjangkau | Cek DNS & jaringan container |
| `Blocked connection to restricted address` | Host mengarah ke `169.254.x.x` | Diblokir sengaja (anti-SSRF) |
| `Access denied for user` | User/password salah | Isi ulang password di panel |
| `Host database belum diisi` | Field host kosong | Isi host |
| `Nama tabel belum diisi` | Field tabel kosong | Isi nama tabel |
| Data kosong padahal ada isinya | Nama sheet/kolom/header salah | Perbaiki field lalu **Tes Koneksi** |
| Harga terbaca `null` | Kolom harga salah atau berisi teks non-angka | Perbaiki kolom / format |
| Perubahan tidak muncul | Cache 60 detik | Tunggu atau **Sinkron Sekarang** |

---

## 9. Keamanan

- Kredensial **tidak pernah** dikirim balik ke frontend dalam bentuk asli (selalu `***`).
- Password tersimpan tidak tertimpa saat form disimpan tanpa mengisi password.
- Gunakan user database **read-only**.
- Jangan beri service account akses **Editor** ke spreadsheet.
- Koneksi ke alamat link-local/metadata (`169.254.0.0/16`, `0.0.0.0/8`, `fe80::/10`) diblokir untuk mencegah SSRF.
- Endpoint `stock-config` hanya untuk `super_admin`.
