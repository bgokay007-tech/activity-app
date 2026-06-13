import { useNavigate } from 'react-router-dom';
import Navbar from '../components/Navbar';
import { ENABLED_CATEGORIES } from '../config/features';
import { useTranslation } from 'react-i18next';

const categories = [
    { id: 'sports', name: 'Sports', emoji: '🏃', description: 'Find athletes, join tournaments, challenge rivals',    color: 'from-green-600 to-emerald-500', bg: 'bg-green-500/10', border: 'border-green-500/30', hover: 'hover:border-green-500' },
    { id: 'social', name: 'Social', emoji: '🎉', description: 'Meet people, join events, explore new activities',    color: 'from-amber-500 to-orange-500',  bg: 'bg-amber-500/10', border: 'border-amber-500/30', hover: 'hover:border-amber-500' },
    { id: 'arts',   name: 'Arts',   emoji: '🎨', description: 'Connect with artists, share your work, collaborate',  color: 'from-pink-600 to-rose-500',     bg: 'bg-pink-500/10',  border: 'border-pink-500/30',  hover: 'hover:border-pink-500'  },
    { id: 'games',  name: 'Games',  emoji: '🎮', description: 'Find teammates, join tournaments, compete online',    color: 'from-blue-600 to-indigo-500',   bg: 'bg-blue-500/10',  border: 'border-blue-500/30',  hover: 'hover:border-blue-500'  },
];

function HomePage() {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const descriptions = {
        sports: t('home.sports_desc'),
        social: t('home.social_desc'),
        arts:   t('home.arts_desc'),
        games:  t('home.games_desc'),
    };

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar />
            <div className="max-w-4xl mx-auto px-6 py-12">
                <div className="text-center mb-12">
                    <h2 className="text-4xl font-bold text-white mb-3">{t('home.title')}</h2>
                    <p className="text-gray-400 text-lg">{t('home.subtitle')}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                    {categories.map(cat => {
                        const enabled = ENABLED_CATEGORIES[cat.id];
                        return (
                            <button
                                key={cat.id}
                                onClick={() => enabled && navigate(`/category/${cat.id}`)}
                                className={`relative ${cat.bg} ${cat.border} border-2 rounded-2xl p-8 text-left transition-all duration-200 ${enabled ? `${cat.hover} hover:scale-105 hover:shadow-2xl` : 'opacity-50 cursor-not-allowed grayscale'}`}
                            >
                                {!enabled && (
                                    <span className="absolute top-3 right-3 bg-gray-700 text-gray-300 text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider">
                                        {t('home.soon')}
                                    </span>
                                )}
                                <span className="text-6xl block mb-4">{cat.emoji}</span>
                                <h3 className={`text-2xl font-bold bg-gradient-to-r ${cat.color} bg-clip-text text-transparent mb-2`}>{cat.name}</h3>
                                <p className="text-gray-400 text-sm leading-relaxed">{descriptions[cat.id] || cat.description}</p>
                                <div className={`mt-6 inline-flex items-center gap-2 bg-gradient-to-r ${cat.color} text-white text-sm font-bold px-4 py-2 rounded-full ${!enabled ? 'opacity-60' : ''}`}>
                                    {enabled ? t('home.explore', { name: cat.name }) : t('home.coming_soon')}
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}

export default HomePage;
