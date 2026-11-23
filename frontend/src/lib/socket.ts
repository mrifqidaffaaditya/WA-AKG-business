import { io, Socket } from "socket.io-client";
import { getAccessToken, refreshAccessToken } from "@/lib/api";

let socket: Socket | null = null;
let watchdogInterval: ReturnType<typeof setInterval> | null = null;
let listenersInitialized = false;

export function getIO(): Socket | null {
  return socket;
}

export function connect(): Socket {
  if (socket) {
    if (!socket.connected) {
      const token = getAccessToken();
      socket.auth = { token };
      socket.connect();
    }
    return socket;
  }

  const url =
    process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? window.location.origin : "");

  socket = io(url, {
    // Dynamic auth callback called before every connection/reconnection attempt
    auth: (cb) => {
      cb({ token: getAccessToken() });
    },
    withCredentials: true,
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    randomizationFactor: 0.5,
    timeout: 20000,
  });

  socket.on("connect", () => {
    console.log("[ws] Connected:", socket?.id);
  });

  socket.on("connect_error", async (err) => {
    console.warn("[ws] Connection error:", err.message);
    // If rejected due to token expiration, refresh from cookie & reconnect
    try {
      const newToken = await refreshAccessToken();
      if (newToken && socket) {
        socket.auth = { token: newToken };
        socket.connect();
      }
    } catch {}
  });

  socket.on("disconnect", (reason) => {
    console.warn("[ws] Disconnected:", reason);
    if (reason === "io server disconnect" || reason === "transport close") {
      setTimeout(() => {
        if (socket && !socket.connected) {
          socket.connect();
        }
      }, 1000);
    }
  });

  // Setup mobile wake & visibility restoration listeners once
  if (!listenersInitialized && typeof window !== "undefined" && typeof document !== "undefined") {
    listenersInitialized = true;

    const handleWake = () => {
      if (document.visibilityState === "visible") {
        if (socket && !socket.connected) {
          console.log("[ws] Resuming connection after tab resume/focus...");
          const token = getAccessToken();
          socket.auth = { token };
          socket.connect();
        }
      }
    };

    document.addEventListener("visibilitychange", handleWake);
    window.addEventListener("focus", handleWake);
    window.addEventListener("online", handleWake);
    window.addEventListener("pageshow", handleWake);

    // Watchdog every 8 seconds when tab is active: ensure socket is alive
    if (!watchdogInterval) {
      watchdogInterval = setInterval(() => {
        if (
          typeof document !== "undefined" &&
          document.visibilityState === "visible" &&
          socket &&
          !socket.connected &&
          !socket.active
        ) {
          console.log("[ws] Watchdog reconnecting inactive socket...");
          socket.connect();
        }
      }, 8000);
    }
  }

  return socket;
}

export function disconnect() {
  if (watchdogInterval) {
    clearInterval(watchdogInterval);
    watchdogInterval = null;
  }
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
