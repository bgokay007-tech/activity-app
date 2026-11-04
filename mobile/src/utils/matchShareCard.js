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

    return {
        id: match.id,
        emoji,
        sport,
        leftLabel,
        rightLabel,
        leftElo,
        rightElo,
        leftSets,
        rightSets,
        lines,
        resultLabel,
        winnerSide,
        place,
        dateStr,
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
    if (payload.place) parts.push(`📍 ${payload.place}`);
    if (payload.dateStr) parts.push(`📅 ${payload.dateStr}`);
    parts.push(payload.url);
    return parts.join('\n');
}
