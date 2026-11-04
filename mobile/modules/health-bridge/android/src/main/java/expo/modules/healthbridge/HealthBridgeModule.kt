package expo.modules.healthbridge

import androidx.activity.ComponentActivity
import androidx.health.connect.client.HealthConnectClient
import androidx.health.connect.client.PermissionController
import androidx.health.connect.client.permission.HealthPermission
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord
import androidx.health.connect.client.records.HeartRateRecord
import androidx.health.connect.client.request.ReadRecordsRequest
import androidx.health.connect.client.time.TimeRangeFilter
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.functions.Coroutine
import kotlinx.coroutines.suspendCancellableCoroutine
import java.time.Instant
import kotlin.coroutines.resume

// Maç bitince [matchStartedAt, matchEndedAt) aralığında Health Connect'ten kalp atışı ve
// aktif kaloriyi okur. Health Connect saat + telefon verisini kendi içinde otomatik
// birleştirdiği için burada ayrıca "saat mi telefon mu" ayrımı yapılmıyor.
// connect-client 1.1+ API'leri suspend — AsyncFunction Coroutine gövdesinde çağrılmalı
// (Promise callback içinde çağırırsak compileReleaseKotlin düşer; 1.0.4 EAS böyle kırıldı).
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

        AsyncFunction("requestPermissions") Coroutine {
            val hc = client ?: return@Coroutine false
            val activity = appContext.currentActivity as? ComponentActivity ?: return@Coroutine false
            val alreadyGranted = hc.permissionController.getGrantedPermissions()
            if (alreadyGranted.containsAll(PERMISSIONS)) return@Coroutine true

            // ActivityResultRegistry'e imperatif kayıt — Fragment/Activity onCreate'inde değil,
            // çağrı anında. register() herhangi bir zamanda; launch() aktivite CREATED iken.
            suspendCancellableCoroutine { cont ->
                val contract = PermissionController.createRequestPermissionResultContract()
                var launcher: androidx.activity.result.ActivityResultLauncher<Set<String>>? = null
                launcher = activity.activityResultRegistry.register(
                    "health_bridge_permissions_${System.currentTimeMillis()}",
                    contract
                ) { granted ->
                    if (cont.isActive) cont.resume(granted.containsAll(PERMISSIONS))
                    launcher?.unregister()
                }
                cont.invokeOnCancellation { launcher?.unregister() }
                launcher.launch(PERMISSIONS)
            }
        }

        AsyncFunction("getWorkoutSummary") Coroutine { startIso: String, endIso: String ->
            val hc = client ?: return@Coroutine emptySummary()
            val granted = hc.permissionController.getGrantedPermissions()
            if (!granted.containsAll(PERMISSIONS)) return@Coroutine emptySummary()
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

                mapOf(
                    "avgHeartRate" to avgHeartRate,
                    "maxHeartRate" to maxHeartRate,
                    "activeCalories" to totalCalories,
                )
            } catch (e: Exception) {
                emptySummary()
            }
        }
    }

    private fun emptySummary() = mapOf(
        "avgHeartRate" to null,
        "maxHeartRate" to null,
        "activeCalories" to null,
    )
}
