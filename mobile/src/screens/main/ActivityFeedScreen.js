import { useState, useCallback, useEffect, useRef } from 'react';
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

// ── Sabit görsel bilgiler (backend'den gelen sub için emoji/renk) ──
const CAT_META = {
    SPORTS: { label: 'Spor',    emoji: '⚽', color: '#22c55e' },
    SOCIAL: { label: 'Sosyal',  emoji: '🤝', color: '#60a5fa' },
    ARTS:   { label: 'Sanat',   emoji: '🎨', color: '#f472b6' },
    GAMES:  { label: 'Oyunlar', emoji: '🎮', color: '#fb923c' },
};
const SUB_META = {
    football:'⚽', basketball:'🏀', tennis:'🎾', padel:'🏓', volleyball:'🏐',
    swimming:'🏊', running:'🏃', cycling:'🚴', boxing:'🥊', martial_arts:'🥋', wellness:'🧘',
    music:'🎵', painting:'🎨', dance:'💃', photography:'📸', theater:'🎭',
    writing:'✍️', sculpture:'🗿', cinema:'🎬', poetry:'📜', illustration:'🖼️',
    fps:'🎯', rpg:'⚔️', strategy:'♟️', sports_games:'🎮', moba:'🏆',
    battle_royale:'💥', simulation:'🌍', puzzle:'🧩', racing:'🏎️', card_games:'🃏',
};
const SUB_LABEL = {
    football:'Futbol', basketball:'Basketbol', tennis:'Tenis', padel:'Padel',
    volleyball:'Voleybol', swimming:'Yüzme', running:'Koşu', cycling:'Bisiklet',
    boxing:'Boks', martial_arts:'Dövüş Sanatı', wellness:'Wellness',
    music:'Müzik', painting:'Resim', dance:'Dans', photography:'Fotoğraf',
    theater:'Tiyatro', writing:'Yazarlık', cinema:'Sinema',
    fps:'FPS', rpg:'RPG', strategy:'Strateji', moba:'MOBA',
    battle_royale:'Battle Royale', puzzle:'Bulmaca', card_games:'Kart',
};

const DAYS_TR = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
const MONTHS_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];
const HOURS = Array.from({ length: 18 }, (_, i) => `${String(i + 6).padStart(2,'0')}:00`); // 06:00–23:00

function pad(n) { return String(n).padStart(2,'0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function formatDateLabel(str) {
    if (!str) return '';
    const [y,m,d] = str.split('-').map(Number);
    const dt = new Date(y, m-1, d);
    return `${DAYS_TR[dt.getDay()]} ${d} ${MONTHS_TR[m-1]}`;
}

// ── Mini takvim bileşeni ──
function MiniCalendar({ selected, onSelect }) {
    const today = new Date();
    const [view, setView] = useState({ y: today.getFullYear(), m: today.getMonth() });

    const firstDay = new Date(view.y, view.m, 1).getDay(); // 0=Sun
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const todayStr = toDateStr(today);

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    const prevMonth = () => setView(v => v.m === 0 ? { y: v.y-1, m: 11 } : { y: v.y, m: v.m-1 });
    const nextMonth = () => setView(v => v.m === 11 ? { y: v.y+1, m: 0 } : { y: v.y, m: v.m+1 });

    return (
        <View style={cal.root}>
            <View style={cal.nav}>
                <TouchableOpacity onPress={prevMonth} style={cal.navBtn}>
                    <Text style={cal.navArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={cal.navTitle}>{MONTHS_TR[view.m]} {view.y}</Text>
                <TouchableOpacity onPress={nextMonth} style={cal.navBtn}>
                    <Text style={cal.navArrow}>›</Text>
                </TouchableOpacity>
            </View>
            <View style={cal.dayHeaders}>
                {DAYS_TR.map(d => <Text key={d} style={cal.dayHeader}>{d}</Text>)}
            </View>
            <View style={cal.grid}>
                {cells.map((day, idx) => {
                    if (!day) return <View key={`e${idx}`} style={cal.cell} />;
                    const str = `${view.y}-${pad(view.m+1)}-${pad(day)}`;
                    const isSelected = str === selected;
                    const isToday = str === todayStr;
                    const isPast = str < todayStr;
                    return (
                        <TouchableOpacity
                            key={str}
                            style={[cal.cell, isSelected && cal.cellSelected, isToday && !isSelected && cal.cellToday]}
                            onPress={() => !isPast && onSelect(isSelected ? '' : str)}
                            disabled={isPast}
                            activeOpacity={0.7}
                        >
                            <Text style={[cal.cellText, isSelected && cal.cellTextSelected, isPast && cal.cellTextPast]}>
                                {day}
                            </Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
            {selected && (
                <TouchableOpacity onPress={() => onSelect('')} style={cal.clearDate}>
                    <Text style={cal.clearDateText}>✕ Tarihi Temizle</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

// ── Saat seçici ──
function TimePicker({ valueFrom, valueTo, onChangeFrom, onChangeTo }) {
    return (
        <View style={tp.root}>
            <View style={tp.row}>
                <Text style={tp.label}>Başlangıç</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tp.chips}>
                    {HOURS.map(h => (
                        <TouchableOpacity
                            key={`f${h}`}
                            style={[tp.chip, valueFrom === h && tp.chipActive]}
                            onPress={() => onChangeFrom(valueFrom === h ? '' : h)}
                            activeOpacity={0.8}
                        >
                            <Text style={[tp.chipText, valueFrom === h && tp.chipTextActive]}>{h}</Text>
                        </TouchableOpacity>
                    ))}
                </ScrollView>
            </View>
            <View style={tp.row}>
                <Text style={tp.label}>Bitiş</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={tp.chips}>
                    {HOURS.map(h => {
                        const disabled = !!valueFrom && h <= valueFrom;
                        return (
                            <TouchableOpacity
                                key={`t${h}`}
                                style={[tp.chip, valueTo === h && tp.chipActive, disabled && tp.chipDisabled]}
                                onPress={() => !disabled && onChangeTo(valueTo === h ? '' : h)}
                                disabled={disabled}
                                activeOpacity={0.8}
                            >
                                <Text style={[tp.chipText, valueTo === h && tp.chipTextActive, disabled && tp.chipTextDisabled]}>{h}</Text>
                            </TouchableOpacity>
                        );
                    })}
                </ScrollView>
            </View>
        </View>
    );
}

// ── Konum girişi + öneri ──
function LocationInput({ placeholder, value, onChange, type }) {
    const [suggestions, setSuggestions] = useState([]);
    const debounce = useRef(null);

    const handleChange = (text) => {
        onChange(text);
        clearTimeout(debounce.current);
        if (text.length < 2) { setSuggestions([]); return; }
        debounce.current = setTimeout(async () => {
            try {
                const { data } = await api.get('/rivals/location-suggestions', { params: { q: text, type } });
                setSuggestions(data || []);
            } catch { setSuggestions([]); }
        }, 300);
    };

    return (
        <View style={{ flex: 1 }}>
            <TextInput
                style={s.filterInput}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                value={value}
                onChangeText={handleChange}
                autoCorrect={false}
            />
            {suggestions.length > 0 && (
                <View style={s.suggBox}>
                    {suggestions.map(sg => (
                        <TouchableOpacity
                            key={sg}
                            style={s.suggItem}
                            onPress={() => { onChange(sg); setSuggestions([]); }}
                            activeOpacity={0.8}
                        >
                            <Text style={s.suggText}>📍 {sg}</Text>
                        </TouchableOpacity>
                    ))}
                </View>
            )}
        </View>
    );
}

// ── Aktivite kartı ──
function ActivityCard({ item, navigation, onJoin, joining }) {
    const catColor = CAT_META[item.category]?.color || colors.purple;
    const emoji = SUB_META[item.subCategory] || '🏅';
    const spots = (item.teamSize * 2) - 1 - (item.participants?.length || 0);

    const formatDate = (dt) => {
        if (!dt) return '';
        const d = new Date(dt);
        return `${DAYS_TR[d.getDay()]} ${d.getDate()} ${MONTHS_TR[d.getMonth()]}`;
    };

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
                        <Text style={[s.catBadgeText, { color: catColor }]}>{CAT_META[item.category]?.emoji} {CAT_META[item.category]?.label}</Text>
                    </View>
                </View>
                <View style={s.infoRow}>
                    {item.matchDate && <Text style={s.infoChip}>📅 {formatDate(item.matchDate)}{item.matchTime ? ` · ${item.matchTime}` : ''}</Text>}
                    {(item.location || item.courtAddress) && <Text style={s.infoChip} numberOfLines={1}>📍 {item.location || item.courtAddress}</Text>}
                    {item.duration && <Text style={s.infoChip}>⏱ {item.duration} dk</Text>}
                    {item.level && <Text style={s.infoChip}>🎯 {item.level}</Text>}
                </View>
                {item.message ? <Text style={s.cardMsg} numberOfLines={2}>{item.message}</Text> : null}
                <View style={s.cardFooter}>
                    <Text style={s.spotsText}>{spots > 0 ? `${spots} kişi aranıyor` : 'Dolu'}</Text>
                    {item.courtFeePerPerson > 0 && <Text style={s.feeText}>💰 {item.courtFeePerPerson} ₺/kişi</Text>}
                    {item._myJoinStatus === 'PENDING' ? (
                        <View style={s.pendingBadge}><Text style={s.pendingText}>⏳ Bekliyor</Text></View>
                    ) : item._myJoinStatus === 'ACCEPTED' ? (
                        <View style={[s.pendingBadge, { backgroundColor: colors.green + '22', borderColor: colors.green + '55' }]}>
                            <Text style={[s.pendingText, { color: colors.greenLight }]}>✓ Katıldın</Text>
                        </View>
                    ) : spots > 0 ? (
                        <TouchableOpacity style={[s.joinBtn, joining && { opacity: 0.5 }]} onPress={() => onJoin(item)} disabled={joining} activeOpacity={0.8}>
                            {joining ? <ActivityIndicator size="small" color="#fff" /> : <Text style={s.joinBtnText}>Katıl</Text>}
                        </TouchableOpacity>
                    ) : null}
                </View>
            </View>
        </TouchableOpacity>
    );
}

// ── Ana ekran ──
export default function ActivityFeedScreen({ navigation }) {
    const lang = useSelector(s => s.lang?.lang || 'en');
    const logoText = lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy';

    const [items, setItems]         = useState([]);
    const [loading, setLoading]     = useState(false);
    const [joiningId, setJoiningId] = useState(null);

    // Dinamik sub listesi
    const [subList, setSubList] = useState([]); // [{subCategory, category}]

    // Filtreler
    const [city,     setCity]     = useState('');
    const [district, setDistrict] = useState('');
    const [date,     setDate]     = useState('');
    const [timeFrom, setTimeFrom] = useState('');
    const [timeTo,   setTimeTo]   = useState('');
    const [selCats,  setSelCats]  = useState([]);
    const [selSubs,  setSelSubs]  = useState([]);

    // subCategory listesini backend'den çek
    useEffect(() => {
        api.get('/rivals/sub-categories').then(r => setSubList(r.data || [])).catch(() => {});
    }, []);

    const toggleCat = (key) => {
        setSelCats(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            if (!next.includes(key)) {
                const catSubs = subList.filter(s => s.category === key).map(s => s.subCategory);
                setSelSubs(p => p.filter(s => !catSubs.includes(s)));
            }
            return next;
        });
    };
    const toggleSub = (key) => setSelSubs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

    // Görünen alt dallar: seçili kategorilerin altdal listesi (yoksa tümü)
    const visibleSubs = subList.filter(s =>
        selCats.length === 0 || selCats.includes(s.category)
    );

    const fetchFeed = useCallback(async (c, dist, d, tf, tt, cats, subs) => {
        setLoading(true);
        try {
            const catKeys = cats.length > 0 ? cats : [''];
            const subKeys = subs.length > 0 ? subs : [''];
            const pairs = catKeys.flatMap(cat => subKeys.map(sub => ({ cat, sub })));

            const results = await Promise.all(
                pairs.map(({ cat, sub }) => {
                    const params = {};
                    if (cat)  params.category    = cat;
                    if (sub)  params.subCategory = sub;
                    if (c)    params.city         = c;
                    if (dist) params.district     = dist;
                    if (d)    params.date         = d;
                    if (tf)   params.timeFrom     = tf;
                    if (tt)   params.timeTo       = tt;
                    return api.get('/rivals', { params }).then(r => r.data).catch(() => []);
                })
            );
            const seen = new Set();
            const merged = results.flat().filter(item => {
                if (seen.has(item.id)) return false;
                seen.add(item.id); return true;
            });
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

    // Unique kategoriler mevcut ilanlardan
    const activeCats = [...new Set(subList.map(s => s.category))];

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            {/* Header */}
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <RainbowLogo text={logoText} style={{ fontSize: 22, fontWeight: '900', letterSpacing: 2 }} />
                {hasFilter && (
                    <TouchableOpacity onPress={clearAll} style={s.clearBtn} activeOpacity={0.8}>
                        <Text style={s.clearBtnText}>✕ Temizle</Text>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView
                style={{ flex: 1 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                nestedScrollEnabled
            >
                {/* ── Filtre paneli ── */}
                <View style={s.filterPanel}>

                    {/* İl / İlçe */}
                    <Text style={s.sectionLabel}>📍 Konum</Text>
                    <View style={s.filterRow}>
                        <LocationInput placeholder="İl" value={city} onChange={setCity} type="city" />
                        <LocationInput placeholder="İlçe" value={district} onChange={setDistrict} type="district" />
                    </View>

                    {/* Takvim */}
                    <Text style={s.sectionLabel}>
                        📅 Tarih{date ? ` — ${formatDateLabel(date)}` : ''}
                    </Text>
                    <MiniCalendar selected={date} onSelect={setDate} />

                    {/* Saat seçici */}
                    <Text style={s.sectionLabel}>
                        🕐 Saat Aralığı{(timeFrom || timeTo) ? ` — ${timeFrom || '?'} – ${timeTo || '?'}` : ''}
                    </Text>
                    <TimePicker
                        valueFrom={timeFrom} valueTo={timeTo}
                        onChangeFrom={setTimeFrom} onChangeTo={setTimeTo}
                    />

                    {/* Kategoriler */}
                    {activeCats.length > 0 && (
                        <>
                            <Text style={s.sectionLabel}>🏷 Kategori</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} nestedScrollEnabled>
                                {activeCats.map(catKey => {
                                    const meta = CAT_META[catKey] || { label: catKey, emoji: '🔹', color: colors.purple };
                                    const active = selCats.includes(catKey);
                                    return (
                                        <TouchableOpacity
                                            key={catKey}
                                            style={[s.chip, active && { backgroundColor: meta.color + '28', borderColor: meta.color }]}
                                            onPress={() => toggleCat(catKey)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={s.chipEmoji}>{meta.emoji}</Text>
                                            <Text style={[s.chipText, active && { color: meta.color }]}>{meta.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </>
                    )}

                    {/* Alt dallar */}
                    {visibleSubs.length > 0 && (
                        <>
                            <Text style={s.sectionLabel}>⚡ Dallar</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} nestedScrollEnabled>
                                {visibleSubs.map(({ subCategory, category }) => {
                                    const catColor = CAT_META[category]?.color || colors.purple;
                                    const active = selSubs.includes(subCategory);
                                    return (
                                        <TouchableOpacity
                                            key={subCategory}
                                            style={[s.chip, active && { backgroundColor: catColor + '28', borderColor: catColor }]}
                                            onPress={() => toggleSub(subCategory)}
                                            activeOpacity={0.8}
                                        >
                                            <Text style={s.chipEmoji}>{SUB_META[subCategory] || '🏅'}</Text>
                                            <Text style={[s.chipText, active && { color: catColor }]}>{SUB_LABEL[subCategory] || subCategory}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        </>
                    )}
                </View>

                {/* ── Sonuçlar ── */}
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

// ── Stiller ──
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
        paddingHorizontal: 12, paddingTop: 12, paddingBottom: 10, gap: 8,
    },
    sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    filterRow: { flexDirection: 'row', gap: 8 },
    filterInput: {
        flex: 1, backgroundColor: colors.surface2, borderRadius: 10,
        paddingHorizontal: 10, paddingVertical: 8, color: '#fff', fontSize: 13,
        borderWidth: 1, borderColor: colors.border,
    },
    suggBox: {
        position: 'absolute', top: 40, left: 0, right: 0, zIndex: 99,
        backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border,
        overflow: 'hidden',
    },
    suggItem: { paddingHorizontal: 12, paddingVertical: 10, borderBottomWidth: 1, borderColor: colors.border },
    suggText: { color: '#fff', fontSize: 13 },

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
        borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden',
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

const cal = StyleSheet.create({
    root: { backgroundColor: colors.surface2, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
    nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    navBtn: { padding: 6 },
    navArrow: { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 24 },
    navTitle: { color: '#fff', fontSize: 14, fontWeight: '800' },
    dayHeaders: { flexDirection: 'row', marginBottom: 4 },
    dayHeader: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 10, fontWeight: '700' },
    grid: { flexDirection: 'row', flexWrap: 'wrap' },
    cell: { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    cellSelected: { backgroundColor: colors.purple, borderRadius: 20 },
    cellToday: { borderWidth: 1, borderColor: colors.purple, borderRadius: 20 },
    cellText: { color: '#fff', fontSize: 12, fontWeight: '600' },
    cellTextSelected: { color: '#fff', fontWeight: '900' },
    cellTextPast: { color: colors.textMuted },
    clearDate: { alignItems: 'center', marginTop: 6 },
    clearDateText: { color: colors.textMuted, fontSize: 11 },
});

const tp = StyleSheet.create({
    root: { gap: 6 },
    row: { gap: 4 },
    label: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
    chips: { gap: 6, paddingVertical: 2 },
    chip: {
        paddingHorizontal: 12, paddingVertical: 6, borderRadius: 16,
        backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border,
    },
    chipActive: { backgroundColor: colors.purple + '28', borderColor: colors.purple },
    chipDisabled: { opacity: 0.3 },
    chipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: colors.purpleLight },
    chipTextDisabled: { color: colors.textMuted },
});
