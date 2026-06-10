import { useEffect, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

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

    useEffect(() => {
        api.get('/messages/conversations')
            .then(r => setConversations(r.data))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, []);

    const renderItem = ({ item }) => {
        const other = item.other;
        const last = item.lastMessage;
        return (
            <TouchableOpacity
                style={styles.row}
                onPress={() => navigation.navigate('Chat', { conversation: item, other })}
            >
                <Avatar user={other} />
                <View style={styles.rowContent}>
                    <View style={styles.rowTop}>
                        <Text style={styles.name} numberOfLines={1}>{other?.fullName || other?.username}</Text>
                        {last && (
                            <Text style={styles.time}>
                                {new Date(last.createdAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
                            </Text>
                        )}
                    </View>
                    <Text style={styles.lastMsg} numberOfLines={1}>
                        {last ? (last.senderId === myId ? t.youPrefix : '') + last.content : t.noMsgYet}
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
                    contentContainerStyle={{ paddingBottom: 20 }}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, paddingTop: 56 },
    header: { paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: '#fff', fontSize: 22, fontWeight: '900' },
    row: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border + '50', gap: 12 },
    avatar: { backgroundColor: colors.purple, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#fff', fontWeight: '800' },
    rowContent: { flex: 1 },
    rowTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 3 },
    name: { color: '#fff', fontWeight: '700', fontSize: 14, flex: 1 },
    time: { color: colors.textMuted, fontSize: 11, marginLeft: 8 },
    lastMsg: { color: colors.textMuted, fontSize: 12 },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingBottom: 60 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyText: { color: '#fff', fontSize: 16, fontWeight: '700', marginBottom: 6 },
    emptySubText: { color: colors.textMuted, fontSize: 13 },
});
