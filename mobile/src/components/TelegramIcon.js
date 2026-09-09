import { FontAwesome5 } from '@expo/vector-icons';

// Resmi Telegram marka rengi — uçak emojisi (✈️) yerine daire içindeki
// kâğıt uçak logosu (FontAwesome Brands "telegram").
export const TELEGRAM_BLUE = '#2AABEE';

export default function TelegramIcon({ size = 18, color = TELEGRAM_BLUE }) {
    return <FontAwesome5 name="telegram" size={size} color={color} />;
}
