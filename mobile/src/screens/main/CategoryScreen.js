import { useState, useCallback, useEffect } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { onSocket } from '../../services/socket';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

const ENABLED_SUBS = new Set([
    'tennis', 'padel', 'volleyball', 'music', 'cinema', 'theater', 'fps', 'moba', 'strategy', 'sports_games', 'boardgames', 'batak', 'okey', 'chess', 'tavla', 'friend_finding',
    // Basitleştirilmiş sekme setiyle (Etkinlik/Destek/Ekipman/Medya/Yazılar/Bilet Al/Haberler/Arşiv) açılan yeni dallar
    'airsoft', 'archery', 'camping', 'climbing', 'equestrian', 'extreme_sports', 'fitness_gym', 'foot_tennis', 'paintball', 'sup_kano', 'running', 'walking', 'hiking',
    'sanal_alem',
]);

// Bu dallar "ilan" (rakip bul) mantığına değil kendi özel ekranlarına gider —
// SubCategory yerine bu ekran adına yönlendirilir, ilan sayacı da gösterilmez.
const SPECIAL_SCREENS = { music: 'MusicHome', cinema: 'CinemaHome', theater: 'TheaterHome', batak: 'BatakHome', okey: 'OkeyHome', chess: 'ChessHome', tavla: 'TavlaHome', friend_finding: 'FriendFindingHome' };
const SPECIAL_BADGE_EMOJI = { music: '🎵', cinema: '🎬', theater: '🎭', batak: '🃏', okey: '🀄', chess: '♞', tavla: '🎲', friend_finding: '🎉' };

const SUB_MAP = {
    SPORTS:  [
        { id: 'tennis',      label: 'Tennis',           labelTR: 'Tenis',              emoji: '🎾' },
        { id: 'padel',       label: 'Padel',            labelTR: 'Padel',              emoji: '🏓', image: require('../../../assets/padel.png') },
        { id: 'volleyball',  label: 'Volleyball',       labelTR: 'Voleybol',           emoji: '🏐' },
        { id: 'football',    label: 'Football',         labelTR: 'Futbol',             emoji: '⚽' },
        { id: 'basketball',  label: 'Basketball',       labelTR: 'Basketbol',          emoji: '🏀' },
        { id: 'running',     label: 'Running',          labelTR: 'Koşu',               emoji: '🏃' },
        { id: 'wellness',    label: 'Yoga / Pilates / Reformer', labelTR: 'Yoga / Pilates / Reformer', emoji: '🧘' },
        { id: 'table_tennis',     label: 'Table Tennis',        labelTR: 'Masa Tenisi',         emoji: '🏓' },
        { id: 'climbing',         label: 'Climbing',            labelTR: 'Tırmanış',            emoji: '🧗' },
        { id: 'archery',          label: 'Archery',             labelTR: 'Okçuluk',             emoji: '🏹' },
        { id: 'walking',          label: 'Walking',             labelTR: 'Yürüyüş',             emoji: '🚶' },
        { id: 'foot_tennis',      label: 'Foot Tennis',         labelTR: 'Ayak Tenisi',         emoji: '🦶' },
        { id: 'sup_kano',         label: 'SUP & Canoe',         labelTR: 'SUP & Kano',          emoji: '🛶' },
        { id: 'handball',         label: 'Handball',            labelTR: 'Hentbol',             emoji: '🤾' },
        { id: 'badminton',        label: 'Badminton',           labelTR: 'Badminton',           emoji: '🏸' },
        { id: 'shooting_hunting', label: 'Shooting & Hunting',  labelTR: 'Atıcılık & Avcılık',  emoji: '🔫' },
        { id: 'equestrian',       label: 'Equestrian',          labelTR: 'Binicilik',           emoji: '🐎' },
        { id: 'golf',             label: 'Golf',                labelTR: 'Golf',                emoji: '⛳' },
        { id: 'fitness_gym',      label: 'Fitness & Gym',       labelTR: 'Fitness & Spor Salonu', emoji: '🏋️' },
        { id: 'skiing_snowboard', label: 'Skiing & Snowboard',  labelTR: 'Kayak & Snowboard',   emoji: '⛷️' },
        { id: 'ice_skating',      label: 'Ice Skating',         labelTR: 'Buz Pateni',          emoji: '⛸️' },
        { id: 'hiking',           label: 'Hiking',              labelTR: 'Doğa Yürüyüşü',       emoji: '🥾' },
        { id: 'camping',          label: 'Camping',             labelTR: 'Kamp',                emoji: '🏕️' },
        { id: 'motorcycle',       label: 'Motorcycle Riding',   labelTR: 'Motosiklet',          emoji: '🏍️' },
        { id: 'extreme_sports',   label: 'Extreme Sports',      labelTR: 'Ekstrem Sporlar',     emoji: '🪂' },
        { id: 'paintball',        label: 'Paintball',           labelTR: 'Paintball',           emoji: '🔫' },
        { id: 'airsoft',          label: 'Airsoft',             labelTR: 'Airsoft',             emoji: '🪖' },
    ],
    SOCIAL:  [
        { id: 'friend_finding', label: 'Friend Finding',    labelTR: 'Arkadaş Bulma',   emoji: '🎉' },
        { id: 'sanal_alem',     label: 'Virtual World',     labelTR: 'Sanal Alem',      emoji: '🌐' },
    ],
    ARTS:    [
        { id: 'painting',     label: 'Painting',      labelTR: 'Resim',       emoji: '🎨' },
        { id: 'music',        label: 'Music',         labelTR: 'Müzik',       emoji: '🎵' },
        { id: 'theater',      label: 'Theater',       labelTR: 'Tiyatro',     emoji: '🎭' },
        { id: 'cinema',       label: 'Cinema',        labelTR: 'Sinema',      emoji: '🎬' },
        { id: 'literature',   label: 'Literature',    labelTR: 'Edebiyat',    emoji: '📚' },
        { id: 'sculpture',    label: 'Sculpture',     labelTR: 'Heykel',      emoji: '🗿' },
        { id: 'architecture', label: 'Architecture',  labelTR: 'Mimari',      emoji: '🏛️' },
        { id: 'opera',        label: 'Opera',         labelTR: 'Opera',       emoji: '🎼' },
        { id: 'ceramics',     label: 'Ceramics',      labelTR: 'Seramik',     emoji: '🏺' },
        { id: 'poetry',       label: 'Poetry',        labelTR: 'Şiir',        emoji: '✍️' },
        { id: 'photography',  label: 'Photography',   labelTR: 'Fotoğrafçılık', emoji: '📷' },
    ],
    GAMES:   [
        { id: 'fps',          label: 'FPS',             labelTR: 'FPS',             emoji: '🎯' },
        { id: 'moba',         label: 'MOBA',            labelTR: 'MOBA',            emoji: '⚔️' },
        { id: 'strategy',     label: 'Strategy',        labelTR: 'Strateji',        emoji: '♟️' },
        { id: 'sports_games', label: 'Sports Games',    labelTR: 'Spor Oyunları',   emoji: '🎮' },
        { id: 'boardgames',   label: 'Board Games',     labelTR: 'Kutu Oyunları',   emoji: '🎲' },
        { id: 'batak',        label: 'Batak',           labelTR: 'Batak',           emoji: '🃏' },
        { id: 'okey',         label: 'Okey',            labelTR: 'Okey',            emoji: '🀄' },
        { id: 'chess',        label: 'Chess',           labelTR: 'Satranç',         emoji: '♞' },
        { id: 'tavla',        label: 'Backgammon',      labelTR: 'Tavla',           emoji: '🎲' },
    ],
};

const CAT_COLOR = {
    SPORTS:  '#16a34a',
    SOCIAL:  '#d97706',
    ARTS:    '#db2777',
    GAMES:   '#2563eb',
};

const CAT_LABEL_KEY = {
    SPORTS: 'catLabelSports',
    SOCIAL: 'catLabelSocial',
    ARTS:   'catLabelArts',
    GAMES:  'catLabelGames',
};

export default function CategoryScreen({ route, navigation }) {
    const { category } = route.params;
    const accentColor = CAT_COLOR[category] || colors.purple;
    const t = useT();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const subLabel = (sub) => (lang === 'tr' ? (sub.labelTR || sub.label) : sub.label);
    const categoryLabel = t[CAT_LABEL_KEY[category]] || category;

    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);

    // Açık ilan sayısı en çoktan en aza; eşitse (veya ilan yoksa) alfabetik sıra
    const subs = [...(SUB_MAP[category] || [])].sort((a, b) => {
        const ca = counts[a.id] || 0, cb = counts[b.id] || 0;
        if (cb !== ca) return cb - ca;
        return subLabel(a).localeCompare(subLabel(b));
    });

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
                <Text style={s.title}>{categoryLabel}</Text>
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
                                    onPress={() => enabled && navigation.navigate(SPECIAL_SCREENS[sub.id] || 'SubCategory', SPECIAL_SCREENS[sub.id] ? undefined : { category, sub: sub.id })}
                                    activeOpacity={enabled ? 0.75 : 1}
                                >
                                    {sub.image ? (
                                        <Image source={sub.image} style={s.emojiImage} resizeMode="contain" />
                                    ) : (
                                        <Text style={s.emoji}>{sub.emoji}</Text>
                                    )}
                                    <Text style={s.cardLabel}>{subLabel(sub)}</Text>
                                    {SPECIAL_SCREENS[sub.id] ? (
                                        <View style={[s.countBadge, { backgroundColor: accentColor + '20', borderColor: accentColor + '60' }]}>
                                            <Text style={[s.countText, { color: accentColor }]}>{SPECIAL_BADGE_EMOJI[sub.id]}</Text>
                                        </View>
                                    ) : enabled ? (
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
    emoji:      { fontSize: 22, lineHeight: 26 },
    emojiImage: { width: 26, height: 26 },
    cardLabel:  { color: '#fff', fontSize: 13, fontWeight: '700', flexShrink: 0 },
    countBadge: { borderRadius: 6, paddingHorizontal: 3, paddingVertical: 0, borderWidth: 1 },
    countText:  { fontSize: 10, fontWeight: '700' },
});
