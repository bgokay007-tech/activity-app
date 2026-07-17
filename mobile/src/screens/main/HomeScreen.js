import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { setUser } from '../../store/slices/authSlice';
import api from '../../services/api';
import colors from '../../theme/colors';
import RainbowLogo from '../../components/RainbowLogo';
import useT from '../../hooks/useT';

const CATEGORIES = [
    { id: 'SPORTS', emoji: '🏃', borderColor: '#16a34a', btnColor: '#16a34a', bgColor: '#16a34a12', enabled: true },
    { id: 'SOCIAL', emoji: '🎉', borderColor: '#d97706', btnColor: '#d97706', bgColor: '#d9770612', enabled: true },
    { id: 'ARTS',   emoji: '🎨', borderColor: '#db2777', btnColor: '#db2777', bgColor: '#db277712', enabled: true },
    { id: 'GAMES',  emoji: '🎮', borderColor: '#2563eb', btnColor: '#2563eb', bgColor: '#2563eb12', enabled: true },
];

export default function HomeScreen({ navigation }) {
    const dispatch = useDispatch();
    const user = useSelector(s => s.auth.user);
    const t = useT();
    const [loading, setLoading] = useState(true);

    const CAT_LABELS = {
        SPORTS: t.catLabelSports, SOCIAL: t.catLabelSocial, ARTS: t.catLabelArts, GAMES: t.catLabelGames,
    };

    const CAT_DESC = {
        SPORTS: t.catDescSports,
        SOCIAL: t.catDescSocial,
        ARTS:   t.catDescArts,
        GAMES:  t.catDescGames,
    };

    const CAT_EXPLORE = {
        SPORTS: t.exploreSports, SOCIAL: t.exploreSocial, ARTS: t.exploreArts, GAMES: t.exploreGames,
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [meRes] = await Promise.all([
                    api.get('/auth/me'),
                ]);
                dispatch(setUser(meRes.data));
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
                <View style={{ paddingTop: 13, paddingBottom: 5, alignItems: 'center' }}>
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
                                <Text style={s.cardBtnText}>{cat.enabled ? CAT_EXPLORE[cat.id] : t.comingSoon}</Text>
                            </TouchableOpacity>
                        </View>
                    ))}
                </View>

            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    scroll: { paddingTop: 53, paddingBottom: 37 },

    hero: { paddingHorizontal: 21, marginBottom: 32, alignItems: 'center' },
    heroTitle: { color: '#fff', fontSize: 28, fontWeight: '900', textAlign: 'center', lineHeight: 36, marginBottom: 10 },
    heroSub: { color: colors.textSecondary, fontSize: 14, textAlign: 'center', lineHeight: 20 },

    cards: { paddingHorizontal: 17, gap: 3 },
    card: {
        borderRadius: 24, borderWidth: 1.5, padding: 21,
        alignItems: 'flex-start', position: 'relative',
    },
    cardEmoji: { fontSize: 48, marginBottom: 12 },
    cardLabel: { fontSize: 24, fontWeight: '900', marginBottom: 8 },
    cardDesc: { color: colors.textSecondary, fontSize: 14, lineHeight: 20, marginBottom: 20 },
    cardBtn: {
        borderRadius: 24, paddingHorizontal: 17, paddingVertical: 9,
        alignSelf: 'stretch', alignItems: 'center',
    },
    cardBtnText: { color: '#fff', fontWeight: '800', fontSize: 15 },
    maintenanceBadge: { position: 'absolute', top: 12, right: 12, backgroundColor: '#374151', borderRadius: 8, paddingHorizontal: 5, paddingVertical: 1 },
    maintenanceText: { color: '#9ca3af', fontSize: 11, fontWeight: '700' },
});
