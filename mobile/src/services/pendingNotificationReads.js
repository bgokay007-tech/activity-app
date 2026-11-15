import AsyncStorage from '@react-native-async-storage/async-storage';
import api from './api';

// "Okundu" PATCH'i ağ kopunca / IP değişince / uygulama kapanınca yarıda kalabiliyor.
// Niyet AsyncStorage'a yazılır; App açılışı, rozet poll ve Bildirimler ekranı kuyruğu boşaltır.
const PENDING_READS_KEY = 'pending_notification_reads';

export async function loadPendingReads() {
    try {
        return JSON.parse(await AsyncStorage.getItem(PENDING_READS_KEY)) || [];
    } catch {
        return [];
    }
}

export async function savePendingReads(ids) {
    try {
        await AsyncStorage.setItem(PENDING_READS_KEY, JSON.stringify([...new Set(ids)]));
    } catch { /* */ }
}

export async function enqueuePendingRead(id) {
    if (!id) return;
    const pending = await loadPendingReads();
    if (!pending.includes(id)) await savePendingReads([...pending, id]);
}

export async function removePendingRead(id) {
    if (!id) return;
    const pending = await loadPendingReads();
    await savePendingReads(pending.filter(pid => pid !== id));
}

/** Bekleyen okundu isteklerini sunucuya gönder. Başarısız olanlar kuyrukta kalır. */
export async function flushPendingReads() {
    const pending = await loadPendingReads();
    if (pending.length === 0) return [];
    const stillPending = [];
    for (const id of pending) {
        try {
            const { data } = await api.patch(`/notifications/${id}/read`, { read: true });
            // Sunucu hiç satır güncellemediyse (yanlış id) kuyrukta tutma — sonsuz döngü olmasın
            if (data && data.updated === 0) continue;
        } catch {
            stillPending.push(id);
        }
    }
    await savePendingReads(stillPending);
    return stillPending;
}

/** Push / tepsi aksiyonundan okundu — önce kuyruk, sonra PATCH. */
export async function markNotificationReadDurable(notificationId) {
    if (!notificationId) return false;
    await enqueuePendingRead(notificationId);
    try {
        const { data } = await api.patch(`/notifications/${notificationId}/read`, { read: true });
        if (data && data.updated === 0) {
            await removePendingRead(notificationId);
            return false;
        }
        await removePendingRead(notificationId);
        return true;
    } catch {
        return false;
    }
}
