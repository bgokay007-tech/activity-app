package expo.modules.wearbridge

import android.content.Context
import com.huawei.wearengine.HiWear
import com.huawei.wearengine.auth.AuthCallback
import com.huawei.wearengine.auth.Permission
import com.huawei.wearengine.device.Device
import com.huawei.wearengine.p2p.Message
import com.huawei.wearengine.p2p.Receiver
import org.json.JSONObject

/**
 * Huawei/HarmonyOS saatlerden (Google Play Services'a bağlı olmayan cihazlar —
 * bkz. harmony/entry/.../scoring/PhoneSync.ets) gelen canlı skor
 * güncellemelerini Huawei Wear Engine Kit'in P2P API'siyle dinler.
 * WearBridgeModule'daki Wear OS köprüsünden (Google Data Layer API)
 * tamamen bağımsız çalışır — ikisi de aynı JSON şemasını gönderdiği için
 * üst katmanda (onUpdate callback'i, JS'e tek bir "onMatchUpdate" olayı
 * olarak iletilir) hangi saat tipi olduğu fark etmez.
 *
 * NOT (gerçek cihazla doğrulanmadı): com.huawei.wearengine paketinin metot
 * imzaları resmi kod örneklerine dayanarak yazıldı — bu SDK Huawei Developer
 * konsolunda kayıt (paket adı + imza sertifikası fingerprint eşleştirmesi)
 * gerektirdiğinden ve gerçek bir Huawei Watch/HarmonyOS ortamı olmadan derlenip
 * uçtan uca test edilemediğinden (bkz. harmony/ commit notu), build.gradle'daki
 * bağımlılık çözüldüğünde Android Studio'nun sunduğu gerçek imzalarla
 * karşılaştırılması gerekiyor.
 */
private const val PEER_WATCH_PACKAGE = "com.activity.app.harmony"

// TODO(gerçek cihaz kaydı): harmony/ uygulamasının imza sertifikası SHA256
// fingerprint'i — Huawei Developer konsolunda "Wear Engine" servisi açılıp
// hem telefon hem saat uygulaması kaydedilince alınır.
private const val PEER_WATCH_FINGERPRINT = "TODO_HARMONY_APP_SHA256_FINGERPRINT"

class HuaweiWearEngineListener(
    private val context: Context,
    private val onUpdate: (JSONObject) -> Unit,
) {
    private val p2pClient = HiWear.getP2pClient(context)
    private var registeredDevice: Device? = null

    private val receiver = object : Receiver {
        override fun onReceiveMessage(message: Message) {
            if (message.type != Message.MESSAGE_TYPE_DATA) return
            try {
                onUpdate(JSONObject(String(message.data, Charsets.UTF_8)))
            } catch (e: Exception) {
                // Bozuk/eksik payload — sessizce yok say.
            }
        }
    }

    // İzin ekrandan onaylanmadan p2p mesaj dinlenemiyor — kullanıcı reddederse
    // Huawei köprüsü sessizce devre dışı kalır, Wear OS köprüsü etkilenmez.
    fun start() {
        HiWear.getAuthClient(context).requestPermission(object : AuthCallback {
            override fun onOk(permissions: Array<out Permission>) {
                registerOnConnectedDevice()
            }

            override fun onCancel() {
                // Kullanıcı Wear Engine iznini reddetti.
            }
        }, Permission.DEVICE_MANAGER)
    }

    private fun registerOnConnectedDevice() {
        HiWear.getDeviceClient(context).getBondedDevices().addOnSuccessListener { devices ->
            val device = devices.firstOrNull { it.isConnected } ?: return@addOnSuccessListener
            p2pClient.setPeerPkgName(PEER_WATCH_PACKAGE)
            p2pClient.setPeerFingerPrint(PEER_WATCH_FINGERPRINT)
            p2pClient.registerReceiver(device, receiver).addOnSuccessListener {
                registeredDevice = device
            }
        }
    }

    fun stop() {
        if (registeredDevice != null) {
            p2pClient.unregisterReceiver(receiver)
        }
        registeredDevice = null
    }
}
