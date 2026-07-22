import { View, Text, Image } from 'react-native';
import colors from '../theme/colors';

// Paylaşılan avatar bileşeni — ProfileScreen.js'teki yerel avatar deseniyle aynı
// sözleşme (user.avatar → Image, yoksa kullanıcı adının ilk harfi). Mevcut
// yerel kopyalara (ProfileScreen, MessagesScreen) kasıtlı olarak dokunulmadı,
// bu sadece yeni kullanım yerleri (Okey/Batak masası) için ortak bir bileşen.
export default function Avatar({ user, size = 40, ring = false }) {
    return (
        <View
            style={{
                width: size, height: size, borderRadius: size / 2,
                backgroundColor: colors.surface2, justifyContent: 'center', alignItems: 'center',
                overflow: 'hidden',
                borderWidth: ring ? 2 : 0, borderColor: ring ? '#fbbf24' : 'transparent',
            }}
        >
            {user?.avatar
                ? <Image source={{ uri: user.avatar }} style={{ width: size, height: size }} />
                : <Text style={{ color: '#fff', fontWeight: '800', fontSize: size * 0.4 }}>{user?.username?.[0]?.toUpperCase() || '?'}</Text>}
        </View>
    );
}
