import { useEffect, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { setUser } from '../../store/slices/authSlice';
import api from '../../services/api';
import colors from '../../theme/colors';
import { NEW_VISUAL } from '../../theme/visual';
import { CAT_PHOTOS } from '../../theme/visualAssets';
import RainbowLogo from '../../components/RainbowLogo';
import useT from '../../hooks/useT';
import { getSubCategoryLabel } from '../../utils/subCategoryLabels';

const CATEGORIES = [
    { id: 'SPORTS', emoji: '🏃', borderColor: '#16a34a', btnColor: '#16a34a', bgColor: '#16a34a12', enabled: true },
    { id: 'SOCIAL', emoji: '🎉', borderColor: '#d97706', btnColor: '#d97706', bgColor: '#d9770612', enabled: true },
    { id: 'ARTS',   emoji: '🎨', borderColor: '#db2777', btnColor: '#db2777', bgColor: '#db277712', enabled: true },
    { id: 'GAMES',  emoji: '🎮', borderColor: '#2563eb', btnColor: '#2563eb', bgColor: '#2563eb12', enabled: true },
];

function firstNameOf(user) {
    const raw = (user?.fullName || user?.username || '').trim();
    return raw.split(/\s+/)[0] || '';
}

function formatWhen(item, t) {
    if (item?.flexibleSchedule) return t.flexibleBanner || '';
    const parts = [];
    if (item?.matchDate) {
        parts.push(new Date(item.matchDate).toLocaleDateString(t.dateLocale, { day: 'numeric', month: 'long', weekday: 'short' }));
    }
    if (item?.matchTime) parts.push(item.matchTime);
    return parts.join(' · ');
}

export default function HomeScreen({ navigation }) {
    const dispatch = useDispatch();
    const user = useSelector(s => s.auth.user);
    const t = useT();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [featured, setFeatured] = useState(null);
    const [featuredKind, setFeaturedKind] = useState(null);
    const [openCount, setOpenCount] = useState(0);

    const CAT_LABELS = {
        SPORTS: t.catLabelSports, SOCIAL: t.catLabelSocial, ARTS: t.catLabelArts, GAMES: t.catLabelGames,
    };

    useEffect(() => {
        const load = async () => {
            try {
                const [meRes, upcomingRes] = await Promise.all([
                    api.get('/auth/me'),
                    api.get('/rivals/my-upcoming').catch(() => ({ data: [] })),
                ]);
                dispatch(setUser(meRes.data));
                const city = meRes.data?.city;
                const openRes = await api.get(city ? `/rivals?city=${encodeURIComponent(city)}` : '/rivals').catch(() => ({ data: [] }));
                const upcoming = Array.isArray(upcomingRes.data) ? upcomingRes.data : [];
                const open = Array.isArray(openRes.data) ? openRes.data : [];
                setOpenCount(open.length);
                if (upcoming[0]) {
                    setFeatured(upcoming[0]);
                    setFeaturedKind('upcoming');
                } else if (open[0]) {
                    setFeatured(open[0]);
                    setFeaturedKind('open');
                } else {
                    setFeatured(null);
                    setFeaturedKind(null);
                }
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

    if (!NEW_VISUAL) {
        return (
            <View style={s.container}>
                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={s.scroll}>
                    <View style={{ paddingTop: 13, paddingBottom: 5, alignItems: 'center' }}>
                        <RainbowLogo />
                    </View>

                    <View style={s.hero}>
                        <Text style={s.heroTitle}>{t.heroTitle}</Text>
                        <Text style={s.heroSub}>{t.heroSub}</Text>
                    </View>

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

    const name = firstNameOf(user);
    const cityLine = [user?.city, openCount > 0 ? t.nearbyOpenCount(openCount) : null].filter(Boolean).join(' · ');
    const heroPhoto = CAT_PHOTOS[(featured?.category || '').toUpperCase()] || CAT_PHOTOS.SPORTS;

    const openFeatured = () => {
        if (!featured?.subCategory) return;
        navigation.navigate('SubCategory', {
            category: (featured.category || 'SPORTS').toUpperCase(),
            sub: featured.subCategory,
            highlightRivalId: featured.id,
        });
    };

    return (
        <View style={s.container}>
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[nv.scroll, { paddingTop: Math.max(insets.top, 12) + 8 }]}
            >
                <View style={nv.brandRow}>
                    <RainbowLogo style={{ fontSize: 18, letterSpacing: 1, fontWeight: '700' }} />
                </View>

                <Text style={nv.hello}>{t.helloName(name || '…')}</Text>
                {!!cityLine && <Text style={nv.sub}>{cityLine}</Text>}

                {featured ? (
                    <TouchableOpacity style={nv.hero} onPress={openFeatured} activeOpacity={0.88}>
                        <Image source={heroPhoto} style={nv.heroImg} />
                        <View style={nv.heroShade} />
                        <View style={nv.heroBody}>
                            <Text style={nv.heroKicker}>
                                {featuredKind === 'upcoming' ? t.featuredUpcoming : t.nearbyListing}
                            </Text>
                            <Text style={nv.heroWhen}>{formatWhen(featured, t)}</Text>
                            <Text style={nv.heroTitle} numberOfLines={2}>
                                {getSubCategoryLabel(featured.subCategory, t.lang)}
                                {featured.matchType === 'DOUBLE' ? ' · 2v2' : featured.teamSize > 1 ? ` · ${featured.teamSize}v${featured.teamSize}` : ''}
                            </Text>
                            {(featured.courtName || featured.location) ? (
                                <Text style={nv.heroPlace} numberOfLines={1}>{featured.courtName || featured.location}</Text>
                            ) : null}
                            {featured.level ? (
                                <View style={nv.levelPill}>
                                    <Text style={nv.levelText}>{t.levelTr?.[featured.level] || featured.level}</Text>
                                </View>
                            ) : null}
                            <View style={nv.heroCta}>
                                <Text style={nv.heroCtaText}>{featuredKind === 'upcoming' ? t.seeListing : t.joinCta}</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                ) : (
                    <View style={nv.emptyHero}>
                        <Text style={nv.emptyHeroText}>{t.noFeaturedYet}</Text>
                    </View>
                )}

                <Text style={nv.section}>{t.whatDoYouWant}</Text>
                <View style={nv.grid}>
                    {CATEGORIES.map(cat => (
                        <TouchableOpacity
                            key={cat.id}
                            style={nv.tile}
                            onPress={() => cat.enabled && navigation.navigate('Category', { category: cat.id })}
                            activeOpacity={0.85}
                            disabled={!cat.enabled}
                        >
                            <Image source={CAT_PHOTOS[cat.id]} style={nv.tileImg} />
                            <View style={nv.tileShade} />
                            <Text style={nv.tileLabel}>{CAT_LABELS[cat.id]}</Text>
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

const nv = StyleSheet.create({
    scroll: { paddingHorizontal: 18, paddingBottom: 40 },
    brandRow: { alignItems: 'flex-start', marginBottom: 18 },
    hello: { color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
    sub: { color: colors.textSecondary, fontSize: 14, fontWeight: '500', marginTop: 6, marginBottom: 20 },
    hero: { height: 220, borderRadius: 28, overflow: 'hidden', marginBottom: 28 },
    heroImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,12,16,0.46)' },
    heroBody: { flex: 1, justifyContent: 'flex-end', padding: 16 },
    heroKicker: { color: colors.purple, fontSize: 11, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
    heroWhen: { color: '#fff', fontSize: 13, fontWeight: '500', marginBottom: 4 },
    heroTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
    heroPlace: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '500', marginBottom: 8 },
    levelPill: { alignSelf: 'flex-start', backgroundColor: 'rgba(200,245,74,0.18)', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4, marginBottom: 12 },
    levelText: { color: colors.purple, fontSize: 11, fontWeight: '700' },
    heroCta: { alignSelf: 'flex-start', backgroundColor: colors.purple, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8 },
    heroCtaText: { color: colors.ctaText, fontSize: 13, fontWeight: '700' },
    emptyHero: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, marginBottom: 28 },
    emptyHeroText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
    section: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 14 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    tile: { width: '47.5%', height: 140, borderRadius: 22, overflow: 'hidden' },
    tileImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    tileShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,12,16,0.32)' },
    tileLabel: { position: 'absolute', left: 12, bottom: 12, color: '#fff', fontSize: 17, fontWeight: '700' },
});
