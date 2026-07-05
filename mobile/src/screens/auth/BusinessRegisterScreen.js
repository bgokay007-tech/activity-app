import { useState, useRef, useEffect } from 'react';
import RainbowLogo from '../../components/RainbowLogo';
import {
    View, Text, TextInput, TouchableOpacity, StyleSheet,
    KeyboardAvoidingView, Platform, ScrollView, ActivityIndicator,
    Alert, Modal, FlatList,
} from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { setCredentials } from '../../store/slices/authSlice';
import { setLang } from '../../store/slices/langSlice';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import CityPickerModal from '../../components/CityPickerModal';

const PASSWORD_TESTS = [
    { id: 'len',     key: 'passRuleLen',     test: p => p.length >= 8 && p.length <= 16 },
    { id: 'upper',   key: 'passRuleUpper',   test: p => /[A-Z]/.test(p) },
    { id: 'lower',   key: 'passRuleLower',   test: p => /[a-z]/.test(p) },
    { id: 'special', key: 'passRuleSpecial', test: p => /[^a-zA-Z0-9]/.test(p) },
];

const DIAL_CODES = [
    { flag: '🇹🇷', name: 'Türkiye', dial: '+90' },
    { flag: '🇺🇸', name: 'USA', dial: '+1' },
    { flag: '🇬🇧', name: 'UK', dial: '+44' },
    { flag: '🇩🇪', name: 'Almanya', dial: '+49' },
    { flag: '🇫🇷', name: 'Fransa', dial: '+33' },
    { flag: '🇮🇹', name: 'İtalya', dial: '+39' },
    { flag: '🇪🇸', name: 'İspanya', dial: '+34' },
    { flag: '🇳🇱', name: 'Hollanda', dial: '+31' },
    { flag: '🇧🇪', name: 'Belçika', dial: '+32' },
    { flag: '🇵🇱', name: 'Polonya', dial: '+48' },
    { flag: '🇵🇹', name: 'Portekiz', dial: '+351' },
    { flag: '🇸🇪', name: 'İsveç', dial: '+46' },
    { flag: '🇨🇭', name: 'İsviçre', dial: '+41' },
    { flag: '🇦🇹', name: 'Avusturya', dial: '+43' },
    { flag: '🇳🇴', name: 'Norveç', dial: '+47' },
    { flag: '🇬🇷', name: 'Yunanistan', dial: '+30' },
    { flag: '🇷🇺', name: 'Rusya', dial: '+7' },
    { flag: '🇸🇦', name: 'Suudi Arabistan', dial: '+966' },
    { flag: '🇯🇵', name: 'Japonya', dial: '+81' },
    { flag: '🇦🇺', name: 'Avustralya', dial: '+61' },
    { flag: '🇨🇦', name: 'Kanada', dial: '+1 CA' },
];

const genCaptcha = () => {
    const a = Math.floor(Math.random() * 9) + 1;
    const b = Math.floor(Math.random() * 9) + 1;
    return { q: `${a} + ${b}`, ans: String(a + b) };
};

export default function BusinessRegisterScreen({ navigation }) {
    const dispatch = useDispatch();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const t = useT();

    const [form, setForm] = useState({
        fullName: '',
        businessName: '',
        taxNumber: '',
        username: '',
        email: '',
        workPhone: '',
        mobilePhone: '',
        city: '',
        businessAddress: '',
        password: '',
    });

    const [workDialCode, setWorkDialCode] = useState(DIAL_CODES[0]);
    const [mobileDialCode, setMobileDialCode] = useState(DIAL_CODES[0]);
    const [dialPickerTarget, setDialPickerTarget] = useState(null); // 'work' | 'mobile' | null
    const currentDialCode = dialPickerTarget === 'work' ? workDialCode : mobileDialCode;

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
    const passwordValid = PASSWORD_TESTS.every(r => r.test(form.password));

    const fullWorkPhone = form.workPhone.trim() ? workDialCode.dial + form.workPhone.trim() : '';
    const fullMobilePhone = form.mobilePhone.trim() ? mobileDialCode.dial + form.mobilePhone.trim() : '';

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
            setTimer(prev => { if (prev <= 1) { clearInterval(timerRef.current); return 0; } return prev - 1; });
        }, 1000);
    };

    const handleSendOtp = async () => {
        if (!form.fullName.trim()) return Alert.alert(t.missingField, t.bizMissingFullName);
        if (!form.businessName.trim()) return Alert.alert(t.missingField, t.bizMissingBizName);
        if (!form.taxNumber.trim()) return Alert.alert(t.missingField, t.bizMissingTaxNo);
        if (!form.username.trim()) return Alert.alert(t.missingField, t.bizMissingUsername);
        if (!form.email.trim()) return Alert.alert(t.missingField, t.bizMissingEmail);
        if (!passwordValid) return Alert.alert(t.error, t.passwordRules);
        if (!agreed) return Alert.alert(t.missingField, t.bizMissingAgree);
        if (!captchaOk) return Alert.alert(t.missingField, t.bizMissingCaptcha);

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
                Alert.alert('Dev', `Code: ${res.data.devCode}`, [{ text: 'OK' }]);
            }
            setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 300);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.otpSendFailed);
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async () => {
        if (otp.length !== 6) return Alert.alert(t.error, t.otpSixDigits);
        setLoading(true);
        try {
            await api.post('/auth/verify-otp', { method: 'email', value: form.email.trim(), code: otp });

            const { data } = await api.post('/auth/register', {
                username: form.username.trim(),
                password: form.password,
                fullName: form.fullName.trim(),
                email: form.email.trim(),
                phone: fullMobilePhone || fullWorkPhone || undefined,
                city: form.city || undefined,
                isBusiness: true,
                businessName: form.businessName.trim(),
                taxNumber: form.taxNumber.trim(),
                businessAddress: form.businessAddress.trim() || undefined,
            });
            dispatch(setCredentials({ user: data.user, token: data.token }));
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.bizRegisterFailed);
        } finally {
            setLoading(false);
        }
    };

    const selectDial = (item) => {
        if (dialPickerTarget === 'work') setWorkDialCode(item);
        else setMobileDialCode(item);
        setDialPickerTarget(null);
    };

    return (
        <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>

            {/* Ülke Kodu Seçici Modal */}
            <Modal visible={!!dialPickerTarget} transparent animationType="slide" onRequestClose={() => setDialPickerTarget(null)}>
                <View style={s.pickerOverlay}>
                    <View style={s.pickerBox}>
                        <View style={s.pickerHeader}>
                            <Text style={s.pickerTitle}>{t.dialCodeLabel}</Text>
                            <TouchableOpacity onPress={() => setDialPickerTarget(null)}>
                                <Text style={s.pickerClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <FlatList
                            data={DIAL_CODES}
                            keyExtractor={i => i.dial + i.name}
                            renderItem={({ item }) => (
                                <TouchableOpacity
                                    style={[s.pickerItem, currentDialCode.dial === item.dial && currentDialCode.name === item.name && s.pickerItemActive]}
                                    onPress={() => selectDial(item)}
                                >
                                    <Text style={{ fontSize: 22, marginRight: 10 }}>{item.flag}</Text>
                                    <Text style={[s.pickerItemText, { flex: 1 }]}>{item.name}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize: 14, fontWeight: '700' }}>{item.dial}</Text>
                                    {currentDialCode.dial === item.dial && currentDialCode.name === item.name && (
                                        <Text style={{ color: '#f59e0b', fontSize: 16, marginLeft: 8 }}>✓</Text>
                                    )}
                                </TouchableOpacity>
                            )}
                        />
                    </View>
                </View>
            </Modal>

            <CityPickerModal
                visible={showCityPicker}
                onClose={() => setShowCityPicker(false)}
                onSelect={v => set('city', v)}
                currentValue={form.city}
            />

            <ScrollView ref={scrollRef} contentContainerStyle={s.inner} keyboardShouldPersistTaps="handled">

                {/* Dil Seçici */}
                <View style={{ flexDirection: 'row', gap: 3, alignSelf: 'flex-end', marginBottom: 16 }}>
                    {['tr', 'en'].map(l => (
                        <TouchableOpacity
                            key={l}
                            onPress={() => dispatch(setLang(l))}
                            style={{
                                borderRadius: 8, paddingHorizontal: 9, paddingVertical: 3,
                                backgroundColor: lang === l ? '#f59e0b30' : colors.surface2,
                            }}
                        >
                            <Text style={{ color: lang === l ? '#fbbf24' : colors.textMuted, fontSize: 12, fontWeight: '800' }}>
                                {l === 'tr' ? '🇹🇷 TR' : '🇬🇧 EN'}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>

                <RainbowLogo style={{ fontSize: 34, marginBottom: 4 }} />
                <Text style={s.sub}>{t.bizRegTitle}</Text>
                <Text style={s.subHint}>{t.bizRegHint}</Text>

                <View style={s.card}>

                    {/* Yetkili Ad Soyad */}
                    <Text style={s.label}>{t.bizAuthFullName}</Text>
                    <TextInput style={s.input} value={form.fullName} onChangeText={v => set('fullName', v)}
                        placeholder={t.bizAuthFullNamePh} placeholderTextColor={colors.textMuted} />

                    {/* İşletme Adı */}
                    <Text style={s.label}>{t.bizNameLabel}</Text>
                    <TextInput style={s.input} value={form.businessName} onChangeText={v => set('businessName', v)}
                        placeholder={t.bizNamePh} placeholderTextColor={colors.textMuted} />

                    {/* Vergi No */}
                    <Text style={s.label}>{t.bizTaxLabel}</Text>
                    <TextInput style={s.input} value={form.taxNumber}
                        onChangeText={v => set('taxNumber', v.replace(/\D/g, '').slice(0, 11))}
                        placeholder={t.bizTaxPh} placeholderTextColor={colors.textMuted}
                        keyboardType="numeric" maxLength={11} />

                    {/* Kullanıcı Adı */}
                    <Text style={s.label}>{t.bizUsernameLabel}</Text>
                    <TextInput style={s.input} value={form.username} onChangeText={v => set('username', v)}
                        placeholder={t.bizUsernamePh} placeholderTextColor={colors.textMuted} autoCapitalize="none" />

                    {/* E-posta */}
                    <Text style={s.label}>{t.bizEmailLabel}</Text>
                    <TextInput style={s.input} value={form.email} onChangeText={v => set('email', v)}
                        placeholder={t.bizEmailPh} placeholderTextColor={colors.textMuted}
                        keyboardType="email-address" autoCapitalize="none" />

                    {/* İş Telefonu */}
                    <Text style={s.label}>{t.bizWorkPhoneLabel}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                            style={[s.input, s.dialBtn]}
                            onPress={() => setDialPickerTarget('work')}
                        >
                            <Text style={{ fontSize: 18 }}>{workDialCode.flag}</Text>
                            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{workDialCode.dial}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>▾</Text>
                        </TouchableOpacity>
                        <TextInput
                            style={[s.input, { flex: 1 }]}
                            value={form.workPhone}
                            onChangeText={v => set('workPhone', v.replace(/\D/g, ''))}
                            placeholder={t.phonePh}
                            placeholderTextColor={colors.textMuted}
                            keyboardType="phone-pad"
                        />
                    </View>

                    {/* Cep Telefonu */}
                    <Text style={s.label}>{t.bizMobilePhoneLabel}</Text>
                    <View style={{ flexDirection: 'row', gap: 6 }}>
                        <TouchableOpacity
                            style={[s.input, s.dialBtn]}
                            onPress={() => setDialPickerTarget('mobile')}
                        >
                            <Text style={{ fontSize: 18 }}>{mobileDialCode.flag}</Text>
                            <Text style={{ color: colors.text, fontSize: 13, fontWeight: '700' }}>{mobileDialCode.dial}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 11 }}>▾</Text>
                        </TouchableOpacity>
                        <TextInput
                            style={[s.input, { flex: 1 }]}
                            value={form.mobilePhone}
                            onChangeText={v => set('mobilePhone', v.replace(/\D/g, ''))}
                            placeholder={t.phonePh}
                            placeholderTextColor={colors.textMuted}
                            keyboardType="phone-pad"
                        />
                    </View>

                    {/* Şehir */}
                    <Text style={s.label}>{t.bizCityLabel}</Text>
                    <TouchableOpacity style={[s.input, s.selectBtn]} onPress={() => setShowCityPicker(true)}>
                        <Text style={form.city ? s.selectText : s.selectPh}>
                            {form.city || t.selectCity}
                        </Text>
                        <Text style={{ color: colors.textMuted, fontSize: 16 }}>▾</Text>
                    </TouchableOpacity>

                    {/* İşletme Adresi */}
                    <Text style={s.label}>{t.bizAddressLabel}</Text>
                    <TextInput
                        style={[s.input, { height: 72, textAlignVertical: 'top', paddingTop: 7 }]}
                        value={form.businessAddress}
                        onChangeText={v => set('businessAddress', v)}
                        placeholder={t.bizAddressPh}
                        placeholderTextColor={colors.textMuted}
                        multiline
                    />

                    {/* Şifre */}
                    <Text style={s.label}>{t.bizPasswordLabel}</Text>
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
                            {PASSWORD_TESTS.map(r => (
                                <Text key={r.id} style={r.test(form.password) ? s.ruleOk : s.ruleFail}>
                                    {r.test(form.password) ? '✓' : '✗'} {t[r.key]}
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
                        <Text style={s.checkLabel}>{t.bizAgreeLabel}</Text>
                    </TouchableOpacity>

                    {/* Captcha */}
                    <View style={[s.captchaBox, captchaOk && { borderColor: '#4ade80' }, captchaErr && { borderColor: '#f87171' }]}>
                        <View style={s.captchaLeft}>
                            <Text style={{ fontSize: 26 }}>{captchaOk ? '✅' : '🤖'}</Text>
                            <View>
                                <Text style={{ color: '#fff', fontWeight: '800', fontSize: 12 }}>{t.bizNotRobot}</Text>
                                {captchaOk
                                    ? <Text style={{ color: '#4ade80', fontWeight: '800', fontSize: 13 }}>{t.bizVerified}</Text>
                                    : <Text style={[{ color: '#f59e0b', fontWeight: '900', fontSize: 18, marginTop: 2 }, captchaErr && { color: '#f87171' }]}>{captcha.q} = ?</Text>
                                }
                                {captchaErr && <Text style={{ color: '#f87171', fontSize: 10, marginTop: 2 }}>{t.bizCaptchaWrong}</Text>}
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
                                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 11 }}>{t.doVerify}</Text>
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
                            : <Text style={s.btnText}>{otpSent ? t.bizCodeSentLabel : t.bizSendCode}</Text>}
                    </TouchableOpacity>

                    {/* OTP Kutusu */}
                    {otpSent && (
                        <View style={s.otpBox}>
                            <Text style={s.otpInfo}>{t.bizCodeSentTo(form.email)}</Text>
                            <Text style={s.label}>{t.bizOtpLabel}</Text>
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
                                    : <Text style={s.btnText}>{t.bizCreateBtn}</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity
                                onPress={timer === 0 ? () => { setOtpSent(false); setTimeout(handleSendOtp, 100); } : undefined}
                                style={[{ marginTop: 12, alignItems: 'center' }, timer > 0 && { opacity: 0.4 }]}
                                disabled={timer > 0}
                            >
                                <Text style={{ color: colors.purpleLight, fontWeight: '700', fontSize: 13 }}>
                                    {timer > 0 ? t.resendTimer(timer) : t.resendCode}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    <TouchableOpacity onPress={() => navigation.navigate('Login')} style={{ marginTop: 16, alignItems: 'center' }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 13 }}>
                            {t.bizHaveAccount} <Text style={{ color: colors.purpleLight, fontWeight: '700' }}>{t.signIn}</Text>
                        </Text>
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => navigation.navigate('Register')} style={{ marginTop: 8, alignItems: 'center' }}>
                        <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                            {t.bizIndividualReg}<Text style={{ color: colors.purpleLight, fontWeight: '700' }}>{t.bizIndividualRegLink}</Text>
                        </Text>
                    </TouchableOpacity>
                </View>
            </ScrollView>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    inner: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: 17, paddingVertical: 37 },
    sub: { fontSize: 18, color: '#fbbf24', textAlign: 'center', marginBottom: 2, fontWeight: '800' },
    subHint: { fontSize: 12, color: colors.textMuted, textAlign: 'center', marginBottom: 20 },
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 15, borderWidth: 1, borderColor: '#f59e0b40' },

    label: { color: colors.textSecondary, fontSize: 10, fontWeight: '800', marginBottom: 5, marginTop: 12, textTransform: 'uppercase', letterSpacing: 0.6 },
    input: { backgroundColor: colors.surface2, color: colors.text, borderRadius: 12, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, fontSize: 14 },

    dialBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, minWidth: 80 },

    selectBtn: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
    selectText: { color: colors.text, fontSize: 14 },
    selectPh: { color: colors.textMuted, fontSize: 14 },

    passRow: { flexDirection: 'row' },
    eyeBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderLeftWidth: 0, borderTopRightRadius: 12, borderBottomRightRadius: 12, paddingHorizontal: 11, justifyContent: 'center' },
    rulesBox: { marginTop: 6, gap: 3 },
    ruleOk: { color: '#4ade80', fontSize: 11, fontWeight: '600' },
    ruleFail: { color: '#f87171', fontSize: 11, fontWeight: '600' },

    divider: { height: 1, backgroundColor: colors.border, marginVertical: 16 },

    checkRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 3, marginBottom: 10 },
    checkbox: { width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: colors.border, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center', marginTop: 1, flexShrink: 0 },
    checkboxChecked: { backgroundColor: '#f59e0b', borderColor: '#f59e0b' },
    checkmark: { color: '#fff', fontSize: 12, fontWeight: '900' },
    checkLabel: { color: colors.textSecondary, fontSize: 12, lineHeight: 18, flex: 1 },

    captchaBox: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface2, borderRadius: 14, padding: 11, borderWidth: 1, borderColor: colors.border, marginTop: 4, marginBottom: 4 },
    captchaLeft: { flexDirection: 'row', alignItems: 'center', gap: 3, flex: 1 },
    captchaRight: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    captchaBtn: { backgroundColor: '#f59e0b', borderRadius: 10, paddingHorizontal: 7, paddingVertical: 5 },

    btn: { borderRadius: 14, paddingVertical: 11, alignItems: 'center', marginTop: 18 },
    bizBtn: { backgroundColor: '#d97706' },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 15 },

    otpBox: { marginTop: 16, backgroundColor: colors.surface2, borderRadius: 16, padding: 13, borderWidth: 1, borderColor: '#f59e0b50' },
    otpInfo: { color: colors.textSecondary, fontSize: 13, lineHeight: 20, marginBottom: 4, textAlign: 'center' },

    // Picker modal
    pickerOverlay: { flex: 1, backgroundColor: '#00000088', justifyContent: 'flex-end' },
    pickerBox: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingBottom: 27 },
    pickerHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: 15, borderBottomWidth: 1, borderColor: colors.border },
    pickerTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
    pickerClose: { color: colors.textMuted, fontSize: 18, fontWeight: '700' },
    pickerItem: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, paddingVertical: 11, borderBottomWidth: 1, borderColor: colors.border + '44' },
    pickerItemActive: { backgroundColor: '#f59e0b18' },
    pickerItemText: { color: colors.text, fontSize: 15 },
});
