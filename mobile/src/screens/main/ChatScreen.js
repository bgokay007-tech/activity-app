import { useEffect, useState, useRef, useCallback } from 'react';
import { View, Text, FlatList, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, KeyboardAvoidingView, Platform, Alert, Image, Modal } from 'react-native';
import { useSelector } from 'react-redux';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import api from '../../services/api';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import { onSocket } from '../../services/socket';

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
    const { conversation: convParam, other: otherProp, rival, equipment, coach } = route.params;
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

    const other = otherProp || convParam?.other;

    // "coach" route param yalnızca "İletişime Geç" ile sohbeti başlatan tarafta
    // olur — karşı taraf sohbeti Mesajlar listesinden veya bildirimden açtığında
    // bu parametreyi almaz. Banner'ı, hangi taraf açarsa açsın görünsün diye
    // mesaj geçmişindeki ilan referansından da (varsa) türetiyoruz.
    const coachListingCtx = coach || [...messages].reverse().find(m => m.coachListing)?.coachListing || null;

    const openEquipmentListing = (listing) => {
        if (!listing?.category || !listing?.subCategory) return;
        navigation.push('SubCategory', { category: listing.category, sub: listing.subCategory, initialTab: 'equipment', openEquipmentId: listing.id });
    };

    const openCoachListing = (listing) => {
        if (!listing?.category || !listing?.subCategory) return;
        navigation.push('SubCategory', { category: listing.category, sub: listing.subCategory, initialTab: 'coaches', openCoachId: listing.id });
    };

    const openOptionsMenu = () => {
        if (!other?.id) return;
        Alert.alert(
            other?.fullName || other?.username || '',
            undefined,
            [
                { text: '🚫 Engelle', style: 'destructive', onPress: confirmBlock },
                { text: '🚩 Şikayet Et', onPress: () => { setReportReason(''); setReportModalVisible(true); } },
                { text: 'Vazgeç', style: 'cancel' },
            ],
        );
    };

    const confirmBlock = () => {
        Alert.alert(
            'Kullanıcıyı Engelle',
            `${other?.fullName || other?.username} kullanıcısını engellemek istediğinize emin misiniz? Engellediğinizde birbirinize mesaj gönderemezsiniz.`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'Engelle', style: 'destructive', onPress: async () => {
                        setBlocking(true);
                        try {
                            await api.post(`/friends/block/${other.id}`);
                            Alert.alert('', 'Kullanıcı engellendi.');
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

    const fetchMessages = useCallback(async (id) => {
        if (!id) return;
        try {
            const { data } = await api.get(`/messages/conversation/${id}/messages`);
            setMessages(data);
        } catch { /* silent — network may be slow */ }
    }, []);

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
                    await fetchMessages(id);
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
            fetchMessages(convIdRef.current);
        }, 10000);

        return () => clearInterval(pollRef.current);
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
            <View style={[styles.msgRow, isMe ? styles.msgRowMe : styles.msgRowThem]}>
                {!isMe && <Avatar user={item.sender} size={30} />}
                <View style={[styles.bubble, isMe ? styles.bubbleMe : styles.bubbleThem]}>
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
                    <Text style={[styles.bubbleTime, isMe ? styles.bubbleTimeMe : styles.bubbleTimeThem]}>
                        {new Date(item.createdAt).toLocaleTimeString(t.dateLocale, { hour: '2-digit', minute: '2-digit' })}
                    </Text>
                </View>
            </View>
        );
    };

    return (
        <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
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

            {/* Activity Context Banner */}
            {rival && (
                <View style={styles.rivalBanner}>
                    <Text style={styles.rivalBannerLabel}>📋 İlan Detayı</Text>
                    <View style={styles.rivalBannerRow}>
                        <Text style={styles.rivalBannerChip}>🏅 {rival.subCategory}{rival.matchType && rival.matchType !== 'PLAYER_WANTED' ? ` · ${rival.matchType === 'DOUBLE' ? '2v2' : '1v1'}` : ''}{rival.level ? ` · ${rival.level}` : ''}</Text>
                        {rival.flexibleSchedule ? (
                            <Text style={styles.rivalBannerChip}>📅 Esnek tarih</Text>
                        ) : rival.matchDate ? (
                            <Text style={styles.rivalBannerChip}>📅 {new Date(rival.matchDate).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long' })}{rival.matchTime ? ` · ${rival.matchTime}` : ''}</Text>
                        ) : null}
                        {(rival.courtName || rival.location) && (
                            <Text style={styles.rivalBannerChip}>📍 {rival.courtName || rival.location}</Text>
                        )}
                    </View>
                </View>
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
                    onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: false })}
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
    msgRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 3 },
    msgRowMe: { justifyContent: 'flex-end' },
    msgRowThem: { justifyContent: 'flex-start' },
    bubble: { maxWidth: '72%', paddingHorizontal: 11, paddingVertical: 7, borderRadius: 18 },
    bubbleMe: { backgroundColor: colors.purple, borderBottomRightRadius: 4 },
    bubbleThem: { backgroundColor: colors.surface, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colors.border },
    bubbleText: { color: '#fff', fontSize: 14 },
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
});
