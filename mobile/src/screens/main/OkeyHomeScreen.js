import { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import { getSocket, onSocket } from '../../services/socket';
import CalendarPickerModal from '../../components/CalendarPickerModal';

function fmtDate(d) {
    if (!d) return null;
    return d.toISOString().slice(0, 10);
}

function EventCard({ item, myId, onJoin, onOpen, t }) {
    const isOwner = item.senderId === myId;
    const joinStatus = item._myJoinStatus;
    const participantCount = (Array.isArray(item.participants) ? item.participants.length : 0) + 1;
    return (
        <TouchableOpacity style={s.eventCard} onPress={() => onOpen(item)} activeOpacity={0.8}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={s.eventOwner} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>👤 {item.sender?.fullName || item.sender?.username}</Text>
                <Text style={s.eventCount}>👥 {participantCount}</Text>
            </View>
            {item.message ? <Text style={s.eventMessage} numberOfLines={3}>{item.message}</Text> : null}
            <View style={s.eventMetaRow}>
                {item.courtName ? <Text style={s.eventMeta}>📍 {item.courtName}</Text> : null}
                {item.location ? <Text style={s.eventMeta}>🏙️ {item.location}</Text> : null}
            </View>
            {(item.matchDate || item.matchTime) ? (
                <Text style={s.eventMeta}>
                    📅 {item.matchDate ? fmtDate(new Date(item.matchDate)) : (t.okeyFlexibleDate || 'Esnek tarih')}{item.matchTime ? ` · ${item.matchTime}` : ''}
                </Text>
            ) : null}
            {!isOwner && (
                <TouchableOpacity
                    style={[s.joinBtn, joinStatus && s.joinBtnDisabled]}
                    disabled={!!joinStatus}
                    onPress={(e) => { e.stopPropagation?.(); onJoin(item); }}
                >
                    <Text style={s.joinBtnText}>
                        {joinStatus === 'ACCEPTED' ? (t.eventJoined || '✓ Katıldınız')
                            : joinStatus === 'PENDING' ? (t.eventPending || '⏳ Bekleniyor')
                            : (t.eventJoinBtn || 'Katıl')}
                    </Text>
                </TouchableOpacity>
            )}
        </TouchableOpacity>
    );
}

export default function OkeyHomeScreen({ navigation }) {
    const t = useT();
    const myId = useSelector(s => s.auth.user?.id);
    const myName = useSelector(s => s.auth.user?.fullName || s.auth.user?.username);
    const [mainTab, setMainTab] = useState('play'); // 'play' | 'events'

    // ── Okey Oyna: eşleştirme ──────────────────────────────────────────────
    const [searching, setSearching] = useState(false);
    const [queuePos, setQueuePos] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const navigatedRef = useRef(false);

    useEffect(() => {
        const socket = getSocket();
        if (socket) socket.emit('okey:setUsername', myName);
    }, [myName]);

    useEffect(() => {
        const offQueued = onSocket('okey:queued', (data) => setQueuePos(data.position));
        const offMatched = onSocket('okey:matched', (data) => {
            if (navigatedRef.current) return;
            const mySeat = data.seats.find(s => s.userId === myId);
            if (!mySeat) return;
            navigatedRef.current = true;
            setSearching(false);
            navigation.navigate('OkeyTable', { tableId: data.tableId });
        });
        const offError = onSocket('okey:error', (data) => {
            setSearching(false);
            Alert.alert('', data?.message || (t.okeyError || 'Bir hata oluştu.'));
        });
        return () => { offQueued(); offMatched(); offError(); };
    }, [myId, navigation, t]);

    useFocusEffect(useCallback(() => { navigatedRef.current = false; }, []));

    const startSearch = () => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.okeyNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        setSearching(true);
        setQueuePos(null);
        socket.emit('okey:findMatch');
    };

    const cancelSearch = () => {
        getSocket()?.emit('okey:cancelFindMatch');
        setSearching(false);
        setQueuePos(null);
    };

    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.okeyNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('okey:playVsBots', { difficulty });
    };

    // ── Okey İlanı ──────────────────────────────────────────────────────────
    const [events, setEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [eventsLoaded, setEventsLoaded] = useState(false);
    const [showCreateEvent, setShowCreateEvent] = useState(false);
    const [creatingEvent, setCreatingEvent] = useState(false);
    const [showEventDatePicker, setShowEventDatePicker] = useState(false);
    const EVENT_INIT = { message: '', venueName: '', city: '', date: null, time: '' };
    const [eventForm, setEventForm] = useState(EVENT_INIT);

    const loadEvents = useCallback(async () => {
        setEventsLoading(true);
        try {
            const { data } = await api.get('/rivals', { params: { category: 'GAMES', subCategory: 'okey' } });
            setEvents(Array.isArray(data) ? data : []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.okeyEventsLoadError || 'İlanlar yüklenemedi.');
        } finally {
            setEventsLoading(false);
            setEventsLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'events' && !eventsLoaded) loadEvents();
    }, [mainTab, eventsLoaded, loadEvents]);

    const submitEvent = async () => {
        if (!eventForm.message.trim()) return Alert.alert('', t.okeyEventMsgRequired || 'Açıklama girin.');
        setCreatingEvent(true);
        try {
            await api.post('/rivals', {
                category: 'GAMES', subCategory: 'okey',
                message: eventForm.message.trim(),
                courtName: eventForm.venueName.trim() || undefined,
                location: eventForm.city.trim() || undefined,
                flexibleSchedule: !eventForm.date,
                matchDate: eventForm.date ? eventForm.date.toISOString() : undefined,
                matchTime: eventForm.time.trim() || undefined,
            });
            setShowCreateEvent(false);
            setEventForm(EVENT_INIT);
            loadEvents();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.okeyEventCreateError || 'İlan oluşturulamadı.');
        } finally {
            setCreatingEvent(false);
        }
    };

    const joinEvent = async (item) => {
        try {
            await api.post(`/rivals/${item.id}/respond`, {});
            Alert.alert('', t.eventJoinSent || 'Katılım isteği gönderildi.');
            loadEvents();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.okeyJoinError || 'İstek gönderilemedi.');
        }
    };

    const openEvent = (item) => {
        navigation.navigate('SubCategory', { category: 'GAMES', sub: 'okey', initialTab: 'rivals', highlightRivalId: item.id });
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.okeyTitle || '🀄 Okey'}</Text>
            </View>

            <View style={s.mainTabRow}>
                {[
                    { id: 'play',   label: t.okeyTabPlay   || '🎮 Okey Oyna' },
                    { id: 'events', label: t.okeyTabEvents || '📋 Okey İlanı' },
                ].map(tb => (
                    <TouchableOpacity key={tb.id} onPress={() => setMainTab(tb.id)}
                        style={[s.mainTabBtn, mainTab === tb.id && s.mainTabBtnActive]}>
                        <Text style={[s.mainTabBtnText, mainTab === tb.id && s.mainTabBtnTextActive]}>{tb.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {mainTab === 'play' ? (
                <View style={s.playWrap}>
                    <Text style={s.playEmoji}>🀄</Text>
                    <Text style={s.playTitle}>{t.okeyPlayTitle || 'Gerçek Zamanlı Okey'}</Text>
                    <Text style={s.playDesc}>{t.okeyPlayDesc || '4 kişilik masaya otomatik eşleşerek uygulama içinde canlı Okey oyna.'}</Text>

                    {searching ? (
                        <View style={{ alignItems: 'center', marginTop: 30 }}>
                            <ActivityIndicator size="large" color={colors.purple} />
                            <Text style={s.searchingText}>
                                {t.okeySearching || 'Rakip aranıyor...'}{queuePos ? ` (${queuePos}/4)` : ''}
                            </Text>
                            <TouchableOpacity onPress={cancelSearch} style={s.cancelBtn}>
                                <Text style={s.cancelBtnText}>{t.cancelBtn || 'Vazgeç'}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <TouchableOpacity style={s.findBtn} onPress={startSearch} activeOpacity={0.85}>
                                <Text style={s.findBtnText}>{t.okeyFindMatch || '🔍 Rakip Ara'}</Text>
                            </TouchableOpacity>

                            <Text style={s.orText}>{t.okeyOr || 'veya'}</Text>

                            <Text style={s.difficultyLabel}>{t.okeyDifficultyLabel || 'Bot Zorluğu'}</Text>
                            <View style={s.difficultyRow}>
                                {[
                                    { id: 'easy',   label: t.okeyDifficultyEasy   || 'Kolay' },
                                    { id: 'medium', label: t.okeyDifficultyMedium || 'Orta' },
                                    { id: 'hard',   label: t.okeyDifficultyHard   || 'Zor' },
                                ].map(d => (
                                    <TouchableOpacity key={d.id}
                                        style={[s.difficultyChip, difficulty === d.id && s.difficultyChipActive]}
                                        onPress={() => setDifficulty(d.id)} activeOpacity={0.8}>
                                        <Text style={[s.difficultyChipText, difficulty === d.id && s.difficultyChipTextActive]}>{d.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity style={s.botBtn} onPress={startVsBots} activeOpacity={0.85}>
                                <Text style={s.botBtnText}>{t.okeyPlayVsBots || '🤖 Botlarla Oyna'}</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            ) : (
                <>
                    <View style={s.smallCreateRow}>
                        <TouchableOpacity style={s.smallCreateBtn} onPress={() => setShowCreateEvent(true)}>
                            <Text style={s.smallCreateBtnText}>{t.okeyCreateListingBtn || '+ İlan Oluştur'}</Text>
                        </TouchableOpacity>
                    </View>
                    {eventsLoading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                    ) : (
                        <FlatList
                            data={events}
                            keyExtractor={item => item.id}
                            contentContainerStyle={s.list}
                            ListEmptyComponent={eventsLoaded ? <Text style={s.emptyText}>{t.okeyNoEvents || 'Henüz ilan yok. İlk ilanı siz oluşturun!'}</Text> : null}
                            renderItem={({ item }) => <EventCard item={item} myId={myId} onJoin={joinEvent} onOpen={openEvent} t={t} />}
                        />
                    )}

                    <Modal visible={showCreateEvent} animationType="slide" transparent onRequestClose={() => setShowCreateEvent(false)}>
                        <View style={s.modalOverlay}>
                            <View style={s.modalBox}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <Text style={s.modalTitle}>{t.okeyCreateListingBtn || '📅 İlan Oluştur'}</Text>

                                    <Text style={s.fieldLabel}>{t.okeyEventMsgLabel || 'Açıklama *'}</Text>
                                    <TextInput
                                        value={eventForm.message}
                                        onChangeText={v => setEventForm(f => ({ ...f, message: v }))}
                                        placeholder={t.okeyEventMsgPh || 'Ör: Cumartesi akşamı Okey oynayacak 4. kişiyi arıyoruz.'}
                                        placeholderTextColor={colors.textMuted}
                                        style={[s.modalInput, { height: 80, textAlignVertical: 'top' }]}
                                        multiline
                                    />

                                    <Text style={s.fieldLabel}>{t.okeyVenueLabel || 'Mekan / Yer'}</Text>
                                    <TextInput
                                        value={eventForm.venueName}
                                        onChangeText={v => setEventForm(f => ({ ...f, venueName: v }))}
                                        placeholder={t.okeyVenuePh || 'Ör: Kadıköy Kıraathane'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.okeyCityLabel || 'Şehir'}</Text>
                                    <TextInput
                                        value={eventForm.city}
                                        onChangeText={v => setEventForm(f => ({ ...f, city: v }))}
                                        placeholder={t.okeyCityPh || 'Ör: İstanbul'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fieldLabel}>{t.okeyDateLabel || 'Tarih'}</Text>
                                            <TouchableOpacity style={s.modalInput} onPress={() => setShowEventDatePicker(true)}>
                                                <Text style={{ color: eventForm.date ? '#fff' : colors.textMuted }}>
                                                    {eventForm.date ? fmtDate(eventForm.date) : (t.okeyFlexibleDate || 'Esnek tarih')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fieldLabel}>{t.okeyTimeLabel || 'Saat'}</Text>
                                            <TextInput
                                                value={eventForm.time}
                                                onChangeText={v => setEventForm(f => ({ ...f, time: v }))}
                                                placeholder="20:00"
                                                placeholderTextColor={colors.textMuted}
                                                style={s.modalInput}
                                            />
                                        </View>
                                    </View>
                                    <CalendarPickerModal
                                        visible={showEventDatePicker}
                                        value={eventForm.date}
                                        onSelect={(d) => { setEventForm(f => ({ ...f, date: d })); setShowEventDatePicker(false); }}
                                        onClose={() => setShowEventDatePicker(false)}
                                    />

                                    <TouchableOpacity style={s.submitBtn} onPress={submitEvent} disabled={creatingEvent}>
                                        <Text style={s.submitBtnText}>{creatingEvent ? '…' : (t.okeyCreateListingBtn || 'İlan Oluştur')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowCreateEvent(false)} style={{ alignItems: 'center', marginTop: 10 }}>
                                        <Text style={{ color: colors.textMuted }}>{t.cancelBtn || 'Vazgeç'}</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>
                </>
            )}
        </View>
    );
}

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title: { color: '#fff', fontSize: 17, fontWeight: '900' },

    mainTabRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 8, marginTop: 12, marginBottom: 4 },
    mainTabBtn: { flex: 1, borderRadius: 20, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    mainTabBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
    mainTabBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '800' },
    mainTabBtnTextActive: { color: '#fff' },

    playWrap: { flex: 1, alignItems: 'center', paddingTop: 50, paddingHorizontal: 30 },
    playEmoji: { fontSize: 64, marginBottom: 12 },
    playTitle: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
    playDesc: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
    findBtn: { backgroundColor: colors.purple, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40, marginTop: 34 },
    findBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },
    searchingText: { color: colors.textSecondary, fontSize: 14, marginTop: 14, fontWeight: '700' },
    cancelBtn: { marginTop: 16, paddingVertical: 8, paddingHorizontal: 20 },
    cancelBtnText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },

    orText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 22, marginBottom: 14 },
    difficultyLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 8 },
    difficultyRow: { flexDirection: 'row', gap: 8 },
    difficultyChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    difficultyChipActive: { backgroundColor: colors.purple + '22', borderColor: colors.purple },
    difficultyChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    difficultyChipTextActive: { color: colors.purpleLight || colors.purple },
    botBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.purple, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 34, marginTop: 18 },
    botBtnText: { color: colors.purpleLight || colors.purple, fontSize: 15, fontWeight: '900' },

    smallCreateRow: { paddingHorizontal: 12, paddingTop: 10, alignItems: 'flex-end' },
    smallCreateBtn: { backgroundColor: colors.purple, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
    smallCreateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

    list: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 30 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30 },

    eventCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10 },
    eventOwner: { color: '#fff', fontSize: 12, fontWeight: '800', flex: 1 },
    eventCount: { color: colors.textMuted, fontSize: 11 },
    eventMessage: { color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 18 },
    eventMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
    eventMeta: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
    joinBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8 },
    joinBtnDisabled: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

    modalOverlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 30, maxHeight: '88%' },
    modalTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 10 },
    fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4, marginTop: 8 },
    modalInput: { backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 13, justifyContent: 'center' },
    submitBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
    submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
