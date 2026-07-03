import { useState, useCallback } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    StyleSheet, StatusBar, Platform, ActivityIndicator,
} from 'react-native';
import colors from '../../theme/colors';
import api from '../../services/api';

const SLOT_LABEL = { FULL_HOUR: 'Tam Saatler', HALF_HOUR: 'Buçuklu Saatler', NINETY_MIN: '90 Dakika', FLEXIBLE: 'Serbest' };

function VenueCard({ venue, onPress }) {
    return (
        <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
            <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{venue.name}</Text>
                    <Text style={s.cardMeta}>{venue.branch} · {venue.city}{venue.district ? ` / ${venue.district}` : ''}</Text>
                </View>
                <Text style={s.arrow}>›</Text>
            </View>
            <View style={s.cardTags}>
                <View style={s.tag}><Text style={s.tagText}>🏟️ {venue.courts?.length || 0} kort</Text></View>
                <View style={s.tag}><Text style={s.tagText}>⏰ {venue.openTime}–{venue.closeTime}</Text></View>
                <View style={s.tag}><Text style={s.tagText}>📅 {SLOT_LABEL[venue.slotType] || venue.slotType}</Text></View>
                {venue.pricePerSlot > 0 && <View style={s.tag}><Text style={s.tagText}>💰 {venue.pricePerSlot}₺/slot</Text></View>}
            </View>
            {venue.address ? <Text style={s.cardAddr}>📍 {venue.address}</Text> : null}
        </TouchableOpacity>
    );
}

export default function VenueSearchScreen({ navigation }) {
    const [city,   setCity]   = useState('');
    const [branch, setBranch] = useState('');
    const [venues, setVenues] = useState([]);
    const [loading, setLoading] = useState(false);
    const [searched, setSearched] = useState(false);

    const search = useCallback(async () => {
        setLoading(true);
        setSearched(true);
        try {
            const params = {};
            if (city.trim())   params.city   = city.trim();
            if (branch.trim()) params.branch = branch.trim();
            const { data } = await api.get('/venues/search', { params });
            setVenues(data);
        } catch {
            setVenues([]);
        } finally { setLoading(false); }
    }, [city, branch]);

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>🏟️ Tesis Ara</Text>
            </View>

            <View style={s.filters}>
                <TextInput
                    style={s.input}
                    placeholder="Şehir (ör. İstanbul)"
                    placeholderTextColor={colors.textMuted}
                    value={city}
                    onChangeText={setCity}
                    returnKeyType="search"
                    onSubmitEditing={search}
                />
                <TextInput
                    style={s.input}
                    placeholder="Spor Dalı (ör. tenis, padel)"
                    placeholderTextColor={colors.textMuted}
                    value={branch}
                    onChangeText={setBranch}
                    returnKeyType="search"
                    onSubmitEditing={search}
                />
                <TouchableOpacity style={s.searchBtn} onPress={search} disabled={loading} activeOpacity={0.8}>
                    {loading ? <ActivityIndicator size="small" color="#000" /> : <Text style={s.searchBtnText}>Ara</Text>}
                </TouchableOpacity>
            </View>

            {searched && !loading && (
                <FlatList
                    data={venues}
                    keyExtractor={v => v.id}
                    contentContainerStyle={s.list}
                    ListEmptyComponent={
                        <View style={s.empty}>
                            <Text style={s.emptyIcon}>🔍</Text>
                            <Text style={s.emptyText}>Sonuç bulunamadı.</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <VenueCard
                            venue={item}
                            onPress={() => navigation.navigate('VenueDetail', { venue: item })}
                        />
                    )}
                />
            )}

            {!searched && !loading && (
                <View style={s.hint}>
                    <Text style={s.hintIcon}>🏓</Text>
                    <Text style={s.hintText}>Şehir veya spor dalı yazarak tesis arayın ve online rezervasyon yapın.</Text>
                </View>
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

    filters: { padding: 14, gap: 8 },
    input: { backgroundColor: colors.surface, borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: colors.border },
    searchBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    searchBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },

    list: { padding: 14, gap: 10 },

    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
    cardName: { color: '#fff', fontSize: 15, fontWeight: '900' },
    cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 6 },
    tag: { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
    tagText: { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    cardAddr: { color: colors.textMuted, fontSize: 12 },
    arrow: { color: colors.textMuted, fontSize: 22, fontWeight: '300' },

    empty: { alignItems: 'center', paddingTop: 60 },
    emptyIcon: { fontSize: 40, marginBottom: 10 },
    emptyText: { color: colors.textMuted, fontSize: 14 },

    hint: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    hintIcon: { fontSize: 48, marginBottom: 14 },
    hintText: { color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});
