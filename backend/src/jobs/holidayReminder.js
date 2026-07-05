import cron from 'node-cron';
import prisma from '../config/prisma.js';
import { createNotification } from '../controllers/notification.controller.js';
import { emitToUser } from '../config/socket.js';

// Sabit milli tatiller (fallback)
const FIXED_HOLIDAYS = [
    { month: 1,  day: 1,  name: 'Yeni Yıl' },
    { month: 4,  day: 23, name: 'Ulusal Egemenlik ve Çocuk Bayramı' },
    { month: 5,  day: 1,  name: 'İşçi ve Emekçi Bayramı' },
    { month: 5,  day: 19, name: "Atatürk'ü Anma, Gençlik ve Spor Bayramı" },
    { month: 7,  day: 15, name: 'Demokrasi ve Millî Birlik Günü' },
    { month: 8,  day: 30, name: 'Zafer Bayramı' },
    { month: 10, day: 28, name: 'Cumhuriyet Bayramı' },
    { month: 10, day: 29, name: 'Cumhuriyet Bayramı (2. Günü)' },
];

// Dini bayramlar yedek listesi (API başarısız olursa)
const RELIGIOUS_FALLBACK = [
    { date: '2025-03-30', name: 'Ramazan Bayramı (1. Günü)' },
    { date: '2025-03-31', name: 'Ramazan Bayramı (2. Günü)' },
    { date: '2025-04-01', name: 'Ramazan Bayramı (3. Günü)' },
    { date: '2025-06-06', name: 'Kurban Bayramı (1. Günü)' },
    { date: '2025-06-07', name: 'Kurban Bayramı (2. Günü)' },
    { date: '2025-06-08', name: 'Kurban Bayramı (3. Günü)' },
    { date: '2025-06-09', name: 'Kurban Bayramı (4. Günü)' },
    { date: '2026-03-20', name: 'Ramazan Bayramı (1. Günü)' },
    { date: '2026-03-21', name: 'Ramazan Bayramı (2. Günü)' },
    { date: '2026-03-22', name: 'Ramazan Bayramı (3. Günü)' },
    { date: '2026-05-27', name: 'Kurban Bayramı (1. Günü)' },
    { date: '2026-05-28', name: 'Kurban Bayramı (2. Günü)' },
    { date: '2026-05-29', name: 'Kurban Bayramı (3. Günü)' },
    { date: '2026-05-30', name: 'Kurban Bayramı (4. Günü)' },
    { date: '2027-03-10', name: 'Ramazan Bayramı (1. Günü)' },
    { date: '2027-03-11', name: 'Ramazan Bayramı (2. Günü)' },
    { date: '2027-03-12', name: 'Ramazan Bayramı (3. Günü)' },
    { date: '2027-05-17', name: 'Kurban Bayramı (1. Günü)' },
    { date: '2027-05-18', name: 'Kurban Bayramı (2. Günü)' },
    { date: '2027-05-19', name: 'Kurban Bayramı (3. Günü)' },
    { date: '2027-05-20', name: 'Kurban Bayramı (4. Günü)' },
];

// Nager.Date API'den Türkiye tatillerini çek (ücretsiz, API key gerekmez)
async function fetchNagerHolidays(year) {
    try {
        const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${year}/TR`, {
            signal: AbortSignal.timeout(8000),
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json();
        return data.map(h => ({ date: h.date, name: h.localName || h.name }));
    } catch (e) {
        console.warn(`[HolidayJob] Nager.Date API hatası (${year}):`, e.message);
        return null;
    }
}

async function getUpcomingHolidays() {
    const now = new Date();
    const years = [now.getFullYear(), now.getFullYear() + 1];

    let holidays = [];
    let apiSuccess = false;

    for (const year of years) {
        const apiResult = await fetchNagerHolidays(year);
        if (apiResult) {
            holidays.push(...apiResult);
            apiSuccess = true;
        } else {
            // API başarısız → sabit milli tatiller
            FIXED_HOLIDAYS.forEach(h => {
                holidays.push({
                    date: `${year}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
                    name: h.name,
                });
            });
        }
    }

    // Dini bayramlar API'den gelmemişse yedek listeyi ekle
    if (!apiSuccess) {
        holidays.push(...RELIGIOUS_FALLBACK);
    }

    // 3–30 gün içindeki tatilleri filtrele (tekrar olmadan)
    const seen = new Set();
    return holidays.filter(h => {
        if (seen.has(h.date)) return false;
        seen.add(h.date);
        const daysUntil = Math.round((new Date(h.date + 'T12:00:00') - now) / 86400000);
        return daysUntil >= 3 && daysUntil <= 30;
    });
}

async function checkAndNotifyHolidays() {
    const now = new Date();
    const upcoming = await getUpcomingHolidays();
    if (!upcoming.length) return;

    // Aktif PRO veya PREMIUM aboneliği olan kullanıcılar
    const proSubs = await prisma.businessSubscription.findMany({
        where: { status: 'ACTIVE', packageType: { in: ['PRO', 'PREMIUM'] }, endDate: { gt: now } },
        select: { userId: true },
    });
    if (!proSubs.length) return;

    const proUserIds = [...new Set(proSubs.map(s => s.userId))];

    // Onaylı tesisi olan kullanıcıları filtrele
    const eligibleUsers = await prisma.user.findMany({
        where: { id: { in: proUserIds }, venues: { some: { status: 'APPROVED' } } },
        select: { id: true },
    });
    if (!eligibleUsers.length) return;

    for (const { id: userId } of eligibleUsers) {
        // Bu kullanıcının son 3 günde gönderilen tatil bildirimlerini al
        const recentNotifs = await prisma.notification.findMany({
            where: {
                userId,
                type: 'HOLIDAY_REMINDER',
                createdAt: { gte: new Date(now.getTime() - 3 * 86400000) },
            },
            select: { data: true },
        });
        const sentDates = new Set(recentNotifs.map(n => n.data?.holidayDate).filter(Boolean));

        for (const holiday of upcoming) {
            if (sentDates.has(holiday.date)) continue;

            const daysUntil = Math.round((new Date(holiday.date + 'T12:00:00') - now) / 86400000);

            await createNotification(
                userId,
                'HOLIDAY_REMINDER',
                `📅 ${holiday.name} — ${daysUntil} Gün Kaldı`,
                `${holiday.date} tarihinde ${holiday.name} var. Tesisiniz o gün çalışacak mı? Çalışma saatlerinizi şimdiden güncelleyebilirsiniz.`,
                { holidayDate: holiday.date, holidayName: holiday.name, screen: 'BusinessHome' },
            );
            emitToUser(userId, 'notification', {});
        }
    }
}

export function startHolidayReminderJob() {
    // Her gün saat 09:00'da çalıştır
    cron.schedule('0 9 * * *', () => {
        checkAndNotifyHolidays().catch(e => console.error('[HolidayJob] Hata:', e));
    });
    // Sunucu başlangıcında bir kez kontrol et
    checkAndNotifyHolidays().catch(e => console.error('[HolidayJob] Başlangıç hatası:', e));
    console.log('✅ Holiday reminder job scheduled (daily 09:00 TR)');
}
