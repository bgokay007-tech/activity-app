import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';
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
                likesCommentsPrivacy: true, likesCommentsExclude: true,
                contactPhone: true, contactTelegram: true, contactEmail: true, contactInstagram: true,
                phonePrivacy: true, phoneSelected: true,
                telegramPrivacy: true, telegramSelected: true,
                cEmailPrivacy: true, cEmailSelected: true,
                instagramPrivacy: true, instagramSelected: true,
                interests: {
                    select: { id: true, category: true, subCategory: true, level: true, skillRating: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true, totalPoints: true, wins: true, losses: true, lateCancelCount: true, assessmentCompleted: true },
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

        // Engellenen taraf artık diğerinin profilini hiç göremiyor.
        if (!isOwner) {
            const block = await prisma.block.findFirst({
                where: {
                    OR: [
                        { blockerId: req.userId, blockedId: targetId },
                        { blockerId: targetId, blockedId: req.userId },
                    ],
                },
            });
            if (block) {
                return res.json({
                    id: user.id, username: user.username,
                    avatar: user.avatar, isPublic: false, isPrivate: true,
                });
            }
        }

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
            contactPhone:     checkField(user.phonePrivacy,     user.phoneSelected)     ? user.contactPhone     : null,
            contactTelegram:  checkField(user.telegramPrivacy,  user.telegramSelected)  ? user.contactTelegram  : null,
            contactEmail:     checkField(user.cEmailPrivacy,    user.cEmailSelected)    ? user.contactEmail     : null,
            contactInstagram: checkField(user.instagramPrivacy, user.instagramSelected) ? user.contactInstagram : null,
            ...(isOwner && {
                phonePrivacy: user.phonePrivacy, phoneSelected: user.phoneSelected,
                telegramPrivacy: user.telegramPrivacy, telegramSelected: user.telegramSelected,
                cEmailPrivacy: user.cEmailPrivacy, cEmailSelected: user.cEmailSelected,
                instagramPrivacy: user.instagramPrivacy, instagramSelected: user.instagramSelected,
            }),
        });
    } catch (error) { next(error); }
};

export const updateProfile = async (req, res, next) => {
    try {
        const { bio, avatar, isPublic, city,
                profilePrivacy, profileExclude,
                fullNamePrivacy, fullNameExclude,
                cityPrivacy, genderPrivacy, birthDatePrivacy,
                cityExclude, genderExclude, birthDateExclude,
                postsPrivacy, postsExclude,
                reelsPrivacy, reelsExclude,
                friendsListPrivacy, friendsListExclude,
                activitiesPrivacy, activitiesExclude,
                likesCommentsPrivacy, likesCommentsExclude,
                contactPhone, contactTelegram, contactEmail, contactInstagram,
                phonePrivacy, phoneSelected,
                telegramPrivacy, telegramSelected,
                cEmailPrivacy, cEmailSelected,
                instagramPrivacy, instagramSelected } = req.body;

        // fullName / gender / birthDate sadece yönetici onayıyla değiştirilebilir
        if (req.body.fullName !== undefined || req.body.gender !== undefined || req.body.birthDate !== undefined) {
            return res.status(403).json({ message: 'Ad soyad, cinsiyet ve doğum tarihi değiştirmek için yönetici onayı gereklidir. Lütfen değişiklik talebi gönderin.' });
        }

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
                ...(city        !== undefined && { city: city || null }),
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
                ...(likesCommentsPrivacy !== undefined && { likesCommentsPrivacy }),
                ...(likesCommentsExclude !== undefined && { likesCommentsExclude }),
                ...(contactPhone     !== undefined && { contactPhone:     contactPhone     || null }),
                ...(contactTelegram  !== undefined && { contactTelegram:  contactTelegram  || null }),
                ...(contactEmail     !== undefined && { contactEmail:     contactEmail     || null }),
                ...(contactInstagram !== undefined && { contactInstagram: contactInstagram || null }),
                ...(phonePrivacy     !== undefined && { phonePrivacy }),
                ...(phoneSelected    !== undefined && { phoneSelected }),
                ...(telegramPrivacy  !== undefined && { telegramPrivacy }),
                ...(telegramSelected !== undefined && { telegramSelected }),
                ...(cEmailPrivacy    !== undefined && { cEmailPrivacy }),
                ...(cEmailSelected   !== undefined && { cEmailSelected }),
                ...(instagramPrivacy !== undefined && { instagramPrivacy }),
                ...(instagramSelected !== undefined && { instagramSelected }),
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
                likesCommentsPrivacy: true, likesCommentsExclude: true,
                contactPhone: true, contactTelegram: true, contactEmail: true, contactInstagram: true,
                phonePrivacy: true, phoneSelected: true,
                telegramPrivacy: true, telegramSelected: true,
                cEmailPrivacy: true, cEmailSelected: true,
                instagramPrivacy: true, instagramSelected: true,
            },
        });
        res.json(updated);
    } catch (error) { next(error); }
};

// ── Profil Değişiklik Talebi ─────────────────────────────────────────────────

const ALLOWED_CHANGE_FIELDS = ['fullName', 'gender', 'birthDate'];

export const submitProfileChangeRequest = async (req, res, next) => {
    try {
        const { field, newValue, documentUrl } = req.body;
        if (!ALLOWED_CHANGE_FIELDS.includes(field))
            return res.status(400).json({ message: 'Geçersiz alan' });
        if (!newValue?.trim())
            return res.status(400).json({ message: 'Yeni değer boş olamaz' });
        if (!documentUrl)
            return res.status(400).json({ message: 'Belge yüklemek zorunludur' });

        // Aynı alan için bekleyen talep varsa bloke et
        const existing = await prisma.profileChangeRequest.findFirst({
            where: { userId: req.userId, field, status: 'PENDING' },
        });
        if (existing)
            return res.status(409).json({ message: 'Bu alan için zaten bekleyen bir talebiniz var' });

        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { fullName: true, gender: true, birthDate: true } });
        const currentValue = field === 'birthDate'
            ? user.birthDate?.toISOString().split('T')[0] ?? null
            : (user[field] ?? null);

        const request = await prisma.profileChangeRequest.create({
            data: { userId: req.userId, field, currentValue, newValue: newValue.trim(), documentUrl, status: 'PENDING' },
        });
        res.status(201).json(request);
    } catch (error) { next(error); }
};

export const getMyProfileChangeRequests = async (req, res, next) => {
    try {
        const requests = await prisma.profileChangeRequest.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    } catch (error) { next(error); }
};

export const submitSupportMessage = async (req, res, next) => {
    try {
        const { message } = req.body;
        if (!message?.trim())
            return res.status(400).json({ message: 'Mesaj boş olamaz' });

        const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        const supportMessage = await prisma.supportMessage.create({
            data: { userId: req.userId, message: message.trim(), status: 'PENDING' },
        });

        // Tüm adminleri bilgilendir
        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        await Promise.all(admins.map(admin =>
            createNotification(
                admin.id,
                'SUPPORT_MESSAGE',
                '💬 Yeni Destek Mesajı',
                `${user?.username || '?'}: ${message.trim().slice(0, 80)}`,
                { messageId: supportMessage.id, userId: req.userId }
            ).then(() => emitToUser(admin.id, 'notification', {})).catch(() => {})
        ));

        res.status(201).json(supportMessage);
    } catch (error) { next(error); }
};

export const getMySupportMessages = async (req, res, next) => {
    try {
        const messages = await prisma.supportMessage.findMany({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json(messages);
    } catch (error) { next(error); }
};

// ─────────────────────────────────────────────────────────────────────────────

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
        const { q, subCategory, category, refereeOnly } = req.query;
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
                    // Kullanıcı isteği: her sporda ayrı, benzersiz bir "kullanıcı adı" (alias)
                    // var — sadece hesabın global username/fullName'ine değil, bu dala özel
                    // alias'a göre de bulunabilmeli. subCategory verilmediyse (ör. ekipman
                    // "alıcı seç" araması) hangi dalın alias'ına bakılacağı belli olmadığı
                    // için bu dal eklenmiyor.
                    ...(subCategory ? [{ interests: { some: { subCategory, ...(category && { category }), alias: { contains: q, mode: 'insensitive' } } } }] : []),
                ],
                // Kullanıcı isteği: "Hakem Davet Et" araması sadece bu dalda aktif bir hakem
                // kaydı (RefereeListing) olan kişileri önersin — kayıtsız biri hakem olarak
                // atanamaz/davet edilemez zaten, önceki davranış herkesi öneriyordu. Voleybol/
                // tenis/padelde ayrıca admin onayı (approved) şart — CV başvurusu onaylanmadan
                // hakem olarak önerilmez (bkz. RefereeListing.approved, resolveRefereeEligibility).
                ...(refereeOnly === 'true' && subCategory && {
                    refereeListings: { some: { subCategory, ...(category && { category }), status: 'ACTIVE', ...(['volleyball', 'tennis', 'padel'].includes(subCategory) && { approved: true }) } },
                }),
            },
            select: {
                id: true, username: true, fullName: true, avatar: true, isPublic: true, gender: true,
                ...(subCategory && {
                    interests: {
                        where: {
                            subCategory,
                            ...(category && { category }),
                        },
                        select: { subCategory: true, skillRating: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true, totalPoints: true, level: true, alias: true, assessmentCompleted: true },
                    },
                }),
                ...(refereeOnly === 'true' && subCategory && {
                    refereeListings: {
                        where: { subCategory, ...(category && { category }), status: 'ACTIVE' },
                        select: { credentialLevel: true, pricePerMatch: true },
                    },
                }),
            },
            take: 10,
        });
        res.json(users);
    } catch (error) { next(error); }
};

// Bir spor/etkinlik dalında ilgi kaydı olan TÜM kullanıcılar — davet listesi "Tüm X'ciler"
// sekmesi için. q verilirse kullanıcı adı/isim o harflerle BAŞLAYANLAR filtrelenir (yazarken
// canlı daralır); q boşsa dal içindeki herkes alfabetik listelenir.
export const getUsersBySport = async (req, res, next) => {
    try {
        const { subCategory, category, q, refereeOnly } = req.query;
        if (!subCategory) return res.status(400).json({ message: 'subCategory required' });

        const blocked = await prisma.block.findMany({
            where: { OR: [{ blockerId: req.userId }, { blockedId: req.userId }] },
        });
        const blockedIds = blocked.map(b => b.blockerId === req.userId ? b.blockedId : b.blockerId);

        // Kullanıcı isteği: hakem davetinde bu liste "bu sporu oynayanlar" değil, bu dalda
        // aktif bir hakem kaydı (RefereeListing) olanlar olmalı — davet edilemeyecek/hakem
        // olarak atanamayacak biri öneri olarak hiç çıkmasın.
        const membershipFilter = refereeOnly === 'true'
            ? { refereeListings: { some: { subCategory, ...(category && { category }), status: 'ACTIVE', ...(['volleyball', 'tennis', 'padel'].includes(subCategory) && { approved: true }) } } }
            : { interests: { some: { subCategory, ...(category && { category }) } } };

        const users = await prisma.user.findMany({
            where: {
                id: { not: req.userId, notIn: blockedIds },
                ...membershipFilter,
                ...(q && q.trim() && {
                    OR: [
                        { username: { startsWith: q.trim(), mode: 'insensitive' } },
                        { fullName: { startsWith: q.trim(), mode: 'insensitive' } },
                        // Kullanıcı isteği: bu dala özel alias (sporda kullanılan "kullanıcı
                        // adı") ile de bulunabilsin, sadece global username/fullName ile değil.
                        { interests: { some: { subCategory, ...(category && { category }), alias: { startsWith: q.trim(), mode: 'insensitive' } } } },
                    ],
                }),
            },
            select: {
                id: true, username: true, fullName: true, avatar: true, isPublic: true, gender: true,
                interests: {
                    where: { subCategory, ...(category && { category }) },
                    select: { subCategory: true, skillRating: true, totalPoints: true, level: true, alias: true, assessmentCompleted: true },
                },
                ...(refereeOnly === 'true' && {
                    refereeListings: {
                        where: { subCategory, ...(category && { category }), status: 'ACTIVE' },
                        select: { credentialLevel: true, pricePerMatch: true },
                    },
                }),
            },
            orderBy: { username: 'asc' },
            take: 50,
        });
        res.json(users);
    } catch (error) { next(error); }
};
