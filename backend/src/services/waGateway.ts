// @ts-nocheck
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
} from "@whiskeysockets/baileys";
import { Boom } from "@hapi/boom";
import QRCode from "qrcode";
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
  get(key: string): number | undefined {
    return this.map.get(key);
  }
  set(key: string, val: number): void {
    this.map.set(key, val);
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
let connectionStatus: "disconnected" | "connecting" | "connected" = "disconnected";

export function getConnectionStatus() {
  return { status: connectionStatus, qr: currentQR };
}

export async function connectWa(): Promise<void> {
  if (sock) return;

  connectionStatus = "connecting";
  currentQR = null;

  const { state, saveCreds } = await useMultiFileAuthState(
    config.wa.sessionPath
  );

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
    browser: ["WA-AKG", "Chrome", "1.0"],
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
      logger.info("[wa] Connected");
      waEvents.emit("status", "connected");
    }

    if (connection === "close") {
      const reason = (lastDisconnect?.error as Boom)?.output?.statusCode;
      const isRestart =
        reason === DisconnectReason.loggedOut ||
        reason === DisconnectReason.restartRequired ||
        reason === DisconnectReason.timedOut;

      connectionStatus = "disconnected";
      currentQR = null;

      if (reason === DisconnectReason.loggedOut) {
        logger.warn("[wa] Logged out, needs re-auth");
        waEvents.emit("logged_out");
      } else {
        logger.warn(`[wa] Disconnected (${reason}), reconnect in 5s...`);
        waEvents.emit("status", "disconnected");
        if (isRestart) {
          sock = null;
          await delay(5000);
          await connectWa();
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

export async function disconnectWa(): Promise<void> {
  if (sock) {
    try {
      await sock.logout();
    } catch {}
    sock = null;
  }
  connectionStatus = "disconnected";
  currentQR = null;
}

export async function sendWaMessage(
  jid: string,
  content: AnyMessageContent
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
  const result = await sock.sendMessage(targetJid, content);
  if (result && result.key.remoteJid && result.key.id && result.message) {
    localMessageStore.set(result.key.remoteJid, result.key.id, result.message);
  }
  return result;
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
