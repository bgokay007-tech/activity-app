import { useEffect, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator, TextInput, KeyboardAvoidingView, Alert,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import colors from '../theme/colors';
import useT from '../hooks/useT';

// Voleybol + padel oyuncu değerlendirme formu aynı bileşeni paylaşır — sadece soru seti,
// kategori ağırlıkları ve endpoint farklı (bkz. CONFIG). Kendi/antrenör/takım arkadaşı
// oranları ve derece puanına yazılma mantığı backend'de (bkz. utils/volleyballRating.js,
// utils/padelRating.js) sport'a göre ayrı tutuluyor, burası sadece o config'i tüketiyor.
const CONFIG = {
    volleyball: {
        endpoint: 'volleyball-rating',
        titleKey: 'volleyballRatingTitle',
        overallLabelKey: 'volleyballRatingOverallLabel',
        selfLabelKey: 'volleyballRatingSelfLabel',
        coachLabelKey: 'volleyballRatingCoachLabel',
        teammateLabelKey: 'volleyballRatingTeammateLabel',
        noDataLabelKey: 'volleyballRatingNoDataLabel',
        notEligibleKey: 'volleyballRatingNotEligible',
        selfHintKey: 'volleyballRatingSelfHint',
        submitBtnKey: 'volleyballRatingSubmitBtn',
        submittedMsgKey: 'volleyballRatingSubmittedMsg',
        submitFailedKey: 'volleyballRatingSubmitFailed',
        commentsTitleKey: 'volleyballRatingCommentsTitle',
        roleCoachKey: 'volleyballRatingRoleCoach',
        roleTeammateKey: 'volleyballRatingRoleTeammate',
        section4TitleKey: 'volleyballRatingSection4Title',
        section4HintKey: 'volleyballRatingSection4Hint',
        strongestQKey: 'volleyballRatingStrongestQ',
        weakestQKey: 'volleyballRatingWeakestQ',
        generalNoteQKey: 'volleyballRatingGeneralNoteQ',
        questionFields: [
            'serve', 'receptionPass', 'spike', 'block', 'serveReception',
            'endurance', 'agility', 'jump',
            'gameVision', 'teamCommunication', 'decisionMaking',
        ],
        categories: [
            { key: 'technical', labelKey: 'volleyballCatTechnical', fields: ['serve', 'receptionPass', 'spike', 'block', 'serveReception'] },
            { key: 'physical',  labelKey: 'volleyballCatPhysical',  fields: ['endurance', 'agility', 'jump'] },
            { key: 'tactical',  labelKey: 'volleyballCatTactical',  fields: ['gameVision', 'teamCommunication', 'decisionMaking'] },
        ],
        questionMeta: {
            serve:             { title: 'volleyballQServe',             desc: 'volleyballQServeDesc' },
            receptionPass:     { title: 'volleyballQReceptionPass',     desc: 'volleyballQReceptionPassDesc' },
            spike:             { title: 'volleyballQSpike',             desc: 'volleyballQSpikeDesc' },
            block:             { title: 'volleyballQBlock',             desc: 'volleyballQBlockDesc' },
            serveReception:    { title: 'volleyballQServeReception',    desc: 'volleyballQServeReceptionDesc' },
            endurance:         { title: 'volleyballQEndurance',         desc: 'volleyballQEnduranceDesc' },
            agility:           { title: 'volleyballQAgility',           desc: 'volleyballQAgilityDesc' },
            jump:              { title: 'volleyballQJump',              desc: 'volleyballQJumpDesc' },
            gameVision:        { title: 'volleyballQGameVision',        desc: 'volleyballQGameVisionDesc' },
            teamCommunication: { title: 'volleyballQTeamCommunication', desc: 'volleyballQTeamCommunicationDesc' },
            decisionMaking:    { title: 'volleyballQDecisionMaking',    desc: 'volleyballQDecisionMakingDesc' },
        },
    },
    padel: {
        endpoint: 'padel-rating',
        titleKey: 'padelRatingTitle',
        overallLabelKey: 'padelRatingOverallLabel',
        selfLabelKey: 'padelRatingSelfLabel',
        coachLabelKey: 'padelRatingCoachLabel',
        teammateLabelKey: 'padelRatingTeammateLabel',
        noDataLabelKey: 'padelRatingNoDataLabel',
        notEligibleKey: 'padelRatingNotEligible',
        selfHintKey: 'padelRatingSelfHint',
        submitBtnKey: 'padelRatingSubmitBtn',
        submittedMsgKey: 'padelRatingSubmittedMsg',
        submitFailedKey: 'padelRatingSubmitFailed',
        commentsTitleKey: 'padelRatingCommentsTitle',
        roleCoachKey: 'padelRatingRoleCoach',
        roleTeammateKey: 'padelRatingRoleTeammate',
        section4TitleKey: 'padelRatingSection4Title',
        section4HintKey: 'padelRatingSection4Hint',
        strongestQKey: 'padelRatingStrongestQ',
        weakestQKey: 'padelRatingWeakestQ',
        generalNoteQKey: 'padelRatingGeneralNoteQ',
        questionFields: [
            'forehandDrive', 'backhandDrive', 'volley', 'smash',
            'agility', 'endurance', 'reflexes',
            'courtPositioning', 'shotSelection', 'teamCommunication',
        ],
        categories: [
            { key: 'technical', labelKey: 'padelCatTechnical', fields: ['forehandDrive', 'backhandDrive', 'volley', 'smash'] },
            { key: 'physical',  labelKey: 'padelCatPhysical',  fields: ['agility', 'endurance', 'reflexes'] },
            { key: 'tactical',  labelKey: 'padelCatTactical',  fields: ['courtPositioning', 'shotSelection', 'teamCommunication'] },
        ],
        questionMeta: {
            forehandDrive:     { title: 'padelQForehandDrive',     desc: 'padelQForehandDriveDesc' },
            backhandDrive:     { title: 'padelQBackhandDrive',     desc: 'padelQBackhandDriveDesc' },
            volley:            { title: 'padelQVolley',            desc: 'padelQVolleyDesc' },
            smash:             { title: 'padelQSmash',             desc: 'padelQSmashDesc' },
            agility:           { title: 'padelQAgility',           desc: 'padelQAgilityDesc' },
            endurance:         { title: 'padelQEndurance',         desc: 'padelQEnduranceDesc' },
            reflexes:          { title: 'padelQReflexes',          desc: 'padelQReflexesDesc' },
            courtPositioning:  { title: 'padelQCourtPositioning',  desc: 'padelQCourtPositioningDesc' },
            shotSelection:     { title: 'padelQShotSelection',     desc: 'padelQShotSelectionDesc' },
            teamCommunication: { title: 'padelQTeamCommunication', desc: 'padelQTeamCommunicationDesc' },
        },
    },
};

function ScoreRow({ max, value, onChange }) {
    return (
        <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
            {Array.from({ length: max }, (_, i) => i + 1).map(n => {
                const sel = value === n;
                return (
                    <TouchableOpacity key={n} onPress={() => onChange(n)} style={[s.scoreBox, sel && s.scoreBoxSel]}>
                        <Text style={[s.scoreBoxText, sel && s.scoreBoxTextSel]}>{n}</Text>
                    </TouchableOpacity>
                );
            })}
        </View>
    );
}

export default function VolleyballRatingModal({ visible, subjectId, subCategory = 'volleyball', onClose }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const cfg = CONFIG[subCategory] || CONFIG.volleyball;
    const QUESTION_FIELDS = cfg.questionFields;
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [data, setData] = useState(null);
    const [answers, setAnswers] = useState({});
    const [strongestPoint, setStrongestPoint] = useState('');
    const [weakestPoint, setWeakestPoint] = useState('');
    const [generalNote, setGeneralNote] = useState(0);

    useEffect(() => {
        if (!visible || !subjectId) {
            setData(null); setAnswers({}); setStrongestPoint(''); setWeakestPoint('');
            setGeneralNote(0); setSaved(false);
            return;
        }
        setLoading(true);
        api.get(`/${cfg.endpoint}/${subjectId}`)
            .then(({ data }) => {
                setData(data);
                if (data.myRating) {
                    const a = {};
                    QUESTION_FIELDS.forEach(f => { a[f] = data.myRating[f]; });
                    setAnswers(a);
                    setStrongestPoint(data.myRating.strongestPoint || '');
                    setWeakestPoint(data.myRating.weakestPoint || '');
                    setGeneralNote(data.myRating.generalPerformanceNote || 0);
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [visible, subjectId, subCategory]);

    const setAnswer = (field, val) => { setSaved(false); setAnswers(prev => ({ ...prev, [field]: val })); };

    const allAnswered = QUESTION_FIELDS.every(f => answers[f] >= 1);
    const needsSection4 = data?.myRole === 'COACH' || data?.myRole === 'TEAMMATE';
    const canSubmit = allAnswered && (!needsSection4 || generalNote >= 1);

    const submit = async () => {
        if (!canSubmit || saving) return;
        setSaving(true);
        try {
            const { data: agg } = await api.post(`/${cfg.endpoint}/${subjectId}`, {
                ...answers,
                ...(needsSection4 ? { strongestPoint, weakestPoint, generalPerformanceNote: generalNote } : {}),
            });
            setData(prev => ({ ...prev, ...agg }));
            setSaved(true);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t[cfg.submitFailedKey]);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal visible={!!visible} animationType="slide" transparent onRequestClose={onClose} android_keyboardInputMode="adjustNothing">
            <View style={s.overlay}>
                <KeyboardAvoidingView behavior="padding" style={{ flex: 1, justifyContent: 'flex-end' }}>
                    <View style={s.box}>
                        <View style={s.header}>
                            <Text style={s.title}>{t[cfg.titleKey]}</Text>
                            <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
                        </View>

                        <ScrollView
                            showsVerticalScrollIndicator={false}
                            keyboardShouldPersistTaps="handled"
                            contentContainerStyle={[s.body, { paddingBottom: Math.max(20, insets.bottom + 16) }]}
                        >
                            {loading && <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />}

                            {!loading && data && (
                                <>
                                    <View style={s.summaryBox}>
                                        <Text style={s.overallScore}>{data.overallScore.toFixed(2)}</Text>
                                        <Text style={s.overallLabel}>{t[cfg.overallLabelKey]}</Text>
                                        <View style={s.summaryRow}>
                                            <Text style={s.summaryItem}>
                                                {t[cfg.selfLabelKey]}: {data.selfScore != null ? data.selfScore.toFixed(2) : t[cfg.noDataLabelKey]}
                                            </Text>
                                            <Text style={s.summaryItem}>
                                                {t[cfg.coachLabelKey](data.coachCount)}: {data.coachScore != null ? data.coachScore.toFixed(2) : t[cfg.noDataLabelKey]}
                                            </Text>
                                            <Text style={s.summaryItem}>
                                                {t[cfg.teammateLabelKey](data.teammateCount)}: {data.teammateScore != null ? data.teammateScore.toFixed(2) : t[cfg.noDataLabelKey]}
                                            </Text>
                                        </View>
                                    </View>

                                    {data.comments?.length > 0 && (
                                        <View style={{ gap: 8 }}>
                                            <Text style={s.sectionTitle}>{t[cfg.commentsTitleKey]}</Text>
                                            {data.comments.map((c, i) => (
                                                <View key={i} style={s.commentCard}>
                                                    <Text style={s.commentName}>
                                                        {c.rater?.fullName || c.rater?.username || '?'} · {c.role === 'COACH' ? t[cfg.roleCoachKey] : t[cfg.roleTeammateKey]}
                                                        {c.generalPerformanceNote != null ? ` · ${c.generalPerformanceNote}/10` : ''}
                                                    </Text>
                                                    {c.strongestPoint ? <Text style={s.commentText}>+ {c.strongestPoint}</Text> : null}
                                                    {c.weakestPoint ? <Text style={s.commentText}>- {c.weakestPoint}</Text> : null}
                                                </View>
                                            ))}
                                        </View>
                                    )}

                                    {data.myRole === 'SELF' ? (
                                        <Text style={s.notEligibleText}>{t[cfg.selfHintKey]}</Text>
                                    ) : data.myRole ? (
                                        <>
                                            {cfg.categories.map(cat => (
                                                <View key={cat.key} style={s.categoryBox}>
                                                    <Text style={s.categoryTitle}>{t[cat.labelKey]}</Text>
                                                    {cat.fields.map(f => (
                                                        <View key={f} style={s.questionCard}>
                                                            <Text style={s.questionTitle}>{t[cfg.questionMeta[f].title]}</Text>
                                                            <Text style={s.questionDesc}>{t[cfg.questionMeta[f].desc]}</Text>
                                                            <ScoreRow max={5} value={answers[f] || 0} onChange={v => setAnswer(f, v)} />
                                                        </View>
                                                    ))}
                                                </View>
                                            ))}

                                            {needsSection4 && (
                                                <View style={s.categoryBox}>
                                                    <Text style={s.categoryTitle}>{t[cfg.section4TitleKey]}</Text>
                                                    <Text style={s.hintText}>{t[cfg.section4HintKey]}</Text>
                                                    <View style={s.questionCard}>
                                                        <Text style={s.questionTitle}>{t[cfg.strongestQKey]}</Text>
                                                        <TextInput
                                                            value={strongestPoint}
                                                            onChangeText={v => { setSaved(false); setStrongestPoint(v); }}
                                                            multiline
                                                            style={s.textInput}
                                                            placeholderTextColor={colors.textMuted}
                                                        />
                                                    </View>
                                                    <View style={s.questionCard}>
                                                        <Text style={s.questionTitle}>{t[cfg.weakestQKey]}</Text>
                                                        <TextInput
                                                            value={weakestPoint}
                                                            onChangeText={v => { setSaved(false); setWeakestPoint(v); }}
                                                            multiline
                                                            style={s.textInput}
                                                            placeholderTextColor={colors.textMuted}
                                                        />
                                                    </View>
                                                    <View style={s.questionCard}>
                                                        <Text style={s.questionTitle}>{t[cfg.generalNoteQKey]}</Text>
                                                        <ScoreRow max={10} value={generalNote} onChange={v => { setSaved(false); setGeneralNote(v); }} />
                                                    </View>
                                                </View>
                                            )}

                                            <TouchableOpacity
                                                style={[s.submitBtn, (!canSubmit || saving) && s.submitBtnDisabled]}
                                                disabled={!canSubmit || saving}
                                                onPress={submit}
                                            >
                                                {saving ? <ActivityIndicator color="#fff" size="small" /> : <Text style={s.submitBtnText}>{t[cfg.submitBtnKey]}</Text>}
                                            </TouchableOpacity>
                                            {saved && <Text style={s.savedText}>{t[cfg.submittedMsgKey]}</Text>}
                                        </>
                                    ) : (
                                        <Text style={s.notEligibleText}>{t[cfg.notEligibleKey]}</Text>
                                    )}
                                </>
                            )}
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay:            { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end', paddingTop: '10%' },
    box:                 { maxHeight: '92%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    header:              { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 17, paddingTop: 17, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    title:               { color: '#fff', fontSize: 17, fontWeight: '900' },
    close:               { color: colors.textMuted, fontSize: 22, paddingLeft: 3 },
    body:                { padding: 17, gap: 14 },

    summaryBox:          { alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, paddingVertical: 16, gap: 4 },
    overallScore:        { color: '#facc15', fontSize: 32, fontWeight: '900' },
    overallLabel:        { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    summaryRow:          { marginTop: 8, gap: 3, alignItems: 'center' },
    summaryItem:         { color: colors.textSecondary, fontSize: 11 },

    sectionTitle:        { color: '#fff', fontSize: 14, fontWeight: '800' },
    commentCard:         { backgroundColor: colors.surface2, borderRadius: 12, padding: 11, borderWidth: 1, borderColor: colors.border, gap: 3 },
    commentName:         { color: colors.purple, fontSize: 12, fontWeight: '700' },
    commentText:         { color: colors.textSecondary, fontSize: 12, lineHeight: 17 },

    categoryBox:         { gap: 9 },
    categoryTitle:       { color: '#fff', fontSize: 14, fontWeight: '900' },
    hintText:            { color: colors.textMuted, fontSize: 11, fontStyle: 'italic', marginTop: -4 },
    questionCard:        { backgroundColor: colors.surface2, borderRadius: 12, padding: 12, borderWidth: 1, borderColor: colors.border, gap: 7 },
    questionTitle:       { color: '#fff', fontSize: 13, fontWeight: '700' },
    questionDesc:        { color: colors.textMuted, fontSize: 11, lineHeight: 15 },

    scoreBox:            { width: 30, height: 30, borderRadius: 8, backgroundColor: '#ffffff08', borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    scoreBoxSel:         { backgroundColor: colors.purple + '30', borderColor: colors.purple },
    scoreBoxText:        { color: colors.textMuted, fontSize: 12, fontWeight: '800' },
    scoreBoxTextSel:     { color: colors.purple },

    textInput:           { color: '#fff', fontSize: 13, minHeight: 44, textAlignVertical: 'top', backgroundColor: '#ffffff08', borderRadius: 8, borderWidth: 1, borderColor: colors.border, padding: 8 },

    submitBtn:           { backgroundColor: colors.purple, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    submitBtnDisabled:   { opacity: 0.4 },
    submitBtnText:       { color: '#fff', fontWeight: '800', fontSize: 14 },
    savedText:           { color: '#4ade80', fontSize: 12, fontWeight: '700', textAlign: 'center' },

    notEligibleText:     { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 20, lineHeight: 19 },
});
