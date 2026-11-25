import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';
import { createNotification, notifyAllAdmins } from './notification.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true, gender: true };

const gymInclude = {
    user: { select: USER_SELECT },
};

function parseIntOrNull(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = parseInt(v, 10);
    return Number.isFinite(n) && n >= 0 ? n : NaN;
}

function normalizeCities(cities, city) {
    const list = Array.isArray(cities)
        ? [...new Set(cities.map(c => String(c || '').trim()).filter(Boolean))]
        : [];
    if (list.length === 0 && city?.trim()) list.push(city.trim());
    return list;
}

function newQrToken() {
    return crypto.randomUUID();
}

function mapListingForViewer(listing, reqUserId, membershipStatus = null) {
    return {
        ...listing,
        myMembershipStatus: membershipStatus,
        // QR token sadece üyenin kendisine ve salon sahibine
        members: undefined,
    };
}

export const getListings = async (req, res, next) => {
    try {
        const {
            category, subCategory, city, district,
            minMonthlyFee, maxMonthlyFee, minSquareMeters, maxSquareMeters,
        } = req.query;

        const listings = await prisma.gymListing.findMany({
            where: {
                ...(category && { category }),
                ...(subCategory && { subCategory }),
                ...(district ? { district: { contains: String(district), mode: 'insensitive' } } : {}),
                ...(minMonthlyFee || maxMonthlyFee ? {
                    monthlyFee: {
                        ...(minMonthlyFee ? { gte: parseInt(minMonthlyFee, 10) } : {}),
                        ...(maxMonthlyFee ? { lte: parseInt(maxMonthlyFee, 10) } : {}),
                    },
                } : {}),
                ...(minSquareMeters || maxSquareMeters ? {
                    squareMeters: {
                        ...(minSquareMeters ? { gte: parseInt(minSquareMeters, 10) } : {}),
                        ...(maxSquareMeters ? { lte: parseInt(maxSquareMeters, 10) } : {}),
                    },
                } : {}),
                OR: [
                    { status: 'ACTIVE' },
                    ...(req.userId ? [{ userId: req.userId, status: { in: ['PENDING', 'REJECTED'] } }] : []),
                ],
            },
            include: gymInclude,
            orderBy: { createdAt: 'desc' },
        });

        const q = city && String(city).trim().toLowerCase();
        let filtered = q
            ? listings.filter(l => {
                if ((l.city || '').toLowerCase().includes(q)) return true;
                if ((l.address || '').toLowerCase().includes(q)) return true;
                if ((l.district || '').toLowerCase().includes(q)) return true;
                return Array.isArray(l.cities) && l.cities.some(c => (c || '').toLowerCase().includes(q));
            })
            : listings;

        if (req.userId && filtered.length > 0) {
            const apps = await prisma.gymMember.findMany({
                where: {
                    userId: req.userId,
                    gymListingId: { in: filtered.map(l => l.id) },
                },
                select: { gymListingId: true, status: true },
            });
            const byGym = Object.fromEntries(apps.map(a => [a.gymListingId, a.status]));
            filtered = filtered.map(l => mapListingForViewer(l, req.userId, byGym[l.id] || null));
        } else {
            filtered = filtered.map(l => mapListingForViewer(l, null, null));
        }

        // Liste kartlarında yıldız ortalaması
        if (filtered.length > 0) {
            const stats = await prisma.gymReview.groupBy({
                by: ['gymListingId'],
                where: { gymListingId: { in: filtered.map(l => l.id) } },
                _avg: { rating: true },
                _count: { rating: true },
            });
            const byId = Object.fromEntries(stats.map(s => [s.gymListingId, {
                avgRating: s._avg.rating != null ? Math.round(s._avg.rating * 10) / 10 : null,
                reviewCount: s._count.rating,
            }]));
            filtered = filtered.map(l => ({
                ...l,
                avgRating: byId[l.id]?.avgRating ?? null,
                reviewCount: byId[l.id]?.reviewCount ?? 0,
            }));
        }

        res.json(filtered);
    } catch (err) { next(err); }
};

export const getListing = async (req, res, next) => {
    try {
        const listing = await prisma.gymListing.findUnique({
            where: { id: req.params.id },
            include: gymInclude,
        });
        if (!listing) return res.status(404).json({ message: 'Salon bulunamadı' });
        if (listing.status !== 'ACTIVE' && listing.userId !== req.userId)
            return res.status(404).json({ message: 'Salon bulunamadı' });

        let myMembership = null;
        if (req.userId) {
            myMembership = await prisma.gymMember.findUnique({
                where: { gymListingId_userId: { gymListingId: listing.id, userId: req.userId } },
            });
        }

        const isOwner = listing.userId === req.userId;
        res.json({
            ...listing,
            myMembershipStatus: myMembership?.status || null,
            // Üye kendi QR'sini görsün; sahibi tüm aktif üyeleri yönetirken token'a ihtiyaç duymaz
            myQrToken: myMembership?.status === 'ACTIVE' ? myMembership.qrToken : undefined,
            myMemberId: myMembership?.id || undefined,
            activeMemberCount: isOwner
                ? await prisma.gymMember.count({ where: { gymListingId: listing.id, status: 'ACTIVE' } })
                : undefined,
        });
    } catch (err) { next(err); }
};

export const createListing = async (req, res, next) => {
    try {
        const {
            category = 'SPORTS', subCategory = 'fitness_gym',
            name, description, address, city, cities, district, photos,
            monthlyFee, weeklyFee, dailyFee, memberCount,
            openTime, closeTime, squareMeters,
            lockerMale, lockerFemale, showerMale, showerFemale,
            wcMale, wcFemale, dressingRoomMale, dressingRoomFemale,
            equipmentList, salesList, amenities,
            contactPhone, website, instagram,
        } = req.body;

        const resolvedName = name?.trim();
        if (!resolvedName) return res.status(400).json({ message: 'Salon adı zorunlu' });

        const cityList = normalizeCities(cities, city);
        if (cityList.length === 0)
            return res.status(400).json({ message: 'En az bir şehir seçmelisiniz' });

        const nums = {
            monthlyFee: parseIntOrNull(monthlyFee),
            weeklyFee: parseIntOrNull(weeklyFee),
            dailyFee: parseIntOrNull(dailyFee),
            memberCount: parseIntOrNull(memberCount),
            squareMeters: parseIntOrNull(squareMeters),
            lockerMale: parseIntOrNull(lockerMale),
            lockerFemale: parseIntOrNull(lockerFemale),
            showerMale: parseIntOrNull(showerMale),
            showerFemale: parseIntOrNull(showerFemale),
            wcMale: parseIntOrNull(wcMale),
            wcFemale: parseIntOrNull(wcFemale),
            dressingRoomMale: parseIntOrNull(dressingRoomMale),
            dressingRoomFemale: parseIntOrNull(dressingRoomFemale),
        };
        for (const [k, v] of Object.entries(nums)) {
            if (Number.isNaN(v)) return res.status(400).json({ message: `Geçersiz sayı: ${k}` });
        }

        const photoArr = Array.isArray(photos)
            ? photos.map(p => String(p || '').trim()).filter(Boolean).slice(0, 12)
            : [];

        const listing = await prisma.gymListing.create({
            data: {
                userId: req.userId,
                category,
                subCategory: subCategory || 'fitness_gym',
                name: resolvedName,
                description: description?.trim() || null,
                address: address?.trim() || null,
                city: cityList[0],
                cities: cityList,
                district: district?.trim() || null,
                photos: photoArr,
                ...nums,
                openTime: openTime?.trim() || null,
                closeTime: closeTime?.trim() || null,
                equipmentList: equipmentList?.trim() || null,
                salesList: salesList?.trim() || null,
                amenities: amenities?.trim() || null,
                contactPhone: contactPhone?.trim() || null,
                website: website?.trim() || null,
                instagram: instagram?.trim() || null,
                status: 'PENDING',
            },
            include: gymInclude,
        });

        res.status(201).json(listing);

        const submitter = listing.user;
        notifyAllAdmins(
            'GYM_LISTING_SUBMITTED',
            '🏋️ Yeni Spor Salonu Onayı',
            `${submitter?.fullName || submitter?.username || '?'}: "${listing.name}" — onay bekliyor.`,
            { gymListingId: listing.id, category: listing.category, subCategory: listing.subCategory },
            { excludeUserId: req.userId },
        ).catch(() => {});
    } catch (err) { next(err); }
};

export const updateListing = async (req, res, next) => {
    try {
        const listing = await prisma.gymListing.findUnique({ where: { id: req.params.id } });
        if (!listing) return res.status(404).json({ message: 'Salon bulunamadı' });
        if (listing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const body = req.body || {};
        const data = {};
        if (body.name !== undefined) {
            if (!body.name?.trim()) return res.status(400).json({ message: 'Salon adı zorunlu' });
            data.name = body.name.trim();
        }
        const strFields = [
            'description', 'address', 'district', 'openTime', 'closeTime',
            'equipmentList', 'salesList', 'amenities', 'contactPhone', 'website', 'instagram',
        ];
        for (const f of strFields) {
            if (body[f] !== undefined) data[f] = body[f]?.trim?.() || body[f] || null;
        }
        if (body.cities !== undefined || body.city !== undefined) {
            const cityList = normalizeCities(body.cities, body.city ?? listing.city);
            if (cityList.length === 0)
                return res.status(400).json({ message: 'En az bir şehir seçmelisiniz' });
            data.cities = cityList;
            data.city = cityList[0];
        }
        if (body.photos !== undefined) {
            data.photos = Array.isArray(body.photos)
                ? body.photos.map(p => String(p || '').trim()).filter(Boolean).slice(0, 12)
                : [];
        }
        const numFields = [
            'monthlyFee', 'weeklyFee', 'dailyFee', 'memberCount', 'squareMeters',
            'lockerMale', 'lockerFemale', 'showerMale', 'showerFemale',
            'wcMale', 'wcFemale', 'dressingRoomMale', 'dressingRoomFemale',
        ];
        for (const f of numFields) {
            if (body[f] !== undefined) {
                const n = parseIntOrNull(body[f]);
                if (Number.isNaN(n)) return res.status(400).json({ message: `Geçersiz sayı: ${f}` });
                data[f] = n;
            }
        }

        const updated = await prisma.gymListing.update({
            where: { id: listing.id },
            data,
            include: gymInclude,
        });
        res.json(updated);
    } catch (err) { next(err); }
};

export const deleteListing = async (req, res, next) => {
    try {
        const listing = await prisma.gymListing.findUnique({ where: { id: req.params.id } });
        if (!listing) return res.status(404).json({ message: 'Bulunamadı' });
        const requester = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { isAdmin: true },
        });
        if (listing.userId !== req.userId && !requester?.isAdmin)
            return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.gymListing.delete({ where: { id: listing.id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};

export const applyMembership = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        const listing = await prisma.gymListing.findUnique({ where: { id } });
        if (!listing || listing.status !== 'ACTIVE')
            return res.status(404).json({ message: 'Salon bulunamadı' });
        if (listing.userId === req.userId)
            return res.status(400).json({ message: 'Kendi salonunuza başvuru gönderemezsiniz' });

        const existing = await prisma.gymMember.findUnique({
            where: { gymListingId_userId: { gymListingId: id, userId: req.userId } },
        });
        if (existing && existing.status !== 'REJECTED' && existing.status !== 'REVOKED') {
            return res.status(400).json({ message: 'Bu salona zaten başvurdunuz', status: existing.status });
        }

        if (existing) {
            await prisma.gymMember.update({
                where: { id: existing.id },
                data: {
                    status: 'PENDING',
                    message: message?.trim() || null,
                    qrToken: newQrToken(),
                    endedAt: null,
                },
            });
        } else {
            await prisma.gymMember.create({
                data: {
                    gymListingId: id,
                    userId: req.userId,
                    message: message?.trim() || null,
                    qrToken: newQrToken(),
                },
            });
        }
        res.status(201).json({ message: 'Üyelik başvurusu gönderildi' });

        const applicant = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { username: true, fullName: true },
        }).catch(() => null);
        const who = applicant?.fullName || applicant?.username || 'Bir kullanıcı';
        createNotification(
            listing.userId,
            'GYM_MEMBERSHIP',
            'Yeni salon üyelik başvurusu',
            `${who} — ${listing.name}`,
            {
                gymListingId: listing.id,
                category: listing.category,
                subCategory: listing.subCategory,
            },
        ).catch(() => {});
    } catch (err) { next(err); }
};

export const getMembershipApplications = async (req, res, next) => {
    try {
        const listing = await prisma.gymListing.findUnique({ where: { id: req.params.id } });
        if (!listing) return res.status(404).json({ message: 'Salon bulunamadı' });
        if (listing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const { status } = req.query;
        const requests = await prisma.gymMember.findMany({
            where: {
                gymListingId: listing.id,
                ...(status ? { status } : {}),
            },
            include: { user: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        // Sahibe üye QR token'larını gösterme — tarama check-in endpoint'i ile yapılır
        res.json(requests.map(r => ({ ...r, qrToken: undefined })));
    } catch (err) { next(err); }
};

export const respondMembershipApplication = async (req, res, next) => {
    try {
        const { reqId } = req.params;
        const { action } = req.body; // accept | reject | revoke
        const app = await prisma.gymMember.findUnique({
            where: { id: reqId },
            include: { gymListing: true },
        });
        if (!app) return res.status(404).json({ message: 'Başvuru bulunamadı' });
        if (app.gymListing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        let status;
        if (action === 'accept') {
            if (app.status !== 'PENDING') return res.status(400).json({ message: 'Bu başvuru bekleyen durumda değil' });
            status = 'ACTIVE';
        } else if (action === 'reject') {
            if (app.status !== 'PENDING') return res.status(400).json({ message: 'Bu başvuru bekleyen durumda değil' });
            status = 'REJECTED';
        } else if (action === 'revoke') {
            if (app.status !== 'ACTIVE') return res.status(400).json({ message: 'Sadece aktif üyelik iptal edilebilir' });
            status = 'REVOKED';
        } else {
            return res.status(400).json({ message: 'Geçersiz işlem' });
        }

        await prisma.gymMember.update({
            where: { id: reqId },
            data: {
                status,
                // Kabulde yeni QR — eski token sızmış olsa bile geçersiz kalsın
                ...(status === 'ACTIVE' ? { qrToken: newQrToken(), endedAt: null } : {}),
                // İptal → Arşiv > Salonlar; endedAt tarih filtresi için
                ...(status === 'REVOKED' ? { endedAt: new Date() } : {}),
            },
        });
        res.json({ message: status === 'ACTIVE' ? 'Üyelik onaylandı' : status === 'REJECTED' ? 'Başvuru reddedildi' : 'Üyelik iptal edildi' });

        createNotification(
            app.userId,
            'GYM_MEMBERSHIP',
            status === 'ACTIVE' ? 'Salon üyeliğiniz onaylandı' : status === 'REJECTED' ? 'Salon başvurunuz reddedildi' : 'Salon üyeliğiniz iptal edildi',
            app.gymListing.name,
            {
                gymListingId: app.gymListing.id,
                category: app.gymListing.category,
                subCategory: app.gymListing.subCategory,
                status,
            },
        ).catch(() => {});
    } catch (err) { next(err); }
};

// Arşiv > Salonlar — history=past → REVOKED; history=active → ACTIVE.
export const getMyMemberships = async (req, res, next) => {
    try {
        const { category, subCategory, city, district, dateFrom, dateTo, history } = req.query;
        const dateFilter = {
            ...(dateFrom && { gte: new Date(dateFrom) }),
            ...(dateTo && { lte: new Date(dateTo) }),
        };
        const hasDate = Object.keys(dateFilter).length > 0;
        const statusFilter = history === 'past'
            ? { status: 'REVOKED' }
            : history === 'active'
                ? { status: 'ACTIVE' }
                : { status: { in: ['ACTIVE', 'REVOKED'] } };

        const apps = await prisma.gymMember.findMany({
            where: {
                userId: req.userId,
                ...statusFilter,
                ...(hasDate && history === 'past'
                    ? { endedAt: dateFilter }
                    : hasDate
                        ? { OR: [{ endedAt: dateFilter }, { createdAt: dateFilter }] }
                        : {}),
                gymListing: {
                    ...(category && { category }),
                    ...(subCategory && { subCategory }),
                },
            },
            include: { gymListing: { include: gymInclude } },
            orderBy: [{ endedAt: 'desc' }, { updatedAt: 'desc' }],
            take: 100,
        });

        const qCity = city && String(city).trim().toLowerCase();
        const qDistrict = district && String(district).trim().toLowerCase();
        const filtered = apps.filter(a => {
            const g = a.gymListing;
            if (!g) return false;
            if (qCity) {
                const inCity = (g.city || '').toLowerCase().includes(qCity)
                    || (g.address || '').toLowerCase().includes(qCity)
                    || (g.district || '').toLowerCase().includes(qCity)
                    || (Array.isArray(g.cities) && g.cities.some(c => (c || '').toLowerCase().includes(qCity)));
                if (!inCity) return false;
            }
            if (qDistrict) {
                const inDistrict = (g.district || '').toLowerCase().includes(qDistrict)
                    || (g.address || '').toLowerCase().includes(qDistrict);
                if (!inDistrict) return false;
            }
            return true;
        });

        res.json(filtered.map(a => ({
            id: a.id,
            status: a.status,
            message: a.message,
            createdAt: a.createdAt,
            endedAt: a.endedAt,
            updatedAt: a.updatedAt,
            gym: a.gymListing,
        })));
    } catch (err) { next(err); }
};

// Üye kendi aktif üyeliğinden ayrılır → REVOKED, Arşiv > Salonlar'a düşer.
export const leaveMembership = async (req, res, next) => {
    try {
        const { id } = req.params;
        const app = await prisma.gymMember.findUnique({
            where: { gymListingId_userId: { gymListingId: id, userId: req.userId } },
            include: { gymListing: true },
        });
        if (!app) return res.status(404).json({ message: 'Üyelik bulunamadı' });
        if (app.status !== 'ACTIVE') {
            return res.status(400).json({ message: 'Sadece aktif üyelikten ayrılabilirsiniz', status: app.status });
        }
        const updated = await prisma.gymMember.update({
            where: { id: app.id },
            data: { status: 'REVOKED', endedAt: new Date(), qrToken: newQrToken() },
            include: { gymListing: { include: gymInclude } },
        });
        res.json({
            id: updated.id,
            status: updated.status,
            endedAt: updated.endedAt,
            gym: updated.gymListing,
        });

        createNotification(
            app.gymListing.userId,
            'GYM_MEMBERSHIP',
            'Üyelikten ayrılma',
            app.gymListing.name,
            {
                gymListingId: app.gymListing.id,
                category: app.gymListing.category,
                subCategory: app.gymListing.subCategory,
                status: 'REVOKED',
            },
        ).catch(() => {});
    } catch (err) { next(err); }
};

// Üye kendi QR kartını görür
export const getMyMembershipQr = async (req, res, next) => {
    try {
        const member = await prisma.gymMember.findFirst({
            where: {
                gymListingId: req.params.id,
                userId: req.userId,
                status: 'ACTIVE',
            },
            include: {
                gymListing: { select: { id: true, name: true, address: true, city: true } },
            },
        });
        if (!member) return res.status(404).json({ message: 'Aktif üyeliğiniz yok' });
        res.json({
            memberId: member.id,
            qrToken: member.qrToken,
            qrPayload: `ACTIVITY_GYM:${member.qrToken}`,
            gym: member.gymListing,
        });
    } catch (err) { next(err); }
};

// Salon sahibi QR tarayınca giriş veya çıkış kaydı
export const scanCheck = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { qrPayload, type } = req.body; // type: CHECK_IN | CHECK_OUT | AUTO
        const listing = await prisma.gymListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'Salon bulunamadı' });
        if (listing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const raw = String(qrPayload || '').trim();
        const token = raw.startsWith('ACTIVITY_GYM:') ? raw.slice('ACTIVITY_GYM:'.length) : raw;
        if (!token) return res.status(400).json({ message: 'Geçersiz QR' });

        const member = await prisma.gymMember.findUnique({
            where: { qrToken: token },
            include: { user: { select: USER_SELECT } },
        });
        if (!member || member.gymListingId !== listing.id)
            return res.status(404).json({ message: 'Bu salona ait üye QR bulunamadı' });
        if (member.status !== 'ACTIVE')
            return res.status(400).json({ message: 'Üyelik aktif değil' });

        let checkType = type;
        if (!checkType || checkType === 'AUTO') {
            const last = await prisma.gymCheckIn.findFirst({
                where: { memberId: member.id },
                orderBy: { createdAt: 'desc' },
            });
            checkType = last?.type === 'CHECK_IN' ? 'CHECK_OUT' : 'CHECK_IN';
        }
        if (checkType !== 'CHECK_IN' && checkType !== 'CHECK_OUT')
            return res.status(400).json({ message: 'Geçersiz işlem türü' });

        const row = await prisma.gymCheckIn.create({
            data: {
                gymListingId: listing.id,
                memberId: member.id,
                type: checkType,
                scannedById: req.userId,
            },
        });

        res.status(201).json({
            checkIn: row,
            type: checkType,
            member: member.user,
            message: checkType === 'CHECK_IN' ? 'Giriş kaydedildi' : 'Çıkış kaydedildi',
        });
    } catch (err) { next(err); }
};

export const getCheckIns = async (req, res, next) => {
    try {
        const listing = await prisma.gymListing.findUnique({ where: { id: req.params.id } });
        if (!listing) return res.status(404).json({ message: 'Salon bulunamadı' });
        if (listing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
        const rows = await prisma.gymCheckIn.findMany({
            where: { gymListingId: listing.id },
            include: {
                member: { include: { user: { select: USER_SELECT } } },
            },
            orderBy: { createdAt: 'desc' },
            take: limit,
        });
        res.json(rows);
    } catch (err) { next(err); }
};

// ── Admin onay ───────────────────────────────────────────────────────────────
export const getGymApprovals = async (req, res, next) => {
    try {
        const { status } = req.query;
        const where = status === 'ACTIVE'
            ? { status: 'ACTIVE' }
            : status === 'REJECTED'
                ? { status: 'REJECTED' }
                : { status: 'PENDING' };
        const items = await prisma.gymListing.findMany({
            where,
            include: gymInclude,
            orderBy: { createdAt: 'desc' },
        });
        res.json(items);
    } catch (err) { next(err); }
};

export const setGymApproval = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action, adminNote } = req.body; // APPROVE | REJECT | REVOKE
        const listing = await prisma.gymListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'Salon bulunamadı' });

        let status = listing.status;
        if (action === 'APPROVE') status = 'ACTIVE';
        else if (action === 'REJECT') status = 'REJECTED';
        else if (action === 'REVOKE') status = 'PENDING';
        else return res.status(400).json({ message: 'Geçersiz işlem' });

        const updated = await prisma.gymListing.update({
            where: { id },
            data: { status, adminNote: adminNote?.trim() || null },
            include: gymInclude,
        });

        createNotification(
            listing.userId,
            'GYM_APPROVAL',
            action === 'APPROVE' ? 'Salonunuz onaylandı' : action === 'REJECT' ? 'Salon talebiniz reddedildi' : 'Salon onayı geri alındı',
            listing.name,
            { gymListingId: listing.id, category: listing.category, subCategory: listing.subCategory, status },
        ).catch(() => {});

        if (action === 'APPROVE') {
            const creatorInfo = await prisma.user.findUnique({
                where: { id: listing.userId },
                select: { username: true },
            }).catch(() => null);
            notifyCitySubscribers({
                subCategory: listing.subCategory,
                category: listing.category,
                senderCity: listing.city || null,
                senderUsername: creatorInfo?.username || '',
                senderId: listing.userId,
                itemId: listing.id,
                tab: 'gyms',
            });
            notifyActivityAlertSubscribers({
                subCategory: listing.subCategory,
                category: listing.category,
                senderCity: listing.city || null,
                senderUsername: creatorInfo?.username || '',
                senderId: listing.userId,
                itemId: listing.id,
                tab: 'gyms',
            });
        }

        res.json(updated);
    } catch (err) { next(err); }
};

export const getReviews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.gymListing.findUnique({ where: { id }, select: { id: true, userId: true, status: true } });
        if (!listing || (listing.status !== 'ACTIVE' && listing.userId !== req.userId))
            return res.status(404).json({ message: 'Salon bulunamadı' });

        const reviews = await prisma.gymReview.findMany({
            where: { gymListingId: id },
            include: { reviewer: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        const myReview = req.userId
            ? reviews.find(r => r.reviewerId === req.userId) || null
            : null;
        res.json({
            reviews,
            avgRating: reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : null,
            reviewCount: reviews.length,
            canReview: !!req.userId && listing.userId !== req.userId,
            myReview,
        });
    } catch (err) { next(err); }
};

export const submitReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const r = parseInt(rating, 10);
        if (!r || r < 1 || r > 5) return res.status(400).json({ message: 'Geçerli bir yıldız puanı girin (1-5)' });

        const listing = await prisma.gymListing.findUnique({ where: { id } });
        if (!listing || listing.status !== 'ACTIVE')
            return res.status(404).json({ message: 'Salon bulunamadı' });
        if (listing.userId === req.userId)
            return res.status(400).json({ message: 'Kendi salonunuza değerlendirme yapamazsınız' });

        const review = await prisma.gymReview.upsert({
            where: { gymListingId_reviewerId: { gymListingId: id, reviewerId: req.userId } },
            update: { rating: r, comment: comment?.trim() || null },
            create: {
                gymListingId: id,
                reviewerId: req.userId,
                rating: r,
                comment: comment?.trim() || null,
            },
            include: { reviewer: { select: USER_SELECT } },
        });
        res.status(201).json(review);
    } catch (err) { next(err); }
};
