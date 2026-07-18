import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Navbar from '../components/Navbar';
import { onSocket, connectSocket } from '../services/socket';

function MatchesView({ t, myUser }) {
    const navigate = useNavigate();
    const [matches, setMatches] = useState([]);
    const [loading, setLoading] = useState(true);

    const load = useCallback(() => {
        setLoading(true);
        api.get('/friend-finding/matches').then(({ data }) => setMatches(data || [])).catch(() => {}).finally(() => setLoading(false));
    }, []);

    useEffect(() => { load(); }, [load]);

    const openChat = (user) => navigate(`/messages/${user.id}`);

    if (loading) return <p className="text-gray-500 text-sm text-center py-16">{t('common.loading')}</p>;
    if (matches.length === 0) return (
        <div className="text-center py-16">
            <p className="text-5xl mb-3">💌</p>
            <p className="text-gray-400 text-sm">{t('friendFinding.no_matches')}</p>
        </div>
    );
    return (
        <div className="space-y-2">
            {matches.map(m => (
                <button key={m.id} onClick={() => openChat(m.user)}
                    className="w-full flex items-center gap-3 bg-gray-900 border border-gray-800 rounded-2xl p-3 hover:border-gray-700 transition text-left">
                    <div className="w-12 h-12 rounded-full bg-gray-800 flex items-center justify-center text-xl flex-shrink-0">👤</div>
                    <div className="flex-1 min-w-0">
                        <p className="text-white font-bold text-sm truncate">{m.user.fullName || m.user.username}</p>
                        <p className="text-gray-500 text-xs truncate">@{m.user.username}</p>
                    </div>
                    <span className="text-lg">💬</span>
                </button>
            ))}
        </div>
    );
}

function SwipeView({ t }) {
    const [profile, setProfile] = useState(null);
    const [candidates, setCandidates] = useState([]);
    const [index, setIndex] = useState(0);
    const [loading, setLoading] = useState(true);
    const [swiping, setSwiping] = useState(false);
    const [locationReady, setLocationReady] = useState(false);
    const [locationError, setLocationError] = useState(false);

    const ensureLocation = () => new Promise((resolve) => {
        if (!navigator.geolocation) { setLocationError(true); resolve(false); return; }
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                try {
                    await api.post('/friend-finding/location', { lat: pos.coords.latitude, lng: pos.coords.longitude });
                    resolve(true);
                } catch { setLocationError(true); resolve(false); }
            },
            () => { setLocationError(true); resolve(false); },
            { enableHighAccuracy: false, timeout: 8000 },
        );
    });

    const loadCandidates = useCallback(async () => {
        setLoading(true);
        setLocationError(false);
        try {
            const { data: myProfile } = await api.get('/friend-finding/profile');
            setProfile(myProfile);
            if (!myProfile) { setLoading(false); return; }
            const ok = await ensureLocation();
            setLocationReady(ok);
            if (!ok) { setLoading(false); return; }
            const { data } = await api.get('/friend-finding/candidates');
            setCandidates(data || []);
            setIndex(0);
        } catch (e) { console.error(e); }
        finally { setLoading(false); }
    }, []);

    useEffect(() => { loadCandidates(); }, [loadCandidates]);

    const toggleActive = async () => {
        if (!profile) return;
        try {
            const { data } = await api.patch('/friend-finding/profile', { active: !profile.active });
            setProfile(data);
        } catch (e) { console.error(e); }
    };

    const current = candidates[index];

    const doSwipe = async (decision) => {
        if (!current || swiping) return;
        setSwiping(true);
        try {
            const { data } = await api.post('/friend-finding/swipe', { targetId: current.id, decision });
            if (data.matched) alert(t('friendFinding.match_with', { name: current.fullName || current.username }));
        } catch (e) { console.error(e); }
        finally { setSwiping(false); setIndex(i => i + 1); }
    };

    return (
        <div>
            {profile && (
                <div className="flex items-center justify-between mb-4">
                    <span className="text-gray-400 text-sm font-bold">{t('friendFinding.active_label')}</span>
                    <button onClick={toggleActive} className={`w-12 h-7 rounded-full border relative transition ${profile.active ? 'bg-amber-600/60 border-amber-500' : 'bg-gray-800 border-gray-700'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full transition ${profile.active ? 'right-0.5 bg-amber-400' : 'left-0.5 bg-gray-500'}`} />
                    </button>
                </div>
            )}

            {loading ? (
                <p className="text-gray-500 text-sm text-center py-16">{t('common.loading')}</p>
            ) : !profile ? (
                <div className="text-center py-16">
                    <p className="text-gray-400 text-sm max-w-sm mx-auto">{t('friendFinding.no_profile')}</p>
                </div>
            ) : !locationReady ? (
                <div className="text-center py-16">
                    <p className="text-gray-400 text-sm max-w-sm mx-auto mb-4">{t('friendFinding.location_required')}</p>
                    <button onClick={loadCandidates} className="bg-gray-800 border border-gray-700 text-white text-sm font-bold px-4 py-2 rounded-xl">
                        {t('friendFinding.retry')}
                    </button>
                </div>
            ) : !current ? (
                <div className="text-center py-16">
                    <p className="text-5xl mb-3">🔍</p>
                    <p className="text-gray-400 text-sm mb-4">{t('friendFinding.no_more')}</p>
                    <button onClick={loadCandidates} className="bg-gray-800 border border-gray-700 text-white text-sm font-bold px-4 py-2 rounded-xl">
                        {t('friendFinding.retry')}
                    </button>
                </div>
            ) : (
                <div className="max-w-sm mx-auto">
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 flex flex-col items-center">
                        <div className="w-24 h-24 rounded-full bg-gray-800 flex items-center justify-center text-4xl mb-3">👤</div>
                        <p className="text-white text-xl font-black">{current.fullName || current.username}{current.age ? `, ${current.age}` : ''}</p>
                        <p className="text-gray-500 text-sm mt-1">
                            {[current.city, current.distanceKm != null ? t('friendFinding.distance_away', { km: current.distanceKm }) : null].filter(Boolean).join(' · ')}
                        </p>
                        {current.compatibility != null && (
                            <p className="text-amber-400 text-sm font-bold mt-2">{t('friendFinding.compatibility', { pct: current.compatibility })}</p>
                        )}
                        {current.sharedInterests?.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 justify-center mt-3">
                                {current.sharedInterests.map(tag => (
                                    <span key={tag} className="bg-amber-500/10 border border-amber-500/40 text-amber-400 text-xs font-bold rounded-full px-2.5 py-1">{tag}</span>
                                ))}
                            </div>
                        )}
                    </div>
                    <div className="flex gap-3 mt-5">
                        <button onClick={() => doSwipe('PASS')} disabled={swiping}
                            className="flex-1 bg-gray-900 border border-gray-700 text-gray-300 font-bold py-3.5 rounded-2xl disabled:opacity-50 hover:bg-gray-800 transition">
                            ✕ {t('friendFinding.pass')}
                        </button>
                        <button onClick={() => doSwipe('LIKE')} disabled={swiping}
                            className="flex-1 bg-amber-500/20 border border-amber-500 text-amber-400 font-bold py-3.5 rounded-2xl disabled:opacity-50 hover:bg-amber-500/30 transition">
                            ♥ {t('friendFinding.like')}
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

function FriendFindingPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const myUser = useSelector(s => s.auth.user);
    const [tab, setTab] = useState('swipe');

    useEffect(() => {
        if (myUser?.id) connectSocket(myUser.id);
        const off = onSocket('friendMatchFound', () => alert(t('friendFinding.match_title')));
        return off;
    }, [myUser, t]);

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title={t('friendFinding.title')} />
            <div className="max-w-xl mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-black text-amber-400">🎉 {t('friendFinding.title')}</h1>
                    <div className="flex gap-2">
                        <button onClick={() => setTab('swipe')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${tab === 'swipe' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                            🔍
                        </button>
                        <button onClick={() => setTab('matches')} className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${tab === 'matches' ? 'bg-amber-600 border-amber-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                            {t('friendFinding.matches_tab')}
                        </button>
                    </div>
                </div>
                {tab === 'swipe' ? <SwipeView t={t} /> : <MatchesView t={t} myUser={myUser} />}
            </div>
        </div>
    );
}

export default FriendFindingPage;
