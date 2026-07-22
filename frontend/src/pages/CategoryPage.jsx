import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import Navbar from '../components/Navbar';
import { ENABLED_SUBS } from '../config/features';
import { useTranslation } from 'react-i18next';
import padelImg from '../assets/padel.png';

// Bazı alt kategoriler SubCategoryPage yerine kendi bağımsız sayfasına gider
const SPECIAL_ROUTES = {
    music: '/music', cinema: '/cinema', theater: '/theater', friend_finding: '/friend-finding',
    batak: '/games/batak', okey: '/games/okey', chess: '/games/chess', tavla: '/games/tavla',
};

// Batak/Okey/Satranç/Tavla kendi gerçek zamanlı oyun ekranlarına gider — genel "ilan"
// sistemine değil, bu yüzden backend /interests/categories listesinde yer almazlar
// (mobildeki CategoryScreen.js ile aynı desen — bkz. SPECIAL_SCREENS orada).
const EXTRA_GAMES_SUBS = [
    { id: 'batak', name: 'Batak', emoji: '🃏' },
    { id: 'okey',  name: 'Okey',  emoji: '🀄' },
    { id: 'chess', name: 'Chess', emoji: '♞' },
    { id: 'tavla', name: 'Backgammon', emoji: '🎲' },
];

const CATEGORY_CONFIG = {
    sports: {
        id: 'SPORTS', name: 'Sports', emoji: '🏃',
        color: 'from-green-600 to-emerald-500', bg: 'bg-green-500/10', border: 'border-green-500/30', activeBorder: 'border-green-500',
    },
    arts: {
        id: 'ARTS', name: 'Arts', emoji: '🎨',
        color: 'from-pink-600 to-rose-500', bg: 'bg-pink-500/10', border: 'border-pink-500/30', activeBorder: 'border-pink-500',
    },
    games: {
        id: 'GAMES', name: 'Games', emoji: '🎮',
        color: 'from-blue-600 to-indigo-500', bg: 'bg-blue-500/10', border: 'border-blue-500/30', activeBorder: 'border-blue-500',
    },
    social: {
        id: 'SOCIAL', name: 'Social', emoji: '🎉',
        color: 'from-amber-500 to-orange-500', bg: 'bg-amber-500/10', border: 'border-amber-500/30', activeBorder: 'border-amber-500',
    },
};

function CategoryPage() {
    const { category } = useParams();
    const navigate = useNavigate();
    const { t } = useTranslation();

    const [subCategories, setSubCategories] = useState([]);
    const [counts, setCounts] = useState({});
    const [isLoading, setIsLoading] = useState(true);

    const config = CATEGORY_CONFIG[category];

    useEffect(() => {
        if (!config) { navigate('/home'); return; }
        Promise.all([
            api.get('/interests/categories'),
            api.get(`/rivals/counts?category=${config.id}`),
        ]).then(([catRes, countRes]) => {
            const cat = catRes.data.categories.find(c => c.id === config.id);
            if (cat) setSubCategories(config.id === 'GAMES' ? [...cat.subCategories, ...EXTRA_GAMES_SUBS] : cat.subCategories);
            setCounts(countRes.data);
        }).catch(console.error)
        .finally(() => setIsLoading(false));
    }, [category]);

    if (!config) return null;

    // Açık ilan sayısı en çoktan en aza; eşitse (veya ilan yoksa) alfabetik sıra
    const sortedSubCategories = [...subCategories].sort((a, b) => {
        const ca = counts[a.id] || 0, cb = counts[b.id] || 0;
        if (cb !== ca) return cb - ca;
        return a.name.localeCompare(b.name);
    });

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} />

            <div className="max-w-5xl mx-auto px-6 py-8">
                <div className="mb-8">
                    <div className="flex items-center gap-3 mb-2">
                        <span className="text-5xl">{config.emoji}</span>
                        <h2 className={`text-4xl font-black bg-gradient-to-r ${config.color} bg-clip-text text-transparent`}>
                            {config.name}
                        </h2>
                    </div>
                    <p className="text-gray-400">{t('category.select_branch')}</p>
                </div>

                {isLoading ? (
                    <p className="text-gray-400 text-center py-12">Loading...</p>
                ) : (
                    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                        {sortedSubCategories.map(sub => {
                            const enabled = ENABLED_SUBS[sub.id] !== false; // unknown subs default open
                            const count   = counts[sub.id] || 0;
                            return (
                                <div
                                    key={sub.id}
                                    onClick={() => enabled && navigate(SPECIAL_ROUTES[sub.id] || `/category/${category}/${sub.id}`)}
                                    className={`relative ${config.bg} border-2 rounded-2xl p-5 transition-all duration-200 ${config.border} ${enabled ? `cursor-pointer hover:${config.activeBorder} hover:scale-105` : 'cursor-not-allowed opacity-50 grayscale'}`}
                                >
                                    {!enabled && (
                                        <span className="absolute top-2 right-2 bg-gray-700 text-gray-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                            {t('common.soon')}
                                        </span>
                                    )}
                                    {sub.id === 'padel'
                                        ? <img src={padelImg} alt="" className="w-10 h-10 object-contain mb-3" />
                                        : <span className="text-4xl block mb-3">{sub.emoji}</span>}
                                    <h3 className="text-white font-bold text-sm mb-3">{sub.name}</h3>
                                    <div className={`w-full text-xs font-bold py-2 rounded-lg text-center ${enabled ? `bg-gradient-to-r ${config.color} text-white` : 'bg-gray-700 text-gray-400'}`}>
                                        {enabled
                                            ? (count > 0 ? t('category.active_listings' + (count > 1 ? '_plural' : ''), { count }) : t('category.no_listings'))
                                            : t('common.coming_soon')}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}

export default CategoryPage;
