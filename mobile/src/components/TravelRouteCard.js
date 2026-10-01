import { View, Text, TouchableOpacity, StyleSheet, Image } from 'react-native';
import colors from '../theme/colors';
import useT from '../hooks/useT';

const ACCENT = '#0ea5e9';

export default function TravelRouteCard({ route: r, onPress, onRemove }) {
    const t = useT();
    const cover = (r.media || []).find(m => m.type === 'image');
    const hasVideo = (r.media || []).some(m => m.type === 'video');
    const owner = r.savedAt ? `✓ ${t.tvOfflineSaved}`
        : r.source === 'OSM' ? '🗺️ OpenStreetMap'
        : t.tvByUser(r.user?.fullName || r.user?.username || '');
    return (
        <TouchableOpacity style={s.card} activeOpacity={0.85} onPress={onPress}>
            {cover ? (
                <Image source={{ uri: cover.url }} style={s.cover} />
            ) : (
                <View style={[s.cover, s.coverEmpty]}><Text style={{ fontSize: 34 }}>{hasVideo ? '🎬' : '🗺️'}</Text></View>
            )}
            <View style={s.body}>
                <View style={s.rowBetween}>
                    <Text style={[s.title, { flex: 1 }]} numberOfLines={1}>{r.title}</Text>
                    {onRemove ? <TouchableOpacity onPress={onRemove} hitSlop={10}><Text style={s.remove}>✕</Text></TouchableOpacity> : null}
                </View>
                <Text style={s.meta} numberOfLines={1}>📍 {r.startPlace}{r.endPlace ? ` → ${r.endPlace}` : ''}</Text>
                <View style={s.rowBetween}>
                    <Text style={s.rating}>★ {r.ratingCount ? r.ratingAvg.toFixed(1) : '—'} <Text style={s.meta}>({r.ratingCount || 0})</Text></Text>
                    <View style={{ flexDirection: 'row', gap: 4 }}>
                        {r.hasGps || r.savedAt ? <Text style={s.chip}>{t.tvGpsBadge}</Text> : null}
                        {r.difficulty ? <Text style={s.chip}>{t[`tvDiff${r.difficulty}`]}</Text> : null}
                    </View>
                </View>
                <Text style={s.meta} numberOfLines={1}>
                    {r.distanceKm ? `↔ ${r.distanceKm} km` : ''}
                    {r.distanceFromMeKm != null ? `  ·  ${t.tvAwayKm(r.distanceFromMeKm)}` : ''}
                    {r.completedCount ? `  ·  👣 ${r.completedCount}` : ''}
                    {r.commentCount ? `  ·  💬 ${r.commentCount}` : ''}
                </Text>
                <Text style={s.meta} numberOfLines={1}>{owner}</Text>
            </View>
        </TouchableOpacity>
    );
}

const s = StyleSheet.create({
    card:      { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 16, borderWidth: 1, borderColor: colors.border, marginBottom: 10, overflow: 'hidden' },
    cover:     { width: 104, minHeight: 124, height: '100%' },
    coverEmpty:{ backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    body:      { flex: 1, padding: 10, gap: 3 },
    title:     { color: colors.text, fontSize: 15, fontWeight: '900' },
    meta:      { color: colors.textMuted, fontSize: 12 },
    rowBetween:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
    rating:    { color: '#facc15', fontSize: 13, fontWeight: '800' },
    chip:      { color: ACCENT, borderColor: ACCENT, borderWidth: 1, borderRadius: 8, paddingHorizontal: 6, paddingVertical: 1, fontSize: 10, fontWeight: '800' },
    remove:    { color: colors.textMuted, fontSize: 16, fontWeight: '900', paddingHorizontal: 4 },
});
