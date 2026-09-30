import { useCallback, useEffect, useRef, useState } from 'react';
import {
    View, Text, TouchableOpacity, StyleSheet, ScrollView, TextInput,
    Alert, ActivityIndicator, KeyboardAvoidingView, Platform, Keyboard,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { pickAndUploadMedia, pickAndUploadDocument } from '../../utils/travelMedia';
import { travelStyles as ts } from './TravelExploreHomeScreen';

const ACCENT = '#0ea5e9';
const pad2 = (n) => String(n).padStart(2, '0');

function parseBirth(text) {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(text.trim());
    if (!m) return null;
    const d = new Date(Date.UTC(+m[3], +m[2] - 1, +m[1]));
    return d.getUTCDate() === +m[1] ? d : null;
}

export default function TravelVerificationScreen({ navigation }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [current, setCurrent] = useState(null);
    const [fullName, setFullName] = useState('');
    const [tcNo, setTcNo] = useState('');
    const [birth, setBirth] = useState('');
    const [phone, setPhone] = useState('');
    const [idCardUrl, setIdCardUrl] = useState(null);
    const [adliSicilUrl, setAdliSicilUrl] = useState(null);
    const [selfieUrl, setSelfieUrl] = useState(null);
    const [uploadingKey, setUploadingKey] = useState(null);
    const [saving, setSaving] = useState(false);
    const [autofilled, setAutofilled] = useState(false);
    const [kbHeight, setKbHeight] = useState(0);
    const scrollRef = useRef(null);

    useEffect(() => {
        const showEvt = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
        const hideEvt = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';
        const a = Keyboard.addListener(showEvt, (e) => setKbHeight(e.endCoordinates?.height || 0));
        const b = Keyboard.addListener(hideEvt, () => setKbHeight(0));
        return () => { a.remove(); b.remove(); };
    }, []);

    // Klavye animasyonu bitmeden kaydırılırsa hedef konum yanlış hesaplanıyor.
    const revealDocs = () => setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);

    const load = useCallback(async () => {
        const [verRes, meRes] = await Promise.allSettled([api.get('/travel/verification'), api.get('/auth/me')]);
        const data = verRes.status === 'fulfilled' ? verRes.value.data : null;
        const me = meRes.status === 'fulfilled' ? meRes.value.data : null;
        setCurrent(data || null);
        const name = data?.fullName || me?.fullName || '';
        const birthRaw = data?.birthDate || me?.birthDate;
        const phoneVal = data?.phone || me?.contactPhone || me?.phone || '';
        setFullName(name);
        setTcNo(data?.tcKimlikNo || '');
        const bd = birthRaw ? new Date(birthRaw) : null;
        setBirth(bd && !isNaN(bd) ? `${pad2(bd.getUTCDate())}.${pad2(bd.getUTCMonth() + 1)}.${bd.getUTCFullYear()}` : '');
        setPhone(phoneVal);
        setIdCardUrl(data?.idCardUrl || null);
        setAdliSicilUrl(data?.adliSicilUrl || null);
        setSelfieUrl(data?.selfieUrl || null);
        setAutofilled(!data && !!(me?.fullName || me?.birthDate || me?.contactPhone || me?.phone));
        setLoading(false);
    }, []);

    useFocusEffect(useCallback(() => { load(); }, [load]));

    const upload = async (key, fn, setter) => {
        if (uploadingKey) return;
        setUploadingKey(key);
        try {
            const res = await fn();
            const file = Array.isArray(res) ? res[0] : res;
            if (file?.url) setter(file.url);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setUploadingKey(null); }
    };

    const submit = async () => {
        if (!fullName.trim() || !tcNo.trim() || !phone.trim() || !idCardUrl || !adliSicilUrl) {
            Alert.alert('', t.tvVerifyMissing);
            return;
        }
        const bd = parseBirth(birth);
        if (!bd) { Alert.alert('', t.tvInvalidBirth); return; }
        setSaving(true);
        try {
            await api.post('/travel/verification', {
                fullName, tcKimlikNo: tcNo, birthDate: bd.toISOString(), phone,
                idCardUrl, adliSicilUrl, selfieUrl,
            });
            Alert.alert('', t.tvVerifySubmitted);
            navigation.goBack();
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setSaving(false); }
    };

    const DocRow = ({ label, value, k, onPick, pickLabel }) => (
        <View style={s.docRow}>
            <Text style={s.docLabel}>{label}</Text>
            <TouchableOpacity style={[s.docBtn, value && s.docBtnDone]} onPress={onPick} disabled={!!uploadingKey}>
                {uploadingKey === k
                    ? <ActivityIndicator color={ACCENT} size="small" />
                    : <Text style={[s.docBtnText, value && { color: '#22c55e' }]}>{value ? t.tvUploaded : pickLabel}</Text>}
            </TouchableOpacity>
        </View>
    );

    if (loading) return <View style={s.center}><ActivityIndicator color={ACCENT} /></View>;

    const statusText = current?.status === 'APPROVED' ? t.tvVerifyApproved
        : current?.status === 'PENDING' ? t.tvVerifyPending
        : current?.status === 'REJECTED' ? t.tvVerifyRejected(current.adminNote)
        : null;

    return (
        <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            <View style={[ts.header, { paddingTop: Math.max(insets.top, 12) + 6 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()}><Text style={ts.backText}>{t.back}</Text></TouchableOpacity>
                <Text style={ts.title} numberOfLines={1}>{t.tvVerifyTitle}</Text>
                <View style={{ width: 50 }} />
            </View>
            <ScrollView ref={scrollRef} contentContainerStyle={{ padding: 16, paddingBottom: Math.max(60, insets.bottom + 60) + kbHeight }} keyboardShouldPersistTaps="handled">
                {statusText ? (
                    <Text style={[s.status, current?.status === 'APPROVED' ? s.ok : current?.status === 'REJECTED' ? s.bad : s.wait]}>{statusText}</Text>
                ) : null}
                <Text style={s.intro}>🛡️ {t.tvVerifyIntro}</Text>
                {autofilled ? <Text style={s.autofill}>✨ {t.tvAutofilledFromProfile}</Text> : null}

                <Text style={ts.label}>{t.tvFullName} *</Text>
                <TextInput style={ts.input} value={fullName} onChangeText={setFullName} placeholderTextColor={colors.textMuted} autoCapitalize="words" />

                <Text style={ts.label}>{t.tvIdNo} *</Text>
                <TextInput style={ts.input} value={tcNo} onChangeText={(v) => setTcNo(v.replace(/\D/g, '').slice(0, 11))} keyboardType="number-pad" placeholder="12345678901" placeholderTextColor={colors.textMuted} />

                <Text style={ts.label}>{t.tvBirthDate} *</Text>
                <TextInput style={ts.input} value={birth} onChangeText={setBirth} keyboardType="numbers-and-punctuation" placeholder={t.tvBirthDatePh} placeholderTextColor={colors.textMuted} maxLength={10} onFocus={revealDocs} />

                <Text style={ts.label}>{t.tvPhone} *</Text>
                <TextInput style={ts.input} value={phone} onChangeText={setPhone} keyboardType="phone-pad" placeholder="+90 5xx xxx xx xx" placeholderTextColor={colors.textMuted} onFocus={revealDocs} />

                <DocRow label={`${t.tvIdCard} *`} value={idCardUrl} k="id" pickLabel={t.tvPickPhoto}
                    onPick={() => upload('id', () => pickAndUploadMedia(t, { allowVideo: false, multiple: false }), setIdCardUrl)} />
                <DocRow label={`${t.tvCriminalRecord} *`} value={adliSicilUrl} k="sicil" pickLabel={t.tvPickFile}
                    onPick={() => upload('sicil', pickAndUploadDocument, setAdliSicilUrl)} />
                <DocRow label={t.tvSelfie} value={selfieUrl} k="selfie" pickLabel={t.tvPickPhoto}
                    onPick={() => upload('selfie', () => pickAndUploadMedia(t, { allowVideo: false, multiple: false }), setSelfieUrl)} />

                <TouchableOpacity style={[ts.primaryBtn, { marginTop: 22, opacity: saving || uploadingKey ? 0.6 : 1 }]} onPress={submit} disabled={saving || !!uploadingKey}>
                    {saving ? <ActivityIndicator color="#fff" /> : <Text style={ts.primaryBtnText}>{t.tvSubmitVerify}</Text>}
                </TouchableOpacity>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    center:    { flex: 1, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
    intro:     { color: colors.textSecondary, fontSize: 13, lineHeight: 19, marginTop: 6 },
    autofill:  { color: ACCENT, fontSize: 12, lineHeight: 17, marginTop: 8, fontWeight: '700' },
    status:    { borderRadius: 12, padding: 10, fontSize: 13, fontWeight: '800', marginBottom: 8 },
    ok:        { color: '#22c55e', backgroundColor: '#22c55e18' },
    bad:       { color: '#f87171', backgroundColor: '#ef444418' },
    wait:      { color: '#fbbf24', backgroundColor: '#f59e0b18' },
    docRow:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16, gap: 10 },
    docLabel:  { color: colors.textSecondary, fontSize: 13, fontWeight: '700', flex: 1 },
    docBtn:    { borderWidth: 1, borderColor: ACCENT, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, minWidth: 110, alignItems: 'center' },
    docBtnDone:{ borderColor: '#22c55e' },
    docBtnText:{ color: ACCENT, fontWeight: '800', fontSize: 13 },
});
