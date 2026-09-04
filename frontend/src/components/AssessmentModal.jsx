import { useState, useEffect } from 'react';
import { useSelector } from 'react-redux';
import api from '../services/api';

const LEVEL_CONFIG = {
    BEGINNER:     { label: 'Beginner',     color: 'from-green-400 to-emerald-400',   bg: 'bg-green-500/20',   text: 'text-green-300',   badge: '🟢' },
    INTERMEDIATE: { label: 'Intermediate', color: 'from-yellow-400 to-amber-400',    bg: 'bg-yellow-500/20',  text: 'text-yellow-300',  badge: '🟡' },
    ADVANCED:     { label: 'Advanced',     color: 'from-orange-400 to-red-400',      bg: 'bg-orange-500/20',  text: 'text-orange-300',  badge: '🟠' },
    PRO:          { label: 'Pro',          color: 'from-purple-400 to-pink-400',     bg: 'bg-purple-500/20',  text: 'text-purple-300',  badge: '🔴' },
};

const FOOTBALL_POSITIONS = {
    en: [
        { id: 'goalkeeper',  label: 'Goalkeeper',      emoji: '🧤', desc: 'Guards the goal line' },
        { id: 'defender',    label: 'Defender',        emoji: '🛡️', desc: 'Defensive line player' },
        { id: 'midfielder',  label: 'Midfielder',      emoji: '⚙️', desc: 'Playmaker / central role' },
        { id: 'forward',     label: 'Forward / Winger', emoji: '⚡', desc: 'Goal-scoring player' },
        { id: 'allrounder',  label: 'All Positions',   emoji: '🌟', desc: 'I can play any position' },
    ],
    tr: [
        { id: 'goalkeeper',  label: 'Kaleci',          emoji: '🧤', desc: 'Gol çizgisini koruyan' },
        { id: 'defender',    label: 'Defans',          emoji: '🛡️', desc: 'Savunma hattı oyuncusu' },
        { id: 'midfielder',  label: 'Orta Saha',       emoji: '⚙️', desc: 'Oyun kurucu / merkez' },
        { id: 'forward',     label: 'Forvet / Kanat',  emoji: '⚡', desc: 'Gol üreten oyuncu' },
        { id: 'allrounder',  label: 'Her Mevkide',     emoji: '🌟', desc: 'Her pozisyonda oynayabilirim' },
    ],
};

export default function AssessmentModal({ interestId, subCategory, categoryColor, onClose, onComplete }) {
    const lang = useSelector(state => state.lang.lang);
    const positions = FOOTBALL_POSITIONS[lang] || FOOTBALL_POSITIONS.en;

    const [position, setPosition]         = useState(null);   // only for football
    const [questions, setQuestions]       = useState([]);
    const [maxScore, setMaxScore]         = useState(0);
    const [honeypot, setHoneypot]         = useState(null);
    const [current, setCurrent]           = useState(0);
    const [answers, setAnswers]           = useState([]);
    const [selectedOption, setSelectedOption] = useState(null);
    const [isLoading, setIsLoading]       = useState(false);
    const [isSaving, setIsSaving]         = useState(false);
    const [result, setResult]             = useState(null);

    const isFootball = subCategory === 'football';
    const needsPositionPick = isFootball && position === null;

    // Fetch questions once position is known (or immediately for non-football)
    useEffect(() => {
        if (isFootball && !position) return;
        setIsLoading(true);
        const url = isFootball
            ? `/interests/assessment/${subCategory}?position=${position}&lang=${lang}`
            : `/interests/assessment/${subCategory}?lang=${lang}`;
        api.get(url)
            .then(({ data }) => {
                setQuestions(data.questions);
                setMaxScore(data.maxScore);
                setHoneypot(data.honeypot || null);
            })
            .catch(console.error)
            .finally(() => setIsLoading(false));
    }, [subCategory, position, lang]);

    const q = questions[current];
    const progress = questions.length > 0 ? (current / questions.length) * 100 : 0;

    const handleNext = () => {
        if (selectedOption === null) return;
        const opt = q.options[selectedOption];
        const newAnswers = [...answers, { questionId: q.id, points: opt.points, text: opt.text, optionIndex: selectedOption }];
        setAnswers(newAnswers);
        setSelectedOption(null);

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
        setIsSaving(true);
        try {
            const { data } = await api.patch(`/interests/${interestId}/assess`, { answers: finalAnswers });
            setResult(data);
        } catch (err) {
            console.error(err);
        } finally {
            setIsSaving(false);
        }
    };

    const lvl = result ? LEVEL_CONFIG[result.level] || LEVEL_CONFIG.BEGINNER : null;
    const pct = result ? Math.round((result.totalScore / result.maxScore) * 100) : 0;

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex justify-between items-center px-6 py-4 border-b border-gray-800 flex-shrink-0">
                    <div>
                        <h3 className="text-white font-bold text-lg capitalize">
                            {subCategory} Assessment
                            {position && <span className="ml-2 text-gray-400 text-sm font-normal">
                                · {positions.find(p => p.id === position)?.emoji} {positions.find(p => p.id === position)?.label}
                            </span>}
                        </h3>
                        {!result && !needsPositionPick && questions.length > 0 && (
                            <p className="text-gray-500 text-xs mt-0.5">
                                Question {current + 1} of {questions.length}
                            </p>
                        )}
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                {/* Progress bar */}
                {!result && !needsPositionPick && (
                    <div className="h-1 bg-gray-800 flex-shrink-0">
                        <div
                            className={`h-full bg-gradient-to-r ${categoryColor} transition-all duration-500`}
                            style={{ width: `${progress}%` }}
                        />
                    </div>
                )}

                {/* ── POSITION PICKER (football only) ── */}
                {needsPositionPick ? (
                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        <p className="text-white font-bold text-lg mb-1">
                            {lang === 'tr' ? 'Hangi mevkide oynuyorsun?' : lang === 'ru' ? 'На какой позиции ты играешь?' : 'Which position do you play?'}
                        </p>
                        <p className="text-gray-500 text-sm mb-5">
                            {lang === 'tr' ? 'Sorular seçtiğin mevkiye göre özelleştirilecek.' : lang === 'ru' ? 'Вопросы будут адаптированы под выбранную позицию.' : 'Questions will be tailored to your position.'}
                        </p>
                        <div className="space-y-2.5">
                            {positions.map(pos => (
                                <button key={pos.id} onClick={() => setPosition(pos.id)}
                                    className={`w-full flex items-center gap-4 px-4 py-3.5 rounded-xl border font-medium text-sm transition-all bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500 hover:bg-gray-750`}>
                                    <span className="text-2xl">{pos.emoji}</span>
                                    <div className="text-left">
                                        <p className="text-white font-bold">{pos.label}</p>
                                        <p className="text-gray-500 text-xs">{pos.desc}</p>
                                    </div>
                                    <span className="ml-auto text-gray-600">→</span>
                                </button>
                            ))}
                        </div>
                    </div>

                ) : isLoading ? (
                    /* Loading */
                    <div className="flex-1 flex items-center justify-center py-12">
                        <div className="text-center">
                            <div className="w-10 h-10 rounded-full border-4 border-purple-500 border-t-transparent animate-spin mx-auto mb-3" />
                            <p className="text-gray-400 text-sm">Loading questions...</p>
                        </div>
                    </div>

                ) : result ? (
                    /* ── RESULT SCREEN ── */
                    <div className="flex-1 flex flex-col items-center justify-center px-8 py-8 text-center">
                        <div className={`w-24 h-24 rounded-full bg-gradient-to-b ${lvl.color} flex items-center justify-center mb-5 shadow-lg`}>
                            <span className="text-4xl">{lvl.badge}</span>
                        </div>
                        <h2 className="text-white font-black text-3xl mb-1">{lvl.label}</h2>
                        <div className="flex items-baseline gap-2 mb-1">
                            <span className={`font-black text-5xl bg-gradient-to-r ${lvl.color} bg-clip-text text-transparent`}>
                                {result.skillRating?.toFixed(2)}
                            </span>
                            <span className="text-gray-500 text-xl font-bold">/ 5</span>
                        </div>
                        <p className="text-gray-500 text-xs mb-4">{result.totalPoints} pts · {result.totalScore}/{result.maxScore} score</p>

                        <div className="w-full bg-gray-800 rounded-full h-3 mb-2">
                            <div
                                className={`h-full rounded-full bg-gradient-to-r ${lvl.color} transition-all duration-1000`}
                                style={{ width: `${pct}%` }}
                            />
                        </div>
                        <p className="text-gray-500 text-sm mb-6">
                            {result.totalScore} / {result.maxScore} points ({pct}%)
                        </p>

                        <div className="w-full grid grid-cols-4 gap-2 mb-6">
                            {[
                                { key: 'BEGINNER',     range: '0–27%' },
                                { key: 'INTERMEDIATE', range: '28–55%' },
                                { key: 'ADVANCED',     range: '56–79%' },
                                { key: 'PRO',          range: '80%+' },
                            ].map(item => {
                                const cfg = LEVEL_CONFIG[item.key];
                                const active = result.level === item.key;
                                return (
                                    <div key={item.key}
                                        className={`rounded-xl p-2 text-center border transition ${active ? `${cfg.bg} border-current` : 'bg-gray-800/50 border-gray-700'}`}>
                                        <p className="text-base">{cfg.badge}</p>
                                        <p className={`text-xs font-bold ${active ? cfg.text : 'text-gray-500'}`}>{cfg.label}</p>
                                        <p className="text-gray-600 text-[9px]">{item.range}</p>
                                    </div>
                                );
                            })}
                        </div>

                        <button
                            onClick={() => { onComplete({ ...result }); onClose(); }}
                            className={`w-full bg-gradient-to-r ${categoryColor} text-white font-black py-3 rounded-xl text-base hover:opacity-90 transition`}>
                            View my profile →
                        </button>
                        <p className="text-gray-600 text-xs mt-3">
                            You can retake this assessment anytime from your profile
                        </p>
                    </div>

                ) : q ? (
                    /* ── QUESTION SCREEN ── */
                    <div className="flex-1 overflow-y-auto px-6 py-6">
                        <p className="text-white font-bold text-lg mb-6 leading-snug">{q.question}</p>
                        <div className="space-y-3">
                            {q.options.map((opt, i) => (
                                <button key={i} onClick={() => setSelectedOption(i)}
                                    className={`w-full text-left px-4 py-3.5 rounded-xl border font-medium text-sm transition-all ${
                                        selectedOption === i
                                            ? `bg-gradient-to-r ${categoryColor} text-white border-transparent shadow-lg scale-[1.01]`
                                            : 'bg-gray-800 border-gray-700 text-gray-300 hover:border-gray-500 hover:bg-gray-750'
                                    }`}>
                                    <div className="flex items-center gap-3">
                                        <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition ${
                                            selectedOption === i ? 'border-white bg-white/20' : 'border-gray-600'
                                        }`}>
                                            {selectedOption === i && <div className="w-2 h-2 rounded-full bg-white" />}
                                        </div>
                                        <span>{opt.text}</span>
                                    </div>
                                </button>
                            ))}
                        </div>
                    </div>
                ) : null}

                {/* Footer button — only for question screen */}
                {!result && !needsPositionPick && !isLoading && (
                    <div className="px-6 py-4 border-t border-gray-800 flex-shrink-0">
                        <button onClick={handleNext} disabled={selectedOption === null || isSaving}
                            className={`w-full bg-gradient-to-r ${categoryColor} text-white font-black py-3 rounded-xl text-base disabled:opacity-40 hover:opacity-90 transition`}>
                            {isSaving ? 'Saving...' : current + 1 < questions.length ? 'Next →' : 'See Results 🎯'}
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
