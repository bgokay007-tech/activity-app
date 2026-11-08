import { requireNativeModule } from 'expo-modules-core';

type ShareBridgeNative = {
    shareToInstagramStory(params: {
        imageUri?: string;
        filePath?: string;
        mime?: string;
        facebookAppId?: string;
        linkUrl?: string;
        linkText?: string;
    }): Promise<boolean>;
    shareToWhatsApp(params: {
        imageUri: string;
        mime?: string;
        text?: string;
    }): Promise<boolean>;
    shareToWhatsAppStatus(params: {
        imageUri?: string;
        filePath?: string;
        mime?: string;
        text?: string;
    }): Promise<boolean>;
    isInstagramInstalled(): Promise<boolean>;
    isWhatsAppInstalled(): Promise<boolean>;
};

// Native yoksa (eski APK) açılışta çökmesin — JS Linking fallback kullanılır.
let native: ShareBridgeNative | null = null;
try {
    native = requireNativeModule<ShareBridgeNative>('ShareBridge');
} catch {
    native = null;
}

export function hasShareBridge(): boolean {
    return !!native;
}

export async function nativeShareToInstagramStory(params: {
    imageUri?: string;
    filePath?: string;
    mime?: string;
    facebookAppId?: string;
    linkUrl?: string;
    linkText?: string;
}): Promise<boolean> {
    if (!native) return false;
    try {
        return !!(await native.shareToInstagramStory(params));
    } catch {
        return false;
    }
}

export async function nativeShareToWhatsApp(params: {
    imageUri: string;
    mime?: string;
    text?: string;
}): Promise<boolean> {
    if (!native) return false;
    try {
        return !!(await native.shareToWhatsApp(params));
    } catch {
        return false;
    }
}

export async function nativeShareToWhatsAppStatus(params: {
    imageUri?: string;
    filePath?: string;
    mime?: string;
    text?: string;
}): Promise<boolean> {
    if (!native) return false;
    try {
        return !!(await native.shareToWhatsAppStatus(params));
    } catch {
        return false;
    }
}
