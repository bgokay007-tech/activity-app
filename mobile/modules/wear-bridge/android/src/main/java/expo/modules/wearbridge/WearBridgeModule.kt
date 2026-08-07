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
private const val MATCH_UPDATE_PATH = "/activity/match-update"

class WearBridgeModule : Module(), MessageClient.OnMessageReceivedListener {
    private var lastUpdate: JSONObject? = null
    // Huawei/HarmonyOS köprüsü (HuaweiWearEngineListener) geçici olarak devre dışı —
    // com.huawei.wearengine:wearengine:1.0.0 paketi Huawei'nin Maven deposunda artık
    // yok (bkz. com.huawei.hms:wearengine:5.0.0.300'e taşınmış), bu yüzden her Android
    // build'i (APK dahil) Gradle aşamasında başarısız oluyordu. Google Wear OS köprüsü
    // (aşağıdaki MessageClient) bundan etkilenmiyor, çalışmaya devam ediyor. Yeniden
    // açmak için: build.gradle'daki bağımlılığı com.huawei.hms:wearengine:5.0.0.300
    // yap, HuaweiWearEngineListener.kt.disabled dosyasını .kt'ye geri çevir (paket
    // isimleri yeni SDK'da değişmiş olabilir, doğrulanması gerekir), sonra buradaki
    // huaweiListener alanını/OnCreate-OnDestroy çağrılarını geri ekle.

    override fun definition() = ModuleDefinition {
        Name("WearBridge")

        Events("onMatchUpdate")

        OnCreate {
            appContext.reactContext?.let { context ->
                Wearable.getMessageClient(context).addListener(this@WearBridgeModule)
            }
        }

        OnDestroy {
            appContext.reactContext?.let {
                Wearable.getMessageClient(it).removeListener(this@WearBridgeModule)
            }
        }

        AsyncFunction("isWatchConnected") {
            lastUpdate != null
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
                "gamesA" to json.optInt("gamesA"),
                "gamesB" to json.optInt("gamesB"),
                "setsA" to json.optInt("setsA"),
                "setsB" to json.optInt("setsB"),
                "matchWinner" to if (json.isNull("matchWinner")) null else json.optString("matchWinner")
            )
        )
    }
}
