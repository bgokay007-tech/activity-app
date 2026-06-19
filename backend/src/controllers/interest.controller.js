import prisma from '../config/prisma.js';
import { getQuestions, calculateLevel } from '../config/assessments.js';

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

// Kullanıcının ilgi alanlarını getir
export const getUserInterests = async (req, res, next) => {
    try {
        const interests = await prisma.userInterest.findMany({
            where: { userId: req.userId },
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

        const interest = await prisma.userInterest.upsert({
            where: {
                userId_category_subCategory: {
                    userId: req.userId,
                    category,
                    subCategory,
                },
            },
            update: {},
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

// İlgi alanı kaldır
export const removeInterest = async (req, res, next) => {
    try {
        const { id } = req.params;

        const interest = await prisma.userInterest.findUnique({ where: { id } });

        if (!interest || interest.userId !== req.userId) {
            return res.status(404).json({ message: 'Interest not found' });
        }

        await prisma.userInterest.delete({ where: { id } });

        res.json({ message: 'Interest removed' });
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
    res.json({ subCategory, position: position || null, questions, maxScore });
};

// Assessment sonucunu kaydet → level ve initialPoints güncelle
export const saveAssessment = async (req, res, next) => {
    try {
        const { id } = req.params; // interestId
        const { answers } = req.body; // [{questionId, points}]

        const interest = await prisma.userInterest.findUnique({ where: { id } });
        if (!interest || interest.userId !== req.userId)
            return res.status(403).json({ message: 'Forbidden' });

        const questions = getQuestions(interest.subCategory);
        const maxScore = questions.reduce((sum, q) => sum + Math.max(...q.options.map(o => o.points)), 0);
        const totalScore = answers.reduce((sum, a) => sum + (a.points || 0), 0);
        const { level, skillRating, totalPoints } = calculateLevel(totalScore, maxScore);

        const updated = await prisma.userInterest.update({
            where: { id },
            data: { level, skillRating, totalPoints },
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