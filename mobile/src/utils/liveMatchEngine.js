// Canlı maç takibi (saatten gelen ya da telefondan manuel dokunulan) için ortak motor.
// Hangi kaynaktan gelirse gelsin (Wear OS saati, telefon-içi "Ben/Rakip" dokunma, ileride
// Apple Watch) aynı PointLog formatına indirgenir; maç bitince deriveStats() bu log'dan
// backend'e gönderilecek ÖZET stats objesini üretir (bkz. schema.prisma'daki score.stats
// yorumu). Ham PointLog HİÇBİR ZAMAN backend'e gönderilmez, sadece bu türetilmiş özet.
//
// side her zaman 'A' (ilanı açan/kurucu taraf) veya 'B' (rakip taraf) — mobile tarafında
// çağıran kod A/B'yi sender/opponent'a çevirir.

export const RACKET_SPORTS = new Set(['tennis', 'padel', 'table_tennis', 'badminton']);
export const RALLY_RACKET_SPORTS = new Set(['table_tennis', 'badminton']); // deuce/avantaj yok, direkt sayı
export const VOLLEYBALL_SPORTS = new Set(['volleyball']);
export const BASKETBALL_SPORTS = new Set(['basketball']);

export function sportProfile(sport) {
    if (RACKET_SPORTS.has(sport)) return 'racket';
    if (VOLLEYBALL_SPORTS.has(sport)) return 'volleyball';
    if (BASKETBALL_SPORTS.has(sport)) return 'basketball';
    return null;
}

// ─── Ortak PointLog yardımcıları ───────────────────────────────────────────────
// log: [{ts, event:'POINT'|'GAME'|'SET'|'QUARTER', side, server?, points?}]
function pushEvent(state, event, extra = {}) {
    state.log.push({ ts: Date.now(), event, ...extra });
}

// ─── Raket sporları (tenis/padel/masa tenisi/badminton) ────────────────────────
// config: { sport, padelSimple?: bool, setsToWin: 2 (best-of-3) | 3 (best-of-5), rallyTarget?: 21|11 }
export function createRacketMatch({ sport, padelSimple = false, setsToWin = 2, initialServer = 'A' }) {
    const isRally = RALLY_RACKET_SPORTS.has(sport) || (sport === 'padel' && padelSimple);
    const rallyTarget = sport === 'table_tennis' ? 11 : sport === 'badminton' ? 21 : 21; // padel simple: 21 varsayılan
    return {
        sport, profile: 'racket', isRally, rallyTarget, setsToWin,
        pointsA: 0, pointsB: 0, gamesA: 0, gamesB: 0, setsA: 0, setsB: 0,
        currentSetGames: [], // tamamlanan setlerin [gamesA, gamesB] çiftleri
        currentGameServer: initialServer, // sadece deuce/avantaj modunda (oyun bazlı rotasyon)
        pointServer: initialServer, // sadece rally modunda (sayı bazlı rotasyon)
        pointsPlayedInGame: 0, // rally modunda servis rotasyonu için
        matchWinner: null,
        log: [],
    };
}

function racketNextServerAfterPoint(state, winnerSide) {
    if (state.sport === 'table_tennis') {
        // Her 2 sayıda bir servis değişir (kimin kazandığından bağımsız); 10-10'dan sonra her sayıda.
        const deuce = state.pointsA >= 10 && state.pointsB >= 10;
        state.pointsPlayedInGame += 1;
        const switchEvery = deuce ? 1 : 2;
        if (state.pointsPlayedInGame % switchEvery === 0) {
            state.pointServer = state.pointServer === 'A' ? 'B' : 'A';
        }
    } else {
        // Badminton (ve padel-simple): sayıyı kazanan taraf servis eder (side-out kuralı).
        state.pointServer = winnerSide;
    }
}

// Bir sayı işlenir — deuce/avantaj (tenis/padel klasik) veya rally-point (masa tenisi/badminton/padel-simple).
export function racketRecordPoint(state, side) {
    if (state.matchWinner) return state;
    const server = state.isRally ? state.pointServer : state.currentGameServer;
    pushEvent(state, 'POINT', { side, server });

    if (state.isRally) {
        racketRecordRallyPoint(state, side);
    } else {
        racketRecordDeucePoint(state, side);
    }
    return state;
}

function racketRecordRallyPoint(state, side) {
    if (side === 'A') state.pointsA += 1; else state.pointsB += 1;
    racketNextServerAfterPoint(state, side);
    const target = state.rallyTarget;
    const hi = Math.max(state.pointsA, state.pointsB), lo = Math.min(state.pointsA, state.pointsB);
    const cap = state.sport === 'badminton' ? target + 9 : Infinity; // badminton: 30'da biter (fark şartı olmadan)
    const gameOver = (hi >= target && hi - lo >= 2) || hi >= cap;
    if (gameOver) racketCompleteSet(state, state.pointsA > state.pointsB ? 'A' : 'B');
}

function racketRecordDeucePoint(state, side) {
    // Klasik tenis/padel sayı etiketleri: 0/15/30/40/AD — burada sadece iç sayaç tutuluyor,
    // etiketleme mobile UI'da (mevcut wear payload'ındaki pointLabel mantığına benzer) yapılabilir.
    const server = state.currentGameServer;
    const receiver = server === 'A' ? 'B' : 'A';
    const receiverPtsBefore = receiver === 'A' ? state.pointsA : state.pointsB;
    const serverPtsBefore = server === 'A' ? state.pointsA : state.pointsB;
    // Break point var mı: rakip (receiver) bu sayıyı kazanırsa oyunu kazanacak mı?
    const isBreakPoint = side === receiver && (receiverPtsBefore + 1 >= 4) && (receiverPtsBefore + 1 - serverPtsBefore >= 2);

    if (side === 'A') state.pointsA += 1; else state.pointsB += 1;
    const a = state.pointsA, b = state.pointsB;
    const leader = a > b ? 'A' : b > a ? 'B' : null;
    const gameOver = leader && ((Math.max(a, b) >= 4 && Math.abs(a - b) >= 2));

    if (isBreakPoint) {
        pushEvent(state, 'BREAK_POINT', { side: receiver, server, outcome: gameOver ? 'CONVERTED' : 'SAVED' });
    }

    if (gameOver) {
        const wasBreak = leader !== server;
        pushEvent(state, 'GAME', { side: leader, brokeServe: wasBreak, server });
        if (leader === 'A') state.gamesA += 1; else state.gamesB += 1;
        state.pointsA = 0; state.pointsB = 0;
        state.currentGameServer = server === 'A' ? 'B' : 'A';
        racketCheckSetOver(state);
    }
}

function racketCheckSetOver(state) {
    const ga = state.gamesA, gb = state.gamesB;
    const hi = Math.max(ga, gb), lo = Math.min(ga, gb);
    // 6 oyuna en az 2 fark, ya da 7-6 (tiebreak varsayımı basitleştirilmiş — 7-5/7-6 ile biter)
    const setOver = (hi >= 6 && hi - lo >= 2) || hi === 7;
    if (setOver) racketCompleteSet(state, ga > gb ? 'A' : 'B');
}

function racketCompleteSet(state, winnerSide) {
    // Rally modunda (masa tenisi/badminton/padel-simple) "set" doğrudan bu fonksiyonla,
    // deuce modunda (tenis/klasik padel) racketCheckSetOver üzerinden çağrılır.
    pushEvent(state, 'SET', { side: winnerSide });
    state.currentSetGames.push([state.gamesA, state.gamesB, state.pointsA, state.pointsB]);
    if (winnerSide === 'A') state.setsA += 1; else state.setsB += 1;
    state.pointsA = 0; state.pointsB = 0; state.gamesA = 0; state.gamesB = 0;
    if (state.setsA >= state.setsToWin) state.matchWinner = 'A';
    else if (state.setsB >= state.setsToWin) state.matchWinner = 'B';
}

// ─── Voleybol ───────────────────────────────────────────────────────────────
export function createVolleyballMatch({ setsToWin = 3, initialServer = 'A' } = {}) {
    return {
        sport: 'volleyball', profile: 'volleyball', setsToWin,
        pointsA: 0, pointsB: 0, setsA: 0, setsB: 0,
        currentSetPoints: [],
        pointServer: initialServer,
        matchWinner: null,
        log: [],
    };
}

export function volleyballRecordPoint(state, side) {
    if (state.matchWinner) return state;
    const server = state.pointServer;
    pushEvent(state, 'POINT', { side, server });
    if (side === 'A') state.pointsA += 1; else state.pointsB += 1;
    state.pointServer = side; // rally-point: sayıyı kazanan bir sonrakinde servis eder
    const isDeciding = state.setsA + state.setsB === state.setsToWin * 2 - 2;
    const target = isDeciding ? 15 : 25;
    const hi = Math.max(state.pointsA, state.pointsB), lo = Math.min(state.pointsA, state.pointsB);
    if (hi >= target && hi - lo >= 2) {
        const winnerSide = state.pointsA > state.pointsB ? 'A' : 'B';
        pushEvent(state, 'SET', { side: winnerSide });
        state.currentSetPoints.push([state.pointsA, state.pointsB]);
        if (winnerSide === 'A') state.setsA += 1; else state.setsB += 1;
        state.pointsA = 0; state.pointsB = 0;
        if (state.setsA >= state.setsToWin) state.matchWinner = 'A';
        else if (state.setsB >= state.setsToWin) state.matchWinner = 'B';
    }
    return state;
}

// ─── Basketbol ────────────────────────────────────────────────────────────────
export function createBasketballMatch({ totalQuarters = 4 } = {}) {
    return {
        sport: 'basketball', profile: 'basketball', totalQuarters,
        quarter: 1, quarterScores: [], // tamamlanan çeyreklerin [a,b] skorları
        pointsA: 0, pointsB: 0, // o anki çeyreğin skoru
        totalA: 0, totalB: 0,
        matchWinner: null,
        log: [],
    };
}

export function basketballRecordPoints(state, side, points) {
    if (state.matchWinner) return state;
    pushEvent(state, 'POINT', { side, points });
    if (side === 'A') { state.pointsA += points; state.totalA += points; }
    else { state.pointsB += points; state.totalB += points; }
    return state;
}

export function basketballEndQuarter(state) {
    if (state.matchWinner) return state;
    pushEvent(state, 'QUARTER', { side: null });
    state.quarterScores.push([state.pointsA, state.pointsB]);
    state.pointsA = 0; state.pointsB = 0;
    if (state.quarter >= state.totalQuarters) {
        // Uzatma yoksa berabere kalmamalı — eşitlikte maç kapatılmaz, ekstra çeyrek eklenip devam edilebilir
        if (state.totalA !== state.totalB) {
            state.matchWinner = state.totalA > state.totalB ? 'A' : 'B';
        } else {
            state.totalQuarters += 1; // uzatma
        }
    }
    state.quarter += 1;
    return state;
}

export function basketballFinishMatch(state) {
    // Maç manuel olarak sonlandırılırsa (kullanıcı "Maçı Bitir"e basarsa) yarım kalan çeyrek de kapatılır.
    if (state.pointsA > 0 || state.pointsB > 0) {
        state.quarterScores.push([state.pointsA, state.pointsB]);
        state.pointsA = 0; state.pointsB = 0;
    }
    if (!state.matchWinner) state.matchWinner = state.totalA >= state.totalB ? 'A' : 'B';
    return state;
}

// ─── deriveStats — PointLog'dan backend'e gidecek özet ────────────────────────
export function deriveStats(state) {
    if (state.profile === 'racket') return deriveRacketStats(state);
    if (state.profile === 'volleyball') return deriveVolleyballStats(state);
    if (state.profile === 'basketball') return deriveBasketballStats(state);
    return null;
}

function deriveRacketStats(state) {
    const points = state.log.filter(e => e.event === 'POINT');
    const games = state.log.filter(e => e.event === 'GAME');
    const totalA = points.filter(p => p.side === 'A').length;
    const totalB = points.filter(p => p.side === 'B').length;

    let longestGamePoints = 0;
    let curGameLen = 0;
    for (const e of state.log) {
        if (e.event === 'POINT') curGameLen += 1;
        else if (e.event === 'GAME' || e.event === 'SET') { longestGamePoints = Math.max(longestGamePoints, curGameLen); curGameLen = 0; }
    }
    longestGamePoints = Math.max(longestGamePoints, curGameLen);

    const base = {
        total: points.length,
        wonBySide: { A: totalA, B: totalB },
        pointWinRateA: points.length > 0 ? +(totalA / points.length * 100).toFixed(1) : null,
    };

    if (state.isRally) {
        // Rally-point (masa tenisi/badminton/padel-simple): servis/return sayı bazında,
        // "servis oyunu"/"break point" kavramı yok (her sayı server'dan bağımsız kazanılabilir).
        const servedA = points.filter(p => p.server === 'A');
        const servedB = points.filter(p => p.server === 'B');
        return {
            ...base,
            serve: {
                servicePointsWonA: servedA.filter(p => p.side === 'A').length,
                servicePointsTotalA: servedA.length,
                servicePointsWonB: servedB.filter(p => p.side === 'B').length,
                servicePointsTotalB: servedB.length,
            },
            flow: { recordedGames: games.length, longestGamePoints, avgPointsPerGame: games.length > 0 ? +(points.length / (games.length || 1)).toFixed(1) : null },
        };
    }

    // Klasik tenis/padel (deuce/avantaj): servis oyunu + gerçek break point istatistikleri
    // (racketRecordDeucePoint'te her break-point anı ayrı bir BREAK_POINT olayı olarak loglanır).
    const servedByA = games.filter(g => g.server === 'A');
    const servedByB = games.filter(g => g.server === 'B');
    const breaksOfA = servedByA.filter(g => g.brokeServe); // A servisteyken B kazandı (A'nın servisi kırıldı)
    const breaksOfB = servedByB.filter(g => g.brokeServe);
    const breakPointEvents = state.log.filter(e => e.event === 'BREAK_POINT');
    const bpFacedByA = breakPointEvents.filter(e => e.server === 'A'); // A servisteyken B'nin break point'leri
    const bpFacedByB = breakPointEvents.filter(e => e.server === 'B');
    return {
        ...base,
        serve: {
            serviceGamesWonA: servedByA.filter(g => !g.brokeServe).length,
            serviceGamesTotalA: servedByA.length,
            serviceGamesWonB: servedByB.filter(g => !g.brokeServe).length,
            serviceGamesTotalB: servedByB.length,
            returnGamesWonA: breaksOfB.length, // A, B servisindeyken kazandı
            returnGamesTotalA: servedByB.length,
            returnGamesWonB: breaksOfA.length,
            returnGamesTotalB: servedByA.length,
        },
        breakPoints: {
            facedA: bpFacedByA.length,
            savedA: bpFacedByA.filter(e => e.outcome === 'SAVED').length,
            facedB: bpFacedByB.length,
            savedB: bpFacedByB.filter(e => e.outcome === 'SAVED').length,
            opportunitiesA: bpFacedByB.length, // A'nın return'de yakaladığı break point fırsatları (B servisindeyken)
            convertedByA: bpFacedByB.filter(e => e.outcome === 'CONVERTED').length,
            opportunitiesB: bpFacedByA.length,
            convertedByB: bpFacedByA.filter(e => e.outcome === 'CONVERTED').length,
        },
        flow: { recordedGames: games.length, longestGamePoints, avgPointsPerGame: games.length > 0 ? +(points.length / games.length).toFixed(1) : null },
    };
}

function deriveVolleyballStats(state) {
    const points = state.log.filter(e => e.event === 'POINT');
    const sets = state.log.filter(e => e.event === 'SET');
    const totalA = points.filter(p => p.side === 'A').length;
    const totalB = points.filter(p => p.side === 'B').length;
    const servedA = points.filter(p => p.server === 'A');
    const servedB = points.filter(p => p.server === 'B');

    let longestSetPoints = 0, curLen = 0, biggestLead = 0, a = 0, b = 0;
    for (const e of state.log) {
        if (e.event === 'POINT') {
            curLen += 1;
            if (e.side === 'A') a += 1; else b += 1;
            biggestLead = Math.max(biggestLead, Math.abs(a - b));
        } else if (e.event === 'SET') { longestSetPoints = Math.max(longestSetPoints, curLen); curLen = 0; a = 0; b = 0; }
    }
    longestSetPoints = Math.max(longestSetPoints, curLen);

    return {
        total: points.length,
        wonBySide: { A: totalA, B: totalB },
        pointWinRateA: points.length > 0 ? +(totalA / points.length * 100).toFixed(1) : null,
        serve: {
            servicePointsWonA: servedA.filter(p => p.side === 'A').length,
            servicePointsTotalA: servedA.length,
            servicePointsWonB: servedB.filter(p => p.side === 'B').length,
            servicePointsTotalB: servedB.length,
        },
        flow: { recordedSets: sets.length, longestSetPoints, biggestLead },
    };
}

function deriveBasketballStats(state) {
    const points = state.log.filter(e => e.event === 'POINT');

    let biggestLead = 0, a = 0, b = 0;
    let longestRunSide = null, longestRun = 0, curRunSide = null, curRun = 0;
    for (const e of points) {
        if (e.side === 'A') a += e.points; else b += e.points;
        biggestLead = Math.max(biggestLead, Math.abs(a - b));
        if (e.side === curRunSide) curRun += e.points; else { curRunSide = e.side; curRun = e.points; }
        if (curRun > longestRun) { longestRun = curRun; longestRunSide = curRunSide; }
    }

    return {
        total: state.totalA + state.totalB,
        wonBySide: { A: state.totalA, B: state.totalB },
        quarters: state.quarterScores,
        flow: { biggestLead, longestRun, longestRunSide },
    };
}
