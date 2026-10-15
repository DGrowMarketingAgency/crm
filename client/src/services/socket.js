import { io } from 'socket.io-client';

let socket = null;

export function getSocket() {
  return socket;
}

export function connectSocket() {
  if (socket && socket.connected) {
    return socket;
  }

  // Connect to backend server with credentials
  socket = io(window.location.origin.includes('localhost') ? 'http://localhost:5000' : window.location.origin, {
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
