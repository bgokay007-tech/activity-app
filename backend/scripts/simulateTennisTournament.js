// Tenis turnuva puanlama simülasyonu — SEVİYE C (gerçek turnuva controller'ı üzerinden).
//
// Turnuva maçları rival maçlarından AYRI bir yoldan geçiyor:
//   enterTournamentMatchScore → applyUtrRatingForTournamentMatch → runUtrMatch
// Skor şekli de farklı ({p1,p2}, rival'da {sender,opponent}) ve tekli/çiftler ayrımı
// matchType değil turnuva motor TÜRÜnden geliyor ('1'=tekli, '2'=çiftler rekabetçi).
//
// Üç bölüm:
//   C1 — Tekli turnuva (tür '1'): puan ızgarası × skor tipi, ELO uygulandı mı, Seviye A
//        modeliyle uyuşuyor mu, "kazanan puan kaybetti" anomalisi var mı.
//   C2 — SKOR DÜZELTME (en kritik): turnuva skoru sonradan düzeltilebiliyor. Kod eski
//        RatingMatchRecord'ları silip yeniden hesaplıyor ve wins/losses/matchCount
//        sayaçlarını ELLE geri alıyor. Bu bölüm "yanlış skor gir, sonra düzelt" sonucunu,
//        "baştan doğru skoru gir" kontrol grubuyla karşılaştırır — puanlar VE sayaçlar
//        birebir aynı olmalı, aksi halde düzeltme kalıntı bırakıyor.
//   C3 — Çiftler turnuva (tür '2', TournamentTeam üzerinden): 4 oyuncu, takım bazlı.
//
// GÜVENLİK: sadece localhost veritabanında çalışır.
//
// Çalıştır (backend/ içinden):
//   node scripts/simulateTennisTournament.js
//   node scripts/simulateTennisTournament.js --step=0.5 --only=c2
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';
import { invokeControllerAs } from '../src/utils/internalInvoke.js';
import { enterTournamentMatchScore } from '../src/controllers/tournament.controller.js';
import { predictSingleMatch, range, r4, writeCsv, pickSub } from './lib/utrSimModel.js';
import { acquireSimLock } from './lib/simLock.js';

const CATEGORY = 'SPORTS';
const PREFIX = 'sim_tr_'; // 'demo_' DEĞİL — demo öneki turnuvada da skoru otomatik onaylatıyor
const MODEL_TOLERANCE = 0.005;

const arg = (name, def) => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=')[1] : def;
};
const SUB = pickSub(arg('sub', 'tennis'));
const OUT_DIR = path.join(import.meta.dirname, 'out', SUB); // tenis ve padel sonuçları ayrı klasörde
const STEP = parseFloat(arg('step', '0.5'));
const ONLY = arg('only', null);

// Turnuva skoru {p1,p2} şeklinde — p1 kazanacak şekilde kurulu.
const SCORES = {
    ezici:     { label: '6-0 6-1 (ezici)',     sets: [{ p1: 6, p2: 0 }, { p1: 6, p2: 1 }] },
    rekabetci: { label: '6-4 7-5 (rekabetçi)', sets: [{ p1: 6, p2: 4 }, { p1: 7, p2: 5 }] },
};
// Seviye A modeli rival skor şeklini ({sender,opponent}) bekliyor — aynı maçın çevirisi.
const asRivalScore = (score) => ({ sets: score.sets.map(s => ({ sender: s.p1, opponent: s.p2 })) });
const flipSets = (sets) => sets.map(s => ({ p1: s.p2, p2: s.p1 }));

const NOISE = /^\[(tournament|rival|cityAlert|push|demoBot|activityAlert|socket|notification|interest|achievement)\b/;
const origLog = console.log, origErr = console.error;
const quiet = () => {
    console.log = (...a) => { if (!NOISE.test(String(a[0] ?? ''))) origLog(...a); };
    console.error = (...a) => { if (!NOISE.test(String(a[0] ?? ''))) origErr(...a); };
};
const loud = () => { console.log = origLog; console.error = origErr; };

function guardLocalDb() {
    if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || '')) {
        console.error('DURDURULDU: Bu script sadece localhost veritabanında çalışır.');
        process.exit(1);
    }
}

const call = async (fn, opts) => {
    try { return await invokeControllerAs(fn, opts); }
    catch (e) { return { status: e.status || 500, body: { message: e.message }, threw: true }; }
};

// ─── Kurulum ──────────────────────────────────────────────────────────────────

let passwordHash = null;
async function makePlayer(key, { gender = 'MALE', seed = 0 } = {}) {
    passwordHash = passwordHash || await bcrypt.hash('Sim1234!', 10);
    const username = `${PREFIX}${key}`;
    const user = await prisma.user.upsert({
        where: { username },
        update: { gender },
        create: { username, email: `${username}@sim.local`, password: passwordHash, fullName: `SimTr ${key}`, gender, city: 'İstanbul' },
    });
    const assessedAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    await prisma.userInterest.upsert({
        where: { userId_category_subCategory: { userId: user.id, category: CATEGORY, subCategory: SUB } },
        update: {
            singlesSeedRating: seed, doublesSeedRating: seed,
            singlesRating: null, doublesRating: null, skillRating: seed,
            singlesMatchCount: 0, doublesMatchCount: 0,
            singlesLastMatchAt: null, doublesLastMatchAt: null,
            assessmentCompleted: true, doublesAssessmentCompleted: true,
            assessmentCompletedAt: assessedAt, wins: 0, losses: 0, totalPoints: 0,
        },
        create: {
            userId: user.id, category: CATEGORY, subCategory: SUB,
            singlesSeedRating: seed, doublesSeedRating: seed, skillRating: seed,
            assessmentCompleted: true, doublesAssessmentCompleted: true, assessmentCompletedAt: assessedAt,
        },
    });
    await seedGraceRecords(user.id, assessedAt);
    return { id: user.id, username };
}

// Kalibrasyon korumasını (anket sonrası ilk 3 maç) kapatmak için pencere DIŞINDA 3 kayıt —
// decay=0 olduğu için recompute'a girmez, sadece sayacı doldurur.
async function seedGraceRecords(userId, assessedAt) {
    const old = new Date(assessedAt.getTime() + 24 * 60 * 60 * 1000);
    for (const matchType of ['SINGLE', 'DOUBLE']) {
        const have = await prisma.ratingMatchRecord.count({ where: { userId, subCategory: SUB, matchType } });
        for (let i = have; i < 3; i++) {
            await prisma.ratingMatchRecord.create({
                data: {
                    userId, subCategory: SUB, matchType, sourceType: 'RIVAL', sourceId: `simtr-grace-${i}`,
                    matchDate: old, didWin: true, performanceScore: 0.5,
                    opponentRatingSnapshot: 0, opponentReliabilitySnapshot: 0.25,
                    formatWeight: 0.75, ratingBefore: 0, ratingAfter: 0,
                },
            });
        }
    }
}

// Oyuncuyu "hiç maç oynamamış" başlangıç durumuna döndürür.
//
// lastMatchAt, kalan (pencere dışı) kalibrasyon kayıtlarının tarihine ayarlanır — null'a
// ÇEKİLMEZ. C2 aksi halde yanlış FAIL veriyordu: düzeltme yolu lastMatchAt'i kalan
// kayıtlardan hesaplıyor, kontrol grubu null bırakıyordu; computeReliabilityWeight bu iki
// durumda farklı ağırlık ürettiği için puanlar zorunlu olarak ayrışıyordu. Fark gerçek bir
// ürün hatası değil, test kurulumunun tutarsızlığıydı.
async function resetPlayer(player, seed) {
    await prisma.ratingMatchRecord.deleteMany({
        where: { userId: player.id, subCategory: SUB, sourceId: { not: { startsWith: 'simtr-grace-' } } },
    });
    const lastByType = {};
    for (const matchType of ['SINGLE', 'DOUBLE']) {
        const newest = await prisma.ratingMatchRecord.findFirst({
            where: { userId: player.id, subCategory: SUB, matchType },
            orderBy: { matchDate: 'desc' },
            select: { matchDate: true },
        });
        lastByType[matchType] = newest?.matchDate ?? null;
    }
    await prisma.userInterest.updateMany({
        where: { userId: player.id, category: CATEGORY, subCategory: SUB },
        data: {
            singlesSeedRating: seed, doublesSeedRating: seed,
            singlesRating: null, doublesRating: null, skillRating: seed,
            singlesMatchCount: 0, doublesMatchCount: 0,
            singlesLastMatchAt: lastByType.SINGLE, doublesLastMatchAt: lastByType.DOUBLE,
            wins: 0, losses: 0, totalPoints: 0,
        },
    });
}

// Puanın yanında wins/losses/matchCount sayaçları da okunur — C2'nin düzeltme testi
// asıl kalıntıyı bu sayaçlarda arıyor.
async function readState(userId, isDoubles) {
    const i = await prisma.userInterest.findFirst({ where: { userId, category: CATEGORY, subCategory: SUB } });
    // Satır yoksa bu neredeyse her zaman araya giren ikinci bir simülasyon koşusudur
    // (bkz. lib/simLock.js) — sessizce çökmek yerine sebebi söyle.
    if (!i) throw new Error(`Oyuncunun ${SUB} UserInterest satırı kayboldu (userId=${userId}). Araya başka bir simülasyon koşusu girmiş olabilir.`);
    return {
        rating: isDoubles ? i.doublesRating : i.singlesRating,
        wins: i.wins, losses: i.losses,
        matchCount: isDoubles ? i.doublesMatchCount : i.singlesMatchCount,
        lastMatchAt: isDoubles ? i.doublesLastMatchAt : i.singlesLastMatchAt,
    };
}

// Minimum ama gerçek bir turnuva + tek maç. Kurucu bilerek OYUNCU DEĞİL — o zaman skoru
// girince hiçbir taraf otomatik onaylanmıyor, yani C2'de skor kilitlenmeden düzeltilebiliyor
// (iki taraf da onaylarsa kod düzeltmeyi haklı olarak reddediyor).
async function makeTournamentMatch(creatorId, type, p1Id, p2Id) {
    const tournament = await prisma.tournament.create({
        data: {
            name: 'Sim Turnuva', type, category: CATEGORY, subCategory: SUB,
            status: 'IN_PROGRESS', creatorId, city: 'İstanbul', location: 'İstanbul',
        },
    });
    const match = await prisma.tournamentMatch.create({
        data: { tournamentId: tournament.id, round: 1, matchIndex: 0, p1Id, p2Id, status: 'PENDING' },
    });
    return { tournamentId: tournament.id, matchId: match.id };
}

const dropTournament = (id) => prisma.tournament.delete({ where: { id } }).catch(() => {});

// ─── C1: tekli turnuva ────────────────────────────────────────────────────────

async function runC1() {
    const values = range(0, 5, STEP);
    const rows = [];
    const creator = await makePlayer('c1_kurucu', { seed: 2.5 });
    const p1 = await makePlayer('c1_p1', { seed: 0 });
    const p2 = await makePlayer('c1_p2', { seed: 0 });

    for (const r1 of values) {
        for (const r2 of values) {
            for (const [key, score] of Object.entries(SCORES)) {
                for (const winner of ['p1', 'p2']) {
                    await resetPlayer(p1, r1);
                    await resetPlayer(p2, r2);
                    // Modelin gerçek motorla aynı ağırlığı hesaplayabilmesi için maç
                    // ÖNCESİ durum (maç sayısı / son maç tarihi) buradan okunur.
                    const before1 = await readState(p1.id, false);
                    const { tournamentId, matchId } = await makeTournamentMatch(creator.id, '1', p1.id, p2.id);
                    // winner='p2' ise setleri çevir — skor her zaman kazanan tarafı yansıtsın.
                    const sets = winner === 'p1' ? score.sets : flipSets(score.sets);
                    const res = await call(enterTournamentMatchScore, {
                        userId: creator.id, params: { id: tournamentId, matchId },
                        body: { sets, winner },
                    });
                    const s1 = await readState(p1.id, false);
                    const s2 = await readState(p2.id, false);
                    // Aynı maçın Seviye A modeli öngörüsü.
                    const p1Won = winner === 'p1';
                    const pred = predictSingleMatch(
                        [p1Won ? r1 : r2], [p1Won ? r2 : r1],
                        asRivalScore(score),
                        { matchCount: before1.matchCount, lastMatchAt: before1.lastMatchAt },
                    );
                    const predP1 = p1Won ? pred.winnerAfter[0] : pred.loserAfter[0];
                    const predP2 = p1Won ? pred.loserAfter[0] : pred.winnerAfter[0];
                    const gercekP1 = s1.rating ?? r1, gercekP2 = s2.rating ?? r2;
                    const sapma = Math.max(Math.abs(gercekP1 - predP1), Math.abs(gercekP2 - predP2));
                    rows.push({
                        p1_puan: r1, p2_puan: r2, skor: score.label, kazanan: winner,
                        hata: res.status >= 400 ? (res.body?.message || 'bilinmeyen') : '',
                        p1_sonra: r4(gercekP1), p2_sonra: r4(gercekP2),
                        p1_degisim: r4(gercekP1 - r1), p2_degisim: r4(gercekP2 - r2),
                        model_p1: r4(predP1), model_p2: r4(predP2),
                        model_sapma: r4(sapma),
                        model_uyumu: sapma <= MODEL_TOLERANCE ? 'PASS' : 'FAIL',
                    });
                    await dropTournament(tournamentId);
                }
            }
        }
    }
    return rows;
}

// ─── C2: skor düzeltme ────────────────────────────────────────────────────────
// "Yanlış skor gir → düzelt" ile "baştan doğru skor gir" aynı sonucu vermeli.

async function runC2() {
    const values = range(0, 5, 1.0);
    const rows = [];
    const creator = await makePlayer('c2_kurucu', { seed: 2.5 });
    const p1 = await makePlayer('c2_p1', { seed: 0 });
    const p2 = await makePlayer('c2_p2', { seed: 0 });

    // Düzeltme senaryoları: (ilk girilen yanlış skor) → (düzeltilmiş doğru skor)
    const corrections = [
        { key: 'kazanan_degisti',  first: { sets: SCORES.ezici.sets, winner: 'p1' },     final: { sets: flipSets(SCORES.ezici.sets), winner: 'p2' } },
        { key: 'skor_tipi_degisti', first: { sets: SCORES.ezici.sets, winner: 'p1' },    final: { sets: SCORES.rekabetci.sets, winner: 'p1' } },
        { key: 'ayni_skor_tekrar',  first: { sets: SCORES.rekabetci.sets, winner: 'p1' }, final: { sets: SCORES.rekabetci.sets, winner: 'p1' } },
    ];

    for (const r1 of values) {
        for (const r2 of values) {
            for (const c of corrections) {
                // (a) Kontrol grubu: sadece DOĞRU skoru gir.
                await resetPlayer(p1, r1); await resetPlayer(p2, r2);
                const ctrl = await makeTournamentMatch(creator.id, '1', p1.id, p2.id);
                const ctrlRes = await call(enterTournamentMatchScore, {
                    userId: creator.id, params: { id: ctrl.tournamentId, matchId: ctrl.matchId }, body: c.final,
                });
                const ctrl1 = await readState(p1.id, false);
                const ctrl2 = await readState(p2.id, false);
                await dropTournament(ctrl.tournamentId);

                // (b) Düzeltme grubu: yanlış skoru gir, sonra düzelt.
                await resetPlayer(p1, r1); await resetPlayer(p2, r2);
                const fix = await makeTournamentMatch(creator.id, '1', p1.id, p2.id);
                const firstRes = await call(enterTournamentMatchScore, {
                    userId: creator.id, params: { id: fix.tournamentId, matchId: fix.matchId }, body: c.first,
                });
                const fixRes = await call(enterTournamentMatchScore, {
                    userId: creator.id, params: { id: fix.tournamentId, matchId: fix.matchId }, body: c.final,
                });
                const fix1 = await readState(p1.id, false);
                const fix2 = await readState(p2.id, false);
                await dropTournament(fix.tournamentId);

                const cmp = (a, b) => ({
                    puan: Math.abs((a.rating ?? 0) - (b.rating ?? 0)) <= 0.0001,
                    wins: a.wins === b.wins,
                    losses: a.losses === b.losses,
                    matchCount: a.matchCount === b.matchCount,
                });
                const c1 = cmp(ctrl1, fix1), c2 = cmp(ctrl2, fix2);
                const allOk = Object.values(c1).every(Boolean) && Object.values(c2).every(Boolean);
                const bozuk = [];
                for (const [k, v] of Object.entries(c1)) if (!v) bozuk.push(`p1.${k}`);
                for (const [k, v] of Object.entries(c2)) if (!v) bozuk.push(`p2.${k}`);

                rows.push({
                    senaryo: c.key, p1_puan: r1, p2_puan: r2,
                    hata: [ctrlRes, firstRes, fixRes].filter(r => r.status >= 400).map(r => r.body?.message).join(' | '),
                    kontrol_p1_puan: r4(ctrl1.rating ?? r1), duzeltme_p1_puan: r4(fix1.rating ?? r1),
                    kontrol_p2_puan: r4(ctrl2.rating ?? r2), duzeltme_p2_puan: r4(fix2.rating ?? r2),
                    kontrol_p1_wl: `${ctrl1.wins}/${ctrl1.losses}/${ctrl1.matchCount}`,
                    duzeltme_p1_wl: `${fix1.wins}/${fix1.losses}/${fix1.matchCount}`,
                    kontrol_p2_wl: `${ctrl2.wins}/${ctrl2.losses}/${ctrl2.matchCount}`,
                    duzeltme_p2_wl: `${fix2.wins}/${fix2.losses}/${fix2.matchCount}`,
                    sonuc: allOk ? 'PASS' : 'FAIL',
                    bozuk_alanlar: bozuk.join(','),
                });
            }
        }
    }
    return rows;
}

// ─── C3: çiftler turnuva ──────────────────────────────────────────────────────

async function runC3() {
    const values = range(0, 5, 1.0);
    const rows = [];
    const creator = await makePlayer('c3_kurucu', { seed: 2.5 });
    const pl = {
        a1: await makePlayer('c3_a1', { seed: 0 }), a2: await makePlayer('c3_a2', { gender: 'FEMALE', seed: 0 }),
        b1: await makePlayer('c3_b1', { seed: 0 }), b2: await makePlayer('c3_b2', { gender: 'FEMALE', seed: 0 }),
    };

    for (const a1r of values) {
        for (const a2r of values) {
            for (const b1r of values) {
                for (const b2r of values) {
                    const seeds = { a1: a1r, a2: a2r, b1: b1r, b2: b2r };
                    for (const k of Object.keys(pl)) await resetPlayer(pl[k], seeds[k]);

                    const tournament = await prisma.tournament.create({
                        data: {
                            name: 'Sim Çiftler', type: '2', category: CATEGORY, subCategory: SUB,
                            status: 'IN_PROGRESS', creatorId: creator.id, city: 'İstanbul', location: 'İstanbul',
                        },
                    });
                    // Tür '2' takım tabanlı: maçın p1Id/p2Id'si TournamentTeam id'si.
                    const teamA = await prisma.tournamentTeam.create({
                        data: { tournamentId: tournament.id, player1Id: pl.a1.id, player1Name: pl.a1.username, player2Id: pl.a2.id, player2Name: pl.a2.username, avgRating: (a1r + a2r) / 2 },
                    });
                    const teamB = await prisma.tournamentTeam.create({
                        data: { tournamentId: tournament.id, player1Id: pl.b1.id, player1Name: pl.b1.username, player2Id: pl.b2.id, player2Name: pl.b2.username, avgRating: (b1r + b2r) / 2 },
                    });
                    const match = await prisma.tournamentMatch.create({
                        data: { tournamentId: tournament.id, round: 1, matchIndex: 0, p1Id: teamA.id, p2Id: teamB.id, status: 'PENDING' },
                    });
                    const res = await call(enterTournamentMatchScore, {
                        userId: creator.id, params: { id: tournament.id, matchId: match.id },
                        body: { sets: SCORES.ezici.sets, winner: 'p1' },
                    });
                    const st = {};
                    for (const k of Object.keys(pl)) st[k] = await readState(pl[k].id, true);
                    rows.push({
                        kazanan_takim: `${a1r}+${a2r}`, kaybeden_takim: `${b1r}+${b2r}`,
                        kazanan_ort: r4((a1r + a2r) / 2), kaybeden_ort: r4((b1r + b2r) / 2),
                        hata: res.status >= 400 ? (res.body?.message || 'bilinmeyen') : '',
                        a1_degisim: r4((st.a1.rating ?? a1r) - a1r), a2_degisim: r4((st.a2.rating ?? a2r) - a2r),
                        b1_degisim: r4((st.b1.rating ?? b1r) - b1r), b2_degisim: r4((st.b2.rating ?? b2r) - b2r),
                        elo_uygulandi: st.a1.rating != null ? 'EVET' : 'HAYIR',
                    });
                    await dropTournament(tournament.id);
                }
            }
        }
    }
    return rows;
}

// ─── Temizlik ─────────────────────────────────────────────────────────────────

async function cleanup() {
    const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    const ids = users.map(u => u.id);
    if (ids.length === 0) return 0;
    await prisma.tournament.deleteMany({ where: { creatorId: { in: ids } } }); // cascade: match/team
    await prisma.ratingMatchRecord.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userInterest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
}

async function main() {
    guardLocalDb();
    await acquireSimLock(prisma);
    const t0 = Date.now();
    console.log(`=== ${SUB} Turnuva Puanlama Simülasyonu — Seviye C ===\n`);
    await cleanup();
    quiet();
    const want = (k) => !ONLY || ONLY === k;

    let c1 = [], c2 = [], c3 = [];
    if (want('c1')) {
        loud(); console.log(`C1 — Tekli turnuva (adım ${STEP}) çalışıyor...`); quiet();
        c1 = await runC1();
        loud();
        console.log(`   ${c1.length} maç | hatalı ${c1.filter(r => r.hata).length} | model uyumu: ${c1.filter(r => r.model_uyumu === 'PASS').length} PASS / ${c1.filter(r => r.model_uyumu === 'FAIL').length} FAIL`);
        quiet();
    }
    if (want('c2')) {
        loud(); console.log('C2 — Skor düzeltme (yanlış gir → düzelt, kontrol grubuyla karşılaştır) çalışıyor...'); quiet();
        c2 = await runC2();
        loud();
        console.log(`   ${c2.length} senaryo | PASS ${c2.filter(r => r.sonuc === 'PASS').length} | FAIL ${c2.filter(r => r.sonuc === 'FAIL').length}`);
        quiet();
    }
    if (want('c3')) {
        loud(); console.log('C3 — Çiftler turnuva çalışıyor...'); quiet();
        c3 = await runC3();
        loud();
        console.log(`   ${c3.length} maç | hatalı ${c3.filter(r => r.hata).length}`);
        quiet();
    }

    loud();
    const files = [
        writeCsv(OUT_DIR, 'C1_tekli_turnuva.csv', c1, fs, path),
        writeCsv(OUT_DIR, 'C2_skor_duzeltme.csv', c2, fs, path),
        writeCsv(OUT_DIR, 'C3_ciftler_turnuva.csv', c3, fs, path),
    ].filter(Boolean);

    const c1Anom = c1.filter(r => !r.hata && (
        (r.kazanan === 'p1' && (r.p1_degisim < 0 || r.p2_degisim > 0)) ||
        (r.kazanan === 'p2' && (r.p2_degisim < 0 || r.p1_degisim > 0))
    ));
    console.log(`\n--- C1: kazandığı halde puanı düşen maç: ${c1Anom.length} / ${c1.filter(r => !r.hata).length} ---`);

    const c2Fails = c2.filter(r => r.sonuc === 'FAIL');
    if (c2Fails.length > 0) {
        console.log('\n--- C2 BAŞARISIZ: skor düzeltme kalıntı bırakıyor (ilk 12) ---');
        console.table(c2Fails.slice(0, 12).map(f => ({
            senaryo: f.senaryo, p1: f.p1_puan, p2: f.p2_puan, bozuk: f.bozuk_alanlar,
            kontrol_p1: f.kontrol_p1_wl, duzeltme_p1: f.duzeltme_p1_wl,
            kontrol_p2: f.kontrol_p2_wl, duzeltme_p2: f.duzeltme_p2_wl,
        })));
        const byField = {};
        for (const f of c2Fails) for (const b of f.bozuk_alanlar.split(',').filter(Boolean)) byField[b] = (byField[b] || 0) + 1;
        console.log('   Bozuk alan dağılımı:', byField);
    }

    const c3Anom = c3.filter(r => !r.hata && r.elo_uygulandi === 'EVET' && (r.a1_degisim < 0 || r.a2_degisim < 0 || r.b1_degisim > 0 || r.b2_degisim > 0));
    console.log(`\n--- C3: kazanan takımda puanı düşen oyuncu olan maç: ${c3Anom.length} / ${c3.filter(r => !r.hata).length} ---`);

    console.log('\nCSV dosyaları:');
    for (const f of files) console.log('  ' + f);
    const removed = await cleanup();
    console.log(`\nTemizlik: ${removed} simülasyon kullanıcısı silindi.`);
    console.log(`Süre: ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
    await prisma.$disconnect();
}

main().catch(async (e) => { loud(); console.error(e); await prisma.$disconnect(); process.exit(1); });
