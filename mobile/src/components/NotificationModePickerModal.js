import { useRef, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Animated } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';

const MODES = [
    { value: 'SOUND', icon: '🔊' },
    { value: 'VIBRATE', icon: '📳' },
    { value: 'MUTE', icon: '🔇' },
];

export default function NotificationModePickerModal({ visible, onClose, onSelect, currentValue, t }) {
    const insets = useSafeAreaInsets();
    const translateY = useRef(new Animated.Value(-400)).current;

    useEffect(() => {
        if (visible) {
            translateY.setValue(-400);
            Animated.timing(translateY, { toValue: 0, duration: 260, useNativeDriver: true }).start();
        }
    }, [visible]);

    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
                <Animated.View style={[s.sheet, { marginTop: insets.top, transform: [{ translateY }] }]} onStartShouldSetResponder={() => true}>
                    <View style={s.header}>
                        <Text style={s.title}>{t.notificationModeTitle}</Text>
                        <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                            <Text style={s.closeBtn}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    {MODES.map(m => {
                        const active = currentValue === m.value;
                        return (
                            <TouchableOpacity
                                key={m.value}
                                style={[s.row, active && s.rowActive]}
                                onPress={() => { onSelect(m.value); onClose(); }}
                            >
                                <Text style={s.rowIcon}>{m.icon}</Text>
                                <View style={{ flex: 1 }}>
                                    <Text style={[s.rowLabel, active && s.rowLabelActive]}>{t[`notificationMode_${m.value}`]}</Text>
                                    <Text style={s.rowDesc}>{t[`notificationModeDesc_${m.value}`]}</Text>
                                </View>
                                {active && <Text style={s.rowCheck}>✓</Text>}
                            </TouchableOpacity>
                        );
                    })}
                </Animated.View>
            </TouchableOpacity>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)' },
    sheet: {
        backgroundColor: colors.surface,
        borderBottomLeftRadius: 20,
        borderBottomRightRadius: 20,
        paddingBottom: 13,
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
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        marginHorizontal: 12,
        marginTop: 10,
        paddingHorizontal: 13,
        paddingVertical: 11,
        borderRadius: 12,
        backgroundColor: colors.surface2,
        borderWidth: 1,
        borderColor: colors.border,
    },
    rowActive: { backgroundColor: colors.purple + '20', borderColor: colors.purple },
    rowIcon: { fontSize: 22, marginRight: 12 },
    rowLabel: { color: colors.text, fontSize: 15, fontWeight: '700' },
    rowLabelActive: { color: colors.purple },
    rowDesc: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    rowCheck: { color: colors.purple, fontSize: 16, fontWeight: '800', marginLeft: 8 },
});
