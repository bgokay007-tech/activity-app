import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Navbar from '../components/Navbar';

const GRADIENT = 'from-amber-600 to-orange-500';

function PlayCard({ play, t }) {
    const priceLabel = play.priceMin != null
        ? `${play.priceMin}${play.priceMax && play.priceMax !== play.priceMin ? `–${play.priceMax}` : ''} ${play.currency || ''}`.trim()
        : null;
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-2">
            {play.imageUrl
                ? <img src={play.imageUrl} alt="" className="w-full aspect-[2/3] rounded-lg object-cover bg-gray-800" />
                : <div className="w-full aspect-[2/3] rounded-lg bg-gray-800 flex items-center justify-center text-3xl">🎭</div>
            }
            <p className="text-white text-xs font-bold mt-1.5 line-clamp-2 min-h-[2rem]">{play.name}</p>
            <p className="text-gray-500 text-[10px] mt-0.5 truncate">
                {[play.venueName, play.city].filter(Boolean).join(' · ')}
            </p>
            {play.date && (
                <p className="text-gray-500 text-[10px] mt-0.5">
                    {play.date}{play.time ? ` · ${play.time.slice(0, 5)}` : ''}
                </p>
            )}
            {priceLabel && <p className="text-purple-300 text-[11px] font-bold mt-0.5">{priceLabel}</p>}
            {play.ticketUrl && (
                <a href={play.ticketUrl} target="_blank" rel="noopener noreferrer"
                    className="block text-center mt-2 bg-purple-600/20 border border-purple-500/40 text-purple-300 text-[11px] font-bold rounded-lg py-1.5">
                    {t('theater.buy_ticket')}
                </a>
            )}
        </div>
    );
}

function TheaterPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [city, setCity] = useState('');
    const [name, setName] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [plays, setPlays] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async (cityName, playName, df, dt) => {
        setLoading(true);
        try {
            const params = {};
            if (cityName) params.city = cityName;
            if (playName) params.name = playName;
            if (df) params.dateFrom = df;
            if (dt) params.dateTo = dt;
            const { data } = await api.get('/theater/search', { params });
            setPlays(data.plays || []);
        } catch (e) { console.error(e); }
        finally { setLoading(false); setLoaded(true); }
    }, []);

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const search = () => load(city || undefined, name || undefined, dateFrom, dateTo);

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} />

            <div className="max-w-5xl mx-auto px-4 py-6">
                <h1 className={`text-2xl font-black bg-gradient-to-r ${GRADIENT} bg-clip-text text-transparent mb-4`}>🎭 {t('theater.title')}</h1>

                <div className="flex flex-wrap gap-2 mb-4">
                    <input value={city} onChange={e => setCity(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && search()}
                        placeholder={t('theater.city_ph')}
                        className="flex-1 min-w-[140px] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                    <input value={name} onChange={e => setName(e.target.value)}
                        onKeyDown={e => e.key === 'Enter' && search()}
                        placeholder={t('theater.name_ph')}
                        className="flex-1 min-w-[140px] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                    <input type="date" value={dateFrom}
                        onChange={e => { setDateFrom(e.target.value); }}
                        className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                    <input type="date" value={dateTo}
                        onChange={e => { setDateTo(e.target.value); }}
                        className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                    <button onClick={search}
                        className={`bg-gradient-to-r ${GRADIENT} text-white text-sm font-bold rounded-lg px-4 py-2`}>
                        {t('theater.search')}
                    </button>
                </div>

                {loading ? (
                    <p className="text-gray-500 text-sm text-center py-10">{t('common.loading')}</p>
                ) : plays.length === 0 ? (
                    loaded && <p className="text-gray-600 text-sm text-center py-10">{t('theater.no_plays')}</p>
                ) : (
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                        {plays.map(p => <PlayCard key={p.id} play={p} t={t} />)}
                    </div>
                )}
            </div>
        </div>
    );
}

export default TheaterPage;
