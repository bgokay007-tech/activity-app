import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, FlatList, Image,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Linking,
} from 'react-native';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import CityAutocomplete from '../../components/CityAutocomplete';

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

export default function CinemaHomeScreen({ navigation }) {
    const t = useT();
    const [city, setCity] = useState('');
    const [movies, setMovies] = useState([]);
    const [cinemaListUrl, setCinemaListUrl] = useState(null);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const load = useCallback(async (cityName) => {
        setLoading(true);
        try {
            const { data } = await api.get('/movies/now-playing', { params: cityName ? { city: cityName } : undefined });
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

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.cinemaTitle || '🎬 Sinema'}</Text>
            </View>

            <Text style={s.disclaimer}>
                {t.cinemaDisclaimer || 'Vizyondaki filmler burada görüntülenir. Seans ve bilet satın alma işlemi biletinial.com üzerinden yapılır.'}
            </Text>

            <View style={s.cityRow}>
                <CityAutocomplete
                    value={city}
                    onChangeText={setCity}
                    onSelect={(c) => { const name = c.province; setCity(name); load(name); }}
                    placeholder={t.cinemaCityPh || 'Şehir seçin (varsayılan: İstanbul)'}
                    style={{ flex: 1 }}
                />
            </View>

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
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title: { color: '#fff', fontSize: 17, fontWeight: '900' },

    disclaimer: { color: colors.textMuted, fontSize: 11, paddingHorizontal: 16, paddingTop: 10, lineHeight: 16 },
    cityRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10 },

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
});
