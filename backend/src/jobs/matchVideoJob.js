// Maç videosu analiz kuyruğu: QUEUED videoları sırayla (aynı anda 1) alt süreçte işler.
// Railway CPU tek çekirdek civarı → paralel çalıştırmak hepsini yavaşlatır.
import { fork } from 'child_process';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import os from 'os';
import prisma from '../config/prisma.js';
import { r2Configured } from '../utils/r2Storage.js';
import { createNotification } from '../controllers/notification.controller.js';

const WORKER = path.join(path.dirname(fileURLToPath(import.meta.url)), '../videoAnalysis/worker.js');
const POLL_MS = 30 * 1000;
let running = null;

async function finish(id) {
    // SIGKILL'de worker kendi geçici dosyasını silemez
    for (const ext of ['.mp4', '.mov']) fs.rm(path.join(os.tmpdir(), `mv-${id}${ext}`), { force: true }, () => {});
    const v = await prisma.matchVideo.findUnique({ where: { id } });
    if (!v) return;
    if (v.status === 'PROCESSING') {
        await prisma.matchVideo.update({
            where: { id }, data: { status: 'FAILED', error: 'worker stopped unexpectedly', finishedAt: new Date() },
        });
    }
    const done = v.status === 'DONE';
    createNotification(v.userId, 'MATCH_VIDEO',
        done ? '🎾 Maç analizin hazır' : '⚠️ Maç analizi tamamlanamadı',
        done ? 'Vuruş hızları, hatalar ve sayılar hazır. Görmek için dokun.' : 'Video işlenemedi. Kortun tamamı görünüyor mu? Tekrar deneyebilirsin.',
        { matchVideoId: v.id, activityRequestId: v.activityRequestId, subCategory: v.subCategory }).catch(() => {});
}

async function tick() {
    if (running || !r2Configured()) return;
    const next = await prisma.matchVideo.findFirst({ where: { status: 'QUEUED' }, orderBy: { createdAt: 'asc' } });
    if (!next) return;
    const claimed = await prisma.matchVideo.updateMany({
        where: { id: next.id, status: 'QUEUED' },
        data: { status: 'PROCESSING', progress: 1, startedAt: new Date() },
    });
    if (!claimed.count) return;

    // Video süresinin ~1.5 katı + 10 dk üst sınır: takılan ffmpeg kuyruğu kilitlemesin
    const limitMs = ((next.durationSec || 3600) * 1.5 + 600) * 1000;
    const child = fork(WORKER, [next.id], { stdio: 'inherit', execArgv: ['--max-old-space-size=1024'] });
    running = { id: next.id, child };
    const timer = setTimeout(() => child.kill('SIGKILL'), limitMs);
    child.on('exit', (code) => {
        clearTimeout(timer);
        running = null;
        console.log(`[match-video] ${next.id} exit ${code}`);
        finish(next.id).catch(err => console.error('[match-video finish]', err.message));
    });
}

export async function startMatchVideoJob() {
    // Yeniden başlatmada yarım kalanlar: bir kez kuyruğa geri, ikinci kez FAILED
    try {
        const stale = await prisma.matchVideo.findMany({ where: { status: 'PROCESSING' } });
        for (const v of stale) {
            const again = v.error === 'restarted';
            await prisma.matchVideo.update({
                where: { id: v.id },
                data: again
                    ? { status: 'FAILED', error: 'analysis interrupted twice', finishedAt: new Date() }
                    : { status: 'QUEUED', progress: 0, error: 'restarted' },
            });
        }
    } catch (err) {
        console.error('[match-video] stale reset', err.message);
    }
    setInterval(() => tick().catch(err => console.error('[match-video]', err.message)), POLL_MS);
    console.log('🎥 Match video analysis job started');
}
