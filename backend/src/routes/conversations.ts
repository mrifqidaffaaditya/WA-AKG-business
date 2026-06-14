import { Router, type Response, type NextFunction } from "express";
import { authenticate, type AuthRequest } from "../middleware/auth.js";
import { requestDashboardBroadcast } from "../services/dashboard.js";
import {
  getConversations,
  getMessages,
  getConversation,
  addMessage,
  claimConversation,
  transferConversation,
  resolveConversation,
  getQueueCount,
  type ConversationStatus,
} from "../services/conversation.js";
import { sendWaMessage } from "../services/waGateway.js";
import { emitToUser, emitToRole, broadcast } from "../ws/index.js";
import { generateAndSaveSummary } from "../services/orchestrator.js";
import { logger } from "../utils/logger.js";
import { sendNotificationToUser } from "../services/notifications.js";
import { getCsConfig } from "../services/csConfig.js";
import { notifyClaim, notifyResolve } from "../services/waGroupNotif.js";
import { createAuditLog } from "../utils/audit.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";
import { writeFileSync, existsSync, mkdirSync } from "fs";
import { join } from "path";

const MAX_UPLOAD_SIZE = 10 * 1024 * 1024; // 10 MB

const router = Router();

router.use(authenticate);

function getUser(req: AuthRequest): { sub: string; role: string } {
  if (!req.user) throw new Error("Not authenticated");
  return req.user;
}

type ConversationWithName = NonNullable<Awaited<ReturnType<typeof getConversation>>>;

async function requireConversationAccess(
  req: AuthRequest,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const id = req.params.id as string;
    const user = getUser(req);
    const conv = await getConversation(id);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    (req as unknown as { conversation: ConversationWithName }).conversation = conv;
    next();
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
}

router.get("/cs-config", async (_req, res) => {
  try {
    const config = await getCsConfig();
    res.json(config);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req: AuthRequest, res) => {
  try {
    const { status, cursor, limit, claimed_by } = req.query;
    let resolvedClaimedBy = claimed_by as string | undefined;
    if (resolvedClaimedBy === "me" && req.user) {
      resolvedClaimedBy = req.user.sub;
    }
    const result = await getConversations({
      cursor: cursor as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      status: status as ConversationStatus | undefined,
      claimedBy: resolvedClaimedBy,
    });
    res.json(result);
  } catch (err) {
    logger.error("[conversations] List error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/queue-count", async (_req, res) => {
  try {
    const count = await getQueueCount();
    res.json({ count });
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id", requireConversationAccess, async (req: AuthRequest, res: Response) => {
  const conv = (req as unknown as { conversation: ConversationWithName }).conversation;
  res.json(conv);
});

router.get("/:id/messages", requireConversationAccess, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const { cursor, limit } = req.query;
    const result = await getMessages({
      conversationId: id,
      cursor: cursor as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      direction: "older",
    });
    res.json(result);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/messages", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = getUser(req);
    const { content, contentType, mediaUrl, fileData, fileName, quotedMessageId } = req.body as Record<string, unknown>;
    const conv = await getConversation(id);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    let convStatus = conv.status;
    let convClaimedBy = conv.claimed_by;

    if (convStatus === "resolved") {
      const now = new Date().toISOString();
      await db
        .update(schema.conversations)
        .set({ status: "active", claimed_by: user.sub, updated_at: now })
        .where(eq(schema.conversations.id, id));

      broadcast("conversation:claimed", { conversationId: id, claimedBy: user.sub, status: "active" });
      broadcast("conversation:status", { conversationId: id, status: "active", claimedBy: user.sub });
      requestDashboardBroadcast();

      createAuditLog({
        userId: user.sub,
        action: "claim_conversation",
        entityType: "conversations",
        entityId: id,
        details: JSON.stringify({ customer: conv.customer_name || conv.wa_number }),
      });

      const csUserRows = await db.select().from(schema.users).where(eq(schema.users.id, user.sub)).limit(1);
      const csUser = csUserRows[0];
      const csName = csUser?.name || "CS";
      notifyClaim(conv.customer_name || conv.wa_number, csName, id).catch((err) =>
        logger.warn("[conversations] Claim notification failed:", err)
      );

      convStatus = "active";
      convClaimedBy = user.sub;
    }

    if (user.role === "cs" && convClaimedBy !== user.sub && convStatus !== "waiting" && convStatus !== "bot") {
      res.status(403).json({ error: "You can only send messages to your claimed conversations" });
      return;
    }

    if (convStatus === "bot" || convStatus === "waiting") {
      await claimConversation(id, user.sub);
    }

    const csUserRows = await db.select().from(schema.users).where(eq(schema.users.id, user.sub)).limit(1);
    const csUser = csUserRows[0];

    let finalContent = content as string | undefined;
    const csConfig = await getCsConfig();
    if (csConfig.signatureEnabled && csConfig.signatureTemplate && csUser && finalContent) {
      const footer = csConfig.signatureTemplate.replace("{name}", csUser.name);
      finalContent = `${finalContent}\n\n${footer}`;
    }

    let savedMediaUrl = mediaUrl as string | undefined;
    let localFilePath: string | null = null;

    if (fileData) {
      let base64Content = fileData as string;
      if (base64Content.startsWith("data:") && base64Content.includes(";base64,")) {
        const parts = base64Content.split(";base64,");
        base64Content = parts[1] || "";
      }

      // Estimate decoded size before allocating (base64 overhead ≈ 1.37×)
      const estimatedSize = Math.ceil(base64Content.length * 0.75);
      if (estimatedSize > MAX_UPLOAD_SIZE) {
        res.status(400).json({ error: "File size exceeds maximum allowed size (10 MB)" });
        return;
      }

      const buffer = Buffer.from(base64Content, "base64");

      if (buffer.length > MAX_UPLOAD_SIZE) {
        res.status(400).json({ error: "File size exceeds maximum allowed size (10 MB)" });
        return;
      }

      const ext = fileName ? (fileName as string).split(".").pop() : "bin";
      const cleanedFileName = fileName ? (fileName as string).replace(/[^a-zA-Z0-9.\-_]/g, "_") : `file_${Date.now()}`;
      const uniqueName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}_${cleanedFileName}`;

      const uploadDir = join(process.cwd(), "public", "uploads");
      if (!existsSync(uploadDir)) {
        mkdirSync(uploadDir, { recursive: true });
      }

      const filePath = join(uploadDir, uniqueName);
      writeFileSync(filePath, buffer);

      savedMediaUrl = `/uploads/${uniqueName}`;
      localFilePath = filePath;
    }

    let replyToContent: string | undefined = undefined;
    let replyToSender: string | undefined = undefined;
    if (quotedMessageId) {
      const qRows = await db
        .select()
        .from(schema.messages)
        .where(eq(schema.messages.id, quotedMessageId as string))
        .limit(1);
      if (qRows.length > 0) {
        const qm = qRows[0];
        replyToContent = qm.content || "";
        if (qm.sender === "cs") {
          const qUserRows = await db.select().from(schema.users).where(eq(schema.users.id, qm.cs_id || "")).limit(1);
          replyToSender = qUserRows[0]?.name || "CS";
        } else if (qm.sender === "bot") {
          replyToSender = "Bot";
        } else {
          replyToSender = conv.customer_name || conv.wa_number;
        }
      }
    }

    const msg = await addMessage({
      conversationId: id,
      sender: "cs",
      csId: user.sub,
      content: finalContent,
      contentType: (contentType as "text" | "image" | "video" | "document") || "text",
      mediaUrl: savedMediaUrl,
      fileName: fileName as string | undefined,
      replyToContent,
      replyToSender,
    });

    try {
      const waContent: Record<string, unknown> = {};
      let mediaPath: string | null = localFilePath;
      if (!mediaPath && savedMediaUrl && savedMediaUrl.startsWith("/uploads/")) {
        const filename = savedMediaUrl.substring("/uploads/".length);
        mediaPath = join(process.cwd(), "public", "uploads", filename);
      }

      if (contentType === "image" && savedMediaUrl) {
        waContent.image = { url: mediaPath || savedMediaUrl };
        if (finalContent) waContent.caption = finalContent;
      } else if (contentType === "video" && savedMediaUrl) {
        waContent.video = { url: mediaPath || savedMediaUrl };
        if (finalContent) waContent.caption = finalContent;
      } else if (contentType === "document" && savedMediaUrl) {
        waContent.document = { url: mediaPath || savedMediaUrl };
        if (finalContent) waContent.caption = finalContent;
        waContent.fileName = (fileName as string) || savedMediaUrl.split("/").pop();
      } else {
        waContent.text = finalContent;
      }

      let quotedOption: any = undefined;
      if (quotedMessageId) {
        const quotedRows = await db
          .select()
          .from(schema.messages)
          .where(eq(schema.messages.id, quotedMessageId as string))
          .limit(1);
        if (quotedRows.length > 0) {
          const qm = quotedRows[0];
          const fromMe = qm.sender === "cs" || qm.sender === "bot";
          let customerJid: string | null = null;
          const custRows = await db
            .select()
            .from(schema.customers)
            .where(eq(schema.customers.id, conv.customer_id))
            .limit(1);
          if (custRows.length > 0) {
            customerJid = custRows[0].jid;
          }
          quotedOption = {
            key: {
              remoteJid: customerJid || `${conv.wa_number}@s.whatsapp.net`,
              fromMe: fromMe,
              id: qm.wa_message_id || qm.id,
            },
            message: {
              conversation: qm.content || "",
            },
          };
        }
      }

      if (conv.wa_number) {
        await sendWaMessage(conv.wa_number, waContent as any, quotedOption ? { quoted: quotedOption } : undefined);
      }
    } catch (waErr) {
      logger.error("[conversations] WA send error:", waErr);
    }

    const messageWithCsName = { ...msg, cs_name: csUser?.name || null };
    broadcast("conversation:message", { conversationId: id, message: messageWithCsName });
    res.status(201).json(messageWithCsName);
  } catch (err) {
    logger.error("[conversations] Message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/claim", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = getUser(req);
    const conv = await getConversation(id);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    if (conv.status !== "waiting" && conv.status !== "bot") {
      res.status(400).json({ error: "Only waiting or bot conversations can be claimed" });
      return;
    }

    const updated = await claimConversation(id, user.sub);

    broadcast("conversation:claimed", { conversationId: id, claimedBy: user.sub, status: "active" });
    broadcast("conversation:status", { conversationId: id, status: "active", claimedBy: user.sub });

    sendNotificationToUser(user.sub, {
      title: "Percakapan Diklaim",
      body: `Anda mengambil percakapan ${conv.customer_name || conv.wa_number}`,
      tag: `claim-${id}`,
    }).catch((notifErr) => logger.warn("[conversations] Claim notification failed:", notifErr));

    const queueCount = await getQueueCount();
    broadcast("queue:update", { count: queueCount });
    requestDashboardBroadcast();

    const csUserRows = await db.select().from(schema.users).where(eq(schema.users.id, user.sub)).limit(1);
    const csUser = csUserRows[0];
    const csName = csUser?.name || "CS";

    createAuditLog({
      userId: user.sub,
      action: "claim_conversation",
      entityType: "conversations",
      entityId: id,
      details: JSON.stringify({ customer: conv.customer_name || conv.wa_number }),
    });

    notifyClaim(conv.customer_name || conv.wa_number, csName, id).catch(
      (err: unknown) => logger.error("[conversations] Failed to send claim notif:", err)
    );

    const csConfig = await getCsConfig();

    if (csConfig.autoReplyClaimEnabled && csConfig.autoReplyClaim) {
      const claimMessage = csConfig.autoReplyClaim.replace("{name}", csName);
      const msg = await addMessage({
        conversationId: id,
        sender: "cs",
        csId: user.sub,
        content: claimMessage,
        contentType: "text",
      });
      try {
        if (conv.wa_number) {
          await sendWaMessage(conv.wa_number, { text: claimMessage });
        }
      } catch (err) {
        logger.error("[conversations] Failed to send auto reply claim:", err);
      }
      const messageWithCsName = { ...msg, cs_name: csName };
      broadcast("conversation:message", { conversationId: id, message: messageWithCsName });
    }

    res.json(updated);
  } catch (err) {
    logger.error("[conversations] Claim error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/transfer", async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = getUser(req);
    const { toCsId } = req.body as Record<string, string>;
    if (!toCsId) { res.status(400).json({ error: "toCsId is required" }); return; }

    const conv = await getConversation(id);
    if (!conv) { res.status(404).json({ error: "Conversation not found" }); return; }
    if (conv.claimed_by !== user.sub && user.role === "cs") {
      res.status(403).json({ error: "Only the assigned CS or admin can transfer" });
      return;
    }

    const updated = await transferConversation(id, user.sub, toCsId);

    broadcast("conversation:status", { conversationId: id, status: "active", claimedBy: toCsId });
    emitToUser(toCsId, "conversation:transferred", { conversationId: id, from: user.sub, customerName: conv.customer_name || conv.wa_number });
    sendNotificationToUser(toCsId, { title: "Percakapan dialihkan ke Anda", body: `Percakapan dari ${conv.customer_name || conv.wa_number} dialihkan`, tag: "transfer" });
    requestDashboardBroadcast();

    res.json(updated);
  } catch (err) {
    logger.error("[conversations] Transfer error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/resolve", requireConversationAccess, async (req: AuthRequest, res: Response) => {
  try {
    const id = req.params.id as string;
    const user = getUser(req);
    const conv = (req as unknown as { conversation: ConversationWithName }).conversation;

    const { rating, review } = req.body as Record<string, unknown>;

    if (rating !== undefined && rating !== null) {
      const ratingNum = Number(rating);
      if (!Number.isInteger(ratingNum) || ratingNum < 1 || ratingNum > 5) {
        res.status(400).json({ error: "Rating must be an integer between 1 and 5" });
        return;
      }
    }

    const updated = await resolveConversation(id, rating as number | undefined, review as string | undefined);

    generateAndSaveSummary(id, conv.customer_id).catch((err: unknown) => {
      logger.error("[conversations] Summary generation error:", err);
    });

    broadcast("conversation:status", { conversationId: id, status: "resolved" });
    broadcast("queue:update", { count: await getQueueCount() });

    const csUserRows = await db.select().from(schema.users).where(eq(schema.users.id, user.sub)).limit(1);
    const csUser = csUserRows[0];
    const csName = csUser?.name || "CS";

    createAuditLog({
      userId: user.sub,
      action: "resolve_conversation",
      entityType: "conversations",
      entityId: id,
      details: JSON.stringify({ customer: conv.customer_name || conv.wa_number, rating: rating || null }),
    });

    notifyResolve(conv.customer_name || conv.wa_number, csName, rating as number | null | undefined, id).catch(
      (err: unknown) => logger.error("[conversations] Failed to send resolve notif:", err)
    );

    const csConfig = await getCsConfig();

    if (csConfig.autoReplyResolveEnabled && csConfig.autoReplyResolve) {
      const resolveMessage = csConfig.autoReplyResolve.replace("{name}", csName);
      const msg = await addMessage({
        conversationId: id,
        sender: "cs",
        csId: user.sub,
        content: resolveMessage,
        contentType: "text",
      });
      try {
        if (conv.wa_number) {
          await sendWaMessage(conv.wa_number, { text: resolveMessage });
        }
      } catch (err) {
        logger.error("[conversations] Failed to send auto reply resolve:", err);
      }
      const messageWithCsName = { ...msg, cs_name: csName };
      broadcast("conversation:message", { conversationId: id, message: messageWithCsName });
    }

    res.json(updated);
  } catch (err) {
    logger.error("[conversations] Resolve error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
