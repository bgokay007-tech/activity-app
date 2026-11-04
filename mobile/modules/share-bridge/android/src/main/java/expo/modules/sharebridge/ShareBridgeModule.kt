package expo.modules.sharebridge

import android.content.Intent
import android.content.pm.PackageManager
import android.net.Uri
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext

/**
 * Tenisle tarzı doğrudan Hikâye: com.instagram.share.ADD_TO_STORY + content URI +
 * grantUriPermission. JS Linking.openURL(intent:...) bunu yapamıyor — IG ana sayfaya
 * düşüp "galeriden seç" uyarısı çıkıyordu.
 *
 * source_application: Meta 2023'ten beri Facebook App ID ister. Yoksa paket adı
 * denenir; IG yine açılmazsa false döner, JS fallback'e düşer.
 *
 * linkUrl / linkText: Hikâye link sticker / attribution (hesap + Meta App uygunsa).
 * Fotoğrafın üstüne basılı CTA tıklanabilir DEĞİL — o sadece piksel; tıklanabilir
 * link için bu extras gerekir.
 */
class ShareBridgeModule : Module() {
    override fun definition() = ModuleDefinition {
        Name("ShareBridge")

        AsyncFunction("shareToInstagramStory") Coroutine { params: Map<String, String> ->
            withContext(Dispatchers.Main) {
                shareInstagramStory(params)
            }
        }

        AsyncFunction("shareToWhatsApp") Coroutine { params: Map<String, String> ->
            withContext(Dispatchers.Main) {
                shareWhatsApp(params, statusOnly = false)
            }
        }

        AsyncFunction("shareToWhatsAppStatus") Coroutine { params: Map<String, String> ->
            withContext(Dispatchers.Main) {
                // WA ayrı Status intent sunmuyor — görselli SEND; kullanıcı Durum seçebilir.
                shareWhatsApp(params, statusOnly = true)
            }
        }

        AsyncFunction("isInstagramInstalled") {
            isPackageInstalled("com.instagram.android")
        }

        AsyncFunction("isWhatsAppInstalled") {
            isPackageInstalled("com.whatsapp")
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
            // Attribution / tıklanabilir link (IG + Meta App izin verirse Hikâye'de çıkar)
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

    private fun shareWhatsApp(params: Map<String, String>, statusOnly: Boolean): Boolean {
        val activity = appContext.currentActivity ?: return false
        val rawUri = params["imageUri"]?.takeIf { it.isNotBlank() } ?: return false
        val uri = Uri.parse(rawUri)
        val mime = params["mime"]?.takeIf { it.isNotBlank() } ?: "image/png"
        val text = params["text"] ?: ""

        if (!isPackageInstalled("com.whatsapp")) return false

        // Durum: SADECE görsel. EXTRA_TEXT eklenince WA çoğu telefonda yazı durumu açıyor.
        val intent = Intent(Intent.ACTION_SEND).apply {
            type = mime
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = android.content.ClipData.newUri(activity.contentResolver, "image", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            setPackage("com.whatsapp")
            if (!statusOnly && text.isNotBlank()) {
                putExtra(Intent.EXTRA_TEXT, text)
            }
        }

        return try {
            activity.grantUriPermission(
                "com.whatsapp",
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
