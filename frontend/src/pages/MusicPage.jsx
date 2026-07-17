import { useState, useEffect, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSelector } from 'react-redux';
import { useTranslation } from 'react-i18next';
import api from '../services/api';
import Navbar from '../components/Navbar';
import MiniPlayer from '../components/MiniPlayer';
import YoutubeAudioPlayer from '../components/YoutubeAudioPlayer';
import { playTrack, useActiveTrack, useIsPlaying, togglePlayPause } from '../services/musicPlayer';

const GRADIENT = 'from-pink-600 to-rose-500';

function fmtDate(d) {
    if (!d) return null;
    return d;
}

// Başlangıcından 5 dk sonra "geçmiş" sayılır — tarihsiz (esnek) içerik hiç geçmişe düşmez.
const PAST_GRACE_MS = 5 * 60 * 1000;
function toTime(dateStr, timeStr) {
    if (!dateStr) return null;
    const combined = dateStr.includes('T') ? dateStr : `${dateStr}T${timeStr || '00:00:00'}`;
    const t = new Date(combined).getTime();
    return Number.isNaN(t) ? null : t;
}
function isPastEntry(dateStr, timeStr) {
    const t = toTime(dateStr, timeStr);
    return t !== null && t + PAST_GRACE_MS < Date.now();
}

function ConcertCard({ item, t }) {
    const priceLabel = item.priceMin != null
        ? `${item.priceMin}${item.priceMax && item.priceMax !== item.priceMin ? '–' + item.priceMax : ''} ${item.currency || ''}`.trim()
        : null;
    return (
        <div className="flex gap-3 py-3 border-b border-gray-800">
            {item.imageUrl
                ? <img src={item.imageUrl} alt="" className="w-16 h-16 rounded-lg object-cover flex-shrink-0" />
                : <div className="w-16 h-16 rounded-lg bg-gray-800 flex items-center justify-center text-2xl flex-shrink-0">🎤</div>
            }
            <div className="min-w-0 flex-1">
                <p className="text-white text-sm font-bold truncate">{item.artist}</p>
                <p className="text-gray-500 text-xs mt-0.5 truncate">{[item.venueName, item.city].filter(Boolean).join(' · ')}</p>
                <p className="text-gray-500 text-xs mt-0.5">{item.date}{item.time ? ` · ${item.time.slice(0, 5)}` : ''}</p>
                {priceLabel && <p className="text-purple-300 text-xs font-bold mt-0.5">{priceLabel}</p>}
                {item.ticketUrl && (
                    <a href={item.ticketUrl} target="_blank" rel="noopener noreferrer"
                        className={`inline-block mt-1.5 bg-gradient-to-r ${GRADIENT} text-white text-xs font-bold rounded-lg px-3 py-1.5`}>
                        {t('music.buy_ticket')}
                    </a>
                )}
            </div>
        </div>
    );
}

function MusicEventCard({ item, myId, onJoin, onOpen, t }) {
    const isOwner = item.senderId === myId;
    const joinStatus = item._myJoinStatus;
    const participantCount = (Array.isArray(item.participants) ? item.participants.length : 0) + 1;
    return (
        <div onClick={() => onOpen(item)} className="bg-gray-900 border border-gray-800 rounded-2xl p-4 cursor-pointer hover:border-gray-700 transition">
            <div className="flex items-start justify-between gap-2">
                <p className="text-white text-sm font-bold truncate">👤 {item.sender?.fullName || item.sender?.username}</p>
                <span className="text-gray-500 text-xs flex-shrink-0">👥 {participantCount}</span>
            </div>
            {item.message && <p className="text-gray-300 text-sm mt-1.5 line-clamp-3">{item.message}</p>}
            <div className="flex flex-wrap gap-x-3 gap-y-1 mt-2 text-xs text-gray-500">
                {item.courtName && <span>📍 {item.courtName}</span>}
                {item.location && <span>🏙️ {item.location}</span>}
            </div>
            {(item.matchDate || item.matchTime) && (
                <p className="text-gray-500 text-xs mt-1">
                    📅 {item.matchDate ? item.matchDate.slice(0, 10) : t('music.flexible_date')}{item.matchTime ? ` · ${item.matchTime}` : ''}
                </p>
            )}
            {item.courtFeePerPerson ? <p className="text-gray-500 text-xs mt-1">💰 {item.courtFeePerPerson} ₺ / {t('music.per_person')}</p> : null}
            {item.ticketUrl && (
                <a href={item.ticketUrl} target="_blank" rel="noopener noreferrer" onClick={e => e.stopPropagation()}
                    className="block text-center mt-2 bg-purple-600/20 border border-purple-500/40 text-purple-300 text-xs font-bold rounded-lg py-1.5">
                    {t('music.buy_ticket')}
                </a>
            )}
            {!isOwner && (
                <button
                    disabled={!!joinStatus}
                    onClick={(e) => { e.stopPropagation(); onJoin(item); }}
                    className={`w-full mt-2 rounded-lg py-2 text-xs font-bold transition ${joinStatus ? 'bg-gray-800 border border-gray-700 text-gray-500' : `bg-gradient-to-r ${GRADIENT} text-white hover:opacity-90`}`}>
                    {joinStatus === 'ACCEPTED' ? `✓ ${t('music.joined')}` : joinStatus === 'PENDING' ? `⏳ ${t('music.pending')}` : t('music.join')}
                </button>
            )}
        </div>
    );
}

function MusicCourseCard({ item, t }) {
    const priceLabel = [
        item.individual && item.priceIndividual ? `${t('music.individual')} ${item.priceIndividual}₺` : null,
        item.group && item.priceGroup ? `${t('music.group')} ${item.priceGroup}₺` : null,
    ].filter(Boolean).join(' · ');
    return (
        <div className="bg-gray-900 border border-gray-800 rounded-2xl p-4">
            <p className="text-white text-sm font-bold">🎓 {item.user?.fullName || item.user?.username}</p>
            <p className="text-gray-400 text-xs mt-1">{item.credentialLevel}{item.experience ? ` · ${item.experience} ${t('music.years_exp')}` : ''}</p>
            {item.description && <p className="text-gray-500 text-xs mt-1.5 line-clamp-3">{item.description}</p>}
            <p className="text-gray-500 text-xs mt-2">📍 {item.location}{item.city ? `, ${item.city}` : ''}</p>
            {priceLabel && <p className="text-gray-500 text-xs mt-1">💰 {priceLabel}</p>}
        </div>
    );
}

function TrackRow({ track, onPlay, onLike, liked, onAddToPlaylist }) {
    const activeTrack = useActiveTrack();
    const isPlaying = useIsPlaying();
    const isCurrent = activeTrack?.id === track.trackId;

    const handlePlayClick = () => {
        if (isCurrent) togglePlayPause(isPlaying);
        else onPlay(track);
    };

    return (
        <div className="flex items-center gap-2 py-2 border-b border-gray-800">
            <button onClick={() => onPlay(track)} className="flex items-center gap-2.5 flex-1 min-w-0 text-left">
                {track.imageUrl
                    ? <img src={track.imageUrl} alt="" className="w-10 h-10 rounded-md object-cover flex-shrink-0" />
                    : <div className="w-10 h-10 rounded-md bg-gray-800 flex items-center justify-center text-sm flex-shrink-0">🎵</div>
                }
                <div className="min-w-0">
                    <p className={`text-sm font-bold truncate ${isCurrent ? 'text-purple-400' : 'text-white'}`}>{track.title}</p>
                    <p className="text-gray-500 text-xs truncate">{track.artist}</p>
                </div>
            </button>
            <button onClick={handlePlayClick}
                className={`w-8 h-8 rounded-full flex items-center justify-center text-sm flex-shrink-0 transition ${isCurrent ? 'bg-purple-600 text-white' : 'bg-gray-800 text-gray-300 hover:bg-gray-700'}`}>
                {isCurrent && isPlaying ? '⏸' : '▶'}
            </button>
            <button onClick={() => onLike(track)} className="px-2 py-1.5 text-base">{liked ? '❤️' : '🤍'}</button>
            <button onClick={() => onAddToPlaylist(track)} className="px-2 py-1.5 text-gray-500 hover:text-white text-base">➕</button>
        </div>
    );
}

function TrendingPlaylistCard({ playlist }) {
    return (
        <a href={playlist.url || undefined} target="_blank" rel="noopener noreferrer" className="w-28 flex-shrink-0">
            {playlist.imageUrl
                ? <img src={playlist.imageUrl} alt="" className="w-28 h-28 rounded-xl object-cover bg-gray-800" />
                : <div className="w-28 h-28 rounded-xl bg-gray-800 flex items-center justify-center text-2xl">📋</div>
            }
            <p className="text-white text-xs font-bold mt-1.5 line-clamp-2">{playlist.name}</p>
        </a>
    );
}

function MusicPage() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const myId = useSelector(s => s.auth.user?.id);

    const [mainTab, setMainTab] = useState('concerts'); // 'concerts' | 'events' | 'listen'
    const [amateurTab, setAmateurTab] = useState('events'); // 'events' | 'courses' | 'media'
    const [tab, setTab] = useState('search'); // 'search' | 'playlists' | 'liked'
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [hasSearched, setHasSearched] = useState(false);
    const [results, setResults] = useState([]);
    const [trending, setTrending] = useState([]);
    const [trendingPlaylists, setTrendingPlaylists] = useState([]);
    const [trendingLoading, setTrendingLoading] = useState(false);
    const [playlists, setPlaylists] = useState([]);
    const [liked, setLiked] = useState([]);
    const [loadingLists, setLoadingLists] = useState(false);
    const [pickerTrack, setPickerTrack] = useState(null);
    const [newPlaylistName, setNewPlaylistName] = useState('');

    const [concertCity, setConcertCity] = useState('');
    const [concertArtist, setConcertArtist] = useState('');
    const [concertDateFrom, setConcertDateFrom] = useState('');
    const [concertDateTo, setConcertDateTo] = useState('');
    const [concerts, setConcerts] = useState([]);
    const [concertSearching, setConcertSearching] = useState(false);
    const [concertSearched, setConcertSearched] = useState(false);
    const [concertsView, setConcertsView] = useState('current'); // 'current' | 'past'

    const { currentConcerts, pastConcerts } = useMemo(() => {
        const cur = [], past = [];
        for (const c of concerts) (isPastEntry(c.date, c.time) ? past : cur).push(c);
        past.sort((a, b) => toTime(b.date, b.time) - toTime(a.date, a.time));
        return { currentConcerts: cur, pastConcerts: past };
    }, [concerts]);

    // ── Müzik Etkinlikleri: Etkinlikler ──────────────────────────────────────
    const [musicEvents, setMusicEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [eventsLoaded, setEventsLoaded] = useState(false);
    const [showCreateEvent, setShowCreateEvent] = useState(false);
    const [creatingEvent, setCreatingEvent] = useState(false);
    const EVENT_INIT = { message: '', venueName: '', city: '', date: '', time: '', fee: '', ticketUrl: '' };
    const [eventForm, setEventForm] = useState(EVENT_INIT);
    const [eventsView, setEventsView] = useState('current');

    const { currentMusicEvents, pastMusicEvents } = useMemo(() => {
        const cur = [], past = [];
        for (const e of musicEvents) {
            const dateOnly = e.matchDate ? e.matchDate.slice(0, 10) : null;
            (isPastEntry(dateOnly, e.matchTime) ? past : cur).push(e);
        }
        past.sort((a, b) => toTime(b.matchDate?.slice(0, 10), b.matchTime) - toTime(a.matchDate?.slice(0, 10), a.matchTime));
        return { currentMusicEvents: cur, pastMusicEvents: past };
    }, [musicEvents]);

    const loadMusicEvents = useCallback(async () => {
        setEventsLoading(true);
        try {
            const { data } = await api.get('/rivals', { params: { category: 'ARTS', subCategory: 'music' } });
            setMusicEvents(Array.isArray(data) ? data : []);
        } catch (e) { console.error(e); }
        finally { setEventsLoading(false); setEventsLoaded(true); }
    }, []);

    useEffect(() => {
        if (mainTab === 'events' && amateurTab === 'events' && !eventsLoaded) loadMusicEvents();
    }, [mainTab, amateurTab, eventsLoaded, loadMusicEvents]);

    const submitMusicEvent = async () => {
        if (!eventForm.message.trim()) return alert(t('music.event_msg_required'));
        setCreatingEvent(true);
        try {
            await api.post('/rivals', {
                category: 'ARTS', subCategory: 'music',
                message: eventForm.message.trim(),
                courtName: eventForm.venueName.trim() || undefined,
                location: eventForm.city.trim() || undefined,
                flexibleSchedule: !eventForm.date,
                matchDate: eventForm.date ? new Date(eventForm.date).toISOString() : undefined,
                matchTime: eventForm.time.trim() || undefined,
                courtFeePerPerson: eventForm.fee ? parseInt(eventForm.fee, 10) : undefined,
                ticketUrl: eventForm.ticketUrl.trim() || undefined,
            });
            setShowCreateEvent(false);
            setEventForm(EVENT_INIT);
            loadMusicEvents();
        } catch (e) {
            alert(e?.response?.data?.message || t('music.event_create_error'));
        } finally { setCreatingEvent(false); }
    };

    const joinMusicEvent = async (item) => {
        try {
            await api.post(`/rivals/${item.id}/respond`, {});
            loadMusicEvents();
        } catch (e) {
            alert(e?.response?.data?.message || t('music.event_join_error'));
        }
    };

    const openMusicEvent = (item) => {
        navigate(`/category/arts/music?highlightRivalId=${item.id}`);
    };

    // ── Müzik Etkinlikleri: Kurslar ───────────────────────────────────────────
    const [musicCourses, setMusicCourses] = useState([]);
    const [coursesLoading, setCoursesLoading] = useState(false);
    const [coursesLoaded, setCoursesLoaded] = useState(false);
    const [showCreateCourse, setShowCreateCourse] = useState(false);
    const [creatingCourse, setCreatingCourse] = useState(false);
    const COURSE_INIT = { credentialLevel: '', location: '', city: '', description: '', individual: true, group: false, priceIndividual: '', priceGroup: '' };
    const [courseForm, setCourseForm] = useState(COURSE_INIT);

    const loadMusicCourses = useCallback(async () => {
        setCoursesLoading(true);
        try {
            const { data } = await api.get('/coaches', { params: { category: 'ARTS', subCategory: 'music' } });
            setMusicCourses(Array.isArray(data) ? data : []);
        } catch (e) { console.error(e); }
        finally { setCoursesLoading(false); setCoursesLoaded(true); }
    }, []);

    useEffect(() => {
        if (mainTab === 'events' && amateurTab === 'courses' && !coursesLoaded) loadMusicCourses();
    }, [mainTab, amateurTab, coursesLoaded, loadMusicCourses]);

    const submitMusicCourse = async () => {
        if (!courseForm.credentialLevel.trim() || !courseForm.location.trim()) {
            return alert(t('music.course_required'));
        }
        setCreatingCourse(true);
        try {
            await api.post('/coaches', {
                category: 'ARTS', subCategory: 'music',
                credentialLevel: courseForm.credentialLevel.trim(),
                location: courseForm.location.trim(),
                city: courseForm.city.trim() || undefined,
                description: courseForm.description.trim() || undefined,
                individual: courseForm.individual,
                group: courseForm.group,
                priceIndividual: courseForm.priceIndividual ? parseInt(courseForm.priceIndividual, 10) : undefined,
                priceGroup: courseForm.priceGroup ? parseInt(courseForm.priceGroup, 10) : undefined,
            });
            setShowCreateCourse(false);
            setCourseForm(COURSE_INIT);
            loadMusicCourses();
        } catch (e) {
            alert(e?.response?.data?.message || t('music.course_create_error'));
        } finally { setCreatingCourse(false); }
    };

    // ── Müzik Etkinlikleri: Medya ─────────────────────────────────────────────
    const [musicMedia, setMusicMedia] = useState([]);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [uploadingMedia, setUploadingMedia] = useState(false);

    const loadMusicMedia = useCallback(async () => {
        setMediaLoading(true);
        try {
            const { data } = await api.get('/posts', { params: { category: 'ARTS', subCategory: 'music', mediaOnly: true, limit: 50 } });
            setMusicMedia(Array.isArray(data) ? data : (data.posts || []));
        } catch (e) { console.error(e); }
        finally { setMediaLoading(false); setMediaLoaded(true); }
    }, []);

    useEffect(() => {
        if (mainTab === 'events' && amateurTab === 'media' && !mediaLoaded) loadMusicMedia();
    }, [mainTab, amateurTab, mediaLoaded, loadMusicMedia]);

    const shareMusicMedia = async (e) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploadingMedia(true);
        try {
            const isVideo = file.type.startsWith('video/');
            const formData = new FormData();
            formData.append('file', file);
            const { data: uploadData } = await api.post('/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } });
            await api.post('/posts', {
                category: 'ARTS', subCategory: 'music', type: 'POST', content: '',
                ...(isVideo ? { videoUrl: uploadData.url } : { imageUrl: uploadData.url }),
            });
            loadMusicMedia();
        } catch (err) {
            alert(err?.response?.data?.message || t('music.media_share_error'));
        } finally { setUploadingMedia(false); }
    };

    const likedIds = useMemo(() => new Set(liked.map(l => l.trackId)), [liked]);

    const loadPlaylists = useCallback(() => {
        setLoadingLists(true);
        api.get('/playlists').then(r => setPlaylists(r.data)).catch(() => {}).finally(() => setLoadingLists(false));
    }, []);

    const loadLiked = useCallback(() => {
        api.get('/music/liked').then(r => setLiked(r.data)).catch(() => {});
    }, []);

    const loadTrending = useCallback(() => {
        setTrendingLoading(true);
        api.get('/music/trending')
            .then(r => { setTrending(r.data.tracks || []); setTrendingPlaylists(r.data.playlists || []); })
            .catch(() => {})
            .finally(() => setTrendingLoading(false));
    }, []);

    useEffect(() => { loadPlaylists(); loadLiked(); loadTrending(); }, [loadPlaylists, loadLiked, loadTrending]);

    const doConcertSearch = useCallback(async () => {
        setConcertSearching(true);
        try {
            const params = {};
            if (concertCity.trim()) params.city = concertCity.trim();
            if (concertArtist.trim()) params.artist = concertArtist.trim();
            if (concertDateFrom) params.dateFrom = fmtDate(concertDateFrom);
            if (concertDateTo) params.dateTo = fmtDate(concertDateTo);
            const { data } = await api.get('/concerts/search', { params });
            setConcerts(data.concerts || []);
        } catch (e) { console.error(e); }
        finally { setConcertSearching(false); setConcertSearched(true); }
    }, [concertCity, concertArtist, concertDateFrom, concertDateTo]);

    useEffect(() => { doConcertSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const doSearch = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const { data } = await api.get('/music/search', { params: { q: query.trim() } });
            setResults(data.tracks || []);
        } catch (e) { console.error(e); }
        finally { setSearching(false); setHasSearched(true); }
    };

    const handlePlay = (track, list) => {
        playTrack(track, list).catch(() => {});
    };

    const handleLike = async (track) => {
        const isLiked = likedIds.has(track.trackId);
        try {
            if (isLiked) {
                await api.delete(`/music/liked/${track.trackId}`);
                setLiked(prev => prev.filter(l => l.trackId !== track.trackId));
            } else {
                await api.post('/music/liked', track);
                setLiked(prev => [track, ...prev]);
            }
        } catch { /* sessizce yut */ }
    };

    const handleAddToPlaylist = async (playlistId) => {
        if (!pickerTrack) return;
        try {
            await api.post(`/playlists/${playlistId}/tracks`, pickerTrack);
            setPickerTrack(null);
            loadPlaylists();
        } catch (e) {
            alert(e?.response?.data?.message || t('music.add_failed'));
        }
    };

    const handleCreatePlaylist = async () => {
        if (!newPlaylistName.trim()) return;
        try {
            const { data } = await api.post('/playlists', { name: newPlaylistName.trim() });
            setNewPlaylistName('');
            setPlaylists(prev => [data, ...prev]);
            if (pickerTrack) handleAddToPlaylist(data.id);
        } catch (e) {
            alert(e?.response?.data?.message || t('music.create_failed'));
        }
    };

    const showingTrending = tab === 'search' && !hasSearched;
    const currentList = tab === 'search' ? (showingTrending ? trending : results) : tab === 'liked' ? liked : [];

    return (
        <div className="min-h-screen bg-gray-950 pb-20">
            <Navbar onBack={() => navigate(-1)} />
            <YoutubeAudioPlayer />
            <MiniPlayer />

            <div className="max-w-4xl mx-auto px-4 py-6">
                <h1 className={`text-2xl font-black bg-gradient-to-r ${GRADIENT} bg-clip-text text-transparent mb-4`}>🎵 {t('music.title')}</h1>

                {/* Main tabs */}
                <div className="flex gap-2 bg-gray-900 p-1 rounded-xl border border-gray-800 mb-4">
                    {[
                        { id: 'concerts', label: t('music.tab_concerts') },
                        { id: 'events', label: t('music.tab_events') },
                        { id: 'listen', label: t('music.tab_listen') },
                    ].map(mt => (
                        <button key={mt.id} onClick={() => setMainTab(mt.id)}
                            className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition ${mainTab === mt.id ? `bg-gradient-to-r ${GRADIENT} text-white` : 'text-gray-400 hover:text-white'}`}>
                            {mt.label}
                        </button>
                    ))}
                </div>

                {mainTab === 'concerts' && (
                    <div className="space-y-3">
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input value={concertCity} onChange={e => setConcertCity(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && doConcertSearch()}
                                placeholder={t('music.city_ph')}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                            <input value={concertArtist} onChange={e => setConcertArtist(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && doConcertSearch()}
                                placeholder={t('music.artist_ph')}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                        </div>
                        <div className="flex flex-col sm:flex-row gap-2">
                            <input type="date" value={concertDateFrom} onChange={e => setConcertDateFrom(e.target.value)}
                                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                            <input type="date" value={concertDateTo} onChange={e => setConcertDateTo(e.target.value)}
                                className="bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                            <button onClick={doConcertSearch} className={`bg-gradient-to-r ${GRADIENT} text-white text-sm font-bold rounded-lg px-4 py-2`}>
                                {t('music.search')}
                            </button>
                        </div>

                        <div className="flex gap-2">
                            {['current', 'past'].map(v => (
                                <button key={v} onClick={() => setConcertsView(v)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${concertsView === v ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-900 border-gray-800 text-gray-500'}`}>
                                    {v === 'current' ? t('music.view_current') : `${t('music.view_past')}${pastConcerts.length > 0 ? ` (${pastConcerts.length})` : ''}`}
                                </button>
                            ))}
                        </div>

                        {concertSearching ? (
                            <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                        ) : (
                            (concertsView === 'current' ? currentConcerts : pastConcerts).length === 0 ? (
                                concertSearched && <p className="text-gray-600 text-sm text-center py-8">{concertsView === 'past' ? t('music.no_past_concerts') : t('music.no_concerts')}</p>
                            ) : (
                                <div>{(concertsView === 'current' ? currentConcerts : pastConcerts).map(c => <ConcertCard key={c.id} item={c} t={t} />)}</div>
                            )
                        )}
                    </div>
                )}

                {mainTab === 'events' && (
                    <div className="space-y-3">
                        <div className="flex gap-1.5 bg-gray-900 p-1 rounded-xl border border-gray-800">
                            {[
                                { id: 'events', label: `🎉 ${t('music.sub_events')}` },
                                { id: 'courses', label: `🎓 ${t('music.sub_courses')}` },
                                { id: 'media', label: `📷 ${t('music.sub_media')}` },
                            ].map(sb => (
                                <button key={sb.id} onClick={() => setAmateurTab(sb.id)}
                                    className={`flex-1 py-1.5 px-2 rounded-lg text-xs font-bold transition ${amateurTab === sb.id ? `bg-gradient-to-r ${GRADIENT} text-white` : 'text-gray-400 hover:text-white'}`}>
                                    {sb.label}
                                </button>
                            ))}
                        </div>

                        {amateurTab === 'events' && (
                            <>
                                <div className="flex justify-end">
                                    <button onClick={() => setShowCreateEvent(true)}
                                        className={`bg-gradient-to-r ${GRADIENT} text-white font-bold px-4 py-2 rounded-xl text-sm`}>
                                        + {t('music.create_event')}
                                    </button>
                                </div>
                                <div className="flex gap-2">
                                    {['current', 'past'].map(v => (
                                        <button key={v} onClick={() => setEventsView(v)}
                                            className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${eventsView === v ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-900 border-gray-800 text-gray-500'}`}>
                                            {v === 'current' ? t('music.view_current') : `${t('music.view_past')}${pastMusicEvents.length > 0 ? ` (${pastMusicEvents.length})` : ''}`}
                                        </button>
                                    ))}
                                </div>
                                {eventsLoading ? (
                                    <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                                ) : (
                                    (eventsView === 'current' ? currentMusicEvents : pastMusicEvents).length === 0 ? (
                                        eventsLoaded && <p className="text-gray-600 text-sm text-center py-8">{eventsView === 'past' ? t('music.no_past_events') : t('music.no_events')}</p>
                                    ) : (
                                        <div className="space-y-3">
                                            {(eventsView === 'current' ? currentMusicEvents : pastMusicEvents).map(item => (
                                                <MusicEventCard key={item.id} item={item} myId={myId} onJoin={joinMusicEvent} onOpen={openMusicEvent} t={t} />
                                            ))}
                                        </div>
                                    )
                                )}
                            </>
                        )}

                        {amateurTab === 'courses' && (
                            <>
                                <div className="flex justify-end">
                                    <button onClick={() => setShowCreateCourse(true)}
                                        className={`bg-gradient-to-r ${GRADIENT} text-white font-bold px-4 py-2 rounded-xl text-sm`}>
                                        + {t('music.create_course')}
                                    </button>
                                </div>
                                {coursesLoading ? (
                                    <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                                ) : musicCourses.length === 0 ? (
                                    coursesLoaded && <p className="text-gray-600 text-sm text-center py-8">{t('music.no_courses')}</p>
                                ) : (
                                    <div className="space-y-3">{musicCourses.map(item => <MusicCourseCard key={item.id} item={item} t={t} />)}</div>
                                )}
                            </>
                        )}

                        {amateurTab === 'media' && (
                            <>
                                <div className="flex justify-end">
                                    <label className={`bg-gradient-to-r ${GRADIENT} text-white font-bold px-4 py-2 rounded-xl text-sm cursor-pointer`}>
                                        {uploadingMedia ? '…' : `+ ${t('music.share')}`}
                                        <input type="file" accept="image/*,video/*" onChange={shareMusicMedia} disabled={uploadingMedia} className="hidden" />
                                    </label>
                                </div>
                                {mediaLoading ? (
                                    <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                                ) : musicMedia.length === 0 ? (
                                    mediaLoaded && <p className="text-gray-600 text-sm text-center py-8">{t('music.no_media')}</p>
                                ) : (
                                    <div className="grid grid-cols-3 gap-1">
                                        {musicMedia.map(item => (
                                            <div key={item.id} className="aspect-square rounded-lg overflow-hidden bg-gray-800 flex items-center justify-center">
                                                {item.videoUrl
                                                    ? <span className="text-2xl">🎬</span>
                                                    : <img src={item.imageUrl} alt="" className="w-full h-full object-cover" />
                                                }
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </>
                        )}
                    </div>
                )}

                {mainTab === 'listen' && (
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <input value={query} onChange={e => { setQuery(e.target.value); if (!e.target.value.trim()) setHasSearched(false); }}
                                onKeyDown={e => e.key === 'Enter' && doSearch()}
                                placeholder={t('music.search_ph')}
                                className="flex-1 bg-gray-900 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white placeholder-gray-500 focus:outline-none focus:border-purple-500" />
                            <button onClick={doSearch} className={`bg-gradient-to-r ${GRADIENT} text-white text-sm font-bold rounded-lg px-4 py-2`}>
                                {t('music.search')}
                            </button>
                        </div>

                        <div className="flex gap-2">
                            {[
                                { id: 'search', label: t('music.tab_results') },
                                { id: 'playlists', label: t('music.tab_playlists') },
                                { id: 'liked', label: t('music.tab_liked') },
                            ].map(tb => (
                                <button key={tb.id} onClick={() => setTab(tb.id)}
                                    className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition ${tab === tb.id ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-900 border-gray-800 text-gray-500'}`}>
                                    {tb.label}
                                </button>
                            ))}
                        </div>

                        {tab === 'playlists' ? (
                            loadingLists ? (
                                <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                            ) : playlists.length === 0 ? (
                                <p className="text-gray-600 text-sm text-center py-8">{t('music.no_playlists')}</p>
                            ) : (
                                <div>{playlists.map(p => (
                                    <div key={p.id} className="flex items-center gap-2.5 py-2.5 border-b border-gray-800">
                                        <div className="w-10 h-10 rounded-md bg-gray-800 flex items-center justify-center text-sm">📁</div>
                                        <div>
                                            <p className="text-white text-sm font-bold">{p.name}</p>
                                            <p className="text-gray-500 text-xs">{(p.tracks || []).length} {t('music.songs')}</p>
                                        </div>
                                    </div>
                                ))}</div>
                            )
                        ) : (searching || (showingTrending && trendingLoading)) ? (
                            <p className="text-gray-500 text-sm text-center py-8">{t('common.loading')}</p>
                        ) : (
                            <div>
                                {showingTrending && trendingPlaylists.length > 0 && (
                                    <>
                                        <p className="text-gray-300 text-sm font-bold mb-2">{t('music.featured_playlists')}</p>
                                        <div className="flex gap-3 overflow-x-auto pb-3 mb-2">
                                            {trendingPlaylists.map((p, i) => <TrendingPlaylistCard key={`${p.playlistId}-${i}`} playlist={p} />)}
                                        </div>
                                    </>
                                )}
                                {showingTrending && trending.length > 0 && (
                                    <p className="text-gray-300 text-sm font-bold mb-2">{t('music.trending')}</p>
                                )}
                                {currentList.length === 0 ? (
                                    <p className="text-gray-600 text-sm text-center py-8">
                                        {tab === 'search'
                                            ? (showingTrending ? t('music.no_trending') : t('music.no_results'))
                                            : t('music.no_liked')}
                                    </p>
                                ) : (
                                    currentList.map((item, i) => (
                                        <TrackRow key={`${item.trackId}-${i}`} track={item} liked={likedIds.has(item.trackId)}
                                            onPlay={(tr) => handlePlay(tr, currentList)} onLike={handleLike}
                                            onAddToPlaylist={(tr) => setPickerTrack(tr)} />
                                    ))
                                )}
                            </div>
                        )}
                    </div>
                )}
            </div>

            {/* Create event modal */}
            {showCreateEvent && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <p className="text-white font-bold">📅 {t('music.create_event')}</p>
                            <button onClick={() => setShowCreateEvent(false)} className="text-gray-500 hover:text-white text-lg">✕</button>
                        </div>
                        <textarea value={eventForm.message} onChange={e => setEventForm(f => ({ ...f, message: e.target.value }))}
                            rows={3} placeholder={t('music.event_msg_ph')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
                        <input value={eventForm.venueName} onChange={e => setEventForm(f => ({ ...f, venueName: e.target.value }))}
                            placeholder={t('music.venue_ph')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                        <input value={eventForm.city} onChange={e => setEventForm(f => ({ ...f, city: e.target.value }))}
                            placeholder={t('music.city_ph2')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                        <div className="grid grid-cols-2 gap-2">
                            <input type="date" value={eventForm.date} onChange={e => setEventForm(f => ({ ...f, date: e.target.value }))}
                                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                            <input type="time" value={eventForm.time} onChange={e => setEventForm(f => ({ ...f, time: e.target.value }))}
                                className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                        </div>
                        <input value={eventForm.fee} onChange={e => setEventForm(f => ({ ...f, fee: e.target.value.replace(/[^0-9]/g, '') }))}
                            placeholder={t('music.fee_ph')} inputMode="numeric"
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                        <input value={eventForm.ticketUrl} onChange={e => setEventForm(f => ({ ...f, ticketUrl: e.target.value }))}
                            placeholder="https://..."
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                        <button onClick={submitMusicEvent} disabled={creatingEvent}
                            className={`w-full bg-gradient-to-r ${GRADIENT} text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50`}>
                            {creatingEvent ? '…' : t('music.create_event')}
                        </button>
                    </div>
                </div>
            )}

            {/* Create course modal */}
            {showCreateCourse && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-md space-y-3 max-h-[90vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <p className="text-white font-bold">🎓 {t('music.create_course')}</p>
                            <button onClick={() => setShowCreateCourse(false)} className="text-gray-500 hover:text-white text-lg">✕</button>
                        </div>
                        <input value={courseForm.credentialLevel} onChange={e => setCourseForm(f => ({ ...f, credentialLevel: e.target.value }))}
                            placeholder={t('music.credential_ph')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                        <input value={courseForm.location} onChange={e => setCourseForm(f => ({ ...f, location: e.target.value }))}
                            placeholder={t('music.lesson_venue_ph')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                        <input value={courseForm.city} onChange={e => setCourseForm(f => ({ ...f, city: e.target.value }))}
                            placeholder={t('music.city_ph2')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                        <textarea value={courseForm.description} onChange={e => setCourseForm(f => ({ ...f, description: e.target.value }))}
                            rows={2} placeholder={t('music.desc_ph')}
                            className="w-full bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500 resize-none" />
                        <div className="flex gap-2">
                            <button onClick={() => setCourseForm(f => ({ ...f, individual: !f.individual }))}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition ${courseForm.individual ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                {t('music.individual_lesson')}
                            </button>
                            <button onClick={() => setCourseForm(f => ({ ...f, group: !f.group }))}
                                className={`flex-1 py-2 rounded-lg text-xs font-bold border transition ${courseForm.group ? 'bg-purple-600/20 border-purple-500 text-purple-300' : 'bg-gray-800 border-gray-700 text-gray-400'}`}>
                                {t('music.group_lesson')}
                            </button>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                            {courseForm.individual && (
                                <input value={courseForm.priceIndividual} onChange={e => setCourseForm(f => ({ ...f, priceIndividual: e.target.value.replace(/[^0-9]/g, '') }))}
                                    placeholder={t('music.individual_price_ph')} inputMode="numeric"
                                    className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                            )}
                            {courseForm.group && (
                                <input value={courseForm.priceGroup} onChange={e => setCourseForm(f => ({ ...f, priceGroup: e.target.value.replace(/[^0-9]/g, '') }))}
                                    placeholder={t('music.group_price_ph')} inputMode="numeric"
                                    className="bg-gray-800 border border-gray-700 rounded-xl px-3 py-2 text-white text-sm focus:outline-none focus:border-purple-500" />
                            )}
                        </div>
                        <button onClick={submitMusicCourse} disabled={creatingCourse}
                            className={`w-full bg-gradient-to-r ${GRADIENT} text-white font-bold py-3 rounded-xl text-sm disabled:opacity-50`}>
                            {creatingCourse ? '…' : t('music.create_course')}
                        </button>
                    </div>
                </div>
            )}

            {/* Add-to-playlist modal */}
            {pickerTrack && (
                <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
                    <div className="bg-gray-900 border border-gray-700 rounded-2xl p-5 w-full max-w-sm space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-white font-bold">{t('music.add_to_playlist')}</p>
                            <button onClick={() => setPickerTrack(null)} className="text-gray-500 hover:text-white text-lg">✕</button>
                        </div>
                        <div className="max-h-56 overflow-y-auto">
                            {playlists.map(p => (
                                <button key={p.id} onClick={() => handleAddToPlaylist(p.id)}
                                    className="w-full text-left py-2 border-b border-gray-800 text-white text-sm">
                                    {p.name}
                                </button>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input value={newPlaylistName} onChange={e => setNewPlaylistName(e.target.value)}
                                placeholder={t('music.new_playlist_ph')}
                                className="flex-1 bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:border-purple-500" />
                            <button onClick={handleCreatePlaylist} className={`bg-gradient-to-r ${GRADIENT} text-white text-sm font-bold rounded-lg px-4 py-2`}>
                                {t('music.create')}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

export default MusicPage;
