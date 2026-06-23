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

// mode: PUBLIC | FRIENDS | FOLLOWERS | FRIENDS_EXCEPT | FRIENDS_SELECTED
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
        default: return false;
    }
}
