import { View, Text, Image, TouchableOpacity } from 'react-native';
import colors from '../theme/colors';
import { moderateScale } from '../theme/scale';

const DIFFICULTY_LABEL = { EASY: 'Kolay', MEDIUM: 'Orta', HARD: 'Zor' };
const DIFFICULTY_COLOR = { EASY: '#22c55e', MEDIUM: '#f59e0b', HARD: '#ef4444' };

// Aktivitelerim kartlarındaki gibi sabit yükseklik — bazı rotalarda fotoğraf/
// puan olup bazılarında olmaması kartların farklı boyda görünmesine yol açmasın.
export default function TrailCard({ trail, onPress }) {
    const diffColor = DIFFICULTY_COLOR[trail.difficulty] || DIFFICULTY_COLOR.MEDIUM;
    return (
        <TouchableOpacity
            activeOpacity={0.85}
            onPress={onPress}
            style={{ width: '48%', height: 190, backgroundColor: colors.surface2, borderRadius: moderateScale(14), borderWidth: 1, borderColor: colors.border, overflow: 'hidden', marginBottom: 10 }}
        >
            {trail.images?.[0] ? (
                <Image source={{ uri: trail.images[0] }} style={{ width: '100%', height: 90 }} resizeMode="cover" />
            ) : (
                <View style={{ width: '100%', height: 90, backgroundColor: '#65a30d30', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ fontSize: 30 }}>🥾</Text>
                </View>
            )}
            <View style={{ padding: 8, flex: 1, justifyContent: 'space-between' }}>
                <View>
                    <Text style={{ color: '#fff', fontSize: moderateScale(12), fontWeight: '800' }} numberOfLines={1}>
                        {trail.verified ? '✓ ' : ''}{trail.title}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: moderateScale(10) }} numberOfLines={1}>
                        {trail.city || trail.district || ''}
                    </Text>
                </View>
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                    <View style={{ backgroundColor: diffColor + '20', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 1, borderWidth: 1, borderColor: diffColor + '50' }}>
                        <Text style={{ color: diffColor, fontSize: moderateScale(9), fontWeight: '700' }}>{DIFFICULTY_LABEL[trail.difficulty] || 'Orta'}</Text>
                    </View>
                    <Text style={{ color: colors.textSecondary, fontSize: moderateScale(10), fontWeight: '700' }}>
                        {trail.distanceKm ? `${trail.distanceKm.toFixed(1)} km` : ''}
                    </Text>
                </View>
                {trail.avgRating ? (
                    <Text style={{ color: '#facc15', fontSize: moderateScale(10), fontWeight: '700' }}>
                        ★ {trail.avgRating.toFixed(1)} ({trail.reviewCount})
                    </Text>
                ) : (
                    <Text style={{ color: colors.textMuted, fontSize: moderateScale(10) }}>Henüz puanlanmadı</Text>
                )}
            </View>
        </TouchableOpacity>
    );
}
