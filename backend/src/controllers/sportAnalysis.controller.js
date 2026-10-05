import prisma from '../config/prisma.js';
import { UTR_SUBCATEGORIES, getDisplayRating, computeGamesRatio } from '../utils/utrRating.js';
import { computeRatingAccuracy } from '../utils/ratingAccuracy.js';

const HOUR_BUCKETS = [
    { key: 'morning',   from: 6,  to: 12 },
    { key: 'afternoon', from: 12, to: 17 },
    { key: 'evening',   from: 17, to: 21 },
    { key: 'night',     from: 21, to: 30 },
];

const ids = (arr) => (Array.isArray(arr) ? arr : []).filter(p => p?.id).map(p => p.id);

// Kurucu tarafı = ilan sahibi + senderTeam; karşı taraf = receiver + participants.
// applyCompetitivePoints ile aynı ayrım — farklı olursa analizdeki G/M, ELO ile çelişir.
function sideOf(r, uid) {
    if (r.senderId === uid || ids(r.senderTeam).includes(uid)) return 'sender';
    if (r.receiverId === uid || ids(r.participants).includes(uid)) return 'opponent';
    return null;
}

function resultOf(r, side) {
    const w = r.score?.winner;
    if (!w || r.scoreStatus !== 'CONFIRMED') return null;
    if (w === 'draw') return 'draw';
    return w === side ? 'win' : 'loss';
}

function parseHour(t) {
    const m = /^(\d{1,2})[:.](\d{2})/.exec(String(t || ''));
    return m ? Number(m[1]) + Number(m[2]) / 60 : null;
}

// matchDate bazı kayıtlarda UTC gece yarısı, bazılarında TR gece yarısı (önceki günün 21:00Z'si)
// olarak saklanıyor — +12 saat kaydırınca ikisi de doğru güne düşer.
const dayOf = (d) => new Date(new Date(d).getTime() + 12 * 3600 * 1000);

const top = (map, n) => Object.values(map).sort((a, b) => b.count - a.count).slice(0, n);

export const getSportAnalysis = async (req, res, next) => {
    try {
        const { userId, subCategory } = req.params;
        const rows = await prisma.activityRequest.findMany({
            where: { subCategory, status: { in: ['COMPLETED', 'MATCHED'] } },
            include: {
                sender:   { select: { id: true, username: true, fullName: true, avatar: true } },
                receiver: { select: { id: true, username: true, fullName: true, avatar: true } },
            },
            orderBy: { matchDate: 'asc' },
            take: 2000,
        });

        const mine = rows
            .map(r => ({ r, side: sideOf(r, userId) }))
            .filter(x => x.side);
        const now = Date.now();
        // Alışkanlıklar (tesis/saat/gün) için oynanmış + planlanmış maçlar; sonuç istatistikleri için sadece skoru onaylı maçlar.
        const played = mine.filter(({ r }) => r.status === 'COMPLETED' || (r.matchDate && new Date(r.matchDate).getTime() < now));
        const habits = mine.filter(({ r }) => r.matchDate || r.matchTime || r.courtName || r.location);
        const finished = mine
            .map(x => ({ ...x, result: resultOf(x.r, x.side) }))
            .filter(x => x.result)
            .sort((a, b) => new Date(a.r.completedAt || a.r.matchDate || 0) - new Date(b.r.completedAt || b.r.matchDate || 0));

        const totals = { played: played.length, upcoming: mine.length - played.length, wins: 0, losses: 0, draws: 0 };
        const byType = {};
        const byMode = {};
        for (const f of finished) {
            totals[f.result === 'win' ? 'wins' : f.result === 'loss' ? 'losses' : 'draws']++;
            const tk = f.r.matchType === 'DOUBLE' ? 'doubles' : 'singles';
            byType[tk] = byType[tk] || { played: 0, wins: 0 };
            byType[tk].played++; if (f.result === 'win') byType[tk].wins++;
            const mk = f.r.matchMode === 'COMPETITIVE' ? 'competitive' : 'practice';
            byMode[mk] = byMode[mk] || { played: 0, wins: 0 };
            byMode[mk].played++; if (f.result === 'win') byMode[mk].wins++;
        }
        const decided = totals.wins + totals.losses + totals.draws;
        totals.winRate = decided ? Math.round((totals.wins / decided) * 100) : null;

        let cur = 0, best = 0;
        for (const f of finished) {
            cur = f.result === 'win' ? cur + 1 : 0;
            best = Math.max(best, cur);
        }
        const lastResult = finished[finished.length - 1]?.result;
        let streakLen = 0;
        for (let i = finished.length - 1; i >= 0 && finished[i].result === lastResult; i--) streakLen++;

        const ratingTimeline = finished
            .map(f => {
                const snap = f.r.score?.ratingSnapshot?.[userId];
                if (!snap || snap.skillRating_after == null) return null;
                return {
                    date: f.r.completedAt || f.r.matchDate,
                    rating: Number(snap.skillRating_after),
                    change: Number(snap.change || 0),
                    matchType: f.r.matchType === 'DOUBLE' ? 'doubles' : 'singles',
                };
            })
            .filter(Boolean);

        const months = [];
        const base = new Date();
        for (let i = 5; i >= 0; i--) {
            const d = new Date(base.getFullYear(), base.getMonth() - i, 1);
            months.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`, played: 0, wins: 0 });
        }
        const monthIdx = Object.fromEntries(months.map((m, i) => [m.key, i]));
        for (const { r } of played) {
            const d = r.matchDate ? dayOf(r.matchDate) : (r.completedAt ? new Date(r.completedAt) : null);
            if (!d) continue;
            const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            if (monthIdx[k] != null) months[monthIdx[k]].played++;
        }
        for (const f of finished) {
            const d = f.r.matchDate ? dayOf(f.r.matchDate) : new Date(f.r.completedAt);
            const k = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
            if (monthIdx[k] != null && f.result === 'win') months[monthIdx[k]].wins++;
        }

        const venues = {};
        const areas = {};
        const hourBuckets = Object.fromEntries(HOUR_BUCKETS.map(b => [b.key, 0]));
        const hourHist = Array(24).fill(0);
        const weekdays = Array(7).fill(0); // 0 = Pazartesi
        let durSum = 0, durN = 0;
        const resultById = new Map(finished.map(f => [f.r.id, f.result]));
        for (const { r } of habits) {
            const res = resultById.get(r.id);
            const vName = (r.courtName || '').trim();
            if (vName) {
                const k = vName.toLocaleLowerCase('tr');
                venues[k] = venues[k] || { name: vName, address: r.courtAddress || r.location || null, count: 0, wins: 0, decided: 0 };
                venues[k].count++;
                if (res) { venues[k].decided++; if (res === 'win') venues[k].wins++; }
            }
            const area = [r.location, r.district].filter(Boolean).join(' / ').trim();
            if (area) {
                const k = area.toLocaleLowerCase('tr');
                areas[k] = areas[k] || { name: area, count: 0 };
                areas[k].count++;
            }
            const h = parseHour(r.matchTime);
            if (h != null) {
                hourHist[Math.floor(h) % 24]++;
                const hh = h < 6 ? h + 24 : h;
                const b = HOUR_BUCKETS.find(x => hh >= x.from && hh < x.to);
                if (b) hourBuckets[b.key]++;
            }
            if (r.matchDate) weekdays[(dayOf(r.matchDate).getUTCDay() + 6) % 7]++;
            if (r.duration) { durSum += r.duration; durN++; }
        }

        // En yoğun 2 saatlik pencere — "genelde 18:00–20:00 arası oynuyor" cümlesi için.
        let peak = null;
        for (let h = 0; h < 24; h++) {
            const c = hourHist[h] + hourHist[(h + 1) % 24];
            if (c > 0 && (!peak || c > peak.count)) peak = { from: h, to: (h + 2) % 24, count: c };
        }

        const opponents = {};
        for (const f of finished) {
            const r = f.r;
            const oppSide = f.side === 'sender'
                ? [r.receiver, ...(Array.isArray(r.participants) ? r.participants : [])]
                : [r.sender, ...(Array.isArray(r.senderTeam) ? r.senderTeam : [])];
            const seen = new Set();
            for (const o of oppSide) {
                if (!o?.id || o.id === userId || seen.has(o.id)) continue;
                seen.add(o.id);
                opponents[o.id] = opponents[o.id] || { id: o.id, username: o.username || null, fullName: o.fullName || null, avatar: o.avatar || null, count: 0, wins: 0, losses: 0 };
                opponents[o.id].count++;
                if (f.result === 'win') opponents[o.id].wins++;
                if (f.result === 'loss') opponents[o.id].losses++;
            }
        }

        const sets = { won: 0, lost: 0, gamesWon: 0, gamesLost: 0 };
        for (const f of finished) {
            const arr = Array.isArray(f.r.score?.sets) ? f.r.score.sets : [];
            for (const s of arr) {
                const mineG = Number(f.side === 'sender' ? s?.sender : s?.opponent);
                const theirG = Number(f.side === 'sender' ? s?.opponent : s?.sender);
                if (!Number.isFinite(mineG) || !Number.isFinite(theirG)) continue;
                sets.gamesWon += mineG; sets.gamesLost += theirG;
                if (mineG > theirG) sets.won++; else if (theirG > mineG) sets.lost++;
            }
        }

        // ELO doğruluk oranı — UTR dallarında RatingMatchRecord turnuva maçlarını da içerir ve
        // rakip puanını maç anında dondurur; diğer dallarda sadece ilan maçlarının ratingSnapshot'ı var.
        const interest = await prisma.userInterest.findFirst({ where: { userId, subCategory } });
        let accuracy = null;
        if (UTR_SUBCATEGORIES.includes(subCategory)) {
            const recs = await prisma.ratingMatchRecord.findMany({
                where: { userId, subCategory },
                orderBy: { matchDate: 'asc' },
                take: 500,
            });
            const toRows = (type) => recs.filter(r => r.matchType === type).map(r => ({
                date: r.matchDate,
                result: r.didWin ? 'win' : 'loss',
                perf: r.performanceScore,
                ratingBefore: r.ratingBefore,
                oppRating: r.opponentRatingSnapshot,
                reliability: r.opponentReliabilitySnapshot,
                formatWeight: r.formatWeight,
            }));
            // Disiplinin anketi yoksa getDisplayRating 0 döner — "mevcut puan 0.00" yerine son maç sonrası puan.
            const currentOf = (type) => {
                const done = type === 'DOUBLE' ? interest?.doublesAssessmentCompleted : interest?.assessmentCompleted;
                if (interest && done) return getDisplayRating(interest, subCategory, type === 'DOUBLE');
                const last = [...recs].reverse().find(r => r.matchType === type);
                return last ? last.ratingAfter : null;
            };
            const singles = computeRatingAccuracy(toRows('SINGLE'), currentOf('SINGLE'));
            const doubles = computeRatingAccuracy(toRows('DOUBLE'), currentOf('DOUBLE'));
            if (singles || doubles) accuracy = { singles, doubles };
        } else {
            const rowsAcc = [];
            for (const f of finished) {
                const snap = f.r.score?.ratingSnapshot;
                if (!snap?.[userId]) continue;
                const oppIds = f.side === 'sender'
                    ? [f.r.receiverId, ...ids(f.r.participants)]
                    : [f.r.senderId, ...ids(f.r.senderTeam)];
                const oppRatings = [...new Set(oppIds.filter(Boolean))]
                    .map(id => snap[id]?.skillRating_before)
                    .filter(v => v != null);
                if (!oppRatings.length) continue;
                rowsAcc.push({
                    date: f.r.completedAt || f.r.matchDate,
                    result: f.result,
                    perf: computeGamesRatio(f.r.score, f.side),
                    ratingBefore: snap[userId].skillRating_before,
                    oppRating: oppRatings.reduce((a, b) => a + b, 0) / oppRatings.length,
                });
            }
            const overall = computeRatingAccuracy(rowsAcc, interest?.skillRating ?? null);
            if (overall) accuracy = { overall };
        }

        res.json({
            subCategory,
            accuracy,
            totals,
            byType,
            byMode,
            streak: { current: lastResult ? { result: lastResult, length: streakLen } : null, bestWin: best },
            form: finished.slice(-10).map(f => f.result),
            ratingTimeline,
            monthly: months,
            venues: top(venues, 5),
            areas: top(areas, 3),
            hourBuckets,
            peakHours: peak,
            weekdays,
            avgDuration: durN ? Math.round(durSum / durN) : null,
            opponents: top(opponents, 5),
            sets: (sets.won + sets.lost) > 0 ? sets : null,
        });
    } catch (error) { next(error); }
};
