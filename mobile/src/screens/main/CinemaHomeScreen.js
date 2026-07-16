import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, Image,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert,
} from 'react-native';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';

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

    // Klasik filmler (archive.org — telif süresi dolmuş, tamamen ücretsiz/yasal; tek kaynak)
    const [query, setQuery] = useState('');
    const [films, setFilms] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const loadFilms = useCallback(async (q) => {
        setLoading(true);
        try {
            const { data } = await api.get('/movies/classics', { params: q ? { q } : undefined });
            setFilms(data.films || []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.cinemaClassicsLoadError || 'Klasik filmler yüklenemedi.');
        } finally {
            setLoading(false);
            setLoaded(true);
        }
    }, [t]);

    useEffect(() => { loadFilms(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const openFilm = (film) => {
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

            <Text style={s.disclaimer}>
                {t.cinemaClassicsDisclaimer || 'Telif süresi dolmuş (kamu malı) klasik filmler — archive.org üzerinden ücretsiz ve tamamen yasal olarak izlenir. Güncel/popüler yapımlar bu listede yer almaz.'}
            </Text>
            <View style={s.cityRow}>
                <TextInput
                    value={query}
                    onChangeText={setQuery}
                    onSubmitEditing={() => loadFilms(query.trim() || undefined)}
                    placeholder={t.cinemaClassicsSearchPh || 'Film ara...'}
                    placeholderTextColor={colors.textMuted}
                    style={s.searchInput}
                    returnKeyType="search"
                />
                <TouchableOpacity onPress={() => loadFilms(query.trim() || undefined)} style={s.searchBtn}>
                    <Text style={{ color: '#fff', fontWeight: '700' }}>{t.musicSearchBtn || 'Ara'}</Text>
                </TouchableOpacity>
            </View>

            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
            ) : (
                <FlatList
                    data={films}
                    keyExtractor={item => item.id}
                    numColumns={2}
                    contentContainerStyle={s.grid}
                    columnWrapperStyle={{ gap: 12 }}
                    ListEmptyComponent={loaded ? <Text style={s.emptyText}>{t.cinemaNoMovies || 'Film bulunamadı.'}</Text> : null}
                    renderItem={({ item }) => <ClassicFilmCard film={item} onPress={openFilm} />}
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
    cityRow: { flexDirection: 'row', gap: 8, paddingHorizontal: 12, paddingTop: 10 },
    searchInput: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 14 },
    searchBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },

    grid: { padding: 12, gap: 12 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30 },

    card: { flex: 1, backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 8, marginBottom: 12 },
    poster: { width: '100%', aspectRatio: 2 / 3, borderRadius: 8, backgroundColor: colors.surface2 },
    cardTitle: { color: '#fff', fontSize: 12, fontWeight: '700', marginTop: 6, minHeight: 32 },
    cardMeta: { color: colors.textMuted, fontSize: 10 },
    playBtn: { marginTop: 8, backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 6, alignItems: 'center' },
    playBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
});
