import { Router, Response } from "express";
import { ApiKeyRequest, requireScope } from "../../middleware/apiKeyAuth.js";
import { getConnectionStatus, requestWaPairingCode } from "../../services/waGateway.js";
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
      pairingCode: status.pairingCode,
      registered: status.registered,
      timestamp: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/gateway/status] Error:", err);
    res.status(500).json({ error: "Failed to get gateway status", details: msg });
  }
});

/**
 * POST /api/v1/gateway/pairing-code
 * Request an 8-digit WhatsApp pairing code by phone number
 */
router.post("/pairing-code", requireScope("admin"), async (req: ApiKeyRequest, res: Response) => {
  try {
    const { phoneNumber } = req.body;
    if (!phoneNumber || typeof phoneNumber !== "string") {
      res.status(400).json({ error: "phoneNumber is required (e.g. 628123456789)" });
      return;
    }
    const code = await requestWaPairingCode(phoneNumber);
    res.json({ code, timestamp: new Date().toISOString() });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/gateway/pairing-code] Error:", err);
    res.status(400).json({ error: "Failed to request pairing code", details: msg });
  }
});

export default router;
