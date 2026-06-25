import { useState, useRef } from 'react';
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, StyleSheet } from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';

export default function CityAutocomplete({ value, onChangeText, onSelect, placeholder, style, inputStyle }) {
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const timer = useRef(null);

    const search = (text) => {
        onChangeText(text);
        setResults([]);
        if (text.length < 2) return;
        clearTimeout(timer.current);
        timer.current = setTimeout(async () => {
            setLoading(true);
            try {
                const { data } = await api.get('/cities', { params: { q: text } });
                setResults(Array.isArray(data) ? data : []);
            } catch { setResults([]); }
            finally { setLoading(false); }
        }, 300);
    };

    const select = (city) => {
        const label = city.district ? `${city.district}, ${city.province}` : city.province;
        onChangeText(label);
        if (onSelect) onSelect(city);
        setResults([]);
    };

    return (
        <View style={[s.wrapper, style]}>
            <View style={s.inputRow}>
                <TextInput
                    style={[s.input, inputStyle]}
                    value={value}
                    onChangeText={search}
                    placeholder={placeholder || 'İl / İlçe ara...'}
                    placeholderTextColor={colors.textMuted}
                />
                {loading && <ActivityIndicator size="small" color={colors.purple} style={{ position:'absolute', right:10 }} />}
            </View>
            {results.length > 0 && (
                <View style={s.dropdown}>
                    {results.map((c, i) => (
                        <TouchableOpacity key={c.id || i} onPress={() => select(c)} style={[s.row, i === results.length - 1 && { borderBottomWidth: 0 }]}>
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
    inputRow: { position: 'relative' },
    input: { backgroundColor: colors.surface2, color: colors.text, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border, fontSize: 13 },
    dropdown: { position: 'absolute', top: '100%', left: 0, right: 0, backgroundColor: colors.surface, borderRadius: 8, borderWidth: 1, borderColor: colors.border, zIndex: 200, elevation: 10, shadowColor: '#000', shadowOpacity: 0.3, shadowRadius: 8, marginTop: 2 },
    row: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border },
    rowText: { fontSize: 13 },
});
