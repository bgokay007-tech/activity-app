import { useState, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, FlatList,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../../theme/colors';
import api from '../../services/api';

const STATUS_COLOR = { PENDING: '#eab308', CONFIRMED: '#22c55e', CANCELLED: '#6b7280' };
const STATUS_LABEL = { PENDING: 'Bekliyor', CONFIRMED: 'Onaylandı', CANCELLED: 'İptal' };

// Tesisteki Türkçe spor dalını SubCategoryScreen sub anahtarına çevir
function branchToSub(branch) {
    const b = (branch || '').toLowerCase();
    if (b.includes('padel'))                             return { sub: 'padel',      cat: 'SPORTS' };
    if (b.includes('tenis') || b.includes('tennis'))     return { sub: 'tennis',     cat: 'SPORTS' };
    if (b.includes('futbol') || b.includes('hali') || b.includes('halı')) return { sub: 'football',  cat: 'SPORTS' };
    if (b.includes('basketbol') || b.includes('basket')) return { sub: 'basketball', cat: 'SPORTS' };
    if (b.includes('voleybol') || b.includes('volley'))  return { sub: 'volleyball', cat: 'SPORTS' };
    if (b.includes('badminton'))                         return { sub: 'badminton',  cat: 'SPORTS' };
    return { sub: b || 'tennis', cat: 'SPORTS' };
}

function calcDuration(start, end) {
    const [sh, sm] = start.split(':').map(Number);
    const [eh, em] = end.split(':').map(Number);
    return String((eh * 60 + em) - (sh * 60 + sm));
}

function ReservationCard({ item, onCancel, navigation }) {
    const [cancelling, setCanc] = useState(false);
    const sc = STATUS_COLOR[item.status] || '#9ca3af';
    const sl = STATUS_LABEL[item.status] || item.status;

    const today  = new Date().toISOString().slice(0, 10);
    const isPast  = item.date < today;
    const canCancel = item.status !== 'CANCELLED' && !isPast;
    const canRival  = item.status !== 'CANCELLED' && !isPast; // aynı koşul

    const handleCancel = () => {
        Alert.alert('İptal Et', 'Bu rezervasyonu iptal etmek istiyor musunuz?', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'İptal Et', style: 'destructive', onPress: async () => {
                setCanc(true);
                try { await api.delete(`/venues/reservations/${item.id}`); onCancel(item.id); }
                catch (e) { Alert.alert('Hata', e?.response?.data?.message || 'İptal edilemedi'); }
                finally { setCanc(false); }
            }},
        ]);
    };

    const handleCreateRival = () => {
        const venueName = item.venue?.name || '';
        const courtName = item.court?.name || '';
        const { sub, cat } = branchToSub(item.venue?.branch);
        Alert.alert(
            '🆚 Rakip Bul\'da İlan Aç',
            `${venueName} · ${courtName}\n${item.date} · ${item.startTime}–${item.endTime}\n\nİlan oluşturma sayfasına yönlendirileceksiniz.`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'İlan Aç', onPress: () => {
                    navigation.navigate('SubCategory', {
                        category: cat,
                        sub,
                        initialTab: 'rivals',
                        openCreateRival: true,
                        prefillDate:          item.date,
                        prefillTime:          item.startTime,
                        prefillDuration:      calcDuration(item.startTime, item.endTime),
                        prefillCourtName:     [venueName, courtName].filter(Boolean).join(' ') || undefined,
                        prefillCity:          item.venue?.city || undefined,
                        prefillVenueId:       item.venueId || undefined,
                        prefillVenueCourtId:  item.courtId || undefined,
                    });
                }},
            ]
        );
    };

    return (
        <View style={s.card}>
            <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={s.venueName}>{item.venue?.name}</Text>
                    <Text style={s.courtName}>{item.court?.name}</Text>
                </View>
                <View style={[s.badge, { backgroundColor: sc + '20', borderColor: sc + '50' }]}>
                    <Text style={[s.badgeText, { color: sc }]}>{sl}</Text>
                </View>
            </View>

            <View style={s.timeRow}>
                <Text style={s.timeText}>📅 {item.date}</Text>
                <Text style={s.timeText}>⏰ {item.startTime} – {item.endTime}</Text>
            </View>

            {item.venue?.city && (
                <Text style={s.locationText}>📍 {item.venue.city}{item.venue.district ? ` / ${item.venue.district}` : ''}</Text>
            )}

            {item.paymentMethod && (
                <Text style={s.payText}>
                    {item.paymentMethod === 'CASH' ? '💵 Kort Başında Ödeme' : '💳 Online Ödeme'}
                </Text>
            )}

            <View style={s.actionRow}>
                {canCancel && (
                    <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} disabled={cancelling} activeOpacity={0.8}>
                        {cancelling
                            ? <ActivityIndicator size="small" color="#f87171" />
                            : <Text style={s.cancelBtnText}>İptal Et</Text>}
                    </TouchableOpacity>
                )}
                {canRival && (
                    <TouchableOpacity style={s.rivalBtn} onPress={handleCreateRival} activeOpacity={0.8}>
                        <Text style={s.rivalBtnText}>🆚 Rakip Bul'da İlan Aç</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

export default function MyReservationsScreen({ navigation }) {
    const [reservations, setRes] = useState([]);
    const [loading, setLoading]   = useState(false);
    const [filter, setFilter]     = useState('upcoming'); // upcoming | past | all

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/venues/reservations/mine');
            setRes(data);
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Yüklenemedi');
        } finally { setLoading(false); }
    }, []);

    useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

    const today = new Date().toISOString().slice(0, 10);
    const filtered = reservations.filter(r => {
        if (filter === 'upcoming') return r.date >= today && r.status !== 'CANCELLED';
        if (filter === 'past')     return r.date < today || r.status === 'CANCELLED';
        return true;
    });

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>📅 Rezervasyonlarım</Text>
            </View>

            {/* Filtre */}
            <View style={s.filterRow}>
                {[
                    { key: 'upcoming', label: 'Yaklaşan' },
                    { key: 'past',     label: 'Geçmiş' },
                    { key: 'all',      label: 'Tümü' },
                ].map(f => (
                    <TouchableOpacity
                        key={f.key}
                        style={[s.filterBtn, filter === f.key && s.filterBtnActive]}
                        onPress={() => setFilter(f.key)}
                        activeOpacity={0.7}
                    >
                        <Text style={[s.filterBtnText, filter === f.key && s.filterBtnTextActive]}>{f.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {loading ? (
                <View style={s.center}><ActivityIndicator size="large" color={colors.purple} /></View>
            ) : (
                <FlatList
                    data={filtered}
                    keyExtractor={r => r.id}
                    contentContainerStyle={s.list}
                    ListEmptyComponent={
                        <View style={s.empty}>
                            <Text style={s.emptyIcon}>📭</Text>
                            <Text style={s.emptyText}>
                                {filter === 'upcoming' ? 'Yaklaşan rezervasyon yok.' : 'Rezervasyon bulunamadı.'}
                            </Text>
                            {filter === 'upcoming' && (
                                <TouchableOpacity style={s.newResBtn} onPress={() => navigation.navigate('VenueSearch')} activeOpacity={0.8}>
                                    <Text style={s.newResBtnText}>Tesis Ara →</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    }
                    renderItem={({ item }) => (
                        <ReservationCard item={item} navigation={navigation} onCancel={id => setRes(prev => prev.map(r => r.id === id ? { ...r, status: 'CANCELLED' } : r))} />
                    )}
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

    filterRow: { flexDirection: 'row', padding: 12, gap: 8 },
    filterBtn: { flex: 1, borderRadius: 20, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    filterBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
    filterBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    filterBtnTextActive: { color: '#fff' },

    center: { flex: 1, justifyContent: 'center', alignItems: 'center' },

    list: { padding: 14, gap: 10 },

    card: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    cardHeader: { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 10 },
    venueName: { color: '#fff', fontSize: 15, fontWeight: '900' },
    courtName: { color: colors.textSecondary, fontSize: 13, marginTop: 2 },
    badge: { borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1 },
    badgeText: { fontSize: 11, fontWeight: '700' },

    timeRow: { flexDirection: 'row', gap: 14, marginBottom: 6 },
    timeText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
    locationText: { color: colors.textMuted, fontSize: 12, marginBottom: 4 },
    payText: { color: colors.textMuted, fontSize: 12, marginBottom: 8 },

    actionRow: { flexDirection: 'row', gap: 8, marginTop: 8 },
    cancelBtn: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#ef444440', backgroundColor: '#ef444408' },
    cancelBtnText: { color: '#f87171', fontWeight: '700', fontSize: 12 },
    rivalBtn: { flex: 2, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#9333ea50', backgroundColor: '#9333ea10' },
    rivalBtnText: { color: '#c084fc', fontWeight: '700', fontSize: 12 },

    empty: { alignItems: 'center', paddingTop: 60 },
    emptyIcon: { fontSize: 44, marginBottom: 12 },
    emptyText: { color: colors.textMuted, fontSize: 14, marginBottom: 16 },
    newResBtn: { backgroundColor: colors.purple, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
    newResBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
