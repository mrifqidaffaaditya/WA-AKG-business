# Pesan Interaktif (Tombol & Menu)

WA-AKG Business bisa mengirim **pesan interaktif native WhatsApp**: tombol balasan cepat, tombol link, tombol telepon, tombol salin kode, dan menu daftar (single select). Fitur ini dipakai untuk:

- **Konfirmasi** pesanan ("Ya, Lanjutkan" / "Batalkan")
- **Penawaran** (link promo + salin kode + tombol minat)
- **Menu / katalog** (daftar produk, bisa diisi otomatis dari data stok)
- **Follow-up** ("Sudah cukup" / "Masih ada pertanyaan")

Tersedia di tiga tempat: **panel CS**, **bot AI**, dan **REST API v1**.

---

## 1. Cara Pakai di Panel CS

1. Buka sebuah percakapan di dashboard CS.
2. Klik ikon **Sparkles** di kiri kolom ketik (sebelah ikon lampiran).
3. Pilih **Template Cepat**:

| Template | Isi |
|---|---|
| Konfirmasi | 3 tombol: Ya, Lanjutkan / Batalkan / Tanya CS |
| Penawaran | Buka link + salin kode promo + "Saya Tertarik" |
| Menu dari Stok | Daftar produk otomatis dari integrasi stok (maks. 10) |
| Menu Layanan | Daftar pilihan umum (info produk, cara pesan, hubungi CS) |
| Follow-up | Sudah cukup / masih ada pertanyaan / hubungi saya |

4. Atau susun manual:
   - **Mode Tombol** — sampai 10 tombol, masing-masing dengan tipe dan nilainya.
   - **Mode Daftar** — teks tombol pembuka, judul bagian, dan baris pilihan (judul + deskripsi). Tombol **Isi dari Stok** mengisi daftar dari data produk.
5. Klik **Kirim**.

Jika percakapan masih berstatus `bot` atau `waiting`, pengiriman otomatis **mengklaim** percakapan tersebut untuk CS yang mengirim.

Pesan yang terkirim tersimpan di riwayat dengan penanda `media_type = "interactive"`, sehingga muncul badge **Pesan interaktif** di chat dan tetap terbaca oleh bot sebagai konteks.

---

## 2. Endpoint Panel CS

### `POST /api/conversations/:id/interactive`

Autentikasi: JWT (header `Authorization: Bearer <accessToken>` atau cookie `access_token`).
Akses: `super_admin`, `admin`, dan CS pemilik percakapan (atau percakapan berstatus `bot`/`waiting`).

**Body (mode tombol):**

```json
{
  "title": "Konfirmasi Pesanan",
  "body": "Halo Kak, apakah pesanan ini ingin dilanjutkan?",
  "footer": "Pilih salah satu tombol di bawah",
  "buttons": [
    { "type": "quick_reply", "displayText": "✅ Ya, Lanjutkan", "id": "confirm_yes" },
    { "type": "quick_reply", "displayText": "❌ Batalkan", "id": "confirm_no" },
    { "type": "cta_url", "displayText": "🌐 Lihat Katalog", "url": "https://toko.example.com" }
  ]
}
```

**Body (mode daftar/menu):**

```json
{
  "title": "Katalog Produk",
  "body": "Silakan pilih produk yang ingin dipesan:",
  "footer": "Harga dapat berubah",
  "buttons": [
    {
      "type": "single_select",
      "title": "📋 Lihat Produk",
      "sections": [
        {
          "title": "Produk Tersedia",
          "rows": [
            { "id": "produk_1", "title": "Kopi Arabika 250g", "description": "Rp85.000 • tersedia (12)" },
            { "id": "produk_2", "title": "Kopi Robusta 250g", "description": "Rp65.000 • stok terbatas (3)" }
          ]
        }
      ]
    }
  ]
}
```

**Shortcut `options`** (disederhanakan — ≤3 opsi menjadi tombol, >3 otomatis menjadi daftar):

```json
{
  "title": "Menu",
  "body": "Mau yang mana?",
  "options": [
    { "label": "Produk A", "value": "a", "description": "Rp50.000" },
    { "label": "Produk B", "value": "b", "description": "Rp75.000" },
    { "label": "Produk C", "value": "c" },
    { "label": "Produk D", "value": "d" }
  ]
}
```

**Respons `201`:**

```json
{
  "id": "msg_...",
  "conversation_id": "conv_...",
  "sender": "cs",
  "content": "Halo Kak, apakah pesanan ini ingin dilanjutkan?\n\n• ✅ Ya, Lanjutkan\n• ❌ Batalkan",
  "content_type": "text",
  "media_type": "interactive",
  "wa_message_id": "3EB0...",
  "created_at": "2026-11-26T09:00:00.000Z",
  "cs_name": "Rina"
}
```

**Error yang mungkin muncul:**

| Status | Penyebab |
|---|---|
| `400` | `body`/`title` kosong, atau tidak ada tombol/pilihan |
| `403` | CS mengirim ke percakapan milik CS lain yang sudah aktif |
| `404` | ID percakapan tidak ada |
| `502` | Gagal kirim ke WhatsApp (gateway belum tersambung) |

### `GET /api/conversations/stock-menu`

Dipakai modal interaktif untuk mengisi menu dari stok.

```json
{
  "items": [
    {
      "id": "produk_1",
      "name": "Kopi Arabika 250g",
      "price": 85000,
      "stock": 12,
      "priceLabel": "Rp 85.000",
      "stockLabel": "tersedia (12)"
    }
  ]
}
```

---

## 3. Bot AI Mengirim Tombol Sendiri

Bot punya tool `kirim_pilihan_interaktif`. Model memanggilnya saat pelanggan butuh memilih menu, mengonfirmasi pesanan, atau menerima penawaran.

Parameter tool:

```json
{
  "title": "Konfirmasi",
  "body": "Apakah Anda ingin melanjutkan pesanan?",
  "footer": "Pilih salah satu",
  "options": [
    { "label": "Ya, Lanjutkan", "value": "confirm_yes" },
    { "label": "Batalkan", "value": "confirm_no" }
  ]
}
```

Aturan yang ditanam di system prompt:

- 2–10 opsi, label singkat dan jelas.
- **Hanya** untuk menu/katalog, konfirmasi, atau penawaran — bukan obrolan biasa.
- Jika pengiriman interaktif gagal, sistem otomatis fallback ke teks biasa (pesan tidak hilang).

Hasil dari `generateBotResponse()`:

```ts
{ response: string, shouldEscalate: boolean, interactive?: InteractiveMessagePayload }
```

---

## 4. REST API v1 (Integrasi Eksternal)

### `POST /api/v1/messages/interactive`

Autentikasi: API key dengan scope `messages:send`.

```bash
curl -X POST https://wa.domain-anda.com/api/v1/messages/interactive \
  -H "Authorization: Bearer wak_live_xxxxxxxx" \
  -H "Content-Type: application/json" \
  -d '{
    "to": "6281234567890",
    "title": "Konfirmasi",
    "body": "Lanjutkan pesanan?",
    "options": [
      { "label": "Ya", "value": "yes" },
      { "label": "Tidak", "value": "no" }
    ]
  }'
```

Respons `200`:

```json
{
  "success": true,
  "messageId": "msg_...",
  "conversationId": "conv_...",
  "waMessageId": "3EB0...",
  "to": "6281234567890",
  "sentAt": "2026-11-26T09:00:00.000Z"
}
```

Percakapan dan customer dibuat otomatis jika belum ada. Event webhook `message.sent` juga dipancarkan.

---

## 5. Balasan Pelanggan

Saat pelanggan menekan tombol atau memilih baris menu, WhatsApp mengirim `interactiveResponseMessage`. Sistem membaca:

1. `nativeFlowResponseMessage.paramsJson` → `display_text` / `displayText` / `title` / `id` / `selectedId`
2. `body.text` sebagai cadangan
3. Format lama: `buttonsResponseMessage`, `listResponseMessage`, `templateButtonReplyMessage`

Teks hasil pembacaan disimpan sebagai pesan pelanggan biasa, diteruskan ke bot AI sebagai konteks, dan tampil di dashboard CS.

---

## 6. Batasan & Catatan Teknis

| Aturan | Nilai |
|---|---|
| Tombol per pesan | maksimal **10** |
| Opsi `quick_reply` sekaligus | disarankan **≤ 3** (lebih dari itu otomatis jadi daftar) |
| Baris per section daftar | maksimal **10** |
| Panjang `title` header | jaga ≤ 60 karakter |
| Panjang `body` | jaga ≤ 1024 karakter |
| Panjang `footer` | jaga ≤ 60 karakter |
| Gambar header | opsional (`imageUrl`); jika gagal diunduh, otomatis pakai header teks |

**Kenapa `generateWAMessageFromContent()` + `relayMessage()`?**
Baileys tidak menerima `{ interactiveMessage }` lewat `sock.sendMessage()` (jatuh ke `prepareWAMessageMedia` dan gagal dengan "Invalid media type"). Modul [`backend/src/services/interactive.ts`](../backend/src/services/interactive.ts) membangun konten lalu mengirimnya lewat `relayMessage()` dengan `additionalNodes` Native Flow (`biz → interactive → native_flow`), yang merupakan jalur yang dipakai WhatsApp Web.

**Penyimpanan:** kolom `messages.content_type` hanya mengizinkan `text/image/video/document`, jadi pesan interaktif disimpan sebagai `content_type = "text"` + `media_type = "interactive"`. Tidak perlu migrasi constraint.

---

## 7. Troubleshooting

| Gejala | Penyebab | Solusi |
|---|---|---|
| Tombol tidak tampil, hanya teks | Versi Baileys lama / gateway belum reconnect | Pastikan `@whiskeysockets/baileys` `7.0.0-rc14`, restart backend |
| Error "Invalid media type" | Jalur `sendMessage({ interactiveMessage })` | Jangan kirim lewat `sendMessage`; gunakan endpoint/modal |
| Tombol tampil tapi tidak bisa ditekan | Nomor pengirim belum mendukung Native Flow | Minta pelanggan update WhatsApp |
| Menu kosong saat "Isi dari Stok" | Stok belum tersinkron | Admin → Stok → **Sinkron Sekarang** |
| Balasan pelanggan tidak masuk | `extractMessageText` tidak mengenali tipe | Cek log backend, pastikan versi terbaru |
| `502` saat kirim | Gateway WhatsApp terputus | Admin → Gateway → cek status / scan ulang QR |

Dokumen terkait: [WHATSAPP.md](./WHATSAPP.md) · [STOCK.md](./STOCK.md) · [API.md](./API.md)
