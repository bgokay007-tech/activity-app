import { requireNativeModule, EventEmitter, Subscription } from 'expo-modules-core';

export type WearMatchUpdate = {
    sport: string;
    pointLabelA: string;
    pointLabelB: string;
    gamesA: number;
    gamesB: number;
    setsA: number;
    setsB: number;
    matchWinner: 'A' | 'B' | null;
};

type WearBridgeNativeModule = {
    isWatchConnected(): Promise<boolean>;
};

const nativeModule = requireNativeModule<WearBridgeNativeModule>('WearBridge');
const emitter = new EventEmitter(nativeModule as any);

// Saat bağlıysa maçın anlık durumunu döner — henüz saatten hiç veri gelmediyse false.
export function isWatchConnected(): Promise<boolean> {
    return nativeModule.isWatchConnected();
}

// Saatteki maç her sayı değiştiğinde (Data Layer API üzerinden) tetiklenir.
export function addMatchUpdateListener(listener: (update: WearMatchUpdate) => void): Subscription {
    return emitter.addListener('onMatchUpdate', listener);
}
