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
// (set by socket.io-client), with fallback to httpOnly access_token cookie sent with
// the upgrade request. Validates token so an expired memory token falls back to a valid cookie.
function getHandshakeToken(socket: Socket): string | null {
  const authToken = socket.handshake.auth?.token as string | undefined;
  if (authToken) {
    try {
      verifyAccessToken(authToken);
      return authToken;
    } catch {
      // authToken expired or malformed, continue to test cookie
    }
  }

  const cookieHeader = socket.handshake.headers.cookie;
  if (cookieHeader) {
    for (const part of cookieHeader.split(";")) {
      const [k, ...v] = part.trim().split("=");
      if (k === "access_token") {
        const cToken = decodeURIComponent(v.join("="));
        try {
          verifyAccessToken(cToken);
          return cToken;
        } catch {
          // Cookie token invalid
        }
      }
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

  // Authenticate socket connection during handshake
  io.use((rawSocket: Socket, next) => {
    const socket = rawSocket as AuthenticatedSocket;
    const token = getHandshakeToken(socket);
    if (!token) {
      return next(new Error("Unauthorized: Missing token"));
    }
    try {
      const payload = verifyAccessToken(token);
      socket.user = { sub: payload.sub, role: payload.role };
      next();
    } catch {
      next(new Error("Unauthorized: Invalid or expired token"));
    }
  });

  io.on("connection", (rawSocket: Socket) => {
    const socket = rawSocket as AuthenticatedSocket;
    const userData = socket.user;
    if (!userData) {
      socket.disconnect(true);
      return;
    }

    logger.info(`[ws] Connected & Auth: ${socket.id} (${userData.sub}, ${userData.role})`);

    socket.join(`user:${userData.sub}`);
    socket.join(`role:${userData.role}`);
    if (userData.role === "super_admin") {
      socket.join("role:admin");
      socket.join("role:cs");
    } else if (userData.role === "admin") {
      socket.join("role:cs");
    }

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
