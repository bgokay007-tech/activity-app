import { Platform, TouchableOpacity } from 'react-native';

// Android'de sistem geri tuşu ya da kenar kaydırması aynı işi yapar; sol üstteki
// buton yer kaplamasın. iPhone'da geri tuşu yoktur: stack ekranında sol kenardan
// kaydırma çalışır, tam ekran pencerede çalışmaz — buton orada durur.
export default function ScreenBackButton({ onPress, style, hitSlop, disabled, children }) {
    if (Platform.OS !== 'ios') return null;
    return (
        <TouchableOpacity
            onPress={onPress}
            style={style}
            disabled={disabled}
            hitSlop={hitSlop || { top: 8, bottom: 8, left: 8, right: 8 }}
        >
            {children}
        </TouchableOpacity>
    );
}
