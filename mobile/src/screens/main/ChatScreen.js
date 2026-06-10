import { useEffect, useState, useRef } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform } from 'react-native';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

function Avatar({ user, size = 36 }) {
    return (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>
                {user?.username?.[0]?.toUpperCase() || '?'}
            </Text>
        </View>
    );
}

export default function ChatScreen({ route, navigation }) {
    const { conversation: convParam, other: otherProp } = route.params;
    const myId = useSelector(s => s.auth.user?.id);
    const t = useT();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [convId, setConvId] = useState(convParam?.id || null);
    const flatRef = useRef(null);

    const other = otherProp || convParam?.other;

    useEffect(() => {
        const init = async () => {
            try {
                let id = convId;
                if (!id && other?.id) {
                    const { data } = await api.get(`/messages/conversation/${other.id}`);
                    id = data.id;
                    setConvId(id);
                }
                if (id) {
                    const { data } = await api.get(`/messages/conversation/${id}/messages`);
                    setMessages(data);
                    setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
                }
            } catch (e) { console.error(e); }
            finally { setLoading(false); }
        };
        init();
    }, []);

    const send = async () => {
        if (!input.trim() || sending) return;
        const text = input.trim();
        setInput('');
        setSending(true);
        try {
            const { data } = await api.post(`/messages/send/${other?.id}`, { content: text });
            setMessages(prev => [...prev, data.message]);
            setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
        } catch (e) { console.error(e); }
        finally { setSending(false); }
    };

    const renderMessage = ({ item }) => {
        const isMe = item.senderId === myId;
        return (
            <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                {!isMe && <Avatar user={item.sender} size={30} />}
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
                    <Text style={styles.bubbleText}>{item.content}</Text>
                    <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
                        {new Date(item.createdAt).toLocaleTimeString(t.dateLocale, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
                <Avatar user={other} size={36} />
                <View style={styles.headerInfo}>
                    <Text style={styles.headerName}>{other?.fullName || other?.username}</Text>
                    <Text style={styles.headerSub}>@{other?.username}</Text>
                </View>
            </View>

            {/* Messages */}
            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ flex: 1 }} />
            ) : (
                <FlatList
                    ref={flatRef}
                    data={messages}
                    keyExtractor={item => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.list}
                    onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Avatar user={other} size={52} />
                            <Text style={styles.emptyName}>{other?.fullName || other?.username}</Text>
                            <Text style={styles.emptyHint}>{t.chatSayHello}</Text>
                        </View>
                    }
                />
            )}

            {/* Input */}
            <View style={styles.inputRow}>
                <TextInput
                    style={styles.input}
                    value={input}
                    onChangeText={setInput}
                    placeholder={t.chatInputPh}
                    placeholderTextColor={colors.textMuted}
                    multiline
                    onSubmitEditing={send}
                />
                <TouchableOpacity style={[styles.sendBtn, (!input.trim() || sending) && styles.sendBtnDisabled]} onPress={send} disabled={!input.trim() || sending}>
                    <Text style={styles.sendText}>{sending ? '...' : '➤'}</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 56, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 10 },
    backBtn: { padding: 4 },
    backText: { color: colors.purple, fontSize: 22, fontWeight: '700' },
    avatar: { backgroundColor: colors.purple, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#fff', fontWeight: '800' },
    headerInfo: { flex: 1 },
    headerName: { color: '#fff', fontWeight: '700', fontSize: 14 },
    headerSub: { color: colors.textMuted, fontSize: 11 },
    list: { paddingHorizontal: 16, paddingVertical: 16, gap: 10 },
    msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowThem: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '72%', paddingHorizontal: 14, paddingVertical: 10, borderRadius: 18 },
    bubbleMe: { backgroundColor: colors.purple, borderBottomRightRadius: 4 },
    bubbleThem: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
    bubbleText: { color: '#fff', fontSize: 14 },
    bubbleTime: { fontSize: 10, marginTop: 4 },
    bubbleTimeMe: { color: '#d8b4fe' },
    bubbleTimeThem: { color: colors.textMuted },
    empty: { alignItems: 'center', paddingTop: 60, gap: 8 },
    emptyName: { color: '#fff', fontWeight: '700', fontSize: 15 },
    emptyHint: { color: colors.textMuted, fontSize: 13 },
    inputRow: { flexDirection: 'row', paddingHorizontal: 16, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border, gap: 10, alignItems: 'flex-end' },
    input: { flex: 1, backgroundColor: colors.surface, color: '#fff', borderRadius: 20, paddingHorizontal: 16, paddingVertical: 10, borderWidth: 1, borderColor: colors.border, fontSize: 14, maxHeight: 100 },
    sendBtn: { backgroundColor: colors.purple, borderRadius: 20, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    sendBtnDisabled: { opacity: 0.4 },
    sendText: { color: '#fff', fontWeight: '800', fontSize: 16 },
});
