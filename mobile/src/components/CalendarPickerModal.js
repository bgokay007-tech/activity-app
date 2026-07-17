import { useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import colors from '../theme/colors';
import useT from '../hooks/useT';

// Uygulama genelinde tek tarih seçilen her yerde (turnuva/maç tarihleri, konser/tiyatro
// filtreleri, işletme rezervasyon formları vb.) kullanılan tek takvim bileşeni — hepsi
// aynı görünsün diye buraya taşındı (önceden SubCategoryScreen.js'e özeldi).
export default function CalendarPickerModal({ visible, value, onSelect, onClose }) {
    const t = useT();
    const today = new Date();
    const init = value || today;
    const [yr, setYr] = useState(init.getFullYear());
    const [mo, setMo] = useState(init.getMonth());

    const firstDow = new Date(yr, mo, 1).getDay();
    const startOff = firstDow === 0 ? 6 : firstDow - 1;
    const daysInMo = new Date(yr, mo + 1, 0).getDate();
    const cells = [];
    for (let i = 0; i < startOff; i++) cells.push(null);
    for (let d = 1; d <= daysInMo; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isPast = (d) => d && new Date(yr, mo, d) < todayMidnight;
    const isSel = (d) => d && value && value.getFullYear() === yr && value.getMonth() === mo && value.getDate() === d;

    const prevMo = () => mo === 0 ? (setMo(11), setYr(y => y - 1)) : setMo(m => m - 1);
    const nextMo = () => mo === 11 ? (setMo(0), setYr(y => y + 1)) : setMo(m => m + 1);

    return (
        <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
            <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose}>
                <View style={s.box} onStartShouldSetResponder={() => true}>
                    <View style={s.header}>
                        <TouchableOpacity onPress={prevMo} style={s.nav}><Text style={s.navTxt}>‹</Text></TouchableOpacity>
                        <Text style={s.title}>{t.calMonths[mo]} {yr}</Text>
                        <TouchableOpacity onPress={nextMo} style={s.nav}><Text style={s.navTxt}>›</Text></TouchableOpacity>
                    </View>
                    <View style={s.row}>
                        {t.calDays.map(d => <Text key={d} style={s.dayLbl}>{d}</Text>)}
                    </View>
                    {Array.from({ length: cells.length / 7 }).map((_, w) => (
                        <View key={w} style={s.row}>
                            {cells.slice(w * 7, w * 7 + 7).map((d, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[s.cell, isSel(d) && s.cellSel, (!d || isPast(d)) && s.cellDis]}
                                    onPress={() => { if (d && !isPast(d)) onSelect(new Date(yr, mo, d)); }}
                                    activeOpacity={d && !isPast(d) ? 0.7 : 1}
                                >
                                    <Text style={[s.cellTxt, isSel(d) && s.cellTxtSel, (!d || isPast(d)) && s.cellTxtDis]}>
                                        {d || ''}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ))}
                    <TouchableOpacity style={s.closeBtn} onPress={onClose}>
                        <Text style={s.closeTxt}>{t.closeCalendar}</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

const s = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: '#000000cc', justifyContent: 'center', alignItems: 'center', padding: 17 },
    box: { backgroundColor: colors.surface, borderRadius: 20, padding: 13, width: '100%' },
    header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 },
    nav: { padding: 7 },
    navTxt: { color: '#fff', fontSize: 24, fontWeight: '700', lineHeight: 26 },
    title: { color: '#fff', fontSize: 16, fontWeight: '900' },
    row: { flexDirection: 'row', marginBottom: 2 },
    dayLbl: { flex: 1, textAlign: 'center', color: colors.textMuted, fontSize: 11, fontWeight: '700', paddingVertical: 3 },
    cell: { flex: 1, aspectRatio: 1, justifyContent: 'center', alignItems: 'center', borderRadius: 8 },
    cellSel: { backgroundColor: colors.purple },
    cellDis: { opacity: 0.2 },
    cellTxt: { color: '#fff', fontSize: 13, fontWeight: '600' },
    cellTxtSel: { fontWeight: '900' },
    cellTxtDis: { color: colors.textMuted },
    closeBtn: { marginTop: 12, backgroundColor: colors.surface2, borderRadius: 10, paddingVertical: 7, alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    closeTxt: { color: colors.textSecondary, fontWeight: '700' },
});
