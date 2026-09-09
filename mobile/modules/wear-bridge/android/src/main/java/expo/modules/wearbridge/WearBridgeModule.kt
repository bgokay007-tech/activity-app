package expo.modules.wearbridge

import com.google.android.gms.wearable.MessageClient
import com.google.android.gms.wearable.MessageEvent
import com.google.android.gms.wearable.Wearable
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import org.json.JSONObject

// Wear OS'taki maç ekranının (bkz. wear/ projesi PhoneSync.kt) her sayı
// değişiminde bu path'e gönderdiği mesajı dinler ve JS tarafına "onMatchUpdate"
// olayı olarak iletir — canlı skor takibi için tek yönlü (saat -> telefon) köprü.
// Huawei GT/Fit için ayrıca HuaweiWearEngineListener Notify butonları
// "onWatchPoint" üretir (saat uygulaması kurulamadığı için).
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
            try {
                Wearable.getMessageClient(context).addListener(this@WearBridgeModule)
            } catch (_: Exception) {
                // GMS / Wearable bazı cihazlarda (Play Services yok, Realme/ColorOS
                // kısıtlaması) açılışta fırlatıyor — uygulama çökmesin, saat köprüsü
                // bu telefonda sessizce kapalı kalsın.
            }
            try {
                huaweiListener = HuaweiWearEngineListener(
                    context,
                    onP2pUpdate = { json -> emitUpdate(json) },
                    onWatchPoint = { side ->
                        sendEvent("onWatchPoint", mapOf("side" to side))
                    },
                )
                huaweiListener?.start()
            } catch (_: Exception) {
                huaweiListener = null
            }
        }

        OnDestroy {
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
            huaweiListener = null
            huaweiScoreboardOn = false
        }

        AsyncFunction("isWatchConnected") {
            lastUpdate != null || huaweiScoreboardOn
        }

        // Huawei GT/Fit: saate A+/B+ butonlu skor bildirimi bas. true = Wear Engine
        // cihaz buldu ve notify çağrısı fırlatıldı (Huawei Sağlık yoksa false).
        AsyncFunction("startHuaweiScoreSession") { params: Map<String, String> ->
            ensureHuaweiListener()
            val ok = huaweiListener?.startScoreboard(
                params["title"] ?: "AcTiViTy",
                params["text"] ?: "0-0",
                params["buttonA"] ?: "A +",
                params["buttonB"] ?: "B +",
            ) ?: false
            huaweiScoreboardOn = ok
            ok
        }

        AsyncFunction("updateHuaweiScoreSession") { params: Map<String, String> ->
            huaweiListener?.updateScoreboard(
                params["title"] ?: "AcTiViTy",
                params["text"] ?: "0-0",
                params["buttonA"] ?: "A +",
                params["buttonB"] ?: "B +",
            ) ?: false
        }

        AsyncFunction("stopHuaweiScoreSession") {
            huaweiListener?.stopScoreboard()
            huaweiScoreboardOn = false
        }
    }

    private fun ensureHuaweiListener() {
        if (huaweiListener != null) return
        val context = appContext.reactContext ?: appContext.currentActivity ?: return
        try {
            huaweiListener = HuaweiWearEngineListener(
                context,
                onP2pUpdate = { json -> emitUpdate(json) },
                onWatchPoint = { side ->
                    sendEvent("onWatchPoint", mapOf("side" to side))
                },
            )
            huaweiListener?.start()
        } catch (_: Exception) {
            huaweiListener = null
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
}
