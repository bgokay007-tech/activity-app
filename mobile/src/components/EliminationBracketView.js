import { View, Text, ScrollView, TouchableOpacity } from 'react-native';

const SLOT_H = 26;
const SLOT_GAP = 3;
const MATCH_H = SLOT_H * 2 + SLOT_GAP;
const COL_W = 132;
const COL_GAP = 28;
const LINE = '#3b82f6';

/** Tur etiketi: Final / Yarı / Çeyrek / Son 16 / Son 32 … */
export function elimRoundLabel(round, maxRound, t) {
    const fromEnd = maxRound - round;
    if (fromEnd === 0) return t.sc_0436 || t.tournElimFinal || 'Final';
    if (fromEnd === 1) return t.sc_0437 || t.tournElimSemi || 'Yarı Final';
    if (fromEnd === 2) return t.sc_0438 || t.tournElimQuarter || 'Çeyrek Final';
    const playersInRound = Math.pow(2, fromEnd + 1);
    if (playersInRound === 16) return t.tournElimR16 || 'Son 16';
    if (playersInRound === 32) return t.tournElimR32 || 'Son 32';
    if (playersInRound === 64) return t.tournElimR64 || 'Son 64';
    if (typeof t.sc_0439 === 'function') return t.sc_0439(round);
    return `R${round}`;
}

function sideWon(match, side) {
    if (match.status !== 'COMPLETED' && match.status !== 'BYE' && match.status !== 'FORFEIT') return false;
    if (!match.winnerId) return false;
    return side === 'p1' ? match.winnerId === match.p1Id : match.winnerId === match.p2Id;
}

function Slot({ name, won, empty, accent }) {
    return (
        <View style={{
            height: SLOT_H,
            borderRadius: 6,
            paddingHorizontal: 7,
            justifyContent: 'center',
            backgroundColor: won ? '#166534' : (empty ? '#1e293b' : '#0f172a'),
            borderWidth: 1,
            borderColor: won ? '#22c55e80' : (empty ? '#47556980' : '#334155'),
            borderStyle: empty ? 'dashed' : 'solid',
            ...(accent ? { borderColor: '#f59e0b', borderWidth: 1.5 } : {}),
        }}>
            <Text
                numberOfLines={1}
                style={{
                    color: won ? '#bbf7d0' : (empty ? '#64748b' : '#e2e8f0'),
                    fontSize: 10,
                    fontWeight: won ? '800' : '600',
                }}
            >
                {name || '—'}
            </Text>
        </View>
    );
}

/**
 * Tek eleme ağacı (soldan sağa). Maça tıklanınca onMatchPress.
 */
export default function EliminationBracketView({ matches = [], t = {}, onMatchPress }) {
    const real = (matches || []).filter(m => m.phase === 'PLAYOFF' && !m.isThirdPlaceMatch);
    if (!real.length) {
        return (
            <Text style={{ color: '#64748b', fontSize: 12, textAlign: 'center', paddingVertical: 20 }}>
                {t.tournElimEmpty || 'Bracket henüz oluşmadı'}
            </Text>
        );
    }
    const rounds = [...new Set(real.map(m => m.round))].sort((a, b) => a - b);
    const maxRound = rounds[rounds.length - 1];
    const minRound = rounds[0];
    const byRound = {};
    for (const r of rounds) {
        byRound[r] = real.filter(m => m.round === r).sort((a, b) => (a.matchIndex || 0) - (b.matchIndex || 0));
    }
    const firstCount = byRound[minRound]?.length || 1;
    const unit = MATCH_H + 10;
    const totalHeight = firstCount * unit;
    const headerH = 34;

    const matchTop = (round, matchIndex) => {
        const ri = round - minRound;
        const stride = Math.pow(2, ri) * unit;
        return matchIndex * stride + (stride - MATCH_H) / 2;
    };

    const contentW = rounds.length * COL_W + (rounds.length - 1) * COL_GAP + 16;

    return (
        <ScrollView horizontal showsHorizontalScrollIndicator nestedScrollEnabled>
            <View style={{ width: contentW, height: totalHeight + headerH + 16, paddingLeft: 4, paddingBottom: 8 }}>
                {rounds.map((round, ri) => {
                    const left = ri * (COL_W + COL_GAP);
                    const list = byRound[round] || [];
                    const isFinal = round === maxRound;
                    return (
                        <View key={round} style={{ position: 'absolute', left, top: 0, width: COL_W }}>
                            <View style={{
                                backgroundColor: '#1e3a5f',
                                borderRadius: 8,
                                paddingVertical: 6,
                                marginBottom: 8,
                                alignItems: 'center',
                                borderWidth: 1,
                                borderColor: isFinal ? '#f59e0b80' : '#334155',
                            }}>
                                <Text style={{ color: isFinal ? '#fbbf24' : '#93c5fd', fontSize: 11, fontWeight: '900' }}>
                                    {elimRoundLabel(round, maxRound, t)}
                                </Text>
                            </View>
                            <View style={{ height: totalHeight, position: 'relative' }}>
                                {list.map((m) => {
                                    const top = matchTop(round, m.matchIndex || 0);
                                    const p1Empty = !m.p1Name && !m.p1Id;
                                    const p2Empty = !m.p2Name && !m.p2Id;
                                    return (
                                        <TouchableOpacity
                                            key={m.id}
                                            activeOpacity={0.85}
                                            onPress={() => onMatchPress?.(m)}
                                            style={{
                                                position: 'absolute',
                                                top,
                                                left: 0,
                                                width: COL_W,
                                                gap: SLOT_GAP,
                                            }}
                                        >
                                            <Slot name={m.p1Name} won={sideWon(m, 'p1')} empty={p1Empty} accent={isFinal} />
                                            <Slot name={m.p2Name} won={sideWon(m, 'p2')} empty={p2Empty} accent={isFinal} />
                                        </TouchableOpacity>
                                    );
                                })}
                                {/* Sonraki tura bağlantı çizgileri */}
                                {ri < rounds.length - 1 && list.map((m) => {
                                    const top = matchTop(round, m.matchIndex || 0) + MATCH_H / 2;
                                    const nextTop = matchTop(round + 1, Math.floor((m.matchIndex || 0) / 2)) + MATCH_H / 2;
                                    const x0 = COL_W;
                                    const x1 = COL_W + COL_GAP / 2;
                                    const x2 = COL_W + COL_GAP;
                                    const midY = (top + nextTop) / 2;
                                    const isEven = (m.matchIndex || 0) % 2 === 0;
                                    return (
                                        <View key={`line-${m.id}`} pointerEvents="none" style={{ position: 'absolute', left: 0, top: 0, right: -COL_GAP, bottom: 0 }}>
                                            <View style={{ position: 'absolute', left: x0, top, width: COL_GAP / 2, height: 2, backgroundColor: LINE }} />
                                            {isEven ? (
                                                <>
                                                    <View style={{
                                                        position: 'absolute',
                                                        left: x1,
                                                        top: Math.min(top, nextTop),
                                                        width: 2,
                                                        height: Math.abs(nextTop - top) || 2,
                                                        backgroundColor: LINE,
                                                    }} />
                                                    <View style={{ position: 'absolute', left: x1, top: nextTop, width: COL_GAP / 2, height: 2, backgroundColor: LINE }} />
                                                </>
                                            ) : (
                                                <View style={{ position: 'absolute', left: x1 - 1, top: midY, width: 2, height: 2, backgroundColor: LINE }} />
                                            )}
                                            {!isEven ? (
                                                <View style={{ position: 'absolute', left: x1, top: nextTop, width: x2 - x1, height: 2, backgroundColor: LINE }} />
                                            ) : null}
                                        </View>
                                    );
                                })}
                            </View>
                        </View>
                    );
                })}
            </View>
        </ScrollView>
    );
}
