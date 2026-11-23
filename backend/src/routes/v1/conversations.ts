import { Router, Response } from "express";
import { ApiKeyRequest, requireScope } from "../../middleware/apiKeyAuth.js";
import {
  getConversations,
  getConversation,
  getMessages,
  addMessage,
  updateConversationStatus,
  resolveConversation,
} from "../../services/conversation.js";
import { sendWaMessage, getJid } from "../../services/waGateway.js";
import { dispatchWebhookEvent } from "../../services/webhook.js";
import { broadcast } from "../../ws/index.js";
import { logger } from "../../utils/logger.js";
import type { AnyMessageContent } from "@whiskeysockets/baileys";

const router = Router();

/**
 * GET /api/v1/conversations
 * List conversations with filtering and pagination
 */
router.get("/", requireScope("conversations:read"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { status, limit = "20", cursor } = req.query;

    const result = await getConversations({
      status: status as any,
      limit: Math.min(100, Math.max(1, parseInt(limit as string, 10) || 20)),
      cursor: cursor as string | undefined,
    });

    res.json(result);
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/conversations] List error:", err);
    res.status(500).json({ error: "Failed to fetch conversations", details: msg });
  }
});

/**
 * GET /api/v1/conversations/:id
 * Get conversation details and latest messages
 */
router.get("/:id", requireScope("conversations:read"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const conv = await getConversation(id);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const messages = await getMessages({ conversationId: id, limit: 30 });
    res.json({ conversation: conv, messages: messages.messages });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/conversations/:id] Error:", err);
    res.status(500).json({ error: "Failed to fetch conversation", details: msg });
  }
});

/**
 * GET /api/v1/conversations/:id/messages
 * Get message history for a conversation
 */
router.get("/:id/messages", requireScope("conversations:read"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { limit = "30", cursor } = req.query;

    const result = await getMessages({
      conversationId: id,
      limit: Math.min(100, Math.max(1, parseInt(limit as string, 10) || 30)),
      cursor: cursor as string | undefined,
    });

    res.json(result);
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/conversations/:id/messages] Error:", err);
    res.status(500).json({ error: "Failed to fetch messages", details: msg });
  }
});

/**
 * POST /api/v1/conversations/:id/messages
 * Send a message into an existing conversation
 */
router.post("/:id/messages", requireScope("conversations:write"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { content, contentType = "text", mediaUrl, fileName } = req.body;

    const conv = await getConversation(id);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    if (!content && !mediaUrl) {
      res.status(400).json({ error: "Either 'content' or 'mediaUrl' is required" });
      return;
    }

    const waContent: Record<string, unknown> = {};
    if (contentType === "image" && mediaUrl) {
      waContent.image = { url: mediaUrl };
      if (content) waContent.caption = content;
    } else if (contentType === "video" && mediaUrl) {
      waContent.video = { url: mediaUrl };
      if (content) waContent.caption = content;
    } else if (contentType === "document" && mediaUrl) {
      waContent.document = { url: mediaUrl };
      if (content) waContent.caption = content;
      waContent.fileName = fileName || "document";
    } else {
      waContent.text = content || "";
    }

    const targetJid = getJid(conv.wa_number);
    const waResult = await sendWaMessage(targetJid, waContent as AnyMessageContent);

    const sender = req.user?.role === "cs" ? "cs" : "bot";
    const csId = req.user?.id || undefined;

    const saved = await addMessage({
      conversationId: id,
      sender,
      csId,
      content: content || undefined,
      contentType: (contentType as any) || "text",
      mediaUrl: mediaUrl || undefined,
      fileName: fileName || undefined,
      waMessageId: waResult?.key?.id || undefined,
    });

    broadcast("message:new", {
      conversationId: id,
      message: saved,
      customerName: conv.customer_name || conv.wa_number,
      waNumber: conv.wa_number,
    });

    dispatchWebhookEvent("message.sent", {
      conversationId: id,
      customer: {
        waNumber: conv.wa_number,
        name: conv.customer_name,
      },
      message: saved,
    });

    res.status(200).json({
      success: true,
      messageId: saved.id,
      conversationId: id,
      waMessageId: waResult?.key?.id || null,
    });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/conversations/:id/messages] Post error:", err);
    res.status(500).json({ error: "Failed to send message", details: msg });
  }
});

/**
 * PATCH /api/v1/conversations/:id/status
 * Update conversation status
 */
router.patch("/:id/status", requireScope("conversations:write"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { status } = req.body;

    const validStatuses = ["bot", "waiting", "active", "resolved", "hold"];
    if (!validStatuses.includes(status)) {
      res.status(400).json({ error: `Status must be one of: ${validStatuses.join(", ")}` });
      return;
    }

    const conv = await getConversation(id);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const previousStatus = conv.status;
    await updateConversationStatus(id, status);

    broadcast("conversation:status", {
      conversationId: id,
      status,
      previousStatus,
    });

    dispatchWebhookEvent("conversation.status_changed", {
      conversationId: id,
      status,
      previousStatus,
      updatedAt: new Date().toISOString(),
    });

    res.json({ success: true, conversationId: id, status, previousStatus });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/conversations/:id/status] Error:", err);
    res.status(500).json({ error: "Failed to update status", details: msg });
  }
});

/**
 * POST /api/v1/conversations/:id/resolve
 * Resolve conversation
 */
router.post("/:id/resolve", requireScope("conversations:write"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const conv = await getConversation(id);
    if (!conv) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    await resolveConversation(id);

    broadcast("conversation:status", { conversationId: id, status: "resolved" });
    dispatchWebhookEvent("conversation.resolved", {
      conversationId: id,
      resolvedAt: new Date().toISOString(),
    });

    res.json({ success: true, conversationId: id, status: "resolved" });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/conversations/:id/resolve] Error:", err);
    res.status(500).json({ error: "Failed to resolve conversation", details: msg });
  }
});

export default router;
