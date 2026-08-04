import prisma from '../config/prisma.js';
import { computeOverallScore, resolveRaterRole, QUESTION_FIELDS, applyBlendedPadelRating } from '../utils/padelRating.js';

const RATER_SELECT = { id: true, username: true, fullName: true, avatar: true };

// GET /padel-rating/:subjectId
export const getPadelRating = async (req, res, next) => {
    try {
        const { subjectId } = req.params;
        const raterId = req.userId;

        // Kendi profilini görüntülerken UserInterest.skillRating de tazelenir — böylece formül
        // değişikliği (ör. ağırlık hesaplaması) sonradan yapılsa bile saklı derece puanı bir
        // sonraki değerlendirmeyi beklemeden ekranı her açtığında güncel kalır.
        if (raterId === subjectId) await applyBlendedPadelRating(subjectId);

        const interest = await prisma.userInterest.findFirst({ where: { userId: subjectId, subCategory: 'padel' } });
        const selfBase = interest ? (interest.selfAssessmentRating ?? interest.skillRating) : 0;
        const ratings = await prisma.padelRating.findMany({ where: { subjectId } });
        const aggregate = computeOverallScore(selfBase, ratings);

        const myRole = await resolveRaterRole(raterId, subjectId);
        const myRating = ratings.find(r => r.raterId === raterId) || null;

        // Antrenör/takım arkadaşı yorumları — derece puanını etkilemez, salt okunur liste
        const commentRows = ratings.filter(r =>
            r.raterRole !== 'SELF' && (r.strongestPoint || r.weakestPoint || r.generalPerformanceNote != null));
        const raters = commentRows.length
            ? await prisma.user.findMany({ where: { id: { in: commentRows.map(r => r.raterId) } }, select: RATER_SELECT })
            : [];
        const raterById = Object.fromEntries(raters.map(u => [u.id, u]));
        const comments = commentRows.map(r => ({
            rater: raterById[r.raterId] || null,
            role: r.raterRole,
            strongestPoint: r.strongestPoint,
            weakestPoint: r.weakestPoint,
            generalPerformanceNote: r.generalPerformanceNote,
            createdAt: r.createdAt,
        }));

        res.json({ ...aggregate, myRole, myRating, comments });
    } catch (error) { next(error); }
};

// POST /padel-rating/:subjectId
export const submitPadelRating = async (req, res, next) => {
    try {
        const { subjectId } = req.params;
        const raterId = req.userId;

        const role = await resolveRaterRole(raterId, subjectId);
        if (!role) return res.status(403).json({ message: 'Bu oyuncuyu padelde değerlendiremezsiniz.' });
        // Kendi anketi artık ilgi alanı değerlendirmesi (AssessmentModal) üzerinden doldurulur
        // ve PadelRating SELF kaydını oradan besler — bkz. interest.controller.js saveAssessment.
        if (role === 'SELF')
            return res.status(400).json({ message: 'Kendi anketini ilgi alanların bölümünden padeli yeniden değerlendirerek doldurabilirsin.' });

        const scores = {};
        for (const field of QUESTION_FIELDS) {
            const v = parseInt(req.body[field]);
            if (!Number.isInteger(v) || v < 1 || v > 5)
                return res.status(400).json({ message: 'Puanlar 1-5 arasında olmalı.' });
            scores[field] = v;
        }

        // Genel Değerlendirme sadece COACH/TEAMMATE'te var — SELF'te client ne gönderirse
        // göndersin sunucu null'a zorlar, derece puanına zaten hiç girmiyor.
        let extra = { strongestPoint: null, weakestPoint: null, generalPerformanceNote: null };
        if (role !== 'SELF') {
            const note = parseInt(req.body.generalPerformanceNote);
            if (!Number.isInteger(note) || note < 1 || note > 10)
                return res.status(400).json({ message: 'Genel performans notu 1-10 arasında olmalı.' });
            extra = {
                strongestPoint: req.body.strongestPoint?.trim() || null,
                weakestPoint: req.body.weakestPoint?.trim() || null,
                generalPerformanceNote: note,
            };
        }

        const data = { raterRole: role, ...scores, ...extra };

        await prisma.padelRating.upsert({
            where: { subjectId_raterId: { subjectId, raterId } },
            create: { subjectId, raterId, ...data },
            update: data,
        });

        // Antrenör/takım arkadaşı değerlendirmesi de derece puanını (UserInterest.skillRating)
        // günceller — harmanlanmış puan (kendi %85, antrenör %10, takım arkadaşı %5) gerçek derece.
        await applyBlendedPadelRating(subjectId);

        const interest = await prisma.userInterest.findFirst({ where: { userId: subjectId, subCategory: 'padel' } });
        const selfBase = interest ? (interest.selfAssessmentRating ?? interest.skillRating) : 0;
        const ratings = await prisma.padelRating.findMany({ where: { subjectId } });
        res.json(computeOverallScore(selfBase, ratings));
    } catch (error) { next(error); }
};
