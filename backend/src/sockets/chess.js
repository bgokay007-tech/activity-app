import jwt from 'jsonwebtoken';
import { Chess } from 'chess.js';
import { JWT_SECRET } from '../config/env.js';

// Sunucu tarafli (hile yapilamaz) 2 kisilik Satranc motoru — Tavla/Batak ile ayni
// mimari desen: bellekte tutulan masa durumu, JWT ile dogrulanan kimlik, eslestirme
// kuyrugu + zorluk seviyeli bot secenegi, kopan oyuncu icin yedek bot. Hamle
// legalligi tamamen chess.js kutuphanesiyle sunucuda dogrulanir (istemci sadece
// gorsel amacli kendi legal hamlelerini hesaplar, sunucu asla istemciye guvenmez).

const BOT_TURN_DELAY_MS = 900;
const BOT_DELAY_MS = 2500;
const BOT_NAMES = { easy: 'Kolay', medium: 'Orta', hard: 'Zor' };

const PIECE_VALUE = { p: 1, n: 3, b: 3, r: 5, q: 9, k: 0 };

const tables = new Map();
const queue = [];
const userTableMap = new Map();

function publicState(table) {
    return {
        tableId: table.id,
        phase: table.phase,
        players: table.players.map(p => ({ userId: p.userId, username: p.username, connected: p.connected, isBot: !!p.isBot })),
        fen: table.chess.fen(),
        turn: table.chess.turn() === 'w' ? 0 : 1,
        inCheck: table.chess.isCheck(),
        lastMove: table.lastMove || null,
        history: table.chess.history(),
        winner: table.winner ?? null,
        winReason: table.winReason ?? null,
    };
}

function broadcastState(io, table) {
    io.to(`chess:${table.id}`).emit('chess:state', publicState(table));
}

function clearBotTimer(table) {
    if (table.botTimer) { clearTimeout(table.botTimer); table.botTimer = null; }
}

function destroyTable(tableId) {
    const table = tables.get(tableId);
    if (!table) return;
    clearBotTimer(table);
    table.players.forEach(p => userTableMap.delete(p.userId));
    tables.delete(tableId);
}

function finishGame(io, table, winner, reason) {
    table.phase = 'finished';
    table.winner = winner; // 0 | 1 | 'draw'
    table.winReason = reason;
    clearBotTimer(table);
    io.to(`chess:${table.id}`).emit('chess:gameEnd', { winner, reason });
    broadcastState(io, table);
    setTimeout(() => destroyTable(table.id), 30000);
}

function checkGameOver(io, table) {
    const c = table.chess;
    if (!c.isGameOver()) return false;
    const justMoved = c.turn() === 'w' ? 1 : 0; // sira artik rakipte, o yuzden hamleyi yapan diger taraf
    if (c.isCheckmate()) { finishGame(io, table, justMoved, 'checkmate'); return true; }
    if (c.isStalemate()) { finishGame(io, table, 'draw', 'stalemate'); return true; }
    if (c.isThreefoldRepetition()) { finishGame(io, table, 'draw', 'repetition'); return true; }
    if (c.isInsufficientMaterial()) { finishGame(io, table, 'draw', 'insufficient_material'); return true; }
    if (c.isDraw()) { finishGame(io, table, 'draw', 'fifty_move'); return true; }
    return true;
}

function applyMove(io, table, player, { from, to, promotion }) {
    if (table.phase !== 'playing') throw new Error('Oyun bitti');
    const expectedTurn = table.chess.turn() === 'w' ? 0 : 1;
    if (expectedTurn !== player) throw new Error('Sıra sende değil');
    let result;
    try {
        result = table.chess.move({ from, to, promotion: promotion || 'q' });
    } catch {
        throw new Error('Geçersiz hamle');
    }
    table.lastMove = { from: result.from, to: result.to, san: result.san };
    if (checkGameOver(io, table)) return;
    broadcastState(io, table);
    scheduleBotIfNeeded(io, table);
}

function resign(io, table, player) {
    if (table.phase !== 'playing') return;
    const winner = player === 0 ? 1 : 0;
    finishGame(io, table, winner, 'resign');
}

// ── Bot yapay zekasi (1 hamlelik acgozlu degerlendirme + rastgelelik) ──────────
function evaluateBoardAfterMove(chess, move) {
    let score = Math.random() * 0.7;
    if (move.captured) score += PIECE_VALUE[move.captured] * 2;
    if (move.san?.includes('+')) score += 1.5; // sah cekme
    if (move.san?.includes('#')) score += 100; // mat
    if (move.promotion) score += PIECE_VALUE[move.promotion] * 1.5;
    // merkez kontrolu icin hafif bonus
    const centerSquares = ['d4', 'd5', 'e4', 'e5'];
    if (centerSquares.includes(move.to)) score += 0.4;
    return score;
}

function chooseBotMove(table, difficulty) {
    const moves = table.chess.moves({ verbose: true });
    if (moves.length === 0) return null;
    if (difficulty === 'easy') return moves[Math.floor(Math.random() * moves.length)];
    let best = moves[0], bestScore = -Infinity;
    for (const m of moves) {
        const sc = evaluateBoardAfterMove(table.chess, m) + (difficulty === 'hard' ? 0 : (Math.random() * 2 - 1));
        if (sc > bestScore) { bestScore = sc; best = m; }
    }
    return best;
}

function scheduleBotIfNeeded(io, table) {
    clearBotTimer(table);
    if (!tables.has(table.id)) return;
    if (table.phase !== 'playing') return;
    const actingPlayer = table.chess.turn() === 'w' ? 0 : 1;
    const info = table.players[actingPlayer];
    if (!info) return;
    if (!info.isBot && info.connected) return;
    const delay = info.isBot ? BOT_TURN_DELAY_MS : BOT_DELAY_MS;
    table.botTimer = setTimeout(() => runBotAction(io, table, actingPlayer), delay);
}

function runBotAction(io, table, player) {
    const difficulty = table.players[player]?.difficulty || 'medium';
    try {
        const move = chooseBotMove(table, difficulty);
        if (!move) return; // checkGameOver zaten yakalamis olmali
        applyMove(io, table, player, { from: move.from, to: move.to, promotion: move.promotion });
    } catch (e) {
        console.error('chess bot hamlesi başarısız:', e.message);
    }
}

function newTableBase(id) {
    return {
        id,
        chess: new Chess(),
        lastMove: null,
        phase: 'playing',
        winner: null,
        winReason: null,
        botTimer: null,
    };
}

function createTable(io, players) {
    const id = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    // Beyaz/siyah rastgele dagitilir ki her zaman ayni kisi baslamasin
    const ordered = Math.random() < 0.5 ? players : [players[1], players[0]];
    const table = {
        ...newTableBase(id),
        players: ordered.map(p => ({ userId: p.userId, username: p.username, socketId: p.socket.id, connected: true, isBot: false })),
    };
    tables.set(id, table);
    ordered.forEach(p => {
        userTableMap.set(p.userId, id);
        p.socket.join(`chess:${id}`);
    });
    io.to(`chess:${id}`).emit('chess:matched', {
        tableId: id,
        players: table.players.map(p => ({ userId: p.userId, username: p.username, isBot: false })),
    });
    broadcastState(io, table);
    return table;
}

function createBotTable(io, requester, difficulty) {
    const id = `ch_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const botLabel = `🤖 Bot (${BOT_NAMES[difficulty]})`;
    const requesterFirst = Math.random() < 0.5;
    const human = { userId: requester.userId, username: requester.username, socketId: requester.socket.id, connected: true, isBot: false };
    const bot = { userId: null, username: botLabel, socketId: null, connected: true, isBot: true, difficulty };
    const table = {
        ...newTableBase(id),
        players: requesterFirst ? [human, bot] : [bot, human],
    };
    tables.set(id, table);
    userTableMap.set(requester.userId, id);
    requester.socket.join(`chess:${id}`);
    io.to(`chess:${id}`).emit('chess:matched', {
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

export function registerChessHandlers(io, socket) {
    let verifiedUserId = null;
    let username = 'Oyuncu';
    try {
        const token = socket.handshake.auth?.token;
        if (token) {
            const decoded = jwt.verify(token, JWT_SECRET);
            verifiedUserId = decoded.userId;
        }
    } catch { /* token yoksa/geçersizse satranç özellikleri kullanılamaz */ }

    socket.on('chess:setUsername', (name) => { username = String(name || '').slice(0, 40) || 'Oyuncu'; });

    socket.on('chess:findMatch', () => {
        if (!verifiedUserId) return socket.emit('chess:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId)) return socket.emit('chess:error', { message: 'Zaten bir masadasın' });
        if (queue.some(q => q.userId === verifiedUserId)) return;
        queue.push({ userId: verifiedUserId, username, socket });
        socket.emit('chess:queued', { position: queue.length });
        tryMatch(io);
    });

    socket.on('chess:playVsBots', ({ difficulty } = {}) => {
        if (!verifiedUserId) return socket.emit('chess:error', { message: 'Oturum doğrulanamadı' });
        if (userTableMap.has(verifiedUserId)) return socket.emit('chess:error', { message: 'Zaten bir masadasın' });
        const diff = ['easy', 'medium', 'hard'].includes(difficulty) ? difficulty : 'medium';
        createBotTable(io, { userId: verifiedUserId, username, socket }, diff);
    });

    socket.on('chess:cancelFindMatch', () => {
        const idx = queue.findIndex(q => q.userId === verifiedUserId);
        if (idx !== -1) queue.splice(idx, 1);
    });

    socket.on('chess:getState', ({ tableId } = {}) => {
        const table = tables.get(tableId);
        if (!table || !verifiedUserId) return;
        const idx = table.players.findIndex(p => p.userId === verifiedUserId);
        if (idx === -1) return;
        table.players[idx].connected = true;
        table.players[idx].socketId = socket.id;
        socket.join(`chess:${tableId}`);
        clearBotTimer(table);
        scheduleBotIfNeeded(io, table);
        socket.emit('chess:state', publicState(table));
    });

    socket.on('chess:move', ({ tableId, from, to, promotion } = {}) => {
        const table = tables.get(tableId);
        const idx = table?.players.findIndex(p => p.userId === verifiedUserId);
        if (!table || idx === -1 || idx === undefined) return;
        try { applyMove(io, table, idx, { from, to, promotion }); } catch (e) { socket.emit('chess:error', { message: e.message }); }
    });

    socket.on('chess:resign', ({ tableId } = {}) => {
        const table = tables.get(tableId);
        const idx = table?.players.findIndex(p => p.userId === verifiedUserId);
        if (!table || idx === -1 || idx === undefined) return;
        resign(io, table, idx);
    });

    socket.on('chess:leaveTable', ({ tableId } = {}) => {
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
