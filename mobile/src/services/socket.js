import { io } from 'socket.io-client';
import { BASE_URL } from './api';

const SOCKET_URL = BASE_URL.replace('/api', '');

let socket = null;
let reconnectCallbacks = new Set();
// Listeners requested before the socket existed yet (e.g. a child component's
// effect ran before the parent's connectSocket() call — React fires child
// effects first on mount). Replayed onto the socket once it's created.
let pendingListeners = [];

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
    pendingListeners.forEach(({ event, cb }) => socket.on(event, cb));
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
