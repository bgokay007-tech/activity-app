import { useState, useEffect } from 'react';
import {
    Modal, View, Text, TextInput, FlatList,
    TouchableOpacity, StyleSheet, ActivityIndicator,
} from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';

const TR_PROVINCES = [
    'Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya',
    'Ardahan','Artvin','Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik',
    'Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum',
    'Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir',
    'Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul',
    'İzmir','Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kilis',
    'Kırıkkale','Kırklareli','Kırşehir','Kocaeli','Konya','Kütahya','Malatya','Manisa',
    'Mardin','Mersin','Muğla','Muş','Nevşehir','Niğde','Ordu','Osmaniye','Rize',
    'Sakarya','Samsun','Siirt','Sinop','Sivas','Şanlıurfa','Şırnak','Tekirdağ',
    'Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak',
];

const LOCAL_LIST = TR_PROVINCES.map(p => ({ label: p, value: p }));

export default function CityPickerModal({ visible, onClose, onSelect, currentValue, onNearMe, nearMeLoading }) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState(LOCAL_LIST);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setQuery('');
        setResults(LOCAL_LIST);
    }, [visible]);

    useEffect(() => {
        const q = query.trim();
        if (!q) { setResults(LOCAL_LIST); return; }

        const timer = setTimeout(async () => {
            setLoading(true);
            try {
                const r = await api.get(`/cities?q=${encodeURIComponent(q)}`);
                if (r.data.length > 0) {
                    setResults(r.data.map(c => ({
                        label: c.district ? `${c.province} / ${c.district}` : c.province,
                        value: c.district ? `${c.province} / ${c.district}` : c.province,
                    })));
                } else {
                    const ql = q.toLowerCase();
                    setResults(LOCAL_LIST.filter(c => c.label.toLowerCase().includes(ql)));
                }
            } catch {
                const ql = q.toLowerCase();
                setResults(LOCAL_LIST.filter(c => c.label.toLowerCase().includes(ql)));
            } finally {
                setLoading(false);
            }
        }, 300);
        return () => clearTimeout(timer);
    }, [query]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.sheet}>
                    <View style={s.header}>
                        <Text style={s.title}>Şehir Seç</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Text style={s.closeBtn}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={s.search}
                        value={query}
                        onChangeText={setQuery}
                        placeholder="İl veya ilçe ara..."
                        placeholderTextColor={colors.textMuted}
                        autoFocus
                    />
                    {loading && <ActivityIndicator size="small" color={colors.purple} style={{ marginVertical: 6 }} />}
                    <FlatList
                        data={results}
                        keyExtractor={(item, i) => `${item.value}-${i}`}
                        keyboardShouldPersistTaps="handled"
                        ListHeaderComponent={onNearMe && !query.trim() ? (
                            <TouchableOpacity
                                style={s.item}
                                onPress={onNearMe}
                                disabled={nearMeLoading}
                            >
                                <Text style={[s.itemText, { color: colors.purple, fontWeight: '700' }]}>📡 Yakınımdaki</Text>
                                {nearMeLoading && <ActivityIndicator size="small" color={colors.purple} />}
                            </TouchableOpacity>
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
});
