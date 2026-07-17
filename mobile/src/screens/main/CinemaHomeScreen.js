import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, Image, Modal,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Linking,
} from 'react-native';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import CityAutocomplete from '../../components/CityAutocomplete';
import CalendarPickerModal from '../../components/CalendarPickerModal';
import TimePickerModal from '../../components/TimePickerModal';

function fmtDate(d) {
    if (!d) return null;
    return d.toISOString().slice(0, 10);
}

function MovieCard({ movie, t }) {
    return (
        <View style={s.card}>
            {movie.posterUrl ? (
                <Image source={{ uri: movie.posterUrl }} style={s.poster} />
            ) : (
                <View style={[s.poster, s.posterFallback]}><Text style={{ fontSize: 30 }}>🎬</Text></View>
            )}
            <Text style={s.cardTitle} numberOfLines={2}>{movie.title}</Text>
            <View style={s.cardMetaRow}>
                {movie.rating != null && <Text style={s.cardMeta}>⭐ {movie.rating.toFixed(1)}</Text>}
                {movie.releaseDate && <Text style={s.cardMeta}>{movie.releaseDate}</Text>}
            </View>
            <TouchableOpacity style={s.ticketBtn} onPress={() => movie.ticketUrl && Linking.openURL(movie.ticketUrl)}>
                <Text style={s.ticketBtnText}>{t.cinemaTicketBtn || '🎟️ Bilet Al'}</Text>
            </TouchableOpacity>
        </View>
    );
}

function ClassicFilmCard({ film, onPress }) {
    return (
        <TouchableOpacity style={s.card} onPress={() => onPress(film)} activeOpacity={0.8}>
            <Image source={{ uri: film.thumbnailUrl }} style={s.poster} />
            <Text style={s.cardTitle} numberOfLines={2}>{film.title}</Text>
            {film.year && <Text style={s.cardMeta}>{film.year}</Text>}
            <View style={s.playBtn}>
                <Text style={s.playBtnText}>▶️ İzle</Text>
            </View>
        </TouchableOpacity>
    );
}

export default function CinemaHomeScreen({ navigation }) {
    const t = useT();
    const [mainTab, setMainTab] = useState('nowPlaying'); // 'nowPlaying' | 'classics'

    // Vizyondaki filmler (TMDB — bilet linki biletinial.com'a gider)
    // Not: TMDB'nin şehre/salona göre gösterim verisi yok, "now_playing" tüm Türkiye
    // için tek bir ulusal liste döner. Şehir seçimi filmleri filtrelemez — sadece
    // "Bilet Al" linkinin hangi şehrin biletinial.com sayfasına gideceğini belirler.
    const [city, setCity] = useState('');
    const [dateFrom, setDateFrom] = useState(null);
    const [dateTo, setDateTo] = useState(null);
    const [showDateModal, setShowDateModal] = useState(false);
    const [pickingFrom, setPickingFrom] = useState(false);
    const [pickingTo, setPickingTo] = useState(false);
    const [timeFrom, setTimeFrom] = useState(null);
    const [timeTo, setTimeTo] = useState(null);
    const [showTimeModal, setShowTimeModal] = useState(false);
    const [pickingTimeFrom, setPickingTimeFrom] = useState(false);
    const [pickingTimeTo, setPickingTimeTo] = useState(false);
    const [showGenreModal, setShowGenreModal] = useState(false);
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
            if (df) params.dateFrom = fmtDate(df);
            if (dt) params.dateTo = fmtDate(dt);
            const { data } = await api.get('/movies/now-playing', { params: Object.keys(params).length ? params : undefined });
            setMovies(data.movies || []);
            setCinemaListUrl(data.cinemaListUrl || null);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.cinemaLoadError || 'Filmler yüklenemedi.');
        } finally {
            setLoading(false);
            setLoaded(true);
        }
    }, [t]);

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    useEffect(() => {
        api.get('/movies/genres')
            .then(r => setGenres(r.data.genres || []))
            .catch(() => {});
    }, []);

    const toggleGenre = (genreId) => {
        setSelectedGenres(prev => {
            const next = genreId === null ? [] : (prev.includes(genreId) ? prev.filter(g => g !== genreId) : [...prev, genreId]);
            load(city || undefined, next, dateFrom, dateTo);
            return next;
        });
    };

    // Klasik filmler (archive.org — telif süresi dolmuş, tamamen ücretsiz/yasal)
    const [classicQuery, setClassicQuery] = useState('');
    const [classics, setClassics] = useState([]);
    const [classicsLoading, setClassicsLoading] = useState(false);
    const [classicsLoaded, setClassicsLoaded] = useState(false);

    const loadClassics = useCallback(async (q) => {
        setClassicsLoading(true);
        try {
            const { data } = await api.get('/movies/classics', { params: q ? { q } : undefined });
            setClassics(data.films || []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.cinemaClassicsLoadError || 'Klasik filmler yüklenemedi.');
        } finally {
            setClassicsLoading(false);
            setClassicsLoaded(true);
        }
    }, [t]);

    useEffect(() => { if (mainTab === 'classics' && !classicsLoaded) loadClassics(); }, [mainTab, classicsLoaded, loadClassics]);

    const openClassicFilm = (film) => {
        navigation.navigate('ClassicFilmPlayer', { filmId: film.id, filmTitle: film.title });
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.cinemaTitle || '🎬 Sinema'}</Text>
            </View>

            <View style={s.mainTabRow}>
                {[
                    { id: 'nowPlaying', label: t.cinemaTabNowPlaying || 'Vizyondakiler' },
                    { id: 'classics', label: t.cinemaTabClassics || 'Film İzle (Klasikler)' },
                ].map(tb => (
                    <TouchableOpacity key={tb.id} onPress={() => setMainTab(tb.id)}
                        style={[s.mainTabBtn, mainTab === tb.id && s.mainTabBtnActive]}>
                        <Text style={[s.mainTabBtnText, mainTab === tb.id && s.mainTabBtnTextActive]}>{tb.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {mainTab === 'nowPlaying' ? (
                <>
                    <Text style={s.disclaimer}>
                        {t.cinemaDisclaimer || 'Vizyondaki filmler burada görüntülenir. Seans ve bilet satın alma işlemi biletinial.com üzerinden yapılır.'}
                    </Text>

                    <View style={s.filterRow}>
                        <CityAutocomplete
                            value={city}
                            onChangeText={setCity}
                            onSelect={(c) => { const name = c.province; setCity(name); load(name, selectedGenres, dateFrom, dateTo); }}
                            placeholder={t.cinemaCityPh || 'Şehir'}
                            style={{ flex: 1 }}
                        />
                        <TouchableOpacity style={s.compactBtn} onPress={() => setShowDateModal(true)}>
                            <Text style={s.compactBtnText} numberOfLines={1}>
                                {dateFrom || dateTo
                                    ? `📅 ${dateFrom ? fmtDate(dateFrom) : '…'} – ${dateTo ? fmtDate(dateTo) : '…'}`
                                    : (t.cinemaDateBtnPh || '📅 Tarih')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.compactBtn} onPress={() => setShowTimeModal(true)}>
                            <Text style={s.compactBtnText} numberOfLines={1}>
                                {timeFrom || timeTo
                                    ? `🕐 ${timeFrom || '…'}–${timeTo || '…'}`
                                    : (t.cinemaTimeBtnPh || '🕐 Saat')}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.compactBtn} onPress={() => setShowGenreModal(true)}>
                            <Text style={s.compactBtnText} numberOfLines={1}>
                                {selectedGenres.length > 0
                                    ? `🎭 ${selectedGenres.length}`
                                    : (t.cinemaGenreBtnPh || '🎭 Tür')}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <Text style={s.citySubText}>{t.cinemaCitySubtext || 'Şehir, film listesini değil sadece "Bilet Al" linkinin gideceği sinema sayfasını belirler.'}</Text>

                    <Modal visible={showDateModal} transparent animationType="fade" onRequestClose={() => setShowDateModal(false)}>
                        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowDateModal(false)}>
                            <View style={s.modalBox} onStartShouldSetResponder={() => true}>
                                <Text style={s.modalTitle}>{t.cinemaDateRangeTitle || 'Tarih Aralığı'}</Text>
                                <TouchableOpacity style={s.modalRow} onPress={() => setPickingFrom(true)}>
                                    <Text style={s.modalRowLabel}>{t.cinemaDateFromPh || 'Başlangıç tarihi'}</Text>
                                    <Text style={s.modalRowValue}>{dateFrom ? fmtDate(dateFrom) : '—'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.modalRow} onPress={() => setPickingTo(true)}>
                                    <Text style={s.modalRowLabel}>{t.cinemaDateToPh || 'Bitiş tarihi'}</Text>
                                    <Text style={s.modalRowValue}>{dateTo ? fmtDate(dateTo) : '—'}</Text>
                                </TouchableOpacity>
                                {(dateFrom || dateTo) && (
                                    <TouchableOpacity onPress={() => { setDateFrom(null); setDateTo(null); load(city || undefined, selectedGenres, null, null); }}>
                                        <Text style={s.modalClearText}>{t.cinemaDateClear || 'Tarihi Temizle'}</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowDateModal(false)}>
                                    <Text style={s.modalCloseText}>{t.closeCalendar || 'Kapat'}</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </Modal>
                    <CalendarPickerModal
                        visible={pickingFrom}
                        value={dateFrom}
                        onSelect={(d) => { setDateFrom(d); setPickingFrom(false); load(city || undefined, selectedGenres, d, dateTo); }}
                        onClose={() => setPickingFrom(false)}
                    />
                    <CalendarPickerModal
                        visible={pickingTo}
                        value={dateTo}
                        onSelect={(d) => { setDateTo(d); setPickingTo(false); load(city || undefined, selectedGenres, dateFrom, d); }}
                        onClose={() => setPickingTo(false)}
                    />

                    <Modal visible={showTimeModal} transparent animationType="fade" onRequestClose={() => setShowTimeModal(false)}>
                        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowTimeModal(false)}>
                            <View style={s.modalBox} onStartShouldSetResponder={() => true}>
                                <Text style={s.modalTitle}>{t.cinemaTimeRangeTitle || 'Saat Aralığı'}</Text>
                                <TouchableOpacity style={s.modalRow} onPress={() => setPickingTimeFrom(true)}>
                                    <Text style={s.modalRowLabel}>{t.cinemaTimeFromPh || 'Başlangıç saati'}</Text>
                                    <Text style={s.modalRowValue}>{timeFrom || '—'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={s.modalRow} onPress={() => setPickingTimeTo(true)}>
                                    <Text style={s.modalRowLabel}>{t.cinemaTimeToPh || 'Bitiş saati'}</Text>
                                    <Text style={s.modalRowValue}>{timeTo || '—'}</Text>
                                </TouchableOpacity>
                                {(timeFrom || timeTo) && (
                                    <TouchableOpacity onPress={() => { setTimeFrom(null); setTimeTo(null); }}>
                                        <Text style={s.modalClearText}>{t.cinemaTimeClear || 'Saati Temizle'}</Text>
                                    </TouchableOpacity>
                                )}
                                <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowTimeModal(false)}>
                                    <Text style={s.modalCloseText}>{t.closeCalendar || 'Kapat'}</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </Modal>
                    <TimePickerModal
                        visible={pickingTimeFrom}
                        title={t.cinemaTimeFromPh || 'Başlangıç saati'}
                        value={timeFrom}
                        onSelect={setTimeFrom}
                        onClose={() => setPickingTimeFrom(false)}
                    />
                    <TimePickerModal
                        visible={pickingTimeTo}
                        title={t.cinemaTimeToPh || 'Bitiş saati'}
                        value={timeTo}
                        onSelect={setTimeTo}
                        onClose={() => setPickingTimeTo(false)}
                    />

                    <Modal visible={showGenreModal} transparent animationType="fade" onRequestClose={() => setShowGenreModal(false)}>
                        <TouchableOpacity style={s.modalOverlay} activeOpacity={1} onPress={() => setShowGenreModal(false)}>
                            <View style={s.modalBox} onStartShouldSetResponder={() => true}>
                                <Text style={s.modalTitle}>{t.cinemaGenreModalTitle || 'Tür Seç'}</Text>
                                <View style={s.genreRow}>
                                    <TouchableOpacity onPress={() => toggleGenre(null)}
                                        style={[s.genreChip, selectedGenres.length === 0 && s.genreChipActive]}>
                                        <Text style={[s.genreChipText, selectedGenres.length === 0 && s.genreChipTextActive]}>{t.cinemaGenreAll || 'Tümü'}</Text>
                                    </TouchableOpacity>
                                    {genres.map(g => (
                                        <TouchableOpacity key={g.id} onPress={() => toggleGenre(g.id)}
                                            style={[s.genreChip, selectedGenres.includes(g.id) && s.genreChipActive]}>
                                            <Text style={[s.genreChipText, selectedGenres.includes(g.id) && s.genreChipTextActive]}>{g.name}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <TouchableOpacity style={s.modalCloseBtn} onPress={() => setShowGenreModal(false)}>
                                    <Text style={s.modalCloseText}>{t.closeCalendar || 'Kapat'}</Text>
                                </TouchableOpacity>
                            </View>
                        </TouchableOpacity>
                    </Modal>

                    {cinemaListUrl && (
                        <TouchableOpacity style={s.cinemaListBtn} onPress={() => Linking.openURL(cinemaListUrl)}>
                            <Text style={s.cinemaListBtnText}>{t.cinemaSeeAllBtn || '🏙️ Şehrimdeki Sinemaları Gör'}</Text>
                        </TouchableOpacity>
                    )}

                    {loading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                    ) : (
                        <FlatList
                            data={movies}
                            keyExtractor={item => item.id}
                            numColumns={2}
                            contentContainerStyle={s.grid}
                            columnWrapperStyle={{ gap: 12 }}
                            ListEmptyComponent={loaded ? <Text style={s.emptyText}>{t.cinemaNoMovies || 'Vizyonda film bulunamadı.'}</Text> : null}
                            renderItem={({ item }) => <MovieCard movie={item} t={t} />}
                        />
                    )}
                </>
            ) : (
                <>
                    <Text style={s.disclaimer}>
                        {t.cinemaClassicsDisclaimer || 'Telif süresi dolmuş (kamu malı) klasik filmler — archive.org üzerinden ücretsiz ve tamamen yasal olarak izlenir. Güncel/popüler yapımlar bu listede yer almaz.'}
                    </Text>
                    <View style={s.cityRow}>
                        <TextInput
                            value={classicQuery}
                            onChangeText={setClassicQuery}
                            onSubmitEditing={() => loadClassics(classicQuery.trim() || undefined)}
                            placeholder={t.cinemaClassicsSearchPh || 'Film ara...'}
                            placeholderTextColor={colors.textMuted}
                            style={s.searchInput}
                            returnKeyType="search"
                        />
                        <TouchableOpacity onPress={() => loadClassics(classicQuery.trim() || undefined)} style={s.searchBtn}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>{t.musicSearchBtn || 'Ara'}</Text>
                        </TouchableOpacity>
                    </View>

                    {classicsLoading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                    ) : (
                        <FlatList
                            data={classics}
                            keyExtractor={item => item.id}
                            numColumns={2}
                            contentContainerStyle={s.grid}
                            columnWrapperStyle={{ gap: 12 }}
                            ListEmptyComponent={classicsLoaded ? <Text style={s.emptyText}>{t.cinemaNoMovies || 'Film bulunamadı.'}</Text> : null}
                            renderItem={({ item }) => <ClassicFilmCard film={item} onPress={openClassicFilm} />}
                        />
                    )}
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

    mainTabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, gap: 8 },
    mainTabBtn: { flex: 1, borderRadius: 20, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    mainTabBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
    mainTabBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    mainTabBtnTextActive: { color: '#fff' },

    disclaimer: { color: colors.textMuted, fontSize: 11, paddingHorizontal: 16, paddingTop: 10, lineHeight: 16 },
    cityRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 },
    citySubText: { color: colors.textMuted, fontSize: 10, paddingHorizontal: 12, paddingTop: 4, lineHeight: 14 },
    searchInput: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 14 },
    searchBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },

    filterRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 },
    compactBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 7, paddingVertical: 9, justifyContent: 'center' },
    compactBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '600' },

    modalOverlay: { flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center', padding: 17 },
    modalBox: { backgroundColor: colors.surface, borderRadius: 20, padding: 16, width: '100%' },
    modalTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 12 },
    modalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 12, marginBottom: 8 },
    modalRowLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    modalRowValue: { color: '#fff', fontSize: 13, fontWeight: '700' },
    modalClearText: { color: '#f87171', fontSize: 12, fontWeight: '700', textAlign: 'center', marginTop: 2, marginBottom: 4 },
    modalCloseBtn: { marginTop: 8, backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 10, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    modalCloseText: { color: colors.textSecondary, fontWeight: '700' },

    genreRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    genreChip: { borderRadius: 20, paddingHorizontal: 14, paddingVertical: 7, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    genreChipActive: { backgroundColor: colors.purple, borderColor: colors.purple },
    genreChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    genreChipTextActive: { color: '#fff' },

    cinemaListBtn: { marginHorizontal: 12, marginTop: 10, backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 10, alignItems: 'center' },
    cinemaListBtnText: { color: '#fff', fontWeight: '700', fontSize: 13 },

    grid: { padding: 12, gap: 12 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30 },

    card: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 8, marginBottom: 12 },
    poster: { width: '100%', aspectRatio: 2 / 3, borderRadius: 8, backgroundColor: colors.surface2 },
    posterFallback: { alignItems: 'center', justifyContent: 'center' },
    cardTitle: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 6, minHeight: 32 },
    cardMetaRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 },
    cardMeta: { color: colors.textMuted, fontSize: 10 },
    ticketBtn: { marginTop: 8, backgroundColor: colors.purple + '20', borderWidth: 1, borderColor: colors.purple + '60', borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
    ticketBtnText: { color: colors.purpleLight, fontSize: 11, fontWeight: '700' },
    playBtn: { marginTop: 8, backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
    playBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
