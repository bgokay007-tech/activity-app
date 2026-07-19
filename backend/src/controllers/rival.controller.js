import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser, broadcast } from '../config/socket.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';
import { TENNIS_PADEL_SUBCATEGORIES, TENNIS_PADEL_DOMINANT_THRESHOLD, getTennisPadelEloDelta, getReassessmentFlags } from '../utils/tennisElo.js';
import { PEER_REVIEW_SUBCATEGORIES } from '../utils/peerReview.js';

// Fixed transfer lookup based on rating gap + score dominance
// ratingDiff = |loserRating - winnerRating| (0–5 scale, 1 rating pt = 20 totalPoints)
// dominant = winner took >65% of all games played across sets
//
// Gap ≥ 2.0 → dominant: 7  close: 6
// Gap 1.0–2.0 → dominant: 5  close: 4
// Gap 0.5–1.0 → dominant: 4  close: 3
// Gap 0.25–0.5 → dominant: 3  close: 2
// Gap < 0.25  → dominant: 2  close: 1
function calcTransfer(winnerPts, loserPts, score) {
    const ratingDiff = Math.abs(loserPts - winnerPts) / 20; // 20 pts = 1.0 rating

    let dominant = true; // default when no score available
    if (score && Array.isArray(score.sets) && score.sets.length > 0) {
        const side = score.winner;
        let winnerGames = 0, totalGames = 0, loserSets = 0;
        for (const set of score.sets) {
            const s = Number(set.sender)   || 0;
            const o = Number(set.opponent) || 0;
            const wg = side === 'sender' ? s : o;
            const lg = side === 'sender' ? o : s;
            winnerGames += wg;
            totalGames  += s + o;
            if (lg > wg) loserSets++;
        }
        // Kaybeden taraf en az 1 set aldıysa (set skoru 2-1 vb.) → rekabetçi
        dominant = loserSets === 0 && (totalGames === 0 || (winnerGames / totalGames) > 0.65);
    }

    if (ratingDiff >= 2.0) return dominant ? 7 : 6;
    if (ratingDiff >= 1.0) return dominant ? 5 : 4;
    if (ratingDiff >= 0.5) return dominant ? 4 : 3;
    if (ratingDiff >= 0.25) return dominant ? 3 : 2;
    return dominant ? 2 : 1;
}

async function applyCompetitivePoints(request, winnerUserId) {
    const participants  = Array.isArray(request.participants) ? request.participants : [];
    const senderTeamArr = Array.isArray(request.senderTeam)  ? request.senderTeam  : [];

    // For COMPETITIVE team matches (football with senderTeam), apply team ELO
    const isTeamMatch = senderTeamArr.length > 0;

    let winnerIds, loserIds;
    if (isTeamMatch) {
        const creatorTeam = [{ id: request.senderId }, ...senderTeamArr];
        const joiningTeam = participants; // opponent's team stored in participants after acceptance
        const senderWon = creatorTeam.some(m => m.id === winnerUserId);
        winnerIds = senderWon ? creatorTeam.map(m => m.id) : joiningTeam.map(m => m.id);
        loserIds  = senderWon ? joiningTeam.map(m => m.id) : creatorTeam.map(m => m.id);
    } else {
        winnerIds = [winnerUserId];
        loserIds  = [{ id: request.senderId }, ...participants]
            .filter(p => p.id !== winnerUserId)
            .map(p => p.id);
    }

    const allIds = [...new Set([...winnerIds, ...loserIds])];
    const existing = await prisma.userInterest.findMany({
        where: { userId: { in: allIds }, category: request.category, subCategory: request.subCategory },
    });
    const existingIds = new Set(existing.map(i => i.userId));

    // Auto-create interest records for players who played but never added this sport to their profile
    const missing = allIds.filter(id => !existingIds.has(id));
    const created = missing.length > 0
        ? await Promise.all(missing.map(userId =>
            prisma.userInterest.create({
                data: { userId, category: request.category, subCategory: request.subCategory, totalPoints: 0, wins: 0, losses: 0, skillRating: 0 },
            })
        ))
        : [];
    const interests = [...existing, ...created];

    const winnerInterests = interests.filter(i => winnerIds.includes(i.userId));
    const loserInterests  = interests.filter(i => loserIds.includes(i.userId));
    if (!winnerInterests.length || !loserInterests.length) return [];

    const updates = [];
    let pointChanges;

    if (TENNIS_PADEL_SUBCATEGORIES.includes(request.subCategory)) {
        // Tenis/Padel: kullanıcının verdiği sabit ELO puan tablosu — takım ortalama
        // skillRating'ine göre (çift maçlarda iki taraf için de takım ortalaması varsayılır).
        const avgWinnerRating = winnerInterests.reduce((s, i) => s + i.skillRating, 0) / winnerInterests.length;
        const avgLoserRating  = loserInterests.reduce((s, i) => s + i.skillRating, 0)  / loserInterests.length;
        const ratingDiff = Math.abs(avgWinnerRating - avgLoserRating);

        let dominant = true;
        const score = request.score;
        if (score && Array.isArray(score.sets) && score.sets.length > 0) {
            let winnerGames = 0, totalGames = 0, loserSets = 0;
            for (const set of score.sets) {
                const s = Number(set.sender) || 0;
                const o = Number(set.opponent) || 0;
                const wg = score.winner === 'sender' ? s : o;
                const lg = score.winner === 'sender' ? o : s;
                winnerGames += wg;
                totalGames  += s + o;
                if (lg > wg) loserSets++;
            }
            dominant = loserSets === 0 && (totalGames === 0 || (winnerGames / totalGames) > TENNIS_PADEL_DOMINANT_THRESHOLD);
        }

        const lowerRatedWon = avgWinnerRating < avgLoserRating;
        const { winnerGain, loserLoss } = getTennisPadelEloDelta(ratingDiff, dominant, lowerRatedWon);
        const transferWin  = parseFloat((winnerGain * 20).toFixed(3));
        const transferLose = parseFloat((loserLoss * 20).toFixed(3));

        // Anket doğruluğu kontrolü: anketten sonraki ilk 3 maçında kendinden ≥1.0 puan
        // yüksek bir rakibe karşı kazanan oyuncu varsa, bu maç ELO'ya sayılmaz — rakip
        // puan kaybetmez, kazanan da puan kazanmaz; kazanan derecelendirme anketine
        // tekrar yönlendirilir.
        const reassessFlags = getReassessmentFlags(winnerInterests, loserInterests, avgWinnerRating, avgLoserRating);
        const skipElo = reassessFlags.length > 0;

        for (const wi of winnerInterests) {
            updates.push(prisma.userInterest.update({
                where: { id: wi.id },
                data: {
                    ...(skipElo ? {} : { totalPoints: wi.totalPoints + transferWin, skillRating: parseFloat((wi.skillRating + winnerGain).toFixed(4)) }),
                    wins: wi.wins + 1,
                    assessmentCompleted: reassessFlags.some(f => f.id === wi.id) ? false : true,
                    matchesSinceAssessment: (wi.matchesSinceAssessment ?? 0) + 1,
                },
            }));
        }
        for (const li of loserInterests) {
            updates.push(prisma.userInterest.update({
                where: { id: li.id },
                data: {
                    ...(skipElo ? {} : { totalPoints: Math.max(0, li.totalPoints - transferLose), skillRating: Math.max(0, parseFloat((li.skillRating - loserLoss).toFixed(4))) }),
                    losses: li.losses + 1,
                    assessmentCompleted: true,
                    matchesSinceAssessment: (li.matchesSinceAssessment ?? 0) + 1,
                },
            }));
        }
        pointChanges = skipElo ? [] : [
            ...winnerInterests.map(wi => ({ userId: wi.userId, change: +winnerGain })),
            ...loserInterests.map(li => ({ userId: li.userId, change: -loserLoss })),
        ];

        if (skipElo) {
            for (const flag of reassessFlags) {
                createNotification(
                    flag.userId, 'ASSESSMENT_RECHECK',
                    '📋 Derecelendirme Anketini Tekrar Doldurun',
                    `${request.subCategory} dalında anketten sonraki ilk maçlarınızda dereceniz beklenenden farklı çıktı. Daha doğru bir eşleşme için lütfen derecelendirme anketini tekrar doldurun.`,
                    { category: request.category, subCategory: request.subCategory }
                ).catch(() => {});
            }
        }
    } else {
        const avgWinnerPts = winnerInterests.reduce((s, i) => s + i.totalPoints, 0) / winnerInterests.length;
        const avgLoserPts  = loserInterests.reduce((s, i) => s + i.totalPoints, 0)  / loserInterests.length;
        const transfer = calcTransfer(avgWinnerPts, avgLoserPts, request.score);

        for (const wi of winnerInterests) {
            const ptsAfter = wi.totalPoints + transfer;
            const bonusPts  = wi.totalPoints < 100 && ptsAfter >= 100 ? 40 : 0;
            const ptsFinal  = ptsAfter + bonusPts;
            const skillRatingFinal = parseFloat((ptsFinal / 100 * 5).toFixed(2));
            updates.push(prisma.userInterest.update({
                where: { id: wi.id },
                data: { totalPoints: ptsFinal, wins: wi.wins + 1, skillRating: skillRatingFinal, assessmentCompleted: true },
            }));
        }
        for (const li of loserInterests) {
            updates.push(prisma.userInterest.update({
                where: { id: li.id },
                data: {
                    totalPoints: Math.max(0, li.totalPoints - transfer),
                    losses: li.losses + 1,
                    skillRating: Math.max(0, parseFloat(((Math.max(0, li.totalPoints - transfer)) / 100 * 5).toFixed(2))),
                    assessmentCompleted: true,
                },
            }));
        }
        pointChanges = [
            ...winnerInterests.map(wi => ({ userId: wi.userId, change: +transfer })),
            ...loserInterests.map(li => ({ userId: li.userId, change: -transfer })),
        ];
    }

    await Promise.all(updates);
    return pointChanges;
}

const SENDER_SELECT = {
    id: true, username: true, fullName: true, avatar: true, city: true, gender: true,
};

// DOUBLE: 2 — taraflar artık eşleşmiş çift olarak katılıyor (senderTeam/joiningTeam),
// tek bir takım katılımı maçı tamamlar (3 ayrı bireysel katılımcı değil). Ancak partner
// sistemi gelmeden önce oluşturulmuş eski ilanlarda kurucunun senderTeam'i boştur —
// o ilanlar hâlâ eski modele göre (kurucu dahil 4 kişi = 3 bireysel katılımcı) tamamlanmalı.
const REQUIRED_PARTICIPANTS = { SINGLE: 1, DOUBLE: 2 };

function getRequired(request) {
    if (request.matchType === 'PLAYER_WANTED') return Number(request.levelDetail) || 999;
    if (request.teamSize > 1) return 1; // volleyball: 1 opponent rep
    if (request.matchType === 'DOUBLE') {
        const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];
        return senderTeamArr.length > 0 ? 2 : 3;
    }
    return REQUIRED_PARTICIPANTS[request.matchType] || 1;
}

export const swapMatchPositions = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { slot1, slot2 } = req.body; // 'partner' | 'opp1' | 'opp2'

        const VALID = ['partner', 'opp1', 'opp2'];
        if (!VALID.includes(slot1) || !VALID.includes(slot2) || slot1 === slot2)
            return res.status(400).json({ message: 'Geçersiz slot' });

        const rival = await prisma.activityRequest.findUnique({
            where: { id },
            include: { sender: { select: SENDER_SELECT } },
        });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });

        const senderTeam   = Array.isArray(rival.senderTeam)  ? [...rival.senderTeam]  : [];
        const participants = Array.isArray(rival.participants) ? [...rival.participants] : [];

        // İlan sahibi veya maç katılımcısı olmalı
        const isParticipant = participants.some(p => p?.id === req.userId) ||
                              senderTeam.some(p => p?.id === req.userId);
        if (rival.senderId !== req.userId && !isParticipant) {
            return res.status(403).json({ message: 'Bu maçın katılımcısı değilsiniz' });
        }
        if (rival.teamFlexibility === 'STRICT') {
            return res.status(403).json({ message: 'Bu ilan katı ayarlı, oyuncu pozisyonu değiştirilemez' });
        }

        const getP = (slot) => {
            if (slot === 'partner') return senderTeam[0] || null;
            if (slot === 'opp1')   return participants[0] || null;
            if (slot === 'opp2')   return participants[1] || null;
        };

        const p1 = getP(slot1);
        const p2 = getP(slot2);
        if (!p1 && !p2) return res.status(400).json({ message: 'İki slot da boş' });

        // Swap içinde yeni pozisyonları hesapla
        const newPartner = slot1 === 'partner' ? p2 : slot2 === 'partner' ? p1 : getP('partner');
        const newOpp1    = slot1 === 'opp1'    ? p2 : slot2 === 'opp1'    ? p1 : getP('opp1');
        const newOpp2    = slot1 === 'opp2'    ? p2 : slot2 === 'opp2'    ? p1 : getP('opp2');

        // Cinsiyet kısıtı doğrula
        const checkGender = async (userId, gReq, slotLabel) => {
            if (!userId || !gReq || gReq === 'MIX') return;
            const u = await prisma.user.findUnique({ where: { id: userId }, select: { gender: true } });
            if (u?.gender && u.gender !== 'OTHER' && u.gender !== gReq) {
                const label = gReq === 'MALE' ? 'erkek' : 'kadın';
                throw Object.assign(new Error(`${slotLabel} slotu yalnızca ${label} oyuncuları kabul ediyor`), { status: 400 });
            }
        };
        await checkGender(newPartner?.id, rival.partnerGenderReq, 'Takım Arkadaşı');
        await checkGender(newOpp1?.id,    rival.opp1GenderReq,    'Rakip 1');
        await checkGender(newOpp2?.id,    rival.opp2GenderReq,    'Rakip 2');

        const newSenderTeam   = newPartner ? [newPartner] : [];
        const newParticipants = [newOpp1, newOpp2].filter(Boolean);

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { senderTeam: newSenderTeam, participants: newParticipants },
            include: {
                sender: { select: SENDER_SELECT },
                joinRequests: {
                    where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                    orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }],
                    include: { user: { select: { ...SENDER_SELECT, interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true } } } } },
                },
            },
        });

        emitToUser(req.userId, 'rivalUpdate', updated);
        [...newParticipants, ...newSenderTeam].forEach(p => {
            if (p?.id && p.id !== req.userId) emitToUser(p.id, 'rivalUpdate', updated);
        });

        res.json(updated);
    } catch (error) {
        if (error.status === 400) return res.status(400).json({ message: error.message });
        next(error);
    }
};

export const getRivalById = async (req, res, next) => {
    try {
        const { id } = req.params;
        const rival = await prisma.activityRequest.findUnique({
            where: { id },
            include: {
                sender: { select: { ...SENDER_SELECT, interests: { select: { alias: true, level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true } } } },
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { select: { level: true, skillRating: true, totalPoints: true, assessmentCompleted: true } } } } } },
            },
        });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        res.json(rival);
    } catch (error) { next(error); }
};

const TR_PROVINCES = [
    'Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya',
    'Ardahan','Artvin','Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik',
    'Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum',
    'Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir',
    'Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul',
    'İzmir','Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kilis',
    'Kırıkkale','Kırklareli','Kırşehir','Kocaeli','Konya','Kütahya','Malatya','Manisa',
    'Mardin','Mersin','Muğla','Muş','Nevşehir','Niğde','Ordu','Osmaniye','Rize',
    'Sakarya','Samsun','Siirt','Sinop','Sivas','Şanlıurfa','Şırnak','Tekirdağ',
    'Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak',
];

export const getLocationSuggestions = async (req, res, next) => {
    try {
        const { q = '', type = 'city' } = req.query;
        if (!q || q.length < 2) return res.json([]);
        const ql = q.toLowerCase();

        if (type === 'city') {
            const matches = TR_PROVINCES
                .filter(p => p.toLowerCase().includes(ql))
                .sort()
                .slice(0, 8);
            return res.json(matches);
        }

        // type === 'district' — DB'den çek
        const ilike = { contains: q, mode: 'insensitive' };
        const venueRows = await prisma.businessVenue.findMany({
            where: { district: { ...ilike } },
            select: { district: true }, distinct: ['district'], take: 12,
        });
        const suggestions = [...new Set(venueRows.map(r => r.district).filter(Boolean).map(v => v.trim()))]
            .filter(v => v.toLowerCase().includes(ql))
            .sort()
            .slice(0, 8);
        return res.json(suggestions);
    } catch (error) { next(error); }
};

export const getActiveSubCategories = async (req, res, next) => {
    try {
        const now = new Date();
        const rows = await prisma.activityRequest.groupBy({
            by: ['subCategory', 'category'],
            where: { status: 'OPEN', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
            _count: { id: true },
        });
        // Return distinct [{ subCategory, category }] sorted by count desc
        const result = rows
            .sort((a, b) => b._count.id - a._count.id)
            .map(r => ({ subCategory: r.subCategory, category: r.category }));
        res.json(result);
    } catch (error) { next(error); }
};

export const getCountsBySubCategory = async (req, res, next) => {
    try {
        const { category } = req.query;
        const cat = category ? category.toUpperCase() : null;
        const catWhere = cat ? { category: cat } : {};
        const now = new Date();
        const where = {
            status: 'OPEN',
            ...catWhere,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
        };

        const [rivalRows, tournRows] = await Promise.all([
            prisma.activityRequest.groupBy({
                by: ['subCategory'],
                where,
                _count: { id: true },
            }),
            prisma.tournament.groupBy({
                by: ['subCategory'],
                where: { status: 'OPEN', ...catWhere },
                _count: { id: true },
            }),
        ]);

        const counts = {};
        rivalRows.forEach(r => { counts[r.subCategory] = r._count.id; });
        tournRows.forEach(r => { counts[r.subCategory] = (counts[r.subCategory] || 0) + r._count.id; });
        res.json(counts);
    } catch (error) { next(error); }
};

export const updateRivalRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Bu ilanı düzenleme yetkiniz yok' });
        if (rival.status !== 'OPEN') return res.status(400).json({ message: 'Sadece açık ilanlar düzenlenebilir' });

        const { message, matchDate, matchTime, duration, location, ticketUrl, courtName, courtAddress, courtLat, courtLng,
                minRating, maxRating, matchMode, genderReq, partnerGenderReq, opp1GenderReq, opp2GenderReq,
                venueId, venueCourtId, venueReservationId, isCourtReserved, surface, courtFeePerPerson } = req.body;

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                ...(message !== undefined && { message }),
                ...(matchDate !== undefined && { matchDate: matchDate ? new Date(matchDate) : null }),
                ...(matchTime !== undefined && { matchTime }),
                ...(duration !== undefined && { duration: duration !== null && duration !== '' ? parseInt(duration, 10) : null }),
                ...(location !== undefined && { location }),
                ...(ticketUrl !== undefined && { ticketUrl: ticketUrl || null }),
                ...(courtName !== undefined && { courtName }),
                ...(courtAddress !== undefined && { courtAddress }),
                ...(courtLat !== undefined && { courtLat: courtLat !== null ? Number(courtLat) : null }),
                ...(courtLng !== undefined && { courtLng: courtLng !== null ? Number(courtLng) : null }),
                ...(minRating !== undefined && { minRating: minRating !== '' && minRating !== null ? parseFloat(minRating) : null }),
                ...(maxRating !== undefined && { maxRating: maxRating !== '' && maxRating !== null ? parseFloat(maxRating) : null }),
                ...(matchMode !== undefined && { matchMode: matchMode.toUpperCase() }),
                ...(genderReq !== undefined && { genderReq }),
                ...(partnerGenderReq !== undefined && { partnerGenderReq }),
                ...(opp1GenderReq !== undefined && { opp1GenderReq }),
                ...(opp2GenderReq !== undefined && { opp2GenderReq }),
                ...(venueId !== undefined && { venueId: venueId || null }),
                ...(venueCourtId !== undefined && { venueCourtId: venueCourtId || null }),
                ...(venueReservationId !== undefined && { venueReservationId: venueReservationId || null }),
                ...(isCourtReserved !== undefined && { isCourtReserved: !!isCourtReserved }),
                ...(surface !== undefined && { surface: surface ? surface.toUpperCase() : null }),
                ...(courtFeePerPerson !== undefined && { courtFeePerPerson: courtFeePerPerson !== null && courtFeePerPerson !== '' ? parseInt(courtFeePerPerson, 10) : null }),
            },
            include: { sender: { select: SENDER_SELECT }, joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } } },
        });

        broadcast('rivalUpdate', updated);
        res.json(updated);
    } catch (error) { next(error); }
};

export const createRivalRequest = async (req, res, next) => {
    const creatorId = req.userId; // capture before any async ops
    try {
        const {
            category, subCategory, message, level, levelDetail,
            location, ticketUrl, courtName, courtAddress, courtLat, courtLng,
            venueId, venueCourtId, venueReservationId,
            isCourtReserved, flexibleSchedule, matchDate, matchTime,
            matchType = 'SINGLE', matchMode = 'PRACTICE', teamFlexibility = 'FLEXIBLE',
            surface, teamSize = 1, courtFeePerPerson,
            senderTeam, // COMPETITIVE football: [{id,username,fullName,skillRating}]
            positions,  // e.g. ['REFEREE'] | ['REFEREE_OFFER']
            refereePayment,
            minRating, maxRating,
            genderReq = 'MIX',
            partnerGenderReq = 'MIX',
            opp1GenderReq = 'MIX',
            opp2GenderReq = 'MIX',
            partnerInviteId, // DOUBLE: partner daveti gönderilecek kullanıcının id'si
            opp1InviteId, opp2InviteId, // DOUBLE: rakip 1 / rakip 2 slotuna doğrudan davet gönderilecek kullanıcı id'leri
        } = req.body;
        console.log(`[rival] createRivalRequest creatorId=${creatorId} sub=${subCategory}`);

        if (!flexibleSchedule && matchDate && matchTime) {
            const [h, m] = matchTime.split(':').map(Number);
            const matchUTC = new Date(new Date(matchDate).getTime() + (h * 60 + m) * 60000 - 3 * 3600000);
            // Reserved courts: allow posting until 30 min after match start (user may be looking for a last-minute opponent)
            const deadline = isCourtReserved ? new Date(matchUTC.getTime() + 30 * 60000) : matchUTC;
            if (deadline <= new Date()) {
                return res.status(400).json({ message: 'Geçmiş zamanda maç oluşturalamaz.' });
            }
        }

        // venueCourtId varsa tesis+kort adını otomatik oluştur
        let resolvedCourtName = courtName;
        if (venueCourtId && venueId) {
            try {
                const [venueRec, courtRec] = await Promise.all([
                    prisma.businessVenue.findUnique({ where: { id: venueId }, select: { name: true } }),
                    prisma.venueCourt.findUnique({ where: { id: venueCourtId }, select: { name: true } }),
                ]);
                if (venueRec && courtRec) {
                    resolvedCourtName = `${venueRec.name} ${courtRec.name}`;
                }
            } catch {}
        }

        const request = await prisma.activityRequest.create({
            data: {
                senderId: req.userId,
                category,
                subCategory,
                message,
                level,
                levelDetail,
                location,
                ...(ticketUrl && { ticketUrl }),
                courtName: resolvedCourtName,
                courtAddress,
                courtLat: courtLat ? Number(courtLat) : null,
                courtLng: courtLng ? Number(courtLng) : null,
                ...(venueId            && { venueId }),
                ...(venueCourtId       && { venueCourtId }),
                ...(venueReservationId && { venueReservationId }),
                isCourtReserved: isCourtReserved || false,
                flexibleSchedule: flexibleSchedule || false,
                expiresAt: (() => {
                    if (flexibleSchedule) return new Date(Date.now() + 24 * 60 * 60 * 1000);
                    if (matchDate && matchTime) {
                        const [h, m] = matchTime.split(':').map(Number);
                        const d = new Date(matchDate);
                        // matchTime is Turkey local (UTC+3) → subtract 3h to get UTC
                        return new Date(d.getTime() + (h * 60 + m) * 60000 - 3 * 3600000);
                    }
                    return null;
                })(),
                matchDate: matchDate ? new Date(matchDate) : null,
                matchTime,
                matchType: matchType.toUpperCase(),
                teamFlexibility: matchType.toUpperCase() === 'DOUBLE' && teamFlexibility === 'STRICT' ? 'STRICT' : 'FLEXIBLE',
                matchMode: matchMode.toUpperCase(),
                ...(surface && { surface: surface.toUpperCase() }),
                teamSize: Number(teamSize) || 1,
                ...(req.body.duration && { duration: Number(req.body.duration) }),
                participants: [],
                // DOUBLE + partnerInviteId: partner henüz kabul etmedi, senderTeam boş
                senderTeam: (partnerInviteId && matchType.toUpperCase() === 'DOUBLE')
                    ? []
                    : (Array.isArray(senderTeam) ? senderTeam : []),
                positions: Array.isArray(positions) ? positions : [],
                ...(refereePayment && { refereePayment }),
                ...(minRating !== undefined && minRating !== null && minRating !== '' && { minRating: parseFloat(minRating) }),
                ...(maxRating !== undefined && maxRating !== null && maxRating !== '' && { maxRating: parseFloat(maxRating) }),
                ...(courtFeePerPerson !== undefined && courtFeePerPerson !== null && { courtFeePerPerson: parseInt(courtFeePerPerson, 10) }),
                genderReq: genderReq || 'MIX',
                partnerGenderReq: partnerGenderReq || 'MIX',
                opp1GenderReq: opp1GenderReq || 'MIX',
                opp2GenderReq: opp2GenderReq || 'MIX',
                status: 'OPEN',
            },
            include: { sender: { select: SENDER_SELECT } },
        });

        res.status(201).json(request);

        // Real-time: show new listing instantly on all screens
        broadcast('rivalUpdate', request);

        // DOUBLE partner daveti: ilan oluştuktan sonra join request yarat ve bildirim gönder
        if (partnerInviteId && matchType.toUpperCase() === 'DOUBLE') {
            prisma.rivalJoinRequest.create({
                data: {
                    rivalId: request.id,
                    userId: partnerInviteId,
                    initiatedBy: 'OWNER',
                    isPartnerInvite: true,
                },
            }).then(async () => {
                // Güncel ilanı (joinRequests dahil) çek ve her iki tarafa ilet
                const updatedRival = await prisma.activityRequest.findUnique({
                    where: { id: request.id },
                    include: {
                        sender: { select: SENDER_SELECT },
                        joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                    },
                });
                if (updatedRival) {
                    emitToUser(creatorId, 'rivalUpdate', updatedRival);
                    emitToUser(partnerInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                createNotification(
                    partnerInviteId, 'MATCH_INVITE',
                    '🤝 Partner Daveti',
                    `@${me?.username || 'Biri'} sizi çiftler maçında partner olmaya davet etti.`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id }
                ).catch(() => {});
                emitToUser(partnerInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: '🤝 Partner Daveti',
                    body: `@${me?.username || 'Biri'} sizi çiftler maçında partner olmaya davet etti.`,
                    data: { category: request.category, subCategory: request.subCategory, rivalId: request.id },
                });
            }).catch(() => {});
        }

        // DOUBLE rakip daveti: Rakip 1 / Rakip 2 slotuna doğrudan davet — isPartnerInvite:false,
        // yani inviteToRival ile aynı mantık (owner-initiated rakip daveti), sadece ilan oluşturulurken tetiklenir.
        for (const oppInviteId of [opp1InviteId, opp2InviteId].filter(Boolean)) {
            if (matchType.toUpperCase() !== 'DOUBLE' || oppInviteId === partnerInviteId) continue;
            prisma.rivalJoinRequest.create({
                data: { rivalId: request.id, userId: oppInviteId, initiatedBy: 'OWNER' },
            }).then(async () => {
                const updatedRival = await prisma.activityRequest.findUnique({
                    where: { id: request.id },
                    include: {
                        sender: { select: SENDER_SELECT },
                        joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                    },
                });
                if (updatedRival) {
                    emitToUser(creatorId, 'rivalUpdate', updatedRival);
                    emitToUser(oppInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                createNotification(
                    oppInviteId, 'MATCH_INVITE',
                    '🎾 Maç Daveti',
                    `@${me?.username || 'Biri'} sizi bir maça davet etti.`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id }
                ).catch(() => {});
                emitToUser(oppInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: '🎾 Maç Daveti',
                    body: `@${me?.username || 'Biri'} sizi bir maça davet etti.`,
                    data: { category: request.category, subCategory: request.subCategory, rivalId: request.id },
                });
            }).catch(() => {});
        }

        // Notify city-alert subscribers about new listing (async, non-blocking)
        const notifyTab = request.matchType === 'PLAYER_WANTED' ? 'player_wanted' : 'rivals';
        prisma.user.findUnique({ where: { id: creatorId }, select: { city: true } })
            .then(u => {
                notifyCitySubscribers({
                    subCategory, category,
                    senderCity: u?.city || null,
                    senderUsername: request.sender?.username || '',
                    senderId: creatorId,
                    itemId: request.id,
                    tab: notifyTab,
                });
                notifyActivityAlertSubscribers({
                    subCategory, category,
                    senderCity: u?.city || null,
                    senderUsername: request.sender?.username || '',
                    senderId: creatorId,
                    itemId: request.id,
                    lat: request.courtLat ?? null,
                    lng: request.courtLng ?? null,
                    tab: notifyTab,
                });
            })
            .catch(() => {});

        // Auto-submit venue for admin review if courtName + location provided
        if (courtName && location) {
            try {
                const sport = subCategory || 'general';
                const existing = await prisma.court.findFirst({
                    where: { name: { equals: courtName, mode: 'insensitive' }, city: { contains: location.split('/')[0].trim(), mode: 'insensitive' } },
                });
                if (!existing) {
                    const court = await prisma.court.create({
                        data: {
                            name: courtName,
                            address: courtAddress || null,
                            city: location,
                            sport,
                            lat: courtLat ? Number(courtLat) : null,
                            lng: courtLng ? Number(courtLng) : null,
                            addedBy: req.userId,
                            verified: false,
                            pending: true,
                        },
                    });
                    // Notify all admins (except the submitter themselves)
                    const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
                    const submitter = request.sender;
                    console.log(`[venue] creatorId=${creatorId} adminCount=${admins.length}`);
                    for (const admin of admins) {
                        if (admin.id === creatorId) { console.log(`[venue] skipping admin=${admin.id} (is creator)`); continue; }
                        await createNotification(
                            admin.id,
                            'VENUE_SUBMISSION',
                            '🏟️ New Venue Submitted',
                            `${submitter?.fullName || submitter?.username} submitted "${courtName}" in ${location} for review.`,
                            { courtId: court.id, courtName, location, sport }
                        );
                    }
                }
            } catch (venueErr) {
                console.error('Venue auto-submit error:', venueErr);
            }
        }
    } catch (error) {
        next(error);
    }
};

export const getRivalRequests = async (req, res, next) => {
    try {
        const { category, subCategory, matchType, city, district, date, dateFrom, dateTo, timeFrom, timeTo } = req.query;
        const cat = category ? category.toUpperCase() : null;
        const catWhere = cat ? { category: cat } : {};

        // Auto-delete OPEN listings whose match time has already passed (not enough players)
        const now = new Date();
        const expiryCandidates = await prisma.activityRequest.findMany({
            where: { status: 'OPEN', matchDate: { lte: now }, matchTime: { not: null } },
            select: { id: true, senderId: true, subCategory: true, matchDate: true, matchTime: true },
        });
        const expired = expiryCandidates.filter(r => {
            if (!r.matchTime || !r.matchDate) return false;
            const [h, m] = r.matchTime.split(':').map(Number);
            // matchTime is Turkey local (UTC+3) → subtract 3h to compare in UTC
            const matchUTC = new Date(new Date(r.matchDate).getTime() + (h * 60 + m) * 60000 - 3 * 3600000);
            return now >= matchUTC;
        });
        if (expired.length > 0) {
            await prisma.activityRequest.deleteMany({ where: { id: { in: expired.map(e => e.id) } } });
            for (const e of expired) {
                emitToUser(e.senderId, 'rivalDeleted', { rivalId: e.id, subCategory: e.subCategory });
                createNotification(
                    e.senderId,
                    'MATCH_EXPIRED',
                    '⏰ İlanınız Kaldırıldı',
                    `${e.subCategory} ilanınız için yeterli oyuncu bulunamadı ve maç saati geldiği için otomatik kaldırıldı.`,
                    {},
                ).catch(() => {});
            }
        }

        // Location filter — matches city/district against location or courtAddress
        const locFilters = [];
        if (city)     locFilters.push({ location: { contains: city, mode: 'insensitive' } }, { courtAddress: { contains: city, mode: 'insensitive' } });
        if (district) locFilters.push({ location: { contains: district, mode: 'insensitive' } }, { courtAddress: { contains: district, mode: 'insensitive' } });

        // Date filter — single date OR range
        let dateWhere = {};
        const effectiveDateFrom = dateFrom || date;
        const effectiveDateTo   = dateTo   || date;
        if (effectiveDateFrom || effectiveDateTo) {
            const matchDateFilter = {};
            if (effectiveDateFrom) matchDateFilter.gte = new Date(`${effectiveDateFrom}T00:00:00.000Z`);
            if (effectiveDateTo)   matchDateFilter.lte = new Date(`${effectiveDateTo}T23:59:59.999Z`);
            dateWhere = { matchDate: matchDateFilter };
        }

        // Time range filter
        let timeWhere = {};
        if (timeFrom) timeWhere = { ...timeWhere, matchTime: { gte: timeFrom } };
        if (timeTo)   timeWhere = { ...timeWhere, matchTime: { lte: timeTo } };

        const requests = await prisma.activityRequest.findMany({
            where: {
                ...catWhere,
                ...(subCategory && { subCategory }),
                ...(matchType   && { matchType: matchType.toUpperCase() }),
                ...dateWhere,
                ...timeWhere,
                ...(locFilters.length > 0 && { OR: locFilters }),
                status: 'OPEN',
                AND: [
                    { OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] },
                ],
            },
            include: {
                sender: {
                    select: {
                        ...SENDER_SELECT,
                        interests: {
                            where: { ...catWhere, ...(subCategory && { subCategory }) },
                            select: { alias: true, level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true },
                        },
                    },
                },
                joinRequests: {
                    where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                    orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }],
                    include: {
                        user: {
                            select: {
                                ...SENDER_SELECT,
                                interests: {
                                    where: {
                                        ...catWhere,
                                        ...(subCategory && { subCategory }),
                                    },
                                    select: { alias: true, level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true },
                                },
                            },
                        },
                        // Include joiningTeam so creator can see challenger's team
                    },
                    // joiningTeam is returned automatically as it's a scalar field on RivalJoinRequest
                },
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });

        // Mark each rival with current user's own join request status
        const rivalIds = requests.map(r => r.id);
        const [myJoinReqs, commentCounts] = await Promise.all([
            prisma.rivalJoinRequest.findMany({
                where: { userId: req.userId, rivalId: { in: rivalIds } },
                select: { id: true, rivalId: true, status: true },
            }),
            prisma.matchComment.groupBy({
                by: ['rivalId'],
                where: { rivalId: { in: rivalIds } },
                _count: { id: true },
            }),
        ]);
        const myJoinMap = Object.fromEntries(myJoinReqs.map(j => [j.rivalId, { status: j.status, id: j.id }]));
        const commentCountMap = Object.fromEntries(commentCounts.map(c => [c.rivalId, c._count.id]));

        res.json(requests.map(r => ({
            ...r,
            _myJoinStatus: myJoinMap[r.id]?.status || null,
            _myJoinRequestId: myJoinMap[r.id]?.id || null,
            commentCount: commentCountMap[r.id] ?? 0,
        })));
    } catch (error) {
        next(error);
    }
};

// Send a join request (pending — creator must accept)
export const sendJoinRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.status !== 'OPEN') return res.status(400).json({ message: 'This request is no longer open' });
        if (request.senderId === req.userId) return res.status(400).json({ message: 'You cannot join your own request' });

        const existing = await prisma.rivalJoinRequest.findUnique({
            where: { rivalId_userId: { rivalId: id, userId: req.userId } },
        });
        if (existing && existing.status !== 'REJECTED') {
            return res.status(400).json({ message: 'You already sent a request', status: existing.status });
        }

        // Gender restriction check — SINGLE
        if (request.matchType === 'SINGLE' && request.genderReq && request.genderReq !== 'MIX') {
            const joiner = await prisma.user.findUnique({ where: { id: req.userId }, select: { gender: true } });
            if (joiner?.gender && joiner.gender !== 'OTHER') {
                if (request.genderReq !== joiner.gender) {
                    const label = request.genderReq === 'MALE' ? 'erkek' : 'kadın';
                    return res.status(400).json({ message: `Bu ilan yalnızca ${label} oyuncular için açık.` });
                }
            }
        }
        // Gender restriction check — DOUBLE (erken reddet: hiçbir slota uyamıyorsa)
        if (request.matchType === 'DOUBLE') {
            const opp1Req = request.opp1GenderReq || 'MIX';
            const opp2Req = request.opp2GenderReq || 'MIX';
            if (opp1Req !== 'MIX' || opp2Req !== 'MIX') {
                const joiner = await prisma.user.findUnique({ where: { id: req.userId }, select: { gender: true } });
                if (joiner?.gender && joiner.gender !== 'OTHER') {
                    const canFillOpp1 = opp1Req === 'MIX' || joiner.gender === opp1Req;
                    const canFillOpp2 = opp2Req === 'MIX' || joiner.gender === opp2Req;
                    if (!canFillOpp1 && !canFillOpp2) {
                        return res.status(400).json({ message: 'Cinsiyet kısıtlamaları nedeniyle bu ilana başvuramazsınız.' });
                    }
                }
            }
        }

        if (request.minRating !== null || request.maxRating !== null) {
            const userInterest = await prisma.userInterest.findFirst({
                where: { userId: req.userId, category: request.category, subCategory: request.subCategory },
            });
            const userRating = userInterest?.skillRating ?? 0;
            if (request.minRating !== null && userRating < request.minRating)
                return res.status(400).json({ message: `Bu ilan için en az ${request.minRating}★ puan gerekiyor. Sizin puanınız: ${userRating.toFixed(2)}★` });
            if (request.maxRating !== null && userRating > request.maxRating)
                return res.status(400).json({ message: `Bu ilan için en fazla ${request.maxRating}★ puan kabul ediliyor. Sizin puanınız: ${userRating.toFixed(2)}★` });
        }

        const joiningTeam = Array.isArray(req.body.joiningTeam) ? req.body.joiningTeam : [];
        let partnerId = req.body.partnerId || null;
        if (partnerId) {
            if (request.matchType !== 'DOUBLE') return res.status(400).json({ message: 'Partner seçimi sadece çiftler ilanlarında mümkün' });
            if (partnerId === req.userId) return res.status(400).json({ message: 'Kendinizi partner olarak seçemezsiniz' });
        }
        if (existing?.status === 'REJECTED') {
            // Reddedilen isteği yeniden PENDING yap
            await prisma.rivalJoinRequest.update({
                where: { rivalId_userId: { rivalId: id, userId: req.userId } },
                data: { status: 'PENDING', joiningTeam, partnerId },
            });
        } else {
            await prisma.rivalJoinRequest.create({ data: { rivalId: id, userId: req.userId, joiningTeam, partnerId } });
        }

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: SENDER_SELECT });

        // Push updated rival data (with new join request) to everyone viewing this listing —
        // other solo joiners need to see this in real-time too (çiftler takım kartları).
        const updatedRival = await prisma.activityRequest.findUnique({
            where: { id },
            include: {
                sender: { select: { ...SENDER_SELECT, interests: { select: { level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true } } } },
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true } } } } } },
            },
        });
        broadcast('rivalUpdate', updatedRival);

        res.status(201).json({ message: '✓ Join request sent! Waiting for the organizer to accept.' });

        createNotification(
            request.senderId,
            'RIVAL_JOIN_REQUEST',
            '📥 Yeni Katılım İsteği',
            `${me?.fullName || me?.username || 'Biri'}, "${request.subCategory}" ilanınıza katılmak istiyor.`,
            { rivalId: id, category: request.category, subCategory: request.subCategory }
        ).catch(() => {});

        if (partnerId) {
            const partnerReq = await prisma.rivalJoinRequest.findUnique({
                where: { rivalId_userId: { rivalId: id, userId: partnerId } },
            });
            const mutual = partnerReq?.partnerId === req.userId;
            createNotification(
                partnerId, 'MATCH_CONFIRMED',
                mutual ? '🤝 Çift Eşleşmesi Tamamlandı' : '🤝 Çift Daveti',
                mutual
                    ? `${me?.username || 'Biri'} ile çift olarak eşleştiniz, ilan sahibinin onayı bekleniyor.`
                    : `${me?.username || 'Biri'} sizi bir ${request.subCategory} ilanında çift partneri olarak seçti. Aynı ilana onu partner göstererek başvurursanız çift olarak eşleşirsiniz.`,
                { rivalId: id, subCategory: request.subCategory }
            ).catch(() => {});
        }

    } catch (error) { next(error); }
};

// Başvuran kendi PENDING (veya geç-kabul sonrası onay bekleyen) başvurusunu geri çeker —
// vazgeçip tekrar başvurabilmesi için 'REJECTED' yapılır, sendJoinRequest zaten bu durumdan
// yeniden başvuruya izin veriyor.
export const withdrawJoinRequest = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const joinReq = await prisma.rivalJoinRequest.findUnique({
            where: { id: requestId },
            include: { rival: true, user: { select: SENDER_SELECT } },
        });
        if (!joinReq) return res.status(404).json({ message: 'Not found' });
        if (joinReq.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        if (!['PENDING', 'AWAITING_JOINER_CONFIRM'].includes(joinReq.status))
            return res.status(400).json({ message: 'Bu istek artık geri çekilemez' });

        await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });

        const updatedRival = await prisma.activityRequest.findUnique({
            where: { id: joinReq.rivalId },
            include: {
                sender: { select: { ...SENDER_SELECT, interests: { select: { level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true } } } },
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true } } } } } },
            },
        });
        broadcast('rivalUpdate', updatedRival);

        res.json({ message: 'İstek geri çekildi.' });

        createNotification(
            joinReq.rival.senderId,
            'RIVAL_JOIN_REQUEST',
            '↩️ Katılım İsteği Geri Çekildi',
            `${joinReq.user?.fullName || joinReq.user?.username || 'Oyuncu'}, "${joinReq.rival.subCategory}" ilanınıza gönderdiği katılım isteğini geri çekti.`,
            { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
        ).catch(() => {});
    } catch (error) { next(error); }
};

// Çiftler (DOUBLE) ilanına bireysel başvurmuş bir kullanıcının partner seçimini değiştirir —
// davet gönderme, geleni kabul etme (karşılıklı partnerId aynı kişiyi gösterince eşleşme
// tamamlanır) ve daveti geri çekme hepsi bu tek endpoint üzerinden yürür.
export const setRivalJoinPartner = async (req, res, next) => {
    try {
        const { id } = req.params; // rivalId
        const { partnerId } = req.body;

        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (request.matchType !== 'DOUBLE') return res.status(400).json({ message: 'Partner seçimi sadece çiftler ilanlarında mümkün' });
        if (request.status !== 'OPEN') return res.status(400).json({ message: 'Bu ilan artık açık değil' });

        const me = await prisma.rivalJoinRequest.findUnique({
            where: { rivalId_userId: { rivalId: id, userId: req.userId } },
        });
        if (!me || me.status !== 'PENDING') return res.status(404).json({ message: 'Bu ilana bekleyen bir başvurunuz bulunamadı' });

        if (partnerId) {
            if (partnerId === req.userId) return res.status(400).json({ message: 'Kendinizi partner olarak seçemezsiniz' });
            const partnerReq = await prisma.rivalJoinRequest.findUnique({
                where: { rivalId_userId: { rivalId: id, userId: partnerId } },
            });
            if (!partnerReq || partnerReq.status !== 'PENDING') {
                return res.status(404).json({ message: 'Seçtiğiniz oyuncu bu ilana bekleyen bir başvuru göndermemiş' });
            }
            const partnerInterest = await prisma.userInterest.findFirst({
                where: { userId: partnerId, category: request.category, subCategory: request.subCategory },
                select: { assessmentCompleted: true },
            });
            if (!partnerInterest?.assessmentCompleted) {
                return res.status(400).json({ message: 'Seçtiğiniz partner bu spor dalında henüz derecelendirme anketini tamamlamamış' });
            }
        }

        const updated = await prisma.rivalJoinRequest.update({
            where: { id: me.id },
            data: { partnerId: partnerId || null },
            include: { user: { select: SENDER_SELECT } },
        });

        const updatedRival = await prisma.activityRequest.findUnique({
            where: { id },
            include: {
                sender: { select: { ...SENDER_SELECT, interests: { select: { level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true } } } },
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true } } } } } },
            },
        });
        broadcast('rivalUpdate', updatedRival);

        if (partnerId) {
            const partnerReq = await prisma.rivalJoinRequest.findUnique({
                where: { rivalId_userId: { rivalId: id, userId: partnerId } },
            });
            const mutual = partnerReq?.partnerId === req.userId;
            createNotification(
                partnerId, 'MATCH_CONFIRMED',
                mutual ? '🤝 Çift Eşleşmesi Tamamlandı' : '🤝 Çift Daveti',
                mutual
                    ? `${updated.user?.username || 'Biri'} ile çift olarak eşleştiniz, ilan sahibinin onayı bekleniyor.`
                    : `${updated.user?.username || 'Biri'} sizi bir ${request.subCategory} ilanında çift partneri olarak seçti.`,
                { rivalId: id, subCategory: request.subCategory }
            ).catch(() => {});
        }

        res.json(updated);
    } catch (error) { next(error); }
};

// Creator invites a specific player to their own open listing
export const inviteToRival = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { userId } = req.body;
        if (!userId) return res.status(400).json({ message: 'userId required' });

        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const isParticipant = participants.some(p => p?.id === req.userId);
        // Owner or any already-accepted participant can invite more players
        if (rival.senderId !== req.userId && !isParticipant) return res.status(403).json({ message: 'Forbidden' });
        if (rival.status !== 'OPEN') return res.status(400).json({ message: 'Bu ilan artık açık değil' });
        if (userId === req.userId) return res.status(400).json({ message: 'Kendinizi davet edemezsiniz' });

        if (participants.some(p => p?.id === userId)) {
            return res.status(400).json({ message: 'Bu kullanıcı zaten maça katılmış' });
        }

        const existing = await prisma.rivalJoinRequest.findUnique({
            where: { rivalId_userId: { rivalId: id, userId } },
        });
        if (existing && existing.status !== 'REJECTED') {
            return res.status(400).json({ message: 'Bu kullanıcıya zaten bir istek/davet gönderilmiş', status: existing.status });
        }

        if (existing) {
            await prisma.rivalJoinRequest.update({
                where: { rivalId_userId: { rivalId: id, userId } },
                data: { status: 'PENDING', initiatedBy: 'OWNER', joiningTeam: [] },
            });
        } else {
            await prisma.rivalJoinRequest.create({ data: { rivalId: id, userId, initiatedBy: 'OWNER' } });
        }

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: SENDER_SELECT });

        createNotification(
            userId, 'MATCH_INVITE',
            '🎾 Maç Daveti',
            `@${me?.username} sizi bir maça davet etti.`,
            { category: rival.category, subCategory: rival.subCategory, rivalId: rival.id }
        ).catch(() => {});

        const updatedRival = await prisma.activityRequest.findUnique({
            where: { id },
            include: {
                sender: { select: { ...SENDER_SELECT, interests: { select: { level: true, totalPoints: true, wins: true, losses: true, alias: true } } } },
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true } } } } } },
            },
        });
        emitToUser(userId, 'rivalUpdate', updatedRival);

        res.status(201).json({ message: 'Davet gönderildi.' });
    } catch (error) { next(error); }
};

// Creator accepts or rejects a join request
export const respondToJoin = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const { action } = req.body; // 'accept' | 'reject'

        const joinReq = await prisma.rivalJoinRequest.findUnique({
            where: { id: requestId },
            include: {
                user: { select: SENDER_SELECT },
                rival: true,
            },
        });
        if (!joinReq) return res.status(404).json({ message: 'Not found' });
        // Owner responds to a join request from a player; the invited player responds to an owner-sent invite
        const responder = joinReq.initiatedBy === 'OWNER' ? joinReq.userId : joinReq.rival.senderId;
        if (responder !== req.userId) return res.status(403).json({ message: 'Forbidden' });

        if (action !== 'accept') {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
            // Reddedildiğini diğer tarafa bildir — katıl/davet butonu geri açılsın
            const notifyTargetId = joinReq.initiatedBy === 'OWNER' ? joinReq.rival.senderId : joinReq.userId;
            emitToUser(notifyTargetId, 'joinRejected', { rivalId: joinReq.rivalId });
            // Owner'ın gönderdiği davet (partner/rakip 1/rakip 2) reddedildiyse ilan sahibine kalıcı bildirim gönder
            if (joinReq.initiatedBy === 'OWNER') {
                const roleLabel = joinReq.isPartnerInvite ? 'Partner' : 'Rakip';
                createNotification(
                    joinReq.rival.senderId, 'MATCH_INVITE_DECLINED',
                    '❌ Davet Reddedildi',
                    `@${joinReq.user?.username || 'Biri'} ${roleLabel} davetinizi reddetti.`,
                    { category: joinReq.rival.category, subCategory: joinReq.rival.subCategory, rivalId: joinReq.rivalId }
                ).catch(() => {});
                emitToUser(joinReq.rival.senderId, 'notification', {
                    type: 'MATCH_INVITE_DECLINED', title: '❌ Davet Reddedildi',
                    body: `@${joinReq.user?.username || 'Biri'} ${roleLabel} davetinizi reddetti.`,
                    data: { category: joinReq.rival.category, subCategory: joinReq.rival.subCategory, rivalId: joinReq.rivalId },
                });
            }
            return res.json({ message: 'Request rejected.' });
        }

        // Partner daveti kabul: senderTeam'e ekle, participants'a değil
        if (joinReq.isPartnerInvite) {
            // Partner cinsiyet kontrolü
            const pGenderReq = joinReq.rival.partnerGenderReq;
            if (pGenderReq && pGenderReq !== 'MIX') {
                const pUser = await prisma.user.findUnique({ where: { id: joinReq.userId }, select: { gender: true } });
                if (pUser?.gender && pUser.gender !== 'OTHER' && pUser.gender !== pGenderReq) {
                    const label = pGenderReq === 'MALE' ? 'erkek' : 'kadın';
                    return res.status(400).json({ message: `Takım Arkadaşı slotu için bu ilan yalnızca ${label} oyuncular kabul ediyor.` });
                }
            }
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
            const joinerData = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar };
            const updatedRival = await prisma.activityRequest.update({
                where: { id: joinReq.rivalId },
                data: { senderTeam: [joinerData] },
                include: {
                    sender: { select: SENDER_SELECT },
                    joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true } } } } } },
                },
            });
            emitToUser(joinReq.rival.senderId, 'rivalUpdate', updatedRival);
            emitToUser(joinReq.userId, 'joinAccepted', { rivalId: joinReq.rivalId, matched: false });
            createNotification(
                joinReq.rival.senderId, 'MATCH_CONFIRMED',
                '🤝 Partner Kabul Etti',
                `${joinReq.user.username} çiftler takımınıza katılmayı kabul etti.`,
                { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            return res.json({ message: 'Partner daveti kabul edildi.', request: updatedRival });
        }

        // 1 saatten geç kabul: joiner'a tekrar onay iste
        const ONE_HOUR_MS = 60 * 60 * 1000;
        const lateAccept = Date.now() - new Date(joinReq.createdAt).getTime() > ONE_HOUR_MS;
        if (lateAccept) {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'AWAITING_JOINER_CONFIRM' } });
            emitToUser(joinReq.userId, 'joinLateAccepted', { rivalId: joinReq.rivalId, requestId });
            createNotification(
                joinReq.userId,
                'JOIN_LATE_ACCEPT',
                '⏰ Geç Kabul — Onayınız Bekleniyor',
                `"${joinReq.rival.sender?.username || 'Maç sahibi'}" katılım isteğinizi 1 saat sonra kabul etti. Maça katılmak istiyor musunuz? Onaylayın veya iptal edin.`,
                { rivalId: joinReq.rivalId, requestId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            return res.json({ lateAccept: true, message: 'Joiner re-confirmation required.' });
        }

        // Build participants: when the joiner submitted a full team (football competitive team
        // matches, or tennis/padel doubles partner pairing), use the full joining team;
        // otherwise fall back to single-player addition. Independent of matchMode — a doubles
        // pairing is a structural fact about who's joining, not about practice vs competitive.
        const rival = joinReq.rival;
        let joiningTeam = Array.isArray(joinReq.joiningTeam) ? joinReq.joiningTeam : [];
        let partnerJoinReqToAccept = null;

        // Çiftler: bireysel başvurmuş ama karşılıklı partner eşleşmesi olan iki başvuru
        // tek takım olarak birlikte kabul edilir.
        if (rival.matchType === 'DOUBLE' && joiningTeam.length === 0 && joinReq.partnerId) {
            const partnerReq = await prisma.rivalJoinRequest.findUnique({
                where: { rivalId_userId: { rivalId: rival.id, userId: joinReq.partnerId } },
                include: { user: { select: SENDER_SELECT } },
            });
            if (partnerReq && partnerReq.status === 'PENDING' && partnerReq.partnerId === joinReq.userId) {
                const partnerInterest = await prisma.userInterest.findFirst({
                    where: { userId: partnerReq.userId, subCategory: rival.subCategory },
                    select: { skillRating: true, alias: true },
                });
                joiningTeam = [
                    { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar },
                    { id: partnerReq.userId, username: partnerReq.user.username, fullName: partnerReq.user.fullName, avatar: partnerReq.user.avatar, skillRating: partnerInterest?.skillRating ?? 0 },
                ];
                partnerJoinReqToAccept = partnerReq;
            }
        }
        const isTeamJoin = joiningTeam.length > 0;

        const u = joinReq.user;
        const joinerInterest = await prisma.userInterest.findFirst({
            where: { userId: u.id, subCategory: rival.subCategory },
            select: { alias: true },
        });
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const countFilled = (arr) => arr.filter(p => p && p.id).length;
        const joinerEntry = { id: u.id, username: u.username, fullName: u.fullName, avatar: u.avatar, alias: joinerInterest?.alias || null };

        let updatedParticipants;
        let assignedToPartner = false;
        let updatedSenderTeam = null;

        if (rival.matchType === 'DOUBLE') {
            const opp1Req = rival.opp1GenderReq || 'MIX';
            const opp2Req = rival.opp2GenderReq || 'MIX';

            if (isTeamJoin || partnerJoinReqToAccept) {
                // Takım kabul: sıralı slot kontrolü (opp1 için ilk oyuncu, opp2 için ikinci)
                const playersToCheck = isTeamJoin
                    ? joiningTeam
                    : [{ id: joinReq.userId }, { id: partnerJoinReqToAccept.userId }];
                const genderSlots = [opp1Req, opp2Req];
                for (let i = 0; i < playersToCheck.length; i++) {
                    const gReq = genderSlots[i];
                    if (!gReq || gReq === 'MIX') continue;
                    const gUser = await prisma.user.findUnique({ where: { id: playersToCheck[i].id }, select: { gender: true } });
                    if (gUser?.gender && gUser.gender !== 'OTHER' && gUser.gender !== gReq) {
                        const label = gReq === 'MALE' ? 'erkek' : 'kadın';
                        return res.status(400).json({ message: `${i === 0 ? 'Rakip 1' : 'Rakip 2'} slotu için bu ilan yalnızca ${label} oyuncular kabul ediyor.` });
                    }
                }
                if (countFilled(participants) > 0) {
                    return res.status(400).json({ message: 'Bu ilanda zaten kabul edilmiş bireysel katılımcı(lar) var. Takım eşleşmesini kabul etmeden önce onları çıkarın.' });
                }
                updatedParticipants = isTeamJoin ? joiningTeam : [joinerEntry, { id: partnerJoinReqToAccept.userId, username: partnerJoinReqToAccept.user.username, fullName: partnerJoinReqToAccept.user.fullName, avatar: partnerJoinReqToAccept.user.avatar }];
            } else {
                // Bireysel kabul: sırayla ilk boş adlandırılmış slota (Rakip1 → Rakip2 →
                // Takım Arkadaşı) atanır. Ekrandaki takım kartları/slot değiştirme özelliği
                // (swapMatchPositions) katılımcıları hep bu 3 sabit konumdan (participants[0],
                // participants[1], senderTeam[0]) okur — bu yüzden kabul edilen herkes mutlaka
                // bu adlandırılmış slotlardan birine yazılmalı, aksi halde katılımcı kabul
                // edilir ama hiçbir kartta görünmez. Takım Arkadaşı slotu da adaylardan biri
                // olduğu için, Rakip1+Rakip2 doluyken "Tüm slotlar dolu" hatası artık çıkmaz —
                // kabul edilenler daha sonra kendi aralarında slot değiştirebilir.
                const gUser = await prisma.user.findUnique({ where: { id: u.id }, select: { gender: true } });
                const pg = gUser?.gender;
                const fits = (gReq) => !pg || pg === 'OTHER' || !gReq || gReq === 'MIX' || pg === gReq;

                const opp1Filled = !!(participants[0] && participants[0].id);
                const opp2Filled = !!(participants[1] && participants[1].id);
                const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
                const partnerFilled = senderTeamArr.length > 0 && !!senderTeamArr[0]?.id;

                const openSlots = [
                    { key: 'opp1', filled: opp1Filled, req: opp1Req, label: 'Rakip 1' },
                    { key: 'opp2', filled: opp2Filled, req: opp2Req, label: 'Rakip 2' },
                    { key: 'partner', filled: partnerFilled, req: rival.partnerGenderReq || 'MIX', label: 'Takım Arkadaşı' },
                ].filter(s => !s.filled);

                if (openSlots.length === 0) {
                    return res.status(400).json({ message: 'Tüm slotlar dolu.' });
                }
                const target = openSlots.find(s => fits(s.req));
                if (!target) {
                    const details = openSlots.map(s => s.req !== 'MIX' ? `${s.label}: ${s.req === 'MALE' ? 'erkek' : 'kadın'}` : null).filter(Boolean).join(', ');
                    return res.status(400).json({ message: `Bu oyuncu ilanın cinsiyet gereksinimlerini karşılamıyor.${details ? ` (${details})` : ''}` });
                }

                if (target.key === 'partner') {
                    assignedToPartner = true;
                    updatedSenderTeam = [joinerEntry];
                    updatedParticipants = participants;
                } else {
                    const newP = [participants[0] || null, participants[1] || null];
                    newP[target.key === 'opp1' ? 0 : 1] = joinerEntry;
                    updatedParticipants = newP;
                }
            }
        } else {
            if (isTeamJoin && countFilled(participants) > 0) {
                return res.status(400).json({ message: 'Bu ilanda zaten kabul edilmiş bireysel katılımcı(lar) var. Takım eşleşmesini kabul etmeden önce onları çıkarın.' });
            }
            updatedParticipants = isTeamJoin ? joiningTeam : [...participants, joinerEntry];
        }

        // Partner az önce atandıysa artık required=2'ye düşer (senderTeam DB'de henüz
        // güncellenmediği için getRequired hâlâ eski/boş senderTeam'e göre 3 döner).
        const isFull = assignedToPartner
            ? countFilled(participants) >= 2
            : countFilled(updatedParticipants) >= getRequired(rival);

        // Tüm doğrulama geçtikten SONRA join request'i ACCEPTED yap
        await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });

        const updateData = {
            status: isFull ? 'MATCHED' : 'OPEN',
            receiverId: isFull ? u.id : rival.receiverId,
            ...(isFull && rival.flexibleSchedule && { schedulingDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
            participants: updatedParticipants,
            ...(assignedToPartner && { senderTeam: updatedSenderTeam }),
        };

        const updated = await prisma.activityRequest.update({
            where: { id: rival.id },
            data: updateData,
            include: {
                sender: { select: SENDER_SELECT },
                joinRequests: {
                    where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                    orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }],
                    include: {
                        user: {
                            select: {
                                ...SENDER_SELECT,
                                interests: {
                                    select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        // Çiftler: partner eşi de kabul edildi olarak işaretlenir (ikisi birlikte tek takım kabul edildi)
        if (partnerJoinReqToAccept) {
            await prisma.rivalJoinRequest.update({ where: { id: partnerJoinReqToAccept.id }, data: { status: 'ACCEPTED' } });
        }

        // Push updated rival to creator's UI
        emitToUser(rival.senderId, 'rivalUpdate', updated);
        // Notify the joiner that they were accepted
        emitToUser(u.id, 'joinAccepted', { rivalId: rival.id, matched: isFull });
        if (partnerJoinReqToAccept) emitToUser(partnerJoinReqToAccept.userId, 'joinAccepted', { rivalId: rival.id, matched: isFull });
        // Also notify all participants and senderTeam of the match status
        if (isFull) {
            updatedParticipants.filter(p => p?.id).forEach(p => emitToUser(p.id, 'rivalUpdate', updated));
            const currentSenderTeam = Array.isArray(updated.senderTeam) ? updated.senderTeam : [];
            currentSenderTeam.filter(p => p?.id && p.id !== u.id && p.id !== rival.senderId)
                .forEach(p => emitToUser(p.id, 'rivalUpdate', updated));
        }

        res.json({
            message: isFull ? '🎉 Match is full!' : `✓ Accepted!`,
            request: updated,
            matched: isFull,
        });

        createNotification(
            u.id,
            'MATCH_CONFIRMED',
            isFull ? '🎉 Match confirmed!' : '✓ Join request accepted!',
            assignedToPartner
                ? (isFull
                    ? `${rival.sender?.username || ''} sizi çiftler takımına takım arkadaşı olarak kabul etti. Maç doldu!`
                    : `${rival.sender?.username || ''} sizi çiftler takımına takım arkadaşı olarak kabul etti.`)
                : isFull
                    ? `Your request to join ${rival.sender?.username || ''}'s match was accepted. Match is full!`
                    : `Your request to join a match was accepted.`,
            { rivalId: rival.id, category: rival.category, subCategory: rival.subCategory }
        ).catch(() => {});

        if (partnerJoinReqToAccept) {
            createNotification(
                partnerJoinReqToAccept.userId,
                'MATCH_CONFIRMED',
                isFull ? '🎉 Maç onaylandı!' : '✓ Katılım isteğin kabul edildi!',
                isFull
                    ? `${rival.sender?.username || ''} ile maçınız onaylandı — çift olarak kabul edildiniz, maç doldu!`
                    : `Çift partneriniz ile birlikte maça katılım isteğiniz kabul edildi.`,
                { rivalId: rival.id, category: rival.category, subCategory: rival.subCategory }
            ).catch(() => {});
        }
    } catch (error) { next(error); }
};

// Joiner confirms or cancels after a late-accept (AWAITING_JOINER_CONFIRM)
export const confirmLateJoin = async (req, res, next) => {
    try {
        const { requestId } = req.params;
        const { action } = req.body; // 'confirm' | 'cancel'

        const joinReq = await prisma.rivalJoinRequest.findUnique({
            where: { id: requestId },
            include: {
                user: { select: SENDER_SELECT },
                rival: true,
            },
        });
        if (!joinReq) return res.status(404).json({ message: 'Not found' });
        if (joinReq.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        if (joinReq.status !== 'AWAITING_JOINER_CONFIRM') return res.status(400).json({ message: 'Bu istek için onay beklenmiyors.' });

        if (action !== 'confirm') {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
            emitToUser(joinReq.rival.senderId, 'joinRejected', { rivalId: joinReq.rivalId });
            createNotification(
                joinReq.rival.senderId,
                'RIVAL_JOIN_REQUEST',
                '❌ Katılım İptal Edildi',
                `${joinReq.user?.fullName || joinReq.user?.username || 'Oyuncu'} geç kabul sonrası katılımı iptal etti.`,
                { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            return res.json({ message: 'Cancelled.' });
        }

        // confirm: proceed with normal join logic
        const rival = joinReq.rival;

        // Bu onay 1 saatten geç kabul yüzünden bekletiliyordu — o süre zarfında ilan sahibi
        // başka bir oyuncuyu kabul edip maç dolmuş (ya da ilan iptal edilmiş) olabilir.
        // Böyle bir durumda geç onayı sessizce üstüne eklemek yerine hakkının gittiğini
        // açıkça bildiririz.
        const participantsSoFar = Array.isArray(rival.participants) ? rival.participants.filter(p => p && p.id) : [];
        const alreadyFull = rival.status === 'MATCHED' || rival.status === 'CANCELLED' || participantsSoFar.length >= getRequired(rival);
        if (alreadyFull) {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
            emitToUser(joinReq.userId, 'joinRejected', { rivalId: joinReq.rivalId });
            createNotification(
                joinReq.userId,
                'RIVAL_JOIN_REQUEST',
                '😕 Yerin Dolmuş',
                `Onayınızı beklerken "${rival.sender?.username || 'ilan sahibi'}" bu maç için başka bir oyuncu buldu.`,
                { rivalId: joinReq.rivalId, category: rival.category, subCategory: rival.subCategory }
            ).catch(() => {});
            return res.status(409).json({ message: 'Onayınızı beklerken bu maç için başka bir oyuncu bulundu.' });
        }

        let joiningTeam = Array.isArray(joinReq.joiningTeam) ? joinReq.joiningTeam : [];
        let partnerJoinReqToAccept = null;

        if (rival.matchType === 'DOUBLE' && joiningTeam.length === 0 && joinReq.partnerId) {
            const partnerReq = await prisma.rivalJoinRequest.findUnique({
                where: { rivalId_userId: { rivalId: rival.id, userId: joinReq.partnerId } },
                include: { user: { select: SENDER_SELECT } },
            });
            if (partnerReq && partnerReq.status === 'AWAITING_JOINER_CONFIRM' && partnerReq.partnerId === joinReq.userId) {
                const partnerInterest = await prisma.userInterest.findFirst({
                    where: { userId: partnerReq.userId, subCategory: rival.subCategory },
                    select: { skillRating: true, alias: true },
                });
                joiningTeam = [
                    { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar },
                    { id: partnerReq.userId, username: partnerReq.user.username, fullName: partnerReq.user.fullName, avatar: partnerReq.user.avatar, skillRating: partnerInterest?.skillRating ?? 0 },
                ];
                partnerJoinReqToAccept = partnerReq;
            }
        }
        const isTeamJoin = joiningTeam.length > 0;

        const u = joinReq.user;
        const joinerInterest = await prisma.userInterest.findFirst({
            where: { userId: u.id, subCategory: rival.subCategory },
            select: { alias: true },
        });
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        if (isTeamJoin && participants.length > 0) {
            return res.status(400).json({ message: 'Bu ilanda zaten kabul edilmiş bireysel katılımcı(lar) var.' });
        }
        const updatedParticipants = isTeamJoin
            ? joiningTeam
            : [...participants, { id: u.id, username: u.username, fullName: u.fullName, avatar: u.avatar, alias: joinerInterest?.alias || null }];
        const required = getRequired(rival);
        const isFull = updatedParticipants.length >= required;

        await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
        if (partnerJoinReqToAccept) {
            await prisma.rivalJoinRequest.update({ where: { id: partnerJoinReqToAccept.id }, data: { status: 'ACCEPTED' } });
        }

        const updated = await prisma.activityRequest.update({
            where: { id: rival.id },
            data: {
                participants: updatedParticipants,
                status: isFull ? 'MATCHED' : 'OPEN',
                receiverId: isFull ? u.id : rival.receiverId,
                ...(isFull && rival.flexibleSchedule && {
                    schedulingDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000),
                }),
            },
            include: {
                sender: { select: SENDER_SELECT },
                joinRequests: {
                    where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                    orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }],
                    include: {
                        user: {
                            select: {
                                ...SENDER_SELECT,
                                interests: {
                                    select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        emitToUser(rival.senderId, 'rivalUpdate', updated);
        emitToUser(u.id, 'joinAccepted', { rivalId: rival.id, matched: isFull });
        if (partnerJoinReqToAccept) emitToUser(partnerJoinReqToAccept.userId, 'joinAccepted', { rivalId: rival.id, matched: isFull });
        if (isFull) updatedParticipants.forEach(p => emitToUser(p.id, 'rivalUpdate', updated));

        res.json({ message: isFull ? '🎉 Match is full!' : '✓ Confirmed!', request: updated, matched: isFull });

        createNotification(
            rival.senderId,
            'JOIN_ACCEPTED',
            '✅ Katılım Onaylandı',
            `${u.fullName || u.username} geç kabul sonrası katılımı onayladı${isFull ? ' — maç doldu!' : '.'}`,
            { rivalId: rival.id, category: rival.category, subCategory: rival.subCategory }
        ).catch(() => {});
    } catch (error) { next(error); }
};

// Kept for backward compat — now just an alias for sendJoinRequest
export const respondToRival = sendJoinRequest;

const getMatchDeadline = (match) => {
    if (!match.matchDate || !match.matchTime) return null;
    const [h, m] = match.matchTime.split(':').map(Number);
    const d = new Date(match.matchDate);
    d.setHours(h, m, 0, 0);
    return new Date(d.getTime() + ((match.duration || 90) + 24 * 60) * 60 * 1000);
};

export const getUpcomingMatches = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const cat = category ? category.toUpperCase() : null;
        const catWhere = cat ? { category: cat } : {};

        const matches = await prisma.activityRequest.findMany({
            where: {
                status: 'MATCHED',
                ...catWhere,
                ...(subCategory && { subCategory }),
            },
            include: { sender: { select: SENDER_SELECT }, _count: { select: { matchComments: true } } },
            orderBy: { matchDate: 'asc' },
        });

        // Auto-void: delete unscored matches whose 24h window has passed
        const now = new Date();
        const expired = matches.filter(m => {
            const dl = getMatchDeadline(m);
            return dl && now > dl && !m.score;
        });
        // Auto-delete flexible MATCHED matches whose scheduling deadline passed without agreeing on date
        const scheduleExpired = matches.filter(m =>
            m.flexibleSchedule && m.schedulingDeadline && now > new Date(m.schedulingDeadline) && !m.matchDate
        );
        const allExpiredIds = [...new Set([...expired.map(m => m.id), ...scheduleExpired.map(m => m.id)])];
        if (allExpiredIds.length > 0) {
            await prisma.activityRequest.deleteMany({ where: { id: { in: allExpiredIds } } });
        }
        for (const m of scheduleExpired) {
            const parts = Array.isArray(m.participants) ? m.participants : [];
            const allIds = [m.senderId, ...parts.map(p => p.id)];
            for (const uid of allIds) {
                createNotification(uid, 'MATCH_EXPIRED',
                    '⏰ Maç Silindi',
                    `${m.subCategory} esnek maçında 24 saat içinde tarih/saat/yer belirlenemediği için ilan otomatik silindi.`,
                    { subCategory: m.subCategory }
                ).catch(() => {});
            }
        }

        const allExpiredSet = new Set(allExpiredIds);
        const active = matches.filter(m => !allExpiredSet.has(m.id));

        // Enrich with skill ratings — isolated so failure doesn't break the main response
        try {
            const allUserIds = [...new Set([
                ...active.map(m => m.senderId),
                ...active.flatMap(m => (Array.isArray(m.participants) ? m.participants : []).filter(p => p?.id).map(p => p.id)),
                ...active.flatMap(m => (Array.isArray(m.senderTeam) ? m.senderTeam : []).filter(p => p?.id).map(p => p.id)),
            ].filter(Boolean))];

            const interests = allUserIds.length > 0
                ? await prisma.userInterest.findMany({
                    where: { userId: { in: allUserIds } },
                    select: { userId: true, subCategory: true, skillRating: true, alias: true },
                })
                : [];

                // Check existing no-show reports by this user
            const activeIds = active.map(m => m.id);

            const commentCounts = activeIds.length > 0 ? await prisma.matchComment.groupBy({
                by: ['rivalId'],
                where: { rivalId: { in: activeIds } },
                _count: { id: true },
            }) : [];
            const commentCountMap = Object.fromEntries(commentCounts.map(c => [c.rivalId, c._count.id]));

            const myNoShowReports = await prisma.noShowReport.findMany({
                where: { reporterId: req.userId, rivalId: { in: activeIds }, status: 'PENDING' },
                select: { rivalId: true },
            }).catch(() => []);
            const myNoShowSet = new Set(myNoShowReports.map(r => r.rivalId));

            const enriched = active.map(m => ({
                ...m,
                senderSkillRating: interests.find(i => i.userId === m.senderId && i.subCategory === m.subCategory)?.skillRating ?? null,
                senderAlias: interests.find(i => i.userId === m.senderId && i.subCategory === m.subCategory)?.alias || null,
                participants: (Array.isArray(m.participants) ? m.participants : []).filter(p => p?.id).map(p => ({
                    ...p,
                    skillRating: interests.find(i => i.userId === p.id && i.subCategory === m.subCategory)?.skillRating ?? null,
                    alias: p.alias || interests.find(i => i.userId === p.id && i.subCategory === m.subCategory)?.alias || null,
                })),
                senderTeam: (Array.isArray(m.senderTeam) ? m.senderTeam : []).filter(p => p?.id).map(p => ({
                    ...p,
                    skillRating: interests.find(i => i.userId === p.id && i.subCategory === m.subCategory)?.skillRating ?? null,
                    alias: p.alias || interests.find(i => i.userId === p.id && i.subCategory === m.subCategory)?.alias || null,
                })),
                _myNoShowPending: myNoShowSet.has(m.id),
                commentCount: commentCountMap[m.id] ?? 0,
            }));

            return res.json(enriched);
        } catch (_) {
            return res.json(active);
        }
    } catch (error) {
        next(error);
    }
};

export const getMatchComments = async (req, res, next) => {
    try {
        const { id } = req.params;
        const comments = await prisma.matchComment.findMany({
            where: { rivalId: id },
            include: { user: { select: { id: true, username: true, avatar: true } } },
            orderBy: { createdAt: 'asc' },
        });
        res.json(comments);
    } catch (error) { next(error); }
};

export const addMatchComment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content } = req.body;
        if (!content?.trim()) return res.status(400).json({ message: 'Content required' });
        const match = await prisma.activityRequest.findUnique({
            where: { id },
            select: { id: true, senderId: true, participants: true, subCategory: true, category: true },
        });
        if (!match) return res.status(404).json({ message: 'Match not found' });
        const comment = await prisma.matchComment.create({
            data: { rivalId: id, userId: req.userId, content: content.trim() },
            include: { user: { select: { id: true, username: true, avatar: true } } },
        });
        res.status(201).json(comment);

        // Notify owner + participants (except commenter)
        const parts = Array.isArray(match.participants) ? match.participants : [];
        const allIds = [...new Set([match.senderId, ...parts.map(p => p.id)])].filter(uid => uid !== req.userId);
        const commenterUsername = comment.user?.username || 'Biri';
        for (const uid of allIds) {
            emitToUser(uid, 'newComment', { rivalId: id, comment });
            createNotification(
                uid, 'MATCH_COMMENT',
                '💬 Yeni Yorum',
                `@${commenterUsername}: ${content.trim().slice(0, 60)}`,
                { rivalId: id, category: match.category, subCategory: match.subCategory }
            ).catch(() => {});
        }
    } catch (error) { next(error); }
};

export const deleteMatchComment = async (req, res, next) => {
    try {
        const { commentId } = req.params;
        const comment = await prisma.matchComment.findUnique({
            where: { id: commentId },
            include: { rival: { select: { senderId: true, participants: true } } },
        });
        if (!comment) return res.status(404).json({ message: 'Not found' });
        const myId = req.userId;
        const parts = Array.isArray(comment.rival?.participants) ? comment.rival.participants : [];
        const isAuthor = comment.userId === myId;
        const iAmParticipant = comment.rival?.senderId === myId || parts.some(p => p.id === myId);
        const commenterIsParticipant = comment.rival?.senderId === comment.userId || parts.some(p => p.id === comment.userId);
        // Own comment: always deletable.
        // Outsider's comment: deletable by any match participant.
        // Participant's comment: only deletable by themselves.
        const canDelete = isAuthor || (iAmParticipant && !commenterIsParticipant);
        if (!canDelete) return res.status(403).json({ message: 'Forbidden' });
        await prisma.matchComment.delete({ where: { id: commentId } });
        res.json({ deleted: true });
    } catch (error) { next(error); }
};

export const abandonMatch = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason, newDate, newTime, newLocation, newCourtName, partialSets } = req.body;

        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        const parts = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || parts.some(p => p.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        if (reason === 'other') {
            await prisma.activityRequest.update({
                where: { id },
                data: {
                    score: { sets: [], winner: 'draw' },
                    status: 'COMPLETED',
                    scoreStatus: 'CONFIRMED',
                    scoreEnteredBy: req.userId,
                    completedAt: new Date(),
                    archived: true,
                },
            });
            return res.json({ message: 'Maç berabere sayıldı.' });
        }

        // reason === 'abandoned' → reschedule + optional partial score
        await prisma.activityRequest.update({
            where: { id },
            data: {
                ...(newDate      && { matchDate: new Date(newDate) }),
                ...(newTime      && { matchTime: newTime }),
                ...(newCourtName && { courtName: newCourtName }),
                ...(newLocation  && { location: newLocation }),
                ...(Array.isArray(partialSets) && partialSets.length > 0 && {
                    score: { sets: partialSets, winner: null, partial: true },
                }),
            },
        });
        res.json({ message: 'Maç yeniden planlandı.' });
    } catch (error) { next(error); }
};

export const enterScore = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { sets, winner } = req.body; // sets: [{sender, opponent}], winner: "sender"|"opponent"

        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        // Must be sender or a participant
        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                score: { sets, winner },
                status: 'COMPLETED',
                scoreStatus: 'PENDING',
                scoreEnteredBy: req.userId,
                completedAt: new Date(),
                // archived is intentionally not reset — auto-completed matches stay archived=true
            },
        });
        res.json(updated);

        const opponents = request.senderId === req.userId ? participants : [{ id: request.senderId }];
        prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } })
            .then(me => {
                for (const opp of opponents) {
                    createNotification(
                        opp.id, 'SCORE_SUBMITTED',
                        '📊 Score submitted — confirm?',
                        `${me.fullName || me.username} entered the match score. Please confirm or dispute.`,
                        { rivalId: request.id, fromUserId: req.userId, category: request.category, subCategory: request.subCategory }
                    ).catch(() => {});
                }
            }).catch(() => {});
    } catch (error) { next(error); }
};

// Shared by confirmScore (user action) and the 1h auto-confirm job. Applies ELO,
// builds the rating snapshot and marks the request CONFIRMED. Caller handles auth + notification.
export async function runScoreConfirmation(request) {
    const participants = Array.isArray(request.participants) ? request.participants : [];
    const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];

    await prisma.activityRequest.update({
        where: { id: request.id },
        data: { scoreStatus: 'CONFIRMED', archived: true, completedAt: new Date() },
    });

    // Snapshot ratings BEFORE ELO changes
    const allPlayerIds = [
        request.senderId,
        ...participants.map(p => p.id),
        ...senderTeamArr.map(m => m.id),
    ];
    const [interestsBefore, playersInfo] = await Promise.all([
        prisma.userInterest.findMany({
            where: { userId: { in: allPlayerIds }, category: request.category, subCategory: request.subCategory },
        }),
        prisma.user.findMany({
            where: { id: { in: allPlayerIds } },
            select: { id: true, username: true, fullName: true },
        }),
    ]);
    const userMap = Object.fromEntries(playersInfo.map(u => [u.id, u]));

    // ELO transfer for competitive matches — skip if draw
    let pointChanges = [];
    if (request.matchMode === 'COMPETITIVE' && request.score && request.score.winner !== 'draw') {
        const score = request.score;
        const winnerUserId = score.winner === 'sender'
            ? request.senderId
            : (participants[0]?.id || request.receiverId);
        if (winnerUserId) {
            pointChanges = await applyCompetitivePoints(request, winnerUserId);
        }
    }

    // Build rating snapshot and store it in score JSON
    // For tennis/padel: change is in skillRating units (e.g. 0.04).
    // For other sports: change is in totalPoints units (e.g. 3).
    const isTennisPadelMatch = TENNIS_PADEL_SUBCATEGORIES.includes(request.subCategory);
    const ratingSnapshot = {};
    for (const i of interestsBefore) {
        const change = pointChanges.find(c => c.userId === i.userId);
        let skillRatingAfter;
        if (isTennisPadelMatch && change) {
            skillRatingAfter = parseFloat(Math.max(0, i.skillRating + change.change).toFixed(4));
        } else {
            const ptsBefore = i.totalPoints;
            const ptsAfter = change ? Math.max(0, ptsBefore + change.change) : ptsBefore;
            skillRatingAfter = parseFloat((ptsAfter / 100 * 5).toFixed(2));
        }
        ratingSnapshot[i.userId] = {
            username: userMap[i.userId]?.username || '',
            skillRating_before: i.skillRating,
            skillRating_after: skillRatingAfter,
            change: change?.change || 0,
        };
    }
    const updated = await prisma.activityRequest.update({
        where: { id: request.id },
        data: { score: { ...request.score, ratingSnapshot } },
    });

    // Emit to all players so their screens update in real-time
    const allPlayerIds2 = [...new Set([request.senderId, ...participants.map(p => p.id)])];
    for (const uid of allPlayerIds2) emitToUser(uid, 'rivalUpdate', updated);

    // Akran doğrulama: rekabetçi voleybol maçı onaylandığında roster'daki herkese
    // (kendisi dahil, diğerlerini puanlasın diye) bildirim gönderilir. Hem manuel onay hem
    // 1 saatlik oto-onay job'u (autoCompleteMatches.js) bu fonksiyona çıktığı için tek nokta.
    if (PEER_REVIEW_SUBCATEGORIES.includes(request.subCategory) && request.matchMode === 'COMPETITIVE') {
        for (const uid of new Set(allPlayerIds)) {
            createNotification(
                uid, 'PEER_REVIEW_PROMPT',
                '🏐 Oyuncuları Değerlendir',
                'Maç arkadaşlarını ve rakiplerini değerlendirerek daha doğru bir eşleşme sistemine katkıda bulun.',
                { rivalId: request.id, category: request.category, subCategory: request.subCategory }
            ).catch(() => {});
        }
    }

    return { updated, pointChanges };
}

export const confirmScore = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.scoreStatus !== 'PENDING') return res.status(400).json({ message: 'No pending score' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];

        const teamA = new Set([request.senderId, ...senderTeamArr.map(m => m.id)]);
        const teamB = new Set(participants.map(p => p.id));

        const confirmerInA = teamA.has(req.userId);
        const confirmerInB = teamB.has(req.userId);
        if (!confirmerInA && !confirmerInB) return res.status(403).json({ message: 'Forbidden' });

        const scorerInA = teamA.has(request.scoreEnteredBy);
        // Block: same team as scorer
        if (scorerInA && confirmerInA) return res.status(400).json({ message: 'Your team entered this score — wait for opponents to confirm' });
        if (!scorerInA && confirmerInB) return res.status(400).json({ message: 'Your team entered this score — wait for opponents to confirm' });

        const { updated, pointChanges } = await runScoreConfirmation(request);

        res.json(updated);

        const eloMsg = pointChanges.length > 0 ? ` Points have been updated based on match result.` : '';
        prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })
            .then(me => createNotification(
                request.scoreEnteredBy, 'SCORE_CONFIRMED',
                '✅ Score confirmed!',
                `${me.username} confirmed the match score.${eloMsg}`,
                { rivalId: id, pointChanges, category: request.category, subCategory: request.subCategory }
            ).catch(() => {})).catch(() => {});
    } catch (error) { next(error); }
};

export const extendScoreDeadline = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { hours } = req.body;

        const ALLOWED = [24, 48, 72, 96, 120];
        if (!ALLOWED.includes(Number(hours))) {
            return res.status(400).json({ message: 'Invalid extension. Choose 24, 48, 72, 96 or 120 hours.' });
        }

        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.status !== 'COMPLETED') return res.status(400).json({ message: 'Match is not completed yet' });
        if (request.scoreStatus !== 'NONE') return res.status(400).json({ message: 'Score already entered or confirmed' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        // Push completedAt forward so auto-draw job won't fire for `hours` from now
        // Job fires when completedAt <= now - 4h
        // So set completedAt = now + (hours - 4)h → triggers after `hours` total
        const newCompletedAt = new Date(Date.now() + (Number(hours) - 4) * 60 * 60 * 1000);

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { completedAt: newCompletedAt },
        });

        const allIds = [...new Set([request.senderId, ...participants.map(p => p.id)])];
        for (const uid of allIds) emitToUser(uid, 'rivalUpdate', updated);

        res.json({ message: `✓ Deadline extended by ${hours} hours.`, completedAt: newCompletedAt });

        const notifyIds = allIds.filter(uid => uid !== req.userId);
        prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } })
            .then(me => {
                for (const uid of notifyIds) {
                    createNotification(
                        uid, 'MATCH_CONFIRMED',
                        `⏱️ Score deadline extended by ${hours}h`,
                        `${me.fullName || me.username} extended the score entry window by ${hours} hours.`,
                        { rivalId: id, category: request.category, subCategory: request.subCategory }
                    ).catch(() => {});
                }
            }).catch(() => {});
    } catch (error) { next(error); }
};

export const disputeScore = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { scoreStatus: 'DISPUTED' },
        });

        // Notify both players about admin report option
        const participants = Array.isArray(request.participants) ? request.participants : [];
        const allPlayers = [{ id: request.senderId }, ...participants].filter(p => p.id !== req.userId);
        for (const p of allPlayers) emitToUser(p.id, 'rivalUpdate', updated);
        emitToUser(req.userId, 'rivalUpdate', updated);

        res.json(updated);

        prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })
            .then(me => createNotification(
                request.scoreEnteredBy, 'SCORE_DISPUTED',
                '⚠️ Score disputed!',
                `${me.username} disputed the score${reason ? `: ${reason}` : '.'}`,
                { rivalId: id, disputed: true, category: request.category, subCategory: request.subCategory }
            ).catch(() => {})).catch(() => {});
    } catch (error) { next(error); }
};

export const reportDispute = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const allIds = [request.senderId, ...participants.map(p => p.id)];

        res.json({ message: 'Report filed. An admin will review.' });

        prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })
            .then(me => {
                for (const uid of allIds) {
                    createNotification(
                        uid, 'JOIN_REQUEST',
                        '📋 Admin report filed',
                        `${me.username} reported the score dispute${reason ? `: ${reason}` : '.'}. An admin will review this.`,
                        { rivalId: id, adminReport: true, category: request.category, subCategory: request.subCategory }
                    ).catch(() => {});
                }
            }).catch(() => {});
    } catch (error) { next(error); }
};

export const appealScore = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Maç bulunamadı' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Yetkisiz' });
        if (request.scoreStatus !== 'CONFIRMED') return res.status(400).json({ message: 'Yalnızca onaylanmış skorlara itiraz edilebilir' });
        if (request.scoreAppeal) return res.status(400).json({ message: 'Bu maç için zaten itiraz yapılmış' });

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { scoreAppeal: true, scoreAppealReason: reason || null },
        });

        emitToUser(req.userId, 'rivalUpdate', updated);

        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        for (const admin of admins) {
            createNotification(
                admin.id, 'SCORE_DISPUTED',
                '⚠️ Skor İtirazı',
                `${me?.username} otomatik onaylanan skora itiraz etti${reason ? `: ${reason}` : '.'}`,
                { rivalId: id, scoreAppeal: true, category: request.category, subCategory: request.subCategory }
            ).catch(() => {});
            emitToUser(admin.id, 'notification', {});
        }

        res.json(updated);
    } catch (error) { next(error); }
};

export const archiveMatch = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.senderId !== req.userId) return res.status(403).json({ message: 'Forbidden' });

        if (!request.scoreStatus) {
            await prisma.activityRequest.delete({ where: { id } });
            return res.json({ deleted: true });
        }
        await prisma.activityRequest.update({ where: { id }, data: { archived: true } });
        res.json({ message: 'Archived' });
    } catch (error) { next(error); }
};

export const getCompletedMatches = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const cat = category ? category.toUpperCase() : null;
        const catWhere = cat ? { category: cat } : {};
        const all = await prisma.activityRequest.findMany({
            where: {
                ...catWhere,
                ...(subCategory && { subCategory }),
                status: 'COMPLETED',
                scoreStatus: { not: 'CONFIRMED' },
            },
            include: { sender: { select: SENDER_SELECT } },
            orderBy: { completedAt: 'desc' },
            take: 20,
        });
        // Filter to only matches the user is involved in
        const myId = req.userId;
        const result = all.filter(r => {
            if (r.senderId === myId || r.receiverId === myId) return true;
            const parts = Array.isArray(r.participants) ? r.participants : [];
            return parts.some(p => p.id === myId);
        });
        res.json(result);
    } catch (error) { next(error); }
};

export const getArchivedMatchesBySport = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;
        const cat = category ? category.toUpperCase() : null;
        const catWhere = cat ? { category: cat } : {};
        const all = await prisma.activityRequest.findMany({
            where: {
                ...catWhere,
                ...(subCategory && { subCategory }),
                status: 'COMPLETED',
                archived: true,
                scoreStatus: 'CONFIRMED',
            },
            include: { sender: { select: SENDER_SELECT } },
            orderBy: { completedAt: 'desc' },
        });
        const myId = req.userId;
        const result = all.filter(r => {
            if (r.senderId === myId || r.receiverId === myId) return true;
            const parts = Array.isArray(r.participants) ? r.participants : [];
            return parts.some(p => p.id === myId);
        });
        res.json(result);
    } catch (error) { next(error); }
};

export const cancelRequest = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({
            where: { id },
            include: {
                sender: { select: { id: true, username: true, fullName: true } },
                joinRequests: { select: { userId: true } },
            },
        });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.senderId !== req.userId) return res.status(403).json({ message: 'Forbidden' });

        await prisma.activityRequest.update({ where: { id }, data: { status: 'CANCELLED' } });

        res.json({ message: 'Cancelled' });

        // Real-time: remove from all users' screens instantly
        broadcast('rivalDeleted', { rivalId: id, subCategory: request.subCategory });

        // Fire-and-forget notifications
        const senderName = request.sender?.username || 'İlan sahibi';
        const notifyIds = new Set(request.joinRequests.map(jr => jr.userId));
        const parts = Array.isArray(request.participants) ? request.participants : [];
        for (const p of parts) notifyIds.add(p.id);
        notifyIds.delete(req.userId);

        for (const uid of notifyIds) {
            createNotification(uid, 'MATCH_CANCELLED',
                '❌ İlan İptal Edildi',
                `${senderName} ilanı iptal etti.`,
                { rivalId: id, subCategory: request.subCategory }
            ).catch(() => {});
        }
    } catch (error) { next(error); }
};

// İlan sahibi yanlışlıkla kabul ettiği bir katılımcıyı (1v1'de rakibi, çiftlerde takımın
// tamamını) listeden çıkarır — ilan tekrar OPEN'a döner, çıkarılan oyuncu(lar)a bildirim gider.
export const removeRivalParticipant = async (req, res, next) => {
    try {
        const { id, userId } = req.params;
        const rival = await prisma.activityRequest.findUnique({ where: { id }, include: { sender: { select: SENDER_SELECT } } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi katılımcı çıkarabilir' });

        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const inParticipants = participants.some(p => p?.id === userId);
        const inSenderTeam  = senderTeamArr.some(p => p.id === userId);
        if (!inParticipants && !inSenderTeam) return res.status(404).json({ message: 'Bu kullanıcı katılımcı listesinde değil' });

        const removeIds = [userId];
        const updatedParticipants = inParticipants ? participants.filter(p => !removeIds.includes(p.id)) : participants;
        const updatedSenderTeam   = inSenderTeam  ? senderTeamArr.filter(p => !removeIds.includes(p.id)) : senderTeamArr;

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                participants: updatedParticipants,
                senderTeam: updatedSenderTeam,
                status: 'OPEN',
                receiverId: null,
                schedulingDeadline: null,
                // matchDate/matchTime yalnızca esnek programlı ilanlarda (eşleşme sonrası
                // belirlendiği için) sıfırlanır — sabit tarih/saatli ilanlarda bunlar
                // kort rezervasyonuyla birlikte ilan sahibinin kendi belirlediği bilgidir,
                // bir katılımcı çıkarıldı diye kaybolmamalı (kort rezervesi zaten duruyor).
                ...(rival.flexibleSchedule && { matchDate: null, matchTime: null }),
            },
            include: { sender: { select: SENDER_SELECT } },
        });

        await prisma.rivalJoinRequest.updateMany({
            where: { rivalId: id, userId: { in: removeIds }, status: 'ACCEPTED' },
            data: { status: 'REJECTED' },
        });

        broadcast('rivalUpdate', updated);
        for (const uid of removeIds) emitToUser(uid, 'rivalUpdate', updated);

        res.json({ removed: removeIds, request: updated });

        const senderName = rival.sender?.username || 'İlan sahibi';
        for (const uid of removeIds) {
            createNotification(uid, 'MATCH_CANCELLED',
                '⚠️ Katılımınız Kaldırıldı',
                `${senderName} sizi "${rival.subCategory}" ilanından çıkardı. İlan tekrar açık hâle geldi.`,
                { rivalId: id, subCategory: rival.subCategory }
            ).catch(() => {});
        }
    } catch (error) { next(error); }
};

export const cancelMatch = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { mutual = false } = req.body;

        const request = await prisma.activityRequest.findUnique({
            where: { id },
            include: { sender: { select: { id: true, username: true, fullName: true } } },
        });
        if (!request) return res.status(404).json({ message: 'Not found' });
        if (request.status !== 'MATCHED') return res.status(400).json({ message: 'Not a matched listing' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        const allPlayerIds = [request.senderId, ...participants.map(p => p.id)];
        const otherPlayerIds = allPlayerIds.filter(uid => uid !== req.userId);

        // Penalty window: 5 hours before match start
        let withinPenaltyWindow = false;
        if (request.matchDate && request.matchTime) {
            const [h, m] = request.matchTime.split(':').map(Number);
            const matchStart = new Date(request.matchDate);
            matchStart.setUTCHours(h, m, 0, 0);
            const hoursUntil = (matchStart - new Date()) / (1000 * 60 * 60);
            withinPenaltyWindow = hoursUntil > 0 && hoursUntil <= 5;
        }

        if (mutual) {
            const mutualReqs = Array.isArray(request.mutualCancelRequests) ? [...request.mutualCancelRequests] : [];
            if (!mutualReqs.includes(req.userId)) mutualReqs.push(req.userId);

            const bothAgreed = allPlayerIds.every(uid => mutualReqs.includes(uid));

            if (bothAgreed) {
                await prisma.activityRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
                res.json({ cancelled: true, mutual: true });
                for (const uid of allPlayerIds) emitToUser(uid, 'rivalDeleted', { rivalId: id, subCategory: request.subCategory });
                for (const uid of allPlayerIds) {
                    createNotification(uid, 'MATCH_CANCELLED',
                        '🤝 Maç İptal Edildi',
                        'Maç karşılıklı anlaşmayla cezasız iptal edildi.',
                        { rivalId: id, subCategory: request.subCategory }
                    ).catch(() => {});
                }
                return;
            }

            await prisma.activityRequest.update({ where: { id }, data: { mutualCancelRequests: mutualReqs } });
            const me = request.senderId === req.userId ? request.sender : (participants.find(p => p?.id === req.userId) || { username: 'Rakip' });
            res.json({ cancelled: false, mutual: true, requested: true });
            for (const uid of otherPlayerIds) {
                createNotification(uid, 'MUTUAL_CANCEL_REQUEST',
                    '⚠️ Karşılıklı İptal İsteği',
                    `${me.username} maçı karşılıklı iptal etmek istiyor. Sen de onaylarsan cezasız iptal edilir.`,
                    { rivalId: id, subCategory: request.subCategory }
                ).catch(() => {});
            }
            return;
        }

        // Regular (unilateral) cancel
        const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];
        const isCreatorSide = request.senderId === req.userId || senderTeamArr.some(m => m.id === req.userId);

        if (isCreatorSide) {
            // The listing's own side is cancelling — the post itself is no longer valid.
            await prisma.activityRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
            for (const uid of allPlayerIds) emitToUser(uid, 'rivalDeleted', { rivalId: id, subCategory: request.subCategory });
        } else {
            // A joining-side participant is cancelling — drop the whole joining side
            // (for doubles this is an atomic pair) and reopen the listing for new joiners.
            // matchDate/matchTime yalnızca esnek programlı ilanlarda sıfırlanır — sabit
            // tarih/saatli ilanlarda bunlar kort rezervasyonuyla birlikte ilan sahibinin
            // kendi belirlediği bilgidir, karşı taraf vazgeçti diye kaybolmamalı.
            await prisma.activityRequest.update({
                where: { id },
                data: {
                    status: 'OPEN', participants: [], receiverId: null, schedulingDeadline: null,
                    ...(request.flexibleSchedule && { matchDate: null, matchTime: null }),
                },
            });
            const updated = await prisma.activityRequest.findUnique({ where: { id }, include: { sender: { select: SENDER_SELECT } } });
            broadcast('rivalUpdate', updated);
            for (const uid of allPlayerIds) emitToUser(uid, 'rivalUpdate', updated);

            // Re-notify city-alert subscribers that a spot opened back up
            prisma.user.findUnique({ where: { id: request.senderId }, select: { city: true } })
                .then(u => {
                    const alertTitle = `📍 Yer Açıldı — ${request.subCategory}`;
                    const alertBody = `${request.sender?.username ? '@' + request.sender.username + ' ilanında' : 'Bir ilanda'} yer açıldı, hemen katıl!`;
                    notifyCitySubscribers({
                        subCategory: request.subCategory, category: request.category,
                        senderCity: u?.city || null,
                        senderUsername: request.sender?.username || '',
                        senderId: request.senderId,
                        itemId: id,
                        title: alertTitle,
                        body: alertBody,
                    });
                    notifyActivityAlertSubscribers({
                        subCategory: request.subCategory, category: request.category,
                        senderCity: u?.city || null,
                        senderUsername: request.sender?.username || '',
                        senderId: request.senderId,
                        itemId: id,
                        title: alertTitle,
                        body: alertBody,
                        lat: request.courtLat ?? null,
                        lng: request.courtLng ?? null,
                    });
                })
                .catch(() => {});
        }

        if (withinPenaltyWindow) {
            const interest = await prisma.userInterest.findFirst({
                where: { userId: req.userId, category: request.category, subCategory: request.subCategory },
            });
            if (interest) {
                const newCount = interest.lateCancelCount + 1;
                await prisma.userInterest.update({
                    where: { id: interest.id },
                    data: {
                        skillRating: Math.max(0, parseFloat((interest.skillRating - 0.20).toFixed(2))),
                        totalPoints: Math.max(0, interest.totalPoints - 4),
                        lateCancelCount: newCount,
                    },
                });
                if (newCount === 5) {
                    createNotification(req.userId, 'LATE_CANCEL_WARNING',
                        '⚠️ Son Dakika İptal Uyarısı',
                        `${request.subCategory} dalında 5 kez maçı son 5 saat içinde iptal ettiniz. Bu durum profilinizde görünür ve güvenilirliğinizi olumsuz etkiler.`,
                        { subCategory: request.subCategory }
                    ).catch(() => {});
                }
            }
        }

        res.json({ cancelled: true, reopened: !isCreatorSide, penaltyApplied: withinPenaltyWindow });

        const senderName = request.sender?.username || 'Rakip';
        for (const uid of otherPlayerIds) {
            createNotification(uid, 'MATCH_CANCELLED',
                isCreatorSide ? '❌ Maç İptal Edildi' : '↩️ Maç Yeniden Açıldı',
                isCreatorSide
                    ? (withinPenaltyWindow
                        ? `${senderName} maçı son 5 saat içinde iptal etti (ceza uygulandı).`
                        : `${senderName} maçı iptal etti.`)
                    : `Rakip taraf maçtan çekildi, ilan tekrar açık hâle geldi.`,
                { rivalId: id, subCategory: request.subCategory }
            ).catch(() => {});
        }
    } catch (error) { next(error); }
};

export const getMyUpcomingMatches = async (req, res, next) => {
    try {
        const all = await prisma.activityRequest.findMany({
            where: { status: 'MATCHED' },
            include: { sender: { select: SENDER_SELECT } },
            orderBy: { matchDate: 'asc' },
        });
        const myId = req.userId;
        const now = new Date();
        // Auto-delete flexible matches whose scheduling deadline passed
        const schedExpired = all.filter(m =>
            m.flexibleSchedule && m.schedulingDeadline && now > new Date(m.schedulingDeadline) && !m.matchDate
        );
        if (schedExpired.length > 0) {
            await prisma.activityRequest.deleteMany({ where: { id: { in: schedExpired.map(m => m.id) } } });
            for (const m of schedExpired) {
                const parts = Array.isArray(m.participants) ? m.participants : [];
                const allIds = [...new Set([m.senderId, ...parts.map(p => p.id)])];
                for (const uid of allIds) {
                    emitToUser(uid, 'rivalDeleted', { rivalId: m.id, subCategory: m.subCategory });
                    createNotification(
                        uid, 'MATCH_EXPIRED',
                        '⏰ Esnek Maç Silindi',
                        `${m.subCategory} esnek maçında 24 saat içinde tarih/saat/yer belirlenemediği için ilan otomatik silindi.`,
                        { subCategory: m.subCategory }
                    ).catch(() => {});
                }
            }
        }
        const schedExpiredIds = new Set(schedExpired.map(m => m.id));
        const mine = all.filter(r => {
            if (schedExpiredIds.has(r.id)) return false;
            if (r.senderId === myId) return true;
            return (Array.isArray(r.participants) ? r.participants : []).some(p => p.id === myId);
        });

        try {
            const allUserIds = [...new Set([
                ...mine.map(m => m.senderId),
                ...mine.flatMap(m => (Array.isArray(m.participants) ? m.participants : []).map(p => p.id)),
            ].filter(Boolean))];
            const interests = allUserIds.length > 0
                ? await prisma.userInterest.findMany({
                    where: { userId: { in: allUserIds } },
                    select: { userId: true, subCategory: true, skillRating: true },
                }) : [];
            const enriched = mine.map(m => ({
                ...m,
                senderSkillRating: interests.find(i => i.userId === m.senderId && i.subCategory === m.subCategory)?.skillRating ?? null,
                participants: (Array.isArray(m.participants) ? m.participants : []).map(p => ({
                    ...p,
                    skillRating: interests.find(i => i.userId === p.id && i.subCategory === m.subCategory)?.skillRating ?? null,
                })),
            }));
            return res.json(enriched);
        } catch (_) {
            return res.json(mine);
        }
    } catch (error) { next(error); }
};

export const proposeSchedule = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { date, time, location, courtName } = req.body;
        if (!date || !time) return res.status(400).json({ message: 'Tarih ve saat zorunlu' });

        const match = await prisma.activityRequest.findUnique({ where: { id } });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (match.status !== 'MATCHED') return res.status(400).json({ message: 'Maç eşleşmiş değil' });
        if (!match.flexibleSchedule) return res.status(400).json({ message: 'Bu maç esnek programlı değil' });

        const parts = Array.isArray(match.participants) ? match.participants : [];
        const isInvolved = match.senderId === req.userId || parts.some(p => p.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        if (match.schedulingDeadline && new Date() > new Date(match.schedulingDeadline)) {
            return res.status(400).json({ message: '24 saatlik süre doldu' });
        }

        const proposal = { userId: req.userId, date, time, location: location || null, courtName: courtName || null, proposedAt: new Date().toISOString() };
        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { scheduleProposal: proposal },
        });

        // Notify the other player(s)
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
        const otherIds = [match.senderId, ...parts.map(p => p.id)].filter(uid => uid !== req.userId);
        for (const uid of otherIds) {
            emitToUser(uid, 'rivalUpdate', updated);
            createNotification(uid, 'MATCH_CONFIRMED',
                '📅 Tarih Önerisi',
                `${me.fullName || me.username} esnek maç için ${date} ${time} önerdi. Kabul edebilir veya farklı önerebilirsin.`,
                { rivalId: id, category: match.category, subCategory: match.subCategory }
            ).catch(() => {});
        }

        res.json(updated);
    } catch (e) { next(e); }
};

export const acceptSchedule = async (req, res, next) => {
    try {
        const { id } = req.params;

        const match = await prisma.activityRequest.findUnique({ where: { id } });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (!match.scheduleProposal) return res.status(400).json({ message: 'Bekleyen öneri yok' });

        const proposal = match.scheduleProposal;
        if (proposal.userId === req.userId) return res.status(400).json({ message: 'Kendi önerinizi kabul edemezsiniz' });

        const parts = Array.isArray(match.participants) ? match.participants : [];
        const isInvolved = match.senderId === req.userId || parts.some(p => p.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        const matchDateObj = new Date(proposal.date);
        const updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                matchDate: matchDateObj,
                matchTime: proposal.time,
                location: proposal.location || match.location,
                courtName: proposal.courtName || match.courtName,
                scheduleProposal: null,
                schedulingDeadline: null,
            },
        });

        // Notify proposer
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
        const allIds = [match.senderId, ...parts.map(p => p.id)];
        for (const uid of allIds) {
            emitToUser(uid, 'rivalUpdate', updated);
            if (uid !== req.userId) {
                createNotification(uid, 'MATCH_CONFIRMED',
                    '✅ Tarih Onaylandı!',
                    `${me.fullName || me.username} önerinizi kabul etti. Maç ${proposal.date} ${proposal.time} olarak ayarlandı.`,
                    { rivalId: id, category: match.category, subCategory: match.subCategory }
                ).catch(() => {});
            }
        }

        res.json(updated);
    } catch (e) { next(e); }
};

export const getMyMatchHistory = async (req, res, next) => {
    try {
        const all = await prisma.activityRequest.findMany({
            where: { status: 'COMPLETED', scoreStatus: 'CONFIRMED' },
            include: {
                sender:   { select: SENDER_SELECT },
                receiver: { select: SENDER_SELECT },
            },
            orderBy: { completedAt: 'desc' },
            take: 100,
        });
        const myId = req.userId;
        const mine = all.filter(r => {
            if (r.senderId === myId || r.receiverId === myId) return true;
            return (Array.isArray(r.participants) ? r.participants : []).some(p => p.id === myId);
        });
        res.json(mine);
    } catch (error) { next(error); }
};

export const getMyRequests = async (req, res, next) => {
    try {
        const requests = await prisma.activityRequest.findMany({
            where: {
                OR: [
                    { senderId: req.userId },
                    { receiverId: req.userId },
                ],
            },
            include: {
                sender:   { select: SENDER_SELECT },
                receiver: { select: SENDER_SELECT },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(requests);
    } catch (error) {
        next(error);
    }
};

export const getForReservation = async (req, res, next) => {
    try {
        const { reservationId } = req.params;
        const existing = await prisma.activityRequest.findFirst({
            where: { venueReservationId: reservationId, senderId: req.userId, status: { not: 'CANCELLED' } },
            select: { id: true, status: true, subCategory: true, category: true },
        });
        res.json({ listing: existing || null });
    } catch (error) { next(error); }
};
