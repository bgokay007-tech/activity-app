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
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.suspendCancellableCoroutine
import java.time.Instant
import kotlin.coroutines.resume

// Maç bitince [matchStartedAt, matchEndedAt) aralığında Health Connect'ten kalp atışı ve
// aktif kaloriyi okur. connect-client 1.1+ API'leri suspend — Promise callback içinde
// doğrudan çağrılamaz (1.0.4 EAS compileReleaseKotlin düştü). runBlocking ile sarıyoruz;
// no-arg AsyncFunction + Coroutine infix overload ambiguity veriyordu.
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
            try {
                val alreadyGranted = runBlocking { hc.permissionController.getGrantedPermissions() }
                if (alreadyGranted.containsAll(PERMISSIONS)) {
                    promise.resolve(true)
                    return@AsyncFunction
                }
                // ActivityResultRegistry'e imperatif kayıt — Fragment/Activity onCreate'inde değil,
                // çağrı anında. register() herhangi bir zamanda; launch() aktivite CREATED iken.
                runBlocking {
                    suspendCancellableCoroutine<Unit> { cont ->
                        val contract = PermissionController.createRequestPermissionResultContract()
                        var launcher: androidx.activity.result.ActivityResultLauncher<Set<String>>? = null
                        launcher = activity.activityResultRegistry.register(
                            "health_bridge_permissions_${System.currentTimeMillis()}",
                            contract
                        ) { granted ->
                            promise.resolve(granted.containsAll(PERMISSIONS))
                            launcher?.unregister()
                            if (cont.isActive) cont.resume(Unit)
                        }
                        cont.invokeOnCancellation { launcher?.unregister() }
                        launcher.launch(PERMISSIONS)
                    }
                }
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }

        AsyncFunction("getWorkoutSummary") { startIso: String, endIso: String, promise: Promise ->
            val hc = client
            if (hc == null) {
                promise.resolve(emptySummary())
                return@AsyncFunction
            }
            try {
                val result = runBlocking {
                    val granted = hc.permissionController.getGrantedPermissions()
                    if (!granted.containsAll(PERMISSIONS)) return@runBlocking emptySummary()

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
                }
                promise.resolve(result)
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
