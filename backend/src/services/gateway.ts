import { config } from "../config.js";
import { getConnectionStatus, connectWa, disconnectWa } from "../services/waGateway.js";
import { initOrchestrator } from "../services/orchestrator.js";
import { logger } from "../utils/logger.js";
import { getIO } from "../ws/index.js";

let gatewayStatusInterval: ReturnType<typeof setInterval> | undefined;
let gatewayInitialized = false;

export function initGateway(): void {
  if (gatewayInitialized) return;
  gatewayInitialized = true;

  connectWa()
    .then(() => logger.info("[gateway] WA Gateway started"))
    .catch((err) => logger.error("[gateway] WA Gateway init error:", err));

  initOrchestrator();

  gatewayStatusInterval = setInterval(() => {
    try {
      const io = getIO();
      const status = getConnectionStatus();
      io.emit("gateway:status", status);
    } catch (err) {
      logger.error("[gateway] Status broadcast error:", err);
    }
  }, 10000);

  logger.info("[gateway] Gateway module initialized");
}

export function shutdownGateway(): void {
  if (gatewayStatusInterval !== undefined) clearInterval(gatewayStatusInterval);
  disconnectWa().catch((err) =>
    logger.error("[gateway] Disconnect error:", err)
  );
}
