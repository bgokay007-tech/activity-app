import { useState, useCallback, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Modal, Linking,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import { computeVarDurationPrice } from '../../utils/priceProration';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function pad(n) { return String(n).padStart(2, '0'); }

function getDateStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateLabel(dateStr, locale = 'tr-TR') {
    const [y, m, day] = dateStr.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    return d.toLocaleDateString(locale, { weekday: 'short', day: 'numeric', month: 'short' });
}

const DATE_OPTIONS = Array.from({ length: 14 }, (_, i) => getDateStr(i));
const SLOT_LABEL_KEY = { FULL_HOUR: 'vsSlotFull', HALF_HOUR: 'vsSlotHalf', NINETY_MIN: 'vsSlot90', VAR_DURATION: 'vsSlotFlex', FLEXIBLE: 'vsSlotFlex' };
const SLOT_SHORT_KEY = { FULL_HOUR: 'vsSlotFullShort', HALF_HOUR: 'vsSlotHalf', NINETY_MIN: 'vsSlot90Short', VAR_DURATION: 'vsSlotFlexShort', FLEXIBLE: 'vsSlotFlexShort' };
const VALID_ST   = ['FULL_HOUR', 'HALF_HOUR', 'NINETY_MIN', 'VAR_DURATION', 'FLEXIBLE'];
function venueSlotChip(venue, t) {
    const courts = venue.courts || [];
    const base = venue.slotType === 'VAR_DURATION' ? 'FULL_HOUR' : (venue.slotType || 'FULL_HOUR');
    if (courts.length === 0) return t[SLOT_LABEL_KEY[venue.slotType]] || venue.slotType;
    const perCourt = courts.map(c => ({
        name: c.name,
        type: (VALID_ST.includes(c.slotType) ? c.slotType : null) || base,
    }));
    const unique = [...new Set(perCourt.map(c => c.type))];
    if (unique.length === 1) return t[SLOT_LABEL_KEY[unique[0]]] || unique[0];
    return perCourt.map(c => `${c.name}:${t[SLOT_SHORT_KEY[c.type]] || c.type}`).join(' · ');
}

// Gece yarısını geçen çalışma saatleri arka arkaya iki pencere olarak saklanabiliyor
// (ör. 17:00–24:00 + 00:00–01:00) — gösterimde bunlar tek bir aralığa birleştirilir (17:00–01:00).
function mergeAdjacentWindows(windows) {
    const merged = [];
    for (const w of windows) {
        const last = merged[merged.length - 1];
        if (last && (last.to === w.from || (last.to === '24:00' && w.from === '00:00'))) {
            last.to = w.to;
        } else {
            merged.push({ ...w });
        }
    }
    return merged;
}

function getVenueHoursLabel(venue, dateStr, t) {
    const os = venue.openSlots;
    if (os && !Array.isArray(os) && typeof os === 'object') {
        const dow = new Date(dateStr + 'T12:00:00').getDay();
        const key = String(dow === 0 ? 7 : dow);
        let entry;
        if (os[key] !== undefined) entry = os[key];
        else if (os['0'] !== undefined) entry = os['0'];
        if (entry !== undefined) {
            if (Array.isArray(entry) && entry.length === 0) return t.vsClosed;
            if (Array.isArray(entry) && entry.length > 0) return mergeAdjacentWindows(entry).map(w => `${w.from}–${w.to}`).join(' / ');
        }
    }
    return `${venue.openTime || '08:00'}–${venue.closeTime || '22:00'}`;
}

// ─── Sepet Modalı (en üst seviyede, nested modal sorunu yok) ─────────────────
// Sepet mantığı: kullanıcı farklı tesis/kort/tarih/saatlerden istediği kadar
// slot ekleyip hepsini tek seferde (aynı ödeme yöntemiyle) rezerve edebilir.
function CartModal({ visible, cart, onRemove, onCheckout, onClose, checkingOut }) {
    const t = useT();
    const [payment, setPayment] = useState('CASH');
    const priceOf = (item) => item.slot?.priceByMethod?.[payment] ?? item.slot?.price ?? item.venue?.pricePerSlot ?? 0;
    const total = cart.reduce((sum, i) => sum + priceOf(i), 0);
    const cartAccepts = (method) => cart.length > 0 && cart.every(i => Array.isArray(i.venue?.acceptedPayments) && i.venue.acceptedPayments.includes(method));
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={cm.overlay}>
                <View style={[cm.box, { maxHeight: '85%' }]}>
                    <Text style={cm.title}>🛒 {t.vsCartTitle} {cart.length > 0 ? `(${cart.length})` : ''}</Text>
                    <ScrollView style={{ maxHeight: 260, marginBottom: cart.length ? 10 : 0 }} showsVerticalScrollIndicator={false}>
                        {cart.length === 0 ? (
                            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 3 }}>
                                {t.vsCartEmpty}
                            </Text>
                        ) : cart.map(item => (
                            <View key={item.key} style={cm.cartRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={cm.cartRowTitle} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{item.venue.name} — {item.court.name}</Text>
                                    <Text style={cm.cartRowSub}>{formatDateLabel(item.date, t.dateLocale)} · {item.slot.start}–{item.slot.end}</Text>
                                </View>
                                <Text style={cm.cartRowPrice}>{priceOf(item) > 0 ? `${priceOf(item)}₺` : t.vsFree}</Text>
                                <TouchableOpacity onPress={() => onRemove(item.key)} style={cm.cartRemoveBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Text style={cm.cartRemoveText}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                    {cart.length > 0 && (
                        <>
                            <View style={cm.cartTotalRow}>
                                <Text style={cm.cartTotalLabel}>{t.vsCartTotal}</Text>
                                <Text style={cm.cartTotalValue}>{total > 0 ? `${total}₺` : t.vsFree}</Text>
                            </View>
                            <Text style={cm.payLabel}>{t.vsPaymentMethod}</Text>
                            <TouchableOpacity
                                style={[cm.payOpt, payment === 'CASH' && cm.payOptActive]}
                                onPress={() => setPayment('CASH')}
                                activeOpacity={0.8}
                            >
                                <Text style={cm.payOptText}>{t.vsPayCash}</Text>
                                {payment === 'CASH' && <Text style={cm.check}>✓</Text>}
                            </TouchableOpacity>
                            {cartAccepts('EFT') && (
                                <TouchableOpacity
                                    style={[cm.payOpt, payment === 'EFT' && cm.payOptActive]}
                                    onPress={() => setPayment('EFT')}
                                    activeOpacity={0.8}
                                >
                                    <Text style={cm.payOptText}>{t.vsPayEft}</Text>
                                    {payment === 'EFT' && <Text style={cm.check}>✓</Text>}
                                </TouchableOpacity>
                            )}
                            {cartAccepts('CREDIT_CARD') && (
                                <TouchableOpacity
                                    style={[cm.payOpt, payment === 'CREDIT_CARD' && cm.payOptActive]}
                                    onPress={() => setPayment('CREDIT_CARD')}
                                    activeOpacity={0.8}
                                >
                                    <Text style={cm.payOptText}>{t.vsPayCreditCard}</Text>
                                    {payment === 'CREDIT_CARD' && <Text style={cm.check}>✓</Text>}
                                </TouchableOpacity>
                            )}
                            <View style={[cm.payOpt, cm.payOptDisabled]}>
                                <Text style={[cm.payOptText, { color: colors.textMuted }]}>{t.vsPayOnline}</Text>
                                <View style={cm.soonBadge}><Text style={cm.soonText}>{t.vsComingSoon}</Text></View>
                            </View>
                        </>
                    )}
                    <View style={cm.btnRow}>
                        <TouchableOpacity style={cm.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                            <Text style={cm.cancelBtnText}>{t.vsCartClose}</Text>
                        </TouchableOpacity>
                        {cart.length > 0 && (
                            <TouchableOpacity
                                style={[cm.confirmBtn, checkingOut && { opacity: 0.6 }]}
                                onPress={() => onCheckout(payment)}
                                disabled={checkingOut}
                                activeOpacity={0.8}
                            >
                                {checkingOut
                                    ? <ActivityIndicator size="small" color="#fff" />
                                    : <Text style={cm.confirmBtnText}>{t.vsCartCheckout}</Text>}
                            </TouchableOpacity>
                        )}
                    </View>
                </View>
            </View>
        </Modal>
    );
}

// ─── Tesis Rezervasyon Sayfası (Bottom Sheet) ─────────────────────────────────
const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toT = m => `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;


function VenueBookingSheet({ venue, visible, onClose, onAddToCart, cartKeys, onOpenCart, cartCount, cartTotal }) {
    const t = useT();
    const insets = useSafeAreaInsets();
    const [date,        setDate]        = useState(DATE_OPTIONS[0]);
    const [slotsMap,    setSlotsMap]    = useState({});
    const [picked,      setPicked]      = useState(null);
    const [varStartMap, setVarStartMap] = useState({}); // { [courtId]: { win, customStart } }
    const [varDurMap,   setVarDurMap]   = useState({}); // { [courtId]: durationMins }

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
                setSlotsMap(prev => ({ ...prev, [court.id]: { slots: [], loading: false, error: t.vsLoadFailed, type: null, windows: [] } }));
            }
        }));
    }, [venue, t]);

    useEffect(() => {
        if (visible && venue) {
            const today = DATE_OPTIONS[0];
            setDate(today);
            setPicked(null);
            setVarStartMap({});
            setVarDurMap({});
            fetchAllSlots(today);
        }
    }, [visible, venue]);

    const handleDateChange = (d) => {
        setDate(d);
        setPicked(null);
        setVarStartMap({});
        setVarDurMap({});
        fetchAllSlots(d);
    };

    const handleAddToCart = () => {
        if (!picked) return;
        onAddToCart(picked.court, picked.slot, date);
        setPicked(null); // seçim temizlenir, sheet açık kalır — başka gün/saat eklemeye devam edilebilir
    };

    if (!venue) return null;

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={bm.overlay}>
                <View style={[bm.sheet, { paddingBottom: (Platform.OS === 'ios' ? 24 : 12) + insets.bottom }]}>
                    {/* Header */}
                    <View style={bm.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={bm.venueName}>{venue.name}</Text>
                            <TouchableOpacity
                                disabled={!venue.lat && !venue.address}
                                onPress={() => {
                                    const url = venue.lat && venue.lng
                                        ? `https://maps.google.com/?q=${venue.lat},${venue.lng}`
                                        : `https://maps.google.com/?q=${encodeURIComponent(`${venue.name}, ${venue.address || venue.city}`)}`;
                                    Linking.openURL(url);
                                }}
                                activeOpacity={0.7}
                            >
                                <Text style={[bm.venueMeta, (venue.lat || venue.address) && { color: colors.purple }]}>
                                    📍 {venue.branch} · {venue.city}{venue.district ? ` / ${venue.district}` : ''}
                                    {venue.address ? `\n${venue.address}` : ''}
                                </Text>
                            </TouchableOpacity>
                        </View>
                        {cartCount > 0 && (
                            <TouchableOpacity onPress={onOpenCart} style={bm.cartBadge} activeOpacity={0.8}>
                                <Text style={bm.cartBadgeText}>🛒 {cartCount}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={onClose} style={bm.closeBtn}>
                            <Text style={bm.closeBtnText}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {/* Rozetler */}
                    {(() => {
                        const lightsFrom = (venue.courts || []).find(c => c.lightsFrom)?.lightsFrom;
                        const cl = (venue.contactLinks && typeof venue.contactLinks === 'object') ? venue.contactLinks : {};
                        const whatsappV = cl.whatsapp || venue.phone || null;
                        const callV     = cl.phone    || venue.phone || null;
                        return (
                            <View style={bm.tagRow}>
                                <View style={bm.tag}><Text style={bm.tagText}>⏰ {getVenueHoursLabel(venue, date, t)}</Text></View>
                                {lightsFrom ? <View style={[bm.tag, { borderColor: '#fbbf2460', backgroundColor: '#fbbf2410' }]}><Text style={[bm.tagText, { color: '#fbbf24' }]}>💡 {t.vsLightsFrom(lightsFrom)}</Text></View> : null}
                                <View style={bm.tag}><Text style={bm.tagText}>📅 {venueSlotChip(venue, t)}</Text></View>
                                {venue.phone ? <View style={bm.tag}><Text style={bm.tagText}>📞 {venue.phone}</Text></View> : null}
                                {whatsappV ? (
                                    <TouchableOpacity style={bm.tag}
                                        onPress={() => { const d = whatsappV.replace(/\D/g,''); Linking.openURL(`https://wa.me/${d.startsWith('0') ? '90'+d.slice(1) : d}`); }}>
                                        <Text style={bm.tagText}>💬</Text>
                                    </TouchableOpacity>
                                ) : null}
                                {callV ? (
                                    <TouchableOpacity style={bm.tag} onPress={() => Linking.openURL(`tel:${callV}`)}>
                                        <Text style={bm.tagText}>📲</Text>
                                    </TouchableOpacity>
                                ) : null}
                            </View>
                        );
                    })()}

                    {/* İletişim butonları (telegram / instagram / email) */}
                    {(() => {
                        const cl = (venue.contactLinks && typeof venue.contactLinks === 'object') ? venue.contactLinks : {};
                        const links = [
                            { key: 'telegram',  icon: '✈️', label: t.vsTelegram,  url: v => `https://t.me/${v.replace('@','')}` },
                            { key: 'instagram', icon: '📸', label: t.vsInstagram, url: v => `https://instagram.com/${v.replace('@','')}` },
                            { key: 'email',     icon: '📧', label: t.vsEmail,     url: v => `mailto:${v}` },
                        ].filter(l => cl[l.key]);
                        if (links.length === 0) return null;
                        return (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, paddingHorizontal: 3, paddingBottom: 3 }}>
                                {links.map(l => (
                                    <TouchableOpacity key={l.key}
                                        onPress={() => Linking.openURL(l.url(cl[l.key]))}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 3,
                                            backgroundColor: colors.surface2, borderRadius: 8,
                                            paddingHorizontal: 3, paddingVertical: 3,
                                            borderWidth: 1, borderColor: colors.border }}>
                                        <Text style={{ fontSize: 12 }}>{l.icon}</Text>
                                        <Text style={{ color: '#e5e7eb', fontSize: 10, fontWeight: '700' }}>{l.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        );
                    })()}

                    {/* Fiyat politikası özeti */}
                    {(() => {
                        const pw = Array.isArray(venue.pricingWindows) ? venue.pricingWindows : [];
                        if (pw.length === 0) return null;
                        return (
                            <View style={{ paddingHorizontal: 3, paddingBottom: 3, flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                                {pw.map((rule, i) => {
                                    const courtName = rule.courtId
                                        ? (venue.courts || []).find(c => c.id === rule.courtId)?.name
                                        : null;
                                    return (
                                        <View key={i} style={bm.priceTag}>
                                            <Text style={bm.priceTagText}>
                                                💰 {rule.from}–{rule.to}: {rule.price > 0 ? `${rule.price}₺` : t.vsFree}{courtName ? ` · ${courtName}` : ''}
                                            </Text>
                                        </View>
                                    );
                                })}
                            </View>
                        );
                    })()}

                    {/* Tarih Seçici — sabit yükseklikli sarmalayıcı + overflow:hidden ile
                        gerçek yükseklik zorlanıyor (bazı cihazlarda ScrollView'a doğrudan
                        verilen height, ScrollView'ın kendi ölçümüyle çakışıp fazladan boşluk
                        bırakabiliyor). */}
                    <View style={{ height:30, overflow:'hidden' }}>
                        <ScrollView horizontal showsHorizontalScrollIndicator={false}
                            contentContainerStyle={{ paddingHorizontal:3, height:30, alignItems:'center' }}>
                            {DATE_OPTIONS.map(item => {
                                const active = item === date;
                                const d = new Date(item + 'T12:00:00');
                                const label = d.toLocaleDateString(t.dateLocale, { day: 'numeric', month: 'short', weekday: 'short' });
                                return (
                                    <TouchableOpacity key={item}
                                        onPress={() => handleDateChange(item)}
                                        activeOpacity={0.75}
                                        style={{ marginRight:3, paddingVertical:3, paddingHorizontal:3, borderRadius:20,
                                            backgroundColor: active ? colors.purple : colors.surface2,
                                            borderWidth:1, borderColor: active ? colors.purple : colors.border }}>
                                        <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }}>{label}</Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>

                    {/* Kortlar + Slotlar — yatay kaydır, her kort 170px sütun */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        style={{ height: 300 }}
                        contentContainerStyle={{ flexDirection:'row', alignItems:'stretch', paddingHorizontal:3, paddingVertical:3, gap:3 }}>
                        {venue.courts.map(court => {
                            const entry = slotsMap[court.id] || { slots: [], loading: true, type: null, windows: [] };
                            const isVar   = entry.type === 'VAR_DURATION';
                            const isMaint = entry.type === 'MAINTENANCE';
                            const varStart = varStartMap[court.id] || null;
                            const displaySlots = isVar ? [] : entry.slots;
                            const freeCount = isVar ? entry.windows.length : displaySlots.filter(sl => sl.free !== false).length;
                            return (
                                <View key={court.id} style={bm.courtSection}>
                                    <View style={bm.courtHeader}>
                                        <Text style={bm.courtName}>🎾 {court.name}</Text>
                                        {!entry.loading && !isMaint && (
                                            <Text style={[bm.courtFree, freeCount === 0 && { color: colors.textMuted }]}>
                                                {freeCount > 0 ? t.vsAvailable(freeCount) : t.vsFull}
                                            </Text>
                                        )}
                                        {isMaint && (
                                            <Text style={{ color: '#fca5a5', fontSize: 12, fontWeight: '700' }}>{t.vsUnderMaintenance}</Text>
                                        )}
                                    </View>
                                    {(() => {
                                        const effIndoor = court.indoor ?? venue?.courtIndoorDefault ?? false;
                                        return (
                                            <Text style={{ color: colors.textMuted, fontSize: 10, textAlign: 'center', marginBottom: 4 }} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>
                                                {court.surface ? `⬜ ${t['surface' + court.surface] || court.surface}  ·  ` : ''}{effIndoor ? t.indoor : t.outdoor}
                                            </Text>
                                        );
                                    })()}

                                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ flex:1 }}>
                                    {entry.loading ? (
                                        <ActivityIndicator size="small" color={colors.purple} style={{ marginVertical: 12 }} />
                                    ) : entry.error ? (
                                        <Text style={bm.errorText}>{entry.error}</Text>
                                    ) : isMaint ? (
                                        <Text style={{ color: '#f87171', fontSize: 12, marginVertical: 8, lineHeight: 18 }}>
                                            {t.vsMaintenanceNote}
                                        </Text>
                                    ) : isVar ? (
                                        <>
                                            {entry.windows.length === 0 ? (
                                                <Text style={bm.noSlotText}>{t.vsNoWindows}</Text>
                                            ) : entry.windows.map((w, wi) => {
                                                const sel = varStartMap[court.id];
                                                const isWinSel = sel?.winStart === w.start;
                                                const customStart = isWinSel ? (sel?.customStart ?? w.start) : w.start;
                                                const dur = isWinSel ? (varDurMap[court.id] ?? 60) : 60;
                                                const customStartM = toM(customStart);
                                                const winEndM = toM(w.end);
                                                const endT = toT(customStartM + dur);
                                                const validStart = /^\d{2}:\d{2}$/.test(customStart) && customStartM >= toM(w.start) && customStartM < winEndM;
                                                const validEnd = validStart && (customStartM + dur) <= winEndM;
                                                const price = computeVarDurationPrice(w, customStart, dur).price ?? venue?.pricePerSlot ?? null;
                                                const isPicked = picked?.court.id === court.id && picked?.slot.start === customStart && isWinSel;
                                                return (
                                                    <View key={wi} style={{ backgroundColor: colors.surface2, borderRadius: 10, padding: 3, marginBottom: 3, borderWidth: 1, borderColor: isWinSel ? colors.purple : colors.border }}>
                                                        {/* Pencere başlığı */}
                                                        <TouchableOpacity onPress={() => { setVarStartMap(p => ({ ...p, [court.id]: { winStart: w.start, winEnd: w.end, customStart: w.start } })); setVarDurMap(p => ({ ...p, [court.id]: 60 })); setPicked(null); }}
                                                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isWinSel ? 3 : 0 }}>
                                                            <Text style={{ color: '#fff', fontSize: 12, fontWeight: '800' }}>🕐 {w.start} – {w.end}</Text>
                                                            <Text style={{ color: isWinSel ? colors.purple : colors.textMuted, fontSize: 10, fontWeight: '700' }}>{isWinSel ? t.vsSelectedArrow : t.vsSelectArrow}</Text>
                                                        </TouchableOpacity>

                                                        {isWinSel && (<>
                                                            {/* Başlangıç saati girişi */}
                                                            <Text style={bv.stepLabel}>{t.vsStartTimeLabel}</Text>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 3 }}>
                                                                <TextInput
                                                                    value={sel?.customStart ?? w.start}
                                                                    onChangeText={v => { setVarStartMap(p => ({ ...p, [court.id]: { ...p[court.id], customStart: v } })); setPicked(null); }}
                                                                    placeholder={w.start}
                                                                    placeholderTextColor={colors.textMuted}
                                                                    keyboardType="numbers-and-punctuation"
                                                                    maxLength={5}
                                                                    style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 3, paddingVertical: 3, color: '#fff', fontSize: 15, fontWeight: '800', borderWidth: 1, borderColor: validStart ? colors.purple : colors.border, textAlign: 'center' }}
                                                                />
                                                                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{t.vsBetween(w.start, w.end)}</Text>
                                                            </View>

                                                            {/* Süre seçimi */}
                                                            {validStart && (<>
                                                                <Text style={bv.stepLabel}>{t.vsDurationLabel}</Text>
                                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3, marginBottom: 3 }}>
                                                                    {[60, 90, 120, 150, 180].filter(d => customStartM + d <= winEndM).map(d => {
                                                                        const et = toT(customStartM + d);
                                                                        const durQuote = computeVarDurationPrice(w, customStart, d);
                                                                        const pr = durQuote.priceByMethod?.CASH ?? durQuote.price;
                                                                        const isSel = varDurMap[court.id] === d;
                                                                        return (
                                                                            <TouchableOpacity key={d}
                                                                                onPress={() => { setVarDurMap(p => ({ ...p, [court.id]: d })); setPicked(null); }}
                                                                                style={[bv.durBtn, isSel && bv.durBtnPicked]}>
                                                                                <Text style={[bv.durBtnDur, isSel && bv.durBtnTextPicked]}>{d < 60 ? `${d}dk` : `${d/60}sa`}</Text>
                                                                                <Text style={[bv.durBtnTime, isSel && bv.durBtnTextPicked]}>{customStart}–{et}</Text>
                                                                                {pr != null && <Text style={[bv.durBtnPrice, isSel && bv.durBtnTextPicked]}>{pr > 0 ? `${pr}₺` : t.vsFree}</Text>}
                                                                            </TouchableOpacity>
                                                                        );
                                                                    })}
                                                                </View>
                                                                {/* Rezerve Et butonu */}
                                                                {validEnd && (
                                                                    <TouchableOpacity
                                                                        onPress={() => { const q = computeVarDurationPrice(w, customStart, dur); const bph = q.priceByMethod?.CASH ?? q.price; setPicked({ court, slot: { start: customStart, end: toT(customStartM + dur), free: true, price: bph, priceByMethod: q.priceByMethod, durationMins: dur } }); }}
                                                                        style={{ backgroundColor: isPicked ? colors.purple : colors.purple+'30', borderRadius: 8, paddingVertical: 3, alignItems: 'center', borderWidth: 1, borderColor: colors.purple }}>
                                                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                                                                            {isPicked ? t.vsSelected : t.vsSelectRange(customStart, toT(customStartM + dur))}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                )}
                                                            </>)}
                                                        </>)}
                                                    </View>
                                                );
                                            })}
                                        </>
                                    ) : displaySlots.length === 0 ? (
                                        <Text style={bm.noSlotText}>{t.vsNoSlots}</Text>
                                    ) : (
                                        <View style={bm.slotGrid}>
                                            {displaySlots.map((slot, i) => {
                                                const isPicked =
                                                    picked?.court.id === court.id &&
                                                    picked?.slot.start === slot.start &&
                                                    picked?.slot.end === slot.end;
                                                const isMaintSlot = slot.maintenance && !slot.free;
                                                const isInCart = cartKeys?.has(`${venue.id}_${court.id}_${date}_${slot.start}`);
                                                return (
                                                    <TouchableOpacity
                                                        key={i}
                                                        style={[
                                                            bm.slotBtn,
                                                            !slot.free && (isMaintSlot ? bm.slotBtnMaint : bm.slotBtnTaken),
                                                            isInCart && bm.slotBtnInCart,
                                                            isPicked && bm.slotBtnPicked,
                                                        ]}
                                                        onPress={() => slot.free && setPicked({ court, slot })}
                                                        disabled={!slot.free}
                                                        activeOpacity={0.7}
                                                    >
                                                        <Text style={[bm.slotTime, !slot.free && bm.slotTimeTaken, isPicked && bm.slotTimePicked]}>
                                                            {isMaintSlot ? '🔧' : isInCart ? '🛒' : slot.start}
                                                        </Text>
                                                        <Text style={[bm.slotEnd, !slot.free && bm.slotTimeTaken, isPicked && bm.slotTimePicked]}>
                                                            {isMaintSlot ? '' : isInCart ? slot.start : `–${slot.end}`}
                                                        </Text>
                                                        {slot.price != null && slot.free !== false && (
                                                            <Text style={{ color: isPicked ? '#ffffffcc' : colors.purple, fontSize: 10, fontWeight: '800', marginTop: 2 }}>
                                                                {(() => { const p = slot.priceByMethod?.CASH ?? slot.price; return p > 0 ? `${p}₺` : t.vsFree; })()}
                                                            </Text>
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    )}
                                    <View style={{ height:8 }} />
                                    </ScrollView>
                                </View>
                            );
                        })}
                    </ScrollView>

                    {/* Lejant */}
                    <View style={[bm.legend, { paddingHorizontal:3, paddingTop:3 }]}>
                        <View style={bm.legendItem}>
                            <View style={[bm.legendDot, { borderColor: colors.purple }]} />
                            <Text style={bm.legendText}>{t.vsLegendAvailable}</Text>
                        </View>
                        <View style={bm.legendItem}>
                            <View style={[bm.legendDot, { backgroundColor: colors.surface2, borderColor: colors.border }]} />
                            <Text style={bm.legendText}>{t.vsFull}</Text>
                        </View>
                        <View style={bm.legendItem}>
                            <View style={[bm.legendDot, { backgroundColor: '#ef444418', borderColor: '#ef444440' }]} />
                            <Text style={bm.legendText}>{t.vsLegendMaintenance}</Text>
                        </View>
                    </View>

                    {/* Seçilen slot — alt bar */}
                    {picked && (
                        <View style={bm.reserveBar}>
                            <View style={{ flex: 1 }}>
                                <Text style={bm.reserveBarTitle}>
                                    {picked.court.name} · {picked.slot.start}–{picked.slot.end}
                                </Text>
                                <Text style={bm.reserveBarSub}>
                                    {formatDateLabel(date, t.dateLocale)}{venue.pricePerSlot > 0 ? ` · ${venue.pricePerSlot}₺` : ''}
                                </Text>
                            </View>
                            <TouchableOpacity style={bm.reserveBtn} onPress={handleAddToCart} activeOpacity={0.8}>
                                <Text style={bm.reserveBtnText}>{t.vsAddToCart}</Text>
                            </TouchableOpacity>
                        </View>
                    )}

                    {/* Sepet toplamı — sepette ürün varken her zaman altta görünür */}
                    {cartCount > 0 && (
                        <TouchableOpacity style={bm.cartTotalBar} onPress={onOpenCart} activeOpacity={0.85}>
                            <Text style={bm.cartTotalBarText}>{t.vsCartBarLabel(cartCount)}</Text>
                            <Text style={bm.cartTotalBarPrice}>{cartTotal > 0 ? `${cartTotal}₺` : t.vsFree}</Text>
                            <Text style={bm.cartTotalBarArrow}>{t.vsCartBarContinue}</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>
        </Modal>
    );
}

// ─── Tesis Arama Kartı ────────────────────────────────────────────────────────
function VenueCard({ venue, onPress }) {
    const t = useT();
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
                <View style={s.tag}><Text style={s.tagText}>🏟️ {venue.courts?.length || 0} {t.vsCourtSuffix}</Text></View>
                <View style={s.tag}><Text style={s.tagText}>⏰ {getVenueHoursLabel(venue, getDateStr(0), t)}</Text></View>
                {venue.pricePerSlot > 0 && (
                    <View style={s.tag}><Text style={s.tagText}>💰 {venue.pricePerSlot}₺/slot</Text></View>
                )}
            </View>
            {venue.address ? <Text style={s.cardAddr}>📍 {venue.address}</Text> : null}
        </TouchableOpacity>
    );
}

// Expo/React Native sub anahtarlarını Türkçe'ye çevir (yalnızca TR modunda kullanılır)
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
    const t = useT();
    const insets = useSafeAreaInsets();
    const lang = useSelector(s => s.lang?.lang || 'en');
    const rawBranch   = route?.params?.branch;
    const lockedBranch = rawBranch
        ? (lang === 'tr' ? (BRANCH_MAP[rawBranch] || rawBranch) : rawBranch.replace(/_/g, ' '))
        : null;

    const [city,     setCity]     = useState('');
    const [venueName, setVenueName] = useState('');
    const [venues,   setVenues]   = useState([]);
    const [loading,  setLoading]  = useState(false);
    const [searched, setSearched] = useState(false);

    // Tesis sayfası modalı
    const [activeVenue, setActive] = useState(null);

    // Sepet — farklı tesis/kort/tarih/saatlerden eklenen slotlar (nested modal
    // sorununu önlemek için CartModal ayrı/en üst seviyede tutulur)
    const [cart, setCart] = useState([]); // [{ key, venue, court, slot, date }]
    const [cartOpen, setCartOpen] = useState(false);
    const [checkingOut, setCheckingOut] = useState(false);
    const cartTotal = cart.reduce((sum, i) => sum + (i.slot.priceByMethod?.CASH ?? i.slot.price ?? i.venue.pricePerSlot ?? 0), 0);

    // Sayfa açılınca (branch parametresi varsa) otomatik ara
    // NOT: backend BusinessVenue.branch alanı İngilizce anahtarla saklanır (ör. "tennis"),
    // bu yüzden API'ye lockedBranch (görünen etiket) değil rawBranch gönderilmeli —
    // aksi halde "tennis" hiçbir zaman "tenis" alt dizesini içermediği için hiçbir
    // onaylı tesis eşleşmez (lockedBranch sadece ekrandaki rozet metni içindir).
    useEffect(() => {
        if (rawBranch) search(rawBranch);
    }, [rawBranch]);

    const search = useCallback(async (branchOverride) => {
        setLoading(true);
        setSearched(true);
        try {
            const params = {};
            if (city.trim())      params.city   = city.trim();
            const b = branchOverride || rawBranch;
            if (b)                params.branch = b;
            if (venueName.trim()) params.name   = venueName.trim();
            const { data } = await api.get('/venues/search', { params });
            setVenues(Array.isArray(data) ? data : (data?.items || []));
        } catch {
            setVenues([]);
        } finally { setLoading(false); }
    }, [city, venueName, rawBranch]);

    // Slot "Sepete Ekle"ye basıldığında eklenir — sheet açık kalır, kullanıcı
    // başka bir tarih/saat/kort seçmeye devam edebilir (aynı tesis içinde).
    const handleAddToCart = (court, slot, date) => {
        const venue = activeVenue;
        if (!venue) return;
        const key = `${venue.id}_${court.id}_${date}_${slot.start}`;
        setCart(prev => prev.some(i => i.key === key) ? prev : [...prev, { key, venue, court, slot, date }]);
    };

    const handleRemoveFromCart = (key) => setCart(prev => prev.filter(i => i.key !== key));

    // Sepetteki tüm slotlar için sırayla rezervasyon oluşturur. Biri başarısız
    // olursa (ör. o saat başkasınca alınmışsa) diğerleri denenmeye devam eder;
    // başarısız olanlar sepette kalır ki kullanıcı tekrar deneyebilsin.
    const handleCheckout = async (paymentMethod) => {
        if (cart.length === 0) return;
        setCheckingOut(true);
        const failed = [];
        let successCount = 0;
        for (const item of cart) {
            try {
                await api.post(`/venues/${item.venue.id}/courts/${item.court.id}/reserve`, {
                    date: item.date,
                    startTime: item.slot.start,
                    endTime:   item.slot.end,
                    paymentMethod,
                });
                successCount++;
            } catch (e) {
                const message = e?.response?.data?.message || e?.message || t.vsReserveFailed;
                failed.push({ item, message });
            }
        }
        setCheckingOut(false);
        setCart(failed.map(f => f.item));
        if (failed.length === 0) {
            setCartOpen(false);
            Alert.alert(
                t.vsReservationsCompleteTitle,
                t.vsReservationsCompleteMsg(successCount),
                [
                    { text: t.vsMyReservations, onPress: () => navigation.navigate('MyReservations') },
                    { text: t.vsOk },
                ]
            );
        } else {
            Alert.alert(
                t.vsPartialFailTitle,
                t.vsPartialFailMsg(successCount, failed.length) + '\n' +
                failed.map(f => `• ${f.item.court.name} ${formatDateLabel(f.item.date, t.dateLocale)} ${f.item.slot.start} — ${f.message}`).join('\n')
            );
        }
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.vsHeaderTitle}</Text>
            </View>

            {/* Bilgilendirme banner'ı */}
            <View style={s.infoBanner}>
                <Text style={s.infoBannerIcon}>🏅</Text>
                <Text style={s.infoBannerText}>
                    {t.vsInfoBanner}
                </Text>
            </View>

            <View style={s.filters}>
                {lockedBranch && (
                    <View style={s.branchBadge}>
                        <Text style={s.branchBadgeIcon}>🏅</Text>
                        <Text style={s.branchBadgeText}>{lockedBranch.charAt(0).toUpperCase() + lockedBranch.slice(1)} {t.vsBranchSuffix}</Text>
                    </View>
                )}
                <TextInput
                    style={s.input}
                    placeholder={t.vsCityPh}
                    placeholderTextColor={colors.textMuted}
                    value={city}
                    onChangeText={setCity}
                    returnKeyType="search"
                    onSubmitEditing={() => search()}
                />
                <TextInput
                    style={s.input}
                    placeholder={t.vsNamePh}
                    placeholderTextColor={colors.textMuted}
                    value={venueName}
                    onChangeText={setVenueName}
                    returnKeyType="search"
                    onSubmitEditing={() => search()}
                />
                <TouchableOpacity style={s.searchBtn} onPress={() => search()} disabled={loading} activeOpacity={0.8}>
                    {loading
                        ? <ActivityIndicator size="small" color="#fff" />
                        : <Text style={s.searchBtnText}>{t.vsSearchBtn}</Text>}
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
                            <Text style={s.emptyText}>{t.vsNoResults}</Text>
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
                        {t.vsHint}
                    </Text>
                </View>
            )}

            {/* Sepet barı — sepette ürün varken her zaman görünür */}
            {cart.length > 0 && (
                <TouchableOpacity style={[s.cartBar, { marginBottom: 12 + insets.bottom }]} onPress={() => setCartOpen(true)} activeOpacity={0.85}>
                    <Text style={s.cartBarText}>{t.vsCartBarLabel(cart.length)}</Text>
                    <Text style={s.cartBarPrice}>{cartTotal}₺</Text>
                    <Text style={s.cartBarArrow}>{t.vsCartBarContinue}</Text>
                </TouchableOpacity>
            )}

            {/* Tesis sayfası (short liste yok, slot seçimi var) */}
            <VenueBookingSheet
                venue={activeVenue}
                visible={!!activeVenue}
                onClose={() => setActive(null)}
                onAddToCart={handleAddToCart}
                cartKeys={new Set(cart.filter(i => i.venue.id === activeVenue?.id).map(i => i.key))}
                onOpenCart={() => setCartOpen(true)}
                cartCount={cart.length}
                cartTotal={cartTotal}
            />

            {/* Sepet modalı — ayrı (nested değil) */}
            <CartModal
                visible={cartOpen}
                cart={cart}
                onRemove={handleRemoveFromCart}
                onCheckout={handleCheckout}
                onClose={() => setCartOpen(false)}
                checkingOut={checkingOut}
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

    cartBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.purple, borderRadius: 14, marginHorizontal: 14, marginBottom: 12, paddingHorizontal: 16, paddingVertical: 13, gap: 8 },
    cartBarText:  { color: '#fff', fontSize: 13, fontWeight: '900' },
    cartBarPrice: { color: '#ffffffcc', fontSize: 13, fontWeight: '800', flex: 1 },
    cartBarArrow: { color: '#fff', fontSize: 13, fontWeight: '900' },
});

const bm = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: colors.bg },
    sheet:   { flex: 1, backgroundColor: colors.bg, paddingTop: Platform.OS === 'ios' ? 50 : 28, paddingBottom: Platform.OS === 'ios' ? 24 : 12 },

    header:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 3, paddingBottom: 3, gap: 3 },
    venueName:   { color: '#fff', fontSize: 18, fontWeight: '900' },
    venueMeta:   { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    closeBtn:    { paddingHorizontal: 3, paddingVertical: 3 },
    closeBtnText:{ color: colors.textMuted, fontSize: 20 },
    cartBadge:     { backgroundColor: colors.purple, borderRadius: 14, paddingHorizontal: 3, paddingVertical: 3, marginRight: 3 },
    cartBadgeText: { color: '#fff', fontSize: 11, fontWeight: '900' },

    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3, paddingHorizontal: 3, marginBottom: 3 },
    tag:    { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 3, paddingVertical: 3, borderWidth: 1, borderColor: colors.border },
    tagText:{ color: colors.textSecondary, fontSize: 10, fontWeight: '700' },
    priceTag:    { backgroundColor: colors.purple + '18', borderRadius: 8, paddingHorizontal: 3, paddingVertical: 3, borderWidth: 1, borderColor: colors.purple + '50' },
    priceTagText:{ color: colors.purple, fontSize: 10, fontWeight: '700' },

    dateList:         { paddingHorizontal: 14, paddingVertical: 3, gap: 3 },
    dateBtn:          { paddingVertical:3, paddingHorizontal:3, borderRadius:20, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    dateBtnActive:    { backgroundColor: colors.purple, borderColor: colors.purple },
    dateBtnText:      { color:'#e5e7eb', fontSize:11, fontWeight:'700' },
    dateBtnTextActive:{ color:'#fff' },

    scroll: { paddingHorizontal: 14, paddingTop: 3 },

    courtSection: { width: 170, backgroundColor: colors.surface2 + '40', borderRadius: 10, padding: 3, borderWidth: 1, borderColor: colors.border },
    courtHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 3 },
    courtName:    { color: '#fff', fontSize: 13, fontWeight: '900' },
    courtFree:    { color: colors.purple, fontSize: 11, fontWeight: '700' },
    errorText:    { color: colors.red, fontSize: 11, marginVertical: 3 },
    noSlotText:   { color: colors.textMuted, fontSize: 11, marginVertical: 3 },

    slotGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    slotBtn:       { width: '47%', backgroundColor: colors.bg, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 3, alignItems: 'center', borderWidth: 1.5, borderColor: colors.purple + '70' },
    slotBtnTaken:  { backgroundColor: colors.surface2, borderColor: colors.border, opacity: 0.45 },
    slotBtnMaint:  { backgroundColor: '#ef444418', borderColor: '#ef444440', opacity: 0.9 },
    slotBtnPicked: { backgroundColor: colors.purple, borderColor: colors.purple },
    slotBtnInCart: { backgroundColor: '#22c55e22', borderColor: '#22c55e' },
    slotTime:      { color: colors.purple, fontSize: 13, fontWeight: '900' },
    slotEnd:       { color: colors.purple + '99', fontSize: 9, marginTop: 1 },
    slotTimeTaken: { color: colors.textMuted },
    slotTimePicked:{ color: '#fff' },

    legend:     { flexDirection: 'row', gap: 3, marginTop: 3 },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    legendDot:  { width: 11, height: 11, borderRadius: 6, borderWidth: 1.5 },
    legendText: { color: colors.textMuted, fontSize: 10 },

    reserveBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderTopWidth: 1, borderColor: colors.border, paddingHorizontal: 3, paddingVertical: 3, gap: 3 },
    reserveBarTitle: { color: '#fff', fontSize: 12, fontWeight: '900' },
    reserveBarSub:   { color: colors.textMuted, fontSize: 10, marginTop: 1 },
    reserveBtn:      { backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 10 },
    reserveBtnText:  { color: '#fff', fontWeight: '900', fontSize: 13 },

    cartTotalBar:      { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.purple, paddingHorizontal: 3, paddingVertical: 3, gap: 3 },
    cartTotalBarText:  { color: '#fff', fontSize: 12, fontWeight: '900' },
    cartTotalBarPrice: { color: '#ffffffcc', fontSize: 12, fontWeight: '800', flex: 1 },
    cartTotalBarArrow: { color: '#fff', fontSize: 12, fontWeight: '900' },
});

const bv = StyleSheet.create({
    stepLabel:        { color: colors.textSecondary, fontSize: 10, fontWeight: '800', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
    timeBtn:          { paddingVertical: 3, paddingHorizontal: 3, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface2 },
    timeBtnActive:    { borderColor: colors.purple, backgroundColor: colors.purple + '20' },
    timeBtnText:      { color: '#e5e7eb', fontSize: 13, fontWeight: '900' },
    timeBtnSub:       { color: colors.textMuted, fontSize: 9, marginTop: 1 },
    timeBtnTextActive:{ color: colors.purple },
    durBtn:           { paddingVertical: 3, paddingHorizontal: 3, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: colors.purple + '50', backgroundColor: colors.surface2 },
    durBtnPicked:     { backgroundColor: colors.purple, borderColor: colors.purple },
    durBtnDur:        { color: colors.purple, fontSize: 13, fontWeight: '900' },
    durBtnTime:       { color: colors.textMuted, fontSize: 9, marginTop: 1 },
    durBtnPrice:      { color: colors.purple, fontSize: 10, fontWeight: '800', marginTop: 2 },
    durBtnTextPicked: { color: '#fff' },
});

const cm = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center', padding: 20 },
    box:     { backgroundColor: colors.surface, borderRadius: 18, padding: 18, width: '100%' },
    title:   { color: '#fff', fontSize: 17, fontWeight: '900', marginBottom: 14 },

    cartRow:        { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.surface2, borderRadius: 10, padding: 10, marginBottom: 8, gap: 8, borderWidth: 1, borderColor: colors.border },
    cartRowTitle:   { color: '#fff', fontSize: 13, fontWeight: '800' },
    cartRowSub:     { color: colors.textMuted, fontSize: 11, marginTop: 2 },
    cartRowPrice:   { color: colors.purple, fontSize: 12, fontWeight: '800' },
    cartRemoveBtn:  { paddingHorizontal: 6, paddingVertical: 4 },
    cartRemoveText: { color: colors.red, fontSize: 16, fontWeight: '900' },
    cartTotalRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, marginBottom: 4, borderTopWidth: 1, borderColor: colors.border },
    cartTotalLabel: { color: colors.textSecondary, fontSize: 14, fontWeight: '800' },
    cartTotalValue: { color: '#fff', fontSize: 16, fontWeight: '900' },

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
