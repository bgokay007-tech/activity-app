import { useState, useCallback, useRef } from 'react';
import {
    View, Text, TouchableOpacity, FlatList,
    StyleSheet, StatusBar, Platform, ActivityIndicator,
    TextInput, Modal, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../../theme/colors';
import api from '../../services/api';

const CATEGORY_TABS = [
    { key: '',       label: 'Tümü',   emoji: '🌟' },
    { key: 'SPORTS', label: 'Spor',   emoji: '⚽' },
    { key: 'SOCIAL', label: 'Sosyal', emoji: '🤝' },
    { key: 'ARTS',   label: 'Sanat',  emoji: '🎨' },
    { key: 'GAMES',  label: 'Oyunlar',emoji: '🎮' },
];

const CAT_COLOR = {
    SPORTS: '#22c55e',
    SOCIAL: '#60a5fa',
    ARTS:   '#f472b6',
    GAMES:  '#fb923c',
};

const SUB_EMOJI = {
    football:'⚽', basketball:'🏀', tennis:'🎾', padel:'🏓', volleyball:'🏐',
    swimming:'🏊', running:'🏃', cycling:'🚴', boxing:'🥊', martial_arts:'🥋', wellness:'🧘',
    music:'🎵', painting:'🎨', dance:'💃', photography:'📸', theater:'🎭',
    writing:'✍️', sculpture:'🗿', cinema:'🎬', poetry:'📜', illustration:'🖼️',
    fps:'🎯', rpg:'⚔️', strategy:'♟️', sports_games:'🎮', moba:'🏆',
    battle_royale:'💥', simulation:'🌍', puzzle:'🧩', racing:'🏎️', card_games:'🃏',
};

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
            {/* Sol renk şeridi */}
            <View style={[s.cardStripe, { backgroundColor: catColor }]} />

            <View style={s.cardBody}>
                {/* Üst satır */}
                <View style={s.cardTop}>
                    <Text style={s.cardEmoji}>{emoji}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardSub} numberOfLines={1}>
                            {item.subCategory?.toUpperCase()}
                            {item.matchMode === 'COMPETITIVE' ? ' · Rekabetçi' : ''}
                        </Text>
                        <Text style={s.cardUser} numberOfLines={1}>
                            {item.sender?.fullName || item.sender?.username || '—'}
                        </Text>
                    </View>
                    <View style={[s.catBadge, { backgroundColor: catColor + '22', borderColor: catColor + '55' }]}>
                        <Text style={[s.catBadgeText, { color: catColor }]}>{item.category}</Text>
                    </View>
                </View>

                {/* Bilgiler */}
                <View style={s.infoRow}>
                    {item.matchDate && (
                        <Text style={s.infoChip}>📅 {formatDate(item.matchDate)}{item.matchTime ? ` · ${item.matchTime}` : ''}</Text>
                    )}
                    {(item.location || item.courtAddress) && (
                        <Text style={s.infoChip} numberOfLines={1}>📍 {item.location || item.courtAddress}</Text>
                    )}
                    {item.duration && (
                        <Text style={s.infoChip}>⏱ {item.duration} dk</Text>
                    )}
                    {item.level && (
                        <Text style={s.infoChip}>🎯 {item.level}</Text>
                    )}
                </View>

                {item.message ? (
                    <Text style={s.cardMsg} numberOfLines={2}>{item.message}</Text>
                ) : null}

                {/* Alt satır */}
                <View style={s.cardFooter}>
                    <Text style={s.spotsText}>
                        {spots > 0 ? `${spots} kişi aranıyor` : 'Dolu'}
                    </Text>
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
    const [items, setItems]       = useState([]);
    const [loading, setLoading]   = useState(false);
    const [category, setCategory] = useState('');
    const [showFilter, setShowFilter] = useState(false);
    const [joiningId, setJoiningId]   = useState(null);

    // Filtre state
    const [city,     setCity]     = useState('');
    const [district, setDistrict] = useState('');
    const [date,     setDate]     = useState('');
    const [timeFrom, setTimeFrom] = useState('');
    const [timeTo,   setTimeTo]   = useState('');

    // Geçici (modal içi) filtre
    const [tmpCity,     setTmpCity]     = useState('');
    const [tmpDistrict, setTmpDistrict] = useState('');
    const [tmpDate,     setTmpDate]     = useState('');
    const [tmpTimeFrom, setTmpTimeFrom] = useState('');
    const [tmpTimeTo,   setTmpTimeTo]   = useState('');

    const activeFilterCount = [city, district, date, timeFrom || timeTo].filter(Boolean).length;

    const fetchFeed = useCallback(async (cat, c, dist, d, tf, tt) => {
        setLoading(true);
        try {
            const params = {};
            if (cat)  params.category = cat;
            if (c)    params.city     = c;
            if (dist) params.district = dist;
            if (d)    params.date     = d;
            if (tf)   params.timeFrom = tf;
            if (tt)   params.timeTo   = tt;
            const { data } = await api.get('/rivals', { params });
            setItems(data);
        } catch { setItems([]); }
        finally { setLoading(false); }
    }, []);

    useFocusEffect(useCallback(() => {
        fetchFeed(category, city, district, date, timeFrom, timeTo);
    }, [category, city, district, date, timeFrom, timeTo]));

    const applyFilter = () => {
        setCity(tmpCity); setDistrict(tmpDistrict);
        setDate(tmpDate); setTimeFrom(tmpTimeFrom); setTimeTo(tmpTimeTo);
        setShowFilter(false);
        fetchFeed(category, tmpCity, tmpDistrict, tmpDate, tmpTimeFrom, tmpTimeTo);
    };

    const clearFilter = () => {
        setTmpCity(''); setTmpDistrict(''); setTmpDate(''); setTmpTimeFrom(''); setTmpTimeTo('');
        setCity(''); setDistrict(''); setDate(''); setTimeFrom(''); setTimeTo('');
        setShowFilter(false);
        fetchFeed(category, '', '', '', '', '');
    };

    const openFilter = () => {
        setTmpCity(city); setTmpDistrict(district);
        setTmpDate(date); setTmpTimeFrom(timeFrom); setTmpTimeTo(timeTo);
        setShowFilter(true);
    };

    const handleJoin = async (item) => {
        setJoiningId(item.id);
        try {
            await api.post(`/rivals/${item.id}/respond`, {});
            setItems(prev => prev.map(r => r.id === item.id ? { ...r, _myJoinStatus: 'PENDING' } : r));
        } catch (e) {
            // silently fail — user will see state unchanged
        } finally { setJoiningId(null); }
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <Text style={s.headerTitle}>🌟 Aktiviteler</Text>
                <TouchableOpacity style={[s.filterToggle, activeFilterCount > 0 && s.filterToggleActive]} onPress={openFilter} activeOpacity={0.8}>
                    <Text style={[s.filterToggleText, activeFilterCount > 0 && { color: colors.purple }]}>
                        {activeFilterCount > 0 ? `Filtre (${activeFilterCount})` : '⚙ Filtre'}
                    </Text>
                </TouchableOpacity>
            </View>

            {/* Kategori sekmeleri */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.catRow}>
                {CATEGORY_TABS.map(tab => (
                    <TouchableOpacity
                        key={tab.key}
                        style={[s.catTab, category === tab.key && s.catTabActive]}
                        onPress={() => setCategory(tab.key)}
                        activeOpacity={0.8}
                    >
                        <Text style={s.catTabEmoji}>{tab.emoji}</Text>
                        <Text style={[s.catTabText, category === tab.key && s.catTabTextActive]}>{tab.label}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

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
                <FlatList
                    data={items}
                    keyExtractor={i => i.id}
                    renderItem={({ item }) => (
                        <ActivityCard
                            item={item}
                            navigation={navigation}
                            onJoin={handleJoin}
                            joining={joiningId === item.id}
                        />
                    )}
                    contentContainerStyle={{ padding: 12, gap: 10 }}
                    showsVerticalScrollIndicator={false}
                    onRefresh={() => fetchFeed(category, city, district, date, timeFrom, timeTo)}
                    refreshing={loading}
                />
            )}

            {/* Filtre Modal */}
            <Modal visible={showFilter} transparent animationType="slide" onRequestClose={() => setShowFilter(false)}>
                <View style={fm.overlay}>
                    <View style={fm.sheet}>
                        <View style={fm.handle} />
                        <Text style={fm.title}>⚙ Filtreler</Text>

                        <View style={fm.row}>
                            <View style={fm.half}>
                                <Text style={fm.label}>İl</Text>
                                <TextInput
                                    style={fm.input}
                                    placeholder="İstanbul"
                                    placeholderTextColor={colors.textMuted}
                                    value={tmpCity}
                                    onChangeText={setTmpCity}
                                    autoCorrect={false}
                                />
                            </View>
                            <View style={fm.half}>
                                <Text style={fm.label}>İlçe</Text>
                                <TextInput
                                    style={fm.input}
                                    placeholder="Kadıköy"
                                    placeholderTextColor={colors.textMuted}
                                    value={tmpDistrict}
                                    onChangeText={setTmpDistrict}
                                    autoCorrect={false}
                                />
                            </View>
                        </View>

                        <Text style={fm.label}>Tarih (YYYY-MM-DD)</Text>
                        <TextInput
                            style={fm.input}
                            placeholder="2026-07-10"
                            placeholderTextColor={colors.textMuted}
                            value={tmpDate}
                            onChangeText={setTmpDate}
                            keyboardType="numbers-and-punctuation"
                            maxLength={10}
                        />

                        <Text style={fm.label}>Saat Aralığı</Text>
                        <View style={fm.row}>
                            <View style={fm.half}>
                                <TextInput
                                    style={fm.input}
                                    placeholder="08:00"
                                    placeholderTextColor={colors.textMuted}
                                    value={tmpTimeFrom}
                                    onChangeText={setTmpTimeFrom}
                                    keyboardType="numbers-and-punctuation"
                                    maxLength={5}
                                />
                            </View>
                            <Text style={{ color: colors.textMuted, alignSelf: 'center', paddingHorizontal: 6 }}>–</Text>
                            <View style={fm.half}>
                                <TextInput
                                    style={fm.input}
                                    placeholder="22:00"
                                    placeholderTextColor={colors.textMuted}
                                    value={tmpTimeTo}
                                    onChangeText={setTmpTimeTo}
                                    keyboardType="numbers-and-punctuation"
                                    maxLength={5}
                                />
                            </View>
                        </View>

                        <View style={fm.btnRow}>
                            <TouchableOpacity style={fm.clearBtn} onPress={clearFilter} activeOpacity={0.8}>
                                <Text style={fm.clearBtnText}>Temizle</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={fm.applyBtn} onPress={applyFilter} activeOpacity={0.8}>
                                <Text style={fm.applyBtnText}>Uygula</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
                </View>
            </Modal>
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
    headerTitle: { color: '#fff', fontSize: 18, fontWeight: '900' },
    filterToggle: {
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20,
        borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface2,
    },
    filterToggleActive: { borderColor: colors.purple, backgroundColor: colors.purple + '18' },
    filterToggleText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },

    catRow: { paddingHorizontal: 12, paddingVertical: 10, gap: 8 },
    catTab: {
        flexDirection: 'row', alignItems: 'center', gap: 5,
        paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
        backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    },
    catTabActive: { backgroundColor: colors.purple + '22', borderColor: colors.purple },
    catTabEmoji: { fontSize: 15 },
    catTabText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
    catTabTextActive: { color: colors.purpleLight },

    center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 8 },
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
    joinBtn: {
        backgroundColor: colors.purple, paddingHorizontal: 14, paddingVertical: 6,
        borderRadius: 10,
    },
    joinBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
});

const fm = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    sheet: {
        backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24,
        padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24, gap: 10,
    },
    handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 8 },
    title: { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 4 },
    label: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', marginBottom: 4 },
    input: {
        backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10,
        color: '#fff', fontSize: 14, borderWidth: 1, borderColor: colors.border,
    },
    row: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
    half: { flex: 1 },
    btnRow: { flexDirection: 'row', gap: 10, marginTop: 6 },
    clearBtn: {
        flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
        borderWidth: 1, borderColor: colors.border,
    },
    clearBtnText: { color: colors.textSecondary, fontWeight: '700' },
    applyBtn: { flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: colors.purple },
    applyBtnText: { color: '#fff', fontWeight: '900', fontSize: 15 },
});
