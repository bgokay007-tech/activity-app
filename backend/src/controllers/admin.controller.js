import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';

export const getStats = async (req, res, next) => {
    try {
        const [users, matches, courts, disputes, posts] = await Promise.all([
            prisma.user.count(),
            prisma.activityRequest.count(),
            prisma.court.count(),
            prisma.activityRequest.count({ where: { scoreStatus: 'DISPUTED' } }),
            prisma.post.count(),
        ]);
        const pending = await prisma.court.count({ where: { pending: true } });
        const archived = await prisma.activityRequest.count({ where: { scoreStatus: 'CONFIRMED' } });
        res.json({ users, matches, courts, disputes, posts, pendingCourts: pending, archivedMatches: archived });
    } catch (e) { next(e); }
};

export const getUsers = async (req, res, next) => {
    try {
        const users = await prisma.user.findMany({
            select: {
                id: true, username: true, fullName: true, email: true,
                isAdmin: true, isPublic: true, createdAt: true,
                _count: { select: { posts: true, sentRequests: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(users);
    } catch (e) { next(e); }
};

export const updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { isAdmin, isPublic } = req.body;
        if (id === req.userId) return res.status(400).json({ message: 'Cannot edit your own admin status' });
        const user = await prisma.user.update({
            where: { id },
            data: { ...(isAdmin !== undefined && { isAdmin }), ...(isPublic !== undefined && { isPublic }) },
            select: { id: true, username: true, isAdmin: true, isPublic: true },
        });
        res.json(user);
    } catch (e) { next(e); }
};

export const deleteUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        if (id === req.userId) return res.status(400).json({ message: 'Cannot delete yourself' });
        await prisma.user.delete({ where: { id } });
        res.json({ message: 'User deleted' });
    } catch (e) { next(e); }
};

export const getDisputes = async (req, res, next) => {
    try {
        const disputes = await prisma.activityRequest.findMany({
            where: { OR: [{ scoreStatus: 'DISPUTED' }, { scoreAppeal: true }] },
            include: {
                sender: { select: { id: true, username: true, fullName: true } },
                receiver: { select: { id: true, username: true, fullName: true } },
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(disputes);
    } catch (e) { next(e); }
};

export const resolveDispute = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { winner } = req.body; // 'sender' | 'receiver' | 'draw'
        const match = await prisma.activityRequest.findUnique({ where: { id } });
        if (!match) return res.status(404).json({ message: 'Match not found' });

        const updatedScore = { ...(match.score || {}), winner, adminResolved: true };
        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { scoreStatus: 'CONFIRMED', score: updatedScore },
        });
        res.json(updated);
    } catch (e) { next(e); }
};

export const resolveAppeal = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { resolution } = req.body; // 'RESET' | 'REJECTED'
        const match = await prisma.activityRequest.findUnique({
            where: { id },
            include: { sender: { select: { id: true } } },
        });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });

        let data;
        if (resolution === 'RESET') {
            data = { score: null, scoreStatus: 'NONE', scoreAppeal: false, scoreAppealReason: null, archived: false };
        } else {
            data = { scoreAppeal: false, scoreAppealReason: null };
        }

        const updated = await prisma.activityRequest.update({ where: { id }, data });

        const participants = Array.isArray(match.participants) ? match.participants : [];
        const allIds = [...new Set([match.senderId, ...participants.map(p => p.id)])];
        for (const uid of allIds) {
            emitToUser(uid, 'rivalUpdate', updated);
            const msg = resolution === 'RESET'
                ? 'Admin inceledi, skor sıfırlandı. Skoru yeniden girebilirsiniz.'
                : 'Admin inceledi, itirazınız reddedildi. Skor geçerli sayıldı.';
            createNotification(
                uid, 'SCORE_CONFIRMED',
                resolution === 'RESET' ? '🔄 Skor Sıfırlandı' : '❌ İtiraz Reddedildi',
                msg,
                { rivalId: id, category: match.category, subCategory: match.subCategory }
            ).catch(() => {});
        }

        res.json(updated);
    } catch (e) { next(e); }
};

export const getAllCourts = async (req, res, next) => {
    try {
        const courts = await prisma.court.findMany({
            include: { user: { select: { id: true, username: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(courts);
    } catch (e) { next(e); }
};

export const deleteCourt = async (req, res, next) => {
    try {
        await prisma.court.delete({ where: { id: req.params.id } });
        res.json({ message: 'Court deleted' });
    } catch (e) { next(e); }
};

export const getAllPosts = async (req, res, next) => {
    try {
        const posts = await prisma.post.findMany({
            include: { user: { select: { id: true, username: true } } },
            orderBy: { createdAt: 'desc' },
            take: 100,
        });
        res.json(posts);
    } catch (e) { next(e); }
};

export const deletePost = async (req, res, next) => {
    try {
        await prisma.post.delete({ where: { id: req.params.id } });
        res.json({ message: 'Post deleted' });
    } catch (e) { next(e); }
};

export const getTournamentPermissionRequests = async (req, res, next) => {
    try {
        const { status } = req.query; // 'PENDING' | 'APPROVED' — omit for both
        const requests = await prisma.tournamentPermissionRequest.findMany({
            where: status ? { status } : { status: { in: ['PENDING', 'APPROVED'] } },
            orderBy: { createdAt: 'desc' },
        });
        const userIds = requests.map(r => r.userId);
        const users = userIds.length > 0
            ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, username: true, fullName: true, avatar: true } })
            : [];
        const userMap = Object.fromEntries(users.map(u => [u.id, u]));
        res.json(requests.map(r => ({ ...r, user: userMap[r.userId] || null })));
    } catch (e) { next(e); }
};

export const approveTournamentPermission = async (req, res, next) => {
    try {
        const { userId } = req.params;
        await prisma.tournamentPermissionRequest.update({ where: { userId }, data: { status: 'APPROVED' } });
        createNotification(userId, 'TOURNAMENT_PERMISSION_APPROVED',
            '✅ Turnuva İzni Onaylandı',
            'Tebrikler! Artık turnuva oluşturabilirsiniz.',
            {}
        ).catch(() => {});
        res.json({ message: 'Approved' });
    } catch (e) { next(e); }
};

export const rejectTournamentPermission = async (req, res, next) => {
    try {
        const { userId } = req.params;
        await prisma.tournamentPermissionRequest.update({
            where: { userId },
            data: { status: 'REJECTED' },
        });
        createNotification(userId, 'TOURNAMENT_PERMISSION_REJECTED',
            '❌ Turnuva İzni Reddedildi',
            'Turnuva oluşturma talebiniz reddedildi.',
            {}
        ).catch(() => {});
        res.json({ message: 'Rejected' });
    } catch (e) { next(e); }
};

export const getFlaggedListings = async (req, res, next) => {
    try {
        const [equipment, coaches] = await Promise.all([
            prisma.equipmentListing.findMany({
                where: { status: 'FLAGGED' },
                include: { user: { select: { id: true, username: true } } },
                orderBy: { reportCount: 'desc' },
            }),
            prisma.coachListing.findMany({
                where: { status: 'FLAGGED' },
                include: { user: { select: { id: true, username: true } } },
                orderBy: { reportCount: 'desc' },
            }),
        ]);
        res.json({
            equipment: equipment.map(e => ({ ...e, listingType: 'EQUIPMENT' })),
            coaches: coaches.map(c => ({ ...c, listingType: 'COACH' })),
        });
    } catch (e) { next(e); }
};

export const moderateListing = async (req, res, next) => {
    try {
        const { type, id } = req.params;
        const { action } = req.body; // 'RESTORE' | 'REMOVE'

        const status = action === 'RESTORE' ? 'ACTIVE' : 'REMOVED';
        const listingType = type === 'equipment' ? 'EQUIPMENT' : 'COACH';

        if (type === 'equipment') {
            await prisma.equipmentListing.update({ where: { id }, data: { status } });
        } else {
            await prisma.coachListing.update({ where: { id }, data: { status } });
        }

        if (action === 'REMOVE') {
            await prisma.listingReport.deleteMany({ where: { listingType, listingId: id } });
        }

        res.json({ ok: true });
    } catch (e) { next(e); }
};

export const revokeTournamentPermission = async (req, res, next) => {
    try {
        const { userId } = req.params;
        await prisma.tournamentPermissionRequest.delete({ where: { userId } });
        createNotification(userId, 'TOURNAMENT_PERMISSION_REJECTED',
            '🚫 Turnuva İzni İptal Edildi',
            'Turnuva oluşturma izniniz admin tarafından iptal edildi. Yeniden başvurabilirsiniz.',
            {}
        ).catch(() => {});
        res.json({ message: 'Revoked' });
    } catch (e) { next(e); }
};

// ── Profil Değişiklik Talepleri (Admin) ──────────────────────────────────────

export const getProfileChangeRequests = async (req, res, next) => {
    try {
        const { status = 'PENDING' } = req.query;
        const requests = await prisma.profileChangeRequest.findMany({
            where: { status },
            include: { user: { select: { id: true, username: true, fullName: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(requests);
    } catch (e) { next(e); }
};

export const reviewProfileChangeRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action, adminNote } = req.body; // action: 'APPROVE' | 'REJECT'
        if (!['APPROVE', 'REJECT'].includes(action))
            return res.status(400).json({ message: 'Geçersiz işlem' });

        const request = await prisma.profileChangeRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Talep bulunamadı' });
        if (request.status !== 'PENDING') return res.status(400).json({ message: 'Talep zaten işlenmiş' });

        if (action === 'APPROVE') {
            const updateData = {};
            if (request.field === 'birthDate') {
                updateData.birthDate = new Date(request.newValue);
            } else {
                updateData[request.field] = request.newValue;
            }
            await prisma.user.update({ where: { id: request.userId }, data: updateData });
        }

        const updated = await prisma.profileChangeRequest.update({
            where: { id },
            data: { status: action === 'APPROVE' ? 'APPROVED' : 'REJECTED', adminNote: adminNote || null },
        });

        const fieldLabel = request.field === 'fullName' ? 'Ad Soyad' : request.field === 'gender' ? 'Cinsiyet' : 'Doğum Tarihi';
        const { createNotification } = await import('./notification.controller.js');
        createNotification(
            request.userId,
            action === 'APPROVE' ? 'PROFILE_CHANGE_APPROVED' : 'PROFILE_CHANGE_REJECTED',
            action === 'APPROVE' ? `✅ ${fieldLabel} Değişikliği Onaylandı` : `❌ ${fieldLabel} Değişikliği Reddedildi`,
            action === 'APPROVE'
                ? `${fieldLabel} alanınız "${request.newValue}" olarak güncellendi.`
                : `${fieldLabel} değişiklik talebiniz reddedildi.${adminNote ? ` Neden: ${adminNote}` : ''}`,
            {}
        ).catch(() => {});

        res.json(updated);
    } catch (e) { next(e); }
};
