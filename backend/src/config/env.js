import dotenv from 'dotenv';
dotenv.config();

export const PORT = process.env.PORT || 5000;
export const DATABASE_URL = process.env.DATABASE_URL;
export const JWT_SECRET = process.env.JWT_SECRET;
export const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
export const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';
export const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '30d';
export const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:5174';
export const IOS_APP_STORE_URL = process.env.IOS_APP_STORE_URL || null;
export const ANDROID_PLAY_STORE_URL = process.env.ANDROID_PLAY_STORE_URL || null;
export const BACKEND_URL = process.env.BACKEND_URL || 'https://activity-app-production-f4c2.up.railway.app';