// Turnuva formatı: kullanıcıya anlamlı paketler; motor tarafında type '1'..'7'.
// formatConfig JSON olarak Tournament.formatConfig'e yazılır.

export const ACTIVE_ENGINE_TYPES = ['1', '2', '3', '4', '5', '6', '7'];

/** Sabit/tur takım id'leri maç tarafı — 2/4 sabit çift, 7 Americano tur takımı. */
export const TEAM_ENGINE_TYPES = ['2', '4', '7'];

export function isTeamEngineType(type) {
    return TEAM_ENGINE_TYPES.includes(String(type));
}

/** @typedef {{
 *   id: string,
 *   engineType: string,
 *   entry: 'SINGLES'|'DOUBLES',
 *   intensity: 'COMPETITIVE'|'PRACTICE',
 *   phase1: string,
 *   phase2: string,
 *   seeding: string,
 *   accent: string,
 *   comingSoon?: boolean,
 * }} TournamentPreset */

/** @type {TournamentPreset[]} */
export const TOURNAMENT_PRESETS = [
    {
        id: 'singles_elo_playoff',
        engineType: '1',
        entry: 'SINGLES',
        intensity: 'COMPETITIVE',
        phase1: 'DYNAMIC_ELO',
        phase2: 'SINGLE_ELIM',
        seeding: 'ELO',
        accent: '#22c55e',
    },
    {
        id: 'doubles_rr_playoff',
        engineType: '2',
        entry: 'DOUBLES',
        intensity: 'COMPETITIVE',
        phase1: 'ROUND_ROBIN',
        phase2: 'SINGLE_ELIM',
        seeding: 'ELO',
        accent: '#38bdf8',
    },
    {
        id: 'singles_practice',
        engineType: '3',
        entry: 'SINGLES',
        intensity: 'PRACTICE',
        phase1: 'RANDOM_ROUNDS',
        phase2: 'SINGLE_ELIM',
        seeding: 'RANDOM',
        accent: '#a78bfa',
    },
    {
        id: 'doubles_practice',
        engineType: '4',
        entry: 'DOUBLES',
        intensity: 'PRACTICE',
        phase1: 'RANDOM_ROUNDS',
        phase2: 'SINGLE_ELIM',
        seeding: 'RANDOM',
        accent: '#f472b6',
    },
    {
        id: 'swiss',
        engineType: '5',
        entry: 'SINGLES',
        intensity: 'COMPETITIVE',
        phase1: 'SWISS',
        phase2: 'NONE',
        seeding: 'ELO',
        accent: '#fbbf24',
    },
    {
        id: 'double_elim',
        engineType: '6',
        entry: 'SINGLES',
        intensity: 'COMPETITIVE',
        phase1: 'NONE',
        phase2: 'DOUBLE_ELIM',
        seeding: 'SEEDED',
        accent: '#fb7185',
    },
    {
        id: 'americano',
        engineType: '7',
        entry: 'DOUBLES',
        intensity: 'PRACTICE',
        phase1: 'AMERICANO',
        phase2: 'NONE',
        seeding: 'RANDOM',
        accent: '#2dd4bf',
    },
];

export function getPresetById(id) {
    return TOURNAMENT_PRESETS.find(p => p.id === id) || null;
}

export function getPresetByEngineType(type) {
    return TOURNAMENT_PRESETS.find(p => !p.comingSoon && p.engineType === String(type)) || null;
}

export function activePresets() {
    return TOURNAMENT_PRESETS.filter(p => !p.comingSoon);
}

export function buildFormatConfig(preset, extras = {}) {
    if (!preset || preset.comingSoon || !preset.engineType) return null;
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

/** Liste/detay etiketi — formatConfig varsa onu, yoksa eski type etiketini kullan. */
export function tournFormatLabel(tourn, t) {
    const presetId = tourn?.formatConfig?.presetId;
    if (presetId) {
        const key = `tournPreset_${presetId}`;
        if (t[key]) return t[key];
    }
    const type = tourn?.type != null ? String(tourn.type) : '';
    const legacy = {
        '1': t.tournType1, '2': t.tournType2, '3': t.tournType3, '4': t.tournType4,
        '5': t.tournPreset_swiss || t.tournType5,
        '6': t.tournPreset_double_elim || t.tournType6,
        '7': t.tournPreset_americano || t.tournType7,
    };
    return legacy[type] || type || '—';
}
