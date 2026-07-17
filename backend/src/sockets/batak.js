import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

// Basit, sunucu taraflı (hile yapılamaz) 4 kişilik Batak motoru — oyun durumu
// veritabanında değil bellekte tutulur (sunucu yeniden başlarsa masalar sıfırlanır,
// ilk sürüm için kabul edilebilir bir sınırlama). Kimlik doğrulaması handshake'teki
// JWT'den çözülür (client'ın gönderdiği userId'ye güvenilmez) — aksi halde bir oyuncu
// başkasının userId'sini taklit edip onun elini görebilirdi.

const SUITS = ['S', 'H', 'D', 'C'];
const TOTAL_ROUNDS = 8;
const BOT_DELAY_MS = 2500;

const tables = new Map();       // tableId -> table state
const queue = [];               // [{ userId, username, socket }]
const userTableMap = new Map(); // userId -> tableId (bir kullanıcı aynı anda tek masada olabilir)

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
        seats: table.seats.map(s => ({ userId: s.userId, username: s.username, seat: s.seat, connected: s.connected, handCount: table.hands[s.seat]?.length ?? 0 })),
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
    if (!seatInfo || seatInfo.connected) return;
    table.botTimer = setTimeout(() => runBotAction(io, table, actingSeat), BOT_DELAY_MS);
}

function runBotAction(io, table, seat) {
    try {
        if (table.phase === 'bidding') {
            applyBid(io, table, seat, 'PASS');
        } else if (table.phase === 'choosingTrump') {
            applyTrump(io, table, seat, SUITS[Math.floor(Math.random() * 4)]);
        } else if (table.phase === 'playing') {
            const legal = legalCards(table, seat);
            const card = legal[Math.floor(Math.random() * legal.length)];
            applyCard(io, table, seat, card);
        }
    } catch { /* bot hamlesi başarısız olursa bir sonraki zamanlayıcı yeniden dener */ }
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
        io.to(`batak:${table.id}`).emit('batak:gameEnd', { scores: table.scores });
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
    table.seats.forEach(s => userTableMap.delete(s.userId));
    tables.delete(tableId);
}

function createTable(io, players) {
    const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const table = {
        id,
        seats: players.map((p, seat) => ({ seat, userId: p.userId, username: p.username, socketId: p.socket.id, connected: true })),
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
        seats: table.seats.map(s => ({ userId: s.userId, username: s.username, seat: s.seat })),
    });
    broadcastState(io, table);
    sendAllHands(io, table);
    scheduleBotIfNeeded(io, table);
    return table;
}

function tryMatch(io) {
    while (queue.length >= 4) {
        const players = queue.splice(0, 4);
        createTable(io, players);
    }
}

export function registerBatakHandlers(io, socket) {
    let verifiedUserId = null;
    let username = 'Oyuncu';
    try {
        const token = socket.handshake.auth?.token;
        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            verifiedUserId = decoded.userId;
        }
    } catch { /* token yoksa/geçersizse batak özellikleri kullanılamaz */ }

    socket.on('batak:setUsername', (name) => { username = String(name || '').slice(0, 40) || 'Oyuncu'; });

    socket.on('batak:findMatch', () => {
        if (!verifiedUserId) return socket.emit('batak:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId)) return socket.emit('batak:error', { message: 'Zaten bir masadasın' });
        if (queue.some(q => q.userId === verifiedUserId)) return;
        queue.push({ userId: verifiedUserId, username, socket });
        socket.emit('batak:queued', { position: queue.length });
        tryMatch(io);
    });

    socket.on('batak:cancelFindMatch', () => {
        const idx = queue.findIndex(q => q.userId === verifiedUserId);
        if (idx !== -1) queue.splice(idx, 1);
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
        seat.connected = false;
        broadcastState(io, table);
        scheduleBotIfNeeded(io, table);
    });

    socket.on('disconnect', () => {
        const qIdx = queue.findIndex(q => q.userId === verifiedUserId);
        if (qIdx !== -1) queue.splice(qIdx, 1);
        const tableId = verifiedUserId && userTableMap.get(verifiedUserId);
        if (!tableId) return;
        const table = tables.get(tableId);
        const seat = table?.seats.find(s => s.userId === verifiedUserId);
        if (seat && seat.socketId === socket.id) {
            seat.connected = false;
            broadcastState(io, table);
            scheduleBotIfNeeded(io, table);
        }
    });
}
