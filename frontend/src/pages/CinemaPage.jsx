import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Navbar from '../components/Navbar';

const GRADIENT = 'from-pink-600 to-rose-500';

function MovieCard({ movie, t }) {
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-2">
            {movie.posterUrl
                ? <img src={movie.posterUrl} alt="" className="w-full aspect-[2/3] rounded-lg object-cover bg-gray-800" />
                : <div className="w-full aspect-[2/3] rounded-lg bg-gray-800 flex items-center justify-center text-3xl">🎬</div>
            }
            <p className="text-white text-xs font-bold mt-1.5 line-clamp-2 min-h-[2rem]">{movie.title}</p>
            <div className="flex justify-between mt-1">
                {movie.rating != null && <span className="text-gray-500 text-[10px]">⭐ {movie.rating.toFixed(1)}</span>}
                {movie.releaseDate && <span className="text-gray-500 text-[10px]">{movie.releaseDate}</span>}
            </div>
            {movie.ticketUrl && (
                <a href={movie.ticketUrl} target="_blank" rel="noopener noreferrer"
                    className="block text-center mt-2 bg-purple-600/20 border border-purple-500/40 text-purple-300 text-[11px] font-bold rounded-lg py-1.5">
                    {t('cinema.buy_ticket')}
                </a>
            )}
        </div>
    );
}

function ClassicFilmCard({ film, onPress }) {
    return (
        <button onClick={() => onPress(film)} className="bg-gray-900 border border-gray-800 rounded-2xl p-2 text-left hover:border-gray-700 transition">
            {film.thumbnailUrl
                ? <img src={film.thumbnailUrl} alt="" className="w-full aspect-[2/3] rounded-lg object-cover bg-gray-800" />
                : <div className="w-full aspect-[2/3] rounded-lg bg-gray-800 flex items-center justify-center text-3xl">🎬</div>
            }
            <p className="text-white text-xs font-bold mt-1.5 line-clamp-2 min-h-[2rem]">{film.title}</p>
            {film.year && <p className="text-gray-500 text-[10px] mt-0.5">{film.year}</p>}
            <div className="mt-2 bg-purple-600 text-white text-[11px] font-bold rounded-lg py-1.5 text-center">▶️ İzle</div>
        </button>
    );
}

function CinemaPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();

    const [mainTab, setMainTab] = useState('nowPlaying'); // 'nowPlaying' | 'classics'

    const [city, setCity] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo, setDateTo] = useState('');
    const [showGenreMenu, setShowGenreMenu] = useState(false);
    const [movies, setMovies] = useState([]);
    const [cinemaListUrl, setCinemaListUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [genres, setGenres] = useState([]);
    const [selectedGenres, setSelectedGenres] = useState([]);

    const load = useCallback(async (cityName, genreIds, df, dt) => {
        setLoading(true);
        try {
            const params = {};
            if (cityName) params.city = cityName;
            if (genreIds && genreIds.length > 0) params.genre = genreIds.join(',');
            if (df) params.dateFrom = df;
            if (dt) params.dateTo = dt;
            const { data } = await api.get('/movies/now-playing', { params });
            setMovies(data.movies || []);
            setCinemaListUrl(data.cinemaListUrl || null);
        } catch (e) { console.error(e); }
        finally { setLoading(false); setLoaded(true); }
    }, []);

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        api.get('/movies/genres').then(r => setGenres(r.data.genres || [])).catch(() => {});
    }, []);

    const toggleGenre = (genreId) => {
        setSelectedGenres(prev => {
            const next = genreId === null ? [] : (prev.includes(genreId) ? prev.filter(g => g !== genreId) : [...prev, genreId]);
            load(city || undefined, next, dateFrom, dateTo);
            return next;
        });
    };

    // Klasik filmler (archive.org — telif süresi dolmuş, ücretsiz/yasal)
    const [classicQuery, setClassicQuery] = useState('');
    const [classics, setClassics] = useState([]);
    const [classicsLoading, setClassicsLoading] = useState(false);
    const [classicsLoaded, setClassicsLoaded] = useState(false);
    const [playingFilm, setPlayingFilm] = useState(null); // { id, title, videoUrl }
    const [streamLoading, setStreamLoading] = useState(false);

    const loadClassics = useCallback(async (q) => {
        setClassicsLoading(true);
        try {
            const { data } = await api.get('/movies/classics', { params: q ? { q } : undefined });
            setClassics(data.films || []);
        } catch (e) { console.error(e); }
        finally { setClassicsLoading(false); setClassicsLoaded(true); }
    }, []);

    useEffect(() => { if (mainTab === 'classics' && !classicsLoaded) loadClassics(); }, [mainTab, classicsLoaded, loadClassics]);

    const openClassicFilm = async (film) => {
        setStreamLoading(true);
        setPlayingFilm({ id: film.id, title: film.title, videoUrl: null });
        try {
            const { data } = await api.get(`/movies/classics/${film.id}/stream`);
            setPlayingFilm({ id: film.id, title: film.title, videoUrl: data.videoUrl });
        } catch (e) {
            alert(t('cinema.stream_error'));
            setPlayingFilm(null);
        } finally { setStreamLoading(false); }
    };

    return (
        <div className="min-h-screen bg-gray-950">
            <Navbar onBack={() => navigate(-1)} />

            <div className="max-w-5xl mx-auto px-4 py-6">
                <h1 className={`text-2xl font-black bg-gradient-to-r ${GRADIENT} bg-clip-text text-transparent mb-4`}>🎬 {t('cinema.title')}</h1>

                <div className="flex gap-2 bg-gray-900 p-1 rounded-xl border border-gray-800 mb-4">
                    {[
                        { id: 'nowPlaying', label: t('cinema.tab_now_playing') },
                        { id: 'classics', label: t('cinema.tab_classics') },
                    ].map(tb => (
                        <button key={tb.id} onClick={() => setMainTab(tb.id)}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition ${mainTab === tb.id ? `bg-gradient-to-r ${GRADIENT} text-white` : 'text-gray-400 hover:text-white'}`}>
                            {tb.label}
                        </button>
                    ))}
                </div>

                {mainTab === 'nowPlaying' ? (
                    <div className="space-y-3">
                        <p className="text-gray-500 text-xs leading-relaxed">{t('cinema.disclaimer')}</p>

                        <div className="flex flex-wrap gap-2">
                            <input value={city} onChange={e => setCity(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && load(city || undefined, selectedGenres, dateFrom, dateTo)}
                                placeholder={t('cinema.city_ph')}
                                className="flex-1 min-w-[140px] bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                            <input type="date" value={dateFrom}
                                onChange={e => { setDateFrom(e.target.value); load(city || undefined, selectedGenres, e.target.value, dateTo); }}
                                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                            <input type="date" value={dateTo}
                                onChange={e => { setDateTo(e.target.value); load(city || undefined, selectedGenres, dateFrom, e.target.value); }}
                                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                            <div className="relative">
                                <button onClick={() => setShowGenreMenu(v => !v)}
                                    className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-gray-300 hover:border-gray-600">
                                    🎭 {selectedGenres.length > 0 ? selectedGenres.length : t('cinema.genre')}
                                </button>
                                {showGenreMenu && (
                                    <>
                                        <div className="fixed inset-0 z-10" onClick={() => setShowGenreMenu(false)} />
                                        <div className="absolute right-0 mt-2 w-72 bg-gray-900 border border-gray-700 rounded-xl p-3 z-20 flex flex-wrap gap-2 max-h-64 overflow-y-auto">
                                            <button onClick={() => toggleGenre(null)}
                                                className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${selectedGenres.length === 0 ? 'bg-purple-600 border-purple-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                                {t('cinema.genre_all')}
                                            </button>
                                            {genres.map(g => (
                                                <button key={g.id} onClick={() => toggleGenre(g.id)}
                                                    className={`px-2.5 py-1 rounded-full text-xs font-bold border transition ${selectedGenres.includes(g.id) ? 'bg-purple-600 border-purple-600 text-white' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                                    {g.name}
                                                </button>
                                            ))}
                                        </div>
                                    </>
                                )}
                            </div>
                        </div>
                        <p className="text-gray-600 text-[11px]">{t('cinema.city_subtext')}</p>

                        {cinemaListUrl && (
                            <a href={cinemaListUrl} target="_blank" rel="noopener noreferrer"
                                className="block text-center bg-purple-600 hover:bg-purple-500 text-white font-bold text-sm rounded-xl py-2.5 transition">
                                {t('cinema.see_all_btn')}
                            </a>
                        )}

                        {loading ? (
                            <p className="text-gray-500 text-sm text-center py-10">{t('common.loading')}</p>
                        ) : movies.length === 0 ? (
                            loaded && <p className="text-gray-600 text-sm text-center py-10">{t('cinema.no_movies')}</p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {movies.map(m => <MovieCard key={m.id} movie={m} t={t} />)}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="space-y-3">
                        <p className="text-gray-500 text-xs leading-relaxed">{t('cinema.classics_disclaimer')}</p>
                        <div className="flex gap-2">
                            <input value={classicQuery} onChange={e => setClassicQuery(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && loadClassics(classicQuery.trim() || undefined)}
                                placeholder={t('cinema.classics_search_ph')}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                            <button onClick={() => loadClassics(classicQuery.trim() || undefined)}
                                className={`bg-gradient-to-r ${GRADIENT} text-white text-sm font-bold rounded-lg px-4 py-2`}>
                                {t('cinema.search')}
                            </button>
                        </div>

                        {classicsLoading ? (
                            <p className="text-gray-500 text-sm text-center py-10">{t('common.loading')}</p>
                        ) : classics.length === 0 ? (
                            classicsLoaded && <p className="text-gray-600 text-sm text-center py-10">{t('cinema.no_movies')}</p>
                        ) : (
                            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
                                {classics.map(f => <ClassicFilmCard key={f.id} film={f} onPress={openClassicFilm} />)}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {playingFilm && (
                <div className="fixed inset-0 bg-black z-50 flex flex-col">
                    <div className="flex items-center gap-3 px-4 py-3 flex-shrink-0">
                        <button onClick={() => setPlayingFilm(null)} className="text-white text-xl w-8 h-8 flex items-center justify-center">✕</button>
                        <p className="text-white text-sm font-bold truncate">{playingFilm.title}</p>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                        {streamLoading || !playingFilm.videoUrl ? (
                            <div className="w-10 h-10 rounded-full border-4 border-purple-500 border-t-transparent animate-spin" />
                        ) : (
                            <video src={playingFilm.videoUrl} controls autoPlay className="max-w-full max-h-full" />
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}

export default CinemaPage;
