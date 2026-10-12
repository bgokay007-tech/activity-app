import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    Modal, View, Text, ScrollView, TouchableOpacity, TextInput, ActivityIndicator,
    KeyboardAvoidingView, Alert, RefreshControl,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import api from '../services/api';
import useT from '../hooks/useT';
import { onSocket } from '../services/socket';
import { defiRules, defiVenueWord } from '../utils/defiRules';
import { DEFI_TEAM_SUBS as DEFI_TEAM_SUBS_UI } from '../utils/tournamentFormats';

const ORANGE = '#f97316';
const GOAL_SUBS = ['football', 'basketball'];

const fmtDT = (iso, lang) => {
    if (!iso) return '';
    const d = new Date(iso);
    const loc = { tr: 'tr-TR', ru: 'ru-RU', de: 'de-DE' }[lang] || 'en-GB';
    return d.toLocaleString(loc, { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
};

function leftText(iso, t) {
    if (!iso) return '';
    const ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return t.defiOverdue;
    const h = Math.floor(ms / 3600000);
    if (h >= 48) return `${Math.floor(h / 24)}${t.defiDaysShort}`;
    return `${h}${t.defiHoursShort} ${Math.floor((ms % 3600000) / 60000)}${t.defiMinShort}`;
}

function Chip({ label, color, active, onPress }) {
    return (
        <TouchableOpacity onPress={onPress}
            style={{ paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, borderWidth: 1,
                borderColor: active ? color : '#334155', backgroundColor: active ? color + '25' : '#0f172a' }}>
            <Text style={{ color: active ? color : '#94a3b8', fontSize: 12, fontWeight: '800' }}>{label}</Text>
        </TouchableOpacity>
    );
}

function Btn({ label, color = ORANGE, onPress, disabled, filled }) {
    return (
        <TouchableOpacity disabled={disabled} onPress={onPress}
            style={{ paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8, borderWidth: 1, borderColor: color + '80',
                backgroundColor: filled ? color : color + '20', opacity: disabled ? 0.5 : 1 }}>
            <Text style={{ color: filled ? '#fff' : color, fontSize: 12, fontWeight: '800' }}>{label}</Text>
        </TouchableOpacity>
    );
}

// Kabul (gün/saat/yer önerisi) ve skor girişi aynı kartın içinde açılır — iç içe Modal yok.
function ChallengeCard({ c, data, myId, isCreator, sub, t, lang, busy, act, setsDefault }) {
    const iAmChallenger = c.challengerMembers?.includes(myId);
    const iAmDefender = c.defenderMembers?.includes(myId);
    const [mode, setMode] = useState(null); // null | 'accept' | 'score'
    const [agreed, setAgreed] = useState({ date: '', time: '', venue: '' });
    const goal = GOAL_SUBS.includes(sub);
    const initialSets = () => (Array.isArray(c.score?.sets) && c.score.sets.length
        ? c.score.sets.map(s => ({ p1: String(s.p1), p2: String(s.p2) }))
        : Array.from({ length: goal ? 1 : Math.max(1, setsDefault) }, () => ({ p1: '', p2: '' })));
    const [sets, setSets] = useState(initialSets);
    const mySide = iAmChallenger ? 'p1' : iAmDefender ? 'p2' : null;
    const iConfirmed = mySide === 'p1' ? c.challengerConfirmed : mySide === 'p2' ? c.defenderConfirmed : false;
    const statusLabel = { DEFI_OFFERED: t.defiStOffered, DEFI_ACCEPTED: t.defiStAccepted, DEFI_SCORED: t.defiStScored }[c.status];
    const v = defiVenueWord(sub, lang);

    const submitScore = () => {
        const clean = sets.map(s => ({ p1: parseInt(s.p1, 10), p2: parseInt(s.p2, 10) }))
            .filter(s => Number.isFinite(s.p1) && Number.isFinite(s.p2));
        if (!clean.length) { Alert.alert('', t.defiScoreInvalid); return; }
        act(`/challenges/${c.id}/score`, { sets: clean }, () => setMode(null));
    };

    return (
        <View style={{ backgroundColor: '#0f172a', borderRadius: 12, borderWidth: 1, borderColor: ORANGE + '50', padding: 10, gap: 6 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '900' }}>{statusLabel}</Text>
                {c.deadline ? <Text style={{ color: '#fbbf24', fontSize: 11, fontWeight: '700' }}>⏱ {leftText(c.deadline, t)}</Text> : null}
            </View>
            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>
                #{c.challengerRank} {c.challengerName}  ⚔️  #{c.defenderRank} {c.defenderName}
            </Text>
            {c.agreed && (c.agreed.date || c.agreed.time || c.agreed.venue) ? (
                <Text style={{ color: '#94a3b8', fontSize: 11 }}>
                    📅 {[c.agreed.date, c.agreed.time, c.agreed.venue].filter(Boolean).join(' · ')}
                </Text>
            ) : null}
            {c.status === 'DEFI_SCORED' && Array.isArray(c.score?.sets) ? (
                <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '700' }}>
                    📝 {c.score.sets.map(s => `${s.p1}-${s.p2}`).join(', ')}
                    {iConfirmed ? `  · ${t.defiWaitingOther}` : ''}
                </Text>
            ) : null}

            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                {c.status === 'DEFI_OFFERED' && iAmDefender && (<>
                    <Btn label={t.defiAccept} color="#22c55e" disabled={busy} onPress={() => setMode(mode === 'accept' ? null : 'accept')} />
                    <Btn label={t.defiDecline} color="#ef4444" disabled={busy} onPress={() => {
                        const left = data?.ladder?.find(r => r.key === c.defenderKey)?.declinesLeft ?? 0;
                        Alert.alert('', left > 0 ? t.defiDeclineConfirm.replace('{n}', String(left)) : t.defiDeclineWoConfirm, [
                            { text: t.cancelBtn || 'Cancel', style: 'cancel' },
                            { text: t.defiDecline, style: 'destructive', onPress: () => act(`/challenges/${c.id}/respond`, { action: 'decline' }) },
                        ]);
                    }} />
                </>)}
                {((c.status === 'DEFI_OFFERED' && iAmChallenger) || isCreator) && (
                    <Btn label={t.defiWithdraw} color="#94a3b8" disabled={busy} onPress={() => Alert.alert('', t.defiWithdrawConfirm, [
                        { text: t.cancelBtn || 'Cancel', style: 'cancel' },
                        { text: t.defiWithdraw, style: 'destructive', onPress: () => act(`/challenges/${c.id}/cancel`, {}) },
                    ])} />
                )}
                {mySide && (c.status === 'DEFI_ACCEPTED' || c.status === 'DEFI_SCORED') && (
                    <Btn label={c.status === 'DEFI_SCORED' ? t.defiFixScore : t.defiEnterScore} disabled={busy}
                        onPress={() => { setSets(initialSets()); setMode(mode === 'score' ? null : 'score'); }} />
                )}
                {mySide && c.status === 'DEFI_SCORED' && !iConfirmed && (
                    <Btn label={t.defiConfirmScore} color="#22c55e" filled disabled={busy} onPress={() => act(`/challenges/${c.id}/confirm`, {})} />
                )}
            </View>

            {mode === 'accept' && (
                <View style={{ gap: 6, marginTop: 4 }}>
                    <Text style={{ color: '#94a3b8', fontSize: 11 }}>{t.defiAcceptHint}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TextInput value={agreed.date} onChangeText={x => setAgreed(p => ({ ...p, date: x }))}
                            placeholder={t.defiDatePh} placeholderTextColor="#64748b"
                            style={{ flex: 1, color: '#fff', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12 }} />
                        <TextInput value={agreed.time} onChangeText={x => setAgreed(p => ({ ...p, time: x }))}
                            placeholder={t.defiTimePh} placeholderTextColor="#64748b"
                            style={{ width: 80, color: '#fff', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12 }} />
                    </View>
                    <TextInput value={agreed.venue} onChangeText={x => setAgreed(p => ({ ...p, venue: x }))}
                        placeholder={`${t.defiVenuePh} (${v})`} placeholderTextColor="#64748b"
                        style={{ color: '#fff', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, fontSize: 12 }} />
                    <Btn label={t.defiAcceptSend} color="#22c55e" filled disabled={busy}
                        onPress={() => act(`/challenges/${c.id}/respond`, { action: 'accept', agreed }, () => setMode(null))} />
                </View>
            )}

            {mode === 'score' && (
                <View style={{ gap: 6, marginTop: 4 }}>
                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                        <Text style={{ color: '#cbd5e1', fontSize: 11, flex: 1 }} numberOfLines={1}>{c.challengerName}</Text>
                        <Text style={{ color: '#cbd5e1', fontSize: 11, flex: 1, textAlign: 'right' }} numberOfLines={1}>{c.defenderName}</Text>
                    </View>
                    {sets.map((s, i) => (
                        <View key={i} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                            <Text style={{ color: '#64748b', fontSize: 11, width: 52 }}>{goal ? t.defiScoreLabel : `${t.defiSetLabel} ${i + 1}`}</Text>
                            <TextInput value={s.p1} keyboardType="number-pad" maxLength={3}
                                onChangeText={x => setSets(p => p.map((y, j) => (j === i ? { ...y, p1: x.replace(/\D/g, '') } : y)))}
                                style={{ flex: 1, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingVertical: 6, fontSize: 14, fontWeight: '800' }} />
                            <Text style={{ color: '#64748b' }}>–</Text>
                            <TextInput value={s.p2} keyboardType="number-pad" maxLength={3}
                                onChangeText={x => setSets(p => p.map((y, j) => (j === i ? { ...y, p2: x.replace(/\D/g, '') } : y)))}
                                style={{ flex: 1, color: '#fff', textAlign: 'center', borderWidth: 1, borderColor: '#334155', borderRadius: 8, paddingVertical: 6, fontSize: 14, fontWeight: '800' }} />
                        </View>
                    ))}
                    {!goal && (
                        <View style={{ flexDirection: 'row', gap: 6 }}>
                            {sets.length < 5 && <Btn label={`+ ${t.defiSetLabel}`} color="#38bdf8" onPress={() => setSets(p => [...p, { p1: '', p2: '' }])} />}
                            {sets.length > 1 && <Btn label={`− ${t.defiSetLabel}`} color="#94a3b8" onPress={() => setSets(p => p.slice(0, -1))} />}
                        </View>
                    )}
                    <Text style={{ color: '#64748b', fontSize: 10 }}>{t.defiAutoConfirmNote}</Text>
                    <Btn label={t.defiSubmit} filled disabled={busy} onPress={submitScore} />
                </View>
            )}
        </View>
    );
}

export default function DefiLadderModal({ visible, onClose, tournament, myId, onChanged }) {
    const t = useT();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const insets = useSafeAreaInsets();
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(false);
    const [busy, setBusy] = useState(false);
    const [tab, setTab] = useState('ladder');
    const id = tournament?.id;
    const sub = tournament?.subCategory;
    const isCreator = tournament?.creatorId === myId;

    const load = useCallback(async () => {
        if (!id) return;
        setLoading(true);
        try {
            const { data: d } = await api.get(`/defi/${id}`);
            setData(d);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setLoading(false); }
    }, [id, t]);

    useEffect(() => { if (visible) load(); }, [visible, load]);
    useEffect(() => {
        if (!visible) return undefined;
        return onSocket('tournament:defi_updated', (p) => { if (p?.tournamentId === id) load(); });
    }, [visible, id, load]);

    const errText = (e) => {
        const code = e?.response?.data?.code;
        return (code && t[`defiErr_${code}`]) || e?.response?.data?.message || t.actionFailed;
    };

    const act = async (path, body, after) => {
        setBusy(true);
        try {
            await api.post(`/defi/${id}${path}`, body);
            after?.();
            await load();
            onChanged?.();
        } catch (e) {
            Alert.alert('', errText(e));
        } finally { setBusy(false); }
    };

    const nameOf = useMemo(() => {
        const m = {};
        for (const r of data?.ladder || []) m[r.key] = r.name;
        for (const c of [...(data?.active || []), ...(data?.recent || [])]) {
            m[c.challengerKey] = m[c.challengerKey] || c.challengerName;
            m[c.defenderKey] = m[c.defenderKey] || c.defenderName;
        }
        return (k) => m[k] || '?';
    }, [data]);

    const me = data?.ladder?.find(r => r.key === data?.myKey);
    const settings = data?.settings || tournament?.formatConfig?.defi;
    const setsDefault = parseInt(tournament?.setsPerMatch, 10) || 3;

    const challenge = (row) => Alert.alert(t.defiChallengeTitle,
        t.defiChallengeConfirm.replace('{name}', row.name).replace('{rank}', String(row.rank)).replace('{h}', String(settings?.responseHours ?? 48)), [
            { text: t.cancelBtn || 'Cancel', style: 'cancel' },
            { text: t.defiChallengeBtn, onPress: () => act('/challenge', { defenderKey: row.key }, () => setTab('active')) },
        ]);

    const histText = (h) => {
        const a = nameOf(h.a), b = nameOf(h.b);
        switch (h.type) {
            case 'START': return t.defiHistStart;
            case 'END': return t.defiHistEnd;
            case 'JOIN': return t.defiHistJoin.replace('{a}', a).replace('{to}', String(h.to));
            case 'LEAVE': return t.defiHistLeave.replace('{a}', a);
            case 'DECLINE': return t.defiHistDecline.replace('{a}', a).replace('{b}', b);
            case 'INACTIVITY': return t.defiHistInactivity.replace('{a}', a).replace('{from}', String(h.from)).replace('{to}', String(h.to));
            case 'WO':
            case 'RESULT': {
                const base = !h.winner ? t.defiHistDraw.replace('{a}', a).replace('{b}', b)
                    : h.winner === h.a ? t.defiHistClimb.replace('{a}', a).replace('{b}', b).replace('{from}', String(h.from)).replace('{to}', String(h.to))
                        : t.defiHistHold.replace('{a}', a).replace('{b}', b);
                return h.type === 'WO' ? `${base} (${t.defiWO})` : base;
            }
            default: return h.type;
        }
    };

    const statusBadge = (r) => {
        if (r.status === 'in_challenge') return { label: t.defiStatusBusy, color: '#f59e0b' };
        if (r.status === 'protected') return { label: t.defiStatusProtected, color: '#38bdf8' };
        return { label: t.defiStatusAvailable, color: '#22c55e' };
    };

    const doneLabel = (c) => ({
        COMPLETED: c.winnerKey ? `🏆 ${nameOf(c.winnerKey)}` : t.defiDraw,
        FORFEIT: `🏳️ ${t.defiWO} → ${nameOf(c.winnerKey)}`,
        DEFI_DECLINED: t.defiStDeclined, DEFI_CANCELLED: t.defiStCancelled, DEFI_EXPIRED: t.defiStExpired,
    }[c.status] || c.status);

    const tabs = [
        ['ladder', t.defiTabLadder],
        ['active', `${t.defiTabActive}${data?.active?.length ? ` (${data.active.length})` : ''}`],
        ['recent', t.defiTabRecent],
        ['rules', t.defiTabRules],
    ];

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} android_keyboardInputMode="adjustNothing">
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: '#020617' }}>
                <View style={{ paddingTop: insets.top + 8, paddingHorizontal: 12, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: '#1e293b' }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flex: 1 }}>
                            <Text style={{ color: ORANGE, fontSize: 17, fontWeight: '900' }}>🪜 {t.defiTitle}</Text>
                            <Text style={{ color: '#94a3b8', fontSize: 12 }} numberOfLines={1}>{tournament?.name}</Text>
                        </View>
                        <TouchableOpacity onPress={onClose} hitSlop={12}>
                            <Text style={{ color: '#94a3b8', fontSize: 22, fontWeight: '700' }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    {data && data.status === 'IN_PROGRESS' ? (
                        <Text style={{ color: '#cbd5e1', fontSize: 12, marginTop: 6 }}>
                            {me
                                ? `${t.defiMyRank}: #${me.rank} · ${t.defiReach.replace('{n}', String(me.maxUp))} · ${t.defiDeclinesLeft}: ${me.declinesLeft}`
                                : t.defiNotInLadder}
                            {data.seasonEnd ? `\n${t.defiSeasonEnd}: ${fmtDT(data.seasonEnd, lang)}` : ''}
                        </Text>
                    ) : null}
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                        {tabs.map(([k, label]) => <Chip key={k} label={label} color={ORANGE} active={tab === k} onPress={() => setTab(k)} />)}
                    </View>
                </View>

                {!data && loading ? (
                    <ActivityIndicator color={ORANGE} style={{ marginTop: 40 }} />
                ) : (
                    <ScrollView keyboardShouldPersistTaps="handled"
                        contentContainerStyle={{ padding: 12, paddingBottom: insets.bottom + 40, gap: 8 }}
                        refreshControl={<RefreshControl refreshing={loading} onRefresh={load} tintColor={ORANGE} />}>

                        {tab === 'ladder' && (<>
                            {data?.final ? (
                                <View style={{ backgroundColor: '#facc1518', borderRadius: 12, borderWidth: 1, borderColor: '#facc1560', padding: 10 }}>
                                    <Text style={{ color: '#facc15', fontSize: 14, fontWeight: '900' }}>🏆 {t.defiChampion}: {data.final[0]?.name || '-'}</Text>
                                    <Text style={{ color: '#cbd5e1', fontSize: 11, marginTop: 2 }}>{t.defiFinalStandings}</Text>
                                </View>
                            ) : null}
                            {(data?.final || data?.ladder || []).length === 0 ? (
                                <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>{t.defiEmpty}</Text>
                            ) : null}
                            {(data?.final ? data.final : data?.ladder || []).map(r => {
                                const mine = r.key === data?.myKey;
                                const badge = data?.final ? null : statusBadge(r);
                                return (
                                    <View key={r.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: mine ? ORANGE + '18' : '#0f172a',
                                        borderRadius: 12, borderWidth: 1, borderColor: mine ? ORANGE : '#1e293b', paddingHorizontal: 10, paddingVertical: 8 }}>
                                        <Text style={{ color: r.rank <= 3 ? '#facc15' : '#e2e8f0', fontSize: 16, fontWeight: '900', width: 34 }}>
                                            {r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : `#${r.rank}`}
                                        </Text>
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }} numberOfLines={1}>
                                                {r.name}{mine ? ` ${t.defiYou}` : ''}
                                            </Text>
                                            {r.captainName ? <Text style={{ color: '#64748b', fontSize: 10 }}>{t.defiCaptain}: {r.captainName}</Text> : null}
                                            {badge ? (
                                                <Text style={{ color: badge.color, fontSize: 10, fontWeight: '800', marginTop: 1 }}>
                                                    ● {badge.label}{r.protectedUntil ? ` · ${fmtDT(r.protectedUntil, lang)}` : ''}
                                                </Text>
                                            ) : null}
                                        </View>
                                        {r.canChallenge ? <Btn label={`⚔️ ${t.defiChallengeBtn}`} filled disabled={busy} onPress={() => challenge(r)} /> : null}
                                    </View>
                                );
                            })}
                            {isCreator && data?.status === 'IN_PROGRESS' ? (
                                <View style={{ marginTop: 10, alignItems: 'flex-start' }}>
                                    <Btn label={`🏁 ${t.defiFinishSeason}`} color="#ef4444" disabled={busy}
                                        onPress={() => Alert.alert('', t.defiFinishConfirm, [
                                            { text: t.cancelBtn || 'Cancel', style: 'cancel' },
                                            { text: t.defiFinishSeason, style: 'destructive', onPress: () => act('/finish', {}) },
                                        ])} />
                                </View>
                            ) : null}
                        </>)}

                        {tab === 'active' && (<>
                            {(data?.active || []).length === 0 ? (
                                <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>{t.defiNoActive}</Text>
                            ) : null}
                            {(data?.active || []).map(c => (
                                <ChallengeCard key={c.id} c={c} data={data} myId={myId} isCreator={isCreator} sub={sub} t={t} lang={lang}
                                    busy={busy} act={act} setsDefault={setsDefault} />
                            ))}
                        </>)}

                        {tab === 'recent' && (<>
                            {(data?.recent || []).length === 0 && (data?.history || []).length === 0 ? (
                                <Text style={{ color: '#64748b', textAlign: 'center', marginTop: 20 }}>{t.defiNoRecent}</Text>
                            ) : null}
                            {(data?.recent || []).map(c => (
                                <View key={c.id} style={{ backgroundColor: '#0f172a', borderRadius: 10, borderWidth: 1, borderColor: '#1e293b', padding: 8 }}>
                                    <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '800' }}>
                                        #{c.challengerRank} {c.challengerName} ⚔️ #{c.defenderRank} {c.defenderName}
                                    </Text>
                                    <Text style={{ color: '#94a3b8', fontSize: 11, marginTop: 2 }}>
                                        {doneLabel(c)}
                                        {Array.isArray(c.score?.sets) && c.score.sets.length ? ` · ${c.score.sets.map(s => `${s.p1}-${s.p2}`).join(', ')}` : ''}
                                        {c.completedAt ? ` · ${fmtDT(c.completedAt, lang)}` : ''}
                                    </Text>
                                </View>
                            ))}
                            {(data?.history || []).length ? (
                                <Text style={{ color: ORANGE, fontSize: 12, fontWeight: '900', marginTop: 8 }}>{t.defiHistoryTitle}</Text>
                            ) : null}
                            {(data?.history || []).map((h, i) => (
                                <Text key={i} style={{ color: '#94a3b8', fontSize: 11, lineHeight: 16 }}>
                                    {fmtDT(h.at, lang)} — {histText(h)}
                                </Text>
                            ))}
                        </>)}

                        {tab === 'rules' && (
                            <View style={{ backgroundColor: '#0f172a', borderRadius: 12, borderWidth: 1, borderColor: ORANGE + '40', padding: 10 }}>
                                <Text style={{ color: ORANGE, fontSize: 13, fontWeight: '900', marginBottom: 8 }}>📋 {t.defiRulesTitle}</Text>
                                {defiRules(lang, sub, settings).map((r, i) => (
                                    <View key={i} style={{ flexDirection: 'row', gap: 4, marginBottom: 6 }}>
                                        <Text style={{ color: ORANGE, fontSize: 11, fontWeight: '900', minWidth: 18 }}>{i + 1}.</Text>
                                        <Text style={{ color: '#cbd5e1', fontSize: 12, lineHeight: 17, flex: 1 }}>{r}</Text>
                                    </View>
                                ))}
                            </View>
                        )}
                    </ScrollView>
                )}
            </KeyboardAvoidingView>
        </Modal>
    );
}

// Turnuva oluşturma formundaki defi ayarları + seçilen ayarlarla kural metni.
export function DefiSettingsForm({ value, onChange, sub, color = ORANGE }) {
    const t = useT();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const v = value || {};
    const set = (k, x) => onChange({ ...v, [k]: x });
    const isTeam = DEFI_TEAM_SUBS_UI.includes(sub);
    const Row = ({ label, k, opts }) => (
        <View style={{ marginBottom: 8 }}>
            <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '800', marginBottom: 4 }}>{label}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 5 }}>
                {opts.map(([val, lab]) => (
                    <Chip key={String(val)} label={lab} color={color} active={v[k] === val} onPress={() => set(k, val)} />
                ))}
            </View>
        </View>
    );
    return (
        <View style={{ backgroundColor: '#1e293b', borderRadius: 8, padding: 8, marginBottom: 10, borderWidth: 1, borderColor: color + '40' }}>
            <Text style={{ color, fontSize: 11, fontWeight: '900', marginBottom: 8 }}>⚙️ {t.defiSettingsTitle}</Text>
            {isTeam ? (
                <Text style={{ color: '#cbd5e1', fontSize: 11, marginBottom: 8 }}>{t.defiSetEntry}: {t.defiEntryTeam}</Text>
            ) : (
                <Row label={t.defiSetEntry} k="entry" opts={[['SINGLES', t.defiEntrySingles], ['PAIR', t.defiEntryPair]]} />
            )}
            <Row label={t.defiSetMaxUp} k="maxUp" opts={[[null, t.defiMaxUpTiered], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6']]} />
            <Row label={t.defiSetResponse} k="responseHours" opts={[[24, '24'], [48, '48'], [72, '72']]} />
            <Row label={t.defiSetPlayDays} k="playDays" opts={[[7, '7'], [10, '10'], [14, '14']]} />
            <Row label={t.defiSetDeclines} k="declinesPerSeason" opts={[[0, '0'], [1, '1'], [2, '2'], [3, '3']]} />
            <Row label={t.defiSetProtection} k="protectionDays" opts={[[0, '0'], [1, '1'], [2, '2'], [3, '3']]} />
            <Row label={t.defiSetRematch} k="rematchDays" opts={[[0, t.defiOff], [3, '3'], [7, '7'], [14, '14']]} />
            <Row label={t.defiSetInactivity} k="inactivityDays" opts={[[0, t.defiOff], [7, '7'], [14, '14'], [21, '21'], [30, '30']]} />
            <Row label={t.defiSetOrder} k="initialOrder" opts={[['ELO', t.defiOrderElo], ['RANDOM', t.defiOrderRandom]]} />
            <Text style={{ color: '#64748b', fontSize: 10, marginBottom: 8 }}>{t.defiSeasonHint}</Text>
            <Text style={{ color, fontSize: 11, fontWeight: '900', marginBottom: 6 }}>📋 {t.defiRulesTitle}</Text>
            {defiRules(lang, sub, { ...v, entry: isTeam ? 'TEAM' : v.entry }).map((r, i) => (
                <View key={i} style={{ flexDirection: 'row', gap: 3, marginBottom: 6 }}>
                    <Text style={{ color, fontSize: 11, fontWeight: '900', minWidth: 16 }}>{i + 1}.</Text>
                    <Text style={{ color: '#cbd5e1', fontSize: 11, lineHeight: 17, flex: 1 }}>{r}</Text>
                </View>
            ))}
        </View>
    );
}

// Takım sporlarında defi başvurusu: takım adı zorunlu (başvuran kaptan olur).
export function DefiTeamNameModal({ visible, onClose, onSubmit }) {
    const t = useT();
    const [name, setName] = useState('');
    useEffect(() => { if (visible) setName(''); }, [visible]);
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose} android_keyboardInputMode="adjustNothing">
            <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: '#000000aa', justifyContent: 'center', padding: 20 }}>
                <View style={{ backgroundColor: '#0f172a', borderRadius: 16, borderWidth: 1, borderColor: ORANGE + '60', padding: 16, gap: 10 }}>
                    <Text style={{ color: ORANGE, fontSize: 15, fontWeight: '900' }}>🪜 {t.defiTeamNameTitle}</Text>
                    <Text style={{ color: '#94a3b8', fontSize: 12 }}>{t.defiTeamNameMsg}</Text>
                    <TextInput value={name} onChangeText={setName} maxLength={40} autoFocus
                        placeholder={t.defiTeamNamePh} placeholderTextColor="#64748b"
                        style={{ color: '#fff', borderWidth: 1, borderColor: '#334155', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, fontSize: 14 }} />
                    <View style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 8 }}>
                        <Btn label={t.cancelBtn || 'Cancel'} color="#94a3b8" onPress={onClose} />
                        <Btn label={t.tournJoinBtn || 'Join'} filled disabled={!name.trim()} onPress={() => onSubmit(name.trim())} />
                    </View>
                </View>
            </KeyboardAvoidingView>
        </Modal>
    );
}
