/**
 * Swiss / Double-elimination / Americano turnuva motorları.
 * Saf fonksiyonlar — DB yok. Controller eşleştirme + skor ilerletmede bunları çağırır.
 *
 * Engine type kodları (Tournament.type):
 *   '5' Swiss
 *   '6' Double elimination
 *   '7' Americano / sosyal çiftler
 */

export function nextPow2(n) {
    let p = 1;
    while (p < n) p *= 2;
    return p;
}

export function swissRoundCount(playerCount, requested = null) {
    const n = Math.max(2, playerCount | 0);
    const def = Math.max(1, Math.ceil(Math.log2(n)));
    if (requested == null || !Number.isFinite(Number(requested))) return def;
    return Math.min(Math.max(1, parseInt(requested, 10)), Math.max(1, n - 1));
}

export function americanoRoundCount(playerCount, requested = null) {
    const n = Math.max(4, playerCount | 0);
    // Klasik sosyal Americano: herkes çoğu kişiyle oynamış olsun diye ~n-1, üst sınır 7.
    const def = Math.min(7, Math.max(3, n - 1));
    if (requested == null || !Number.isFinite(Number(requested))) return def;
    return Math.min(Math.max(1, parseInt(requested, 10)), Math.max(1, n - 1));
}

/** İsim / id alanları için ortak satır. */
function sideName(p) {
    return p?.fullName || p?.username || p?.name || '?';
}

function pairKey(a, b) {
    return [a, b].sort().join('|');
}

/**
 * Swiss: mevcut puan/averaja göre eşleştir (Dutch-benzeri).
 * players: [{ id, fullName?, username?, skillRating?, points?, gamesWon?, gamesLost? }]
 * playedPairKeys: ['id1|id2', ...]
 * returns: { pairs: [{ p1, p2 }], bye: player|null }
 */
export function pairSwissRound(players, playedPairKeys = []) {
    const played = new Set(playedPairKeys);
    const sorted = [...players].sort((a, b) => {
        const pa = a.points || 0, pb = b.points || 0;
        if (pb !== pa) return pb - pa;
        const ga = (a.gamesWon || 0) - (a.gamesLost || 0);
        const gb = (b.gamesWon || 0) - (b.gamesLost || 0);
        if (gb !== ga) return gb - ga;
        return (b.skillRating || 0) - (a.skillRating || 0);
    });

    let bye = null;
    const pool = [...sorted];
    if (pool.length % 2 === 1) {
        // Bye: en düşük sıralı, henüz bye almamış tercih.
        for (let i = pool.length - 1; i >= 0; i--) {
            if (!pool[i].hadBye) {
                bye = pool.splice(i, 1)[0];
                break;
            }
        }
        if (!bye) bye = pool.pop();
    }

    const byId = new Map(pool.map(p => [p.id, p]));
    const ids = pool.map(p => p.id);

    const opponents = (id, remaining) => remaining
        .filter(oid => oid !== id && !played.has(pairKey(id, oid)))
        .sort((a, b) => {
            const da = Math.abs((byId.get(a).points || 0) - (byId.get(id).points || 0));
            const db = Math.abs((byId.get(b).points || 0) - (byId.get(id).points || 0));
            if (da !== db) return da - db;
            return Math.abs((byId.get(a).skillRating || 0) - (byId.get(id).skillRating || 0))
                - Math.abs((byId.get(b).skillRating || 0) - (byId.get(id).skillRating || 0));
        });

    function search(remaining) {
        if (remaining.length === 0) return [];
        if (remaining.length === 1) return null;
        // En kısıtlı oyuncu önce
        let pivot = remaining[0], bestLen = Infinity;
        for (const id of remaining) {
            const len = opponents(id, remaining).length;
            if (len < bestLen) { bestLen = len; pivot = id; }
        }
        const cands = opponents(pivot, remaining);
        // Önce rematch'siz dene; olmazsa (nadir) rematch'e izin ver
        const tryLists = [cands, remaining.filter(x => x !== pivot)];
        for (const list of tryLists) {
            for (const opp of list) {
                const rest = remaining.filter(x => x !== pivot && x !== opp);
                const sub = search(rest);
                if (sub) return [[pivot, opp], ...sub];
            }
        }
        return null;
    }

    let pairsIds = search(ids);
    if (!pairsIds) {
        // Son çare: sıralı komşu eşleştir
        pairsIds = [];
        const rem = [...ids];
        while (rem.length >= 2) {
            const a = rem.shift();
            const b = rem.shift();
            pairsIds.push([a, b]);
        }
    }

    return {
        pairs: pairsIds.map(([a, b]) => ({ p1: byId.get(a), p2: byId.get(b) })),
        bye,
    };
}

/** Swiss maç satırları (GROUP). Bye varsa BYE maçı (otomatik galibiyet). */
export function swissMatchesFromPairing(tournamentId, round, pairing, deadline = null) {
    const out = [];
    pairing.pairs.forEach((pair, idx) => {
        out.push({
            tournamentId,
            round,
            phase: 'GROUP',
            matchIndex: idx,
            p1Id: pair.p1.id,
            p1Name: sideName(pair.p1),
            p2Id: pair.p2.id,
            p2Name: sideName(pair.p2),
            status: 'PENDING',
            ...(deadline ? { deadline } : {}),
        });
    });
    if (pairing.bye) {
        out.push({
            tournamentId,
            round,
            phase: 'GROUP',
            matchIndex: pairing.pairs.length,
            p1Id: pairing.bye.id,
            p1Name: sideName(pairing.bye),
            p2Id: null,
            p2Name: null,
            status: 'BYE',
            winnerId: pairing.bye.id,
            score: { sets: [], winner: 'p1', bye: true, p1Sets: 1, p2Sets: 0, p1Games: 0, p2Games: 0 },
            ...(deadline ? { deadline } : {}),
        });
    }
    return out;
}

/**
 * Double-elim: kazananlar kurası — tek eleme ile aynı iskelet, phase=WINNERS.
 * Sonra LOSERS + GRAND_FINAL dinamik ilerletilir.
 */
export function buildWinnersBracket(players, tournamentId, startRound = 1) {
    const sorted = [...players].sort((a, b) => (b.skillRating || 0) - (a.skillRating || 0));
    const size = nextPow2(sorted.length);
    const totalRounds = Math.log2(size);
    const seeded = [...sorted, ...Array(size - sorted.length).fill(null)];
    const all = [];

    for (let i = 0; i < size / 2; i++) {
        const p1 = seeded[i], p2 = seeded[size - 1 - i];
        const isBye = !p1 || !p2;
        const real = p1 || p2;
        all.push({
            tournamentId,
            round: startRound,
            phase: 'WINNERS',
            matchIndex: i,
            p1Id: isBye ? null : p1?.id,
            p1Name: isBye ? null : sideName(p1),
            p2Id: isBye ? null : p2?.id,
            p2Name: isBye ? null : sideName(p2),
            status: isBye ? 'BYE' : 'PENDING',
            winnerId: isBye ? real?.id : null,
            ...(isBye && real ? { score: { sets: [], winner: p1 ? 'p1' : 'p2', bye: true, p1Sets: 1, p2Sets: 0, p1Games: 0, p2Games: 0 } } : {}),
        });
    }
    for (let r = 2; r <= totalRounds; r++) {
        const cnt = size / Math.pow(2, r);
        for (let i = 0; i < cnt; i++) {
            all.push({
                tournamentId,
                round: startRound + r - 1,
                phase: 'WINNERS',
                matchIndex: i,
                status: 'PENDING',
            });
        }
    }
    // Grand final maçları her iki şampiyon belli olunca dinamik oluşturulur (PENDING iskelet
    // turnuvayı erken "bekleyen maç var" diye açık tutmasın diye burada yok).
    return { matches: all, wbRounds: totalRounds, size };
}

/** WB maçından sonraki WB slotu. */
export function winnersNextSlot(match) {
    return {
        round: match.round + 1,
        matchIndex: Math.floor(match.matchIndex / 2),
        slot: match.matchIndex % 2 === 0 ? 'p1' : 'p2',
    };
}

/**
 * WB kaybedeni LB'ye yerleştirmek için hedef slot.
 * LB round numaralandırması:
 *   LB round 1 = WB round 1 kaybedenleri
 *   LB round 2 = LB1 kazananları × WB round 2 kaybedenleri
 *   LB round 3 = LB2 kazananları kendi aralarında
 *   … klasik “drop-down” deseni (power-of-2).
 *
 * fromWbRound: 1-based WB round (startRound’a göre göreli: match.round - startRound + 1)
 */
export function losersDropTarget(fromWbRound, fromMatchIndex, wbRounds) {
    // İlk düşüş: LB round = 1 (WB R1) veya 2*(fromWbRound-1) benzeri
    // Standart: WB round k loser → LB round (2*k - 1) for k>=1, with pairing fold.
    const lbRound = fromWbRound === 1 ? 1 : (2 * (fromWbRound - 1));
    // Eşleşme indeksi: WB bracket’ini yarıya katla
    const matchesInWbRound = Math.pow(2, wbRounds - fromWbRound);
    const lbMatchIndex = fromWbRound === 1
        ? Math.floor(fromMatchIndex / 2)
        : fromMatchIndex;
    // Slot: WB R1'de çiftler aynı LB maçına düşer (0,1→match0); sonraki düşüşlerde
    // genelde p2 (mevcut LB kazananı p1’de bekler).
    const slot = fromWbRound === 1
        ? (fromMatchIndex % 2 === 0 ? 'p1' : 'p2')
        : 'p2';
    return { round: lbRound, matchIndex: Math.min(lbMatchIndex, Math.max(0, matchesInWbRound / 2 - 1) || 0), slot };
}

/**
 * LB içi ilerleme: kazanan bir sonraki LB turuna.
 * Tek sayı LB turları (1,3,5…) çoğunlukla “drop-in” turlarıdır; çiftler kendi aralarında oynar.
 */
export function losersNextSlot(match, wbRounds) {
    const maxLbRound = 2 * (wbRounds - 1);
    if (match.round >= maxLbRound) {
        // LB şampiyonu → grand final p2
        return { phase: 'GRAND_FINAL', round: null, matchIndex: 0, slot: 'p2' };
    }
    const nextRound = match.round + 1;
    // Drop-in turundan sonra (tek→çift) aynı matchIndex; kendi araları turundan sonra yarıya in.
    const isDropInRound = match.round % 2 === 1;
    if (isDropInRound) {
        return { phase: 'LOSERS', round: nextRound, matchIndex: match.matchIndex, slot: 'p1' };
    }
    return {
        phase: 'LOSERS',
        round: nextRound,
        matchIndex: Math.floor(match.matchIndex / 2),
        slot: match.matchIndex % 2 === 0 ? 'p1' : 'p2',
    };
}

/**
 * Americano: bir tur için 2v2 eşleşmeleri.
 * history: { partners: Set|string[], opponents: Set|string[] } — 'a|b' anahtarları
 * returns: { courts: [{ a: [p,p], b: [p,p] }], sitOut: player[] }
 */
export function pairAmericanoRound(players, history = {}, round = 1) {
    const partnerSet = new Set(history.partners || []);
    const opponentSet = new Set(history.opponents || []);
    const n = players.length;
    if (n < 4) return { courts: [], sitOut: [...players] };

    // 4'ün katı olsun; fazla oyuncular sit-out (round ile rotate)
    const playCount = Math.floor(n / 4) * 4;
    const ordered = [...players].sort((a, b) => (b.skillRating || 0) - (a.skillRating || 0));
    // Sit-out rotasyonu
    const sitCount = n - playCount;
    const sitOut = [];
    const active = [];
    if (sitCount > 0) {
        const start = ((round - 1) * sitCount) % n;
        const sitIds = new Set();
        for (let i = 0; i < sitCount; i++) sitIds.add(ordered[(start + i) % n].id);
        for (const p of ordered) {
            if (sitIds.has(p.id)) sitOut.push(p);
            else active.push(p);
        }
    } else {
        active.push(...ordered);
    }

    // Circle / rotate partner method — sosyal Americano
    // Aktif oyuncuları round'a göre kaydır, sonra 4'lü gruplara böl.
    const rot = (round - 1) % Math.max(1, active.length);
    const rotated = [...active.slice(rot), ...active.slice(0, rot)];

    const courts = [];
    const usedPartners = [];
    const usedOpponents = [];

    for (let i = 0; i + 3 < rotated.length; i += 4) {
        const group = rotated.slice(i, i + 4);
        // Partner denemeleri: (0,1)vs(2,3), (0,2)vs(1,3), (0,3)vs(1,2)
        const layouts = [
            [[group[0], group[1]], [group[2], group[3]]],
            [[group[0], group[2]], [group[1], group[3]]],
            [[group[0], group[3]], [group[1], group[2]]],
        ];
        let best = layouts[0];
        let bestScore = -Infinity;
        for (const [a, b] of layouts) {
            const pkA = pairKey(a[0].id, a[1].id);
            const pkB = pairKey(b[0].id, b[1].id);
            const oppKeys = [
                pairKey(a[0].id, b[0].id), pairKey(a[0].id, b[1].id),
                pairKey(a[1].id, b[0].id), pairKey(a[1].id, b[1].id),
            ];
            let score = 0;
            if (!partnerSet.has(pkA)) score += 3;
            if (!partnerSet.has(pkB)) score += 3;
            for (const ok of oppKeys) if (!opponentSet.has(ok)) score += 1;
            // Yakın seviye bonus
            const avg = (arr) => (arr[0].skillRating || 0) + (arr[1].skillRating || 0);
            score -= Math.abs(avg(a) - avg(b)) * 0.01;
            if (score > bestScore) { bestScore = score; best = [a, b]; }
        }
        const [a, b] = best;
        courts.push({ a, b });
        usedPartners.push(pairKey(a[0].id, a[1].id), pairKey(b[0].id, b[1].id));
        usedOpponents.push(
            pairKey(a[0].id, b[0].id), pairKey(a[0].id, b[1].id),
            pairKey(a[1].id, b[0].id), pairKey(a[1].id, b[1].id),
        );
    }

    return {
        courts,
        sitOut,
        newPartners: usedPartners,
        newOpponents: usedOpponents,
    };
}

/** Americano bireysel sıralama — takım maçındaki oyunlar her iki partnere yazılır. */
export function computeAmericanoPlayerStats(players, matches, teamsById) {
    const stats = {};
    for (const p of players) {
        stats[p.id] = {
            userId: p.id,
            name: sideName(p),
            played: 0, won: 0, lost: 0,
            setsWon: 0, setsLost: 0,
            gamesWon: 0, gamesLost: 0,
            points: 0,
        };
    }
    for (const m of matches) {
        if (m.status !== 'COMPLETED' && m.status !== 'FORFEIT') continue;
        if (!m.score || !m.p1Id || !m.p2Id) continue;
        const t1 = teamsById[m.p1Id];
        const t2 = teamsById[m.p2Id];
        if (!t1 || !t2) continue;
        const p1ids = [t1.player1Id, t1.player2Id].filter(Boolean);
        const p2ids = [t2.player1Id, t2.player2Id].filter(Boolean);
        let p1s = 0, p2s = 0, p1g = 0, p2g = 0;
        for (const set of (m.score.sets || [])) {
            p1g += set.p1 || 0; p2g += set.p2 || 0;
            if ((set.p1 || 0) > (set.p2 || 0)) p1s++;
            else if ((set.p2 || 0) > (set.p1 || 0)) p2s++;
        }
        for (const uid of p1ids) {
            const s = stats[uid]; if (!s) continue;
            s.played++; s.setsWon += p1s; s.setsLost += p2s; s.gamesWon += p1g; s.gamesLost += p2g;
            s.points += p1g;
            if (m.score.winner === 'p1') s.won++; else if (m.score.winner === 'p2') s.lost++;
        }
        for (const uid of p2ids) {
            const s = stats[uid]; if (!s) continue;
            s.played++; s.setsWon += p2s; s.setsLost += p1s; s.gamesWon += p2g; s.gamesLost += p1g;
            s.points += p2g;
            if (m.score.winner === 'p2') s.won++; else if (m.score.winner === 'p1') s.lost++;
        }
    }
    return Object.values(stats).sort((a, b) => {
        if (b.points !== a.points) return b.points - a.points;
        if (b.won !== a.won) return b.won - a.won;
        const ga = a.gamesWon + a.gamesLost, gb = b.gamesWon + b.gamesLost;
        const aa = ga ? a.gamesWon / ga : 0, ab = gb ? b.gamesWon / gb : 0;
        return ab - aa;
    });
}

/** Swiss/standings için bye'ları da puanlayan yardımcı — controller computeStandings'e eklenir. */
export function applyByeToStandings(statsById, matches) {
    for (const m of matches) {
        if (m.status !== 'BYE' || m.phase !== 'GROUP' || !m.winnerId) continue;
        const s = statsById[m.winnerId];
        if (!s) continue;
        s.played++;
        s.won++;
        s.points += 3;
    }
}
