import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
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

    // Yeni mesaj gelince konuşmaları güncelle
    useEffect(() => {
        const off = onSocket('newMessage', ({ message, conversationId }) => {
            setConversations(prev => {
                const exists = prev.find(c => c.id === conversationId);
                if (exists) {
                    return prev
                        .map(c => c.id === conversationId ? { ...c, lastMessage: message } : c)
                        .sort((a, b) => new Date(b.lastMessage?.createdAt || b.updatedAt) - new Date(a.lastMessage?.createdAt || a.updatedAt));
                }
                // Yeni konuşma — tam listeyi yenile
                load();
                return prev;
            });
        });
        return off;
    }, [load]);

    const renderItem = ({ item }) => {
        const other = item.other;
        const last = item.lastMessage;
        const unread = last && last.senderId !== myId && !last.read;
        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('Chat', { conversation: item, other })}
            >
                <View style={{ position: 'relative' }}>
                    <Avatar user={other} />
                    {unread && (
                        <View style={{ position: 'absolute', top: 0, right: 0, width: 10, height: 10, borderRadius: 5, backgroundColor: colors.purple, borderWidth: 2, borderColor: colors.bg }} />
                    )}
                </View>
                <View style={styles.rowContent}>
                    <View style={styles.rowTop}>
                        <Text style={[styles.name, unread && { color: '#fff', fontWeight: '900' }]} numberOfLines={1}>
                            {other?.fullName || other?.username}
                        </Text>
                        {last && (
                            <Text style={styles.time}>
                                {new Date(last.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        )}
                    </View>
                    <Text style={[styles.lastMsg, unread && { color: '#d1d5db', fontWeight: '600' }]} numberOfLines={1}>
                        {last ? (last.senderId === myId ? (t.youPrefix || 'Sen: ') : '') + last.content : t.noMsgYet}
                    </Text>
                </View>
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{t.messagesTitle}</Text>
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
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, paddingTop: 53 },
    header: { paddingHorizontal: 17, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: '#fff', fontSize: 22, fontWeight: '900' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + '50', gap: 3 },
    avatar: { backgroundColor: colors.purple, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#fff', fontWeight: '800' },
    rowContent: { flex: 1 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    name: { color: '#cbd5e1', fontWeight: '700', fontSize: 14, flex: 1 },
    time: { color: colors.textMuted, fontSize: 11, marginLeft: 8 },
    lastMsg: { color: colors.textMuted, fontSize: 12 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 57 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyText: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
    emptySubText: { color: colors.textMuted, fontSize: 13 },
});
