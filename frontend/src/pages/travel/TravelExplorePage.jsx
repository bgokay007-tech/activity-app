import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../../services/api';
import Navbar from '../../components/Navbar';
import { INPUT, PRIMARY_BTN, chip, formatTripDate } from './travelShared';

export default function TravelExplorePage() {
    const { t } = useTranslation();
    const tv = (k, o) => t(`travel.${k}`, o);
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab') === 'travel' ? 'travel' : 'explore';
    const setTab = (k) => setSearchParams(k === 'travel' ? { tab: 'travel' } : {}, { replace: true });

    const [routes, setRoutes] = useState([]);
    const [routeSort, setRouteSort] = useState('new');
    const [routeQuery, setRouteQuery] = useState('');
    const [loadingRoutes, setLoadingRoutes] = useState(true);

    const [trips, setTrips] = useState([]);
    const [tripScope, setTripScope] = useState('all');
    const [fromQ, setFromQ] = useState('');
    const [toQ, setToQ] = useState('');
    const [loadingTrips, setLoadingTrips] = useState(true);
    const [verification, setVerification] = useState(null);
    const searchTimer = useRef(null);

    const loadRoutes = useCallback(async (sort, q) => {
        try {
            const params = sort === 'mine' ? { mine: 'true' } : { sort, q: q.trim() || undefined };
            const { data } = await api.get('/travel/routes', { params });
            setRoutes(Array.isArray(data) ? data : []);
        } catch { setRoutes([]); }
        finally { setLoadingRoutes(false); }
    }, []);

    const loadTrips = useCallback(async (scope, from, to) => {
        try {
            const params = scope === 'mine' ? { mine: 'true' } : { from: from.trim() || undefined, to: to.trim() || undefined };
            const [{ data }, { data: v }] = await Promise.all([
                api.get('/travel/trips', { params }),
                api.get('/travel/verification'),
            ]);
            setTrips(Array.isArray(data) ? data : []);
            setVerification(v || null);
        } catch { setTrips([]); }
        finally { setLoadingTrips(false); }
    }, []);

    useEffect(() => {
        loadRoutes('new', '');
        loadTrips('all', '', '');
    }, [loadRoutes, loadTrips]);

    const debounced = (fn) => {
        clearTimeout(searchTimer.current);
        searchTimer.current = setTimeout(fn, 350);
    };

    const onCreateTrip = () => navigate(verification?.status === 'APPROVED' ? '/travel/trips/new' : '/travel/verify');

    const verifyBanner = () => {
        if (verification?.status === 'APPROVED') {
            return <p className="text-green-400 bg-green-500/10 rounded-xl p-3 mt-2 text-sm font-bold">{tv('tvVerifyApproved')}</p>;
        }
        const text = verification?.status === 'PENDING' ? tv('tvVerifyPending')
            : verification?.status === 'REJECTED'
                ? (verification.adminNote ? tv('tvVerifyRejected', { note: verification.adminNote }) : tv('tvVerifyRejected_plain'))
                : tv('tvVerifyBanner');
        return (
            <button onClick={() => navigate('/travel/verify')} className="w-full text-left bg-amber-500/10 border border-amber-500/40 rounded-xl p-3 mt-2 space-y-1.5">
                <p className="text-amber-400 text-sm font-bold">🛡️ {text}</p>
                {verification?.status !== 'PENDING' && <p className="text-sky-400 text-sm font-black">{tv('tvVerifyBtn')} →</p>}
            </button>
        );
    };

    const renderRouteCard = (r) => {
        const cover = (r.media || []).find(m => m.type === 'image');
        const hasVideo = (r.media || []).some(m => m.type === 'video');
        return (
            <button key={r.id} onClick={() => navigate(`/travel/routes/${r.id}`)}
                className="flex text-left bg-gray-900 border border-gray-800 hover:border-sky-500/60 rounded-2xl overflow-hidden transition">
                {cover
                    ? <img src={cover.url} alt="" className="w-28 h-28 object-cover shrink-0" />
                    : <div className="w-28 h-28 shrink-0 bg-gray-800 flex items-center justify-center text-4xl">{hasVideo ? '🎬' : '🗺️'}</div>}
                <div className="flex-1 min-w-0 p-3 space-y-1">
                    <p className="text-white font-black truncate">{r.title}</p>
                    <p className="text-gray-500 text-xs truncate">📍 {r.startPlace}{r.endPlace ? ` → ${r.endPlace}` : ''}</p>
                    <div className="flex items-center justify-between gap-2">
                        <span className="text-yellow-400 text-sm font-bold">
                            ★ {r.ratingCount ? r.ratingAvg.toFixed(1) : '—'} <span className="text-gray-500 text-xs">({tv('tvRatingCount', { n: r.ratingCount || 0 })})</span>
                        </span>
                        {r.difficulty && <span className="text-sky-400 border border-sky-500 rounded-md px-1.5 text-[10px] font-bold">{tv(`tvDiff${r.difficulty}`)}</span>}
                    </div>
                    <p className="text-gray-500 text-xs truncate">{tv('tvByUser', { n: r.user?.fullName || r.user?.username || '' })}</p>
                </div>
            </button>
        );
    };

    const renderTripCard = (tr) => (
        <button key={tr.id} onClick={() => navigate(`/travel/trips/${tr.id}`)}
            className="w-full text-left bg-gray-900 border border-gray-800 hover:border-sky-500/60 rounded-2xl p-3 space-y-1 transition">
            <div className="flex items-center justify-between gap-2">
                <p className="text-white font-black truncate">{tr.fromPlace} → {tr.toPlace}</p>
                {tr.status === 'CANCELLED'
                    ? <span className="text-red-400 border border-red-500 rounded-md px-1.5 text-[10px] font-bold">{tv('tvTripCancelled')}</span>
                    : <span className="text-green-500 font-black text-sm shrink-0">{tr.pricePerSeat > 0 ? tv('tvPerSeat', { p: tr.pricePerSeat }) : tv('tvFree')}</span>}
            </div>
            {tr.waypoints?.length > 0 && <p className="text-gray-500 text-xs truncate">↳ {tr.waypoints.join(' · ')}</p>}
            <p className="text-gray-500 text-xs">🕒 {formatTripDate(tr.departAt)}</p>
            <div className="flex items-center justify-between gap-2">
                <p className="text-gray-500 text-xs truncate">
                    👤 {tr.user?.fullName || tr.user?.username}{tr.user?.travelVerified ? `  ${tv('tvVerifiedBadge')}` : ''}
                </p>
                <span className="text-sky-400 text-xs font-bold shrink-0">{tv('tvSeatsLeft', { n: tr.seatsLeft })}</span>
            </div>
            {tr.requestCount > 0 && <p className="text-amber-500 text-xs font-bold">🔔 {tv('tvRequests')}: {tr.requestCount}</p>}
            {tr.myRequest && <p className="text-sky-400 text-xs font-bold">{tv(`tvReqStatus${tr.myRequest.status}`)}</p>}
        </button>
    );

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title={tv('tvTitle')} />
            <div className="max-w-3xl mx-auto px-4 py-6">
                <h2 className="text-white text-2xl font-black text-center mb-4">{tv('tvTitle')}</h2>
                <div className="flex bg-gray-900 rounded-2xl p-1 mb-2">
                    {[['explore', tv('tvTabExplore')], ['travel', tv('tvTabTravel')]].map(([k, label]) => (
                        <button key={k} onClick={() => setTab(k)}
                            className={`flex-1 py-2.5 rounded-xl text-sm font-black transition ${tab === k ? 'bg-sky-500/20 text-sky-400' : 'text-gray-400 hover:text-white'}`}>
                            {label}
                        </button>
                    ))}
                </div>

                {tab === 'explore' ? (
                    <>
                        <button className={`${PRIMARY_BTN} mt-3`} onClick={() => navigate('/travel/routes/new')}>{tv('tvCreateRoute')}</button>
                        <input
                            className={`${INPUT} mt-3`}
                            value={routeQuery}
                            onChange={e => {
                                const v = e.target.value;
                                setRouteQuery(v);
                                debounced(() => loadRoutes(routeSort === 'mine' ? 'new' : routeSort, v));
                            }}
                            placeholder={tv('tvSearchRoutes')}
                        />
                        <div className="flex gap-2 mt-3 flex-wrap">
                            {[['new', tv('tvSortNew')], ['top', tv('tvSortTop')], ['mine', tv('tvMine')]].map(([k, label]) => (
                                <button key={k} className={chip(routeSort === k)} onClick={() => { setRouteSort(k); setLoadingRoutes(true); loadRoutes(k, routeQuery); }}>{label}</button>
                            ))}
                        </div>
                        <h3 className="text-white font-black text-lg mt-5 mb-2">{tv('tvRoutesHeader')}</h3>
                        {loadingRoutes ? <p className="text-gray-500 text-center py-8">…</p>
                            : routes.length === 0 ? <p className="text-gray-500 text-center py-8">{tv('tvNoRoutes')}</p>
                            : <div className="grid gap-3 sm:grid-cols-2">{routes.map(renderRouteCard)}</div>}
                    </>
                ) : (
                    <>
                        {verifyBanner()}
                        <button className={`${PRIMARY_BTN} mt-3`} onClick={onCreateTrip}>{tv('tvCreateTrip')}</button>
                        <div className="flex gap-2 mt-3 flex-wrap">
                            {[['all', tv('tvAllTrips')], ['mine', tv('tvMyTrips')]].map(([k, label]) => (
                                <button key={k} className={chip(tripScope === k)} onClick={() => { setTripScope(k); setLoadingTrips(true); loadTrips(k, fromQ, toQ); }}>{label}</button>
                            ))}
                        </div>
                        {tripScope === 'all' && (
                            <div className="flex gap-2 mt-3">
                                <input className={INPUT} value={fromQ} placeholder={tv('tvFrom')}
                                    onChange={e => { const v = e.target.value; setFromQ(v); debounced(() => loadTrips('all', v, toQ)); }} />
                                <input className={INPUT} value={toQ} placeholder={tv('tvTo')}
                                    onChange={e => { const v = e.target.value; setToQ(v); debounced(() => loadTrips('all', fromQ, v)); }} />
                            </div>
                        )}
                        <div className="space-y-3 mt-3">
                            {loadingTrips ? <p className="text-gray-500 text-center py-8">…</p>
                                : trips.length === 0 ? <p className="text-gray-500 text-center py-8">{tv('tvNoTrips')}</p>
                                : trips.map(renderTripCard)}
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
