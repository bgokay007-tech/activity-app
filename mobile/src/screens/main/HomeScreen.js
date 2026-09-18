import { useCallback, useState } from 'react';
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator, Image } from 'react-native';
import { useDispatch, useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import { setUser } from '../../store/slices/authSlice';
import api from '../../services/api';
import colors from '../../theme/colors';
import { NEW_VISUAL } from '../../theme/visual';
import { CAT_PHOTOS, photoForSub } from '../../theme/visualAssets';
import RainbowLogo from '../../components/RainbowLogo';
import CityPickerModal from '../../components/CityPickerModal';
import useT from '../../hooks/useT';
import { getSubCategoryLabel } from '../../utils/subCategoryLabels';

const HOME_CITY_KEY = 'home_listings_city';

const CATEGORIES = [
    { id: 'SPORTS', emoji: '🏃', borderColor: '#16a34a', btnColor: '#16a34a', bgColor: '#16a34a12', enabled: true },
    { id: 'SOCIAL', emoji: '🎉', borderColor: '#d97706', btnColor: '#d97706', bgColor: '#d9770612', enabled: true },
    { id: 'ARTS',   emoji: '🎨', borderColor: '#db2777', btnColor: '#db2777', bgColor: '#db277712', enabled: true },
    { id: 'GAMES',  emoji: '🎮', borderColor: '#2563eb', btnColor: '#2563eb', bgColor: '#2563eb12', enabled: true },
];

const TR_PROVINCES = [
    'Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya',
    'Ardahan','Artvin','Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik',
    'Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum',
    'Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir',
    'Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul',
    'İzmir','Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kilis',
    'Kırıkkale','Kırklareli','Kırşehir','Kocaeli','Konya','Kütahya','Malatya','Manisa',
    'Mardin','Mersin','Muğla','Muş','Nevşehir','Niğde','Ordu','Osmaniye','Rize',
    'Sakarya','Samsun','Siirt','Sinop','Sivas','Şanlıurfa','Şırnak','Tekirdağ',
    'Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak',
];

function firstNameOf(user) {
    const raw = (user?.fullName || user?.username || '').trim();
    return raw.split(/\s+/)[0] || '';
}

function asList(res) {
    const d = res?.data;
    if (Array.isArray(d)) return d;
    if (Array.isArray(d?.requests)) return d.requests;
    return [];
}

function foldCity(s) {
    return String(s || '')
        .toLocaleLowerCase('tr-TR')
        .replace(/[ıiİI]/g, 'i')
        .replace(/ğ/g, 'g')
        .replace(/ü/g, 'u')
        .replace(/ş/g, 's')
        .replace(/ö/g, 'o')
        .replace(/ç/g, 'c')
        .trim();
}

function matchProvince(raw) {
    const f = foldCity(String(raw || '').replace(/\b(province|ili|oblast|ilcesi|ilcesi)\b/gi, ''));
    if (!f) return null;
    const exact = TR_PROVINCES.find(p => foldCity(p) === f);
    if (exact) return exact;
    // "İstanbul / Kadıköy" gibi değerlerde önce il kısmını dene
    const head = foldCity(String(raw || '').split('/')[0]);
    const byHead = TR_PROVINCES.find(p => foldCity(p) === head);
    if (byHead) return byHead;
    return TR_PROVINCES.find(p => f.includes(foldCity(p)) || foldCity(p).includes(f)) || null;
}

function cityFromProfile(user) {
    const raw = String(user?.city || '').split('/')[0].trim();
    return matchProvince(raw) || raw || null;
}

function listingInCity(item, city) {
    if (!city) return true;
    const c = foldCity(city);
    if (!c) return true;
    const hay = foldCity([item?.location, item?.courtAddress, item?.courtName].filter(Boolean).join(' '));
    return hay.includes(c);
}

function isOwnListing(item, userId) {
    if (!item || !userId) return false;
    return item.senderId === userId || item.sender?.id === userId;
}

function isMyMatch(item, userId) {
    if (!item || !userId) return false;
    if (item.senderId === userId || item.sender?.id === userId) return true;
    if ((item.participants || []).some(p => p?.id === userId)) return true;
    if ((item.senderTeam || []).some(p => p?.id === userId)) return true;
    if ((item.unassignedPlayers || []).some(p => p?.id === userId)) return true;
    if ((item.substitutePlayers || []).some(p => p?.id === userId)) return true;
    return false;
}

function matchStartDate(item) {
    if (!item?.matchDate || !item?.matchTime) return null;
    const [h, min] = String(item.matchTime).split(':').map(Number);
    const d = new Date(item.matchDate);
    if (isNaN(d) || Number.isNaN(h)) return null;
    d.setHours(h, min || 0, 0, 0);
    return d;
}

function matchHasStarted(item, now) {
    const d = matchStartDate(item);
    return !!(d && now >= d);
}

function matchHasEnded(item, now) {
    const d = matchStartDate(item);
    if (!d) return false;
    return now >= new Date(d.getTime() + (item.duration || 90) * 60 * 1000);
}

function pickHeroMatch(list, userId, now) {
    const mine = (list || []).filter(m => isMyMatch(m, userId));
    const playing = mine.filter(m => matchHasStarted(m, now) && !matchHasEnded(m, now))
        .sort((a, b) => (matchStartDate(a)?.getTime() || 0) - (matchStartDate(b)?.getTime() || 0));
    if (playing[0]) return { match: playing[0], phase: 'playing' };
    const upcoming = mine.filter(m => !matchHasStarted(m, now))
        .sort((a, b) => (matchStartDate(a)?.getTime() || Infinity) - (matchStartDate(b)?.getTime() || Infinity));
    if (upcoming[0]) return { match: upcoming[0], phase: 'upcoming' };
    return { match: null, phase: null };
}

async function detectProvince() {
    try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return null;
        let loc = await Location.getLastKnownPositionAsync({});
        if (!loc) loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
        if (!loc) return null;
        const [geo] = await Location.reverseGeocodeAsync(loc.coords);
        return matchProvince(geo?.region || geo?.subregion || geo?.city) || String(geo?.region || geo?.city || '').trim() || null;
    } catch {
        return null;
    }
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

function listingMeta(item) {
    if (item?.matchType === 'DOUBLE') return '2v2';
    if (item?.teamSize > 1) return `${item.teamSize}v${item.teamSize}`;
    return '';
}

export default function HomeScreen({ navigation }) {
    const dispatch = useDispatch();
    const user = useSelector(s => s.auth.user);
    const lang = useSelector(s => s.lang?.lang || 'en');
    const t = useT();
    const insets = useSafeAreaInsets();
    const [loading, setLoading] = useState(true);
    const [city, setCity] = useState(null);
    const [hasInterests, setHasInterests] = useState(true);
    const [myMatches, setMyMatches] = useState([]);
    const [nowTick, setNowTick] = useState(0);
    const [openListings, setOpenListings] = useState([]);
    const [showCityPicker, setShowCityPicker] = useState(false);
    const [listingsLoading, setListingsLoading] = useState(false);

    const CAT_LABELS = {
        SPORTS: t.catLabelSports, SOCIAL: t.catLabelSocial, ARTS: t.catLabelArts, GAMES: t.catLabelGames,
    };

    const loadOpenListingsForCity = useCallback(async (resolvedCity, myId, mySubs) => {
        const rivalsRes = await api.get(resolvedCity ? `/rivals?city=${encodeURIComponent(resolvedCity)}` : '/rivals').catch(() => ({ data: [] }));
        const pool = asList(rivalsRes).filter(r => {
            if (!listingInCity(r, resolvedCity)) return false;
            if (mySubs.size === 0) return false;
            return mySubs.has(r.subCategory);
        });
        setOpenListings(pool.filter(r => !isOwnListing(r, myId)).concat(pool.filter(r => isOwnListing(r, myId))));
    }, []);

    useFocusEffect(useCallback(() => {
        let alive = true;
        const load = async () => {
            try {
                const meRes = await api.get('/auth/me');
                if (alive) dispatch(setUser(meRes.data));
                const myId = meRes.data?.id;
                const mySubs = new Set(
                    (meRes.data?.interests || []).filter(i => i && !i.hidden && i.subCategory).map(i => i.subCategory)
                );
                // Kullanıcı isteği: en son seçilen il kalıcı default olsun; yoksa GPS, yoksa profil ili.
                const savedRaw = await AsyncStorage.getItem(HOME_CITY_KEY).catch(() => null);
                const savedCity = matchProvince(savedRaw) || (savedRaw ? String(savedRaw).split('/')[0].trim() : null);
                const gpsCity = savedCity ? null : await detectProvince();
                const resolvedCity = savedCity || matchProvince(gpsCity) || cityFromProfile(meRes.data);
                const upcomingRes = await api.get('/rivals/my-upcoming').catch(() => ({ data: [] }));
                if (!alive) return;
                const upcoming = asList(upcomingRes);
                setCity(resolvedCity);
                setHasInterests(mySubs.size > 0);
                setMyMatches(upcoming.filter(m => isMyMatch(m, myId)));
                await loadOpenListingsForCity(resolvedCity, myId, mySubs);
            } catch (e) {
                console.warn('HomeScreen load error:', e?.message);
            } finally {
                if (alive) setLoading(false);
            }
        };
        load();
        // Saat gelince "Yaklaşan" → "Şu an oynadığınız maç" geçişi sayfa yenilemeden olsun.
        const tick = setInterval(() => { if (alive) setNowTick(n => n + 1); }, 1000);
        return () => { alive = false; clearInterval(tick); };
    }, [dispatch, loadOpenListingsForCity]));

    const applyCity = async (raw) => {
        const next = matchProvince(raw) || String(raw || '').split('/')[0].trim() || null;
        if (!next) return;
        setShowCityPicker(false);
        setCity(next);
        setListingsLoading(true);
        try {
            await AsyncStorage.setItem(HOME_CITY_KEY, next);
            const mySubs = new Set(
                (user?.interests || []).filter(i => i && !i.hidden && i.subCategory).map(i => i.subCategory)
            );
            await loadOpenListingsForCity(next, user?.id, mySubs);
        } catch (e) {
            console.warn('HomeScreen city change error:', e?.message);
        } finally {
            setListingsLoading(false);
        }
    };

    const openListing = (item) => {
        if (!item?.subCategory) return;
        navigation.navigate('SubCategory', {
            category: (item.category || 'SPORTS').toUpperCase(),
            sub: item.subCategory,
            highlightRivalId: item.id,
        });
    };

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
    const listPad = Math.max(40, 56 + insets.bottom + 16);
    const { match: heroMatch, phase: heroPhase } = pickHeroMatch(myMatches, user?.id, new Date(nowTick >= 0 ? Date.now() : Date.now()));

    return (
        <View style={s.container}>
            <CityPickerModal
                visible={showCityPicker}
                onClose={() => setShowCityPicker(false)}
                onSelect={applyCity}
                currentValue={city || ''}
                provinceOnly
            />
            <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={[nv.scroll, { paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: listPad }]}
            >
                <View style={nv.brandRow}>
                    <RainbowLogo style={{ fontSize: 18, letterSpacing: 1, fontWeight: '700' }} />
                </View>

                <Text style={nv.hello}>{t.helloName(name || '…')}</Text>
                <Text style={[nv.section, { marginTop: 18 }]}>{t.whatDoYouWant}</Text>
                <View style={[nv.grid, { marginBottom: 22 }]}>
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

                {heroMatch ? (
                    <TouchableOpacity style={nv.hero} onPress={() => openListing(heroMatch)} activeOpacity={0.88}>
                        <Image
                            source={photoForSub(heroMatch.subCategory, heroMatch.category) || CAT_PHOTOS.SPORTS}
                            style={nv.heroImg}
                        />
                        <View style={nv.heroShade} />
                        <View style={nv.heroBody}>
                            <Text style={nv.heroKicker}>{heroPhase === 'playing' ? t.featuredNowPlaying : t.featuredUpcoming}</Text>
                            <Text style={nv.heroWhen}>{formatWhen(heroMatch, t)}</Text>
                            <Text style={nv.heroTitle} numberOfLines={2}>
                                {getSubCategoryLabel(heroMatch.subCategory, lang)}
                                {listingMeta(heroMatch) ? ` · ${listingMeta(heroMatch)}` : ''}
                            </Text>
                            {(heroMatch.courtName || heroMatch.location) ? (
                                <Text style={nv.heroPlace} numberOfLines={1}>{heroMatch.courtName || heroMatch.location}</Text>
                            ) : null}
                            <View style={nv.heroCta}>
                                <Text style={nv.heroCtaText}>{heroPhase === 'playing' ? t.seeYourMatch : t.seeListing}</Text>
                            </View>
                        </View>
                    </TouchableOpacity>
                ) : null}

                <View style={nv.sectionRow}>
                    <Text style={[nv.section, { marginBottom: 0, flexShrink: 1 }]}>
                        {t.homeOpenListings}
                        {city ? ` · ${city}` : ''}
                    </Text>
                    <TouchableOpacity
                        onPress={() => setShowCityPicker(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        style={nv.changeCityBtn}
                    >
                        <Text style={nv.changeCityTxt}>{t.changeCityBtn || 'Değiştir'}</Text>
                    </TouchableOpacity>
                </View>
                {listingsLoading ? (
                    <ActivityIndicator color={colors.purple} style={{ marginVertical: 16 }} />
                ) : !hasInterests ? (
                    <TouchableOpacity style={nv.emptyHero} onPress={() => navigation.navigate('Profile')} activeOpacity={0.85}>
                        <Text style={nv.emptyHeroText}>{t.addSportsInProfile}</Text>
                    </TouchableOpacity>
                ) : openListings.length === 0 ? (
                    <View style={nv.emptyHero}>
                        <Text style={nv.emptyHeroText}>{t.noListingsInCities}</Text>
                    </View>
                ) : (
                    openListings.slice(0, 12).map(item => {
                        const mine = isOwnListing(item, user?.id);
                        const photo = photoForSub(item.subCategory, item.category) || CAT_PHOTOS[(item.category || '').toUpperCase()] || CAT_PHOTOS.SPORTS;
                        const meta = listingMeta(item);
                        return (
                            <TouchableOpacity key={item.id} style={nv.row} onPress={() => openListing(item)} activeOpacity={0.85}>
                                <Image source={photo} style={nv.rowImg} />
                                <View style={nv.rowBody}>
                                    <Text style={nv.rowKicker}>{mine ? t.yourListing : t.nearbyListing}</Text>
                                    <Text style={nv.rowTitle} numberOfLines={1}>
                                        {getSubCategoryLabel(item.subCategory, lang)}
                                        {meta ? ` · ${meta}` : ''}
                                    </Text>
                                    <Text style={nv.rowMeta} numberOfLines={1}>{formatWhen(item, t) || item.location || ''}</Text>
                                    {(item.courtName || item.location) ? (
                                        <Text style={nv.rowPlace} numberOfLines={1}>{item.courtName || item.location}</Text>
                                    ) : null}
                                </View>
                            </TouchableOpacity>
                        );
                    })
                )}
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
    scroll: { paddingHorizontal: 18 },
    brandRow: { alignItems: 'flex-start', marginBottom: 18 },
    hello: { color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
    hero: { height: 200, borderRadius: 28, overflow: 'hidden', marginBottom: 22 },
    heroImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,12,16,0.46)' },
    heroBody: { flex: 1, justifyContent: 'flex-end', padding: 16 },
    heroKicker: { color: colors.purple, fontSize: 11, fontWeight: '700', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.6 },
    heroWhen: { color: '#fff', fontSize: 13, fontWeight: '500', marginBottom: 4 },
    heroTitle: { color: '#fff', fontSize: 22, fontWeight: '700', marginBottom: 4 },
    heroPlace: { color: 'rgba(255,255,255,0.78)', fontSize: 13, fontWeight: '500', marginBottom: 8 },
    heroCta: { alignSelf: 'flex-start', backgroundColor: colors.purple, borderRadius: 14, paddingHorizontal: 16, paddingVertical: 8 },
    heroCtaText: { color: colors.ctaText, fontSize: 13, fontWeight: '700' },
    emptyHero: { backgroundColor: colors.surface, borderRadius: 24, padding: 20, marginBottom: 16 },
    emptyHeroText: { color: colors.textSecondary, fontSize: 14, fontWeight: '500' },
    section: { color: colors.text, fontSize: 18, fontWeight: '700', marginBottom: 14 },
    sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    changeCityBtn: {
        paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8,
        backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    },
    changeCityTxt: { color: colors.purple, fontSize: 11, fontWeight: '800' },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    tile: { width: '47.5%', height: 140, borderRadius: 22, overflow: 'hidden' },
    tileImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    tileShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,12,16,0.32)' },
    tileLabel: { position: 'absolute', left: 12, bottom: 12, color: '#fff', fontSize: 17, fontWeight: '700' },
    row: {
        flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 18,
        overflow: 'hidden', marginBottom: 10, borderWidth: 1, borderColor: colors.border,
    },
    rowImg: { width: 88, height: 88 },
    rowBody: { flex: 1, paddingHorizontal: 12, paddingVertical: 10, justifyContent: 'center' },
    rowKicker: { color: colors.purple, fontSize: 11, fontWeight: '700', marginBottom: 2 },
    rowTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
    rowMeta: { color: colors.textSecondary, fontSize: 12, fontWeight: '500', marginTop: 3 },
    rowPlace: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
});
