package expo.modules.sharebridge

import android.content.ClipData
import android.content.ContentValues
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.BitmapFactory
import android.net.Uri
import android.os.Build
import android.os.Environment
import android.provider.MediaStore
import androidx.core.content.FileProvider
import expo.modules.kotlin.functions.Coroutine
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import java.io.File
import java.io.FileInputStream
import java.io.FileOutputStream

/**
 * Instagram: ADD_TO_STORY.
 * WhatsApp Durum: Meta Share to Status API — MediaStore URI + startActivityForResult
 * (proxy activity). https://faq.whatsapp.com/669870872481343
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
            val prepared = withContext(Dispatchers.IO) { prepareStatusUri(params) }
                ?: return@Coroutine false
            withContext(Dispatchers.Main) { launchWhatsAppStatus(prepared) }
        }

        AsyncFunction("isInstagramInstalled") {
            isPackageInstalled("com.instagram.android")
        }

        AsyncFunction("isWhatsAppInstalled") {
            isPackageInstalled("com.whatsapp") || isPackageInstalled("com.whatsapp.w4b")
        }
    }

    private data class PreparedUri(val uri: Uri, val mime: String)

    private fun shareInstagramStory(params: Map<String, String>): Boolean {
        val activity = appContext.currentActivity ?: return false
        val file = sourceFile(params) ?: return false
        val uri = fileProviderUri(file) ?: return false
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
            activity.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    private fun shareWhatsAppChat(params: Map<String, String>): Boolean {
        val activity = appContext.currentActivity ?: return false
        val file = sourceFile(params) ?: return false
        val uri = fileProviderUri(file) ?: return false
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
        return try {
            activity.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
            activity.startActivity(intent)
            true
        } catch (_: Exception) {
            false
        }
    }

    /** Dosyayı filesDir JPEG + MediaStore'a yaz — WA Status FileProvider cache'i çoğu zaman yutuyor. */
    private fun prepareStatusUri(params: Map<String, String>): PreparedUri? {
        val activity = appContext.currentActivity ?: return null
        val src = sourceFile(params) ?: return null
        val jpeg = File(activity.filesDir, "wa_status_share.jpg")
        if (!copyAsJpeg(src, jpeg)) {
            // JPEG olmazsa PNG kopyala
            val png = File(activity.filesDir, "wa_status_share.png")
            src.copyTo(png, overwrite = true)
            val media = insertIntoMediaStore(png, "image/png")
            if (media != null) return PreparedUri(media, "image/png")
            val fp = fileProviderUri(png) ?: return null
            return PreparedUri(fp, "image/png")
        }
        val media = insertIntoMediaStore(jpeg, "image/jpeg")
        if (media != null) return PreparedUri(media, "image/jpeg")
        val fp = fileProviderUri(jpeg) ?: return null
        return PreparedUri(fp, "image/jpeg")
    }

    private fun launchWhatsAppStatus(prepared: PreparedUri): Boolean {
        val activity = appContext.currentActivity ?: return false
        val pkg = whatsAppPackage() ?: return false
        val uri = prepared.uri

        try {
            activity.grantUriPermission(pkg, uri, Intent.FLAG_GRANT_READ_URI_PERMISSION)
        } catch (_: Exception) { /* MediaStore genelde grant gerektirmez */ }

        // Meta: sadece arka plan görseli (9:16 skor kartı tam ekran)
        val statusIntent = Intent(Intent.ACTION_VIEW).apply {
            data = Uri.parse("https://wa.me/status")
            setPackage(pkg)
            putExtra("source_app_package_name", activity.packageName)
            putExtra("share_type", "SHARE_TO_STATUS")
            putExtra(Intent.EXTRA_STREAM, uri)
            clipData = ClipData.newUri(activity.contentResolver, "image", uri)
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
            addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
        }

        // Proxy → startActivityForResult (Meta sample). Düz startActivity çoğu cihazda
        // sadece WA ana ekranını açıp görseli yutmuyor.
        return try {
            val proxy = Intent(activity, ShareBridgeStatusProxyActivity::class.java).apply {
                putExtra(ShareBridgeStatusProxyActivity.EXTRA_TARGET_INTENT, statusIntent)
                clipData = ClipData.newUri(activity.contentResolver, "image", uri)
                addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                addFlags(Intent.FLAG_GRANT_PREFIX_URI_PERMISSION)
            }
            activity.startActivity(proxy)
            true
        } catch (_: Exception) {
            // Son çare: doğrudan forResult
            try {
                @Suppress("DEPRECATION")
                activity.startActivityForResult(statusIntent, 4402)
                true
            } catch (_: Exception) {
                false
            }
        }
    }

    private fun sourceFile(params: Map<String, String>): File? {
        val rawPath = params["filePath"]?.trim().orEmpty().removePrefix("file://")
        if (rawPath.isNotBlank()) {
            val f = File(rawPath)
            if (f.exists() && f.canRead()) return f
        }
        // imageUri file:// ise
        val raw = params["imageUri"]?.takeIf { it.startsWith("file:") } ?: return null
        val f = File(Uri.parse(raw).path ?: return null)
        return f.takeIf { it.exists() && it.canRead() }
    }

    private fun fileProviderUri(file: File): Uri? {
        val activity = appContext.currentActivity ?: return null
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

    private fun copyAsJpeg(src: File, dest: File): Boolean {
        return try {
            val bmp = BitmapFactory.decodeFile(src.absolutePath) ?: return false
            FileOutputStream(dest).use { out ->
                bmp.compress(Bitmap.CompressFormat.JPEG, 92, out)
            }
            bmp.recycle()
            dest.exists() && dest.length() > 0
        } catch (_: Exception) {
            false
        }
    }

    private fun insertIntoMediaStore(file: File, mime: String): Uri? {
        val activity = appContext.currentActivity ?: return null
        val resolver = activity.contentResolver
        val name = "activity_status_${System.currentTimeMillis()}" +
            if (mime.contains("jpeg") || mime.contains("jpg")) ".jpg" else ".png"
        val values = ContentValues().apply {
            put(MediaStore.Images.Media.DISPLAY_NAME, name)
            put(MediaStore.Images.Media.MIME_TYPE, mime)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                put(MediaStore.Images.Media.RELATIVE_PATH, Environment.DIRECTORY_PICTURES + "/AcTiViTy")
                put(MediaStore.Images.Media.IS_PENDING, 1)
            }
        }
        val collection = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
            MediaStore.Images.Media.getContentUri(MediaStore.VOLUME_EXTERNAL_PRIMARY)
        } else {
            @Suppress("DEPRECATION")
            MediaStore.Images.Media.EXTERNAL_CONTENT_URI
        }
        val uri = try {
            resolver.insert(collection, values)
        } catch (_: Exception) {
            null
        } ?: return null

        return try {
            resolver.openOutputStream(uri)?.use { out ->
                FileInputStream(file).use { it.copyTo(out) }
            } ?: run {
                resolver.delete(uri, null, null)
                return null
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                values.clear()
                values.put(MediaStore.Images.Media.IS_PENDING, 0)
                resolver.update(uri, values, null, null)
            }
            uri
        } catch (_: Exception) {
            try {
                resolver.delete(uri, null, null)
            } catch (_: Exception) { }
            null
        }
    }

    private fun whatsAppPackage(): String? = when {
        isPackageInstalled("com.whatsapp") -> "com.whatsapp"
        isPackageInstalled("com.whatsapp.w4b") -> "com.whatsapp.w4b"
        else -> null
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
