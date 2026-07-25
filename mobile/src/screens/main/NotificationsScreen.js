import { useEffect, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import api from '../../services/api';
import { onSocket, getSocket } from '../../services/socket';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { decrementUnread, clearUnread } from '../../store/slices/notificationSlice';

const TYPE_ICON = {
    RIVAL_REQUEST: '⚔️',
    RIVAL_ACCEPTED: '✅',
    RIVAL_DECLINED: '❌',
    RIVAL_JOIN_REQUEST: '🙋',
    JOIN_LATE_ACCEPT: '⏰',
    MATCH_INVITE: '✉️',
    JOIN_ACCEPTED: '🎉',
    JOIN_DECLINED: '🚫',
    FRIEND_REQUEST: '👥',
    FRIEND_ACCEPTED: '🤝',
    FOLLOW_REQUEST: '🔔',
    FOLLOW_ACCEPTED: '✅',
    MESSAGE: '💬',
    SCORE_SUBMITTED: '📊',
    SCORE_CONFIRMED: '🏆',
    SCORE_DISPUTED: '⚠️',
    MATCH_COMPLETED: '🏁',
    VENUE_SUBMISSION: '🏟️',
    TOURNAMENT_PERMISSION_REQUEST:  '📋',
    TOURNAMENT_PERMISSION_APPROVED: '✅',
    TOURNAMENT_PERMISSION_REJECTED: '❌',
    TOURNAMENT_JOIN: '🏆',
    TOURNAMENT_CHAT_MESSAGE: '💬',
    TOURNAMENT_JOIN_ACCEPTED: '🎉',
    TOURNAMENT_STARTED: '🚀',
    TOURNAMENT_EXTRA_ROUND: '⚖️',
    TOURNAMENT_COMPLETED: '🏆',
    TOURNAMENT_MATCH_DEADLINE_WARNING: '⏳',
    TOURNAMENT_MATCH_AUTO_DRAW: '🤝',
    TOURNAMENT_CANCEL_REQUEST: '⚠️',
    CANCELLATION_REQUEST: '⚠️',
    TOURNAMENT_CANCEL_APPROVED: '✅',
    TOURNAMENT_CANCEL_REJECTED: '❌',
    TOURNAMENT_REMOVED: '🚫',
    RESERVATION: '📅',
    RESERVATION_UPDATE: '🔄',
    VENUE_ORDER: '🛒',
    PAYMENT_ALERT: '💳',
    PEER_REVIEW_PROMPT: '🏐',
    EQUIPMENT_OFFER: '💰',
    GAME_TABLE_INVITE: '🎲',
    default: '🔔',
};

export default function NotificationsScreen({ navigation }) {
    const t = useT();
    const dispatch = useDispatch();
    const isBusiness = useSelector(s => s.auth.user?.isBusiness);
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

    // Ekran odaklandığında listeyi tazele (tab'a her dönüşte güncel gelsin)
    useFocusEffect(useCallback(() => { load(); }, []));

    // Socket: yeni bildirim gelince listeye ekle
    useEffect(() => {
        const off = onSocket('notification', (notif) => {
            if (!notif) return;
            setNotifications(prev => {
                if (prev.some(n => n.id === notif.id)) return prev;
                return [{ ...notif, read: false, createdAt: notif.createdAt || new Date().toISOString() }, ...prev];
            });
        });
        return off;
    }, []);

    const onRefresh = () => { setRefreshing(true); load(); };

    const markRead = async (id) => {
        const wasUnread = notifications.find(n => n.id === id)?.read === false;
        // Önce yerel state'i güncelle — kullanıcı bildirime dokunduktan hemen sonra
        // uygulamayı arka plana atıp kapatırsa PATCH isteği yarıda kesilebiliyordu,
        // sunucu hiç haberdar olmuyordu ve bildirim bir sonraki açılışta yine
        // okunmamış görünüyordu. İstek başarısız olsa bile en az bu oturumda doğru görünür.
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
        if (wasUnread) dispatch(decrementUnread());
        // Ağ isteği anlık kesintiye (arka plana alma vb.) karşı bir kez tekrar denenir.
        for (let attempt = 0; attempt < 2; attempt++) {
            try {
                await api.patch(`/notifications/${id}/read`);
                return;
            } catch (e) {
                if (attempt === 1) console.warn(e?.message);
            }
        }
    };

    const markAllRead = async () => {
        try {
            await api.patch('/notifications/read-all');
            setNotifications(prev => prev.map(n => ({ ...n, read: true })));
            dispatch(clearUnread());
        } catch (e) { console.warn(e?.message); }
    };

    const handlePress = async (item) => {
        markRead(item.id);
        const data = item.data || {};
        const type = item.type;
        const goToSub = (tab = 'rivals', tournSubTab = null, openChatTournamentId = null) => {
            if (!data.category || !data.subCategory) return;
            // Hakem ilanına (bağımsız veya bir maça bağlı "Hakem Arıyorum" ilanı) işaret eden
            // bildirimler İlanlar sekmesinde değil, Antrenörler → Hakemler alt-sekmesinde yaşar.
            if (data.refereeAd) {
                navigation.push('SubCategory', { category: data.category, sub: data.subCategory, initialTab: 'coaches', initialCoachSubTab: 'referees', highlightRivalId: data.rivalId || null });
                return;
            }
            navigation.push('SubCategory', { category: data.category, sub: data.subCategory, initialTab: tab, highlightRivalId: data.rivalId || null, initialTournSubTab: tournSubTab, openChatTournamentId });
        };
        const goToEquipmentListing = () => {
            if (!data.category || !data.subCategory || !data.listingId) return;
            navigation.push('SubCategory', { category: data.category, sub: data.subCategory, initialTab: 'equipment', openEquipmentId: data.listingId });
        };
        const goToCoachListing = () => {
            if (!data.category || !data.subCategory || !data.coachListingId) return;
            navigation.push('SubCategory', { category: data.category, sub: data.subCategory, initialTab: 'coaches', openCoachId: data.coachListingId });
        };

        if (type === 'GAME_TABLE_INVITE') {
            const game = data.game === 'batak' ? 'batak' : 'okey';
            const code = data.code;
            const socket = getSocket();
            if (!code || !socket) return;
            const offMatched = onSocket(`${game}:matched`, (matchData) => {
                offMatched(); offErr();
                navigation.navigate('HomeTab', { screen: game === 'batak' ? 'BatakTable' : 'OkeyTable', params: { tableId: matchData.tableId } });
            });
            const offErr = onSocket(`${game}:error`, (errData) => {
                offMatched(); offErr();
                Alert.alert('', errData?.message || 'Masaya katılınamadı.');
            });
            socket.emit(`${game}:joinByCode`, { code });
        } else if (type === 'EQUIPMENT_OFFER') {
            goToEquipmentListing();
        } else if (type === 'MESSAGE' && data.coachListingId) {
            goToCoachListing();
        } else if (type === 'MESSAGE' && data.listingId) {
            goToEquipmentListing();
        } else if (type === 'MESSAGE') {
            if (data.senderId) {
                navigation.push('Chat', {
                    other: { id: data.senderId, username: data.senderUsername },
                    conversation: { id: data.conversationId || null },
                });
            } else {
                navigation.navigate('MessagesTab');
            }
        } else if (type === 'FRIEND_REQUEST' || type === 'FRIEND_ACCEPTED' || type === 'FOLLOW_REQUEST' || type === 'FOLLOW_ACCEPTED') {
            if (data.senderId) {
                navigation.push('Profile', { userId: data.senderId });
            } else {
                navigation.navigate('ProfileTab');
            }
        } else if (type === 'SCORE_SUBMITTED') {
            if (data.tournamentId) {
                navigation.push('SubCategory', {
                    category: data.category, sub: data.subCategory, initialTab: 'tournaments',
                    openMatchId: data.matchId || null, openMatchTournamentId: data.tournamentId,
                });
            } else {
                goToSub('rivals');
            }
        } else if (type === 'MATCH_CONFIRMED') {
            goToSub('rivals');
        } else if (type === 'JOIN_LATE_ACCEPT') {
            goToSub('rivals');
        } else if (type === 'SCORE_CONFIRMED' || type === 'MATCH_COMPLETED') {
            goToSub('archive');
        } else if (type === 'PEER_REVIEW_PROMPT') {
            if (!data.category || !data.subCategory) return;
            navigation.push('SubCategory', {
                category: data.category, sub: data.subCategory, initialTab: 'archive',
                highlightRivalId: data.rivalId || null, openPeerReviewRivalId: data.rivalId || null,
            });
        } else if (type === 'SCORE_DISPUTED') {
            goToSub('rivals');
        } else if (type === 'MATCH_COMMENT') {
            goToSub('rivals');
        } else if (type === 'TOURNAMENT_PERMISSION_REQUEST') {
            navigation.push('Profile', { openTournamentPermissions: true });
        } else if (type === 'NEW_LISTING') {
            goToSub(data.tab || 'rivals');
        } else if (type === 'EQUIPMENT_OFFER') {
            goToSub('equipment');
        } else if (type === 'TOURNAMENT_STARTED' || type === 'TOURNAMENT_EXTRA_ROUND') {
            goToSub('tournaments', 'inprogress');
        } else if (type === 'TOURNAMENT_COMPLETED') {
            goToSub('tournaments', 'completed');
        } else if (type === 'TOURNAMENT_CHAT_MESSAGE') {
            goToSub('tournaments', null, data.tournamentId || null);
        } else if (type === 'TOURNAMENT_MATCH_DEADLINE_WARNING' || type === 'TOURNAMENT_MATCH_AUTO_DRAW') {
            if (data.tournamentId) {
                navigation.push('SubCategory', {
                    category: data.category, sub: data.subCategory, initialTab: 'tournaments',
                    openMatchId: data.matchId || null, openMatchTournamentId: data.tournamentId,
                });
            } else {
                goToSub('tournaments');
            }
        } else if (type?.startsWith('TOURNAMENT') || type === 'CANCELLATION_REQUEST') {
            goToSub('tournaments');
        } else if (type === 'RESERVATION' || type === 'RESERVATION_UPDATE' || type === 'VENUE_ORDER' || type === 'PAYMENT_ALERT') {
            if (isBusiness) {
                navigation.navigate('BusinessApp', { openReservations: true });
            } else {
                navigation.navigate('HomeTab', { screen: 'MyReservations' });
            }
        } else if (type === 'VENUE_REQUEST') {
            navigation.navigate('ProfileTab', { screen: 'AdminPortal', params: { tab: 'venues' } });
        } else if (type === 'SUBSCRIPTION_REQUEST' || type === 'SUBSCRIPTION_RECEIPT') {
            navigation.navigate('ProfileTab', { screen: 'AdminPortal', params: { tab: 'subscriptions' } });
        } else if (type === 'VENUE_REVIEW_PENDING') {
            navigation.navigate('ProfileTab', { screen: 'AdminPortal', params: { tab: 'venuereviews' } });
        } else if (type === 'VENUE_REVIEW') {
            navigation.navigate('BusinessApp', { openReservations: false });
        } else if (type === 'VENUE_REVIEW_APPROVED' || type === 'VENUE_REVIEW_REJECTED') {
            if (data.venueId) {
                try {
                    const { data: venue } = await api.get(`/venues/${data.venueId}`);
                    navigation.navigate('ProfileTab', { screen: 'VenueDetail', params: { venue } });
                } catch (e) { console.warn(e?.message); }
            }
        } else if (data.category && data.subCategory) {
            goToSub('rivals');
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
                <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
                    <Text style={styles.markAllText}>{t.markAllReadBtn}</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    data={notifications}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
                    contentContainerStyle={{ paddingBottom: 17 }}
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
    container: { flex: 1, backgroundColor: colors.bg, paddingTop: 53 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: '#fff', fontSize: 22, fontWeight: '900' },
    markAllBtn: { backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
    markAllText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    item: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 17, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + '40', gap: 3 },
    itemUnread: { backgroundColor: colors.purple + '10' },
    iconBox: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, justifyContent: 'center', alignItems: 'center', flexShrink: 0 },
    icon: { fontSize: 18 },
    itemContent: { flex: 1 },
    itemTitle: { color: '#fff', fontWeight: '700', fontSize: 13, marginBottom: 3 },
    itemBody: { color: colors.textSecondary, fontSize: 12, lineHeight: 17, marginBottom: 4 },
    itemTime: { color: colors.textMuted, fontSize: 10 },
    dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.purple, marginTop: 6 },
    empty: { alignItems: 'center', paddingTop: 77 },
    emptyEmoji: { fontSize: 52, marginBottom: 12 },
    emptyText: { color: colors.textMuted, fontSize: 15, fontWeight: '600' },
});
