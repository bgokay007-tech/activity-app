import { useMemo, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert,
    Linking, Share, Platform, ActivityIndicator, Clipboard,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import colors from '../theme/colors';
import useT from '../hooks/useT';
import { sharePost } from '../utils/share';
import { BASE_URL } from '../services/api';

const SHARE_HOST = BASE_URL.replace(/\/api\/?$/, '');

function postShareUrl(post) {
    if (!post?.id) return '';
    return `${SHARE_HOST}/share/post/${post.id}`;
}

function postShareMessage(post, t) {
    const url = postShareUrl(post);
    const author = post?.user?.fullName || post?.user?.username || '';
    const kind = post?.type === 'REEL'
        ? (t?.shareReelKind || 'reel')
        : post?.type === 'STORY'
            ? (t?.shareStoryKind || t?.sh_0664 || 'story')
            : (t?.sharePostKind || t?.sh_0054 || 'post');
    const intro = t?.sharePostIntro
        ? t.sharePostIntro(author, kind)
        : (author ? `${author} · AcTiViTy ${kind}` : `AcTiViTy ${kind}`);
    const snippet = String(post?.content || '').trim().slice(0, 160);
    return [intro, snippet, url].filter(Boolean).join('\n');
}

async function cacheMediaFile(post) {
    const remote = post?.imageUrl || post?.videoUrl;
    if (!remote) return null;
    const isVideo = !!post.videoUrl && !post.imageUrl;
    const ext = isVideo ? 'mp4' : 'jpg';
    const dest = `${FileSystem.cacheDirectory}activity-share-${post.id}.${ext}`;
    try {
        const info = await FileSystem.getInfoAsync(dest);
        if (info.exists && info.size > 1000) return { path: dest, isVideo };
        const https = String(remote).replace(/^http:\/\//i, 'https://');
        const res = await FileSystem.downloadAsync(https, dest);
        if (res?.uri) return { path: res.uri, isVideo };
    } catch { /* ignore */ }
    return null;
}

async function openOrFallback(url, fallbackFn) {
    try {
        const can = await Linking.canOpenURL(url);
        if (can) {
            await Linking.openURL(url);
            return;
        }
    } catch { /* fall through */ }
    if (fallbackFn) await fallbackFn();
}

// Medya kartı → uygulama dışı: WhatsApp, Telegram, e-posta, IG, FB, Threads...
export default function ExternalMediaShareModal({ visible, post, onClose, onShareToFriend }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [busy, setBusy] = useState(false);
    const msg = useMemo(() => postShareMessage(post, t), [post, t]);
    const url = useMemo(() => postShareUrl(post), [post]);

    const run = async (fn) => {
        if (!post?.id || busy) return;
        setBusy(true);
        try {
            await fn();
            onClose?.();
        } catch (e) {
            Alert.alert(t.error || 'Error', e?.message || t.media_ext_fail || 'Share failed');
        } finally {
            setBusy(false);
        }
    };

    const shareWithMediaHint = async () => {
        const file = await cacheMediaFile(post);
        if (file?.path) {
            try {
                const perm = await MediaLibrary.requestPermissionsAsync();
                if (perm.granted) await MediaLibrary.saveToLibraryAsync(file.path);
            } catch { /* gallery optional */ }
            if (Platform.OS === 'ios') {
                try {
                    await Share.share({ url: file.path, message: msg });
                    return;
                } catch { /* fall through */ }
            }
        }
        await Share.share({ message: msg, url });
        Alert.alert('', t.media_ext_gallery_hint || '');
    };

    const items = [
        {
            id: 'whatsapp', emoji: '💬', label: 'WhatsApp',
            go: () => openOrFallback(
                `whatsapp://send?text=${encodeURIComponent(msg)}`,
                () => Share.share({ message: msg, url }),
            ),
        },
        {
            id: 'wa_status', emoji: '🟢', label: t.media_ext_wa_status || 'WhatsApp Status',
            go: shareWithMediaHint,
        },
        {
            id: 'telegram', emoji: '✈️', label: 'Telegram',
            go: () => openOrFallback(
                `https://t.me/share/url?url=${encodeURIComponent(url)}&text=${encodeURIComponent(msg)}`,
                () => Share.share({ message: msg, url }),
            ),
        },
        {
            id: 'instagram', emoji: '📸', label: 'Instagram',
            go: shareWithMediaHint,
        },
        {
            id: 'ig_story', emoji: '📱', label: t.media_ext_ig_story || 'Instagram Story',
            go: shareWithMediaHint,
        },
        {
            id: 'threads', emoji: '🧵', label: 'Threads',
            go: () => openOrFallback(
                `https://www.threads.net/intent/post?text=${encodeURIComponent(msg)}`,
                () => Share.share({ message: msg, url }),
            ),
        },
        {
            id: 'facebook', emoji: '📘', label: 'Facebook',
            go: () => openOrFallback(
                `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`,
                () => Share.share({ message: msg, url }),
            ),
        },
        {
            id: 'email', emoji: '✉️', label: 'Email',
            go: () => Linking.openURL(
                `mailto:?subject=${encodeURIComponent('AcTiViTy')}&body=${encodeURIComponent(msg)}`,
            ),
        },
        {
            id: 'gmail', emoji: '📧', label: 'Gmail',
            go: () => openOrFallback(
                `googlegmail://co?subject=${encodeURIComponent('AcTiViTy')}&body=${encodeURIComponent(msg)}`,
                () => Linking.openURL(
                    `mailto:?subject=${encodeURIComponent('AcTiViTy')}&body=${encodeURIComponent(msg)}`,
                ),
            ),
        },
        {
            id: 'photos', emoji: '🖼️', label: t.media_ext_photos || 'Google Photos / Gallery',
            go: async () => {
                const file = await cacheMediaFile(post);
                if (!file?.path) {
                    Alert.alert('', t.media_ext_no_media || '');
                    return;
                }
                const perm = await MediaLibrary.requestPermissionsAsync();
                if (!perm.granted) {
                    Alert.alert(t.error || 'Error', t.media_ext_gallery_denied || '');
                    return;
                }
                await MediaLibrary.saveToLibraryAsync(file.path);
                Alert.alert('', t.media_ext_saved_gallery || '');
            },
        },
        {
            id: 'copy', emoji: '🔗', label: t.media_ext_copy || 'Copy link',
            go: async () => {
                Clipboard.setString(url || msg);
                Alert.alert('', t.media_ext_copied || 'Copied');
            },
        },
        {
            id: 'more', emoji: '⋯', label: t.media_ext_more || 'More apps',
            go: () => sharePost(post, t),
        },
        {
            id: 'friend', emoji: '👥', label: t.shareToFriendTitle || t.media_ext_friend || 'Friend',
            go: async () => {
                onClose?.();
                onShareToFriend?.(post);
            },
        },
    ];

    return (
        <Modal visible={!!visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
                <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 14) }]}>
                    <View style={s.handle} />
                    <Text style={s.title}>{t.media_ext_share_title || 'Share'}</Text>
                    {busy ? (
                        <ActivityIndicator color={colors.purple} style={{ marginVertical: 28 }} />
                    ) : (
                        <ScrollView contentContainerStyle={s.grid} showsVerticalScrollIndicator={false}>
                            {items.map((it) => (
                                <TouchableOpacity
                                    key={it.id}
                                    style={s.cell}
                                    activeOpacity={0.8}
                                    onPress={() => run(it.go)}
                                >
                                    <Text style={s.emoji}>{it.emoji}</Text>
                                    <Text style={s.label} numberOfLines={2}>{it.label}</Text>
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    )}
                    <TouchableOpacity style={s.cancel} onPress={onClose}>
                        <Text style={s.cancelText}>{t.cancel || t.sc_0004 || 'Cancel'}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface || '#1a1a1a',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        paddingTop: 10,
        paddingHorizontal: 14,
        maxHeight: '72%',
    },
    handle: {
        alignSelf: 'center', width: 40, height: 4, borderRadius: 2,
        backgroundColor: '#ffffff33', marginBottom: 12,
    },
    title: { color: '#fff', fontSize: 17, fontWeight: '800', marginBottom: 14, textAlign: 'center' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 8 },
    cell: {
        width: '22%', minWidth: 72, alignItems: 'center', gap: 6,
        backgroundColor: colors.surface2 || '#222', borderRadius: 14,
        paddingVertical: 12, paddingHorizontal: 4,
        borderWidth: 1, borderColor: colors.border || '#333',
    },
    emoji: { fontSize: 26 },
    label: { color: '#fff', fontSize: 11, fontWeight: '700', textAlign: 'center' },
    cancel: {
        marginTop: 10, backgroundColor: colors.surface2 || '#222', borderRadius: 12,
        paddingVertical: 13, alignItems: 'center',
    },
    cancelText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});
