import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { getSocket, onSocket } from '../../services/socket';

const COLOR_HEX = { R: '#dc2626', Y: '#ca8a04', B: '#2563eb', K: '#111827' };

function isJokerTile(t) { return t === 'J1' || t === 'J2'; }
function tileColorCode(t) { return t[0]; }
function tileNumLabel(t) { return t.slice(1); }

function OkeyTile({ tile, small, disabled, highlighted, onPress, onLongPress }) {
    const joker = isJokerTile(tile);
    const colorHex = joker ? '#b45309' : COLOR_HEX[tileColorCode(tile)];
    const Wrap = (onPress || onLongPress) ? TouchableOpacity : View;
    return (
        <Wrap
            style={[s.tile, small && s.tileSmall, highlighted && s.tileHighlight, disabled && s.tileDisabled]}
            onPress={onPress ? () => onPress(tile) : undefined}
            onLongPress={onLongPress ? () => onLongPress(tile) : undefined}
            delayLongPress={400}
            activeOpacity={0.7}
            disabled={disabled}
        >
            {joker
                ? <Text style={[s.tileJoker, small && s.tileJokerSmall]}>🃏</Text>
                : <Text style={[s.tileNum, small && s.tileNumSmall, { color: colorHex }]}>{tileNumLabel(tile)}</Text>
            }
        </Wrap>
    );
}

function TileBack({ small }) {
    return <View style={[s.tileBack, small && s.tileSmall]}><Text style={s.tileBackText}>🀫</Text></View>;
}

export default function OkeyTableScreen({ route, navigation }) {
    const t = useT();
    const { tableId } = route.params;
    const myId = useSelector(x => x.auth.user?.id);

    const [state, setState] = useState(null);
    const [hand, setHand] = useState([]);
    const [roundEnd, setRoundEnd] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);

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

    if (!state) {
        return (
            <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.textMuted }}>{t.okeyLoadingTable || 'Masaya bağlanılıyor...'}</Text>
            </View>
        );
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

    const drawFromDeck = () => canDraw && getSocket()?.emit('okey:drawTile', { tableId, source: 'deck' });
    const drawFromDiscard = () => canDraw && state.discardTop && getSocket()?.emit('okey:drawTile', { tableId, source: 'discard' });
    const discardTile = (tile) => { if (canAct) getSocket()?.emit('okey:discardTile', { tableId, tile }); };
    const declareWin = (tile) => {
        if (!canAct) return;
        Alert.alert(
            t.okeyDeclareWinConfirmTitle || 'Elini Aç',
            t.okeyDeclareWinConfirmMsg || 'Bu taşı atarak elini açmak istediğine emin misin?',
            [
                { text: t.no || 'Hayır', style: 'cancel' },
                { text: t.okeyDeclareWinConfirmBtn || 'Elimi Aç', onPress: () => getSocket()?.emit('okey:declareWin', { tableId, tile }) },
            ],
        );
    };

    const goBack = () => { leaveTable(); navigation.goBack(); };

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
                    <View key={seat.seat} style={s.scoreCell}>
                        <Text style={s.scoreName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
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
                    <Text style={s.seatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seatByIdx(topSeat).username}</Text>
                    <View style={s.oppHand}>{Array.from({ length: seatByIdx(topSeat).handCount || 0 }).slice(0, 7).map((_, i) => <TileBack key={i} small />)}</View>
                </View>
                <View style={s.middleRow}>
                    <View style={s.sideSeat}>
                        <Text style={s.seatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seatByIdx(leftSeat).username}</Text>
                        <View style={s.oppHandVert}>{Array.from({ length: seatByIdx(leftSeat).handCount || 0 }).slice(0, 7).map((_, i) => <TileBack key={i} small />)}</View>
                    </View>
                    <View style={s.centerPiles}>
                        <TouchableOpacity style={[s.pile, !canDraw && s.pileDisabled]} onPress={drawFromDeck} disabled={!canDraw}>
                            <Text style={s.pileEmoji}>🀫</Text>
                            <Text style={s.pileCount}>{state.deckCount}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[s.pile, !(canDraw && state.discardTop) && s.pileDisabled]}
                            onPress={drawFromDiscard}
                            disabled={!(canDraw && state.discardTop)}
                        >
                            {state.discardTop
                                ? <OkeyTile tile={state.discardTop} highlighted={isHighlighted(state.discardTop)} />
                                : <Text style={s.pileEmptyText}>—</Text>
                            }
                        </TouchableOpacity>
                    </View>
                    <View style={s.sideSeat}>
                        <Text style={s.seatLabel} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{seatByIdx(rightSeat).username}</Text>
                        <View style={s.oppHandVert}>{Array.from({ length: seatByIdx(rightSeat).handCount || 0 }).slice(0, 7).map((_, i) => <TileBack key={i} small />)}</View>
                    </View>
                </View>
            </View>

            {/* Durum satırı */}
            <View style={s.statusRow}>
                <Text style={s.statusText}>
                    {isMyTurn
                        ? (canDraw ? (t.okeyYourDraw || 'Sıra sende — bir taş çek') : (t.okeyYourDiscard || 'Sıra sende — bir taş at ya da elini aç (uzun bas)'))
                        : `${seatByIdx(state.turn).username} ${t.okeyPlaying || 'oynuyor...'}`}
                </Text>
            </View>

            {/* Elim */}
            <View style={s.myHandWrap}>
                <View style={s.myHandRow}>
                    {hand.map((tile, i) => (
                        <OkeyTile
                            key={`${tile}_${i}`}
                            tile={tile}
                            highlighted={isHighlighted(tile)}
                            disabled={!canAct}
                            onPress={canAct ? discardTile : undefined}
                            onLongPress={canAct ? declareWin : undefined}
                        />
                    ))}
                </View>
                <Text style={s.myHandHint}>{t.okeyHandHint || 'Dokun: at · Uzun bas: elini aç'}</Text>
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
                                </Text>
                            ))}
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
    root: { flex: 1, backgroundColor: '#0b3d1f' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: '#fff', fontSize: 26, fontWeight: '300' },
    roundText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    indicatorBadge: { alignItems: 'center', backgroundColor: '#ffffffdd', borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4, gap: 2 },
    indicatorLabel: { fontSize: 9, fontWeight: '900', color: '#111827' },

    scoreRow: { flexDirection: 'row', paddingHorizontal: 8, gap: 6, marginBottom: 4 },
    scoreCell: { flex: 1, backgroundColor: '#ffffff18', borderRadius: 8, paddingVertical: 4, alignItems: 'center' },
    scoreName: { color: '#fff', fontSize: 10, fontWeight: '700' },
    scoreValue: { color: '#4ade80', fontSize: 13, fontWeight: '900' },

    table: { flex: 1, paddingHorizontal: 8 },
    topSeat: { alignItems: 'center', marginTop: 6, gap: 3 },
    middleRow: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    sideSeat: { alignItems: 'center', gap: 3, width: 70 },
    seatLabel: { color: '#fff', fontSize: 11, fontWeight: '700', maxWidth: 90 },
    oppHand: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },
    oppHandVert: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center' },

    centerPiles: { flex: 1, flexDirection: 'row', gap: 14, alignItems: 'center', justifyContent: 'center', minHeight: 90 },
    pile: { alignItems: 'center', justifyContent: 'center' },
    pileDisabled: { opacity: 0.5 },
    pileEmoji: { fontSize: 30 },
    pileCount: { color: '#fff', fontSize: 11, fontWeight: '800', marginTop: 2 },
    pileEmptyText: { color: '#ffffff55', fontSize: 24 },

    statusRow: { paddingHorizontal: 16, paddingVertical: 6, alignItems: 'center' },
    statusText: { color: '#fde68a', fontSize: 12, fontWeight: '700', textAlign: 'center' },

    myHandWrap: { paddingHorizontal: 10, paddingBottom: 14, paddingTop: 4, alignItems: 'center' },
    myHandRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, justifyContent: 'center' },
    myHandHint: { color: '#ffffff88', fontSize: 10, marginTop: 6 },

    tile: { width: 40, height: 56, backgroundColor: '#fdf6e3', borderRadius: 6, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#00000022', marginHorizontal: 1, marginVertical: 1 },
    tileSmall: { width: 26, height: 36, marginHorizontal: 1 },
    tileHighlight: { borderWidth: 2, borderColor: '#f59e0b', backgroundColor: '#fff7e0' },
    tileDisabled: { opacity: 0.5 },
    tileNum: { fontSize: 18, fontWeight: '900' },
    tileNumSmall: { fontSize: 11 },
    tileJoker: { fontSize: 18 },
    tileJokerSmall: { fontSize: 12 },
    tileBack: { width: 40, height: 56, backgroundColor: '#1e3a8a', borderRadius: 6, alignItems: 'center', justifyContent: 'center', marginHorizontal: 1, marginVertical: 1, borderWidth: 1, borderColor: '#ffffff33' },
    tileBackText: { fontSize: 14 },

    modalOverlay: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center' },
    modalBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, width: '85%' },
    modalTitle: { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
    modalLine: { color: colors.textSecondary, fontSize: 13, marginBottom: 4 },
    modalHint: { color: colors.textMuted, fontSize: 11, marginTop: 10, textAlign: 'center' },
    modalBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
    modalBtnText: { color: '#fff', fontWeight: '800' },
});
