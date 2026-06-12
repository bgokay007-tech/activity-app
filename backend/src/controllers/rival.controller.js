import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';

// Fixed transfer lookup based on rating gap + score dominance
// ratingDiff = |loserRating - winnerRating| (0–5 scale, 1 rating pt = 20 totalPoints)
// dominant = winner took >65% of all games played across sets
//
// Gap ≥ 2.0 → dominant: 7  close: 6
// Gap 1.0–2.0 → dominant: 5  close: 4
// Gap 0.5–1.0 → dominant: 4  close: 3
// Gap 0.25–0.5 → dominant: 3  close: 2
// Gap < 0.25  → dominant: 2  close: 1
function calcTransfer(winnerPts, loserPts, score) {
    const ratingDiff = Math.abs(loserPts - winnerPts) / 20; // 20 pts = 1.0 rating

    let dominant = true; // default when no score available
    if (score && Array.isArray(score.sets) && score.sets.length > 0) {
        const side = score.winner;
        let winnerGames = 0, totalGames = 0;
        for (const set of score.sets) {
            const s = Number(set.sender)   || 0;
            const o = Number(set.opponent) || 0;
            winnerGames += side === 'sender' ? s : o;
            totalGames  += s + o;
        }
        dominant = totalGames === 0 || (winnerGames / totalGames) > 0.65;
    }

    if (ratingDiff >= 2.0) return dominant ? 7 : 6;
    if (ratingDiff >= 1.0) return dominant ? 5 : 4;
    if (ratingDiff >= 0.5) return dominant ? 4 : 3;
    if (ratingDiff >= 0.25) return dominant ? 3 : 2;
    return dominant ? 2 : 1;
}

async function applyCompetitivePoints(request, winnerUserId) {
    const participants  = Array.isArray(request.participants) ? request.participants : [];
    const senderTeamArr = Array.isArray(request.senderTeam)  ? request.senderTeam  : [];

    // For COMPETITIVE team matches (football with senderTeam), apply team ELO
    const isTeamMatch = senderTeamArr.length > 0;

    let winnerIds, loserIds;
    if (isTeamMatch) {
        const creatorTeam = [{ id: request.senderId }, ...senderTeamArr];
        const joiningTeam = participants; // opponent's team stored in participants after acceptance
        const senderWon = creatorTeam.some(m => m.id === winnerUserId);
        winnerIds = senderWon ? creatorTeam.map(m => m.id) : joiningTeam.map(m => m.id);
        loserIds  = senderWon ? joiningTeam.map(m => m.id) : creatorTeam.map(m => m.id);
    } else {
        winnerIds = [winnerUserId];
        loserIds  = [{ id: request.senderId }, ...participants]
            .filter(p => p.id !== winnerUserId)
            .map(p => p.id);
    }

    const allIds = [...new Set([...winnerIds, ...loserIds])];
    const interests = await prisma.userInterest.findMany({
        where: { userId: { in: allIds }, category: request.category, subCategory: request.subCategory },
    });

    const winnerInterests = interests.filter(i => winnerIds.includes(i.userId));
    const loserInterests  = interests.filter(i => loserIds.includes(i.userId));
    if (!winnerInterests.length || !loserInterests.length) return [];

    const avgWinnerPts = winnerInterests.reduce((s, i) => s + i.totalPoints, 0) / winnerInterests.length;
    const avgLoserPts  = loserInterests.reduce((s, i) => s + i.totalPoints, 0)  / loserInterests.length;
    const transfer = calcTransfer(avgWinnerPts, avgLoserPts, request.score);

    const updates = [];
    for (const wi of winnerInterests) {
        updates.push(prisma.userInterest.update({
            where: { id: wi.id },
            data: {
                totalPoints: wi.totalPoints + transfer,
                wins: wi.wins + 1,
                skillRating: Math.min(5, parseFloat(((wi.totalPoints + transfer) / 100 * 5).toFixed(2))),
            },
        }));
    }
    for (const li of loserInterests) {
        updates.push(prisma.userInterest.update({
            where: { id: li.id },
            data: {
                totalPoints: Math.max(0, li.totalPoints - transfer),
                losses: li.losses + 1,
                skillRating: Math.max(0, parseFloat(((Math.max(0, li.totalPoints - transfer)) / 100 * 5).toFixed(2))),
            },
        }));
    }
    await Promise.all(updates);

    return [
        ...winnerInterests.map(wi => ({ userId: wi.userId, change: +transfer })),
        ...loserInterests.map(li => ({ userId: li.userId, change: -transfer })),
    ];
}

const SENDER_SELECT = {
    id: true, username: true, fullName: true, avatar: true,
};

const REQUIRED_PARTICIPANTS = { SINGLE: 1, DOUBLE: 3 };

function getRequired(request) {
    if (request.matchType === 'PLAYER_WANTED') return Number(request.levelDetail) || 999;
    if (request.teamSize > 1) return 1; // volleyball: 1 opponent rep
    return REQUIRED_PARTICIPANTS[request.matchType] || 1;
}

export const getCountsBySubCategory = async (req, res, next) => {
    try {
        const { category } = req.query;
        const where = { status: 'OPEN', ...(category && { category }) };
        const rows = await prisma.activityRequest.groupBy({
            by: ['subCategory'],
            where,
            _count: { id: true },
        });
        const counts = {};
        rows.forEach(r => { counts[r.subCategory] = r._count.id; });
        res.json(counts);
    } catch (error) { next(error); }
};

export const createRivalRequest = async (req, res, next) => {
    try {
        const {
            category, subCategory, message, level, levelDetail,
            location, courtName, courtAddress, courtLat, courtLng,
            isCourtReserved, flexibleSchedule, matchDate, matchTime,
            matchType = 'SINGLE', matchMode = 'PRACTICE',
            surface, teamSize = 1,
            senderTeam, // COMPETITIVE football: [{id,username,fullName,skillRating}]
            positions,  // e.g. ['REFEREE'] | ['REFEREE_OFFER']
            refereePayment,
        } = req.body;

        const request = await prisma.activityRequest.create({
            data: {
                senderId: req.userId,
                category,
                subCategory,
                message,
                level,
                levelDetail,
                location,
                courtName,
                courtAddress,
                courtLat: courtLat ? Number(courtLat) : null,
                courtLng: courtLng ? Number(courtLng) : null,
                isCourtReserved: isCourtReserved || false,
                flexibleSchedule: flexibleSchedule || false,
                expiresAt: flexibleSchedule ? new Date(Date.now() + 24 * 60 * 60 * 1000) : null,
                matchDate: matchDate ? new Date(matchDate) : null,
                matchTime,
                matchType: matchType.toUpperCase(),
                matchMode: matchMode.toUpperCase(),
                ...(surface && { surface: surface.toUpperCase() }),
                teamSize: Number(teamSize) || 1,
                ...(req.body.duration && { duration: Number(req.body.duration) }),
                participants: [],
                senderTeam: Array.isArray(senderTeam) ? senderTeam : [],
                positions: Array.isArray(positions) ? positions : [],
                ...(refereePayment && { refereePayment }),
                status: 'OPEN',
            },
            include: { sender: { select: SENDER_SELECT } },
        });

        res.status(201).json(request);

        // Auto-submit venue for admin review if courtName + location provided
        if (courtName && location) {
            try {
                const sport = subCategory || 'general';
                const existing = await prisma.court.findFirst({
                    where: { name: { equals: courtName, mode: 'insensitive' }, city: { contains: location.split('/')[0].trim(), mode: 'insensitive' } },
                });
                if (!existing) {
                    const court = await prisma.court.create({
                        data: {
                            name: courtName,
                            address: courtAddress || null,
                            city: location,
                            sport,
                            lat: courtLat ? Number(courtLat) : null,
                            lng: courtLng ? Number(courtLng) : null,
                            addedBy: req.userId,
                            verified: false,
                            pending: true,
                        },
                    });
                    // Notify all admins
                    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
                    const submitter = request.sender;
                    for (const admin of admins) {
                        await createNotification(
                            admin.id,
                            'VENUE_SUBMISSION',
                            '🏟️ New Venue Submitted',
                            `${submitter?.fullName || submitter?.username} submitted "${courtName}" in ${location} for review.`,
                            { courtId: court.id, courtName, location, sport }
                        );
                    }
                }
            } catch (venueErr) {
                console.error('Venue auto-submit error:', venueErr);
            }
        }
    } catch (error) {
        next(error);
    }
};

export const getRivalRequests = async (req, res, next) => {
    try {
        const { category, subCategory, matchType } = req.query;

        // Auto-cancel OPEN listings whose match time has already passed
        const now = new Date();
        const expiryCandidates = await prisma.activityRequest.findMany({
            where: { status: 'OPEN', matchDate: { lte: now }, matchTime: { not: null } },
            select: { id: true, matchDate: true, matchTime: true },
        });
        const expiredOpenIds = expiryCandidates
            .filter(r => {
                if (!r.matchTime || !r.matchDate) return false;
                const parts = r.matchTime.split(':');
                if (parts.length < 2) return false;
                const [h, m] = parts.map(Number);
                const d = new Date(r.matchDate);
                d.setUTCHours(h, m, 0, 0);
                return now > d;
            })
            .map(r => r.id);
        if (expiredOpenIds.length > 0) {
            await prisma.activityRequest.updateMany({
                where: { id: { in: expiredOpenIds } },
                data: { status: 'CANCELLED' },
            });
        }

        const requests = await prisma.activityRequest.findMany({
            where: {
                ...(category    && { category }),
                ...(subCategory && { subCategory }),
                ...(matchType   && { matchType: matchType.toUpperCase() }),
                status: 'OPEN',
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } },
                ],
            },
            include: {
                sender: {
                    select: {
                        ...SENDER_SELECT,
                        interests: {
                            where: { ...(category && { category }), ...(subCategory && { subCategory }) },
                            select: { level: true, skillRating: true, totalPoints: true, wins: true, losses: true },
                        },
                    },
                },
                joinRequests: {
                    where: { status: 'PENDING' },
                    include: {
                        user: {
                            select: {
                                ...SENDER_SELECT,
                                interests: {
                                    where: {
                                        ...(category    && { category }),
                                        ...(subCategory && { subCategory }),
                                    },
                                    select: { level: true, skillRating: true, totalPoints: true, wins: true, losses: true },
                                },
                            },
                        },
                        // Include joiningTeam so creator can see challenger's team
                    },
                    // joiningTeam is returned automatically as it's a scalar field on RivalJoinRequest
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });

        // Mark each rival with current user's own join request status
        const myJoinReqs = await prisma.rivalJoinRequest.findMany({
            where: { userId: req.userId, rivalId: { in: requests.map(r => r.id) } },
            select: { rivalId: true, status: true },
        });
        const myJoinMap = Object.fromEntries(myJoinReqs.map(j => [j.rivalId, j.status]));

        res.json(requests.map(r => ({
            ...r,
            _myJoinStatus: myJoinMap[r.id] || null, // 'PENDING' | 'ACCEPTED' | 'REJECTED' | null
        })));
    } catch (error) {
        next(error);
    }
};

// Send a join request (pending — creator must accept)
export const sendJoinRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.status !== 'OPEN') return res.status(400).json({ message: 'This request is no longer open' });
        if (request.senderId === req.userId) return res.status(400).json({ message: 'You cannot join your own request' });

        const existing = await prisma.rivalJoinRequest.findUnique({
            where: { rivalId_userId: { rivalId: id, userId: req.userId } },
        });
        if (existing) return res.status(400).json({ message: 'You already sent a request', status: existing.status });

        const joiningTeam = Array.isArray(req.body.joiningTeam) ? req.body.joiningTeam : [];
        await prisma.rivalJoinRequest.create({ data: { rivalId: id, userId: req.userId, joiningTeam } });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: SENDER_SELECT });

        // Push updated rival data (with new join request) to the creator in real-time
        const updatedRival = await prisma.activityRequest.findUnique({
            where: { id },
            include: {
                sender: { select: { ...SENDER_SELECT, interests: { select: { level: true, totalPoints: true, wins: true, losses: true } } } },
                joinRequests: { where: { status: 'PENDING' }, include: { user: { select: { ...SENDER_SELECT, interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true } } } } } },
            },
        });
        emitToUser(request.senderId, 'rivalUpdate', updatedRival);

        // Notify the match creator
        await createNotification(
            request.senderId,
            'JOIN_REQUEST',
            '⚔️ New Join Request',
            `${me.fullName || me.username} wants to join your ${request.matchType === 'DOUBLE' ? 'double' : 'single'} match in ${request.subCategory}.`,
            { rivalId: id, fromUserId: req.userId, fromUsername: me.username, category: request.category.toLowerCase(), subCategory: request.subCategory }
        );

        res.status(201).json({ message: '✓ Join request sent! Waiting for the organizer to accept.' });
    } catch (error) { next(error); }
};

// Creator accepts or rejects a join request
export const respondToJoin = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const { action } = req.body; // 'accept' | 'reject'

        const joinReq = await prisma.rivalJoinRequest.findUnique({
            where: { id: requestId },
            include: {
                user: { select: SENDER_SELECT },
                rival: true,
            },
        });
        if (!joinReq) return res.status(404).json({ message: 'Not found' });
        if (joinReq.rival.senderId !== req.userId) return res.status(403).json({ message: 'Forbidden' });

        await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: action === 'accept' ? 'ACCEPTED' : 'REJECTED' } });

        if (action !== 'accept') return res.json({ message: 'Request rejected.' });

        // Build participants: for COMPETITIVE team football with joiningTeam, use the full joining team;
        // otherwise fall back to single-player addition
        const rival = joinReq.rival;
        const joiningTeam = Array.isArray(joinReq.joiningTeam) ? joinReq.joiningTeam : [];
        const isTeamJoin = rival.matchMode === 'COMPETITIVE' && joiningTeam.length > 0;

        const u = joinReq.user;
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const updatedParticipants = isTeamJoin
            ? joiningTeam  // full opponent team replaces participants
            : [...participants, { id: u.id, username: u.username, fullName: u.fullName, avatar: u.avatar }];
        const required = getRequired(rival);
        const isFull = updatedParticipants.length >= required;

        const updated = await prisma.activityRequest.update({
            where: { id: rival.id },
            data: {
                participants: updatedParticipants,
                status: isFull ? 'MATCHED' : 'OPEN',
                receiverId: isFull ? u.id : rival.receiverId,
            },
            include: {
                sender: { select: SENDER_SELECT },
                joinRequests: {
                    where: { status: 'PENDING' },
                    include: {
                        user: {
                            select: {
                                ...SENDER_SELECT,
                                interests: {
                                    select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        // Push updated rival to creator's UI
        emitToUser(rival.senderId, 'rivalUpdate', updated);
        // Also notify all participants of the match status
        if (isFull) {
            updatedParticipants.forEach(p => emitToUser(p.id, 'rivalUpdate', updated));
        }

        // Notify the accepted player
        await createNotification(
            u.id,
            'MATCH_CONFIRMED',
            isFull ? '🎉 Match confirmed!' : '✓ Join request accepted!',
            isFull
                ? `Your request to join ${rival.sender?.username || ''}'s match was accepted. Match is full!`
                : `Your request to join a match was accepted.`,
            { rivalId: rival.id, category: rival.category.toLowerCase(), subCategory: rival.subCategory }
        );

        res.json({
            message: isFull ? '🎉 Match is full!' : `✓ Accepted!`,
            request: updated,
            matched: isFull,
        });
    } catch (error) { next(error); }
};

// Kept for backward compat — now just an alias for sendJoinRequest
export const respondToRival = sendJoinRequest;

const getMatchDeadline = (match) => {
    if (!match.matchDate || !match.matchTime) return null;
    const [h, m] = match.matchTime.split(':').map(Number);
    const d = new Date(match.matchDate);
    d.setHours(h, m, 0, 0);
    return new Date(d.getTime() + ((match.duration || 90) + 24 * 60) * 60 * 1000);
};

export const getUpcomingMatches = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;

        const matches = await prisma.activityRequest.findMany({
            where: {
                status: 'MATCHED',
                ...(category    && { category }),
                ...(subCategory && { subCategory }),
            },
            include: { sender: { select: SENDER_SELECT } },
            orderBy: { matchDate: 'asc' },
        });

        // Auto-void: delete unscored matches whose 24h window has passed
        const now = new Date();
        const expired = matches.filter(m => {
            const dl = getMatchDeadline(m);
            return dl && now > dl && !m.score;
        });
        if (expired.length > 0) {
            await prisma.activityRequest.deleteMany({ where: { id: { in: expired.map(m => m.id) } } });
        }

        const active = matches.filter(m => !expired.find(e => e.id === m.id));

        // Enrich with skill ratings — isolated so failure doesn't break the main response
        try {
            const allUserIds = [...new Set([
                ...active.map(m => m.senderId),
                ...active.flatMap(m => (Array.isArray(m.participants) ? m.participants : []).map(p => p.id)),
            ].filter(Boolean))];

            const interests = allUserIds.length > 0
                ? await prisma.userInterest.findMany({
                    where: { userId: { in: allUserIds } },
                    select: { userId: true, subCategory: true, skillRating: true },
                })
                : [];

            const enriched = active.map(m => ({
                ...m,
                senderSkillRating: interests.find(i => i.userId === m.senderId && i.subCategory === m.subCategory)?.skillRating ?? null,
                participants: (Array.isArray(m.participants) ? m.participants : []).map(p => ({
                    ...p,
                    skillRating: interests.find(i => i.userId === p.id && i.subCategory === m.subCategory)?.skillRating ?? null,
                })),
            }));

            return res.json(enriched);
        } catch (_) {
            return res.json(active);
        }
    } catch (error) {
        next(error);
    }
};

export const getMatchComments = async (req, res, next) => {
    try {
        const { id } = req.params;
        const comments = await prisma.matchComment.findMany({
            where: { rivalId: id },
            include: { user: { select: { id: true, username: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(comments);
    } catch (error) { next(error); }
};

export const addMatchComment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        if (!content?.trim()) return res.status(400).json({ message: 'Content required' });
        const match = await prisma.activityRequest.findUnique({ where: { id }, select: { id: true } });
        if (!match) return res.status(404).json({ message: 'Match not found' });
        const comment = await prisma.matchComment.create({
            data: { rivalId: id, userId: req.userId, content: content.trim() },
            include: { user: { select: { id: true, username: true, avatar: true } } },
        });
        res.status(201).json(comment);
    } catch (error) { next(error); }
};

export const deleteMatchComment = async (req, res, next) => {
    try {
        const { commentId } = req.params;
        const comment = await prisma.matchComment.findUnique({
            where: { id: commentId },
            include: { rival: { select: { senderId: true, participants: true } } },
        });
        if (!comment) return res.status(404).json({ message: 'Not found' });
        const myId = req.userId;
        const parts = Array.isArray(comment.rival?.participants) ? comment.rival.participants : [];
        const isAuthor = comment.userId === myId;
        const isParticipant = comment.rival?.senderId === myId || parts.some(p => p.id === myId);
        if (!isAuthor && !isParticipant) return res.status(403).json({ message: 'Forbidden' });
        await prisma.matchComment.delete({ where: { id: commentId } });
        res.json({ deleted: true });
    } catch (error) { next(error); }
};

export const abandonMatch = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason, newDate, newTime, newLocation, partialSets } = req.body;

        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        const parts = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || parts.some(p => p.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        if (reason === 'other') {
            await prisma.activityRequest.update({
                where: { id },
                data: {
                    score: { sets: [], winner: 'draw' },
                    status: 'COMPLETED',
                    scoreStatus: 'CONFIRMED',
                    scoreEnteredBy: req.userId,
                    completedAt: new Date(),
                    archived: true,
                },
            });
            return res.json({ message: 'Maç berabere sayıldı.' });
        }

        // reason === 'abandoned' → reschedule + optional partial score
        await prisma.activityRequest.update({
            where: { id },
            data: {
                ...(newDate     && { matchDate: new Date(newDate) }),
                ...(newTime     && { matchTime: newTime }),
                ...(newLocation && { location: newLocation }),
                ...(Array.isArray(partialSets) && partialSets.length > 0 && {
                    score: { sets: partialSets, winner: null, partial: true },
                }),
            },
        });
        res.json({ message: 'Maç yeniden planlandı.' });
    } catch (error) { next(error); }
};

export const enterScore = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { sets, winner } = req.body; // sets: [{sender, opponent}], winner: "sender"|"opponent"

        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        // Must be sender or a participant
        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                score: { sets, winner },
                status: 'COMPLETED',
                scoreStatus: 'PENDING',
                scoreEnteredBy: req.userId,
                completedAt: new Date(),
                // archived is intentionally not reset — auto-completed matches stay archived=true
            },
        });
        // Notify the opponent to confirm the score
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
        const opponents = request.senderId === req.userId
            ? participants
            : [{ id: request.senderId }];
        for (const opp of opponents) {
            await createNotification(
                opp.id, 'JOIN_REQUEST',
                '📊 Score submitted — confirm?',
                `${me.fullName || me.username} entered the match score. Please confirm or dispute.`,
                { rivalId: request.id, fromUserId: req.userId, category: request.category.toLowerCase(), subCategory: request.subCategory }
            );
        }

        res.json(updated);
    } catch (error) { next(error); }
};

export const confirmScore = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.scoreStatus !== 'PENDING') return res.status(400).json({ message: 'No pending score' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];

        const teamA = new Set([request.senderId, ...senderTeamArr.map(m => m.id)]);
        const teamB = new Set(participants.map(p => p.id));

        const confirmerInA = teamA.has(req.userId);
        const confirmerInB = teamB.has(req.userId);
        if (!confirmerInA && !confirmerInB) return res.status(403).json({ message: 'Forbidden' });

        const scorerInA = teamA.has(request.scoreEnteredBy);
        // Block: same team as scorer
        if (scorerInA && confirmerInA) return res.status(400).json({ message: 'Your team entered this score — wait for opponents to confirm' });
        if (!scorerInA && confirmerInB) return res.status(400).json({ message: 'Your team entered this score — wait for opponents to confirm' });

        await prisma.activityRequest.update({
            where: { id },
            data: { scoreStatus: 'CONFIRMED', archived: true, completedAt: new Date() },
        });

        // Snapshot ratings BEFORE ELO changes
        const allPlayerIds = [
            request.senderId,
            ...participants.map(p => p.id),
            ...senderTeamArr.map(m => m.id),
        ];
        const [interestsBefore, playersInfo] = await Promise.all([
            prisma.userInterest.findMany({
                where: { userId: { in: allPlayerIds }, category: request.category, subCategory: request.subCategory },
            }),
            prisma.user.findMany({
                where: { id: { in: allPlayerIds } },
                select: { id: true, username: true, fullName: true },
            }),
        ]);
        const userMap = Object.fromEntries(playersInfo.map(u => [u.id, u]));

        // ELO transfer for competitive matches — skip if draw
        let pointChanges = [];
        if (request.matchMode === 'COMPETITIVE' && request.score && request.score.winner !== 'draw') {
            const score = request.score;
            const participants = Array.isArray(request.participants) ? request.participants : [];
            const winnerUserId = score.winner === 'sender'
                ? request.senderId
                : (participants[0]?.id || request.receiverId);
            if (winnerUserId) {
                pointChanges = await applyCompetitivePoints(request, winnerUserId);
            }
        }

        // Build rating snapshot and store it in score JSON
        const ratingSnapshot = {};
        for (const i of interestsBefore) {
            const change = pointChanges.find(c => c.userId === i.userId);
            const ptsBefore = i.totalPoints;
            const ptsAfter = change ? Math.max(0, ptsBefore + change.change) : ptsBefore;
            ratingSnapshot[i.userId] = {
                username: userMap[i.userId]?.username || '',
                skillRating_before: i.skillRating,
                skillRating_after: parseFloat((Math.min(5, ptsAfter / 100 * 5)).toFixed(2)),
                change: change?.change || 0,
            };
        }
        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { score: { ...request.score, ratingSnapshot } },
        });

        // Notify the scorer
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        const eloMsg = pointChanges.length > 0
            ? ` Points have been updated based on match result.`
            : '';
        await createNotification(
            request.scoreEnteredBy, 'MATCH_CONFIRMED',
            '✅ Score confirmed!',
            `${me.username} confirmed the match score.${eloMsg}`,
            { rivalId: id, pointChanges, category: request.category.toLowerCase(), subCategory: request.subCategory }
        );
        emitToUser(request.scoreEnteredBy, 'rivalUpdate', updated);

        res.json(updated);
    } catch (error) { next(error); }
};

export const extendScoreDeadline = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { hours } = req.body;

        const ALLOWED = [24, 48, 72, 96, 120];
        if (!ALLOWED.includes(Number(hours))) {
            return res.status(400).json({ message: 'Invalid extension. Choose 24, 48, 72, 96 or 120 hours.' });
        }

        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.status !== 'COMPLETED') return res.status(400).json({ message: 'Match is not completed yet' });
        if (request.scoreStatus !== 'NONE') return res.status(400).json({ message: 'Score already entered or confirmed' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        // Push completedAt forward so auto-draw job won't fire for `hours` from now
        // Job fires when completedAt <= now - 24h
        // So set completedAt = now + (hours - 24)h → triggers after `hours` total
        const newCompletedAt = new Date(Date.now() + (Number(hours) - 24) * 60 * 60 * 1000);

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { completedAt: newCompletedAt },
        });

        // Notify all participants
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
        const allIds = [...new Set([request.senderId, ...participants.map(p => p.id)])];
        for (const uid of allIds) {
            emitToUser(uid, 'rivalUpdate', updated);
            if (uid !== req.userId) {
                await createNotification(
                    uid,
                    'MATCH_CONFIRMED',
                    `⏱️ Score deadline extended by ${hours}h`,
                    `${me.fullName || me.username} extended the score entry window by ${hours} hours.`,
                    { rivalId: id, category: request.category.toLowerCase(), subCategory: request.subCategory }
                );
            }
        }

        res.json({ message: `✓ Deadline extended by ${hours} hours.`, completedAt: newCompletedAt });
    } catch (error) { next(error); }
};

export const disputeScore = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { scoreStatus: 'DISPUTED' },
        });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });

        // Notify the scorer of the dispute
        await createNotification(
            request.scoreEnteredBy, 'JOIN_REQUEST',
            '⚠️ Score disputed!',
            `${me.username} disputed the score${reason ? `: ${reason}` : '.'}`,
            { rivalId: id, disputed: true, category: request.category.toLowerCase(), subCategory: request.subCategory }
        );

        // Notify both players about admin report option
        const participants = Array.isArray(request.participants) ? request.participants : [];
        const allPlayers = [{ id: request.senderId }, ...participants].filter(p => p.id !== req.userId);
        for (const p of allPlayers) {
            emitToUser(p.id, 'rivalUpdate', updated);
        }
        emitToUser(req.userId, 'rivalUpdate', updated);

        res.json(updated);
    } catch (error) { next(error); }
};

export const reportDispute = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });

        // For now, notify both players that admin report was filed
        const participants = Array.isArray(request.participants) ? request.participants : [];
        const allIds = [request.senderId, ...participants.map(p => p.id)];
        for (const uid of allIds) {
            await createNotification(
                uid, 'JOIN_REQUEST',
                '📋 Admin report filed',
                `${me.username} reported the score dispute${reason ? `: ${reason}` : '.'}. An admin will review this.`,
                { rivalId: id, adminReport: true, category: request.category.toLowerCase(), subCategory: request.subCategory }
            );
        }

        res.json({ message: 'Report filed. An admin will review.' });
    } catch (error) { next(error); }
};

export const archiveMatch = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.senderId !== req.userId) return res.status(403).json({ message: 'Forbidden' });

        await prisma.activityRequest.update({ where: { id }, data: { archived: true } });
        res.json({ message: 'Archived' });
    } catch (error) { next(error); }
};

export const getCompletedMatches = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const all = await prisma.activityRequest.findMany({
            where: {
                ...(category    && { category }),
                ...(subCategory && { subCategory }),
                status: 'COMPLETED',
                scoreStatus: { not: 'CONFIRMED' },
            },
            include: { sender: { select: SENDER_SELECT } },
            orderBy: { completedAt: 'desc' },
            take: 20,
        });
        // Filter to only matches the user is involved in
        const myId = req.userId;
        const result = all.filter(r => {
            if (r.senderId === myId || r.receiverId === myId) return true;
            const parts = Array.isArray(r.participants) ? r.participants : [];
            return parts.some(p => p.id === myId);
        });
        res.json(result);
    } catch (error) { next(error); }
};

export const getArchivedMatchesBySport = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const all = await prisma.activityRequest.findMany({
            where: {
                ...(category    && { category }),
                ...(subCategory && { subCategory }),
                status: 'COMPLETED',
                archived: true,
            },
            include: { sender: { select: SENDER_SELECT } },
            orderBy: { completedAt: 'desc' },
        });
        const myId = req.userId;
        const result = all.filter(r => {
            if (r.senderId === myId || r.receiverId === myId) return true;
            const parts = Array.isArray(r.participants) ? r.participants : [];
            return parts.some(p => p.id === myId);
        });
        res.json(result);
    } catch (error) { next(error); }
};

export const cancelRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({
            where: { id },
            include: {
                sender: { select: { id: true, username: true, fullName: true } },
                joinRequests: { select: { userId: true } },
            },
        });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.senderId !== req.userId) return res.status(403).json({ message: 'Forbidden' });

        await prisma.activityRequest.update({ where: { id }, data: { status: 'CANCELLED' } });

        // Notify all join requesters and accepted participants
        const senderName = request.sender?.username || 'İlan sahibi';
        const notifyIds = new Set(request.joinRequests.map(jr => jr.userId));
        const parts = Array.isArray(request.participants) ? request.participants : [];
        for (const p of parts) notifyIds.add(p.id);
        notifyIds.delete(req.userId);

        for (const uid of notifyIds) {
            await createNotification(uid, 'MATCH_CANCELLED',
                '❌ İlan İptal Edildi',
                `${senderName} ilanı iptal etti.`,
                { rivalId: id, subCategory: request.subCategory }
            );
        }

        res.json({ message: 'Cancelled' });
    } catch (error) { next(error); }
};

export const cancelMatch = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { mutual = false } = req.body;

        const request = await prisma.activityRequest.findUnique({
            where: { id },
            include: { sender: { select: { id: true, username: true, fullName: true } } },
        });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.status !== 'MATCHED') return res.status(400).json({ message: 'Not a matched listing' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        const allPlayerIds = [request.senderId, ...participants.map(p => p.id)];
        const otherPlayerIds = allPlayerIds.filter(uid => uid !== req.userId);

        // Penalty window: 5 hours before match start
        let withinPenaltyWindow = false;
        if (request.matchDate && request.matchTime) {
            const [h, m] = request.matchTime.split(':').map(Number);
            const matchStart = new Date(request.matchDate);
            matchStart.setUTCHours(h, m, 0, 0);
            const hoursUntil = (matchStart - new Date()) / (1000 * 60 * 60);
            withinPenaltyWindow = hoursUntil > 0 && hoursUntil <= 5;
        }

        if (mutual) {
            const mutualReqs = Array.isArray(request.mutualCancelRequests) ? [...request.mutualCancelRequests] : [];
            if (!mutualReqs.includes(req.userId)) mutualReqs.push(req.userId);

            const bothAgreed = allPlayerIds.every(uid => mutualReqs.includes(uid));

            if (bothAgreed) {
                await prisma.activityRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
                for (const uid of allPlayerIds) {
                    await createNotification(uid, 'MATCH_CANCELLED',
                        '🤝 Maç İptal Edildi',
                        'Maç karşılıklı anlaşmayla cezasız iptal edildi.',
                        { rivalId: id, subCategory: request.subCategory }
                    );
                }
                return res.json({ cancelled: true, mutual: true });
            }

            await prisma.activityRequest.update({ where: { id }, data: { mutualCancelRequests: mutualReqs } });
            const me = request.senderId === req.userId ? request.sender : (participants.find(p => p.id === req.userId) || { username: 'Rakip' });
            for (const uid of otherPlayerIds) {
                await createNotification(uid, 'MUTUAL_CANCEL_REQUEST',
                    '⚠️ Karşılıklı İptal İsteği',
                    `${me.username} maçı karşılıklı iptal etmek istiyor. Sen de onaylarsan cezasız iptal edilir.`,
                    { rivalId: id, subCategory: request.subCategory }
                );
            }
            return res.json({ cancelled: false, mutual: true, requested: true });
        }

        // Regular (unilateral) cancel
        await prisma.activityRequest.update({ where: { id }, data: { status: 'CANCELLED' } });

        if (withinPenaltyWindow) {
            const interest = await prisma.userInterest.findFirst({
                where: { userId: req.userId, category: request.category, subCategory: request.subCategory },
            });
            if (interest) {
                const newCount = interest.lateCancelCount + 1;
                await prisma.userInterest.update({
                    where: { id: interest.id },
                    data: {
                        skillRating: Math.max(0, parseFloat((interest.skillRating - 0.20).toFixed(2))),
                        totalPoints: Math.max(0, interest.totalPoints - 4),
                        lateCancelCount: newCount,
                    },
                });
                if (newCount === 5) {
                    await createNotification(req.userId, 'LATE_CANCEL_WARNING',
                        '⚠️ Son Dakika İptal Uyarısı',
                        `${request.subCategory} dalında 5 kez maçı son 5 saat içinde iptal ettiniz. Bu durum profilinizde görünür ve güvenilirliğinizi olumsuz etkiler.`,
                        { subCategory: request.subCategory }
                    );
                }
            }
        }

        const senderName = request.sender?.username || 'Rakip';
        for (const uid of otherPlayerIds) {
            await createNotification(uid, 'MATCH_CANCELLED',
                '❌ Maç İptal Edildi',
                withinPenaltyWindow
                    ? `${senderName} maçı son 5 saat içinde iptal etti (ceza uygulandı).`
                    : `${senderName} maçı iptal etti.`,
                { rivalId: id, subCategory: request.subCategory }
            );
        }

        res.json({ cancelled: true, penaltyApplied: withinPenaltyWindow });
    } catch (error) { next(error); }
};

export const getMyUpcomingMatches = async (req, res, next) => {
    try {
        const all = await prisma.activityRequest.findMany({
            where: { status: 'MATCHED' },
            include: { sender: { select: SENDER_SELECT } },
            orderBy: { matchDate: 'asc' },
        });
        const myId = req.userId;
        const mine = all.filter(r => {
            if (r.senderId === myId) return true;
            return (Array.isArray(r.participants) ? r.participants : []).some(p => p.id === myId);
        });

        try {
            const allUserIds = [...new Set([
                ...mine.map(m => m.senderId),
                ...mine.flatMap(m => (Array.isArray(m.participants) ? m.participants : []).map(p => p.id)),
            ].filter(Boolean))];
            const interests = allUserIds.length > 0
                ? await prisma.userInterest.findMany({
                    where: { userId: { in: allUserIds } },
                    select: { userId: true, subCategory: true, skillRating: true },
                }) : [];
            const enriched = mine.map(m => ({
                ...m,
                senderSkillRating: interests.find(i => i.userId === m.senderId && i.subCategory === m.subCategory)?.skillRating ?? null,
                participants: (Array.isArray(m.participants) ? m.participants : []).map(p => ({
                    ...p,
                    skillRating: interests.find(i => i.userId === p.id && i.subCategory === m.subCategory)?.skillRating ?? null,
                })),
            }));
            return res.json(enriched);
        } catch (_) {
            return res.json(mine);
        }
    } catch (error) { next(error); }
};

export const getMyMatchHistory = async (req, res, next) => {
    try {
        const all = await prisma.activityRequest.findMany({
            where: { status: 'COMPLETED' },
            include: { sender: { select: SENDER_SELECT } },
            orderBy: { completedAt: 'desc' },
            take: 100,
        });
        const myId = req.userId;
        const mine = all.filter(r => {
            if (r.senderId === myId || r.receiverId === myId) return true;
            return (Array.isArray(r.participants) ? r.participants : []).some(p => p.id === myId);
        });
        res.json(mine);
    } catch (error) { next(error); }
};

export const getMyRequests = async (req, res, next) => {
    try {
        const requests = await prisma.activityRequest.findMany({
            where: {
                OR: [
                    { senderId: req.userId },
                    { receiverId: req.userId },
                ],
            },
            include: {
                sender:   { select: SENDER_SELECT },
                receiver: { select: SENDER_SELECT },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    } catch (error) {
        next(error);
    }
};
