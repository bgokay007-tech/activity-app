// UTR (Universal Tennis Rating) ESİNLİ puanlama — tennis/padel/badminton/table_tennis.
// Gerçek UTR'nin katsayıları kamuya açık değil, bu yüzden burada dokümante edilen formül
// UTR'nin kamuya açık mekaniğinin (support.universaltennis.com) ŞEFFAF bir yaklaşıklamasıdır,
// birebir klon değildir.
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

// Kullanıcı isteği: badminton + masa tenisi tenis ile aynı UTR algoritması / turnuva çeşitleri /
// puan kazanım-kayıp mantığını kullanır. Tekli/çiftler AYRI (tenis gibi; padel çiftler-öncelikli
// istisnası bu iki dala uygulanmaz).
export const UTR_SUBCATEGORIES = ['tennis', 'padel', 'badminton', 'table_tennis'];

// Tenis modeli: önce tekli anket, sonra ayrı çiftler anketi. Padel hariç — orada çiftler
// varsayılan/birincil ve tekliden bağımsız.
export const UTR_SINGLES_FIRST_SUBCATEGORIES = ['tennis', 'badminton', 'table_tennis'];

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
// ('2'/'4' = Çiftler Rekabetçi/Antrenman, '7' = Americano — bkz. tournamentFormats.js).
export function isDoublesFormat({ matchType, tournamentType }) {
    if (tournamentType != null) return tournamentType === '2' || tournamentType === '4' || tournamentType === '7';
    return matchType === 'DOUBLE';
}

// UTR dışı dallarda (voleybol vb.) eski skillRating'e düşer.
export function getDisplayRating(interest, subCategory, isDoubles) {
    if (!interest) return 0;
    if (!UTR_SUBCATEGORIES.includes(subCategory)) return interest.skillRating ?? 0;
    const raw = isDoubles ? interest.doublesRating : interest.singlesRating;
    const seed = isDoubles ? interest.doublesSeedRating : interest.singlesSeedRating;
    const offset = (isDoubles ? interest.doublesRatingOffset : interest.singlesRatingOffset) ?? 0;
    // Badminton/masa tenisi UTR'ye geçmeden önce sadece skillRating taşıyordu — seed henüz
    // yazılmamış eski kayıtlarda tekli tarafta skillRating'e düş (çiftlerde 0: ayrı anket şart).
    const legacyFallback = (!isDoubles && raw == null && seed == null) ? (interest.skillRating ?? 0) : 0;
    return Math.max(0, (raw ?? seed ?? legacyFallback) + offset);
}

// Mobil "Aktivitelerim" kartı/detayı ve profil ekranı için — tekli/çiftler puanını AYRI AYRI
// (birleşik skillRating değil) döner, mobilin kendi getDisplayRating mantığını tekrarlamasına
// gerek kalmasın diye. Henüz o disiplinin anketi tamamlanmadıysa null döner ("—" gösterilsin,
// yanıltıcı "0.00★" değil). UTR dışı dallarda ikisi de null.
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

// No-show/geç iptal gibi cezalar için Prisma update verisi üretir. UTR dallarında
// doğrudan singlesRating/doublesRating'e DOKUNULMAZ — bir sonraki gerçek maçın recompute'u
// bunu sessizce silerdi. Bunun yerine ilgili disipline (tekli/çiftler) özel offset alanı
// azaltılır; getDisplayRating() bunu okuma anında rating'in üzerine ekler. Diğer dallarda
// eski davranış aynen korunur — doğrudan skillRating düşer.
//
// Offset'in tabanı var: ceza en fazla -1.00'e kadar birikir. Tabansızken 10 no-show -4.00 yapıyor
// ve oyuncu görünen puanda kalıcı olarak 0'a yapışıyordu — ham puanı 4.16'ya çıksa bile görünen
// puanı 0.16'da kalıyor, yani hiçbir ilana başvuramıyordu. Ceza can yakmalı ama oyuncu oynayarak
// geri çıkabilmeli. Ceza zamanla erimiyor; taban tek fren.
export const PENALTY_OFFSET_FLOOR = -1.0;

export function buildPenaltyUpdate(interest, subCategory, isDoubles, amount) {
    if (!UTR_SUBCATEGORIES.includes(subCategory)) {
        return { skillRating: Math.max(0, parseFloat((interest.skillRating - amount).toFixed(2))) };
    }
    const offsetField = isDoubles ? 'doublesRatingOffset' : 'singlesRatingOffset';
    const currentOffset = interest[offsetField] ?? 0;
    return { [offsetField]: parseFloat(Math.max(PENALTY_OFFSET_FLOOR, currentOffset - amount).toFixed(2)) };
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
//
// opponentLastMatchAt null = rakip HİÇ maç oynamamış (anketini yeni doldurmuş). Bu durum
// önceden "bayat" sayılıp recencyFactor tabana (0.25) çekiliyordu; matchCountFactor da zaten
// tabanda (0.25) olduğu için ağırlık 0.0625'e düşüyor, yeni oyuncuların maçları puanlarını
// neredeyse hiç oynatmıyordu (simülasyon: 0.0 oyuncusu 5.0'ı 6-0 6-1 yenince kazancı +0.115).
// "Hiç oynamamış" ile "oynayıp bırakmış" aynı şey değil — bayatlık cezası sadece ikincisine
// uygulanır, hiç maçı olmayan rakip için recency tam sayılır (güvenilirliği zaten
// matchCountFactor tabanı sınırlıyor).
export function computeReliabilityWeight(opponentMatchCount, opponentLastMatchAt, atDate) {
    const matchCountFactor = clamp((opponentMatchCount ?? 0) / RELIABILITY_FULL_MATCHES, RELIABILITY_FLOOR, 1.0);
    let recencyFactor = 1.0;
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

// Bir maçın "ima ettiği puan"ını sonucun YÖNÜNE göre sınırlar.
//
// Ham matchPerformanceRating sadece rakibin puanına ve oyun oranına bakar; kimin kazandığını
// hiç bilmez. Bu yüzden çok güçlü bir oyuncu çok zayıf birini ezerek yendiğinde bile "bu sonuç
// ancak ~0.67 seviyesini ima eder" diyerek oyuncunun puanını DÜŞÜRÜYORDU (simülasyon: tekli
// maçların %41'i, çiftlerin %62'si; ör. 5.0 oyuncusu 0.0'ı 6-0 6-1 yenince -0.072). Aynı
// simetriyle, çok güçlü birine kaybeden zayıf oyuncunun puanı ARTIYORDU.
//
// Kural: bir GALİBİYET hiçbir zaman "eskisinden kötüyüm" kanıtı olamaz (taban = maç anındaki
// puan), bir YENİLGİ de "eskisinden iyiyim" kanıtı olamaz (tavan = maç anındaki puan).
// Bilgi taşımayan sonuçlar puanı sabit bırakır, ters yöne çekmez.
//
// ratingBefore null/undefined ise (eski kayıtlar) sınır uygulanmaz — geriye dönük uyumluluk.
export function clampPerformanceByOutcome(matchPerformanceRating, didWin, ratingBefore) {
    if (ratingBefore == null) return matchPerformanceRating;
    return didWin
        ? Math.max(matchPerformanceRating, ratingBefore)
        : Math.min(matchPerformanceRating, ratingBefore);
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
        const matchPerformanceRating = clampPerformanceByOutcome(
            computeMatchPerformance(r.opponentRatingSnapshot, r.performanceScore),
            r.didWin, r.ratingBefore,
        );
        weightedSum += weight * matchPerformanceRating;
        weightTotal += weight;
    }

    const seed = seedRating ?? 0;
    const seedWeight = Math.max(SEED_WEIGHT_FLOOR, 1 - records.length / SEED_CONVERGE_MATCHES);
    const raw = (seedWeight * seed + weightedSum) / (seedWeight + weightTotal);
    // Puan 0-5 skalasının DIŞINA taşmasın. Önceden sadece okuma anında (getDisplayRating)
    // Math.max(0,…) uygulanıyordu; veritabanında eksi değer kalıyor ve sonraki hesaplar
    // (gapWeight, ratingBefore sınırı) o eksi değerden başlıyordu.
    return parseFloat(clamp(raw, 0, 5).toFixed(4));
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
    // Tekli: eski badminton/masa tenisi kayıtları seed yazmadan skillRating taşır — UTR'ye
    // geçişte puan sıfırlanmasın diye skillRating son düşüş.
    const ratingOf = (i) => (matchType === 'DOUBLE'
        ? (i.doublesRating ?? i.doublesSeedRating)
        : (i.singlesRating ?? i.singlesSeedRating ?? i.skillRating)) ?? 0;
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
        // Eski badminton/masa tenisi: singlesSeedRating yazılmamış olabilir — skillRating'i seed say.
        const seedForRecompute = interest[seedField]
            ?? (matchType !== 'DOUBLE' ? interest.skillRating : null)
            ?? 0;
        const newRating = await recomputeRatingFromHistory(interest.userId, subCategory, matchType, seedForRecompute);
        await Promise.all([
            prisma.ratingMatchRecord.update({ where: { id: record.id }, data: { ratingAfter: newRating } }),
            prisma.userInterest.update({
                where: { id: interest.id },
                data: {
                    [ratingField]: newRating,
                    // Eksik seed'i ilk gerçek maçta doldur — sonraki recompute'lar 0 seed'e düşmesin.
                    ...(interest[seedField] == null && matchType !== 'DOUBLE' && interest.skillRating != null
                        ? { [seedField]: interest.skillRating }
                        : {}),
                    // skillRating artık bu dallar için OTORİTER değil (bkz. getDisplayRating),
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

// Bir maçın puan etkisini TAMAMEN geri alır — skor düzeltilirken (turnuva) yeniden
// hesaplamadan ÖNCE çağrılmalı.
//
// Sadece RatingMatchRecord'ları silmek YETMİYOR: singlesRating/doublesRating alanı maçtan
// sonraki değerde kalıyor, dolayısıyla düzeltme bu KİRLENMİŞ puandan başlıyor ve sonuç
// "baştan doğru skor girilmiş olsaydı" durumundan farklı çıkıyor (simülasyon C2: 108
// senaryonun 61'i; aynı skoru ikinci kez girmek bile puanı oynatıyordu). Bu yüzden kayıtlar
// silindikten sonra puan KALAN geçmişten yeniden hesaplanır, maç sayacı/son maç tarihi de
// gerçek kalan kayıtlara göre düzeltilir.
export async function revertUtrMatchRecords({ category, subCategory, sourceType, sourceId }) {
    const records = await prisma.ratingMatchRecord.findMany({ where: { sourceType, sourceId } });
    if (records.length === 0) return;
    await prisma.ratingMatchRecord.deleteMany({ where: { sourceType, sourceId } });

    for (const r of records) {
        const isDoubles = r.matchType === 'DOUBLE';
        const interest = await prisma.userInterest.findFirst({
            where: { userId: r.userId, category, subCategory },
        });
        if (!interest) continue;
        const seedField = isDoubles ? 'doublesSeedRating' : 'singlesSeedRating';
        const seedForRecompute = interest[seedField]
            ?? (!isDoubles ? interest.skillRating : null)
            ?? 0;
        const restored = await recomputeRatingFromHistory(r.userId, subCategory, r.matchType, seedForRecompute);
        // Kalan kayıtların en yenisi = gerçek "son maç" tarihi; hiç kalmadıysa null.
        const remaining = await prisma.ratingMatchRecord.findMany({
            where: { userId: r.userId, subCategory, matchType: r.matchType },
            orderBy: { matchDate: 'desc' },
            select: { matchDate: true },
        });
        await prisma.userInterest.update({
            where: { id: interest.id },
            data: {
                [isDoubles ? 'doublesRating' : 'singlesRating']: remaining.length > 0 ? restored : null,
                [isDoubles ? 'doublesMatchCount' : 'singlesMatchCount']: Math.max(0, (isDoubles ? interest.doublesMatchCount : interest.singlesMatchCount) - 1),
                [isDoubles ? 'doublesLastMatchAt' : 'singlesLastMatchAt']: remaining[0]?.matchDate ?? null,
                ...(r.didWin ? { wins: Math.max(0, interest.wins - 1) } : { losses: Math.max(0, interest.losses - 1) }),
            },
        });
    }
}

// tournament.controller.js'in maç-tamamlama akışından çağrılır. Turnuva maçları DÜZELTİLEBİLİR
// (skor daha önce girilip artık yeniden giriliyor olabilir) — bu yüzden çağıran taraf, bu
// fonksiyonu çağırmadan ÖNCE bu maça ait eski katkıyı revertUtrMatchRecords ile geri almalıdır.
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
