import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import prisma from '../config/prisma.js';
import { emitToUser } from '../config/socket.js';
import { createNotification } from '../controllers/notification.controller.js';

// Basit, sunucu taraflı (hile yapılamaz) 4 kişilik Batak motoru — oyun durumu
// veritabanında değil bellekte tutulur (sunucu yeniden başlarsa masalar sıfırlanır,
// ilk sürüm için kabul edilebilir bir sınırlama). Kimlik doğrulaması handshake'teki
// JWT'den çözülür (client'ın gönderdiği userId'ye güvenilmez) — aksi halde bir oyuncu
// başkasının userId'sini taklit edip onun elini görebilirdi.

const SUITS = ['S', 'H', 'D', 'C'];
const TOTAL_ROUNDS = 8;
const BOT_DELAY_MS = 2500;      // gerçek oyuncu koptuğunda devreye giren yedek bot gecikmesi
const BOT_TURN_DELAY_MS = 1200; // "botlarla oyna" masasındaki botların doğal tempoda oynaması için
const BOT_NAMES = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };

const tables = new Map();       // tableId -> table state
const queues = new Map();       // "betAmount:ratingAmount" -> [{ userId, username, avatar, socket }]
const userTableMap = new Map(); // userId -> tableId (bir kullanıcı aynı anda tek masada olabilir)
const codeToTableId = new Map(); // özel masa paylaşım kodu -> tableId

const BET_AMOUNTS = [0, 50, 100, 250, 500];       // puan bahis kademeleri (0 = puan bahsi yok)
const RATING_AMOUNTS = [0, 0.10, 0.25, 0.50];     // derece (skillRating) bahis kademeleri (0 = derece bahsi yok)

function queueKey(betAmount, ratingAmount) { return `${betAmount}:${ratingAmount}`; }
function getQueue(betAmount, ratingAmount) {
    const key = queueKey(betAmount, ratingAmount);
    if (!queues.has(key)) queues.set(key, []);
    return queues.get(key);
}
function isUserQueued(userId) {
    for (const q of queues.values()) if (q.some(x => x.userId === userId)) return true;
    return false;
}

// Masa kurucusu/arayan hem puan hem derece bahsi seçebilir — en az biri sıfırdan büyük
// olmalı (ikisi de sıfırsa bahissiz bir masa anlamsız), her ikisi de geçerli bir kademe
// olmalı (client'tan gelen keyfi değer asla güvenilmez).
function isValidStake(betAmount, ratingAmount) {
    if (!BET_AMOUNTS.includes(betAmount)) return false;
    if (!RATING_AMOUNTS.includes(ratingAmount)) return false;
    return betAmount > 0 || ratingAmount > 0;
}

// Kullanıcının Batak'ı profilinden "aktivite" olarak eklemiş olup olmadığını (ve puan
// bakiyesi/derece) döner — eklenmemiş veya gizlenmişse null. Oynamanın ön koşulu bu.
async function getGameInterest(userId) {
    try {
        return await prisma.userInterest.findUnique({
            where: { userId_category_subCategory: { userId, category: 'GAMES', subCategory: 'batak' } },
        });
    } catch { return null; }
}

// Masa gerçekten başladığında (4 koltuk da dolup ilk el dağıtıldığında) bahisli
// masalardaki her insan oyuncunun bakiyesinden/derecesinden bahis miktarı düşülür.
async function chargeStakes(table) {
    const humans = table.seats.filter(s => s.userId && !s.isBot);
    try {
        await Promise.all(humans.map(s => {
            const data = {};
            if (table.betAmount > 0) data.walletPoints = { decrement: table.betAmount };
            if (table.ratingAmount > 0) data.skillRating = { decrement: table.ratingAmount };
            if (Object.keys(data).length === 0) return null;
            return prisma.userInterest.update({
                where: { userId_category_subCategory: { userId: s.userId, category: 'GAMES', subCategory: 'batak' } },
                data,
            });
        }));
    } catch (e) { console.error('batak stake kesme hatasi:', e.message); }
}

// Oyun (8 el) tamamen bittiğinde bahis havuzlarının (puan ve/veya derece, hangisi
// masada bahis edildiyse) dağılımını hesaplar: 1. %75, 2. %25, 3./4. hiçbir şey almaz.
// Oyun sırasında masadan ayrılan (leftEarly) koltuklar puanlama için en sona atılır —
// kazanan olamazlar, hatta skorları iyi olsa bile.
function computePayouts(table) {
    if ((!table.betAmount || table.betAmount <= 0) && (!table.ratingAmount || table.ratingAmount <= 0)) return null;
    const ranking = table.seats
        .map(s => ({ seat: s.seat, effective: table.leftEarly[s.seat] ? -Infinity : table.scores[s.seat] }))
        .sort((a, b) => b.effective - a.effective || a.seat - b.seat);
    const pointPot = (table.betAmount || 0) * 4;
    const ratingPot = (table.ratingAmount || 0) * 4;
    const points = [0, 0, 0, 0];
    const rating = [0, 0, 0, 0];
    if (ranking[0]) {
        points[ranking[0].seat] = Math.floor(pointPot * 3 / 4);
        rating[ranking[0].seat] = Math.round(ratingPot * 3 / 4 * 100) / 100;
    }
    if (ranking[1]) {
        points[ranking[1].seat] = Math.floor(pointPot / 4);
        rating[ranking[1].seat] = Math.round(ratingPot / 4 * 100) / 100;
    }
    return { points, rating };
}

async function payoutWinners(table, payouts) {
    if (!payouts) return;
    try {
        await Promise.all(table.seats.map((s, i) => {
            if (!s.userId || s.isBot) return null;
            const data = {};
            if (payouts.points[i] > 0) data.walletPoints = { increment: payouts.points[i] };
            if (payouts.rating[i] > 0) data.skillRating = { increment: payouts.rating[i] };
            if (Object.keys(data).length === 0) return null;
            return prisma.userInterest.update({
                where: { userId_category_subCategory: { userId: s.userId, category: 'GAMES', subCategory: 'batak' } },
                data,
            });
        }));
    } catch (e) { console.error('batak odeme hatasi:', e.message); }
}

// Karışabilecek karakterler (I/O/0/1) hariç tutulur — sesli okunup elle girilen bir kod.
function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 5; i++) code += chars[Math.floor(Math.random() * chars.length)];
    return code;
}

function buildDeck() {
    const deck = [];
    for (const suit of SUITS) for (let rank = 2; rank <= 14; rank++) deck.push(`${rank}${suit}`);
    for (let i = deck.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    return deck;
}
function cardRank(card) { return parseInt(card.slice(0, -1), 10); }
function cardSuit(card) { return card.slice(-1); }

function publicState(table) {
    return {
        tableId: table.id,
        phase: table.phase,
        code: table.code || null,
        betAmount: table.betAmount || 0,
        ratingAmount: table.ratingAmount || 0,
        seats: table.seats.map(s => ({ userId: s.userId, username: s.username, avatar: s.avatar || null, seat: s.seat, connected: s.connected, isBot: !!s.isBot, open: !!s.open, handCount: table.hands[s.seat]?.length ?? 0 })),
        dealerIndex: table.dealerIndex,
        turn: table.phase === 'bidding' ? table.biddingTurn : table.phase === 'playing' ? table.turn : null,
        bids: table.passed.map((p, s) => (p ? 'PASS' : (s === table.highestBidder ? table.highestBid : null))),
        highestBid: table.highestBid,
        highestBidder: table.highestBidder,
        trumpSuit: table.trumpSuit,
        trick: table.trick,
        leadSuit: table.leadSuit,
        tricksWon: table.tricksWon,
        scores: table.scores,
        roundNumber: table.roundNumber,
        totalRounds: TOTAL_ROUNDS,
    };
}

function broadcastState(io, table) {
    io.to(`batak:${table.id}`).emit('batak:state', publicState(table));
}
function sendHand(io, table, seat) {
    const s = table.seats[seat];
    if (s?.socketId) io.to(s.socketId).emit('batak:hand', { hand: table.hands[seat] });
}
function sendAllHands(io, table) {
    for (let seat = 0; seat < 4; seat++) sendHand(io, table, seat);
}

function dealRound(table) {
    const deck = buildDeck();
    table.hands = [[], [], [], []];
    for (let i = 0; i < 52; i++) table.hands[i % 4].push(deck[i]);
    for (const h of table.hands) h.sort((a, b) => cardSuit(a).localeCompare(cardSuit(b)) || cardRank(a) - cardRank(b));
    table.phase = 'bidding';
    table.passed = [false, false, false, false];
    table.highestBid = 0;
    table.highestBidder = null;
    table.biddingTurn = (table.dealerIndex + 1) % 4;
    table.trumpSuit = null;
    table.trick = [];
    table.leadSuit = null;
    table.tricksWon = [0, 0, 0, 0];
    table.tricksPlayed = 0;
    table.turn = null;
}

function legalCards(table, seat) {
    const hand = table.hands[seat];
    if (table.trick.length === 0) return hand;
    const followSuit = hand.filter(c => cardSuit(c) === table.leadSuit);
    return followSuit.length > 0 ? followSuit : hand;
}

// ── Bot yapay zekası — zorluk seviyesine göre üç kademe ────────────────────
// easy: büyük ölçüde rastgele (temkinsiz ihale, rastgele koz, rastgele kart).
// medium/hard: elin gücünü tahmin edip ona göre ihale verir, en güçlü rengi koz
// seçer, elini kazanacaksa en ucuza kazanır/kazanamıyorsa en düşük kartı atar.
function estimateHandStrength(hand) {
    let est = 0;
    const bySuit = { S: [], H: [], D: [], C: [] };
    hand.forEach(c => bySuit[cardSuit(c)].push(cardRank(c)));
    for (const suit of SUITS) {
        const ranks = bySuit[suit];
        ranks.forEach(r => {
            if (r === 14) est += 1;
            else if (r === 13) est += 0.7;
            else if (r === 12) est += 0.4;
            else if (r === 11) est += 0.2;
        });
        if (ranks.length > 0 && ranks.length <= 2) est += 0.5; // kısa renk — kozla kesme şansı
    }
    return est;
}

function bestTrumpSuit(hand) {
    const power = { S: 0, H: 0, D: 0, C: 0 };
    hand.forEach(c => { power[cardSuit(c)] += cardRank(c) >= 11 ? 2 : 1; });
    return SUITS.reduce((best, s) => (power[s] > power[best] ? s : best), SUITS[0]);
}

function chooseBotBid(table, seat, difficulty) {
    const hand = table.hands[seat];
    if (difficulty === 'easy') {
        if (table.highestBid >= 10 || Math.random() < 0.55) return 'PASS';
        return table.highestBid + 1;
    }
    const strength = estimateHandStrength(hand);
    let target = Math.round(strength);
    if (difficulty === 'hard' && strength - Math.floor(strength) >= 0.4) target += 1;
    target = Math.max(0, Math.min(13, target));
    return target > table.highestBid ? target : 'PASS';
}

function chooseBotTrump(table, seat, difficulty) {
    if (difficulty === 'easy') return SUITS[Math.floor(Math.random() * 4)];
    return bestTrumpSuit(table.hands[seat]);
}

function chooseBotCard(table, seat, difficulty) {
    const legal = legalCards(table, seat);
    if (difficulty === 'easy') return legal[Math.floor(Math.random() * legal.length)];

    const trump = table.trumpSuit;
    if (table.trick.length === 0) {
        // Lider: elindeki en güçlü rengin (mümkünse koz olmayan) en yüksek kartıyla açar
        const nonTrump = legal.filter(c => cardSuit(c) !== trump);
        const pool = nonTrump.length > 0 ? nonTrump : legal;
        return pool.reduce((best, c) => (cardRank(c) > cardRank(best) ? c : best), pool[0]);
    }

    const winningSeat = resolveTrick(table.trick, table.leadSuit, trump);
    const winningCard = table.trick.find(x => x.seat === winningSeat).card;
    const winningIsTrump = cardSuit(winningCard) === trump;
    const canBeat = legal.filter(c => {
        const suit = cardSuit(c);
        if (suit === table.leadSuit && !winningIsTrump) return cardRank(c) > cardRank(winningCard);
        if (suit === trump) return winningIsTrump ? cardRank(c) > cardRank(winningCard) : true;
        return false;
    });
    if (canBeat.length > 0) {
        // Kazanabiliyorsa en ucuza (en düşük yeterli kartla) kazanır
        return canBeat.reduce((best, c) => (cardRank(c) < cardRank(best) ? c : best), canBeat[0]);
    }
    // Kazanamıyorsa kozu saklayıp en düşük kartı atar
    const nonTrumpLegal = legal.filter(c => cardSuit(c) !== trump);
    const pool = nonTrumpLegal.length > 0 ? nonTrumpLegal : legal;
    return pool.reduce((worst, c) => (cardRank(c) < cardRank(worst) ? c : worst), pool[0]);
}

function clearBotTimer(table) {
    if (table.botTimer) { clearTimeout(table.botTimer); table.botTimer = null; }
}

function scheduleBotIfNeeded(io, table) {
    clearBotTimer(table);
    if (!tables.has(table.id)) return;
    const actingSeat = table.phase === 'bidding' ? table.biddingTurn
        : table.phase === 'choosingTrump' ? table.highestBidder
        : table.phase === 'playing' ? table.turn
        : null;
    if (actingSeat === null || actingSeat === undefined) return;
    const seatInfo = table.seats[actingSeat];
    if (!seatInfo) return;
    // Gerçek ve bağlı bir oyuncunun sırasıysa bot devreye girmez; bot koltuğu veya
    // kopmuş bir oyuncunun sırasıysa (yedek bot olarak) bir süre sonra otomatik oynar.
    if (!seatInfo.isBot && seatInfo.connected) return;
    const delay = seatInfo.isBot ? BOT_TURN_DELAY_MS : BOT_DELAY_MS;
    table.botTimer = setTimeout(() => runBotAction(io, table, actingSeat), delay);
}

function runBotAction(io, table, seat) {
    const difficulty = table.seats[seat]?.difficulty || table.difficulty || 'medium';
    try {
        if (table.phase === 'bidding') {
            applyBid(io, table, seat, chooseBotBid(table, seat, difficulty));
        } else if (table.phase === 'choosingTrump') {
            applyTrump(io, table, seat, chooseBotTrump(table, seat, difficulty));
        } else if (table.phase === 'playing') {
            applyCard(io, table, seat, chooseBotCard(table, seat, difficulty));
        }
    } catch (e) {
        // Beklenmeyen bir hata bot hamlesini engellerse masa sonsuza kadar takılı
        // kalmasın diye kısa bir gecikmeyle yeniden denenir (applyX zaten state'i
        // değiştirmeden hata fırlatır, bu yüzden tekrar denemek güvenlidir).
        console.error('batak bot hamlesi başarısız:', e.message);
        clearBotTimer(table);
        table.botTimer = setTimeout(() => runBotAction(io, table, seat), BOT_TURN_DELAY_MS);
    }
}

function applyBid(io, table, seat, bid) {
    if (table.phase !== 'bidding') throw new Error('Sıra ihalede değil');
    if (table.biddingTurn !== seat) throw new Error('Sıra sende değil');
    if (table.passed[seat]) throw new Error('Zaten pas geçtin');

    if (bid === 'PASS') {
        table.passed[seat] = true;
    } else {
        const n = Number(bid);
        if (!Number.isInteger(n) || n < 1 || n > 13 || n <= table.highestBid) throw new Error('Geçersiz ihale');
        table.highestBid = n;
        table.highestBidder = seat;
    }

    const active = [0, 1, 2, 3].filter(s => !table.passed[s]);
    if (active.length <= 1) {
        const winner = active[0] ?? table.dealerIndex;
        if (table.highestBidder === null) { table.highestBid = 1; table.highestBidder = winner; }
        table.phase = 'choosingTrump';
        table.biddingTurn = null;
    } else {
        do { table.biddingTurn = (table.biddingTurn + 1) % 4; } while (table.passed[table.biddingTurn]);
    }

    broadcastState(io, table);
    scheduleBotIfNeeded(io, table);
}

function applyTrump(io, table, seat, suit) {
    if (table.phase !== 'choosingTrump') throw new Error('Koz seçim aşamasında değil');
    if (table.highestBidder !== seat) throw new Error('Koz seçme yetkisi sende değil');
    if (!SUITS.includes(suit)) throw new Error('Geçersiz renk');
    table.trumpSuit = suit;
    table.phase = 'playing';
    table.turn = (table.dealerIndex + 1) % 4;
    broadcastState(io, table);
    scheduleBotIfNeeded(io, table);
}

function resolveTrick(trick, leadSuit, trumpSuit) {
    const trumps = trick.filter(t => cardSuit(t.card) === trumpSuit);
    const pool = trumps.length > 0 ? trumps : trick.filter(t => cardSuit(t.card) === leadSuit);
    pool.sort((a, b) => cardRank(b.card) - cardRank(a.card));
    return pool[0].seat;
}

function scoreRound(table) {
    const bidder = table.highestBidder;
    const bid = table.highestBid;
    const won = table.tricksWon[bidder];
    const delta = [0, 0, 0, 0];
    delta[bidder] = won >= bid ? bid * 10 : -bid * 10;
    for (let s = 0; s < 4; s++) if (s !== bidder) delta[s] = table.tricksWon[s] * 10;
    for (let s = 0; s < 4; s++) table.scores[s] += delta[s];
    return delta;
}

function applyCard(io, table, seat, card) {
    if (table.phase !== 'playing') throw new Error('Sıra oyunda değil');
    if (table.turn !== seat) throw new Error('Sıra sende değil');
    const hand = table.hands[seat];
    if (!hand.includes(card)) throw new Error('Bu kart elinde yok');
    const legal = legalCards(table, seat);
    if (!legal.includes(card)) throw new Error('Renge uymak zorundasın');

    hand.splice(hand.indexOf(card), 1);
    if (table.trick.length === 0) table.leadSuit = cardSuit(card);
    table.trick.push({ seat, card });

    if (table.trick.length < 4) {
        table.turn = (table.turn + 1) % 4;
        broadcastState(io, table);
        scheduleBotIfNeeded(io, table);
        return;
    }

    const winner = resolveTrick(table.trick, table.leadSuit, table.trumpSuit);
    table.tricksWon[winner] += 1;
    table.tricksPlayed += 1;
    const finishedTrick = table.trick;
    table.trick = [];
    table.leadSuit = null;
    table.turn = winner;

    io.to(`batak:${table.id}`).emit('batak:trickWon', { winner, trick: finishedTrick, tricksWon: table.tricksWon });

    if (table.tricksPlayed === 13) {
        const delta = scoreRound(table);
        table.phase = 'roundEnd';
        io.to(`batak:${table.id}`).emit('batak:roundEnd', {
            bidder: table.highestBidder, bid: table.highestBid, tricksWon: table.tricksWon, delta, scores: table.scores,
            roundNumber: table.roundNumber, totalRounds: TOTAL_ROUNDS,
        });
        setTimeout(() => nextRoundOrEnd(io, table), 4000);
        return;
    }

    broadcastState(io, table);
    scheduleBotIfNeeded(io, table);
}

function nextRoundOrEnd(io, table) {
    if (!tables.has(table.id)) return;
    if (table.roundNumber >= TOTAL_ROUNDS) {
        table.phase = 'finished';
        const payouts = computePayouts(table);
        io.to(`batak:${table.id}`).emit('batak:gameEnd', { scores: table.scores, payouts });
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

function createTable(io, players, betAmount, ratingAmount) {
    const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const table = {
        id,
        betAmount: betAmount || 0,
        ratingAmount: ratingAmount || 0,
        leftEarly: [false, false, false, false],
        seats: players.map((p, seat) => ({ seat, userId: p.userId, username: p.username, avatar: p.avatar || null, socketId: p.socket.id, connected: true, isBot: false })),
        dealerIndex: 0,
        scores: [0, 0, 0, 0],
        roundNumber: 1,
        hands: [[], [], [], []],
        phase: 'dealing',
        botTimer: null,
    };
    tables.set(id, table);
    players.forEach(p => {
        userTableMap.set(p.userId, id);
        p.socket.join(`batak:${id}`);
    });
    dealRound(table);
    io.to(`batak:${id}`).emit('batak:matched', {
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
    const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const botLabel = `🤖 Bot (${BOT_NAMES[difficulty]})`;
    const table = {
        id,
        difficulty,
        betAmount: 0,
        ratingAmount: 0,
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
        phase: 'dealing',
        botTimer: null,
    };
    tables.set(id, table);
    userTableMap.set(requester.userId, id);
    requester.socket.join(`batak:${id}`);
    dealRound(table);
    io.to(`batak:${id}`).emit('batak:matched', {
        tableId: id,
        seats: table.seats.map(s => ({ userId: s.userId, username: s.username, avatar: s.avatar, seat: s.seat, isBot: s.isBot })),
    });
    broadcastState(io, table);
    sendHand(io, table, 0);
    scheduleBotIfNeeded(io, table);
    return table;
}

function tryMatch(io) {
    for (const [key, q] of queues.entries()) {
        while (q.length >= 4) {
            const [betAmount, ratingAmount] = key.split(':').map(Number);
            const players = q.splice(0, 4);
            createTable(io, players, betAmount, ratingAmount);
        }
    }
}

// ── Özel masa (arkadaşla oyna) — kuyruğa girmez, kurucu bekleme odasında 3 açık
// koltuğa arkadaş davet edebilir veya masa kodunu paylaşabilir. 4. kişi katılınca
// (kod ile veya davet kabulüyle) normal 'bidding' akışına geçilir.
function createPrivateTable(io, requester, betAmount, ratingAmount) {
    const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    let code = genCode();
    while (codeToTableId.has(code)) code = genCode();
    const table = {
        id, code,
        betAmount: betAmount || 0,
        ratingAmount: ratingAmount || 0,
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
        phase: 'waiting',
        botTimer: null,
    };
    tables.set(id, table);
    codeToTableId.set(code, id);
    userTableMap.set(requester.userId, id);
    requester.socket.join(`batak:${id}`);
    io.to(`batak:${id}`).emit('batak:matched', {
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
    joiner.socket.join(`batak:${table.id}`);

    io.to(`batak:${table.id}`).emit('batak:matched', {
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

export function registerBatakHandlers(io, socket) {
    let verifiedUserId = null;
    let username = 'Oyuncu';
    let avatar = null;
    try {
        const token = socket.handshake.auth?.token;
        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            verifiedUserId = decoded.userId;
            // Avatarı arka planda çek — saf kozmetik olduğu için bloklamadan (fire-and-forget) yapılır.
            prisma.user.findUnique({ where: { id: verifiedUserId }, select: { avatar: true } })
                .then(u => { avatar = u?.avatar || null; })
                .catch(() => {});
        }
    } catch { /* token yoksa/geçersizse batak özellikleri kullanılamaz */ }

    socket.on('batak:setUsername', (name) => { username = String(name || '').slice(0, 40) || 'Oyuncu'; });

    socket.on('batak:findMatch', async ({ betAmount, ratingAmount = 0 } = {}) => {
        if (!verifiedUserId) return socket.emit('batak:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId) || isUserQueued(verifiedUserId)) return socket.emit('batak:error', { message: 'Zaten bir masadasın' });
        if (!isValidStake(betAmount, ratingAmount)) return socket.emit('batak:error', { message: 'Geçersiz bahis miktarı' });
        const interest = await getGameInterest(verifiedUserId);
        if (!interest) return socket.emit('batak:error', { code: 'ACTIVITY_REQUIRED', message: 'Bu oyunu oynamak için önce profilinden aktivite olarak eklemelisin.' });
        if (interest.walletPoints <= 0) return socket.emit('batak:error', { code: 'INSUFFICIENT_POINTS', message: 'Puanın bitti, bahisli masalara giremezsin.' });
        if (interest.walletPoints < betAmount) return socket.emit('batak:error', { code: 'INSUFFICIENT_POINTS', message: 'Yetersiz puan bakiyesi.' });
        if (interest.skillRating < ratingAmount) return socket.emit('batak:error', { code: 'INSUFFICIENT_RATING', message: 'Yetersiz derece.' });
        getQueue(betAmount, ratingAmount).push({ userId: verifiedUserId, username, avatar, socket });
        socket.emit('batak:queued', { position: getQueue(betAmount, ratingAmount).length });
        tryMatch(io);
    });

    socket.on('batak:playVsBots', async ({ difficulty } = {}) => {
        if (!verifiedUserId) return socket.emit('batak:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId)) return socket.emit('batak:error', { message: 'Zaten bir masadasın' });
        const interest = await getGameInterest(verifiedUserId);
        if (!interest) return socket.emit('batak:error', { code: 'ACTIVITY_REQUIRED', message: 'Bu oyunu oynamak için önce profilinden aktivite olarak eklemelisin.' });
        const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
        createBotTable(io, { userId: verifiedUserId, username, avatar, socket }, diff);
    });

    socket.on('batak:cancelFindMatch', () => {
        for (const q of queues.values()) {
            const idx = q.findIndex(x => x.userId === verifiedUserId);
            if (idx !== -1) q.splice(idx, 1);
        }
    });

    socket.on('batak:createPrivateTable', async ({ betAmount, ratingAmount = 0 } = {}) => {
        if (!verifiedUserId) return socket.emit('batak:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId) || isUserQueued(verifiedUserId)) return socket.emit('batak:error', { message: 'Zaten bir masadasın' });
        if (!isValidStake(betAmount, ratingAmount)) return socket.emit('batak:error', { message: 'Geçersiz bahis miktarı' });
        const interest = await getGameInterest(verifiedUserId);
        if (!interest) return socket.emit('batak:error', { code: 'ACTIVITY_REQUIRED', message: 'Bu oyunu oynamak için önce profilinden aktivite olarak eklemelisin.' });
        if (interest.walletPoints <= 0) return socket.emit('batak:error', { code: 'INSUFFICIENT_POINTS', message: 'Puanın bitti, bahisli masalara giremezsin.' });
        if (interest.walletPoints < betAmount) return socket.emit('batak:error', { code: 'INSUFFICIENT_POINTS', message: 'Yetersiz puan bakiyesi.' });
        if (interest.skillRating < ratingAmount) return socket.emit('batak:error', { code: 'INSUFFICIENT_RATING', message: 'Yetersiz derece.' });
        createPrivateTable(io, { userId: verifiedUserId, username, avatar, socket }, betAmount, ratingAmount);
    });

    socket.on('batak:joinByCode', async ({ code } = {}) => {
        if (!verifiedUserId) return socket.emit('batak:error', { message: 'Oturum doğrulanamadı' });
        const tableId = codeToTableId.get(String(code || '').trim().toUpperCase());
        const table = tableId && tables.get(tableId);
        if (!table) return socket.emit('batak:error', { message: 'Kod geçersiz veya masa artık yok' });
        const interest = await getGameInterest(verifiedUserId);
        if (!interest) return socket.emit('batak:error', { code: 'ACTIVITY_REQUIRED', message: 'Bu oyunu oynamak için önce profilinden aktivite olarak eklemelisin.' });
        if (interest.walletPoints <= 0) return socket.emit('batak:error', { code: 'INSUFFICIENT_POINTS', message: 'Puanın bitti, bahisli masalara giremezsin.' });
        if (table.betAmount > 0 && interest.walletPoints < table.betAmount) return socket.emit('batak:error', { code: 'INSUFFICIENT_POINTS', message: 'Bu masaya katılmak için yeterli puanın yok.' });
        if (table.ratingAmount > 0 && interest.skillRating < table.ratingAmount) return socket.emit('batak:error', { code: 'INSUFFICIENT_RATING', message: 'Bu masaya katılmak için yeterli derecen yok.' });
        try { joinTableByCode(io, { userId: verifiedUserId, username, avatar, socket }, code); }
        catch (e) { socket.emit('batak:error', { message: e.message }); }
    });

    socket.on('batak:inviteFriend', async ({ tableId, userId: targetUserId } = {}) => {
        if (!verifiedUserId) return socket.emit('batak:error', { message: 'Oturum doğrulanamadı' });
        const table = tables.get(tableId);
        const mySeat = table?.seats.find(s => s.userId === verifiedUserId);
        if (!table || !mySeat) return socket.emit('batak:error', { message: 'Bu masada değilsin' });
        if (!table.seats.some(s => s.open)) return socket.emit('batak:error', { message: 'Masa dolu' });
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
            if (!friendship) return socket.emit('batak:error', { message: 'Bu kişi arkadaş listende değil' });
            await createNotification(
                targetUserId, 'GAME_TABLE_INVITE', 'Batak Daveti',
                `${username} seni özel bir Batak masasına davet etti (kod: ${table.code})`,
                { tableId: table.id, code: table.code, game: 'batak' },
            );
            emitToUser(targetUserId, 'batak:inviteReceived', { tableId: table.id, code: table.code, inviterUsername: username });
            socket.emit('batak:inviteSent', { userId: targetUserId });
        } catch (e) {
            socket.emit('batak:error', { message: 'Davet gönderilemedi' });
        }
    });

    socket.on('batak:getState', ({ tableId } = {}) => {
        const table = tables.get(tableId);
        if (!table || !verifiedUserId) return;
        const seat = table.seats.find(s => s.userId === verifiedUserId);
        if (!seat) return;
        seat.connected = true;
        seat.socketId = socket.id;
        socket.join(`batak:${tableId}`);
        clearBotTimer(table);
        scheduleBotIfNeeded(io, table);
        socket.emit('batak:state', publicState(table));
        socket.emit('batak:hand', { hand: table.hands[seat.seat] });
    });

    socket.on('batak:placeBid', ({ tableId, bid } = {}) => {
        const table = tables.get(tableId);
        const seat = table?.seats.find(s => s.userId === verifiedUserId);
        if (!table || !seat) return;
        try { applyBid(io, table, seat.seat, bid); } catch (e) { socket.emit('batak:error', { message: e.message }); }
    });

    socket.on('batak:chooseTrump', ({ tableId, suit } = {}) => {
        const table = tables.get(tableId);
        const seat = table?.seats.find(s => s.userId === verifiedUserId);
        if (!table || !seat) return;
        try { applyTrump(io, table, seat.seat, suit); } catch (e) { socket.emit('batak:error', { message: e.message }); }
    });

    socket.on('batak:playCard', ({ tableId, card } = {}) => {
        const table = tables.get(tableId);
        const seat = table?.seats.find(s => s.userId === verifiedUserId);
        if (!table || !seat) return;
        try { applyCard(io, table, seat.seat, card); } catch (e) { socket.emit('batak:error', { message: e.message }); }
    });

    socket.on('batak:leaveTable', ({ tableId } = {}) => {
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
        for (const q of queues.values()) {
            const qIdx = q.findIndex(x => x.userId === verifiedUserId);
            if (qIdx !== -1) q.splice(qIdx, 1);
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
            // süresi (grace period) yok — batak:getState çağrısı tableId ile doğrudan
            // masaya geri döner ve userTableMap'ten bağımsız çalışır. Bu yüzden kilidi
            // hemen serbest bırakmak güvenli: kullanıcı isterse aynı masaya geri döner,
            // isterse yeni bir eşleşme/bot masası başlatabilir.
            broadcastState(io, table);
            scheduleBotIfNeeded(io, table);
        }
    });
}
