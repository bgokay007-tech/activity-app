import { io } from 'socket.io-client';
import { BASE_URL } from './api';

const SOCKET_URL = BASE_URL.replace('/api', '');

let socket = null;
let reconnectCallbacks = new Set();

export function onSocketReconnect(cb) {
    reconnectCallbacks.add(cb);
    return () => reconnectCallbacks.delete(cb);
}

export function connectSocket(userId) {
    if (socket) return;
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        auth: { userId },
        reconnection: true,
        reconnectionDelay: 2000,
    });
    socket.on('connect', () => {
        console.log('[socket] connected');
        reconnectCallbacks.forEach(cb => cb());
    });
    socket.on('disconnect', () => console.log('[socket] disconnected'));
}

export function disconnectSocket() {
    socket?.disconnect();
    socket = null;
}

export function onSocket(event, cb) {
    if (!socket) return () => {};
    socket.on(event, cb);
    return () => socket?.off(event, cb);
}

export function getSocket() {
    return socket;
}
