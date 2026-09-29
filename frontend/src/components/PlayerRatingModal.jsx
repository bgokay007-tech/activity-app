import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

// Voleybol: kendi/antrenör/takım arkadaşı (backend dereceyle harmanlar).
// Tenis/padel/pickleball: aynı form ama /racquet-feedback üzerinden — ELO'ya YAZILMAZ,
// sadece geri bildirim (antrenör / maç arkadaşı / rakip).
const RACQUET_QUESTIONS = {
    questionFields: [
        'forehandDrive', 'backhandDrive', 'volley', 'smash',
        'agility', 'endurance', 'reflexes',
        'courtPositioning', 'shotSelection', 'teamCommunication',
    ],
    categories: [
        { key: 'technical', labelKey: 'racquetCatTechnical', fields: ['forehandDrive', 'backhandDrive', 'volley', 'smash'] },
        { key: 'physical',  labelKey: 'racquetCatPhysical',  fields: ['agility', 'endurance', 'reflexes'] },
        { key: 'tactical',  labelKey: 'racquetCatTactical',  fields: ['courtPositioning', 'shotSelection', 'teamCommunication'] },
    ],
    qPrefix: 'racquetQ',
};

const racquetCfg = (titleKey) => ({
    pathKind: 'racquet',
    titleKey,
    overallLabelKey: 'racquetFeedbackOverallLabel',
    selfLabelKey: 'racquetFeedbackEloNote',
    coachLabelKey: 'racquetFeedbackCoachLabel',
    teammateLabelKey: 'racquetFeedbackPeerLabel',
    noDataLabelKey: 'racquetFeedbackNoDataLabel',
    notEligibleKey: 'racquetFeedbackNotEligible',
    selfHintKey: 'racquetFeedbackSelfHint',
    submitBtnKey: 'racquetFeedbackSubmitBtn',
    submittedMsgKey: 'racquetFeedbackSubmittedMsg',
    submitFailedKey: 'racquetFeedbackSubmitFailed',
    commentsTitleKey: 'racquetFeedbackCommentsTitle',
    roleCoachKey: 'racquetFeedbackRoleCoach',
    roleTeammateKey: 'racquetFeedbackRoleTeammate',
    roleOpponentKey: 'racquetFeedbackRoleOpponent',
    section4TitleKey: 'racquetFeedbackSection4Title',
    section4HintKey: 'racquetFeedbackSection4Hint',
    strongestQKey: 'racquetFeedbackStrongestQ',
    weakestQKey: 'racquetFeedbackWeakestQ',
    generalNoteQKey: 'racquetFeedbackGeneralNoteQ',
    ...RACQUET_QUESTIONS,
});

const CONFIG = {
    volleyball: {
        pathKind: 'volleyball',
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
        qPrefix: 'volleyballQ',
    },
    tennis: racquetCfg('racquetFeedbackTitleTennis'),
    padel: racquetCfg('racquetFeedbackTitlePadel'),
    pickleball: racquetCfg('racquetFeedbackTitlePickleball'),
};

export const RATING_SUBS = Object.keys(CONFIG);

const qKey = (cfg, field, desc = false) =>
    `${cfg.qPrefix}${field[0].toUpperCase()}${field.slice(1)}${desc ? 'Desc' : ''}`;

function ScoreRow({ max, value, onChange }) {
    return (
        <div className="flex flex-wrap gap-1.5">
            {Array.from({ length: max }, (_, i) => i + 1).map(n => (
                <button key={n} type="button" onClick={() => onChange(n)}
                    className={`w-9 h-9 rounded-lg text-sm font-black border transition ${value === n ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400 hover:border-gray-500'}`}>
                    {n}
                </button>
            ))}
        </div>
    );
}

export default function PlayerRatingModal({ open, subjectId, subCategory = 'volleyball', onClose }) {
    const { t } = useTranslation();
    const r = (k, o) => t(`rating.${k}`, o);
    const cfg = CONFIG[subCategory] || CONFIG.volleyball;
    const apiPath = cfg.pathKind === 'racquet'
        ? `/racquet-feedback/${subCategory}/${subjectId}`
        : `/volleyball-rating/${subjectId}`;
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [saved, setSaved] = useState(false);
    const [data, setData] = useState(null);
    const [answers, setAnswers] = useState({});
    const [strongestPoint, setStrongestPoint] = useState('');
    const [weakestPoint, setWeakestPoint] = useState('');
    const [generalNote, setGeneralNote] = useState(0);

    useEffect(() => {
        if (!open || !subjectId) return;
        setData(null); setAnswers({}); setStrongestPoint(''); setWeakestPoint('');
        setGeneralNote(0); setSaved(false); setLoading(true);
        api.get(apiPath)
            .then(({ data }) => {
                setData(data);
                if (data.myRating) {
                    const a = {};
                    cfg.questionFields.forEach(f => { a[f] = data.myRating[f]; });
                    setAnswers(a);
                    setStrongestPoint(data.myRating.strongestPoint || '');
                    setWeakestPoint(data.myRating.weakestPoint || '');
                    setGeneralNote(data.myRating.generalPerformanceNote || 0);
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [open, subjectId, subCategory]);

    if (!open) return null;

    const roleLabel = (role) => {
        if (role === 'COACH') return r(cfg.roleCoachKey);
        if (role === 'OPPONENT' && cfg.roleOpponentKey) return r(cfg.roleOpponentKey);
        return r(cfg.roleTeammateKey);
    };
    const setAnswer = (field, val) => { setSaved(false); setAnswers(prev => ({ ...prev, [field]: val })); };
    const allAnswered = cfg.questionFields.every(f => answers[f] >= 1);
    const needsSection4 = ['COACH', 'TEAMMATE', 'OPPONENT'].includes(data?.myRole);
    const canSubmit = allAnswered && (!needsSection4 || generalNote >= 1);
    const fmt = (v) => (v != null ? Number(v).toFixed(2) : r(cfg.noDataLabelKey));

    const submit = async () => {
        if (!canSubmit || saving) return;
        setSaving(true);
        try {
            const { data: agg } = await api.post(apiPath, {
                ...answers,
                ...(needsSection4 ? { strongestPoint, weakestPoint, generalPerformanceNote: generalNote } : {}),
            });
            setData(prev => ({ ...prev, ...agg }));
            setSaved(true);
        } catch (e) {
            alert(e?.response?.data?.message || r(cfg.submitFailedKey));
        } finally { setSaving(false); }
    };

    const TEXTAREA = 'w-full bg-gray-950 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500 min-h-[64px]';

    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
                    <h3 className="text-white font-black text-lg">{r(cfg.titleKey)}</h3>
                    <button onClick={onClose} className="text-gray-500 hover:text-white text-xl">✕</button>
                </div>

                <div className="overflow-y-auto p-5 space-y-4">
                    {loading && <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>}

                    {!loading && data && (
                        <>
                            <div className="text-center bg-gray-900 border border-gray-800 rounded-xl py-4 space-y-1">
                                <p className="text-yellow-400 text-3xl font-black">{data.overallScore != null ? Number(data.overallScore).toFixed(2) : '—'}</p>
                                <p className="text-gray-500 text-[11px] font-bold">{r(cfg.overallLabelKey)}</p>
                                <p className="text-gray-400 text-xs">
                                    {cfg.pathKind === 'racquet' ? r(cfg.selfLabelKey) : `${r(cfg.selfLabelKey)}: ${fmt(data.selfScore)}`}
                                </p>
                                <div className="flex flex-wrap justify-center gap-x-4 text-gray-400 text-xs">
                                    <span>{r(cfg.coachLabelKey, { n: data.coachCount || 0 })}: {fmt(data.coachScore)}</span>
                                    <span>{r(cfg.teammateLabelKey, { n: data.teammateCount || data.peerCount || 0 })}: {fmt(data.teammateScore ?? data.peerScore)}</span>
                                </div>
                            </div>

                            {data.comments?.length > 0 && (
                                <div className="space-y-2">
                                    <p className="text-white text-sm font-black">{r(cfg.commentsTitleKey)}</p>
                                    {data.comments.map((c, i) => (
                                        <div key={i} className="bg-gray-900 border border-gray-800 rounded-xl p-3">
                                            <p className="text-gray-200 text-xs font-bold">
                                                {c.rater?.fullName || c.rater?.username || '?'} · {roleLabel(c.role)} · {c.overall}/5
                                                {c.generalPerformanceNote != null ? ` · ${c.generalPerformanceNote}/10` : ''}
                                            </p>
                                            {c.scores && (
                                                <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                    {cfg.questionFields.map(f => (
                                                        <span key={f} className="text-[10px] text-gray-400 bg-gray-800 rounded px-1.5 py-0.5">
                                                            {r(qKey(cfg, f))}: {c.scores[f]}
                                                        </span>
                                                    ))}
                                                </div>
                                            )}
                                            {c.strongestPoint && <p className="text-gray-300 text-xs mt-1">+ {c.strongestPoint}</p>}
                                            {c.weakestPoint && <p className="text-gray-300 text-xs">- {c.weakestPoint}</p>}
                                        </div>
                                    ))}
                                </div>
                            )}

                            {data.myRole === 'SELF' ? (
                                <p className="text-gray-400 text-sm text-center">{r(cfg.selfHintKey)}</p>
                            ) : data.myRole ? (
                                <>
                                    {cfg.categories.map(cat => (
                                        <div key={cat.key} className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 space-y-3">
                                            <p className="text-purple-300 text-sm font-black">{r(cat.labelKey)}</p>
                                            {cat.fields.map(f => (
                                                <div key={f} className="space-y-1.5">
                                                    <p className="text-white text-sm font-bold">{r(qKey(cfg, f))}</p>
                                                    <p className="text-gray-500 text-xs">{r(qKey(cfg, f, true))}</p>
                                                    <ScoreRow max={5} value={answers[f] || 0} onChange={v => setAnswer(f, v)} />
                                                </div>
                                            ))}
                                        </div>
                                    ))}

                                    {needsSection4 && (
                                        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-3 space-y-3">
                                            <p className="text-purple-300 text-sm font-black">{r(cfg.section4TitleKey)}</p>
                                            <p className="text-gray-500 text-xs">{r(cfg.section4HintKey)}</p>
                                            <div className="space-y-1.5">
                                                <p className="text-white text-sm font-bold">{r(cfg.strongestQKey)}</p>
                                                <textarea value={strongestPoint} onChange={e => { setSaved(false); setStrongestPoint(e.target.value); }} className={TEXTAREA} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <p className="text-white text-sm font-bold">{r(cfg.weakestQKey)}</p>
                                                <textarea value={weakestPoint} onChange={e => { setSaved(false); setWeakestPoint(e.target.value); }} className={TEXTAREA} />
                                            </div>
                                            <div className="space-y-1.5">
                                                <p className="text-white text-sm font-bold">{r(cfg.generalNoteQKey)}</p>
                                                <ScoreRow max={10} value={generalNote} onChange={v => { setSaved(false); setGeneralNote(v); }} />
                                            </div>
                                        </div>
                                    )}

                                    <button onClick={submit} disabled={!canSubmit || saving}
                                        className="w-full bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-3 rounded-xl disabled:opacity-40">
                                        {saving ? '...' : r(cfg.submitBtnKey)}
                                    </button>
                                    {saved && <p className="text-green-400 text-sm text-center font-bold">{r(cfg.submittedMsgKey)}</p>}
                                </>
                            ) : (
                                <p className="text-gray-400 text-sm text-center">{r(cfg.notEligibleKey)}</p>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}
