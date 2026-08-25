import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';

// CityAutocomplete'in çoklu seçimli hali — antrenörlük başvurusunda tek bir konum yerine
// bir/birden fazla şehir zorunlu tutulabilsin diye (kullanıcı isteği). Seçilen şehirler
// üstte çip olarak listelenir, aramadan seçilince listeye eklenir, çipteki ✕ ile çıkarılır.
export default function MultiCityAutocomplete({ values, onChange, placeholder, style }) {
    const [text, setText] = useState('');
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef(null);

    const search = (v) => {
        setText(v);
        setResults([]);
        if (v.length < 2) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await api.get('/cities', { params: { q: v } });
                setResults(Array.isArray(data) ? data : []);
            } catch { setResults([]); }
            finally { setLoading(false); }
        }, 300);
    };

    const add = (city) => {
        const label = city.district ? `${city.district}, ${city.province}` : city.province;
        if (!values.includes(label)) onChange([...values, label]);
        setText('');
        setResults([]);
    };

    const remove = (label) => onChange(values.filter(v => v !== label));

    return (
        <View style={[s.wrapper, style]}>
            {values.length > 0 && (
                <View style={s.chipRow}>
                    {values.map(v => (
                        <View key={v} style={s.chip}>
                            <Text style={s.chipText} numberOfLines={1}>{v}</Text>
                            <TouchableOpacity onPress={() => remove(v)} hitSlop={{ top:6, bottom:6, left:6, right:6 }}>
                                <Text style={s.chipRemove}>✕</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>
            )}
            <View style={s.inputRow}>
                <TextInput
                    style={s.input}
                    value={text}
                    onChangeText={search}
                    placeholder={placeholder || 'Şehir ekle...'}
                    placeholderTextColor={colors.textMuted}
                />
                {loading && <ActivityIndicator size="small" color={colors.purple} style={{ position:'absolute', right:10 }} />}
            </View>
            {/* results.length'e bağlı, klavye focus/blur'una bağlı DEĞİL — Android'de bazı
                cihazlarda klavye açıkken önerilere dokunmak işlemiyordu, bu sınıf sorunları
                kökten önlemek için görünürlük text/results state'ine bağlandı (bkz.
                TeamSlotInviteField'daki aynı düzeltme, SubCategoryScreen.js). */}
            {results.length > 0 && (
                <View style={s.dropdown}>
                    {results.map((c, i) => (
                        <TouchableOpacity key={c.id || i} onPressIn={() => add(c)} style={[s.row, i === results.length - 1 && { borderBottomWidth: 0 }]}>
                            <Text style={s.rowText}>
                                {c.district ? <><Text style={{ color: colors.text }}>{c.district}</Text><Text style={{ color: colors.textMuted }}>, {c.province}</Text></> : <Text style={{ color: colors.text }}>{c.province}</Text>}
                            </Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    wrapper: { position: 'relative', zIndex: 100 },
    chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginBottom: 5 },
    chip: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.surface2, borderRadius: 8, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 7, paddingVertical: 3, maxWidth: '100%' },
    chipText: { color: colors.text, fontSize: 12, fontWeight: '700', maxWidth: 140 },
    chipRemove: { color: colors.textMuted, fontSize: 12, fontWeight: '900' },
    inputRow: { position: 'relative' },
    input: { backgroundColor: colors.surface2, color: colors.text, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 5, borderWidth: 1, borderColor: colors.border, fontSize: 13 },
    dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, zIndex: 200, elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, marginTop: 2 },
    row: { paddingHorizontal: 9, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowText: { fontSize: 13 },
});
