import { useState, useEffect, useCallback, useMemo } from 'react';
import {
    View, Text, TextInput, TouchableOpacity, FlatList, Image,
    StyleSheet, StatusBar, Platform, ActivityIndicator, Alert, Linking, Modal, ScrollView,
} from 'react-native';
import { useSelector } from 'react-redux';
import * as ImagePicker from 'expo-image-picker';
import colors from '../../theme/colors';
import api from '../../services/api';
import useT from '../../hooks/useT';
import CityAutocomplete from '../../components/CityAutocomplete';
import CalendarPickerModal from '../../components/CalendarPickerModal';
import TimePickerModal from '../../components/TimePickerModal';
import DateRangePickerModal from '../../components/DateRangePickerModal';

function fmtDate(d) {
    if (!d) return null;
    return d.toISOString().slice(0, 10);
}

// Başlangıcından 5 dk sonra "geçmiş" sayılır — tarihsiz (esnek) içerik hiç geçmişe düşmez.
const PAST_GRACE_MS = 5 * 60 * 1000;
function toTime(dateStr, timeStr) {
    if (!dateStr) return null;
    const combined = dateStr.includes('T') ? dateStr : `${dateStr}T${timeStr || '00:00:00'}`;
    const t = new Date(combined).getTime();
    return Number.isNaN(t) ? null : t;
}
function isPastEntry(dateStr, timeStr) {
    const t = toTime(dateStr, timeStr);
    return t !== null && t + PAST_GRACE_MS < Date.now();
}

function PlayCard({ item, t }) {
    const priceLabel = item.priceMin != null
        ? `${item.priceMin}${item.priceMax && item.priceMax !== item.priceMin ? '–' + item.priceMax : ''} ${item.currency || ''}`.trim()
        : null;
    return (
        <View style={s.card}>
            {item.imageUrl ? (
                <Image source={{ uri: item.imageUrl }} style={s.cardImg} />
            ) : (
                <View style={[s.cardImg, s.cardImgFallback]}><Text style={{ fontSize: 22 }}>🎭</Text></View>
            )}
            <View style={s.cardBody}>
                <Text style={s.cardTitle} numberOfLines={1}>{item.name}</Text>
                <Text style={s.cardMeta} numberOfLines={1}>
                    {[item.venueName, item.city].filter(Boolean).join(' · ')}
                </Text>
                <Text style={s.cardMeta}>
                    {item.date}{item.time ? ` · ${item.time.slice(0, 5)}` : ''}
                </Text>
                {priceLabel && <Text style={s.cardPrice}>{priceLabel}</Text>}
                {item.ticketUrl && (
                    <TouchableOpacity style={s.ticketBtn} onPress={() => Linking.openURL(item.ticketUrl)}>
                        <Text style={s.ticketBtnText}>{t.theaterTicketBtn || 'Bilet Al'}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>
    );
}

function EventCard({ item, myId, onJoin, onOpen, t }) {
    const isOwner = item.senderId === myId;
    const joinStatus = item._myJoinStatus;
    const participantCount = (Array.isArray(item.participants) ? item.participants.length : 0) + 1; // +sender
    return (
        <TouchableOpacity style={s.eventCard} onPress={() => onOpen(item)} activeOpacity={0.8}>
            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <Text style={s.eventOwner} numberOfLines={1}>👤 {item.sender?.fullName || item.sender?.username}</Text>
                <Text style={s.eventCount}>👥 {participantCount}</Text>
            </View>
            {item.message ? <Text style={s.eventMessage} numberOfLines={3}>{item.message}</Text> : null}
            <View style={s.eventMetaRow}>
                {item.courtName ? <Text style={s.eventMeta}>📍 {item.courtName}</Text> : null}
                {item.location ? <Text style={s.eventMeta}>🏙️ {item.location}</Text> : null}
            </View>
            {(item.matchDate || item.matchTime) ? (
                <Text style={s.eventMeta}>
                    📅 {item.matchDate ? fmtDate(new Date(item.matchDate)) : (t.theaterFlexibleDate || 'Esnek tarih')}{item.matchTime ? ` · ${item.matchTime}` : ''}
                </Text>
            ) : null}
            {item.courtFeePerPerson ? <Text style={s.eventMeta}>💰 {item.courtFeePerPerson} ₺ / kişi</Text> : null}
            {item.ticketUrl && (
                <TouchableOpacity style={s.ticketBtnSm} onPress={(e) => { e.stopPropagation?.(); Linking.openURL(item.ticketUrl); }}>
                    <Text style={s.ticketBtnSmText}>{t.theaterTicketBtn || 'Bilet Al'}</Text>
                </TouchableOpacity>
            )}
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

function CourseCard({ item, t }) {
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

export default function TheaterHomeScreen({ navigation }) {
    const t = useT();
    const myId = useSelector(s => s.auth.user?.id);
    const [mainTab, setMainTab] = useState('official'); // 'official' | 'amateur'
    const [amateurTab, setAmateurTab] = useState('events'); // 'events' | 'courses' | 'media'

    // ── Satıştaki (resmi/biletli) tiyatro oyunları ──────────────────────────
    const [city, setCity] = useState('');
    const [dateFrom, setDateFrom] = useState(null);
    const [dateTo, setDateTo] = useState(null);
    const [showDateRangeModal, setShowDateRangeModal] = useState(false);
    const [plays, setPlays] = useState([]);
    const [loading, setLoading] = useState(false);
    const [loaded, setLoaded] = useState(false);
    const [playsView, setPlaysView] = useState('current'); // 'current' | 'past'

    const { currentPlays, pastPlays } = useMemo(() => {
        const cur = [], past = [];
        for (const p of plays) (isPastEntry(p.date, p.time) ? past : cur).push(p);
        past.sort((a, b) => toTime(b.date, b.time) - toTime(a.date, a.time));
        return { currentPlays: cur, pastPlays: past };
    }, [plays]);

    const doSearch = useCallback(async () => {
        setLoading(true);
        try {
            const params = {};
            if (city.trim()) params.city = city.trim();
            if (dateFrom) params.dateFrom = fmtDate(dateFrom);
            if (dateTo) params.dateTo = fmtDate(dateTo);
            const { data } = await api.get('/theater/search', { params });
            setPlays(data.plays || []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.theaterLoadError || 'Oyunlar yüklenemedi.');
        } finally {
            setLoading(false);
            setLoaded(true);
        }
    }, [city, dateFrom, dateTo, t]);

    useEffect(() => { if (mainTab === 'official' && !loaded) doSearch(); }, [mainTab, loaded, doSearch]);

    // ── Amatör Tiyatro: Etkinlikler ──────────────────────────────────────────
    const [events, setEvents] = useState([]);
    const [eventsLoading, setEventsLoading] = useState(false);
    const [eventsLoaded, setEventsLoaded] = useState(false);
    const [showCreateEvent, setShowCreateEvent] = useState(false);
    const [creatingEvent, setCreatingEvent] = useState(false);
    const [showEventDatePicker, setShowEventDatePicker] = useState(false);
    const [showEventTimePicker, setShowEventTimePicker] = useState(false);
    const EVENT_INIT = { message: '', venueName: '', city: '', date: null, time: '', fee: '', ticketUrl: '' };
    const [eventForm, setEventForm] = useState(EVENT_INIT);
    const [eventsView, setEventsView] = useState('current'); // 'current' | 'past'

    const { currentEvents, pastEvents } = useMemo(() => {
        const cur = [], past = [];
        for (const e of events) {
            const dateOnly = e.matchDate ? e.matchDate.slice(0, 10) : null;
            (isPastEntry(dateOnly, e.matchTime) ? past : cur).push(e);
        }
        past.sort((a, b) => toTime(b.matchDate?.slice(0, 10), b.matchTime) - toTime(a.matchDate?.slice(0, 10), a.matchTime));
        return { currentEvents: cur, pastEvents: past };
    }, [events]);

    const loadEvents = useCallback(async () => {
        setEventsLoading(true);
        try {
            const { data } = await api.get('/rivals', { params: { category: 'ARTS', subCategory: 'theater' } });
            setEvents(Array.isArray(data) ? data : []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.theaterEventsLoadError || 'Etkinlikler yüklenemedi.');
        } finally {
            setEventsLoading(false);
            setEventsLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'amateur' && amateurTab === 'events' && !eventsLoaded) loadEvents();
    }, [mainTab, amateurTab, eventsLoaded, loadEvents]);

    const submitEvent = async () => {
        if (!eventForm.message.trim()) return Alert.alert('', t.theaterEventMsgRequired || 'Etkinlik açıklaması girin.');
        setCreatingEvent(true);
        try {
            await api.post('/rivals', {
                category: 'ARTS', subCategory: 'theater',
                message: eventForm.message.trim(),
                courtName: eventForm.venueName.trim() || undefined,
                location: eventForm.city.trim() || undefined,
                flexibleSchedule: !eventForm.date,
                matchDate: eventForm.date ? eventForm.date.toISOString() : undefined,
                matchTime: eventForm.time.trim() || undefined,
                courtFeePerPerson: eventForm.fee ? parseInt(eventForm.fee, 10) : undefined,
                ticketUrl: eventForm.ticketUrl.trim() || undefined,
            });
            setShowCreateEvent(false);
            setEventForm(EVENT_INIT);
            loadEvents();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.theaterEventCreateError || 'Etkinlik oluşturulamadı.');
        } finally {
            setCreatingEvent(false);
        }
    };

    const joinEvent = async (item) => {
        try {
            await api.post(`/rivals/${item.id}/respond`, {});
            Alert.alert('', t.theaterJoinSent || 'Katılım isteği gönderildi.');
            loadEvents();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.theaterJoinError || 'İstek gönderilemedi.');
        }
    };

    const openEvent = (item) => {
        navigation.navigate('SubCategory', { category: 'ARTS', sub: 'theater', initialTab: 'rivals', highlightRivalId: item.id });
    };

    // ── Amatör Tiyatro: Kurslar ───────────────────────────────────────────────
    const [courses, setCourses] = useState([]);
    const [coursesLoading, setCoursesLoading] = useState(false);
    const [coursesLoaded, setCoursesLoaded] = useState(false);
    const [showCreateCourse, setShowCreateCourse] = useState(false);
    const [creatingCourse, setCreatingCourse] = useState(false);
    const COURSE_INIT = { credentialLevel: '', location: '', city: '', description: '', individual: true, group: false, priceIndividual: '', priceGroup: '' };
    const [courseForm, setCourseForm] = useState(COURSE_INIT);

    const loadCourses = useCallback(async () => {
        setCoursesLoading(true);
        try {
            const { data } = await api.get('/coaches', { params: { category: 'ARTS', subCategory: 'theater' } });
            setCourses(Array.isArray(data) ? data : []);
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.theaterCoursesLoadError || 'Kurslar yüklenemedi.');
        } finally {
            setCoursesLoading(false);
            setCoursesLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'amateur' && amateurTab === 'courses' && !coursesLoaded) loadCourses();
    }, [mainTab, amateurTab, coursesLoaded, loadCourses]);

    const submitCourse = async () => {
        if (!courseForm.credentialLevel.trim() || !courseForm.location.trim()) {
            return Alert.alert('', t.theaterCourseRequired || 'Uzmanlık/seviye ve konum zorunludur.');
        }
        setCreatingCourse(true);
        try {
            await api.post('/coaches', {
                category: 'ARTS', subCategory: 'theater',
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
            loadCourses();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.theaterCourseCreateError || 'Kurs oluşturulamadı.');
        } finally {
            setCreatingCourse(false);
        }
    };

    // ── Amatör Tiyatro: Medya ─────────────────────────────────────────────────
    const [media, setMedia] = useState([]);
    const [mediaLoading, setMediaLoading] = useState(false);
    const [mediaLoaded, setMediaLoaded] = useState(false);
    const [uploadingMedia, setUploadingMedia] = useState(false);

    const loadMedia = useCallback(async () => {
        setMediaLoading(true);
        try {
            const { data } = await api.get('/posts', { params: { category: 'ARTS', subCategory: 'theater', mediaOnly: true, limit: 50 } });
            setMedia(Array.isArray(data) ? data : (data.posts || []));
        } catch (e) {
            Alert.alert(t.error || 'Hata', e?.response?.data?.message || t.theaterMediaLoadError || 'Medya yüklenemedi.');
        } finally {
            setMediaLoading(false);
            setMediaLoaded(true);
        }
    }, [t]);

    useEffect(() => {
        if (mainTab === 'amateur' && amateurTab === 'media' && !mediaLoaded) loadMedia();
    }, [mainTab, amateurTab, mediaLoaded, loadMedia]);

    const shareMedia = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return Alert.alert('', t.galleryPermission || 'Galeri izni gerekli');
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images', 'videos'], quality: 0.85 });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        const isVideo = asset.type === 'video';
        setUploadingMedia(true);
        try {
            const form = new FormData();
            form.append('file', { uri: asset.uri, name: isVideo ? 'theater-media.mp4' : 'theater-media.jpg', type: isVideo ? 'video/mp4' : 'image/jpeg' });
            const { data: uploadData } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            await api.post('/posts', {
                category: 'ARTS', subCategory: 'theater', type: 'POST', content: '',
                ...(isVideo ? { videoUrl: uploadData.url } : { imageUrl: uploadData.url }),
            });
            loadMedia();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.theaterMediaShareError || 'Paylaşılamadı.');
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
                <Text style={s.title}>{t.theaterTitle || '🎭 Tiyatro'}</Text>
            </View>

            <View style={s.mainTabRow}>
                {[
                    { id: 'official', label: t.theaterTabOfficial || '🎫 Satıştaki Tiyatrolar' },
                    { id: 'amateur',  label: t.theaterTabAmateur  || '🎭 Amatör Tiyatro' },
                ].map(tb => (
                    <TouchableOpacity key={tb.id} onPress={() => setMainTab(tb.id)}
                        style={[s.mainTabBtn, mainTab === tb.id && s.mainTabBtnActive]}>
                        <Text style={[s.mainTabBtnText, mainTab === tb.id && s.mainTabBtnTextActive]}>{tb.label}</Text>
                    </TouchableOpacity>
                ))}
            </View>

            {mainTab === 'official' ? (
                <>
                    <View style={s.filtersBlock}>
                        <View style={s.filterRow}>
                            <CityAutocomplete
                                value={city}
                                onChangeText={setCity}
                                onSelect={(c) => setCity(c.province)}
                                placeholder={t.theaterCityPh || 'İl'}
                                style={{ flex: 1 }}
                            />
                            <TouchableOpacity style={[s.dateBtn, { flex: 1 }]} onPress={() => setShowDateRangeModal(true)}>
                                <Text style={s.dateBtnText} numberOfLines={1}>
                                    {dateFrom || dateTo
                                        ? [dateFrom && fmtDate(dateFrom), dateTo && fmtDate(dateTo)].filter(Boolean).join(' – ')
                                        : (t.theaterDatePh || '📅 Tarih')}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity onPress={doSearch} style={s.searchBtn}>
                                <Text style={{ color: '#fff', fontWeight: '700' }}>{t.theaterSearchBtn || 'Ara'}</Text>
                            </TouchableOpacity>
                        </View>
                        <DateRangePickerModal
                            visible={showDateRangeModal}
                            dateFrom={dateFrom}
                            dateTo={dateTo}
                            onApply={(f, t2) => { setDateFrom(f); setDateTo(t2); setShowDateRangeModal(false); }}
                            onClose={() => setShowDateRangeModal(false)}
                        />
                    </View>

                    <View style={s.miniTabRow}>
                        <TouchableOpacity style={[s.miniTabBtn, playsView === 'current' && s.miniTabBtnActive]} onPress={() => setPlaysView('current')}>
                            <Text style={[s.miniTabBtnText, playsView === 'current' && s.miniTabBtnTextActive]}>{t.theaterViewCurrent || 'Güncel'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.miniTabBtn, playsView === 'past' && s.miniTabBtnActive]} onPress={() => setPlaysView('past')}>
                            <Text style={[s.miniTabBtnText, playsView === 'past' && s.miniTabBtnTextActive]}>{t.theaterViewPast || 'Geçmiş Aktiviteler'}{pastPlays.length > 0 ? ` (${pastPlays.length})` : ''}</Text>
                        </TouchableOpacity>
                    </View>

                    {loading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                    ) : (
                        <FlatList
                            data={playsView === 'current' ? currentPlays : pastPlays}
                            keyExtractor={item => item.id}
                            numColumns={4}
                            columnWrapperStyle={s.gridRow}
                            contentContainerStyle={s.grid}
                            ListEmptyComponent={loaded ? <Text style={s.emptyText}>{playsView === 'past' ? (t.theaterNoPast || 'Geçmiş oyun yok.') : (t.theaterNoResults || 'Bu filtrelere uyan oyun bulunamadı.')}</Text> : null}
                            renderItem={({ item }) => <PlayCard item={item} t={t} />}
                        />
                    )}
                </>
            ) : (
                <>
                    <View style={s.subTabRow}>
                        {[
                            { id: 'events',  label: t.theaterSubEvents  || '🎭 Etkinlikler' },
                            { id: 'courses', label: t.theaterSubCourses || '🎓 Kurslar' },
                            { id: 'media',   label: t.theaterSubMedia   || '📷 Medya' },
                        ].map(tb => (
                            <TouchableOpacity key={tb.id} onPress={() => setAmateurTab(tb.id)}
                                style={[s.subTabBtn, amateurTab === tb.id && s.subTabBtnActive]}>
                                <Text style={[s.subTabBtnText, amateurTab === tb.id && s.subTabBtnTextActive]}>{tb.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {amateurTab === 'events' && (
                        <>
                            <View style={s.smallCreateRow}>
                                <TouchableOpacity style={s.smallCreateBtn} onPress={() => setShowCreateEvent(true)}>
                                    <Text style={s.smallCreateBtnText}>{t.theaterCreateListingBtn || '+ Etkinlik Oluştur'}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={s.miniTabRow}>
                                <TouchableOpacity style={[s.miniTabBtn, eventsView === 'current' && s.miniTabBtnActive]} onPress={() => setEventsView('current')}>
                                    <Text style={[s.miniTabBtnText, eventsView === 'current' && s.miniTabBtnTextActive]}>{t.theaterViewCurrent || 'Güncel'}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.miniTabBtn, eventsView === 'past' && s.miniTabBtnActive]} onPress={() => setEventsView('past')}>
                                    <Text style={[s.miniTabBtnText, eventsView === 'past' && s.miniTabBtnTextActive]}>{t.theaterViewPast || 'Geçmiş Aktiviteler'}{pastEvents.length > 0 ? ` (${pastEvents.length})` : ''}</Text>
                                </TouchableOpacity>
                            </View>
                            {eventsLoading ? (
                                <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                            ) : (
                                <FlatList
                                    data={eventsView === 'current' ? currentEvents : pastEvents}
                                    keyExtractor={item => item.id}
                                    contentContainerStyle={s.list}
                                    ListEmptyComponent={eventsLoaded ? <Text style={s.emptyText}>{eventsView === 'past' ? (t.theaterNoPast || 'Geçmiş etkinlik yok.') : (t.theaterNoEvents || 'Henüz etkinlik yok. İlk etkinliği siz oluşturun!')}</Text> : null}
                                    renderItem={({ item }) => <EventCard item={item} myId={myId} onJoin={joinEvent} onOpen={openEvent} t={t} />}
                                />
                            )}
                        </>
                    )}

                    {amateurTab === 'courses' && (
                        <>
                            <View style={s.smallCreateRow}>
                                <TouchableOpacity style={s.smallCreateBtn} onPress={() => setShowCreateCourse(true)}>
                                    <Text style={s.smallCreateBtnText}>{t.theaterCreateCourseBtn || '+ Kurs Oluştur'}</Text>
                                </TouchableOpacity>
                            </View>
                            {coursesLoading ? (
                                <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                            ) : (
                                <FlatList
                                    data={courses}
                                    keyExtractor={item => item.id}
                                    contentContainerStyle={s.list}
                                    ListEmptyComponent={coursesLoaded ? <Text style={s.emptyText}>{t.theaterNoCourses || 'Henüz kurs yok.'}</Text> : null}
                                    renderItem={({ item }) => <CourseCard item={item} t={t} />}
                                />
                            )}
                        </>
                    )}

                    {amateurTab === 'media' && (
                        <>
                            <View style={s.smallCreateRow}>
                                <TouchableOpacity style={s.smallCreateBtn} onPress={shareMedia} disabled={uploadingMedia}>
                                    <Text style={s.smallCreateBtnText}>{uploadingMedia ? '…' : (t.theaterShareMediaBtn || '+ Paylaş')}</Text>
                                </TouchableOpacity>
                            </View>
                            {mediaLoading ? (
                                <ActivityIndicator color={colors.purple} style={{ marginTop: 30 }} />
                            ) : (
                                <FlatList
                                    data={media}
                                    keyExtractor={item => item.id}
                                    numColumns={3}
                                    contentContainerStyle={s.mediaGrid}
                                    ListEmptyComponent={mediaLoaded ? <Text style={s.emptyText}>{t.theaterNoMedia || 'Henüz medya paylaşılmamış.'}</Text> : null}
                                    renderItem={({ item }) => (
                                        <View style={s.mediaThumbWrap}>
                                            {item.videoUrl ? (
                                                <View style={[s.mediaThumb, s.cardImgFallback]}><Text style={{ fontSize: 20 }}>🎬</Text></View>
                                            ) : (
                                                <Image source={{ uri: item.imageUrl }} style={s.mediaThumb} />
                                            )}
                                        </View>
                                    )}
                                />
                            )}
                        </>
                    )}

                    {/* Etkinlik Oluştur */}
                    <Modal visible={showCreateEvent} animationType="slide" transparent onRequestClose={() => setShowCreateEvent(false)}>
                        <View style={s.modalOverlay}>
                            <View style={s.modalBox}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <Text style={s.modalTitle}>{t.theaterCreateListingBtn || '📅 Etkinlik Oluştur'}</Text>

                                    <Text style={s.fieldLabel}>{t.theaterEventMsgLabel || 'Etkinlik / Oyun Açıklaması *'}</Text>
                                    <TextInput
                                        value={eventForm.message}
                                        onChangeText={v => setEventForm(f => ({ ...f, message: v }))}
                                        placeholder={t.theaterEventMsgPh || 'Ör: Amatör tiyatro grubumuzla "Bir Kadın" oyununu sahneliyoruz, izlemeye/katılmaya bekleriz.'}
                                        placeholderTextColor={colors.textMuted}
                                        style={[s.modalInput, { height: 80, textAlignVertical: 'top' }]}
                                        multiline
                                    />

                                    <Text style={s.fieldLabel}>{t.theaterVenueLabel || 'Mekan / Salon Adı'}</Text>
                                    <TextInput
                                        value={eventForm.venueName}
                                        onChangeText={v => setEventForm(f => ({ ...f, venueName: v }))}
                                        placeholder={t.theaterVenuePh || 'Ör: Kadıköy Sahne'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.theaterCityLabel || 'Şehir'}</Text>
                                    <TextInput
                                        value={eventForm.city}
                                        onChangeText={v => setEventForm(f => ({ ...f, city: v }))}
                                        placeholder={t.theaterCityPh2 || 'Ör: İstanbul'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fieldLabel}>{t.theaterDateLabel || 'Tarih'}</Text>
                                            <TouchableOpacity style={s.modalInput} onPress={() => setShowEventDatePicker(true)}>
                                                <Text style={{ color: eventForm.date ? '#fff' : colors.textMuted }}>
                                                    {eventForm.date ? fmtDate(eventForm.date) : (t.theaterFlexibleDate || 'Esnek tarih')}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                        <View style={{ flex: 1 }}>
                                            <Text style={s.fieldLabel}>{t.theaterTimeLabel || 'Saat'}</Text>
                                            <TouchableOpacity style={s.modalInput} onPress={() => setShowEventTimePicker(true)}>
                                                <Text style={{ color: eventForm.time ? '#fff' : colors.textMuted }}>
                                                    {eventForm.time || '20:00'}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                    <CalendarPickerModal
                                        visible={showEventDatePicker}
                                        value={eventForm.date}
                                        onSelect={(d) => { setEventForm(f => ({ ...f, date: d })); setShowEventDatePicker(false); }}
                                        onClose={() => setShowEventDatePicker(false)}
                                    />
                                    <TimePickerModal
                                        visible={showEventTimePicker}
                                        value={eventForm.time}
                                        onSelect={(v) => setEventForm(f => ({ ...f, time: v }))}
                                        onClose={() => setShowEventTimePicker(false)}
                                    />

                                    <Text style={s.fieldLabel}>{t.theaterFeeLabel || 'Kişi Başı Ücret (opsiyonel)'}</Text>
                                    <TextInput
                                        value={eventForm.fee}
                                        onChangeText={v => setEventForm(f => ({ ...f, fee: v.replace(/[^0-9]/g, '') }))}
                                        placeholder="0"
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType="numeric"
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.theaterTicketUrlLabel || 'Bilet / Etkinlik Linki (opsiyonel)'}</Text>
                                    <TextInput
                                        value={eventForm.ticketUrl}
                                        onChangeText={v => setEventForm(f => ({ ...f, ticketUrl: v }))}
                                        placeholder="https://..."
                                        placeholderTextColor={colors.textMuted}
                                        autoCapitalize="none"
                                        style={s.modalInput}
                                    />

                                    <TouchableOpacity style={s.submitBtn} onPress={submitEvent} disabled={creatingEvent}>
                                        <Text style={s.submitBtnText}>{creatingEvent ? '…' : (t.theaterCreateListingBtn || 'Etkinlik Oluştur')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowCreateEvent(false)} style={{ alignItems: 'center', marginTop: 10 }}>
                                        <Text style={{ color: colors.textMuted }}>{t.cancelBtn || 'Vazgeç'}</Text>
                                    </TouchableOpacity>
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>

                    {/* Kurs Oluştur */}
                    <Modal visible={showCreateCourse} animationType="slide" transparent onRequestClose={() => setShowCreateCourse(false)}>
                        <View style={s.modalOverlay}>
                            <View style={s.modalBox}>
                                <ScrollView showsVerticalScrollIndicator={false}>
                                    <Text style={s.modalTitle}>{t.theaterCreateCourseBtn || '🎓 Kurs Oluştur'}</Text>

                                    <Text style={s.fieldLabel}>{t.theaterCredentialLabel || 'Uzmanlık / Seviye *'}</Text>
                                    <TextInput
                                        value={courseForm.credentialLevel}
                                        onChangeText={v => setCourseForm(f => ({ ...f, credentialLevel: v }))}
                                        placeholder={t.theaterCredentialPh || 'Ör: Konservatuvar mezunu oyunculuk eğitmeni'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.theaterVenueLabel || 'Ders Yeri *'}</Text>
                                    <TextInput
                                        value={courseForm.location}
                                        onChangeText={v => setCourseForm(f => ({ ...f, location: v }))}
                                        placeholder={t.theaterVenuePh || 'Ör: Kadıköy Sahne'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.theaterCityLabel || 'Şehir'}</Text>
                                    <TextInput
                                        value={courseForm.city}
                                        onChangeText={v => setCourseForm(f => ({ ...f, city: v }))}
                                        placeholder={t.theaterCityPh2 || 'Ör: İstanbul'}
                                        placeholderTextColor={colors.textMuted}
                                        style={s.modalInput}
                                    />

                                    <Text style={s.fieldLabel}>{t.theaterDescLabel || 'Açıklama'}</Text>
                                    <TextInput
                                        value={courseForm.description}
                                        onChangeText={v => setCourseForm(f => ({ ...f, description: v }))}
                                        placeholder={t.theaterDescPh || 'Ders içeriği, seviye, program hakkında bilgi'}
                                        placeholderTextColor={colors.textMuted}
                                        style={[s.modalInput, { height: 70, textAlignVertical: 'top' }]}
                                        multiline
                                    />

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        <TouchableOpacity
                                            style={[s.chip, courseForm.individual && s.chipActive]}
                                            onPress={() => setCourseForm(f => ({ ...f, individual: !f.individual }))}
                                        >
                                            <Text style={[s.chipText, courseForm.individual && s.chipTextActive]}>{t.theaterIndividual || 'Bireysel Ders'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.chip, courseForm.group && s.chipActive]}
                                            onPress={() => setCourseForm(f => ({ ...f, group: !f.group }))}
                                        >
                                            <Text style={[s.chipText, courseForm.group && s.chipTextActive]}>{t.theaterGroup || 'Grup Dersi'}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    <View style={{ flexDirection: 'row', gap: 8 }}>
                                        {courseForm.individual && (
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.fieldLabel}>{t.theaterPriceIndividualLabel || 'Bireysel Ücret'}</Text>
                                                <TextInput
                                                    value={courseForm.priceIndividual}
                                                    onChangeText={v => setCourseForm(f => ({ ...f, priceIndividual: v.replace(/[^0-9]/g, '') }))}
                                                    placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={s.modalInput}
                                                />
                                            </View>
                                        )}
                                        {courseForm.group && (
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.fieldLabel}>{t.theaterPriceGroupLabel || 'Grup Ücreti'}</Text>
                                                <TextInput
                                                    value={courseForm.priceGroup}
                                                    onChangeText={v => setCourseForm(f => ({ ...f, priceGroup: v.replace(/[^0-9]/g, '') }))}
                                                    placeholder="0" placeholderTextColor={colors.textMuted} keyboardType="numeric" style={s.modalInput}
                                                />
                                            </View>
                                        )}
                                    </View>

                                    <TouchableOpacity style={s.submitBtn} onPress={submitCourse} disabled={creatingCourse}>
                                        <Text style={s.submitBtnText}>{creatingCourse ? '…' : (t.theaterCreateCourseBtn || 'Kurs Oluştur')}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowCreateCourse(false)} style={{ alignItems: 'center', marginTop: 10 }}>
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

    mainTabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, gap: 8 },
    mainTabBtn: { flex: 1, borderRadius: 20, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
    mainTabBtnActive: { backgroundColor: colors.purple, borderColor: colors.purple },
    mainTabBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    mainTabBtnTextActive: { color: '#fff' },

    subTabRow: { flexDirection: 'row', paddingHorizontal: 12, paddingTop: 10, gap: 6 },
    subTabBtn: { flex: 1, borderRadius: 16, paddingVertical: 6, alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    subTabBtnActive: { backgroundColor: colors.purple + '30', borderColor: colors.purple },
    subTabBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    subTabBtnTextActive: { color: colors.purpleLight },

    smallCreateRow: { paddingHorizontal: 12, paddingTop: 10, alignItems: 'flex-end' },
    smallCreateBtn: { backgroundColor: colors.purple, borderRadius: 16, paddingHorizontal: 14, paddingVertical: 7 },
    smallCreateBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

    miniTabRow: { flexDirection: 'row', gap: 6, paddingHorizontal: 12, paddingTop: 8 },
    miniTabBtn: { flex: 1, alignItems: 'center', paddingVertical: 6, borderRadius: 10, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    miniTabBtnActive: { backgroundColor: colors.purple + '22', borderColor: colors.purple },
    miniTabBtnText: { color: colors.textMuted, fontSize: 11, fontWeight: '700' },
    miniTabBtnTextActive: { color: colors.purpleLight },

    filtersBlock: { paddingBottom: 4 },
    filterRow: { flexDirection: 'row', gap: 8, padding: 12, paddingBottom: 0 },
    searchBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingHorizontal: 16, alignItems: 'center', justifyContent: 'center' },
    dateBtn: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 10, paddingVertical: 9, justifyContent: 'center' },
    dateBtnText: { color: colors.textMuted, fontSize: 12, fontWeight: '600' },

    list: { paddingHorizontal: 12, paddingTop: 12, paddingBottom: 30 },
    emptyText: { color: colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: 30 },

    grid: { paddingHorizontal: 3, paddingTop: 3, paddingBottom: 30, gap: 3 },
    gridRow: { gap: 3 },
    card: { flex: 1, backgroundColor: colors.surface, borderRadius: 10, borderWidth: 1, borderColor: colors.border, overflow: 'hidden' },
    cardImg: { width: '100%', aspectRatio: 3 / 4, backgroundColor: colors.surface2 },
    cardImgFallback: { alignItems: 'center', justifyContent: 'center' },
    cardBody: { padding: 3, gap: 3 },
    cardTitle: { color: '#fff', fontSize: 10, fontWeight: '800' },
    cardMeta: { color: colors.textMuted, fontSize: 8 },
    cardPrice: { color: colors.purple, fontSize: 8, fontWeight: '700' },
    ticketBtn: { backgroundColor: colors.purple, borderRadius: 6, paddingVertical: 3, paddingHorizontal: 3, alignItems: 'center' },
    ticketBtnText: { color: '#fff', fontSize: 9, fontWeight: '700' },

    eventCard: { backgroundColor: colors.surface, borderRadius: 12, borderWidth: 1, borderColor: colors.border, padding: 12, marginBottom: 10 },
    eventOwner: { color: '#fff', fontSize: 12, fontWeight: '800', flex: 1 },
    eventCount: { color: colors.textMuted, fontSize: 11 },
    eventMessage: { color: colors.text, fontSize: 13, marginTop: 6, lineHeight: 18 },
    eventMetaRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 6 },
    eventMeta: { color: colors.textMuted, fontSize: 11, marginTop: 4 },
    ticketBtnSm: { backgroundColor: colors.purple + '20', borderWidth: 1, borderColor: colors.purple + '60', borderRadius: 8, paddingVertical: 6, alignItems: 'center', marginTop: 8 },
    ticketBtnSmText: { color: colors.purpleLight, fontSize: 12, fontWeight: '700' },
    joinBtn: { backgroundColor: colors.purple, borderRadius: 8, paddingVertical: 8, alignItems: 'center', marginTop: 8 },
    joinBtnDisabled: { backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border },
    joinBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },

    mediaGrid: { padding: 4 },
    mediaThumbWrap: { flex: 1 / 3, aspectRatio: 1, padding: 2 },
    mediaThumb: { width: '100%', height: '100%', borderRadius: 6, backgroundColor: colors.surface2 },

    modalOverlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
    modalBox: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16, paddingBottom: 30, maxHeight: '88%' },
    modalTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 12 },
    fieldLabel: { color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 4, marginTop: 8 },
    modalInput: { backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 12, paddingVertical: 9, color: '#fff', fontSize: 13, justifyContent: 'center' },
    chip: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border, marginTop: 8 },
    chipActive: { backgroundColor: colors.purple + '30', borderColor: colors.purple },
    chipText: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
    chipTextActive: { color: colors.purpleLight },
    submitBtn: { backgroundColor: colors.purple, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
    submitBtnText: { color: '#fff', fontWeight: '800', fontSize: 14 },
});
