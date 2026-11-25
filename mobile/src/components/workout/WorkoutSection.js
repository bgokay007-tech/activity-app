import { useCallback, useEffect, useMemo, useState } from 'react';
import {
    View, Text, TouchableOpacity, TextInput, ActivityIndicator,
    Alert, StyleSheet, ScrollView,
} from 'react-native';
import { useSelector } from 'react-redux';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import KeyboardAwareForm from '../KeyboardAwareForm';
import KeyboardSafeModal from '../KeyboardSafeModal';

const SCHEMES = ['STRAIGHT', 'DROP', 'PYRAMID', 'SUPERSET', 'CIRCUIT'];
const PERIODS = ['DAILY', 'WEEKLY', 'MONTHLY'];
const WEEK_DAYS = [0, 1, 2, 3, 4, 5, 6];

function emptyExercise(i = 0) {
    return {
        name: '',
        setScheme: 'STRAIGHT',
        targetSets: '3',
        targetReps: '10',
        targetWeight: '',
        restSeconds: '90',
        dayIndex: '',
        notes: '',
        _key: `ex_${Date.now()}_${i}`,
    };
}

function schemeLabel(scheme, t) {
    const map = {
        STRAIGHT: t.woSchemeStraight,
        DROP: t.woSchemeDrop,
        PYRAMID: t.woSchemePyramid,
        SUPERSET: t.woSchemeSuperset,
        CIRCUIT: t.woSchemeCircuit,
    };
    return map[scheme] || scheme;
}

function periodLabel(period, t) {
    if (period === 'DAILY') return t.woPeriodDaily;
    if (period === 'WEEKLY') return t.woPeriodWeekly;
    if (period === 'MONTHLY') return t.woPeriodMonthly;
    return period;
}

function dayLabel(dayIndex, period, t) {
    if (dayIndex == null || dayIndex === '') return null;
    if (period === 'WEEKLY') {
        const keys = ['woDaySun', 'woDayMon', 'woDayTue', 'woDayWed', 'woDayThu', 'woDayFri', 'woDaySat'];
        return t[keys[dayIndex]] || String(dayIndex);
    }
    if (period === 'MONTHLY') return t.woDayOfMonth?.replace('{{n}}', String(dayIndex)) || String(dayIndex);
    return null;
}

export default function WorkoutSection({
    cfg,
    hideCreateButton = false,
    createOpenTick = 0,
    onCountChange,
}) {
    const t = useT();
    const myId = useSelector((s) => s.auth.user?.id);
    const [plans, setPlans] = useState([]);
    const [loading, setLoading] = useState(false);
    const [showCreate, setShowCreate] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [title, setTitle] = useState('');
    const [period, setPeriod] = useState('WEEKLY');
    const [notes, setNotes] = useState('');
    const [exercises, setExercises] = useState([emptyExercise(0)]);
    const [assignStudentId, setAssignStudentId] = useState(null);
    const [assignCoachListingId, setAssignCoachListingId] = useState(null);
    const [students, setStudents] = useState([]);
    const [detail, setDetail] = useState(null);
    const [session, setSession] = useState(null);
    const [sessionBusy, setSessionBusy] = useState(false);
    const [setDrafts, setSetDrafts] = useState({}); // `${exId}:${setIndex}` → {reps, weightKg}

    const load = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/workouts/plans');
            const list = Array.isArray(data) ? data : [];
            setPlans(list);
            onCountChange?.(list.length);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally {
            setLoading(false);
        }
    }, [onCountChange, t.actionFailed, t.error]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        if (createOpenTick > 0) openCreate();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [createOpenTick]);

    const openCreate = async () => {
        setTitle('');
        setPeriod('WEEKLY');
        setNotes('');
        setExercises([emptyExercise(0)]);
        setAssignStudentId(null);
        setAssignCoachListingId(null);
        try {
            const { data } = await api.get('/workouts/coach-students');
            setStudents(Array.isArray(data) ? data : []);
        } catch {
            setStudents([]);
        }
        setShowCreate(true);
    };

    const updateEx = (key, patch) => {
        setExercises((prev) => prev.map((ex) => (ex._key === key ? { ...ex, ...patch } : ex)));
    };

    const submitPlan = async () => {
        if (!title.trim()) {
            Alert.alert(t.error, t.woTitleRequired);
            return;
        }
        const cleaned = exercises
            .map((ex, i) => ({
                name: ex.name.trim(),
                setScheme: ex.setScheme,
                targetSets: ex.targetSets ? parseInt(ex.targetSets, 10) : null,
                targetReps: ex.targetReps.trim() || null,
                targetWeight: ex.targetWeight ? Number(ex.targetWeight) : null,
                restSeconds: ex.restSeconds ? parseInt(ex.restSeconds, 10) : null,
                dayIndex: period === 'DAILY' || ex.dayIndex === '' ? null : parseInt(ex.dayIndex, 10),
                notes: ex.notes.trim() || null,
                sortOrder: i,
            }))
            .filter((ex) => ex.name);
        if (!cleaned.length) {
            Alert.alert(t.error, t.woExerciseRequired);
            return;
        }
        setSubmitting(true);
        try {
            await api.post('/workouts/plans', {
                title: title.trim(),
                period,
                notes: notes.trim() || null,
                exercises: cleaned,
                ...(assignStudentId ? { userId: assignStudentId, coachListingId: assignCoachListingId } : {}),
            });
            setShowCreate(false);
            await load();
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally {
            setSubmitting(false);
        }
    };

    const openDetail = async (plan) => {
        setDetail(plan);
        setSession(null);
        setSetDrafts({});
        setSessionBusy(true);
        try {
            const { data } = await api.post(`/workouts/plans/${plan.id}/session`, {
                date: new Date().toISOString().slice(0, 10),
            });
            setSession(data.session);
            setDetail(data.plan || plan);
            const drafts = {};
            (data.session?.setLogs || []).forEach((log) => {
                drafts[`${log.exerciseId}:${log.setIndex}:${log.dropIndex || 0}`] = {
                    reps: log.reps != null ? String(log.reps) : '',
                    weightKg: log.weightKg != null ? String(log.weightKg) : '',
                };
            });
            setSetDrafts(drafts);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally {
            setSessionBusy(false);
        }
    };

    const saveSet = async (exerciseId, setIndex, dropIndex = 0) => {
        if (!session?.id) return;
        const key = `${exerciseId}:${setIndex}:${dropIndex}`;
        const draft = setDrafts[key] || {};
        try {
            const { data } = await api.post(`/workouts/sessions/${session.id}/sets`, {
                exerciseId,
                setIndex,
                dropIndex,
                reps: draft.reps !== '' ? draft.reps : null,
                weightKg: draft.weightKg !== '' ? draft.weightKg : null,
            });
            setSession((prev) => {
                if (!prev) return prev;
                const rest = (prev.setLogs || []).filter(
                    (l) => !(l.exerciseId === exerciseId && l.setIndex === setIndex && (l.dropIndex || 0) === dropIndex),
                );
                return { ...prev, setLogs: [...rest, data] };
            });
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        }
    };

    const markComplete = async () => {
        if (!session?.id) return;
        try {
            const { data } = await api.patch(`/workouts/sessions/${session.id}/complete`, {});
            setSession(data);
            Alert.alert('', t.woSessionDone);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        }
    };

    const deletePlan = (plan) => {
        Alert.alert(t.woDeleteTitle, t.woDeleteMsg, [
            { text: t.cancel, style: 'cancel' },
            {
                text: t.delete || 'Delete',
                style: 'destructive',
                onPress: async () => {
                    try {
                        await api.delete(`/workouts/plans/${plan.id}`);
                        setDetail(null);
                        await load();
                    } catch (e) {
                        Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
                    }
                },
            },
        ]);
    };

    const accent = cfg?.color || '#f97316';
    const visiblePlans = useMemo(() => plans, [plans]);

    return (
        <View>
            {!hideCreateButton && (
                <TouchableOpacity
                    onPress={openCreate}
                    style={[s.createBtn, { borderColor: accent + '60' }]}
                >
                    <Text style={[s.createBtnText, { color: accent }]}>{t.woCreatePlan}</Text>
                </TouchableOpacity>
            )}

            {loading && !visiblePlans.length ? (
                <ActivityIndicator color={accent} style={{ marginVertical: 16 }} />
            ) : null}

            {!loading && !visiblePlans.length ? (
                <Text style={s.empty}>{t.woEmpty}</Text>
            ) : null}

            {visiblePlans.map((p) => (
                <TouchableOpacity
                    key={p.id}
                    onPress={() => openDetail(p)}
                    style={s.card}
                    activeOpacity={0.85}
                >
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardTitle} numberOfLines={1}>{p.title}</Text>
                        <Text style={s.cardMeta}>
                            {periodLabel(p.period, t)}
                            {' · '}
                            {(p.exercises?.length ?? p.exerciseCount ?? 0)} {t.woExercisesShort}
                            {p.authorId !== myId && p.author
                                ? ` · ${t.woFromCoach}: ${p.author.fullName || p.author.username}`
                                : ''}
                        </Text>
                    </View>
                    <Text style={{ color: colors.textMuted, fontSize: 18 }}>›</Text>
                </TouchableOpacity>
            ))}

            {/* Plan oluştur */}
            <KeyboardSafeModal visible={showCreate} onClose={() => setShowCreate(false)}>
                <View style={s.sheet}>
                    <View style={s.sheetHead}>
                        <Text style={s.sheetTitle}>{t.woCreatePlan}</Text>
                        <TouchableOpacity onPress={() => setShowCreate(false)}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>
                    <KeyboardAwareForm adjustWindow={false} contentContainerStyle={{ paddingBottom: 28 }}>
                        <Text style={s.label}>{t.woTitle}</Text>
                        <TextInput style={s.input} value={title} onChangeText={setTitle} placeholderTextColor={colors.textMuted} placeholder={t.woTitlePh} />

                        <Text style={s.label}>{t.woPeriod}</Text>
                        <View style={s.rowWrap}>
                            {PERIODS.map((per) => (
                                <TouchableOpacity
                                    key={per}
                                    onPress={() => setPeriod(per)}
                                    style={[s.chip, period === per && { backgroundColor: accent, borderColor: accent }]}
                                >
                                    <Text style={[s.chipText, period === per && { color: '#fff' }]}>{periodLabel(per, t)}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {students.length > 0 && (
                            <>
                                <Text style={s.label}>{t.woAssignTo}</Text>
                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 10 }}>
                                    <TouchableOpacity
                                        onPress={() => { setAssignStudentId(null); setAssignCoachListingId(null); }}
                                        style={[s.chip, !assignStudentId && { backgroundColor: accent, borderColor: accent }]}
                                    >
                                        <Text style={[s.chipText, !assignStudentId && { color: '#fff' }]}>{t.woAssignSelf}</Text>
                                    </TouchableOpacity>
                                    {students.map((sItem) => {
                                        const sid = sItem.student?.id;
                                        const selected = assignStudentId === sid;
                                        return (
                                            <TouchableOpacity
                                                key={sid}
                                                onPress={() => {
                                                    setAssignStudentId(sid);
                                                    setAssignCoachListingId(sItem.coachListingId);
                                                }}
                                                style={[s.chip, selected && { backgroundColor: accent, borderColor: accent }]}
                                            >
                                                <Text style={[s.chipText, selected && { color: '#fff' }]} numberOfLines={1}>
                                                    {sItem.student?.fullName || sItem.student?.username}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </ScrollView>
                            </>
                        )}

                        <Text style={s.label}>{t.woNotes}</Text>
                        <TextInput
                            style={[s.input, { height: 64, textAlignVertical: 'top' }]}
                            value={notes}
                            onChangeText={setNotes}
                            multiline
                            placeholderTextColor={colors.textMuted}
                            placeholder={t.woNotesPh}
                        />

                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8, marginBottom: 6 }}>
                            <Text style={[s.label, { marginBottom: 0 }]}>{t.woExercises}</Text>
                            <TouchableOpacity onPress={() => setExercises((prev) => [...prev, emptyExercise(prev.length)])}>
                                <Text style={{ color: accent, fontWeight: '800', fontSize: 13 }}>{t.woAddExercise}</Text>
                            </TouchableOpacity>
                        </View>

                        {exercises.map((ex, idx) => (
                            <View key={ex._key} style={s.exBox}>
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                                    <Text style={s.exHead}>{t.woExerciseN.replace('{{n}}', String(idx + 1))}</Text>
                                    {exercises.length > 1 && (
                                        <TouchableOpacity onPress={() => setExercises((prev) => prev.filter((x) => x._key !== ex._key))}>
                                            <Text style={{ color: '#f87171', fontWeight: '700' }}>✕</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                                <TextInput
                                    style={s.input}
                                    value={ex.name}
                                    onChangeText={(v) => updateEx(ex._key, { name: v })}
                                    placeholder={t.woExerciseNamePh}
                                    placeholderTextColor={colors.textMuted}
                                />
                                <Text style={s.miniLabel}>{t.woScheme}</Text>
                                <View style={s.rowWrap}>
                                    {SCHEMES.map((sch) => (
                                        <TouchableOpacity
                                            key={sch}
                                            onPress={() => updateEx(ex._key, { setScheme: sch })}
                                            style={[s.chipSm, ex.setScheme === sch && { backgroundColor: accent, borderColor: accent }]}
                                        >
                                            <Text style={[s.chipSmText, ex.setScheme === sch && { color: '#fff' }]}>{schemeLabel(sch, t)}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.miniLabel}>{t.woSets}</Text>
                                        <TextInput style={s.input} value={ex.targetSets} onChangeText={(v) => updateEx(ex._key, { targetSets: v })} keyboardType="number-pad" placeholderTextColor={colors.textMuted} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.miniLabel}>{t.woReps}</Text>
                                        <TextInput style={s.input} value={ex.targetReps} onChangeText={(v) => updateEx(ex._key, { targetReps: v })} placeholder="8-12" placeholderTextColor={colors.textMuted} />
                                    </View>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.miniLabel}>{t.woWeightKg}</Text>
                                        <TextInput style={s.input} value={ex.targetWeight} onChangeText={(v) => updateEx(ex._key, { targetWeight: v })} keyboardType="decimal-pad" placeholderTextColor={colors.textMuted} />
                                    </View>
                                </View>
                                {period !== 'DAILY' && (
                                    <>
                                        <Text style={s.miniLabel}>{period === 'WEEKLY' ? t.woWeekDay : t.woMonthDay}</Text>
                                        {period === 'WEEKLY' ? (
                                            <View style={s.rowWrap}>
                                                {WEEK_DAYS.map((d) => (
                                                    <TouchableOpacity
                                                        key={d}
                                                        onPress={() => updateEx(ex._key, { dayIndex: String(d) })}
                                                        style={[s.chipSm, String(ex.dayIndex) === String(d) && { backgroundColor: accent, borderColor: accent }]}
                                                    >
                                                        <Text style={[s.chipSmText, String(ex.dayIndex) === String(d) && { color: '#fff' }]}>{dayLabel(d, 'WEEKLY', t)}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        ) : (
                                            <TextInput
                                                style={s.input}
                                                value={ex.dayIndex}
                                                onChangeText={(v) => updateEx(ex._key, { dayIndex: v })}
                                                keyboardType="number-pad"
                                                placeholder="1-31"
                                                placeholderTextColor={colors.textMuted}
                                            />
                                        )}
                                    </>
                                )}
                            </View>
                        ))}

                        <TouchableOpacity
                            onPress={submitPlan}
                            disabled={submitting}
                            style={[s.submitBtn, { backgroundColor: accent }]}
                        >
                            {submitting ? <ActivityIndicator color="#fff" /> : <Text style={s.submitText}>{t.woSavePlan}</Text>}
                        </TouchableOpacity>
                    </KeyboardAwareForm>
                </View>
            </KeyboardSafeModal>

            {/* Plan detay + bugünün set girişi */}
            <KeyboardSafeModal visible={!!detail} onClose={() => setDetail(null)}>
                <View style={s.sheet}>
                    <View style={s.sheetHead}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                            <Text style={s.sheetTitle} numberOfLines={1}>{detail?.title}</Text>
                            <Text style={s.cardMeta}>{periodLabel(detail?.period, t)}</Text>
                        </View>
                        <TouchableOpacity onPress={() => setDetail(null)}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>
                    <KeyboardAwareForm adjustWindow={false} contentContainerStyle={{ paddingBottom: 28 }}>
                        {sessionBusy ? <ActivityIndicator color={accent} style={{ marginVertical: 20 }} /> : null}
                        {(detail?.exercises || []).map((ex) => {
                            const sets = Math.max(1, ex.targetSets || 3);
                            const dayTxt = dayLabel(ex.dayIndex, detail.period, t);
                            return (
                                <View key={ex.id} style={s.exBox}>
                                    <Text style={s.exHead}>{ex.name}</Text>
                                    <Text style={s.cardMeta}>
                                        {schemeLabel(ex.setScheme, t)}
                                        {ex.targetSets != null ? ` · ${ex.targetSets}×${ex.targetReps || '?'}` : ''}
                                        {ex.targetWeight != null ? ` · ${ex.targetWeight} kg` : ''}
                                        {dayTxt ? ` · ${dayTxt}` : ''}
                                    </Text>
                                    {Array.from({ length: sets }).map((_, si) => {
                                        const key = `${ex.id}:${si}:0`;
                                        const draft = setDrafts[key] || { reps: '', weightKg: '' };
                                        return (
                                            <View key={key} style={s.setRow}>
                                                <Text style={s.setIdx}>{t.woSetN.replace('{{n}}', String(si + 1))}</Text>
                                                <TextInput
                                                    style={[s.input, s.setInput]}
                                                    value={draft.reps}
                                                    onChangeText={(v) => setSetDrafts((prev) => ({ ...prev, [key]: { ...draft, reps: v } }))}
                                                    onBlur={() => saveSet(ex.id, si, 0)}
                                                    keyboardType="number-pad"
                                                    placeholder={t.woReps}
                                                    placeholderTextColor={colors.textMuted}
                                                />
                                                <TextInput
                                                    style={[s.input, s.setInput]}
                                                    value={draft.weightKg}
                                                    onChangeText={(v) => setSetDrafts((prev) => ({ ...prev, [key]: { ...draft, weightKg: v } }))}
                                                    onBlur={() => saveSet(ex.id, si, 0)}
                                                    keyboardType="decimal-pad"
                                                    placeholder={t.woWeightKg}
                                                    placeholderTextColor={colors.textMuted}
                                                />
                                            </View>
                                        );
                                    })}
                                    {ex.setScheme === 'DROP' && (
                                        <Text style={[s.cardMeta, { marginTop: 4 }]}>{t.woDropHint}</Text>
                                    )}
                                    {ex.setScheme === 'PYRAMID' && (
                                        <Text style={[s.cardMeta, { marginTop: 4 }]}>{t.woPyramidHint}</Text>
                                    )}
                                </View>
                            );
                        })}

                        <TouchableOpacity
                            onPress={markComplete}
                            disabled={!session || session.completed}
                            style={[s.submitBtn, { backgroundColor: session?.completed ? '#16a34a' : accent, opacity: session ? 1 : 0.5 }]}
                        >
                            <Text style={s.submitText}>{session?.completed ? t.woSessionDone : t.woMarkDone}</Text>
                        </TouchableOpacity>

                        {(detail?.authorId === myId || detail?.userId === myId) && (
                            <TouchableOpacity onPress={() => deletePlan(detail)} style={{ alignItems: 'center', marginTop: 12 }}>
                                <Text style={{ color: '#f87171', fontWeight: '700' }}>{t.woDeletePlan}</Text>
                            </TouchableOpacity>
                        )}
                    </KeyboardAwareForm>
                </View>
            </KeyboardSafeModal>
        </View>
    );
}

const s = StyleSheet.create({
    createBtn: {
        borderWidth: 1, borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 10, backgroundColor: colors.surface2,
    },
    createBtnText: { fontSize: 13, fontWeight: '800' },
    empty: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginVertical: 14 },
    card: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
        paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8,
    },
    cardTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
    cardMeta: { color: colors.textMuted, fontSize: 11, fontWeight: '600', marginTop: 2 },
    sheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        paddingHorizontal: 16, paddingTop: 14, maxHeight: '90%',
    },
    sheetHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    sheetTitle: { color: '#fff', fontSize: 16, fontWeight: '900' },
    close: { color: colors.textMuted, fontSize: 22 },
    label: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 4 },
    miniLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4, marginTop: 6 },
    input: {
        backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
        color: '#fff', paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, marginBottom: 8,
    },
    rowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 10 },
    chip: {
        paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
        borderColor: colors.border, backgroundColor: colors.surface2,
    },
    chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    chipSm: {
        paddingHorizontal: 8, paddingVertical: 5, borderRadius: 7, borderWidth: 1,
        borderColor: colors.border, backgroundColor: colors.surface2,
    },
    chipSmText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    exBox: {
        backgroundColor: colors.bg, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
        padding: 10, marginBottom: 10,
    },
    exHead: { color: '#fff', fontSize: 13, fontWeight: '800', marginBottom: 6 },
    submitBtn: { borderRadius: 12, paddingVertical: 13, alignItems: 'center', marginTop: 8 },
    submitText: { color: '#fff', fontSize: 14, fontWeight: '900' },
    setRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
    setIdx: { color: colors.textMuted, fontSize: 11, fontWeight: '700', width: 48 },
    setInput: { flex: 1, marginBottom: 0, paddingVertical: 8 },
});
