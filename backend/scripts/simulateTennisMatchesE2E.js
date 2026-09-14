// Tenis puanlama simülasyonu — SEVİYE B (UÇTAN UCA, gerçek controller'lar üzerinden).
//
// Seviye A (scripts/simulateTennisElo.js) puanlama matematiğini tarar ama kısıtlamaları
// (cinsiyet / derece aralığı) hiç test etmez. Burada gerçek akış çalıştırılır:
//
//   createRivalRequest → sendJoinRequest → respondToJoin('accept') → enterScore → confirmScore
//
// invokeControllerAs (src/utils/internalInvoke.js) sayesinde HTTP'ye çıkmadan, controller'lar
// "şu kullanıcı gibi" çağrılır — yani doğrulamalar, bildirimler ve ELO uygulanması gerçek
// kullanıcı akışıyla birebir aynı kod yolundan geçer.
//
// Üç bölüm:
//   B1 — Kısıtlama matrisi: ilan cinsiyet kısıtı × başvuranın cinsiyeti × derece aralığı
//        (düz / cinsiyete göre ayrı) × başvuranın puanı (altında/içinde/üstünde).
//        Her satır için BEKLENEN sonuç bağımsız olarak hesaplanır ve gerçekleşenle
//        karşılaştırılır → PASS/FAIL. Yani bu bir test, sadece rapor değil.
//   B2 — Tekli maçlar: ilan açmaktan skor onayına kadar tam akış, sonra DB'den okunan
//        gerçek ELO değişimi Seviye A'nın öngörüsüyle karşılaştırılır (motor doğrulaması).
//   B3 — Çiftler maçları: ELO yolu gerçek (enterScore/confirmScore controller'ları), ancak
//        4 kişilik kadro çok adımlı slot/davet akışı yerine doğrudan DB'de kurulur —
//        kadro kurulumunun kendisi B1'in konusu, burada ölçülen şey puanlama.
//
// GÜVENLİK: sadece localhost veritabanında çalışır. Uzak/production DATABASE_URL ile
// çağrılırsa hiçbir şey yapmadan çıkar.
//
// Çalıştır (backend/ içinden):
//   node scripts/simulateTennisMatchesE2E.js
//   node scripts/simulateTennisMatchesE2E.js --e2e-step=0.5   (B2 grid adımı)
import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import prisma from '../src/config/prisma.js';
import { invokeControllerAs } from '../src/utils/internalInvoke.js';
import {
    createRivalRequest, sendJoinRequest, respondToJoin, enterScore, confirmScore,
} from '../src/controllers/rival.controller.js';
import { predictSingleMatch } from './lib/utrSimModel.js';
import { acquireSimLock } from './lib/simLock.js';

// Seviye A modeli ile gerçek motor arasındaki kabul edilebilir sapma. Aynı formülün aynı
// girdilerle çalışması beklendiği için eşik dar tutuldu — aşılırsa model bozulmuş demektir.
const MODEL_TOLERANCE = 0.005;

const CATEGORY = 'SPORTS';
const SUB = 'tennis';
const OUT_DIR = path.join(import.meta.dirname, 'out');
const PREFIX = 'sim_t_'; // 'demo_' DEĞİL — demo öneki skoru otomatik onaylatıyor (bkz. tryDemoAutoConfirmScore)

const arg = (name, def) => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.split('=')[1] : def;
};
const E2E_STEP = parseFloat(arg('e2e-step', '0.5'));
// Çiftlerde 4 oyuncu var — değer sayısının 4. kuvveti kadar maç oynanır, bu yüzden
// adım tekliden büyük tutulur (1.0 → 6 değer → 1.296 kadro kombinasyonu).
const B3_STEP = parseFloat(arg('b3-step', '1.0'));
const ONLY = arg('only', null); // 'b1' | 'b2' | 'b3' — tek bölüm çalıştırmak için

const SCORES = {
    ezici:       { label: '6-0 6-1 (ezici)',     sets: [{ sender: 6, opponent: 0 }, { sender: 6, opponent: 1 }] },
    rekabetci:   { label: '6-4 7-5 (rekabetçi)', sets: [{ sender: 6, opponent: 4 }, { sender: 7, opponent: 5 }] },
};

const r4 = (v) => parseFloat(Number(v).toFixed(4));
const range = (from, to, step) => {
    const out = [];
    for (let v = from; v <= to + 1e-9; v += step) out.push(parseFloat(v.toFixed(2)));
    return out;
};

// Gerçek controller'lar her ilan/bildirim için log basıyor — binlerce maçta bu raporu
// tamamen boğuyor. Simülasyon boyunca sadece bu bilinen önekler susturulur; beklenmeyen
// bir hata logu yine görünür.
const NOISE = /^\[(rival|cityAlert|push|demoBot|activityAlert|socket|notification|interest)\b/;
const origLog = console.log;
const origErr = console.error;
function quiet() {
    console.log = (...a) => { if (!NOISE.test(String(a[0] ?? ''))) origLog(...a); };
    console.error = (...a) => { if (!NOISE.test(String(a[0] ?? ''))) origErr(...a); };
}
function loud() {
    console.log = origLog;
    console.error = origErr;
}

function guardLocalDb() {
    const url = process.env.DATABASE_URL || '';
    if (!/@(localhost|127\.0\.0\.1)[:/]/.test(url)) {
        console.error('DURDURULDU: Bu script sadece localhost veritabanında çalışır.');
        console.error('Mevcut DATABASE_URL localhost değil — production/uzak DB\'ye sahte maç yazılmasın diye çıkılıyor.');
        process.exit(1);
    }
}

// ─── Kullanıcı kurulumu ───────────────────────────────────────────────────────

let passwordHash = null;
// Her simülasyon oyuncusu: tenis UserInterest'i hazır, tekli+çiftler anketi tamamlanmış
// (yoksa requireActiveInterest ilanı/başvuruyu reddeder) ve seed puanı verilmiş.
// singlesRating/doublesRating bilerek null — utrRating.ratingOf seed'e düşer, yani
// "anketini yeni doldurmuş, henüz maçı olmayan oyuncu" durumu.
async function makePlayer(key, { gender, singlesSeed = 0, doublesSeed = 0, graceOver = true }) {
    passwordHash = passwordHash || await bcrypt.hash('Sim1234!', 10);
    const username = `${PREFIX}${key}`;
    const user = await prisma.user.upsert({
        where: { username },
        update: { gender: gender ?? null },
        create: {
            username, email: `${username}@sim.local`, password: passwordHash,
            fullName: `Sim ${key}`, gender: gender ?? null, city: 'İstanbul',
        },
    });
    // graceOver: kalibrasyon koruması penceresi (anket sonrası ilk 3 maç) KAPANMIŞ sayılsın.
    // Bunun için anket tamamlanma anı geçmişe alınır ve o andan sonra 3 maç kaydı
    // olduğu varsayılır — countMatchesSinceAssessment RatingMatchRecord saydığı için
    // korumayı kapatmanın tek yolu gerçek kayıt eklemek; graceOver=false bırakılınca
    // koruma aktif kalır ve düşük puanlının galibiyeti ELO'ya sayılmaz.
    const assessedAt = new Date(Date.now() - 400 * 24 * 60 * 60 * 1000); // 400 gün önce = pencere dışı
    await prisma.userInterest.upsert({
        where: { userId_category_subCategory: { userId: user.id, category: CATEGORY, subCategory: SUB } },
        update: {
            singlesSeedRating: singlesSeed, doublesSeedRating: doublesSeed,
            singlesRating: null, doublesRating: null,
            singlesRatingOffset: 0, doublesRatingOffset: 0,
            singlesMatchCount: 0, doublesMatchCount: 0,
            singlesLastMatchAt: null, doublesLastMatchAt: null,
            assessmentCompleted: true, doublesAssessmentCompleted: true,
            assessmentCompletedAt: assessedAt, skillRating: singlesSeed,
            wins: 0, losses: 0, totalPoints: 0,
        },
        create: {
            userId: user.id, category: CATEGORY, subCategory: SUB,
            singlesSeedRating: singlesSeed, doublesSeedRating: doublesSeed,
            assessmentCompleted: true, doublesAssessmentCompleted: true,
            assessmentCompletedAt: assessedAt, skillRating: singlesSeed,
        },
    });
    if (graceOver) await seedGraceRecords(user.id, assessedAt);
    return { id: user.id, username, gender: gender ?? null, singlesSeed, doublesSeed };
}

// Kalibrasyon koruması sayacını doldurmak için 3 adet ESKİ (pencere dışı, 400+ gün önce)
// kayıt ekler. Pencere dışı olduğu için recompute'a hiç girmez (decay=0), sadece
// countMatchesSinceAssessment'ı 3'e çıkarır — yani "bu oyuncunun anket sonrası ilk 3 maçı
// çoktan geçti" durumu, puanına dokunmadan.
async function seedGraceRecords(userId, assessedAt) {
    const old = new Date(assessedAt.getTime() + 24 * 60 * 60 * 1000);
    for (const matchType of ['SINGLE', 'DOUBLE']) {
        const have = await prisma.ratingMatchRecord.count({ where: { userId, subCategory: SUB, matchType } });
        for (let i = have; i < 3; i++) {
            await prisma.ratingMatchRecord.create({
                data: {
                    userId, subCategory: SUB, matchType, sourceType: 'RIVAL', sourceId: `sim-grace-${i}`,
                    matchDate: old, didWin: true, performanceScore: 0.5,
                    opponentRatingSnapshot: 0, opponentReliabilitySnapshot: 0.25,
                    formatWeight: 0.75, ratingBefore: 0, ratingAfter: 0,
                },
            });
        }
    }
}

async function resetPlayerRatings(player, { singlesSeed, doublesSeed }) {
    await prisma.ratingMatchRecord.deleteMany({
        where: { userId: player.id, subCategory: SUB, sourceId: { not: { startsWith: 'sim-grace-' } } },
    });
    await prisma.userInterest.updateMany({
        where: { userId: player.id, category: CATEGORY, subCategory: SUB },
        data: {
            singlesSeedRating: singlesSeed, doublesSeedRating: doublesSeed,
            singlesRating: null, doublesRating: null,
            singlesMatchCount: 0, doublesMatchCount: 0,
            singlesLastMatchAt: null, doublesLastMatchAt: null,
            wins: 0, losses: 0,
        },
    });
}

const readRating = async (userId, isDoubles) => {
    const i = await prisma.userInterest.findFirst({ where: { userId, category: CATEGORY, subCategory: SUB } });
    return { rating: (isDoubles ? i.doublesRating : i.singlesRating), seed: (isDoubles ? i.doublesSeedRating : i.singlesSeedRating) };
};

// Aynı gün/saatte iki maç aynı kullanıcıyı çakıştırır (findSchedulingConflict) — her maça
// benzersiz bir tarih verilir.
let dayCursor = 0;
function nextSlot() {
    dayCursor += 1;
    const d = new Date(Date.now() + (dayCursor + 3) * 24 * 60 * 60 * 1000);
    return { matchDate: d.toISOString(), matchTime: '10:00' };
}

const call = async (fn, opts) => {
    try {
        return await invokeControllerAs(fn, opts);
    } catch (e) {
        return { status: e.status || 500, body: { message: e.message }, threw: true };
    }
};

// ─── B1: kısıtlama matrisi ────────────────────────────────────────────────────

// İlan kuralının + başvuranın özelliklerinin BEKLENEN sonucu. Kasıtlı olarak
// sendJoinRequest'ten bağımsız yazıldı (aynı kodu çağırıp kendini doğrulamasın diye);
// sıra önemli: cinsiyet kontrolü derece kontrolünden ÖNCE çalışır.
function expectedOutcome(rule, applicant) {
    if (rule.genderReq && rule.genderReq !== 'MIX' && applicant.gender !== 'OTHER') {
        if (!applicant.gender) return { allowed: false, reason: 'CINSIYET_BELIRTILMEMIS' };
        if (rule.genderReq !== applicant.gender) return { allowed: false, reason: 'CINSIYET_UYMUYOR' };
    }
    let min = rule.minRating ?? null, max = rule.maxRating ?? null;
    if (rule.ratingGenderSplit) {
        if (applicant.gender === 'MALE') { min = rule.minRatingMale ?? null; max = rule.maxRatingMale ?? null; }
        else if (applicant.gender === 'FEMALE') { min = rule.minRatingFemale ?? null; max = rule.maxRatingFemale ?? null; }
        else { min = null; max = null; } // cinsiyeti yok/OTHER → cinsiyete ayrı derece kısıtı uygulanmaz
    }
    if (min !== null && applicant.singlesSeed < min) return { allowed: false, reason: 'PUAN_COK_DUSUK' };
    if (max !== null && applicant.singlesSeed > max) return { allowed: false, reason: 'PUAN_COK_YUKSEK' };
    return { allowed: true, reason: '-' };
}

function classifyRejection(message) {
    const m = message || '';
    if (/cinsiyetini belirtmen/.test(m)) return 'CINSIYET_BELIRTILMEMIS';
    if (/yalnızca .* oyuncular için açık|Cinsiyet kısıtlamaları/.test(m)) return 'CINSIYET_UYMUYOR';
    if (/en az .*puan gerekiyor/.test(m)) return 'PUAN_COK_DUSUK';
    if (/en fazla .*puan kabul/.test(m)) return 'PUAN_COK_YUKSEK';
    return 'DIGER';
}

async function runB1() {
    const rows = [];
    // Başvuranlar: cinsiyet × puan (0.5 / 2.5 / 4.5 — aralıkların altı/içi/üstü)
    const applicants = [];
    for (const [gKey, gender] of [['erkek', 'MALE'], ['kadin', 'FEMALE'], ['diger', 'OTHER'], ['bos', null]]) {
        for (const rating of [0.5, 2.5, 4.5]) {
            applicants.push(await makePlayer(`b1_${gKey}_${String(rating).replace('.', '')}`, {
                gender, singlesSeed: rating, doublesSeed: rating,
            }));
        }
    }
    // İlan kuralları. Kurucu kendi kısıtlamasının DIŞINDA kalamaz (createRivalRequest
    // kontrolü) — bu yüzden her kural için kurucu puanı aralığın içinde seçilir.
    const rules = [
        { key: 'kisit_yok',            genderReq: 'MIX',                                                                creatorRating: 2.5, creatorGender: 'MALE' },
        { key: 'sadece_erkek',         genderReq: 'MALE',                                                               creatorRating: 2.5, creatorGender: 'MALE' },
        { key: 'sadece_kadin',         genderReq: 'FEMALE',                                                             creatorRating: 2.5, creatorGender: 'FEMALE' },
        { key: 'puan_2_3',             genderReq: 'MIX', minRating: 2, maxRating: 3,                                    creatorRating: 2.5, creatorGender: 'MALE' },
        { key: 'puan_alt_sinir_4',     genderReq: 'MIX', minRating: 4, maxRating: null,                                 creatorRating: 4.5, creatorGender: 'MALE' },
        { key: 'puan_ust_sinir_1',     genderReq: 'MIX', minRating: null, maxRating: 1,                                 creatorRating: 0.5, creatorGender: 'MALE' },
        { key: 'erkek_ve_puan_2_3',    genderReq: 'MALE', minRating: 2, maxRating: 3,                                   creatorRating: 2.5, creatorGender: 'MALE' },
        { key: 'cinsiyete_ayri_puan',  genderReq: 'MIX', ratingGenderSplit: true,
          minRatingMale: 2, maxRatingMale: 3, minRatingFemale: 4, maxRatingFemale: 5,                                   creatorRating: 2.5, creatorGender: 'MALE' },
    ];

    for (const rule of rules) {
        const creator = await makePlayer(`b1_kurucu_${rule.key}`, {
            gender: rule.creatorGender, singlesSeed: rule.creatorRating, doublesSeed: rule.creatorRating,
        });
        for (const applicant of applicants) {
            if (applicant.id === creator.id) continue;
            const slot = nextSlot();
            const created = await call(createRivalRequest, {
                userId: creator.id,
                body: {
                    category: CATEGORY, subCategory: SUB, matchType: 'SINGLE', matchMode: 'COMPETITIVE',
                    location: 'İstanbul', district: 'Kadıköy', message: 'sim B1',
                    ...slot,
                    genderReq: rule.genderReq,
                    ...(rule.minRating != null && { minRating: rule.minRating }),
                    ...(rule.maxRating != null && { maxRating: rule.maxRating }),
                    ...(rule.ratingGenderSplit && {
                        ratingGenderSplit: true,
                        minRatingMale: rule.minRatingMale, maxRatingMale: rule.maxRatingMale,
                        minRatingFemale: rule.minRatingFemale, maxRatingFemale: rule.maxRatingFemale,
                    }),
                },
            });
            if (created.status >= 400) {
                rows.push({
                    ilan_kurali: rule.key, basvuran: applicant.username,
                    basvuran_cinsiyet: applicant.gender ?? 'BOS', basvuran_puan: applicant.singlesSeed,
                    beklenen: '?', gerceklesen: 'ILAN_ACILAMADI', sonuc: 'ATLANDI',
                    mesaj: created.body?.message || '',
                });
                continue;
            }
            const rivalId = created.body.id;
            const joined = await call(sendJoinRequest, { userId: applicant.id, params: { id: rivalId }, body: {} });
            const exp = expectedOutcome(rule, applicant);
            const actualAllowed = joined.status < 400;
            const actualReason = actualAllowed ? '-' : classifyRejection(joined.body?.message);
            rows.push({
                ilan_kurali: rule.key,
                basvuran: applicant.username,
                basvuran_cinsiyet: applicant.gender ?? 'BOS',
                basvuran_puan: applicant.singlesSeed,
                beklenen: exp.allowed ? 'IZIN' : exp.reason,
                gerceklesen: actualAllowed ? 'IZIN' : actualReason,
                sonuc: (exp.allowed === actualAllowed && (exp.allowed || exp.reason === actualReason)) ? 'PASS' : 'FAIL',
                mesaj: joined.body?.message || '',
            });
            await prisma.rivalJoinRequest.deleteMany({ where: { rivalId } });
            await prisma.activityRequest.delete({ where: { id: rivalId } }).catch(() => {});
        }
    }
    return rows;
}

// ─── B2: tekli, tam uçtan uca akış + ELO ──────────────────────────────────────

async function playSinglesE2E(creator, joiner, score, winnerSide) {
    const slot = nextSlot();
    const created = await call(createRivalRequest, {
        userId: creator.id,
        body: {
            category: CATEGORY, subCategory: SUB, matchType: 'SINGLE', matchMode: 'COMPETITIVE',
            location: 'İstanbul', district: 'Kadıköy', message: 'sim B2', ...slot,
        },
    });
    if (created.status >= 400) return { error: `ilan: ${created.body?.message}` };
    const rivalId = created.body.id;

    const joined = await call(sendJoinRequest, { userId: joiner.id, params: { id: rivalId }, body: {} });
    if (joined.status >= 400) return { error: `basvuru: ${joined.body?.message}` };
    const joinReq = await prisma.rivalJoinRequest.findFirst({ where: { rivalId, userId: joiner.id } });

    const accepted = await call(respondToJoin, { userId: creator.id, params: { requestId: joinReq.id }, body: { action: 'accept' } });
    if (accepted.status >= 400) return { error: `kabul: ${accepted.body?.message}` };

    // Skor kurucu perspektifinde girilir ({sender, opponent}); winnerSide kazananı belirler.
    const sets = winnerSide === 'sender'
        ? score.sets
        : score.sets.map(s => ({ sender: s.opponent, opponent: s.sender }));
    const entered = await call(enterScore, { userId: creator.id, params: { id: rivalId }, body: { sets, winner: winnerSide } });
    if (entered.status >= 400) return { error: `skor: ${entered.body?.message}` };

    const confirmed = await call(confirmScore, { userId: joiner.id, params: { id: rivalId }, body: {} });
    if (confirmed.status >= 400) return { error: `onay: ${confirmed.body?.message}` };
    return { rivalId };
}

async function runB2() {
    const values = range(0, 5, E2E_STEP);
    const rows = [];
    // İki sabit oyuncu her maçtan önce sıfırlanır — böylece her satır "geçmişi olmayan iki
    // oyuncunun tek maçı" olur ve Seviye A'nın izole moduyla doğrudan karşılaştırılabilir.
    const creator = await makePlayer('b2_kurucu', { gender: 'MALE', singlesSeed: 0, doublesSeed: 0 });
    const joiner = await makePlayer('b2_rakip', { gender: 'MALE', singlesSeed: 0, doublesSeed: 0 });

    for (const cRating of values) {
        for (const jRating of values) {
            for (const [scoreKey, score] of Object.entries(SCORES)) {
                for (const winnerSide of ['sender', 'opponent']) {
                    await resetPlayerRatings(creator, { singlesSeed: cRating, doublesSeed: cRating });
                    await resetPlayerRatings(joiner, { singlesSeed: jRating, doublesSeed: jRating });
                    const res = await playSinglesE2E(creator, joiner, score, winnerSide);
                    if (res.error) {
                        rows.push({
                            kurucu_puan: cRating, rakip_puan: jRating, skor: score.label,
                            kazanan: winnerSide === 'sender' ? 'KURUCU' : 'RAKIP',
                            hata: res.error, kurucu_sonra: '', rakip_sonra: '',
                            kurucu_degisim: '', rakip_degisim: '',
                            model_kurucu: '', model_rakip: '', model_sapma: '', model_uyumu: '',
                        });
                        continue;
                    }
                    const c = await readRating(creator.id, false);
                    const j = await readRating(joiner.id, false);
                    // Seviye A modelinin aynı maç için öngörüsü — gerçek motorla karşılaştırılır.
                    const creatorWon = winnerSide === 'sender';
                    const pred = predictSingleMatch(
                        [creatorWon ? cRating : jRating],
                        [creatorWon ? jRating : cRating],
                        score,
                    );
                    const predCreator = creatorWon ? pred.winnerAfter[0] : pred.loserAfter[0];
                    const predJoiner = creatorWon ? pred.loserAfter[0] : pred.winnerAfter[0];
                    const gercekK = c.rating != null ? r4(c.rating) : cRating;
                    const gercekR = j.rating != null ? r4(j.rating) : jRating;
                    const sapma = Math.max(Math.abs(gercekK - predCreator), Math.abs(gercekR - predJoiner));
                    rows.push({
                        kurucu_puan: cRating, rakip_puan: jRating, skor: score.label,
                        kazanan: creatorWon ? 'KURUCU' : 'RAKIP',
                        hata: '',
                        kurucu_sonra: gercekK,
                        rakip_sonra: gercekR,
                        kurucu_degisim: r4(gercekK - cRating),
                        rakip_degisim: r4(gercekR - jRating),
                        model_kurucu: r4(predCreator),
                        model_rakip: r4(predJoiner),
                        model_sapma: r4(sapma),
                        model_uyumu: sapma <= MODEL_TOLERANCE ? 'PASS' : 'FAIL',
                    });
                }
            }
        }
    }
    return rows;
}

// ─── B3: çiftler — ELO yolu gerçek, kadro DB'de kurulu ────────────────────────

async function runB3() {
    const values = range(0, 5, B3_STEP);
    const rows = [];
    const p = {
        w1: await makePlayer('b3_w1', { gender: 'MALE', singlesSeed: 0, doublesSeed: 0 }),
        w2: await makePlayer('b3_w2', { gender: 'FEMALE', singlesSeed: 0, doublesSeed: 0 }),
        l1: await makePlayer('b3_l1', { gender: 'MALE', singlesSeed: 0, doublesSeed: 0 }),
        l2: await makePlayer('b3_l2', { gender: 'FEMALE', singlesSeed: 0, doublesSeed: 0 }),
    };

    for (const w1r of values) {
        for (const w2r of values) {
            for (const l1r of values) {
                for (const l2r of values) {
                    for (const [scoreKey, score] of Object.entries(SCORES)) {
                        const seeds = { w1: w1r, w2: w2r, l1: l1r, l2: l2r };
                        for (const k of Object.keys(p)) {
                            await resetPlayerRatings(p[k], { singlesSeed: seeds[k], doublesSeed: seeds[k] });
                        }
                        const slot = nextSlot();
                        // Kurucu takımı: w1 (senderId) + w2 (senderTeam). Rakip takım:
                        // l1 + l2 (participants). Gerçek ilanda bu kadro slot/davet akışıyla
                        // dolar; burada puanlamayı ölçtüğümüz için doğrudan yazılıyor.
                        const rival = await prisma.activityRequest.create({
                            data: {
                                senderId: p.w1.id, category: CATEGORY, subCategory: SUB,
                                matchType: 'DOUBLE', matchMode: 'COMPETITIVE', status: 'MATCHED',
                                location: 'İstanbul', district: 'Kadıköy',
                                matchDate: new Date(slot.matchDate), matchTime: slot.matchTime,
                                senderTeam: [{ id: p.w2.id, username: p.w2.username }],
                                participants: [
                                    { id: p.l1.id, username: p.l1.username },
                                    { id: p.l2.id, username: p.l2.username },
                                ],
                            },
                        });
                        const entered = await call(enterScore, {
                            userId: p.w1.id, params: { id: rival.id },
                            body: { sets: score.sets, winner: 'sender' },
                        });
                        let err = entered.status >= 400 ? `skor: ${entered.body?.message}` : '';
                        if (!err) {
                            const confirmed = await call(confirmScore, { userId: p.l1.id, params: { id: rival.id }, body: {} });
                            if (confirmed.status >= 400) err = `onay: ${confirmed.body?.message}`;
                        }
                        const after = {};
                        for (const k of Object.keys(p)) after[k] = await readRating(p[k].id, true);
                        rows.push({
                            kazanan_takim: `${w1r}+${w2r}`, kaybeden_takim: `${l1r}+${l2r}`,
                            kazanan_ort: r4((w1r + w2r) / 2), kaybeden_ort: r4((l1r + l2r) / 2),
                            skor: score.label, hata: err,
                            w1_degisim: after.w1.rating != null ? r4(after.w1.rating - w1r) : 0,
                            w2_degisim: after.w2.rating != null ? r4(after.w2.rating - w2r) : 0,
                            l1_degisim: after.l1.rating != null ? r4(after.l1.rating - l1r) : 0,
                            l2_degisim: after.l2.rating != null ? r4(after.l2.rating - l2r) : 0,
                            elo_uygulandi: after.w1.rating != null ? 'EVET' : 'HAYIR',
                        });
                        await prisma.activityRequest.delete({ where: { id: rival.id } }).catch(() => {});
                    }
                }
            }
        }
    }
    return rows;
}

// ─── Temizlik + CSV ───────────────────────────────────────────────────────────

async function cleanup() {
    const users = await prisma.user.findMany({ where: { username: { startsWith: PREFIX } }, select: { id: true } });
    const ids = users.map(u => u.id);
    if (ids.length === 0) return 0;
    await prisma.rivalJoinRequest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.activityRequest.deleteMany({ where: { senderId: { in: ids } } });
    await prisma.ratingMatchRecord.deleteMany({ where: { userId: { in: ids } } });
    await prisma.notification.deleteMany({ where: { userId: { in: ids } } });
    await prisma.userInterest.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    return ids.length;
}

function writeCsv(name, rows) {
    if (rows.length === 0) return null;
    fs.mkdirSync(OUT_DIR, { recursive: true });
    const cols = Object.keys(rows[0]);
    const esc = (v) => {
        const s = String(v ?? '');
        return /[",;\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const body = ['sep=;', cols.join(';'), ...rows.map(r => cols.map(c => esc(r[c])).join(';'))].join('\n');
    const file = path.join(OUT_DIR, name);
    fs.writeFileSync(file, '\uFEFF' + body, 'utf8');
    return file;
}

async function main() {
    guardLocalDb();
    await acquireSimLock(prisma);
    const t0 = Date.now();
    console.log('=== Tenis ELO Simülasyonu — Seviye B (uçtan uca, gerçek controller\'lar) ===\n');

    await cleanup(); // önceki koşudan kalıntı varsa temizle
    quiet();

    const want = (k) => !ONLY || ONLY === k;

    let b1 = [];
    if (want('b1')) {
        console.log('B1 — Kısıtlama matrisi (cinsiyet + derece) çalışıyor...');
        b1 = await runB1();
        console.log(`   ${b1.length} senaryo | PASS ${b1.filter(r => r.sonuc === 'PASS').length} | FAIL ${b1.filter(r => r.sonuc === 'FAIL').length} | atlandı ${b1.filter(r => r.sonuc === 'ATLANDI').length}`);
    }
    const fails = b1.filter(r => r.sonuc === 'FAIL');

    let b2 = [];
    if (want('b2')) {
        console.log(`B2 — Tekli uçtan uca akış (adım ${E2E_STEP}) çalışıyor...`);
        b2 = await runB2();
        const modelFail = b2.filter(r => r.model_uyumu === 'FAIL').length;
        console.log(`   ${b2.length} maç | hatalı ${b2.filter(r => r.hata).length} | Seviye A modeli uyumu: ${b2.filter(r => r.model_uyumu === 'PASS').length} PASS / ${modelFail} FAIL`);
    }
    const b2err = b2.filter(r => r.hata);

    let b3 = [];
    if (want('b3')) {
        console.log(`B3 — Çiftler puanlama (adım ${B3_STEP}) çalışıyor...`);
        b3 = await runB3();
        console.log(`   ${b3.length} maç | hatalı ${b3.filter(r => r.hata).length}`);
    }

    loud();
    const files = [
        writeCsv('B1_kisitlama_matrisi.csv', b1),
        writeCsv('B2_tekli_uctan_uca.csv', b2),
        writeCsv('B3_ciftler.csv', b3),
    ].filter(Boolean);

    if (fails.length > 0) {
        console.log('\n--- B1 BAŞARISIZ SENARYOLAR ---');
        console.table(fails.map(f => ({ kural: f.ilan_kurali, cinsiyet: f.basvuran_cinsiyet, puan: f.basvuran_puan, beklenen: f.beklenen, gerceklesen: f.gerceklesen })));
    }
    if (b2err.length > 0) {
        console.log('\n--- B2 HATALARI (ilk 10) ---');
        console.table(b2err.slice(0, 10).map(r => ({ kurucu: r.kurucu_puan, rakip: r.rakip_puan, kazanan: r.kazanan, hata: r.hata })));
    }

    const modelFails = b2.filter(r => r.model_uyumu === 'FAIL');
    if (modelFails.length > 0) {
        console.log('\n--- B2: Seviye A modeli gerçek motordan SAPTI (ilk 10) ---');
        console.table(modelFails.slice(0, 10).map(r => ({
            kurucu: r.kurucu_puan, rakip: r.rakip_puan, kazanan: r.kazanan,
            gercek_kurucu: r.kurucu_sonra, model_kurucu: r.model_kurucu, sapma: r.model_sapma,
        })));
    }

    // Kazandığı halde puanı düşen / kaybettiği halde artan gerçek maçlar.
    const anomalies = b2.filter(r => !r.hata && (
        (r.kazanan === 'KURUCU' && (r.kurucu_degisim < 0 || r.rakip_degisim > 0)) ||
        (r.kazanan === 'RAKIP' && (r.rakip_degisim < 0 || r.kurucu_degisim > 0))
    ));
    console.log(`\n--- B2 BULGU: kazandığı halde puanı düşen maç: ${anomalies.length} / ${b2.filter(r => !r.hata).length} ---`);
    console.table(anomalies.slice(0, 8).map(r => ({
        kurucu: r.kurucu_puan, rakip: r.rakip_puan, kazanan: r.kazanan, skor: r.skor,
        kurucu_degisim: r.kurucu_degisim, rakip_degisim: r.rakip_degisim,
    })));

    const negatives = b2.filter(r => !r.hata && (Number(r.kurucu_sonra) < 0 || Number(r.rakip_sonra) < 0));
    console.log(`\n--- B2 BULGU: veritabanına 0'ın ALTINDA puan yazılan maç: ${negatives.length} ---`);
    if (negatives.length > 0) {
        console.table(negatives.slice(0, 5).map(r => ({
            kurucu: r.kurucu_puan, rakip: r.rakip_puan, kazanan: r.kazanan,
            kurucu_sonra: r.kurucu_sonra, rakip_sonra: r.rakip_sonra,
        })));
    }

    console.log('\nCSV dosyaları:');
    for (const f of files) console.log('  ' + f);

    const removed = await cleanup();
    console.log(`\nTemizlik: ${removed} simülasyon kullanıcısı ve tüm maç/puan kayıtları silindi.`);
    console.log(`Süre: ${((Date.now() - t0) / 1000).toFixed(1)} sn`);
    await prisma.$disconnect();
}

main().catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
