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
import Avatar from '../../components/Avatar';

const VARIANTS = ['klasik', 'esli_klasik', '101', 'esli_101'];
const VARIANT_FALLBACK = { klasik: 'Klasik Okey', esli_klasik: 'Eşli Klasik Okey', '101': '101', esli_101: 'Eşli 101' };
const DIFFICULTIES = [['easy', 'Kolay'], ['medium', 'Orta'], ['hard', 'Zor'], ['expert', 'Çok Zor']];

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

// Bir varyantın herkese-açık, henüz dolmamış masalarını 3'erli satırlar halinde
// listeler; boş koltuğa "Katıl", seyirciye açıksa "İzle" ile girilir — batak.js'teki
// BrowseTablesModal ile birebir aynı desen.
function BrowseTablesModal({ visible, variant, t, onClose, onJoined, onSpectate }) {
    const [tables, setTables] = useState([]);

    useEffect(() => {
        if (!visible || !variant) return;
        const socket = getSocket();
        socket?.emit('okey:listTables', { variant });
        const offList = onSocket('okey:tableList', (data) => { if (data.variant === variant) setTables(data.tables || []); });
        const offErr = onSocket('okey:error', (data) => Alert.alert('', data?.message || 'Bir hata oluştu.'));
        return () => {
            offList(); offErr();
            getSocket()?.emit('okey:unsubscribeLobby', { variant });
        };
    }, [visible, variant]);

    const join = (tableId) => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.okeyNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('okey:joinTable', { tableId });
        onJoined?.(tableId);
    };
    const spectate = (tableId) => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.okeyNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('okey:spectateTable', { tableId });
        onSpectate?.(tableId);
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.modalOverlay}>
                <View style={s.modalBox}>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={s.modalTitle}>{(t[`okeyVariant_${variant}`] || VARIANT_FALLBACK[variant] || '')} — {t.okeyBrowseTitle || 'Açık Masalar'}</Text>
                        {tables.length === 0 ? (
                            <Text style={s.emptyText}>{t.okeyBrowseEmpty || 'Şu an açık masa yok'}</Text>
                        ) : (
                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' }}>
                                {tables.map(item => {
                                    const filled = item.seats.filter(x => !x.open).length;
                                    return (
                                        <View key={item.tableId} style={s.tableCard}>
                                            <Text style={s.tableCardStake}>🪙 {item.betAmount}</Text>
                                            {item.ratingAmount > 0 && <Text style={s.tableCardRating}>⭐ {item.ratingAmount.toFixed(2)}</Text>}
                                            <View style={{ flexDirection: 'row' }}>
                                                {item.seats.filter(x => !x.open).map(x => <Avatar key={x.seat} user={x} size={18} />)}
                                            </View>
                                            <Text style={s.tableCardSeats}>{filled}/4</Text>
                                            <TouchableOpacity style={s.tableCardJoinBtn} onPress={() => join(item.tableId)} activeOpacity={0.85}>
                                                <Text style={s.tableCardJoinBtnText}>{t.okeyJoinBtn || 'Katıl'}</Text>
                                            </TouchableOpacity>
                                            {item.spectatorOpen && (
                                                <TouchableOpacity style={s.tableCardWatchBtn} onPress={() => spectate(item.tableId)} activeOpacity={0.85}>
                                                    <Text style={s.tableCardWatchBtnText}>👁️ {t.okeyWatchBtn || 'İzle'}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    );
                                })}
                            </View>
                        )}
                        <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', marginTop: 14 }}>
                            <Text style={{ color: colors.textMuted }}>{t.cancelBtn || 'Kapat'}</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

export default function OkeyHomeScreen({ navigation }) {
    const t = useT();
    const myId = useSelector(s => s.auth.user?.id);
    const myName = useSelector(s => s.auth.user?.fullName || s.auth.user?.username);
    const [mainTab, setMainTab] = useState('play'); // 'play' | 'events'
    const [createModalOpen, setCreateModalOpen] = useState(false);
    const [browseVariant, setBrowseVariant] = useState(null);
    const [joinCode, setJoinCode] = useState('');

    // undefined: bakiye/aktivite yükleniyor, null: aktivite henüz eklenmemiş, obje: eklenmiş
    const [interest, setInterest] = useState(undefined);
    const [addingActivity, setAddingActivity] = useState(false);
    const navigatedRef = useRef(false);

    const loadInterest = useCallback(() => {
        api.get('/interests/my')
            .then(({ data }) => setInterest((Array.isArray(data) ? data : []).find(i => i.category === 'GAMES' && i.subCategory === 'okey') || null))
            .catch(() => setInterest(null));
    }, []);
    useEffect(() => { loadInterest(); }, [loadInterest]);

    const addActivity = () => {
        setAddingActivity(true);
        api.post('/interests/add', { category: 'GAMES', subCategory: 'okey' })
            .then(loadInterest)
            .catch(() => Alert.alert('', 'Aktivite eklenemedi, tekrar deneyin.'))
            .finally(() => setAddingActivity(false));
    };

    useEffect(() => {
        const socket = getSocket();
        if (socket) socket.emit('okey:setUsername', myName);
    }, [myName]);

    useEffect(() => {
        const offMatched = onSocket('okey:matched', (data) => {
            if (navigatedRef.current) return;
            const mySeat = data.seats.find(s => s.userId === myId);
            if (!mySeat) return;
            navigatedRef.current = true;
            navigation.navigate('OkeyTable', { tableId: data.tableId });
        });
        const offError = onSocket('okey:error', (data) => {
            if (data?.code === 'ACTIVITY_REQUIRED') { setInterest(null); return; }
            if (data?.code === 'INSUFFICIENT_POINTS' || data?.code === 'INSUFFICIENT_RATING') { loadInterest(); }
            Alert.alert('', data?.message || (t.okeyError || 'Bir hata oluştu.'));
        });
        return () => { offMatched(); offError(); };
    }, [myId, navigation, t, loadInterest]);

    useFocusEffect(useCallback(() => { navigatedRef.current = false; }, []));

    const joinByCode = () => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.okeyNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        if (!joinCode.trim()) return;
        socket.emit('okey:joinByCode', { code: joinCode.trim() });
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
                interest === undefined ? (
                    <ActivityIndicator color={colors.purple} style={{ marginTop: 60 }} />
                ) : interest === null ? (
                    <View style={s.playWrap}>
                        <Text style={s.playEmoji}>🀄</Text>
                        <Text style={s.playTitle}>Okey oynamak için önce bu oyunu aktivite olarak ekle</Text>
                        <Text style={s.playDesc}>Eklediğinde 2000 puanla başlarsın. Bu aktiviteyi daha sonra silemezsin, sadece gizleyebilirsin.</Text>
                        <TouchableOpacity style={s.findBtn} onPress={addActivity} disabled={addingActivity} activeOpacity={0.85}>
                            <Text style={s.findBtnText}>{addingActivity ? '...' : 'Aktivitelerime Ekle ve Başla (2000 puan)'}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={s.playWrap} showsVerticalScrollIndicator={false}>
                        <View style={{ flexDirection: 'row', gap: 14 }}>
                            <Text style={s.balanceText}>🪙 {interest.walletPoints} puan</Text>
                            <Text style={s.ratingBalanceText}>⭐ {interest.skillRating?.toFixed(2)} derece</Text>
                        </View>

                        <TouchableOpacity style={s.createTableBtn} onPress={() => setCreateModalOpen(true)} activeOpacity={0.85}>
                            <Text style={s.createTableBtnText}>🎪 {t.okeyCreateTable || 'Masa Kur'}</Text>
                        </TouchableOpacity>

                        <View style={s.variantGrid}>
                            {VARIANTS.map(v => (
                                <TouchableOpacity key={v} style={s.variantBtn} onPress={() => setBrowseVariant(v)} activeOpacity={0.8}>
                                    <Text style={s.variantBtnText}>{t[`okeyVariant_${v}`] || VARIANT_FALLBACK[v]}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <CreateTableModal
                            visible={createModalOpen}
                            interest={interest}
                            t={t}
                            onClose={() => setCreateModalOpen(false)}
                        />
                        <BrowseTablesModal
                            visible={!!browseVariant}
                            variant={browseVariant}
                            t={t}
                            onClose={() => setBrowseVariant(null)}
                            onJoined={() => setBrowseVariant(null)}
                            onSpectate={(tableId) => { setBrowseVariant(null); navigation.navigate('OkeyTable', { tableId, spectating: true }); }}
                        />

                        <Text style={s.orText}>{t.okeyOr || 'veya'}</Text>
                        <View style={s.joinCodeRow}>
                            <TextInput
                                value={joinCode}
                                onChangeText={v => setJoinCode(v.toUpperCase())}
                                placeholder={t.okeyTableCode || 'Masa Kodu'}
                                placeholderTextColor={colors.textMuted}
                                autoCapitalize="characters"
                                maxLength={5}
                                style={s.joinCodeInput}
                            />
                            <TouchableOpacity style={s.joinCodeBtn} onPress={joinByCode} activeOpacity={0.85}>
                                <Text style={s.joinCodeBtnText}>{t.okeyJoinBtn || 'Katıl'}</Text>
                            </TouchableOpacity>
                        </View>
                    </ScrollView>
                )
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

// Adım adım (geri dönülebilir) masa kurma sihirbazı: varyant -> online/bot ->
// (bot ise zorluk, online ise derece aralığı -> puan bahsi -> ekstra derece bahsi) -> masayı kur.
// Online yolla kurulan masa her zaman `listed:true` — ilgili varyant sekmesinde herkese görünür.
function CreateTableModal({ visible, interest, t, onClose }) {
    const [step, setStep] = useState('variant');
    const [variant, setVariant] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const [difficultyConfirmed, setDifficultyConfirmed] = useState(false);
    const [ratingRangeMin, setRatingRangeMin] = useState('');
    const [ratingRangeMax, setRatingRangeMax] = useState('');
    const [betAmount, setBetAmount] = useState('100');
    const [wagerRating, setWagerRating] = useState(false);
    const [ratingAmount, setRatingAmount] = useState('0.10');
    const [spectatorOpen, setSpectatorOpen] = useState(false);

    useEffect(() => {
        if (visible) { setStep('variant'); setVariant(null); setDifficultyConfirmed(false); setSpectatorOpen(false); }
    }, [visible]);

    const isTeam = variant === 'esli_klasik' || variant === 'esli_101';
    const parsedBet = Math.max(0, Math.floor(Number(betAmount) || 0));
    const parsedRating = wagerRating ? Math.max(0, Number(ratingAmount) || 0) : 0;
    const parsedRangeMin = ratingRangeMin.trim() === '' ? null : Number(ratingRangeMin);
    const parsedRangeMax = ratingRangeMax.trim() === '' ? null : Number(ratingRangeMax);
    const canAfford = interest && interest.walletPoints >= parsedBet && interest.skillRating >= parsedRating && parsedBet > 0;

    const goVariant = (v) => { setVariant(v); setStep('opponent'); };
    const goOpponent = (kind) => setStep(kind === 'bot' ? 'difficulty' : 'range');

    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.okeyNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('okey:playVsBots', { difficulty });
        onClose();
    };
    const createTable = () => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.okeyNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('okey:createPrivateTable', {
            betAmount: parsedBet, ratingAmount: parsedRating,
            ratingRangeMin: parsedRangeMin, ratingRangeMax: parsedRangeMax,
            variant, listed: true, spectatorOpen,
        });
        onClose();
    };

    const BACK = { opponent: 'variant', difficulty: 'opponent', range: 'opponent', stake: 'range', rating: 'stake', spectator: 'rating' };
    const back = () => setStep(BACK[step] || 'variant');

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.modalOverlay}>
                <View style={s.modalBox}>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={s.modalTitle}>{t.okeyCreateTable || 'Masa Kur'}</Text>

                        {step === 'variant' && (
                            <>
                                <Text style={s.fieldLabel}>{t.okeyStepChooseVariant || 'Oyun türünü seç'}</Text>
                                {VARIANTS.map(v => (
                                    <TouchableOpacity key={v} style={s.variantOption} onPress={() => goVariant(v)} activeOpacity={0.85}>
                                        <Text style={s.variantOptionText}>{t[`okeyVariant_${v}`] || VARIANT_FALLBACK[v]}</Text>
                                    </TouchableOpacity>
                                ))}
                            </>
                        )}

                        {step === 'opponent' && (
                            <>
                                <Text style={s.fieldLabel}>{t.okeyStepChooseOpponent || 'Rakip türünü seç'}</Text>
                                <TouchableOpacity style={[s.privateBtn, { alignItems: 'center' }]} onPress={() => goOpponent('online')} activeOpacity={0.85}>
                                    <Text style={s.privateBtnText}>🌐 {t.okeyOnlinePlayers || 'Online Oyuncular'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.botBtn, { marginTop: 10, alignItems: 'center' }]} onPress={() => goOpponent('bot')} activeOpacity={0.85}>
                                    <Text style={s.botBtnText}>🤖 {t.okeyVsBot || 'Botla Oyna'}</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {step === 'difficulty' && (
                            <>
                                <Text style={s.fieldLabel}>{t.okeyStepDifficulty || 'Zorluk seç'}</Text>
                                {difficultyConfirmed ? (
                                    <TouchableOpacity style={s.difficultyConfirmedRow} onPress={() => setDifficultyConfirmed(false)} activeOpacity={0.85}>
                                        <Text style={s.difficultyConfirmedText}>
                                            {(t.okeyDifficultySelected || 'Zorluk: {level}').replace('{level}', DIFFICULTIES.find(([k]) => k === difficulty)?.[1])} ✓
                                        </Text>
                                        <Text style={s.difficultyChangeText}>{t.okeyChange || 'değiştir'}</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={s.difficultyRow}>
                                        {DIFFICULTIES.map(([k, label]) => (
                                            <TouchableOpacity key={k}
                                                style={[s.difficultyChip, difficulty === k && s.difficultyChipActive]}
                                                onPress={() => { setDifficulty(k); setDifficultyConfirmed(true); }} activeOpacity={0.8}>
                                                <Text style={[s.difficultyChipText, difficulty === k && s.difficultyChipTextActive]}>{label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                )}
                                <TouchableOpacity style={[s.botBtn, { marginTop: 12, alignItems: 'center' }]} onPress={startVsBots} activeOpacity={0.85}>
                                    <Text style={s.botBtnText}>🤖 {t.okeyStartVsBots || 'Botlarla Başla'}</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {step === 'range' && (
                            <>
                                <Text style={s.fieldLabel}>{t.okeyRatingRange || 'Rakip Derece Aralığı (isteğe bağlı)'}</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TextInput value={ratingRangeMin} onChangeText={setRatingRangeMin} placeholder="Min" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[s.freeInput, { flex: 1 }]} />
                                    <TextInput value={ratingRangeMax} onChangeText={setRatingRangeMax} placeholder="Max" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[s.freeInput, { flex: 1 }]} />
                                </View>
                                <TouchableOpacity style={s.submitBtn} onPress={() => setStep('stake')} activeOpacity={0.85}>
                                    <Text style={s.submitBtnText}>→ {t.okeyStake || 'Masaya Konacak Puan'}</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {step === 'stake' && (
                            <>
                                <Text style={s.fieldLabel}>{t.okeyStake || 'Masaya Konacak Puan'}</Text>
                                <TextInput value={betAmount} onChangeText={setBetAmount} placeholder="Örn. 250" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={s.freeInput} />
                                {interest && parsedBet > interest.walletPoints && (
                                    <Text style={s.inputWarn}>Bakiyende bu kadar puan yok ({interest.walletPoints} puanın var).</Text>
                                )}
                                <TouchableOpacity style={[s.submitBtn, parsedBet <= 0 && { opacity: 0.4 }]} onPress={() => setStep('rating')} disabled={parsedBet <= 0} activeOpacity={0.85}>
                                    <Text style={s.submitBtnText}>→ {t.okeyExtraRating || 'Ayrıca derece de bahse girsin'}</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {step === 'rating' && (
                            <>
                                <TouchableOpacity style={s.checkboxRow} onPress={() => setWagerRating(v => !v)} activeOpacity={0.8}>
                                    <View style={[s.checkbox, wagerRating && s.checkboxChecked]}>{wagerRating && <Text style={s.checkboxMark}>✓</Text>}</View>
                                    <Text style={s.checkboxLabel}>{t.okeyExtraRating || 'Ayrıca derece de bahse girsin'}</Text>
                                </TouchableOpacity>
                                {wagerRating && (
                                    <>
                                        <TextInput value={ratingAmount} onChangeText={setRatingAmount} placeholder="Örn. 0.25" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={s.freeInput} />
                                        {interest && parsedRating > interest.skillRating && (
                                            <Text style={s.inputWarn}>Bu kadar dereceye sahip değilsin ({interest.skillRating?.toFixed(2)}).</Text>
                                        )}
                                    </>
                                )}
                                <TouchableOpacity style={s.submitBtn} onPress={() => setStep('spectator')} activeOpacity={0.85}>
                                    <Text style={s.submitBtnText}>→ {t.okeySpectatorOpen || 'Seyirciye açık'}</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {step === 'spectator' && (
                            <>
                                <TouchableOpacity style={s.checkboxRow} onPress={() => setSpectatorOpen(v => !v)} activeOpacity={0.8}>
                                    <View style={[s.checkbox, spectatorOpen && s.checkboxChecked]}>{spectatorOpen && <Text style={s.checkboxMark}>✓</Text>}</View>
                                    <Text style={s.checkboxLabel}>{t.okeySpectatorOpen || 'Seyirciye açık'}</Text>
                                </TouchableOpacity>
                                <Text style={s.spectatorHint}>{t.okeySpectatorOpenHint || 'Oyuncular dışındakiler masayı izleyebilir ama kapalı taşları asla göremez'}</Text>
                                <Text style={s.payoutHint}>{isTeam ? (t.okeyPayoutTeam || 'Kazanan takım potun tamamını alır, aralarında %50-%50 paylaşır.') : (t.okeyPayoutSolo || '1. %75 alır, 2. amorti (koyduğunu geri alır), 3. ve 4. bahsini kaybeder.')}</Text>
                                <TouchableOpacity style={[s.findBtn, { alignItems: 'center' }, !canAfford && { opacity: 0.4 }]} onPress={createTable} disabled={!canAfford} activeOpacity={0.85}>
                                    <Text style={s.findBtnText}>{t.okeyCreateTable || 'Masayı Kur'} ({parsedBet} puan{parsedRating > 0 ? ` + ${parsedRating.toFixed(2)} derece` : ''})</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        {step !== 'variant' && (
                            <TouchableOpacity onPress={back} style={{ alignItems: 'center', marginTop: 14 }}>
                                <Text style={{ color: colors.textMuted }}>‹ {t.okeyBack || 'Geri'}</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', marginTop: 10 }}>
                            <Text style={{ color: colors.textMuted }}>{t.cancelBtn || 'Vazgeç'}</Text>
                        </TouchableOpacity>
                    </ScrollView>
                </View>
            </View>
        </Modal>
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

    playWrap: { flexGrow: 1, alignItems: 'center', paddingTop: 50, paddingHorizontal: 30, paddingBottom: 40 },
    balanceText: { color: '#fbbf24', fontSize: 15, fontWeight: '900', marginBottom: 10 },
    ratingBalanceText: { color: '#38bdf8', fontSize: 15, fontWeight: '900', marginBottom: 10 },
    playEmoji: { fontSize: 64, marginBottom: 12 },
    playTitle: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
    playDesc: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
    findBtn: { backgroundColor: colors.purple, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40, marginTop: 34 },
    findBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },

    orText: { color: colors.textMuted, fontSize: 12, fontWeight: '700', marginTop: 22, marginBottom: 14 },
    difficultyLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 8 },
    difficultyRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    difficultyChip: { paddingHorizontal: 13, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    difficultyChipActive: { backgroundColor: colors.purple + '22', borderColor: colors.purple },
    difficultyChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    difficultyChipTextActive: { color: colors.purpleLight || colors.purple },
    botBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.purple, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 34, marginTop: 18 },
    botBtnText: { color: colors.purpleLight || colors.purple, fontSize: 15, fontWeight: '900' },

    privateBtn: { backgroundColor: colors.purple, borderRadius: 14, paddingVertical: 13, paddingHorizontal: 30, marginTop: 4 },
    privateBtnText: { color: '#fff', fontSize: 14, fontWeight: '900' },

    createTableBtn: { backgroundColor: colors.amber || '#f59e0b', borderRadius: 16, paddingVertical: 14, width: '100%', maxWidth: 320, alignItems: 'center', marginTop: 4 },
    createTableBtnText: { color: '#111827', fontSize: 15, fontWeight: '900' },
    variantGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', width: '100%', maxWidth: 320, gap: 8, marginTop: 10 },
    variantBtn: { width: '48%', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
    variantBtnText: { color: '#fff', fontSize: 12, fontWeight: '800', textAlign: 'center' },
    variantOption: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 13, paddingHorizontal: 14, marginBottom: 8 },
    variantOptionText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    difficultyConfirmedRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.purple, borderRadius: 12, paddingVertical: 11, paddingHorizontal: 14 },
    difficultyConfirmedText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    difficultyChangeText: { color: colors.purpleLight || colors.purple, fontSize: 11, fontWeight: '700' },
    spectatorHint: { color: colors.textMuted, fontSize: 11, marginTop: 4, marginBottom: 8 },
    payoutHint: { color: '#fbbf24', fontSize: 11, fontWeight: '700', backgroundColor: '#f59e0b1a', borderRadius: 10, padding: 10, marginBottom: 14 },
    tableCard: { width: '31%', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, padding: 8, alignItems: 'center', gap: 4, marginBottom: 10 },
    tableCardStake: { color: '#fbbf24', fontSize: 13, fontWeight: '900' },
    tableCardRating: { color: '#38bdf8', fontSize: 10, fontWeight: '700' },
    tableCardSeats: { color: colors.textMuted, fontSize: 10, fontWeight: '700' },
    tableCardJoinBtn: { width: '100%', backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 2 },
    tableCardJoinBtnText: { color: '#fff', fontSize: 11, fontWeight: '800' },
    tableCardWatchBtn: { width: '100%', backgroundColor: colors.surface, borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 4 },
    tableCardWatchBtnText: { color: colors.textSecondary, fontSize: 11, fontWeight: '800' },
    inputWarn: { color: '#f87171', fontSize: 11, marginBottom: 6, textAlign: 'center' },
    freeInput: { width: '100%', maxWidth: 280, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 4 },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4 },
    checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: colors.purple, borderColor: colors.purple },
    checkboxMark: { color: '#fff', fontSize: 12, fontWeight: '900' },
    checkboxLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },
    joinCodeRow: { flexDirection: 'row', gap: 8, marginTop: 10, width: '100%', maxWidth: 280 },
    joinCodeInput: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
    joinCodeBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 16, justifyContent: 'center' },
    joinCodeBtnText: { color: '#fff', fontWeight: '800', fontSize: 13 },

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
