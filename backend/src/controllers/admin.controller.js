import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';

// coach.controller.js'deki COACH_APPROVAL_SPORTS ile aynı liste — antrenörlük ilan onayı
// artık voleybol dışında tenis ve padelde de gerekiyor (kullanıcı isteği).
const COACH_APPROVAL_SPORTS = ['volleyball', 'tennis', 'padel'];
// referee.controller.js'deki REFEREE_APPROVAL_SPORTS ile aynı liste — hakemlik onayı da
// aynı mantıkla voleybol dışında tenis ve padelde de gerekiyor.
const REFEREE_APPROVAL_SPORTS = ['volleyball', 'tennis', 'padel'];

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

// Kullanıcı isteği: web admin panelindeki sidebar sekmelerinin yanında bekleyen kayıt
// sayısı (parantez içinde) ve yeni bir şey varken yanıp sönen bir rozet gösterilsin —
// onaylar bekletilmesin. Tek çağrıda TÜM onay kuyruklarının sayısını dönen bu endpoint,
// AdminPage'in sidebar'ı periyodik olarak buradan besliyor (her panelin kendi listesini
// ayrıca çekmesine gerek kalmadan — inaktif sekmeler zaten mount olmuyor).
export const getPendingCounts = async (req, res, next) => {
    try {
        const [
            courts, venues, bizVenues, disputes, noshow, cities,
            tournamentPerms, flaggedEquipment, flaggedCoaches,
            profileChanges, subscriptions, venueReviews,
            coachListingApproval, refereeApproval, coachRatingApproval,
        ] = await Promise.all([
            prisma.court.count({ where: { pending: true } }),
            prisma.court.count({ where: { pending: true, verified: false } }),
            prisma.businessVenue.count({ where: { status: 'PENDING' } }),
            prisma.activityRequest.count({ where: { OR: [{ scoreStatus: 'DISPUTED' }, { scoreAppeal: true }] } }),
            prisma.noShowReport.count({ where: { status: 'PENDING' } }),
            prisma.city.count({ where: { status: 'PENDING' } }),
            prisma.tournamentPermissionRequest.count({ where: { status: 'PENDING' } }),
            prisma.equipmentListing.count({ where: { status: 'FLAGGED' } }),
            prisma.coachListing.count({ where: { status: 'FLAGGED' } }),
            prisma.profileChangeRequest.count({ where: { status: 'PENDING' } }),
            prisma.subscriptionRequest.count({ where: { status: 'PENDING' } }),
            prisma.venueReview.count({ where: { status: 'PENDING' } }),
            prisma.coachListing.count({ where: { subCategory: { in: COACH_APPROVAL_SPORTS }, status: 'ACTIVE', approved: false } }),
            prisma.refereeListing.count({ where: { subCategory: { in: REFEREE_APPROVAL_SPORTS }, status: 'ACTIVE', approved: false } }),
            prisma.coachListing.count({ where: { subCategory: 'volleyball', status: 'ACTIVE', approvedForRating: false } }),
        ]);
        res.json({
            courts,
            venues,
            'biz-venues': bizVenues,
            disputes,
            noshow,
            cities,
            'tournament-perms': tournamentPerms,
            'flagged-listings': flaggedEquipment + flaggedCoaches,
            'profile-changes': profileChanges,
            subscriptions,
            'venue-reviews': venueReviews,
            'coach-listing-approval': coachListingApproval,
            'referee-approval': refereeApproval,
            'coach-rating-approval': coachRatingApproval,
        });
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

// Kullanıcı isteği: onaydan SONRA da (gözden kaçan bir bilgi olabilir) admin herhangi bir
// kortu düzenleyebilsin — court.controller.js'teki updateCourt sadece kortu ekleyen kişiye
// (addedBy) izin veriyor, admin community kortlarını (kendisi eklemediği için) o uç noktayla
// düzenleyemiyordu. Bu, admin paneli için ayrı, sahiplik kontrolü olmayan bir sürüm.
export const adminUpdateCourt = async (req, res, next) => {
    try {
        const { name, address, city, district, surface, indoor, fee, feeAmount, lights, description } = req.body;
        const court = await prisma.court.update({
            where: { id: req.params.id },
            data: {
                ...(name !== undefined && { name }),
                ...(address !== undefined && { address: address || null }),
                ...(city !== undefined && { city }),
                ...(district !== undefined && { district: district || null }),
                ...(surface !== undefined && { surface: surface || null }),
                ...(indoor !== undefined && { indoor }),
                ...(fee !== undefined && { fee }),
                ...(feeAmount !== undefined && { feeAmount: feeAmount || null }),
                ...(lights !== undefined && { lights }),
                ...(description !== undefined && { description: description || null }),
            },
        });
        res.json(court);
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

const RATING_APPROVAL_USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

// Voleybol "onaylı antrenör" onayı — VolleyballRating'de COACH rolüyle resmi değerlendirme
// verebilmek için admin tek tek onaylamalı (CoachListing kendi kendine eklendiği için).
export const getCoachRatingApprovals = async (req, res, next) => {
    try {
        const { status } = req.query; // PENDING | APPROVED
        const listings = await prisma.coachListing.findMany({
            where: { subCategory: 'volleyball', status: 'ACTIVE', approvedForRating: status === 'APPROVED' },
            include: { user: { select: RATING_APPROVAL_USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(listings);
    } catch (e) { next(e); }
};

export const setCoachRatingApproval = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'APPROVE' | 'REVOKE'
        await prisma.coachListing.update({
            where: { id },
            data: { approvedForRating: action === 'APPROVE' },
        });
        res.json({ ok: true });
    } catch (e) { next(e); }
};

// Voleybol/tenis/padel "onaylı hakem" onayı — bir maçta hakem olarak davet edilebilmek/
// atanabilmek için admin tek tek onaylamalı (RefereeListing kendi kendine eklendiği için, CV
// ile birlikte başvurulur). CoachListingApproval ile birebir aynı desen — bkz.
// resolveRefereeEligibility.
export const getRefereeApprovals = async (req, res, next) => {
    try {
        const { status } = req.query; // PENDING | APPROVED
        const listings = await prisma.refereeListing.findMany({
            where: { subCategory: { in: REFEREE_APPROVAL_SPORTS }, status: 'ACTIVE', approved: status === 'APPROVED' },
            include: { user: { select: RATING_APPROVAL_USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(listings);
    } catch (e) { next(e); }
};

export const setRefereeApproval = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'APPROVE' | 'REVOKE'
        const listing = await prisma.refereeListing.update({
            where: { id },
            data: { approved: action === 'APPROVE' },
        });
        createNotification(listing.userId,
            action === 'APPROVE' ? 'REFEREE_APPROVED' : 'REFEREE_APPROVAL_REVOKED',
            action === 'APPROVE' ? '✅ Hakemlik Başvurunuz Onaylandı' : '🚫 Hakemlik Onayınız Kaldırıldı',
            action === 'APPROVE'
                ? 'Hakemlik başvurunuz admin tarafından onaylandı — artık maçlara hakem olarak davet edilebilir/atanabilirsiniz.'
                : 'Hakemlik onayınız admin tarafından kaldırıldı, maçlara hakem olarak davet edilemezsiniz.',
            {}
        ).catch(() => {});
        res.json({ ok: true });
    } catch (e) { next(e); }
};

// Voleybol "onaylı antrenör ilanı" onayı — approvedForRating'den AYRI: bu, antrenörün
// VolleyballRating'de COACH rolüyle değerlendirme verebilmesi değil, İLANININ başkalarına
// görünüp ders için rezervasyon alabilmesi için gereken onay (bkz. RefereeApproval ile
// birebir aynı desen — CV ile birlikte başvurulur).
export const getCoachListingApprovals = async (req, res, next) => {
    try {
        const { status } = req.query; // PENDING | APPROVED
        const listings = await prisma.coachListing.findMany({
            where: { subCategory: { in: COACH_APPROVAL_SPORTS }, status: 'ACTIVE', approved: status === 'APPROVED' },
            include: { user: { select: RATING_APPROVAL_USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(listings);
    } catch (e) { next(e); }
};

export const setCoachListingApproval = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action } = req.body; // 'APPROVE' | 'REVOKE'
        const listing = await prisma.coachListing.update({
            where: { id },
            data: { approved: action === 'APPROVE' },
        });
        createNotification(listing.userId,
            action === 'APPROVE' ? 'COACH_LISTING_APPROVED' : 'COACH_APPROVAL_REVOKED',
            action === 'APPROVE' ? '✅ Antrenörlük İlanınız Onaylandı' : '🚫 Antrenörlük Onayınız Kaldırıldı',
            action === 'APPROVE'
                ? 'Antrenörlük başvurunuz admin tarafından onaylandı — ilanınız artık herkese görünüyor.'
                : 'Antrenörlük ilan onayınız admin tarafından kaldırıldı, ilanınız başkalarına görünmüyor.',
            {}
        ).catch(() => {});
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

export const getSupportMessages = async (req, res, next) => {
    try {
        const { status = 'PENDING' } = req.query;
        const messages = await prisma.supportMessage.findMany({
            where: { status },
            include: { user: { select: { id: true, username: true, fullName: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(messages);
    } catch (e) { next(e); }
};

export const replySupportMessage = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reply } = req.body;
        if (!reply?.trim())
            return res.status(400).json({ message: 'Yanıt boş olamaz' });

        const message = await prisma.supportMessage.findUnique({ where: { id } });
        if (!message) return res.status(404).json({ message: 'Mesaj bulunamadı' });
        if (message.status !== 'PENDING') return res.status(400).json({ message: 'Mesaj zaten yanıtlanmış' });

        const updated = await prisma.supportMessage.update({
            where: { id },
            data: { status: 'ANSWERED', adminReply: reply.trim() },
        });

        const { createNotification } = await import('./notification.controller.js');
        createNotification(
            message.userId,
            'SUPPORT_MESSAGE_REPLIED',
            '💬 Destek Mesajınıza Yanıt Geldi',
            reply.trim().slice(0, 120),
            {}
        ).catch(() => {});

        res.json(updated);
    } catch (e) { next(e); }
};
