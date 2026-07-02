import { useState, useRef, useEffect } from 'react';
import RainbowLogo from '../../components/RainbowLogo';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator, Alert,
} from 'react-native';
import { useDispatch } from 'react-redux';
import { setCredentials } from '../../store/slices/authSlice';
import api from '../../services/api';
import colors from '../../theme/colors';
import CityPickerModal from '../../components/CityPickerModal';

const PASSWORD_RULES = [
    { id: 'len',     label: '8-16 karakter',        test: p => p.length >= 8 && p.length <= 16 },
    { id: 'upper',   label: 'Büyük harf (A-Z)',      test: p => /[A-Z]/.test(p) },
    { id: 'lower',   label: 'Küçük harf (a-z)',      test: p => /[a-z]/.test(p) },
    { id: 'special', label: 'Özel karakter (!@#…)',  test: p => /[^a-zA-Z0-9]/.test(p) },
];

const genCaptcha = () => {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    return { q: `${a} + ${b}`, ans: String(a + b) };
};

export default function BusinessRegisterScreen({ navigation }) {
    const dispatch = useDispatch();

    const [form, setForm] = useState({
        fullName: '',
        businessName: '',
        taxNumber: '',
        username: '',
        email: '',
        phone: '',
        city: '',
        businessAddress: '',
        password: '',
    });
    const [showPass, setShowPass] = useState(false);
    const [showCityPicker, setShowCityPicker] = useState(false);
    const [otp, setOtp] = useState('');
    const [otpSent, setOtpSent] = useState(false);
    const [timer, setTimer] = useState(0);
    const [loading, setLoading] = useState(false);
    const [agreed, setAgreed] = useState(false);
    const [captcha, setCaptcha] = useState(genCaptcha);
    const [captchaInput, setCaptchaInput] = useState('');
    const [captchaOk, setCaptchaOk] = useState(false);
    const [captchaErr, setCaptchaErr] = useState(false);
    const timerRef = useRef(null);
    const scrollRef = useRef(null);

    useEffect(() => () => clearInterval(timerRef.current), []);

    const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
    const passwordValid = PASSWORD_RULES.every(r => r.test(form.password));

    const verifyCaptcha = () => {
        if (captchaInput.trim() === captcha.ans) {
            setCaptchaOk(true);
            setCaptchaErr(false);
        } else {
            setCaptchaErr(true);
            setCaptchaOk(false);
            setCaptcha(genCaptcha());
            setCaptchaInput('');
        }
    };

    const startTimer = () => {
        setTimer(60);
        clearInterval(timerRef.current);
        timerRef.current = setInterval(() => {
            setTimer(t => { if (t <= 1) { clearInterval(timerRef.current); return 0; } return t - 1; });
        }, 1000);
    };

    const handleSendOtp = async () => {
        if (!form.fullName.trim()) return Alert.alert('Eksik Alan', 'Ad soyad zorunludur');
        if (!form.businessName.trim()) return Alert.alert('Eksik Alan', 'İşletme adı zorunludur');
        if (!form.taxNumber.trim()) return Alert.alert('Eksik Alan', 'Vergi no / TC kimlik no zorunludur');
        if (!form.username.trim()) return Alert.alert('Eksik Alan', 'Kullanıcı adı zorunludur');
        if (!form.email.trim()) return Alert.alert('Eksik Alan', 'E-posta zorunludur');
        if (!passwordValid) return Alert.alert('Hata', 'Şifre kurallarına uygun değil');
        if (!agreed) return Alert.alert('Eksik Alan', 'Koşulları kabul etmelisiniz');
        if (!captchaOk) return Alert.alert('Eksik Alan', 'Captcha doğrulaması gerekli');

        setLoading(true);
        try {
            const res = await api.post('/auth/send-otp', {
                method: 'email',
                value: form.email.trim(),
                username: form.username.trim(),
                email: form.email.trim(),
            });
            setOtpSent(true);
            startTimer();
            if (res.data.devCode) {
                Alert.alert('Geliştirici Modu', `Doğrulama kodunuz:\n\n${res.data.devCode}`, [{ text: 'Tamam' }]);
            }
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Doğrulama kodu gönderilemedi');
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (otp.length !== 6) return Alert.alert('Hata', '6 haneli kodu girin');
        setLoading(true);
        try {
            await api.post('/auth/verify-otp', { method: 'email', value: form.email.trim(), code: otp });

            const { data } = await api.post('/auth/register', {
                username: form.username.trim(),
                password: form.password,
                fullName: form.fullName.trim(),
                email: form.email.trim(),
                phone: form.phone.trim() || undefined,
                city: form.city || undefined,
                isBusiness: true,
                businessName: form.businessName.trim(),
                taxNumber: form.taxNumber.trim(),
                businessAddress: form.businessAddress.trim() || undefined,
            });
            dispatch(setCredentials({ user: data.user, token: data.token }));
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Kayıt başarısız');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <CityPickerModal
                visible={showCityPicker}
                onClose={() => setShowCityPicker(false)}
                onSelect={v => set('city', v)}
                currentValue={form.city}
            />

            <ScrollView ref={scrollRef} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">
                <RainbowLogo style={{ fontSize: 34, marginBottom: 4 }} />
                <Text style={s.sub}>🏢 İşletme Hesabı Oluştur</Text>
                <Text style={s.subHint}>Kort & saha sahipleri için</Text>

                <View style={s.card}>

                    {/* Yetkili Adı Soyadı */}
                    <Text style={s.label}>Yetkili Ad Soyad *</Text>
                    <TextInput style={s.input} value={form.fullName} onChangeText={v => set('fullName', v)}
                        placeholder="Adınız Soyadınız" placeholderTextColor={colors.textMuted} />

                    {/* İşletme Adı */}
                    <Text style={s.label}>İşletme Adı *</Text>
                    <TextInput style={s.input} value={form.businessName} onChangeText={v => set('businessName', v)}
                        placeholder="Kortlarım Spor Tesisi" placeholderTextColor={colors.textMuted} />

                    {/* Vergi No */}
                    <Text style={s.label}>Vergi No / TC Kimlik No *</Text>
                    <TextInput style={s.input} value={form.taxNumber} onChangeText={v => set('taxNumber', v.replace(/\D/g, '').slice(0, 11))}
                        placeholder="1234567890" placeholderTextColor={colors.textMuted} keyboardType="numeric" maxLength={11} />

                    {/* Kullanıcı Adı */}
                    <Text style={s.label}>Kullanıcı Adı *</Text>
                    <TextInput style={s.input} value={form.username} onChangeText={v => set('username', v)}
                        placeholder="kortlarim_spor" placeholderTextColor={colors.textMuted} autoCapitalize="none" />

                    {/* E-posta */}
                    <Text style={s.label}>E-posta *</Text>
                    <TextInput style={s.input} value={form.email} onChangeText={v => set('email', v)}
                        placeholder="info@isletme.com" placeholderTextColor={colors.textMuted}
                        keyboardType="email-address" autoCapitalize="none" />

                    {/* Telefon */}
                    <Text style={s.label}>İş Telefonu</Text>
                    <TextInput style={s.input} value={form.phone} onChangeText={v => set('phone', v)}
                        placeholder="+90 212 000 00 00" placeholderTextColor={colors.textMuted} keyboardType="phone-pad" />

                    {/* Şehir */}
                    <Text style={s.label}>Şehir</Text>
                    <TouchableOpacity style={[s.input, s.selectBtn]} onPress={() => setShowCityPicker(true)}>
                        <Text style={form.city ? s.selectText : s.selectPh}>
                            {form.city || 'İl seçin...'}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 16 }}>▾</Text>
                    </TouchableOpacity>

                    {/* İşletme Adresi */}
                    <Text style={s.label}>İşletme Adresi</Text>
                    <TextInput style={[s.input, { height: 72, textAlignVertical: 'top', paddingTop: 10 }]}
                        value={form.businessAddress} onChangeText={v => set('businessAddress', v)}
                        placeholder="Mahalle, cadde, sokak, bina no..." placeholderTextColor={colors.textMuted}
                        multiline />

                    {/* Şifre */}
                    <Text style={s.label}>Şifre *</Text>
                    <View style={s.passRow}>
                        <TextInput
                            style={[s.input, { flex: 1, borderTopRightRadius: 0, borderBottomRightRadius: 0, borderRightWidth: 0 }]}
                            value={form.password}
                            onChangeText={v => set('password', v.slice(0, 16))}
                            placeholder="••••••••" placeholderTextColor={colors.textMuted}
                            secureTextEntry={!showPass} maxLength={16}
                        />
                        <TouchableOpacity style={s.eyeBtn} onPress={() => setShowPass(p => !p)}>
                            <Text style={{ fontSize: 17 }}>{showPass ? '🙈' : '👁️'}</Text>
                        </TouchableOpacity>
                    </View>
                    {form.password.length > 0 && (
                        <View style={s.rulesBox}>
                            {PASSWORD_RULES.map(r => (
                                <Text key={r.id} style={r.test(form.password) ? s.ruleOk : s.ruleFail}>
                                    {r.test(form.password) ? '✓' : '✗'} {r.label}
                                </Text>
                            ))}
                        </View>
                    )}

                    <View style={s.divider} />

                    {/* Onay */}
                    <TouchableOpacity style={s.checkRow} onPress={() => setAgreed(a => !a)}>
                        <View style={[s.checkbox, agreed && s.checkboxChecked]}>
                            {agreed && <Text style={s.checkmark}>✓</Text>}
                        </View>
                        <Text style={s.checkLabel}>
                            Kullanıcı sözleşmesini ve gizlilik politikasını okudum, kabul ediyorum *
                        </Text>
                    </TouchableOpacity>

                    {/* Captcha */}
                    <View style={[s.captchaBox, captchaOk && { borderColor: '#4ade80' }, captchaErr && { borderColor: '#f87171' }]}>
                        <View style={s.captchaLeft}>
                            <Text style={{ fontSize: 26 }}>{captchaOk ? '✅' : '🤖'}</Text>
                            <View>
                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>Robot değilim</Text>
                                {captchaOk
                                    ? <Text style={{ color: '#4ade80', fontWeight: '800', fontSize: 13 }}>Doğrulandı</Text>
                                    : <Text style={[{ color: colors.purple, fontWeight: '900', fontSize: 18, marginTop: 2 }, captchaErr && { color: '#f87171' }]}>{captcha.q} = ?</Text>
                                }
                                {captchaErr && <Text style={{ color: '#f87171', fontSize: 10, marginTop: 2 }}>Yanlış, tekrar dene</Text>}
                            </View>
                        </View>
                        {!captchaOk && (
                            <View style={s.captchaRight}>
                                <TextInput
                                    style={[s.input, { width: 48, textAlign: 'center', fontSize: 18, fontWeight: '900' }]}
                                    value={captchaInput}
                                    onChangeText={v => { setCaptchaInput(v.replace(/\D/g, '').slice(0, 2)); setCaptchaErr(false); }}
                                    keyboardType="numeric" placeholder="?" placeholderTextColor={colors.textMuted}
                                    maxLength={2} textAlign="center"
                                />
                                <TouchableOpacity
                                    style={[s.captchaBtn, !captchaInput && { opacity: 0.4 }]}
                                    onPress={verifyCaptcha} disabled={!captchaInput}
                                >
                                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>Doğrula</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                    </View>

                    <TouchableOpacity
                        style={[s.btn, s.bizBtn, (!passwordValid || !agreed) && { opacity: 0.5 }]}
                        onPress={handleSendOtp}
                        disabled={loading || otpSent}
                    >
                        {loading
                            ? <ActivityIndicator color="#fff" />
                            : <Text style={s.btnText}>{otpSent ? 'Kod Gönderildi ✓' : '📧 Doğrulama Kodu Gönder'}</Text>}
                    </TouchableOpacity>

                    {/* OTP Kutusu */}
                    {otpSent && (
                        <View style={s.otpBox}>
                            <Text style={s.otpInfo}>
                                📧 <Text style={{ color: colors.purpleLight, fontWeight: '700' }}>{form.email}</Text> adresine kod gönderildi
                            </Text>
                            <Text style={s.label}>Doğrulama Kodu</Text>
                            <TextInput
                                style={[s.input, { textAlign: 'center', fontSize: 28, fontWeight: '900', letterSpacing: 12, marginBottom: 4 }]}
                                value={otp}
                                onChangeText={v => setOtp(v.replace(/\D/g, '').slice(0, 6))}
                                keyboardType="numeric" maxLength={6}
                                placeholder="• • • • • •" placeholderTextColor={colors.textMuted}
                                textAlign="center" autoFocus
                            />
                            <TouchableOpacity style={[s.btn, s.bizBtn]} onPress={handleVerify} disabled={loading}>
                                {loading
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={s.btnText}>🏢 İşletme Hesabı Oluştur</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={timer === 0 ? () => { setOtpSent(false); setTimeout(handleSendOtp, 100); } : undefined}
                                style={[{ marginTop: 12, alignItems: 'center' }, timer > 0 && { opacity: 0.4 }]}
                                disabled={timer > 0}
                            >
                                <Text style={{ color: colors.purpleLight, fontWeight: '700', fontSize: 13 }}>
                                    {timer > 0 ? `Tekrar gönder (${timer}s)` : 'Tekrar Gönder'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 16, alignItems: 'center' }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                            Zaten hesabın var mı? <Text style={{ color: colors.purpleLight, fontWeight: '700' }}>Giriş Yap</Text>
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: 8, alignItems: 'center' }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                            Bireysel kayıt için: <Text style={{ color: colors.purpleLight, fontWeight: '700' }}>Bireysel Kayıt Ol</Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 40 },
    sub: { fontSize: 18, color: '#fbbf24', textAlign: 'center', marginBottom: 2, fontWeight: '800' },
    subHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 18, borderWidth: 1, borderColor: '#f59e0b40' },

    label: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', marginBottom: 5, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
    input: { backgroundColor: colors.surface2, color: colors.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 11, borderWidth: 1, borderColor: colors.border, fontSize: 14 },

    selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    selectText: { color: colors.text, fontSize: 14 },
    selectPh: { color: colors.textMuted, fontSize: 14 },

    passRow: { flexDirection: 'row' },
    eyeBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12, paddingHorizontal: 14, justifyContent: 'center' },
    rulesBox: { marginTop: 6, gap: 3, paddingLeft: 2 },
    ruleOk: { color: '#4ade80', fontSize: 11, fontWeight: '600' },
    ruleFail: { color: '#f87171', fontSize: 11, fontWeight: '600' },

    divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },

    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginBottom: 10 },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
    checkboxChecked: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
    checkmark: { color: '#fff', fontSize: 12, fontWeight: '900' },
    checkLabel: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 },

    captchaBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface2, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border, marginTop: 4, marginBottom: 4 },
    captchaLeft: { flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 },
    captchaRight: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    captchaBtn: { backgroundColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8 },

    btn: { borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 18 },
    bizBtn: { backgroundColor: '#d97706' },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    otpBox: { marginTop: 16, backgroundColor: colors.surface2, borderRadius: 16, padding: 16, borderWidth: 1, borderColor: '#f59e0b50' },
    otpInfo: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 4, textAlign: 'center' },
});
