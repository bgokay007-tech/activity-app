import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser, broadcast } from '../config/socket.js';
import { notifyCitySubscribers } from './cityAlert.controller.js';
import { notifyActivityAlertSubscribers } from './activityAlert.controller.js';
import { TENNIS_PADEL_SUBCATEGORIES, TENNIS_PADEL_DOMINANT_THRESHOLD, getTennisPadelEloDelta, getReassessmentFlags } from '../utils/tennisElo.js';
import { UTR_SUBCATEGORIES, applyUtrRatingForMatch, getDisplayRating, isDoublesFormat, buildPenaltyUpdate } from '../utils/utrRating.js';

// Tenis/padel artık burada değil — UTR-esinli ayrı sisteme geçti (bkz. utrRating.js). Bu sabit
// artık SADECE badminton/masa tenisi için eski sabit-tablo ELO'yu tetikler; voleybol rekabetçi
// maçları da (kullanıcı isteğiyle) aynı tabloyu kullanmaya devam ediyor.
const LEGACY_ELO_TABLE_SUBCATEGORIES = TENNIS_PADEL_SUBCATEGORIES.filter(s => !UTR_SUBCATEGORIES.includes(s));
const usesTennisEloTable = (subCategory) => LEGACY_ELO_TABLE_SUBCATEGORIES.includes(subCategory) || subCategory === 'volleyball';
import { PEER_REVIEW_SUBCATEGORIES } from '../utils/peerReview.js';
import { computeReservationStatus, overlaps, toMins, isPastDateTime, PRO_PACKAGES, refundGiftMinutes, assertNotVenuePolicyBlocked } from './venue.controller.js';
import { RATING_REQUIRED_SUBCATEGORIES } from '../config/assessments.js';
import { sanitizeExtraServices } from '../utils/extraServices.js';
import { subCategoryTR } from '../utils/subCategoryLabels.js';
import { removeSpectatorOnPromotion } from './spectator.controller.js';
import { turkeyDateTimeToUtc } from '../utils/tzTime.js';

// İlan açma/katılma öncesi ortak aktivite kontrolü: kullanıcı bu dalı "Aktivitelerim"e
// eklememişse veya gizlemişse (hidden=true, gizliyken hiçbir şey yapamaz) reddedilir.
// RATING_REQUIRED_SUBCATEGORIES'te ayrıca derece anketini (assessmentCompleted)
// tamamlamış olmalı — ekleme sırasında zorunlu olsa da eski kayıtlar için ikinci savunma hattı.
async function requireActiveInterest(userId, category, subCategory, matchType = null) {
    const interest = await prisma.userInterest.findUnique({
        where: { userId_category_subCategory: { userId, category, subCategory } },
    });
    if (!interest || interest.hidden) {
        const err = new Error('Bu dal için önce profilinden "Aktivitelerim"e eklemelisin.');
        err.status = 403; err.code = 'ACTIVITY_REQUIRED';
        throw err;
    }
    // Tenis/padel: tekli ve çiftler TAMAMEN AYRI anketler (bkz. assessments.js). matchType
    // biliniyorsa (ilan açma/katılma her zaman bilir) hangi anketin gerektiği doğrudan formata
    // göre belirlenir — "genel" bir kapıdan geçip yanlışlıkla varsayılan (tekli) ankete
    // yönlendirme riski olmasın diye bu kontrol genel kapıdan ÖNCE çalışır. Önceden hiç anketi
    // olmayan biri ÇİFTLER ilanına başvurunca (matchType='DOUBLE'), aşağıdaki genel kapı sadece
    // tekliye baktığı için yanlışlıkla tekli anketine yönlendiriliyordu (kullanıcı raporu).
    const isTennisOrPadel = subCategory === 'tennis' || subCategory === 'padel';
    if (isTennisOrPadel && RATING_REQUIRED_SUBCATEGORIES.has(subCategory) && matchType) {
        if (matchType === 'DOUBLE' && !interest.doublesAssessmentCompleted) {
            const err = new Error('Çiftler ilanı açabilmek/katılabilmek için önce çiftler derecelendirme anketini tamamlamalısın.');
            err.status = 403; err.code = 'DOUBLES_ASSESSMENT_REQUIRED';
            throw err;
        }
        if (matchType === 'SINGLE' && !interest.assessmentCompleted) {
            const err = new Error('Tekli ilanı açabilmek/katılabilmek için önce tekli derecelendirme anketini tamamlamalısın.');
            err.status = 403; err.code = 'SINGLES_ASSESSMENT_REQUIRED';
            throw err;
        }
        return interest;
    }
    // matchType bilinmiyorsa (ör. genel "bu dalı hiç kullanabilir miyim" kontrolü) — tenis/
    // padel'de İKİSİNDEN BİRİ (tekli VEYA çiftler) tamamlanmışsa genel kapı açılır, diğer
    // dallarda eskisi gibi sadece tekli (assessmentCompleted) yeterli.
    const generalAssessmentDone = isTennisOrPadel
        ? (interest.assessmentCompleted || interest.doublesAssessmentCompleted)
        : interest.assessmentCompleted;
    if (RATING_REQUIRED_SUBCATEGORIES.has(subCategory) && !generalAssessmentDone) {
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
    // Tenis/padel: UTR-esinli ayrı tekli/çiftler sistemi (bkz. utrRating.js) — bu iki dal için
    // aşağıdaki eski sabit-tablo ELO mantığı artık hiç çalışmıyor.
    if (UTR_SUBCATEGORIES.includes(request.subCategory)) {
        return applyUtrRatingForMatch(request, winnerUserId);
    }

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
            .filter(p => p?.id && p.id !== winnerUserId)
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
            if (request.subCategory === 'volleyball') {
                // Voleybol: tenisteki "set İÇİNDEKİ oyun sayısının %70'i + kaybeden hiç set
                // almamalı" mantığı burada anlamsız — kaybeden taraf zaten set(ler) almış
                // olabilir (ör. 4-1) ve yine de dominant sayılabilir. Kullanıcı örneği:
                // 3-0/4-1/5-0 dominant, 2-1/3-2 rekabetçi — yani belirleyici SET FARKI
                // (kazanan-kaybeden set sayısı), toplam sayı içindeki oyun oranı değil.
                let winnerSetsWon = 0, loserSetsWon = 0;
                for (const set of score.sets) {
                    const s = Number(set.sender) || 0;
                    const o = Number(set.opponent) || 0;
                    const wg = score.winner === 'sender' ? s : o;
                    const lg = score.winner === 'sender' ? o : s;
                    if (wg > lg) winnerSetsWon++;
                    else if (lg > wg) loserSetsWon++;
                }
                dominant = (winnerSetsWon - loserSetsWon) >= 2;
            } else {
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
        }

        const lowerRatedWon = avgWinnerRating < avgLoserRating;
        const { winnerGain, loserLoss } = getTennisPadelEloDelta(ratingDiff, dominant, lowerRatedWon);
        const transferWin  = parseFloat((winnerGain * 20).toFixed(3));
        const transferLose = parseFloat((loserLoss * 20).toFixed(3));

        // Anket doğruluğu kontrolü: anketten sonraki ilk 3 maçında kendinden ≥1.0 puan
        // yüksek bir rakibe karşı kazanan oyuncu varsa, bu maç ELO'ya sayılmaz — rakip
        // puan kaybetmez, kazanan da puan kazanmaz; kazanan derecelendirme anketine
        // tekrar yönlendirilir.
        const reassessFlags = getReassessmentFlags(winnerInterests, loserInterests, avgWinnerRating, avgLoserRating, request.subCategory);
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
            // Kullanıcı isteği: bildirime dokununca hangi anketin (tekli/çiftler) yeniden
            // doldurulması gerektiği bu maçın matchType'ından belli — mobil tarafta doğrudan
            // o ankete yönlendirebilmek için ratingType bildirim verisine ekleniyor.
            const ratingType = request.matchType === 'DOUBLE' ? 'doubles' : 'singles';
            for (const flag of reassessFlags) {
                createNotification(
                    flag.userId, 'ASSESSMENT_RECHECK',
                    '📋 Derecelendirme Anketini Tekrar Doldurun',
                    `${subCategoryTR(request.subCategory)} dalında anketten sonraki ilk maçlarınızda dereceniz beklenenden farklı çıktı. Daha doğru bir eşleşme için lütfen derecelendirme anketini tekrar doldurun.`,
                    { category: request.category, subCategory: request.subCategory, ratingType }
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

// Tenis/padel'de tek bir düz skillRating yetmez — tekli/çiftli AYRI puanlar (bkz. utrRating.js).
// İlan kartı/detayı/kadrosunda bir oyuncunun puanı canlı UserInterest sorgusuyla "zenginleştirilirken"
// (aşağıdaki teamInterests/withTeamRating desenleri) bu fonksiyon kullanılır — o ilanın FORMATINA
// (tekli/çiftli) göre doğru puanı döner. Diğer dallarda (badminton/masa tenisi/voleybol/vb.)
// davranış değişmez, düz skillRating aynen döner.
const TEAM_RATING_SUBCATEGORIES = UTR_SUBCATEGORIES;
function teamDisplayRating(interestRow, subCategory, isDoubles) {
    if (!interestRow) return null;
    if (!TEAM_RATING_SUBCATEGORIES.includes(subCategory)) return interestRow.skillRating ?? null;
    return getDisplayRating(interestRow, subCategory, isDoubles);
}

// getRivalById'deki AYNI zenginleştirme (bkz. oradaki yorum) — respondToJoin gibi doğrudan
// res.json + socket broadcast ile dönen uç noktalarda da kullanılıyor. Kullanıcı raporu: bir
// davet/katılım isteği kabul edilince (ör. demo oyuncu kabulü) hem yeni katılımcının ELO'su
// hem de kurucunun (sender) rozeti anlık olarak kayboluyordu — respondToJoin'in kendi
// prisma.activityRequest.update sonucu HAM senderTeam/participants/sender.interests
// döndürüyordu (joinerData zaten hiç skillRating taşımıyor, SENDER_SELECT de interests
// seçmiyor), bu ham veri hem doğrudan cevapta hem de broadcast('rivalUpdate', ...) ile TÜM
// görüntüleyenlere gidiyordu. Bu fonksiyon o veriyi göndermeden hemen önce zenginleştirir.
async function enrichRivalWithRatings(rival) {
    if (!rival) return rival;
    const teamUserIds = [...new Set([
        rival.senderId,
        ...(Array.isArray(rival.senderTeam) ? rival.senderTeam : []).filter(p => p?.id).map(p => p.id),
        ...(Array.isArray(rival.participants) ? rival.participants : []).filter(p => p?.id).map(p => p.id),
        ...(Array.isArray(rival.substitutePlayers) ? rival.substitutePlayers : []).filter(p => p?.id).map(p => p.id),
        ...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []).filter(p => p?.id).map(p => p.id),
    ])];
    const teamInterests = teamUserIds.length > 0
        ? await prisma.userInterest.findMany({
            where: { userId: { in: teamUserIds }, subCategory: rival.subCategory },
            select: {
                userId: true, alias: true, level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true,
                singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true,
            },
        })
        : [];
    const rivalIsDoubles = isDoublesFormat(rival);
    const withTeamRating = (arr) => (Array.isArray(arr) ? arr : []).map(p => p?.id
        ? { ...p, skillRating: teamDisplayRating(teamInterests.find(i => i.userId === p.id), rival.subCategory, rivalIsDoubles) }
        : p);
    const senderInterestRaw = teamInterests.find(i => i.userId === rival.senderId);
    const senderInterest = senderInterestRaw
        ? { ...senderInterestRaw, skillRating: teamDisplayRating(senderInterestRaw, rival.subCategory, rivalIsDoubles) }
        : null;
    return {
        ...rival,
        sender: rival.sender ? { ...rival.sender, interests: senderInterest ? [senderInterest] : [] } : rival.sender,
        senderTeam: withTeamRating(rival.senderTeam),
        participants: withTeamRating(rival.participants),
        substitutePlayers: withTeamRating(rival.substitutePlayers),
        unassignedPlayers: withTeamRating(rival.unassignedPlayers),
    };
}

// unassignedPlayers Json snapshot'ında bazı eski kayıtlarda gender hiç yazılmamıştı (respondToJoin/
// confirmLateJoin'deki joinerEntry gender taşımıyordu) — DOUBLE'da cinsiyet kısıtlı slotlara
// "Takımlara Ata" seçeneği bu yüzden hiç çıkmıyordu (mobil taraf genderFitsSlot(undefined, 'FEMALE')
// hep false dönüyordu). Yazma tarafı düzeltildi ama zaten var olan bozuk kayıtları okurken canlı
// DB'den tamamlıyoruz — var olan (doğru) bir gender asla ezilmez.
async function fillMissingUnassignedGenders(unassignedArrays) {
    const missingIds = [...new Set(unassignedArrays.flatMap(arr => (Array.isArray(arr) ? arr : []).filter(p => p?.id && !p.gender).map(p => p.id)))];
    if (missingIds.length === 0) return {};
    const rows = await prisma.user.findMany({ where: { id: { in: missingIds } }, select: { id: true, gender: true } });
    return Object.fromEntries(rows.map(u => [u.id, u.gender]));
}

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

// Bir davet kabul edilip maç/kadro dolunca, henüz yanıt vermemiş DİĞER davetlilere (aynı
// ilana ait, ilan sahibinin gönderdiği, hâlâ PENDING olan başka davetler) haber verilir —
// eskiden bu kişiler kabul/red butonuna dokunana kadar hiçbir şey öğrenmiyordu, dokununca da
// "zaten dolu" gibi geç kalmış bir hatayla karşılaşıyordu (kullanıcı raporu). Tenis/padel/
// voleybol farketmeksizin, PENDING davet kaydı olan her yerde (partner/rakip1/rakip2/pool/
// takım daveti) aynı şekilde çalışır — matchType'a özel bir dal gerekmiyor.
async function notifyOtherPendingOwnerInvitesOfFull(rivalId, category, subCategory, excludeUserIds = [], matchType = null) {
    try {
        const pending = await prisma.rivalJoinRequest.findMany({
            where: { rivalId, initiatedBy: 'OWNER', status: 'PENDING', userId: { notIn: excludeUserIds } },
            select: { id: true, userId: true },
        });
        if (pending.length === 0) return;
        const uniqueUserIds = [...new Set(pending.map(p => p.userId))];
        // Kullanıcı isteği (tenis/padel): DOUBLE/SINGLE'da davet artık REDDEDİLMİYOR, PENDING
        // kalıyor — "onay veresiye kadar kadro dolmuştur, onaylarsanız yedek sayılacaksınız"
        // bildirimi gider. Kabul ederlerse respondToJoin'deki roster-dolu kontrolü onları
        // placeInDoubleWaitlistOrReject ile waitlistPlayers'a düşürür (bkz. o fonksiyon).
        // Voleybol/airsoft (kendi substituteCount/substitutePlayers sistemi var) davranışı
        // AYNEN korunur — burada dokunulmuyor.
        if (matchType === 'DOUBLE' || matchType === 'SINGLE') {
            for (const uid of uniqueUserIds) {
                createNotification(
                    uid,
                    'MATCH_ROSTER_FULL_WAITLISTED',
                    '🪑 Kadro Doldu — Onaylarsanız Yedek Olursunuz',
                    `Davet edildiğiniz ${subCategoryTR(subCategory)} maçının kadrosu, siz daveti yanıtlamadan önce doldu. Yine de onaylarsanız yedek istek olarak kabul edilmiş sayılırsınız — kadrodan biri çıkarsa doğrudan asıl kadroya geçersiniz ve bildirim alırsınız. İstemiyorsanız daveti reddedebilirsiniz.`,
                    { rivalId, category, subCategory }
                ).catch(() => {});
            }
            return;
        }
        await prisma.rivalJoinRequest.updateMany({ where: { id: { in: pending.map(p => p.id) } }, data: { status: 'REJECTED' } });
        for (const uid of uniqueUserIds) {
            emitToUser(uid, 'joinRejected', { rivalId });
            createNotification(
                uid,
                'MATCH_INVITE_EXPIRED',
                '😕 Kadro Dolmuş',
                `Davet edildiğiniz ${subCategoryTR(subCategory)} maçının kadrosu, siz daveti yanıtlamadan önce doldu.`,
                { rivalId, category, subCategory }
            ).catch(() => {});
            emitToUser(uid, 'notification', {});
        }
    } catch { /* bildirim gönderimi kabul işlemini engellemesin */ }
}

// Kullanıcı raporu (tenis): kadro başka biriyle dolunca, o sırada hâlâ PENDING olan diğer
// (JOINER-initiated, yani kullanıcının kendi gönderdiği) başvurular sessizce ortada kalıyordu
// — sahibi bunlardan birini "kabul" etmeye çalışınca kafa karıştıran bir hatayla
// karşılaşıyordu (bkz. respondToJoin'deki "Kadro dolu" kontrolü), ama başvuran kişinin
// kendisi hiçbir şey öğrenmiyordu. Bu istekler REDDEDİLMİYOR (yukarıdaki owner-daveti
// fonksiyonundan farklı olarak) — kullanıcı isteği: kadroda eksik olma ihtimaline karşı
// bu kişiler bir tür "yedek listesi" olarak kalmaya devam etsin, sadece bilgilendirilip
// isterlerse kendileri geri çeksin.
async function notifyOtherPendingJoinersOfFull(rivalId, category, subCategory, excludeUserIds = []) {
    try {
        const pending = await prisma.rivalJoinRequest.findMany({
            where: { rivalId, initiatedBy: 'JOINER', status: 'PENDING', userId: { notIn: excludeUserIds } },
            select: { userId: true },
        });
        const uniqueUserIds = [...new Set(pending.map(p => p.userId))];
        for (const uid of uniqueUserIds) {
            createNotification(
                uid,
                'MATCH_ROSTER_FULL_WAITLISTED',
                '🪑 Kadro Tamamlandı — Yedek Listesindesiniz',
                `Başvurduğunuz ${subCategoryTR(subCategory)} maçının kadrosu tamamlandı. Siz hâlâ yedek listesindesiniz — kadroda eksik olması durumunda dahil edilebilirsiniz. İstemiyorsanız başvurunuzu geri çekebilirsiniz.`,
                { rivalId, category, subCategory }
            ).catch(() => {});
        }
    } catch { /* bildirim gönderimi kabul işlemini engellemesin */ }
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
    const manualOppNames = overrides.oppTeamManualNames ?? (Array.isArray(request.oppTeamManualNames) ? request.oppTeamManualNames : []);
    return 1 // kurucu (sender)
        + senderTeamArr.filter(hasSlot).length
        + participantsArr.filter(hasSlot).length
        + unassignedArr.filter(hasSlot).length
        + manualOppNames.length;
}

// Kadro kartında (Kurucu/Rakip Takım) bir oyuncu HANGİ sıradaki forma yazıldıysa/davet
// edildiyse, kabul edilince (ya da manuel eklenince) dizinin SONUNA değil TAM O index'e
// yerleşsin diye — kullanıcı isteği: "hangi forma yazıldıysa orada kalsın". index boşsa
// (null/undefined) eskisi gibi dizinin sonuna eklenir. Aradaki boşluklar null ile doldurulur.
function setAtSlot(arr, index, value) {
    const next = [...arr];
    const idx = Number.isInteger(index) ? index : next.length;
    while (next.length <= idx) next.push(null);
    next[idx] = value;
    return next;
}

// Kurucu Takım (side 'my') tarafında kadro kartındaki slot index'i HER ZAMAN kurucunun
// kendisini de sayar (0 = kurucu, 1 = senderTeam[0], 2 = senderTeam[1]...) — frontend'de
// hem TeamColBack hem TeamAssignCard bu şekilde numaralandırıyor (bkz. peoplePositional =
// [sender, ...senderTeam]). Ama senderTeam DİZİSİ kurucuyu içermiyor, bu yüzden ona
// setAtSlot ile yazarken index'in 1 eksiği kullanılmalı — bu düzeltme olmadan "2. forma"
// (index 1) davet edilen biri senderTeam[1]'e (yani görsel 3. slota) yerleşiyordu.
function setAtFounderSlot(senderTeamArr, peoplePositionalIndex, value) {
    const idx = Number.isInteger(peoplePositionalIndex) ? peoplePositionalIndex - 1 : null;
    return setAtSlot(senderTeamArr, idx, value);
}

// İlan oluştururken kurucu/rakip/yedek/atanmamış için girilen manuel (uygulamayı kullanmayan)
// isimler eskiden düz metin diziydi (cinsiyetsiz) — artık {name, gender} nesnesi de kabul
// ediliyor (Antrenman modunda manuel oyuncu eklerken cinsiyet seçimi zorunlu, bkz. mobil
// TeamSlotRow) ki cinsiyet dağılımı kotası (requiredMaleCount) manuel oyuncuları da görebilsin.
// Düz string gelirse gender null kalır (eski istemci ya da bilinmeyen cinsiyet).
function normalizeManualNames(arr) {
    if (!Array.isArray(arr)) return [];
    return arr
        .map(n => (typeof n === 'string' ? { name: n, gender: null } : (n && typeof n === 'object' ? { name: n.name, gender: n.gender } : null)))
        .filter(n => n && typeof n.name === 'string' && n.name.trim())
        .map(n => ({ name: n.name.trim().slice(0, 40), gender: ['MALE', 'FEMALE'].includes(n.gender) ? n.gender : null }));
}

// Voleybol/airsoft (teamSize>1) bireysel kabul: ilanda Cinsiyet Dağılımı kısıtlaması varsa,
// kabul edilecek oyuncunun cinsiyeti o kotayı doldurmuşsa/imkansız kılıyorsa reddedilir —
// önceden bu hiç kontrol edilmiyordu, ör. 6 kadın hedefiyle açılan bir ilana 8-9 kadın kabul
// edilebiliyordu. İki mod var (bkz. GenderCountModal): 'EXACT' — havuzun TAMAMININ dağılımı
// (requiredMaleCount, eski davranış — genderCountMode null olan eski ilanlarda da requiredMaleCount
// doluysa geriye dönük EXACT sayılır). 'MIN' — sadece minGenderReq cinsiyetinden en az
// minGenderCount kişi gerekir, geri kalan slotlar serbest (kullanıcı isteği: "2 kesin kız
// lazım, kalan 10 kişi fark etmez") — roster dolarken minimum hâlâ karşılanabilir mi diye
// "kalan slotlar yeter mi" mantığıyla kontrol edilir. Mevcut kadronun cinsiyetleri
// (participants/senderTeam/unassignedPlayers'a accept akışıyla eklenen kayıtlarda gender
// saklanmıyor) User tablosundan taze çekilir.
async function checkGenderCountQuota(rival, newJoinerGender) {
    if (!['volleyball', 'airsoft'].includes(rival.subCategory)) return null;
    if ((rival.teamSize || 1) <= 1) return null;
    const isExactMode = rival.requiredMaleCount != null && (rival.genderCountMode == null || rival.genderCountMode === 'EXACT');
    // KULLANICI RAPORU / KRİTİK HATA: 'MIN_PER_TEAM' (her takımda AYRI AYRI en az N kişi,
    // bkz. perTeamGenderFeasible) burada hiç tanınmıyordu — isMinMode sadece 'MIN' kontrol
    // ediyordu, bu yüzden havuza (unassignedPlayers) kabul anında HİÇBİR kısıtlama
    // uygulanmıyordu. perTeamGenderFeasible kısıtlaması ancak oyuncu GERÇEKTEN bir tarafa
    // atanırken devreye giriyor — sonuç: "en az 2 kadın (her takımda)" ayarlı bir ilanda 12
    // erkek arka arkaya havuza kabul edilebiliyordu, kota imkansız hale gelene kadar hiçbir
    // uyarı çıkmıyordu. Artık MIN_PER_TEAM de burada tanınıyor; havuz-geneli asgari toplam
    // gereksinim minGenderCount×2 (her taraf için ayrı ayrı minGenderCount).
    const isMinMode = ['MIN', 'MIN_PER_TEAM'].includes(rival.genderCountMode) && rival.minGenderCount != null && ['MALE', 'FEMALE'].includes(rival.minGenderReq);
    if (!isExactMode && !isMinMode) return null;
    if (newJoinerGender === 'OTHER') return null; // mevcut tek-slot cinsiyet kontrolleriyle aynı: OTHER kotaya dahil değil
    if (!newJoinerGender) {
        return 'Bu ilanda cinsiyet dağılımı kısıtlaması var, profilinde cinsiyet bilgisi girilmemiş oyuncular kabul edilemiyor.';
    }

    const totalSlots = 2 * rival.teamSize;
    const rosterArrays = [
        ...(Array.isArray(rival.senderTeam) ? rival.senderTeam : []),
        ...(Array.isArray(rival.participants) ? rival.participants : []),
        ...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []),
    ];
    const existingIds = [rival.senderId, ...rosterArrays.map(p => p?.id).filter(Boolean)];
    const existingUsers = await prisma.user.findMany({ where: { id: { in: existingIds } }, select: { gender: true } });
    // Uygulamayı kullanmayan (manuel) oyuncuların cinsiyeti eklenirken doğrudan
    // {manualName, gender} olarak kaydediliyor (bkz. addManualTeamPlayer/createRivalRequest)
    // — User tablosunda karşılığı olmadığı için gerçek kullanıcı sayımından ayrı toplanır,
    // yoksa manuel eklenen oyuncular kotaya hiç dahil olmuyordu (tutarsızlık).
    const manualMaleCount = rosterArrays.filter(p => p?.manualName && p.gender === 'MALE').length;
    const manualFemaleCount = rosterArrays.filter(p => p?.manualName && p.gender === 'FEMALE').length;
    const maleCount = existingUsers.filter(u => u.gender === 'MALE').length + manualMaleCount;
    const femaleCount = existingUsers.filter(u => u.gender === 'FEMALE').length + manualFemaleCount;

    if (isExactMode) {
        const femaleQuota = totalSlots - rival.requiredMaleCount;
        if (newJoinerGender === 'MALE' && maleCount >= rival.requiredMaleCount) {
            return `Bu ilanda erkek kontenjanı (${rival.requiredMaleCount}) zaten doldu — kabul etmeden önce ayarlardan cinsiyet dağılımını artırman gerekiyor.`;
        }
        if (newJoinerGender === 'FEMALE' && femaleCount >= femaleQuota) {
            return `Bu ilanda kadın kontenjanı (${femaleQuota}) zaten doldu — kabul etmeden önce ayarlardan cinsiyet dağılımını artırman gerekiyor.`;
        }
        return null;
    }

    // MIN modu: yeni oyuncu eklendikten sonra bile, roster tamamen dolana kadar minimum
    // HÂLÂ karşılanabilir mi diye bakılır — aksi halde ör. "en az 2 kadın" hedefi, önce
    // 11 erkek kabul edilip son 1 slota sıkışarak imkansız hale gelebilirdi.
    const hasSlot = (p) => p && (p.id || p.manualName);
    const currentTotalFilled = 1 + rosterArrays.filter(hasSlot).length; // +1 kurucu
    const currentMinGenderCount = rival.minGenderReq === 'MALE' ? maleCount : femaleCount;
    const newTotalFilled = currentTotalFilled + 1;
    const newMinGenderCount = currentMinGenderCount + (newJoinerGender === rival.minGenderReq ? 1 : 0);
    const remainingAfter = totalSlots - newTotalFilled;
    // MIN_PER_TEAM'de her taraf AYRI AYRI minGenderCount istiyor — havuz henüz taraflara
    // bölünmediği için, kabul aşamasında imkansızlığı yakalayabilmek adına toplamda en az
    // 2×minGenderCount (bkz. üstteki yorum) gerektiği varsayılır.
    const effectiveMinGenderCount = rival.genderCountMode === 'MIN_PER_TEAM' ? rival.minGenderCount * 2 : rival.minGenderCount;
    const neededMore = Math.max(0, effectiveMinGenderCount - newMinGenderCount);
    if (neededMore > remainingAfter) {
        const label = rival.minGenderReq === 'MALE' ? 'erkek' : 'kadın';
        const scopeLabel = rival.genderCountMode === 'MIN_PER_TEAM' ? ' (her takımda)' : '';
        return `Bu ilanda en az ${rival.minGenderCount} ${label}${scopeLabel} olması gerekiyor — bu oyuncuyu kabul etmek bu minimumu imkansız hale getiriyor. Kabul etmeden önce ayarlardan cinsiyet dağılımını düzenlemen gerekiyor.`;
    }
    return null;
}

// Voleybol "Rakip Aranıyor" (matchType PLAYER_WANTED, teamSize>1): başvuran kendi tam
// takımını tek seferde gönderiyor (bkz. mobil TeamJoinRequestModal). checkGenderCountQuota
// tek kişilik kontrol yapıyor — burada aynı fonksiyon değiştirilmeden, her yeni üye sırayla
// eklenmiş gibi simüle edilerek çağrılıyor (mantık tekrarlanmadan aynı kota kuralı uygulanır).
async function checkTeamGenderQuota(rival, mainMembers) {
    let simulated = rival;
    for (const m of mainMembers) {
        const gender = m.gender || null;
        const err = await checkGenderCountQuota(simulated, gender);
        if (err) return err;
        const entry = m.id ? { id: m.id, gender } : { manualName: m.manualName, gender };
        simulated = { ...simulated, participants: [...(Array.isArray(simulated.participants) ? simulated.participants : []), entry] };
    }
    return null;
}

// Takım başına minimum (MIN_PER_TEAM): checkGenderCountQuota'nın pool-wide kontrolünün aksine,
// SADECE tek bir tarafın (side: 'my'=Kurucu, 'opp'=Rakip) NİHAİ (bu işlemden SONRAKİ) kadrosuyla
// minimum hâlâ karşılanabilir mi diye bakar — kadro kartındaki taraf ATAMA/DEĞİŞTİRME anında
// (assignPlayerToSide, swapTeamPlayers, addManualTeamPlayer, doğrudan-slot davet kabulü) çağrılır.
// Voleybol/airsoft'ta bireysel kabul HER ZAMAN önce atanmamış havuzuna girip (bkz.
// checkGenderCountQuota'nın çağrıldığı yer) hangi tarafa gideceği SONRADAN seçildiği için,
// "takım başına" kısıtlaması accept anında değil burada, gerçek taraf ataması anında uygulanır.
// sideArrFinal: bu işlemden SONRA o tarafta olacak TÜM oyuncular (yeni/taşınan dahil).
async function perTeamGenderFeasible(rival, side, sideArrFinal) {
    if (rival.genderCountMode !== 'MIN_PER_TEAM') return null;
    if (!['volleyball', 'airsoft'].includes(rival.subCategory) || (rival.teamSize || 1) <= 1) return null;
    if (!rival.minGenderCount || !['MALE', 'FEMALE'].includes(rival.minGenderReq)) return null;
    if (side !== 'my' && side !== 'opp') return null; // atanmamışa dönüş/null taraf kontrol dışı

    const teamSizeN = rival.teamSize || 1;
    const hasSlot = (p) => p && (p.id || p.manualName);
    const filled = sideArrFinal.filter(hasSlot);
    if (filled.some(p => !p.gender || p.gender === 'OTHER')) {
        return 'Bu ilanda takım başına cinsiyet minimumu var, cinsiyet bilgisi girilmemiş oyuncular bir tarafa atanamıyor.';
    }
    let genderCount = filled.filter(p => p.gender === rival.minGenderReq).length;
    let filledCount = filled.length;
    if (side === 'my') {
        // Kurucu senderTeam dizisinin İÇİNDE değil, ayrı sabit bir slot — kendi cinsiyeti de sayılmalı.
        filledCount += 1;
        const founder = await prisma.user.findUnique({ where: { id: rival.senderId }, select: { gender: true } });
        if (founder?.gender === rival.minGenderReq) genderCount += 1;
    }
    const emptySlots = teamSizeN - filledCount;
    const neededMore = Math.max(0, rival.minGenderCount - genderCount);
    if (neededMore > emptySlots) {
        const label = rival.minGenderReq === 'MALE' ? 'erkek' : 'kadın';
        const sideLabel = side === 'my' ? (rival.founderTeamName || 'Kurucu Takım') : (rival.opponentTeamName || 'Rakip Takım');
        return `${sideLabel}'da en az ${rival.minGenderCount} ${label} olması gerekiyor — bu işlem bu minimumu imkansız hale getiriyor.`;
    }
    return null;
}

// Kullanıcı raporu: "her takıma minimum 1 kadın" ayarı varken, atanmamış havuzundaki İKİ
// kadın da AYNI tarafa atanabiliyordu — perTeamGenderFeasible SADECE atamanın yapıldığı
// tarafın kendi kapasitesine bakıyor (o taraf zaten 1 kadınla kendi minimumunu karşılıyor,
// geçiyor), KARŞI tarafın artık havuzda hiç kadın kalmadığı için minimumunu asla
// karşılayamayacağını hiç kontrol etmiyordu. Bu, atama SONRASI iki tarafın toplam eksiğini
// (neededMy+neededOpp), havuzda kalan gerçekten uygun (cinsiyeti eşleşen) kişi sayısıyla
// karşılaştırır — DOUBLE'daki canAssignAll/placeableUnassigned düzeltmesiyle aynı mantık.
async function poolWideGenderFeasible(rival, nextSenderTeam, nextParticipants, nextUnassigned) {
    if (rival.genderCountMode !== 'MIN_PER_TEAM') return null;
    if (!['volleyball', 'airsoft'].includes(rival.subCategory) || (rival.teamSize || 1) <= 1) return null;
    if (!rival.minGenderCount || !['MALE', 'FEMALE'].includes(rival.minGenderReq)) return null;

    const hasSlot = (p) => p && (p.id || p.manualName);
    const myFilled = nextSenderTeam.filter(hasSlot);
    const oppFilled = nextParticipants.filter(hasSlot);
    let myGenderCount = myFilled.filter(p => p.gender === rival.minGenderReq).length;
    const oppGenderCount = oppFilled.filter(p => p.gender === rival.minGenderReq).length;
    const founder = await prisma.user.findUnique({ where: { id: rival.senderId }, select: { gender: true } });
    if (founder?.gender === rival.minGenderReq) myGenderCount += 1;

    const neededMy = Math.max(0, rival.minGenderCount - myGenderCount);
    const neededOpp = Math.max(0, rival.minGenderCount - oppGenderCount);
    if (neededMy + neededOpp === 0) return null;

    const availableInPool = nextUnassigned.filter(p => hasSlot(p) && p.gender === rival.minGenderReq).length;
    // Kullanıcı raporu: kadro henüz DOLMAMIŞKEN (ör. 10/12) bu kontrol sadece o an havuzda
    // bekleyen atanmamış kişilere bakıp "imkansız" diyordu — hâlbuki kadroda hâlâ boş
    // kontenjan (ve/veya bekleyen katılım istekleri) varsa, ileride o boşluklara doğru
    // cinsiyette biri katılabilir; henüz gerçekleşmemiş bir ihtimali "imkansız" diye
    // engellemek mantıksız (bkz. "katılan oyuncular fullenmeden de şartlar sağlandığı
    // sürece takımları oluşturabilir"). Bu yüzden hâlâ boş genel kontenjan (openSlots) da
    // ihtiyacı karşılayabilecek bir kaynak olarak sayılır — gerçekten imkansız olması için
    // kadronun tamamen dolmuş olması VE havuzda/boş kontenjanda yeterli kişi kalmamış olması
    // gerekir.
    const filledSoFar = teamFilledCount(rival, { senderTeam: nextSenderTeam, participants: nextParticipants, unassignedPlayers: nextUnassigned });
    const openSlots = Math.max(0, totalPlayerCount(rival) - filledSoFar);
    if (neededMy + neededOpp > availableInPool + openSlots) {
        const label = rival.minGenderReq === 'MALE' ? 'erkek' : 'kadın';
        return `Havuzda yeterli ${label} kalmadı — hem ${rival.founderTeamName || 'Kurucu Takım'} hem ${rival.opponentTeamName || 'Rakip Takım'}'da en az ${rival.minGenderCount} ${label} olması artık imkansız hale geliyor.`;
    }
    return null;
}

// updateRivalRequest'te cinsiyet dağılımı ayarları değiştiğinde (ör. "takım başına en az 2
// kadın" → "1 kadın") kullanılır — kullanıcı raporu: ayar SIKILAŞTIRILMASA (aksine
// GEVŞETİLSE) bile mevcut kabul edilmiş TÜM oyuncular gereksiz yere "son onay bekliyor"
// durumuna çekiliyordu. Artık düzenleme öncesi, YENİ ayarlarla mevcut kadronun (kabul
// edilmiş + atanmamış havuzdaki) hâlâ mümkün/uyumlu olup olmadığı kontrol edilir; sadece
// gerçekten imkansız hale geliyorsa (ör. minimum artırıldı ve kadroda yeterli sayı yok)
// düzenleme bir uyarı mesajıyla reddedilir — ilan sahibi önce uymayan oyuncuları kadrodan
// çıkarmalı, sistem kimseyi otomatik olarak isteklere geri almaz.
async function rosterMeetsGenderQuota(rival, genderCountMode, requiredMaleCount, minGenderReq, minGenderCount) {
    if (!['volleyball', 'airsoft'].includes(rival.subCategory)) return null;
    if ((rival.teamSize || 1) <= 1) return null;

    // MIN_PER_TEAM: senderTeam/participants zaten tarafa göre ayrılmış durumda — accept
    // anındaki (havuz henüz bölünmemişken kullanılan) ×2 yaklaşıklığı yerine, her tarafın
    // GERÇEK kadrosuyla perTeamGenderFeasible'ın kendisi kullanılır, daha doğru sonuç verir.
    if (genderCountMode === 'MIN_PER_TEAM') {
        if (minGenderCount == null || !['MALE', 'FEMALE'].includes(minGenderReq)) return null;
        const proposedRival = { ...rival, genderCountMode, minGenderReq, minGenderCount };
        const myErr = await perTeamGenderFeasible(proposedRival, 'my', Array.isArray(rival.senderTeam) ? rival.senderTeam : []);
        if (myErr) return myErr;
        const oppErr = await perTeamGenderFeasible(proposedRival, 'opp', Array.isArray(rival.participants) ? rival.participants : []);
        if (oppErr) return oppErr;
        return null;
    }

    const isExactMode = genderCountMode == null ? requiredMaleCount != null : genderCountMode === 'EXACT';
    const isMinMode = genderCountMode === 'MIN' && minGenderCount != null && ['MALE', 'FEMALE'].includes(minGenderReq);
    if (!isExactMode && !isMinMode) return null;

    const totalSlots = 2 * rival.teamSize;
    const rosterArrays = [
        ...(Array.isArray(rival.senderTeam) ? rival.senderTeam : []),
        ...(Array.isArray(rival.participants) ? rival.participants : []),
        ...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []),
    ];
    const hasSlot = (p) => p && (p.id || p.manualName);
    const filledRoster = rosterArrays.filter(hasSlot);
    const existingIds = [rival.senderId, ...filledRoster.map(p => p?.id).filter(Boolean)];
    const existingUsers = await prisma.user.findMany({ where: { id: { in: existingIds } }, select: { id: true, gender: true } });
    const genderById = new Map(existingUsers.map(u => [u.id, u.gender]));
    const genderOf = (p) => p.id ? genderById.get(p.id) : p.gender;

    const founderGender = genderById.get(rival.senderId);
    const maleCount = (founderGender === 'MALE' ? 1 : 0) + filledRoster.filter(p => genderOf(p) === 'MALE').length;
    const femaleCount = (founderGender === 'FEMALE' ? 1 : 0) + filledRoster.filter(p => genderOf(p) === 'FEMALE').length;
    const totalFilled = 1 + filledRoster.length;
    const remaining = totalSlots - totalFilled;

    if (isExactMode) {
        if (requiredMaleCount == null) return null;
        const femaleQuota = totalSlots - requiredMaleCount;
        if (maleCount > requiredMaleCount) return `Bu değişiklikle erkek kontenjanı (${requiredMaleCount}) aşılıyor — kadronuzda şu anda ${maleCount} erkek var. Önce kadrodan/isteklerden yeterince erkek oyuncu çıkarmanız gerekiyor.`;
        if (femaleCount > femaleQuota) return `Bu değişiklikle kadın kontenjanı (${femaleQuota}) aşılıyor — kadronuzda şu anda ${femaleCount} kadın var. Önce kadrodan/isteklerden yeterince kadın oyuncu çıkarmanız gerekiyor.`;
        return null;
    }

    const currentMinGenderCount = minGenderReq === 'MALE' ? maleCount : femaleCount;
    const neededMore = Math.max(0, minGenderCount - currentMinGenderCount);
    if (neededMore > remaining) {
        const label = minGenderReq === 'MALE' ? 'erkek' : 'kadın';
        return `Bu değişiklikle en az ${minGenderCount} ${label} hedefi mevcut kadronuzla imkansız hale geliyor (şu anda ${currentMinGenderCount} ${label} var, ${remaining} boş kontenjan kaldı). Önce uymayan oyuncuları kadrodan/isteklerden çıkarmanız gerekiyor.`;
    }
    return null;
}

// Voleybol/airsoft bireysel kabul (isIndividualTeamJoin): ana kadroda (genel doluluk ya da
// cinsiyet kotası) yer kalmamışsa, doğrudan reddetmek yerine önce yedek kontenjanına bakılır —
// varsa oraya yerleştirilir, yoksa reddedilip "kadro dolmuştur" bildirimi gider. Kullanıcı
// isteği: "son onay bekleniyor" durumundaki birden fazla oyuncu sırayla onaylanırken (kim önce
// onaylarsa kazanır) dışarda kalanlar böylece kaybolmak yerine yedeğe düşsün, hiç yer yoksa da
// net bir "kadro dolmuş, teşekkürler" mesajıyla bilgilendirilsinler. requestId/res verilen
// çağıran fonksiyonun (respondToJoin/confirmLateJoin) isteğini burada TAMAMEN yanıtlar.
async function placeInSubstituteOrRejectFull(rival, joinReq, joinerEntry, requestId, res) {
    const subsArr = Array.isArray(rival.substitutePlayers) ? rival.substitutePlayers : [];
    const subsFilledCount = subsArr.filter(p => p?.id || p?.manualName).length;
    const hasSubRoom = subsFilledCount < (rival.substituteCount || 0);
    if (!hasSubRoom) {
        await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
        emitToUser(joinReq.userId, 'joinRejected', { rivalId: joinReq.rivalId });
        res.status(409).json({ message: 'Onayınızı beklerken kadro (yedekler dahil) tamamlandı.' });
        createNotification(
            joinReq.userId, 'RIVAL_JOIN_REQUEST', '😕 Kadro Dolmuş',
            `Onayınızı beklerken "${rival.sender?.username || 'ilan sahibi'}" bu maç için kadroyu (yedekler dahil) tamamladı. İlginiz için teşekkür ederiz.`,
            { rivalId: joinReq.rivalId, category: rival.category, subCategory: rival.subCategory }
        ).catch(() => {});
        return;
    }
    let updated = await prisma.activityRequest.update({
        where: { id: rival.id },
        data: { substitutePlayers: [...subsArr, joinerEntry] },
        include: {
            sender: { select: SENDER_SELECT },
            joinRequests: {
                where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }],
                include: { user: { select: { ...SENDER_SELECT, interests: { where: { category: rival.category, subCategory: rival.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } },
            },
        },
    });
    await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
    updated = await enrichRivalWithRatings(updated);
    broadcast('rivalUpdate', updated); // (kullanıcı isteği: davet/kabul güncellemesini sadece ilan sahibine değil, ilanı görüntüleyen herkese anında yansıt)
    emitToUser(joinReq.userId, 'joinAccepted', { rivalId: rival.id, matched: false, toSubstitute: true });
    res.json({ message: '🔄 Yedek kadroya alındınız.', request: updated, matched: false, toSubstitute: true });
    createNotification(
        joinReq.userId, 'MATCH_CONFIRMED', '🔄 Yedek Kadroya Alındınız',
        `"${rival.sender?.username || 'İlan sahibi'}" ana kadroyu tamamladı — bu maça yedek kadroda devam ediyorsunuz.`,
        { rivalId: rival.id, category: rival.category, subCategory: rival.subCategory }
    ).catch(() => {});
}

// DOUBLE (kurucu+3) / SINGLE (kurucu+1) kadrosu GERÇEKTEN (kurucu + senderTeam + participants +
// unassignedPlayers toplamı) dolu mu — bkz. placeInDoubleWaitlistOrReject'in ne zaman devreye
// gireceğini belirlemek için kullanılıyor. Named slotlardan biri (ör. Rakip 1) boş görünse bile
// toplam kişi sayısı zaten hedefe ulaşmışsa (unassignedPlayers havuzu doldurduysa) kadro dolu
// sayılır — aksi halde 5. bir kişi named slota "sığdırılabilir" gibi yanlış bir izlenim olurdu.
function isDoubleOrSingleRosterFull(rival) {
    if (rival.matchType !== 'DOUBLE' && rival.matchType !== 'SINGLE') return false;
    const countFilled = (arr) => (Array.isArray(arr) ? arr : []).filter(p => p && p.id).length;
    const total = 1 + countFilled(rival.senderTeam) + countFilled(rival.participants) + countFilled(rival.unassignedPlayers);
    return total >= (rival.matchType === 'DOUBLE' ? 4 : 2);
}

// Kullanıcı isteği (tenis/padel): davet gönderilen/başvuran biri onay vermeden ÖNCE kadro başka
// biriyle dolarsa, artık doğrudan reddedilmiyor — DOUBLE/SINGLE'ın kendi substituteCount'u
// olmadığı için (voleybolün aksine, bkz. placeInSubstituteOrRejectFull) kapasite sınırsız bir
// "yedek listesi"ne (waitlistPlayers) düşüyor. Kabul eden kişiye "onaylarsanız yedek olarak
// sayılırsınız, biri çıkarsa asıl kadroya geçersiniz" bildirimi gider; asıl terfi
// removeRivalParticipant'ta gerçekleşir.
async function placeInDoubleWaitlistOrReject(rival, joinReq, joinerEntry, requestId, res) {
    const waitlist = Array.isArray(rival.waitlistPlayers) ? rival.waitlistPlayers : [];
    let updated = await prisma.activityRequest.update({
        where: { id: rival.id },
        data: { waitlistPlayers: [...waitlist, joinerEntry] },
        include: {
            sender: { select: SENDER_SELECT },
            joinRequests: {
                where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }],
                include: { user: { select: { ...SENDER_SELECT, interests: { where: { category: rival.category, subCategory: rival.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } },
            },
        },
    });
    await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
    updated = await enrichRivalWithRatings(updated);
    broadcast('rivalUpdate', updated);
    emitToUser(joinReq.userId, 'joinAccepted', { rivalId: rival.id, matched: false, toSubstitute: true });
    res.json({ message: '🔄 Yedek listesine alındınız.', request: updated, matched: false, toSubstitute: true });
    createNotification(
        joinReq.userId, 'MATCH_CONFIRMED', '🔄 Yedek Listesine Alındınız',
        `"${rival.sender?.username || 'İlan sahibi'}" kadroyu tamamladı — onayınız yedek istek olarak kabul edildi. Kadrodan biri çıkarsa doğrudan asıl kadroya geçersiniz ve size bildirim gönderilir.`,
        { rivalId: rival.id, category: rival.category, subCategory: rival.subCategory }
    ).catch(() => {});
}

// joiningTeam (istemciden [{userId?, manualName?, gender?, isSubstitute?}]) sunucu tarafında
// doğrulanıp zenginleştirilir — istemcinin gönderdiği username/skillRating gibi bilgilere
// güvenilmez, DB'den taze çekilir (kayıtlı olmayan/manuel oyuncular hariç). Hata varsa
// { error } döner, yoksa { resolvedMembers } döner.
async function resolveAndValidateTeam(rival, joiningTeam, submitterId) {
    const realIdEntries = joiningTeam.filter(m => m?.userId).map(m => m.userId);
    const realIds = [...new Set(realIdEntries)];
    if (realIds.length !== realIdEntries.length) {
        return { error: 'Aynı oyuncu kadroda birden fazla kez var.' };
    }
    if (!realIds.includes(submitterId)) {
        return { error: 'Kendinizi kadroya eklemeniz gerekiyor.' };
    }
    const existingIds = new Set([
        rival.senderId,
        ...(Array.isArray(rival.senderTeam) ? rival.senderTeam : []).map(p => p?.id).filter(Boolean),
        ...(Array.isArray(rival.participants) ? rival.participants : []).map(p => p?.id).filter(Boolean),
        ...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []).map(p => p?.id).filter(Boolean),
    ]);
    for (const uid of realIds) {
        if (existingIds.has(uid)) return { error: 'Kadronuzdaki bir oyuncu zaten bu ilanda.' };
    }
    const [users, interests] = await Promise.all([
        prisma.user.findMany({ where: { id: { in: realIds } }, select: { id: true, username: true, fullName: true, avatar: true, gender: true } }),
        prisma.userInterest.findMany({ where: { userId: { in: realIds }, category: rival.category, subCategory: rival.subCategory } }),
    ]);
    if (users.length !== realIds.length) return { error: 'Kadrodaki bir oyuncu bulunamadı.' };
    const userMap = new Map(users.map(u => [u.id, u]));
    const teamIsDoubles = isDoublesFormat(rival);
    const ratingMap = new Map(interests.map(i => [i.userId, getDisplayRating(i, rival.subCategory, teamIsDoubles)]));

    const resolvedMembers = joiningTeam.map(m => {
        if (m?.userId) {
            const u = userMap.get(m.userId);
            return { id: u.id, username: u.username, fullName: u.fullName, avatar: u.avatar, gender: u.gender || null, skillRating: ratingMap.get(u.id) ?? null, isSubstitute: !!m.isSubstitute };
        }
        const manualName = (m?.manualName || '').trim();
        return manualName ? { manualName, gender: m?.gender || null, skillRating: null, isSubstitute: !!m.isSubstitute } : null;
    }).filter(Boolean);
    if (resolvedMembers.length !== joiningTeam.length) return { error: 'Geçersiz kadro girdisi.' };

    // Derece kısıtlaması — solo başvurudaki mantığın aynısı (sendJoinRequest'in başındaki
    // effMinRating/effMaxRating hesabı), her bilinen puanlı ana kadro üyesi için tekrarlanır.
    for (const m of resolvedMembers.filter(mm => !mm.isSubstitute && mm.skillRating != null)) {
        let effMin = rival.minRating, effMax = rival.maxRating;
        if (rival.ratingGenderSplit) {
            if (m.gender === 'MALE') { effMin = rival.minRatingMale; effMax = rival.maxRatingMale; }
            else if (m.gender === 'FEMALE') { effMin = rival.minRatingFemale; effMax = rival.maxRatingFemale; }
            else { effMin = null; effMax = null; }
        }
        const label = m.username || m.fullName || m.manualName || 'Oyuncu';
        if (effMin != null && m.skillRating < effMin) return { error: `${label} bu ilan için gereken en az ${effMin}★ puanına sahip değil.` };
        if (effMax != null && m.skillRating > effMax) return { error: `${label} bu ilanın en fazla ${effMax}★ puan sınırını aşıyor.` };
    }

    const genderErr = await checkTeamGenderQuota(rival, resolvedMembers.filter(m => !m.isSubstitute));
    if (genderErr) return { error: genderErr };

    return { resolvedMembers };
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

    // Bireysel kabul: hangi boş adlandırılmış slota (Takım Arkadaşı/Rakip1/Rakip2) uyduğu
    // sadece DOĞRULANIR — hangisine gideceği burada otomatik seçilmez (kullanıcı isteği:
    // "arka yüz takım kısmına atanmamış liste olarak belirtilecek, takım formlarına ordan
    // atacak ilan sahibi"). Kabul edilen oyuncu "atanmamış" havuzuna düşer; ÖN YÜZDE bu kişi
    // yine sıradaki "Katılımcı N" olarak görünür (bkz. mobil, unassignedPlayers ön yüzde
    // sıradan bir katılımcı gibi render ediliyor), sadece ARKA yüzdeki takım kartında hangi
    // spesifik role (partner/rakip1/rakip2) gideceği ilan sahibi tarafından seçilir
    // (assignDoubleSlot). Kullanıcı DOĞRUDAN belirli bir slota da başvurabilir (requestedSlot,
    // STRICT modda her zaman, FLEXIBLE'da isteğe bağlı) — o durumda kabul edilince doğrudan o
    // slota yerleşir, atanmamışa hiç düşmez.
    const gUser = await prisma.user.findUnique({ where: { id: joinReq.userId }, select: { gender: true } });
    const pg = gUser?.gender;
    // Cinsiyeti belirtilmemiş kullanıcı MIX olmayan (cinsiyete özel) slotlara uymaz —
    // sadece MIX slotlar veya kendi cinsiyetiyle eşleşen slotlar için uygun sayılır.
    // İkinci parametre verilmezse (mevcut çağrılar) varsayılan olarak bu başvurunun kendi
    // cinsiyetine (pg) bakar — aşağıdaki havuz uygunluk kontrolü farklı kişiler için de
    // kullanabilsin diye parametrik hale getirildi.
    const fits = (gReq, gender = pg) => gender === 'OTHER' || !gReq || gReq === 'MIX' || gender === gReq;

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
    // STRICT'te oyuncu zaten belirli bir slotu seçerek başvurduğu için atanmamış havuzuna
    // düşmüyor, doğrudan o slota yerleşiyor. FLEXIBLE'da da aynı şekilde çalışıyor (kullanıcı
    // isteği: "kullanıcıların olmak istedikleri slota göre yerleştir") — tek fark, FLEXIBLE'da
    // bu seçim ZORUNLU değildi (bkz. sendJoinRequest), seçilmediyse joinReq.requestedSlot
    // zaten null olur ve aşağıdaki "Atanmamış" yoluna düşer.
    if (joinReq.requestedSlot) {
        openSlots = joinReq.requestedSlot === 'opponent'
            ? openSlots.filter(s => s.key === 'opp1' || s.key === 'opp2')
            : openSlots.filter(s => s.key === joinReq.requestedSlot);
        if (openSlots.length === 0) {
            return { error: joinReq.requestedSlot === 'partner' ? 'Kurucu takımı slotu artık dolu.' : 'Seçilen slot artık dolu.' };
        }
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

    if (openSlots.length === 0) return { error: 'Tüm slotlar dolu.' };

    // BUG (kullanıcı raporu): "3 kadın kabul ettim ama takım arkadaşım kadın, rakip 1 kadın,
    // rakip 2 erkek olacak şekilde ayarlanmıştı" — eskiden burada SADECE bu başvuranın kendi
    // başına açık slotlardan BİRİNE uyup uymadığına bakılıyordu (fitsAny). Atanmamış havuzuna
    // düşen kişiler henüz hiçbir named slotu "dolu" yapmadığı için (partnerFilled/opp1Filled/
    // opp2Filled hesabı sadece GERÇEKTEN yerleşmiş kişilere bakar), aynı cinsiyetten art arda
    // 3 kişi kabul edilebiliyordu — üçüncü kabulden sonra erkek gerektiren slot için havuzda
    // uygun kimse kalmıyordu ama bunu yakalayan bir kontrol yoktu. Artık havuzda ZATEN bekleyen
    // herkesin cinsiyeti de bu başvuranla BİRLİKTE, açık slotlara (basit backtracking ile) tam
    // olarak yerleştirilebiliyor mu diye kontrol ediliyor — mümkün değilse kabul reddedilir.
    const existingUnassigned = (Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []).filter(p => p?.id);
    const existingGenders = existingUnassigned.length > 0
        ? await prisma.user.findMany({ where: { id: { in: existingUnassigned.map(p => p.id) } }, select: { id: true, gender: true } })
        : [];
    const genderById = Object.fromEntries(existingGenders.map(u => [u.id, u.gender]));
    // BUG (kullanıcı raporu): ilan sahibi cinsiyet kısıtlamasını SONRADAN değiştirince
    // (ör. tüm slotlar kadına çevrildi), havuzda önceden kabul edilmiş ve artık HİÇBİR açık
    // slota uymayan biri (ör. erkek) kalıcı olarak sıkışıp kalabiliyordu — bu, bu kişinin
    // kendi sorunuydu ve yeni bir başvuruyu kabul etmekle ilgisi yok. Eskiden bu kişi de
    // "hepsi yerleştirilebilmeli" kontrolüne dahil ediliyordu, bu yüzden kendisi hiçbir slota
    // uymadığı için kontrol HER ZAMAN başarısız oluyor, artık kimse kabul edilemiyordu. Zaten
    // hiçbir açık slota uymayan (sıkışmış) havuz üyeleri bu kontrolden hariç tutulur — onların
    // durumu bu kabul işleminden bağımsız, zaten sorunlu.
    const placeableUnassigned = existingUnassigned.filter(p => openSlots.some(s => fits(s.req, genderById[p.id])));
    const poolGenders = [...placeableUnassigned.map(p => genderById[p.id]), pg];

    const canAssignAll = (genders, slots) => {
        if (genders.length === 0) return true;
        if (genders.length > slots.length) return false;
        const [g, ...restGenders] = genders;
        for (let i = 0; i < slots.length; i++) {
            if (fits(slots[i].req, g)) {
                const restSlots = [...slots.slice(0, i), ...slots.slice(i + 1)];
                if (canAssignAll(restGenders, restSlots)) return true;
            }
        }
        return false;
    };

    if (!canAssignAll(poolGenders, openSlots)) {
        const details = openSlots.map(s => s.req !== 'MIX' ? `${s.label}: ${s.req === 'MALE' ? 'erkek' : 'kadın'}` : null).filter(Boolean).join(', ');
        return { error: `Bu oyuncuyu kabul edersen, atanmamış havuzundaki bekleyen oyuncularla birlikte kalan slotların cinsiyet gereksinimini karşılamak imkansız hale geliyor.${details ? ` (${details})` : ''}` };
    }
    // Katılımcı/senderTeam'e hiç dokunulmaz — sadece unassignedPlayers'a eklenir. Ön yüzde bu
    // kişi yine sıradaki "Katılımcı N" olarak görünür (bkz. mobil RivalDetailModal front face).
    return { updatedParticipants: participants, updatedUnassignedPlayers: [...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []), joinerEntry] };
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

        let updated = await prisma.activityRequest.update({
            where: { id },
            data: { senderTeam: newSenderTeam, participants: newParticipants },
            include: {
                sender: { select: SENDER_SELECT },
                joinRequests: {
                    where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                    orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }],
                    // where filtresi + alias ÖNEMLİ — bkz. getRivalById'deki aynı düzeltmenin
                    // yorumu: filtresiz interests, kullanıcının BAŞKA bir daldaki takma adını/
                    // puanını gösterebiliyordu.
                    include: { user: { select: { ...SENDER_SELECT, interests: { where: { category: rival.category, subCategory: rival.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } },
                },
            },
        });
        updated = await enrichRivalWithRatings(updated);

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
                // NOT: sender.interests BURADA seçilmiyor — aşağıda ayrı bir sorguyla subCategory'ye
                // GÖRE FİLTRELENEREK ekleniyor (bkz. senderInterest). Önceden buradaki interests
                // select'inde where filtresi yoktu; bir kullanıcının birden fazla spor ilgisi varsa
                // Prisma'nın döndürdüğü SIRA garantili değildi — ör. voleybolde 1.26 puanlı bir
                // kullanıcının interests[0]'ı bazen tenis/padel'deki 3.40 puanına denk geliyordu.
                // Bu da "bir anda 3.40 oldu, birkaç saniye sonra 1.26'ya geri döndü" olarak
                // görünüyordu (kullanıcı raporu) — geri dönüş, sonraki doğru-filtrelenmiş bir
                // listeleme isteğiyle oluyordu. Bu uç nokta zaten socket'le CANLI yayınlanan bir
                // ilanı (ör. bir demo bot katılım isteği gönderince) her görüntüleyene ittiği için
                // hata anlık ama görünür oluyordu.
                sender: { select: SENDER_SELECT },
                refereeUser: { select: SENDER_SELECT },
                // alias ÖNEMLİ (bkz. yukarıdaki sender.interests yorumu ile aynı sebep) —
                // davet listesindeki kişinin bu daldaki takma adı gösterilsin. NOT: burada
                // interests'e category/subCategory'ye göre where filtresi UYGULANAMAZ — bu
                // filtre `rival.category`/`rival.subCategory`'ye ihtiyaç duyar ama `rival`
                // henüz bu sorgunun SONUCU (aşağıdaki const rival = await ... henüz atanmadı),
                // yani kendi kendine referans verip "Cannot access 'rival' before
                // initialization" ile HER çağrıda 500 patlıyordu (ilan detayı hiç açılamıyor,
                // ekran eski/eksik veriyle kalıyordu — kullanıcı raporu: "istek attıkları yerde
                // elo puanı gözükmüyor"). Bu yüzden burada filtresiz TÜM interests çekilip
                // subCategory alanıyla birlikte döndürülüyor, mobil taraf zaten
                // `.find(i => i.subCategory === sub)` ile doğru olanı kendisi seçiyor.
                // interests select'i singlesRating/doublesRating/seed/offset alanlarını da
                // içerir — mobil tarafta "Gelen İstekler"/"Gönderilen Davetler" listesinde
                // kullanıcı isteğiyle format-doğru (tekli/çiftli) ELO etiketi ("T ELO"/"Ç ELO")
                // gösterilebilsin diye (bkz. utrRating.js getDisplayRating ile aynı alanlar).
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } } },
                // Hakem Arıyorum ilanları (matchType PLAYER_WANTED, positions:['REFEREE']) için:
                // asıl maçın oyuncularını (kim başvuramaz) ve dolu/boş slot durumunu görebilmek için.
                linkedRival: { select: { id: true, senderId: true, matchType: true, teamSize: true, participants: true, senderTeam: true, participantsCanInvite: true, sender: { select: SENDER_SELECT } } },
            },
        });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });

        // getRivalRequests'teki AYNI derece-puanı zenginleştirmesi (bkz. oradaki yorum) —
        // tek kayıt çekildiğinde de (ör. atama sonrası yenileme) kadro kartı güncel puanı görsün.
        // Kurucunun (sender) kendi puanı da AYNI sorguya (ve subCategory filtresine) dahil.
        const teamUserIds = [...new Set([
            rival.senderId,
            ...(Array.isArray(rival.senderTeam) ? rival.senderTeam : []).filter(p => p?.id).map(p => p.id),
            ...(Array.isArray(rival.participants) ? rival.participants : []).filter(p => p?.id).map(p => p.id),
            ...(Array.isArray(rival.substitutePlayers) ? rival.substitutePlayers : []).filter(p => p?.id).map(p => p.id),
            // Kullanıcı isteği: "Atanmamış" listesinde de isimlerin yanında elo/derece puanı
            // görünsün ki ilan sahibi kime hangi takımı vereceğine ona göre karar versin —
            // önceden bu liste sadece gender enrichment alıyordu, skillRating hiç yoktu.
            ...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []).filter(p => p?.id).map(p => p.id),
        ])];
        const teamInterests = teamUserIds.length > 0
            ? await prisma.userInterest.findMany({
                where: { userId: { in: teamUserIds }, subCategory: rival.subCategory },
                select: {
                    userId: true, alias: true, level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true,
                    singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true,
                },
            })
            : [];
        // Tenis/padel'de tekli/çiftli AYRI puan (bkz. teamDisplayRating) — bu ilanın FORMATINA
        // göre doğru puan gösterilir, düz (format'tan bağımsız) skillRating mirror'ı DEĞİL.
        const rivalIsDoubles = isDoublesFormat(rival);
        const withTeamRating = (arr) => (Array.isArray(arr) ? arr : []).map(p => p?.id
            ? { ...p, skillRating: teamDisplayRating(teamInterests.find(i => i.userId === p.id), rival.subCategory, rivalIsDoubles) }
            : p);
        const senderInterestRaw = teamInterests.find(i => i.userId === rival.senderId);
        const senderInterest = senderInterestRaw
            ? { ...senderInterestRaw, skillRating: teamDisplayRating(senderInterestRaw, rival.subCategory, rivalIsDoubles) }
            : null;
        const unassignedGenderById = await fillMissingUnassignedGenders([rival.unassignedPlayers]);
        const withGender = (arr) => (Array.isArray(arr) ? arr : []).map(p => p?.id ? { ...p, gender: p.gender ?? unassignedGenderById[p.id] ?? null } : p);

        // Kullanıcı isteği: ilan detayında hangi oyuncunun bu maç/tesis üzerinden sipariş/adisyonu
        // olduğu görülebilsin (kadroda yanıp sönen adisyon ikonu, bkz. RivalDetailModal) — ama
        // SADECE işletme siparişi onayladıktan (CONFIRMED/READY) sonra, henüz PENDING (onay
        // bekleyen) ya da CANCELLED bir sipariş için ikon çıkmaz (kullanıcı isteği: "işletme
        // onaylayınca adisyon butonu oluşsun"). İki kaynaktan gelebilir: (1) VenueOrder.activityId
        // — henüz bir adisyon (VenueBill) açılmadan verilen siparişler, (2) reservationId'ye bağlı
        // VenueBill'in kalemleri — bunlar zaten ya kullanıcının onaylı siparişinden ya da
        // işletmenin doğrudan adisyona eklediği kalemlerden geldiği için ayrıca durum filtresi
        // gerekmez.
        let orderedUserIds = [];
        if (rival.venueId) {
            const [venueOrders, bill] = await Promise.all([
                prisma.venueOrder.findMany({ where: { activityId: rival.id, status: { in: ['CONFIRMED', 'READY'] } }, select: { userId: true } }),
                rival.venueReservationId
                    ? prisma.venueBill.findUnique({ where: { reservationId: rival.venueReservationId }, include: { items: { select: { userId: true } } } })
                    : Promise.resolve(null),
            ]);
            orderedUserIds = [...new Set([
                ...venueOrders.map(o => o.userId),
                ...(bill?.items || []).map(i => i.userId).filter(Boolean),
            ])];
        }

        res.json({
            ...rival,
            sender: { ...rival.sender, interests: senderInterest ? [senderInterest] : [] },
            senderTeam: withTeamRating(rival.senderTeam),
            participants: withTeamRating(rival.participants),
            substitutePlayers: withTeamRating(rival.substitutePlayers),
            unassignedPlayers: withGender(withTeamRating(rival.unassignedPlayers)),
            orderedUserIds,
        });
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
        // Kullanıcı isteği: kadroda olmayan ama bu hakem ilanına davet edilmiş/başvurmuş biri
        // de kendi davetini/başvurusunu görüp kabul/red edebilsin diye bu kişiler de erişebilir.
        const isInvitedOrApplied = (refAd?.joinRequests || []).some(jr => jr.userId === req.userId);
        if (!isInvolved && !isInvitedOrApplied) return res.status(403).json({ message: 'Forbidden' });

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

        const [rivalRows, tournRows, subsNeededRows] = await Promise.all([
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
            // Voleybolde yedek kadrosu dolmamış Yaklaşan Maçlar (status MATCHED) — kullanıcı
            // isteği: SubCategoryScreen'deki "Açık İlanlar" sayacına zaten dahil ediliyordu,
            // ama üst seviyedeki "Voleybol (N)" dal sayacı hâlâ OPEN olmayan bu ilanları hiç
            // saymıyordu.
            prisma.activityRequest.findMany({
                where: { status: 'MATCHED', subCategory: 'volleyball', substituteCount: { gt: 0 }, ...catWhere },
                select: { substituteCount: true, substitutePlayers: true },
            }),
        ]);

        const counts = {};
        rivalRows.forEach(r => { counts[r.subCategory] = r._count.id; });
        tournRows.forEach(r => { counts[r.subCategory] = (counts[r.subCategory] || 0) + r._count.id; });
        const subsNeededCount = subsNeededRows.filter(r => {
            const filled = (Array.isArray(r.substitutePlayers) ? r.substitutePlayers : []).filter(p => p?.id).length;
            return filled < (r.substituteCount || 0);
        }).length;
        // Kullanıcı isteği: "4.5 ilan" gibi küsuratlı bir sayaç göstermeye gerek yok —
        // yedek kadro aranan maç da tam (1) sayılır, açık ilanlarla toplanır.
        if (subsNeededCount > 0) counts.volleyball = (counts.volleyball || 0) + subsNeededCount;
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

        const { message, wager, matchDate, matchTime, duration, location, district, ticketUrl, courtName, courtAddress, courtLat, courtLng,
                minRating, maxRating, ratingGenderSplit, minRatingMale, maxRatingMale, minRatingFemale, maxRatingFemale,
                matchMode, genderReq, partnerGenderReq, opp1GenderReq, opp2GenderReq, genderCountMode, requiredMaleCount, minGenderReq, minGenderCount, winsNeeded,
                venueId, venueCourtId, venueReservationId, isCourtReserved, surface, courtFeePerPerson, courtFeePerPersonByMethod, refereeRequested, refereePayment, refereeFeeIncluded, manualRefereeName,
                teamFlexibility, matchType, participantsCanInvite, extraServices, feeIncludes, cancelPenaltyHours, subCount,
                founderTeamName, opponentTeamName } = req.body;

        // Cinsiyet dağılımı üç moddan biri: 'EXACT' (requiredMaleCount, eski davranış), 'MIN'
        // (minGenderReq/minGenderCount — sadece bir cinsiyetten havuzun TAMAMINDA en az kaç kişi
        // gerektiği, kalanı serbest) ya da 'MIN_PER_TEAM' (aynı minGenderReq/minGenderCount ama
        // HER İKİ takımda AYRI AYRI aranır — kullanıcı isteği: "takım başına minimum kadın
        // sayısı"). genderCountMode değişiyorsa diğer moda ait alan temizlenir, ikisi birden
        // dolu kalıp tutarsız bir duruma düşmesin diye.
        if (genderCountMode !== undefined) {
            if (genderCountMode !== null && !['EXACT', 'MIN', 'MIN_PER_TEAM'].includes(genderCountMode)) {
                return res.status(400).json({ message: 'Geçersiz cinsiyet dağılımı modu' });
            }
            if (['MIN', 'MIN_PER_TEAM'].includes(genderCountMode) && !['MALE', 'FEMALE'].includes(minGenderReq)) {
                return res.status(400).json({ message: 'Minimum cinsiyet dağılımı için cinsiyet seçimi gerekli' });
            }
            // Kullanıcı raporu: cinsiyet dağılımı ayarı değiştirildiğinde (gevşetilse bile)
            // TÜM kabul edilmiş oyuncular otomatik olarak "son onay bekliyor"na çekiliyordu —
            // bkz. rosterMeetsGenderQuota. Artık sadece yeni ayarla mevcut kadro gerçekten
            // imkansız hale geliyorsa düzenleme reddedilir, kimse otomatik geri alınmaz.
            const effRequiredMaleCount = genderCountMode === 'EXACT' && requiredMaleCount !== null && requiredMaleCount !== '' ? parseInt(requiredMaleCount, 10) : null;
            const effMinGenderReq = ['MIN', 'MIN_PER_TEAM'].includes(genderCountMode) ? minGenderReq : null;
            const effMinGenderCount = ['MIN', 'MIN_PER_TEAM'].includes(genderCountMode) && minGenderCount !== null && minGenderCount !== '' ? parseInt(minGenderCount, 10) : null;
            const quotaErr = await rosterMeetsGenderQuota(rival, genderCountMode, effRequiredMaleCount, effMinGenderReq, effMinGenderCount);
            if (quotaErr) return res.status(400).json({ message: quotaErr });
        }

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
                const creatorRating = getDisplayRating(creatorInterest, rival.subCategory, isDoublesFormat(rival));
                if (effMin !== null && creatorRating < effMin)
                    return res.status(400).json({ message: `Bu kısıtlamayı koyamazsınız: en az ${effMin}★ istiyorsunuz ama kendi puanınız ${creatorRating.toFixed(2)}★.` });
                if (effMax !== null && creatorRating > effMax)
                    return res.status(400).json({ message: `Bu kısıtlamayı koyamazsınız: en fazla ${effMax}★ kabul ediyorsunuz ama kendi puanınız ${creatorRating.toFixed(2)}★.` });

                // Kullanıcı isteği: derece kısıtlaması eklenince/sıkılaştırılınca, zaten
                // bekleyen davet/başvurular varsa ve onlar yeni kısıtlamaya uymuyorsa genel
                // "İşlem başarısız" yerine kimlerin uymadığını açıkça söyleyen bir hata dönsün
                // — ilan sahibi önce o davetleri/başvuruları geri çekmeli, kimse otomatik
                // reddedilmiyor (genderCountMode kontrolündeki aynı desen).
                const pendingReqs = await prisma.rivalJoinRequest.findMany({
                    where: { rivalId: id, status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                    include: { user: { select: { id: true, username: true, fullName: true } } },
                });
                if (pendingReqs.length > 0) {
                    const isDoubles = isDoublesFormat({ ...rival, matchType: matchType !== undefined ? matchType.toUpperCase() : rival.matchType });
                    const pendingInterests = await prisma.userInterest.findMany({
                        where: { userId: { in: pendingReqs.map(r => r.userId) }, category: rival.category, subCategory: rival.subCategory },
                    });
                    const nonCompliant = pendingReqs
                        .map(r => {
                            const rating = getDisplayRating(pendingInterests.find(i => i.userId === r.userId), rival.subCategory, isDoubles);
                            return { name: r.user?.fullName || r.user?.username || 'Bilinmeyen kullanıcı', rating };
                        })
                        .filter(p => (effMin !== null && p.rating < effMin) || (effMax !== null && p.rating > effMax));
                    if (nonCompliant.length > 0) {
                        const names = nonCompliant.map(p => `${p.name} (${p.rating.toFixed(2)}★)`).join(', ');
                        return res.status(400).json({
                            message: `Şu davet/başvuru sahibi kullanıcı(lar) belirlemek istediğiniz derece kısıtlamasına uymamaktadır: ${names}. Bu kısıtlamayı uygulayabilmek için önce ilgili davetlerinizi/başvurularınızı geri çekmeniz gerekmektedir.`,
                        });
                    }
                }
            }
        }

        // matchType (tekli/çiftli) sadece hiç katılımcı/partner kabul edilmemişse
        // değiştirilebilir — aksi halde participants/senderTeam dizisinin şekli
        // (kim hangi slotta) uyumsuz kalır. teamFlexibility ise katılımcı dizisinin
        // şeklini etkilemez (sadece takas izni), o yüzden her zaman değiştirilebilir.
        // unassignedPlayers'daki (henüz bir slota yerleşmemiş ama zaten kabul edilmiş)
        // kişiler de sayılır — kullanıcı raporu: onlar sayılmayınca hem format kilidi hem
        // aşağıdaki "kabul edilenleri yeniden onaya çek" temizliği hiç tetiklenmiyordu.
        const hasParticipants = (Array.isArray(rival.participants) && rival.participants.length > 0)
            || (Array.isArray(rival.senderTeam) && rival.senderTeam.length > 0)
            || (Array.isArray(rival.unassignedPlayers) && rival.unassignedPlayers.length > 0);
        const matchTypeRequested = matchType !== undefined && matchType.toUpperCase() !== rival.matchType;
        const matchTypeLocked = matchTypeRequested && hasParticipants;
        const applyMatchType = matchTypeRequested && !hasParticipants;

        // Kullanıcı raporu: aşağıdaki "kabul edilenleri yeniden onaya çek" temizliği (bkz.
        // hasParticipants kullanımı ~aşağıda) önceden İLANDAKİ HERHANGİ BİR ALAN değiştiğinde
        // (ör. sadece cinsiyet dağılımı kotası gevşetildiğinde bile) tetikleniyordu — oysa bir
        // oyuncunun "artık uygun olmayabileceği" tek gerçek sebep, katılım kararını verirken
        // baz aldığı PROGRAM/YER bilgisinin değişmesidir (cinsiyet kotası ayrı ve daha kesin
        // şekilde yukarıda rosterMeetsGenderQuota ile kontrol ediliyor). Artık sadece bu
        // alanlardan biri GERÇEKTEN değiştiyse tetiklenir.
        const scheduleFieldsChanged = (
            (matchDate !== undefined && (matchDate ? new Date(matchDate).getTime() : null) !== (rival.matchDate ? new Date(rival.matchDate).getTime() : null))
            || (matchTime !== undefined && matchTime !== rival.matchTime)
            || (location !== undefined && location !== rival.location)
            || (courtName !== undefined && courtName !== rival.courtName)
            || (courtAddress !== undefined && courtAddress !== rival.courtAddress)
            || (duration !== undefined && (duration !== null && duration !== '' ? parseInt(duration, 10) : null) !== rival.duration)
            || (venueId !== undefined && (venueId || null) !== rival.venueId)
            || (venueCourtId !== undefined && (venueCourtId || null) !== rival.venueCourtId)
            || (venueReservationId !== undefined && (venueReservationId || null) !== rival.venueReservationId)
        );

        const updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                ...(message !== undefined && { message }),
                ...(wager !== undefined && { wager: wager ? wager.trim().slice(0, 120) || null : null }),
                ...(founderTeamName !== undefined && { founderTeamName: founderTeamName ? founderTeamName.trim().slice(0, 24) || null : null }),
                ...(opponentTeamName !== undefined && { opponentTeamName: opponentTeamName ? opponentTeamName.trim().slice(0, 24) || null : null }),
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
                ...(genderCountMode !== undefined && {
                    genderCountMode,
                    requiredMaleCount: genderCountMode === 'EXACT' && requiredMaleCount !== null && requiredMaleCount !== '' ? parseInt(requiredMaleCount, 10) : null,
                    minGenderReq: ['MIN', 'MIN_PER_TEAM'].includes(genderCountMode) ? minGenderReq : null,
                    minGenderCount: ['MIN', 'MIN_PER_TEAM'].includes(genderCountMode) && minGenderCount !== null && minGenderCount !== '' ? parseInt(minGenderCount, 10) : null,
                }),
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

        // İlan düzenlendiğinde, program/yer bilgisi GERÇEKTEN değiştiyse (bkz.
        // scheduleFieldsChanged) zaten kabul edilmiş katılımcılar katılımcı listesinden
        // çıkarılıp tekrar onay bekleyen duruma (AWAITING_JOINER_CONFIRM) alınır — artık uygun
        // olmayabilirler (ör. yeni saatte müsait değiller). Aynı geç-kabul onay/iptal akışı
        // (confirmLateJoin) burada da kullanılır. Cinsiyet dağılımı gibi diğer ayarlar ayrı ve
        // daha isabetli şekilde yukarıda (rosterMeetsGenderQuota) kontrol edildiği için burada
        // artık kimseyi otomatik geri almaz.
        let finalUpdated = updated;
        if (hasParticipants && scheduleFieldsChanged) {
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
                // BUG (kullanıcı raporu, tenis DOUBLE): bu temizlik SADECE participants/senderTeam'i
                // temizliyordu — atanmamış havuzundaki (unassignedPlayers) kabul edilmiş kişiler
                // JoinRequest'i AWAITING_JOINER_CONFIRM'e çekilse de dizide kalıyordu. Bu "hayalet"
                // kayıt sonradan hem doluluk sayımını (teamFilledCount/isFull — maç yanlışlıkla
                // MATCHED'e geçip Yaklaşan Maçlar'a düşüyordu) hem cinsiyet uygunluk kontrolünü
                // (resolveDoubleAcceptance'daki canAssignAll) bozuyordu. Artık unassignedPlayers'tan
                // da aynı şekilde temizleniyor — kişi yukarıdaki döngüde zaten aynı "İlan Güncellendi"
                // bildirimini alıyor, confirmLateJoin ile isterse yeniden onaylayabiliyor.
                const clearedUnassigned = Array.isArray(updated.unassignedPlayers)
                    ? updated.unassignedPlayers.filter(p => !(p?.id && acceptedIds.includes(p.id)))
                    : updated.unassignedPlayers;
                await prisma.rivalJoinRequest.updateMany({
                    where: { id: { in: acceptedJoinReqs.map(jr => jr.id) } },
                    data: { status: 'AWAITING_JOINER_CONFIRM' },
                });
                finalUpdated = await prisma.activityRequest.update({
                    where: { id },
                    data: { participants: clearedParticipants, senderTeam: clearedSenderTeam, unassignedPlayers: clearedUnassigned, reopenedAt: new Date() },
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

        // Kullanıcı raporu: ilan düzenlenince de (kabul edilince olduğu gibi) kurucunun/
        // katılımcıların ELO rozeti anlık kayboluyordu — bkz. enrichRivalWithRatings tanımı.
        finalUpdated = await enrichRivalWithRatings(finalUpdated);
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

// Kadro kartı düzenlendiğinde (Değiştir/Çıkar ile takım değişimi, manuel oyuncu eklenmesi,
// çıkarılma) GÜNCEL kadrodaki herkese (Kurucu/Rakip Takım + Yedekler) haber verir — kullanıcı
// isteği: "son gördüğü halden sonra takımı değişirse kendisi ya da takım arkadaşları her
// değişimde bildirim gitsin" (maç günü/saati başka bir gün uymayabilir ama en az takımın kimin
// olduğunu da bilsinler istiyor). İlan sahibi (değişikliği yapan) hariç, opsiyonel excludeUserId
// (ör. taşınan/çıkarılan oyuncunun kendisi, ona zaten ayrı ve daha spesifik bir bildirim gidiyor).
function notifyRosterChange(activity, { title, body, excludeUserId }) {
    const participantIds = Array.isArray(activity.participants) ? activity.participants.map(p => p?.id).filter(Boolean) : [];
    const senderTeamIds = Array.isArray(activity.senderTeam) ? activity.senderTeam.map(p => p?.id).filter(Boolean) : [];
    const subIds = Array.isArray(activity.substitutePlayers) ? activity.substitutePlayers.map(p => p?.id).filter(Boolean) : [];
    // DOUBLE'da kabul edilip henüz bir slota atanmamış oyuncular (bkz. unassignedPlayers) —
    // önceden burada hiç sayılmıyordu, kadro değişiklik bildirimi (ör. birinin çıkarılması)
    // onlara hiç gitmiyordu (kullanıcı raporu).
    const unassignedIds = Array.isArray(activity.unassignedPlayers) ? activity.unassignedPlayers.map(p => p?.id).filter(Boolean) : [];
    const recipients = new Set([...participantIds, ...senderTeamIds, ...subIds, ...unassignedIds]);
    for (const uid of (Array.isArray(excludeUserId) ? excludeUserId : [excludeUserId])) {
        if (uid) recipients.delete(uid);
    }
    recipients.delete(activity.senderId);
    for (const uid of recipients) {
        // 'RESERVATION' KULLANILMIYOR — o tip mobil tarafta işletme rezervasyon ekranına
        // yönlendiriyor (bkz. navigation/index.js, NotificationsScreen.js); kadro bildirimi
        // tıklanınca maçın kendisine (SubCategory/rivals) gitmeli, o yüzden category/subCategory
        // ile eşleşen ve o yönlendirmeyi tetiklemeyen 'ROSTER_CHANGED' kullanılıyor.
        createNotification(uid, 'ROSTER_CHANGED', title, body, { rivalId: activity.id, category: activity.category, subCategory: activity.subCategory }).catch(() => {});
    }
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
            let updated = await prisma.activityRequest.update({
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
            updated = await enrichRivalWithRatings(updated);
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
            let updated = await prisma.activityRequest.update({
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
            updated = await enrichRivalWithRatings(updated);
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

        // Farklı işletmeye taşınmak yeni bir rezervasyon oluşturmak demek — hedef Pro/Premium
        // ise, reddedilen politika-dışı talep sayısı sınırı aşan kullanıcı burada da engellenir.
        if (crossVenue) {
            const policyBlock = await assertNotVenuePolicyBlocked(targetVenue, rival.senderId);
            if (policyBlock) return res.status(policyBlock.status).json({ message: policyBlock.message });
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

        let updatedActivity = await prisma.activityRequest.update({
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
        updatedActivity = await enrichRivalWithRatings(updatedActivity);

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
            category, subCategory, message, wager, level, levelDetail,
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
            // Cinsiyet dağılımı: 'EXACT' modda requiredMaleCount havuzun TAMAMININ kaçının erkek
            // olacağını belirtir (eski davranış). 'MIN' modda sadece minGenderReq cinsiyetinden
            // en az minGenderCount kişi gerekir, geri kalan slotlar serbest (kullanıcı isteği).
            genderCountMode, // 'EXACT' | 'MIN' | undefined/null = kısıtlama yok
            requiredMaleCount, // voleybol takım ilanı: havuzun (2*teamSize) kaç kişisinin erkek olması gerektiği — undefined/null = kısıtlama yok
            minGenderReq, // 'MIN' modda: 'MALE' | 'FEMALE'
            minGenderCount, // 'MIN' modda: en az kaç kişi
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
            founderTeamName, opponentTeamName, // voleybol/DOUBLE: takım isimleri artık ilan oluştururken de baştan girilebiliyor (önceden sadece ilan açıldıktan sonra setTeamName ile değiştirilebiliyordu)
        } = req.body;
        console.log(`[rival] createRivalRequest creatorId=${creatorId} sub=${subCategory}`);

        // Rekabetçi maçta puan (Elo) kazanım/kaybı hesaplanıyor, hesabı olmayan (manuel) bir
        // oyuncunun puanı olamayacağı için manuel isim eklemesi sadece Antrenman modunda
        // geçerli — frontend zaten bu modda seçeneği göstermiyor, burada savunma amaçlı
        // sessizce boşaltılıyor (kullanıcı isteği).
        const isCompetitiveCreate = (matchMode || '').toUpperCase() === 'COMPETITIVE';
        const cleanFounderManual = isCompetitiveCreate ? [] : normalizeManualNames(founderTeamManualNames);
        const cleanOppManual = isCompetitiveCreate ? [] : normalizeManualNames(oppTeamManualNames);
        const cleanSubManual = isCompetitiveCreate ? [] : normalizeManualNames(substituteManualNames);
        const cleanUnassignedManual = isCompetitiveCreate ? [] : normalizeManualNames(unassignedManualNames);

        let cleanExtraServices = [];
        if (extraServices !== undefined) {
            cleanExtraServices = sanitizeExtraServices(extraServices);
            if (cleanExtraServices === null) return res.status(400).json({ message: 'Geçersiz ekstra hizmet' });
        }

        const creatorInterest = await requireActiveInterest(creatorId, category, subCategory, matchType?.toUpperCase());

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
            const creatorRating = getDisplayRating(creatorInterest, subCategory, isDoublesFormat({ matchType: matchType.toUpperCase() }));
            if (creatorEffMin !== null && creatorRating < creatorEffMin)
                return res.status(400).json({ message: `Bu kısıtlamayı koyamazsınız: en az ${creatorEffMin}★ istiyorsunuz ama kendi puanınız ${creatorRating.toFixed(2)}★.` });
            if (creatorEffMax !== null && creatorRating > creatorEffMax)
                return res.status(400).json({ message: `Bu kısıtlamayı koyamazsınız: en fazla ${creatorEffMax}★ kabul ediyorsunuz ama kendi puanınız ${creatorRating.toFixed(2)}★.` });
        }

        // Kullanıcı raporu (DB'den doğrulandı): DOUBLE ilanda partner/Rakip 1/Rakip 2'ye
        // doğrudan davet gönderilirken (aşağıda ilan oluştuktan SONRA fire-and-forget
        // gönderiliyor, bkz. partnerInviteId/opp1InviteId/opp2InviteId) derece kısıtlaması HİÇ
        // kontrol edilmiyordu — inviteToRival'daki aynı kontrol sadece SONRADAN (ilan zaten
        // varken) gönderilen davetlerde vardı. Burada ilan oluşmadan ÖNCE, sentezce reddedilir.
        if (matchType.toUpperCase() === 'DOUBLE') {
            const inviteIdsToCheck = [...new Set([partnerInviteId, opp1InviteId, opp2InviteId].filter(Boolean))];
            if (inviteIdsToCheck.length > 0) {
                const effMinMaxForGender = (gender) => {
                    const pf = (v) => (v !== undefined && v !== null && v !== '' ? parseFloat(v) : null);
                    if (!genderSplitOn) return [pf(minRating), pf(maxRating)];
                    if (gender === 'MALE') return [pf(minRatingMale), pf(maxRatingMale)];
                    if (gender === 'FEMALE') return [pf(minRatingFemale), pf(maxRatingFemale)];
                    return [null, null];
                };
                const invitees = await prisma.user.findMany({
                    where: { id: { in: inviteIdsToCheck } },
                    select: {
                        id: true, username: true, gender: true,
                        interests: { where: { category, subCategory }, select: { skillRating: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } },
                    },
                });
                for (const inv of invitees) {
                    const [effMin, effMax] = effMinMaxForGender(inv.gender);
                    if (effMin == null && effMax == null) continue;
                    const invRating = getDisplayRating(inv.interests?.[0] || null, subCategory, true);
                    if (effMin != null && invRating < effMin) {
                        return res.status(400).json({ message: `Davet etmek istediğiniz @${inv.username} kişisinin derece puanı (${invRating.toFixed(2)}★) belirlemiş olduğunuz derece kısıtlamasına (en az ${effMin}★) uymamaktadır.` });
                    }
                    if (effMax != null && invRating > effMax) {
                        return res.status(400).json({ message: `Davet etmek istediğiniz @${inv.username} kişisinin derece puanı (${invRating.toFixed(2)}★) belirlemiş olduğunuz derece kısıtlamasına (en fazla ${effMax}★) uymamaktadır.` });
                    }
                }
            }
        }

        if (genderCountMode === 'EXACT' && requiredMaleCount !== undefined && requiredMaleCount !== null && requiredMaleCount !== '') {
            const totalSlots = 2 * (Number(teamSize) || 1);
            const rmc = parseInt(requiredMaleCount, 10);
            if (Number.isNaN(rmc) || rmc < 0 || rmc > totalSlots) {
                return res.status(400).json({ message: 'Geçersiz erkek oyuncu sayısı' });
            }
            // Manuel eklenen oyuncuların cinsiyeti de kotaya dahil — daha ilan açılırken
            // kotayı aşan bir kadro girilmiş olabilir (tutarsızlık olmasın diye burada da kontrol).
            const allManual = [...cleanFounderManual, ...cleanOppManual, ...cleanSubManual, ...cleanUnassignedManual];
            const manualMale = allManual.filter(n => n.gender === 'MALE').length;
            const manualFemale = allManual.filter(n => n.gender === 'FEMALE').length;
            if (manualMale > rmc) {
                return res.status(400).json({ message: `Cinsiyet dağılımı: manuel eklediğiniz erkek oyuncu sayısı erkek kontenjanını (${rmc}) aşıyor.` });
            }
            if (manualFemale > totalSlots - rmc) {
                return res.status(400).json({ message: `Cinsiyet dağılımı: manuel eklediğiniz kadın oyuncu sayısı kadın kontenjanını (${totalSlots - rmc}) aşıyor.` });
            }
        } else if (genderCountMode === 'MIN') {
            // Minimum modda sadece BİR cinsiyetten en az kaç kişi gerektiği belirtilir (ör.
            // "en az 2 kadın"), geri kalan slotların cinsiyeti serbest (kullanıcı isteği:
            // "2 kesin kız lazım, kalan 10 kişi fark etmez").
            if (!['MALE', 'FEMALE'].includes(minGenderReq)) {
                return res.status(400).json({ message: 'Minimum cinsiyet dağılımı için cinsiyet seçimi gerekli' });
            }
            const totalSlots = 2 * (Number(teamSize) || 1);
            const mgc = parseInt(minGenderCount, 10);
            if (Number.isNaN(mgc) || mgc < 1 || mgc > totalSlots) {
                return res.status(400).json({ message: 'Geçersiz minimum oyuncu sayısı' });
            }
            const allManual = [...cleanFounderManual, ...cleanOppManual, ...cleanSubManual, ...cleanUnassignedManual];
            const otherGenderManual = allManual.filter(n => n.gender && n.gender !== minGenderReq).length;
            if (otherGenderManual > totalSlots - mgc) {
                return res.status(400).json({ message: `Cinsiyet dağılımı: manuel eklediğiniz oyuncular minimum kontenjanı (${mgc}) imkansız kılıyor.` });
            }
        } else if (genderCountMode === 'MIN_PER_TEAM') {
            // Takım başına minimum: aynı "en az N kişi" mantığı ama pool (2*teamSize) yerine
            // HER İKİ taraf (Kurucu/Rakip) AYRI AYRI en az minGenderCount kadar minGenderReq
            // cinsiyetinden oyuncu içermeli (kullanıcı isteği: "takım başına minimum kadın sayısı").
            if (!['MALE', 'FEMALE'].includes(minGenderReq)) {
                return res.status(400).json({ message: 'Minimum cinsiyet dağılımı için cinsiyet seçimi gerekli' });
            }
            const teamSizeN = Number(teamSize) || 1;
            const mgc = parseInt(minGenderCount, 10);
            if (Number.isNaN(mgc) || mgc < 1 || mgc > teamSizeN) {
                return res.status(400).json({ message: 'Geçersiz minimum oyuncu sayısı' });
            }
            // Kurucu kendisi zaten 1 sabit slot tuttuğu için senderTeam kapasitesi (teamSizeN-1).
            const otherGenderFounder = cleanFounderManual.filter(n => n.gender && n.gender !== minGenderReq).length;
            if (otherGenderFounder > (teamSizeN - 1) - mgc) {
                return res.status(400).json({ message: `Cinsiyet dağılımı: Kurucu Takımı'na manuel eklediğiniz oyuncular takım başına minimum kontenjanı (${mgc}) imkansız kılıyor.` });
            }
            const otherGenderOpp = cleanOppManual.filter(n => n.gender && n.gender !== minGenderReq).length;
            if (otherGenderOpp > teamSizeN - mgc) {
                return res.status(400).json({ message: `Cinsiyet dağılımı: Rakip Takımı'na manuel eklediğiniz oyuncular takım başına minimum kontenjanı (${mgc}) imkansız kılıyor.` });
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
                ...(wager && wager.trim() && { wager: wager.trim().slice(0, 120) }),
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
                ...(founderTeamName && founderTeamName.trim() && { founderTeamName: founderTeamName.trim().slice(0, 24) }),
                ...(opponentTeamName && opponentTeamName.trim() && { opponentTeamName: opponentTeamName.trim().slice(0, 24) }),
                ...(req.body.duration && { duration: Number(req.body.duration) }),
                // Rakip tarafta manuel (kayıtsız) isimler artık eski oppTeamManualNames yerine
                // doğrudan participants'a {manualName, gender} olarak yazılıyor — post-creation
                // kadro kartındaki addManualTeamPlayer ile AYNI dizi/format, gerçek katılımcılarla
                // karışık pozisyonel sıralama ve cinsiyet kotası sayımı tutarlı çalışsın diye.
                participants: cleanOppManual.map(n => ({ manualName: n.name, gender: n.gender })),
                // DOUBLE + partnerInviteId: partner henüz kabul etmedi, senderTeam boş.
                // Voleybol: kurucu takımda uygulamayı kullanmayan (manuel isim) oyuncular
                // da senderTeam'e {manualName, gender} şeklinde direkt eklenir (davetsiz, bilgi amaçlı).
                senderTeam: (partnerInviteId && matchType.toUpperCase() === 'DOUBLE')
                    ? []
                    : [
                        ...(Array.isArray(senderTeam) ? senderTeam : []),
                        ...cleanFounderManual.map(n => ({ manualName: n.name, gender: n.gender })),
                    ],
                // Artık yeni ilanlarda yazılmıyor (yukarı bkz.) — sadece bu mimari değişiklikten
                // ÖNCE oluşturulmuş eski ilanlarda hâlâ dolu, geriye dönük gösterim için duruyor.
                oppTeamManualNames: [],
                substitutePlayers: cleanSubManual.map(n => ({ manualName: n.name, gender: n.gender })),
                // İlan oluştururken herkesi bir takıma atamak zorunlu değil (kullanıcı isteği) —
                // hangi tarafta oynayacağı henüz belli olmayan serbest metin isimler doğrudan
                // buraya, kayıtlı kullanıcı davetleri ise kabul edildikten sonra buraya eklenir
                // (bkz. unassignedInviteIds döngüsü ve respondToJoin'deki isUnassignedInvite dalı).
                unassignedPlayers: cleanUnassignedManual.map(n => ({ manualName: n.name, gender: n.gender })),
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
                ...(genderCountMode === 'EXACT' && requiredMaleCount !== undefined && requiredMaleCount !== null && requiredMaleCount !== ''
                    && { genderCountMode: 'EXACT', requiredMaleCount: parseInt(requiredMaleCount, 10) }),
                ...(genderCountMode === 'MIN' && minGenderCount !== undefined && minGenderCount !== null && minGenderCount !== ''
                    && { genderCountMode: 'MIN', minGenderReq, minGenderCount: parseInt(minGenderCount, 10) }),
                ...(genderCountMode === 'MIN_PER_TEAM' && minGenderCount !== undefined && minGenderCount !== null && minGenderCount !== ''
                    && { genderCountMode: 'MIN_PER_TEAM', minGenderReq, minGenderCount: parseInt(minGenderCount, 10) }),
                ...(winsNeeded !== undefined && winsNeeded !== null && winsNeeded !== ''
                    && { winsNeeded: parseInt(winsNeeded, 10) }),
                status: 'OPEN',
            },
            include: { sender: { select: SENDER_SELECT } },
        });
        const enrichedRequest = await enrichRivalWithRatings(request);

        res.status(201).json(enrichedRequest);

        // Real-time: show new listing instantly on all screens
        broadcast('rivalUpdate', enrichedRequest);

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
                // Kullanıcı isteği: sadece bu dalda aktif bir hakem kaydı olanlar davet
                // edilebilsin — mobil zaten sadece kayıtlıları öneriyor (bkz. searchUsers/
                // getUsersBySport refereeOnly), burası doğrudan API çağrısıyla atlatılmasını önler.
                const rawInvites = Array.isArray(refereeInvites) ? refereeInvites.filter(inv => inv?.userId) : [];
                let invites = rawInvites;
                if (rawInvites.length > 0) {
                    const eligible = await prisma.refereeListing.findMany({
                        where: { userId: { in: rawInvites.map(inv => inv.userId) }, subCategory, category, status: 'ACTIVE', ...(['volleyball', 'tennis', 'padel'].includes(subCategory) && { approved: true }) },
                        select: { userId: true },
                    });
                    const eligibleIds = new Set(eligible.map(l => l.userId));
                    invites = rawInvites.filter(inv => eligibleIds.has(inv.userId));
                }
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
                let updatedRival = await prisma.activityRequest.findUnique({
                    where: { id: request.id },
                    include: {
                        sender: { select: SENDER_SELECT },
                        joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                    },
                });
                updatedRival = await enrichRivalWithRatings(updatedRival);
                if (updatedRival) {
                    emitToUser(creatorId, 'rivalUpdate', updatedRival);
                    emitToUser(partnerInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                // Takım Değişikliği kapalıysa (STRICT) davet edilen kişi, hangi pozisyona
                // yerleştiğini AYRICA görüp bunun değişmeyeceğini bilsin (kullanıcı isteği).
                const strictNote = teamFlexibility === 'STRICT' ? ' Takım değişikliği kapalı, bu pozisyonda kalacaksınız.' : '';
                createNotification(
                    partnerInviteId, 'MATCH_INVITE',
                    `🤝 ${subCategoryTR(request.subCategory)} Partner Daveti`,
                    `@${me?.username || 'Biri'} sizi çiftler maçında partner olmaya davet etti.${strictNote}`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id, inviteDoubleSlot: 'partner' }
                ).catch(() => {});
                emitToUser(partnerInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: `🤝 ${subCategoryTR(request.subCategory)} Partner Daveti`,
                    body: `@${me?.username || 'Biri'} sizi çiftler maçında partner olmaya davet etti.${strictNote}`,
                    data: { category: request.category, subCategory: request.subCategory, rivalId: request.id, inviteDoubleSlot: 'partner' },
                });
            }).catch(() => {});
        }

        // DOUBLE rakip daveti: Rakip 1 / Rakip 2 slotuna doğrudan davet — inviteToRival ile aynı
        // mantık (owner-initiated, requestedSlot='opp1'/'opp2' — bkz. respondToJoin'deki yeni dal),
        // sadece ilan oluşturulurken tetiklenir.
        for (const oppInviteId of [opp1InviteId, opp2InviteId].filter(Boolean)) {
            if (matchType.toUpperCase() !== 'DOUBLE' || oppInviteId === partnerInviteId) continue;
            const oppSlot = oppInviteId === opp1InviteId ? 'opp1' : 'opp2';
            prisma.rivalJoinRequest.create({
                data: { rivalId: request.id, userId: oppInviteId, initiatedBy: 'OWNER', requestedSlot: oppSlot },
            }).then(async () => {
                let updatedRival = await prisma.activityRequest.findUnique({
                    where: { id: request.id },
                    include: {
                        sender: { select: SENDER_SELECT },
                        joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                    },
                });
                updatedRival = await enrichRivalWithRatings(updatedRival);
                if (updatedRival) {
                    emitToUser(creatorId, 'rivalUpdate', updatedRival);
                    emitToUser(oppInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                // Hangi slottan (Rakip 1/Rakip 2) davet edildiği başlık+metinde AÇIKÇA belirtiliyor
                // (kullanıcı isteği: "hangi slottan davet edildiyse öyle bildirim gitsin") — Takım
                // Değişikliği kapalıysa (STRICT) bu pozisyonun değişmeyeceği de ayrıca ekleniyor.
                const oppSlotLabel = oppSlot === 'opp1' ? 'Rakip 1' : 'Rakip 2';
                const strictNote = teamFlexibility === 'STRICT' ? ' Takım değişikliği kapalı, bu pozisyonda kalacaksınız.' : '';
                createNotification(
                    oppInviteId, 'MATCH_INVITE',
                    `🎾 ${oppSlotLabel} Daveti`,
                    `@${me?.username || 'Biri'} sizi ${oppSlotLabel} olmaya davet etti.${strictNote}`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id, inviteDoubleSlot: oppSlot }
                ).catch(() => {});
                emitToUser(oppInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: `🎾 ${oppSlotLabel} Daveti`,
                    body: `@${me?.username || 'Biri'} sizi ${oppSlotLabel} olmaya davet etti.${strictNote}`,
                    data: { category: request.category, subCategory: request.subCategory, rivalId: request.id, inviteDoubleSlot: oppSlot },
                });
            }).catch(() => {});
        }

        // Takım sporları (voleybol, airsoft): rakip takım slotlarına doğrudan davet — yukarıdaki
        // opp1/opp2InviteId ile aynı mantık (owner-initiated, inviteToRival'la aynı akış),
        // sadece DOUBLE'a değil takımSize>1 olan herhangi bir maça uygulanıyor.
        const teamInviteEmoji = subCategory === 'airsoft' ? '🪖' : '🏐';
        const oppTeamIds = Array.isArray(oppTeamInviteIds) ? [...new Set(oppTeamInviteIds.filter(Boolean))] : [];
        oppTeamIds.forEach((oppInviteId, oppInviteIdx) => {
            // Kadro kartında hangi forma denk geleceği — manuel isimlerden (cleanOppManual,
            // participants'ın başında duruyor) sonraki ilk boş slotlar. Bildirime tıklayınca
            // kartın arka yüzü bu slotu vurgulasın diye (bkz. mobil highlightSlot).
            const slotIndex = cleanOppManual.length + oppInviteIdx;
            prisma.rivalJoinRequest.create({
                data: { rivalId: request.id, userId: oppInviteId, initiatedBy: 'OWNER', isOppTeamInvite: true, slotIndex },
            }).then(async () => {
                let updatedRival = await prisma.activityRequest.findUnique({
                    where: { id: request.id },
                    include: {
                        sender: { select: SENDER_SELECT },
                        joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                    },
                });
                updatedRival = await enrichRivalWithRatings(updatedRival);
                if (updatedRival) {
                    emitToUser(creatorId, 'rivalUpdate', updatedRival);
                    emitToUser(oppInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                createNotification(
                    oppInviteId, 'MATCH_INVITE',
                    `${teamInviteEmoji} ${subCategoryTR(request.subCategory)} Maç Daveti`,
                    `@${me?.username || 'Biri'} sizi Rakip Takım'a davet etti.`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id, inviteSide: 'opp', inviteSlotIndex: slotIndex }
                ).catch(() => {});
                emitToUser(oppInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: `${teamInviteEmoji} ${subCategoryTR(request.subCategory)} Maç Daveti`,
                    body: `@${me?.username || 'Biri'} sizi Rakip Takım'a davet etti.`,
                    data: { category: request.category, subCategory: request.subCategory, rivalId: request.id, inviteSide: 'opp', inviteSlotIndex: slotIndex },
                });
            }).catch(() => {});
        });

        // Voleybol: kurucu takım slotlarına doğrudan davet — oppTeamIds ile birebir aynı
        // akış, sadece isPartnerInvite:true (kabul edilince senderTeam'e eklenir, bkz.
        // respondToJoinRequest). partnerInviteId (DOUBLE) ile karışmasın diye ayrı tutuluyor.
        const founderTeamIds = Array.isArray(founderTeamInviteIds) ? [...new Set(founderTeamInviteIds.filter(Boolean))] : [];
        founderTeamIds.forEach((founderInviteId, founderInviteIdx) => {
            // "my" tarafta kadro kartı slot 0'ı her zaman kurucunun kendisi sayar (bkz.
            // setAtFounderSlot) — cleanFounderManual zaten senderTeam'in başında duruyor,
            // yeni davetler onlardan sonraki ilk boş slotlara denk gelir.
            const slotIndex = 1 + cleanFounderManual.length + founderInviteIdx;
            prisma.rivalJoinRequest.create({
                data: { rivalId: request.id, userId: founderInviteId, initiatedBy: 'OWNER', isPartnerInvite: true, slotIndex },
            }).then(async () => {
                let updatedRival = await prisma.activityRequest.findUnique({
                    where: { id: request.id },
                    include: {
                        sender: { select: SENDER_SELECT },
                        joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                    },
                });
                updatedRival = await enrichRivalWithRatings(updatedRival);
                if (updatedRival) {
                    emitToUser(creatorId, 'rivalUpdate', updatedRival);
                    emitToUser(founderInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                createNotification(
                    founderInviteId, 'MATCH_INVITE',
                    `${teamInviteEmoji} ${subCategoryTR(request.subCategory)} Takım Daveti`,
                    `@${me?.username || 'Biri'} sizi Kurucu Takım'a davet etti.`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id, inviteSide: 'my', inviteSlotIndex: slotIndex }
                ).catch(() => {});
                emitToUser(founderInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: `${teamInviteEmoji} ${subCategoryTR(request.subCategory)} Takım Daveti`,
                    body: `@${me?.username || 'Biri'} sizi Kurucu Takım'a davet etti.`,
                    data: { category: request.category, subCategory: request.subCategory, rivalId: request.id, inviteSide: 'my', inviteSlotIndex: slotIndex },
                });
            }).catch(() => {});
        });

        // Voleybol: yedek oyuncu daveti — aynı akış, isSubstituteInvite:true (kabul edilince
        // substitutePlayers'a eklenir).
        const substituteIds = Array.isArray(substituteInviteIds) ? [...new Set(substituteInviteIds.filter(Boolean))] : [];
        for (const subInviteId of substituteIds) {
            prisma.rivalJoinRequest.create({
                data: { rivalId: request.id, userId: subInviteId, initiatedBy: 'OWNER', isSubstituteInvite: true },
            }).then(async () => {
                let updatedRival = await prisma.activityRequest.findUnique({
                    where: { id: request.id },
                    include: {
                        sender: { select: SENDER_SELECT },
                        joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                    },
                });
                updatedRival = await enrichRivalWithRatings(updatedRival);
                if (updatedRival) {
                    emitToUser(creatorId, 'rivalUpdate', updatedRival);
                    emitToUser(subInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                createNotification(
                    subInviteId, 'MATCH_INVITE',
                    `🏐 ${subCategoryTR(request.subCategory)} Yedek Daveti`,
                    `@${me?.username || 'Biri'} sizi bir maçta yedek oyuncu olmaya davet etti.`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id }
                ).catch(() => {});
                emitToUser(subInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: `🏐 ${subCategoryTR(request.subCategory)} Yedek Daveti`,
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
                let updatedRival = await prisma.activityRequest.findUnique({
                    where: { id: request.id },
                    include: {
                        sender: { select: SENDER_SELECT },
                        joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                    },
                });
                updatedRival = await enrichRivalWithRatings(updatedRival);
                if (updatedRival) {
                    emitToUser(creatorId, 'rivalUpdate', updatedRival);
                    emitToUser(unassignedInviteId, 'rivalUpdate', updatedRival);
                }
                const me = request.sender;
                createNotification(
                    unassignedInviteId, 'MATCH_INVITE',
                    `${teamInviteEmoji} ${subCategoryTR(request.subCategory)} Maç Daveti`,
                    `@${me?.username || 'Biri'} sizi bir maça davet etti — takımınız yakında belli olacak.`,
                    { category: request.category, subCategory: request.subCategory, rivalId: request.id }
                ).catch(() => {});
                emitToUser(unassignedInviteId, 'notification', {
                    type: 'MATCH_INVITE', title: `${teamInviteEmoji} ${subCategoryTR(request.subCategory)} Maç Daveti`,
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

        // Auto-submit venue for admin review if courtName + location provided — ama SADECE
        // topluluk tarafından eklenen serbest-metin kortlar için. Kullanıcı raporu: zaten
        // admin onaylı bir BusinessVenue'den (venueId dolu — bkz. VenueBookingModal/CourtSlotsScreen
        // seçimi) rezerve edilen bir kort ("Buro" tesisinin "Kort 2"si gibi) burada AYRICA
        // topluluk Court tablosuna (verified:false, pending:true) "yeni bir yer" olarak
        // gönderiliyordu — venueId'nin BusinessVenue'ye ait olduğu hiç kontrol edilmiyordu.
        // Bu, zaten onaylı bir tesisin kortunu her ilan/rezervasyonda admin onay kuyruğuna
        // gereksiz yere düşürüyordu. venueId doluysa kort zaten onaylı bir tesise ait demektir,
        // ayrıca bir "yeni yer" başvurusuna gerek yok.
        if (courtName && location && !venueId) {
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

        // Kullanıcı raporu: burada AYRICA silinip bildirim gönderiliyordu — cleanupRivals.js'teki
        // cron (her 5 dk) da AYNI OPEN+süresi-geçmiş ilanları kendi başına yakalayıp bildirim
        // gönderiyordu. Uygulama açılışında birden fazla ekran bu uç noktayı (farklı subCategory
        // parametreleriyle ama HEPSİ tüm ilanları global taradığı için) paralel çağırınca, ikisi
        // de aynı ilanı silinmeden önce yakalayıp AYNI "İlanınız Kaldırıldı" bildirimini iki kez
        // gönderebiliyordu. Artık burası SADECE listeden hariç tutuyor (silme/bildirim YOK) —
        // tek yetkili yer cleanupRivals.js cron'u, bildirim en fazla ~5 dk gecikmeyle ama TEK
        // sefer gider.
        const now = new Date();
        const expiryCandidates = await prisma.activityRequest.findMany({
            where: { status: 'OPEN', matchDate: { lte: now }, matchTime: { not: null } },
            select: { id: true, matchDate: true, matchTime: true },
        });
        const expired = expiryCandidates.filter(r => {
            if (!r.matchTime || !r.matchDate) return false;
            const [h, m] = r.matchTime.split(':').map(Number);
            // matchTime is Turkey local (UTC+3) → subtract 3h to compare in UTC
            const matchUTC = new Date(new Date(r.matchDate).getTime() + (h * 60 + m) * 60000 - 3 * 3600000);
            return now >= matchUTC;
        });
        const expiredIds = expired.map(e => e.id);

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
                ...(expiredIds.length > 0 && { id: { notIn: expiredIds } }),
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
                            select: {
                                alias: true, level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true,
                                singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true,
                            },
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
                                    select: {
                                        alias: true, level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true,
                                        singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true,
                                    },
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

        // Kadro kartında oyuncuların yanında (ve takım ortalamasında) derece puanı gösterilebilsin
        // diye (kullanıcı isteği) — senderTeam/participants/substitutePlayers sadece id/username/avatar
        // snapshot'ı tutan Json alanlar, güncel skillRating burada canlı ekleniyor. Manuel (userId'siz)
        // oyuncular olduğu gibi bırakılıyor, skillRating aranmıyor.
        const teamUserIds = [...new Set(requests.flatMap(r => [
            ...(Array.isArray(r.senderTeam) ? r.senderTeam : []).filter(p => p?.id).map(p => p.id),
            ...(Array.isArray(r.participants) ? r.participants : []).filter(p => p?.id).map(p => p.id),
            ...(Array.isArray(r.substitutePlayers) ? r.substitutePlayers : []).filter(p => p?.id).map(p => p.id),
            // Kullanıcı isteği: "Atanmamış" listesinde de elo/derece puanı görünsün.
            ...(Array.isArray(r.unassignedPlayers) ? r.unassignedPlayers : []).filter(p => p?.id).map(p => p.id),
        ]))];
        const teamInterests = teamUserIds.length > 0
            ? await prisma.userInterest.findMany({
                where: { userId: { in: teamUserIds } },
                select: {
                    userId: true, subCategory: true, skillRating: true,
                    singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true,
                },
            })
            : [];
        // matchType formatına (tekli/çiftli) göre doğru puan — bkz. teamDisplayRating yorumu.
        const withTeamRating = (arr, subCategory, isDoubles) => (Array.isArray(arr) ? arr : []).map(p => p?.id
            ? { ...p, skillRating: teamDisplayRating(teamInterests.find(i => i.userId === p.id && i.subCategory === subCategory), subCategory, isDoubles) }
            : p);
        // sender/joinRequests.user.interests[0] de aynı şekilde format-doğru puana çevrilir —
        // kullanıcı raporu: yeni oluşturulan bir ilanın kartında/detayında ilan sahibinin kendi
        // puanı hâlâ 0 görünüyordu çünkü bu iki alan düz (aynalanmış, format'tan bağımsız)
        // skillRating'i olduğu gibi gönderiyordu.
        const withOwnDisplayRating = (interestsArr, subCategory, isDoubles) => (Array.isArray(interestsArr) && interestsArr[0]
            ? [{ ...interestsArr[0], skillRating: teamDisplayRating(interestsArr[0], subCategory, isDoubles) }]
            : (interestsArr || []));
        const unassignedGenderById = await fillMissingUnassignedGenders(requests.map(r => r.unassignedPlayers));
        const withGender = (arr) => (Array.isArray(arr) ? arr : []).map(p => p?.id ? { ...p, gender: p.gender ?? unassignedGenderById[p.id] ?? null } : p);

        res.json(requests.map(r => {
            const isDoubles = isDoublesFormat(r);
            return {
            ...r,
            sender: { ...r.sender, interests: withOwnDisplayRating(r.sender?.interests, r.subCategory, isDoubles) },
            joinRequests: (Array.isArray(r.joinRequests) ? r.joinRequests : []).map(jr => ({
                ...jr,
                user: jr.user ? { ...jr.user, interests: withOwnDisplayRating(jr.user.interests, r.subCategory, isDoubles) } : jr.user,
            })),
            senderTeam: withTeamRating(r.senderTeam, r.subCategory, isDoubles),
            participants: withTeamRating(r.participants, r.subCategory, isDoubles),
            substitutePlayers: withTeamRating(r.substitutePlayers, r.subCategory, isDoubles),
            unassignedPlayers: withGender(withTeamRating(r.unassignedPlayers, r.subCategory, isDoubles)),
            _myJoinStatus: myJoinMap[r.id]?.status || null,
            _myJoinRequestId: myJoinMap[r.id]?.id || null,
            _myJoinCounterPrice: myJoinMap[r.id]?.counterPrice || null,
            _myJoinCounterMessage: myJoinMap[r.id]?.counterMessage || null,
            _myJoinInitiatedBy: myJoinMap[r.id]?.initiatedBy || null,
            _myJoinOfferPrice: myJoinMap[r.id]?.offerPrice || null,
            _myJoinOfferMessage: myJoinMap[r.id]?.offerMessage || null,
            commentCount: commentCountMap[r.id] ?? 0,
        };
        }));
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

        // Voleybol/airsoft (teamSize>1): maç zaten eşleşmiş (MATCHED) olsa bile, hâlâ boş Yedek
        // kontenjanı varsa oyuncular yedek olarak başvurabilir — önceden MATCHED'a geçince TÜM
        // başvurular (yedek dahil) tamamen kapanıyordu, ilan sahibi ancak kendi daveti üzerinden
        // yedek bulabiliyordu.
        const subSlotOpenForRequest = req.body.asSubstitute
            && ['volleyball', 'airsoft'].includes(request.subCategory)
            && (request.teamSize || 1) > 1
            && (Array.isArray(request.substitutePlayers) ? request.substitutePlayers.filter(p => p?.id).length : 0) < (request.substituteCount || 0);
        if (request.status !== 'OPEN' && !subSlotOpenForRequest) return res.status(400).json({ message: 'This request is no longer open' });
        if (request.senderId === req.userId) return res.status(400).json({ message: 'You cannot join your own request' });
        // Kullanıcı isteği: bu maçın ONAYLI hakemi kendi yönettiği maça aynı zamanda oyuncu
        // olarak katılamaz (çelişki) — ama hakemlik SIRASINDA (refereeQueue, henüz atanmamış)
        // bekleyen biri normal şekilde oyuncu olarak katılabilir, orada çelişki yok.
        if (!req.body.asReferee && request.refereeId === req.userId) {
            return res.status(400).json({ message: 'Bu maçın hakemisiniz, aynı zamanda oyuncu olarak katılamazsınız.' });
        }

        await requireActiveInterest(req.userId, request.category, request.subCategory, request.matchType);

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
        // Yedek olarak başvuru: ilan MATCHED olmadan önce (hâlâ OPEN'ken) gönderilmiş ama hiç
        // yanıtlanmamış eski bir PENDING istek varsa (ilan başka biriyle dolup bu eski başvuru
        // hiç reddedilmemişse) — bu artık geçersiz bir kalıntı, yeni yedek başvurusunu
        // engellememeli. Kullanıcı raporu: "Yedek Olarak Başvur" deyince "You already sent a
        // request" hatası alıyordu.
        const staleBeforeMatch = existing?.status === 'PENDING' && subSlotOpenForRequest;
        if (existing && existing.status !== 'REJECTED' && !staleBeforeMatch) {
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
            const userRating = getDisplayRating(userInterest, request.subCategory, isDoublesFormat(request));
            if (effMinRating !== null && userRating < effMinRating)
                return res.status(400).json({ message: `Bu ilan için en az ${effMinRating}★ puan gerekiyor. Sizin puanınız: ${userRating.toFixed(2)}★` });
            if (effMaxRating !== null && userRating > effMaxRating)
                return res.status(400).json({ message: `Bu ilan için en fazla ${effMaxRating}★ puan kabul ediliyor. Sizin puanınız: ${userRating.toFixed(2)}★` });
        }

        const joiningTeam = Array.isArray(req.body.joiningTeam) ? req.body.joiningTeam : [];
        // Kullanıcı isteği: voleybolde katılım isteği gönderirken (öncelik sırasıyla) hangi
        // pozisyonda oynamak istediğini belirtebilsin — ilan sahibi İstekler listesinde bunu
        // görüp kabul/red kararını buna göre versin. Sadece voleybol + geçerli pozisyon kodları.
        const VALID_POSITIONS = ['SETTER', 'SPIKER', 'LIBERO'];
        const positionPreferences = request.subCategory === 'volleyball' && Array.isArray(req.body.positionPreferences)
            ? req.body.positionPreferences.filter(p => VALID_POSITIONS.includes(p)).slice(0, 3)
            : undefined;

        // Voleybol "Rakip Aranıyor" (PLAYER_WANTED, teamSize>1): tek başına katılım kapalı —
        // başvuran kendi tam takımını (teamSize ana + substituteCount yedek) tek seferde
        // göndermek zorunda. Diğer joiningTeam gönderenler (futbol COMPETITIVE web akışı)
        // bu koşula hiç girmediği için etkilenmiyor.
        let resolvedJoiningTeam = joiningTeam;
        let teamAvgForNotif = null;
        if (request.subCategory === 'volleyball' && request.matchType === 'PLAYER_WANTED' && (request.teamSize || 1) > 1) {
            if (joiningTeam.length === 0) {
                return res.status(400).json({ message: 'Bu ilana tek başına katılamazsınız — kendi takımınızı doldurup başvurmalısınız.' });
            }
            const mainEntries = joiningTeam.filter(m => m && !m.isSubstitute);
            const subEntries = joiningTeam.filter(m => m && m.isSubstitute);
            if (mainEntries.length !== request.teamSize) {
                return res.status(400).json({ message: `Takımınız tam ${request.teamSize} kişi olmalı.` });
            }
            if (subEntries.length !== (request.substituteCount || 0)) {
                return res.status(400).json({ message: `Bu ilan ${request.substituteCount || 0} yedek gerektiriyor — kadronuzdaki yedek sayısı eşleşmiyor.` });
            }
            const { resolvedMembers, error } = await resolveAndValidateTeam(request, joiningTeam, req.userId);
            if (error) return res.status(400).json({ message: error });
            resolvedJoiningTeam = resolvedMembers;
            const ratings = resolvedMembers.filter(m => !m.isSubstitute && m.skillRating != null).map(m => m.skillRating);
            teamAvgForNotif = ratings.length > 0 ? ratings.reduce((s, r) => s + r, 0) / ratings.length : null;
        }

        let partnerId = req.body.partnerId || null;
        if (partnerId) {
            if (request.matchType !== 'DOUBLE') return res.status(400).json({ message: 'Partner seçimi sadece çiftler ilanlarında mümkün' });
            if (partnerId === req.userId) return res.status(400).json({ message: 'Kendinizi partner olarak seçemezsiniz' });
        }

        // Çiftler: Takım Değiştirilemez (STRICT) ilanlarda başvuran en baştan hangi tarafa
        // (kurucu takımı / rakip takımı) katılmak istediğini seçmek ZORUNDA — sonradan "Takımları
        // Düzenle" ile düzeltilemez. Esnek (FLEXIBLE) ilanlarda ise seçim ZORUNLU değil (eski
        // davranış — boş bırakılırsa "Atanmamış" havuzuna düşer, owner ya da oyuncunun kendisi
        // sonradan assignDoubleSlot ile yerleştirir) ama kullanıcı isteğiyle artık başvuru
        // sırasında da doğrudan bir slot seçilebiliyor (kadro kartındaki boş bir formaya
        // dokunarak — bkz. mobil RivalDetailModal SlotBox'taki yeni "Bu Slota Başvur").
        let requestedSlot = null;
        const isStrictDouble = request.matchType === 'DOUBLE' && request.teamFlexibility === 'STRICT';
        // STRICT'te seçim ZORUNLU (eski davranış — takas kapalı olduğu için baştan seçilmezse
        // sonradan asla düzeltilemez). FLEXIBLE'da ise SADECE gönderildiyse işlenir, boş
        // bırakılırsa eski "Atanmamış" akışına düşer (aşağıdaki requestedSlot===null yolu).
        if (request.matchType === 'DOUBLE' && !partnerId && (isStrictDouble || req.body.requestedSlot)) {
            requestedSlot = req.body.requestedSlot;
            const validChoices = isStrictDouble ? ['partner', 'opp1', 'opp2', 'opponent'] : ['partner', 'opp1', 'opp2'];
            if (!validChoices.includes(requestedSlot)) {
                return res.status(400).json({ message: isStrictDouble ? 'Bu maçta takım değiştirilemiyor — lütfen hangi slota katılmak istediğinizi seçin.' : 'Geçersiz slot seçimi.' });
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
        if (existing?.status === 'REJECTED' || staleBeforeMatch) {
            // Reddedilen isteği yeniden PENDING yap — createdAt de sıfırlanır, yoksa eski
            // (reddedilen/geri çekilen) başvurunun tarihi kalır ve owner isteği dakikalar
            // içinde onaylasa bile respondToJoin'deki "1 saatten eski mi" kontrolü bu eski
            // tarihe bakıp yanlışlıkla "geç kabul" (joiner'a son onay sorusu) akışına sokar.
            await prisma.rivalJoinRequest.update({
                where: { rivalId_userId: { rivalId: id, userId: req.userId } },
                data: { status: 'PENDING', joiningTeam: resolvedJoiningTeam, partnerId, requestedSlot, offerPrice: offerPrice || null, offerMessage: offerMessage || null, offerCvUrl: offerCvUrl || null, createdAt: new Date(), ...(subSlotOpenForRequest && { isSubstituteInvite: true }), ...(positionPreferences !== undefined && { positionPreferences: positionPreferences.length > 0 ? positionPreferences : null }) },
            });
        } else {
            await prisma.rivalJoinRequest.create({ data: { rivalId: id, userId: req.userId, joiningTeam: resolvedJoiningTeam, partnerId, requestedSlot, offerPrice: offerPrice || null, offerMessage: offerMessage || null, offerCvUrl: offerCvUrl || null, ...(subSlotOpenForRequest && { isSubstituteInvite: true }), ...(positionPreferences?.length > 0 && { positionPreferences }) } });
        }

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: SENDER_SELECT });

        // Push updated rival data (with new join request) to everyone viewing this listing —
        // other solo joiners need to see this in real-time too (çiftler takım kartları).
        let updatedRival = await prisma.activityRequest.findUnique({
            where: { id },
            include: {
                // where filtresi ÖNEMLİ — filtresiz interests select'i, birden fazla spor
                // ilgisi olan bir kurucunun derece puanının ilgisiz bir daldaki (ör.
                // tenis/padel) puanla anlık olarak yer değiştirip görünmesine sebep oluyordu
                // (kullanıcı raporu: "bir anda 3.40 oldu, 20-30 saniye sonra 1.26'ya döndü" —
                // bu uç nokta socket'le CANLI yayınlandığı için (ör. bir demo bot katılım
                // isteği gönderince) hata anlık ama görünür oluyordu).
                sender: { select: { ...SENDER_SELECT, interests: { where: { category: request.category, subCategory: request.subCategory }, select: { level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true } } } },
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { where: { category: request.category, subCategory: request.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } } },
            },
        });
        // UTR-tipi dallarda (tenis/padel) participants/senderTeam/unassignedPlayers içindeki
        // skillRating anlık davet geldiğinde eksik/bayat kalıp ELO rozetinin kaybolmasına ve
        // bununla birlikte üst bilgi satırının (mod/tarih/saat/konum/fiyat) sola kayıp
        // sıkışmasına sebep oluyordu — respondToJoin/updateRivalRequest'teki gibi burada da
        // yayından önce zenginleştirilmesi gerekiyor.
        updatedRival = await enrichRivalWithRatings(updatedRival);
        broadcast('rivalUpdate', updatedRival);

        // Kullanıcı isteği: uygulamanın tamamı Türkçe metin kullanıyor — bu mesaj yanlışlıkla
        // İngilizce yazılmış kalmıştı ("maça katılınca İngilizce geliyor").
        res.status(201).json({ message: '✓ Katılım isteği gönderildi! İlan sahibinin onayı bekleniyor.' });

        const isRefereeAd = Array.isArray(request.positions) && request.positions.includes('REFEREE');
        createNotification(
            request.senderId,
            'RIVAL_JOIN_REQUEST',
            isRefereeAd ? '🟨 Yeni Hakemlik Başvurusu' : (teamAvgForNotif != null ? '📥 Bir Takımdan Başvuru' : '📥 Yeni Katılım İsteği'),
            isRefereeAd
                ? `${me?.fullName || me?.username || 'Biri'}, "${subCategoryTR(request.subCategory)}" maçınız için hakemlik başvurusu gönderdi.`
                : teamAvgForNotif != null
                    ? `${me?.fullName || me?.username || 'Biri'} takımıyla (Ort ${teamAvgForNotif.toFixed(2)}★) "${subCategoryTR(request.subCategory)}" ilanınıza başvurdu.`
                    : `${me?.fullName || me?.username || 'Biri'}, "${subCategoryTR(request.subCategory)}" ilanınıza katılmak istiyor.`,
            // Hakem başvurusunda bildirim, bağlı bir maç varsa asıl maça yönlendirir — başvurular
            // orada "Hakem Başvuruları" bölümünde görünür. Bağımsız hakem ilanıysa (eski akış)
            // ilanın kendisine, Hakemler sekmesi üzerinden.
            { rivalId: isRefereeAd ? (request.linkedRivalId || id) : id, category: request.category, subCategory: request.subCategory, ...(isRefereeAd && !request.linkedRivalId && { refereeAd: true }) }
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

        let updatedRival = await prisma.activityRequest.findUnique({
            where: { id: joinReq.rivalId },
            include: {
                // where filtresi ÖNEMLİ — bkz. sendJoinRequest'teki aynı düzeltmenin yorumu.
                sender: { select: { ...SENDER_SELECT, interests: { where: { category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }, select: { level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true } } } },
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { where: { category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } } },
            },
        });
        updatedRival = await enrichRivalWithRatings(updatedRival);
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

        let updatedRival = await prisma.activityRequest.findUnique({
            where: { id },
            include: {
                // where filtresi ÖNEMLİ — bkz. sendJoinRequest'teki aynı düzeltmenin yorumu.
                sender: { select: { ...SENDER_SELECT, interests: { where: { category: request.category, subCategory: request.subCategory }, select: { level: true, skillRating: true, totalPoints: true, wins: true, losses: true, assessmentCompleted: true } } } },
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { where: { category: request.category, subCategory: request.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } } },
            },
        });
        updatedRival = await enrichRivalWithRatings(updatedRival);
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
// side (opsiyonel): 'my' | 'opp' — takım sporlarında (voleybol/airsoft) kadro kartından
// doğrudan Kurucu/Rakip Takım'a davet göndermek için. Kullanıcı isteğiyle bu, ilan
// oluştururken bir isim yazıp davet etmekle AYNI mantık — sadece ilan zaten var (açık
// ya da eşleşmiş) ve davet doğrudan o slota gidiyor, kabul edilince atanmamış havuzuna
// değil doğrudan o takıma düşüyor (bkz. respondToJoin'deki isPartnerInvite/isOppTeamInvite).
export const inviteToRival = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { userId, side, slotIndex, slot } = req.body; // slotIndex: kadro kartında hangi sıradaki forma yazıldıysa (0-index) — kabul edilince kişi o pozisyona yerleşir. slot: SADECE DOUBLE — 'partner'|'opp1'|'opp2', Digimon kart benzeri boş formadan doğrudan davet için (bkz. UpcomingCard/CreateRivalModal DoubleRosterCard).
        if (!userId) return res.status(400).json({ message: 'userId required' });
        if (side !== undefined && side !== null && !['my', 'opp'].includes(side)) return res.status(400).json({ message: 'Geçersiz taraf' });
        if (slot !== undefined && slot !== null && !['partner', 'opp1', 'opp2'].includes(slot)) return res.status(400).json({ message: 'Geçersiz slot' });

        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const isTeamSlotInvite = (side === 'my' || side === 'opp') && ['volleyball', 'airsoft'].includes(rival.subCategory) && (rival.teamSize || 1) > 1;
        // isTeamSlotInvite'tan bilerek AYRI/bağımsız — voleybol/airsoft'un side/slotIndex mantığına
        // hiç dokunmadan DOUBLE'a (tenis/padel 2v2) forma-özel davet ekliyor (kullanıcı isteği:
        // DOUBLE de Digimon kart'taki gibi boş formadan davet edilebilsin).
        const isDoubleSlotInvite = rival.matchType === 'DOUBLE' && !!slot;
        const isRefereeAd = Array.isArray(rival.positions) && rival.positions.includes('REFEREE');

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
        if (isTeamSlotInvite) {
            // Kadro kartından doğrudan takıma davet — sadece ilan sahibi yapabilir, maç zaten
            // eşleşmiş (MATCHED) olsa bile hedef tarafta boş kontenjan varsa hâlâ mümkün
            // (Yaklaşan Maçlar'daki kadro kartı da bu uç noktayı kullanıyor).
            if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi doğrudan takıma davet edebilir' });
            const teamSizeN = rival.teamSize || 1;
            if (side === 'my' && senderTeamArr.length >= teamSizeN - 1) return res.status(400).json({ message: 'Kurucu Takımı zaten dolu.' });
            if (side === 'opp' && participants.filter(p => p?.id || p?.manualName).length + (Array.isArray(rival.oppTeamManualNames) ? rival.oppTeamManualNames.length : 0) >= teamSizeN) {
                return res.status(400).json({ message: 'Rakip Takımı zaten dolu.' });
            }
        } else if (isDoubleSlotInvite) {
            // DOUBLE Digimon kart — boş formadan doğrudan davet, sadece ilan sahibi. Doluluk +
            // cinsiyet kontrolü assignDoubleSlot'takiyle BİREBİR aynı (bkz. assignDoubleSlot,
            // ~4750) — aynı forma-özel kural iki yerde de tutarlı kalsın diye.
            if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi doğrudan slota davet edebilir' });
            const gReq = slot === 'partner' ? rival.partnerGenderReq : slot === 'opp1' ? rival.opp1GenderReq : rival.opp2GenderReq;
            const occupant = slot === 'partner' ? senderTeamArr[0] : slot === 'opp1' ? participants[0] : participants[1];
            if (occupant?.id) {
                return res.status(400).json({ message: `${slot === 'partner' ? 'Takım Arkadaşı' : slot === 'opp1' ? 'Rakip 1' : 'Rakip 2'} slotu zaten dolu` });
            }
            if (gReq && gReq !== 'MIX') {
                const gUser = await prisma.user.findUnique({ where: { id: userId }, select: { gender: true } });
                if (gUser?.gender !== 'OTHER') {
                    if (!gUser?.gender) return res.status(400).json({ message: 'Bu oyuncunun profilinde cinsiyet bilgisi girilmemiş, bu yüzden cinsiyete özel bir slota davet edilemiyor.' });
                    if (gUser.gender !== gReq) return res.status(400).json({ message: `Bu slot için ilan yalnızca ${gReq === 'MALE' ? 'erkek' : 'kadın'} oyuncular kabul ediyor.` });
                }
            }
        } else if (isRefereeAd) {
            // Kullanıcı isteği: hakem ilanına bir hakem zaten kabul edilmiş (status artık
            // MATCHED) olsa bile yedek/değiştirme amacıyla başka bir hakem davet edilebilsin —
            // ilan sahibi/katılımcılar "bu ilan artık açık değil" hatasıyla engellenmemeli.
            // Kabul edilirse respondToJoin zaten mevcut hakemin yerine yenisini yazıyor.
        } else if (rival.status !== 'OPEN') {
            return res.status(400).json({ message: 'Bu ilan artık açık değil' });
        }
        if (userId === req.userId) return res.status(400).json({ message: 'Kendinizi davet edemezsiniz' });

        if (participants.some(p => p?.id === userId) || senderTeamArr.some(p => p?.id === userId)) {
            return res.status(400).json({ message: 'Bu kullanıcı zaten maça katılmış' });
        }
        // Kullanıcı isteği: maçın onaylı hakemi aynı zamanda oyuncu olarak davet edilemez —
        // yedek sırasındaki (refereeQueue) biri için bu kısıtlama yok.
        if (!isRefereeAd && rival.refereeId === userId) {
            return res.status(400).json({ message: 'Bu kullanıcı maçın hakemi, aynı zamanda oyuncu olarak davet edilemez.' });
        }

        const existing = await prisma.rivalJoinRequest.findUnique({
            where: { rivalId_userId: { rivalId: id, userId } },
        });
        if (existing && existing.status !== 'REJECTED') {
            return res.status(400).json({ message: 'Bu kullanıcıya zaten bir istek/davet gönderilmiş', status: existing.status });
        }

        // Kullanıcı isteği: ilan sahibi kendi koyduğu derece (ELO) kısıtlamasına uymayan birini
        // davet etmeye çalışırsa, davet backend'e gitmeden/gönderilmeden hemen reddedilsin —
        // aynı kontrol createRivalRequest/updateRivalRequest'te ilan sahibinin KENDİ puanı için
        // zaten var (bkz. getDisplayRating/isDoublesFormat), burada davet edilen kişinin puanına
        // uygulanıyor. Hakem ilanlarında (isRefereeAd) derece kısıtlaması anlamsız, atlanır.
        if (!isRefereeAd) {
            const inviteeIsDoubles = isDoublesFormat(rival);
            let effMin = null, effMax = null;
            if (rival.ratingGenderSplit) {
                const inviteeUser = await prisma.user.findUnique({ where: { id: userId }, select: { gender: true } });
                if (inviteeUser?.gender === 'MALE') { effMin = rival.minRatingMale; effMax = rival.maxRatingMale; }
                else if (inviteeUser?.gender === 'FEMALE') { effMin = rival.minRatingFemale; effMax = rival.maxRatingFemale; }
            } else {
                effMin = rival.minRating; effMax = rival.maxRating;
            }
            if (effMin != null || effMax != null) {
                const inviteeInterest = await prisma.userInterest.findFirst({ where: { userId, category: rival.category, subCategory: rival.subCategory } });
                const inviteeRating = getDisplayRating(inviteeInterest, rival.subCategory, inviteeIsDoubles);
                if (effMin != null && inviteeRating < effMin) {
                    return res.status(400).json({ message: `Yolladığınız kişinin derece puanı (${inviteeRating.toFixed(2)}★) belirlemiş olduğunuz derece kısıtlamasına (en az ${effMin}★) uymamaktadır.` });
                }
                if (effMax != null && inviteeRating > effMax) {
                    return res.status(400).json({ message: `Yolladığınız kişinin derece puanı (${inviteeRating.toFixed(2)}★) belirlemiş olduğunuz derece kısıtlamasına (en fazla ${effMax}★) uymamaktadır.` });
                }
            }
        }

        // Kullanıcı isteği: hakem ilanına sadece bu dalda aktif bir hakem kaydı (RefereeListing)
        // olan kişi davet edilebilsin/atanabilsin — arama zaten sadece kayıtlıları öneriyor
        // (bkz. searchUsers refereeOnly), burası doğrudan API çağrısıyla atlatılmasını önler.
        if (isRefereeAd) {
            const refApprovalRequired = ['volleyball', 'tennis', 'padel'].includes(rival.subCategory);
            const refListing = await prisma.refereeListing.findFirst({
                where: { userId, subCategory: rival.subCategory, category: rival.category, status: 'ACTIVE', ...(refApprovalRequired && { approved: true }) },
            });
            if (!refListing) return res.status(400).json({ message: refApprovalRequired ? 'Bu kullanıcının onaylı bir hakem kaydı yok, hakem olarak davet edilemez.' : 'Bu kullanıcının bu dalda aktif bir hakem kaydı yok, hakem olarak davet edilemez.' });
        }

        const teamSlotFlags = isTeamSlotInvite
            ? { ...(side === 'my' ? { isPartnerInvite: true } : { isOppTeamInvite: true }), slotIndex: Number.isInteger(slotIndex) ? slotIndex : null }
            : {};
        // DOUBLE'da partner, voleybol'un Kurucu Takım daveti ile AYNI kabul mekanizmasını
        // (isPartnerInvite, bkz. respondToJoin) kullanıyor — ekstra kod gerekmiyor. opp1/opp2 için
        // requestedSlot yeniden kullanılıyor ('partner'/'opponent' — JOINER+STRICT başvurusu —
        // ile asla çakışmıyor, çünkü initiatedBy burada her zaman 'OWNER' ve yazım farklı).
        const doubleSlotFlags = isDoubleSlotInvite
            ? (slot === 'partner' ? { isPartnerInvite: true } : { requestedSlot: slot })
            : {};
        if (existing) {
            await prisma.rivalJoinRequest.update({
                where: { rivalId_userId: { rivalId: id, userId } },
                data: { status: 'PENDING', initiatedBy: 'OWNER', joiningTeam: [], isPartnerInvite: false, isOppTeamInvite: false, isSubstituteInvite: false, isUnassignedInvite: false, requestedSlot: null, ...teamSlotFlags, ...doubleSlotFlags },
            });
        } else {
            await prisma.rivalJoinRequest.create({ data: { rivalId: id, userId, initiatedBy: 'OWNER', ...teamSlotFlags, ...doubleSlotFlags } });
        }

        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: SENDER_SELECT });

        const teamInviteEmoji = rival.subCategory === 'airsoft' ? '🪖' : '🏐';
        const doubleSlotLabel = slot === 'partner' ? 'Takım Arkadaşı' : slot === 'opp1' ? 'Rakip 1' : 'Rakip 2';
        // Takım Değişikliği kapalıysa (STRICT) davet edilen kişi bu pozisyonun değişmeyeceğini de
        // görsün (kullanıcı isteği).
        const doubleStrictNote = isDoubleSlotInvite && rival.teamFlexibility === 'STRICT' ? ' Takım değişikliği kapalı, bu pozisyonda kalacaksınız.' : '';
        createNotification(
            userId, 'MATCH_INVITE',
            isRefereeAd ? '🟨 Hakemlik Daveti'
                : isTeamSlotInvite ? `${teamInviteEmoji} ${subCategoryTR(rival.subCategory)} ${side === 'my' ? 'Takım' : 'Maç'} Daveti`
                : isDoubleSlotInvite ? `🎾 ${doubleSlotLabel} Daveti`
                : `🎾 ${subCategoryTR(rival.subCategory)} Maç Daveti`,
            isRefereeAd ? `@${me?.username} sizi maçında hakemlik yapmaya davet etti.`
                : isTeamSlotInvite ? `@${me?.username} sizi ${side === 'my' ? 'Kurucu Takım' : 'Rakip Takım'}'a davet etti.`
                : isDoubleSlotInvite ? `@${me?.username} sizi ${doubleSlotLabel} olmaya davet etti.${doubleStrictNote}`
                : `@${me?.username} sizi bir maça davet etti.`,
            {
                category: rival.category, subCategory: rival.subCategory,
                // Kullanıcı isteği: hakemlik daveti bağlı bir maça aitse (linkedRivalId) bildirim
                // Hakemler sekmesine değil DOĞRUDAN o maçın detayına yönlendirmeli — kabul/red
                // orada "Hakem Başvuruları" bölümünden yapılabiliyor (bkz. sendJoinRequest'teki
                // aynı desen). Bağımsız bir hakem ilanıysa (linkedRivalId yok) eskisi gibi
                // Hakemler sekmesine gider.
                rivalId: isRefereeAd ? (rival.linkedRivalId || rival.id) : rival.id,
                ...(isRefereeAd && !rival.linkedRivalId && { refereeAd: true }),
                // Bildirime tıklayınca kadro kartının arka yüzü hangi slotu vurgulayarak
                // açılsın diye (bkz. mobil navigateFromNotif) — sadece doğrudan slota
                // davet edildiyse (isTeamSlotInvite/isDoubleSlotInvite) anlamlı.
                ...(isTeamSlotInvite && { inviteSide: side, inviteSlotIndex: Number.isInteger(slotIndex) ? slotIndex : null }),
                ...(isDoubleSlotInvite && { inviteDoubleSlot: slot }),
            }
        ).catch(() => {});

        let updatedRival = await prisma.activityRequest.findUnique({
            where: { id },
            include: {
                // where filtresi ÖNEMLİ — bkz. sendJoinRequest'teki aynı düzeltmenin yorumu.
                sender: { select: { ...SENDER_SELECT, interests: { where: { category: rival.category, subCategory: rival.subCategory }, select: { level: true, totalPoints: true, wins: true, losses: true, alias: true } } } },
                joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { where: { category: rival.category, subCategory: rival.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } } },
            },
        });
        updatedRival = await enrichRivalWithRatings(updatedRival);
        emitToUser(userId, 'rivalUpdate', updatedRival);

        res.status(201).json({ message: 'Davet gönderildi.', request: updatedRival });
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
        // Kullanıcı raporu: ilan sahibi "Gönderilen Davetler"den kendi gönderdiği bir daveti
        // ✕ ile geri çekmek istediğinde her zaman "Forbidden" dönüyordu — responder SADECE
        // daveti ALAN kişiydi, daveti GÖNDEREN sahibin reddetmesi (=geri çekmesi) hiç
        // düşünülmemişti. accept dışındaki aksiyonlarda (reject/geri çekme) sahibin kendi
        // gönderdiği daveti iptal edebilmesi de izin veriliyor.
        const isOwnerWithdrawingOwnInvite = action !== 'accept' && joinReq.initiatedBy === 'OWNER' && joinReq.rival.senderId === req.userId;
        if (responder !== req.userId && !isOwnerWithdrawingOwnInvite) return res.status(403).json({ message: 'Forbidden' });

        // İdempotentlik: aynı istek zaten işlenmişse (çift dokunma / ağ tekrar denemesi) yeniden
        // işlenip tekrar tekrar bildirim gönderilmesin — bir isteğe bir kez yanıt verilebilir.
        if (joinReq.status !== 'PENDING') return res.status(400).json({ message: 'Bu istek zaten yanıtlanmış' });

        // Kullanıcı raporu: bir kullanıcıyı bu spor dalındaki takma ismiyle (ör. "luckymonkey")
        // davet ettiğinde bile, "davetinizi kabul etti/reddetti" bildirimi gerçek isim/kullanıcı
        // adını gösteriyordu — mobildeki playerDisplayName ile aynı öncelik (alias varsa alias)
        // aşağıdaki bildirim metinlerinde de uygulanır.
        const joinerInterestForAlias = await prisma.userInterest.findFirst({
            where: { userId: joinReq.userId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory },
            select: { alias: true },
        });
        const joinerDisplayName = joinerInterestForAlias?.alias || joinReq.user.username;

        if (action !== 'accept') {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });

            // İlan sahibi kendi gönderdiği daveti geri çekiyor — davet edilen kişiye anında
            // "davet kalktı" sinyali gider (sanki hiç gönderilmemiş gibi), ama sahibe kendi
            // eylemi için "reddetti" diyen yanlış bir bildirim gitmez.
            if (isOwnerWithdrawingOwnInvite) {
                emitToUser(joinReq.userId, 'joinRejected', { rivalId: joinReq.rivalId });
                return res.json({ message: 'Davetiniz geri çekildi.' });
            }

            // Reddedildiğini diğer tarafa bildir — katıl/davet butonu geri açılsın
            const notifyTargetId = joinReq.initiatedBy === 'OWNER' ? joinReq.rival.senderId : joinReq.userId;
            emitToUser(notifyTargetId, 'joinRejected', { rivalId: joinReq.rivalId });
            // Owner'ın gönderdiği davet (partner/rakip 1/rakip 2) reddedildiyse ilan sahibine kalıcı bildirim gönder
            if (joinReq.initiatedBy === 'OWNER') {
                const roleLabel = joinReq.isPartnerInvite ? 'Partner' : joinReq.isSubstituteInvite ? 'Yedek' : 'Maça';
                createNotification(
                    joinReq.rival.senderId, 'MATCH_INVITE_DECLINED',
                    '❌ Davet Reddedildi',
                    `@${joinerDisplayName} ${roleLabel} davetinizi reddetti.`,
                    { category: joinReq.rival.category, subCategory: joinReq.rival.subCategory, rivalId: joinReq.rivalId }
                ).catch(() => {});
                emitToUser(joinReq.rival.senderId, 'notification', {
                    type: 'MATCH_INVITE_DECLINED', title: '❌ Davet Reddedildi',
                    body: `@${joinerDisplayName} ${roleLabel} davetinizi reddetti.`,
                    data: { category: joinReq.rival.category, subCategory: joinReq.rival.subCategory, rivalId: joinReq.rivalId },
                });
            }
            return res.json({ message: 'Request rejected.' });
        }

        // Partner daveti kabul: senderTeam'e ekle, participants'a değil
        if (joinReq.isPartnerInvite) {
            // Kullanıcı isteği (tenis/padel): partner slotu kendisi hâlâ boş görünse bile,
            // kadro BAŞKA yollarla (ör. unassignedPlayers dolarak) zaten tamamlanmış olabilir —
            // bu durumda partner slotuna 5. kişi olarak yerleştirmek yerine yedek listesine
            // düşürülür (bkz. isDoubleOrSingleRosterFull/placeInDoubleWaitlistOrReject).
            if (isDoubleOrSingleRosterFull(joinReq.rival)) {
                const waitlistEntry = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar, gender: joinReq.user.gender, alias: joinerInterestForAlias?.alias || null };
                await placeInDoubleWaitlistOrReject(joinReq.rival, joinReq, waitlistEntry, requestId, res);
                return;
            }
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
            // gender de snapshot'a eklendi — DOUBLE'da "Atanmamış" listesindeki atama
            // butonlarının cinsiyete uymayan slotları hiç göstermemesi için (bkz. mobil
            // openSlotOptions/genderFitsSlot) — önceden bu bilgi hiç taşınmıyordu, bu yüzden
            // örn. erkek bir oyuncuya kadın-kısıtlı bir slot seçenek olarak sunulup "zaten dolu"
            // gibi alakasız bir hatayla reddediliyordu (asıl sebep cinsiyetti, doluluk değildi).
            const joinerData = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar, gender: joinReq.user.gender, alias: joinerInterestForAlias?.alias || null };
            // DOUBLE'da (tenis/padel) senderTeam zaten tek partnerle sınırlı ve boştan
            // başlıyordu — ekleme=değiştirme, davranış değişmiyor. Voleybolde ise kurucu
            // takıma birden fazla kişi davet edilebildiği için mevcut diziye EKLENİR,
            // üzerine YAZILMAZ. Davet kadro kartında belirli bir forma yazıldıysa (slotIndex)
            // dizinin sonuna değil tam o pozisyona yerleşir — önceden hep sona ekleniyordu, bu
            // da "6. forma yazdım ama 1. sıraya gitti" şikayetine yol açıyordu.
            const existingSenderTeam = Array.isArray(joinReq.rival.senderTeam) ? joinReq.rival.senderTeam : [];
            const updatedSenderTeamArr = setAtFounderSlot(existingSenderTeam, joinReq.slotIndex, joinerData);
            // Takım başına min. cinsiyet kontrolü — join request'i ACCEPTED işaretlemeden ÖNCE
            // yapılır, aksi halde reddedilince "kabul edildi ama kadroya hiç eklenmedi" gibi
            // tutarsız bir ara duruma düşülüyordu.
            const perTeamGenderError = await perTeamGenderFeasible(joinReq.rival, 'my', updatedSenderTeamArr);
            if (perTeamGenderError) return res.status(400).json({ message: perTeamGenderError });
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
            // BUG (kullanıcı raporu): "4/4 oldu ama Yaklaşan Maçlar'a geçmedi" — bu dal SADECE
            // senderTeam'i güncelliyordu, kadronun (kurucu+senderTeam+participants+unassignedPlayers)
            // toplamda tamamlanıp tamamlanmadığına HİÇ bakmıyordu, "matched: false" sabitti. Partner
            // daveti, roster'ı BAŞKA yollarla (ör. participants/unassignedPlayers) zaten dolmuş bir
            // ilanda TAMAMLAYAN son kabul olabilir — bkz. opp1/opp2 DOUBLE dalındaki aynı hesap.
            const isFullNow = 1
                + (Array.isArray(updatedSenderTeamArr) ? updatedSenderTeamArr.filter(p => p?.id).length : 0)
                + (Array.isArray(joinReq.rival.participants) ? joinReq.rival.participants.filter(p => p?.id).length : 0)
                + (Array.isArray(joinReq.rival.unassignedPlayers) ? joinReq.rival.unassignedPlayers.filter(p => p?.id).length : 0) >= 4;
            let updatedRival = await prisma.activityRequest.update({
                where: { id: joinReq.rivalId },
                data: { senderTeam: updatedSenderTeamArr, ...(isFullNow && { status: 'MATCHED', receiverId: joinReq.userId, reopenedAt: null }) },
                include: {
                    sender: { select: SENDER_SELECT },
                    joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { where: { category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } } },
                },
            });
            updatedRival = await enrichRivalWithRatings(updatedRival);
            broadcast('rivalUpdate', updatedRival); // (kullanıcı isteği: davet/kabul güncellemesini sadece ilan sahibine değil, ilanı görüntüleyen herkese anında yansıt)
            emitToUser(joinReq.userId, 'joinAccepted', { rivalId: joinReq.rivalId, matched: isFullNow });
            createNotification(
                joinReq.rival.senderId, 'MATCH_CONFIRMED',
                '🤝 Partner Kabul Etti',
                `${joinerDisplayName} çiftler takımınıza katılmayı kabul etti.${isFullNow ? ' Maç doldu!' : ''}`,
                { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            if (isFullNow) notifyOtherPendingOwnerInvitesOfFull(joinReq.rivalId, joinReq.rival.category, joinReq.rival.subCategory, [joinReq.userId], joinReq.rival.matchType);
            return res.json({ message: 'Partner daveti kabul edildi.', request: updatedRival, matched: isFullNow });
        }

        // Rakip Takım daveti kabul: participants'a DOĞRUDAN eklenir (atanmamış havuzuna değil)
        // — ilan sahibi bilerek bu kişiyi Rakip Takım'a davet etmişti (bkz. inviteToRival'daki
        // isTeamSlotInvite). Kapasite (teamSize) burada da kontrol edilir; kabul maçı
        // tamamlıyorsa MATCHED'e geçirir.
        if (joinReq.isOppTeamInvite) {
            const teamSizeN = joinReq.rival.teamSize || 1;
            const existingParticipants = Array.isArray(joinReq.rival.participants) ? joinReq.rival.participants : [];
            const legacyOppManualCount = Array.isArray(joinReq.rival.oppTeamManualNames) ? joinReq.rival.oppTeamManualNames.length : 0;
            if (existingParticipants.filter(p => p?.id || p?.manualName).length + legacyOppManualCount >= teamSizeN) {
                await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
                emitToUser(joinReq.userId, 'joinRejected', { rivalId: joinReq.rivalId });
                return res.status(400).json({ message: 'Rakip Takımı zaten dolu.' });
            }
            // gender de snapshot'a eklendi — DOUBLE'da "Atanmamış" listesindeki atama
            // butonlarının cinsiyete uymayan slotları hiç göstermemesi için (bkz. mobil
            // openSlotOptions/genderFitsSlot) — önceden bu bilgi hiç taşınmıyordu, bu yüzden
            // örn. erkek bir oyuncuya kadın-kısıtlı bir slot seçenek olarak sunulup "zaten dolu"
            // gibi alakasız bir hatayla reddediliyordu (asıl sebep cinsiyetti, doluluk değildi).
            const joinerData = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar, gender: joinReq.user.gender, alias: joinerInterestForAlias?.alias || null };
            // Davet kadro kartında belirli bir forma yazıldıysa (slotIndex) tam o pozisyona
            // yerleşir, dizinin sonuna değil.
            const updatedParticipantsArr = setAtSlot(existingParticipants, joinReq.slotIndex, joinerData);
            // Takım başına min. cinsiyet kontrolü — join request'i ACCEPTED işaretlemeden ÖNCE
            // yapılır, aksi halde reddedilince "kabul edildi ama kadroya hiç eklenmedi" gibi
            // tutarsız bir ara duruma düşülüyordu.
            const perTeamGenderError = await perTeamGenderFeasible(joinReq.rival, 'opp', updatedParticipantsArr);
            if (perTeamGenderError) return res.status(400).json({ message: perTeamGenderError });
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
            const isFullNow = teamSizeN > 1
                ? teamFilledCount(joinReq.rival, { participants: updatedParticipantsArr }) >= totalPlayerCount(joinReq.rival)
                : false;
            let updatedRival = await prisma.activityRequest.update({
                where: { id: joinReq.rivalId },
                data: {
                    participants: updatedParticipantsArr,
                    ...(isFullNow && { status: 'MATCHED', receiverId: joinReq.userId, reopenedAt: null }),
                },
                include: {
                    sender: { select: SENDER_SELECT },
                    joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { where: { category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } } },
                },
            });
            updatedRival = await enrichRivalWithRatings(updatedRival);
            broadcast('rivalUpdate', updatedRival); // (kullanıcı isteği: davet/kabul güncellemesini sadece ilan sahibine değil, ilanı görüntüleyen herkese anında yansıt)
            emitToUser(joinReq.userId, 'joinAccepted', { rivalId: joinReq.rivalId, matched: isFullNow });
            createNotification(
                joinReq.rival.senderId, 'MATCH_CONFIRMED',
                '⚔️ Rakip Takım Daveti Kabul Edildi',
                `${joinerDisplayName} Rakip Takım'a katılmayı kabul etti.${isFullNow ? ' Maç doldu!' : ''}`,
                { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            if (isFullNow) notifyOtherPendingOwnerInvitesOfFull(joinReq.rivalId, joinReq.rival.category, joinReq.rival.subCategory, [joinReq.userId], joinReq.rival.matchType);
            return res.json({ message: 'Rakip Takım daveti kabul edildi.', request: updatedRival, matched: isFullNow });
        }

        // DOUBLE Rakip 1/Rakip 2 daveti kabul — inviteToRival'da yazılan requestedSlot='opp1'/'opp2'
        // (initiatedBy==='OWNER') okunur. STRICT joiner akışındaki requestedSlot='partner'/'opponent'
        // (initiatedBy==='JOINER', bkz. resolveDoubleAcceptance) ile ÇAKIŞMAZ — hem initiatedBy hem
        // yazım farklı. isOppTeamInvite'ı (yukarıdaki blok) kasıtlı olarak yeniden KULLANMIYORUZ —
        // o dal forma-özel cinsiyet kontrolü yapmıyor (voleybol oransal kota kullanıyor), burada ise
        // opp1GenderReq/opp2GenderReq'in atlanması gerçek bir doğruluk hatası olurdu.
        if (joinReq.rival.matchType === 'DOUBLE' && joinReq.initiatedBy === 'OWNER' &&
            (joinReq.requestedSlot === 'opp1' || joinReq.requestedSlot === 'opp2')) {
            const idx = joinReq.requestedSlot === 'opp1' ? 0 : 1;
            const existingParticipants = [
                Array.isArray(joinReq.rival.participants) ? joinReq.rival.participants[0] || null : null,
                Array.isArray(joinReq.rival.participants) ? joinReq.rival.participants[1] || null : null,
            ];
            // Yarış durumu: davetten sonra o slot assignDoubleSlot ya da başka bir kabulle
            // doldurulmuş olabilir — burada yeniden kontrol edilir.
            if (existingParticipants[idx]?.id) {
                await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
                emitToUser(joinReq.userId, 'joinRejected', { rivalId: joinReq.rivalId });
                return res.status(400).json({ message: `${joinReq.requestedSlot === 'opp1' ? 'Rakip 1' : 'Rakip 2'} slotu artık dolu.` });
            }
            // İstenen slotun kendisi boş olsa bile, kadro BAŞKA yollarla (ör. unassignedPlayers
            // dolarak) zaten tamamlanmış olabilir — bkz. isPartnerInvite dalındaki aynı kontrol.
            if (isDoubleOrSingleRosterFull(joinReq.rival)) {
                const waitlistEntry = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar, gender: joinReq.user.gender, alias: joinerInterestForAlias?.alias || null };
                await placeInDoubleWaitlistOrReject(joinReq.rival, joinReq, waitlistEntry, requestId, res);
                return;
            }
            const gReq = joinReq.requestedSlot === 'opp1' ? joinReq.rival.opp1GenderReq : joinReq.rival.opp2GenderReq;
            if (gReq && gReq !== 'MIX') {
                const gUser = await prisma.user.findUnique({ where: { id: joinReq.userId }, select: { gender: true } });
                if (gUser?.gender !== 'OTHER') {
                    if (!gUser?.gender) return res.status(400).json({ message: 'Bu oyuncunun profilinde cinsiyet bilgisi girilmemiş, bu yüzden cinsiyete özel bir slota atanamıyor.' });
                    if (gUser.gender !== gReq) return res.status(400).json({ message: `Bu slot için ilan yalnızca ${gReq === 'MALE' ? 'erkek' : 'kadın'} oyuncular kabul ediyor.` });
                }
            }
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
            // gender de snapshot'a eklendi — DOUBLE'da "Atanmamış" listesindeki atama
            // butonlarının cinsiyete uymayan slotları hiç göstermemesi için (bkz. mobil
            // openSlotOptions/genderFitsSlot) — önceden bu bilgi hiç taşınmıyordu, bu yüzden
            // örn. erkek bir oyuncuya kadın-kısıtlı bir slot seçenek olarak sunulup "zaten dolu"
            // gibi alakasız bir hatayla reddediliyordu (asıl sebep cinsiyetti, doluluk değildi).
            const joinerData = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar, gender: joinReq.user.gender, alias: joinerInterestForAlias?.alias || null };
            existingParticipants[idx] = joinerData;
            const isFull = 1
                + (Array.isArray(joinReq.rival.senderTeam) ? joinReq.rival.senderTeam.filter(p => p?.id).length : 0)
                + existingParticipants.filter(p => p?.id).length
                + (Array.isArray(joinReq.rival.unassignedPlayers) ? joinReq.rival.unassignedPlayers.filter(p => p?.id).length : 0) >= 4;
            let updatedRival = await prisma.activityRequest.update({
                where: { id: joinReq.rivalId },
                data: { participants: existingParticipants, ...(isFull && { status: 'MATCHED', receiverId: joinReq.userId, reopenedAt: null }) },
                include: {
                    sender: { select: SENDER_SELECT },
                    joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: { ...SENDER_SELECT, interests: { where: { category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } } },
                },
            });
            updatedRival = await enrichRivalWithRatings(updatedRival);
            broadcast('rivalUpdate', updatedRival); // (kullanıcı isteği: davet/kabul güncellemesini sadece ilan sahibine değil, ilanı görüntüleyen herkese anında yansıt)
            emitToUser(joinReq.userId, 'joinAccepted', { rivalId: joinReq.rivalId, matched: isFull });
            createNotification(
                joinReq.rival.senderId, 'MATCH_CONFIRMED',
                '⚔️ Davet Kabul Edildi',
                `${joinerDisplayName} ${joinReq.requestedSlot === 'opp1' ? 'Rakip 1' : 'Rakip 2'} olarak katılmayı kabul etti.${isFull ? ' Maç doldu!' : ''}`,
                { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            if (isFull) notifyOtherPendingOwnerInvitesOfFull(joinReq.rivalId, joinReq.rival.category, joinReq.rival.subCategory, [joinReq.userId], joinReq.rival.matchType);
            return res.json({ message: 'Davet kabul edildi.', request: updatedRival, matched: isFull });
        }

        // Yedek daveti kabul: substitutePlayers'a ekle
        if (joinReq.isSubstituteInvite) {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
            // gender de snapshot'a eklendi — DOUBLE'da "Atanmamış" listesindeki atama
            // butonlarının cinsiyete uymayan slotları hiç göstermemesi için (bkz. mobil
            // openSlotOptions/genderFitsSlot) — önceden bu bilgi hiç taşınmıyordu, bu yüzden
            // örn. erkek bir oyuncuya kadın-kısıtlı bir slot seçenek olarak sunulup "zaten dolu"
            // gibi alakasız bir hatayla reddediliyordu (asıl sebep cinsiyetti, doluluk değildi).
            const joinerData = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar, gender: joinReq.user.gender, alias: joinerInterestForAlias?.alias || null };
            const existingSubs = Array.isArray(joinReq.rival.substitutePlayers) ? joinReq.rival.substitutePlayers : [];
            let updatedRival = await prisma.activityRequest.update({
                where: { id: joinReq.rivalId },
                data: { substitutePlayers: [...existingSubs, joinerData] },
                include: {
                    sender: { select: SENDER_SELECT },
                    joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                },
            });
            updatedRival = await enrichRivalWithRatings(updatedRival);
            broadcast('rivalUpdate', updatedRival); // (kullanıcı isteği: davet/kabul güncellemesini sadece ilan sahibine değil, ilanı görüntüleyen herkese anında yansıt)
            emitToUser(joinReq.userId, 'joinAccepted', { rivalId: joinReq.rivalId, matched: false });
            // Bu istek ilan sahibinin daveti (initiatedBy=OWNER) OLABİLİR, ya da oyuncunun kendisinin
            // "Yedek Olarak Başvur" ile gönderdiği bir başvuru (initiatedBy=JOINER, MATCHED bir maça
            // da gönderilebiliyor artık) OLABİLİR — bildirim doğru tarafa, doğru cümleyle gitmeli.
            if (joinReq.initiatedBy === 'JOINER') {
                createNotification(
                    joinReq.userId, 'MATCH_CONFIRMED',
                    '✓ Yedek Başvurun Kabul Edildi',
                    `"${joinReq.rival.sender?.username || 'İlan sahibi'}" seni yedek oyuncu olarak kabul etti.`,
                    { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
                ).catch(() => {});
            } else {
                createNotification(
                    joinReq.rival.senderId, 'MATCH_CONFIRMED',
                    '🪑 Yedek Kabul Etti',
                    `${joinerDisplayName} yedek oyuncu olarak katılmayı kabul etti.`,
                    { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
                ).catch(() => {});
            }
            return res.json({ message: 'Yedek daveti kabul edildi.', request: updatedRival });
        }

        // Hangi takımda oynayacağı belli olmayan davet kabul: unassignedPlayers'a ekle —
        // ilan sahibi ilerde Yaklaşan Maçlar kartından Kurucu/Rakip'e elle atar.
        if (joinReq.isUnassignedInvite) {
            // Kadro BAŞKA yollarla zaten tamamlanmışsa (bkz. isPartnerInvite dalındaki aynı
            // kontrol) bu kabul de yedek listesine düşer, atanmamış havuzuna değil.
            if (isDoubleOrSingleRosterFull(joinReq.rival)) {
                const waitlistEntry = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar, gender: joinReq.user.gender, alias: joinerInterestForAlias?.alias || null };
                await placeInDoubleWaitlistOrReject(joinReq.rival, joinReq, waitlistEntry, requestId, res);
                return;
            }
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
            // gender de snapshot'a eklendi — DOUBLE'da "Atanmamış" listesindeki atama
            // butonlarının cinsiyete uymayan slotları hiç göstermemesi için (bkz. mobil
            // openSlotOptions/genderFitsSlot) — önceden bu bilgi hiç taşınmıyordu, bu yüzden
            // örn. erkek bir oyuncuya kadın-kısıtlı bir slot seçenek olarak sunulup "zaten dolu"
            // gibi alakasız bir hatayla reddediliyordu (asıl sebep cinsiyetti, doluluk değildi).
            const joinerData = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar, gender: joinReq.user.gender, alias: joinerInterestForAlias?.alias || null };
            const existingUnassigned = Array.isArray(joinReq.rival.unassignedPlayers) ? joinReq.rival.unassignedPlayers : [];
            const nextUnassigned = [...existingUnassigned, joinerData];
            // Kullanıcı isteği/bug raporu: bu kabul kadroyu (headcount olarak, taraf ataması
            // henüz yapılmamış olsa bile) tamamlıyorsa MATCHED'e geçmesi gerekiyordu — önceden
            // hiç kontrol edilmiyordu, ilan sonsuza dek OPEN kalıp maç saati gelince "yeterli
            // oyuncu bulunamadı" diye YANLIŞLIKLA otomatik iptal ediliyordu (bkz. cleanupRivals.js).
            const countFilled = (arr) => (Array.isArray(arr) ? arr : []).filter(p => p && p.id).length;
            const isFull = (joinReq.rival.teamSize || 1) > 1
                ? teamFilledCount(joinReq.rival, { unassignedPlayers: nextUnassigned }) >= totalPlayerCount(joinReq.rival)
                : joinReq.rival.matchType === 'DOUBLE'
                    ? 1 + countFilled(joinReq.rival.senderTeam) + countFilled(joinReq.rival.participants) + countFilled(nextUnassigned) >= 4
                    : false;
            let updatedRival = await prisma.activityRequest.update({
                where: { id: joinReq.rivalId },
                data: {
                    unassignedPlayers: nextUnassigned,
                    ...(isFull && { status: 'MATCHED', receiverId: joinReq.userId, reopenedAt: null }),
                },
                include: {
                    sender: { select: SENDER_SELECT },
                    joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }], include: { user: { select: SENDER_SELECT } } },
                },
            });
            updatedRival = await enrichRivalWithRatings(updatedRival);
            broadcast('rivalUpdate', updatedRival); // (kullanıcı isteği: davet/kabul güncellemesini sadece ilan sahibine değil, ilanı görüntüleyen herkese anında yansıt)
            emitToUser(joinReq.userId, 'joinAccepted', { rivalId: joinReq.rivalId, matched: isFull });
            createNotification(
                joinReq.rival.senderId, 'MATCH_CONFIRMED',
                '🤝 Davet Kabul Edildi',
                `${joinerDisplayName} maça katılmayı kabul etti — takımını sen atayacaksın.${isFull ? ' Maç doldu!' : ''}`,
                { rivalId: joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            if (isFull) notifyOtherPendingOwnerInvitesOfFull(joinReq.rivalId, joinReq.rival.category, joinReq.rival.subCategory, [joinReq.userId], joinReq.rival.matchType);
            return res.json({ message: 'Davet kabul edildi.', request: updatedRival, matched: isFull });
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
        // Kullanıcı raporu (tenis): kadro başka biriyle dolup ilan MATCHED olduktan SONRA,
        // elde kalan eski/yanıtlanmamış bir başvuru kabul edilmeye çalışılınca ya DOUBLE'da
        // kafa karıştıran "Tüm slotlar dolu" hatası (asıl sebep kadronun tamamen dolmuş olması,
        // tek bir slotun değil) ya da SINGLE'da (buraya kadar hiç kapasite kontrolü olmadığı
        // için) sessizce "geç kabul" akışına girip ikinci denemede alakasız bir "Bu istek zaten
        // yanıtlanmış" hatasına dönüşüyordu. Buraya kadar ulaşan her istek (isPartnerInvite/
        // isOppTeamInvite/isSubstituteInvite/isUnassignedInvite yukarıda kendi kontrolleriyle
        // zaten return etti) doğrudan ANA kadroya eklenmeye çalışıyor — ilan artık OPEN değilse
        // net bir "Kadro dolu" hatasıyla reddedilir. DOUBLE/SINGLE'da, ilan gerçekten dolduğu
        // (MATCHED) için OPEN değilse — iptal/tamamlanmış değilse — kullanıcı isteğiyle artık
        // sert ret yerine yedek listesine düşer (bkz. isDoubleOrSingleRosterFull/
        // placeInDoubleWaitlistOrReject, aynı mantık yukarıdaki isPartnerInvite/opp1-opp2/
        // isUnassignedInvite dallarında da uygulandı).
        if (rival.status !== 'OPEN') {
            if (rival.status === 'MATCHED' && (rival.matchType === 'DOUBLE' || rival.matchType === 'SINGLE')) {
                const waitlistEntry = { id: joinReq.userId, username: joinReq.user.username, fullName: joinReq.user.fullName, avatar: joinReq.user.avatar, gender: joinReq.user.gender, alias: joinerInterestForAlias?.alias || null };
                await placeInDoubleWaitlistOrReject(rival, joinReq, waitlistEntry, requestId, res);
                return;
            }
            return res.status(400).json({ message: 'Kadro dolu — bu istek artık kabul edilemez.' });
        }
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
        // gender EKSİKTİ — atanmamış havuzuna (unassignedPlayers) düşen bu kayıt cinsiyet
        // bilgisi taşımayınca, DOUBLE'da cinsiyet kısıtlı slotlara "Takımlara Ata" seçeneği
        // hiç çıkmıyordu (genderFitsSlot(undefined, 'FEMALE') hep false dönüyordu).
        const joinerEntry = { id: u.id, username: u.username, fullName: u.fullName, avatar: u.avatar, alias: joinerInterest?.alias || null, gender: u.gender };

        let updatedParticipants;
        let assignedToPartner = false;
        let updatedSenderTeam = null;
        let updatedUnassigned = null;
        let updatedSubstitutePlayers = null;

        if (rival.matchType === 'DOUBLE') {
            const resolved = await resolveDoubleAcceptance({ rival, joinReq, joiningTeam, partnerJoinReqToAccept, joinerEntry, participants, countFilled });
            if (resolved.error) return res.status(400).json({ message: resolved.error });
            updatedParticipants = resolved.updatedParticipants;
            assignedToPartner = !!resolved.assignedToPartner;
            updatedSenderTeam = resolved.updatedSenderTeam || null;
            updatedUnassigned = resolved.updatedUnassignedPlayers || null;
        } else {
            if (isTeamJoin && countFilled(participants) > 0) {
                return res.status(400).json({ message: 'Bu ilanda zaten kabul edilmiş bireysel katılımcı(lar) var. Takım eşleşmesini kabul etmeden önce onları çıkarın.' });
            }
            // Voleybol/airsoft (teamSize>1): bireysel kabul artık HER ZAMAN (ilk katılan dahil)
            // atanmamış havuzuna eklenir — hangi tarafta oynayacağı ilan sahibi ya da oyuncunun
            // kendisi tarafından sonradan seçilir (assignUnassignedToSide), DOUBLE'daki atanmamış
            // havuzuyla aynı mantık. Önceden SADECE ilk katılan doğrudan Rakip Takım'a (participants)
            // yazılıyordu — "neden ilk kabul ettiğim oyuncu direkt rakibe atanıyor" şikayetine yol
            // açan yanlış bir davranıştı; MATCHED eşiği zaten teamFilledCount ile (participants +
            // unassigned + senderTeam toplamı) hesaplandığı için kimin nerede olduğunun bir önemi yok.
            const isIndividualTeamJoin = ['volleyball', 'airsoft'].includes(rival.subCategory) && (rival.teamSize || 1) > 1 && !isTeamJoin;
            if (isIndividualTeamJoin) {
                const genderQuotaError = await checkGenderCountQuota(rival, u.gender);
                if (genderQuotaError) {
                    // Cinsiyet kotası (EXACT/MIN) dolmuş — reddetmeden önce yedek kontenjanına bak
                    // (bkz. confirmLateJoin'deki aynı mantık, tutarlılık için burada da uygulanıyor).
                    await placeInSubstituteOrRejectFull(rival, joinReq, joinerEntry, requestId, res);
                    return;
                }
                updatedParticipants = participants;
                updatedUnassigned = [...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []), joinerEntry];
            } else if (isTeamJoin) {
                // Voleybol "Rakip Aranıyor" (Rakip Bul sekmesi): sendJoinRequest'te doğrulanıp
                // zenginleştirilmiş takım, ana kadro/yedek olarak ayrıştırılır — isSubstitute
                // bayrağı YOKSA (futbolun COMPETITIVE web akışı, bkz. TeamChallengeModal) eski
                // davranış aynen korunur: tüm dizi doğrudan participants'a yazılır.
                const hasSubFlag = joiningTeam.some(m => m && typeof m.isSubstitute === 'boolean');
                if (hasSubFlag) {
                    updatedParticipants = joiningTeam.filter(m => !m.isSubstitute);
                    updatedSubstitutePlayers = [
                        ...(Array.isArray(rival.substitutePlayers) ? rival.substitutePlayers : []),
                        ...joiningTeam.filter(m => m.isSubstitute),
                    ];
                } else {
                    updatedParticipants = joiningTeam;
                }
                // Tam takım tek seferde Rakip Takımı'na (participants) yazıldığı için, takım
                // başına min. cinsiyet kısıtlaması varsa burada da (assignPlayerToSide'daki
                // tekil atamayla aynı şekilde) kontrol edilir — aksi halde bu akış onu tamamen
                // atlıyordu.
                const teamGenderErr = await perTeamGenderFeasible(rival, 'opp', updatedParticipants);
                if (teamGenderErr) return res.status(400).json({ message: teamGenderErr });
            } else {
                updatedParticipants = [...participants, joinerEntry];
            }
        }

        // Geç kabul: yukarıdaki doğrulama geçti (bu istek gerçekten kabul edilebilir), şimdi
        // joiner'a tekrar onay isteriz — henüz hiçbir şey DB'ye yazılmadı. İki durumda tetiklenir:
        // (1) istek 1 saatten eski, (2) bu ilan daha önce MATCHED'ken açılmış (reopenedAt) VE
        // bu istek o açılıştan ÖNCE gönderilmiş — süre farketmeksizin, çünkü başvuranın koşulları
        // o zamandan beri değişmiş olabilir. reopenedAt'tan SONRA gönderilen (yeni şartlarla
        // gönderilmiş) istekler bu kapsama girmez — aksi halde reopenedAt kadro dolana kadar
        // temizlenmediği için, ilandan sonra gelen HER yeni istek (demo dahil) süresi farketmeksizin
        // yanlışlıkla "geç kabul" sayılıyordu (kullanıcı raporu: anında kabul ettiği taze bir demo
        // isteği bile "Son Onay Bekleniyor"a düşüyordu).
        const ONE_HOUR_MS = 60 * 60 * 1000;
        const requestPredatesReopen = !!rival.reopenedAt && new Date(joinReq.createdAt) < new Date(rival.reopenedAt);
        const lateAccept = (Date.now() - new Date(joinReq.createdAt).getTime() > ONE_HOUR_MS) || requestPredatesReopen;
        if (lateAccept) {
            // Kullanıcı raporu: bu iki sorgu birbirine bağlı değil (ikincisi ilkinin sonucunu
            // kullanmıyor), ard arda await edilmeleri "Son Onay Bekleniyor" uyarısının fark
            // edilir bir gecikmeyle (yaklaşık 1sn) gelmesine katkıda bulunuyordu — paralel
            // çalıştırılıp yanıt süresi kısaltıldı. interests'e de category/subCategory filtresi
            // eklendi (önceden kullanıcının TÜM ilgi alanları — diğer sporlar dahil — gereksiz
            // yere çekiliyordu, çok sayıda bekleyen istek varken bu sorguyu yavaşlatıyordu).
            let [, refreshedRival] = await Promise.all([
                prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'AWAITING_JOINER_CONFIRM' } }),
                prisma.activityRequest.findUnique({
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
                                        interests: { where: { category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } },
                                    },
                                },
                            },
                        },
                    },
                }),
            ]);
            refreshedRival = await enrichRivalWithRatings(refreshedRival);
            emitToUser(joinReq.userId, 'joinLateAccepted', { rivalId: joinReq.rivalId, requestId });

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
        // DOUBLE'da bireysel kabuller artık atanmamış havuzuna düştüğü için (bkz.
        // resolveDoubleAcceptance) participants/senderTeam tek başına dolmuyor — 4 kişi
        // (kurucu+partner+rakip1+rakip2) toplam olarak tamamlanınca MATCHED sayılır, kim
        // hangi isimli slotta olduğu (partner/opp1/opp2) sonradan (assignDoubleSlot ile)
        // netleşir — voleyboldeki "atanmamış havuzu" ile aynı mantık.
        const isFull = assignedToPartner
            ? countFilled(participants) >= 2
            : (rival.teamSize || 1) > 1
                ? teamFilledCount(rival, { participants: updatedParticipants, unassignedPlayers: updatedUnassigned ?? rival.unassignedPlayers }) >= totalPlayerCount(rival)
                : rival.matchType === 'DOUBLE'
                    ? 1 + countFilled(Array.isArray(rival.senderTeam) ? rival.senderTeam : []) + countFilled(updatedParticipants) + countFilled(updatedUnassigned ?? rival.unassignedPlayers) >= 4
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
            ...(updatedSubstitutePlayers && { substitutePlayers: updatedSubstitutePlayers }),
        };

        let updated = await prisma.activityRequest.update({
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
                                // Kullanıcı raporu: category/subCategory filtresi olmadan her bekleyen
                                // isteğin sahibinin TÜM ilgi alanları (diğer sporlar dahil) çekiliyordu —
                                // çok sayıda bekleyen istek varken (ör. demo botları) bu, "Kabul Et"
                                // yanıtını fark edilir şekilde yavaşlatıyordu.
                                interests: {
                                    where: { category: rival.category, subCategory: rival.subCategory },
                                    select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true },
                                },
                            },
                        },
                    },
                },
            },
        });
        // Kullanıcı raporu: kabul edilince yeni katılımcının ELO'su ve kurucunun rozeti anlık
        // kayboluyordu (bkz. enrichRivalWithRatings tanımındaki yorum) — hem doğrudan cevapta
        // hem broadcast'te bu düzeltilmiş veri gidiyor.
        updated = await enrichRivalWithRatings(updated);

        // Çiftler: partner eşi de kabul edildi olarak işaretlenir (ikisi birlikte tek takım kabul edildi)
        if (partnerJoinReqToAccept) {
            await prisma.rivalJoinRequest.update({ where: { id: partnerJoinReqToAccept.id }, data: { status: 'ACCEPTED' } });
        }

        // Push updated rival to creator's UI
        broadcast('rivalUpdate', updated); // (kullanıcı isteği: davet/kabul güncellemesini sadece ilan sahibine değil, ilanı görüntüleyen herkese anında yansıt)
        // Notify the joiner that they were accepted
        emitToUser(u.id, 'joinAccepted', { rivalId: rival.id, matched: isFull });
        if (partnerJoinReqToAccept) emitToUser(partnerJoinReqToAccept.userId, 'joinAccepted', { rivalId: rival.id, matched: isFull });
        // Voleybol takım başvurusu: sadece isteği gönderen değil, kadrodaki (ana+yedek) tüm
        // gerçek kullanıcılar da maçın kabul edildiğini görmeli.
        if (updatedSubstitutePlayers !== null || (isTeamJoin && joiningTeam.length > 1)) {
            joiningTeam.filter(m => m?.id && m.id !== u.id).forEach(m => {
                emitToUser(m.id, 'joinAccepted', { rivalId: rival.id, matched: isFull });
                createNotification(
                    m.id, 'MATCH_CONFIRMED',
                    isFull ? '🎉 Maç onaylandı!' : '✓ Takım başvurunuz kabul edildi!',
                    `${rival.sender?.username || 'İlan sahibi'} takımınızın başvurusunu kabul etti.${isFull ? ' Maç doldu!' : ''}`,
                    { rivalId: rival.id, category: rival.category, subCategory: rival.subCategory }
                ).catch(() => {});
            });
        }
        // Also notify all participants and senderTeam of the match status
        if (isFull) {
            updatedParticipants.filter(p => p?.id).forEach(p => emitToUser(p.id, 'rivalUpdate', updated));
            const currentSenderTeam = Array.isArray(updated.senderTeam) ? updated.senderTeam : [];
            currentSenderTeam.filter(p => p?.id && p.id !== u.id && p.id !== rival.senderId)
                .forEach(p => emitToUser(p.id, 'rivalUpdate', updated));
            notifyOtherPendingOwnerInvitesOfFull(rival.id, rival.category, rival.subCategory, [u.id, ...(Array.isArray(joiningTeam) ? joiningTeam.filter(m => m?.id).map(m => m.id) : [])], rival.matchType);
            notifyOtherPendingJoinersOfFull(rival.id, rival.category, rival.subCategory, [u.id, ...(Array.isArray(joiningTeam) ? joiningTeam.filter(m => m?.id).map(m => m.id) : [])]);
        }

        // Kullanıcı isteği: uygulamanın tamamı Türkçe metin kullanıyor — bu mesajlar da
        // yanlışlıkla İngilizce yazılmış kalmıştı, diğerleriyle tutarlı hale getirildi.
        res.json({
            message: isFull ? '🎉 Maç doldu!' : `✓ Kabul edildi!`,
            request: updated,
            matched: isFull,
        });

        createNotification(
            u.id,
            'MATCH_CONFIRMED',
            isFull ? '🎉 Maç onaylandı!' : '✓ Katılım isteğin kabul edildi!',
            assignedToPartner
                ? (isFull
                    ? `${rival.sender?.username || ''} sizi çiftler takımına takım arkadaşı olarak kabul etti. Maç doldu!`
                    : `${rival.sender?.username || ''} sizi çiftler takımına takım arkadaşı olarak kabul etti.`)
                : isFull
                    ? `${rival.sender?.username || ''} maçına katılım isteğin kabul edildi. Maç doldu!`
                    : `Bir maça katılım isteğin kabul edildi.`,
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
            let queuedNotAssigned = false;
            if (joinReq.rival.linkedRivalId) {
                const mainMatch = await prisma.activityRequest.findUnique({ where: { id: joinReq.rival.linkedRivalId } });
                if (mainMatch) {
                    const feeNum = parseInt(String(joinReq.offerPrice || '').replace(/[^0-9]/g, ''), 10);
                    refereeShare = feeNum ? Math.round(feeNum / totalPlayerCount(mainMatch)) : null;
                    // Kullanıcı isteği: maçın zaten onaylı bir hakemi varsa, yeni kabul edilen
                    // hakem HEMEN atanmaz — mevcut hakem çıkana kadar (bkz. disputeReferee)
                    // sıraya (refereeQueue) girer, ilk boşalınca otomatik terfi eder.
                    if (mainMatch.refereeId && mainMatch.refereeId !== joinReq.userId) {
                        const queue = Array.isArray(mainMatch.refereeQueue) ? mainMatch.refereeQueue : [];
                        if (!queue.some(q => q.userId === joinReq.userId)) {
                            updatedMain = await prisma.activityRequest.update({
                                where: { id: mainMatch.id },
                                data: { refereeQueue: [...queue, { userId: refUser.id, username: refUser.username, fullName: refUser.fullName, avatar: refUser.avatar, offerPrice: joinReq.offerPrice || null }] },
                                include: { sender: { select: SENDER_SELECT }, refereeUser: { select: SENDER_SELECT } },
                            });
                            updatedMain = await enrichRivalWithRatings(updatedMain);
                            broadcast('rivalUpdate', updatedMain);
                        } else {
                            updatedMain = mainMatch;
                        }
                        queuedNotAssigned = true;
                    } else {
                        updatedMain = await prisma.activityRequest.update({
                            where: { id: mainMatch.id },
                            // Yeni hakem atanınca önceki hakeme dair itiraz oyları sıfırlanır — yoksa
                            // eski hakem hakkında birikmiş oylar yanlışlıkla yeni hakeme devrolurdu.
                            data: { refereeId: joinReq.userId, refereeDisputeVoterIds: [], ...(refereeShare && { refereeFeePerPerson: refereeShare }) },
                            include: { sender: { select: SENDER_SELECT }, refereeUser: { select: SENDER_SELECT } },
                        });
                        updatedMain = await enrichRivalWithRatings(updatedMain);
                        broadcast('rivalUpdate', updatedMain);
                    }
                }
            }

            emitToUser(joinReq.userId, 'joinAccepted', { rivalId: joinReq.rivalId, matched: true });
            res.json({ message: queuedNotAssigned ? 'Hakemlik sırasına alındı' : 'Hakem onaylandı', request: updatedMain });
            createNotification(
                notifyPending,
                queuedNotAssigned ? '🟨 Hakemlik Sırasına Alındınız' : (isOwnerInitiated ? '✅ Hakemlik Daveti Kabul Edildi' : '✅ Hakemlik Başvurunuz Onaylandı'),
                queuedNotAssigned
                    ? `"${subCategoryTR(joinReq.rival.subCategory)}" maçında zaten onaylı bir hakem var — kabulünüz yedek sıraya alındı, mevcut hakem çıkarsa otomatik olarak siz atanacaksınız.`
                    : isOwnerInitiated
                        ? `${refUser.fullName || refUser.username}, "${subCategoryTR(joinReq.rival.subCategory)}" maçında hakemlik davetinizi kabul etti.`
                        : `"${subCategoryTR(joinReq.rival.subCategory)}" maçı için hakemlik başvurunuz onaylandı.`,
                { rivalId: joinReq.rival.linkedRivalId || joinReq.rivalId, category: joinReq.rival.category, subCategory: joinReq.rival.subCategory }
            ).catch(() => {});
            // Kullanıcı isteği: hakem onaylanınca aynı bilgi zaten "Hakem Slotu" özet kutusunda
            // (Hakem: X ✓) gösteriliyor — buraya ayrıca yorum olarak da düşmesi gereksiz tekrardı.
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

        const u = joinReq.user;
        const joinerInterest = await prisma.userInterest.findFirst({
            where: { userId: u.id, subCategory: rival.subCategory },
            select: { alias: true },
        });
        // gender EKSİKTİ — bkz. respondToJoin'deki aynı isim ve gerekçeli düzeltme.
        const joinerEntry = { id: u.id, username: u.username, fullName: u.fullName, avatar: u.avatar, alias: joinerInterest?.alias || null, gender: u.gender };

        // Bu onay 1 saatten geç kabul yüzünden bekletiliyordu — o süre zarfında ilan sahibi
        // başka bir oyuncuyu kabul edip maç dolmuş (ya da ilan iptal edilmiş) olabilir. İlan
        // iptal edildiyse kesin ret; ama sadece kadro dolduysa (kullanıcı isteği: "son onay
        // bekleniyor" durumundaki birden fazla oyuncu sırayla onaylanınca dışarda kalanlar
        // olabiliyor) doğrudan reddetmek yerine önce yedek kontenjanına bakılır — bkz.
        // placeInSubstituteOrRejectFull (yedekte de yer yoksa zaten aynı ret mesajını verir).
        if (rival.status === 'CANCELLED') {
            await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } });
            emitToUser(joinReq.userId, 'joinRejected', { rivalId: joinReq.rivalId });
            createNotification(
                joinReq.userId,
                'RIVAL_JOIN_REQUEST',
                '😕 İlan İptal Edildi',
                `Onayınızı beklerken "${rival.sender?.username || 'ilan sahibi'}" bu ilanı iptal etti.`,
                { rivalId: joinReq.rivalId, category: rival.category, subCategory: rival.subCategory }
            ).catch(() => {});
            return res.status(409).json({ message: 'Onayınızı beklerken bu ilan iptal edildi.' });
        }
        const participantsSoFar = Array.isArray(rival.participants) ? rival.participants.filter(p => p && p.id) : [];
        const alreadyFull = rival.status === 'MATCHED' || ((rival.teamSize || 1) > 1
            ? teamFilledCount(rival) >= totalPlayerCount(rival)
            : participantsSoFar.length >= getRequired(rival));
        if (alreadyFull) {
            // DOUBLE/SINGLE'ın kendi substituteCount'u yok (her zaman 0) — placeInSubstituteOrRejectFull
            // bu yüzden burada hep reddederdi. Kendi sınırsız yedek listesine (waitlistPlayers) düşer.
            if (rival.matchType === 'DOUBLE' || rival.matchType === 'SINGLE') {
                await placeInDoubleWaitlistOrReject(rival, joinReq, joinerEntry, requestId, res);
            } else {
                await placeInSubstituteOrRejectFull(rival, joinReq, joinerEntry, requestId, res);
            }
            return;
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

        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const countFilled = (arr) => arr.filter(p => p && p.id).length;

        let updatedParticipants;
        let assignedToPartner = false;
        let updatedSenderTeam = null;
        let updatedUnassigned = null;
        let updatedSubstitutePlayers = null;

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
            updatedUnassigned = resolved.updatedUnassignedPlayers || null;
        } else {
            if (isTeamJoin && participants.length > 0) {
                return res.status(400).json({ message: 'Bu ilanda zaten kabul edilmiş bireysel katılımcı(lar) var.' });
            }
            // Bkz. respondToJoin'deki aynı isim ve gerekçeli kontrol (artık ilk katılan dahil hep atanmamışa gidiyor).
            const isIndividualTeamJoin = ['volleyball', 'airsoft'].includes(rival.subCategory) && (rival.teamSize || 1) > 1 && !isTeamJoin;
            if (isIndividualTeamJoin) {
                const genderQuotaError = await checkGenderCountQuota(rival, u.gender);
                if (genderQuotaError) {
                    // Cinsiyet kotası (EXACT/MIN) dolmuş — reddetmeden önce yedek kontenjanına bak.
                    await placeInSubstituteOrRejectFull(rival, joinReq, joinerEntry, requestId, res);
                    return;
                }
                updatedParticipants = participants;
                updatedUnassigned = [...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []), joinerEntry];
            } else if (isTeamJoin) {
                // Bkz. respondToJoin'deki aynı mantık: isSubstitute bayrağı yoksa (futbol
                // COMPETITIVE) eski davranış korunur.
                const hasSubFlag = joiningTeam.some(m => m && typeof m.isSubstitute === 'boolean');
                if (hasSubFlag) {
                    updatedParticipants = joiningTeam.filter(m => !m.isSubstitute);
                    updatedSubstitutePlayers = [
                        ...(Array.isArray(rival.substitutePlayers) ? rival.substitutePlayers : []),
                        ...joiningTeam.filter(m => m.isSubstitute),
                    ];
                } else {
                    updatedParticipants = joiningTeam;
                }
                // Bkz. respondToJoin'deki aynı gerekçeli kontrol — tam takım tek seferde
                // participants'a yazıldığı için takım başına min. cinsiyet kısıtlaması burada da
                // uygulanmalı.
                const teamGenderErr = await perTeamGenderFeasible(rival, 'opp', updatedParticipants);
                if (teamGenderErr) return res.status(400).json({ message: teamGenderErr });
            } else {
                updatedParticipants = [...participants, joinerEntry];
            }
        }
        const isFull = assignedToPartner
            ? countFilled(participants) >= 2
            : (rival.teamSize || 1) > 1
                ? teamFilledCount(rival, { participants: updatedParticipants, unassignedPlayers: updatedUnassigned ?? rival.unassignedPlayers }) >= totalPlayerCount(rival)
                : rival.matchType === 'DOUBLE'
                    ? 1 + countFilled(Array.isArray(rival.senderTeam) ? rival.senderTeam : []) + countFilled(updatedParticipants) + countFilled(updatedUnassigned ?? rival.unassignedPlayers) >= 4
                    : countFilled(updatedParticipants) >= getRequired(rival);

        await prisma.rivalJoinRequest.update({ where: { id: requestId }, data: { status: 'ACCEPTED' } });
        if (partnerJoinReqToAccept) {
            await prisma.rivalJoinRequest.update({ where: { id: partnerJoinReqToAccept.id }, data: { status: 'ACCEPTED' } });
        }

        let updated = await prisma.activityRequest.update({
            where: { id: rival.id },
            data: {
                participants: updatedParticipants,
                status: isFull ? 'MATCHED' : 'OPEN',
                receiverId: isFull ? u.id : rival.receiverId,
                ...(assignedToPartner && { senderTeam: updatedSenderTeam }),
                ...(updatedUnassigned && { unassignedPlayers: updatedUnassigned }),
                ...(updatedSubstitutePlayers && { substitutePlayers: updatedSubstitutePlayers }),
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
                                    where: { category: rival.category, subCategory: rival.subCategory },
                                    select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true },
                                },
                            },
                        },
                    },
                },
            },
        });
        // Bkz. enrichRivalWithRatings tanımındaki yorum — respondToJoin'de olduğu gibi geç
        // kabul onayında da ELO rozeti anlık kayboluyordu.
        updated = await enrichRivalWithRatings(updated);

        broadcast('rivalUpdate', updated); // (kullanıcı isteği: davet/kabul güncellemesini sadece ilan sahibine değil, ilanı görüntüleyen herkese anında yansıt)
        emitToUser(u.id, 'joinAccepted', { rivalId: rival.id, matched: isFull });
        if (partnerJoinReqToAccept) emitToUser(partnerJoinReqToAccept.userId, 'joinAccepted', { rivalId: rival.id, matched: isFull });
        if (isFull) {
            updatedParticipants.forEach(p => emitToUser(p.id, 'rivalUpdate', updated));
            notifyOtherPendingOwnerInvitesOfFull(rival.id, rival.category, rival.subCategory, [u.id, ...(Array.isArray(joiningTeam) ? joiningTeam.filter(m => m?.id).map(m => m.id) : [])], rival.matchType);
            notifyOtherPendingJoinersOfFull(rival.id, rival.category, rival.subCategory, [u.id, ...(Array.isArray(joiningTeam) ? joiningTeam.filter(m => m?.id).map(m => m.id) : [])]);
        }
        // Voleybol takım başvurusu: kadrodaki (ana+yedek) tüm gerçek kullanıcılar bilgilendirilir.
        if (updatedSubstitutePlayers !== null || (isTeamJoin && joiningTeam.length > 1)) {
            joiningTeam.filter(m => m?.id && m.id !== u.id).forEach(m => {
                emitToUser(m.id, 'joinAccepted', { rivalId: rival.id, matched: isFull });
                createNotification(
                    m.id, 'MATCH_CONFIRMED',
                    isFull ? '🎉 Maç onaylandı!' : '✓ Takım başvurunuz kabul edildi!',
                    `${rival.sender?.username || 'İlan sahibi'} takımınızın başvurusunu kabul etti.${isFull ? ' Maç doldu!' : ''}`,
                    { rivalId: rival.id, category: rival.category, subCategory: rival.subCategory }
                ).catch(() => {});
            });
        }

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
    const d = turkeyDateTimeToUtc(match.matchDate, match.matchTime);
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
            include: {
                sender: { select: SENDER_SELECT },
                refereeUser: { select: SENDER_SELECT },
                _count: { select: { matchComments: true } },
                // KULLANICI RAPORU: Yaklaşan Maçlar kartındaki "Yedek İstekleri"/"Gönderilen
                // Davetler" bölümleri joinRequests hiç çekilmediği için HER ZAMAN boş geliyordu —
                // ekranda görünen istekler sadece o an açıkken canlı gelen socket olaylarıyla
                // (bkz. mobil localSubRequests) yerel hafızada tutuluyordu. Maç "Yedek Kadro
                // Aranan" bölümüne geçince (farklı bir liste/map'e taşındığı için React kartı
                // yeniden mount ediyor, yerel state sıfırlanıyor) ya da ekran basitçe yenilenince
                // bu yerel state kayboluyor, istekler de gerçekten silinmiş gibi "kayboluyordu".
                joinRequests: {
                    where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
                    orderBy: [{ initiatedBy: 'desc' }, { createdAt: 'asc' }],
                    // where filtresi + alias: bu uç nokta her zaman tek bir subCategory için
                    // çağrıldığından (bkz. mobil GET /rivals/upcoming?...&subCategory=) burada
                    // da diğer tek-satırlı sorgulardaki (getRivalById vb.) aynı düzeltme uygulanabilir.
                    include: { user: { select: { ...SENDER_SELECT, interests: { where: { ...(cat && { category: cat }), ...(subCategory && { subCategory }) }, select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true, alias: true, assessmentCompleted: true, singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true } } } } },
                },
            },
            orderBy: { matchDate: 'asc' },
        });

        // Auto-void: delete unscored matches whose 24h window has passed
        const now = new Date();
        const expired = matches.filter(m => {
            const dl = getMatchDeadline(m);
            return dl && now > dl && !m.score;
        });
        // Kullanıcı raporu: esnek MATCHED maçların süresi geçince silinmesi + bildirimi burada
        // VE getMyUpcomingMatches'te AYRI AYRI yapılıyordu — uygulama açılışında ikisi paralel
        // çağrılınca aynı maç için AYNI bildirim iki kez gidebiliyordu ("2'si tekrar eden").
        // Artık silme/bildirim TEK yerde, cleanupRivals.js cron'unda (her 5 dk) — burası sadece
        // listeden hariç tutuyor, DB'ye dokunmuyor.
        const scheduleExpired = matches.filter(m =>
            m.flexibleSchedule && m.schedulingDeadline && now > new Date(m.schedulingDeadline) && !m.matchDate
        );
        if (expired.length > 0) {
            await prisma.activityRequest.deleteMany({ where: { id: { in: expired.map(m => m.id) } } });
        }

        const allExpiredSet = new Set([...expired.map(m => m.id), ...scheduleExpired.map(m => m.id)]);
        const active = matches.filter(m => !allExpiredSet.has(m.id));

        // Enrich with skill ratings — isolated so failure doesn't break the main response
        try {
            const allUserIds = [...new Set([
                ...active.map(m => m.senderId),
                ...active.flatMap(m => (Array.isArray(m.participants) ? m.participants : []).filter(p => p?.id).map(p => p.id)),
                ...active.flatMap(m => (Array.isArray(m.senderTeam) ? m.senderTeam : []).filter(p => p?.id).map(p => p.id)),
                ...active.flatMap(m => (Array.isArray(m.substitutePlayers) ? m.substitutePlayers : []).filter(p => p?.id).map(p => p.id)),
                // Kullanıcı isteği: "Atanmamış" listesinde de elo/derece puanı görünsün.
                ...active.flatMap(m => (Array.isArray(m.unassignedPlayers) ? m.unassignedPlayers : []).filter(p => p?.id).map(p => p.id)),
            ].filter(Boolean))];

            const interests = allUserIds.length > 0
                ? await prisma.userInterest.findMany({
                    where: { userId: { in: allUserIds } },
                    select: {
                        userId: true, subCategory: true, skillRating: true, alias: true,
                        singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true,
                    },
                })
                : [];
            // Kullanıcı isteği: yaklaşan/skor bekleyen maçlarda tenis/padel oyuncularının derece
            // puanı ilan sahibi de dahil HERKESE görünür olmalı, maçın FORMATINA (tekli/çiftli)
            // göre doğru (bkz. teamDisplayRating, açık ilan detayındaki aynı düzeltme).
            const ratingFor = (userId, subCategory, isDoubles) => teamDisplayRating(interests.find(i => i.userId === userId && i.subCategory === subCategory), subCategory, isDoubles);
            const unassignedGenderById = await fillMissingUnassignedGenders(active.map(m => m.unassignedPlayers));

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

            const enriched = active.map(m => {
                const mIsDoubles = isDoublesFormat(m);
                return {
                ...m,
                senderSkillRating: ratingFor(m.senderId, m.subCategory, mIsDoubles),
                senderAlias: interests.find(i => i.userId === m.senderId && i.subCategory === m.subCategory)?.alias || null,
                participants: (Array.isArray(m.participants) ? m.participants : []).filter(p => p?.id).map(p => ({
                    ...p,
                    skillRating: ratingFor(p.id, m.subCategory, mIsDoubles),
                    alias: p.alias || interests.find(i => i.userId === p.id && i.subCategory === m.subCategory)?.alias || null,
                })),
                senderTeam: (Array.isArray(m.senderTeam) ? m.senderTeam : []).filter(p => p?.id).map(p => ({
                    ...p,
                    skillRating: ratingFor(p.id, m.subCategory, mIsDoubles),
                    alias: p.alias || interests.find(i => i.userId === p.id && i.subCategory === m.subCategory)?.alias || null,
                })),
                substitutePlayers: (Array.isArray(m.substitutePlayers) ? m.substitutePlayers : []).map(p => p?.id ? ({
                    ...p,
                    skillRating: ratingFor(p.id, m.subCategory, mIsDoubles),
                    alias: p.alias || interests.find(i => i.userId === p.id && i.subCategory === m.subCategory)?.alias || null,
                }) : p),
                unassignedPlayers: (Array.isArray(m.unassignedPlayers) ? m.unassignedPlayers : []).map(p => p?.id ? ({
                    ...p,
                    gender: p.gender ?? unassignedGenderById[p.id] ?? null,
                    skillRating: ratingFor(p.id, m.subCategory, mIsDoubles),
                }) : p),
                _myNoShowPending: myNoShowSet.has(m.id),
                commentCount: commentCountMap[m.id] ?? 0,
                };
            });

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
            include: {
                user: { select: { id: true, username: true, avatar: true } },
                likes: { where: { userId: req.userId }, select: { id: true } },
                _count: { select: { likes: true } },
            },
            orderBy: { createdAt: 'asc' },
        });
        // Kullanıcı isteği: yazarı silmeden önce "bu yorumu gören oldu mu" diye sorabilsin —
        // yazarı hariç, yorumu görüntüleyen her kullanıcının id'si viewedBy'a eklenir. Kendi
        // yorumumuzu görmemiz sayılmaz, bu yüzden sadece userId !== req.userId olanlar işaretlenir.
        const toMark = comments.filter(c => c.userId !== req.userId && !(Array.isArray(c.viewedBy) && c.viewedBy.includes(req.userId)));
        if (toMark.length > 0) {
            await Promise.all(toMark.map(c => prisma.matchComment.update({
                where: { id: c.id },
                data: { viewedBy: [...(Array.isArray(c.viewedBy) ? c.viewedBy : []), req.userId] },
            })));
            toMark.forEach(c => { c.viewedBy = [...(Array.isArray(c.viewedBy) ? c.viewedBy : []), req.userId]; });
        }
        res.json(comments.map(c => ({
            ...c,
            isLiked: c.likes.length > 0,
            likeCount: c._count.likes,
            likes: undefined,
            _count: undefined,
        })));
    } catch (error) { next(error); }
};

export const addMatchComment = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { content, parentId } = req.body;
        if (!content?.trim()) return res.status(400).json({ message: 'Content required' });
        const match = await prisma.activityRequest.findUnique({
            where: { id },
            select: { id: true, senderId: true, participants: true, subCategory: true, category: true },
        });
        if (!match) return res.status(404).json({ message: 'Match not found' });
        // Kullanıcı isteği: medya yorumlarındaki gibi, sadece o maçın bir yorumuna yanıt
        // yazılabilsin — tek seviye (yanıtın yanıtı yok).
        if (parentId) {
            const parent = await prisma.matchComment.findUnique({ where: { id: parentId }, select: { rivalId: true } });
            if (!parent || parent.rivalId !== id) return res.status(400).json({ message: 'Geçersiz yanıt' });
        }
        const comment = await prisma.matchComment.create({
            data: { rivalId: id, userId: req.userId, content: content.trim(), parentId: parentId || null },
            include: { user: { select: { id: true, username: true, avatar: true } } },
        });
        res.status(201).json(comment);

        // Yorum sayacı sayfa yenilenmeden anlık artsın diye yorumu atan kullanıcıya da
        // 'newComment' gönderilir (bildirim değil, sadece canlı sayaç güncellemesi için).
        emitToUser(req.userId, 'newComment', { rivalId: id, comment });

        // Notify owner + participants (except commenter)
        const parts = Array.isArray(match.participants) ? match.participants : [];
        const allIds = [...new Set([match.senderId, ...parts.filter(p => p?.id).map(p => p.id)])].filter(uid => uid !== req.userId);
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
        const iAmParticipant = comment.rival?.senderId === myId || parts.some(p => p?.id === myId);
        const commenterIsParticipant = comment.rival?.senderId === comment.userId || parts.some(p => p?.id === comment.userId);
        // Own comment: always deletable.
        // Outsider's comment: deletable by any match participant.
        // Participant's comment: only deletable by themselves.
        const canDelete = isAuthor || (iAmParticipant && !commenterIsParticipant);
        if (!canDelete) return res.status(403).json({ message: 'Forbidden' });
        await prisma.matchComment.delete({ where: { id: commentId } });
        res.json({ deleted: true });

        // Kullanıcı isteği: yorum silindiğinde açık olan tüm görünümlerden ANINDA kaybolsun —
        // sayfa yenilemeye/çıkıp girmeye gerek kalmadan (bkz. mobildeki 'commentDeleted' dinleyicisi).
        const allIds = [...new Set([comment.rival?.senderId, ...parts.filter(p => p?.id).map(p => p.id)])].filter(Boolean);
        for (const uid of allIds) {
            emitToUser(uid, 'commentDeleted', { rivalId: comment.rivalId, commentId });
        }
    } catch (error) { next(error); }
};

// Kullanıcı isteği: maç/ilan yorumlarına da medya yorumlarındaki gibi kalp/beğeni — aynı toggle deseni.
export const toggleMatchCommentLike = async (req, res, next) => {
    try {
        const { commentId } = req.params;
        const existing = await prisma.matchCommentLike.findUnique({
            where: { userId_commentId: { userId: req.userId, commentId } },
        });
        if (existing) {
            await prisma.matchCommentLike.delete({ where: { id: existing.id } });
        } else {
            await prisma.matchCommentLike.create({ data: { userId: req.userId, commentId } });
        }
        const count = await prisma.matchCommentLike.count({ where: { commentId } });
        res.json({ liked: !existing, count });
    } catch (error) { next(error); }
};

// Skor girilemeyen bir maçı berabere sayıp arşive alır ('other') ya da yeni tarih/saate
// erteler ('abandoned'). Uygular: reason + gerekiyorsa payload (reschedule alanları).
async function applyAbandonResolution(id, userId, reason, payload) {
    if (reason === 'other') {
        const updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                score: { sets: [], winner: 'draw' },
                status: 'COMPLETED',
                scoreStatus: 'CONFIRMED',
                scoreEnteredBy: userId,
                completedAt: new Date(),
                archived: true,
                abandonProposal: null,
            },
            include: { sender: { select: SENDER_SELECT } },
        });
        return { updated, message: 'Maç berabere sayıldı ve arşive alındı.' };
    }
    const updated = await prisma.activityRequest.update({
        where: { id },
        data: {
            ...(payload.newDate      && { matchDate: new Date(payload.newDate) }),
            ...(payload.newTime      && { matchTime: payload.newTime }),
            ...(payload.newCourtName && { courtName: payload.newCourtName }),
            ...(payload.newLocation  && { location: payload.newLocation }),
            ...(Array.isArray(payload.partialSets) && payload.partialSets.length > 0 && {
                score: { sets: payload.partialSets, winner: null, partial: true },
            }),
            abandonProposal: null,
        },
        include: { sender: { select: SENDER_SELECT } },
    });
    return { updated, message: 'Maç yeniden planlandı.' };
}

export const abandonMatch = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { reason, newDate, newTime, newLocation, newCourtName, partialSets } = req.body;
        if (!['other', 'abandoned'].includes(reason)) return res.status(400).json({ message: 'Geçersiz neden' });

        const request = await prisma.activityRequest.findUnique({ where: { id } });
        if (!request) return res.status(404).json({ message: 'Not found' });

        const parts = Array.isArray(request.participants) ? request.participants : [];
        const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];
        const isInvolved = request.senderId === req.userId || parts.some(p => p?.id === req.userId) || senderTeamArr.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        // Voleybolde (kullanıcı isteği: "çoğunluk onayı önemli voleybolda") bu aksiyonlar
        // (berabere/arşive alma VEYA yeniden planlama) tek kişinin kararıyla değil, kadronun
        // (kurucu + iki takım, sadece uygulamaya kayıtlı gerçek kullanıcılar — manuel/kayıtsız
        // oyuncular oy kullanamaz) YARISINDAN FAZLASININ aynı öneriyi onaylamasıyla uygulanır —
        // 6v6 gibi kalabalık takım maçlarında tek bir oyuncunun herkesi etkileyecek bir kararı
        // (maçı berabere/iptal etmek ya da yeni bir tarihe ertelemek) tek başına vermesi adil değil.
        if (request.subCategory !== 'volleyball') {
            const { updated, message } = await applyAbandonResolution(id, req.userId, reason, { newDate, newTime, newCourtName, newLocation, partialSets });
            broadcast('rivalUpdate', await enrichRivalWithRatings(updated));
            return res.json({ message });
        }

        const rosterIds = [...new Set([
            request.senderId,
            ...senderTeamArr.filter(p => p?.id).map(p => p.id),
            ...parts.filter(p => p?.id).map(p => p.id),
        ])];
        const majorityNeeded = Math.floor(rosterIds.length / 2) + 1;

        const existing = request.abandonProposal;
        let proposal;
        if (existing && existing.reason === reason && !existing.resolvedAt) {
            // Aynı öneriye oy ekleniyor — reschedule alanları İLK öneriyi yapan kişinin
            // gönderdiği değerlerde sabit kalır, sonraki oylayanlar sadece onaylar (kendi
            // formuna farklı tarih/saat yazsalar bile bu görmezden gelinir, tek bir tutarlı
            // öneri üzerinde oylama yapılır).
            const voterIds = new Set(existing.voterIds || []);
            voterIds.add(req.userId);
            proposal = { ...existing, voterIds: [...voterIds] };
        } else {
            proposal = {
                reason, initiatorId: req.userId, voterIds: [req.userId],
                ...(reason === 'abandoned' && {
                    newDate: newDate || null, newTime: newTime || null,
                    newCourtName: newCourtName || null, newLocation: newLocation || null,
                    partialSets: Array.isArray(partialSets) ? partialSets : [],
                }),
                createdAt: new Date().toISOString(),
            };
        }

        if (proposal.voterIds.length < majorityNeeded) {
            let updated = await prisma.activityRequest.update({
                where: { id }, data: { abandonProposal: proposal },
                include: { sender: { select: SENDER_SELECT } },
            });
            updated = await enrichRivalWithRatings(updated);
            broadcast('rivalUpdate', updated);
            const others = rosterIds.filter(uid => uid !== req.userId);
            const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
            const reasonLabel = reason === 'other' ? 'maçın berabere sayılıp arşive alınmasını' : 'maçın yeni bir tarih/saate ertelenmesini';
            for (const uid of others) {
                createNotification(uid, 'ABANDON_VOTE_NEEDED', '🗳️ Onayın Gerekiyor',
                    `${me?.fullName || me?.username} ${reasonLabel} öneriyor (${proposal.voterIds.length}/${majorityNeeded} onay toplandı). Sen de onaylayabilirsin.`,
                    { rivalId: id, category: request.category, subCategory: request.subCategory }
                ).catch(() => {});
            }
            return res.json({ pending: true, proposal, majorityNeeded, message: `Onay bekleniyor (${proposal.voterIds.length}/${majorityNeeded}).` });
        }

        const { updated, message } = await applyAbandonResolution(id, req.userId, proposal.reason, proposal);
        broadcast('rivalUpdate', await enrichRivalWithRatings(updated));
        const nonVoters = rosterIds.filter(uid => !proposal.voterIds.includes(uid));
        for (const uid of nonVoters) {
            createNotification(uid, 'ABANDON_RESOLVED', '✅ Karar Alındı', message,
                { rivalId: id, category: request.category, subCategory: request.subCategory }
            ).catch(() => {});
        }
        return res.json({ message, resolved: true });
    } catch (error) { next(error); }
};

// Kullanıcı isteği: skor girilmesi gereken bir maçı olduğu sürece Bildirimler sekmesindeki
// zil ikonu yanıp sönsün — bu sayaç bildirimin OKUNDU durumundan bağımsız, gerçek maç
// verisinden hesaplanır (bildirimi okusa bile skoru girmeden yanıp sönme durmaz). "COMPLETED
// + scoreStatus NONE" durumundaki maçlar zaten kısa ömürlü (bkz. autoDrawUnscored, 4 saat
// sonra otomatik 0-0 beraberlik) — bu yüzden tüm havuzu çekip bellekte filtrelemek güvenli
// (autoCompleteMatches.js/demoBotResponder.js'teki aynı desen).
export const getMyPendingScoreCount = async (req, res, next) => {
    try {
        const candidates = await prisma.activityRequest.findMany({
            where: { status: 'COMPLETED', scoreStatus: 'NONE', matchType: { not: 'PLAYER_WANTED' } },
            select: { senderId: true, senderTeam: true, participants: true },
        });
        const count = candidates.filter(r => {
            const senderTeamArr = Array.isArray(r.senderTeam) ? r.senderTeam : [];
            const participantsArr = Array.isArray(r.participants) ? r.participants : [];
            return r.senderId === req.userId
                || senderTeamArr.some(p => p?.id === req.userId)
                || participantsArr.some(p => p?.id === req.userId);
        }).length;
        res.json({ pendingScoreCount: count });
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

        // Kullanıcı isteği: voleybolde gerçek set kuralları sunucu tarafında da uygulanır —
        // mobil taraftaki aynı doğrulamanın (bkz. SubCategoryScreen.js submitScore) bir API
        // istemcisiyle atlanmasını önler. İlk 4 set 25, 5. set (varsa, index 4) 15 sayıya
        // en az 2 fark şartıyla ulaşan tarafça kazanılır (24-24→26-24, 25-25→27-25... uzar).
        if (request.subCategory === 'volleyball' && Array.isArray(sets)) {
            for (let i = 0; i < sets.length; i++) {
                const p1 = Number(sets[i]?.sender) || 0, p2 = Number(sets[i]?.opponent) || 0;
                if (p1 === 0 && p2 === 0) continue;
                const hi = Math.max(p1, p2), lo = Math.min(p1, p2);
                const target = i === 4 ? 15 : 25;
                const valid = (hi === target && lo <= target - 2) || (hi > target && hi - lo === 2);
                if (!valid) {
                    return res.status(400).json({ message: `${p1}-${p2} geçersiz set skoru. ${i === 4 ? '5. set' : `${i + 1}. set`} ${target} sayıya (en az 2 fark şartıyla) ulaşan tarafça kazanılmalı.` });
                }
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

        // Kullanıcı raporu: skor girilince karşı tarafa onay bildirimi gitmiyordu — sebep,
        // bu hesabın SADECE request.senderId'ye bakmasıydı; DOUBLE/takım maçlarında skoru
        // senderTeam'deki bir oyuncu girdiğinde (kurucunun kendisi değil) bu şart hep false
        // çıkıyor, "opponents" yanlışlıkla kendi takım arkadaşı (senderId) oluyordu — gerçek
        // rakip takıma hiç bildirim gitmiyordu. confirmScore'daki (aşağıda) aynı teamA/teamB
        // mantığı burada da kullanılıyor artık.
        const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];
        const teamAIds = [request.senderId, ...senderTeamArr.filter(m => m?.id).map(m => m.id)];
        const teamBIds = participants.filter(p => p?.id).map(p => p.id);
        const scorerInA = teamAIds.includes(req.userId);
        const opponentIds = scorerInA ? teamBIds : teamAIds;
        prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } })
            .then(me => {
                for (const oppId of opponentIds) {
                    createNotification(
                        oppId, 'SCORE_SUBMITTED',
                        '📊 Skor Girildi — Onaylar mısın?',
                        `${me.fullName || me.username} maç skorunu girdi. Lütfen onayla ya da itiraz et.`,
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

// Kullanıcı isteği: sipariş veren oyuncu kendi maç detayındaki "Adisyonu Var" ikonuna
// dokununca kendi siparişini (teslim edildi mi/ücreti alındı mı) görebilsin — işletmenin
// Siparişler sekmesinde işaretlediği delivered/paid burada da yansır. Sadece kendi
// siparişleri (userId'ye göre) döner, başka oyuncunun siparişi hiç görünmez.
export const getMyRivalOrders = async (req, res, next) => {
    try {
        const { id } = req.params;
        const orders = await prisma.venueOrder.findMany({
            where: { activityId: id, userId: req.userId },
            include: { items: { include: { menuItem: { select: { name: true } } } } },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ orders });
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
    // participants/senderTeam DOUBLE'da setAtSlot ile boş slotlara null bırakılarak
    // dolduruluyor — p.id null üzerinde patlamasın diye önce filtrele.
    const allPlayerIds = [
        request.senderId,
        ...participants.filter(p => p?.id).map(p => p.id),
        ...senderTeamArr.filter(m => m?.id).map(m => m.id),
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
    // Tenis/padel (UTR): change/before/after applyUtrRatingForMatch'ten doğrudan gelir (doğru
    // disiplin — tekli/çiftler — zaten orada çözülmüştü). Diğer tenis/padel-dışı eski-tablo
    // dallar için change skillRating birimindedir; kalan sporlar için totalPoints birimindedir.
    const isUtrMatch = UTR_SUBCATEGORIES.includes(request.subCategory);
    const isTennisPadelMatch = usesTennisEloTable(request.subCategory);
    const ratingSnapshot = {};
    for (const i of interestsBefore) {
        const change = pointChanges.find(c => c.userId === i.userId);
        let skillRatingBefore = i.skillRating;
        let skillRatingAfter;
        if (isUtrMatch && change) {
            skillRatingBefore = change.before;
            skillRatingAfter = change.after;
        } else if (isTennisPadelMatch && change) {
            skillRatingAfter = parseFloat(Math.max(0, i.skillRating + change.change).toFixed(4));
        } else {
            const ptsBefore = i.totalPoints;
            const ptsAfter = change ? Math.max(0, ptsBefore + change.change) : ptsBefore;
            skillRatingAfter = parseFloat((ptsAfter / 100 * 5).toFixed(2));
        }
        ratingSnapshot[i.userId] = {
            username: userMap[i.userId]?.username || '',
            skillRating_before: skillRatingBefore,
            skillRating_after: skillRatingAfter ?? skillRatingBefore,
            change: change?.change || 0,
        };
    }
    let updated = await prisma.activityRequest.update({
        where: { id: request.id },
        data: { score: { ...request.score, ratingSnapshot } },
        include: { sender: { select: SENDER_SELECT } },
    });
    // Maç onaylanınca ELO değişimi anında UserInterest'e yazılıyor ama katılımcı dizisindeki
    // (participants/senderTeam) skillRating snapshot'ı eski kalıyordu — maç detayında "puanlar
    // güncellendi" bildirimi gelmesine rağmen kartta hâlâ eski ELO görünüyordu.
    updated = await enrichRivalWithRatings(updated);

    // Emit to all players so their screens update in real-time
    const allPlayerIds2 = [...new Set([request.senderId, ...participants.filter(p => p?.id).map(p => p.id)])];
    for (const uid of allPlayerIds2) emitToUser(uid, 'rivalUpdate', updated);

    // Akran doğrulama: rekabetçi voleybol maçı onaylandığında roster'daki herkese
    // (kendisi dahil, diğerlerini puanlasın diye) bildirim gönderilir. Hem manuel onay hem
    // 1 saatlik oto-onay job'u (autoCompleteMatches.js) bu fonksiyona çıktığı için tek nokta.
    if (PEER_REVIEW_SUBCATEGORIES.includes(request.subCategory) && request.matchMode === 'COMPETITIVE') {
        for (const uid of new Set(allPlayerIds)) {
            createNotification(
                uid, 'PEER_REVIEW_PROMPT',
                '🏐 Oyuncuları Değerlendir',
                'Takım arkadaşlarını değerlendirerek daha doğru bir eşleşme sistemine katkıda bulun.',
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

        const teamA = new Set([request.senderId, ...senderTeamArr.filter(m => m?.id).map(m => m.id)]);
        const teamB = new Set(participants.filter(p => p?.id).map(p => p.id));

        const confirmerInA = teamA.has(req.userId);
        const confirmerInB = teamB.has(req.userId);
        if (!confirmerInA && !confirmerInB) return res.status(403).json({ message: 'Forbidden' });

        const scorerInA = teamA.has(request.scoreEnteredBy);
        // Block: same team as scorer
        if (scorerInA && confirmerInA) return res.status(400).json({ message: 'Your team entered this score — wait for opponents to confirm' });
        if (!scorerInA && confirmerInB) return res.status(400).json({ message: 'Your team entered this score — wait for opponents to confirm' });

        const { updated, pointChanges } = await runScoreConfirmation(request);

        res.json(updated);

        // Kullanıcı isteği: uygulamanın tamamı Türkçe bildirim metni kullanıyor — bu bildirim
        // yanlışlıkla İngilizce yazılmış kalmış, diğerleriyle tutarlı hale getirildi.
        const eloMsg = pointChanges.length > 0 ? ` Maç sonucuna göre puanlar güncellendi.` : '';
        prisma.user.findUnique({ where: { id: req.userId }, select: { username: true } })
            .then(me => createNotification(
                request.scoreEnteredBy, 'SCORE_CONFIRMED',
                '✅ Skor Onaylandı!',
                `${me.username} maç skorunu onayladı.${eloMsg}`,
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

        const allIds = [...new Set([request.senderId, ...participants.filter(p => p?.id).map(p => p.id)])];
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
        const allPlayers = [{ id: request.senderId }, ...participants].filter(p => p?.id && p.id !== req.userId);
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
        const allIds = [request.senderId, ...participants.filter(p => p?.id).map(p => p.id)];

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
// Voleybolde hakem değerlendirmesi genel yıldızdan önce anket sorularını da içerir —
// diğer dallarda (tenis/padel/futbol vb.) bu sorular hiç sorulmuyor, sadece rating+comment var.
const REFEREE_QUESTION_FIELDS = ['ruleKnowledge', 'decisionConsistency', 'fairness', 'communication', 'gameManagement'];

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

        const questionData = {};
        if (match.subCategory === 'volleyball') {
            for (const field of REFEREE_QUESTION_FIELDS) {
                const v = parseInt(req.body[field], 10);
                if (!Number.isInteger(v) || v < 1 || v > 5)
                    return res.status(400).json({ message: 'Anket sorularının hepsi 1-5 arasında olmalı.' });
                questionData[field] = v;
            }
        }

        const listing = await prisma.refereeListing.findFirst({
            where: { userId: match.refereeId, category: match.category, subCategory: match.subCategory, status: 'ACTIVE' },
            select: { id: true },
        });

        const review = await prisma.refereeReview.upsert({
            where: { rivalId_reviewerId: { rivalId: id, reviewerId: req.userId } },
            update: { rating: r, comment: comment?.trim() || null, ...questionData },
            create: {
                rivalId: id, refereeUserId: match.refereeId, refereeListingId: listing?.id || null,
                reviewerId: req.userId, rating: r, comment: comment?.trim() || null, ...questionData,
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

// POST /rivals/:id/referee/dispute — kullanıcı isteği: kadronun çoğunluğu (aynı çoğunluk
// formülü — bkz. disputeSpectator/spectator.controller.js) mevcut hakeme itiraz ederse hakem
// maçtan otomatik çıkarılır ve hakeme bilgi verilir.
export const disputeReferee = async (req, res, next) => {
    try {
        const { id } = req.params;
        const match = await prisma.activityRequest.findUnique({ where: { id } });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (!match.refereeId) return res.status(400).json({ message: 'Bu maçta itiraz edilecek bir hakem yok' });
        if (match.refereeId === req.userId) return res.status(403).json({ message: 'Kendi hakemliğinize itiraz edemezsiniz' });

        const participants = Array.isArray(match.participants) ? match.participants : [];
        const senderTeamArr = Array.isArray(match.senderTeam) ? match.senderTeam : [];
        const rosterIds = [...new Set([match.senderId, ...participants.map(p => p?.id), ...senderTeamArr.map(m => m?.id)].filter(Boolean))];
        if (!rosterIds.includes(req.userId)) return res.status(403).json({ message: 'Bu maçın kadrosunda değilsiniz.' });

        const voterIds = new Set(Array.isArray(match.refereeDisputeVoterIds) ? match.refereeDisputeVoterIds : []);
        voterIds.add(req.userId);
        const majorityNeeded = Math.floor(rosterIds.length / 2) + 1;

        if (voterIds.size < majorityNeeded) {
            await prisma.activityRequest.update({ where: { id }, data: { refereeDisputeVoterIds: [...voterIds] } });
            return res.json({ resolved: false, voteCount: voterIds.size, majorityNeeded });
        }

        const removedRefereeId = match.refereeId;
        // Kullanıcı isteği: hakem çıkarılınca, kabul edilmiş ama sırada bekleyen (refereeQueue)
        // bir yedek hakem varsa otomatik olarak ilk sıradaki yeni hakem olur — sırada kimse
        // yoksa hakem slotu eskisi gibi boşa düşer (aranıyor durumuna döner).
        const queue = Array.isArray(match.refereeQueue) ? match.refereeQueue : [];
        const [promoted, ...restQueue] = queue;
        await prisma.activityRequest.update({
            where: { id },
            data: promoted
                ? { refereeId: promoted.userId, refereeDisputeVoterIds: [], refereeQueue: restQueue }
                : { refereeId: null, refereeDisputeVoterIds: [] },
        });

        res.json({ resolved: true, promoted: promoted || null });

        createNotification(
            removedRefereeId, 'REFEREE_REMOVED_BY_DISPUTE', '🚫 Hakemlikten Çıkarıldınız',
            'Bir maçta kadronun çoğunluğu hakemliğinize itiraz etti, bu maçtaki hakemlik göreviniz kaldırıldı.',
            { rivalId: id, category: match.category, subCategory: match.subCategory }
        ).catch(() => {});
        emitToUser(removedRefereeId, 'notification', {});

        if (promoted) {
            createNotification(
                promoted.userId, 'MATCH_CONFIRMED', '✅ Hakemliğe Terfi Ettiniz',
                `"${subCategoryTR(match.subCategory)}" maçında sırada beklediğiniz hakemlik şimdi size geçti.`,
                { rivalId: id, category: match.category, subCategory: match.subCategory }
            ).catch(() => {});
            emitToUser(promoted.userId, 'notification', {});
            removeSpectatorOnPromotion(id, promoted.userId, 'asıl hakemliğe', match.category, match.subCategory).catch(() => {});
        }
    } catch (error) { next(error); }
};

// Kullanıcı isteği: ilan sahibi, kadro çoğunluğunun oyuna ihtiyaç duyan disputeReferee'nin
// aksine, atanmış hakemi TEK BAŞINA (oy toplamadan) çıkarabilsin — ör. hakem yanıt vermiyor/
// uygun değilse başka birine davet göndermek için çıkmasını beklemek zorunda kalmasın.
export const removeReferee = async (req, res, next) => {
    try {
        const { id } = req.params;
        const match = await prisma.activityRequest.findUnique({ where: { id } });
        if (!match) return res.status(404).json({ message: 'Maç bulunamadı' });
        if (match.senderId !== req.userId) return res.status(403).json({ message: 'Forbidden' });
        if (!match.refereeId) return res.status(400).json({ message: 'Bu maçta çıkarılacak bir hakem yok' });

        const removedRefereeId = match.refereeId;
        // disputeReferee'deki aynı mantık: sırada bekleyen (refereeQueue) bir yedek hakem
        // varsa otomatik olarak ilk sıradaki yeni hakem olur, yoksa slot aranıyor durumuna döner.
        const queue = Array.isArray(match.refereeQueue) ? match.refereeQueue : [];
        const [promoted, ...restQueue] = queue;
        await prisma.activityRequest.update({
            where: { id },
            data: promoted
                ? { refereeId: promoted.userId, refereeDisputeVoterIds: [], refereeQueue: restQueue }
                : { refereeId: null, refereeDisputeVoterIds: [] },
        });

        res.json({ removed: true, promoted: promoted || null });

        createNotification(
            removedRefereeId, 'REFEREE_REMOVED_BY_OWNER', '🚫 Hakemlikten Çıkarıldınız',
            `İlan sahibi sizi "${subCategoryTR(match.subCategory)}" maçındaki hakemlik görevinden çıkardı.`,
            { rivalId: id, category: match.category, subCategory: match.subCategory }
        ).catch(() => {});
        emitToUser(removedRefereeId, 'notification', {});

        if (promoted) {
            createNotification(
                promoted.userId, 'MATCH_CONFIRMED', '✅ Hakemliğe Terfi Ettiniz',
                `"${subCategoryTR(match.subCategory)}" maçında sırada beklediğiniz hakemlik şimdi size geçti.`,
                { rivalId: id, category: match.category, subCategory: match.subCategory }
            ).catch(() => {});
            emitToUser(promoted.userId, 'notification', {});
            removeSpectatorOnPromotion(id, promoted.userId, 'asıl hakemliğe', match.category, match.subCategory).catch(() => {});
        }
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
            return parts.some(p => p?.id === myId);
        });

        // Kullanıcı raporu: Skor Bekleyen Maçlar'da (ve buradan girilen skor ekranında) ne
        // Atanmamış listesinde ne de takım kartlarında elo/derece puanı hiç görünmüyordu, takım
        // ortalaması da hesaplanamıyordu — getUpcomingMatches'in AKSİNE bu uç nokta hiçbir
        // zenginleştirme yapmadan ham senderTeam/participants/unassignedPlayers döndürüyordu
        // (hiçbirinde skillRating alanı yoktu). getUpcomingMatches'teki AYNI zenginleştirme
        // burada da uygulanıyor — izole try/catch, başarısız olursa ham veri dönülür.
        try {
            const allUserIds = [...new Set([
                ...result.map(m => m.senderId),
                ...result.flatMap(m => (Array.isArray(m.participants) ? m.participants : []).filter(p => p?.id).map(p => p.id)),
                ...result.flatMap(m => (Array.isArray(m.senderTeam) ? m.senderTeam : []).filter(p => p?.id).map(p => p.id)),
                ...result.flatMap(m => (Array.isArray(m.substitutePlayers) ? m.substitutePlayers : []).filter(p => p?.id).map(p => p.id)),
                ...result.flatMap(m => (Array.isArray(m.unassignedPlayers) ? m.unassignedPlayers : []).filter(p => p?.id).map(p => p.id)),
            ].filter(Boolean))];
            const interests = allUserIds.length > 0
                ? await prisma.userInterest.findMany({
                    where: { userId: { in: allUserIds } },
                    select: {
                        userId: true, subCategory: true, skillRating: true,
                        singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true,
                    },
                })
                : [];
            const ratingFor = (userId, subCategory, isDoubles) => teamDisplayRating(interests.find(i => i.userId === userId && i.subCategory === subCategory), subCategory, isDoubles);
            const enriched = result.map(m => {
                const mIsDoubles = isDoublesFormat(m);
                return {
                    ...m,
                    senderSkillRating: ratingFor(m.senderId, m.subCategory, mIsDoubles),
                    participants: (Array.isArray(m.participants) ? m.participants : []).filter(p => p?.id).map(p => ({
                        ...p, skillRating: ratingFor(p.id, m.subCategory, mIsDoubles),
                    })),
                    senderTeam: (Array.isArray(m.senderTeam) ? m.senderTeam : []).filter(p => p?.id).map(p => ({
                        ...p, skillRating: ratingFor(p.id, m.subCategory, mIsDoubles),
                    })),
                    substitutePlayers: (Array.isArray(m.substitutePlayers) ? m.substitutePlayers : []).map(p => p?.id ? ({
                        ...p, skillRating: ratingFor(p.id, m.subCategory, mIsDoubles),
                    }) : p),
                    unassignedPlayers: (Array.isArray(m.unassignedPlayers) ? m.unassignedPlayers : []).map(p => p?.id ? ({
                        ...p, skillRating: ratingFor(p.id, m.subCategory, mIsDoubles),
                    }) : p),
                };
            });
            return res.json(enriched);
        } catch (_) {
            return res.json(result);
        }
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
            return parts.some(p => p?.id === myId);
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

        // Henüz eşleşmemiş (OPEN) bir ilan olsa bile Pro/Premium işletmeden gerçek bir kort
        // rezervasyonu alınmış olabilir (venueReservationId) — cancelMatch'teki (MATCHED
        // maç iptali) ile AYNI mantık burada da uygulanmalı, aksi halde ilan silinip
        // rezervasyon sessizce elde kalıyordu (kullanıcı raporu: "maçı iptal ettiğimde
        // rezervasyon da iptal olucaktı, politikaya uymuyorsa işletmeye talep gönderildi
        // diye uyarı gelecekti" — bu OPEN ilan iptalinde hiç çalışmıyordu).
        const venueOutcome = await cancelLinkedVenueReservation(request);

        res.json({
            message: 'Cancelled',
            venuePolicyWarning: (venueOutcome && !venueOutcome.compliant)
                ? `İlanınız iptal edilmiştir. Ancak ${venueOutcome.venueName} işletmesinden aldığınız rezervasyon, işletmenin değiştirme/iptal politikalarına uymadığı için otomatik iptal edilmedi — işletmeye sizin adınıza bir iptal talebi gönderildi, onayı bekleniyor.`
                : undefined,
        });

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
        // Çiftler (DOUBLE) maçı dışında, voleybol/airsoft'ta değişken boyutlu takım için de
        // takım ismi ayarlanabilir — bkz. TeamAssignCard (SubCategoryScreen.js).
        const isVariableTeam = ['volleyball', 'airsoft'].includes(rival.subCategory) && (rival.teamSize || 1) > 1;
        if (rival.matchType !== 'DOUBLE' && !isVariableTeam)
            return res.status(400).json({ message: 'Sadece çiftler veya takım maçında takım ismi ayarlanabilir' });

        const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const isOwner = rival.senderId === req.userId;
        const isFounderSide = isOwner || senderTeamArr.some(p => p?.id === req.userId);
        const isOpponentSide = isOwner || participants.some(p => p?.id === req.userId);
        const allowed = side === 'founder' ? isFounderSide : isOpponentSide;
        if (!allowed) return res.status(403).json({ message: 'Bu takımın ismini değiştiremezsiniz' });

        const trimmed = (name || '').trim().slice(0, 24);
        let updated = await prisma.activityRequest.update({
            where: { id },
            data: side === 'founder'
                ? { founderTeamName: trimmed || null }
                : { opponentTeamName: trimmed || null },
            include: { sender: { select: SENDER_SELECT } },
        });
        updated = await enrichRivalWithRatings(updated);

        broadcast('rivalUpdate', updated);
        res.json(updated);
    } catch (error) { next(error); }
};

// Voleybol/airsoft: açık ilana katılıp "atanmamış" havuzuna düşen (bkz. respondToJoin'deki
// isExtraTeamJoin) bir oyuncuyu ilan sahibi Kurucu/Rakip takımına atar, ya da
// zaten bir tarafta olan birini geri "atanmamış"a alır/diğer tarafa taşır (yer değiştirme).
// İlan sahibi hariç kimse taşınamaz — o zaten sabit kurucu.
export const assignPlayerToSide = async (req, res, next) => {
    try {
        const { id } = req.params;
        // side: 'my' | 'opp' | null (null = atanmamışa geri al). userId gerçek kullanıcılar
        // için, manualName ise "Atanmamış" listesindeki uygulamayı kullanmayan (kayıtsız)
        // kişiler için — önceden sadece userId destekleniyordu, "Atanmamış" listesindeki
        // manuel isimlere dokununca hiçbir şey olmuyordu (kullanıcı raporu).
        const { userId, manualName, side } = req.body;
        if (![null, 'my', 'opp'].includes(side)) return res.status(400).json({ message: 'Geçersiz taraf' });
        if (!userId && !manualName) return res.status(400).json({ message: 'Oyuncu belirtilmedi' });

        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi oyuncu atayabilir' });
        if (!['volleyball', 'airsoft'].includes(rival.subCategory) || (rival.teamSize || 1) <= 1) {
            return res.status(400).json({ message: 'Bu işlem sadece takım maçlarında yapılabilir' });
        }
        if (userId && userId === rival.senderId) return res.status(400).json({ message: 'İlan sahibi taşınamaz' });

        const senderTeam = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const unassigned = Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : [];
        const matchPlayer = (p) => userId ? p?.id === userId : (!p?.id && p?.manualName === manualName);
        const player = senderTeam.find(matchPlayer) || participants.find(matchPlayer) || unassigned.find(matchPlayer);
        if (!player) return res.status(404).json({ message: 'Oyuncu bu ilanda bulunamadı' });

        const nextSenderTeam = senderTeam.filter(p => !matchPlayer(p));
        const nextParticipants = participants.filter(p => !matchPlayer(p));
        const nextUnassigned = unassigned.filter(p => !matchPlayer(p));
        // Her tarafın kontenjanı Takım Büyüklüğü ile sınırlı — kurucu zaten 1 kişilik sabit
        // slotu tuttuğu için senderTeam en fazla (teamSize-1) kişi alır, Rakip Takımı ise
        // tam teamSize. Bu kontrol nextSenderTeam/nextParticipants HENÜZ push() edilmeden
        // ÖNCE yapılıyor — yani "dolu mu" değil "push'tan SONRA dolacak/taşacak mı" sorusu
        // soruluyor, bu yüzden >= gerekiyor. Önceden > kullanılıyordu: takım TAM kapasitedeyken
        // (ör. 6v6'da senderTeam.length===5) kontrol yanlışlıkla geçiyor, 6. kişi push edilip
        // kapasite sessizce taşıyordu — o kişi de renderColumn'ın sabit slotsCount döngüsünde
        // (i=0..5) hiç render edilmediği için arayüzden "kayboluyordu" (kullanıcı raporu).
        const teamSizeN = rival.teamSize || 1;
        if (side === 'my' && nextSenderTeam.length >= teamSizeN - 1) {
            return res.status(400).json({ message: `Kurucu Takımı zaten dolu (${teamSizeN} kişilik kontenjan).` });
        }
        if (side === 'opp' && nextParticipants.length >= teamSizeN) {
            return res.status(400).json({ message: `Rakip Takımı zaten dolu (${teamSizeN} kişilik kontenjan).` });
        }
        if (side === 'my' || side === 'opp') {
            const sideArrFinal = [...(side === 'my' ? nextSenderTeam : nextParticipants), player];
            const perTeamGenderError = await perTeamGenderFeasible(rival, side, sideArrFinal);
            if (perTeamGenderError) return res.status(400).json({ message: perTeamGenderError });
            // Kendi tarafı için kapasite uygun olsa bile, bu atama karşı tarafı (ve havuzdaki
            // kalan kişileri) hesaba katınca iki tarafın da minimumunu imkansız hale
            // getirebilir (bkz. poolWideGenderFeasible) — ör. iki kadın da aynı tarafa atanırsa.
            const nextSenderTeamFinal = side === 'my' ? [...nextSenderTeam, player] : nextSenderTeam;
            const nextParticipantsFinal = side === 'opp' ? [...nextParticipants, player] : nextParticipants;
            const poolWideError = await poolWideGenderFeasible(rival, nextSenderTeamFinal, nextParticipantsFinal, nextUnassigned);
            if (poolWideError) return res.status(400).json({ message: poolWideError });
        }
        if (side === 'my') nextSenderTeam.push(player);
        else if (side === 'opp') nextParticipants.push(player);
        else nextUnassigned.push(player);

        // Kullanıcı isteği/bug raporu: bu fonksiyon sadece kimin hangi tarafta olduğunu
        // değiştiriyordu (toplam kadro dolulugunu ETKİLEMİYOR — atanmamış havuzu da zaten
        // dolu sayılıyor), ama status hiç kontrol edilmiyordu. Eğer bir önceki kabul adımı
        // (bkz. respondToJoin/isUnassignedInvite) kadroyu tamamlamış ama status hâlâ OPEN
        // kalmışsa, buradaki atama da o eksikliği fark etmeden geçiyordu — sonuç: dolu bir
        // kadro maç saati gelince "yeterli oyuncu bulunamadı" diye yanlışlıkla otomatik
        // iptal ediliyordu (bkz. cleanupRivals.js). Burada da (self-healing) kontrol edilir.
        const isFull = teamFilledCount(rival, { senderTeam: nextSenderTeam, participants: nextParticipants, unassignedPlayers: nextUnassigned }) >= totalPlayerCount(rival);
        const updatedRaw = await prisma.activityRequest.update({
            where: { id },
            data: {
                senderTeam: nextSenderTeam, participants: nextParticipants, unassignedPlayers: nextUnassigned,
                ...(isFull && rival.status !== 'MATCHED' && { status: 'MATCHED', reopenedAt: null }),
            },
            include: { sender: { select: SENDER_SELECT } },
        });

        // Kullanıcı raporu: atama sonrası oyuncuların yıldız/derece puanı bir anlığına
        // kayboluyordu — bu uç nokta (getUpcomingMatches/getRivalById'nin aksine) skillRating'i
        // hiç eklemeden ham diziyi yayınlıyordu, socket dinleyicisi bu ham veriyle önceden
        // zenginleştirilmiş listenin üzerine yazıyordu, sonraki onRefresh() düzeltene kadar
        // puanlar görünmüyordu. Artık broadcast/response'tan ÖNCE enrichRivalWithRatings ile
        // (sender.interests dahil — önceki elle yazılmış versiyon sadece kadro dizilerini
        // dolduruyor, kurucunun kendi rozetini hiç eklemiyordu) zenginleştiriliyor.
        const updated = await enrichRivalWithRatings(updatedRaw);

        broadcast('rivalUpdate', updated);
        if (userId) emitToUser(userId, 'rivalUpdate', updated);

        // Kullanıcı isteği: "son gördüğü halden sonra takımı değişirse kendisi ya da takım
        // arkadaşları her değişimde bildirim gitsin" — taşınan oyuncunun kendisine (gerçek
        // kullanıcıysa) VE mevcut kadrodaki herkese (ilan sahibi hariç) haber verilir.
        const movedName = userId ? (player.fullName || player.username) : player.manualName;
        const sideLabel = side === 'my' ? (updated.founderTeamName || 'Kurucu Takım') : side === 'opp' ? (updated.opponentTeamName || 'Rakip Takım') : 'Atanmamış';
        if (userId) {
            createNotification(userId, 'ROSTER_CHANGED', '🔄 Kadro Değişti',
                side ? `${sideLabel}'a atandın.` : 'Atanmamış listesine alındın.',
                { rivalId: id, category: updated.category, subCategory: updated.subCategory }
            ).catch(() => {});
        }
        notifyRosterChange(updated, {
            title: '🔄 Kadro Değişti',
            body: `${movedName || 'Bir oyuncu'} ${sideLabel}'a taşındı.`,
            excludeUserId: userId || undefined,
        });

        res.json(updated);
    } catch (error) { next(error); }
};

// Voleybol: bir takım slotuna yerleşmiş oyuncuya (kurucu hariç — o zaten sabit/kilitli)
// ekstra pozisyon etiketi (Libero/Pasör/Smaçör) atamak için — kullanıcı isteği: bu, ilan
// OLUŞTURMA formunda (bkz. TeamSlotRow/setSlotPosition) zaten vardı ama sadece yerel state'ti,
// submit'te backend'e hiç gönderilmiyordu. Artık ilan oluştuktan sonra da (açık ilan/yaklaşan
// maç kadro kartından) aynı pozisyon atanabiliyor ve kalıcı olarak saklanıyor.
export const setParticipantPosition = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { userId, position } = req.body;
        if (!userId) return res.status(400).json({ message: 'Oyuncu belirtilmedi' });
        if (position !== null && !['SPIKER', 'LIBERO', 'SETTER'].includes(position)) {
            return res.status(400).json({ message: 'Geçersiz pozisyon' });
        }
        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi pozisyon atayabilir' });
        if (rival.subCategory !== 'volleyball') {
            return res.status(400).json({ message: 'Bu işlem sadece voleybolda yapılabilir' });
        }

        let updated;
        // Kurucu (ilan sahibi) senderTeam/participants dizilerinin İÇİNDE değil — kendi
        // ilişkisinde (sender) tutulduğu için ayrı bir founderPosition alanına yazılır
        // (kullanıcı isteği: "ilanı oluşturan kişi kendine pozisyon atayamıyor onu da çöz").
        if (userId === rival.senderId) {
            updated = await prisma.activityRequest.update({
                where: { id },
                data: { founderPosition: position || null },
                include: { sender: { select: SENDER_SELECT } },
            });
        } else {
            const senderTeam = Array.isArray(rival.senderTeam) ? [...rival.senderTeam] : [];
            const participants = Array.isArray(rival.participants) ? [...rival.participants] : [];
            const substitutePlayers = Array.isArray(rival.substitutePlayers) ? [...rival.substitutePlayers] : [];
            const applyPosition = (arr) => {
                const idx = arr.findIndex(p => p?.id === userId);
                if (idx === -1) return false;
                if (position) arr[idx] = { ...arr[idx], position };
                else { const { position: _drop, ...rest } = arr[idx]; arr[idx] = rest; }
                return true;
            };
            const found = applyPosition(senderTeam) || applyPosition(participants) || applyPosition(substitutePlayers);
            if (!found) return res.status(404).json({ message: 'Oyuncu bu ilanda bulunamadı' });

            updated = await prisma.activityRequest.update({
                where: { id },
                data: { senderTeam, participants, substitutePlayers },
                include: { sender: { select: SENDER_SELECT } },
            });
        }
        updated = await enrichRivalWithRatings(updated);

        broadcast('rivalUpdate', updated);
        // Kullanıcı isteği: pozisyonu (ya da takımı) değişen kişiye her değişimde bildirim
        // gitsin — takım değişikliğindeki (ROSTER_CHANGED, bkz. assignPlayerToSide) ile aynı
        // tür/deep-link, kendi kendine atayınca (kurucu) tekrar bildirim gitmez.
        if (userId !== req.userId) {
            const posLabel = position === 'SPIKER' ? 'Smaçör' : position === 'LIBERO' ? 'Libero' : position === 'SETTER' ? 'Pasör' : null;
            createNotification(userId, 'ROSTER_CHANGED', '🔄 Kadro Değişti',
                posLabel ? `${posLabel} pozisyonuna atandın.` : 'Pozisyon ataman kaldırıldı.',
                { rivalId: id, category: updated.category, subCategory: updated.subCategory }
            ).catch(() => {});
        }
        res.json(updated);
    } catch (error) { next(error); }
};

// Kullanıcı isteği: ilan sahibi olmayan bir katılımcı da kendisi için bir pozisyon
// ÖNERebilsin (doğrudan atayamaz, o hâlâ sadece ilan sahibinde — bkz. setParticipantPosition
// yukarıda). Öneri ilan sahibine bildirim olarak gider, onay/red bkz. respondPositionSuggestion.
export const suggestOwnPosition = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { position } = req.body;
        if (!['SPIKER', 'LIBERO', 'SETTER'].includes(position)) {
            return res.status(400).json({ message: 'Geçersiz pozisyon' });
        }
        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.subCategory !== 'volleyball') {
            return res.status(400).json({ message: 'Bu işlem sadece voleybolda yapılabilir' });
        }
        if (rival.senderId === req.userId) {
            return res.status(400).json({ message: 'İlan sahibi kendine doğrudan pozisyon atayabilir, öneri göndermesine gerek yok' });
        }
        // Kullanıcı isteği: açık ilanda kabul edilen bireysel voleybol katılımcıları HER ZAMAN
        // önce "Atanmamış" havuzuna düşer (bkz. respondToJoin'deki isIndividualTeamJoin) — bu
        // yüzden unassignedPlayers de kontrol edilmezse en yaygın durumda (henüz takım ataması
        // yapılmamış katılımcı) öneri gönderilemiyor, "kadroda değilsiniz" hatası dönüyordu.
        const isParticipant = [
            ...(Array.isArray(rival.senderTeam) ? rival.senderTeam : []),
            ...(Array.isArray(rival.participants) ? rival.participants : []),
            ...(Array.isArray(rival.substitutePlayers) ? rival.substitutePlayers : []),
            ...(Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : []),
        ].some(p => p?.id === req.userId);
        if (!isParticipant) return res.status(403).json({ message: 'Bu maçın kadrosunda değilsiniz' });

        // Aynı kişinin önceki bekleyen önerisi varsa (henüz yanıtlanmamış) yenisiyle değişir.
        const existing = Array.isArray(rival.positionSuggestions) ? rival.positionSuggestions : [];
        const positionSuggestions = [
            ...existing.filter(s => s?.userId !== req.userId),
            { userId: req.userId, position, createdAt: new Date().toISOString() },
        ];
        const updated = await enrichRivalWithRatings(await prisma.activityRequest.update({ where: { id }, data: { positionSuggestions }, include: { sender: { select: SENDER_SELECT } } }));
        broadcast('rivalUpdate', updated);
        res.json(updated);

        const posLabel = position === 'SPIKER' ? 'Smaçör' : position === 'LIBERO' ? 'Libero' : 'Pasör';
        prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } })
            .then(me => createNotification(
                rival.senderId, 'POSITION_SUGGESTED', '🏐 Pozisyon Önerisi',
                `${me?.fullName || me?.username || 'Bir oyuncu'}, kendisi için ${posLabel} pozisyonunu öneriyor — onaylarsan o pozisyona atanır.`,
                { rivalId: id, category: rival.category, subCategory: rival.subCategory }
            ).catch(() => {})).catch(() => {});
    } catch (error) { next(error); }
};

// İlan sahibi bekleyen bir pozisyon önerisini onaylar (gerçek atama yapılır, bkz.
// setParticipantPosition'daki aynı applyPosition mantığı) ya da reddeder — reddederken iki
// hazır sebepten birini seçer, katılımcıya o sebeple bildirim gider.
export const respondPositionSuggestion = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { userId, action, rejectReason } = req.body;
        if (!userId) return res.status(400).json({ message: 'Oyuncu belirtilmedi' });
        if (!['approve', 'reject'].includes(action)) return res.status(400).json({ message: 'Geçersiz işlem' });
        if (action === 'reject' && !['CAN_ARRANGE_IN_MATCH', 'POSITION_FULL'].includes(rejectReason)) {
            return res.status(400).json({ message: 'Geçersiz red sebebi' });
        }
        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi öneriyi yanıtlayabilir' });

        const existing = Array.isArray(rival.positionSuggestions) ? rival.positionSuggestions : [];
        const suggestion = existing.find(s => s?.userId === userId);
        if (!suggestion) return res.status(404).json({ message: 'Bekleyen bir öneri bulunamadı' });
        const positionSuggestions = existing.filter(s => s?.userId !== userId);

        let updated;
        if (action === 'approve') {
            const senderTeam = Array.isArray(rival.senderTeam) ? [...rival.senderTeam] : [];
            const participants = Array.isArray(rival.participants) ? [...rival.participants] : [];
            const substitutePlayers = Array.isArray(rival.substitutePlayers) ? [...rival.substitutePlayers] : [];
            // Kullanıcı isteği: açık ilanda kabul edilen bireysel voleybol katılımcıları HER ZAMAN
            // önce "Atanmamış" havuzuna düşer — öneriyi onaylarken bu havuz da kontrol edilmezse
            // en yaygın durumda (henüz takım ataması yapılmamış katılımcı) "oyuncu bulunamadı"
            // hatası dönüyordu.
            const unassignedPlayers = Array.isArray(rival.unassignedPlayers) ? [...rival.unassignedPlayers] : [];
            const applyPosition = (arr) => {
                const idx = arr.findIndex(p => p?.id === userId);
                if (idx === -1) return false;
                arr[idx] = { ...arr[idx], position: suggestion.position };
                return true;
            };
            const found = applyPosition(senderTeam) || applyPosition(participants) || applyPosition(substitutePlayers) || applyPosition(unassignedPlayers);
            if (!found) return res.status(404).json({ message: 'Oyuncu bu ilanda bulunamadı' });
            updated = await prisma.activityRequest.update({
                where: { id },
                data: { senderTeam, participants, substitutePlayers, unassignedPlayers, positionSuggestions },
                include: { sender: { select: SENDER_SELECT } },
            });
        } else {
            updated = await prisma.activityRequest.update({ where: { id }, data: { positionSuggestions }, include: { sender: { select: SENDER_SELECT } } });
        }
        updated = await enrichRivalWithRatings(updated);
        broadcast('rivalUpdate', updated);
        res.json(updated);

        const posLabel = suggestion.position === 'SPIKER' ? 'Smaçör' : suggestion.position === 'LIBERO' ? 'Libero' : 'Pasör';
        if (action === 'approve') {
            createNotification(userId, 'POSITION_SUGGESTION_APPROVED', '✅ Pozisyon Önerin Onaylandı',
                `${posLabel} pozisyonuna atandın.`,
                { rivalId: id, category: rival.category, subCategory: rival.subCategory }
            ).catch(() => {});
        } else {
            const reasonText = rejectReason === 'POSITION_FULL'
                ? `${posLabel} pozisyonu zaten dolu.`
                : 'İlan sahibi bu öneriyi şimdilik onaylamadı — pozisyonunu maç içinde kendi aranızda ayarlayabilirsiniz.';
            createNotification(userId, 'POSITION_SUGGESTION_REJECTED', '😕 Pozisyon Önerin Onaylanmadı', reasonText,
                { rivalId: id, category: rival.category, subCategory: rival.subCategory }
            ).catch(() => {});
        }
    } catch (error) { next(error); }
};

// Kullanıcı isteği: "karşıdaki oyunculardan biri ile değiştirmek isteniyorsa tüm slotlar
// doluysa atanmamışa atıp sonra tekrar dağıtmakla uğraşmak yerine" — Değiştir/Çıkar menüsünde
// karşı taraf DOLUYKEN, o taraftaki bir oyuncunun ismine dokununca doğrudan YER DEĞİŞTİRİR:
// oyuncu A'nın slotuna karşı taraftaki B, B'nin slotuna A yerleşir (iki taraf da hep dolu
// kalır, kimse "Atanmamış"a düşmez). assignPlayerToSide'daki push-tabanlı taşımadan farklı
// olarak burada array INDEX'i (yani forma sırası) korunur.
export const swapTeamPlayers = async (req, res, next) => {
    try {
        const { id } = req.params;
        // userId/manualName: taşınan oyuncu (mover). swapUserId/swapManualName: karşı taraftaki,
        // yerine geçilecek oyuncu.
        const { userId, manualName, swapUserId, swapManualName } = req.body;
        if (!userId && !manualName) return res.status(400).json({ message: 'Oyuncu belirtilmedi' });
        if (!swapUserId && !swapManualName) return res.status(400).json({ message: 'Değişilecek oyuncu belirtilmedi' });

        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi oyuncu değiştirebilir' });
        if (!['volleyball', 'airsoft'].includes(rival.subCategory) || (rival.teamSize || 1) <= 1) {
            return res.status(400).json({ message: 'Bu işlem sadece takım maçlarında yapılabilir' });
        }
        if (userId === rival.senderId || swapUserId === rival.senderId) {
            return res.status(400).json({ message: 'İlan sahibi taşınamaz' });
        }

        const senderTeam = Array.isArray(rival.senderTeam) ? [...rival.senderTeam] : [];
        const participants = Array.isArray(rival.participants) ? [...rival.participants] : [];
        const matchMover = (p) => userId ? p?.id === userId : (!p?.id && p?.manualName === manualName);
        const matchTarget = (p) => swapUserId ? p?.id === swapUserId : (!p?.id && p?.manualName === swapManualName);

        const moverInSender = senderTeam.findIndex(matchMover);
        const moverInParts  = participants.findIndex(matchMover);
        const targetInSender = senderTeam.findIndex(matchTarget);
        const targetInParts  = participants.findIndex(matchTarget);

        if (moverInSender === -1 && moverInParts === -1) return res.status(404).json({ message: 'Oyuncu bu ilanda bulunamadı' });
        if (targetInSender === -1 && targetInParts === -1) return res.status(404).json({ message: 'Değişilecek oyuncu bu ilanda bulunamadı' });
        // İkisi de aynı tarafta olamaz — "değiş" tam olarak KARŞI takımla yer değiştirmek demek,
        // aksi halde assignPlayerToSide zaten aynı işi (basit taşıma) yapıyor.
        const moverSide  = moverInSender  !== -1 ? 'my' : 'opp';
        const targetSide = targetInSender !== -1 ? 'my' : 'opp';
        if (moverSide === targetSide) return res.status(400).json({ message: 'Sadece karşı takımdaki bir oyuncuyla yer değiştirilebilir' });

        const mover  = moverSide  === 'my' ? senderTeam[moverInSender]   : participants[moverInParts];
        const target = targetSide === 'my' ? senderTeam[targetInSender] : participants[targetInParts];

        if (moverSide === 'my') { senderTeam[moverInSender] = target; participants[targetInParts] = mover; }
        else { participants[moverInParts] = target; senderTeam[targetInSender] = mover; }

        // Takas iki tarafın da cinsiyet bileşimini değiştirebilir (dolulukları aynı kalsa bile) —
        // her iki taraf da MIN_PER_TEAM minimumunu SONRAKİ hâliyle hâlâ karşılıyor mu diye kontrol edilir.
        const moverSideErr = await perTeamGenderFeasible(rival, moverSide, moverSide === 'my' ? senderTeam : participants);
        if (moverSideErr) return res.status(400).json({ message: moverSideErr });
        const targetSideErr = await perTeamGenderFeasible(rival, targetSide, targetSide === 'my' ? senderTeam : participants);
        if (targetSideErr) return res.status(400).json({ message: targetSideErr });

        let updated = await prisma.activityRequest.update({
            where: { id },
            data: { senderTeam, participants },
            include: { sender: { select: SENDER_SELECT } },
        });
        updated = await enrichRivalWithRatings(updated);

        broadcast('rivalUpdate', updated);
        if (userId) emitToUser(userId, 'rivalUpdate', updated);
        if (swapUserId) emitToUser(swapUserId, 'rivalUpdate', updated);

        const moverName  = mover.fullName || mover.username || mover.manualName;
        const targetName = target.fullName || target.username || target.manualName;
        if (userId) {
            createNotification(userId, 'ROSTER_CHANGED', '🔄 Kadro Değişti',
                `${targetName} ile yer değiştirdin.`,
                { rivalId: id, category: updated.category, subCategory: updated.subCategory }
            ).catch(() => {});
        }
        if (swapUserId) {
            createNotification(swapUserId, 'ROSTER_CHANGED', '🔄 Kadro Değişti',
                `${moverName} ile yer değiştirdin.`,
                { rivalId: id, category: updated.category, subCategory: updated.subCategory }
            ).catch(() => {});
        }
        notifyRosterChange(updated, {
            title: '🔄 Kadro Değişti',
            body: `${moverName} ile ${targetName} yer değiştirdi.`,
            excludeUserId: [userId, swapUserId],
        });

        res.json(updated);
    } catch (error) { next(error); }
};

// İlan sahibi, uygulamayı kullanmayan (kayıtsız) bir oyuncuyu sadece isim yazarak doğrudan
// Kurucu/Rakip Takım'a ekleyebilir — kadro kartındaki TeamSlotInviteField'ın "Bu Oyuncu
// Kalsın" seçeneği (kullanıcı isteği). Bu kişiye davet/bildirim gitmez, çünkü hesabı yok —
// isim doğrudan yazılır. Kurucu tarafta ilan oluşturma formundakiyle aynı şekilde senderTeam
// içine {manualName} olarak, Rakip tarafta ayrı oppTeamManualNames dizisine eklenir.
export const addManualTeamPlayer = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, side, slotIndex, gender } = req.body; // slotIndex: kadro kartında hangi sıradaki forma yazıldıysa (0-index)
        if (!name || !name.trim()) return res.status(400).json({ message: 'İsim gerekli' });
        if (!['my', 'opp'].includes(side)) return res.status(400).json({ message: 'Geçersiz taraf' });
        if (!['MALE', 'FEMALE'].includes(gender)) return res.status(400).json({ message: 'Cinsiyet seçimi gerekli' });

        const rival = await prisma.activityRequest.findUnique({ where: { id } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi ekleyebilir' });
        if (!['volleyball', 'airsoft'].includes(rival.subCategory) || (rival.teamSize || 1) <= 1) {
            return res.status(400).json({ message: 'Bu işlem sadece takım maçlarında yapılabilir' });
        }
        // Rekabetçi maçta puan (Elo) kazanım/kaybı hesaplanıyor, hesabı olmayan bir oyuncunun
        // puanı olamayacağı için rekabetçi maça uygulamada kayıtlı olmayan oyuncu eklenemez —
        // sadece Antrenman modunda izin veriliyor (kullanıcı isteği).
        if (rival.matchMode === 'COMPETITIVE') {
            return res.status(400).json({ message: 'Rekabetçi maçlarda sadece uygulamaya kayıtlı oyuncular eklenebilir (Elo puanı gerekiyor).' });
        }
        const genderQuotaError = await checkGenderCountQuota(rival, gender);
        if (genderQuotaError) return res.status(400).json({ message: genderQuotaError });

        const teamSizeN = rival.teamSize || 1;
        const senderTeam = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const trimmed = name.trim().slice(0, 40);

        // Hangi forma yazıldıysa (slotIndex) tam o pozisyona yerleşir — dizinin sonuna değil
        // (kullanıcı isteği). Rakip tarafta artık ayrı oppTeamManualNames yerine doğrudan
        // participants içine {manualName} olarak yazılıyor — gerçek katılımcılarla AYNI
        // dizide olmadan pozisyonel sıralama (real+manuel karışık) mümkün olmuyordu. Eski
        // oppTeamManualNames alanı (ilan oluşturma formundaki eski kayıtlar için) hâlâ ayrıca
        // gösteriliyor, sadece buradan yeni eklenen isimler artık participants'a gidiyor.
        let data;
        if (side === 'my') {
            if (senderTeam.filter(p => p && (p.id || p.manualName)).length >= teamSizeN - 1) {
                return res.status(400).json({ message: 'Kurucu Takımı zaten dolu.' });
            }
            data = { senderTeam: setAtFounderSlot(senderTeam, slotIndex, { manualName: trimmed, gender }) };
        } else {
            const legacyOppManualCount = Array.isArray(rival.oppTeamManualNames) ? rival.oppTeamManualNames.length : 0;
            if (participants.filter(p => p && (p.id || p.manualName)).length + legacyOppManualCount >= teamSizeN) {
                return res.status(400).json({ message: 'Rakip Takımı zaten dolu.' });
            }
            data = { participants: setAtSlot(participants, slotIndex, { manualName: trimmed, gender }) };
        }

        const perTeamGenderError = await perTeamGenderFeasible(rival, side, side === 'my' ? data.senderTeam : data.participants);
        if (perTeamGenderError) return res.status(400).json({ message: perTeamGenderError });

        const isFullNow = teamFilledCount(rival, {
            senderTeam: data.senderTeam ?? senderTeam,
            participants: data.participants ?? participants,
        }) >= totalPlayerCount(rival);
        if (isFullNow) {
            data.status = 'MATCHED';
            data.reopenedAt = null;
        }

        let updated = await prisma.activityRequest.update({
            where: { id },
            data,
            include: { sender: { select: SENDER_SELECT } },
        });
        updated = await enrichRivalWithRatings(updated);

        broadcast('rivalUpdate', updated);

        // Kullanıcı isteği: kadro değiştiğinde mevcut takım arkadaşları da haberdar olsun.
        const sideLabel = side === 'my' ? (updated.founderTeamName || 'Kurucu Takım') : (updated.opponentTeamName || 'Rakip Takım');
        notifyRosterChange(updated, {
            title: '🔄 Kadro Değişti',
            body: `${trimmed} ${sideLabel}'a eklendi.`,
        });
        if (isFullNow) notifyOtherPendingOwnerInvitesOfFull(id, updated.category, updated.subCategory, [], rival.matchType);

        res.json(updated);
    } catch (error) { next(error); }
};

// Çiftler (tenis/padel) DOUBLE: kabul edilen bireysel katılımcılar artık doğrudan Takım
// Arkadaşı/Rakip 1/Rakip 2'ye yerleşmiyor, "atanmamış" havuzuna düşüyor (bkz.
// resolveDoubleAcceptance) — bu, o kişiyi adlandırılmış bir slota yerleştirir. Hem ilan
// sahibi (herkesi atayabilir) HEM DE atanan kişinin kendisi (sadece kendini, atanmamışken)
// çağırabilir — kullanıcı isteği: "ilanı açan atama yapar ya da kendileri geçmek istediği
// slota geçer".
export const assignDoubleSlot = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { userId, slot } = req.body; // slot: 'partner' | 'opp1' | 'opp2' | null (null = atanmamışa geri al)
        if (![null, 'partner', 'opp1', 'opp2'].includes(slot)) return res.status(400).json({ message: 'Geçersiz slot' });

        // Kullanıcı raporu: art arda hızlıca iki oyuncu taşınınca (ör. birini "karşıya taşı",
        // hemen ardından "atanmamış"tan birini "takımlara ata") ikinci işlem bazen sessizce
        // kayboluyordu — ikisi de AYNI ilanın eski (findUnique anındaki) kopyasını okuyup kendi
        // hesapladığı senderTeam/participants/unassignedPlayers'ı YAZIYORDU, geç biten önceki
        // işlemin sonucunu sessizce eziyordu (klasik "lost update" — hiçbir hata da dönmüyordu).
        // Serializable izolasyonlu transaction + çakışmada tek seferlik yeniden deneme bunu
        // önler: Postgres iki işlem aynı satırı çakışacak şekilde değiştirmeye çalışınca birini
        // P2034 ile reddeder, o da baştan (GÜNCEL veriyle) tekrar dener.
        let updated;
        let attempt = 0;
        while (true) {
            attempt++;
            try {
                updated = await prisma.$transaction(async (tx) => {
                    const rival = await tx.activityRequest.findUnique({ where: { id } });
                    if (!rival) { const e = new Error('İlan bulunamadı'); e.status = 404; throw e; }
                    if (rival.matchType !== 'DOUBLE') { const e = new Error('Bu işlem sadece çiftler ilanlarında yapılabilir'); e.status = 400; throw e; }
                    const isOwner = rival.senderId === req.userId;
                    if (!isOwner && req.userId !== userId) { const e = new Error('Sadece ilan sahibi ya da kendiniz atama yapabilir'); e.status = 403; throw e; }
                    if (userId === rival.senderId) { const e = new Error('İlan sahibi taşınamaz'); e.status = 400; throw e; }

                    const senderTeam = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
                    const participants = Array.isArray(rival.participants) ? rival.participants : [];
                    const unassigned = Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : [];
                    const player = senderTeam.find(p => p?.id === userId) || participants.find(p => p?.id === userId) || unassigned.find(p => p?.id === userId);
                    if (!player) { const e = new Error('Oyuncu bu ilanda bulunamadı'); e.status = 404; throw e; }

                    // Kendini atayan kişi (owner değilse) sadece atanmamışken hareket edebilir —
                    // zaten yerleşmiş birini owner dışında kimse oynatamaz.
                    const alreadyPlaced = senderTeam.some(p => p?.id === userId) || participants.some(p => p?.id === userId);
                    if (!isOwner && alreadyPlaced) { const e = new Error('Zaten bir slottasınız, yerinizi sadece ilan sahibi değiştirebilir'); e.status = 403; throw e; }

                    if (slot) {
                        const gReq = slot === 'partner' ? rival.partnerGenderReq : slot === 'opp1' ? rival.opp1GenderReq : rival.opp2GenderReq;
                        const occupant = slot === 'partner' ? senderTeam[0] : slot === 'opp1' ? participants[0] : participants[1];
                        if (occupant?.id && occupant.id !== userId) {
                            const e = new Error(`${slot === 'partner' ? 'Takım Arkadaşı' : slot === 'opp1' ? 'Rakip 1' : 'Rakip 2'} slotu zaten dolu`); e.status = 400; throw e;
                        }
                        if (gReq && gReq !== 'MIX') {
                            const gUser = await tx.user.findUnique({ where: { id: userId }, select: { gender: true } });
                            if (gUser?.gender !== 'OTHER') {
                                if (!gUser?.gender) { const e = new Error('Bu oyuncunun profilinde cinsiyet bilgisi girilmemiş, bu yüzden cinsiyete özel bir slota atanamıyor.'); e.status = 400; throw e; }
                                if (gUser.gender !== gReq) { const e = new Error(`Bu slot için ilan yalnızca ${gReq === 'MALE' ? 'erkek' : 'kadın'} oyuncular kabul ediyor.`); e.status = 400; throw e; }
                            }
                        }
                    }

                    const nextSenderTeam = senderTeam.filter(p => p?.id !== userId);
                    const nextParticipants = [participants[0]?.id === userId ? null : participants[0] || null, participants[1]?.id === userId ? null : participants[1] || null];
                    const nextUnassigned = unassigned.filter(p => p?.id !== userId);
                    if (slot === 'partner') nextSenderTeam.push(player);
                    else if (slot === 'opp1') nextParticipants[0] = player;
                    else if (slot === 'opp2') nextParticipants[1] = player;
                    else nextUnassigned.push(player);

                    return tx.activityRequest.update({
                        where: { id },
                        data: { senderTeam: nextSenderTeam, participants: nextParticipants, unassignedPlayers: nextUnassigned },
                        include: { sender: { select: SENDER_SELECT } },
                    });
                }, { isolationLevel: 'Serializable' });
                break;
            } catch (err) {
                if (err.code === 'P2034' && attempt < 3) continue; // çakışma — güncel veriyle tekrar dene
                if (err.status) return res.status(err.status).json({ message: err.message });
                throw err;
            }
        }

        updated = await enrichRivalWithRatings(updated);
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
        // Kullanıcı isteği: sadece ilan sahibi değil, kadrodaki oyuncu kendi isteğiyle de
        // maçtan ayrılabilmeli — "Ayrıl" butonu bu ucu userId=kendi id'si ile çağırır. Sahip
        // dışı ayrılmalarda aşağıda cancelMatch'teki AYNI iptal cezası algoritması uygulanır.
        const isSelfLeave = userId === req.userId && rival.senderId !== req.userId;
        if (rival.senderId !== req.userId && !isSelfLeave) return res.status(403).json({ message: 'Sadece ilan sahibi katılımcı çıkarabilir' });

        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const unassignedArr = Array.isArray(rival.unassignedPlayers) ? rival.unassignedPlayers : [];
        const subsArr = Array.isArray(rival.substitutePlayers) ? rival.substitutePlayers : [];
        const inParticipants = participants.some(p => p?.id === userId);
        const inSenderTeam  = senderTeamArr.some(p => p?.id === userId);
        // Atanmamış havuzunda (henüz hiçbir slota yerleşmemiş) biri de çıkarılabilmeli —
        // DOUBLE'da cinsiyet kısıtlaması yüzünden kalan tek boş slota hiç uymayan biri
        // (ör. erkek kalan tek boş slot kadın-kısıtlıysa) kalıcı olarak Atanmamış'ta sıkışıp
        // kalıyordu, ne owner atayabiliyordu ne de çıkarabiliyordu (kullanıcı raporu).
        const inUnassigned = unassignedArr.some(p => p?.id === userId);
        // Yedek listesindeki biri de çıkarılabilmeli — kullanıcı raporu: "kadro kartta oyuncuya
        // tıklandığında maçtan çıkar da olsun, atama yapmadan/yedek listeden de olabilmeli".
        const inSubs = subsArr.some(p => p?.id === userId);
        if (!inParticipants && !inSenderTeam && !inUnassigned && !inSubs) return res.status(404).json({ message: 'Bu kullanıcı katılımcı listesinde değil' });
        // Sadece yedek listesindeyse (ana kadroda/atanmamışta değil) terfi/yeniden açma
        // mantığının hiçbiri geçerli değil — düz bir dizi filtrelemesi yeterli.
        if (inSubs && !inParticipants && !inSenderTeam && !inUnassigned) {
            const updatedSubs = subsArr.filter(p => p?.id !== userId);
            let updated = await prisma.activityRequest.update({
                where: { id },
                data: { substitutePlayers: updatedSubs },
                include: { sender: { select: SENDER_SELECT } },
            });
            await prisma.rivalJoinRequest.updateMany({
                where: { rivalId: id, userId, status: 'ACCEPTED' },
                data: { status: 'REJECTED' },
            });
            updated = await enrichRivalWithRatings(updated);
            broadcast('rivalUpdate', updated);
            emitToUser(userId, 'rivalUpdate', updated);
            res.json({ removed: [userId], request: updated });
            // Yedek listesinden ayrılan/çıkarılan henüz asıl kadroda oynamayı taahhüt etmediği
            // için burada ceza yok — sadece owner'a mı katılımcının kendisine mi bildirim
            // gideceği isSelfLeave'e göre değişir.
            if (isSelfLeave) {
                createNotification(rival.senderId, 'MATCH_CANCELLED',
                    '⚠️ Bir Yedek Ayrıldı',
                    `Bir oyuncu "${subCategoryTR(rival.subCategory)}" ilanınızın yedek listesinden ayrıldı.`,
                    { rivalId: id, category: rival.category, subCategory: rival.subCategory }
                ).catch(() => {});
            } else {
                createNotification(userId, 'MATCH_CANCELLED',
                    '⚠️ Katılımınız Kaldırıldı',
                    `${rival.sender?.username || 'İlan sahibi'} sizi "${subCategoryTR(rival.subCategory)}" ilanının yedek listesinden çıkardı.`,
                    { rivalId: id, category: rival.category, subCategory: rival.subCategory }
                ).catch(() => {});
            }
            return;
        }

        const removeIds = [userId];
        // DOUBLE maçlarda participants[0]=Rakip 1, participants[1]=Rakip 2 sabit konumludur
        // (bkz. swapMatchPositions'daki getP) — .filter() ile çıkarılan slotu diziden atmak,
        // kalan oyuncuyu index 0'a kaydırıp onu yanlışlıkla Rakip 1 gibi göstermeye/okumaya
        // sebep oluyordu. Konumu null ile boşaltıp diziyi olduğu gibi bırakıyoruz.
        const updatedParticipants = inParticipants ? participants.map(p => (removeIds.includes(p?.id) ? null : p)) : participants;
        const updatedSenderTeam   = inSenderTeam  ? senderTeamArr.filter(p => !removeIds.includes(p?.id)) : senderTeamArr;
        const updatedUnassigned  = inUnassigned  ? unassignedArr.filter(p => p?.id !== userId) : unassignedArr;

        const wasMatched = rival.status === 'MATCHED';

        // Kullanıcı isteği: kendi isteğiyle ayrılan bir oyuncuya, cancelMatch'teki AYNI
        // "geç iptal" ceza penceresi/miktarı uygulanır (owner tarafından çıkarılanlara ceza
        // uygulanmaz — o kendi tercihi değil). Voleybolde ilan sahibinin belirlediği
        // cancelPenaltyHours (belirlemediyse ceza yok), diğer dallarda sabit 5 saat/-0.20.
        const isVolleyballLeave = rival.subCategory === 'volleyball';
        const leavePenaltyWindowHours = isVolleyballLeave ? rival.cancelPenaltyHours : 5;
        const leavePenaltyAmount = isVolleyballLeave ? 0.10 : 0.20;
        let leaveWithinPenaltyWindow = false;
        if (isSelfLeave && leavePenaltyWindowHours != null && rival.matchDate && rival.matchTime) {
            const matchStart = turkeyDateTimeToUtc(rival.matchDate, rival.matchTime);
            const hoursUntil = (matchStart - new Date()) / (1000 * 60 * 60);
            leaveWithinPenaltyWindow = hoursUntil > 0 && hoursUntil <= leavePenaltyWindowHours;
        }

        // Voleybol: dolu bir maçtan biri çıkarılınca, bekleyen bir Yedek varsa (kullanıcı
        // isteği) ilan tekrar açılıp herkese sunulmak yerine sırada bekleyen ilk yedek
        // doğrudan asıl kadroya terfi ettirilir — maç MATCHED kalmaya devam eder. Yedek
        // yoksa aşağıdaki eski davranış (ilan yeniden açılır) aynen çalışır.
        let finalParticipants = updatedParticipants;
        let finalSenderTeam = updatedSenderTeam;
        let finalUnassigned = updatedUnassigned;
        let promotedSub = null;
        let remainingSubs = null;
        // DOUBLE/SINGLE (tenis/padel vb.): kendi substituteCount/substitutePlayers sistemi yok —
        // bunun yerine sınırsız kapasiteli waitlistPlayers kullanılır (bkz. placeInDoubleWaitlistOrReject).
        // Terfi eden kişi SPESİFİK bir named slota (Rakip 1/2 gibi) DEĞİL, atanmamış havuzuna
        // düşer — hangi role gideceğini ilan sahibi normal "Takıma Ata" akışıyla seçer, bu sayede
        // terfi eden kişinin cinsiyeti boşalan slotla uyuşmasa bile hatasız çalışır.
        let promotedFromWaitlist = null;
        let remainingWaitlist = null;
        if (wasMatched && rival.subCategory === 'volleyball') {
            const subs = Array.isArray(rival.substitutePlayers) ? rival.substitutePlayers : [];
            if (subs.length > 0) {
                promotedSub = subs[0];
                remainingSubs = subs.slice(1);
                if (inParticipants) {
                    const vacatedIndex = participants.findIndex(p => removeIds.includes(p?.id));
                    finalParticipants = setAtSlot(updatedParticipants, vacatedIndex, promotedSub);
                } else if (inSenderTeam) {
                    finalSenderTeam = [...updatedSenderTeam, promotedSub];
                }
            }
        } else if (wasMatched && (rival.matchType === 'DOUBLE' || rival.matchType === 'SINGLE')) {
            const waitlist = Array.isArray(rival.waitlistPlayers) ? rival.waitlistPlayers : [];
            if (waitlist.length > 0) {
                promotedFromWaitlist = waitlist[0];
                remainingWaitlist = waitlist.slice(1);
                finalUnassigned = [...updatedUnassigned, promotedFromWaitlist];
            }
        }
        const promoted = promotedSub || promotedFromWaitlist;
        const staysMatched = !!promoted;

        let updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                participants: finalParticipants,
                senderTeam: finalSenderTeam,
                unassignedPlayers: finalUnassigned,
                ...(promotedSub && { substitutePlayers: remainingSubs }),
                ...(promotedFromWaitlist && { waitlistPlayers: remainingWaitlist }),
                // Terfi anı kaydedilir — terfi eden kişi iptal politikası uymasa bile
                // terfiden sonraki 1 saat içinde şartsız çıkabilir (bkz. leaveAsPromotedSubstitute).
                ...(promotedSub?.id && { substitutePromotedAt: { ...(rival.substitutePromotedAt || {}), [promotedSub.id]: new Date().toISOString() } }),
                status: staysMatched ? 'MATCHED' : 'OPEN',
                receiverId: staysMatched ? rival.receiverId : null,
                schedulingDeadline: staysMatched ? rival.schedulingDeadline : null,
                // matchDate/matchTime yalnızca esnek programlı ilanlarda (eşleşme sonrası
                // belirlendiği için) sıfırlanır — sabit tarih/saatli ilanlarda bunlar
                // kort rezervasyonuyla birlikte ilan sahibinin kendi belirlediği bilgidir,
                // bir katılımcı çıkarıldı diye kaybolmamalı (kort rezervesi zaten duruyor).
                ...(rival.flexibleSchedule && !staysMatched && { matchDate: null, matchTime: null }),
                // Maç doluyken açılan bir slot — sonraki kabul (kimi kabul ederse etsin,
                // süre farketmeksizin) joiner'dan son onay ister (bkz. respondToJoin).
                // Yedek terfi ettiyse maç zaten dolu kaldığı için bu akışa hiç girmiyor.
                ...(wasMatched && !staysMatched && { reopenedAt: new Date() }),
            },
            include: { sender: { select: SENDER_SELECT } },
        });
        updated = await enrichRivalWithRatings(updated);

        // cancelMatch'teki AYNI ceza uygulaması — sadece kendi isteğiyle ayrılan kişiye.
        if (leaveWithinPenaltyWindow) {
            const interest = await prisma.userInterest.findFirst({
                where: { userId: req.userId, category: rival.category, subCategory: rival.subCategory },
            });
            if (interest) {
                const newCount = interest.lateCancelCount + 1;
                await prisma.userInterest.update({
                    where: { id: interest.id },
                    data: {
                        ...buildPenaltyUpdate(interest, rival.subCategory, isDoublesFormat(rival), leavePenaltyAmount),
                        totalPoints: Math.max(0, interest.totalPoints - Math.round(leavePenaltyAmount * 20)),
                        lateCancelCount: newCount,
                    },
                });
                if (newCount === 5) {
                    createNotification(req.userId, 'LATE_CANCEL_WARNING',
                        '⚠️ Son Dakika İptal Uyarısı',
                        `${subCategoryTR(rival.subCategory)} dalında 5 kez maçı son ${leavePenaltyWindowHours} saat içinde iptal ettiniz. Bu durum profilinizde görünür ve güvenilirliğinizi olumsuz etkiler.`,
                        { subCategory: rival.subCategory }
                    ).catch(() => {});
                }
            }
        }

        await prisma.rivalJoinRequest.updateMany({
            where: { rivalId: id, userId: { in: removeIds }, status: 'ACCEPTED' },
            data: { status: 'REJECTED' },
        });
        // Terfi eden yedeğin/waitlist'in bekleyen "yedek olarak başvur"/onaylanmış-ama-bekleyen
        // isteği varsa artık asıl kadroda, ayrıca bir kabul/red beklemesine gerek yok.
        if (promoted?.id) {
            await prisma.rivalJoinRequest.updateMany({
                where: { rivalId: id, userId: promoted.id, status: 'PENDING' },
                data: { status: 'ACCEPTED' },
            }).catch(() => {});
        }

        broadcast('rivalUpdate', updated);
        for (const uid of removeIds) emitToUser(uid, 'rivalUpdate', updated);
        if (promoted?.id) emitToUser(promoted.id, 'rivalUpdate', updated);

        res.json({ removed: removeIds, request: updated, penaltyApplied: leaveWithinPenaltyWindow, penaltyAmount: leaveWithinPenaltyWindow ? leavePenaltyAmount : undefined });

        const senderName = rival.sender?.username || 'İlan sahibi';
        // Kendi isteğiyle ayrılana kendi ayrılışını "çıkarıldı" diye bildirmeye gerek yok —
        // o zaten aksiyonu kendi yaptı, sadece owner'a ve kadroya haber verilir.
        if (!isSelfLeave) {
            for (const uid of removeIds) {
                createNotification(uid, 'MATCH_CANCELLED',
                    '⚠️ Katılımınız Kaldırıldı',
                    staysMatched
                        ? `${senderName} sizi "${subCategoryTR(rival.subCategory)}" ilanından çıkardı. Yerinize bir yedek oyuncu geçti, maç dolu kaldı.`
                        : `${senderName} sizi "${subCategoryTR(rival.subCategory)}" ilanından çıkardı. İlan tekrar açık hâle geldi.`,
                    { rivalId: id, category: rival.category, subCategory: rival.subCategory }
                ).catch(() => {});
            }
        } else {
            createNotification(rival.senderId, 'MATCH_CANCELLED',
                '⚠️ Bir Oyuncu Ayrıldı',
                staysMatched
                    ? `Bir oyuncu "${subCategoryTR(rival.subCategory)}" ilanınızdan ayrıldı. Yerine bir yedek oyuncu geçti, maç dolu kaldı.`
                    : `Bir oyuncu "${subCategoryTR(rival.subCategory)}" ilanınızdan ayrıldı. İlan tekrar açık hâle geldi.`,
                { rivalId: id, category: rival.category, subCategory: rival.subCategory }
            ).catch(() => {});
        }
        // Yedekten/yedek listesinden asıl kadroya terfi — maçı kaçırmasın diye yüksek öncelikli push.
        if (promoted?.id) {
            createNotification(promoted.id, 'MATCH_CONFIRMED',
                '🚨 Yedekten Asıl Kadroya Geçtiniz!',
                `"${subCategoryTR(rival.subCategory)}" maçında kadrodan biri ayrıldı, yerine siz asıl kadroya alındınız — maçınız var! Katılım sağlayamayacaksanız, iptal şartlarına uymasa bile terfiden itibaren 1 saat içinde şartsız iptal çekme hakkınız bulunmaktadır.`,
                { rivalId: id, category: rival.category, subCategory: rival.subCategory },
                'high'
            ).catch(() => {});
            removeSpectatorOnPromotion(id, promoted.id, 'asıl kadroya', rival.category, rival.subCategory).catch(() => {});
        }
        // Kullanıcı isteği: kadro değiştiğinde (biri çıkarıldığında) kalan takım
        // arkadaşları da haberdar olsun.
        const removedName = (Array.isArray(rival.participants) ? rival.participants : []).find(p => p?.id === userId)?.username
            || (Array.isArray(rival.senderTeam) ? rival.senderTeam : []).find(p => p?.id === userId)?.username
            || 'Bir oyuncu';
        notifyRosterChange(updated, {
            title: '🔄 Kadro Değişti',
            body: promoted
                ? `${removedName} takımdan çıkarıldı, yerine bir yedek oyuncu asıl kadroya alındı.`
                : `${removedName} takımdan çıkarıldı.`,
            excludeUserId: userId,
        });
        // Maç doluyken bu değişiklik olduysa VE yerini dolduran bir yedek yoksa, ilana
        // bekleyen istek göndermiş herkese de haber ver — belki artık uygun değillerdir
        // ya da tam tersi. Yedek terfi ettiyse maç zaten dolu, bu bildirime gerek yok.
        if (wasMatched && !staysMatched) notifyPendingRequestersOfReopen(id, rival.category, rival.subCategory, removeIds);
    } catch (error) { next(error); }
};

// Terfi eden yedeğin kendi isteğiyle, iptal politikasına bakılmaksızın terfiden sonraki 1 saat
// içinde şartsız çıkabilmesi için — removeRivalParticipant'taki güvenli tekli-slot boşaltma +
// sıradaki yedeği terfi ettirme mantığının aynısı, ama owner değil kullanıcının kendisi tetikliyor
// ve sadece substitutePromotedAt penceresi içindeyse izin veriyor. cancelMatch'in joiner-tarafı
// dalı participants'ı tamamen sıfırladığı için (voleybol gibi çok kişili kadrolarda yıkıcı)
// bilinçli olarak KULLANILMADI, bunun yerine removeRivalParticipant'ın güvenli tek-slot mantığı
// tekrarlandı.
export const leaveAsPromotedSubstitute = async (req, res, next) => {
    try {
        const { id } = req.params;
        const userId = req.userId;
        const rival = await prisma.activityRequest.findUnique({ where: { id }, include: { sender: { select: SENDER_SELECT } } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });

        const promotedAt = rival.substitutePromotedAt?.[userId];
        if (!promotedAt) return res.status(403).json({ message: 'Bu ilanda terfi kaydınız yok' });
        const hoursSincePromotion = (Date.now() - new Date(promotedAt).getTime()) / 3600000;
        if (hoursSincePromotion > 1) return res.status(400).json({ message: 'Şartsız çıkış hakkı süresi (1 saat) doldu' });

        const participants = Array.isArray(rival.participants) ? rival.participants : [];
        const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
        const inParticipants = participants.some(p => p?.id === userId);
        const inSenderTeam = senderTeamArr.some(p => p?.id === userId);
        if (!inParticipants && !inSenderTeam) return res.status(404).json({ message: 'Asıl kadroda değilsiniz' });

        const updatedParticipants = inParticipants ? participants.map(p => (p?.id === userId ? null : p)) : participants;
        const updatedSenderTeam = inSenderTeam ? senderTeamArr.filter(p => p?.id !== userId) : senderTeamArr;

        const wasMatched = rival.status === 'MATCHED';
        let finalParticipants = updatedParticipants;
        let finalSenderTeam = updatedSenderTeam;
        let promotedSub = null;
        let remainingSubs = null;
        if (wasMatched) {
            const subs = Array.isArray(rival.substitutePlayers) ? rival.substitutePlayers : [];
            if (subs.length > 0) {
                promotedSub = subs[0];
                remainingSubs = subs.slice(1);
                if (inParticipants) {
                    const vacatedIndex = participants.findIndex(p => p?.id === userId);
                    finalParticipants = setAtSlot(updatedParticipants, vacatedIndex, promotedSub);
                } else if (inSenderTeam) {
                    finalSenderTeam = [...updatedSenderTeam, promotedSub];
                }
            }
        }
        const staysMatched = !!promotedSub;

        const restPromoted = { ...(rival.substitutePromotedAt || {}) };
        delete restPromoted[userId];

        let updated = await prisma.activityRequest.update({
            where: { id },
            data: {
                participants: finalParticipants,
                senderTeam: finalSenderTeam,
                ...(promotedSub && { substitutePlayers: remainingSubs }),
                substitutePromotedAt: promotedSub?.id ? { ...restPromoted, [promotedSub.id]: new Date().toISOString() } : restPromoted,
                status: staysMatched ? 'MATCHED' : 'OPEN',
                receiverId: staysMatched ? rival.receiverId : null,
                schedulingDeadline: staysMatched ? rival.schedulingDeadline : null,
                ...(rival.flexibleSchedule && !staysMatched && { matchDate: null, matchTime: null }),
                ...(wasMatched && !staysMatched && { reopenedAt: new Date() }),
            },
            include: { sender: { select: SENDER_SELECT } },
        });
        updated = await enrichRivalWithRatings(updated);

        await prisma.rivalJoinRequest.updateMany({
            where: { rivalId: id, userId, status: 'ACCEPTED' },
            data: { status: 'REJECTED' },
        });
        if (promotedSub?.id) {
            await prisma.rivalJoinRequest.updateMany({
                where: { rivalId: id, userId: promotedSub.id, status: 'PENDING' },
                data: { status: 'ACCEPTED' },
            }).catch(() => {});
        }

        broadcast('rivalUpdate', updated);
        emitToUser(userId, 'rivalUpdate', updated);
        if (promotedSub?.id) emitToUser(promotedSub.id, 'rivalUpdate', updated);

        res.json({ left: true, request: updated });

        createNotification(rival.senderId, 'MATCH_CANCELLED',
            '⚠️ Yedek Oyuncu Ayrıldı',
            staysMatched
                ? `Terfi ettirdiğiniz yedek oyuncu "${subCategoryTR(rival.subCategory)}" maçından şartsız çıkış hakkını kullanarak ayrıldı. Yerine bir sonraki yedek geçti, maç dolu kaldı.`
                : `Terfi ettirdiğiniz yedek oyuncu "${subCategoryTR(rival.subCategory)}" maçından şartsız çıkış hakkını kullanarak ayrıldı. İlan tekrar açık hâle geldi.`,
            { rivalId: id, category: rival.category, subCategory: rival.subCategory }
        ).catch(() => {});
        if (promotedSub?.id) {
            createNotification(promotedSub.id, 'MATCH_CONFIRMED',
                '🚨 Yedekten Asıl Kadroya Geçtiniz!',
                `"${subCategoryTR(rival.subCategory)}" maçında kadrodan biri ayrıldı, yerine siz asıl kadroya alındınız — maçınız var! Katılım sağlayamayacaksanız, iptal şartlarına uymasa bile terfiden itibaren 1 saat içinde şartsız iptal çekme hakkınız bulunmaktadır.`,
                { rivalId: id, category: rival.category, subCategory: rival.subCategory },
                'high'
            ).catch(() => {});
            removeSpectatorOnPromotion(id, promotedSub.id, 'asıl kadroya', rival.category, rival.subCategory).catch(() => {});
        }
        const leftName = (Array.isArray(rival.participants) ? rival.participants : []).find(p => p?.id === userId)?.username
            || (Array.isArray(rival.senderTeam) ? rival.senderTeam : []).find(p => p?.id === userId)?.username
            || 'Bir oyuncu';
        notifyRosterChange(updated, {
            title: '🔄 Kadro Değişti',
            body: promotedSub
                ? `${leftName} takımdan ayrıldı, yerine bir yedek oyuncu asıl kadroya alındı.`
                : `${leftName} takımdan ayrıldı.`,
            excludeUserId: userId,
        });
        if (wasMatched && !staysMatched) notifyPendingRequestersOfReopen(id, rival.category, rival.subCategory, [userId]);
    } catch (error) { next(error); }
};

// Pro/Premium işletmeden alınan gerçek bir kort rezervasyonuna bağlı tenis/padel maçı iptal
// edilirken tesisin kendi iptal politikasına (cancelHoursBefore) bakılır: politika dahilindeyse
// rezervasyon da otomatik iptal edilir, değilse rezervasyona dokunulmaz ve kullanıcıya işletmeyle
// iletişime geçmesi gerektiği ayrıca bildirilir — aksi halde maç iptal olup rezervasyon sessizce
// elde kalır, kullanıcı bundan habersiz kort ücreti/no-show riskiyle karşılaşabilirdi. Pro altı
// işletmelerde bu davranış yok — kullanıcı isteği yalnızca Pro ve üstü paketleri kapsıyor.
async function cancelLinkedVenueReservation(request) {
    if (!request.venueReservationId || !TENNIS_PADEL_SUBCATEGORIES.includes(request.subCategory)) return null;
    const reservation = await prisma.courtReservation.findUnique({
        where: { id: request.venueReservationId },
        include: { venue: true },
    });
    if (!reservation || reservation.status === 'CANCELLED') return null;

    const sub = await prisma.businessSubscription.findFirst({
        where: { userId: reservation.venue.userId, status: 'ACTIVE', endDate: { gt: new Date() } },
    });
    if (!sub || !PRO_PACKAGES.includes(sub.packageType)) return null;

    const cb = reservation.venue.cancelHoursBefore;
    let withinPolicy = true;
    if (cb !== null && cb !== undefined) {
        if (cb < 0) {
            withinPolicy = false;
        } else {
            const resDate = new Date(`${reservation.date}T${reservation.startTime}:00`);
            withinPolicy = (resDate - new Date()) / 3600000 >= cb;
        }
    }

    if (withinPolicy) {
        await prisma.courtReservation.update({ where: { id: reservation.id }, data: { status: 'CANCELLED' } });
        refundGiftMinutes(reservation).catch(() => {});
        // Kullanıcı raporu: politika içinde (erken) iptalde kort sahibine GERÇEK bir bildirim
        // hiç gitmiyordu — sadece boş bir socket event'i ({}) atılıyordu, createNotification
        // hiç çağrılmıyordu. Politika DIŞI (aşağıdaki) dalda zaten doğru yapılıyordu, bu dal
        // unutulmuştu.
        createNotification(reservation.venue.userId, 'RESERVATION_UPDATE', '❌ Rezervasyon İptal Edildi',
            `${reservation.date} ${reservation.startTime}–${reservation.endTime} rezervasyonu, bağlı maç iptal edildiği için iptal edildi.`,
            { reservationId: reservation.id, category: 'SPORTS', subCategory: reservation.venue.branch, venueId: reservation.venue.id, date: reservation.date }
        ).catch(() => {});
        emitToUser(reservation.venue.userId, 'notification', {});
        return { compliant: true, venueName: reservation.venue.name };
    }

    // Politika dışında kalınca rezervasyonu sessizce olduğu gibi bırakmak yerine —
    // requestCancelReservation'daki (kullanıcının elle "İptal Talebi Gönder" ile yaptığı)
    // AYNI akış otomatik tetiklenir: rezervasyon cancelRequested=true işaretlenir, işletmeye
    // gerçek bir bildirim gider (Yaklaşan Maçlar takviminde saat yanıp söner, Onayla/Reddet
    // sorulur — bkz. requestCancelReservation). Kullanıcı isteği: "iptal için işletmeye talep
    // gönderildi diye uyarı gelecekti" — önceden sadece "işletmeyle iletişime geçin" deniyordu,
    // gerçekten bir talep oluşturulmuyordu.
    if (!reservation.cancelRequested) {
        await prisma.courtReservation.update({ where: { id: reservation.id }, data: { cancelRequested: true, cancelRequestNote: 'AUTO' } });
        createNotification(reservation.venue.userId, 'RESERVATION', '📋 İptal Talebi',
            `${reservation.date} ${reservation.startTime}–${reservation.endTime} rezervasyonu için iptal talebi gönderildi (bağlı maç iptal edildi).`,
            { reservationId: reservation.id, category: 'SPORTS', subCategory: reservation.venue.branch, venueId: reservation.venue.id, date: reservation.date }
        ).catch(() => {});
        emitToUser(reservation.venue.userId, 'notification', {});
    }
    return { compliant: false, venueName: reservation.venue.name };
}

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
        // DOUBLE'da kabul edilen ama henüz bir slota (Takım Arkadaşı/Rakip1/Rakip2) atanmamış
        // oyuncular unassignedPlayers'da tutulur (bkz. isUnassignedInvite akışı) — bunlar
        // participants/senderTeam'de HİÇ görünmez. Önceden burada hiç sayılmıyorlardı, bu
        // yüzden maç dolu olduğu hâlde Atanmamış'ta bekleyen biri iptal bildirimi ALMIYORDU
        // (kullanıcı raporu) ve kendisi de iptal edemiyordu (isInvolved false çıkıyordu).
        const unassignedIds = (Array.isArray(request.unassignedPlayers) ? request.unassignedPlayers : []).filter(p => p?.id).map(p => p.id);
        const isInvolved = request.senderId === req.userId || participants.some(p => p?.id === req.userId) || senderTeamIds.includes(req.userId) || unassignedIds.includes(req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        // participants/senderTeam DOUBLE'da setAtSlot ile boş slotlara null bırakılarak
        // dolduruluyor (bkz. setAtSlot) — p.id null üzerinde patlıyordu, "Cannot read
        // properties of null (reading 'id')" hatasıyla iptal işlemi çöküyordu.
        const allPlayerIds = [request.senderId, ...senderTeamIds, ...participants.filter(p => p?.id).map(p => p.id), ...unassignedIds];
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
            const matchStart = turkeyDateTimeToUtc(request.matchDate, request.matchTime);
            const hoursUntil = (matchStart - new Date()) / (1000 * 60 * 60);
            withinPenaltyWindow = hoursUntil > 0 && hoursUntil <= penaltyWindowHours;
        }

        if (mutual) {
            const mutualReqs = Array.isArray(request.mutualCancelRequests) ? [...request.mutualCancelRequests] : [];
            if (!mutualReqs.includes(req.userId)) mutualReqs.push(req.userId);

            const bothAgreed = allPlayerIds.every(uid => mutualReqs.includes(uid));

            if (bothAgreed) {
                await prisma.activityRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
                const venueOutcome = await cancelLinkedVenueReservation(request);
                res.json({
                    cancelled: true, mutual: true,
                    venuePolicyWarning: (venueOutcome && !venueOutcome.compliant)
                        ? `Maçınız iptal edilmiştir. Ancak ${venueOutcome.venueName} işletmesinden aldığınız rezervasyon, işletmenin değiştirme/iptal politikalarına uymadığı için otomatik iptal edilmedi — işletmeye sizin adınıza bir iptal talebi gönderildi, onayı bekleniyor.`
                        : undefined,
                });
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
        let venueOutcome = null;

        if (isCreatorSide) {
            // The listing's own side is cancelling — the post itself is no longer valid.
            await prisma.activityRequest.update({ where: { id }, data: { status: 'CANCELLED' } });
            prisma.activityRequest.updateMany({ where: { linkedRivalId: id, status: 'OPEN' }, data: { status: 'CANCELLED' } }).catch(() => {});
            venueOutcome = await cancelLinkedVenueReservation(request);
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
            let updated = await prisma.activityRequest.findUnique({ where: { id }, include: { sender: { select: SENDER_SELECT } } });
            updated = await enrichRivalWithRatings(updated);
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
                        ...buildPenaltyUpdate(interest, request.subCategory, isDoublesFormat(request), penaltyAmount),
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

        res.json({
            cancelled: true, reopened: !isCreatorSide, penaltyApplied: withinPenaltyWindow, penaltyAmount: withinPenaltyWindow ? penaltyAmount : undefined,
            venuePolicyWarning: (venueOutcome && !venueOutcome.compliant)
                ? `Maçınız iptal edilmiştir. Ancak ${venueOutcome.venueName} işletmesinden aldığınız rezervasyon, işletmenin değiştirme/iptal politikalarına uymadığı için otomatik iptal edilmedi — işletmeye sizin adınıza bir iptal talebi gönderildi, onayı bekleniyor.`
                : undefined,
        });

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
        // Kullanıcı raporu: bu silme/bildirim getUpcomingMatches'te de AYRI AYRI yapılıyordu —
        // ikisi paralel çağrılınca aynı maç için aynı bildirim iki kez gidebiliyordu. Artık
        // silme/bildirim TEK yerde, cleanupRivals.js cron'unda — burası sadece hariç tutuyor.
        const schedExpired = all.filter(m =>
            m.flexibleSchedule && m.schedulingDeadline && now > new Date(m.schedulingDeadline) && !m.matchDate
        );
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
                ...mine.flatMap(m => (Array.isArray(m.participants) ? m.participants : []).map(p => p?.id)),
                ...mine.flatMap(m => (Array.isArray(m.senderTeam) ? m.senderTeam : []).map(p => p?.id)),
            ].filter(Boolean))];
            const interests = allUserIds.length > 0
                ? await prisma.userInterest.findMany({
                    where: { userId: { in: allUserIds } },
                    select: {
                        userId: true, subCategory: true, skillRating: true,
                        singlesRating: true, doublesRating: true, singlesSeedRating: true, doublesSeedRating: true, singlesRatingOffset: true, doublesRatingOffset: true,
                    },
                }) : [];
            const ratingFor = (userId, subCategory, isDoubles) => teamDisplayRating(interests.find(i => i.userId === userId && i.subCategory === subCategory), subCategory, isDoubles);
            // Voleybol/airsoft: maç MATCHED olduktan sonra hâlâ bekleyen istek/davetler —
            // (a) joiner'ın gönderdiği "Yedek Olarak Başvur" istekleri (bkz. sendJoinRequest'teki
            // subSlotOpenForRequest), (b) ilan sahibinin kadro kartından doğrudan gönderdiği
            // Kurucu/Rakip Takım/Yedek davetleri (bkz. inviteToRival'daki side parametresi).
            // İkisi de PENDING olduğu sürece listeye eklenir — owner kabul/red edebilsin,
            // sahibi de kendi gönderdiği davetleri görüp iptal edebilsin.
            const subCandidateIds = mine.filter(m => ['volleyball', 'airsoft'].includes(m.subCategory) && (m.teamSize || 1) > 1).map(m => m.id);
            const pendingSubReqs = subCandidateIds.length > 0
                ? await prisma.rivalJoinRequest.findMany({
                    where: { rivalId: { in: subCandidateIds }, status: 'PENDING', OR: [{ isSubstituteInvite: true }, { isPartnerInvite: true }, { isOppTeamInvite: true }] },
                    include: { user: { select: SENDER_SELECT } },
                }) : [];
            const subReqsByRival = pendingSubReqs.reduce((acc, jr) => { (acc[jr.rivalId] ??= []).push(jr); return acc; }, {});

            const enriched = mine.map(m => {
                const mIsDoubles = isDoublesFormat(m);
                return {
                ...m,
                senderSkillRating: ratingFor(m.senderId, m.subCategory, mIsDoubles),
                participants: (Array.isArray(m.participants) ? m.participants : []).map(p => ({
                    ...p,
                    skillRating: ratingFor(p.id, m.subCategory, mIsDoubles),
                })),
                joinRequests: subReqsByRival[m.id] || [],
                };
            });
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
        const isInvolved = match.senderId === req.userId || parts.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        if (match.schedulingDeadline && new Date() > new Date(match.schedulingDeadline)) {
            return res.status(400).json({ message: '24 saatlik süre doldu' });
        }

        const proposal = { userId: req.userId, date, time, location: location || null, courtName: courtName || null, proposedAt: new Date().toISOString() };
        const updated = await enrichRivalWithRatings(await prisma.activityRequest.update({
            where: { id },
            data: { scheduleProposal: proposal },
            include: { sender: { select: SENDER_SELECT } },
        }));

        // Notify the other player(s)
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
        const otherIds = [match.senderId, ...parts.filter(p => p?.id).map(p => p.id)].filter(uid => uid !== req.userId);
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
        const isInvolved = match.senderId === req.userId || parts.some(p => p?.id === req.userId);
        if (!isInvolved) return res.status(403).json({ message: 'Forbidden' });

        const matchDateObj = new Date(proposal.date);
        const updated = await enrichRivalWithRatings(await prisma.activityRequest.update({
            where: { id },
            data: {
                matchDate: matchDateObj,
                matchTime: proposal.time,
                location: proposal.location || match.location,
                courtName: proposal.courtName || match.courtName,
                scheduleProposal: null,
                schedulingDeadline: null,
            },
            include: { sender: { select: SENDER_SELECT } },
        }));

        // Notify proposer
        const me = await prisma.user.findUnique({ where: { id: req.userId }, select: { username: true, fullName: true } });
        const allIds = [match.senderId, ...parts.filter(p => p?.id).map(p => p.id)];
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
            return (Array.isArray(r.participants) ? r.participants : []).some(p => p?.id === myId);
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
