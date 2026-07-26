import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, Modal, TextInput, KeyboardAvoidingView, Platform, ScrollView, Alert } from 'react-native';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { onSocket } from '../../services/socket';

function Avatar({ user, size = 40 }) {
    return (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={[styles.avatarText, { fontSize: size * 0.4 }]}>
                {user?.username?.[0]?.toUpperCase() || '?'}
            </Text>
        </View>
    );
}

export default function MessagesScreen({ navigation }) {
    const myId = useSelector(s => s.auth.user?.id);
    const t = useT();
    const [conversations, setConversations] = useState([]);
    const [loading, setLoading] = useState(true);

    // Destek mesajı
    const [supportOpen, setSupportOpen] = useState(false);
    const [supportMessages, setSupportMessages] = useState([]);
    const [supportLoading, setSupportLoading] = useState(false);
    const [supportText, setSupportText] = useState('');
    const [supportSending, setSupportSending] = useState(false);

    // Mesajları engellenenler — tam Block'tan farklı, sadece mesajlaşmayı durdurur
    const [msgBlockedOpen, setMsgBlockedOpen] = useState(false);
    const [msgBlockedList, setMsgBlockedList] = useState([]);
    const [msgBlockedLoading, setMsgBlockedLoading] = useState(false);

    const openMsgBlocked = () => {
        setMsgBlockedOpen(true);
        setMsgBlockedLoading(true);
        api.get('/friends/message-blocked')
            .then(r => setMsgBlockedList(Array.isArray(r.data) ? r.data : []))
            .catch(() => setMsgBlockedList([]))
            .finally(() => setMsgBlockedLoading(false));
    };

    const unblockMessages = (user) => {
        Alert.alert('Engeli Kaldır', `${user.fullName || user.username} adlı kullanıcının mesaj engeli kaldırılsın mı?`, [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Kaldır', onPress: async () => {
                try {
                    await api.delete(`/friends/message-block/${user.id}`);
                    setMsgBlockedList(prev => prev.filter(u => u.id !== user.id));
                } catch (e) { Alert.alert('', e?.response?.data?.message || 'İşlem başarısız oldu.'); }
            } },
        ]);
    };

    const loadSupportMessages = () => {
        setSupportLoading(true);
        api.get('/users/me/support-messages')
            .then(r => setSupportMessages(Array.isArray(r.data) ? r.data : []))
            .catch(() => setSupportMessages([]))
            .finally(() => setSupportLoading(false));
    };

    const openSupport = () => {
        setSupportOpen(true);
        loadSupportMessages();
    };

    const sendSupportMessage = async () => {
        if (!supportText.trim()) return;
        setSupportSending(true);
        try {
            await api.post('/users/me/support-messages', { message: supportText.trim() });
            setSupportText('');
            loadSupportMessages();
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Mesaj gönderilemedi');
        } finally {
            setSupportSending(false);
        }
    };

    const load = useCallback(() => {
        api.get('/messages/conversations')
            .then(r => setConversations(r.data))
            .catch(e => console.warn(e?.message))
            .finally(() => setLoading(false));
    }, []);

    // Her sefer odaklanınca yenile
    useFocusEffect(useCallback(() => {
        load();
    }, [load]));

    // Yeni mesaj gelince konuşmaları güncelle — okunmamış sayacı da (karşı taraftan
    // geldiyse) sohbete girene kadar burada artmaya devam etsin diye anlık artırılır.
    useEffect(() => {
        const off = onSocket('newMessage', ({ message, conversationId }) => {
            setConversations(prev => {
                const exists = prev.find(c => c.id === conversationId);
                if (exists) {
                    return prev
                        .map(c => c.id === conversationId
                            ? { ...c, lastMessage: message, unreadCount: message.senderId !== myId ? (c.unreadCount || 0) + 1 : c.unreadCount }
                            : c)
                        .sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt) - new Date(a.lastMessage?.createdAt || a.updatedAt));
                }
                // Yeni konuşma — tam listeyi yenile
                load();
                return prev;
            });
        });
        return off;
    }, [load, myId]);

    const lastMessagePreview = (last) => {
        if (!last) return t.noMsgYet;
        const prefix = last.senderId === myId ? (t.youPrefix || 'Sen: ') : '';
        const body = last.content || (last.imageUrl ? '📷 Fotoğraf' : last.audioUrl ? '🎤 Sesli mesaj' : '');
        return prefix + body;
    };

    // Sohbetin içine girmeden satırdaki "⋮" ile: sessize al (kullanıcının kendi
    // girdiği saat, boşsa süresiz — tek satır input, ekstra seçenek satırı yok),
    // sesi aç, okundu işaretle, engelle.
    const [actionMenu, setActionMenu] = useState(null);
    const [muteHours, setMuteHours] = useState('');
    const closeActionMenu = () => { setActionMenu(null); setMuteHours(''); };

    const muteFor = async () => {
        if (!actionMenu) return;
        const id = actionMenu.id;
        const hours = muteHours.trim() ? Number(muteHours.trim()) : null;
        try {
            const { data } = await api.post(`/messages/conversation/${id}/mute`, hours ? { hours } : {});
            setConversations(prev => prev.map(c => c.id === id ? { ...c, isMuted: true, mutedUntil: data.mutedUntil } : c));
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'İşlem başarısız oldu.');
        } finally {
            closeActionMenu();
        }
    };

    const unmute = async () => {
        if (!actionMenu) return;
        const id = actionMenu.id;
        try {
            await api.delete(`/messages/conversation/${id}/mute`);
            setConversations(prev => prev.map(c => c.id === id ? { ...c, isMuted: false, mutedUntil: null } : c));
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'İşlem başarısız oldu.');
        } finally {
            closeActionMenu();
        }
    };

    const markRead = async () => {
        if (!actionMenu) return;
        const id = actionMenu.id;
        try {
            await api.post(`/messages/conversation/${id}/mark-read`);
            setConversations(prev => prev.map(c => c.id === id ? { ...c, unreadCount: 0 } : c));
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'İşlem başarısız oldu.');
        } finally {
            closeActionMenu();
        }
    };

    const blockFromList = () => {
        if (!actionMenu) return;
        const other = actionMenu.other;
        closeActionMenu();
        Alert.alert(
            'Mesajları Engelle',
            `${other?.fullName || other?.username} adlı kullanıcının mesajlarını engellemek istediğinize emin misiniz? Arkadaşlığınız, takibiniz ve profilinizi görmesi etkilenmez — sadece mesajlaşamazsınız.`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'Engelle', style: 'destructive', onPress: async () => {
                        try {
                            await api.post(`/friends/message-block/${other.id}`);
                            Alert.alert('', 'Kullanıcının mesajları engellendi.');
                        } catch (e) {
                            Alert.alert('', e?.response?.data?.message || 'İşlem başarısız oldu.');
                        }
                    },
                },
            ],
        );
    };

    const renderItem = ({ item }) => {
        const other = item.other;
        const last = item.lastMessage;
        const unreadCount = item.unreadCount || 0;
        const unread = unreadCount > 0;
        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('Chat', { conversation: item, other })}
            >
                <Avatar user={other} />
                <View style={styles.rowContent}>
                    <View style={styles.rowTop}>
                        <Text style={[styles.name, unread && { color: '#fff', fontWeight: '900' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {item.isMuted ? '🔕 ' : ''}{other?.fullName || other?.username}
                        </Text>
                    </View>
                    <Text style={[styles.lastMsg, unread && { color: '#d1d5db', fontWeight: '600' }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                        {lastMessagePreview(last)}
                    </Text>
                </View>
                <View style={styles.rowRight}>
                    {last && (
                        <Text style={styles.time}>
                            {new Date(last.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                        </Text>
                    )}
                    {unread && (
                        <View style={styles.unreadBadge}>
                            <Text style={styles.unreadBadgeText}>{unreadCount > 99 ? '99+' : unreadCount}</Text>
                        </View>
                    )}
                </View>
                <TouchableOpacity
                    onPress={(e) => { e.stopPropagation?.(); setActionMenu(item); }}
                    style={styles.rowMenuBtn}
                    hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                    <Text style={styles.rowMenuText}>⋮</Text>
                </TouchableOpacity>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{t.messagesTitle}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <TouchableOpacity onPress={openMsgBlocked} style={styles.supportBtn}>
                        <Text style={styles.supportBtnText}>🚫 Engellenenler</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={openSupport} style={styles.supportBtn}>
                        <Text style={styles.supportBtnText}>🆘 Destek</Text>
                    </TouchableOpacity>
                </View>
            </View>
            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
            ) : conversations.length === 0 ? (
                <View style={styles.empty}>
                    <Text style={styles.emptyEmoji}>💬</Text>
                    <Text style={styles.emptyText}>{t.noConversationsText}</Text>
                    <Text style={styles.emptySubText}>{t.findPlayersText}</Text>
                </View>
            ) : (
                <FlatList
                    data={conversations}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    contentContainerStyle={{ paddingBottom: 17 }}
                />
            )}

            <Modal visible={supportOpen} animationType="slide" transparent onRequestClose={() => setSupportOpen(false)}>
                <View style={styles.modalOverlay}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ width: '100%' }}>
                        <View style={styles.modalBox}>
                            <View style={styles.modalHeader}>
                                <Text style={styles.modalTitle}>💬 Admine Destek Mesajı</Text>
                                <TouchableOpacity onPress={() => setSupportOpen(false)}>
                                    <Text style={styles.modalClose}>✕</Text>
                                </TouchableOpacity>
                            </View>

                            <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                                {supportLoading ? (
                                    <ActivityIndicator color={colors.purple} style={{ marginVertical: 16 }} />
                                ) : supportMessages.length === 0 ? (
                                    <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 3 }}>Henüz mesaj göndermediniz.</Text>
                                ) : (
                                    supportMessages.map(msg => (
                                        <View key={msg.id} style={{ backgroundColor: '#1e293b', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
                                            <Text style={{ color: '#fff', fontSize: 13 }}>{msg.message}</Text>
                                            {msg.status === 'PENDING' ? (
                                                <Text style={{ color: '#f59e0b', fontSize: 11, marginTop: 6 }}>⏳ Mesajınız iletildi, ekibimiz en kısa sürede yanıtlayacak.</Text>
                                            ) : (
                                                <View style={{ marginTop: 6, backgroundColor: '#10b98118', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#10b98150' }}>
                                                    <Text style={{ color: '#10b981', fontSize: 11, fontWeight: '700', marginBottom: 2 }}>✅ Yanıtlandı</Text>
                                                    <Text style={{ color: '#fff', fontSize: 12 }}>{msg.adminReply}</Text>
                                                </View>
                                            )}
                                        </View>
                                    ))
                                )}
                            </ScrollView>
                            <TextInput
                                style={styles.supportInput}
                                value={supportText}
                                onChangeText={setSupportText}
                                placeholder="Mesajınızı yazın..."
                                placeholderTextColor={colors.textMuted}
                                multiline
                            />
                            <TouchableOpacity
                                style={[styles.saveBtn, (!supportText.trim() || supportSending) && { opacity: 0.4 }]}
                                onPress={sendSupportMessage}
                                disabled={!supportText.trim() || supportSending}
                            >
                                {supportSending
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Text style={styles.saveBtnText}>Gönder</Text>}
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            <Modal visible={msgBlockedOpen} animationType="slide" transparent onRequestClose={() => setMsgBlockedOpen(false)}>
                <View style={styles.modalOverlay}>
                    <View style={styles.modalBox}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>🚫 Mesajları Engellenenler</Text>
                            <TouchableOpacity onPress={() => setMsgBlockedOpen(false)}>
                                <Text style={styles.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                            {msgBlockedLoading ? (
                                <ActivityIndicator color={colors.purple} style={{ marginVertical: 16 }} />
                            ) : msgBlockedList.length === 0 ? (
                                <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>Mesajlarını engellediğiniz kimse yok.</Text>
                            ) : (
                                msgBlockedList.map(u => (
                                    <View key={u.id} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{u.fullName || u.username}</Text>
                                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>{u.username}</Text>
                                        </View>
                                        <TouchableOpacity style={{ backgroundColor: '#dc262620', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5, borderWidth: 1, borderColor: '#dc262650' }} onPress={() => unblockMessages(u)}>
                                            <Text style={{ color: '#f87171', fontSize: 11, fontWeight: '700' }}>Engeli Kaldır</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Satır menüsü: sohbete girmeden sessize al / sesi aç / okundu işaretle / engelle */}
            <Modal visible={!!actionMenu} animationType="slide" transparent onRequestClose={closeActionMenu}>
                <TouchableOpacity style={styles.menuOverlay} activeOpacity={1} onPress={closeActionMenu}>
                    <View style={styles.menuBox}>
                        <Text style={styles.menuTitle}>{actionMenu?.other?.fullName || actionMenu?.other?.username}</Text>
                        {actionMenu?.isMuted ? (
                            <TouchableOpacity style={styles.menuRow} onPress={unmute}>
                                <Text style={styles.menuRowText}>🔊 Sesi Aç</Text>
                            </TouchableOpacity>
                        ) : (
                            <View style={[styles.menuRow, styles.muteInputRow]}>
                                <Text style={styles.menuRowText}>🔕</Text>
                                <TextInput
                                    style={styles.muteHoursInput}
                                    value={muteHours}
                                    onChangeText={setMuteHours}
                                    placeholder="Saat (boş = süresiz)"
                                    placeholderTextColor={colors.textMuted}
                                    keyboardType="numeric"
                                />
                                <TouchableOpacity style={styles.muteApplyBtn} onPress={muteFor}>
                                    <Text style={styles.muteApplyBtnText}>Sessize Al</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {(actionMenu?.unreadCount || 0) > 0 && (
                            <TouchableOpacity style={styles.menuRow} onPress={markRead}>
                                <Text style={styles.menuRowText}>✓ Okundu Olarak İşaretle</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity style={styles.menuRow} onPress={blockFromList}>
                            <Text style={[styles.menuRowText, { color: '#f87171' }]}>🔇 Mesajları Engelle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.menuRow, { borderBottomWidth: 0 }]} onPress={closeActionMenu}>
                            <Text style={[styles.menuRowText, { color: colors.textMuted }]}>Vazgeç</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, paddingTop: 53 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingHorizontal: 17, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: '#fff', fontSize: 22, fontWeight: '900' },
    supportBtn: { backgroundColor: colors.surface2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: colors.border },
    supportBtnText: { color: '#cbd5e1', fontSize: 12, fontWeight: '700' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + '50', gap: 3 },
    avatar: { backgroundColor: colors.purple, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#fff', fontWeight: '800' },
    rowContent: { flex: 1 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    name: { color: '#cbd5e1', fontWeight: '700', fontSize: 14, flex: 1 },
    lastMsg: { color: colors.textMuted, fontSize: 12 },
    rowRight: { alignItems: 'flex-end', gap: 5, marginLeft: 8 },
    time: { color: colors.textMuted, fontSize: 11 },
    unreadBadge: { backgroundColor: colors.purple, borderRadius: 10, minWidth: 20, height: 20, paddingHorizontal: 5, alignItems: 'center', justifyContent: 'center' },
    unreadBadgeText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    rowMenuBtn: { paddingHorizontal: 6, paddingVertical: 4, marginLeft: 4 },
    rowMenuText: { color: colors.textMuted, fontSize: 20, fontWeight: '900' },
    menuOverlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
    menuBox: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingTop: 16, paddingBottom: 30, paddingHorizontal: 17 },
    menuTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 },
    menuRow: { paddingVertical: 13, borderBottomWidth: 1, borderBottomColor: colors.border + '50' },
    menuRowText: { color: '#fff', fontSize: 15, fontWeight: '700' },
    muteInputRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    muteHoursInput: { flex: 1, backgroundColor: colors.surface2, borderRadius: 8, borderWidth: 1, borderColor: colors.border, color: '#fff', fontSize: 13, paddingHorizontal: 10, paddingVertical: 7 },
    muteApplyBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8 },
    muteApplyBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 57 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyText: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
    emptySubText: { color: colors.textMuted, fontSize: 13 },
    modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 17, height: '88%' },
    modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 13 },
    modalTitle: { color: '#fff', fontSize: 17, fontWeight: '800' },
    modalClose: { color: colors.textMuted, fontSize: 20, fontWeight: '700', paddingHorizontal: 3 },
    supportInput: { marginTop: 8, minHeight: 60, textAlignVertical: 'top', backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: '#fff', fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
    saveBtn: { marginTop: 8, backgroundColor: colors.purple, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    saveBtnText: { color: '#fff', fontSize: 14, fontWeight: '800' },
});
