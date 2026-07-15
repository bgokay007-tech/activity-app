import { useState, useEffect, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, Image,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Linking,
} from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import CityAutocomplete from '../../components/CityAutocomplete';

function fmtDate(d) {
    if (!d) return null;
    return d.toISOString().slice(0, 10);
}

function PlayCard({ item, t }) {
    const priceLabel = item.priceMin != null
        ? `${item.priceMin}${item.priceMax && item.priceMax !== item.priceMin ? '–' + item.priceMax : ''} ${item.currency || ''}`.trim()
        : null;
    return (
        <View style={s.card}>
            {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={s.cardImg} />
            ) : (
                <View style={[s.cardImg, s.cardImgFallback]}><Text style={{ fontSize: 22 }}>🎭</Text></View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.cardTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={s.cardMeta} numberOfLines={1}>
                    {[item.venueName, item.city].filter(Boolean).join(' · ')}
                </Text>
                <Text style={s.cardMeta}>
                    {item.date}{item.time ? ` · ${item.time.slice(0, 5)}` : ''}
                </Text>
                {priceLabel && <Text style={s.cardPrice}>{priceLabel}</Text>}
                {item.ticketUrl && (
                    <TouchableOpacity style={s.ticketBtn} onPress={() => Linking.openURL(item.ticketUrl)}>
                        <Text style={s.ticketBtnText}>{t.theaterTicketBtn || 'Bilet Al'}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

export default function TheaterHomeScreen({ navigation }) {
    const t = useT();
    const [city, setCity] = useState('');
    const [name, setName] = useState('');
    const [dateFrom, setDateFrom] = useState(null);
    const [dateTo, setDateTo] = useState(null);
    const [showFromPicker, setShowFromPicker] = useState(false);
    const [showToPicker, setShowToPicker] = useState(false);
    const [plays, setPlays] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);

    const doSearch = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (city.trim()) params.city = city.trim();
            if (name.trim()) params.name = name.trim();
            if (dateFrom) params.dateFrom = fmtDate(dateFrom);
            if (dateTo) params.dateTo = fmtDate(dateTo);
            const { data } = await api.get('/theater/search', { params });
            setPlays(data.plays || []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.theaterLoadError || 'Oyunlar yüklenemedi.');
        } finally {
            setLoading(false);
            setLoaded(true);
        }
    }, [city, name, dateFrom, dateTo, t]);

    useEffect(() => { doSearch(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.theaterTitle || '🎭 Tiyatro'}</Text>
            </View>

            <View style={s.filtersBlock}>
                <View style={s.filterRow}>
                    <CityAutocomplete
                        value={city}
                        onChangeText={setCity}
                        onSelect={(c) => setCity(c.province)}
                        placeholder={t.theaterCityPh || 'İl'}
                        style={{ flex: 1 }}
                    />
                    <TextInput
                        value={name}
                        onChangeText={setName}
                        onSubmitEditing={doSearch}
                        placeholder={t.theaterNamePh || 'Hangi oyun?'}
                        placeholderTextColor={colors.textMuted}
                        style={[s.searchInput, { flex: 1 }]}
                        returnKeyType="search"
                    />
                </View>
                <View style={s.filterRow}>
                    <TouchableOpacity style={s.dateBtn} onPress={() => setShowFromPicker(true)}>
                        <Text style={s.dateBtnText}>{dateFrom ? fmtDate(dateFrom) : (t.theaterDateFromPh || 'Başlangıç tarihi')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={s.dateBtn} onPress={() => setShowToPicker(true)}>
                        <Text style={s.dateBtnText}>{dateTo ? fmtDate(dateTo) : (t.theaterDateToPh || 'Bitiş tarihi')}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={doSearch} style={s.searchBtn}>
                        <Text style={{ color: '#fff', fontWeight: '700' }}>{t.theaterSearchBtn || 'Ara'}</Text>
                    </TouchableOpacity>
                </View>
                {showFromPicker && (
                    <DateTimePicker
                        value={dateFrom || new Date()}
                        mode="date"
                        onChange={(evt, date) => {
                            setShowFromPicker(Platform.OS === 'ios');
                            if (date) setDateFrom(date);
                        }}
                    />
                )}
                {showToPicker && (
                    <DateTimePicker
                        value={dateTo || new Date()}
                        mode="date"
                        onChange={(evt, date) => {
                            setShowToPicker(Platform.OS === 'ios');
                            if (date) setDateTo(date);
                        }}
                    />
                )}
            </View>

            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
            ) : (
                <FlatList
                    data={plays}
                    keyExtractor={item => item.id}
                    contentContainerStyle={s.list}
                    ListEmptyComponent={loaded ? <Text style={s.emptyText}>{t.theaterNoResults || 'Bu filtrelere uyan oyun bulunamadı.'}</Text> : null}
                    renderItem={({ item }) => <PlayCard item={item} t={t} />}
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

    filtersBlock: { paddingBottom: 4 },
    filterRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 0 },
    searchInput: { backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 14 },
    searchBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
    dateBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9, justifyContent: 'center' },
    dateBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

    list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 30 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30 },

    card: { flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
    cardImg: { width: 64, height: 64, borderRadius: 8 },
    cardImgFallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    cardTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
    cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    cardPrice: { color: colors.purple, fontSize: 12, fontWeight: '700', marginTop: 2 },
    ticketBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', marginTop: 6 },
    ticketBtnText: { color: '#fff', fontSize: 12, fontWeight: '700' },
});
