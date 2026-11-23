import { Router, Response } from "express";
import crypto from "crypto";
import { ApiKeyRequest, requireScope } from "../../middleware/apiKeyAuth.js";
import { db, schema } from "../../db/index.js";
import { eq, desc } from "drizzle-orm";
import { generateId } from "../../utils/id.js";
import {
  isSafeWebhookUrl,
  invalidateWebhookCache,
  testWebhook,
} from "../../services/webhook.js";
import { logger } from "../../utils/logger.js";

const router = Router();

/**
 * GET /api/v1/webhooks
 * List configured webhooks
 */
router.get("/", requireScope("admin"), async (_req: ApiKeyRequest, res: Response) => {
  try {
    const rows = await db
      .select({
        id: schema.webhooks.id,
        name: schema.webhooks.name,
        url: schema.webhooks.url,
        secret: schema.webhooks.secret,
        events: schema.webhooks.events,
        isActive: schema.webhooks.is_active,
        createdAt: schema.webhooks.created_at,
        updatedAt: schema.webhooks.updated_at,
      })
      .from(schema.webhooks)
      .orderBy(desc(schema.webhooks.created_at));

    const formatted = rows.map((h) => {
      let events: string[] = ["*"];
      try {
        events = JSON.parse(h.events);
      } catch {
        events = ["*"];
      }
      return {
        ...h,
        events,
        isActive: Boolean(h.isActive),
      };
    });

    res.json({ webhooks: formatted });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/webhooks] List error:", err);
    res.status(500).json({ error: "Failed to list webhooks", details: msg });
  }
});

/**
 * POST /api/v1/webhooks
 * Create a new webhook endpoint
 */
router.post("/", requireScope("admin"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { name, url, secret, events = ["*"], isActive = true } = req.body;

    if (!name || typeof name !== "string") {
      res.status(400).json({ error: "Field 'name' is required" });
      return;
    }

    if (!url || typeof url !== "string") {
      res.status(400).json({ error: "Field 'url' is required" });
      return;
    }

    const urlCheck = isSafeWebhookUrl(url);
    if (!urlCheck.valid) {
      res.status(400).json({ error: urlCheck.error || "Invalid webhook URL" });
      return;
    }

    const finalSecret = secret && typeof secret === "string" && secret.length >= 16
      ? secret
      : crypto.randomBytes(32).toString("hex");

    const eventsArray = Array.isArray(events) && events.length > 0 ? events : ["*"];
    const id = generateId();
    const now = new Date().toISOString();

    await db.insert(schema.webhooks).values({
      id,
      name,
      url,
      secret: finalSecret,
      events: JSON.stringify(eventsArray),
      is_active: Boolean(isActive),
      created_by: req.user?.id || req.apiKey?.userId || null,
      created_at: now,
      updated_at: now,
    });

    invalidateWebhookCache();

    res.status(201).json({
      success: true,
      webhook: {
        id,
        name,
        url,
        secret: finalSecret,
        events: eventsArray,
        isActive: Boolean(isActive),
        createdAt: now,
      },
    });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/webhooks] Create error:", err);
    res.status(500).json({ error: "Failed to create webhook", details: msg });
  }
});

/**
 * PUT /api/v1/webhooks/:id
 * Update an existing webhook
 */
router.put("/:id", requireScope("admin"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const { name, url, secret, events, isActive } = req.body;

    const existing = await db.select().from(schema.webhooks).where(eq(schema.webhooks.id, id)).limit(1);
    if (existing.length === 0) {
      res.status(404).json({ error: "Webhook not found" });
      return;
    }

    if (url) {
      const urlCheck = isSafeWebhookUrl(url);
      if (!urlCheck.valid) {
        res.status(400).json({ error: urlCheck.error || "Invalid webhook URL" });
        return;
      }
    }

    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    if (name !== undefined) updateData.name = name;
    if (url !== undefined) updateData.url = url;
    if (secret !== undefined) updateData.secret = secret;
    if (events !== undefined && Array.isArray(events)) updateData.events = JSON.stringify(events);
    if (isActive !== undefined) updateData.is_active = Boolean(isActive);

    await db.update(schema.webhooks).set(updateData).where(eq(schema.webhooks.id, id));
    invalidateWebhookCache();

    res.json({ success: true, message: "Webhook updated successfully" });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/webhooks] Update error:", err);
    res.status(500).json({ error: "Failed to update webhook", details: msg });
  }
});

/**
 * DELETE /api/v1/webhooks/:id
 * Delete a webhook
 */
router.delete("/:id", requireScope("admin"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    await db.delete(schema.webhooks).where(eq(schema.webhooks.id, id));
    invalidateWebhookCache();
    res.json({ success: true, message: "Webhook deleted" });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/webhooks] Delete error:", err);
    res.status(500).json({ error: "Failed to delete webhook", details: msg });
  }
});

/**
 * POST /api/v1/webhooks/:id/test
 * Test ping webhook endpoint
 */
router.post("/:id/test", requireScope("admin"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const id = String(req.params.id);
    const result = await testWebhook(id);
    res.json(result);
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/webhooks] Test error:", err);
    res.status(500).json({ error: "Failed to test webhook", details: msg });
  }
});

/**
 * GET /api/v1/webhooks/deliveries/logs
 * Query recent delivery logs
 */
router.get("/deliveries/logs", requireScope("admin"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { webhookId, limit = "50" } = req.query;
    const numLimit = Math.min(100, Math.max(1, parseInt(limit as string, 10) || 50));

    let query = db
      .select({
        id: schema.webhookDeliveries.id,
        webhookId: schema.webhookDeliveries.webhook_id,
        event: schema.webhookDeliveries.event,
        url: schema.webhookDeliveries.url,
        responseStatus: schema.webhookDeliveries.response_status,
        durationMs: schema.webhookDeliveries.duration_ms,
        success: schema.webhookDeliveries.success,
        errorMessage: schema.webhookDeliveries.error_message,
        attempt: schema.webhookDeliveries.attempt,
        createdAt: schema.webhookDeliveries.created_at,
        requestPayload: schema.webhookDeliveries.request_payload,
        responseBody: schema.webhookDeliveries.response_body,
      })
      .from(schema.webhookDeliveries);

    if (webhookId && typeof webhookId === "string") {
      const rows = await query
        .where(eq(schema.webhookDeliveries.webhook_id, webhookId))
        .orderBy(desc(schema.webhookDeliveries.created_at))
        .limit(numLimit);
      res.json({ deliveries: rows });
      return;
    }

    const rows = await query
      .orderBy(desc(schema.webhookDeliveries.created_at))
      .limit(numLimit);

    res.json({ deliveries: rows });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/webhooks/deliveries] Error:", err);
    res.status(500).json({ error: "Failed to fetch delivery logs", details: msg });
  }
});

export default router;
