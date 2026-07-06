import { useState, useCallback, useEffect, useMemo } from 'react';
import {
    View, Text, TouchableOpacity, ScrollView, FlatList,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Modal, Linking,
} from 'react-native';
import colors from '../../theme/colors';
import api from '../../services/api';

function pad(n) { return String(n).padStart(2, '0'); }

function getDateStr(offset = 0) {
    const d = new Date();
    d.setDate(d.getDate() + offset);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function formatDateLabel(dateStr) {
    const [y, m, day] = dateStr.split('-').map(Number);
    const d = new Date(y, m - 1, day);
    const days = ['Paz', 'Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt'];
    const months = ['Oca', 'Şub', 'Mar', 'Nis', 'May', 'Haz', 'Tem', 'Ağu', 'Eyl', 'Eki', 'Kas', 'Ara'];
    return `${days[d.getDay()]} ${day} ${months[m - 1]}`;
}

const toM = t => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const toT = m => `${String(Math.floor(m / 60)).padStart(2,'0')}:${String(m % 60).padStart(2,'0')}`;

function SlotBubble({ slot, selected, onPress }) {
    const priceLabel = slot.price != null ? (slot.price > 0 ? `${slot.price}₺` : 'Ücretsiz') : null;
    return (
        <TouchableOpacity
            style={[ss.bubble, !slot.free && ss.bubbleTaken, selected && ss.bubbleSelected]}
            onPress={() => slot.free && onPress(slot)}
            disabled={!slot.free}
            activeOpacity={0.7}
        >
            <Text style={[ss.bubbleTime, !slot.free && ss.bubbleTimeTaken, selected && ss.bubbleTimeSelected]}>
                {slot.start}
            </Text>
            <Text style={[ss.bubbleDash, !slot.free && ss.bubbleTimeTaken, selected && ss.bubbleTimeSelected]}>
                –{slot.end}
            </Text>
            {priceLabel && slot.free !== false && (
                <Text style={[ss.bubblePrice, selected && ss.bubblePriceSelected]}>{priceLabel}</Text>
            )}
        </TouchableOpacity>
    );
}

function ConfirmModal({ visible, slot, venue, court, onConfirm, onClose, confirming }) {
    const [payment, setPayment] = useState('CASH');

    if (!slot) return null;
    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={cm.overlay}>
                <View style={cm.sheet}>
                    <View style={cm.handle} />
                    <Text style={cm.title}>Rezervasyon Onayla</Text>

                    <View style={cm.infoCard}>
                        {[
                            { label: 'Tesis', value: venue.name },
                            { label: 'Kort', value: court.name },
                            { label: 'Saat', value: `${slot.start} – ${slot.end}` },
                            { label: 'Ücret', value: (() => { const p = slot?.price ?? venue.pricePerSlot; return p > 0 ? `${p}₺` : 'Ücretsiz'; })() },
                        ].map(row => (
                            <View key={row.label} style={cm.infoRow}>
                                <Text style={cm.infoLabel}>{row.label}</Text>
                                <Text style={cm.infoValue}>{row.value}</Text>
                            </View>
                        ))}
                    </View>

                    <Text style={cm.payLabel}>Ödeme Yöntemi</Text>
                    {[
                        { key: 'CASH', label: '💵 Kort Başında Nakit/Kart' },
                        { key: 'ONLINE', label: '💳 Online Ödeme', disabled: true },
                    ].map(opt => (
                        <TouchableOpacity
                            key={opt.key}
                            style={[cm.payOpt, payment === opt.key && cm.payOptActive, opt.disabled && cm.payOptDisabled]}
                            onPress={() => !opt.disabled && setPayment(opt.key)}
                            disabled={opt.disabled}
                            activeOpacity={0.8}
                        >
                            <Text style={[cm.payOptText, opt.disabled && { color: colors.textMuted }]}>{opt.label}</Text>
                            {opt.disabled && <View style={cm.soonBadge}><Text style={cm.soonText}>Yakında</Text></View>}
                            {!opt.disabled && payment === opt.key && <Text style={cm.payCheck}>✓</Text>}
                        </TouchableOpacity>
                    ))}

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

export default function CourtSlotsScreen({ route, navigation }) {
    const { venue, court } = route.params;

    const dateOptions = useMemo(() => Array.from({ length: 14 }, (_, i) => getDateStr(i)), []);
    const [selectedDate, setDate] = useState(dateOptions[0]);
    const [slots, setSlots]       = useState(null);
    const [loading, setLoading]   = useState(false);
    const [pickedSlot, setPicked] = useState(null);
    const [modalVisible, setModal] = useState(false);
    const [confirming, setConf]   = useState(false);
    const [varStartTime, setVarStartTime] = useState(null);

    const fetchSlots = useCallback(async (date) => {
        setLoading(true);
        setSlots(null);
        setPicked(null);
        setVarStartTime(null);
        try {
            const { data } = await api.get(`/venues/${venue.id}/courts/${court.id}/slots`, { params: { date } });
            setSlots(data);
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Slotlar alınamadı');
        } finally { setLoading(false); }
    }, [venue.id, court.id]);

    useEffect(() => { fetchSlots(selectedDate); }, [selectedDate]);

    const handleSelectSlot = (slot) => {
        setPicked(slot);
        setModal(true);
    };

    const handleConfirm = async (paymentMethod) => {
        setConf(true);
        try {
            await api.post(`/venues/${venue.id}/courts/${court.id}/reserve`, {
                date: selectedDate,
                startTime: pickedSlot.start,
                endTime:   pickedSlot.end,
                paymentMethod,
            });
            setModal(false);
            Alert.alert('✅ Rezervasyon Yapıldı', `${selectedDate} tarihinde ${pickedSlot.start}–${pickedSlot.end} rezervasyonunuz onaylandı.`, [
                { text: 'Rezervasyonlarım', onPress: () => navigation.navigate('MyReservations') },
                { text: 'Tamam', onPress: () => fetchSlots(selectedDate) },
            ]);
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Rezervasyon yapılamadı');
        } finally { setConf(false); }
    };

    const isVarDuration = slots?.type === 'VAR_DURATION';

    const slotList = isVarDuration ? [] : (slots?.slots || slots?.windows || []);

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <View style={{ flex: 1 }}>
                    <Text style={s.title}>{court.name}</Text>
                    <Text style={s.subtitle}>{venue.name}</Text>
                </View>
            </View>

            {/* İletişim butonları */}
            {(() => {
                const cl = venue.contactLinks;
                if (!cl || typeof cl !== 'object') return null;
                const links = [
                    { key: 'whatsapp',  icon: '💬', label: 'WhatsApp',  url: v => { const d = v.replace(/\D/g,''); return `https://wa.me/${d.startsWith('0') ? '90'+d.slice(1) : d}`; } },
                    { key: 'phone',     icon: '📞', label: 'Beni Ara',  url: v => `tel:${v}` },
                    { key: 'telegram',  icon: '✈️', label: 'Telegram',  url: v => `https://t.me/${v.replace('@','')}` },
                    { key: 'instagram', icon: '📸', label: 'Instagram', url: v => `https://instagram.com/${v.replace('@','')}` },
                    { key: 'email',     icon: '📧', label: 'E-posta',   url: v => `mailto:${v}` },
                ].filter(l => cl[l.key]);
                if (links.length === 0) return null;
                return (
                    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, paddingHorizontal: 14, paddingTop: 10, paddingBottom: 4 }}>
                        {links.map(l => (
                            <TouchableOpacity key={l.key}
                                onPress={() => Linking.openURL(l.url(cl[l.key]))}
                                style={{ flexDirection: 'row', alignItems: 'center', gap: 4,
                                    backgroundColor: colors.surface, borderRadius: 8,
                                    paddingHorizontal: 10, paddingVertical: 6,
                                    borderWidth: 1, borderColor: colors.border }}>
                                <Text style={{ fontSize: 13 }}>{l.icon}</Text>
                                <Text style={{ color: '#e5e7eb', fontSize: 11, fontWeight: '700' }}>{l.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                );
            })()}

            {/* Tarih seçici */}
            <FlatList
                data={dateOptions}
                keyExtractor={d => d}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={s.dateList}
                renderItem={({ item }) => {
                    const active = item === selectedDate;
                    const [y, mo, day] = item.split('-').map(Number);
                    const d = new Date(y, mo - 1, day);
                    const dayNames   = ['Paz','Pzt','Sal','Çar','Per','Cum','Cmt'];
                    const monthNames = ['Oca','Şub','Mar','Nis','May','Haz','Tem','Ağu','Eyl','Eki','Kas','Ara'];
                    return (
                        <TouchableOpacity
                            style={[s.dateBtn, active && s.dateBtnActive]}
                            onPress={() => { setDate(item); }}
                            activeOpacity={0.7}
                        >
                            <Text style={[s.dateChipWeek,  active && s.dateChipWeekA]}>{dayNames[d.getDay()]}</Text>
                            <Text style={[s.dateChipNum,   active && s.dateChipNumA]}>{day}</Text>
                            <Text style={[s.dateChipMonth, active && s.dateChipMonthA]}>{monthNames[mo - 1]}</Text>
                        </TouchableOpacity>
                    );
                }}
            />

            <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
                {loading && (
                    <View style={s.center}>
                        <ActivityIndicator size="large" color={colors.purple} />
                    </View>
                )}

                {!loading && slots && (
                    <>
                        {isVarDuration ? (
                            <>
                                <Text style={s.slotsTitle}>{formatDateLabel(selectedDate)} — Başlangıç saati seçin</Text>
                                <Text style={vs.stepLabel}>1. Başlangıç Saati</Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
                                    {(slots?.windows || []).length === 0 ? (
                                        <Text style={s.noSlotsText}>Bu tarihte müsait pencere yok.</Text>
                                    ) : (slots?.windows || []).map((w, i) => (
                                        <TouchableOpacity key={i}
                                            onPress={() => { setVarStartTime(w.start); setPicked(null); }}
                                            style={[vs.timeBtn, varStartTime === w.start && vs.timeBtnActive]}
                                        >
                                            <Text style={[vs.timeBtnText, varStartTime === w.start && vs.timeBtnTextActive]}>{w.start}</Text>
                                            <Text style={[vs.timeBtnSub, varStartTime === w.start && vs.timeBtnTextActive]}>–{w.end}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {varStartTime && (() => {
                                    const w = (slots?.windows || []).find(win => win.start === varStartTime);
                                    if (!w) return null;
                                    const winEnd = toM(w.end);
                                    const options = [60, 90, 120, 150, 180].filter(d => {
                                        const endM = toM(varStartTime) + d;
                                        return endM <= winEnd && (endM === winEnd || winEnd - endM >= 60);
                                    });
                                    return (
                                        <>
                                            <Text style={vs.stepLabel}>2. Süre Seçin</Text>
                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                                                {options.map(d => {
                                                    const price = w.pricePerHour != null ? Math.round(w.pricePerHour * (d / 60)) : null;
                                                    const endT = toT(toM(varStartTime) + d);
                                                    return (
                                                        <TouchableOpacity key={d}
                                                            onPress={() => handleSelectSlot({ start: varStartTime, end: endT, free: true, price, durationMins: d })}
                                                            style={vs.durBtn}
                                                        >
                                                            <Text style={vs.durBtnDur}>{d} dk</Text>
                                                            <Text style={vs.durBtnTime}>{varStartTime}–{endT}</Text>
                                                            {price != null && <Text style={vs.durBtnPrice}>{price > 0 ? `${price}₺` : 'Ücretsiz'}</Text>}
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </>
                                    );
                                })()}
                            </>
                        ) : (
                            <>
                                <Text style={s.slotsTitle}>
                                    {formatDateLabel(selectedDate)} — {slotList.filter(sl => sl.free !== false).length} müsait slot
                                </Text>
                                {slotList.length === 0 ? (
                                    <View style={s.noSlots}>
                                        <Text style={s.noSlotsText}>Bu tarihte müsait slot bulunamadı.</Text>
                                    </View>
                                ) : (
                                    <View style={ss.grid}>
                                        {slotList.map((slot, i) => (
                                            <SlotBubble
                                                key={i}
                                                slot={slot}
                                                selected={pickedSlot?.start === slot.start && pickedSlot?.end === slot.end}
                                                onPress={handleSelectSlot}
                                            />
                                        ))}
                                    </View>
                                )}
                            </>
                        )}

                        <View style={s.legend}>
                            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: colors.purple + '30', borderColor: colors.purple }]} /><Text style={s.legendText}>Müsait</Text></View>
                            <View style={s.legendItem}><View style={[s.legendDot, { backgroundColor: colors.surface2 }]} /><Text style={s.legendText}>Dolu</Text></View>
                        </View>
                    </>
                )}

                <View style={{ height: 40 }} />
            </ScrollView>

            <ConfirmModal
                visible={modalVisible}
                slot={pickedSlot}
                venue={venue}
                court={court}
                onConfirm={handleConfirm}
                onClose={() => { setModal(false); setPicked(null); }}
                confirming={confirming}
            />
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title: { color: '#fff', fontSize: 16, fontWeight: '900' },
    subtitle: { color: colors.textMuted, fontSize: 12, marginTop: 1 },

    dateList: { paddingHorizontal: 14, paddingVertical: 8, gap: 6 },
    dateBtn: { alignItems:'center', paddingVertical:8, paddingHorizontal:10, borderRadius:12, backgroundColor: colors.surface, borderWidth:1, borderColor: colors.border, minWidth:54 },
    dateBtnActive: { backgroundColor: colors.purple+'30', borderColor: colors.purple },
    dateChipWeek:  { color:'#888', fontSize:10, fontWeight:'700', marginBottom:1 },
    dateChipWeekA: { color: colors.purple },
    dateChipNum:   { color:'#fff', fontSize:20, fontWeight:'900', lineHeight:24 },
    dateChipNumA:  { color:'#fff' },
    dateChipMonth: { color:'#888', fontSize:10, marginTop:1 },
    dateChipMonthA:{ color: colors.purple },

    scroll: { paddingHorizontal: 14, paddingTop: 8 },
    center: { paddingTop: 60, alignItems: 'center' },

    slotsTitle: { color: '#fff', fontSize: 14, fontWeight: '800', marginBottom: 14 },
    noSlots: { alignItems: 'center', paddingVertical: 40 },
    noSlotsText: { color: colors.textMuted, fontSize: 14 },

    legend: { flexDirection: 'row', gap: 16, marginTop: 16, alignItems: 'center' },
    legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    legendDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 1, borderColor: colors.border },
    legendText: { color: colors.textMuted, fontSize: 12 },
});

const ss = StyleSheet.create({
    grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    bubble: { width: '30%', backgroundColor: colors.surface, borderRadius: 10, padding: 10, alignItems: 'center', borderWidth: 1.5, borderColor: colors.purple + '60' },
    bubbleTaken: { backgroundColor: colors.surface2, borderColor: colors.border, opacity: 0.5 },
    bubbleSelected: { backgroundColor: colors.purple, borderColor: colors.purple },
    bubbleTime: { color: colors.purple, fontSize: 14, fontWeight: '900' },
    bubbleDash: { color: colors.purple + '99', fontSize: 11, marginTop: 2 },
    bubbleTimeTaken: { color: colors.textMuted },
    bubbleTimeSelected: { color: '#fff' },
    bubblePrice: { color: colors.purple, fontSize: 10, fontWeight: '800', marginTop: 4 },
    bubblePriceSelected: { color: '#ffffffcc' },
});

const cm = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    sheet: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: Platform.OS === 'ios' ? 36 : 24 },
    handle: { width: 40, height: 4, backgroundColor: colors.border, borderRadius: 2, alignSelf: 'center', marginBottom: 16 },
    title: { color: '#fff', fontSize: 18, fontWeight: '900', marginBottom: 14 },

    infoCard: { backgroundColor: colors.surface2, borderRadius: 12, marginBottom: 14, overflow: 'hidden' },
    infoRow: { flexDirection: 'row', justifyContent: 'space-between', padding: 12, borderBottomWidth: 1, borderColor: colors.border },
    infoLabel: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    infoValue: { color: '#fff', fontSize: 13, fontWeight: '700' },

    payLabel: { color: colors.textSecondary, fontSize: 13, fontWeight: '700', marginBottom: 8 },
    payOpt: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: colors.surface2, borderRadius: 10, padding: 14, marginBottom: 8, borderWidth: 1, borderColor: colors.border },
    payOptActive: { borderColor: colors.purple, backgroundColor: colors.purple + '12' },
    payOptDisabled: { opacity: 0.5 },
    payOptText: { color: '#fff', fontSize: 14, fontWeight: '700' },
    payCheck: { color: colors.purple, fontSize: 18, fontWeight: '900' },
    soonBadge: { backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
    soonText: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },

    btnRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
    cancelBtn: { flex: 1, borderRadius: 10, paddingVertical: 13, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    cancelBtnText: { color: colors.textSecondary, fontWeight: '700', fontSize: 14 },
    confirmBtn: { flex: 2, backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 13, alignItems: 'center' },
    confirmBtnText: { color: '#fff', fontWeight: '900', fontSize: 14 },
});

const vs = StyleSheet.create({
    stepLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '800', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 },
    timeBtn: { paddingVertical: 10, paddingHorizontal: 14, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface },
    timeBtnActive: { borderColor: colors.purple, backgroundColor: colors.purple + '20' },
    timeBtnText: { color: '#e5e7eb', fontSize: 16, fontWeight: '900' },
    timeBtnSub: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
    timeBtnTextActive: { color: colors.purple },
    durBtn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, alignItems: 'center', borderWidth: 1.5, borderColor: colors.purple + '50', backgroundColor: colors.surface },
    durBtnDur: { color: colors.purple, fontSize: 15, fontWeight: '900' },
    durBtnTime: { color: colors.textMuted, fontSize: 10, marginTop: 2 },
    durBtnPrice: { color: colors.purple, fontSize: 11, fontWeight: '800', marginTop: 3 },
});
