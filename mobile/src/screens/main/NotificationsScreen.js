import { useEffect, useState, useRef, useMemo } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import { useCallback } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, RefreshControl, Alert, Animated } from 'react-native';
import { useSelector, useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
import { onSocket, getSocket } from '../../services/socket';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { decrementUnread, clearUnread } from '../../store/slices/notificationSlice';
import { setUser } from '../../store/slices/authSlice';
import { getSubCategoryLabel } from '../../utils/subCategoryLabels';
import NotificationModePickerModal from '../../components/NotificationModePickerModal';
import { sharePost } from '../../utils/share';

// "Okundu" işareti PATCH isteği, kullanıcı bildirime dokunduktan hemen sonra
// uygulamayı kapatırsa yarıda kesilip sunucuya hiç ulaşmayabiliyordu — bu durumda
// bildirim saatler/günler sonra tekrar "okunmamış" görünüyordu, çünkü kaybolan
// isteği tekrar deneyecek hiçbir mekanizma yoktu. Artık "okundu" niyeti önce
// cihaza kalıcı olarak yazılıyor (AsyncStorage), her ekran yüklemesinde bekleyen
// istekler tekrar denenip başarılı olunca kuyruktan siliniyor — uygulama kapansa/
// internet gitse bile bir sonraki açılışta otomatik tamamlanır.
const PENDING_READS_KEY = 'pending_notification_reads';
const loadPendingReads = async () => {
    try { return JSON.parse(await AsyncStorage.getItem(PENDING_READS_KEY)) || []; }
    catch { return []; }
};
const savePendingReads = async (ids) => {
    try { await AsyncStorage.setItem(PENDING_READS_KEY, JSON.stringify(ids)); } catch {}
};

const TYPE_ICON = {
    RIVAL_REQUEST: '⚔️',
    RIVAL_ACCEPTED: '✅',
    RIVAL_DECLINED: '❌',
    RIVAL_JOIN_REQUEST: '🙋',
    RIVAL_REOPENED: '↩️',
    RIVAL_EDITED_RECONFIRM: '✏️',
    ROSTER_CHANGED: '🔄',
    ABANDON_VOTE_NEEDED: '🗳️',
    ABANDON_RESOLVED: '✅',
    REFEREE_NOT_FOUND: '🧑‍⚖️',
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
    SCORE_ENTRY_REQUIRED: '📝',
    MATCH_MEDIA_PENDING: '📸',
    MATCH_MEDIA_APPROVED: '✅',
    MATCH_MEDIA_REJECTED: '😕',
    POSITION_SUGGESTED: '🏐',
    POSITION_SUGGESTION_APPROVED: '✅',
    POSITION_SUGGESTION_REJECTED: '😕',
    MATCH_ROSTER_FULL_WAITLISTED: '🪑',
    MATCH_COMPLETED: '🏁',
    VENUE_SUBMISSION: '🏟️',
    TOURNAMENT_PERMISSION_REQUEST:  '📋',
    TOURNAMENT_PERMISSION_APPROVED: '✅',
    TOURNAMENT_PERMISSION_REJECTED: '❌',
    TOURNAMENT_JOIN: '🏆',
    TOURNAMENT_CHAT_MESSAGE: '💬',
    TOURNAMENT_CHAT_MENTION: '📣',
    MATCH_COMMENT: '💬',
    MATCH_COMMENT_MENTION: '📣',
    MATCH_COMMENT_REPLY: '💬',
    POST_MENTION: '📣',
    REEL_MENTION: '📣',
    STORY_MENTION: '📣',
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
    EQUIPMENT_SOLD_CONFIRM: '🎾',
    GAME_TABLE_INVITE: '🎲',
    default: '🔔',
};

// Kullanıcı isteği: skor girilmeyen maç yüzünden zil yanıp sönüyorsa Bildirimler
// açılınca o SCORE_ENTRY_REQUIRED satırı da aynı ritimde yansın. Satır ekranın
// altındaysa (veya kullanıcı geçip gittiyse) kaydırma oku, satır görünene kadar
// yönlendirsin — oka dokununca da o satıra zıplasın.
const SCORE_HINT_TYPE = 'SCORE_ENTRY_REQUIRED';
const ROW_HEIGHT_EST = 88;

function NotificationRow({ item, blinking, onPress, lang }) {
    const blinkOpacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        if (!blinking) { blinkOpacity.setValue(1); return; }
        const loop = Animated.loop(Animated.sequence([
            Animated.timing(blinkOpacity, { toValue: 0.22, duration: 500, useNativeDriver: true }),
            Animated.timing(blinkOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]));
        loop.start();
        return () => loop.stop();
    }, [blinking, blinkOpacity]);

    const icon = TYPE_ICON[item.type] || TYPE_ICON.default;
    const subLabel = getSubCategoryLabel(item.data?.subCategory, lang);
    return (
        <TouchableOpacity onPress={onPress} activeOpacity={0.7}>
            <Animated.View style={[styles.item, !item.read && styles.itemUnread, blinking && styles.itemScoreHint, { opacity: blinkOpacity }]}>
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
                {!!subLabel && (
                    <View style={styles.subBadge}>
                        <Text style={styles.subBadgeText} numberOfLines={1}>{subLabel}</Text>
                    </View>
                )}
            </Animated.View>
        </TouchableOpacity>
    );
}

function ScoreScrollHint({ dir, onPress, label }) {
    const bounce = useRef(new Animated.Value(0)).current;
    const blinkOpacity = useRef(new Animated.Value(1)).current;
    useEffect(() => {
        const bounceLoop = Animated.loop(Animated.sequence([
            Animated.timing(bounce, { toValue: dir === 'up' ? -10 : 10, duration: 450, useNativeDriver: true }),
            Animated.timing(bounce, { toValue: 0, duration: 450, useNativeDriver: true }),
        ]));
        const blinkLoop = Animated.loop(Animated.sequence([
            Animated.timing(blinkOpacity, { toValue: 0.28, duration: 500, useNativeDriver: true }),
            Animated.timing(blinkOpacity, { toValue: 1, duration: 500, useNativeDriver: true }),
        ]));
        bounceLoop.start();
        blinkLoop.start();
        return () => { bounceLoop.stop(); blinkLoop.stop(); };
    }, [dir, bounce, blinkOpacity]);

    return (
        <TouchableOpacity
            style={[styles.scoreHintWrap, dir === 'up' ? styles.scoreHintTop : styles.scoreHintBottom]}
            onPress={onPress}
            activeOpacity={0.85}
            accessibilityRole="button"
            accessibilityLabel={label}
        >
            <Animated.View style={[styles.scoreHintBtn, { opacity: blinkOpacity, transform: [{ translateY: bounce }] }]}>
                <Text style={styles.scoreHintArrow}>{dir === 'up' ? '▲' : '▼'}</Text>
                <Text style={styles.scoreHintLabel} numberOfLines={1}>{label}</Text>
            </Animated.View>
        </TouchableOpacity>
    );
}

export default function NotificationsScreen({ navigation }) {
    const t = useT();
    const dispatch = useDispatch();
    const user = useSelector(s => s.auth.user);
    const isBusiness = user?.isBusiness;
    const notificationMode = user?.notificationMode || 'SOUND';
    const lang = useSelector(s => s.lang?.lang || 'tr');
    const [notifications, setNotifications] = useState([]);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [modePickerVisible, setModePickerVisible] = useState(false);
    const [hasPendingScore, setHasPendingScore] = useState(false);
    const [hintDir, setHintDir] = useState(null);
    const listRef = useRef(null);
    const targetIndexRef = useRef(-1);
    const targetIdRef = useRef(null);
    const viewableRef = useRef({ ids: new Set(), minIdx: Infinity, maxIdx: -1 });

    const applyHintFromViewable = useCallback(() => {
        const idx = targetIndexRef.current;
        if (idx < 0) { setHintDir(null); return; }
        const { ids, minIdx, maxIdx } = viewableRef.current;
        const targetId = targetIdRef.current;
        if (targetId && ids.has(targetId)) { setHintDir(null); return; }
        if (maxIdx < 0) { setHintDir(null); return; }
        if (idx > maxIdx) setHintDir('down');
        else if (idx < minIdx) setHintDir('up');
        else setHintDir(null);
    }, []);

    const onViewableItemsChanged = useRef(({ viewableItems }) => {
        const ids = new Set(viewableItems.map(v => v.item?.id).filter(Boolean));
        const minIdx = viewableItems.reduce((m, v) => (v.index == null ? m : Math.min(m, v.index)), Infinity);
        const maxIdx = viewableItems.reduce((m, v) => (v.index == null ? m : Math.max(m, v.index)), -1);
        viewableRef.current = { ids, minIdx, maxIdx };
        applyHintFromViewable();
    }).current;
    const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 55 }).current;

    const changeNotificationMode = async (mode) => {
        const prevMode = notificationMode;
        dispatch(setUser({ ...user, notificationMode: mode })); // önce anında yansıt, sonra sunucuya gönder
        try {
            await api.patch('/auth/notification-mode', { mode });
        } catch (e) {
            dispatch(setUser({ ...user, notificationMode: prevMode }));
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.notificationModeSaveError);
        }
    };

    // Daha önce tamamlanamamış "okundu" isteklerini tekrar dener — bu, ekran her
    // yüklendiğinde (mount, focus, pull-to-refresh) çalışır ki hiçbir bekleyen
    // istek sonsuza kadar unutulmasın.
    const flushPendingReads = async () => {
        const pending = await loadPendingReads();
        if (pending.length === 0) return;
        const stillPending = [];
        for (const id of pending) {
            try { await api.patch(`/notifications/${id}/read`); }
            catch { stillPending.push(id); }
        }
        await savePendingReads(stillPending);
    };

    const load = async () => {
        try {
            await flushPendingReads();
            const [{ data }, scoreRes] = await Promise.all([
                api.get('/notifications'),
                api.get('/rivals/my-pending-score-count').catch(() => ({ data: { pendingScoreCount: 0 } })),
            ]);
            setNotifications(data.notifications || []);
            setHasPendingScore((scoreRes.data?.pendingScoreCount || 0) > 0);
        } catch (e) { console.warn(e?.message); }
        finally { setLoading(false); setRefreshing(false); }
    };

    useEffect(() => { load(); }, []);

    // Ekran odaklandığında listeyi tazele (tab'a her dönüşte güncel gelsin)
    useFocusEffect(useCallback(() => { load(); }, []));

    // Socket: yeni bildirim gelince listeye ekle — bazı sunucu tarafı kodları
    // createNotification'dan sonra ayrıca boş bir {} 'notification' event'i daha
    // yayınlıyor (id'siz); id'si olmayan bir event'i hayalet kayıt olarak listeye
    // eklememek için id kontrolü şart.
    useEffect(() => {
        const off = onSocket('notification', (notif) => {
            if (!notif?.id) return;
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
        // "Okundu" niyeti önce kalıcı kuyruğa yazılır — istek şimdi başarısız olsa
        // (ya da uygulama bu sırada tamamen kapansa) bile bir sonraki load() çağrısı
        // (ekran açılışı/odağı) bunu otomatik tekrar deneyip tamamlayacak.
        const pending = await loadPendingReads();
        if (!pending.includes(id)) await savePendingReads([...pending, id]);
        try {
            await api.patch(`/notifications/${id}/read`);
            const after = await loadPendingReads();
            await savePendingReads(after.filter(pid => pid !== id));
        } catch (e) {
            console.warn(e?.message);
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
        const goToSub = (tab = 'rivals', tournSubTab = null, openChatTournamentId = null, archiveTournamentId = null) => {
            if (!data.category || !data.subCategory) return;
            // Eski bir sunucu hatası yüzünden bazı geçmiş bildirimlerde category küçük harfle
            // kaydedilmiş olabilir (ör. "sports") — kategori her yerde büyük harfle
            // ("SPORTS") saklanıp karşılaştırıldığı için normalize edilmezse ekran hiçbir
            // maç bulamıyordu.
            const cat = String(data.category).toUpperCase();
            // Hakem ilanına (bağımsız veya bir maça bağlı "Hakem Arıyorum" ilanı) işaret eden
            // bildirimler İlanlar sekmesinde değil, Antrenörler → Hakemler alt-sekmesinde yaşar.
            if (data.refereeAd) {
                navigation.push('SubCategory', { category: cat, sub: data.subCategory, initialTab: 'coaches', initialCoachSubTab: 'referees', highlightRivalId: data.rivalId || null });
                return;
            }
            navigation.push('SubCategory', {
                category: cat, sub: data.subCategory, initialTab: tab, highlightRivalId: data.rivalId || null, initialTournSubTab: tournSubTab, openChatTournamentId,
                // Kadro kartındaki bir slota doğrudan davet edildiyse (bkz. inviteToRival),
                // ilan detayı açılınca kartın arka yüzü o slotu vurgulayarak açılsın diye.
                ...(data.inviteSide && { inviteSide: data.inviteSide, inviteSlotIndex: data.inviteSlotIndex ?? null }),
                // DOUBLE (2v2 tenis/padel) forma daveti — partner/opp1/opp2 (bkz. createRivalRequest/
                // inviteToRival'daki inviteDoubleSlot), kadro kartında hangi formanın kırmızı yanıp
                // söneceğini belirler (bkz. RivalDetailModal highlightSlot.doubleSlot).
                ...(data.inviteDoubleSlot && { inviteDoubleSlot: data.inviteDoubleSlot }),
                // Tamamlanmış turnuvalar Turnuvalar sekmesinde (Açık İlanlar/Devam Eden) hiç
                // gösterilmiyor, sadece Arşiv > Turnuvalar alt-sekmesinde yaşıyor (bkz.
                // kullanıcı raporu: "Turnuva Tamamlandı" bildirimi yanlışlıkla Açık İlanlar'a
                // götürüyordu — çünkü initialTournSubTab='completed' hiç desteklenmiyordu).
                ...(archiveTournamentId && { initialArchiveSubTab: 'tournaments', openArchiveTournamentId: archiveTournamentId }),
            });
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
        } else if (type === 'EQUIPMENT_OFFER' || type === 'EQUIPMENT_SOLD_CONFIRM') {
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
        } else if (type === 'ASSESSMENT_RECHECK') {
            // Kullanıcı isteği: bu bildirim hangi anketin (tekli/çiftler) yeniden doldurulması
            // gerektiğini belirtiyor (bkz. backend ASSESSMENT_RECHECK, data.ratingType) —
            // sadece Rakip Bul'a değil, doğrudan o ankete yönlendirsin.
            if (!data.category || !data.subCategory) return;
            navigation.push('SubCategory', { category: String(data.category).toUpperCase(), sub: data.subCategory, initialTab: 'rivals', openReassessment: data.ratingType || 'singles' });
        } else if (type === 'MATCH_MEDIA_PENDING' || type === 'MATCH_MEDIA_APPROVED' || type === 'MATCH_MEDIA_REJECTED') {
            goToSub('rivals');
        } else if (type === 'POSITION_SUGGESTED' || type === 'POSITION_SUGGESTION_APPROVED' || type === 'POSITION_SUGGESTION_REJECTED') {
            goToSub('rivals');
        } else if (type === 'MATCH_COMMENT' || type === 'MATCH_COMMENT_MENTION' || type === 'MATCH_COMMENT_REPLY') {
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
            goToSub('archive', null, null, data.tournamentId || null);
        } else if (type === 'TOURNAMENT_CHAT_MESSAGE' || type === 'TOURNAMENT_CHAT_MENTION') {
            goToSub('tournaments', null, data.tournamentId || null);
        } else if (type === 'POST_MENTION' || type === 'REEL_MENTION' || type === 'STORY_MENTION') {
            // Etiketlenen kişi Instagram gibi hem görüntüleyip hem paylaşabilsin.
            (async () => {
                let post = {
                    id: data.postId,
                    type: data.postType || (type === 'REEL_MENTION' ? 'REEL' : type === 'STORY_MENTION' ? 'STORY' : 'POST'),
                    content: item.body,
                    user: { username: data.authorUsername, id: data.authorId },
                };
                try {
                    if (data.postId) {
                        const { data: p } = await api.get(`/posts/${data.postId}`);
                        post = p;
                    }
                } catch { /* paylaşım yine de denenebilir */ }
                Alert.alert(
                    t.mentionTaggedTitle || 'Etiketlendin',
                    t.mentionTaggedBody || 'Bu paylaşımı görüntüleyebilir veya paylaşabilirsin.',
                    [
                        { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
                        { text: t.shareBtn || 'Paylaş', onPress: () => sharePost(post, t) },
                        {
                            text: t.viewBtn || 'Görüntüle',
                            onPress: () => {
                                if (data.authorId) {
                                    navigation.push('UserPosts', { userId: data.authorId });
                                } else if (data.category && data.subCategory) {
                                    goToSub(data.postType === 'STORY' || type === 'STORY_MENTION' ? 'media' : 'posts');
                                }
                            },
                        },
                    ],
                );
            })();
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
        } else if (type === 'VENUE_ORDER') {
            // navigateFromNotif (navigation/index.js) ile aynı mantık — sipariş bildirimine
            // dokununca rezervasyon takvimi değil, doğrudan o maçın Siparişler sekmesi açılır.
            if (isBusiness) {
                navigation.navigate('BusinessApp', { openOrders: true, venueId: data.venueId || null, highlightActivityId: data.rivalId || null });
            } else {
                navigation.navigate('HomeTab', { screen: 'MyReservations' });
            }
        } else if (type === 'ORDER_STATUS') {
            // Kullanıcı isteği: "Sipariş Güncellendi/Onaylandı/Hazır" bildirimine dokununca
            // doğrudan o maçın detayına, kadro kartında kendi "Adisyonu Var" ikonu otomatik
            // açılmış halde gidilsin (bkz. navigateFromNotif'teki aynı mantık, RivalCard/
            // UpcomingCard'daki autoOpenOrder).
            if (data.category && data.subCategory) {
                navigation.push('SubCategory', { category: String(data.category).toUpperCase(), sub: data.subCategory, initialTab: 'rivals', highlightRivalId: data.rivalId || null, autoOpenOrder: true });
            }
        } else if (type === 'RESERVATION' || type === 'RESERVATION_UPDATE' || type === 'PAYMENT_ALERT') {
            if (isBusiness) {
                // navigateFromNotif (navigation/index.js) ile aynı mantık — venueId varsa
                // sadece o tesisin takvimi açılır, yoksa (eski bildirimler) tüm kartlar
                // açılmayı dener. Bu ekran bildirim listesinden dokununca kullanılan AYRI
                // bir yol olduğu için venueId eskiden buraya hiç aktarılmıyordu — birden
                // fazla dalda tesisi olan işletmeler her zaman ilk tesisin takvimine
                // düşüyordu (kullanıcı raporu: "padel iptal talebi tenis kortlarını açtı").
                // reservationId varsa (ör. iptal talebi) takvimde o saat kutucuğu yanıp
                // söner ve dokununca doğrudan Onayla/Reddet sorulur (kullanıcı isteği).
                navigation.navigate('BusinessApp', { openReservations: true, venueId: data.venueId || null, highlightReservationId: data.reservationId || null, highlightDate: data.date || null });
            } else {
                navigation.navigate('HomeTab', { screen: 'MyReservations' });
            }
        } else if (type === 'VENUE_REQUEST' || type === 'VENUE_EDIT_REQUEST') {
            navigation.navigate('ProfileTab', { screen: 'AdminPortal', params: { tab: 'venues' } });
        } else if (type === 'COURT_EDIT_REQUEST') {
            navigation.navigate('ProfileTab', { screen: 'AdminPortal', params: { tab: 'courts' } });
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

    const scoreTargetIndex = useMemo(() => {
        if (!hasPendingScore) return -1;
        return notifications.findIndex(n => n.type === SCORE_HINT_TYPE);
    }, [notifications, hasPendingScore]);

    useEffect(() => {
        targetIndexRef.current = scoreTargetIndex;
        targetIdRef.current = scoreTargetIndex >= 0 ? notifications[scoreTargetIndex]?.id : null;
        applyHintFromViewable();
    }, [scoreTargetIndex, notifications, applyHintFromViewable]);

    const scrollToScoreHint = () => {
        const idx = targetIndexRef.current;
        if (idx < 0 || !listRef.current) return;
        try {
            listRef.current.scrollToIndex({ index: idx, viewPosition: 0.25, animated: true });
        } catch {
            listRef.current.scrollToOffset({ offset: Math.max(0, idx * ROW_HEIGHT_EST - 40), animated: true });
        }
    };

    const renderItem = ({ item }) => (
        <NotificationRow
            item={item}
            blinking={hasPendingScore && item.type === SCORE_HINT_TYPE}
            onPress={() => handlePress(item)}
            lang={lang}
        />
    );

    return (
        <View style={styles.container}>
            <View style={styles.header}>
                <Text style={styles.title}>{t.notificationsTitle}</Text>
                <View style={styles.headerBtns}>
                    <TouchableOpacity onPress={() => setModePickerVisible(true)} style={styles.muteBtn}>
                        <Text style={styles.muteBtnText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t.muteBtn}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={markAllRead} style={styles.markAllBtn}>
                        <Text style={styles.markAllText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {unreadCount > 0 ? t.notifUnreadBtn : t.notifReadBtn}
                        </Text>
                    </TouchableOpacity>
                </View>
            </View>

            <NotificationModePickerModal
                visible={modePickerVisible}
                onClose={() => setModePickerVisible(false)}
                onSelect={changeNotificationMode}
                currentValue={notificationMode}
                t={t}
            />

            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
            ) : (
                <FlatList
                    ref={listRef}
                    data={notifications}
                    keyExtractor={item => item.id}
                    renderItem={renderItem}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.purple} />}
                    contentContainerStyle={{ paddingBottom: hintDir ? 96 : 17 }}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                    onScrollToIndexFailed={({ index }) => {
                        listRef.current?.scrollToOffset({ offset: Math.max(0, index * ROW_HEIGHT_EST - 40), animated: true });
                    }}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Text style={styles.emptyEmoji}>🔕</Text>
                            <Text style={styles.emptyText}>{t.noNotificationsText}</Text>
                        </View>
                    }
                />
            )}
            {hintDir && (
                <ScoreScrollHint
                    dir={hintDir}
                    onPress={scrollToScoreHint}
                    label={hintDir === 'up' ? t.notifScoreScrollUp : t.notifScoreScrollDown}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg, paddingTop: 53 },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 17, paddingBottom: 13, borderBottomWidth: 1, borderBottomColor: colors.border },
    title: { color: '#fff', fontSize: 22, fontWeight: '900' },
    headerBtns: { flexDirection: 'row', alignItems: 'center', gap: 5, flexShrink: 1 },
    muteBtn: { backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 8, height: 24, minWidth: 66, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    muteBtnText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    markAllBtn: { backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 8, height: 24, minWidth: 66, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    markAllText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    item: { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 17, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border + '40', gap: 3, position: 'relative' },
    subBadge: { position: 'absolute', top: 8, right: 12, backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: colors.border, maxWidth: 90 },
    subBadgeText: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
    itemUnread: { backgroundColor: colors.purple + '10' },
    itemScoreHint: { backgroundColor: colors.purple + '22', borderLeftWidth: 3, borderLeftColor: colors.purple },
    scoreHintWrap: { position: 'absolute', left: 0, right: 0, alignItems: 'center', zIndex: 8 },
    scoreHintTop: { top: 108 },
    scoreHintBottom: { bottom: 16 },
    scoreHintBtn: {
        flexDirection: 'row', alignItems: 'center', gap: 8,
        backgroundColor: colors.purple, borderRadius: 22,
        paddingHorizontal: 16, paddingVertical: 10,
        borderWidth: 1.5, borderColor: colors.purple,
    },
    scoreHintArrow: { color: colors.ctaText, fontSize: 18, fontWeight: '900' },
    scoreHintLabel: { color: colors.ctaText, fontSize: 13, fontWeight: '800', maxWidth: 220 },
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
