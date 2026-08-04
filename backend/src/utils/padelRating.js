import prisma from '../config/prisma.js';
import { calculateLevel } from '../config/assessments.js';
import { computeMatchSides } from './peerReview.js';

// 3 kategori (Teknik/Fiziksel/Taktiksel) ve 3 kaynak (Kendi/Antrenör/Takım Arkadaşı) ağırlıkları.
// VolleyballRating'in aynısı, sadece kaynak oranları farklı — kullanıcı isteği: kendi anketi
// %85, antrenör %10, takım arkadaşı %5. Eksik kaynak 0 kabul edilir, yeniden ağırlıklandırma
// YAPILMAZ (voleyboldaki kararla tutarlı).
export const CATEGORY_WEIGHTS = { technical: 0.40, physical: 0.30, tactical: 0.30 };
export const ROLE_WEIGHTS = { SELF: 0.85, COACH: 0.10, TEAMMATE: 0.05 };

export const QUESTION_FIELDS = [
    'forehandDrive', 'backhandDrive', 'volley', 'smash',
    'agility', 'endurance', 'reflexes',
    'courtPositioning', 'shotSelection', 'teamCommunication',
];

// Tek bir değerlendirme kaydının (10 soru) ağırlıklı 1-5 toplamı
export function computeRaterOverall(r) {
    const technical = (r.forehandDrive + r.backhandDrive + r.volley + r.smash) / 4;
    const physical  = (r.agility + r.endurance + r.reflexes) / 3;
    const tactical  = (r.courtPositioning + r.shotSelection + r.teamCommunication) / 3;
    return technical * CATEGORY_WEIGHTS.technical + physical * CATEGORY_WEIGHTS.physical + tactical * CATEGORY_WEIGHTS.tactical;
}

// Padelin kendi kayıt anketi (Vuruş Teknikleri/Taktik/Deneyim) COACH/TEAMMATE'in 10 soruluk
// beceri formatından tamamen farklı olduğu için — voleybolün aksine — burada PadelRating
// tablosunda bir SELF satırı YOK. Kendi puanı parametre olarak (UserInterest.selfAssessmentRating)
// verilir. Hiç antrenör/takım arkadaşı değerlendirmesi yoksa kendi puanı %100 aynen kullanılır —
// aksi halde mevcut/yeni padel oyuncularının derecesi sırf %85 ağırlık yüzünden anlık düşerdi.
// En az bir dış kaynak eklendiğinde harmanlama devreye girer (eksik kaynak yine 0 katkı verir).
export function computeOverallScore(selfSkillRating, ratings) {
    const coachRatings = ratings.filter(r => r.raterRole === 'COACH');
    const teammateRatings = ratings.filter(r => r.raterRole === 'TEAMMATE');

    const avg = list => list.length === 0 ? 0 : list.reduce((s, r) => s + computeRaterOverall(r), 0) / list.length;

    const selfScore = selfSkillRating || 0;
    const coachScore = avg(coachRatings);
    const teammateScore = avg(teammateRatings);

    const hasExternal = coachRatings.length > 0 || teammateRatings.length > 0;
    const overallScore = hasExternal
        ? selfScore * ROLE_WEIGHTS.SELF + coachScore * ROLE_WEIGHTS.COACH + teammateScore * ROLE_WEIGHTS.TEAMMATE
        : selfScore;

    return {
        overallScore: parseFloat(overallScore.toFixed(2)),
        selfScore: parseFloat(selfScore.toFixed(2)),
        coachScore: coachRatings.length ? parseFloat(coachScore.toFixed(2)) : null,
        coachCount: coachRatings.length,
        teammateScore: teammateRatings.length ? parseFloat(teammateScore.toFixed(2)) : null,
        teammateCount: teammateRatings.length,
    };
}

// Harmanlanmış puanı (computeOverallScore) YENİDEN hesaplayıp UserInterest.skillRating/level/
// totalPoints'e yazar — bu puan izole değil, oyuncunun GERÇEK derecesi (maç eşleştirme, turnuva
// derece kısıtlaması vb. buradan okur). Taban her zaman selfAssessmentRating'den (ham kendi anketi
// puanı) alınır, ÖNCEKİ harmanlanmış skillRating'den değil — aksi halde her yeni coach/teammate
// değerlendirmesinde puan üst üste binerdi. selfAssessmentRating henüz set edilmemiş eski
// kayıtlarda (bu özellik gelmeden önce anket doldurmuş oyuncular) mevcut skillRating taban alınır.
export async function applyBlendedPadelRating(subjectId) {
    const interest = await prisma.userInterest.findFirst({ where: { userId: subjectId, subCategory: 'padel' } });
    if (!interest || !interest.assessmentCompleted) return null;
    const selfBase = interest.selfAssessmentRating ?? interest.skillRating;
    const ratings = await prisma.padelRating.findMany({ where: { subjectId } });
    const { overallScore } = computeOverallScore(selfBase, ratings);
    const { level, totalPoints } = calculateLevel(overallScore, 5);
    return prisma.userInterest.update({ where: { id: interest.id }, data: { level, skillRating: overallScore, totalPoints } });
}

// İki oyuncu padelde aynı takımda (rakip değil) tamamlanmış bir maç oynamış mı — akran
// değerlendirmesindeki computeMatchSides ile aynı taraf ayrımını reuse ediyor, çünkü sadece
// aynı taraftaysalar "takım arkadaşı" sayılır (rakip olmaları yetmez).
export async function hasBeenPadelTeammates(userId, subjectId) {
    const candidates = await prisma.$queryRaw`
        SELECT id, "senderId", "senderTeam", participants FROM "ActivityRequest"
        WHERE "subCategory" = 'padel'
          AND status = 'COMPLETED'
          AND (
            "senderId" = ${userId} OR "senderId" = ${subjectId}
            OR "senderTeam"::jsonb @> ${JSON.stringify([{ id: userId }])}::jsonb
            OR "senderTeam"::jsonb @> ${JSON.stringify([{ id: subjectId }])}::jsonb
            OR participants::jsonb @> ${JSON.stringify([{ id: userId }])}::jsonb
            OR participants::jsonb @> ${JSON.stringify([{ id: subjectId }])}::jsonb
          )
    `;

    return candidates.some(m => {
        const sides = computeMatchSides(m);
        return (sides.teamA.has(userId) && sides.teamA.has(subjectId)) ||
               (sides.teamB.has(userId) && sides.teamB.has(subjectId));
    });
}

export async function isApprovedPadelCoach(userId) {
    const listing = await prisma.coachListing.findFirst({
        where: { userId, subCategory: 'padel', status: 'ACTIVE', approvedForRating: true },
    });
    return !!listing;
}

// req.userId'nin subjectId için hangi rolle değerlendirme yapabileceğini belirler.
// Rol client'tan alınmaz — spoofing'i önlemek için her zaman sunucu tarafında hesaplanır.
export async function resolveRaterRole(raterId, subjectId) {
    if (raterId === subjectId) return 'SELF';
    if (await isApprovedPadelCoach(raterId)) return 'COACH';
    if (await hasBeenPadelTeammates(raterId, subjectId)) return 'TEAMMATE';
    return null;
}
