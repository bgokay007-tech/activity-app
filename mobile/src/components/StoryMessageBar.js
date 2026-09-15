import { useState } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, ActivityIndicator,
    StyleSheet, KeyboardAvoidingView, Platform, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import useT from '../hooks/useT';
import { sendSharedPost } from '../utils/sharedPost';

// Hikaye izlerken: sahibine mesaj + arkadaşa ilet butonu.
export default function StoryMessageBar({
    story,
    ownerId,
    myId,
    paused,
    onPauseChange,
    onOpenShare,
}) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [text, setText] = useState('');
    const [sending, setSending] = useState(false);
    const isOwn = !ownerId || ownerId === myId;

    if (!story?.id || isOwn) return null;

    const sendReply = async () => {
        const body = text.trim();
        if (!body || sending) return;
        setSending(true);
        try {
            await sendSharedPost({ receiverId: ownerId, postId: story.id, content: body });
            setText('');
            Alert.alert(t.storyReplySentTitle || 'Gönderildi', t.storyReplySentBody || 'Mesajın iletildi.');
            onPauseChange?.(false);
        } catch (e) {
            Alert.alert(
                t.errorTitle || 'Hata',
                e?.response?.data?.message || t.storyReplyFail || 'Mesaj gönderilemedi.',
            );
        } finally {
            setSending(false);
        }
    };

    return (
        <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            keyboardVerticalOffset={0}
            style={[s.wrap, { paddingBottom: Math.max(insets.bottom, 10) }]}
        >
            <View style={s.row}>
                <TextInput
                    style={s.input}
                    value={text}
                    onChangeText={setText}
                    placeholder={t.storyReplyPh || 'Mesaj yaz...'}
                    placeholderTextColor="#ffffff88"
                    onFocus={() => onPauseChange?.(true)}
                    onBlur={() => { if (!text.trim()) onPauseChange?.(false); }}
                    returnKeyType="send"
                    onSubmitEditing={sendReply}
                    maxLength={500}
                />
                <TouchableOpacity
                    onPress={sendReply}
                    disabled={sending || !text.trim()}
                    style={[s.iconBtn, (!text.trim() || sending) && { opacity: 0.4 }]}
                >
                    {sending
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.iconTxt}>➤</Text>}
                </TouchableOpacity>
                <TouchableOpacity
                    onPress={() => { onPauseChange?.(true); onOpenShare?.(story); }}
                    style={s.iconBtn}
                >
                    <Text style={s.iconTxt}>↗</Text>
                </TouchableOpacity>
            </View>
            {paused ? <Text style={s.pausedHint}>{t.storyPausedHint || 'Mesaj yazarken hikaye duraklatıldı'}</Text> : null}
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    wrap: {
        position: 'absolute', left: 0, right: 0, bottom: 0,
        paddingHorizontal: 10, paddingTop: 8,
        backgroundColor: '#00000066',
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: {
        flex: 1, height: 40, borderRadius: 20, borderWidth: 1, borderColor: '#ffffff40',
        paddingHorizontal: 14, color: '#fff', fontSize: 13, backgroundColor: '#00000040',
    },
    iconBtn: {
        width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.purple + 'cc',
    },
    iconTxt: { color: '#fff', fontSize: 16, fontWeight: '800' },
    pausedHint: { color: '#ffffff88', fontSize: 10, marginTop: 4, textAlign: 'center' },
});
