package expo.modules.wearbridge

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class WatchScoreReceiver : BroadcastReceiver() {
    override fun onReceive(context: Context, intent: Intent) {
        val side = when (intent.action) {
            WatchScoreNotification.ACTION_POINT_A -> "A"
            WatchScoreNotification.ACTION_POINT_B -> "B"
            else -> return
        }
        WearBridgeModule.onWatchPoint?.invoke(side)
    }
}
