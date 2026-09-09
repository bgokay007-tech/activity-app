// Mobildeki mobile/src/utils/tournamentFormats.js ile aynı sözleşme.
// preset → engine type '1'..'7'; formatConfig JSON Tournament.formatConfig'e yazılır.

export const ACTIVE_ENGINE_TYPES = ['1', '2', '3', '4', '5', '6', '7'];

/** Sabit takım id'leri maç tarafı (p1Id/p2Id) — type 2/4 sabit çift; 7 Americano tur takımı. */
export const TEAM_ENGINE_TYPES = ['2', '4', '7'];

export function isTeamEngineType(type) {
    return TEAM_ENGINE_TYPES.includes(String(type));
}

export const TOURNAMENT_PRESETS = [
    { id: 'singles_elo_playoff', engineType: '1', entry: 'SINGLES', intensity: 'COMPETITIVE', phase1: 'DYNAMIC_ELO', phase2: 'SINGLE_ELIM', seeding: 'ELO', accent: '#22c55e' },
    { id: 'doubles_rr_playoff', engineType: '2', entry: 'DOUBLES', intensity: 'COMPETITIVE', phase1: 'ROUND_ROBIN', phase2: 'SINGLE_ELIM', seeding: 'ELO', accent: '#38bdf8' },
    { id: 'singles_practice', engineType: '3', entry: 'SINGLES', intensity: 'PRACTICE', phase1: 'RANDOM_ROUNDS', phase2: 'SINGLE_ELIM', seeding: 'RANDOM', accent: '#a78bfa' },
    { id: 'doubles_practice', engineType: '4', entry: 'DOUBLES', intensity: 'PRACTICE', phase1: 'RANDOM_ROUNDS', phase2: 'SINGLE_ELIM', seeding: 'RANDOM', accent: '#f472b6' },
    { id: 'swiss', engineType: '5', entry: 'SINGLES', intensity: 'COMPETITIVE', phase1: 'SWISS', phase2: 'NONE', seeding: 'ELO', accent: '#fbbf24' },
    { id: 'double_elim', engineType: '6', entry: 'SINGLES', intensity: 'COMPETITIVE', phase1: 'NONE', phase2: 'DOUBLE_ELIM', seeding: 'SEEDED', accent: '#fb7185' },
    { id: 'americano', engineType: '7', entry: 'DOUBLES', intensity: 'PRACTICE', phase1: 'AMERICANO', phase2: 'NONE', seeding: 'RANDOM', accent: '#2dd4bf' },
];

export function getPresetById(id) {
    return TOURNAMENT_PRESETS.find(p => p.id === id) || null;
}

export function getPresetByEngineType(type) {
    return TOURNAMENT_PRESETS.find(p => p.engineType === String(type)) || null;
}

export function buildFormatConfig(preset, extras = {}) {
    if (!preset?.engineType) return null;
    return {
        presetId: preset.id,
        entry: preset.entry,
        intensity: preset.intensity,
        phase1: { kind: preset.phase1 },
        phase2: { kind: preset.phase2 },
        seeding: extras.matchmakingType || preset.seeding,
        engineType: preset.engineType,
        version: 1,
    };
}

/** İstemciden gelen formatConfig'i doğrula; type ile çelişirse type kazanır. */
export function resolveFormatOnCreate({ type, formatConfig, matchmakingType }) {
    let engineType = type && ACTIVE_ENGINE_TYPES.includes(String(type)) ? String(type) : null;
    let preset = null;

    if (formatConfig && typeof formatConfig === 'object') {
        if (formatConfig.presetId) preset = getPresetById(formatConfig.presetId);
        if (!preset && formatConfig.engineType) preset = getPresetByEngineType(formatConfig.engineType);
    }
    if (!preset && engineType) preset = getPresetByEngineType(engineType);
    if (!preset) preset = getPresetByEngineType('1');

    engineType = preset.engineType;
    const cleaned = buildFormatConfig(preset, {
        matchmakingType: matchmakingType || formatConfig?.seeding || preset.seeding,
    });
    return { type: engineType, formatConfig: cleaned };
}
