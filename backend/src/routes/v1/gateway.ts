import { Router, Response } from "express";
import { ApiKeyRequest, requireScope } from "../../middleware/apiKeyAuth.js";
import { getConnectionStatus } from "../../services/waGateway.js";
import { logger } from "../../utils/logger.js";

const router = Router();

/**
 * GET /api/v1/gateway/status
 * Check WhatsApp gateway connection status and QR code
 */
router.get("/status", requireScope("admin"), async (_req: ApiKeyRequest, res: Response) => {
  try {
    const status = getConnectionStatus();
    res.json({
      status: status.status,
      hasQr: Boolean(status.qr),
      qr: status.qr,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/gateway/status] Error:", err);
    res.status(500).json({ error: "Failed to get gateway status", details: msg });
  }
});

export default router;
