// 1. geçiş (gri, tam kare hızı): top adayları (üç kare farkı → küçük hareketli lekeler) ve
// oyuncu kutuları (yavaş güncellenen arka plan modeli → büyük ön plan lekeleri).
// 2. geçiş (renkli, 1 fps, küçük): oyuncu kutularının kıyafet renk histogramı — kimlik
// (kim hangi tarafta) ve oyuncu tanıtımı için.
// Derin öğrenme modeli yok: Railway CPU'da saatlik maçı makul sürede işlemek için klasik
// görüntü işleme. Doğruluk kamera açısına çok bağlı (sabit tripod, kortun tamamı kadrajda).
import { decodeFrames, probeDuration } from './decode.js';

export const DETECT_FPS = 30;
export const LONG_SIDE = 960;
export const PLAYER_EVERY = 3;   // oyuncu tespiti her 3 karede bir (10 Hz)
const SMALL = 4;                 // oyuncu tespiti 1/4 çözünürlükte
const DIFF_T = 14;
const FG_T = 24;
const FG_C = 10;   // renk (U/V) farkı: gri tonda zeminle aynı parlaklıktaki formayı da yakalar
const MAX_CANDS = 24;

// Kort çokgeninin etrafında ilgi alanı: top uzak tarafta görüntüde kortun üstüne çıkar.
export function roiFromCorners(imgCorners, width, height) {
    const xs = imgCorners.map(p => p[0]), ys = imgCorners.map(p => p[1]);
    const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
    const w = maxX - minX, h = maxY - minY;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(v)));
    return {
        x0: clamp(minX - 0.12 * w, 0, width - 1),
        x1: clamp(maxX + 0.12 * w, 0, width - 1),
        y0: clamp(minY - 0.7 * h, 0, height - 1),
        y1: clamp(maxY + 0.12 * h, 0, height - 1),
    };
}

export async function detectPass({ input, getRoi, onProgress, rotate = null }) {
    let W = 0, H = 0, roi = null, duration = 0;
    let mask, stack, small, bg, fgS, fgD, sw = 0, sh = 0, sroi = null;
    const frames = [null, null, null];
    const ball = [];      // ball[f] = [x,y,area, ...] | null
    const players = [];   // players[f/PLAYER_EVERY] = [x0,y0,x1,y1,area, ...]
    let bgInit = false;
    let playerTick = 0;
    let lastProg = 0;
    const scale = () => Math.max(0.5, W / LONG_SIDE);

    const ballCandidates = (prev, cur, next) => {
        const { x0, x1, y0, y1 } = roi;
        let count = 0;
        for (let y = y0; y <= y1; y++) {
            let i = y * W + x0;
            for (let x = x0; x <= x1; x++, i++) {
                const c = cur[i];
                const a = c - prev[i], b = next[i] - c;
                const on = (a > DIFF_T || a < -DIFF_T) && (b > DIFF_T || b < -DIFF_T) ? 1 : 0;
                mask[i] = on;
                count += on;
            }
        }
        const roiArea = (x1 - x0 + 1) * (y1 - y0 + 1);
        if (count === 0 || count > roiArea * 0.03) return null; // titreme / ışık patlaması
        const s = scale();
        const minA = 2, maxA = Math.round(420 * s * s), maxDim = Math.round(40 * s);
        const out = [];
        for (let y = y0; y <= y1; y++) {
            let i = y * W + x0;
            for (let x = x0; x <= x1; x++, i++) {
                if (mask[i] !== 1) continue;
                let sp = 0; stack[sp++] = i; mask[i] = 2;
                let area = 0, sx = 0, sy = 0, bx0 = x, bx1 = x, by0 = y, by1 = y;
                while (sp > 0) {
                    const j = stack[--sp];
                    const jy = (j / W) | 0, jx = j - jy * W;
                    area++; sx += jx; sy += jy;
                    if (jx < bx0) bx0 = jx; if (jx > bx1) bx1 = jx;
                    if (jy < by0) by0 = jy; if (jy > by1) by1 = jy;
                    if (jx > x0 && mask[j - 1] === 1) { mask[j - 1] = 2; stack[sp++] = j - 1; }
                    if (jx < x1 && mask[j + 1] === 1) { mask[j + 1] = 2; stack[sp++] = j + 1; }
                    if (jy > y0 && mask[j - W] === 1) { mask[j - W] = 2; stack[sp++] = j - W; }
                    if (jy < y1 && mask[j + W] === 1) { mask[j + W] = 2; stack[sp++] = j + W; }
                }
                if (area < minA || area > maxA) continue;
                if (bx1 - bx0 + 1 > maxDim || by1 - by0 + 1 > maxDim) continue;
                out.push(sx / area, sy / area, area);
                if (out.length >= MAX_CANDS * 3) return out;
            }
        }
        return out.length ? out : null;
    };

    // Küçük ızgara 3 düzlem: [Y | U | V]. yuv420p'de U/V yarım çözünürlük → 4x4 Y bloğu = 2x2 renk.
    const toSmall = (cur, dst) => {
        const { x0, x1, y0, y1 } = sroi;
        const N = sw * sh, cw = W >> 1, uOff = W * H, vOff = uOff + cw * (H >> 1);
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                let sum = 0;
                const by = y * SMALL, bx = x * SMALL;
                for (let dy = 0; dy < SMALL; dy++) {
                    const i = (by + dy) * W + bx;
                    sum += cur[i] + cur[i + 1] + cur[i + 2] + cur[i + 3];
                }
                const o = y * sw + x;
                dst[o] = sum / 16;
                const c0 = (y * 2) * cw + x * 2, c1 = c0 + cw;
                dst[N + o] = (cur[uOff + c0] + cur[uOff + c0 + 1] + cur[uOff + c1] + cur[uOff + c1 + 1]) / 4;
                dst[2 * N + o] = (cur[vOff + c0] + cur[vOff + c0 + 1] + cur[vOff + c1] + cur[vOff + c1 + 1]) / 4;
            }
        }
    };

    const playerBoxes = (cur) => {
        const { x0, x1, y0, y1 } = sroi;
        toSmall(cur, small);
        if (!bgInit) { bg.set(small); bgInit = true; }
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = y * sw + x;
                const N = sw * sh;
                const d = small[i] - bg[i];
                const du = small[N + i] - bg[N + i], dv = small[2 * N + i] - bg[2 * N + i];
                fgS[i] = d > FG_T || d < -FG_T || du > FG_C || du < -FG_C || dv > FG_C || dv < -FG_C ? 1 : 0;
            }
        }
        // 3x3 genişletme: gövde parçaları tek lekede birleşsin
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                const i = y * sw + x;
                let v = 0;
                for (let dy = -1; dy <= 1 && !v; dy++) {
                    const yy = y + dy; if (yy < y0 || yy > y1) continue;
                    for (let dx = -1; dx <= 1; dx++) {
                        const xx = x + dx; if (xx < x0 || xx > x1) continue;
                        if (fgS[yy * sw + xx]) { v = 1; break; }
                    }
                }
                fgD[i] = v;
            }
        }
        // Arka plan: ön planda yavaş (duran oyuncu hemen silinmesin), diğer yerde orta hızda.
        if (playerTick % 2 === 0) {
            for (let y = y0; y <= y1; y++) {
                for (let x = x0; x <= x1; x++) {
                    const i = y * sw + x;
                    const a = fgS[i] ? 0.004 : 0.03;
                    for (let c = 0, N = sw * sh; c < 3; c++) bg[c * N + i] += a * (small[c * N + i] - bg[c * N + i]);
                }
            }
        }
        const boxes = [];
        for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
                let i = y * sw + x;
                if (fgD[i] !== 1) continue;
                let sp = 0; stack[sp++] = i; fgD[i] = 2;
                let area = 0, bx0 = x, bx1 = x, by0 = y, by1 = y;
                while (sp > 0) {
                    const j = stack[--sp];
                    const jy = (j / sw) | 0, jx = j - jy * sw;
                    area++;
                    if (jx < bx0) bx0 = jx; if (jx > bx1) bx1 = jx;
                    if (jy < by0) by0 = jy; if (jy > by1) by1 = jy;
                    if (jx > x0 && fgD[j - 1] === 1) { fgD[j - 1] = 2; stack[sp++] = j - 1; }
                    if (jx < x1 && fgD[j + 1] === 1) { fgD[j + 1] = 2; stack[sp++] = j + 1; }
                    if (jy > y0 && fgD[j - sw] === 1) { fgD[j - sw] = 2; stack[sp++] = j - sw; }
                    if (jy < y1 && fgD[j + sw] === 1) { fgD[j + sw] = 2; stack[sp++] = j + sw; }
                }
                if (area < 6 || (by1 - by0) < 3) continue;
                boxes.push([bx0, by0, bx1 + 1, by1 + 1, area]);
            }
        }
        // Yakın kutuları birleştir (kol/bacak ayrı leke kalmasın)
        let merged = true;
        while (merged && boxes.length > 1) {
            merged = false;
            outer: for (let a = 0; a < boxes.length; a++) {
                for (let b = a + 1; b < boxes.length; b++) {
                    const A = boxes[a], B = boxes[b];
                    const gx = Math.max(0, Math.max(A[0], B[0]) - Math.min(A[2], B[2]));
                    const gy = Math.max(0, Math.max(A[1], B[1]) - Math.min(A[3], B[3]));
                    if (gx <= 2 && gy <= 3) {
                        boxes[a] = [Math.min(A[0], B[0]), Math.min(A[1], B[1]), Math.max(A[2], B[2]), Math.max(A[3], B[3]), A[4] + B[4]];
                        boxes.splice(b, 1);
                        merged = true;
                        break outer;
                    }
                }
            }
        }
        const out = [];
        for (const b of boxes.sort((p, q) => q[4] - p[4]).slice(0, 12)) {
            out.push(b[0] * SMALL, b[1] * SMALL, b[2] * SMALL, b[3] * SMALL, b[4] * SMALL * SMALL);
        }
        return out;
    };

    const init = (inf) => {
            if (W === inf.width && H === inf.height) return;
            W = inf.width; H = inf.height;
            roi = getRoi(W, H);
            mask = new Uint8Array(W * H);
            stack = new Int32Array(W * H);
            sw = Math.floor(W / SMALL); sh = Math.floor(H / SMALL);
            small = new Float32Array(sw * sh * 3);
            bg = new Float32Array(sw * sh * 3);
            fgS = new Uint8Array(sw * sh);
            fgD = new Uint8Array(sw * sh);
            sroi = {
                x0: Math.floor(roi.x0 / SMALL), x1: Math.min(sw - 1, Math.floor(roi.x1 / SMALL)),
                y0: Math.floor(roi.y0 / SMALL), y1: Math.min(sh - 1, Math.floor(roi.y1 / SMALL)),
            };
    };

    // Boş kort arka planı: videoya yayılmış ~40 karenin piksel medyanı. Oyuncular hareket ettiği
    // için medyanda kaybolurlar; ilk kareyle başlatınca tanıtımda duran oyuncu arka plana karışıyordu.
    const probed = await probeDuration(input);
    const bgSamples = [];
    await decodeFrames({
        input, rotate, fps: probed > 0 ? Math.min(2, 41 / probed).toFixed(4) : 0.5, longSide: LONG_SIDE, pixFmt: 'yuv420p',
        onInfo: init,
        onFrame: (frame) => {
            if (bgSamples.length >= 61) return;
            const smp = new Float32Array(sw * sh * 3);
            toSmall(frame, smp);
            bgSamples.push(smp);
        },
    });
    if (bgSamples.length >= 5) {
        const col = new Float32Array(bgSamples.length);
        const mid = bgSamples.length >> 1;
        for (let i = 0; i < sw * sh * 3; i++) {
            for (let k = 0; k < bgSamples.length; k++) col[k] = bgSamples[k][i];
            col.sort();
            bg[i] = col[mid];
        }
        bgInit = true;
    }
    bgSamples.length = 0;

    const info = await decodeFrames({
        input, rotate, fps: DETECT_FPS, longSide: LONG_SIDE, pixFmt: 'yuv420p',
        onInfo: (inf) => { init(inf); duration = inf.duration || probed; },
        onFrame: (frame, i) => {
            frames[0] = frames[1]; frames[1] = frames[2]; frames[2] = frame;
            if (i % PLAYER_EVERY === 0) { players[i / PLAYER_EVERY] = playerBoxes(frame); playerTick++; }
            if (i >= 2) {
                let c = ballCandidates(frames[0], frames[1], frames[2]);
                // Oyuncu gövdesi içindeki küçük hareketler (kol, bacak, kıyafet) top değil —
                // bunlar uzun yavaş izler oluşturup gerçek top izini bastırıyordu.
                const pb = players[Math.floor((i - 1) / PLAYER_EVERY)];
                if (c && pb?.length) {
                    const keep = [];
                    const minH = 28 * scale();
                    for (let k = 0; k < c.length; k += 3) {
                        const x = c[k], y = c[k + 1];
                        let inside = false;
                        for (let q = 0; q < pb.length; q += 5) {
                            const bw = pb[q + 2] - pb[q], bh = pb[q + 3] - pb[q + 1];
                            if (bh < minH) continue; // topun kendi ön plan lekesi

                            if (x > pb[q] + 0.1 * bw && x < pb[q + 2] - 0.1 * bw && y > pb[q + 1] + 0.15 * bh && y < pb[q + 3]) { inside = true; break; }
                        }
                        if (!inside) keep.push(x, y, c[k + 2]);
                    }
                    c = keep.length ? keep : null;
                }
                ball[i - 1] = c;
            }
            if (onProgress && duration && i - lastProg >= DETECT_FPS * 10) {
                lastProg = i;
                onProgress(Math.min(0.99, i / (duration * DETECT_FPS)));
            }
        },
    });
    ball[0] = null;
    return { width: W, height: H, fps: DETECT_FPS, frames: info.frames, duration: info.duration || info.frames / DETECT_FPS, roi, ball, players, playerEvery: PLAYER_EVERY };
}

// Kıyafet rengi histogramı: kutunun üst %55'i (gövde), rg-kromatiklik 4x4 + parlaklık 4 = 64 kutu.
export function boxHistogram(rgb, w, h, box) {
    const hist = new Float32Array(64);
    const x0 = Math.max(0, Math.floor(box[0])), x1 = Math.min(w - 1, Math.ceil(box[2]));
    const y0 = Math.max(0, Math.floor(box[1])), y1 = Math.min(h - 1, Math.floor(box[1] + (box[3] - box[1]) * 0.55));
    let n = 0;
    for (let y = y0; y <= y1; y++) {
        for (let x = x0; x <= x1; x++) {
            const i = (y * w + x) * 3;
            const r = rgb[i], g = rgb[i + 1], b = rgb[i + 2];
            const s = r + g + b + 1;
            const rb = Math.min(3, ((r / s) * 8) | 0) ;
            const gb = Math.min(3, ((g / s) * 8) | 0);
            const lb = Math.min(3, (s / 192) | 0);
            hist[rb * 16 + gb * 4 + lb]++;
            n++;
        }
    }
    if (n) for (let k = 0; k < 64; k++) hist[k] /= n;
    return n ? Array.from(hist, v => Math.round(v * 1e4) / 1e4) : null;
}

export async function colorPass({ input, detWidth, sampleFps = 1, longSide = 320, boxesAt, rotate = null }) {
    const samples = [];
    let cw = 0, ch = 0;
    await decodeFrames({
        input, rotate, fps: sampleFps, longSide, pixFmt: 'rgb24',
        onInfo: (inf) => { cw = inf.width; ch = inf.height; },
        onFrame: (frame, i) => {
            const t = i / sampleFps;
            const items = boxesAt(t);
            if (!items?.length) return;
            const s = cw / detWidth;
            samples.push({
                t,
                items: items.map(it => ({ ...it, hist: boxHistogram(frame, cw, ch, it.box.map(v => v * s)) })),
            });
        },
    });
    return samples;
}
