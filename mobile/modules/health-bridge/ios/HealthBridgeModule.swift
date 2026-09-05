import ExpoModulesCore
import HealthKit

// Maç bitince [matchStartedAt, matchEndedAt) aralığında Apple Health'ten kalp atışı ve
// aktif kaloriyi okur. Apple Watch takılıysa örnekler otomatik olarak Health'e senkronize
// olduğu için (ayrı bir Watch köprüsüne gerek kalmadan) burada tek bir sorgu hem saat hem
// telefon kaynağını şeffafça kapsar — bkz. index.ts'teki aynı yorum.
private let heartRateType = HKQuantityType(.heartRate)
private let activeEnergyType = HKQuantityType(.activeEnergyBurned)
private let readTypes: Set<HKObjectType> = [heartRateType, activeEnergyType]

public class HealthBridgeModule: Module {
    private let healthStore = HKHealthStore()

    public func definition() -> ModuleDefinition {
        Name("HealthBridge")

        AsyncFunction("isAvailable") { () -> Bool in
            HKHealthStore.isHealthDataAvailable()
        }

        AsyncFunction("requestPermissions") { () async -> Bool in
            guard HKHealthStore.isHealthDataAvailable() else { return false }
            do {
                try await self.healthStore.requestAuthorization(toShare: [], read: readTypes)
                return true
            } catch {
                return false
            }
        }

        AsyncFunction("getWorkoutSummary") { (startIso: String, endIso: String) async -> [String: Double?] in
            let empty: [String: Double?] = ["avgHeartRate": nil, "maxHeartRate": nil, "activeCalories": nil]
            guard HKHealthStore.isHealthDataAvailable() else { return empty }
            let formatter = ISO8601DateFormatter()
            guard let start = formatter.date(from: startIso), let end = formatter.date(from: endIso) else { return empty }
            let predicate = HKQuery.predicateForSamples(withStart: start, end: end, options: .strictStartDate)

            async let heartStats = self.queryStatistics(type: heartRateType, predicate: predicate, options: [.discreteAverage, .discreteMax])
            async let calorieStats = self.queryStatistics(type: activeEnergyType, predicate: predicate, options: [.cumulativeSum])
            let (heart, calories) = await (heartStats, calorieStats)

            let bpmUnit = HKUnit.count().unitDivided(by: .minute())
            let kcalUnit = HKUnit.kilocalorie()
            return [
                "avgHeartRate": heart?.averageQuantity()?.doubleValue(for: bpmUnit),
                "maxHeartRate": heart?.maximumQuantity()?.doubleValue(for: bpmUnit),
                "activeCalories": calories?.sumQuantity()?.doubleValue(for: kcalUnit),
            ]
        }
    }

    private func queryStatistics(type: HKQuantityType, predicate: NSPredicate, options: HKStatisticsOptions) async -> HKStatistics? {
        await withCheckedContinuation { continuation in
            let query = HKStatisticsQuery(quantityType: type, quantitySamplePredicate: predicate, options: options) { _, result, _ in
                continuation.resume(returning: result)
            }
            healthStore.execute(query)
        }
    }
}
