import { Router } from "express";
import { requireAuthOrApiKey } from "../../middleware/apiKeyAuth.js";
import messageRoutes from "./messages.js";
import conversationRoutes from "./conversations.js";
import webhookRoutes from "./webhooks.js";
import stockRoutes from "./stock.js";
import gatewayRoutes from "./gateway.js";

const router = Router();

// Enforce authentication via API Key or Bearer Token for all /api/v1 routes
router.use(requireAuthOrApiKey);

router.use("/messages", messageRoutes);
router.use("/conversations", conversationRoutes);
router.use("/webhooks", webhookRoutes);
router.use("/stock", stockRoutes);
router.use("/gateway", gatewayRoutes);

export default router;
