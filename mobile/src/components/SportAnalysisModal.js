import { useEffect, useState } from 'react';
import { Modal, View, Text, ScrollView, TouchableOpacity, ActivityIndicator, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import useT from '../hooks/useT';
import { getSubCategoryLabel } from '../utils/subCategoryLabels';

const BG = '#0f0f1a';
const CARD = '#1a1a2e';
const BORDER = '#ffffff12';
const MUTED = '#6b7280';
const WIN = '#4ade80';
const LOSS = '#f87171';
const DRAW = '#facc15';

// Skor "set" değil gol/sayı olarak tutulan dallar — set/oyun yerine atılan/yenilen göster.
const GOAL_SUBS = ['football', 'basketball', 'handball', 'hockey', 'water_polo'];

function venueTitle(sub, t) {
    if (sub === 'table_tennis') return t.sportAnVenuesTable;
    if (sub === 'football') return t.sportAnVenuesPitch;
    if (['volleyball', 'basketball', 'handball'].includes(sub)) return t.sportAnVenuesHall;
    return t.sportAnVenuesCourt;
}

function Section({ title, children, right }) {
    return (
        <View style={{ backgroundColor: CARD, borderRadius: 16, borderWidth: 1, borderColor: BORDER, padding: 14, marginBottom: 12 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800' }}>{title}</Text>
                {right}
            </View>
            {children}
        </View>
    );
}

function LineChart({ points, color, width, height = 110, label }) {
    const P = 8;
    const vals = points.map(p => p.rating);
    const minV = Math.min(...vals);
    const maxV = Math.max(...vals);
    const range = maxV - minV || 0.01;
    const pts = vals.map((v, i) => ({
        x: P + (i / (vals.length - 1)) * (width - P * 2),
        y: P + (1 - (v - minV) / range) * (height - P * 2),
        v,
    }));
    const first = vals[0];
    const last = vals[vals.length - 1];
    const diff = last - first;
    return (
        <View style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 6 }}>
                <Text style={{ color, fontSize: 12, fontWeight: '800' }}>{label} · {last.toFixed(2)}</Text>
                <Text style={{ color: diff > 0 ? WIN : diff < 0 ? LOSS : MUTED, fontSize: 12, fontWeight: '800' }}>
                    {diff > 0 ? '▲ +' : diff < 0 ? '▼ ' : '— '}{diff.toFixed(2)}
                </Text>
            </View>
            <View style={{ width, height, position: 'relative', backgroundColor: '#ffffff05', borderRadius: 10 }}>
                {[0.25, 0.5, 0.75].map(f => (
                    <View key={f} style={{ position: 'absolute', top: height * f, left: 0, right: 0, height: 1, backgroundColor: '#ffffff08' }} />
                ))}
                {pts.slice(0, -1).map((p, i) => {
                    const n = pts[i + 1];
                    const dx = n.x - p.x;
                    const dy = n.y - p.y;
                    const len = Math.sqrt(dx * dx + dy * dy);
                    const angle = Math.atan2(dy, dx) * 180 / Math.PI;
                    return (
                        <View key={i} style={{
                            position: 'absolute', left: (p.x + n.x) / 2 - len / 2, top: (p.y + n.y) / 2 - 1,
                            width: len, height: 2, backgroundColor: n.v >= p.v ? WIN : LOSS, transform: [{ rotate: `${angle}deg` }],
                        }} />
                    );
                })}
                {pts.map((p, i) => (
                    <View key={`d${i}`} style={{ position: 'absolute', left: p.x - 3, top: p.y - 3, width: 6, height: 6, borderRadius: 3, backgroundColor: color }} />
                ))}
                <Text style={{ position: 'absolute', top: 2, right: 6, color: MUTED, fontSize: 9 }}>{maxV.toFixed(2)}</Text>
                <Text style={{ position: 'absolute', bottom: 2, right: 6, color: MUTED, fontSize: 9 }}>{minV.toFixed(2)}</Text>
            </View>
        </View>
    );
}

function Bar({ label, value, max, color, suffix }) {
    const pct = max > 0 ? Math.max(4, (value / max) * 100) : 0;
    return (
        <View style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                <Text style={{ color: '#d1d5db', fontSize: 12, fontWeight: '700' }}>{label}</Text>
                <Text style={{ color, fontSize: 12, fontWeight: '800' }}>{suffix ?? value}</Text>
            </View>
            <View style={{ height: 8, backgroundColor: '#ffffff0d', borderRadius: 4, overflow: 'hidden' }}>
                {value > 0 && <View style={{ width: `${pct}%`, height: 8, backgroundColor: color, borderRadius: 4 }} />}
            </View>
        </View>
    );
}

const GRADE_COLOR = { very_high: WIN, high: '#a3e635', medium: DRAW, low: LOSS };

function AccuracyBlock({ a, title, t }) {
    const gc = GRADE_COLOR[a.grade] || MUTED;
    const verdictTxt = a.verdict === 'underrated' ? t.sportAccUnderrated : a.verdict === 'overrated' ? t.sportAccOverrated : t.sportAccAccurate;
    const verdictCol = a.verdict === 'accurate' ? WIN : DRAW;
    return (
        <View style={{ marginBottom: 6 }}>
            {title ? <Text style={{ color: '#d1d5db', fontSize: 12, fontWeight: '800', marginBottom: 8 }}>{title}</Text> : null}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 12 }}>
                <View style={{ width: 84, height: 84, borderRadius: 42, borderWidth: 6, borderColor: gc, alignItems: 'center', justifyContent: 'center', backgroundColor: gc + '14' }}>
                    <Text style={{ color: '#fff', fontSize: 22, fontWeight: '900' }}>%{a.accuracy}</Text>
                </View>
                <View style={{ flex: 1 }}>
                    <Text style={{ color: gc, fontSize: 15, fontWeight: '900' }}>{t[`sportAccGrade_${a.grade}`]}</Text>
                    <Text style={{ color: verdictCol, fontSize: 12, fontWeight: '700', marginTop: 2 }}>{verdictTxt}</Text>
                    {a.estimatedRating != null && (
                        <Text style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>
                            {t.sportAccEstimated}: <Text style={{ color: '#fff', fontWeight: '800' }}>{a.estimatedRating.toFixed(2)} ± {a.ci95.toFixed(2)}</Text>
                        </Text>
                    )}
                    {a.currentRating != null && (
                        <Text style={{ color: MUTED, fontSize: 11 }}>{t.sportAccCurrent}: {a.currentRating.toFixed(2)}</Text>
                    )}
                </View>
            </View>
            <Bar label={t.sportAccCompCalibration} value={a.components.calibration} max={100} color={WIN} suffix={`%${a.components.calibration}`} />
            <Bar label={t.sportAccCompWinFit} value={a.components.winFit} max={100} color={WIN} suffix={`%${a.components.winFit}`} />
            <Bar label={t.sportAccCompPrecision} value={a.components.precision} max={100} color={WIN} suffix={`%${a.components.precision}`} />
            <Bar label={t.sportAccCompSample} value={a.components.sample} max={100} color={WIN} suffix={`%${a.components.sample}`} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
                <View style={{ backgroundColor: '#ffffff0d', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: '#d1d5db', fontSize: 11, fontWeight: '700' }}>
                        {t.sportAccExpectedWins.replace('{exp}', a.expectedWins.toFixed(1)).replace('{act}', String(a.actualWins))}
                    </Text>
                </View>
                {a.hitRate != null && (
                    <View style={{ backgroundColor: '#ffffff0d', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                        <Text style={{ color: '#d1d5db', fontSize: 11, fontWeight: '700' }}>
                            {t.sportAccHitRate.replace('{p}', String(a.hitRate)).replace('{n}', String(a.hitSample))}
                        </Text>
                    </View>
                )}
                <View style={{ backgroundColor: '#ffffff0d', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                    <Text style={{ color: '#d1d5db', fontSize: 11, fontWeight: '700' }}>Brier {a.brier.toFixed(3)} · {a.matches} {t.sportAnMatchesShort}</Text>
                </View>
            </View>
        </View>
    );
}

function Stat({ value, label, color = '#fff' }) {
    return (
        <View style={{ flex: 1, alignItems: 'center', backgroundColor: '#ffffff08', borderRadius: 12, paddingVertical: 10 }}>
            <Text style={{ color, fontSize: 18, fontWeight: '900' }}>{value}</Text>
            <Text style={{ color: MUTED, fontSize: 10, fontWeight: '700', marginTop: 2 }} numberOfLines={1}>{label}</Text>
        </View>
    );
}

export default function SportAnalysisModal({ visible, onClose, userId, subCategory, lang, color = '#a855f7' }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const { width: SW } = useWindowDimensions();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(false);
    const [showAccHelp, setShowAccHelp] = useState(false);

    useEffect(() => {
        if (!visible || !userId || !subCategory) return;
        let alive = true;
        setLoading(true); setError(false);
        api.get(`/sport-analysis/${userId}/${subCategory}`)
            .then(({ data: d }) => { if (alive) setData(d); })
            .catch(() => { if (alive) setError(true); })
            .finally(() => { if (alive) setLoading(false); });
        return () => { alive = false; };
    }, [visible, userId, subCategory]);

    const chartW = SW - 32 - 28;
    const sportName = getSubCategoryLabel(subCategory, lang) || subCategory;
    const pad2 = (h) => `${String(h).padStart(2, '0')}:00`;

    const renderBody = () => {
        if (loading && !data) return <ActivityIndicator color={color} style={{ marginTop: 60 }} />;
        if (error) return <Text style={{ color: LOSS, textAlign: 'center', marginTop: 60 }}>{t.sportAnError}</Text>;
        if (!data) return null;
        const d = data;
        const anyData = d.totals.played > 0 || d.totals.upcoming > 0;
        if (!anyData) return <Text style={{ color: MUTED, textAlign: 'center', marginTop: 60, paddingHorizontal: 24 }}>{t.sportAnEmpty}</Text>;

        const singles = d.ratingTimeline.filter(p => p.matchType === 'singles');
        const doubles = d.ratingTimeline.filter(p => p.matchType === 'doubles');
        const isUtr = ['tennis', 'padel', 'pickleball'].includes(subCategory);
        const series = isUtr
            ? [{ pts: singles, label: t.sportAnSingles, col: '#facc15' }, { pts: doubles, label: t.sportAnDoubles, col: '#22d3ee' }]
            : [{ pts: d.ratingTimeline, label: 'ELO', col: '#facc15' }];
        const chartable = series.filter(s => s.pts.length >= 2);

        const monthMax = Math.max(1, ...d.monthly.map(m => m.played));
        const hourTotal = Object.values(d.hourBuckets).reduce((a, b) => a + b, 0);
        const hourMax = Math.max(1, ...Object.values(d.hourBuckets));
        const dayMax = Math.max(1, ...d.weekdays);
        const formColor = { win: WIN, loss: LOSS, draw: DRAW };
        const formSym = { win: '✓', loss: '✕', draw: '=' };
        const isGoal = GOAL_SUBS.includes(subCategory);

        return (
            <>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                    <Stat value={d.totals.played} label={t.sportAnPlayed} />
                    <Stat value={d.totals.wins} label={t.sportAnWins} color={WIN} />
                    <Stat value={d.totals.losses} label={t.sportAnLosses} color={LOSS} />
                    <Stat value={d.totals.draws} label={t.sportAnDraws} color={DRAW} />
                    <Stat value={d.totals.winRate != null ? `%${d.totals.winRate}` : '—'} label={t.sportAnWinRate} color={color} />
                </View>

                <Section
                    title={`🎯 ${t.sportAccTitle}`}
                    right={
                        <TouchableOpacity onPress={() => setShowAccHelp(v => !v)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                            <Text style={{ color, fontSize: 12, fontWeight: '800' }}>ⓘ {t.sportAccHowBtn}</Text>
                        </TouchableOpacity>
                    }>
                    {showAccHelp && (
                        <Text style={{ color: '#9ca3af', fontSize: 12, lineHeight: 18, marginBottom: 12, backgroundColor: '#ffffff08', borderRadius: 10, padding: 10 }}>{t.sportAccHowText}</Text>
                    )}
                    {d.accuracy ? (
                        <>
                            {d.accuracy.overall && <AccuracyBlock a={d.accuracy.overall} t={t} />}
                            {d.accuracy.singles && <AccuracyBlock a={d.accuracy.singles} title={t.sportAnSingles} t={t} />}
                            {d.accuracy.singles && d.accuracy.doubles && <View style={{ height: 1, backgroundColor: BORDER, marginVertical: 10 }} />}
                            {d.accuracy.doubles && <AccuracyBlock a={d.accuracy.doubles} title={t.sportAnDoubles} t={t} />}
                        </>
                    ) : <Text style={{ color: MUTED, fontSize: 12 }}>{t.sportAccNone}</Text>}
                </Section>

                <Section title={`📈 ${t.sportAnRatingTitle}`}>
                    {chartable.length > 0
                        ? chartable.map(s => <LineChart key={s.label} points={s.pts} color={s.col} width={chartW} label={s.label} />)
                        : <Text style={{ color: MUTED, fontSize: 12 }}>{t.sportAnNeed2}</Text>}
                </Section>

                <Section title={`🔥 ${t.sportAnFormTitle}`}>
                    {d.form.length > 0 ? (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 }}>
                            {d.form.map((r, i) => (
                                <View key={i} style={{ width: 26, height: 26, borderRadius: 13, backgroundColor: formColor[r] + '30', borderWidth: 1.5, borderColor: formColor[r], alignItems: 'center', justifyContent: 'center' }}>
                                    <Text style={{ color: formColor[r], fontSize: 12, fontWeight: '900' }}>{formSym[r]}</Text>
                                </View>
                            ))}
                        </View>
                    ) : <Text style={{ color: MUTED, fontSize: 12, marginBottom: 10 }}>{t.sportAnNoResults}</Text>}
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <Stat
                            value={d.streak.current ? `${d.streak.current.length}${formSym[d.streak.current.result]}` : '—'}
                            label={t.sportAnCurrentStreak}
                            color={d.streak.current ? formColor[d.streak.current.result] : '#fff'} />
                        <Stat value={d.streak.bestWin || 0} label={t.sportAnBestStreak} color={WIN} />
                    </View>
                </Section>

                <Section title={`🗓️ ${t.sportAnMonthlyTitle}`}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 110, gap: 8 }}>
                        {d.monthly.map(m => {
                            const [y, mo] = m.key.split('-').map(Number);
                            let lbl = String(mo);
                            try { lbl = new Date(y, mo - 1, 1).toLocaleDateString(lang, { month: 'short' }); } catch {}
                            const h = (m.played / monthMax) * 80;
                            const wh = m.played ? (m.wins / m.played) * h : 0;
                            return (
                                <View key={m.key} style={{ flex: 1, alignItems: 'center' }}>
                                    <Text style={{ color: '#d1d5db', fontSize: 10, fontWeight: '800', marginBottom: 2 }}>{m.played || ''}</Text>
                                    <View style={{ width: '70%', height: Math.max(h, 2), backgroundColor: color + '55', borderRadius: 5, justifyContent: 'flex-end', overflow: 'hidden' }}>
                                        {wh > 0 && <View style={{ height: wh, backgroundColor: WIN }} />}
                                    </View>
                                    <Text style={{ color: MUTED, fontSize: 9, marginTop: 4 }} numberOfLines={1}>{lbl}</Text>
                                </View>
                            );
                        })}
                    </View>
                    <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
                        <Text style={{ color: color, fontSize: 10, fontWeight: '700' }}>■ {t.sportAnMatches}</Text>
                        <Text style={{ color: WIN, fontSize: 10, fontWeight: '700' }}>■ {t.sportAnWins}</Text>
                    </View>
                </Section>

                <Section title={`🕒 ${t.sportAnHoursTitle}`}>
                    {d.peakHours && (
                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', marginBottom: 10 }}>
                            {t.sportAnPeak.replace('{from}', pad2(d.peakHours.from)).replace('{to}', pad2(d.peakHours.to))}
                        </Text>
                    )}
                    {hourTotal > 0 ? [
                        ['morning', '🌅', t.sportAnMorning],
                        ['afternoon', '☀️', t.sportAnAfternoon],
                        ['evening', '🌇', t.sportAnEvening],
                        ['night', '🌙', t.sportAnNight],
                    ].map(([k, e, l]) => (
                        <Bar key={k} label={`${e} ${l}`} value={d.hourBuckets[k]} max={hourMax} color={color}
                            suffix={`${d.hourBuckets[k]} · %${Math.round((d.hourBuckets[k] / hourTotal) * 100)}`} />
                    )) : <Text style={{ color: MUTED, fontSize: 12 }}>{t.sportAnNoData}</Text>}
                    {d.avgDuration ? (
                        <Text style={{ color: MUTED, fontSize: 12, marginTop: 4 }}>⏱️ {t.sportAnAvgDuration}: <Text style={{ color: '#fff', fontWeight: '800' }}>{d.avgDuration} {t.sportAnMin}</Text></Text>
                    ) : null}
                </Section>

                <Section title={`📅 ${t.sportAnWeekdaysTitle}`}>
                    <View style={{ flexDirection: 'row', alignItems: 'flex-end', height: 80, gap: 6 }}>
                        {d.weekdays.map((c, i) => (
                            <View key={i} style={{ flex: 1, alignItems: 'center' }}>
                                <Text style={{ color: '#d1d5db', fontSize: 10, fontWeight: '800', marginBottom: 2 }}>{c || ''}</Text>
                                <View style={{ width: '70%', height: Math.max((c / dayMax) * 50, 2), backgroundColor: c === Math.max(...d.weekdays) && c > 0 ? color : color + '55', borderRadius: 4 }} />
                                <Text style={{ color: MUTED, fontSize: 9, marginTop: 4 }}>{t.sportAnDays?.[i]}</Text>
                            </View>
                        ))}
                    </View>
                </Section>

                <Section title={`📍 ${venueTitle(subCategory, t)}`}>
                    {d.venues.length > 0 ? d.venues.map((v, i) => (
                        <View key={v.name} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: BORDER }}>
                            <Text style={{ color: i === 0 ? color : MUTED, fontSize: 14, fontWeight: '900', width: 22 }}>{i + 1}</Text>
                            <View style={{ flex: 1 }}>
                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{v.name}</Text>
                                {v.address ? <Text style={{ color: MUTED, fontSize: 11 }} numberOfLines={1}>{v.address}</Text> : null}
                            </View>
                            <View style={{ alignItems: 'flex-end' }}>
                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>{v.count} {t.sportAnMatchesShort}</Text>
                                {v.decided > 0 && <Text style={{ color: WIN, fontSize: 10, fontWeight: '700' }}>%{Math.round((v.wins / v.decided) * 100)} {t.sportAnWinRate}</Text>}
                            </View>
                        </View>
                    )) : <Text style={{ color: MUTED, fontSize: 12 }}>{t.sportAnNoData}</Text>}
                    {d.areas.length > 0 && (
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                            {d.areas.map(a => (
                                <View key={a.name} style={{ backgroundColor: '#ffffff0d', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                                    <Text style={{ color: '#d1d5db', fontSize: 11, fontWeight: '700' }}>🏙️ {a.name} · {a.count}</Text>
                                </View>
                            ))}
                        </View>
                    )}
                </Section>

                {(d.byType.singles || d.byType.doubles || d.byMode.competitive || d.byMode.practice) && (
                    <Section title={`⚖️ ${t.sportAnBreakdownTitle}`}>
                        {[
                            ['singles', d.byType.singles, t.sportAnSingles],
                            ['doubles', d.byType.doubles, t.sportAnDoubles],
                            ['competitive', d.byMode.competitive, t.sportAnCompetitive],
                            ['practice', d.byMode.practice, t.sportAnPractice],
                        ].filter(([k, v]) => v && (isUtr || (k !== 'singles' && k !== 'doubles'))).map(([k, v, l]) => (
                            <Bar key={k} label={`${l} · ${v.played} ${t.sportAnMatchesShort}`} value={v.wins} max={v.played} color={WIN}
                                suffix={`%${Math.round((v.wins / v.played) * 100)} ${t.sportAnWinRate}`} />
                        ))}
                    </Section>
                )}

                {d.sets && (
                    <Section title={`🎾 ${isGoal ? t.sportAnGoalsTitle : t.sportAnSetsTitle}`}>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            {!isGoal && <Stat value={d.sets.won} label={t.sportAnSetsWon} color={WIN} />}
                            {!isGoal && <Stat value={d.sets.lost} label={t.sportAnSetsLost} color={LOSS} />}
                            <Stat value={d.sets.gamesWon} label={isGoal ? t.sportAnScored : t.sportAnGamesWon} color={WIN} />
                            <Stat value={d.sets.gamesLost} label={isGoal ? t.sportAnConceded : t.sportAnGamesLost} color={LOSS} />
                        </View>
                    </Section>
                )}

                {d.opponents.length > 0 && (
                    <Section title={`🤝 ${t.sportAnOppTitle}`}>
                        {d.opponents.map((o, i) => (
                            <View key={o.id} style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderTopWidth: i ? 1 : 0, borderTopColor: BORDER }}>
                                <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: color + '40', alignItems: 'center', justifyContent: 'center', marginRight: 10 }}>
                                    <Text style={{ color: '#fff', fontWeight: '900' }}>{(o.fullName || o.username || '?')[0]?.toUpperCase()}</Text>
                                </View>
                                <View style={{ flex: 1 }}>
                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }} numberOfLines={1}>{o.fullName || o.username}</Text>
                                    {o.username ? <Text style={{ color: MUTED, fontSize: 11 }}>@{o.username}</Text> : null}
                                </View>
                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>
                                    {o.count} {t.sportAnMatchesShort} · <Text style={{ color: WIN }}>{o.wins}</Text>-<Text style={{ color: LOSS }}>{o.losses}</Text>
                                </Text>
                            </View>
                        ))}
                    </Section>
                )}
            </>
        );
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={{ flex: 1, backgroundColor: BG, paddingTop: insets.top }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: BORDER }}>
                    <View style={{ flex: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 17, fontWeight: '900' }}>📊 {t.sportAnTitle}</Text>
                        <Text style={{ color, fontSize: 12, fontWeight: '700' }}>{sportName}</Text>
                    </View>
                    <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <Text style={{ color: MUTED, fontSize: 24 }}>✕</Text>
                    </TouchableOpacity>
                </View>
                <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 + insets.bottom }} showsVerticalScrollIndicator={false}>
                    {renderBody()}
                </ScrollView>
            </View>
        </Modal>
    );
}
