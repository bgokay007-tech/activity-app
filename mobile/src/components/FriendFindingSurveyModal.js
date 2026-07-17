import { useEffect, useState } from 'react';
import {
    Modal, View, Text, TouchableOpacity, StyleSheet,
    ScrollView, ActivityIndicator, TextInput,
} from 'react-native';
import { useSelector } from 'react-redux';
import { store } from '../store';
import api from '../services/api';
import colors from '../theme/colors';
import useT from '../hooks/useT';

export default function FriendFindingSurveyModal({ visible, onClose, onComplete }) {
    const lang = useSelector(s => s.lang?.lang || 'en');
    const t = useT();

    const [seekingQuestion, setSeekingQuestion] = useState(null);
    const [seeking, setSeeking]         = useState(null);
    const [questions, setQuestions]     = useState([]);
    const [current, setCurrent]         = useState(0);
    const [answers, setAnswers]         = useState({});
    const [selected, setSelected]       = useState(null); // choice: index | multiselect: Set | text: string
    const [loading, setLoading]         = useState(false);
    const [saving, setSaving]           = useState(false);
    const [done, setDone]               = useState(false);

    useEffect(() => {
        if (!visible) return;
        setSeekingQuestion(null);
        setSeeking(null);
        setQuestions([]);
        setCurrent(0);
        setAnswers({});
        setSelected(null);
        setDone(false);

        setLoading(true);
        const fetchLang = store.getState().lang?.lang || 'en';
        api.get(`/friend-finding/survey/seeking-question?lang=${fetchLang}`)
            .then(({ data }) => setSeekingQuestion(data.question))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [visible]);

    const chooseSeeking = (value) => {
        setSeeking(value);
        setLoading(true);
        const fetchLang = store.getState().lang?.lang || 'en';
        api.get(`/friend-finding/survey?seeking=${value}&lang=${fetchLang}`)
            .then(({ data }) => setQuestions(data.questions || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    };

    const q = questions[current];
    const progress = questions.length > 0 ? (current / questions.length) * 100 : 0;

    const isSelectionValid = () => {
        if (!q) return false;
        if (q.type === 'text') return true; // serbest metin opsiyonel
        if (q.type === 'multiselect') return selected instanceof Set && selected.size > 0;
        return selected !== null;
    };

    const handleNext = () => {
        if (!isSelectionValid()) return;

        let value;
        if (q.type === 'choice') value = q.options[selected].value;
        else if (q.type === 'multiselect') value = q.options.filter((_, i) => selected.has(i)).map(o => o.value);
        else value = selected || '';

        const newAnswers = { ...answers, [q.id]: value };
        setAnswers(newAnswers);
        setSelected(null);

        if (current + 1 < questions.length) {
            setCurrent(current + 1);
        } else {
            submitSurvey(newAnswers);
        }
    };

    const submitSurvey = async (finalAnswers) => {
        setSaving(true);
        try {
            await api.post('/friend-finding/survey/submit', { seeking, answers: finalAnswers });
            setDone(true);
        } catch (e) { console.error(e); }
        finally { setSaving(false); }
    };

    const handleFinish = () => {
        onComplete?.({ seeking });
        onClose();
    };

    const toggleMultiselect = (index) => {
        setSelected(prev => {
            const next = new Set(prev instanceof Set ? prev : []);
            if (next.has(index)) next.delete(index); else next.add(index);
            return next;
        });
    };

    return (
        <Modal visible={!!visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.box}>
                    <View style={s.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.title}>{t.ffSurveyTitle}</Text>
                            {seeking && !done && questions.length > 0 && (
                                <Text style={s.subtitle}>{t.questionCounter(current + 1, questions.length)}</Text>
                            )}
                        </View>
                        <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>

                    {seeking && !done && questions.length > 0 && (
                        <View style={s.progressBg}>
                            <View style={[s.progressFill, { width: `${progress}%` }]} />
                        </View>
                    )}

                    <ScrollView contentContainerStyle={s.body} showsVerticalScrollIndicator={false}>
                        {loading && (
                            <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
                        )}

                        {/* 1. adım: ne arıyorsun? */}
                        {!loading && !seeking && seekingQuestion && (
                            <>
                                <Text style={s.questionText}>{seekingQuestion.question}</Text>
                                {seekingQuestion.options.map(opt => (
                                    <TouchableOpacity key={opt.value} style={s.optionBtn} onPress={() => chooseSeeking(opt.value)}>
                                        <Text style={s.optionText}>{opt.text}</Text>
                                    </TouchableOpacity>
                                ))}
                            </>
                        )}

                        {/* 2. adım: anket soruları */}
                        {!loading && seeking && !done && q && (
                            <>
                                <Text style={s.questionText}>{q.question}</Text>

                                {q.type === 'text' && (
                                    <TextInput
                                        style={s.textInput}
                                        placeholder={t.ffTextPlaceholder}
                                        placeholderTextColor={colors.textMuted}
                                        value={selected || ''}
                                        onChangeText={setSelected}
                                        multiline
                                    />
                                )}

                                {q.type !== 'text' && (
                                    <View style={s.optionsGap}>
                                        {q.options.map((opt, i) => {
                                            const active = q.type === 'multiselect'
                                                ? (selected instanceof Set && selected.has(i))
                                                : selected === i;
                                            return (
                                                <TouchableOpacity
                                                    key={opt.value}
                                                    style={[s.optionBtn, active && s.optionBtnActive]}
                                                    onPress={() => q.type === 'multiselect' ? toggleMultiselect(i) : setSelected(i)}
                                                >
                                                    <View style={[s.optionDot, active && s.optionDotActive]} />
                                                    <Text style={[s.optionText, active && s.optionTextActive]}>{opt.text}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                )}

                                <TouchableOpacity
                                    style={[s.nextBtn, (!isSelectionValid() || saving) && s.nextBtnDisabled]}
                                    onPress={handleNext}
                                    disabled={!isSelectionValid() || saving}
                                >
                                    {saving
                                        ? <ActivityIndicator color="#fff" />
                                        : <Text style={s.nextBtnText}>
                                            {current + 1 === questions.length ? t.ffFinishBtn : t.nextBtn}
                                          </Text>
                                    }
                                </TouchableOpacity>
                            </>
                        )}

                        {/* Sonuç */}
                        {done && (
                            <View style={s.resultBox}>
                                <Text style={s.resultEmoji}>🎉</Text>
                                <Text style={s.resultTitle}>{t.ffSurveyDoneTitle}</Text>
                                <Text style={s.resultDesc}>{t.ffSurveyDoneDesc}</Text>
                                <TouchableOpacity style={s.doneBtn} onPress={handleFinish}>
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
    progressFill:    { height: 3, backgroundColor: '#d97706' },
    body:            { padding: 17, paddingBottom: 37, gap: 3 },

    questionText:    { color: '#fff', fontSize: 15, fontWeight: '700', lineHeight: 22, marginBottom: 8 },
    optionsGap:      { gap: 3 },
    optionBtn:       { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surface2, borderRadius: 14, padding: 11, borderWidth: 1, borderColor: colors.border, marginBottom: 3 },
    optionBtnActive: { borderColor: '#d97706', backgroundColor: '#d9770615' },
    optionDot:       { width: 18, height: 18, borderRadius: 9, borderWidth: 2, borderColor: colors.border, flexShrink: 0 },
    optionDotActive: { borderColor: '#d97706', backgroundColor: '#d97706' },
    optionText:      { color: colors.textSecondary, fontSize: 13, fontWeight: '600', flex: 1, lineHeight: 18 },
    optionTextActive:{ color: '#fff' },

    textInput:       { color: '#fff', fontSize: 14, backgroundColor: colors.surface2, borderRadius: 14, borderWidth: 1, borderColor: colors.border, padding: 11, minHeight: 90, textAlignVertical: 'top' },

    nextBtn:         { backgroundColor: '#d97706', borderRadius: 14, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
    nextBtnDisabled: { opacity: 0.4 },
    nextBtnText:     { color: '#fff', fontWeight: '800', fontSize: 15 },

    resultBox:       { alignItems: 'center', gap: 3, paddingTop: 5 },
    resultEmoji:     { fontSize: 48 },
    resultTitle:     { color: '#fff', fontSize: 18, fontWeight: '900' },
    resultDesc:      { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 4, paddingHorizontal: 3 },
    doneBtn:         { backgroundColor: '#d97706', borderRadius: 14, paddingVertical: 11, paddingHorizontal: 37, alignItems: 'center', marginTop: 17 },
    doneBtnText:     { color: '#fff', fontWeight: '800', fontSize: 15 },
});
