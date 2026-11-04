package expo.modules.sharebridge

import android.app.Activity
import android.content.Intent
import android.os.Build
import android.os.Bundle

/**
 * Meta WhatsApp Status sample ile aynı proxy:
 * Status deep-link çoğu zaman startActivityForResult ister; ayrıca
 * foreground'a geçmeden BAL (background activity launch) engeline takılabilir.
 */
class ShareBridgeStatusProxyActivity : Activity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val target = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            intent.getParcelableExtra(EXTRA_TARGET_INTENT, Intent::class.java)
        } else {
            @Suppress("DEPRECATION")
            intent.getParcelableExtra(EXTRA_TARGET_INTENT)
        }
        if (target == null) {
            finish()
            return
        }
        try {
            @Suppress("DEPRECATION")
            startActivityForResult(target, REQ)
        } catch (_: Exception) {
            finish()
        }
    }

    @Deprecated("Deprecated in Java")
    override fun onActivityResult(requestCode: Int, resultCode: Int, data: Intent?) {
        super.onActivityResult(requestCode, resultCode, data)
        finish()
    }

    companion object {
        const val EXTRA_TARGET_INTENT = "sharebridge_target_intent"
        private const val REQ = 4401
    }
}
