// Tenis kortu geometrisi + görüntü → kort (metre) homografisi.
// Kalibrasyon: kullanıcı videonun bir karesinde çiftler kortunun 4 dış köşesine dokunur
// (sıra: uzak-sol, uzak-sağ, yakın-sağ, yakın-sol; "yakın" = kameraya yakın taraf).
// Kort koordinatı: x 0..10.97 (soldan sağa), y 0 (uzak dip çizgi) .. 23.77 (yakın dip çizgi).

export const COURT = {
    W: 10.97,
    L: 23.77,
    SINGLES_IN: 1.372,
    NET_Y: 11.885,
    SERVICE_FROM_NET: 6.40,
};

export const COURT_CORNERS = [[0, 0], [COURT.W, 0], [COURT.W, COURT.L], [0, COURT.L]];

// 4 nokta eşlemesinden 3x3 homografi (DLT, h33 = 1). src/dst: [[x,y]×4].
export function solveHomography(src, dst) {
    const A = [];
    const b = [];
    for (let i = 0; i < 4; i++) {
        const [x, y] = src[i];
        const [X, Y] = dst[i];
        A.push([x, y, 1, 0, 0, 0, -x * X, -y * X]); b.push(X);
        A.push([0, 0, 0, x, y, 1, -x * Y, -y * Y]); b.push(Y);
    }
    const n = 8;
    for (let c = 0; c < n; c++) {
        let piv = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(A[r][c]) > Math.abs(A[piv][c])) piv = r;
        if (Math.abs(A[piv][c]) < 1e-12) throw new Error('Kalibrasyon noktaları geçersiz (aynı doğru üzerinde)');
        [A[c], A[piv]] = [A[piv], A[c]];
        [b[c], b[piv]] = [b[piv], b[c]];
        for (let r = 0; r < n; r++) {
            if (r === c) continue;
            const f = A[r][c] / A[c][c];
            if (!f) continue;
            for (let k = c; k < n; k++) A[r][k] -= f * A[c][k];
            b[r] -= f * b[c];
        }
    }
    const h = b.map((v, i) => v / A[i][i]);
    return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1];
}

export function applyH(H, x, y) {
    const w = H[6] * x + H[7] * y + H[8];
    return [(H[0] * x + H[1] * y + H[2]) / w, (H[3] * x + H[4] * y + H[5]) / w];
}

// calibration.corners: [{x,y}] normalize (0..1), video karesi boyutunda piksele çevrilir.
export function courtHomography(calibration, width, height) {
    const pts = (calibration?.corners || []).map(p => [p.x * width, p.y * height]);
    if (pts.length !== 4 || pts.some(p => !Number.isFinite(p[0]) || !Number.isFinite(p[1]))) {
        throw new Error('Kort kalibrasyonu eksik');
    }
    return {
        H: solveHomography(pts, COURT_CORNERS),
        Hinv: solveHomography(COURT_CORNERS, pts),
        imgCorners: pts,
    };
}

export const isFarSide = (courtY) => courtY < COURT.NET_Y;

// Yakın dip çizgiden uzak dip çizgiye yön görüntüde "yukarı" olmalı. Değilse (telefon yan
// tutulup dikey kayıt) kareyi döndürecek ffmpeg yönü: 'cw' | 'ccw' | '180' | null.
export function uprightRotation(calibration) {
    const c = calibration?.corners;
    if (!Array.isArray(c) || c.length !== 4) return null;
    const dx = (c[0].x + c[1].x - c[2].x - c[3].x) / 2;
    const dy = (c[0].y + c[1].y - c[2].y - c[3].y) / 2;
    if (Math.abs(dy) >= Math.abs(dx)) return dy <= 0 ? null : '180';
    return dx > 0 ? 'ccw' : 'cw';
}

// Normalize (0..1) noktayı döndürülmüş karedeki konumuna taşı
export function rotateNorm(p, rotate) {
    if (!p) return p;
    if (rotate === 'cw') return { ...p, x: 1 - p.y, y: p.x };
    if (rotate === 'ccw') return { ...p, x: p.y, y: 1 - p.x };
    if (rotate === '180') return { ...p, x: 1 - p.x, y: 1 - p.y };
    return p;
}

export function inCourt(x, y, { doubles = false, margin = 0 } = {}) {
    const x0 = doubles ? 0 : COURT.SINGLES_IN;
    const x1 = doubles ? COURT.W : COURT.W - COURT.SINGLES_IN;
    return x >= x0 - margin && x <= x1 + margin && y >= -margin && y <= COURT.L + margin;
}

// Servis kutusu: servisi atan tarafın çaprazındaki kutu (karşı yarı saha, file ile servis çizgisi arası).
export function inServiceBox(x, y, serverCourt, margin = 0.05) {
    const serverFar = isFarSide(serverCourt[1]);
    const mid = COURT.W / 2;
    const targetLeft = serverCourt[0] >= mid; // çapraz: sunucu sağdaysa hedef sol yarı
    const xOk = targetLeft
        ? x >= COURT.SINGLES_IN - margin && x <= mid + margin
        : x >= mid - margin && x <= COURT.W - COURT.SINGLES_IN + margin;
    const yOk = serverFar
        ? y >= COURT.NET_Y - margin && y <= COURT.NET_Y + COURT.SERVICE_FROM_NET + margin
        : y >= COURT.NET_Y - COURT.SERVICE_FROM_NET - margin && y <= COURT.NET_Y + margin;
    return xOk && yOk;
}
