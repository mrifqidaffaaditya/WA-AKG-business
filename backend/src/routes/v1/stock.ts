import { Router, Response } from "express";
import { ApiKeyRequest, requireScope } from "../../middleware/apiKeyAuth.js";
import { previewStock, syncStockNow } from "../../services/stock.js";
import { dispatchWebhookEvent } from "../../services/webhook.js";
import { logger } from "../../utils/logger.js";

const router = Router();

/**
 * GET /api/v1/stock
 * Retrieve current product and stock inventory
 */
router.get("/", requireScope("stock:read"), async (_req: ApiKeyRequest, res: Response) => {
  try {
    const items = await previewStock();
    res.json({
      success: true,
      count: items.length,
      items,
    });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/stock] Error fetching stock:", err);
    res.status(500).json({ error: "Failed to fetch stock", details: msg });
  }
});

/**
 * POST /api/v1/stock/sync
 * Trigger on-demand synchronization of stock from configured datasource
 */
router.post("/sync", requireScope("stock:write"), async (_req: ApiKeyRequest, res: Response) => {
  try {
    await syncStockNow();
    const items = await previewStock();

    dispatchWebhookEvent("stock.updated", {
      itemCount: items.length,
      syncedAt: new Date().toISOString(),
    });

    res.json({
      success: true,
      message: "Stock sync completed successfully",
      count: items.length,
      syncedAt: new Date().toISOString(),
    });
  } catch (err: unknown) {
    const msg = err && typeof err === "object" && "message" in err ? (err as Error).message : String(err);
    logger.error("[v1/stock/sync] Error:", err);
    res.status(500).json({ error: "Stock sync failed", details: msg });
  }
});

export default router;
