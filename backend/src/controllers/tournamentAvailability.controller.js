import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';
import { getDisplayRating, isDoublesFormat } from '../utils/utrRating.js';
import {
    buildWeeklyRounds,
    normalizeSlots,
    generateAvailabilityPairings,
    fingerprintProposed,
    findDuplicateWarnings,
    pairKey,
    toYmd,
} from '../utils/tournamentAvailabilityMatch.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

// tournament.controller ile döngüsel import olmasın diye burada tekrarlanıyor
function tournamentBaseDate(tournament) {
    if (!tournament.eventDate) return new Date();
    const dateStr = new Date(tournament.eventDate).toISOString().split('T')[0];
    const timeStr = tournament.eventTime || '00:00';
    return new Date(`${dateStr}T${timeStr}:00+03:00`);
}

function isTournAdmin(tournament, userId, isPlatformAdmin) {
    return isPlatformAdmin || tournament.creatorId === userId;
}

async function loadSides(tournament) {
    const meta = (tournament.bracketData && typeof tournament.bracketData === 'object')
        ? tournament.bracketData
        : {};
    if (Array.isArray(meta.availabilitySides) && meta.availabilitySides.length) {
        return meta.availabilitySides;
    }
    // Yedek: kabul edilen oyuncular (tekli)
    const parts = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: tournament.id, status: 'ACCEPTED', userId: { not: null } },
        include: {
            user: {
                select: {
                    id: true, username: true, fullName: true,
                    interests: {
                        where: { category: tournament.category, subCategory: tournament.subCategory },
                    },
                },
            },
        },
        take: tournament.maxPlayers || 64,
        orderBy: [{ acceptedAt: 'asc' }, { createdAt: 'asc' }],
    });
    const doubles = isDoublesFormat({ tournamentType: tournament.type });
    return parts.map(p => ({
        id: p.userId,
        name: p.user?.fullName || p.user?.username || 'Oyuncu',
        skillRating: getDisplayRating(p.user?.interests?.[0], tournament.subCategory, doubles) || 0,
        memberUserIds: [p.userId],
    }));
}

async function previousPairKeys(tournamentId) {
    const matches = await prisma.tournamentMatch.findMany({
        where: {
            tournamentId,
            p1Id: { not: null },
            p2Id: { not: null },
            status: { not: 'BYE' },
        },
        select: { p1Id: true, p2Id: true },
    });
    return new Set(matches.map(m => pairKey(m.p1Id, m.p2Id)));
}

async function roundUsedCounts(roundId) {
    const matches = await prisma.tournamentMatch.findMany({
        where: { roundId, status: { not: 'BYE' }, p1Id: { not: null }, p2Id: { not: null } },
        select: { p1Id: true, p2Id: true },
    });
    const used = {};
    const pairs = new Set();
    for (const m of matches) {
        used[m.p1Id] = (used[m.p1Id] || 0) + 1;
        used[m.p2Id] = (used[m.p2Id] || 0) + 1;
        pairs.add(pairKey(m.p1Id, m.p2Id));
    }
    return { usedCounts: used, existingRoundPairKeys: pairs };
}

/** Turnuva başlarken çağrılır — klasik kura yerine turları açar */
export async function bootstrapAvailabilityRounds(tournament, { sides, actorUserId = null } = {}) {
    const base = tournamentBaseDate(tournament);
    let weekCount = tournament.matchesBeforePlayoff || 4;
    if (tournament.eventEndDate) {
        const end = new Date(tournament.eventEndDate);
        const ms = end.getTime() - base.getTime();
        const weeks = Math.ceil(ms / (7 * 24 * 60 * 60 * 1000));
        if (weeks > 0) weekCount = Math.max(weekCount, weeks);
    }
    const defs = buildWeeklyRounds(base, weekCount);
    await prisma.tournamentRound.createMany({
        data: defs.map(d => ({
            tournamentId: tournament.id,
            roundIndex: d.roundIndex,
            startDate: d.startDate,
            endDate: d.endDate,
            availabilityOpenAt: d.availabilityOpenAt,
            availabilityCloseAt: d.availabilityCloseAt,
            status: d.status,
        })),
    });

    const existingBracket = (tournament.bracketData && typeof tournament.bracketData === 'object')
        ? tournament.bracketData
        : {};
    await prisma.tournament.update({
        where: { id: tournament.id },
        data: {
            status: 'IN_PROGRESS',
            startedAt: new Date(),
            bracketData: {
                ...existingBracket,
                engine: 'availability',
                formatType: tournament.type,
                availabilitySides: sides,
            },
        },
    });

    const parts = await prisma.tournamentParticipant.findMany({
        where: { tournamentId: tournament.id, status: 'ACCEPTED', userId: { not: null } },
        select: { userId: true },
    });
    for (const p of parts) {
        if (p.userId && p.userId !== actorUserId) {
            emitToUser(p.userId, 'tournament:started', { tournamentId: tournament.id });
            createNotification(
                p.userId,
                'TOURNAMENT_STARTED',
                '🏆 Turnuva Başladı',
                `"${tournament.name}" başladı — 1. tur için müsait gün/saatlerinizi girin.`,
                { tournamentId: tournament.id, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        }
    }

    return prisma.tournament.findUnique({
        where: { id: tournament.id },
        include: {
            creator: { select: { id: true, username: true, fullName: true } },
            _count: { select: { participants: { where: { status: 'ACCEPTED' } } } },
            rounds: { orderBy: { roundIndex: 'asc' } },
        },
    });
}

export const getTournamentRounds = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (!tournament.availabilityMatchEnabled) {
            return res.json({ rounds: [], availabilityMatchEnabled: false });
        }
        const rounds = await prisma.tournamentRound.findMany({
            where: { tournamentId: id },
            orderBy: { roundIndex: 'asc' },
            include: {
                _count: { select: { availabilities: true, matches: true } },
                availabilities: {
                    where: { userId: req.userId },
                    take: 1,
                },
            },
        });
        res.json({
            availabilityMatchEnabled: true,
            rounds: rounds.map(r => ({
                ...r,
                myAvailability: r.availabilities[0] || null,
                availabilities: undefined,
            })),
        });
    } catch (e) { next(e); }
};

export const updateTournamentRound = async (req, res, next) => {
    try {
        const { id, roundId } = req.params;
        const { startDate, endDate, availabilityOpenAt, availabilityCloseAt } = req.body;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (!isTournAdmin(tournament, req.userId, me?.isAdmin)) {
            return res.status(403).json({ message: 'Yetkisiz' });
        }
        const round = await prisma.tournamentRound.findFirst({ where: { id: roundId, tournamentId: id } });
        if (!round) return res.status(404).json({ message: 'Tur bulunamadı' });

        const data = {};
        if (startDate) data.startDate = new Date(startDate);
        if (endDate) data.endDate = new Date(endDate);
        if (availabilityOpenAt) data.availabilityOpenAt = new Date(availabilityOpenAt);
        if (availabilityCloseAt) data.availabilityCloseAt = new Date(availabilityCloseAt);
        if (!Object.keys(data).length) return res.status(400).json({ message: 'Güncellenecek alan yok' });

        const updated = await prisma.tournamentRound.update({ where: { id: roundId }, data });
        res.json(updated);
    } catch (e) { next(e); }
};

export const upsertRoundAvailability = async (req, res, next) => {
    try {
        const { id, roundId } = req.params;
        const { slots, maxMatches } = req.body;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (!tournament.availabilityMatchEnabled) {
            return res.status(400).json({ message: 'Bu turnuvada müsaitliğe göre eşleştirme kapalı' });
        }
        const part = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });
        if (!part || part.status !== 'ACCEPTED') {
            return res.status(403).json({ message: 'Sadece kabul edilen katılımcılar müsaitlik girebilir' });
        }
        const round = await prisma.tournamentRound.findFirst({ where: { id: roundId, tournamentId: id } });
        if (!round) return res.status(404).json({ message: 'Tur bulunamadı' });

        const now = Date.now();
        // Tur bitmeden önce girebilir (hafta içinde ekstra müsaitlik de serbest)
        if (new Date(round.endDate).getTime() < now) {
            return res.status(400).json({ message: 'Bu turun süresi doldu' });
        }
        if (new Date(round.availabilityOpenAt).getTime() > now) {
            return res.status(400).json({ message: 'Bu tur için müsaitlik henüz açılmadı' });
        }

        const cap = Math.max(1, Math.min(5, parseInt(maxMatches) || 1));
        const cleanSlots = normalizeSlots(slots, round.startDate, round.endDate);
        if (!cleanSlots.length) {
            return res.status(400).json({ message: 'En az bir geçerli gün/saat aralığı girin' });
        }

        const row = await prisma.tournamentRoundAvailability.upsert({
            where: { roundId_userId: { roundId, userId: req.userId } },
            update: { maxMatches: cap, slots: cleanSlots, tournamentId: id },
            create: {
                roundId,
                tournamentId: id,
                userId: req.userId,
                maxMatches: cap,
                slots: cleanSlots,
            },
        });

        // Tur AVAIL_OPEN değilse ama müsaitlik girildiyse open say
        if (round.status === 'UPCOMING') {
            await prisma.tournamentRound.update({
                where: { id: roundId },
                data: { status: 'AVAIL_OPEN' },
            });
        }

        res.json(row);
    } catch (e) { next(e); }
};

export const getRoundAvailabilities = async (req, res, next) => {
    try {
        const { id, roundId } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        const isAdmin = isTournAdmin(tournament, req.userId, me?.isAdmin);

        const rows = await prisma.tournamentRoundAvailability.findMany({
            where: { roundId, tournamentId: id },
            include: { user: { select: USER_SELECT } },
            orderBy: { updatedAt: 'desc' },
        });
        // Admin tümünü görür; oyuncu kendi + sayıları
        if (!isAdmin) {
            return res.json({
                count: rows.length,
                mine: rows.find(r => r.userId === req.userId) || null,
                others: rows.filter(r => r.userId !== req.userId).map(r => ({
                    userId: r.userId,
                    user: r.user,
                    maxMatches: r.maxMatches,
                    // slot detayı rakibe gösterilmez (gizlilik); sadece var/yok
                    hasSlots: Array.isArray(r.slots) && r.slots.length > 0,
                })),
            });
        }
        res.json({ count: rows.length, availabilities: rows });
    } catch (e) { next(e); }
};

export const generateRoundMatching = async (req, res, next) => {
    try {
        const { id, roundId } = req.params;
        const { confirmDuplicate } = req.body || {};
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        if (!tournament.availabilityMatchEnabled) {
            return res.status(400).json({ message: 'Müsaitliğe göre eşleştirme kapalı' });
        }
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (!isTournAdmin(tournament, req.userId, me?.isAdmin)) {
            return res.status(403).json({ message: 'Yetkisiz' });
        }
        const round = await prisma.tournamentRound.findFirst({ where: { id: roundId, tournamentId: id } });
        if (!round) return res.status(404).json({ message: 'Tur bulunamadı' });

        const sides = await loadSides(tournament);
        const avails = await prisma.tournamentRoundAvailability.findMany({
            where: { roundId },
        });
        const availByUserId = Object.fromEntries(avails.map(a => [a.userId, a]));
        const prev = await previousPairKeys(id);
        const { usedCounts, existingRoundPairKeys } = await roundUsedCounts(roundId);

        const proposed = generateAvailabilityPairings({
            sides,
            availByUserId,
            previousPairKeys: prev,
            existingRoundPairKeys,
            usedCounts,
        });

        const fp = fingerprintProposed(proposed);
        if (round.lastFingerprint && fp === round.lastFingerprint && !confirmDuplicate) {
            return res.status(409).json({
                warning: true,
                code: 'DUPLICATE_MATCHING',
                message: 'Aynı eşleştirme daha önce üretildi. Tekrar uygulamak istediğinize emin misiniz?',
                fingerprint: fp,
                proposed,
            });
        }

        // Mevcut taslakla aynıysa da uyar
        const currentFp = fingerprintProposed(round.proposedMatches);
        if (round.proposedMatches && currentFp === fp && proposed.length > 0 && !confirmDuplicate) {
            return res.status(409).json({
                warning: true,
                code: 'DUPLICATE_MATCHING',
                message: 'Üretilen eşleştirme mevcut taslakla aynı. Yeniden kaydetmek istediğinize emin misiniz?',
                fingerprint: fp,
                proposed,
            });
        }

        const updated = await prisma.tournamentRound.update({
            where: { id: roundId },
            data: {
                proposedMatches: proposed,
                lastFingerprint: fp,
                status: 'PENDING_APPROVAL',
            },
        });
        res.json({ round: updated, proposed, fingerprint: fp });
    } catch (e) { next(e); }
};

export const setRoundProposedMatches = async (req, res, next) => {
    try {
        const { id, roundId } = req.params;
        const { proposedMatches, confirmDuplicate } = req.body || {};
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (!isTournAdmin(tournament, req.userId, me?.isAdmin)) {
            return res.status(403).json({ message: 'Yetkisiz' });
        }
        const round = await prisma.tournamentRound.findFirst({ where: { id: roundId, tournamentId: id } });
        if (!round) return res.status(404).json({ message: 'Tur bulunamadı' });

        if (!Array.isArray(proposedMatches)) {
            return res.status(400).json({ message: 'proposedMatches dizi olmalı' });
        }

        const prev = await previousPairKeys(id);
        const { existingRoundPairKeys } = await roundUsedCounts(roundId);
        const warnings = findDuplicateWarnings(proposedMatches, prev, existingRoundPairKeys);
        const hard = warnings.filter(w => w.code === 'DUPLICATE_IN_LIST' || w.code === 'ALREADY_MATCHED_THIS_ROUND');
        const soft = warnings.filter(w => w.code === 'ALREADY_PLAYED_IN_TOURNAMENT');

        if ((hard.length || soft.length) && !confirmDuplicate) {
            return res.status(409).json({
                warning: true,
                code: 'DUPLICATE_MATCHING',
                message: hard.length
                    ? 'Listede tekrarlayan veya bu turda zaten onaylı eşleşmeler var. Yine de kaydetmek istiyor musunuz?'
                    : 'Bazı çiftler bu turnuvada daha önce oynamış. Yine de kaydetmek istiyor musunuz?',
                warnings,
                proposedMatches,
            });
        }

        const fp = fingerprintProposed(proposedMatches);
        if (round.lastFingerprint && fp === round.lastFingerprint && !confirmDuplicate) {
            return res.status(409).json({
                warning: true,
                code: 'DUPLICATE_MATCHING',
                message: 'Bu eşleştirme daha önce kaydedildi. Tekrar kaydetmek istediğinize emin misiniz?',
                fingerprint: fp,
                proposedMatches,
            });
        }

        const updated = await prisma.tournamentRound.update({
            where: { id: roundId },
            data: {
                proposedMatches,
                lastFingerprint: fp,
                status: 'PENDING_APPROVAL',
            },
        });
        res.json({ round: updated, warnings });
    } catch (e) { next(e); }
};

export const approveRoundMatching = async (req, res, next) => {
    try {
        const { id, roundId } = req.params;
        const { confirmDuplicate } = req.body || {};
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (!isTournAdmin(tournament, req.userId, me?.isAdmin)) {
            return res.status(403).json({ message: 'Yetkisiz' });
        }
        const round = await prisma.tournamentRound.findFirst({ where: { id: roundId, tournamentId: id } });
        if (!round) return res.status(404).json({ message: 'Tur bulunamadı' });

        const proposed = Array.isArray(round.proposedMatches) ? round.proposedMatches : [];
        if (!proposed.length) {
            return res.status(400).json({ message: 'Onaylanacak taslak eşleştirme yok — önce üretin veya düzenleyin' });
        }

        const prev = await previousPairKeys(id);
        const { existingRoundPairKeys, usedCounts } = await roundUsedCounts(roundId);
        const warnings = findDuplicateWarnings(proposed, prev, existingRoundPairKeys);
        if (warnings.length && !confirmDuplicate) {
            return res.status(409).json({
                warning: true,
                code: 'DUPLICATE_MATCHING',
                message: 'Eşleştirmelerde uyarı var (tekrar / daha önce oynanmış). Yine de onaylamak istiyor musunuz?',
                warnings,
            });
        }

        // Zaten onaylı çiftleri atla; yeni olanları ekle (hafta içi ekstra eşleşme)
        const toCreate = [];
        let matchIndex = await prisma.tournamentMatch.count({ where: { tournamentId: id, round: round.roundIndex } });
        for (const p of proposed) {
            if (!p?.p1Id || !p?.p2Id) continue;
            const pk = pairKey(p.p1Id, p.p2Id);
            if (existingRoundPairKeys.has(pk)) continue;
            const slot = p.slot || null;
            const agreed = slot ? {
                date: slot.date,
                timeFrom: slot.timeFrom,
                timeTo: slot.timeTo,
                venueName: tournament.location || null,
                agreedByUserId: req.userId,
                agreedAt: new Date().toISOString(),
                lockedByAdmin: true,
            } : null;
            toCreate.push({
                tournamentId: id,
                roundId: round.id,
                round: round.roundIndex,
                phase: 'GROUP',
                matchIndex: matchIndex++,
                p1Id: p.p1Id,
                p1Name: p.p1Name || null,
                p2Id: p.p2Id,
                p2Name: p.p2Name || null,
                status: 'PENDING',
                deadline: round.endDate,
                scheduleData: {
                    availability: { p1: [], p2: [] },
                    proposals: [],
                    agreed,
                },
            });
            usedCounts[p.p1Id] = (usedCounts[p.p1Id] || 0) + 1;
            usedCounts[p.p2Id] = (usedCounts[p.p2Id] || 0) + 1;
            existingRoundPairKeys.add(pk);
        }

        if (toCreate.length) {
            await prisma.tournamentMatch.createMany({ data: toCreate });
        }

        const fp = fingerprintProposed(proposed);
        await prisma.tournamentRound.update({
            where: { id: roundId },
            data: {
                status: 'ACTIVE',
                matchingApprovedAt: new Date(),
                lastFingerprint: fp,
            },
        });

        // Bildirim: yeni maçlardaki oyunculara
        const created = await prisma.tournamentMatch.findMany({
            where: { roundId, tournamentId: id },
            orderBy: { createdAt: 'desc' },
            take: toCreate.length || 0,
        });
        const notifyIds = new Set();
        for (const m of created) {
            if (m.p1Id) notifyIds.add(m.p1Id);
            if (m.p2Id) notifyIds.add(m.p2Id);
        }
        // Çiftlerde p1Id takım id olabilir — bracketData.sides member'larına da bildir
        const sides = await loadSides(tournament);
        const sideMap = Object.fromEntries(sides.map(s => [s.id, s]));
        for (const sid of [...notifyIds]) {
            const side = sideMap[sid];
            const users = side?.memberUserIds || [sid];
            for (const uid of users) {
                if (!uid) continue;
                emitToUser(uid, 'tournament:matching_approved', { tournamentId: id, roundId });
                createNotification(
                    uid,
                    'TOURNAMENT_MATCH',
                    '🎾 Eşleşmeniz hazır',
                    `"${tournament.name}" — ${round.roundIndex}. tur eşleşmeniz onaylandı.`,
                    { tournamentId: id, category: tournament.category, subCategory: tournament.subCategory },
                ).catch(() => {});
            }
        }

        const matches = await prisma.tournamentMatch.findMany({
            where: { roundId },
            orderBy: { matchIndex: 'asc' },
        });
        res.json({ created: toCreate.length, matches, roundId });
    } catch (e) { next(e); }
};

/** Admin onaylı ortak saati sonradan değiştirir */
export const adminUpdateMatchSchedule = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const { date, timeFrom, timeTo, venueName } = req.body || {};
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Turnuva bulunamadı' });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        if (!isTournAdmin(tournament, req.userId, me?.isAdmin)) {
            return res.status(403).json({ message: 'Yetkisiz' });
        }
        const match = await prisma.tournamentMatch.findFirst({ where: { id: matchId, tournamentId: id } });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });

        const schedule = (match.scheduleData && typeof match.scheduleData === 'object')
            ? { ...match.scheduleData }
            : { availability: { p1: [], p2: [] }, proposals: [], agreed: null };
        schedule.agreed = {
            ...(schedule.agreed || {}),
            date: date || schedule.agreed?.date || toYmd(new Date()),
            timeFrom: timeFrom || schedule.agreed?.timeFrom || '10:00',
            timeTo: timeTo || schedule.agreed?.timeTo || '12:00',
            venueName: venueName !== undefined ? venueName : (schedule.agreed?.venueName || tournament.location || null),
            agreedByUserId: req.userId,
            agreedAt: new Date().toISOString(),
            lockedByAdmin: true,
        };
        const updated = await prisma.tournamentMatch.update({
            where: { id: matchId },
            data: { scheduleData: schedule },
        });
        res.json({ scheduleData: schedule, match: updated });
    } catch (e) { next(e); }
};

export const getMatchMessages = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const match = await prisma.tournamentMatch.findFirst({ where: { id: matchId, tournamentId: id } });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        const sides = await loadSides(tournament);
        const sideMap = Object.fromEntries(sides.map(s => [s.id, s]));
        const mySideIds = new Set(
            sides.filter(s => (s.memberUserIds || [s.id]).includes(req.userId)).map(s => s.id),
        );
        const onMatch = mySideIds.has(match.p1Id) || mySideIds.has(match.p2Id)
            || match.p1Id === req.userId || match.p2Id === req.userId;
        const isAdmin = isTournAdmin(tournament, req.userId, me?.isAdmin);
        if (!onMatch && !isAdmin) return res.status(403).json({ message: 'Yetkisiz' });

        const messages = await prisma.tournamentMatchMessage.findMany({
            where: { matchId },
            include: { sender: { select: USER_SELECT } },
            orderBy: { createdAt: 'asc' },
            take: 200,
        });
        res.json({ messages, sideMap });
    } catch (e) { next(e); }
};

export const sendMatchMessage = async (req, res, next) => {
    try {
        const { id, matchId } = req.params;
        const { content, kind, requestType, requestData } = req.body || {};
        const match = await prisma.tournamentMatch.findFirst({ where: { id: matchId, tournamentId: id } });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        const sides = await loadSides(tournament);
        const mySideIds = new Set(
            sides.filter(s => (s.memberUserIds || [s.id]).includes(req.userId)).map(s => s.id),
        );
        const onMatch = mySideIds.has(match.p1Id) || mySideIds.has(match.p2Id)
            || match.p1Id === req.userId || match.p2Id === req.userId;
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        const isAdmin = isTournAdmin(tournament, req.userId, me?.isAdmin);
        if (!onMatch && !isAdmin) return res.status(403).json({ message: 'Yetkisiz' });

        const text = String(content || '').trim();
        if (!text && kind !== 'REQUEST') {
            return res.status(400).json({ message: 'Mesaj boş olamaz' });
        }
        const msgKind = kind === 'REQUEST' ? 'REQUEST' : 'CHAT';
        const row = await prisma.tournamentMatchMessage.create({
            data: {
                matchId,
                senderId: req.userId,
                content: text || (msgKind === 'REQUEST' ? 'Saat değişikliği talebi' : ''),
                kind: msgKind,
                requestType: msgKind === 'REQUEST' ? (requestType || 'SCHEDULE_CHANGE') : null,
                requestData: msgKind === 'REQUEST' ? (requestData || null) : null,
                status: msgKind === 'REQUEST' ? 'PENDING' : null,
            },
            include: { sender: { select: USER_SELECT } },
        });

        // Rakibe bildirim
        const notifySide = match.p1Id && mySideIds.has(match.p1Id) ? match.p2Id
            : match.p2Id && mySideIds.has(match.p2Id) ? match.p1Id
                : null;
        const opp = sides.find(s => s.id === notifySide);
        const targets = opp?.memberUserIds || (notifySide ? [notifySide] : []);
        for (const uid of targets) {
            if (!uid || uid === req.userId) continue;
            emitToUser(uid, 'tournament:match_chat', { tournamentId: id, matchId, message: row });
            createNotification(
                uid,
                'TOURNAMENT_MATCH',
                msgKind === 'REQUEST' ? '📩 Maç talebi' : '💬 Maç mesajı',
                text.slice(0, 80) || `"${tournament.name}" maç kartında yeni mesaj`,
                { tournamentId: id, matchId, category: tournament.category, subCategory: tournament.subCategory },
            ).catch(() => {});
        }
        res.status(201).json(row);
    } catch (e) { next(e); }
};

export const respondMatchRequest = async (req, res, next) => {
    try {
        const { id, matchId, messageId } = req.params;
        const { accept } = req.body || {};
        const match = await prisma.tournamentMatch.findFirst({ where: { id: matchId, tournamentId: id } });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        const msg = await prisma.tournamentMatchMessage.findFirst({
            where: { id: messageId, matchId },
        });
        if (!msg || msg.kind !== 'REQUEST' || msg.status !== 'PENDING') {
            return res.status(400).json({ message: 'Geçerli bir talep bulunamadı' });
        }
        if (msg.senderId === req.userId) {
            return res.status(400).json({ message: 'Kendi talebinize yanıt veremezsiniz' });
        }

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { isAdmin: true } });
        const sides = await loadSides(tournament);
        const mySideIds = new Set(
            sides.filter(s => (s.memberUserIds || [s.id]).includes(req.userId)).map(s => s.id),
        );
        const onMatch = mySideIds.has(match.p1Id) || mySideIds.has(match.p2Id)
            || match.p1Id === req.userId || match.p2Id === req.userId;
        const isAdmin = isTournAdmin(tournament, req.userId, me?.isAdmin);
        if (!onMatch && !isAdmin) return res.status(403).json({ message: 'Yetkisiz' });

        const status = accept === true ? 'ACCEPTED' : 'REJECTED';
        const updatedMsg = await prisma.tournamentMatchMessage.update({
            where: { id: messageId },
            data: { status },
            include: { sender: { select: USER_SELECT } },
        });

        if (status === 'ACCEPTED' && msg.requestType === 'SCHEDULE_CHANGE' && msg.requestData) {
            const rd = msg.requestData;
            const schedule = (match.scheduleData && typeof match.scheduleData === 'object')
                ? { ...match.scheduleData }
                : { availability: { p1: [], p2: [] }, proposals: [], agreed: null };
            schedule.agreed = {
                ...(schedule.agreed || {}),
                date: rd.date || schedule.agreed?.date,
                timeFrom: rd.timeFrom || schedule.agreed?.timeFrom,
                timeTo: rd.timeTo || schedule.agreed?.timeTo,
                venueName: rd.venueName !== undefined ? rd.venueName : schedule.agreed?.venueName,
                agreedByUserId: req.userId,
                agreedAt: new Date().toISOString(),
                lockedByAdmin: false,
            };
            await prisma.tournamentMatch.update({
                where: { id: matchId },
                data: { scheduleData: schedule },
            });
        }

        res.json(updatedMsg);
    } catch (e) { next(e); }
};
