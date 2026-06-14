import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { createServer } from "http";
import path from "path";
import { config } from "./config.js";
import { db, schema } from "./db/index.js";
import { initWebSocket } from "./ws/index.js";
import { initGateway } from "./services/gateway.js";
import { startStockSync, stopStockSync } from "./services/stock.js";
import { startUploadCleanup, stopUploadCleanup } from "./services/uploadCleanup.js";
import { startDashboardPeriodic } from "./services/dashboard.js";
import { apiRateLimit } from "./middleware/rateLimit.js";
import { authenticate } from "./middleware/auth.js";
import { verifyAccessToken } from "./services/auth.js";
import { logger } from "./utils/logger.js";
import type { ErrorRequestHandler } from "express";

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

// Security headers (defense-in-depth alongside nginx)
app.use((_req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "geolocation=(), microphone=(), camera=(), payment=(), usb=()");
  next();
});

app.use("/api", apiRateLimit);

app.use("/api/auth", authRoutes);
app.use("/api/conversations", conversationRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/notifications", notificationRoutes);
app.use("/api/gateway", gatewayRoutes);

// Authenticated media file serving
app.get("/uploads/:filename", (req, res) => {
  const token = req.headers.authorization?.replace("Bearer ", "") || (req.query.token as string);
  if (!token) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }
  try {
    verifyAccessToken(token);
  } catch {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }
  const filename = path.basename(req.params.filename);
  const filePath = path.join(process.cwd(), "public", "uploads", filename);
  res.sendFile(filePath, (err) => {
    if (err) {
      res.status(404).json({ error: "File not found" });
    }
  });
});

app.get("/api/health", async (_req, res) => {
  try {
    await db.select().from(schema.users).limit(1);
    res.json({ status: "ok", timestamp: new Date().toISOString() });
  } catch (err) {
    res.status(503).json({ status: "error", message: "Database connection failed" });
  }
});

// Global error handler (must be after all routes/middleware)
const globalErrorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
  logger.error("[server] Unhandled error:", err);
  res.status(500).json({ error: "Internal server error" });
};
app.use(globalErrorHandler);

const httpServer = createServer(app);

initWebSocket(httpServer);

initGateway();

httpServer.listen(config.port, () => {
  logger.info(`[server] Running on port ${config.port}`);
  logger.info(`[server] Environment: ${config.nodeEnv}`);
  logger.info(`[server] CORS origin: ${config.corsOrigin}`);
});

// Start periodic background jobs
startStockSync();
startUploadCleanup();
startDashboardPeriodic();

process.on("SIGTERM", () => {
  logger.info("[server] SIGTERM received, shutting down...");
  stopStockSync();
  stopUploadCleanup();
  httpServer.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  logger.info("[server] SIGINT received, shutting down...");
  stopStockSync();
  stopUploadCleanup();
  httpServer.close(() => process.exit(0));
});

export { app };
