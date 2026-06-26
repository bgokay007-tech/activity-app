import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { getRelation, canAccess } from '../utils/privacy.js';

export const getProfile = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const targetId = userId || req.userId;

        const user = await prisma.user.findUnique({
            where: { id: targetId },
            select: {
                id: true, username: true, fullName: true, avatar: true,
                bio: true, isPublic: true, gender: true, createdAt: true,
                city: true, birthDate: true,
                profilePrivacy: true, profileExclude: true,
                fullNamePrivacy: true, fullNameExclude: true,
                cityPrivacy: true, genderPrivacy: true, birthDatePrivacy: true,
                cityExclude: true, genderExclude: true, birthDateExclude: true,
                postsPrivacy: true, postsExclude: true,
                reelsPrivacy: true, reelsExclude: true,
                friendsListPrivacy: true, friendsListExclude: true,
                activitiesPrivacy: true, activitiesExclude: true,
                interests: {
                    select: { id: true, category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, wins: true, losses: true, lateCancelCount: true },
                    orderBy: { totalPoints: 'desc' },
                },
                _count: {
                    select: {
                        posts: true,
                        sentFriendReqs: { where: { status: 'ACCEPTED' } },
                        receivedFriendReqs: { where: { status: 'ACCEPTED' } },
                    },
                },
            },
        });

        if (!user) return res.status(404).json({ message: 'User not found' });

        const isOwner = targetId === req.userId;
        const { isFriend, isFollower } = await getRelation(targetId, req.userId);

        // Profile-level access check (replaces isPublic gate)
        if (!isOwner) {
            const canAccessProfile = canAccess({
                ownerId: targetId, viewerId: req.userId,
                mode: user.profilePrivacy || 'PUBLIC', list: user.profileExclude,
                isFriend, isFollower,
            });
            if (!canAccessProfile) {
                return res.json({
                    id: user.id, username: user.username,
                    avatar: user.avatar, isPublic: false, isPrivate: true,
                });
            }
        }

        const friendCount = user._count.sentFriendReqs + user._count.receivedFriendReqs;

        const checkField = (privacy, excludeList) => isOwner || canAccess({
            ownerId: targetId, viewerId: req.userId, mode: privacy, list: excludeList, isFriend, isFollower,
        });

        res.json({
            ...user,
            friendCount,
            fullName:  checkField(user.fullNamePrivacy,  user.fullNameExclude)  ? user.fullName  : null,
            city:      checkField(user.cityPrivacy,      user.cityExclude)      ? user.city      : null,
            gender:    checkField(user.genderPrivacy,    user.genderExclude)    ? user.gender    : null,
            birthDate: checkField(user.birthDatePrivacy, user.birthDateExclude) ? user.birthDate : null,
        });
    } catch (error) { next(error); }
};

export const updateProfile = async (req, res, next) => {
    try {
        const { bio, avatar, isPublic, gender, city, birthDate,
                profilePrivacy, profileExclude,
                fullNamePrivacy, fullNameExclude,
                cityPrivacy, genderPrivacy, birthDatePrivacy,
                cityExclude, genderExclude, birthDateExclude,
                postsPrivacy, postsExclude,
                reelsPrivacy, reelsExclude,
                friendsListPrivacy, friendsListExclude,
                activitiesPrivacy, activitiesExclude } = req.body;

        // Sync isPublic with profilePrivacy
        const resolvedIsPublic = profilePrivacy !== undefined
            ? profilePrivacy === 'PUBLIC'
            : isPublic !== undefined ? Boolean(isPublic) : undefined;

        const updated = await prisma.user.update({
            where: { id: req.userId },
            data: {
                ...(bio         !== undefined && { bio }),
                ...(avatar      !== undefined && { avatar }),
                ...(resolvedIsPublic !== undefined && { isPublic: resolvedIsPublic }),
                ...(gender      !== undefined && { gender: gender || null }),
                ...(city        !== undefined && { city: city || null }),
                ...(birthDate   !== undefined && { birthDate: birthDate ? new Date(birthDate) : null }),
                ...(profilePrivacy   !== undefined && { profilePrivacy }),
                ...(profileExclude   !== undefined && { profileExclude }),
                ...(fullNamePrivacy  !== undefined && { fullNamePrivacy }),
                ...(fullNameExclude  !== undefined && { fullNameExclude }),
                ...(cityPrivacy      !== undefined && { cityPrivacy }),
                ...(genderPrivacy    !== undefined && { genderPrivacy }),
                ...(birthDatePrivacy !== undefined && { birthDatePrivacy }),
                ...(cityExclude      !== undefined && { cityExclude }),
                ...(genderExclude    !== undefined && { genderExclude }),
                ...(birthDateExclude !== undefined && { birthDateExclude }),
                ...(postsPrivacy        !== undefined && { postsPrivacy }),
                ...(postsExclude        !== undefined && { postsExclude }),
                ...(reelsPrivacy        !== undefined && { reelsPrivacy }),
                ...(reelsExclude        !== undefined && { reelsExclude }),
                ...(friendsListPrivacy  !== undefined && { friendsListPrivacy }),
                ...(friendsListExclude  !== undefined && { friendsListExclude }),
                ...(activitiesPrivacy   !== undefined && { activitiesPrivacy }),
                ...(activitiesExclude   !== undefined && { activitiesExclude }),
            },
            select: {
                id: true, username: true, fullName: true,
                avatar: true, bio: true, isPublic: true, gender: true,
                city: true, birthDate: true, createdAt: true,
                profilePrivacy: true, profileExclude: true,
                fullNamePrivacy: true, fullNameExclude: true,
                cityPrivacy: true, genderPrivacy: true, birthDatePrivacy: true,
                cityExclude: true, genderExclude: true, birthDateExclude: true,
                postsPrivacy: true, postsExclude: true,
                reelsPrivacy: true, reelsExclude: true,
                friendsListPrivacy: true, friendsListExclude: true,
                activitiesPrivacy: true, activitiesExclude: true,
            },
        });
        res.json(updated);
    } catch (error) { next(error); }
};

const FOLLOW_SELECT = { id: true, username: true, fullName: true, avatar: true };

// Takip isteği gönder — karşı taraf kabul etmeden takipçi sayılmaz
export const followUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        if (userId === req.userId) return res.status(400).json({ message: 'Kendinizi takip edemezsiniz.' });

        const blocked = await prisma.block.findFirst({
            where: { OR: [{ blockerId: req.userId, blockedId: userId }, { blockerId: userId, blockedId: req.userId }] },
        });
        if (blocked) return res.status(403).json({ message: 'Bu kullanıcıyı takip edemezsiniz.' });

        const existing = await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: req.userId, followingId: userId } },
        });
        if (existing && existing.status !== 'REJECTED') {
            return res.status(400).json({ message: 'Takip isteği zaten var', status: existing.status });
        }
        if (existing) await prisma.follow.delete({ where: { id: existing.id } });

        const follow = await prisma.follow.create({
            data: { followerId: req.userId, followingId: userId },
        });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
        createNotification(
            userId, 'FOLLOW_REQUEST',
            '🔔 Takip İsteği',
            `${me?.fullName || me?.username} sizi takip etmek istiyor.`,
            { senderId: req.userId, senderUsername: me?.username },
        ).catch(() => {});

        res.status(201).json(follow);
    } catch (error) { next(error); }
};

// Kendi gönderdiğim takip isteğini geri çek / takip ettiğim birini takipten çık
export const unfollowUser = async (req, res, next) => {
    try {
        const { userId } = req.params;
        await prisma.follow.deleteMany({ where: { followerId: req.userId, followingId: userId } });
        res.json({ message: 'Unfollowed' });
    } catch (error) { next(error); }
};

// Beni takip eden birini sil (onay vermeden reddet ya da zaten kabul ettiğimi çıkar)
export const removeFollower = async (req, res, next) => {
    try {
        const { userId } = req.params;
        await prisma.follow.deleteMany({ where: { followerId: userId, followingId: req.userId } });
        res.json({ message: 'Removed' });
    } catch (error) { next(error); }
};

// Bana gelen takip isteğine kabul/red cevabı ver
export const respondFollowRequest = async (req, res, next) => {
    try {
        const { userId } = req.params; // istegi gonderen (follower)
        const { action } = req.body; // 'accept' | 'reject'

        const follow = await prisma.follow.findUnique({
            where: { followerId_followingId: { followerId: userId, followingId: req.userId } },
        });
        if (!follow) return res.status(404).json({ message: 'Takip isteği bulunamadı.' });

        const updated = await prisma.follow.update({
            where: { id: follow.id },
            data: { status: action === 'accept' ? 'ACCEPTED' : 'REJECTED' },
        });

        if (action === 'accept') {
            const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
            createNotification(
                userId, 'FOLLOW_ACCEPTED',
                '✅ Takip İsteği Kabul Edildi',
                `${me?.fullName || me?.username} takip isteğinizi kabul etti.`,
                { senderId: req.userId, senderUsername: me?.username },
            ).catch(() => {});
        }

        res.json(updated);
    } catch (error) { next(error); }
};

// req.userId ile :userId arasindaki her iki yonlu takip durumu
export const getFollowStatus = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const [outgoing, incoming] = await Promise.all([
            prisma.follow.findUnique({ where: { followerId_followingId: { followerId: req.userId, followingId: userId } } }),
            prisma.follow.findUnique({ where: { followerId_followingId: { followerId: userId, followingId: req.userId } } }),
        ]);
        res.json({
            // ben onu takip ediyor muyum / istek durumum
            outgoing: { status: outgoing?.status || 'NONE' },
            // o beni takip ediyor mu / bana istek gonderdi mi
            incoming: { status: incoming?.status || 'NONE' },
        });
    } catch (error) { next(error); }
};

export const getFollowers = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const rows = await prisma.follow.findMany({
            where: { followingId: userId, status: 'ACCEPTED' },
            include: { follower: { select: FOLLOW_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(rows.map(r => r.follower));
    } catch (error) { next(error); }
};

export const getFollowing = async (req, res, next) => {
    try {
        const { userId } = req.params;
        const rows = await prisma.follow.findMany({
            where: { followerId: userId, status: 'ACCEPTED' },
            include: { following: { select: FOLLOW_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(rows.map(r => r.following));
    } catch (error) { next(error); }
};

// Bana gelen, henuz cevaplanmamis takip istekleri
export const getPendingFollowRequests = async (req, res, next) => {
    try {
        const rows = await prisma.follow.findMany({
            where: { followingId: req.userId, status: 'PENDING' },
            include: { follower: { select: FOLLOW_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(rows.map(r => ({ id: r.id, ...r.follower })));
    } catch (error) { next(error); }
};

export const searchUsers = async (req, res, next) => {
    try {
        const { q, subCategory, category } = req.query;
        if (!q || q.length < 2) return res.json([]);

        const blocked = await prisma.block.findMany({
            where: { OR: [{ blockerId: req.userId }, { blockedId: req.userId }] },
        });
        const blockedIds = blocked.map(b => b.blockerId === req.userId ? b.blockedId : b.blockerId);

        const users = await prisma.user.findMany({
            where: {
                id: { not: req.userId, notIn: blockedIds },
                OR: [
                    { username: { contains: q, mode: 'insensitive' } },
                    { fullName: { contains: q, mode: 'insensitive' } },
                ],
            },
            select: {
                id: true, username: true, fullName: true, avatar: true, isPublic: true,
                ...(subCategory && {
                    interests: {
                        where: {
                            subCategory,
                            ...(category && { category }),
                        },
                        select: { subCategory: true, skillRating: true, totalPoints: true, level: true, alias: true },
                    },
                }),
            },
            take: 10,
        });
        res.json(users);
    } catch (error) { next(error); }
};
