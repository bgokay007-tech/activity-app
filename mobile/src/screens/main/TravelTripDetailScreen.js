import { useCallback, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { formatTripDate } from '../../utils/travelMedia';
import { travelStyles as ts } from './TravelExploreHomeScreen';

const ACCENT = '#0ea5e9';

export default function TravelTripDetailScreen({ navigation, route }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const { tripId } = route.params || {};
    const [trip, setTrip] = useState(null);
    const [loading, setLoading] = useState(true);
    const [seats, setSeats] = useState(1);
    const [message, setMessage] = useState('');
    const [busy, setBusy] = useState(false);

    const load = useCallback(async () => {
        try {
            const { data } = await api.get(`/travel/trips/${tripId}`);
            setTrip(data);
        } catch { setTrip(null); }
        finally { setLoading(false); }
    }, [tripId]);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const isOwner = trip && Array.isArray(trip.requests);

    const openChat = (user) => {
        if (!user?.id) return;
        navigation.navigate('MessagesTab', {
            screen: 'Chat',
            params: {
                other: { id: user.id, username: user.username, fullName: user.fullName },
                conversation: { id: null, _userId: user.id },
            },
        });
    };

    const run = async (fn, okMsg) => {
        if (busy) return;
        setBusy(true);
        try {
            await fn();
            if (okMsg) Alert.alert('', okMsg);
            await load();
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setBusy(false); }
    };

    const requestJoin = () => run(() => api.post(`/travel/trips/${tripId}/requests`, { seats, message }), t.tvRequestSent);
    const cancelRequest = () => run(() => api.delete(`/travel/trips/${tripId}/requests/mine`));
    const respond = (requestId, action) => run(() => api.patch(`/travel/trips/requests/${requestId}`, { action }));
    const cancelTrip = () => {
        Alert.alert('', t.tvCancelTripQ, [
            { text: t.no, style: 'cancel' },
            { text: t.yes, style: 'destructive', onPress: () => run(() => api.patch(`/travel/trips/${tripId}/cancel`)) },
        ]);
    };

    if (loading) return <View style={s.center}><ActivityIndicator color={ACCENT} /></View>;
    if (!trip) return (
        <View style={s.center}>
            <Text style={{ color: colors.textMuted }}>{t.actionFailed}</Text>
            <TouchableOpacity onPress={() => navigation.goBack()}><Text style={[ts.backText, { marginTop: 12 }]}>{t.back}</Text></TouchableOpacity>
        </View>
    );

    const cancelled = trip.status === 'CANCELLED';
    const myReq = trip.myRequest;
    const canRequest = !isOwner && !cancelled && (!myReq || myReq.status === 'REJECTED' || myReq.status === 'CANCELLED') && trip.seatsLeft > 0;

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[ts.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Text style={ts.backText}>{t.back}</Text></TouchableOpacity>
                <Text style={ts.title} numberOfLines={1}>{t.tvTabTravel}</Text>
                <View style={{ width: 50 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60 }} keyboardShouldPersistTaps="handled">
                <View style={s.card}>
                    <Text style={s.route}>{trip.fromPlace} → {trip.toPlace}</Text>
                    {trip.waypoints?.length ? <Text style={s.meta}>↳ {trip.waypoints.join(' → ')}</Text> : null}
                    <Text style={s.meta}>🕒 {t.tvDeparture}: {formatTripDate(trip.departAt)}</Text>
                    <Text style={s.meta}>💺 {t.tvSeatsLeft(trip.seatsLeft)} / {trip.seats}</Text>
                    <Text style={s.price}>{trip.pricePerSeat > 0 ? t.tvPerSeat(trip.pricePerSeat) : t.tvFree}</Text>
                    {trip.vehicle ? <Text style={s.meta}>🚘 {trip.vehicle}</Text> : null}
                    {trip.note ? <Text style={s.note}>{trip.note}</Text> : null}
                    {cancelled ? <Text style={s.cancelled}>{t.tvTripCancelled}</Text> : null}
                </View>

                <View style={[s.card, s.ownerRow]}>
                    <View style={{ flex: 1 }}>
                        <Text style={s.owner}>👤 {trip.user?.fullName || trip.user?.username}</Text>
                        {trip.user?.travelVerified ? <Text style={s.verified}>{t.tvVerifiedBadge}</Text> : null}
                    </View>
                    {!isOwner ? (
                        <TouchableOpacity style={s.msgBtn} onPress={() => openChat(trip.user)}>
                            <Text style={s.msgText}>{t.tvMessage}</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>

                {!isOwner && myReq && myReq.status !== 'CANCELLED' ? (
                    <View style={s.card}>
                        <Text style={s.status}>{t[`tvReqStatus${myReq.status}`]}</Text>
                        {(myReq.status === 'PENDING' || myReq.status === 'ACCEPTED') && !cancelled ? (
                            <TouchableOpacity onPress={cancelRequest} disabled={busy}>
                                <Text style={s.danger}>{t.tvCancelRequest}</Text>
                            </TouchableOpacity>
                        ) : null}
                    </View>
                ) : null}

                {canRequest ? (
                    <View style={s.card}>
                        <Text style={ts.label}>{t.tvSeatsWanted}</Text>
                        <View style={s.stepper}>
                            <TouchableOpacity style={s.stepBtn} onPress={() => setSeats(v => Math.max(1, v - 1))}><Text style={s.stepText}>−</Text></TouchableOpacity>
                            <Text style={s.stepValue}>{seats}</Text>
                            <TouchableOpacity style={s.stepBtn} onPress={() => setSeats(v => Math.min(trip.seatsLeft, v + 1))}><Text style={s.stepText}>+</Text></TouchableOpacity>
                        </View>
                        <TextInput
                            style={[ts.input, { minHeight: 70, textAlignVertical: 'top', marginTop: 10 }]}
                            value={message}
                            onChangeText={setMessage}
                            placeholder={t.tvRequestMsgPh}
                            placeholderTextColor={colors.textMuted}
                            multiline
                        />
                        <TouchableOpacity style={[ts.primaryBtn, { opacity: busy ? 0.6 : 1 }]} onPress={requestJoin} disabled={busy}>
                            {busy ? <ActivityIndicator color="#fff" /> : <Text style={ts.primaryBtnText}>{t.tvRequestJoin}</Text>}
                        </TouchableOpacity>
                    </View>
                ) : null}

                {isOwner ? (
                    <>
                        <Text style={[ts.label, { fontSize: 15, color: colors.text }]}>{t.tvRequests}</Text>
                        {trip.requests.filter(r => r.status !== 'CANCELLED').length === 0 ? <Text style={{ color: colors.textMuted }}>{t.tvNoRequests}</Text> : null}
                        {trip.requests.filter(r => r.status !== 'CANCELLED').map(r => (
                            <View key={r.id} style={s.card}>
                                <View style={s.ownerRow}>
                                    <View style={{ flex: 1 }}>
                                        <Text style={s.owner}>{r.user?.fullName || r.user?.username} · {r.seats} 💺</Text>
                                        {r.user?.travelVerified ? <Text style={s.verified}>{t.tvVerifiedBadge}</Text> : null}
                                    </View>
                                    <TouchableOpacity style={s.msgBtn} onPress={() => openChat(r.user)}>
                                        <Text style={s.msgText}>{t.tvMessage}</Text>
                                    </TouchableOpacity>
                                </View>
                                {r.message ? <Text style={s.note}>{r.message}</Text> : null}
                                {r.status === 'PENDING' && !cancelled ? (
                                    <View style={{ flexDirection: 'row', gap: 10, marginTop: 10 }}>
                                        <TouchableOpacity style={[s.actBtn, { backgroundColor: '#16a34a' }]} onPress={() => respond(r.id, 'ACCEPT')} disabled={busy}>
                                            <Text style={s.actText}>{t.tvAccept}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[s.actBtn, { backgroundColor: colors.red }]} onPress={() => respond(r.id, 'REJECT')} disabled={busy}>
                                            <Text style={s.actText}>{t.tvReject}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <Text style={s.status}>{t[`tvReqStatus${r.status}`]}</Text>
                                )}
                            </View>
                        ))}
                        {!cancelled ? (
                            <TouchableOpacity onPress={cancelTrip} style={{ marginTop: 20, alignItems: 'center' }} disabled={busy}>
                                <Text style={s.danger}>{t.tvCancelTrip}</Text>
                            </TouchableOpacity>
                        ) : null}
                    </>
                ) : null}

                <Text style={s.safety}>🛡️ {t.tvSafetyNote}</Text>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    center:    { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    card:      { backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, padding: 14, marginTop: 10, gap: 4 },
    route:     { color: colors.text, fontSize: 18, fontWeight: '900' },
    meta:      { color: colors.textSecondary, fontSize: 13 },
    price:     { color: '#22c55e', fontSize: 15, fontWeight: '900', marginTop: 2 },
    note:      { color: colors.textSecondary, fontSize: 13, marginTop: 6, fontStyle: 'italic' },
    cancelled: { color: colors.red, fontWeight: '900', marginTop: 6 },
    ownerRow:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
    owner:     { color: colors.text, fontWeight: '800', fontSize: 14 },
    verified:  { color: '#22c55e', fontWeight: '800', fontSize: 12, marginTop: 2 },
    msgBtn:    { borderWidth: 1, borderColor: ACCENT, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 7 },
    msgText:   { color: ACCENT, fontWeight: '800', fontSize: 13 },
    status:    { color: ACCENT, fontWeight: '800', fontSize: 13, marginTop: 6 },
    danger:    { color: colors.red, fontWeight: '800', fontSize: 14, marginTop: 6 },
    stepper:   { flexDirection: 'row', alignItems: 'center', gap: 16 },
    stepBtn:   { width: 38, height: 38, borderRadius: 19, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    stepText:  { color: colors.text, fontSize: 20, fontWeight: '900' },
    stepValue: { color: colors.text, fontSize: 20, fontWeight: '900', minWidth: 24, textAlign: 'center' },
    actBtn:    { flex: 1, borderRadius: 12, paddingVertical: 10, alignItems: 'center' },
    actText:   { color: '#fff', fontWeight: '900' },
    safety:    { color: colors.textMuted, fontSize: 12, marginTop: 20 },
});
