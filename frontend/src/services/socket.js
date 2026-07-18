import { io } from 'socket.io-client';

const SOCKET_URL = (import.meta.env.VITE_API_URL || 'http://localhost:5000/api').replace('/api', '');

let socket = null;
let reconnectCallbacks = new Set();
// Soket henüz yokken istenen dinleyiciler (bir alt bileşenin efekti, üst bileşenin
// connectSocket() çağrısından önce çalışabilir) — soket oluşunca üzerine tekrar eklenir.
let pendingListeners = [];

export function onSocketReconnect(cb) {
    reconnectCallbacks.add(cb);
    return () => reconnectCallbacks.delete(cb);
}

export function connectSocket(userId) {
    if (socket) return;
    const token = localStorage.getItem('activity_token');
    socket = io(SOCKET_URL, {
        transports: ['websocket', 'polling'],
        auth: { userId, token },
        reconnection: true,
        reconnectionDelay: 2000,
    });
    pendingListeners.forEach(({ event, cb }) => socket.on(event, cb));
    socket.on('connect', () => reconnectCallbacks.forEach(cb => cb()));
}

export function disconnectSocket() {
    socket?.disconnect();
    socket = null;
    pendingListeners = [];
}

export function onSocket(event, cb) {
    pendingListeners.push({ event, cb });
    socket?.on(event, cb);
    return () => {
        pendingListeners = pendingListeners.filter(p => p.cb !== cb);
        socket?.off(event, cb);
    };
}

export function getSocket() {
    return socket;
}
