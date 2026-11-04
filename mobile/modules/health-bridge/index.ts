import { requireNativeModule } from 'expo-modules-core';

// Maç bitince (matchStartedAt → şimdi) o zaman aralığında Health Connect (Android) /
// HealthKit (iOS) üzerinden kalori/nabız verisi okur. İkisi de saat + telefon verisini
// otomatik birleştirdiği için (saat senkronize olduysa onu, olmadıysa sadece telefonu
// kapsar) ayrıca "saat mi telefon mu" ayrımı yapılmıyor — tek bir "synced" kaynağı var,
// hiç veri yoksa çağıran taraf (bkz. mobile/src/utils/calorieEstimate.js) MET tabanlı
// tahmine düşer.
export type WorkoutSummary = {
    avgHeartRate: number | null;
    maxHeartRate: number | null;
    activeCalories: number | null;
};

type HealthBridgeNativeModule = {
    isAvailable(): Promise<boolean>;
    requestPermissions(): Promise<boolean>;
    getWorkoutSummary(startIso: string, endIso: string): Promise<WorkoutSummary>;
};

// Native modül APK'da yoksa / link bozuksa requireNativeModule SENKRON fırlatır —
// SubCategoryScreen açılışta bu dosyayı import ettiği için uygulama hiç açılmazdı.
// wear-bridge ile aynı: yoksa sessizce null, çağıran taraf MET tahmine düşer.
let nativeModule: HealthBridgeNativeModule | null = null;
try {
    nativeModule = requireNativeModule<HealthBridgeNativeModule>('HealthBridge');
} catch {
    nativeModule = null;
}

const emptySummary = (): WorkoutSummary => ({
    avgHeartRate: null,
    maxHeartRate: null,
    activeCalories: null,
});

export function isHealthAvailable(): Promise<boolean> {
    if (!nativeModule) return Promise.resolve(false);
    return nativeModule.isAvailable().catch(() => false);
}

export function requestHealthPermissions(): Promise<boolean> {
    if (!nativeModule) return Promise.resolve(false);
    return nativeModule.requestPermissions().catch(() => false);
}

export function getWorkoutSummary(startIso: string, endIso: string): Promise<WorkoutSummary> {
    if (!nativeModule) return Promise.resolve(emptySummary());
    return nativeModule.getWorkoutSummary(startIso, endIso).catch(() => emptySummary());
}
