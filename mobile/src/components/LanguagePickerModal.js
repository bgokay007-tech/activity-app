import { useState, useEffect } from 'react';
import {
    Modal, View, Text, TextInput, FlatList, TouchableOpacity,
    StyleSheet, KeyboardAvoidingView, Platform,
} from 'react-native';
import colors from '../theme/colors';
import { LANGUAGES } from '../utils/languages';

export default function LanguagePickerModal({ visible, onClose, onSelect, currentValue }) {
    const [query, setQuery] = useState('');

    useEffect(() => {
        if (visible) setQuery('');
    }, [visible]);

    const q = query.trim().toLowerCase();
    const results = q
        ? LANGUAGES.filter(l => l.label.toLowerCase().includes(q) || l.code.toLowerCase().includes(q))
        : LANGUAGES;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                    <View style={s.sheet}>
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
                            style={{ maxHeight: 320 }}
                            ListEmptyComponent={<Text style={s.emptyText}>Sonuç bulunamadı</Text>}
                            renderItem={({ item }) => {
                                const active = currentValue === item.code;
                                return (
                                    <TouchableOpacity
                                        style={[s.item, active && s.itemActive]}
                                        onPress={() => { onSelect(item.code); onClose(); }}
                                    >
                                        <Text style={[s.itemText, active && s.itemTextActive]}>{item.flag} {item.label}</Text>
                                        {active && <Text style={{ color: colors.purple, fontSize: 16 }}>✓</Text>}
                                    </TouchableOpacity>
                                );
                            }}
                        />
                    </View>
                </KeyboardAvoidingView>
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
    emptyText: { color: colors.textMuted, textAlign: 'center', paddingVertical: 16 },
});
