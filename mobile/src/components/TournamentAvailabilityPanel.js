import { useCallback, useEffect, useState } from 'react';
import {
    View, Text, TouchableOpacity, TextInput, ActivityIndicator, Alert, ScrollView,
} from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';

const WEEKDAYS = [
    { key: 1, tr: 'Pzt', en: 'Mon', ru: 'Пн', de: 'Mo' },
    { key: 2, tr: 'Sal', en: 'Tue', ru: 'Вт', de: 'Di' },
    { key: 3, tr: 'Çar', en: 'Wed', ru: 'Ср', de: 'Mi' },
    { key: 4, tr: 'Per', en: 'Thu', ru: 'Чт', de: 'Do' },
    { key: 5, tr: 'Cum', en: 'Fri', ru: 'Пт', de: 'Fr' },
    { key: 6, tr: 'Cmt', en: 'Sat', ru: 'Сб', de: 'Sa' },
    { key: 7, tr: 'Paz', en: 'Sun', ru: 'Вс', de: 'So' },
];

function dayLabel(key, lang) {
    const d = WEEKDAYS.find(x => x.key === key);
    return d?.[lang] || d?.en || String(key);
}

function fmtDate(d) {
    if (!d) return '—';
    try {
        return new Date(d).toLocaleDateString();
    } catch {
        return String(d).slice(0, 10);
    }
}

function toInputDate(d) {
    if (!d) return '';
    try {
        return new Date(d).toISOString().slice(0, 10);
    } catch {
        return String(d).slice(0, 10);
    }
}

function AdminRoundDatesEditor({ tournamentId, round, t, onSaved }) {
    const [start, setStart] = useState(toInputDate(round?.startDate));
    const [end, setEnd] = useState(toInputDate(round?.endDate));
    const [aOpen, setAOpen] = useState(toInputDate(round?.availabilityOpenAt));
    const [aClose, setAClose] = useState(toInputDate(round?.availabilityCloseAt));
    const [busy, setBusy] = useState(false);

    useEffect(() => {
        setStart(toInputDate(round?.startDate));
        setEnd(toInputDate(round?.endDate));
        setAOpen(toInputDate(round?.availabilityOpenAt));
        setAClose(toInputDate(round?.availabilityCloseAt));
    }, [round?.id, round?.startDate, round?.endDate, round?.availabilityOpenAt, round?.availabilityCloseAt]);

    const save = async () => {
        setBusy(true);
        try {
            await api.patch(`/tournaments/${tournamentId}/rounds/${round.id}`, {
                startDate: start || undefined,
                endDate: end || undefined,
                availabilityOpenAt: aOpen || undefined,
                availabilityCloseAt: aClose || undefined,
            });
            await onSaved?.();
            Alert.alert('', t.tournAvailDatesSaved || 'Tur tarihleri güncellendi');
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed || 'Hata');
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={{ marginBottom: 10, padding: 8, backgroundColor: '#0f172a', borderRadius: 8, borderWidth: 1, borderColor: '#334155' }}>
            <Text style={{ color: '#94a3b8', fontSize: 10, fontWeight: '800', marginBottom: 6 }}>
                {t.tournAvailEditDates || 'Tur tarihlerini düzenle (YYYY-MM-DD)'}
            </Text>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                <TextInput value={start} onChangeText={setStart} placeholder="start" placeholderTextColor="#64748b" style={{ flex: 1, backgroundColor: '#1e293b', color: '#fff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 11, borderWidth: 1, borderColor: '#334155' }} />
                <TextInput value={end} onChangeText={setEnd} placeholder="end" placeholderTextColor="#64748b" style={{ flex: 1, backgroundColor: '#1e293b', color: '#fff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 11, borderWidth: 1, borderColor: '#334155' }} />
            </View>
            <View style={{ flexDirection: 'row', gap: 6, marginBottom: 6 }}>
                <TextInput value={aOpen} onChangeText={setAOpen} placeholder="avail open" placeholderTextColor="#64748b" style={{ flex: 1, backgroundColor: '#1e293b', color: '#fff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 11, borderWidth: 1, borderColor: '#334155' }} />
                <TextInput value={aClose} onChangeText={setAClose} placeholder="avail close" placeholderTextColor="#64748b" style={{ flex: 1, backgroundColor: '#1e293b', color: '#fff', borderRadius: 6, paddingHorizontal: 8, paddingVertical: 6, fontSize: 11, borderWidth: 1, borderColor: '#334155' }} />
            </View>
            <TouchableOpacity disabled={busy} onPress={save} style={{ alignItems: 'center', paddingVertical: 7, borderRadius: 6, backgroundColor: '#334155' }}>
                {busy ? <ActivityIndicator color="#fff" /> : (
                    <Text style={{ color: '#e2e8f0', fontWeight: '800', fontSize: 11 }}>{t.save || 'Kaydet'}</Text>
                )}
            </TouchableOpacity>
        </View>
    );
}

/**
 * Müsaitliğe göre eşleştirme paneli: turlar, müsaitlik girişi, admin üret/onay.
 */
export default function TournamentAvailabilityPanel({
    tournament,
    t,
    lang = 'tr',
    accent = '#38bdf8',
    isCreator,
    myIsAdmin,
    onRefresh,
}) {
    const [rounds, setRounds] = useState([]);
    const [loading, setLoading] = useState(false);
    const [activeRoundId, setActiveRoundId] = useState(null);
    const [maxMatches, setMaxMatches] = useState(1);
    const [slots, setSlots] = useState([]);
    const [saving, setSaving] = useState(false);
    const [proposed, setProposed] = useState([]);
    const [adminBusy, setAdminBusy] = useState(false);

    const canAdmin = isCreator || myIsAdmin;

    const load = useCallback(async () => {
        if (!tournament?.id) return;
        setLoading(true);
        try {
            const { data } = await api.get(`/tournaments/${tournament.id}/rounds`);
            const list = data.rounds || [];
            setRounds(list);
            setActiveRoundId(prev => {
                if (prev && list.some(r => r.id === prev)) return prev;
                const open = list.find(r => r.status === 'AVAIL_OPEN' || r.status === 'PENDING_APPROVAL' || r.status === 'ACTIVE');
                return open?.id || list[0]?.id || null;
            });
        } catch {
            setRounds([]);
        } finally {
            setLoading(false);
        }
    }, [tournament?.id]);

    useEffect(() => { load(); }, [load]);

    const active = rounds.find(r => r.id === activeRoundId) || null;

    useEffect(() => {
        if (!active) {
            setSlots([]);
            setMaxMatches(1);
            setProposed([]);
            return;
        }
        const mine = active.myAvailability;
        if (mine) {
            setMaxMatches(mine.maxMatches || 1);
            const raw = Array.isArray(mine.slots) ? mine.slots : [];
            // weekday'e çevir (tarihten)
            setSlots(raw.map(s => {
                if (s.weekday) return { weekday: s.weekday, timeFrom: s.timeFrom, timeTo: s.timeTo };
                if (s.date) {
                    const dt = new Date(s.date + 'T12:00:00');
                    const js = dt.getDay();
                    const iso = js === 0 ? 7 : js;
                    return { weekday: iso, timeFrom: s.timeFrom, timeTo: s.timeTo, date: s.date };
                }
                return s;
            }));
        } else {
            setSlots([]);
            setMaxMatches(1);
        }
        setProposed(Array.isArray(active.proposedMatches) ? active.proposedMatches : []);
    }, [active?.id, active?.myAvailability, active?.proposedMatches]);

    const toggleWeekday = (weekday) => {
        setSlots(prev => {
            const exists = prev.some(s => s.weekday === weekday);
            if (exists) return prev.filter(s => s.weekday !== weekday);
            return [...prev, { weekday, timeFrom: '09:00', timeTo: '21:00' }];
        });
    };

    const updateSlotTime = (weekday, field, value) => {
        setSlots(prev => prev.map(s => s.weekday === weekday ? { ...s, [field]: value } : s));
    };

    const saveMyAvailability = async () => {
        if (!active) return;
        setSaving(true);
        try {
            await api.put(`/tournaments/${tournament.id}/rounds/${active.id}/availability`, {
                maxMatches,
                slots: slots.map(s => ({
                    weekday: s.weekday,
                    date: s.date,
                    timeFrom: s.timeFrom,
                    timeTo: s.timeTo,
                })),
            });
            Alert.alert('', t.tournAvailSaved || 'Müsaitlik kaydedildi');
            await load();
            onRefresh?.();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed || 'Hata');
        } finally {
            setSaving(false);
        }
    };

    const confirmDupThen = (err, retryFn) => {
        const data = err?.response?.data;
        if (err?.response?.status === 409 && data?.warning) {
            Alert.alert(
                t.tournAvailDupTitle || 'Uyarı',
                data.message || (t.tournAvailDupBody || 'Aynı eşleştirme tekrarlanıyor. Devam edilsin mi?'),
                [
                    { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
                    {
                        text: t.yesBtn || 'Evet',
                        style: 'destructive',
                        onPress: () => retryFn(true),
                    },
                ],
            );
            return true;
        }
        return false;
    };

    const generateMatching = async (confirmDuplicate = false) => {
        if (!active) return;
        setAdminBusy(true);
        try {
            const { data } = await api.post(
                `/tournaments/${tournament.id}/rounds/${active.id}/generate-matching`,
                { confirmDuplicate },
            );
            setProposed(data.proposed || []);
            await load();
            Alert.alert('', t.tournAvailGenerated || 'Eşleştirme taslağı üretildi');
        } catch (e) {
            if (!confirmDupThen(e, generateMatching)) {
                Alert.alert('', e?.response?.data?.message || t.actionFailed || 'Hata');
            }
        } finally {
            setAdminBusy(false);
        }
    };

    const approveMatching = async (confirmDuplicate = false) => {
        if (!active) return;
        setAdminBusy(true);
        try {
            const { data } = await api.post(
                `/tournaments/${tournament.id}/rounds/${active.id}/approve-matching`,
                { confirmDuplicate },
            );
            Alert.alert('', (t.tournAvailApproved || 'Eşleştirmeler onaylandı') + ` (${data.created || 0})`);
            await load();
            onRefresh?.();
        } catch (e) {
            if (!confirmDupThen(e, approveMatching)) {
                Alert.alert('', e?.response?.data?.message || t.actionFailed || 'Hata');
            }
        } finally {
            setAdminBusy(false);
        }
    };

    const removeProposed = async (idx) => {
        if (!active) return;
        const next = proposed.filter((_, i) => i !== idx);
        setAdminBusy(true);
        try {
            await api.put(`/tournaments/${tournament.id}/rounds/${active.id}/proposed-matches`, {
                proposedMatches: next,
                confirmDuplicate: true,
            });
            setProposed(next);
            await load();
        } catch (e) {
            if (!confirmDupThen(e, async (c) => {
                await api.put(`/tournaments/${tournament.id}/rounds/${active.id}/proposed-matches`, {
                    proposedMatches: next,
                    confirmDuplicate: c,
                });
                setProposed(next);
                await load();
            })) {
                Alert.alert('', e?.response?.data?.message || t.actionFailed || 'Hata');
            }
        } finally {
            setAdminBusy(false);
        }
    };

    if (!tournament?.availabilityMatchEnabled) return null;

    if (loading && !rounds.length) {
        return (
            <View style={{ padding: 16, alignItems: 'center' }}>
                <ActivityIndicator color={accent} />
            </View>
        );
    }

    if (!rounds.length) {
        return (
            <View style={{ padding: 12, backgroundColor: '#1e293b', borderRadius: 10, marginBottom: 10, borderWidth: 1, borderColor: '#334155' }}>
                <Text style={{ color: '#94a3b8', fontSize: 12 }}>
                    {t.tournAvailWaitingStart || 'Turnuva başlayınca haftalık turlar ve müsaitlik girişi açılır.'}
                </Text>
            </View>
        );
    }

    return (
        <View style={{ marginBottom: 12 }}>
            <Text style={{ color: accent, fontWeight: '900', fontSize: 13, marginBottom: 8 }}>
                {t.tournAvailTitle || 'Müsaitliğe göre eşleştir'}
            </Text>

            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                {rounds.map(r => {
                    const sel = r.id === activeRoundId;
                    return (
                        <TouchableOpacity
                            key={r.id}
                            onPress={() => setActiveRoundId(r.id)}
                            style={{
                                paddingHorizontal: 12,
                                paddingVertical: 8,
                                borderRadius: 10,
                                marginRight: 6,
                                backgroundColor: sel ? accent + '30' : '#1e293b',
                                borderWidth: 1,
                                borderColor: sel ? accent : '#334155',
                            }}
                        >
                            <Text style={{ color: sel ? accent : '#94a3b8', fontWeight: '800', fontSize: 12 }}>
                                {t.tournAvailRound || 'Tur'} {r.roundIndex}
                            </Text>
                            <Text style={{ color: '#64748b', fontSize: 10 }}>{r.status}</Text>
                        </TouchableOpacity>
                    );
                })}
            </ScrollView>

            {active && (
                <View style={{ backgroundColor: '#1e293b', borderRadius: 10, padding: 10, borderWidth: 1, borderColor: '#334155' }}>
                    <Text style={{ color: '#cbd5e1', fontSize: 11, marginBottom: 4 }}>
                        {(t.tournAvailPlayWindow || 'Oyun')}: {fmtDate(active.startDate)} – {fmtDate(active.endDate)}
                    </Text>
                    <Text style={{ color: '#94a3b8', fontSize: 11, marginBottom: 10 }}>
                        {(t.tournAvailWindow || 'Müsaitlik')}: {fmtDate(active.availabilityOpenAt)} – {fmtDate(active.availabilityCloseAt)}
                        {new Date(active.endDate) > new Date() ? ` · ${t.tournAvailMidWeekOk || 'Hafta içinde de güncelleyebilirsiniz'}` : ''}
                    </Text>
                    {canAdmin && (
                        <AdminRoundDatesEditor
                            tournamentId={tournament.id}
                            round={active}
                            t={t}
                            onSaved={load}
                        />
                    )}

                    {/* Oyuncu müsaitlik */}
                    <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>
                        {t.tournAvailMySlots || 'Müsait gün / saat'}
                    </Text>
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                        {WEEKDAYS.map(d => {
                            const on = slots.some(s => s.weekday === d.key);
                            return (
                                <TouchableOpacity
                                    key={d.key}
                                    onPress={() => toggleWeekday(d.key)}
                                    style={{
                                        paddingHorizontal: 10,
                                        paddingVertical: 6,
                                        borderRadius: 8,
                                        backgroundColor: on ? accent : '#0f172a',
                                        borderWidth: 1,
                                        borderColor: on ? accent : '#334155',
                                    }}
                                >
                                    <Text style={{ color: on ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: '700' }}>
                                        {dayLabel(d.key, lang)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>
                    {slots.map(s => (
                        <View key={s.weekday} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                            <Text style={{ color: '#94a3b8', width: 36, fontSize: 11, fontWeight: '700' }}>
                                {dayLabel(s.weekday, lang)}
                            </Text>
                            <TextInput
                                value={s.timeFrom}
                                onChangeText={v => updateSlotTime(s.weekday, 'timeFrom', v)}
                                placeholder="09:00"
                                placeholderTextColor="#64748b"
                                style={{ flex: 1, backgroundColor: '#0f172a', color: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#334155', fontSize: 12 }}
                            />
                            <TextInput
                                value={s.timeTo}
                                onChangeText={v => updateSlotTime(s.weekday, 'timeTo', v)}
                                placeholder="21:00"
                                placeholderTextColor="#64748b"
                                style={{ flex: 1, backgroundColor: '#0f172a', color: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#334155', fontSize: 12 }}
                            />
                        </View>
                    ))}

                    <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '800', marginBottom: 6, marginTop: 4 }}>
                        {t.tournAvailMaxMatches || 'Bu turda kaç maç yapabilirim?'}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                        {[1, 2, 3, 4, 5].map(n => (
                            <TouchableOpacity
                                key={n}
                                onPress={() => setMaxMatches(n)}
                                style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 8,
                                    alignItems: 'center',
                                    justifyContent: 'center',
                                    backgroundColor: maxMatches === n ? accent + '40' : '#0f172a',
                                    borderWidth: 1,
                                    borderColor: maxMatches === n ? accent : '#334155',
                                }}
                            >
                                <Text style={{ color: maxMatches === n ? accent : '#94a3b8', fontWeight: '800' }}>{n}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <TouchableOpacity
                        disabled={saving}
                        onPress={saveMyAvailability}
                        style={{
                            backgroundColor: accent + '25',
                            borderWidth: 1,
                            borderColor: accent + '60',
                            borderRadius: 10,
                            paddingVertical: 10,
                            alignItems: 'center',
                            marginBottom: 12,
                            opacity: saving ? 0.6 : 1,
                        }}
                    >
                        {saving ? <ActivityIndicator color={accent} /> : (
                            <Text style={{ color: accent, fontWeight: '800', fontSize: 13 }}>
                                {t.tournAvailSave || 'Müsaitliği Kaydet'}
                            </Text>
                        )}
                    </TouchableOpacity>

                    {canAdmin && (
                        <>
                            <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>
                                {t.tournAvailAdmin || 'Admin eşleştirme'}
                            </Text>
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                                <TouchableOpacity
                                    disabled={adminBusy}
                                    onPress={() => generateMatching(false)}
                                    style={{ flexGrow: 1, backgroundColor: '#7c3aed25', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#7c3aed60', alignItems: 'center' }}
                                >
                                    <Text style={{ color: '#c4b5fd', fontWeight: '800', fontSize: 12 }}>
                                        {t.tournAvailGenerate || 'Eşleştirme üret'}
                                    </Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    disabled={adminBusy || !proposed.length}
                                    onPress={() => approveMatching(false)}
                                    style={{ flexGrow: 1, backgroundColor: '#16a34a25', borderRadius: 10, paddingVertical: 10, borderWidth: 1, borderColor: '#16a34a60', alignItems: 'center', opacity: proposed.length ? 1 : 0.5 }}
                                >
                                    <Text style={{ color: '#4ade80', fontWeight: '800', fontSize: 12 }}>
                                        {t.tournAvailApprove || 'Onayla'}
                                    </Text>
                                </TouchableOpacity>
                            </View>
                            {proposed.length === 0 ? (
                                <Text style={{ color: '#64748b', fontSize: 11 }}>{t.tournAvailNoDraft || 'Henüz taslak yok'}</Text>
                            ) : (
                                proposed.map((p, idx) => (
                                    <View
                                        key={`${p.p1Id}-${p.p2Id}-${idx}`}
                                        style={{
                                            flexDirection: 'row',
                                            alignItems: 'center',
                                            backgroundColor: '#0f172a',
                                            borderRadius: 8,
                                            padding: 8,
                                            marginBottom: 6,
                                            borderWidth: 1,
                                            borderColor: '#334155',
                                        }}
                                    >
                                        <View style={{ flex: 1 }}>
                                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                                                {p.p1Name} vs {p.p2Name}
                                            </Text>
                                            <Text style={{ color: '#94a3b8', fontSize: 10 }}>
                                                {p.slot ? `${p.slot.date} ${p.slot.timeFrom}-${p.slot.timeTo}` : '—'}
                                                {p.neverPlayed === false ? ` · ${t.tournAvailRematch || 'Daha önce oynadılar'}` : ''}
                                            </Text>
                                        </View>
                                        <TouchableOpacity onPress={() => removeProposed(idx)} hitSlop={8}>
                                            <Text style={{ color: '#f87171', fontWeight: '800' }}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                ))
                            )}
                        </>
                    )}
                </View>
            )}
        </View>
    );
}
