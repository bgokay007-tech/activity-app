import { getSubCategoryLabel } from './subCategoryLabels';
import { formatSetScore } from './racketScore';
import { BASE_URL } from '../services/api';

const SHARE_HOST = BASE_URL.replace(/\/api\/?$/, '');

const SUB_EMOJI = {
    football: '⚽', basketball: '🏀', tennis: '🎾', padel: '🏓', volleyball: '🏐',
    badminton: '🏸', table_tennis: '🏓', pickleball: '🥒', running: '🏃', climbing: '🧗',
};

/** Navbar gökkuşağı döngüsünün sabit harf renkleri (animasyon yerine snapshot). */
export const BRAND_LETTER_COLORS = [
    '#FF0000', '#FF6600', '#FFD700', '#00CC00',
    '#00CED1', '#0099FF', '#7B00FF', '#FFFFFF',
];

function nameOf(p) {
    if (!p) return '';
    return p.fullName || p.username || p.manualName || '';
}

function ratingOf(p, sub) {
    if (!p) return null;
    if (p.skillRating != null && Number.isFinite(Number(p.skillRating))) {
        return Number(p.skillRating);
    }
    const interests = Array.isArray(p.interests) ? p.interests : [];
    const hit = interests.find(i => i?.subCategory === sub) || interests[0];
    if (hit?.skillRating != null && Number.isFinite(Number(hit.skillRating))) {
        return Number(hit.skillRating);
    }
    return null;
}

function formatElo(v) {
    if (v == null || !Number.isFinite(v)) return '';
    return `${v.toFixed(2)} ★`;
}

function sidePlayers(match, side) {
    if (side === 'sender') {
        const team = Array.isArray(match.senderTeam) ? match.senderTeam : [];
        return [match.sender, ...team].filter(Boolean);
    }
    const parts = Array.isArray(match.participants) ? match.participants : [];
    if (match.receiver) {
        return [match.receiver, ...parts.filter(p => p?.id !== match.receiver?.id)].filter(Boolean);
    }
    return parts.filter(Boolean);
}

function sideNames(players) {
    return players.map(nameOf).filter(Boolean);
}

function sideEloLabel(players, sub) {
    const ratings = players.map(p => ratingOf(p, sub)).filter(v => v != null);
    if (!ratings.length) return '';
    if (ratings.length === 1) return formatElo(ratings[0]);
    const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
    return formatElo(avg);
}

function setLine(set) {
    if (!set) return '';
    if (set.p1 != null || set.p2 != null) {
        return formatSetScore(set, 'p1', 'p2', 'tb1', 'tb2');
    }
    return formatSetScore(set, 'sender', 'opponent', 'tbSender', 'tbOpponent');
}

function surfaceLabel(match, t) {
    const sf = match?.surface;
    if (!sf) return '';
    const key = `surface${String(sf).toUpperCase()}`;
    return t?.[key] || String(sf);
}

function formatDurationMs(ms, t) {
    if (ms == null || !Number.isFinite(ms) || ms <= 0) return '';
    const minutes = Math.round(ms / 60000);
    if (minutes < 60) return t?.sc_0307 ? t.sc_0307(minutes) : `${minutes}m`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return t?.sc_0308 ? t.sc_0308(h, m) : `${h}h ${m}m`;
}

function formatDurationFromStats(stats, listingMin, t) {
    if (stats?.durationMs) return formatDurationMs(stats.durationMs, t);
    if (listingMin != null && listingMin > 0) {
        const minutes = Math.round(listingMin);
        if (minutes < 60) return t?.sc_0307 ? t.sc_0307(minutes) : `${minutes}m`;
        return t?.sc_0308 ? t.sc_0308(Math.floor(minutes / 60), minutes % 60) : `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
    }
    return '';
}

/** Canlı takip stats → paylaşım kartı panelleri (saat/sağlık verisi dahil). */
function buildShareStats(match, t) {
    const raw = match?.score?.stats;
    if (!raw || typeof raw !== 'object') return null;

    // A = canlı takibi başlatan; perspective sender ise A=ilan sahibi
    const startedByFounder = (raw.perspective || 'sender') === 'sender';
    const myKey = startedByFounder ? 'A' : 'B';
    const theirKey = startedByFounder ? 'B' : 'A';

    const total = raw.total;
    const wonMe = raw.wonBySide?.[myKey];
    const wonThem = raw.wonBySide?.[theirKey];
    const winRate = total > 0 && wonMe != null ? Math.round((wonMe / total) * 100) : null;

    const panels = [];
    if (total != null) {
        panels.push({
            title: t?.statOverview || 'Overview',
            accent: '#4ade80',
            tiles: [
                { label: t?.statTotalPoints || 'Total points', value: String(total) },
                { label: t?.statPointsWon || 'Points won', value: `${wonMe ?? 0}-${wonThem ?? 0}` },
                winRate != null ? { label: t?.statWinRate || 'Win rate', value: `${winRate}%` } : null,
            ].filter(Boolean),
        });
    }

    if (raw.serve && raw.breakPoints) {
        panels.push({
            title: t?.statServeReturn || 'Serve & Return',
            accent: '#22c55e',
            tiles: [
                {
                    label: t?.statServiceGamesWon || 'Service games',
                    value: `${raw.serve[`serviceGamesWon${myKey}`] ?? 0}/${raw.serve[`serviceGamesTotal${myKey}`] ?? 0}`,
                },
                {
                    label: t?.statReturnGamesWon || 'Return games',
                    value: `${raw.serve[`returnGamesWon${myKey}`] ?? 0}/${raw.serve[`returnGamesTotal${myKey}`] ?? 0}`,
                },
            ],
        });
        panels.push({
            title: t?.statBreakPoints || 'Break points',
            accent: '#f97316',
            tiles: [
                { label: t?.statBreakPointsFaced || 'Faced', value: String(raw.breakPoints[`faced${myKey}`] ?? 0) },
                {
                    label: t?.statBreakPointsSaved || 'Saved',
                    value: `${raw.breakPoints[`saved${myKey}`] ?? 0}/${raw.breakPoints[`faced${myKey}`] ?? 0}`,
                },
                { label: t?.statBreakPointOpportunities || 'Opportunities', value: String(raw.breakPoints[`opportunities${myKey}`] ?? 0) },
                {
                    label: t?.statBreakPointsConverted || 'Converted',
                    value: `${raw.breakPoints[`convertedBy${myKey}`] ?? 0}/${raw.breakPoints[`opportunities${myKey}`] ?? 0}`,
                },
            ],
        });
    } else if (raw.serve) {
        panels.push({
            title: t?.statServeReturn || 'Serve & Return',
            accent: '#22c55e',
            tiles: [
                {
                    label: t?.statServicePointsWon || 'Service points',
                    value: `${raw.serve[`servicePointsWon${myKey}`] ?? 0}/${raw.serve[`servicePointsTotal${myKey}`] ?? 0}`,
                },
                {
                    label: t?.statServicePointsWon || 'Opp. service',
                    value: `${raw.serve[`servicePointsWon${theirKey}`] ?? 0}/${raw.serve[`servicePointsTotal${theirKey}`] ?? 0}`,
                },
            ],
        });
    }

    const durationLabel = formatDurationFromStats(raw, match?.duration, t);
    if (raw.flow || durationLabel) {
        const tiles = [];
        if (raw.flow?.recordedGames != null) tiles.push({ label: t?.statRecordedGames || 'Games', value: String(raw.flow.recordedGames) });
        if (raw.flow?.recordedSets != null) tiles.push({ label: t?.statRecordedSets || 'Sets', value: String(raw.flow.recordedSets) });
        if (raw.flow?.longestGamePoints != null) tiles.push({ label: t?.statLongestGame || 'Longest game', value: String(raw.flow.longestGamePoints) });
        if (raw.flow?.longestSetPoints != null) tiles.push({ label: t?.statLongestSet || 'Longest set', value: String(raw.flow.longestSetPoints) });
        if (raw.flow?.avgPointsPerGame != null) tiles.push({ label: t?.statAvgPointsPerGame || 'Avg pts/game', value: String(raw.flow.avgPointsPerGame) });
        if (raw.flow?.biggestLead != null) tiles.push({ label: t?.statBiggestLead || 'Biggest lead', value: String(raw.flow.biggestLead) });
        if (durationLabel) tiles.push({ label: t?.statMatchDuration || 'Duration', value: durationLabel });
        if (tiles.length) {
            panels.push({
                title: t?.statMatchFlow || 'Match flow',
                accent: '#38bdf8',
                tiles,
            });
        }
    }

    if (raw.quarters?.length) {
        panels.push({
            title: t?.statQuarterScores || 'Quarters',
            accent: '#38bdf8',
            tiles: raw.quarters.map((q, i) => ({
                label: `Q${i + 1}`,
                value: startedByFounder ? `${q[0]}-${q[1]}` : `${q[1]}-${q[0]}`,
            })),
        });
    }

    const workout = raw.workout;
    if (workout && (workout.avgHeartRate != null || workout.maxHeartRate != null || workout.activeCalories != null)) {
        const tiles = [];
        if (workout.avgHeartRate != null) {
            tiles.push({ label: t?.statAvgHeartRate || 'Avg HR', value: `${Math.round(workout.avgHeartRate)} bpm` });
        }
        if (workout.maxHeartRate != null) {
            tiles.push({ label: t?.statMaxHeartRate || 'Max HR', value: `${Math.round(workout.maxHeartRate)} bpm` });
        }
        if (workout.activeCalories != null) {
            const approx = workout.source === 'estimated' ? ' ≈' : '';
            tiles.push({
                label: t?.statCalories || 'Active energy',
                value: `${Math.round(workout.activeCalories)} kcal${approx}`,
            });
        }
        panels.push({
            title: t?.statWorkout || 'Workout',
            accent: '#ef4444',
            tiles,
        });
    }

    const highlights = [];
    if (raw.serve && (raw.serve[`returnGamesWon${myKey}`] || 0) >= 3) {
        highlights.push(t?.shareMatchHighlightReturn || 'Return pressure');
    }
    if ((raw.flow?.longestGamePoints || 0) >= 12) {
        highlights.push(t?.shareMatchHighlightMarathon || 'Marathon game');
    }
    if ((raw.durationMs || 0) >= 90 * 60000 || (match?.duration || 0) >= 90) {
        highlights.push(t?.shareMatchHighlightLong || 'Long battle');
    }
    if (workout?.avgHeartRate != null && workout.avgHeartRate >= 140) {
        highlights.push(t?.shareMatchHighlightHeart || 'High intensity');
    }

    let workoutSource = '';
    if (workout?.source === 'synced') workoutSource = t?.statWorkoutSourceSynced || 'WATCH + PHONE';
    else if (workout?.source === 'estimated') workoutSource = t?.statWorkoutSourceEstimated || 'ESTIMATED';
    else if (workout?.source === 'watch') workoutSource = t?.statWorkoutSourceWatch || 'WATCH';
    else if (workout?.source === 'phone') workoutSource = t?.statWorkoutSourcePhone || 'PHONE';

    return {
        panels: panels.slice(0, 5),
        highlights: highlights.slice(0, 3),
        workoutSource,
        durationLabel,
        hasWorkout: !!(workout && (workout.avgHeartRate != null || workout.activeCalories != null)),
    };
}

/** Tenis/padel/badminton/masa tenisi/pickleball — tekli/çiftler ELO ayrı. */
export const UTR_SHARE_SUBS = new Set(['tennis', 'padel', 'badminton', 'table_tennis', 'pickleball']);
const LEADERBOARD_SHARE_SUBS = new Set(['tennis', 'padel', 'pickleball', 'badminton', 'table_tennis', 'volleyball']);

function fmtRank(n) {
    if (n == null || !Number.isFinite(Number(n)) || Number(n) <= 0) return '—';
    return `#${Number(n)}`;
}

/**
 * Paylaşan kişinin bu daldaki digimon özeti — skor kartında ön/arka iki yüz yan yana.
 * wins/losses UserInterest'ten; tournamentWins achievements (placement===1) sayacı.
 * ranks: { local, national, international } — leaderboard myRank.
 */
export function buildSharerDigimonPayload(user, subCategory, tournamentWins = 0, t, lang = 'tr', ranks = null) {
    if (!user?.id || !subCategory) return null;
    const interests = Array.isArray(user.interests) ? user.interests : [];
    const interest = interests.find(i => i?.subCategory === subCategory) || null;
    const wins = Number(interest?.wins) || 0;
    const losses = Number(interest?.losses) || 0;
    const totalMatches = wins + losses;
    const titles = Math.max(0, Number(tournamentWins) || 0);

    const isUtr = UTR_SHARE_SUBS.has(subCategory);
    const singlesRaw = interest?.singlesDisplayRating ?? interest?.singlesRating;
    const doublesRaw = interest?.doublesDisplayRating ?? interest?.doublesRating;
    const singlesElo = (singlesRaw != null && Number.isFinite(Number(singlesRaw)))
        ? formatElo(Number(singlesRaw))
        : '';
    const doublesElo = (doublesRaw != null && Number.isFinite(Number(doublesRaw)))
        ? formatElo(Number(doublesRaw))
        : '';

    // UTR dışı: tek birleşik ELO; padel/pickleball'da tekli gizli olabilir — çiftler yeter
    let elo = '';
    if (!isUtr) {
        if (interest?.skillRating != null && Number.isFinite(Number(interest.skillRating)) && Number(interest.skillRating) > 0) {
            elo = formatElo(Number(interest.skillRating));
        }
    }

    const name = user.fullName || user.username || '';
    const alias = interest?.alias || '';
    const sport = getSubCategoryLabel(subCategory, lang) || subCategory || '';
    const emoji = SUB_EMOJI[subCategory] || '🏅';
    const level = interest?.level || '';

    const showRanks = LEADERBOARD_SHARE_SUBS.has(subCategory);
    // UTR: tekli/çiftler ayrı sıra; diğer dallarda tek sütun (singles alanına yazılır)
    const rankLocalS = showRanks ? fmtRank(ranks?.singles?.local ?? ranks?.local) : null;
    const rankNationalS = showRanks ? fmtRank(ranks?.singles?.national ?? ranks?.national) : null;
    const rankInternationalS = showRanks ? fmtRank(ranks?.singles?.international ?? ranks?.international) : null;
    const rankLocalD = showRanks && isUtr ? fmtRank(ranks?.doubles?.local) : null;
    const rankNationalD = showRanks && isUtr ? fmtRank(ranks?.doubles?.national) : null;
    const rankInternationalD = showRanks && isUtr ? fmtRank(ranks?.doubles?.international) : null;

    // Padel/pickleball: tekli genelde yok — ön yüzde çiftler her zaman, tekli sadece varsa
    const showSinglesLine = isUtr && (subCategory === 'tennis' || subCategory === 'badminton' || subCategory === 'table_tennis'
        || !!singlesElo || interest?.assessmentCompleted);
    const showDoublesLine = isUtr;

    return {
        name,
        username: user.username || '',
        alias,
        avatarUrl: user.avatar || null,
        emoji,
        sport,
        isUtr,
        elo,
        singlesElo,
        doublesElo,
        showSinglesLine,
        showDoublesLine,
        level,
        totalMatches,
        wins,
        losses,
        titles,
        showRanks,
        rankLocalS,
        rankNationalS,
        rankInternationalS,
        rankLocalD,
        rankNationalD,
        rankInternationalD,
        labels: {
            front: t?.shareMatchSharerFront || (lang === 'tr' ? 'OYUNCU' : lang === 'ru' ? 'ИГРОК' : lang === 'de' ? 'SPIELER' : 'PLAYER'),
            back: t?.shareMatchSharerBack || (lang === 'tr' ? 'İSTATİSTİK' : lang === 'ru' ? 'СТАТИСТИКА' : lang === 'de' ? 'STATISTIK' : 'STATS'),
            matches: t?.shareMatchSharerMatches || (lang === 'tr' ? 'Maç' : lang === 'ru' ? 'Матчи' : lang === 'de' ? 'Spiele' : 'Matches'),
            wins: t?.shareMatchSharerWins || t?.wins || (lang === 'tr' ? 'Galibiyet' : lang === 'ru' ? 'Победы' : lang === 'de' ? 'Siege' : 'Wins'),
            losses: t?.shareMatchSharerLosses || t?.losses || (lang === 'tr' ? 'Yenilgi' : lang === 'ru' ? 'Поражения' : lang === 'de' ? 'Niederlagen' : 'Losses'),
            titles: t?.shareMatchSharerTitles || (lang === 'tr' ? 'Şampiyonluk' : lang === 'ru' ? 'Титулы' : lang === 'de' ? 'Titel' : 'Titles'),
            singles: t?.shareMatchSharerSingles || (lang === 'tr' ? 'Tekli' : lang === 'ru' ? 'Одиночный' : lang === 'de' ? 'Einzel' : 'Singles'),
            doubles: t?.shareMatchSharerDoubles || (lang === 'tr' ? 'Çiftler' : lang === 'ru' ? 'Пары' : lang === 'de' ? 'Doppel' : 'Doubles'),
            singlesShort: t?.shareMatchSharerSinglesShort || (lang === 'tr' ? 'T' : lang === 'ru' ? 'О' : lang === 'de' ? 'E' : 'S'),
            doublesShort: t?.shareMatchSharerDoublesShort || (lang === 'tr' ? 'Ç' : lang === 'ru' ? 'П' : lang === 'de' ? 'D' : 'D'),
            rankLocal: t?.shareMatchSharerRankLocal || t?.tournScopeYerel || (lang === 'tr' ? '📍 Yerel' : '📍 Local'),
            rankNational: t?.shareMatchSharerRankNational || t?.tournScopeUlusal || (lang === 'tr' ? '🇹🇷 Ulusal' : '🇹🇷 National'),
            rankIntl: t?.shareMatchSharerRankIntl || t?.tournScopeUluslararasi || (lang === 'tr' ? '🌍 Uluslararası' : '🌍 International'),
        },
    };
}

/** Maç → hikâye kartı / paylaşım metni için ortak özet. */
export function buildMatchSharePayload(match, t, lang = 'tr') {
    if (!match?.id) return null;
    const sets = Array.isArray(match.score?.sets) ? match.score.sets : [];
    const sub = match.subCategory;
    const leftPlayers = sidePlayers(match, 'sender');
    const rightPlayers = sidePlayers(match, 'opponent');
    const left = sideNames(leftPlayers);
    const right = sideNames(rightPlayers);
    const leftLabel = left.join(' & ') || (t?.shareMatchSideA || 'A');
    const rightLabel = right.join(' & ') || (t?.shareMatchSideB || 'B');
    const leftElo = sideEloLabel(leftPlayers, sub);
    const rightElo = sideEloLabel(rightPlayers, sub);
    const lines = sets.map(setLine).filter(Boolean);

    let leftSets = 0;
    let rightSets = 0;
    for (const s of sets) {
        const a = s.sender ?? s.p1 ?? 0;
        const b = s.opponent ?? s.p2 ?? 0;
        if (a > b) leftSets++;
        else if (b > a) rightSets++;
    }

    // Oyun toplamı — sadece raket sporlarında (voleybol set puanı toplamı "oyun" değil)
    const racketSubs = new Set(['tennis', 'padel', 'pickleball', 'badminton', 'table_tennis']);
    let leftGames = null;
    let rightGames = null;
    if (racketSubs.has(sub)) {
        leftGames = 0;
        rightGames = 0;
        for (const s of sets) {
            leftGames += Number(s.sender ?? s.p1 ?? 0) || 0;
            rightGames += Number(s.opponent ?? s.p2 ?? 0) || 0;
        }
    }

    const winner = match.score?.winner;
    let resultLabel = t?.drawResult || 'Draw';
    let winnerSide = null;
    if (winner === 'sender' || winner === 'p1') { resultLabel = leftLabel; winnerSide = 'left'; }
    else if (winner === 'opponent' || winner === 'p2') { resultLabel = rightLabel; winnerSide = 'right'; }
    else if (winner === 'draw') { resultLabel = t?.drawResult || 'Draw'; winnerSide = 'draw'; }
    else if (leftSets !== rightSets) {
        winnerSide = leftSets > rightSets ? 'left' : 'right';
        resultLabel = winnerSide === 'left' ? leftLabel : rightLabel;
    }

    const place = match.courtName || match.location || match.city || '';
    let dateStr = '';
    if (match.matchDate) {
        try {
            dateStr = new Date(match.matchDate).toLocaleDateString(
                lang === 'tr' ? 'tr-TR' : lang === 'ru' ? 'ru-RU' : lang === 'de' ? 'de-DE' : 'en-GB',
                { day: 'numeric', month: 'short', year: 'numeric' },
            );
        } catch { /* */ }
    }
    if (match.matchTime) dateStr = dateStr ? `${dateStr} · ${match.matchTime}` : match.matchTime;

    const sport = getSubCategoryLabel(match.subCategory, lang) || match.subCategory || '';
    const emoji = SUB_EMOJI[match.subCategory] || '🏅';
    const url = `${SHARE_HOST}/share/match/${match.id}`;
    const brand = lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy';
    const surface = surfaceLabel(match, t);
    const shareStats = buildShareStats(match, t);
    const durationLabel = shareStats?.durationLabel
        || formatDurationFromStats(match?.score?.stats, match?.duration, t);

    const formatBits = [];
    if (match.matchType === 'DOUBLE') formatBits.push(t?.shareMatchFormatDoubles || 'Doubles');
    else if (match.matchType === 'SINGLE') formatBits.push(t?.shareMatchFormatSingles || 'Singles');
    if (surface) formatBits.push(surface);

    return {
        id: match.id,
        subCategory: match.subCategory,
        surfaceRaw: match.surface || null,
        emoji,
        sport,
        leftLabel,
        rightLabel,
        leftElo,
        rightElo,
        leftSets,
        rightSets,
        leftGames,
        rightGames,
        lines,
        resultLabel,
        winnerSide,
        place,
        dateStr,
        surface,
        durationLabel,
        formatLine: formatBits.join(' · '),
        shareStats,
        url,
        brand,
        brandColors: BRAND_LETTER_COLORS,
    };
}

export function matchShareMessage(payload, t) {
    if (!payload) return '';
    const parts = [
        t?.shareMatchIntro
            ? t.shareMatchIntro(payload.sport)
            : `AcTiViTy · ${payload.sport}`,
        `${payload.leftLabel}${payload.leftElo ? ` (${payload.leftElo})` : ''}  ${payload.leftSets}–${payload.rightSets}  ${payload.rightLabel}${payload.rightElo ? ` (${payload.rightElo})` : ''}`,
    ];
    if (payload.lines.length) parts.push(payload.lines.join('  ·  '));
    if (payload.resultLabel) parts.push(`🏆 ${payload.resultLabel}`);
    if (payload.surface) parts.push(`🏟 ${payload.surface}`);
    if (payload.place) parts.push(`📍 ${payload.place}`);
    if (payload.dateStr) parts.push(`📅 ${payload.dateStr}`);
    if (payload.durationLabel) parts.push(`⏱ ${payload.durationLabel}`);
    if (payload.shareStats?.hasWorkout) {
        parts.push(`♥ ${t?.statWorkout || 'Workout'}`);
    }
    parts.push(payload.url);
    return parts.join('\n');
}
