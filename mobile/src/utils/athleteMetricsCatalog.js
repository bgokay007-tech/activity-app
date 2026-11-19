/** Sporcu Kartı metrik kataloğu — backend ile aynı key'ler. */
export const ATHLETE_CATEGORIES = [
    'BASIC',
    'COMPOSITION',
    'ANTHRO',
    'BIOMOTOR',
    'PHYSIO',
    'DAILY',
];

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

export function computeBmi(heightCm, weightKg) {
    const h = Number(heightCm);
    const w = Number(weightKg);
    if (!Number.isFinite(h) || !Number.isFinite(w) || h <= 0 || w <= 0) return null;
    const m = h / 100;
    return Math.round((w / (m * m)) * 10) / 10;
}

export function formatMetricValue(value, unit) {
    if (value == null || value === '') return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const shown = Number.isInteger(n) ? String(n) : String(Math.round(n * 100) / 100);
    return unit ? `${shown} ${unit}` : shown;
}
