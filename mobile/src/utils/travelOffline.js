import * as FileSystem from 'expo-file-system/legacy';
import AsyncStorage from '@react-native-async-storage/async-storage';

const INDEX_KEY = 'travel_offline_index';
const ROOT = `${FileSystem.documentDirectory}travel/`;
const TILE_URL = 'https://tile.openstreetmap.org';
const UA = 'ActivityApp/1.0 (offline travel route)';
// OSM tile politikası: z13 ve üstünde toplu indirme 250 karoyu geçmesin.
const HIGH_ZOOM_BUDGET = 250;
const LOW_ZOOM_BUDGET = 400;
const MIN_Z = 6;
const MAX_Z = 16;

const toRad = (v) => (v * Math.PI) / 180;

export function haversineM(a, b) {
    const R = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

export function normalizeSegments(path) {
    if (!Array.isArray(path) || !path.length) return [];
    const segs = Array.isArray(path[0]) ? path : [path];
    return segs
        .map(seg => (Array.isArray(seg) ? seg : [])
            .map(p => ({ lat: Number(p.lat), lng: Number(p.lng ?? p.lon) }))
            .filter(p => Number.isFinite(p.lat) && Number.isFinite(p.lng)))
        .filter(seg => seg.length >= 2);
}

// Navigasyon için: parçalar arası boşluk mesafeye eklenmez.
export function buildNavModel(path) {
    const segs = normalizeSegments(path);
    const edges = [];
    let total = 0;
    for (const seg of segs) {
        for (let i = 1; i < seg.length; i++) {
            const len = haversineM(seg[i - 1], seg[i]);
            edges.push({ a: seg[i - 1], b: seg[i], start: total, len });
            total += len;
        }
    }
    const lastSeg = segs[segs.length - 1];
    return {
        segs, edges, totalM: total,
        start: segs[0]?.[0] || null,
        end: lastSeg ? lastSeg[lastSeg.length - 1] : null,
    };
}

function projectOnEdge(p, a, b) {
    const k = Math.cos(toRad((a.lat + b.lat) / 2)) * 111320;
    const ax = a.lng * k, ay = a.lat * 110540, bx = b.lng * k, by = b.lat * 110540, px = p.lng * k, py = p.lat * 110540;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const tt = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    return { t: tt, d: Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy)) };
}

// Kullanıcının rotaya en yakın noktası: sapma (m), ilerleme (m), kalan (m).
export function navProgress(model, pos) {
    if (!model?.edges?.length || !pos) return null;
    let best = { d: Infinity, along: 0, idx: 0, t: 0 };
    model.edges.forEach((e, idx) => {
        const { t: tt, d } = projectOnEdge(pos, e.a, e.b);
        if (d < best.d) best = { d, along: e.start + tt * e.len, idx, t: tt };
    });
    const be = model.edges[best.idx];
    const nearest = { lat: be.a.lat + (be.b.lat - be.a.lat) * best.t, lng: be.a.lng + (be.b.lng - be.a.lng) * best.t };
    const remainingM = Math.max(0, model.totalM - best.along);
    const toEndM = model.end ? haversineM(pos, model.end) : Infinity;
    return {
        offRouteM: best.d,
        progressM: best.along,
        remainingM,
        pct: model.totalM ? Math.min(100, Math.round((best.along / model.totalM) * 100)) : 0,
        toStartM: model.start ? haversineM(pos, model.start) : null,
        arrived: toEndM < 60 || (remainingM < 60 && best.d < 80),
        edgeIdx: best.idx,
        nearest,
    };
}

// Rotanın geçilen kısmı (başlangıçtan en yakın noktaya) — parça kopukluklarında ayrı çizgi.
export function donePolylines(model, prog) {
    if (!model?.edges?.length || !prog) return [];
    const lines = [];
    let cur = [];
    for (let i = 0; i < prog.edgeIdx; i++) {
        const e = model.edges[i];
        const prev = model.edges[i - 1];
        if (prev && (prev.b.lat !== e.a.lat || prev.b.lng !== e.a.lng)) { if (cur.length > 1) lines.push(cur); cur = []; }
        if (!cur.length) cur.push(e.a);
        cur.push(e.b);
    }
    const last = model.edges[prog.edgeIdx];
    if (!cur.length) cur.push(last.a);
    cur.push(prog.nearest);
    if (cur.length > 1) lines.push(cur);
    return lines;
}

// OSM tabanlı yönlendirme (FOSSGIS OSRM) — Google Haritalar'a çıkmadan rotaya/başlangıca yol.
export async function fetchDirections(from, to, mode = 'car') {
    const profile = mode === 'foot' ? 'routed-foot' : 'routed-car';
    const url = `https://routing.openstreetmap.de/${profile}/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?overview=full&geometries=geojson`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const j = await res.json();
    const r = j.routes?.[0];
    if (!r) throw new Error('NO_ROUTE');
    return {
        coords: r.geometry.coordinates.map(([lng, lat]) => ({ lat, lng })),
        distanceM: r.distance,
        durationS: r.duration,
        mode,
        target: to,
    };
}

// Saat/Strava/Wikiloc dışa aktarımları: trkseg parçaları, rtept, lat/lon sırası karışık olabilir.
export function parseGpxSegments(xml) {
    const ptRe = /<(?:trkpt|rtept)\b([^>]*)>/g;
    const attr = (s, k) => { const m = s.match(new RegExp(`\\b${k}\\s*=\\s*["']([-0-9.eE+]+)["']`)); return m ? parseFloat(m[1]) : NaN; };
    const chunks = /<trkseg\b/.test(xml) ? xml.split(/<trkseg\b/).slice(1) : [xml];
    const segs = [];
    for (const chunk of chunks) {
        const seg = [];
        let m;
        ptRe.lastIndex = 0;
        while ((m = ptRe.exec(chunk)) !== null) {
            const lat = attr(m[1], 'lat'), lng = attr(m[1], 'lon');
            if (Number.isFinite(lat) && Number.isFinite(lng)) seg.push({ lat, lng });
        }
        if (seg.length >= 2) segs.push(seg);
    }
    return segs;
}

export function segmentsLengthKm(segs) {
    let m = 0;
    for (const seg of segs) for (let i = 1; i < seg.length; i++) m += haversineM(seg[i - 1], seg[i]);
    return Math.round(m / 100) / 10;
}

export function regionForSegments(segs) {
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const seg of segs) for (const p of seg) {
        if (p.lat < minLat) minLat = p.lat; if (p.lat > maxLat) maxLat = p.lat;
        if (p.lng < minLng) minLng = p.lng; if (p.lng > maxLng) maxLng = p.lng;
    }
    if (minLat > maxLat) return null;
    return {
        latitude: (minLat + maxLat) / 2,
        longitude: (minLng + maxLng) / 2,
        latitudeDelta: Math.max(0.01, (maxLat - minLat) * 1.3),
        longitudeDelta: Math.max(0.01, (maxLng - minLng) * 1.3),
    };
}

// ─── Karolar ────────────────────────────────────────────────────────────────

function tileXY(lat, lng, z) {
    const n = 2 ** z;
    const x = Math.floor(((lng + 180) / 360) * n);
    const r = toRad(lat);
    const y = Math.floor(((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * n);
    return [Math.max(0, Math.min(n - 1, x)), Math.max(0, Math.min(n - 1, y))];
}

// Rota çizgisine değen karolar; aralar sıklaştırılır ki uzun düz kenarda boşluk kalmasın.
function corridorTiles(segs, z) {
    const set = new Set();
    const tileM = (40075016 / 2 ** z) * 0.5;
    for (const seg of segs) {
        for (let i = 0; i < seg.length; i++) {
            const p = seg[i];
            const [x, y] = tileXY(p.lat, p.lng, z);
            set.add(`${x}/${y}`);
            if (i === 0) continue;
            const q = seg[i - 1];
            const steps = Math.floor(haversineM(q, p) / tileM);
            for (let k = 1; k <= steps; k++) {
                const f = k / (steps + 1);
                const [ix, iy] = tileXY(q.lat + (p.lat - q.lat) * f, q.lng + (p.lng - q.lng) * f, z);
                set.add(`${ix}/${iy}`);
            }
        }
    }
    return [...set].map(k => { const [x, y] = k.split('/').map(Number); return { z, x, y }; });
}

export function planTiles(segs) {
    const tiles = [];
    let low = 0;
    for (let z = MIN_Z; z <= 12; z++) {
        const zt = corridorTiles(segs, z);
        if (low + zt.length > LOW_ZOOM_BUDGET) break;
        tiles.push(...zt);
        low += zt.length;
    }
    let maxZ = Math.max(MIN_Z, ...tiles.map(t => t.z));
    let high = 0;
    for (let z = 13; z <= MAX_Z; z++) {
        const zt = corridorTiles(segs, z);
        if (high + zt.length > HIGH_ZOOM_BUDGET) break;
        tiles.push(...zt);
        high += zt.length;
        maxZ = z;
    }
    return { tiles, maxZ };
}

const routeDir = (id) => `${ROOT}${id}/`;

export const tilePathTemplate = (id) =>
    `${routeDir(id).replace(/^file:\/\//, '')}tiles/{z}/{x}/{y}.png`;

async function readIndex() {
    try { return JSON.parse((await AsyncStorage.getItem(INDEX_KEY)) || '[]'); } catch { return []; }
}

export async function listOfflineRoutes() {
    return readIndex();
}

export async function getOfflineEntry(id) {
    return (await readIndex()).find(e => e.id === id) || null;
}

export async function loadOfflineRoute(id) {
    try {
        const raw = await FileSystem.readAsStringAsync(`${routeDir(id)}route.json`);
        return JSON.parse(raw);
    } catch { return null; }
}

export async function deleteOfflineRoute(id) {
    await FileSystem.deleteAsync(routeDir(id), { idempotent: true }).catch(() => {});
    const idx = (await readIndex()).filter(e => e.id !== id);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx));
}

// onProgress(0..1). Rota JSON'u da saklanır — liste ve detay internetsiz açılsın.
export async function downloadOfflineRoute(route, onProgress) {
    const segs = normalizeSegments(route.path);
    if (!segs.length) throw new Error('NO_PATH');
    const dir = routeDir(route.id);
    await FileSystem.makeDirectoryAsync(`${dir}tiles`, { intermediates: true }).catch(() => {});
    const { tiles, maxZ } = planTiles(segs);

    const madeDirs = new Set();
    let done = 0;
    let failed = 0;
    let cursor = 0;
    const worker = async () => {
        while (cursor < tiles.length) {
            const tile = tiles[cursor++];
            const xDir = `${dir}tiles/${tile.z}/${tile.x}`;
            if (!madeDirs.has(xDir)) {
                madeDirs.add(xDir);
                await FileSystem.makeDirectoryAsync(xDir, { intermediates: true }).catch(() => {});
            }
            const file = `${xDir}/${tile.y}.png`;
            try {
                const info = await FileSystem.getInfoAsync(file);
                if (!info.exists) {
                    const r = await FileSystem.downloadAsync(`${TILE_URL}/${tile.z}/${tile.x}/${tile.y}.png`, file, { headers: { 'User-Agent': UA } });
                    if (r.status !== 200) { failed++; await FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {}); }
                }
            } catch { failed++; }
            done++;
            onProgress?.(done / tiles.length);
        }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    if (failed > tiles.length * 0.5) throw new Error('TILES_FAILED');

    const { reviews, ...rest } = route;
    await FileSystem.writeAsStringAsync(`${dir}route.json`, JSON.stringify(rest));
    const entry = {
        id: route.id, title: route.title, startPlace: route.startPlace, endPlace: route.endPlace,
        distanceKm: route.distanceKm, source: route.source, maxZ, tiles: tiles.length - failed, savedAt: Date.now(),
    };
    const idx = (await readIndex()).filter(e => e.id !== route.id);
    idx.unshift(entry);
    await AsyncStorage.setItem(INDEX_KEY, JSON.stringify(idx));
    return entry;
}
