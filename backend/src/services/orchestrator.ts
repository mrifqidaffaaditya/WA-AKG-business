// @ts-nocheck
import { waEvents, sendWaMessage, getJid, extractWaNumber, downloadWaMedia, getConnectionStatus } from "./waGateway.js";
import {
  findOrCreateCustomer,
  findActiveConversation,
  createConversation,
  addMessage,
  updateConversationStatus,
  getQueueCount,
  getConversation,
  getMessages,
} from "./conversation.js";
import { generateBotResponse, detectEscalation, generateSummary } from "./chatbot.js";
import { emitToUser, emitToRole, broadcast } from "../ws/index.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { sendNotificationToAllCs, sendNotificationToUser, sendNotificationToAllAdmins } from "./notifications.js";
import { config } from "../config.js";
import { logger } from "../utils/logger.js";
import { proto } from "@whiskeysockets/baileys";
import { writeFileSync, mkdirSync, existsSync } from "fs";
import { join } from "path";

async function emitQueueCount() {
  const count = await getQueueCount();
  broadcast("queue:update", { count });

  if (count >= config.notifQueueThreshold) {
    await sendNotificationToAllAdmins({
      title: "Antrian Menumpuk",
      body: `${count} customer menunggu, tidak ada CS aktif`,
      url: "/dashboard/conversations?status=waiting",
      tag: "queue-alert",
    });
  }
}

export function initOrchestrator(): void {
  waEvents.on("message", async (msg: proto.IWebMessageInfo) => {
    try {
      await handleIncomingMessage(msg);
    } catch (err) {
      logger.error("[orchestrator] Error handling message:", err);
    }
  });

  waEvents.on("status", (status: string) => {
    broadcast("gateway:status", { status });
    if (status === "disconnected") {
      sendNotificationToAllAdmins({
        title: "WhatsApp Gateway",
        body: "WhatsApp Gateway terputus, perlu reconnect",
        url: "/dashboard/admin/gateway",
        tag: "gateway-disconnect",
      });
    }
  });

  logger.info("[orchestrator] Initialized");
}

async function handleIncomingMessage(msg: proto.IWebMessageInfo): Promise<void> {
  const key = msg.key;
  if (!key?.remoteJid) return;

  const jid = key.remoteJid;
  if (jid.includes("@g.us")) return;

  const waNumber = extractWaNumber(jid);
  const pushName = msg.pushName || waNumber;
  const messageType = Object.keys(msg.message || {})[0];

  if (!messageType && !msg.message?.conversation && !msg.message?.extendedTextMessage) {
    logger.debug("[orchestrator] Unknown message type:", Object.keys(msg.message || {}));
  }

  const customer = await findOrCreateCustomer({
    waNumber,
    displayName: pushName,
  });

  let activeConv = await findActiveConversation(customer.id);

  if (!activeConv) {
    activeConv = await createConversation({
      customerId: customer.id,
      waNumber,
      customerName: pushName,
    });
  }

  const content = extractMessageText(msg);
  const contentType = getMessageContentType(msg);

  let savedMsg: typeof schema.messages.$inferSelect | null = null;

  if (content || contentType !== "text") {
    let mediaUrl: string | null = null;
    let mediaType: string | null = null;
    let fileName: string | null = null;
    let fileSize: number | null = null;

    if (contentType !== "text") {
      const media = await downloadWaMedia(msg as any);
      mediaType = messageType;
      fileName = (msg.message?.[messageType] as any)?.fileName || null;
      fileSize = (msg.message?.[messageType] as any)?.fileLength || null;
      mediaUrl = media ? await saveMediaBuffer(media, mediaType) : null;
    }

    savedMsg = await addMessage({
      conversationId: activeConv.id,
      sender: "customer",
      content: content || null,
      contentType: contentType as "text" | "image" | "video" | "document",
      mediaUrl,
      mediaType,
      fileName,
      fileSize,
      waMessageId: msg.key?.id || null,
    });
  } else {
    savedMsg = await addMessage({
      conversationId: activeConv.id,
      sender: "customer",
      content: "",
      contentType: "text",
      waMessageId: msg.key?.id || null,
    });
  }

  if (savedMsg) {
    emitToUser(activeConv.claimed_by || "none", "conversation:message", {
      conversationId: activeConv.id,
      message: savedMsg,
    });
    emitToRole("cs", "conversation:message", {
      conversationId: activeConv.id,
      message: savedMsg,
    });
    emitToRole("admin", "conversation:message", {
      conversationId: activeConv.id,
      message: savedMsg,
    });
  }

  if (activeConv.status === "active") {
    // CS already claimed, notify them about new message
    if (activeConv.claimed_by) {
      await sendNotificationToUser(activeConv.claimed_by, {
        title: `${pushName}`,
        body: content ? content.substring(0, 100) : "Media pesan baru",
        url: `/dashboard/conversations/${activeConv.id}`,
        tag: `conv-${activeConv.id}`,
      });
    }
    return;
  }

  if (activeConv.status === "bot" || activeConv.status === "waiting") {
    if (activeConv.status === "bot" && content) {
      const { response, shouldEscalate } = await generateBotResponse(
        activeConv.id,
        waNumber,
        content
      );

      const botMsg = await addMessage({
        conversationId: activeConv.id,
        sender: "bot",
        content: response,
        contentType: "text",
      });

      await sendWaMessage(jid, { text: response });

      if (botMsg) {
        broadcast("conversation:message", {
          conversationId: activeConv.id,
          message: botMsg,
        });
      }

      if (shouldEscalate) {
        await updateConversationStatus(activeConv.id, "waiting");
        activeConv.status = "waiting";

        broadcast("conversation:status", {
          conversationId: activeConv.id,
          status: "waiting",
        });

        broadcast("conversation:new", {
          id: activeConv.id,
          wa_number: waNumber,
          customer_name: pushName,
          status: "waiting",
          claimed_by: null,
          updated_at: new Date().toISOString(),
        });

        await emitQueueCount();

        sendNotificationToAllCs({
          title: `${pushName} menunggu dilayani CS`,
          body: content ? content.substring(0, 100) : "Pelanggan baru di antrian",
          url: `/dashboard/conversations/${activeConv.id}`,
          tag: "new-queue",
        }).catch((err) => logger.error("[notif] Failed:", err));
      }
    } else if (activeConv.status === "waiting") {
      // customer sends another message while waiting
      if (activeConv.claimed_by) {
        await sendNotificationToUser(activeConv.claimed_by, {
          title: `${pushName}`,
          body: content ? content.substring(0, 100) : "Pesan baru saat menunggu",
          url: `/dashboard/conversations/${activeConv.id}`,
          tag: `conv-${activeConv.id}`,
        });
      }
    }
  }
}

function extractMessageText(msg: proto.IWebMessageInfo): string | null {
  const m = msg.message;
  if (!m) return null;

  if (m.conversation) return m.conversation;
  if (m.extendedTextMessage?.text) return m.extendedTextMessage.text;
  if (m.imageMessage?.caption) return m.imageMessage.caption;
  if (m.videoMessage?.caption) return m.videoMessage.caption;
  if (m.documentMessage?.caption) return m.documentMessage.caption;
  return null;
}

function getMessageContentType(msg: proto.IWebMessageInfo): string {
  const m = msg.message;
  if (!m) return "text";
  if (m.imageMessage) return "image";
  if (m.videoMessage) return "video";
  if (m.documentMessage) return "document";
  if (m.audioMessage) return "document";
  return "text";
}

const UPLOAD_DIR = join(process.cwd(), "public", "uploads");

async function saveMediaBuffer(
  buffer: Buffer,
  mediaType: string
): Promise<string> {
  // Ensure upload directory exists
  if (!existsSync(UPLOAD_DIR)) {
    mkdirSync(UPLOAD_DIR, { recursive: true });
  }
  const ext = mediaType === "imageMessage" ? "jpg" : mediaType === "videoMessage" ? "mp4" : "bin";
  const id = `${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
  const filePath = join(UPLOAD_DIR, id);
  writeFileSync(filePath, buffer);
  return `/uploads/${id}`;
}

// Expose for conversation resolve flow
export async function generateAndSaveSummary(
  conversationId: string,
  customerId: string
): Promise<string> {
  const { messages } = await getMessages({
    conversationId,
    limit: 100,
  });

  const summary = await generateSummary(
    messages.map((m) => ({ sender: m.sender, content: m.content }))
  );

  await db
    .update(schema.customers)
    .set({ last_summary: summary })
    .where(eq(schema.customers.id, customerId));

  return summary;
}
