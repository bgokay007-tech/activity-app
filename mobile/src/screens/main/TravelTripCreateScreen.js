import { useMemo, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import CityAutocomplete from '../../components/CityAutocomplete';
import { travelStyles as ts } from './TravelExploreHomeScreen';

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];
const pad2 = (n) => String(n).padStart(2, '0');

export default function TravelTripCreateScreen({ navigation }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const days = useMemo(() => Array.from({ length: 30 }, (_, i) => {
        const d = new Date();
        d.setHours(0, 0, 0, 0);
        d.setDate(d.getDate() + i);
        return d;
    }), []);

    const [fromPlace, setFromPlace] = useState('');
    const [toPlace, setToPlace] = useState('');
    const [waypoints, setWaypoints] = useState([]);
    const [dayIdx, setDayIdx] = useState(0);
    const [hour, setHour] = useState(Math.min(23, new Date().getHours() + 1));
    const [minute, setMinute] = useState(0);
    const [seats, setSeats] = useState(1);
    const [paid, setPaid] = useState(false);
    const [price, setPrice] = useState('');
    const [vehicle, setVehicle] = useState('');
    const [note, setNote] = useState('');
    const [saving, setSaving] = useState(false);

    const dayLabel = (d, i) => (i === 0 ? t.tvToday : i === 1 ? t.tvTomorrow : `${pad2(d.getDate())}.${pad2(d.getMonth() + 1)}`);

    const submit = async () => {
        if (!fromPlace.trim() || !toPlace.trim()) { Alert.alert('', t.tvRequiredTrip); return; }
        const dt = new Date(days[dayIdx]);
        dt.setHours(hour, minute, 0, 0);
        setSaving(true);
        try {
            const { data } = await api.post('/travel/trips', {
                fromPlace, toPlace, waypoints: waypoints.filter(x => x.trim()),
                departAt: dt.toISOString(), seats,
                pricePerSeat: paid ? parseInt(price, 10) || 0 : 0,
                vehicle, note,
            });
            Alert.alert('', t.tvTripCreated);
            navigation.replace('TravelTripDetail', { tripId: data.id });
        } catch (e) {
            if (e?.response?.data?.code === 'VERIFICATION_REQUIRED') {
                navigation.replace('TravelVerification');
                return;
            }
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setSaving(false); }
    };

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[ts.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Text style={ts.backText}>{t.back}</Text></TouchableOpacity>
                <Text style={ts.title} numberOfLines={1}>{t.tvCreateTrip.replace('+ ', '')}</Text>
                <View style={{ width: 50 }} />
            </View>
            <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: insets.bottom + 60 }} keyboardShouldPersistTaps="always">
                <Text style={ts.label}>{t.tvFrom} *</Text>
                <CityAutocomplete value={fromPlace} onChangeText={setFromPlace} placeholder={t.tvPlacePh} inputStyle={ts.input} style={{ zIndex: 40 }} />
                <Text style={ts.label}>{t.tvTo} *</Text>
                <CityAutocomplete value={toPlace} onChangeText={setToPlace} placeholder={t.tvPlacePh} inputStyle={ts.input} style={{ zIndex: 30 }} />

                <Text style={ts.label}>{t.tvWaypoints}</Text>
                {waypoints.map((w, i) => (
                    <View key={i} style={s.row}>
                        <TextInput
                            style={[ts.input, { flex: 1 }]}
                            value={w}
                            onChangeText={(v) => setWaypoints(prev => prev.map((x, j) => (j === i ? v : x)))}
                            placeholder={t.tvPlacePh}
                            placeholderTextColor={colors.textMuted}
                        />
                        <TouchableOpacity onPress={() => setWaypoints(prev => prev.filter((_, j) => j !== i))} style={s.del}>
                            <Text style={{ color: '#fff', fontWeight: '900' }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                ))}
                <TouchableOpacity onPress={() => setWaypoints(prev => [...prev, ''])}><Text style={s.link}>{t.tvAddWaypoint}</Text></TouchableOpacity>

                <Text style={ts.label}>{t.tvDepartDate}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {days.map((d, i) => (
                        <TouchableOpacity key={i} style={[ts.chip, s.gap, dayIdx === i && ts.chipActive]} onPress={() => setDayIdx(i)}>
                            <Text style={[ts.chipText, dayIdx === i && ts.chipTextActive]}>{dayLabel(d, i)}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>

                <Text style={ts.label}>{t.tvDepartTime}: {pad2(hour)}:{pad2(minute)}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled">
                    {HOURS.map(h => (
                        <TouchableOpacity key={h} style={[ts.chip, s.gap, hour === h && ts.chipActive]} onPress={() => setHour(h)}>
                            <Text style={[ts.chipText, hour === h && ts.chipTextActive]}>{pad2(h)}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
                <View style={{ flexDirection: 'row', marginTop: 8 }}>
                    {MINUTES.map(m => (
                        <TouchableOpacity key={m} style={[ts.chip, s.gap, minute === m && ts.chipActive]} onPress={() => setMinute(m)}>
                            <Text style={[ts.chipText, minute === m && ts.chipTextActive]}>:{pad2(m)}</Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <Text style={ts.label}>{t.tvSeats}</Text>
                <View style={s.stepper}>
                    <TouchableOpacity style={s.stepBtn} onPress={() => setSeats(v => Math.max(1, v - 1))}><Text style={s.stepText}>−</Text></TouchableOpacity>
                    <Text style={s.stepValue}>{seats}</Text>
                    <TouchableOpacity style={s.stepBtn} onPress={() => setSeats(v => Math.min(8, v + 1))}><Text style={s.stepText}>+</Text></TouchableOpacity>
                </View>

                <Text style={ts.label}>{t.tvPrice}</Text>
                <View style={{ flexDirection: 'row', gap: 8 }}>
                    <TouchableOpacity style={[ts.chip, !paid && ts.chipActive]} onPress={() => setPaid(false)}>
                        <Text style={[ts.chipText, !paid && ts.chipTextActive]}>{t.tvPriceFree}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[ts.chip, paid && ts.chipActive]} onPress={() => setPaid(true)}>
                        <Text style={[ts.chipText, paid && ts.chipTextActive]}>{t.tvPricePaid}</Text>
                    </TouchableOpacity>
                </View>
                {paid ? (
                    <TextInput style={[ts.input, { marginTop: 8 }]} value={price} onChangeText={(v) => setPrice(v.replace(/\D/g, ''))} keyboardType="number-pad" placeholder={t.tvPricePh} placeholderTextColor={colors.textMuted} />
                ) : null}

                <Text style={ts.label}>{t.tvVehicle}</Text>
                <TextInput style={ts.input} value={vehicle} onChangeText={setVehicle} placeholder={t.tvVehiclePh} placeholderTextColor={colors.textMuted} />

                <Text style={ts.label}>{t.tvNote}</Text>
                <TextInput style={[ts.input, { minHeight: 80, textAlignVertical: 'top' }]} value={note} onChangeText={setNote} placeholder={t.tvNotePh} placeholderTextColor={colors.textMuted} multiline />

                <Text style={s.safety}>🛡️ {t.tvSafetyNote}</Text>

                <TouchableOpacity style={[ts.primaryBtn, { marginTop: 16, opacity: saving ? 0.6 : 1 }]} onPress={submit} disabled={saving}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={ts.primaryBtnText}>{t.tvPublishTrip}</Text>}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    row:       { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    del:       { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    link:      { color: '#0ea5e9', fontWeight: '800', fontSize: 14, paddingVertical: 4 },
    gap:       { marginRight: 6 },
    stepper:   { flexDirection: 'row', alignItems: 'center', gap: 16 },
    stepBtn:   { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    stepText:  { color: colors.text, fontSize: 20, fontWeight: '900' },
    stepValue: { color: colors.text, fontSize: 20, fontWeight: '900', minWidth: 24, textAlign: 'center' },
    safety:    { color: colors.textMuted, fontSize: 12, marginTop: 16 },
});
