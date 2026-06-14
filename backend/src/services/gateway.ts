import { config } from "../config.js";
import { getConnectionStatus, connectWa, disconnectWa } from "../services/waGateway.js";
import { initOrchestrator } from "../services/orchestrator.js";
import { logger } from "../utils/logger.js";
import { getIO } from "../ws/index.js";

const gatewayStatusInterval = setInterval(() => {
  try {
    const status = getConnectionStatus();
    getIO().emit("gateway:status", status);
  } catch {}
}, 10000);

export function initGateway(): void {
  connectWa()
    .then(() => logger.info("[gateway] WA Gateway started"))
    .catch((err) => logger.error("[gateway] WA Gateway init error:", err));

  initOrchestrator();

  logger.info("[gateway] Gateway module initialized");
}

export function shutdownGateway(): void {
  clearInterval(gatewayStatusInterval);
  disconnectWa().catch((err) =>
    logger.error("[gateway] Disconnect error:", err)
  );
}
