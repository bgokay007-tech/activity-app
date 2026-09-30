import { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDispatch, useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import Navbar from '../components/Navbar';
import CityAutocomplete from '../components/CityAutocomplete';
import api from '../services/api';
import { setUser } from '../store/slices/authSlice';
import { ENABLED_CATEGORIES } from '../config/features';
import { CAT_PHOTOS, photoForSub, subLabel } from '../config/visualCatalog';

// Mobildeki HomeScreen.js (yeni görsel dil) ile aynı akış: selam, 4 fotoğraflı kategori,
// yaklaşan/oynanan maç kartı, seçili ildeki açık ilanlar.
const HOME_CITY_KEY = 'home_listings_city';
const CATEGORIES = ['SPORTS', 'SOCIAL', 'ARTS', 'GAMES'];
const DATE_LOCALE = { tr: 'tr-TR', en: 'en-GB', ru: 'ru-RU', de: 'de-DE' };

function firstNameOf(user) {
    const raw = (user?.fullName || user?.username || '').trim();
    return raw.split(/\s+/)[0] || '';
}

function asList(data) {
    if (Array.isArray(data)) return data;
    if (Array.isArray(data?.requests)) return data.requests;
    return [];
}

function foldCity(s) {
    return String(s || '').toLocaleLowerCase('tr-TR')
        .replace(/[ıiİI]/g, 'i').replace(/ğ/g, 'g').replace(/ü/g, 'u')
        .replace(/ş/g, 's').replace(/ö/g, 'o').replace(/ç/g, 'c').trim();
}

function listingInCity(item, city) {
    const c = foldCity(city);
    if (!c) return true;
    return foldCity([item?.location, item?.courtAddress, item?.courtName].filter(Boolean).join(' ')).includes(c);
}

const isOwnListing = (item, userId) => !!(item && userId && (item.senderId === userId || item.sender?.id === userId));

function isMyMatch(item, userId) {
    if (!item || !userId) return false;
    if (isOwnListing(item, userId)) return true;
    return ['participants', 'senderTeam', 'unassignedPlayers', 'substitutePlayers']
        .some(k => (item[k] || []).some(p => p?.id === userId));
}

function matchStartDate(item) {
    if (!item?.matchDate || !item?.matchTime) return null;
    const [h, min] = String(item.matchTime).split(':').map(Number);
    const d = new Date(item.matchDate);
    if (isNaN(d) || Number.isNaN(h)) return null;
    d.setHours(h, min || 0, 0, 0);
    return d;
}

function pickHeroMatch(list, userId, now) {
    const mine = (list || []).filter(m => isMyMatch(m, userId));
    const started = (m) => { const d = matchStartDate(m); return !!(d && now >= d); };
    const ended = (m) => { const d = matchStartDate(m); return !!(d && now >= new Date(d.getTime() + (m.duration || 90) * 60000)); };
    const byStart = (a, b) => (matchStartDate(a)?.getTime() || Infinity) - (matchStartDate(b)?.getTime() || Infinity);
    const playing = mine.filter(m => started(m) && !ended(m)).sort(byStart);
    if (playing[0]) return { match: playing[0], phase: 'playing' };
    const upcoming = mine.filter(m => !started(m)).sort(byStart);
    if (upcoming[0]) return { match: upcoming[0], phase: 'upcoming' };
    return { match: null, phase: null };
}

function listingMeta(item) {
    if (item?.matchType === 'DOUBLE') return '2v2';
    if (item?.teamSize > 1) return `${item.teamSize}v${item.teamSize}`;
    return '';
}

function HomePage() {
    const navigate = useNavigate();
    const dispatch = useDispatch();
    const { t } = useTranslation();
    const user = useSelector(state => state.auth.user);
    const lang = useSelector(state => state.lang.lang);

    const [loading, setLoading] = useState(true);
    const [city, setCity] = useState(null);
    const [cityInput, setCityInput] = useState('');
    const [editingCity, setEditingCity] = useState(false);
    const [hasInterests, setHasInterests] = useState(true);
    const [myMatches, setMyMatches] = useState([]);
    const [openListings, setOpenListings] = useState([]);
    const [listingsLoading, setListingsLoading] = useState(false);
    const [, setTick] = useState(0);

    const catLabel = (id) => t(`home.cat_${id.toLowerCase()}`);

    const loadListings = useCallback(async (resolvedCity, me) => {
        const mySubs = new Set((me?.interests || []).filter(i => i && !i.hidden && i.subCategory).map(i => i.subCategory));
        setHasInterests(mySubs.size > 0);
        const { data } = await api.get('/rivals', { params: resolvedCity ? { city: resolvedCity } : {} }).catch(() => ({ data: [] }));
        const pool = asList(data).filter(r => mySubs.has(r.subCategory) && listingInCity(r, resolvedCity));
        setOpenListings(pool.filter(r => !isOwnListing(r, me?.id)).concat(pool.filter(r => isOwnListing(r, me?.id))));
    }, []);

    useEffect(() => {
        let alive = true;
        (async () => {
            try {
                const { data: me } = await api.get('/auth/me');
                if (!alive) return;
                dispatch(setUser(me));
                const saved = localStorage.getItem(HOME_CITY_KEY);
                const resolvedCity = saved || String(me?.city || '').split('/')[0].trim() || null;
                setCity(resolvedCity);
                const { data: upcoming } = await api.get('/rivals/my-upcoming').catch(() => ({ data: [] }));
                if (!alive) return;
                setMyMatches(asList(upcoming).filter(m => isMyMatch(m, me?.id)));
                await loadListings(resolvedCity, me);
            } catch (e) {
                console.warn('HomePage load error:', e?.message);
            } finally {
                if (alive) setLoading(false);
            }
        })();
        // Saat gelince "Yaklaşan" → "Şu an oynadığın maç" geçişi sayfa yenilemeden olsun.
        const timer = setInterval(() => setTick(n => n + 1), 30000);
        return () => { alive = false; clearInterval(timer); };
    }, [dispatch, loadListings]);

    const applyCity = async (c) => {
        const next = c?.province || String(c || '').split(',').pop().trim();
        if (!next) return;
        setEditingCity(false);
        setCityInput('');
        setCity(next);
        localStorage.setItem(HOME_CITY_KEY, next);
        setListingsLoading(true);
        try { await loadListings(next, user); } finally { setListingsLoading(false); }
    };

    const openListing = (item) => {
        if (!item?.subCategory) return;
        navigate(`/category/${String(item.category || 'SPORTS').toLowerCase()}/${item.subCategory}`);
    };

    const formatWhen = (item) => {
        if (item?.flexibleSchedule) return t('home.flexible');
        const parts = [];
        if (item?.matchDate) parts.push(new Date(item.matchDate).toLocaleDateString(DATE_LOCALE[lang] || 'en-GB', { day: 'numeric', month: 'long', weekday: 'short' }));
        if (item?.matchTime) parts.push(item.matchTime);
        return parts.join(' · ');
    };

    const { match: heroMatch, phase: heroPhase } = pickHeroMatch(myMatches, user?.id, new Date());

    return (
        <div className="min-h-screen bg-[#0B0C10]">
            <Navbar />
            <div className="w-full px-[5px] py-8">
                <h1 className="text-[#F4F1EA] text-3xl md:text-4xl font-bold tracking-tight">
                    {t('home.hello', { name: firstNameOf(user) || '…' })}
                </h1>

                <h2 className="text-[#F4F1EA] text-lg font-bold mt-6 mb-4">{t('home.title')}</h2>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
                    {CATEGORIES.map(id => {
                        const enabled = ENABLED_CATEGORIES[id.toLowerCase()];
                        return (
                            <button
                                key={id}
                                onClick={() => enabled && navigate(`/category/${id.toLowerCase()}`)}
                                disabled={!enabled}
                                className={`relative h-36 md:h-44 rounded-[22px] overflow-hidden text-left group ${enabled ? '' : 'opacity-50 grayscale cursor-not-allowed'}`}
                            >
                                <img src={CAT_PHOTOS[id]} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                                <div className="absolute inset-0 bg-[#0B0C10]/30 group-hover:bg-[#0B0C10]/15 transition" />
                                {!enabled && (
                                    <span className="absolute top-3 right-3 bg-gray-800 text-gray-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">{t('home.soon')}</span>
                                )}
                                <span className="absolute left-3 bottom-3 text-white text-lg font-bold drop-shadow">{catLabel(id)}</span>
                            </button>
                        );
                    })}
                </div>

                {heroMatch && (
                    <button onClick={() => openListing(heroMatch)} className="relative block w-full h-52 rounded-[28px] overflow-hidden mb-8 text-left group">
                        <img src={photoForSub(heroMatch.subCategory, heroMatch.category) || CAT_PHOTOS.SPORTS} alt="" className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                        <div className="absolute inset-0 bg-[#0B0C10]/50" />
                        <div className="absolute inset-0 flex flex-col justify-end p-5">
                            <span className="text-[#C8F54A] text-[11px] font-bold uppercase tracking-wider mb-1">
                                {heroPhase === 'playing' ? t('home.featured_now_playing') : t('home.featured_upcoming')}
                            </span>
                            <span className="text-white text-sm mb-1">{formatWhen(heroMatch)}</span>
                            <span className="text-white text-2xl font-bold mb-1 line-clamp-2">
                                {subLabel(heroMatch.subCategory, lang)}{listingMeta(heroMatch) ? ` · ${listingMeta(heroMatch)}` : ''}
                            </span>
                            {(heroMatch.courtName || heroMatch.location) && (
                                <span className="text-white/80 text-sm mb-3 truncate">{heroMatch.courtName || heroMatch.location}</span>
                            )}
                            <span className="self-start bg-[#C8F54A] text-[#0B0C10] text-sm font-bold px-4 py-2 rounded-2xl">
                                {heroPhase === 'playing' ? t('home.see_your_match') : t('home.see_listing')}
                            </span>
                        </div>
                    </button>
                )}

                <div className="flex flex-wrap items-center gap-2 mb-4">
                    <h2 className="text-[#F4F1EA] text-lg font-bold">
                        {t('home.open_listings')}{city ? ` · ${city}` : ''}
                    </h2>
                    {editingCity ? (
                        <div className="w-60">
                            <CityAutocomplete
                                value={cityInput}
                                onChange={setCityInput}
                                onSelect={applyCity}
                                placeholder={t('home.city_placeholder')}
                                className="w-full bg-[#16181F] text-white text-sm rounded-lg px-3 py-1.5 border border-[#C8F54A] focus:outline-none"
                            />
                        </div>
                    ) : (
                        <button
                            onClick={() => setEditingCity(true)}
                            className="text-[#C8F54A] text-xs font-extrabold px-2.5 py-1 rounded-lg bg-[#1C1F28] border border-[#2A2D36] hover:border-[#C8F54A] transition"
                        >
                            {t('home.change_city')}
                        </button>
                    )}
                </div>

                {loading || listingsLoading ? (
                    <p className="text-[#A8A29A] text-center py-10">{t('category.loading')}</p>
                ) : !hasInterests ? (
                    <button onClick={() => navigate('/profile')} className="w-full text-left bg-[#16181F] rounded-3xl p-5 text-[#A8A29A] font-medium hover:text-white transition">
                        {t('home.add_sports_profile')}
                    </button>
                ) : openListings.length === 0 ? (
                    <div className="bg-[#16181F] rounded-3xl p-5 text-[#A8A29A] font-medium">{t('home.no_listings_city')}</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {openListings.slice(0, 12).map(item => {
                            const mine = isOwnListing(item, user?.id);
                            const img = photoForSub(item.subCategory, item.category) || CAT_PHOTOS[String(item.category || '').toUpperCase()] || CAT_PHOTOS.SPORTS;
                            const meta = listingMeta(item);
                            return (
                                <button key={item.id} onClick={() => openListing(item)} className="flex bg-[#16181F] border border-[#2A2D36] hover:border-[#C8F54A]/60 rounded-[18px] overflow-hidden text-left transition">
                                    <img src={img} alt="" loading="lazy" className="w-24 h-24 object-cover flex-shrink-0" />
                                    <div className="flex-1 min-w-0 px-3 py-2.5 flex flex-col justify-center">
                                        <span className="text-[#C8F54A] text-[11px] font-bold">{mine ? t('home.your_listing') : t('home.open_listing')}</span>
                                        <span className="text-[#F4F1EA] text-[15px] font-bold truncate">{subLabel(item.subCategory, lang)}{meta ? ` · ${meta}` : ''}</span>
                                        <span className="text-[#A8A29A] text-xs truncate mt-0.5">{formatWhen(item) || item.location || ''}</span>
                                        {(item.courtName || item.location) && (
                                            <span className="text-[#78716C] text-xs truncate mt-0.5">{item.courtName || item.location}</span>
                                        )}
                                    </div>
                                </button>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default HomePage;
