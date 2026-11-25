import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';

const USER_SELECT = { id: true, username: true, fullName: true, avatar: true };
const PERIODS = new Set(['DAILY', 'WEEKLY', 'MONTHLY']);
const SCHEMES = new Set(['STRAIGHT', 'DROP', 'PYRAMID', 'SUPERSET', 'CIRCUIT']);

function dayStart(d) {
    const x = d instanceof Date ? new Date(d) : new Date(String(d));
    if (Number.isNaN(x.getTime())) return null;
    x.setUTCHours(0, 0, 0, 0);
    return x;
}

async function canAuthorForUser(authorId, userId, coachListingId) {
    if (authorId === userId) return { ok: true, coachListingId: null };
    if (!coachListingId) {
        // Antrenör listing'i verilmediyse fitness'te kabul edilmiş ders ilişkisi ara
        const link = await prisma.coachLessonRequest.findFirst({
            where: {
                studentId: userId,
                status: 'ACCEPTED',
                coachListing: { userId: authorId, subCategory: 'fitness_gym', status: 'ACTIVE' },
            },
            select: { coachListingId: true },
        });
        if (!link) return { ok: false, message: 'Bu kullanıcıya antrenman atamak için kabul edilmiş antrenörlük ilişkisi gerekir' };
        return { ok: true, coachListingId: link.coachListingId };
    }
    const listing = await prisma.coachListing.findUnique({
        where: { id: coachListingId },
        select: { id: true, userId: true, subCategory: true, status: true },
    });
    if (!listing || listing.userId !== authorId || listing.status === 'REMOVED') {
        return { ok: false, message: 'Antrenör ilanı bulunamadı' };
    }
    const accepted = await prisma.coachLessonRequest.findFirst({
        where: { coachListingId, studentId: userId, status: 'ACCEPTED' },
        select: { id: true },
    });
    if (!accepted) return { ok: false, message: 'Öğrenci henüz ders isteğini kabul etmemiş' };
    return { ok: true, coachListingId };
}

function mapPlan(p) {
    return {
        ...p,
        exerciseCount: Array.isArray(p.exercises) ? p.exercises.length : undefined,
    };
}

export const listMyPlans = async (req, res, next) => {
    try {
        const { period, status } = req.query;
        const plans = await prisma.workoutPlan.findMany({
            where: {
                userId: req.userId,
                ...(status ? { status: String(status) } : { status: 'ACTIVE' }),
                ...(period && PERIODS.has(String(period).toUpperCase()) ? { period: String(period).toUpperCase() } : {}),
                subCategory: 'fitness_gym',
            },
            include: {
                author: { select: USER_SELECT },
                exercises: { orderBy: [{ dayIndex: 'asc' }, { sortOrder: 'asc' }] },
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(plans.map(mapPlan));
    } catch (err) { next(err); }
};

// Antrenörün öğrencilerine yazdığı planlar
export const listAuthoredPlans = async (req, res, next) => {
    try {
        const plans = await prisma.workoutPlan.findMany({
            where: {
                authorId: req.userId,
                NOT: { userId: req.userId },
                status: 'ACTIVE',
                subCategory: 'fitness_gym',
            },
            include: {
                user: { select: USER_SELECT },
                exercises: { orderBy: [{ dayIndex: 'asc' }, { sortOrder: 'asc' }] },
            },
            orderBy: { updatedAt: 'desc' },
        });
        res.json(plans.map(mapPlan));
    } catch (err) { next(err); }
};

export const getPlan = async (req, res, next) => {
    try {
        const plan = await prisma.workoutPlan.findUnique({
            where: { id: req.params.id },
            include: {
                author: { select: USER_SELECT },
                user: { select: USER_SELECT },
                exercises: { orderBy: [{ dayIndex: 'asc' }, { sortOrder: 'asc' }] },
            },
        });
        if (!plan) return res.status(404).json({ message: 'Plan bulunamadı' });
        if (plan.userId !== req.userId && plan.authorId !== req.userId) {
            return res.status(403).json({ message: 'Bu plana erişim yok' });
        }
        res.json(plan);
    } catch (err) { next(err); }
};

export const createPlan = async (req, res, next) => {
    try {
        const {
            title, period, notes, userId: targetUserId, coachListingId,
            exercises = [],
        } = req.body || {};
        if (!title || !String(title).trim()) return res.status(400).json({ message: 'Başlık zorunlu' });
        const per = String(period || 'WEEKLY').toUpperCase();
        if (!PERIODS.has(per)) return res.status(400).json({ message: 'Geçersiz periyot (DAILY/WEEKLY/MONTHLY)' });

        const ownerId = targetUserId || req.userId;
        const auth = await canAuthorForUser(req.userId, ownerId, coachListingId || null);
        if (!auth.ok) return res.status(403).json({ message: auth.message });

        const exRows = Array.isArray(exercises) ? exercises : [];
        const plan = await prisma.workoutPlan.create({
            data: {
                userId: ownerId,
                authorId: req.userId,
                coachListingId: auth.coachListingId,
                title: String(title).trim().slice(0, 120),
                period: per,
                notes: notes ? String(notes).slice(0, 2000) : null,
                exercises: {
                    create: exRows.map((ex, i) => ({
                        name: String(ex.name || '').trim().slice(0, 120) || `Hareket ${i + 1}`,
                        sortOrder: Number.isFinite(ex.sortOrder) ? ex.sortOrder : i,
                        setScheme: SCHEMES.has(String(ex.setScheme || '').toUpperCase())
                            ? String(ex.setScheme).toUpperCase() : 'STRAIGHT',
                        targetSets: ex.targetSets != null ? parseInt(ex.targetSets, 10) || null : null,
                        targetReps: ex.targetReps != null ? String(ex.targetReps).slice(0, 40) : null,
                        targetWeight: ex.targetWeight != null ? Number(ex.targetWeight) || null : null,
                        restSeconds: ex.restSeconds != null ? parseInt(ex.restSeconds, 10) || null : null,
                        dayIndex: ex.dayIndex != null ? parseInt(ex.dayIndex, 10) : null,
                        notes: ex.notes ? String(ex.notes).slice(0, 500) : null,
                        schemeMeta: ex.schemeMeta && typeof ex.schemeMeta === 'object' ? ex.schemeMeta : undefined,
                    })),
                },
            },
            include: {
                author: { select: USER_SELECT },
                user: { select: USER_SELECT },
                exercises: { orderBy: [{ dayIndex: 'asc' }, { sortOrder: 'asc' }] },
            },
        });

        if (ownerId !== req.userId) {
            const who = plan.author?.fullName || plan.author?.username || 'Antrenörün';
            await createNotification(
                ownerId,
                'WORKOUT_PLAN_ASSIGNED',
                'Yeni antrenman planı',
                `${who} sana "${plan.title}" planı atadı`,
                { planId: plan.id, category: 'SPORTS', subCategory: 'fitness_gym', tab: 'rivals', rivalId: null },
            );
        }

        res.status(201).json(plan);
    } catch (err) { next(err); }
};

export const updatePlan = async (req, res, next) => {
    try {
        const plan = await prisma.workoutPlan.findUnique({ where: { id: req.params.id } });
        if (!plan) return res.status(404).json({ message: 'Plan bulunamadı' });
        if (plan.authorId !== req.userId && plan.userId !== req.userId) {
            return res.status(403).json({ message: 'Bu planı düzenleyemezsin' });
        }
        const { title, period, notes, status, exercises } = req.body || {};
        const data = {};
        if (title != null) data.title = String(title).trim().slice(0, 120);
        if (period != null) {
            const per = String(period).toUpperCase();
            if (!PERIODS.has(per)) return res.status(400).json({ message: 'Geçersiz periyot' });
            data.period = per;
        }
        if (notes !== undefined) data.notes = notes ? String(notes).slice(0, 2000) : null;
        if (status === 'ACTIVE' || status === 'ARCHIVED') data.status = status;

        // exercises gönderildiyse tam değiştir (basit sync)
        if (Array.isArray(exercises)) {
            await prisma.workoutExercise.deleteMany({ where: { planId: plan.id } });
            await prisma.workoutExercise.createMany({
                data: exercises.map((ex, i) => ({
                    planId: plan.id,
                    name: String(ex.name || '').trim().slice(0, 120) || `Hareket ${i + 1}`,
                    sortOrder: Number.isFinite(ex.sortOrder) ? ex.sortOrder : i,
                    setScheme: SCHEMES.has(String(ex.setScheme || '').toUpperCase())
                        ? String(ex.setScheme).toUpperCase() : 'STRAIGHT',
                    targetSets: ex.targetSets != null ? parseInt(ex.targetSets, 10) || null : null,
                    targetReps: ex.targetReps != null ? String(ex.targetReps).slice(0, 40) : null,
                    targetWeight: ex.targetWeight != null ? Number(ex.targetWeight) || null : null,
                    restSeconds: ex.restSeconds != null ? parseInt(ex.restSeconds, 10) || null : null,
                    dayIndex: ex.dayIndex != null ? parseInt(ex.dayIndex, 10) : null,
                    notes: ex.notes ? String(ex.notes).slice(0, 500) : null,
                    schemeMeta: ex.schemeMeta && typeof ex.schemeMeta === 'object' ? ex.schemeMeta : undefined,
                })),
            });
        }

        const updated = await prisma.workoutPlan.update({
            where: { id: plan.id },
            data,
            include: {
                author: { select: USER_SELECT },
                user: { select: USER_SELECT },
                exercises: { orderBy: [{ dayIndex: 'asc' }, { sortOrder: 'asc' }] },
            },
        });
        res.json(updated);
    } catch (err) { next(err); }
};

export const deletePlan = async (req, res, next) => {
    try {
        const plan = await prisma.workoutPlan.findUnique({ where: { id: req.params.id } });
        if (!plan) return res.status(404).json({ message: 'Plan bulunamadı' });
        if (plan.authorId !== req.userId && plan.userId !== req.userId) {
            return res.status(403).json({ message: 'Bu planı silemezsin' });
        }
        await prisma.workoutPlan.delete({ where: { id: plan.id } });
        res.json({ ok: true });
    } catch (err) { next(err); }
};

export const getOrCreateSession = async (req, res, next) => {
    try {
        const plan = await prisma.workoutPlan.findUnique({
            where: { id: req.params.id },
            include: { exercises: { orderBy: [{ dayIndex: 'asc' }, { sortOrder: 'asc' }] } },
        });
        if (!plan) return res.status(404).json({ message: 'Plan bulunamadı' });
        if (plan.userId !== req.userId) return res.status(403).json({ message: 'Sadece plan sahibi oturum açabilir' });

        const date = dayStart(req.body?.date || req.query?.date || new Date());
        if (!date) return res.status(400).json({ message: 'Geçersiz tarih' });

        let session = await prisma.workoutSession.findUnique({
            where: { planId_userId_date: { planId: plan.id, userId: req.userId, date } },
            include: { setLogs: true },
        });
        if (!session) {
            session = await prisma.workoutSession.create({
                data: { planId: plan.id, userId: req.userId, date },
                include: { setLogs: true },
            });
        }
        res.json({ session, plan });
    } catch (err) { next(err); }
};

export const upsertSetLog = async (req, res, next) => {
    try {
        const { exerciseId, setIndex, dropIndex = 0, reps, weightKg, completed = true } = req.body || {};
        if (!exerciseId) return res.status(400).json({ message: 'exerciseId zorunlu' });
        const si = parseInt(setIndex, 10);
        if (!Number.isFinite(si) || si < 0) return res.status(400).json({ message: 'setIndex geçersiz' });
        const di = parseInt(dropIndex, 10) || 0;

        const session = await prisma.workoutSession.findUnique({ where: { id: req.params.sessionId } });
        if (!session) return res.status(404).json({ message: 'Oturum bulunamadı' });
        if (session.userId !== req.userId) return res.status(403).json({ message: 'Bu oturuma yazamazsın' });

        const exercise = await prisma.workoutExercise.findFirst({
            where: { id: exerciseId, planId: session.planId },
        });
        if (!exercise) return res.status(404).json({ message: 'Hareket bu planda yok' });

        const log = await prisma.workoutSetLog.upsert({
            where: {
                sessionId_exerciseId_setIndex_dropIndex: {
                    sessionId: session.id,
                    exerciseId,
                    setIndex: si,
                    dropIndex: di,
                },
            },
            create: {
                sessionId: session.id,
                exerciseId,
                setIndex: si,
                dropIndex: di,
                reps: reps != null ? parseInt(reps, 10) || null : null,
                weightKg: weightKg != null ? Number(weightKg) || null : null,
                completed: !!completed,
            },
            update: {
                reps: reps != null ? parseInt(reps, 10) || null : null,
                weightKg: weightKg != null ? Number(weightKg) || null : null,
                completed: !!completed,
            },
        });
        res.json(log);
    } catch (err) { next(err); }
};

export const completeSession = async (req, res, next) => {
    try {
        const session = await prisma.workoutSession.findUnique({ where: { id: req.params.sessionId } });
        if (!session) return res.status(404).json({ message: 'Oturum bulunamadı' });
        if (session.userId !== req.userId) return res.status(403).json({ message: 'Bu oturumu tamamlayamazsın' });
        const updated = await prisma.workoutSession.update({
            where: { id: session.id },
            data: {
                completed: true,
                notes: req.body?.notes != null ? String(req.body.notes).slice(0, 1000) : session.notes,
            },
            include: { setLogs: true },
        });
        res.json(updated);
    } catch (err) { next(err); }
};

// Antrenörün kabul edilmiş öğrencileri — plan atamak için seçim listesi
export const listCoachStudents = async (req, res, next) => {
    try {
        const links = await prisma.coachLessonRequest.findMany({
            where: {
                status: 'ACCEPTED',
                coachListing: { userId: req.userId, subCategory: 'fitness_gym', status: { not: 'REMOVED' } },
            },
            include: {
                student: { select: USER_SELECT },
                coachListing: { select: { id: true, personalFullName: true } },
            },
            orderBy: { createdAt: 'desc' },
        });
        res.json(links.map((l) => ({
            student: l.student,
            coachListingId: l.coachListingId,
            coachListing: l.coachListing,
        })));
    } catch (err) { next(err); }
};
