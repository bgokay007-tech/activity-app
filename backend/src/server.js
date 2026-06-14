import { createServer } from 'http';
import { Server } from 'socket.io';
import app from './app.js';
import { PORT, CLIENT_URL } from './config/env.js';
import { setIO } from './config/socket.js';
import { startCleanupJob } from './jobs/cleanupRivals.js';
import { startAutoCompleteJob } from './jobs/autoCompleteMatches.js';
import { startTournamentCleanupJob } from './jobs/cleanupTournaments.js';

const httpServer = createServer(app);

const io = new Server(httpServer, {
    cors: { origin: '*', credentials: false },
});

setIO(io);

io.on('connection', (socket) => {
    const userId = socket.handshake.auth?.userId;
    if (userId) {
        socket.join(`user:${userId}`);
    }
});

httpServer.listen(PORT, () => {
    console.log(`🎯 AcTiViTy API running on http://localhost:${PORT}`);
    startCleanupJob();
    startAutoCompleteJob();
    startTournamentCleanupJob();
});
