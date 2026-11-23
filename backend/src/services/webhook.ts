import crypto from "crypto";
import { db, schema } from "../db/index.js";
import { eq, desc, inArray } from "drizzle-orm";
import { generateId } from "../utils/id.js";
import { logger } from "../utils/logger.js";
import { config } from "../config.js";

export type WebhookEvent =
  | "message.received"
  | "message.sent"
  | "conversation.created"
  | "conversation.status_changed"
  | "conversation.claimed"
  | "conversation.resolved"
  | "stock.updated"
  | "ping";

export interface WebhookEnvelope {
  id: string;
  event: WebhookEvent | string;
  timestamp: string;
  data: Record<string, unknown>;
}

// Simple in-memory cache of active webhooks with 10s TTL
let cachedWebhooks: (typeof schema.webhooks.$inferSelect)[] | null = null;
let cacheExpiry = 0;

export function invalidateWebhookCache(): void {
  cachedWebhooks = null;
  cacheExpiry = 0;
}

export async function getActiveWebhooks(): Promise<(typeof schema.webhooks.$inferSelect)[]> {
  const now = Date.now();
  if (cachedWebhooks && now < cacheExpiry) {
    return cachedWebhooks;
  }
  const hooks = await db
    .select()
    .from(schema.webhooks)
    .where(eq(schema.webhooks.is_active, true));
  cachedWebhooks = hooks;
  cacheExpiry = now + 10_000;
  return hooks;
}

/**
 * Validates if a webhook URL is safe against SSRF attacks.
 */
export function isSafeWebhookUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const parsed = new URL(urlString);
    if (!["http:", "https:"].includes(parsed.protocol)) {
      return { valid: false, error: "Only HTTP and HTTPS protocols are allowed" };
    }

    if (config.nodeEnv === "production" && process.env.ALLOW_LOCAL_WEBHOOKS !== "true") {
      const hostname = parsed.hostname.toLowerCase();
      if (
        hostname === "localhost" ||
        hostname === "127.0.0.1" ||
        hostname === "::1" ||
        hostname.endsWith(".local") ||
        hostname === "169.254.169.254" || // AWS metadata
        hostname === "metadata.google.internal" ||
        hostname.startsWith("10.") ||
        hostname.startsWith("192.168.") ||
        /^172\.(1[6-9]|2[0-9]|3[0-1])\./.test(hostname)
      ) {
        return { valid: false, error: "Localhost and private IP addresses are blocked for security" };
      }
    }

    return { valid: true };
  } catch {
    return { valid: false, error: "Invalid webhook URL format" };
  }
}

/**
 * Generate HMAC SHA-256 signature for payload
 */
export function generateWebhookSignature(secret: string, payloadString: string): string {
  return crypto.createHmac("sha256", secret).update(payloadString).digest("hex");
}

/**
 * Verify HMAC SHA-256 signature using timing-safe comparison
 */
export function verifyWebhookSignature(
  secret: string,
  payloadString: string,
  providedSignature: string
): boolean {
  try {
    const cleanSignature = providedSignature.startsWith("sha256=")
      ? providedSignature.slice(7)
      : providedSignature;
    const computedSignature = generateWebhookSignature(secret, payloadString);

    const sigBuf = Buffer.from(cleanSignature, "hex");
    const compBuf = Buffer.from(computedSignature, "hex");

    if (sigBuf.length !== compBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(sigBuf, compBuf);
  } catch {
    return false;
  }
}

async function deliverWebhook(
  hook: typeof schema.webhooks.$inferSelect,
  envelope: WebhookEnvelope,
  attempt = 1
): Promise<{ success: boolean; status?: number; error?: string }> {
  const deliveryId = generateId();
  const payloadString = JSON.stringify(envelope);
  const signature = generateWebhookSignature(hook.secret, payloadString);
  const now = new Date().toISOString();

  let responseStatus: number | null = null;
  let responseBody: string | null = null;
  let errorMessage: string | null = null;
  let success = false;
  const startTime = Date.now();

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 6000);

  try {
    const res = await fetch(hook.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "User-Agent": "WA-AKG-Webhook/3.5.0",
        "X-WA-AKG-Event": envelope.event,
        "X-WA-AKG-Signature": `sha256=${signature}`,
        "X-WA-AKG-Timestamp": envelope.timestamp,
        "X-WA-AKG-Delivery": deliveryId,
      },
      body: payloadString,
      signal: controller.signal,
    });

    clearTimeout(timeoutId);
    responseStatus = res.status;
    const text = await res.text();
    responseBody = text.slice(0, 2000); // truncate response body for storage
    success = res.ok;

    if (!res.ok) {
      errorMessage = `HTTP error ${res.status}: ${res.statusText}`;
    }
  } catch (err: unknown) {
    clearTimeout(timeoutId);
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    errorMessage = msg;
    success = false;
  }

  const durationMs = Date.now() - startTime;

  // Persist delivery log in SQLite
  try {
    await db.insert(schema.webhookDeliveries).values({
      id: deliveryId,
      webhook_id: hook.id,
      event: envelope.event,
      url: hook.url,
      request_payload: payloadString,
      response_status: responseStatus,
      response_body: responseBody,
      duration_ms: durationMs,
      success,
      error_message: errorMessage,
      attempt,
      created_at: now,
    });

    // Notify connected admins via WebSocket in realtime
    try {
      const { emitToRole } = await import("../ws/index.js");
      emitToRole("admin", "webhook:delivery", {
        id: deliveryId,
        webhookId: hook.id,
        webhookName: hook.name,
        event: envelope.event,
        url: hook.url,
        status: responseStatus,
        durationMs,
        success,
        attempt,
        createdAt: now,
      });
    } catch {
      // WS emit best effort
    }
  } catch (dbErr) {
    logger.error("[webhook] Failed to write delivery log:", dbErr);
  }

  // Automatic retry with backoff for failed deliveries (up to 3 attempts)
  if (!success && attempt < 3) {
    const backoffMs = attempt === 1 ? 5000 : 15000;
    setTimeout(() => {
      deliverWebhook(hook, envelope, attempt + 1).catch((retryErr) => {
        logger.error(`[webhook] Retry ${attempt + 1} failed for ${hook.id}:`, retryErr);
      });
    }, backoffMs);
  }

  return { success, status: responseStatus || undefined, error: errorMessage || undefined };
}

/**
 * Dispatch an event to all matching active webhooks.
 * Executes asynchronously in the background so it never blocks the main event loop.
 */
export function dispatchWebhookEvent(event: WebhookEvent | string, data: Record<string, unknown>): void {
  const envelope: WebhookEnvelope = {
    id: `evt_${generateId()}`,
    event,
    timestamp: new Date().toISOString(),
    data,
  };

  // Run in background microtask
  setImmediate(async () => {
    try {
      const activeHooks = await getActiveWebhooks();
      for (const hook of activeHooks) {
        let eventsList: string[] = [];
        try {
          eventsList = JSON.parse(hook.events);
        } catch {
          eventsList = ["*"];
        }

        if (eventsList.includes("*") || eventsList.includes(event)) {
          deliverWebhook(hook, envelope, 1).catch((err) => {
            logger.error(`[webhook] Delivery failed for hook ${hook.id}:`, err);
          });
        }
      }
    } catch (err) {
      logger.error("[webhook] Dispatch error:", err);
    }
  });
}

/**
 * Send a test ping payload to a specific webhook
 */
export async function testWebhook(webhookId: string): Promise<{ success: boolean; status?: number; error?: string }> {
  const rows = await db
    .select()
    .from(schema.webhooks)
    .where(eq(schema.webhooks.id, webhookId))
    .limit(1);

  if (rows.length === 0) {
    throw new Error("Webhook not found");
  }

  const hook = rows[0];
  const envelope: WebhookEnvelope = {
    id: `ping_${generateId()}`,
    event: "ping",
    timestamp: new Date().toISOString(),
    data: {
      message: "Webhook connection test from WA-AKG Business",
      webhookId: hook.id,
      name: hook.name,
    },
  };

  return deliverWebhook(hook, envelope, 1);
}
