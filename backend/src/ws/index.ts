import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { config } from "../config.js";
import { verifyAccessToken } from "../services/auth.js";
import { logger } from "../utils/logger.js";

let io: Server | null = null;

export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (socket: Socket) => {
    logger.info(`[ws] Connected: ${socket.id}`);

    try {
      const token = socket.handshake.auth.token as string;
      if (!token) {
        socket.disconnect(true);
        return;
      }
      const payload = verifyAccessToken(token);
      const userData = { sub: payload.sub, role: payload.role };

      (socket as any).user = userData;
      socket.join(`user:${userData.sub}`);
      socket.join(`role:${userData.role}`);
      logger.info(`[ws] Auth: ${userData.sub} (${userData.role})`);
    } catch {
      socket.disconnect(true);
      return;
    }

    socket.on("disconnect", () => {
      logger.info(`[ws] Disconnected: ${socket.id}`);
    });
  });

  return io;
}

export function getIO(): Server {
  if (!io) throw new Error("Socket.io not initialized");
  return io;
}

export function emitToUser(userId: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
}

export function emitToRole(role: string, event: string, data: unknown): void {
  if (!io) return;
  io.to(`role:${role}`).emit(event, data);
}

export function broadcast(event: string, data: unknown): void {
  if (!io) return;
  io.emit(event, data);
}
