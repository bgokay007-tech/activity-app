import prisma from '../config/prisma.js';
import {
    RACQUET_FEEDBACK_SUBS, QUESTION_FIELDS, computeRaterOverall, computeFeedbackSummary, resolveRaterRole,
} from '../utils/racquetFeedback.js';

const RATER_SELECT = { id: true, username: true, fullName: true, avatar: true };

// GET /racquet-feedback/:subCategory/:subjectId
export const getRacquetFeedback = async (req, res, next) => {
    try {
        const { subCategory, subjectId } = req.params;
        if (!RACQUET_FEEDBACK_SUBS.includes(subCategory)) {
            return res.status(400).json({ message: 'Bu dalda geri bildirim yok' });
        }
        const raterId = req.userId;

        const ratings = await prisma.racquetFeedback.findMany({ where: { subjectId, subCategory } });
        const aggregate = computeFeedbackSummary(ratings);
        const myRole = await resolveRaterRole(raterId, subjectId, subCategory);
        const myRating = ratings.find(r => r.raterId === raterId) || null;

        const commentRows = ratings;
        const raters = commentRows.length
            ? await prisma.user.findMany({ where: { id: { in: [...new Set(commentRows.map(r => r.raterId))] } }, select: RATER_SELECT })
            : [];
        const raterById = Object.fromEntries(raters.map(u => [u.id, u]));
        const comments = commentRows.map(r => ({
            rater: raterById[r.raterId] || null,
            role: r.raterRole,
            scores: Object.fromEntries(QUESTION_FIELDS.map(field => [field, r[field]])),
            overall: parseFloat(computeRaterOverall(r).toFixed(2)),
            strongestPoint: r.strongestPoint,
            weakestPoint: r.weakestPoint,
            generalPerformanceNote: r.generalPerformanceNote,
            createdAt: r.createdAt,
        }));

        // ELO alanlarına dokunulmaz — aggregate sadece geri bildirim ortalaması.
        res.json({ ...aggregate, myRole, myRating, comments, affectsElo: false });
    } catch (error) { next(error); }
};

// POST /racquet-feedback/:subCategory/:subjectId
export const submitRacquetFeedback = async (req, res, next) => {
    try {
        const { subCategory, subjectId } = req.params;
        if (!RACQUET_FEEDBACK_SUBS.includes(subCategory)) {
            return res.status(400).json({ message: 'Bu dalda geri bildirim yok' });
        }
        const raterId = req.userId;

        const role = await resolveRaterRole(raterId, subjectId, subCategory);
        if (!role) {
            return res.status(403).json({
                message: 'Bu oyuncuyu değerlendiremezsiniz — onaylı antrenör değilsiniz veya birlikte tamamlanmış bir maçınız yok.',
            });
        }

        const scores = {};
        for (const field of QUESTION_FIELDS) {
            const v = parseInt(req.body[field]);
            if (!Number.isInteger(v) || v < 1 || v > 5) {
                return res.status(400).json({ message: 'Puanlar 1-5 arasında olmalı.' });
            }
            scores[field] = v;
        }

        const note = parseInt(req.body.generalPerformanceNote);
        if (!Number.isInteger(note) || note < 1 || note > 10) {
            return res.status(400).json({ message: 'Genel performans notu 1-10 arasında olmalı.' });
        }
        const extra = {
            strongestPoint: req.body.strongestPoint?.trim() || null,
            weakestPoint: req.body.weakestPoint?.trim() || null,
            generalPerformanceNote: note,
        };

        const data = { raterRole: role, ...scores, ...extra };

        await prisma.racquetFeedback.upsert({
            where: { subjectId_raterId_subCategory: { subjectId, raterId, subCategory } },
            create: { subjectId, raterId, subCategory, ...data },
            update: data,
        });

        // Bilinçli olarak UserInterest / singlesRating / doublesRating / seed GÜNCELLENMEZ.
        const ratings = await prisma.racquetFeedback.findMany({ where: { subjectId, subCategory } });
        res.json({ ...computeFeedbackSummary(ratings), affectsElo: false });
    } catch (error) { next(error); }
};
