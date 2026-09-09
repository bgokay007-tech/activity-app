package expo.modules.wearbridge

import android.content.Context
import android.util.Log
import com.huawei.hmf.tasks.Tasks
import com.huawei.wearengine.HiWear
import com.huawei.wearengine.auth.AuthCallback
import com.huawei.wearengine.auth.Permission
import com.huawei.wearengine.device.Device
import com.huawei.wearengine.notify.Action
import com.huawei.wearengine.notify.Notification
import com.huawei.wearengine.notify.NotificationConstants
import com.huawei.wearengine.notify.NotificationTemplate
import java.util.HashMap
import java.util.concurrent.CountDownLatch
import java.util.concurrent.TimeUnit

/**
 * Huawei GT/Fit (LiteOS): üçüncü parti saat uygulaması kurulamaz. Wear Engine
 * 5.0.0.300'de NotifyClient yoktu, o yüzden sessiz Android bildirimine
 * düşülmüştü — Huawei Sağlık o tür bildirimi saate hiç yansıtmıyor. 5.0.1.300
 * şablon bildirimi (iki buton) saatte native A+/B+ gösterir.
 */
object HuaweiWatchNotify {
    private const val TAG = "HuaweiWatchNotify"
    @Volatile private var permissionsGranted = false

    fun send(context: Context, title: String, text: String, buttonA: String, buttonB: String): Boolean {
        return try {
            if (!ensurePermissions(context)) {
                Log.w(TAG, "NOTIFY/DEVICE_MANAGER izni yok")
                return false
            }
            val device = connectedDevice(context) ?: run {
                Log.w(TAG, "bagli Huawei saat yok")
                return false
            }
            val buttons = HashMap<Int, String>()
            buttons[NotificationConstants.BUTTON_ONE_CONTENT_KEY] = buttonA.take(12)
            buttons[NotificationConstants.BUTTON_TWO_CONTENT_KEY] = buttonB.take(12)
            val notification = Notification.Builder()
                .setTemplateId(NotificationTemplate.NOTIFICATION_TEMPLATE_TWO_BUTTONS)
                .setPackageName(context.packageName)
                .setTitle(title.take(28))
                .setText(text.take(400))
                .setButtonContents(buttons)
                .setAction(object : Action {
                    override fun onResult(notification: Notification, feedback: Int) {
                        // 2 = birinci buton (A +), 3 = ikinci buton (B +)
                        val side = when (feedback) {
                            2 -> "A"
                            3 -> "B"
                            else -> return
                        }
                        WearBridgeModule.onWatchPoint?.invoke(side)
                    }

                    override fun onError(notification: Notification, errorCode: Int, errorMsg: String) {
                        Log.e(TAG, "watch action error $errorCode $errorMsg")
                    }
                })
                .build()
            Tasks.await(HiWear.getNotifyClient(context).notify(device, notification), 12, TimeUnit.SECONDS)
            true
        } catch (e: Exception) {
            Log.e(TAG, "send failed", e)
            false
        }
    }

    private fun ensurePermissions(context: Context): Boolean {
        if (permissionsGranted) return true
        try {
            val notifyOk = Tasks.await(HiWear.getAuthClient(context).checkPermission(Permission.NOTIFY), 6, TimeUnit.SECONDS)
            val deviceOk = Tasks.await(HiWear.getAuthClient(context).checkPermission(Permission.DEVICE_MANAGER), 6, TimeUnit.SECONDS)
            if (notifyOk == true && deviceOk == true) {
                permissionsGranted = true
                return true
            }
        } catch (_: Exception) {
        }
        val latch = CountDownLatch(1)
        var ok = false
        HiWear.getAuthClient(context).requestPermission(object : AuthCallback {
            override fun onOk(permissions: Array<out Permission>) {
                ok = true
                latch.countDown()
            }

            override fun onCancel() {
                latch.countDown()
            }
        }, Permission.DEVICE_MANAGER, Permission.NOTIFY)
        latch.await(25, TimeUnit.SECONDS)
        if (ok) permissionsGranted = true
        return ok
    }

    private fun connectedDevice(context: Context): Device? {
        val devices = Tasks.await(
            HiWear.getDeviceClient(context).getBondedDevices(),
            12,
            TimeUnit.SECONDS,
        ) ?: return null
        return devices.firstOrNull { it.isConnected }
    }
}
