// UTR (Universal Tennis Rating) ESİNLİ puanlama — SADECE tennis/padel için. Gerçek UTR'nin
// katsayıları kamuya açık değil, bu yüzden burada dokümante edilen formül UTR'nin kamuya açık
// mekaniğinin (support.universaltennis.com) ŞEFFAF bir yaklaşıklamasıdır, birebir klon değildir.
//
// Mantık: her maç sonucu, "bu sonucu üretmek için rakibe karşı ne kadar puanlı olmam gerekirdi"
// (matchPerformanceRating) sorusuna dönüştürülür. Nihai rating, son 12 ay içindeki en fazla 30
// maçın bu değerlerinin AĞIRLIKLI ORTALAMASIdır — sabit bir delta biriktirmek yerine her seferinde
// tam bir "recompute". Ağırlık = format × rakip-derece-farkı × rakip-güvenilirliği × zaman-aşımı.
//
// Zaman-aşımı ağırlığı "şimdi"ye bağlı olduğu için HİÇ SAKLANMAZ — RatingMatchRecord ham girdileri
// tutar, decayWeight her recompute'ta güncel tarihe göre taze hesaplanır.

import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { subCategoryTR } from './subCategoryLabels.js';

export const UTR_SUBCATEGORIES = ['tennis', 'padel'];

const D = 0.6;                 // lojistik beklenen-sonuç eğrisinin dikliği (0-5 skala) — tunable
const WINDOW_DAYS = 365;       // 12 aylık kayan pencere
const WINDOW_MAX_MATCHES = 30; // en fazla 30 maç
const RELIABILITY_FULL_MATCHES = 10; // rakip bu kadar maç oynamışsa tam güvenilir sayılır
const RELIABILITY_FLOOR = 0.25;
const GAP_TAPER_START = 1.0;   // bu farktan sonra gapWeight düşmeye başlar
const GAP_TAPER_RATE = 0.15;
const GAP_FLOOR = 0.3;
const SEED_CONVERGE_MATCHES = 10; // bu kadar gerçek maçtan sonra anket ağırlığı tabana iner
const SEED_WEIGHT_FLOOR = 0.1;

// Rival ilanları matchType ('SINGLE'/'DOUBLE') taşır; turnuvalar kendi type kodunu taşır
// ('2'/'4' = Çiftler Rekabetçi/Antrenman, bkz. tournament.controller.js VALID_TOURN_TYPES).
export function isDoublesFormat({ matchType, tournamentType }) {
    if (tournamentType != null) return tournamentType === '2' || tournamentType === '4';
    return matchType === 'DOUBLE';
}

// subCategory badminton/table_tennis/volleyball ise (ya da interest yoksa) eski skillRating'e
// düşer — bu iki dal UTR sistemine hiç girmiyor, davranışları değişmiyor.
export function getDisplayRating(interest, subCategory, isDoubles) {
    if (!interest) return 0;
    if (!UTR_SUBCATEGORIES.includes(subCategory)) return interest.skillRating ?? 0;
    const raw = isDoubles ? interest.doublesRating : interest.singlesRating;
    const seed = isDoubles ? interest.doublesSeedRating : interest.singlesSeedRating;
    const offset = (isDoubles ? interest.doublesRatingOffset : interest.singlesRatingOffset) ?? 0;
    return Math.max(0, (raw ?? seed ?? 0) + offset);
}

// Mobil "Aktivitelerim" kartı/detayı ve profil ekranı için — tekli/çiftler puanını AYRI AYRI
// (birleşik skillRating değil) döner, mobilin kendi getDisplayRating mantığını tekrarlamasına
// gerek kalmasın diye. Henüz o disiplinin anketi tamamlanmadıysa null döner ("—" gösterilsin,
// yanıltıcı "0.00★" değil). UTR dışı dallarda (badminton/masa tenisi/voleybol vb.) ikisi de null.
export function withDisplayRatings(interest) {
    if (!interest || !UTR_SUBCATEGORIES.includes(interest.subCategory)) {
        return { ...interest, singlesDisplayRating: null, doublesDisplayRating: null };
    }
    return {
        ...interest,
        singlesDisplayRating: interest.assessmentCompleted ? getDisplayRating(interest, interest.subCategory, false) : null,
        doublesDisplayRating: interest.doublesAssessmentCompleted ? getDisplayRating(interest, interest.subCategory, true) : null,
    };
}

// No-show/geç iptal gibi cezalar için Prisma update verisi üretir. UTR dallarında (tenis/padel)
// doğrudan singlesRating/doublesRating'e DOKUNULMAZ — bir sonraki gerçek maçın recompute'u
// bunu sessizce silerdi. Bunun yerine ilgili disipline (tekli/çiftler) özel offset alanı
// azaltılır; getDisplayRating() bunu okuma anında rating'in üzerine ekler. Diğer dallarda
// (badminton/masa tenisi/voleybol/vb.) eski davranış aynen korunur — doğrudan skillRating düşer.
export function buildPenaltyUpdate(interest, subCategory, isDoubles, amount) {
    if (!UTR_SUBCATEGORIES.includes(subCategory)) {
        return { skillRating: Math.max(0, parseFloat((interest.skillRating - amount).toFixed(2))) };
    }
    const offsetField = isDoubles ? 'doublesRatingOffset' : 'singlesRatingOffset';
    const currentOffset = interest[offsetField] ?? 0;
    return { [offsetField]: parseFloat((currentOffset - amount).toFixed(2)) };
}

// score: {sets:[{sender,opponent}], winner:'sender'|'opponent'}. side: 'sender'|'opponent' —
// hangi tarafın performansını istiyoruz. Dönüş: 0-1 (oynanan oyunların kazanılma oranı) veya
// skor yoksa null (çağıran taraf bu durumda sabit 0.75/0.25 fallback'ini kullanmalı).
export function computeGamesRatio(score, side) {
    if (!score || !Array.isArray(score.sets) || score.sets.length === 0) return null;
    let mine = 0, total = 0;
    for (const set of score.sets) {
        const s = Number(set.sender) || 0;
        const o = Number(set.opponent) || 0;
        mine += side === 'sender' ? s : o;
        total += s + o;
    }
    if (total === 0) return null;
    return mine / total;
}

// Skor setinden format ağırlığı tahmini — yeni bir "Tek Set/3 Set" seçimi eklemek yerine
// kullanıcı kararıyla mevcut set sayısından çıkarılıyor. Skor hiç yoksa (walkover vb.) düşük
// güvenle 0.4.
export function computeFormatWeight(score) {
    if (!score || !Array.isArray(score.sets) || score.sets.length === 0) return 0.4;
    return Math.min(1.0, 0.5 + 0.25 * (score.sets.length - 1));
}

export function computeGapWeight(ratingDiff) {
    const diff = Math.abs(ratingDiff);
    return clamp(1 - GAP_TAPER_RATE * Math.max(0, diff - GAP_TAPER_START), GAP_FLOOR, 1.0);
}

// opponentMatchCount/opponentLastMatchAt: rakibin BU MAÇ ANINDAKİ (maçtan önceki) durumu —
// maç anında donar, rakip sonradan daha aktif/pasif olsa bile bu maçın ağırlığı değişmez.
export function computeReliabilityWeight(opponentMatchCount, opponentLastMatchAt, atDate) {
    const matchCountFactor = clamp((opponentMatchCount ?? 0) / RELIABILITY_FULL_MATCHES, RELIABILITY_FLOOR, 1.0);
    let recencyFactor = RELIABILITY_FLOOR;
    if (opponentLastMatchAt) {
        const monthsSince = (atDate.getTime() - new Date(opponentLastMatchAt).getTime()) / (1000 * 60 * 60 * 24 * 30);
        recencyFactor = clamp(1 - monthsSince / 12, 0.3, 1.0);
    }
    return matchCountFactor * recencyFactor;
}

export function computeDecayWeight(matchDate, atDate) {
    const ageInDays = (atDate.getTime() - new Date(matchDate).getTime()) / (1000 * 60 * 60 * 24);
    return Math.max(0, 1 - ageInDays / WINDOW_DAYS);
}

export function computeMatchWeight({ formatWeight, gapWeight, reliabilityWeight, decayWeight }) {
    return formatWeight * gapWeight * reliabilityWeight * decayWeight;
}

// P: 0-1 performans skoru (oyun oranı ya da 0.75/0.25 fallback). Rakip ratingine göre "ima
// edilen" performans ratingi — bir set içinde 6-0/6-0 gibi uç değerlerde ±sonsuza gitmesin diye
// clip edilir.
export function computeMatchPerformance(opponentRating, performanceScore) {
    const p = clamp(performanceScore, 0.02, 0.98);
    const impliedDiff = D * Math.log10(p / (1 - p));
    return opponentRating + impliedDiff;
}

function clamp(v, min, max) {
    return Math.min(max, Math.max(min, v));
}

// Kayan pencere ağırlıklı ortalaması — RatingMatchRecord'lardan TAZE hesaplanır (decay "şimdi"ye
// bağlı olduğu için hiç saklanmaz). Gerçek maç yoksa direkt seed'e düşer.
export async function recomputeRatingFromHistory(userId, subCategory, matchType, seedRating) {
    const cutoff = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);
    const records = await prisma.ratingMatchRecord.findMany({
        where: { userId, subCategory, matchType, matchDate: { gte: cutoff } },
        orderBy: { matchDate: 'desc' },
        take: WINDOW_MAX_MATCHES,
    });

    const now = new Date();
    let weightedSum = 0, weightTotal = 0;
    for (const r of records) {
        const decayWeight = computeDecayWeight(r.matchDate, now);
        if (decayWeight <= 0) continue;
        const weight = computeMatchWeight({
            formatWeight: r.formatWeight,
            gapWeight: computeGapWeight(r.opponentRatingSnapshot != null ? (r.ratingBefore - r.opponentRatingSnapshot) : 0),
            reliabilityWeight: r.opponentReliabilitySnapshot,
            decayWeight,
        });
        const matchPerformanceRating = computeMatchPerformance(r.opponentRatingSnapshot, r.performanceScore);
        weightedSum += weight * matchPerformanceRating;
        weightTotal += weight;
    }

    const seed = seedRating ?? 0;
    const seedWeight = Math.max(SEED_WEIGHT_FLOOR, 1 - records.length / SEED_CONVERGE_MATCHES);
    return parseFloat(((seedWeight * seed + weightedSum) / (seedWeight + weightTotal)).toFixed(4));
}

// Tenis/padel için reassessment-grace: eski matchesSinceAssessment SAYACI yerine
// assessmentCompletedAt zaman damgasından itibaren o disiplinde (tekli/çiftler AYRI AYRI)
// oynanan gerçek maç sayısı TÜREV olarak hesaplanır (bkz. plan §6) — RatingMatchRecord tek
// kaynak, ayrı bir sayaç tutulmuyor.
export async function countMatchesSinceAssessment(userId, subCategory, matchType, assessmentCompletedAt) {
    if (!assessmentCompletedAt) return 0;
    return prisma.ratingMatchRecord.count({
        where: { userId, subCategory, matchType, matchDate: { gt: assessmentCompletedAt } },
    });
}

const ASSESSMENT_GRACE_MATCHES = 3;
const ASSESSMENT_GRACE_RATING_GAP = 1.0;

// tennisElo.js'teki getReassessmentFlags'in UTR karşılığı — tekli/çiftler bağımsız çalışır
// (bir dalda sandbagging diğer dalın maçlarını bloklamasın diye, ayrı ratinglerin asıl amacı bu).
async function getUtrReassessmentFlags(winnerInterests, loserAvg, winnerAvg, subCategory, matchType) {
    if (winnerAvg >= loserAvg) return [];
    if (loserAvg - winnerAvg < ASSESSMENT_GRACE_RATING_GAP) return [];
    const flagged = [];
    for (const wi of winnerInterests) {
        // Çiftler için kendi anketinin tamamlanma anı (doublesAssessmentCompletedAt) esas
        // alınır — tenis'te tekli/çiftler ayrı zamanlarda tamamlanabilen ayrı anketler (bkz.
        // interest.controller.js saveAssessment). Padel'de ikisi de aynı tek anketten geldiği
        // için doublesAssessmentCompletedAt hiç set edilmez, bu durumda assessmentCompletedAt'e düşer.
        const anchor = (matchType === 'DOUBLE' && wi.doublesAssessmentCompletedAt) ? wi.doublesAssessmentCompletedAt : wi.assessmentCompletedAt;
        const matchesSince = await countMatchesSinceAssessment(wi.userId, subCategory, matchType, anchor);
        if (matchesSince < ASSESSMENT_GRACE_MATCHES) flagged.push(wi);
    }
    return flagged;
}

// request.senderId/senderTeam/participants üzerinden kazanan/kaybeden taraf çözümlemesi —
// rival.controller.js'teki applyCompetitivePoints ile AYNI mantık (bkz. o dosya satır 82-99),
// tenis/padel DOUBLE maçlarında senderTeam=partner(1), participants=rakipler(2) şeklinde dolu olur.
function resolveSides(request, winnerUserId) {
    const participants = Array.isArray(request.participants) ? request.participants : [];
    const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];
    const isTeamMatch = senderTeamArr.length > 0;

    let winnerIds, loserIds;
    if (isTeamMatch) {
        const creatorTeam = [{ id: request.senderId }, ...senderTeamArr].filter(m => m?.id);
        const joiningTeam = participants.filter(m => m?.id);
        const senderWon = creatorTeam.some(m => m.id === winnerUserId);
        winnerIds = senderWon ? creatorTeam.map(m => m.id) : joiningTeam.map(m => m.id);
        loserIds = senderWon ? joiningTeam.map(m => m.id) : creatorTeam.map(m => m.id);
    } else {
        winnerIds = [winnerUserId];
        loserIds = [{ id: request.senderId }, ...participants]
            .filter(p => p?.id && p.id !== winnerUserId)
            .map(p => p.id);
    }
    return { winnerIds, loserIds };
}

// Ortak çekirdek — hem rival.controller.js (tek maç, senderId/participants) hem
// tournament.controller.js (turnuva maçı, p1Members/p2Members + skor düzeltme desteği) buradan
// besleniyor. Yalnızca zaten çözülmüş kazanan/kaybeden id listeleri ve performans skorlarıyla
// çalışır — taraf çözümleme çağıran tarafın işi (bkz. resolveSides, tournament wrapper'ı).
// Dönüş: { changes: [{userId, before, after, change, isWinner}], skipRating, reassessFlags }.
async function runUtrMatch({ category, subCategory, matchType, sourceType, sourceId, matchDate, winnerIds, loserIds, winnerPerformanceScore, loserPerformanceScore, formatWeight }) {
    const allIds = [...new Set([...winnerIds, ...loserIds])];
    const existing = await prisma.userInterest.findMany({
        where: { userId: { in: allIds }, category, subCategory },
    });
    const existingIds = new Set(existing.map(i => i.userId));
    const missing = allIds.filter(id => !existingIds.has(id));
    const created = missing.length > 0
        ? await Promise.all(missing.map(userId =>
            prisma.userInterest.create({
                data: { userId, category, subCategory, totalPoints: 0, wins: 0, losses: 0, skillRating: 0 },
            })
        ))
        : [];
    const interests = [...existing, ...created];

    const winnerInterests = interests.filter(i => winnerIds.includes(i.userId));
    const loserInterests = interests.filter(i => loserIds.includes(i.userId));
    if (!winnerInterests.length || !loserInterests.length) return { changes: [], skipRating: false, reassessFlags: [] };

    // Ceza (offset) sadece GÖSTERİM/eşleşme uygunluğu için var — bir maçın "ima ettiği" puanı
    // hesaplarken rakibin cezası hiçe sayılır, aksi halde cezalı bir rakibe karşı kazanmak
    // haksız yere az puan kazandırırdı. Bu yüzden burada getDisplayRating DEĞİL, ham
    // rating/seed kullanılıyor.
    const ratingOf = (i) => (matchType === 'DOUBLE' ? (i.doublesRating ?? i.doublesSeedRating) : (i.singlesRating ?? i.singlesSeedRating)) ?? 0;
    const matchCountOf = (i) => (matchType === 'DOUBLE' ? i.doublesMatchCount : i.singlesMatchCount) ?? 0;
    const lastMatchAtOf = (i) => matchType === 'DOUBLE' ? i.doublesLastMatchAt : i.singlesLastMatchAt;

    const avgWinnerRating = winnerInterests.reduce((s, i) => s + ratingOf(i), 0) / winnerInterests.length;
    const avgLoserRating = loserInterests.reduce((s, i) => s + ratingOf(i), 0) / loserInterests.length;

    const now = new Date();
    const avgReliability = (list) => list.reduce((s, i) => s + computeReliabilityWeight(matchCountOf(i), lastMatchAtOf(i), now), 0) / list.length;
    const winnerReliability = avgReliability(winnerInterests);
    const loserReliability = avgReliability(loserInterests);

    const reassessFlags = await getUtrReassessmentFlags(winnerInterests, avgLoserRating, avgWinnerRating, subCategory, matchType);
    const skipRating = reassessFlags.length > 0;

    const ratingField = matchType === 'DOUBLE' ? 'doublesRating' : 'singlesRating';
    const matchCountField = matchType === 'DOUBLE' ? 'doublesMatchCount' : 'singlesMatchCount';
    const lastMatchField = matchType === 'DOUBLE' ? 'doublesLastMatchAt' : 'singlesLastMatchAt';
    const seedField = matchType === 'DOUBLE' ? 'doublesSeedRating' : 'singlesSeedRating';
    // Reassessment-grace flag'i HANGİ disiplinde tetiklendiyse o disiplinin anketini geçersiz
    // kılar — bir çiftler maçında sandbagging tespit edilirse sadece doublesAssessmentCompleted
    // false olur, tekli (assessmentCompleted) etkilenmez ve tam tersi (bkz. plan: "ayrı
    // ratinglerin asıl amacı" tekli/çiftler'in birbirini bloklamaması).
    const completionField = matchType === 'DOUBLE' ? 'doublesAssessmentCompleted' : 'assessmentCompleted';

    // Bir katılımcı için: RatingMatchRecord ekle (bu maçın kendisi de pencereye dahil olsun diye
    // ÖNCE), sonra kayan pencereden taze recompute et, sonra hem kaydı hem UserInterest'i güncelle.
    // Sıralı çalışıyor (Promise.all değil) çünkü recompute sadece o kullanıcının kendi geçmişine
    // bakıyor — az sayıda katılımcı (2-4) için performans sorunu yok.
    async function processParticipant(interest, { didWin, performanceScore, opponentRatingSnapshot, opponentReliabilitySnapshot }) {
        const before = ratingOf(interest);
        if (skipRating) {
            return prisma.userInterest.update({
                where: { id: interest.id },
                data: didWin
                    ? { wins: interest.wins + 1, [completionField]: !reassessFlags.some(f => f.id === interest.id) }
                    : { losses: interest.losses + 1 },
            }).then(() => ({ userId: interest.userId, change: 0 }));
        }
        const record = await prisma.ratingMatchRecord.create({
            data: {
                userId: interest.userId, subCategory, matchType, sourceType, sourceId,
                matchDate, didWin, performanceScore, opponentRatingSnapshot, opponentReliabilitySnapshot, formatWeight,
                ratingBefore: before, ratingAfter: before,
            },
        });
        const newRating = await recomputeRatingFromHistory(interest.userId, subCategory, matchType, interest[seedField]);
        await Promise.all([
            prisma.ratingMatchRecord.update({ where: { id: record.id }, data: { ratingAfter: newRating } }),
            prisma.userInterest.update({
                where: { id: interest.id },
                data: {
                    [ratingField]: newRating,
                    // skillRating artık bu iki dal için OTORİTER değil (bkz. getDisplayRating),
                    // ama en son oynanan formatın puanına "ayna" tutuluyor — mobil/backend'deki
                    // henüz singlesRating/doublesRating'e taşınmamış onlarca eski gösterim
                    // noktasının (roster rozetleri vb.) sıfır/bayat göstermemesi için geçici bir
                    // güvenlik ağı, gerçek eşleşme uygunluğu (minRating/maxRating) kontrolleri
                    // bu alana DEĞİL getDisplayRating()'e bakıyor.
                    skillRating: newRating,
                    [matchCountField]: matchCountOf(interest) + 1,
                    [lastMatchField]: now,
                    ...(didWin ? { wins: interest.wins + 1 } : { losses: interest.losses + 1 }),
                    assessmentCompleted: true,
                },
            }),
        ]);
        return { userId: interest.userId, change: parseFloat((newRating - before).toFixed(4)), before, after: newRating };
    }

    const changes = [];
    for (const wi of winnerInterests) {
        const c = await processParticipant(wi, {
            didWin: true, performanceScore: winnerPerformanceScore,
            opponentRatingSnapshot: avgLoserRating, opponentReliabilitySnapshot: loserReliability,
        });
        changes.push({ ...c, isWinner: true });
    }
    for (const li of loserInterests) {
        const c = await processParticipant(li, {
            didWin: false, performanceScore: loserPerformanceScore,
            opponentRatingSnapshot: avgWinnerRating, opponentReliabilitySnapshot: winnerReliability,
        });
        changes.push({ ...c, isWinner: false });
    }

    return { changes: skipRating ? [] : changes, skipRating, reassessFlags };
}

function notifyReassessment(reassessFlags, category, subCategory) {
    for (const flag of reassessFlags) {
        createNotification(
            flag.userId, 'ASSESSMENT_RECHECK',
            '📋 Derecelendirme Anketini Tekrar Doldurun',
            `${subCategoryTR(subCategory)} dalında anketten sonraki ilk maçlarınızda dereceniz beklenenden farklı çıktı. Daha doğru bir eşleşme için lütfen derecelendirme anketini tekrar doldurun.`,
            { category, subCategory }
        ).catch(() => {});
    }
}

// rival.controller.js (applyCompetitivePoints) buradan çağırır. applyCompetitivePoints'in
// döndürdüğü pointChanges ([{userId, change}]) ile AYNI şekli (düz dizi) döndürür, bildirim
// gönderimini de kendi içinde halleder — çağıran taraf kodu değişmeden çalışır.
export async function applyUtrRatingForMatch(request, winnerUserId) {
    const subCategory = request.subCategory;
    const matchType = isDoublesFormat(request) ? 'DOUBLE' : 'SINGLE';
    const { winnerIds, loserIds } = resolveSides(request, winnerUserId);
    const winnerPerf = computeGamesRatio(request.score, winnerIds.includes(request.senderId) ? 'sender' : 'opponent');

    const { changes, skipRating, reassessFlags } = await runUtrMatch({
        category: request.category, subCategory, matchType,
        sourceType: 'RIVAL', sourceId: request.id, matchDate: request.completedAt || new Date(),
        winnerIds, loserIds,
        // Kazanan taraf oyun oranı bulunamazsa (skor yok) sabit 0.75/0.25 fallback.
        winnerPerformanceScore: winnerPerf ?? 0.75,
        loserPerformanceScore: winnerPerf != null ? (1 - winnerPerf) : 0.25,
        formatWeight: computeFormatWeight(request.score),
    });

    if (skipRating) {
        notifyReassessment(reassessFlags, request.category, subCategory);
        return [];
    }
    return changes.map(c => ({ userId: c.userId, change: c.change, before: c.before, after: c.after }));
}

// tournament.controller.js'in maç-tamamlama akışından çağrılır. Turnuva maçları DÜZELTİLEBİLİR
// (skor daha önce girilip artık yeniden giriliyor olabilir) — bu yüzden çağıran taraf, bu
// fonksiyonu çağırmadan ÖNCE bu maça ait eski RatingMatchRecord'ları silmelidir (bkz.
// tournament.controller.js'teki deleteMany çağrısı) — recompute geçmişten TAZE hesaplandığı
// için eski kayıt silinince o maçın önceki katkısı otomatik "geri alınmış" olur, ayrı bir
// ters-delta hesaplamaya gerek kalmaz.
export async function applyUtrRatingForTournamentMatch({ category, subCategory, tournamentType, matchId, winnerMembers, loserMembers, sets, winnerSide }) {
    const matchType = isDoublesFormat({ tournamentType }) ? 'DOUBLE' : 'SINGLE';
    const winnerPerf = computeGamesRatioFromSets(sets, winnerSide);

    const { changes, skipRating, reassessFlags } = await runUtrMatch({
        category, subCategory, matchType,
        sourceType: 'TOURNAMENT', sourceId: matchId, matchDate: new Date(),
        winnerIds: winnerMembers, loserIds: loserMembers,
        winnerPerformanceScore: winnerPerf ?? 0.75,
        loserPerformanceScore: winnerPerf != null ? (1 - winnerPerf) : 0.25,
        formatWeight: computeFormatWeightFromSets(sets),
    });

    if (skipRating) notifyReassessment(reassessFlags, category, subCategory);
    return { changes: skipRating ? [] : changes, skipRating };
}

// Turnuva skor seti şekli {p1,p2} (rival'ın {sender,opponent}'ından farklı) — aynı oyun-oranı
// mantığını burada tekrarlıyoruz.
export function computeGamesRatioFromSets(sets, winnerSide) {
    if (!Array.isArray(sets) || sets.length === 0) return null;
    let mine = 0, total = 0;
    for (const s of sets) {
        const p1 = Number(s.p1) || 0, p2 = Number(s.p2) || 0;
        mine += winnerSide === 'p1' ? p1 : p2;
        total += p1 + p2;
    }
    return total === 0 ? null : mine / total;
}

export function computeFormatWeightFromSets(sets) {
    if (!Array.isArray(sets) || sets.length === 0) return 0.4;
    return Math.min(1.0, 0.5 + 0.25 * (sets.length - 1));
}
