import { Image, InteractionManager } from 'react-native';
import { SUB_PHOTOS } from '../theme/visualAssets';

// Spor ekranındaki dal kartları — ana sayfada çözülürse Spor girişi JPEG decode ile kilitlenmez.
const SPORT_IDS = [
    'tennis', 'padel', 'table_tennis', 'badminton', 'pickleball',
    'volleyball', 'football', 'basketball', 'foot_tennis', 'handball',
    'running', 'camping', 'climbing', 'golf', 'equestrian', 'archery', 'sup_kano',
    'wellness', 'fitness_gym', 'ice_skating',
    'motorcycle', 'skiing_snowboard', 'paintball', 'airsoft', 'extreme_sports', 'shooting_hunting',
];

let primed = false;

export function warmSportPhotos() {
    if (primed) return;
    primed = true;
    SPORT_IDS.forEach((id) => {
        const src = SUB_PHOTOS[id];
        if (!src) return;
        try {
            const resolved = Image.resolveAssetSource(src);
            if (resolved?.uri) Image.prefetch(resolved.uri).catch(() => {});
        } catch (_) { /* ignore */ }
    });
}

export function warmSportPhotosAfterIdle() {
    InteractionManager.runAfterInteractions(() => warmSportPhotos());
}
