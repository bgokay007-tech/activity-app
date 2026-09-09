import { Modal, View, KeyboardAvoidingView, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';

// Kullanıcı isteği (defalarca): klavye formu kapatmasın — hangi form olursa olsun.
// Proje kalıbı: Modal'da android_keyboardInputMode="adjustNothing" + her iki
// platformda behavior="padding". behavior="height" YASAK (kaydırmayı bozar).
// İçindeki ScrollView'a keyboardShouldPersistTaps="handled" koymak çağıranın işi.
export default function KeyboardSafeModal({
    visible, onClose, children, animationType = 'slide',
}) {
    const insets = useSafeAreaInsets();
    return (
        <Modal
            visible={visible}
            animationType={animationType}
            transparent
            onRequestClose={onClose}
            android_keyboardInputMode="adjustNothing"
        >
            <View style={s.overlay}>
                <KeyboardAvoidingView behavior="padding" style={s.kav}>
                    <View style={[s.box, { paddingBottom: Math.max(14, insets.bottom + 10) }]}>
                        {children}
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' },
    kav: { flex: 1, justifyContent: 'flex-end' },
    box: {
        backgroundColor: colors.surface,
        borderTopLeftRadius: 24,
        borderTopRightRadius: 24,
        padding: 21,
    },
});
