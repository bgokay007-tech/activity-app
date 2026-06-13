import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';

export const createTournament = async (req, res, next) => {
    try {
        const {
            name, type, category, subCategory, description,
            scope, genderType, isPaid, prize1, prize2, prize3, contactPhone,
            minPlayers, maxPlayers,
            setsPerMatch, advantageScoring, matchesBeforePlayoff, playoffQualifiers,
            location, city,
            surface, isIndoor,
            eventDate, eventTime, eventEndDate, eventEndTime,
            startDate, startTime, endDate, endTime,
        } = req.body;
        const tournament = await prisma.tournament.create({
            data: {
                name,
                type: type || '1',
                category,
                subCategory,
                description: description || null,
                scope: scope || 'YEREL',
                genderType: genderType || 'MIX',
                isPaid: isPaid === true,
                prize1: prize1 || null,
                prize2: prize2 || null,
                prize3: prize3 || null,
                contactPhone: contactPhone || null,
                minPlayers: minPlayers ? parseInt(minPlayers) : 2,
                setsPerMatch: setsPerMatch ? parseInt(setsPerMatch) : null,
                advantageScoring: advantageScoring !== false,
                matchesBeforePlayoff: matchesBeforePlayoff ? parseInt(matchesBeforePlayoff) : null,
                playoffQualifiers: playoffQualifiers ? parseInt(playoffQualifiers) : null,
                maxPlayers: maxPlayers ? parseInt(maxPlayers) : 32,
                location: location || null,
                city: city || null,
                surface: surface || null,
                isIndoor: isIndoor === true,
                eventDate: eventDate ? new Date(eventDate) : null,
                eventTime: eventTime || null,
                eventEndDate: eventEndDate ? new Date(eventEndDate) : null,
                eventEndTime: eventEndTime || null,
                startDate: startDate ? new Date(startDate) : null,
                startTime: startTime || null,
                endDate: endDate ? new Date(endDate) : null,
                endTime: endTime || null,
                creatorId: req.userId,
                status: 'OPEN',
            },
            include: {
                creator: { select: { id: true, username: true, fullName: true } },
                _count: { select: { participants: { where: { status: 'ACCEPTED' } } } },
            },
        });
        res.status(201).json(tournament);
    } catch (e) { next(e); }
};

export const getTournaments = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const where = { status: { notIn: ['CANCELLED', 'COMPLETED'] } };
        if (category)    where.category    = category;
        if (subCategory) where.subCategory = subCategory;

        const myId = req.userId;
        const tournaments = await prisma.tournament.findMany({
            where,
            include: {
                creator: { select: { id: true, username: true, fullName: true } },
                _count:  { select: { participants: { where: { status: 'ACCEPTED' } } } },
                participants: { where: { userId: myId }, select: { userId: true, status: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(tournaments);
    } catch (e) { next(e); }
};

export const joinTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { note } = req.body;

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.status !== 'OPEN') return res.status(400).json({ message: 'Tournament is not open for join requests' });

        const existing = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });
        if (existing) return res.status(400).json({ message: 'You already sent a join request' });

        const isCreator = tournament.creatorId === req.userId;
        const participant = await prisma.tournamentParticipant.create({
            data: { tournamentId: id, userId: req.userId, note, status: isCreator ? 'ACCEPTED' : 'PENDING' },
            include: { user: { select: { id: true, username: true, fullName: true } } },
        });

        if (!isCreator) {
            await createNotification(
                tournament.creatorId,
                'TOURNAMENT_JOIN',
                '🎾 New Join Request',
                `${participant.user.fullName || participant.user.username} wants to join "${tournament.name}"`,
                { tournamentId: id, userId: req.userId, category: tournament.category.toLowerCase(), subCategory: tournament.subCategory },
            );
        }

        res.status(201).json(participant);
    } catch (e) { next(e); }
};

export const getJoinRequests = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not your tournament' });

        const requests = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id },
            include: {
                user: {
                    select: {
                        id: true, username: true, fullName: true, avatar: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { skillRating: true, level: true },
                        },
                    },
                },
            },
            orderBy: { createdAt: 'asc' },
        });
        res.json(requests);
    } catch (e) { next(e); }
};

export const updateJoinRequest = async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        const { status } = req.body; // ACCEPTED | REJECTED

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not your tournament' });

        const updated = await prisma.tournamentParticipant.update({
            where: { tournamentId_userId: { tournamentId: id, userId } },
            data: { status },
            include: { user: { select: { id: true, username: true } } },
        });
        res.json(updated);
    } catch (e) { next(e); }
};

export const cancelJoin = async (req, res, next) => {
    try {
        const { id } = req.params;

        const existing = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });
        if (!existing) return res.status(404).json({ message: 'Not registered' });

        const wasAccepted = existing.status === 'ACCEPTED';

        await prisma.tournamentParticipant.delete({
            where: { tournamentId_userId: { tournamentId: id, userId: req.userId } },
        });

        // Freed an accepted slot → promote first PENDING in queue
        if (wasAccepted) {
            const nextUp = await prisma.tournamentParticipant.findFirst({
                where: { tournamentId: id, status: 'PENDING' },
                orderBy: { createdAt: 'asc' },
            });
            if (nextUp) {
                await prisma.tournamentParticipant.update({
                    where: { tournamentId_userId: { tournamentId: id, userId: nextUp.userId } },
                    data: { status: 'ACCEPTED' },
                });
                const tourn = await prisma.tournament.findUnique({
                    where: { id },
                    select: { name: true, category: true, subCategory: true },
                });
                await createNotification(
                    nextUp.userId,
                    'TOURNAMENT_JOIN_ACCEPTED',
                    '🎉 Turnuvaya Kabul Edildiniz',
                    `"${tourn.name}" turnuvasına yedek listesinden kabul edildiniz`,
                    { tournamentId: id, category: tourn.category.toLowerCase(), subCategory: tourn.subCategory },
                );
            }
        }

        res.json({ message: 'Registration cancelled' });
    } catch (e) { next(e); }
};

export const requestCancellation = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        const user = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { fullName: true, username: true },
        });

        await createNotification(
            tournament.creatorId,
            'CANCELLATION_REQUEST',
            '⚠️ Late Cancellation Request',
            `${user.fullName || user.username} wants to cancel their registration for "${tournament.name}" (less than 24h before start)`,
            { tournamentId: id, userId: req.userId, category: tournament.category.toLowerCase(), subCategory: tournament.subCategory },
        );
        res.json({ message: 'Cancellation request sent to creator' });
    } catch (e) { next(e); }
};

export const updateTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { minPlayers, maxPlayers, setsPerMatch, advantageScoring, matchesBeforePlayoff, playoffQualifiers,
                eventDate, eventTime, eventEndDate, eventEndTime } = req.body;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });
        const updated = await prisma.tournament.update({
            where: { id },
            data: {
                ...(minPlayers           !== undefined && { minPlayers: parseInt(minPlayers) }),
                ...(maxPlayers           !== undefined && { maxPlayers: parseInt(maxPlayers) }),
                ...(setsPerMatch         !== undefined && { setsPerMatch: setsPerMatch ? parseInt(setsPerMatch) : null }),
                ...(advantageScoring     !== undefined && { advantageScoring: advantageScoring === true }),
                ...(matchesBeforePlayoff !== undefined && { matchesBeforePlayoff: matchesBeforePlayoff ? parseInt(matchesBeforePlayoff) : null }),
                ...(playoffQualifiers    !== undefined && { playoffQualifiers: playoffQualifiers ? parseInt(playoffQualifiers) : null }),
                ...(eventDate    !== undefined && { eventDate:    eventDate ? new Date(eventDate) : null }),
                ...(eventTime    !== undefined && { eventTime:    eventTime || null }),
                ...(eventEndDate !== undefined && { eventEndDate: eventEndDate ? new Date(eventEndDate) : null }),
                ...(eventEndTime !== undefined && { eventEndTime: eventEndTime || null }),
            },
        });
        res.json(updated);
    } catch (e) { next(e); }
};

export const deleteTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId && !req.isAdmin) return res.status(403).json({ message: 'Not authorized' });
        await prisma.tournament.delete({ where: { id } });
        res.json({ message: 'Tournament deleted' });
    } catch (e) { next(e); }
};

export const completeTournament = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { bracketData } = req.body; // full bracket JSON from frontend

        const tournament = await prisma.tournament.findUnique({ where: { id } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });
        if (tournament.creatorId !== req.userId) return res.status(403).json({ message: 'Not authorized' });

        // Snapshot current ratings of all accepted participants
        const accepted = await prisma.tournamentParticipant.findMany({
            where: { tournamentId: id, status: 'ACCEPTED' },
            include: {
                user: {
                    select: {
                        id: true, username: true, fullName: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { totalPoints: true, skillRating: true },
                        },
                    },
                },
            },
        });

        const ratingSnapshot = {};
        for (const p of accepted) {
            const interest = p.user.interests[0];
            ratingSnapshot[p.userId] = {
                username: p.user.username,
                fullName: p.user.fullName,
                totalPoints: interest?.totalPoints ?? 0,
                skillRating: interest?.skillRating ?? 0,
            };
        }

        const updated = await prisma.tournament.update({
            where: { id },
            data: {
                status: 'COMPLETED',
                bracketData,
                ratingSnapshot,
                completedAt: new Date(),
                city: tournament.location ? tournament.location.split('/')[0].trim() : null,
            },
        });

        res.json(updated);
    } catch (e) { next(e); }
};

export const getArchivedTournaments = async (req, res, next) => {
    try {
        const { category, subCategory, city, dateFrom, dateTo } = req.query;
        const myId = req.userId;

        const where = {
            status: 'COMPLETED',
            ...(category    && { category }),
            ...(subCategory && { subCategory }),
            ...(city        && { OR: [
                { city:     { contains: city, mode: 'insensitive' } },
                { location: { contains: city, mode: 'insensitive' } },
            ]}),
            ...(dateFrom && { completedAt: { gte: new Date(dateFrom) } }),
            ...(dateTo   && { completedAt: { lte: new Date(dateTo) } }),
        };

        const all = await prisma.tournament.findMany({
            where,
            include: {
                creator:      { select: { id: true, username: true, fullName: true } },
                participants: { where: { userId: myId }, select: { userId: true } },
            },
            orderBy: { completedAt: 'desc' },
        });

        const mine = all.filter(t => t.creatorId === myId || t.participants.length > 0);
        res.json(mine);
    } catch (e) { next(e); }
};
