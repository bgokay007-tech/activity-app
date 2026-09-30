const toRad = (v) => (v * Math.PI) / 180;

export function haversineM(a, b) {
    const R = 6371000;
    const dLat = toRad(b.lat - a.lat);
    const dLng = toRad(b.lng - a.lng);
    const s = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(s), Math.sqrt(1 - s));
}

const isPt = (p) => p && Number.isFinite(p.lat) && Number.isFinite(p.lng);

// Eski/elle gelen tek boyutlu [{lat,lng}] dizisini de parçalı biçime çevirir.
export function normalizePath(path) {
    if (!Array.isArray(path) || path.length === 0) return [];
    const segs = Array.isArray(path[0]) ? path : [path];
    return segs
        .map(seg => (Array.isArray(seg) ? seg : [])
            .map(p => ({ lat: Number(p.lat), lng: Number(p.lng ?? p.lon) }))
            .filter(isPt))
        .filter(seg => seg.length >= 2);
}

export function pathLengthKm(segs) {
    let m = 0;
    for (const seg of segs) for (let i = 1; i < seg.length; i++) m += haversineM(seg[i - 1], seg[i]);
    return Math.round(m / 100) / 10;
}

function perpDistM(p, a, b) {
    // Kısa parçalarda düzlem yaklaşımı yeterli.
    const k = Math.cos(toRad((a.lat + b.lat) / 2)) * 111320;
    const ax = a.lng * k, ay = a.lat * 110540, bx = b.lng * k, by = b.lat * 110540, px = p.lng * k, py = p.lat * 110540;
    const dx = bx - ax, dy = by - ay;
    const len2 = dx * dx + dy * dy;
    const tt = len2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2)) : 0;
    return Math.hypot(px - (ax + tt * dx), py - (ay + tt * dy));
}

function douglasPeucker(pts, tolM) {
    if (pts.length < 3) return pts;
    const keep = new Uint8Array(pts.length);
    keep[0] = keep[pts.length - 1] = 1;
    const stack = [[0, pts.length - 1]];
    while (stack.length) {
        const [s, e] = stack.pop();
        let maxD = 0, idx = -1;
        for (let i = s + 1; i < e; i++) {
            const d = perpDistM(pts[i], pts[s], pts[e]);
            if (d > maxD) { maxD = d; idx = i; }
        }
        if (maxD > tolM && idx > 0) { keep[idx] = 1; stack.push([s, idx], [idx, e]); }
    }
    return pts.filter((_, i) => keep[i]);
}

// Telefona inen/çevrimdışı saklanan veri küçük kalsın diye nokta sayısı sınırlanır.
export function simplifyPath(segs, maxPoints = 4000) {
    let tol = 8;
    let out = segs;
    for (let i = 0; i < 8; i++) {
        out = segs.map(seg => douglasPeucker(seg, tol)).filter(seg => seg.length >= 2);
        if (out.reduce((n, s) => n + s.length, 0) <= maxPoints) break;
        tol *= 1.8;
    }
    return out.map(seg => seg.map(p => ({ lat: Math.round(p.lat * 1e6) / 1e6, lng: Math.round(p.lng * 1e6) / 1e6 })));
}

export function toGpx(name, segs) {
    const esc = (s) => String(s || '').replace(/[<>&"]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
    const trksegs = segs.map(seg => `    <trkseg>\n${seg.map(p => `      <trkpt lat="${p.lat}" lon="${p.lng}"></trkpt>`).join('\n')}\n    </trkseg>`).join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="Activity" xmlns="http://www.topografix.com/GPX/1/1">\n  <metadata><name>${esc(name)}</name></metadata>\n  <trk>\n    <name>${esc(name)}</name>\n${trksegs}\n  </trk>\n</gpx>\n`;
}
