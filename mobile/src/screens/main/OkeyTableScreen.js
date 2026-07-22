import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, Alert, Modal, Animated, ScrollView, ActivityIndicator, PanResponder } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import api from '../../services/api';
import { getSocket, onSocket } from '../../services/socket';
import Avatar from '../../components/Avatar';

const COLOR_HEX = { R: '#dc2626', Y: '#ca8a04', B: '#2563eb', K: '#111827' };

function isJokerTile(t) { return t === 'J1' || t === 'J2'; }
function tileColorCode(t) { return t[0]; }
function tileNumLabel(t) { return t.slice(1); }

// ProfileScreen.js'teki spring pop-in deseninin taş/kart için uyarlanmışı — `trigger`
// değeri her değiştiğinde ölçek+opaklık sıfırdan oynatılıyor (çekilen taş/atılan kart hissi).
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

// Basılı tut + sürükle: parmağı bırakınca hedef bölgenin (dropZoneLayoutRef ile ölçülen,
// ekran mutlak koordinatlarındaki) içindeyse eylem tetiklenir; hareket etmeden bırakılırsa
// (düz dokunuş) eylem yine tetiklenir — eski dokun-at/çek davranışı böylece korunuyor.
// Her denemeden sonra taş görsel olarak yerine geri döner (liste gerçekte yeniden
// sıralanmıyor, sadece sürükleme sırasında geçici bir ofset uygulanıyor).
function Draggable({ payload, dropZoneLayoutRef, onAction, disabled, children }) {
    const pan = useRef(new Animated.ValueXY()).current;
    const scale = useRef(new Animated.Value(1)).current;
    const panResponder = useRef(
        PanResponder.create({
            onStartShouldSetPanResponder: () => !disabled,
            onMoveShouldSetPanResponder: () => !disabled,
            onPanResponderGrant: () => {
                Animated.spring(scale, { toValue: 1.18, useNativeDriver: true, friction: 5 }).start();
            },
            onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
            onPanResponderRelease: (evt, gestureState) => {
                const moved = Math.hypot(gestureState.dx, gestureState.dy) > 10;
                Animated.parallel([
                    Animated.spring(pan, { toValue: { x: 0, y: 0 }, useNativeDriver: true, friction: 6 }),
                    Animated.spring(scale, { toValue: 1, useNativeDriver: true, friction: 5 }),
                ]).start();
                if (!moved) { onAction(payload); return; }
                const zone = dropZoneLayoutRef.current;
                if (zone) {
                    const px = gestureState.moveX, py = gestureState.moveY;
                    if (px >= zone.x && px <= zone.x + zone.width && py >= zone.y && py <= zone.y + zone.height) {
                        onAction(payload);
                    }
                }
            },
        })
    ).current;

    return (
        <Animated.View {...panResponder.panHandlers} style={{ transform: [{ translateX: pan.x }, { translateY: pan.y }, { scale }], zIndex: 2 }}>
            {children}
        </Animated.View>
    );
}

function OkeyTile({ tile, small, disabled, highlighted, rejected, onPress, onLongPress }) {
    const joker = isJokerTile(tile);
    const colorHex = joker ? '#b45309' : COLOR_HEX[tileColorCode(tile)];
    const Wrap = (onPress || onLongPress) ? TouchableOpacity : View;
    return (
        <Wrap
            style={[s.tile, small && s.tileSmall, highlighted && s.tileHighlight, disabled && s.tileDisabled, rejected && s.tileRejected]}
            onPress={onPress ? () => onPress(tile) : undefined}
            onLongPress={onLongPress ? () => onLongPress(tile) : undefined}
            delayLongPress={400}
            activeOpacity={0.7}
        >
            {joker
                ? <Text style={[s.tileJoker, small && s.tileJokerSmall]}>🃏</Text>
                : <Text style={[s.tileNum, small && s.tileNumSmall, { color: colorHex }]}>{tileNumLabel(tile)}</Text>
            }
        </Wrap>
    );
}

function TileBack({ small }) {
    return (
        <View style={[s.tileBack, small && s.tileSmall]}>
            <View style={s.tileBackInner} />
        </View>
    );
}

// Özel masa bekleme odası — kurucu 3. koltuğu bir arkadaşıyla doldurana kadar burada
// bekler: masa kodunu paylaşabilir veya doğrudan arkadaş listesinden davet gönderebilir.
function OkeyWaitingRoom({ state, myId, tableId, onExit }) {
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

    useEffect(() => onSocket('okey:inviteSent', (data) => setInvited(prev => new Set(prev).add(data.userId))), []);

    const inviteFriend = (friendId) => getSocket()?.emit('okey:inviteFriend', { tableId, userId: friendId });

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <ScrollView contentContainerStyle={{ padding: 16 }}>
                <View style={s.waitCodeBox}>
                    <Text style={s.waitCodeLabel}>Masa Kodu</Text>
                    <Text style={s.waitCodeValue}>{state.code}</Text>
                    <Text style={s.waitCodeHint}>Bu kodu paylaşarak arkadaşların masaya katılabilir.</Text>
                </View>

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

                <TouchableOpacity style={s.waitLeaveBtn} onPress={onExit}>
                    <Text style={s.waitLeaveBtnText}>Masadan Ayrıl</Text>
                </TouchableOpacity>
            </ScrollView>
        </View>
    );
}

export default function OkeyTableScreen({ route, navigation }) {
    const t = useT();
    const { tableId } = route.params;
    const myId = useSelector(x => x.auth.user?.id);

    const [state, setState] = useState(null);
    const [hand, setHand] = useState([]);
    const [roundEnd, setRoundEnd] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);
    const [declareMode, setDeclareMode] = useState(false);
    const [hint, setHint] = useState('');
    const hintTimerRef = useRef(null);
    const showHint = useCallback((msg) => {
        setHint(msg);
        if (hintTimerRef.current) clearTimeout(hintTimerRef.current);
        hintTimerRef.current = setTimeout(() => setHint(''), 2400);
    }, []);
    useEffect(() => () => { if (hintTimerRef.current) clearTimeout(hintTimerRef.current); }, []);
    // Geçersiz bir dokunuşta taşın kendisini de kısaca kırmızı çerçeveyle işaretliyoruz —
    // küçük bir metin uyarısı tek başına çoğu zaman fark edilmiyordu.
    const [rejectedTile, setRejectedTile] = useState(null);
    const rejectedTimerRef = useRef(null);
    const flashRejected = useCallback((tile) => {
        setRejectedTile(tile);
        if (rejectedTimerRef.current) clearTimeout(rejectedTimerRef.current);
        rejectedTimerRef.current = setTimeout(() => setRejectedTile(null), 500);
    }, []);
    useEffect(() => () => { if (rejectedTimerRef.current) clearTimeout(rejectedTimerRef.current); }, []);

    // Elde bir taş fazlalaştığında (çekildiğinde) o taşın index'ini işaretliyoruz,
    // hand satırında o taş PopIn ile "pop-in" oynuyor.
    const prevHandLenRef = useRef(0);
    const [justDrawnIndex, setJustDrawnIndex] = useState(-1);
    useEffect(() => {
        if (hand.length > prevHandLenRef.current) setJustDrawnIndex(hand.length - 1);
        prevHandLenRef.current = hand.length;
    }, [hand]);

    useFocusEffect(useCallback(() => {
        const socket = getSocket();
        socket?.emit('okey:getState', { tableId });
    }, [tableId]));

    useEffect(() => {
        const offState = onSocket('okey:state', (data) => {
            if (data.tableId !== tableId) return;
            setState(data);
            if (data.phase !== 'roundEnd') setRoundEnd(null);
        });
        const offHand = onSocket('okey:hand', (data) => setHand(data.hand || []));
        const offRoundEnd = onSocket('okey:roundEnd', (data) => setRoundEnd(data));
        const offGameEnd = onSocket('okey:gameEnd', (data) => setGameEnd(data));
        const offErr = onSocket('okey:error', (data) => Alert.alert('', data?.message || (t.okeyError || 'Bir hata oluştu.')));
        return () => { offState(); offHand(); offRoundEnd(); offGameEnd(); offErr(); };
    }, [tableId, t]);

    const leaveTable = useCallback(() => {
        getSocket()?.emit('okey:leaveTable', { tableId });
    }, [tableId]);

    useEffect(() => () => leaveTable(), [leaveTable]);

    // Bahisli bir el aktif oynanırken (bekleme odası/oyun bitmiş değilken) geri
    // gidilmeye/başka ekrana geçilmeye çalışılırsa uyarı gösterilir.
    useEffect(() => {
        const isActiveWager = !!(state && (state.betAmount > 0 || state.ratingAmount > 0) && state.phase !== 'waiting' && state.phase !== 'finished');
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

    // Basılı tut + sürükle hedef bölgelerinin ekran mutlak koordinatları — her layout
    // değişiminde (elim büyüyüp küçüldükçe) tazelenir, PanResponder bırakma anında
    // parmağın bu dikdörtgenlerden hangisinin içinde olduğuna bakar.
    const handZoneRef = useRef(null);
    const handZoneLayoutRef = useRef(null);
    const measureHandZone = () => handZoneRef.current?.measureInWindow((x, y, width, height) => { handZoneLayoutRef.current = { x, y, width, height }; });
    const myDiscardZoneRef = useRef(null);
    const myDiscardZoneLayoutRef = useRef(null);
    const measureMyDiscardZone = () => myDiscardZoneRef.current?.measureInWindow((x, y, width, height) => { myDiscardZoneLayoutRef.current = { x, y, width, height }; });

    if (!state) {
        return (
            <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.textMuted }}>{t.okeyLoadingTable || 'Masaya bağlanılıyor...'}</Text>
            </View>
        );
    }

    if (state.phase === 'waiting') {
        return <OkeyWaitingRoom state={state} myId={myId} tableId={tableId} onExit={() => { leaveTable(); navigation.goBack(); }} />;
    }

    const mySeatInfo = state.seats.find(seat => seat.userId === myId);
    const mySeat = mySeatInfo ? mySeatInfo.seat : 0;
    const order = [mySeat, (mySeat + 1) % 4, (mySeat + 2) % 4, (mySeat + 3) % 4];
    const [bottomSeat, leftSeat, topSeat, rightSeat] = order;
    const seatByIdx = (seat) => state.seats.find(x => x.seat === seat) || {};
    const isMyTurn = state.turn === mySeat;
    const canDraw = state.phase === 'playing' && isMyTurn && !state.awaitingDiscard;
    const canAct = state.phase === 'playing' && isMyTurn && state.awaitingDiscard;

    const isHighlighted = (tile) => isJokerTile(tile) || (tileColorCode(tile) === state.okeyColor && Number(tileNumLabel(tile)) === state.okeyNumber);

    const notYourTurnMsg = () => (!isMyTurn ? (t.okeyNotYourTurn || 'Sıra sende değil') : (state.awaitingDiscard ? (t.okeyDiscardFirstHint || 'Önce taşını atmalısın') : (t.okeyDrawFirstHint || 'Önce taş çekmelisin')));

    const drawFromDeck = () => {
        if (!canDraw) return showHint(notYourTurnMsg());
        getSocket()?.emit('okey:drawTile', { tableId, source: 'deck' });
    };
    const drawFromDiscard = () => {
        if (!canDraw) return showHint(notYourTurnMsg());
        if (!state.discardTop) return showHint(t.okeyDiscardPileEmpty || 'Atım yığını boş');
        getSocket()?.emit('okey:drawTile', { tableId, source: 'discard' });
    };
    const discardTile = (tile) => {
        if (!canAct) { flashRejected(tile); return showHint(notYourTurnMsg()); }
        getSocket()?.emit('okey:discardTile', { tableId, tile });
    };
    const declareWin = (tile) => {
        if (!canAct) { flashRejected(tile); return showHint(notYourTurnMsg()); }
        Alert.alert(
            t.okeyDeclareWinConfirmTitle || 'Elini Aç',
            t.okeyDeclareWinConfirmMsg || 'Bu taşı atarak elini açmak istediğine emin misin?',
            [
                { text: t.no || 'Hayır', style: 'cancel' },
                { text: t.okeyDeclareWinConfirmBtn || 'Elimi Aç', onPress: () => getSocket()?.emit('okey:declareWin', { tableId, tile }) },
            ],
        );
    };
    // Basılı tut + sürükle taşı atım bölgesine götürüyor; "elini aç" modu aktifken
    // aynı sürükleme/dokunuş atmak yerine elini açma teyidini tetikler.
    const handleHandTileAction = (tile) => {
        if (declareMode) { setDeclareMode(false); declareWin(tile); }
        else discardTile(tile);
    };

    const goBack = () => { leaveTable(); navigation.goBack(); };

    // Herkes taşını kendi istakasının yanına attığı için atım artık tek ortak bir
    // yer değil, o taşı en son atan koltuğun yanında gösteriliyor — sadece en son
    // atılan (ve dolayısıyla şu an çekilebilir olan) taş etkileşimli.
    const renderDiscardSlot = (seatNum, small) => {
        const isLive = state.discardTopSeat === seatNum && state.discardTop;
        if (!isLive) return <View style={small ? s.tileSmall : s.tile} />;
        const tileEl = <OkeyTile tile={state.discardTop} small={small} highlighted={isHighlighted(state.discardTop)} disabled={!canDraw} />;
        return (
            <PopIn trigger={state.discardTop}>
                <Draggable payload={{ source: 'discard' }} dropZoneLayoutRef={handZoneLayoutRef} onAction={handleDrawPayload} disabled={!canDraw}>
                    {tileEl}
                </Draggable>
            </PopIn>
        );
    };
    const handleDrawPayload = (payload) => { if (payload.source === 'deck') drawFromDeck(); else drawFromDiscard(); };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 20 }]}>
                <TouchableOpacity onPress={goBack} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.roundText}>{t.okeyRound || 'El'} {state.roundNumber}/{state.totalRounds}</Text>
                {state.indicator ? (
                    <View style={s.indicatorBadge}>
                        <Text style={s.indicatorLabel}>{t.okeyIndicator || 'Gösterge'}</Text>
                        <OkeyTile tile={state.indicator} small />
                    </View>
                ) : <View style={{ width: 60 }} />}
            </View>

            {/* Skor satırı */}
            <View style={s.scoreRow}>
                {state.seats.map(seat => (
                    <View key={seat.seat} style={[s.scoreCell, seat.seat === state.turn && s.scoreCellActive]}>
                        <Avatar user={seat} size={20} ring={seat.seat === state.turn} />
                        <Text style={[s.scoreName, seat.seat === state.turn && s.scoreNameActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {seat.userId === myId ? (t.okeyYou || 'Sen') : seat.username}
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
                    <Avatar user={seatByIdx(topSeat)} size={26} ring={topSeat === state.turn} />
                    <Text style={[s.seatLabel, topSeat === state.turn && s.seatLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seatByIdx(topSeat).username}</Text>
                    <View style={s.oppHandRow}>
                        <View style={s.oppHand}>{Array.from({ length: seatByIdx(topSeat).handCount || 0 }).slice(0, 7).map((_, i) => <TileBack key={i} small />)}</View>
                        {renderDiscardSlot(topSeat, true)}
                    </View>
                </View>
                <View style={s.middleRow}>
                    <View style={s.sideSeat}>
                        <Avatar user={seatByIdx(leftSeat)} size={26} ring={leftSeat === state.turn} />
                        <Text style={[s.seatLabel, leftSeat === state.turn && s.seatLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seatByIdx(leftSeat).username}</Text>
                        <View style={s.oppHandRow}>
                            <View style={s.oppHandVert}>{Array.from({ length: seatByIdx(leftSeat).handCount || 0 }).slice(0, 7).map((_, i) => <TileBack key={i} small />)}</View>
                            {renderDiscardSlot(leftSeat, true)}
                        </View>
                    </View>
                    <View style={s.centerPiles}>
                        <Draggable payload={{ source: 'deck' }} dropZoneLayoutRef={handZoneLayoutRef} onAction={handleDrawPayload} disabled={!canDraw}>
                            <View style={[s.pile, !canDraw && s.pileDisabled]}>
                                <TileBack />
                                <Text style={s.pileCount}>{state.deckCount} taş</Text>
                            </View>
                        </Draggable>
                    </View>
                    <View style={s.sideSeat}>
                        <Avatar user={seatByIdx(rightSeat)} size={26} ring={rightSeat === state.turn} />
                        <Text style={[s.seatLabel, rightSeat === state.turn && s.seatLabelActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seatByIdx(rightSeat).username}</Text>
                        <View style={s.oppHandRow}>
                            {renderDiscardSlot(rightSeat, true)}
                            <View style={s.oppHandVert}>{Array.from({ length: seatByIdx(rightSeat).handCount || 0 }).slice(0, 7).map((_, i) => <TileBack key={i} small />)}</View>
                        </View>
                    </View>
                </View>
            </View>

            {/* Durum satırı */}
            <View style={[s.statusRow, isMyTurn && s.statusRowActive]}>
                <Text style={[s.statusText, isMyTurn && s.statusTextActive]}>
                    {isMyTurn
                        ? (canDraw ? (t.okeyYourDraw || 'Sıra sende — bir taş çek') : (t.okeyYourDiscard || 'Sıra sende — bir taş at ya da elini aç (uzun bas)'))
                        : `${seatByIdx(state.turn).username} ${t.okeyPlaying || 'oynuyor...'}`}
                </Text>
                {!!hint && <Text style={s.hintText}>{hint}</Text>}
            </View>

            {/* Elim */}
            <View style={s.myHandWrap}>
                <View style={s.myHandOuterRow}>
                    <View ref={handZoneRef} onLayout={measureHandZone} style={s.myHandRow}>
                        {hand.map((tile, i) => {
                            const tileEl = (
                                <OkeyTile
                                    tile={tile}
                                    highlighted={isHighlighted(tile)}
                                    disabled={!canAct}
                                    rejected={rejectedTile === tile}
                                />
                            );
                            const draggable = (
                                <Draggable payload={tile} dropZoneLayoutRef={myDiscardZoneLayoutRef} onAction={handleHandTileAction} disabled={!canAct}>
                                    {tileEl}
                                </Draggable>
                            );
                            return i === justDrawnIndex
                                ? <PopIn key={`${tile}_${i}`} trigger={`${tile}_${i}_${hand.length}`}>{draggable}</PopIn>
                                : <View key={`${tile}_${i}`}>{draggable}</View>;
                        })}
                    </View>
                    <View ref={myDiscardZoneRef} onLayout={measureMyDiscardZone} style={s.myDiscardSlot}>
                        <Text style={s.myDiscardLabel}>SEN</Text>
                        {renderDiscardSlot(mySeat)}
                    </View>
                </View>
                {canAct && (
                    <TouchableOpacity onPress={() => setDeclareMode(v => !v)} style={[s.declareBtn, declareMode && s.declareBtnActive]}>
                        <Text style={[s.declareBtnText, declareMode && s.declareBtnTextActive]}>
                            {declareMode ? '✓ Elini aç modu — bir taş seç' : '🏆 Elini Aç'}
                        </Text>
                    </TouchableOpacity>
                )}
                <Text style={s.myHandHint}>{t.okeyHandHint || 'Basılı tut + sürükle (veya dokun): at'}</Text>
            </View>

            {/* El sonu */}
            <Modal visible={!!roundEnd} transparent animationType="fade">
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>{roundEnd?.draw ? (t.okeyRoundDrawTitle || 'El Yandı') : (t.okeyRoundEndTitle || 'El Bitti')}</Text>
                        {roundEnd && roundEnd.draw && (
                            <Text style={s.modalLine}>{t.okeyDeckExhausted || 'Deste bitti, kimse açamadı.'}</Text>
                        )}
                        {roundEnd && !roundEnd.draw && (
                            <>
                                <Text style={s.modalLine}>
                                    {seatByIdx(roundEnd.winner).username} {roundEnd.ciftOkey ? `(${t.okeyCiftOkeyLabel || 'Çift Okey'}!) ` : ''}{t.okeyWon || 'kazandı'}
                                </Text>
                                {state.seats.map(seat => (
                                    <Text key={seat.seat} style={s.modalLine}>
                                        {seat.userId === myId ? (t.okeyYou || 'Sen') : seat.username}: {roundEnd.delta[seat.seat] >= 0 ? '+' : ''}{roundEnd.delta[seat.seat]} → {roundEnd.scores[seat.seat]}
                                    </Text>
                                ))}
                            </>
                        )}
                        <Text style={s.modalHint}>{t.okeyNextRoundSoon || 'Yeni el birazdan başlıyor...'}</Text>
                    </View>
                </View>
            </Modal>

            {/* Oyun sonu */}
            <Modal visible={!!gameEnd} transparent animationType="fade">
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>{t.okeyGameEndTitle || '🏆 Oyun Bitti'}</Text>
                        {gameEnd && state.seats
                            .map(seat => ({ seat, score: gameEnd.scores[seat.seat] }))
                            .sort((a, b) => b.score - a.score)
                            .map(({ seat, score }, i) => (
                                <Text key={seat.seat} style={s.modalLine}>
                                    {i === 0 ? '🥇 ' : `${i + 1}. `}{seat.userId === myId ? (t.okeyYou || 'Sen') : seat.username}: {score}
                                    {gameEnd.payouts?.points?.[seat.seat] > 0 && <Text style={s.payoutText}> (+{gameEnd.payouts.points[seat.seat]} puan)</Text>}
                                    {gameEnd.payouts?.rating?.[seat.seat] > 0 && <Text style={s.ratingPayoutText}> (+{gameEnd.payouts.rating[seat.seat].toFixed(2)} derece)</Text>}
                                </Text>
                            ))}
                        {gameEnd && gameEnd.payouts && gameEnd.payouts.points[mySeat] === 0 && gameEnd.payouts.rating[mySeat] === 0 && (state.betAmount > 0 || state.ratingAmount > 0) && (
                            <Text style={s.lossText}>Bahis puanını/dereceni kaybettin.</Text>
                        )}
                        <TouchableOpacity style={s.modalBtn} onPress={goBack}>
                            <Text style={s.modalBtnText}>{t.okeyBackHome || 'Geri Dön'}</Text>
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
    indicatorBadge: { alignItems: 'center', backgroundColor: '#ffffffdd', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, gap: 2 },
    indicatorLabel: { fontSize: 9, fontWeight: '900', color: '#111827' },

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
    oppHand: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    oppHandVert: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    oppHandRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },

    centerPiles: { flex: 1, flexDirection: 'row', gap: 14, alignItems: 'center', justifyContent: 'center', minHeight: 90 },
    pile: { alignItems: 'center', justifyContent: 'center', padding: 6 },
    pileDisabled: { opacity: 0.5 },
    pileEmoji: { fontSize: 30 },
    pileCount: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 2 },
    pileEmptyText: { color: '#ffffff55', fontSize: 24 },

    statusRow: { paddingHorizontal: 16, paddingVertical: 6, alignItems: 'center' },
    statusRowActive: { backgroundColor: '#fbbf2422', borderRadius: 12, marginHorizontal: 12, paddingVertical: 8 },
    statusText: { color: '#fde68a', fontSize: 12, fontWeight: '700', textAlign: 'center' },
    statusTextActive: { fontSize: 16, color: '#fde047', fontWeight: '900' },
    hintText: { color: '#fca5a5', fontSize: 14, fontWeight: '900', textAlign: 'center', marginTop: 6, backgroundColor: '#ef444422', borderRadius: 8, paddingVertical: 4, marginHorizontal: 12 },

    myHandWrap: { paddingHorizontal: 10, paddingBottom: 14, paddingTop: 4, alignItems: 'center' },
    myHandOuterRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
    myHandRow: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 4, justifyContent: 'center',
        backgroundColor: '#7c4e22', borderBottomWidth: 4, borderBottomColor: '#5c3417',
        borderRadius: 8, paddingHorizontal: 8, paddingTop: 6, paddingBottom: 8,
    },
    myDiscardSlot: { alignItems: 'center', gap: 2, paddingBottom: 8 },
    myDiscardLabel: { color: '#ffffff66', fontSize: 9, fontWeight: '700' },
    myHandHint: { color: '#ffffff88', fontSize: 10, marginTop: 6 },
    declareBtn: { marginTop: 8, paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10, backgroundColor: '#ffffff1a', borderWidth: 1, borderColor: '#ffffff33' },
    declareBtnActive: { backgroundColor: '#fbbf24', borderColor: '#f59e0b' },
    declareBtnText: { color: '#fde047', fontSize: 12, fontWeight: '700' },
    declareBtnTextActive: { color: '#111827', fontWeight: '900' },

    tile: { width: 40, height: 56, backgroundColor: '#f3e8cf', borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#d6c6a1', marginHorizontal: 1.5, marginVertical: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 3, elevation: 3 },
    tileSmall: { width: 26, height: 36, marginHorizontal: 1 },
    tileHighlight: { borderWidth: 2, borderColor: '#f59e0b', backgroundColor: '#fff2c7' },
    tileDisabled: { opacity: 0.45 },
    tileRejected: { borderWidth: 2, borderColor: '#ef4444' },
    tileNum: { fontSize: 18, fontWeight: '900' },
    tileNumSmall: { fontSize: 11 },
    tileJoker: { fontSize: 18 },
    tileJokerSmall: { fontSize: 12 },
    tileBack: { width: 40, height: 56, backgroundColor: '#7a1730', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginHorizontal: 1, marginVertical: 1, borderWidth: 1, borderColor: '#d4af37', overflow: 'hidden' },
    tileBackInner: { width: '70%', height: '70%', borderRadius: 4, borderWidth: 1, borderColor: '#d4af3766', backgroundColor: '#5c1024' },

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
});
