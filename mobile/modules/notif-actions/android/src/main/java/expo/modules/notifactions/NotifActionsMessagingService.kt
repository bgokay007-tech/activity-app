package expo.modules.notifactions

import android.app.Notification
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.firebase.messaging.RemoteMessage
import expo.modules.notifications.service.ExpoFirebaseMessagingService

const val ACTION_MARK_READ = "expo.modules.notifactions.MARK_READ"
const val ACTION_REPLY = "expo.modules.notifactions.REPLY"
const val EXTRA_NOTIFICATION_ID = "extra_notification_id"
const val EXTRA_CONVERSATION_ID = "extra_conversation_id"
const val EXTRA_SENDER_ID = "extra_sender_id"
const val EXTRA_TYPE = "extra_type"
const val EXTRA_TAG = "extra_tag"
const val EXTRA_INT_ID = "extra_int_id"
const val KEY_REPLY_TEXT = "key_reply_text"

// Bildirim tepsisindeki "Okundu İşaretle"/"Cevapla" butonları — expo-notifications'ın Android'de
// BİLİNEN, Expo ekibi tarafından da "accepted" olarak işaretlenmiş kütüphane hatası yüzünden
// (github.com/expo/expo issue #31503, #36282) bu butonlar sadece uygulama foreground'dayken
// render ediliyordu, arka planda/kapalıyken hiç görünmüyordu.
//
// Bu servis expo-notifications'ın kendi FCM servisinin YERİNE geçiyor (bkz. AndroidManifest.xml
// tools:node="remove"). notificationId alanı OLMAYAN bildirimler (backend'in aksiyon butonu
// istemediği türler) için hiçbir şey değişmiyor — super() ile expo-notifications'ın kendi akışı
// aynen çalışıyor (tıklayınca doğru yere gitme davranışı DAHİL). notificationId OLAN bildirimler
// için: expo-notifications normal şekilde bildirimi bastıktan (super) kısa bir süre sonra bu
// bildirim tekrar bulunup (Notification.Builder.recoverBuilder — orijinal title/body/tıklama
// intent'i AYNEN korunur) üzerine SADECE aksiyon butonları eklenip aynı tag/id ile yeniden
// gösteriliyor; yerinde günceller, kopya oluşturmaz.
class NotifActionsMessagingService : ExpoFirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        super.onMessageReceived(remoteMessage)

        val data = remoteMessage.data
        val notificationId = data["notificationId"]
        if (notificationId.isNullOrEmpty()) return

        val tag = data["tag"] ?: remoteMessage.messageId ?: return
        augmentWithActions(applicationContext, tag, notificationId, data)
    }
}

private fun augmentWithActions(context: Context, tag: String, notificationId: String, data: Map<String, String>) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager

    // presentNotification (expo-notifications) birkaç asenkron adımdan (broadcast + coroutine)
    // sonra çalışıyor — bu thread zaten Firebase tarafından arka planda (main thread değil)
    // çalıştırıldığı için kısa aralıklı bekleme burada güvenli.
    var sbn: android.service.notification.StatusBarNotification? = null
    for (attempt in 1..20) {
        sbn = nm.activeNotifications.find { it.tag == tag && it.packageName == context.packageName }
        if (sbn != null) break
        Thread.sleep(150)
    }
    val found = sbn ?: return

    val isMessage = data["type"] == "MESSAGE"
    val lang = TokenStore.readValue(context, "activity_lang")
    val isTurkish = lang == null || lang == "tr"

    val builder = Notification.Builder.recoverBuilder(context, found.notification)

    val markReadIntent = Intent(context, NotifActionsReceiver::class.java).apply {
        action = ACTION_MARK_READ
        putExtra(EXTRA_NOTIFICATION_ID, notificationId)
        putExtra(EXTRA_CONVERSATION_ID, data["conversationId"])
        putExtra(EXTRA_TYPE, data["type"])
        putExtra(EXTRA_TAG, tag)
        putExtra(EXTRA_INT_ID, found.id)
    }
    val markReadPendingIntent = PendingIntent.getBroadcast(
        context, (tag + "_read").hashCode(), markReadIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
    )
    builder.addAction(
        Notification.Action.Builder(0, if (isTurkish) "Okundu İşaretle" else "Mark as read", markReadPendingIntent).build()
    )

    if (isMessage && !data["senderId"].isNullOrEmpty()) {
        val replyIntent = Intent(context, NotifActionsReceiver::class.java).apply {
            action = ACTION_REPLY
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_SENDER_ID, data["senderId"])
            putExtra(EXTRA_TAG, tag)
            putExtra(EXTRA_INT_ID, found.id)
        }
        val replyPendingIntent = PendingIntent.getBroadcast(
            context, (tag + "_reply").hashCode(), replyIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        val remoteInput = RemoteInput.Builder(KEY_REPLY_TEXT)
            .setLabel(if (isTurkish) "Mesaj yaz..." else "Type a message...")
            .build()
        val replyAction = Notification.Action.Builder(0, if (isTurkish) "Cevapla" else "Reply", replyPendingIntent)
            .addRemoteInput(remoteInput)
            .build()
        builder.addAction(replyAction)
    }

    nm.notify(tag, found.id, builder.build())
}
