import prisma from '../config/prisma.js';
import { haversineM, simplifyPath, pathLengthKm } from '../utils/geoPath.js';

// Overpass sık sık "too busy" dönüyor — liste için sadece ek kaynak; geometri OSM API'den.
const OVERPASS_MIRRORS = [
    'https://overpass.private.coffee/api/interpreter',
    'https://overpass-api.de/api/interpreter',
];
const OSM_API = 'https://api.openstreetmap.org/api/0.6';
const UA = 'ActivityApp/1.0 (travel route import)';
const ATTRIBUTION = '© OpenStreetMap katkıcıları (ODbL) — openstreetmap.org/copyright';
const SKIP_ROLES = new Set(['alternative', 'excursion', 'approach', 'link']);

// Türkiye'deki bilinen uzun yürüyüş rotaları (OSM relation id) — Overpass çökse de içe aktarma çalışsın.
const KNOWN_TR_RELATIONS = [
    51855,    // Likya Yolu
    569620,   // Aziz Paul Yolu
    1707889,  // Frig Yolu
    1783561,  // Hitit Yolu
    16118310, // Efeler Yolu
    4501541,  // Evliya Çelebi Yolu
    19853027, // Karia Yolu - Dalyan
    19859498, // Karia Yolu - Gökova Körfezi
    19836740, // Karia Yolu - Datça Yarımadası
    19840150, // Karia Yolu - Muğla ve Çevresi
    19834307, // Karia Yolu - Bozburun Yarımadası
    15297839, // Leleg Yolu
    16569774, // Troya Kültür Rotası
    19932854, // Sultans Trail: Edirne - İstanbul
    17664622, // Hoşgörü Yolu
    18760204, // Anabasis Yolu
    3827204,  // İstiklal Yolu
];

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

async function fetchJson(url, init = {}, timeoutMs = 60000) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...init, headers: { 'User-Agent': UA, ...(init.headers || {}) }, signal: ctrl.signal });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        // Overpass zaman aşımında 200 + XML hata sayfası dönebiliyor.
        const text = await res.text();
        if (!text.trimStart().startsWith('{')) throw new Error('JSON değil');
        return JSON.parse(text);
    } finally {
        clearTimeout(timer);
    }
}

async function overpassRouteIds() {
    const q = '[out:json][timeout:90];area["ISO3166-1"="TR"][admin_level=2]->.tr;relation["type"="route"]["route"~"hiking|foot"]["network"~"iwn|nwn|rwn"](area.tr);out ids;';
    for (const url of OVERPASS_MIRRORS) {
        try {
            const j = await fetchJson(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                body: `data=${encodeURIComponent(q)}`,
            }, 120000);
            if ((j.elements || []).length) return j.elements.map(e => e.id);
        } catch { /* sonraki ayna */ }
    }
    return [];
}

// /full.json: relation + way + node. Alt relation'ların way'leri gelmez — bir seviye iner.
async function fetchRelationWays(id, depth = 0) {
    const j = await fetchJson(`${OSM_API}/relation/${id}/full.json`);
    const nodes = new Map();
    const ways = new Map();
    let rel = null;
    for (const e of j.elements || []) {
        if (e.type === 'node') nodes.set(e.id, e);
        else if (e.type === 'way') ways.set(e.id, e);
        else if (e.type === 'relation' && e.id === id) rel = e;
    }
    if (!rel) return { rel: null, ways: [] };
    const out = [];
    for (const m of rel.members || []) {
        if (SKIP_ROLES.has(m.role)) continue;
        if (m.type === 'way' && ways.has(m.ref)) {
            const w = ways.get(m.ref);
            const pts = w.nodes.map(n => nodes.get(n)).filter(Boolean);
            if (pts.length >= 2) out.push({ id: w.id, nodes: pts.map(n => ({ id: n.id, lat: n.lat, lng: n.lon })) });
        } else if (m.type === 'relation' && depth < 1 && m.ref !== id) {
            await sleep(500);
            try {
                const child = await fetchRelationWays(m.ref, depth + 1);
                out.push(...child.ways);
            } catch { /* eksik etap rotayı düşürmesin */ }
        }
    }
    return { rel, ways: out };
}

// Way'leri sadece gerçekten ortak düğümde birleştirir (üye sırası güvenilmez — Likya'da 1108
// way karışık sırada ve kollu). Mesafeyle "yakın" birleştirme sahte düz çizgiler çiziyordu.
function mergeWaysByNodes(ways) {
    const byId = [...new Map(ways.map(w => [w.id, w])).values()];
    // T-kavşak: bir way diğerinin ortasına bağlanıyorsa orada böl — yoksa graf kopuk kalır.
    const usage = new Map();
    for (const w of byId) for (const nd of new Set(w.nodes.map(x => x.id))) usage.set(nd, (usage.get(nd) || 0) + 1);
    const uniq = [];
    for (const w of byId) {
        let start = 0;
        for (let k = 1; k < w.nodes.length; k++) {
            if (k === w.nodes.length - 1 || usage.get(w.nodes[k].id) > 1) {
                uniq.push({ id: `${w.id}:${start}`, nodes: w.nodes.slice(start, k + 1) });
                start = k;
            }
        }
    }
    const ends = new Map();
    const addEnd = (nid, i) => { if (!ends.has(nid)) ends.set(nid, []); ends.get(nid).push(i); };
    uniq.forEach((w, i) => { addEnd(w.nodes[0].id, i); addEnd(w.nodes[w.nodes.length - 1].id, i); });
    const used = new Uint8Array(uniq.length);
    const chains = [];
    const extend = (chain) => {
        for (;;) {
            const tail = chain[chain.length - 1].id;
            const at = (ends.get(tail) || []).filter(i => !used[i]);
            // Kavşakta (3+ uç) durulur ki kol ana hatta karışmasın.
            if (at.length !== 1 || (ends.get(tail) || []).length !== 2) return chain;
            const i = at[0];
            used[i] = 1;
            const nodes = uniq[i].nodes[0].id === tail ? uniq[i].nodes : [...uniq[i].nodes].reverse();
            chain.push(...nodes.slice(1));
        }
    };
    uniq.forEach((w, i) => {
        if (used[i]) return;
        used[i] = 1;
        let chain = extend([...w.nodes]);
        chain = extend(chain.reverse());
        chains.push({
            a: chain[0].id, b: chain[chain.length - 1].id,
            pts: chain.map(n => ({ lat: n.lat, lng: n.lng })),
        });
    });
    return chains;
}

// Parçalar graf olur (uç düğümler = köşe). Kopuk bileşenler en yakın uçlarından sanal kenarla
// bağlanır (çizilmez, sadece sıralama için). Grafın en uzak iki ucu arasındaki en kısa yol
// ana hattır; alternatif kollar ve yan sapaklar dışarıda kalır. Batıdaki uç başlangıç.
function mainLine(chains) {
    const ch = chains.filter(c => c.a !== c.b && c.pts.length >= 2);
    if (!ch.length) return [];
    const vid = new Map();
    const vpt = [];
    const v = (nid, p) => { if (!vid.has(nid)) { vid.set(nid, vpt.length); vpt.push(p); } return vid.get(nid); };
    const adj = [];
    const addEdge = (x, y, w, chainIdx) => {
        (adj[x] ||= []).push({ to: y, w, chainIdx, fwd: true });
        (adj[y] ||= []).push({ to: x, w, chainIdx, fwd: false });
    };
    ch.forEach((c, i) => {
        const x = v(c.a, c.pts[0]);
        const y = v(c.b, c.pts[c.pts.length - 1]);
        addEdge(x, y, pathLengthKm([c.pts]) * 1000 || 1, i);
    });
    const n = vpt.length;
    for (let i = 0; i < n; i++) adj[i] ||= [];

    // Bileşenler
    const comp = new Int32Array(n).fill(-1);
    let nc = 0;
    for (let i = 0; i < n; i++) {
        if (comp[i] >= 0) continue;
        const st = [i]; comp[i] = nc;
        while (st.length) { const u = st.pop(); for (const e of adj[u]) if (comp[e.to] < 0) { comp[e.to] = nc; st.push(e.to); } }
        nc++;
    }
    // Kruskal: bileşenleri en yakın köşe çiftleriyle bağla.
    if (nc > 1) {
        const best = new Map();
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
            if (comp[i] === comp[j]) continue;
            const key = comp[i] < comp[j] ? `${comp[i]}:${comp[j]}` : `${comp[j]}:${comp[i]}`;
            const d = haversineM(vpt[i], vpt[j]);
            const b = best.get(key);
            if (!b || d < b.d) best.set(key, { d, i, j });
        }
        const parent = [...Array(nc).keys()];
        const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
        for (const { d, i, j } of [...best.values()].sort((p, q) => p.d - q.d)) {
            const ra = find(comp[i]), rb = find(comp[j]);
            if (ra === rb) continue;
            parent[ra] = rb;
            addEdge(i, j, d, -1);
        }
    }

    const dijkstra = (src) => {
        const dist = new Float64Array(n).fill(Infinity);
        const prev = new Array(n).fill(null);
        const done = new Uint8Array(n);
        dist[src] = 0;
        for (let k = 0; k < n; k++) {
            let u = -1;
            for (let i = 0; i < n; i++) if (!done[i] && (u < 0 || dist[i] < dist[u])) u = i;
            if (u < 0 || dist[u] === Infinity) break;
            done[u] = 1;
            for (const e of adj[u]) {
                const nd = dist[u] + e.w;
                if (nd < dist[e.to]) { dist[e.to] = nd; prev[e.to] = { from: u, e }; }
            }
        }
        return { dist, prev };
    };
    const far = (dist) => { let m = 0; for (let i = 1; i < n; i++) if (dist[i] > dist[m]) m = i; return m; };
    const A = far(dijkstra(0).dist);
    const { dist, prev } = dijkstra(A);
    const B = far(dist);

    const steps = [];
    for (let u = B; prev[u]; u = prev[u].from) steps.push(prev[u]);
    steps.reverse();
    const segs = [];
    let cur = null;
    for (const { e } of steps) {
        if (e.chainIdx < 0) { if (cur) segs.push(cur); cur = null; continue; }
        const pts = e.fwd ? ch[e.chainIdx].pts : [...ch[e.chainIdx].pts].reverse();
        cur = cur ? cur.concat(pts.slice(1)) : [...pts];
    }
    if (cur) segs.push(cur);
    if (!segs.length) return [];
    if (vpt[B].lng < vpt[A].lng) return segs.reverse().map(s => s.reverse());
    return segs;
}

export function assembleRoute(ways) {
    return mainLine(mergeWaysByNodes(ways));
}

export async function buildOsmRoute(id) {
    const { rel, ways } = await fetchRelationWays(id);
    if (!rel?.tags?.name) return null;
    const segs = simplifyPath(assembleRoute(ways), 6000);
    if (!segs.length) return null;
    const tags = rel.tags;
    const first = segs[0][0];
    const desc = [tags['description:tr'], tags.description, tags['name:en'] && tags['name:en'] !== tags.name ? tags['name:en'] : null]
        .filter(Boolean).join('\n\n');
    const tagKm = tags.distance ? parseFloat(String(tags.distance).replace(',', '.')) : NaN;
    return {
        title: tags.name.slice(0, 200),
        startPlace: (tags.from || tags.name).slice(0, 200),
        endPlace: tags.to ? tags.to.slice(0, 200) : null,
        distanceKm: Number.isFinite(tagKm) && tagKm > 0 ? tagKm : pathLengthKm(segs),
        experience: `${desc ? `${desc}\n\n` : ''}${ATTRIBUTION}`,
        path: segs,
        startLat: first.lat,
        startLng: first.lng,
        source: 'OSM',
        sourceUrl: tags.website || `https://www.openstreetmap.org/relation/${id}`,
        stops: tags.via ? String(tags.via).split(/[;,]/).map(s => s.trim()).filter(Boolean).slice(0, 20) : [],
    };
}

export async function importOsmTravelRoutes({ ownerId, log = console.log } = {}) {
    const owner = ownerId
        ? { id: ownerId }
        : (await prisma.user.findFirst({ where: { isAdmin: true }, select: { id: true } }))
            || (await prisma.user.findFirst({ select: { id: true }, orderBy: { createdAt: 'asc' } }));
    if (!owner) throw new Error('Rota sahibi olacak kullanıcı yok');

    const ids = [...new Set([...KNOWN_TR_RELATIONS, ...(await overpassRouteIds())])];
    log(`[osmTravel] ${ids.length} rota denenecek`);

    let imported = 0;
    for (const id of ids) {
        try {
            const data = await buildOsmRoute(id);
            if (!data) continue;
            await prisma.travelRoute.upsert({
                where: { externalId: `osm:relation/${id}` },
                create: { ...data, userId: owner.id, externalId: `osm:relation/${id}` },
                update: data,
            });
            imported++;
            log(`[osmTravel] ✓ ${data.title} (${data.path.reduce((n, s) => n + s.length, 0)} nokta)`);
        } catch (e) {
            log(`[osmTravel] ✗ ${id}: ${e.message}`);
        }
        await sleep(1000);
    }
    return { found: ids.length, imported };
}

let running = false;

// Aynı anda iki içe aktarma OSM API'yi boşuna yormasın.
export async function runOsmImportOnce(opts) {
    if (running) return { alreadyRunning: true };
    running = true;
    try { return await importOsmTravelRoutes(opts); } finally { running = false; }
}

// Birleştirme algoritması değiştiğinde bu tarihi ileri al — eski geometriler açılışta yenilenir.
const ASSEMBLY_VERSION_AT = new Date('2026-09-30T12:15:00Z');

// Sunucu açılışında: OSM rotası yoksa ya da eski algoritmayla içe aktarıldıysa arka planda doldurur.
export async function seedOsmTravelRoutesIfEmpty() {
    try {
        const count = await prisma.travelRoute.count({ where: { source: 'OSM' } });
        const stale = await prisma.travelRoute.count({ where: { source: 'OSM', updatedAt: { lt: ASSEMBLY_VERSION_AT } } });
        if (count > 0 && stale === 0) return;
        const r = await runOsmImportOnce();
        console.log(`[osmTravel] ilk içe aktarma bitti: ${r.imported}/${r.found}`);
    } catch (e) {
        console.error('[osmTravel] içe aktarma başarısız:', e.message);
    }
}
