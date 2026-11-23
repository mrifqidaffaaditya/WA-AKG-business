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

  waEvents.emit("status", "disconnected");
  waEvents.emit("logged_out");
}

export async function disconnectWa(): Promise<void> {
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
  waEvents.emit("status", "disconnected");
}

export async function connectWa(force = false): Promise<void> {
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

      connectionStatus = "disconnected";
      currentQR = null;
      currentPairingCode = null;

      if (isLoggedOut) {
        logger.warn("[wa] Logged out or invalid session credentials. Resetting session folder...");
        sock = null;
        await clearSessionFolder();
        waEvents.emit("logged_out");
        waEvents.emit("status", "disconnected");
      } else {
        logger.warn(`[wa] Disconnected (${reason}), status set to disconnected`);
        sock = null;
        waEvents.emit("status", "disconnected");
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

  // If already connected actively
  if (connectionStatus === "connected") {
    throw new Error("WhatsApp saat ini sudah terhubung aktif. Silakan putuskan atau hapus sesi terlebih dahulu jika ingin menautkan nomor lain.");
  }

  // If there's an existing registered creds on disk while offline, clear it to start a fresh pairing session
  const sessionDir = path.resolve(config.wa.sessionPath);
  const credsFile = path.join(sessionDir, "creds.json");
  if (fs.existsSync(credsFile)) {
    try {
      const credsData = JSON.parse(fs.readFileSync(credsFile, "utf-8"));
      if (credsData?.registered) {
        logger.info("[wa] Stale registered credentials found on disk while disconnected. Clearing session for fresh pairing...");
        await resetWaSession();
      }
    } catch {
      await clearSessionFolder();
    }
  }

  // Ensure fresh connection is started
  await connectWa(true);

  // Wait briefly for sock to be initialized and authState ready
  let retries = 0;
  while ((!sock || !sock.authState) && retries < 25) {
    await delay(250);
    retries++;
  }

  if (!sock) {
    throw new Error("Gagal menginisialisasi WhatsApp socket");
  }

  // If sock still reports registered, force a clean reset once
  if (sock.authState?.creds?.registered) {
    logger.info("[wa] Socket registered flag still true, resetting session for pairing...");
    await resetWaSession();
    await connectWa(true);
    let r = 0;
    while ((!sock || !sock.authState) && r < 25) {
      await delay(250);
      r++;
    }
  }

  if (!sock) {
    throw new Error("Gagal menyiapkan WhatsApp socket untuk pairing");
  }

  // Wait until websocket is open and handshake completed (avoids 'Connection Closed' error)
  let wsWait = 0;
  while ((!sock || !sock.ws || !(sock.ws as any).isOpen) && wsWait < 50) {
    await delay(200);
    wsWait++;
  }

  if (!sock || !(sock.ws as any)?.isOpen) {
    throw new Error("Koneksi ke server WhatsApp belum siap. Silakan klik Dapatkan Kode Pairing kembali dalam beberapa saat.");
  }

  try {
    const rawCode = await sock.requestPairingCode(cleanNumber);
    // Format pairing code nicely as ABCD-1234 (standard 8-char Baileys code)
    currentPairingCode = rawCode?.length === 8 ? `${rawCode.slice(0, 4)}-${rawCode.slice(4)}` : rawCode;
    waEvents.emit("pairing_code", currentPairingCode);
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
  let targetJid = jid;
  if (!jid.includes("@")) {
    try {
      const { db, schema } = await import("../db/index.js");
      const { eq } = await import("drizzle-orm");
      const customer = await db
        .select()
        .from(schema.customers)
        .where(eq(schema.customers.wa_number, jid))
        .limit(1);
      
      if (customer.length > 0 && customer[0].jid) {
        targetJid = customer[0].jid;
        logger.info(`[wa] Found custom JID for ${jid}: ${targetJid}`);
      } else {
        targetJid = getJid(jid);
      }
    } catch (err) {
      logger.error(`[wa] Error looking up customer JID for ${jid}:`, err);
      targetJid = getJid(jid);
    }
  }
  const result = await sock.sendMessage(targetJid, content, options);
  if (result && result.key.remoteJid && result.key.id && result.message) {
    localMessageStore.set(result.key.remoteJid, result.key.id, result.message);
  }
  return result ?? null;
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
