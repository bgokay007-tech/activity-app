import prisma from '../config/prisma.js';
import { computeMatchSides } from './peerReview.js';

// Tenis + padel ortak geri bildirim — ELO / seed / skillRating'e HİÇ yazılmaz.
// Sadece profilde görünen antrenör/maç arkadaşı notları için.
export const RACQUET_FEEDBACK_SUBS = ['tennis', 'padel'];

export const CATEGORY_WEIGHTS = { technical: 0.40, physical: 0.30, tactical: 0.30 };

export const QUESTION_FIELDS = [
    'forehandDrive', 'backhandDrive', 'volley', 'smash',
    'agility', 'endurance', 'reflexes',
    'courtPositioning', 'shotSelection', 'teamCommunication',
];

export function computeRaterOverall(r) {
    const technical = (r.forehandDrive + r.backhandDrive + r.volley + r.smash) / 4;
    const physical  = (r.agility + r.endurance + r.reflexes) / 3;
    const tactical  = (r.courtPositioning + r.shotSelection + r.teamCommunication) / 3;
    return technical * CATEGORY_WEIGHTS.technical + physical * CATEGORY_WEIGHTS.physical + tactical * CATEGORY_WEIGHTS.tactical;
}

// Ortalama geri bildirim skoru — salt gösterim. ELO ile karıştırılmaz, harmanlanmaz.
export function computeFeedbackSummary(ratings) {
    const coachRatings = ratings.filter(r => r.raterRole === 'COACH');
    const peerRatings = ratings.filter(r => r.raterRole === 'TEAMMATE' || r.raterRole === 'OPPONENT');
    const avg = list => list.length === 0 ? null : parseFloat((list.reduce((s, r) => s + computeRaterOverall(r), 0) / list.length).toFixed(2));
    return {
        overallScore: avg(ratings),
        coachScore: avg(coachRatings),
        coachCount: coachRatings.length,
        peerScore: avg(peerRatings),
        peerCount: peerRatings.length,
        teammateScore: avg(peerRatings), // mobil eski etiket uyumu
        teammateCount: peerRatings.length,
    };
}

async function findCompletedMatchSides(subCategory, userId, subjectId) {
    const candidates = await prisma.$queryRaw`
        SELECT id, "senderId", "senderTeam", participants FROM "ActivityRequest"
        WHERE "subCategory" = ${subCategory}
          AND status = 'COMPLETED'
          AND (
            "senderId" = ${userId} OR "senderId" = ${subjectId}
            OR "senderTeam"::jsonb @> ${JSON.stringify([{ id: userId }])}::jsonb
            OR "senderTeam"::jsonb @> ${JSON.stringify([{ id: subjectId }])}::jsonb
            OR participants::jsonb @> ${JSON.stringify([{ id: userId }])}::jsonb
            OR participants::jsonb @> ${JSON.stringify([{ id: subjectId }])}::jsonb
          )
    `;
    for (const m of candidates) {
        const sides = computeMatchSides(m);
        const aHasBoth = sides.teamA.has(userId) && sides.teamA.has(subjectId);
        const bHasBoth = sides.teamB.has(userId) && sides.teamB.has(subjectId);
        if (aHasBoth || bHasBoth) return 'TEAMMATE';
        const crossed =
            (sides.teamA.has(userId) && sides.teamB.has(subjectId)) ||
            (sides.teamB.has(userId) && sides.teamA.has(subjectId));
        if (crossed) return 'OPPONENT';
    }
    return null;
}

// Voleyboldeki approvedForRating yerine ilan onayı (approved) — tenis/padel admin
// "değerlendirme onayı" kuyruğuna sahip değil; aktif onaylı antrenör ilanı yeterli.
export async function isApprovedRacquetCoach(userId, subCategory) {
    const listing = await prisma.coachListing.findFirst({
        where: { userId, subCategory, status: 'ACTIVE', approved: true },
    });
    return !!listing;
}

// Rol client'tan alınmaz. SELF yok — kendi anketi ELO seed'ini besler, buraya karışmaz.
export async function resolveRaterRole(raterId, subjectId, subCategory) {
    if (!RACQUET_FEEDBACK_SUBS.includes(subCategory)) return null;
    if (raterId === subjectId) return null;
    if (await isApprovedRacquetCoach(raterId, subCategory)) return 'COACH';
    return findCompletedMatchSides(subCategory, raterId, subjectId);
}
