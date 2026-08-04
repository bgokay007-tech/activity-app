import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, Alert, Modal, ScrollView, Animated, ActivityIndicator, PanResponder, Vibration } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import api from '../../services/api';
import { getSocket, onSocket } from '../../services/socket';
import Avatar from '../../components/Avatar';

const MUTE_START_ALERT_KEY = 'batak_muteStartAlert';

const SUIT_SYMBOL = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_COLOR = { S: '#111827', C: '#111827', H: '#dc2626', D: '#dc2626' };
const RANK_LABEL = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };

function rankLabel(card) {
    const rank = parseInt(card.slice(0, -1), 10);
    return RANK_LABEL[rank] || String(rank);
}
function cardSuit(card) { return card.slice(-1); }

// ProfileScreen.js'teki spring pop-in deseninin kart için uyarlanmışı — `trigger`
// değeri her değiştiğinde ölçek+opaklık sıfırdan oynatılıyor (oynanan kart hissi).
function PopIn({ trigger, children }) {
    const scale = useRef(new Animated.Value(0.4)).current;
    const opacity = useRef(new Animated.Value(0)).current;
    useEffect(() => {
        scale.setValue(0.4);
        opacity.setValue(0);
        Animated.parallel([
            Animated.spring(scale, { toValue: 1, friction: 5, tension: 140, useNativeDriver: true }),
            Animated.timing(opacity, { toValue: 1, duration: 180, useNativeDriver: true }),
        ]).start();
    }, [trigger]);
    return <Animated.View style={{ transform: [{ scale }], opacity }}>{children}</Animated.View>;
}

function PlayingCard({ card, small, disabled, rejected, onPress }) {
    const suit = cardSuit(card);
    const Wrap = onPress ? TouchableOpacity : View;
    return (
        <Wrap
            style={[s.card, small && s.cardSmall, disabled && s.cardDisabled, rejected && s.cardRejected]}
            onPress={onPress ? () => onPress(card) : undefined}
            activeOpacity={0.7}
        >
            <Text style={[s.cardRank, small && s.cardRankSmall, { color: SUIT_COLOR[suit] }]}>{rankLabel(card)}</Text>
            <Text style={[s.cardSuit, small && s.cardSuitSmall, { color: SUIT_COLOR[suit] }]}>{SUIT_SYMBOL[suit]}</Text>
        </Wrap>
    );
}

// Elimdeki bir kartı basılı tutup sürükleyerek kendime göre sıralayabilmek için:
// hareket bir eşiği (6px) aşarsa sürükleme sayılır ve yatay kaydırma miktarı
// kart genişliğine bölünerek kaç "slot" kaydığı hesaplanır (sadece görsel
// tercih, sunucuya hiçbir şey gönderilmez); eşiğin altında kalan dokunuşlar
// hâlâ tıklama gibi davranıp `onPress`'i (kartı oyna) tetikler.
const CARD_SLOT_WIDTH = 44;
function DraggableHandCard({ card, index, total, disabled, rejected, onPress, onReorder }) {
    const pan = useRef(new Animated.Value(0)).current;
    const meta = useRef({ index, total, onPress, onReorder, startIndex: index, moved: false });
    meta.current.index = index;
    meta.current.total = total;
    meta.current.onPress = onPress;
    meta.current.onReorder = onReorder;

    const panResponder = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
            meta.current.startIndex = meta.current.index;
            meta.current.moved = false;
            pan.setValue(0);
        },
        onPanResponderMove: (evt, gestureState) => {
            if (Math.abs(gestureState.dx) > 6 || Math.abs(gestureState.dy) > 6) meta.current.moved = true;
            pan.setValue(gestureState.dx);
            const deltaSlots = Math.round(gestureState.dx / CARD_SLOT_WIDTH);
            const targetIndex = Math.min(meta.current.total - 1, Math.max(0, meta.current.startIndex + deltaSlots));
            if (targetIndex !== meta.current.index) meta.current.onReorder(meta.current.index, targetIndex);
        },
        onPanResponderRelease: () => {
            Animated.spring(pan, { toValue: 0, useNativeDriver: true, speed: 20 }).start();
            if (!meta.current.moved) meta.current.onPress();
        },
        onPanResponderTerminate: () => {
            Animated.spring(pan, { toValue: 0, useNativeDriver: true, speed: 20 }).start();
        },
    })).current;

    return (
        <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX: pan }] }}>
            <PlayingCard card={card} disabled={disabled} rejected={rejected} />
        </Animated.View>
    );
}

function CardBack({ small }) {
    return (
        <View style={[s.cardBack, small && s.cardSmall]}>
            <View style={s.cardBackInner} />
        </View>
    );
}

// Bekleme odasındaki "Masa Ayarları" — şimdilik tek ayar: masa 4 kişi dolup
// oyun başlarken gelen ses+titreşim uyarısının sessize alınması.
function BatakSettingsModal({ visible, onClose, muted, onToggleMute, t }) {
    return (
        <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
            <View style={s.modalOverlay}>
                <View style={s.modalBox}>
                    <Text style={s.modalTitle}>{t.batakTableSettings || 'Masa Ayarları'}</Text>
                    <TouchableOpacity style={s.checkboxRow} onPress={onToggleMute} activeOpacity={0.8}>
                        <View style={[s.checkbox, muted && s.checkboxChecked]}>{muted && <Text style={s.checkboxMark}>✓</Text>}</View>
                        <Text style={s.checkboxLabel}>{t.batakMuteStartAlert || 'Oyun başlama uyarısını sessize al (ses & titreşim)'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.modalBtn} onPress={onClose}>
                        <Text style={s.modalBtnText}>{t.batakBack || 'Geri'}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

// Bekleme odasındayken (masa henüz kurulan kişinin masası) aynı varyantın herkese
// açık lobisine göz atma modalı — BatakHomeScreen'deki inline listeleme mantığının
// aynısı, ama kendi masasından ayrılmadan/masayı bozmadan kullanılabilsin diye
// burada, masa ekranının üstünde bir modal olarak sunuluyor.
function BatakLobbyBrowseModal({ visible, variant, excludeTableId, onClose, onJoinOther, t }) {
    const [tablesList, setTablesList] = useState([]);

    useEffect(() => {
        if (!visible || !variant) { setTablesList([]); return; }
        const socket = getSocket();
        socket?.emit('batak:listTables', { variant });
        const off = onSocket('batak:tableList', (data) => { if (data.variant === variant) setTablesList(data.tables || []); });
        return () => {
            off();
            getSocket()?.emit('batak:unsubscribeLobby', { variant });
        };
    }, [visible, variant]);

    const others = tablesList.filter(x => x.tableId !== excludeTableId);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.modalOverlay}>
                <View style={s.modalBox}>
                    <Text style={s.modalTitle}>{t.batakBrowseOtherTablesTitle || 'Diğer Açık Masalar'}</Text>
                    <Text style={s.waitCodeHint}>{t.batakOwnTableHint || 'Sen bakarken masan açık kalır — bozulmaz.'}</Text>
                    <ScrollView style={{ maxHeight: 380, marginTop: 10 }} showsVerticalScrollIndicator={false}>
                        {others.length === 0 ? (
                            <Text style={s.waitEmptyText}>{t.batakBrowseEmpty || 'Şu an açık masa yok'}</Text>
                        ) : others.map(item => {
                            const filled = item.seats.filter(x => !x.open).length;
                            return (
                                <View key={item.tableId} style={s.browseRow}>
                                    <View style={{ flexDirection: 'row', marginBottom: 2 }}>
                                        {item.seats.filter(x => !x.open).map(x => <Avatar key={x.seat} user={x} size={18} />)}
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.browseRowStake}>🪙 {item.betAmount}{item.ratingAmount > 0 ? `  ⭐ ${item.ratingAmount.toFixed(2)}` : ''}</Text>
                                        <Text style={s.browseRowSeats}>{filled}/4</Text>
                                    </View>
                                    <TouchableOpacity style={s.tableCardJoinBtn} onPress={() => onJoinOther(item.tableId)} activeOpacity={0.85}>
                                        <Text style={s.tableCardJoinBtnText}>{t.batakJoinBtn || 'Katıl'}</Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })}
                    </ScrollView>
                    <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', marginTop: 14 }}>
                        <Text style={{ color: colors.textMuted }}>{t.batakBack || 'Geri'}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

// Masa 4. koltuk dolduktan sonraki 5 saniyelik geri sayım ekranı — bekleme
// odasından farklı olarak artık davet/kod kutusu yok, sadece net bir "oyun
// başlıyor" bildirimi ve geri sayım.
function BatakStartingScreen({ state, myId, secondsLeft, onOpenSettings, t }) {
    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={s.startingTopRow}>
                <TouchableOpacity style={s.settingsGearBtn} onPress={onOpenSettings}>
                    <Text style={s.settingsGearText}>⚙️</Text>
                </TouchableOpacity>
            </View>
            <View style={s.startingWrap}>
                <Text style={s.startingTitle}>{t.batakStartingTitle || 'Masa doldu!'}</Text>
                <Text style={s.startingCountdown}>{secondsLeft}</Text>
                <Text style={s.startingSubtitle}>{(t.batakStartingSubtitle || 'Oyun {n} saniye içinde başlıyor...').replace('{n}', String(secondsLeft))}</Text>
                <View style={s.waitSeatRow}>
                    {state.seats.map(seat => (
                        <View key={seat.seat} style={s.waitSeatCell}>
                            <Avatar user={seat} size={26} />
                            <Text style={s.waitSeatName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seat.userId === myId ? (t.batakYou || 'Sen') : seat.username}</Text>
                        </View>
                    ))}
                </View>
            </View>
        </View>
    );
}

// Özel masa bekleme odası — kurucu 3. koltuğu bir arkadaşıyla doldurana kadar burada
// bekler: masa kodunu paylaşabilir veya doğrudan arkadaş listesinden davet gönderebilir.
function BatakWaitingRoom({ state, myId, tableId, onExit, onBrowse, onOpenSettings, spectating = false, t }) {
    const [friends, setFriends] = useState([]);
    const [loadingFriends, setLoadingFriends] = useState(true);
    const [onlineIds, setOnlineIds] = useState(new Set());
    const [invited, setInvited] = useState(new Set());

    useEffect(() => {
        api.get('/friends')
            .then(({ data }) => setFriends(Array.isArray(data) ? data : []))
            .catch(() => {})
            .finally(() => setLoadingFriends(false));
    }, []);

    useEffect(() => {
        const socket = getSocket();
        if (!socket || friends.length === 0) return;
        socket.emit('presence:query', friends.map(f => f.id), (online) => setOnlineIds(new Set(online || [])));
    }, [friends]);

    useEffect(() => onSocket('batak:inviteSent', (data) => setInvited(prev => new Set(prev).add(data.userId))), []);

    const inviteFriend = (friendId) => getSocket()?.emit('batak:inviteFriend', { tableId, userId: friendId });

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <View style={s.waitTopRow}>
                    <TouchableOpacity style={s.browseBtn} onPress={onBrowse} activeOpacity={0.85}>
                        <Text style={s.browseBtnText}>👀 {t.batakBrowseOtherTables || 'Diğer Masalara Bak'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.settingsGearBtn} onPress={onOpenSettings}>
                        <Text style={s.settingsGearText}>⚙️</Text>
                    </TouchableOpacity>
                </View>
                {spectating && (
                    <Text style={{ color: '#fbbf24', fontWeight: '800', textAlign: 'center', marginBottom: 12 }}>👁️ İzliyorsun — masa dolana kadar bekleniyor</Text>
                )}
                {!spectating && (
                    <View style={s.waitCodeBox}>
                        <Text style={s.waitCodeLabel}>Masa Kodu</Text>
                        <Text style={s.waitCodeValue}>{state.code}</Text>
                        <Text style={s.waitCodeHint}>Bu kodu paylaşarak arkadaşların masaya katılabilir.</Text>
                    </View>
                )}

                <View style={s.waitSeatRow}>
                    {state.seats.map(seat => (
                        <View key={seat.seat} style={s.waitSeatCell}>
                            {seat.open ? (
                                <>
                                    <View style={s.waitSeatEmpty} />
                                    <Text style={s.waitSeatEmptyText}>Boş</Text>
                                </>
                            ) : (
                                <>
                                    <Avatar user={seat} size={26} />
                                    <Text style={s.waitSeatName} numberOfLines={1}>{seat.userId === myId ? 'Sen' : seat.username}</Text>
                                </>
                            )}
                        </View>
                    ))}
                </View>

                {!spectating && (
                <View style={s.waitInviteBox}>
                    <Text style={s.waitInviteTitle}>Arkadaşlarını Davet Et</Text>
                    {loadingFriends ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 10 }} />
                    ) : friends.length === 0 ? (
                        <Text style={s.waitEmptyText}>Henüz arkadaşın yok.</Text>
                    ) : (
                        friends.map(f => {
                            const alreadySeated = state.seats.some(seat => seat.userId === f.id);
                            const isInvited = invited.has(f.id);
                            return (
                                <View key={f.id} style={s.waitFriendRow}>
                                    <Avatar user={f} size={26} />
                                    <View style={{ flex: 1, marginLeft: 8 }}>
                                        <Text style={s.waitFriendName} numberOfLines={1}>{f.fullName || f.username}</Text>
                                        <Text style={[s.waitFriendStatus, { color: onlineIds.has(f.id) ? '#4ade80' : colors.textMuted }]}>
                                            {onlineIds.has(f.id) ? '● Çevrimiçi' : '○ Çevrimdışı'}
                                        </Text>
                                    </View>
                                    <TouchableOpacity
                                        disabled={alreadySeated || isInvited}
                                        onPress={() => inviteFriend(f.id)}
                                        style={[s.waitInviteBtn, (alreadySeated || isInvited) && s.waitInviteBtnDisabled]}
                                    >
                                        <Text style={[s.waitInviteBtnText, (alreadySeated || isInvited) && s.waitInviteBtnTextDisabled]}>
                                            {alreadySeated ? 'Masada' : isInvited ? 'Gönderildi' : 'Davet Et'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            );
                        })
                    )}
                </View>
                )}

                <TouchableOpacity style={s.waitLeaveBtn} onPress={onExit}>
                    <Text style={s.waitLeaveBtnText}>{spectating ? 'İzlemeyi Bırak' : 'Masadan Ayrıl'}</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

export default function BatakTableScreen({ route, navigation }) {
    const t = useT();
    const { tableId, spectating = false } = route.params;
    const myId = useSelector(x => x.auth.user?.id);

    const [state, setState] = useState(null);
    const [hand, setHand] = useState([]);
    // Elin görsel sırası — sunucudan gelen `hand` (oyun mantığı için tek doğru
    // kaynak) sırasından bağımsız: oyuncu kartlarını sürükleyerek kendine göre
    // dizebilsin diye ayrıca tutuluyor, sadece yeni gelen/oynanan kartlar için
    // senkronlanıyor (mevcut kartların elle verilmiş sırası korunur).
    const [handOrder, setHandOrder] = useState([]);
    useEffect(() => {
        setHandOrder(prev => {
            const kept = prev.filter(c => hand.includes(c));
            const keptSet = new Set(kept);
            const added = hand.filter(c => !keptSet.has(c));
            return [...kept, ...added];
        });
    }, [hand]);
    const reorderHand = useCallback((fromIndex, toIndex) => {
        setHandOrder(prev => {
            if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= prev.length || toIndex >= prev.length) return prev;
            const next = [...prev];
            const [moved] = next.splice(fromIndex, 1);
            next.splice(toIndex, 0, moved);
            return next;
        });
    }, []);
    const [roundEnd, setRoundEnd] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);
    const [browseOpen, setBrowseOpen] = useState(false);
    const [settingsOpen, setSettingsOpen] = useState(false);
    const [startingBanner, setStartingBanner] = useState(false);
    const [nowTick, setNowTick] = useState(Date.now());
    // Masa 4 kişi dolup geri sayım başladığında ekranda saniye saniye akması için —
    // sadece 'starting' fazındayken çalışır, gereksiz yere sürekli render'a sebep olmasın.
    useEffect(() => {
        if (state?.phase !== 'starting') return;
        const iv = setInterval(() => setNowTick(Date.now()), 250);
        return () => clearInterval(iv);
    }, [state?.phase]);
    const secondsLeft = state?.startsAt ? Math.max(0, Math.ceil((state.startsAt - nowTick) / 1000)) : 0;

    // "Masa Ayarları"ndaki sessize alma tercihi — AsyncStorage'da tutuluyor ki
    // bir masadan diğerine (hatta uygulama yeniden açılsa da) hatırlansın.
    const [muted, setMuted] = useState(false);
    const mutedRef = useRef(false);
    useEffect(() => { mutedRef.current = muted; }, [muted]);
    useEffect(() => { AsyncStorage.getItem(MUTE_START_ALERT_KEY).then(v => { if (v === '1') setMuted(true); }).catch(() => {}); }, []);
    const toggleMuted = useCallback(() => {
        setMuted(m => {
            const next = !m;
            AsyncStorage.setItem(MUTE_START_ALERT_KEY, next ? '1' : '0').catch(() => {});
            return next;
        });
    }, []);

    const [hint, setHint] = useState('');
    const hintTimerRef = useRef(null);
    const showHint = useCallback((msg) => {
        setHint(msg);
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => setHint(''), 2400);
    }, []);
    useEffect(() => () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); }, []);
    // Geçersiz bir kart dokunulduğunda o kartın kendisini de kısaca kırmızı çerçeveyle
    // işaretliyoruz — küçük bir metin uyarısı tek başına çoğu zaman fark edilmiyordu.
    const [rejectedCard, setRejectedCard] = useState(null);
    const rejectedTimerRef = useRef(null);
    const flashRejected = useCallback((card) => {
        setRejectedCard(card);
        if (rejectedTimerRef.current) clearTimeout(rejectedTimerRef.current);
        rejectedTimerRef.current = setTimeout(() => setRejectedCard(null), 500);
    }, []);
    useEffect(() => () => { if (rejectedTimerRef.current) clearTimeout(rejectedTimerRef.current); }, []);

    useFocusEffect(useCallback(() => {
        const socket = getSocket();
        socket?.emit(spectating ? 'batak:spectateTable' : 'batak:getState', { tableId });
    }, [tableId, spectating]));

    useEffect(() => {
        const offState = onSocket('batak:state', (data) => {
            if (data.tableId !== tableId) return;
            setState(data);
            if (data.phase !== 'roundEnd') setRoundEnd(null);
        });
        const offHand = onSocket('batak:hand', (data) => setHand(data.hand || []));
        const offRoundEnd = onSocket('batak:roundEnd', (data) => setRoundEnd(data));
        const offGameEnd = onSocket('batak:gameEnd', (data) => setGameEnd(data));
        const offErr = onSocket('batak:error', (data) => Alert.alert('', data?.message || (t.batakError || 'Bir hata oluştu.')));
        // Geri sayım bitip eller dağıtılır dağıtılmaz sunucudan gelir — tam bu anda
        // 4 oyuncuya da titreşim + bildirim sesi + kısa bir "oyun başlıyor" banner'ı
        // gösteriliyor (masa ayarlarından sessize alınmadıysa).
        const offStarting = onSocket('batak:gameStarting', (data) => {
            if (data.tableId !== tableId) return;
            if (!mutedRef.current) {
                Vibration.vibrate([0, 300, 150, 300]);
                Notifications.scheduleNotificationAsync({
                    content: { title: t.batakTitle || '🃏 Batak', body: t.batakGameStartingBanner || '🎮 Oyun başlıyor!', sound: 'default' },
                    trigger: null,
                }).catch(() => {});
            }
            setStartingBanner(true);
            setTimeout(() => setStartingBanner(false), 2500);
        });
        return () => { offState(); offHand(); offRoundEnd(); offGameEnd(); offErr(); offStarting(); };
    }, [tableId, t]);

    const leaveTable = useCallback(() => {
        getSocket()?.emit(spectating ? 'batak:leaveSpectate' : 'batak:leaveTable', { tableId });
    }, [tableId, spectating]);

    useEffect(() => () => leaveTable(), [leaveTable]);

    // Bekleme odasındaki "Diğer Masalara Bak" modalından başka bir masaya katılmak
    // istendiğinde: kurduğu masa otomatik silinmez, kullanıcı önce onaylamalı —
    // onaylarsa mevcut masadan ayrılıp yeni masaya katılıyor ve ekran o masaya geçiyor.
    const joinOtherTable = useCallback((newTableId) => {
        Alert.alert(
            t.batakLeaveConfirmTitle || 'Masandan ayrılınsın mı?',
            t.batakLeaveConfirmMsg || 'Bu masaya katılmak için kurduğun masadan ayrılman gerekir — masan kapatılacak. Devam edilsin mi?',
            [
                { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
                {
                    text: t.batakLeaveConfirmBtn || 'Ayrıl ve Katıl',
                    style: 'destructive',
                    onPress: () => {
                        const socket = getSocket();
                        if (!socket) return;
                        const offMatched = onSocket('batak:matched', (data) => {
                            if (data.tableId !== newTableId) return;
                            offMatched(); offErrOnce();
                            setBrowseOpen(false);
                            navigation.replace('BatakTable', { tableId: newTableId });
                        });
                        const offErrOnce = onSocket('batak:error', (data) => {
                            offMatched(); offErrOnce();
                            Alert.alert('', data?.message || (t.batakError || 'Bir hata oluştu.'));
                        });
                        socket.emit('batak:leaveTable', { tableId });
                        socket.emit('batak:joinTable', { tableId: newTableId });
                    },
                },
            ],
        );
    }, [tableId, t, navigation]);

    // Bahisli bir el aktif oynanırken (bekleme odası/oyun bitmiş değilken) geri
    // gidilmeye/başka ekrana geçilmeye çalışılırsa uyarı gösterilir. Seyirci için
    // hiçbir bahis riski yok, bu uyarı hiç tetiklenmez.
    useEffect(() => {
        const isActiveWager = !spectating && !!(state && (state.betAmount > 0 || state.ratingAmount > 0) && state.phase !== 'waiting' && state.phase !== 'finished');
        if (!isActiveWager) return;
        const unsub = navigation.addListener('beforeRemove', (e) => {
            e.preventDefault();
            Alert.alert(
                'Oyundan Çıkılsın mı?',
                'Çıkarsan otomatik kaybetmiş sayılacaksın, puanın iade edilmeyecek.',
                [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Çık', style: 'destructive', onPress: () => navigation.dispatch(e.data.action) },
                ],
            );
        });
        return unsub;
    }, [navigation, state?.betAmount, state?.phase]);

    // Hook'lar (useMemo dahil) her render'da aynı sırada çağrılmalı — bu yüzden
    // "state henüz gelmedi" erken dönüşünden ÖNCE tanımlanır (state?. ile güvenli).
    const leadSuit = state?.leadSuit;
    const legalCards = useMemo(() => {
        if (!leadSuit) return hand;
        const follow = hand.filter(c => cardSuit(c) === leadSuit);
        return follow.length > 0 ? follow : hand;
    }, [hand, leadSuit]);

    if (!state) {
        return (
            <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.textMuted }}>{t.batakLoadingTable || 'Masaya bağlanılıyor...'}</Text>
            </View>
        );
    }

    if (state.phase === 'waiting') {
        return (
            <>
                <BatakWaitingRoom
                    state={state} myId={myId} tableId={tableId} spectating={spectating} t={t}
                    onExit={() => { leaveTable(); navigation.goBack(); }}
                    onBrowse={() => setBrowseOpen(true)}
                    onOpenSettings={() => setSettingsOpen(true)}
                />
                <BatakLobbyBrowseModal visible={browseOpen} variant={state.variant} excludeTableId={tableId} onClose={() => setBrowseOpen(false)} onJoinOther={joinOtherTable} t={t} />
                <BatakSettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} muted={muted} onToggleMute={toggleMuted} t={t} />
            </>
        );
    }

    if (state.phase === 'starting') {
        return (
            <>
                <BatakStartingScreen state={state} myId={myId} secondsLeft={secondsLeft} onOpenSettings={() => setSettingsOpen(true)} t={t} />
                <BatakSettingsModal visible={settingsOpen} onClose={() => setSettingsOpen(false)} muted={muted} onToggleMute={toggleMuted} t={t} />
            </>
        );
    }

    const mySeatInfo = state.seats.find(seat => seat.userId === myId);
    const isSpectator = spectating || !mySeatInfo;
    const mySeat = mySeatInfo ? mySeatInfo.seat : 0;
    const order = [mySeat, (mySeat + 1) % 4, (mySeat + 2) % 4, (mySeat + 3) % 4];
    const [bottomSeat, leftSeat, topSeat, rightSeat] = order;
    const seatByIdx = (seat) => state.seats.find(x => x.seat === seat) || {};
    const isMyTurn = !isSpectator && state.turn === mySeat;
    // publicState yalnızca 'bidding'/'playing' fazlarında `turn` alanını dolduruyor;
    // 'choosingTrump' fazında sırası gelen kişi highestBidder'dır — koltuk vurgusu
    // (Fix 4) için üç fazı da kapsayan ayrı bir "aktif koltuk" hesaplanıyor.
    const activeSeat = state.phase === 'choosingTrump' ? state.highestBidder : state.turn;

    const trickCardFor = (seat) => (state.trick || []).find(x => x.seat === seat)?.card || null;

    const placeBid = (bid) => getSocket()?.emit('batak:placeBid', { tableId, bid });
    const chooseTrump = (suit) => getSocket()?.emit('batak:chooseTrump', { tableId, suit });
    const playCard = (card) => {
        if (state.phase !== 'playing') { flashRejected(card); return showHint(t.batakNotPlayingPhase || 'Henüz kart oynama sırası değil'); }
        if (!isMyTurn) { flashRejected(card); return showHint(t.batakNotYourTurn || 'Sıra sende değil'); }
        if (!legalCards.includes(card)) { flashRejected(card); return showHint(t.batakMustFollowSuit || 'Renge uymak zorundasın.'); }
        getSocket()?.emit('batak:playCard', { tableId, card });
    };

    const goBack = () => { leaveTable(); navigation.goBack(); };

    const bidOptions = Array.from({ length: 13 - state.highestBid }, (_, i) => state.highestBid + 1 + i);

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            {startingBanner && (
                <View style={s.startingBannerWrap} pointerEvents="none">
                    <Text style={s.startingBannerText}>{t.batakGameStartingBanner || '🎮 Oyun başlıyor!'}</Text>
                </View>
            )}
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 20 }]}>
                <TouchableOpacity onPress={goBack} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.roundText}>
                    {t.batakRound || 'El'} {state.roundNumber}/{state.totalRounds}
                    {isSpectator ? ` · 👁️ ${t.batakSpectating || 'İzliyorsun'}` : ''}
                </Text>
                {state.trumpSuit ? (
                    <View style={s.trumpBadge}>
                        <Text style={[s.trumpBadgeText, { color: SUIT_COLOR[state.trumpSuit] }]}>{t.batakTrump || 'Koz'}: {SUIT_SYMBOL[state.trumpSuit]}</Text>
                    </View>
                ) : <View style={{ width: 60 }} />}
            </View>

            {/* Skor satırı */}
            <View style={s.scoreRow}>
                {state.seats.map(seat => (
                    <View key={seat.seat} style={[s.scoreCell, seat.seat === activeSeat && s.scoreCellActive]}>
                        <Avatar user={seat} size={20} ring={seat.seat === activeSeat} />
                        <Text style={[s.scoreName, seat.seat === activeSeat && s.scoreNameActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {seat.userId === myId ? (t.batakYou || 'Sen') : seat.username}
                            {seat.seat === state.dealerIndex ? ' 🎯' : ''}
                            {!seat.connected ? ' 🤖' : ''}
                        </Text>
                        <Text style={[s.scoreValue, state.scores[seat.seat] < 0 && { color: '#f87171' }]}>{state.scores[seat.seat]}</Text>
                    </View>
                ))}
            </View>

            {/* Masa */}
            <View style={s.table}>
                <View style={s.topSeat}>
                    <Avatar user={seatByIdx(topSeat)} size={26} ring={topSeat === activeSeat} />
                    <Text style={[s.seatLabel, topSeat === activeSeat && s.seatLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seatByIdx(topSeat).username}</Text>
                    <View style={s.oppHand}>{Array.from({ length: seatByIdx(topSeat).handCount || 0 }).slice(0, 5).map((_, i) => <CardBack key={i} small />)}</View>
                    {trickCardFor(topSeat) && <PopIn key={trickCardFor(topSeat)} trigger={trickCardFor(topSeat)}><PlayingCard card={trickCardFor(topSeat)} small /></PopIn>}
                </View>
                <View style={s.middleRow}>
                    <View style={s.sideSeat}>
                        <Avatar user={seatByIdx(leftSeat)} size={26} ring={leftSeat === activeSeat} />
                        <Text style={[s.seatLabel, leftSeat === activeSeat && s.seatLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seatByIdx(leftSeat).username}</Text>
                        <View style={s.oppHandVert}>{Array.from({ length: seatByIdx(leftSeat).handCount || 0 }).slice(0, 5).map((_, i) => <CardBack key={i} small />)}</View>
                    </View>
                    <View style={s.trickCenter}>
                        {trickCardFor(leftSeat) && <PopIn key={trickCardFor(leftSeat)} trigger={trickCardFor(leftSeat)}><PlayingCard card={trickCardFor(leftSeat)} small /></PopIn>}
                        {trickCardFor(bottomSeat) && <PopIn key={trickCardFor(bottomSeat)} trigger={trickCardFor(bottomSeat)}><PlayingCard card={trickCardFor(bottomSeat)} small /></PopIn>}
                        {trickCardFor(rightSeat) && <PopIn key={trickCardFor(rightSeat)} trigger={trickCardFor(rightSeat)}><PlayingCard card={trickCardFor(rightSeat)} small /></PopIn>}
                        {(!state.trick || state.trick.length === 0) && <Text style={s.tableEmoji}>🎴</Text>}
                    </View>
                    <View style={s.sideSeat}>
                        <Avatar user={seatByIdx(rightSeat)} size={26} ring={rightSeat === activeSeat} />
                        <Text style={[s.seatLabel, rightSeat === activeSeat && s.seatLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seatByIdx(rightSeat).username}</Text>
                        <View style={s.oppHandVert}>{Array.from({ length: seatByIdx(rightSeat).handCount || 0 }).slice(0, 5).map((_, i) => <CardBack key={i} small />)}</View>
                    </View>
                </View>
            </View>

            {/* Durum satırı */}
            <View style={[s.statusRow, !isSpectator && activeSeat === mySeat && s.statusRowActive]}>
                {state.phase === 'bidding' && (
                    <Text style={[s.statusText, isMyTurn && s.statusTextActive]}>
                        {isMyTurn ? (t.batakYourBid || 'Sıra sende — ihale ver veya pas geç')
                            : `${seatByIdx(state.turn).username} ${t.batakBidding || 'ihale veriyor...'}`}
                        {state.highestBid > 0 ? `  ·  ${t.batakHighestBid || 'En yüksek'}: ${state.highestBid} (${seatByIdx(state.highestBidder).username})` : ''}
                    </Text>
                )}
                {state.phase === 'choosingTrump' && (
                    <Text style={[s.statusText, !isSpectator && state.highestBidder === mySeat && s.statusTextActive]}>
                        {(!isSpectator && state.highestBidder === mySeat) ? (t.batakChooseTrump || 'Koz seç')
                            : `${seatByIdx(state.highestBidder).username} ${t.batakChoosingTrump || 'koz seçiyor...'}`}
                    </Text>
                )}
                {state.phase === 'playing' && (
                    <Text style={[s.statusText, isMyTurn && s.statusTextActive]}>
                        {isMyTurn ? (t.batakYourTurn || 'Sıra sende') : `${seatByIdx(state.turn).username} ${t.batakPlaying || 'oynuyor...'}`}
                    </Text>
                )}
                {!!hint && <Text style={s.hintText}>{hint}</Text>}
            </View>

            {/* İhale kontrolleri */}
            {state.phase === 'bidding' && isMyTurn && (
                <View style={s.bidRow}>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6, paddingHorizontal: 10 }}>
                        {bidOptions.map(n => (
                            <TouchableOpacity key={n} style={s.bidChip} onPress={() => placeBid(n)}>
                                <Text style={s.bidChipText}>{n}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity style={s.passBtn} onPress={() => placeBid('PASS')}>
                        <Text style={s.passBtnText}>{t.batakPass || 'Pas'}</Text>
                    </TouchableOpacity>
                </View>
            )}

            {/* Koz seçimi */}
            {!isSpectator && state.phase === 'choosingTrump' && state.highestBidder === mySeat && (
                <View style={s.trumpRow}>
                    {['S', 'H', 'D', 'C'].map(suit => (
                        <TouchableOpacity key={suit} style={s.trumpChip} onPress={() => chooseTrump(suit)}>
                            <Text style={[s.trumpChipText, { color: SUIT_COLOR[suit] }]}>{SUIT_SYMBOL[suit]}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Elim */}
            <View style={s.myHandRow}>
                {handOrder.map((card, index) => (
                    <DraggableHandCard
                        key={card}
                        card={card}
                        index={index}
                        total={handOrder.length}
                        disabled={!(state.phase === 'playing' && isMyTurn && legalCards.includes(card))}
                        rejected={rejectedCard === card}
                        onPress={playCard}
                        onReorder={reorderHand}
                    />
                ))}
            </View>

            {/* El sonu */}
            <Modal visible={!!roundEnd} transparent animationType="fade">
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>{t.batakRoundEndTitle || 'El Bitti'}</Text>
                        {roundEnd && (
                            <>
                                <Text style={s.modalLine}>
                                    {seatByIdx(roundEnd.bidder).username} — {t.batakBid || 'İhale'}: {roundEnd.bid}, {t.batakTricksWon || 'Aldığı el'}: {roundEnd.tricksWon[roundEnd.bidder]}
                                </Text>
                                {state.seats.map(seat => (
                                    <Text key={seat.seat} style={s.modalLine}>
                                        {seat.userId === myId ? (t.batakYou || 'Sen') : seat.username}: {roundEnd.delta[seat.seat] >= 0 ? '+' : ''}{roundEnd.delta[seat.seat]} → {roundEnd.scores[seat.seat]}
                                    </Text>
                                ))}
                            </>
                        )}
                        <Text style={s.modalHint}>{t.batakNextRoundSoon || 'Yeni el birazdan başlıyor...'}</Text>
                    </View>
                </View>
            </Modal>

            {/* Oyun sonu */}
            <Modal visible={!!gameEnd} transparent animationType="fade">
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>{t.batakGameEndTitle || '🏆 Oyun Bitti'}</Text>
                        {gameEnd && state.seats
                            .map(seat => ({ seat, score: gameEnd.scores[seat.seat] }))
                            .sort((a, b) => b.score - a.score)
                            .map(({ seat, score }, i) => (
                                <Text key={seat.seat} style={s.modalLine}>
                                    {i === 0 ? '🥇 ' : `${i + 1}. `}{seat.userId === myId ? (t.batakYou || 'Sen') : seat.username}: {score}
                                    {gameEnd.payouts?.points?.[seat.seat] > 0 && <Text style={s.payoutText}> (+{gameEnd.payouts.points[seat.seat]} puan)</Text>}
                                    {gameEnd.payouts?.rating?.[seat.seat] > 0 && <Text style={s.ratingPayoutText}> (+{gameEnd.payouts.rating[seat.seat].toFixed(2)} derece)</Text>}
                                </Text>
                            ))}
                        {!isSpectator && gameEnd && gameEnd.payouts && gameEnd.payouts.points[mySeat] === 0 && gameEnd.payouts.rating[mySeat] === 0 && (state.betAmount > 0 || state.ratingAmount > 0) && (
                            <Text style={s.lossText}>Bahis puanını/dereceni kaybettin.</Text>
                        )}
                        <TouchableOpacity style={s.modalBtn} onPress={goBack}>
                            <Text style={s.modalBtnText}>{t.batakBackHome || 'Geri Dön'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#062615' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: '#fff', fontSize: 26, fontWeight: '300' },
    roundText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    trumpBadge: { backgroundColor: '#ffffffdd', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
    trumpBadgeText: { fontSize: 13, fontWeight: '900' },

    startingBannerWrap: { position: 'absolute', top: Platform.OS === 'ios' ? 60 : 26, left: 16, right: 16, zIndex: 20, alignItems: 'center' },
    startingBannerText: { backgroundColor: '#f59e0bee', color: '#111827', fontSize: 15, fontWeight: '900', paddingHorizontal: 18, paddingVertical: 10, borderRadius: 14, overflow: 'hidden' },

    scoreRow: { flexDirection: 'row', paddingHorizontal: 8, gap: 6, marginBottom: 4 },
    scoreCell: { flex: 1, backgroundColor: '#ffffff18', borderRadius: 8, paddingVertical: 4, alignItems: 'center', borderWidth: 1.5, borderColor: 'transparent' },
    scoreCellActive: { backgroundColor: '#fbbf2433', borderColor: '#fbbf24' },
    scoreName: { color: '#fff', fontSize: 10, fontWeight: '700' },
    scoreNameActive: { color: '#fde047' },
    scoreValue: { color: '#4ade80', fontSize: 13, fontWeight: '900' },

    table: { flex: 1, marginHorizontal: 8, paddingHorizontal: 8, borderRadius: 16, backgroundColor: '#14532d', borderWidth: 4, borderColor: '#3f2a14' },
    topSeat: { alignItems: 'center', marginTop: 6, gap: 3 },
    middleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sideSeat: { alignItems: 'center', gap: 3, width: 70 },
    seatLabel: { color: '#fff', fontSize: 11, fontWeight: '700', maxWidth: 90 },
    seatLabelActive: { color: '#fde047', fontWeight: '900' },
    oppHand: { flexDirection: 'row' },
    oppHandVert: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    trickCenter: { flex: 1, flexDirection: 'row', gap: 4, alignItems: 'center', justifyContent: 'center', minHeight: 90 },
    tableEmoji: { fontSize: 30, opacity: 0.3 },

    statusRow: { paddingHorizontal: 16, paddingVertical: 6, alignItems: 'center' },
    statusRowActive: { backgroundColor: '#fbbf2422', borderRadius: 12, marginHorizontal: 12, paddingVertical: 8 },
    statusText: { color: '#fde68a', fontSize: 12, fontWeight: '700', textAlign: 'center' },
    statusTextActive: { fontSize: 16, color: '#fde047', fontWeight: '900' },
    hintText: { color: '#fca5a5', fontSize: 14, fontWeight: '900', textAlign: 'center', marginTop: 6, backgroundColor: '#ef444422', borderRadius: 8, paddingVertical: 4, marginHorizontal: 12 },

    bidRow: { flexDirection: 'row', alignItems: 'center', paddingBottom: 8, gap: 8 },
    bidChip: { backgroundColor: '#ffffffdd', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    bidChipText: { color: '#111827', fontWeight: '900', fontSize: 14 },
    passBtn: { backgroundColor: '#dc2626', borderRadius: 8, paddingHorizontal: 16, paddingVertical: 8, marginRight: 10 },
    passBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

    trumpRow: { flexDirection: 'row', justifyContent: 'center', gap: 14, paddingBottom: 10 },
    trumpChip: { backgroundColor: '#ffffffdd', borderRadius: 12, width: 52, height: 52, alignItems: 'center', justifyContent: 'center' },
    trumpChipText: { fontSize: 28, fontWeight: '900' },

    myHandRow: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', paddingHorizontal: 10, paddingVertical: 10, gap: 4 },

    card: { width: 38, height: 53, backgroundColor: '#f3e8cf', borderRadius: 7, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#d6c6a1', marginHorizontal: 2, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 3, elevation: 3 },
    cardSmall: { width: 30, height: 42, marginHorizontal: 1 },
    cardDisabled: { opacity: 0.35 },
    cardRejected: { borderWidth: 2, borderColor: '#ef4444' },
    cardRank: { fontSize: 13, fontWeight: '900' },
    cardRankSmall: { fontSize: 10 },
    cardSuit: { fontSize: 15, fontWeight: '900' },
    cardSuitSmall: { fontSize: 12 },
    cardBack: { width: 46, height: 64, backgroundColor: '#7a1730', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2, borderWidth: 1, borderColor: '#d4af37', overflow: 'hidden' },
    cardBackInner: { width: '70%', height: '70%', borderRadius: 4, borderWidth: 1, borderColor: '#d4af3766', backgroundColor: '#5c1024' },

    modalOverlay: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center' },
    modalBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, width: '85%' },
    modalTitle: { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
    modalLine: { color: colors.textSecondary, fontSize: 13, marginBottom: 4 },
    payoutText: { color: '#4ade80', fontWeight: '800' },
    ratingPayoutText: { color: '#38bdf8', fontWeight: '800' },
    lossText: { color: '#f87171', fontSize: 12, textAlign: 'center', marginTop: 6 },
    modalHint: { color: colors.textMuted, fontSize: 11, marginTop: 10, textAlign: 'center' },
    modalBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
    modalBtnText: { color: '#fff', fontWeight: '800' },

    waitCodeBox: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 20, alignItems: 'center', marginBottom: 14 },
    waitCodeLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 6 },
    waitCodeValue: { color: '#fff', fontSize: 28, fontWeight: '900', letterSpacing: 6 },
    waitCodeHint: { color: colors.textMuted, fontSize: 11, marginTop: 10, textAlign: 'center' },

    waitSeatRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
    waitSeatCell: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingVertical: 10, alignItems: 'center', gap: 4 },
    waitSeatEmpty: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colors.border, borderStyle: 'dashed' },
    waitSeatEmptyText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
    waitSeatName: { color: '#fff', fontSize: 10, fontWeight: '700', maxWidth: 60 },

    waitInviteBox: { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginBottom: 14 },
    waitInviteTitle: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 8 },
    waitEmptyText: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingVertical: 10 },
    waitFriendRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
    waitFriendName: { color: '#fff', fontSize: 12, fontWeight: '700' },
    waitFriendStatus: { fontSize: 10, marginTop: 1 },
    waitInviteBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7 },
    waitInviteBtnDisabled: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    waitInviteBtnText: { color: '#fff', fontWeight: '700', fontSize: 11 },
    waitInviteBtnTextDisabled: { color: colors.textMuted },

    waitLeaveBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    waitLeaveBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },

    waitTopRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    browseBtn: { flex: 1, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
    browseBtnText: { color: colors.textSecondary, fontWeight: '800', fontSize: 12 },
    settingsGearBtn: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    settingsGearText: { fontSize: 17 },

    browseRow: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 10, marginBottom: 8 },
    browseRowStake: { color: '#fbbf24', fontSize: 12, fontWeight: '900' },
    browseRowSeats: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginTop: 2 },
    tableCardJoinBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 },
    tableCardJoinBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },

    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4 },
    checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: colors.purple, borderColor: colors.purple },
    checkboxMark: { color: '#fff', fontSize: 12, fontWeight: '900' },
    checkboxLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', flex: 1 },

    startingTopRow: { flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 54 : 20 },
    startingWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, marginTop: -60 },
    startingTitle: { color: '#fff', fontSize: 20, fontWeight: '900', marginBottom: 6 },
    startingCountdown: { color: '#fbbf24', fontSize: 64, fontWeight: '900' },
    startingSubtitle: { color: colors.textMuted, fontSize: 13, marginTop: 6, marginBottom: 24, textAlign: 'center' },
});
