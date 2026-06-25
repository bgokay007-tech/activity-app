import prisma from '../config/prisma.js';

// Kullanıcının bu sporda birlikte maç yaptığı kişileri kontrol et
async function hasPlayedTogether(userId, subjectId, subCategory) {
    const match = await prisma.activityRequest.findFirst({
        where: {
            subCategory,
            status: 'COMPLETED',
            OR: [
                { senderId: userId,   participants: { path: '$[*].id', array_contains: subjectId } },
                { senderId: subjectId, participants: { path: '$[*].id', array_contains: userId } },
            ],
        },
    });
    return !!match;
}

// GET /survey/:subjectId/:subCategory
// Mevcut kullanıcının bu kişi için değerlendirmesi + ortalamalar
export const getSurvey = async (req, res, next) => {
    try {
        const { subjectId, subCategory } = req.params;
        const raterId = req.userId;

        const canRate = raterId !== subjectId && await hasPlayedTogether(raterId, subjectId, subCategory);

        const myRating = raterId !== subjectId
            ? await prisma.sportSurvey.findUnique({ where: { subjectId_raterId_subCategory: { subjectId, raterId, subCategory } } })
            : null;

        const all = await prisma.sportSurvey.findMany({ where: { subjectId, subCategory } });
        const count = all.length;
        const averages = count === 0 ? null : {
            stres:    parseFloat((all.reduce((s, r) => s + r.stres,    0) / count).toFixed(2)),
            fairplay: parseFloat((all.reduce((s, r) => s + r.fairplay, 0) / count).toFixed(2)),
            beden:    parseFloat((all.reduce((s, r) => s + r.beden,    0) / count).toFixed(2)),
            count,
        };

        res.json({ canRate, myRating, averages });
    } catch (error) {
        next(error);
    }
};

// POST /survey/:subjectId/:subCategory
export const submitSurvey = async (req, res, next) => {
    try {
        const { subjectId, subCategory } = req.params;
        const raterId = req.userId;
        const { stres, fairplay, beden } = req.body;

        if (raterId === subjectId) return res.status(400).json({ message: 'Kendinizi değerlendiremezsiniz.' });

        const eligible = await hasPlayedTogether(raterId, subjectId, subCategory);
        if (!eligible) return res.status(403).json({ message: 'Bu sporcu ile maç yapmadınız.' });

        if ([stres, fairplay, beden].some(v => v < 1 || v > 5)) {
            return res.status(400).json({ message: 'Puanlar 1-5 arasında olmalı.' });
        }

        const survey = await prisma.sportSurvey.upsert({
            where: { subjectId_raterId_subCategory: { subjectId, raterId, subCategory } },
            create: { subjectId, raterId, subCategory, stres: parseInt(stres), fairplay: parseInt(fairplay), beden: parseInt(beden) },
            update: { stres: parseInt(stres), fairplay: parseInt(fairplay), beden: parseInt(beden) },
        });

        res.json(survey);
    } catch (error) {
        next(error);
    }
};
