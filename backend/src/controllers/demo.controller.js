import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import { emitToUser } from '../config/socket.js';

const DEMO_TENNIS_PLAYERS = [
    { username: 'demo_t_rafael',  fullName: 'Rafael Moreno',    gender: 'MALE',   level: 'ADVANCED',     skillRating: 3.63, wins: 31, losses: 2  },
    { username: 'demo_t_carlos',  fullName: 'Carlos Vega',      gender: 'FEMALE', level: 'PRO',          skillRating: 4.82, wins: 28, losses: 4  },
    { username: 'demo_t_novak',   fullName: 'Novak Petrov',     gender: 'FEMALE', level: 'PRO',          skillRating: 4.69, wins: 33, losses: 3  },
    { username: 'demo_t_andrey',  fullName: 'Andrey Kuznetsov', gender: 'FEMALE', level: 'ADVANCED',     skillRating: 3.58, wins: 18, losses: 6  },
    { username: 'demo_t_daniil',  fullName: 'Daniil Frolov',    gender: 'MALE',   level: 'PRO',          skillRating: 4.15, wins: 15, losses: 7  },
    { username: 'demo_t_stefanos',fullName: 'Stefanos Papadop', gender: 'FEMALE', level: 'BEGINNER',     skillRating: 0.08, wins: 20, losses: 5  },
    { username: 'demo_t_taylor',  fullName: 'Taylor Fritz',     gender: 'FEMALE', level: 'BEGINNER',     skillRating: 1.18, wins: 12, losses: 8  },
    { username: 'demo_t_jannik',  fullName: 'Jannik Rossi',     gender: 'MALE',   level: 'PRO',          skillRating: 4.42, wins: 26, losses: 3  },
    { username: 'demo_t_alexander',fullName:'Alexander Müller', gender: 'MALE',   level: 'INTERMEDIATE', skillRating: 2.64, wins: 17, losses: 6  },
    { username: 'demo_t_hubert',  fullName: 'Hubert Kowski',    gender: 'FEMALE', level: 'ADVANCED',     skillRating: 3.62, wins: 11, losses: 9  },
    { username: 'demo_t_felix',   fullName: 'Felix Auger',      gender: 'MALE',   level: 'ADVANCED',     skillRating: 3.62, wins: 10, losses: 8  },
    { username: 'demo_t_casper',  fullName: 'Casper Ruud',      gender: 'MALE',   level: 'PRO',          skillRating: 4.66, wins: 14, losses: 7  },
    { username: 'demo_t_ben',     fullName: 'Ben Shelton',      gender: 'FEMALE', level: 'PRO',          skillRating: 4.37, wins: 8,  losses: 10 },
    { username: 'demo_t_tommy',   fullName: 'Tommy Paul',       gender: 'FEMALE', level: 'ADVANCED',     skillRating: 3.57, wins: 6,  losses: 9  },
    { username: 'demo_t_frances', fullName: 'Frances Tiafoe',   gender: 'FEMALE', level: 'BEGINNER',     skillRating: 1.32, wins: 9,  losses: 8  },
    { username: 'demo_t_sebastian',fullName:'Sebastian Korda',  gender: 'MALE',   level: 'BEGINNER',     skillRating: 2.40, wins: 5,  losses: 10 },
    { username: 'demo_t_grigor',  fullName: 'Grigor Dimitrov',  gender: 'MALE',   level: 'BEGINNER',     skillRating: 2.08, wins: 13, losses: 8  },
    { username: 'demo_t_karen',   fullName: 'Karen Khachanov',  gender: 'FEMALE', level: 'INTERMEDIATE', skillRating: 3.19, wins: 7,  losses: 11 },
    { username: 'demo_t_nicolas', fullName: 'Nicolas Jarry',    gender: 'MALE',   level: 'BEGINNER',     skillRating: 1.74, wins: 4,  losses: 9  },
    { username: 'demo_t_ugo',     fullName: 'Ugo Humbert',      gender: 'MALE',   level: 'BEGINNER',     skillRating: 2.10, wins: 5,  losses: 8  },
    { username: 'demo_t_arthur',  fullName: 'Arthur Fils',      gender: 'MALE',   level: 'BEGINNER',     skillRating: 1.77, wins: 6,  losses: 7  },
    { username: 'demo_t_gabriel', fullName: 'Gabriel Diallo',   gender: 'MALE',   level: 'BEGINNER',     skillRating: 2.46, wins: 2,  losses: 5  },
    { username: 'demo_t_luciano', fullName: 'Luciano Darderi',  gender: 'FEMALE', level: 'ADVANCED',     skillRating: 3.78, wins: 1,  losses: 6  },
    { username: 'demo_t_matteo',  fullName: 'Matteo Berrettini',gender: 'FEMALE', level: 'INTERMEDIATE', skillRating: 2.87, wins: 13, losses: 9  },
    { username: 'demo_t_denis',   fullName: 'Denis Shapovalov', gender: 'MALE',   level: 'BEGINNER',     skillRating: 1.04, wins: 9,  losses: 10 },
    { username: 'demo_t_richard', fullName: 'Richard Gasquet',  gender: 'FEMALE', level: 'BEGINNER',     skillRating: 1.90, wins: 11, losses: 8  },
    { username: 'demo_t_gael',    fullName: 'Gael Monfils',     gender: 'FEMALE', level: 'BEGINNER',     skillRating: 1.08, wins: 14, losses: 6  },
    { username: 'demo_t_diego',   fullName: 'Diego Schwartzman',gender: 'MALE',   level: 'BEGINNER',     skillRating: 0.31, wins: 8,  losses: 9  },
    { username: 'demo_t_pablo',   fullName: 'Pablo Carreno',    gender: 'MALE',   level: 'BEGINNER',     skillRating: 1.44, wins: 7,  losses: 10 },
    { username: 'demo_t_roberto', fullName: 'Roberto Bautista', gender: 'FEMALE', level: 'ADVANCED',     skillRating: 3.82, wins: 12, losses: 7  },
    { username: 'demo_t_borna',   fullName: 'Borna Coric',      gender: 'FEMALE', level: 'INTERMEDIATE', skillRating: 2.53, wins: 4,  losses: 11 },
    { username: 'demo_t_aslan',   fullName: 'Aslan Karatsev',   gender: 'MALE',   level: 'INTERMEDIATE', skillRating: 2.59, wins: 3,  losses: 8  },
    { username: 'demo_t_jiri',    fullName: 'Jiri Lehecka',     gender: 'FEMALE', level: 'BEGINNER',     skillRating: 0.56, wins: 2,  losses: 7  },
    { username: 'demo_t_tomas',   fullName: 'Tomas Machac',     gender: 'MALE',   level: 'BEGINNER',     skillRating: 0.05, wins: 2,  losses: 6  },
    { username: 'demo_t_sebastian2',fullName:'Sebastian Baez',  gender: 'MALE',   level: 'PRO',          skillRating: 4.98, wins: 1,  losses: 7  },
    { username: 'demo_t_pedro',   fullName: 'Pedro Martinez',   gender: 'MALE',   level: 'BEGINNER',     skillRating: 1.78, wins: 1,  losses: 5  },
    { username: 'demo_t_albert',  fullName: 'Albert Ramos',     gender: 'FEMALE', level: 'ADVANCED',     skillRating: 4.06, wins: 0,  losses: 4  },
    { username: 'demo_t_james',   fullName: 'James Duckworth',  gender: 'MALE',   level: 'BEGINNER',     skillRating: 0.22, wins: 0,  losses: 6  },
    { username: 'demo_t_lloyd',   fullName: 'Lloyd Harris',     gender: 'FEMALE', level: 'BEGINNER',     skillRating: 0.87, wins: 0,  losses: 5  },
    { username: 'demo_t_maxime',  fullName: 'Maxime Cressy',    gender: 'FEMALE', level: 'BEGINNER',     skillRating: 0.78, wins: 1,  losses: 8  },
];

const DEMO_FOOTBALL_PLAYERS = [
    { username: 'demo_ali_fc',   fullName: 'Ali Demir',    skillRating: 4.20, level: 'ADVANCED',     totalPoints: 84, wins: 12, losses: 3 },
    { username: 'demo_emre_fc',  fullName: 'Emre Kaya',    skillRating: 2.80, level: 'INTERMEDIATE',  totalPoints: 56, wins: 5,  losses: 7 },
    { username: 'demo_berk_fc',  fullName: 'Berk Arslan',  skillRating: 1.40, level: 'BEGINNER',      totalPoints: 28, wins: 1,  losses: 4 },
    { username: 'demo_mert_fc',  fullName: 'Mert Yılmaz',  skillRating: 3.50, level: 'ADVANCED',      totalPoints: 70, wins: 9,  losses: 5 },
    { username: 'demo_can_fc',   fullName: 'Can Öztürk',   skillRating: 4.83, level: 'PRO',           totalPoints: 97, wins: 22, losses: 2 },
];

export const seedDemoFootballJoinRequests = async (req, res, next) => {
    try {
        const myId = req.userId;

        const openRequests = await prisma.activityRequest.findMany({
            where: {
                senderId: myId,
                subCategory: 'football',
                matchType: 'PLAYER_WANTED',
                status: 'OPEN',
            },
        });

        if (openRequests.length === 0) {
            return res.status(404).json({ message: 'No open football player-wanted posts found.' });
        }

        const hashedPassword = await bcrypt.hash('Demo1234!', 10);
        let sentCount = 0;

        for (const demo of DEMO_FOOTBALL_PLAYERS) {
            let user = await prisma.user.findUnique({ where: { username: demo.username } });
            if (!user) {
                user = await prisma.user.create({
                    data: {
                        username: demo.username,
                        email: `${demo.username}@demo.activity`,
                        password: hashedPassword,
                        fullName: demo.fullName,
                    },
                });
            }

            await prisma.userInterest.upsert({
                where: { userId_category_subCategory: { userId: user.id, category: 'SPORTS', subCategory: 'football' } },
                update: { skillRating: demo.skillRating, level: demo.level, totalPoints: demo.totalPoints, wins: demo.wins, losses: demo.losses },
                create: {
                    userId: user.id,
                    category: 'SPORTS',
                    subCategory: 'football',
                    skillRating: demo.skillRating,
                    level: demo.level,
                    totalPoints: demo.totalPoints,
                    wins: demo.wins,
                    losses: demo.losses,
                },
            });

            for (const rival of openRequests) {
                const existing = await prisma.rivalJoinRequest.findUnique({
                    where: { rivalId_userId: { rivalId: rival.id, userId: user.id } },
                });
                if (!existing) {
                    await prisma.rivalJoinRequest.create({ data: { rivalId: rival.id, userId: user.id } });
                    sentCount++;
                }
            }
        }

        // Return updated posts so frontend can refresh
        const updatedRequests = await prisma.activityRequest.findMany({
            where: { id: { in: openRequests.map(r => r.id) } },
            include: {
                sender: { select: { id: true, username: true, fullName: true, avatar: true } },
                joinRequests: {
                    where: { status: 'PENDING' },
                    include: {
                        user: {
                            select: {
                                id: true, username: true, fullName: true, avatar: true,
                                interests: {
                                    where: { category: 'SPORTS', subCategory: 'football' },
                                    select: { level: true, skillRating: true, totalPoints: true, wins: true, losses: true },
                                },
                            },
                        },
                    },
                },
            },
        });

        res.json({ message: `${sentCount} demo join request(s) sent.`, posts: updatedRequests });
    } catch (error) {
        next(error);
    }
};

// Send ONE demo tennis join request by playerIndex (0-39)
export const seedOneTournamentJoin = async (req, res, next) => {
    try {
        const { tournamentId, playerIndex } = req.body;
        const idx = parseInt(playerIndex, 10);

        if (isNaN(idx) || idx < 0 || idx >= DEMO_TENNIS_PLAYERS.length) {
            return res.status(400).json({ message: 'Invalid playerIndex' });
        }

        const tournament = await prisma.tournament.findUnique({ where: { id: tournamentId } });
        if (!tournament) return res.status(404).json({ message: 'Tournament not found' });

        const demo = DEMO_TENNIS_PLAYERS[idx];
        const hashedPassword = await bcrypt.hash('Demo1234!', 10);

        let user = await prisma.user.findUnique({ where: { username: demo.username } });
        if (!user) {
            user = await prisma.user.create({
                data: {
                    username: demo.username,
                    email: `${demo.username}@demo.activity`,
                    password: hashedPassword,
                    fullName: demo.fullName,
                    gender: demo.gender,
                },
            });
        } else if (user.gender !== demo.gender) {
            user = await prisma.user.update({ where: { id: user.id }, data: { gender: demo.gender } });
        }

        await prisma.userInterest.upsert({
            where: { userId_category_subCategory: { userId: user.id, category: 'SPORTS', subCategory: 'tennis' } },
            update: { skillRating: demo.skillRating, level: demo.level, wins: demo.wins, losses: demo.losses, assessmentCompleted: true },
            create: {
                userId: user.id, category: 'SPORTS', subCategory: 'tennis',
                skillRating: demo.skillRating, level: demo.level, wins: demo.wins, losses: demo.losses, assessmentCompleted: true,
            },
        });

        const existing = await prisma.tournamentParticipant.findUnique({
            where: { tournamentId_userId: { tournamentId, userId: user.id } },
        });
        if (existing) return res.status(409).json({ message: 'Already joined', participant: existing });

        const participant = await prisma.tournamentParticipant.create({
            data: { tournamentId, userId: user.id, status: 'PENDING' },
            include: {
                user: {
                    select: {
                        id: true, username: true, fullName: true, avatar: true,
                        interests: {
                            where: { category: tournament.category, subCategory: tournament.subCategory },
                            select: { skillRating: true, level: true },
                        },
                    },
                },
            },
        });

        // No notification/push here on purpose — this fires once per demo player (up to 40x
        // in a row) when seeding test participants, which would otherwise flood the creator
        // with real push notifications for fake joins.

        res.status(201).json({ participant, remaining: DEMO_TENNIS_PLAYERS.length - idx - 1 });
    } catch (error) {
        next(error);
    }
};

// Rakip Bul (rival) çiftler testi için 10 demo oyuncu — 5 kadın / 5 erkek, 0-5 puan
// aralığında dağıtılmış (3 kişi 0-1, 3 kişi 1-2, 2 kişi 2-3, 1 kişi 3-4, 1 kişi 4-5).
// Hem tenis hem padel için aynı 10 kimlik kullanılır (her ikisinde de UserInterest açılır).
const DEMO_RIVAL_PLAYERS = [
    { username: 'demo_r_ada',   fullName: 'Ada Yılmaz',     gender: 'FEMALE', skillRating: 0.42 },
    { username: 'demo_r_kerem', fullName: 'Kerem Aydın',    gender: 'MALE',   skillRating: 0.78 },
    { username: 'demo_r_mira',  fullName: 'Mira Demir',     gender: 'FEMALE', skillRating: 0.15 },
    { username: 'demo_r_tolga', fullName: 'Tolga Şahin',    gender: 'MALE',   skillRating: 1.55 },
    { username: 'demo_r_defne', fullName: 'Defne Kaya',     gender: 'FEMALE', skillRating: 1.20 },
    { username: 'demo_r_mete',  fullName: 'Mete Öztürk',    gender: 'MALE',   skillRating: 1.85 },
    { username: 'demo_r_elif',  fullName: 'Elif Çelik',     gender: 'FEMALE', skillRating: 2.60 },
    { username: 'demo_r_bora',  fullName: 'Bora Arslan',    gender: 'MALE',   skillRating: 2.95 },
    { username: 'demo_r_sude',  fullName: 'Sude Koç',       gender: 'FEMALE', skillRating: 3.40 },
    { username: 'demo_r_yusuf', fullName: 'Yusuf Polat',    gender: 'MALE',   skillRating: 4.65 },
];

function levelForRating(r) {
    if (r < 2.50) return 'BEGINNER';
    if (r < 3.20) return 'INTERMEDIATE';
    if (r < 4.10) return 'ADVANCED';
    return 'PRO';
}

async function ensureDemoRivalPlayer(demo, subCategory) {
    const hashedPassword = await bcrypt.hash('Demo1234!', 10);
    let user = await prisma.user.findUnique({ where: { username: demo.username } });
    if (!user) {
        user = await prisma.user.create({
            data: {
                username: demo.username,
                email: `${demo.username}@demo.activity`,
                password: hashedPassword,
                fullName: demo.fullName,
                gender: demo.gender,
            },
        });
    } else if (user.gender !== demo.gender) {
        user = await prisma.user.update({ where: { id: user.id }, data: { gender: demo.gender } });
    }
    await prisma.userInterest.upsert({
        where: { userId_category_subCategory: { userId: user.id, category: 'SPORTS', subCategory } },
        update: { skillRating: demo.skillRating, level: levelForRating(demo.skillRating), assessmentCompleted: true },
        create: {
            userId: user.id, category: 'SPORTS', subCategory,
            skillRating: demo.skillRating, level: levelForRating(demo.skillRating), assessmentCompleted: true,
        },
    });
    return user;
}

// Bir Rakip Bul (rival) ilanına demo oyuncu(lar) ile başvuru gönderir — SINGLE için 1,
// DOUBLE için henüz bu ilana başvurmamış 2 demo oyuncuyu takım olarak gönderir.
export const seedRivalDemoJoin = async (req, res, next) => {
    try {
        const { rivalId } = req.body;
        const rival = await prisma.activityRequest.findUnique({ where: { id: rivalId } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi demo başvuru gönderebilir' });
        if (rival.status !== 'OPEN') return res.status(400).json({ message: 'Bu ilan artık açık değil' });

        const existingReqs = await prisma.rivalJoinRequest.findMany({
            where: { rivalId, status: { in: ['PENDING', 'ACCEPTED'] } },
            select: { userId: true },
        });
        const usedUsernames = new Set();
        for (const r of existingReqs) {
            const u = await prisma.user.findUnique({ where: { id: r.userId }, select: { username: true } });
            if (u) usedUsernames.add(u.username);
        }
        const pool = DEMO_RIVAL_PLAYERS.filter(d => !usedUsernames.has(d.username));
        const needed = rival.matchType === 'DOUBLE' ? 2 : 1;
        if (pool.length < needed) {
            return res.status(400).json({ message: 'Kullanılabilecek demo oyuncu kalmadı (hepsi bu ilana başvurmuş)' });
        }

        const picked = pool.slice(0, needed);
        const users = await Promise.all(picked.map(d => ensureDemoRivalPlayer(d, rival.subCategory)));

        if (rival.matchType === 'DOUBLE') {
            const [d1, d2] = picked;
            const [u1, u2] = users;
            await prisma.rivalJoinRequest.create({
                data: {
                    rivalId,
                    userId: u1.id,
                    joiningTeam: [
                        { id: u1.id, username: u1.username, fullName: u1.fullName, skillRating: d1.skillRating },
                        { id: u2.id, username: u2.username, fullName: u2.fullName, skillRating: d2.skillRating },
                    ],
                },
            });
        } else {
            await prisma.rivalJoinRequest.create({ data: { rivalId, userId: users[0].id } });
        }

        const updatedRival = await prisma.activityRequest.findUnique({
            where: { id: rivalId },
            include: {
                sender: { select: { id: true, username: true, fullName: true, avatar: true, city: true } },
                joinRequests: { where: { status: 'PENDING' }, include: { user: { select: { id: true, username: true, fullName: true, avatar: true, city: true, interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true } } } } } },
            },
        });
        emitToUser(req.userId, 'rivalUpdate', updatedRival);

        res.status(201).json({ joined: picked.map(d => d.fullName), remaining: pool.length - needed });
    } catch (error) {
        next(error);
    }
};
