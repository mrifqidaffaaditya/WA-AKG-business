import { Server as HttpServer } from "http";
import { Server, Socket } from "socket.io";
import { config } from "../config.js";
import { verifyAccessToken } from "../services/auth.js";
import { logger } from "../utils/logger.js";

interface AuthenticatedSocket extends Socket {
  user?: { sub: string; role: string };
}

let io: Server | null = null;
const activeUsers = new Map<string, Set<string>>();

export function getActiveUserIds(): string[] {
  return Array.from(activeUsers.keys());
}

// Pull the access token from the socket handshake: explicit auth payload first
// (set by socket.io-client), then the httpOnly access_token cookie sent with
// the upgrade request. Cookie support lets the browser authenticate the socket
// without the token ever being readable by JS.
function getHandshakeToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token as string | undefined;
  if (authToken) return authToken;
  const cookieHeader = socket.handshake.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === "access_token") return decodeURIComponent(v.join("="));
    }
  }
  return null;
}

export function initWebSocket(httpServer: HttpServer): Server {
  io = new Server(httpServer, {
    cors: {
      origin: config.corsOrigin,
      methods: ["GET", "POST"],
    },
    transports: ["websocket", "polling"],
  });

  io.on("connection", (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    logger.info(`[ws] Connected: ${socket.id}`);

    try {
      const token = getHandshakeToken(socket);
      if (!token) {
        socket.disconnect(true);
        return;
      }
      const payload = verifyAccessToken(token);
      const userData = { sub: payload.sub, role: payload.role };

      socket.user = userData;
      socket.join(`user:${userData.sub}`);
      socket.join(`role:${userData.role}`);
      logger.info(`[ws] Auth: ${userData.sub} (${userData.role})`);

      // Trigger dashboard stats for admin/super_admin on connect
      if (userData.role === "admin" || userData.role === "super_admin") {
        import("../services/dashboard.js").then((m) => m.broadcastDashboardStats()).catch(() => {});
      }

      // Track online status
      if (!activeUsers.has(userData.sub)) {
        activeUsers.set(userData.sub, new Set());
      }
      activeUsers.get(userData.sub)!.add(socket.id);
      broadcast("user:status", { userId: userData.sub, status: "online" });
    } catch {
      socket.disconnect(true);
      return;
    }

    socket.on("disconnect", () => {
      logger.info(`[ws] Disconnected: ${socket.id}`);
      const user = socket.user;
      if (user) {
        const sockets = activeUsers.get(user.sub);
        if (sockets) {
          sockets.delete(socket.id);
          if (sockets.size === 0) {
            activeUsers.delete(user.sub);
            broadcast("user:status", { userId: user.sub, status: "offline" });
          }
        }
      }
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
