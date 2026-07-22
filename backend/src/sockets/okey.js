import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import prisma from '../config/prisma.js';
import { emitToUser } from '../config/socket.js';
import { createNotification } from '../controllers/notification.controller.js';

// Basit, sunucu taraflı (hile yapılamaz) 4 kişilik Okey motoru — batak.js ile birebir aynı
// mimari desen (bellek-içi masa, JWT doğrulama, bot zamanlayıcısı, eşleşme kuyruğu). Oyun
// durumu veritabanında değil bellekte tutulur (sunucu yeniden başlarsa masalar sıfırlanır,
// ilk sürüm için kabul edilebilir bir sınırlama — batak.js'teki aynı tasarım kararı).
//
// Sadeleştirmeler (geleneksel resmi kurallardan, oynanabilirlik için — batak.js'in de
// ihale/bridge kurallarını sadeleştirdiği gibi):
//  - Kasa dahil HERKES 14 taşla oynar (gerçek Okey'de kasa 15 taşla başlar, çekmeden atar).
//  - Deste 0 taşa inince el berabere ("el yandı") biter, skor değişmez.
//  - Kazanma: taş çektikten sonra (15 taş varken) bir taş atılarak (okey:declareWin) kalan
//    14'ün geçerli perde/grup (veya Çift Okey — 7 çift) olduğu iddia edilir; sunucu doğrular.

const COLORS = ['R', 'Y', 'B', 'K']; // Kırmızı, Sarı, Mavi, Siyah
const TOTAL_ROUNDS = 8;
const BOT_DELAY_MS = 2500;      // gerçek oyuncu koptuğunda devreye giren yedek bot gecikmesi
const BOT_TURN_DELAY_MS = 1200; // "botlarla oyna" masasındaki botların doğal tempoda oynaması için
const BOT_NAMES = { easy: 'Kolay', medium: 'Orta', hard: 'Zor', expert: 'Çok Zor' };

const tables = new Map();       // tableId -> table state
const queues = { 50: [], 100: [], 250: [], 500: [] }; // bahis miktarına göre ayrı eşleşme kuyrukları
const userTableMap = new Map(); // userId -> tableId (bir kullanıcı aynı anda tek masada olabilir)
const codeToTableId = new Map(); // özel masa paylaşım kodu -> tableId

const BET_AMOUNTS = [50, 100, 250, 500];

function isUserQueued(userId) {
    return Object.values(queues).some(q => q.some(x => x.userId === userId));
}

// Kullanıcının Okey'i profilinden "aktivite" olarak eklemiş olup olmadığını (ve puan
// bakiyesini) döner — eklenmemiş veya gizlenmişse null. Oynamanın ön koşulu bu.
async function getGameInterest(userId) {
    try {
        return await prisma.userInterest.findUnique({
            where: { userId_category_subCategory: { userId, category: 'GAMES', subCategory: 'okey' } },
        });
    } catch { return null; }
}

// Masa gerçekten başladığında (4 koltuk da dolup ilk el dağıtıldığında) bahisli
// masalardaki her insan oyuncunun bakiyesinden bahis miktarı düşülür.
async function chargeStakes(table) {
    if (!table.betAmount || table.betAmount <= 0) return;
    const humans = table.seats.filter(s => s.userId && !s.isBot);
    try {
        await Promise.all(humans.map(s => prisma.userInterest.update({
            where: { userId_category_subCategory: { userId: s.userId, category: 'GAMES', subCategory: 'okey' } },
            data: { walletPoints: { decrement: table.betAmount } },
        })));
    } catch (e) { console.error('okey stake kesme hatasi:', e.message); }
}

// Oyun (8 el) tamamen bittiğinde bahis havuzunun dağılımını hesaplar: 1. %75, 2. %25,
// 3./4. hiçbir şey almaz. Oyun sırasında masadan ayrılan (leftEarly) koltuklar puanlama
// için en sona atılır — kazanan olamazlar, hatta skorları iyi olsa bile.
function computePayouts(table) {
    if (!table.betAmount || table.betAmount <= 0) return null;
    const ranking = table.seats
        .map(s => ({ seat: s.seat, effective: table.leftEarly[s.seat] ? -Infinity : table.scores[s.seat] }))
        .sort((a, b) => b.effective - a.effective || a.seat - b.seat);
    const pot = table.betAmount * 4;
    const payouts = [0, 0, 0, 0];
    if (ranking[0]) payouts[ranking[0].seat] = Math.floor(pot * 3 / 4);
    if (ranking[1]) payouts[ranking[1].seat] = Math.floor(pot / 4);
    return payouts;
}

async function payoutWinners(table, payouts) {
    if (!payouts) return;
    try {
        await Promise.all(table.seats.map((s, i) => {
            if (!s.userId || s.isBot || !payouts[i]) return null;
            return prisma.userInterest.update({
                where: { userId_category_subCategory: { userId: s.userId, category: 'GAMES', subCategory: 'okey' } },
                data: { walletPoints: { increment: payouts[i] } },
            });
        }));
    } catch (e) { console.error('okey odeme hatasi:', e.message); }
}

// Karışabilecek karakterler (I/O/0/1) hariç tutulur — sesli okunup elle girilen bir kod.
function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

// ── Taş yardımcıları ─────────────────────────────────────────────────────────
function isJokerId(t) { return t === 'J1' || t === 'J2'; }
function tileColor(t) { return t[0]; }
function tileNumber(t) { return parseInt(t.slice(1), 10); }
function isOkeyTile(t, table) {
    if (isJokerId(t)) return true;
    return tileColor(t) === table.okeyColor && tileNumber(t) === table.okeyNumber;
}

function buildTileSet() {
    const tiles = [];
    for (const color of COLORS) {
        for (let n = 1; n <= 13; n++) { tiles.push(`${color}${n}`); tiles.push(`${color}${n}`); }
    }
    tiles.push('J1', 'J2');
    return tiles; // 106
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}

function sortHandInPlace(hand, table) {
    hand.sort((a, b) => {
        const aOkey = isOkeyTile(a, table), bOkey = isOkeyTile(b, table);
        if (aOkey !== bOkey) return aOkey ? 1 : -1; // okey/joker taşları en sona
        if (aOkey && bOkey) return 0;
        return tileColor(a).localeCompare(tileColor(b)) || tileNumber(a) - tileNumber(b);
    });
}

// ── El geçerliliği — perde/grup partisyon kontrolü (backtracking) ───────────
// Küçük bir Node scriptiyle (bilinen geçerli/geçersiz/Çift Okey örnekleriyle) ayrıca
// doğrulandı — bkz. plan dosyası.
function canPartitionPureCount(n) {
    if (n === 0) return true;
    if (n < 3) return false;
    if (n === 5) return false;
    return true;
}

function combinations(arr, k) {
    if (k === 0) return [[]];
    if (arr.length < k) return [];
    const [first, ...rest] = arr;
    const withFirst = combinations(rest, k - 1).map(c => [first, ...c]);
    const withoutFirst = combinations(rest, k);
    return [...withFirst, ...withoutFirst];
}

function canForm(remainingReal, jokerBudget) {
    if (remainingReal.length === 0) return canPartitionPureCount(jokerBudget);

    const sorted = [...remainingReal].sort((a, b) => a.color.localeCompare(b.color) || a.number - b.number);
    const t0 = sorted[0];

    // Grup (set) — aynı sayı, farklı renkler, 3'lü veya 4'lü
    for (const size of [4, 3]) {
        const otherColors = COLORS.filter(c => c !== t0.color);
        for (const combo of combinations(otherColors, size - 1)) {
            let jokersNeeded = 0;
            const used = [t0];
            for (const c of combo) {
                const found = sorted.find(x => x.color === c && x.number === t0.number && !used.includes(x));
                if (found) used.push(found); else jokersNeeded += 1;
            }
            if (jokersNeeded > jokerBudget) continue;
            const nextReal = remainingReal.filter(x => !used.includes(x));
            if (canForm(nextReal, jokerBudget - jokersNeeded)) return true;
        }
    }

    // Perde (run) — aynı renk, ardışık sayılar, t0 en düşük, 3'lü veya 4'lü
    for (const size of [4, 3]) {
        let jokersNeeded = 0;
        const used = [t0];
        let ok = true;
        for (let offset = 1; offset < size; offset++) {
            const num = t0.number + offset;
            if (num > 13) { ok = false; break; }
            const found = sorted.find(x => x.color === t0.color && x.number === num && !used.includes(x));
            if (found) used.push(found); else jokersNeeded += 1;
        }
        if (!ok || jokersNeeded > jokerBudget) continue;
        const nextReal = remainingReal.filter(x => !used.includes(x));
        if (canForm(nextReal, jokerBudget - jokersNeeded)) return true;
    }

    return false;
}

function canFormMelds(tiles, table) {
    if (tiles.length === 0) return true;
    if (tiles.length < 3) return false;
    let jokerBudget = 0;
    const real = [];
    for (const t of tiles) {
        if (isOkeyTile(t, table)) jokerBudget += 1;
        else real.push({ color: tileColor(t), number: tileNumber(t) });
    }
    return canForm(real, jokerBudget);
}

function isCiftOkey(tiles, table) {
    if (tiles.length !== 14) return false;
    const counts = new Map();
    for (const t of tiles) {
        const k = isOkeyTile(t, table) ? '__OKEY__' : `${tileColor(t)}${tileNumber(t)}`;
        counts.set(k, (counts.get(k) || 0) + 1);
    }
    for (const c of counts.values()) if (c % 2 !== 0) return false;
    return true;
}

// ── Genel durum / yayın ──────────────────────────────────────────────────────
function publicState(table) {
    return {
        tableId: table.id,
        code: table.code || null,
        betAmount: table.betAmount || 0,
        phase: table.phase,
        seats: table.seats.map(s => ({ userId: s.userId, username: s.username, avatar: s.avatar || null, seat: s.seat, connected: s.connected, isBot: !!s.isBot, open: !!s.open, handCount: table.hands[s.seat]?.length ?? 0 })),
        dealerIndex: table.dealerIndex,
        turn: table.phase === 'playing' ? table.turn : null,
        awaitingDiscard: table.awaitingDiscard,
        indicator: table.indicator,
        okeyColor: table.okeyColor,
        okeyNumber: table.okeyNumber,
        deckCount: table.deck.length,
        discardTop: table.discardPile.length > 0 ? table.discardPile[table.discardPile.length - 1] : null,
        scores: table.scores,
        roundNumber: table.roundNumber,
        totalRounds: TOTAL_ROUNDS,
    };
}

function broadcastState(io, table) { io.to(`okey:${table.id}`).emit('okey:state', publicState(table)); }
function sendHand(io, table, seat) {
    const s = table.seats[seat];
    if (s?.socketId) io.to(s.socketId).emit('okey:hand', { hand: table.hands[seat] });
}
function sendAllHands(io, table) { for (let seat = 0; seat < 4; seat++) sendHand(io, table, seat); }

function dealRound(table) {
    const deck = shuffle(buildTileSet());

    // Gösterge bir joker taşı olamaz — jokerleri atlayıp gerçek bir taş seçilir
    let indicatorIdx = deck.length - 1;
    while (isJokerId(deck[indicatorIdx])) indicatorIdx--;
    const indicator = deck[indicatorIdx];
    deck.splice(indicatorIdx, 1);

    table.indicator = indicator;
    table.okeyColor = tileColor(indicator);
    table.okeyNumber = (tileNumber(indicator) % 13) + 1;

    const hands = [[], [], [], []];
    for (let seat = 0; seat < 4; seat++) for (let i = 0; i < 14; i++) hands[seat].push(deck.pop());
    for (const h of hands) sortHandInPlace(h, table);

    table.hands = hands;
    table.deck = deck;
    table.discardPile = [];
    table.phase = 'playing';
    table.turn = (table.dealerIndex + 1) % 4;
    table.awaitingDiscard = false;
}

// ── Bot yapay zekası ──────────────────────────────────────────────────────────
// 4 zorluk seviyesi, her biri bir öncekinin üzerine ekleme yapar:
//  - easy:   çoğunlukla rastgele atış/çekiş, hiçbir hesap yapmaz.
//  - medium: hangi taşın elin "kapsama skorunu" en çok artırdığına bakarak çeker/atar
//            (ikili yakınlık — per/seri adayı ikili taş kombinasyonları).
//  - hard:   medium'un üstüne, tamamlanmaya yakın (2/3'ü tamam) üçlü grupları da tanır
//            VE rakiplerin atım yığınından son aldığı taşlara yakın (aynı sayı farklı
//            renk / bitişik sayı aynı renk) taşları atmaktan kaçınır (savunmacı atış).
//  - expert: hard'ın üstüne, savunmacı atıştan daha güçlü kaçınır ve elin kazanmaya
//            "uzaklığını" (kaç taş eksik) de değerlendirerek en optimum atışı seçer.
// Açık bir kazanma varsa (herhangi bir zorlukta) her zaman kazanır — bariz kazancı
// kaçırmak bug gibi görünür, bu yüzden zorluk farkı sadece çekme/atma tercihinde.
function handUsefulnessScore(hand, table, difficulty = 'medium') {
    let score = 0;
    for (let i = 0; i < hand.length; i++) {
        for (let j = i + 1; j < hand.length; j++) {
            const a = hand[i], b = hand[j];
            if (isOkeyTile(a, table) || isOkeyTile(b, table)) { score += 0.5; continue; }
            const ca = tileColor(a), na = tileNumber(a);
            const cb = tileColor(b), nb = tileNumber(b);
            if (na === nb && ca !== cb) score += 1;
            else if (ca === cb && Math.abs(na - nb) === 1) score += 1;
            else if (ca === cb && Math.abs(na - nb) === 2) score += 0.3;
        }
    }
    if (difficulty === 'hard' || difficulty === 'expert') {
        score += tripletCompletionBonus(hand, table);
    }
    return score;
}

// hard/expert: tamamlanmaya bir taş kalmış üçlü grup/perde adaylarına büyük bonus verir —
// bu, botun sadece ikili yakınlığa değil "bitirmeye yakın" gruplara öncelik vermesini sağlar.
function tripletCompletionBonus(hand, table) {
    let bonus = 0;
    const real = hand.filter(t => !isOkeyTile(t, table));
    const jokerCount = hand.length - real.length;
    for (let i = 0; i < real.length; i++) {
        for (let j = i + 1; j < real.length; j++) {
            const a = real[i], b = real[j];
            const ca = tileColor(a), na = tileNumber(a);
            const cb = tileColor(b), nb = tileNumber(b);
            let thirdExists = false, thirdIsJokerable = jokerCount > 0;
            if (na === nb && ca !== cb) {
                // Per adayı — üçüncü renk elde var mı?
                const usedColors = new Set([ca, cb]);
                thirdExists = real.some(t => tileNumber(t) === na && !usedColors.has(tileColor(t)));
            } else if (ca === cb && Math.abs(na - nb) === 1) {
                // Seri adayı — bir öncesi/sonrası elde var mı?
                const lo = Math.min(na, nb), hi = Math.max(na, nb);
                thirdExists = real.some(t => tileColor(t) === ca && (tileNumber(t) === lo - 1 || tileNumber(t) === hi + 1));
            } else continue;
            if (thirdExists) bonus += 2.5;
            else if (thirdIsJokerable) bonus += 1.5;
        }
    }
    return bonus;
}

// hard/expert: rakiplerin atım yığınından az önce aldığı taşlara yakın (aynı sayı farklı
// renk / bitişik sayı aynı renk) bir taş atmak o rakibe yardım etmiş olabilir — riskli.
function discardDangerScore(tile, table, seat, difficulty) {
    if (difficulty !== 'hard' && difficulty !== 'expert') return 0;
    const pickups = Array.isArray(table.recentDiscardPickups) ? table.recentDiscardPickups : [];
    if (pickups.length === 0) return 0;
    const weight = difficulty === 'expert' ? 1 : 0.6;
    let danger = 0;
    const tc = tileColor(tile), tn = tileNumber(tile);
    pickups.forEach((p, idx) => {
        if (p.seat === seat) return; // kendi aldığımız taş kendimize tehlike değil
        if (isJokerId(p.tile)) return;
        const pc = tileColor(p.tile), pn = tileNumber(p.tile);
        const recency = (idx + 1) / pickups.length; // yeni kayıtlar daha ağır basar
        if (pn === tn && pc !== tc) danger += weight * recency;
        else if (pc === tc && Math.abs(pn - tn) <= 2) danger += weight * 0.6 * recency;
    });
    return danger;
}

function findWinningTile(hand, table) {
    for (let i = 0; i < hand.length; i++) {
        const remaining = hand.filter((_, j) => j !== i);
        if (isCiftOkey(remaining, table) || canFormMelds(remaining, table)) return hand[i];
    }
    return null;
}

function chooseBotDraw(table, seat, difficulty) {
    if (table.discardPile.length === 0) return 'deck';
    const top = table.discardPile[table.discardPile.length - 1];
    if (difficulty === 'easy') return Math.random() < 0.2 ? 'discard' : 'deck';
    if (isOkeyTile(top, table)) return 'discard';
    const hand = table.hands[seat];
    const scoreBefore = handUsefulnessScore(hand, table, difficulty);
    const scoreAfter = handUsefulnessScore([...hand, top], table, difficulty);
    return scoreAfter > scoreBefore ? 'discard' : 'deck';
}

function chooseBotDiscard(table, seat, difficulty) {
    const hand = table.hands[seat]; // 15 taş
    const nonJokerIdx = hand.map((_, i) => i).filter(i => !isOkeyTile(hand[i], table));
    const idxs = nonJokerIdx.length > 0 ? nonJokerIdx : hand.map((_, i) => i);
    if (difficulty === 'easy' && Math.random() < 0.25) {
        return hand[idxs[Math.floor(Math.random() * idxs.length)]];
    }
    let bestIdx = idxs[0], bestScore = -Infinity;
    for (const i of idxs) {
        const remaining = hand.filter((_, j) => j !== i);
        const score = handUsefulnessScore(remaining, table, difficulty) - discardDangerScore(hand[i], table, seat, difficulty);
        if (score > bestScore) { bestScore = score; bestIdx = i; }
    }
    return hand[bestIdx];
}

function clearBotTimer(table) {
    if (table.botTimer) { clearTimeout(table.botTimer); table.botTimer = null; }
}

function scheduleBotIfNeeded(io, table) {
    clearBotTimer(table);
    if (!tables.has(table.id)) return;
    if (table.phase !== 'playing') return;
    const actingSeat = table.turn;
    if (actingSeat === null || actingSeat === undefined) return;
    const seatInfo = table.seats[actingSeat];
    if (!seatInfo) return;
    if (!seatInfo.isBot && seatInfo.connected) return;
    const delay = seatInfo.isBot ? BOT_TURN_DELAY_MS : BOT_DELAY_MS;
    table.botTimer = setTimeout(() => runBotAction(io, table, actingSeat), delay);
}

function runBotAction(io, table, seat) {
    const difficulty = table.seats[seat]?.difficulty || table.difficulty || 'medium';
    try {
        if (!table.awaitingDiscard) {
            applyDraw(io, table, seat, chooseBotDraw(table, seat, difficulty));
            return;
        }
        const winTile = findWinningTile(table.hands[seat], table);
        if (winTile) { applyDeclareWin(io, table, seat, winTile); return; }
        applyDiscard(io, table, seat, chooseBotDiscard(table, seat, difficulty));
    } catch (e) {
        console.error('okey bot hamlesi başarısız:', e.message);
        clearBotTimer(table);
        table.botTimer = setTimeout(() => runBotAction(io, table, seat), BOT_TURN_DELAY_MS);
    }
}

// ── Oyun eylemleri ────────────────────────────────────────────────────────────
function applyDraw(io, table, seat, source) {
    if (table.phase !== 'playing') throw new Error('Sıra oyunda değil');
    if (table.turn !== seat) throw new Error('Sıra sende değil');
    if (table.awaitingDiscard) throw new Error('Önce taş atmalısın');

    let tile;
    if (source === 'discard') {
        if (table.discardPile.length === 0) throw new Error('Atım yığını boş');
        tile = table.discardPile.pop();
        // "Zor"/"Çok Zor" botların savunmacı atış yapabilmesi için kimin atım yığınından
        // hangi taşı aldığı kısa bir geçmişte tutulur — o oyuncunun o bölgede (renk/sayı
        // yakınlığında) taş biriktiriyor olabileceği varsayılır, benzer taşlar ona atılmaz.
        if (!Array.isArray(table.recentDiscardPickups)) table.recentDiscardPickups = [];
        table.recentDiscardPickups.push({ seat, tile });
        if (table.recentDiscardPickups.length > 8) table.recentDiscardPickups.shift();
    } else {
        if (table.deck.length === 0) throw new Error('Deste boş');
        tile = table.deck.pop();
    }
    table.hands[seat].push(tile);
    sortHandInPlace(table.hands[seat], table);
    table.awaitingDiscard = true;

    broadcastState(io, table);
    sendHand(io, table, seat);
    scheduleBotIfNeeded(io, table);
}

function applyDiscard(io, table, seat, tile) {
    if (table.phase !== 'playing') throw new Error('Sıra oyunda değil');
    if (table.turn !== seat) throw new Error('Sıra sende değil');
    if (!table.awaitingDiscard) throw new Error('Önce taş çekmelisin');
    const hand = table.hands[seat];
    const idx = hand.indexOf(tile);
    if (idx === -1) throw new Error('Bu taş elinde yok');

    hand.splice(idx, 1);
    table.discardPile.push(tile);
    table.awaitingDiscard = false;

    if (table.deck.length === 0) {
        table.phase = 'roundEnd';
        io.to(`okey:${table.id}`).emit('okey:roundEnd', {
            draw: true, scores: table.scores, roundNumber: table.roundNumber, totalRounds: TOTAL_ROUNDS,
        });
        setTimeout(() => nextRoundOrEnd(io, table), 4000);
        return;
    }

    table.turn = (table.turn + 1) % 4;
    broadcastState(io, table);
    sendHand(io, table, seat);
    scheduleBotIfNeeded(io, table);
}

function scoreRound(table, winnerSeat, isCift) {
    const delta = [0, 0, 0, 0];
    let total = 0;
    for (let s = 0; s < 4; s++) {
        if (s === winnerSeat) continue;
        delta[s] = -table.hands[s].length;
        total += table.hands[s].length;
    }
    delta[winnerSeat] = isCift ? total * 2 : total;
    for (let s = 0; s < 4; s++) table.scores[s] += delta[s];
    return delta;
}

function applyDeclareWin(io, table, seat, tile) {
    if (table.phase !== 'playing') throw new Error('Sıra oyunda değil');
    if (table.turn !== seat) throw new Error('Sıra sende değil');
    if (!table.awaitingDiscard) throw new Error('Önce taş çekmelisin');
    const hand = table.hands[seat];
    const idx = hand.indexOf(tile);
    if (idx === -1) throw new Error('Bu taş elinde yok');

    const remaining = hand.filter((_, i) => i !== idx);
    const isCift = isCiftOkey(remaining, table);
    if (!isCift && !canFormMelds(remaining, table)) throw new Error('Elin geçerli bir açılış değil');

    hand.splice(idx, 1);
    table.discardPile.push(tile);

    const delta = scoreRound(table, seat, isCift);
    table.phase = 'roundEnd';
    io.to(`okey:${table.id}`).emit('okey:roundEnd', {
        winner: seat, ciftOkey: isCift, revealedHand: remaining, delta, scores: table.scores,
        roundNumber: table.roundNumber, totalRounds: TOTAL_ROUNDS,
    });
    setTimeout(() => nextRoundOrEnd(io, table), 4000);
}

function nextRoundOrEnd(io, table) {
    if (!tables.has(table.id)) return;
    if (table.roundNumber >= TOTAL_ROUNDS) {
        table.phase = 'finished';
        const payouts = computePayouts(table);
        io.to(`okey:${table.id}`).emit('okey:gameEnd', { scores: table.scores, payouts });
        payoutWinners(table, payouts);
        setTimeout(() => destroyTable(table.id), 30000);
        return;
    }
    table.roundNumber += 1;
    table.dealerIndex = (table.dealerIndex + 1) % 4;
    dealRound(table);
    broadcastState(io, table);
    sendAllHands(io, table);
    scheduleBotIfNeeded(io, table);
}

function destroyTable(tableId) {
    const table = tables.get(tableId);
    if (!table) return;
    clearBotTimer(table);
    table.seats.forEach(s => { if (s.userId) userTableMap.delete(s.userId); });
    if (table.code) codeToTableId.delete(table.code);
    tables.delete(tableId);
}

function createTable(io, players, betAmount) {
    const id = `ok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const table = {
        id,
        betAmount: betAmount || 0,
        leftEarly: [false, false, false, false],
        seats: players.map((p, seat) => ({ seat, userId: p.userId, username: p.username, avatar: p.avatar || null, socketId: p.socket.id, connected: true, isBot: false })),
        dealerIndex: 0,
        scores: [0, 0, 0, 0],
        roundNumber: 1,
        hands: [[], [], [], []],
        deck: [],
        discardPile: [],
        phase: 'dealing',
        botTimer: null,
        recentDiscardPickups: [],
    };
    tables.set(id, table);
    players.forEach(p => {
        userTableMap.set(p.userId, id);
        p.socket.join(`okey:${id}`);
    });
    dealRound(table);
    io.to(`okey:${id}`).emit('okey:matched', {
        tableId: id,
        seats: table.seats.map(s => ({ userId: s.userId, username: s.username, avatar: s.avatar, seat: s.seat, isBot: false })),
    });
    broadcastState(io, table);
    sendAllHands(io, table);
    scheduleBotIfNeeded(io, table);
    chargeStakes(table);
    return table;
}

function createBotTable(io, requester, difficulty) {
    const id = `ok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const botLabel = `🤖 Bot (${BOT_NAMES[difficulty]})`;
    const table = {
        id,
        difficulty,
        betAmount: 0,
        leftEarly: [false, false, false, false],
        seats: [
            { seat: 0, userId: requester.userId, username: requester.username, avatar: requester.avatar || null, socketId: requester.socket.id, connected: true, isBot: false },
            { seat: 1, userId: null, username: botLabel, avatar: null, socketId: null, connected: true, isBot: true, difficulty },
            { seat: 2, userId: null, username: botLabel, avatar: null, socketId: null, connected: true, isBot: true, difficulty },
            { seat: 3, userId: null, username: botLabel, avatar: null, socketId: null, connected: true, isBot: true, difficulty },
        ],
        dealerIndex: 0,
        scores: [0, 0, 0, 0],
        roundNumber: 1,
        hands: [[], [], [], []],
        deck: [],
        discardPile: [],
        phase: 'dealing',
        botTimer: null,
        recentDiscardPickups: [],
    };
    tables.set(id, table);
    userTableMap.set(requester.userId, id);
    requester.socket.join(`okey:${id}`);
    dealRound(table);
    io.to(`okey:${id}`).emit('okey:matched', {
        tableId: id,
        seats: table.seats.map(s => ({ userId: s.userId, username: s.username, avatar: s.avatar, seat: s.seat, isBot: s.isBot })),
    });
    broadcastState(io, table);
    sendHand(io, table, 0);
    scheduleBotIfNeeded(io, table);
    return table;
}

function tryMatch(io) {
    for (const amount of BET_AMOUNTS) {
        const q = queues[amount];
        while (q.length >= 4) {
            const players = q.splice(0, 4);
            createTable(io, players, amount);
        }
    }
}

// ── Özel masa (arkadaşla oyna) — kuyruğa girmez, kurucu bekleme odasında 3 açık
// koltuğa arkadaş davet edebilir veya masa kodunu paylaşabilir. 4. kişi katılınca
// (kod ile veya davet kabulüyle) normal 'playing' akışına geçilir.
function createPrivateTable(io, requester, betAmount) {
    const id = `ok_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let code = genCode();
    while (codeToTableId.has(code)) code = genCode();
    const table = {
        id, code,
        betAmount: betAmount || 0,
        leftEarly: [false, false, false, false],
        seats: [
            { seat: 0, userId: requester.userId, username: requester.username, avatar: requester.avatar || null, socketId: requester.socket.id, connected: true, isBot: false, open: false },
            { seat: 1, userId: null, username: null, avatar: null, socketId: null, connected: false, isBot: false, open: true },
            { seat: 2, userId: null, username: null, avatar: null, socketId: null, connected: false, isBot: false, open: true },
            { seat: 3, userId: null, username: null, avatar: null, socketId: null, connected: false, isBot: false, open: true },
        ],
        dealerIndex: 0,
        scores: [0, 0, 0, 0],
        roundNumber: 1,
        hands: [[], [], [], []],
        deck: [],
        discardPile: [],
        phase: 'waiting',
        botTimer: null,
        recentDiscardPickups: [],
    };
    tables.set(id, table);
    codeToTableId.set(code, id);
    userTableMap.set(requester.userId, id);
    requester.socket.join(`okey:${id}`);
    io.to(`okey:${id}`).emit('okey:matched', {
        tableId: id, code,
        seats: table.seats.map(s => ({ userId: s.userId, username: s.username, avatar: s.avatar, seat: s.seat, isBot: s.isBot, open: s.open })),
    });
    broadcastState(io, table);
    return table;
}

function joinTableByCode(io, joiner, code) {
    const tableId = codeToTableId.get(String(code || '').trim().toUpperCase());
    const table = tableId && tables.get(tableId);
    if (!table) throw new Error('Kod geçersiz veya masa artık yok');
    if (table.phase !== 'waiting') throw new Error('Bu masa artık katılıma kapalı');
    if (userTableMap.has(joiner.userId)) throw new Error('Zaten bir masadasın');
    const openSeat = table.seats.find(s => s.open);
    if (!openSeat) throw new Error('Masa dolu');

    openSeat.userId = joiner.userId;
    openSeat.username = joiner.username;
    openSeat.avatar = joiner.avatar || null;
    openSeat.socketId = joiner.socket.id;
    openSeat.connected = true;
    openSeat.open = false;
    userTableMap.set(joiner.userId, table.id);
    joiner.socket.join(`okey:${table.id}`);

    io.to(`okey:${table.id}`).emit('okey:matched', {
        tableId: table.id, code: table.code,
        seats: table.seats.map(s => ({ userId: s.userId, username: s.username, avatar: s.avatar, seat: s.seat, isBot: s.isBot, open: s.open })),
    });

    if (!table.seats.some(s => s.open)) {
        dealRound(table);
        broadcastState(io, table);
        sendAllHands(io, table);
        scheduleBotIfNeeded(io, table);
        chargeStakes(table);
    } else {
        broadcastState(io, table);
    }
    return table;
}

export function registerOkeyHandlers(io, socket) {
    let verifiedUserId = null;
    let username = 'Oyuncu';
    let avatar = null;
    try {
        const token = socket.handshake.auth?.token;
        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            verifiedUserId = decoded.userId;
            // Avatarı arka planda çek — masa/koltuk görsel bir "kim kimdir" hissi versin
            // diye eklendi, saf kozmetik olduğu için bloklamadan (fire-and-forget) yapılır.
            prisma.user.findUnique({ where: { id: verifiedUserId }, select: { avatar: true } })
                .then(u => { avatar = u?.avatar || null; })
                .catch(() => {});
        }
    } catch { /* token yoksa/geçersizse okey özellikleri kullanılamaz */ }

    socket.on('okey:setUsername', (name) => { username = String(name || '').slice(0, 40) || 'Oyuncu'; });

    socket.on('okey:findMatch', async ({ betAmount } = {}) => {
        if (!verifiedUserId) return socket.emit('okey:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId) || isUserQueued(verifiedUserId)) return socket.emit('okey:error', { message: 'Zaten bir masadasın' });
        if (!BET_AMOUNTS.includes(betAmount)) return socket.emit('okey:error', { message: 'Geçersiz bahis miktarı' });
        const interest = await getGameInterest(verifiedUserId);
        if (!interest) return socket.emit('okey:error', { code: 'ACTIVITY_REQUIRED', message: 'Bu oyunu oynamak için önce profilinden aktivite olarak eklemelisin.' });
        if (interest.walletPoints < betAmount) return socket.emit('okey:error', { code: 'INSUFFICIENT_POINTS', message: 'Yetersiz puan bakiyesi.' });
        queues[betAmount].push({ userId: verifiedUserId, username, avatar, socket });
        socket.emit('okey:queued', { position: queues[betAmount].length });
        tryMatch(io);
    });

    socket.on('okey:playVsBots', async ({ difficulty } = {}) => {
        if (!verifiedUserId) return socket.emit('okey:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId)) return socket.emit('okey:error', { message: 'Zaten bir masadasın' });
        const interest = await getGameInterest(verifiedUserId);
        if (!interest) return socket.emit('okey:error', { code: 'ACTIVITY_REQUIRED', message: 'Bu oyunu oynamak için önce profilinden aktivite olarak eklemelisin.' });
        const diff = ['easy', 'medium', 'hard', 'expert'].includes(difficulty) ? difficulty : 'medium';
        createBotTable(io, { userId: verifiedUserId, username, avatar, socket }, diff);
    });

    socket.on('okey:cancelFindMatch', () => {
        for (const amount of BET_AMOUNTS) {
            const idx = queues[amount].findIndex(q => q.userId === verifiedUserId);
            if (idx !== -1) queues[amount].splice(idx, 1);
        }
    });

    socket.on('okey:createPrivateTable', async ({ betAmount } = {}) => {
        if (!verifiedUserId) return socket.emit('okey:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId) || isUserQueued(verifiedUserId)) return socket.emit('okey:error', { message: 'Zaten bir masadasın' });
        if (!BET_AMOUNTS.includes(betAmount)) return socket.emit('okey:error', { message: 'Geçersiz bahis miktarı' });
        const interest = await getGameInterest(verifiedUserId);
        if (!interest) return socket.emit('okey:error', { code: 'ACTIVITY_REQUIRED', message: 'Bu oyunu oynamak için önce profilinden aktivite olarak eklemelisin.' });
        if (interest.walletPoints < betAmount) return socket.emit('okey:error', { code: 'INSUFFICIENT_POINTS', message: 'Yetersiz puan bakiyesi.' });
        createPrivateTable(io, { userId: verifiedUserId, username, avatar, socket }, betAmount);
    });

    socket.on('okey:joinByCode', async ({ code } = {}) => {
        if (!verifiedUserId) return socket.emit('okey:error', { message: 'Oturum doğrulanamadı' });
        const tableId = codeToTableId.get(String(code || '').trim().toUpperCase());
        const table = tableId && tables.get(tableId);
        if (!table) return socket.emit('okey:error', { message: 'Kod geçersiz veya masa artık yok' });
        const interest = await getGameInterest(verifiedUserId);
        if (!interest) return socket.emit('okey:error', { code: 'ACTIVITY_REQUIRED', message: 'Bu oyunu oynamak için önce profilinden aktivite olarak eklemelisin.' });
        if (table.betAmount > 0 && interest.walletPoints < table.betAmount) return socket.emit('okey:error', { code: 'INSUFFICIENT_POINTS', message: 'Bu masaya katılmak için yeterli puanın yok.' });
        try { joinTableByCode(io, { userId: verifiedUserId, username, avatar, socket }, code); }
        catch (e) { socket.emit('okey:error', { message: e.message }); }
    });

    socket.on('okey:inviteFriend', async ({ tableId, userId: targetUserId } = {}) => {
        if (!verifiedUserId) return socket.emit('okey:error', { message: 'Oturum doğrulanamadı' });
        const table = tables.get(tableId);
        const mySeat = table?.seats.find(s => s.userId === verifiedUserId);
        if (!table || !mySeat) return socket.emit('okey:error', { message: 'Bu masada değilsin' });
        if (!table.seats.some(s => s.open)) return socket.emit('okey:error', { message: 'Masa dolu' });
        try {
            const friendship = await prisma.friendship.findFirst({
                where: {
                    status: 'ACCEPTED',
                    OR: [
                        { senderId: verifiedUserId, receiverId: targetUserId },
                        { senderId: targetUserId, receiverId: verifiedUserId },
                    ],
                },
            });
            if (!friendship) return socket.emit('okey:error', { message: 'Bu kişi arkadaş listende değil' });
            await createNotification(
                targetUserId, 'GAME_TABLE_INVITE', 'Okey Daveti',
                `${username} seni özel bir Okey masasına davet etti (kod: ${table.code})`,
                { tableId: table.id, code: table.code, game: 'okey' },
            );
            emitToUser(targetUserId, 'okey:inviteReceived', { tableId: table.id, code: table.code, inviterUsername: username });
            socket.emit('okey:inviteSent', { userId: targetUserId });
        } catch (e) {
            socket.emit('okey:error', { message: 'Davet gönderilemedi' });
        }
    });

    socket.on('okey:getState', ({ tableId } = {}) => {
        const table = tables.get(tableId);
        if (!table || !verifiedUserId) return;
        const seat = table.seats.find(s => s.userId === verifiedUserId);
        if (!seat) return;
        seat.connected = true;
        seat.socketId = socket.id;
        socket.join(`okey:${tableId}`);
        clearBotTimer(table);
        scheduleBotIfNeeded(io, table);
        socket.emit('okey:state', publicState(table));
        socket.emit('okey:hand', { hand: table.hands[seat.seat] });
    });

    socket.on('okey:drawTile', ({ tableId, source } = {}) => {
        const table = tables.get(tableId);
        const seat = table?.seats.find(s => s.userId === verifiedUserId);
        if (!table || !seat) return;
        try { applyDraw(io, table, seat.seat, source); } catch (e) { socket.emit('okey:error', { message: e.message }); }
    });

    socket.on('okey:discardTile', ({ tableId, tile } = {}) => {
        const table = tables.get(tableId);
        const seat = table?.seats.find(s => s.userId === verifiedUserId);
        if (!table || !seat) return;
        try { applyDiscard(io, table, seat.seat, tile); } catch (e) { socket.emit('okey:error', { message: e.message }); }
    });

    socket.on('okey:declareWin', ({ tableId, tile } = {}) => {
        const table = tables.get(tableId);
        const seat = table?.seats.find(s => s.userId === verifiedUserId);
        if (!table || !seat) return;
        try { applyDeclareWin(io, table, seat.seat, tile); } catch (e) { socket.emit('okey:error', { message: e.message }); }
    });

    socket.on('okey:leaveTable', ({ tableId } = {}) => {
        const table = tables.get(tableId);
        const seat = table?.seats.find(s => s.userId === verifiedUserId);
        if (!table || !seat) return;
        userTableMap.delete(verifiedUserId);
        if (table.phase === 'waiting') {
            // Bekleme odasında oyun henüz başlamadı — bot yedeği yok, koltuk tamamen
            // boşalıp başka biri kod ile katılabilsin diye 'open' durumuna dönüyor.
            seat.userId = null; seat.username = null; seat.avatar = null; seat.socketId = null; seat.connected = false; seat.open = true;
            if (table.seats.every(s => s.open)) { destroyTable(table.id); return; }
            broadcastState(io, table);
            return;
        }
        seat.connected = false;
        // Bahisli bir masada oyun devam ederken bilerek ayrılan oyuncu otomatik
        // kaybetmiş sayılır — puanını geri alamaz, oyun sonu ödemesinde en sona atılır.
        if (table.betAmount > 0) table.leftEarly[seat.seat] = true;
        // Kullanıcı bilerek masadan ayrıldı — eşleşme kilidini hemen serbest bırak ki
        // yeni bir oyuna girebilsin (aksi halde masa bitene kadar kilitli kalırdı).
        broadcastState(io, table);
        scheduleBotIfNeeded(io, table);
    });

    socket.on('disconnect', () => {
        for (const amount of BET_AMOUNTS) {
            const qIdx = queues[amount].findIndex(q => q.userId === verifiedUserId);
            if (qIdx !== -1) queues[amount].splice(qIdx, 1);
        }
        const tableId = verifiedUserId && userTableMap.get(verifiedUserId);
        if (!tableId) return;
        const table = tables.get(tableId);
        const seat = table?.seats.find(s => s.userId === verifiedUserId);
        if (seat && seat.socketId === socket.id) {
            userTableMap.delete(verifiedUserId);
            if (table.phase === 'waiting') {
                seat.userId = null; seat.username = null; seat.avatar = null; seat.socketId = null; seat.connected = false; seat.open = true;
                if (table.seats.every(s => s.open)) { destroyTable(table.id); return; }
                broadcastState(io, table);
                return;
            }
            seat.connected = false;
            if (table.betAmount > 0) table.leftEarly[seat.seat] = true;
            // Kod tabanında bağlantı kopunca yeniden bağlanmak için ayrı bir bekleme
            // süresi (grace period) yok — okey:getState çağrısı tableId ile doğrudan
            // masaya geri döner ve userTableMap'ten bağımsız çalışır. Bu yüzden kilidi
            // hemen serbest bırakmak güvenli: kullanıcı isterse aynı masaya geri döner,
            // isterse yeni bir eşleşme/bot masası başlatabilir.
            broadcastState(io, table);
            scheduleBotIfNeeded(io, table);
        }
    });
}
