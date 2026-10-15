import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  return socket;
}

export const SOCKET_URL = import.meta.env.VITE_SOCKET_URL ||
  (typeof window !== 'undefined' && (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:5000'
    : 'https://server.dgrowmarketing.in');

export function connectSocket() {
  if (socket && socket.connected) {
    return socket;
  }

  // Connect to backend server with credentials
  socket = io(SOCKET_URL, {
    withCredentials: true,
    transports: ['websocket', 'polling'],
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: 5,
    reconnectionDelay: 1000
  });

  socket.on('connect', () => {
    // Socket connected
  });

  socket.on('connect_error', () => {
    // Handshake error
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}
