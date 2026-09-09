package expo.modules.wearbridge

import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat

/**
 * Huawei GT/Fit LiteOS saatlere üçüncü parti uygulama kurulamadığı için skor
 * sayacı, telefonda ongoing bir bildirim olarak basılır. Huawei Sağlık bu
 * bildirimi (aksiyon butonları dahil) saate yansıtır — Wear Engine 5.0.0.300
 * Notify API'si olmadığı için (derleme hatası) bu yol kullanılıyor.
 */
object WatchScoreNotification {
    const val CHANNEL_ID = "activity_watch_score"
    const val NOTIF_ID = 7101
    const val ACTION_POINT_A = "expo.modules.wearbridge.SCORE_A"
    const val ACTION_POINT_B = "expo.modules.wearbridge.SCORE_B"

    fun show(context: Context, title: String, text: String, buttonA: String, buttonB: String): Boolean {
        if (!NotificationManagerCompat.from(context).areNotificationsEnabled()) return false
        ensureChannel(context)
        val flags = PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        val actionA = buildAction(context, ACTION_POINT_A, buttonA, 71, flags)
        val actionB = buildAction(context, ACTION_POINT_B, buttonB, 72, flags)
        val notification = NotificationCompat.Builder(context, CHANNEL_ID)
            .setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle(title)
            .setContentText(text)
            .setStyle(NotificationCompat.BigTextStyle().bigText(text))
            .setOngoing(true)
            .setOnlyAlertOnce(true)
            .setSilent(true)
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setCategory(NotificationCompat.CATEGORY_STATUS)
            .setVisibility(NotificationCompat.VISIBILITY_PUBLIC)
            .addAction(actionA)
            .addAction(actionB)
            .extend(
                NotificationCompat.WearableExtender()
                    .addAction(actionA)
                    .addAction(actionB)
            )
            .build()
        return try {
            NotificationManagerCompat.from(context).notify(NOTIF_ID, notification)
            true
        } catch (_: SecurityException) {
            false
        }
    }

    fun cancel(context: Context) {
        NotificationManagerCompat.from(context).cancel(NOTIF_ID)
    }

    private fun buildAction(
        context: Context,
        action: String,
        title: String,
        requestCode: Int,
        flags: Int,
    ): NotificationCompat.Action {
        val intent = Intent(context, WatchScoreReceiver::class.java)
            .setAction(action)
            .addFlags(Intent.FLAG_RECEIVER_FOREGROUND)
        val pending = PendingIntent.getBroadcast(context, requestCode, intent, flags)
        // setShowsUserInterface(false): saatten/üstten butona basınca uygulama
        // öne gelmesin, sadece sayı yazılsın (Okundu İşaretle ile aynı tuzak).
        return NotificationCompat.Action.Builder(0, title, pending)
            .setShowsUserInterface(false)
            .build()
    }

    private fun ensureChannel(context: Context) {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
        val manager = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (manager.getNotificationChannel(CHANNEL_ID) != null) return
        manager.createNotificationChannel(
            NotificationChannel(
                CHANNEL_ID,
                "Live match score",
                NotificationManager.IMPORTANCE_HIGH,
            ).apply {
                description = "Score buttons mirrored to Huawei / Wear OS watches"
                setSound(null, null)
                enableVibration(false)
            }
        )
    }
}
