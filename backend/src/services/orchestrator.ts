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
  getLatestConversation,
  updateConversationRating,
} from "./conversation.js";
import { generateBotResponse, detectEscalation, generateSummary } from "./chatbot.js";
import { emitToUser, emitToRole, broadcast } from "../ws/index.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { sendNotificationToAllCs, sendNotificationToUser, sendNotificationToAllAdmins } from "./notifications.js";
import { requestDashboardBroadcast } from "./dashboard.js";
import { notifyNewCustomer, notifyEscalation } from "./waGroupNotif.js";
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
  if (key.fromMe) return; // Skip messages sent by CS/bot to prevent loop/duplication

  // Prevent duplicate message processing
  if (key.id) {
    const existing = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.wa_message_id, key.id))
      .limit(1);
    if (existing.length > 0) {
      logger.debug(`[orchestrator] Message ${key.id} already exists, skipping.`);
      return;
    }
  }

  const jid = key.remoteJid;

  const content = extractMessageText(msg);

  if (content && content.trim().toLowerCase() === "!jid") {
    try {
      await sendWaMessage(jid, { text: `JID: ${jid}` });
    } catch (err) {
      logger.error("[orchestrator] Failed to send !jid reply:", err);
    }
    return;
  }

  if (jid.includes("@g.us")) return;

  const contentType = getMessageContentType(msg);

  // Skip read receipts, delivery updates, and reactions (empty text/content type text)
  if (!content && contentType === "text") {
    logger.debug(`[orchestrator] Empty text message (likely receipt/protocol), skipping: ${key.id}`);
    return;
  }

  // Prefer key.senderPn (real phone number JID) over remoteJid (which might be a LID)
  const phoneJid = (key as any).senderPn || jid;
  const waNumber = extractWaNumber(phoneJid);
  const pushName = msg.pushName || waNumber;

  const { customer, isNew } = await findOrCreateCustomer({
    waNumber,
    displayName: pushName,
    jid,
  });

  if (isNew) {
    notifyNewCustomer(pushName, waNumber).catch(
      (err: unknown) => logger.error("[orchestrator] Failed to send new customer notif:", err)
    );
  }

  let activeConv = await findActiveConversation(customer.id);

  // If there's no active conversation, check if it's a rating response
  if (!activeConv && content && /^[1-5]$/.test(content.trim())) {
    const lastConv = await getLatestConversation(customer.id);
    if (lastConv && lastConv.status === "resolved" && !lastConv.rating) {
      const ratingNum = parseInt(content.trim(), 10);
      await updateConversationRating(lastConv.id, ratingNum);
      try {
        await sendWaMessage(jid, { text: "Terima kasih atas penilaian Anda!" });
      } catch (err) {
        logger.error("[orchestrator] Failed to send rating thanks", err);
      }
      return;
    }
  }

  if (!activeConv) {
    activeConv = await createConversation({
      customerId: customer.id,
      waNumber,
      customerName: pushName,
    });
    broadcast("conversation:new", {
      id: activeConv.id,
      wa_number: waNumber,
      customer_name: pushName,
      status: "bot",
      claimed_by: null,
      updated_at: new Date().toISOString(),
    });
    await emitQueueCount();
  }

  let savedMsg: typeof schema.messages.$inferSelect | null = null;

  const contextInfo = msg.message?.extendedTextMessage?.contextInfo ||
                      msg.message?.imageMessage?.contextInfo ||
                      msg.message?.videoMessage?.contextInfo ||
                      msg.message?.documentMessage?.contextInfo;

  let replyToContent: string | undefined = undefined;
  let replyToSender: string | undefined = undefined;

  if (contextInfo) {
    const quotedMsgId = contextInfo.stanzaId;
    if (quotedMsgId) {
      const quotedRows = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.wa_message_id, quotedMsgId))
        .limit(1);
      if (quotedRows.length > 0) {
        const qm = quotedRows[0];
        replyToContent = qm.content || "";
        if (qm.sender === "cs") {
          const qUserRows = await db.select().from(schema.users).where(eq(schema.users.id, qm.cs_id || "")).limit(1);
          replyToSender = qUserRows[0]?.name || "CS";
        } else if (qm.sender === "bot") {
          replyToSender = "Bot";
        } else {
          replyToSender = customer.display_name || customer.wa_number;
        }
      } else {
        const qMsg = contextInfo.quotedMessage;
        if (qMsg) {
          replyToContent = qMsg.conversation || qMsg.extendedTextMessage?.text || qMsg.imageMessage?.caption || qMsg.videoMessage?.caption || "";
          replyToSender = contextInfo.participant ? (contextInfo.participant.includes("@s.whatsapp.net") ? "Customer" : "CS") : "Pesan";
        }
      }
    }
  }

  if (content || contentType !== "text") {
    let mediaUrl: string | undefined;
    let mediaType: string | undefined;
    let fileName: string | undefined;
    let fileSize: number | undefined;

    if (contentType !== "text") {
      const messageType = Object.keys(msg.message || {})[0];
      const media = await downloadWaMedia(msg as any);
      mediaType = messageType;
      const messagePayload = msg.message ? (msg.message as Record<string, unknown>)[messageType] as Record<string, unknown> : undefined;
      const lengthVal = messagePayload?.fileLength;
      if (lengthVal !== undefined && lengthVal !== null) {
        if (typeof lengthVal === "object" && typeof (lengthVal as any).toNumber === "function") {
          fileSize = (lengthVal as any).toNumber();
        } else if (typeof lengthVal === "number") {
          fileSize = lengthVal;
        } else {
          fileSize = parseInt(String(lengthVal), 10);
        }
      }
      fileName = (messagePayload?.fileName as string) || undefined;
      mediaUrl = media ? await saveMediaBuffer(media, mediaType) : undefined;
    }

    savedMsg = await addMessage({
      conversationId: activeConv.id,
      sender: "customer",
      content: content || undefined,
      contentType: contentType as "text" | "image" | "video" | "document",
      mediaUrl: mediaUrl || undefined,
      mediaType: mediaType || undefined,
      fileName: fileName || undefined,
      fileSize: fileSize || undefined,
      waMessageId: msg.key?.id || undefined,
      replyToContent,
      replyToSender,
    });
  } else {
    savedMsg = await addMessage({
      conversationId: activeConv.id,
      sender: "customer",
      content: "",
      contentType: "text",
      waMessageId: msg.key?.id || undefined,
      replyToContent,
      replyToSender,
    });
  }

  if (savedMsg) {
    requestDashboardBroadcast();
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
        requestDashboardBroadcast();

        sendNotificationToAllCs({
          title: `${pushName} menunggu dilayani CS`,
          body: content ? content.substring(0, 100) : "Pelanggan baru di antrian",
          url: `/dashboard/conversations/${activeConv.id}`,
          tag: "new-queue",
        }).catch((err) => logger.error("[notif] Failed:", err));

        notifyEscalation(pushName, waNumber, activeConv.id).catch(
          (err: unknown) => logger.error("[orchestrator] Failed to send escalation notif:", err)
        );
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
