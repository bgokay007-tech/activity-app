import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

const ENABLED_SUBS = new Set(['tennis', 'padel', 'volleyball']);

const SUB_MAP = {
    SPORTS:  [
        { id: 'tennis',      label: 'Tennis',           emoji: '🎾' },
        { id: 'padel',       label: 'Padel',            emoji: '🏓' },
        { id: 'volleyball',  label: 'Volleyball',       emoji: '🏐' },
        { id: 'football',    label: 'Football',         emoji: '⚽' },
        { id: 'basketball',  label: 'Basketball',       emoji: '🏀' },
        { id: 'running',     label: 'Running',          emoji: '🏃' },
        { id: 'wellness',    label: 'Yoga / Pilates',   emoji: '🧘' },
    ],
    SOCIAL:  [
        { id: 'language',    label: 'Language Exchange', emoji: '🌍' },
        { id: 'hiking',      label: 'Hiking',            emoji: '🥾' },
        { id: 'photography', label: 'Photography',       emoji: '📷' },
    ],
    ARTS:    [
        { id: 'painting',    label: 'Painting',         emoji: '🎨' },
        { id: 'music',       label: 'Music',            emoji: '🎵' },
    ],
    GAMES:   [
        { id: 'fps',          label: 'FPS',             emoji: '🎯' },
        { id: 'moba',         label: 'MOBA',            emoji: '⚔️' },
        { id: 'strategy',     label: 'Strategy',        emoji: '♟️' },
        { id: 'sports_games', label: 'Sports Games',    emoji: '🎮' },
        { id: 'boardgames',   label: 'Board Games',     emoji: '🎲' },
    ],
};

const CAT_COLOR = {
    SPORTS:  '#16a34a',
    SOCIAL:  '#d97706',
    ARTS:    '#db2777',
    GAMES:   '#2563eb',
};

export default function CategoryScreen({ route, navigation }) {
    const { category } = route.params;
    const subs = SUB_MAP[category] || [];
    const accentColor = CAT_COLOR[category] || colors.purple;
    const t = useT();

    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        api.get(`/rivals/counts?category=${category}`)
            .then(r => setCounts(r.data))
            .catch(e => console.warn(e?.message))
            .finally(() => setLoading(false));
    }, [category]);

    return (
        <View style={s.container}>
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.back}>
                    <Text style={s.backText}>{t.back}</Text>
                </TouchableOpacity>
                <Text style={s.title}>{category}</Text>
            </View>

            {loading ? (
                <ActivityIndicator color={accentColor} style={{ marginTop: 40 }} />
            ) : (
                <ScrollView contentContainerStyle={s.list}>
                    {subs.map(sub => {
                        const enabled = ENABLED_SUBS.has(sub.id);
                        const count = counts[sub.id] || 0;
                        return (
                            <TouchableOpacity
                                key={sub.id}
                                style={[s.row, { borderColor: enabled ? accentColor + '40' : colors.border, opacity: enabled ? 1 : 0.5 }]}
                                onPress={() => enabled && navigation.navigate('SubCategory', { category, sub: sub.id })}
                                activeOpacity={enabled ? 0.75 : 1}
                            >
                                <Text style={s.emoji}>{sub.emoji}</Text>
                                <Text style={s.rowLabel}>{sub.label}</Text>
                                {enabled ? (
                                    <View style={[s.countBadge, { backgroundColor: accentColor + '20', borderColor: accentColor + '60' }]}>
                                        <Text style={[s.countText, { color: count > 0 ? accentColor : colors.textMuted }]}>
                                            {count > 0 ? t.listings(count) : t.noListings}
                                        </Text>
                                    </View>
                                ) : (
                                    <View style={[s.countBadge, { backgroundColor: '#37415120', borderColor: '#37415160' }]}>
                                        <Text style={[s.countText, { color: colors.textMuted }]}>{t.maintenance}</Text>
                                    </View>
                                )}
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container:  { flex: 1, backgroundColor: colors.bg, paddingTop: 56 },
    header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 20, marginBottom: 24, gap: 12 },
    back:       {},
    backText:   { color: colors.purple, fontSize: 15, fontWeight: '700' },
    title:      { color: '#fff', fontSize: 20, fontWeight: '900' },
    list:       { paddingHorizontal: 20, gap: 12, paddingBottom: 32 },
    row:        {
        backgroundColor: colors.surface, borderRadius: 16, padding: 16,
        flexDirection: 'row', alignItems: 'center', borderWidth: 1, gap: 12,
    },
    emoji:      { fontSize: 28 },
    rowLabel:   { color: '#fff', fontSize: 16, fontWeight: '700', flex: 1 },
    countBadge: { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1 },
    countText:  { fontSize: 12, fontWeight: '700' },
});
