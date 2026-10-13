import crypto from 'crypto';
import prisma from '../config/prisma.js';
import { r2Configured, presignPut, presignGet, headObject, deleteObject } from '../utils/r2Storage.js';

// MVP: yalnız tenis (tekler/çiftler). Diğer dallar analiz motoru gelince açılır.
export const VIDEO_ANALYSIS_SUBS = ['tennis'];
const MAX_DURATION_SEC = 3 * 3600;
const MAX_ACTIVE_PER_USER = 3;

const fail = (res, status, message, code) => res.status(status).json({ message, code });
const num01 = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

function cleanCalibration(c) {
    const corners = Array.isArray(c?.corners) ? c.corners : null;
    if (!corners || corners.length !== 4) return null;
    const out = corners.map(p => ({ x: Number(p?.x), y: Number(p?.y) }));
    return out.every(p => num01(p.x) && num01(p.y)) ? { corners: out } : null;
}

function cleanPlayers(list, doubles) {
    if (!Array.isArray(list)) return null;
    const need = doubles ? 4 : 2;
    if (list.length !== need) return null;
    const out = list.map(p => ({
        name: String(p?.name || '').trim().slice(0, 40),
        userId: p?.userId ? String(p.userId) : null,
        team: p?.team === 'B' ? 'B' : 'A',
        tag: p?.tag && num01(Number(p.tag.x)) && num01(Number(p.tag.y)) && Number(p.tag.t) >= 0
            ? { t: Number(p.tag.t), x: Number(p.tag.x), y: Number(p.tag.y) } : null,
    }));
    if (out.some(p => !p.name)) return null;
    const a = out.filter(p => p.team === 'A').length;
    if (a !== need / 2) return null;
    return out;
}

// Liste/ayrıntı için dışarı verilen biçim (storageKey gizli)
const view = (v) => ({
    id: v.id, userId: v.userId, activityRequestId: v.activityRequestId, subCategory: v.subCategory,
    status: v.status, progress: v.progress, durationSec: v.durationSec, doubles: v.doubles,
    players: v.players, calibration: v.calibration, result: v.result, error: v.error,
    createdAt: v.createdAt, startedAt: v.startedAt, finishedAt: v.finishedAt,
});

const canSee = (v, userId) => v.userId === userId
    || (Array.isArray(v.players) && v.players.some(p => p?.userId === userId));

export async function createMatchVideo(req, res) {
    try {
        if (!r2Configured()) return fail(res, 503, 'Video storage is not configured yet', 'STORAGE_OFF');
        const { activityRequestId, subCategory = 'tennis', doubles = false, durationSec, contentType } = req.body || {};
        if (!VIDEO_ANALYSIS_SUBS.includes(subCategory)) return fail(res, 400, 'Video analysis is not available for this sport yet', 'SPORT');
        const calibration = cleanCalibration(req.body?.calibration);
        if (!calibration) return fail(res, 400, 'Mark the 4 court corners', 'CALIBRATION');
        const players = cleanPlayers(req.body?.players, !!doubles);
        if (!players) return fail(res, 400, 'Player list is invalid', 'PLAYERS');
        const dur = Number(durationSec);
        if (Number.isFinite(dur) && dur > MAX_DURATION_SEC) return fail(res, 400, 'Video is too long (max 3 hours)', 'TOO_LONG');

        const active = await prisma.matchVideo.count({
            where: { userId: req.userId, status: { in: ['UPLOADING', 'QUEUED', 'PROCESSING'] } },
        });
        if (active >= MAX_ACTIVE_PER_USER) return fail(res, 429, 'You already have videos waiting for analysis', 'BUSY');

        const ext = String(contentType || '').includes('quicktime') ? 'mov' : 'mp4';
        const storageKey = `match-videos/${req.userId}/${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
        const v = await prisma.matchVideo.create({
            data: {
                userId: req.userId,
                activityRequestId: activityRequestId ? String(activityRequestId) : null,
                subCategory, doubles: !!doubles, storageKey,
                durationSec: Number.isFinite(dur) ? dur : null,
                calibration, players,
            },
        });
        const uploadUrl = await presignPut(storageKey, ext === 'mov' ? 'video/quicktime' : 'video/mp4');
        res.status(201).json({ video: view(v), uploadUrl, contentType: ext === 'mov' ? 'video/quicktime' : 'video/mp4' });
    } catch (err) {
        console.error('[match-video create]', err);
        fail(res, 500, 'Could not create video record');
    }
}

export async function markUploaded(req, res) {
    try {
        const v = await prisma.matchVideo.findUnique({ where: { id: req.params.id } });
        if (!v || v.userId !== req.userId) return fail(res, 404, 'Video not found');
        if (v.status !== 'UPLOADING') return res.json({ video: view(v) });
        const head = await headObject(v.storageKey);
        if (!head || head.size < 1024) return fail(res, 400, 'Upload not found in storage', 'NOT_UPLOADED');
        const upd = await prisma.matchVideo.update({
            where: { id: v.id },
            data: { status: 'QUEUED', sizeBytes: Math.min(head.size, 2147483647), progress: 0, error: null },
        });
        res.json({ video: view(upd) });
    } catch (err) {
        console.error('[match-video uploaded]', err);
        fail(res, 500, 'Could not update video');
    }
}

export async function listMatchVideos(req, res) {
    try {
        const where = req.query.activityRequestId
            ? { activityRequestId: String(req.query.activityRequestId) }
            : { userId: req.userId };
        const rows = await prisma.matchVideo.findMany({ where, orderBy: { createdAt: 'desc' }, take: 30 });
        res.json({ videos: rows.filter(v => canSee(v, req.userId)).map(view) });
    } catch (err) {
        console.error('[match-video list]', err);
        fail(res, 500, 'Could not load videos');
    }
}

export async function getMatchVideo(req, res) {
    try {
        const v = await prisma.matchVideo.findUnique({ where: { id: req.params.id } });
        if (!v || !canSee(v, req.userId)) return fail(res, 404, 'Video not found');
        let playbackUrl = null;
        if (r2Configured() && v.status !== 'UPLOADING') {
            try { playbackUrl = await presignGet(v.storageKey, 3600); } catch { /* yok */ }
        }
        res.json({ video: view(v), playbackUrl });
    } catch (err) {
        console.error('[match-video get]', err);
        fail(res, 500, 'Could not load video');
    }
}

export async function retryMatchVideo(req, res) {
    try {
        const v = await prisma.matchVideo.findUnique({ where: { id: req.params.id } });
        if (!v || v.userId !== req.userId) return fail(res, 404, 'Video not found');
        if (v.status !== 'FAILED') return fail(res, 400, 'Only failed analyses can be retried');
        const upd = await prisma.matchVideo.update({ where: { id: v.id }, data: { status: 'QUEUED', progress: 0, error: null } });
        res.json({ video: view(upd) });
    } catch (err) {
        console.error('[match-video retry]', err);
        fail(res, 500, 'Could not retry');
    }
}

export async function deleteMatchVideo(req, res) {
    try {
        const v = await prisma.matchVideo.findUnique({ where: { id: req.params.id } });
        if (!v || v.userId !== req.userId) return fail(res, 404, 'Video not found');
        if (v.status === 'PROCESSING') return fail(res, 409, 'Analysis is running, try again when it finishes', 'BUSY');
        await prisma.matchVideo.delete({ where: { id: v.id } });
        if (r2Configured()) await deleteObject(v.storageKey);
        res.json({ ok: true });
    } catch (err) {
        console.error('[match-video delete]', err);
        fail(res, 500, 'Could not delete video');
    }
}
