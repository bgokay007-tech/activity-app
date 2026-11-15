import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { emitToUser } from '../config/socket.js';

function isTeamEngineType(type) {
    return type === '2' || type === '4' || type === '7';
}

/**
 * Maç tarafı id → gerçek kullanıcı id'leri.
 * Teklilerde sideId = userId; çiftlerde teamId veya availabilitySides.memberUserIds.
 */
async function resolveSideUserIds(tournament, sideId) {
    if (!sideId) return [];
    if (isTeamEngineType(tournament.type)) {
        const team = await prisma.tournamentTeam.findUnique({
            where: { id: sideId },
            select: { player1Id: true, player2Id: true },
        });
        if (team) return [team.player1Id, team.player2Id].filter(Boolean);
    }
    const meta = (tournament.bracketData && typeof tournament.bracketData === 'object')
        ? tournament.bracketData
        : {};
    if (Array.isArray(meta.availabilitySides)) {
        const side = meta.availabilitySides.find(s => s?.id === sideId);
        if (Array.isArray(side?.memberUserIds) && side.memberUserIds.length) {
            return side.memberUserIds.filter(Boolean);
        }
    }
    return [sideId];
}

/**
 * Yeni oluşturulan turnuva maç eşleşmeleri için bildirim.
 * - Her eşleşen oyuncuya: rakip adı + tur
 * - Turnuva sahibine: kaç maç oluştuğu özeti
 */
export async function notifyTournamentMatchPairings({
    tournament,
    matches,
    roundIndex = null,
    actorUserId = null,
    notifyOwner = true,
}) {
    if (!tournament?.id || !Array.isArray(matches) || !matches.length) return;

    const roundBit = roundIndex != null
        ? `${roundIndex}. tur`
        : null;
    const catPayload = {
        tournamentId: tournament.id,
        category: tournament.category,
        subCategory: tournament.subCategory,
    };

    const sideCache = new Map();
    const getUsers = async (sideId) => {
        if (!sideId) return [];
        if (sideCache.has(sideId)) return sideCache.get(sideId);
        const ids = await resolveSideUserIds(tournament, sideId);
        sideCache.set(sideId, ids);
        return ids;
    };

    const notifiedPlayers = new Set();

    for (const m of matches) {
        if (!m?.p1Id || !m?.p2Id || m.status === 'BYE') continue;
        const p1Users = await getUsers(m.p1Id);
        const p2Users = await getUsers(m.p2Id);
        const p1Label = m.p1Name || 'Rakip';
        const p2Label = m.p2Name || 'Rakip';
        const matchPayload = {
            ...catPayload,
            matchId: m.id || null,
            round: m.round ?? roundIndex ?? null,
        };

        const title = '🎾 Eşleşmeniz hazır';
        const bodyFor = (oppName) => {
            const parts = [`"${tournament.name}"`];
            if (roundBit) parts.push(roundBit);
            parts.push(`rakibiniz: ${oppName}`);
            return `${parts.join(' — ')}.`;
        };

        for (const uid of p1Users) {
            if (!uid || notifiedPlayers.has(`${uid}|${m.p2Id}`)) continue;
            notifiedPlayers.add(`${uid}|${m.p2Id}`);
            emitToUser(uid, 'tournament:matching_approved', {
                tournamentId: tournament.id,
                matchId: m.id || null,
                roundId: m.roundId || null,
            });
            createNotification(
                uid,
                'TOURNAMENT_MATCH',
                title,
                bodyFor(p2Label),
                matchPayload,
            ).catch(() => {});
        }
        for (const uid of p2Users) {
            if (!uid || notifiedPlayers.has(`${uid}|${m.p1Id}`)) continue;
            notifiedPlayers.add(`${uid}|${m.p1Id}`);
            emitToUser(uid, 'tournament:matching_approved', {
                tournamentId: tournament.id,
                matchId: m.id || null,
                roundId: m.roundId || null,
            });
            createNotification(
                uid,
                'TOURNAMENT_MATCH',
                title,
                bodyFor(p1Label),
                matchPayload,
            ).catch(() => {});
        }
    }

    if (notifyOwner && tournament.creatorId) {
        const n = matches.filter(m => m?.p1Id && m?.p2Id && m.status !== 'BYE').length;
        if (n > 0) {
            const ownerBody = roundBit
                ? `"${tournament.name}" — ${roundBit}: ${n} maç eşleşmesi oluşturuldu.`
                : `"${tournament.name}" — ${n} maç eşleşmesi oluşturuldu.`;
            createNotification(
                tournament.creatorId,
                'TOURNAMENT_MATCH',
                '🏆 Eşleşmeler hazır',
                ownerBody,
                { ...catPayload, round: roundIndex },
            ).catch(() => {});
            emitToUser(tournament.creatorId, 'tournament:matching_approved', {
                tournamentId: tournament.id,
                roundId: matches[0]?.roundId || null,
            });
        }
    }
}
