import prisma from '../config/prisma.js';

// Sahip (owner) ile goruntuleyen (viewer) arasindaki arkadaslik/takip iliskisi
export async function getRelation(ownerId, viewerId) {
    if (ownerId === viewerId) return { isFriend: true, isFollower: true };
    const [friendship, follow] = await Promise.all([
        prisma.friendship.findFirst({
            where: { status: 'ACCEPTED', OR: [{ senderId: ownerId, receiverId: viewerId }, { senderId: viewerId, receiverId: ownerId }] },
        }),
        prisma.follow.findFirst({ where: { followerId: viewerId, followingId: ownerId, status: 'ACCEPTED' } }),
    ]);
    return { isFriend: !!friendship, isFollower: !!follow };
}

// mode: PUBLIC | FRIENDS | FOLLOWERS | FRIENDS_EXCEPT | FRIENDS_SELECTED | NOBODY
// list anlami moda gore degisir: FRIENDS_EXCEPT -> haric tutulanlar, FRIENDS_SELECTED -> sadece dahil edilenler
export function canAccess({ ownerId, viewerId, mode, list, isFriend, isFollower }) {
    if (ownerId === viewerId) return true;
    const arr = Array.isArray(list) ? list : [];
    switch (mode) {
        case 'PUBLIC': return true;
        case 'FRIENDS': return isFriend;
        case 'FOLLOWERS': return isFollower;
        case 'FRIENDS_EXCEPT': return isFriend && !arr.includes(viewerId);
        case 'FRIENDS_SELECTED': return isFriend && arr.includes(viewerId);
        case 'NOBODY': return false;
        default: return false;
    }
}

const PRIVACY_DENIED_TR = {
    FRIENDS: (kind) => `Bu kişinin ${kind} sadece arkadaşlarına açıktır.`,
    FOLLOWERS: (kind) => `Bu kişinin ${kind} sadece takipçilerine açıktır.`,
    FRIENDS_EXCEPT: (kind) => `Bu kişinin ${kind} bazı arkadaşlarına kapalıdır.`,
    FRIENDS_SELECTED: (kind) => `Bu kişinin ${kind} sadece seçili arkadaşlarına açıktır.`,
    NOBODY: (kind) => `Bu kişinin ${kind} kimseye açık değildir.`,
    HIDDEN: () => 'Bu içerik gizlenmiş.',
    EXPIRED: () => 'Bu hikaye süresi dolmuş.',
    NOT_FOUND: () => 'İçerik bulunamadı.',
};

function kindLabelTr(type) {
    if (type === 'REEL') return 'reelsleri';
    if (type === 'STORY') return 'hikayeleri';
    return 'gönderileri';
}

// DM ile iletilen / linkle açılan post-reel-hikaye için tek kapı.
// Ayrı storiesPrivacy yok — hikaye, gönderiler (postsPrivacy) ayarını paylaşır;
// reels kendi reelsPrivacy alanını kullanır.
export async function checkPostMediaAccess(post, viewerId) {
    if (!post) {
        return { allowed: false, code: 'NOT_FOUND', privacyMode: null, message: PRIVACY_DENIED_TR.NOT_FOUND() };
    }
    if (post.userId === viewerId) {
        return { allowed: true, code: null, privacyMode: 'PUBLIC', message: null };
    }
    if (post.hidden) {
        return { allowed: false, code: 'HIDDEN', privacyMode: 'NOBODY', message: PRIVACY_DENIED_TR.HIDDEN() };
    }
    if (post.type === 'STORY' && post.expiresAt && new Date(post.expiresAt) <= new Date()) {
        return { allowed: false, code: 'EXPIRED', privacyMode: null, message: PRIVACY_DENIED_TR.EXPIRED() };
    }

    const owner = await prisma.user.findUnique({
        where: { id: post.userId },
        select: {
            postsPrivacy: true, postsExclude: true,
            reelsPrivacy: true, reelsExclude: true,
        },
    });
    if (!owner) {
        return { allowed: false, code: 'NOT_FOUND', privacyMode: null, message: PRIVACY_DENIED_TR.NOT_FOUND() };
    }

    const { isFriend, isFollower } = await getRelation(post.userId, viewerId);
    const mode = post.type === 'REEL' ? owner.reelsPrivacy : owner.postsPrivacy;
    const list = post.type === 'REEL' ? owner.reelsExclude : owner.postsExclude;
    const allowed = canAccess({
        ownerId: post.userId, viewerId, mode, list, isFriend, isFollower,
    });
    if (allowed) return { allowed: true, code: null, privacyMode: mode, message: null };

    const msgFn = PRIVACY_DENIED_TR[mode] || PRIVACY_DENIED_TR.NOBODY;
    return {
        allowed: false,
        code: 'PRIVACY_DENIED',
        privacyMode: mode,
        message: msgFn(kindLabelTr(post.type)),
    };
}
