import prisma from '../config/prisma.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';
import { createNotification, notifyAllAdmins } from './notification.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };
const VENUE_SELECT = { id: true, name: true, branch: true, city: true, district: true, phone: true, website: true };

const clubInclude = {
    user: { select: USER_SELECT },
    venue: { select: VENUE_SELECT },
};

export const getListings = async (req, res, next) => {
    try {
        const { category, subCategory, city, venueId } = req.query;
        const listings = await prisma.clubListing.findMany({
            where: {
                ...(category && { category }),
                ...(subCategory && { subCategory }),
                ...(venueId && { venueId }),
                ...(city ? {
                    OR: [
                        { city: { contains: city, mode: 'insensitive' } },
                        { location: { contains: city, mode: 'insensitive' } },
                    ],
                } : {}),
                // Herkese açık: ACTIVE. Sahibi kendi PENDING/REJECTED kayıtlarını da görür.
                OR: [
                    { status: 'ACTIVE' },
                    ...(req.userId ? [{ userId: req.userId, status: { in: ['PENDING', 'REJECTED'] } }] : []),
                ],
            },
            include: clubInclude,
            orderBy: { createdAt: 'desc' },
        });
        // cities Json içinde de şehir araması — Prisma Json üzerinde contains yok, JS tarafında.
        const q = city && String(city).trim().toLowerCase();
        let filtered = q
            ? listings.filter(l => {
                if ((l.city || '').toLowerCase().includes(q)) return true;
                if ((l.location || '').toLowerCase().includes(q)) return true;
                return Array.isArray(l.cities) && l.cities.some(c => (c || '').toLowerCase().includes(q));
            })
            : listings;

        // İstek sahibi kendi başvurularının durumunu kartlarda görsün (Üye Başvurusu butonu).
        if (req.userId && filtered.length > 0) {
            const apps = await prisma.clubMembershipApplication.findMany({
                where: {
                    applicantId: req.userId,
                    clubListingId: { in: filtered.map(l => l.id) },
                },
                select: { clubListingId: true, status: true },
            });
            const byClub = Object.fromEntries(apps.map(a => [a.clubListingId, a.status]));
            filtered = filtered.map(l => ({
                ...l,
                myMembershipStatus: byClub[l.id] || null,
            }));
        }

        res.json(filtered);
    } catch (err) { next(err); }
};

export const getListing = async (req, res, next) => {
    try {
        const listing = await prisma.clubListing.findUnique({
            where: { id: req.params.id },
            include: clubInclude,
        });
        if (!listing || listing.status !== 'ACTIVE') return res.status(404).json({ message: 'Kulüp bulunamadı' });
        let myMembershipStatus = null;
        if (req.userId) {
            const app = await prisma.clubMembershipApplication.findUnique({
                where: { clubListingId_applicantId: { clubListingId: listing.id, applicantId: req.userId } },
                select: { status: true },
            });
            myMembershipStatus = app?.status || null;
        }
        res.json({ ...listing, myMembershipStatus });
    } catch (err) { next(err); }
};

export const createListing = async (req, res, next) => {
    try {
        const {
            category, subCategory, name, description, location,
            cities, contactPhone, website, membershipFee, photoUrl, venueId,
            courtId, facilityName, facilityCity, facilityDistrict, facilityAddress,
        } = req.body;

        let resolvedCategory = category;
        let resolvedSub = subCategory;
        let resolvedCities = Array.isArray(cities)
            ? [...new Set(cities.map(c => String(c || '').trim()).filter(Boolean))]
            : [];
        let resolvedName = name?.trim() || '';
        let resolvedLocation = location?.trim() || null;
        let resolvedPhone = contactPhone?.trim() || null;
        let resolvedWebsite = website?.trim() || null;
        let linkedVenueId = null;
        let linkedCourtId = null;

        // İşletme tesisinden kulüp — spor dalı tesis.branch'ten gelir
        if (venueId) {
            const venue = await prisma.businessVenue.findUnique({ where: { id: venueId } });
            if (!venue) return res.status(404).json({ message: 'Tesis bulunamadı' });
            if (venue.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
            if (venue.status !== 'APPROVED') return res.status(400).json({ message: 'Sadece onaylı tesisler kulüp açabilir' });
            linkedVenueId = venue.id;
            resolvedCategory = 'SPORTS';
            resolvedSub = venue.branch;
            if (resolvedCities.length === 0 && venue.city) resolvedCities = [venue.city];
            if (!resolvedName) resolvedName = venue.name;
            if (!resolvedLocation) {
                resolvedLocation = [venue.district, venue.address].filter(Boolean).join(' / ') || venue.name;
            }
            if (!resolvedPhone && venue.phone) resolvedPhone = venue.phone;
            if (!resolvedWebsite && venue.website) resolvedWebsite = venue.website;
        }

        // Kayıtlı community Court seçildiyse konum/şehir ondan dolar
        if (!linkedVenueId && courtId) {
            const court = await prisma.court.findUnique({ where: { id: courtId } });
            if (!court || !court.verified) return res.status(400).json({ message: 'Seçilen tesis bulunamadı veya onaylı değil' });
            linkedCourtId = court.id;
            if (!resolvedLocation) {
                resolvedLocation = [court.name, court.district, court.address].filter(Boolean).join(' · ') || court.name;
            }
            if (resolvedCities.length === 0 && court.city) resolvedCities = [court.city];
        }

        // Kayıtlı değilse yeni tesis önerisi → Court pending + admin onayı
        if (!linkedVenueId && !linkedCourtId && facilityName?.trim()) {
            const fCity = (facilityCity || resolvedCities[0] || '').trim();
            if (!fCity) return res.status(400).json({ message: 'Tesis için il seçmelisiniz' });
            const newCourt = await prisma.court.create({
                data: {
                    name: facilityName.trim(),
                    city: fCity,
                    district: facilityDistrict?.trim() || null,
                    address: facilityAddress?.trim() || null,
                    sport: resolvedSub || subCategory || 'tennis',
                    addedBy: req.userId,
                    pending: true,
                    verified: false,
                },
            });
            linkedCourtId = newCourt.id;
            if (!resolvedLocation) {
                resolvedLocation = [newCourt.name, newCourt.district, newCourt.address].filter(Boolean).join(' · ');
            }
            if (resolvedCities.length === 0) resolvedCities = [fCity];
        }

        // Bireysel kulüpte tesis zorunlu (işletme venueId ile gelir)
        if (!linkedVenueId && !linkedCourtId) {
            return res.status(400).json({ message: 'Tesis seçmeli veya yeni tesis bilgisi girmelisiniz' });
        }

        if (!resolvedCategory || !resolvedSub || !resolvedName)
            return res.status(400).json({ message: 'Zorunlu alanlar eksik' });
        if (resolvedCities.length === 0)
            return res.status(400).json({ message: 'En az bir şehir seçmelisiniz' });

        let fee = null;
        if (membershipFee !== undefined && membershipFee !== null && membershipFee !== '') {
            fee = parseInt(membershipFee, 10);
            if (!Number.isFinite(fee) || fee < 0)
                return res.status(400).json({ message: 'Geçersiz üyelik ücreti' });
        }

        const listing = await prisma.clubListing.create({
            data: {
                userId: req.userId,
                venueId: linkedVenueId,
                courtId: linkedCourtId,
                category: resolvedCategory,
                subCategory: resolvedSub,
                name: resolvedName,
                description: description?.trim() || null,
                location: resolvedLocation,
                cities: resolvedCities,
                city: resolvedCities[0],
                contactPhone: resolvedPhone,
                website: resolvedWebsite,
                membershipFee: fee,
                photoUrl: photoUrl?.trim() || null,
                status: 'PENDING',
            },
            include: clubInclude,
        });
        // Admin onayı bekler — şehir abonelerine henüz bildirim yok
        res.status(201).json(listing);

        const submitter = listing.user;
        notifyAllAdmins(
            'CLUB_LISTING_SUBMITTED',
            '🏟️ Yeni Kulüp İlanı Onayı',
            `${submitter?.fullName || submitter?.username || '?'}: "${listing.name}" (${listing.subCategory}) — onay bekliyor.`,
            { clubListingId: listing.id, category: listing.category, subCategory: listing.subCategory },
            { excludeUserId: req.userId },
        ).catch(() => {});
    } catch (err) { next(err); }
};

export const updateListing = async (req, res, next) => {
    try {
        const listing = await prisma.clubListing.findUnique({ where: { id: req.params.id } });
        if (!listing) return res.status(404).json({ message: 'Kulüp bulunamadı' });
        if (listing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const {
            name, description, location, cities, contactPhone,
            website, membershipFee, photoUrl,
        } = req.body;

        const data = {};
        if (name !== undefined) {
            if (!name?.trim()) return res.status(400).json({ message: 'Kulüp adı zorunlu' });
            data.name = name.trim();
        }
        if (description !== undefined) data.description = description?.trim() || null;
        if (location !== undefined) data.location = location?.trim() || null;
        if (contactPhone !== undefined) data.contactPhone = contactPhone?.trim() || null;
        if (website !== undefined) data.website = website?.trim() || null;
        if (photoUrl !== undefined) data.photoUrl = photoUrl?.trim() || null;
        if (cities !== undefined) {
            const cityList = Array.isArray(cities)
                ? [...new Set(cities.map(c => String(c || '').trim()).filter(Boolean))]
                : [];
            if (cityList.length === 0)
                return res.status(400).json({ message: 'En az bir şehir seçmelisiniz' });
            data.cities = cityList;
            data.city = cityList[0];
        }
        if (membershipFee !== undefined) {
            if (membershipFee === null || membershipFee === '') data.membershipFee = null;
            else {
                const fee = parseInt(membershipFee, 10);
                if (!Number.isFinite(fee) || fee < 0)
                    return res.status(400).json({ message: 'Geçersiz üyelik ücreti' });
                data.membershipFee = fee;
            }
        }

        const updated = await prisma.clubListing.update({
            where: { id: listing.id },
            data,
            include: clubInclude,
        });
        res.json(updated);
    } catch (err) { next(err); }
};

export const deleteListing = async (req, res, next) => {
    try {
        const listing = await prisma.clubListing.findUnique({ where: { id: req.params.id } });
        if (!listing) return res.status(404).json({ message: 'Bulunamadı' });
        const requester = await prisma.user.findUnique({
            where: { id: req.userId },
            select: { isAdmin: true },
        });
        if (listing.userId !== req.userId && !requester?.isAdmin)
            return res.status(403).json({ message: 'Yetkisiz' });
        await prisma.clubListing.delete({ where: { id: listing.id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};

export const applyMembership = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { message } = req.body;
        const listing = await prisma.clubListing.findUnique({ where: { id } });
        if (!listing || listing.status !== 'ACTIVE') return res.status(404).json({ message: 'Kulüp bulunamadı' });
        if (listing.userId === req.userId) return res.status(400).json({ message: 'Kendi kulübünüze başvuru gönderemezsiniz' });

        const existing = await prisma.clubMembershipApplication.findUnique({
            where: { clubListingId_applicantId: { clubListingId: id, applicantId: req.userId } },
        });
        if (existing && existing.status !== 'REJECTED') {
            return res.status(400).json({ message: 'Bu kulübe zaten başvurdunuz', status: existing.status });
        }

        if (existing) {
            await prisma.clubMembershipApplication.update({
                where: { clubListingId_applicantId: { clubListingId: id, applicantId: req.userId } },
                data: { status: 'PENDING', message: message?.trim() || null },
            });
        } else {
            await prisma.clubMembershipApplication.create({
                data: {
                    clubListingId: id,
                    applicantId: req.userId,
                    message: message?.trim() || null,
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
            'CLUB_MEMBERSHIP',
            'Yeni üyelik başvurusu',
            `${who} — ${listing.name}`,
            {
                clubListingId: listing.id,
                venueId: listing.venueId || null,
                category: listing.category,
                subCategory: listing.subCategory,
            },
        ).catch(() => {});
    } catch (err) { next(err); }
};

export const getMembershipApplications = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.clubListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'Kulüp bulunamadı' });
        if (listing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });

        const { status } = req.query;
        const requests = await prisma.clubMembershipApplication.findMany({
            where: {
                clubListingId: id,
                ...(status ? { status } : {}),
            },
            include: { applicant: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    } catch (err) { next(err); }
};

export const respondMembershipApplication = async (req, res, next) => {
    try {
        const { reqId } = req.params;
        const { action } = req.body; // 'accept' | 'reject'
        const app = await prisma.clubMembershipApplication.findUnique({
            where: { id: reqId },
            include: { clubListing: true },
        });
        if (!app) return res.status(404).json({ message: 'Başvuru bulunamadı' });
        if (app.clubListing.userId !== req.userId) return res.status(403).json({ message: 'Yetkisiz' });
        if (app.status !== 'PENDING') return res.status(400).json({ message: 'Bu başvuru artık bekleyen durumda değil' });
        if (action !== 'accept' && action !== 'reject')
            return res.status(400).json({ message: 'Geçersiz işlem' });

        const status = action === 'accept' ? 'ACCEPTED' : 'REJECTED';
        await prisma.clubMembershipApplication.update({
            where: { id: reqId },
            data: { status },
        });
        res.json({ message: action === 'accept' ? 'Başvuru kabul edildi' : 'Başvuru reddedildi' });

        createNotification(
            app.applicantId,
            'CLUB_MEMBERSHIP',
            action === 'accept' ? 'Üyelik başvurunuz kabul edildi' : 'Üyelik başvurunuz reddedildi',
            app.clubListing.name,
            {
                clubListingId: app.clubListing.id,
                category: app.clubListing.category,
                subCategory: app.clubListing.subCategory,
                status,
            },
        ).catch(() => {});
    } catch (err) { next(err); }
};

// ── Admin: kulüp onay kuyruğu ─────────────────────────────────────────────────
export const getClubApprovals = async (req, res, next) => {
    try {
        const { status } = req.query; // PENDING | ACTIVE | REJECTED
        const where = status === 'ACTIVE'
            ? { status: 'ACTIVE' }
            : status === 'REJECTED'
                ? { status: 'REJECTED' }
                : { status: 'PENDING' };
        const items = await prisma.clubListing.findMany({
            where,
            include: clubInclude,
            orderBy: { createdAt: 'desc' },
        });
        const courtIds = [...new Set(items.map(i => i.courtId).filter(Boolean))];
        let courtById = {};
        if (courtIds.length) {
            const courts = await prisma.court.findMany({
                where: { id: { in: courtIds } },
                select: { id: true, name: true, city: true, district: true, address: true, pending: true, verified: true },
            });
            courtById = Object.fromEntries(courts.map(c => [c.id, c]));
        }
        res.json(items.map(i => ({ ...i, court: i.courtId ? (courtById[i.courtId] || null) : null })));
    } catch (err) { next(err); }
};

export const setClubApproval = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { action, adminNote } = req.body; // APPROVE | REJECT | REVOKE
        const listing = await prisma.clubListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'Kulüp bulunamadı' });

        let status = listing.status;
        if (action === 'APPROVE') status = 'ACTIVE';
        else if (action === 'REJECT') status = 'REJECTED';
        else if (action === 'REVOKE') status = 'PENDING';
        else return res.status(400).json({ message: 'Geçersiz işlem' });

        const updated = await prisma.clubListing.update({
            where: { id },
            data: {
                status,
                adminNote: adminNote?.trim() || null,
            },
            include: clubInclude,
        });

        if (action === 'APPROVE' && listing.courtId) {
            await prisma.court.updateMany({
                where: { id: listing.courtId, pending: true },
                data: { pending: false, verified: true },
            }).catch(() => {});
        }

        createNotification(
            listing.userId,
            'CLUB_APPROVAL',
            action === 'APPROVE' ? 'Kulübünüz onaylandı' : action === 'REJECT' ? 'Kulüp talebiniz reddedildi' : 'Kulüp onayı geri alındı',
            listing.name,
            { clubListingId: listing.id, category: listing.category, subCategory: listing.subCategory, status },
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
                tab: 'clubs',
            });
            notifyActivityAlertSubscribers({
                subCategory: listing.subCategory,
                category: listing.category,
                senderCity: listing.city || null,
                senderUsername: creatorInfo?.username || '',
                senderId: listing.userId,
                itemId: listing.id,
                tab: 'clubs',
            });
        }

        res.json(updated);
    } catch (err) { next(err); }
};
