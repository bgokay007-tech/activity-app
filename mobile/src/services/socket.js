import { io } from 'socket.io-client';
import { BASE_URL } from './api';

const SOCKET_URL = BASE_URL.replace('/api', '');

let socket = null;

export function connectSocket(userId) {
    if (socket?.connected) return;
    socket = io(SOCKET_URL, {
        transports: ['websocket'],
        auth: { userId },
        reconnection: true,
        reconnectionDelay: 2000,
    });
    socket.on('connect', () => console.log('[socket] connected'));
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
