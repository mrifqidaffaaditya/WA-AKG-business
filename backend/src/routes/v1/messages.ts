import { Router, Response } from "express";
import { ApiKeyRequest, requireScope } from "../../middleware/apiKeyAuth.js";
import { findOrCreateCustomer, findActiveConversation, createConversation, addMessage } from "../../services/conversation.js";
import { sendWaMessage, sendInteractiveMessage, extractWaNumber, getJid } from "../../services/waGateway.js";
import { normalizeInteractivePayload, describeInteractivePayload } from "../../services/interactive.js";
import { dispatchWebhookEvent } from "../../services/webhook.js";
import { broadcast } from "../../ws/index.js";
import { logger } from "../../utils/logger.js";
import type { AnyMessageContent } from "@whiskeysockets/baileys";

const router = Router();

/**
 * POST /api/v1/messages/send
 * Send a single WhatsApp message (text, image, video, document)
 */
router.post("/send", requireScope("messages:send"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { to, content, contentType = "text", mediaUrl, fileName } = req.body;

    if (!to || typeof to !== "string") {
      res.status(400).json({ error: "Field 'to' (phone number or JID) is required" });
      return;
    }

    if (!content && !mediaUrl) {
      res.status(400).json({ error: "Either 'content' or 'mediaUrl' is required" });
      return;
    }

    const waNumber = extractWaNumber(to);
    if (!waNumber || waNumber.length < 7) {
      res.status(400).json({ error: "Invalid phone number format" });
      return;
    }

    const { customer } = await findOrCreateCustomer({
      waNumber,
      jid: to.includes("@") ? to : undefined,
    });

    let conv = await findActiveConversation(customer.id);
    if (!conv) {
      conv = await createConversation({
        customerId: customer.id,
        waNumber,
        customerName: customer.display_name || waNumber,
      });
    }

    // Build Baileys message content
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
      waContent.fileName = fileName || mediaUrl.split("/").pop() || "document";
    } else {
      waContent.text = content || "";
    }

    const targetJid = customer.jid || getJid(waNumber);
    const waResult = await sendWaMessage(targetJid, waContent as AnyMessageContent);

    const senderType = req.user?.role === "cs" ? "cs" : "bot";
    const csId = req.user?.id || undefined;

    const savedMsg = await addMessage({
      conversationId: conv.id,
      sender: senderType,
      csId,
      content: content || undefined,
      contentType: (contentType as "text" | "image" | "video" | "document") || "text",
      mediaUrl: mediaUrl || undefined,
      fileName: fileName || undefined,
      waMessageId: waResult?.key?.id || undefined,
    });

    // Realtime notification over WebSocket
    broadcast("message:new", {
      conversationId: conv.id,
      message: savedMsg,
      customerName: customer.display_name || waNumber,
      waNumber,
    });

    // Dispatch webhook event
    dispatchWebhookEvent("message.sent", {
      conversationId: conv.id,
      customer: {
        id: customer.id,
        waNumber,
        displayName: customer.display_name,
      },
      message: {
        id: savedMsg.id,
        sender: senderType,
        contentType,
        content,
        mediaUrl,
        waMessageId: waResult?.key?.id,
        createdAt: savedMsg.created_at,
      },
      apiKey: req.apiKey ? { id: req.apiKey.id, name: req.apiKey.name } : null,
    });

    res.status(200).json({
      success: true,
      messageId: savedMsg.id,
      conversationId: conv.id,
      waMessageId: waResult?.key?.id || null,
      to: waNumber,
      sentAt: savedMsg.created_at,
    });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/messages/send] Error:", err);
    res.status(500).json({ error: "Failed to send message", details: msg });
  }
});

/**
 * POST /api/v1/messages/interactive
 * Send a rich interactive message (buttons / list menu).
 *
 * Body: { to, title?, body, footer?, buttons? | options? | sections? }
 */
router.post("/interactive", requireScope("messages:send"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { to, ...payload } = req.body;

    if (!to || typeof to !== "string") {
      res.status(400).json({ error: "Field 'to' (phone number or JID) is required" });
      return;
    }

    const normalized = normalizeInteractivePayload(payload);
    const hasButtons = Array.isArray(normalized.buttons) && normalized.buttons.length > 0;

    if (!normalized.body && !normalized.title) {
      res.status(400).json({ error: "Either 'body' or 'title' is required" });
      return;
    }
    if (!hasButtons) {
      res.status(400).json({ error: "At least one button/option is required" });
      return;
    }

    const waNumber = extractWaNumber(to);
    if (!waNumber || waNumber.length < 7) {
      res.status(400).json({ error: "Invalid phone number format" });
      return;
    }

    const { customer } = await findOrCreateCustomer({
      waNumber,
      jid: to.includes("@") ? to : undefined,
    });

    let conv = await findActiveConversation(customer.id);
    if (!conv) {
      conv = await createConversation({
        customerId: customer.id,
        waNumber,
        customerName: customer.display_name || waNumber,
      });
    }

    const targetJid = customer.jid || getJid(waNumber);
    let waResult;
    try {
      waResult = await sendInteractiveMessage(targetJid, normalized);
    } catch (sendErr) {
      const msg = sendErr instanceof Error ? sendErr.message : String(sendErr);
      res.status(502).json({ error: "Failed to send interactive message", details: msg });
      return;
    }

    const senderType = req.user?.role === "cs" ? "cs" : "bot";
    const csId = req.user?.id || undefined;

    const savedMsg = await addMessage({
      conversationId: conv.id,
      sender: senderType,
      csId,
      content: describeInteractivePayload(normalized),
      contentType: "text",
      mediaType: "interactive",
      waMessageId: waResult?.key?.id || undefined,
    });

    broadcast("message:new", {
      conversationId: conv.id,
      message: savedMsg,
      customerName: customer.display_name || waNumber,
      waNumber,
    });

    dispatchWebhookEvent("message.sent", {
      conversationId: conv.id,
      customer: {
        id: customer.id,
        waNumber,
        displayName: customer.display_name,
      },
      message: {
        id: savedMsg.id,
        sender: senderType,
        contentType: "interactive",
        content: normalized.body,
        waMessageId: waResult?.key?.id,
        createdAt: savedMsg.created_at,
      },
      apiKey: req.apiKey ? { id: req.apiKey.id, name: req.apiKey.name } : null,
    });

    res.status(200).json({
      success: true,
      messageId: savedMsg.id,
      conversationId: conv.id,
      waMessageId: waResult?.key?.id || null,
      to: waNumber,
      sentAt: savedMsg.created_at,
    });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/messages/interactive] Error:", err);
    res.status(500).json({ error: "Failed to send interactive message", details: msg });
  }
});

/**
 * POST /api/v1/messages/broadcast
 * Broadcast a message to a list of recipients with rate-controlled staggered delivery
 */
router.post("/broadcast", requireScope("messages:broadcast"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { recipients, content, contentType = "text", mediaUrl, fileName, delayMs = 800 } = req.body;

    if (!Array.isArray(recipients) || recipients.length === 0) {
      res.status(400).json({ error: "Field 'recipients' must be a non-empty array of phone numbers" });
      return;
    }

    if (recipients.length > 500) {
      res.status(400).json({ error: "Maximum broadcast batch size is 500 recipients" });
      return;
    }

    if (!content && !mediaUrl) {
      res.status(400).json({ error: "Either 'content' or 'mediaUrl' is required" });
      return;
    }

    const safeDelay = Math.max(500, Math.min(5000, Number(delayMs) || 800));
    const estimatedDurationSec = Math.round((recipients.length * safeDelay) / 1000);

    // Run staggered broadcasting in background
    setImmediate(async () => {
      logger.info(`[v1/broadcast] Starting broadcast to ${recipients.length} recipients...`);
      let sentCount = 0;
      let failCount = 0;

      for (let i = 0; i < recipients.length; i++) {
        const rawTo = recipients[i];
        try {
          const waNumber = extractWaNumber(rawTo);
          if (!waNumber || waNumber.length < 7) {
            failCount++;
            continue;
          }

          const { customer } = await findOrCreateCustomer({ waNumber });
          let conv = await findActiveConversation(customer.id);
          if (!conv) {
            conv = await createConversation({
              customerId: customer.id,
              waNumber,
              customerName: customer.display_name || waNumber,
            });
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

          const targetJid = customer.jid || getJid(waNumber);
          const result = await sendWaMessage(targetJid, waContent as AnyMessageContent);

          const saved = await addMessage({
            conversationId: conv.id,
            sender: "bot",
            content: content || null,
            contentType: (contentType as "text" | "image" | "video" | "document") || "text",
            mediaUrl: mediaUrl || null,
            fileName: fileName || null,
            waMessageId: result?.key?.id || undefined,
          });

          broadcast("message:new", {
            conversationId: conv.id,
            message: saved,
            customerName: customer.display_name || waNumber,
            waNumber,
          });

          sentCount++;
        } catch (itemErr) {
          failCount++;
          logger.warn(`[v1/broadcast] Failed delivery to ${rawTo}:`, itemErr);
        }

        // Stagger between deliveries
        if (i < recipients.length - 1) {
          await new Promise((r) => setTimeout(r, safeDelay));
        }
      }

      logger.info(`[v1/broadcast] Finished. Sent: ${sentCount}, Failed: ${failCount}`);
    });

    res.status(202).json({
      success: true,
      queued: recipients.length,
      staggerDelayMs: safeDelay,
      estimatedDurationSeconds: estimatedDurationSec,
      message: "Broadcast queued and delivering in background",
    });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/broadcast] Error:", err);
    res.status(500).json({ error: "Failed to queue broadcast", details: msg });
  }
});

export default router;
