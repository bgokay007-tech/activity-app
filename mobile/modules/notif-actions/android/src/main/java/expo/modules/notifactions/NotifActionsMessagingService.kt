package expo.modules.notifactions

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.RemoteInput
import android.content.Context
import android.content.Intent
import android.os.Build
import com.google.firebase.messaging.FirebaseMessagingService
import com.google.firebase.messaging.RemoteMessage

const val ACTION_MARK_READ = "expo.modules.notifactions.MARK_READ"
const val ACTION_REPLY = "expo.modules.notifactions.REPLY"
const val EXTRA_NOTIFICATION_ID = "extra_notification_id"
const val EXTRA_CONVERSATION_ID = "extra_conversation_id"
const val EXTRA_SENDER_ID = "extra_sender_id"
const val EXTRA_TYPE = "extra_type"
const val EXTRA_TAG = "extra_tag"
const val EXTRA_INT_ID = "extra_int_id"
const val KEY_REPLY_TEXT = "key_reply_text"

// Bildirimleri UCTAN UCA kendi kodumuz gosteriyor (expo-notifications'a hic bagimli degil —
// bkz. build.gradle'daki not). "Okundu İşaretle" her bildirimde (notificationId varsa),
// "Cevapla" (metin girisli) sadece mesaj bildirimlerinde (type=MESSAGE + senderId varsa)
// ekleniyor. Butonlara basilinca NotifActionsReceiver JS motoruna hic ihtiyac duymadan
// dogrudan backend'e istek atiyor.
class NotifActionsMessagingService : FirebaseMessagingService() {
    override fun onMessageReceived(remoteMessage: RemoteMessage) {
        val rawData = remoteMessage.data
        // Backend artik SAF bir "data" mesaji gonderiyor (top-level title/body kasitli olarak
        // YOK -- bkz. backend/src/controllers/message.controller.js). Expo'nun push servisi bu
        // "data" nesnesini duz alanlar olarak DEGIL, FCM'in "body" adli tek bir data alaninin
        // icine JSON string olarak paketliyor; kendi alanlarimiza (title/message/type/senderId/
        // conversationId vb.) erismek icin burayi ayrica parse etmemiz gerekiyor.
        val data: Map<String, String> = try {
            val json = org.json.JSONObject(rawData["body"] ?: "{}")
            val map = HashMap<String, String>()
            json.keys().forEach { key -> map[key] = json.optString(key) }
            map
        } catch (e: Exception) {
            emptyMap()
        }

        val title = data["title"] ?: return
        val body = data["message"] ?: ""
        val notificationId = data["notificationId"]
        val isMessage = data["type"] == "MESSAGE"
        val channelId = data["channelId"] ?: "default"
        val tag = data["tag"] ?: remoteMessage.messageId ?: System.currentTimeMillis().toString()
        val id = tag.hashCode()

        showNotification(applicationContext, tag, id, channelId, title, body, notificationId, isMessage, data)
    }
}

private fun ensureChannel(context: Context, channelId: String) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (nm.getNotificationChannel(channelId) != null) return
    // Bildirimler ekranındaki "Sessize Al" moduyla aynı 3 kanal (default/vibrate/silent) —
    // JS tarafı (navigation/index.js) da aynı id'lerle kaydediyor, burada sadece güvence.
    val importance = if (channelId == "silent") NotificationManager.IMPORTANCE_LOW else NotificationManager.IMPORTANCE_HIGH
    val channel = NotificationChannel(channelId, channelId, importance)
    when (channelId) {
        "silent" -> { channel.setSound(null, null); channel.enableVibration(false) }
        "vibrate" -> { channel.setSound(null, null); channel.enableVibration(true) }
        else -> channel.enableVibration(true)
    }
    nm.createNotificationChannel(channel)
}

private fun showNotification(
    context: Context,
    tag: String,
    id: Int,
    channelId: String,
    title: String,
    body: String,
    notificationId: String?,
    isMessage: Boolean,
    data: Map<String, String>
) {
    ensureChannel(context, channelId)

    val lang = TokenStore.readValue(context, "activity_lang")
    val isTurkish = lang == null || lang == "tr"

    // MainActivity sinifina derleme-zamani referans veremeyiz (bu kutuphane modulu :app'ten
    // ONCE derlenir, tersi bir bagimlilik dongusu olurdu) — paket adindan varsayilan
    // baslatma intent'ini almak, herhangi bir sinif referansi gerektirmeyen standart yol.
    val openIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)?.apply {
        addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TOP)
    } ?: Intent()
    val contentPendingIntent = PendingIntent.getActivity(
        context, id, openIntent,
        PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
    )

    val iconRes = context.resources.getIdentifier("notification_icon", "drawable", context.packageName)

    val builder = Notification.Builder(context, channelId)
        .setContentTitle(title)
        .setContentText(body)
        .setSmallIcon(if (iconRes != 0) iconRes else android.R.drawable.ic_dialog_info)
        .setAutoCancel(true)
        .setContentIntent(contentPendingIntent)

    val conversationId = data["conversationId"]
    // Mesaj bildirimlerinde notificationId YOK (Bildirimler ekranına ayrıca satır düşmesin diye
    // backend orada hiç Notification satırı oluşturmuyor) — bu durumda "Okundu İşaretle"
    // conversationId üzerinden çalışır (bkz. NotifActionsReceiver). Diğer (mesaj olmayan)
    // bildirim türlerinde ise notificationId zorunlu.
    val canMarkRead = !notificationId.isNullOrEmpty() || (isMessage && !conversationId.isNullOrEmpty())
    if (canMarkRead) {
        val markReadIntent = Intent(context, NotifActionsReceiver::class.java).apply {
            action = ACTION_MARK_READ
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_CONVERSATION_ID, conversationId)
            putExtra(EXTRA_TYPE, data["type"])
            putExtra(EXTRA_TAG, tag)
            putExtra(EXTRA_INT_ID, id)
        }
        val markReadPendingIntent = PendingIntent.getBroadcast(
            context, (tag + "_read").hashCode(), markReadIntent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_MUTABLE
        )
        builder.addAction(
            Notification.Action.Builder(0, if (isTurkish) "Okundu İşaretle" else "Mark as read", markReadPendingIntent).build()
        )
    }

    if (isMessage && !data["senderId"].isNullOrEmpty()) {
        val replyIntent = Intent(context, NotifActionsReceiver::class.java).apply {
            action = ACTION_REPLY
            putExtra(EXTRA_NOTIFICATION_ID, notificationId)
            putExtra(EXTRA_SENDER_ID, data["senderId"])
            putExtra(EXTRA_TAG, tag)
            putExtra(EXTRA_INT_ID, id)
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

    val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    nm.notify(tag, id, builder.build())
}
