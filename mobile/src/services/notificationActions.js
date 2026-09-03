import api from './api';

// Bildirim tepsisindeki (OS push) "Okundu İşaretle" ve "Cevapla" aksiyon butonlarının ortak
// işleyicisi. Bu fonksiyon İKİ AYRI bağlamdan çağrılır:
//  1) navigation/index.js'teki addNotificationResponseReceivedListener — uygulama açıkken/
//     arka planda JS canlıyken.
//  2) index.js'teki TaskManager background task — uygulama TAMAMEN KAPALIYKEN (Android'de
//     headless JS ile). Bu yüzden Redux/store'a ASLA bağımlı olmamalı, sadece AsyncStorage
//     tabanlı `api` servisini kullanır — headless bağlamda store hazır olmayabilir.
export async function handleNotificationAction(actionIdentifier, userText, data) {
    if (!data) return;
    try {
        if (actionIdentifier === 'MARK_READ') {
            if (data.notificationId) await api.patch(`/notifications/${data.notificationId}/read`);
            // Mesaj bildirimi ise sohbetteki mesajlar da okundu sayılsın — aksi halde Mesajlar
            // sekmesindeki okunmamış rozeti (uygulama içi ayrı bir sayaç) düşmeden kalırdı.
            if (data.type === 'MESSAGE' && data.conversationId) {
                await api.post(`/messages/conversation/${data.conversationId}/mark-read`);
            }
        } else if (actionIdentifier === 'REPLY') {
            if (data.senderId && userText?.trim()) {
                await api.post(`/messages/send/${data.senderId}`, { content: userText.trim() });
                if (data.notificationId) await api.patch(`/notifications/${data.notificationId}/read`).catch(() => {});
            }
        }
    } catch { /* headless/arka plan bağlamı — gösterecek UI yok, sessizce yut */ }
}
