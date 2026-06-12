import { useEffect, useState, useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

const TYPE_ICON = {
    RIVAL_REQUEST: '⚔️',
    RIVAL_ACCEPTED: '✅',
    RIVAL_DECLINED: '❌',
    RIVAL_JOIN_REQUEST: '🙋',
    JOIN_ACCEPTED: '🎉',
    JOIN_DECLINED: '🚫',
    FRIEND_REQUEST: '👥',
    FRIEND_ACCEPTED: '🤝',
    MESSAGE: '💬',
    SCORE_SUBMITTED: '📊',
    SCORE_CONFIRMED: '🏆',
    SCORE_DISPUTED: '⚠️',
    MATCH_COMPLETED: '🏁',
    VENUE_SUBMISSION: '🏟️',
    default: '🔔',
};

export default function NotificationsScreen({ navigation }) {
    const t = useT();
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);

    const load = async () => {
        try {
            const { data } = await api.get('/notifications');
            setNotifications(data.notifications || []);
        } catch (e) { console.warn(e?.message); }
        finally { setLoading(false); setRefreshing(false); }
    };

    useEffect(() => { load(); }, []);

    useFocusEffect(useCallback(() => {
        api.patch('/notifications/read-all').catch(() => {});
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []));

    const onRefresh = () => { setRefreshing(true); load(); };

    const markRead = async (id) => {
        try {
            await api.patch(`/notifications/${id}/read`);
            setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        } catch (e) { console.warn(e?.message); }
    };

    const markAllRead = async () => {
        try {
            await api.patch('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
        } catch (e) { console.warn(e?.message); }
    };

    const handlePress = (item) => {
        markRead(item.id);
        const data = item.data || {};

        if (data.rivalId && data.category && data.subCategory) {
            // Rival-related → go to SubCategory screen
            navigation.navigate('HomeTab', {
                screen: 'SubCategory',
                params: { category: data.category, sub: data.subCategory },
            });
        } else if (data.rivalId) {
            // Fallback: old notification without routing data
            navigation.navigate('HomeTab', {
                screen: 'SubCategory',
                params: { category: 'SPORTS', sub: 'football' },
            });
        } else if (item.type === 'FRIEND_REQUEST' || item.type === 'FRIEND_ACCEPTED') {
            if (data.senderId) {
                navigation.navigate('HomeTab', {
                    screen: 'Profile',
                    params: { userId: data.senderId },
                });
            } else {
                navigation.navigate('ProfileTab');
            }
        } else if (item.type === 'MESSAGE') {
            if (data.senderId) {
                navigation.navigate('MessagesTab', {
                    screen: 'Chat',
                    params: {
                        other: { id: data.senderId, username: data.senderUsername },
                        conversation: { id: data.conversationId || null },
                    },
                });
            } else {
                navigation.navigate('MessagesTab');
            }
        } else if (item.type === 'SCORE_SUBMITTED' || item.type === 'SCORE_CONFIRMED' || item.type === 'MATCH_COMPLETED') {
            if (data.category && data.subCategory) {
                navigation.navigate('HomeTab', {
                    screen: 'SubCategory',
                    params: { category: data.category, sub: data.subCategory },
                });
            }
        }
    };

    const unreadCount = notifications.filter(n => !n.read).length;

    const renderItem = ({ item }) => {
        const icon = TYPE_ICON[item.type] || TYPE_ICON.default;
        return (
            <TouchableOpacity
                style={[styles.item, !item.read && styles.itemUnread]}
                onPress={() => handlePress(item)}
                activeOpacity={0.7}
            >
                <View style={styles.iconBox}>
                    <Text style={styles.icon}>{icon}</Text>
                </View>
                <View style={styles.itemContent}>
                    <Text style={styles.itemTitle}>{item.title}</Text>
                    <Text style={styles.itemBody} numberOfLines={2}>{item.body}</Text>
                    <Text style={styles.itemTime}>
                        {new Date(item.createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
                {!item.read && <View style={styles.dot} />}
            </TouchableOpacity>
        );
    };

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{t.notificationsTitle}</Text>
                {unreadCount > 0 && (
                    <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
                        <Text style={styles.markAllText}>{t.markAllReadBtn}</Text>
                    </TouchableOpacity>
                )}
            </View>

            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
                    contentContainerStyle={{ paddingBottom: 20 }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyEmoji}>🔕</Text>
                            <Text style={styles.emptyText}>{t.noNotificationsText}</Text>
                        </View>
                    }
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, paddingTop: 56 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: '#fff', fontSize: 22, fontWeight: '900' },
    markAllBtn: { backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 6, borderWidth: 1, borderColor: colors.border },
    markAllText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    item: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border + '40', gap: 12 },
    itemUnread: { backgroundColor: colors.purple + '10' },
    iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    icon: { fontSize: 18 },
    itemContent: { flex: 1 },
    itemTitle: { color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 3 },
    itemBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 4 },
    itemTime: { color: colors.textMuted, fontSize: 10 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.purple, marginTop: 6 },
    empty: { alignItems: 'center', paddingTop: 80 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
});
