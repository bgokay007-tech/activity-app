import { View, Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import colors from '../theme/colors';

// Kullanıcı örneği: tek yıldız gövdesinde diagonal rainbow dalga (GIF).
// Animated+Ionicons native çökertiyordu — animasyon asset’te, güvenli Image.
const STAR_RAINBOW_GIF = require('../../assets/visual/tab/activity-star-rainbow.gif');

/**
 * AkTiViTe sekmesi yıldızı.
 * Pasif: outline. Aktif: tek bütün yıldız içinde sürekli rainbow dalga (gokkusagi_yildiz_dalga).
 */
export default function RainbowStar({ size = 24, active = false, style }) {
    if (!active) {
        return (
            <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
                <Ionicons name="star-outline" size={size} color={colors.textMuted} />
            </View>
        );
    }

    return (
        <View style={[{ width: size, height: size, alignItems: 'center', justifyContent: 'center' }, style]}>
            <Image
                source={STAR_RAINBOW_GIF}
                style={{ width: size, height: size }}
                resizeMode="contain"
            />
        </View>
    );
}
