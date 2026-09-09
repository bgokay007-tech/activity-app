package expo.modules.wearbridge

import android.content.Context
import com.huawei.wearengine.HiWear
import com.huawei.wearengine.device.Device
import com.huawei.wearengine.p2p.Message
import com.huawei.wearengine.p2p.Receiver
import org.json.JSONObject

/**
 * HarmonyOS saat uygulamasından (harmony/) P2P skor JSON'u. Wear OS PhoneSync.kt
 * ile aynı şema. GT/Fit skor butonları Wear Engine NotifyClient (5.0.1.300)
 * şablon bildirimiyle gidiyor — bkz. HuaweiWatchNotify.
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
        // İzin penceresi açma — Samsung/Pixel'te Wear Engine diyaloğu çıkmasın.
        // Harmony P2P zaten parmak izi TODO; bağlı cihaz varsa sessiz dinle.
        bindConnectedDevice()
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
