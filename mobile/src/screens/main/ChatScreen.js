import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image, Modal } from 'react-native';
import { useSelector } from 'react-redux';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { getSubCategoryLabel } from '../../utils/subCategoryLabels';
import { onSocket, getSocket, onSocketReconnect } from '../../services/socket';
import { openSharedPost, privacyDeniedMessage } from '../../utils/sharedPost';

function Avatar({ user, size = 36 }) {
    return (
        <View style={[styles.avatar, { width: size, height: size, borderRadius: size / 2 }]}>
            <Text style={[styles.avatarText, { fontSize: size * 0.38 }]}>
                {user?.username?.[0]?.toUpperCase() || '?'}
            </Text>
        </View>
    );
}

function timeAgo(date) {
    const diffSec = Math.max(0, Math.floor((Date.now() - new Date(date).getTime()) / 1000));
    if (diffSec < 60) return 'az önce görüldü';
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin} dakika önce görüldü`;
    const diffHour = Math.floor(diffMin / 60);
    if (diffHour < 24) return `${diffHour} saat önce görüldü`;
    const diffDay = Math.floor(diffHour / 24);
    return `${diffDay} gün önce görüldü`;
}

export default function ChatScreen({ route, navigation }) {
    const { conversation: convParam, other: otherProp, rival, equipment, coach, club, challenge: challengeParam } = route.params || {};
    const myId = useSelector(s => s.auth.user?.id);
    const t = useT();
    const [messages, setMessages] = useState([]);
    const [input, setInput] = useState('');
    const [loading, setLoading] = useState(true);
    const [sending, setSending] = useState(false);
    const [convId, setConvId] = useState(convParam?.id || null);
    const flatRef = useRef(null);
    const convIdRef = useRef(convParam?.id || null);
    const pollRef = useRef(null);

    // Engelle / Şikayet Et
    const [blocking, setBlocking] = useState(false);
    const [reportModalVisible, setReportModalVisible] = useState(false);
    const [reportReason, setReportReason] = useState('');
    const [reportSubmitting, setReportSubmitting] = useState(false);

    // Fotoğraf / sesli mesaj
    const [uploadingMedia, setUploadingMedia] = useState(false);
    const [isRecording, setIsRecording] = useState(false);
    const [recordSeconds, setRecordSeconds] = useState(0);
    const recordingRef = useRef(null);
    const recordTimerRef = useRef(null);
    const [playingId, setPlayingId] = useState(null);
    const soundRef = useRef(null);

    // Meydan okuma — yer/zaman teklifi formu
    const [scheduleOpen, setScheduleOpen] = useState(false);
    const [schedDate, setSchedDate] = useState('');
    const [schedTime, setSchedTime] = useState('');
    const [schedPlace, setSchedPlace] = useState('');
    const [schedBusy, setSchedBusy] = useState(false);

    const other = otherProp || convParam?.other;

    // "coach"/"rival" route param yalnızca "Mesaj At" / "İletişime Geç" ile sohbeti
    // başlatan tarafta olur — karşı taraf sohbeti Mesajlar listesinden açtığında
    // bu parametreyi almaz. Banner'ı her iki tarafta da göstermek için mesaj
    // geçmişindeki ilan referansından da (varsa) türetiyoruz.
    const coachListingCtx = coach || [...messages].reverse().find(m => m.coachListing)?.coachListing || null;
    const clubListingCtx = club || [...messages].reverse().find(m => m.clubListing)?.clubListing || null;
    const rivalCtx = rival || [...messages].reverse().find(m => m.activityRequest)?.activityRequest || null;

    const activeChallengeMeta = [...messages].reverse().find(m =>
        m.meta?.kind === 'CHALLENGE_ACCEPTED' || m.meta?.kind === 'SCHEDULE_PROMPT' || m.meta?.kind === 'SCHEDULE_PROPOSAL'
    )?.meta || (challengeParam?.status === 'ACCEPTED' ? {
        challengeId: challengeParam.id,
        activityRequestId: challengeParam.activityRequestId,
        category: challengeParam.category,
        subCategory: challengeParam.subCategory,
    } : null);

    const pendingOffer = [...messages].reverse().find(m =>
        m.meta?.kind === 'CHALLENGE_OFFER' && m.meta?.status === 'PENDING' && m.senderId !== myId
    );

    const openEquipmentListing = (listing) => {
        if (!listing?.category || !listing?.subCategory) return;
        navigation.push('SubCategory', { category: listing.category, sub: listing.subCategory, initialTab: 'equipment', openEquipmentId: listing.id });
    };

    const openCoachListing = (listing) => {
        if (!listing?.category || !listing?.subCategory) return;
        navigation.push('SubCategory', { category: listing.category, sub: listing.subCategory, initialTab: 'coaches', openCoachId: listing.id });
    };

    const openClubListing = (listing) => {
        if (!listing?.category || !listing?.subCategory) return;
        navigation.push('SubCategory', { category: listing.category, sub: listing.subCategory, initialTab: 'coaches', initialCoachSubTab: 'clubs' });
    };

    const openRivalListing = (listing) => {
        if (!listing?.category || !listing?.subCategory || !listing?.id) return;
        navigation.push('SubCategory', { category: listing.category, sub: listing.subCategory, initialTab: 'rivals', highlightRivalId: listing.id });
    };

    const formatRivalMatchType = (r) => {
        if (!r?.matchType || r.matchType === 'PLAYER_WANTED') return '';
        return r.matchType === 'DOUBLE' ? ' · 2v2' : ' · 1v1';
    };

    const formatRivalDate = (r) => {
        if (r?.flexibleSchedule) return t.rivalChatFlexibleDate || 'Flexible date';
        if (!r?.matchDate) return '';
        try {
            const locale = t.lang === 'tr' ? 'tr-TR' : t.lang === 'de' ? 'de-DE' : t.lang === 'ru' ? 'ru-RU' : 'en-US';
            return new Date(r.matchDate).toLocaleDateString(locale, { day: 'numeric', month: 'long' }) + (r.matchTime ? ` · ${r.matchTime}` : '');
        } catch {
            return r.matchTime || '';
        }
    };

    const appendMessages = (arr) => {
        const list = Array.isArray(arr) ? arr : [arr];
        setMessages(prev => {
            const ids = new Set(prev.map(m => m.id));
            const fresh = list.filter(m => m?.id && !ids.has(m.id));
            return fresh.length ? [...prev, ...fresh] : prev;
        });
    };

    const respondToChallenge = async (challengeId, action) => {
        try {
            const { data } = await api.patch(`/challenges/${challengeId}/respond`, { action });
            if (data.message) appendMessages(data.message);
            if (data.messages) appendMessages(data.messages);
            if (action === 'accept') {
                Alert.alert('', t.challengeAcceptedHint || 'Meydan okuma kabul edildi. Yer ve zaman önerin.');
            }
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        }
    };

    const submitScheduleProposal = async () => {
        const challengeId = activeChallengeMeta?.challengeId || challengeParam?.id;
        if (!challengeId || !schedDate.trim() || !schedTime.trim()) {
            Alert.alert('', t.challengeScheduleNeed || 'Tarih ve saat gerekli');
            return;
        }
        setSchedBusy(true);
        try {
            const { data } = await api.post(`/challenges/${challengeId}/propose-schedule`, {
                date: schedDate.trim(),
                time: schedTime.trim(),
                location: schedPlace.trim() || undefined,
                courtName: schedPlace.trim() || undefined,
            });
            if (data.message) appendMessages(data.message);
            setScheduleOpen(false);
            setSchedDate('');
            setSchedTime('');
            setSchedPlace('');
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally {
            setSchedBusy(false);
        }
    };

    const acceptScheduleProposal = async (challengeId) => {
        try {
            const { data } = await api.post(`/challenges/${challengeId}/accept-schedule`);
            if (data.message) appendMessages(data.message);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        }
    };

    const [sharedPreview, setSharedPreview] = useState(null);

    const openSharedCard = async (shared) => {
        if (!shared?.id) return;
        if (shared.locked) {
            Alert.alert(
                t.sharedPostLockedTitle || 'Görüntülenemiyor',
                privacyDeniedMessage({
                    privacyMode: shared.privacyMode,
                    contentKind: shared.type,
                    code: shared.code,
                    fallback: shared.lockMessage,
                    t,
                }),
            );
            return;
        }
        const full = await openSharedPost(shared.id, {
            t,
            onOpen: (post) => setSharedPreview(post),
        });
        if (full) setSharedPreview(full);
    };

    const sharedKindLabel = (type) => (
        type === 'REEL' ? (t.sharedPostCardReel || 'Reels')
            : type === 'STORY' ? (t.sharedPostCardStory || 'Hikaye')
                : (t.sharedPostCardPost || 'Gönderi')
    );

    const [headerMenuVisible, setHeaderMenuVisible] = useState(false);
    const openOptionsMenu = () => {
        if (!other?.id) return;
        setHeaderMenuVisible(true);
    };

    const confirmBlock = () => {
        Alert.alert(
            'Mesajları Engelle',
            `${other?.fullName || other?.username} adlı kullanıcının mesajlarını engellemek istediğinize emin misiniz? Arkadaşlığınız, takibiniz ve profilinizi görmesi etkilenmez — sadece mesajlaşamazsınız.`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'Engelle', style: 'destructive', onPress: async () => {
                        setBlocking(true);
                        try {
                            await api.post(`/friends/message-block/${other.id}`);
                            Alert.alert('', 'Kullanıcının mesajları engellendi.');
                            navigation.goBack();
                        } catch (e) {
                            Alert.alert('', e?.response?.data?.message || 'İşlem başarısız oldu.');
                        } finally {
                            setBlocking(false);
                        }
                    },
                },
            ],
        );
    };

    const submitReport = async () => {
        if (!reportReason.trim()) return;
        setReportSubmitting(true);
        try {
            await api.post('/users/me/support-messages', {
                message: `🚩 Kullanıcı şikayeti: @${other?.username} (${other?.id})\nSebep: ${reportReason.trim()}`,
            });
            setReportModalVisible(false);
            setReportReason('');
            Alert.alert('', 'Şikayetiniz iletildi, ekibimiz inceleyecek.');
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'Şikayet gönderilemedi.');
        } finally {
            setReportSubmitting(false);
        }
    };

    // Bir mesaja uzun basınca: kendi mesajımsa "Herkesten Sil" (karşı taraf zaten
    // okuduysa önce uyarı gösterilir, yine de silinebilir) + "Benden Sil"; başkasının
    // mesajıysa sadece "Benden Sil" (kendi görünümümden kaldırma, karşı tarafı etkilemez).
    const deleteForMe = async (item) => {
        try {
            await api.delete(`/messages/${item.id}`);
            setMessages(prev => prev.filter(m => m.id !== item.id));
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'Mesaj silinemedi.');
        }
    };

    const deleteForEveryone = async (item) => {
        try {
            await api.delete(`/messages/${item.id}`, { params: { forEveryone: 'true' } });
            setMessages(prev => prev.map(m => m.id === item.id
                ? { ...m, deletedForEveryone: true, content: '', imageUrl: null, audioUrl: null, audioDuration: null }
                : m));
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'Mesaj silinemedi.');
        }
    };

    const confirmDeleteForEveryone = (item) => {
        if (item.read) {
            Alert.alert(
                'Karşı Taraf Zaten Okudu',
                'Karşı taraf bu mesajı zaten okumuş, ama yine de mesaj alanından silebilirsiniz.',
                [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Yine de Sil', style: 'destructive', onPress: () => deleteForEveryone(item) },
                ],
            );
        } else {
            Alert.alert(
                'Mesajı Herkesten Sil',
                'Bu mesaj karşı taraftan da silinecek, artık okuyamayacak.',
                [
                    { text: 'Vazgeç', style: 'cancel' },
                    { text: 'Sil', style: 'destructive', onPress: () => deleteForEveryone(item) },
                ],
            );
        }
    };

    // Alert.alert boş başlık/mesajla bile büyük, boşluklu bir kutu çiziyordu — sadece
    // birkaç satır buton için içeriğe göre boyutlanan küçük bir sayfa altı menü yeterli.
    const [messageOptionsFor, setMessageOptionsFor] = useState(null);
    const openMessageOptions = (item) => {
        if (item.deletedForEveryone) return;
        setMessageOptionsFor(item);
    };
    const closeMessageOptions = () => setMessageOptionsFor(null);

    // Sohbete her girişte, o an henüz okunmamış olan ilk mesajın üstüne "Yeni
    // Mesajlar" çizgisi çekilir. Bu satır SADECE ilk yüklemede belirlenir (10sn'lik
    // poll'da tekrar hesaplanmaz) — çünkü sunucu bu isteğin içinde mesajları hemen
    // okundu işaretliyor; bir sonraki girişte onlar zaten "eski" sayılıp çizginin
    // üstünde kalacak, sadece o andan sonra gelenler çizginin altında yeni sayılacak.
    const [unreadDividerId, setUnreadDividerId] = useState(null);
    const dividerSetRef = useRef(false);

    // Sohbet açılırken sadece EN SON ~40 mesaj çekilir — binlerce mesajlık bir
    // geçmişte bile "en alta inmiş" halde anında açılsın diye (tüm geçmişi tek
    // seferde çekmek hem yavaş olurdu hem de FlatList'in güvenilir şekilde en alta
    // kaydırmasını neredeyse imkansız kılardı). Yukarı kaydırınca eski sayfalar
    // ayrıca yüklenir.
    const [hasMoreOlder, setHasMoreOlder] = useState(true);
    const [loadingOlder, setLoadingOlder] = useState(false);
    const oldestCreatedAtRef = useRef(null);
    const isPrependingRef = useRef(false);

    const loadInitial = useCallback(async (id) => {
        if (!id) return;
        try {
            const { data } = await api.get(`/messages/conversation/${id}/messages`);
            const list = data.messages || [];
            if (!dividerSetRef.current) {
                const firstUnread = list.find(m => m.senderId !== myId && !m.read);
                if (firstUnread) setUnreadDividerId(firstUnread.id);
                dividerSetRef.current = true;
            }
            setMessages(list);
            setHasMoreOlder(!!data.hasMore);
            oldestCreatedAtRef.current = list[0]?.createdAt || null;
        } catch { /* silent — network may be slow */ }
    }, [myId]);

    // Yedek polling (socket yeterliyse nadir çalışır) — sadece en son sayfayı
    // çekip mevcut listeye EKLER, üstte yukarı kaydırılarak yüklenmiş eski
    // mesajları asla silmez.
    const refreshRecent = useCallback(async (id) => {
        if (!id) return;
        try {
            const { data } = await api.get(`/messages/conversation/${id}/messages`);
            const list = data.messages || [];
            setMessages(prev => {
                const existingIds = new Set(prev.map(m => m.id));
                const merged = [...prev, ...list.filter(m => !existingIds.has(m.id))];
                merged.sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
                return merged;
            });
        } catch { /* silent */ }
    }, []);

    const loadOlderMessages = useCallback(async () => {
        const id = convIdRef.current;
        if (!id || !hasMoreOlder || loadingOlder || !oldestCreatedAtRef.current) return;
        setLoadingOlder(true);
        try {
            const { data } = await api.get(`/messages/conversation/${id}/messages`, {
                params: { before: oldestCreatedAtRef.current },
            });
            const list = data.messages || [];
            if (list.length > 0) {
                oldestCreatedAtRef.current = list[0].createdAt;
                isPrependingRef.current = true;
                setMessages(prev => [...list, ...prev]);
            }
            setHasMoreOlder(!!data.hasMore);
        } catch { /* silent */ }
        finally { setLoadingOlder(false); }
    }, [hasMoreOlder, loadingOlder]);

    useEffect(() => {
        const init = async () => {
            try {
                let id = convIdRef.current;
                if (!id && other?.id) {
                    const { data } = await api.get(`/messages/conversation/${other.id}`);
                    id = data.id;
                    setConvId(id);
                    convIdRef.current = id;
                }
                if (id) {
                    getSocket()?.emit('conversation:open', id);
                    await loadInitial(id);
                    setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
                }
            } catch (e) {
                console.warn('ChatScreen init error:', e?.message);
                if (e?.response?.status === 403) {
                    Alert.alert('', e.response.data?.message || 'Bu kullanıcı tarafından engellendiniz.');
                    navigation.goBack();
                }
            }
            finally { setLoading(false); }
        };
        init();

        // Yedek polling: 10 saniyede bir (socket yeterliyse nadir çalışır)
        pollRef.current = setInterval(() => {
            refreshRecent(convIdRef.current);
        }, 10000);

        return () => {
            clearInterval(pollRef.current);
            getSocket()?.emit('conversation:close');
        };
    }, []);

    // Bağlantı kopup yeniden kurulunca (arka planda/tünel kesintisi) backend'deki
    // "şu an açık sohbet" bilgisi sıfırlanmış olur -- soket geri gelince tazeden bildir.
    useEffect(() => {
        return onSocketReconnect(() => {
            if (convIdRef.current) getSocket()?.emit('conversation:open', convIdRef.current);
        });
    }, []);

    // Socket ile gerçek zamanlı mesaj al
    useEffect(() => {
        const off = onSocket('newMessage', ({ message, conversationId }) => {
            if (conversationId === convIdRef.current) {
                setMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
                setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
            }
        });
        return off;
    }, []);

    // Karşı taraf sohbetin içine girip mesajları gerçekten görünce (bkz. getMessages'ın
    // sunucu tarafındaki updateMany) bu olay gelir — gönderdiğimiz mesajları "okundu +
    // ne zaman" bilgisiyle işaretleyip "X dakika önce görüldü" gösterebilelim diye.
    useEffect(() => {
        const off = onSocket('messagesRead', ({ conversationId, readAt }) => {
            if (conversationId === convIdRef.current) {
                setMessages(prev => prev.map(m => (m.senderId === myId && !m.read) ? { ...m, read: true, readAt } : m));
            }
        });
        return off;
    }, [myId]);

    // "Herkesten Sil" — karşı taraf silse de ben silsem de (başka bir cihazdan)
    // anında "Bu mesaj silindi" yer tutucusuna dönüşsün diye.
    useEffect(() => {
        const off = onSocket('messageDeleted', ({ messageId, conversationId }) => {
            if (conversationId === convIdRef.current) {
                setMessages(prev => prev.map(m => m.id === messageId
                    ? { ...m, deletedForEveryone: true, content: '', imageUrl: null, audioUrl: null, audioDuration: null }
                    : m));
            }
        });
        return off;
    }, []);

    // "X dakika önce görüldü" metni zamanla eskiyeceği için dakikada bir yeniden
    // render tetiklenir (mesaj/soket olayı beklemeden metin tazelensin diye).
    const [, forceTick] = useState(0);
    useEffect(() => {
        const t = setInterval(() => forceTick(v => v + 1), 60000);
        return () => clearInterval(t);
    }, []);

    // Sadece "İletişime Geç" ile gönderilen İLK mesaj ilan referansı taşır (bkz.
    // openChatWithCoach) — üstteki banner geçmişteki o tek mesajdan türetildiği için
    // sohbet normal aktıkça her mesaja tekrar tekrar ilan kartı eklemeye gerek yok.
    const sendPayload = async (payload) => {
        const { data } = await api.post(`/messages/send/${other?.id}`, payload);
        // Sunucu bu mesaji "newMessage" socket olayiyla gonderene de geri yansitiyor;
        // o olay burada olusan cevaptan once ulasmis olabilir, bu yuzden id'ye gore
        // dedup yapmadan eklersek ayni mesaj iki kez listelenebilir.
        setMessages(prev => prev.some(m => m.id === data.message.id) ? prev : [...prev, data.message]);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 100);
    };

    const send = async () => {
        if (!input.trim() || sending) return;
        const text = input.trim();
        setInput('');
        setSending(true);
        try {
            await sendPayload({ content: text });
        } catch (e) {
            console.warn(e?.message);
            Alert.alert('Hata', e?.response?.data?.message || 'Mesaj gönderilemedi');
        }
        finally { setSending(false); }
    };

    const pickAndSendImage = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return Alert.alert('', 'Galeri izni gerekli');
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.8 });
        if (result.canceled || !result.assets?.[0]) return;
        const asset = result.assets[0];
        setUploadingMedia(true);
        try {
            const form = new FormData();
            form.append('file', { uri: asset.uri, name: 'chat-photo.jpg', type: 'image/jpeg' });
            const { data: uploadData } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            await sendPayload({ content: '', imageUrl: uploadData.url });
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'Fotoğraf gönderilemedi');
        } finally {
            setUploadingMedia(false);
        }
    };

    const startRecording = async () => {
        try {
            const perm = await Audio.requestPermissionsAsync();
            if (!perm.granted) return Alert.alert('', 'Mikrofon izni gerekli');
            await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
            const { recording } = await Audio.Recording.createAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
            recordingRef.current = recording;
            setIsRecording(true);
            setRecordSeconds(0);
            recordTimerRef.current = setInterval(() => setRecordSeconds(s => s + 1), 1000);
        } catch (e) {
            Alert.alert('', 'Ses kaydı başlatılamadı');
        }
    };

    const cancelRecording = async () => {
        clearInterval(recordTimerRef.current);
        setIsRecording(false);
        try {
            await recordingRef.current?.stopAndUnloadAsync();
        } catch { /* zaten durmuş olabilir */ }
        recordingRef.current = null;
    };

    const stopRecordingAndSend = async () => {
        clearInterval(recordTimerRef.current);
        setIsRecording(false);
        const recording = recordingRef.current;
        recordingRef.current = null;
        if (!recording) return;
        try {
            await recording.stopAndUnloadAsync();
            const uri = recording.getURI();
            const duration = recordSeconds;
            if (!uri || duration < 1) return;
            setUploadingMedia(true);
            const form = new FormData();
            form.append('file', { uri, name: 'chat-voice.m4a', type: 'audio/m4a' });
            const { data: uploadData } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            await sendPayload({ content: '', audioUrl: uploadData.url, audioDuration: Math.round(uploadData.duration || duration) });
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'Sesli mesaj gönderilemedi');
        } finally {
            setUploadingMedia(false);
        }
    };

    const playAudio = async (item) => {
        try {
            if (playingId === item.id) {
                await soundRef.current?.stopAsync();
                setPlayingId(null);
                return;
            }
            if (soundRef.current) {
                await soundRef.current.unloadAsync();
                soundRef.current = null;
            }
            await Audio.setAudioModeAsync({ allowsRecordingIOS: false, playsInSilentModeIOS: true });
            const { sound } = await Audio.Sound.createAsync({ uri: item.audioUrl }, { shouldPlay: true });
            soundRef.current = sound;
            setPlayingId(item.id);
            sound.setOnPlaybackStatusUpdate((status) => {
                if (status.didJustFinish) setPlayingId(null);
            });
        } catch {
            Alert.alert('', 'Sesli mesaj oynatılamadı');
        }
    };

    useEffect(() => {
        return () => {
            clearInterval(recordTimerRef.current);
            soundRef.current?.unloadAsync().catch(() => {});
        };
    }, []);

    const renderMessage = ({ item }) => {
        const isMe = item.senderId === myId;
        return (
            <>
                {item.id === unreadDividerId && (
                    <View style={styles.newDivider}>
                        <View style={styles.newDividerLine} />
                        <Text style={styles.newDividerText}>Yeni Mesajlar</Text>
                        <View style={styles.newDividerLine} />
                    </View>
                )}
                <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                {!isMe && <Avatar user={item.sender} size={30} />}
                <TouchableOpacity
                    onLongPress={() => openMessageOptions(item)}
                    activeOpacity={0.85}
                    style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}
                >
                    {item.deletedForEveryone ? (
                        <Text style={styles.deletedText}>🚫 Bu mesaj silindi</Text>
                    ) : (
                    <>
                    {item.equipmentListing && (
                        <TouchableOpacity style={styles.msgEquipCard} onPress={() => openEquipmentListing(item.equipmentListing)} activeOpacity={0.8}>
                            {item.equipmentListing.images?.[0] ? (
                                <Image source={{ uri: item.equipmentListing.images[0] }} style={styles.msgEquipImg} resizeMode="cover" />
                            ) : (
                                <View style={[styles.msgEquipImg, styles.equipBannerImgPh]}><Text style={{ fontSize: 16 }}>🎾</Text></View>
                            )}
                            <View style={{ flex: 1 }}>
                                <Text style={styles.msgEquipTitle} numberOfLines={1}>{item.equipmentListing.title}</Text>
                                <Text style={styles.msgEquipPrice}>{item.equipmentListing.price > 0 ? `${item.equipmentListing.price} ₺` : 'Fiyat sor'}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    {item.coachListing && (
                        <TouchableOpacity style={styles.msgEquipCard} onPress={() => openCoachListing(item.coachListing)} activeOpacity={0.8}>
                            <View style={[styles.msgEquipImg, styles.equipBannerImgPh]}><Text style={{ fontSize: 16 }}>🎓</Text></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.msgEquipTitle} numberOfLines={1}>{item.coachListing.credentialLevel}{item.coachListing.certName ? ` · ${item.coachListing.certName}` : ''}</Text>
                                <Text style={styles.msgEquipPrice}>{item.coachListing.priceIndividual > 0 ? `${item.coachListing.priceIndividual} ₺/saat` : 'Antrenörlük ilanı'}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    {item.clubListing && (
                        <TouchableOpacity style={styles.msgEquipCard} onPress={() => openClubListing(item.clubListing)} activeOpacity={0.8}>
                            <View style={[styles.msgEquipImg, styles.equipBannerImgPh]}><Text style={{ fontSize: 16 }}>🏟️</Text></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.msgEquipTitle} numberOfLines={1}>{item.clubListing.name}</Text>
                                <Text style={styles.msgEquipPrice}>{item.clubListing.membershipFee > 0 ? `${item.clubListing.membershipFee} ₺/ay` : (t.clubChatCard || 'Kulüp')}</Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    {item.activityRequest && (
                        <TouchableOpacity style={styles.msgEquipCard} onPress={() => openRivalListing(item.activityRequest)} activeOpacity={0.8}>
                            <View style={[styles.msgEquipImg, styles.equipBannerImgPh]}><Text style={{ fontSize: 16 }}>📋</Text></View>
                            <View style={{ flex: 1 }}>
                                <Text style={styles.msgEquipTitle} numberOfLines={1}>
                                    {getSubCategoryLabel(item.activityRequest.subCategory, t.lang)}
                                    {formatRivalMatchType(item.activityRequest)}
                                    {item.activityRequest.level ? ` · ${item.activityRequest.level}` : ''}
                                </Text>
                                <Text style={styles.msgEquipPrice} numberOfLines={1}>
                                    {formatRivalDate(item.activityRequest)
                                        || item.activityRequest.courtName
                                        || item.activityRequest.location
                                        || (t.rivalChatCard || t.ilanDetail || 'Listing')}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    {item.meta?.kind === 'CHALLENGE_OFFER' && item.meta.status === 'PENDING' && !isMe && (
                        <View style={styles.challengeActions}>
                            <TouchableOpacity style={[styles.challengeBtn, { backgroundColor: '#16a34a' }]} onPress={() => respondToChallenge(item.meta.challengeId, 'accept')}>
                                <Text style={styles.challengeBtnText}>{t.challengeAccept || 'Kabul Et'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.challengeBtn, { backgroundColor: '#dc2626' }]} onPress={() => respondToChallenge(item.meta.challengeId, 'decline')}>
                                <Text style={styles.challengeBtnText}>{t.challengeDecline || 'Reddet'}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {item.meta?.kind === 'SCHEDULE_PROPOSAL' && item.meta.status === 'PENDING' && item.senderId !== myId && (
                        <View style={styles.challengeActions}>
                            <TouchableOpacity style={[styles.challengeBtn, { backgroundColor: '#16a34a' }]} onPress={() => acceptScheduleProposal(item.meta.challengeId)}>
                                <Text style={styles.challengeBtnText}>{t.challengeAcceptSchedule || 'Tarihi Kabul Et'}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.challengeBtn, { backgroundColor: '#7c3aed' }]} onPress={() => {
                                setSchedDate(item.meta.date || '');
                                setSchedTime(item.meta.time || '');
                                setSchedPlace(item.meta.courtName || item.meta.location || '');
                                setScheduleOpen(true);
                            }}>
                                <Text style={styles.challengeBtnText}>{t.challengeCounterSchedule || 'Karşı Öneri'}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {item.sharedPost && (
                        <TouchableOpacity style={styles.msgEquipCard} onPress={() => openSharedCard(item.sharedPost)} activeOpacity={0.8}>
                            {item.sharedPost.locked ? (
                                <View style={[styles.msgEquipImg, styles.equipBannerImgPh]}><Text style={{ fontSize: 16 }}>🔒</Text></View>
                            ) : item.sharedPost.imageUrl || item.sharedPost.videoUrl ? (
                                <Image source={{ uri: item.sharedPost.imageUrl || item.sharedPost.videoUrl }} style={styles.msgEquipImg} resizeMode="cover" />
                            ) : (
                                <View style={[styles.msgEquipImg, styles.equipBannerImgPh]}>
                                    <Text style={{ fontSize: 16 }}>{item.sharedPost.type === 'REEL' ? '🎬' : item.sharedPost.type === 'STORY' ? '⭕' : '🖼️'}</Text>
                                </View>
                            )}
                            <View style={{ flex: 1 }}>
                                <Text style={styles.msgEquipTitle} numberOfLines={1}>
                                    {item.sharedPost.locked
                                        ? (t.sharedPostCardLocked || 'Kilitli')
                                        : sharedKindLabel(item.sharedPost.type)}
                                    {item.sharedPost.user?.username ? ` · @${item.sharedPost.user.username}` : ''}
                                </Text>
                                <Text style={styles.msgEquipPrice} numberOfLines={2}>
                                    {item.sharedPost.locked
                                        ? (item.sharedPost.lockMessage || t.sharedPostLockedTitle || 'Görüntülenemiyor')
                                        : (item.sharedPost.content || sharedKindLabel(item.sharedPost.type))}
                                </Text>
                            </View>
                        </TouchableOpacity>
                    )}
                    {item.imageUrl && (
                        <Image source={{ uri: item.imageUrl }} style={styles.msgImage} resizeMode="cover" />
                    )}
                    {item.audioUrl && (
                        <TouchableOpacity style={styles.audioRow} onPress={() => playAudio(item)} activeOpacity={0.8}>
                            <Text style={styles.audioPlayIcon}>{playingId === item.id ? '⏸' : '▶️'}</Text>
                            <View style={styles.audioWave} />
                            <Text style={[styles.audioDuration, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
                                {item.audioDuration ? `${Math.floor(item.audioDuration / 60)}:${String(item.audioDuration % 60).padStart(2, '0')}` : ''}
                            </Text>
                        </TouchableOpacity>
                    )}
                    {!!item.content && <Text style={styles.bubbleText}>{item.content}</Text>}
                    </>
                    )}
                    <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
                        {new Date(item.createdAt).toLocaleTimeString(t.dateLocale, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </TouchableOpacity>
                </View>
            </>
        );
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
                    <Text style={styles.backText}>←</Text>
                </TouchableOpacity>
                <Avatar user={other} size={36} />
                <View style={styles.headerInfo}>
                    <Text style={styles.headerName}>{other?.fullName || other?.username}</Text>
                    <Text style={styles.headerSub}>{other?.username}</Text>
                </View>
                <TouchableOpacity onPress={openOptionsMenu} disabled={blocking} style={styles.headerMenuBtn}>
                    <Text style={styles.headerMenuText}>⋮</Text>
                </TouchableOpacity>
            </View>

            {/* Activity Context Banner — her iki tarafta da (route param veya mesaj geçmişi) */}
            {rivalCtx && (
                <TouchableOpacity style={styles.rivalBanner} onPress={() => openRivalListing(rivalCtx)} activeOpacity={0.85}>
                    <Text style={styles.rivalBannerLabel}>📋 {t.ilanDetail || 'Listing Detail'}</Text>
                    <View style={styles.rivalBannerRow}>
                        <Text style={styles.rivalBannerChip}>🏅 {getSubCategoryLabel(rivalCtx.subCategory, t.lang)}{formatRivalMatchType(rivalCtx)}{rivalCtx.level ? ` · ${rivalCtx.level}` : ''}</Text>
                        {formatRivalDate(rivalCtx) ? (
                            <Text style={styles.rivalBannerChip}>📅 {formatRivalDate(rivalCtx)}</Text>
                        ) : null}
                        {(rivalCtx.courtName || rivalCtx.location) && (
                            <Text style={styles.rivalBannerChip}>📍 {rivalCtx.courtName || rivalCtx.location}</Text>
                        )}
                    </View>
                </TouchableOpacity>
            )}

            {/* Equipment Context Banner */}
            {equipment && (
                <TouchableOpacity style={styles.equipBanner} onPress={() => openEquipmentListing(equipment)} activeOpacity={0.8}>
                    {equipment.images?.[0] ? (
                        <Image source={{ uri: equipment.images[0] }} style={styles.equipBannerImg} resizeMode="cover" />
                    ) : (
                        <View style={[styles.equipBannerImg, styles.equipBannerImgPh]}><Text style={{ fontSize: 20 }}>🎾</Text></View>
                    )}
                    <View style={{ flex: 1 }}>
                        <Text style={styles.equipBannerTitle} numberOfLines={1}>{equipment.title}</Text>
                        <Text style={styles.equipBannerPrice}>{equipment.price > 0 ? `${equipment.price} ₺` : 'Fiyat sor'}</Text>
                    </View>
                    <Text style={styles.equipBannerArrow}>›</Text>
                </TouchableOpacity>
            )}

            {/* Coach Listing Context Banner — hem başlatan hem karşı tarafta görünür */}
            {coachListingCtx && (
                <TouchableOpacity style={styles.equipBanner} onPress={() => openCoachListing(coachListingCtx)} activeOpacity={0.8}>
                    <View style={[styles.equipBannerImg, styles.equipBannerImgPh]}><Text style={{ fontSize: 20 }}>🎓</Text></View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.equipBannerTitle} numberOfLines={1}>{coachListingCtx.credentialLevel}{coachListingCtx.certName ? ` · ${coachListingCtx.certName}` : ''}</Text>
                        <Text style={styles.equipBannerPrice}>{coachListingCtx.priceIndividual > 0 ? `${coachListingCtx.priceIndividual} ₺/saat` : 'Antrenörlük ilanı hakkında'}</Text>
                    </View>
                    <Text style={styles.equipBannerArrow}>›</Text>
                </TouchableOpacity>
            )}

            {clubListingCtx && (
                <TouchableOpacity style={styles.equipBanner} onPress={() => openClubListing(clubListingCtx)} activeOpacity={0.8}>
                    <View style={[styles.equipBannerImg, styles.equipBannerImgPh]}><Text style={{ fontSize: 20 }}>🏟️</Text></View>
                    <View style={{ flex: 1 }}>
                        <Text style={styles.equipBannerTitle} numberOfLines={1}>{clubListingCtx.name}</Text>
                        <Text style={styles.equipBannerPrice}>{clubListingCtx.membershipFee > 0 ? `${clubListingCtx.membershipFee} ₺/ay` : (t.clubChatAbout || 'Kulüp hakkında')}</Text>
                    </View>
                    <Text style={styles.equipBannerArrow}>›</Text>
                </TouchableOpacity>
            )}

            {/* Messages */}
            {loading ? (
                <ActivityIndicator color={colors.purple} style={{ flex: 1 }} />
            ) : (
                <FlatList
                    ref={flatRef}
                    data={messages}
                    keyExtractor={item => item.id}
                    renderItem={renderMessage}
                    contentContainerStyle={styles.list}
                    // Eski sayfa üste eklendiğinde (prepend) tek bir contentSizeChange
                    // "tüketilir" — yoksa maintainVisibleContentPosition'ın koruduğu
                    // kaydırma konumu her seferinde en alta zıplardı.
                    onContentSizeChange={() => {
                        if (isPrependingRef.current) { isPrependingRef.current = false; return; }
                        flatRef.current?.scrollToEnd({ animated: false });
                    }}
                    onScroll={({ nativeEvent }) => {
                        if (nativeEvent.contentOffset.y < 60) loadOlderMessages();
                    }}
                    scrollEventThrottle={200}
                    maintainVisibleContentPosition={{ minIndexForVisible: 0 }}
                    ListHeaderComponent={loadingOlder ? <ActivityIndicator color={colors.purple} style={{ marginVertical: 10 }} /> : null}
                    ListEmptyComponent={
                        <View style={styles.empty}>
                            <Avatar user={other} size={52} />
                            <Text style={styles.emptyName}>{other?.fullName || other?.username}</Text>
                            <Text style={styles.emptyHint}>{t.chatSayHello}</Text>
                        </View>
                    }
                />
            )}

            {/* Görüldü bilgisi — sadece son mesajı ben attıysam ve karşı taraf sohbetin
                içine girip okuduysa (readAt) gösterilir, mesaj ulaştığında değil. */}
            {(() => {
                const lastMine = [...messages].reverse().find(m => m.senderId === myId);
                if (!lastMine?.read || !lastMine?.readAt) return null;
                return <Text style={styles.seenText}>{timeAgo(lastMine.readAt)}</Text>;
            })()}

            {/* Meydan okuma kabul edildiyse yer/zaman öneri şeridi */}
            {activeChallengeMeta?.challengeId && !scheduleOpen && (
                <TouchableOpacity style={styles.scheduleBanner} onPress={() => setScheduleOpen(true)} activeOpacity={0.85}>
                    <Text style={styles.scheduleBannerText}>{t.challengeProposeCta || '📅 Yer ve zaman öner'}</Text>
                </TouchableOpacity>
            )}
            {scheduleOpen && (
                <View style={styles.scheduleForm}>
                    <TextInput
                        style={styles.scheduleInput}
                        placeholder={t.challengeDatePh || 'Tarih (YYYY-MM-DD)'}
                        placeholderTextColor={colors.textMuted}
                        value={schedDate}
                        onChangeText={setSchedDate}
                    />
                    <TextInput
                        style={styles.scheduleInput}
                        placeholder={t.challengeTimePh || 'Saat (HH:MM)'}
                        placeholderTextColor={colors.textMuted}
                        value={schedTime}
                        onChangeText={setSchedTime}
                    />
                    <TextInput
                        style={styles.scheduleInput}
                        placeholder={t.challengePlacePh || 'Mekan / kort (opsiyonel)'}
                        placeholderTextColor={colors.textMuted}
                        value={schedPlace}
                        onChangeText={setSchedPlace}
                    />
                    <View style={{ flexDirection: 'row', gap: 8 }}>
                        <TouchableOpacity style={[styles.challengeBtn, { flex: 1, backgroundColor: colors.surface2 }]} onPress={() => setScheduleOpen(false)}>
                            <Text style={styles.challengeBtnText}>{t.cancelBtn || 'Vazgeç'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.challengeBtn, { flex: 1, backgroundColor: '#7c3aed', opacity: schedBusy ? 0.6 : 1 }]} disabled={schedBusy} onPress={submitScheduleProposal}>
                            <Text style={styles.challengeBtnText}>{schedBusy ? '...' : (t.challengeSendProposal || 'Öner')}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}

            {/* Input */}
            <View style={styles.inputRow}>
                {isRecording ? (
                    <>
                        <TouchableOpacity onPress={cancelRecording} style={styles.mediaBtn}>
                            <Text style={styles.mediaBtnText}>✕</Text>
                        </TouchableOpacity>
                        <View style={styles.recordingIndicator}>
                            <Text>🔴</Text>
                            <Text style={styles.recordingTime}>{Math.floor(recordSeconds / 60)}:{String(recordSeconds % 60).padStart(2, '0')}</Text>
                        </View>
                        <TouchableOpacity style={styles.sendBtn} onPress={stopRecordingAndSend} disabled={uploadingMedia}>
                            <Text style={styles.sendText}>{uploadingMedia ? '...' : '➤'}</Text>
                        </TouchableOpacity>
                    </>
                ) : (
                    <>
                        <TouchableOpacity onPress={pickAndSendImage} disabled={uploadingMedia} style={styles.mediaBtn}>
                            <Text style={styles.mediaBtnText}>📷</Text>
                        </TouchableOpacity>
                        <TextInput
                            style={styles.input}
                            value={input}
                            onChangeText={setInput}
                            placeholder={t.chatInputPh}
                            placeholderTextColor={colors.textMuted}
                            multiline
                            onSubmitEditing={send}
                        />
                        {input.trim() ? (
                            <TouchableOpacity style={[styles.sendBtn, sending && styles.sendBtnDisabled]} onPress={send} disabled={sending}>
                                <Text style={styles.sendText}>{sending ? '...' : '➤'}</Text>
                            </TouchableOpacity>
                        ) : (
                            <TouchableOpacity onPress={startRecording} disabled={uploadingMedia} style={styles.mediaBtn}>
                                <Text style={styles.mediaBtnText}>🎤</Text>
                            </TouchableOpacity>
                        )}
                    </>
                )}
            </View>

            {/* Şikayet Et */}
            <Modal visible={reportModalVisible} animationType="slide" transparent onRequestClose={() => setReportModalVisible(false)}>
                <View style={styles.reportOverlay}>
                    <View style={styles.reportBox}>
                        <Text style={styles.reportTitle}>🚩 Kullanıcıyı Şikayet Et</Text>
                        <Text style={styles.reportHint}>Uygunsuz içerik (cinsel içerikli fotoğraf, küfür/argo, taciz vb.) için sebep belirtin, ekibimiz inceleyecek.</Text>
                        <TextInput
                            style={styles.reportInput}
                            value={reportReason}
                            onChangeText={setReportReason}
                            placeholder="Şikayet sebebinizi yazın..."
                            placeholderTextColor={colors.textMuted}
                            multiline
                        />
                        <TouchableOpacity
                            style={[styles.reportSubmitBtn, (!reportReason.trim() || reportSubmitting) && styles.sendBtnDisabled]}
                            onPress={submitReport}
                            disabled={!reportReason.trim() || reportSubmitting}>
                            <Text style={styles.reportSubmitText}>{reportSubmitting ? '...' : 'Şikayeti Gönder'}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setReportModalVisible(false)} style={{ alignItems: 'center', marginTop: 10 }}>
                            <Text style={{ color: colors.textMuted }}>Vazgeç</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            </Modal>

            <Modal visible={!!sharedPreview} animationType="fade" transparent onRequestClose={() => setSharedPreview(null)}>
                <View style={{ flex: 1, backgroundColor: '#000000ee', justifyContent: 'center' }}>
                    <TouchableOpacity onPress={() => setSharedPreview(null)} style={{ position: 'absolute', top: 48, right: 18, zIndex: 2 }}>
                        <Text style={{ color: '#fff', fontSize: 22 }}>✕</Text>
                    </TouchableOpacity>
                    {sharedPreview && (
                        <View style={{ paddingHorizontal: 16 }}>
                            <Text style={{ color: colors.purple, fontWeight: '800', marginBottom: 10 }}>
                                {sharedKindLabel(sharedPreview.type)}
                                {sharedPreview.user?.username ? ` · @${sharedPreview.user.username}` : ''}
                            </Text>
                            {(sharedPreview.imageUrl || sharedPreview.videoUrl) ? (
                                <Image
                                    source={{ uri: sharedPreview.imageUrl || sharedPreview.videoUrl }}
                                    style={{ width: '100%', aspectRatio: sharedPreview.type === 'REEL' ? 9 / 16 : 1, borderRadius: 12, backgroundColor: colors.surface2 }}
                                    resizeMode="contain"
                                />
                            ) : null}
                            {!!sharedPreview.content && (
                                <Text style={{ color: '#fff', marginTop: 12, fontSize: 14 }}>{sharedPreview.content}</Text>
                            )}
                        </View>
                    )}
                </View>
            </Modal>

            {/* Sohbet başlığı menüsü: Mesajları Engelle / Şikayet Et */}
            <Modal visible={headerMenuVisible} animationType="fade" transparent onRequestClose={() => setHeaderMenuVisible(false)}>
                <TouchableOpacity style={styles.actionSheetOverlay} activeOpacity={1} onPress={() => setHeaderMenuVisible(false)}>
                    <View style={styles.actionSheetBox}>
                        <TouchableOpacity
                            style={styles.actionSheetRow}
                            onPress={() => { setHeaderMenuVisible(false); confirmBlock(); }}
                        >
                            <Text style={[styles.actionSheetRowText, { color: '#f87171' }]}>🔇 Mesajları Engelle</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.actionSheetRow}
                            onPress={() => { setHeaderMenuVisible(false); setReportReason(''); setReportModalVisible(true); }}
                        >
                            <Text style={styles.actionSheetRowText}>🚩 Şikayet Et</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionSheetRow, { borderBottomWidth: 0 }]} onPress={() => setHeaderMenuVisible(false)}>
                            <Text style={[styles.actionSheetRowText, { color: colors.textMuted }]}>Vazgeç</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>

            {/* Mesaj sil menüsü */}
            <Modal visible={!!messageOptionsFor} animationType="fade" transparent onRequestClose={closeMessageOptions}>
                <TouchableOpacity style={styles.actionSheetOverlay} activeOpacity={1} onPress={closeMessageOptions}>
                    <View style={styles.actionSheetBox}>
                        {messageOptionsFor?.senderId === myId && (
                            <TouchableOpacity
                                style={styles.actionSheetRow}
                                onPress={() => { const item = messageOptionsFor; closeMessageOptions(); confirmDeleteForEveryone(item); }}
                            >
                                <Text style={[styles.actionSheetRowText, { color: '#f87171' }]}>🗑️ Herkesten Sil</Text>
                            </TouchableOpacity>
                        )}
                        <TouchableOpacity
                            style={styles.actionSheetRow}
                            onPress={() => { const item = messageOptionsFor; closeMessageOptions(); deleteForMe(item); }}
                        >
                            <Text style={styles.actionSheetRowText}>🗑️ Benden Sil</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[styles.actionSheetRow, { borderBottomWidth: 0 }]} onPress={closeMessageOptions}>
                            <Text style={[styles.actionSheetRowText, { color: colors.textMuted }]}>Vazgeç</Text>
                        </TouchableOpacity>
                    </View>
                </TouchableOpacity>
            </Modal>
        </KeyboardAvoidingView>
    );
}

const styles = StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.bg },
    header: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingTop: 53, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: colors.border, gap: 3 },
    backBtn: { padding: 1 },
    backText: { color: colors.purple, fontSize: 22, fontWeight: '700' },
    avatar: { backgroundColor: colors.purple, justifyContent: 'center', alignItems: 'center' },
    avatarText: { color: '#fff', fontWeight: '800' },
    headerInfo: { flex: 1 },
    headerName: { color: '#fff', fontWeight: '700', fontSize: 14 },
    headerSub: { color: colors.textMuted, fontSize: 11 },
    headerMenuBtn: { paddingHorizontal: 8, paddingVertical: 4 },
    headerMenuText: { color: colors.textSecondary, fontSize: 22, fontWeight: '900' },
    rivalBanner: { backgroundColor: '#7c3aed18', borderBottomWidth: 1, borderBottomColor: '#7c3aed40', paddingHorizontal: 13, paddingVertical: 7, gap: 3 },
    rivalBannerLabel: { color: '#a78bfa', fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.5 },
    rivalBannerRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 3 },
    rivalBannerChip: { color: '#c4b5fd', fontSize: 12, fontWeight: '600', backgroundColor: '#7c3aed25', paddingHorizontal: 3, paddingVertical: 3, borderRadius: 20, overflow: 'hidden' },
    equipBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#16a34a18', borderBottomWidth: 1, borderBottomColor: '#16a34a40', paddingHorizontal: 13, paddingVertical: 7 },
    equipBannerImg: { width: 36, height: 36, borderRadius: 8 },
    equipBannerImgPh: { backgroundColor: colors.surface, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: colors.border },
    equipBannerTitle: { color: '#fff', fontSize: 13, fontWeight: '700' },
    equipBannerPrice: { color: '#4ade80', fontSize: 12, fontWeight: '800', marginTop: 1 },
    equipBannerArrow: { color: colors.textMuted, fontSize: 20 },
    msgEquipCard: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#00000020', borderRadius: 10, padding: 5, marginBottom: 6 },
    msgEquipImg: { width: 32, height: 32, borderRadius: 6 },
    msgEquipTitle: { color: '#fff', fontSize: 12, fontWeight: '700' },
    msgEquipPrice: { color: '#4ade80', fontSize: 11, fontWeight: '800' },
    list: { paddingHorizontal: 13, paddingVertical: 13, gap: 3 },
    newDivider: { flexDirection: 'row', alignItems: 'center', gap: 8, marginVertical: 10 },
    newDividerLine: { flex: 1, height: 1, backgroundColor: colors.purple + '60' },
    newDividerText: { color: colors.purple, fontSize: 11, fontWeight: '800' },
    msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowThem: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '72%', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18 },
    bubbleMe: { backgroundColor: colors.purple, borderBottomRightRadius: 4 },
    bubbleThem: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
    bubbleText: { color: '#fff', fontSize: 14 },
    deletedText: { color: colors.textMuted, fontSize: 13, fontStyle: 'italic' },
    bubbleTime: { fontSize: 10, marginTop: 4 },
    bubbleTimeMe: { color: '#d8b4fe' },
    bubbleTimeThem: { color: colors.textMuted },
    msgImage: { width: 190, height: 190, borderRadius: 12, marginBottom: 4 },
    audioRow: { flexDirection: 'row', alignItems: 'center', gap: 8, minWidth: 150, paddingVertical: 3 },
    audioPlayIcon: { fontSize: 18 },
    audioWave: { flex: 1, height: 3, borderRadius: 2, backgroundColor: '#ffffff40' },
    audioDuration: { fontSize: 11, fontWeight: '700' },
    seenText: { color: colors.textMuted, fontSize: 11, textAlign: 'right', paddingHorizontal: 16, paddingBottom: 4 },
    empty: { alignItems: 'center', paddingTop: 57, gap: 3 },
    emptyName: { color: '#fff', fontWeight: '700', fontSize: 15 },
    emptyHint: { color: colors.textMuted, fontSize: 13 },
    inputRow: { flexDirection: 'row', paddingHorizontal: 13, paddingVertical: 7, borderTopWidth: 1, borderTopColor: colors.border, gap: 3, alignItems: 'flex-end' },
    input: { flex: 1, backgroundColor: colors.surface, color: '#fff', borderRadius: 20, paddingHorizontal: 13, paddingVertical: 7, borderWidth: 1, borderColor: colors.border, fontSize: 14, maxHeight: 100 },
    sendBtn: { backgroundColor: colors.purple, borderRadius: 20, width: 44, height: 44, justifyContent: 'center', alignItems: 'center' },
    sendBtnDisabled: { opacity: 0.4 },
    sendText: { color: '#fff', fontWeight: '800', fontSize: 16 },
    mediaBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, justifyContent: 'center', alignItems: 'center' },
    mediaBtnText: { fontSize: 18 },
    recordingIndicator: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.surface, borderRadius: 20, paddingHorizontal: 14, height: 40, borderWidth: 1, borderColor: colors.border },
    recordingTime: { color: '#fff', fontSize: 14, fontWeight: '700' },
    reportOverlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
    reportBox: { backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 30 },
    reportTitle: { color: '#fff', fontSize: 16, fontWeight: '900', marginBottom: 8 },
    reportHint: { color: colors.textMuted, fontSize: 12, marginBottom: 12, lineHeight: 17 },
    reportInput: { minHeight: 80, textAlignVertical: 'top', backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: '#fff', fontSize: 13, paddingHorizontal: 12, paddingVertical: 10 },
    reportSubmitBtn: { marginTop: 12, backgroundColor: '#dc2626', borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
    reportSubmitText: { color: '#fff', fontSize: 14, fontWeight: '800' },
    actionSheetOverlay: { flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' },
    actionSheetBox: { backgroundColor: colors.surface, borderTopLeftRadius: 16, borderTopRightRadius: 16, paddingBottom: 20 },
    actionSheetRow: { paddingVertical: 15, paddingHorizontal: 20, borderBottomWidth: 1, borderBottomColor: colors.border + '50' },
    actionSheetRowText: { color: '#fff', fontSize: 15, fontWeight: '700', textAlign: 'center' },
    challengeActions: { flexDirection: 'row', gap: 6, marginTop: 6, marginBottom: 2 },
    challengeBtn: { flex: 1, borderRadius: 10, paddingVertical: 8, alignItems: 'center', paddingHorizontal: 6 },
    challengeBtnText: { color: '#fff', fontSize: 12, fontWeight: '800' },
    scheduleBanner: { backgroundColor: '#7c3aed22', borderTopWidth: 1, borderTopColor: '#7c3aed50', paddingVertical: 10, paddingHorizontal: 14, alignItems: 'center' },
    scheduleBannerText: { color: '#c4b5fd', fontSize: 13, fontWeight: '800' },
    scheduleForm: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, padding: 12, gap: 8 },
    scheduleInput: { backgroundColor: colors.surface2, borderRadius: 10, borderWidth: 1, borderColor: colors.border, color: '#fff', fontSize: 13, paddingHorizontal: 12, paddingVertical: 9 },
});
