import { useState } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView,
    StyleSheet, StatusBar, Platform, Linking,
} from 'react-native';
import colors from '../../theme/colors';

const DAYS_TR = ['', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];
const SLOT_LABEL = { FULL_HOUR: 'Tam Saatler', HALF_HOUR: 'Buçuklu Saatler', NINETY_MIN: '90 Dakika', FLEXIBLE: 'Serbest' };

export default function VenueDetailScreen({ route, navigation }) {
    const { venue } = route.params;
    const [selectedCourt, setSelected] = useState(null);

    const openMaps = () => {
        if (!venue.address) return;
        const q = encodeURIComponent(`${venue.name}, ${venue.address}`);
        Linking.openURL(`https://maps.google.com/?q=${q}`);
    };

    const openPhone = () => {
        if (!venue.phone) return;
        Linking.openURL(`tel:${venue.phone}`);
    };

    const getDayWindows = (dayNum) => {
        const openDays = venue.openDays || [1,2,3,4,5,6,7];
        if (!openDays.includes(dayNum)) return null;
        const os = venue.openSlots;
        if (os && !Array.isArray(os) && typeof os === 'object') {
            const key = String(dayNum);
            const entry = os[key] !== undefined ? os[key] : os['0'];
            if (entry !== undefined) {
                if (Array.isArray(entry) && entry.length === 0) return null;
                if (Array.isArray(entry) && entry.length > 0) return entry;
            }
        }
        return [{ from: venue.openTime || '08:00', to: venue.closeTime || '22:00' }];
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title} numberOfLines={1}>{venue.name}</Text>
            </View>

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {/* Tesis Bilgileri */}
                <View style={s.infoCard}>
                    <Text style={s.infoCardTitle}>📋 Tesis Bilgileri</Text>
                    <View style={s.infoRow}>
                        <Text style={s.infoLabel}>Spor Dalı</Text>
                        <Text style={s.infoValue}>{venue.branch}</Text>
                    </View>
                    <View style={s.infoRow}>
                        <Text style={s.infoLabel}>Konum</Text>
                        <TouchableOpacity onPress={openMaps} disabled={!venue.address}>
                            <Text style={[s.infoValue, venue.address && s.link]}>
                                {venue.city}{venue.district ? ` / ${venue.district}` : ''}{venue.address ? `\n${venue.address}` : ''}
                            </Text>
                        </TouchableOpacity>
                    </View>
                    <View style={[s.infoRow, { alignItems: 'flex-start' }]}>
                        <Text style={s.infoLabel}>Çalışma{'\n'}Saatleri</Text>
                        <View style={{ flex: 1 }}>
                            {[1,2,3,4,5,6,7].map(dayNum => {
                                const windows = getDayWindows(dayNum);
                                return (
                                    <View key={dayNum} style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                                        <Text style={[s.infoLabel, { minWidth: 36, marginBottom: 0 }]}>{DAYS_TR[dayNum]}</Text>
                                        {windows === null
                                            ? <Text style={{ color: '#ef4444', fontSize: 13, fontWeight: '600' }}>Kapalı</Text>
                                            : <Text style={[s.infoValue, { textAlign: 'right', flex: 1 }]}>
                                                {windows.map(w => `${w.from}–${w.to}`).join('  ')}
                                              </Text>
                                        }
                                    </View>
                                );
                            })}
                        </View>
                    </View>
                    <View style={s.infoRow}>
                        <Text style={s.infoLabel}>Rezervasyon</Text>
                        <Text style={s.infoValue}>{SLOT_LABEL[venue.slotType] || venue.slotType}</Text>
                    </View>
                    {venue.pricePerSlot > 0 && (
                        <View style={s.infoRow}>
                            <Text style={s.infoLabel}>Ücret</Text>
                            <Text style={[s.infoValue, { color: colors.yellow }]}>{venue.pricePerSlot}₺ / slot</Text>
                        </View>
                    )}
                    {venue.phone && (
                        <View style={s.infoRow}>
                            <Text style={s.infoLabel}>Telefon</Text>
                            <TouchableOpacity onPress={openPhone}>
                                <Text style={[s.infoValue, s.link]}>{venue.phone}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>

                {/* Kortlar */}
                <Text style={s.sectionTitle}>🎾 Kortlar / Sahalar</Text>
                <Text style={s.sectionHint}>Rezervasyon yapmak istediğiniz kortu seçin</Text>

                {[...(venue.courts || [])].sort((a, b) => {
                    const nA = parseInt(a.name?.match(/\d+/)?.[0] ?? '', 10);
                    const nB = parseInt(b.name?.match(/\d+/)?.[0] ?? '', 10);
                    if (!isNaN(nA) && !isNaN(nB) && nA !== nB) return nA - nB;
                    return (a.name ?? '') < (b.name ?? '') ? -1 : (a.name ?? '') > (b.name ?? '') ? 1 : 0;
                }).map(court => (
                    <TouchableOpacity
                        key={court.id}
                        style={[s.courtCard, selectedCourt?.id === court.id && s.courtCardActive]}
                        onPress={() => setSelected(court)}
                        activeOpacity={0.8}
                    >
                        <View style={s.courtRow}>
                            <Text style={s.courtIcon}>🏓</Text>
                            <Text style={s.courtName}>{court.name}</Text>
                            {selectedCourt?.id === court.id && <Text style={s.courtCheck}>✓</Text>}
                        </View>
                    </TouchableOpacity>
                ))}

                {selectedCourt && (
                    <TouchableOpacity
                        style={s.reserveBtn}
                        onPress={() => navigation.navigate('CourtSlots', { venue, court: selectedCourt })}
                        activeOpacity={0.8}
                    >
                        <Text style={s.reserveBtnText}>Saat Seç — {selectedCourt.name} →</Text>
                    </TouchableOpacity>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title: { flex: 1, color: '#fff', fontSize: 17, fontWeight: '900' },

    scroll: { padding: 14 },

    infoCard: { backgroundColor: colors.surface, borderRadius: 14, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: colors.border },
    infoCardTitle: { color: '#fff', fontSize: 14, fontWeight: '900', marginBottom: 12 },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, borderBottomWidth: 1, borderColor: colors.border },
    infoLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700', flex: 1 },
    infoValue: { color: '#fff', fontSize: 13, flex: 2, textAlign: 'right' },
    link: { color: colors.purple, textDecorationLine: 'underline' },

    sectionTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 4 },
    sectionHint: { color: colors.textMuted, fontSize: 12, marginBottom: 12 },

    courtCard: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface, borderRadius: 12, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    courtCardActive: { borderColor: colors.purple, backgroundColor: colors.purple + '12' },
    courtRow: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    courtIcon: { fontSize: 22 },
    courtName: { flex: 1, color: '#fff', fontSize: 15, fontWeight: '700' },
    courtCheck: { color: colors.purple, fontSize: 18, fontWeight: '900' },

    reserveBtn: { backgroundColor: colors.purple, borderRadius: 12, paddingVertical: 14, alignItems: 'center', marginTop: 10 },
    reserveBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
