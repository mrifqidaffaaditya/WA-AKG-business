import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import { config } from "./config.js";
import { db, schema } from "./db/index.js";
import { initWebSocket } from "./ws/index.js";
import { initGateway } from "./services/gateway.js";
import { startStockSync, stopStockSync } from "./services/stock.js";
import { apiRateLimit } from "./middleware/rateLimit.js";
import { logger } from "./utils/logger.js";

import authRoutes from "./routes/auth.js";
import conversationRoutes from "./routes/conversations.js";
import customerRoutes from "./routes/customers.js";
import adminRoutes from "./routes/admin.js";
import notificationRoutes from "./routes/notifications.js";
import gatewayRoutes from "./routes/gateway.js";

const app = express();

app.set("trust proxy", 1);

app.use(
  cors({
    origin: config.corsOrigin,
    credentials: true,
  })
);
app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());
app.use("/uploads", express.static("public/uploads"));

app.use("/api", apiRateLimit);

app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/gateway", gatewayRoutes);

app.get("/api/health", async (_req, res) => {
  try {
    await db.select().from(schema.users).limit(1);
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: "error", message: "Database connection failed" });
  }
});

const httpServer = createServer(app);

initWebSocket(httpServer);

initGateway();

httpServer.listen(config.port, () => {
  logger.info(`[server] Running on port ${config.port}`);
  logger.info(`[server] Environment: ${config.nodeEnv}`);
  logger.info(`[server] CORS origin: ${config.corsOrigin}`);
});

// Start periodic stock sync from external sources
startStockSync();

process.on("SIGTERM", () => {
  logger.info("[server] SIGTERM received, shutting down...");
  stopStockSync();
  httpServer.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  logger.info("[server] SIGINT received, shutting down...");
  stopStockSync();
  httpServer.close(() => process.exit(0));
});

export { app };
