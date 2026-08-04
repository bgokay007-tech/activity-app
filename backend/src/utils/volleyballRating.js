import prisma from '../config/prisma.js';
import { calculateLevel } from '../config/assessments.js';
import { computeMatchSides } from './peerReview.js';

// 3 kategori (Teknik/Fiziksel/Taktiksel) ve 3 kaynak (Kendi/Antrenör/Takım Arkadaşı) ağırlıkları.
// Kullanıcı ile netleşti: eksik kaynak 0 kabul edilir, yeniden ağırlıklandırma YAPILMAZ —
// örn. sadece kendi anketini dolduran biri en fazla 5*0.40=2.00 alır.
export const CATEGORY_WEIGHTS = { technical: 0.35, physical: 0.35, tactical: 0.30 };
export const ROLE_WEIGHTS = { SELF: 0.40, COACH: 0.50, TEAMMATE: 0.10 };

export const QUESTION_FIELDS = [
    'serve', 'receptionPass', 'spike', 'block', 'serveReception',
    'endurance', 'agility', 'jump',
    'gameVision', 'teamCommunication', 'decisionMaking',
];

// Tek bir değerlendirme kaydının (11 soru) ağırlıklı 1-5 toplamı
export function computeRaterOverall(r) {
    const technical = (r.serve + r.receptionPass + r.spike + r.block + r.serveReception) / 5;
    const physical  = (r.endurance + r.agility + r.jump) / 3;
    const tactical  = (r.gameVision + r.teamCommunication + r.decisionMaking) / 3;
    return technical * CATEGORY_WEIGHTS.technical + physical * CATEGORY_WEIGHTS.physical + tactical * CATEGORY_WEIGHTS.tactical;
}

// SELF/COACH/TEAMMATE kayıtlarından derece puanını hesaplar. Eksik kaynak 0 kabul edilir,
// yeniden ağırlıklandırma YAPILMAZ — örn. sadece kendi anketini dolduran biri en fazla
// 5*0.40=2.00 alır (kullanıcı ile netleşen orijinal tasarım).
export function computeOverallScore(ratings) {
    const selfRating = ratings.find(r => r.raterRole === 'SELF');
    const coachRatings = ratings.filter(r => r.raterRole === 'COACH');
    const teammateRatings = ratings.filter(r => r.raterRole === 'TEAMMATE');

    const avg = list => list.length === 0 ? 0 : list.reduce((s, r) => s + computeRaterOverall(r), 0) / list.length;

    const selfScore = selfRating ? computeRaterOverall(selfRating) : 0;
    const coachScore = avg(coachRatings);
    const teammateScore = avg(teammateRatings);

    const overallScore = selfScore * ROLE_WEIGHTS.SELF + coachScore * ROLE_WEIGHTS.COACH + teammateScore * ROLE_WEIGHTS.TEAMMATE;

    return {
        overallScore: parseFloat(overallScore.toFixed(2)),
        selfScore: selfRating ? parseFloat(selfScore.toFixed(2)) : null,
        coachScore: coachRatings.length ? parseFloat(coachScore.toFixed(2)) : null,
        coachCount: coachRatings.length,
        teammateScore: teammateRatings.length ? parseFloat(teammateScore.toFixed(2)) : null,
        teammateCount: teammateRatings.length,
    };
}

// Harmanlanmış puanı (computeOverallScore) YENİDEN hesaplayıp UserInterest.skillRating/level/
// totalPoints'e yazar — bu puan izole değil, oyuncunun GERÇEK derecesi (maç eşleştirme, turnuva
// derece kısıtlaması vb. buradan okur). overallScore zaten 0-5 skalasında olduğu için
// calculateLevel(overallScore, 5) aynı yüzde eşiklerini (PRO/ADVANCED/INTERMEDIATE/BEGINNER)
// tekrar hesaplamadan reuse eder.
export async function applyBlendedVolleyballRating(subjectId, extraData = {}) {
    const ratings = await prisma.volleyballRating.findMany({ where: { subjectId } });
    if (ratings.length === 0) return null;
    const { overallScore } = computeOverallScore(ratings);
    const { level, skillRating, totalPoints } = calculateLevel(overallScore, 5);
    const interest = await prisma.userInterest.findFirst({ where: { userId: subjectId, subCategory: 'volleyball' } });
    if (!interest) return null;
    return prisma.userInterest.update({ where: { id: interest.id }, data: { level, skillRating, totalPoints, ...extraData } });
}

// İki oyuncu voleybolda aynı takımda (rakip değil) tamamlanmış bir maç oynamış mı — akran
// değerlendirmesindeki computeMatchSides ile aynı taraf ayrımını reuse ediyor, çünkü sadece
// aynı taraftaysalar "takım arkadaşı" sayılır (rakip olmaları yetmez).
export async function hasBeenVolleyballTeammates(userId, subjectId) {
    const candidates = await prisma.$queryRaw`
        SELECT id, "senderId", "senderTeam", participants FROM "ActivityRequest"
        WHERE "subCategory" = 'volleyball'
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

export async function isApprovedVolleyballCoach(userId) {
    const listing = await prisma.coachListing.findFirst({
        where: { userId, subCategory: 'volleyball', status: 'ACTIVE', approvedForRating: true },
    });
    return !!listing;
}

// req.userId'nin subjectId için hangi rolle değerlendirme yapabileceğini belirler.
// Rol client'tan alınmaz — spoofing'i önlemek için her zaman sunucu tarafında hesaplanır.
export async function resolveRaterRole(raterId, subjectId) {
    if (raterId === subjectId) return 'SELF';
    if (await isApprovedVolleyballCoach(raterId)) return 'COACH';
    if (await hasBeenVolleyballTeammates(raterId, subjectId)) return 'TEAMMATE';
    return null;
}
