import { useEffect, useMemo, useState } from 'react';
import {
    Modal, View, Text, ScrollView, TouchableOpacity, Image, Linking, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useSelector } from 'react-redux';
import colors from '../theme/colors';
import { moderateScale } from '../theme/scale';
import useT from '../hooks/useT';
import UiIcon from './UiIcon';
import { getFitnessExerciseGroups, getFitnessStudies } from '../data/fitnessGymGuide';

function openUrl(url) {
    if (!url) return;
    Linking.openURL(url).catch(() => {});
}

function ExerciseCard({ item, accent }) {
    const [failed, setFailed] = useState(false);
    return (
        <View style={s.exCard}>
            <View style={s.exImgWrap}>
                {!failed && item.image ? (
                    <Image
                        source={{ uri: item.image }}
                        style={s.exImg}
                        resizeMode="cover"
                        onError={() => setFailed(true)}
                    />
                ) : (
                    <View style={[s.exImgFallback, { borderColor: accent + '55' }]}>
                        <UiIcon name="barbell-outline" size={26} color={accent} />
                    </View>
                )}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.exName} numberOfLines={2}>{item.name}</Text>
                {!!item.muscles && (
                    <Text style={s.exMuscles} numberOfLines={2}>{item.muscles}</Text>
                )}
            </View>
        </View>
    );
}

export default function FitnessGymInfoModal({ visible, onClose, cfg }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const lang = useSelector((st) => st.lang?.lang || 'en');
    const [tab, setTab] = useState('exercises');
    const [openStudyId, setOpenStudyId] = useState(null);
    const accent = cfg?.color || '#f97316';

    useEffect(() => {
        if (visible) {
            setTab('exercises');
            setOpenStudyId(null);
        }
    }, [visible]);

    const groups = useMemo(() => getFitnessExerciseGroups(lang), [lang]);
    const studies = useMemo(() => getFitnessStudies(lang), [lang]);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.backdrop}>
                <View style={[s.sheet, { paddingBottom: Math.max(16, insets.bottom + 8) }]}>
                    <View style={s.head}>
                        <Text style={s.title} numberOfLines={1}>{t.fitnessGymInfoTitle}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={10}>
                            <Text style={s.close}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.tabs}>
                        {[
                            ['exercises', t.fitnessGymTabExercises],
                            ['studies', t.fitnessGymTabStudies],
                        ].map(([key, lbl]) => (
                            <TouchableOpacity
                                key={key}
                                onPress={() => setTab(key)}
                                style={[s.tab, tab === key && { backgroundColor: accent, borderColor: accent }]}
                            >
                                <Text
                                    style={[s.tabTxt, tab === key && { color: '#fff' }]}
                                    numberOfLines={1}
                                    adjustsFontSizeToFit
                                    minimumFontScale={0.75}
                                >
                                    {lbl}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {tab === 'exercises' ? (
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
                            <Text style={s.hint}>{t.fitnessGymExercisesHint}</Text>
                            {groups.map((g) => (
                                <View key={g.id} style={s.group}>
                                    <Text style={[s.groupTitle, { color: accent }]}>{g.label}</Text>
                                    {g.exercises.map((ex) => (
                                        <ExerciseCard key={ex.id} item={ex} accent={accent} />
                                    ))}
                                </View>
                            ))}
                            <Text style={s.credit}>{t.fitnessGymImageCredit}</Text>
                            <View style={{ height: 12 }} />
                        </ScrollView>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.body}>
                            <Text style={s.hint}>{t.fitnessGymStudiesHint}</Text>
                            {studies.map((st) => {
                                const open = openStudyId === st.id;
                                return (
                                    <View key={st.id} style={s.studyCard}>
                                        <TouchableOpacity
                                            onPress={() => setOpenStudyId(open ? null : st.id)}
                                            activeOpacity={0.85}
                                        >
                                            <View style={s.studyHead}>
                                                <View style={{ flex: 1, minWidth: 0, paddingRight: 8 }}>
                                                    <Text style={s.studyMeta}>
                                                        {st.source} · {st.year}
                                                        {st.authors ? ` · ${st.authors}` : ''}
                                                    </Text>
                                                    <Text style={s.studyTitle}>{st.title}</Text>
                                                </View>
                                                <Text style={{ color: accent, fontSize: 16, fontWeight: '900' }}>
                                                    {open ? '▼' : '›'}
                                                </Text>
                                            </View>
                                        </TouchableOpacity>
                                        {open ? (
                                            <View style={s.studyBody}>
                                                <Text style={s.studyDetail}>{st.detail}</Text>
                                                {!!st.url && (
                                                    <TouchableOpacity
                                                        onPress={() => openUrl(st.url)}
                                                        style={[s.linkBtn, { borderColor: accent + '66' }]}
                                                        activeOpacity={0.8}
                                                    >
                                                        <Text style={[s.linkTxt, { color: accent }]}>
                                                            {t.fitnessGymOpenSource}
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        ) : null}
                                    </View>
                                );
                            })}
                            <View style={{ height: 12 }} />
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    backdrop: { flex: 1, backgroundColor: '#000000cc', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        maxHeight: '92%',
    },
    head: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 14,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    title: { color: '#fff', fontSize: 15, fontWeight: '900', flex: 1, paddingRight: 10 },
    close: { color: colors.textMuted, fontSize: 18, fontWeight: '700' },
    tabs: { flexDirection: 'row', gap: 6, marginHorizontal: 14, marginTop: 10, marginBottom: 8 },
    tab: {
        flex: 1,
        paddingVertical: 8,
        borderRadius: 10,
        alignItems: 'center',
        backgroundColor: colors.surface2,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tabTxt: { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
    body: { paddingHorizontal: 14, paddingTop: 4 },
    hint: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, marginBottom: 12 },
    group: { marginBottom: 14 },
    groupTitle: { fontSize: 13, fontWeight: '900', marginBottom: 8, letterSpacing: 0.3 },
    exCard: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        backgroundColor: colors.surface2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 8,
        marginBottom: 8,
    },
    exImgWrap: { width: moderateScale(72), height: moderateScale(72), borderRadius: 10, overflow: 'hidden' },
    exImg: { width: '100%', height: '100%', backgroundColor: '#111' },
    exImgFallback: {
        flex: 1,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#111',
        borderWidth: 1,
        borderRadius: 10,
    },
    exName: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 18 },
    exMuscles: { color: colors.textMuted, fontSize: 11, marginTop: 4, lineHeight: 15 },
    credit: { color: colors.textMuted, fontSize: 10, lineHeight: 14, marginTop: 6, marginBottom: 8 },
    studyCard: {
        backgroundColor: colors.surface2,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: colors.border,
        marginBottom: 8,
        overflow: 'hidden',
    },
    studyHead: { flexDirection: 'row', alignItems: 'center', padding: 12 },
    studyMeta: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4 },
    studyTitle: { color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 18 },
    studyBody: { paddingHorizontal: 12, paddingBottom: 12, borderTopWidth: 1, borderTopColor: colors.border },
    studyDetail: { color: colors.textSecondary, fontSize: 12, lineHeight: 19, marginTop: 10 },
    linkBtn: {
        marginTop: 10,
        alignSelf: 'flex-start',
        paddingHorizontal: 10,
        paddingVertical: 6,
        borderRadius: 8,
        borderWidth: 1,
        backgroundColor: '#ffffff08',
    },
    linkTxt: { fontSize: 12, fontWeight: '800' },
});
