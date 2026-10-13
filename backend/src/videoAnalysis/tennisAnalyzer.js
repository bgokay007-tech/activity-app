// Tenis olay analizi — saf fonksiyonlar (DB/ffmpeg yok), sentetik videoyla test edilir.
// Girdi: detect.js tespitleri + kalibrasyon + oyuncu tanıtımı (tag) + renk örnekleri.
// Çıktı: oyuncu bazında vuruş, servis, hız, winner/out/file hatası, kazanılan sayı, ısı haritası.
//
// Yöntem:
//  - Top izi: kare kare küçük hareketli adaylar sabit-hız tahminiyle izlere bağlanır; en uzun/hızlı
//    izler zamanda çakışmayacak şekilde seçilip tek bir top yolu oluşur.
//  - Olay: top yolunda ani yön/hız değişimi ("kırılma"). Oyuncu kutusuna yakınsa ve topun derinlik
//    yönü (görüntüde yukarı/aşağı) tersine döndüyse VURUŞ; değilse SEKME (yere değme).
//  - Sekme noktası yerde olduğu için homografi ile gerçek kort koordinatına çevrilir → in/out,
//    servis kutusu, hız (vuruşan oyuncunun ayak konumundan sekmeye mesafe / süre = ortalama hız).
//  - Ralli: aralarında ≤4 sn olan vuruşlar. Rallinin son vuruşu: sekme rakip kortta içerideyse
//    winner (servisse ace), dışarıdaysa out, kendi tarafındaysa file → sayı karşı tarafa.
import { COURT, applyH, courtHomography, isFarSide, inCourt, inServiceBox } from './geometry.js';

const RALLY_GAP_S = 3;
const MIN_SPEED_KMH = 15, MAX_SPEED_KMH = 260;

const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round1 = (v) => Math.round(v * 10) / 10;

// ─── Oyuncular ──────────────────────────────────────────────────────────────────────────────
export function courtPlayersAt(det, H, s, perSide = 1) {
    const flat = det.players[s];
    if (!flat) return [];
    const items = [];
    const minH = 28 * Math.max(0.5, det.width / 960);
    for (let k = 0; k < flat.length; k += 5) {
        const box = [flat[k], flat[k + 1], flat[k + 2], flat[k + 3]];
        if (box[3] - box[1] < minH) continue; // top/raket lekesi oyuncu değil
        const feet = [(box[0] + box[2]) / 2, box[3]];
        const court = applyH(H, feet[0], feet[1]);
        if (!(court[0] > -4 && court[0] < COURT.W + 4 && court[1] > -8 && court[1] < COURT.L + 8)) continue;
        items.push({ box, court, area: flat[k + 4], side: isFarSide(court[1]) ? 'far' : 'near' });
    }
    const out = [];
    for (const side of ['far', 'near']) {
        out.push(...items.filter(i => i.side === side).sort((a, b) => b.area - a.area).slice(0, perSide));
    }
    return out;
}

// Renk benzerliği (Bhattacharyya katsayısı, 0..1)
function histSim(a, b) {
    if (!a || !b) return 0;
    let s = 0;
    for (let i = 0; i < a.length; i++) s += Math.sqrt(a[i] * b[i]);
    return s;
}
function avgHist(list) {
    const ok = list.filter(Boolean);
    if (!ok.length) return null;
    const out = new Array(ok[0].length).fill(0);
    for (const h of ok) for (let i = 0; i < h.length; i++) out[i] += h[i] / ok.length;
    return out;
}

// Taraf değişimi (tenis: tek oyunlarda taraf değişir). Renk örneklerine göre "takımlar yer
// değiştirdi mi" zaman serisi; kısa titremeleri bastırmak için kayan ortalama + kalıcılık.
function buildSwapTimeline(colorSamples, teamHist, initialSide) {
    const pts = [];
    for (const smp of colorSamples || []) {
        const near = avgHist(smp.items.filter(i => i.side === 'near').map(i => i.hist));
        const far = avgHist(smp.items.filter(i => i.side === 'far').map(i => i.hist));
        if (!near || !far) continue;
        const nearTeam = initialSide.A === 'near' ? 'A' : 'B';
        const farTeam = nearTeam === 'A' ? 'B' : 'A';
        const keep = histSim(teamHist[nearTeam], near) + histSim(teamHist[farTeam], far);
        const swap = histSim(teamHist[nearTeam], far) + histSim(teamHist[farTeam], near);
        pts.push({ t: smp.t, d: swap - keep });
    }
    if (!pts.length) return () => false;
    const win = 7;
    const states = pts.map((p, i) => {
        const seg = pts.slice(Math.max(0, i - win), i + win + 1);
        return seg.reduce((s, x) => s + x.d, 0) / seg.length > 0.04;
    });
    // en az 4 ardışık örnek sürmeyen değişimi yok say
    const stable = [...states];
    let i = 0;
    while (i < stable.length) {
        let j = i;
        while (j < stable.length && states[j] === states[i]) j++;
        if (j - i < 4 && i > 0) for (let k = i; k < j; k++) stable[k] = stable[i - 1];
        i = j;
    }
    return (t) => {
        let lo = 0, hi = pts.length - 1;
        if (t <= pts[0].t) return stable[0];
        while (lo < hi) { const m = (lo + hi + 1) >> 1; if (pts[m].t <= t) lo = m; else hi = m - 1; }
        return stable[lo];
    };
}

// ─── Top yolu ───────────────────────────────────────────────────────────────────────────────
export function linkBallTracks(ball, scale = 1) {
    const done = [];
    let active = [];
    const finalize = (tr) => {
        const p = tr.pts;        if (p.length < 5) return;
        const disp = dist([p[0].x, p[0].y], [p[p.length - 1].x, p[p.length - 1].y]);
        let path = 0;
        for (let i = 1; i < p.length; i++) path += dist([p[i - 1].x, p[i - 1].y], [p[i].x, p[i].y]);
        const span = p[p.length - 1].f - p[0].f;
        const speed = path / Math.max(1, span);
        if (disp < 15 * scale || speed < 1.5 * scale) return;
        // zikzak (titreyen gürültü) eleme: düz yol / toplam yol
        if (disp / path < 0.35) return;
        done.push({ pts: p, start: p[0].f, end: p[p.length - 1].f, speed });
    };
    for (let f = 0; f < ball.length; f++) {
        const flat = ball[f];
        const cands = [];
        // Bölünmüş leke = aynı top; çiftler ayrı iz açıp gerçeğini bozmasın
        if (flat) for (let k = 0; k < flat.length; k += 3) {
            const x = flat[k], y = flat[k + 1], a = flat[k + 2];
            const dup = cands.find(c => Math.hypot(c.x - x, c.y - y) < 8 * scale);
            if (dup) { if (a > dup.a) Object.assign(dup, { x, y, a }); continue; }
            cands.push({ x, y, a, used: false });
        }
        const pairs = [];
        for (let ti = 0; ti < active.length; ti++) {
            const tr = active[ti];
            const last = tr.pts[tr.pts.length - 1];
            const df = f - last.f;
            const px = last.x + tr.vx * df, py = last.y + tr.vy * df;
            const young = tr.pts.length < 2;
            const gate = young ? 70 * scale : (10 * scale + 1.2 * Math.hypot(tr.vx, tr.vy) * df);
            for (let ci = 0; ci < cands.length; ci++) {
                const d = Math.hypot(cands[ci].x - px, cands[ci].y - py);
                if (d > gate) continue;
                // boşluktan sonra ters yöne sıçrama = başka nesne
                if (!young && df > 2 && ((cands[ci].x - last.x) * tr.vx + (cands[ci].y - last.y) * tr.vy) < 0) continue;
                pairs.push([d, ti, ci]);
            }
        }
        pairs.sort((a, b) => a[0] - b[0]);
        const usedT = new Set();
        for (const [, ti, ci] of pairs) {
            if (usedT.has(ti) || cands[ci].used) continue;
            usedT.add(ti); cands[ci].used = true;
            const tr = active[ti];
            const last = tr.pts[tr.pts.length - 1];
            const df = f - last.f;
            const nvx = (cands[ci].x - last.x) / df, nvy = (cands[ci].y - last.y) / df;
            if (tr.pts.length >= 3) { tr.vx = 0.5 * tr.vx + 0.5 * nvx; tr.vy = 0.5 * tr.vy + 0.5 * nvy; } else { tr.vx = nvx; tr.vy = nvy; }
            tr.pts.push({ f, x: cands[ci].x, y: cands[ci].y });
        }
        const next = [];
        for (const tr of active) {
            if (f - tr.pts[tr.pts.length - 1].f > 4) finalize(tr); else next.push(tr);
        }
        for (const c of cands) if (!c.used) next.push({ pts: [{ f, x: c.x, y: c.y }], vx: 0, vy: 0 });
        active = next.length > 400 ? next.slice(-400) : next;
    }
    active.forEach(finalize);

    // Çakışmayan en iyi izler
    done.sort((a, b) => (b.pts.length * Math.min(1, b.speed / (4 * scale))) - (a.pts.length * Math.min(1, a.speed / (4 * scale))));
    const taken = [];
    for (const tr of done) {
        if (taken.some(o => tr.start <= o.end - 2 && tr.end >= o.start + 2)) continue;
        taken.push(tr);
    }
    taken.sort((a, b) => a.start - b.start);

    // Yakın izleri tek segmentte birleştir (aradaki kareler doğrusal enterpolasyon)
    const segments = [];
    let cur = null;
    for (const tr of taken) {
        if (cur) {
            const a = cur[cur.length - 1], b = tr.pts[0];
            const gap = b.f - a.f;
            if (gap <= 6 && Math.hypot(b.x - a.x, b.y - a.y) <= (25 + 14 * gap) * scale) {
                for (let g = 1; g < gap; g++) cur.push({ f: a.f + g, x: a.x + (b.x - a.x) * g / gap, y: a.y + (b.y - a.y) * g / gap, interp: true });
                cur.push(...tr.pts.filter(p => p.f > a.f));
                continue;
            }
            segments.push(cur);
        }
        cur = [...tr.pts];
    }
    if (cur) segments.push(cur);
    // İz içi kayıp kareleri doldur: kırılma hızları indeks değil kare başına hesaplanır
    for (let s = 0; s < segments.length; s++) {
        const sg = segments[s], full = [sg[0]];
        for (let i = 1; i < sg.length; i++) {
            const a = sg[i - 1], b = sg[i], gap = b.f - a.f;
            for (let g = 1; g < gap; g++) full.push({ f: a.f + g, x: a.x + (b.x - a.x) * g / gap, y: a.y + (b.y - a.y) * g / gap, interp: true });
            full.push(b);
        }
        segments[s] = full;
    }
    // Tek karelik sıçramalar (yanlış aday) sahte kırılma üretmesin → komşulardan enterpolasyon
    for (const sg of segments) {
        for (let i = 1; i < sg.length - 1; i++) {
            const a = sg[i - 1], b = sg[i + 1], q = sg[i];
            const u = (q.f - a.f) / Math.max(1, b.f - a.f);
            const ex = a.x + (b.x - a.x) * u, ey = a.y + (b.y - a.y) * u;
            const dev = Math.hypot(q.x - ex, q.y - ey);
            if (dev > Math.max(12 * scale, 0.8 * Math.hypot(b.x - a.x, b.y - a.y))) {
                sg[i] = { f: q.f, x: ex, y: ey, interp: true };
            }
        }
    }
    return segments;
}

// Segment içi kırılma noktaları
export function findKinks(seg, scale = 1) {
    const k = 3;
    if (seg.length < 2 * k + 1) return [];
    const p = seg.map((q, i) => {
        if (i === 0 || i === seg.length - 1) return q;
        return { ...q, x: (seg[i - 1].x + q.x + seg[i + 1].x) / 3, y: (seg[i - 1].y + q.y + seg[i + 1].y) / 3 };
    });
    const cand = [];
    for (let i = k; i < p.length - k; i++) {
        const vin = [p[i].x - p[i - k].x, p[i].y - p[i - k].y];
        const vout = [p[i + k].x - p[i].x, p[i + k].y - p[i].y];
        const a = Math.hypot(...vin), b = Math.hypot(...vout);
        if (a < 2 * scale || b < 2 * scale) continue;
        const cos = (vin[0] * vout[0] + vin[1] * vout[1]) / (a * b);
        const ang = Math.acos(Math.max(-1, Math.min(1, cos)));
        const ratio = b / a;
        // Yere değme: dikey hız tersine döner → görüntüde ani yukarı "tekme" (vy azalır).
        // Topun derinlik yönünden bağımsız: uzak tarafta da yakın tarafta da aynı işaret.
        const kick = -(vout[1] - vin[1]) / k;
        const score = ang + (ratio > 1.8 || ratio < 0.55 ? 0.35 : 0) + Math.max(0, kick) / (4 * scale);
        // Yavaş topta (görüntüdeki tepe noktası) küçük sapma büyük açı verir → hız farkı da şart
        const dv = Math.hypot(vout[0] - vin[0], vout[1] - vin[1]) / k;
        const turn = dv > 2.5 * scale && (ang > 0.55 || (ang > 0.25 && (ratio > 1.8 || ratio < 0.55)));
        if (turn || kick > 1.2 * scale) {
            cand.push({ i, f: seg[i].f, x: seg[i].x, y: seg[i].y, score, vin, vout, kick });
        }
    }
    // tepe olmayanları bastır (±5 kare)
    cand.sort((a, b) => b.score - a.score);
    const out = [];
    for (const c of cand) if (!out.some(o => Math.abs(o.f - c.f) <= 5)) out.push(c);
    return out.sort((a, b) => a.f - b.f);
}

// ─── Ana analiz ─────────────────────────────────────────────────────────────────────────────
export function analyzeTennis({ det, calibration, players, colorSamples = [], doubles = false }) {
    const { H } = courtHomography(calibration, det.width, det.height);
    const fps = det.fps, every = det.playerEvery;
    const perSide = doubles ? 2 : 1;
    const scale = Math.max(0.5, det.width / 960);
    const slots = players.map((p, i) => ({ ...p, slot: i, team: p.team || (doubles ? (i < 2 ? 'A' : 'B') : (i === 0 ? 'A' : 'B')) }));
    const sampleOf = (t) => Math.max(0, Math.min(det.players.length - 1, Math.round((t * fps) / every)));
    const playersCache = new Map();
    const courtPl = (s) => {
        if (!playersCache.has(s)) playersCache.set(s, courtPlayersAt(det, H, s, perSide));
        return playersCache.get(s);
    };

    // Tanıtım: dokunulan noktaya en yakın kutu → başlangıç konumu ve tarafı; o anki renk = kimlik
    const initPos = {};
    const enrollHist = {};
    for (const sl of slots) {
        const tag = sl.tag;
        if (!tag) continue;
        const tp = [tag.x * det.width, tag.y * det.height];
        let best = null;
        for (let ds = -10; ds <= 10; ds++) {
            for (const it of courtPl(sampleOf(tag.t) + ds)) {
                const cx = Math.max(it.box[0], Math.min(it.box[2], tp[0]));
                const cy = Math.max(it.box[1], Math.min(it.box[3], tp[1]));
                const d = Math.hypot(cx - tp[0], cy - tp[1]) + Math.abs(ds) * 0.5;
                if (!best || d < best.d) best = { d, it };
            }
        }
        const hTol = 0.08 * det.height;
        initPos[sl.slot] = best && best.d < hTol ? best.it.court : applyH(H, tp[0], tp[1] + 0.06 * det.height);
        const cs = (colorSamples || []).filter(c => Math.abs(c.t - tag.t) <= 1.5)
            .sort((a, b) => Math.abs(a.t - tag.t) - Math.abs(b.t - tag.t))[0];
        if (cs) {
            const it = cs.items.map(x => ({ x, d: dist(x.court, initPos[sl.slot]) })).sort((a, b) => a.d - b.d)[0];
            if (it && it.d < 3) enrollHist[sl.slot] = it.x.hist;
        }
    }
    const teamSideInit = {};
    for (const team of ['A', 'B']) {
        const ys = slots.filter(s => s.team === team && initPos[s.slot]).map(s => initPos[s.slot][1]);
        teamSideInit[team] = ys.length ? (isFarSide(ys.reduce((a, b) => a + b, 0) / ys.length) ? 'far' : 'near') : null;
    }
    if (!teamSideInit.A && !teamSideInit.B) { teamSideInit.A = 'near'; teamSideInit.B = 'far'; }
    if (!teamSideInit.A) teamSideInit.A = teamSideInit.B === 'near' ? 'far' : 'near';
    if (!teamSideInit.B) teamSideInit.B = teamSideInit.A === 'near' ? 'far' : 'near';
    const teamHist = {
        A: avgHist(slots.filter(s => s.team === 'A').map(s => enrollHist[s.slot])),
        B: avgHist(slots.filter(s => s.team === 'B').map(s => enrollHist[s.slot])),
    };
    const swapped = teamHist.A && teamHist.B ? buildSwapTimeline(colorSamples, teamHist, teamSideInit) : () => false;
    const teamSideAt = (team, t) => {
        const s0 = teamSideInit[team];
        return swapped(t) ? (s0 === 'near' ? 'far' : 'near') : s0;
    };

    // Oyuncu konum takibi (her örnekte takım tarafındaki kutulara en yakın atama)
    const nS = det.players.length;
    const pos = slots.map(() => new Array(nS).fill(null));
    const last = slots.map(sl => initPos[sl.slot] || null);
    for (let s = 0; s < nS; s++) {
        const t = (s * every) / fps;
        const items = courtPl(s);
        for (const team of ['A', 'B']) {
            const side = teamSideAt(team, t);
            const boxes = items.filter(i => i.side === side);
            const ts = slots.filter(sl => sl.team === team);
            if (!boxes.length || !ts.length) continue;
            if (ts.length === 1) {
                const b = boxes.sort((p, q) => q.area - p.area)[0];
                pos[ts[0].slot][s] = b; last[ts[0].slot] = b.court;
                continue;
            }
            const cost = (sl, b) => (last[sl.slot] ? dist(last[sl.slot], b.court) : 0);
            if (boxes.length >= 2) {
                const [b0, b1] = boxes;
                const straight = cost(ts[0], b0) + cost(ts[1], b1);
                const cross = cost(ts[0], b1) + cost(ts[1], b0);
                const pair = straight <= cross ? [[ts[0], b0], [ts[1], b1]] : [[ts[0], b1], [ts[1], b0]];
                for (const [sl, b] of pair) { pos[sl.slot][s] = b; last[sl.slot] = b.court; }
            } else {
                const b = boxes[0];
                const sl = cost(ts[0], b) <= cost(ts[1], b) ? ts[0] : ts[1];
                pos[sl.slot][s] = b; last[sl.slot] = b.court;
            }
        }
    }
    const posNear = (slot, s, tol = 10) => {
        for (let d = 0; d <= tol; d++) {
            if (pos[slot][s - d]) return pos[slot][s - d];
            if (pos[slot][s + d]) return pos[slot][s + d];
        }
        return null;
    };

    // Top yolu + olaylar
    const segments = linkBallTracks(det.ball, scale);
    const ballFrames = segments.reduce((n, sg) => n + sg.filter(p => !p.interp).length, 0);
    const nearestPlayer = (f, x, y) => {
        const s = Math.round(f / every);
        let best = null;
        for (const sl of slots) {
            const p = posNear(sl.slot, s, 4);
            if (!p) continue;
            const [x0, y0, x1, y1] = p.box;
            const h = Math.max(8, y1 - y0);
            // raket erişimi: yanlara ~0.6 boy, başın üstüne ~0.5 boy (servis)
            const ex0 = x0 - 0.6 * h, ex1 = x1 + 0.6 * h, ey0 = y0 - 0.8 * h, ey1 = y1 + 0.1 * h;
            const dx = Math.max(ex0 - x, 0, x - ex1), dy = Math.max(ey0 - y, 0, y - ey1);
            const d = Math.hypot(dx, dy) / h;
            if (!best || d < best.d) best = { d, sl, p };
        }
        return best;
    };
    const events = [];
    const pushHit = (f, x, y, best) => events.push({
        type: 'hit', f, t: f / fps, slot: best.sl.slot, team: best.sl.team,
        side: isFarSide(best.p.court[1]) ? 'far' : 'near', feet: best.p.court, img: [x, y],
    });
    segments.forEach((seg, si) => {
        // Vuruş anında top oyuncu/raket lekesine karışıp kaybolur → iz orada kopar. Oyuncunun
        // yanında başlayan/biten iz ucu da vuruş adayıdır.
        // Başlangıç: iz geç yakalanmış olabilir (servis, gövde önü) → ilk hızla 0.4 sn geriye uzat.
        // Bitiş geriye uzatılmaz: yanından geçen winner'ı rakibin vuruşu sanmasın.
        {
            const a = seg[0], b = seg[Math.min(4, seg.length - 1)];
            const df = Math.max(1, b.f - a.f);
            const vx = (b.x - a.x) / df, vy = (b.y - a.y) / df;
            let pick = null;
            for (let k = 0; k <= 15; k++) {
                const x = a.x - vx * k, y = a.y - vy * k;
                if (x < 0 || y < 0 || x > det.width || y > det.height) break;
                const best = nearestPlayer(a.f - k, x, y);
                if (!best || best.d >= 0.35) { if (pick) break; continue; }
                // erişime girdikten sonra en yakın geçiş anı = temas
                if (!pick || best.d <= pick.best.d) pick = { k, x, y, best };
            }
            if (pick) pushHit(a.f - pick.k, pick.x, pick.y, pick.best);
        }
        {
            // Top kısa sürede geri dönmüyorsa oyuncunun yanından geçip gitmiştir (winner/out)
            const end = seg[seg.length - 1];
            const next = segments[si + 1];
            const best = nearestPlayer(end.f, end.x, end.y);
            if (best && best.d < 0.35 && next && next[0].f - end.f <= 1.2 * fps) pushHit(end.f, end.x, end.y, best);
        }
        for (const k of findKinks(seg, scale)) {
            const best = nearestPlayer(k.f, k.x, k.y);
            // Yakın oyuncu vuruşu topu kameradan uzaklaştırır (görüntüde yukarı). Top hâlâ
            // kameraya geliyorsa oyuncunun önündeki sekmedir.
            // Uzak oyuncu: havadaki top homografide oyuncunun arkasına düşer; fileye doğru 1.2 m+
            // önündeki kırılma yerdeki sekmedir.
            const kc = applyH(H, k.x, k.y);
            const far = best && isFarSide(best.p.court[1]);
            const nearBounce = best && k.kick > 0.8 * scale && (far
                ? kc[1] > best.p.court[1] + 1.2
                : k.vout[1] >= 0);
            if (best && best.d < 0.35 && !nearBounce) { pushHit(k.f, k.x, k.y, best); continue; }
            if (!(k.kick > 0.8 * scale)) continue; // yukarı tekme yoksa havada gürültü kırılması
            const c = applyH(H, k.x, k.y);
            if (c[0] < -4 || c[0] > COURT.W + 4 || c[1] < -6 || c[1] > COURT.L + 6) continue;
            events.push({ type: 'bounce', f: k.f, t: k.f / fps, court: c, img: [k.x, k.y] });
        }
    });
    events.sort((a, b) => a.f - b.f);
    // Aynı oyuncunun 0.8 sn içindeki vuruş adayları tek vuruş: sonuncusu (temas) tutulur —
    // top atış tepesi / topun gelişi / raketten çıkışı aynı vuruşa ait.
    const ev = [];
    for (const e of events) {
        if (e.type === 'hit') {
            let j = ev.length - 1;
            while (j >= 0 && ev[j].type !== 'hit') j--;
            if (j >= 0 && ev[j].slot === e.slot && e.t - ev[j].t < 0.8) {
                // aradaki sekmeler (raket/gövde kırılması) da düşer
                ev.splice(j);
            }
        }
        ev.push(e);
    }

    // Ralliler
    const hits = ev.filter(e => e.type === 'hit');
    const bounces = ev.filter(e => e.type === 'bounce');
    const rallies = [];
    let curR = null;
    for (const h of hits) {
        const lastHit = curR?.hits[curR.hits.length - 1];
        if (!curR || h.t - lastHit.t > RALLY_GAP_S) {
            if (curR) rallies.push(curR);
            curR = { hits: [h] };
            continue;
        }
        if (lastHit.team === h.team && !doubles) continue; // aynı taraf art arda: tekrar tespit
        curR.hits.push(h);
    }
    if (curR) rallies.push(curR);

    const shotInfo = (h, nextHit) => {
        const until = nextHit ? nextHit.t : h.t + 3;
        const b = bounces.find(x => x.t > h.t + 0.08 && x.t < until);
        if (!b) return { result: 'unknown' };
        const crossed = isFarSide(b.court[1]) !== isFarSide(h.feet[1]);
        const dt = b.t - h.t;
        let speed = null;
        if (crossed && dt > 0.1) {
            const kmh = (dist(h.feet, b.court) / dt) * 3.6;
            if (kmh >= MIN_SPEED_KMH && kmh <= MAX_SPEED_KMH) speed = round1(kmh);
        }
        if (!crossed) return { result: 'net', bounce: b, speed: null };
        return { result: inCourt(b.court[0], b.court[1], { doubles, margin: 0.03 }) ? 'in' : 'out', bounce: b, speed };
    };

    const stat = slots.map(sl => ({
        slot: sl.slot, name: sl.name, userId: sl.userId || null, team: sl.team,
        shots: 0, serves: 0, firstServeIn: 0, serveFaults: 0, doubleFaults: 0, aces: 0,
        winners: 0, outs: 0, nets: 0, pointsWon: 0, speeds: [], serveSpeeds: [],
    }));
    const teamPoints = { A: 0, B: 0 };
    const timeline = [];
    let prevFault = null; // { slot, t }
    let rallyLens = [];

    for (const r of rallies) {
        r.hits.forEach((h, i) => {
            const info = shotInfo(h, r.hits[i + 1]);
            h.info = info;
            const st = stat[h.slot];
            st.shots++;
            if (info.speed) (i === 0 ? st.serveSpeeds : st.speeds).push(info.speed);
            if (i === 0) {
                st.serves++;
                const inBox = info.bounce && inServiceBox(info.bounce.court[0], info.bounce.court[1], h.feet);
                h.serveIn = !!inBox;            }
            timeline.push({ t: round1(h.t), type: i === 0 ? 'serve' : 'shot', slot: h.slot, speed: info.speed || null, result: info.result });
        });
        const first = r.hits[0];
        const lastHit = r.hits[r.hits.length - 1];
        const opp = lastHit.team === 'A' ? 'B' : 'A';
        // Servis hatası: kutuya düşmedi — rakip yine de vursa da sayı oynanmaz
        if (first.info.bounce && !first.serveIn) {
            const st = stat[first.slot];
            st.serveFaults++;
            if (prevFault && prevFault.slot === first.slot && first.t - prevFault.t < 40) {
                st.doubleFaults++;
                teamPoints[opp]++;
                timeline.push({ t: round1(first.t), type: 'point', team: opp, reason: 'double_fault', slot: first.slot });
                prevFault = null;
            } else {
                prevFault = { slot: first.slot, t: first.t };
                timeline.push({ t: round1(first.t), type: 'fault', slot: first.slot });
            }
            continue;
        }
        if (first.serveIn || r.hits.length > 1) {
            if (prevFault?.slot !== first.slot) stat[first.slot].firstServeIn++;
            prevFault = null;
        }
        rallyLens.push(r.hits.length);
        const res = lastHit.info.result;
        if (res === 'in') {
            const st = stat[lastHit.slot];
            if (r.hits.length === 1) st.aces++; else st.winners++;
            teamPoints[lastHit.team]++;
            timeline.push({ t: round1(lastHit.t), type: 'point', team: lastHit.team, reason: r.hits.length === 1 ? 'ace' : 'winner', slot: lastHit.slot });
        } else if (res === 'out' || res === 'net') {
            stat[lastHit.slot][res === 'out' ? 'outs' : 'nets']++;
            teamPoints[opp]++;
            timeline.push({ t: round1(lastHit.t), type: 'point', team: opp, reason: res, slot: lastHit.slot });
        }
    }

    // Isı haritası (kendi yarı sahası, file → dip çizgi + 3 m; 3 sütun × 4 satır) + kat edilen mesafe
    const heat = slots.map(() => Array.from({ length: 4 }, () => [0, 0, 0]));
    const distM = slots.map(() => 0);
    for (const sl of slots) {
        let prev = null;
        for (let s = 0; s < nS; s++) {
            const p = pos[sl.slot][s];
            if (!p) continue;
            let [x, y] = p.court;
            if (isFarSide(y)) { x = COURT.W - x; y = COURT.L - y; }
            const depth = y - COURT.NET_Y; // 0 file .. 11.885 dip çizgi
            const col = Math.max(0, Math.min(2, Math.floor((x / COURT.W) * 3)));
            const row = Math.max(0, Math.min(3, Math.floor((depth / (COURT.NET_Y + 3)) * 4)));
            heat[sl.slot][row][col]++;
            if (prev && s - prev.s <= 3) {
                const d = dist(prev.c, p.court);
                if (d < 1.2 * (s - prev.s)) distM[sl.slot] += d; // 10 Hz'de >12 m/sn sıçrama = kimlik karışması
            }
            prev = { s, c: p.court };
        }
    }

    const avg = (a) => (a.length ? round1(a.reduce((x, y) => x + y, 0) / a.length) : null);
    const max = (a) => (a.length ? round1(Math.max(...a)) : null);
    const playersOut = stat.map((st, i) => {
        const total = heat[i].flat().reduce((a, b) => a + b, 0) || 1;
        return {
            slot: st.slot, name: st.name, userId: st.userId, team: st.team,
            shots: st.shots, serves: st.serves, aces: st.aces, winners: st.winners,
            outs: st.outs, nets: st.nets, serveFaults: st.serveFaults, doubleFaults: st.doubleFaults,
            errors: st.outs + st.nets + st.doubleFaults,
            pointsWon: teamPoints[st.team],
            firstServePct: st.serves ? Math.round((st.firstServeIn / st.serves) * 100) : null,
            avgShotSpeed: avg(st.speeds), maxShotSpeed: max(st.speeds),
            avgServeSpeed: avg(st.serveSpeeds), maxServeSpeed: max(st.serveSpeeds),
            distanceM: Math.round(distM[i]),
            heatmap: heat[i].map(row => row.map(v => Math.round((v / total) * 100))),
        };
    });

    const rallyFrames = rallies.reduce((n, r) => n + Math.max(0, (r.hits[r.hits.length - 1].f - r.hits[0].f) + fps * 1.5), 0);
    return {
        version: 1,
        sport: 'tennis',
        doubles,
        durationSec: Math.round(det.duration),
        players: playersOut,
        teamPoints,
        rallies: {
            count: rallyLens.length,
            avgLength: rallyLens.length ? round1(rallyLens.reduce((a, b) => a + b, 0) / rallyLens.length) : 0,
            longest: rallyLens.length ? Math.max(...rallyLens) : 0,
        },
        quality: {
            ballCoverage: rallyFrames ? Math.min(1, round1((ballFrames / rallyFrames) * 100) / 100) : 0,
            hitsDetected: hits.length,
            bouncesDetected: bounces.length,
            colorId: !!(teamHist.A && teamHist.B),
        },
        timeline: timeline.slice(0, 600),
    };
}
