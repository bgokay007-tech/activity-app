package expo.modules.healthbridge

import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.time.Instant

// Maç bitince [matchStartedAt, matchEndedAt) aralığında Health Connect'ten kalp atışı ve
// aktif kaloriyi okur. Health Connect saat + telefon verisini kendi içinde otomatik
// birleştirdiği için (saat senkronize olduysa onu, olmadıysa sadece telefonu kapsar)
// burada ayrıca "saat mi telefon mu" ayrımı yapılmıyor — bkz. index.ts'teki yorum.
private val PERMISSIONS = setOf(
    HealthPermission.getReadPermission(HeartRateRecord::class),
    HealthPermission.getReadPermission(ActiveCaloriesBurnedRecord::class),
)

class HealthBridgeModule : Module() {
    private val client: HealthConnectClient?
        get() {
            val context = appContext.reactContext ?: return null
            if (HealthConnectClient.getSdkStatus(context) != HealthConnectClient.SDK_AVAILABLE) return null
            return HealthConnectClient.getOrCreate(context)
        }

    override fun definition() = ModuleDefinition {
        Name("HealthBridge")

        AsyncFunction("isAvailable") {
            client != null
        }

        AsyncFunction("requestPermissions") { promise: Promise ->
            val hc = client
            if (hc == null) {
                promise.resolve(false)
                return@AsyncFunction
            }
            val activity = appContext.currentActivity as? ComponentActivity
            if (activity == null) {
                promise.resolve(false)
                return@AsyncFunction
            }
            val alreadyGranted = hc.permissionController.getGrantedPermissions()
            if (alreadyGranted.containsAll(PERMISSIONS)) {
                promise.resolve(true)
                return@AsyncFunction
            }
            // ActivityResultRegistry'e imperatif (Fragment/Activity onCreate'inde değil,
            // çağrı anında) kayıt — üçüncü parti SDK'lardan (bizim durumumuzda bu native
            // modülden) tek seferlik izin isteği başlatmak için androidx'in desteklediği
            // bir kalıp; register() herhangi bir zamanda çağrılabilir, sadece launch()
            // aktivite en az CREATED durumundayken çalışır (burada zaten öyle).
            val contract = PermissionController.createRequestPermissionResultContract()
            var launcher: androidx.activity.result.ActivityResultLauncher<Set<String>>? = null
            launcher = activity.activityResultRegistry.register(
                "health_bridge_permissions_${System.currentTimeMillis()}",
                contract
            ) { granted ->
                promise.resolve(granted.containsAll(PERMISSIONS))
                launcher?.unregister()
            }
            launcher.launch(PERMISSIONS)
        }

        AsyncFunction("getWorkoutSummary") { startIso: String, endIso: String, promise: Promise ->
            val hc = client
            if (hc == null) {
                promise.resolve(emptySummary())
                return@AsyncFunction
            }
            val granted = hc.permissionController.getGrantedPermissions()
            if (!granted.containsAll(PERMISSIONS)) {
                promise.resolve(emptySummary())
                return@AsyncFunction
            }
            try {
                val start = Instant.parse(startIso)
                val end = Instant.parse(endIso)
                val range = TimeRangeFilter.between(start, end)

                val heartRateRecords = hc.readRecords(ReadRecordsRequest(HeartRateRecord::class, range)).records
                val allBpm = heartRateRecords.flatMap { it.samples }.map { it.beatsPerMinute }
                val avgHeartRate = if (allBpm.isNotEmpty()) allBpm.average() else null
                val maxHeartRate = allBpm.maxOrNull()

                val calorieRecords = hc.readRecords(ReadRecordsRequest(ActiveCaloriesBurnedRecord::class, range)).records
                val totalCalories = calorieRecords.sumOf { it.energy.inKilocalories }.takeIf { calorieRecords.isNotEmpty() }

                promise.resolve(
                    mapOf(
                        "avgHeartRate" to avgHeartRate,
                        "maxHeartRate" to maxHeartRate,
                        "activeCalories" to totalCalories,
                    )
                )
            } catch (e: Exception) {
                promise.resolve(emptySummary())
            }
        }
    }

    private fun emptySummary() = mapOf(
        "avgHeartRate" to null,
        "maxHeartRate" to null,
        "activeCalories" to null,
    )
}
