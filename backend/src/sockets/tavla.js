import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '../config/env.js';

// Sunucu tarafli (hile yapilamaz) 2 kisilik Tavla (backgammon) motoru — Batak ile
// ayni mimari desen: bellekte tutulan masa durumu, JWT ile dogrulanan kimlik,
// eslestirme kuyrugu + zorluk seviyeli bot secenegi, kopan oyuncu icin yedek bot.
//
// Tahta: 24 nokta (index 0-23 = nokta 1-24). player0 24->1 yonunde, player1 1->24
// yonunde oynar. board[i] pozitifse player0, negatifse player1 tasi (mutlak deger
// tas sayisi). Standart baslangic dizilimi kullanilir.
//
// Kapsam disi (bilinen sinirlama): resmi "iki zari da mumkunse kullanmak zorunda"
// kurali tam siki uygulanmiyor — bir zar, o an icin gercekten hic legal hamlesi
// yoksa otomatik atlanir. Ikiye katlama kupu (doubling cube) yok.

const TOTAL_CHECKERS = 15;
const BOT_TURN_DELAY_MS = 1300;
const BOT_DELAY_MS = 2500;
const BOT_NAMES = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };

const tables = new Map();
const queue = [];
const userTableMap = new Map();

function initialBoard() {
    const b = new Array(24).fill(0);
    b[23] = 2; b[12] = 5; b[7] = 3; b[5] = 5;
    b[0] = -2; b[11] = -5; b[16] = -3; b[18] = -5;
    return b;
}

function ownCount(board, player, idx) {
    const v = board[idx];
    return player === 0 ? v : -v;
}
function oppCount(board, player, idx) {
    return ownCount(board, player === 0 ? 1 : 0, idx);
}
function isOpen(board, player, idx) {
    if (idx < 0 || idx > 23) return false;
    return oppCount(board, player, idx) < 2;
}
function isHomeIndex(player, idx) { return player === 0 ? idx <= 5 : idx >= 18; }
function homeIndices(player) { return player === 0 ? [0, 1, 2, 3, 4, 5] : [18, 19, 20, 21, 22, 23]; }

function allCheckersHome(table, player) {
    if (table.bar[player] > 0) return false;
    for (let i = 0; i < 24; i++) {
        if (isHomeIndex(player, i)) continue;
        if (ownCount(table.board, player, i) > 0) return false;
    }
    return true;
}

function targetIndex(player, fromIdx, die) {
    if (fromIdx === -1) return player === 0 ? 24 - die : die - 1;
    return player === 0 ? fromIdx - die : fromIdx + die;
}
function isBearOffTarget(player, target) { return player === 0 ? target < 0 : target > 23; }

function pipDistance(player, idx) { return player === 0 ? idx + 1 : 24 - idx; }

function canBearOff(table, player, fromIdx, die) {
    if (!allCheckersHome(table, player)) return false;
    const target = targetIndex(player, fromIdx, die);
    if (!isBearOffTarget(player, target)) return false;
    const fromDist = pipDistance(player, fromIdx);
    if (fromDist === die) return true; // tam eslesme
    if (die < fromDist) return false;
    // fazla zar: sadece kendisinden daha uzak (bear-off'a daha uzak) taş yoksa gecerli
    for (const i of homeIndices(player)) {
        if (pipDistance(player, i) > fromDist && ownCount(table.board, player, i) > 0) return false;
    }
    return true;
}

function rollDice() {
    const a = 1 + Math.floor(Math.random() * 6);
    const b = 1 + Math.floor(Math.random() * 6);
    return a === b ? [a, a, a, a] : [a, b];
}

function legalMovesForDie(table, player, die) {
    const moves = [];
    if (table.bar[player] > 0) {
        const target = targetIndex(player, -1, die);
        if (isOpen(table.board, player, target)) moves.push({ from: -1, to: target, die });
        return moves;
    }
    for (let i = 0; i < 24; i++) {
        if (ownCount(table.board, player, i) <= 0) continue;
        const target = targetIndex(player, i, die);
        if (isBearOffTarget(player, target)) {
            if (canBearOff(table, player, i, die)) moves.push({ from: i, to: 'off', die });
        } else if (isOpen(table.board, player, target)) {
            moves.push({ from: i, to: target, die });
        }
    }
    return moves;
}

function distinctRemainingDice(table) {
    return [...new Set(table.movesRemaining)];
}

function anyLegalMoveExists(table, player) {
    for (const die of distinctRemainingDice(table)) {
        if (legalMovesForDie(table, player, die).length > 0) return true;
    }
    return false;
}

function applyMoveToBoard(table, player, move) {
    const opp = player === 0 ? 1 : 0;
    if (move.from === -1) table.bar[player] -= 1;
    else table.board[move.from] -= (player === 0 ? 1 : -1);

    if (move.to === 'off') {
        table.borneOff[player] += 1;
    } else {
        if (oppCount(table.board, player, move.to) === 1) {
            table.board[move.to] = 0;
            table.bar[opp] += 1;
        }
        table.board[move.to] += (player === 0 ? 1 : -1);
    }
}

function removeOneDie(table, die) {
    const idx = table.movesRemaining.indexOf(die);
    if (idx !== -1) table.movesRemaining.splice(idx, 1);
}

function publicState(table) {
    return {
        tableId: table.id,
        phase: table.phase,
        players: table.players.map(p => ({ userId: p.userId, username: p.username, connected: p.connected, isBot: !!p.isBot })),
        board: table.board,
        bar: table.bar,
        borneOff: table.borneOff,
        turn: table.turn,
        dice: table.dice,
        movesRemaining: table.movesRemaining,
        winner: table.winner ?? null,
    };
}

function broadcastState(io, table) {
    io.to(`tavla:${table.id}`).emit('tavla:state', publicState(table));
}

function clearBotTimer(table) {
    if (table.botTimer) { clearTimeout(table.botTimer); table.botTimer = null; }
}

function endTurnIfNoMoves(io, table) {
    // Kalan zarlardan hicbiri oynanamiyorsa sirayi devret
    while (table.phase === 'moving' && table.movesRemaining.length > 0 && !anyLegalMoveExists(table, table.turn)) {
        table.movesRemaining = [];
    }
    if (table.phase === 'moving' && table.movesRemaining.length === 0) {
        table.turn = table.turn === 0 ? 1 : 0;
        table.phase = 'rolling';
        table.dice = [];
    }
}

function startRoll(io, table) {
    table.dice = rollDice();
    table.movesRemaining = [...table.dice];
    table.phase = 'moving';
    if (!anyLegalMoveExists(table, table.turn)) {
        table.movesRemaining = [];
        table.turn = table.turn === 0 ? 1 : 0;
        table.phase = 'rolling';
        table.dice = [];
    }
}

function applyMove(io, table, player, move) {
    if (table.phase !== 'moving') throw new Error('Sıra zar atmada');
    if (table.turn !== player) throw new Error('Sıra sende değil');
    if (!table.movesRemaining.includes(move.die)) throw new Error('Bu zar kullanılamaz');
    const legal = legalMovesForDie(table, player, move.die);
    const found = legal.find(m => m.from === move.from && String(m.to) === String(move.to));
    if (!found) throw new Error('Geçersiz hamle');

    applyMoveToBoard(table, player, found);
    removeOneDie(table, move.die);

    if (table.borneOff[player] === TOTAL_CHECKERS) {
        table.phase = 'finished';
        table.winner = player;
        io.to(`tavla:${table.id}`).emit('tavla:gameEnd', { winner: player });
        broadcastState(io, table);
        setTimeout(() => destroyTable(table.id), 30000);
        return;
    }

    endTurnIfNoMoves(io, table);
    broadcastState(io, table);
    scheduleBotIfNeeded(io, table);
}

function requestRoll(io, table, player) {
    if (table.phase !== 'rolling') throw new Error('Zar atma sırası değil');
    if (table.turn !== player) throw new Error('Sıra sende değil');
    startRoll(io, table);
    broadcastState(io, table);
    scheduleBotIfNeeded(io, table);
}

// ── Bot yapay zekasi ─────────────────────────────────────────────────────
function evaluateMove(table, player, move) {
    let score = Math.random() * 0.5; // hafif rastgelelik — botlar deterministik olmasin
    const opp = player === 0 ? 1 : 0;
    if (move.to !== 'off' && oppCount(table.board, player, move.to) === 1) score += 8; // vurus
    if (move.to === 'off') score += 5;
    // hedefte kendi tasimizdan 2+ olursa (nokta kapatma) guvenli
    const destCountAfter = move.to === 'off' ? 0 : ownCount(table.board, player, move.to) + 1;
    if (move.to !== 'off' && destCountAfter === 1) score -= 3; // blot birakma riski
    if (move.to !== 'off' && destCountAfter >= 2) score += 2; // nokta kapama
    // kaynaktan ayrilinca orada blot kalirsa kucuk ceza
    if (move.from !== -1) {
        const remain = ownCount(table.board, player, move.from) - 1;
        if (remain === 1) score -= 1.5;
    }
    score += move.die * 0.3; // ilerleme
    return score;
}

function chooseBotMove(table, player, difficulty) {
    const candidates = [];
    for (const die of distinctRemainingDice(table)) {
        for (const m of legalMovesForDie(table, player, die)) candidates.push(m);
    }
    if (candidates.length === 0) return null;
    if (difficulty === 'easy') return candidates[Math.floor(Math.random() * candidates.length)];
    let best = candidates[0], bestScore = -Infinity;
    for (const m of candidates) {
        const sc = evaluateMove(table, player, m) + (difficulty === 'hard' ? 0 : (Math.random() * 2 - 1));
        if (sc > bestScore) { bestScore = sc; best = m; }
    }
    return best;
}

function scheduleBotIfNeeded(io, table) {
    clearBotTimer(table);
    if (!tables.has(table.id)) return;
    if (table.phase === 'finished') return;
    const actingPlayer = table.turn;
    const info = table.players[actingPlayer];
    if (!info) return;
    if (!info.isBot && info.connected) return;
    const delay = info.isBot ? BOT_TURN_DELAY_MS : BOT_DELAY_MS;
    table.botTimer = setTimeout(() => runBotAction(io, table, actingPlayer), delay);
}

function runBotAction(io, table, player) {
    const difficulty = table.players[player]?.difficulty || table.difficulty || 'medium';
    try {
        if (table.phase === 'rolling') {
            requestRoll(io, table, player);
            return;
        }
        if (table.phase === 'moving') {
            const move = chooseBotMove(table, player, difficulty);
            if (!move) { endTurnIfNoMoves(io, table); broadcastState(io, table); scheduleBotIfNeeded(io, table); return; }
            applyMove(io, table, player, move);
        }
    } catch (e) {
        console.error('tavla bot hamlesi başarısız:', e.message);
        clearBotTimer(table);
        table.botTimer = setTimeout(() => runBotAction(io, table, player), BOT_TURN_DELAY_MS);
    }
}

function destroyTable(tableId) {
    const table = tables.get(tableId);
    if (!table) return;
    clearBotTimer(table);
    table.players.forEach(p => userTableMap.delete(p.userId));
    tables.delete(tableId);
}

function newTableBase(id) {
    return {
        id,
        board: initialBoard(),
        bar: [0, 0],
        borneOff: [0, 0],
        turn: 0,
        dice: [],
        movesRemaining: [],
        phase: 'rolling',
        winner: null,
        botTimer: null,
    };
}

function createTable(io, players) {
    const id = `tv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const table = {
        ...newTableBase(id),
        players: players.map(p => ({ userId: p.userId, username: p.username, socketId: p.socket.id, connected: true, isBot: false })),
    };
    tables.set(id, table);
    players.forEach(p => {
        userTableMap.set(p.userId, id);
        p.socket.join(`tavla:${id}`);
    });
    io.to(`tavla:${id}`).emit('tavla:matched', {
        tableId: id,
        players: table.players.map(p => ({ userId: p.userId, username: p.username, isBot: false })),
    });
    broadcastState(io, table);
    scheduleBotIfNeeded(io, table);
    return table;
}

function createBotTable(io, requester, difficulty) {
    const id = `tv_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const botLabel = `🤖 Bot (${BOT_NAMES[difficulty]})`;
    const table = {
        ...newTableBase(id),
        difficulty,
        players: [
            { userId: requester.userId, username: requester.username, socketId: requester.socket.id, connected: true, isBot: false },
            { userId: null, username: botLabel, socketId: null, connected: true, isBot: true, difficulty },
        ],
    };
    tables.set(id, table);
    userTableMap.set(requester.userId, id);
    requester.socket.join(`tavla:${id}`);
    io.to(`tavla:${id}`).emit('tavla:matched', {
        tableId: id,
        players: table.players.map(p => ({ userId: p.userId, username: p.username, isBot: p.isBot })),
    });
    broadcastState(io, table);
    scheduleBotIfNeeded(io, table);
    return table;
}

function tryMatch(io) {
    while (queue.length >= 2) {
        const players = queue.splice(0, 2);
        createTable(io, players);
    }
}

export function registerTavlaHandlers(io, socket) {
    let verifiedUserId = null;
    let username = 'Oyuncu';
    try {
        const token = socket.handshake.auth?.token;
        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            verifiedUserId = decoded.userId;
        }
    } catch { /* token yoksa/geçersizse tavla özellikleri kullanılamaz */ }

    socket.on('tavla:setUsername', (name) => { username = String(name || '').slice(0, 40) || 'Oyuncu'; });

    socket.on('tavla:findMatch', () => {
        if (!verifiedUserId) return socket.emit('tavla:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId)) return socket.emit('tavla:error', { message: 'Zaten bir masadasın' });
        if (queue.some(q => q.userId === verifiedUserId)) return;
        queue.push({ userId: verifiedUserId, username, socket });
        socket.emit('tavla:queued', { position: queue.length });
        tryMatch(io);
    });

    socket.on('tavla:playVsBots', ({ difficulty } = {}) => {
        if (!verifiedUserId) return socket.emit('tavla:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId)) return socket.emit('tavla:error', { message: 'Zaten bir masadasın' });
        const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
        createBotTable(io, { userId: verifiedUserId, username, socket }, diff);
    });

    socket.on('tavla:cancelFindMatch', () => {
        const idx = queue.findIndex(q => q.userId === verifiedUserId);
        if (idx !== -1) queue.splice(idx, 1);
    });

    socket.on('tavla:getState', ({ tableId } = {}) => {
        const table = tables.get(tableId);
        if (!table || !verifiedUserId) return;
        const idx = table.players.findIndex(p => p.userId === verifiedUserId);
        if (idx === -1) return;
        table.players[idx].connected = true;
        table.players[idx].socketId = socket.id;
        socket.join(`tavla:${tableId}`);
        clearBotTimer(table);
        scheduleBotIfNeeded(io, table);
        socket.emit('tavla:state', publicState(table));
    });

    socket.on('tavla:roll', ({ tableId } = {}) => {
        const table = tables.get(tableId);
        const idx = table?.players.findIndex(p => p.userId === verifiedUserId);
        if (!table || idx === -1 || idx === undefined) return;
        try { requestRoll(io, table, idx); } catch (e) { socket.emit('tavla:error', { message: e.message }); }
    });

    socket.on('tavla:move', ({ tableId, from, to, die } = {}) => {
        const table = tables.get(tableId);
        const idx = table?.players.findIndex(p => p.userId === verifiedUserId);
        if (!table || idx === -1 || idx === undefined) return;
        try { applyMove(io, table, idx, { from, to, die }); } catch (e) { socket.emit('tavla:error', { message: e.message }); }
    });

    socket.on('tavla:leaveTable', ({ tableId } = {}) => {
        const table = tables.get(tableId);
        const idx = table?.players.findIndex(p => p.userId === verifiedUserId);
        if (!table || idx === -1 || idx === undefined) return;
        table.players[idx].connected = false;
        broadcastState(io, table);
        scheduleBotIfNeeded(io, table);
    });

    socket.on('disconnect', () => {
        const qIdx = queue.findIndex(q => q.userId === verifiedUserId);
        if (qIdx !== -1) queue.splice(qIdx, 1);
        const tableId = verifiedUserId && userTableMap.get(verifiedUserId);
        if (!tableId) return;
        const table = tables.get(tableId);
        const idx = table?.players.findIndex(p => p.userId === verifiedUserId);
        if (table && idx !== -1 && idx !== undefined && table.players[idx].socketId === socket.id) {
            table.players[idx].connected = false;
            broadcastState(io, table);
            scheduleBotIfNeeded(io, table);
        }
    });
}
