import { useState, useCallback, useEffect } from 'react';
import {
    View, Text, TouchableOpacity, FlatList, TextInput,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../../theme/colors';
import api from '../../services/api';
import { onSocket } from '../../services/socket';
import useT from '../../hooks/useT';

const STATUS_COLOR = { PENDING: '#eab308', CONFIRMED: '#22c55e', CANCELLED: '#6b7280' };

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

function ReservationCard({ item, onCancel, onReschedule, onCancelRequested, navigation }) {
    const t = useT();
    const [cancelling,   setCanc]   = useState(false);
    const [rescheduling, setRSched] = useState(false);
    const [requesting,   setReq]    = useState(false);
    const [showReschedule, setShowRS] = useState(false);
    const [newDate,  setNewDate]  = useState('');
    const [newStart, setNewStart] = useState('');
    const [newEnd,   setNewEnd]   = useState('');

    const sc = STATUS_COLOR[item.status] || '#9ca3af';
    const sl = {
        PENDING:   t.resStatusPending,
        CONFIRMED: t.resStatusConfirmed,
        CANCELLED: t.resStatusCancelled,
    }[item.status] || item.status;

    const now = new Date();
    const today = now.toISOString().slice(0, 10);
    // Sadece tarihe değil, bitiş saatine de bakılmalı — bugünkü ama saati geçmiş bir
    // rezervasyon "saat değişikliği talep et" gibi butonları göstermeye devam ediyordu.
    const isPast = item.date < today ||
        (item.date === today && item.endTime && new Date(`${item.date}T${item.endTime}:00`) <= now);
    const hoursUntil = (new Date(`${item.date}T${item.startTime}:00`) - now) / 3600000;

    const cb = item.venue?.cancelHoursBefore ?? null;
    const rb = item.venue?.rescheduleHoursBefore ?? null;

    const canCancel = item.status !== 'CANCELLED' && !isPast &&
        (cb === null || (cb >= 0 && hoursUntil >= cb));
    const cancelBlocked = item.status !== 'CANCELLED' && !isPast && cb !== null &&
        (cb < 0 || hoursUntil < cb);

    const canReschedule = item.status !== 'CANCELLED' && !isPast &&
        (rb === null || (rb >= 0 && hoursUntil >= rb));

    const canRival = item.status !== 'CANCELLED' && !isPast;

    const handleCancel = () => {
        Alert.alert(t.resCancelTitle, t.resCancelMsg, [
            { text: t.cancelBtn, style: 'cancel' },
            { text: t.resCancelBtn, style: 'destructive', onPress: async () => {
                setCanc(true);
                try { await api.delete(`/venues/reservations/${item.id}`); onCancel(item.id); }
                catch (e) { Alert.alert(t.error, e?.response?.data?.message || t.resCancelBtn); }
                finally { setCanc(false); }
            }},
        ]);
    };

    const handleReschedule = async () => {
        if (!newDate || !newStart || !newEnd) { Alert.alert(t.error, t.resReschedAllFields); return; }
        setRSched(true);
        try {
            const { data } = await api.patch(`/venues/reservations/${item.id}/reschedule`, {
                newDate, newStartTime: newStart, newEndTime: newEnd,
            });
            onReschedule(item.id, data.reservation);
            setShowRS(false);
        } catch (e) { Alert.alert(t.error, e?.response?.data?.message || t.resRescheduleFailed); }
        finally { setRSched(false); }
    };

    const handleCancelRequest = (requestType) => {
        const isCancelType = requestType === 'CANCEL';
        Alert.alert(
            isCancelType ? '📋 İptal Talebi Gönder' : '🔄 Saat Değişikliği Talebi Gönder',
            isCancelType
                ? 'Rezervasyonunuz için işletmeden iptal ve ücret iadesi talep edeceksiniz.'
                : 'Rezervasyonunuz için işletmeden saat değişikliği talep edeceksiniz. İşletme sizinle iletişime geçecek.',
            [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Talep Gönder', onPress: async () => {
                    setReq(true);
                    try {
                        await api.post(`/venues/reservations/${item.id}/cancel-request`, { requestType });
                        onCancelRequested(item.id);
                    } catch (e) {
                        Alert.alert('Hata', e?.response?.data?.message || 'Talep gönderilemedi');
                    } finally { setReq(false); }
                }},
            ]
        );
    };

    const handleCreateRival = async () => {
        const venueName = item.venue?.name || '';
        const courtName = item.court?.name || '';
        const { sub, cat } = branchToSub(item.venue?.branch);
        try {
            const { data } = await api.get(`/activity/for-reservation/${item.id}`);
            if (data?.listing) {
                Alert.alert(
                    '📢 Aktif İlanınız Var',
                    'Bu rezervasyon için zaten bir rakip arama ilanınız bulunuyor.',
                    [
                        { text: 'Kapat', style: 'cancel' },
                        { text: 'İlana Git', onPress: () => navigation.navigate('SubCategory', {
                            category: cat, sub, initialTab: 'rivals',
                            highlightRivalId: data.listing.id,
                        })},
                    ]
                );
                return;
            }
        } catch {}
        Alert.alert(
            t.resCreateRivalTitle,
            t.resCreateRivalMsg(venueName, courtName, item.date, item.startTime, item.endTime),
            [
                { text: t.cancelBtn, style: 'cancel' },
                { text: t.resCreateRivalGoBtn, onPress: () => {
                    navigation.navigate('SubCategory', {
                        category: cat,
                        sub,
                        initialTab: 'rivals',
                        openCreateRival: true,
                        prefillDate:             item.date,
                        prefillTime:             item.startTime,
                        prefillDuration:         calcDuration(item.startTime, item.endTime),
                        prefillCourtName:        [venueName, courtName].filter(Boolean).join(' ') || undefined,
                        prefillCity:             item.venue?.city || undefined,
                        prefillVenueId:          item.venueId || undefined,
                        prefillVenueCourtId:     item.courtId || undefined,
                        prefillCourtFee:         item.venue?.pricePerSlot || undefined,
                        prefillReservationId:    item.id,
                        prefillSurface:          item.court?.surface || undefined,
                        prefillIndoor:           item.court?.indoor != null ? item.court.indoor : undefined,
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

            {item.venue?.pricePerSlot > 0 && (
                <Text style={s.payText}>💰 {item.venue.pricePerSlot} TL / slot</Text>
            )}
            {item.paymentMethod && (
                <Text style={s.payText}>
                    {item.paymentMethod === 'CASH' ? t.resPayCash : t.resPayOnline}
                </Text>
            )}

            <View style={s.actionRow}>
                {canCancel && (
                    <TouchableOpacity style={s.cancelBtn} onPress={handleCancel} disabled={cancelling} activeOpacity={0.8}>
                        {cancelling
                            ? <ActivityIndicator size="small" color="#f87171" />
                            : <Text style={s.cancelBtnText}>{t.resCancelBtn}</Text>}
                    </TouchableOpacity>
                )}
                {cancelBlocked && !item.cancelRequested && (
                    <>
                        <TouchableOpacity style={[s.cancelBtn, { borderColor:'#ef444450', backgroundColor:'#ef444410' }]}
                            onPress={() => handleCancelRequest('CANCEL')} disabled={requesting} activeOpacity={0.8}>
                            {requesting
                                ? <ActivityIndicator size="small" color="#f87171" />
                                : <Text style={[s.cancelBtnText, { color:'#f87171' }]}>📋 İptal Talep Et</Text>}
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.cancelBtn, { borderColor:'#f59e0b50', backgroundColor:'#f59e0b10' }]}
                            onPress={() => handleCancelRequest('RESCHEDULE')} disabled={requesting} activeOpacity={0.8}>
                            <Text style={[s.cancelBtnText, { color:'#f59e0b' }]}>🔄 Saat Değişikliği Talep Et</Text>
                        </TouchableOpacity>
                    </>
                )}
                {cancelBlocked && item.cancelRequested && (
                    <View style={[s.cancelBtn, { opacity:0.6, borderColor:'#f59e0b30' }]}>
                        <Text style={[s.cancelBtnText, { color:'#f59e0b' }]}>
                            {item.cancelRequestNote?.startsWith('RESCHEDULE') ? '✓ Saat Değişikliği Talebi Gönderildi' : '✓ İptal Talebi Gönderildi'}
                        </Text>
                    </View>
                )}
                {canReschedule && (
                    <TouchableOpacity style={s.reschedBtn} onPress={() => setShowRS(v => !v)} activeOpacity={0.8}>
                        <Text style={s.reschedBtnText}>{t.resReschedBtn}</Text>
                    </TouchableOpacity>
                )}
                {canRival && (
                    <TouchableOpacity style={s.rivalBtn} onPress={handleCreateRival} activeOpacity={0.8}>
                        <Text style={s.rivalBtnText}>{t.resCreateRivalBtn}</Text>
                    </TouchableOpacity>
                )}
            </View>

            {showReschedule && (
                <View style={s.reschedForm}>
                    <Text style={s.reschedLabel}>{t.resReschedDateLabel}</Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
                        <TextInput style={s.reschedInput} placeholder={t.resReschedDatePh} placeholderTextColor="#555"
                            value={newDate} onChangeText={setNewDate} keyboardType="numbers-and-punctuation" />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
                        <TextInput style={[s.reschedInput, { flex: 1 }]} placeholder="10:00" placeholderTextColor="#555"
                            value={newStart} onChangeText={setNewStart} keyboardType="numbers-and-punctuation" maxLength={5} />
                        <Text style={{ color: '#666', alignSelf: 'center' }}>–</Text>
                        <TextInput style={[s.reschedInput, { flex: 1 }]} placeholder="11:00" placeholderTextColor="#555"
                            value={newEnd} onChangeText={setNewEnd} keyboardType="numbers-and-punctuation" maxLength={5} />
                    </View>
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={() => setShowRS(false)}
                            style={{ flex: 1, padding: 9, borderRadius: 8, backgroundColor: '#ffffff10', alignItems: 'center' }}>
                            <Text style={{ color: '#aaa', fontSize: 12 }}>{t.cancelBtn}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={handleReschedule} disabled={rescheduling}
                            style={{ flex: 1, padding: 9, borderRadius: 8, backgroundColor: '#3b82f630', alignItems: 'center' }}>
                            {rescheduling
                                ? <ActivityIndicator size="small" color="#60a5fa" />
                                : <Text style={{ color: '#60a5fa', fontSize: 12, fontWeight: '700' }}>{t.resReschedSaveBtn}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

export default function MyReservationsScreen({ navigation, route }) {
    const t = useT();
    const { sportFilter } = route?.params || {};
    const [reservations, setRes] = useState([]);
    const [loading, setLoading]  = useState(false);
    const [filter, setFilter]    = useState('upcoming');

    const fetchAll = useCallback(async () => {
        setLoading(true);
        try {
            const { data } = await api.get('/venues/reservations/mine');
            setRes(data);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.resLoadFailed);
        } finally { setLoading(false); }
    }, []);

    useFocusEffect(useCallback(() => { fetchAll(); }, [fetchAll]));

    useEffect(() => {
        return onSocket('reservationUpdate', ({ reservationId, status }) => {
            setRes(prev => prev.map(r => r.id === reservationId ? { ...r, status } : r));
        });
    }, []);

    const now    = new Date();
    const today  = now.toISOString().slice(0, 10);
    const isPast = (r) => {
        if (r.date < today) return true;
        if (r.date === today && r.endTime) {
            const [h, m] = r.endTime.split(':').map(Number);
            const end = new Date(`${r.date}T${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}:00`);
            return end <= now;
        }
        return false;
    };

    const awaitCount = reservations.filter(r =>
        r.status === 'PENDING' && r.paymentMethod === 'CASH' &&
        new Date(`${r.date}T${r.startTime}:00`) <= now
    ).length;

    const sportFiltered = sportFilter
        ? reservations.filter(r => branchToSub(r.venue?.branch).sub === sportFilter)
        : reservations;

    const filtered = sportFiltered.filter(r => {
        if (filter === 'upcoming') return !isPast(r) && r.status === 'CONFIRMED';
        if (filter === 'pending')  return !isPast(r) && r.status === 'PENDING';
        if (filter === 'await')    return r.status === 'PENDING' && r.paymentMethod === 'CASH' && new Date(`${r.date}T${r.startTime}:00`) <= now;
        if (filter === 'past')     return isPast(r) || r.status === 'CANCELLED';
        return true;
    });

    const emptyText = filter === 'upcoming' ? t.resEmptyUpcoming
        : filter === 'pending' ? t.resEmptyPending
        : filter === 'await'   ? t.resEmptyAwait
        : t.resEmpty;

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.resTitle}</Text>
            </View>

            <View style={s.filterRow}>
                {[
                    { key: 'upcoming', label: t.resFilterUpcoming },
                    { key: 'pending',  label: t.resFilterPending },
                    { key: 'await',    label: awaitCount > 0 ? t.resFilterAwaitCount(awaitCount) : t.resFilterAwait },
                    { key: 'past',     label: t.resFilterPast },
                    { key: 'all',      label: t.resFilterAll },
                ].map(f => (
                    <TouchableOpacity
                        key={f.key}
                        style={[s.filterBtn, filter === f.key && (f.key === 'await' ? s.filterBtnAwait : s.filterBtnActive)]}
                        onPress={() => setFilter(f.key)}
                        activeOpacity={0.7}
                    >
                        <Text style={[s.filterBtnText, filter === f.key && (f.key === 'await' ? s.filterBtnTextAwait : s.filterBtnTextActive)]}>{f.label}</Text>
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
                            <Text style={s.emptyText}>{emptyText}</Text>
                            {(filter === 'upcoming' || filter === 'pending') && (
                                <TouchableOpacity style={s.newResBtn} onPress={() => navigation.navigate('VenueSearch')} activeOpacity={0.8}>
                                    <Text style={s.newResBtnText}>{t.resSearchVenue}</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    }
                    renderItem={({ item }) => (
                        <ReservationCard item={item} navigation={navigation}
                            onCancel={id => setRes(prev => prev.map(r => r.id === id ? { ...r, status: 'CANCELLED' } : r))}
                            onReschedule={(id, updated) => setRes(prev => prev.map(r => r.id === id ? { ...r, ...updated } : r))}
                            onCancelRequested={id => setRes(prev => prev.map(r => r.id === id ? { ...r, cancelRequested: true } : r))} />
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
    filterBtnAwait: { backgroundColor: '#92400e', borderColor: '#eab308' },
    filterBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    filterBtnTextActive: { color: '#fff' },
    filterBtnTextAwait: { color: '#fde68a' },

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
    reschedBtn: { flex: 1, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#3b82f640', backgroundColor: '#3b82f610' },
    reschedBtnText: { color: '#60a5fa', fontWeight: '700', fontSize: 12 },
    reschedForm: { marginTop: 10, backgroundColor: '#ffffff08', borderRadius: 10, padding: 12 },
    reschedLabel: { color: '#aaa', fontSize: 12, marginBottom: 8, fontWeight: '600' },
    reschedInput: { borderWidth: 1, borderColor: '#ffffff20', borderRadius: 8, padding: 8, color: '#fff', fontSize: 13, backgroundColor: '#ffffff08' },
    rivalBtn: { flex: 2, borderRadius: 8, paddingVertical: 9, alignItems: 'center', borderWidth: 1, borderColor: '#9333ea50', backgroundColor: '#9333ea10' },
    rivalBtnText: { color: '#c084fc', fontWeight: '700', fontSize: 12 },

    empty: { alignItems: 'center', paddingTop: 60 },
    emptyIcon: { fontSize: 44, marginBottom: 12 },
    emptyText: { color: colors.textMuted, fontSize: 14, marginBottom: 16 },
    newResBtn: { backgroundColor: colors.purple, borderRadius: 12, paddingHorizontal: 24, paddingVertical: 11 },
    newResBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },
});
