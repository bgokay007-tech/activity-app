import { useState, useCallback } from 'react';
import {
    View, Text, TouchableOpacity, FlatList,
    StyleSheet, StatusBar, Platform, ActivityIndicator,
    TextInput, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import colors from '../../theme/colors';
import api from '../../services/api';
import RainbowLogo from '../../components/RainbowLogo';

const CATEGORIES = [
    {
        key: 'SPORTS', label: 'Spor', emoji: '⚽', color: '#22c55e',
        subs: [
            { key: 'football',    label: 'Futbol',      emoji: '⚽' },
            { key: 'basketball',  label: 'Basketbol',   emoji: '🏀' },
            { key: 'tennis',      label: 'Tenis',       emoji: '🎾' },
            { key: 'padel',       label: 'Padel',       emoji: '🏓' },
            { key: 'volleyball',  label: 'Voleybol',    emoji: '🏐' },
            { key: 'swimming',    label: 'Yüzme',       emoji: '🏊' },
            { key: 'running',     label: 'Koşu',        emoji: '🏃' },
            { key: 'cycling',     label: 'Bisiklet',    emoji: '🚴' },
            { key: 'boxing',      label: 'Boks',        emoji: '🥊' },
            { key: 'martial_arts',label: 'Dövüş Sanatı',emoji: '🥋' },
            { key: 'wellness',    label: 'Wellness',    emoji: '🧘' },
        ],
    },
    {
        key: 'SOCIAL', label: 'Sosyal', emoji: '🤝', color: '#60a5fa',
        subs: [],
    },
    {
        key: 'ARTS', label: 'Sanat', emoji: '🎨', color: '#f472b6',
        subs: [
            { key: 'music',        label: 'Müzik',      emoji: '🎵' },
            { key: 'painting',     label: 'Resim',      emoji: '🎨' },
            { key: 'dance',        label: 'Dans',       emoji: '💃' },
            { key: 'photography',  label: 'Fotoğraf',   emoji: '📸' },
            { key: 'theater',      label: 'Tiyatro',    emoji: '🎭' },
            { key: 'writing',      label: 'Yazarlık',   emoji: '✍️' },
            { key: 'cinema',       label: 'Sinema',     emoji: '🎬' },
        ],
    },
    {
        key: 'GAMES', label: 'Oyunlar', emoji: '🎮', color: '#fb923c',
        subs: [
            { key: 'fps',          label: 'FPS',        emoji: '🎯' },
            { key: 'rpg',          label: 'RPG',        emoji: '⚔️' },
            { key: 'strategy',     label: 'Strateji',   emoji: '♟️' },
            { key: 'moba',         label: 'MOBA',       emoji: '🏆' },
            { key: 'battle_royale',label: 'Battle Royale',emoji: '💥' },
            { key: 'puzzle',       label: 'Bulmaca',    emoji: '🧩' },
            { key: 'card_games',   label: 'Kart Oyunu', emoji: '🃏' },
        ],
    },
];

const SUB_EMOJI = Object.fromEntries(
    CATEGORIES.flatMap(c => c.subs.map(s => [s.key, s.emoji]))
);
const CAT_COLOR = Object.fromEntries(CATEGORIES.map(c => [c.key, c.color]));

function formatDate(dt) {
    if (!dt) return '';
    const d = new Date(dt);
    const days = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
    const months = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
    return `${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function ActivityCard({ item, navigation, onJoin, joining }) {
    const catColor = CAT_COLOR[item.category] || colors.purple;
    const emoji = SUB_EMOJI[item.subCategory] || '🏅';
    const spots = (item.teamSize * 2) - 1 - (item.participants?.length || 0);

    return (
        <TouchableOpacity
            style={s.card}
            activeOpacity={0.85}
            onPress={() => navigation.navigate('HomeTab', {
                screen: 'SubCategory',
                params: { category: item.category, sub: item.subCategory, highlightRivalId: item.id },
            })}
        >
            <View style={[s.cardStripe, { backgroundColor: catColor }]} />
            <View style={s.cardBody}>
                <View style={s.cardTop}>
                    <Text style={s.cardEmoji}>{emoji}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardSub} numberOfLines={1}>
                            {item.subCategory?.toUpperCase()}{item.matchMode === 'COMPETITIVE' ? ' · Rekabetçi' : ''}
                        </Text>
                        <Text style={s.cardUser} numberOfLines={1}>
                            {item.sender?.fullName || item.sender?.username || '—'}
                        </Text>
                    </View>
                    <View style={[s.catBadge, { backgroundColor: catColor + '22', borderColor: catColor + '55' }]}>
                        <Text style={[s.catBadgeText, { color: catColor }]}>{item.category}</Text>
                    </View>
                </View>

                <View style={s.infoRow}>
                    {item.matchDate && (
                        <Text style={s.infoChip}>📅 {formatDate(item.matchDate)}{item.matchTime ? ` · ${item.matchTime}` : ''}</Text>
                    )}
                    {(item.location || item.courtAddress) && (
                        <Text style={s.infoChip} numberOfLines={1}>📍 {item.location || item.courtAddress}</Text>
                    )}
                    {item.duration && <Text style={s.infoChip}>⏱ {item.duration} dk</Text>}
                    {item.level && <Text style={s.infoChip}>🎯 {item.level}</Text>}
                </View>

                {item.message ? <Text style={s.cardMsg} numberOfLines={2}>{item.message}</Text> : null}

                <View style={s.cardFooter}>
                    <Text style={s.spotsText}>{spots > 0 ? `${spots} kişi aranıyor` : 'Dolu'}</Text>
                    {item.courtFeePerPerson > 0 && (
                        <Text style={s.feeText}>💰 {item.courtFeePerPerson} ₺/kişi</Text>
                    )}
                    {item._myJoinStatus === 'PENDING' ? (
                        <View style={s.pendingBadge}>
                            <Text style={s.pendingText}>⏳ Bekliyor</Text>
                        </View>
                    ) : item._myJoinStatus === 'ACCEPTED' ? (
                        <View style={[s.pendingBadge, { backgroundColor: colors.green + '22', borderColor: colors.green + '55' }]}>
                            <Text style={[s.pendingText, { color: colors.greenLight }]}>✓ Katıldın</Text>
                        </View>
                    ) : spots > 0 ? (
                        <TouchableOpacity
                            style={[s.joinBtn, joining && { opacity: 0.5 }]}
                            onPress={() => onJoin(item)}
                            disabled={joining}
                            activeOpacity={0.8}
                        >
                            {joining
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text style={s.joinBtnText}>Katıl</Text>}
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>
        </TouchableOpacity>
    );
}

export default function ActivityFeedScreen({ navigation }) {
    const lang = useSelector(s => s.lang?.lang || 'en');
    const logoText = lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy';

    const [items, setItems]         = useState([]);
    const [loading, setLoading]     = useState(false);
    const [joiningId, setJoiningId] = useState(null);

    // Filtreler
    const [city,     setCity]     = useState('');
    const [district, setDistrict] = useState('');
    const [date,     setDate]     = useState('');
    const [timeFrom, setTimeFrom] = useState('');
    const [timeTo,   setTimeTo]   = useState('');
    const [selCats,  setSelCats]  = useState([]); // seçili kategoriler ([] = tümü)
    const [selSubs,  setSelSubs]  = useState([]); // seçili alt dallar

    const toggleCat = (key) => {
        setSelCats(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            // Seçili kategori kaldırıldıysa o kategorinin alt dallarını da temizle
            if (!next.includes(key)) {
                const catSubs = CATEGORIES.find(c => c.key === key)?.subs.map(s => s.key) || [];
                setSelSubs(p => p.filter(s => !catSubs.includes(s)));
            }
            return next;
        });
    };

    const toggleSub = (key) => {
        setSelSubs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    // Görünen alt dal listesi — seçili kategorilerin altdalları
    const visibleSubs = selCats.length > 0
        ? CATEGORIES.filter(c => selCats.includes(c.key)).flatMap(c => c.subs)
        : CATEGORIES.flatMap(c => c.subs);

    const fetchFeed = useCallback(async (c, dist, d, tf, tt, cats, subs) => {
        setLoading(true);
        try {
            // Birden fazla kategori / alt dal için paralel istek at ve birleştir
            const catKeys = cats.length > 0 ? cats : [''];
            const subKeys = subs.length > 0 ? subs : [''];

            const pairs = [];
            for (const cat of catKeys) {
                for (const sub of subKeys) {
                    pairs.push({ cat, sub });
                }
            }

            const results = await Promise.all(
                pairs.map(({ cat, sub }) => {
                    const params = {};
                    if (cat) params.category = cat;
                    if (sub) params.subCategory = sub;
                    if (c)   params.city     = c;
                    if (dist)params.district  = dist;
                    if (d)   params.date      = d;
                    if (tf)  params.timeFrom  = tf;
                    if (tt)  params.timeTo    = tt;
                    return api.get('/rivals', { params }).then(r => r.data).catch(() => []);
                })
            );

            // Flatten + deduplicate by id
            const seen = new Set();
            const merged = results.flat().filter(item => {
                if (seen.has(item.id)) return false;
                seen.add(item.id);
                return true;
            });
            // Sort by date desc
            merged.sort((a, b) => new Date(b.matchDate || 0) - new Date(a.matchDate || 0));
            setItems(merged);
        } catch { setItems([]); }
        finally { setLoading(false); }
    }, []);

    useFocusEffect(useCallback(() => {
        fetchFeed(city, district, date, timeFrom, timeTo, selCats, selSubs);
    }, [city, district, date, timeFrom, timeTo, selCats, selSubs]));

    const handleJoin = async (item) => {
        setJoiningId(item.id);
        try {
            await api.post(`/rivals/${item.id}/respond`, {});
            setItems(prev => prev.map(r => r.id === item.id ? { ...r, _myJoinStatus: 'PENDING' } : r));
        } catch { /* silent */ }
        finally { setJoiningId(null); }
    };

    const hasFilter = city || district || date || timeFrom || timeTo || selCats.length > 0 || selSubs.length > 0;

    const clearAll = () => {
        setCity(''); setDistrict(''); setDate(''); setTimeFrom(''); setTimeTo('');
        setSelCats([]); setSelSubs([]);
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <RainbowLogo text={logoText} style={{ fontSize: 22, fontWeight: '900', letterSpacing: 2 }} />
                {hasFilter && (
                    <TouchableOpacity onPress={clearAll} style={s.clearBtn} activeOpacity={0.8}>
                        <Text style={s.clearBtnText}>Temizle</Text>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView
                style={{ flex: 1 }}
                stickyHeaderIndices={[0]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
            >
                {/* Filtre paneli — sticky */}
                <View style={s.filterPanel}>
                    {/* Il / Ilçe */}
                    <View style={s.filterRow}>
                        <TextInput
                            style={s.filterInput}
                            placeholder="İl"
                            placeholderTextColor={colors.textMuted}
                            value={city}
                            onChangeText={setCity}
                            autoCorrect={false}
                        />
                        <TextInput
                            style={s.filterInput}
                            placeholder="İlçe"
                            placeholderTextColor={colors.textMuted}
                            value={district}
                            onChangeText={setDistrict}
                            autoCorrect={false}
                        />
                    </View>
                    {/* Tarih / Saat */}
                    <View style={s.filterRow}>
                        <TextInput
                            style={[s.filterInput, { flex: 1.4 }]}
                            placeholder="Tarih (2026-07-10)"
                            placeholderTextColor={colors.textMuted}
                            value={date}
                            onChangeText={setDate}
                            keyboardType="numbers-and-punctuation"
                            maxLength={10}
                        />
                        <TextInput
                            style={s.filterInput}
                            placeholder="08:00"
                            placeholderTextColor={colors.textMuted}
                            value={timeFrom}
                            onChangeText={setTimeFrom}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                        />
                        <Text style={{ color: colors.textMuted, alignSelf: 'center' }}>–</Text>
                        <TextInput
                            style={s.filterInput}
                            placeholder="22:00"
                            placeholderTextColor={colors.textMuted}
                            value={timeTo}
                            onChangeText={setTimeTo}
                            keyboardType="numbers-and-punctuation"
                            maxLength={5}
                        />
                    </View>

                    {/* Kategoriler */}
                    <Text style={s.sectionLabel}>Kategori</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                        {CATEGORIES.map(cat => {
                            const active = selCats.includes(cat.key);
                            return (
                                <TouchableOpacity
                                    key={cat.key}
                                    style={[s.chip, active && { backgroundColor: cat.color + '28', borderColor: cat.color }]}
                                    onPress={() => toggleCat(cat.key)}
                                    activeOpacity={0.8}
                                >
                                    <Text style={s.chipEmoji}>{cat.emoji}</Text>
                                    <Text style={[s.chipText, active && { color: cat.color }]}>{cat.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Alt dallar — göster */}
                    {visibleSubs.length > 0 && (
                        <>
                            <Text style={s.sectionLabel}>Dallar</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow}>
                                {visibleSubs.map(sub => {
                                    const active = selSubs.includes(sub.key);
                                    const catColor = CAT_COLOR[CATEGORIES.find(c => c.subs.some(ss => ss.key === sub.key))?.key] || colors.purple;
                                    return (
                                        <TouchableOpacity
                                            key={sub.key}
                                            style={[s.chip, active && { backgroundColor: catColor + '28', borderColor: catColor }]}
                                            onPress={() => toggleSub(sub.key)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={s.chipEmoji}>{sub.emoji}</Text>
                                            <Text style={[s.chipText, active && { color: catColor }]}>{sub.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </>
                    )}
                </View>

                {/* Sonuçlar */}
                {loading ? (
                    <View style={s.center}>
                        <ActivityIndicator size="large" color={colors.purple} />
                    </View>
                ) : items.length === 0 ? (
                    <View style={s.center}>
                        <Text style={s.emptyEmoji}>🔍</Text>
                        <Text style={s.emptyText}>Aktivite bulunamadı</Text>
                        <Text style={s.emptyHint}>Filtreni değiştir veya daha sonra tekrar bak</Text>
                    </View>
                ) : (
                    <View style={{ padding: 12, gap: 10 }}>
                        {items.map(item => (
                            <ActivityCard
                                key={item.id}
                                item={item}
                                navigation={navigation}
                                onJoin={handleJoin}
                                joining={joiningId === item.id}
                            />
                        ))}
                    </View>
                )}
            </ScrollView>
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingBottom: 12,
        backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border,
    },
    clearBtn: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
    clearBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },

    filterPanel: {
        backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border,
        paddingHorizontal: 12, paddingTop: 10, paddingBottom: 8, gap: 8,
    },
    filterRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
    filterInput: {
        flex: 1, backgroundColor: colors.surface2, borderRadius: 10,
        paddingHorizontal: 10, paddingVertical: 8, color: '#fff', fontSize: 13,
        borderWidth: 1, borderColor: colors.border,
    },
    sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginTop: 2 },
    chipRow: { gap: 6, paddingVertical: 2 },
    chip: {
        flexDirection: 'row', alignItems: 'center', gap: 4,
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
        backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    },
    chipEmoji: { fontSize: 14 },
    chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },

    center: { paddingTop: 60, alignItems: 'center', gap: 8 },
    emptyEmoji: { fontSize: 40 },
    emptyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    emptyHint: { color: colors.textMuted, fontSize: 13 },

    card: {
        flexDirection: 'row', backgroundColor: colors.surface,
        borderRadius: 14, borderWidth: 1, borderColor: colors.border,
        overflow: 'hidden',
    },
    cardStripe: { width: 4 },
    cardBody: { flex: 1, padding: 12, gap: 6 },
    cardTop: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardEmoji: { fontSize: 26 },
    cardSub: { color: '#fff', fontSize: 13, fontWeight: '900' },
    cardUser: { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
    catBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
    catBadgeText: { fontSize: 9, fontWeight: '800' },

    infoRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    infoChip: { color: colors.textSecondary, fontSize: 11, backgroundColor: colors.surface2, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
    cardMsg: { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },

    cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    spotsText: { flex: 1, color: colors.textMuted, fontSize: 11 },
    feeText: { color: colors.yellow, fontSize: 11, fontWeight: '700' },
    pendingBadge: {
        paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
        backgroundColor: colors.yellow + '22', borderWidth: 1, borderColor: colors.yellow + '55',
    },
    pendingText: { color: colors.yellow, fontSize: 11, fontWeight: '700' },
    joinBtn: { backgroundColor: colors.purple, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 },
    joinBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});
