import { useEffect, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useSelector } from 'react-redux';
import { store } from '../store';
import api from '../services/api';
import colors from '../theme/colors';
import useT from '../hooks/useT';
import { getSubCategoryLabel } from '../utils/subCategoryLabels';

const LEVEL_COLORS = {
    BEGINNER:     '#4ade80',
    INTERMEDIATE: '#facc15',
    ADVANCED:     '#fb923c',
    PRO:          '#f87171',
};

export default function AssessmentModal({ visible, interestId, subCategory, lang: langProp, onClose, onComplete, mandatory = false }) {
    // ── All hooks first — no early returns before this block ──
    const langRedux = useSelector(s => s.lang?.lang || 'en');
    const lang = langProp || langRedux;
    const t = useT();
    const [position, setPosition]   = useState(null);
    const [questions, setQuestions] = useState([]);
    const [maxScore, setMaxScore]   = useState(0);
    const [honeypot, setHoneypot]   = useState(null);
    const [current, setCurrent]     = useState(0);
    const [answers, setAnswers]     = useState([]);
    const [selected, setSelected]   = useState(null);
    const [loading, setLoading]     = useState(false);
    const [saving, setSaving]       = useState(false);
    const [result, setResult]       = useState(null);

    useEffect(() => {
        if (!visible) return;
        setPosition(null);
        setQuestions([]);
        setHoneypot(null);
        setCurrent(0);
        setAnswers([]);
        setSelected(null);
        setResult(null);
    }, [visible, subCategory]);

    useEffect(() => {
        if (!visible || !subCategory) return;
        if (subCategory === 'football' && !position) return;
        setLoading(true);
        const fetchLang = store.getState().lang?.lang || 'en';
        const url = subCategory === 'football'
            ? `/interests/assessment/${subCategory}?position=${position}&lang=${fetchLang}`
            : `/interests/assessment/${subCategory}?lang=${fetchLang}`;
        api.get(url)
            .then(({ data }) => {
                setQuestions(data.questions || []);
                setMaxScore(data.maxScore || 0);
                setHoneypot(data.honeypot || null);
            })
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [visible, subCategory, position]);

    // ── Derived values (after all hooks) ──
    const isFootball    = subCategory === 'football';
    const needsPosition = isFootball && position === null;
    const q             = questions[current];
    const progress      = questions.length > 0 ? (current / questions.length) * 100 : 0;
    const safeLabel     = getSubCategoryLabel(subCategory, lang);

    // ── Handlers ──
    const handleNext = () => {
        if (selected === null) return;
        const opt = q.options[selected];
        const newAnswers = [...answers, { questionId: q.id, points: opt.points, text: opt.text, optionIndex: selected }];
        setAnswers(newAnswers);
        setSelected(null);

        // Voleybol honeypot: tetikleyici soruda en üst şık seçildiyse takip sorusu hemen eklenir
        if (
            honeypot &&
            q.id === honeypot.triggerQuestionId &&
            opt.points === honeypot.triggerOptionPoints &&
            !questions.some(qq => qq.id === honeypot.id)
        ) {
            const nextQuestions = [...questions];
            nextQuestions.splice(current + 1, 0, honeypot);
            setQuestions(nextQuestions);
            setCurrent(current + 1);
            return;
        }

        if (current + 1 < questions.length) {
            setCurrent(current + 1);
        } else {
            submitAssessment(newAnswers);
        }
    };

    const submitAssessment = async (finalAnswers) => {
        setSaving(true);
        try {
            const { data } = await api.patch(`/interests/${interestId}/assess`, { answers: finalAnswers });
            setResult(data);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.assessmentSubmitFailed);
        }
        finally { setSaving(false); }
    };

    // Sadece onComplete çağırmak yeterli — ManageActivitiesModal onComplete içinde
    // assessTarget'ı null'a çekip modalı zaten kapatıyor (visible={!!assessTarget}).
    // Eskiden burada ayrıca onClose() de çağrılıyordu; assessTarget henüz (setState
    // batching yüzünden) eski değerini taşıdığı için parent'ın onClose'u bunu "kullanıcı
    // ANKETİ YARIM BIRAKIP çıkıyor" sanıp anketi tamamlamış olsa bile "Vazgeç/Devam Et"
    // uyarısını gösteriyordu.
    const handleDone = () => {
        onComplete?.(result);
    };

    // ── Render ──
    return (
        <Modal visible={!!visible} animationType="slide" transparent onRequestClose={() => { if (result) { onComplete?.(result); return; } onClose(answers.length > 0); }}>
            <View style={s.overlay}>
                <View style={s.box}>
                    {/* Header */}
                    <View style={s.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.title}>{t.assessmentTitle(safeLabel)}</Text>
                            {mandatory && !result && (
                                <Text style={s.subtitle}>Bu dalda ilan açabilmek/katılabilmek için anketi tamamlaman gerekiyor</Text>
                            )}
                            {!result && !needsPosition && questions.length > 0 && (
                                <Text style={s.subtitle}>{t.questionCounter(current + 1, questions.length)}</Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={() => {
                            // Sonuç ekranındayken (anket zaten backend'e kaydedildi) ✕'e basmak
                            // "Tamam"a basmakla aynı sonucu vermeli — aksi halde kullanıcı puanı
                            // gördüğü halde local state (Aktivitelerim listesi) güncellenmeden kapatıyordu.
                            if (result) { onComplete?.(result); return; }
                            onClose(answers.length > 0);
                        }}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>

                    {/* Progress bar */}
                    {!result && !needsPosition && questions.length > 0 && (
                        <View style={s.progressBg}>
                            <View style={[s.progressFill, { width: `${progress}%` }]} />
                        </View>
                    )}

                    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>

                        {/* Position picker — football only */}
                        {needsPosition && (
                            <>
                                <Text style={s.questionText}>{t.positionQuestion}</Text>
                                <Text style={s.questionHint}>{t.positionHint}</Text>
                                {[
                                    { id: 'goalkeeper', label: t.posGoalkeeper, emoji: '🧤' },
                                    { id: 'defender',   label: t.posDefender,   emoji: '🛡️' },
                                    { id: 'midfielder', label: t.posMidfielder, emoji: '⚙️' },
                                    { id: 'forward',    label: t.posForward,    emoji: '⚡' },
                                    { id: 'allrounder', label: t.posAllrounder, emoji: '🌟' },
                                ].map(pos => (
                                    <TouchableOpacity key={pos.id} style={s.optionBtn} onPress={() => setPosition(pos.id)}>
                                        <Text style={s.optionEmoji}>{pos.emoji}</Text>
                                        <Text style={s.optionText}>{pos.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </>
                        )}

                        {/* Loading */}
                        {!needsPosition && loading && (
                            <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
                        )}

                        {/* Question */}
                        {!needsPosition && !loading && !result && q && (
                            <>
                                <Text style={s.questionText}>{q.question}</Text>
                                <View style={s.optionsGap}>
                                    {q.options.map((opt, i) => (
                                        <TouchableOpacity
                                            key={i}
                                            style={[s.optionBtn, selected === i && s.optionBtnActive]}
                                            onPress={() => setSelected(i)}
                                        >
                                            <View style={[s.optionDot, selected === i && s.optionDotActive]} />
                                            <Text style={[s.optionText, selected === i && s.optionTextActive]}>
                                                {opt.text}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <TouchableOpacity
                                    style={[s.nextBtn, (selected === null || saving) && s.nextBtnDisabled]}
                                    onPress={handleNext}
                                    disabled={selected === null || saving}
                                >
                                    {saving
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={s.nextBtnText}>
                                            {current + 1 === questions.length ? t.seeResultBtn : t.nextBtn}
                                          </Text>
                                    }
                                </TouchableOpacity>
                            </>
                        )}

                        {/* Result */}
                        {result && (
                            <View style={s.resultBox}>
                                <Text style={s.resultEmoji}>🎉</Text>
                                <Text style={s.resultTitle}>{t.assessmentComplete}</Text>
                                <View style={[s.resultLevelBox, {
                                    borderColor: (LEVEL_COLORS[result.level] || colors.purple) + '60',
                                    backgroundColor: (LEVEL_COLORS[result.level] || colors.purple) + '15',
                                }]}>
                                    <Text style={[s.resultLevel, { color: LEVEL_COLORS[result.level] || colors.purple }]}>
                                        {result.level === 'BEGINNER' ? t.levelBeginner
                                            : result.level === 'INTERMEDIATE' ? t.levelIntermediate
                                            : result.level === 'ADVANCED' ? t.levelAdvanced
                                            : result.level === 'PRO' ? t.levelPro
                                            : result.level}
                                    </Text>
                                </View>
                                <View style={s.ratingSection}>
                                    <Text style={s.ratingLabel}>{t.skillRatingLabel}</Text>
                                    <Text style={[s.ratingValue, { color: colors.purple }]}>
                                        {Number(result.skillRating || 0).toFixed(2)} ★
                                    </Text>
                                    <View style={s.ratingBarBg}>
                                        <View style={[s.ratingBarFill, {
                                            width: `${Math.round((result.skillRating / 5) * 100)}%`,
                                        }]} />
                                    </View>
                                    <Text style={s.ratingPct}>
                                        {Math.round((result.skillRating / 5) * 100)}%
                                    </Text>
                                </View>
                                <TouchableOpacity style={s.doneBtn} onPress={handleDone}>
                                    <Text style={s.doneBtnText}>✓ {t.doneBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay:         { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end', paddingTop: '15%' },
    box:             { flex: 1, backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24 },
    header:          { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 17, paddingTop: 17, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: colors.border },
    title:           { color: '#fff', fontSize: 17, fontWeight: '900' },
    subtitle:        { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    close:           { color: colors.textMuted, fontSize: 22, paddingLeft: 3 },
    progressBg:      { height: 3, backgroundColor: colors.surface2 },
    progressFill:    { height: 3, backgroundColor: colors.purple },
    body:            { padding: 17, paddingBottom: 37, gap: 3 },

    questionText:    { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 22, marginBottom: 4 },
    questionHint:    { color: colors.textMuted, fontSize: 12, marginBottom: 8 },
    optionsGap:      { gap: 3 },
    optionBtn:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surface2, borderRadius: 14, padding: 11, borderWidth: 1, borderColor: colors.border },
    optionBtnActive: { borderColor: colors.purple, backgroundColor: colors.purple + '15' },
    optionDot:       { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, flexShrink: 0 },
    optionDotActive: { borderColor: colors.purple, backgroundColor: colors.purple },
    optionEmoji:     { fontSize: 22 },
    optionText:      { color: colors.textSecondary, fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
    optionTextActive:{ color: '#fff' },

    nextBtn:         { backgroundColor: colors.purple, borderRadius: 14, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
    nextBtnDisabled: { opacity: 0.4 },
    nextBtnText:     { color: '#fff', fontWeight: '800', fontSize: 15 },

    resultBox:       { alignItems: 'center', gap: 3, paddingTop: 5 },
    resultEmoji:     { fontSize: 48 },
    resultTitle:     { color: '#fff', fontSize: 18, fontWeight: '900' },
    resultLevelBox:  { borderRadius: 14, paddingHorizontal: 21, paddingVertical: 7, borderWidth: 1 },
    resultLevel:     { fontSize: 18, fontWeight: '900' },
    ratingSection:   { alignItems: 'center', width: '100%', gap: 3 },
    ratingLabel:     { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    ratingValue:     { fontSize: 28, fontWeight: '900' },
    ratingBarBg:     { width: '100%', height: 6, backgroundColor: colors.surface2, borderRadius: 3, overflow: 'hidden' },
    ratingBarFill:   { height: 6, backgroundColor: colors.purple, borderRadius: 3 },
    ratingPct:       { color: colors.textMuted, fontSize: 12 },
    doneBtn:         { backgroundColor: colors.purple, borderRadius: 14, paddingVertical: 11, paddingHorizontal: 37, alignItems: 'center', marginTop: 8 },
    doneBtnText:     { color: '#fff', fontWeight: '800', fontSize: 15 },
});
