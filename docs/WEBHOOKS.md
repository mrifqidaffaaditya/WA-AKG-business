# WA-AKG Business Webhook Guide

Panduan lengkap integrasi Webhook real-time untuk WA-AKG Business v3.5.

## Daftar Isi
1. [Ikhtisar](#ikhtisar)
2. [Arsitektur & Jaminan Pengiriman](#arsitektur--jaminan-pengiriman)
3. [Format Header & Autentikasi](#format-header--autentikasi)
4. [Daftar Event](#daftar-event)
5. [Skema Payload](#skema-payload)
6. [Verifikasi Signature HMAC-SHA256](#verifikasi-signature-hmac-sha256)
7. [Pengujian Webhook (Ping Test)](#pengujian-webhook-ping-test)

---

## Ikhtisar

Webhook memungkinkan sistem eksternal (seperti CRM, ERP, Zapier, n8n, Make, atau backend kustom Anda) untuk menerima data secara instan saat terjadi aktivitas di WA-AKG Business tanpa perlu melakukan polling HTTP berkala.

Setiap request dikirimkan melalui protokol HTTP/HTTPS POST dengan format payload JSON dan header tanda tangan kriptografi `X-WA-AKG-Signature`.

---

## Arsitektur & Jaminan Pengiriman

- **Asynchronous Non-Blocking**: Pengiriman webhook diproses di background microtask tanpa memperlambat interaksi WhatsApp atau CS.
- **Retry Mechanism**: Jika endpoint Anda gagal merespons (status selain 2xx atau timeout), sistem secara otomatis mengulangi pengiriman hingga **3 kali** dengan strategi *exponential backoff* (5 detik, 15 detik).
- **Timeout Protection**: Setiap request memiliki batas waktu timeout maksimum 6.000 ms (6 detik).
- **SSRF Guard**: Endpoint yang mengarah ke localhost atau IP privat cloud metadata (169.254.169.254) diblokir secara otomatis demi keamanan.
- **Realtime Observability**: Setiap pengiriman webhook tercatat di tabel `webhook_deliveries` dan disiarkan via Socket.io ke dashboard admin.

---

## Format Header & Autentikasi

Setiap HTTP POST request dari sistem WA-AKG Business menyertakan header berikut:

| Header | Tipe | Penjelasan | Contoh |
|---|---|---|---|
| `Content-Type` | string | Format data payload | `application/json` |
| `User-Agent` | string | Identitas pengirim | `WA-AKG-Webhook/3.5.0` |
| `X-WA-AKG-Event` | string | Nama event yang memicu webhook | `message.received` |
| `X-WA-AKG-Signature` | string | Tanda tangan HMAC SHA-256 | `sha256=d3b07384d113...` |
| `X-WA-AKG-Timestamp` | string | Waktu ISO 8601 saat payload dibuat | `2026-11-23T12:00:00.000Z` |
| `X-WA-AKG-Delivery` | string | ID unik untuk pengiriman ini (idempotensi) | `deliv_xyz123` |

---

## Daftar Event

Anda dapat memilih untuk berlangganan semua event (`*`) atau event spesifik berikut:

| Event Name | Deskripsi |
|---|---|
| `message.received` | Dipicu ketika customer mengirimkan pesan WhatsApp baru (teks/media). |
| `message.sent` | Dipicu ketika bot atau customer service mengirimkan pesan ke customer. |
| `conversation.created` | Dipicu ketika percakapan baru dibuat (sesi customer baru). |
| `conversation.status_changed` | Dipicu saat status percakapan berubah (`bot`, `waiting`, `active`, `resolved`, `hold`). |
| `conversation.claimed` | Dipicu saat seorang CS mengambil atau mengklaim percakapan dari antrean. |
| `conversation.resolved` | Dipicu saat percakapan diselesaikan (oleh CS atau auto-close). |
| `stock.updated` | Dipicu saat sinkronisasi stok selesai diperbarui. |
| `ping` | Event pengujian konektivitas webhook. |

---

## Skema Payload

### Struktur Envelope Umum
```json
{
  "id": "evt_abc123456789",
  "event": "message.received",
  "timestamp": "2026-11-23T12:00:00.000Z",
  "data": { ... }
}
```

### 1. Event `message.received`
```json
{
  "id": "evt_01HXYZ...",
  "event": "message.received",
  "timestamp": "2026-11-23T12:00:00.000Z",
  "data": {
    "conversationId": "conv_123",
    "customer": {
      "id": "cust_456",
      "waNumber": "6281234567890",
      "displayName": "Budi Santoso"
    },
    "message": {
      "id": "msg_789",
      "sender": "customer",
      "contentType": "text",
      "content": "Halo, apakah produk X masih tersedia?",
      "mediaUrl": null,
      "waMessageId": "3EB0B0F39D5...",
      "createdAt": "2026-11-23T12:00:00.000Z"
    }
  }
}
```

### 2. Event `conversation.status_changed`
```json
{
  "id": "evt_02HABC...",
  "event": "conversation.status_changed",
  "timestamp": "2026-11-23T12:05:00.000Z",
  "data": {
    "conversationId": "conv_123",
    "status": "waiting",
    "previousStatus": "bot",
    "reason": "escalation",
    "updatedAt": "2026-11-23T12:05:00.000Z"
  }
}
```

### 3. Event `conversation.resolved`
```json
{
  "id": "evt_03HDEF...",
  "event": "conversation.resolved",
  "timestamp": "2026-11-23T12:30:00.000Z",
  "data": {
    "conversationId": "conv_123",
    "resolvedBy": "usr_cs1",
    "rating": 5,
    "review": "Pelayanan sangat cepat dan ramah!",
    "resolvedAt": "2026-11-23T12:30:00.000Z"
  }
}
```

---

## Verifikasi Signature HMAC-SHA256

Untuk memastikan bahwa data berasal dari server WA-AKG Business dan belum dimanipulasi di tengah jalan, Anda **wajib** memverifikasi header `X-WA-AKG-Signature`.

### Node.js / Express
```javascript
import express from "express";
import crypto from "crypto";

const app = express();
app.use(express.json());

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET; // Dari dashboard Admin

function verifySignature(req) {
  const signature = req.headers["x-wa-akg-signature"];
  if (!signature) return false;

  const rawSignature = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  const payloadString = JSON.stringify(req.body);

  const computed = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payloadString)
    .digest("hex");

  const sigBuf = Buffer.from(rawSignature, "hex");
  const compBuf = Buffer.from(computed, "hex");

  if (sigBuf.length !== compBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, compBuf);
}

app.post("/webhook", (req, res) => {
  if (!verifySignature(req)) {
    return res.status(401).send("Invalid signature");
  }

  const { event, data } = req.body;
  console.log("Menerima webhook:", event, data);

  // Balas 200 OK sesegera mungkin
  res.status(200).json({ received: true });
});

app.listen(3000, () => console.log("Webhook receiver running on port 3000"));
```

### Python (FastAPI / Flask)
```python
import hmac
import hashlib
import json
from fastapi import FastAPI, Request, HTTPException

app = FastAPI()
WEBHOOK_SECRET = "your_webhook_secret_here"

@app.post("/webhook")
async def receive_webhook(request: Request):
    signature_header = request.headers.get("x-wa-akg-signature")
    if not signature_header:
        raise HTTPException(status_code=401, detail="Missing signature")

    raw_signature = signature_header.replace("sha256=", "")
    body_bytes = await request.body()
    
    computed = hmac.new(
        WEBHOOK_SECRET.encode("utf-8"),
        body_bytes,
        hashlib.sha256
    ).hexdigest()

    if not hmac.compare_digest(raw_signature, computed):
        raise HTTPException(status_code=401, detail="Invalid signature")

    payload = json.loads(body_bytes)
    print(f"Event received: {payload.get('event')}")
    return {"status": "ok"}
```

### PHP
```php
<?php
$secret = getenv('WEBHOOK_SECRET');
$signatureHeader = $_SERVER['HTTP_X_WA_AKG_SIGNATURE'] ?? '';

$rawPayload = file_get_contents('php://input');
$rawSignature = str_replace('sha256=', '', $signatureHeader);

$expectedSignature = hash_hmac('sha256', $rawPayload, $secret);

if (!hash_equals($expectedSignature, $rawSignature)) {
    http_response_code(401);
    echo "Invalid signature";
    exit;
}

$data = json_decode($rawPayload, true);
// Proses data...
http_response_code(200);
echo json_encode(["status" => "received"]);
?>
```

---

## Pengujian Webhook (Ping Test)

Anda dapat menguji apakah endpoint Anda siap menerima data dengan menekan tombol **Test Ping** di tab Webhooks dashboard Admin atau via API:

```bash
curl -X POST https://wa-akg-business.aikeigroup.net/api/v1/webhooks/YOUR_WEBHOOK_ID/test \
  -H "X-API-Key: akg_live_YOUR_KEY"
```
