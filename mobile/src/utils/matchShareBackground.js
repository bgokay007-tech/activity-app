/**
 * Maç paylaşım kartı arka planı — spor + zemin (surface) → yerel görsel.
 * Instagram hikâyede yarı saydam overlay üstüne çizilir; zemin okunaklı kalsın diye
 * koyu vignette kart tarafında uygulanır.
 */
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system/legacy';

const BG = {
    tennisClay: require('../../assets/visual/share-bg/tennis-clay.jpg'),
    tennisHard: require('../../assets/visual/share-bg/tennis-hard.jpg'),
    tennisGrass: require('../../assets/visual/share-bg/tennis-grass.jpg'),
    // PLAYERS_DECIDE: tek kort — sol sert / sağ toprak, manzaralı (Designer mantığı)
    tennisPlayersDecide: require('../../assets/visual/share-bg/tennis-players-decide.jpg'),
    volleyballIndoor: require('../../assets/visual/share-bg/volleyball-indoor.jpg'),
    volleyballBeach: require('../../assets/visual/share-bg/volleyball-beach.jpg'),
    padel: require('../../assets/visual/share-bg/padel.jpg'),
    basketball: require('../../assets/visual/share-bg/basketball.jpg'),
    tennisFallback: require('../../assets/visual/sub-tennis.jpg'),
    volleyballFallback: require('../../assets/visual/sub-volleyball.jpg'),
    footballFallback: require('../../assets/visual/sub-football.jpg'),
    runningFallback: require('../../assets/visual/sub-running.jpg'),
};

function normSurface(surface) {
    return String(surface || '').trim().toUpperCase();
}

/** Zemin bilinmiyor / oyuncular seçer → yarı sert + yarı toprak tek kort. */
export function isUndecidedSurface(surface) {
    const sf = normSurface(surface);
    return !sf || sf === 'PLAYERS_DECIDE' || sf === 'UNKNOWN' || sf === 'ANY';
}

/** @returns {number} metro require module id */
export function resolveShareBackgroundModule(subCategory, surface) {
    const sub = String(subCategory || '').toLowerCase();
    const sf = normSurface(surface);
    const racket = sub === 'tennis' || sub === 'table_tennis' || sub === 'badminton'
        || sub === 'pickleball' || sub === 'squash' || sub === 'padel';

    // Açık ilan / turnuva: zemin belli → o kort; belirsiz → yarı yarıya tek kort
    if (racket) {
        if (isUndecidedSurface(sf)) return BG.tennisPlayersDecide;
        if (sf === 'CLAY') return BG.tennisClay;
        if (sf === 'GRASS') return BG.tennisGrass;
        if (sf === 'HARD' || sf === 'CARPET' || sf === 'ARTIFICIAL' || sf === 'OTHER') return BG.tennisHard;
        // Bilinen ama listede olmayan kod → yine yarı yarıya (uydurma sert varsayma)
        return BG.tennisPlayersDecide;
    }
    if (sub === 'volleyball') {
        if (sf === 'BEACH') return BG.volleyballBeach;
        if (sf === 'INDOOR' || sf === 'PARQUET' || sf === 'SYNTHETIC') return BG.volleyballIndoor;
        if (sf === 'CLAY') return BG.tennisClay;
        if (sf === 'GRASS') return BG.tennisGrass;
        if (isUndecidedSurface(sf)) return BG.tennisPlayersDecide;
        return BG.volleyballIndoor;
    }
    if (sub === 'basketball') return BG.basketball;
    if (sub === 'football') return BG.footballFallback;
    if (sub === 'running') return BG.runningFallback;
    if (isUndecidedSurface(sf)) return BG.tennisPlayersDecide;
    return BG.tennisFallback;
}

async function moduleToDataUrl(mod) {
    const asset = Asset.fromModule(mod);
    await asset.downloadAsync();
    const uri = asset.localUri || asset.uri;
    if (!uri) return null;
    const b64 = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
    });
    const mime = String(uri).toLowerCase().endsWith('.png') ? 'image/png' : 'image/jpeg';
    return `data:${mime};base64,${b64}`;
}

export async function shareBackgroundToDataUrl(subCategory, surface) {
    try {
        const mod = resolveShareBackgroundModule(subCategory, surface);
        return await moduleToDataUrl(mod);
    } catch {
        return null;
    }
}

export function isPlayersDecideSurface(surface) {
    return isUndecidedSurface(surface);
}
