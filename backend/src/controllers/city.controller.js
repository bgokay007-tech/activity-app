import prisma from '../config/prisma.js';

// GET /cities?q=ist&province=İstanbul  — approved cities for autocomplete
export const getCities = async (req, res, next) => {
    try {
        const { q, province } = req.query;
        const where = { status: 'APPROVED' };
        if (province) where.province = { equals: province, mode: 'insensitive' };
        if (q) where.OR = [
            { province: { contains: q, mode: 'insensitive' } },
            { district: { contains: q, mode: 'insensitive' } },
        ];
        const cities = await prisma.city.findMany({ where, orderBy: [{ province: 'asc' }, { district: 'asc' }], take: 20 });
        res.json(cities);
    } catch (e) { next(e); }
};

// POST /cities — submit a city for approval (upsert so no duplicates)
export const submitCity = async (req, res, next) => {
    try {
        const { province, district } = req.body;
        if (!province?.trim()) return res.status(400).json({ message: 'Province required' });
        const city = await prisma.city.upsert({
            where: { province_district: { province: province.trim(), district: district?.trim() || null } },
            update: {},
            create: { province: province.trim(), district: district?.trim() || null, status: 'PENDING' },
        });
        res.status(201).json(city);
    } catch (e) { next(e); }
};

// GET /admin/cities?status=PENDING
export const adminGetCities = async (req, res, next) => {
    try {
        const { status = 'PENDING' } = req.query;
        const cities = await prisma.city.findMany({ where: { status }, orderBy: { createdAt: 'asc' } });
        res.json(cities);
    } catch (e) { next(e); }
};

// PATCH /admin/cities/:id  { status: 'APPROVED' | 'REJECTED' }
export const adminUpdateCity = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (status === 'REJECTED') {
            await prisma.city.delete({ where: { id } });
            return res.json({ message: 'Rejected and removed' });
        }
        const city = await prisma.city.update({ where: { id }, data: { status } });
        res.json(city);
    } catch (e) { next(e); }
};
