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
 * HarmonyOS saat uygulamasından (harmony/) P2P skor JSON'u. Wear OS PhoneSync.kt
 * ile aynı şema. SDK 5.0.0.300'de Notify sınıfları yok (Action/Notification
 * unresolved) — GT/Fit skor butonları bu yüzden Android bildirimi + Huawei
 * Sağlık yansıtmasıyla gidiyor (bkz. WatchScoreNotification).
 */
private const val PEER_WATCH_PACKAGE = "com.activity.app.harmony"
private const val PEER_WATCH_FINGERPRINT = "TODO_HARMONY_APP_SHA256_FINGERPRINT"

class HuaweiWearEngineListener(
    private val context: Context,
    private val onP2pUpdate: (JSONObject) -> Unit,
) {
    private val p2pClient = HiWear.getP2pClient(context)
    private var connectedDevice: Device? = null

    private val receiver = object : Receiver {
        override fun onReceiveMessage(message: Message) {
            if (message.type != Message.MESSAGE_TYPE_DATA) return
            try {
                onP2pUpdate(JSONObject(String(message.data, Charsets.UTF_8)))
            } catch (_: Exception) {
            }
        }
    }

    fun start() {
        try {
            HiWear.getAuthClient(context).requestPermission(object : AuthCallback {
                override fun onOk(permissions: Array<out Permission>) {
                    bindConnectedDevice()
                }

                override fun onCancel() {}
            }, Permission.DEVICE_MANAGER)
        } catch (_: Exception) {
        }
    }

    private fun bindConnectedDevice() {
        try {
            HiWear.getDeviceClient(context).getBondedDevices()
                .addOnSuccessListener { devices ->
                    val device = devices.firstOrNull { it.isConnected } ?: return@addOnSuccessListener
                    connectedDevice = device
                    tryRegisterP2p(device)
                }
        } catch (_: Exception) {
        }
    }

    private fun tryRegisterP2p(device: Device) {
        if (PEER_WATCH_FINGERPRINT.startsWith("TODO")) return
        try {
            p2pClient.setPeerPkgName(PEER_WATCH_PACKAGE)
            p2pClient.setPeerFingerPrint(PEER_WATCH_FINGERPRINT)
            p2pClient.registerReceiver(device, receiver)
        } catch (_: Exception) {
        }
    }

    fun stop() {
        try {
            if (connectedDevice != null) {
                p2pClient.unregisterReceiver(receiver)
            }
        } catch (_: Exception) {
        }
        connectedDevice = null
    }
}
