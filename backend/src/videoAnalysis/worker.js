// Tek videoyu analiz eden alt süreç (jobs/matchVideoJob.js fork eder). Ana sunucunun event
// loop'unu kilitlememek ve olası bellek taşmasında API'yi düşürmemek için ayrı süreçte.
import '../config/env.js';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';
import prisma from '../config/prisma.js';
import { presignGet } from '../utils/r2Storage.js';
import { detectPass, colorPass, roiFromCorners } from './detect.js';
import { analyzeTennis, courtPlayersAt } from './tennisAnalyzer.js';
import { courtHomography, uprightRotation, rotateNorm } from './geometry.js';

const id = process.argv[2];
let tmpFile = null;

// Girdi birkaç kez okunur (arka plan, tespit, renk) ve uzun HTTPS akışı yarıda kopabiliyor →
// önce yerel geçici dosyaya indir.
async function download(url, dest) {
    const r = await fetch(url);
    if (!r.ok || !r.body) throw new Error(`download failed (${r.status})`);
    await pipeline(Readable.fromWeb(r.body), fs.createWriteStream(dest));
}

async function main() {
    const v = await prisma.matchVideo.findUnique({ where: { id } });
    if (!v) throw new Error('video not found');
    tmpFile = path.join(os.tmpdir(), `mv-${id}${path.extname(v.storageKey) || '.mp4'}`);
    await download(await presignGet(v.storageKey, 3600), tmpFile);
    const input = tmpFile;

    let lastSaved = 0;
    const setProgress = async (p) => {
        const pct = Math.max(1, Math.min(99, Math.round(p)));
        if (pct - lastSaved < 2) return;
        lastSaved = pct;
        await prisma.matchVideo.update({ where: { id }, data: { progress: pct } }).catch(() => {});
    };

    const rotate = uprightRotation(v.calibration);
    const calibration = { corners: v.calibration.corners.map(p => rotateNorm(p, rotate)) };
    const players = (v.players || []).map(p => ({ ...p, tag: p.tag ? rotateNorm(p.tag, rotate) : null }));

    const det = await detectPass({
        input, rotate,
        getRoi: (w, h) => roiFromCorners(courtHomography(calibration, w, h).imgCorners, w, h),
        onProgress: (f) => { setProgress(3 + f * 82); },
    });
    if (!det.frames) throw new Error('video could not be decoded');
    const { H } = courtHomography(calibration, det.width, det.height);
    const perSide = v.doubles ? 2 : 1;
    await setProgress(86);
    const colorSamples = await colorPass({
        input, rotate, detWidth: det.width,
        boxesAt: (t) => courtPlayersAt(det, H, Math.round(t * det.fps / det.playerEvery), perSide),
    });
    await setProgress(95);
    const result = analyzeTennis({ det, calibration, players, colorSamples, doubles: v.doubles });
    await prisma.matchVideo.update({
        where: { id },
        data: {
            status: 'DONE', progress: 100, result, error: null,
            durationSec: det.duration || v.durationSec, finishedAt: new Date(),
        },
    });
}

const cleanup = () => { if (tmpFile) fs.rm(tmpFile, { force: true }, () => {}); };
process.on('exit', () => { if (tmpFile) try { fs.rmSync(tmpFile, { force: true }); } catch { /* yok */ } });

main()
    .then(() => { cleanup(); return prisma.$disconnect().finally(() => process.exit(0)); })
    .catch(async (err) => {
        cleanup();
        console.error('[match-video worker]', id, err);
        await prisma.matchVideo.update({
            where: { id },
            data: { status: 'FAILED', error: String(err?.message || err).slice(0, 300), finishedAt: new Date() },
        }).catch(() => {});
        await prisma.$disconnect().catch(() => {});
        process.exit(1);
    });
