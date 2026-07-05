import { useState, useCallback, useEffect, useRef } from 'react';
import {
    View, Text, TouchableOpacity, Modal,
    StyleSheet, StatusBar, Platform, ActivityIndicator,
    TextInput, ScrollView,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import colors from '../../theme/colors';
import api from '../../services/api';
import RainbowLogo from '../../components/RainbowLogo';

// ── Statik kategori + dal tanımları (her zaman gösterilir) ──
const STATIC_CATS = [
    {
        key: 'SPORTS', label: 'Spor', emoji: '⚽', color: '#22c55e',
        subs: [
            { key: 'football',    label: 'Futbol',        emoji: '⚽' },
            { key: 'basketball',  label: 'Basketbol',     emoji: '🏀' },
            { key: 'tennis',      label: 'Tenis',         emoji: '🎾' },
            { key: 'padel',       label: 'Padel',         emoji: '🏓' },
            { key: 'volleyball',  label: 'Voleybol',      emoji: '🏐' },
            { key: 'swimming',    label: 'Yüzme',         emoji: '🏊' },
            { key: 'running',     label: 'Koşu',          emoji: '🏃' },
            { key: 'cycling',     label: 'Bisiklet',      emoji: '🚴' },
            { key: 'boxing',      label: 'Boks',          emoji: '🥊' },
            { key: 'martial_arts',label: 'Dövüş Sanatı',  emoji: '🥋' },
            { key: 'wellness',    label: 'Wellness',      emoji: '🧘' },
        ],
    },
    {
        key: 'SOCIAL', label: 'Sosyal', emoji: '🤝', color: '#60a5fa',
        subs: [],
    },
    {
        key: 'ARTS', label: 'Sanat', emoji: '🎨', color: '#f472b6',
        subs: [
            { key: 'music',       label: 'Müzik',         emoji: '🎵' },
            { key: 'painting',    label: 'Resim',         emoji: '🎨' },
            { key: 'dance',       label: 'Dans',          emoji: '💃' },
            { key: 'photography', label: 'Fotoğraf',      emoji: '📸' },
            { key: 'theater',     label: 'Tiyatro',       emoji: '🎭' },
            { key: 'writing',     label: 'Yazarlık',      emoji: '✍️' },
            { key: 'cinema',      label: 'Sinema',        emoji: '🎬' },
        ],
    },
    {
        key: 'GAMES', label: 'Oyunlar', emoji: '🎮', color: '#fb923c',
        subs: [
            { key: 'fps',          label: 'FPS',          emoji: '🎯' },
            { key: 'rpg',          label: 'RPG',          emoji: '⚔️' },
            { key: 'strategy',     label: 'Strateji',     emoji: '♟️' },
            { key: 'moba',         label: 'MOBA',         emoji: '🏆' },
            { key: 'battle_royale',label: 'Battle Royale', emoji: '💥' },
            { key: 'puzzle',       label: 'Bulmaca',      emoji: '🧩' },
            { key: 'card_games',   label: 'Kart Oyunu',   emoji: '🃏' },
        ],
    },
];

// hızlı lookup
const CAT_MAP  = Object.fromEntries(STATIC_CATS.map(c => [c.key, c]));
const SUB_MAP  = Object.fromEntries(STATIC_CATS.flatMap(c => c.subs.map(s => [s.key, { ...s, catKey: c.key }])));

const HOURS = Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, '0')}:00`);
const DAYS_TR   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
const MONTHS_TR = ['Ocak','Şubat','Mart','Nisan','Mayıs','Haziran','Temmuz','Ağustos','Eylül','Ekim','Kasım','Aralık'];

function pad(n) { return String(n).padStart(2, '0'); }
function toDateStr(d) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function labelDate(str) {
    if (!str) return '';
    const [y, m, d] = str.split('-').map(Number);
    const dt = new Date(y, m - 1, d);
    return `${DAYS_TR[dt.getDay()]} ${d} ${MONTHS_TR[m - 1]}`;
}

// ── Mini takvim (modal içi) ──
function MiniCalendar({ selected, onSelect, minDate }) {
    const today = new Date();
    const initDate = selected ? (() => { const [y,m] = selected.split('-').map(Number); return { y, m: m-1 }; })()
                              : { y: today.getFullYear(), m: today.getMonth() };
    const [view, setView] = useState(initDate);

    const firstDay   = new Date(view.y, view.m, 1).getDay();
    const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
    const todayStr   = toDateStr(today);
    const minStr     = minDate || todayStr;

    const cells = [];
    for (let i = 0; i < firstDay; i++) cells.push(null);
    for (let d = 1; d <= daysInMonth; d++) cells.push(d);

    return (
        <View style={cal.root}>
            <View style={cal.nav}>
                <TouchableOpacity onPress={() => setView(v => v.m === 0 ? { y: v.y-1, m: 11 } : { y: v.y, m: v.m-1 })} style={cal.navBtn}>
                    <Text style={cal.navArrow}>‹</Text>
                </TouchableOpacity>
                <Text style={cal.navTitle}>{MONTHS_TR[view.m]} {view.y}</Text>
                <TouchableOpacity onPress={() => setView(v => v.m === 11 ? { y: v.y+1, m: 0 } : { y: v.y, m: v.m+1 })} style={cal.navBtn}>
                    <Text style={cal.navArrow}>›</Text>
                </TouchableOpacity>
            </View>
            <View style={cal.dayHeaders}>
                {DAYS_TR.map(d => <Text key={d} style={cal.dayHeader}>{d}</Text>)}
            </View>
            <View style={cal.grid}>
                {cells.map((day, idx) => {
                    if (!day) return <View key={`e${idx}`} style={cal.cell} />;
                    const str     = `${view.y}-${pad(view.m+1)}-${pad(day)}`;
                    const isSelected = str === selected;
                    const isPast  = str < minStr;
                    const isToday = str === todayStr;
                    return (
                        <TouchableOpacity
                            key={str}
                            style={[cal.cell, isSelected && cal.cellSelected, isToday && !isSelected && cal.cellToday]}
                            onPress={() => !isPast && onSelect(str)}
                            disabled={isPast}
                            activeOpacity={0.7}
                        >
                            <Text style={[cal.cellText, isSelected && cal.cellTextSelected, isPast && cal.cellTextPast]}>{day}</Text>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </View>
    );
}

// ── Tarih aralığı modal ──
function DateRangeModal({ visible, dateFrom, dateTo, onApply, onClose }) {
    const [from, setFrom] = useState(dateFrom);
    const [to,   setTo]   = useState(dateTo);
    const [picking, setPicking] = useState('from'); // 'from' | 'to'

    useEffect(() => { if (visible) { setFrom(dateFrom); setTo(dateTo); setPicking('from'); } }, [visible]);

    const handleSelect = (str) => {
        if (picking === 'from') {
            setFrom(str);
            if (to && str > to) setTo('');
            setPicking('to');
        } else {
            if (str < from) { setFrom(str); setPicking('to'); }
            else { setTo(str); }
        }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={m.overlay}>
                <View style={m.sheet}>
                    <View style={m.handle} />
                    <Text style={m.title}>📅 Tarih Aralığı</Text>

                    <View style={m.tabRow}>
                        <TouchableOpacity style={[m.tab, picking === 'from' && m.tabActive]} onPress={() => setPicking('from')}>
                            <Text style={m.tabLabel}>Başlangıç</Text>
                            <Text style={[m.tabValue, from && { color: colors.purpleLight }]}>{from ? labelDate(from) : 'Seç'}</Text>
                        </TouchableOpacity>
                        <Text style={m.tabSep}>→</Text>
                        <TouchableOpacity style={[m.tab, picking === 'to' && m.tabActive]} onPress={() => setPicking('to')}>
                            <Text style={m.tabLabel}>Bitiş</Text>
                            <Text style={[m.tabValue, to && { color: colors.purpleLight }]}>{to ? labelDate(to) : 'Seç'}</Text>
                        </TouchableOpacity>
                    </View>

                    <MiniCalendar
                        selected={picking === 'from' ? from : to}
                        onSelect={handleSelect}
                        minDate={picking === 'to' ? from : undefined}
                    />

                    <View style={m.btnRow}>
                        <TouchableOpacity style={m.clearBtn} onPress={() => { setFrom(''); setTo(''); }} activeOpacity={0.8}>
                            <Text style={m.clearBtnText}>Temizle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={m.applyBtn} onPress={() => onApply(from, to)} activeOpacity={0.8}>
                            <Text style={m.applyBtnText}>Uygula</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ── Saat aralığı modal ──
function TimeRangeModal({ visible, timeFrom, timeTo, onApply, onClose }) {
    const [from, setFrom] = useState(timeFrom);
    const [to,   setTo]   = useState(timeTo);

    useEffect(() => { if (visible) { setFrom(timeFrom); setTo(timeTo); } }, [visible]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={m.overlay}>
                <View style={m.sheet}>
                    <View style={m.handle} />
                    <Text style={m.title}>🕐 Saat Aralığı</Text>

                    <Text style={m.subLabel}>Başlangıç{from ? ` — ${from}` : ''}</Text>
                    <View style={m.hourGrid}>
                        {HOURS.map(h => (
                            <TouchableOpacity
                                key={`f${h}`}
                                style={[m.hourChip, from === h && m.hourChipActive]}
                                onPress={() => { setFrom(h === from ? '' : h); if (to && h >= to) setTo(''); }}
                                activeOpacity={0.8}
                            >
                                <Text style={[m.hourText, from === h && m.hourTextActive]}>{h}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    <Text style={[m.subLabel, { marginTop: 10 }]}>Bitiş{to ? ` — ${to}` : ''}</Text>
                    <View style={m.hourGrid}>
                        {HOURS.map(h => {
                            const disabled = !!from && h <= from;
                            return (
                                <TouchableOpacity
                                    key={`t${h}`}
                                    style={[m.hourChip, to === h && m.hourChipActive, disabled && m.hourChipDisabled]}
                                    onPress={() => !disabled && setTo(h === to ? '' : h)}
                                    disabled={disabled}
                                    activeOpacity={0.8}
                                >
                                    <Text style={[m.hourText, to === h && m.hourTextActive, disabled && m.hourTextDisabled]}>{h}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </View>

                    <View style={[m.btnRow, { marginTop: 16 }]}>
                        <TouchableOpacity style={m.clearBtn} onPress={() => { setFrom(''); setTo(''); }} activeOpacity={0.8}>
                            <Text style={m.clearBtnText}>Temizle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={m.applyBtn} onPress={() => onApply(from, to)} activeOpacity={0.8}>
                            <Text style={m.applyBtnText}>Uygula</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ── Dal seçim modalı ──
function SubsModal({ visible, categories, selCats, selSubs, onApply, onClose }) {
    const [tmp, setTmp] = useState(selSubs);
    useEffect(() => { if (visible) setTmp(selSubs); }, [visible]);

    // Seçili kategorilere göre gösterilecek dallar
    // selCats boşsa tüm kategoriler, doluysa sadece seçilenler
    const visibleCats = selCats.length === 0
        ? categories
        : categories.filter(c => selCats.includes(c.key));

    const toggle = (key) => setTmp(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={m.overlay}>
                <View style={[m.sheet, { height: '85%' }]}>
                    <View style={m.handle} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={m.title}>⚡ Dal Seç</Text>
                        {tmp.length > 0 && (
                            <TouchableOpacity onPress={() => setTmp([])} activeOpacity={0.8}>
                                <Text style={{ color: colors.textMuted, fontSize: 12 }}>Tümünü Kaldır</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
                        {visibleCats.map(cat => {
                            if (!cat.subs || cat.subs.length === 0) return null;
                            return (
                                <View key={cat.key} style={{ marginBottom: 12 }}>
                                    <Text style={[m.subLabel, { marginBottom: 6 }]}>{cat.emoji} {cat.label}</Text>
                                    <View style={m.subGrid}>
                                        {cat.subs.map(sub => {
                                            const active = tmp.includes(sub.key);
                                            return (
                                                <TouchableOpacity
                                                    key={sub.key}
                                                    style={[m.subChip, active && { backgroundColor: cat.color + '28', borderColor: cat.color }]}
                                                    onPress={() => toggle(sub.key)}
                                                    activeOpacity={0.8}
                                                >
                                                    <Text style={m.subChipEmoji}>{sub.emoji}</Text>
                                                    <Text style={[m.subChipText, active && { color: cat.color }]}>{sub.label}</Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                </View>
                            );
                        })}
                    </ScrollView>
                    <View style={m.btnRow}>
                        <TouchableOpacity style={m.clearBtn} onPress={() => { setTmp([]); onApply([]); }} activeOpacity={0.8}>
                            <Text style={m.clearBtnText}>Temizle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={m.applyBtn} onPress={() => onApply(tmp)} activeOpacity={0.8}>
                            <Text style={m.applyBtnText}>
                                Uygula{tmp.length > 0 ? ` (${tmp.length})` : ''}
                            </Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
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
                setSuggestions(Array.isArray(data) ? data : []);
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
                autoCapitalize="none"
            />
            {suggestions.map(sg => (
                <TouchableOpacity key={sg} style={s.suggItem}
                    onPress={() => { onChange(sg); setSuggestions([]); }} activeOpacity={0.8}>
                    <Text style={s.suggText}>📍 {sg}</Text>
                </TouchableOpacity>
            ))}
        </View>
    );
}

// ── Aktivite kartı ──
function ActivityCard({ item, navigation, onJoin, joining }) {
    const catMeta  = CAT_MAP[item.category]  || { color: colors.purple, label: item.category, emoji: '🏅' };
    const subEmoji = SUB_MAP[item.subCategory]?.emoji || '🏅';
    const spots    = (item.teamSize * 2) - 1 - (item.participants?.length || 0);

    const fmtDate = (dt) => {
        if (!dt) return '';
        const d = new Date(dt);
        return `${DAYS_TR[d.getDay()]} ${d.getDate()} ${MONTHS_TR[d.getMonth()]}`;
    };

    return (
        <TouchableOpacity style={s.card} activeOpacity={0.85}
            onPress={() => navigation.navigate('HomeTab', {
                screen: 'SubCategory',
                params: { category: item.category, sub: item.subCategory, highlightRivalId: item.id },
            })}>
            <View style={[s.cardStripe, { backgroundColor: catMeta.color }]} />
            <View style={s.cardBody}>
                <View style={s.cardTop}>
                    <Text style={s.cardEmoji}>{subEmoji}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardSub} numberOfLines={1}>
                            {item.subCategory?.toUpperCase()}{item.matchMode === 'COMPETITIVE' ? ' · Rekabetçi' : ''}
                        </Text>
                        <Text style={s.cardUser} numberOfLines={1}>{item.sender?.fullName || item.sender?.username || '—'}</Text>
                    </View>
                    <View style={[s.catBadge, { backgroundColor: catMeta.color + '22', borderColor: catMeta.color + '55' }]}>
                        <Text style={[s.catBadgeText, { color: catMeta.color }]}>{catMeta.emoji} {catMeta.label}</Text>
                    </View>
                </View>
                <View style={s.infoRow}>
                    {item.matchDate && <Text style={s.infoChip}>📅 {fmtDate(item.matchDate)}{item.matchTime ? ` · ${item.matchTime}` : ''}</Text>}
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
                        <View style={[s.pendingBadge, { backgroundColor: colors.green+'22', borderColor: colors.green+'55' }]}>
                            <Text style={[s.pendingText, { color: colors.greenLight }]}>✓ Katıldın</Text>
                        </View>
                    ) : spots > 0 ? (
                        <TouchableOpacity style={[s.joinBtn, joining && { opacity: 0.5 }]}
                            onPress={() => onJoin(item)} disabled={joining} activeOpacity={0.8}>
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
    const lang     = useSelector(s => s.lang?.lang || 'en');
    const logoText = lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy';

    const [items,     setItems]     = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [joiningId, setJoiningId] = useState(null);

    // Dinamik sub listesi (static + DB'den ekstralar)
    const [extraSubs, setExtraSubs] = useState([]);

    // Filtreler
    const [city,     setCity]     = useState('');
    const [district, setDistrict] = useState('');
    const [dateFrom, setDateFrom] = useState('');
    const [dateTo,   setDateTo]   = useState('');
    const [timeFrom, setTimeFrom] = useState('');
    const [timeTo,   setTimeTo]   = useState('');
    const [selCats,  setSelCats]  = useState([]);
    const [selSubs,  setSelSubs]  = useState([]);

    // Modal state
    const [showDateModal, setShowDateModal] = useState(false);
    const [showTimeModal, setShowTimeModal] = useState(false);
    const [showSubsModal, setShowSubsModal] = useState(false);

    // Backend'den ekstra subCategory'leri çek (static listede yoksa)
    useEffect(() => {
        api.get('/rivals/sub-categories').then(r => {
            const known = new Set(STATIC_CATS.flatMap(c => c.subs.map(s => s.key)));
            const extras = (r.data || []).filter(item => !known.has(item.subCategory));
            setExtraSubs(extras);
        }).catch(() => {});
    }, []);

    // Tüm kategori listesi = static + DB'den gelen kategoriler
    const allCats = STATIC_CATS.map(c => {
        const extraSubsForCat = extraSubs.filter(e => e.category === c.key)
            .map(e => ({ key: e.subCategory, label: e.subCategory, emoji: '🏅' }));
        return { ...c, subs: [...c.subs, ...extraSubsForCat] };
    });
    // DB'de static'te olmayan kategori varsa ekle
    const extraCatKeys = [...new Set(extraSubs.map(e => e.category))].filter(k => !CAT_MAP[k]);
    const dynamicCats = extraCatKeys.map(k => ({
        key: k, label: k, emoji: '🔹', color: colors.purple,
        subs: extraSubs.filter(e => e.category === k).map(e => ({ key: e.subCategory, label: e.subCategory, emoji: '🏅' })),
    }));
    const categories = [...allCats, ...dynamicCats];

    const toggleCat = (key) => {
        setSelCats(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            if (!next.includes(key)) {
                const catSubs = (categories.find(c => c.key === key)?.subs || []).map(s => s.key);
                setSelSubs(p => p.filter(s => !catSubs.includes(s)));
            }
            return next;
        });
    };
    const toggleSub = (key) => setSelSubs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

    const visibleSubs = categories
        .filter(c => selCats.length === 0 || selCats.includes(c.key))
        .flatMap(c => c.subs);

    const fetchFeed = useCallback(async (c, dist, df, dt, tf, tt, cats, subs) => {
        setLoading(true);
        try {
            const catKeys = cats.length > 0 ? cats : [''];
            const subKeys = subs.length > 0 ? subs : [''];
            const pairs   = catKeys.flatMap(cat => subKeys.map(sub => ({ cat, sub })));

            const results = await Promise.all(
                pairs.map(({ cat, sub }) => {
                    const params = {};
                    if (cat)  params.category    = cat;
                    if (sub)  params.subCategory  = sub;
                    if (c)    params.city          = c;
                    if (dist) params.district      = dist;
                    if (df)   params.dateFrom      = df;
                    if (dt)   params.dateTo        = dt;
                    if (tf)   params.timeFrom      = tf;
                    if (tt)   params.timeTo        = tt;
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
        fetchFeed(city, district, dateFrom, dateTo, timeFrom, timeTo, selCats, selSubs);
    }, [city, district, dateFrom, dateTo, timeFrom, timeTo, selCats, selSubs]));

    const handleJoin = async (item) => {
        setJoiningId(item.id);
        try {
            await api.post(`/rivals/${item.id}/respond`, {});
            setItems(prev => prev.map(r => r.id === item.id ? { ...r, _myJoinStatus: 'PENDING' } : r));
        } catch { /* silent */ }
        finally { setJoiningId(null); }
    };

    const hasFilter = city || district || dateFrom || dateTo || timeFrom || timeTo || selCats.length > 0 || selSubs.length > 0;

    const clearAll = () => {
        setCity(''); setDistrict(''); setDateFrom(''); setDateTo('');
        setTimeFrom(''); setTimeTo(''); setSelCats([]); setSelSubs([]);
    };

    const dateLabel = dateFrom || dateTo
        ? [dateFrom && labelDate(dateFrom), dateTo && labelDate(dateTo)].filter(Boolean).join(' – ')
        : null;
    const timeLabel = timeFrom || timeTo
        ? [timeFrom || '?', timeTo || '?'].join(' – ')
        : null;

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <RainbowLogo text={logoText} style={{ fontSize: 22, fontWeight: '900', letterSpacing: 2 }} />
                {hasFilter && (
                    <TouchableOpacity onPress={clearAll} style={s.clearBtn} activeOpacity={0.8}>
                        <Text style={s.clearBtnText}>✕ Temizle</Text>
                    </TouchableOpacity>
                )}
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>

                {/* ── Filtre paneli ── */}
                <View style={s.filterPanel}>

                    {/* Konum */}
                    <Text style={s.sectionLabel}>📍 Konum</Text>
                    <View style={s.filterRow}>
                        <LocationInput placeholder="İl" value={city} onChange={setCity} type="city" />
                        <LocationInput placeholder="İlçe" value={district} onChange={setDistrict} type="district" />
                    </View>

                    {/* Tarih aralığı — form alanı */}
                    <Text style={s.sectionLabel}>📅 Tarih Aralığı</Text>
                    <TouchableOpacity style={[s.pickerField, dateLabel && s.pickerFieldActive]} onPress={() => setShowDateModal(true)} activeOpacity={0.8}>
                        <Text style={[s.pickerFieldText, dateLabel && { color: colors.purpleLight }]}>
                            {dateLabel || 'Tarih seç…'}
                        </Text>
                        <Text style={s.pickerArrow}>›</Text>
                    </TouchableOpacity>

                    {/* Saat aralığı — form alanı */}
                    <Text style={s.sectionLabel}>🕐 Saat Aralığı</Text>
                    <TouchableOpacity style={[s.pickerField, timeLabel && s.pickerFieldActive]} onPress={() => setShowTimeModal(true)} activeOpacity={0.8}>
                        <Text style={[s.pickerFieldText, timeLabel && { color: colors.purpleLight }]}>
                            {timeLabel || 'Saat aralığı seç…'}
                        </Text>
                        <Text style={s.pickerArrow}>›</Text>
                    </TouchableOpacity>

                    {/* Kategoriler */}
                    <Text style={s.sectionLabel}>🏷 Kategori</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.chipRow} nestedScrollEnabled>
                        {categories.map(cat => {
                            const active = selCats.includes(cat.key);
                            return (
                                <TouchableOpacity key={cat.key}
                                    style={[s.chip, active && { backgroundColor: cat.color + '28', borderColor: cat.color }]}
                                    onPress={() => toggleCat(cat.key)} activeOpacity={0.8}>
                                    <Text style={s.chipEmoji}>{cat.emoji}</Text>
                                    <Text style={[s.chipText, active && { color: cat.color }]}>{cat.label}</Text>
                                </TouchableOpacity>
                            );
                        })}
                    </ScrollView>

                    {/* Dal seçici — form alanı */}
                    <Text style={s.sectionLabel}>⚡ Dallar</Text>
                    <TouchableOpacity
                        style={[s.pickerField, selSubs.length > 0 && s.pickerFieldActive]}
                        onPress={() => setShowSubsModal(true)}
                        activeOpacity={0.8}
                    >
                        <Text style={[s.pickerFieldText, selSubs.length > 0 && { color: colors.purpleLight }]} numberOfLines={1}>
                            {selSubs.length > 0 ? selSubs.map(k => SUB_MAP[k]?.label || k).join(', ') : 'Dal seç…'}
                        </Text>
                        <Text style={s.pickerArrow}>›</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Sonuçlar ── */}
                {loading ? (
                    <View style={s.center}><ActivityIndicator size="large" color={colors.purple} /></View>
                ) : items.length === 0 ? (
                    <View style={s.center}>
                        <Text style={s.emptyEmoji}>🔍</Text>
                        <Text style={s.emptyText}>Aktivite bulunamadı</Text>
                        <Text style={s.emptyHint}>Filtreni değiştir veya daha sonra tekrar bak</Text>
                    </View>
                ) : (
                    <View style={{ padding: 12, gap: 10 }}>
                        {items.map(item => (
                            <ActivityCard key={item.id} item={item} navigation={navigation}
                                onJoin={handleJoin} joining={joiningId === item.id} />
                        ))}
                    </View>
                )}
            </ScrollView>

            {/* Tarih modal */}
            <DateRangeModal
                visible={showDateModal}
                dateFrom={dateFrom} dateTo={dateTo}
                onApply={(f, t) => { setDateFrom(f); setDateTo(t); setShowDateModal(false); }}
                onClose={() => setShowDateModal(false)}
            />

            {/* Saat modal */}
            <TimeRangeModal
                visible={showTimeModal}
                timeFrom={timeFrom} timeTo={timeTo}
                onApply={(f, t) => { setTimeFrom(f); setTimeTo(t); setShowTimeModal(false); }}
                onClose={() => setShowTimeModal(false)}
            />

            {/* Dal seçim modalı */}
            <SubsModal
                visible={showSubsModal}
                categories={categories}
                selCats={selCats}
                selSubs={selSubs}
                onApply={(subs) => { setSelSubs(subs); setShowSubsModal(false); }}
                onClose={() => setShowSubsModal(false)}
            />
        </View>
    );
}

// ── Stiller ──
const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: colors.bg },
    header: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingBottom: 12,
        backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border,
    },
    clearBtn:     { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
    clearBtnText: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },

    filterPanel: {
        backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border,
        paddingHorizontal: 12, paddingTop: 12, paddingBottom: 12, gap: 8,
    },
    sectionLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    filterRow:    { flexDirection: 'row', gap: 8 },
    filterInput:  {
        flex: 1, backgroundColor: colors.surface2, borderRadius: 10,
        paddingHorizontal: 10, paddingVertical: 8, color: '#fff', fontSize: 13,
        borderWidth: 1, borderColor: colors.border,
    },

    pickerField: {
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 11,
        borderWidth: 1, borderColor: colors.border,
    },
    pickerFieldActive: { borderColor: colors.purple, backgroundColor: colors.purple + '12' },
    pickerFieldText:   { color: colors.textMuted, fontSize: 13 },
    pickerArrow:       { color: colors.textMuted, fontSize: 18 },

    chipRow:   { gap: 6, paddingVertical: 2 },
    chip:      { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    chipEmoji: { fontSize: 14 },
    chipText:  { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },

    suggItem: { paddingHorizontal: 12, paddingVertical: 9, marginTop: 3, backgroundColor: colors.surface2, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    suggText: { color: '#fff', fontSize: 13 },

    center:    { paddingTop: 60, alignItems: 'center', gap: 8 },
    emptyEmoji:{ fontSize: 40 },
    emptyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    emptyHint: { color: colors.textMuted, fontSize: 13 },

    card:      { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    cardStripe:{ width: 4 },
    cardBody:  { flex: 1, padding: 12, gap: 6 },
    cardTop:   { flexDirection: 'row', alignItems: 'center', gap: 8 },
    cardEmoji: { fontSize: 26 },
    cardSub:   { color: '#fff', fontSize: 13, fontWeight: '900' },
    cardUser:  { color: colors.textSecondary, fontSize: 11, marginTop: 1 },
    catBadge:  { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
    catBadgeText: { fontSize: 9, fontWeight: '800' },
    infoRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
    infoChip:  { color: colors.textSecondary, fontSize: 11, backgroundColor: colors.surface2, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3 },
    cardMsg:   { color: colors.textMuted, fontSize: 12, fontStyle: 'italic' },
    cardFooter:{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 2 },
    spotsText: { flex: 1, color: colors.textMuted, fontSize: 11 },
    feeText:   { color: colors.yellow, fontSize: 11, fontWeight: '700' },
    pendingBadge: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.yellow+'22', borderWidth: 1, borderColor: colors.yellow+'55' },
    pendingText:  { color: colors.yellow, fontSize: 11, fontWeight: '700' },
    joinBtn:      { backgroundColor: colors.purple, paddingHorizontal: 14, paddingVertical: 6, borderRadius: 10 },
    joinBtnText:  { color: '#fff', fontSize: 12, fontWeight: '800' },
});

const cal = StyleSheet.create({
    root:         { backgroundColor: colors.surface2, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border },
    nav:          { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    navBtn:       { padding: 6 },
    navArrow:     { color: '#fff', fontSize: 22, fontWeight: '300', lineHeight: 24 },
    navTitle:     { color: '#fff', fontSize: 14, fontWeight: '800' },
    dayHeaders:   { flexDirection: 'row', marginBottom: 4 },
    dayHeader:    { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 10, fontWeight: '700' },
    grid:         { flexDirection: 'row', flexWrap: 'wrap' },
    cell:         { width: '14.28%', aspectRatio: 1, alignItems: 'center', justifyContent: 'center' },
    cellSelected: { backgroundColor: colors.purple, borderRadius: 20 },
    cellToday:    { borderWidth: 1, borderColor: colors.purple, borderRadius: 20 },
    cellText:        { color: '#fff', fontSize: 12, fontWeight: '600' },
    cellTextSelected:{ color: '#fff', fontWeight: '900' },
    cellTextPast:    { color: colors.textMuted },
});

const m = StyleSheet.create({
    overlay:  { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    sheet:    { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24, gap: 10, maxHeight: '90%', flexDirection: 'column' },
    handle:   { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 6 },
    title:    { color: '#fff', fontSize: 17, fontWeight: '900' },
    subLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },

    tabRow:   { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 4 },
    tab:      { flex: 1, backgroundColor: colors.surface2, borderRadius: 10, padding: 10, borderWidth: 1, borderColor: colors.border },
    tabActive:{ borderColor: colors.purple, backgroundColor: colors.purple + '18' },
    tabSep:   { color: colors.textMuted, fontSize: 16 },
    tabLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 2 },
    tabValue: { color: colors.textSecondary, fontSize: 12, fontWeight: '800' },

    subGrid:          { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    subChip:          { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    subChipEmoji:     { fontSize: 14 },
    subChipText:      { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
    hourGrid:         { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    hourChip:         { paddingHorizontal: 8, paddingVertical: 5, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    hourChipActive:   { backgroundColor: colors.purple + '28', borderColor: colors.purple },
    hourChipDisabled: { opacity: 0.25 },
    hourText:         { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    hourTextActive:   { color: colors.purpleLight },
    hourTextDisabled: { color: colors.textMuted },

    btnRow:      { flexDirection: 'row', gap: 10 },
    clearBtn:    { flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    clearBtnText:{ color: colors.textSecondary, fontWeight: '700' },
    applyBtn:    { flex: 2, paddingVertical: 12, borderRadius: 12, alignItems: 'center', backgroundColor: colors.purple },
    applyBtnText:{ color: '#fff', fontWeight: '900', fontSize: 15 },
});
