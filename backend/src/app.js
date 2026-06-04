import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import { CLIENT_URL } from './config/env.js';
import authRoutes from './routes/auth.routes.js';
import interestRoutes from './routes/interest.routes.js';
import postRoutes from './routes/post.routes.js';
import rivalRoutes from './routes/rival.routes.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: CLIENT_URL, credentials: true }));
app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use('/api/auth', authRoutes);
app.use('/api/interests', interestRoutes);
app.use('/api/posts', postRoutes);
app.use('/api/rivals', rivalRoutes);

app.get('/health', (req, res) => {
    res.json({ status: 'OK', message: 'AcTiViTy API is running 🎯' });
});

app.use((req, res) => {
    res.status(404).json({ message: 'Route not found' });
});

app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(err.status || 500).json({
        message: err.message || 'Internal server error',
    });
});

export default app;