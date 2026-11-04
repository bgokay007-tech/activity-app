package expo.modules.sharebridge

import android.content.ClipData
import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import androidx.core.content.FileProvider
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File

/**
 * Instagram: ADD_TO_STORY.
 * WhatsApp Durum: Meta Share to Status API (wa.me/status); olmazsa ACTION_SEND
 * ile kişi/Durum seçicisi (görsel seçili) — "hiçbir şey olmuyor" durumunu engeller.
 * https://faq.whatsapp.com/669870872481343
 * https://github.com/fbsamples/whatsapp_status_api_android
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
        val uri = resolveShareUri(params) ?: return false
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
            clipData = ClipData.newUri(activity.contentResolver, "image", uri)
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
        val uri = resolveShareUri(params) ?: return false
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
     * 1) Resmi Status API (Meta sample ile aynı extras / flags)
     * 2) Olmazsa ACTION_SEND → WA kişi seçici (üstte Durum) — en azından yönlendirir
     */
    private fun shareWhatsAppStatus(params: Map<String, String>): Boolean {
        val activity = appContext.currentActivity ?: return false
        val uri = resolveShareUri(params) ?: return false
        val pkg = whatsAppPackage() ?: return false
        val mime = params["mime"]?.takeIf { it.isNotBlank() } ?: "image/png"

        grantRead(activity, pkg, uri)

        // Meta sample: ACTION_VIEW + https://wa.me/status — NEW_TASK yok
        val statusIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("https://wa.me/status")
            setPackage(pkg)
            putExtra("source_app_package_name", activity.packageName)
            putExtra("share_type", "SHARE_TO_STATUS")
            putExtra(Intent.EXTRA_STREAM, uri)
            putExtra("foreground_media", uri)
            clipData = ClipData.newUri(activity.contentResolver, "image", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
        }

        if (tryStart(activity, statusIntent)) return true

        // Yedek: görsel seçili WA paylaşım / Durum seçici (TikTok tarzı)
        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newUri(activity.contentResolver, "image", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            setPackage(pkg)
        }
        return tryStart(activity, sendIntent)
    }

    /**
     * filePath (cache png) → kendi FileProvider; yoksa imageUri (content://).
     * MediaStore URI'lerine güvenmiyoruz — izin/okunabilirlik sorunları Status'u sessiz öldürüyordu.
     */
    private fun resolveShareUri(params: Map<String, String>): Uri? {
        val activity = appContext.currentActivity ?: return null
        val rawPath = params["filePath"]?.trim().orEmpty()
            .removePrefix("file://")
        if (rawPath.isNotBlank()) {
            val file = File(rawPath)
            if (file.exists() && file.canRead()) {
                return try {
                    FileProvider.getUriForFile(
                        activity,
                        "${activity.packageName}.sharebridge.provider",
                        file,
                    )
                } catch (_: Exception) {
                    null
                }
            }
        }
        val raw = params["imageUri"]?.takeIf { it.isNotBlank() } ?: return null
        return Uri.parse(raw)
    }

    private fun grantRead(activity: android.app.Activity, pkg: String, uri: Uri) {
        try {
            activity.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: Exception) {
            // FileProvider + ClipData ile de yetebilir
        }
    }

    private fun tryStart(activity: android.app.Activity, intent: Intent): Boolean {
        return try {
            activity.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
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
        grantRead(activity, pkg, uri)
        return tryStart(activity, intent)
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
