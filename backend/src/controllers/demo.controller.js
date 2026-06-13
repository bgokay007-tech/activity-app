import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import { createNotification } from './notification.controller.js';

const DEMO_TENNIS_PLAYERS = [
    { username: 'demo_t_rafael',  fullName: 'Rafael Moreno',    level: 'PRO',          skillRating: 4.90, wins: 31, losses: 2  },
    { username: 'demo_t_carlos',  fullName: 'Carlos Vega',      level: 'PRO',          skillRating: 4.75, wins: 28, losses: 4  },
    { username: 'demo_t_novak',   fullName: 'Novak Petrov',     level: 'PRO',          skillRating: 4.85, wins: 33, losses: 3  },
    { username: 'demo_t_andrey',  fullName: 'Andrey Kuznetsov', level: 'ADVANCED',     skillRating: 4.30, wins: 18, losses: 6  },
    { username: 'demo_t_daniil',  fullName: 'Daniil Frolov',    level: 'ADVANCED',     skillRating: 4.10, wins: 15, losses: 7  },
    { username: 'demo_t_stefanos',fullName: 'Stefanos Papadop', level: 'ADVANCED',     skillRating: 4.45, wins: 20, losses: 5  },
    { username: 'demo_t_taylor',  fullName: 'Taylor Fritz',     level: 'ADVANCED',     skillRating: 3.90, wins: 12, losses: 8  },
    { username: 'demo_t_jannik',  fullName: 'Jannik Rossi',     level: 'PRO',          skillRating: 4.70, wins: 26, losses: 3  },
    { username: 'demo_t_alexander',fullName:'Alexander Müller', level: 'ADVANCED',     skillRating: 4.20, wins: 17, losses: 6  },
    { username: 'demo_t_hubert',  fullName: 'Hubert Kowski',    level: 'ADVANCED',     skillRating: 3.80, wins: 11, losses: 9  },
    { username: 'demo_t_felix',   fullName: 'Felix Auger',      level: 'ADVANCED',     skillRating: 3.70, wins: 10, losses: 8  },
    { username: 'demo_t_casper',  fullName: 'Casper Ruud',      level: 'ADVANCED',     skillRating: 4.05, wins: 14, losses: 7  },
    { username: 'demo_t_ben',     fullName: 'Ben Shelton',      level: 'INTERMEDIATE', skillRating: 3.40, wins: 8,  losses: 10 },
    { username: 'demo_t_tommy',   fullName: 'Tommy Paul',       level: 'INTERMEDIATE', skillRating: 3.20, wins: 6,  losses: 9  },
    { username: 'demo_t_frances', fullName: 'Frances Tiafoe',   level: 'INTERMEDIATE', skillRating: 3.55, wins: 9,  losses: 8  },
    { username: 'demo_t_sebastian',fullName:'Sebastian Korda',  level: 'INTERMEDIATE', skillRating: 3.15, wins: 5,  losses: 10 },
    { username: 'demo_t_grigor',  fullName: 'Grigor Dimitrov',  level: 'ADVANCED',     skillRating: 3.85, wins: 13, losses: 8  },
    { username: 'demo_t_karen',   fullName: 'Karen Khachanov',  level: 'INTERMEDIATE', skillRating: 3.30, wins: 7,  losses: 11 },
    { username: 'demo_t_nicolas', fullName: 'Nicolas Jarry',    level: 'INTERMEDIATE', skillRating: 3.00, wins: 4,  losses: 9  },
    { username: 'demo_t_ugo',     fullName: 'Ugo Humbert',      level: 'INTERMEDIATE', skillRating: 3.10, wins: 5,  losses: 8  },
    { username: 'demo_t_arthur',  fullName: 'Arthur Fils',      level: 'INTERMEDIATE', skillRating: 3.25, wins: 6,  losses: 7  },
    { username: 'demo_t_gabriel', fullName: 'Gabriel Diallo',   level: 'BEGINNER',     skillRating: 2.50, wins: 2,  losses: 5  },
    { username: 'demo_t_luciano', fullName: 'Luciano Darderi',  level: 'BEGINNER',     skillRating: 2.30, wins: 1,  losses: 6  },
    { username: 'demo_t_matteo',  fullName: 'Matteo Berrettini',level: 'ADVANCED',     skillRating: 4.00, wins: 13, losses: 9  },
    { username: 'demo_t_denis',   fullName: 'Denis Shapovalov', level: 'INTERMEDIATE', skillRating: 3.60, wins: 9,  losses: 10 },
    { username: 'demo_t_richard', fullName: 'Richard Gasquet',  level: 'ADVANCED',     skillRating: 3.75, wins: 11, losses: 8  },
    { username: 'demo_t_gael',    fullName: 'Gael Monfils',     level: 'ADVANCED',     skillRating: 3.95, wins: 14, losses: 6  },
    { username: 'demo_t_diego',   fullName: 'Diego Schwartzman',level: 'INTERMEDIATE', skillRating: 3.45, wins: 8,  losses: 9  },
    { username: 'demo_t_pablo',   fullName: 'Pablo Carreno',    level: 'INTERMEDIATE', skillRating: 3.35, wins: 7,  losses: 10 },
    { username: 'demo_t_roberto', fullName: 'Roberto Bautista', level: 'ADVANCED',     skillRating: 3.90, wins: 12, losses: 7  },
    { username: 'demo_t_borna',   fullName: 'Borna Coric',      level: 'INTERMEDIATE', skillRating: 3.05, wins: 4,  losses: 11 },
    { username: 'demo_t_aslan',   fullName: 'Aslan Karatsev',   level: 'INTERMEDIATE', skillRating: 2.95, wins: 3,  losses: 8  },
    { username: 'demo_t_jiri',    fullName: 'Jiri Lehecka',     level: 'BEGINNER',     skillRating: 2.70, wins: 2,  losses: 7  },
    { username: 'demo_t_tomas',   fullName: 'Tomas Machac',     level: 'BEGINNER',     skillRating: 2.60, wins: 2,  losses: 6  },
    { username: 'demo_t_sebastian2',fullName:'Sebastian Baez',  level: 'BEGINNER',     skillRating: 2.40, wins: 1,  losses: 7  },
    { username: 'demo_t_pedro',   fullName: 'Pedro Martinez',   level: 'BEGINNER',     skillRating: 2.20, wins: 1,  losses: 5  },
    { username: 'demo_t_albert',  fullName: 'Albert Ramos',     level: 'BEGINNER',     skillRating: 2.10, wins: 0,  losses: 4  },
    { username: 'demo_t_james',   fullName: 'James Duckworth',  level: 'BEGINNER',     skillRating: 1.90, wins: 0,  losses: 6  },
    { username: 'demo_t_lloyd',   fullName: 'Lloyd Harris',     level: 'BEGINNER',     skillRating: 1.80, wins: 0,  losses: 5  },
    { username: 'demo_t_maxime',  fullName: 'Maxime Cressy',    level: 'BEGINNER',     skillRating: 2.00, wins: 1,  losses: 8  },
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
                },
            });
        }

        await prisma.userInterest.upsert({
            where: { userId_category_subCategory: { userId: user.id, category: 'SPORTS', subCategory: 'tennis' } },
            update: { skillRating: demo.skillRating, level: demo.level, wins: demo.wins, losses: demo.losses },
            create: {
                userId: user.id, category: 'SPORTS', subCategory: 'tennis',
                skillRating: demo.skillRating, level: demo.level, wins: demo.wins, losses: demo.losses,
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

        // Notify tournament creator
        await createNotification(
            tournament.creatorId,
            'TOURNAMENT_JOIN',
            '🎾 New Join Request',
            `${demo.fullName} wants to join "${tournament.name}"`,
            { tournamentId, userId: user.id, category: tournament.category.toLowerCase(), subCategory: tournament.subCategory },
        );

        res.status(201).json({ participant, remaining: DEMO_TENNIS_PLAYERS.length - idx - 1 });
    } catch (error) {
        next(error);
    }
};
