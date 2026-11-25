import { Linking, Platform, Share, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import Constants from 'expo-constants';
import {
    hasShareBridge,
    nativeShareToInstagramStory,
    nativeShareToWhatsApp,
    nativeShareToWhatsAppStatus,
} from '../../modules/share-bridge';

const PLAY_STORE_URL = 'https://play.google.com/store/apps/details?id=com.activity.app';

function facebookAppId() {
    // Meta App ID — IG Hikâye source_application / link sticker (genelde public).
    return Constants.expoConfig?.extra?.facebookAppId
        || Constants.manifest?.extra?.facebookAppId
        || '1411973897673084';
}

function defaultLinkText(t) {
    return t?.shareMatchStoreCta || 'AcTiViTy indir';
}

async function contentUriFor(filePath) {
    if (Platform.OS !== 'android' || !filePath) return null;
    try {
        return await FileSystem.getContentUriAsync(filePath);
    } catch {
        return null;
    }
}

async function mediaStoreUriFor(filePath) {
    if (Platform.OS !== 'android' || !filePath) return null;
    try {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) return null;
        const asset = await MediaLibrary.createAssetAsync(filePath);
        return asset?.uri || null;
    } catch {
        return null;
    }
}

async function openUrl(url) {
    try {
        await Linking.openURL(url);
        return true;
    } catch {
        return false;
    }
}

async function saveToGallery(filePath) {
    try {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) return false;
        await MediaLibrary.saveToLibraryAsync(filePath);
        return true;
    } catch {
        return false;
    }
}

function resolveLinkUrl(linkUrl) {
    return linkUrl || PLAY_STORE_URL;
}

/** JPEG'i image/png diye göndermek WhatsApp'ta boş/kırık önizleme yapıyordu. */
export function mimeFromPath(path, { isVideo } = {}) {
    const p = String(path || '').toLowerCase();
    if (isVideo || /\.(mp4|mov|m4v|webm)(\?|$)/i.test(p)) return 'video/mp4';
    if (/\.png(\?|$)/i.test(p)) return 'image/png';
    if (/\.webp(\?|$)/i.test(p)) return 'image/webp';
    if (/\.gif(\?|$)/i.test(p)) return 'image/gif';
    return 'image/jpeg';
}

/** WhatsApp sohbet — native SEND (görsel); yoksa deep link. */
export async function shareToWhatsApp({ filePath, message, mime }) {
    const resolvedMime = mime || mimeFromPath(filePath);
    // Kullanıcı raporu: gönderi fotoğrafı WA'da boş/koyu — native bridge content:// imageUri
    // ile sourceFile bulamıyordu (sadece filePath / file://). IG Hikâye gibi filePath ver.
    if (Platform.OS === 'android' && filePath && hasShareBridge()) {
        const abs = String(filePath).replace(/^file:\/\//, '');
        const ok = await nativeShareToWhatsApp({
            filePath: abs,
            imageUri: abs.startsWith('/') ? `file://${abs}` : String(filePath),
            mime: resolvedMime,
            text: message || '',
        });
        if (ok) return 'opened';
        // Yedek: content URI (eski deneme yolu)
        const uri = (await contentUriFor(filePath)) || (await mediaStoreUriFor(filePath));
        if (uri?.startsWith('file:')) {
            const ok2 = await nativeShareToWhatsApp({
                imageUri: uri,
                mime: resolvedMime,
                text: message || '',
            });
            if (ok2) return 'opened';
        }
    }
    if (Platform.OS === 'android' && filePath) {
        // Eski APK: intent URI denemesi
        const uri = await contentUriFor(filePath);
        if (uri) {
            const intent = [
                'intent:#Intent',
                'action=android.intent.action.SEND',
                `type=${resolvedMime}`,
                'package=com.whatsapp',
                'flags=1',
                `U.android.intent.extra.STREAM=${encodeURIComponent(uri)}`,
                message ? `S.android.intent.extra.TEXT=${encodeURIComponent(message)}` : null,
                'end',
            ].filter(Boolean).join(';');
            if (await openUrl(intent)) return 'opened';
        }
    }
    if (Platform.OS === 'ios' && filePath) {
        try {
            await Share.share({ url: filePath, message: message || undefined });
            return 'sheet';
        } catch { /* fall through */ }
    }
    const textUrl = `whatsapp://send?text=${encodeURIComponent(message || '')}`;
    if (await openUrl(textUrl)) {
        if (filePath) await saveToGallery(filePath);
        return filePath ? 'text_plus_gallery' : 'text';
    }
    await Share.share({ message: message || '' });
    return 'sheet';
}

/**
 * WhatsApp Durumu — native: JPEG→MediaStore + Status proxy (startActivityForResult).
 * Düz startActivity çoğu telefonda sadece WA ana ekranını açıyordu.
 */
export async function shareToWhatsAppStatus({ filePath, message, t }) {
    if (!filePath) {
        Alert.alert('', t?.shareMatchFail || '');
        return 'fail';
    }
    if (Platform.OS === 'android' && hasShareBridge()) {
        const abs = String(filePath).replace(/^file:\/\//, '');
        const ok = await nativeShareToWhatsAppStatus({
            filePath: abs,
            mime: mimeFromPath(filePath),
            text: '',
        });
        if (ok) return 'opened';
    }
    await saveToGallery(filePath);
    const opened = await openUrl('whatsapp://');
    Alert.alert('', t?.shareMatchWaStatusHint || t?.shareMatchAndroidHint || '');
    return opened ? 'gallery_hint' : 'fail';
}

/**
 * Instagram Hikâye — native ADD_TO_STORY (görsel seçili besteci).
 * Native FileProvider + filePath gerekir; content:// imageUri Kotlin tarafında yok sayılıyordu
 * (sadece Instagram açılıp görsel gelmiyordu). WA Durum ile aynı filePath yolu.
 */
export async function shareToInstagramStory({ filePath, t, linkUrl }) {
    const resolvedLink = resolveLinkUrl(linkUrl);
    const linkText = defaultLinkText(t);

    if (Platform.OS === 'android' && filePath && hasShareBridge()) {
        const abs = String(filePath).replace(/^file:\/\//, '');
        const igParams = {
            filePath: abs,
            imageUri: abs.startsWith('/') ? `file://${abs}` : String(filePath),
            mime: mimeFromPath(filePath),
            facebookAppId: facebookAppId() || '',
            linkUrl: resolvedLink,
            linkText,
        };
        let ok = await nativeShareToInstagramStory(igParams);
        // Eski deneme: content URI (yeni APK filePath ile çalışır; yedek)
        if (!ok) {
            const uri = await contentUriFor(filePath);
            if (uri?.startsWith('file:')) {
                ok = await nativeShareToInstagramStory({ ...igParams, imageUri: uri, filePath: '' });
            }
        }
        if (!ok) {
            const mediaUri = await mediaStoreUriFor(filePath);
            if (mediaUri?.startsWith('file:')) {
                ok = await nativeShareToInstagramStory({ ...igParams, imageUri: mediaUri, filePath: '' });
            }
        }
        if (ok) return 'opened';
    }

    // Native yok / düştü — galeri + hikâye kamerası (eski APK OTA yolu)
    if (filePath) await saveToGallery(filePath);
    if (await openUrl('instagram://story-camera')) {
        Alert.alert('', t?.shareMatchIgHint || '');
        return 'camera';
    }
    Alert.alert('', t?.shareMatchIgHint || t?.shareMatchAndroidHint || '');
    return 'gallery_hint';
}

export async function shareViaSystemSheet({ filePath, message }) {
    const resolvedMime = mimeFromPath(filePath);
    if (Platform.OS === 'ios' && filePath) {
        await Share.share({ url: filePath, message: message || undefined });
        return;
    }
    if (Platform.OS === 'android' && filePath) {
        const uri = await contentUriFor(filePath);
        if (uri) {
            const url = [
                'intent:#Intent',
                'action=android.intent.action.SEND',
                `type=${resolvedMime}`,
                'flags=1',
                `U.android.intent.extra.STREAM=${encodeURIComponent(uri)}`,
                message ? `S.android.intent.extra.TEXT=${encodeURIComponent(message)}` : null,
                'end',
            ].filter(Boolean).join(';');
            if (await openUrl(url)) return;
        }
        await saveToGallery(filePath);
    }
    await Share.share({ message: message || '' });
}

export async function ensureGallerySave(filePath) {
    return saveToGallery(filePath);
}

export { PLAY_STORE_URL };
