import { useEffect, useState } from 'react';
import {
    View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
    ActivityIndicator, Alert, StyleSheet,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import api from '../services/api';
import useT from '../hooks/useT';

const MENU_CAT = {
    EQUIPMENT: { en: 'Equipment', tr: 'Ekipman', ru: 'Снаряжение', de: 'Ausrüstung' },
    FOOD: { en: 'Food', tr: 'Yiyecek', ru: 'Еда', de: 'Essen' },
    DRINK: { en: 'Drink', tr: 'İçecek', ru: 'Напитки', de: 'Getränke' },
    OTHER: { en: 'Other', tr: 'Diğer', ru: 'Другое', de: 'Sonstiges' },
};

function menuCatLabel(cat, t) {
    const row = MENU_CAT[cat];
    if (!row) return cat;
    const lang = t?.lang || 'tr';
    return row[lang] || row.en || cat;
}

/**
 * Pro+ tesis menü siparişi — rakip ilanı (rivalId) veya turnuva maçı (tournamentMatchId).
 * Menüden seçim + isteğe bağlı not (yazarak).
 */
export default function VenueMenuOrderModal({
    visible, venueId, onClose, onSuccess, rivalId, tournamentMatchId,
}) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(false);
    const [cart, setCart] = useState({});
    const [notes, setNotes] = useState('');
    const [placing, setPlacing] = useState(false);

    useEffect(() => {
        if (!visible || !venueId) return;
        setCart({});
        setNotes('');
        setLoading(true);
        api.get(`/venues/${venueId}/menu`)
            .then(r => setItems(r.data.items || []))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, [visible, venueId]);

    const addItem = (id) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
    const removeItem = (id) => setCart(c => {
        const n = { ...c };
        if (n[id] > 1) n[id] -= 1; else delete n[id];
        return n;
    });
    const totalPrice = items.reduce((s, it) => s + (cart[it.id] || 0) * it.price, 0);
    const cartCount = Object.values(cart).reduce((a, b) => a + b, 0);
    const cats = [...new Set(items.map(i => i.category))];

    const placeOrder = async () => {
        const orderItems = Object.entries(cart)
            .filter(([, q]) => q > 0)
            .map(([id, quantity]) => ({ menuItemId: id, quantity }));
        if (!orderItems.length) return;
        setPlacing(true);
        try {
            await api.post(`/venues/${venueId}/orders`, {
                items: orderItems,
                notes: notes || undefined,
                rivalId: rivalId || undefined,
                tournamentMatchId: tournamentMatchId || undefined,
            });
            Alert.alert(t.sc_0234 || '✅ Sipariş Verildi', t.sc_0235 || 'Siparişiniz işletmeye iletildi.');
            onSuccess?.();
            onClose();
        } catch (e) {
            Alert.alert(t.sc_0014 || 'Hata', e?.response?.data?.message || t.sc_0236 || 'Sipariş verilemedi');
        } finally {
            setPlacing(false);
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={vm.overlay}>
                <View style={vm.sheet}>
                    <View style={vm.header}>
                        <Text style={vm.title}>{t.sc_0237 || 'Menüden Sipariş'}</Text>
                        <TouchableOpacity onPress={onClose} style={vm.closeBtn}>
                            <Text style={vm.closeX}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView
                        style={vm.body}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                    >
                        <View style={{
                            backgroundColor: '#22c55e15', borderRadius: 10, borderWidth: 1,
                            borderColor: '#22c55e40', padding: 10, marginBottom: 14,
                        }}>
                            <Text style={{ color: '#4ade80', fontSize: 12, lineHeight: 17 }}>
                                {t.sc_0238 || 'Sipariş onaylanınca adisyona işlenir ve hazırlanır.'}
                            </Text>
                        </View>
                        {loading && <ActivityIndicator color="#22c55e" style={{ marginVertical: 24 }} />}
                        {!loading && items.length === 0 && (
                            <Text style={vm.emptyTxt}>{t.sc_0239 || 'Menü boş'}</Text>
                        )}
                        {!loading && cats.map(cat => (
                            <View key={cat} style={{ marginBottom: 12 }}>
                                <Text style={vm.catLabel}>{menuCatLabel(cat, t) || cat}</Text>
                                {items.filter(i => i.category === cat && i.available).map(item => (
                                    <View key={item.id} style={vm.itemRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={vm.itemName}>{item.name}</Text>
                                            <Text style={vm.itemPrice}>{item.price} ₺</Text>
                                        </View>
                                        <View style={vm.qtyRow}>
                                            <TouchableOpacity style={vm.qtyBtn} onPress={() => removeItem(item.id)}>
                                                <Text style={vm.qtyBtnTxt}>−</Text>
                                            </TouchableOpacity>
                                            <Text style={vm.qty}>{cart[item.id] || 0}</Text>
                                            <TouchableOpacity style={vm.qtyBtn} onPress={() => addItem(item.id)}>
                                                <Text style={vm.qtyBtnTxt}>＋</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ))}
                        {!loading && items.length > 0 && (
                            <View style={{ marginTop: 8 }}>
                                <Text style={vm.catLabel}>{t.sc_0240 || 'Not'}</Text>
                                <TextInput
                                    style={vm.notesInput}
                                    placeholder={t.sc_0241 || 'İsteğe bağlı not yazın…'}
                                    placeholderTextColor="#555"
                                    value={notes}
                                    onChangeText={setNotes}
                                    multiline
                                />
                            </View>
                        )}
                        <View style={{ height: 20 }} />
                    </ScrollView>
                    {cartCount > 0 && (
                        <View style={[vm.footer, { paddingBottom: Math.max(14, insets.bottom + 10) }]}>
                            <View style={{ flex: 1 }}>
                                <Text style={vm.totalLabel}>{t.sc_0213 || 'Toplam'}</Text>
                                <Text style={vm.totalPrice}>{totalPrice} ₺</Text>
                            </View>
                            <TouchableOpacity style={vm.orderBtn} onPress={placeOrder} disabled={placing}>
                                {placing
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={vm.orderBtnTxt}>{(t.sc_0242 || 'Sipariş Ver (')}{cartCount})</Text>}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const vm = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000b', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: '#12121e',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        height: '85%',
    },
    header: {
        flexDirection: 'row', alignItems: 'center', padding: 16,
        borderBottomWidth: 1, borderBottomColor: '#ffffff12',
    },
    title: { flex: 1, color: '#fff', fontSize: 16, fontWeight: '700' },
    closeBtn: { padding: 4 },
    closeX: { color: '#888', fontSize: 18 },
    body: { padding: 16 },
    emptyTxt: { color: '#555', textAlign: 'center', marginTop: 24, fontSize: 13 },
    catLabel: {
        color: '#888', fontSize: 11, fontWeight: '700', marginBottom: 8,
        letterSpacing: 0.5, textTransform: 'uppercase',
    },
    itemRow: {
        flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff08',
        borderRadius: 10, padding: 12, marginBottom: 8,
    },
    itemName: { color: '#fff', fontSize: 14, fontWeight: '600' },
    itemPrice: { color: '#22c55e', fontSize: 13, marginTop: 2 },
    qtyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
    qtyBtn: {
        width: 30, height: 30, borderRadius: 15, backgroundColor: '#ffffff12',
        alignItems: 'center', justifyContent: 'center',
    },
    qtyBtnTxt: { color: '#fff', fontSize: 18, fontWeight: '700', lineHeight: 20 },
    qty: { color: '#fff', fontSize: 15, fontWeight: '700', minWidth: 20, textAlign: 'center' },
    notesInput: {
        backgroundColor: '#ffffff08', borderRadius: 8, borderWidth: 1,
        borderColor: '#ffffff14', color: '#fff', padding: 10, fontSize: 13, minHeight: 60, marginTop: 4,
    },
    footer: {
        flexDirection: 'row', alignItems: 'center', padding: 14,
        borderTopWidth: 1, borderTopColor: '#ffffff12',
    },
    totalLabel: { color: '#888', fontSize: 11 },
    totalPrice: { color: '#fff', fontSize: 16, fontWeight: '700' },
    orderBtn: {
        backgroundColor: '#22c55e', borderRadius: 10, paddingHorizontal: 18,
        paddingVertical: 12, alignItems: 'center', minWidth: 130,
    },
    orderBtnTxt: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
