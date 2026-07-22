import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, Alert, Modal, ScrollView, Animated } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { getSocket, onSocket } from '../../services/socket';
import Avatar from '../../components/Avatar';

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

function CardBack({ small }) {
    return (
        <View style={[s.cardBack, small && s.cardSmall]}>
            <View style={s.cardBackInner} />
        </View>
    );
}

export default function BatakTableScreen({ route, navigation }) {
    const t = useT();
    const { tableId } = route.params;
    const myId = useSelector(x => x.auth.user?.id);

    const [state, setState] = useState(null);
    const [hand, setHand] = useState([]);
    const [roundEnd, setRoundEnd] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);
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
        socket?.emit('batak:getState', { tableId });
    }, [tableId]));

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
        return () => { offState(); offHand(); offRoundEnd(); offGameEnd(); offErr(); };
    }, [tableId, t]);

    const leaveTable = useCallback(() => {
        getSocket()?.emit('batak:leaveTable', { tableId });
    }, [tableId]);

    useEffect(() => () => leaveTable(), [leaveTable]);

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

    const mySeatInfo = state.seats.find(seat => seat.userId === myId);
    const mySeat = mySeatInfo ? mySeatInfo.seat : 0;
    const order = [mySeat, (mySeat + 1) % 4, (mySeat + 2) % 4, (mySeat + 3) % 4];
    const [bottomSeat, leftSeat, topSeat, rightSeat] = order;
    const seatByIdx = (seat) => state.seats.find(x => x.seat === seat) || {};
    const isMyTurn = state.turn === mySeat;
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
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 20 }]}>
                <TouchableOpacity onPress={goBack} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.roundText}>{t.batakRound || 'El'} {state.roundNumber}/{state.totalRounds}</Text>
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
            <View style={[s.statusRow, activeSeat === mySeat && s.statusRowActive]}>
                {state.phase === 'bidding' && (
                    <Text style={[s.statusText, isMyTurn && s.statusTextActive]}>
                        {isMyTurn ? (t.batakYourBid || 'Sıra sende — ihale ver veya pas geç')
                            : `${seatByIdx(state.turn).username} ${t.batakBidding || 'ihale veriyor...'}`}
                        {state.highestBid > 0 ? `  ·  ${t.batakHighestBid || 'En yüksek'}: ${state.highestBid} (${seatByIdx(state.highestBidder).username})` : ''}
                    </Text>
                )}
                {state.phase === 'choosingTrump' && (
                    <Text style={[s.statusText, state.highestBidder === mySeat && s.statusTextActive]}>
                        {state.highestBidder === mySeat ? (t.batakChooseTrump || 'Koz seç')
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
            {state.phase === 'choosingTrump' && state.highestBidder === mySeat && (
                <View style={s.trumpRow}>
                    {['S', 'H', 'D', 'C'].map(suit => (
                        <TouchableOpacity key={suit} style={s.trumpChip} onPress={() => chooseTrump(suit)}>
                            <Text style={[s.trumpChipText, { color: SUIT_COLOR[suit] }]}>{SUIT_SYMBOL[suit]}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            {/* Elim */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.myHandRow}>
                {hand.map(card => (
                    <PlayingCard
                        key={card}
                        card={card}
                        disabled={!(state.phase === 'playing' && isMyTurn && legalCards.includes(card))}
                        rejected={rejectedCard === card}
                        onPress={playCard}
                    />
                ))}
            </ScrollView>

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
                                </Text>
                            ))}
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

    myHandRow: { paddingHorizontal: 10, paddingVertical: 10, gap: 4, alignItems: 'center' },

    card: { width: 46, height: 64, backgroundColor: '#f3e8cf', borderRadius: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#d6c6a1', marginHorizontal: 3, shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.35, shadowRadius: 3, elevation: 3 },
    cardSmall: { width: 30, height: 42, marginHorizontal: 1 },
    cardDisabled: { opacity: 0.35 },
    cardRejected: { borderWidth: 2, borderColor: '#ef4444' },
    cardRank: { fontSize: 15, fontWeight: '900' },
    cardRankSmall: { fontSize: 10 },
    cardSuit: { fontSize: 18, fontWeight: '900' },
    cardSuitSmall: { fontSize: 12 },
    cardBack: { width: 46, height: 64, backgroundColor: '#7a1730', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginHorizontal: 2, borderWidth: 1, borderColor: '#d4af37', overflow: 'hidden' },
    cardBackInner: { width: '70%', height: '70%', borderRadius: 4, borderWidth: 1, borderColor: '#d4af3766', backgroundColor: '#5c1024' },

    modalOverlay: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center' },
    modalBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, width: '85%' },
    modalTitle: { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
    modalLine: { color: colors.textSecondary, fontSize: 13, marginBottom: 4 },
    modalHint: { color: colors.textMuted, fontSize: 11, marginTop: 10, textAlign: 'center' },
    modalBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
    modalBtnText: { color: '#fff', fontWeight: '800' },
});
