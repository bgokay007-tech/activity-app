import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import Navbar from '../../components/Navbar';
import { INPUT, LABEL, PRIMARY_BTN, MediaStrip, Stars, uploadFiles } from './travelShared';

export default function TravelRouteDetailPage() {
    const { t } = useTranslation();
    const tv = (k, o) => t(`travel.${k}`, o);
    const navigate = useNavigate();
    const { routeId } = useParams();
    const myId = useSelector(st => st.auth.user?.id);
    const fileRef = useRef(null);
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [viewer, setViewer] = useState(null);
    const [myRating, setMyRating] = useState(0);
    const [myComment, setMyComment] = useState('');
    const [sending, setSending] = useState(false);
    const [uploading, setUploading] = useState(false);

    const load = useCallback(async () => {
        try {
            const { data: r } = await api.get(`/travel/routes/${routeId}`);
            setData(r);
        } catch { setData(null); }
        finally { setLoading(false); }
    }, [routeId]);

    useEffect(() => { load(); }, [load]);

    useEffect(() => {
        const mine = data?.reviews?.find(r => r.userId === myId);
        if (mine) { setMyRating(mine.rating); setMyComment(mine.comment || ''); }
    }, [data, myId]);

    const isOwner = data && data.userId === myId;

    const sendReview = async () => {
        if (!myRating) { alert(tv('tvPickRating')); return; }
        setSending(true);
        try {
            await api.post(`/travel/routes/${routeId}/reviews`, { rating: myRating, comment: myComment });
            alert(tv('tvReviewSaved'));
            load();
        } catch (e) {
            alert(e?.response?.data?.message || tv('actionFailed'));
        } finally { setSending(false); }
    };

    const onFiles = async (e) => {
        const files = e.target.files;
        if (!files?.length) return;
        setUploading(true);
        try {
            const added = await uploadFiles(files);
            if (added.length) {
                await api.post(`/travel/routes/${routeId}/media`, { media: added });
                load();
            }
        } catch (err) {
            alert(err?.response?.data?.message || tv('actionFailed'));
        } finally { setUploading(false); e.target.value = ''; }
    };

    const deleteRoute = async () => {
        if (!window.confirm(tv('tvDeleteRouteQ'))) return;
        try { await api.delete(`/travel/routes/${routeId}`); navigate('/travel', { replace: true }); }
        catch (e) { alert(e?.response?.data?.message || tv('actionFailed')); }
    };

    const media = Array.isArray(data?.media) ? data.media : [];

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title={tv('tvTitle')} />
            {loading ? <p className="text-gray-500 text-center py-16">…</p> : !data ? (
                <p className="text-gray-500 text-center py-16">{tv('actionFailed')}</p>
            ) : (
                <div className="max-w-3xl mx-auto px-4 py-6 pb-24">
                    <div className="flex items-center justify-between gap-3 mb-3">
                        <h2 className="text-white text-2xl font-black">{data.title}</h2>
                        {isOwner && (
                            <button onClick={deleteRoute} title={tv('tvDeleteRoute')} className="text-red-400 text-xl hover:scale-110 transition">🗑</button>
                        )}
                    </div>

                    {media.length > 0 && (
                        <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory rounded-2xl">
                            {media.map((m, i) => (
                                <button key={`${m.url}-${i}`} onClick={() => setViewer(m)} className="snap-start shrink-0 w-full sm:w-2/3">
                                    {m.type === 'image'
                                        ? <img src={m.url} alt="" className="w-full aspect-[3/2] object-cover rounded-2xl" />
                                        : <div className="w-full aspect-[3/2] bg-gray-800 rounded-2xl flex items-center justify-center text-6xl">▶️</div>}
                                </button>
                            ))}
                        </div>
                    )}

                    <p className="text-white font-black mt-4">📍 {data.startPlace}{data.endPlace ? ` → ${data.endPlace}` : ''}</p>
                    <div className="flex flex-wrap gap-2 mt-2 items-center">
                        <span className="text-yellow-400 font-bold text-sm">★ {data.ratingCount ? data.ratingAvg.toFixed(1) : '—'} ({tv('tvRatingCount', { n: data.ratingCount || 0 })})</span>
                        {data.difficulty && <span className="text-sky-400 border border-sky-500/60 rounded-lg px-2 text-xs font-bold">{tv('tvDifficulty')}: {tv(`tvDiff${data.difficulty}`)}</span>}
                        {data.distanceKm ? <span className="text-sky-400 border border-sky-500/60 rounded-lg px-2 text-xs font-bold">{data.distanceKm} km</span> : null}
                        {data.durationText && <span className="text-sky-400 border border-sky-500/60 rounded-lg px-2 text-xs font-bold">⏱ {data.durationText}</span>}
                    </div>
                    <p className="text-gray-500 text-xs mt-2">{tv('tvByUser', { n: data.user?.fullName || data.user?.username || '' })}</p>

                    {data.stops?.length > 0 && (
                        <>
                            <p className={LABEL}>{tv('tvStops')}</p>
                            {data.stops.map((st, i) => <p key={i} className="text-gray-300 text-sm">• {st}</p>)}
                        </>
                    )}

                    {data.experience && (
                        <>
                            <p className={LABEL}>{tv('tvExperience')}</p>
                            <p className="text-gray-300 text-sm whitespace-pre-line leading-relaxed">{data.experience}</p>
                        </>
                    )}

                    {isOwner ? (
                        <>
                            <input ref={fileRef} type="file" accept="image/*,video/*" multiple hidden onChange={onFiles} />
                            <button onClick={() => fileRef.current?.click()} disabled={uploading}
                                className="w-full border border-dashed border-sky-500 rounded-xl py-3.5 text-sky-400 font-bold text-sm mt-5">
                                {uploading ? tv('tvUploading') : tv('tvAddMedia')}
                            </button>
                        </>
                    ) : (
                        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mt-5">
                            <p className="text-white font-black mb-2">{tv('tvRateThis')}</p>
                            <Stars value={myRating} onChange={setMyRating} />
                            <textarea className={`${INPUT} min-h-20 mt-3`} value={myComment} onChange={e => setMyComment(e.target.value)} placeholder={tv('tvYourComment')} />
                            <button className={`${PRIMARY_BTN} mt-3`} onClick={sendReview} disabled={sending}>{sending ? '…' : tv('tvSendReview')}</button>
                        </div>
                    )}

                    <p className="text-white font-black text-base mt-6 mb-2">{tv('tvReviews')}</p>
                    {(data.reviews || []).length === 0 && <p className="text-gray-500 text-sm">{tv('tvNoReviews')}</p>}
                    <div className="space-y-2">
                        {(data.reviews || []).map(rv => (
                            <div key={rv.id} className="bg-gray-900 border border-gray-800 rounded-2xl p-3">
                                <div className="flex items-center justify-between">
                                    <span className="text-white font-bold text-sm">{rv.user?.fullName || rv.user?.username}</span>
                                    <Stars value={rv.rating} size="text-sm" />
                                </div>
                                {rv.comment && <p className="text-gray-300 text-sm mt-1">{rv.comment}</p>}
                                <MediaStrip media={rv.media} onOpen={setViewer} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {viewer && (
                <div className="fixed inset-0 z-50 bg-black/95 flex items-center justify-center p-4" onClick={() => setViewer(null)}>
                    {viewer.type === 'video'
                        ? <video src={viewer.url} controls autoPlay className="max-w-full max-h-full" onClick={e => e.stopPropagation()} />
                        : <img src={viewer.url} alt="" className="max-w-full max-h-full object-contain" />}
                    <button onClick={() => setViewer(null)} className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/20 text-white text-lg font-black">✕</button>
                </div>
            )}
        </div>
    );
}
