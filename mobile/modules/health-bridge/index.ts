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

const nativeModule = requireNativeModule<HealthBridgeNativeModule>('HealthBridge');

// Health Connect (Android) kurulu mu / HealthKit (iOS) bu cihazda kullanılabilir mi.
export function isHealthAvailable(): Promise<boolean> {
    return nativeModule.isAvailable();
}

// Kalp atışı + aktif kalori okuma izni ister — kullanıcı reddederse false döner,
// çağıran taraf tahmine düşer.
export function requestHealthPermissions(): Promise<boolean> {
    return nativeModule.requestPermissions();
}

// [startIso, endIso) aralığında ortalama/maksimum nabız ve toplam aktif kaloriyi döner —
// veri yoksa ilgili alanlar null kalır (tamamı null ise çağıran taraf tahmine düşer).
export function getWorkoutSummary(startIso: string, endIso: string): Promise<WorkoutSummary> {
    return nativeModule.getWorkoutSummary(startIso, endIso);
}
