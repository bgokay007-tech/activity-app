import prisma from '../config/prisma.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';
import { createNotification } from './notification.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

// coach.controller.js'deki COACH_APPROVAL_SPORTS ile aynı desen — kullanıcı isteği: voleybolde
// zaten çalışan CV + admin onayı zorunluluğu artık tenis ve padelde de geçerli.
const REFEREE_APPROVAL_SPORTS = ['volleyball', 'tennis', 'padel'];

// coach.controller.js'deki SENSITIVE_COACH_FIELDS/redactSensitiveCoachFields ile aynı desen —
// adli sicil ve disiplin cezası belgeleri sadece sahibi ve admin görür.
const SENSITIVE_REFEREE_FIELDS = ['adliSicilUrl', 'cezaBelgesiUrl'];
function redactSensitiveRefereeFields(listing, viewerId) {
    if (!listing || listing.userId === viewerId) return listing;
    const copy = { ...listing };
    for (const f of SENSITIVE_REFEREE_FIELDS) delete copy[f];
    return copy;
}

export const getListings = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const listings = await prisma.refereeListing.findMany({
            where: {
                status: 'ACTIVE',
                category: category || undefined,
                subCategory: subCategory || undefined,
                // Voleybol/tenis/padelde admin onayı olmayan bir ilan başkalarına GÖRÜNMEZ —
                // sadece sahibi kendi başvurusunun durumunu (onay bekliyor) takip edebilsin
                // diye kendi ilanını her zaman görür. Diğer dallarda approved kontrol edilmez.
                // Kullanıcı isteği: "sadece CV/kimlik-belge" kaydı (profileOnly) gerçek bir
                // hakemlik teklifi olmadığı için normal hakem listelerinde görünmüyor (mobil
                // tarafta ders/maç bilgisi olmadığı için o filtrelerden zaten elenir) — ama
                // admin onaylayınca "CV'ler" sekmesinde herkese görünmesi gerekiyordu, önceki
                // profileOnly:false koşulu bunu SONSUZA DEK engelliyordu (approved olsa bile).
                OR: [
                    { subCategory: { notIn: REFEREE_APPROVAL_SPORTS }, profileOnly: false },
                    { approved: true },
                    { userId: req.userId },
                ],
            },
            include: { user: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        const listingIds = listings.map(l => l.id);
        const ratings = listingIds.length ? await prisma.refereeReview.groupBy({
            by: ['refereeListingId'],
            where: { refereeListingId: { in: listingIds } },
            _avg: { rating: true },
            _count: { id: true },
        }) : [];
        const ratingMap = Object.fromEntries(ratings.map(r => [r.refereeListingId, { avg: r._avg.rating, count: r._count.id }]));
        res.json(listings.map(l => redactSensitiveRefereeFields({
            ...l,
            avgRating: ratingMap[l.id]?.avg ?? null,
            reviewCount: ratingMap[l.id]?.count ?? 0,
        }, req.userId)));
    } catch (err) { next(err); }
};

// Bu hakeme yorum/puan verme yetkisi: sadece bu kişinin gerçekten hakemlik yaptığı
// bir maçta sahip/katılımcı olanlar verebilir (ActivityRequest.refereeId üzerinden).
async function canReviewReferee(refereeUserId, reviewerId) {
    if (refereeUserId === reviewerId) return false;
    // participants/senderTeam obje dizisi içeren Json alanlar — Prisma'nın array_contains'i
    // tam obje eşleşmesi arar (id dışındaki alanlar farklı olduğu için işe yaramaz), bu yüzden
    // sadece refereeId ile filtreleyip üyeliği JS tarafında kontrol ediyoruz.
    const matches = await prisma.activityRequest.findMany({
        where: { refereeId: refereeUserId },
        select: { senderId: true, participants: true, senderTeam: true },
    });
    return matches.some(m =>
        m.senderId === reviewerId ||
        (Array.isArray(m.participants) && m.participants.some(p => p?.id === reviewerId)) ||
        (Array.isArray(m.senderTeam) && m.senderTeam.some(p => p?.id === reviewerId))
    );
}

export const getReviews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.refereeListing.findUnique({ where: { id }, select: { userId: true } });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        const reviews = await prisma.refereeReview.findMany({
            where: { refereeListingId: id },
            include: { reviewer: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        const eligible = req.userId ? await canReviewReferee(listing.userId, req.userId) : false;
        res.json({
            reviews,
            avgRating: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null,
            canReview: eligible,
        });
    } catch (err) { next(err); }
};

export const submitReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const r = parseInt(rating, 10);
        if (!r || r < 1 || r > 5) return res.status(400).json({ message: 'Geçerli bir yıldız puanı girin (1-5)' });

        const listing = await prisma.refereeListing.findUnique({ where: { id }, select: { userId: true } });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });

        const eligible = await canReviewReferee(listing.userId, req.userId);
        if (!eligible) return res.status(403).json({ message: 'Bu hakemin yönettiği bir maçta yer almadığınız için yorum/puan veremezsiniz' });

        const review = await prisma.refereeReview.upsert({
            where: { refereeListingId_reviewerId: { refereeListingId: id, reviewerId: req.userId } },
            update: { rating: r, comment: comment || null },
            create: { refereeListingId: id, reviewerId: req.userId, rating: r, comment: comment || null },
            include: { reviewer: { select: USER_SELECT } },
        });
        res.status(201).json(review);
    } catch (err) { next(err); }
};

export const createListing = async (req, res, next) => {
    try {
        const {
            category, subCategory,
            credentialLevel, certName, certificateUrl, certificateUrls, experience,
            achievements, achievementUrls, cvUrl,
            pricePerMatch,
            location, cities, days, timeFrom, timeTo, description,
            // Kullanıcı isteği: CV Yükle ekranı artık yer/zaman/ücret istemeden sadece
            // kimlik/belge/CV/başarı bilgisini kaydedebiliyor (bkz. coach.controller.js).
            profileOnly,
            // Kullanıcı isteği: tenis hakemliğinde TTF i-KORT sistemiyle uyumlu resmi lisans/
            // kademe/doğrulama bilgileri — sadece tenis dalında zorunlu (bkz. aşağıdaki kontrol).
            ikortNo, refereeKademe, vizeBelgesiUrl, itfBadgeLevel, itfCertNo,
            adliSicilUrl, cezaBelgesiUrl, ilTemsilciligi, specialization,
            // Kullanıcı isteği: voleybol hakemliğinde TVF sistemiyle uyumlu doğrulama bilgileri —
            // ikortNo/refereeKademe/vizeBelgesiUrl/ilTemsilciligi/specialization tenisle aynı
            // alanlar üzerinden paylaşılıyor, bunlar sadece voleybole özel 3 yeni alan.
            vizeAktif, highestLeagueLevel, recentMatchesUrl,
        } = req.body;

        const citiesArr = Array.isArray(cities) ? cities.filter(Boolean) : [];
        const certUrlsArr = Array.isArray(certificateUrls) ? certificateUrls.filter(Boolean) : [];
        const specializationArr = Array.isArray(specialization) ? specialization.filter(Boolean) : [];
        if (!credentialLevel || !category || !subCategory)
            return res.status(400).json({ message: 'Missing required fields' });
        // Kullanıcı isteği: konum artık zorunlu değil, onun yerine bir/birden fazla şehir
        // zorunlu — hakem hangi şehir(ler)de hakemlik yapabildiğini belirtmek zorunda.
        // Sadece CV/kimlik-belge kaydeden (profileOnly) bir gönderi henüz gerçek bir
        // hakemlik teklifi olmadığı için şehir istenmiyor.
        if (!profileOnly && citiesArr.length === 0)
            return res.status(400).json({ message: 'En az bir şehir seçmelisiniz' });
        // Kullanıcı isteği: voleybol/tenis/padelde hakemlik başvurusu CV'siz gönderilemez —
        // admin onayı CV'ye bakarak veriliyor, CV eksikse başvuru zaten değerlendirilemez.
        if (REFEREE_APPROVAL_SPORTS.includes(subCategory) && !cvUrl)
            return res.status(400).json({ message: 'Bu dalda hakemlik için CV yüklemeniz zorunludur.' });
        // Kullanıcı isteği: bir tenis hakemini onaylamadan önce mutlaka kontrol edilmesi
        // gereken temel bilgiler — TTF hakem sicil no (i-KORT ID), kademe, güncel vize belgesi,
        // bağlı olduğu il temsilciliği, uzmanlık alanı (Kule/Çizgi Hakemi).
        if (subCategory === 'tennis') {
            if (!ikortNo || !String(ikortNo).trim())
                return res.status(400).json({ message: 'TTF Hakem Sicil Numaranızı (i-KORT ID) girmeniz zorunludur.' });
            if (!refereeKademe)
                return res.status(400).json({ message: 'Hakemlik kademenizi seçmeniz zorunludur.' });
            if (!vizeBelgesiUrl)
                return res.status(400).json({ message: 'Güncel vize belgenizi (i-KORT profil ekran görüntüsü) yüklemeniz zorunludur.' });
            if (!ilTemsilciligi)
                return res.status(400).json({ message: 'Bağlı olduğunuz il temsilciliğini seçmeniz zorunludur.' });
            if (specializationArr.length === 0)
                return res.status(400).json({ message: 'Uzmanlık alanınızı (Kule/Çizgi Hakemi) seçmeniz zorunludur.' });
        }
        // Kullanıcı isteği: bir voleybol hakemini onaylamadan önce mutlaka kontrol edilmesi
        // gereken temel bilgiler — TVF hakem sicil no (lisans no), klasman/unvan, bağlı olduğu
        // il temsilciliği, güncel hakemlik lisans/vize belgesi. Uzman pozisyonlar ve en yüksek
        // lig seviyesi filtreleme amaçlı olduğu için zorunlu tutulmadı.
        if (subCategory === 'volleyball') {
            if (!ikortNo || !String(ikortNo).trim())
                return res.status(400).json({ message: 'Hakemlik Sicil Numaranızı (Lisans No) girmeniz zorunludur.' });
            if (!refereeKademe)
                return res.status(400).json({ message: 'Mevcut klasmanınızı/unvanınızı seçmeniz zorunludur.' });
            if (!ilTemsilciligi)
                return res.status(400).json({ message: 'Bağlı olduğunuz il temsilciliğini seçmeniz zorunludur.' });
            if (!vizeBelgesiUrl)
                return res.status(400).json({ message: 'Hakemlik lisans/vize belgenizi yüklemeniz zorunludur.' });
        }

        const listing = await prisma.refereeListing.create({
            data: {
                userId: req.userId,
                category, subCategory,
                credentialLevel, certName,
                certificateUrl: certUrlsArr[0] || certificateUrl,
                certificateUrls: certUrlsArr,
                experience: Number(experience) || 0,
                achievements: Array.isArray(achievements) ? achievements.filter(Boolean) : null,
                achievementUrls: achievementUrls || [], cvUrl,
                pricePerMatch: profileOnly ? 0 : (Number(pricePerMatch) || 0),
                location: location || null, cities: citiesArr,
                days: days || [],
                timeFrom: timeFrom || '09:00',
                timeTo: timeTo || '21:00',
                description,
                ikortNo: ikortNo?.trim() || null,
                refereeKademe: refereeKademe || null,
                vizeBelgesiUrl: vizeBelgesiUrl || null,
                itfBadgeLevel: itfBadgeLevel || null,
                itfCertNo: itfCertNo?.trim() || null,
                adliSicilUrl: adliSicilUrl || null,
                cezaBelgesiUrl: cezaBelgesiUrl || null,
                ilTemsilciligi: ilTemsilciligi || null,
                specialization: specializationArr,
                vizeAktif: Boolean(vizeAktif),
                highestLeagueLevel: highestLeagueLevel || null,
                recentMatchesUrl: recentMatchesUrl || null,
                // Voleybol/tenis/padelde admin onayı gerekiyor (approved varsayılan false
                // kalır); diğer dallarda hiç kontrol edilmediği için baştan onaylı sayılır —
                // davranış değişmesin diye (bkz. resolveRefereeEligibility).
                approved: !REFEREE_APPROVAL_SPORTS.includes(subCategory),
                profileOnly: Boolean(profileOnly),
            },
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(listing);

        // Bir "sadece CV/kimlik-belge" gönderisi henüz gerçek bir hakemlik teklifi değil,
        // kimseye bildirim gitmemeli.
        if (profileOnly) return;

        // Notify city-alert subscribers for referees tab (async, non-blocking) — artık
        // birden fazla şehir olabildiği için her şehir için ayrı ayrı bildirim taranıyor.
        const notifyCities = citiesArr.length > 0 ? citiesArr : [listing.city || null];
        for (const c of notifyCities) {
            notifyCitySubscribers({
                subCategory: listing.subCategory,
                category: listing.category,
                senderCity: c,
                senderUsername: listing.user?.username || '',
                senderId: req.userId,
                itemId: listing.id,
                tab: 'referees',
            });
        }
        notifyActivityAlertSubscribers({
            subCategory: listing.subCategory,
            category: listing.category,
            senderCity: citiesArr[0] || listing.city || null,
            senderUsername: listing.user?.username || '',
            senderId: req.userId,
            itemId: listing.id,
            tab: 'referees',
        });
    } catch (err) { next(err); }
};

export const updateListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.refereeListing.findUnique({ where: { id } });
        if (!listing || listing.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });

        const {
            credentialLevel, certName, certificateUrl, certificateUrls, experience,
            achievements, achievementUrls, cvUrl,
            pricePerMatch,
            location, cities, days, timeFrom, timeTo, description,
            ikortNo, refereeKademe, vizeBelgesiUrl, itfBadgeLevel, itfCertNo,
            adliSicilUrl, cezaBelgesiUrl, ilTemsilciligi, specialization,
            vizeAktif, highestLeagueLevel, recentMatchesUrl,
        } = req.body;

        // Voleybol/tenis/padelde onaylı bir hakem CV'sini değiştirirse onay otomatik düşer —
        // admin hangi CV'yi onayladığını biliyor, sessizce farklı bir CV'yle onaylı kalınamaz.
        const cvChanged = cvUrl !== undefined && cvUrl !== listing.cvUrl;
        const revokeApproval = REFEREE_APPROVAL_SPORTS.includes(listing.subCategory) && listing.approved && cvChanged;

        const updated = await prisma.refereeListing.update({
            where: { id },
            data: {
                ...(credentialLevel !== undefined && { credentialLevel }),
                ...(certName !== undefined && { certName }),
                ...(certificateUrls !== undefined && {
                    certificateUrls: Array.isArray(certificateUrls) ? certificateUrls.filter(Boolean) : [],
                    certificateUrl: (Array.isArray(certificateUrls) ? certificateUrls.filter(Boolean) : [])[0] || certificateUrl,
                }),
                ...(certificateUrls === undefined && certificateUrl !== undefined && { certificateUrl }),
                ...(experience !== undefined && { experience: Number(experience) || 0 }),
                ...(achievements !== undefined && { achievements: Array.isArray(achievements) ? achievements.filter(Boolean) : null }),
                ...(achievementUrls !== undefined && { achievementUrls }),
                ...(cvUrl !== undefined && { cvUrl }),
                ...(pricePerMatch !== undefined && { pricePerMatch: Number(pricePerMatch) || 0 }),
                ...(location !== undefined && { location: location || null }),
                ...(cities !== undefined && { cities: Array.isArray(cities) ? cities.filter(Boolean) : [] }),
                ...(days !== undefined && { days }),
                ...(timeFrom !== undefined && { timeFrom }),
                ...(timeTo !== undefined && { timeTo }),
                ...(description !== undefined && { description }),
                ...(ikortNo !== undefined && { ikortNo: ikortNo?.trim() || null }),
                ...(refereeKademe !== undefined && { refereeKademe: refereeKademe || null }),
                ...(vizeBelgesiUrl !== undefined && { vizeBelgesiUrl: vizeBelgesiUrl || null }),
                ...(itfBadgeLevel !== undefined && { itfBadgeLevel: itfBadgeLevel || null }),
                ...(itfCertNo !== undefined && { itfCertNo: itfCertNo?.trim() || null }),
                ...(adliSicilUrl !== undefined && { adliSicilUrl: adliSicilUrl || null }),
                ...(cezaBelgesiUrl !== undefined && { cezaBelgesiUrl: cezaBelgesiUrl || null }),
                ...(ilTemsilciligi !== undefined && { ilTemsilciligi: ilTemsilciligi || null }),
                ...(specialization !== undefined && { specialization: Array.isArray(specialization) ? specialization.filter(Boolean) : [] }),
                ...(vizeAktif !== undefined && { vizeAktif: Boolean(vizeAktif) }),
                ...(highestLeagueLevel !== undefined && { highestLeagueLevel: highestLeagueLevel || null }),
                ...(recentMatchesUrl !== undefined && { recentMatchesUrl: recentMatchesUrl || null }),
                ...(revokeApproval && { approved: false }),
            },
            include: { user: { select: USER_SELECT } },
        });
        res.json(updated);
        if (revokeApproval) {
            createNotification(req.userId, 'REFEREE_APPROVAL_REVOKED', '🚫 Hakemlik Onayınız Kaldırıldı',
                'CV\'nizi değiştirdiğiniz için hakemlik onayınız kaldırıldı, yeni CV admin tarafından tekrar incelenene kadar maçlara hakem olarak davet edilemezsiniz.',
                {}
            ).catch(() => {});
        }
    } catch (err) { next(err); }
};

export const deleteListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.refereeListing.findUnique({ where: { id } });
        if (!listing || listing.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });
        await prisma.refereeListing.delete({ where: { id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};
