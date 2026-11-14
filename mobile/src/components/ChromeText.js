import { View, Text, StyleSheet } from 'react-native';
import { Ionicons, FontAwesome5, MaterialCommunityIcons } from '@expo/vector-icons';

/**
 * Buton / etiket metninin başındaki Unicode emojileri sabit vektör ikona çevirir.
 * Samsung/Xiaomi/Pixel emoji fontu farkı kalmasın diye — marka-bagimsiz-ui kuralı.
 *
 * Kullanım: <ChromeText style={...}>{t.myUpcomingActivitiesBtn}</ChromeText>
 * Zorla ikon: <ChromeText icon="logo-whatsapp" brand="fa5">WhatsApp</ChromeText>
 */

// Tek karakter / kısa emoji → Ionicons (veya brand set)
export const EMOJI_TO_ICON = {
    '⏰': { name: 'time-outline' },
    '⏱': { name: 'timer-outline' },
    '🕐': { name: 'time-outline' },
    '📅': { name: 'calendar-outline' },
    '📆': { name: 'calendar-outline' },
    '💬': { name: 'chatbubble-outline' },
    '💭': { name: 'chatbubble-ellipses-outline' },
    '✉️': { name: 'mail-outline' },
    '📧': { name: 'mail-outline' },
    '📨': { name: 'mail-outline' },
    '📞': { name: 'call-outline' },
    '📱': { name: 'phone-portrait-outline' },
    '🔔': { name: 'notifications-outline' },
    '🔕': { name: 'notifications-off-outline' },
    '👥': { name: 'people-outline' },
    '👤': { name: 'person-outline' },
    '🏠': { name: 'home-outline' },
    '🏡': { name: 'home-outline' },
    '⭐': { name: 'star-outline' },
    '🌟': { name: 'star' },
    '★': { name: 'star' },
    '☆': { name: 'star-outline' },
    '🔥': { name: 'flame-outline' },
    '🎬': { name: 'film-outline' },
    '🏃': { name: 'walk-outline' },
    '📍': { name: 'location-outline' },
    '📌': { name: 'pin-outline' },
    '✅': { name: 'checkmark-circle-outline' },
    '❌': { name: 'close-circle-outline' },
    '✕': { name: 'close' },
    '✓': { name: 'checkmark' },
    '⏳': { name: 'hourglass-outline' },
    '🚫': { name: 'ban-outline' },
    '⚙️': { name: 'settings-outline' },
    '⚙': { name: 'settings-outline' },
    '🔍': { name: 'search-outline' },
    '➕': { name: 'add-outline' },
    '✏️': { name: 'create-outline' },
    '🗑': { name: 'trash-outline' },
    '🗑️': { name: 'trash-outline' },
    '📤': { name: 'share-outline' },
    '📥': { name: 'download-outline' },
    '🔗': { name: 'link-outline' },
    '🔒': { name: 'lock-closed-outline' },
    '🔓': { name: 'lock-open-outline' },
    '💰': { name: 'cash-outline' },
    '💵': { name: 'cash-outline' },
    '🏆': { name: 'trophy-outline' },
    '🎯': { name: 'locate-outline' },
    '🏅': { name: 'medal-outline' },
    '🎓': { name: 'school-outline' },
    '📸': { name: 'instagram', brand: 'fa5' },
    '📷': { name: 'camera-outline' },
    '🖼️': { name: 'image-outline' },
    '🗺': { name: 'map-outline' },
    '🗺️': { name: 'map-outline' },
    '✈️': { name: 'airplane-outline' },
    '❤': { name: 'heart-outline' },
    '❤️': { name: 'heart' },
    '🤍': { name: 'heart-outline' },
    'ℹ️': { name: 'information-circle-outline' },
    'ℹ': { name: 'information-circle-outline' },
    '⚠️': { name: 'warning-outline' },
    '⚠': { name: 'warning-outline' },
    '←': { name: 'arrow-back' },
    '→': { name: 'arrow-forward' },
    '‹': { name: 'chevron-back' },
    '›': { name: 'chevron-forward' },
    '🎾': { name: 'tennis', brand: 'mci' },
    '⚽': { name: 'soccer', brand: 'mci' },
    '🏀': { name: 'basketball', brand: 'mci' },
    '🏐': { name: 'volleyball', brand: 'mci' },
    '🎮': { name: 'game-controller-outline' },
    '🎨': { name: 'color-palette-outline' },
    '🎉': { name: 'happy-outline' },
    '🗃️': { name: 'archive-outline' },
    '🗃': { name: 'archive-outline' },
    '🛡️': { name: 'shield-outline' },
    '🛡': { name: 'shield-outline' },
    '🏟️': { name: 'business-outline' },
    '🏟': { name: 'business-outline' },
    '⚔️': { name: 'flash-outline' },
    '⚔': { name: 'flash-outline' },
    '💪': { name: 'barbell-outline' },
    '🟨': { name: 'square-outline' },
};

// Baştaki emoji + boşlukları ayır (ZWJ / FE0F dahil)
const LEADING_EMOJI_RE = /^(?:(?:\p{Extended_Pictographic}|\p{Emoji_Presentation}|[★☆✓✕←→‹›⚠ℹ❤])(?:\uFE0F)?(?:\u200D(?:\p{Extended_Pictographic}|\p{Emoji_Presentation})(?:\uFE0F)?)?\s*)+/u;

export function parseChromeEmoji(raw) {
    const str = String(raw ?? '');
    const m = str.match(LEADING_EMOJI_RE);
    if (!m) return { text: str.trim(), icon: null, brand: 'ion' };
    const chunk = m[0];
    const text = str.slice(chunk.length).trim();
    // İlk emojinin anahtarını bul (map'te en uzun eşleşen)
    const keys = Object.keys(EMOJI_TO_ICON).sort((a, b) => b.length - a.length);
    let hit = null;
    for (const k of keys) {
        if (chunk.includes(k)) { hit = EMOJI_TO_ICON[k]; break; }
    }
    if (!hit) return { text: text || str.trim(), icon: null, brand: 'ion' };
    return { text: text || str.trim(), icon: hit.name, brand: hit.brand || 'ion' };
}

export function stripChromeEmoji(raw) {
    return parseChromeEmoji(raw).text;
}

function Glyph({ name, brand, size, color }) {
    if (!name) return null;
    if (brand === 'fa5') return <FontAwesome5 name={name} size={size} color={color} />;
    if (brand === 'mci') return <MaterialCommunityIcons name={name} size={size} color={color} />;
    return <Ionicons name={name} size={size} color={color} />;
}

export default function ChromeText({
    children,
    style,
    icon,
    brand: brandProp,
    iconSize,
    iconColor,
    gap = 6,
    numberOfLines,
    allowFontScaling = false,
    ...rest
}) {
    const flat = StyleSheet.flatten(style) || {};
    const color = iconColor || flat.color || '#F4F1EA';
    const size = iconSize || Math.max(14, Math.round((flat.fontSize || 13) * 1.15));

    let resolvedIcon = icon || null;
    let resolvedBrand = brandProp || 'ion';
    let text = '';

    if (typeof children === 'string' || typeof children === 'number') {
        if (icon) {
            text = stripChromeEmoji(String(children));
        } else {
            const p = parseChromeEmoji(String(children));
            resolvedIcon = p.icon;
            resolvedBrand = p.brand;
            text = p.text;
        }
    } else {
        text = children;
    }

    if (!resolvedIcon) {
        return (
            <Text style={style} numberOfLines={numberOfLines} allowFontScaling={allowFontScaling} {...rest}>
                {typeof children === 'string' ? stripChromeEmoji(children) : children}
            </Text>
        );
    }

    const { flex, flexGrow, alignSelf, marginBottom, marginTop, marginHorizontal, marginVertical, width, maxWidth } = flat;
    const wrapStyle = {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: flat.textAlign === 'center' ? 'center' : 'flex-start',
        gap,
        flexShrink: 1,
        ...(flex != null ? { flex } : null),
        ...(flexGrow != null ? { flexGrow } : null),
        ...(alignSelf != null ? { alignSelf } : null),
        ...(marginBottom != null ? { marginBottom } : null),
        ...(marginTop != null ? { marginTop } : null),
        ...(marginHorizontal != null ? { marginHorizontal } : null),
        ...(marginVertical != null ? { marginVertical } : null),
        ...(width != null ? { width } : null),
        ...(maxWidth != null ? { maxWidth } : null),
    };
    // flex/margin dış View'da; Text'te layout çakışmasın
    const textStyle = { ...flat, flex: undefined, flexGrow: undefined, marginBottom: undefined, marginTop: undefined, marginHorizontal: undefined, marginVertical: undefined };

    return (
        <View style={wrapStyle}>
            <Glyph name={resolvedIcon} brand={resolvedBrand} size={size} color={color} />
            {text ? (
                <Text style={textStyle} numberOfLines={numberOfLines} allowFontScaling={allowFontScaling} {...rest}>
                    {text}
                </Text>
            ) : null}
        </View>
    );
}
