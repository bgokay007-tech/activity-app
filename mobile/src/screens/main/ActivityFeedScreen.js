import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, Modal, Image, Linking,
    StyleSheet, StatusBar, Platform, ActivityIndicator,
    TextInput, ScrollView, Alert,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { useSelector } from 'react-redux';
import * as Location from 'expo-location';
import MapView, { Marker, PROVIDER_DEFAULT } from 'react-native-maps';
import colors from '../../theme/colors';
import api from '../../services/api';
import RainbowLogo from '../../components/RainbowLogo';
import useT from '../../hooks/useT';

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
            { key: 'table_tennis',      label: 'Masa Tenisi',              emoji: '🏓' },
            { key: 'climbing',          label: 'Tırmanış',                 emoji: '🧗' },
            { key: 'archery',           label: 'Okçuluk',                  emoji: '🏹' },
            { key: 'walking',           label: 'Yürüyüş',                  emoji: '🚶' },
            { key: 'foot_tennis',       label: 'Ayak Tenisi',              emoji: '🦶' },
            { key: 'sup_kano',          label: 'Supboard ve Kano',         emoji: '🛶' },
            { key: 'handball',          label: 'Hentbol',                  emoji: '🤾' },
            { key: 'badminton',         label: 'Badminton',                emoji: '🏸' },
            { key: 'shooting_hunting',  label: 'Atıcılık ve Avcılık',      emoji: '🔫' },
            { key: 'equestrian',        label: 'Binicilik',                emoji: '🐎' },
            { key: 'golf',              label: 'Golf',                     emoji: '⛳' },
            { key: 'fitness_gym',       label: 'Fitness ve Gym',           emoji: '🏋️' },
            { key: 'skiing_snowboard',  label: 'Kayak ve Snowboard',       emoji: '⛷️' },
            { key: 'ice_skating',       label: 'Buz Pateni',               emoji: '⛸️' },
            { key: 'hiking',            label: 'Dağ Bayır Doğa Yürüyüşleri', emoji: '🥾' },
            { key: 'camping',           label: 'Kamp',                     emoji: '🏕️' },
            { key: 'motorcycle',        label: 'Sürüş (Motosiklet)',       emoji: '🏍️' },
            { key: 'extreme_sports',    label: 'Ekstrem Sporları',         emoji: '🪂' },
            { key: 'paintball',         label: 'Paintball',                emoji: '🎯' },
            { key: 'airsoft',           label: 'Airsoft',                  emoji: '🪖' },
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

// Karma akışı yakından uzağa sıralamak için — gerçek bir tarihi olan içerikler
// (etkinlik/konser/tiyatro) kendi tarihine göre; sinema (vizyondaki, tarihsiz)
// ve kurs (süregelen, tarihsiz) her zaman "şimdi kullanılabilir" kabul edilip
// listenin en yakınına (bugüne) yerleştirilir.
function feedSortTime(dateStr, timeStr) {
    if (!dateStr) return Date.now();
    // matchDate zaten tam ISO tarih-saat (Prisma DateTime) olarak gelir; konser/tiyatro
    // ise "YYYY-MM-DD" + ayrı bir saat alanı kullanır — ikisini de destekle.
    const combined = dateStr.includes('T') ? dateStr : `${dateStr}T${timeStr || '00:00:00'}`;
    const t = new Date(combined).getTime();
    return Number.isNaN(t) ? Date.now() : t;
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

// ── Aktivite bildirim filtresi modalı ──
function ActivityAlertModal({ visible, onClose, categories, onSaved }) {
    const t = useT();
    const [loading, setLoading] = useState(false);
    const [saving,  setSaving]  = useState(false);
    const [enabled, setEnabled] = useState(false);
    const [cats, setCats] = useState([]);
    const [subs, setSubs] = useState([]);
    const [cities, setCities] = useState([]);
    const [cityInput, setCityInput] = useState('');
    const [useProximity, setUseProximity] = useState(false);
    const [radiusKm, setRadiusKm] = useState(25);
    const [artists, setArtists] = useState([]);
    const [artistInput, setArtistInput] = useState('');

    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        api.get('/activity-alerts/me').then(({ data }) => {
            setEnabled(!!data.enabled);
            setCats(data.categories || []);
            setSubs(data.subCategories || []);
            setCities(data.cities || []);
            setUseProximity(!!data.useProximity);
            setRadiusKm(data.radiusKm || 25);
            setArtists(data.favoriteArtists || []);
        }).catch(() => {}).finally(() => setLoading(false));
    }, [visible]);

    const toggleCat = (key) => {
        setCats(prev => {
            const next = prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key];
            if (!next.includes(key)) {
                const catSubs = (categories.find(c => c.key === key)?.subs || []).map(s => s.key);
                setSubs(p => p.filter(s => !catSubs.includes(s)));
            }
            return next;
        });
    };
    const toggleSub = (key) => setSubs(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

    const addCity = () => {
        const v = cityInput.trim();
        if (v && !cities.some(c => c.toLowerCase() === v.toLowerCase())) setCities(prev => [...prev, v]);
        setCityInput('');
    };
    const removeCity = (c) => setCities(prev => prev.filter(x => x !== c));

    const addArtist = () => {
        const v = artistInput.trim();
        if (v && !artists.some(a => a.toLowerCase() === v.toLowerCase())) setArtists(prev => [...prev, v]);
        setArtistInput('');
    };
    const removeArtist = (a) => setArtists(prev => prev.filter(x => x !== a));

    const visibleSubs = (cats.length === 0 ? categories : categories.filter(c => cats.includes(c.key)))
        .flatMap(c => c.subs);

    const save = async () => {
        setSaving(true);
        try {
            await api.put('/activity-alerts/me', {
                enabled, categories: cats, subCategories: subs, cities,
                useProximity, radiusKm, favoriteArtists: artists,
            });
            onSaved?.(enabled);
            onClose();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actAlertSaveFailed);
        } finally { setSaving(false); }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={m.overlay}>
                <View style={[m.sheet, { height: '90%' }]}>
                    <View style={m.handle} />
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={m.title}>{t.actAlertTitle}</Text>
                        <TouchableOpacity onPress={() => setEnabled(v => !v)} style={[am.toggle, enabled && am.toggleActive]} activeOpacity={0.8}>
                            <View style={[am.toggleDot, enabled && am.toggleDotActive]} />
                        </TouchableOpacity>
                    </View>

                    {loading ? <ActivityIndicator color={colors.purple} style={{ marginVertical: 24 }} /> : (
                        <ScrollView showsVerticalScrollIndicator={false} style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }}>
                            <Text style={m.subLabel}>{t.actAlertCategory}</Text>
                            <View style={m.subGrid}>
                                {categories.map(cat => {
                                    const active = cats.includes(cat.key);
                                    return (
                                        <TouchableOpacity key={cat.key}
                                            style={[m.subChip, active && { backgroundColor: cat.color + '28', borderColor: cat.color }]}
                                            onPress={() => toggleCat(cat.key)} activeOpacity={0.8}>
                                            <Text style={m.subChipEmoji}>{cat.emoji}</Text>
                                            <Text style={[m.subChipText, active && { color: cat.color }]}>{cat.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={[m.subLabel, { marginTop: 14 }]}>{t.actAlertSub}</Text>
                            <View style={m.subGrid}>
                                {visibleSubs.map(sub => {
                                    const active = subs.includes(sub.key);
                                    return (
                                        <TouchableOpacity key={sub.key}
                                            style={[m.subChip, active && { backgroundColor: colors.purple + '28', borderColor: colors.purple }]}
                                            onPress={() => toggleSub(sub.key)} activeOpacity={0.8}>
                                            <Text style={m.subChipEmoji}>{sub.emoji}</Text>
                                            <Text style={[m.subChipText, active && { color: colors.purpleLight }]}>{sub.label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </View>

                            <Text style={[m.subLabel, { marginTop: 14 }]}>{t.actAlertCityLabel}</Text>
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                <TextInput
                                    style={[s.filterInput, { flex: 1 }]}
                                    value={cityInput} onChangeText={setCityInput}
                                    placeholder={t.actAlertCityPlaceholder} placeholderTextColor={colors.textMuted}
                                    onSubmitEditing={addCity} returnKeyType="done"
                                />
                                <TouchableOpacity onPress={addCity} style={am.addBtn} activeOpacity={0.8}>
                                    <Text style={am.addBtnText}>{t.actAlertAdd}</Text>
                                </TouchableOpacity>
                            </View>
                            {cities.length > 0 && (
                                <View style={[m.subGrid, { marginTop: 6 }]}>
                                    {cities.map(c => (
                                        <TouchableOpacity key={c} style={am.tagChip} onPress={() => removeCity(c)} activeOpacity={0.8}>
                                            <Text style={am.tagChipText}>📍 {c}  ✕</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            <TouchableOpacity
                                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 16 }}
                                onPress={() => setUseProximity(v => !v)} activeOpacity={0.8}
                            >
                                <Text style={m.subLabel}>{t.actAlertProximity}</Text>
                                <View style={[am.toggle, useProximity && am.toggleActive]}>
                                    <View style={[am.toggleDot, useProximity && am.toggleDotActive]} />
                                </View>
                            </TouchableOpacity>
                            {useProximity && (
                                <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
                                    {[10, 25, 50, 100].map(r => (
                                        <TouchableOpacity key={r} onPress={() => setRadiusKm(r)}
                                            style={[m.hourChip, radiusKm === r && m.hourChipActive]} activeOpacity={0.8}>
                                            <Text style={[m.hourText, radiusKm === r && m.hourTextActive]}>{r} km</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}

                            <Text style={[m.subLabel, { marginTop: 16 }]}>{t.actAlertArtistLabel}</Text>
                            <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                                <TextInput
                                    style={[s.filterInput, { flex: 1 }]}
                                    value={artistInput} onChangeText={setArtistInput}
                                    placeholder={t.actAlertArtistPlaceholder} placeholderTextColor={colors.textMuted}
                                    onSubmitEditing={addArtist} returnKeyType="done"
                                />
                                <TouchableOpacity onPress={addArtist} style={am.addBtn} activeOpacity={0.8}>
                                    <Text style={am.addBtnText}>{t.actAlertAdd}</Text>
                                </TouchableOpacity>
                            </View>
                            {artists.length > 0 && (
                                <View style={[m.subGrid, { marginTop: 6 }]}>
                                    {artists.map(a => (
                                        <TouchableOpacity key={a} style={am.tagChip} onPress={() => removeArtist(a)} activeOpacity={0.8}>
                                            <Text style={am.tagChipText}>🎤 {a}  ✕</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                        </ScrollView>
                    )}

                    <View style={m.btnRow}>
                        <TouchableOpacity style={m.clearBtn} onPress={onClose} activeOpacity={0.8}>
                            <Text style={m.clearBtnText}>{t.actAlertCancel}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[m.applyBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving} activeOpacity={0.8}>
                            {saving ? <ActivityIndicator size="small" color="#fff" /> : <Text style={m.applyBtnText}>{t.actAlertSave}</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ── Konum girişi + öneri ──
function LocationInput({ placeholder, value, onChange, type, province, compact }) {
    const [suggestions, setSuggestions] = useState([]);
    const [searched, setSearched] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [submitted, setSubmitted] = useState(false);
    const debounce = useRef(null);

    const handleChange = (text) => {
        onChange(text);
        setSubmitted(false);
        clearTimeout(debounce.current);
        if (text.length < 2) { setSuggestions([]); setSearched(false); return; }
        debounce.current = setTimeout(async () => {
            try {
                const { data } = await api.get('/rivals/location-suggestions', { params: { q: text, type } });
                setSuggestions(Array.isArray(data) ? data : []);
            } catch { setSuggestions([]); }
            setSearched(true);
        }, 300);
    };

    const sendApproval = async () => {
        if (!value.trim()) return;
        setSubmitting(true);
        try {
            await api.post('/cities', { province: province || '', district: value.trim() });
            setSubmitted(true);
            setSuggestions([]);
        } catch {}
        setSubmitting(false);
    };

    const showApprovalBtn = type === 'district' && searched && suggestions.length === 0 && value.length >= 2 && !submitted;

    return (
        <View style={{ flex: 1 }}>
            <TextInput
                style={[s.filterInput, compact && s.filterInputCompact]}
                placeholder={placeholder}
                placeholderTextColor={colors.textMuted}
                value={value}
                onChangeText={handleChange}
                autoCorrect={false}
                autoCapitalize="none"
            />
            {suggestions.map(sg => (
                <TouchableOpacity key={sg} style={s.suggItem}
                    onPress={() => { onChange(sg); setSuggestions([]); setSearched(false); }} activeOpacity={0.8}>
                    <Text style={s.suggText}>📍 {sg}</Text>
                </TouchableOpacity>
            ))}
            {showApprovalBtn && (
                <TouchableOpacity style={s.approvalBtn} onPress={sendApproval} disabled={submitting} activeOpacity={0.8}>
                    <Text style={s.approvalText}>
                        {submitting ? '⏳ Gönderiliyor…' : `📨 "${value}" için onay gönder`}
                    </Text>
                </TouchableOpacity>
            )}
            {submitted && (
                <View style={s.approvalSent}>
                    <Text style={s.approvalSentText}>✅ Gönderildi — admin onaylayınca listeye eklenir.</Text>
                </View>
            )}
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
                params: { category: item.category, sub: item.subCategory, initialTab: 'rivals', highlightRivalId: item.id },
            })}>
            <View style={[s.cardStripe, { backgroundColor: catMeta.color }]} />
            <View style={s.cardBody}>
                <View style={s.cardTop}>
                    <Text style={s.cardEmoji}>{subEmoji}</Text>
                    <View style={{ flex: 1 }}>
                        <Text style={s.cardSub} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {item.subCategory?.toUpperCase()}{item.matchMode === 'COMPETITIVE' ? ' · Rekabetçi' : ''}
                        </Text>
                        <Text style={s.cardUser} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.sender?.fullName || item.sender?.username || '—'}</Text>
                    </View>
                    <View style={[s.catBadge, { backgroundColor: catMeta.color + '22', borderColor: catMeta.color + '55' }]}>
                        <Text style={[s.catBadgeText, { color: catMeta.color }]}>{catMeta.emoji} {catMeta.label}</Text>
                    </View>
                </View>
                <View style={s.infoRow}>
                    {item.matchDate && <Text style={s.infoChip}>📅 {fmtDate(item.matchDate)}{item.matchTime ? ` · ${item.matchTime}` : ''}</Text>}
                    {(item.location || item.courtAddress) && <Text style={s.infoChip} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>📍 {item.location || item.courtAddress}</Text>}
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

// ── Konser/Sinema/Tiyatro (satıştaki) — ortak bilet kartı ──
function TicketedCard({ item, emoji }) {
    const priceLabel = item.priceMin != null
        ? `${item.priceMin}${item.priceMax && item.priceMax !== item.priceMin ? '–' + item.priceMax : ''} ${item.currency || ''}`.trim()
        : null;
    const dateLabel = item.date || item.releaseDate || null;
    return (
        <View style={s.ticketedCard}>
            {(item.imageUrl || item.posterUrl) ? (
                <Image source={{ uri: item.imageUrl || item.posterUrl }} style={s.ticketedImg} />
            ) : (
                <View style={[s.ticketedImg, s.ticketedImgFallback]}><Text style={{ fontSize: 22 }}>{emoji}</Text></View>
            )}
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.ticketedTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.name || item.title}</Text>
                {item.artist ? <Text style={s.ticketedMeta} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.artist}</Text> : null}
                <Text style={s.ticketedMeta} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                    {[item.venueName, item.city].filter(Boolean).join(' · ')}
                </Text>
                {dateLabel && <Text style={s.ticketedMeta}>{dateLabel}{item.time ? ` · ${item.time.slice(0, 5)}` : ''}</Text>}
                {item.rating != null && <Text style={s.ticketedMeta}>⭐ {item.rating.toFixed(1)}</Text>}
                {priceLabel && <Text style={s.ticketedPrice}>{priceLabel}</Text>}
                {item.ticketUrl && (
                    <TouchableOpacity style={s.ticketedBtn} onPress={() => Linking.openURL(item.ticketUrl)}>
                        <Text style={s.ticketedBtnText}>🎟️ Bilet Al</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

// ── Kurs kartı (kategori bağımsız — spor antrenörü de sanat hocası da olabilir) ──
function CourseFeedCard({ item }) {
    const priceLabel = [
        item.individual && item.priceIndividual ? `Bireysel ${item.priceIndividual}₺` : null,
        item.group && item.priceGroup ? `Grup ${item.priceGroup}₺` : null,
    ].filter(Boolean).join(' · ');
    return (
        <View style={s.ticketedCard}>
            <View style={[s.ticketedImg, s.ticketedImgFallback]}><Text style={{ fontSize: 22 }}>🎓</Text></View>
            <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={s.ticketedTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.user?.fullName || item.user?.username}</Text>
                <Text style={s.ticketedMeta} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.credentialLevel}</Text>
                <Text style={s.ticketedMeta} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>📍 {item.location}{item.city ? `, ${item.city}` : ''}</Text>
                {priceLabel ? <Text style={s.ticketedPrice}>{priceLabel}</Text> : null}
            </View>
        </View>
    );
}

// ── Ana ekran ──
export default function ActivityFeedScreen({ navigation }) {
    const lang     = useSelector(s => s.lang?.lang || 'en');
    const logoText = lang === 'tr' ? 'AkTiViTe' : 'AcTiViTy';

    const [items,     setItems]     = useState([]); // Etkinlik (ActivityRequest) sonuçları
    const [concertItems, setConcertItems] = useState([]);
    const [cinemaItems,  setCinemaItems]  = useState([]);
    const [theaterItems, setTheaterItems] = useState([]);
    const [courseItems,  setCourseItems]  = useState([]);
    const [loading,   setLoading]   = useState(false);
    const [joiningId, setJoiningId] = useState(null);
    const [feedTab,   setFeedTab]   = useState('current'); // 'current' | 'upcomingFull' | 'past'

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
    const [showAlertModal, setShowAlertModal] = useState(false);
    const [alertEnabled, setAlertEnabled] = useState(false);

    // Yakındaki aktiviteleri harita üzerinde gösteren modal.
    const [showActivityMap, setShowActivityMap] = useState(false);
    const [mapMyLocation, setMapMyLocation] = useState(null);
    const [mapLoading, setMapLoading] = useState(false);
    const [mapError, setMapError] = useState(null);

    const openActivityMap = async () => {
        setShowActivityMap(true);
        if (mapMyLocation) return;
        setMapLoading(true);
        setMapError(null);
        try {
            const perm = await Location.requestForegroundPermissionsAsync();
            if (!perm.granted) { setMapError('Konum izni verilmedi'); return; }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            setMapMyLocation({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
        } catch {
            setMapError('Konum alınamadı');
        } finally {
            setMapLoading(false);
        }
    };

    useEffect(() => {
        api.get('/activity-alerts/me').then(({ data }) => setAlertEnabled(!!data.enabled)).catch(() => {});
    }, []);

    // Destek mesajı
    const [supportOpen, setSupportOpen] = useState(false);
    const [supportMessages, setSupportMessages] = useState([]);
    const [supportLoading, setSupportLoading] = useState(false);
    const [supportText, setSupportText] = useState('');
    const [supportSending, setSupportSending] = useState(false);

    const loadSupportMessages = () => {
        setSupportLoading(true);
        api.get('/users/me/support-messages')
            .then(r => setSupportMessages(Array.isArray(r.data) ? r.data : []))
            .catch(() => setSupportMessages([]))
            .finally(() => setSupportLoading(false));
    };

    const openSupport = () => {
        setSupportOpen(true);
        loadSupportMessages();
    };

    const sendSupportMessage = async () => {
        if (!supportText.trim()) return;
        setSupportSending(true);
        try {
            await api.post('/users/me/support-messages', { message: supportText.trim() });
            setSupportText('');
            loadSupportMessages();
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Mesaj gönderilemedi');
        } finally {
            setSupportSending(false);
        }
    };

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
        // Dal seçimi tek başına içerik türünü belirler: kategori/dal filtrelenmemişse
        // (Tümü) her tür gösterilir; bir dal seçiliyse sadece o dala uyan satıştaki
        // türler (konser/sinema/tiyatro) dahil edilir. Etkinlik ve Kurs her zaman
        // aktif kategori/dal parametreleriyle daraltılarak gösterilir.
        const catsOk      = cats.length === 0 || cats.includes('ARTS');
        const noSubFilter = subs.length === 0;
        const wantConcert = catsOk && (noSubFilter || subs.includes('music'));
        const wantCinema  = catsOk && (noSubFilter || subs.includes('cinema'));
        const wantTheater = catsOk && (noSubFilter || subs.includes('theater'));

        // Etkinlik (ActivityRequest) — kategori×dal kombinasyonlarına fan-out (mevcut desen)
        const eventPromise = (async () => {
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
                return merged;
            } catch { return []; }
        })();

        const concertPromise = wantConcert
            ? api.get('/concerts/search', { params: { city: c || undefined, dateFrom: df || undefined, dateTo: dt || undefined } })
                .then(r => r.data?.concerts || []).catch(() => [])
            : Promise.resolve([]);

        const cinemaPromise = wantCinema
            ? api.get('/movies/now-playing', { params: { city: c || undefined } })
                .then(r => r.data?.movies || []).catch(() => [])
            : Promise.resolve([]);

        const theaterPromise = wantTheater
            ? api.get('/theater/search', { params: { city: c || undefined, dateFrom: df || undefined, dateTo: dt || undefined } })
                .then(r => r.data?.plays || []).catch(() => [])
            : Promise.resolve([]);

        const coursePromise = api.get('/coaches', { params: { category: cats[0] || undefined, subCategory: subs[0] || undefined } })
            .then(r => r.data || []).catch(() => []);

        try {
            const [eventRes, concertRes, cinemaRes, theaterRes, courseRes] = await Promise.all([
                eventPromise, concertPromise, cinemaPromise, theaterPromise, coursePromise,
            ]);
            setItems(eventRes);
            setConcertItems(concertRes);
            setCinemaItems(cinemaRes);
            setTheaterItems(theaterRes);
            setCourseItems(courseRes);
        } catch {
            setItems([]); setConcertItems([]); setCinemaItems([]); setTheaterItems([]); setCourseItems([]);
        } finally { setLoading(false); }
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

    // Tüm kaynaklar (Etkinlik/Konser/Sinema/Tiyatro/Kurs) tek bir akışta,
    // yakından uzağa (tarihi olmayanlar en yakına) karışık sıralanır. Gerçek
    // tarihi olan türler (etkinlik/konser/tiyatro) başlangıcından 15 dk sonra
    // "geçmiş" sayılıp ayrı sekmeye düşer — sinema/kurs tarihsiz/süregelen
    // olduğu için hiçbir zaman geçmişe düşmez. Henüz geçmemiş ama kontenjanı
    // dolmuş etkinlikler (ActivityCard'daki "Dolu" durumu ile aynı hesap)
    // geçmişe değil, ayrı bir "Yaklaşan Aktiviteler" sekmesine düşer.
    const PAST_GRACE_MS = 15 * 60 * 1000;
    const isEventFull = (item) => ((item.teamSize * 2) - 1 - (item.participants?.length || 0)) <= 0;
    const { feedItems, upcomingFullFeedItems, pastFeedItems } = useMemo(() => {
        const merged = [
            ...items.map(item => ({ key: `event-${item.id}`, type: 'event', data: item, sortTime: feedSortTime(item.matchDate), hasDate: true })),
            ...concertItems.map(item => ({ key: `concert-${item.id}`, type: 'concert', data: item, sortTime: feedSortTime(item.date, item.time), hasDate: true })),
            ...cinemaItems.map(item => ({ key: `cinema-${item.id}`, type: 'cinema', data: item, sortTime: feedSortTime(null), hasDate: false })),
            ...theaterItems.map(item => ({ key: `theater-${item.id}`, type: 'theater', data: item, sortTime: feedSortTime(item.date, item.time), hasDate: true })),
            ...courseItems.map(item => ({ key: `course-${item.id}`, type: 'course', data: item, sortTime: feedSortTime(null), hasDate: false })),
        ];
        const now = Date.now();
        const upcoming = merged.filter(fi => !fi.hasDate || fi.sortTime + PAST_GRACE_MS >= now);
        const past     = merged.filter(fi =>  fi.hasDate && fi.sortTime + PAST_GRACE_MS <  now);
        const isFull   = (fi) => fi.type === 'event' && isEventFull(fi.data);
        const current       = upcoming.filter(fi => !isFull(fi));
        const upcomingFull  = upcoming.filter(fi =>  isFull(fi));
        current.sort((a, b) => a.sortTime - b.sortTime);
        upcomingFull.sort((a, b) => a.sortTime - b.sortTime);
        past.sort((a, b) => b.sortTime - a.sortTime);
        return { feedItems: current, upcomingFullFeedItems: upcomingFull, pastFeedItems: past };
    }, [items, concertItems, cinemaItems, theaterItems, courseItems]);

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />

            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <RainbowLogo text={logoText} style={{ fontSize: 22, fontWeight: '900', letterSpacing: 2 }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    {hasFilter && (
                        <TouchableOpacity onPress={clearAll} style={s.clearBtn} activeOpacity={0.8}>
                            <Text style={s.clearBtnText}>✕ Temizle</Text>
                        </TouchableOpacity>
                    )}
                    <TouchableOpacity onPress={openActivityMap} style={am.bellBtn} activeOpacity={0.8}>
                        <Text style={am.bellBtnText}>🗺️</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={() => setShowAlertModal(true)} style={[am.bellBtn, alertEnabled && am.bellBtnActive]} activeOpacity={0.8}>
                        <Text style={am.bellBtnText}>{alertEnabled ? '🔔' : '🔕'}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity onPress={openSupport} style={s.supportBtn} activeOpacity={0.8}>
                        <Text style={s.supportBtnText}>💬 Destek</Text>
                    </TouchableOpacity>
                </View>
            </View>

            <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" nestedScrollEnabled>

                {/* ── Filtre paneli ── */}
                <View style={s.filterPanel}>

                    {/* Konum + Tarih/Saat — tek satırda dört kutu */}
                    <Text style={s.sectionLabel}>📍 Konum · 📅 Tarih · 🕐 Saat</Text>
                    <View style={s.filterRow}>
                        <LocationInput placeholder="İl" value={city} onChange={setCity} type="city" compact />
                        <LocationInput placeholder="İlçe" value={district} onChange={setDistrict} type="district" province={city} compact />
                        <TouchableOpacity style={[s.pickerField, { flex: 1 }, dateLabel && s.pickerFieldActive]} onPress={() => setShowDateModal(true)} activeOpacity={0.8}>
                            <Text style={[s.pickerFieldText, dateLabel && { color: colors.purpleLight }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                                {dateLabel || '📅'}
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.pickerField, { flex: 1 }, timeLabel && s.pickerFieldActive]} onPress={() => setShowTimeModal(true)} activeOpacity={0.8}>
                            <Text style={[s.pickerFieldText, timeLabel && { color: colors.purpleLight }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                                {timeLabel || '🕐'}
                            </Text>
                        </TouchableOpacity>
                    </View>

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
                        <Text style={[s.pickerFieldText, selSubs.length > 0 && { color: colors.purpleLight }]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                            {selSubs.length > 0 ? selSubs.map(k => SUB_MAP[k]?.label || k).join(', ') : 'Dal seç…'}
                        </Text>
                        <Text style={s.pickerArrow}>›</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Güncel / Geçmiş sekmeleri ── */}
                <View style={s.feedTabRow}>
                    <TouchableOpacity
                        style={[s.feedTabBtn, feedTab === 'current' && s.feedTabBtnActive]}
                        onPress={() => setFeedTab('current')} activeOpacity={0.8}>
                        <Text style={[s.feedTabText, feedTab === 'current' && s.feedTabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Aktivite</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.feedTabBtn, feedTab === 'upcomingFull' && s.feedTabBtnActive]}
                        onPress={() => setFeedTab('upcomingFull')} activeOpacity={0.8}>
                        <Text style={[s.feedTabText, feedTab === 'upcomingFull' && s.feedTabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Yaklaşan Aktiviteler{upcomingFullFeedItems.length > 0 ? ` (${upcomingFullFeedItems.length})` : ''}</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                        style={[s.feedTabBtn, feedTab === 'past' && s.feedTabBtnActive]}
                        onPress={() => setFeedTab('past')} activeOpacity={0.8}>
                        <Text style={[s.feedTabText, feedTab === 'past' && s.feedTabTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>Geçmiş Aktiviteler{pastFeedItems.length > 0 ? ` (${pastFeedItems.length})` : ''}</Text>
                    </TouchableOpacity>
                </View>

                {/* ── Sonuçlar — tek karışık akış, yakından uzağa sıralı ── */}
                {(() => {
                    const list = feedTab === 'past' ? pastFeedItems : feedTab === 'upcomingFull' ? upcomingFullFeedItems : feedItems;
                    if (loading) return <View style={s.center}><ActivityIndicator size="large" color={colors.purple} /></View>;
                    if (list.length === 0) return (
                        <View style={s.center}>
                            <Text style={s.emptyEmoji}>🔍</Text>
                            <Text style={s.emptyText}>{feedTab === 'past' ? 'Geçmiş aktivite yok' : feedTab === 'upcomingFull' ? 'Yaklaşan dolu aktivite yok' : 'Aktivite bulunamadı'}</Text>
                            <Text style={s.emptyHint}>{feedTab === 'past' ? 'Süresi geçen aktiviteler burada listelenir' : feedTab === 'upcomingFull' ? 'Kontenjanı dolmuş yaklaşan aktiviteler burada listelenir' : 'Filtreni değiştir veya daha sonra tekrar bak'}</Text>
                        </View>
                    );
                    return (
                        <View style={{ padding: 3, gap: 3, paddingBottom: 20 }}>
                            {list.map(fi => {
                                if (fi.type === 'event') return (
                                    <ActivityCard key={fi.key} item={fi.data} navigation={navigation}
                                        onJoin={handleJoin} joining={joiningId === fi.data.id} />
                                );
                                if (fi.type === 'course') return <CourseFeedCard key={fi.key} item={fi.data} />;
                                const emoji = fi.type === 'concert' ? '🎵' : fi.type === 'cinema' ? '🎬' : '🎫';
                                return <TicketedCard key={fi.key} item={fi.data} emoji={emoji} />;
                            })}
                        </View>
                    );
                })()}
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

            {/* Aktivite bildirim filtresi modalı */}
            <ActivityAlertModal
                visible={showAlertModal}
                categories={categories}
                onSaved={setAlertEnabled}
                onClose={() => setShowAlertModal(false)}
            />

            {/* Destek mesajı modalı */}
            <Modal visible={supportOpen} animationType="slide" transparent onRequestClose={() => setSupportOpen(false)}>
                <View style={m.overlay}>
                    <View style={m.sheet}>
                        <View style={sup.header}>
                            <Text style={m.title}>💬 Admine Destek Mesajı</Text>
                            <TouchableOpacity onPress={() => setSupportOpen(false)}>
                                <Text style={sup.closeBtn}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
                            {supportLoading ? (
                                <ActivityIndicator color={colors.purple} style={{ marginVertical: 16 }} />
                            ) : supportMessages.length === 0 ? (
                                <Text style={sup.emptyText}>Henüz mesaj göndermediniz.</Text>
                            ) : (
                                supportMessages.map(m => (
                                    <View key={m.id} style={sup.msgBox}>
                                        <Text style={sup.msgText}>{m.message}</Text>
                                        {m.status === 'PENDING' ? (
                                            <Text style={sup.pendingText}>⏳ Mesajınız iletildi, ekibimiz en kısa sürede yanıtlayacak.</Text>
                                        ) : (
                                            <View style={sup.replyBox}>
                                                <Text style={sup.replyLabel}>✅ Yanıtlandı</Text>
                                                <Text style={sup.replyText}>{m.adminReply}</Text>
                                            </View>
                                        )}
                                    </View>
                                ))
                            )}
                        </ScrollView>
                        <TextInput
                            style={sup.input}
                            value={supportText}
                            onChangeText={setSupportText}
                            placeholder="Mesajınızı yazın..."
                            placeholderTextColor={colors.textMuted}
                            multiline
                        />
                        <TouchableOpacity
                            style={[sup.sendBtn, (!supportText.trim() || supportSending) && { opacity: 0.5 }]}
                            onPress={sendSupportMessage}
                            disabled={!supportText.trim() || supportSending}
                            activeOpacity={0.8}
                        >
                            {supportSending
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text style={sup.sendBtnText}>Gönder</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            {/* ── Yakındaki Aktiviteler Haritası ── */}
            <Modal visible={showActivityMap} animationType="slide" onRequestClose={() => setShowActivityMap(false)}>
                <View style={{ flex: 1, backgroundColor: colors.bg }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 9,
                        paddingTop: Platform.OS === 'ios' ? 56 : 24, paddingBottom: 11,
                        borderBottomWidth: 1, borderBottomColor: colors.border }}>
                        <TouchableOpacity onPress={() => setShowActivityMap(false)} style={{ marginRight: 14, padding: 1 }}>
                            <Text style={{ color: '#fff', fontSize: 22, fontWeight: '300' }}>←</Text>
                        </TouchableOpacity>
                        <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', flex: 1 }}>🗺️ Yakındaki Aktiviteler</Text>
                    </View>
                    {mapLoading ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
                            <ActivityIndicator color={colors.purple} />
                            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 8 }}>Konumunuz alınıyor...</Text>
                        </View>
                    ) : mapError ? (
                        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', marginBottom: 12 }}>{mapError}</Text>
                            <TouchableOpacity onPress={openActivityMap} style={{ backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 8, paddingHorizontal: 16 }}>
                                <Text style={{ color: '#fff', fontWeight: '700' }}>Tekrar Dene</Text>
                            </TouchableOpacity>
                        </View>
                    ) : mapMyLocation ? (() => {
                        const mapItems = items.filter(it => it.courtLat != null && it.courtLng != null);
                        const mapConcerts = concertItems.filter(c => c.venueLat != null && c.venueLng != null);
                        const mapPlays = theaterItems.filter(p => p.venueLat != null && p.venueLng != null);
                        const totalCount = mapItems.length + mapConcerts.length + mapPlays.length;
                        return (
                            <>
                                <MapView
                                    provider={PROVIDER_DEFAULT}
                                    style={{ flex: 1 }}
                                    initialRegion={{
                                        latitude: mapMyLocation.latitude,
                                        longitude: mapMyLocation.longitude,
                                        latitudeDelta: 0.08,
                                        longitudeDelta: 0.08,
                                    }}
                                    showsUserLocation
                                    showsMyLocationButton
                                >
                                    {mapItems.map(it => {
                                        const catMeta = CAT_MAP[it.category] || { color: colors.purple };
                                        return (
                                            <Marker
                                                key={`rival-${it.id}`}
                                                coordinate={{ latitude: it.courtLat, longitude: it.courtLng }}
                                                pinColor={catMeta.color}
                                                title={`${it.subCategory} · ${it.sender?.fullName || it.sender?.username || ''}`}
                                                description={it.courtName || it.location || ''}
                                                onCalloutPress={() => {
                                                    setShowActivityMap(false);
                                                    navigation.navigate('HomeTab', {
                                                        screen: 'SubCategory',
                                                        params: { category: it.category, sub: it.subCategory, initialTab: 'rivals', highlightRivalId: it.id },
                                                    });
                                                }}
                                            />
                                        );
                                    })}
                                    {mapConcerts.map(c => (
                                        <Marker
                                            key={`concert-${c.id}`}
                                            coordinate={{ latitude: c.venueLat, longitude: c.venueLng }}
                                            pinColor="#ec4899"
                                            title={`🎵 ${c.name}`}
                                            description={c.venueName || c.city || ''}
                                            onCalloutPress={() => c.ticketUrl && Linking.openURL(c.ticketUrl)}
                                        />
                                    ))}
                                    {mapPlays.map(p => (
                                        <Marker
                                            key={`play-${p.id}`}
                                            coordinate={{ latitude: p.venueLat, longitude: p.venueLng }}
                                            pinColor="#f59e0b"
                                            title={`🎭 ${p.name}`}
                                            description={p.venueName || p.city || ''}
                                            onCalloutPress={() => p.ticketUrl && Linking.openURL(p.ticketUrl)}
                                        />
                                    ))}
                                </MapView>
                                <View style={{ position: 'absolute', bottom: 16, left: 16, right: 16, backgroundColor: colors.surface, borderRadius: 12, padding: 10, borderWidth: 1, borderColor: colors.border }}>
                                    <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: 'center' }}>
                                        {totalCount > 0
                                            ? `${totalCount} aktivite konum bilgisiyle haritada — bir işaretçiye dokunup açın`
                                            : 'Konum bilgisi olan bir aktivite bulunamadı'}
                                    </Text>
                                </View>
                            </>
                        );
                    })() : null}
                </View>
            </Modal>
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
    supportBtn:     { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: colors.purple, backgroundColor: colors.purple + '18' },
    supportBtnText: { color: colors.purpleLight || colors.purple, fontSize: 12, fontWeight: '700' },

    feedTabRow:      { flexDirection: 'row', gap: 6, paddingHorizontal: 8, paddingTop: 8, paddingBottom: 4 },
    feedTabBtn:      { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    feedTabBtnActive:{ backgroundColor: colors.purple + '22', borderColor: colors.purple },
    feedTabText:     { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    feedTabTextActive:{ color: colors.purpleLight || colors.purple },

    ticketedCard: { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 10 },
    ticketedImg: { width: 64, height: 64, borderRadius: 8 },
    ticketedImgFallback: { backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
    ticketedTitle: { color: '#fff', fontSize: 13, fontWeight: '800' },
    ticketedMeta: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    ticketedPrice: { color: colors.purple, fontSize: 11, fontWeight: '700', marginTop: 2 },
    ticketedBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', marginTop: 6 },
    ticketedBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },

    filterPanel: {
        backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border,
        paddingHorizontal: 3, paddingTop: 3, paddingBottom: 3, gap: 3,
    },
    sectionLabel: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
    filterRow:    { flexDirection: 'row', gap: 3 },
    filterInput:  {
        flex: 1, backgroundColor: colors.surface2, borderRadius: 8,
        paddingHorizontal: 8, paddingVertical: 5, color: '#fff', fontSize: 12,
        borderWidth: 1, borderColor: colors.border,
    },
    filterInputCompact: { paddingHorizontal: 6, paddingVertical: 6, fontSize: 11 },

    pickerField: {
        flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
        backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 4, paddingVertical: 6,
        borderWidth: 1, borderColor: colors.border,
    },
    pickerFieldActive: { borderColor: colors.purple, backgroundColor: colors.purple + '12' },
    pickerFieldText:   { color: colors.textMuted, fontSize: 10, textAlign: 'center' },
    pickerArrow:       { color: colors.textMuted, fontSize: 14 },

    chipRow:   { gap: 3, paddingVertical: 3 },
    chip:      { flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 3, paddingVertical: 3, borderRadius: 20, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    chipEmoji: { fontSize: 12 },
    chipText:  { color: colors.textSecondary, fontSize: 10, fontWeight: '700' },

    suggItem:        { paddingHorizontal: 12, paddingVertical: 9, marginTop: 3, backgroundColor: colors.surface2, borderRadius: 8, borderWidth: 1, borderColor: colors.border },
    suggText:        { color: '#fff', fontSize: 13 },
    approvalBtn:     { marginTop: 4, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: colors.purple + '22', borderRadius: 8, borderWidth: 1, borderColor: colors.purple },
    approvalText:    { color: colors.purpleLight || colors.purple, fontSize: 12, fontWeight: '700' },
    approvalSent:    { marginTop: 4, paddingHorizontal: 12, paddingVertical: 9, backgroundColor: '#10b98122', borderRadius: 8, borderWidth: 1, borderColor: '#10b981' },
    approvalSentText:{ color: '#10b981', fontSize: 12 },

    center:    { paddingTop: 60, alignItems: 'center', gap: 8 },
    emptyEmoji:{ fontSize: 40 },
    emptyText: { color: '#fff', fontSize: 16, fontWeight: '700' },
    emptyHint: { color: colors.textMuted, fontSize: 13 },

    card:      { flexDirection: 'row', backgroundColor: colors.surface, borderRadius: 14, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    cardStripe:{ width: 4 },
    cardBody:  { flex: 1, padding: 3, gap: 3 },
    cardTop:   { flexDirection: 'row', alignItems: 'center', gap: 3 },
    cardEmoji: { fontSize: 20 },
    cardSub:   { color: '#fff', fontSize: 11, fontWeight: '900' },
    cardUser:  { color: colors.textSecondary, fontSize: 10, marginTop: 1 },
    catBadge:  { paddingHorizontal: 3, paddingVertical: 3, borderRadius: 8, borderWidth: 1 },
    catBadgeText: { fontSize: 9, fontWeight: '800' },
    infoRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    infoChip:  { color: colors.textSecondary, fontSize: 10, backgroundColor: colors.surface2, borderRadius: 6, paddingHorizontal: 3, paddingVertical: 3 },
    cardMsg:   { color: colors.textMuted, fontSize: 11, fontStyle: 'italic' },
    cardFooter:{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
    spotsText: { flex: 1, color: colors.textMuted, fontSize: 10 },
    feeText:   { color: colors.yellow, fontSize: 10, fontWeight: '700' },
    pendingBadge: { paddingHorizontal: 3, paddingVertical: 3, borderRadius: 8, backgroundColor: colors.yellow+'22', borderWidth: 1, borderColor: colors.yellow+'55' },
    pendingText:  { color: colors.yellow, fontSize: 10, fontWeight: '700' },
    joinBtn:      { backgroundColor: colors.purple, paddingHorizontal: 3, paddingVertical: 3, borderRadius: 10 },
    joinBtnText:  { color: '#fff', fontSize: 11, fontWeight: '800' },
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

const sup = StyleSheet.create({
    header:      { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
    closeBtn:    { color: colors.textMuted, fontSize: 18, padding: 3 },
    emptyText:   { color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 3 },
    msgBox:      { backgroundColor: colors.surface2, borderRadius: 12, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    msgText:     { color: '#fff', fontSize: 13 },
    pendingText: { color: colors.yellow, fontSize: 11, marginTop: 6 },
    replyBox:    { marginTop: 6, backgroundColor: '#10b98118', borderRadius: 8, padding: 8, borderWidth: 1, borderColor: '#10b98150' },
    replyLabel:  { color: '#10b981', fontSize: 11, fontWeight: '700', marginBottom: 2 },
    replyText:   { color: '#fff', fontSize: 12 },
    input:       {
        backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border,
        color: '#fff', fontSize: 13, padding: 10, minHeight: 60, textAlignVertical: 'top', marginTop: 8,
    },
    sendBtn:     { backgroundColor: colors.purple, borderRadius: 12, paddingVertical: 11, alignItems: 'center', marginTop: 8 },
    sendBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});

const am = StyleSheet.create({
    bellBtn:       { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 16, borderWidth: 1, borderColor: colors.border },
    bellBtnActive: { borderColor: colors.purple, backgroundColor: colors.purple + '18' },
    bellBtnText:   { fontSize: 14 },

    toggle:          { width: 44, height: 26, borderRadius: 13, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, padding: 2, justifyContent: 'center' },
    toggleActive:    { backgroundColor: colors.purple + '55', borderColor: colors.purple },
    toggleDot:       { width: 20, height: 20, borderRadius: 10, backgroundColor: colors.textMuted, alignSelf: 'flex-start' },
    toggleDotActive: { backgroundColor: colors.purple, alignSelf: 'flex-end' },

    addBtn:     { backgroundColor: colors.purple, borderRadius: 8, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center' },
    addBtnText: { color: '#fff', fontWeight: '800', fontSize: 12 },

    tagChip:     { backgroundColor: colors.purple + '18', borderWidth: 1, borderColor: colors.purple + '50', borderRadius: 20, paddingHorizontal: 10, paddingVertical: 6 },
    tagChipText: { color: colors.purpleLight || colors.purple, fontSize: 12, fontWeight: '700' },
});
