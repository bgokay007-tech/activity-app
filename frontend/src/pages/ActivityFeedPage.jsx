import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Navbar from '../components/Navbar';

const CAT_COLOR = {
    SPORTS: { text: 'text-green-400', bg: 'bg-green-500/15', border: 'border-green-500/40', grad: 'from-green-600 to-emerald-500' },
    SOCIAL: { text: 'text-blue-400',  bg: 'bg-blue-500/15',  border: 'border-blue-500/40',  grad: 'from-blue-600 to-cyan-500' },
    ARTS:   { text: 'text-pink-400',  bg: 'bg-pink-500/15',  border: 'border-pink-500/40',  grad: 'from-pink-600 to-rose-500' },
    GAMES:  { text: 'text-orange-400',bg: 'bg-orange-500/15',border: 'border-orange-500/40',grad: 'from-orange-600 to-amber-500' },
};

function feedSortTime(dateStr, timeStr) {
    if (!dateStr) return Date.now();
    const combined = dateStr.includes('T') ? dateStr : `${dateStr}T${timeStr || '00:00:00'}`;
    const t = new Date(combined).getTime();
    return Number.isNaN(t) ? Date.now() : t;
}

function fmtDate(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    return d.toLocaleDateString('tr-TR', { weekday: 'short', day: 'numeric', month: 'short' });
}

// ── Bildirim filtresi modalı ──
function ActivityAlertModal({ open, onClose, categories, onSaved }) {
    const { t } = useTranslation();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [cats, setCats] = useState([]);
    const [subs, setSubs] = useState([]);
    const [cities, setCities] = useState([]);
    const [cityInput, setCityInput] = useState('');
    const [useProximity, setUseProximity] = useState(false);
    const [radiusKm, setRadiusKm] = useState(25);
    const [artists, setArtists] = useState([]);
    const [artistInput, setArtistInput] = useState('');

    useEffect(() => {
        if (!open) return;
        setLoading(true);
        api.get('/activity-alerts/me').then(({ data }) => {
            setEnabled(!!data.enabled);
            setCats(data.categories || []);
            setSubs(data.subCategories || []);
            setCities(data.cities || []);
            setUseProximity(!!data.useProximity);
            setRadiusKm(data.radiusKm || 25);
            setArtists(data.favoriteArtists || []);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [open]);

    const toggleCat = (key) => {
        setCats(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            if (!next.includes(key)) {
                const catSubs = (categories.find(c => c.id === key)?.subCategories || []).map(s => s.id);
                setSubs(p => p.filter(s => !catSubs.includes(s)));
            }
            return next;
        });
    };
    const toggleSub = (key) => setSubs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    const addCity = () => {
        const v = cityInput.trim();
        if (v && !cities.some(c => c.toLowerCase() === v.toLowerCase())) setCities(prev => [...prev, v]);
        setCityInput('');
    };
    const addArtist = () => {
        const v = artistInput.trim();
        if (v && !artists.some(a => a.toLowerCase() === v.toLowerCase())) setArtists(prev => [...prev, v]);
        setArtistInput('');
    };

    const visibleSubs = (cats.length === 0 ? categories : categories.filter(c => cats.includes(c.id)))
        .flatMap(c => c.subCategories || []);

    const save = async () => {
        setSaving(true);
        try {
            await api.put('/activity-alerts/me', {
                enabled, categories: cats, subCategories: subs, cities,
                useProximity, radiusKm, favoriteArtists: artists,
            });
            onSaved?.(enabled);
            onClose();
        } catch (e) {
            alert(e?.response?.data?.message || t('activity.alert_save_failed'));
        } finally { setSaving(false); }
    };

    if (!open) return null;
    return (
        <div className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-gray-950 border border-gray-800 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto p-5" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-4">
                    <h3 className="text-white font-black text-lg">🔔 {t('activity.alert_title')}</h3>
                    <button onClick={() => setEnabled(v => !v)}
                        className={`w-12 h-7 rounded-full border transition relative ${enabled ? 'bg-purple-600/60 border-purple-500' : 'bg-gray-800 border-gray-700'}`}>
                        <span className={`absolute top-0.5 w-5 h-5 rounded-full transition ${enabled ? 'right-0.5 bg-purple-400' : 'left-0.5 bg-gray-500'}`} />
                    </button>
                </div>

                {loading ? <p className="text-gray-500 text-sm text-center py-10">{t('common.loading')}</p> : (
                    <div className="space-y-4">
                        <div>
                            <p className="text-gray-400 text-xs font-bold mb-2">{t('activity.alert_category')}</p>
                            <div className="flex flex-wrap gap-2">
                                {categories.map(cat => {
                                    const active = cats.includes(cat.id);
                                    const c = CAT_COLOR[cat.id] || CAT_COLOR.SPORTS;
                                    return (
                                        <button key={cat.id} onClick={() => toggleCat(cat.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${active ? `${c.bg} ${c.border} ${c.text}` : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                                            {cat.emoji} {cat.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <p className="text-gray-400 text-xs font-bold mb-2">{t('activity.alert_sub')}</p>
                            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                                {visibleSubs.map(sub => {
                                    const active = subs.includes(sub.id);
                                    return (
                                        <button key={sub.id} onClick={() => toggleSub(sub.id)}
                                            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${active ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                                            {sub.emoji} {sub.name}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        <div>
                            <p className="text-gray-400 text-xs font-bold mb-2">{t('activity.alert_city_label')}</p>
                            <div className="flex gap-2">
                                <input value={cityInput} onChange={e => setCityInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addCity()}
                                    placeholder={t('activity.alert_city_ph')}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                                <button onClick={addCity} className="bg-purple-600 text-white text-xs font-bold px-4 rounded-lg">{t('activity.alert_add')}</button>
                            </div>
                            {cities.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {cities.map(c => (
                                        <button key={c} onClick={() => setCities(prev => prev.filter(x => x !== c))}
                                            className="bg-purple-600/15 border border-purple-500/40 text-purple-300 text-xs font-bold px-2.5 py-1 rounded-full">
                                            📍 {c}  ✕
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <button onClick={() => setUseProximity(v => !v)} className="flex items-center justify-between w-full">
                                <span className="text-gray-400 text-xs font-bold">📡 {t('activity.alert_proximity')}</span>
                                <span className={`w-10 h-6 rounded-full border relative transition ${useProximity ? 'bg-purple-600/60 border-purple-500' : 'bg-gray-800 border-gray-700'}`}>
                                    <span className={`absolute top-0.5 w-4 h-4 rounded-full transition ${useProximity ? 'right-0.5 bg-purple-400' : 'left-0.5 bg-gray-500'}`} />
                                </span>
                            </button>
                            {useProximity && (
                                <div className="flex gap-2 mt-2">
                                    {[10, 25, 50, 100].map(r => (
                                        <button key={r} onClick={() => setRadiusKm(r)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition ${radiusKm === r ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-700 text-gray-400'}`}>
                                            {r} km
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div>
                            <p className="text-gray-400 text-xs font-bold mb-2">🎵 {t('activity.alert_artist_label')}</p>
                            <div className="flex gap-2">
                                <input value={artistInput} onChange={e => setArtistInput(e.target.value)}
                                    onKeyDown={e => e.key === 'Enter' && addArtist()}
                                    placeholder={t('activity.alert_artist_ph')}
                                    className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                                <button onClick={addArtist} className="bg-purple-600 text-white text-xs font-bold px-4 rounded-lg">{t('activity.alert_add')}</button>
                            </div>
                            {artists.length > 0 && (
                                <div className="flex flex-wrap gap-2 mt-2">
                                    {artists.map(a => (
                                        <button key={a} onClick={() => setArtists(prev => prev.filter(x => x !== a))}
                                            className="bg-purple-600/15 border border-purple-500/40 text-purple-300 text-xs font-bold px-2.5 py-1 rounded-full">
                                            🎤 {a}  ✕
                                        </button>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}

                <div className="flex gap-3 mt-5">
                    <button onClick={onClose} className="flex-1 bg-gray-800 text-gray-300 font-bold py-2.5 rounded-xl border border-gray-700 hover:bg-gray-700 transition">
                        {t('activity.alert_cancel')}
                    </button>
                    <button onClick={save} disabled={saving}
                        className="flex-1 bg-gradient-to-r from-purple-600 to-blue-600 text-white font-bold py-2.5 rounded-xl disabled:opacity-50 hover:opacity-90 transition">
                        {saving ? '...' : t('activity.alert_save')}
                    </button>
                </div>
            </div>
        </div>
    );
}

function EventCard({ item, navigate, onJoin, joining, myId }) {
    const c = CAT_COLOR[item.category] || CAT_COLOR.SPORTS;
    const spots = (item.teamSize * 2) - 1 - (item.participants?.length || 0);
    return (
        <div onClick={() => navigate(`/category/${item.category?.toLowerCase()}/${item.subCategory}`)}
            className="bg-gray-900 border border-gray-800 hover:border-gray-700 rounded-2xl p-4 cursor-pointer transition flex gap-3">
            <div className={`w-1 rounded-full ${c.bg}`} />
            <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                    <div className="min-w-0">
                        <p className="text-white text-sm font-bold truncate">{item.subCategory?.toUpperCase()}{item.matchMode === 'COMPETITIVE' ? ' · Competitive' : ''}</p>
                        <p className="text-gray-500 text-xs truncate">{item.sender?.fullName || item.sender?.username || '—'}</p>
                    </div>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border flex-shrink-0 ${c.bg} ${c.border} ${c.text}`}>{item.category}</span>
                </div>
                <div className="flex flex-wrap gap-2 mt-1.5">
                    {item.matchDate && <span className="text-gray-400 text-[11px] bg-gray-800 rounded px-1.5 py-0.5">📅 {fmtDate(item.matchDate)}{item.matchTime ? ` · ${item.matchTime}` : ''}</span>}
                    {(item.location || item.courtAddress) && <span className="text-gray-400 text-[11px] bg-gray-800 rounded px-1.5 py-0.5 truncate max-w-[160px]">📍 {item.location || item.courtAddress}</span>}
                    {item.duration && <span className="text-gray-400 text-[11px] bg-gray-800 rounded px-1.5 py-0.5">⏱ {item.duration}dk</span>}
                </div>
                <div className="flex items-center justify-between mt-2">
                    <span className="text-gray-500 text-xs">{spots > 0 ? `${spots} kişi aranıyor` : 'Dolu'}</span>
                    {item._myJoinStatus === 'PENDING' ? (
                        <span className="text-yellow-400 text-xs font-bold">⏳ Bekliyor</span>
                    ) : item._myJoinStatus === 'ACCEPTED' ? (
                        <span className="text-green-400 text-xs font-bold">✓ Katıldın</span>
                    ) : spots > 0 && item.senderId !== myId ? (
                        <button onClick={(e) => { e.stopPropagation(); onJoin(item); }} disabled={joining}
                            className="bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold px-3 py-1 rounded-lg transition disabled:opacity-50">
                            Katıl
                        </button>
                    ) : null}
                </div>
            </div>
        </div>
    );
}

function TicketedCard({ item, emoji }) {
    const priceLabel = item.priceMin != null
        ? `${item.priceMin}${item.priceMax && item.priceMax !== item.priceMin ? `–${item.priceMax}` : ''} ${item.currency || ''}`.trim()
        : null;
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 flex gap-3">
            {(item.imageUrl || item.posterUrl) ? (
                <img src={item.imageUrl || item.posterUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
            ) : (
                <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center text-2xl flex-shrink-0">{emoji}</div>
            )}
            <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-bold truncate">{item.name || item.title}</p>
                {item.artist && <p className="text-gray-500 text-xs truncate">{item.artist}</p>}
                <p className="text-gray-500 text-xs truncate">{[item.venueName, item.city].filter(Boolean).join(' · ')}</p>
                {(item.date || item.releaseDate) && <p className="text-gray-500 text-xs">{item.date || item.releaseDate}{item.time ? ` · ${item.time.slice(0, 5)}` : ''}</p>}
                {priceLabel && <p className="text-purple-300 text-xs font-bold mt-0.5">{priceLabel}</p>}
                {item.ticketUrl && (
                    <a href={item.ticketUrl} target="_blank" rel="noopener noreferrer"
                        className="inline-block mt-1 bg-purple-600/20 border border-purple-500/40 text-purple-300 text-[11px] font-bold rounded-lg px-2.5 py-1">
                        🎟️ Bilet Al
                    </a>
                )}
            </div>
        </div>
    );
}

function CourseCard({ item }) {
    const priceLabel = [
        item.individual && item.priceIndividual ? `Bireysel ${item.priceIndividual}₺` : null,
        item.group && item.priceGroup ? `Grup ${item.priceGroup}₺` : null,
    ].filter(Boolean).join(' · ');
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-3 flex gap-3">
            <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center text-2xl flex-shrink-0">🎓</div>
            <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-bold truncate">{item.user?.fullName || item.user?.username}</p>
                <p className="text-gray-500 text-xs truncate">{item.credentialLevel}</p>
                <p className="text-gray-500 text-xs truncate">📍 {item.location}{item.city ? `, ${item.city}` : ''}</p>
                {priceLabel && <p className="text-purple-300 text-xs font-bold mt-0.5">{priceLabel}</p>}
            </div>
        </div>
    );
}

function ActivityFeedPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const myId = useMemo(() => {
        try {
            const token = localStorage.getItem('activity_token');
            return token ? JSON.parse(atob(token.split('.')[1])).userId : null;
        } catch { return null; }
    }, []);

    const [categories, setCategories] = useState([]);
    const [items, setItems] = useState([]);
    const [concertItems, setConcertItems] = useState([]);
    const [cinemaItems, setCinemaItems] = useState([]);
    const [theaterItems, setTheaterItems] = useState([]);
    const [courseItems, setCourseItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [joiningId, setJoiningId] = useState(null);
    const [feedTab, setFeedTab] = useState('current');

    const [city, setCity] = useState('');
    const [district, setDistrict] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [selCats, setSelCats] = useState([]);
    const [selSubs, setSelSubs] = useState([]);

    const [showAlertModal, setShowAlertModal] = useState(false);
    const [alertEnabled, setAlertEnabled] = useState(false);

    useEffect(() => {
        api.get('/interests/categories').then(({ data }) => setCategories(data.categories || [])).catch(() => {});
        api.get('/activity-alerts/me').then(({ data }) => setAlertEnabled(!!data.enabled)).catch(() => {});
    }, []);

    const toggleCat = (key) => {
        setSelCats(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            if (!next.includes(key)) {
                const catSubs = (categories.find(c => c.id === key)?.subCategories || []).map(s => s.id);
                setSelSubs(p => p.filter(s => !catSubs.includes(s)));
            }
            return next;
        });
    };
    const toggleSub = (key) => setSelSubs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    const visibleSubs = (selCats.length === 0 ? categories : categories.filter(c => selCats.includes(c.id)))
        .flatMap(c => c.subCategories || []);

    const fetchFeed = useCallback(async () => {
        setLoading(true);
        const catsOk = selCats.length === 0 || selCats.includes('ARTS');
        const noSubFilter = selSubs.length === 0;
        const wantConcert = catsOk && (noSubFilter || selSubs.includes('music'));
        const wantCinema  = catsOk && (noSubFilter || selSubs.includes('cinema'));
        const wantTheater = catsOk && (noSubFilter || selSubs.includes('theater'));

        const eventPromise = (async () => {
            try {
                const catKeys = selCats.length > 0 ? selCats : [''];
                const subKeys = selSubs.length > 0 ? selSubs : [''];
                const pairs = catKeys.flatMap(cat => subKeys.map(sub => ({ cat, sub })));
                const results = await Promise.all(pairs.map(({ cat, sub }) => {
                    const params = {};
                    if (cat) params.category = cat;
                    if (sub) params.subCategory = sub;
                    if (city) params.city = city;
                    if (district) params.district = district;
                    if (dateFrom) params.dateFrom = dateFrom;
                    if (dateTo) params.dateTo = dateTo;
                    return api.get('/rivals', { params }).then(r => r.data).catch(() => []);
                }));
                const seen = new Set();
                const merged = results.flat().filter(item => {
                    if (seen.has(item.id)) return false;
                    seen.add(item.id); return true;
                });
                return merged;
            } catch { return []; }
        })();

        const concertPromise = wantConcert
            ? api.get('/concerts/search', { params: { city: city || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined } }).then(r => r.data?.concerts || []).catch(() => [])
            : Promise.resolve([]);
        const cinemaPromise = wantCinema
            ? api.get('/movies/now-playing', { params: { city: city || undefined } }).then(r => r.data?.movies || []).catch(() => [])
            : Promise.resolve([]);
        const theaterPromise = wantTheater
            ? api.get('/theater/search', { params: { city: city || undefined, dateFrom: dateFrom || undefined, dateTo: dateTo || undefined } }).then(r => r.data?.plays || []).catch(() => [])
            : Promise.resolve([]);
        const coursePromise = api.get('/coaches', { params: { category: selCats[0] || undefined, subCategory: selSubs[0] || undefined } }).then(r => r.data || []).catch(() => []);

        try {
            const [eventRes, concertRes, cinemaRes, theaterRes, courseRes] = await Promise.all([eventPromise, concertPromise, cinemaPromise, theaterPromise, coursePromise]);
            setItems(eventRes); setConcertItems(concertRes); setCinemaItems(cinemaRes); setTheaterItems(theaterRes); setCourseItems(courseRes);
        } catch {
            setItems([]); setConcertItems([]); setCinemaItems([]); setTheaterItems([]); setCourseItems([]);
        } finally { setLoading(false); }
    }, [city, district, dateFrom, dateTo, selCats, selSubs]);

    useEffect(() => { fetchFeed(); }, [fetchFeed]);

    const handleJoin = async (item) => {
        setJoiningId(item.id);
        try {
            await api.post(`/rivals/${item.id}/respond`, {});
            setItems(prev => prev.map(r => r.id === item.id ? { ...r, _myJoinStatus: 'PENDING' } : r));
        } catch { /* silent */ }
        finally { setJoiningId(null); }
    };

    const hasFilter = city || district || dateFrom || dateTo || selCats.length > 0 || selSubs.length > 0;
    const clearAll = () => { setCity(''); setDistrict(''); setDateFrom(''); setDateTo(''); setSelCats([]); setSelSubs([]); };

    const PAST_GRACE_MS = 15 * 60 * 1000;
    const { feedItems, pastFeedItems } = useMemo(() => {
        const merged = [
            ...items.map(item => ({ key: `event-${item.id}`, type: 'event', data: item, sortTime: feedSortTime(item.matchDate), hasDate: true })),
            ...concertItems.map(item => ({ key: `concert-${item.id}`, type: 'concert', data: item, sortTime: feedSortTime(item.date, item.time), hasDate: true })),
            ...cinemaItems.map(item => ({ key: `cinema-${item.id}`, type: 'cinema', data: item, sortTime: feedSortTime(null), hasDate: false })),
            ...theaterItems.map(item => ({ key: `theater-${item.id}`, type: 'theater', data: item, sortTime: feedSortTime(item.date, item.time), hasDate: true })),
            ...courseItems.map(item => ({ key: `course-${item.id}`, type: 'course', data: item, sortTime: feedSortTime(null), hasDate: false })),
        ];
        const now = Date.now();
        const current = merged.filter(fi => !fi.hasDate || fi.sortTime + PAST_GRACE_MS >= now);
        const past    = merged.filter(fi =>  fi.hasDate && fi.sortTime + PAST_GRACE_MS <  now);
        current.sort((a, b) => a.sortTime - b.sortTime);
        past.sort((a, b) => b.sortTime - a.sortTime);
        return { feedItems: current, pastFeedItems: past };
    }, [items, concertItems, cinemaItems, theaterItems, courseItems]);

    const list = feedTab === 'past' ? pastFeedItems : feedItems;

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} title={t('activity.title')} />

            <div className="max-w-3xl mx-auto px-4 py-6">
                <div className="flex items-center justify-between mb-4">
                    <h1 className="text-2xl font-black text-white">🌟 {t('activity.title')}</h1>
                    <div className="flex items-center gap-2">
                        {hasFilter && (
                            <button onClick={clearAll} className="text-gray-400 hover:text-white text-xs font-bold border border-gray-700 rounded-full px-3 py-1.5">
                                ✕ {t('activity.clear')}
                            </button>
                        )}
                        <button onClick={() => setShowAlertModal(true)}
                            className={`text-xs font-bold border rounded-full px-3 py-1.5 transition ${alertEnabled ? 'border-purple-500 bg-purple-600/20 text-purple-300' : 'border-gray-700 text-gray-400 hover:text-white'}`}>
                            {alertEnabled ? '🔔' : '🔕'}
                        </button>
                    </div>
                </div>

                {/* Filtre paneli */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4 mb-4 space-y-3">
                    <div className="flex flex-wrap gap-2">
                        <input value={city} onChange={e => setCity(e.target.value)} placeholder={t('activity.city_ph')}
                            className="flex-1 min-w-[100px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                        <input value={district} onChange={e => setDistrict(e.target.value)} placeholder={t('activity.district_ph')}
                            className="flex-1 min-w-[100px] bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                        <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                        <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)}
                            className="bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                    </div>

                    <div className="flex flex-wrap gap-2">
                        {categories.map(cat => {
                            const active = selCats.includes(cat.id);
                            const c = CAT_COLOR[cat.id] || CAT_COLOR.SPORTS;
                            return (
                                <button key={cat.id} onClick={() => toggleCat(cat.id)}
                                    className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${active ? `${c.bg} ${c.border} ${c.text}` : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                    {cat.emoji} {cat.name}
                                </button>
                            );
                        })}
                    </div>

                    {visibleSubs.length > 0 && (
                        <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto">
                            {visibleSubs.map(sub => {
                                const active = selSubs.includes(sub.id);
                                return (
                                    <button key={sub.id} onClick={() => toggleSub(sub.id)}
                                        className={`px-2.5 py-1 rounded-full text-[11px] font-bold border transition ${active ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-700 text-gray-500'}`}>
                                        {sub.emoji} {sub.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Sekmeler */}
                <div className="flex gap-2 mb-4">
                    <button onClick={() => setFeedTab('current')}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold border transition ${feedTab === 'current' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'}`}>
                        {t('activity.tab_current')}
                    </button>
                    <button onClick={() => setFeedTab('past')}
                        className={`flex-1 py-2 rounded-xl text-sm font-bold border transition ${feedTab === 'past' ? 'bg-purple-600 border-purple-500 text-white' : 'bg-gray-900 border-gray-800 text-gray-400'}`}>
                        {t('activity.tab_past')}{pastFeedItems.length > 0 ? ` (${pastFeedItems.length})` : ''}
                    </button>
                </div>

                {loading ? (
                    <p className="text-gray-500 text-sm text-center py-16">{t('common.loading')}</p>
                ) : list.length === 0 ? (
                    <div className="text-center py-16">
                        <p className="text-4xl mb-3">🔍</p>
                        <p className="text-gray-400 text-sm">{feedTab === 'past' ? t('activity.empty_past') : t('activity.empty_current')}</p>
                    </div>
                ) : (
                    <div className="space-y-2.5">
                        {list.map(fi => {
                            if (fi.type === 'event') return <EventCard key={fi.key} item={fi.data} navigate={navigate} onJoin={handleJoin} joining={joiningId === fi.data.id} myId={myId} />;
                            if (fi.type === 'course') return <CourseCard key={fi.key} item={fi.data} />;
                            const emoji = fi.type === 'concert' ? '🎵' : fi.type === 'cinema' ? '🎬' : '🎭';
                            return <TicketedCard key={fi.key} item={fi.data} emoji={emoji} />;
                        })}
                    </div>
                )}
            </div>

            <ActivityAlertModal
                open={showAlertModal}
                categories={categories}
                onSaved={setAlertEnabled}
                onClose={() => setShowAlertModal(false)}
            />
        </div>
    );
}

export default ActivityFeedPage;
