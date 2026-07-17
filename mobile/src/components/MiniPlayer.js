import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../theme/colors';
import { useActiveTrack, useIsPlaying, togglePlayPause, skipNext } from '../services/musicPlayer';
import { navigationRef } from '../navigation';

// Bir şarkı çalarken tüm ekranlarda (tab bar'ın hemen üstünde) sabit görünen çubuk —
// Navigation() kök bileşeninde AppTabs ile birlikte render edilir. useNavigation() yerine
// modül seviyesindeki navigationRef kullanılır — bu bileşen belirli bir Navigator'ın
// altında değil, kök seviyede (herhangi bir sekmenin üstünde) render edildiği için.
export default function MiniPlayer() {
    const insets = useSafeAreaInsets();
    const track = useActiveTrack();
    const { playing } = useIsPlaying();

    if (!track) return null;

    return (
        <TouchableOpacity
            style={[s.bar, { bottom: 56 + insets.bottom }]}
            activeOpacity={0.85}
            onPress={() => navigationRef.isReady() && navigationRef.navigate('HomeTab', { screen: 'NowPlaying' })}
        >
            {track.artwork ? (
                <Image source={{ uri: track.artwork }} style={s.art} />
            ) : (
                <View style={[s.art, s.artFallback]}><Text style={{ fontSize: 16 }}>🎵</Text></View>
            )}
            <View style={{ flex: 1, marginHorizontal: 8 }}>
                <Text style={s.title} numberOfLines={1}>{track.title}</Text>
                <Text style={s.artist} numberOfLines={1}>{track.artist}</Text>
            </View>
            <TouchableOpacity
                onPress={(e) => { e.stopPropagation?.(); togglePlayPause(!!playing); }}
                style={s.ctrlBtn}
            >
                <Text style={s.ctrlText}>{playing ? '⏸' : '▶️'}</Text>
            </TouchableOpacity>
            <TouchableOpacity
                onPress={(e) => { e.stopPropagation?.(); skipNext(); }}
                style={s.ctrlBtn}
            >
                <Text style={s.ctrlText}>⏭</Text>
            </TouchableOpacity>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    bar: {
        position: 'absolute', left: 0, right: 0,
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: colors.surface2, borderTopWidth: 1, borderColor: colors.border,
        paddingHorizontal: 10, paddingVertical: 6,
    },
    art: { width: 34, height: 34, borderRadius: 6 },
    artFallback: { backgroundColor: colors.surface, alignItems: 'center', justifyContent: 'center' },
    title: { color: colors.text, fontSize: 12, fontWeight: '700' },
    artist: { color: colors.textMuted, fontSize: 11 },
    ctrlBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    ctrlText: { fontSize: 18, color: colors.text },
});
