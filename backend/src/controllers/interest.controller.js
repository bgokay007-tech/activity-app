import prisma from '../config/prisma.js';

// Kategorilerin alt dalları
export const SUBCATEGORIES = {
    SPORTS: [
        { id: 'football', name: 'Football', emoji: '⚽' },
        { id: 'basketball', name: 'Basketball', emoji: '🏀' },
        { id: 'tennis', name: 'Tennis', emoji: '🎾' },
        { id: 'volleyball', name: 'Volleyball', emoji: '🏐' },
        { id: 'swimming', name: 'Swimming', emoji: '🏊' },
        { id: 'running', name: 'Running', emoji: '🏃' },
        { id: 'cycling', name: 'Cycling', emoji: '🚴' },
        { id: 'boxing', name: 'Boxing', emoji: '🥊' },
        { id: 'martial_arts', name: 'Martial Arts', emoji: '🥋' },
        { id: 'yoga', name: 'Yoga', emoji: '🧘' },
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