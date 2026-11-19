import { useCallback, useMemo, useState } from 'react';
import {
    View, Text, TouchableOpacity, TextInput, ActivityIndicator, StyleSheet, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ScreenBackButton from '../../components/ScreenBackButton';
import KeyboardAwareForm from '../../components/KeyboardAwareForm';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import {
    ATHLETE_CATEGORIES,
    ATHLETE_METRIC_CATALOG,
    computeBmi,
    formatMetricValue,
} from '../../utils/athleteMetricsCatalog';

function metricLabel(t, key) {
    return t[`ac_m_${key}`] || key;
}

function categoryLabel(t, cat) {
    return t[`ac_cat_${cat}`] || cat;
}

export default function AthleteCardScreen({ navigation }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [tab, setTab] = useState('BASIC');
    const [latest, setLatest] = useState({});
    const [bmi, setBmi] = useState(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [draft, setDraft] = useState({});

    const load = useCallback(() => {
        setLoading(true);
        api.get('/athlete-card')
            .then(({ data }) => {
                setLatest(data?.latest || {});
                setBmi(data?.bmi ?? null);
                setDraft({});
            })
            .catch(() => {
                setLatest({});
                setBmi(null);
            })
            .finally(() => setLoading(false));
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const metrics = ATHLETE_METRIC_CATALOG[tab] || [];

    const derivedBmi = useMemo(() => {
        const h = draft.heightCm != null && draft.heightCm !== ''
            ? Number(draft.heightCm)
            : latest.heightCm?.value;
        const w = draft.weightKg != null && draft.weightKg !== ''
            ? Number(draft.weightKg)
            : latest.weightKg?.value;
        return computeBmi(h, w) ?? bmi;
    }, [draft.heightCm, draft.weightKg, latest, bmi]);

    const saveTab = async () => {
        const entries = metrics
            .map((m) => {
                const raw = draft[m.key];
                if (raw == null || String(raw).trim() === '') return null;
                const value = Number(String(raw).replace(',', '.'));
                if (!Number.isFinite(value)) return null;
                return { key: m.key, value, source: 'MANUAL' };
            })
            .filter(Boolean);
        if (!entries.length) {
            Alert.alert('', t.ac_nothingToSave);
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.post('/athlete-card', { entries });
            setLatest(data?.latest || {});
            setBmi(data?.bmi ?? null);
            setDraft({});
            Alert.alert('', t.ac_saved);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed || t.ac_saveFailed);
        } finally {
            setSaving(false);
        }
    };

    const healthSyncHint = () => {
        Alert.alert(t.ac_healthSyncTitle, t.ac_healthSyncBody);
    };

    return (
        <View style={[s.root, { paddingTop: insets.top }]}>
            <View style={s.header}>
                <ScreenBackButton onPress={() => navigation.goBack()} />
                <Text style={s.title} numberOfLines={1}>{t.ac_title}</Text>
                <View style={{ width: 40 }} />
            </View>

            <Text style={s.intro}>{t.ac_intro}</Text>

            <View style={s.tabsWrap}>
                {ATHLETE_CATEGORIES.map((cat) => {
                    const on = tab === cat;
                    return (
                        <TouchableOpacity
                            key={cat}
                            onPress={() => { setTab(cat); setDraft({}); }}
                            style={[s.tab, on && s.tabOn]}
                        >
                            <Text style={[s.tabTxt, on && s.tabTxtOn]} numberOfLines={1}>
                                {categoryLabel(t, cat)}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>

            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 24 }} />
            ) : (
                <KeyboardAwareForm
                    style={{ flex: 1 }}
                    contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: insets.bottom + 28 }}
                    keyboardShouldPersistTaps="handled"
                >
                    {tab === 'BASIC' && derivedBmi != null ? (
                        <View style={s.bmiBox}>
                            <Text style={s.bmiLabel}>{t.ac_bmi}</Text>
                            <Text style={s.bmiVal}>{derivedBmi}</Text>
                            <Text style={s.bmiHint}>{t.ac_bmiHint}</Text>
                        </View>
                    ) : null}

                    {tab === 'DAILY' ? (
                        <TouchableOpacity onPress={healthSyncHint} style={s.syncBtn} activeOpacity={0.8}>
                            <Text style={s.syncTxt}>{t.ac_healthSyncBtn}</Text>
                        </TouchableOpacity>
                    ) : null}

                    {tab === 'ANTHRO' ? (
                        <Text style={s.sectionHint}>{t.ac_anthroHint}</Text>
                    ) : null}
                    {tab === 'COMPOSITION' ? (
                        <Text style={s.sectionHint}>{t.ac_compHint}</Text>
                    ) : null}
                    {tab === 'BIOMOTOR' ? (
                        <Text style={s.sectionHint}>{t.ac_bioHint}</Text>
                    ) : null}
                    {tab === 'PHYSIO' ? (
                        <Text style={s.sectionHint}>{t.ac_physioHint}</Text>
                    ) : null}

                    {metrics.map((m) => {
                        const cur = latest[m.key];
                        const draftVal = draft[m.key];
                        return (
                            <View key={m.key} style={s.row}>
                                <View style={{ flex: 1, minWidth: 0 }}>
                                    <Text style={s.metricName}>{metricLabel(t, m.key)}</Text>
                                    <Text style={s.metricCur}>
                                        {t.ac_current}: {formatMetricValue(cur?.value, m.unit)}
                                        {cur?.measuredAt ? ` · ${String(cur.measuredAt).slice(0, 10)}` : ''}
                                    </Text>
                                </View>
                                <TextInput
                                    style={s.input}
                                    value={draftVal != null ? String(draftVal) : ''}
                                    onChangeText={(v) => setDraft((p) => ({ ...p, [m.key]: v.replace(/[^0-9.,\-]/g, '') }))}
                                    keyboardType="decimal-pad"
                                    placeholder={m.unit || '0'}
                                    placeholderTextColor={colors.textMuted}
                                />
                            </View>
                        );
                    })}

                    <TouchableOpacity
                        onPress={saveTab}
                        disabled={saving}
                        style={[s.saveBtn, saving && { opacity: 0.6 }]}
                    >
                        <Text style={s.saveTxt}>{saving ? '...' : t.ac_save}</Text>
                    </TouchableOpacity>
                </KeyboardAwareForm>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 12, paddingVertical: 8,
    },
    title: { color: '#fff', fontSize: 17, fontWeight: '900', flex: 1, textAlign: 'center' },
    intro: {
        color: colors.textMuted, fontSize: 12, lineHeight: 17,
        paddingHorizontal: 16, marginBottom: 10,
    },
    tabsWrap: {
        flexDirection: 'row', flexWrap: 'wrap', gap: 6,
        paddingHorizontal: 12, marginBottom: 10,
    },
    tab: {
        paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10,
        backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    },
    tabOn: { backgroundColor: colors.purple + '35', borderColor: colors.purple + '80' },
    tabTxt: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
    tabTxtOn: { color: '#c4b5fd' },
    bmiBox: {
        backgroundColor: colors.surface2, borderRadius: 14, padding: 12,
        borderWidth: 1, borderColor: '#4ade8040', marginBottom: 12, alignItems: 'center',
    },
    bmiLabel: { color: '#4ade80', fontSize: 11, fontWeight: '800' },
    bmiVal: { color: '#fff', fontSize: 28, fontWeight: '900', marginTop: 2 },
    bmiHint: { color: colors.textMuted, fontSize: 10, textAlign: 'center', marginTop: 4 },
    syncBtn: {
        backgroundColor: '#0ea5e920', borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12,
        borderWidth: 1, borderColor: '#0ea5e950', marginBottom: 12,
    },
    syncTxt: { color: '#38bdf8', fontSize: 12, fontWeight: '800', textAlign: 'center' },
    sectionHint: { color: colors.textMuted, fontSize: 11, lineHeight: 16, marginBottom: 10 },
    row: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: colors.surface, borderRadius: 12, padding: 10,
        borderWidth: 1, borderColor: colors.border, marginBottom: 8,
    },
    metricName: { color: '#fff', fontSize: 13, fontWeight: '800' },
    metricCur: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
    input: {
        width: 88, backgroundColor: '#1e293b', color: '#fff', borderRadius: 8,
        paddingHorizontal: 8, paddingVertical: 8, borderWidth: 1, borderColor: colors.border,
        fontSize: 14, fontWeight: '700', textAlign: 'center',
    },
    saveBtn: {
        marginTop: 12, backgroundColor: colors.purple, borderRadius: 12,
        paddingVertical: 12, alignItems: 'center',
    },
    saveTxt: { color: '#fff', fontSize: 14, fontWeight: '900' },
});
