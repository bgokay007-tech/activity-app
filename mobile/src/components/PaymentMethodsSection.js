import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import api from '../services/api';
import useT from '../hooks/useT';
import colors from '../theme/colors';

const CODE_KEY = {
    CARD_HOLDER: 'payCardHolderInvalid',
    CARD_INVALID: 'payCardInvalid',
    CARD_EXPIRY: 'payCardExpiryInvalid',
    CARD_EXPIRED: 'payCardExpired',
    CARD_DUPLICATE: 'payCardDuplicate',
    CARD_LIMIT: 'payCardLimit',
    CARD_NOT_FOUND: 'payCardNotFound',
};

const BRAND = { VISA: 'Visa', MASTERCARD: 'Mastercard', AMEX: 'Amex', TROY: 'Troy' };

function formatPan(value) {
    const d = String(value || '').replace(/\D/g, '').slice(0, 19);
    return d.replace(/(\d{4})(?=\d)/g, '$1 ');
}

function formatExp(value) {
    const d = String(value || '').replace(/\D/g, '').slice(0, 4);
    if (d.length <= 2) return d;
    return `${d.slice(0, 2)}/${d.slice(2)}`;
}

export default function PaymentMethodsSection({ active }) {
    const t = useT();
    const [cards, setCards] = useState([]);
    const [loading, setLoading] = useState(false);
    const [adding, setAdding] = useState(false);
    const [saving, setSaving] = useState(false);
    const [holder, setHolder] = useState('');
    const [number, setNumber] = useState('');
    const [expiry, setExpiry] = useState('');

    const load = () => {
        setLoading(true);
        api.get('/payment-methods')
            .then(r => setCards(Array.isArray(r.data) ? r.data : []))
            .catch(() => {})
            .finally(() => setLoading(false));
    };

    useEffect(() => {
        if (!active) return undefined;
        load();
        return undefined;
    }, [active]);

    const fail = (e) => {
        const key = CODE_KEY[e?.response?.data?.code];
        Alert.alert(t.error, key ? t[key] : (e?.response?.data?.message || t.error));
    };

    const resetForm = () => {
        setHolder('');
        setNumber('');
        setExpiry('');
        setAdding(false);
    };

    const save = async () => {
        const parts = expiry.split('/');
        if (parts.length !== 2 || parts[0].length !== 2 || parts[1].length !== 2) {
            Alert.alert(t.error, t.payCardExpiryInvalid);
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.post('/payment-methods', {
                holderName: holder.trim(),
                cardNumber: number.replace(/\s/g, ''),
                expiryMonth: Number(parts[0]),
                expiryYear: Number(parts[1]),
            });
            setCards(prev => {
                const next = data.isDefault ? prev.map(c => ({ ...c, isDefault: false })) : prev;
                return [data, ...next.filter(c => c.id !== data.id)];
            });
            resetForm();
            Alert.alert('', t.payCardSaved);
        } catch (e) {
            fail(e);
        } finally {
            setSaving(false);
        }
    };

    const makeDefault = async (id) => {
        try {
            const { data } = await api.patch(`/payment-methods/${id}/default`);
            setCards(Array.isArray(data) ? data : []);
        } catch (e) { fail(e); }
    };

    const remove = (id) => {
        Alert.alert(t.payCardDeleteTitle, t.payCardDeleteConfirm, [
            { text: t.payCardCancel, style: 'cancel' },
            {
                text: t.payCardDelete,
                style: 'destructive',
                onPress: async () => {
                    try {
                        const { data } = await api.delete(`/payment-methods/${id}`);
                        setCards(Array.isArray(data) ? data : []);
                    } catch (e) { fail(e); }
                },
            },
        ]);
    };

    return (
        <View style={{ marginTop: 8 }}>
            <View style={{ height: 1, backgroundColor: colors.border, marginBottom: 14 }} />
            <Text style={{ color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 6 }}>💳 {t.payMethodsTitle}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, lineHeight: 16, marginBottom: 12 }}>{t.payMethodsHint}</Text>
            {loading && cards.length === 0 ? <ActivityIndicator color={colors.purple} style={{ marginBottom: 12 }} /> : null}
            {!loading && cards.length === 0 && !adding ? (
                <Text style={{ color: colors.textMuted, fontSize: 13, marginBottom: 10 }}>{t.payCardEmpty}</Text>
            ) : null}
            {cards.map(card => (
                <View key={card.id} style={{ backgroundColor: colors.surface2, borderRadius: 12, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: colors.border }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 14, flex: 1 }} numberOfLines={1}>
                            {BRAND[card.brand] ? `${BRAND[card.brand]}  ` : ''}•••• {card.last4}
                        </Text>
                        {card.isDefault ? (
                            <Text style={{ color: '#a78bfa', fontSize: 11, fontWeight: '800' }}>{t.payCardDefault}</Text>
                        ) : null}
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }} numberOfLines={1}>{card.holderName}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
                        {String(card.expiryMonth).padStart(2, '0')}/{String(card.expiryYear).slice(-2)}
                    </Text>
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                        {!card.isDefault ? (
                            <TouchableOpacity onPress={() => makeDefault(card.id)} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
                                <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: '700' }}>{t.payCardMakeDefault}</Text>
                            </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity onPress={() => remove(card.id)} style={{ paddingVertical: 6, paddingHorizontal: 8 }}>
                            <Text style={{ color: '#f87171', fontSize: 12, fontWeight: '700' }}>{t.payCardDelete}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            ))}
            {adding ? (
                <View style={{ marginTop: 4 }}>
                    <Text style={label}>{t.payCardHolder}</Text>
                    <TextInput
                        style={input}
                        value={holder}
                        onChangeText={setHolder}
                        placeholder={t.payCardHolderPh}
                        placeholderTextColor={colors.textMuted}
                        autoCapitalize="words"
                        autoCorrect={false}
                    />
                    <Text style={label}>{t.payCardNumber}</Text>
                    <TextInput
                        style={input}
                        value={number}
                        onChangeText={v => setNumber(formatPan(v))}
                        placeholder={t.payCardNumberPh}
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                    />
                    <Text style={label}>{t.payCardExpiry}</Text>
                    <TextInput
                        style={input}
                        value={expiry}
                        onChangeText={v => setExpiry(formatExp(v))}
                        placeholder={t.payCardExpiryPh}
                        placeholderTextColor={colors.textMuted}
                        keyboardType="number-pad"
                        maxLength={5}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity onPress={resetForm} style={[btn, { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }]}>
                            <Text style={{ color: '#fff', fontWeight: '700' }}>{t.payCardCancel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={save} disabled={saving} style={[btn, { backgroundColor: colors.purple, flex: 1 }]}>
                            {saving ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#fff', fontWeight: '800' }}>{t.payCardSave}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            ) : (
                <TouchableOpacity onPress={() => setAdding(true)} style={[btn, { backgroundColor: '#7c3aed20', borderWidth: 1, borderColor: '#7c3aed50', marginTop: 4 }]}>
                    <Text style={{ color: '#a78bfa', fontWeight: '800' }}>+ {t.payAddCard}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

const label = { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 6 };
const input = {
    backgroundColor: colors.surface2, color: '#fff', borderRadius: 12,
    paddingHorizontal: 11, paddingVertical: 9, fontSize: 14, marginBottom: 12,
};
const btn = { borderRadius: 12, paddingVertical: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' };
