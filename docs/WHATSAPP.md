# WhatsApp Gateway Setup

Guide to setting up and troubleshooting the WhatsApp Gateway.

## How It Works

WA-AKG Business uses **Baileys** — an open-source WhatsApp Web API library that connects using the WhatsApp Web protocol. This means:

- ✅ No WhatsApp Business API required
- ✅ Uses a standard WhatsApp account
- ✅ Free to use (no Meta fees)
- ⚠️ Requires a phone number not already linked to WhatsApp Web
- ⚠️ Subject to WhatsApp's rate limits and policies

## Setup Steps

### 1. Prepare a WhatsApp Number

- Use a **dedicated phone number** for your business — not your personal number
- This number should **not** be linked to WhatsApp Web on another device/session
- Remove the number from any existing WhatsApp Web sessions if needed

### 2. Connect from Admin Panel

1. Login to WA-AKG Business as admin or super_admin
2. Go to **Admin Panel → Gateway**
3. The QR code will appear (may take a few seconds on first run)
4. On your phone:
   - Open WhatsApp
   - Go to **Settings → Linked Devices → Link a Device**
   - Scan the QR code
5. Status changes to "connected" — ready to use!

### 3. Verify Connection

Send a WhatsApp message to the connected number. The bot should respond within seconds.

## Session Persistence

Baileys saves authentication credentials to `backend/sessions/`. This allows the gateway to reconnect without re-scanning the QR code each time.

- **Do not delete the sessions folder** unless you want to re-authenticate
- **Back up sessions** before moving servers
- **One session per phone number**

## Troubleshooting

### QR Code Doesn't Appear

1. Check if the sessions directory exists and is writable:
   ```bash
   ls -la backend/sessions/
   ```
2. Delete stale sessions and restart:
   ```bash
   rm -rf backend/sessions/*
   npm run dev
   ```

### "Phone already linked" Error

WhatsApp only allows one active WhatsApp Web session per phone number at a time.

1. On your phone: **Settings → Linked Devices**
2. Remove any existing browser/desktop sessions
3. Try scanning QR code again

### Gateway Disconnects Frequently

1. Check server internet connectivity
2. Ensure the server time is correct (NTP sync)
3. Check WhatsApp hasn't blocked the number
4. Restart the backend: `npm run dev`

### Messages Not Being Received

1. Verify the gateway status is "connected"
2. Check backend logs for errors
3. Ensure the phone running WhatsApp has stable internet
4. Try sending a test message from another number

## Rate Limits & Best Practices

- **Don't spam** — WhatsApp may rate-limit or ban numbers that send too many messages
- **Natural delays** — WA-AKG Business adds small delays between automated messages
- **Avoid suspicious patterns** — don't send identical messages rapidly
- **Keep phone online** — the phone with WhatsApp must have internet access
- **Use a stable server** — frequent reconnections may trigger WhatsApp security checks

## Multi-Session Support

WA-AKG Business supports adding multiple WhatsApp numbers by extending the gateway service. Each number requires its own Baileys session stored in a separate directory.

## Migration

To move your WA session to another server:

1. **Backup** the `backend/sessions/` directory
2. **Stop** the backend on the old server
3. **Copy** sessions to the new server
4. **Start** the backend — it will reconnect automatically

**Never run the same session on two servers simultaneously.** This will cause the session to be invalidated by WhatsApp.

## Security Notes

- 🔒 Session files contain authentication credentials — treat them like passwords
- 🔒 Never commit session files to git (they are in `.gitignore`)
- 🔒 Store backups securely
- 🔒 If a session file is exposed, immediately:
  1. Delete the session
  2. Log out from WhatsApp on all devices
  3. Re-authenticate with a new QR scan
