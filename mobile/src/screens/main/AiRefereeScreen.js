import { useState, useRef, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet, StatusBar, Platform,
    KeyboardAvoidingView, ScrollView, ActivityIndicator,
} from 'react-native';
import colors from '../../theme/colors';
import api from '../../services/api';

const GREETING = `Hoş geldin! Ben bu masanın hem çayını demleyen hem de kurallarını bilen adamıyım — otuz senedir bu oyunları oynatırım, gözümden hiçbir yanlış el kaçmaz. Bugün ne oynuyoruz, karar senin:

Okey tarafı:
- Klasik Okey (4 kişilik, taş atma-çekme, çift/seri açma)
- 101 Okey (elden başlayıp 101 puana ulaşma, katlamalı/katlamasız)

Batak tarafı:
- İhaleli Batak (açık artırmayla el alma taahhüdü)
- Eşli Batak (2'ye 2 takım, karşılıklı oturma)
- Gömmeli Batak (bazı kartlar kapalı/gömülü kalır, daha zorlu versiyon)

Söyle bakalım: hangisini oynayacağız, ve masada kaç kişi olacağız?`;

export default function AiRefereeScreen({ navigation }) {
    const [messages, setMessages] = useState([{ role: 'assistant', content: GREETING }]);
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    const [error, setError] = useState('');
    const scrollRef = useRef(null);

    useEffect(() => {
        setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 100);
    }, [messages]);

    const send = async () => {
        const text = input.trim();
        if (!text || sending) return;
        setError('');
        const next = [...messages, { role: 'user', content: text }];
        setMessages(next);
        setInput('');
        setSending(true);
        try {
            const { data } = await api.post('/ai-referee/chat', { messages: next });
            setMessages(prev => [...prev, { role: 'assistant', content: data.reply }]);
        } catch (e) {
            setError(e?.response?.data?.message || 'Hakem şu anda cevap veremedi, tekrar dener misin?');
        } finally {
            setSending(false);
        }
    };

    return (
        <KeyboardAvoidingView style={s.root} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>🀄 AI Hakem</Text>
            </View>

            <ScrollView ref={scrollRef} contentContainerStyle={s.list} showsVerticalScrollIndicator={false}>
                {messages.map((m, i) => (
                    <View key={i} style={[s.bubbleRow, m.role === 'user' ? s.bubbleRowUser : s.bubbleRowAssistant]}>
                        <View style={[s.bubble, m.role === 'user' ? s.bubbleUser : s.bubbleAssistant]}>
                            <Text style={m.role === 'user' ? s.bubbleTextUser : s.bubbleTextAssistant}>{m.content}</Text>
                        </View>
                    </View>
                ))}
                {sending && (
                    <View style={[s.bubbleRow, s.bubbleRowAssistant]}>
                        <View style={[s.bubble, s.bubbleAssistant, { flexDirection: 'row', alignItems: 'center', gap: 8 }]}>
                            <ActivityIndicator size="small" color={colors.textMuted} />
                            <Text style={s.bubbleTextAssistant}>Hakem düşünüyor...</Text>
                        </View>
                    </View>
                )}
                {!!error && <Text style={s.errorText}>{error}</Text>}
            </ScrollView>

            <View style={s.inputRow}>
                <TextInput
                    value={input}
                    onChangeText={setInput}
                    placeholder="Hamleni ya da sorunu yaz..."
                    placeholderTextColor={colors.textMuted}
                    style={s.input}
                    editable={!sending}
                    multiline
                />
                <TouchableOpacity onPress={send} disabled={sending || !input.trim()} style={[s.sendBtn, (sending || !input.trim()) && { opacity: 0.5 }]}>
                    <Text style={s.sendBtnText}>Gönder</Text>
                </TouchableOpacity>
            </View>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title: { color: '#fff', fontSize: 17, fontWeight: '900' },

    list: { paddingHorizontal: 12, paddingVertical: 12, gap: 10 },
    bubbleRow: { flexDirection: 'row' },
    bubbleRowUser: { justifyContent: 'flex-end' },
    bubbleRowAssistant: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '85%', borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10 },
    bubbleUser: { backgroundColor: colors.purple, borderBottomRightRadius: 4 },
    bubbleAssistant: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderBottomLeftRadius: 4 },
    bubbleTextUser: { color: '#fff', fontSize: 14, lineHeight: 20 },
    bubbleTextAssistant: { color: colors.text, fontSize: 14, lineHeight: 20 },
    errorText: { color: '#f87171', fontSize: 12, textAlign: 'center', marginTop: 4 },

    inputRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderColor: colors.border, alignItems: 'flex-end' },
    input: { flex: 1, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 14, paddingVertical: 10, color: '#fff', fontSize: 14, maxHeight: 100 },
    sendBtn: { backgroundColor: colors.purple, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 11 },
    sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },
});
