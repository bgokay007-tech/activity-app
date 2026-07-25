import { useState, useEffect, useCallback, useRef } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, Image,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Modal, ScrollView,
} from 'react-native';
import { useSelector } from 'react-redux';
import { useFocusEffect } from '@react-navigation/native';
import * as ImagePicker from 'expo-image-picker';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import { getSocket, onSocket } from '../../services/socket';
import CalendarPickerModal from '../../components/CalendarPickerModal';
import Avatar from '../../components/Avatar';

const VARIANTS = ['ihaleli', 'esli_ihaleli', 'herkes_kendine', 'gomme'];
const VARIANT_FALLBACK = { ihaleli: 'İhaleli Batak', esli_ihaleli: 'Eşli İhaleli Batak', herkes_kendine: 'Herkes Kendine Batak', gomme: 'Gömmeli Batak' };
const DIFFICULTIES = [['easy', 'Kolay'], ['medium', 'Orta'], ['hard', 'Zor']];
const noEmojiStr = (str) => (str || '').replace(/^\S+\s+/, '');

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
                    📅 {item.matchDate ? fmtDate(new Date(item.matchDate)) : (t.batakFlexibleDate || 'Esnek tarih')}{item.matchTime ? ` · ${item.matchTime}` : ''}
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

export default function BatakHomeScreen({ navigation }) {
    const t = useT();
    const myId = useSelector(s => s.auth.user?.id);
    const myName = useSelector(s => s.auth.user?.fullName || s.auth.user?.username);
    const [mainTab, setMainTab] = useState('play'); // 'play' | 'events' | 'turnuva' | 'medya'
    const [createModalOpen, setCreateModalOpen] = useState(false);

    // undefined: bakiye/aktivite yükleniyor, null: aktivite henüz eklenmemiş, obje: eklenmiş
    const [interest, setInterest] = useState(undefined);
    const [addingActivity, setAddingActivity] = useState(false);
    const navigatedRef = useRef(false);

    const loadInterest = useCallback(() => {
        api.get('/interests/my')
            .then(({ data }) => setInterest((Array.isArray(data) ? data : []).find(i => i.category === 'GAMES' && i.subCategory === 'batak') || null))
            .catch(() => setInterest(null));
    }, []);
    useEffect(() => { loadInterest(); }, [loadInterest]);

    const addActivity = () => {
        setAddingActivity(true);
        api.post('/interests/add', { category: 'GAMES', subCategory: 'batak' })
            .then(loadInterest)
            .catch(() => Alert.alert('', 'Aktivite eklenemedi, tekrar deneyin.'))
            .finally(() => setAddingActivity(false));
    };

    useEffect(() => {
        const socket = getSocket();
        if (socket) socket.emit('batak:setUsername', myName);
    }, [myName]);

    useEffect(() => {
        const offMatched = onSocket('batak:matched', (data) => {
            if (navigatedRef.current) return;
            const mySeat = data.seats.find(s => s.userId === myId);
            if (!mySeat) return;
            navigatedRef.current = true;
            navigation.navigate('BatakTable', { tableId: data.tableId });
        });
        const offError = onSocket('batak:error', (data) => {
            if (data?.code === 'ACTIVITY_REQUIRED') { setInterest(null); return; }
            if (data?.code === 'INSUFFICIENT_POINTS' || data?.code === 'INSUFFICIENT_RATING') { loadInterest(); }
            Alert.alert('', data?.message || (t.batakError || 'Bir hata oluştu.'));
        });
        return () => { offMatched(); offError(); };
    }, [myId, navigation, t, loadInterest]);

    useFocusEffect(useCallback(() => { navigatedRef.current = false; }, []));

    // ── Batak İlanı ──────────────────────────────────────────────────────────
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
            const { data } = await api.get('/rivals', { params: { category: 'GAMES', subCategory: 'batak' } });
            setEvents(Array.isArray(data) ? data : []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.batakEventsLoadError || 'İlanlar yüklenemedi.');
        } finally {
            setEventsLoading(false);
            setEventsLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'events' && !eventsLoaded) loadEvents();
    }, [mainTab, eventsLoaded, loadEvents]);

    const submitEvent = async () => {
        if (!eventForm.message.trim()) return Alert.alert('', t.batakEventMsgRequired || 'Açıklama girin.');
        setCreatingEvent(true);
        try {
            await api.post('/rivals', {
                category: 'GAMES', subCategory: 'batak',
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
            Alert.alert('', e?.response?.data?.message || t.batakEventCreateError || 'İlan oluşturulamadı.');
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
            Alert.alert('', e?.response?.data?.message || t.batakJoinError || 'İstek gönderilemedi.');
        }
    };

    const openEvent = (item) => {
        navigation.navigate('SubCategory', { category: 'GAMES', sub: 'batak', initialTab: 'rivals', highlightRivalId: item.id });
    };

    // ── Varyant lobisi: seçilen varyantın herkese açık masaları, sayfanın kendi
    // içinde (ayrı ekrana geçmeden) hemen altında listelenir ──────────────────
    const [selectedVariant, setSelectedVariant] = useState(null);
    const [lobbyTables, setLobbyTables] = useState([]);

    useEffect(() => {
        if (!selectedVariant) { setLobbyTables([]); return; }
        const socket = getSocket();
        socket?.emit('batak:listTables', { variant: selectedVariant });
        const offList = onSocket('batak:tableList', (data) => { if (data.variant === selectedVariant) setLobbyTables(data.tables || []); });
        return () => {
            offList();
            getSocket()?.emit('batak:unsubscribeLobby', { variant: selectedVariant });
        };
    }, [selectedVariant]);

    const toggleVariant = (v) => setSelectedVariant(sv => sv === v ? null : v);

    const joinLobbyTable = (tableId) => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.batakNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:joinTable', { tableId });
    };
    const spectateLobbyTable = (tableId) => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.batakNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:spectateTable', { tableId });
        navigation.navigate('BatakTable', { tableId, spectating: true });
    };

    // ── Batak Medyası ────────────────────────────────────────────────────────
    const [batakMedia, setBatakMedia] = useState([]);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [uploadingMedia, setUploadingMedia] = useState(false);

    const loadBatakMedia = useCallback(async () => {
        setMediaLoading(true);
        try {
            const { data } = await api.get('/posts', { params: { category: 'GAMES', subCategory: 'batak', mediaOnly: true, limit: 50 } });
            setBatakMedia(Array.isArray(data) ? data : (data.posts || []));
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.batakMediaLoadError || 'Medya yüklenemedi.');
        } finally {
            setMediaLoading(false);
            setMediaLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'medya' && !mediaLoaded) loadBatakMedia();
    }, [mainTab, mediaLoaded, loadBatakMedia]);

    const shareBatakMedia = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return Alert.alert('', t.galleryPermission || 'Galeri izni gerekli');
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        const isVideo = asset.type === 'video';
        setUploadingMedia(true);
        try {
            const form = new FormData();
            form.append('file', { uri: asset.uri, name: isVideo ? 'batak-media.mp4' : 'batak-media.jpg', type: isVideo ? 'video/mp4' : 'image/jpeg' });
            const { data: uploadData } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            await api.post('/posts', {
                category: 'GAMES', subCategory: 'batak', type: 'POST', content: '',
                ...(isVideo ? { videoUrl: uploadData.url } : { imageUrl: uploadData.url }),
            });
            loadBatakMedia();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.batakMediaShareError || 'Paylaşılamadı.');
        } finally {
            setUploadingMedia(false);
        }
    };

    return (
        <View style={s.root}>
            <StatusBar barStyle="light-content" />
            <View style={[s.header, { paddingTop: Platform.OS === 'ios' ? 54 : 36 }]}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={s.backBtn}>
                    <Text style={s.backBtnText}>‹</Text>
                </TouchableOpacity>
                <Text style={s.title}>{t.batakTitle || '🃏 Batak'}</Text>
            </View>

            <View style={s.mainTabRow}>
                {[
                    { id: 'play',    label: noEmojiStr(t.batakTabPlay   || '🎮 Batak Oyna') },
                    { id: 'events',  label: noEmojiStr(t.batakTabEvents || '📋 Batak İlanı') },
                    { id: 'turnuva', label: t.batakTabTurnuva || 'Turnuva' },
                    { id: 'medya',   label: t.batakTabMedya   || 'Medya' },
                ].map(tb => (
                    <TouchableOpacity key={tb.id} onPress={() => setMainTab(tb.id)}
                        style={[s.mainTabBtn, mainTab === tb.id && s.mainTabBtnActive]}>
                        <Text style={[s.mainTabBtnText, mainTab === tb.id && s.mainTabBtnTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{tb.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {mainTab === 'play' ? (
                interest === undefined ? (
                    <ActivityIndicator color={colors.purple} style={{ marginTop: 60 }} />
                ) : interest === null ? (
                    <View style={s.playWrap}>
                        <Text style={s.playEmoji}>🃏</Text>
                        <Text style={s.playTitle}>Batak oynamak için önce bu oyunu aktivite olarak ekle</Text>
                        <Text style={s.playDesc}>Eklediğinde 2000 puanla başlarsın. Bu aktiviteyi daha sonra silemezsin, sadece gizleyebilirsin.</Text>
                        <TouchableOpacity style={s.findBtn} onPress={addActivity} disabled={addingActivity} activeOpacity={0.85}>
                            <Text style={s.findBtnText}>{addingActivity ? '...' : 'Aktivitelerime Ekle ve Başla (2000 puan)'}</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <ScrollView contentContainerStyle={s.playWrapTop} showsVerticalScrollIndicator={false}>
                        <View style={s.masaKurRow}>
                            <TouchableOpacity style={s.createTableBtnSmall} onPress={() => setCreateModalOpen(true)} activeOpacity={0.85}>
                                <Text style={s.createTableBtnSmallText}>🎪 {t.batakCreateTable || 'Masa Kur'}</Text>
                            </TouchableOpacity>
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <Text style={s.balanceText}>🪙 {interest.walletPoints}</Text>
                                <Text style={s.ratingBalanceText}>⭐ {interest.skillRating?.toFixed(2)}</Text>
                            </View>
                        </View>

                        <View style={s.variantRow}>
                            {VARIANTS.map(v => (
                                <TouchableOpacity key={v} style={[s.variantBtn, selectedVariant === v && s.variantBtnActive]} onPress={() => toggleVariant(v)} activeOpacity={0.8}>
                                    <Text style={[s.variantBtnText, selectedVariant === v && s.variantBtnTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>{t[`batakVariant_${v}`] || VARIANT_FALLBACK[v]}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        {selectedVariant && (
                            lobbyTables.length === 0 ? (
                                <Text style={s.emptyText}>{t.batakBrowseEmpty || 'Şu an açık masa yok'}</Text>
                            ) : (
                                <View style={s.tableGrid}>
                                    {lobbyTables.map(item => {
                                        const filled = item.seats.filter(x => !x.open).length;
                                        return (
                                            <View key={item.tableId} style={s.tableCard}>
                                                <Text style={s.tableCardStake}>🪙 {item.betAmount}</Text>
                                                {item.ratingAmount > 0 && <Text style={s.tableCardRating}>⭐ {item.ratingAmount.toFixed(2)}</Text>}
                                                <View style={{ flexDirection: 'row' }}>
                                                    {item.seats.filter(x => !x.open).map(x => <Avatar key={x.seat} user={x} size={16} />)}
                                                </View>
                                                <Text style={s.tableCardSeats}>{filled}/4</Text>
                                                <TouchableOpacity style={s.tableCardJoinBtn} onPress={() => joinLobbyTable(item.tableId)} activeOpacity={0.85}>
                                                    <Text style={s.tableCardJoinBtnText}>{t.batakJoinBtn || 'Katıl'}</Text>
                                                </TouchableOpacity>
                                                {item.spectatorOpen && (
                                                    <TouchableOpacity style={s.tableCardWatchBtn} onPress={() => spectateLobbyTable(item.tableId)} activeOpacity={0.85}>
                                                        <Text style={s.tableCardWatchBtnText}>👁️ {t.batakWatchBtn || 'İzle'}</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        );
                                    })}
                                </View>
                            )
                        )}

                        <CreateTableModal
                            visible={createModalOpen}
                            interest={interest}
                            t={t}
                            onClose={() => setCreateModalOpen(false)}
                        />
                    </ScrollView>
                )
            ) : mainTab === 'events' ? (
                <>
                    <View style={s.smallCreateRow}>
                        <TouchableOpacity style={s.smallCreateBtn} onPress={() => setShowCreateEvent(true)}>
                            <Text style={s.smallCreateBtnText}>{t.batakCreateListingBtn || '+ İlan Oluştur'}</Text>
                        </TouchableOpacity>
                    </View>
                    {eventsLoading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                    ) : (
                        <FlatList
                            data={events}
                            keyExtractor={item => item.id}
                            contentContainerStyle={s.list}
                            ListEmptyComponent={eventsLoaded ? <Text style={s.emptyText}>{t.batakNoEvents || 'Henüz ilan yok. İlk ilanı siz oluşturun!'}</Text> : null}
                            renderItem={({ item }) => <EventCard item={item} myId={myId} onJoin={joinEvent} onOpen={openEvent} t={t} />}
                        />
                    )}

                    <Modal visible={showCreateEvent} animationType="slide" transparent onRequestClose={() => setShowCreateEvent(false)}>
                        <View style={s.modalOverlay}>
                            <View style={s.modalBox}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <Text style={s.modalTitle}>{t.batakCreateListingBtn || '📅 İlan Oluştur'}</Text>

                                    <Text style={s.fieldLabel}>{t.batakEventMsgLabel || 'Açıklama *'}</Text>
                                    <TextInput
                                        value={eventForm.message}
                                        onChangeText={v => setEventForm(f => ({ ...f, message: v }))}
                                        placeholder={t.batakEventMsgPh || 'Ör: Cumartesi akşamı Batak oynayacak 4. kişiyi arıyoruz.'}
                                        placeholderTextColor={colors.textMuted}
                                        style={[s.modalInput, { height: 80, textAlignVertical: 'top' }]}
                                        multiline
                                    />

                                    <Text style={s.fieldLabel}>{t.batakVenueLabel || 'Mekan / Yer'}</Text>
                                    <TextInput
                                        value={eventForm.venueName}
                                        onChangeText={v => setEventForm(f => ({ ...f, venueName: v }))}
                                        placeholder={t.batakVenuePh || 'Ör: Kadıköy Kıraathane'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.batakCityLabel || 'Şehir'}</Text>
                                    <TextInput
                                        value={eventForm.city}
                                        onChangeText={v => setEventForm(f => ({ ...f, city: v }))}
                                        placeholder={t.batakCityPh || 'Ör: İstanbul'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fieldLabel}>{t.batakDateLabel || 'Tarih'}</Text>
                                            <TouchableOpacity style={s.modalInput} onPress={() => setShowEventDatePicker(true)}>
                                                <Text style={{ color: eventForm.date ? '#fff' : colors.textMuted }}>
                                                    {eventForm.date ? fmtDate(eventForm.date) : (t.batakFlexibleDate || 'Esnek tarih')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fieldLabel}>{t.batakTimeLabel || 'Saat'}</Text>
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
                                        <Text style={s.submitBtnText}>{creatingEvent ? '…' : (t.batakCreateListingBtn || 'İlan Oluştur')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowCreateEvent(false)} style={{ alignItems: 'center', marginTop: 10 }}>
                                        <Text style={{ color: colors.textMuted }}>{t.cancelBtn || 'Vazgeç'}</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>
                </>
            ) : mainTab === 'turnuva' ? (
                <View style={s.playWrap}>
                    <Text style={s.playEmoji}>🏆</Text>
                    <Text style={s.playTitle}>{t.batakTournamentTitle || 'Batak Turnuvası'}</Text>
                    <Text style={s.playDesc}>{t.batakTournamentComingSoon || 'Bu bölüm yakında aktif olacak.'}</Text>
                </View>
            ) : (
                <>
                    <View style={s.smallCreateRow}>
                        <TouchableOpacity style={s.smallCreateBtn} onPress={shareBatakMedia} disabled={uploadingMedia}>
                            <Text style={s.smallCreateBtnText}>{uploadingMedia ? '…' : (t.batakShareMediaBtn || '+ Paylaş')}</Text>
                        </TouchableOpacity>
                    </View>
                    {mediaLoading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                    ) : (
                        <FlatList
                            data={batakMedia}
                            keyExtractor={item => item.id}
                            numColumns={3}
                            contentContainerStyle={s.mediaGrid}
                            ListEmptyComponent={mediaLoaded ? <Text style={s.emptyText}>{t.batakNoMedia || 'Henüz medya paylaşılmamış.'}</Text> : null}
                            renderItem={({ item }) => (
                                <View style={s.mediaThumbWrap}>
                                    {item.videoUrl ? (
                                        <View style={[s.mediaThumb, s.rowArtFallback]}><Text style={{ fontSize: 20 }}>🎬</Text></View>
                                    ) : (
                                        <Image source={{ uri: item.imageUrl }} style={s.mediaThumb} />
                                    )}
                                </View>
                            )}
                        />
                    )}
                </>
            )}
        </View>
    );
}

// Tüm masa kurma ayarları (oyun türü, rakip türü, zorluk/derece aralığı,
// puan bahsi, ekstra derece bahsi, seyirciye açıklık) tek modalda birlikte
// gösterilir — adım adım sihirbaz yerine tek ekranda ayarlanıp kurulur.
function CreateTableModal({ visible, interest, t, onClose }) {
    const [variant, setVariant] = useState('ihaleli');
    const [opponentKind, setOpponentKind] = useState('online');
    const [difficulty, setDifficulty] = useState('medium');
    const [ratingRangeMin, setRatingRangeMin] = useState('');
    const [ratingRangeMax, setRatingRangeMax] = useState('');
    const [betAmount, setBetAmount] = useState('100');
    const [wagerRating, setWagerRating] = useState(false);
    const [ratingAmount, setRatingAmount] = useState('0.10');
    const [spectatorOpen, setSpectatorOpen] = useState(false);

    useEffect(() => {
        if (visible) {
            setVariant('ihaleli'); setOpponentKind('online'); setDifficulty('medium');
            setRatingRangeMin(''); setRatingRangeMax(''); setBetAmount('100');
            setWagerRating(false); setRatingAmount('0.10'); setSpectatorOpen(false);
        }
    }, [visible]);

    const isTeam = variant === 'esli_ihaleli';
    const parsedBet = Math.max(0, Math.floor(Number(betAmount) || 0));
    const parsedRating = wagerRating ? Math.max(0, Number(ratingAmount) || 0) : 0;
    const parsedRangeMin = ratingRangeMin.trim() === '' ? null : Number(ratingRangeMin);
    const parsedRangeMax = ratingRangeMax.trim() === '' ? null : Number(ratingRangeMax);
    const canAfford = interest && interest.walletPoints >= parsedBet && interest.skillRating >= parsedRating && parsedBet > 0;

    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.batakNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:playVsBots', { difficulty });
        onClose();
    };
    const createTable = () => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.batakNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('batak:createPrivateTable', {
            betAmount: parsedBet, ratingAmount: parsedRating,
            ratingRangeMin: parsedRangeMin, ratingRangeMax: parsedRangeMax,
            variant, listed: true, spectatorOpen,
        });
        onClose();
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.modalOverlay}>
                <View style={s.modalBox}>
                    <ScrollView showsVerticalScrollIndicator={false}>
                        <Text style={s.modalTitle}>{t.batakCreateTable || 'Masa Kur'}</Text>

                        <Text style={s.fieldLabel}>{t.batakStepChooseVariant || 'Oyun türü'}</Text>
                        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                            {VARIANTS.map(v => (
                                <TouchableOpacity key={v} style={[s.variantOption, variant === v && s.variantOptionActive]} onPress={() => setVariant(v)} activeOpacity={0.85}>
                                    <Text style={[s.variantOptionText, variant === v && s.variantOptionTextActive]}>{t[`batakVariant_${v}`] || VARIANT_FALLBACK[v]}</Text>
                                </TouchableOpacity>
                            ))}
                        </View>

                        <Text style={s.fieldLabel}>{t.batakStepChooseOpponent || 'Rakip türü'}</Text>
                        <View style={{ flexDirection: 'row', gap: 8 }}>
                            <TouchableOpacity style={[s.oppChip, opponentKind === 'online' && s.oppChipActive]} onPress={() => setOpponentKind('online')} activeOpacity={0.85}>
                                <Text style={[s.oppChipText, opponentKind === 'online' && s.oppChipTextActive]}>🌐 {t.batakOnlinePlayers || 'Online Oyuncular'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[s.oppChip, opponentKind === 'bot' && s.oppChipActive]} onPress={() => setOpponentKind('bot')} activeOpacity={0.85}>
                                <Text style={[s.oppChipText, opponentKind === 'bot' && s.oppChipTextActive]}>🤖 {t.batakVsBot || 'Botla Oyna'}</Text>
                            </TouchableOpacity>
                        </View>

                        {opponentKind === 'bot' ? (
                            <>
                                <Text style={s.fieldLabel}>{t.batakStepDifficulty || 'Zorluk'}</Text>
                                <View style={s.difficultyRow}>
                                    {DIFFICULTIES.map(([k, label]) => (
                                        <TouchableOpacity key={k}
                                            style={[s.difficultyChip, difficulty === k && s.difficultyChipActive]}
                                            onPress={() => setDifficulty(k)} activeOpacity={0.8}>
                                            <Text style={[s.difficultyChipText, difficulty === k && s.difficultyChipTextActive]}>{label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                <TouchableOpacity style={[s.botBtn, { marginTop: 12, alignItems: 'center' }]} onPress={startVsBots} activeOpacity={0.85}>
                                    <Text style={s.botBtnText}>🤖 {t.batakStartVsBots || 'Botlarla Başla'}</Text>
                                </TouchableOpacity>
                            </>
                        ) : (
                            <>
                                <Text style={s.fieldLabel}>{t.batakRatingRange || 'Rakip Derece Aralığı (isteğe bağlı)'}</Text>
                                <View style={{ flexDirection: 'row', gap: 8 }}>
                                    <TextInput value={ratingRangeMin} onChangeText={setRatingRangeMin} placeholder="Min" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[s.freeInput, { flex: 1 }]} />
                                    <TextInput value={ratingRangeMax} onChangeText={setRatingRangeMax} placeholder="Max" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={[s.freeInput, { flex: 1 }]} />
                                </View>

                                <Text style={s.fieldLabel}>{t.batakStake || 'Masaya Konacak Puan'}</Text>
                                <TextInput value={betAmount} onChangeText={setBetAmount} placeholder="Örn. 250" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={s.freeInput} />
                                {interest && parsedBet > interest.walletPoints && (
                                    <Text style={s.inputWarn}>Bakiyende bu kadar puan yok ({interest.walletPoints} puanın var).</Text>
                                )}

                                <TouchableOpacity style={s.checkboxRow} onPress={() => setWagerRating(v => !v)} activeOpacity={0.8}>
                                    <View style={[s.checkbox, wagerRating && s.checkboxChecked]}>{wagerRating && <Text style={s.checkboxMark}>✓</Text>}</View>
                                    <Text style={s.checkboxLabel}>{t.batakExtraRating || 'Ayrıca derece de bahse girsin'}</Text>
                                </TouchableOpacity>
                                {wagerRating && (
                                    <>
                                        <TextInput value={ratingAmount} onChangeText={setRatingAmount} placeholder="Örn. 0.25" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={s.freeInput} />
                                        {interest && parsedRating > interest.skillRating && (
                                            <Text style={s.inputWarn}>Bu kadar dereceye sahip değilsin ({interest.skillRating?.toFixed(2)}).</Text>
                                        )}
                                    </>
                                )}

                                <TouchableOpacity style={s.checkboxRow} onPress={() => setSpectatorOpen(v => !v)} activeOpacity={0.8}>
                                    <View style={[s.checkbox, spectatorOpen && s.checkboxChecked]}>{spectatorOpen && <Text style={s.checkboxMark}>✓</Text>}</View>
                                    <Text style={s.checkboxLabel}>{t.batakSpectatorOpen || 'Seyirciye açık'}</Text>
                                </TouchableOpacity>
                                <Text style={s.spectatorHint}>{t.batakSpectatorOpenHint || 'Oyuncular dışındakiler masayı izleyebilir ama kapalı kartları asla göremez'}</Text>
                                <Text style={s.payoutHint}>{isTeam ? (t.batakPayoutTeam || 'Kazanan takım potun tamamını alır, aralarında %50-%50 paylaşır.') : (t.batakPayoutSolo || '1. %75 alır, 2. amorti (koyduğunu geri alır), 3. ve 4. bahsini kaybeder.')}</Text>
                                <TouchableOpacity style={[s.findBtn, { alignItems: 'center' }, !canAfford && { opacity: 0.4 }]} onPress={createTable} disabled={!canAfford} activeOpacity={0.85}>
                                    <Text style={s.findBtnText}>{t.batakCreateTable || 'Masayı Kur'} ({parsedBet} puan{parsedRating > 0 ? ` + ${parsedRating.toFixed(2)} derece` : ''})</Text>
                                </TouchableOpacity>
                            </>
                        )}

                        <TouchableOpacity onPress={onClose} style={{ alignItems: 'center', marginTop: 14 }}>
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

    mainTabRow: { flexDirection: 'row', paddingHorizontal: 12, gap: 3, marginTop: 12, marginBottom: 4 },
    mainTabBtn: { flex: 1, borderRadius: 14, paddingVertical: 7, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    mainTabBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
    mainTabBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
    mainTabBtnTextActive: { color: '#fff' },

    playWrap: { flexGrow: 1, alignItems: 'center', paddingTop: 50, paddingHorizontal: 30, paddingBottom: 40 },
    playWrapTop: { flexGrow: 1, paddingTop: 14, paddingHorizontal: 14, paddingBottom: 40 },
    masaKurRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 },
    balanceText: { color: '#fbbf24', fontSize: 13, fontWeight: '900' },
    ratingBalanceText: { color: '#38bdf8', fontSize: 13, fontWeight: '900' },
    playEmoji: { fontSize: 64, marginBottom: 12 },
    playTitle: { color: '#fff', fontSize: 20, fontWeight: '900', textAlign: 'center' },
    playDesc: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 8, lineHeight: 19 },
    findBtn: { backgroundColor: colors.purple, borderRadius: 16, paddingVertical: 16, paddingHorizontal: 40, marginTop: 34 },
    findBtnText: { color: '#fff', fontSize: 16, fontWeight: '900' },

    difficultyRow: { flexDirection: 'row', gap: 8 },
    difficultyChip: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 12, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    difficultyChipActive: { backgroundColor: colors.purple + '22', borderColor: colors.purple },
    difficultyChipText: { color: colors.textMuted, fontSize: 13, fontWeight: '700' },
    difficultyChipTextActive: { color: colors.purpleLight || colors.purple },
    botBtn: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.purple, borderRadius: 16, paddingVertical: 14, paddingHorizontal: 34, marginTop: 18 },
    botBtnText: { color: colors.purpleLight || colors.purple, fontSize: 15, fontWeight: '900' },

    createTableBtn: { backgroundColor: colors.amber || '#f59e0b', borderRadius: 16, paddingVertical: 14, width: '100%', maxWidth: 320, alignItems: 'center', marginTop: 4 },
    createTableBtnText: { color: '#111827', fontSize: 15, fontWeight: '900' },
    createTableBtnSmall: { backgroundColor: colors.amber || '#f59e0b', borderRadius: 12, paddingVertical: 9, paddingHorizontal: 16 },
    createTableBtnSmallText: { color: '#111827', fontSize: 12, fontWeight: '900' },
    variantRow: { flexDirection: 'row', gap: 6, marginBottom: 14 },
    variantBtn: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 4, alignItems: 'center' },
    variantBtnActive: { backgroundColor: colors.purple + '22', borderColor: colors.purple },
    variantBtnText: { color: '#fff', fontSize: 10, fontWeight: '800', textAlign: 'center' },
    variantBtnTextActive: { color: colors.purpleLight || colors.purple },
    tableGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
    tableCard: { width: '23%', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, padding: 6, alignItems: 'center', gap: 3, marginBottom: 8 },
    tableCardStake: { color: '#fbbf24', fontSize: 11, fontWeight: '900' },
    tableCardRating: { color: '#38bdf8', fontSize: 9, fontWeight: '700' },
    tableCardSeats: { color: colors.textMuted, fontSize: 9, fontWeight: '700' },
    tableCardJoinBtn: { width: '100%', backgroundColor: colors.purple, borderRadius: 6, paddingVertical: 5, alignItems: 'center', marginTop: 2 },
    tableCardJoinBtnText: { color: '#fff', fontSize: 10, fontWeight: '800' },
    tableCardWatchBtn: { width: '100%', backgroundColor: colors.surface, borderRadius: 6, paddingVertical: 5, alignItems: 'center', marginTop: 3 },
    tableCardWatchBtnText: { color: colors.textSecondary, fontSize: 10, fontWeight: '800' },
    variantOption: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 14 },
    variantOptionActive: { backgroundColor: colors.purple + '22', borderColor: colors.purple },
    variantOptionText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    variantOptionTextActive: { color: colors.purpleLight || colors.purple },
    oppChip: { flex: 1, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingVertical: 11, alignItems: 'center' },
    oppChipActive: { backgroundColor: colors.purple + '22', borderColor: colors.purple },
    oppChipText: { color: '#fff', fontSize: 13, fontWeight: '800' },
    oppChipTextActive: { color: colors.purpleLight || colors.purple },
    spectatorHint: { color: colors.textMuted, fontSize: 11, marginTop: 4, marginBottom: 8 },
    payoutHint: { color: '#fbbf24', fontSize: 11, fontWeight: '700', backgroundColor: '#f59e0b1a', borderRadius: 10, padding: 10, marginBottom: 14 },
    inputWarn: { color: '#f87171', fontSize: 11, marginBottom: 6, textAlign: 'center' },
    freeInput: { width: '100%', maxWidth: 280, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 14, fontWeight: '700', marginBottom: 4 },
    checkboxRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, marginBottom: 4 },
    checkbox: { width: 18, height: 18, borderRadius: 4, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
    checkboxChecked: { backgroundColor: colors.purple, borderColor: colors.purple },
    checkboxMark: { color: '#fff', fontSize: 12, fontWeight: '900' },
    checkboxLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700' },

    smallCreateRow: { paddingHorizontal: 12, paddingTop: 10, alignItems: 'flex-end' },
    smallCreateBtn: { backgroundColor: colors.purple, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
    smallCreateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

    list: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 30 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30 },

    mediaGrid: { padding: 4 },
    mediaThumbWrap: { flex: 1 / 3, aspectRatio: 1, padding: 2 },
    mediaThumb: { width: '100%', height: '100%', borderRadius: 6, backgroundColor: colors.surface2 },
    rowArtFallback: { alignItems: 'center', justifyContent: 'center' },

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
