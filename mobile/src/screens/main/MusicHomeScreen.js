import { useState, useCallback, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, Image, ScrollView,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Modal, Linking,
} from 'react-native';
import { useSelector } from 'react-redux';
import DateTimePicker from '@react-native-community/datetimepicker';
import * as ImagePicker from 'expo-image-picker';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import { playTrack } from '../../services/musicPlayer';

function fmtDate(d) {
    if (!d) return null;
    return d.toISOString().slice(0, 10);
}

function ConcertCard({ item, t }) {
    const priceLabel = item.priceMin != null
        ? `${item.priceMin}${item.priceMax && item.priceMax !== item.priceMin ? '–' + item.priceMax : ''} ${item.currency || ''}`.trim()
        : null;
    return (
        <View style={s.concertCard}>
            {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={s.concertImg} />
            ) : (
                <View style={[s.concertImg, s.rowArtFallback]}><Text style={{ fontSize: 22 }}>🎤</Text></View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.concertArtist} numberOfLines={1}>{item.artist}</Text>
                <Text style={s.concertMeta} numberOfLines={1}>
                    {[item.venueName, item.city].filter(Boolean).join(' · ')}
                </Text>
                <Text style={s.concertMeta}>
                    {item.date}{item.time ? ` · ${item.time.slice(0, 5)}` : ''}
                </Text>
                {priceLabel && <Text style={s.concertPrice}>{priceLabel}</Text>}
                {item.ticketUrl && (
                    <TouchableOpacity style={s.ticketBtn} onPress={() => Linking.openURL(item.ticketUrl)}>
                        <Text style={s.ticketBtnText}>{t.concertTicketBtn || 'Bilet Al'}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

function MusicEventCard({ item, myId, onJoin, onOpen, t }) {
    const isOwner = item.senderId === myId;
    const joinStatus = item._myJoinStatus;
    const participantCount = (Array.isArray(item.participants) ? item.participants.length : 0) + 1; // +sender
    return (
        <TouchableOpacity style={s.eventCard} onPress={() => onOpen(item)} activeOpacity={0.8}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={s.eventOwner} numberOfLines={1}>👤 {item.sender?.fullName || item.sender?.username}</Text>
                <Text style={s.eventCount}>👥 {participantCount}</Text>
            </View>
            {item.message ? <Text style={s.eventMessage} numberOfLines={3}>{item.message}</Text> : null}
            <View style={s.eventMetaRow}>
                {item.courtName ? <Text style={s.eventMeta}>📍 {item.courtName}</Text> : null}
                {item.location ? <Text style={s.eventMeta}>🏙️ {item.location}</Text> : null}
            </View>
            {(item.matchDate || item.matchTime) ? (
                <Text style={s.eventMeta}>
                    📅 {item.matchDate ? fmtDate(new Date(item.matchDate)) : (t.musicEventFlexibleDate || 'Esnek tarih')}{item.matchTime ? ` · ${item.matchTime}` : ''}
                </Text>
            ) : null}
            {item.courtFeePerPerson ? <Text style={s.eventMeta}>💰 {item.courtFeePerPerson} ₺ / kişi</Text> : null}
            {item.ticketUrl && (
                <TouchableOpacity style={s.ticketBtnSm} onPress={(e) => { e.stopPropagation?.(); Linking.openURL(item.ticketUrl); }}>
                    <Text style={s.ticketBtnSmText}>{t.concertTicketBtn || 'Bilet Al'}</Text>
                </TouchableOpacity>
            )}
            {!isOwner && (
                <TouchableOpacity
                    style={[s.joinBtn, joinStatus && s.joinBtnDisabled]}
                    disabled={!!joinStatus}
                    onPress={(e) => { e.stopPropagation?.(); onJoin(item); }}
                >
                    <Text style={s.joinBtnText}>
                        {joinStatus === 'ACCEPTED' ? (t.eventJoined || '✓ Katıldınız')
                            : joinStatus === 'PENDING' ? (t.eventPending || '⏳ Bekleniyor')
                            : (t.eventJoinBtn || 'Katıl')}
                    </Text>
                </TouchableOpacity>
            )}
        </TouchableOpacity>
    );
}

function MusicCourseCard({ item }) {
    const priceLabel = [
        item.individual && item.priceIndividual ? `Bireysel ${item.priceIndividual}₺` : null,
        item.group && item.priceGroup ? `Grup ${item.priceGroup}₺` : null,
    ].filter(Boolean).join(' · ');
    return (
        <View style={s.eventCard}>
            <Text style={s.eventOwner}>🎓 {item.user?.fullName || item.user?.username}</Text>
            <Text style={s.eventMessage}>{item.credentialLevel}{item.experience ? ` · ${item.experience} yıl deneyim` : ''}</Text>
            {item.description ? <Text style={s.eventMeta} numberOfLines={3}>{item.description}</Text> : null}
            <View style={s.eventMetaRow}>
                <Text style={s.eventMeta}>📍 {item.location}{item.city ? `, ${item.city}` : ''}</Text>
            </View>
            {priceLabel ? <Text style={s.eventMeta}>💰 {priceLabel}</Text> : null}
        </View>
    );
}

function TrackRow({ track, onPlay, onLike, liked, onAddToPlaylist }) {
    return (
        <View style={s.row}>
            <TouchableOpacity style={s.rowMain} onPress={() => onPlay(track)} activeOpacity={0.75}>
                {track.imageUrl ? (
                    <Image source={{ uri: track.imageUrl }} style={s.rowArt} />
                ) : (
                    <View style={[s.rowArt, s.rowArtFallback]}><Text style={{ fontSize: 16 }}>🎵</Text></View>
                )}
                <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.rowTitle} numberOfLines={1}>{track.title}</Text>
                    <Text style={s.rowArtist} numberOfLines={1}>{track.artist}</Text>
                </View>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onLike(track)} style={s.rowIconBtn}>
                <Text style={{ fontSize: 16 }}>{liked ? '❤️' : '🤍'}</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={() => onAddToPlaylist(track)} style={s.rowIconBtn}>
                <Text style={{ fontSize: 16, color: colors.textMuted }}>➕</Text>
            </TouchableOpacity>
        </View>
    );
}

export default function MusicHomeScreen({ navigation }) {
    const t = useT();
    const myId = useSelector(s => s.auth.user?.id);
    const [mainTab, setMainTab] = useState('concerts'); // 'concerts' | 'events' | 'listen'
    const [amateurTab, setAmateurTab] = useState('events'); // 'events' | 'courses' | 'media'
    const [tab, setTab] = useState('search'); // 'search' | 'playlists' | 'liked'
    const [query, setQuery] = useState('');
    const [searching, setSearching] = useState(false);
    const [results, setResults] = useState([]);
    const [playlists, setPlaylists] = useState([]);
    const [liked, setLiked] = useState([]);
    const [loadingLists, setLoadingLists] = useState(false);
    const [pickerTrack, setPickerTrack] = useState(null);
    const [newPlaylistName, setNewPlaylistName] = useState('');

    const [concertCity, setConcertCity] = useState('');
    const [concertArtist, setConcertArtist] = useState('');
    const [concertDateFrom, setConcertDateFrom] = useState(null);
    const [concertDateTo, setConcertDateTo] = useState(null);
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);
    const [concerts, setConcerts] = useState([]);
    const [concertSearching, setConcertSearching] = useState(false);
    const [concertSearched, setConcertSearched] = useState(false);

    // ── Müzik Etkinlikleri: Etkinlikler ──────────────────────────────────────
    const [musicEvents, setMusicEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [eventsLoaded, setEventsLoaded] = useState(false);
    const [showCreateEvent, setShowCreateEvent] = useState(false);
    const [creatingEvent, setCreatingEvent] = useState(false);
    const [showEventDatePicker, setShowEventDatePicker] = useState(false);
    const EVENT_INIT = { message: '', venueName: '', city: '', date: null, time: '', fee: '', ticketUrl: '' };
    const [eventForm, setEventForm] = useState(EVENT_INIT);

    const loadMusicEvents = useCallback(async () => {
        setEventsLoading(true);
        try {
            const { data } = await api.get('/rivals', { params: { category: 'ARTS', subCategory: 'music' } });
            setMusicEvents(Array.isArray(data) ? data : []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.musicEventsLoadError || 'Etkinlikler yüklenemedi.');
        } finally {
            setEventsLoading(false);
            setEventsLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'events' && amateurTab === 'events' && !eventsLoaded) loadMusicEvents();
    }, [mainTab, amateurTab, eventsLoaded, loadMusicEvents]);

    const submitMusicEvent = async () => {
        if (!eventForm.message.trim()) return Alert.alert('', t.musicEventMsgRequired || 'Etkinlik açıklaması girin.');
        setCreatingEvent(true);
        try {
            await api.post('/rivals', {
                category: 'ARTS', subCategory: 'music',
                message: eventForm.message.trim(),
                courtName: eventForm.venueName.trim() || undefined,
                location: eventForm.city.trim() || undefined,
                flexibleSchedule: !eventForm.date,
                matchDate: eventForm.date ? eventForm.date.toISOString() : undefined,
                matchTime: eventForm.time.trim() || undefined,
                courtFeePerPerson: eventForm.fee ? parseInt(eventForm.fee, 10) : undefined,
                ticketUrl: eventForm.ticketUrl.trim() || undefined,
            });
            setShowCreateEvent(false);
            setEventForm(EVENT_INIT);
            loadMusicEvents();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.musicEventCreateError || 'Etkinlik oluşturulamadı.');
        } finally {
            setCreatingEvent(false);
        }
    };

    const joinMusicEvent = async (item) => {
        try {
            await api.post(`/rivals/${item.id}/respond`, {});
            Alert.alert('', t.musicEventJoinSent || 'Katılım isteği gönderildi.');
            loadMusicEvents();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.musicEventJoinError || 'İstek gönderilemedi.');
        }
    };

    const openMusicEvent = (item) => {
        navigation.navigate('SubCategory', { category: 'ARTS', sub: 'music', initialTab: 'rivals', highlightRivalId: item.id });
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
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.musicCoursesLoadError || 'Kurslar yüklenemedi.');
        } finally {
            setCoursesLoading(false);
            setCoursesLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'events' && amateurTab === 'courses' && !coursesLoaded) loadMusicCourses();
    }, [mainTab, amateurTab, coursesLoaded, loadMusicCourses]);

    const submitMusicCourse = async () => {
        if (!courseForm.credentialLevel.trim() || !courseForm.location.trim()) {
            return Alert.alert('', t.musicCourseRequired || 'Uzmanlık/seviye ve konum zorunludur.');
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
            Alert.alert('', e?.response?.data?.message || t.musicCourseCreateError || 'Kurs oluşturulamadı.');
        } finally {
            setCreatingCourse(false);
        }
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
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.musicMediaLoadError || 'Medya yüklenemedi.');
        } finally {
            setMediaLoading(false);
            setMediaLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'events' && amateurTab === 'media' && !mediaLoaded) loadMusicMedia();
    }, [mainTab, amateurTab, mediaLoaded, loadMusicMedia]);

    const shareMusicMedia = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return Alert.alert('', t.galleryPermission || 'Galeri izni gerekli');
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        const isVideo = asset.type === 'video';
        setUploadingMedia(true);
        try {
            const form = new FormData();
            form.append('file', { uri: asset.uri, name: isVideo ? 'music-media.mp4' : 'music-media.jpg', type: isVideo ? 'video/mp4' : 'image/jpeg' });
            const { data: uploadData } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            await api.post('/posts', {
                category: 'ARTS', subCategory: 'music', type: 'POST', content: '',
                ...(isVideo ? { videoUrl: uploadData.url } : { imageUrl: uploadData.url }),
            });
            loadMusicMedia();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.musicMediaShareError || 'Paylaşılamadı.');
        } finally {
            setUploadingMedia(false);
        }
    };

    const likedIds = new Set(liked.map(l => l.trackId));

    const loadPlaylists = useCallback(() => {
        setLoadingLists(true);
        api.get('/playlists').then(r => setPlaylists(r.data)).catch(() => {}).finally(() => setLoadingLists(false));
    }, []);

    const loadLiked = useCallback(() => {
        api.get('/music/liked').then(r => setLiked(r.data)).catch(() => {});
    }, []);

    useEffect(() => { loadPlaylists(); loadLiked(); }, [loadPlaylists, loadLiked]);

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
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.concertLoadError || 'Konserler yüklenemedi.');
        } finally {
            setConcertSearching(false);
            setConcertSearched(true);
        }
    }, [concertCity, concertArtist, concertDateFrom, concertDateTo, t]);

    useEffect(() => { doConcertSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const doSearch = async () => {
        if (!query.trim()) return;
        setSearching(true);
        try {
            const { data } = await api.get('/music/search', { params: { q: query.trim() } });
            setResults(data.tracks || []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || 'Arama başarısız');
        } finally { setSearching(false); }
    };

    const handlePlay = (track, list) => {
        playTrack(track, list).catch(() => Alert.alert('', 'Çalma başlatılamadı'));
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
            Alert.alert('', e?.response?.data?.message || 'Eklenemedi');
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
            Alert.alert('', e?.response?.data?.message || 'Oluşturulamadı');
        }
    };

    const currentList = tab === 'search' ? results : tab === 'liked' ? liked : [];

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.musicTitle || '🎵 Müzik'}</Text>
            </View>

            <View style={s.mainTabRow}>
                {[
                    { id: 'concerts', label: t.musicMainTabConcerts || 'Konserler' },
                    { id: 'events', label: t.musicMainTabEvents || 'Müzik Etkinlikleri' },
                    { id: 'listen', label: t.musicMainTabListen || 'Müzik Dinle' },
                ].map(mt => (
                    <TouchableOpacity key={mt.id} onPress={() => setMainTab(mt.id)}
                        style={[s.mainTabBtn, mainTab === mt.id && s.mainTabBtnActive]}>
                        <Text style={[s.mainTabBtnText, mainTab === mt.id && s.mainTabBtnTextActive]}>{mt.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {mainTab === 'concerts' ? (
                <>
                    <View style={s.filtersBlock}>
                        <View style={s.searchRow}>
                            <TextInput
                                value={concertCity}
                                onChangeText={setConcertCity}
                                onSubmitEditing={doConcertSearch}
                                placeholder={t.concertCityPh || 'İl'}
                                placeholderTextColor={colors.textMuted}
                                style={[s.searchInput, { flex: 1 }]}
                                returnKeyType="search"
                            />
                            <TextInput
                                value={concertArtist}
                                onChangeText={setConcertArtist}
                                onSubmitEditing={doConcertSearch}
                                placeholder={t.concertArtistPh || 'Kimin konseri?'}
                                placeholderTextColor={colors.textMuted}
                                style={[s.searchInput, { flex: 1 }]}
                                returnKeyType="search"
                            />
                        </View>
                        <View style={s.searchRow}>
                            <TouchableOpacity style={s.dateBtn} onPress={() => setShowFromPicker(true)}>
                                <Text style={s.dateBtnText}>{concertDateFrom ? fmtDate(concertDateFrom) : (t.concertDateFromPh || 'Başlangıç tarihi')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={s.dateBtn} onPress={() => setShowToPicker(true)}>
                                <Text style={s.dateBtnText}>{concertDateTo ? fmtDate(concertDateTo) : (t.concertDateToPh || 'Bitiş tarihi')}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={doConcertSearch} style={s.searchBtn}>
                                <Text style={{ color: '#fff', fontWeight: '700' }}>{t.concertSearchBtn || 'Ara'}</Text>
                            </TouchableOpacity>
                        </View>
                        {showFromPicker && (
                            <DateTimePicker
                                value={concertDateFrom || new Date()}
                                mode="date"
                                onChange={(evt, date) => {
                                    setShowFromPicker(Platform.OS === 'ios');
                                    if (date) setConcertDateFrom(date);
                                }}
                            />
                        )}
                        {showToPicker && (
                            <DateTimePicker
                                value={concertDateTo || new Date()}
                                mode="date"
                                onChange={(evt, date) => {
                                    setShowToPicker(Platform.OS === 'ios');
                                    if (date) setConcertDateTo(date);
                                }}
                            />
                        )}
                    </View>

                    {concertSearching ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                    ) : (
                        <FlatList
                            data={concerts}
                            keyExtractor={item => item.id}
                            contentContainerStyle={s.list}
                            ListEmptyComponent={
                                concertSearched ? <Text style={s.emptyText}>{t.concertNoResults || 'Bu filtrelere uyan konser bulunamadı.'}</Text> : null
                            }
                            renderItem={({ item }) => <ConcertCard item={item} t={t} />}
                        />
                    )}
                </>
            ) : mainTab === 'events' ? (
                <>
                    <View style={s.subTabRow}>
                        {[
                            { id: 'events',  label: t.musicSubEvents  || '🎉 Etkinlikler' },
                            { id: 'courses', label: t.musicSubCourses || '🎓 Kurslar' },
                            { id: 'media',   label: t.musicSubMedia   || '📷 Medya' },
                        ].map(tb => (
                            <TouchableOpacity key={tb.id} onPress={() => setAmateurTab(tb.id)}
                                style={[s.subTabBtn, amateurTab === tb.id && s.subTabBtnActive]}>
                                <Text style={[s.subTabBtnText, amateurTab === tb.id && s.subTabBtnTextActive]}>{tb.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {amateurTab === 'events' && (
                        <>
                            <View style={s.smallCreateRow}>
                                <TouchableOpacity style={s.smallCreateBtn} onPress={() => setShowCreateEvent(true)}>
                                    <Text style={s.smallCreateBtnText}>{t.musicCreateListingBtn || '+ Etkinlik Oluştur'}</Text>
                                </TouchableOpacity>
                            </View>
                            {eventsLoading ? (
                                <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                            ) : (
                                <FlatList
                                    data={musicEvents}
                                    keyExtractor={item => item.id}
                                    contentContainerStyle={s.list}
                                    ListEmptyComponent={eventsLoaded ? <Text style={s.emptyText}>{t.musicNoEvents || 'Henüz etkinlik yok. İlk etkinliği siz oluşturun!'}</Text> : null}
                                    renderItem={({ item }) => <MusicEventCard item={item} myId={myId} onJoin={joinMusicEvent} onOpen={openMusicEvent} t={t} />}
                                />
                            )}
                        </>
                    )}

                    {amateurTab === 'courses' && (
                        <>
                            <View style={s.smallCreateRow}>
                                <TouchableOpacity style={s.smallCreateBtn} onPress={() => setShowCreateCourse(true)}>
                                    <Text style={s.smallCreateBtnText}>{t.musicCreateCourseBtn || '+ Kurs Oluştur'}</Text>
                                </TouchableOpacity>
                            </View>
                            {coursesLoading ? (
                                <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                            ) : (
                                <FlatList
                                    data={musicCourses}
                                    keyExtractor={item => item.id}
                                    contentContainerStyle={s.list}
                                    ListEmptyComponent={coursesLoaded ? <Text style={s.emptyText}>{t.musicNoCourses || 'Henüz kurs yok.'}</Text> : null}
                                    renderItem={({ item }) => <MusicCourseCard item={item} />}
                                />
                            )}
                        </>
                    )}

                    {amateurTab === 'media' && (
                        <>
                            <View style={s.smallCreateRow}>
                                <TouchableOpacity style={s.smallCreateBtn} onPress={shareMusicMedia} disabled={uploadingMedia}>
                                    <Text style={s.smallCreateBtnText}>{uploadingMedia ? '…' : (t.musicShareMediaBtn || '+ Paylaş')}</Text>
                                </TouchableOpacity>
                            </View>
                            {mediaLoading ? (
                                <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                            ) : (
                                <FlatList
                                    data={musicMedia}
                                    keyExtractor={item => item.id}
                                    numColumns={3}
                                    contentContainerStyle={s.mediaGrid}
                                    ListEmptyComponent={mediaLoaded ? <Text style={s.emptyText}>{t.musicNoMedia || 'Henüz medya paylaşılmamış.'}</Text> : null}
                                    renderItem={({ item }) => (
                                        <View style={s.mediaThumbWrap}>
                                            {item.videoUrl ? (
                                                <View style={[s.mediaThumb, s.rowArtFallback]}><Text style={{ fontSize: 20 }}>🎬</Text></View>
                                            ) : (
                                                <Image source={{ uri: item.imageUrl }} style={s.mediaThumb} />
                                            )}
                                        </View>
                                    )}
                                />
                            )}
                        </>
                    )}

                    {/* Etkinlik Oluştur */}
                    <Modal visible={showCreateEvent} animationType="slide" transparent onRequestClose={() => setShowCreateEvent(false)}>
                        <View style={s.modalOverlay}>
                            <View style={s.modalBox}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <Text style={s.modalTitle}>{t.musicCreateListingBtn || '📅 Etkinlik Oluştur'}</Text>

                                    <Text style={s.fieldLabel}>{t.musicEventMsgLabel || 'Etkinlik Açıklaması *'}</Text>
                                    <TextInput
                                        value={eventForm.message}
                                        onChangeText={v => setEventForm(f => ({ ...f, message: v }))}
                                        placeholder={t.musicEventMsgPh || 'Ör: Akustik gece düzenliyoruz, çalmak/dinlemek isteyenleri bekleriz.'}
                                        placeholderTextColor={colors.textMuted}
                                        style={[s.modalInput, { height: 80, textAlignVertical: 'top' }]}
                                        multiline
                                    />

                                    <Text style={s.fieldLabel}>{t.musicVenueLabel || 'Mekan Adı'}</Text>
                                    <TextInput
                                        value={eventForm.venueName}
                                        onChangeText={v => setEventForm(f => ({ ...f, venueName: v }))}
                                        placeholder={t.musicVenuePh || 'Ör: Kadıköy Sahne'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.musicCityLabel || 'Şehir'}</Text>
                                    <TextInput
                                        value={eventForm.city}
                                        onChangeText={v => setEventForm(f => ({ ...f, city: v }))}
                                        placeholder={t.musicCityPh2 || 'Ör: İstanbul'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fieldLabel}>{t.musicDateLabel || 'Tarih'}</Text>
                                            <TouchableOpacity style={s.modalInput} onPress={() => setShowEventDatePicker(true)}>
                                                <Text style={{ color: eventForm.date ? '#fff' : colors.textMuted }}>
                                                    {eventForm.date ? fmtDate(eventForm.date) : (t.musicEventFlexibleDate || 'Esnek tarih')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fieldLabel}>{t.musicTimeLabel || 'Saat'}</Text>
                                            <TextInput
                                                value={eventForm.time}
                                                onChangeText={v => setEventForm(f => ({ ...f, time: v }))}
                                                placeholder="20:00"
                                                placeholderTextColor={colors.textMuted}
                                                style={s.modalInput}
                                            />
                                        </View>
                                    </View>
                                    {showEventDatePicker && (
                                        <DateTimePicker
                                            value={eventForm.date || new Date()}
                                            mode="date"
                                            onChange={(evt, date) => {
                                                setShowEventDatePicker(Platform.OS === 'ios');
                                                if (date) setEventForm(f => ({ ...f, date }));
                                            }}
                                        />
                                    )}

                                    <Text style={s.fieldLabel}>{t.musicFeeLabel || 'Kişi Başı Ücret (opsiyonel)'}</Text>
                                    <TextInput
                                        value={eventForm.fee}
                                        onChangeText={v => setEventForm(f => ({ ...f, fee: v.replace(/[^0-9]/g, '') }))}
                                        placeholder="0"
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType="numeric"
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.musicTicketUrlLabel || 'Bilet / Etkinlik Linki (opsiyonel)'}</Text>
                                    <TextInput
                                        value={eventForm.ticketUrl}
                                        onChangeText={v => setEventForm(f => ({ ...f, ticketUrl: v }))}
                                        placeholder="https://..."
                                        placeholderTextColor={colors.textMuted}
                                        autoCapitalize="none"
                                        style={s.modalInput}
                                    />

                                    <TouchableOpacity style={s.submitBtn} onPress={submitMusicEvent} disabled={creatingEvent}>
                                        <Text style={s.submitBtnText}>{creatingEvent ? '…' : (t.musicCreateListingBtn || 'Etkinlik Oluştur')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowCreateEvent(false)} style={{ alignItems: 'center', marginTop: 10 }}>
                                        <Text style={{ color: colors.textMuted }}>{t.cancelBtn || 'Vazgeç'}</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>

                    {/* Kurs Oluştur */}
                    <Modal visible={showCreateCourse} animationType="slide" transparent onRequestClose={() => setShowCreateCourse(false)}>
                        <View style={s.modalOverlay}>
                            <View style={s.modalBox}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <Text style={s.modalTitle}>{t.musicCreateCourseBtn || '🎓 Kurs Oluştur'}</Text>

                                    <Text style={s.fieldLabel}>{t.musicCredentialLabel || 'Uzmanlık / Seviye *'}</Text>
                                    <TextInput
                                        value={courseForm.credentialLevel}
                                        onChangeText={v => setCourseForm(f => ({ ...f, credentialLevel: v }))}
                                        placeholder={t.musicCredentialPh || 'Ör: Konservatuvar mezunu piyano eğitmeni'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.musicVenueLabel || 'Ders Yeri *'}</Text>
                                    <TextInput
                                        value={courseForm.location}
                                        onChangeText={v => setCourseForm(f => ({ ...f, location: v }))}
                                        placeholder={t.musicVenuePh || 'Ör: Kadıköy Müzik Stüdyosu'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.musicCityLabel || 'Şehir'}</Text>
                                    <TextInput
                                        value={courseForm.city}
                                        onChangeText={v => setCourseForm(f => ({ ...f, city: v }))}
                                        placeholder={t.musicCityPh2 || 'Ör: İstanbul'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.musicDescLabel || 'Açıklama'}</Text>
                                    <TextInput
                                        value={courseForm.description}
                                        onChangeText={v => setCourseForm(f => ({ ...f, description: v }))}
                                        placeholder={t.musicDescPh || 'Ders içeriği, seviye, program hakkında bilgi'}
                                        placeholderTextColor={colors.textMuted}
                                        style={[s.modalInput, { height: 70, textAlignVertical: 'top' }]}
                                        multiline
                                    />

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity
                                            style={[s.chip, courseForm.individual && s.chipActive]}
                                            onPress={() => setCourseForm(f => ({ ...f, individual: !f.individual }))}
                                        >
                                            <Text style={[s.chipText, courseForm.individual && s.chipTextActive]}>{t.musicIndividual || 'Bireysel Ders'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.chip, courseForm.group && s.chipActive]}
                                            onPress={() => setCourseForm(f => ({ ...f, group: !f.group }))}
                                        >
                                            <Text style={[s.chipText, courseForm.group && s.chipTextActive]}>{t.musicGroup || 'Grup Dersi'}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {courseForm.individual && (
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.fieldLabel}>{t.musicPriceIndividualLabel || 'Bireysel Ücret'}</Text>
                                                <TextInput
                                                    value={courseForm.priceIndividual}
                                                    onChangeText={v => setCourseForm(f => ({ ...f, priceIndividual: v.replace(/[^0-9]/g, '') }))}
                                                    placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={s.modalInput}
                                                />
                                            </View>
                                        )}
                                        {courseForm.group && (
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.fieldLabel}>{t.musicPriceGroupLabel || 'Grup Ücreti'}</Text>
                                                <TextInput
                                                    value={courseForm.priceGroup}
                                                    onChangeText={v => setCourseForm(f => ({ ...f, priceGroup: v.replace(/[^0-9]/g, '') }))}
                                                    placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={s.modalInput}
                                                />
                                            </View>
                                        )}
                                    </View>

                                    <TouchableOpacity style={s.submitBtn} onPress={submitMusicCourse} disabled={creatingCourse}>
                                        <Text style={s.submitBtnText}>{creatingCourse ? '…' : (t.musicCreateCourseBtn || 'Kurs Oluştur')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowCreateCourse(false)} style={{ alignItems: 'center', marginTop: 10 }}>
                                        <Text style={{ color: colors.textMuted }}>{t.cancelBtn || 'Vazgeç'}</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>
                </>
            ) : (
            <>
            <View style={s.searchRow}>
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={doSearch}
                    placeholder={t.musicSearchPh || 'Şarkı, sanatçı ara...'}
                    placeholderTextColor={colors.textMuted}
                    style={s.searchInput}
                    returnKeyType="search"
                />
                <TouchableOpacity onPress={doSearch} style={s.searchBtn}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{t.musicSearchBtn || 'Ara'}</Text>
                </TouchableOpacity>
            </View>

            <View style={s.tabRow}>
                {[
                    { id: 'search', label: t.musicTabSearch || 'Sonuçlar' },
                    { id: 'playlists', label: t.musicTabPlaylists || 'Çalma Listelerim' },
                    { id: 'liked', label: t.musicTabLiked || 'Beğendiklerim' },
                ].map(tb => (
                    <TouchableOpacity key={tb.id} onPress={() => setTab(tb.id)}
                        style={[s.tabBtn, tab === tb.id && s.tabBtnActive]}>
                        <Text style={[s.tabBtnText, tab === tb.id && s.tabBtnTextActive]}>{tb.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {tab === 'playlists' ? (
                loadingLists ? <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} /> : (
                    <FlatList
                        data={playlists}
                        keyExtractor={p => p.id}
                        contentContainerStyle={s.list}
                        ListEmptyComponent={<Text style={s.emptyText}>{t.musicNoPlaylists || 'Henüz çalma listeniz yok.'}</Text>}
                        renderItem={({ item }) => (
                            <TouchableOpacity style={s.playlistRow} onPress={() => navigation.navigate('MusicPlaylistDetail', { playlist: item })}>
                                <View style={[s.rowArt, s.rowArtFallback]}><Text style={{ fontSize: 16 }}>📁</Text></View>
                                <View style={{ flex: 1, marginLeft: 10 }}>
                                    <Text style={s.rowTitle}>{item.name}</Text>
                                    <Text style={s.rowArtist}>{(item.tracks || []).length} şarkı</Text>
                                </View>
                            </TouchableOpacity>
                        )}
                    />
                )
            ) : searching ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
            ) : (
                <FlatList
                    data={currentList}
                    keyExtractor={item => item.trackId}
                    contentContainerStyle={s.list}
                    ListEmptyComponent={
                        <Text style={s.emptyText}>
                            {tab === 'search' ? (t.musicNoResults || 'Arama yapın.') : (t.musicNoLiked || 'Henüz beğendiğiniz şarkı yok.')}
                        </Text>
                    }
                    renderItem={({ item }) => (
                        <TrackRow
                            track={item}
                            liked={likedIds.has(item.trackId)}
                            onPlay={(tr) => handlePlay(tr, currentList)}
                            onLike={handleLike}
                            onAddToPlaylist={(tr) => setPickerTrack(tr)}
                        />
                    )}
                />
            )}

            <Modal visible={!!pickerTrack} transparent animationType="slide" onRequestClose={() => setPickerTrack(null)}>
                <View style={s.modalOverlay}>
                    <View style={s.modalBox}>
                        <Text style={s.modalTitle}>{t.musicAddToPlaylist || 'Çalma Listesine Ekle'}</Text>
                        <FlatList
                            data={playlists}
                            keyExtractor={p => p.id}
                            style={{ maxHeight: 240 }}
                            renderItem={({ item }) => (
                                <TouchableOpacity style={s.modalPlaylistRow} onPress={() => handleAddToPlaylist(item.id)}>
                                    <Text style={s.rowTitle}>{item.name}</Text>
                                </TouchableOpacity>
                            )}
                        />
                        <View style={s.newPlaylistRow}>
                            <TextInput
                                value={newPlaylistName}
                                onChangeText={setNewPlaylistName}
                                placeholder={t.musicNewPlaylistPh || 'Yeni liste adı'}
                                placeholderTextColor={colors.textMuted}
                                style={s.newPlaylistInput}
                            />
                            <TouchableOpacity onPress={handleCreatePlaylist} style={s.searchBtn}>
                                <Text style={{ color: '#fff', fontWeight: '700' }}>{t.musicCreateBtn || 'Oluştur'}</Text>
                            </TouchableOpacity>
                        </View>
                        <TouchableOpacity onPress={() => setPickerTrack(null)} style={{ marginTop: 10, alignItems: 'center' }}>
                            <Text style={{ color: colors.textMuted }}>{t.cancelBtn || 'Vazgeç'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>
            </>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title: { color: '#fff', fontSize: 17, fontWeight: '900' },

    mainTabRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginTop: 12, marginBottom: 4 },
    mainTabBtn: { flex: 1, borderRadius: 20, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    mainTabBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
    mainTabBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
    mainTabBtnTextActive: { color: '#fff' },

    filtersBlock: { paddingBottom: 4 },
    dateBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9, justifyContent: 'center' },
    dateBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

    concertCard: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
    concertImg: { width: 64, height: 64, borderRadius: 8 },
    concertArtist: { color: '#fff', fontSize: 14, fontWeight: '800' },
    concertMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    concertPrice: { color: colors.purple, fontSize: 12, fontWeight: '700', marginTop: 2 },
    ticketBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', marginTop: 6 },
    ticketBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },

    searchRow: { flexDirection: 'row', gap: 8, padding: 12 },
    searchInput: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 14 },
    searchBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },

    tabRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginBottom: 8 },
    tabBtn: { flex: 1, borderRadius: 20, paddingVertical: 7, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    tabBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
    tabBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    tabBtnTextActive: { color: '#fff' },

    list: { paddingHorizontal: 12, paddingBottom: 30 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30 },

    row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderColor: colors.border },
    rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center' },
    rowArt: { width: 42, height: 42, borderRadius: 6 },
    rowArtFallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    rowTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
    rowArtist: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
    rowIconBtn: { paddingHorizontal: 8, paddingVertical: 6 },

    playlistRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },

    modalOverlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 30, maxHeight: '88%' },
    modalTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 10 },
    modalPlaylistRow: { paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
    newPlaylistRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    newPlaylistInput: { flex: 1, backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 13 },

    subTabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, gap: 6 },
    subTabBtn: { flex: 1, borderRadius: 16, paddingVertical: 6, alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    subTabBtnActive: { backgroundColor: colors.purple + '30', borderColor: colors.purple },
    subTabBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    subTabBtnTextActive: { color: colors.purpleLight },

    smallCreateRow: { paddingHorizontal: 12, paddingTop: 10, alignItems: 'flex-end' },
    smallCreateBtn: { backgroundColor: colors.purple, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
    smallCreateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

    eventCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10 },
    eventOwner: { color: '#fff', fontSize: 12, fontWeight: '800', flex: 1 },
    eventCount: { color: colors.textMuted, fontSize: 11 },
    eventMessage: { color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 18 },
    eventMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
    eventMeta: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
    ticketBtnSm: { backgroundColor: colors.purple + '20', borderWidth: 1, borderColor: colors.purple + '60', borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 8 },
    ticketBtnSmText: { color: colors.purpleLight, fontSize: 12, fontWeight: '700' },
    joinBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8 },
    joinBtnDisabled: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

    mediaGrid: { padding: 4 },
    mediaThumbWrap: { flex: 1 / 3, aspectRatio: 1, padding: 2 },
    mediaThumb: { width: '100%', height: '100%', borderRadius: 6, backgroundColor: colors.surface2 },

    fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4, marginTop: 8 },
    modalInput: { backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 13, justifyContent: 'center' },
    chip: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
    chipActive: { backgroundColor: colors.purple + '30', borderColor: colors.purple },
    chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: colors.purpleLight },
    submitBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
    submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
