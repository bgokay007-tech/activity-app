package expo.modules.notifactions

import android.util.Log
import java.net.HttpURLConnection
import java.net.URL

// Bildirim aksiyon butonlarından (uygulama hiç açılmadan) doğrudan backend'e istek atmak için —
// JS/React Native motoruna hiç ihtiyaç duymaz, ekstra bir kütüphane bağımlılığı eklememek için
// düz HttpURLConnection kullanılıyor.
object ApiClient {
    private const val BASE_URL = "https://activity-app-production-f4c2.up.railway.app/api"

    fun request(method: String, path: String, token: String?, jsonBody: String? = null) {
        try {
            val conn = URL(BASE_URL + path).openConnection() as HttpURLConnection
            conn.requestMethod = method
            conn.connectTimeout = 8000
            conn.readTimeout = 8000
            conn.setRequestProperty("Content-Type", "application/json")
            if (!token.isNullOrEmpty()) conn.setRequestProperty("Authorization", "Bearer $token")
            if (jsonBody != null) {
                conn.doOutput = true
                conn.outputStream.use { it.write(jsonBody.toByteArray(Charsets.UTF_8)) }
            }
            conn.responseCode
            conn.disconnect()
        } catch (e: Exception) {
            Log.e("NotifActions", "request failed ($method $path): ${e.message}")
        }
    }
}
