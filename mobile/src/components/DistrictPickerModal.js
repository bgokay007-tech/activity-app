import { useState, useEffect } from 'react';
import {
    Modal, View, Text, TextInput, FlatList,
    TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';

// `CityPickerModal`'ın ilçe sürümü — sabit bir liste yok (ilçeler sabit/eksiksiz
// bir veri seti değil), sadece seçilen `province`'a bağlı `GET /cities?q=&province=`
// canlı araması var. Hiç eşleşme yoksa yazılan metin "olarak ekle" satırıyla
// doğrudan seçilebilir (yeni ilçe, ilan gönderilirken PENDING olarak `POST /cities`
// ile kaydedilip admin onayına gider — mevcut il/ilçe crowd-source akışıyla aynı).
export default function DistrictPickerModal({ visible, onClose, onSelect, currentValue, province }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setQuery('');
        setResults([]);
    }, [visible]);

    useEffect(() => {
        if (!province) return;
        const q = query.trim();
        setLoading(true);
        const timer = setTimeout(async () => {
            try {
                const r = await api.get('/cities', { params: { q, province } });
                setResults((r.data || []).filter(c => c.district).map(c => ({ label: c.district, value: c.district })));
            } catch {
                setResults([]);
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query, province]);

    const trimmedQuery = query.trim();
    const exactMatch = results.some(r => r.value.toLowerCase() === trimmedQuery.toLowerCase());

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.sheet}>
                    <View style={s.header}>
                        <Text style={s.title}>İlçe Seç</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Text style={s.closeBtn}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={s.search}
                        value={query}
                        onChangeText={setQuery}
                        placeholder="İlçe ara..."
                        placeholderTextColor={colors.textMuted}
                        autoFocus
                    />
                    {loading && <ActivityIndicator size="small" color={colors.purple} style={{ marginVertical: 6 }} />}
                    <FlatList
                        data={results}
                        keyExtractor={(item, i) => `${item.value}-${i}`}
                        keyboardShouldPersistTaps="handled"
                        ListHeaderComponent={trimmedQuery && !exactMatch ? (
                            <TouchableOpacity style={s.item} onPress={() => { onSelect(trimmedQuery); onClose(); }}>
                                <Text style={[s.itemText, { color: colors.purple, fontWeight: '700' }]}>＋ "{trimmedQuery}" olarak ekle</Text>
                            </TouchableOpacity>
                        ) : null}
                        ListEmptyComponent={!loading && !trimmedQuery ? (
                            <Text style={s.emptyText}>İlçe adını yazmaya başla...</Text>
                        ) : null}
                        renderItem={({ item }) => {
                            const active = currentValue === item.value;
                            return (
                                <TouchableOpacity
                                    style={[s.item, active && s.itemActive]}
                                    onPress={() => { onSelect(item.value); onClose(); }}
                                >
                                    <Text style={[s.itemText, active && s.itemTextActive]}>{item.label}</Text>
                                    {active && <Text style={{ color: colors.purple, fontSize: 16 }}>✓</Text>}
                                </TouchableOpacity>
                            );
                        }}
                    />
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        maxHeight: '80%',
        paddingBottom: 21,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 13,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    title: { color: colors.text, fontSize: 16, fontWeight: '700' },
    closeBtn: { color: colors.textMuted, fontSize: 20 },
    search: {
        margin: 12,
        backgroundColor: colors.surface2,
        borderRadius: 10,
        paddingHorizontal: 11,
        paddingVertical: 7,
        color: colors.text,
        fontSize: 15,
    },
    item: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 13,
        paddingVertical: 10,
        borderBottomWidth: 1,
        borderBottomColor: colors.border + '40',
    },
    itemActive: { backgroundColor: colors.purple + '18' },
    itemText: { color: colors.text, fontSize: 15 },
    itemTextActive: { color: colors.purple, fontWeight: '600' },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', padding: 20 },
});
