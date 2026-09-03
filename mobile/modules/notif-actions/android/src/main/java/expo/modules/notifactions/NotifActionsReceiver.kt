package expo.modules.notifactions

import android.app.NotificationManager
import android.app.RemoteInput
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import org.json.JSONObject
import kotlin.concurrent.thread

// "Okundu İşaretle"/"Cevapla" butonlarına basılınca tetiklenir — uygulama JS motoru hiç
// çalışmadan (arka planda ya da tamamen kapalıyken de) doğrudan backend'e istek atar.
// Ayrıntılı gerekçe için bkz. NotifActionsMessagingService.kt.
class NotifActionsReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val pendingResult = goAsync()
        thread {
            try {
                handle(context.applicationContext, intent)
            } finally {
                pendingResult.finish()
            }
        }
    }

    private fun handle(context: Context, intent: Intent) {
        val token = TokenStore.readValue(context, "activity_token")
        val notificationId = intent.getStringExtra(EXTRA_NOTIFICATION_ID)

        when (intent.action) {
            ACTION_MARK_READ -> {
                if (!notificationId.isNullOrEmpty()) {
                    ApiClient.request("PATCH", "/notifications/$notificationId/read", token)
                }
                val conversationId = intent.getStringExtra(EXTRA_CONVERSATION_ID)
                if (intent.getStringExtra(EXTRA_TYPE) == "MESSAGE" && !conversationId.isNullOrEmpty()) {
                    ApiClient.request("POST", "/messages/conversation/$conversationId/mark-read", token)
                }
                dismiss(context, intent)
            }
            ACTION_REPLY -> {
                val senderId = intent.getStringExtra(EXTRA_SENDER_ID)
                val text = RemoteInput.getResultsFromIntent(intent)?.getCharSequence(KEY_REPLY_TEXT)?.toString()
                if (!senderId.isNullOrEmpty() && !text.isNullOrBlank()) {
                    val body = JSONObject().apply { put("content", text) }.toString()
                    ApiClient.request("POST", "/messages/send/$senderId", token, body)
                    if (!notificationId.isNullOrEmpty()) {
                        ApiClient.request("PATCH", "/notifications/$notificationId/read", token)
                    }
                    dismiss(context, intent)
                }
            }
        }
    }

    private fun dismiss(context: Context, intent: Intent) {
        val tag = intent.getStringExtra(EXTRA_TAG) ?: return
        val id = intent.getIntExtra(EXTRA_INT_ID, -1)
        if (id == -1) return
        (context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(tag, id)
    }
}
