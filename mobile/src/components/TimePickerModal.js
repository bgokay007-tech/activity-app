import { useState, useEffect } from 'react';
import { Modal, View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native';
import colors from '../theme/colors';

// Uygulama genelinde tek saat seçilen her yerde kullanılan tek saat seçici — hepsi
// aynı görünsün diye buraya taşındı (önceden SubCategoryScreen.js'teki grid-only
// TimeGridModal ile BusinessHomeScreen.js'teki manuel-giriş+amber renkli TimePickerModal
// ayrı ayrı vardı; ikisinin en iyi yanları (manuel giriş + grid) birleştirildi).
function normalizeTime(t) {
    if (!t) return '';
    if (/^\d{1,2}:\d{1,2}$/.test(t)) {
        const [h, m] = t.split(':');
        return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
    }
    return t;
}

function isValidTimeStr(t) {
    const n = normalizeTime(t);
    return /^\d{2}:\d{2}$/.test(n) && parseInt(n.slice(0, 2)) <= 24 && parseInt(n.slice(3)) < 60;
}

export default function TimePickerModal({ visible, title, value, onSelect, onClose, step = 15 }) {
    const [manual, setManual] = useState(value || '');
    useEffect(() => { setManual(value || ''); }, [value, visible]);

    const times = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += step) {
            times.push(`${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`);
        }
    }

    const handleManualSubmit = () => {
        const n = normalizeTime(manual);
        if (!isValidTimeStr(n)) { Alert.alert('Hata', 'Geçerli saat girin (örn: 8, 8:30, 08:00)'); return; }
        onSelect(n);
        onClose();
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.box}>
                    <View style={s.header}>
                        <Text style={s.title}>{title || 'Saat Seç'}</Text>
                        <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>

                    <View style={s.manualRow}>
                        <TextInput
                            style={s.manualInput}
                            placeholder="Manuel gir: 8, 8:30, 08:00…"
                            placeholderTextColor={colors.textMuted}
                            value={manual}
                            onChangeText={setManual}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                            returnKeyType="done"
                            onSubmitEditing={handleManualSubmit}
                        />
                        <TouchableOpacity onPress={handleManualSubmit} style={s.manualBtn}>
                            <Text style={s.manualBtnText}>Tamam</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView keyboardShouldPersistTaps="always" style={{ maxHeight: 340 }}>
                        <View style={s.grid}>
                            {times.map(item => {
                                const isSelected = item === value;
                                return (
                                    <TouchableOpacity
                                        key={item}
                                        style={[s.cell, isSelected && s.cellActive]}
                                        onPress={() => { onSelect(item); onClose(); }}
                                    >
                                        <Text style={[s.cellText, isSelected && s.cellTextActive]}>{item}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                        <View style={{ height: 32 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    box: { maxHeight: '75%', backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 13, paddingTop: 17, paddingBottom: 20 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { color: '#fff', fontSize: 16, fontWeight: '900' },
    close: { color: colors.textMuted, fontSize: 22 },

    manualRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    manualInput: { flex: 1, backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 14 },
    manualBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 9 },
    manualBtnText: { color: '#fff', fontWeight: '700' },

    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    cell: { paddingHorizontal: 14, paddingVertical: 9, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, minWidth: 70, alignItems: 'center' },
    cellActive: { backgroundColor: colors.purple, borderColor: colors.purple },
    cellText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
    cellTextActive: { color: '#fff', fontWeight: '800' },
});
