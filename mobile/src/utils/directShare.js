import { Linking, Platform, Share, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

/**
 * Android Intent URI ile uygulamayı doğrudan aç (görsel + metin).
 * U.android.intent.extra.STREAM → Uri tipi EXTRA_STREAM (String ile çoğu cihazda düşer).
 * flags=1 → FLAG_GRANT_READ_URI_PERMISSION.
 * Native IntentLauncher yokken OTA ile çalışır; başarısızsa çağıran taraf fallback kullanır.
 */
function androidSendIntent({ packageName, contentUri, mime = 'image/png', text = '', action = 'android.intent.action.SEND' }) {
    const parts = [
        `intent:#Intent`,
        `action=${action}`,
        `type=${mime}`,
        `package=${packageName}`,
        'flags=1',
    ];
    if (contentUri) parts.push(`U.android.intent.extra.STREAM=${encodeURIComponent(contentUri)}`);
    if (text) parts.push(`S.android.intent.extra.TEXT=${encodeURIComponent(text)}`);
    parts.push('end');
    return parts.join(';');
}

function androidStoryIntent(contentUri, sourceApp = 'com.activity.app') {
    // Instagram Hikâye — resmi ADD_TO_STORY. source_application Meta App ID ister;
    // yoksa bazı sürümlerde yine açılır, yoksa fallback (hikâye kamerası) kullanılır.
    return [
        `intent:${encodeURIComponent(contentUri)}`,
        '#Intent',
        'scheme=content',
        'action=com.instagram.share.ADD_TO_STORY',
        'type=image/png',
        'package=com.instagram.android',
        'flags=1',
        `S.source_application=${encodeURIComponent(sourceApp)}`,
        'end',
    ].join(';');
}

async function contentUriFor(filePath) {
    if (Platform.OS !== 'android') return null;
    try {
        return await FileSystem.getContentUriAsync(filePath);
    } catch {
        return null;
    }
}

async function openUrl(url) {
    try {
        const can = await Linking.canOpenURL(url);
        if (can) {
            await Linking.openURL(url);
            return true;
        }
    } catch { /* */ }
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

/** WhatsApp sohbet — metin deep link her zaman; varsa görseli de intent ile ekle. */
export async function shareToWhatsApp({ filePath, message }) {
    if (Platform.OS === 'android' && filePath) {
        const uri = await contentUriFor(filePath);
        if (uri) {
            const ok = await openUrl(androidSendIntent({
                packageName: 'com.whatsapp',
                contentUri: uri,
                text: message || '',
            }));
            if (ok) return 'opened';
        }
    }
    // iOS / intent düştü → metin deep link (görsel yok; kullanıcı galeriden ekler)
    const textUrl = `whatsapp://send?text=${encodeURIComponent(message || '')}`;
    if (await openUrl(textUrl)) {
        if (filePath) await saveToGallery(filePath);
        return filePath ? 'text_plus_gallery' : 'text';
    }
    await Share.share({ message: message || '' });
    return 'sheet';
}

/**
 * WhatsApp Durumu — ayrı scheme yok; görseli SEND ile WhatsApp'a ver.
 * Kullanıcı sohbet yerine Durum seçebilir; olmazsa galeri + WA açılır.
 */
export async function shareToWhatsAppStatus({ filePath, message, t }) {
    if (!filePath) {
        await shareToWhatsApp({ message });
        return 'text';
    }
    if (Platform.OS === 'android') {
        const uri = await contentUriFor(filePath);
        if (uri) {
            const ok = await openUrl(androidSendIntent({
                packageName: 'com.whatsapp',
                contentUri: uri,
                text: message || '',
            }));
            if (ok) return 'opened';
        }
    }
    await saveToGallery(filePath);
    await openUrl('whatsapp://');
    Alert.alert('', t?.shareMatchWaStatusHint || t?.shareMatchAndroidHint || '');
    return 'gallery_hint';
}

/** Instagram Hikâye — ADD_TO_STORY intent; olmazsa galeri + story kamerası. */
export async function shareToInstagramStory({ filePath, t }) {
    if (!filePath) {
        await openUrl('instagram://story-camera');
        return 'camera';
    }
    if (Platform.OS === 'android') {
        const uri = await contentUriFor(filePath);
        if (uri) {
            const ok = await openUrl(androidStoryIntent(uri));
            if (ok) return 'opened';
            // bazı cihazlar package'siz daha iyi çözüyor
            const alt = [
                `intent:${encodeURIComponent(uri)}`,
                '#Intent',
                'scheme=content',
                'action=com.instagram.share.ADD_TO_STORY',
                'type=image/png',
                'flags=1',
                'end',
            ].join(';');
            if (await openUrl(alt)) return 'opened';
        }
    }
    if (Platform.OS === 'ios') {
        // iOS resmi yol pasteboard + App ID ister; App ID yok → galeri + hikâye kamerası.
        await saveToGallery(filePath);
        if (await openUrl('instagram-stories://share')) return 'ios_stories';
        if (await openUrl('instagram://story-camera')) return 'camera';
        Alert.alert('', t?.shareMatchIgHint || t?.shareMatchAndroidHint || '');
        return 'gallery_hint';
    }
    await saveToGallery(filePath);
    await openUrl('instagram://story-camera');
    Alert.alert('', t?.shareMatchIgHint || t?.shareMatchAndroidHint || '');
    return 'gallery_hint';
}

/** Sistem paylaşım sayfası — mümkünse görselli. */
export async function shareViaSystemSheet({ filePath, message }) {
    if (Platform.OS === 'ios' && filePath) {
        await Share.share({ url: filePath, message: message || undefined });
        return;
    }
    if (Platform.OS === 'android' && filePath) {
        const uri = await contentUriFor(filePath);
        if (uri) {
            // Paketsiz ACTION_SEND → sistem chooser; kullanıcı WhatsApp / IG seçer (görsel ekli)
            const url = [
                'intent:#Intent',
                'action=android.intent.action.SEND',
                'type=image/png',
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
