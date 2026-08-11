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

                {/* Category Cards — kullanıcı isteği: 4'ü de dikey sütun halinde yan yana
                    (tek satırda) — önceden her biri tam genişlikte, alt alta büyük kart olarak
                    duruyordu. Dar sütuna sığması için açıklama metni ve ayrı "Keşfet" butonu
                    kaldırıldı, kartın tamamı tıklanabilir yapıldı. */}
                <View style={s.cards}>
                    {CATEGORIES.map(cat => (
                        <TouchableOpacity
                            key={cat.id}
                            style={[s.card, { borderColor: cat.borderColor, backgroundColor: cat.bgColor, opacity: cat.enabled ? 1 : 0.5 }]}
                            onPress={() => cat.enabled && navigation.navigate('Category', { category: cat.id })}
                            activeOpacity={cat.enabled ? 0.8 : 1}
                            disabled={!cat.enabled}
                        >
                            {!cat.enabled && (
                                <View style={s.maintenanceBadge}>
                                    <Text style={s.maintenanceText} numberOfLines={1}>{t.maintenance}</Text>
                                </View>
                            )}
                            <Text style={s.cardEmoji}>{cat.emoji}</Text>
                            <Text style={[s.cardLabel, { color: cat.btnColor }]} numberOfLines={2} adjustsFontSizeToFit minimumFontScale={0.75}>
                                {CAT_LABELS[cat.id]}
                            </Text>
                            <View style={[s.cardDot, { backgroundColor: cat.enabled ? cat.btnColor : '#374151' }]} />
                        </TouchableOpacity>
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

    // 4 kategori (Spor/Sosyal/Sanat/Oyunlar) dikey sütun halinde yan yana — kullanıcı isteği.
    cards: { flexDirection: 'row', paddingHorizontal: 13, gap: 6 },
    card: {
        flex: 1, minHeight: 118, borderRadius: 18, borderWidth: 1.5,
        paddingVertical: 16, paddingHorizontal: 6,
        alignItems: 'center', justifyContent: 'center', position: 'relative',
    },
    cardEmoji: { fontSize: 30, marginBottom: 10 },
    cardLabel: { fontSize: 13, fontWeight: '900', textAlign: 'center' },
    cardDot: { width: 6, height: 6, borderRadius: 3, marginTop: 10 },
    maintenanceBadge: { position: 'absolute', top: 6, left: 4, right: 4, backgroundColor: '#374151', borderRadius: 6, paddingHorizontal: 3, paddingVertical: 1, alignItems: 'center' },
    maintenanceText: { color: '#9ca3af', fontSize: 8, fontWeight: '700' },
});
