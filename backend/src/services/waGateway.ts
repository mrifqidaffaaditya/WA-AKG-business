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
  return sock.sendMessage(jid, content);
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
