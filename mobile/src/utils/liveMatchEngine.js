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
// Tek telefon kamerasıyla otomatik hat yok; bu dallarda kullanıcı son 8 sn replay'den
// IN/OUT işaretler. Masa tenisi/badminton/basketbol çizgi itirazı bu üründe yok.
export const LINE_CALL_SPORTS = new Set(['tennis', 'padel', 'volleyball']);

export function sportProfile(sport) {
    if (RACKET_SPORTS.has(sport)) return 'racket';
    if (VOLLEYBALL_SPORTS.has(sport)) return 'volleyball';
    if (BASKETBALL_SPORTS.has(sport)) return 'basketball';
    return null;
}

// ─── Ortak PointLog yardımcıları ───────────────────────────────────────────────
// log: [{ts, event:'POINT'|'GAME'|'SET'|'QUARTER'|'LINE_CALL', side, server?, points?, verdict?}]
function pushEvent(state, event, extra = {}) {
    state.log.push({ ts: Date.now(), event, ...extra });
}

// Kamera replay'inden gelen manuel çizgi kararı. Sayıyı otomatik yazmaz — kullanıcı
// (telefon veya saat) hâlâ kimin kazandığını ayrıca işaretler. Ham log backend'e gitmez.
export function recordLineCall(state, verdict) {
    if (!state || (verdict !== 'IN' && verdict !== 'OUT')) return state;
    pushEvent(state, 'LINE_CALL', { verdict });
    return state;
}

// ─── Raket sporları (tenis/padel/masa tenisi/badminton) ────────────────────────
// config: { sport, padelSimple?: bool, setsToWin: 2 (best-of-3) | 3 (best-of-5), rallyTarget?: 21|11 }
export function createRacketMatch({ sport, padelSimple = false, setsToWin = 2, initialServer = 'A' }) {
    const isRally = RALLY_RACKET_SPORTS.has(sport) || (sport === 'padel' && padelSimple);
    const rallyTarget = sport === 'table_tennis' ? 11 : sport === 'badminton' ? 21 : 21; // padel simple: 21 varsayılan
    return {
        sport, profile: 'racket', isRally, rallyTarget, setsToWin, padelSimple, initialServer,
        pointsA: 0, pointsB: 0, gamesA: 0, gamesB: 0, setsA: 0, setsB: 0,
        currentSetGames: [], // tamamlanan setlerin [gamesA, gamesB] çiftleri
        currentGameServer: initialServer, // sadece deuce/avantaj modunda (oyun bazlı rotasyon)
        pointServer: initialServer, // sadece rally modunda (sayı bazlı rotasyon)
        pointsPlayedInGame: 0, // rally modunda servis rotasyonu için
        inTiebreak: false, // 6-6 sonrası 7 sayı (2 fark) tiebreak
        matchWinner: null,
        log: [],
    };
}

function racketConfigFrom(state) {
    return {
        sport: state.sport,
        padelSimple: !!state.padelSimple,
        setsToWin: state.setsToWin,
        initialServer: state.initialServer || 'A',
    };
}

function racketResetAndReplay(state, pointSides) {
    const fresh = createRacketMatch(racketConfigFrom(state));
    for (const side of pointSides) racketRecordPoint(fresh, side);
    Object.keys(state).forEach(k => { delete state[k]; });
    Object.assign(state, fresh);
    return state;
}

// Yanlış tıklama: o tarafın son sayısını (15/30/40/AD adımı) geri alır; arada rakip
// sayı almış olsa bile o tarafın son POINT'i log'dan çıkarılıp maç yeniden kurulur.
export function racketUndoPointForSide(state, side) {
    if (!state) return state;
    const points = state.log.filter(e => e.event === 'POINT');
    let lastIdx = -1;
    for (let i = points.length - 1; i >= 0; i--) {
        if (points[i].side === side) { lastIdx = i; break; }
    }
    if (lastIdx < 0) return state;
    return racketResetAndReplay(state, points.filter((_, i) => i !== lastIdx).map(p => p.side));
}

// Game − : o tarafın kazandığı son oyunu (ve o oyundan sonraki sayıları) geri alır.
export function racketUndoGameForSide(state, side) {
    if (!state) return state;
    const startG = side === 'A' ? state.gamesA : state.gamesB;
    const startS = side === 'A' ? state.setsA : state.setsB;
    if (startG === 0 && startS === 0) return state;
    const points = state.log.filter(e => e.event === 'POINT').map(p => p.side);
    for (let n = points.length; n >= 0; n--) {
        const tmp = createRacketMatch(racketConfigFrom(state));
        for (let i = 0; i < n; i++) racketRecordPoint(tmp, points[i]);
        const g = side === 'A' ? tmp.gamesA : tmp.gamesB;
        const s = side === 'A' ? tmp.setsA : tmp.setsB;
        if (s < startS || (s === startS && g < startG)) return racketResetAndReplay(state, points.slice(0, n));
    }
    return state;
}

// Set − : o tarafın kazandığı son seti geri alır.
export function racketUndoSetForSide(state, side) {
    if (!state) return state;
    const startS = side === 'A' ? state.setsA : state.setsB;
    if (startS === 0) return state;
    const points = state.log.filter(e => e.event === 'POINT').map(p => p.side);
    for (let n = points.length; n >= 0; n--) {
        const tmp = createRacketMatch(racketConfigFrom(state));
        for (let i = 0; i < n; i++) racketRecordPoint(tmp, points[i]);
        const s = side === 'A' ? tmp.setsA : tmp.setsB;
        if (s < startS) return racketResetAndReplay(state, points.slice(0, n));
    }
    return state;
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

function racketRecordTiebreakPoint(state, side) {
    if (side === 'A') state.pointsA += 1; else state.pointsB += 1;
    const a = state.pointsA, b = state.pointsB;
    const hi = Math.max(a, b), lo = Math.min(a, b);
    // Standart tiebreak: 7 sayı, en az 2 fark.
    if (hi >= 7 && hi - lo >= 2) {
        const winner = a > b ? 'A' : 'B';
        pushEvent(state, 'GAME', { side: winner, tiebreak: true, server: state.currentGameServer });
        if (winner === 'A') state.gamesA += 1; else state.gamesB += 1;
        state.inTiebreak = false;
        state.pointsA = 0; state.pointsB = 0;
        racketCompleteSet(state, winner);
    }
}

function racketRecordDeucePoint(state, side) {
    if (state.inTiebreak) {
        racketRecordTiebreakPoint(state, side);
        return;
    }
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
    // 6-6: tiebreak oyununa gir (sayılar 7'ye 2 fark, set 7-6 biter).
    if (ga === 6 && gb === 6) {
        state.inTiebreak = true;
        return;
    }
    // 6 oyuna en az 2 fark (6-4, 6-3…) ya da tiebreak sonrası 7-6.
    if ((hi >= 6 && hi - lo >= 2) || (hi === 7 && lo === 6)) {
        racketCompleteSet(state, ga > gb ? 'A' : 'B');
    }
}

function racketCompleteSet(state, winnerSide) {
    // Rally modunda (masa tenisi/badminton/padel-simple) "set" doğrudan bu fonksiyonla,
    // deuce modunda (tenis/klasik padel) racketCheckSetOver üzerinden çağrılır.
    pushEvent(state, 'SET', { side: winnerSide });
    state.currentSetGames.push([state.gamesA, state.gamesB, state.pointsA, state.pointsB]);
    if (winnerSide === 'A') state.setsA += 1; else state.setsB += 1;
    state.pointsA = 0; state.pointsB = 0; state.gamesA = 0; state.gamesB = 0;
    state.inTiebreak = false;
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
function deriveLineCalls(state) {
    const calls = state.log.filter(e => e.event === 'LINE_CALL');
    if (!calls.length) return undefined;
    const inn = calls.filter(c => c.verdict === 'IN').length;
    return { in: inn, out: calls.length - inn, total: calls.length };
}

export function deriveStats(state) {
    const stats = state.profile === 'racket' ? deriveRacketStats(state)
        : state.profile === 'volleyball' ? deriveVolleyballStats(state)
        : state.profile === 'basketball' ? deriveBasketballStats(state)
        : null;
    if (stats) {
        const lineCalls = deriveLineCalls(state);
        if (lineCalls) stats.lineCalls = lineCalls;
    }
    return stats;
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

const TENNIS_POINT_LABELS = ['0', '15', '30', '40'];

// Wear OS / Huawei bildirim metni — motor ham sayaç tutar, etiket burada üretilir.
export function racketPointLabel(engine, side) {
    const mine = side === 'A' ? engine.pointsA : engine.pointsB;
    const theirs = side === 'A' ? engine.pointsB : engine.pointsA;
    if (engine.isRally || engine.inTiebreak) return String(mine);
    if (mine >= 3 && theirs >= 3) {
        if (mine === theirs) return '40';
        if (mine === theirs + 1) return 'AD';
        return '40';
    }
    return TENNIS_POINT_LABELS[mine] ?? String(mine);
}

export function engineToWearScore(engine, sport) {
    if (!engine) return null;
    if (engine.profile === 'basketball') {
        return {
            sport,
            pointLabelA: String(engine.totalA),
            pointLabelB: String(engine.totalB),
            pointsA: engine.totalA,
            pointsB: engine.totalB,
            gamesA: 0,
            gamesB: 0,
            setsA: 0,
            setsB: 0,
            matchWinner: engine.matchWinner ?? null,
        };
    }
    const volleyball = engine.profile === 'volleyball';
    return {
        sport,
        pointLabelA: volleyball ? String(engine.pointsA) : racketPointLabel(engine, 'A'),
        pointLabelB: volleyball ? String(engine.pointsB) : racketPointLabel(engine, 'B'),
        pointsA: engine.pointsA,
        pointsB: engine.pointsB,
        gamesA: engine.gamesA ?? 0,
        gamesB: engine.gamesB ?? 0,
        setsA: engine.setsA,
        setsB: engine.setsB,
        matchWinner: engine.matchWinner ?? null,
    };
}
