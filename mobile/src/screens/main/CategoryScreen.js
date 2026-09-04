import { useState, useCallback, useEffect } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import api from '../../services/api';
import { onSocket } from '../../services/socket';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';

// Bu dallar "ilan" (rakip bul) mantığına değil kendi özel ekranlarına gider —
// SubCategory yerine bu ekran adına yönlendirilir, ilan sayacı da gösterilmez.
const SPECIAL_SCREENS = { music: 'MusicHome', cinema: 'CinemaHome', theater: 'TheaterHome', batak: 'BatakHome', okey: 'OkeyHome', chess: 'ChessHome', tavla: 'TavlaHome', friend_finding: 'FriendFindingHome' };
const SPECIAL_BADGE_EMOJI = { music: '🎵', cinema: '🎬', theater: '🎭', batak: '🃏', okey: '🀄', chess: '♞', tavla: '🎲', friend_finding: '🎉' };

const SUB_MAP = {
    SPORTS:  [
        { id: 'tennis',      label: 'Tennis',           labelTR: 'Tenis',              labelRU: 'Теннис',                    emoji: '🎾' },
        { id: 'padel',       label: 'Padel',            labelTR: 'Padel',              labelRU: 'Падел',                     emoji: '🏓', image: require('../../../assets/padel.png') },
        { id: 'volleyball',  label: 'Volleyball',       labelTR: 'Voleybol',           labelRU: 'Волейбол',                  emoji: '🏐' },
        { id: 'football',    label: 'Football',         labelTR: 'Futbol',             labelRU: 'Футбол',                    emoji: '⚽' },
        { id: 'basketball',  label: 'Basketball',       labelTR: 'Basketbol',          labelRU: 'Баскетбол',                 emoji: '🏀' },
        { id: 'running',     label: 'Running',          labelTR: 'Koşu',               labelRU: 'Бег',                       emoji: '🏃' },
        { id: 'wellness',    label: 'Yoga / Pilates / Reformer', labelTR: 'Yoga / Pilates / Reformer', labelRU: 'Йога / Пилатес / Реформер', emoji: '🧘' },
        { id: 'table_tennis',     label: 'Table Tennis',        labelTR: 'Masa Tenisi',         labelRU: 'Настольный теннис',      emoji: '🏓' },
        { id: 'climbing',         label: 'Climbing',            labelTR: 'Tırmanış',            labelRU: 'Скалолазание',           emoji: '🧗' },
        { id: 'archery',          label: 'Archery',             labelTR: 'Okçuluk',             labelRU: 'Стрельба из лука',       emoji: '🏹' },
        { id: 'walking',          label: 'Walking',             labelTR: 'Yürüyüş',             labelRU: 'Ходьба',                 emoji: '🚶' },
        { id: 'foot_tennis',      label: 'Foot Tennis',         labelTR: 'Ayak Tenisi',         labelRU: 'Футбольный теннис',      emoji: '🦶' },
        { id: 'sup_kano',         label: 'SUP & Canoe',         labelTR: 'SUP & Kano',          labelRU: 'SUP и каноэ',            emoji: '🛶' },
        { id: 'handball',         label: 'Handball',            labelTR: 'Hentbol',             labelRU: 'Гандбол',                emoji: '🤾' },
        { id: 'badminton',        label: 'Badminton',           labelTR: 'Badminton',           labelRU: 'Бадминтон',              emoji: '🏸' },
        { id: 'shooting_hunting', label: 'Shooting & Hunting',  labelTR: 'Atıcılık & Avcılık',  labelRU: 'Стрельба и охота',       emoji: '🔫' },
        { id: 'equestrian',       label: 'Equestrian',          labelTR: 'Binicilik',           labelRU: 'Конный спорт',           emoji: '🐎' },
        { id: 'golf',             label: 'Golf',                labelTR: 'Golf',                labelRU: 'Гольф',                  emoji: '⛳' },
        { id: 'fitness_gym',      label: 'Fitness & Gym',       labelTR: 'Fitness & Spor Salonu', labelRU: 'Фитнес и тренажёрный зал', emoji: '🏋️' },
        { id: 'skiing_snowboard', label: 'Skiing & Snowboard',  labelTR: 'Kayak & Snowboard',   labelRU: 'Лыжи и сноуборд',        emoji: '⛷️' },
        { id: 'ice_skating',      label: 'Ice Skating',         labelTR: 'Buz Pateni',          labelRU: 'Катание на коньках',     emoji: '⛸️' },
        { id: 'hiking',           label: 'Hiking',              labelTR: 'Doğa Yürüyüşü',       labelRU: 'Пеший туризм',           emoji: '🥾' },
        { id: 'camping',          label: 'Camping',             labelTR: 'Kamp',                labelRU: 'Кемпинг',                emoji: '🏕️' },
        { id: 'motorcycle',       label: 'Motorcycle Riding',   labelTR: 'Motosiklet',          labelRU: 'Мотоцикл',               emoji: '🏍️' },
        { id: 'extreme_sports',   label: 'Extreme Sports',      labelTR: 'Ekstrem Sporlar',     labelRU: 'Экстремальные виды спорта', emoji: '🪂' },
        { id: 'paintball',        label: 'Paintball',           labelTR: 'Paintball',           labelRU: 'Пейнтбол',               emoji: '🔫' },
        { id: 'airsoft',          label: 'Airsoft',             labelTR: 'Airsoft',             labelRU: 'Страйкбол',              emoji: '🪖' },
    ],
    SOCIAL:  [
        { id: 'friend_finding', label: 'Friend Finding',    labelTR: 'Arkadaş Bulma',   labelRU: 'Поиск друзей',      emoji: '🎉' },
        { id: 'sanal_alem',     label: 'Virtual World',     labelTR: 'Sanal Alem',      labelRU: 'Виртуальный мир',   emoji: '🌐' },
    ],
    ARTS:    [
        { id: 'painting',     label: 'Painting',      labelTR: 'Resim',       labelRU: 'Живопись',        emoji: '🎨' },
        { id: 'music',        label: 'Music',         labelTR: 'Müzik',       labelRU: 'Музыка',          emoji: '🎵' },
        { id: 'theater',      label: 'Theater',       labelTR: 'Tiyatro',     labelRU: 'Театр',           emoji: '🎭' },
        { id: 'cinema',       label: 'Cinema',        labelTR: 'Sinema',      labelRU: 'Кино',            emoji: '🎬' },
        { id: 'literature',   label: 'Literature',    labelTR: 'Edebiyat',    labelRU: 'Литература',      emoji: '📚' },
        { id: 'sculpture',    label: 'Sculpture',     labelTR: 'Heykel',      labelRU: 'Скульптура',      emoji: '🗿' },
        { id: 'architecture', label: 'Architecture',  labelTR: 'Mimari',      labelRU: 'Архитектура',     emoji: '🏛️' },
        { id: 'opera',        label: 'Opera',         labelTR: 'Opera',       labelRU: 'Опера',           emoji: '🎼' },
        { id: 'ceramics',     label: 'Ceramics',      labelTR: 'Seramik',     labelRU: 'Керамика',        emoji: '🏺' },
        { id: 'poetry',       label: 'Poetry',        labelTR: 'Şiir',        labelRU: 'Поэзия',          emoji: '✍️' },
        { id: 'photography',  label: 'Photography',   labelTR: 'Fotoğrafçılık', labelRU: 'Фотография',    emoji: '📷' },
    ],
    GAMES:   [
        { id: 'fps',          label: 'FPS',             labelTR: 'FPS',             labelRU: 'Шутер от первого лица', emoji: '🎯' },
        { id: 'moba',         label: 'MOBA',            labelTR: 'MOBA',            labelRU: 'MOBA',            emoji: '⚔️' },
        { id: 'strategy',     label: 'Strategy',        labelTR: 'Strateji',        labelRU: 'Стратегия',       emoji: '♟️' },
        { id: 'sports_games', label: 'Sports Games',    labelTR: 'Spor Oyunları',   labelRU: 'Спортивные игры', emoji: '🎮' },
        { id: 'boardgames',   label: 'Board Games',     labelTR: 'Kutu Oyunları',   labelRU: 'Настольные игры', emoji: '🎲' },
        { id: 'batak',        label: 'Batak',           labelTR: 'Batak',           labelRU: 'Батак',           emoji: '🃏' },
        { id: 'okey',         label: 'Okey',            labelTR: 'Okey',            labelRU: 'Окей',            emoji: '🀄' },
        { id: 'chess',        label: 'Chess',           labelTR: 'Satranç',         labelRU: 'Шахматы',         emoji: '♞' },
        { id: 'tavla',        label: 'Backgammon',      labelTR: 'Tavla',           labelRU: 'Нарды',           emoji: '🎲' },
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
    const subLabel = (sub) => (lang === 'tr' ? (sub.labelTR || sub.label) : lang === 'ru' ? (sub.labelRU || sub.label) : sub.label);
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
                            const count = counts[sub.id] || 0;
                            return (
                                <TouchableOpacity
                                    key={sub.id}
                                    style={[s.card, { borderColor: accentColor + '40' }]}
                                    onPress={() => navigation.navigate(SPECIAL_SCREENS[sub.id] || 'SubCategory', SPECIAL_SCREENS[sub.id] ? undefined : { category, sub: sub.id })}
                                    activeOpacity={0.75}
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
                                    ) : (
                                        <View style={[s.countBadge, { backgroundColor: accentColor + '20', borderColor: accentColor + '60' }]}>
                                            <Text style={[s.countText, { color: count > 0 ? accentColor : colors.textMuted }]}>
                                                {count > 0 ? t.listings(count) : t.noListings}
                                            </Text>
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
