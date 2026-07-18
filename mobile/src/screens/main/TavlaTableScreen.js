import { useState, useEffect, useCallback } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, Alert, Modal } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { getSocket, onSocket } from '../../services/socket';

const CHECKER_COLOR = ['#f5f5f0', '#1f2937'];
const TOP_ROW    = [12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22, 23]; // point 13..24
const BOTTOM_ROW = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];           // point 12..1

function computeTarget(player, from, die) {
    if (from === -1) return player === 0 ? 24 - die : die - 1;
    return player === 0 ? from - die : from + die;
}
function isBearOffTarget(player, target) { return player === 0 ? target < 0 : target > 23; }

function Checkers({ count, player }) {
    if (count === 0) return null;
    const n = Math.abs(count);
    const shown = Math.min(n, 5);
    return (
        <View style={{ alignItems: 'center' }}>
            {Array.from({ length: shown }).map((_, i) => (
                <View key={i} style={[s.checker, { backgroundColor: CHECKER_COLOR[player] }]} />
            ))}
            {n > 5 && <Text style={s.checkerExtra}>+{n - 5}</Text>}
        </View>
    );
}

function Point({ index, count, isTop, selected, onPress, dim }) {
    const player = count > 0 ? 0 : count < 0 ? 1 : null;
    const alt = TOP_ROW.indexOf(index) >= 0 ? TOP_ROW.indexOf(index) % 2 === 0 : BOTTOM_ROW.indexOf(index) % 2 === 0;
    return (
        <TouchableOpacity
            style={[s.point, { backgroundColor: alt ? '#3f2a1a' : '#5a3d24' }, selected && s.pointSelected, dim && s.pointDim]}
            onPress={() => onPress(index)}
            activeOpacity={0.7}
        >
            <View style={isTop ? s.stackTop : s.stackBottom}>
                {player !== null && <Checkers count={count} player={player} />}
            </View>
        </TouchableOpacity>
    );
}

export default function TavlaTableScreen({ route, navigation }) {
    const t = useT();
    const { tableId } = route.params;
    const myId = useSelector(x => x.auth.user?.id);

    const [state, setState] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);
    const [selectedFrom, setSelectedFrom] = useState(null); // index veya -1 (bar)

    useFocusEffect(useCallback(() => {
        getSocket()?.emit('tavla:getState', { tableId });
    }, [tableId]));

    useEffect(() => {
        const offState = onSocket('tavla:state', (data) => {
            if (data.tableId !== tableId) return;
            setState(data);
            setSelectedFrom(null);
        });
        const offGameEnd = onSocket('tavla:gameEnd', (data) => setGameEnd(data));
        const offErr = onSocket('tavla:error', (data) => {
            setSelectedFrom(null);
            Alert.alert('', data?.message || (t.tavlaError || 'Bir hata oluştu.'));
        });
        return () => { offState(); offGameEnd(); offErr(); };
    }, [tableId, t]);

    const leaveTable = useCallback(() => {
        getSocket()?.emit('tavla:leaveTable', { tableId });
    }, [tableId]);

    useEffect(() => () => leaveTable(), [leaveTable]);

    if (!state) {
        return (
            <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.textMuted }}>{t.tavlaLoadingTable || 'Masaya bağlanılıyor...'}</Text>
            </View>
        );
    }

    const myIndex = state.players.findIndex(p => p.userId === myId);
    const myTurn = state.turn === myIndex;
    const opponent = state.players[myIndex === 0 ? 1 : 0];
    const goBack = () => { leaveTable(); navigation.goBack(); };

    const rollDice = () => getSocket()?.emit('tavla:roll', { tableId });

    const ownCount = (idx) => (myIndex === 0 ? state.board[idx] : -state.board[idx]);

    const handlePointPress = (idx) => {
        if (state.phase !== 'moving' || !myTurn) return;
        if (state.bar[myIndex] > 0) return; // barda tas varken once bar'dan girmek zorunda
        if (ownCount(idx) <= 0) return;
        setSelectedFrom(idx === selectedFrom ? null : idx);
    };

    const handleBarPress = () => {
        if (state.phase !== 'moving' || !myTurn) return;
        if (state.bar[myIndex] <= 0) return;
        setSelectedFrom(-1 === selectedFrom ? null : -1);
    };

    const playDie = (die) => {
        if (selectedFrom === null) return;
        const target = computeTarget(myIndex, selectedFrom, die);
        const to = isBearOffTarget(myIndex, target) ? 'off' : target;
        getSocket()?.emit('tavla:move', { tableId, from: selectedFrom, to, die });
    };

    const distinctDice = [...new Set(state.movesRemaining)];
    const myBorneOff = state.borneOff[myIndex] ?? 0;
    const oppBorneOff = state.borneOff[myIndex === 0 ? 1 : 0] ?? 0;
    const myBar = state.bar[myIndex] ?? 0;
    const oppBar = state.bar[myIndex === 0 ? 1 : 0] ?? 0;

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 20 }]}>
                <TouchableOpacity onPress={goBack} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.tavlaTitle || '🎲 Tavla'}</Text>
                <View style={{ width: 36 }} />
            </View>

            <View style={s.scoreRow}>
                <View style={s.scoreCell}>
                    <Text style={s.scoreName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{t.tavlaYou || 'Sen'}{!state.players[myIndex]?.connected ? ' 🤖' : ''}</Text>
                    <Text style={s.scoreValue}>{t.tavlaBorneOff || 'Çıkan'}: {myBorneOff}/15</Text>
                </View>
                <View style={s.scoreCell}>
                    <Text style={s.scoreName} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{opponent?.username}{opponent && !opponent.connected ? ' 🤖' : ''}</Text>
                    <Text style={s.scoreValue}>{t.tavlaBorneOff || 'Çıkan'}: {oppBorneOff}/15</Text>
                </View>
            </View>

            <View style={s.board}>
                <View style={s.row}>
                    {TOP_ROW.map(idx => (
                        <Point key={idx} index={idx} count={state.board[idx]} isTop selected={selectedFrom === idx}
                            dim={selectedFrom !== null && selectedFrom !== idx} onPress={handlePointPress} />
                    ))}
                </View>
                <TouchableOpacity style={s.barRow} onPress={handleBarPress} activeOpacity={0.7}>
                    <View style={[s.barCell, selectedFrom === -1 && s.pointSelected]}>
                        <Text style={s.barLabel}>{t.tavlaBar || 'Bar'}</Text>
                        {oppBar > 0 && <Checkers count={-oppBar} player={myIndex === 0 ? 1 : 0} />}
                        {myBar > 0 && <Checkers count={myBar} player={myIndex} />}
                    </View>
                </TouchableOpacity>
                <View style={s.row}>
                    {BOTTOM_ROW.map(idx => (
                        <Point key={idx} index={idx} count={state.board[idx]} isTop={false} selected={selectedFrom === idx}
                            dim={selectedFrom !== null && selectedFrom !== idx} onPress={handlePointPress} />
                    ))}
                </View>
            </View>

            <View style={s.statusRow}>
                {state.phase === 'finished' ? (
                    <Text style={s.statusText}>{t.tavlaGameEndTitle || '🏆 Oyun Bitti'}</Text>
                ) : state.phase === 'rolling' ? (
                    <Text style={s.statusText}>
                        {myTurn ? (t.tavlaYourRoll || 'Sıra sende — zar at') : `${opponent?.username || ''} ${t.tavlaRolling || 'zar atıyor...'}`}
                    </Text>
                ) : (
                    <Text style={s.statusText}>
                        {myTurn
                            ? (selectedFrom !== null ? (t.tavlaPickDie || 'Bir zar seç') : (t.tavlaPickChecker || 'Bir taş seç'))
                            : `${opponent?.username || ''} ${t.tavlaMoving || 'oynuyor...'}`}
                    </Text>
                )}
            </View>

            {state.phase === 'rolling' && myTurn && (
                <TouchableOpacity style={s.rollBtn} onPress={rollDice} activeOpacity={0.85}>
                    <Text style={s.rollBtnText}>{t.tavlaRollBtn || '🎲 Zar At'}</Text>
                </TouchableOpacity>
            )}

            {state.phase === 'moving' && (
                <View style={s.diceRow}>
                    {state.dice.map((d, i) => (
                        <View key={i} style={[s.diceChip, !state.movesRemaining.includes(d) && s.diceChipUsed]}>
                            <Text style={s.diceChipText}>{d}</Text>
                        </View>
                    ))}
                    {myTurn && selectedFrom !== null && distinctDice.map(d => (
                        <TouchableOpacity key={'play' + d} style={s.playDieBtn} onPress={() => playDie(d)}>
                            <Text style={s.playDieBtnText}>{d} {t.tavlaPlayDie || 'oyna'}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}

            <Modal visible={!!gameEnd} transparent animationType="fade">
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>
                            {gameEnd?.winner === myIndex ? (t.tavlaYouWon || '🏆 Kazandın!') : (t.tavlaYouLost || 'Kaybettin')}
                        </Text>
                        <TouchableOpacity style={s.modalBtn} onPress={goBack}>
                            <Text style={s.modalBtnText}>{t.tavlaBackHome || 'Geri Dön'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#2a1a10' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: '#fff', fontSize: 26, fontWeight: '300' },
    title: { color: '#fff', fontSize: 15, fontWeight: '800' },

    scoreRow: { flexDirection: 'row', paddingHorizontal: 8, gap: 6, marginBottom: 6 },
    scoreCell: { flex: 1, backgroundColor: '#ffffff18', borderRadius: 8, paddingVertical: 5, alignItems: 'center' },
    scoreName: { color: '#fff', fontSize: 11, fontWeight: '700' },
    scoreValue: { color: '#fbbf24', fontSize: 11, fontWeight: '700', marginTop: 1 },

    board: { marginHorizontal: 6, borderRadius: 8, backgroundColor: '#7c4a24', borderWidth: 4, borderColor: '#4a2c14', overflow: 'hidden' },
    row: { flexDirection: 'row' },
    point: { flex: 1, height: 110, alignItems: 'center', paddingVertical: 4 },
    pointSelected: { backgroundColor: '#7c3aed88' },
    pointDim: { opacity: 0.85 },
    stackTop: { alignItems: 'center', marginTop: 2 },
    stackBottom: { alignItems: 'center', justifyContent: 'flex-end', flex: 1, marginBottom: 2 },

    barRow: { backgroundColor: '#4a2c14', paddingVertical: 4 },
    barCell: { alignItems: 'center', minHeight: 30, justifyContent: 'center' },
    barLabel: { color: '#d1a877', fontSize: 9, fontWeight: '700' },

    checker: { width: 18, height: 18, borderRadius: 9, borderWidth: 1, borderColor: '#00000040', marginVertical: 1 },
    checkerExtra: { color: '#fff', fontSize: 10, fontWeight: '800' },

    statusRow: { alignItems: 'center', paddingTop: 10, paddingBottom: 4 },
    statusText: { color: '#fde68a', fontSize: 12, fontWeight: '700' },

    rollBtn: { alignSelf: 'center', backgroundColor: colors.purple, borderRadius: 14, paddingVertical: 12, paddingHorizontal: 32, marginTop: 6 },
    rollBtnText: { color: '#fff', fontSize: 15, fontWeight: '900' },

    diceRow: { flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap', paddingHorizontal: 12 },
    diceChip: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#ffffffdd', alignItems: 'center', justifyContent: 'center' },
    diceChipUsed: { opacity: 0.25 },
    diceChipText: { color: '#111827', fontSize: 16, fontWeight: '900' },
    playDieBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
    playDieBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },

    modalOverlay: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center' },
    modalBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 24, width: '80%', alignItems: 'center' },
    modalTitle: { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 16, textAlign: 'center' },
    modalBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, paddingHorizontal: 24 },
    modalBtnText: { color: '#fff', fontWeight: '800' },
});
