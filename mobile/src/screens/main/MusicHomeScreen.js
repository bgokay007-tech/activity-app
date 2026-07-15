import { useState, useCallback, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, Image,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Modal, Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
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
    const [mainTab, setMainTab] = useState('concerts'); // 'concerts' | 'listen'
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
    modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 30 },
    modalTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 10 },
    modalPlaylistRow: { paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
    newPlaylistRow: { flexDirection: 'row', gap: 8, marginTop: 12 },
    newPlaylistInput: { flex: 1, backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 13 },
});
