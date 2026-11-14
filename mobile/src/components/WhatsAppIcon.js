import { FontAwesome5 } from '@expo/vector-icons';

export const WHATSAPP_GREEN = '#25D366';

export default function WhatsAppIcon({ size = 18, color = '#fff' }) {
    return <FontAwesome5 name="whatsapp" size={size} color={color} />;
}
