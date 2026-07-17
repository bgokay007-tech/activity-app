import prisma from '../config/prisma.js';

// Akran doğrulama şu an sadece voleybolda aktif (hobi/pro ayrımı zayıf olan branş) —
// ileride başka dallara genişletilebilir, tenis/padel'in kendi ELO motoruna dokunmaz.
export const PEER_REVIEW_SUBCATEGORIES = ['volleyball'];

// confirmScore'daki aynı taraf ayrımının (rival.controller.js:1797-1798) tek ortak kopyası.
export function computeMatchSides(request) {
    const participants = Array.isArray(request.participants) ? request.participants : [];
    const senderTeamArr = Array.isArray(request.senderTeam) ? request.senderTeam : [];
    const teamA = new Set([request.senderId, ...senderTeamArr.map(m => m.id)]);
    const teamB = new Set(participants.map(p => p.id));
    return { teamA, teamB };
}

// İki oyuncu aynı taraftaysa (önceden grup olarak katılmışlarsa) true — bu çiftin oyu
// harmanlamaya girmez (arkadaşlar birbirine yüksek puan verip istismar edemesin).
export function isPremadePair(sides, idA, idB) {
    const { teamA, teamB } = sides;
    return (teamA.has(idA) && teamA.has(idB)) || (teamB.has(idA) && teamB.has(idB));
}

// Oy verenin son 10 akran oyunun (teknik+mental ortalaması) standart sapması. <5 önceki
// oyu varsa yeni oy verenler cezalandırılmaz (1.0). Hep aynı puanı veren şüpheli oy
// verenler stddev≈0 olur ve 0.2'ye (ağırlığın %80'i kırpılmış) kadar düşer.
export async function computeReviewerTrustScore(reviewerId, subCategory) {
    const votes = await prisma.matchPeerReview.findMany({
        where: { reviewerId, subCategory },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: { technicalStars: true, mentalStars: true },
    });
    if (votes.length < 5) return 1.0;

    const values = votes.map(v => (v.technicalStars + v.mentalStars) / 2);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
    const stddev = Math.sqrt(variance);

    return Math.min(1.0, Math.max(0.2, stddev / 1.0));
}

// Bir maç+kullanıcı için akran-oy harmanını uygular. `PeerReviewBlend`'in
// @@unique([matchId, userId]) kısıtı sayesinde idempotent — zaten uygulanmışsa null döner.
// Önce premade olmayan oylar alınır, ≥3 varsa en düşük+en yüksek birer tane atılır (medyan
// filtresi), trust-ağırlıklı ortalama alınır. newSkillRating = clamp(0,5, current*0.9 +
// peerAvg*0.1). totalPoints de BİRLİKTE yazılır — aksi halde bir sonraki normal ELO maçı
// (applyCompetitivePoints) skillRating'i totalPoints'ten yeniden hesaplayıp bunu sessizce siler.
export async function tryApplyPeerReviewBlend(matchId, revieweeId, subCategory) {
    const existing = await prisma.peerReviewBlend.findUnique({
        where: { matchId_userId: { matchId, userId: revieweeId } },
    });
    if (existing) return null;

    const votes = await prisma.matchPeerReview.findMany({
        where: { matchId, revieweeId, subCategory, isPremade: false },
    });
    if (votes.length === 0) return null;

    let usable = votes.map(v => ({
        score: (v.technicalStars + v.mentalStars) / 2, // 1-5
        weight: v.trustWeightApplied,
    }));

    if (usable.length >= 3) {
        usable.sort((a, b) => a.score - b.score);
        usable = usable.slice(1, -1);
    }

    const totalWeight = usable.reduce((s, v) => s + v.weight, 0);
    if (totalWeight <= 0) return null;
    const peerAvg = usable.reduce((s, v) => s + v.score * v.weight, 0) / totalWeight; // 1-5 scale

    const interest = await prisma.userInterest.findFirst({
        where: { userId: revieweeId, subCategory },
    });
    if (!interest) return null;

    const skillRatingBefore = interest.skillRating;
    const newSkillRating = Math.min(5, Math.max(0, skillRatingBefore * 0.9 + peerAvg * 0.1));
    const newTotalPoints = Math.round((newSkillRating / 5) * 100);

    await prisma.$transaction([
        prisma.userInterest.update({
            where: { id: interest.id },
            data: { skillRating: parseFloat(newSkillRating.toFixed(4)), totalPoints: newTotalPoints },
        }),
        prisma.peerReviewBlend.create({
            data: {
                matchId, userId: revieweeId, subCategory,
                peerAverage: parseFloat(peerAvg.toFixed(4)),
                votesUsed: usable.length,
                skillRatingBefore,
                skillRatingAfter: parseFloat(newSkillRating.toFixed(4)),
            },
        }),
    ]);

    return { skillRatingBefore, skillRatingAfter: newSkillRating, votesUsed: usable.length };
}
