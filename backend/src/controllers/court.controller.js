import prisma from '../config/prisma.js';
import { Prisma } from '@prisma/client';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';

export const addCourt = async (req, res, next) => {
    try {
        const { name, address, city, district, country, lat, lng, sport, surface, indoor, fee, feeAmount, lights, description } = req.body;

        const court = await prisma.court.create({
            data: {
                name,
                address,
                city,
                district,
                country,
                lat: lat ? Number(lat) : null,
                lng: lng ? Number(lng) : null,
                sport: sport || 'tennis',
                surface,
                indoor: indoor || false,
                fee: fee || false,
                feeAmount: feeAmount || null,
                lights: lights || false,
                description,
                addedBy: req.userId,
            },
            include: {
                user: {
                    select: { id: true, username: true, fullName: true },
                },
            },
        });

        res.status(201).json(court);
    } catch (error) {
        next(error);
    }
};

export const getAllCourts = async (req, res, next) => {
    try {
        const { sport, city, page = 1, limit = 20 } = req.query;
        const courts = await prisma.court.findMany({
            where: {
                ...(sport && { sport }),
                ...(city  && { city: { contains: city, mode: 'insensitive' } }),
            },
            include: { user: { select: { id: true, username: true } } },
            orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
            skip: (Number(page) - 1) * Number(limit),
            take: Number(limit),
        });
        const total = await prisma.court.count({
            where: {
                ...(sport && { sport }),
                ...(city  && { city: { contains: city, mode: 'insensitive' } }),
            },
        });
        res.json({ courts, total });
    } catch (error) { next(error); }
};

export const searchCourts = async (req, res, next) => {
    try {
        const { city, sport, surface, indoor } = req.query;
        const name = req.query.name || req.query.q;

        const courtWhere = {
            ...(name ? { name: { contains: name, mode: 'insensitive' } } : {}),
            ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
            sport: sport || undefined,
            surface: surface || undefined,
            indoor: indoor === 'true' ? true : indoor === 'false' ? false : undefined,
            // Admin onayı almamış (verified:false) community kort kayıtları hiçbir dalda/
            // ekranda öneri olarak çıkmamalı — eskiden bu sadece mobil tarafın gönderdiği
            // verifiedOnly='true' parametresine bağlıydı, birçok çağrı noktası bu parametreyi
            // hiç göndermediği için onaysız kayıtlar öneri listesine sızıyordu.
            verified: true,
        };

        const [courts, venues] = await Promise.all([
            prisma.court.findMany({
                where: courtWhere,
                include: { user: { select: { id: true, username: true } } },
                orderBy: [{ verified: 'desc' }, { createdAt: 'desc' }],
            }),
            prisma.businessVenue.findMany({
                where: {
                    status: 'APPROVED',
                    ...(sport ? { branch: { equals: sport, mode: 'insensitive' } } : {}),
                    ...(name
                        ? {
                            OR: [
                                { name:   { contains: name, mode: 'insensitive' } },
                                { courts: { some: { name: { contains: name, mode: 'insensitive' } } } },
                            ],
                          }
                        : {}),
                    ...(city ? { city: { contains: city, mode: 'insensitive' } } : {}),
                },
                include: {
                    courts: true,
                    user: { select: { id: true, username: true, businessName: true, businessIban: true, businessIbanHolder: true } },
                },
                orderBy: { createdAt: 'desc' },
            }),
        ]);

        // Kort rating ortalamaları
        const courtIds = courts.map(c => c.id);
        const courtRatings = courtIds.length ? await prisma.courtRating.groupBy({
            by: ['courtId'],
            where: { courtId: { in: courtIds } },
            _avg: { rating: true },
            _count: { id: true },
        }) : [];
        const courtRatingMap = Object.fromEntries(courtRatings.map(r => [r.courtId, { avg: r._avg.rating, count: r._count.id }]));

        // Tesis rating ortalamaları
        const venueIds = venues.map(v => v.id);
        const venueRatings = venueIds.length ? await prisma.venueReview.groupBy({
            by: ['venueId'],
            where: { venueId: { in: venueIds }, courtId: null, status: 'APPROVED' },
            _avg: { rating: true },
            _count: { id: true },
        }) : [];
        const venueRatingMap = Object.fromEntries(venueRatings.map(r => [r.venueId, { avg: r._avg.rating, count: r._count.id }]));

        // Onaylı bir BusinessVenue ile aynı/çakışan community Court kayıtlarını gizle.
        // Bunlar genelde tesis düzgün kaydedilmeden önce eklenmiş eski/yinelenen kayıtlardır —
        // seçilirse gerçek rezervasyon sistemine (VenueCourt) bağlanmadığı için işletmenin
        // takvimi hiç bloklanmaz (örn. tesis "Buro", eski Court kaydı "Buro Kort 1").
        // Kort adı, tesis adıyla aynı kelimeyle başlıyorsa (ardından bir kelime sınırı
        // geliyorsa — sadece harf/rakam bitişik değilse) yinelenen kabul edilir; bu sayede
        // "Buro" ile baslayan ama alakasiz bir tesis adi (orn. "Burolar Sahasi") yanlislikla
        // eslesmez ama "Buro Kort 1", "Buro 1", "Buro-2" gibi turevler yakalanir.
        const normalize = (s) => (s || '').toLowerCase().trim().replace(/\s+/g, ' ');
        const isDuplicateOfVenue = (courtName) => {
            const c = normalize(courtName);
            return venues.some(v => {
                const vn = normalize(v.name);
                if (!vn) return false;
                if (c === vn) return true;
                if (!c.startsWith(vn)) return false;
                const rest = c.slice(vn.length);
                return /^[^a-z0-9çğıöşü]/i.test(rest); // sonraki karakter harf/rakam değilse gerçek kelime sınırıdır
            });
        };
        const courts_ = courts.filter(c => !isDuplicateOfVenue(c.name));

        const courtsWithRating = courts_.map(c => ({
            ...c,
            avgRating:   courtRatingMap[c.id]?.avg   ?? null,
            reviewCount: courtRatingMap[c.id]?.count  ?? 0,
        }));

        // Esnek programlı ilanlarda kesin bir saat dilimi seçilmediği için tesisin
        // taban ücreti (pricePerSlot) çoğunlukla 0 kalıyor — çoğu PRO tesis fiyatını
        // saat aralıklarına (pricingWindows) veya kort bazında ayrı ücrete göre
        // ayarlıyor. Bu yüzden en düşük olası fiyatı "başlangıç fiyatı" olarak alıyoruz.
        const estimateVenueBasePrice = (v) => {
            const prices = [];
            if (v.pricePerSlot > 0) prices.push(v.pricePerSlot);
            if (Array.isArray(v.pricingWindows)) {
                v.pricingWindows.forEach(w => { if (w?.price > 0) prices.push(w.price); });
            }
            if (Array.isArray(v.courts)) {
                v.courts.forEach(c => { if (c?.pricePerSlot > 0) prices.push(c.pricePerSlot); });
            }
            return prices.length > 0 ? Math.min(...prices) : 0;
        };

        // Her BusinessVenue tek satır olarak döner (kort bazlı değil tesis bazlı)
        const venueAsCourts = venues.map(v => ({
            id: `venue_${v.id}`,
            name: v.name,
            address: v.address || null,
            city: v.city,
            sport: v.branch,
            courtCount: v.courts.length,
            isBusinessVenue: true,
            venueId: v.id,
            user: v.user,
            pricePerSlot: estimateVenueBasePrice(v),
            avgRating:   venueRatingMap[v.id]?.avg   ?? null,
            reviewCount: venueRatingMap[v.id]?.count  ?? 0,
        }));

        res.json([...courtsWithRating, ...venueAsCourts]);
    } catch (error) {
        next(error);
    }
};

export const getCourt = async (req, res, next) => {
    try {
        const { id } = req.params;

        const court = await prisma.court.findUnique({
            where: { id },
            include: {
                user: {
                    select: { id: true, username: true, fullName: true },
                },
            },
        });

        if (!court) {
            return res.status(404).json({ message: 'Court not found' });
        }

        res.json(court);
    } catch (error) {
        next(error);
    }
};

export const updateCourt = async (req, res, next) => {
    try {
        const { id } = req.params;

        const court = await prisma.court.findUnique({ where: { id } });

        if (!court || court.addedBy !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        const updated = await prisma.court.update({
            where: { id },
            data: req.body,
        });

        res.json(updated);
    } catch (error) {
        next(error);
    }
};

export const deleteCourt = async (req, res, next) => {
    try {
        const { id } = req.params;

        const court = await prisma.court.findUnique({ where: { id } });

        if (!court || court.addedBy !== req.userId) {
            return res.status(403).json({ message: 'Forbidden' });
        }

        await prisma.court.delete({ where: { id } });

        res.json({ message: 'Court deleted' });
    } catch (error) {
        next(error);
    }
};

export const getPendingCourts = async (req, res, next) => {
    try {
        const courts = await prisma.court.findMany({
            where: { pending: true, verified: false },
            include: { user: { select: { id: true, username: true, fullName: true } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json(courts);
    } catch (error) { next(error); }
};

export const verifyCourt = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, address, city, district, sport, surface, indoor } = req.body; // admin can correct fields before approving
        const court = await prisma.court.update({
            where: { id },
            data: {
                verified: true,
                pending: false,
                ...(name     && { name }),
                ...(address  && { address }),
                ...(city     && { city }),
                ...(district !== undefined && { district: district || null }),
                ...(sport    && { sport }),
                ...(surface  && { surface }),
                // Admin panelindeki (VenuesPanel) "Açık/Kapalı" seçimi zaten body'de gönderiliyordu
                // ama burada hiç okunmuyordu — onaylarken seçilen açık/kapalı bilgisi sessizce
                // kayboluyordu (kullanıcı raporu).
                ...(indoor   !== undefined && indoor !== null && { indoor }),
            },
        });
        res.json(court);
    } catch (error) { next(error); }
};

export const rejectCourt = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const court = await prisma.court.update({
            where: { id },
            data: { pending: false, verified: false, rejectedReason: reason || 'Rejected by admin' },
        });
        res.json(court);
    } catch (error) { next(error); }
};

// Zaten onaylı (aramada görünen) ama eksik/hatalı bilgisi olan bir topluluk Court kaydının
// (telefon, kort sayısı, çalışma günü/saati genelde hiç girilmemiş olur) bilgisini herhangi
// bir kullanıcının tamamlayıp admin onayına sunmasını sağlar — BusinessVenue.suggestVenueEdit
// ile aynı mantık, burada Court modeline uygulanıyor.
export const suggestCourtEdit = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, city, district, address, phone, courtCount, openTime, closeTime, openDays } = req.body;
        const court = await prisma.court.findUnique({ where: { id } });
        if (!court) return res.status(404).json({ message: 'Bulunamadı' });

        const edit = {};
        if (name?.trim())     edit.name     = name.trim();
        if (city?.trim())     edit.city     = city.trim();
        if (district?.trim()) edit.district = district.trim();
        if (address?.trim())  edit.address  = address.trim();
        if (phone?.trim())    edit.phone    = phone.trim();
        if (openTime)          edit.openTime  = openTime;
        if (closeTime)         edit.closeTime = closeTime;
        if (Array.isArray(openDays) && openDays.length) {
            const days = openDays.filter(d => Number.isInteger(d) && d >= 1 && d <= 7);
            if (days.length) edit.openDays = days;
        }
        if (courtCount !== undefined && courtCount !== null && courtCount !== '') {
            const count = parseInt(courtCount, 10);
            if (!Number.isInteger(count) || count < 1 || count > 20) return res.status(400).json({ message: 'Kort sayısı 1-20 arasında olmalıdır' });
            edit.courtCount = count;
        }
        if (Object.keys(edit).length === 0) return res.status(400).json({ message: 'En az bir alan doldurulmalı' });
        edit.submittedBy = req.userId;
        edit.submittedAt = new Date().toISOString();

        await prisma.court.update({ where: { id }, data: { pendingEdit: edit } });
        res.json({ message: 'Gönderildi' });

        prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } }).then(async admins => {
            const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, businessName: true } });
            await Promise.all(admins.map(a =>
                createNotification(a.id, 'COURT_EDIT_REQUEST', '✏️ Kort Bilgi Güncelleme Önerisi',
                    `${user?.businessName || user?.username} tarafından "${court.name}" kortu için bilgi güncellemesi önerildi. Onay bekliyor.`,
                    { courtId: id }
                ).then(() => emitToUser(a.id, 'notification', {})).catch(() => {})
            ));
        }).catch(() => {});
    } catch (error) { next(error); }
};

export const approveCourtEdit = async (req, res, next) => {
    try {
        const { id } = req.params;
        const court = await prisma.court.findUnique({ where: { id } });
        if (!court) return res.status(404).json({ message: 'Bulunamadı' });
        const edit = court.pendingEdit;
        if (!edit || typeof edit !== 'object') return res.status(400).json({ message: 'Bekleyen düzenleme yok' });

        const data = { pendingEdit: Prisma.DbNull };
        if (edit.name)      data.name      = edit.name;
        if (edit.city)      data.city      = edit.city;
        if (edit.district)  data.district  = edit.district;
        if (edit.address)   data.address   = edit.address;
        if (edit.phone)     data.phone     = edit.phone;
        if (edit.openTime)  data.openTime  = edit.openTime;
        if (edit.closeTime) data.closeTime = edit.closeTime;
        if (Array.isArray(edit.openDays) && edit.openDays.length) data.openDays = edit.openDays;
        if (Number.isInteger(edit.courtCount)) data.courtCount = edit.courtCount;

        const updated = await prisma.court.update({ where: { id }, data });

        const submitterId = edit.submittedBy || court.addedBy;
        await createNotification(submitterId, 'VENUE_APPROVED', '✅ Kort Bilgisi Güncellendi',
            `"${court.name}" kortu için gönderdiğiniz bilgi güncellemesi onaylandı.`,
            { courtId: id }
        );
        emitToUser(submitterId, 'notification', {});
        res.json({ message: 'Onaylandı', court: updated });
    } catch (error) { next(error); }
};

export const rejectCourtEdit = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { adminNote } = req.body;
        const court = await prisma.court.findUnique({ where: { id } });
        if (!court) return res.status(404).json({ message: 'Bulunamadı' });
        const edit = court.pendingEdit;
        await prisma.court.update({ where: { id }, data: { pendingEdit: Prisma.DbNull } });
        const submitterId = edit?.submittedBy;
        if (submitterId) {
            await createNotification(submitterId, 'VENUE_REJECTED', '❌ Kort Bilgisi Reddedildi',
                adminNote || `"${court.name}" kortu için gönderdiğiniz bilgi güncellemesi reddedildi.`,
                { courtId: id }
            );
            emitToUser(submitterId, 'notification', {});
        }
        res.json({ message: 'Reddedildi' });
    } catch (error) { next(error); }
};

export const importFromOSM = async (req, res, next) => {
    try {
        const { city, sport = 'tennis' } = req.body;

        // Türkçe İ karakteri ile Latin I arasındaki farkı kapsa
        const cityRegex = city.replace(/İ/g, '[İI]').replace(/ı/g, '[ıi]').replace(/I/g, '[İI]').replace(/i/g, '[ıi]');
        const query = `[out:json][timeout:60];(area["name"~"${cityRegex}"]->.a;area["name:en"~"${city}",i]->.a;);(node["sport"="${sport}"](area.a);way["sport"="${sport}"](area.a););out body;>;out skel qt;`;

        const response = await fetch('https://overpass-api.de/api/interpreter', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'User-Agent': 'AcTiViTy-App/1.0',
            },
            body: new URLSearchParams({ data: query }).toString(),
        });

        const text = await response.text();

        let data;
        try {
            data = JSON.parse(text);
        } catch {
            return res.status(500).json({ message: 'Overpass API error', raw: text.slice(0, 300) });
        }

        if (!data.elements || data.elements.length === 0) {
            return res.json({ message: '0 courts imported', total: 0, imported: 0 });
        }

        const courts = data.elements
            .filter(el => el.tags && (el.tags.name || el.tags['name:en']))
            .map(el => ({
                name: el.tags.name || el.tags['name:en'],
                address: [el.tags['addr:street'], el.tags['addr:housenumber']].filter(Boolean).join(' ') || null,
                city,
                country: el.tags['addr:country'] || null,
                lat: el.lat || el.center?.lat || null,
                lng: el.lon || el.center?.lon || null,
                sport,
                surface: el.tags.surface || null,
                indoor: el.tags.indoor === 'yes',
                fee: el.tags.fee === 'yes',
                lights: el.tags.lit === 'yes',
                addedBy: req.userId,
                verified: false,
            }));

        let imported = 0;
        for (const court of courts) {
            const existing = await prisma.court.findFirst({
                where: { name: court.name, city },
            });
            if (!existing) {
                await prisma.court.create({ data: court });
                imported++;
            }
        }

        res.json({
            message: `${imported} courts imported from OpenStreetMap`,
            total: courts.length,
            imported,
        });
    } catch (error) {
        next(error);
    }
};
export const getCourtRatings = async (req, res, next) => {
    try {
        const { id } = req.params;
        const [ratings, agg] = await Promise.all([
            prisma.courtRating.findMany({
                where: { courtId: id },
                include: { user: { select: { id: true, username: true, avatar: true } } },
                orderBy: { createdAt: 'desc' },
                take: 30,
            }),
            prisma.courtRating.aggregate({
                where: { courtId: id },
                _avg: { rating: true },
                _count: { id: true },
            }),
        ]);
        res.json({
            reviews: ratings,
            venueRating: agg._avg.rating,
            venueReviewCount: agg._count.id,
        });
    } catch (error) { next(error); }
};

export const upsertCourtRating = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const { rating, comment } = req.body;
        await prisma.courtRating.upsert({
            where: { userId_courtId: { userId, courtId: id } },
            update: { rating, comment: comment || null },
            create: { courtId: id, userId, rating, comment: comment || null },
        });
        res.json({ ok: true });
    } catch (error) { next(error); }
};
