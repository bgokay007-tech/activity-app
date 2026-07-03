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
import prisma from './config/prisma.js';

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

ensureTables().then(() => {
    httpServer.listen(PORT, () => {
        console.log(`🎯 AcTiViTy API running on http://localhost:${PORT}`);
        startCleanupJob();
        startAutoCompleteJob();
        startTournamentCleanupJob();
        startTournamentAutoStartJob();
        startSubscriptionExpiryJob();
    });
});
