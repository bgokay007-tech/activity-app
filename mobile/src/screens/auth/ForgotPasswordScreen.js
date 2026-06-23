import { useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import api from '../../services/api';
import colors from '../../theme/colors';
import RainbowLogo from '../../components/RainbowLogo';
import useT from '../../hooks/useT';

export default function ForgotPasswordScreen({ navigation }) {
    const t = useT();
    const [step, setStep] = useState(1); // 1: email, 2: otp, 3: new password
    const [email, setEmail] = useState('');
    const [code, setCode] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);

    const sendCode = async () => {
        if (!email.trim()) return Alert.alert(t.error, t.fillAll);
        setLoading(true);
        try {
            await api.post('/auth/forgot-password', { email: email.trim().toLowerCase() });
            Alert.alert('', t.fpCodeSent(email.trim()));
            setStep(2);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || 'Bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    const verifyCode = () => {
        if (!code.trim()) return Alert.alert(t.error, t.fillAll);
        setStep(3);
    };

    const resetPassword = async () => {
        if (!newPassword || !confirmPassword) return Alert.alert(t.error, t.fillAll);
        if (newPassword !== confirmPassword) return Alert.alert(t.error, t.fpPassMismatch);
        setLoading(true);
        try {
            await api.post('/auth/reset-password', {
                email: email.trim().toLowerCase(),
                code: code.trim(),
                newPassword,
            });
            Alert.alert('', t.fpSuccess, [{ text: 'OK', onPress: () => navigation.navigate('Login') }]);
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || 'Bir hata oluştu');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.inner}>
                <RainbowLogo style={{ fontSize: 36, marginBottom: 4 }} />
                <Text style={s.sub}>{t.fpTitle}</Text>

                <View style={s.card}>
                    {/* Adım göstergesi */}
                    <View style={s.steps}>
                        {[1, 2, 3].map(n => (
                            <View key={n} style={[s.stepDot, step >= n && s.stepDotActive]}>
                                <Text style={[s.stepNum, step >= n && s.stepNumActive]}>{n}</Text>
                            </View>
                        ))}
                    </View>

                    {step === 1 && (
                        <>
                            <Text style={s.label}>{t.fpEmailLabel}</Text>
                            <TextInput
                                style={s.input}
                                value={email}
                                onChangeText={setEmail}
                                placeholder="your@email.com"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="email-address"
                                autoCapitalize="none"
                            />
                            <TouchableOpacity style={s.btn} onPress={sendCode} disabled={loading}>
                                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{t.fpSendCode}</Text>}
                            </TouchableOpacity>
                        </>
                    )}

                    {step === 2 && (
                        <>
                            <Text style={s.hint}>{t.fpCodeSent(email)}</Text>
                            <Text style={s.label}>{t.fpCodeLabel}</Text>
                            <TextInput
                                style={[s.input, s.codeInput]}
                                value={code}
                                onChangeText={setCode}
                                placeholder={t.fpCodePh}
                                placeholderTextColor={colors.textMuted}
                                keyboardType="number-pad"
                                maxLength={6}
                            />
                            <TouchableOpacity style={s.btn} onPress={verifyCode} disabled={loading}>
                                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{t.fpVerify}</Text>}
                            </TouchableOpacity>
                            <TouchableOpacity onPress={sendCode} style={s.linkRow}>
                                <Text style={s.link}>{t.fpResend}</Text>
                            </TouchableOpacity>
                        </>
                    )}

                    {step === 3 && (
                        <>
                            <Text style={s.label}>{t.fpNewPass}</Text>
                            <TextInput
                                style={s.input}
                                value={newPassword}
                                onChangeText={setNewPassword}
                                placeholder={t.fpNewPassPh}
                                placeholderTextColor={colors.textMuted}
                                secureTextEntry
                            />
                            <Text style={s.label}>{t.fpConfirmPass}</Text>
                            <TextInput
                                style={s.input}
                                value={confirmPassword}
                                onChangeText={setConfirmPassword}
                                placeholder="••••••••"
                                placeholderTextColor={colors.textMuted}
                                secureTextEntry
                            />
                            <TouchableOpacity style={s.btn} onPress={resetPassword} disabled={loading}>
                                {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{t.fpReset}</Text>}
                            </TouchableOpacity>
                        </>
                    )}

                    <TouchableOpacity onPress={() => navigation.navigate('Login')} style={s.linkRow}>
                        <Text style={s.linkText}>{t.fpBackToLogin}</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </KeyboardAvoidingView>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    inner: { flex: 1, justifyContent: 'center', paddingHorizontal: 24 },
    sub: { fontSize: 14, color: colors.textSecondary, textAlign: 'center', marginBottom: 32 },
    card: { backgroundColor: colors.surface, borderRadius: 20, padding: 24, borderWidth: 1, borderColor: colors.border },
    steps: { flexDirection: 'row', justifyContent: 'center', gap: 12, marginBottom: 20 },
    stepDot: { width: 32, height: 32, borderRadius: 16, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    stepDotActive: { borderColor: colors.purple, backgroundColor: colors.purple + '20' },
    stepNum: { color: colors.textMuted, fontWeight: '700', fontSize: 13 },
    stepNumActive: { color: colors.purple },
    label: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
    hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', marginBottom: 4, marginTop: 4 },
    input: { backgroundColor: colors.surface2, color: colors.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, fontSize: 14 },
    codeInput: { fontSize: 22, fontWeight: '800', textAlign: 'center', letterSpacing: 10 },
    btn: { backgroundColor: colors.purple, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    linkRow: { marginTop: 16, alignItems: 'center' },
    linkText: { color: colors.textSecondary, fontSize: 13 },
    link: { color: colors.purpleLight, fontWeight: '700', fontSize: 13 },
});
