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
    if (!rel) return { rel: null, members: [] };
    const members = [];
    for (const m of rel.members || []) {
        if (SKIP_ROLES.has(m.role)) continue;
        if (m.type === 'way' && ways.has(m.ref)) {
            const geometry = ways.get(m.ref).nodes.map(n => nodes.get(n)).filter(Boolean).map(n => ({ lat: n.lat, lon: n.lon }));
            members.push({ type: 'way', role: m.role, geometry });
        } else if (m.type === 'relation' && depth < 1 && m.ref !== id) {
            await sleep(500);
            try {
                const child = await fetchRelationWays(m.ref, depth + 1);
                members.push(...child.members);
            } catch { /* eksik etap rotayı düşürmesin */ }
        }
    }
    return { rel, members };
}

// Relation üyesi way'leri, uç uca en yakın gelecek şekilde (gerekirse ters çevirerek)
// sıralı parçalara dizer; 1 km'den büyük boşlukta yeni parça açılır.
function chainWays(members) {
    const ways = members
        .filter(m => m.type === 'way' && Array.isArray(m.geometry) && m.geometry.length >= 2)
        .filter(m => !SKIP_ROLES.has(m.role));
    const segs = [];
    let cur = null;
    let curIsSingleWay = false;
    for (const w of ways) {
        let pts = w.geometry.map(g => ({ lat: g.lat, lng: g.lon }));
        if (!cur) { cur = pts; curIsSingleWay = true; continue; }
        // Parçanın ilk way'inin yönü henüz belli değil — ikinci way'e en yakın ucu sona gelsin.
        if (curIsSingleWay) {
            const a = cur[0], b = cur[cur.length - 1], c = pts[0], d = pts[pts.length - 1];
            if (Math.min(haversineM(a, c), haversineM(a, d)) < Math.min(haversineM(b, c), haversineM(b, d))) cur = cur.reverse();
        }
        const end = cur[cur.length - 1];
        const dStart = haversineM(end, pts[0]);
        const dEnd = haversineM(end, pts[pts.length - 1]);
        if (dEnd < dStart) pts = pts.reverse();
        if (Math.min(dStart, dEnd) > 1000) { segs.push(cur); cur = pts; curIsSingleWay = true; }
        else { cur = cur.concat(pts.slice(1)); curIsSingleWay = false; }
    }
    if (cur) segs.push(cur);
    // Tek way'lik kırıntılar (kopuk birkaç yüz metre) haritada gürültü — 300 m altını at.
    return segs.filter(s => s.length >= 2 && pathLengthKm([s]) >= 0.3);
}

export async function buildOsmRoute(id) {
    const { rel, members } = await fetchRelationWays(id);
    if (!rel?.tags?.name) return null;
    const segs = simplifyPath(chainWays(members));
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

// Sunucu açılışında bir kez: hiç OSM rotası yoksa arka planda doldurur.
export async function seedOsmTravelRoutesIfEmpty() {
    try {
        const count = await prisma.travelRoute.count({ where: { source: 'OSM' } });
        if (count > 0) return;
        const r = await runOsmImportOnce();
        console.log(`[osmTravel] ilk içe aktarma bitti: ${r.imported}/${r.found}`);
    } catch (e) {
        console.error('[osmTravel] içe aktarma başarısız:', e.message);
    }
}
