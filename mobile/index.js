import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import App from './App';
import { handleNotificationAction } from './src/services/notificationActions';

// Bildirim tepsisindeki "Okundu İşaretle"/"Cevapla" butonları (bkz. navigation/index.js
// setNotificationCategoryAsync, opensAppToForeground:false) uygulama TAMAMEN KAPALIYKEN
// basılırsa hiçbir JS çalışmaz — Android'de bunu çalıştırmanın tek yolu burada, en erken
// yüklenen dosyada (index.js) tanımlanmış bir headless TaskManager görevi. Görev, native
// taraf uygulamayı hiç açmadan JS bundle'ı arka planda çalıştırıp bu callback'i tetikler.
const BACKGROUND_NOTIFICATION_TASK = 'BACKGROUND-NOTIFICATION-TASK';
TaskManager.defineTask(BACKGROUND_NOTIFICATION_TASK, ({ data, error }) => {
    if (error || !data || !('actionIdentifier' in data)) return;
    const notifData = data.notification?.request?.content?.data || {};
    return handleNotificationAction(data.actionIdentifier, data.userText, notifData);
});
Notifications.registerTaskAsync(BACKGROUND_NOTIFICATION_TASK).catch(() => {});

registerRootComponent(App);
