import { useState, useCallback, useEffect } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import api from '../../services/api';
import { onSocket } from '../../services/socket';
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
        { id: 'wellness',    label: 'Yoga / Pilates / Reformer', emoji: '🧘' },
        { id: 'table_tennis',     label: 'Table Tennis',        emoji: '🏓' },
        { id: 'climbing',         label: 'Climbing',            emoji: '🧗' },
        { id: 'archery',          label: 'Archery',             emoji: '🏹' },
        { id: 'walking',          label: 'Walking',             emoji: '🚶' },
        { id: 'foot_tennis',      label: 'Foot Tennis',         emoji: '🦶' },
        { id: 'sup_kano',         label: 'SUP & Canoe',         emoji: '🛶' },
        { id: 'handball',         label: 'Handball',            emoji: '🤾' },
        { id: 'badminton',        label: 'Badminton',           emoji: '🏸' },
        { id: 'shooting_hunting', label: 'Shooting & Hunting',  emoji: '🔫' },
        { id: 'equestrian',       label: 'Equestrian',          emoji: '🐎' },
        { id: 'golf',             label: 'Golf',                emoji: '⛳' },
        { id: 'fitness_gym',      label: 'Fitness & Gym',       emoji: '🏋️' },
        { id: 'skiing_snowboard', label: 'Skiing & Snowboard',  emoji: '⛷️' },
        { id: 'ice_skating',      label: 'Ice Skating',         emoji: '⛸️' },
        { id: 'hiking',           label: 'Hiking',              emoji: '🥾' },
        { id: 'camping',          label: 'Camping',             emoji: '🏕️' },
        { id: 'motorcycle',       label: 'Motorcycle Riding',   emoji: '🏍️' },
        { id: 'extreme_sports',   label: 'Extreme Sports',      emoji: '🪂' },
        { id: 'paintball',        label: 'Paintball',           emoji: '🎯' },
        { id: 'airsoft',          label: 'Airsoft',             emoji: '🪖' },
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
    const subs = [...(SUB_MAP[category] || [])].sort((a, b) => a.label.localeCompare(b.label));
    const accentColor = CAT_COLOR[category] || colors.purple;
    const t = useT();

    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);

    const fetchCounts = useCallback(() => {
        api.get(`/rivals/counts?category=${category}`)
            .then(r => setCounts(r.data))
            .catch(e => console.warn(e?.message))
            .finally(() => setLoading(false));
    }, [category]);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            fetchCounts();
        }, [fetchCounts])
    );

    // Real-time: yeni ilan veya silme olunca sayacı güncelle
    useEffect(() => {
        const offUpdate = onSocket('rivalUpdate', (data) => {
            if (data?.category?.toUpperCase() === category) fetchCounts();
        });
        const offDeleted = onSocket('rivalDeleted', (data) => {
            if (data?.category?.toUpperCase() === category) fetchCounts();
        });
        return () => { offUpdate(); offDeleted(); };
    }, [fetchCounts, category]);

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
                    <View style={s.grid}>
                        {subs.map(sub => {
                            const enabled = ENABLED_SUBS.has(sub.id);
                            const count = counts[sub.id] || 0;
                            return (
                                <TouchableOpacity
                                    key={sub.id}
                                    style={[s.card, { borderColor: enabled ? accentColor + '40' : colors.border, opacity: enabled ? 1 : 0.5 }]}
                                    onPress={() => enabled && navigation.navigate('SubCategory', { category, sub: sub.id })}
                                    activeOpacity={enabled ? 0.75 : 1}
                                >
                                    <Text style={s.emoji}>{sub.emoji}</Text>
                                    <Text style={s.cardLabel}>{sub.label}</Text>
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
                    </View>
                </ScrollView>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    container:  { flex: 1, backgroundColor: colors.bg, paddingTop: 53 },
    header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 17, marginBottom: 24, gap: 3 },
    back:       {},
    backText:   { color: colors.purple, fontSize: 15, fontWeight: '700' },
    title:      { color: '#fff', fontSize: 20, fontWeight: '900' },
    list:       { paddingHorizontal: 0, paddingBottom: 29 },
    grid:       { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    card:       {
        backgroundColor: colors.surface, borderRadius: 12, padding: 7,
        flexDirection: 'column', alignItems: 'flex-start', borderWidth: 1, gap: 3,
        alignSelf: 'flex-start', flexShrink: 0,
    },
    emoji:      { fontSize: 22 },
    cardLabel:  { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 0 },
    countBadge: { borderRadius: 6, paddingHorizontal: 3, paddingVertical: 0, borderWidth: 1 },
    countText:  { fontSize: 10, fontWeight: '700' },
});
