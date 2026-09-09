package expo.modules.wearbridge

import android.content.Context
import com.google.android.gms.tasks.Tasks as GmsTasks
import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.json.JSONObject
import java.util.concurrent.TimeUnit

// Wear OS'taki maç ekranının (bkz. wear/ projesi PhoneSync.kt) her sayı
// değişiminde bu path'e gönderdiği mesajı dinler ve JS tarafına "onMatchUpdate"
// olayı olarak iletir. Huawei GT/Fit için WatchScoreNotification A+/B+ butonları
// "onWatchPoint" üretir (LiteOS'a uygulama kurulamadığı için).
private const val MATCH_UPDATE_PATH = "/activity/match-update"

class WearBridgeModule : Module(), MessageClient.OnMessageReceivedListener {
    private var lastUpdate: JSONObject? = null
    private var huaweiListener: HuaweiWearEngineListener? = null
    private var huaweiScoreboardOn = false

    override fun definition() = ModuleDefinition {
        Name("WearBridge")

        Events("onMatchUpdate", "onWatchPoint")

        OnCreate {
            val context = appContext.reactContext ?: appContext.currentActivity ?: return@OnCreate
            onWatchPoint = { side -> sendEvent("onWatchPoint", mapOf("side" to side)) }
            try {
                Wearable.getMessageClient(context).addListener(this@WearBridgeModule)
            } catch (_: Exception) {
                // GMS / Wearable bazı cihazlarda (Play Services yok, Realme/ColorOS
                // kısıtlaması) açılışta fırlatıyor — uygulama çökmesin, saat köprüsü
                // bu telefonda sessizce kapalı kalsın.
            }
            try {
                huaweiListener = HuaweiWearEngineListener(context) { json -> emitUpdate(json) }
                huaweiListener?.start()
            } catch (_: Exception) {
                huaweiListener = null
            }
        }

        OnDestroy {
            onWatchPoint = null
            try {
                appContext.reactContext?.let {
                    Wearable.getMessageClient(it).removeListener(this@WearBridgeModule)
                }
            } catch (_: Exception) {
            }
            try {
                huaweiListener?.stop()
            } catch (_: Exception) {
            }
            notifyContext()?.let { WatchScoreNotification.cancel(it) }
            huaweiListener = null
            huaweiScoreboardOn = false
        }

        AsyncFunction("isWatchConnected") {
            lastUpdate != null || huaweiScoreboardOn
        }

        AsyncFunction("hasWearOsWatch") {
            val context = notifyContext() ?: return@AsyncFunction false
            queryWearOsWatch(context)
        }

        AsyncFunction("hasHuaweiWatch") {
            val context = notifyContext() ?: return@AsyncFunction false
            HuaweiWatchNotify.isPresent(context)
        }

        // Yalnızca Huawei GT/Fit (LiteOS): Wear Engine şablon bildirimi. Wear OS
        // (Samsung/Pixel) bu metoda hiç girmemeli — JS hasWearOsWatch ile ayırır;
        // native de saat yoksa Android bildirimi basmaz.
        AsyncFunction("startHuaweiScoreSession") Coroutine { params: Map<String, String> ->
            val context = notifyContext() ?: return@Coroutine false
            val title = params["title"] ?: "AcTiViTy"
            val text = params["text"] ?: "0-0"
            val buttonA = params["buttonA"] ?: "A +"
            val buttonB = params["buttonB"] ?: "B +"
            withContext(Dispatchers.IO) {
                if (!HuaweiWatchNotify.isPresent(context)) {
                    huaweiScoreboardOn = false
                    return@withContext false
                }
                val watchOk = HuaweiWatchNotify.send(context, title, text, buttonA, buttonB)
                val phoneOk = WatchScoreNotification.show(context, title, text, buttonA, buttonB)
                val ok = watchOk || phoneOk
                huaweiScoreboardOn = ok
                ok
            }
        }

        AsyncFunction("updateHuaweiScoreSession") Coroutine { params: Map<String, String> ->
            val context = notifyContext() ?: return@Coroutine false
            if (!huaweiScoreboardOn) return@Coroutine false
            val title = params["title"] ?: "AcTiViTy"
            val text = params["text"] ?: "0-0"
            val buttonA = params["buttonA"] ?: "A +"
            val buttonB = params["buttonB"] ?: "B +"
            withContext(Dispatchers.IO) {
                HuaweiWatchNotify.send(context, title, text, buttonA, buttonB)
                WatchScoreNotification.show(context, title, text, buttonA, buttonB)
            }
        }

        AsyncFunction("stopHuaweiScoreSession") {
            notifyContext()?.let { WatchScoreNotification.cancel(it) }
            huaweiScoreboardOn = false
        }
    }

    private fun notifyContext(): Context? {
        // Wear Engine izin penceresi Activity ister — Application context yetmez.
        return appContext.currentActivity ?: appContext.reactContext
    }

    private fun queryWearOsWatch(context: Context): Boolean {
        return try {
            val nodes = GmsTasks.await(
                Wearable.getNodeClient(context).connectedNodes,
                8,
                TimeUnit.SECONDS,
            )
            !nodes.isNullOrEmpty()
        } catch (_: Exception) {
            false
        }
    }

    override fun onMessageReceived(event: MessageEvent) {
        if (event.path != MATCH_UPDATE_PATH) return
        try {
            emitUpdate(JSONObject(String(event.data, Charsets.UTF_8)))
        } catch (e: Exception) {
            // Bozuk/eksik payload — sessizce yok say.
        }
    }

    private fun emitUpdate(json: JSONObject) {
        lastUpdate = json
        sendEvent(
            "onMatchUpdate",
            mapOf(
                "sport" to json.optString("sport"),
                "pointLabelA" to json.optString("pointLabelA"),
                "pointLabelB" to json.optString("pointLabelB"),
                // Ham sayı (voleybolde tenis usulü pointLabel anlamsız kaldığı için) — bkz. PhoneSync.kt.
                "pointsA" to json.optInt("pointsA"),
                "pointsB" to json.optInt("pointsB"),
                "gamesA" to json.optInt("gamesA"),
                "gamesB" to json.optInt("gamesB"),
                "setsA" to json.optInt("setsA"),
                "setsB" to json.optInt("setsB"),
                "matchWinner" to if (json.isNull("matchWinner")) null else json.optString("matchWinner")
            )
        )
    }

    companion object {
        @Volatile
        var onWatchPoint: ((String) -> Unit)? = null
    }
}
