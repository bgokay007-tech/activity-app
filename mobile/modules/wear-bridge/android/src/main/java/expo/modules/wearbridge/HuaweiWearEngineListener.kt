package expo.modules.wearbridge

import android.content.Context
import android.os.Handler
import android.os.Looper
import com.huawei.wearengine.HiWear
import java.util.HashMap
import com.huawei.wearengine.auth.AuthCallback
import com.huawei.wearengine.auth.Permission
import com.huawei.wearengine.device.Device
import com.huawei.wearengine.notify.Action
import com.huawei.wearengine.notify.Notification
import com.huawei.wearengine.notify.NotificationConstants
import com.huawei.wearengine.notify.NotificationTemplate
import com.huawei.wearengine.p2p.Message
import com.huawei.wearengine.p2p.Receiver
import org.json.JSONObject

/**
 * Huawei saat köprüsü iki yoldan çalışır, ikisi de Wear Engine Kit (P2P + Notify):
 *
 * 1) Notify skor tahtası — GT/Fit/Band gibi LiteOS saatlerde üçüncü parti uygulama
 *    kurulamadığı için (Wear OS APK'sı bu modellere yüklenmez) telefon, saate
 *    iki butonlu şablon bildirim yollar. A+/B+ basılınca Action callback telefonda
 *    çalışır; JS tarafı aynı motoru (manualPoint) besler. Saat uygulaması ve
 *    fingerprint gerekmez — sadece Huawei Sağlık + eşli saat.
 *
 * 2) P2P — harmony/ (Watch 3/4/5 HarmonyOS) uygulamasından gelen JSON. Wear OS
 *    PhoneSync.kt ile aynı şema. Fingerprint AppGallery kaydı olmadan register
 *    başarısız olur; o zaman sadece (1) açık kalır, uygulama çökmez.
 *
 * com.huawei.hms:wearengine:5.0.0.300 — eski com.huawei.wearengine:wearengine:1.0.0
 * Maven'da yoktu, her APK Gradle'da düşüyordu.
 */
private const val PEER_WATCH_PACKAGE = "com.activity.app.harmony"
private const val PEER_WATCH_FINGERPRINT = "TODO_HARMONY_APP_SHA256_FINGERPRINT"

class HuaweiWearEngineListener(
    private val context: Context,
    private val onP2pUpdate: (JSONObject) -> Unit,
    private val onWatchPoint: (String) -> Unit,
) {
    private val main = Handler(Looper.getMainLooper())
    private val p2pClient = HiWear.getP2pClient(context)
    private val notifyClient = HiWear.getNotifyClient(context)
    private var connectedDevice: Device? = null
    private var scoreboardActive = false
    private var lastTitle = "AcTiViTy"
    private var lastText = "0-0"
    private var lastButtonA = "A +"
    private var lastButtonB = "B +"

    private val receiver = object : Receiver {
        override fun onReceiveMessage(message: Message) {
            if (message.type != Message.MESSAGE_TYPE_DATA) return
            try {
                onP2pUpdate(JSONObject(String(message.data, Charsets.UTF_8)))
            } catch (_: Exception) {
                // Bozuk/eksik payload — sessizce yok say.
            }
        }
    }

    private val notifyAction = object : Action {
        override fun onResult(notification: Notification, feedback: Int) {
            // 2 = birinci buton (A), 3 = ikinci buton (B). 0/1 kapatma — skor yazılmaz.
            val side = when (feedback) {
                2 -> "A"
                3 -> "B"
                else -> return
            }
            if (!scoreboardActive) return
            onWatchPoint(side)
        }

        override fun onError(notification: Notification, errorCode: Int, errorMsg: String) {
            // Bildirim saate gitmedi (Wear Engine kaydı yok, Huawei Sağlık yok, saat
            // bağlı değil) — skor akışını bozma, JS startHuaweiScoreSession false alır.
        }
    }

    fun start() {
        try {
            HiWear.getAuthClient(context).requestPermission(object : AuthCallback {
                override fun onOk(permissions: Array<out Permission>) {
                    bindConnectedDevice()
                }

                override fun onCancel() {
                    // Kullanıcı Wear Engine iznini reddetti — GMS Wear OS köprüsü etkilenmez.
                }
            }, Permission.DEVICE_MANAGER, Permission.NOTIFY)
        } catch (_: Exception) {
            // Wear Engine APK/Huawei Sağlık yok (Pixel, Samsung saf GMS) — sessizce kapalı.
        }
    }

    private fun bindConnectedDevice() {
        try {
            HiWear.getDeviceClient(context).getBondedDevices()
                .addOnSuccessListener { devices ->
                    val device = devices.firstOrNull { it.isConnected } ?: return@addOnSuccessListener
                    connectedDevice = device
                    tryRegisterP2p(device)
                    if (scoreboardActive) pushScoreboard(device)
                }
        } catch (_: Exception) {
        }
    }

    private fun tryRegisterP2p(device: Device) {
        // Fingerprint hâlâ TODO ise register Huawei tarafında fail eder; Notify yolu
        // zaten açık olduğu için burada yutuyoruz. Harmony uygulaması AppGallery'ye
        // kaydolup SHA256 yapıştırılınca P2P de devreye girer.
        if (PEER_WATCH_FINGERPRINT.startsWith("TODO")) return
        try {
            p2pClient.setPeerPkgName(PEER_WATCH_PACKAGE)
            p2pClient.setPeerFingerPrint(PEER_WATCH_FINGERPRINT)
            p2pClient.registerReceiver(device, receiver)
        } catch (_: Exception) {
        }
    }

    fun startScoreboard(title: String, text: String, buttonA: String, buttonB: String): Boolean {
        lastTitle = title
        lastText = text
        lastButtonA = buttonA
        lastButtonB = buttonB
        scoreboardActive = true
        val device = connectedDevice
        if (device == null) {
            bindConnectedDevice()
            // Huawei Sağlık bazen eşleşmeyi birkaç saniye geciktirir — bildirim
            // ilk denemede boş cihaz listesine düşmesin diye iki kez daha dene.
            main.postDelayed({ bindConnectedDevice() }, 1500)
            main.postDelayed({ bindConnectedDevice() }, 4000)
            return false
        }
        return pushScoreboard(device)
    }

    fun updateScoreboard(title: String, text: String, buttonA: String, buttonB: String): Boolean {
        if (!scoreboardActive) return startScoreboard(title, text, buttonA, buttonB)
        lastTitle = title
        lastText = text
        lastButtonA = buttonA
        lastButtonB = buttonB
        val device = connectedDevice ?: return false
        return pushScoreboard(device)
    }

    fun stopScoreboard() {
        scoreboardActive = false
    }

    private fun pushScoreboard(device: Device): Boolean {
        return try {
            val buttons = HashMap<Int, String>()
            buttons[NotificationConstants.BUTTON_ONE_CONTENT_KEY] = lastButtonA
            buttons[NotificationConstants.BUTTON_TWO_CONTENT_KEY] = lastButtonB
            val notification = Notification.Builder()
                .setTemplateId(NotificationTemplate.NOTIFICATION_TEMPLATE_TWO_BUTTONS)
                .setPackageName(context.packageName)
                .setTitle(lastTitle.take(28))
                .setText(lastText.take(400))
                .setButtonContents(buttons)
                .setAction(notifyAction)
                .build()
            notifyClient.notify(device, notification)
            true
        } catch (_: Exception) {
            false
        }
    }

    fun stop() {
        scoreboardActive = false
        try {
            if (connectedDevice != null) {
                p2pClient.unregisterReceiver(receiver)
            }
        } catch (_: Exception) {
        }
        connectedDevice = null
    }
}
