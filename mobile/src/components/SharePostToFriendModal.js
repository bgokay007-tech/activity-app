import { useEffect, useMemo, useState } from 'react';
import {
    Modal, View, Text, TextInput, TouchableOpacity, FlatList, Image,
    ActivityIndicator, StyleSheet, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import colors from '../theme/colors';
import useT from '../hooks/useT';
import { contentKindLabel, sendSharedPost } from '../utils/sharedPost';

// Hikaye / gönderi / reels → arkadaş seçip DM ile ilet (isteğe bağlı not).
export default function SharePostToFriendModal({ visible, post, onClose }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [friends, setFriends] = useState([]);
    const [loading, setLoading] = useState(false);
    const [sendingId, setSendingId] = useState(null);
    const [query, setQuery] = useState('');
    const [note, setNote] = useState('');

    useEffect(() => {
        if (!visible) {
            setQuery(''); setNote(''); setSendingId(null);
            return;
        }
        setLoading(true);
        api.get('/friends')
            .then(({ data }) => setFriends(Array.isArray(data) ? data : []))
            .catch(() => setFriends([]))
            .finally(() => setLoading(false));
    }, [visible]);

    const filtered = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return friends;
        return friends.filter(f =>
            (f.username || '').toLowerCase().includes(q)
            || (f.fullName || '').toLowerCase().includes(q),
        );
    }, [friends, query]);

    const kind = contentKindLabel(post?.type, t);

    const sendTo = async (friend) => {
        if (!post?.id || sendingId) return;
        setSendingId(friend.id);
        try {
            await sendSharedPost({ receiverId: friend.id, postId: post.id, content: note.trim() });
            Alert.alert(
                t.sharedPostSentTitle || 'Gönderildi',
                t.sharedPostSentBody
                    ? t.sharedPostSentBody(friend.username || friend.fullName || '', kind)
                    : `@${friend.username} kişisine iletildi.`,
            );
            onClose?.();
        } catch (e) {
            Alert.alert(
                t.errorTitle || 'Hata',
                e?.response?.data?.message || t.sharedPostSendFail || 'Gönderilemedi.',
            );
        } finally {
            setSendingId(null);
        }
    };

    return (
        <Modal visible={!!visible} animationType="slide" transparent onRequestClose={onClose}>
            <KeyboardAvoidingView
                style={s.overlay}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
                    <View style={s.header}>
                        <Text style={s.title}>{t.shareToFriendTitle || 'Arkadaşa gönder'}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={10}>
                            <Text style={s.close}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={s.sub}>
                        {t.shareToFriendSub
                            ? t.shareToFriendSub(kind)
                            : `${kind} arkadaşlarına DM olarak iletilir.`}
                    </Text>
                    <TextInput
                        style={s.input}
                        value={note}
                        onChangeText={setNote}
                        placeholder={t.shareToFriendNotePh || 'İsteğe bağlı mesaj...'}
                        placeholderTextColor={colors.textMuted}
                        maxLength={500}
                    />
                    <TextInput
                        style={s.input}
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t.shareToFriendSearchPh || 'Arkadaş ara...'}
                        placeholderTextColor={colors.textMuted}
                        autoCorrect={false}
                    />
                    {loading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 20 }} />
                    ) : filtered.length === 0 ? (
                        <Text style={s.empty}>{t.shareToFriendEmpty || 'Arkadaş bulunamadı.'}</Text>
                    ) : (
                        <FlatList
                            data={filtered}
                            keyExtractor={item => item.id}
                            keyboardShouldPersistTaps="handled"
                            style={{ maxHeight: 360 }}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={s.row}
                                    onPress={() => sendTo(item)}
                                    disabled={!!sendingId}
                                    activeOpacity={0.8}
                                >
                                    <View style={s.avatar}>
                                        {item.avatar
                                            ? <Image source={{ uri: item.avatar }} style={s.avatarImg} />
                                            : <Text style={s.avatarLetter}>{(item.username || '?')[0]?.toUpperCase()}</Text>}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.name} numberOfLines={1}>{item.fullName || item.username}</Text>
                                        <Text style={s.uname} numberOfLines={1}>@{item.username}</Text>
                                    </View>
                                    {sendingId === item.id
                                        ? <ActivityIndicator size="small" color={colors.purple} />
                                        : <Text style={s.send}>{t.shareToFriendSendBtn || 'Gönder'}</Text>}
                                </TouchableOpacity>
                            )}
                        />
                    )}
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 22, borderTopRightRadius: 22,
        paddingHorizontal: 16, paddingTop: 14, maxHeight: '85%',
    },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    title: { color: '#fff', fontSize: 16, fontWeight: '900' },
    close: { color: colors.textMuted, fontSize: 20 },
    sub: { color: colors.textMuted, fontSize: 12, marginBottom: 10 },
    input: {
        backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
        color: '#fff', paddingHorizontal: 12, paddingVertical: 10, fontSize: 13, marginBottom: 8,
    },
    empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24, fontSize: 13 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border,
    },
    avatar: {
        width: 40, height: 40, borderRadius: 20, backgroundColor: colors.purple + '55',
        alignItems: 'center', justifyContent: 'center', overflow: 'hidden',
    },
    avatarImg: { width: 40, height: 40 },
    avatarLetter: { color: '#fff', fontWeight: '800', fontSize: 14 },
    name: { color: '#fff', fontWeight: '700', fontSize: 13 },
    uname: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
    send: { color: colors.purple, fontWeight: '800', fontSize: 13 },
});
