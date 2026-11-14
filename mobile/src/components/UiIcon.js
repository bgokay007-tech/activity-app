import { Ionicons } from '@expo/vector-icons';

/**
 * Sistem emoji fontuna düşmeyen sabit vektör ikon.
 * Samsung/Xiaomi/Pixel aynı glifi görür — marka farkı olmaz.
 */
export default function UiIcon({ name, size = 22, color = '#F4F1EA', style }) {
    return <Ionicons name={name} size={size} color={color} style={style} />;
}
