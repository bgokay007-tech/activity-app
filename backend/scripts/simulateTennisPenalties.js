// Tenis/padel ceza akışları simülasyonu — SEVİYE D.
//
// Cezalar (no-show, geç iptal) tenis/padel'de puana DOĞRUDAN dokunmaz: singlesRating/
// doublesRating'i düşürmek bir sonraki maçın recompute'u tarafından sessizce silinirdi.
// Bunun yerine singlesRatingOffset/doublesRatingOffset azaltılır ve getDisplayRating()
// okuma anında bunu puanın üzerine ekler (bkz. utrRating.js buildPenaltyUpdate).
//
// Bu tasarımın gerçekten çalıştığı elle test edilemez — cezanın bir sonraki maçtan SONRA da
// duruyor olması gerekiyor, yani araya gerçek bir maç sokmak şart. Bölümler:
//
//   D1 — No-show cezası (gerçek approveNoShow controller'ı): görünen puan düşüyor mu, ham
//        puan korunuyor mu, offset doğru mu? Tekli ve çiftler ayrı ayrı.
//   D2 — Ceza bir sonraki gerçek maçtan SONRA hâlâ duruyor mu (offset tasarımının asıl amacı).
//   D3 — Cezalı rakip, karşı tarafın puan kazancını bozuyor mu? runUtrMatch bilerek ham
//        puanı kullanıyor (cezalıya karşı kazanmak haksız yere az puan getirmesin diye).
//   D4 — Ceza eşleşme uygunluğunu etkiliyor mu? İlan derece kısıtı getDisplayRating'e baktığı
//        için cezalı oyuncu alt sınırın altına düşüp başvuramaz hale gelmeli.
//   D5 — Ceza birikimi ve geri kazanım: offset tabanı (-1.00) tutuyor mu, üst üste ceza alan
//        oyuncu sonradan maç kazanarak dipten çıkabiliyor mu?
//   D6 — Turnuva geç iptal cezası da buildPenaltyUpdate'ten geçiyor mu (eskiden doğrudan
//        skillRating'i düşürüyordu ve tenis/padel'de görünen puana hiç etki etmiyordu).
//
// GÜVENLİK: sadece localhost veritabanında çalışır.
//
// Çalıştır (backend/ içinden): node scripts/simulateTennisPenalties.js
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';
import { invokeControllerAs } from '../src/utils/internalInvoke.js';
import { approveNoShow } from '../src/controllers/noshow.controller.js';
import { cancelJoin } from '../src/controllers/tournament.controller.js';
import {
    createRivalRequest, sendJoinRequest, respondToJoin, enterScore, confirmScore,
} from '../src/controllers/rival.controller.js';
import { getDisplayRating, PENALTY_OFFSET_FLOOR } from '../src/utils/utrRating.js';
import { r4, writeCsv, pickSub } from './lib/utrSimModel.js';
import { acquireSimLock } from './lib/simLock.js';

const CATEGORY = 'SPORTS';
const SUB = pickSub((process.argv.find(a => a.startsWith('--sub=')) || '--sub=tennis').split('=')[1]);
const OUT_DIR = path.join(import.meta.dirname, 'out', SUB); // tenis ve padel sonuçları ayrı klasörde
const PREFIX = 'sim_pen_';
const NO_SHOW_PENALTY = 0.40; // noshow.controller.js DEFAULT_NO_SHOW_PENALTY

const NOISE = /^\[(tournament|rival|cityAlert|push|demoBot|activityAlert|socket|notification|interest|achievement|noshow)\b/;
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

let passwordHash = null;
async function makePlayer(key, { gender = 'MALE', seed = 3.0, isAdmin = false } = {}) {
    passwordHash = passwordHash || await bcrypt.hash('Sim1234!', 10);
    const username = `${PREFIX}${key}`;
    const user = await prisma.user.upsert({
        where: { username },
        update: { gender, isAdmin, lateCancelCount: 0 },
        create: { username, email: `${username}@sim.local`, password: passwordHash, fullName: `SimPen ${key}`, gender, city: 'İstanbul', isAdmin },
    });
    const assessedAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000);
    await prisma.userInterest.upsert({
        where: { userId_category_subCategory: { userId: user.id, category: CATEGORY, subCategory: SUB } },
        update: {
            singlesSeedRating: seed, doublesSeedRating: seed,
            singlesRating: null, doublesRating: null, skillRating: seed,
            singlesRatingOffset: 0, doublesRatingOffset: 0,
            singlesMatchCount: 0, doublesMatchCount: 0,
            singlesLastMatchAt: null, doublesLastMatchAt: null,
            assessmentCompleted: true, doublesAssessmentCompleted: true,
            assessmentCompletedAt: assessedAt, wins: 0, losses: 0, totalPoints: 60, lateCancelCount: 0,
        },
        create: {
            userId: user.id, category: CATEGORY, subCategory: SUB,
            singlesSeedRating: seed, doublesSeedRating: seed, skillRating: seed,
            assessmentCompleted: true, doublesAssessmentCompleted: true,
            assessmentCompletedAt: assessedAt, totalPoints: 60,
        },
    });
    await seedGraceRecords(user.id, assessedAt);
    return { id: user.id, username };
}

async function seedGraceRecords(userId, assessedAt) {
    const old = new Date(assessedAt.getTime() + 24 * 60 * 60 * 1000);
    for (const matchType of ['SINGLE', 'DOUBLE']) {
        const have = await prisma.ratingMatchRecord.count({ where: { userId, subCategory: SUB, matchType } });
        for (let i = have; i < 3; i++) {
            await prisma.ratingMatchRecord.create({
                data: {
                    userId, subCategory: SUB, matchType, sourceType: 'RIVAL', sourceId: `simpen-grace-${i}`,
                    matchDate: old, didWin: true, performanceScore: 0.5,
                    opponentRatingSnapshot: 0, opponentReliabilitySnapshot: 0.25,
                    formatWeight: 0.75, ratingBefore: 0, ratingAfter: 0,
                },
            });
        }
    }
}

const getInterest = (userId) => prisma.userInterest.findFirst({ where: { userId, category: CATEGORY, subCategory: SUB } });

// Bir oyuncunun tüm ilgili puan alanları — ham, offset ve GÖRÜNEN (uygulamanın her yerde
// kullandığı) değer bir arada.
async function snapshot(userId, isDoubles) {
    const i = await getInterest(userId);
    return {
        ham: isDoubles ? i.doublesRating : i.singlesRating,
        seed: isDoubles ? i.doublesSeedRating : i.singlesSeedRating,
        offset: isDoubles ? i.doublesRatingOffset : i.singlesRatingOffset,
        gorunen: r4(getDisplayRating(i, SUB, isDoubles)),
        skillRating: i.skillRating,
        lateCancelCount: i.lateCancelCount,
    };
}

let dayCursor = 0;
const nextSlot = () => {
    dayCursor += 1;
    return { matchDate: new Date(Date.now() + (dayCursor + 3) * 86400000).toISOString(), matchTime: '10:00' };
};

// Gerçek no-show cezası: rapor oluşturulur, sonra admin onaylar (approveNoShow).
async function applyNoShowPenalty(adminId, reporterId, absentId, matchType) {
    const slot = nextSlot();
    const rival = await prisma.activityRequest.create({
        data: {
            senderId: reporterId, category: CATEGORY, subCategory: SUB,
            matchType, matchMode: 'COMPETITIVE', status: 'MATCHED',
            location: 'İstanbul', matchDate: new Date(slot.matchDate), matchTime: slot.matchTime,
            participants: [{ id: absentId }],
        },
    });
    const report = await prisma.noShowReport.create({
        data: { rivalId: rival.id, reporterId, absentUserIds: [absentId], subCategory: SUB, category: CATEGORY },
    });
    const res = await call(approveNoShow, { userId: adminId, params: { id: report.id }, body: {} });
    await prisma.noShowReport.delete({ where: { id: report.id } }).catch(() => {});
    await prisma.activityRequest.delete({ where: { id: rival.id } }).catch(() => {});
    return res;
}

// Tam gerçek tekli maç: ilan → başvuru → kabul → skor → onay. winnerSide kazananı belirler.
async function playRealMatch(creator, joiner, winnerSide) {
    const slot = nextSlot();
    const created = await call(createRivalRequest, {
        userId: creator.id,
        body: {
            category: CATEGORY, subCategory: SUB, matchType: 'SINGLE', matchMode: 'COMPETITIVE',
            location: 'İstanbul', message: 'sim D', ...slot,
        },
    });
    if (created.status >= 400) return { error: `ilan: ${created.body?.message}` };
    const rivalId = created.body.id;
    const joined = await call(sendJoinRequest, { userId: joiner.id, params: { id: rivalId }, body: {} });
    if (joined.status >= 400) return { error: `basvuru: ${joined.body?.message}` };
    const jr = await prisma.rivalJoinRequest.findFirst({ where: { rivalId, userId: joiner.id } });
    const acc = await call(respondToJoin, { userId: creator.id, params: { requestId: jr.id }, body: { action: 'accept' } });
    if (acc.status >= 400) return { error: `kabul: ${acc.body?.message}` };
    const base = [{ sender: 6, opponent: 2 }, { sender: 6, opponent: 3 }];
    const sets = winnerSide === 'sender' ? base : base.map(s => ({ sender: s.opponent, opponent: s.sender }));
    const ent = await call(enterScore, { userId: creator.id, params: { id: rivalId }, body: { sets, winner: winnerSide } });
    if (ent.status >= 400) return { error: `skor: ${ent.body?.message}` };
    const con = await call(confirmScore, { userId: joiner.id, params: { id: rivalId }, body: {} });
    if (con.status >= 400) return { error: `onay: ${con.body?.message}` };
    return { rivalId };
}

// ─── D1 + D2: no-show cezası ve maç sonrası kalıcılığı ────────────────────────

async function runD1D2(admin) {
    const rows = [];
    for (const [label, matchType] of [['TEKLI', 'SINGLE'], ['CIFTLER', 'DOUBLE']]) {
        const isDoubles = matchType === 'DOUBLE';
        const absent = await makePlayer(`d1_gelmeyen_${label}`, { seed: 3.0 });
        const reporter = await makePlayer(`d1_bildiren_${label}`, { seed: 3.0 });

        const before = await snapshot(absent.id, isDoubles);
        const res = await applyNoShowPenalty(admin.id, reporter.id, absent.id, matchType);
        const after = await snapshot(absent.id, isDoubles);

        rows.push({
            asama: 'D1 ceza uygulandi', format: label,
            hata: res.status >= 400 ? (res.body?.message || '') : '',
            gorunen_once: before.gorunen, gorunen_sonra: after.gorunen,
            gorunen_dustu_mu: after.gorunen < before.gorunen ? 'EVET' : 'HAYIR',
            beklenen_gorunen: r4(before.gorunen - NO_SHOW_PENALTY),
            offset: after.offset,
            ham_puan_korundu_mu: String(before.ham) === String(after.ham) ? 'EVET' : 'HAYIR',
            sonuc: (after.offset === -NO_SHOW_PENALTY && Math.abs(after.gorunen - (before.gorunen - NO_SHOW_PENALTY)) < 0.0001) ? 'PASS' : 'FAIL',
        });

        // D2: araya GERÇEK bir maç sok — offset recompute tarafından silinmemeli.
        // Tekli maç akışı kullanıldığı için çiftler offset'i de bu maçtan etkilenmemeli.
        const opp = await makePlayer(`d2_rakip_${label}`, { seed: 3.0 });
        const played = await playRealMatch(absent, opp, 'sender'); // cezalı oyuncu kazanıyor
        const afterMatch = await snapshot(absent.id, isDoubles);
        rows.push({
            asama: 'D2 mac sonrasi', format: label,
            hata: played.error || '',
            gorunen_once: after.gorunen, gorunen_sonra: afterMatch.gorunen,
            gorunen_dustu_mu: '-',
            beklenen_gorunen: '-',
            offset: afterMatch.offset,
            ham_puan_korundu_mu: '-',
            // Kritik: ceza (offset) maçtan sonra da duruyor olmalı.
            sonuc: afterMatch.offset === -NO_SHOW_PENALTY ? 'PASS' : 'FAIL',
        });
    }
    return rows;
}

// ─── D3: cezalı rakip, karşı tarafın kazancını bozuyor mu ─────────────────────

async function runD3(admin) {
    const rows = [];
    // İki senaryo aynı: rakip seed 3.0. Birinde rakip CEZALI (offset -0.40), diğerinde temiz.
    // Kazanan tarafın puan kazancı İKİ senaryoda da AYNI olmalı — runUtrMatch ham puanı
    // kullanıyor, çünkü cezalı bir rakibe karşı kazanmak haksız yere az puan getirmemeli.
    const sonuclar = {};
    for (const cezali of [false, true]) {
        const winner = await makePlayer(`d3_kazanan_${cezali}`, { seed: 2.0 });
        const loser = await makePlayer(`d3_kaybeden_${cezali}`, { seed: 3.0 });
        if (cezali) {
            const rep = await makePlayer(`d3_bildiren_${cezali}`, { seed: 3.0 });
            await applyNoShowPenalty(admin.id, rep.id, loser.id, 'SINGLE');
        }
        const before = await snapshot(winner.id, false);
        const played = await playRealMatch(winner, loser, 'sender');
        const after = await snapshot(winner.id, false);
        sonuclar[cezali ? 'cezali' : 'temiz'] = {
            hata: played.error || '',
            kazanc: r4((after.ham ?? 2.0) - 2.0),
            rakip_gorunen: (await snapshot(loser.id, false)).gorunen,
        };
    }
    const esit = Math.abs(sonuclar.temiz.kazanc - sonuclar.cezali.kazanc) < 0.0001;
    rows.push({
        asama: 'D3 cezali rakip',
        temiz_rakibe_karsi_kazanc: sonuclar.temiz.kazanc,
        cezali_rakibe_karsi_kazanc: sonuclar.cezali.kazanc,
        cezali_rakip_gorunen_puan: sonuclar.cezali.rakip_gorunen,
        hata: [sonuclar.temiz.hata, sonuclar.cezali.hata].filter(Boolean).join(' | '),
        // Kazanç aynı olmalı: ceza sadece GÖSTERİM/eşleşme içindir, puanlamaya girmez.
        sonuc: esit ? 'PASS' : 'FAIL',
        not: esit ? 'ceza puanlamaya sizmiyor' : 'DIKKAT: ceza puanlamaya siziyor',
    });
    return rows;
}

// ─── D4: ceza eşleşme uygunluğunu etkiliyor mu ────────────────────────────────

async function runD4(admin) {
    const rows = [];
    // Oyuncu seed 3.0. minRating 2.8 olan bir ilana normalde girebilir (3.0 ≥ 2.8).
    // 0.40 ceza sonrası görünen puanı 2.60'a düşer → artık girememeli.
    const player = await makePlayer('d4_oyuncu', { seed: 3.0 });
    const owner = await makePlayer('d4_ilan_sahibi', { seed: 3.0 });
    const reporter = await makePlayer('d4_bildiren', { seed: 3.0 });

    const tryJoin = async (etiket) => {
        const slot = nextSlot();
        const created = await call(createRivalRequest, {
            userId: owner.id,
            body: {
                category: CATEGORY, subCategory: SUB, matchType: 'SINGLE', matchMode: 'COMPETITIVE',
                location: 'İstanbul', message: 'sim D4', minRating: 2.8, ...slot,
            },
        });
        if (created.status >= 400) return { etiket, izin: null, mesaj: `ilan: ${created.body?.message}` };
        const joined = await call(sendJoinRequest, { userId: player.id, params: { id: created.body.id }, body: {} });
        await prisma.rivalJoinRequest.deleteMany({ where: { rivalId: created.body.id } });
        await prisma.activityRequest.delete({ where: { id: created.body.id } }).catch(() => {});
        return { etiket, izin: joined.status < 400, mesaj: joined.body?.message || '' };
    };

    const once = await tryJoin('ceza oncesi');
    await applyNoShowPenalty(admin.id, reporter.id, player.id, 'SINGLE');
    const sonra = await tryJoin('ceza sonrasi');
    const snap = await snapshot(player.id, false);

    rows.push({
        asama: 'D4 esleşme uygunlugu',
        ilan_min_puan: 2.8,
        oyuncu_ham_puan: 3.0,
        oyuncu_gorunen_puan_ceza_sonrasi: snap.gorunen,
        ceza_oncesi_basvurabildi: once.izin === null ? 'HATA' : (once.izin ? 'EVET' : 'HAYIR'),
        ceza_sonrasi_basvurabildi: sonra.izin === null ? 'HATA' : (sonra.izin ? 'EVET' : 'HAYIR'),
        red_mesaji: sonra.izin === false ? sonra.mesaj : '',
        // Beklenen: önce EVET, ceza sonrası HAYIR.
        sonuc: (once.izin === true && sonra.izin === false) ? 'PASS' : 'FAIL',
    });
    return rows;
}

// ─── D5: ceza birikimi ve geri kazanım ────────────────────────────────────────

async function runD5(admin) {
    const rows = [];
    const player = await makePlayer('d5_oyuncu', { seed: 3.0 });
    const reporter = await makePlayer('d5_bildiren', { seed: 3.0 });

    // Üst üste 10 ceza. Taban olmasa offset -4.00'e inip oyuncuyu görünen puanda kalıcı
    // olarak 0'a çivilerdi; PENALTY_OFFSET_FLOOR bunu -1.00'de durdurmalı.
    for (let n = 1; n <= 10; n++) {
        await applyNoShowPenalty(admin.id, reporter.id, player.id, 'SINGLE');
        const s = await snapshot(player.id, false);
        if ([1, 5, 8, 10].includes(n)) {
            rows.push({
                asama: `D5 ${n}. ceza`, offset: s.offset, gorunen: s.gorunen, ham: s.ham ?? s.seed, not: '',
                sonuc: s.offset >= PENALTY_OFFSET_FLOOR - 1e-9 ? 'PASS' : 'FAIL',
            });
        }
    }
    const dip = await snapshot(player.id, false);

    // Şimdi gerçek maçlar kazanarak geri çıkmaya çalış. Ceza erimiyor, ama taban -1.00 olduğu
    // için ham puandaki her artış görünen puana birebir yansımalı — oyuncu oynayarak kurtulabilmeli.
    const opp = await makePlayer('d5_rakip', { seed: 5.0 });
    let son = dip;
    for (let m = 1; m <= 6; m++) {
        const played = await playRealMatch(player, opp, 'sender');
        if (played.error) { rows.push({ asama: `D5 geri kazanim mac ${m}`, offset: '', gorunen: '', ham: '', not: played.error, sonuc: 'FAIL' }); break; }
        son = await snapshot(player.id, false);
        rows.push({ asama: `D5 geri kazanim mac ${m}`, offset: son.offset, gorunen: son.gorunen, ham: r4(son.ham ?? son.seed), not: '' });
    }
    // Asıl kontrol: 6 galibiyet sonrası oyuncu dipten anlamlı şekilde çıkmış olmalı.
    rows.push({
        asama: 'D5 geri kazanim sonucu', offset: son.offset, gorunen: son.gorunen, ham: r4(son.ham ?? son.seed),
        not: `dipten toplam artis: ${r4(son.gorunen - dip.gorunen)}`,
        sonuc: son.gorunen - dip.gorunen > 0.5 ? 'PASS' : 'FAIL',
    });
    return rows;
}

// ─── D6: turnuva geç iptal cezası ─────────────────────────────────────────────

async function runD6() {
    const rows = [];
    const player = await makePlayer('d6_oyuncu', { seed: 3.0 });
    const creator = await makePlayer('d6_kurucu', { seed: 3.0 });

    // Ceza 4. geç iptalde devreye giriyor — sayacı 3'e çekip 4.'yü tetikliyoruz.
    await prisma.user.update({ where: { id: player.id }, data: { lateCancelCount: 3 } });
    const tournament = await prisma.tournament.create({
        data: {
            name: 'Sim Ceza Turnuva', type: '1', category: CATEGORY, subCategory: SUB,
            status: 'OPEN', creatorId: creator.id, city: 'İstanbul', location: 'İstanbul',
            // 12 saat sonrası = 24 saatlik geç iptal penceresi içinde
            eventDate: new Date(Date.now() + 12 * 3600000), eventTime: '10:00',
        },
    });
    await prisma.tournamentParticipant.create({
        data: { tournamentId: tournament.id, userId: player.id, status: 'ACCEPTED', acceptedAt: new Date() },
    });

    const before = await snapshot(player.id, false);
    const res = await call(cancelJoin, { userId: player.id, params: { id: tournament.id }, body: { reason: 'sim' } });
    const after = await snapshot(player.id, false);

    rows.push({
        asama: 'D6 turnuva gec iptal',
        hata: res.status >= 400 ? (res.body?.message || '') : '',
        ceza_uygulandi_mi_api: String(res.body?.penaltyApplied ?? ''),
        gorunen_once: before.gorunen, gorunen_sonra: after.gorunen,
        gorunen_degisti_mi: after.gorunen !== before.gorunen ? 'EVET' : 'HAYIR',
        offset: after.offset,
        skillRating_once: before.skillRating, skillRating_sonra: after.skillRating,
        // API "ceza uygulandı" diyorsa GÖRÜNEN puan da düşmeli. Düşmüyorsa ceza etkisiz.
        sonuc: (res.body?.penaltyApplied && after.gorunen === before.gorunen) ? 'FAIL' : 'PASS',
        not: (res.body?.penaltyApplied && after.gorunen === before.gorunen)
            ? 'API ceza uygulandi diyor ama gorunen puan degismedi (skillRating dusuruluyor, tenis/padel onu okumuyor)'
            : '',
    });

    await prisma.tournament.delete({ where: { id: tournament.id } }).catch(() => {});
    return rows;
}

// ─── Temizlik ─────────────────────────────────────────────────────────────────

async function cleanup() {
    const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    const ids = users.map(u => u.id);
    if (ids.length === 0) return 0;
    await prisma.noShowReport.deleteMany({ where: { reporterId: { in: ids } } });
    await prisma.tournamentParticipant.deleteMany({ where: { userId: { in: ids } } });
    await prisma.tournament.deleteMany({ where: { creatorId: { in: ids } } });
    await prisma.rivalJoinRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.activityRequest.deleteMany({ where: { senderId: { in: ids } } });
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
    console.log(`=== ${SUB} Ceza Akışları Simülasyonu — Seviye D ===\n`);
    await cleanup();
    const admin = await makePlayer('admin', { seed: 3.0, isAdmin: true });
    quiet();

    const d1d2 = await runD1D2(admin);
    const d3 = await runD3(admin);
    const d4 = await runD4(admin);
    const d5 = await runD5(admin);
    const d6 = await runD6();
    loud();

    const files = [
        writeCsv(OUT_DIR, 'D1_noshow_ve_kalicilik.csv', d1d2, fs, path),
        writeCsv(OUT_DIR, 'D3_cezali_rakip.csv', d3, fs, path),
        writeCsv(OUT_DIR, 'D4_esleşme_uygunlugu.csv', d4, fs, path),
        writeCsv(OUT_DIR, 'D5_ceza_birikimi.csv', d5, fs, path),
        writeCsv(OUT_DIR, 'D6_turnuva_gec_iptal.csv', d6, fs, path),
    ].filter(Boolean);

    console.log('--- D1/D2: no-show cezası ve bir sonraki maçtan sonra kalıcılığı ---');
    console.table(d1d2.map(r => ({
        asama: r.asama, format: r.format, gorunen_once: r.gorunen_once, gorunen_sonra: r.gorunen_sonra,
        offset: r.offset, sonuc: r.sonuc, hata: r.hata,
    })));

    console.log('\n--- D3: cezalı rakip puanlamaya sızıyor mu ---');
    console.table(d3);

    console.log('\n--- D4: ceza eşleşme uygunluğunu etkiliyor mu ---');
    console.table(d4);

    console.log(`\n--- D5: ceza birikimi (taban ${PENALTY_OFFSET_FLOOR}) ve geri kazanım ---`);
    console.table(d5);

    console.log('\n--- D6: turnuva geç iptal cezası ---');
    console.table(d6.map(r => ({
        gorunen_once: r.gorunen_once, gorunen_sonra: r.gorunen_sonra, offset: r.offset,
        api_ceza: r.ceza_uygulandi_mi_api, skill_once: r.skillRating_once, skill_sonra: r.skillRating_sonra,
        sonuc: r.sonuc,
    })));
    if (d6[0]?.not) console.log('   ' + d6[0].not);

    const all = [...d1d2, ...d3, ...d4, ...d5.filter(r => r.sonuc), ...d6];
    const fail = all.filter(r => r.sonuc === 'FAIL');
    console.log(`\nTOPLAM: ${all.filter(r => r.sonuc).length} kontrol | PASS ${all.filter(r => r.sonuc === 'PASS').length} | FAIL ${fail.length}`);

    console.log('\nCSV dosyaları:');
    for (const f of files) console.log('  ' + f);
    const removed = await cleanup();
    console.log(`\nTemizlik: ${removed} simülasyon kullanıcısı silindi.`);
    console.log(`Süre: ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
    await prisma.$disconnect();
}

main().catch(async (e) => { loud(); console.error(e); await prisma.$disconnect(); process.exit(1); });
