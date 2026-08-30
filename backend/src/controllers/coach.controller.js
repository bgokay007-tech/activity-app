import prisma from '../config/prisma.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';
import { createNotification } from './notification.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };

// T.C. kimlik no ve adli sicil belgesi — sadece ilan sahibi ve admin görebilir, başkalarına
// (getListings/getListing) hiç dönülmez. Admin bunlara admin.controller.js'teki
// getCoachListingApprovals/setCoachListingApproval üzerinden (bu redaksiyona uğramayan ayrı
// bir endpoint) zaten ulaşıyor.
const SENSITIVE_COACH_FIELDS = ['tcKimlikNo', 'adliSicilUrl'];
function redactSensitiveCoachFields(listing, viewerId) {
    if (!listing || listing.userId === viewerId) return listing;
    const copy = { ...listing };
    for (const f of SENSITIVE_COACH_FIELDS) delete copy[f];
    return copy;
}

// Kullanıcı isteği: voleybolde zaten çalışan CV + admin onayı zorunluluğu artık tenis ve
// padelde de geçerli — bu dallardaki antrenörlük başvurusu da CV'siz gönderilemiyor, admin
// onaylamadan ilan başkalarına görünmüyor. Diğer dallarda (badminton, masa tenisi, airsoft vb.)
// önceki davranış (CV isteğe bağlı, yayınlanır yayınlanmaz görünür) değişmedi.
const COACH_APPROVAL_SPORTS = ['volleyball', 'tennis', 'padel'];

// Kullanıcı isteği: bu seviyelerden biri seçilirse belge adı/fotoğrafı/deneyim yılı
// zorunlu hale geliyor — iddia edilen krendansiyeli belge doğruluyor (bkz. createListing).
const COACH_PROFESSIONAL_LEVELS = ['CERTIFIED', 'LICENSED', 'CLUB_COACH'];

export const getListings = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const listings = await prisma.coachListing.findMany({
            where: {
                category: category || undefined,
                subCategory: subCategory || undefined,
                // Voleybol/tenis/padelde admin onayı olmayan bir ilan başkalarına GÖRÜNMEZ —
                // sahibi kendi başvurusunun durumunu takip edebilsin diye kendi ilanını her
                // zaman görür (bkz. RefereeListing.approved ile aynı desen).
                // Kullanıcı isteği: "sadece CV/kimlik-belge" kaydı (profileOnly) gerçek bir ders
                // teklifi olmadığı için "Antrenörler"/"Kurslar" listelerinde HİÇBİR ZAMAN
                // görünmüyor (mobil tarafta individual/group=false olduğu için o filtrelerden
                // zaten elenir) — ama admin onaylayınca "CV'ler" sekmesinde herkese görünmesi
                // gerekiyordu, önceki profileOnly:false koşulu bunu SONSUZA DEK engelliyordu
                // (approved olsa bile). Artık approved:true tek başına yeterli — profileOnly
                // ayrımı yapmıyor. Sahibi kendi REJECTED (admin reddetti) ilanını da görebilsin
                // diye status kontrolü artık her OR dalının kendi içinde.
                OR: [
                    { status: 'ACTIVE', subCategory: { notIn: COACH_APPROVAL_SPORTS }, profileOnly: false },
                    { status: 'ACTIVE', approved: true },
                    { userId: req.userId, status: { in: ['ACTIVE', 'REJECTED'] } },
                ],
            },
            include: { user: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        const listingIds = listings.map(l => l.id);
        const ratings = listingIds.length ? await prisma.coachReview.groupBy({
            by: ['coachListingId'],
            where: { coachListingId: { in: listingIds } },
            _avg: { rating: true },
            _count: { id: true },
        }) : [];
        const ratingMap = Object.fromEntries(ratings.map(r => [r.coachListingId, { avg: r._avg.rating, count: r._count.id }]));
        res.json(listings.map(l => redactSensitiveCoachFields({
            ...l,
            avgRating: ratingMap[l.id]?.avg ?? null,
            reviewCount: ratingMap[l.id]?.count ?? 0,
        }, req.userId)));
    } catch (err) { next(err); }
};

// Sohbet bandı/bildirimden "o ilana git" ile gelindiğinde, ilan mevcut liste
// görünümünde olmasa bile doğrudan çekip detay modalını açabilmek için.
export const getListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.coachListing.findUnique({
            where: { id },
            include: { user: { select: USER_SELECT } },
        });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (COACH_APPROVAL_SPORTS.includes(listing.subCategory) && !listing.approved && listing.userId !== req.userId) {
            return res.status(404).json({ message: 'İlan bulunamadı' });
        }
        const agg = await prisma.coachReview.aggregate({
            where: { coachListingId: id },
            _avg: { rating: true },
            _count: { id: true },
        });
        res.json(redactSensitiveCoachFields({ ...listing, avgRating: agg._avg.rating, reviewCount: agg._count.id }, req.userId));
    } catch (err) { next(err); }
};

// Öğrenci bir antrenöre "ders aldım" ilişkisi kurmak için istek gönderir —
// antrenör kabul edince öğrenci o antrenöre yorum/yıldız verebilir hale gelir.
export const requestLesson = async (req, res, next) => {
    try {
        const { id } = req.params; // coachListingId
        const { message } = req.body;
        const listing = await prisma.coachListing.findUnique({ where: { id } });
        if (!listing) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (listing.userId === req.userId) return res.status(400).json({ message: 'Kendi ilanınıza ders isteği gönderemezsiniz' });

        const existing = await prisma.coachLessonRequest.findUnique({
            where: { coachListingId_studentId: { coachListingId: id, studentId: req.userId } },
        });
        if (existing && existing.status !== 'REJECTED') {
            return res.status(400).json({ message: 'Bu antrenöre zaten bir istek gönderdiniz', status: existing.status });
        }

        if (existing) {
            await prisma.coachLessonRequest.update({
                where: { coachListingId_studentId: { coachListingId: id, studentId: req.userId } },
                data: { status: 'PENDING', message: message || null },
            });
        } else {
            await prisma.coachLessonRequest.create({
                data: { coachListingId: id, studentId: req.userId, message: message || null },
            });
        }
        res.status(201).json({ message: 'Ders isteği gönderildi' });
    } catch (err) { next(err); }
};

// Antrenör kendi ilanına gelen ders isteklerini görür
export const getLessonRequests = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.coachListing.findUnique({ where: { id } });
        if (!listing || listing.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        const requests = await prisma.coachLessonRequest.findMany({
            where: { coachListingId: id, status: 'PENDING' },
            include: { student: { select: USER_SELECT } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(requests);
    } catch (err) { next(err); }
};

export const respondLessonRequest = async (req, res, next) => {
    try {
        const { reqId } = req.params;
        const { action } = req.body; // 'accept' | 'reject'
        const lessonReq = await prisma.coachLessonRequest.findUnique({
            where: { id: reqId },
            include: { coachListing: true },
        });
        if (!lessonReq) return res.status(404).json({ message: 'İstek bulunamadı' });
        if (lessonReq.coachListing.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        if (lessonReq.status !== 'PENDING') return res.status(400).json({ message: 'Bu istek artık bekleyen durumda değil' });

        await prisma.coachLessonRequest.update({
            where: { id: reqId },
            data: { status: action === 'accept' ? 'ACCEPTED' : 'REJECTED' },
        });
        res.json({ message: action === 'accept' ? 'Kabul edildi' : 'Reddedildi' });
    } catch (err) { next(err); }
};

export const getReviews = async (req, res, next) => {
    try {
        const { id } = req.params;
        const reviews = await prisma.coachReview.findMany({
            where: { coachListingId: id },
            include: { reviewer: { select: USER_SELECT } },
            orderBy: { createdAt: 'desc' },
        });
        const myLessonReq = req.userId ? await prisma.coachLessonRequest.findUnique({
            where: { coachListingId_studentId: { coachListingId: id, studentId: req.userId } },
        }) : null;
        res.json({
            reviews,
            avgRating: reviews.length ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length : null,
            canReview: myLessonReq?.status === 'ACCEPTED',
            myLessonStatus: myLessonReq?.status || null,
        });
    } catch (err) { next(err); }
};

export const submitReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const r = parseInt(rating, 10);
        if (!r || r < 1 || r > 5) return res.status(400).json({ message: 'Geçerli bir yıldız puanı girin (1-5)' });

        const accepted = await prisma.coachLessonRequest.findFirst({
            where: { coachListingId: id, studentId: req.userId, status: 'ACCEPTED' },
        });
        if (!accepted) return res.status(403).json({ message: 'Bu antrenörden ders almadığınız için yorum/puan veremezsiniz' });

        const review = await prisma.coachReview.upsert({
            where: { coachListingId_reviewerId: { coachListingId: id, reviewerId: req.userId } },
            update: { rating: r, comment: comment || null },
            create: { coachListingId: id, reviewerId: req.userId, rating: r, comment: comment || null },
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
            individual, group, priceIndividual, priceGroup, maxGroupSize, includedEquipment,
            location, cities, days, timeFrom, timeTo, description,
            personalFullName, personalGender, personalBirthDate, priorExperience,
            // Kullanıcı isteği: CV Yükle ekranı artık ders tipi/ücret/yer-zaman istemeden
            // sadece kimlik/belge/CV/başarı bilgisini kaydedebiliyor — henüz hiç ilanı
            // olmayan biri önce sadece bunları yükler, gerçek ilanı sonra oluşturur.
            profileOnly,
            // Kullanıcı isteği: TTF/GSB onayı, kademe, T.C. kimlik/adli sicil doğrulaması,
            // eğitim durumu, uzmanlık alanları, kort ücreti politikası, profil fotoğrafı/
            // tanıtım videosu/sosyal medya — bkz. schema.prisma CoachListing yorumu.
            certIssuer, kademe, tcKimlikNo, adliSicilUrl, education, specializations,
            profilePhotoUrl, introVideoUrl, socialInstagram, socialLinkedin, courtFeeIncluded,
        } = req.body;

        const citiesArr = Array.isArray(cities) ? cities.filter(Boolean) : [];
        const certUrlsArr = Array.isArray(certificateUrls) ? certificateUrls.filter(Boolean) : [];
        if (!credentialLevel || !category || !subCategory)
            return res.status(400).json({ message: 'Missing required fields' });
        // Kullanıcı isteği: konum artık zorunlu değil, onun yerine bir/birden fazla şehir
        // zorunlu — antrenör hangi şehir(ler)de ders verdiğini belirtmek zorunda. Sadece
        // CV/kimlik-belge kaydeden (profileOnly) bir gönderi henüz gerçek bir ders teklifi
        // olmadığı için şehir istenmiyor.
        if (!profileOnly && citiesArr.length === 0)
            return res.status(400).json({ message: 'En az bir şehir seçmelisiniz' });
        // Kullanıcı isteği: CV fotoğrafı artık opsiyonel — bunun yerine "Sertifikalı/Lisanslı/
        // Kulüp Antrenörü" gibi profesyonel bir seviye seçilirse belge adı + belge fotoğrafı +
        // deneyim yılı zorunlu (iddia edilen krendansiyeli doğrulayacak somut belge bu).
        if (COACH_PROFESSIONAL_LEVELS.includes(credentialLevel)) {
            if (!certName) return res.status(400).json({ message: 'Bu seviyede belge adını girmeniz zorunludur.' });
            if (certUrlsArr.length === 0 && !certificateUrl) return res.status(400).json({ message: 'Bu seviyede belge fotoğrafı yüklemeniz zorunludur.' });
            if (!experience || Number(experience) <= 0) return res.status(400).json({ message: 'Bu seviyede deneyim yılını girmeniz zorunludur.' });
        }
        // Kullanıcı isteği: "Amatör" olarak başvuranlardan hiçbir belge/doğrulama bilgisi
        // zorunlu istenmiyor, SADECE kişisel bilgiler (ad soyad/cinsiyet/doğum tarihi) zorunlu
        // kalıyor (bkz. referee.controller.js'deki aynı desen).
        if (credentialLevel === 'AMATEUR') {
            if (!personalFullName || !String(personalFullName).trim())
                return res.status(400).json({ message: 'Ad soyad girmeniz zorunludur.' });
            if (!personalGender)
                return res.status(400).json({ message: 'Cinsiyet seçmeniz zorunludur.' });
            if (!personalBirthDate)
                return res.status(400).json({ message: 'Doğum tarihinizi girmeniz zorunludur.' });
        }

        const listing = await prisma.coachListing.create({
            data: {
                userId: req.userId,
                category, subCategory,
                credentialLevel, certName,
                certificateUrl: certUrlsArr[0] || certificateUrl,
                certificateUrls: certUrlsArr,
                experience: Number(experience) || 0,
                achievements: Array.isArray(achievements) ? achievements.filter(Boolean) : null,
                achievementUrls: achievementUrls || [], cvUrl,
                personalFullName: personalFullName || null,
                personalGender: personalGender || null,
                personalBirthDate: personalBirthDate ? new Date(personalBirthDate) : null,
                priorExperience: Array.isArray(priorExperience) ? priorExperience.filter(p => p?.workplace || p?.position || p?.period) : null,
                certIssuer: certIssuer || null,
                kademe: kademe || null,
                tcKimlikNo: tcKimlikNo || null,
                adliSicilUrl: adliSicilUrl || null,
                education: education || null,
                specializations: Array.isArray(specializations) ? specializations.filter(Boolean) : null,
                profilePhotoUrl: profilePhotoUrl || null,
                introVideoUrl: introVideoUrl || null,
                socialInstagram: socialInstagram || null,
                socialLinkedin: socialLinkedin || null,
                individual: profileOnly ? false : Boolean(individual),
                group: profileOnly ? false : Boolean(group),
                priceIndividual: Number(priceIndividual) || 0,
                priceGroup: Number(priceGroup) || 0,
                maxGroupSize: Number(maxGroupSize) || 4,
                includedEquipment: includedEquipment || null,
                courtFeeIncluded: typeof courtFeeIncluded === 'boolean' ? courtFeeIncluded : null,
                location: location || null, cities: citiesArr,
                days: days || [],
                timeFrom: timeFrom || '09:00',
                timeTo: timeTo || '21:00',
                description,
                // Voleybol/tenis/padelde admin onayı gerekiyor (approved varsayılan false
                // kalır); diğer dallarda hiç kontrol edilmediği için baştan onaylı sayılır —
                // davranış değişmesin diye.
                approved: !COACH_APPROVAL_SPORTS.includes(subCategory),
                profileOnly: Boolean(profileOnly),
            },
            include: { user: { select: USER_SELECT } },
        });
        res.status(201).json(listing);

        // Kullanıcı isteği: admin onayı gerektiren dallarda (profileOnly dahil — kimlik/belge
        // kaydı da onaya tabi) her yeni CV/ilan gönderiminde admin'e açık bir "onay bekliyor"
        // bildirimi gitsin — eskiden bu sadece admin panelindeki bekleyen sayacına (getPendingCounts)
        // güveniyordu, aktif bir push yoktu.
        if (COACH_APPROVAL_SPORTS.includes(subCategory)) {
            prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } }).then(async admins => {
                const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
                await Promise.all(admins.map(a =>
                    createNotification(a.id, 'COACH_LISTING_SUBMITTED', '🎓 Yeni Antrenörlük CV/İlan Başvurusu',
                        `${user?.fullName || user?.username} tarafından ${listing.subCategory} antrenörlüğü için ${profileOnly ? 'CV/kimlik-belge bilgisi' : 'ilan'} gönderildi. Onay bekliyor.`,
                        { coachListingId: listing.id, category: listing.category, subCategory: listing.subCategory }
                    ).catch(() => {})
                ));
            }).catch(() => {});
        }

        // Bir "sadece CV/kimlik-belge" gönderisi henüz gerçek bir ders teklifi değil,
        // kimseye bildirim gitmemeli — asıl ilan (ders tipi/şehir dolu) oluşunca zaten
        // gidiyor (bkz. profileOnly kontrolü yukarıda).
        if (profileOnly) return;

        // Notify city-alert subscribers for coaches tab (async, non-blocking) — artık
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
                tab: 'coaches',
            });
        }
        notifyActivityAlertSubscribers({
            subCategory: listing.subCategory,
            category: listing.category,
            senderCity: citiesArr[0] || listing.city || null,
            senderUsername: listing.user?.username || '',
            senderId: req.userId,
            itemId: listing.id,
            tab: 'coaches',
        });
    } catch (err) { next(err); }
};

export const updateListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.coachListing.findUnique({ where: { id } });
        if (!listing || listing.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });

        const {
            credentialLevel, certName, certificateUrl, certificateUrls, experience,
            achievements, achievementUrls, cvUrl,
            individual, group, priceIndividual, priceGroup, maxGroupSize, includedEquipment,
            location, cities, days, timeFrom, timeTo, description,
            personalFullName, personalGender, personalBirthDate, priorExperience,
            certIssuer, kademe, tcKimlikNo, adliSicilUrl, education, specializations,
            profilePhotoUrl, introVideoUrl, socialInstagram, socialLinkedin, courtFeeIncluded,
        } = req.body;

        // Voleybol/tenis/padelde onaylı bir antrenör CV'sini veya doğrulama bilgilerini
        // (kademe/TTF-GSB/T.C. kimlik/adli sicil) değiştirirse onay otomatik düşer — admin
        // hangi bilgileri onayladığını biliyor, sessizce farklı bilgilerle onaylı kalınamaz.
        const cvChanged = cvUrl !== undefined && cvUrl !== listing.cvUrl;
        const verificationChanged = [
            [certIssuer, listing.certIssuer], [kademe, listing.kademe],
            [tcKimlikNo, listing.tcKimlikNo], [adliSicilUrl, listing.adliSicilUrl],
        ].some(([next, prev]) => next !== undefined && next !== prev);
        const revokeApproval = COACH_APPROVAL_SPORTS.includes(listing.subCategory) && listing.approved && (cvChanged || verificationChanged);

        const updated = await prisma.coachListing.update({
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
                ...(personalFullName !== undefined && { personalFullName: personalFullName || null }),
                ...(personalGender !== undefined && { personalGender: personalGender || null }),
                ...(personalBirthDate !== undefined && { personalBirthDate: personalBirthDate ? new Date(personalBirthDate) : null }),
                ...(priorExperience !== undefined && { priorExperience: Array.isArray(priorExperience) ? priorExperience.filter(p => p?.workplace || p?.position || p?.period) : null }),
                ...(individual !== undefined && { individual: Boolean(individual) }),
                ...(group !== undefined && { group: Boolean(group) }),
                ...(priceIndividual !== undefined && { priceIndividual: Number(priceIndividual) || 0 }),
                ...(priceGroup !== undefined && { priceGroup: Number(priceGroup) || 0 }),
                ...(maxGroupSize !== undefined && { maxGroupSize: Number(maxGroupSize) || 4 }),
                ...(includedEquipment !== undefined && { includedEquipment: includedEquipment || null }),
                ...(courtFeeIncluded !== undefined && { courtFeeIncluded: typeof courtFeeIncluded === 'boolean' ? courtFeeIncluded : null }),
                ...(certIssuer !== undefined && { certIssuer: certIssuer || null }),
                ...(kademe !== undefined && { kademe: kademe || null }),
                ...(tcKimlikNo !== undefined && { tcKimlikNo: tcKimlikNo || null }),
                ...(adliSicilUrl !== undefined && { adliSicilUrl: adliSicilUrl || null }),
                ...(education !== undefined && { education: education || null }),
                ...(specializations !== undefined && { specializations: Array.isArray(specializations) ? specializations.filter(Boolean) : null }),
                ...(profilePhotoUrl !== undefined && { profilePhotoUrl: profilePhotoUrl || null }),
                ...(introVideoUrl !== undefined && { introVideoUrl: introVideoUrl || null }),
                ...(socialInstagram !== undefined && { socialInstagram: socialInstagram || null }),
                ...(socialLinkedin !== undefined && { socialLinkedin: socialLinkedin || null }),
                ...(location !== undefined && { location: location || null }),
                ...(cities !== undefined && { cities: Array.isArray(cities) ? cities.filter(Boolean) : [] }),
                ...(days !== undefined && { days }),
                ...(timeFrom !== undefined && { timeFrom }),
                ...(timeTo !== undefined && { timeTo }),
                ...(description !== undefined && { description }),
                ...(revokeApproval && { approved: false }),
                // Kullanıcı isteği: admin "şu bilgiler eksik/yanlış, X gün içinde düzeltilmezse
                // iptal edilir" diye koşullu onay verdiyse, kullanıcı ilanını güncellediğinde bu
                // bir düzeltme girişimi sayılır ve süre kaldırılır (bkz. coachApprovalExpiry job).
                ...(listing.conditionalDeadline && { conditionalNote: null, conditionalDeadline: null }),
            },
            include: { user: { select: USER_SELECT } },
        });
        res.json(updated);
        if (listing.conditionalDeadline && !revokeApproval) {
            createNotification(req.userId, 'COACH_CONDITIONAL_NOTE_CLEARED', '✅ Düzeltme Alındı',
                'İlanınızı güncellediniz — admin\'in belirttiği eksiklik/hata için tanınan süre kaldırıldı, onayınız devam ediyor.',
                {}
            ).catch(() => {});
        }
        if (revokeApproval) {
            createNotification(req.userId, 'COACH_APPROVAL_REVOKED', '🚫 Antrenörlük Onayınız Kaldırıldı',
                'CV\'nizi değiştirdiğiniz için antrenörlük ilan onayınız kaldırıldı, yeni CV admin tarafından tekrar incelenene kadar ilanınız başkalarına görünmez.',
                {}
            ).catch(() => {});
            // Kullanıcı isteği: yeniden onaya düştüğünde admin'e de açık bir bildirim gitsin —
            // bkz. createListing'deki aynı desen.
            prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } }).then(async admins => {
                const user = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
                await Promise.all(admins.map(a =>
                    createNotification(a.id, 'COACH_LISTING_SUBMITTED', '🎓 Antrenörlük CV Güncellendi — Yeniden Onay Bekliyor',
                        `${user?.fullName || user?.username} tarafından ${updated.subCategory} antrenörlüğü CV'si güncellendi, onay tekrar bekliyor.`,
                        { coachListingId: updated.id, category: updated.category, subCategory: updated.subCategory }
                    ).catch(() => {})
                ));
            }).catch(() => {});
        }
    } catch (err) { next(err); }
};

export const deleteListing = async (req, res, next) => {
    try {
        const { id } = req.params;
        const listing = await prisma.coachListing.findUnique({ where: { id } });
        if (!listing || listing.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });
        await prisma.coachListing.delete({ where: { id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};
