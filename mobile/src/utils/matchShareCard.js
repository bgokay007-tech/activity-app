import { getSubCategoryLabel } from './subCategoryLabels';
import { formatSetScore } from './racketScore';
import { BASE_URL } from '../services/api';

const SHARE_HOST = BASE_URL.replace(/\/api\/?$/, '');

const SUB_EMOJI = {
    football: '⚽', basketball: '🏀', tennis: '🎾', padel: '🏓', volleyball: '🏐',
    badminton: '🏸', table_tennis: '🏓', pickleball: '🥒', running: '🏃', climbing: '🧗',
};

function nameOf(p) {
    if (!p) return '';
    return p.fullName || p.username || p.manualName || '';
}

function sideNames(match, side) {
    if (side === 'sender') {
        const team = Array.isArray(match.senderTeam) ? match.senderTeam : [];
        return [match.sender, ...team].map(nameOf).filter(Boolean);
    }
    const parts = Array.isArray(match.participants) ? match.participants : [];
    if (match.receiver) return [match.receiver, ...parts.filter(p => p?.id !== match.receiver?.id)].map(nameOf).filter(Boolean);
    return parts.map(nameOf).filter(Boolean);
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
    const left = sideNames(match, 'sender');
    const right = sideNames(match, 'opponent');
    const leftLabel = left.join(' & ') || (t?.shareMatchSideA || 'A');
    const rightLabel = right.join(' & ') || (t?.shareMatchSideB || 'B');
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
    if (winner === 'sender' || winner === 'p1') resultLabel = leftLabel;
    else if (winner === 'opponent' || winner === 'p2') resultLabel = rightLabel;
    else if (winner === 'draw') resultLabel = t?.drawResult || 'Draw';
    else if (leftSets !== rightSets) resultLabel = leftSets > rightSets ? leftLabel : rightLabel;

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

    return {
        id: match.id,
        emoji,
        sport,
        leftLabel,
        rightLabel,
        leftSets,
        rightSets,
        lines,
        resultLabel,
        place,
        dateStr,
        url,
        brand: 'AcTiViTy',
    };
}

export function matchShareMessage(payload, t) {
    if (!payload) return '';
    const parts = [
        t?.shareMatchIntro
            ? t.shareMatchIntro(payload.sport)
            : `AcTiViTy · ${payload.sport}`,
        `${payload.leftLabel}  ${payload.leftSets}–${payload.rightSets}  ${payload.rightLabel}`,
    ];
    if (payload.lines.length) parts.push(payload.lines.join('  ·  '));
    if (payload.resultLabel) parts.push(`🏆 ${payload.resultLabel}`);
    if (payload.place) parts.push(`📍 ${payload.place}`);
    if (payload.dateStr) parts.push(`📅 ${payload.dateStr}`);
    parts.push(payload.url);
    return parts.join('\n');
}
