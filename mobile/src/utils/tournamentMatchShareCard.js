import { BASE_URL } from '../services/api';
import { buildMatchSharePayload, matchShareMessage } from './matchShareCard';

const SHARE_HOST = BASE_URL.replace(/\/api\/?$/, '');

function rankInStandings(standings, id) {
    if (!id || !Array.isArray(standings) || !standings.length) return null;
    const idx = standings.findIndex((r) => r?.id === id);
    return idx >= 0 ? idx + 1 : null;
}

function isDoublesTournament(tournament, match) {
    const fmt = String(tournament?.format || '').toUpperCase();
    if (fmt === 'DOUBLES' || fmt === 'DOUBLE') return true;
    const type = String(tournament?.type || '');
    if (type === '2' || type === '4' || type === '7') return true;
    const n1 = match?.p1Name || '';
    const n2 = match?.p2Name || '';
    return n1.includes(' & ') || n2.includes(' & ');
}

/** Tur / faz etiketi — maçlar sekmesindeki etiketlerle uyumlu. */
export function tournamentRoundLabel(match, tournament, t) {
    if (!match) return '';
    if (match.isThirdPlaceMatch) {
        return t?.sc_0444 || t?.shareTournMatchThirdPlace || '3rd place';
    }
    const phase = match.phase || 'GROUP';
    const round = Number(match.round) || 1;
    if (phase === 'GROUP') {
        return typeof t?.sc_0462 === 'function' ? t.sc_0462(round) : `R${round}`;
    }
    if (phase === 'PLAYOFF' || phase === 'GRAND_FINAL') {
        const playoffRounds = Array.isArray(tournament?._playoffRounds)
            ? tournament._playoffRounds
            : null;
        const maxR = playoffRounds?.length
            ? Math.max(...playoffRounds)
            : (tournament?._maxPlayoffRound || round);
        const fromEnd = maxR - round;
        if (fromEnd === 0) return t?.sc_0436 || 'Final';
        if (fromEnd === 1) return t?.sc_0437 || 'Semi-final';
        if (fromEnd === 2) return t?.sc_0438 || 'Quarter-final';
        return typeof t?.sc_0439 === 'function' ? t.sc_0439(round) : `R${round}`;
    }
    if (phase === 'WINNERS') {
        return typeof t?.sc_0463 === 'function' ? t.sc_0463(round) : `Winners R${round}`;
    }
    if (phase === 'LOSERS') {
        return typeof t?.sc_0464 === 'function' ? t.sc_0464(round) : `Losers R${round}`;
    }
    return `${phase} · R${round}`;
}

/**
 * Turnuva maçını MatchResultShareModal / buildMatchSharePayload şekline çevir.
 * Skor p1/p2 → sender/opponent.
 */
export function tournamentMatchToShareMatch(tournament, match) {
    if (!tournament?.id || !match?.id) return null;
    const agreed = match.scheduleData?.agreed;
    const finished = match.status === 'COMPLETED' || match.status === 'FORFEIT';
    const rawScore = finished && match.score ? match.score : null;
    const score = rawScore
        ? {
            ...rawScore,
            sets: Array.isArray(rawScore.sets)
                ? rawScore.sets.map((s) => ({
                    ...s,
                    sender: s.p1 ?? s.sender,
                    opponent: s.p2 ?? s.opponent,
                    tbSender: s.tb1 ?? s.tbSender,
                    tbOpponent: s.tb2 ?? s.tbOpponent,
                }))
                : [],
            winner:
                rawScore.winner === 'p1'
                    ? 'sender'
                    : rawScore.winner === 'p2'
                        ? 'opponent'
                        : rawScore.winner,
        }
        : null;

    return {
        id: match.id,
        subCategory: tournament.subCategory,
        matchType: isDoublesTournament(tournament, match) ? 'DOUBLE' : 'SINGLE',
        surface: match.surface || tournament.surface || null,
        sender: {
            id: match.p1Id,
            fullName: match.p1Name || 'TBD',
            skillRating: match.score?.p1RatingAfter ?? match.score?.p1RatingBefore ?? null,
            singlesDisplayRating: match.score?.p1RatingAfter ?? match.score?.p1RatingBefore ?? null,
            doublesDisplayRating: match.score?.p1RatingAfter ?? match.score?.p1RatingBefore ?? null,
        },
        participants: [
            {
                id: match.p2Id,
                fullName: match.p2Name || 'TBD',
                skillRating: match.score?.p2RatingAfter ?? match.score?.p2RatingBefore ?? null,
                singlesDisplayRating: match.score?.p2RatingAfter ?? match.score?.p2RatingBefore ?? null,
                doublesDisplayRating: match.score?.p2RatingAfter ?? match.score?.p2RatingBefore ?? null,
            },
        ],
        score,
        matchDate: agreed?.date || match.playedAt || match.deadline || null,
        matchTime: agreed?.timeFrom || null,
        location: agreed?.venueName || tournament.location || tournament.city || '',
        courtName: agreed?.venueName || tournament.location || '',
        city: tournament.city || '',
        duration: rawScore?.stats?.durationMs
            ? rawScore.stats.durationMs / 60000
            : null,
        _tournamentId: tournament.id,
        _tournamentMatch: true,
    };
}

function withRank(roster, rank) {
    if (!Array.isArray(roster) || !roster.length) {
        return rank != null ? [{ name: '—', elo: '', rank }] : [];
    }
    return roster.map((r, i) => (i === 0 ? { ...r, rank: rank ?? r.rank ?? null } : r));
}

/**
 * Turnuva maçı paylaşım özeti — bitmiş sonuç veya yaklaşan maç.
 * standings: turnuva sıralama satırları ({ id, name, ... }).
 */
export function buildTournamentMatchSharePayload(tournament, match, standings, t, lang = 'tr') {
    const shaped = tournamentMatchToShareMatch(tournament, match);
    if (!shaped) return null;
    const base = buildMatchSharePayload(shaped, t, lang);
    if (!base) return null;

    const finished = match.status === 'COMPLETED' || match.status === 'FORFEIT';
    const isUpcoming = !finished;
    const leftRank = rankInStandings(standings, match.p1Id);
    const rightRank = rankInStandings(standings, match.p2Id);
    const roundLbl = tournamentRoundLabel(match, tournament, t);
    const tournName = tournament.name || base.sport || '';

    return {
        ...base,
        isTournament: true,
        isUpcoming,
        tournamentName: tournName,
        tournamentRound: roundLbl,
        leftRank,
        rightRank,
        leftRoster: withRank(base.leftRoster, leftRank),
        rightRoster: withRank(base.rightRoster, rightRank),
        url: `${SHARE_HOST}/share/tournament/${tournament.id}`,
        // Yaklaşan: kazanan satırı yerine turnuva adı + VS
        resultLabel: isUpcoming ? tournName : base.resultLabel,
        winnerSide: isUpcoming ? null : base.winnerSide,
    };
}

export function tournamentMatchShareMessage(payload, t) {
    if (!payload) return '';
    if (!payload.isTournament) return matchShareMessage(payload, t);

    const parts = [
        typeof t?.shareTournMatchIntro === 'function'
            ? t.shareTournMatchIntro(payload.sport, payload.tournamentName)
            : `AcTiViTy · ${payload.tournamentName || payload.sport}`,
    ];
    if (payload.tournamentRound) {
        parts.push(`🏟 ${payload.tournamentRound}`);
    }

    const leftRankStr = payload.leftRank != null ? ` #${payload.leftRank}` : '';
    const rightRankStr = payload.rightRank != null ? ` #${payload.rightRank}` : '';

    if (payload.teamsKnown) {
        parts.push(
            `🟢 ${payload.teamATitle || 'A'}: ${payload.leftLabel}${leftRankStr}${payload.leftElo ? ` (${payload.leftElo})` : ''}`,
        );
        parts.push(
            `🔴 ${payload.teamBTitle || 'B'}: ${payload.rightLabel}${rightRankStr}${payload.rightElo ? ` (${payload.rightElo})` : ''}`,
        );
    } else {
        parts.push(
            `${payload.leftLabel}${leftRankStr}  vs  ${payload.rightLabel}${rightRankStr}`,
        );
    }

    if (payload.isUpcoming) {
        parts.push(`⏳ ${t?.shareTournMatchUpcomingLine || 'Upcoming match'}`);
    } else {
        if (payload.leftSets != null && payload.rightSets != null) {
            parts.push(`📊 ${payload.leftSets}–${payload.rightSets}`);
        }
        if (payload.lines?.length) parts.push(payload.lines.join('  ·  '));
        if (payload.resultLabel) parts.push(`🏆 ${payload.resultLabel}`);
    }

    if (payload.surface) parts.push(`🏟 ${payload.surface}`);
    if (payload.place) parts.push(`📍 ${payload.place}`);
    if (payload.dateStr) parts.push(`📅 ${payload.dateStr}`);
    if (payload.durationLabel) parts.push(`⏱ ${payload.durationLabel}`);
    parts.push(payload.url);
    return parts.join('\n');
}
