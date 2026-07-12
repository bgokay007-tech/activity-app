import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { PORT, CLIENT_URL } from './config/env.js';
import { setIO } from './config/socket.js';
import { startCleanupJob } from './jobs/cleanupRivals.js';
import { startAutoCompleteJob } from './jobs/autoCompleteMatches.js';
import { startTournamentCleanupJob } from './jobs/cleanupTournaments.js';
import { startTournamentAutoStartJob } from './jobs/autoStartTournaments.js';
import { startSubscriptionExpiryJob } from './jobs/subscriptionExpiry.js';
import { startHolidayReminderJob } from './jobs/holidayReminder.js';
import { startAutoApproveReservationsJob } from './jobs/autoApproveReservations.js';
import { startTournamentDeadlineReminderJob } from './jobs/tournamentDeadlineReminder.js';
import { startReservationPaymentConfirmJob } from './jobs/reservationPaymentConfirm.js';
import prisma from './config/prisma.js';

const PROVINCES = [
    'Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya',
    'Ardahan','Artvin','Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik',
    'Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum',
    'Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir',
    'Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul',
    'İzmir','Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kilis',
    'Kırıkkale','Kırklareli','Kırşehir','Kocaeli','Konya','Kütahya','Malatya','Manisa',
    'Mardin','Mersin','Muğla','Muş','Nevşehir','Niğde','Ordu','Osmaniye','Rize',
    'Sakarya','Samsun','Siirt','Sinop','Sivas','Şanlıurfa','Şırnak','Tekirdağ',
    'Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak',
];

async function seedCitiesIfEmpty() {
    try {
        const count = await prisma.city.count();
        if (count > 0) { console.log(`✅ City tablosu mevcut (${count} kayıt)`); return; }
        const result = await prisma.city.createMany({
            data: PROVINCES.map(province => ({ province, status: 'APPROVED' })),
            skipDuplicates: true,
        });
        console.log(`✅ ${result.count} il seed edildi`);
    } catch (e) {
        console.error('❌ seedCities error:', e.message);
    }
}

async function ensureTables() {
    try {
        await prisma.$executeRawUnsafe(`
            CREATE TABLE IF NOT EXISTS "TournamentPermissionRequest" (
                "id"        TEXT         NOT NULL,
                "userId"    TEXT         NOT NULL,
                "status"    TEXT         NOT NULL DEFAULT 'PENDING',
                "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
                CONSTRAINT "TournamentPermissionRequest_pkey" PRIMARY KEY ("id"),
                CONSTRAINT "TournamentPermissionRequest_userId_key" UNIQUE ("userId")
            );
        `);
        console.log('✅ TournamentPermissionRequest table ready');
    } catch (e) {
        console.error('❌ ensureTables error:', e.message);
    }
}

const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: { origin: '*', credentials: false },
    pingInterval: 10000,
    pingTimeout: 5000,
});

setIO(io);

io.on('connection', (socket) => {
    const userId = socket.handshake.auth?.userId;
    if (userId) {
        socket.join(`user:${userId}`);
    }
});

Promise.all([ensureTables(), seedCitiesIfEmpty()]).then(() => {
    httpServer.listen(PORT, () => {
        console.log(`🎯 AcTiViTy API running on http://localhost:${PORT}`);
        startCleanupJob();
        startAutoCompleteJob();
        startTournamentCleanupJob();
        startTournamentAutoStartJob();
        startSubscriptionExpiryJob();
        startHolidayReminderJob();
        startAutoApproveReservationsJob();
        startTournamentDeadlineReminderJob();
        startReservationPaymentConfirmJob();
    });
});
