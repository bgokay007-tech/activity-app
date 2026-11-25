import { isHealthAvailable, requestHealthPermissions, getWorkoutSummary } from '../../modules/health-bridge';
import { estimateCalories } from './calorieEstimate';

/**
 * Maç zaman aralığı için telefon/saat Sağlık uygulamasından (Health Connect / HealthKit)
 * kalori + nabız çeker. Veri yoksa MET tahmini. Canlı maç bitişiyle aynı kaynak.
 */
export async function fetchMatchWorkoutStats({
    startAt,
    endAt = new Date(),
    sport,
    matchMode,
    gender,
} = {}) {
    const end = endAt instanceof Date ? endAt : new Date(endAt);
    let start = startAt ? (startAt instanceof Date ? startAt : new Date(startAt)) : null;
    if (!start || Number.isNaN(start.getTime())) {
        // Tarih yoksa son 90 dk penceresi
        start = new Date(end.getTime() - 90 * 60 * 1000);
    }
    if (start.getTime() > end.getTime()) {
        start = new Date(end.getTime() - 90 * 60 * 1000);
    }
    const durationMs = Math.max(0, end.getTime() - start.getTime());

    let workout = null;
    try {
        const available = await isHealthAvailable();
        if (available) {
            const granted = await requestHealthPermissions();
            if (granted) {
                const summary = await getWorkoutSummary(start.toISOString(), end.toISOString());
                if (summary && (summary.avgHeartRate != null || summary.activeCalories != null)) {
                    workout = {
                        avgHeartRate: summary.avgHeartRate ?? null,
                        maxHeartRate: summary.maxHeartRate ?? null,
                        activeCalories: summary.activeCalories ?? null,
                        source: 'synced',
                    };
                }
            }
        }
    } catch { /* native köprü yok / hata → tahmine düş */ }

    if (!workout) {
        const estimated = estimateCalories({
            sport,
            matchMode,
            durationMinutes: durationMs ? durationMs / 60000 : null,
            gender,
        });
        if (estimated != null) {
            workout = {
                avgHeartRate: null,
                maxHeartRate: null,
                activeCalories: estimated,
                source: 'estimated',
            };
        }
    }
    return workout ? { workout } : null;
}

/** Rival maçından start/end Date türet. */
export function rivalMatchTimeWindow(match) {
    if (!match?.matchDate || !match?.matchTime) return { startAt: null, endAt: new Date() };
    const [h, min] = String(match.matchTime).split(':').map(Number);
    const start = new Date(match.matchDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(h)) return { startAt: null, endAt: new Date() };
    start.setHours(h || 0, min || 0, 0, 0);
    const durationMin = match.duration || 90;
    const end = new Date(start.getTime() + durationMin * 60 * 1000);
    // Maç henüz bitmediyse şimdiye kadar
    const now = new Date();
    return { startAt: start, endAt: end > now ? now : end };
}
