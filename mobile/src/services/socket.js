import { io } from 'socket.io-client';
import AsyncStorage from '@react-native-async-storage/async-storage';
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
        // Fonksiyon olarak verilirse her (yeniden) bağlantıda tazeden çağrılır — token
        // Batak gibi kimliğin sahtelenemez olması gereken özelliklerde sunucu tarafında
        // doğrulanır (bkz. backend/src/sockets/batak.js), userId ise mevcut bildirim
        // sistemiyle geriye dönük uyumluluk için ayrıca gönderilmeye devam eder.
        auth: (cb) => AsyncStorage.getItem('activity_token').then(token => cb({ userId, token })),
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
    // Bağlı olduğu soket artık yok — bir sonraki connectSocket() çağrısında bileşenler
    // kendi onSocket() efektleriyle listener'larını yeniden ekleyecek. Burada temizlenmezse,
    // unmount sırasında cleanup çalışmayan (fast refresh/reload gibi) eski dinleyiciler
    // yeni soket'e de eklenip aynı olay için birden fazla (ve bayat kapanışlı) handler tetiklenir.
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
