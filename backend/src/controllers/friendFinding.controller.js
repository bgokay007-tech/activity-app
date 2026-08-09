import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';
import { boundingBox, haversineKm } from '../utils/geo.js';
import { computeCompatibility } from '../utils/friendFindingScore.js';
import { getSeekingQuestion, getFriendFindingQuestions } from '../config/friendFindingQuestions.js';
import { generateCompatibilityProfile } from '../services/friendFindingAi.js';

const CANDIDATE_SELECT = { id: true, username: true, fullName: true, avatar: true, birthDate: true, city: true, gender: true, lat: true, lng: true };
const CARD_SELECT = { id: true, username: true, fullName: true, avatar: true };

function compatibleSeekings(mySeeking) {
    if (mySeeking === 'BOTH') return ['FRIENDS', 'PARTNER', 'BOTH'];
    return [mySeeking, 'BOTH'];
}

function ageFromBirthDate(birthDate) {
    if (!birthDate) return null;
    const diffMs = Date.now() - new Date(birthDate).getTime();
    return Math.floor(diffMs / (365.25 * 24 * 3600 * 1000));
}

export const updateLocation = async (req, res, next) => {
    try {
        const { lat, lng } = req.body;
        if (typeof lat !== 'number' || typeof lng !== 'number') {
            return res.status(400).json({ message: 'lat/lng required' });
        }
        await prisma.user.update({
            where: { id: req.userId },
            data: { lat, lng, locationUpdatedAt: new Date() },
        });
        res.json({ message: 'Location updated' });
    } catch (error) { next(error); }
};

export const getSeekingQuestionHandler = async (req, res) => {
    const { lang } = req.query;
    res.json({ question: getSeekingQuestion(lang || 'en') });
};

export const getSurveyQuestions = async (req, res) => {
    const { seeking, lang } = req.query;
    const questions = getFriendFindingQuestions(seeking || 'FRIENDS', lang || 'en');
    res.json({ seeking: seeking || 'FRIENDS', questions });
};

export const submitSurvey = async (req, res, next) => {
    try {
        const { seeking, answers, ageMin, ageMax, genderPref, maxDistanceKm } = req.body;
        if (!['FRIENDS', 'PARTNER', 'BOTH'].includes(seeking)) {
            return res.status(400).json({ message: 'Invalid seeking value' });
        }
        if (!answers || typeof answers !== 'object') {
            return res.status(400).json({ message: 'answers required' });
        }

        const aiProfile = await generateCompatibilityProfile(answers, seeking);

        const profile = await prisma.friendFindingProfile.upsert({
            where: { userId: req.userId },
            update: {
                seeking, answers, aiProfile, active: true,
                ...(ageMin !== undefined && { ageMin }),
                ...(ageMax !== undefined && { ageMax }),
                ...(genderPref !== undefined && { genderPref }),
                ...(maxDistanceKm !== undefined && { maxDistanceKm }),
            },
            create: {
                userId: req.userId, seeking, answers, aiProfile,
                ageMin: ageMin ?? null, ageMax: ageMax ?? null,
                genderPref: genderPref ?? [], maxDistanceKm: maxDistanceKm ?? 50,
            },
        });

        res.status(201).json({ ...profile, answers: undefined, aiProfile: undefined });
    } catch (error) { next(error); }
};

export const getMyProfile = async (req, res, next) => {
    try {
        const profile = await prisma.friendFindingProfile.findUnique({ where: { userId: req.userId } });
        if (!profile) return res.json(null);
        // Ham cevaplar ve AI özeti kendi profilinde bile UI'a taşınmaz — sadece tercihler/durum
        res.json({
            id: profile.id, seeking: profile.seeking, active: profile.active,
            ageMin: profile.ageMin, ageMax: profile.ageMax,
            genderPref: profile.genderPref, maxDistanceKm: profile.maxDistanceKm,
            createdAt: profile.createdAt,
        });
    } catch (error) { next(error); }
};

export const updatePrefs = async (req, res, next) => {
    try {
        const { active, ageMin, ageMax, genderPref, maxDistanceKm } = req.body;
        const profile = await prisma.friendFindingProfile.findUnique({ where: { userId: req.userId } });
        if (!profile) return res.status(404).json({ message: 'Complete the survey first' });

        const updated = await prisma.friendFindingProfile.update({
            where: { userId: req.userId },
            data: {
                ...(active !== undefined && { active }),
                ...(ageMin !== undefined && { ageMin }),
                ...(ageMax !== undefined && { ageMax }),
                ...(genderPref !== undefined && { genderPref }),
                ...(maxDistanceKm !== undefined && { maxDistanceKm }),
            },
        });
        res.json({ id: updated.id, seeking: updated.seeking, active: updated.active, ageMin: updated.ageMin, ageMax: updated.ageMax, genderPref: updated.genderPref, maxDistanceKm: updated.maxDistanceKm });
    } catch (error) { next(error); }
};

export const getCandidates = async (req, res, next) => {
    try {
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { lat: true, lng: true } });
        const myProfile = await prisma.friendFindingProfile.findUnique({ where: { userId: req.userId } });

        if (!myProfile) return res.status(400).json({ message: 'Complete the friend-finding survey first' });
        if (me.lat == null || me.lng == null) return res.status(400).json({ message: 'Location required' });

        const [blocks, swipes] = await Promise.all([
            prisma.block.findMany({ where: { OR: [{ blockerId: req.userId }, { blockedId: req.userId }] } }),
            prisma.friendFindingSwipe.findMany({ where: { swiperId: req.userId, decision: 'LIKE' }, select: { targetId: true } }),
        ]);
        const excludeIds = new Set([
            req.userId,
            ...blocks.map(b => (b.blockerId === req.userId ? b.blockedId : b.blockerId)),
            ...swipes.map(s => s.targetId),
        ]);

        const { minLat, maxLat, minLng, maxLng } = boundingBox(me.lat, me.lng, myProfile.maxDistanceKm);

        const rawCandidates = await prisma.user.findMany({
            where: {
                id: { notIn: [...excludeIds] },
                lat: { gte: minLat, lte: maxLat },
                lng: { gte: minLng, lte: maxLng },
                friendFindingProfile: {
                    is: { active: true, seeking: { in: compatibleSeekings(myProfile.seeking) } },
                },
            },
            select: { ...CANDIDATE_SELECT, friendFindingProfile: true },
            take: 200,
        });

        const scored = [];
        for (const c of rawCandidates) {
            const distanceKm = haversineKm(me.lat, me.lng, c.lat, c.lng);
            if (distanceKm > myProfile.maxDistanceKm) continue;

            const age = ageFromBirthDate(c.birthDate);
            if (myProfile.ageMin && age !== null && age < myProfile.ageMin) continue;
            if (myProfile.ageMax && age !== null && age > myProfile.ageMax) continue;
            const myPref = Array.isArray(myProfile.genderPref) ? myProfile.genderPref : [];
            if (myPref.length > 0 && c.gender && !myPref.includes(c.gender)) continue;

            const compatibility = computeCompatibility(
                myProfile.aiProfile, c.friendFindingProfile?.aiProfile,
                myProfile.seeking, c.friendFindingProfile?.seeking,
            );

            const myInterests = myProfile.aiProfile?.interests || [];
            const theirInterests = c.friendFindingProfile?.aiProfile?.interests || [];
            const sharedInterests = myInterests.filter(i => theirInterests.includes(i));

            scored.push({
                id: c.id, username: c.username, fullName: c.fullName, avatar: c.avatar,
                age, city: c.city, distanceKm: Math.round(distanceKm),
                sharedInterests, compatibility,
            });
        }

        scored.sort((a, b) => b.compatibility - a.compatibility || a.distanceKm - b.distanceKm);

        res.json(scored.slice(0, 30));
    } catch (error) { next(error); }
};

export const swipe = async (req, res, next) => {
    try {
        const { targetId, decision } = req.body;
        if (!['LIKE', 'PASS'].includes(decision)) return res.status(400).json({ message: 'Invalid decision' });
        if (targetId === req.userId) return res.status(400).json({ message: 'Cannot swipe yourself' });

        await prisma.friendFindingSwipe.upsert({
            where: { swiperId_targetId: { swiperId: req.userId, targetId } },
            update: { decision },
            create: { swiperId: req.userId, targetId, decision },
        });

        if (decision !== 'LIKE') return res.json({ matched: false });

        const reverseLike = await prisma.friendFindingSwipe.findUnique({
            where: { swiperId_targetId: { swiperId: targetId, targetId: req.userId } },
        });
        if (!reverseLike || reverseLike.decision !== 'LIKE') return res.json({ matched: false });

        const [user1Id, user2Id] = [req.userId, targetId].sort();
        const match = await prisma.friendFindingMatch.upsert({
            where: { user1Id_user2Id: { user1Id, user2Id } },
            update: { status: 'ACTIVE', unmatchedAt: null, unmatchedById: null },
            create: { user1Id, user2Id },
        });

        const [me, other] = await Promise.all([
            prisma.user.findUnique({ where: { id: req.userId }, select: CARD_SELECT }),
            prisma.user.findUnique({ where: { id: targetId }, select: CARD_SELECT }),
        ]);

        createNotification(
            targetId, 'FRIEND_FINDING_MATCH',
            '🎉 Yeni bir eşleşmen var!',
            `${me?.fullName || me?.username} ile eşleştin. Artık mesajlaşabilirsiniz.`,
            { matchId: match.id, otherUserId: req.userId },
        ).catch(() => {});
        createNotification(
            req.userId, 'FRIEND_FINDING_MATCH',
            '🎉 Yeni bir eşleşmen var!',
            `${other?.fullName || other?.username} ile eşleştin. Artık mesajlaşabilirsiniz.`,
            { matchId: match.id, otherUserId: targetId },
        ).catch(() => {});
        emitToUser(targetId, 'friendMatchFound', { matchId: match.id, otherUserId: req.userId });
        emitToUser(req.userId, 'friendMatchFound', { matchId: match.id, otherUserId: targetId });

        res.json({ matched: true, match });
    } catch (error) { next(error); }
};

export const getMatches = async (req, res, next) => {
    try {
        const matches = await prisma.friendFindingMatch.findMany({
            where: { status: 'ACTIVE', OR: [{ user1Id: req.userId }, { user2Id: req.userId }] },
            include: { user1: { select: CARD_SELECT }, user2: { select: CARD_SELECT } },
            orderBy: { matchedAt: 'desc' },
        });
        res.json(matches.map(m => ({
            id: m.id,
            matchedAt: m.matchedAt,
            user: m.user1Id === req.userId ? m.user2 : m.user1,
        })));
    } catch (error) { next(error); }
};

export const unmatch = async (req, res, next) => {
    try {
        const { id } = req.params;
        const match = await prisma.friendFindingMatch.findUnique({ where: { id } });
        if (!match || (match.user1Id !== req.userId && match.user2Id !== req.userId)) {
            return res.status(404).json({ message: 'Match not found' });
        }
        await prisma.friendFindingMatch.update({
            where: { id }, data: { status: 'UNMATCHED', unmatchedAt: new Date(), unmatchedById: req.userId },
        });
        res.json({ message: 'Unmatched' });
    } catch (error) { next(error); }
};
