import {
  makeWASocket,
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  makeCacheableSignalKeyStore,
  WAMessage,
  proto,
  downloadMediaMessage,
  AnyMessageContent,
  delay,
  Browsers,
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
import fs from "fs";
import path from "path";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { EventEmitter } from "events";
import {
  relayInteractiveMessage,
  isInteractiveContent,
  type InteractiveMessagePayload,
} from "./interactive.js";

export const waEvents = new EventEmitter();

// Custom in-memory message store for retry decrypting
class InMemoryMessageStore {
  private messages = new Map<string, proto.IMessage>();
  
  public set(remoteJid: string, id: string, message: proto.IMessage) {
    this.messages.set(`${remoteJid}:${id}`, message);
    if (this.messages.size > 2000) {
      const firstKey = this.messages.keys().next().value;
      if (firstKey) this.messages.delete(firstKey);
    }
  }
  
  public get(remoteJid: string, id: string): proto.IMessage | undefined {
    return this.messages.get(`${remoteJid}:${id}`);
  }
}
const localMessageStore = new InMemoryMessageStore();

class SimpleCache {
  private map = new Map<string, number>();
  get<T = number>(key: string): T | undefined {
    return this.map.get(key) as T | undefined;
  }
  set<T = number>(key: string, val: T): void {
    this.map.set(key, val as any);
  }
  del(key: string): void {
    this.map.delete(key);
  }
  flushAll(): void {
    this.map.clear();
  }
}
const msgRetryCounterCache = new SimpleCache();

let sock: ReturnType<typeof makeWASocket> | null = null;
let currentQR: string | null = null;
let currentPairingCode: string | null = null;
let connectionStatus: "disconnected" | "connecting" | "connected" = "disconnected";
let isExplicitDisconnect = false;

export function getConnectionStatus() {
  return {
    status: connectionStatus,
    qr: currentQR,
    pairingCode: currentPairingCode,
    registered: Boolean(sock?.authState?.creds?.registered),
  };
}

export async function clearSessionFolder(): Promise<void> {
  const sessionDir = path.resolve(config.wa.sessionPath);
  try {
    if (fs.existsSync(sessionDir)) {
      await fs.promises.rm(sessionDir, { recursive: true, force: true });
      logger.info(`[wa] Session folder cleared: ${sessionDir}`);
    }
  } catch (err) {
    logger.error("[wa] Failed to clear session folder:", err);
  }
  try {
    if (!fs.existsSync(sessionDir)) {
      await fs.promises.mkdir(sessionDir, { recursive: true });
    }
  } catch {}
}

export async function resetWaSession(): Promise<void> {
  isExplicitDisconnect = true;
  logger.info("[wa] Resetting WhatsApp session (logout & wipe files)...");
  if (sock) {
    try {
      sock.ev.removeAllListeners("connection.update");
    } catch {}
    try {
      await sock.logout();
    } catch (err) {
      logger.debug("[wa] Socket logout error during reset (expected if offline):", err);
    }
    try {
      sock.end(undefined);
    } catch {}
    sock = null;
  }
  connectionStatus = "disconnected";
  currentQR = null;
  currentPairingCode = null;

  await clearSessionFolder();

  waEvents.emit("pairing_code", null);
  waEvents.emit("status", "disconnected");
  waEvents.emit("logged_out");
}

export async function disconnectWa(): Promise<void> {
  isExplicitDisconnect = true;
  logger.info("[wa] Disconnecting WhatsApp socket...");
  if (sock) {
    try {
      sock.ev.removeAllListeners("connection.update");
      sock.end(undefined);
    } catch (err) {
      logger.debug("[wa] Disconnect end error:", err);
    }
    sock = null;
  }
  connectionStatus = "disconnected";
  currentQR = null;
  currentPairingCode = null;
  waEvents.emit("pairing_code", null);
  waEvents.emit("status", "disconnected");
}

export async function connectWa(force = false): Promise<void> {
  isExplicitDisconnect = false;
  // If already connected and not forced, keep existing connection
  if (sock && connectionStatus === "connected" && !force) return;

  // Clean up any stale or lingering socket before connecting
  if (sock) {
    try {
      sock.ev.removeAllListeners("connection.update");
      sock.end(undefined);
    } catch {}
    sock = null;
  }

  connectionStatus = "connecting";
  currentQR = null;
  waEvents.emit("status", "connecting");

  const sessionDir = path.resolve(config.wa.sessionPath);
  if (!fs.existsSync(sessionDir)) {
    fs.mkdirSync(sessionDir, { recursive: true });
  }

  const { state, saveCreds } = await useMultiFileAuthState(sessionDir);

  const { version, isLatest } = await fetchLatestBaileysVersion();
  logger.info(`[wa] Using Baileys v${version.join(".")}, latest: ${isLatest}`);

  sock = makeWASocket({
    version,
    printQRInTerminal: false,
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, {
        child: () => ({ level: "", debug() {}, info() {}, warn() {}, error() {}, trace() {} }),
        level: "",
        debug() {},
        info() {},
        warn() {},
        error() {},
        trace() {},
      } as any),
    },
    logger: {
      child: () => ({ level: "silent", debug() {}, info() {}, warn() {}, error() {}, trace() {} }),
      level: "silent",
      debug() {},
      info() {},
      warn() {},
      error() {},
      trace() {},
    } as any,
    browser: Browsers.ubuntu("Chrome"),
    msgRetryCounterCache,
    getMessage: async (key) => {
      if (key.remoteJid && key.id) {
        const msg = localMessageStore.get(key.remoteJid, key.id);
        if (msg) return msg;
      }
      // Fallback: lookup in database
      try {
        const { db, schema } = await import("../db/index.js");
        const { eq } = await import("drizzle-orm");
        const dbMsg = await db
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.wa_message_id, key.id!))
          .limit(1);
        
        if (dbMsg.length > 0) {
          const m = dbMsg[0];
          if (m.content_type === "text") {
            return { conversation: m.content || "" };
          }
        }
      } catch (err) {
        logger.error("[wa] getMessage database fallback error:", err);
      }
      return undefined;
    },
  });

  // Intercept sendMessage to automatically relay interactive messages natively
  const originalSendMessage = sock.sendMessage.bind(sock);
  sock.sendMessage = async function (destJid: string, content: any, opts?: any) {
    if (isInteractiveContent(content)) {
      const interactivePayload = content.interactiveMessage || content;
      const targetJid = await resolveTargetJid(destJid, { preferPhone: true });
      return (await relayInteractiveMessage(sock!, targetJid, interactivePayload, opts)) as any;
    }
    return originalSendMessage(destJid, content, opts);
  } as any;

  sock.ev.on("creds.update", saveCreds);

  sock.ev.on("connection.update", async (update) => {
    const { connection, lastDisconnect, qr } = update;

    if (qr) {
      currentQR = await QRCode.toDataURL(qr);
      waEvents.emit("qr", currentQR);
    }

    if (connection === "open") {
      connectionStatus = "connected";
      currentQR = null;
      currentPairingCode = null;
      logger.info("[wa] Connected");
      waEvents.emit("status", "connected");
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isLoggedOut = reason === DisconnectReason.loggedOut || reason === 401 || reason === 403;
      const isRestartRequired = reason === DisconnectReason.restartRequired || reason === 515;

      connectionStatus = "disconnected";
      currentQR = null;

      if (isLoggedOut) {
        logger.warn("[wa] Logged out or invalid session credentials. Resetting session folder...");
        currentPairingCode = null;
        sock = null;
        await clearSessionFolder();
        waEvents.emit("pairing_code", null);
        waEvents.emit("logged_out");
        waEvents.emit("status", "disconnected");
        return;
      }

      if (isRestartRequired) {
        logger.info("[wa] Restart required (code 515) - finalizing pairing and opening session...");
        connectionStatus = "connecting";
        waEvents.emit("status", "connecting");
        setTimeout(() => {
          connectWa().catch((err) => logger.error("[wa] Reconnect error on 515:", err));
        }, 1000);
        return;
      }

      logger.warn(`[wa] Disconnected (${reason}), status set to disconnected`);
      sock = null;
      waEvents.emit("status", "disconnected");

      // Auto-reconnect if not explicitly disconnected by user and session exists
      if (!isExplicitDisconnect) {
        const sessionDir = path.resolve(config.wa.sessionPath);
        const credsFile = path.join(sessionDir, "creds.json");
        if (fs.existsSync(credsFile)) {
          try {
            const credsData = JSON.parse(fs.readFileSync(credsFile, "utf-8"));
            if (credsData?.registered) {
              logger.info(`[wa] Disconnected (${reason}), auto-reconnecting in 3s...`);
              setTimeout(() => {
                if (!isExplicitDisconnect && connectionStatus !== "connected") {
                  connectWa().catch((err) => logger.error("[wa] Auto-reconnect error:", err));
                }
              }, 3000);
            }
          } catch {}
        }
      }
    }
  });

  sock.ev.on("messages.upsert", async (m) => {
    for (const msg of m.messages) {
      if (msg.key.remoteJid && msg.key.id && msg.message) {
        localMessageStore.set(msg.key.remoteJid, msg.key.id, msg.message);
      }
      if (m.type === "notify") {
        waEvents.emit("message", msg);
      }
    }
  });
}

export async function requestWaPairingCode(phoneNumber: string): Promise<string> {
  const cleanNumber = phoneNumber.replace(/[^0-9]/g, "");
  if (!cleanNumber || cleanNumber.length < 8) {
    throw new Error("Nomor telepon tidak valid. Masukkan nomor lengkap dengan kode negara, contoh: 628123456789");
  }

  isExplicitDisconnect = false;

  // If already connected actively
  if (connectionStatus === "connected") {
    throw new Error("WhatsApp saat ini sudah terhubung aktif. Silakan putuskan atau reset sesi terlebih dahulu jika ingin menautkan nomor lain.");
  }

  // Clear previous pairing code immediately so user never sees a stale/old code
  currentPairingCode = null;
  waEvents.emit("pairing_code", null);

  // If there's an existing registered creds on disk while offline, clear it to start a fresh pairing session
  const sessionDir = path.resolve(config.wa.sessionPath);
  const credsFile = path.join(sessionDir, "creds.json");
  let needsReset = false;

  if (fs.existsSync(credsFile)) {
    try {
      const credsData = JSON.parse(fs.readFileSync(credsFile, "utf-8"));
      if (credsData?.registered) {
        logger.info("[wa] Old registered credentials found on disk while disconnected. Clearing session for fresh pairing...");
        needsReset = true;
      }
    } catch {
      needsReset = true;
    }
  }

  if (needsReset) {
    await resetWaSession();
    isExplicitDisconnect = false;
    await connectWa(true);
  } else if (!sock || !(sock.ws as any)?.isOpen) {
    await connectWa(true);
  }

  // Wait briefly for sock to be initialized and authState ready
  let retries = 0;
  while ((!sock || !sock.authState) && retries < 25) {
    await delay(150);
    retries++;
  }

  if (!sock) {
    throw new Error("Gagal menginisialisasi WhatsApp socket");
  }

  // If sock still reports registered, force a clean reset once
  if (sock.authState?.creds?.registered) {
    logger.info("[wa] Socket registered flag still true, resetting session for pairing...");
    await resetWaSession();
    isExplicitDisconnect = false;
    await connectWa(true);
    let r = 0;
    while ((!sock || !sock.authState) && r < 25) {
      await delay(150);
      r++;
    }
  }

  if (!sock) {
    throw new Error("Gagal menyiapkan WhatsApp socket untuk pairing");
  }

  // Wait until websocket is open and handshake completed (avoids 'Connection Closed' error)
  let wsWait = 0;
  while ((!sock || !sock.ws || !(sock.ws as any).isOpen) && wsWait < 40) {
    await delay(150);
    wsWait++;
  }

  if (!sock || !(sock.ws as any)?.isOpen) {
    throw new Error("Koneksi ke server WhatsApp belum siap. Silakan klik Dapatkan Kode Pairing kembali dalam beberapa saat.");
  }

  try {
    const rawCode = await sock.requestPairingCode(cleanNumber);
    // Format pairing code nicely as ABCD-1234 (standard 8-char Baileys code)
    currentPairingCode = rawCode?.length === 8 ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}` : rawCode;
    logger.info(`[wa] Pairing code generated: ${currentPairingCode}`);
    waEvents.emit("pairing_code", currentPairingCode);

    // Auto-clear pairing code after 180 seconds if still not connected
    setTimeout(() => {
      if (connectionStatus !== "connected") {
        currentPairingCode = null;
        waEvents.emit("pairing_code", null);
      }
    }, 180000);

    return currentPairingCode;
  } catch (err: any) {
    logger.error("[wa] requestPairingCode error:", err);
    throw new Error(err?.message || "Gagal mendapatkan kode pairing dari WhatsApp. Pastikan format nomor benar.");
  }
}

export async function sendWaMessage(
  jid: string,
  content: AnyMessageContent,
  options?: any
): Promise<proto.WebMessageInfo | null> {
  if (!sock) return null;
  const targetJid = await resolveTargetJid(jid);
  const result = await sock.sendMessage(targetJid, content, options);
  if (result && result.key.remoteJid && result.key.id && result.message) {
    localMessageStore.set(result.key.remoteJid, result.key.id, result.message);
  }
  return (result ?? null) as proto.WebMessageInfo | null;
}

/**
 * Check if a JID is in @lid format (WhatsApp Linked ID)
 */
export function isLidJid(jid: string | undefined | null): boolean {
  if (!jid) return false;
  return jid.endsWith("@lid");
}

/**
 * Resolve a @lid JID or formatted phone string to standard @s.whatsapp.net phone number JID.
 * WhatsApp Native Flow interactive stanzas MUST be addressed to a phone number JID or group.
 */
export async function resolveToPhoneJid(
  jid: string,
  inlineAlt?: string | null
): Promise<string> {
  if (!jid) return jid;
  if (jid.endsWith("@g.us") || jid.endsWith("@newsletter")) return jid;

  // 1. Inline alt if phone
  if (inlineAlt && !isLidJid(inlineAlt)) {
    const clean = inlineAlt.replace(/[^0-9]/g, "");
    if (clean) return `${clean}@s.whatsapp.net`;
  }

  // 2. If it's a LID, check reverse mapping file from Baileys session
  if (isLidJid(jid)) {
    const lidId = jid.split("@")[0].replace(/[^0-9]/g, "");
    const sessionDir = path.resolve(config.wa.sessionPath);
    const reverseFile = path.join(sessionDir, `lid-mapping-${lidId}_reverse.json`);
    if (fs.existsSync(reverseFile)) {
      try {
        const phone = JSON.parse(fs.readFileSync(reverseFile, "utf-8"));
        const cleanPhone = String(phone).replace(/[^0-9]/g, "");
        if (cleanPhone) return `${cleanPhone}@s.whatsapp.net`;
      } catch {}
    }

    // 3. Check DB customer mapping for this LID where wa_number is a real phone number
    try {
      const { db, schema } = await import("../db/index.js");
      const { eq, and, notLike } = await import("drizzle-orm");
      const cust = await db
        .select()
        .from(schema.customers)
        .where(
          and(
            eq(schema.customers.jid, jid),
            notLike(schema.customers.wa_number, "%@lid%")
          )
        )
        .limit(1);
      if (cust.length > 0 && cust[0].wa_number) {
        const clean = cust[0].wa_number.replace(/[^0-9]/g, "");
        if (clean) return `${clean}@s.whatsapp.net`;
      }
    } catch (err) {
      logger.debug("[wa] resolveToPhoneJid DB lookup failed:", err);
    }
  }

  // 4. If normal JID or raw number
  if (jid.includes("@s.whatsapp.net")) {
    return jid;
  }
  const clean = jid.replace(/[^0-9]/g, "");
  if (clean) {
    return `${clean}@s.whatsapp.net`;
  }
  return jid;
}

/**
 * Resolve a phone number or JID to the JID WhatsApp expects.
 * If preferPhone is true, always returns a normalized @s.whatsapp.net or group JID.
 */
export async function resolveTargetJid(
  jid: string,
  options?: { preferPhone?: boolean }
): Promise<string> {
  if (options?.preferPhone || isLidJid(jid)) {
    return await resolveToPhoneJid(jid);
  }
  if (jid.includes("@")) return jid;
  try {
    const { db, schema } = await import("../db/index.js");
    const { eq } = await import("drizzle-orm");
    const customer = await db
      .select()
      .from(schema.customers)
      .where(eq(schema.customers.wa_number, jid))
      .limit(1);

    if (customer.length > 0 && customer[0].jid) {
      if (options?.preferPhone && isLidJid(customer[0].jid)) {
        return await resolveToPhoneJid(customer[0].jid);
      }
      logger.info(`[wa] Found custom JID for ${jid}: ${customer[0].jid}`);
      return customer[0].jid;
    }
    return getJid(jid);
  } catch (err) {
    logger.error(`[wa] Error looking up customer JID for ${jid}:`, err);
    return getJid(jid);
  }
}

/**
 * Send a rich interactive WhatsApp message (buttons / list menu) using the
 * Native Flow relay path required by Baileys 6.7.x.
 */
export async function sendInteractiveMessage(
  jid: string,
  payload: InteractiveMessagePayload,
  options: { quoted?: WAMessage } = {}
): Promise<proto.WebMessageInfo> {
  if (!sock) {
    throw new Error("WhatsApp gateway belum terhubung. Hubungkan perangkat terlebih dahulu.");
  }
  // Native Flow interactive messages MUST be addressed to a phone number JID (@s.whatsapp.net) or group
  const targetJid = await resolveTargetJid(jid, { preferPhone: true });
  const msg = await relayInteractiveMessage(sock, targetJid, payload, options);

  if (msg.key.remoteJid && msg.key.id && msg.message) {
    localMessageStore.set(msg.key.remoteJid, msg.key.id, msg.message);
  }
  return msg as proto.WebMessageInfo;
}

export async function downloadWaMedia(
  msg: WAMessage
): Promise<Buffer | null> {
  if (!sock) return null;
  try {
    return (await downloadMediaMessage(
      msg,
      "buffer",
      {}
    )) as Buffer;
  } catch (err) {
    logger.error("[wa] Download media error:", err);
    return null;
  }
}

export function getJid(waNumber: string): string {
  const cleaned = waNumber.replace(/[^0-9]/g, "");
  return `${cleaned}@s.whatsapp.net`;
}

export function extractWaNumber(jid: string): string {
  return jid.replace("@s.whatsapp.net", "").replace("@g.us", "");
}
