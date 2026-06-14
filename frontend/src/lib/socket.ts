import { io, Socket } from "socket.io-client";
import { getAccessToken } from "@/lib/api";

let socket: Socket | null = null;

export function getIO(): Socket | null {
  return socket;
}

export function connect(): Socket {
  if (socket?.connected) return socket;

  const token = getAccessToken();
  const url =
    process.env.NEXT_PUBLIC_API_URL || (typeof window !== "undefined" ? window.location.origin : "");

  socket = io(url, {
    auth: { token },
    transports: ["websocket", "polling"],
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
  });

  socket.on("connect_error", (err) => {
    console.error("Socket connection error:", err.message);
  });

  return socket;
}

export function disconnect() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
