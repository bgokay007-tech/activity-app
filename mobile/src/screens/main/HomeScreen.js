import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { setUser } from '../../store/slices/authSlice';
import api from '../../services/api';
import colors from '../../theme/colors';
import RainbowLogo from '../../components/RainbowLogo';
import useT from '../../hooks/useT';

const SUB_EMOJI = {
    football:'⚽', basketball:'🏀', tennis:'🎾', padel:'🏓', volleyball:'🏐',
    swimming:'🏊', running:'🏃', cycling:'🚴', boxing:'🥊', martial_arts:'🥋', wellness:'🧘',
    music:'🎵', painting:'🎨', dance:'💃', photography:'📸', theater:'🎭',
    writing:'✍️', sculpture:'🗿', cinema:'🎬', poetry:'📜', illustration:'🖼️',
    fps:'🎯', rpg:'⚔️', strategy:'♟️', sports_games:'🎮', moba:'🏆',
    battle_royale:'💥', simulation:'🌍', puzzle:'🧩', racing:'🏎️', card_games:'🃏',
};

const CATEGORIES = [
    { id: 'SPORTS', emoji: '🏃', borderColor: '#16a34a', btnColor: '#16a34a', bgColor: '#16a34a12', enabled: true },
    { id: 'SOCIAL', emoji: '🎉', borderColor: '#d97706', btnColor: '#d97706', bgColor: '#d9770612', enabled: false },
    { id: 'ARTS',   emoji: '🎨', borderColor: '#db2777', btnColor: '#db2777', bgColor: '#db277712', enabled: false },
    { id: 'GAMES',  emoji: '🎮', borderColor: '#2563eb', btnColor: '#2563eb', bgColor: '#2563eb12', enabled: false },
];

const CAT_LABELS = {
    SPORTS: 'Sports', SOCIAL: 'Social', ARTS: 'Arts', GAMES: 'Games',
};

export default function HomeScreen({ navigation }) {
    const dispatch = useDispatch();
    const user = useSelector(s => s.auth.user);
    const t = useT();
    const [interests, setInterests] = useState([]);
    const [loading, setLoading] = useState(true);

    const CAT_DESC = {
        SPORTS: t.catDescSports,
        SOCIAL: t.catDescSocial,
        ARTS:   t.catDescArts,
        GAMES:  t.catDescGames,
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [meRes, intRes] = await Promise.all([
                    api.get('/auth/me'),
                    api.get('/interests/my'),
                ]);
                dispatch(setUser(meRes.data));
                setInterests(intRes.data);
            } catch (e) {
                console.warn('HomeScreen load error:', e?.message);
            } finally {
                setLoading(false);
            }
        };
        load();
    }, []);

    if (loading) {
        return (
            <View style={[s.container, { justifyContent: 'center', alignItems: 'center' }]}>
                <ActivityIndicator size="large" color={colors.purple} />
            </View>
        );
    }

    return (
        <View style={s.container}>
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                <View style={{ paddingTop: 16, paddingBottom: 8, alignItems: 'center' }}>
                    <RainbowLogo />
                </View>

                {/* Hero */}
                <View style={s.hero}>
                    <Text style={s.heroTitle}>{t.heroTitle}</Text>
                    <Text style={s.heroSub}>{t.heroSub}</Text>
                </View>

                {/* Category Cards */}
                <View style={s.cards}>
                    {CATEGORIES.map(cat => (
                        <View key={cat.id} style={[s.card, { borderColor: cat.borderColor, backgroundColor: cat.bgColor, opacity: cat.enabled ? 1 : 0.5 }]}>
                            {!cat.enabled && (
                                <View style={s.maintenanceBadge}>
                                    <Text style={s.maintenanceText}>{t.maintenance}</Text>
                                </View>
                            )}
                            <Text style={s.cardEmoji}>{cat.emoji}</Text>
                            <Text style={[s.cardLabel, { color: cat.btnColor }]}>{CAT_LABELS[cat.id]}</Text>
                            <Text style={s.cardDesc}>{CAT_DESC[cat.id]}</Text>
                            <TouchableOpacity
                                style={[s.cardBtn, { backgroundColor: cat.enabled ? cat.btnColor : '#374151' }]}
                                onPress={() => cat.enabled && navigation.navigate('Category', { category: cat.id })}
                                activeOpacity={cat.enabled ? 0.8 : 1}
                                disabled={!cat.enabled}
                            >
                                <Text style={s.cardBtnText}>{cat.enabled ? t.exploreSports : t.comingSoon}</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>

                {/* My Sports */}
                {interests.length > 0 && (
                    <View style={s.branchSection}>
                        <Text style={s.branchTitle}>{t.myBranches}</Text>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.branchRow}>
                            {interests.map(i => (
                                <TouchableOpacity
                                    key={i.id}
                                    style={s.branchChip}
                                    onPress={() => navigation.navigate('SubCategory', { category: i.category, sub: i.subCategory })}
                                >
                                    <Text style={s.branchEmoji}>{SUB_EMOJI[i.subCategory] || '🏅'}</Text>
                                    <Text style={s.branchName}>{i.subCategory}</Text>
                                    {i.skillRating > 0 && (
                                        <Text style={s.branchRating}>{Number(i.skillRating).toFixed(1)}★</Text>
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingTop: 56, paddingBottom: 40 },

    branchSection: { paddingHorizontal: 20, marginBottom: 24 },
    branchTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 10, opacity: 0.7 },
    branchRow: { gap: 10, paddingBottom: 4 },
    branchChip: {
        backgroundColor: colors.surface, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 10,
        alignItems: 'center', borderWidth: 1, borderColor: colors.border, minWidth: 80,
    },
    branchEmoji: { fontSize: 22, marginBottom: 4 },
    branchName: { color: '#fff', fontSize: 11, fontWeight: '700', textTransform: 'capitalize', textAlign: 'center' },
    branchRating: { color: colors.purple, fontSize: 10, fontWeight: '700', marginTop: 2 },

    hero: { paddingHorizontal: 24, marginBottom: 32, alignItems: 'center' },
    heroTitle: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', lineHeight: 36, marginBottom: 10 },
    heroSub: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },

    cards: { paddingHorizontal: 20, gap: 16 },
    card: {
        borderRadius: 24, borderWidth: 1.5, padding: 24,
        alignItems: 'flex-start', position: 'relative',
    },
    cardEmoji: { fontSize: 48, marginBottom: 12 },
    cardLabel: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
    cardDesc: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20 },
    cardBtn: {
        borderRadius: 24, paddingHorizontal: 20, paddingVertical: 12,
        alignSelf: 'stretch', alignItems: 'center',
    },
    cardBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    maintenanceBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: '#374151', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4 },
    maintenanceText: { color: '#9ca3af', fontSize: 11, fontWeight: '700' },
});
