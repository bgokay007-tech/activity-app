import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, Modal, ScrollView, TextInput, TouchableOpacity,
    ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import colors from '../theme/colors';

// Kullanıcı isteği: admine destek mesajı yazma bölümü artık tek bir düz mesaj listesi değil —
// her başlatılan sohbet kendi konusuyla (subject) ayrı bir "kutu" olsun, mesaj gönderince
// konunun adıyla bir sohbet butonu oluşsun, ona dokununca sadece o konunun mesajlaşması açılsın.
// Bu component eskiden ActivityFeedScreen/MessagesScreen/ProfileScreen'de (mobil) ve
// MessagesPage (web) üçer/dörder kez birebir kopyalanmış "Destek" modalının yerini alıyor —
// hepsi artık bunu import ediyor.
export default function SupportModal({ visible, onClose }) {
    const insets = useSafeAreaInsets();
    const [view, setView] = useState('list'); // 'list' | 'thread' | 'new'
    const [tickets, setTickets] = useState([]);
    const [loadingTickets, setLoadingTickets] = useState(false);

    const [activeTicket, setActiveTicket] = useState(null);
    const [messages, setMessages] = useState([]);
    const [loadingMessages, setLoadingMessages] = useState(false);
    const [messageText, setMessageText] = useState('');
    const [sending, setSending] = useState(false);

    const [newSubject, setNewSubject] = useState('');
    const [newMessage, setNewMessage] = useState('');
    const [creating, setCreating] = useState(false);

    const loadTickets = useCallback(() => {
        setLoadingTickets(true);
        api.get('/users/me/support-tickets')
            .then(({ data }) => setTickets(Array.isArray(data) ? data : []))
            .catch(() => setTickets([]))
            .finally(() => setLoadingTickets(false));
    }, []);

    useEffect(() => {
        if (!visible) return;
        setView('list');
        loadTickets();
    }, [visible, loadTickets]);

    const openTicket = (ticket) => {
        setActiveTicket(ticket);
        setView('thread');
        setLoadingMessages(true);
        api.get(`/users/me/support-tickets/${ticket.id}/messages`)
            .then(({ data }) => setMessages(Array.isArray(data.messages) ? data.messages : []))
            .catch(() => setMessages([]))
            .finally(() => setLoadingMessages(false));
    };

    const sendReply = async () => {
        const text = messageText.trim();
        if (!text || !activeTicket) return;
        setSending(true);
        try {
            const { data } = await api.post(`/users/me/support-tickets/${activeTicket.id}/messages`, { message: text });
            setMessages(prev => [...prev, data]);
            setMessageText('');
        } catch (e) {
            // sessizce yut — kullanıcı tekrar deneyebilir, mevcut destek akışıyla aynı davranış
        } finally {
            setSending(false);
        }
    };

    const createTicket = async () => {
        const subject = newSubject.trim();
        const text = newMessage.trim();
        if (!subject || !text) return;
        setCreating(true);
        try {
            const { data } = await api.post('/users/me/support-tickets', { subject, message: text });
            setNewSubject('');
            setNewMessage('');
            setTickets(prev => [{ id: data.id, subject: data.subject, status: data.status, updatedAt: data.updatedAt, lastMessage: data.messages?.[0] || null, hasNewReply: false }, ...prev]);
            openTicket(data);
        } catch (e) {
            // sessizce yut
        } finally {
            setCreating(false);
        }
    };

    const fmtAgo = (d) => {
        const diff = Date.now() - new Date(d).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return 'şimdi';
        if (m < 60) return `${m}dk`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}sa`;
        return `${Math.floor(h / 24)}g`;
    };

    const close = () => { onClose(); setView('list'); setActiveTicket(null); };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
            <View style={{ flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' }}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ maxHeight: '90%' }}>
                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 17, paddingBottom: Math.max(20, insets.bottom + 12), maxHeight: '100%' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                            {view === 'thread' ? (
                                <TouchableOpacity onPress={() => setView('list')} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize: 16 }}>‹</Text>
                                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900', flex: 1 }} numberOfLines={1}>{activeTicket?.subject}</Text>
                                </TouchableOpacity>
                            ) : (
                                <Text style={{ color: '#fff', fontSize: 16, fontWeight: '900' }}>💬 Admine Destek</Text>
                            )}
                            <TouchableOpacity onPress={close}><Text style={{ color: colors.textMuted, fontSize: 18, padding: 3 }}>✕</Text></TouchableOpacity>
                        </View>

                        {view === 'list' && (
                            <>
                                {/* Kullanıcı isteği: yeni bir sohbet başlatırken konu + mesaj birlikte
                                    girilsin, gönderince o konunun adıyla bir sohbet kutusu oluşsun. */}
                                <View style={{ backgroundColor: colors.surface2, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border, marginBottom: 12 }}>
                                    <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 6 }}>+ Yeni Konu</Text>
                                    <TextInput
                                        value={newSubject}
                                        onChangeText={setNewSubject}
                                        placeholder="Konu (örn. Ödeme sorunu)"
                                        placeholderTextColor={colors.textMuted}
                                        style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: colors.border, marginBottom: 6 }}
                                    />
                                    <TextInput
                                        value={newMessage}
                                        onChangeText={setNewMessage}
                                        placeholder="Mesajınızı yazın..."
                                        placeholderTextColor={colors.textMuted}
                                        multiline
                                        style={{ backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: colors.border, minHeight: 50, textAlignVertical: 'top', marginBottom: 6 }}
                                    />
                                    <TouchableOpacity
                                        onPress={createTicket}
                                        disabled={creating || !newSubject.trim() || !newMessage.trim()}
                                        style={{ backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 9, alignItems: 'center', opacity: (creating || !newSubject.trim() || !newMessage.trim()) ? 0.5 : 1 }}
                                    >
                                        {creating ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Gönder</Text>}
                                    </TouchableOpacity>
                                </View>

                                <ScrollView style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
                                    {loadingTickets ? (
                                        <ActivityIndicator color={colors.purple} style={{ marginVertical: 16 }} />
                                    ) : tickets.length === 0 ? (
                                        <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 8 }}>Henüz bir destek konunuz yok.</Text>
                                    ) : (
                                        tickets.map(t => (
                                            <TouchableOpacity key={t.id} onPress={() => openTicket(t)}
                                                style={{ backgroundColor: colors.surface2, borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: t.hasNewReply ? colors.purple : colors.border }}>
                                                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', flex: 1 }} numberOfLines={1}>💬 {t.subject}</Text>
                                                    {t.hasNewReply && <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: colors.purple, marginLeft: 6 }} />}
                                                </View>
                                                {t.lastMessage && (
                                                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }} numberOfLines={1}>
                                                        {t.lastMessage.isFromAdmin ? '👤 Admin: ' : ''}{t.lastMessage.message}
                                                    </Text>
                                                )}
                                                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4 }}>{fmtAgo(t.updatedAt)} önce{t.status === 'CLOSED' ? ' · Kapatıldı' : ''}</Text>
                                            </TouchableOpacity>
                                        ))
                                    )}
                                </ScrollView>
                            </>
                        )}

                        {view === 'thread' && (
                            <>
                                <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                                    {loadingMessages ? (
                                        <ActivityIndicator color={colors.purple} style={{ marginVertical: 16 }} />
                                    ) : (
                                        messages.map(m => (
                                            <View key={m.id} style={{
                                                alignSelf: m.isFromAdmin ? 'flex-start' : 'flex-end',
                                                backgroundColor: m.isFromAdmin ? colors.surface2 : colors.purple + '30',
                                                borderRadius: 12, padding: 9, marginBottom: 8, maxWidth: '85%',
                                                borderWidth: 1, borderColor: m.isFromAdmin ? colors.border : colors.purple + '50',
                                            }}>
                                                {m.isFromAdmin && <Text style={{ color: colors.purple, fontSize: 10, fontWeight: '800', marginBottom: 2 }}>Admin</Text>}
                                                <Text style={{ color: '#fff', fontSize: 13 }}>{m.message}</Text>
                                            </View>
                                        ))
                                    )}
                                </ScrollView>
                                {activeTicket?.status !== 'CLOSED' && (
                                    <View style={{ flexDirection: 'row', gap: 6, marginTop: 8 }}>
                                        <TextInput
                                            value={messageText}
                                            onChangeText={setMessageText}
                                            placeholder="Yanıt yaz..."
                                            placeholderTextColor={colors.textMuted}
                                            multiline
                                            style={{ flex: 1, backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: '#fff', fontSize: 13, paddingHorizontal: 10, paddingVertical: 8, maxHeight: 90 }}
                                        />
                                        <TouchableOpacity
                                            onPress={sendReply}
                                            disabled={sending || !messageText.trim()}
                                            style={{ backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 14, justifyContent: 'center', opacity: (sending || !messageText.trim()) ? 0.5 : 1 }}
                                        >
                                            {sending ? <ActivityIndicator size="small" color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>↑</Text>}
                                        </TouchableOpacity>
                                    </View>
                                )}
                            </>
                        )}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}
