import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';
import { subCategoryTR } from '../utils/subCategoryLabels.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

async function getOrCreateConversation(user1Id, user2Id) {
    const [a, b] = [user1Id, user2Id].sort();
    return prisma.conversation.upsert({
        where: { user1Id_user2Id: { user1Id: a, user2Id: b } },
        create: { user1Id: a, user2Id: b },
        update: { updatedAt: new Date() },
        include: {
            user1: { select: USER_SELECT },
            user2: { select: USER_SELECT },
        },
    });
}

async function assertActiveInterest(userId, category, subCategory) {
    const interest = await prisma.userInterest.findUnique({
        where: { userId_category_subCategory: { userId, category, subCategory } },
    });
    if (!interest || interest.hidden) {
        const err = new Error('Bu dal için önce profilinden "Aktivitelerim"e eklemelisin.');
        err.status = 403;
        throw err;
    }
    return interest;
}

async function postAlgoMessage({ conversationId, senderId, content, meta, activityRequestId = null }) {
    const msg = await prisma.message.create({
        data: {
            conversationId,
            senderId,
            content: content || '',
            meta: meta || undefined,
            ...(activityRequestId && { activityRequestId }),
        },
        include: {
            sender: { select: USER_SELECT },
            activityRequest: {
                select: {
                    id: true, category: true, subCategory: true, matchType: true, level: true,
                    matchDate: true, matchTime: true, location: true, courtName: true,
                    flexibleSchedule: true, status: true, district: true,
                },
            },
        },
    });
    await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } }).catch(() => {});
    return msg;
}

function emitNewMessage(conversationId, message, userIds) {
    for (const uid of userIds) {
        emitToUser(uid, 'newMessage', { message, conversationId });
    }
}

// POST /challenges — sıra tablosundan / profilden meydan oku
export const createChallenge = async (req, res, next) => {
    try {
        const { challengedId, category, subCategory } = req.body;
        if (!challengedId || !category || !subCategory) {
            return res.status(400).json({ message: 'challengedId, category ve subCategory zorunlu' });
        }
        if (challengedId === req.userId) {
            return res.status(400).json({ message: 'Kendinize meydan okuyamazsınız' });
        }

        const target = await prisma.user.findUnique({ where: { id: challengedId }, select: USER_SELECT });
        if (!target) return res.status(404).json({ message: 'Kullanıcı bulunamadı' });

        await assertActiveInterest(req.userId, category, subCategory);
        await assertActiveInterest(challengedId, category, subCategory);

        const blocked = await prisma.block.findFirst({
            where: {
                OR: [
                    { blockerId: req.userId, blockedId: challengedId },
                    { blockerId: challengedId, blockedId: req.userId },
                ],
            },
        });
        if (blocked) return res.status(403).json({ message: 'Bu kullanıcıyla etkileşim engellenmiş.' });

        const existing = await prisma.matchChallenge.findFirst({
            where: {
                status: 'PENDING',
                OR: [
                    { challengerId: req.userId, challengedId },
                    { challengerId: challengedId, challengedId: req.userId },
                ],
                category,
                subCategory,
            },
        });
        if (existing) {
            return res.status(409).json({ message: 'Bu dalda zaten bekleyen bir meydan okuma var.', challenge: existing });
        }

        const conv = await getOrCreateConversation(req.userId, challengedId);
        const challenge = await prisma.matchChallenge.create({
            data: {
                challengerId: req.userId,
                challengedId,
                category,
                subCategory,
                status: 'PENDING',
                conversationId: conv.id,
            },
        });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: USER_SELECT });
        const sport = subCategoryTR(subCategory) || subCategory;
        const offerMsg = await postAlgoMessage({
            conversationId: conv.id,
            senderId: req.userId,
            content: `⚔️ ${me?.fullName || me?.username} sana ${sport} maçı için meydan okudu!`,
            meta: {
                kind: 'CHALLENGE_OFFER',
                challengeId: challenge.id,
                category,
                subCategory,
                status: 'PENDING',
            },
        });

        emitNewMessage(conv.id, offerMsg, [req.userId, challengedId]);

        createNotification(
            challengedId,
            'CHALLENGE_OFFER',
            '⚔️ Meydan Okuma!',
            `${me?.fullName || me?.username} sana ${sport} maçı için meydan okudu.`,
            {
                challengeId: challenge.id,
                conversationId: conv.id,
                senderId: req.userId,
                senderUsername: me?.username,
                category,
                subCategory,
            },
        ).then(() => emitToUser(challengedId, 'notification', {})).catch(() => {});

        const other = conv.user1Id === req.userId ? conv.user2 : conv.user1;
        res.status(201).json({
            challenge,
            conversation: { ...conv, other },
            message: offerMsg,
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        next(error);
    }
};

// PATCH /challenges/:id/respond — { action: 'accept' | 'decline' }
export const respondChallenge = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action } = req.body;
        if (!['accept', 'decline'].includes(action)) {
            return res.status(400).json({ message: 'action accept veya decline olmalı' });
        }

        const challenge = await prisma.matchChallenge.findUnique({ where: { id } });
        if (!challenge) return res.status(404).json({ message: 'Meydan okuma bulunamadı' });
        if (challenge.challengedId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        if (challenge.status !== 'PENDING') {
            return res.status(400).json({ message: 'Bu teklif artık beklenmiyor' });
        }

        if (action === 'decline') {
            const updated = await prisma.matchChallenge.update({
                where: { id },
                data: { status: 'DECLINED' },
            });
            const convId = challenge.conversationId || (await getOrCreateConversation(challenge.challengerId, challenge.challengedId)).id;
            const me = await prisma.user.findUnique({ where: { id: req.userId }, select: USER_SELECT });
            const msg = await postAlgoMessage({
                conversationId: convId,
                senderId: req.userId,
                content: `❌ ${me?.fullName || me?.username} meydan okumayı reddetti.`,
                meta: {
                    kind: 'CHALLENGE_DECLINED',
                    challengeId: id,
                    category: challenge.category,
                    subCategory: challenge.subCategory,
                    status: 'DECLINED',
                },
            });
            emitNewMessage(convId, msg, [challenge.challengerId, challenge.challengedId]);
            createNotification(
                challenge.challengerId,
                'CHALLENGE_DECLINED',
                '❌ Meydan Okuma Reddedildi',
                `${me?.fullName || me?.username} meydan okumanı reddetti.`,
                { challengeId: id, category: challenge.category, subCategory: challenge.subCategory },
            ).catch(() => {});
            return res.json({ challenge: updated, message: msg });
        }

        // ACCEPT — MATCHED esnek maç + sohbet yer/zaman teklifleri
        await assertActiveInterest(req.userId, challenge.category, challenge.subCategory);
        await assertActiveInterest(challenge.challengerId, challenge.category, challenge.subCategory);

        const challengedUser = await prisma.user.findUnique({ where: { id: req.userId }, select: USER_SELECT });
        const participants = [{
            id: challengedUser.id,
            username: challengedUser.username,
            fullName: challengedUser.fullName,
            avatar: challengedUser.avatar,
        }];

        const rival = await prisma.activityRequest.create({
            data: {
                senderId: challenge.challengerId,
                receiverId: challenge.challengedId,
                category: challenge.category,
                subCategory: challenge.subCategory,
                matchType: 'SINGLE',
                matchMode: 'COMPETITIVE',
                status: 'MATCHED',
                flexibleSchedule: true,
                participants,
                schedulingDeadline: new Date(Date.now() + 24 * 3600 * 1000),
                message: 'Meydan okuma maçı',
            },
        });

        const conv = challenge.conversationId
            ? await prisma.conversation.findUnique({
                where: { id: challenge.conversationId },
                include: { user1: { select: USER_SELECT }, user2: { select: USER_SELECT } },
            })
            : await getOrCreateConversation(challenge.challengerId, challenge.challengedId);

        const updated = await prisma.matchChallenge.update({
            where: { id },
            data: {
                status: 'ACCEPTED',
                activityRequestId: rival.id,
                conversationId: conv.id,
            },
        });

        const sport = subCategoryTR(challenge.subCategory) || challenge.subCategory;
        const acceptMsg = await postAlgoMessage({
            conversationId: conv.id,
            senderId: req.userId,
            content: `✅ Meydan okuma kabul edildi! ${sport} maçı için yer ve zaman önerin.`,
            meta: {
                kind: 'CHALLENGE_ACCEPTED',
                challengeId: id,
                category: challenge.category,
                subCategory: challenge.subCategory,
                status: 'ACCEPTED',
                activityRequestId: rival.id,
            },
            activityRequestId: rival.id,
        });
        const promptMsg = await postAlgoMessage({
            conversationId: conv.id,
            senderId: req.userId,
            content: '📅 Aşağıdan tarih, saat ve mekan önerisi gönderebilirsiniz. Karşı taraf kabul ederse maç kesinleşir.',
            meta: {
                kind: 'SCHEDULE_PROMPT',
                challengeId: id,
                category: challenge.category,
                subCategory: challenge.subCategory,
                activityRequestId: rival.id,
            },
            activityRequestId: rival.id,
        });

        emitNewMessage(conv.id, acceptMsg, [challenge.challengerId, challenge.challengedId]);
        emitNewMessage(conv.id, promptMsg, [challenge.challengerId, challenge.challengedId]);

        createNotification(
            challenge.challengerId,
            'CHALLENGE_ACCEPTED',
            '✅ Meydan Okuma Kabul Edildi!',
            `${challengedUser.fullName || challengedUser.username} meydan okumanı kabul etti. Yer ve zaman önerin.`,
            {
                challengeId: id,
                conversationId: conv.id,
                rivalId: rival.id,
                category: challenge.category,
                subCategory: challenge.subCategory,
                senderId: req.userId,
                senderUsername: challengedUser.username,
            },
        ).then(() => emitToUser(challenge.challengerId, 'notification', {})).catch(() => {});

        const other = conv.user1Id === req.userId ? conv.user2 : conv.user1;
        res.json({
            challenge: updated,
            rival,
            conversation: { ...conv, other },
            messages: [acceptMsg, promptMsg],
        });
    } catch (error) {
        if (error.status) return res.status(error.status).json({ message: error.message });
        next(error);
    }
};

// POST /challenges/:id/propose-schedule — { date, time, location?, courtName? }
export const proposeChallengeSchedule = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { date, time, location, courtName } = req.body;
        if (!date || !time) return res.status(400).json({ message: 'Tarih ve saat zorunlu' });

        const challenge = await prisma.matchChallenge.findUnique({ where: { id } });
        if (!challenge) return res.status(404).json({ message: 'Meydan okuma bulunamadı' });
        if (challenge.status !== 'ACCEPTED') return res.status(400).json({ message: 'Önce meydan okuma kabul edilmeli' });
        if (challenge.challengerId !== req.userId && challenge.challengedId !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (!challenge.activityRequestId || !challenge.conversationId) {
            return res.status(400).json({ message: 'Maç veya sohbet henüz hazır değil' });
        }

        const proposal = {
            userId: req.userId,
            date,
            time,
            location: location || null,
            courtName: courtName || null,
            proposedAt: new Date().toISOString(),
        };
        await prisma.activityRequest.update({
            where: { id: challenge.activityRequestId },
            data: { scheduleProposal: proposal },
        });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: USER_SELECT });
        const place = courtName || location || '';
        const msg = await postAlgoMessage({
            conversationId: challenge.conversationId,
            senderId: req.userId,
            content: `📅 ${me?.fullName || me?.username} önerdi: ${date} · ${time}${place ? ` · ${place}` : ''}`,
            meta: {
                kind: 'SCHEDULE_PROPOSAL',
                challengeId: id,
                activityRequestId: challenge.activityRequestId,
                category: challenge.category,
                subCategory: challenge.subCategory,
                status: 'PENDING',
                date,
                time,
                location: location || null,
                courtName: courtName || null,
            },
            activityRequestId: challenge.activityRequestId,
        });

        const otherId = challenge.challengerId === req.userId ? challenge.challengedId : challenge.challengerId;
        emitNewMessage(challenge.conversationId, msg, [req.userId, otherId]);
        createNotification(
            otherId,
            'CHALLENGE_SCHEDULE',
            '📅 Maç Tarihi Önerisi',
            `${me?.fullName || me?.username} ${date} ${time} önerdi. Kabul edebilir veya karşı öneri gönderebilirsin.`,
            {
                challengeId: id,
                conversationId: challenge.conversationId,
                rivalId: challenge.activityRequestId,
                category: challenge.category,
                subCategory: challenge.subCategory,
                senderId: req.userId,
                senderUsername: me?.username,
            },
        ).catch(() => {});

        res.status(201).json({ message: msg, proposal });
    } catch (error) { next(error); }
};

// POST /challenges/:id/accept-schedule — bekleyen scheduleProposal'ı kabul et
export const acceptChallengeSchedule = async (req, res, next) => {
    try {
        const { id } = req.params;
        const challenge = await prisma.matchChallenge.findUnique({ where: { id } });
        if (!challenge) return res.status(404).json({ message: 'Meydan okuma bulunamadı' });
        if (challenge.challengerId !== req.userId && challenge.challengedId !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        if (!challenge.activityRequestId) return res.status(400).json({ message: 'Maç yok' });

        const rival = await prisma.activityRequest.findUnique({ where: { id: challenge.activityRequestId } });
        if (!rival?.scheduleProposal) return res.status(400).json({ message: 'Bekleyen öneri yok' });
        const proposal = rival.scheduleProposal;
        if (proposal.userId === req.userId) {
            return res.status(400).json({ message: 'Kendi önerinizi kabul edemezsiniz' });
        }

        const updatedRival = await prisma.activityRequest.update({
            where: { id: rival.id },
            data: {
                matchDate: new Date(proposal.date),
                matchTime: proposal.time,
                location: proposal.location || rival.location,
                courtName: proposal.courtName || rival.courtName,
                scheduleProposal: null,
                schedulingDeadline: null,
                flexibleSchedule: false,
            },
        });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: USER_SELECT });
        const place = updatedRival.courtName || updatedRival.location || '';
        const msg = await postAlgoMessage({
            conversationId: challenge.conversationId,
            senderId: req.userId,
            content: `✅ Tarih onaylandı: ${proposal.date} · ${proposal.time}${place ? ` · ${place}` : ''}`,
            meta: {
                kind: 'SCHEDULE_ACCEPTED',
                challengeId: id,
                activityRequestId: rival.id,
                category: challenge.category,
                subCategory: challenge.subCategory,
                status: 'ACCEPTED',
                date: proposal.date,
                time: proposal.time,
                location: updatedRival.location,
                courtName: updatedRival.courtName,
            },
            activityRequestId: rival.id,
        });

        const otherId = challenge.challengerId === req.userId ? challenge.challengedId : challenge.challengerId;
        emitNewMessage(challenge.conversationId, msg, [req.userId, otherId]);
        emitToUser(otherId, 'rivalUpdate', updatedRival);
        emitToUser(req.userId, 'rivalUpdate', updatedRival);
        createNotification(
            otherId,
            'CHALLENGE_SCHEDULE',
            '✅ Maç Tarihi Onaylandı',
            `${me?.fullName || me?.username} öneriyi kabul etti. Maç ${proposal.date} ${proposal.time}.`,
            {
                challengeId: id,
                conversationId: challenge.conversationId,
                rivalId: rival.id,
                category: challenge.category,
                subCategory: challenge.subCategory,
            },
        ).catch(() => {});

        res.json({ rival: updatedRival, message: msg });
    } catch (error) { next(error); }
};

export const getChallenge = async (req, res, next) => {
    try {
        const challenge = await prisma.matchChallenge.findUnique({
            where: { id: req.params.id },
            include: {
                challenger: { select: USER_SELECT },
                challenged: { select: USER_SELECT },
            },
        });
        if (!challenge) return res.status(404).json({ message: 'Bulunamadı' });
        if (challenge.challengerId !== req.userId && challenge.challengedId !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }
        res.json(challenge);
    } catch (error) { next(error); }
};
