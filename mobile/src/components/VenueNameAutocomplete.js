import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';

// `CityAutocomplete`'in mekan-adı sürümü: yazarken sadece ADMİN ONAYLI mekanlar
// öneri olarak çıkar (`verifiedOnly=true`); seçilince il/ilçe/açık adres/konum
// bilgisi otomatik dolsun diye tüm mekan nesnesi `onSelect`'e geri döner.
export default function VenueNameAutocomplete({ value, onChangeText, onSelect, sport, placeholder, style, inputStyle }) {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef(null);

    const search = (text) => {
        onChangeText(text);
        setResults([]);
        if (text.trim().length < 2) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await api.get('/courts/search', { params: { name: text, sport, verifiedOnly: 'true' } });
                setResults((Array.isArray(data) ? data : []).slice(0, 6));
            } catch { setResults([]); }
            finally { setLoading(false); }
        }, 300);
    };

    const select = (court) => {
        onChangeText(court.name);
        onSelect?.(court);
        setResults([]);
    };

    return (
        <View style={[s.wrapper, style]}>
            <View style={s.inputRow}>
                <TextInput
                    style={[s.input, inputStyle]}
                    value={value}
                    onChangeText={search}
                    placeholder={placeholder || 'Mekan adı yaz...'}
                    placeholderTextColor={colors.textMuted}
                />
                {loading && <ActivityIndicator size="small" color={colors.purple} style={{ position: 'absolute', right: 10 }} />}
            </View>
            {results.length > 0 && (
                <View style={s.dropdown}>
                    {results.map((c, i) => (
                        <TouchableOpacity key={c.id || i} onPress={() => select(c)} style={[s.row, i === results.length - 1 && { borderBottomWidth: 0 }]}>
                            <Text style={s.rowName}>{c.name}</Text>
                            <Text style={s.rowMeta}>{[c.district, c.city].filter(Boolean).join(', ')}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    wrapper: { position: 'relative', zIndex: 100 },
    inputRow: { position: 'relative' },
    input: { backgroundColor: colors.surface2, color: colors.text, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, fontSize: 14 },
    dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, zIndex: 200, elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, marginTop: 2 },
    row: { paddingHorizontal: 9, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowName: { color: colors.text, fontSize: 13, fontWeight: '700' },
    rowMeta: { color: colors.textMuted, fontSize: 11, marginTop: 1 },
});
