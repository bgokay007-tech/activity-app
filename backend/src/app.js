import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';
import { CLIENT_URL } from './config/env.js';
import uploadRoutes from './routes/upload.routes.js';
import authRoutes from './routes/auth.routes.js';
import interestRoutes from './routes/interest.routes.js';
import postRoutes from './routes/post.routes.js';
import rivalRoutes from './routes/rival.routes.js';
import courtRoutes from './routes/court.routes.js';
import newsRoutes from './routes/news.routes.js';
import friendRoutes from './routes/friend.routes.js';
import friendFindingRoutes from './routes/friendFinding.routes.js';
import notificationRoutes from './routes/notification.routes.js';
import messageRoutes from './routes/message.routes.js';
import userRoutes from './routes/user.routes.js';
import demoRoutes from './routes/demo.routes.js';
import adminRoutes from './routes/admin.routes.js';
import tournamentRoutes from './routes/tournament.routes.js';
import archiveRoutes from './routes/archive.routes.js';
import coachRoutes from './routes/coach.routes.js';
import artistRoutes from './routes/artist.routes.js';
import refereeRoutes from './routes/referee.routes.js';
import equipmentRoutes from './routes/equipment.routes.js';
import cityRoutes from './routes/city.routes.js';
import cityAlertRoutes from './routes/cityAlert.routes.js';
import activityAlertRoutes from './routes/activityAlert.routes.js';
import surveyRoutes from './routes/survey.routes.js';
import volleyballRatingRoutes from './routes/volleyballRating.routes.js';
import padelRatingRoutes from './routes/padelRating.routes.js';
import achievementRoutes from './routes/achievement.routes.js';
import spotlightRoutes from './routes/spotlight.routes.js';
import subscriptionRoutes from './routes/subscription.routes.js';
import venueRoutes from './routes/venue.routes.js';
import shareRoutes from './routes/share.routes.js';
import musicRoutes from './routes/music.routes.js';
import playlistRoutes from './routes/playlist.routes.js';
import concertRoutes from './routes/concert.routes.js';
import movieRoutes from './routes/movie.routes.js';
import theaterRoutes from './routes/theater.routes.js';
import sportsTicketRoutes from './routes/sportsTicket.routes.js';
import trailRoutes from './routes/trail.routes.js';

const app = express();

// Varsayilan CSP img-src'i 'self' data: ile sinirliyor - Cloudinary'de barindirilan
// tum avatar/gonderi/tesis fotograflari (harici origin) bu yuzden hic yuklenmiyordu,
// web'de tarayici sessizce engelliyordu (network/console hatasi disinda belirti yok).
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      ...helmet.contentSecurityPolicy.getDefaultDirectives(),
      'img-src': ["'self'", 'data:', 'https:'],
    },
  },
}));
app.use(cors({
  origin: (origin, cb) => cb(null, true),
  credentials: true,
}));
app.use('/uploads', express.static('uploads'));
app.use(morgan('dev'));
app.use(express.json({ limit: '15mb' }));
app.use(express.urlencoded({ extended: true, limit: '15mb' }));
app.use('/api/auth', authRoutes);
app.use('/api/interests', interestRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/rivals', rivalRoutes);
app.use('/api/courts', courtRoutes);
app.use('/api/news', newsRoutes);
app.use('/api/friends', friendRoutes);
app.use('/api/friend-finding', friendFindingRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/notifications', notificationRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/demo', demoRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/tournaments', tournamentRoutes);
app.use('/api/archive', archiveRoutes);
app.use('/api/coaches', coachRoutes);
app.use('/api/artists', artistRoutes);
app.use('/api/referees', refereeRoutes);
app.use('/api/equipment', equipmentRoutes);
app.use('/api/cities', cityRoutes);
app.use('/api/city-alerts', cityAlertRoutes);
app.use('/api/activity-alerts', activityAlertRoutes);
app.use('/api/survey', surveyRoutes);
app.use('/api/volleyball-rating', volleyballRatingRoutes);
app.use('/api/padel-rating', padelRatingRoutes);
app.use('/api/achievements', achievementRoutes);
app.use('/api/spotlight', spotlightRoutes);
app.use('/api/subscriptions', subscriptionRoutes);
app.use('/api/venues', venueRoutes);
app.use('/api/music', musicRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/concerts', concertRoutes);
app.use('/api/movies', movieRoutes);
app.use('/api/theater', theaterRoutes);
app.use('/api/sports-tickets', sportsTicketRoutes);
app.use('/api/trails', trailRoutes);
app.use('/share', shareRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'AcTiViTy API is running 🎯' });
});

// Serve admin panel (frontend)
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const frontendDist = path.resolve(__dirname, '../public');
if (fs.existsSync(frontendDist)) {
    app.use(express.static(frontendDist));
    app.get('*', (req, res, next) => {
        if (req.path.startsWith('/api')) return next();
        res.sendFile(path.join(frontendDist, 'index.html'));
    });
}

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
        ...(err.code && { code: err.code }),
    });
});

export default app;