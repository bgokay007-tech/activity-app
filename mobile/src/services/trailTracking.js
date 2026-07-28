import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Rota kaydı — arka plan GPS takibi. TaskManager görevleri React state'inden
// tamamen ayrı, headless bir JS bağlamında çalışır; bu yüzden köprü olarak
// AsyncStorage kullanılıyor: görev her konum güncellemesinde noktayı buraya
// ekliyor, ekran açıkken (RecordTrailScreen) bu diziyi periyodik okuyup
// haritayı güncelliyor.
const TASK_NAME = 'TRAIL_RECORDING_TASK';
const STORAGE_KEY = 'trail_recording_points';

TaskManager.defineTask(TASK_NAME, async ({ data, error }) => {
    if (error || !data) return;
    const { locations } = data;
    if (!Array.isArray(locations) || locations.length === 0) return;
    try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        const points = raw ? JSON.parse(raw) : [];
        for (const loc of locations) {
            points.push({
                lat: loc.coords.latitude,
                lng: loc.coords.longitude,
                ele: loc.coords.altitude ?? undefined,
                t: loc.timestamp,
            });
        }
        await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(points));
    } catch { /* sessizce yut — bir sonraki güncellemede tekrar dener */ }
});

export async function requestTrailLocationPermissions() {
    const fg = await Location.requestForegroundPermissionsAsync();
    if (!fg.granted) return { granted: false, background: false };
    const bg = await Location.requestBackgroundPermissionsAsync();
    return { granted: true, background: bg.granted };
}

export async function startRecording() {
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify([]));
    const already = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
    if (already) await Location.stopLocationUpdatesAsync(TASK_NAME).catch(() => {});
    await Location.startLocationUpdatesAsync(TASK_NAME, {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 5000,
        distanceInterval: 10,
        showsBackgroundLocationIndicator: true,
        foregroundService: {
            notificationTitle: 'Rota kaydediliyor',
            notificationBody: 'Doğa yürüyüşü güzergahın arka planda kaydediliyor.',
        },
    });
}

export async function stopRecording() {
    const started = await Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
    if (started) await Location.stopLocationUpdatesAsync(TASK_NAME);
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    const points = raw ? JSON.parse(raw) : [];
    await AsyncStorage.removeItem(STORAGE_KEY);
    return points;
}

export async function getLivePoints() {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
}

export async function isRecording() {
    return Location.hasStartedLocationUpdatesAsync(TASK_NAME).catch(() => false);
}

// Basit mesafe hesaplama (Haversine, km) — canlı ekranda ve rota kaydında kullanılır.
export function pathDistanceKm(points) {
    if (!Array.isArray(points) || points.length < 2) return 0;
    const toRad = (v) => (v * Math.PI) / 180;
    let total = 0;
    for (let i = 1; i < points.length; i++) {
        const a = points[i - 1], b = points[i];
        const R = 6371;
        const dLat = toRad(b.lat - a.lat);
        const dLng = toRad(b.lng - a.lng);
        const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
        total += R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
    }
    return total;
}
