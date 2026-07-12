import { useState, useCallback, useEffect } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, ScrollView,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Modal, Linking,
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
const SLOT_LABEL = { FULL_HOUR: 'Tam Saatler', HALF_HOUR: 'Buçuklu', NINETY_MIN: '90 dk', VAR_DURATION: 'Esnek Saat', FLEXIBLE: 'Esnek Saat' };
const SLOT_SHORT = { FULL_HOUR: 'Tam', HALF_HOUR: 'Buçuklu', NINETY_MIN: '90dk', VAR_DURATION: 'Esnek', FLEXIBLE: 'Esnek' };
const VALID_ST   = ['FULL_HOUR', 'HALF_HOUR', 'NINETY_MIN', 'VAR_DURATION', 'FLEXIBLE'];
function venueSlotChip(venue) {
    const courts = venue.courts || [];
    const base = venue.slotType === 'VAR_DURATION' ? 'FULL_HOUR' : (venue.slotType || 'FULL_HOUR');
    if (courts.length === 0) return SLOT_LABEL[venue.slotType] || venue.slotType;
    const perCourt = courts.map(c => ({
        name: c.name,
        type: (VALID_ST.includes(c.slotType) ? c.slotType : null) || base,
    }));
    const unique = [...new Set(perCourt.map(c => c.type))];
    if (unique.length === 1) return SLOT_LABEL[unique[0]] || unique[0];
    return perCourt.map(c => `${c.name}:${SLOT_SHORT[c.type] || c.type}`).join(' · ');
}

function getVenueHoursLabel(venue, dateStr) {
    const os = venue.openSlots;
    if (os && !Array.isArray(os) && typeof os === 'object') {
        const dow = new Date(dateStr + 'T12:00:00').getDay();
        const key = String(dow === 0 ? 7 : dow);
        let entry;
        if (os[key] !== undefined) entry = os[key];
        else if (os['0'] !== undefined) entry = os['0'];
        if (entry !== undefined) {
            if (Array.isArray(entry) && entry.length === 0) return 'Kapalı';
            if (Array.isArray(entry) && entry.length > 0) return entry.map(w => `${w.from}–${w.to}`).join(' / ');
        }
    }
    return `${venue.openTime || '08:00'}–${venue.closeTime || '22:00'}`;
}

// ─── Sepet Modalı (en üst seviyede, nested modal sorunu yok) ─────────────────
// Sepet mantığı: kullanıcı farklı tesis/kort/tarih/saatlerden istediği kadar
// slot ekleyip hepsini tek seferde (aynı ödeme yöntemiyle) rezerve edebilir.
function CartModal({ visible, cart, onRemove, onCheckout, onClose, checkingOut }) {
    const [payment, setPayment] = useState('CASH');
    const priceOf = (item) => item.slot?.price ?? item.venue?.pricePerSlot ?? 0;
    const total = cart.reduce((sum, i) => sum + priceOf(i), 0);
    return (
        <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
            <View style={cm.overlay}>
                <View style={[cm.box, { maxHeight: '85%' }]}>
                    <Text style={cm.title}>🛒 Sepetim {cart.length > 0 ? `(${cart.length})` : ''}</Text>
                    <ScrollView style={{ maxHeight: 260, marginBottom: cart.length ? 10 : 0 }} showsVerticalScrollIndicator={false}>
                        {cart.length === 0 ? (
                            <Text style={{ color: colors.textMuted, fontSize: 13, textAlign: 'center', paddingVertical: 20 }}>
                                Sepetiniz boş. Bir tesisten saat seçip "Sepete Ekle"ye dokunun.
                            </Text>
                        ) : cart.map(item => (
                            <View key={item.key} style={cm.cartRow}>
                                <View style={{ flex: 1 }}>
                                    <Text style={cm.cartRowTitle} numberOfLines={1}>{item.venue.name} — {item.court.name}</Text>
                                    <Text style={cm.cartRowSub}>{formatDateLabel(item.date)} · {item.slot.start}–{item.slot.end}</Text>
                                </View>
                                <Text style={cm.cartRowPrice}>{priceOf(item) > 0 ? `${priceOf(item)}₺` : 'Ücretsiz'}</Text>
                                <TouchableOpacity onPress={() => onRemove(item.key)} style={cm.cartRemoveBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                                    <Text style={cm.cartRemoveText}>✕</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                    </ScrollView>
                    {cart.length > 0 && (
                        <>
                            <View style={cm.cartTotalRow}>
                                <Text style={cm.cartTotalLabel}>Toplam</Text>
                                <Text style={cm.cartTotalValue}>{total > 0 ? `${total}₺` : 'Ücretsiz'}</Text>
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
                        </>
                    )}
                    <View style={cm.btnRow}>
                        <TouchableOpacity style={cm.cancelBtn} onPress={onClose} activeOpacity={0.8}>
                            <Text style={cm.cancelBtnText}>Kapat</Text>
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
                                    : <Text style={cm.confirmBtnText}>Rezervasyonları Tamamla ✓</Text>}
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


function VenueBookingSheet({ venue, visible, onClose, onAddToCart, cartKeys, onOpenCart, cartCount }) {
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
                setSlotsMap(prev => ({ ...prev, [court.id]: { slots: [], loading: false, error: 'Yüklenemedi', type: null, windows: [] } }));
            }
        }));
    }, [venue]);

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
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={bm.overlay}>
                <View style={bm.sheet}>
                    <View style={bm.handle} />

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
                        return (
                            <View style={bm.tagRow}>
                                <View style={bm.tag}><Text style={bm.tagText}>⏰ {getVenueHoursLabel(venue, date)}</Text></View>
                                <View style={bm.tag}><Text style={bm.tagText}>📅 {venueSlotChip(venue)}</Text></View>
                                {venue.phone ? <View style={bm.tag}><Text style={bm.tagText}>📞 {venue.phone}</Text></View> : null}
                                {lightsFrom ? <View style={[bm.tag, { borderColor: '#fbbf2460', backgroundColor: '#fbbf2410' }]}><Text style={[bm.tagText, { color: '#fbbf24' }]}>💡 {lightsFrom}'dan ışık</Text></View> : null}
                            </View>
                        );
                    })()}

                    {/* İletişim butonları */}
                    {(() => {
                        const cl = (venue.contactLinks && typeof venue.contactLinks === 'object') ? venue.contactLinks : {};
                        // venue.phone'u whatsapp ve phone için fallback olarak kullan
                        const effectiveCl = {
                            whatsapp:  cl.whatsapp  || venue.phone || null,
                            phone:     cl.phone     || venue.phone || null,
                            telegram:  cl.telegram  || null,
                            instagram: cl.instagram || null,
                            email:     cl.email     || null,
                        };
                        const links = [
                            { key: 'whatsapp',  icon: '💬', label: 'WhatsApp',  url: v => { const d = v.replace(/\D/g,''); return `https://wa.me/${d.startsWith('0') ? '90'+d.slice(1) : d}`; } },
                            { key: 'phone',     icon: '📞', label: 'Beni Ara',  url: v => `tel:${v}` },
                            { key: 'telegram',  icon: '✈️', label: 'Telegram',  url: v => `https://t.me/${v.replace('@','')}` },
                            { key: 'instagram', icon: '📸', label: 'Instagram', url: v => `https://instagram.com/${v.replace('@','')}` },
                            { key: 'email',     icon: '📧', label: 'E-posta',   url: v => `mailto:${v}` },
                        ].filter(l => effectiveCl[l.key]);
                        if (links.length === 0) return null;
                        return (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, paddingBottom: 8 }}>
                                {links.map(l => (
                                    <TouchableOpacity key={l.key}
                                        onPress={() => Linking.openURL(l.url(effectiveCl[l.key]))}
                                        style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                                            backgroundColor: colors.surface2, borderRadius: 8,
                                            paddingHorizontal: 10, paddingVertical: 6,
                                            borderWidth: 1, borderColor: colors.border }}>
                                        <Text style={{ fontSize: 13 }}>{l.icon}</Text>
                                        <Text style={{ color: '#e5e7eb', fontSize: 11, fontWeight: '700' }}>{l.label}</Text>
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
                    {(() => {
                        const dayNames   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
                        const monthNames = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
                        return (
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}
                                style={{ height:48 }}
                                contentContainerStyle={{ paddingHorizontal:14, alignItems:'center' }}>
                                {DATE_OPTIONS.map(item => {
                                    const active = item === date;
                                    const [,mo,day] = item.split('-').map(Number);
                                    const d = new Date(item + 'T12:00:00');
                                    const label = `${day} ${monthNames[mo-1]} ${dayNames[d.getDay()]}`;
                                    return (
                                        <TouchableOpacity key={item}
                                            onPress={() => handleDateChange(item)}
                                            activeOpacity={0.75}
                                            style={{ marginRight:6, paddingVertical:7, paddingHorizontal:12, borderRadius:20,
                                                backgroundColor: active ? colors.purple : colors.surface2,
                                                borderWidth:1, borderColor: active ? colors.purple : colors.border }}>
                                            <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>{label}</Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>
                        );
                    })()}

                    {/* Kortlar + Slotlar — yatay kaydır, her kort 170px sütun */}
                    <ScrollView horizontal showsHorizontalScrollIndicator={false}
                        style={{ height: 300 }}
                        contentContainerStyle={{ flexDirection:'row', alignItems:'stretch', paddingHorizontal:8, paddingVertical:8, gap:8 }}>
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
                                                {freeCount > 0 ? `${freeCount} müsait` : 'Dolu'}
                                            </Text>
                                        )}
                                        {isMaint && (
                                            <Text style={{ color: '#fca5a5', fontSize: 12, fontWeight: '700' }}>🔧 Bakımda</Text>
                                        )}
                                    </View>

                                    <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ flex:1 }}>
                                    {entry.loading ? (
                                        <ActivityIndicator size="small" color={colors.purple} style={{ marginVertical: 12 }} />
                                    ) : entry.error ? (
                                        <Text style={bm.errorText}>{entry.error}</Text>
                                    ) : isMaint ? (
                                        <Text style={{ color: '#f87171', fontSize: 12, marginVertical: 8, lineHeight: 18 }}>
                                            Bu kort seçilen tarihte bakımda. Farklı bir tarih seçin.
                                        </Text>
                                    ) : isVar ? (
                                        <>
                                            {entry.windows.length === 0 ? (
                                                <Text style={bm.noSlotText}>Müsait pencere yok.</Text>
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
                                                const price = w.pricePerHour != null ? Math.round(w.pricePerHour * (dur / 60)) : venue?.pricePerSlot ?? null;
                                                const isPicked = picked?.court.id === court.id && picked?.slot.start === customStart && isWinSel;
                                                return (
                                                    <View key={wi} style={{ backgroundColor: colors.surface2, borderRadius: 10, padding: 10, marginBottom: 8, borderWidth: 1, borderColor: isWinSel ? colors.purple : colors.border }}>
                                                        {/* Pencere başlığı */}
                                                        <TouchableOpacity onPress={() => { setVarStartMap(p => ({ ...p, [court.id]: { winStart: w.start, winEnd: w.end, customStart: w.start } })); setVarDurMap(p => ({ ...p, [court.id]: 60 })); setPicked(null); }}
                                                            style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: isWinSel ? 10 : 0 }}>
                                                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800' }}>🕐 {w.start} – {w.end}</Text>
                                                            <Text style={{ color: isWinSel ? colors.purple : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{isWinSel ? '▲ Seçili' : '▼ Seç'}</Text>
                                                        </TouchableOpacity>

                                                        {isWinSel && (<>
                                                            {/* Başlangıç saati girişi */}
                                                            <Text style={bv.stepLabel}>Başlangıç Saatini Girin</Text>
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10 }}>
                                                                <TextInput
                                                                    value={sel?.customStart ?? w.start}
                                                                    onChangeText={v => { setVarStartMap(p => ({ ...p, [court.id]: { ...p[court.id], customStart: v } })); setPicked(null); }}
                                                                    placeholder={w.start}
                                                                    placeholderTextColor={colors.textMuted}
                                                                    keyboardType="numbers-and-punctuation"
                                                                    maxLength={5}
                                                                    style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, color: '#fff', fontSize: 16, fontWeight: '800', borderWidth: 1, borderColor: validStart ? colors.purple : colors.border, textAlign: 'center' }}
                                                                />
                                                                <Text style={{ color: colors.textMuted, fontSize: 12 }}>({w.start} – {w.end} arası)</Text>
                                                            </View>

                                                            {/* Süre seçimi */}
                                                            {validStart && (<>
                                                                <Text style={bv.stepLabel}>Süre Seçin</Text>
                                                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                                                    {[60, 90, 120, 150, 180].filter(d => customStartM + d <= winEndM).map(d => {
                                                                        const et = toT(customStartM + d);
                                                                        const pr = w.pricePerHour != null ? Math.round(w.pricePerHour * (d / 60)) : null;
                                                                        const isSel = varDurMap[court.id] === d;
                                                                        return (
                                                                            <TouchableOpacity key={d}
                                                                                onPress={() => { setVarDurMap(p => ({ ...p, [court.id]: d })); setPicked(null); }}
                                                                                style={[bv.durBtn, isSel && bv.durBtnPicked]}>
                                                                                <Text style={[bv.durBtnDur, isSel && bv.durBtnTextPicked]}>{d < 60 ? `${d}dk` : `${d/60}sa`}</Text>
                                                                                <Text style={[bv.durBtnTime, isSel && bv.durBtnTextPicked]}>{customStart}–{et}</Text>
                                                                                {pr != null && <Text style={[bv.durBtnPrice, isSel && bv.durBtnTextPicked]}>{pr > 0 ? `${pr}₺` : 'Ücretsiz'}</Text>}
                                                                            </TouchableOpacity>
                                                                        );
                                                                    })}
                                                                </View>
                                                                {/* Rezerve Et butonu */}
                                                                {validEnd && (
                                                                    <TouchableOpacity
                                                                        onPress={() => setPicked({ court, slot: { start: customStart, end: toT(customStartM + dur), free: true, price: w.pricePerHour != null ? Math.round(w.pricePerHour * (dur/60)) : null, durationMins: dur } })}
                                                                        style={{ backgroundColor: isPicked ? colors.purple : colors.purple+'30', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: colors.purple }}>
                                                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                                                                            {isPicked ? '✅ Seçildi' : `${customStart} – ${toT(customStartM + dur)} Seç`}
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
                                        <Text style={bm.noSlotText}>Bu tarihte slot tanımlı değil.</Text>
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
                                                                {slot.price > 0 ? `${slot.price}₺` : 'Ücretsiz'}
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
                    <View style={[bm.legend, { paddingHorizontal:14, paddingTop:6 }]}>
                        <View style={bm.legendItem}>
                            <View style={[bm.legendDot, { borderColor: colors.purple }]} />
                            <Text style={bm.legendText}>Müsait</Text>
                        </View>
                        <View style={bm.legendItem}>
                            <View style={[bm.legendDot, { backgroundColor: colors.surface2, borderColor: colors.border }]} />
                            <Text style={bm.legendText}>Dolu</Text>
                        </View>
                        <View style={bm.legendItem}>
                            <View style={[bm.legendDot, { backgroundColor: '#ef444418', borderColor: '#ef444440' }]} />
                            <Text style={bm.legendText}>🔧 Bakım</Text>
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
                                    {formatDateLabel(date)}{venue.pricePerSlot > 0 ? ` · ${venue.pricePerSlot}₺` : ''}
                                </Text>
                            </View>
                            <TouchableOpacity style={bm.reserveBtn} onPress={handleAddToCart} activeOpacity={0.8}>
                                <Text style={bm.reserveBtnText}>Sepete Ekle +</Text>
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
                <View style={s.tag}><Text style={s.tagText}>⏰ {getVenueHoursLabel(venue, getDateStr(0))}</Text></View>
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

    // Sepet — farklı tesis/kort/tarih/saatlerden eklenen slotlar (nested modal
    // sorununu önlemek için CartModal ayrı/en üst seviyede tutulur)
    const [cart, setCart] = useState([]); // [{ key, venue, court, slot, date }]
    const [cartOpen, setCartOpen] = useState(false);
    const [checkingOut, setCheckingOut] = useState(false);

    // Sayfa açılınca (branch parametresi varsa) otomatik ara
    // NOT: backend BusinessVenue.branch alanı İngilizce anahtarla saklanır (ör. "tennis"),
    // bu yüzden API'ye lockedBranch (Türkçe görünen etiket, ör. "tenis") değil rawBranch
    // gönderilmeli — aksi halde "tennis" hiçbir zaman "tenis" alt dizesini içermediği için
    // hiçbir onaylı tesis eşleşmez (lockedBranch sadece ekrandaki rozet metni içindir).
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
                const message = e?.response?.data?.message || e?.message || 'Rezervasyon yapılamadı';
                failed.push({ item, message });
            }
        }
        setCheckingOut(false);
        setCart(failed.map(f => f.item));
        if (failed.length === 0) {
            setCartOpen(false);
            Alert.alert(
                '✅ Rezervasyonlar Tamamlandı',
                `${successCount} rezervasyon başarıyla oluşturuldu.`,
                [
                    { text: 'Rezervasyonlarım', onPress: () => navigation.navigate('MyReservations') },
                    { text: 'Tamam' },
                ]
            );
        } else {
            Alert.alert(
                '⚠️ Bazı Rezervasyonlar Başarısız',
                `${successCount} başarılı, ${failed.length} başarısız:\n` +
                failed.map(f => `• ${f.item.court.name} ${formatDateLabel(f.item.date)} ${f.item.slot.start} — ${f.item.message}`).join('\n')
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

            {/* Sepet barı — sepette ürün varken her zaman görünür */}
            {cart.length > 0 && (
                <TouchableOpacity style={s.cartBar} onPress={() => setCartOpen(true)} activeOpacity={0.85}>
                    <Text style={s.cartBarText}>🛒 Sepet ({cart.length})</Text>
                    <Text style={s.cartBarPrice}>
                        {cart.reduce((sum, i) => sum + (i.slot.price ?? i.venue.pricePerSlot ?? 0), 0)}₺
                    </Text>
                    <Text style={s.cartBarArrow}>Devam Et →</Text>
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
    overlay: { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    sheet:   { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%', paddingBottom: Platform.OS === 'ios' ? 34 : 12 },
    handle:  { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginTop: 10, marginBottom: 12 },

    header:      { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 16, paddingBottom: 10, gap: 10 },
    venueName:   { color: '#fff', fontSize: 18, fontWeight: '900' },
    venueMeta:   { color: colors.textMuted, fontSize: 13, marginTop: 2 },
    closeBtn:    { paddingHorizontal: 4, paddingVertical: 2 },
    closeBtnText:{ color: colors.textMuted, fontSize: 20 },
    cartBadge:     { backgroundColor: colors.purple, borderRadius: 14, paddingHorizontal: 10, paddingVertical: 6, marginRight: 4 },
    cartBadgeText: { color: '#fff', fontSize: 12, fontWeight: '900' },

    tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 16, marginBottom: 8 },
    tag:    { backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: colors.border },
    tagText:{ color: colors.textSecondary, fontSize: 11, fontWeight: '700' },
    priceTag:    { backgroundColor: colors.purple + '18', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: colors.purple + '50' },
    priceTagText:{ color: colors.purple, fontSize: 11, fontWeight: '700' },

    dateList:         { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
    dateBtn:          { paddingVertical:7, paddingHorizontal:12, borderRadius:20, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    dateBtnActive:    { backgroundColor: colors.purple, borderColor: colors.purple },
    dateBtnText:      { color:'#e5e7eb', fontSize:12, fontWeight:'700' },
    dateBtnTextActive:{ color:'#fff' },

    scroll: { paddingHorizontal: 14, paddingTop: 6 },

    courtSection: { width: 170, backgroundColor: colors.surface2 + '40', borderRadius: 10, padding: 8, borderWidth: 1, borderColor: colors.border },
    courtHeader:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    courtName:    { color: '#fff', fontSize: 14, fontWeight: '900' },
    courtFree:    { color: colors.purple, fontSize: 12, fontWeight: '700' },
    errorText:    { color: colors.red, fontSize: 12, marginVertical: 6 },
    noSlotText:   { color: colors.textMuted, fontSize: 12, marginVertical: 6 },

    slotGrid:      { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
    slotBtn:       { width: '47%', backgroundColor: colors.bg, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 3, alignItems: 'center', borderWidth: 1.5, borderColor: colors.purple + '70' },
    slotBtnTaken:  { backgroundColor: colors.surface2, borderColor: colors.border, opacity: 0.45 },
    slotBtnMaint:  { backgroundColor: '#ef444418', borderColor: '#ef444440', opacity: 0.9 },
    slotBtnPicked: { backgroundColor: colors.purple, borderColor: colors.purple },
    slotBtnInCart: { backgroundColor: '#22c55e22', borderColor: '#22c55e' },
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

const bv = StyleSheet.create({
    stepLabel:        { color: colors.textSecondary, fontSize: 11, fontWeight: '800', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 },
    timeBtn:          { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface2 },
    timeBtnActive:    { borderColor: colors.purple, backgroundColor: colors.purple + '20' },
    timeBtnText:      { color: '#e5e7eb', fontSize: 14, fontWeight: '900' },
    timeBtnSub:       { color: colors.textMuted, fontSize: 10, marginTop: 1 },
    timeBtnTextActive:{ color: colors.purple },
    durBtn:           { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', borderWidth: 1.5, borderColor: colors.purple + '50', backgroundColor: colors.surface2 },
    durBtnPicked:     { backgroundColor: colors.purple, borderColor: colors.purple },
    durBtnDur:        { color: colors.purple, fontSize: 14, fontWeight: '900' },
    durBtnTime:       { color: colors.textMuted, fontSize: 10, marginTop: 1 },
    durBtnPrice:      { color: colors.purple, fontSize: 11, fontWeight: '800', marginTop: 2 },
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
