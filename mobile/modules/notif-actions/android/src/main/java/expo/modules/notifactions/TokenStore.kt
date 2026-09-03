package expo.modules.notifactions

import android.content.Context
import android.database.sqlite.SQLiteDatabase

// AsyncStorage (RN) Android'de SharedPreferences DEĞİL, SQLite kullanıyor: RKStorage veritabanı,
// catalystLocalStorage tablosu, key/value TEXT kolonları — bkz. node_modules/@react-native-
// async-storage/async-storage/android/.../ReactDatabaseSupplier.java. JS tarafı (api.js)
// activity_token'ı bu şekilde AsyncStorage'a düz string olarak yazıyor, biz de burada
// doğrudan SQL ile aynı şekilde okuyoruz — React/JS motoru hiç çalışmasa da erişilebilir.
object TokenStore {
    fun readValue(context: Context, key: String): String? {
        val dbFile = context.getDatabasePath("RKStorage")
        if (!dbFile.exists()) return null
        var db: SQLiteDatabase? = null
        return try {
            db = SQLiteDatabase.openDatabase(dbFile.path, null, SQLiteDatabase.OPEN_READONLY)
            db.rawQuery(
                "SELECT value FROM catalystLocalStorage WHERE key = ?",
                arrayOf(key)
            ).use { cursor ->
                if (cursor.moveToFirst()) cursor.getString(0) else null
            }
        } catch (e: Exception) {
            null
        } finally {
            db?.close()
        }
    }
}
