package expo.modules.sharebridge

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Instagram: ADD_TO_STORY. WhatsApp Durum: resmi Share to Status API
 * (https://wa.me/status + share_type=SHARE_TO_STATUS) — düz ACTION_SEND sohbet
 * seçicisine düşüp JS tarafında "galeriden seç" fallback'ine yol açıyordu.
 */
class ShareBridgeModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ShareBridge")

        AsyncFunction("shareToInstagramStory") Coroutine { params: Map<String, String> ->
            withContext(Dispatchers.Main) { shareInstagramStory(params) }
        }

        AsyncFunction("shareToWhatsApp") Coroutine { params: Map<String, String> ->
            withContext(Dispatchers.Main) { shareWhatsAppChat(params) }
        }

        AsyncFunction("shareToWhatsAppStatus") Coroutine { params: Map<String, String> ->
            withContext(Dispatchers.Main) { shareWhatsAppStatus(params) }
        }

        AsyncFunction("isInstagramInstalled") {
            isPackageInstalled("com.instagram.android")
        }

        AsyncFunction("isWhatsAppInstalled") {
            isPackageInstalled("com.whatsapp") || isPackageInstalled("com.whatsapp.w4b")
        }
    }

    private fun shareInstagramStory(params: Map<String, String>): Boolean {
        val activity = appContext.currentActivity ?: return false
        val rawUri = params["imageUri"]?.takeIf { it.isNotBlank() } ?: return false
        val uri = Uri.parse(rawUri)
        val mime = params["mime"]?.takeIf { it.isNotBlank() } ?: "image/png"
        val sourceApp = params["facebookAppId"]?.takeIf { it.isNotBlank() }
            ?: (activity.packageName ?: "com.activity.app")
        val linkUrl = params["linkUrl"]?.takeIf { it.isNotBlank() }
        val linkText = params["linkText"]?.takeIf { it.isNotBlank() }

        if (!isPackageInstalled("com.instagram.android")) return false

        val intent = Intent("com.instagram.share.ADD_TO_STORY").apply {
            setDataAndType(uri, mime)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            putExtra("source_application", sourceApp)
            if (linkUrl != null) {
                putExtra("content_url", linkUrl)
                putExtra("link_url", linkUrl)
                if (linkText != null) putExtra("link_text", linkText)
            }
            setPackage("com.instagram.android")
        }

        return try {
            activity.grantUriPermission(
                "com.instagram.android",
                uri,
                Intent.FLAG_GRANT_READ_URI_PERMISSION,
            )
            if (intent.resolveActivity(activity.packageManager) == null) return false
            activity.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    /** Sohbet / kişi seçici — ACTION_SEND + görsel (+ isteğe bağlı metin). */
    private fun shareWhatsAppChat(params: Map<String, String>): Boolean {
        val activity = appContext.currentActivity ?: return false
        val uri = parseUri(params) ?: return false
        val mime = params["mime"]?.takeIf { it.isNotBlank() } ?: "image/png"
        val text = params["text"] ?: ""
        val pkg = whatsAppPackage() ?: return false

        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newUri(activity.contentResolver, "image", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            setPackage(pkg)
            if (text.isNotBlank()) putExtra(Intent.EXTRA_TEXT, text)
        }
        return launchGranted(activity, pkg, uri, intent)
    }

    /**
     * Resmi WhatsApp Share to Status API — görsel Durum bestecisinde seçili açılır.
     * https://faq.whatsapp.com/669870872481343
     *
     * resolveActivity null olsa bile startActivity dene: bazı WA sürümlerinde
     * wa.me/status filtresi PM'de görünmez ama intent çalışır. Aksi halde JS
     * "galeriden seç" fallback'ine düşüyordu.
     */
    private fun shareWhatsAppStatus(params: Map<String, String>): Boolean {
        val activity = appContext.currentActivity ?: return false
        val uri = parseUri(params) ?: return false
        val pkg = whatsAppPackage() ?: return false

        try {
            activity.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: Exception) {
            // MediaStore URI'lerde grant gereksiz / reddedilebilir — ClipData yeter
        }

        val intent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("https://wa.me/status")
            setPackage(pkg)
            putExtra("source_app_package_name", activity.packageName)
            putExtra("share_type", "SHARE_TO_STATUS")
            putExtra(Intent.EXTRA_STREAM, uri)
            // Skor kartı arka plan olarak dolsun (9:16)
            clipData = ClipData.newUri(activity.contentResolver, "image", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }

        return try {
            activity.startActivity(intent)
            true
        } catch (_: Exception) {
            // Paketli intent düştüyse packagesiz dene (chooser / WA resolve)
            try {
                intent.setPackage(null)
                activity.startActivity(intent)
                true
            } catch (_: Exception) {
                false
            }
        }
    }

    private fun parseUri(params: Map<String, String>): Uri? {
        val raw = params["imageUri"]?.takeIf { it.isNotBlank() } ?: return null
        return Uri.parse(raw)
    }

    private fun whatsAppPackage(): String? = when {
        isPackageInstalled("com.whatsapp") -> "com.whatsapp"
        isPackageInstalled("com.whatsapp.w4b") -> "com.whatsapp.w4b"
        else -> null
    }

    private fun launchGranted(
        activity: android.app.Activity,
        pkg: String,
        uri: Uri,
        intent: Intent,
    ): Boolean {
        return try {
            activity.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            if (intent.resolveActivity(activity.packageManager) == null) return false
            activity.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun isPackageInstalled(pkg: String): Boolean {
        val ctx = appContext.reactContext ?: appContext.currentActivity ?: return false
        return try {
            ctx.packageManager.getPackageInfo(pkg, 0)
            true
        } catch (_: PackageManager.NameNotFoundException) {
            false
        }
    }
}
