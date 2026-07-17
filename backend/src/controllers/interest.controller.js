import prisma from '../config/prisma.js';
import { getQuestions, calculateLevel, calculateVolleyballScore, getVolleyballHoneypotPublic, VOLLEYBALL_HONEYPOT } from '../config/assessments.js';
import { getRelation, canAccess } from '../utils/privacy.js';

// Kategorilerin alt dalları
export const SUBCATEGORIES = {
    SPORTS: [
        { id: 'football', name: 'Football', emoji: '⚽' },
        { id: 'basketball', name: 'Basketball', emoji: '🏀' },
        { id: 'tennis', name: 'Tennis', emoji: '🎾' },
        { id: 'padel', name: 'Padel', emoji: '🏓' },
        { id: 'volleyball', name: 'Volleyball', emoji: '🏐' },
        { id: 'swimming', name: 'Swimming', emoji: '🏊' },
        { id: 'running', name: 'Running', emoji: '🏃' },
        { id: 'cycling', name: 'Cycling', emoji: '🚴' },
        { id: 'boxing', name: 'Boxing', emoji: '🥊' },
        { id: 'martial_arts', name: 'Martial Arts', emoji: '🥋' },
        { id: 'wellness', name: 'Yoga / Pilates / Reformer', emoji: '🧘' },
        { id: 'table_tennis', name: 'Table Tennis', emoji: '🏓' },
        { id: 'climbing', name: 'Climbing', emoji: '🧗' },
        { id: 'archery', name: 'Archery', emoji: '🏹' },
        { id: 'walking', name: 'Walking', emoji: '🚶' },
        { id: 'foot_tennis', name: 'Foot Tennis', emoji: '🦶' },
        { id: 'sup_kano', name: 'SUP & Canoe', emoji: '🛶' },
        { id: 'handball', name: 'Handball', emoji: '🤾' },
        { id: 'badminton', name: 'Badminton', emoji: '🏸' },
        { id: 'shooting_hunting', name: 'Shooting & Hunting', emoji: '🔫' },
        { id: 'equestrian', name: 'Equestrian', emoji: '🐎' },
        { id: 'golf', name: 'Golf', emoji: '⛳' },
        { id: 'fitness_gym', name: 'Fitness & Gym', emoji: '🏋️' },
        { id: 'skiing_snowboard', name: 'Skiing & Snowboard', emoji: '⛷️' },
        { id: 'ice_skating', name: 'Ice Skating', emoji: '⛸️' },
        { id: 'hiking', name: 'Hiking', emoji: '🥾' },
        { id: 'camping', name: 'Camping', emoji: '🏕️' },
        { id: 'motorcycle', name: 'Motorcycle Riding', emoji: '🏍️' },
        { id: 'extreme_sports', name: 'Extreme Sports', emoji: '🪂' },
        { id: 'paintball', name: 'Paintball', emoji: '🎯' },
        { id: 'airsoft', name: 'Airsoft', emoji: '🪖' },
    ],
    ARTS: [
        { id: 'music', name: 'Music', emoji: '🎵' },
        { id: 'painting', name: 'Painting', emoji: '🎨' },
        { id: 'dance', name: 'Dance', emoji: '💃' },
        { id: 'photography', name: 'Photography', emoji: '📸' },
        { id: 'theater', name: 'Theater', emoji: '🎭' },
        { id: 'writing', name: 'Writing', emoji: '✍️' },
        { id: 'sculpture', name: 'Sculpture', emoji: '🗿' },
        { id: 'cinema', name: 'Cinema', emoji: '🎬' },
        { id: 'poetry', name: 'Poetry', emoji: '📜' },
        { id: 'illustration', name: 'Illustration', emoji: '🖼️' },
    ],
    GAMES: [
        { id: 'fps', name: 'FPS', emoji: '🎯' },
        { id: 'rpg', name: 'RPG', emoji: '⚔️' },
        { id: 'strategy', name: 'Strategy', emoji: '♟️' },
        { id: 'sports_games', name: 'Sports Games', emoji: '🎮' },
        { id: 'moba', name: 'MOBA', emoji: '🏆' },
        { id: 'battle_royale', name: 'Battle Royale', emoji: '💥' },
        { id: 'simulation', name: 'Simulation', emoji: '🌍' },
        { id: 'puzzle', name: 'Puzzle', emoji: '🧩' },
        { id: 'racing', name: 'Racing', emoji: '🏎️' },
        { id: 'card_games', name: 'Card Games', emoji: '🃏' },
    ],
};

// Tüm kategorileri getir
export const getCategories = async (req, res) => {
    res.json({
        categories: [
            {
                id: 'SPORTS',
                name: 'Sports',
                emoji: '🏃',
                description: 'Find athletes, join tournaments, challenge rivals',
                subCategories: SUBCATEGORIES.SPORTS,
            },
            {
                id: 'ARTS',
                name: 'Arts',
                emoji: '🎨',
                description: 'Connect with artists, share your work, collaborate',
                subCategories: SUBCATEGORIES.ARTS,
            },
            {
                id: 'GAMES',
                name: 'Games',
                emoji: '🎮',
                description: 'Find teammates, join tournaments, compete online',
                subCategories: SUBCATEGORIES.GAMES,
            },
        ],
    });
};

// Kullanıcının ilgi alanlarını getir (gizlenmiş branşlar listelenmez)
export const getUserInterests = async (req, res, next) => {
    try {
        const interests = await prisma.userInterest.findMany({
            where: { userId: req.userId, hidden: false },
            include: { skills: true },
        });
        res.json(interests);
    } catch (error) {
        next(error);
    }
};

// Başka bir kullanıcının ilgi alanlarını getir — sahibinin gizlilik ayarına tabi
export const getInterestsOf = async (req, res, next) => {
    try {
        const { userId } = req.params;
        if (userId !== req.userId) {
            const owner = await prisma.user.findUnique({
                where: { id: userId },
                select: { activitiesPrivacy: true, activitiesExclude: true },
            });
            if (!owner) return res.status(404).json({ message: 'User not found' });
            const { isFriend, isFollower } = await getRelation(userId, req.userId);
            if (!canAccess({ ownerId: userId, viewerId: req.userId, mode: owner.activitiesPrivacy, list: owner.activitiesExclude, isFriend, isFollower })) {
                return res.json([]);
            }
        }
        const interests = await prisma.userInterest.findMany({
            where: { userId, hidden: false },
            include: { skills: true },
        });
        res.json(interests);
    } catch (error) {
        next(error);
    }
};

// İlgi alanı ekle
export const addInterest = async (req, res, next) => {
    try {
        const { category, subCategory } = req.body;

        // Kategori geçerli mi?
        if (!['SPORTS', 'ARTS', 'GAMES'].includes(category)) {
            return res.status(400).json({ message: 'Invalid category' });
        }

        // Alt kategori geçerli mi?
        const validSub = SUBCATEGORIES[category].find(s => s.id === subCategory);
        if (!validSub) {
            return res.status(400).json({ message: 'Invalid subCategory' });
        }

        // update: { hidden: false } — daha once gizlenmis bir brans tekrar eklenirse
        // (silinmis degil, sadece gizlenmisti) puan/mac gecmisi korunarak geri getirilir,
        // yeni bir kayit olusmaz.
        const interest = await prisma.userInterest.upsert({
            where: {
                userId_category_subCategory: {
                    userId: req.userId,
                    category,
                    subCategory,
                },
            },
            update: { hidden: false },
            create: {
                userId: req.userId,
                category,
                subCategory,
            },
            include: { skills: true },
        });

        // Kart yoksa oluştur
        await prisma.activityCard.upsert({
            where: {
                userId_category: {
                    userId: req.userId,
                    category,
                },
            },
            update: {},
            create: {
                userId: req.userId,
                category,
            },
        });

        res.status(201).json(interest);
    } catch (error) {
        next(error);
    }
};

// İlgi alanı kaldır — 3+ maç oynanmış branş tamamen silinemez (puan/geçmiş sıfırlayıp
// yeniden anket doldurma istismarını engellemek için), sadece gizlenebilir (bkz. hideInterest).
export const removeInterest = async (req, res, next) => {
    try {
        const { id } = req.params;

        const interest = await prisma.userInterest.findUnique({ where: { id } });

        if (!interest || interest.userId !== req.userId) {
            return res.status(404).json({ message: 'Interest not found' });
        }

        if ((interest.wins || 0) + (interest.losses || 0) >= 3) {
            return res.status(403).json({ message: 'Bu branşta 3 veya daha fazla maç oynadığınız için tamamen silinemez. Gizleyebilirsiniz.' });
        }

        await prisma.userInterest.delete({ where: { id } });

        res.json({ message: 'Interest removed' });
    } catch (error) {
        next(error);
    }
};

// İlgi alanını gizle — silmez, sadece kullanıcının aktif branş listesinden kaldırır.
// Tekrar eklenirse (addInterest) puan/maç geçmişi korunarak geri gelir.
export const hideInterest = async (req, res, next) => {
    try {
        const { id } = req.params;

        const interest = await prisma.userInterest.findUnique({ where: { id } });
        if (!interest || interest.userId !== req.userId) {
            return res.status(404).json({ message: 'Interest not found' });
        }

        await prisma.userInterest.update({ where: { id }, data: { hidden: true } });

        res.json({ message: 'Interest hidden' });
    } catch (error) {
        next(error);
    }
};

// Assessment sorularını getir (?position= ile pozisyon bazlı futbol desteği)
export const getAssessmentQuestions = async (req, res) => {
    const { subCategory } = req.params;
    const { position, lang } = req.query; // goalkeeper | defender | midfielder | forward | allrounder

    const key = subCategory === 'football' && position
        ? `football_${position}`
        : subCategory;

    const questions = getQuestions(key, lang || 'en');
    const maxScore = questions.reduce((sum, q) => sum + Math.max(...q.options.map(o => o.points)), 0);

    // Voleybol: takip (honeypot) sorusu ayrı gönderilir, dogru cevap client'a gitmez
    const honeypot = subCategory === 'volleyball' ? getVolleyballHoneypotPublic(lang || 'en') : undefined;

    res.json({ subCategory, position: position || null, questions, maxScore, ...(honeypot ? { honeypot } : {}) });
};

// Assessment sonucunu kaydet → level ve initialPoints güncelle
export const saveAssessment = async (req, res, next) => {
    try {
        const { id } = req.params; // interestId
        const { answers } = req.body; // [{questionId, points}]

        const interest = await prisma.userInterest.findUnique({ where: { id } });
        if (!interest || interest.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });

        // Voleybol: agirlikli kategori puanlamasi (calculateLevel'dan bagimsiz, bkz. assessments.js)
        if (interest.subCategory === 'volleyball') {
            const answersMap = {};
            let honeypotOptionIndex = null;
            for (const a of answers) {
                if (a.questionId === VOLLEYBALL_HONEYPOT.id) honeypotOptionIndex = a.optionIndex;
                else answersMap[a.questionId] = a.optionIndex;
            }
            const { level, skillRating, totalPoints } = calculateVolleyballScore(answersMap, honeypotOptionIndex);

            const updated = await prisma.userInterest.update({
                where: { id },
                data: { level, skillRating, totalPoints, assessmentCompleted: true, matchesSinceAssessment: 0 },
            });

            return res.json({ interest: updated, level, skillRating, totalPoints });
        }

        const questions = getQuestions(interest.subCategory);
        const maxScore = questions.reduce((sum, q) => sum + Math.max(...q.options.map(o => o.points)), 0);
        const totalScore = answers.reduce((sum, a) => sum + (a.points || 0), 0);
        const { level, skillRating, totalPoints } = calculateLevel(totalScore, maxScore);

        const updated = await prisma.userInterest.update({
            where: { id },
            data: { level, skillRating, totalPoints, assessmentCompleted: true, matchesSinceAssessment: 0 },
        });

        res.json({ interest: updated, totalScore, maxScore, level, skillRating, totalPoints });
    } catch (error) { next(error); }
};

// Digimon kart oylama toggle
export const toggleVoting = async (req, res, next) => {
    try {
        const { id } = req.params;
        const interest = await prisma.userInterest.findUnique({ where: { id } });
        if (!interest || interest.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });

        const updated = await prisma.userInterest.update({
            where: { id },
            data: { digimonVotingEnabled: !interest.digimonVotingEnabled },
        });
        res.json({ digimonVotingEnabled: updated.digimonVotingEnabled });
    } catch (error) { next(error); }
};

// Oylama sonuçlarını getir
export const getVotes = async (req, res, next) => {
    try {
        const { id } = req.params; // targetInterestId

        const interest = await prisma.userInterest.findUnique({ where: { id } });
        if (!interest) return res.status(404).json({ message: 'Interest not found' });

        const votes = await prisma.assessmentVote.findMany({ where: { targetInterestId: id } });

        // Aggregate: { [questionId]: { [optionIndex]: count } }
        const agg = {};
        for (const v of votes) {
            if (!agg[v.questionId]) agg[v.questionId] = {};
            agg[v.questionId][v.optionIndex] = (agg[v.questionId][v.optionIndex] || 0) + 1;
        }

        // My own vote (if viewer is not the owner)
        let myVotes = {};
        if (req.userId !== interest.userId) {
            const mine = await prisma.assessmentVote.findMany({
                where: { voterId: req.userId, targetInterestId: id },
            });
            for (const v of mine) myVotes[v.questionId] = v.optionIndex;
        }

        res.json({ aggregate: agg, myVotes, digimonVotingEnabled: interest.digimonVotingEnabled });
    } catch (error) { next(error); }
};

// Oy ver / güncelle
export const submitVote = async (req, res, next) => {
    try {
        const { id } = req.params; // targetInterestId
        const { questionId, optionIndex } = req.body;

        const interest = await prisma.userInterest.findUnique({ where: { id } });
        if (!interest) return res.status(404).json({ message: 'Interest not found' });
        if (interest.userId === req.userId) return res.status(400).json({ message: 'Cannot vote on your own card' });
        if (!interest.digimonVotingEnabled) return res.status(403).json({ message: 'Voting not enabled' });

        // Voter must share the same subCategory
        const sharedInterest = await prisma.userInterest.findFirst({
            where: { userId: req.userId, subCategory: interest.subCategory },
        });
        if (!sharedInterest) return res.status(403).json({ message: 'You must share this activity to vote' });

        await prisma.assessmentVote.upsert({
            where: { voterId_targetInterestId_questionId: { voterId: req.userId, targetInterestId: id, questionId } },
            update: { optionIndex },
            create: { voterId: req.userId, targetInterestId: id, questionId, optionIndex },
        });

        res.json({ ok: true });
    } catch (error) { next(error); }
};

// Kategoriye göre kullanıcıları getir
export const getUsersByCategory = async (req, res, next) => {
    try {
        const { category, subCategory } = req.query;

        const users = await prisma.user.findMany({
            where: {
                id: { not: req.userId },
                interests: {
                    some: {
                        category: category || undefined,
                        subCategory: subCategory || undefined,
                    },
                },
            },
            select: {
                id: true,
                username: true,
                fullName: true,
                avatar: true,
                interests: {
                    where: {
                        category: category || undefined,
                    },
                    select: {
                        category: true,
                        subCategory: true,
                        level: true,
                        totalPoints: true,
                    },
                },
                cards: {
                    where: {
                        category: category || undefined,
                    },
                    select: {
                        category: true,
                        cardLevel: true,
                        power: true,
                        creativity: true,
                        technique: true,
                        stamina: true,
                    },
                },
            },
            take: 20,
        });

        res.json(users);
    } catch (error) {
        next(error);
    }
};

export const updateAlias = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { alias } = req.body;

        const interest = await prisma.userInterest.findUnique({ where: { id } });
        if (!interest) return res.status(404).json({ message: 'Interest not found' });
        if (interest.userId !== req.userId) return res.status(403).json({ message: 'Forbidden' });

        const trimmed = alias ? alias.trim().slice(0, 30) : null;
        const updated = await prisma.userInterest.update({
            where: { id },
            data: { alias: trimmed || null },
        });
        res.json({ alias: updated.alias });
    } catch (error) { next(error); }
};