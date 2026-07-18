import { useState, useEffect, useCallback, useMemo } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, StatusBar, Platform, Alert, Modal, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import { Chess } from 'chess.js';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { getSocket, onSocket } from '../../services/socket';

const PIECE_SYMBOL = {
    w: { k: '♔', q: '♕', r: '♖', b: '♗', n: '♘', p: '♙' },
    b: { k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟' },
};
const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const LIGHT_SQ = '#eed9b6';
const DARK_SQ = '#a97756';
const BOARD_SIZE = Math.min(Dimensions.get('window').width - 24, 400);
const SQUARE = BOARD_SIZE / 8;

function squareName(file, rank) { return `${FILES[file]}${rank + 1}`; }

export default function ChessTableScreen({ route, navigation }) {
    const t = useT();
    const { tableId } = route.params;
    const myId = useSelector(x => x.auth.user?.id);

    const [state, setState] = useState(null);
    const [gameEnd, setGameEnd] = useState(null);
    const [selected, setSelected] = useState(null); // square string ('e2') or null
    const [pendingPromotion, setPendingPromotion] = useState(null); // { from, to } or null

    useFocusEffect(useCallback(() => {
        const socket = getSocket();
        socket?.emit('chess:getState', { tableId });
    }, [tableId]));

    useEffect(() => {
        const offState = onSocket('chess:state', (data) => {
            if (data.tableId !== tableId) return;
            setState(data);
            setSelected(null);
        });
        const offGameEnd = onSocket('chess:gameEnd', (data) => setGameEnd(data));
        const offErr = onSocket('chess:error', (data) => Alert.alert('', data?.message || (t.chessError || 'Bir hata oluştu.')));
        return () => { offState(); offGameEnd(); offErr(); };
    }, [tableId, t]);

    const leaveTable = useCallback(() => {
        getSocket()?.emit('chess:leaveTable', { tableId });
    }, [tableId]);

    useEffect(() => () => leaveTable(), [leaveTable]);

    // Hook'lar (useMemo dahil) her render'da aynı sırada çağrılmalı — bu yüzden
    // "state henüz gelmedi" erken dönüşünden ÖNCE tanımlanır (state?. ile güvenli).
    const chess = useMemo(() => {
        if (!state?.fen) return null;
        try { return new Chess(state.fen); } catch { return null; }
    }, [state?.fen]);

    const board = useMemo(() => (chess ? chess.board() : null), [chess]);

    const legalTargets = useMemo(() => {
        if (!chess || !selected) return [];
        return chess.moves({ square: selected, verbose: true }).map(m => m.to);
    }, [chess, selected]);

    if (!state || !board) {
        return (
            <View style={[s.root, { alignItems: 'center', justifyContent: 'center' }]}>
                <Text style={{ color: colors.textMuted }}>{t.chessLoadingTable || 'Masaya bağlanılıyor...'}</Text>
            </View>
        );
    }

    const myPlayerIdx = state.players.findIndex(p => p.userId === myId);
    const myColor = myPlayerIdx === 0 ? 'w' : 'b'; // players[0]=beyaz, players[1]=siyah (backend ile birebir)
    const isMyTurn = state.turn === myPlayerIdx && state.phase === 'playing';
    const flipped = myColor === 'b';
    const oppPlayer = state.players[myPlayerIdx === 0 ? 1 : 0];

    const onSquarePress = (square, pieceHere) => {
        if (!isMyTurn) return;
        if (selected) {
            if (legalTargets.includes(square)) {
                const piece = chess.get(selected);
                const isPromotion = piece?.type === 'p' && (square[1] === '8' || square[1] === '1');
                if (isPromotion) {
                    setPendingPromotion({ from: selected, to: square });
                } else {
                    getSocket()?.emit('chess:move', { tableId, from: selected, to: square });
                }
                setSelected(null);
                return;
            }
            if (pieceHere && pieceHere.color === myColor) { setSelected(square); return; }
            setSelected(null);
            return;
        }
        if (pieceHere && pieceHere.color === myColor) setSelected(square);
    };

    const confirmPromotion = (piece) => {
        if (!pendingPromotion) return;
        getSocket()?.emit('chess:move', { tableId, from: pendingPromotion.from, to: pendingPromotion.to, promotion: piece });
        setPendingPromotion(null);
    };

    const resign = () => {
        Alert.alert(
            t.chessResignConfirmTitle || 'Oyunu terk et',
            t.chessResignConfirmMsg || 'Bu oyunu kaybetmiş sayılacaksın. Emin misin?',
            [
                { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
                { text: t.chessResignBtn || 'Terk Et', style: 'destructive', onPress: () => getSocket()?.emit('chess:resign', { tableId }) },
            ],
        );
    };

    const goBack = () => { leaveTable(); navigation.goBack(); };

    const ranks = flipped ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
    const files = flipped ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];

    const lastMoveSquares = state.lastMove ? [state.lastMove.from, state.lastMove.to] : [];
    const kingInCheckSquare = (() => {
        if (!state.inCheck || !chess) return null;
        const turnColor = chess.turn();
        for (let r = 0; r < 8; r++) {
            for (let f = 0; f < 8; f++) {
                const p = board[r][f];
                if (p && p.type === 'k' && p.color === turnColor) return squareName(f, 7 - r);
            }
        }
        return null;
    })();

    const winnerLabel = (g) => {
        if (!g) return '';
        if (g.winner === 'draw') return t.chessDraw || 'Berabere';
        const won = g.winner === myPlayerIdx;
        return won ? (t.chessYouWon || 'Kazandın! 🏆') : (t.chessYouLost || 'Kaybettin');
    };
    const reasonLabel = (reason) => {
        const map = {
            checkmate: t.chessReasonCheckmate || 'Şah mat',
            resign: t.chessReasonResign || 'Rakip oyunu terk etti',
            stalemate: t.chessReasonStalemate || 'Pat',
            repetition: t.chessReasonRepetition || 'Üç tekrar',
            insufficient_material: t.chessReasonInsufficient || 'Yetersiz materyal',
            fifty_move: t.chessReasonFiftyMove || '50 hamle kuralı',
        };
        return map[reason] || '';
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 20 }]}>
                <TouchableOpacity onPress={goBack} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.headerTitle}>{t.chessTitle || '♞ Satranç'}</Text>
                <TouchableOpacity onPress={resign} style={s.resignBtn}>
                    <Text style={s.resignBtnText}>{t.chessResignBtn || '🏳️ Terk Et'}</Text>
                </TouchableOpacity>
            </View>

            <View style={s.playerRow}>
                <Text style={s.playerText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {oppPlayer?.userId ? oppPlayer.username : oppPlayer?.username}
                    {!oppPlayer?.connected && !oppPlayer?.isBot ? ' (💤)' : ''}
                    {' '}· {myColor === 'w' ? '⚫' : '⚪'}
                </Text>
            </View>

            <View style={s.boardWrap}>
                {ranks.map(r => (
                    <View key={r} style={{ flexDirection: 'row' }}>
                        {files.map(f => {
                            const square = squareName(f, r);
                            const piece = board[7 - r][f];
                            const isDark = (f + r) % 2 === 0;
                            const isSelected = selected === square;
                            const isTarget = legalTargets.includes(square);
                            const isLastMove = lastMoveSquares.includes(square);
                            const isCheck = kingInCheckSquare === square;
                            return (
                                <TouchableOpacity
                                    key={square}
                                    activeOpacity={0.7}
                                    onPress={() => onSquarePress(square, piece)}
                                    style={[
                                        s.square,
                                        { backgroundColor: isDark ? DARK_SQ : LIGHT_SQ },
                                        isLastMove && s.squareLastMove,
                                        isSelected && s.squareSelected,
                                        isCheck && s.squareCheck,
                                    ]}
                                >
                                    {piece && (
                                        <Text style={[s.pieceText, { color: piece.color === 'w' ? '#f8fafc' : '#111827' }]}>
                                            {PIECE_SYMBOL[piece.color][piece.type]}
                                        </Text>
                                    )}
                                    {isTarget && !piece && <View style={s.dot} />}
                                    {isTarget && piece && <View style={s.captureRing} />}
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                ))}
            </View>

            <View style={s.statusRow}>
                <Text style={s.statusText}>
                    {state.phase !== 'playing'
                        ? (t.chessGameOver || 'Oyun bitti')
                        : isMyTurn
                            ? (state.inCheck ? (t.chessYourTurnCheck || 'Sıra sende — şahsın!') : (t.chessYourTurn || 'Sıra sende'))
                            : `${oppPlayer?.username || ''} ${t.chessOpponentTurn || 'oynuyor...'}`}
                </Text>
            </View>

            <View style={s.playerRow}>
                <Text style={s.playerText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {t.chessYou || 'Sen'} · {myColor === 'w' ? '⚪' : '⚫'}
                </Text>
            </View>

            {/* Terfi seçimi */}
            <Modal visible={!!pendingPromotion} transparent animationType="fade">
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>{t.chessPromotionTitle || 'Terfi'}</Text>
                        <View style={{ flexDirection: 'row', gap: 10, justifyContent: 'center' }}>
                            {['q', 'r', 'b', 'n'].map(p => (
                                <TouchableOpacity key={p} style={s.promoChip} onPress={() => confirmPromotion(p)}>
                                    <Text style={s.promoChipText}>{PIECE_SYMBOL[myColor][p]}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    </View>
                </View>
            </Modal>

            {/* Oyun sonu */}
            <Modal visible={!!gameEnd} transparent animationType="fade">
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>{winnerLabel(gameEnd)}</Text>
                        {gameEnd && <Text style={s.modalLine}>{reasonLabel(gameEnd.reason)}</Text>}
                        <TouchableOpacity style={s.modalBtn} onPress={goBack}>
                            <Text style={s.modalBtnText}>{t.chessBackHome || 'Geri Dön'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: '#1a1a1a' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingBottom: 10 },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: '#fff', fontSize: 26, fontWeight: '300' },
    headerTitle: { color: '#fff', fontSize: 15, fontWeight: '800' },
    resignBtn: { paddingHorizontal: 10, paddingVertical: 6, backgroundColor: '#ffffff18', borderRadius: 8 },
    resignBtnText: { color: '#fca5a5', fontSize: 12, fontWeight: '700' },

    playerRow: { paddingHorizontal: 16, paddingVertical: 6, alignItems: 'center' },
    playerText: { color: '#fff', fontSize: 13, fontWeight: '700' },

    boardWrap: { alignSelf: 'center', borderWidth: 2, borderColor: '#00000055', borderRadius: 4, overflow: 'hidden' },
    square: { width: SQUARE, height: SQUARE, alignItems: 'center', justifyContent: 'center' },
    squareSelected: { backgroundColor: '#5b8c3a' },
    squareLastMove: { backgroundColor: '#c9b46a' },
    squareCheck: { backgroundColor: '#dc2626' },
    pieceText: { fontSize: SQUARE * 0.7 },
    dot: { width: SQUARE * 0.28, height: SQUARE * 0.28, borderRadius: SQUARE * 0.14, backgroundColor: '#00000055' },
    captureRing: { position: 'absolute', width: SQUARE - 6, height: SQUARE - 6, borderRadius: (SQUARE - 6) / 2, borderWidth: 3, borderColor: '#00000055' },

    statusRow: { paddingHorizontal: 16, paddingVertical: 8, alignItems: 'center' },
    statusText: { color: '#fde68a', fontSize: 13, fontWeight: '700', textAlign: 'center' },

    modalOverlay: { flex: 1, backgroundColor: '#000000aa', alignItems: 'center', justifyContent: 'center' },
    modalBox: { backgroundColor: colors.surface, borderRadius: 16, padding: 20, width: '85%' },
    modalTitle: { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 12, textAlign: 'center' },
    modalLine: { color: colors.textSecondary, fontSize: 13, marginBottom: 4, textAlign: 'center' },
    modalBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 14 },
    modalBtnText: { color: '#fff', fontWeight: '800' },

    promoChip: { width: 50, height: 50, borderRadius: 10, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: colors.border },
    promoChipText: { fontSize: 28 },
});
