/** Sporcu Kartı metrik kataloğu — mobil ile aynı anahtarlar. */
export const ATHLETE_METRIC_CATALOG = {
    BASIC: [
        { key: 'heightCm', unit: 'cm' },
        { key: 'weightKg', unit: 'kg' },
    ],
    COMPOSITION: [
        { key: 'bodyFatPct', unit: '%' },
        { key: 'muscleMassKg', unit: 'kg' },
        { key: 'leanMassKg', unit: 'kg' },
        { key: 'bodyWaterPct', unit: '%' },
        { key: 'armMuscleLKg', unit: 'kg' },
        { key: 'armMuscleRKg', unit: 'kg' },
        { key: 'legMuscleLKg', unit: 'kg' },
        { key: 'legMuscleRKg', unit: 'kg' },
    ],
    ANTHRO: [
        { key: 'wingspanCm', unit: 'cm' },
        { key: 'sittingHeightCm', unit: 'cm' },
        { key: 'legLengthCm', unit: 'cm' },
        { key: 'neckCm', unit: 'cm' },
        { key: 'chestCm', unit: 'cm' },
        { key: 'waistCm', unit: 'cm' },
        { key: 'hipCm', unit: 'cm' },
        { key: 'bicepsCm', unit: 'cm' },
        { key: 'thighCm', unit: 'cm' },
        { key: 'calfCm', unit: 'cm' },
        { key: 'elbowDiameterCm', unit: 'cm' },
        { key: 'kneeDiameterCm', unit: 'cm' },
    ],
    BIOMOTOR: [
        { key: 'sprint10mSec', unit: 's' },
        { key: 'sprint20mSec', unit: 's' },
        { key: 'sprint30mSec', unit: 's' },
        { key: 'cmjCm', unit: 'cm' },
        { key: 'standingLongJumpCm', unit: 'cm' },
        { key: 'illinoisSec', unit: 's' },
        { key: 'tTestSec', unit: 's' },
        { key: 'proAgilitySec', unit: 's' },
        { key: 'handgripKg', unit: 'kg' },
        { key: 'sitReachCm', unit: 'cm' },
    ],
    PHYSIO: [
        { key: 'vo2max', unit: 'ml/kg/min' },
        { key: 'restingHr', unit: 'bpm' },
        { key: 'hrvMs', unit: 'ms' },
        { key: 'fmsScore', unit: 'pts' },
    ],
    DAILY: [
        { key: 'steps', unit: 'steps' },
        { key: 'caloriesBurned', unit: 'kcal' },
    ],
};

const KEY_TO_META = (() => {
    const map = {};
    for (const [category, list] of Object.entries(ATHLETE_METRIC_CATALOG)) {
        for (const m of list) map[m.key] = { ...m, category };
    }
    return map;
})();

export function athleteMetricMeta(key) {
    return KEY_TO_META[key] || null;
}

export function computeBmi(heightCm, weightKg) {
    const h = Number(heightCm);
    const w = Number(weightKg);
    if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return null;
    const m = h / 100;
    return Math.round((w / (m * m)) * 10) / 10;
}
