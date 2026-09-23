import { useEffect, useMemo, useState } from 'react';
import {
    View, Text, Modal, ScrollView, TouchableOpacity, TextInput,
    ActivityIndicator, Alert, Platform,
} from 'react-native';
import api from '../services/api';
import colors from '../theme/colors';
import { moderateScale } from '../theme/scale';

const WEEKDAYS = [
    { key: 1, tr: 'Pzt', en: 'Mon', ru: 'Пн', de: 'Mo' },
    { key: 2, tr: 'Sal', en: 'Tue', ru: 'Вт', de: 'Di' },
    { key: 3, tr: 'Çar', en: 'Wed', ru: 'Ср', de: 'Mi' },
    { key: 4, tr: 'Per', en: 'Thu', ru: 'Чт', de: 'Do' },
    { key: 5, tr: 'Cum', en: 'Fri', ru: 'Пт', de: 'Fr' },
    { key: 6, tr: 'Cmt', en: 'Sat', ru: 'Сб', de: 'Sa' },
    { key: 7, tr: 'Paz', en: 'Sun', ru: 'Вс', de: 'So' },
];

function dayLabel(weekday, lang) {
    const d = WEEKDAYS.find(x => x.key === weekday);
    if (!d) return String(weekday);
    return d[lang] || d.en;
}

function formatSlot(slot, lang) {
    if (!slot) return '';
    const day = slot.date || (slot.weekday != null ? dayLabel(slot.weekday, lang) : '');
    return `${day} ${slot.timeFrom || ''}-${slot.timeTo || ''}`.trim();
}

function formatAgreed(agreed) {
    if (!agreed) return '';
    return [agreed.date, `${agreed.timeFrom || ''}-${agreed.timeTo || ''}`, agreed.venueName]
        .filter(Boolean).join(' · ');
}

/**
 * Turnuva maç detayı: eşleşen taraflar müsaitlik + yer/zaman teklifi;
 * diğerleri yalnızca anlaşılmış yer/zamanı görür.
 */
export default function TournamentMatchDetailModal({
    visible,
    onClose,
    tournament,
    match,
    t,
    lang = 'tr',
    infoColor = '#38bdf8',
    mySideId,
    isCreator,
    myIsAdmin,
    tournMyJokerUsed,
    playersArrangeCourts,
    onOpenScore,
    onRequestExtend,
    onRefresh,
}) {
    const [schedule, setSchedule] = useState(null);
    const [saving, setSaving] = useState(false);
    const [mySlots, setMySlots] = useState([]);
    const [propDate, setPropDate] = useState('');
    const [propFrom, setPropFrom] = useState('10:00');
    const [propTo, setPropTo] = useState('12:00');
    const [propVenue, setPropVenue] = useState('');

    const iAmSide = !!match?._iAmMatchSide
        || (match && mySideId && (match.p1Id === mySideId || match.p2Id === mySideId));
    const mySide = match && mySideId
        ? (match.p1Id === mySideId ? 'p1' : match.p2Id === mySideId ? 'p2' : null)
        : null;
    const oppSide = mySide === 'p1' ? 'p2' : mySide === 'p2' ? 'p1' : null;
    const isReady = match?.status === 'PENDING' && match?.p1Id && match?.p2Id;
    const canAct = iAmSide && isReady;

    useEffect(() => {
        if (!visible || !match) return;
        const s = match.scheduleData && typeof match.scheduleData === 'object'
            ? match.scheduleData
            : { availability: { p1: [], p2: [] }, proposals: [], agreed: null };
        setSchedule(s);
        if (mySide) setMySlots(Array.isArray(s.availability?.[mySide]) ? s.availability[mySide] : []);
        else setMySlots([]);
    }, [visible, match?.id, match?.scheduleData, mySide]);

    const agreedText = useMemo(() => formatAgreed(schedule?.agreed), [schedule?.agreed]);
    const oppSlots = oppSide ? (schedule?.availability?.[oppSide] || []) : [];
    const proposals = Array.isArray(schedule?.proposals) ? schedule.proposals : [];

    const toggleWeekday = (weekday) => {
        setMySlots(prev => {
            const exists = prev.some(s => s.weekday === weekday);
            if (exists) return prev.filter(s => s.weekday !== weekday);
            return [...prev, { weekday, timeFrom: '09:00', timeTo: '21:00' }];
        });
    };

    const updateSlotTime = (weekday, field, value) => {
        setMySlots(prev => prev.map(s => s.weekday === weekday ? { ...s, [field]: value } : s));
    };

    const saveAvailability = async () => {
        if (!tournament?.id || !match?.id) return;
        setSaving(true);
        try {
            const { data } = await api.patch(
                `/tournaments/${tournament.id}/matches/${match.id}/availability`,
                { slots: mySlots },
            );
            setSchedule(data.scheduleData);
            onRefresh?.();
            Alert.alert('', t.tournSchedAvailSaved || 'Müsaitlik kaydedildi');
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed || 'Hata');
        } finally {
            setSaving(false);
        }
    };

    const submitProposal = async () => {
        if (!propDate.trim() || !propFrom.trim() || !propTo.trim()) {
            Alert.alert('', t.tournSchedNeedDateTime || 'Tarih ve saat gerekli');
            return;
        }
        if (playersArrangeCourts && !propVenue.trim()) {
            Alert.alert('', t.tournSchedNeedVenue || 'Kort / mekan adı gerekli');
            return;
        }
        setSaving(true);
        try {
            const { data } = await api.post(
                `/tournaments/${tournament.id}/matches/${match.id}/schedule-propose`,
                {
                    date: propDate.trim(),
                    timeFrom: propFrom.trim(),
                    timeTo: propTo.trim(),
                    venueName: playersArrangeCourts ? propVenue.trim() : undefined,
                },
            );
            setSchedule(data.scheduleData);
            setPropVenue('');
            onRefresh?.();
            Alert.alert('', t.tournSchedProposed || 'Teklif gönderildi');
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed || 'Hata');
        } finally {
            setSaving(false);
        }
    };

    const agreeProposal = async (proposalId) => {
        setSaving(true);
        try {
            const { data } = await api.post(
                `/tournaments/${tournament.id}/matches/${match.id}/schedule-agree`,
                { proposalId },
            );
            setSchedule(data.scheduleData);
            onRefresh?.();
            Alert.alert('', t.tournSchedAgreedOk || 'Anlaşıldı');
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed || 'Hata');
        } finally {
            setSaving(false);
        }
    };

    const requestJoker = () => {
        if (!match || !tournament) return;
        const myJokerRequested = mySide === 'p1' ? match.p1JokerRequested : match.p2JokerRequested;
        const otherJokerRequested = mySide === 'p1' ? match.p2JokerRequested : match.p1JokerRequested;
        if (myJokerRequested) return;
        if (!otherJokerRequested && tournMyJokerUsed) {
            Alert.alert('', t.tournJokerAlreadyUsed || 'Joker hakkınızı bu turnuvada zaten kullandınız.');
            return;
        }
        const isPlayoffMatch = match.phase === 'PLAYOFF';
        const jokerLabel = isPlayoffMatch
            ? (otherJokerRequested ? '🩹 Karşılıklı Ek Süre' : '🩹 Maç Yarıda Kaldı')
            : (otherJokerRequested ? '🃏 Karşılıklı Joker' : '🃏 Joker');
        const confirmMsg = isPlayoffMatch
            ? (otherJokerRequested
                ? 'Rakibiniz süreyi zaten 7 gün uzattı. Onaylarsanız karşılıklı sayılır. Emin misiniz?'
                : 'Ek süre talep etmek istediğinizden emin misiniz? +7 gün, hakkınız tükenir.')
            : (otherJokerRequested
                ? 'Rakibiniz joker istedi. Onaylarsanız karşılıklı sayılır. Emin misiniz?'
                : 'Joker kullanmak istediğinizden emin misiniz? +7 gün, hakkınız tükenir.');
        Alert.alert(jokerLabel, confirmMsg, [
            { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
            {
                text: t.yesBtn || 'Evet',
                style: 'destructive',
                onPress: async () => {
                    try {
                        const { data } = await api.post(`/tournaments/${tournament.id}/matches/${match.id}/joker`);
                        await onRefresh?.();
                        Alert.alert(jokerLabel, data.message);
                    } catch (e) {
                        Alert.alert('', e?.response?.data?.message || t.actionFailed || 'Hata');
                    }
                },
            },
        ]);
    };

    if (!match) return null;

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: '#000000aa', justifyContent: 'flex-end' }}>
                <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
                <View style={{
                    maxHeight: '88%',
                    backgroundColor: colors.surface || '#0f172a',
                    borderTopLeftRadius: 20,
                    borderTopRightRadius: 20,
                    paddingHorizontal: 14,
                    paddingTop: 12,
                    paddingBottom: Platform.OS === 'ios' ? 28 : 16,
                    borderWidth: 1,
                    borderColor: '#334155',
                }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
                        <Text style={{ color: '#fff', fontSize: moderateScale(15), fontWeight: '800', flex: 1 }} numberOfLines={2}>
                            {match.p1Name || 'TBD'} vs {match.p2Name || 'TBD'}
                        </Text>
                        <TouchableOpacity onPress={onClose} hitSlop={12}>
                            <Text style={{ color: colors.textMuted, fontSize: 20 }}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
                        {/* Anlaşılan yer / zaman — herkese */}
                        <View style={{
                            backgroundColor: agreedText ? '#16a34a18' : '#1e293b',
                            borderRadius: 10,
                            padding: 10,
                            marginBottom: 12,
                            borderWidth: 1,
                            borderColor: agreedText ? '#16a34a50' : '#334155',
                        }}>
                            <Text style={{ color: agreedText ? '#4ade80' : colors.textMuted, fontSize: 11, fontWeight: '800', marginBottom: 4 }}>
                                {t.tournSchedAgreedTitle || 'Anlaşılan yer / zaman'}
                            </Text>
                            <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>
                                {agreedText || (t.tournSchedAgreedEmpty || 'Henüz anlaşılmadı')}
                            </Text>
                            {tournament?.location && !playersArrangeCourts ? (
                                <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 4 }}>
                                    {(t.tournSchedFixedVenue || 'Turnuva kortu')}: {tournament.location}
                                </Text>
                            ) : null}
                        </View>

                        {!canAct && !agreedText ? (
                            <Text style={{ color: colors.textMuted, fontSize: 12, marginBottom: 12 }}>
                                {t.tournSchedSpectatorHint || 'Eşleşen oyuncular yer ve zamanı birlikte seçer. Anlaşınca burada görünür.'}
                            </Text>
                        ) : null}

                        {canAct && (
                            <>
                                {/* Rakip müsaitliği */}
                                <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>
                                    {t.tournSchedOppAvail || 'Rakibin müsaitliği'}
                                </Text>
                                {oppSlots.length === 0 ? (
                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 10 }}>
                                        {t.tournSchedOppEmpty || 'Rakip henüz müsaitlik girmedi'}
                                    </Text>
                                ) : (
                                    <View style={{ marginBottom: 10, gap: 4 }}>
                                        {oppSlots.map((s, i) => (
                                            <Text key={i} style={{ color: '#94a3b8', fontSize: 12 }}>
                                                · {formatSlot(s, lang)}
                                            </Text>
                                        ))}
                                    </View>
                                )}

                                {/* Benim müsaitliğim */}
                                <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>
                                    {t.tournSchedMyAvail || 'Müsait gün / saatlerin'}
                                </Text>
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
                                    {WEEKDAYS.map(d => {
                                        const active = mySlots.some(s => s.weekday === d.key);
                                        return (
                                            <TouchableOpacity
                                                key={d.key}
                                                onPress={() => toggleWeekday(d.key)}
                                                style={{
                                                    paddingHorizontal: 10,
                                                    paddingVertical: 6,
                                                    borderRadius: 8,
                                                    backgroundColor: active ? infoColor : '#1e293b',
                                                    borderWidth: 1,
                                                    borderColor: active ? infoColor : '#334155',
                                                }}
                                            >
                                                <Text style={{ color: active ? '#fff' : '#94a3b8', fontSize: 11, fontWeight: '700' }}>
                                                    {dayLabel(d.key, lang)}
                                                </Text>
                                            </TouchableOpacity>
                                        );
                                    })}
                                </View>
                                {mySlots.filter(s => s.weekday != null).map(s => (
                                    <View key={s.weekday} style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                                        <Text style={{ color: '#94a3b8', width: 36, fontSize: 11, fontWeight: '700' }}>
                                            {dayLabel(s.weekday, lang)}
                                        </Text>
                                        <TextInput
                                            value={s.timeFrom}
                                            onChangeText={v => updateSlotTime(s.weekday, 'timeFrom', v)}
                                            placeholder="09:00"
                                            placeholderTextColor="#64748b"
                                            style={{ flex: 1, backgroundColor: '#1e293b', color: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#334155', fontSize: 12 }}
                                        />
                                        <TextInput
                                            value={s.timeTo}
                                            onChangeText={v => updateSlotTime(s.weekday, 'timeTo', v)}
                                            placeholder="21:00"
                                            placeholderTextColor="#64748b"
                                            style={{ flex: 1, backgroundColor: '#1e293b', color: '#fff', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 6, borderWidth: 1, borderColor: '#334155', fontSize: 12 }}
                                        />
                                    </View>
                                ))}
                                <TouchableOpacity
                                    disabled={saving}
                                    onPress={saveAvailability}
                                    style={{ backgroundColor: infoColor + '25', borderWidth: 1, borderColor: infoColor + '60', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 14, opacity: saving ? 0.6 : 1 }}
                                >
                                    {saving ? <ActivityIndicator color={infoColor} /> : (
                                        <Text style={{ color: infoColor, fontWeight: '800', fontSize: 13 }}>
                                            {t.tournSchedSaveAvail || 'Müsaitliği Kaydet'}
                                        </Text>
                                    )}
                                </TouchableOpacity>

                                {/* Teklif formu */}
                                <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>
                                    {t.tournSchedProposeTitle || 'Yer / zaman teklif et'}
                                </Text>
                                {playersArrangeCourts && (
                                    <TextInput
                                        value={propVenue}
                                        onChangeText={setPropVenue}
                                        placeholder={t.tournSchedVenuePh || 'Kort / mekan adı'}
                                        placeholderTextColor="#64748b"
                                        style={{ backgroundColor: '#1e293b', color: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 6, fontSize: 13 }}
                                    />
                                )}
                                <TextInput
                                    value={propDate}
                                    onChangeText={setPropDate}
                                    placeholder={t.tournSchedDatePh || 'Tarih (YYYY-MM-DD)'}
                                    placeholderTextColor="#64748b"
                                    style={{ backgroundColor: '#1e293b', color: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#334155', marginBottom: 6, fontSize: 13 }}
                                />
                                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 8 }}>
                                    <TextInput
                                        value={propFrom}
                                        onChangeText={setPropFrom}
                                        placeholder="10:00"
                                        placeholderTextColor="#64748b"
                                        style={{ flex: 1, backgroundColor: '#1e293b', color: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#334155', fontSize: 13 }}
                                    />
                                    <TextInput
                                        value={propTo}
                                        onChangeText={setPropTo}
                                        placeholder="12:00"
                                        placeholderTextColor="#64748b"
                                        style={{ flex: 1, backgroundColor: '#1e293b', color: '#fff', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: '#334155', fontSize: 13 }}
                                    />
                                </View>
                                <TouchableOpacity
                                    disabled={saving}
                                    onPress={submitProposal}
                                    style={{ backgroundColor: '#7c3aed25', borderWidth: 1, borderColor: '#7c3aed60', borderRadius: 10, paddingVertical: 10, alignItems: 'center', marginBottom: 14 }}
                                >
                                    <Text style={{ color: '#c4b5fd', fontWeight: '800', fontSize: 13 }}>
                                        {t.tournSchedSendPropose || 'Teklif Gönder'}
                                    </Text>
                                </TouchableOpacity>

                                {/* Teklif listesi */}
                                <Text style={{ color: '#e2e8f0', fontSize: 12, fontWeight: '800', marginBottom: 6 }}>
                                    {t.tournSchedProposals || 'Teklifler'}
                                </Text>
                                {proposals.length === 0 ? (
                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginBottom: 12 }}>
                                        {t.tournSchedNoProposals || 'Henüz teklif yok'}
                                    </Text>
                                ) : (
                                    proposals.slice().reverse().map(p => {
                                        const mine = p.side === mySide;
                                        return (
                                            <View key={p.id} style={{
                                                backgroundColor: '#1e293b',
                                                borderRadius: 10,
                                                padding: 10,
                                                marginBottom: 8,
                                                borderWidth: 1,
                                                borderColor: '#334155',
                                            }}>
                                                <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }}>
                                                    {[p.date, `${p.timeFrom}-${p.timeTo}`, p.venueName].filter(Boolean).join(' · ')}
                                                </Text>
                                                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>
                                                    {mine ? (t.tournSchedYourProposal || 'Senin teklifin') : (t.tournSchedOppProposal || 'Rakip teklifi')}
                                                </Text>
                                                {!mine && (
                                                    <TouchableOpacity
                                                        onPress={() => agreeProposal(p.id)}
                                                        style={{ marginTop: 8, backgroundColor: '#16a34a30', borderRadius: 8, paddingVertical: 8, alignItems: 'center', borderWidth: 1, borderColor: '#16a34a50' }}
                                                    >
                                                        <Text style={{ color: '#4ade80', fontWeight: '800', fontSize: 12 }}>
                                                            {t.tournSchedAgreeBtn || '✓ Anlaş'}
                                                        </Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        );
                                    })
                                )}
                            </>
                        )}

                        {/* Skor / gün uzat / joker — eşleşenler (+ sahip uzatma) */}
                        {isReady && (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6, marginBottom: 8 }}>
                                {(iAmSide || isCreator || myIsAdmin) && (
                                    <TouchableOpacity
                                        onPress={() => { onClose(); setTimeout(() => onOpenScore?.(match), 200); }}
                                        style={{ flexGrow: 1, backgroundColor: infoColor + '20', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: infoColor + '50', alignItems: 'center' }}
                                    >
                                        <Text style={{ color: infoColor, fontWeight: '800', fontSize: 13 }}>{t.enterScore || 'Skor Gir'}</Text>
                                    </TouchableOpacity>
                                )}
                                {(isCreator || myIsAdmin) && !tournament?.dayTrip && match.deadline && (
                                    <TouchableOpacity
                                        onPress={() => { onClose(); setTimeout(() => onRequestExtend?.(match), 200); }}
                                        style={{ flexGrow: 1, backgroundColor: '#0ea5e920', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: '#0ea5e950', alignItems: 'center' }}
                                    >
                                        <Text style={{ color: '#38bdf8', fontWeight: '800', fontSize: 13 }}>{t.tournExtendMatchBtn || 'Gün uzat'}</Text>
                                    </TouchableOpacity>
                                )}
                                {iAmSide && !tournament?.dayTrip && (
                                    <TouchableOpacity
                                        onPress={requestJoker}
                                        style={{ flexGrow: 1, backgroundColor: '#1e40af20', borderRadius: 10, paddingVertical: 12, paddingHorizontal: 10, borderWidth: 1, borderColor: '#1e40af60', alignItems: 'center' }}
                                    >
                                        <Text style={{ color: '#93c5fd', fontWeight: '800', fontSize: 13 }}>
                                            {match.phase === 'PLAYOFF'
                                                ? (t.tournSchedExtendReq || 'Ek süre talebi')
                                                : (t.tournSchedJoker || 'Joker / gün uzatma')}
                                        </Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}
