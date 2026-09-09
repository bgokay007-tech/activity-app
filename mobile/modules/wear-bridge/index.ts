import { requireNativeModule, EventEmitter, Subscription } from 'expo-modules-core';

export type WearMatchUpdate = {
    sport: string;
    pointLabelA: string;
    pointLabelB: string;
    // Ham sayı — voleybolde pointLabelA/B tenis usulü (0/15/30/40) üretildiği için anlamsız
    // kalıyor, voleybolde bunun yerine bu ham değer gösterilmeli.
    pointsA: number;
    pointsB: number;
    gamesA: number;
    gamesB: number;
    setsA: number;
    setsB: number;
    matchWinner: 'A' | 'B' | null;
};

export type HuaweiScoreboardPayload = {
    title: string;
    text: string;
    buttonA: string;
    buttonB: string;
};

type WearBridgeNativeModule = {
    isWatchConnected(): Promise<boolean>;
    startHuaweiScoreSession(params: HuaweiScoreboardPayload): Promise<boolean>;
    updateHuaweiScoreSession(params: HuaweiScoreboardPayload): Promise<boolean>;
    stopHuaweiScoreSession(): Promise<void>;
};

let nativeModule: WearBridgeNativeModule | null = null;
let emitter: EventEmitter | null = null;
try {
    nativeModule = requireNativeModule<WearBridgeNativeModule>('WearBridge');
    emitter = new EventEmitter(nativeModule as any);
} catch {
    nativeModule = null;
    emitter = null;
}

const noopSub: Subscription = { remove() {} };

// Saat bağlıysa maçın anlık durumunu döner — henüz saatten hiç veri gelmediyse false.
export function isWatchConnected(): Promise<boolean> {
    return nativeModule?.isWatchConnected() ?? Promise.resolve(false);
}

// Saatteki maç her sayı değiştiğinde (Data Layer API / Huawei P2P üzerinden) tetiklenir.
export function addMatchUpdateListener(listener: (update: WearMatchUpdate) => void): Subscription {
    if (!emitter) return noopSub;
    return emitter.addListener('onMatchUpdate', listener);
}

// Huawei GT/Fit şablon bildirimindeki A+/B+ butonu — telefon motoruna tek sayı yazar.
export function addWatchPointListener(listener: (update: { side: 'A' | 'B' }) => void): Subscription {
    if (!emitter) return noopSub;
    return emitter.addListener('onWatchPoint', listener);
}

function hasFn(name: keyof WearBridgeNativeModule): boolean {
    return typeof (nativeModule as any)?.[name] === 'function';
}

export function startHuaweiScoreSession(params: HuaweiScoreboardPayload): Promise<boolean> {
    // Eski APK'da bu native metod yok — OTA JS çağırınca çökmesin, Huawei yolu sessiz kapalı.
    if (!hasFn('startHuaweiScoreSession')) return Promise.resolve(false);
    return nativeModule!.startHuaweiScoreSession(params);
}

export function updateHuaweiScoreSession(params: HuaweiScoreboardPayload): Promise<boolean> {
    if (!hasFn('updateHuaweiScoreSession')) return Promise.resolve(false);
    return nativeModule!.updateHuaweiScoreSession(params);
}

export function stopHuaweiScoreSession(): Promise<void> {
    if (!hasFn('stopHuaweiScoreSession')) return Promise.resolve();
    return nativeModule!.stopHuaweiScoreSession();
}
