import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';
import prisma from '../config/prisma.js';

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
        seats: table.seats.map(s => ({ userId: s.userId, username: s.username, avatar: s.avatar || null, seat: s.seat, connected: s.connected, isBot: !!s.isBot, handCount: table.hands[s.seat]?.length ?? 0 })),
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
    return table;
}

function createBotTable(io, requester, difficulty) {
    const id = `bt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const botLabel = `🤖 Bot (${BOT_NAMES[difficulty]})`;
    const table = {
        id,
        difficulty,
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
    while (queue.length >= 4) {
        const players = queue.splice(0, 4);
        createTable(io, players);
    }
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

    socket.on('batak:findMatch', () => {
        if (!verifiedUserId) return socket.emit('batak:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId)) return socket.emit('batak:error', { message: 'Zaten bir masadasın' });
        if (queue.some(q => q.userId === verifiedUserId)) return;
        queue.push({ userId: verifiedUserId, username, avatar, socket });
        socket.emit('batak:queued', { position: queue.length });
        tryMatch(io);
    });

    socket.on('batak:playVsBots', ({ difficulty } = {}) => {
        if (!verifiedUserId) return socket.emit('batak:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId)) return socket.emit('batak:error', { message: 'Zaten bir masadasın' });
        const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
        createBotTable(io, { userId: verifiedUserId, username, avatar, socket }, diff);
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
        // Kullanıcı bilerek masadan ayrıldı — eşleşme kilidini hemen serbest bırak ki
        // yeni bir oyuna girebilsin (aksi halde masa bitene kadar kilitli kalırdı).
        userTableMap.delete(verifiedUserId);
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
            // Kod tabanında bağlantı kopunca yeniden bağlanmak için ayrı bir bekleme
            // süresi (grace period) yok — batak:getState çağrısı tableId ile doğrudan
            // masaya geri döner ve userTableMap'ten bağımsız çalışır. Bu yüzden kilidi
            // hemen serbest bırakmak güvenli: kullanıcı isterse aynı masaya geri döner,
            // isterse yeni bir eşleşme/bot masası başlatabilir.
            userTableMap.delete(verifiedUserId);
            broadcastState(io, table);
            scheduleBotIfNeeded(io, table);
        }
    });
}
