import { useState, useCallback, useEffect, useMemo } from 'react';
import { View, Text, Image, ScrollView, TouchableOpacity, Pressable, StyleSheet, ActivityIndicator, TextInput, KeyboardAvoidingView, Platform } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import api from '../../services/api';
import { onSocket } from '../../services/socket';
import colors from '../../theme/colors';
import { NEW_VISUAL } from '../../theme/visual';
import { photoForSub, SUB_PHOTOS } from '../../theme/visualAssets';
import useT from '../../hooks/useT';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Bu dallar "ilan" (rakip bul) mantığına değil kendi özel ekranlarına gider —
// SubCategory yerine bu ekran adına yönlendirilir, ilan sayacı da gösterilmez.
const SPECIAL_SCREENS = { music: 'MusicHome', cinema: 'CinemaHome', theater: 'TheaterHome', batak: 'BatakHome', okey: 'OkeyHome', chess: 'ChessHome', tavla: 'TavlaHome', friend_finding: 'FriendFindingHome' };
const SPECIAL_BADGE_EMOJI = { music: '🎵', cinema: '🎬', theater: '🎭', batak: '🃏', okey: '🀄', chess: '♞', tavla: '🎲', friend_finding: '🎉' };

const FAV_KEY = 'activity_fav_subs_SPORTS';
const RECENT_KEY = 'activity_recent_subs_SPORTS';

const COURT_SUBS = new Set([
    'tennis', 'padel', 'badminton', 'table_tennis', 'football', 'basketball',
    'volleyball', 'handball', 'golf', 'ice_skating', 'wellness', 'fitness_gym',
]);

// ids sırası = ilan sayısı eşitken popülerlik (soldan sağa). Grup içinde önce açık
// ilan sayısı, eşitse bu sıra kullanılır.
const SPORT_GROUPS = [
    { id: 'racket', key: 'sportGroupRacket', emoji: '🎾', ids: ['tennis', 'padel', 'table_tennis', 'badminton'] },
    { id: 'team', key: 'sportGroupTeam', emoji: '⚽', ids: ['volleyball', 'football', 'basketball', 'foot_tennis', 'handball'] },
    { id: 'outdoor', key: 'sportGroupOutdoor', emoji: '🥾', ids: ['running', 'walking', 'hiking', 'camping', 'climbing', 'golf', 'equestrian', 'archery', 'sup_kano'] },
    { id: 'studio', key: 'sportGroupStudio', emoji: '🧘', ids: ['wellness', 'fitness_gym', 'ice_skating'] },
    { id: 'motor', key: 'sportGroupMotor', emoji: '🏍️', ids: ['motorcycle', 'skiing_snowboard', 'paintball', 'airsoft', 'extreme_sports', 'shooting_hunting'] },
];

// Fotoğrafı olmayan kartlarda stok spor görseli yerine dal rengi — 19 dal aynı
// stoğa düşünce hangisinin hangisi olduğu kayboluyordu.
const SUB_TINT = {
    tennis: '#166534', padel: '#3f6212', badminton: '#115e59', table_tennis: '#1e3a8a', foot_tennis: '#365314',
    football: '#14532d', basketball: '#7c2d12', volleyball: '#1e40af', handball: '#9a3412',
    running: '#854d0e', walking: '#57534e', hiking: '#3f6212', camping: '#44403c', climbing: '#9a3412',
    sup_kano: '#0e7490', archery: '#7f1d1d', equestrian: '#78350f', golf: '#166534',
    wellness: '#6b21a8', fitness_gym: '#334155', ice_skating: '#1e3a5f',
    motorcycle: '#1c1917', extreme_sports: '#9f1239', paintball: '#3f3f46', airsoft: '#365314',
    skiing_snowboard: '#164e63', shooting_hunting: '#44403c',
};

const SUB_MAP = {
    SPORTS:  [
        { id: 'tennis',      label: 'Tennis',           labelTR: 'Tenis',              labelRU: 'Теннис',                    labelDE: 'Tennis',                     emoji: '🎾' },
        { id: 'padel',       label: 'Padel',            labelTR: 'Padel',              labelRU: 'Падел',                     labelDE: 'Padel',                      emoji: '🏓', image: require('../../../assets/padel.png') },
        { id: 'volleyball',  label: 'Volleyball',       labelTR: 'Voleybol',           labelRU: 'Волейбол',                  labelDE: 'Volleyball',                 emoji: '🏐' },
        { id: 'football',    label: 'Football',         labelTR: 'Futbol',             labelRU: 'Футбол',                    labelDE: 'Fußball',                    emoji: '⚽' },
        { id: 'basketball',  label: 'Basketball',       labelTR: 'Basketbol',          labelRU: 'Баскетбол',                 labelDE: 'Basketball',                 emoji: '🏀' },
        { id: 'running',     label: 'Running',          labelTR: 'Koşu',               labelRU: 'Бег',                       labelDE: 'Laufen',                     emoji: '🏃' },
        { id: 'wellness',    label: 'Yoga / Pilates / Reformer', labelTR: 'Yoga / Pilates / Reformer', labelRU: 'Йога / Пилатес / Реформер', labelDE: 'Yoga / Pilates / Reformer', emoji: '🧘' },
        { id: 'table_tennis',     label: 'Table Tennis',        labelTR: 'Masa Tenisi',         labelRU: 'Настольный теннис',      labelDE: 'Tischtennis',           emoji: '🏓' },
        { id: 'climbing',         label: 'Climbing',            labelTR: 'Tırmanış',            labelRU: 'Скалолазание',           labelDE: 'Klettern',              emoji: '🧗' },
        { id: 'archery',          label: 'Archery',             labelTR: 'Okçuluk',             labelRU: 'Стрельба из лука',       labelDE: 'Bogenschießen',         emoji: '🏹' },
        { id: 'walking',          label: 'Walking',             labelTR: 'Yürüyüş',             labelRU: 'Ходьба',                 labelDE: 'Spazieren',             emoji: '🚶' },
        { id: 'foot_tennis',      label: 'Foot Tennis',         labelTR: 'Ayak Tenisi',         labelRU: 'Футбольный теннис',      labelDE: 'Fußtennis',             emoji: '🦶' },
        { id: 'sup_kano',         label: 'SUP & Canoe',         labelTR: 'SUP & Kano',          labelRU: 'SUP и каноэ',            labelDE: 'SUP & Kanu',            emoji: '🛶' },
        { id: 'handball',         label: 'Handball',            labelTR: 'Hentbol',             labelRU: 'Гандбол',                labelDE: 'Handball',              emoji: '🤾' },
        { id: 'badminton',        label: 'Badminton',           labelTR: 'Badminton',           labelRU: 'Бадминтон',              labelDE: 'Badminton',             emoji: '🏸' },
        { id: 'shooting_hunting', label: 'Shooting & Hunting',  labelTR: 'Atıcılık & Avcılık',  labelRU: 'Стрельба и охота',       labelDE: 'Schießen & Jagen',      emoji: '🔫' },
        { id: 'equestrian',       label: 'Equestrian',          labelTR: 'Binicilik',           labelRU: 'Конный спорт',           labelDE: 'Reiten',                emoji: '🐎' },
        { id: 'golf',             label: 'Golf',                labelTR: 'Golf',                labelRU: 'Гольф',                  labelDE: 'Golf',                  emoji: '⛳' },
        { id: 'fitness_gym',      label: 'Fitness & Gym',       labelTR: 'Fitness & Spor Salonu', labelRU: 'Фитнес и тренажёрный зал', labelDE: 'Fitness & Fitnessstudio', emoji: '🏋️' },
        { id: 'skiing_snowboard', label: 'Skiing & Snowboard',  labelTR: 'Kayak & Snowboard',   labelRU: 'Лыжи и сноуборд',        labelDE: 'Skifahren & Snowboard', emoji: '⛷️' },
        { id: 'ice_skating',      label: 'Ice Skating',         labelTR: 'Buz Pateni',          labelRU: 'Катание на коньках',     labelDE: 'Eislaufen',             emoji: '⛸️' },
        { id: 'hiking',           label: 'Hiking',              labelTR: 'Doğa Yürüyüşü',       labelRU: 'Пеший туризм',           labelDE: 'Wandern',               emoji: '🥾' },
        { id: 'camping',          label: 'Camping',             labelTR: 'Kamp',                labelRU: 'Кемпинг',                labelDE: 'Camping',               emoji: '🏕️' },
        { id: 'motorcycle',       label: 'Motorcycle Riding',   labelTR: 'Motosiklet',          labelRU: 'Мотоцикл',               labelDE: 'Motorradfahren',        emoji: '🏍️' },
        { id: 'extreme_sports',   label: 'Extreme Sports',      labelTR: 'Ekstrem Sporlar',     labelRU: 'Экстремальные виды спорта', labelDE: 'Extremsport',        emoji: '🪂' },
        { id: 'paintball',        label: 'Paintball',           labelTR: 'Paintball',           labelRU: 'Пейнтбол',               labelDE: 'Paintball',             emoji: '🔫' },
        { id: 'airsoft',          label: 'Airsoft',             labelTR: 'Airsoft',             labelRU: 'Страйкбол',              labelDE: 'Airsoft',               emoji: '🪖' },
    ],
    SOCIAL:  [
        { id: 'friend_finding', label: 'Friend Finding',    labelTR: 'Arkadaş Bulma',   labelRU: 'Поиск друзей',      labelDE: 'Freunde finden',    emoji: '🎉' },
        { id: 'sanal_alem',     label: 'Virtual World',     labelTR: 'Sanal Alem',      labelRU: 'Виртуальный мир',   labelDE: 'Virtuelle Welt',    emoji: '🌐' },
    ],
    ARTS:    [
        { id: 'painting',     label: 'Painting',      labelTR: 'Resim',       labelRU: 'Живопись',        labelDE: 'Malerei',        emoji: '🎨' },
        { id: 'music',        label: 'Music',         labelTR: 'Müzik',       labelRU: 'Музыка',          labelDE: 'Musik',          emoji: '🎵' },
        { id: 'theater',      label: 'Theater',       labelTR: 'Tiyatro',     labelRU: 'Театр',           labelDE: 'Theater',        emoji: '🎭' },
        { id: 'cinema',       label: 'Cinema',        labelTR: 'Sinema',      labelRU: 'Кино',            labelDE: 'Kino',           emoji: '🎬' },
        { id: 'literature',   label: 'Literature',    labelTR: 'Edebiyat',    labelRU: 'Литература',      labelDE: 'Literatur',      emoji: '📚' },
        { id: 'sculpture',    label: 'Sculpture',     labelTR: 'Heykel',      labelRU: 'Скульптура',      labelDE: 'Bildhauerei',    emoji: '🗿' },
        { id: 'architecture', label: 'Architecture',  labelTR: 'Mimari',      labelRU: 'Архитектура',     labelDE: 'Architektur',    emoji: '🏛️' },
        { id: 'opera',        label: 'Opera',         labelTR: 'Opera',       labelRU: 'Опера',           labelDE: 'Oper',           emoji: '🎼' },
        { id: 'ceramics',     label: 'Ceramics',      labelTR: 'Seramik',     labelRU: 'Керамика',        labelDE: 'Keramik',        emoji: '🏺' },
        { id: 'poetry',       label: 'Poetry',        labelTR: 'Şiir',        labelRU: 'Поэзия',          labelDE: 'Poesie',         emoji: '✍️' },
        { id: 'photography',  label: 'Photography',   labelTR: 'Fotoğrafçılık', labelRU: 'Фотография',    labelDE: 'Fotografie',     emoji: '📷' },
    ],
    GAMES:   [
        { id: 'fps',          label: 'FPS',             labelTR: 'FPS',             labelRU: 'Шутер от первого лица', labelDE: 'Ego-Shooter',    emoji: '🎯' },
        { id: 'moba',         label: 'MOBA',            labelTR: 'MOBA',            labelRU: 'MOBA',            labelDE: 'MOBA',           emoji: '⚔️' },
        { id: 'strategy',     label: 'Strategy',        labelTR: 'Strateji',        labelRU: 'Стратегия',       labelDE: 'Strategie',      emoji: '♟️' },
        { id: 'sports_games', label: 'Sports Games',    labelTR: 'Spor Oyunları',   labelRU: 'Спортивные игры', labelDE: 'Sportspiele',    emoji: '🎮' },
        { id: 'boardgames',   label: 'Board Games',     labelTR: 'Kutu Oyunları',   labelRU: 'Настольные игры', labelDE: 'Brettspiele',    emoji: '🎲' },
        { id: 'batak',        label: 'Batak',           labelTR: 'Batak',           labelRU: 'Батак',           labelDE: 'Batak',          emoji: '🃏' },
        { id: 'okey',         label: 'Okey',            labelTR: 'Okey',            labelRU: 'Окей',            labelDE: 'Okey',           emoji: '🀄' },
        { id: 'chess',        label: 'Chess',           labelTR: 'Satranç',         labelRU: 'Шахматы',         labelDE: 'Schach',         emoji: '♞' },
        { id: 'tavla',        label: 'Backgammon',      labelTR: 'Tavla',           labelRU: 'Нарды',           labelDE: 'Backgammon',     emoji: '🎲' },
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

function parseIdList(raw) {
    try {
        const arr = JSON.parse(raw);
        return Array.isArray(arr) ? arr.filter(x => typeof x === 'string') : [];
    } catch {
        return [];
    }
}

function SportTile({ sub, label, count, favored, onOpen, onToggleFav, t, variant }) {
    const photo = SUB_PHOTOS[sub.id] || null;
    const tint = SUB_TINT[sub.id] || '#1C1F28';
    return (
        <TouchableOpacity
            style={[variant === 'row' ? sp.tileRow : sp.tile, count === 0 && sp.tileQuiet]}
            onPress={onOpen}
            activeOpacity={0.85}
        >
            {photo ? (
                <>
                    <Image source={photo} style={sp.tileImg} />
                    <View style={sp.tileShade} />
                </>
            ) : (
                <View style={[sp.tileFill, { backgroundColor: tint }]}>
                    <Text style={sp.tileEmoji}>{sub.emoji}</Text>
                </View>
            )}
            {count > 0 && <View style={sp.liveDot} />}
            <Pressable onPress={onToggleFav} hitSlop={10} style={sp.starBtn}>
                <Text style={[sp.star, favored && { color: colors.purple }]}>{favored ? '★' : '☆'}</Text>
            </Pressable>
            <Text style={[sp.tileName, count === 0 && { bottom: 12 }]} numberOfLines={2}>{label}</Text>
            {count > 0 ? <Text style={sp.tileMeta}>{t.listings(count)}</Text> : null}
        </TouchableOpacity>
    );
}

export default function CategoryScreen({ route, navigation }) {
    const { category: categoryParam } = route.params;
    const category = String(categoryParam || '').toUpperCase();
    const isSports = category === 'SPORTS';
    const accentColor = CAT_COLOR[category] || colors.purple;
    const t = useT();
    const insets = useSafeAreaInsets();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const subLabel = (sub) => (lang === 'tr' ? (sub.labelTR || sub.label) : lang === 'ru' ? (sub.labelRU || sub.label) : lang === 'de' ? (sub.labelDE || sub.label) : sub.label);
    const categoryLabel = t[CAT_LABEL_KEY[category]] || category;

    const [counts, setCounts] = useState({});
    const [loading, setLoading] = useState(true);
    const [query, setQuery] = useState('');
    const [groupId, setGroupId] = useState('all');
    const [favIds, setFavIds] = useState([]);
    const [recentIds, setRecentIds] = useState([]);
    const [myInterests, setMyInterests] = useState([]);
    const [involvedSubIds, setInvolvedSubIds] = useState([]);
    const [intent, setIntent] = useState(null);
    const [todayCounts, setTodayCounts] = useState({});
    const myId = useSelector(s => s.auth.user?.id);

    // Sanat/sosyal/oyun: alfabetik; açık ilanı olan öne, profilindeki Aktivitelerim daha da öne.
    // (Edebiyat büyük hero olmasın diye featured ayrımı yok — hepsi aynı ebat.)
    const myInterestSet = useMemo(() => new Set(myInterests.map(i => i.subCategory)), [myInterests]);
    const locale = lang === 'tr' ? 'tr' : lang === 'ru' ? 'ru' : lang === 'de' ? 'de' : 'en';
    const subs = [...(SUB_MAP[category] || [])].sort((a, b) => {
        const aMine = myInterestSet.has(a.id) ? 0 : 1;
        const bMine = myInterestSet.has(b.id) ? 0 : 1;
        if (aMine !== bMine) return aMine - bMine;
        const aOpen = (counts[a.id] || 0) > 0 ? 0 : 1;
        const bOpen = (counts[b.id] || 0) > 0 ? 0 : 1;
        if (aOpen !== bOpen) return aOpen - bOpen;
        return subLabel(a).localeCompare(subLabel(b), locale);
    });

    const fetchCounts = useCallback(() => {
        const today = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}-${String(new Date().getDate()).padStart(2, '0')}`;
        api.get(`/rivals/counts?category=${category}`)
            .then(r => setCounts(r.data))
            .catch(e => console.warn(e?.message))
            .finally(() => setLoading(false));
        if (isSports) {
            api.get(`/rivals?category=SPORTS&date=${today}`).then(r => {
                const list = Array.isArray(r.data) ? r.data : (Array.isArray(r.data?.requests) ? r.data.requests : []);
                const map = {};
                list.forEach(item => {
                    if (!item?.subCategory) return;
                    map[item.subCategory] = (map[item.subCategory] || 0) + 1;
                });
                setTodayCounts(map);
            }).catch(() => setTodayCounts({}));
        }
    }, [category, isSports]);

    useFocusEffect(
        useCallback(() => {
            setLoading(true);
            fetchCounts();
            const known = new Set((SUB_MAP[category] || []).map(s => s.id));
            const asList = (res) => Array.isArray(res?.data) ? res.data : [];
            if (isSports) {
                AsyncStorage.getItem(FAV_KEY).then(raw => setFavIds(parseIdList(raw))).catch(() => {});
                AsyncStorage.getItem(RECENT_KEY).then(raw => setRecentIds(parseIdList(raw))).catch(() => {});
                const isMine = (item) => {
                    if (!item || !myId) return false;
                    if (item.senderId === myId || item.sender?.id === myId) return true;
                    if (item.receiverId === myId || item.receiver?.id === myId) return true;
                    if ((item.participants || []).some(p => p?.id === myId)) return true;
                    return (item.senderTeam || []).some(p => p?.id === myId);
                };
                Promise.all([
                    api.get('/interests/my').catch(() => ({ data: [] })),
                    api.get('/rivals/my-upcoming').catch(() => ({ data: [] })),
                    api.get('/rivals/my').catch(() => ({ data: [] })),
                ]).then(([intRes, upRes, myRes]) => {
                    const interests = asList(intRes).filter(i => !i.hidden && known.has(i.subCategory));
                    setMyInterests(interests);
                    const involved = new Set();
                    asList(upRes).forEach(m => { if (m?.subCategory && known.has(m.subCategory)) involved.add(m.subCategory); });
                    asList(myRes).forEach(m => {
                        if (!m?.subCategory || !known.has(m.subCategory)) return;
                        if (m.status !== 'OPEN' && m.status !== 'MATCHED') return;
                        if (isMine(m)) involved.add(m.subCategory);
                    });
                    setInvolvedSubIds([...involved]);
                }).catch(() => {});
            } else {
                api.get('/interests/my').then(intRes => {
                    setMyInterests(asList(intRes).filter(i => !i.hidden && known.has(i.subCategory)));
                }).catch(() => setMyInterests([]));
            }
        }, [fetchCounts, isSports, myId, category])
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

    const persistRecents = (id) => {
        setRecentIds(prev => {
            const next = [id, ...prev.filter(x => x !== id)].slice(0, 8);
            AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next)).catch(() => {});
            return next;
        });
    };

    const openSub = (sub) => {
        if (isSports) persistRecents(sub.id);
        if (SPECIAL_SCREENS[sub.id]) {
            navigation.navigate(SPECIAL_SCREENS[sub.id]);
            return;
        }
        // Bugün oynayayım: dala girince de o günün ilanları gelsin (31 Aralık gibi
        // uzak tarihli açık ilanlar "bugün"e karışmasın).
        navigation.navigate('SubCategory', {
            category,
            sub: sub.id,
            ...(intent === 'today' ? { initialDateFilter: 'today' } : {}),
        });
    };

    const toggleFav = (id) => {
        setFavIds(prev => {
            const next = prev.includes(id) ? prev.filter(x => x !== id) : [id, ...prev];
            AsyncStorage.setItem(FAV_KEY, JSON.stringify(next)).catch(() => {});
            return next;
        });
    };

    const byId = useMemo(() => {
        const map = {};
        (SUB_MAP[category] || []).forEach(sub => { map[sub.id] = sub; });
        return map;
    }, [category]);

    const popularityIndex = (id) => {
        const i = SPORT_GROUPS.flatMap(g => g.ids).indexOf(id);
        return i < 0 ? 99 : i;
    };

    const sortSport = (a, b, groupIds) => {
        const ca = counts[a.id] || 0, cb = counts[b.id] || 0;
        if (cb !== ca) return cb - ca;
        const order = groupIds || SPORT_GROUPS.flatMap(g => g.ids);
        const ia = order.indexOf(a.id), ib = order.indexOf(b.id);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    };

    const playCountOf = (subId) => {
        const i = myInterests.find(x => x.subCategory === subId);
        if (!i) return 0;
        const wl = (i.wins || 0) + (i.losses || 0);
        const td = (i.singlesMatchCount || 0) + (i.doublesMatchCount || 0);
        return Math.max(wl, td);
    };

    const q = query.trim().toLowerCase();
    const matchesQuery = (sub) => {
        if (!q) return true;
        return [sub.label, sub.labelTR, sub.labelRU, sub.labelDE, sub.id]
            .some(s => (s || '').toLowerCase().includes(q));
    };

    const myInterestIds = useMemo(() => myInterests.map(i => i.subCategory), [myInterests]);

    const yourSportIds = useMemo(() => {
        const seen = new Set();
        const out = [];
        [...involvedSubIds, ...myInterestIds, ...favIds, ...recentIds].forEach(id => {
            if (!byId[id] || seen.has(id)) return;
            seen.add(id);
            out.push(id);
        });
        const involved = new Set(involvedSubIds);
        return out.sort((a, b) => {
            const ia = involved.has(a) ? 0 : 1;
            const ib = involved.has(b) ? 0 : 1;
            if (ia !== ib) return ia - ib;
            const pa = playCountOf(a), pb = playCountOf(b);
            if (pb !== pa) return pb - pa;
            const ca = counts[a] || 0, cb = counts[b] || 0;
            if (cb !== ca) return cb - ca;
            return popularityIndex(a) - popularityIndex(b);
        }).slice(0, 8);
    }, [favIds, myInterestIds, recentIds, involvedSubIds, myInterests, byId, counts]);

    if (!NEW_VISUAL) {
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
                                        onPress={() => openSub(sub)}
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

    if (isSports) {
        const searching = q.length > 0;
        const passesIntent = (sub) => {
            if (intent === 'today') return (todayCounts[sub.id] || 0) > 0;
            if (intent === 'rival') return (counts[sub.id] || 0) > 0;
            if (intent === 'book') return COURT_SUBS.has(sub.id);
            return true;
        };
        const filtered = (SUB_MAP.SPORTS || []).filter(matchesQuery).filter(passesIntent).sort(sortSport);
        const visibleGroups = searching
            ? []
            : groupId === 'all'
                ? SPORT_GROUPS
                : SPORT_GROUPS.filter(g => g.id === groupId);
        const listPad = Math.max(40, 56 + insets.bottom + 16);

        const renderTile = (sub, variant) => (
            <SportTile
                key={sub.id}
                sub={sub}
                label={subLabel(sub)}
                count={counts[sub.id] || 0}
                favored={favIds.includes(sub.id)}
                onOpen={() => openSub(sub)}
                onToggleFav={() => toggleFav(sub.id)}
                t={t}
                variant={variant}
            />
        );

        return (
            <KeyboardAvoidingView
                style={[s.container, { paddingTop: Math.max(insets.top, 12) + 8 }]}
                behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            >
                <View style={sp.topBar}>
                    <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <Text style={sp.topBack}>{t.back}</Text>
                    </TouchableOpacity>
                    <Text style={sp.topTitle} numberOfLines={1}>{categoryLabel}</Text>
                    <TextInput
                        value={query}
                        onChangeText={setQuery}
                        placeholder={t.searchSport}
                        placeholderTextColor={colors.textMuted}
                        style={sp.topSearch}
                        autoCorrect={false}
                        autoCapitalize="none"
                        returnKeyType="search"
                        clearButtonMode="while-editing"
                    />
                </View>

                {loading ? (
                    <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
                ) : (
                    <ScrollView
                        contentContainerStyle={[sp.list, { paddingBottom: listPad }]}
                        showsVerticalScrollIndicator={false}
                        keyboardShouldPersistTaps="handled"
                        keyboardDismissMode="on-drag"
                    >
                        {!searching && (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sp.chipRow} keyboardShouldPersistTaps="handled">
                                {[
                                    { id: 'today', label: t.intentPlayToday },
                                    { id: 'rival', label: t.intentFindRival },
                                    { id: 'book', label: t.intentBookVenue },
                                ].map(chip => (
                                    <TouchableOpacity
                                        key={chip.id}
                                        style={[sp.intentChip, intent === chip.id && sp.intentChipOn]}
                                        onPress={() => setIntent(prev => prev === chip.id ? null : chip.id)}
                                        activeOpacity={0.8}
                                    >
                                        <Text style={[sp.intentChipText, intent === chip.id && sp.intentChipTextOn]}>{chip.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        )}

                        {searching ? (
                            filtered.length === 0 ? (
                                <Text style={sp.empty}>{t.noSportMatch}</Text>
                            ) : (
                                <View style={sp.grid}>{filtered.map(sub => renderTile(sub))}</View>
                            )
                        ) : visibleGroups.map(g => {
                            const items = (SUB_MAP.SPORTS || []).filter(sub => g.ids.includes(sub.id)).filter(passesIntent).sort((a, b) => sortSport(a, b, g.ids));
                            if (items.length === 0) return null;
                            return (
                                <View key={g.id} style={sp.groupBlock}>
                                    <Text style={sp.groupTitle}>{g.emoji}  {t[g.key]}</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={sp.row} keyboardShouldPersistTaps="handled">
                                        {items.map(sub => renderTile(sub, 'row'))}
                                    </ScrollView>
                                </View>
                            );
                        })}
                    </ScrollView>
                )}
            </KeyboardAvoidingView>
        );
    }

    return (
        <View style={[s.container, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <View style={nv.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <Text style={nv.back}>{t.back}</Text>
                </TouchableOpacity>
                <Text style={nv.title}>{categoryLabel}</Text>
            </View>

            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ marginTop: 40 }} />
            ) : (
                <ScrollView contentContainerStyle={nv.list} showsVerticalScrollIndicator={false}>
                    <View style={nv.grid}>
                        {subs.map(sub => {
                            const count = counts[sub.id] || 0;
                            return (
                                <TouchableOpacity key={sub.id} style={nv.tile} onPress={() => openSub(sub)} activeOpacity={0.85}>
                                    <Image source={photoForSub(sub.id, category)} style={nv.tileImg} />
                                    <View style={nv.tileShade} />
                                    <Text style={nv.tileName} numberOfLines={2}>{subLabel(sub)}</Text>
                                    <Text style={nv.tileMeta}>
                                        {SPECIAL_SCREENS[sub.id]
                                            ? (SPECIAL_BADGE_EMOJI[sub.id] || '')
                                            : (count > 0 ? t.listings(count) : t.noListings)}
                                    </Text>
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

const nv = StyleSheet.create({
    header: { paddingHorizontal: 18, marginBottom: 18 },
    back:   { color: colors.purple, fontSize: 15, fontWeight: '600', marginBottom: 8 },
    title:  { color: colors.text, fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
    list:   { paddingHorizontal: 16, paddingBottom: 36 },
    hero:   { height: 200, borderRadius: 26, overflow: 'hidden', marginBottom: 14 },
    heroImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    heroShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,12,16,0.38)' },
    heroBody: { flex: 1, justifyContent: 'flex-end', padding: 16 },
    heroName: { color: '#fff', fontSize: 24, fontWeight: '700' },
    heroMeta: { color: colors.purple, fontSize: 13, fontWeight: '600', marginTop: 4 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    tile: { width: '47.5%', height: 168, borderRadius: 22, overflow: 'hidden' },
    tileImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    tileShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,12,16,0.34)' },
    tileName: { position: 'absolute', left: 10, right: 10, bottom: 28, color: '#fff', fontSize: 15, fontWeight: '700' },
    tileMeta: { position: 'absolute', left: 10, right: 10, bottom: 10, color: 'rgba(255,255,255,0.72)', fontSize: 11, fontWeight: '600' },
});

const sp = StyleSheet.create({
    topBar: {
        flexDirection: 'row', alignItems: 'center', gap: 10,
        paddingHorizontal: 16, marginBottom: 10,
    },
    topBack: { color: colors.purple, fontSize: 15, fontWeight: '600', flexShrink: 0 },
    topTitle: { color: colors.text, fontSize: 20, fontWeight: '700', letterSpacing: -0.3, flexShrink: 0 },
    topSearch: {
        flex: 1, minWidth: 0, backgroundColor: colors.surface, borderRadius: 14,
        paddingHorizontal: 12, paddingVertical: Platform.OS === 'ios' ? 8 : 6, color: colors.text,
        fontSize: 14, fontWeight: '500', borderWidth: 1, borderColor: colors.purple,
    },
    list: { paddingHorizontal: 16 },
    section: { color: colors.text, fontSize: 16, fontWeight: '700', marginBottom: 10, marginTop: 4 },
    chipRow: { gap: 8, paddingRight: 8, marginBottom: 18 },
    row: { gap: 12, paddingRight: 8 },
    intentChip: {
        backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 10,
        borderWidth: 1, borderColor: colors.border,
    },
    intentChipOn: { backgroundColor: 'rgba(200,245,74,0.16)', borderColor: colors.purple },
    intentChipText: { color: colors.text, fontSize: 13, fontWeight: '700' },
    intentChipTextOn: { color: colors.purple },
    emptyCta: { backgroundColor: colors.surface, borderRadius: 16, padding: 14, marginBottom: 18, borderWidth: 1, borderColor: colors.border },
    emptyCtaText: { color: colors.purple, fontSize: 14, fontWeight: '700' },
    mini: {
        width: 124, backgroundColor: colors.surface, borderRadius: 18, padding: 12, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
    },
    miniImg: { width: '100%', height: 56, borderRadius: 10, marginBottom: 8 },
    miniEmoji: { fontSize: 22, marginBottom: 6 },
    miniName: { color: colors.text, fontSize: 13, fontWeight: '700' },
    miniMeta: { color: colors.purple, fontSize: 11, fontWeight: '600', marginTop: 4 },
    liveChip: {
        flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.surface,
        borderRadius: 999, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1, borderColor: colors.border,
    },
    liveChipText: { color: colors.text, fontSize: 13, fontWeight: '600' },
    liveChipCount: { color: colors.purple, fontSize: 12, fontWeight: '700' },
    liveDotInline: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.purple },
    groupChip: {
        backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8,
        borderWidth: 1, borderColor: colors.border,
    },
    groupChipOn: { backgroundColor: 'rgba(200,245,74,0.16)', borderColor: colors.purple },
    groupChipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '600' },
    groupChipTextOn: { color: colors.purple },
    groupBlock: { marginBottom: 22 },
    groupTitle: { color: colors.text, fontSize: 17, fontWeight: '700', marginBottom: 12 },
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
    tile: { width: '47.5%', height: 168, borderRadius: 22, overflow: 'hidden' },
    tileRow: { width: 168, height: 176, borderRadius: 22, overflow: 'hidden' },
    tileQuiet: { opacity: 0.78 },
    tileImg: { ...StyleSheet.absoluteFillObject, width: '100%', height: '100%' },
    tileShade: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(11,12,16,0.28)' },
    tileFill: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
    tileEmoji: { fontSize: 42, marginBottom: 28 },
    liveDot: {
        position: 'absolute', top: 12, left: 12, width: 8, height: 8, borderRadius: 4,
        backgroundColor: colors.purple, borderWidth: 1.5, borderColor: 'rgba(11,12,16,0.55)',
    },
    starBtn: { position: 'absolute', top: 6, right: 6, width: 32, height: 32, alignItems: 'center', justifyContent: 'center' },
    star: { color: 'rgba(255,255,255,0.88)', fontSize: 18 },
    tileName: { position: 'absolute', left: 10, right: 10, bottom: 28, color: '#fff', fontSize: 15, fontWeight: '700' },
    tileMeta: { position: 'absolute', left: 10, right: 10, bottom: 10, color: colors.purple, fontSize: 11, fontWeight: '600' },
    empty: { color: colors.textSecondary, fontSize: 14, fontWeight: '500', textAlign: 'center', marginTop: 32 },
});
