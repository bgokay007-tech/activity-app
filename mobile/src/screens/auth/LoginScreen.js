import { useState, useEffect } from 'react';
import { View, Text, TextInput, TouchableOpacity, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Alert } from 'react-native';
import { useDispatch } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { setCredentials } from '../../store/slices/authSlice';
import api from '../../services/api';
import colors from '../../theme/colors';
import RainbowLogo from '../../components/RainbowLogo';
import useT from '../../hooks/useT';

const SAVED_EMAIL_KEY = 'activity_saved_email';
const SAVED_PASS_KEY  = 'activity_saved_pass';

export default function LoginScreen({ navigation }) {
    const dispatch = useDispatch();
    const t = useT();
    const [form, setForm] = useState({ email: '', password: '' });
    const [loading, setLoading] = useState(false);
    const [remember, setRemember] = useState(false);

    useEffect(() => {
        Promise.all([
            AsyncStorage.getItem(SAVED_EMAIL_KEY),
            AsyncStorage.getItem(SAVED_PASS_KEY),
        ]).then(([email, password]) => {
            if (email && password) {
                setForm({ email, password });
                setRemember(true);
            }
        });
    }, []);

    const handleLogin = async () => {
        if (!form.email || !form.password) return Alert.alert(t.error, t.fillAll);
        setLoading(true);
        try {
            const { data } = await api.post('/auth/login', form);
            if (remember) {
                await AsyncStorage.setItem(SAVED_EMAIL_KEY, form.email);
                await AsyncStorage.setItem(SAVED_PASS_KEY, form.password);
            } else {
                await AsyncStorage.removeItem(SAVED_EMAIL_KEY);
                await AsyncStorage.removeItem(SAVED_PASS_KEY);
            }
            dispatch(setCredentials({ user: data.user, token: data.token }));
        } catch (e) {
            Alert.alert(t.loginFailed, e?.response?.data?.message || 'Something went wrong');
        } finally {
            setLoading(false);
        }
    };

    return (
        <KeyboardAvoidingView style={s.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
            <View style={s.inner}>
                <RainbowLogo style={{ fontSize: 36, marginBottom: 4 }} />
                <Text style={s.sub}>{t.findYourMatch}</Text>

                <View style={s.card}>
                    <Text style={s.label}>{t.email}</Text>
                    <TextInput
                        style={s.input}
                        value={form.email}
                        onChangeText={v => setForm(f => ({ ...f, email: v }))}
                        placeholder="your@email.com"
                        placeholderTextColor={colors.textMuted}
                        keyboardType="email-address"
                        autoCapitalize="none"
                    />
                    <Text style={s.label}>{t.password}</Text>
                    <TextInput
                        style={s.input}
                        value={form.password}
                        onChangeText={v => setForm(f => ({ ...f, password: v }))}
                        placeholder="••••••••"
                        placeholderTextColor={colors.textMuted}
                        secureTextEntry
                    />

                    {/* Beni Hatırla + Şifremi Unuttum */}
                    <View style={s.row}>
                        <TouchableOpacity style={s.checkRow} onPress={() => setRemember(r => !r)}>
                            <View style={[s.checkbox, remember && s.checkboxChecked]}>
                                {remember && <Text style={s.checkmark}>✓</Text>}
                            </View>
                            <Text style={s.checkLabel}>{t.rememberMe}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => navigation.navigate('ForgotPassword')}>
                            <Text style={s.link}>{t.forgotPassword}</Text>
                        </TouchableOpacity>
                    </View>

                    <TouchableOpacity style={s.btn} onPress={handleLogin} disabled={loading}>
                        {loading ? <ActivityIndicator color="#fff" /> : <Text style={s.btnText}>{t.signIn}</Text>}
                    </TouchableOpacity>

                    <TouchableOpacity onPress={() => navigation.navigate('Register')} style={s.linkRow}>
                        <Text style={s.linkText}>{t.noAccount} <Text style={s.link}>{t.signUp}</Text></Text>
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
    label: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 6, marginTop: 12 },
    input: { backgroundColor: colors.surface2, color: colors.text, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border, fontSize: 14 },
    row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 14 },
    checkRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    checkbox: { width: 20, height: 20, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: colors.purple, borderColor: colors.purple },
    checkmark: { color: '#fff', fontSize: 12, fontWeight: '800' },
    checkLabel: { color: colors.textSecondary, fontSize: 13 },
    btn: { backgroundColor: colors.purple, borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginTop: 20 },
    btnText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    linkRow: { marginTop: 16, alignItems: 'center' },
    linkText: { color: colors.textSecondary, fontSize: 13 },
    link: { color: colors.purpleLight, fontWeight: '700', fontSize: 13 },
});
