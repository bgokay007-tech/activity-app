/**
 * Demo tennis player seed — 50 players, skillRating 1.0–5.0
 * Run: node scripts/seed-demo-tennis.mjs
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

// ── Name pool ──────────────────────────────────────────────────────────────────
const MALE_NAMES = [
    ['Ahmet','Yılmaz'],['Mehmet','Kaya'],['Emre','Çelik'],['Can','Arslan'],
    ['Burak','Şahin'],['Mert','Doğan'],['Arda','Kurt'],['Berk','Aydın'],
    ['Kerem','Öztürk'],['Sercan','Güneş'],['Ozan','Yıldız'],['Alp','Demir'],
    ['Doruk','Koç'],['Kaan','Polat'],['Ege','Erdoğan'],['Tuna','Aktaş'],
    ['Barış','Çakır'],['Cenk','Demirtaş'],['Görkem','Acar'],['Tolga','Bulut'],
    ['Uğur','Kılıç'],['Sinan','Tekin'],['Onur','Yücel'],['Batuhan','Güler'],
    ['Furkan','Özer'],
];
const FEMALE_NAMES = [
    ['Zeynep','Kaya'],['Elif','Demir'],['Ayşe','Çelik'],['Büşra','Yılmaz'],
    ['Selin','Arslan'],['İrem','Kurt'],['Ceren','Şahin'],['Melis','Aydın'],
    ['Naz','Öztürk'],['Hande','Güneş'],['Pınar','Yıldız'],['Dilara','Koç'],
    ['Simge','Polat'],['Defne','Erdoğan'],['Lara','Aktaş'],['Ece','Çakır'],
    ['Yağmur','Demirtaş'],['Gizem','Acar'],['Tuğçe','Bulut'],['Esra','Kılıç'],
    ['Miray','Tekin'],['Cansu','Yücel'],['Ezgi','Güler'],['Kübra','Özer'],
    ['Leyla','Demir'],
];

const CITIES = [
    'İstanbul','Ankara','İzmir','Bursa','Antalya',
    'Adana','Konya','Gaziantep','Mersin','Kocaeli',
];

// ── Tier definitions ───────────────────────────────────────────────────────────
// 5 tiers × 10 players = 50
const TIERS = [
    { level: 'BEGINNER',     ratingMin: 1.00, ratingMax: 1.79, winsBase: 2,  lossesBase: 10, pointsBase: 50  },
    { level: 'BEGINNER',     ratingMin: 1.80, ratingMax: 2.49, winsBase: 5,  lossesBase: 8,  pointsBase: 120 },
    { level: 'INTERMEDIATE', ratingMin: 2.50, ratingMax: 3.19, winsBase: 10, lossesBase: 7,  pointsBase: 280 },
    { level: 'ADVANCED',     ratingMin: 3.20, ratingMax: 4.09, winsBase: 20, lossesBase: 8,  pointsBase: 550 },
    { level: 'PRO',          ratingMin: 4.10, ratingMax: 5.00, winsBase: 35, lossesBase: 6,  pointsBase: 900 },
];

function rnd(min, max) {
    return Math.random() * (max - min) + min;
}
function rndInt(min, max) {
    return Math.floor(rnd(min, max + 1));
}
function round2(n) {
    return Math.round(n * 100) / 100;
}

async function main() {
    const hashedPw = await bcrypt.hash('Demo1234!', 10);

    let maleIdx = 0;
    let femaleIdx = 0;
    let playerNum = 1;

    for (const tier of TIERS) {
        for (let i = 0; i < 10; i++) {
            const isFemale = (playerNum % 2 === 0);
            const [firstName, lastName] = isFemale
                ? FEMALE_NAMES[femaleIdx++ % FEMALE_NAMES.length]
                : MALE_NAMES[maleIdx++ % MALE_NAMES.length];

            const username  = `demo_tenis_${playerNum}`;
            const email     = `demo.tenis.${playerNum}@demo.test`;
            const fullName  = `${firstName} ${lastName}`;
            const city      = CITIES[playerNum % CITIES.length];
            const skillRating = round2(rnd(tier.ratingMin, tier.ratingMax));
            const wins      = rndInt(tier.winsBase, tier.winsBase + 12);
            const losses    = rndInt(Math.max(1, tier.lossesBase - 3), tier.lossesBase + 5);
            const totalPoints = tier.pointsBase + rndInt(-30, 80) + wins * 10 - losses * 5;

            try {
                const user = await prisma.user.upsert({
                    where: { username },
                    update: {},
                    create: {
                        username,
                        email,
                        password: hashedPw,
                        fullName,
                        city,
                        gender: isFemale ? 'FEMALE' : 'MALE',
                        isPublic: true,
                        country: 'Turkey',
                    },
                });

                await prisma.userInterest.upsert({
                    where: { userId_category_subCategory: { userId: user.id, category: 'SPORTS', subCategory: 'tennis' } },
                    update: { skillRating, totalPoints, wins, losses, level: tier.level },
                    create: {
                        userId:      user.id,
                        category:    'SPORTS',
                        subCategory: 'tennis',
                        level:       tier.level,
                        skillRating,
                        totalPoints: Math.max(0, totalPoints),
                        wins,
                        losses,
                    },
                });

                console.log(`✅ #${playerNum} ${fullName} (@${username}) — ${tier.level} ${skillRating}⭐ ${wins}W/${losses}L`);
            } catch (e) {
                console.error(`❌ #${playerNum} ${username}:`, e.message);
            }

            playerNum++;
        }
    }

    console.log('\n🎾 50 demo tennis player created. Password for all: Demo1234!');
}

main()
    .catch(e => { console.error(e); process.exit(1); })
    .finally(() => prisma.$disconnect());
