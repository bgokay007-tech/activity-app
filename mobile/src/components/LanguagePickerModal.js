import { useState, useEffect, useRef } from 'react';
import {
    Modal, View, Text, TextInput, FlatList, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform, Animated,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import { LANGUAGES } from '../utils/languages';

const GRID_COLUMNS = 3; // 3 sütun × 9 satır = 27 dil kapasitesi, ileride eklendikçe dolar

export default function LanguagePickerModal({ visible, onClose, onSelect, currentValue }) {
    const insets = useSafeAreaInsets();
    const [query, setQuery] = useState('');
    const translateY = useRef(new Animated.Value(-600)).current;

    useEffect(() => {
        if (visible) {
            setQuery('');
            translateY.setValue(-600);
            Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }).start();
        }
    }, [visible]);

    const q = query.trim().toLowerCase();
    const results = (q
        ? LANGUAGES.filter(l => l.label.toLowerCase().includes(q) || l.code.toLowerCase().includes(q))
        : LANGUAGES
    ).slice().sort((a, b) => a.label.localeCompare(b.label));

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={s.overlay}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <Animated.View style={[s.sheet, { marginTop: insets.top, transform: [{ translateY }] }]}>
                        <View style={s.header}>
                            <Text style={s.title}>Dil Seç</Text>
                            <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                <Text style={s.closeBtn}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <TextInput
                            style={s.search}
                            value={query}
                            onChangeText={setQuery}
                            placeholder="Dil ara..."
                            placeholderTextColor={colors.textMuted}
                            autoFocus
                        />
                        <FlatList
                            data={results}
                            keyExtractor={item => item.code}
                            keyboardShouldPersistTaps="handled"
                            numColumns={GRID_COLUMNS}
                            style={{ maxHeight: 460 }}
                            contentContainerStyle={{ paddingHorizontal: 8, paddingBottom: 8 }}
                            columnWrapperStyle={{ gap: 8 }}
                            ListEmptyComponent={<Text style={s.emptyText}>Sonuç bulunamadı</Text>}
                            renderItem={({ item }) => {
                                const active = currentValue === item.code;
                                return (
                                    <TouchableOpacity
                                        style={[s.tile, active && s.tileActive]}
                                        onPress={() => { onSelect(item.code); onClose(); }}
                                    >
                                        <Text style={s.tileFlag}>{item.flag}</Text>
                                        <Text style={[s.tileLabel, active && s.tileLabelActive]} numberOfLines={1}>{item.label}</Text>
                                        {active && <Text style={s.tileCheck}>✓</Text>}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </Animated.View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
        backgroundColor: colors.surface,
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
        maxHeight: '85%',
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
    tile: {
        flex: 1 / GRID_COLUMNS,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 14,
        marginBottom: 8,
        borderRadius: 12,
        backgroundColor: colors.surface2,
        borderWidth: 1,
        borderColor: colors.border,
    },
    tileActive: { backgroundColor: colors.purple + '20', borderColor: colors.purple },
    tileFlag: { fontSize: 22, marginBottom: 4 },
    tileLabel: { color: colors.text, fontSize: 12, fontWeight: '600' },
    tileLabelActive: { color: colors.purple, fontWeight: '800' },
    tileCheck: { position: 'absolute', top: 4, right: 6, color: colors.purple, fontSize: 12, fontWeight: '800' },
    emptyText: { color: colors.textMuted, textAlign: 'center', paddingVertical: 16 },
});
