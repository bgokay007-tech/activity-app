import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser, broadcast } from '../config/socket.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';
import { TENNIS_PADEL_SUBCATEGORIES, TENNIS_PADEL_DOMINANT_THRESHOLD, getTennisPadelEloDelta, getReassessmentFlags } from '../utils/tennisElo.js';

// Voleybol rekabetçi maçlarında da (kullanıcı isteğiyle) tenis/padel'in takım-ortalaması
// bazlı ELO tablosu kullanılıyor — turnuva tarafında (tournament.controller.js) hâlâ sadece
// tenis/padel'e özel kurallar (MIN_MATCHES_FOR_TOURNAMENT vb.) geçerli olduğu için bu genişletme
// paylaşılan TENNIS_PADEL_SUBCATEGORIES sabitine değil, sadece bu dosyadaki skor onayı/ELO
// hesabına özel yerel bir kontrole eklendi.
const usesTennisEloTable = (subCategory) => TENNIS_PADEL_SUBCATEGORIES.includes(subCategory) || subCategory === 'volleyball';
import { PEER_REVIEW_SUBCATEGORIES } from '../utils/peerReview.js';
import { computeReservationStatus, overlaps, toMins, isPastDateTime, PRO_PACKAGES } from './venue.controller.js';
import { RATING_REQUIRED_SUBCATEGORIES } from '../config/assessments.js';
import { sanitizeExtraServices } from '../utils/extraServices.js';
import { subCategoryTR } from '../utils/subCategoryLabels.js';

// İlan açma/katılma öncesi ortak aktivite kontrolü: kullanıcı bu dalı "Aktivitelerim"e
// eklememişse veya gizlemişse (hidden=true, gizliyken hiçbir şey yapamaz) reddedilir.
// RATING_REQUIRED_SUBCATEGORIES'te ayrıca derece anketini (assessmentCompleted)
// tamamlamış olmalı — ekleme sırasında zorunlu olsa da eski kayıtlar için ikinci savunma hattı.
async function requireActiveInterest(userId, category, subCategory) {
    const interest = await prisma.userInterest.findUnique({
        where: { userId_category_subCategory: { userId, category, subCategory } },
    });
    if (!interest || interest.hidden) {
        const err = new Error('Bu dal için önce profilinden "Aktivitelerim"e eklemelisin.');
        err.status = 403; err.code = 'ACTIVITY_REQUIRED';
        throw err;
    }
    if (RATING_REQUIRED_SUBCATEGORIES.has(subCategory) && !interest.assessmentCompleted) {
        const err = new Error('Bu dalda ilan açabilmek/katılabilmek için önce derece anketini tamamlamalısın.');
        err.status = 403; err.code = 'ASSESSMENT_REQUIRED';
        throw err;
    }
    return interest;
}

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
        // Misafir (hesapsız, id'siz — manuel isimle eklenmiş) oyuncuların puanı
        // güncellenemez, ELO hesabından çıkarılıyorlar.
        const creatorTeam = [{ id: request.senderId }, ...senderTeamArr].filter(m => m?.id);
        const joiningTeam = participants.filter(m => m?.id); // opponent's team stored in participants after acceptance
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

    if (usesTennisEloTable(request.subCategory)) {
        // Tenis/Padel (ve voleybol rekabetçi maçları): kullanıcının verdiği sabit ELO puan
        // tablosu — takım ortalama skillRating'ine göre (çift/takım maçlarında iki taraf
        // için de takım ortalaması kullanılır, tek kişilik "takımlarda" o kişinin kendi
        // derecesi ortalamaya eşit olur).
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
                    `${subCategoryTR(request.subCategory)} dalında anketten sonraki ilk maçlarınızda dereceniz beklenenden farklı çıktı. Daha doğru bir eşleşme için lütfen derecelendirme anketini tekrar doldurun.`,
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

// Bir maç MATCHED'ten OPEN'a dönünce (katılımcı çıkarıldı/ayrıldı), o ilana daha önce
// bekleyen istek göndermiş herkese haber verilir — belki artık uygun değillerdir ve
// isteklerini geri çekmek isterler, ya da tam tersi, artık kabul edilme şansları var.
async function notifyPendingRequestersOfReopen(rivalId, category, subCategory, excludeUserIds = []) {
    try {
        const pending = await prisma.rivalJoinRequest.findMany({
            where: {
                rivalId,
                status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] },
                userId: { notIn: excludeUserIds },
            },
            select: { userId: true },
        });
        const uniqueUserIds = [...new Set(pending.map(p => p.userId))];
        for (const uid of uniqueUserIds) {
            createNotification(
                uid,
                'RIVAL_REOPENED',
                '↩️ İlan Tekrar Açıldı',
                'İstek attığınız maç tekrar açık ilanlara geçiş yaptı, isteğiniz kabul edilebilir. Artık uygun değilseniz isteğinizi geri çekebilirsiniz.',
                { rivalId, category, subCategory }
            ).catch(() => {});
        }
    } catch { /* bildirim gönderimi ilana geri açılma işlemini engellemesin */ }
}

// DOUBLE: 2 — taraflar artık eşleşmiş çift olarak katılıyor (senderTeam/joiningTeam),
// tek bir takım katılımı maçı tamamlar (3 ayrı bireysel katılımcı değil). Ancak partner
// sistemi gelmeden önce oluşturulmuş eski ilanlarda kurucunun senderTeam'i boştur —
// o ilanlar hâlâ eski modele göre (kurucu dahil 4 kişi = 3 bireysel katılımcı) tamamlanmalı.
const REQUIRED_PARTICIPANTS = { SINGLE: 1, DOUBLE: 2 };

function getRequired(request) {
    if (request.matchType === 'PLAYER_WANTED') return Number(request.levelDetail) || 999;
    if (request.teamSize > 1) return 1; // team-sport participants dizisi için (bkz. teamFilledCount — asıl MATCHED eşiği artık bu değil)
    if (request.matchType === 'DOUBLE') {
        const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];
        return senderTeamArr.length > 0 ? 2 : 3;
    }
    return REQUIRED_PARTICIPANTS[request.matchType] || 1;
}

// Hakem ücretini oyunculara eşit bölmek için maçtaki toplam oyuncu sayısı
// (getRequired'daki "1 opponent rep" voleybol kısayolu burada işe yaramaz,
// gerçek toplam oyuncu sayısı gerekiyor).
function totalPlayerCount(request) {
    if (request.matchType === 'DOUBLE') return 4;
    if (request.teamSize > 1) return request.teamSize * 2; // voleybol: her tarafta teamSize kişi
    return 2; // SINGLE
}

// Takım sporlarında (teamSize>1, örn. voleybol 6v6) MATCHED'e geçmek için gereken TOPLAM kadro
// dolulugu — kurucu + senderTeam + participants + unassignedPlayers + manuel isimli rakipler
// (oppTeamManualNames) hep birlikte sayılır. Eskiden sadece participants'a bakılıyordu ve
// getRequired() teamSize>1 için "1" döndürdüğünden 6v6 gibi bir maç SADECE 1 rakip katılınca
// (kalan 11 kişi hâlâ eksikken) yanlışlıkla "Yaklaşan Maçlar"a düşüyordu.
function teamFilledCount(request, overrides = {}) {
    const hasSlot = (p) => p && (p.id || p.manualName);
    const senderTeamArr = overrides.senderTeam ?? (Array.isArray(request.senderTeam) ? request.senderTeam : []);
    const participantsArr = overrides.participants ?? (Array.isArray(request.participants) ? request.participants : []);
    const unassignedArr = overrides.unassignedPlayers ?? (Array.isArray(request.unassignedPlayers) ? request.unassignedPlayers : []);
    const manualOppNames = Array.isArray(request.oppTeamManualNames) ? request.oppTeamManualNames : [];
    return 1 // kurucu (sender)
        + senderTeamArr.filter(hasSlot).length
        + participantsArr.filter(hasSlot).length
        + unassignedArr.filter(hasSlot).length
        + manualOppNames.length;
}

// DOUBLE maçta bireysel/takım kabul için cinsiyet uyumlu slot ataması — hem respondToJoin
// (hemen kabul) hem confirmLateJoin (joiner'ın geç-kabul onayı; durum o an yeniden kontrol
// edilmeli, çünkü aradan geçen sürede başka slotlar dolmuş olabilir) tarafından ortak
// kullanılır. Hata varsa { error } döner, yoksa { updatedParticipants, assignedToPartner,
// updatedSenderTeam } döner.
async function resolveDoubleAcceptance({ rival, joinReq, joiningTeam, partnerJoinReqToAccept, joinerEntry, participants, countFilled }) {
    const isTeamJoin = joiningTeam.length > 0;
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
            const slotName = i === 0 ? 'Rakip 1' : 'Rakip 2';
            // Cinsiyeti profilinde belirtilmemiş kullanıcı, cinsiyete özel (MALE/FEMALE)
            // bir slota uygunluğu doğrulanamadığı için o slota kabul edilmez — önceden
            // burada "cinsiyet boşsa kontrolü atla" hatası vardı, bu da cinsiyet kısıtlı
            // slotların fiilen hiç uygulanmamasına yol açıyordu.
            if (gUser?.gender !== 'OTHER') {
                if (!gUser?.gender) {
                    return { error: `Bu oyuncunun profilinde cinsiyet bilgisi girilmemiş, bu yüzden ${slotName} gibi cinsiyete özel bir slota atanamıyor.` };
                }
                if (gUser.gender !== gReq) {
                    const label = gReq === 'MALE' ? 'erkek' : 'kadın';
                    return { error: `${slotName} slotu için bu ilan yalnızca ${label} oyuncular kabul ediyor.` };
                }
            }
        }
        if (countFilled(participants) > 0) {
            return { error: 'Bu ilanda zaten kabul edilmiş bireysel katılımcı(lar) var. Takım eşleşmesini kabul etmeden önce onları çıkarın.' };
        }
        return {
            updatedParticipants: isTeamJoin
                ? joiningTeam
                : [joinerEntry, { id: partnerJoinReqToAccept.userId, username: partnerJoinReqToAccept.user.username, fullName: partnerJoinReqToAccept.user.fullName, avatar: partnerJoinReqToAccept.user.avatar }],
        };
    }

    // Bireysel kabul: sırayla ilk boş adlandırılmış slota (Takım Arkadaşı → Rakip1 → Rakip2)
    // cinsiyet uyumuna göre atanır. Bu sıra, ekranda "Katılımcı 1/2/3" olarak gösterilen
    // numaralandırmayla (partner=1, opp1=2, opp2=3) birebir eşleşir — böylece kabul edilen
    // ilk kişi Katılımcı 1, ikinci kişi Katılımcı 2 olarak görünür (katılım sırasını yansıtır).
    // Uyan slot yoksa kabul reddedilir (400) — geç kabul akışına bile hiç girmeden, çünkü
    // katılımcı zaten kabul edilemeyecek durumda.
    const gUser = await prisma.user.findUnique({ where: { id: joinReq.userId }, select: { gender: true } });
    const pg = gUser?.gender;
    // Cinsiyeti belirtilmemiş kullanıcı MIX olmayan (cinsiyete özel) slotlara uymaz —
    // sadece MIX slotlar veya kendi cinsiyetiyle eşleşen slotlar için uygun sayılır.
    const fits = (gReq) => pg === 'OTHER' || !gReq || gReq === 'MIX' || pg === gReq;

    const opp1Filled = !!(participants[0] && participants[0].id);
    const opp2Filled = !!(participants[1] && participants[1].id);
    const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
    const partnerFilled = senderTeamArr.length > 0 && !!senderTeamArr[0]?.id;

    let openSlots = [
        { key: 'partner', filled: partnerFilled, req: rival.partnerGenderReq || 'MIX', label: 'Takım Arkadaşı' },
        { key: 'opp1', filled: opp1Filled, req: opp1Req, label: 'Rakip 1' },
        { key: 'opp2', filled: opp2Filled, req: opp2Req, label: 'Rakip 2' },
    ].filter(s => !s.filled);

    // Takım Değiştirilemez (STRICT): başvuru sırasında seçilen slotla (veya taraf) sınırlı
    // kalır — owner, başvuranı seçtiğinin dışına atayamaz (takas özelliği zaten kapalı).
    if (rival.teamFlexibility === 'STRICT' && joinReq.requestedSlot) {
        openSlots = joinReq.requestedSlot === 'opponent'
            ? openSlots.filter(s => s.key === 'opp1' || s.key === 'opp2')
            : openSlots.filter(s => s.key === joinReq.requestedSlot);
        if (openSlots.length === 0) {
            return { error: joinReq.requestedSlot === 'partner' ? 'Kurucu takımı slotu artık dolu.' : 'Seçilen slot artık dolu.' };
        }
    }

    if (openSlots.length === 0) return { error: 'Tüm slotlar dolu.' };
    const target = openSlots.find(s => fits(s.req));
    if (!target) {
        const details = openSlots.map(s => s.req !== 'MIX' ? `${s.label}: ${s.req === 'MALE' ? 'erkek' : 'kadın'}` : null).filter(Boolean).join(', ');
        return { error: `Bu oyuncu ilanın cinsiyet gereksinimlerini karşılamıyor.${details ? ` (${details})` : ''}` };
    }

    if (target.key === 'partner') {
        return { updatedParticipants: participants, assignedToPartner: true, updatedSenderTeam: [joinerEntry] };
    }
    const newP = [participants[0] || null, participants[1] || null];
    newP[target.key === 'opp1' ? 0 : 1] = joinerEntry;
    return { updatedParticipants: newP };
}

// Hakem pazarlığı adımlarını (başvuru/karşı teklif/kabul/red) asıl maçın mevcut yorum
// akışına yazar — ilan sahibi, maça katılan oyuncular VE hakem aynı ortak alanda görür/yazar
// (yorum akışının kendisi zaten herkese açık, ekstra bir yetki kontrolüne gerek yok).
async function postRefereeComment(mainRivalId, userId, content) {
    if (!mainRivalId) return;
    try {
        const comment = await prisma.matchComment.create({
            data: { rivalId: mainRivalId, userId, content },
            include: { user: { select: { id: true, username: true, avatar: true } } },
        });
        emitToUser(userId, 'newComment', { rivalId: mainRivalId, comment });
        const mainRival = await prisma.activityRequest.findUnique({
            where: { id: mainRivalId },
            select: { senderId: true, participants: true },
        });
        if (mainRival) {
            const parts = Array.isArray(mainRival.participants) ? mainRival.participants : [];
            const notifyIds = new Set([mainRival.senderId, ...parts.filter(p => p?.id).map(p => p.id)]);
            notifyIds.delete(userId);
            for (const uid of notifyIds) emitToUser(uid, 'newComment', { rivalId: mainRivalId, comment });
        }
    } catch {}
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
            if (u?.gender === 'OTHER') return;
            const label = gReq === 'MALE' ? 'erkek' : 'kadın';
            // Cinsiyeti profilinde hiç belirtilmemiş kullanıcı için ayrı ve net bir mesaj —
            // "bu slot X cinsiyeti kabul ediyor" demek, oyuncunun GERÇEKTE o cinsiyette
            // olduğu durumlarda sahibine çelişkili/hatalı görünüyordu; asıl sebep oyuncunun
            // profilinde cinsiyet alanının boş olması, bunu açıkça belirtiyoruz.
            if (!u?.gender) {
                throw Object.assign(new Error(`Bu oyuncunun profilinde cinsiyet bilgisi girilmemiş, bu yüzden ${slotLabel} gibi cinsiyete özel bir slota atanamıyor. Oyuncunun profilinden cinsiyetini girmesi gerekiyor.`), { status: 400 });
            }
            if (u.gender !== gReq) {
                throw Object.assign(new Error(`${slotLabel} slotu yalnızca ${label} oyuncuları kabul ediyor`), { status: 400 });
            }
        };
        await checkGender(newPartner?.id, rival.partnerGenderReq, 'Takım Arkadaşı');
        await checkGender(newOpp1?.id,    rival.opp1GenderReq,    'Rakip 1');
        await checkGender(newOpp2?.id,    rival.opp2GenderReq,    'Rakip 2');

        const newSenderTeam   = newPartner ? [newPartner] : [];
        // DİKKAT: participants[0]=opp1, participants[1]=opp2 sabit konumludur (bkz. getP) —
        // .filter(Boolean) ile boş slotu diziden atmak, kalan oyuncuyu index 0'a kaydırıp
        // onu yanlışlıkla "Rakip 1" gibi göstermeye/okumaya sebep oluyordu (asıl bug buydu:
        // birini Rakip 2'ye taşıyınca Rakip 1 boşalırsa, o oyuncu tekrar Rakip 1'e "geri
        // kaymış" gibi görünüyordu). null'lar korunmalı ki konum anlamı bozulmasın.
        const newParticipants = [newOpp1, newOpp2];

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
                refereeUser: { select: SENDER_SELECT },
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { select: { level: true, skillRating: true, totalPoints: true, assessmentCompleted: true } } } } } },
                // Hakem Arıyorum ilanları (matchType PLAYER_WANTED, positions:['REFEREE']) için:
                // asıl maçın oyuncularını (kim başvuramaz) ve dolu/boş slot durumunu görebilmek için.
                linkedRival: { select: { id: true, senderId: true, matchType: true, teamSize: true, participants: true, senderTeam: true, participantsCanInvite: true, sender: { select: SENDER_SELECT } } },
            },
        });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        res.json(rival);
    } catch (error) { next(error); }
};

// Asıl maç ilanına bağlı "Hakem Arıyorum" ilanının başvurularını (fiyat teklifi/mesaj/CV)
// döner — ilan sahibi VE maça kabul edilmiş katılımcılar ortak görebilir.
export const getRefereeApplications = async (req, res, next) => {
    try {
        const { id } = req.params;
        const mainMatch = await prisma.activityRequest.findUnique({
            where: { id },
            select: { senderId: true, participants: true, senderTeam: true },
        });
        if (!mainMatch) return res.status(404).json({ message: 'İlan bulunamadı' });
        const participants = Array.isArray(mainMatch.participants) ? mainMatch.participants : [];
        const senderTeamArr = Array.isArray(mainMatch.senderTeam) ? mainMatch.senderTeam : [];
        const isInvolved = mainMatch.senderId === req.userId
            || participants.some(p => p?.id === req.userId)
            || senderTeamArr.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        const refAd = await prisma.activityRequest.findFirst({
            where: { linkedRivalId: id },
            include: {
                joinRequests: {
                    where: { status: { in: ['PENDING', 'COUNTERED', 'ACCEPTED'] } },
                    orderBy: { createdAt: 'asc' },
                    include: { user: { select: SENDER_SELECT } },
                },
            },
        });
        res.json({ refereeAdId: refAd?.id || null, applications: refAd?.joinRequests || [] });
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
            // linkedRivalId dolu olanlar bir asıl maça bağlı "Hakem Arıyorum" gölge ilanlarıdır —
            // zaten Hakemler sekmesinde ayrıca sayılıyor, genel ilan sayımına dahil edilmemeli.
            where: { status: 'OPEN', linkedRivalId: null, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
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
            linkedRivalId: null, // asıl maça bağlı "Hakem Arıyorum" gölge ilanları Hakemler sekmesinde ayrıca sayılıyor
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

        // Yaklaşan Maçlar (MATCHED) durumundaki bir ilanda oyuncular genelde iptal yerine
        // sadece kort/gün/saat değiştirmek ister — bunun için ayrı, dar kapsamlı bir yol izlenir
        // (takım/katılımcı alanlarına dokunulmaz, sadece lojistik bilgiler).
        if (rival.status === 'MATCHED') return updateMatchedRivalCourt(req, res, rival);
        if (rival.status !== 'OPEN') return res.status(400).json({ message: 'Sadece açık veya eşleşmiş ilanlar düzenlenebilir' });

        const { message, matchDate, matchTime, duration, location, district, ticketUrl, courtName, courtAddress, courtLat, courtLng,
                minRating, maxRating, ratingGenderSplit, minRatingMale, maxRatingMale, minRatingFemale, maxRatingFemale,
                matchMode, genderReq, partnerGenderReq, opp1GenderReq, opp2GenderReq, requiredMaleCount, winsNeeded,
                venueId, venueCourtId, venueReservationId, isCourtReserved, surface, courtFeePerPerson, courtFeePerPersonByMethod, refereeRequested, refereePayment, refereeFeeIncluded, manualRefereeName,
                teamFlexibility, matchType, participantsCanInvite, extraServices, feeIncludes, cancelPenaltyHours, subCount } = req.body;

        let cleanExtraServices;
        if (extraServices !== undefined) {
            cleanExtraServices = sanitizeExtraServices(extraServices);
            if (cleanExtraServices === null) return res.status(400).json({ message: 'Geçersiz ekstra hizmet' });
        }

        // İlan sahibi kendi derece puanının dışında kalan bir aralık kısıtlaması koyamaz —
        // düzenlemede sadece gönderilen alanlar değişir, o yüzden nihai değer mevcut
        // ilandaki değerle (rival.xxx) birleştirilerek hesaplanır (createRivalRequest'teki
        // aynı kontrolün düzenleme karşılığı).
        {
            const finalGenderSplit = ratingGenderSplit !== undefined ? !!ratingGenderSplit : rival.ratingGenderSplit;
            const pick = (v, existing) => v !== undefined ? (v !== '' && v !== null ? parseFloat(v) : null) : existing;
            let effMin = finalGenderSplit ? null : pick(minRating, rival.minRating);
            let effMax = finalGenderSplit ? null : pick(maxRating, rival.maxRating);
            if (finalGenderSplit) {
                const creatorUser = await prisma.user.findUnique({ where: { id: req.userId }, select: { gender: true } });
                if (creatorUser?.gender === 'MALE') {
                    effMin = pick(minRatingMale, rival.minRatingMale);
                    effMax = pick(maxRatingMale, rival.maxRatingMale);
                } else if (creatorUser?.gender === 'FEMALE') {
                    effMin = pick(minRatingFemale, rival.minRatingFemale);
                    effMax = pick(maxRatingFemale, rival.maxRatingFemale);
                }
            }
            if (effMin !== null || effMax !== null) {
                const creatorInterest = await prisma.userInterest.findFirst({ where: { userId: req.userId, category: rival.category, subCategory: rival.subCategory } });
                const creatorRating = creatorInterest?.skillRating ?? 0;
                if (effMin !== null && creatorRating < effMin)
                    return res.status(400).json({ message: `Bu kısıtlamayı koyamazsınız: en az ${effMin}★ istiyorsunuz ama kendi puanınız ${creatorRating.toFixed(2)}★.` });
                if (effMax !== null && creatorRating > effMax)
                    return res.status(400).json({ message: `Bu kısıtlamayı koyamazsınız: en fazla ${effMax}★ kabul ediyorsunuz ama kendi puanınız ${creatorRating.toFixed(2)}★.` });
            }
        }

        // matchType (tekli/çiftli) sadece hiç katılımcı/partner kabul edilmemişse
        // değiştirilebilir — aksi halde participants/senderTeam dizisinin şekli
        // (kim hangi slotta) uyumsuz kalır. teamFlexibility ise katılımcı dizisinin
        // şeklini etkilemez (sadece takas izni), o yüzden her zaman değiştirilebilir.
        const hasParticipants = (Array.isArray(rival.participants) && rival.participants.length > 0)
            || (Array.isArray(rival.senderTeam) && rival.senderTeam.length > 0);
        const matchTypeRequested = matchType !== undefined && matchType.toUpperCase() !== rival.matchType;
        const matchTypeLocked = matchTypeRequested && hasParticipants;
        const applyMatchType = matchTypeRequested && !hasParticipants;

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                ...(message !== undefined && { message }),
                ...(matchDate !== undefined && { matchDate: matchDate ? new Date(matchDate) : null }),
                ...(matchTime !== undefined && { matchTime }),
                ...(duration !== undefined && { duration: duration !== null && duration !== '' ? parseInt(duration, 10) : null }),
                ...(location !== undefined && { location }),
                ...(district !== undefined && { district: district || null }),
                ...(ticketUrl !== undefined && { ticketUrl: ticketUrl || null }),
                ...(courtName !== undefined && { courtName }),
                ...(courtAddress !== undefined && { courtAddress }),
                ...(courtLat !== undefined && { courtLat: courtLat !== null ? Number(courtLat) : null }),
                ...(courtLng !== undefined && { courtLng: courtLng !== null ? Number(courtLng) : null }),
                ...(minRating !== undefined && { minRating: minRating !== '' && minRating !== null ? parseFloat(minRating) : null }),
                ...(maxRating !== undefined && { maxRating: maxRating !== '' && maxRating !== null ? parseFloat(maxRating) : null }),
                ...(ratingGenderSplit !== undefined && { ratingGenderSplit: !!ratingGenderSplit }),
                ...(minRatingMale !== undefined && { minRatingMale: minRatingMale !== '' && minRatingMale !== null ? parseFloat(minRatingMale) : null }),
                ...(maxRatingMale !== undefined && { maxRatingMale: maxRatingMale !== '' && maxRatingMale !== null ? parseFloat(maxRatingMale) : null }),
                ...(minRatingFemale !== undefined && { minRatingFemale: minRatingFemale !== '' && minRatingFemale !== null ? parseFloat(minRatingFemale) : null }),
                ...(maxRatingFemale !== undefined && { maxRatingFemale: maxRatingFemale !== '' && maxRatingFemale !== null ? parseFloat(maxRatingFemale) : null }),
                ...(matchMode !== undefined && { matchMode: matchMode.toUpperCase() }),
                ...(genderReq !== undefined && { genderReq }),
                ...(partnerGenderReq !== undefined && { partnerGenderReq }),
                ...(opp1GenderReq !== undefined && { opp1GenderReq }),
                ...(opp2GenderReq !== undefined && { opp2GenderReq }),
                ...(requiredMaleCount !== undefined && { requiredMaleCount: requiredMaleCount !== null && requiredMaleCount !== '' ? parseInt(requiredMaleCount, 10) : null }),
                ...(winsNeeded !== undefined && { winsNeeded: winsNeeded !== null && winsNeeded !== '' ? parseInt(winsNeeded, 10) : null }),
                ...(cancelPenaltyHours !== undefined && { cancelPenaltyHours: cancelPenaltyHours !== null && cancelPenaltyHours !== '' ? parseInt(cancelPenaltyHours, 10) : null }),
                ...(subCount !== undefined && { substituteCount: Math.max(0, parseInt(subCount, 10) || 0) }),
                ...(venueId !== undefined && { venueId: venueId || null }),
                ...(venueCourtId !== undefined && { venueCourtId: venueCourtId || null }),
                ...(venueReservationId !== undefined && { venueReservationId: venueReservationId || null }),
                ...(isCourtReserved !== undefined && { isCourtReserved: !!isCourtReserved }),
                ...(surface !== undefined && { surface: surface ? surface.toUpperCase() : null }),
                ...(courtFeePerPerson !== undefined && { courtFeePerPerson: courtFeePerPerson !== null && courtFeePerPerson !== '' ? parseInt(courtFeePerPerson, 10) : null }),
                ...(courtFeePerPersonByMethod !== undefined && { courtFeePerPersonByMethod: courtFeePerPersonByMethod && typeof courtFeePerPersonByMethod === 'object' ? courtFeePerPersonByMethod : null }),
                ...(feeIncludes !== undefined && { feeIncludes: feeIncludes || null }),
                ...(refereeRequested !== undefined && { refereeRequested: !!refereeRequested }),
                ...(refereePayment !== undefined && { refereePayment: refereePayment || null }),
                ...(refereeFeeIncluded !== undefined && { refereeFeeIncluded: !!refereeFeeIncluded }),
                ...(manualRefereeName !== undefined && { manualRefereeName: manualRefereeName || null }),
                ...(teamFlexibility !== undefined && ['FLEXIBLE', 'STRICT'].includes(teamFlexibility) && { teamFlexibility }),
                ...(participantsCanInvite !== undefined && { participantsCanInvite: !!participantsCanInvite }),
                ...(cleanExtraServices !== undefined && { extraServices: cleanExtraServices }),
                ...(applyMatchType && {
                    matchType: matchType.toUpperCase(),
                    ...(matchType.toUpperCase() === 'SINGLE' && { partnerGenderReq: null, opp1GenderReq: null, opp2GenderReq: null }),
                }),
            },
            include: { sender: { select: SENDER_SELECT }, joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } } },
        });

        // İlan düzenlendiğinde, zaten kabul edilmiş katılımcılar (varsa) katılımcı
        // listesinden çıkarılıp tekrar onay bekleyen duruma (AWAITING_JOINER_CONFIRM)
        // alınır — detaylar değiştiği için artık uygun olmayabilirler. Aynı geç-kabul
        // onay/iptal akışı (confirmLateJoin) burada da kullanılır.
        let finalUpdated = updated;
        if (hasParticipants) {
            const acceptedJoinReqs = await prisma.rivalJoinRequest.findMany({
                where: { rivalId: id, status: 'ACCEPTED' },
            });
            if (acceptedJoinReqs.length > 0) {
                const acceptedIds = acceptedJoinReqs.map(jr => jr.userId);
                const clearedParticipants = Array.isArray(updated.participants)
                    ? updated.participants.map(p => (p?.id && acceptedIds.includes(p.id)) ? null : p)
                    : updated.participants;
                const clearedSenderTeam = Array.isArray(updated.senderTeam)
                    ? updated.senderTeam.filter(p => !(p?.id && acceptedIds.includes(p.id)))
                    : updated.senderTeam;
                await prisma.rivalJoinRequest.updateMany({
                    where: { id: { in: acceptedJoinReqs.map(jr => jr.id) } },
                    data: { status: 'AWAITING_JOINER_CONFIRM' },
                });
                finalUpdated = await prisma.activityRequest.update({
                    where: { id },
                    data: { participants: clearedParticipants, senderTeam: clearedSenderTeam, reopenedAt: new Date() },
                    include: {
                        sender: { select: SENDER_SELECT },
                        joinRequests: {
                            where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                            orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }],
                            include: { user: { select: SENDER_SELECT } },
                        },
                    },
                });
                for (const jr of acceptedJoinReqs) {
                    emitToUser(jr.userId, 'joinLateAccepted', { rivalId: id, requestId: jr.id });
                    createNotification(
                        jr.userId,
                        'RIVAL_EDITED_RECONFIRM',
                        '✏️ İlan Güncellendi — Onayınız Gerekiyor',
                        `"${finalUpdated.sender?.username || 'İlan sahibi'}" katıldığınız maçın detaylarını değiştirdi. Yeni bilgilerle devam etmek istiyorsanız onaylayın, istemiyorsanız iptal edin.`,
                        { rivalId: id, requestId: jr.id, category: finalUpdated.category, subCategory: finalUpdated.subCategory }
                    ).catch(() => {});
                }
            }
        }

        // Hakem talebi kapatıldı/açıldı → bağlı "Hakem Arıyorum" ilanını senkronize et
        const refereeWillBeRequested = refereeRequested !== undefined ? !!refereeRequested : rival.refereeRequested;
        if (refereeRequested !== undefined && !!refereeRequested !== rival.refereeRequested) {
            if (refereeRequested) {
                prisma.activityRequest.create({
                    data: {
                        senderId: req.userId,
                        category: updated.category,
                        subCategory: updated.subCategory,
                        matchType: 'PLAYER_WANTED',
                        teamSize: 1,
                        matchDate: updated.matchDate,
                        matchTime: updated.matchTime,
                        location: updated.location,
                        courtName: updated.courtName,
                        courtAddress: updated.courtAddress,
                        courtLat: updated.courtLat,
                        courtLng: updated.courtLng,
                        isCourtReserved: updated.isCourtReserved,
                        ...(updated.venueId            && { venueId: updated.venueId }),
                        ...(updated.venueCourtId       && { venueCourtId: updated.venueCourtId }),
                        ...(updated.venueReservationId && { venueReservationId: updated.venueReservationId }),
                        positions: ['REFEREE'],
                        ...(refereePayment && { refereePayment }),
                        linkedRivalId: updated.id,
                        status: 'OPEN',
                    },
                    include: { sender: { select: SENDER_SELECT } },
                }).then(refAd => broadcast('rivalUpdate', refAd)).catch(() => {});
            } else {
                prisma.activityRequest.findFirst({ where: { linkedRivalId: id, status: 'OPEN' } })
                    .then(refAd => {
                        if (!refAd) return;
                        const parts = Array.isArray(refAd.participants) ? refAd.participants : [];
                        if (parts.length > 0) return; // hakem zaten kabul edildiyse dokunma
                        return prisma.activityRequest.update({ where: { id: refAd.id }, data: { status: 'CANCELLED' } })
                            .then(() => broadcast('rivalDeleted', { rivalId: refAd.id, subCategory: refAd.subCategory }));
                    }).catch(() => {});
            }
        } else if (refereeWillBeRequested && refereePayment !== undefined) {
            // Hakem talebi zaten açıktı, sadece ücret değişti — bağlı ilanı (hakem henüz kabul
            // edilmediyse) güncel fiyatla senkronize et.
            prisma.activityRequest.findFirst({ where: { linkedRivalId: id, status: 'OPEN' } })
                .then(refAd => {
                    if (!refAd) return;
                    const parts = Array.isArray(refAd.participants) ? refAd.participants : [];
                    if (parts.length > 0) return;
                    return prisma.activityRequest.update({ where: { id: refAd.id }, data: { refereePayment: refereePayment || null } })
                        .then(a => broadcast('rivalUpdate', a));
                }).catch(() => {});
        }

        if (refereeWillBeRequested) syncRefereeAdCourt(id, updated);

        broadcast('rivalUpdate', finalUpdated);
        res.json(matchTypeLocked ? { ...finalUpdated, matchTypeLocked: true } : finalUpdated);
    } catch (error) { next(error); }
};

const fmtEndTime = (startTime, mins) => {
    const [h, m] = startTime.split(':').map(Number);
    const total = h * 60 + m + mins;
    return `${String(Math.floor(total / 60) % 24).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
};

// Bir maçın kort/rezervasyon bilgisi (adres, koordinat, rezerve edildi mi, tesis/kort/
// rezervasyon id) değiştiğinde, o maça bağlı "Hakem Arıyorum" ilanına (varsa) da yansıtır —
// aksi halde hakem ilanı asıl maçın kort bilgisinden bağımsız/eski kalır.
function syncRefereeAdCourt(rivalId, activity) {
    prisma.activityRequest.updateMany({
        where: { linkedRivalId: rivalId },
        data: {
            courtName: activity.courtName,
            courtAddress: activity.courtAddress,
            courtLat: activity.courtLat,
            courtLng: activity.courtLng,
            isCourtReserved: activity.isCourtReserved,
            venueId: activity.venueId,
            venueCourtId: activity.venueCourtId,
            venueReservationId: activity.venueReservationId,
        },
    }).catch(() => {});
}

// Bu maçın alıcısı/katılımcıları/bekleyen istek sahiplerine (ilan sahibi hariç) bildirim +
// rivalUpdate yayınlar — kort/saat değişikliği gibi tüm oyuncuları ilgilendiren güncellemeler için.
function notifyMatchParticipants(activity, { title, body, excludeUserId }) {
    const pendingReqsPromise = prisma.rivalJoinRequest.findMany({
        where: { rivalId: activity.id, status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
        select: { userId: true },
    });
    pendingReqsPromise.then(pendingReqs => {
        const participantIds = Array.isArray(activity.participants) ? activity.participants.map(p => p?.id).filter(Boolean) : [];
        const senderTeamIds = Array.isArray(activity.senderTeam) ? activity.senderTeam.map(p => p?.id).filter(Boolean) : [];
        const recipients = new Set([
            ...(activity.receiverId ? [activity.receiverId] : []),
            ...participantIds, ...senderTeamIds,
            ...pendingReqs.map(r => r.userId),
        ]);
        if (excludeUserId) recipients.delete(excludeUserId);
        recipients.delete(activity.senderId);
        for (const uid of recipients) {
            createNotification(uid, 'RESERVATION', title, body, { rivalId: activity.id, category: activity.category, subCategory: activity.subCategory }).catch(() => {});
            emitToUser(uid, 'rivalUpdate', activity);
        }
    }).catch(() => {});
}

// Eşleşmiş (MATCHED) bir ilanda sadece kort/gün/saat değişikliğine izin verir — takım/katılımcı
// alanlarına dokunulmaz. Gerçek bir işletme rezervasyonuna bağlıysa (venueReservationId), ilgili
// CourtReservation da senkronize edilir: aynı işletme içinde kort/saat değişikliği "değiştirme"
// (reschedule) olarak, farklı bir işletmenin kortuna geçiş ise eski rezervasyonun iptali + yeni
// işletmede yeni rezervasyon olarak işlenir. Kort kimliği değişiyorsa (aynı ya da farklı işletme
// fark etmez) hedef işletmenin Pro/Premium pakete sahip olması şart koşulur; ayrıca tesisin
// iptal/değişiklik saat penceresi (cancelHoursBefore/rescheduleHoursBefore) uygulanır. Onay durumu
// (otomatik/manuel) computeReservationStatus ile tesisin onay moduna göre belirlenir.
async function updateMatchedRivalCourt(req, res, rival) {
    try {
        const { matchDate, matchTime, duration, venueId, venueCourtId, courtName, courtAddress, courtLat, courtLng, surface, courtFeePerPerson, courtFeePerPersonByMethod } = req.body;

        const oldDateStr = rival.matchDate ? rival.matchDate.toISOString().slice(0, 10) : null;
        const dateChanged = matchDate !== undefined && matchDate !== oldDateStr;
        const timeChanged = matchTime !== undefined && matchTime !== rival.matchTime;
        const venueChanged = venueId !== undefined && (venueId || null) !== (rival.venueId || null);
        const courtChanged = venueCourtId !== undefined && (venueCourtId || null) !== (rival.venueCourtId || null);
        const anyCourtTimeChange = dateChanged || timeChanged || venueChanged || courtChanged;

        // Sadece kozmetik alanlar (adres, zemin, ücret vb.) değişmişse ya da hiçbir şey
        // değişmemişse — rezervasyon senkronizasyonuna gerek yok, direkt güncelle.
        if (!anyCourtTimeChange) {
            const updated = await prisma.activityRequest.update({
                where: { id: rival.id },
                data: {
                    ...(courtName !== undefined && { courtName }),
                    ...(courtAddress !== undefined && { courtAddress }),
                    ...(courtLat !== undefined && { courtLat: courtLat !== null ? Number(courtLat) : null }),
                    ...(courtLng !== undefined && { courtLng: courtLng !== null ? Number(courtLng) : null }),
                    ...(surface !== undefined && { surface: surface ? surface.toUpperCase() : null }),
                    ...(courtFeePerPerson !== undefined && { courtFeePerPerson: courtFeePerPerson !== null && courtFeePerPerson !== '' ? parseInt(courtFeePerPerson, 10) : null }),
                ...(courtFeePerPersonByMethod !== undefined && { courtFeePerPersonByMethod: courtFeePerPersonByMethod && typeof courtFeePerPersonByMethod === 'object' ? courtFeePerPersonByMethod : null }),
                    ...(duration !== undefined && { duration: duration !== null && duration !== '' ? parseInt(duration, 10) : null }),
                },
                include: { sender: { select: SENDER_SELECT } },
            });
            if (updated.refereeRequested) syncRefereeAdCourt(rival.id, updated);
            broadcast('rivalUpdate', updated);
            return res.json(updated);
        }

        const oldReservation = rival.venueReservationId
            ? await prisma.courtReservation.findUnique({ where: { id: rival.venueReservationId }, include: { venue: true } })
            : null;

        // Gerçek bir işletme rezervasyonu yok (serbest/kendi ayarladıkları kort) — politika
        // kontrolüne gerek yok, direkt güncellenip katılımcılara haber verilir.
        if (!oldReservation) {
            const newMatchDateObj = dateChanged ? new Date(`${matchDate}T00:00:00`) : rival.matchDate;
            const newMatchTime = timeChanged ? matchTime : rival.matchTime;
            const updated = await prisma.activityRequest.update({
                where: { id: rival.id },
                data: {
                    matchDate: newMatchDateObj, matchTime: newMatchTime,
                    ...(duration !== undefined && { duration: duration !== null && duration !== '' ? parseInt(duration, 10) : null }),
                    ...(courtName !== undefined && { courtName }),
                    ...(courtAddress !== undefined && { courtAddress }),
                    ...(courtLat !== undefined && { courtLat: courtLat !== null ? Number(courtLat) : null }),
                    ...(courtLng !== undefined && { courtLng: courtLng !== null ? Number(courtLng) : null }),
                    ...(surface !== undefined && { surface: surface ? surface.toUpperCase() : null }),
                    ...(courtFeePerPerson !== undefined && { courtFeePerPerson: courtFeePerPerson !== null && courtFeePerPerson !== '' ? parseInt(courtFeePerPerson, 10) : null }),
                ...(courtFeePerPersonByMethod !== undefined && { courtFeePerPersonByMethod: courtFeePerPersonByMethod && typeof courtFeePerPersonByMethod === 'object' ? courtFeePerPersonByMethod : null }),
                },
                include: { sender: { select: SENDER_SELECT } },
            });
            notifyMatchParticipants(updated, {
                title: '🔄 Maç Bilgisi Değişti',
                body: `"${updated.courtName || 'Kort'}" için maç ${newMatchDateObj ? newMatchDateObj.toISOString().slice(0, 10) : ''} ${newMatchTime || ''} olarak güncellendi.`,
            });
            if (updated.refereeRequested) syncRefereeAdCourt(rival.id, updated);
            broadcast('rivalUpdate', updated);
            return res.json(updated);
        }

        // Gerçek bir rezervasyona bağlı kort/saat değişikliği — tutarlılık için işletme, kort,
        // tarih ve saatin birlikte gönderilmesi istenir.
        if (!venueId || !venueCourtId || !matchDate || !matchTime) {
            return res.status(400).json({ message: 'Kort değişikliği için işletme, kort, tarih ve saat birlikte seçilmelidir.' });
        }
        if (isPastDateTime(matchDate, matchTime)) return res.status(400).json({ message: 'Geçmiş bir tarih/saate değişiklik yapılamaz' });

        const crossVenue = venueId !== rival.venueId;
        const courtIdentityChanged = venueCourtId !== rival.venueCourtId;

        const targetVenue = crossVenue ? await prisma.businessVenue.findUnique({ where: { id: venueId } }) : oldReservation.venue;
        const targetCourt = await prisma.venueCourt.findUnique({ where: { id: venueCourtId } });
        if (!targetVenue || targetVenue.status !== 'APPROVED') return res.status(404).json({ message: 'Tesis bulunamadı' });
        if (!targetCourt || targetCourt.venueId !== targetVenue.id) return res.status(404).json({ message: 'Kort bulunamadı' });

        // Kort kimliği değişiyorsa (aynı ya da farklı işletme fark etmez) hedef işletmenin
        // Pro/Premium pakete sahip olması şart — sadece saat değişen bir "değiştirme" için
        // paket şartı aranmaz.
        if (courtIdentityChanged) {
            const now = new Date();
            const sub = await prisma.businessSubscription.findFirst({ where: { userId: targetVenue.userId, status: 'ACTIVE', endDate: { gt: now } } });
            if (!sub || !PRO_PACKAGES.includes(sub.packageType)) {
                return res.status(403).json({ message: 'Bu tesis Pro veya Premium pakete sahip olmadığı için kort değişikliği bu ilan üzerinden yapılamaz. Mevcut rezervasyonu iptal edip yeniden ilan oluşturabilirsiniz.' });
            }
        }

        // İptal/değişiklik saat penceresi: farklı işletmeye geçiş = eski rezervasyonun iptali
        // (cancelHoursBefore), aynı işletmede kort/saat değişikliği = değiştirme (rescheduleHoursBefore).
        // Farklı işletmeye geçişte pencere şartı sağlanmıyorsa değişiklik YİNE DE engellenmez —
        // eski rezervasyon otomatik iptal edilmek yerine eski tesisin onayına gönderilir (mevcut
        // "iptal talebi" akışıyla aynı, bkz. requestCancelReservation/approveCancelRequest); aynı
        // işletmede sadece saat/kort değiştiren bir "değiştirme" için ise pencere şartı hâlâ sert
        // engel olarak kalır (o rezervasyon zaten iptal edilmiyor, sadece güncelleniyor).
        const policyField = crossVenue ? 'cancelHoursBefore' : 'rescheduleHoursBefore';
        const windowHours = oldReservation.venue?.[policyField];
        let oldCancelNeedsApproval = false;
        if (windowHours !== null && windowHours !== undefined) {
            const oldResDate = new Date(`${oldReservation.date}T${oldReservation.startTime}:00`);
            const hoursLeft = (oldResDate - new Date()) / 3600000;
            const withinPolicy = windowHours >= 0 && hoursLeft >= windowHours;
            if (!withinPolicy) {
                if (crossVenue) {
                    oldCancelNeedsApproval = true;
                } else {
                    return res.status(403).json({
                        message: windowHours < 0
                            ? 'Bu tesis rezervasyon değişikliğine izin vermiyor'
                            : `Mevcut rezervasyondan ${windowHours} saat öncesine kadar kort/saat değişikliği yapılabilir`,
                    });
                }
            }
        }

        const newDuration = duration !== undefined && duration !== null && duration !== '' ? parseInt(duration, 10) : (rival.duration || 60);
        const newEndTime = fmtEndTime(matchTime, newDuration);

        // Çakışma kontrolü (kendi eski rezervasyonu hariç)
        const conflicting = await prisma.courtReservation.findMany({
            where: { venueId, courtId: venueCourtId, date: matchDate, status: { not: 'CANCELLED' }, NOT: { id: oldReservation.id } },
        });
        const startMins = toMins(matchTime);
        const endMins = startMins + newDuration;
        const hasConflict = conflicting.some(r => {
            const rs = toMins(r.startTime);
            const re = toMins(r.endTime) <= rs ? toMins(r.endTime) + 1440 : toMins(r.endTime);
            return overlaps(startMins, endMins, rs, re);
        });
        if (hasConflict) return res.status(409).json({ message: 'Seçilen saat aralığı dolu' });

        const newStatus = computeReservationStatus(targetCourt, targetVenue, oldReservation.paymentMethod);
        let finalVenueReservationId = oldReservation.id;

        if (crossVenue) {
            if (oldCancelNeedsApproval) {
                // İptal penceresi geçmiş — eski rezervasyon otomatik iptal edilmiyor, tesisin
                // onayına gönderiliyor (mevcut "iptal talebi" akışıyla aynı alanlar).
                await prisma.courtReservation.update({
                    where: { id: oldReservation.id },
                    data: { cancelRequested: true, cancelRequestNote: 'Oyuncu maçı farklı bir tesise taşıdı, iptal süresi geçtiği için onayınız gerekiyor.' },
                });
                createNotification(oldReservation.venue.userId, 'RESERVATION', '⏳ İptal Onayı Gerekiyor',
                    `${oldReservation.date} ${oldReservation.startTime}–${oldReservation.endTime} rezervasyonu için oyuncu maçı farklı bir tesise taşıdı, ancak iptal süresi geçtiği için onayınız gerekiyor. Onaylarsanız rezervasyon iptal edilecek.`,
                    { reservationId: oldReservation.id, category: rival.category, subCategory: rival.subCategory }
                ).catch(() => {});
            } else {
                await prisma.courtReservation.update({ where: { id: oldReservation.id }, data: { status: 'CANCELLED' } });
                createNotification(oldReservation.venue.userId, 'RESERVATION', '🚫 Rezervasyon İptal Edildi',
                    `${oldReservation.date} ${oldReservation.startTime}–${oldReservation.endTime} rezervasyonu, oyuncu farklı bir tesise geçtiği için iptal edildi.`,
                    { reservationId: oldReservation.id, category: rival.category, subCategory: rival.subCategory }
                ).catch(() => {});
            }
            emitToUser(oldReservation.venue.userId, 'notification', {});

            const newReservation = await prisma.courtReservation.create({
                data: {
                    venueId, courtId: venueCourtId, userId: rival.senderId,
                    date: matchDate, startTime: matchTime, endTime: newEndTime,
                    paymentMethod: oldReservation.paymentMethod, status: newStatus,
                },
            });
            finalVenueReservationId = newReservation.id;
            createNotification(targetVenue.userId, 'RESERVATION',
                newStatus === 'CONFIRMED' ? '✅ Otomatik Onaylı Rezervasyon' : '📅 Yeni Rezervasyon',
                `Bir maç ilanı bu tesise taşındı: ${targetCourt.name} — ${matchDate} ${matchTime}–${newEndTime}.${newStatus === 'PENDING' ? ' Onayınız bekleniyor.' : ''}`,
                { reservationId: newReservation.id, category: rival.category, subCategory: rival.subCategory }
            ).catch(() => {});
            emitToUser(targetVenue.userId, 'notification', {});
        } else {
            await prisma.courtReservation.update({
                where: { id: oldReservation.id },
                data: { courtId: venueCourtId, date: matchDate, startTime: matchTime, endTime: newEndTime, status: newStatus },
            });
            createNotification(targetVenue.userId, 'RESERVATION',
                newStatus === 'CONFIRMED' ? '✅ Rezervasyon Değişti (Otomatik Onaylı)' : '📅 Rezervasyon Değiştirme Talebi',
                `${targetCourt.name} — ${matchDate} ${matchTime}–${newEndTime} olarak güncellendi.${newStatus === 'PENDING' ? ' Onayınız bekleniyor.' : ''}`,
                { reservationId: oldReservation.id, category: rival.category, subCategory: rival.subCategory }
            ).catch(() => {});
            emitToUser(targetVenue.userId, 'notification', {});
        }

        const updatedActivity = await prisma.activityRequest.update({
            where: { id: rival.id },
            data: {
                matchDate: new Date(`${matchDate}T00:00:00`), matchTime, duration: newDuration,
                venueId, venueCourtId, venueReservationId: finalVenueReservationId,
                courtName: `${targetVenue.name}${targetCourt.name ? ` ${targetCourt.name}` : ''}`,
                courtAddress: targetVenue.address || rival.courtAddress,
                courtLat: targetVenue.lat ?? rival.courtLat, courtLng: targetVenue.lng ?? rival.courtLng,
                isCourtReserved: true,
                ...(surface !== undefined && { surface: surface ? surface.toUpperCase() : null }),
                ...(courtFeePerPerson !== undefined && { courtFeePerPerson: courtFeePerPerson !== null && courtFeePerPerson !== '' ? parseInt(courtFeePerPerson, 10) : null }),
                ...(courtFeePerPersonByMethod !== undefined && { courtFeePerPersonByMethod: courtFeePerPersonByMethod && typeof courtFeePerPersonByMethod === 'object' ? courtFeePerPersonByMethod : null }),
            },
            include: { sender: { select: SENDER_SELECT } },
        });

        const oldCancelNote = (crossVenue && oldCancelNeedsApproval)
            ? ' Eski tesisteki rezervasyonunuzun iptali, iptal süresi geçtiği için o tesisin onayını bekliyor.'
            : '';
        notifyMatchParticipants(updatedActivity, {
            title: newStatus === 'PENDING' ? '⏳ Maç Kort/Saat Değişikliği Onay Bekliyor' : '🔄 Maç Kort/Saat Bilgisi Değişti',
            body: (newStatus === 'PENDING'
                ? `"${updatedActivity.courtName}" için maç ${matchDate} ${matchTime}–${newEndTime} olarak güncellenmek isteniyor, işletme onayı bekleniyor.`
                : `"${updatedActivity.courtName}" için maç ${matchDate} ${matchTime}–${newEndTime} olarak güncellendi.`) + oldCancelNote,
        });

        if (updatedActivity.refereeRequested) syncRefereeAdCourt(rival.id, updatedActivity);
        broadcast('rivalUpdate', updatedActivity);
        res.json({ ...updatedActivity, oldReservationCancelPending: crossVenue && oldCancelNeedsApproval });
    } catch (error) {
        console.error('[updateMatchedRivalCourt]', error);
        res.status(500).json({ message: error?.message || 'Kort/saat değişikliği başarısız oldu' });
    }
}

export const createRivalRequest = async (req, res, next) => {
    const creatorId = req.userId; // capture before any async ops
    try {
        const {
            category, subCategory, message, level, levelDetail,
            location, district, ticketUrl, courtName, courtAddress, courtLat, courtLng,
            venueId, venueCourtId, venueReservationId,
            isCourtReserved, flexibleSchedule, matchDate, matchTime,
            matchType = 'SINGLE', matchMode = 'PRACTICE', teamFlexibility = 'FLEXIBLE',
            surface, teamSize = 1, courtFeePerPerson, courtFeePerPersonByMethod, feeIncludes,
            senderTeam, // COMPETITIVE football: [{id,username,fullName,skillRating}]
            positions,  // e.g. ['REFEREE'] | ['REFEREE_OFFER']
            refereePayment,
            refereeFeeIncluded, // true = hakem ücreti hizmetler/kort fiyatına dahil, ayrı ücret yok
            refereeRequested, // bu maç ilanı için ayrıca hakem talep ediliyor mu (tenis/padel/voleybol)
            refereeInvites, // [{userId, price, message}] — hakem talebi belirli kullanıcılara doğrudan teklifli davet olarak gönderilecekse
            manualRefereeName, // sisteme kayıtlı olmayan hakem için serbest metin isim (tenis/padel/voleybol)
            extraServices, // [{id,type,name,price,artistListingId?}] — DJ/Sanatçı/Mangal Partisi vb. (tenis/padel/voleybol)
            minRating, maxRating,
            ratingGenderSplit, minRatingMale, maxRatingMale, minRatingFemale, maxRatingFemale,
            genderReq = 'MIX',
            partnerGenderReq = 'MIX',
            opp1GenderReq = 'MIX',
            opp2GenderReq = 'MIX',
            requiredMaleCount, // voleybol takım ilanı: havuzun (2*teamSize) kaç kişisinin erkek olması gerektiği — undefined/null = kısıtlama yok
            winsNeeded, // örn. airsoft: kaç raunt/oyun kazanınca maç biter
            partnerInviteId, // DOUBLE: partner daveti gönderilecek kullanıcının id'si
            opp1InviteId, opp2InviteId, // DOUBLE: rakip 1 / rakip 2 slotuna doğrudan davet gönderilecek kullanıcı id'leri
            oppTeamInviteIds, // takım sporları (voleybol): rakip takım slotlarına doğrudan davet gönderilecek kullanıcı id'leri
            oppTeamManualNames, // takım sporları: rakip takımda uygulamayı kullanmayan oyuncular için serbest metin isimler (bilgi amaçlı, davet gitmez)
            founderTeamInviteIds, // voleybol: kurucu takım slotlarına doğrudan davet gönderilecek kullanıcı id'leri (oppTeamInviteIds ile aynı mantık, isPartnerInvite:true)
            founderTeamManualNames, // voleybol: kurucu takımda uygulamayı kullanmayan oyuncular için serbest metin isimler
            substituteInviteIds, // voleybol: yedek oyuncu davet edilecek kullanıcı id'leri
            substituteManualNames, // voleybol: uygulamayı kullanmayan yedek oyuncular için serbest metin isimler
            unassignedInviteIds, // voleybol: hangi takımda oynayacağı henüz belli olmayan oyuncu davetleri
            unassignedManualNames, // voleybol: hangi takımda oynayacağı henüz belli olmayan, uygulamayı kullanmayan oyuncular için serbest metin isimler
            participantsCanInvite, // true ise kabul edilmiş katılımcılar da oyuncu davet edebilir / ilanı paylaşabilir
            cancelPenaltyHours, // voleybol: maça kaç saat kala tek taraflı iptalin cezalı (-0.10★) sayılacağı — null/undefined = genel 5 saat/-0.20 kuralı geçerli
            subCount, // voleybol: istenen yedek oyuncu kontenjanı (substitutePlayers doluluğundan bağımsız)
        } = req.body;
        console.log(`[rival] createRivalRequest creatorId=${creatorId} sub=${subCategory}`);

        let cleanExtraServices = [];
        if (extraServices !== undefined) {
            cleanExtraServices = sanitizeExtraServices(extraServices);
            if (cleanExtraServices === null) return res.status(400).json({ message: 'Geçersiz ekstra hizmet' });
        }

        const creatorInterest = await requireActiveInterest(creatorId, category, subCategory);

        // İlan sahibi kendi derece puanının dışında kalan bir aralık kısıtlaması koyamaz —
        // ör. kendi puanı 1.20 iken erkekler için 3-3.5 aralığı açması anlamsız, çünkü
        // kendisi zaten kurucu olarak maçın içinde ve bu kontrolden muaf tutuluyordu.
        const genderSplitOn = !!ratingGenderSplit;
        let creatorEffMin = genderSplitOn ? null : (minRating !== undefined && minRating !== null && minRating !== '' ? parseFloat(minRating) : null);
        let creatorEffMax = genderSplitOn ? null : (maxRating !== undefined && maxRating !== null && maxRating !== '' ? parseFloat(maxRating) : null);
        if (genderSplitOn) {
            const creatorUser = await prisma.user.findUnique({ where: { id: creatorId }, select: { gender: true } });
            if (creatorUser?.gender === 'MALE') {
                creatorEffMin = minRatingMale !== undefined && minRatingMale !== null && minRatingMale !== '' ? parseFloat(minRatingMale) : null;
                creatorEffMax = maxRatingMale !== undefined && maxRatingMale !== null && maxRatingMale !== '' ? parseFloat(maxRatingMale) : null;
            } else if (creatorUser?.gender === 'FEMALE') {
                creatorEffMin = minRatingFemale !== undefined && minRatingFemale !== null && minRatingFemale !== '' ? parseFloat(minRatingFemale) : null;
                creatorEffMax = maxRatingFemale !== undefined && maxRatingFemale !== null && maxRatingFemale !== '' ? parseFloat(maxRatingFemale) : null;
            }
        }
        if (creatorEffMin !== null || creatorEffMax !== null) {
            const creatorRating = creatorInterest.skillRating ?? 0;
            if (creatorEffMin !== null && creatorRating < creatorEffMin)
                return res.status(400).json({ message: `Bu kısıtlamayı koyamazsınız: en az ${creatorEffMin}★ istiyorsunuz ama kendi puanınız ${creatorRating.toFixed(2)}★.` });
            if (creatorEffMax !== null && creatorRating > creatorEffMax)
                return res.status(400).json({ message: `Bu kısıtlamayı koyamazsınız: en fazla ${creatorEffMax}★ kabul ediyorsunuz ama kendi puanınız ${creatorRating.toFixed(2)}★.` });
        }

        if (requiredMaleCount !== undefined && requiredMaleCount !== null && requiredMaleCount !== '') {
            const totalSlots = 2 * (Number(teamSize) || 1);
            const rmc = parseInt(requiredMaleCount, 10);
            if (Number.isNaN(rmc) || rmc < 0 || rmc > totalSlots) {
                return res.status(400).json({ message: 'Geçersiz erkek oyuncu sayısı' });
            }
        }

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
                district: district || null,
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
                ...(subCategory === 'volleyball' && cancelPenaltyHours !== undefined && cancelPenaltyHours !== null && cancelPenaltyHours !== ''
                    && { cancelPenaltyHours: parseInt(cancelPenaltyHours, 10) }),
                ...(subCategory === 'volleyball' && { substituteCount: Math.max(0, parseInt(subCount, 10) || 0) }),
                ...(req.body.duration && { duration: Number(req.body.duration) }),
                participants: [],
                // DOUBLE + partnerInviteId: partner henüz kabul etmedi, senderTeam boş.
                // Voleybol: kurucu takımda uygulamayı kullanmayan (manuel isim) oyuncular
                // da senderTeam'e {manualName} şeklinde direkt eklenir (davetsiz, bilgi amaçlı).
                senderTeam: (partnerInviteId && matchType.toUpperCase() === 'DOUBLE')
                    ? []
                    : [
                        ...(Array.isArray(senderTeam) ? senderTeam : []),
                        ...(Array.isArray(founderTeamManualNames)
                            ? founderTeamManualNames.filter(n => typeof n === 'string' && n.trim()).map(n => ({ manualName: n.trim() }))
                            : []),
                    ],
                oppTeamManualNames: Array.isArray(oppTeamManualNames) ? oppTeamManualNames.filter(n => typeof n === 'string' && n.trim()).map(n => n.trim()) : [],
                substitutePlayers: Array.isArray(substituteManualNames)
                    ? substituteManualNames.filter(n => typeof n === 'string' && n.trim()).map(n => ({ manualName: n.trim() }))
                    : [],
                // İlan oluştururken herkesi bir takıma atamak zorunlu değil (kullanıcı isteği) —
                // hangi tarafta oynayacağı henüz belli olmayan serbest metin isimler doğrudan
                // buraya, kayıtlı kullanıcı davetleri ise kabul edildikten sonra buraya eklenir
                // (bkz. unassignedInviteIds döngüsü ve respondToJoin'deki isUnassignedInvite dalı).
                unassignedPlayers: Array.isArray(unassignedManualNames)
                    ? unassignedManualNames.filter(n => typeof n === 'string' && n.trim()).map(n => ({ manualName: n.trim() }))
                    : [],
                positions: Array.isArray(positions) ? positions : [],
                extraServices: cleanExtraServices,
                ...(refereePayment && { refereePayment }),
                refereeFeeIncluded: !!refereeFeeIncluded,
                refereeRequested: !!refereeRequested,
                ...(manualRefereeName && { manualRefereeName }),
                participantsCanInvite: !!participantsCanInvite,
                ...(minRating !== undefined && minRating !== null && minRating !== '' && { minRating: parseFloat(minRating) }),
                ...(maxRating !== undefined && maxRating !== null && maxRating !== '' && { maxRating: parseFloat(maxRating) }),
                ratingGenderSplit: !!ratingGenderSplit,
                ...(minRatingMale !== undefined && minRatingMale !== null && minRatingMale !== '' && { minRatingMale: parseFloat(minRatingMale) }),
                ...(maxRatingMale !== undefined && maxRatingMale !== null && maxRatingMale !== '' && { maxRatingMale: parseFloat(maxRatingMale) }),
                ...(minRatingFemale !== undefined && minRatingFemale !== null && minRatingFemale !== '' && { minRatingFemale: parseFloat(minRatingFemale) }),
                ...(maxRatingFemale !== undefined && maxRatingFemale !== null && maxRatingFemale !== '' && { maxRatingFemale: parseFloat(maxRatingFemale) }),
                ...(courtFeePerPerson !== undefined && courtFeePerPerson !== null && { courtFeePerPerson: parseInt(courtFeePerPerson, 10) }),
                ...(courtFeePerPersonByMethod && typeof courtFeePerPersonByMethod === 'object' && { courtFeePerPersonByMethod }),
                ...(feeIncludes !== undefined && { feeIncludes: feeIncludes || null }),
                genderReq: genderReq || 'MIX',
                partnerGenderReq: partnerGenderReq || 'MIX',
                opp1GenderReq: opp1GenderReq || 'MIX',
                opp2GenderReq: opp2GenderReq || 'MIX',
                ...(requiredMaleCount !== undefined && requiredMaleCount !== null && requiredMaleCount !== ''
                    && { requiredMaleCount: parseInt(requiredMaleCount, 10) }),
                ...(winsNeeded !== undefined && winsNeeded !== null && winsNeeded !== ''
                    && { winsNeeded: parseInt(winsNeeded, 10) }),
                status: 'OPEN',
            },
            include: { sender: { select: SENDER_SELECT } },
        });

        res.status(201).json(request);

        // Real-time: show new listing instantly on all screens
        broadcast('rivalUpdate', request);

        // Hakem talebi: bu asıl maç ilanına bağlı, matchType PLAYER_WANTED ayrı bir
        // "Hakem Arıyorum" ilanı - Hakemler sekmesinde refereeMatches listesine düşer,
        // teklif verme/davet etme zaten mevcut join-request/invite akışını kullanır.
        if (refereeRequested && matchType.toUpperCase() !== 'PLAYER_WANTED') {
            prisma.activityRequest.create({
                data: {
                    senderId: req.userId,
                    category,
                    subCategory,
                    matchType: 'PLAYER_WANTED',
                    teamSize: 1,
                    matchDate: matchDate ? new Date(matchDate) : null,
                    matchTime,
                    location,
                    courtName: resolvedCourtName,
                    courtAddress,
                    courtLat: courtLat ? Number(courtLat) : null,
                    courtLng: courtLng ? Number(courtLng) : null,
                    isCourtReserved: isCourtReserved || false,
                    ...(venueId            && { venueId }),
                    ...(venueCourtId       && { venueCourtId }),
                    ...(venueReservationId && { venueReservationId }),
                    positions: ['REFEREE'],
                    ...(refereePayment && { refereePayment }),
                    refereeFeeIncluded: !!refereeFeeIncluded,
                    linkedRivalId: request.id,
                    status: 'OPEN',
                },
                include: { sender: { select: SENDER_SELECT } },
            }).then(async refAd => {
                broadcast('rivalUpdate', refAd);
                // Hakem belirli kullanıcılara davet edildiyse ("Hakem Davet Et"), her biri için
                // bağlı "Hakem Arıyorum" ilanına, kendi teklif fiyatı/mesajıyla doğrudan davet
                // gönderilir — hakem daveti kabul/red edebilir (handleRefereeJoinResponse).
                const invites = Array.isArray(refereeInvites) ? refereeInvites.filter(inv => inv?.userId) : [];
                for (const inv of invites) {
                    await prisma.rivalJoinRequest.create({
                        data: {
                            rivalId: refAd.id, userId: inv.userId, initiatedBy: 'OWNER',
                            offerPrice: inv.price ? `${parseInt(String(inv.price).replace(/[^0-9]/g, ''), 10)}₺` : null,
                            offerMessage: inv.message?.trim() || null,
                        },
                    }).catch(() => {});
                    createNotification(
                        inv.userId, 'MATCH_INVITE',
                        '🟨 Hakem Daveti',
                        inv.price
                            ? `@${request.sender?.username || 'Biri'} sizi ${inv.price}₺ teklifle bir maçta hakemlik yapmaya davet etti.`
                            : `@${request.sender?.username || 'Biri'} sizi bir maçta hakemlik yapmaya davet etti.`,
                        { category, subCategory, rivalId: refAd.id, refereeAd: true }
                    ).catch(() => {});
                }
                if (invites.length > 0) {
                    const updatedRefAd = await prisma.activityRequest.findUnique({
                        where: { id: refAd.id },
                        include: {
                            sender: { select: SENDER_SELECT },
                            joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                        },
                    });
                    if (updatedRefAd) {
                        emitToUser(creatorId, 'rivalUpdate', updatedRefAd);
                        for (const inv of invites) emitToUser(inv.userId, 'rivalUpdate', updatedRefAd);
                    }
                }
            }).catch(() => {});
        }

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

        // Takım sporları (voleybol): rakip takım slotlarına doğrudan davet — yukarıdaki
        // opp1/opp2InviteId ile aynı mantık (owner-initiated, inviteToRival'la aynı akış),
        // sadece DOUBLE'a değil takımSize>1 olan herhangi bir maça uygulanıyor.
        const oppTeamIds = Array.isArray(oppTeamInviteIds) ? [...new Set(oppTeamInviteIds.filter(Boolean))] : [];
        for (const oppInviteId of oppTeamIds) {
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
                    '🏐 Maç Daveti',
                    `@${me?.username || 'Biri'} sizi bir takım maçına davet etti.`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id }
                ).catch(() => {});
                emitToUser(oppInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: '🏐 Maç Daveti',
                    body: `@${me?.username || 'Biri'} sizi bir takım maçına davet etti.`,
                    data: { category: request.category, subCategory: request.subCategory, rivalId: request.id },
                });
            }).catch(() => {});
        }

        // Voleybol: kurucu takım slotlarına doğrudan davet — oppTeamIds ile birebir aynı
        // akış, sadece isPartnerInvite:true (kabul edilince senderTeam'e eklenir, bkz.
        // respondToJoinRequest). partnerInviteId (DOUBLE) ile karışmasın diye ayrı tutuluyor.
        const founderTeamIds = Array.isArray(founderTeamInviteIds) ? [...new Set(founderTeamInviteIds.filter(Boolean))] : [];
        for (const founderInviteId of founderTeamIds) {
            prisma.rivalJoinRequest.create({
                data: { rivalId: request.id, userId: founderInviteId, initiatedBy: 'OWNER', isPartnerInvite: true },
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
                    emitToUser(founderInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                createNotification(
                    founderInviteId, 'MATCH_INVITE',
                    '🏐 Takım Daveti',
                    `@${me?.username || 'Biri'} sizi kendi takımında bir maça davet etti.`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id }
                ).catch(() => {});
                emitToUser(founderInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: '🏐 Takım Daveti',
                    body: `@${me?.username || 'Biri'} sizi kendi takımında bir maça davet etti.`,
                    data: { category: request.category, subCategory: request.subCategory, rivalId: request.id },
                });
            }).catch(() => {});
        }

        // Voleybol: yedek oyuncu daveti — aynı akış, isSubstituteInvite:true (kabul edilince
        // substitutePlayers'a eklenir).
        const substituteIds = Array.isArray(substituteInviteIds) ? [...new Set(substituteInviteIds.filter(Boolean))] : [];
        for (const subInviteId of substituteIds) {
            prisma.rivalJoinRequest.create({
                data: { rivalId: request.id, userId: subInviteId, initiatedBy: 'OWNER', isSubstituteInvite: true },
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
                    emitToUser(subInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                createNotification(
                    subInviteId, 'MATCH_INVITE',
                    '🏐 Yedek Daveti',
                    `@${me?.username || 'Biri'} sizi bir maçta yedek oyuncu olmaya davet etti.`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id }
                ).catch(() => {});
                emitToUser(subInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: '🏐 Yedek Daveti',
                    body: `@${me?.username || 'Biri'} sizi bir maçta yedek oyuncu olmaya davet etti.`,
                    data: { category: request.category, subCategory: request.subCategory, rivalId: request.id },
                });
            }).catch(() => {});
        }

        // Voleybol: hangi takımda oynayacağı ilan oluşturulurken belli olmayan oyuncu daveti —
        // aynı akış, isUnassignedInvite:true (kabul edilince unassignedPlayers'a eklenir, ilan
        // sahibi sonradan Kurucu/Rakip'e atar). İlan oluştururken herkesi atamak zorunlu
        // olmadığı için (kullanıcı isteği) eklendi.
        const unassignedIds = Array.isArray(unassignedInviteIds) ? [...new Set(unassignedInviteIds.filter(Boolean))] : [];
        for (const unassignedInviteId of unassignedIds) {
            prisma.rivalJoinRequest.create({
                data: { rivalId: request.id, userId: unassignedInviteId, initiatedBy: 'OWNER', isUnassignedInvite: true },
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
                    emitToUser(unassignedInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                createNotification(
                    unassignedInviteId, 'MATCH_INVITE',
                    '🏐 Maç Daveti',
                    `@${me?.username || 'Biri'} sizi bir maça davet etti — takımınız yakında belli olacak.`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id }
                ).catch(() => {});
                emitToUser(unassignedInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: '🏐 Maç Daveti',
                    body: `@${me?.username || 'Biri'} sizi bir maça davet etti — takımınız yakında belli olacak.`,
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
                            district: district || null,
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
                    `${subCategoryTR(e.subCategory)} ilanınız için yeterli oyuncu bulunamadı ve maç saati geldiği için otomatik kaldırıldı.`,
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
                refereeUser: { select: SENDER_SELECT },
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
                // Hakem Arıyorum ilanları (matchType PLAYER_WANTED, positions:['REFEREE']) için:
                // asıl maçın oyuncularını (kim başvuramaz) ve dolu/boş slot durumunu görebilmek için.
                linkedRival: { select: { id: true, senderId: true, matchType: true, teamSize: true, participants: true, senderTeam: true, participantsCanInvite: true, sender: { select: SENDER_SELECT } } },
            },
            orderBy: { createdAt: 'desc' },
            take: 30,
        });

        // Mark each rival with current user's own join request status
        const rivalIds = requests.map(r => r.id);
        const [myJoinReqs, commentCounts] = await Promise.all([
            prisma.rivalJoinRequest.findMany({
                where: { userId: req.userId, rivalId: { in: rivalIds } },
                select: { id: true, rivalId: true, status: true, counterPrice: true, counterMessage: true, initiatedBy: true, offerPrice: true, offerMessage: true },
            }),
            prisma.matchComment.groupBy({
                by: ['rivalId'],
                where: { rivalId: { in: rivalIds } },
                _count: { id: true },
            }),
        ]);
        const myJoinMap = Object.fromEntries(myJoinReqs.map(j => [j.rivalId, { status: j.status, id: j.id, counterPrice: j.counterPrice, counterMessage: j.counterMessage, initiatedBy: j.initiatedBy, offerPrice: j.offerPrice, offerMessage: j.offerMessage }]));
        const commentCountMap = Object.fromEntries(commentCounts.map(c => [c.rivalId, c._count.id]));

        res.json(requests.map(r => ({
            ...r,
            _myJoinStatus: myJoinMap[r.id]?.status || null,
            _myJoinRequestId: myJoinMap[r.id]?.id || null,
            _myJoinCounterPrice: myJoinMap[r.id]?.counterPrice || null,
            _myJoinCounterMessage: myJoinMap[r.id]?.counterMessage || null,
            _myJoinInitiatedBy: myJoinMap[r.id]?.initiatedBy || null,
            _myJoinOfferPrice: myJoinMap[r.id]?.offerPrice || null,
            _myJoinOfferMessage: myJoinMap[r.id]?.offerMessage || null,
            commentCount: commentCountMap[r.id] ?? 0,
        })));
    } catch (error) {
        next(error);
    }
};

// Kullanıcının aynı gün, çakışan saatte (hakem olsun oyuncu olsun, spor farketmeksizin)
// zaten kesinleşmiş (MATCHED) bir maçı/hakemliği var mı — varsa çakışma bilgisini döner.
async function findSchedulingConflict(userId, matchDate, matchTime, duration, excludeId) {
    if (!matchDate || !matchTime) return null; // esnek programda saat belli olmadığından kontrol edilemez
    const dateStr = new Date(matchDate).toISOString().slice(0, 10);
    const [h, m] = matchTime.split(':').map(Number);
    const newStart = h * 60 + m;
    const newEnd = newStart + (parseInt(duration, 10) || 60);

    const dayStart = new Date(`${dateStr}T00:00:00.000Z`);
    const dayEnd = new Date(`${dateStr}T23:59:59.999Z`);

    const sameDay = await prisma.activityRequest.findMany({
        where: {
            id: { not: excludeId },
            status: 'MATCHED',
            matchDate: { gte: dayStart, lte: dayEnd },
            matchTime: { not: null },
        },
        select: { subCategory: true, matchTime: true, duration: true, participants: true, senderTeam: true, senderId: true, refereeId: true },
    });

    for (const cand of sameDay) {
        const isMine = cand.senderId === userId || cand.refereeId === userId
            || (Array.isArray(cand.participants) && cand.participants.some(p => p?.id === userId))
            || (Array.isArray(cand.senderTeam) && cand.senderTeam.some(p => p?.id === userId));
        if (!isMine) continue;
        const [ch, cm] = cand.matchTime.split(':').map(Number);
        const cStart = ch * 60 + cm;
        const cEnd = cStart + (parseInt(cand.duration, 10) || 60);
        if (newStart < cEnd && newEnd > cStart) return cand;
    }
    return null;
}

// Send a join request (pending — creator must accept)
export const sendJoinRequest = async (req, res, next) => {
    try {
        let { id } = req.params;
        let request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        // Asıl maç ilanı üzerinden "Hakemlik İçin Başvur" ile gelindiyse — asıl maça oyuncu
        // gibi eklenmesin, bağlı "Hakem Arıyorum" ilanına yönlendirilir.
        if (req.body.asReferee && request.refereeRequested && !(Array.isArray(request.positions) && request.positions.includes('REFEREE'))) {
            const refAd = await prisma.activityRequest.findFirst({ where: { linkedRivalId: id, status: 'OPEN' } });
            if (!refAd) return res.status(400).json({ message: 'Hakem ilanı bulunamadı' });
            id = refAd.id;
            request = refAd;
        }

        if (request.status !== 'OPEN') return res.status(400).json({ message: 'This request is no longer open' });
        if (request.senderId === req.userId) return res.status(400).json({ message: 'You cannot join your own request' });

        await requireActiveInterest(req.userId, request.category, request.subCategory);

        // Hakem ilanına başvuru: bağlı olduğu asıl maça zaten oyuncu olarak katılmış biri
        // (kurucu/rakip/partner fark etmez) aynı maça hakemlik başvurusu yapamaz.
        if (request.linkedRivalId) {
            const mainMatch = await prisma.activityRequest.findUnique({
                where: { id: request.linkedRivalId },
                select: { senderId: true, participants: true, senderTeam: true },
            });
            if (mainMatch) {
                const isPlayerInMatch = mainMatch.senderId === req.userId
                    || (Array.isArray(mainMatch.participants) && mainMatch.participants.some(p => p?.id === req.userId))
                    || (Array.isArray(mainMatch.senderTeam) && mainMatch.senderTeam.some(p => p?.id === req.userId));
                if (isPlayerInMatch) {
                    return res.status(400).json({ message: 'Bu maça oyuncu olarak katıldığınız için aynı maça hakemlik başvurusu yapamazsınız.' });
                }
            }
        }

        // Aynı gün/saatte (hangi spor olursa olsun) zaten kesinleşmiş başka bir maçı/hakemliği
        // varsa — aynı anda iki yerde olamaz, başvuru/katılım isteği engellenir.
        const conflict = await findSchedulingConflict(req.userId, request.matchDate, request.matchTime, request.duration, id);
        if (conflict) {
            return res.status(400).json({ message: `${conflict.matchTime} saatinde "${subCategoryTR(conflict.subCategory)}" için zaten bir aktiviteniz var — aynı anda başka bir maça/hakemliğe başvuramazsınız.` });
        }

        const existing = await prisma.rivalJoinRequest.findUnique({
            where: { rivalId_userId: { rivalId: id, userId: req.userId } },
        });
        if (existing && existing.status !== 'REJECTED') {
            return res.status(400).json({ message: 'You already sent a request', status: existing.status });
        }

        // Cinsiyet ve derece kısıtlaması kontrollerinin ikisi de başvuranın cinsiyetine
        // ihtiyaç duyabiliyor (derece kısıtlaması cinsiyete göre ayrıysa) — tek seferde çekilir.
        let joinerGenderChecked = false;
        let joiner = null;
        const getJoiner = async () => {
            if (!joinerGenderChecked) {
                joiner = await prisma.user.findUnique({ where: { id: req.userId }, select: { gender: true } });
                joinerGenderChecked = true;
            }
            return joiner;
        };

        // Gender restriction check — SINGLE. Cinsiyeti profilinde belirtilmemiş kullanıcı,
        // cinsiyete özel bir ilana uygunluğu doğrulanamadığı için reddedilir (OTHER hariç);
        // bu durumda "hangi cinsiyet aranıyor" değil, ayrıca "profilinden cinsiyetini gir"
        // mesajı gösteriyoruz — yoksa gerçekten o cinsiyette olan kullanıcılar için de
        // çelişkili/hatalı görünüyordu.
        if (request.matchType === 'SINGLE' && request.genderReq && request.genderReq !== 'MIX') {
            const j = await getJoiner();
            if (j?.gender !== 'OTHER') {
                if (!j?.gender) {
                    return res.status(400).json({ message: 'Bu ilana başvurmak için önce profilinden cinsiyetini belirtmen gerekiyor.' });
                }
                if (request.genderReq !== j.gender) {
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
                const j = await getJoiner();
                if (j?.gender !== 'OTHER') {
                    if (!j?.gender) {
                        return res.status(400).json({ message: 'Bu ilana başvurmak için önce profilinden cinsiyetini belirtmen gerekiyor.' });
                    }
                    const g = j.gender;
                    const canFillOpp1 = opp1Req === 'MIX' || g === opp1Req;
                    const canFillOpp2 = opp2Req === 'MIX' || g === opp2Req;
                    if (!canFillOpp1 && !canFillOpp2) {
                        return res.status(400).json({ message: 'Cinsiyet kısıtlamaları nedeniyle bu ilana başvuramazsınız.' });
                    }
                }
            }
        }

        // Derece kısıtlaması — ilan sahibi "cinsiyete göre ayrı" seçtiyse (ör. erkek 3-4,
        // kadın 4-5) başvuranın cinsiyetine göre uygun aralık seçilir; cinsiyeti belirtilmemiş/
        // OTHER olan kullanıcılar için derece kısıtlaması uygulanmaz (gender-req'teki OTHER
        // muafiyetiyle tutarlı).
        let effMinRating = request.minRating, effMaxRating = request.maxRating;
        if (request.ratingGenderSplit) {
            const j = await getJoiner();
            if (j?.gender === 'MALE') { effMinRating = request.minRatingMale; effMaxRating = request.maxRatingMale; }
            else if (j?.gender === 'FEMALE') { effMinRating = request.minRatingFemale; effMaxRating = request.maxRatingFemale; }
            else { effMinRating = null; effMaxRating = null; }
        }
        if (effMinRating !== null || effMaxRating !== null) {
            const userInterest = await prisma.userInterest.findFirst({
                where: { userId: req.userId, category: request.category, subCategory: request.subCategory },
            });
            const userRating = userInterest?.skillRating ?? 0;
            if (effMinRating !== null && userRating < effMinRating)
                return res.status(400).json({ message: `Bu ilan için en az ${effMinRating}★ puan gerekiyor. Sizin puanınız: ${userRating.toFixed(2)}★` });
            if (effMaxRating !== null && userRating > effMaxRating)
                return res.status(400).json({ message: `Bu ilan için en fazla ${effMaxRating}★ puan kabul ediliyor. Sizin puanınız: ${userRating.toFixed(2)}★` });
        }

        const joiningTeam = Array.isArray(req.body.joiningTeam) ? req.body.joiningTeam : [];
        let partnerId = req.body.partnerId || null;
        if (partnerId) {
            if (request.matchType !== 'DOUBLE') return res.status(400).json({ message: 'Partner seçimi sadece çiftler ilanlarında mümkün' });
            if (partnerId === req.userId) return res.status(400).json({ message: 'Kendinizi partner olarak seçemezsiniz' });
        }

        // Çiftler + Takım Değiştirilemez (STRICT): takas özelliği kapalı olduğu için başvuran
        // en baştan hangi tarafa (kurucu takımı / rakip takımı) katılmak istediğini seçmek
        // zorunda — sonradan "Takımları Düzenle" ile düzeltilemez.
        let requestedSlot = null;
        if (request.matchType === 'DOUBLE' && request.teamFlexibility === 'STRICT' && !partnerId) {
            requestedSlot = req.body.requestedSlot;
            if (!['partner', 'opp1', 'opp2', 'opponent'].includes(requestedSlot)) {
                return res.status(400).json({ message: 'Bu maçta takım değiştirilemiyor — lütfen hangi slota katılmak istediğinizi seçin.' });
            }
            const joinerU = await prisma.user.findUnique({ where: { id: req.userId }, select: { gender: true } });
            const jg = joinerU?.gender;
            const fits = (gReq) => !jg || jg === 'OTHER' || !gReq || gReq === 'MIX' || jg === gReq;
            const parts = Array.isArray(request.participants) ? request.participants : [];
            const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];
            const opp1Filled = !!(parts[0] && parts[0].id);
            const opp2Filled = !!(parts[1] && parts[1].id);
            if (requestedSlot === 'partner') {
                const partnerFilled = senderTeamArr.length > 0 && !!senderTeamArr[0]?.id;
                if (partnerFilled) return res.status(400).json({ message: 'Kurucu takımı slotu zaten dolu.' });
                if (!fits(request.partnerGenderReq)) return res.status(400).json({ message: 'Kurucu takımı slotu için cinsiyet uygunluğu sağlamıyorsunuz.' });
            } else if (requestedSlot === 'opp1' || requestedSlot === 'opp2') {
                const filled = requestedSlot === 'opp1' ? opp1Filled : opp2Filled;
                const gReq = requestedSlot === 'opp1' ? request.opp1GenderReq : request.opp2GenderReq;
                const label = requestedSlot === 'opp1' ? 'Rakip 1' : 'Rakip 2';
                if (filled) return res.status(400).json({ message: `${label} slotu zaten dolu.` });
                if (!fits(gReq)) return res.status(400).json({ message: `${label} slotu için cinsiyet uygunluğu sağlamıyorsunuz.` });
            } else {
                const canOpp1 = !opp1Filled && fits(request.opp1GenderReq);
                const canOpp2 = !opp2Filled && fits(request.opp2GenderReq);
                if (!canOpp1 && !canOpp2) return res.status(400).json({ message: 'Rakip takımında uygun boş slot yok.' });
            }
        }

        // Hakem başvurusu: fiyat teklifi / mesaj / CV — sadece positions:['REFEREE'] ilanlarında anlamlı
        const { offerPrice, offerMessage, offerCvUrl } = req.body;
        if (existing?.status === 'REJECTED') {
            // Reddedilen isteği yeniden PENDING yap — createdAt de sıfırlanır, yoksa eski
            // (reddedilen/geri çekilen) başvurunun tarihi kalır ve owner isteği dakikalar
            // içinde onaylasa bile respondToJoin'deki "1 saatten eski mi" kontrolü bu eski
            // tarihe bakıp yanlışlıkla "geç kabul" (joiner'a son onay sorusu) akışına sokar.
            await prisma.rivalJoinRequest.update({
                where: { rivalId_userId: { rivalId: id, userId: req.userId } },
                data: { status: 'PENDING', joiningTeam, partnerId, requestedSlot, offerPrice: offerPrice || null, offerMessage: offerMessage || null, offerCvUrl: offerCvUrl || null, createdAt: new Date() },
            });
        } else {
            await prisma.rivalJoinRequest.create({ data: { rivalId: id, userId: req.userId, joiningTeam, partnerId, requestedSlot, offerPrice: offerPrice || null, offerMessage: offerMessage || null, offerCvUrl: offerCvUrl || null } });
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

        const isRefereeAd = Array.isArray(request.positions) && request.positions.includes('REFEREE');
        createNotification(
            request.senderId,
            'RIVAL_JOIN_REQUEST',
            isRefereeAd ? '🟨 Yeni Hakemlik Başvurusu' : '📥 Yeni Katılım İsteği',
            isRefereeAd
                ? `${me?.fullName || me?.username || 'Biri'}, "${subCategoryTR(request.subCategory)}" maçınız için hakemlik başvurusu gönderdi.`
                : `${me?.fullName || me?.username || 'Biri'}, "${subCategoryTR(request.subCategory)}" ilanınıza katılmak istiyor.`,
            // Hakem başvurusunda bildirim, bağlı bir maç varsa asıl maça yönlendirir — başvurular
            // orada "Hakem Başvuruları" bölümünde görünür. Bağımsız hakem ilanıysa (eski akış)
            // ilanın kendisine, Hakemler sekmesi üzerinden.
            { rivalId: isRefereeAd ? (request.linkedRivalId || id) : id, category: request.category, subCategory: request.subCategory, ...(isRefereeAd && !request.linkedRivalId && { refereeAd: true }) }
        ).catch(() => {});

        // Hakem başvurusu: fiyat teklifi/mesaj, asıl maçın ortak yorum akışına da düşer —
        // ilan sahibi VE maça katılan oyuncular görsün, hakem de aynı akışta yazışabilsin.
        if (isRefereeAd && request.linkedRivalId) {
            const parts = [`🟨 Hakemlik başvurusu`];
            if (offerPrice) parts.push(`— Teklif: ${offerPrice}`);
            if (offerMessage) parts.push(`: "${offerMessage}"`);
            postRefereeComment(request.linkedRivalId, req.userId, parts.join(' '));
        }

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
                    : `${me?.username || 'Biri'} sizi bir ${subCategoryTR(request.subCategory)} ilanında çift partneri olarak seçti. Aynı ilana onu partner göstererek başvurursanız çift olarak eşleşirsiniz.`,
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
            `${joinReq.user?.fullName || joinReq.user?.username || 'Oyuncu'}, "${subCategoryTR(joinReq.rival.subCategory)}" ilanınıza gönderdiği katılım isteğini geri çekti.`,
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
                    : `${updated.user?.username || 'Biri'} sizi bir ${subCategoryTR(request.subCategory)} ilanında çift partneri olarak seçti.`,
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

        // Sahibi her zaman davet edebilir. Hakem ilanına davet ediliyorsa (linkedRivalId
        // dolu) yetki, asıl maçın katılımcısı olup olmadığına ve o maçın "Davete İzin
        // Ver" (participantsCanInvite) ayarına göre belirlenir — hakem ilanının kendi
        // (hep boş) participants alanına bakmak yanlış olurdu.
        let isAuthorized = rival.senderId === req.userId;
        if (!isAuthorized) {
            if (rival.linkedRivalId) {
                const mainMatch = await prisma.activityRequest.findUnique({
                    where: { id: rival.linkedRivalId },
                    select: { participants: true, senderTeam: true, participantsCanInvite: true },
                });
                if (mainMatch?.participantsCanInvite) {
                    const mp = Array.isArray(mainMatch.participants) ? mainMatch.participants : [];
                    const mt = Array.isArray(mainMatch.senderTeam) ? mainMatch.senderTeam : [];
                    isAuthorized = mp.some(p => p?.id === req.userId) || mt.some(p => p?.id === req.userId);
                }
            } else if (rival.participantsCanInvite) {
                isAuthorized = participants.some(p => p?.id === req.userId);
            }
        }
        if (!isAuthorized) return res.status(403).json({ message: 'Forbidden' });
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

        const isRefereeAd = Array.isArray(rival.positions) && rival.positions.includes('REFEREE');
        createNotification(
            userId, 'MATCH_INVITE',
            isRefereeAd ? '🟨 Hakemlik Daveti' : '🎾 Maç Daveti',
            isRefereeAd ? `@${me?.username} sizi maçında hakemlik yapmaya davet etti.` : `@${me?.username} sizi bir maça davet etti.`,
            { category: rival.category, subCategory: rival.subCategory, rivalId: rival.id, ...(isRefereeAd && { refereeAd: true }) }
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

        // Hakem başvurusu (bu istek, gerçek maça bağlı "Hakem Arıyorum" ilanına ait) — oyuncu
        // eşleştirme mantığından tamamen ayrı, karşılıklı fiyat pazarlığı akışına yönlendirilir.
        if (joinReq.rival.linkedRivalId) {
            return handleRefereeJoinResponse(req, res, joinReq);
        }

        // Owner responds to a join request from a player; the invited player responds to an owner-sent invite
        const responder = joinReq.initiatedBy === 'OWNER' ? joinReq.userId : joinReq.rival.senderId;
        if (responder !== req.userId) return res.status(403).json({ message: 'Forbidden' });

        // İdempotentlik: aynı istek zaten işlenmişse (çift dokunma / ağ tekrar denemesi) yeniden
        // işlenip tekrar tekrar bildirim gönderilmesin — bir isteğe bir kez yanıt verilebilir.
        if (joinReq.status !== 'PENDING') return res.status(400).json({ message: 'Bu istek zaten yanıtlanmış' });

        if (action !== 'accept') {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
            // Reddedildiğini diğer tarafa bildir — katıl/davet butonu geri açılsın
            const notifyTargetId = joinReq.initiatedBy === 'OWNER' ? joinReq.rival.senderId : joinReq.userId;
            emitToUser(notifyTargetId, 'joinRejected', { rivalId: joinReq.rivalId });
            // Owner'ın gönderdiği davet (partner/rakip 1/rakip 2) reddedildiyse ilan sahibine kalıcı bildirim gönder
            if (joinReq.initiatedBy === 'OWNER') {
                const roleLabel = joinReq.isPartnerInvite ? 'Partner' : joinReq.isSubstituteInvite ? 'Yedek' : 'Maça';
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
                if (pUser?.gender !== 'OTHER') {
                    if (!pUser?.gender) {
                        return res.status(400).json({ message: 'Bu oyuncunun profilinde cinsiyet bilgisi girilmemiş, bu yüzden Takım Arkadaşı gibi cinsiyete özel bir slota atanamıyor.' });
                    }
                    if (pUser.gender !== pGenderReq) {
                        const label = pGenderReq === 'MALE' ? 'erkek' : 'kadın';
                        return res.status(400).json({ message: `Takım Arkadaşı slotu için bu ilan yalnızca ${label} oyuncular kabul ediyor.` });
                    }
                }
            }
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
            const joinerData = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar };
            // DOUBLE'da (tenis/padel) senderTeam zaten tek partnerle sınırlı ve boştan
            // başlıyordu — ekleme=değiştirme, davranış değişmiyor. Voleybolde ise kurucu
            // takıma birden fazla kişi davet edilebildiği için mevcut diziye EKLENİR,
            // üzerine YAZILMAZ (önceden burada [joinerData] ile tüm dizi eziliyordu).
            const existingSenderTeam = Array.isArray(joinReq.rival.senderTeam) ? joinReq.rival.senderTeam : [];
            const updatedRival = await prisma.activityRequest.update({
                where: { id: joinReq.rivalId },
                data: { senderTeam: [...existingSenderTeam, joinerData] },
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

        // Yedek daveti kabul: substitutePlayers'a ekle
        if (joinReq.isSubstituteInvite) {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
            const joinerData = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar };
            const existingSubs = Array.isArray(joinReq.rival.substitutePlayers) ? joinReq.rival.substitutePlayers : [];
            const updatedRival = await prisma.activityRequest.update({
                where: { id: joinReq.rivalId },
                data: { substitutePlayers: [...existingSubs, joinerData] },
                include: {
                    sender: { select: SENDER_SELECT },
                    joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                },
            });
            emitToUser(joinReq.rival.senderId, 'rivalUpdate', updatedRival);
            emitToUser(joinReq.userId, 'joinAccepted', { rivalId: joinReq.rivalId, matched: false });
            createNotification(
                joinReq.rival.senderId, 'MATCH_CONFIRMED',
                '🪑 Yedek Kabul Etti',
                `${joinReq.user.username} yedek oyuncu olarak katılmayı kabul etti.`,
                { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            return res.json({ message: 'Yedek daveti kabul edildi.', request: updatedRival });
        }

        // Hangi takımda oynayacağı belli olmayan davet kabul: unassignedPlayers'a ekle —
        // ilan sahibi ilerde Yaklaşan Maçlar kartından Kurucu/Rakip'e elle atar.
        if (joinReq.isUnassignedInvite) {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
            const joinerData = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar };
            const existingUnassigned = Array.isArray(joinReq.rival.unassignedPlayers) ? joinReq.rival.unassignedPlayers : [];
            const updatedRival = await prisma.activityRequest.update({
                where: { id: joinReq.rivalId },
                data: { unassignedPlayers: [...existingUnassigned, joinerData] },
                include: {
                    sender: { select: SENDER_SELECT },
                    joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                },
            });
            emitToUser(joinReq.rival.senderId, 'rivalUpdate', updatedRival);
            emitToUser(joinReq.userId, 'joinAccepted', { rivalId: joinReq.rivalId, matched: false });
            createNotification(
                joinReq.rival.senderId, 'MATCH_CONFIRMED',
                '🤝 Davet Kabul Edildi',
                `${joinReq.user.username} maça katılmayı kabul etti — takımını sen atayacaksın.`,
                { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            return res.json({ message: 'Davet kabul edildi.', request: updatedRival });
        }

        // Build participants: when the joiner submitted a full team (football competitive team
        // matches, or tennis/padel doubles partner pairing), use the full joining team;
        // otherwise fall back to single-player addition. Independent of matchMode — a doubles
        // pairing is a structural fact about who's joining, not about practice vs competitive.
        //
        // NOT: Bu blok (cinsiyet/slot doğrulaması dahil) kasıtlı olarak "1 saatten geç kabul"
        // kontrolünden ÖNCE çalışır — aksi halde sahibi, artık uymayan bir istek için (ör. son
        // kalan slot kadın gerektirirken erkek başvurusu) doğrulama atlanıp doğrudan karşı
        // tarafa "onayınız bekleniyor" bildirimi gitmiş oluyordu; hiç kabul edilemeyecek bir
        // istek geç-kabul akışına sızmış oluyordu.
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
        let updatedUnassigned = null;

        if (rival.matchType === 'DOUBLE') {
            const resolved = await resolveDoubleAcceptance({ rival, joinReq, joiningTeam, partnerJoinReqToAccept, joinerEntry, participants, countFilled });
            if (resolved.error) return res.status(400).json({ message: resolved.error });
            updatedParticipants = resolved.updatedParticipants;
            assignedToPartner = !!resolved.assignedToPartner;
            updatedSenderTeam = resolved.updatedSenderTeam || null;
        } else {
            if (isTeamJoin && countFilled(participants) > 0) {
                return res.status(400).json({ message: 'Bu ilanda zaten kabul edilmiş bireysel katılımcı(lar) var. Takım eşleşmesini kabul etmeden önce onları çıkarın.' });
            }
            // Voleybol (teamSize>1): getRequired() sadece "1 rakip temsilcisi" istiyor — ilk
            // katılan MATCHED'ı tetiklemesi için normal şekilde participants'a girer. Maç zaten
            // eşleştikten SONRA gelen ek katılımcılar artık otomatik Rakip Takım'a düşmez,
            // "atanmamış" havuzuna eklenir — ilan sahibi Yaklaşan Maçlar kartından Kurucu/Rakip'e
            // elle yerleştirir (kullanıcı onayıyla netleşen davranış değişikliği).
            const isExtraVolleyballJoin = rival.subCategory === 'volleyball' && (rival.teamSize || 1) > 1 && !isTeamJoin && countFilled(participants) > 0;
            if (isExtraVolleyballJoin) {
                updatedParticipants = participants;
                updatedUnassigned = [...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []), joinerEntry];
            } else {
                updatedParticipants = isTeamJoin ? joiningTeam : [...participants, joinerEntry];
            }
        }

        // Geç kabul: yukarıdaki doğrulama geçti (bu istek gerçekten kabul edilebilir), şimdi
        // joiner'a tekrar onay isteriz — henüz hiçbir şey DB'ye yazılmadı. İki durumda tetiklenir:
        // (1) istek 1 saatten eski, (2) bu ilan daha önce MATCHED'ken açılmış (reopenedAt) —
        // süre farketmeksizin, çünkü başvuranın koşulları o zamandan beri değişmiş olabilir.
        const ONE_HOUR_MS = 60 * 60 * 1000;
        const lateAccept = (Date.now() - new Date(joinReq.createdAt).getTime() > ONE_HOUR_MS) || !!rival.reopenedAt;
        if (lateAccept) {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'AWAITING_JOINER_CONFIRM' } });
            emitToUser(joinReq.userId, 'joinLateAccepted', { rivalId: joinReq.rivalId, requestId });

            // Frontend, normal kabulde olduğu gibi bu yanıttaki `request.joinRequests`'i
            // doğrudan yerel state'e yazıyor — bunu döndürmezsek istek, optimistik olarak
            // listeden kaldırıldıktan sonra sadece onRefresh()'in gelmesine bağlı kalıyor
            // ve ilan sahibine o kişi "kaybolmuş" (aslında ⏳ Son Onay Bekleniyor durumunda)
            // gibi görünüyordu.
            const refreshedRival = await prisma.activityRequest.findUnique({
                where: { id: joinReq.rivalId },
                include: {
                    sender: { select: SENDER_SELECT },
                    joinRequests: {
                        where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                        orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }],
                        include: {
                            user: {
                                select: {
                                    ...SENDER_SELECT,
                                    interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true } },
                                },
                            },
                        },
                    },
                },
            });

            createNotification(
                joinReq.userId,
                'JOIN_LATE_ACCEPT',
                '⏰ Geç Kabul — Onayınız Bekleniyor',
                `"${joinReq.rival.sender?.username || 'Maç sahibi'}" katılım isteğinizi 1 saat sonra kabul etti. Maça katılmak istiyor musunuz? Onaylayın veya iptal edin.`,
                { rivalId: joinReq.rivalId, requestId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            return res.json({ lateAccept: true, message: 'Joiner re-confirmation required.', request: refreshedRival });
        }

        // Partner az önce atandıysa artık required=2'ye düşer (senderTeam DB'de henüz
        // güncellenmediği için getRequired hâlâ eski/boş senderTeam'e göre 3 döner).
        const isFull = assignedToPartner
            ? countFilled(participants) >= 2
            : (rival.teamSize || 1) > 1
                ? teamFilledCount(rival, { participants: updatedParticipants, unassignedPlayers: updatedUnassigned ?? rival.unassignedPlayers }) >= totalPlayerCount(rival)
                : countFilled(updatedParticipants) >= getRequired(rival);

        // Tüm doğrulama geçtikten SONRA join request'i ACCEPTED yap
        await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });

        const updateData = {
            status: isFull ? 'MATCHED' : 'OPEN',
            receiverId: isFull ? u.id : rival.receiverId,
            ...(isFull && rival.flexibleSchedule && { schedulingDeadline: new Date(Date.now() + 24 * 60 * 60 * 1000) }),
            // Maç yeniden tam dolduğunda, önceki "boşalmıştı" damgası artık geçerli değil —
            // sonraki (gelecekte olabilecek) kabuller tekrar normal (süreye bağlı) kurala döner.
            ...(isFull && { reopenedAt: null }),
            participants: updatedParticipants,
            ...(assignedToPartner && { senderTeam: updatedSenderTeam }),
            ...(updatedUnassigned && { unassignedPlayers: updatedUnassigned }),
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

// Hakem pazarlığı iki yönlü çalışır: hakem kendi başvurabilir (initiatedBy=JOINER, sahip
// kabul/red/karşı teklif verir) YA DA sahip belirli bir hakemi teklifle davet edebilir
// (initiatedBy=OWNER, bu kez hakem kabul/red/karşı teklif verir). Her iki yönde de PENDING
// durumunda sırası gelen taraf accept/reject/counter yapar, COUNTERED durumunda ise teklifi
// başlatan taraf accept_counter/reject_counter yapar. Kabul edilince başvuran/davetli bağlı
// asıl maçın hakem slotuna yerleşir ve (fiyat varsa) hakem ücreti oyuncu sayısına eşit bölünür.
async function handleRefereeJoinResponse(req, res, joinReq) {
    try {
        const { action, price } = req.body; // 'accept' | 'reject' | 'counter' | 'accept_counter' | 'reject_counter'
        const ownerId = joinReq.rival.senderId;
        const applicantId = joinReq.userId; // hakem — başvursun ya da davet edilsin fark etmez
        const isOwnerInitiated = joinReq.initiatedBy === 'OWNER';
        // PENDING'de sırası gelen taraf: davet sahipten geldiyse hakemde, başvuru hakemden geldiyse sahipte.
        const pendingTurnUserId   = isOwnerInitiated ? applicantId : ownerId;
        // COUNTERED'de sırası gelen taraf: teklifi ilk başlatan taraf (karşı teklife yanıt verir).
        const counteredTurnUserId = isOwnerInitiated ? ownerId : applicantId;
        // Bildirimler her zaman "işlemi yapmayan diğer tarafa" gider.
        const notifyPending   = isOwnerInitiated ? ownerId : applicantId;
        const notifyCountered = isOwnerInitiated ? applicantId : ownerId;

        if (['accept', 'reject', 'counter'].includes(action)) {
            if (req.userId !== pendingTurnUserId) return res.status(403).json({ message: 'Forbidden' });
            if (joinReq.status !== 'PENDING') return res.status(400).json({ message: 'Bu istek artık bekleyen durumda değil' });
        }
        if (['accept_counter', 'reject_counter'].includes(action)) {
            if (req.userId !== counteredTurnUserId) return res.status(403).json({ message: 'Forbidden' });
            if (joinReq.status !== 'COUNTERED') return res.status(400).json({ message: 'Bekleyen bir karşı teklif yok' });
        }

        if (action === 'reject') {
            await prisma.rivalJoinRequest.update({ where: { id: joinReq.id }, data: { status: 'REJECTED' } });
            emitToUser(joinReq.userId, 'joinRejected', { rivalId: joinReq.rivalId });
            res.json({ message: isOwnerInitiated ? 'Davet reddedildi' : 'Başvuru reddedildi' });
            createNotification(
                notifyPending, 'MATCH_INVITE_DECLINED',
                isOwnerInitiated ? '❌ Hakemlik Daveti Reddedildi' : '❌ Hakemlik Başvurunuz Reddedildi',
                isOwnerInitiated
                    ? `"${subCategoryTR(joinReq.rival.subCategory)}" maçı için gönderdiğiniz hakemlik daveti reddedildi.`
                    : `"${subCategoryTR(joinReq.rival.subCategory)}" maçı için hakemlik başvurunuz reddedildi.`,
                { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory, refereeAd: true }
            ).catch(() => {});
            postRefereeComment(joinReq.rival.linkedRivalId, req.userId, '❌ Hakemlik teklifi reddedildi.');
            return;
        }

        if (action === 'counter') {
            const counterPrice = price ? `${parseInt(String(price).replace(/[^0-9]/g, ''), 10)}₺` : null;
            if (!counterPrice || counterPrice === 'NaN₺') return res.status(400).json({ message: 'Geçerli bir karşı teklif fiyatı girin' });
            const { message } = req.body;
            const counterMessage = message && String(message).trim() ? String(message).trim() : null;
            const updated = await prisma.rivalJoinRequest.update({ where: { id: joinReq.id }, data: { status: 'COUNTERED', counterPrice, counterMessage } });
            res.json(updated);
            createNotification(
                notifyPending, 'MATCH_INVITE',
                '↔️ Karşı Teklif Aldınız',
                `"${subCategoryTR(joinReq.rival.subCategory)}" maçı için hakemlik teklifine karşılık ${counterPrice} karşı teklif geldi.${counterMessage ? ` "${counterMessage}"` : ''}`,
                { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory, refereeAd: true }
            ).catch(() => {});
            postRefereeComment(joinReq.rival.linkedRivalId, req.userId, `↔️ Karşı teklif: ${counterPrice}${counterMessage ? ` — ${counterMessage}` : ''}`);
            return;
        }

        if (action === 'reject_counter') {
            await prisma.rivalJoinRequest.update({ where: { id: joinReq.id }, data: { status: 'REJECTED' } });
            res.json({ message: 'Karşı teklif reddedildi' });
            createNotification(
                notifyCountered, 'MATCH_INVITE_DECLINED',
                '❌ Karşı Teklifiniz Reddedildi',
                `"${subCategoryTR(joinReq.rival.subCategory)}" maçı için verdiğiniz karşı teklif reddedildi.`,
                { rivalId: joinReq.rival.linkedRivalId || joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            postRefereeComment(joinReq.rival.linkedRivalId, req.userId, '❌ Karşı teklif reddedildi.');
            return;
        }

        if (action === 'accept_counter') {
            const updated = await prisma.rivalJoinRequest.update({
                where: { id: joinReq.id },
                data: { status: 'PENDING', offerPrice: joinReq.counterPrice, counterPrice: null },
            });
            res.json(updated);
            createNotification(
                notifyCountered, 'MATCH_INVITE',
                '✅ Karşı Teklifiniz Kabul Edildi',
                `"${subCategoryTR(joinReq.rival.subCategory)}" maçı için verdiğiniz ${joinReq.counterPrice} karşı teklif kabul edildi — onay bekleniyor.`,
                { rivalId: joinReq.rival.linkedRivalId || joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory, refereeAd: true }
            ).catch(() => {});
            postRefereeComment(joinReq.rival.linkedRivalId, req.userId, `✅ Karşı teklif kabul edildi: ${joinReq.counterPrice}`);
            return;
        }

        if (action === 'accept') {
            const refUser = await prisma.user.findUnique({ where: { id: joinReq.userId }, select: SENDER_SELECT });
            await prisma.rivalJoinRequest.update({ where: { id: joinReq.id }, data: { status: 'ACCEPTED' } });
            await prisma.activityRequest.update({
                where: { id: joinReq.rivalId },
                data: {
                    status: 'MATCHED',
                    receiverId: joinReq.userId,
                    participants: [{ id: refUser.id, username: refUser.username, fullName: refUser.fullName, avatar: refUser.avatar }],
                },
            });

            let updatedMain = null;
            let refereeShare = null;
            if (joinReq.rival.linkedRivalId) {
                const mainMatch = await prisma.activityRequest.findUnique({ where: { id: joinReq.rival.linkedRivalId } });
                if (mainMatch) {
                    const feeNum = parseInt(String(joinReq.offerPrice || '').replace(/[^0-9]/g, ''), 10);
                    refereeShare = feeNum ? Math.round(feeNum / totalPlayerCount(mainMatch)) : null;
                    updatedMain = await prisma.activityRequest.update({
                        where: { id: mainMatch.id },
                        data: { refereeId: joinReq.userId, ...(refereeShare && { refereeFeePerPerson: refereeShare }) },
                        include: { sender: { select: SENDER_SELECT }, refereeUser: { select: SENDER_SELECT } },
                    });
                    broadcast('rivalUpdate', updatedMain);
                }
            }

            emitToUser(joinReq.userId, 'joinAccepted', { rivalId: joinReq.rivalId, matched: true });
            res.json({ message: 'Hakem onaylandı', request: updatedMain });
            createNotification(
                notifyPending, 'MATCH_CONFIRMED',
                isOwnerInitiated ? '✅ Hakemlik Daveti Kabul Edildi' : '✅ Hakemlik Başvurunuz Onaylandı',
                isOwnerInitiated
                    ? `${refUser.fullName || refUser.username}, "${subCategoryTR(joinReq.rival.subCategory)}" maçında hakemlik davetinizi kabul etti.`
                    : `"${subCategoryTR(joinReq.rival.subCategory)}" maçı için hakemlik başvurunuz onaylandı.`,
                { rivalId: joinReq.rival.linkedRivalId || joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            postRefereeComment(joinReq.rival.linkedRivalId, req.userId, `✅ ${refUser.fullName || refUser.username} hakem olarak onaylandı${refereeShare ? ` — kişi başı ${refereeShare}₺` : ''}.`);
            return;
        }

        return res.status(400).json({ message: 'Geçersiz aksiyon' });
    } catch (error) {
        return res.status(500).json({ message: error?.message || 'Sunucu hatası' });
    }
}

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
        const alreadyFull = rival.status === 'MATCHED' || rival.status === 'CANCELLED' || ((rival.teamSize || 1) > 1
            ? teamFilledCount(rival) >= totalPlayerCount(rival)
            : participantsSoFar.length >= getRequired(rival));
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
        const countFilled = (arr) => arr.filter(p => p && p.id).length;
        const joinerEntry = { id: u.id, username: u.username, fullName: u.fullName, avatar: u.avatar, alias: joinerInterest?.alias || null };

        let updatedParticipants;
        let assignedToPartner = false;
        let updatedSenderTeam = null;
        let updatedUnassigned = null;

        if (rival.matchType === 'DOUBLE') {
            // Aradan geçen sürede diğer slotlar dolmuş/değişmiş olabilir — cinsiyet/slot uyumu
            // burada, onay anında, yeniden doğrulanır.
            const resolved = await resolveDoubleAcceptance({ rival, joinReq, joiningTeam, partnerJoinReqToAccept, joinerEntry, participants, countFilled });
            if (resolved.error) {
                await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
                emitToUser(joinReq.userId, 'joinRejected', { rivalId: joinReq.rivalId });
                return res.status(400).json({ message: resolved.error });
            }
            updatedParticipants = resolved.updatedParticipants;
            assignedToPartner = !!resolved.assignedToPartner;
            updatedSenderTeam = resolved.updatedSenderTeam || null;
        } else {
            if (isTeamJoin && participants.length > 0) {
                return res.status(400).json({ message: 'Bu ilanda zaten kabul edilmiş bireysel katılımcı(lar) var.' });
            }
            // Bkz. respondToJoin'deki aynı isim ve gerekçeli kontrol.
            const isExtraVolleyballJoin = rival.subCategory === 'volleyball' && (rival.teamSize || 1) > 1 && !isTeamJoin && countFilled(participants) > 0;
            if (isExtraVolleyballJoin) {
                updatedParticipants = participants;
                updatedUnassigned = [...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []), joinerEntry];
            } else {
                updatedParticipants = isTeamJoin ? joiningTeam : [...participants, joinerEntry];
            }
        }
        const isFull = assignedToPartner
            ? countFilled(participants) >= 2
            : (rival.teamSize || 1) > 1
                ? teamFilledCount(rival, { participants: updatedParticipants, unassignedPlayers: updatedUnassigned ?? rival.unassignedPlayers }) >= totalPlayerCount(rival)
                : countFilled(updatedParticipants) >= getRequired(rival);

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
                ...(assignedToPartner && { senderTeam: updatedSenderTeam }),
                ...(updatedUnassigned && { unassignedPlayers: updatedUnassigned }),
                ...(isFull && { reopenedAt: null }),
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
                matchType: { not: 'PLAYER_WANTED' }, // hakem/oyuncu-arıyorum ilanları gerçek maç değil, bu listeye karışmasın
                ...catWhere,
                ...(subCategory && { subCategory }),
            },
            include: { sender: { select: SENDER_SELECT }, refereeUser: { select: SENDER_SELECT }, _count: { select: { matchComments: true } } },
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
                    `${subCategoryTR(m.subCategory)} esnek maçında 24 saat içinde tarih/saat/yer belirlenemediği için ilan otomatik silindi.`,
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

        // Yorum sayacı sayfa yenilenmeden anlık artsın diye yorumu atan kullanıcıya da
        // 'newComment' gönderilir (bildirim değil, sadece canlı sayaç güncellemesi için).
        emitToUser(req.userId, 'newComment', { rivalId: id, comment });

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

        if (request.venueReservationId) {
            const reservation = await prisma.courtReservation.findUnique({ where: { id: request.venueReservationId } });
            if (reservation?.paymentConfirmStatus === 'NOT_COLLECTED') {
                return res.status(403).json({ message: 'Kort ücretiniz gerçekleşmedi, skor giremezsiniz.', code: 'COURT_FEE_NOT_PAID' });
            }
            const bill = await prisma.venueBill.findUnique({ where: { reservationId: request.venueReservationId } });
            if (bill && bill.status !== 'PAID') {
                return res.status(403).json({ message: 'Adisyon ödemeniz gerçekleşmedi, skor giremezsiniz.', code: 'BILL_NOT_PAID' });
            }
        }

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

// Maç detayından adisyonu görüntüle (sadece maça dahil olanlar, salt okunur)
export const getRivalBill = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        if (!request.venueReservationId) return res.json({ bill: null });

        const [reservation, bill] = await Promise.all([
            prisma.courtReservation.findUnique({ where: { id: request.venueReservationId } }),
            prisma.venueBill.findUnique({
                where: { reservationId: request.venueReservationId },
                include: { items: { orderBy: { createdAt: 'asc' } } },
            }),
        ]);

        res.json({
            bill,
            courtFeePaid: reservation?.paymentConfirmStatus !== 'NOT_COLLECTED',
        });
    } catch (error) { next(error); }
};

const BILL_PAYMENT_ESCALATE_MS = 2 * 60 * 60 * 1000; // ödeme talebinden 2 saat sonra admine bildirilebilir

// Katılımcı, ödenmemiş adisyon için diğer katılımcılardan uygulama üzerinden ödeme ister.
export const requestBillPayment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });
        if (!request.venueReservationId) return res.status(400).json({ message: 'Bu maça bağlı bir rezervasyon yok' });

        const bill = await prisma.venueBill.findUnique({
            where: { reservationId: request.venueReservationId },
            include: { venue: true },
        });
        if (!bill) return res.status(404).json({ message: 'Adisyon bulunamadı' });
        if (bill.status === 'PAID') return res.status(400).json({ message: 'Adisyon zaten ödenmiş' });

        const updated = await prisma.venueBill.update({
            where: { id: bill.id },
            data: { paymentRequestedAt: new Date() },
            include: { items: { orderBy: { createdAt: 'asc' } } },
        });
        res.json({ bill: updated });

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
        const otherIds = [...new Set([request.senderId, ...participants.map(p => p?.id)].filter(pid => pid && pid !== req.userId))];
        for (const uid of otherIds) {
            createNotification(uid, 'BILL_PAYMENT_REQUEST', '💳 Adisyon Ödeme Talebi',
                `${me?.fullName || me?.username} ${bill.venue.name} adisyonunun ödenmesini istedi. Toplam: ${updated.totalPrice}₺`,
                { rivalId: request.id, billId: bill.id }
            ).catch(() => {});
            emitToUser(uid, 'notification', {});
        }
    } catch (error) { next(error); }
};

// Ödeme talebine rağmen 2 saattir ödenmediyse admine bildirir.
export const reportBillUnpaid = async (req, res, next) => {
    try {
        const { id } = req.params;
        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });
        if (!request.venueReservationId) return res.status(400).json({ message: 'Bu maça bağlı bir rezervasyon yok' });

        const bill = await prisma.venueBill.findUnique({
            where: { reservationId: request.venueReservationId },
            include: { venue: true },
        });
        if (!bill) return res.status(404).json({ message: 'Adisyon bulunamadı' });
        if (bill.status === 'PAID') return res.status(400).json({ message: 'Adisyon zaten ödenmiş' });
        if (!bill.paymentRequestedAt) return res.status(400).json({ message: 'Önce katılımcılardan ödeme isteyin' });
        if (Date.now() - new Date(bill.paymentRequestedAt).getTime() < BILL_PAYMENT_ESCALATE_MS) {
            return res.status(400).json({ message: 'Ödeme talebinden bu yana 2 saat geçmeden admine bildirilemez' });
        }

        res.json({ ok: true });

        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        for (const admin of admins) {
            createNotification(admin.id, 'PAYMENT_ALERT', '🚨 Adisyon Ödemesi Alınamadı',
                `${bill.venue.name} adisyonu (${bill.totalPrice}₺) — ödeme talebine rağmen 2 saattir ödenmedi.`,
                { rivalId: request.id, billId: bill.id }
            ).catch(() => {});
        }
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
    const isTennisPadelMatch = usesTennisEloTable(request.subCategory);
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

const APPEAL_WINDOW_MS = 48 * 60 * 60 * 1000;

export const appealScore = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason } = req.body;
        const trimmedReason = typeof reason === 'string' ? reason.trim() : '';
        if (!trimmedReason) return res.status(400).json({ message: 'İtiraz için bir açıklama yazmalısınız.' });

        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Maç bulunamadı' });

        const participants = Array.isArray(request.participants) ? request.participants : [];
        const isInvolved = request.senderId === req.userId || participants.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Yetkisiz' });
        if (request.scoreStatus !== 'CONFIRMED') return res.status(400).json({ message: 'Yalnızca onaylanmış skorlara itiraz edilebilir' });
        if (request.scoreAppeal) return res.status(400).json({ message: 'Bu maç için zaten itiraz yapılmış' });
        // Maç arşive düştükten (completedAt) 48 saat sonra itiraz hakkı kapanır — istemci
        // butonu bu sürede zaten gizliyor, burası ikinci savunma hattı.
        if (request.completedAt && Date.now() - new Date(request.completedAt).getTime() > APPEAL_WINDOW_MS) {
            return res.status(400).json({ message: 'Bu maç için itiraz süresi (48 saat) doldu.' });
        }

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { scoreAppeal: true, scoreAppealReason: trimmedReason },
        });

        emitToUser(req.userId, 'rivalUpdate', updated);

        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } });
        for (const admin of admins) {
            createNotification(
                admin.id, 'SCORE_DISPUTED',
                '⚠️ Skor İtirazı',
                `${me?.username} otomatik onaylanan skora itiraz etti: ${trimmedReason}`,
                { rivalId: id, scoreAppeal: true, category: request.category, subCategory: request.subCategory }
            ).catch(() => {});
            emitToUser(admin.id, 'notification', {});
        }

        res.json(updated);
    } catch (error) { next(error); }
};

// Bir maçın hakemliğini değerlendirme — maç tamamlandıktan sonra o maçın katılımcıları
// (hakemin kendisi hariç) hakeme maç başına 1 kez yorum+yıldız (1-5) verebilir. Hakemin
// o kategori/dalda aktif bir ilanı varsa (RefereeListing) genel ortalama puanına da
// yansısın diye otomatik bağlanır — ilanı yoksa da yorum sorunsuz kaydedilir.
export const submitRefereeReview = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { rating, comment } = req.body;
        const r = parseInt(rating, 10);
        if (!r || r < 1 || r > 5) return res.status(400).json({ message: 'Geçerli bir yıldız puanı girin (1-5)' });

        const match = await prisma.activityRequest.findUnique({ where: { id } });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (!match.refereeId) return res.status(400).json({ message: 'Bu maçta hakem yok' });
        if (match.status !== 'COMPLETED') return res.status(400).json({ message: 'Sadece tamamlanmış maçların hakemi değerlendirilebilir' });
        if (match.refereeId === req.userId) return res.status(403).json({ message: 'Kendi hakemliğinizi değerlendiremezsiniz' });

        const participants = Array.isArray(match.participants) ? match.participants : [];
        const senderTeamArr = Array.isArray(match.senderTeam) ? match.senderTeam : [];
        const rosterIds = [match.senderId, ...participants.map(p => p?.id), ...senderTeamArr.map(m => m?.id)].filter(Boolean);
        if (!rosterIds.includes(req.userId)) return res.status(403).json({ message: 'Bu maçta yer almadığınız için hakemi değerlendiremezsiniz' });

        const listing = await prisma.refereeListing.findFirst({
            where: { userId: match.refereeId, category: match.category, subCategory: match.subCategory, status: 'ACTIVE' },
            select: { id: true },
        });

        const review = await prisma.refereeReview.upsert({
            where: { rivalId_reviewerId: { rivalId: id, reviewerId: req.userId } },
            update: { rating: r, comment: comment?.trim() || null },
            create: {
                rivalId: id, refereeUserId: match.refereeId, refereeListingId: listing?.id || null,
                reviewerId: req.userId, rating: r, comment: comment?.trim() || null,
            },
            include: { reviewer: { select: { id: true, username: true, fullName: true, avatar: true } } },
        });

        createNotification(
            match.refereeId, 'REFEREE_REVIEWED', '⭐ Hakemlik Değerlendirmesi',
            `Hakemlik yaptığınız bir maç için değerlendirme aldınız (${r}/5).`,
            { rivalId: id, category: match.category, subCategory: match.subCategory }
        ).catch(() => {});

        res.status(201).json(review);
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

        // Bağlı "Hakem Arıyorum" ilanı varsa (henüz hakem kabul edilmemişse) onu da iptal et
        prisma.activityRequest.updateMany({ where: { linkedRivalId: id, status: 'OPEN' }, data: { status: 'CANCELLED' } }).catch(() => {});

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
// DOUBLE maçlarda Yaklaşan Maçlar kartındaki iki takıma (kurucu: ilan sahibi+partner,
// rakip: opp1+opp2) isteğe bağlı özel bir isim verilebilir — set edilirse "İlan Sahibi"/
// "Katılımcı N" yerine "{isim} 1" / "{isim} 2" gösterilir. Voleybolde (değişken boyutlu
// takım, 1v1-6v6) de aynı alan TeamRosterCard'ın arka yüzünde kullanılır. Kurucu tarafı
// ilan sahibi veya partner/takım arkadaşı, rakip tarafı ilan sahibi veya katılımcılardan
// biri değiştirebilir.
export const setTeamName = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { side, name } = req.body; // side: 'founder' | 'opponent'
        if (!['founder', 'opponent'].includes(side)) return res.status(400).json({ message: 'Geçersiz taraf' });

        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        // Çiftler (DOUBLE) maçı dışında, voleybolde değişken boyutlu takım (1v1-6v6) için de
        // takım ismi ayarlanabilir — bkz. TeamRosterCard (SubCategoryScreen.js).
        const isVolleyballTeam = rival.subCategory === 'volleyball' && (rival.teamSize || 1) > 1;
        if (rival.matchType !== 'DOUBLE' && !isVolleyballTeam)
            return res.status(400).json({ message: 'Sadece çiftler veya takım maçında takım ismi ayarlanabilir' });

        const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const isOwner = rival.senderId === req.userId;
        const isFounderSide = isOwner || senderTeamArr.some(p => p?.id === req.userId);
        const isOpponentSide = isOwner || participants.some(p => p?.id === req.userId);
        const allowed = side === 'founder' ? isFounderSide : isOpponentSide;
        if (!allowed) return res.status(403).json({ message: 'Bu takımın ismini değiştiremezsiniz' });

        const trimmed = (name || '').trim().slice(0, 24);
        const updated = await prisma.activityRequest.update({
            where: { id },
            data: side === 'founder'
                ? { founderTeamName: trimmed || null }
                : { opponentTeamName: trimmed || null },
            include: { sender: { select: SENDER_SELECT } },
        });

        broadcast('rivalUpdate', updated);
        res.json(updated);
    } catch (error) { next(error); }
};

// Voleybol: açık ilana katılıp "atanmamış" havuzuna düşen (bkz. respondToJoin'deki
// isExtraVolleyballJoin) bir oyuncuyu ilan sahibi Kurucu/Rakip takımına atar, ya da
// zaten bir tarafta olan birini geri "atanmamış"a alır/diğer tarafa taşır (yer değiştirme).
// İlan sahibi hariç kimse taşınamaz — o zaten sabit kurucu.
export const assignPlayerToSide = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { userId, side } = req.body; // side: 'my' | 'opp' | null (null = atanmamışa geri al)
        if (![null, 'my', 'opp'].includes(side)) return res.status(400).json({ message: 'Geçersiz taraf' });

        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi oyuncu atayabilir' });
        if (rival.subCategory !== 'volleyball' || (rival.teamSize || 1) <= 1) {
            return res.status(400).json({ message: 'Bu işlem sadece voleybol takım maçlarında yapılabilir' });
        }
        if (userId === rival.senderId) return res.status(400).json({ message: 'İlan sahibi taşınamaz' });

        const senderTeam = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const unassigned = Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : [];
        const player = senderTeam.find(p => p?.id === userId) || participants.find(p => p?.id === userId) || unassigned.find(p => p?.id === userId);
        if (!player) return res.status(404).json({ message: 'Oyuncu bu ilanda bulunamadı' });

        const nextSenderTeam = senderTeam.filter(p => p?.id !== userId);
        const nextParticipants = participants.filter(p => p?.id !== userId);
        const nextUnassigned = unassigned.filter(p => p?.id !== userId);
        if (side === 'my') nextSenderTeam.push(player);
        else if (side === 'opp') nextParticipants.push(player);
        else nextUnassigned.push(player);

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: { senderTeam: nextSenderTeam, participants: nextParticipants, unassignedPlayers: nextUnassigned },
            include: { sender: { select: SENDER_SELECT } },
        });

        broadcast('rivalUpdate', updated);
        emitToUser(userId, 'rivalUpdate', updated);
        res.json(updated);
    } catch (error) { next(error); }
};

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
        // DOUBLE maçlarda participants[0]=Rakip 1, participants[1]=Rakip 2 sabit konumludur
        // (bkz. swapMatchPositions'daki getP) — .filter() ile çıkarılan slotu diziden atmak,
        // kalan oyuncuyu index 0'a kaydırıp onu yanlışlıkla Rakip 1 gibi göstermeye/okumaya
        // sebep oluyordu. Konumu null ile boşaltıp diziyi olduğu gibi bırakıyoruz.
        const updatedParticipants = inParticipants ? participants.map(p => (removeIds.includes(p?.id) ? null : p)) : participants;
        const updatedSenderTeam   = inSenderTeam  ? senderTeamArr.filter(p => !removeIds.includes(p.id)) : senderTeamArr;

        const wasMatched = rival.status === 'MATCHED';

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
                // Maç doluyken açılan bir slot — sonraki kabul (kimi kabul ederse etsin,
                // süre farketmeksizin) joiner'dan son onay ister (bkz. respondToJoin).
                ...(wasMatched && { reopenedAt: new Date() }),
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
                `${senderName} sizi "${subCategoryTR(rival.subCategory)}" ilanından çıkardı. İlan tekrar açık hâle geldi.`,
                { rivalId: id, subCategory: rival.subCategory }
            ).catch(() => {});
        }
        // Maç doluyken bu değişiklik olduysa, ilana bekleyen istek göndermiş
        // herkese de haber ver — belki artık uygun değillerdir ya da tam tersi.
        if (wasMatched) notifyPendingRequestersOfReopen(id, rival.category, rival.subCategory, removeIds);
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

        // senderTeam takım sporlarında (voleybol) kurucunun kendi eklediği takım
        // arkadaşlarını tutar — eskiden allPlayerIds/otherPlayerIds bunları hiç
        // saymıyordu, bu yüzden takım arkadaşları ne "involved" sayılıyor ne de
        // karşılıklı iptal/bildirim akışına dahil oluyordu.
        const participants = Array.isArray(request.participants) ? request.participants : [];
        const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];
        const senderTeamIds = senderTeamArr.filter(p => p?.id).map(p => p.id);
        const isInvolved = request.senderId === req.userId || participants.some(p => p?.id === req.userId) || senderTeamIds.includes(req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        const allPlayerIds = [request.senderId, ...senderTeamIds, ...participants.map(p => p.id)];
        const otherPlayerIds = allPlayerIds.filter(uid => uid !== req.userId);

        // Ceza penceresi: diğer dallarda sabit 5 saat/-0.20 puan. Voleybolde ise genel
        // kural hiç geçerli değil — ilan sahibi kendi eşiğini (cancelPenaltyHours) belirlediyse
        // o ilana özel eşik + sabit -0.10 puan uygulanır, belirlemediyse voleybol maçlarında
        // hiçbir geç iptal cezası yoktur (5 saatlik genel kurala düşmez).
        const isVolleyball = request.subCategory === 'volleyball';
        const penaltyWindowHours = isVolleyball ? request.cancelPenaltyHours : 5;
        const penaltyAmount = isVolleyball ? 0.10 : 0.20;
        let withinPenaltyWindow = false;
        if (penaltyWindowHours != null && request.matchDate && request.matchTime) {
            const [h, m] = request.matchTime.split(':').map(Number);
            const matchStart = new Date(request.matchDate);
            matchStart.setUTCHours(h, m, 0, 0);
            const hoursUntil = (matchStart - new Date()) / (1000 * 60 * 60);
            withinPenaltyWindow = hoursUntil > 0 && hoursUntil <= penaltyWindowHours;
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
        const isCreatorSide = request.senderId === req.userId || senderTeamIds.includes(req.userId);

        if (isCreatorSide) {
            // The listing's own side is cancelling — the post itself is no longer valid.
            await prisma.activityRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
            prisma.activityRequest.updateMany({ where: { linkedRivalId: id, status: 'OPEN' }, data: { status: 'CANCELLED' } }).catch(() => {});
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
                    // Maç doluyken açılan bir slot — sonraki kabul (kimi kabul ederse etsin,
                    // süre farketmeksizin) joiner'dan son onay ister (bkz. respondToJoin).
                    reopenedAt: new Date(),
                    ...(request.flexibleSchedule && { matchDate: null, matchTime: null }),
                },
            });
            const updated = await prisma.activityRequest.findUnique({ where: { id }, include: { sender: { select: SENDER_SELECT } } });
            broadcast('rivalUpdate', updated);
            for (const uid of allPlayerIds) emitToUser(uid, 'rivalUpdate', updated);
            // İlana bekleyen istek göndermiş herkese de haber ver — belki artık uygun
            // değillerdir ya da tam tersi, artık kabul edilme şansları var.
            notifyPendingRequestersOfReopen(id, request.category, request.subCategory, allPlayerIds);

            // Re-notify city-alert subscribers that a spot opened back up
            prisma.user.findUnique({ where: { id: request.senderId }, select: { city: true } })
                .then(u => {
                    const alertTitle = `📍 Yer Açıldı — ${subCategoryTR(request.subCategory)}`;
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
                        skillRating: Math.max(0, parseFloat((interest.skillRating - penaltyAmount).toFixed(2))),
                        totalPoints: Math.max(0, interest.totalPoints - Math.round(penaltyAmount * 20)),
                        lateCancelCount: newCount,
                    },
                });
                if (newCount === 5) {
                    createNotification(req.userId, 'LATE_CANCEL_WARNING',
                        '⚠️ Son Dakika İptal Uyarısı',
                        `${subCategoryTR(request.subCategory)} dalında 5 kez maçı son ${penaltyWindowHours} saat içinde iptal ettiniz. Bu durum profilinizde görünür ve güvenilirliğinizi olumsuz etkiler.`,
                        { subCategory: request.subCategory }
                    ).catch(() => {});
                }
            }
        }

        res.json({ cancelled: true, reopened: !isCreatorSide, penaltyApplied: withinPenaltyWindow, penaltyAmount: withinPenaltyWindow ? penaltyAmount : undefined });

        const senderName = request.sender?.username || 'Rakip';
        for (const uid of otherPlayerIds) {
            createNotification(uid, 'MATCH_CANCELLED',
                isCreatorSide ? '❌ Maç İptal Edildi' : '↩️ Maç Yeniden Açıldı',
                isCreatorSide
                    ? (withinPenaltyWindow
                        ? `${senderName} maçı son ${penaltyWindowHours} saat içinde iptal etti (ceza uygulandı).`
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
            where: { status: 'MATCHED', matchType: { not: 'PLAYER_WANTED' } },
            include: { sender: { select: SENDER_SELECT }, refereeUser: { select: SENDER_SELECT } },
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
                        `${subCategoryTR(m.subCategory)} esnek maçında 24 saat içinde tarih/saat/yer belirlenemediği için ilan otomatik silindi.`,
                        { subCategory: m.subCategory }
                    ).catch(() => {});
                }
            }
        }
        const schedExpiredIds = new Set(schedExpired.map(m => m.id));
        // Takım sporlarında (voleybol) kurucunun eklediği takım arkadaşları (senderTeam)
        // buraya hiç dahil edilmiyordu — kabul ettikleri bir maç kendi "Yaklaşan Maçlar"
        // listelerinde hiç görünmüyordu, dolayısıyla maçtan ayrılma/skor girme gibi hiçbir
        // aksiyonu da göremiyorlardı.
        const mine = all.filter(r => {
            if (schedExpiredIds.has(r.id)) return false;
            if (r.senderId === myId) return true;
            if ((Array.isArray(r.participants) ? r.participants : []).some(p => p?.id === myId)) return true;
            return (Array.isArray(r.senderTeam) ? r.senderTeam : []).some(p => p?.id === myId);
        });

        try {
            const allUserIds = [...new Set([
                ...mine.map(m => m.senderId),
                ...mine.flatMap(m => (Array.isArray(m.participants) ? m.participants : []).map(p => p.id)),
                ...mine.flatMap(m => (Array.isArray(m.senderTeam) ? m.senderTeam : []).map(p => p?.id)),
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
