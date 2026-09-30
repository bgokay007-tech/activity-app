import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Navbar from '../components/Navbar';
import { ENABLED_SUBS } from '../config/features';
import { SUB_MAP, SPORT_GROUPS, SUB_TINT, COURT_SUBS, photoForSub, subLabel } from '../config/visualCatalog';
import padelImg from '../assets/padel.png';
import pickleballImg from '../assets/pickleball.png';

// Bazı alt kategoriler SubCategoryPage yerine kendi bağımsız sayfasına gider
const SPECIAL_ROUTES = {
    music: '/music', cinema: '/cinema', theater: '/theater', friend_finding: '/friend-finding', travel_explore: '/travel',
    batak: '/games/batak', okey: '/games/okey', chess: '/games/chess', tavla: '/games/tavla',
};
const SPECIAL_BADGE_EMOJI = { music: '🎵', cinema: '🎬', theater: '🎭', batak: '🃏', okey: '🀄', chess: '♞', tavla: '🎲', friend_finding: '🎉', travel_explore: '✈️' };

// Padel/pickleball'un Unicode emojisi yok (ikisi de 🏓'a düşüyordu) — grup başlığında kendi simgeleri.
const GROUP_ICON_IMAGES = { padel: padelImg, pickleball: pickleballImg };

const FAV_KEY = 'activity_fav_subs_SPORTS';
const LOCALE = { tr: 'tr', en: 'en', ru: 'ru', de: 'de' };

function readIds(key) {
    try {
        const arr = JSON.parse(localStorage.getItem(key) || '[]');
        return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
    } catch { return []; }
}

function SubTile({ sub, label, count, favored, onOpen, onToggleFav, enabled, meta, row, t }) {
    const photo = photoForSub(sub.id, sub.category);
    return (
        <div
            onClick={() => enabled && onOpen()}
            className={`relative flex-shrink-0 rounded-[22px] overflow-hidden group ${row ? 'w-44 h-44' : 'w-full h-44'} ${enabled ? 'cursor-pointer' : 'cursor-not-allowed grayscale opacity-50'} ${enabled && count === 0 && row ? 'opacity-80' : ''}`}
        >
            {photo ? (
                <>
                    <img src={photo} alt="" loading="lazy" className="absolute inset-0 w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" />
                    <div className="absolute inset-0 bg-[#0B0C10]/30 group-hover:bg-[#0B0C10]/15 transition" />
                </>
            ) : (
                <div className="absolute inset-0 flex items-center justify-center pb-7" style={{ backgroundColor: SUB_TINT[sub.id] || '#1C1F28' }}>
                    <span className="text-5xl">{sub.emoji}</span>
                </div>
            )}
            {count > 0 && <span className="absolute top-3 left-3 w-2 h-2 rounded-full bg-[#C8F54A] ring-2 ring-black/50" />}
            {!enabled && (
                <span className="absolute top-3 left-3 bg-gray-800 text-gray-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase">{t('common.soon')}</span>
            )}
            {onToggleFav && (
                <button
                    onClick={(e) => { e.stopPropagation(); onToggleFav(); }}
                    className={`absolute top-1.5 right-1.5 w-8 h-8 flex items-center justify-center text-lg ${favored ? 'text-[#C8F54A]' : 'text-white/90 hover:text-white'}`}
                >
                    {favored ? '★' : '☆'}
                </button>
            )}
            <span className={`absolute left-2.5 right-2.5 text-white text-[15px] font-bold leading-tight line-clamp-2 drop-shadow ${meta ? 'bottom-7' : 'bottom-3'}`}>{label}</span>
            {meta && <span className="absolute left-2.5 right-2.5 bottom-2.5 text-[#C8F54A] text-[11px] font-semibold">{meta}</span>}
        </div>
    );
}

function CategoryPage() {
    const { category } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();
    const lang = useSelector(state => state.lang.lang);

    const CAT = String(category || '').toUpperCase();
    const isSports = CAT === 'SPORTS';
    const baseSubs = SUB_MAP[CAT];

    const [counts, setCounts] = useState({});
    const [todayCounts, setTodayCounts] = useState({});
    const [myInterestIds, setMyInterestIds] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [intent, setIntent] = useState(null);
    const [favIds, setFavIds] = useState(() => readIds(FAV_KEY));

    useEffect(() => {
        if (!baseSubs) { navigate('/home'); return; }
        setIsLoading(true);
        const today = new Date();
        const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
        Promise.all([
            api.get(`/rivals/counts?category=${CAT}`).catch(() => ({ data: {} })),
            api.get('/interests/my').catch(() => ({ data: [] })),
            isSports ? api.get('/rivals', { params: { category: 'SPORTS', date: todayStr } }).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        ]).then(([countRes, intRes, todayRes]) => {
            setCounts(countRes.data || {});
            const ints = Array.isArray(intRes.data) ? intRes.data : [];
            setMyInterestIds(ints.filter(i => !i.hidden).map(i => i.subCategory));
            const list = Array.isArray(todayRes.data) ? todayRes.data : (todayRes.data?.requests || []);
            const map = {};
            list.forEach(r => { if (r?.subCategory) map[r.subCategory] = (map[r.subCategory] || 0) + 1; });
            setTodayCounts(map);
        }).finally(() => setIsLoading(false));
    }, [CAT]);

    const subs = useMemo(() => (baseSubs || []).map(s => ({ ...s, category: CAT })), [baseSubs, CAT]);

    if (!baseSubs) return null;

    const label = (sub) => subLabel(sub, lang);
    const isEnabled = (sub) => ENABLED_SUBS[sub.id] !== false;
    const openSub = (sub) => navigate(SPECIAL_ROUTES[sub.id] || `/category/${category}/${sub.id}`);
    const toggleFav = (id) => {
        setFavIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [id, ...prev];
            localStorage.setItem(FAV_KEY, JSON.stringify(next));
            return next;
        });
    };
    const metaFor = (sub) => {
        if (SPECIAL_ROUTES[sub.id]) return SPECIAL_BADGE_EMOJI[sub.id] || '';
        const c = counts[sub.id] || 0;
        return c > 0 ? t('category.active_listings' + (c > 1 ? '_plural' : ''), { count: c }) : (isSports ? '' : t('category.no_listings'));
    };
    const renderTile = (sub, row) => (
        <SubTile
            key={sub.id}
            sub={sub}
            label={label(sub)}
            count={counts[sub.id] || 0}
            favored={favIds.includes(sub.id)}
            onOpen={() => openSub(sub)}
            onToggleFav={isSports ? () => toggleFav(sub.id) : null}
            enabled={isEnabled(sub)}
            meta={metaFor(sub)}
            row={row}
            t={t}
        />
    );

    const header = (
        <div className="flex flex-wrap items-center gap-3 mb-5">
            <h2 className="text-[#F4F1EA] text-3xl font-bold tracking-tight">{t(`home.cat_${category}`)}</h2>
            {isSports && (
                <input
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder={t('category.search_sport')}
                    className="flex-1 min-w-[180px] max-w-sm bg-[#16181F] text-[#F4F1EA] text-sm rounded-2xl px-4 py-2 border border-[#C8F54A] focus:outline-none placeholder-[#78716C]"
                />
            )}
        </div>
    );

    if (!isSports) {
        const locale = LOCALE[lang] || 'en';
        const mine = new Set(myInterestIds);
        const sorted = [...subs].sort((a, b) => {
            const am = mine.has(a.id) ? 0 : 1, bm = mine.has(b.id) ? 0 : 1;
            if (am !== bm) return am - bm;
            const ao = (counts[a.id] || 0) > 0 ? 0 : 1, bo = (counts[b.id] || 0) > 0 ? 0 : 1;
            if (ao !== bo) return ao - bo;
            return label(a).localeCompare(label(b), locale);
        });
        return (
            <div className="min-h-screen bg-[#0B0C10]">
                <Navbar onBack={() => navigate(-1)} />
                <div className="max-w-5xl mx-auto px-5 py-8">
                    {header}
                    {isLoading ? (
                        <p className="text-[#A8A29A] text-center py-12">{t('category.loading')}</p>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
                            {sorted.map(sub => renderTile(sub, false))}
                        </div>
                    )}
                </div>
            </div>
        );
    }

    const q = query.trim().toLowerCase();
    const searching = q.length > 0;
    const matchesQuery = (sub) => [sub.en, sub.tr, sub.ru, sub.de, sub.id].some(s => (s || '').toLowerCase().includes(q));
    const passesIntent = (sub) => {
        if (intent === 'today') return (todayCounts[sub.id] || 0) > 0;
        if (intent === 'rival') return (counts[sub.id] || 0) > 0;
        if (intent === 'book') return COURT_SUBS.has(sub.id);
        return true;
    };
    const allOrder = SPORT_GROUPS.flatMap(g => g.ids);
    const sortSport = (order) => (a, b) => {
        const ca = counts[a.id] || 0, cb = counts[b.id] || 0;
        if (cb !== ca) return cb - ca;
        const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    };
    const filtered = subs.filter(matchesQuery).filter(passesIntent).sort(sortSport(allOrder));
    const INTENTS = [
        { id: 'today', label: t('category.intent_play_today') },
        { id: 'rival', label: t('category.intent_find_rival') },
        { id: 'book',  label: t('category.intent_book_venue') },
    ];

    return (
        <div className="min-h-screen bg-[#0B0C10]">
            <Navbar onBack={() => navigate(-1)} />
            <div className="max-w-6xl mx-auto px-5 py-8">
                {header}

                {!searching && (
                    <div className="flex flex-wrap gap-2 mb-6">
                        {INTENTS.map(chip => (
                            <button
                                key={chip.id}
                                onClick={() => setIntent(prev => prev === chip.id ? null : chip.id)}
                                className={`rounded-full px-4 py-2.5 text-[13px] font-bold border transition ${intent === chip.id ? 'bg-[#C8F54A]/15 border-[#C8F54A] text-[#C8F54A]' : 'bg-[#16181F] border-[#2A2D36] text-[#F4F1EA] hover:border-[#3A3E48]'}`}
                            >
                                {chip.label}
                            </button>
                        ))}
                    </div>
                )}

                {isLoading ? (
                    <p className="text-[#A8A29A] text-center py-12">{t('category.loading')}</p>
                ) : searching ? (
                    filtered.length === 0 ? (
                        <p className="text-[#A8A29A] text-center mt-8">{t('category.no_sport_match')}</p>
                    ) : (
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">{filtered.map(sub => renderTile(sub, false))}</div>
                    )
                ) : (
                    SPORT_GROUPS.map(g => {
                        const items = subs.filter(sub => g.ids.includes(sub.id)).filter(passesIntent).sort(sortSport(g.ids));
                        if (items.length === 0) return null;
                        // Grubun tek emojisi diğer dalları görünmez kılıyordu — her dalın simgesi; aynı emoji bir kez.
                        const seen = new Set();
                        const icons = g.ids.map(id => {
                            if (GROUP_ICON_IMAGES[id]) return { id, image: GROUP_ICON_IMAGES[id] };
                            const emoji = subs.find(s => s.id === id)?.emoji;
                            if (!emoji || seen.has(emoji)) return null;
                            seen.add(emoji);
                            return { id, emoji };
                        }).filter(Boolean);
                        return (
                            <section key={g.id} className="mb-7">
                                <div className="flex flex-wrap items-center gap-1.5 mb-3">
                                    <h3 className="text-[#F4F1EA] text-lg font-bold mr-1">{t(`category.${g.key}`)}</h3>
                                    {icons.map(ic => ic.image
                                        ? <img key={ic.id} src={ic.image} alt="" className="w-5 h-5 object-contain" />
                                        : <span key={ic.id} className="text-lg">{ic.emoji}</span>)}
                                </div>
                                <div className="flex gap-3 overflow-x-auto pb-2 [scrollbar-width:thin]">
                                    {items.map(sub => renderTile(sub, true))}
                                </div>
                            </section>
                        );
                    })
                )}
            </div>
        </div>
    );
}

export default CategoryPage;
