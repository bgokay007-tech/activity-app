import { Alert } from 'react-native';
import api from '../services/api';

export function contentKindLabel(type, t) {
    if (type === 'REEL') return t?.shareReelKind || 'reel';
    if (type === 'STORY') return t?.shareStoryKind || 'hikaye';
    return t?.sharePostKind || 'gönderi';
}

export function privacyDeniedMessage({ privacyMode, contentKind, code, fallback, t }) {
    if (code === 'EXPIRED') return t?.sharedPostExpired || fallback || 'Bu hikaye süresi dolmuş.';
    if (code === 'HIDDEN' || code === 'NOT_FOUND') {
        return t?.sharedPostUnavailable || fallback || 'Bu içerik görüntülenemiyor.';
    }
    const kindPlural = contentKind === 'REEL'
        ? (t?.sharedKindReels || 'reelsleri')
        : contentKind === 'STORY'
            ? (t?.sharedKindStories || 'hikayeleri')
            : (t?.sharedKindPosts || 'gönderileri');
    const map = {
        FRIENDS: t?.sharedPrivacyFriends,
        FOLLOWERS: t?.sharedPrivacyFollowers,
        FRIENDS_EXCEPT: t?.sharedPrivacyFriendsExcept,
        FRIENDS_SELECTED: t?.sharedPrivacyFriendsSelected,
        NOBODY: t?.sharedPrivacyNobody,
    };
    const fn = map[privacyMode];
    if (typeof fn === 'function') return fn(kindPlural);
    if (typeof fn === 'string') return fn.replace('{kind}', kindPlural);
    return fallback || (t?.sharedPrivacyFallback
        ? t.sharedPrivacyFallback(kindPlural)
        : `Bu kişinin ${kindPlural} görüntülenemez.`);
}

// Sohbetteki kart veya iletim sonrası açılış — yetki yoksa nedenini Alert ile gösterir.
export async function openSharedPost(postId, { t, onOpen } = {}) {
    if (!postId) return null;
    try {
        const { data } = await api.get(`/posts/${postId}`);
        if (onOpen) onOpen(data);
        return data;
    } catch (e) {
        const d = e?.response?.data;
        const msg = privacyDeniedMessage({
            privacyMode: d?.privacyMode,
            contentKind: d?.contentKind,
            code: d?.code,
            fallback: d?.message,
            t,
        });
        Alert.alert(t?.sharedPostLockedTitle || 'Görüntülenemiyor', msg);
        return null;
    }
}

export async function sendSharedPost({ receiverId, postId, content = '' }) {
    const { data } = await api.post(`/messages/send/${receiverId}`, {
        content: content || '',
        sharedPostId: postId,
    });
    return data;
}
