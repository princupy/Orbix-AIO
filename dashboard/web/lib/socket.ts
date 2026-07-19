import { io, type Socket } from "socket.io-client";
import { BACKEND_URL } from "./api";
import { getToken } from "./auth";

let socket: Socket | null = null;

export function getSocket(): Socket {
  if (socket) return socket;

  socket = io(BACKEND_URL, {
    auth: { token: getToken() },
    transports: ["websocket"],
    autoConnect: true,
  });

  return socket;
}

export function resetSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
