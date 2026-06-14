// @ts-nocheck
import { Router, Request, Response } from "express";
import { authenticate, requireRole, AuthRequest } from "../middleware/auth.js";
import {
  getConversations,
  getMessages,
  getConversation,
  addMessage,
  claimConversation,
  transferConversation,
  resolveConversation,
  getQueueCount,
} from "../services/conversation.js";
import { sendWaMessage } from "../services/waGateway.js";
import { emitToUser, emitToRole, broadcast } from "../ws/index.js";
import { generateAndSaveSummary } from "../services/orchestrator.js";
import { logger } from "../utils/logger.js";
import { sendNotificationToUser } from "../services/notifications.js";
import { getCsConfig } from "../services/csConfig.js";
import { db, schema } from "../db/index.js";
import { eq } from "drizzle-orm";

const router = Router();

router.use(authenticate);

router.get("/cs-config", async (_req, res) => {
  try {
    const config = getCsConfig();
    res.json(config);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/", async (req: AuthRequest, res) => {
  try {
    const { status, cursor, limit, claimed_by } = req.query;
    let resolvedClaimedBy = claimed_by as string | undefined;
    // Resolve "me" to actual user ID
    if (resolvedClaimedBy === "me" && req.user) {
      resolvedClaimedBy = req.user.sub;
    }
    const result = await getConversations({
      cursor: cursor as string | undefined,
      limit: limit ? parseInt(limit as string, 10) : undefined,
      status: status as string | undefined,
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

router.get("/:id", async (req, res) => {
  try {
    const conv = await getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    res.json(conv);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.get("/:id/messages", async (req, res) => {
  try {
    const { cursor, limit } = req.query;
    const result = await getMessages({
      conversationId: req.params.id,
      cursor: cursor,
      limit: limit ? parseInt(limit, 10) : undefined,
      direction: "older",
    });
    res.json(result);
  } catch {
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/messages", async (req, res) => {
  try {
    const { content, contentType, mediaUrl } = req.body;
    const conv = await getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    if (conv.status === "resolved") return res.status(400).json({ error: "Conversation is resolved" });

    if (conv.status === "bot" || conv.status === "waiting") {
      await claimConversation(req.params.id, req.user.sub);
    }

    const csUserRows = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.sub)).limit(1);
    const csUser = csUserRows[0];
    
    let finalContent = content;
    const csConfig = getCsConfig();
    if (csConfig.signatureEnabled && csConfig.signatureTemplate && csUser && finalContent) {
      const footer = csConfig.signatureTemplate.replace("{name}", csUser.name);
      finalContent = `${finalContent}\n\n${footer}`;
    }

    const msg = await addMessage({
      conversationId: req.params.id,
      sender: "cs",
      csId: req.user!.sub,
      content: finalContent,
      contentType: contentType || "text",
      mediaUrl: mediaUrl,
    });

    try {
      const waContent: any = { text: finalContent };
      if (contentType === "image" && mediaUrl) {
        waContent.image = { url: mediaUrl };
        waContent.caption = content;
      } else if (contentType === "document" && mediaUrl) {
        waContent.document = { url: mediaUrl };
        waContent.caption = content;
      }
      await sendWaMessage(conv.wa_number, waContent);
    } catch (waErr) {
      logger.error("[conversations] WA send error:", waErr);
    }

    const messageWithCsName = { ...msg, cs_name: csUser?.name || null };
    broadcast("conversation:message", { conversationId: req.params.id, message: messageWithCsName });
    res.status(201).json(messageWithCsName);
  } catch (err) {
    logger.error("[conversations] Message error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/claim", async (req, res) => {
  try {
    const conv = await getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    if (conv.status !== "waiting" && conv.status !== "bot") return res.status(400).json({ error: "Only waiting or bot conversations can be claimed" });

    const updated = await claimConversation(req.params.id, req.user.sub);

    broadcast("conversation:claimed", { conversationId: req.params.id, claimedBy: req.user.sub, status: "active" });
    broadcast("conversation:status", { conversationId: req.params.id, status: "active", claimedBy: req.user.sub });

    // Notify all CS about the claim
    sendNotificationToUser(req.user.sub, {
      title: "Percakapan Diklaim",
      body: `Anda mengambil percakapan ${conv.customer_name || conv.wa_number}`,
      tag: `claim-${req.params.id}`,
    }).catch(() => {});

    const queueCount = await getQueueCount();
    broadcast("queue:update", { count: queueCount });

    // Send Auto Reply Claim
    const csUserRows = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.sub)).limit(1);
    const csUser = csUserRows[0];
    const csConfig = getCsConfig();
    
    if (csConfig.autoReplyClaimEnabled && csConfig.autoReplyClaim) {
      const claimMessage = csConfig.autoReplyClaim.replace("{name}", csUser?.name || "CS");
      const msg = await addMessage({
        conversationId: req.params.id,
        sender: "cs",
        csId: req.user!.sub,
        content: claimMessage,
        contentType: "text",
      });
      try {
        await sendWaMessage(conv.wa_number, { text: claimMessage });
      } catch (err) {
        logger.error("[conversations] Failed to send auto reply claim:", err);
      }
      const messageWithCsName = { ...msg, cs_name: csUser?.name || null };
      broadcast("conversation:message", { conversationId: req.params.id, message: messageWithCsName });
    }

    res.json(updated);
  } catch (err) {
    logger.error("[conversations] Claim error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/transfer", async (req: AuthRequest, res) => {
  try {
    const { toCsId } = req.body;
    if (!toCsId) return res.status(400).json({ error: "toCsId is required" });

    const conv = await getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });
    // Authorization: only the CS who claimed or admin can transfer
    if (conv.claimed_by !== req.user!.sub && req.user!.role === "cs") {
      return res.status(403).json({ error: "Only the assigned CS or admin can transfer" });
    }

    const updated = await transferConversation(req.params.id, req.user.sub, toCsId);

    broadcast("conversation:status", { conversationId: req.params.id, status: "active", claimedBy: toCsId });
    emitToUser(toCsId, "conversation:transferred", { conversationId: req.params.id, from: req.user.sub, customerName: conv.customer_name || conv.wa_number });

    sendNotificationToUser(toCsId, { title: "Percakapan dialihkan ke Anda", body: `Percakapan dari ${conv.customer_name || conv.wa_number} dialihkan`, tag: "transfer" });

    res.json(updated);
  } catch (err) {
    logger.error("[conversations] Transfer error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

router.post("/:id/resolve", async (req: AuthRequest, res) => {
  try {
    const conv = await getConversation(req.params.id);
    if (!conv) return res.status(404).json({ error: "Conversation not found" });

    const { rating, review } = req.body;
    const updated = await resolveConversation(req.params.id, rating, review);

    // Generate AI summary asynchronously
    generateAndSaveSummary(req.params.id, conv.customer_id).catch((err) => {
      logger.error("[conversations] Summary generation error:", err);
    });

    broadcast("conversation:status", { conversationId: req.params.id, status: "resolved" });
    broadcast("queue:update", { count: await getQueueCount() });

    // Send Auto Reply Resolve
    const csUserRows = await db.select().from(schema.users).where(eq(schema.users.id, req.user!.sub)).limit(1);
    const csUser = csUserRows[0];
    const csConfig = getCsConfig();
    
    if (csConfig.autoReplyResolveEnabled && csConfig.autoReplyResolve) {
      const resolveMessage = csConfig.autoReplyResolve.replace("{name}", csUser?.name || "CS");
      const msg = await addMessage({
        conversationId: req.params.id,
        sender: "cs",
        csId: req.user!.sub,
        content: resolveMessage,
        contentType: "text",
      });
      try {
        await sendWaMessage(conv.wa_number, { text: resolveMessage });
      } catch (err) {
        logger.error("[conversations] Failed to send auto reply resolve:", err);
      }
      const messageWithCsName = { ...msg, cs_name: csUser?.name || null };
      broadcast("conversation:message", { conversationId: req.params.id, message: messageWithCsName });
    }

    res.json(updated);
  } catch (err) {
    logger.error("[conversations] Resolve error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
});

export default router;

