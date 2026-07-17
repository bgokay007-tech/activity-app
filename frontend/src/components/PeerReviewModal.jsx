import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import api from '../services/api';

function StarRow({ value, onChange }) {
    return (
        <div className="flex gap-1">
            {[1, 2, 3, 4, 5].map(n => (
                <button key={n} type="button" onClick={() => onChange(n)}
                    className={`text-xl leading-none transition ${n <= value ? 'text-yellow-400' : 'text-gray-700 hover:text-gray-500'}`}>
                    ★
                </button>
            ))}
        </div>
    );
}

export default function PeerReviewModal({ rivalId, onClose }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [targets, setTargets] = useState([]);
    const [ratings, setRatings] = useState({}); // { [userId]: { technical, mental } }
    const [submittedIds, setSubmittedIds] = useState(new Set());
    const [submittingId, setSubmittingId] = useState(null);

    useEffect(() => {
        if (!rivalId) return;
        setLoading(true);
        api.get(`/rivals/${rivalId}/peer-review-targets`)
            .then(({ data }) => setTargets(data.targets || []))
            .catch(console.error)
            .finally(() => setLoading(false));
    }, [rivalId]);

    const setRating = (userId, field, value) => {
        setRatings(p => ({ ...p, [userId]: { ...p[userId], [field]: value } }));
    };

    const submitFor = async (userId) => {
        const r = ratings[userId];
        if (!r?.technical || !r?.mental) return;
        setSubmittingId(userId);
        try {
            await api.post(`/rivals/${rivalId}/peer-review`, {
                revieweeId: userId,
                technicalStars: r.technical,
                mentalStars: r.mental,
            });
            setSubmittedIds(prev => new Set([...prev, userId]));
        } catch (e) { console.error(e); }
        finally { setSubmittingId(null); }
    };

    const allDone = !loading && targets.length > 0 && targets.every(u => submittedIds.has(u.id));

    return (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
            <div className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-lg flex flex-col max-h-[90vh]">
                <div className="flex justify-between items-start px-6 py-4 border-b border-gray-800 flex-shrink-0">
                    <div>
                        <h3 className="text-white font-bold text-lg">{t('peerReview.title')}</h3>
                        <p className="text-gray-500 text-xs mt-1 leading-relaxed">{t('peerReview.subtitle')}</p>
                    </div>
                    <button onClick={onClose} className="text-gray-400 hover:text-white text-xl">✕</button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-3">
                    {loading && (
                        <div className="flex justify-center py-10">
                            <div className="w-8 h-8 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
                        </div>
                    )}

                    {!loading && targets.length === 0 && (
                        <p className="text-gray-500 text-sm text-center mt-10">{t('peerReview.no_targets')}</p>
                    )}

                    {!loading && targets.map(u => {
                        const done = submittedIds.has(u.id);
                        const r = ratings[u.id] || {};
                        return (
                            <div key={u.id} className={`bg-gray-800 border border-gray-700 rounded-2xl p-4 space-y-2.5 ${done ? 'opacity-60' : ''}`}>
                                <div className="flex items-center gap-2.5">
                                    {u.avatar
                                        ? <img src={u.avatar} alt="" className="w-9 h-9 rounded-full object-cover" />
                                        : <div className="w-9 h-9 rounded-full bg-purple-600/30 flex items-center justify-center text-purple-300 font-black text-sm">
                                            {(u.fullName || u.username || '?')[0]?.toUpperCase()}
                                          </div>
                                    }
                                    <p className="text-white text-sm font-bold flex-1">{u.fullName || u.username}</p>
                                    {done && <span className="text-green-400 text-xs font-bold">✓ {t('peerReview.submitted')}</span>}
                                </div>

                                {!done && (
                                    <>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-400 text-xs font-semibold">{t('peerReview.technical')}</span>
                                            <StarRow value={r.technical || 0} onChange={v => setRating(u.id, 'technical', v)} />
                                        </div>
                                        <div className="flex items-center justify-between">
                                            <span className="text-gray-400 text-xs font-semibold">{t('peerReview.mental')}</span>
                                            <StarRow value={r.mental || 0} onChange={v => setRating(u.id, 'mental', v)} />
                                        </div>
                                        <button
                                            onClick={() => submitFor(u.id)}
                                            disabled={!r.technical || !r.mental || submittingId === u.id}
                                            className="w-full bg-purple-600 hover:bg-purple-500 disabled:opacity-40 text-white font-bold py-2 rounded-xl text-sm transition">
                                            {submittingId === u.id ? t('common.loading') : t('peerReview.submit')}
                                        </button>
                                    </>
                                )}
                            </div>
                        );
                    })}

                    {allDone && (
                        <div className="text-center pt-2 space-y-3">
                            <p className="text-gray-400 text-sm">{t('peerReview.all_done')}</p>
                            <button onClick={onClose} className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-2.5 px-8 rounded-xl text-sm transition">
                                ✓ {t('common.close')}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
