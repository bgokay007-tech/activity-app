import { Linking, Platform, Share, Alert } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

/**
 * Android Intent URI ile uygulamayı doğrudan aç (görsel + metin).
 * U.android.intent.extra.STREAM → Uri tipi EXTRA_STREAM.
 * flags=1 → FLAG_GRANT_READ_URI_PERMISSION.
 */
function androidSendIntent({ packageName, contentUri, mime = 'image/png', text = '' }) {
    const parts = [
        'intent:#Intent',
        'action=android.intent.action.SEND',
        `type=${mime}`,
        'flags=1',
    ];
    if (packageName) parts.push(`package=${packageName}`);
    if (contentUri) parts.push(`U.android.intent.extra.STREAM=${encodeURIComponent(contentUri)}`);
    if (text) parts.push(`S.android.intent.extra.TEXT=${encodeURIComponent(text)}`);
    parts.push('end');
    return parts.join(';');
}

/**
 * Instagram Hikâye — com.instagram.share.ADD_TO_STORY.
 * content URI encode edilmeden intent: path'e konur (encode edince IG ana sayfaya düşüyordu).
 * MediaStore content:// URI tercih edilir.
 */
function androidStoryIntents(contentUri, sourceApp = 'com.activity.app') {
    const type = 'image/png';
    return [
        // 1) setDataAndType tarzı (Meta dokümantasyonu)
        [
            `intent:${contentUri}`,
            '#Intent',
            'scheme=content',
            'action=com.instagram.share.ADD_TO_STORY',
            `type=${type}`,
            'package=com.instagram.android',
            'flags=1',
            `S.source_application=${sourceApp}`,
            'end',
        ].join(';'),
        // 2) action + EXTRA yok, data URI
        [
            `intent:${contentUri}`,
            '#Intent',
            'scheme=content',
            'action=com.instagram.share.ADD_TO_STORY',
            `type=${type}`,
            'package=com.instagram.android',
            'flags=1',
            'end',
        ].join(';'),
        // 3) #Intent formunda data=
        [
            'intent:#Intent',
            'action=com.instagram.share.ADD_TO_STORY',
            `type=${type}`,
            'package=com.instagram.android',
            'flags=1',
            `S.source_application=${sourceApp}`,
            `S.android.intent.extra.STREAM=${contentUri}`,
            'end',
        ].join(';'),
    ];
}

async function contentUriFor(filePath) {
    if (Platform.OS !== 'android') return null;
    try {
        return await FileSystem.getContentUriAsync(filePath);
    } catch {
        return null;
    }
}

/** Galeriye yazıp MediaStore content:// URI al — IG Hikâye bunu daha iyi kabul ediyor. */
async function mediaStoreUriFor(filePath) {
    if (Platform.OS !== 'android' || !filePath) return null;
    try {
        const perm = await MediaLibrary.requestPermissionsAsync();
        if (!perm.granted) return null;
        const asset = await MediaLibrary.createAssetAsync(filePath);
        if (!asset?.uri) return null;
        // asset.uri genelde content://media/external/images/...
        return asset.uri;
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

/** WhatsApp sohbet — görsel + metin. */
export async function shareToWhatsApp({ filePath, message }) {
    if (Platform.OS === 'android' && filePath) {
        const uri = (await mediaStoreUriFor(filePath)) || (await contentUriFor(filePath));
        if (uri) {
            const ok = await openUrl(androidSendIntent({
                packageName: 'com.whatsapp',
                contentUri: uri,
                text: message || '',
            }));
            if (ok) return 'opened';
        }
    }
    const textUrl = `whatsapp://send?text=${encodeURIComponent(message || '')}`;
    if (await openUrl(textUrl)) {
        if (filePath) await saveToGallery(filePath);
        return filePath ? 'text_plus_gallery' : 'text';
    }
    await Share.share({ message: message || '' });
    return 'sheet';
}

/** WhatsApp Durumu — görseli WhatsApp'a SEND; Durum seçilebilir. */
export async function shareToWhatsAppStatus({ filePath, message, t }) {
    if (!filePath) {
        await shareToWhatsApp({ message });
        return 'text';
    }
    if (Platform.OS === 'android') {
        const uri = (await mediaStoreUriFor(filePath)) || (await contentUriFor(filePath));
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

/**
 * Instagram Hikâye — sadece Hikâye composer (ADD_TO_STORY / story-camera).
 * Ana Instagram feed'ine düşmesin diye düz instagram:// veya package launch yok.
 */
export async function shareToInstagramStory({ filePath, t }) {
    if (Platform.OS === 'android' && filePath) {
        // Önce galeriye yaz → MediaStore URI; IG Hikâye backgroundImage olarak bunu ister
        const mediaUri = await mediaStoreUriFor(filePath);
        const fileUri = mediaUri || (await contentUriFor(filePath));
        if (fileUri) {
            for (const intentUrl of androidStoryIntents(fileUri)) {
                if (await openUrl(intentUrl)) return 'opened';
            }
        }
        // Intent düştüyse: hikâye kamerası (feed değil) + galeri ipucu
        await saveToGallery(filePath);
        if (await openUrl('instagram://story-camera')) {
            Alert.alert('', t?.shareMatchIgHint || '');
            return 'camera';
        }
        Alert.alert('', t?.shareMatchIgHint || t?.shareMatchAndroidHint || '');
        return 'gallery_hint';
    }

    if (Platform.OS === 'ios') {
        if (filePath) await saveToGallery(filePath);
        // Hikâye paylaşım scheme — yoksa story-camera (yine hikâye, feed değil)
        if (await openUrl('instagram-stories://share')) return 'ios_stories';
        if (await openUrl('instagram://story-camera')) {
            Alert.alert('', t?.shareMatchIgHint || '');
            return 'camera';
        }
        Alert.alert('', t?.shareMatchIgHint || t?.shareMatchAndroidHint || '');
        return 'gallery_hint';
    }

    if (filePath) await saveToGallery(filePath);
    if (await openUrl('instagram://story-camera')) {
        Alert.alert('', t?.shareMatchIgHint || '');
        return 'camera';
    }
    Alert.alert('', t?.shareMatchIgHint || '');
    return 'gallery_hint';
}

/** Sistem paylaşım sayfası — mümkünse görselli. */
export async function shareViaSystemSheet({ filePath, message }) {
    if (Platform.OS === 'ios' && filePath) {
        await Share.share({ url: filePath, message: message || undefined });
        return;
    }
    if (Platform.OS === 'android' && filePath) {
        const uri = (await mediaStoreUriFor(filePath)) || (await contentUriFor(filePath));
        if (uri) {
            const url = androidSendIntent({ contentUri: uri, text: message || '' });
            if (await openUrl(url)) return;
        }
        await saveToGallery(filePath);
    }
    await Share.share({ message: message || '' });
}

export async function ensureGallerySave(filePath) {
    return saveToGallery(filePath);
}
