import { useState, useCallback, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Modal,
} from 'react-native';
import colors from '../../theme/colors';
import api from '../../services/api';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function getDateStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateLabel(dateStr) {
    const [y, m, day] = dateStr.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    const days   = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return `${days[d.getDay()]} ${day} ${months[m - 1]}`;
}

const DATE_OPTIONS = Array.from({ length: 14 }, (_, i) => getDateStr(i));
const SLOT_LABEL   = { FULL_HOUR: 'Tam Saatler', HALF_HOUR: 'Buçuklu', NINETY_MIN: '90 dk' };

// ─── Onay Modalı (en üst seviyede, nested modal sorunu yok) ──────────────────
function ConfirmModal({ visible, venue, court, slot, date, onConfirm, onClose, confirming }) {
    const [payment, setPayment] = useState('CASH');
    if (!venue || !court || !slot) return null;
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={cm.overlay}>
                <View style={cm.box}>
                    <Text style={cm.title}>Rezervasyon Onayla</Text>
                    <View style={cm.infoCard}>
                        {[
                            { label: 'Tesis',  value: venue.name },
                            { label: 'Kort',   value: court.name },
                            { label: 'Tarih',  value: formatDateLabel(date) },
                            { label: 'Saat',   value: `${slot.start} – ${slot.end}` },
                            { label: 'Ücret',  value: (() => { const p = slot?.price ?? venue.pricePerSlot; return p > 0 ? `${p}₺` : 'Ücretsiz'; })() },
                        ].map(r => (
                            <View key={r.label} style={cm.infoRow}>
                                <Text style={cm.infoLabel}>{r.label}</Text>
                                <Text style={cm.infoValue}>{r.value}</Text>
                            </View>
                        ))}
                    </View>
                    <Text style={cm.payLabel}>Ödeme Yöntemi</Text>
                    <TouchableOpacity
                        style={[cm.payOpt, payment === 'CASH' && cm.payOptActive]}
                        onPress={() => setPayment('CASH')}
                        activeOpacity={0.8}
                    >
                        <Text style={cm.payOptText}>💵 Kort Başında Nakit / Kart</Text>
                        {payment === 'CASH' && <Text style={cm.check}>✓</Text>}
                    </TouchableOpacity>
                    <View style={[cm.payOpt, cm.payOptDisabled]}>
                        <Text style={[cm.payOptText, { color: colors.textMuted }]}>💳 Online Ödeme</Text>
                        <View style={cm.soonBadge}><Text style={cm.soonText}>Yakında</Text></View>
                    </View>
                    <View style={cm.btnRow}>
                        <TouchableOpacity style={cm.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                            <Text style={cm.cancelBtnText}>Vazgeç</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[cm.confirmBtn, confirming && { opacity: 0.6 }]}
                            onPress={() => onConfirm(payment)}
                            disabled={confirming}
                            activeOpacity={0.8}
                        >
                            {confirming
                                ? <ActivityIndicator size="small" color="#fff" />
                                : <Text style={cm.confirmBtnText}>Rezervasyon Yap ✓</Text>}
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ─── Tesis Rezervasyon Sayfası (Bottom Sheet) ─────────────────────────────────
const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toT = m => `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;

function genVarSlots(windows, durationMins) {
    const out = [];
    for (const w of windows) {
        const ws = toM(w.start), we = toM(w.end);
        for (let t = ws; t + durationMins <= we; t += 60) {
            const price = w.pricePerHour != null ? Math.round(w.pricePerHour * (durationMins / 60)) : null;
            out.push({ start: toT(t), end: toT(t + durationMins), free: true, price, durationMins });
        }
    }
    return out;
}

function VenueBookingSheet({ venue, visible, onClose, onPickSlot }) {
    const [date,        setDate]        = useState(DATE_OPTIONS[0]);
    const [slotsMap,    setSlotsMap]    = useState({});
    const [picked,      setPicked]      = useState(null);
    const [varDurMap,   setVarDurMap]   = useState({}); // { [courtId]: 60|90|120 }

    const fetchAllSlots = useCallback(async (d) => {
        if (!venue?.courts?.length) return;
        const init = {};
        venue.courts.forEach(c => { init[c.id] = { slots: [], loading: true, error: null, type: null, windows: [] }; });
        setSlotsMap(init);

        await Promise.all(venue.courts.map(async (court) => {
            try {
                const { data } = await api.get(
                    `/venues/${venue.id}/courts/${court.id}/slots`,
                    { params: { date: d } }
                );
                const slots = data?.slots || (data?.type !== 'VAR_DURATION' ? data?.windows : []) || [];
                setSlotsMap(prev => ({ ...prev, [court.id]: { slots, loading: false, error: null, type: data?.type, windows: data?.windows || [] } }));
            } catch {
                setSlotsMap(prev => ({ ...prev, [court.id]: { slots: [], loading: false, error: 'Yüklenemedi', type: null, windows: [] } }));
            }
        }));
    }, [venue]);

    useEffect(() => {
        if (visible && venue) {
            const today = DATE_OPTIONS[0];
            setDate(today);
            setPicked(null);
            fetchAllSlots(today);
        }
    }, [visible, venue]);

    const handleDateChange = (d) => {
        setDate(d);
        setPicked(null);
        fetchAllSlots(d);
    };

    const handleReserve = () => {
        if (!picked) return;
        onPickSlot(picked.court, picked.slot, date);
    };

    if (!venue) return null;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={bm.overlay}>
                <View style={bm.sheet}>
                    <View style={bm.handle} />

                    {/* Header */}
                    <View style={bm.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={bm.venueName}>{venue.name}</Text>
                            <Text style={bm.venueMeta}>
                                {venue.branch} · {venue.city}{venue.district ? ` / ${venue.district}` : ''}
                            </Text>
                        </View>
                        <TouchableOpacity onPress={onClose} style={bm.closeBtn}>
                            <Text style={bm.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Rozetler */}
                    <View style={bm.tagRow}>
                        <View style={bm.tag}><Text style={bm.tagText}>⏰ {venue.openTime}–{venue.closeTime}</Text></View>
                        <View style={bm.tag}><Text style={bm.tagText}>📅 {SLOT_LABEL[venue.slotType] || venue.slotType}</Text></View>
                        {venue.phone ? <View style={bm.tag}><Text style={bm.tagText}>📞 {venue.phone}</Text></View> : null}
                    </View>

                    {/* Fiyat politikası özeti */}
                    {(() => {
                        const pw = Array.isArray(venue.pricingWindows) ? venue.pricingWindows : [];
                        if (pw.length === 0) return null;
                        return (
                            <View style={{ paddingHorizontal: 16, paddingBottom: 10, flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
                                {pw.map((rule, i) => {
                                    const courtName = rule.courtId
                                        ? (venue.courts || []).find(c => c.id === rule.courtId)?.name
                                        : null;
                                    return (
                                        <View key={i} style={bm.priceTag}>
                                            <Text style={bm.priceTagText}>
                                                💰 {rule.from}–{rule.to}: {rule.price > 0 ? `${rule.price}₺` : 'Ücretsiz'}{courtName ? ` · ${courtName}` : ''}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        );
                    })()}

                    {/* Tarih Seçici */}
                    <FlatList
                        data={DATE_OPTIONS}
                        keyExtractor={d => d}
                        horizontal
                        showsHorizontalScrollIndicator={false}
                        contentContainerStyle={bm.dateList}
                        renderItem={({ item }) => {
                            const active = item === date;
                            return (
                                <TouchableOpacity
                                    style={[bm.dateBtn, active && bm.dateBtnActive]}
                                    onPress={() => handleDateChange(item)}
                                    activeOpacity={0.7}
                                >
                                    <Text style={[bm.dateBtnText, active && bm.dateBtnTextActive]}>
                                        {formatDateLabel(item)}
                                    </Text>
                                </TouchableOpacity>
                            );
                        }}
                    />

                    {/* Kortlar + Slotlar */}
                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={bm.scroll}>
                        {venue.courts.map(court => {
                            const entry      = slotsMap[court.id] || { slots: [], loading: true, type: null, windows: [] };
                            const isVar      = entry.type === 'VAR_DURATION';
                            const dur        = varDurMap[court.id] || 60;
                            const displaySlots = isVar ? genVarSlots(entry.windows, dur) : entry.slots;
                            const freeCount  = displaySlots.filter(sl => sl.free !== false).length;
                            return (
                                <View key={court.id} style={bm.courtSection}>
                                    <View style={bm.courtHeader}>
                                        <Text style={bm.courtName}>🎾 {court.name}</Text>
                                        {!entry.loading && (
                                            <Text style={[bm.courtFree, freeCount === 0 && { color: colors.textMuted }]}>
                                                {freeCount > 0 ? `${freeCount} müsait` : 'Dolu'}
                                            </Text>
                                        )}
                                    </View>

                                    {isVar && !entry.loading && (
                                        <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                                            {[60, 90, 120].map(d => (
                                                <TouchableOpacity key={d}
                                                    onPress={() => { setVarDurMap(p => ({ ...p, [court.id]: d })); setPicked(null); }}
                                                    style={{ flex: 1, paddingVertical: 6, borderRadius: 8, alignItems: 'center',
                                                        borderWidth: 1.5,
                                                        borderColor: dur === d ? colors.purple : colors.border,
                                                        backgroundColor: dur === d ? colors.purple + '20' : colors.surface2 }}>
                                                    <Text style={{ color: dur === d ? colors.purple : colors.textMuted,
                                                        fontWeight: '800', fontSize: 12 }}>{d} dk</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}

                                    {entry.loading ? (
                                        <ActivityIndicator size="small" color={colors.purple} style={{ marginVertical: 12 }} />
                                    ) : entry.error ? (
                                        <Text style={bm.errorText}>{entry.error}</Text>
                                    ) : displaySlots.length === 0 ? (
                                        <Text style={bm.noSlotText}>Bu tarihte slot tanımlı değil.</Text>
                                    ) : (
                                        <View style={bm.slotGrid}>
                                            {displaySlots.map((slot, i) => {
                                                const isPicked =
                                                    picked?.court.id === court.id &&
                                                    picked?.slot.start === slot.start &&
                                                    picked?.slot.end === slot.end;
                                                return (
                                                    <TouchableOpacity
                                                        key={i}
                                                        style={[
                                                            bm.slotBtn,
                                                            !slot.free && bm.slotBtnTaken,
                                                            isPicked && bm.slotBtnPicked,
                                                        ]}
                                                        onPress={() => slot.free && setPicked({ court, slot })}
                                                        disabled={!slot.free}
                                                        activeOpacity={0.7}
                                                    >
                                                        <Text style={[bm.slotTime, !slot.free && bm.slotTimeTaken, isPicked && bm.slotTimePicked]}>
                                                            {slot.start}
                                                        </Text>
                                                        <Text style={[bm.slotEnd, !slot.free && bm.slotTimeTaken, isPicked && bm.slotTimePicked]}>
                                                            –{slot.end}
                                                        </Text>
                                                        {slot.price != null && slot.free !== false && (
                                                            <Text style={{ color: isPicked ? '#ffffffcc' : colors.purple, fontSize: 10, fontWeight: '800', marginTop: 2 }}>
                                                                {slot.price > 0 ? `${slot.price}₺` : 'Ücretsiz'}
                                                            </Text>
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    )}
                                </View>
                            );
                        })}

                        {/* Lejant */}
                        <View style={bm.legend}>
                            <View style={bm.legendItem}>
                                <View style={[bm.legendDot, { borderColor: colors.purple }]} />
                                <Text style={bm.legendText}>Müsait</Text>
                            </View>
                            <View style={bm.legendItem}>
                                <View style={[bm.legendDot, { backgroundColor: colors.surface2, borderColor: colors.border }]} />
                                <Text style={bm.legendText}>Dolu</Text>
                            </View>
                        </View>
                        <View style={{ height: 80 }} />
                    </ScrollView>

                    {/* Seçilen slot — alt bar */}
                    {picked && (
                        <View style={bm.reserveBar}>
                            <View style={{ flex: 1 }}>
                                <Text style={bm.reserveBarTitle}>
                                    {picked.court.name} · {picked.slot.start}–{picked.slot.end}
                                </Text>
                                <Text style={bm.reserveBarSub}>
                                    {formatDateLabel(date)}{venue.pricePerSlot > 0 ? ` · ${venue.pricePerSlot}₺` : ''}
                                </Text>
                            </View>
                            <TouchableOpacity style={bm.reserveBtn} onPress={handleReserve} activeOpacity={0.8}>
                                <Text style={bm.reserveBtnText}>Rezerve Et →</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

// ─── Tesis Arama Kartı ────────────────────────────────────────────────────────
function VenueCard({ venue, onPress }) {
    return (
        <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.8}>
            <View style={s.cardHeader}>
                <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{venue.name}</Text>
                    <Text style={s.cardMeta}>
                        {venue.branch} · {venue.city}{venue.district ? ` / ${venue.district}` : ''}
                    </Text>
                </View>
                <Text style={s.arrow}>›</Text>
            </View>
            <View style={s.cardTags}>
                <View style={s.tag}><Text style={s.tagText}>🏟️ {venue.courts?.length || 0} kort</Text></View>
                <View style={s.tag}><Text style={s.tagText}>⏰ {venue.openTime}–{venue.closeTime}</Text></View>
                {venue.pricePerSlot > 0 && (
                    <View style={s.tag}><Text style={s.tagText}>💰 {venue.pricePerSlot}₺/slot</Text></View>
                )}
            </View>
            {venue.address ? <Text style={s.cardAddr}>📍 {venue.address}</Text> : null}
        </TouchableOpacity>
    );
}

// Expo/React Native sub anahtarlarını Türkçe'ye çevir
const BRANCH_MAP = {
    tennis:     'tenis',
    padel:      'padel',
    football:   'futbol',
    basketball: 'basketbol',
    volleyball: 'voleybol',
    handball:   'hentbol',
    baseball:   'beysbol',
    swimming:   'yüzme',
    badminton:  'badminton',
    tabletennis:'masa tenisi',
    golf:       'golf',
    cycling:    'bisiklet',
    running:    'koşu',
    fitness:    'fitness',
    yoga:       'yoga',
    boxing:     'boks',
    wrestling:  'güreş',
    judo:       'judo',
    karate:     'karate',
    taekwondo:  'tekvando',
    hockey:     'hokey',
    baseball2:  'beysbol',
};

// ─── Ana Ekran ────────────────────────────────────────────────────────────────
export default function VenueSearchScreen({ navigation, route }) {
    const rawBranch   = route?.params?.branch;
    const lockedBranch = rawBranch ? (BRANCH_MAP[rawBranch] || rawBranch) : null;

    const [city,     setCity]     = useState('');
    const [venueName, setVenueName] = useState('');
    const [venues,   setVenues]   = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [searched, setSearched] = useState(false);

    // Tesis sayfası modalı
    const [activeVenue, setActive] = useState(null);

    // Onay modalı (nested modal sorununu önlemek için ayrı tutuldu)
    const [pendingRes, setPendingRes] = useState(null); // { venue, court, slot, date }
    const [confirming, setConfirming] = useState(false);

    // Sayfa açılınca (branch parametresi varsa) otomatik ara
    useEffect(() => {
        if (lockedBranch) search(lockedBranch);
    }, [lockedBranch]);

    const search = useCallback(async (branchOverride) => {
        setLoading(true);
        setSearched(true);
        try {
            const params = {};
            if (city.trim())      params.city   = city.trim();
            const b = branchOverride || lockedBranch;
            if (b)                params.branch = b;
            if (venueName.trim()) params.name   = venueName.trim();
            const { data } = await api.get('/venues/search', { params });
            setVenues(data);
        } catch {
            setVenues([]);
        } finally { setLoading(false); }
    }, [city, venueName, lockedBranch]);

    // Slot seçildi → onay modalına geç, sheet kapanır
    const handlePickSlot = (court, slot, date) => {
        setActive(null); // sheet'i kapat
        setPendingRes({ venue: activeVenue, court, slot, date });
    };

    // Onay modalından iptal → sheet tekrar açılabilir
    const handleCancelConfirm = () => {
        const venue = pendingRes?.venue;
        setPendingRes(null);
        if (venue) setActive(venue); // sheet'i geri aç
    };

    const handleConfirm = async (paymentMethod) => {
        if (!pendingRes) return;
        setConfirming(true);
        try {
            const { venue, court, slot, date } = pendingRes;
            await api.post(`/venues/${venue.id}/courts/${court.id}/reserve`, {
                date,
                startTime: slot.start,
                endTime:   slot.end,
                paymentMethod,
            });
            setPendingRes(null);
            Alert.alert(
                '✅ Rezervasyon Yapıldı',
                `${formatDateLabel(date)} · ${slot.start}–${slot.end}\n${venue.name} — ${court.name}`,
                [
                    { text: 'Rezervasyonlarım', onPress: () => navigation.navigate('MyReservations') },
                    { text: 'Tamam' },
                ]
            );
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Rezervasyon yapılamadı');
        } finally { setConfirming(false); }
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>🏟️ Tesis Ara</Text>
            </View>

            {/* Bilgilendirme banner'ı */}
            <View style={s.infoBanner}>
                <Text style={s.infoBannerIcon}>🏅</Text>
                <Text style={s.infoBannerText}>
                    Burada yalnızca anlaşmalı (Pro/Premium) işletmelerin onaylı tesisleri listelenir. Seçtiğiniz slotu rezerve ettiğinizde o saat bloğu otomatik kapanır.
                </Text>
            </View>

            <View style={s.filters}>
                {lockedBranch && (
                    <View style={s.branchBadge}>
                        <Text style={s.branchBadgeIcon}>🏅</Text>
                        <Text style={s.branchBadgeText}>{lockedBranch.charAt(0).toUpperCase() + lockedBranch.slice(1)} tesisleri</Text>
                    </View>
                )}
                <TextInput
                    style={s.input}
                    placeholder="Şehir (ör. İstanbul)"
                    placeholderTextColor={colors.textMuted}
                    value={city}
                    onChangeText={setCity}
                    returnKeyType="search"
                    onSubmitEditing={() => search()}
                />
                <TextInput
                    style={s.input}
                    placeholder="Tesis / Kort Adı"
                    placeholderTextColor={colors.textMuted}
                    value={venueName}
                    onChangeText={setVenueName}
                    returnKeyType="search"
                    onSubmitEditing={() => search()}
                />
                <TouchableOpacity style={s.searchBtn} onPress={() => search()} disabled={loading} activeOpacity={0.8}>
                    {loading
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.searchBtnText}>Ara</Text>}
                </TouchableOpacity>
            </View>

            {searched && !loading && (
                <FlatList
                    data={venues}
                    keyExtractor={v => v.id}
                    contentContainerStyle={s.list}
                    ListEmptyComponent={
                        <View style={s.empty}>
                            <Text style={s.emptyIcon}>🔍</Text>
                            <Text style={s.emptyText}>Sonuç bulunamadı.</Text>
                        </View>
                    }
                    renderItem={({ item }) => (
                        <VenueCard venue={item} onPress={() => setActive(item)} />
                    )}
                />
            )}

            {!searched && !loading && (
                <View style={s.hint}>
                    <Text style={s.hintIcon}>🏓</Text>
                    <Text style={s.hintText}>
                        Şehir veya spor dalı yazarak tesis arayın ve online rezervasyon yapın.
                    </Text>
                </View>
            )}

            {/* Tesis sayfası (short liste yok, slot seçimi var) */}
            <VenueBookingSheet
                venue={activeVenue}
                visible={!!activeVenue}
                onClose={() => setActive(null)}
                onPickSlot={handlePickSlot}
            />

            {/* Onay modalı — ayrı (nested değil) */}
            <ConfirmModal
                visible={!!pendingRes}
                venue={pendingRes?.venue}
                court={pendingRes?.court}
                slot={pendingRes?.slot}
                date={pendingRes?.date}
                onConfirm={handleConfirm}
                onClose={handleCancelConfirm}
                confirming={confirming}
            />
        </View>
    );
}

// ─── Stiller ──────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
    root:   { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn:    { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText:{ color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title:  { color: '#fff', fontSize: 17, fontWeight: '900' },

    infoBanner:     { flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginHorizontal: 14, marginTop: 12, marginBottom: 4, backgroundColor: '#9333ea14', borderRadius: 12, padding: 12, borderWidth: 1, borderColor: '#9333ea30' },
    infoBannerIcon: { fontSize: 18, lineHeight: 22 },
    infoBannerText: { flex: 1, color: colors.textSecondary, fontSize: 12, lineHeight: 18 },

    filters:      { padding: 14, gap: 8 },
    branchBadge:  { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#9333ea22', borderRadius: 20, paddingVertical: 6, paddingHorizontal: 12, alignSelf: 'flex-start', borderWidth: 1, borderColor: '#9333ea50' },
    branchBadgeIcon: { fontSize: 14 },
    branchBadgeText: { color: '#c084fc', fontWeight: '700', fontSize: 13 },
    input:        { backgroundColor: colors.surface, borderRadius: 10, padding: 12, color: '#fff', fontSize: 14, borderWidth: 1, borderColor: colors.border },
    searchBtn:    { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    searchBtnText:{ color: '#fff', fontWeight: '900', fontSize: 15 },

    list:     { padding: 14, gap: 10 },
    card:     { backgroundColor: colors.surface, borderRadius: 14, padding: 14, borderWidth: 1, borderColor: colors.border },
    cardHeader:{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 },
    cardName: { color: '#fff', fontSize: 15, fontWeight: '900' },
    cardMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
    cardTags: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 4 },
    tag:      { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
    tagText:  { color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    cardAddr: { color: colors.textMuted, fontSize: 12, marginTop: 4 },
    arrow:    { color: colors.textMuted, fontSize: 22, fontWeight: '300' },

    empty:    { alignItems: 'center', paddingTop: 60 },
    emptyIcon:{ fontSize: 40, marginBottom: 10 },
    emptyText:{ color: colors.textMuted, fontSize: 14 },

    hint:    { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 40 },
    hintIcon:{ fontSize: 48, marginBottom: 14 },
    hintText:{ color: colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: 'center' },
});

const bm = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    sheet:   { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: Platform.OS === 'ios' ? 34 : 12 },
    handle:  { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 12 },

    header:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
    venueName:   { color: '#fff', fontSize: 18, fontWeight: '900' },
    venueMeta:   { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    closeBtn:    { paddingHorizontal: 4, paddingVertical: 2 },
    closeBtnText:{ color: colors.textMuted, fontSize: 20 },

    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
    tag:    { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
    tagText:{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    priceTag:    { backgroundColor: colors.purple + '18', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: colors.purple + '50' },
    priceTagText:{ color: colors.purple, fontSize: 11, fontWeight: '700' },

    dateList:         { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
    dateBtn:          { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    dateBtnActive:    { backgroundColor: colors.purple, borderColor: colors.purple },
    dateBtnText:      { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
    dateBtnTextActive:{ color: '#fff' },

    scroll: { paddingHorizontal: 14, paddingTop: 6 },

    courtSection: { marginBottom: 18 },
    courtHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    courtName:    { color: '#fff', fontSize: 14, fontWeight: '900' },
    courtFree:    { color: colors.purple, fontSize: 12, fontWeight: '700' },
    errorText:    { color: colors.red, fontSize: 12, marginVertical: 6 },
    noSlotText:   { color: colors.textMuted, fontSize: 12, marginVertical: 6 },

    slotGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    slotBtn:       { width: '30%', backgroundColor: colors.bg, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 4, alignItems: 'center', borderWidth: 1.5, borderColor: colors.purple + '70' },
    slotBtnTaken:  { backgroundColor: colors.surface2, borderColor: colors.border, opacity: 0.45 },
    slotBtnPicked: { backgroundColor: colors.purple, borderColor: colors.purple },
    slotTime:      { color: colors.purple, fontSize: 14, fontWeight: '900' },
    slotEnd:       { color: colors.purple + '99', fontSize: 10, marginTop: 1 },
    slotTimeTaken: { color: colors.textMuted },
    slotTimePicked:{ color: '#fff' },

    legend:     { flexDirection: 'row', gap: 16, marginTop: 10 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot:  { width: 12, height: 12, borderRadius: 6, borderWidth: 1.5 },
    legendText: { color: colors.textMuted, fontSize: 11 },

    reserveBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 16, paddingVertical: 12, gap: 10, position: 'absolute', bottom: 0, left: 0, right: 0, borderBottomLeftRadius: 0, borderBottomRightRadius: 0 },
    reserveBarTitle: { color: '#fff', fontSize: 13, fontWeight: '900' },
    reserveBarSub:   { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    reserveBtn:      { backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
    reserveBtnText:  { color: '#fff', fontWeight: '900', fontSize: 13 },
});

const cm = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center', padding: 20 },
    box:     { backgroundColor: colors.surface, borderRadius: 18, padding: 18, width: '100%' },
    title:   { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 14 },

    infoCard: { backgroundColor: colors.surface2, borderRadius: 12, marginBottom: 14, overflow: 'hidden' },
    infoRow:  { flexDirection: 'row', justifyContent: 'space-between', padding: 11, borderBottomWidth: 1, borderColor: colors.border },
    infoLabel:{ color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    infoValue:{ color: '#fff', fontSize: 13, fontWeight: '700' },

    payLabel:      { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 8 },
    payOpt:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface2, borderRadius: 10, padding: 13, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    payOptActive:  { borderColor: colors.purple, backgroundColor: colors.purple + '18' },
    payOptDisabled:{ opacity: 0.5 },
    payOptText:    { color: '#fff', fontSize: 13, fontWeight: '700' },
    check:         { color: colors.purple, fontSize: 18, fontWeight: '900' },
    soonBadge:     { backgroundColor: colors.bg, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 2 },
    soonText:      { color: colors.textMuted, fontSize: 10, fontWeight: '700' },

    btnRow:        { flexDirection: 'row', gap: 10, marginTop: 4 },
    cancelBtn:     { flex: 1, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    cancelBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 13 },
    confirmBtn:    { flex: 2, backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    confirmBtnText:{ color: '#fff', fontWeight: '900', fontSize: 13 },
});
