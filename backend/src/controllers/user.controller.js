import prisma from '../config/prisma.js';

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

        // Check friendship once (used for both profile access and field visibility)
        let isFriend = false;
        if (!isOwner) {
            const friendship = await prisma.friendship.findFirst({
                where: {
                    status: 'ACCEPTED',
                    OR: [
                        { senderId: req.userId, receiverId: targetId },
                        { senderId: targetId, receiverId: req.userId },
                    ],
                },
            });
            isFriend = !!friendship;
        }

        // Profile-level access check (replaces isPublic gate)
        if (!isOwner) {
            const pp = user.profilePrivacy || 'PUBLIC';
            const canAccessProfile =
                pp === 'PUBLIC' ||
                (pp === 'FRIENDS' && isFriend) ||
                (pp === 'FRIENDS_EXCEPT' && isFriend && !(user.profileExclude || []).includes(req.userId));

            if (!canAccessProfile) {
                return res.json({
                    id: user.id, username: user.username,
                    avatar: user.avatar, isPublic: false, isPrivate: true,
                });
            }
        }

        const friendCount = user._count.sentFriendReqs + user._count.receivedFriendReqs;

        const checkField = (privacy, excludeList) => {
            if (isOwner) return true;
            if (privacy === 'PUBLIC') return true;
            if (privacy === 'FRIENDS') return isFriend;
            if (privacy === 'FRIENDS_EXCEPT') return isFriend && !(excludeList || []).includes(req.userId);
            return false;
        };

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
        const { fullName, bio, avatar, isPublic, gender, city, birthDate,
                profilePrivacy, profileExclude,
                fullNamePrivacy, fullNameExclude,
                cityPrivacy, genderPrivacy, birthDatePrivacy,
                cityExclude, genderExclude, birthDateExclude } = req.body;

        // Sync isPublic with profilePrivacy
        const resolvedIsPublic = profilePrivacy !== undefined
            ? profilePrivacy === 'PUBLIC'
            : isPublic !== undefined ? Boolean(isPublic) : undefined;

        const updated = await prisma.user.update({
            where: { id: req.userId },
            data: {
                ...(fullName    !== undefined && { fullName }),
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
            },
            select: {
                id: true, username: true, fullName: true,
                avatar: true, bio: true, isPublic: true, gender: true,
                city: true, birthDate: true, createdAt: true,
                profilePrivacy: true, profileExclude: true,
                fullNamePrivacy: true, fullNameExclude: true,
                cityPrivacy: true, genderPrivacy: true, birthDatePrivacy: true,
                cityExclude: true, genderExclude: true, birthDateExclude: true,
            },
        });
        res.json(updated);
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
                        select: { subCategory: true, skillRating: true, totalPoints: true, level: true },
                    },
                }),
            },
            take: 10,
        });
        res.json(users);
    } catch (error) { next(error); }
};
