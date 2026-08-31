import { useState, useEffect } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import colors from '../theme/colors';
import useT from '../hooks/useT';

// Tek formda başlangıç + bitiş tarihi seçilen her yerde kullanılan tarih aralığı
// seçici — CalendarPickerModal ile aynı takvim görünümünü kullanır, üstte
// Başlangıç/Bitiş sekmesiyle hangi tarihin seçildiği değiştirilir.
function daysGrid(yr, mo) {
    const firstDow = new Date(yr, mo, 1).getDay();
    const startOff = firstDow === 0 ? 6 : firstDow - 1;
    const daysInMo = new Date(yr, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOff; i++) cells.push(null);
    for (let d = 1; d <= daysInMo; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);
    return cells;
}

function fmtShort(d, t) {
    if (!d) return null;
    return `${d.getDate()} ${t.calMonths[d.getMonth()].slice(0, 3)}`;
}

// disableFuture: kullanıcı isteği — arşiv gibi GEÇMİŞ tarih filtrelerinde varsayılan
// "geçmiş seçilemez" davranışı tam tersi olmalı (gelecek tarih seçilemez, geçmiş
// serbest); mevcut 3 çağıran (Rakip Bul zaman filtresi, Medya/Gönderiler tarih
// filtresi) hep gelecek tarih seçtiği için varsayılan davranış DEĞİŞMİYOR.
export default function DateRangePickerModal({ visible, dateFrom, dateTo, onApply, onClose, quickOptions, activeQuick, onQuickSelect, disableFuture = false }) {
    const t = useT();
    const [from, setFrom] = useState(dateFrom || null);
    const [to, setTo] = useState(dateTo || null);
    const [picking, setPicking] = useState('from'); // 'from' | 'to'

    const viewBase = picking === 'from' ? (from || dateTo || new Date()) : (to || from || new Date());
    const [yr, setYr] = useState(viewBase.getFullYear());
    const [mo, setMo] = useState(viewBase.getMonth());

    useEffect(() => {
        if (!visible) return;
        setFrom(dateFrom || null);
        setTo(dateTo || null);
        setPicking('from');
        const base = dateFrom || new Date();
        setYr(base.getFullYear());
        setMo(base.getMonth());
    }, [visible]);

    const today = new Date();
    const todayMid = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isDisabledDay = (d) => {
        if (!d) return true;
        const cellDate = new Date(yr, mo, d);
        if (disableFuture) {
            if (cellDate > todayMid) return true;
            if (picking === 'to' && from && cellDate < from) return true;
            return false;
        }
        const minBase = picking === 'to' && from ? from : todayMid;
        return cellDate < new Date(minBase.getFullYear(), minBase.getMonth(), minBase.getDate());
    };
    const isSelected = (d) => {
        if (!d) return false;
        const cur = picking === 'from' ? from : to;
        return cur && cur.getFullYear() === yr && cur.getMonth() === mo && cur.getDate() === d;
    };

    const prevMo = () => mo === 0 ? (setMo(11), setYr(y => y - 1)) : setMo(m => m - 1);
    const nextMo = () => mo === 11 ? (setMo(0), setYr(y => y + 1)) : setMo(m => m + 1);

    const selectDay = (d) => {
        if (!d || isDisabledDay(d)) return;
        const picked = new Date(yr, mo, d);
        if (picking === 'from') {
            setFrom(picked);
            if (to && picked > to) setTo(null);
            setPicking('to');
        } else {
            if (picked < from) { setFrom(picked); }
            else { setTo(picked); }
        }
    };

    const cells = daysGrid(yr, mo);

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={s.overlay}>
                <View style={s.box}>
                    <View style={s.header}>
                        <Text style={s.title}>{t.dateRangeTitle || '📅 Tarih Aralığı'}</Text>
                        <TouchableOpacity onPress={onClose}><Text style={s.close}>✕</Text></TouchableOpacity>
                    </View>

                    {quickOptions && (
                        <View style={s.quickRow}>
                            {quickOptions.map(([val, label]) => (
                                <TouchableOpacity
                                    key={val}
                                    onPress={() => onQuickSelect?.(val)}
                                    style={[s.quickChip, activeQuick === val && s.quickChipActive]}
                                >
                                    <Text style={[s.quickChipText, activeQuick === val && s.quickChipTextActive]}>{label}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}

                    <View style={s.tabRow}>
                        <TouchableOpacity style={[s.tab, picking === 'from' && s.tabActive]} onPress={() => setPicking('from')}>
                            <Text style={s.tabLabel}>{t.dateRangeStart || 'Başlangıç'}</Text>
                            <Text style={[s.tabValue, from && s.tabValueSet]}>{from ? fmtShort(from, t) : (t.dateRangeSelect || 'Seç')}</Text>
                        </TouchableOpacity>
                        <Text style={s.tabSep}>→</Text>
                        <TouchableOpacity style={[s.tab, picking === 'to' && s.tabActive]} onPress={() => setPicking('to')}>
                            <Text style={s.tabLabel}>{t.dateRangeEnd || 'Bitiş'}</Text>
                            <Text style={[s.tabValue, to && s.tabValueSet]}>{to ? fmtShort(to, t) : (t.dateRangeSelect || 'Seç')}</Text>
                        </TouchableOpacity>
                    </View>

                    <View style={s.calHeader}>
                        <TouchableOpacity onPress={prevMo} style={s.nav}><Text style={s.navTxt}>‹</Text></TouchableOpacity>
                        <Text style={s.calTitle}>{t.calMonths[mo]} {yr}</Text>
                        <TouchableOpacity onPress={nextMo} style={s.nav}><Text style={s.navTxt}>›</Text></TouchableOpacity>
                    </View>
                    <View style={s.row}>
                        {t.calDays.map(d => <Text key={d} style={s.dayLbl}>{d}</Text>)}
                    </View>
                    {Array.from({ length: cells.length / 7 }).map((_, w) => (
                        <View key={w} style={s.row}>
                            {cells.slice(w * 7, w * 7 + 7).map((d, i) => {
                                const disabled = isDisabledDay(d);
                                return (
                                    <TouchableOpacity
                                        key={i}
                                        style={[s.cell, isSelected(d) && s.cellSel, disabled && s.cellDis]}
                                        onPress={() => selectDay(d)}
                                        activeOpacity={disabled ? 1 : 0.7}
                                    >
                                        <Text style={[s.cellTxt, isSelected(d) && s.cellTxtSel, disabled && s.cellTxtDis]}>
                                            {d || ''}
                                        </Text>
                                    </TouchableOpacity>
                                );
                            })}
                        </View>
                    ))}

                    <View style={s.btnRow}>
                        <TouchableOpacity style={s.clearBtn} onPress={() => { setFrom(null); setTo(null); }} activeOpacity={0.8}>
                            <Text style={s.clearBtnText}>{t.dateRangeClear || 'Temizle'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={s.applyBtn} onPress={() => onApply(from, to)} activeOpacity={0.8}>
                            <Text style={s.applyBtnText}>{t.dateRangeApply || 'Uygula'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000bb', justifyContent: 'flex-end' },
    box: { backgroundColor: colors.surface, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 17, paddingBottom: 30 },
    header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
    title: { color: '#fff', fontSize: 16, fontWeight: '900' },
    close: { color: colors.textMuted, fontSize: 22 },

    quickRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 14 },
    quickChip: { backgroundColor: colors.surface2, borderRadius: 8, paddingVertical: 6, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border },
    quickChipActive: { backgroundColor: colors.purple + '20', borderColor: colors.purple },
    quickChipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    quickChipTextActive: { color: colors.purple },

    tabRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 14 },
    tab: { flex: 1, backgroundColor: colors.surface2, borderRadius: 12, borderWidth: 1, borderColor: colors.border, paddingVertical: 8, paddingHorizontal: 10 },
    tabActive: { borderColor: colors.purple, backgroundColor: colors.purple + '18' },
    tabLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    tabValue: { color: colors.textMuted, fontSize: 14, fontWeight: '800', marginTop: 2 },
    tabValueSet: { color: colors.purpleLight || colors.purple },
    tabSep: { color: colors.textMuted, fontSize: 14 },

    calHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    nav: { padding: 7 },
    navTxt: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 26 },
    calTitle: { color: '#fff', fontSize: 15, fontWeight: '900' },
    row: { flexDirection: 'row', marginBottom: 2 },
    dayLbl: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 11, fontWeight: '700', paddingVertical: 3 },
    cell: { flex: 1, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
    cellSel: { backgroundColor: colors.purple },
    cellDis: { opacity: 0.2 },
    cellTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
    cellTxtSel: { fontWeight: '900' },
    cellTxtDis: { color: colors.textMuted },

    btnRow: { flexDirection: 'row', gap: 10, marginTop: 14 },
    clearBtn: { flex: 1, backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 12, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    clearBtnText: { color: colors.textSecondary, fontWeight: '700' },
    applyBtn: { flex: 1, backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
    applyBtnText: { color: '#fff', fontWeight: '800' },
});
