import prisma from '../config/prisma.js';
import { createNotification } from './notification.controller.js';
import { emitToUser } from '../config/socket.js';

// Voleybol "Resmi Takım Adı" — kullanıcı bir bağış dekontu yükleyip istediği bir takım ismi
// için başvurur (bkz. schema.prisma TeamNameRequest doc-comment). Admin onaylarsa isim
// (büyük/küçük harf farksız) TEK BAŞINA o kullanıcıya ait olur.
const norm = (name) => name.trim();

// GET /team-names/mine
export const getMyTeamNameRequest = async (req, res, next) => {
    try {
        const request = await prisma.teamNameRequest.findFirst({
            where: { userId: req.userId },
            orderBy: { createdAt: 'desc' },
        });
        res.json({ request });
    } catch (error) { next(error); }
};

// POST /team-names — body: { teamName, receiptUrl }
export const submitTeamNameRequest = async (req, res, next) => {
    try {
        const { teamName, receiptUrl } = req.body;
        if (!teamName || !teamName.trim()) return res.status(400).json({ message: 'Takım adı zorunludur' });
        if (!receiptUrl) return res.status(400).json({ message: 'Bağış dekontu zorunludur' });

        // Kullanıcının hâlâ bekleyen ya da zaten onaylı bir başvurusu varsa yenisine izin
        // verilmez — reddedilmiş bir başvurudan sonra tekrar denenebilir.
        const existing = await prisma.teamNameRequest.findFirst({
            where: { userId: req.userId, status: { in: ['PENDING', 'APPROVED'] } },
        });
        if (existing?.status === 'APPROVED') {
            return res.status(400).json({ message: `Zaten onaylı bir takım adınız var: "${existing.teamName}"` });
        }
        if (existing?.status === 'PENDING') {
            return res.status(400).json({ message: 'Zaten incelenmekte olan bir başvurunuz var.' });
        }

        const cleanName = norm(teamName);
        // Erken uyarı — asıl kesin kontrol (yarış durumuna karşı) onay anında tekrar yapılır.
        const taken = await prisma.teamNameRequest.findFirst({
            where: { status: 'APPROVED', teamName: { equals: cleanName, mode: 'insensitive' } },
        });
        if (taken) return res.status(400).json({ message: 'Bu takım adı zaten alınmış, başka bir isim deneyin.' });

        const request = await prisma.teamNameRequest.create({
            data: { userId: req.userId, teamName: cleanName, receiptUrl, status: 'PENDING' },
        });

        const admins = await prisma.user.findMany({ where: { isAdmin: true }, select: { id: true } });
        for (const admin of admins) {
            createNotification(
                admin.id, 'TEAM_NAME_REQUEST', '🏐 Takım Adı Başvurusu',
                `"${cleanName}" adı için resmi takım adı başvurusu geldi, incelemeniz bekleniyor.`,
                { requestId: request.id }
            ).then(() => emitToUser(admin.id, 'notification', {})).catch(() => {});
        }

        res.json({ request });
    } catch (error) { next(error); }
};
