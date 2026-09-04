import prisma from '../config/prisma.js';
import bcrypt from 'bcryptjs';
import { emitToUser } from '../config/socket.js';
import { sendJoinRequest } from './rival.controller.js';
import { invokeControllerAs } from '../utils/internalInvoke.js';

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
                    where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } },
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

        // UTR-esinli tenis sistemi (bkz. utrRating.js) tekli/çiftler puanını singlesRating/
        // doublesRating'ten (seed'e düşerek) okuyor — demo botlar için de seed alanları
        // dolmazsa gerçek eşleşme/derece kontrollerinde (getDisplayRating) 0 puanlı görünürlerdi.
        // doublesAssessmentCompleted da true olmalı — tenis çiftlerde artık AYRI bir anket
        // gerekiyor (bkz. requireActiveInterest), yoksa demo botlar çiftler test ilanlarına
        // hiç katılamazdı.
        await prisma.userInterest.upsert({
            where: { userId_category_subCategory: { userId: user.id, category: 'SPORTS', subCategory: 'tennis' } },
            update: { skillRating: demo.skillRating, level: demo.level, wins: demo.wins, losses: demo.losses, assessmentCompleted: true, singlesSeedRating: demo.skillRating, doublesSeedRating: demo.skillRating, assessmentCompletedAt: new Date(), doublesAssessmentCompleted: true, doublesAssessmentCompletedAt: new Date() },
            create: {
                userId: user.id, category: 'SPORTS', subCategory: 'tennis',
                skillRating: demo.skillRating, level: demo.level, wins: demo.wins, losses: demo.losses, assessmentCompleted: true,
                singlesSeedRating: demo.skillRating, doublesSeedRating: demo.skillRating, assessmentCompletedAt: new Date(),
                doublesAssessmentCompleted: true, doublesAssessmentCompletedAt: new Date(),
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
// Yüksek dereceli havuz — kullanıcı isteği: tenis gibi dallarda derece filtresi 4 üstü
// olunca (10 kişilik orijinal havuzda tek yüksek dereceli demo_r_yusuf hızla tükeniyordu)
// "uygun demo oyuncu bulunamadı" hatası alınıyordu. 20 kadın + 20 erkek, 4.00-4.99 arası
// dağıtılmış derece — isimler deterministik üretiliyor ki tekrar çağrılınca aynı 40
// kullanıcı tekrar kullanılsın (bkz. ensureDemoRivalPlayer'daki upsert).
const HI_FEMALE_FIRST_NAMES = ['Ayşe','Elif','Zeynep','Fatma','Emine','Meryem','Büşra','Esra','Merve','Selin','Aslı','Ceren','Deniz','Ece','Gizem','Hande','İrem','Kübra','Nazlı','Öykü'];
const HI_MALE_FIRST_NAMES   = ['Mehmet','Ahmet','Mustafa','Ali','Hüseyin','Hasan','İbrahim','Emre','Burak','Cem','Doruk','Eren','Furkan','Gökhan','Halil','İlker','Kaan','Levent','Murat','Onur'];
const HI_LAST_NAMES = ['Yılmaz','Kaya','Demir','Şahin','Çelik','Yıldız','Yıldırım','Öztürk','Aydın','Özdemir','Arslan','Doğan','Kılıç','Aslan','Çetin','Kara','Koç','Kurt','Özkan','Şimşek'];

function buildHighRatedDemoPool() {
    const pool = [];
    const buildGender = (firstNames, genderCode, genderLabel) => {
        for (let i = 0; i < 20; i++) {
            const first = firstNames[i];
            const last = HI_LAST_NAMES[(i * 7 + 3) % HI_LAST_NAMES.length];
            pool.push({
                username: `demo_r_hi_${genderCode}${String(i + 1).padStart(2, '0')}`,
                fullName: `${first} ${last}`,
                gender: genderLabel,
                skillRating: Math.round((4.00 + i * (0.99 / 19)) * 100) / 100, // 4.00 → 4.99, eşit dağıtılmış
            });
        }
    };
    buildGender(HI_FEMALE_FIRST_NAMES, 'k', 'FEMALE');
    buildGender(HI_MALE_FIRST_NAMES, 'e', 'MALE');
    return pool;
}

// Orta dereceli havuz — kullanıcı isteği: tenis demo havuzunun neredeyse tamamı 4 üstüydü
// (yukarıdaki HI havuz), 1-3 aralığında oyuncu yok denecek kadar azdı. 15 kadın + 15 erkek,
// tekli VE çiftler puanı BİRBİRİNDEN BAĞIMSIZ rastgele üretiliyor (bkz.
// backend/scripts/seedDemoUtrRatings.js'teki "ikisi hep aynıymış gibi görünmesin" notu —
// aynı mantık burada da geçerli, ikisi aynı sayı OLABİLİR ama zorunlu değil). Değerler
// index-bazlı deterministik bir sözde-rastgele fonksiyonla üretiliyor (gerçek Math.random()
// DEĞİL) ki her sunucu yeniden başlatmasında AYNI 30 kullanıcı aynı puanla tekrar kullanılsın
// — bkz. HI havuzundaki aynı gerekçe (ensureDemoRivalPlayer upsert'i).
const MID_FEMALE_FIRST_NAMES = ['Aylin','Beren','Ceyda','Damla','Ebru','Filiz','Gonca','Hilal','Ilgın','Jale','Kader','Lale','Melis','Nihan','Özge'];
const MID_MALE_FIRST_NAMES   = ['Arda','Barış','Cengiz','Deniz','Egemen','Fatih','Görkem','Hakan','İsmail','Kaya','Metin','Nurettin','Orhan','Polat','Serkan'];
const MID_LAST_NAMES = ['Aksoy','Bulut','Coşkun','Duman','Erdem','Fırat','Güneş','Işık','Karaca','Nalçacı'];

function pseudoRandom01(seed) {
    const x = Math.sin(seed * 12.9898 + 78.233) * 43758.5453;
    return x - Math.floor(x);
}

function buildMidRatedDemoPool() {
    const pool = [];
    const buildGender = (firstNames, genderCode, genderLabel, seedOffset) => {
        for (let i = 0; i < 15; i++) {
            const first = firstNames[i];
            const last = MID_LAST_NAMES[(i * 3 + 1) % MID_LAST_NAMES.length];
            const singles = Math.round((1.00 + pseudoRandom01(seedOffset + i * 2) * 2) * 100) / 100;
            const doubles = Math.round((1.00 + pseudoRandom01(seedOffset + i * 2 + 1) * 2) * 100) / 100;
            pool.push({
                username: `demo_r_mid_${genderCode}${String(i + 1).padStart(2, '0')}`,
                fullName: `${first} ${last}`,
                gender: genderLabel,
                singlesRating: singles,
                doublesRating: doubles,
                // Genel (UTR-dışı dallar ve derece-filtresi) alanları için tekli değer mirror'lanır.
                skillRating: singles,
            });
        }
    };
    buildGender(MID_FEMALE_FIRST_NAMES, 'k', 'FEMALE', 100);
    buildGender(MID_MALE_FIRST_NAMES, 'e', 'MALE', 200);
    return pool;
}

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
    ...buildHighRatedDemoPool(),
    ...buildMidRatedDemoPool(),
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
    // bkz. seedOneTournamentJoin'deki aynı not — UTR dallarında (tennis/padel) gerçek
    // eşleşme/derece kontrolleri singlesRating/doublesRating'ten (seed'e düşerek) okunuyor.
    // Tenis'te ayrıca doublesAssessmentCompleted true olmalı — yoksa demo botlar artık ayrı
    // olan çiftler anketini tamamlamamış sayılıp çiftler test ilanlarına katılamazdı.
    const isUtrSubCategory = subCategory === 'tennis' || subCategory === 'padel';
    const isTennis = subCategory === 'tennis';
    // MID havuzu tekli/çiftler için AYRI değer taşıyor (bkz. demo.singlesRating/doublesRating) —
    // diğer havuzlar (ADA/HI vb.) bu alanları hiç taşımıyor, o zaman düz skillRating ikisine de
    // mirror'lanır (eski davranış, geriye dönük uyumlu).
    const singlesVal = demo.singlesRating ?? demo.skillRating;
    const doublesVal = demo.doublesRating ?? demo.skillRating;
    await prisma.userInterest.upsert({
        where: { userId_category_subCategory: { userId: user.id, category: 'SPORTS', subCategory } },
        update: {
            skillRating: demo.skillRating, level: levelForRating(demo.skillRating), assessmentCompleted: true,
            ...(isUtrSubCategory && { singlesSeedRating: singlesVal, doublesSeedRating: doublesVal, assessmentCompletedAt: new Date() }),
            ...(isTennis && { doublesAssessmentCompleted: true, doublesAssessmentCompletedAt: new Date() }),
        },
        create: {
            userId: user.id, category: 'SPORTS', subCategory,
            skillRating: demo.skillRating, level: levelForRating(demo.skillRating), assessmentCompleted: true,
            ...(isUtrSubCategory && { singlesSeedRating: singlesVal, doublesSeedRating: doublesVal, assessmentCompletedAt: new Date() }),
            ...(isTennis && { doublesAssessmentCompleted: true, doublesAssessmentCompletedAt: new Date() }),
        },
    });
    return user;
}

// Her basışta TEK bir demo oyuncu gönderir — DOUBLE'da eskiden aynı anda opp1+opp2 slotuna
// birer tane (ikisini BİRDEN, sahibinin ayrı ayrı onaylama şansı olmadan) gönderiyordu; bu
// hem gerçek bir oyuncunun başvuru akışına hiç benzemiyordu hem de opp2'nin cinsiyet
// kısıtlaması "MIX" (serbest) olduğunda oraya HER cinsiyetten biri (dolayısıyla ilan sahibinin
// beklemediği bir oyuncu) sessizce girebiliyordu. Artık gerçek sendJoinRequest'i demo kullanıcı
// adına çağırıyoruz (bkz. invokeControllerAs) — cinsiyet/derece/slot doğrulamasının TAMAMI
// gerçek bir oyuncu başvurusuyla birebir aynı; demo oyuncu hangi takımda oynayacağını kendi
// seçmiyor, ilan sahibi normal "İstekler" akışından kabul ettikçe (voleybol/team sporlarda
// olduğu gibi) kendi aralarında yerleşiyor.
// Cinsiyete göre efektif derece aralığı — sendJoinRequest'teki (rival.controller.js ~3028-3034)
// ratingGenderSplit mantığının birebir aynısı. Ön filtre bunu hesaba katmazsa (eskiden
// katmıyordu) gender-split'li ilanlarda TÜM havuz "uygun" sanılıp rastgele sıraya sokuluyor,
// gerçek kontrolde çoğu reddediliyordu.
function effRatingRangeForGender(rival, gender) {
    if (rival.ratingGenderSplit) {
        if (gender === 'MALE') return [rival.minRatingMale, rival.maxRatingMale];
        if (gender === 'FEMALE') return [rival.minRatingFemale, rival.maxRatingFemale];
        return [null, null];
    }
    return [rival.minRating, rival.maxRating];
}

// Kullanıcı raporu: STRICT (takas kapalı) çiftler ilanlarında demo başvuru HER ZAMAN "uygun
// demo oyuncu kalmadı" hatası veriyordu — sebebi burada değil sendJoinRequest'teydi: STRICT
// DOUBLE'da requestedSlot (partner/opp1/opp2) ZORUNLU ama bu fonksiyon her zaman boş body ({})
// gönderiyordu, yani gerçekte uygun bir demo oyuncu olsa bile başvuru "hangi slota katılmak
// istediğinizi seçin" hatasıyla deterministik olarak reddediliyordu (bkz. rival.controller.js
// sendJoinRequest ~3094-3125). Aşağıdaki iki yardımcı, aynı slot/cinsiyet mantığını burada
// tekrarlayıp demo oyuncu için uygun bir boş slot seçiyor.
function isDoubleSlotOpen(rival, slot) {
    const senderTeamArr = Array.isArray(rival.senderTeam) ? rival.senderTeam : [];
    const parts = Array.isArray(rival.participants) ? rival.participants : [];
    if (slot === 'partner') return !(senderTeamArr.length > 0 && senderTeamArr[0]?.id);
    if (slot === 'opp1') return !(parts[0] && parts[0].id);
    if (slot === 'opp2') return !(parts[1] && parts[1].id);
    return false;
}
function genderFitsSlot(gender, genderReq) {
    return !gender || gender === 'OTHER' || !genderReq || genderReq === 'MIX' || gender === genderReq;
}
function pickStrictDoubleSlot(rival, gender) {
    const slots = [['partner', rival.partnerGenderReq], ['opp1', rival.opp1GenderReq], ['opp2', rival.opp2GenderReq]];
    for (const [slot, gReq] of slots) {
        if (isDoubleSlotOpen(rival, slot) && genderFitsSlot(gender, gReq)) return slot;
    }
    return null;
}

export const seedRivalDemoJoin = async (req, res, next) => {
    try {
        const { rivalId } = req.body;
        const rival = await prisma.activityRequest.findUnique({ where: { id: rivalId } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi demo başvuru gönderebilir' });
        if (rival.status !== 'OPEN') return res.status(400).json({ message: 'Bu ilan artık açık değil' });

        const existingDemoUsers = await prisma.user.findMany({
            where: { username: { in: DEMO_RIVAL_PLAYERS.map(d => d.username) } },
            select: { id: true, username: true },
        });

        // Bu ilana herhangi bir statüde başvurusu olan demo oyuncuları hariç tut (REJECTED dahil — unique constraint)
        const alreadyApplied = new Set();
        if (existingDemoUsers.length > 0) {
            const existingReqs = await prisma.rivalJoinRequest.findMany({
                where: { rivalId, userId: { in: existingDemoUsers.map(u => u.id) } },
                select: { userId: true },
            });
            for (const r of existingReqs) {
                const uname = existingDemoUsers.find(u => u.id === r.userId)?.username;
                if (uname) alreadyApplied.add(uname);
            }
        }

        const isStrictDouble = rival.matchType === 'DOUBLE' && rival.teamFlexibility === 'STRICT';

        let fullPool = DEMO_RIVAL_PLAYERS.filter(d => !alreadyApplied.has(d.username));
        fullPool = fullPool.filter(d => {
            const [effMin, effMax] = effRatingRangeForGender(rival, d.gender);
            if (effMin != null && d.skillRating < effMin) return false;
            if (effMax != null && d.skillRating > effMax) return false;
            return true;
        });
        if (isStrictDouble) fullPool = fullPool.filter(d => pickStrictDoubleSlot(rival, d.gender) != null);
        if (fullPool.length === 0) {
            return res.status(400).json({ message: 'Uygun demo oyuncu kalmadı (hepsi başvurdu ya da şartları sağlamıyor)' });
        }
        fullPool = fullPool.sort(() => Math.random() - 0.5);

        for (const demo of fullPool.slice(0, 10)) {
            // DİKKAT: usernameToId varsa bile ensureDemoRivalPlayer HER ZAMAN çağrılmalı — bu
            // havuz tenis VE padel arasında paylaşılıyor (aynı 40 kimlik), ama UserInterest
            // SADECE bu subCategory için ayrıca upsert ediliyor. Kullanıcı önceden tenis için
            // oluşturulmuşsa usernameToId dolu geliyordu ve bu satır tamamen atlanıyordu, yani
            // padel UserInterest'i hiç açılmıyordu — sendJoinRequest içindeki
            // requireActiveInterest o zaman "önce Aktivitelerim'e eklemelisin" hatası veriyordu
            // (kullanıcı raporu: bazen çalışıyor bazen "saçma" bir hata çıkıyor).
            const userId = (await ensureDemoRivalPlayer(demo, rival.subCategory)).id;
            const body = isStrictDouble ? { requestedSlot: pickStrictDoubleSlot(rival, demo.gender) } : {};
            const { status } = await invokeControllerAs(sendJoinRequest, {
                userId,
                params: { id: rivalId },
                body,
            });
            if (status < 400) {
                const updatedRival = await prisma.activityRequest.findUnique({
                    where: { id: rivalId },
                    include: {
                        sender: { select: { id: true, username: true, fullName: true, avatar: true, city: true } },
                        joinRequests: { where: { status: { in: ['PENDING', 'AWAITING_JOINER_CONFIRM'] } }, include: { user: { select: { id: true, username: true, fullName: true, avatar: true, city: true, interests: { select: { category: true, subCategory: true, level: true, skillRating: true, totalPoints: true } } } } } },
                    },
                });
                emitToUser(req.userId, 'rivalUpdate', updatedRival);
                return res.status(201).json({ joined: [demo.fullName], remaining: fullPool.length - 1 });
            }
        }
        return res.status(400).json({ message: 'Uygun demo oyuncu kalmadı (denenenlerin hiçbiri cinsiyet/slot şartını sağlamadı)' });
    } catch (error) {
        next(error);
    }
};

// Voleybol demo botları: 50 kadın + 50 erkek, derece 0.00-2.00 arası. Her cinsiyetten ilk 2
// kişi (demoAutoReject) test için "hep hayır diyen" sabit botlar — kullanıcı isimlerini
// oyunda deneyerek keşfediyor, burada sabitlenmiyor. İsimler deterministik üretiliyor ki
// script/endpoint tekrar tekrar çağrılınca aynı 100 kullanıcı tekrar kullanılsın (yeni
// kayıt açılmasın) — bkz. ensureDemoVolleyballPlayer (upsert).
const VB_FEMALE_FIRST_NAMES = ['Ayşe','Elif','Zeynep','Fatma','Emine','Meryem','Büşra','Esra','Merve','Selin','Aslı','Ceren','Deniz','Ece','Gizem','Hande','İrem','Kübra','Nazlı','Öykü','Pelin','Rana','Sena','Tuğçe','Yağmur'];
const VB_MALE_FIRST_NAMES   = ['Mehmet','Ahmet','Mustafa','Ali','Hüseyin','Hasan','İbrahim','Emre','Burak','Cem','Doruk','Eren','Furkan','Gökhan','Halil','İlker','Kaan','Levent','Murat','Onur','Ozan','Sinan','Tolga','Uğur','Yusuf'];
const VB_LAST_NAMES = ['Yılmaz','Kaya','Demir','Şahin','Çelik','Yıldız','Yıldırım','Öztürk','Aydın','Özdemir','Arslan','Doğan','Kılıç','Aslan','Çetin','Kara','Koç','Kurt','Özkan','Şimşek','Aksoy','Erdoğan','Güneş','Polat','Korkmaz','Bulut','Avcı','Türk','Tekin','Yalçın'];

function buildVolleyballDemoPool() {
    const pool = [];
    const buildGender = (firstNames, genderCode, genderLabel) => {
        for (let i = 0; i < 50; i++) {
            const first = firstNames[i % firstNames.length];
            const last = VB_LAST_NAMES[(i * 11 + 7) % VB_LAST_NAMES.length];
            pool.push({
                username: `demo_v_${genderCode}${String(i + 1).padStart(2, '0')}`,
                fullName: `${first} ${last}`,
                gender: genderLabel,
                skillRating: Math.round(((i * 0.9137) % 2) * 100) / 100, // 0.00-2.00 arası dağıtılmış
                demoAutoReject: i < 2, // her cinsiyetten ilk 2 kişi hep reddeder
            });
        }
    };
    buildGender(VB_FEMALE_FIRST_NAMES, 'k', 'FEMALE');
    buildGender(VB_MALE_FIRST_NAMES, 'e', 'MALE');
    return pool;
}
export const DEMO_VOLLEYBALL_PLAYERS = buildVolleyballDemoPool();

export async function ensureDemoVolleyballPlayer(demo) {
    let user = await prisma.user.findUnique({ where: { username: demo.username } });
    if (!user) {
        const hashedPassword = await bcrypt.hash('Demo1234!', 10);
        user = await prisma.user.create({
            data: {
                username: demo.username,
                email: `${demo.username}@demo.activity`,
                password: hashedPassword,
                fullName: demo.fullName,
                gender: demo.gender,
                isDemoUser: true,
                demoAutoReject: demo.demoAutoReject,
            },
        });
    }
    await prisma.userInterest.upsert({
        where: { userId_category_subCategory: { userId: user.id, category: 'SPORTS', subCategory: 'volleyball' } },
        update: {},
        create: {
            userId: user.id, category: 'SPORTS', subCategory: 'volleyball',
            skillRating: demo.skillRating, level: levelForRating(demo.skillRating), assessmentCompleted: true,
        },
    });
    return user;
}

// Voleybol açık ilanına TEK bir demo oyuncu başvurusu gönderir — mobil taraf bu endpoint'i
// "durdurana kadar 2 saniyede bir" çağırarak sürekli yeni başvuru akışı simüle eder. Gerçek
// sendJoinRequest'i demo kullanıcı adına çağırıyoruz (bkz. invokeControllerAs) — böylece
// derece/cinsiyet kısıtlaması, takım dolulukları vb. TÜM gerçek doğrulama mantığı aynen
// çalışıyor, burada ayrıca yeniden yazılmıyor. Uygun olmayan adaylar otomatik atlanıp
// bir sonraki rastgele aday denenir.
export const seedVolleyballDemoJoin = async (req, res, next) => {
    try {
        const { rivalId } = req.body;
        const rival = await prisma.activityRequest.findUnique({ where: { id: rivalId } });
        if (!rival) return res.status(404).json({ message: 'İlan bulunamadı' });
        if (rival.senderId !== req.userId) return res.status(403).json({ message: 'Sadece ilan sahibi demo başvuru gönderebilir' });
        if (rival.subCategory !== 'volleyball') return res.status(400).json({ message: 'Bu endpoint sadece voleybol için' });
        if (rival.status !== 'OPEN') return res.status(400).json({ message: 'Bu ilan artık açık değil' });

        const existingReqs = await prisma.rivalJoinRequest.findMany({
            where: { rivalId, user: { isDemoUser: true } },
            select: { userId: true },
        });
        const alreadyApplied = new Set(existingReqs.map(r => r.userId));
        const demoUsers = await prisma.user.findMany({
            where: { username: { in: DEMO_VOLLEYBALL_PLAYERS.map(d => d.username) } },
            select: { id: true, username: true },
        });
        const usernameToId = Object.fromEntries(demoUsers.map(u => [u.username, u.id]));
        let pool = DEMO_VOLLEYBALL_PLAYERS.filter(d => !alreadyApplied.has(usernameToId[d.username]));
        // Rastgele sırayla dene — biri kısıtlamaya (derece/cinsiyet) takılırsa diğerini dene
        pool = pool.sort(() => Math.random() - 0.5);

        for (const demo of pool.slice(0, 15)) {
            const user = await ensureDemoVolleyballPlayer(demo);
            const { status, body } = await invokeControllerAs(sendJoinRequest, {
                userId: user.id,
                params: { id: rivalId },
                body: {},
            });
            if (status < 400) {
                return res.status(201).json({ joined: demo.fullName });
            }
        }
        return res.status(400).json({ message: 'Uygun demo oyuncu kalmadı (hepsi başvurdu ya da şartları sağlamıyor)' });
    } catch (error) {
        next(error);
    }
};
