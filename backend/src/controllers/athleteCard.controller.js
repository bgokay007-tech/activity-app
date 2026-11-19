import prisma from '../config/prisma.js';
import { athleteMetricMeta, computeBmi } from '../utils/athleteMetricsCatalog.js';

const ALLOWED_SOURCES = new Set(['MANUAL', 'HEALTH_APP', 'WATCH']);

function latestByKey(rows) {
    const map = {};
    for (const r of rows) {
        if (!map[r.key]) map[r.key] = r;
    }
    return map;
}

export const getMyAthleteCard = async (req, res, next) => {
    try {
        const rows = await prisma.athleteMetricEntry.findMany({
            where: { userId: req.userId },
            orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
            take: 500,
        });
        const latest = latestByKey(rows);
        const height = latest.heightCm?.value;
        const weight = latest.weightKg?.value;
        const bmi = computeBmi(height, weight);
        res.json({
            latest,
            bmi,
            historySample: rows.slice(0, 80),
        });
    } catch (err) { next(err); }
};

export const getMetricHistory = async (req, res, next) => {
    try {
        const key = String(req.params.key || '');
        if (!athleteMetricMeta(key)) return res.status(400).json({ message: 'Geçersiz metrik' });
        const limit = Math.min(parseInt(req.query.limit, 10) || 30, 100);
        const rows = await prisma.athleteMetricEntry.findMany({
            where: { userId: req.userId, key },
            orderBy: { measuredAt: 'desc' },
            take: limit,
        });
        res.json(rows);
    } catch (err) { next(err); }
};

/** Tek veya toplu kayıt: { key, value } | { entries: [{ key, value, measuredAt?, source?, note? }] } */
export const upsertAthleteMetrics = async (req, res, next) => {
    try {
        const body = req.body || {};
        const list = Array.isArray(body.entries)
            ? body.entries
            : (body.key != null ? [body] : []);
        if (!list.length) return res.status(400).json({ message: 'Metrik girilmedi' });

        const created = [];
        for (const raw of list) {
            const key = String(raw.key || '');
            const meta = athleteMetricMeta(key);
            if (!meta) return res.status(400).json({ message: `Geçersiz metrik: ${key}` });
            const value = Number(raw.value);
            if (!Number.isFinite(value)) return res.status(400).json({ message: `${key} sayı olmalı` });
            const source = ALLOWED_SOURCES.has(raw.source) ? raw.source : 'MANUAL';
            const measuredAt = raw.measuredAt ? new Date(raw.measuredAt) : new Date();
            if (Number.isNaN(measuredAt.getTime())) {
                return res.status(400).json({ message: 'Geçersiz ölçüm tarihi' });
            }
            const row = await prisma.athleteMetricEntry.create({
                data: {
                    userId: req.userId,
                    category: meta.category,
                    key,
                    value,
                    unit: meta.unit,
                    source,
                    measuredAt,
                    note: raw.note ? String(raw.note).slice(0, 300) : null,
                },
            });
            created.push(row);
        }

        const all = await prisma.athleteMetricEntry.findMany({
            where: { userId: req.userId },
            orderBy: [{ measuredAt: 'desc' }, { createdAt: 'desc' }],
            take: 500,
        });
        const latest = latestByKey(all);
        res.status(201).json({
            created,
            latest,
            bmi: computeBmi(latest.heightCm?.value, latest.weightKg?.value),
        });
    } catch (err) { next(err); }
};

export const deleteAthleteMetric = async (req, res, next) => {
    try {
        const id = String(req.params.id || '');
        const row = await prisma.athleteMetricEntry.findFirst({
            where: { id, userId: req.userId },
        });
        if (!row) return res.status(404).json({ message: 'Kayıt bulunamadı' });
        await prisma.athleteMetricEntry.delete({ where: { id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};
