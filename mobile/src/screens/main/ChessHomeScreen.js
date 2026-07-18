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
                    📅 {item.matchDate ? fmtDate(new Date(item.matchDate)) : (t.chessFlexibleDate || 'Esnek tarih')}{item.matchTime ? ` · ${item.matchTime}` : ''}
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

function ChessCourseCard({ item }) {
    const priceLabel = [
        item.individual && item.priceIndividual ? `Bireysel ${item.priceIndividual}₺` : null,
        item.group && item.priceGroup ? `Grup ${item.priceGroup}₺` : null,
    ].filter(Boolean).join(' · ');
    return (
        <View style={s.eventCard}>
            <Text style={s.eventOwner}>🎓 {item.user?.fullName || item.user?.username}</Text>
            <Text style={s.eventMessage}>{item.credentialLevel}{item.experience ? ` · ${item.experience} yıl deneyim` : ''}</Text>
            {item.description ? <Text style={s.eventMeta} numberOfLines={3}>{item.description}</Text> : null}
            <View style={s.eventMetaRow}>
                <Text style={s.eventMeta}>📍 {item.location}{item.city ? `, ${item.city}` : ''}</Text>
            </View>
            {priceLabel ? <Text style={s.eventMeta}>💰 {priceLabel}</Text> : null}
        </View>
    );
}

export default function ChessHomeScreen({ navigation }) {
    const t = useT();
    const myId = useSelector(s => s.auth.user?.id);
    const myName = useSelector(s => s.auth.user?.fullName || s.auth.user?.username);
    const [mainTab, setMainTab] = useState('play'); // 'play' | 'ilan' | 'kurs' | 'medya'

    // ── Satranç Oyna: eşleştirme ─────────────────────────────────────────────
    const [searching, setSearching] = useState(false);
    const [queuePos, setQueuePos] = useState(null);
    const [difficulty, setDifficulty] = useState('medium');
    const navigatedRef = useRef(false);

    useEffect(() => {
        const socket = getSocket();
        if (socket) socket.emit('chess:setUsername', myName);
    }, [myName]);

    useEffect(() => {
        const offQueued = onSocket('chess:queued', (data) => setQueuePos(data.position));
        const offMatched = onSocket('chess:matched', (data) => {
            if (navigatedRef.current) return;
            const isMine = data.players.some(p => p.userId === myId);
            if (!isMine) return;
            navigatedRef.current = true;
            setSearching(false);
            navigation.navigate('ChessTable', { tableId: data.tableId });
        });
        const offError = onSocket('chess:error', (data) => {
            setSearching(false);
            Alert.alert('', data?.message || (t.chessError || 'Bir hata oluştu.'));
        });
        return () => { offQueued(); offMatched(); offError(); };
    }, [myId, navigation, t]);

    useFocusEffect(useCallback(() => { navigatedRef.current = false; }, []));

    const startSearch = () => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.chessNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        setSearching(true);
        setQueuePos(null);
        socket.emit('chess:findMatch');
    };

    const cancelSearch = () => {
        getSocket()?.emit('chess:cancelFindMatch');
        setSearching(false);
        setQueuePos(null);
    };

    const startVsBots = () => {
        const socket = getSocket();
        if (!socket) return Alert.alert('', t.chessNoConnection || 'Bağlantı kurulamadı, tekrar deneyin.');
        socket.emit('chess:playVsBots', { difficulty });
    };

    // ── Satranç İlanı ─────────────────────────────────────────────────────────
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
            const { data } = await api.get('/rivals', { params: { category: 'GAMES', subCategory: 'chess' } });
            setEvents(Array.isArray(data) ? data : []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.chessEventsLoadError || 'İlanlar yüklenemedi.');
        } finally {
            setEventsLoading(false);
            setEventsLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'ilan' && !eventsLoaded) loadEvents();
    }, [mainTab, eventsLoaded, loadEvents]);

    const submitEvent = async () => {
        if (!eventForm.message.trim()) return Alert.alert('', t.chessEventMsgRequired || 'Açıklama girin.');
        setCreatingEvent(true);
        try {
            await api.post('/rivals', {
                category: 'GAMES', subCategory: 'chess',
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
            Alert.alert('', e?.response?.data?.message || t.chessEventCreateError || 'İlan oluşturulamadı.');
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
            Alert.alert('', e?.response?.data?.message || t.chessJoinError || 'İstek gönderilemedi.');
        }
    };

    const openEvent = (item) => {
        navigation.navigate('SubCategory', { category: 'GAMES', sub: 'chess', initialTab: 'rivals', highlightRivalId: item.id });
    };

    // ── Satranç Kursları ──────────────────────────────────────────────────────
    const [chessCourses, setChessCourses] = useState([]);
    const [coursesLoading, setCoursesLoading] = useState(false);
    const [coursesLoaded, setCoursesLoaded] = useState(false);
    const [showCreateCourse, setShowCreateCourse] = useState(false);
    const [creatingCourse, setCreatingCourse] = useState(false);
    const COURSE_INIT = { credentialLevel: '', location: '', city: '', description: '', individual: true, group: false, priceIndividual: '', priceGroup: '' };
    const [courseForm, setCourseForm] = useState(COURSE_INIT);

    const loadChessCourses = useCallback(async () => {
        setCoursesLoading(true);
        try {
            const { data } = await api.get('/coaches', { params: { category: 'GAMES', subCategory: 'chess' } });
            setChessCourses(Array.isArray(data) ? data : []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.chessCoursesLoadError || 'Kurslar yüklenemedi.');
        } finally {
            setCoursesLoading(false);
            setCoursesLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'kurs' && !coursesLoaded) loadChessCourses();
    }, [mainTab, coursesLoaded, loadChessCourses]);

    const submitChessCourse = async () => {
        if (!courseForm.credentialLevel.trim() || !courseForm.location.trim()) {
            return Alert.alert('', t.chessCourseRequired || 'Uzmanlık/seviye ve konum zorunludur.');
        }
        setCreatingCourse(true);
        try {
            await api.post('/coaches', {
                category: 'GAMES', subCategory: 'chess',
                credentialLevel: courseForm.credentialLevel.trim(),
                location: courseForm.location.trim(),
                city: courseForm.city.trim() || undefined,
                description: courseForm.description.trim() || undefined,
                individual: courseForm.individual,
                group: courseForm.group,
                priceIndividual: courseForm.priceIndividual ? parseInt(courseForm.priceIndividual, 10) : undefined,
                priceGroup: courseForm.priceGroup ? parseInt(courseForm.priceGroup, 10) : undefined,
            });
            setShowCreateCourse(false);
            setCourseForm(COURSE_INIT);
            loadChessCourses();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.chessCourseCreateError || 'Kurs oluşturulamadı.');
        } finally {
            setCreatingCourse(false);
        }
    };

    // ── Satranç Medyası ───────────────────────────────────────────────────────
    const [chessMedia, setChessMedia] = useState([]);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [uploadingMedia, setUploadingMedia] = useState(false);

    const loadChessMedia = useCallback(async () => {
        setMediaLoading(true);
        try {
            const { data } = await api.get('/posts', { params: { category: 'GAMES', subCategory: 'chess', mediaOnly: true, limit: 50 } });
            setChessMedia(Array.isArray(data) ? data : (data.posts || []));
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.chessMediaLoadError || 'Medya yüklenemedi.');
        } finally {
            setMediaLoading(false);
            setMediaLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'medya' && !mediaLoaded) loadChessMedia();
    }, [mainTab, mediaLoaded, loadChessMedia]);

    const shareChessMedia = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return Alert.alert('', t.galleryPermission || 'Galeri izni gerekli');
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        const isVideo = asset.type === 'video';
        setUploadingMedia(true);
        try {
            const form = new FormData();
            form.append('file', { uri: asset.uri, name: isVideo ? 'chess-media.mp4' : 'chess-media.jpg', type: isVideo ? 'video/mp4' : 'image/jpeg' });
            const { data: uploadData } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            await api.post('/posts', {
                category: 'GAMES', subCategory: 'chess', type: 'POST', content: '',
                ...(isVideo ? { videoUrl: uploadData.url } : { imageUrl: uploadData.url }),
            });
            loadChessMedia();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.chessMediaShareError || 'Paylaşılamadı.');
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
                <Text style={s.title}>{t.chessTitle || '♞ Satranç'}</Text>
            </View>

            <View style={s.mainTabRow}>
                {[
                    { id: 'play',  label: t.chessTabPlay  || '🎮 Oyna' },
                    { id: 'ilan',  label: t.chessTabIlan   || '📋 İlan' },
                    { id: 'kurs',  label: t.chessTabKurs   || '🎓 Kurs' },
                    { id: 'medya', label: t.chessTabMedya  || '📷 Medya' },
                ].map(tb => (
                    <TouchableOpacity key={tb.id} onPress={() => setMainTab(tb.id)}
                        style={[s.mainTabBtn, mainTab === tb.id && s.mainTabBtnActive]}>
                        <Text style={[s.mainTabBtnText, mainTab === tb.id && s.mainTabBtnTextActive]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75}>{tb.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {mainTab === 'play' ? (
                <View style={s.playWrap}>
                    <Text style={s.playEmoji}>♞</Text>
                    <Text style={s.playTitle}>{t.chessPlayTitle || 'Gerçek Zamanlı Satranç'}</Text>
                    <Text style={s.playDesc}>{t.chessPlayDesc || 'Bir rakiple otomatik eşleşerek uygulama içinde canlı satranç oyna.'}</Text>

                    {searching ? (
                        <View style={{ alignItems: 'center', marginTop: 30 }}>
                            <ActivityIndicator size="large" color={colors.purple} />
                            <Text style={s.searchingText}>
                                {t.chessSearching || 'Rakip aranıyor...'}{queuePos ? ` (${queuePos}/2)` : ''}
                            </Text>
                            <TouchableOpacity onPress={cancelSearch} style={s.cancelBtn}>
                                <Text style={s.cancelBtnText}>{t.cancelBtn || 'Vazgeç'}</Text>
                            </TouchableOpacity>
                        </View>
                    ) : (
                        <>
                            <TouchableOpacity style={s.findBtn} onPress={startSearch} activeOpacity={0.85}>
                                <Text style={s.findBtnText}>{t.chessFindMatch || '🔍 Rakip Ara'}</Text>
                            </TouchableOpacity>

                            <Text style={s.orText}>{t.chessOr || 'veya'}</Text>

                            <Text style={s.difficultyLabel}>{t.chessDifficultyLabel || 'Bot Zorluğu'}</Text>
                            <View style={s.difficultyRow}>
                                {[
                                    { id: 'easy',   label: t.chessDifficultyEasy   || 'Kolay' },
                                    { id: 'medium', label: t.chessDifficultyMedium || 'Orta' },
                                    { id: 'hard',   label: t.chessDifficultyHard   || 'Zor' },
                                ].map(d => (
                                    <TouchableOpacity key={d.id}
                                        style={[s.difficultyChip, difficulty === d.id && s.difficultyChipActive]}
                                        onPress={() => setDifficulty(d.id)} activeOpacity={0.8}>
                                        <Text style={[s.difficultyChipText, difficulty === d.id && s.difficultyChipTextActive]}>{d.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            <TouchableOpacity style={s.botBtn} onPress={startVsBots} activeOpacity={0.85}>
                                <Text style={s.botBtnText}>{t.chessPlayVsBots || '🤖 Botla Oyna'}</Text>
                            </TouchableOpacity>
                        </>
                    )}
                </View>
            ) : mainTab === 'ilan' ? (
                <>
                    <View style={s.smallCreateRow}>
                        <TouchableOpacity style={s.smallCreateBtn} onPress={() => setShowCreateEvent(true)}>
                            <Text style={s.smallCreateBtnText}>{t.chessCreateListingBtn || '+ İlan Oluştur'}</Text>
                        </TouchableOpacity>
                    </View>
                    {eventsLoading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                    ) : (
                        <FlatList
                            data={events}
                            keyExtractor={item => item.id}
                            contentContainerStyle={s.list}
                            ListEmptyComponent={eventsLoaded ? <Text style={s.emptyText}>{t.chessNoEvents || 'Henüz ilan yok. İlk ilanı siz oluşturun!'}</Text> : null}
                            renderItem={({ item }) => <EventCard item={item} myId={myId} onJoin={joinEvent} onOpen={openEvent} t={t} />}
                        />
                    )}

                    <Modal visible={showCreateEvent} animationType="slide" transparent onRequestClose={() => setShowCreateEvent(false)}>
                        <View style={s.modalOverlay}>
                            <View style={s.modalBox}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <Text style={s.modalTitle}>{t.chessCreateListingBtn || '📅 İlan Oluştur'}</Text>

                                    <Text style={s.fieldLabel}>{t.chessEventMsgLabel || 'Açıklama *'}</Text>
                                    <TextInput
                                        value={eventForm.message}
                                        onChangeText={v => setEventForm(f => ({ ...f, message: v }))}
                                        placeholder={t.chessEventMsgPh || 'Ör: Cumartesi akşamı satranç oynayacak rakip arıyorum.'}
                                        placeholderTextColor={colors.textMuted}
                                        style={[s.modalInput, { height: 80, textAlignVertical: 'top' }]}
                                        multiline
                                    />

                                    <Text style={s.fieldLabel}>{t.chessVenueLabel || 'Mekan / Yer'}</Text>
                                    <TextInput
                                        value={eventForm.venueName}
                                        onChangeText={v => setEventForm(f => ({ ...f, venueName: v }))}
                                        placeholder={t.chessVenuePh || 'Ör: Kadıköy Kıraathane'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.chessCityLabel || 'Şehir'}</Text>
                                    <TextInput
                                        value={eventForm.city}
                                        onChangeText={v => setEventForm(f => ({ ...f, city: v }))}
                                        placeholder={t.chessCityPh || 'Ör: İstanbul'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fieldLabel}>{t.chessDateLabel || 'Tarih'}</Text>
                                            <TouchableOpacity style={s.modalInput} onPress={() => setShowEventDatePicker(true)}>
                                                <Text style={{ color: eventForm.date ? '#fff' : colors.textMuted }}>
                                                    {eventForm.date ? fmtDate(eventForm.date) : (t.chessFlexibleDate || 'Esnek tarih')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fieldLabel}>{t.chessTimeLabel || 'Saat'}</Text>
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
                                        <Text style={s.submitBtnText}>{creatingEvent ? '…' : (t.chessCreateListingBtn || 'İlan Oluştur')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowCreateEvent(false)} style={{ alignItems: 'center', marginTop: 10 }}>
                                        <Text style={{ color: colors.textMuted }}>{t.cancelBtn || 'Vazgeç'}</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>
                </>
            ) : mainTab === 'kurs' ? (
                <>
                    <View style={s.smallCreateRow}>
                        <TouchableOpacity style={s.smallCreateBtn} onPress={() => setShowCreateCourse(true)}>
                            <Text style={s.smallCreateBtnText}>{t.chessCreateCourseBtn || '+ Kurs Oluştur'}</Text>
                        </TouchableOpacity>
                    </View>
                    {coursesLoading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                    ) : (
                        <FlatList
                            data={chessCourses}
                            keyExtractor={item => item.id}
                            contentContainerStyle={s.list}
                            ListEmptyComponent={coursesLoaded ? <Text style={s.emptyText}>{t.chessNoCourses || 'Henüz kurs yok.'}</Text> : null}
                            renderItem={({ item }) => <ChessCourseCard item={item} />}
                        />
                    )}

                    <Modal visible={showCreateCourse} animationType="slide" transparent onRequestClose={() => setShowCreateCourse(false)}>
                        <View style={s.modalOverlay}>
                            <View style={s.modalBox}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <Text style={s.modalTitle}>{t.chessCreateCourseBtn || '🎓 Kurs Oluştur'}</Text>

                                    <Text style={s.fieldLabel}>{t.chessCredentialLabel || 'Uzmanlık / Seviye *'}</Text>
                                    <TextInput
                                        value={courseForm.credentialLevel}
                                        onChangeText={v => setCourseForm(f => ({ ...f, credentialLevel: v }))}
                                        placeholder={t.chessCredentialPh || 'Ör: FIDE ratingli satranç eğitmeni'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.chessVenueLabel || 'Ders Yeri *'}</Text>
                                    <TextInput
                                        value={courseForm.location}
                                        onChangeText={v => setCourseForm(f => ({ ...f, location: v }))}
                                        placeholder={t.chessCoursePh || 'Ör: Kadıköy Satranç Kulübü'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.chessCityLabel || 'Şehir'}</Text>
                                    <TextInput
                                        value={courseForm.city}
                                        onChangeText={v => setCourseForm(f => ({ ...f, city: v }))}
                                        placeholder={t.chessCityPh || 'Ör: İstanbul'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.chessDescLabel || 'Açıklama'}</Text>
                                    <TextInput
                                        value={courseForm.description}
                                        onChangeText={v => setCourseForm(f => ({ ...f, description: v }))}
                                        placeholder={t.chessDescPh || 'Ders içeriği, seviye, program hakkında bilgi'}
                                        placeholderTextColor={colors.textMuted}
                                        style={[s.modalInput, { height: 70, textAlignVertical: 'top' }]}
                                        multiline
                                    />

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity
                                            style={[s.chip, courseForm.individual && s.chipActive]}
                                            onPress={() => setCourseForm(f => ({ ...f, individual: !f.individual }))}
                                        >
                                            <Text style={[s.chipText, courseForm.individual && s.chipTextActive]}>{t.chessIndividual || 'Bireysel Ders'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.chip, courseForm.group && s.chipActive]}
                                            onPress={() => setCourseForm(f => ({ ...f, group: !f.group }))}
                                        >
                                            <Text style={[s.chipText, courseForm.group && s.chipTextActive]}>{t.chessGroup || 'Grup Dersi'}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {courseForm.individual && (
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.fieldLabel}>{t.chessPriceIndividualLabel || 'Bireysel Ücret'}</Text>
                                                <TextInput
                                                    value={courseForm.priceIndividual}
                                                    onChangeText={v => setCourseForm(f => ({ ...f, priceIndividual: v.replace(/[^0-9]/g, '') }))}
                                                    placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={s.modalInput}
                                                />
                                            </View>
                                        )}
                                        {courseForm.group && (
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.fieldLabel}>{t.chessPriceGroupLabel || 'Grup Ücreti'}</Text>
                                                <TextInput
                                                    value={courseForm.priceGroup}
                                                    onChangeText={v => setCourseForm(f => ({ ...f, priceGroup: v.replace(/[^0-9]/g, '') }))}
                                                    placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={s.modalInput}
                                                />
                                            </View>
                                        )}
                                    </View>

                                    <TouchableOpacity style={s.submitBtn} onPress={submitChessCourse} disabled={creatingCourse}>
                                        <Text style={s.submitBtnText}>{creatingCourse ? '…' : (t.chessCreateCourseBtn || 'Kurs Oluştur')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowCreateCourse(false)} style={{ alignItems: 'center', marginTop: 10 }}>
                                        <Text style={{ color: colors.textMuted }}>{t.cancelBtn || 'Vazgeç'}</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>
                </>
            ) : (
                <>
                    <View style={s.smallCreateRow}>
                        <TouchableOpacity style={s.smallCreateBtn} onPress={shareChessMedia} disabled={uploadingMedia}>
                            <Text style={s.smallCreateBtnText}>{uploadingMedia ? '…' : (t.chessShareMediaBtn || '+ Paylaş')}</Text>
                        </TouchableOpacity>
                    </View>
                    {mediaLoading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                    ) : (
                        <FlatList
                            data={chessMedia}
                            keyExtractor={item => item.id}
                            numColumns={3}
                            contentContainerStyle={s.mediaGrid}
                            ListEmptyComponent={mediaLoaded ? <Text style={s.emptyText}>{t.chessNoMedia || 'Henüz medya paylaşılmamış.'}</Text> : null}
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

const s = StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingBottom: 14, backgroundColor: colors.surface, borderBottomWidth: 1, borderColor: colors.border },
    backBtn: { width: 36, height: 36, alignItems: 'center', justifyContent: 'center' },
    backBtnText: { color: colors.textSecondary, fontSize: 26, fontWeight: '300' },
    title: { color: '#fff', fontSize: 17, fontWeight: '900' },

    mainTabRow: { flexDirection: 'row', paddingHorizontal: 10, gap: 6, marginTop: 12, marginBottom: 4 },
    mainTabBtn: { flex: 1, borderRadius: 16, paddingVertical: 9, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    mainTabBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
    mainTabBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '800' },
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

    chip: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
    chipActive: { backgroundColor: colors.purple + '30', borderColor: colors.purple },
    chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: colors.purpleLight || colors.purple },

    mediaGrid: { padding: 4 },
    mediaThumbWrap: { flex: 1 / 3, aspectRatio: 1, padding: 2 },
    mediaThumb: { width: '100%', height: '100%', borderRadius: 6, backgroundColor: colors.surface2 },
    rowArtFallback: { alignItems: 'center', justifyContent: 'center' },

    modalOverlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 30, maxHeight: '88%' },
    modalTitle: { color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 10 },
    fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4, marginTop: 8 },
    modalInput: { backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 13, justifyContent: 'center' },
    submitBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
    submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
