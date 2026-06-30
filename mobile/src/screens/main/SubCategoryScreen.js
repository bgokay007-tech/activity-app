import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet,
    RefreshControl, ActivityIndicator, TextInput, Modal,
    Alert, KeyboardAvoidingView, Platform, Switch, Linking, Image,
    InteractionManager,
} from 'react-native';
import { useSelector } from 'react-redux';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import { Audio } from 'expo-av';
import * as DocumentPicker from 'expo-document-picker';
import api from '../../services/api';
import { onSocket, onSocketReconnect } from '../../services/socket';
import colors from '../../theme/colors';
import { moderateScale } from '../../theme/scale';
import useT from '../../hooks/useT';
import CityPickerModal from '../../components/CityPickerModal';
import CityAutocomplete from '../../components/CityAutocomplete';

// ─── Constants ────────────────────────────────────────────────────────────────

const TR_PROVINCES = [
    'Adana','Adıyaman','Afyonkarahisar','Ağrı','Aksaray','Amasya','Ankara','Antalya',
    'Ardahan','Artvin','Aydın','Balıkesir','Bartın','Batman','Bayburt','Bilecik',
    'Bingöl','Bitlis','Bolu','Burdur','Bursa','Çanakkale','Çankırı','Çorum',
    'Denizli','Diyarbakır','Düzce','Edirne','Elazığ','Erzincan','Erzurum','Eskişehir',
    'Gaziantep','Giresun','Gümüşhane','Hakkari','Hatay','Iğdır','Isparta','İstanbul',
    'İzmir','Kahramanmaraş','Karabük','Karaman','Kars','Kastamonu','Kayseri','Kilis',
    'Kırıkkale','Kırklareli','Kırşehir','Kocaeli','Konya','Kütahya','Malatya','Manisa',
    'Mardin','Mersin','Muğla','Muş','Nevşehir','Niğde','Ordu','Osmaniye','Rize',
    'Sakarya','Samsun','Siirt','Sinop','Sivas','Şanlıurfa','Şırnak','Tekirdağ',
    'Tokat','Trabzon','Tunceli','Uşak','Van','Yalova','Yozgat','Zonguldak',
];

const TEAM_SPORTS = new Set(['football', 'volleyball']);

const FOOTBALL_SURFACES = [
    { id: 'HALI_SAHA', label: 'Halı Saha', emoji: '🟩' },
    { id: 'CIM_SAHA',  label: 'Çim Saha',  emoji: '🌿' },
    { id: 'FUTSAL',    label: 'Futsal',    emoji: '🏟️' },
    { id: 'SOKAK',     label: 'Sokak',     emoji: '🛣️' },
    { id: 'BEACH',     label: 'Plaj',      emoji: '🏖️' },
    { id: 'BALON',     label: 'Balon',     emoji: '🎈' },
];
const VOLLEYBALL_SURFACES = [
    { id: 'INDOOR', label: 'Kapalı',  emoji: '🏟️' },
    { id: 'BEACH',  label: 'Plaj',    emoji: '🏖️' },
    { id: 'GRASS',  label: 'Çim',     emoji: '🌿' },
];
const FOOTBALL_SIZES = [2,3,4,5,6,7,8,9,10,11];
const VOLLEYBALL_SIZES = [1,2,3,4,5,6];

const DURATIONS = ['60','90','120','150'];

const LEVELS = ['BEGINNER','INTERMEDIATE','ADVANCED','PRO'];
const LEVEL_EMOJI = { BEGINNER:'🟢', INTERMEDIATE:'🟡', ADVANCED:'🟠', PRO:'🔴' };
const TIME_OPTS = (() => {
    const out = [{ value:'', label:'--:--' }];
    for (let h=0; h<24; h++) for (let m=0; m<60; m+=15) {
        const hh = String(h).padStart(2,'0');
        const mm = String(m).padStart(2,'0');
        out.push({ value:`${hh}:${mm}`, label:`${hh}:${mm}` });
    }
    return out;
})();

const SUB_CONFIG = {
    tennis:     { name:'Tennis',     nameTR:'Tenis',      emoji:'🎾', color: colors.yellow  || '#eab308' },
    padel:      { name:'Padel',      nameTR:'Padel',      emoji:'🏓', color: colors.cyan    || '#06b6d4' },
    football:   { name:'Football',   nameTR:'Futbol',     emoji:'⚽', color: colors.green   || '#16a34a' },
    basketball: { name:'Basketball', nameTR:'Basketbol',  emoji:'🏀', color:'#f97316' },
    volleyball: { name:'Volleyball', nameTR:'Voleybol',   emoji:'🏐', color:'#a855f7' },
    default:    { name:'Sport',      nameTR:'Spor',       emoji:'🏅', color: colors.purple },
};

function getConfig(sub) {
    return SUB_CONFIG[sub] || { ...SUB_CONFIG.default, name: sub.charAt(0).toUpperCase()+sub.slice(1) };
}

function getTabs(sub) {
    if (sub === 'football' || sub === 'volleyball')
        return ['rivals', 'player_wanted', 'tournaments', 'coaches', 'archive', ...(sub==='football' ? ['referee'] : []), 'media'];
    if (sub === 'tennis' || sub === 'padel')
        return ['rivals', 'tournaments', 'coaches', 'equipment', 'media', 'news', 'posts', 'archive'];
    return ['rivals', 'tournaments', 'coaches', 'archive', 'media'];
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

const starEmoji = (rating) => rating > 5 ? '⭐⭐⭐' : '⭐';

// Returns sport alias if set, otherwise falls back to @username
// Handles both the sender shape ({interests:[{alias}]}) and the participant snapshot shape ({alias})
const senderAlias = (p) => p?.alias || p?.interests?.[0]?.alias || `@${p?.username}`;
const playerDisplayName = (p) => p?.alias || p?.interests?.[0]?.alias || p?.fullName || p?.username || '';

// Çiftler Rekabetçi: katılımcı/başvuru satırlarını karşılıklı partnerId'ye göre
// ikili (pairs) ve bireysel (solos) olarak gruplar — backend formTeamsForTournament
// ile aynı eşleşme mantığı (mutual partnerId).
function groupDoublesPairs(rows) {
    const byUserId = new Map(rows.filter(r => r.userId).map(r => [r.userId, r]));
    const paired = new Set();
    const pairs = [];
    for (const r of rows) {
        if (!r.userId || paired.has(r.userId) || !r.partnerId) continue;
        const partner = byUserId.get(r.partnerId);
        if (partner && partner.partnerId === r.userId && !paired.has(partner.userId)) {
            paired.add(r.userId); paired.add(partner.userId);
            pairs.push([r, partner]);
        }
    }
    const solos = rows.filter(r => r.userId && !paired.has(r.userId));
    return { pairs, solos, byUserId };
}

// Çiftler Rekabetçi: eşleşmiş çiftleri ve bireyselleri tek bir "takım slotu" listesine
// (en erken kabul/başvuru zamanına göre sıralı) birleştirir, sonra GERÇEK KİŞİ SAYISINA
// göre (maxPlayers kişi, takım değil) AS (ana) / YEDEK olarak böler. Eşleşmiş çift = 2 kişi,
// partner adı vermiş ama o kişi henüz başvurmamış bireysel = 2 kişi (yer ayrılır),
// her diğer bireysel kart = 1 kişi (kart başına 1 gerçek başvuran var).
function splitDoublesSlots(pairs, solos, byUserId, maxPlayers) {
    const timeOf = (r) => new Date(r.acceptedAt || r.createdAt).getTime();
    const slots = [
        ...pairs.map(([a, b]) => ({ a, b, t: Math.min(timeOf(a), timeOf(b)), size: 2 })),
        ...solos.map(s => ({ a: s, b: null, t: timeOf(s), size: (s.partnerId && !byUserId.has(s.partnerId)) ? 2 : 1 })),
    ].sort((x, y) => x.t - y.t);
    if (!maxPlayers) return { mainSlots: slots, waitSlots: [] };
    const mainSlots = [];
    const waitSlots = [];
    let count = 0;
    for (const slot of slots) {
        if (count + slot.size <= maxPlayers) { mainSlots.push(slot); count += slot.size; }
        else waitSlots.push(slot);
    }
    return { mainSlots, waitSlots };
}

// Opens the device's maps app at the court location, falling back to a Google Maps search
const openCourtMap = (courtName, courtLat, courtLng, courtAddress) => {
    if (courtLat && courtLng) {
        const url = Platform.OS === 'ios'
            ? `maps://?ll=${courtLat},${courtLng}&q=${encodeURIComponent(courtName)}`
            : `geo:${courtLat},${courtLng}?q=${encodeURIComponent(courtName)}`;
        Linking.openURL(url).catch(() => {
            Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${courtLat},${courtLng}`);
        });
    } else if (courtAddress || courtName) {
        const q = encodeURIComponent(courtAddress || courtName);
        Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
    }
};

function Avatar({ name, avatar, size=40, color=colors.purple, onPress }) {
    const circle = (
        <View style={[s.avatar, { width:size, height:size, borderRadius:size/2, backgroundColor: color+'40', borderColor: color+'60', overflow:'hidden' }]}>
            {avatar
                ? <Image source={{ uri: avatar }} style={{ width:size, height:size }} resizeMode="cover" />
                : <Text style={[s.avatarText, { fontSize:size*0.38, color:color }]}>{name?.[0]?.toUpperCase()||'?'}</Text>
            }
        </View>
    );
    if (!onPress) return circle;
    return <TouchableOpacity onPress={onPress} activeOpacity={0.7}>{circle}</TouchableOpacity>;
}

// ─── User Profile Modal ────────────────────────────────────────────────────────

const LEVEL_COLORS = { BEGINNER:'#4ade80', INTERMEDIATE:'#facc15', ADVANCED:'#fb923c', PRO:'#f87171' };

function UserProfileModal({ visible, userId, onClose, navigation }) {
    const t = useT();
    const [profile, setProfile] = useState(null);
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        if (!visible || !userId) return;
        setLoading(true);
        setProfile(null);
        api.get(`/users/${userId}`)
            .then(r => setProfile(r.data))
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [visible, userId]);

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.modalOverlay}>
                <View style={[s.modalBox, { maxHeight: '85%' }]}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>{t.profileModalTitle}</Text>
                        <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                    </View>

                    {loading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginTop: 40, marginBottom: 40 }} />
                    ) : !profile ? (
                        <Text style={{ color: colors.textMuted, textAlign: 'center', marginVertical: 40 }}>{t.profileNotFound}</Text>
                    ) : profile.isPrivate ? (
                        <View style={{ alignItems: 'center', paddingVertical: 40, gap: 12 }}>
                            <Avatar name={profile.username} size={64} />
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{profile.fullName || profile.username}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 13 }}>@{profile.username}</Text>
                            <View style={s.privateBox}>
                                <Text style={s.privateText}>{t.privateAccount}</Text>
                            </View>
                            {profile.interests?.some(i => i.lateCancelCount > 0) && (
                                <View style={{ gap: 6, width: '100%' }}>
                                    {profile.interests.filter(i => i.lateCancelCount > 0).map(i => (
                                        <View key={i.id} style={{ backgroundColor:'#dc262615', borderRadius:10, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor:'#dc262640', flexDirection:'row', justifyContent:'space-between' }}>
                                            <Text style={{ color:'#f87171', fontSize:12, fontWeight:'700' }}>{i.subCategory}</Text>
                                            <Text style={{ color:'#f87171', fontSize:12, fontWeight:'800' }}>{t.lateCancelLabel(i.lateCancelCount)}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}
                        </View>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {/* Header */}
                            <View style={s.profileHeader}>
                                <Avatar name={profile.username} size={72} color={colors.purple} />
                                <Text style={s.profileName}>{profile.fullName || profile.username}</Text>
                                <Text style={s.profileUsername}>@{profile.username}</Text>
                                {profile.friendCount > 0 && (
                                    <Text style={s.profileMeta}>{t.friendsMeta(profile.friendCount, profile._count?.posts || 0)}</Text>
                                )}
                            </View>

                            {/* Bio */}
                            {profile.bio ? (
                                <View style={s.profileBioBox}>
                                    <Text style={s.profileBioText}>{profile.bio}</Text>
                                </View>
                            ) : null}

                            {/* Interests & Ratings */}
                            {profile.interests?.length > 0 && (
                                <View style={s.profileSection}>
                                    <Text style={s.profileSectionTitle}>{t.branchesAndRatings}</Text>
                                    {profile.interests.map(i => (
                                        <View key={i.id} style={s.profileInterestRow}>
                                            <View style={{ flex: 1 }}>
                                                <Text style={s.profileInterestName}>{i.subCategory}</Text>
                                                {(i.wins > 0 || i.losses > 0) && (
                                                    <Text style={s.profileWL}>{i.wins}G · {i.losses}M</Text>
                                                )}
                                            </View>
                                            <View style={{ alignItems: 'flex-end', gap: 4 }}>
                                                {i.assessmentCompleted && (
                                                    <Text style={[s.profileRating, { color: colors.purple }]}>
                                                        {Number(i.skillRating).toFixed(2)} ★
                                                    </Text>
                                                )}
                                                {i.level && (
                                                    <View style={[s.levelPill, { backgroundColor: (LEVEL_COLORS[i.level] || colors.purple) + '20', borderColor: (LEVEL_COLORS[i.level] || colors.purple) + '60' }]}>
                                                        <Text style={[s.levelPillText, { color: LEVEL_COLORS[i.level] || colors.purple }]}>
                                                            {t.levelTr[i.level] || i.level}
                                                        </Text>
                                                    </View>
                                                )}
                                                {i.lateCancelCount > 0 && (
                                                    <View style={{ backgroundColor:'#dc262615', borderRadius:8, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor:'#dc262640' }}>
                                                        <Text style={{ color:'#f87171', fontSize:10, fontWeight:'800' }}>{t.lateCancelLabel(i.lateCancelCount)}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Message button */}
                            <TouchableOpacity
                                style={[s.submitBtn, { backgroundColor: '#2563eb', marginTop: 8 }]}
                                onPress={() => {
                                    onClose();
                                    navigation.navigate('MessagesTab', {
                                        screen: 'Chat',
                                        params: { other: { id: profile.id, username: profile.username, fullName: profile.fullName }, conversation: { id: null, _userId: profile.id } },
                                    });
                                }}
                            >
                                <Text style={s.submitBtnText}>{t.msgSendBtn}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    )}
                </View>
            </View>
        </Modal>
    );
}

function EmptyState({ emoji, text, onAdd, addLabel }) {
    const t = useT();
    return (
        <View style={s.empty}>
            <Text style={s.emptyEmoji}>{emoji}</Text>
            <Text style={s.emptyText}>{text}</Text>
            {onAdd && (
                <TouchableOpacity style={s.emptyBtn} onPress={onAdd}>
                    <Text style={s.emptyBtnText}>{addLabel || t.addBtn}</Text>
                </TouchableOpacity>
            )}
        </View>
    );
}

function ModeBadge({ mode }) {
    const t = useT();
    if (mode === 'BOTH') return (
        <View style={[s.modeBadge, { backgroundColor:'#a855f720', borderColor:'#a855f740' }]}>
            <Text style={[s.modeBadgeText, { color:'#c084fc' }]}>{t.modeBoth}</Text>
        </View>
    );
    if (mode === 'COMPETITIVE') return (
        <View style={[s.modeBadge, { backgroundColor:'#dc262620', borderColor:'#dc262640' }]}>
            <Text style={[s.modeBadgeText, { color:'#f87171' }]}>{t.modeCompetitive}</Text>
        </View>
    );
    return (
        <View style={[s.modeBadge, { backgroundColor:'#2563eb20', borderColor:'#2563eb40' }]}>
            <Text style={[s.modeBadgeText, { color:'#60a5fa' }]}>{t.modePractice}</Text>
        </View>
    );
}

// ─── Rival Detail Modal ────────────────────────────────────────────────────────

const det = StyleSheet.create({
    section:      { backgroundColor: colors.surface2, borderRadius:moderateScale(14), padding:moderateScale(12), marginBottom:moderateScale(12), borderWidth:1, borderColor: colors.border },
    sectionTitle: { color:'#fff', fontSize:moderateScale(13), fontWeight:'800', marginBottom:moderateScale(10) },
    playerRow:    { flexDirection:'row', alignItems:'center', gap:moderateScale(10), paddingVertical:moderateScale(7), borderTopWidth:1, borderTopColor: colors.border },
    playerName:   { color:'#fff', fontSize:moderateScale(13), fontWeight:'700' },
    playerSub:    { color: colors.textMuted, fontSize:moderateScale(11), marginTop:1 },
    emptyTxt:     { color: colors.textMuted, fontSize:moderateScale(12), textAlign:'center', paddingVertical:moderateScale(8) },
    chatBtn:      { backgroundColor:'#2563eb30', borderRadius:moderateScale(8), width:moderateScale(28), height:moderateScale(28), justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:'#2563eb50' },
    chatBtnTxt:   { fontSize:moderateScale(13) },
});

function RivalDetailModal({ visible, item, myId, sub, cfg, t, onClose, navigation, handleJoin, handleCancel, handleRespondJoin, onEdit }) {
    const [localParticipants, setLocalParticipants] = useState(null);
    const [localJoinRequests, setLocalJoinRequests] = useState(null);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [sendingComment, setSendingComment] = useState(false);
    const [inviteModalVisible, setInviteModalVisible] = useState(false);
    const [inviteQuery, setInviteQuery] = useState('');
    const [inviteResults, setInviteResults] = useState([]);
    const [inviteSearching, setInviteSearching] = useState(false);
    const [invitingUserId, setInvitingUserId] = useState(null);

    // Çiftler: bireysel başvurmuşlar arası partner davet/kabul/geri çek
    const [partnerActionLoading, setPartnerActionLoading] = useState(false);
    const [showJoinInvitePicker, setShowJoinInvitePicker] = useState(false);
    const [joinInviteCandidates, setJoinInviteCandidates] = useState([]);
    const [seedingDemoRival, setSeedingDemoRival] = useState(false);

    useEffect(() => {
        setLocalParticipants(null);
        setLocalJoinRequests(null);
        setComments([]);
        setCommentText('');
        if (item?.id && visible) {
            setLoadingComments(true);
            api.get(`/rivals/${item.id}/comments`)
                .then(res => setComments(res.data || []))
                .catch(e => Alert.alert('Hata', e?.response?.data?.message || 'Yorumlar yüklenemedi'))
                .finally(() => setLoadingComments(false));
        }
    }, [item?.id, visible]);

    useEffect(() => {
        if (!visible || !item?.id) return;
        const off = onSocket('newComment', ({ rivalId, comment }) => {
            if (rivalId !== item.id) return;
            setComments(prev => prev.some(c => c.id === comment.id) ? prev : [...prev, comment]);
        });
        return off;
    }, [visible, item?.id]);

    useEffect(() => {
        if (!visible || !item?.id) return;
        const off = onSocket('rivalUpdate', (updated) => {
            if (updated.id !== item.id) return;
            if (Array.isArray(updated.joinRequests)) setLocalJoinRequests(updated.joinRequests);
            if (Array.isArray(updated.participants)) setLocalParticipants(updated.participants);
        });
        return off;
    }, [visible, item?.id]);

    const isOwner = item.senderId === myId;
    const participants = localParticipants ?? (Array.isArray(item.participants) ? item.participants : []);
    const joinRequests = localJoinRequests ?? (Array.isArray(item.joinRequests) ? item.joinRequests : []);
    const required = item.matchType === 'DOUBLE'
        ? ((Array.isArray(item.senderTeam) && item.senderTeam.length > 0) ? 2 : 3)
        : (item.teamSize || 1);
    const senderSideCount = 1 + (Array.isArray(item.senderTeam) ? item.senderTeam.length : 0);
    const filled = participants.length;
    const mySentReq = item._myJoinStatus;
    const isFull = filled >= required;
    const isParticipant = participants.some(p => p.id === myId);
    const myInvite = joinRequests.find(jr => jr.userId === myId && jr.initiatedBy === 'OWNER');
    const isInvolved = isOwner || isParticipant || (mySentReq !== null && mySentReq !== undefined);
    const participantIds = new Set([item.senderId, ...participants.map(p => p.id)]);
    const canDeleteComment = (c) => {
        const isAuthor = c.user?.id === myId;
        const iAmParticipant = participantIds.has(myId);
        const commenterIsParticipant = participantIds.has(c.user?.id);
        return isAuthor || (iAmParticipant && !commenterIsParticipant);
    };

    useEffect(() => {
        if (!inviteModalVisible) return;
        if (!inviteQuery.trim() || inviteQuery.trim().length < 2) { setInviteResults([]); return; }
        setInviteSearching(true);
        const task = setTimeout(() => {
            api.get(`/users/search?q=${encodeURIComponent(inviteQuery.trim())}&subCategory=${sub}&category=${item.category}`)
                .then(res => setInviteResults(Array.isArray(res.data) ? res.data : []))
                .catch(() => setInviteResults([]))
                .finally(() => setInviteSearching(false));
        }, 400);
        return () => clearTimeout(task);
    }, [inviteQuery, inviteModalVisible]);

    const handleInvite = async (targetUser) => {
        setInvitingUserId(targetUser.id);
        try {
            await api.post(`/rivals/${item.id}/invite`, { userId: targetUser.id });
            Alert.alert('', t.inviteSentMsg(targetUser.fullName || targetUser.username));
            setInviteResults(prev => prev.filter(u => u.id !== targetUser.id));
        } catch (e) {
            Alert.alert(t.error, e?.response?.data?.message || t.actionFailed);
        } finally { setInvitingUserId(null); }
    };

    const acceptLocal = (jrId) => {
        const jr = joinRequests.find(r => r.id === jrId);
        if (jr?.user) {
            setLocalParticipants([...participants, { id: jr.user.id, username: jr.user.username, fullName: jr.user.fullName, avatar: jr.user.avatar }]);
            setLocalJoinRequests(joinRequests.filter(r => r.id !== jrId));
        }
        handleRespondJoin(jrId, 'accept');
    };

    const rejectLocal = (jrId) => {
        setLocalJoinRequests(joinRequests.filter(r => r.id !== jrId));
        handleRespondJoin(jrId, 'reject');
    };

    // Çiftler: kendi bireysel başvurumun partner durumunu değiştirir — davet et / kabul et / geri çek
    const setMyRivalJoinPartner = async (partnerId) => {
        setPartnerActionLoading(true);
        try {
            const { data } = await api.patch(`/rivals/${item.id}/join-partner`, { partnerId: partnerId || null });
            setLocalJoinRequests(prev => {
                const base = prev ?? joinRequests;
                return base.some(r => r.id === data.id) ? base.map(r => r.id === data.id ? { ...r, ...data } : r) : [...base, data];
            });
            setShowJoinInvitePicker(false);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally {
            setPartnerActionLoading(false);
        }
    };

    // İlan sahibi yanlışlıkla kabul ettiği bir katılımcıyı (çiftlerde takımın tamamını) çıkarır
    const removeRivalParticipant = (participantUserId, participantName) => {
        Alert.alert(
            'Katılımcıyı Çıkar',
            `${participantName ? '@' + participantName : 'Bu kullanıcı'} maçtan çıkarılacak, ilan tekrar açık hâle gelecek. Emin misiniz?`,
            [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'Çıkar', style: 'destructive', onPress: async () => {
                    try {
                        const { data } = await api.delete(`/rivals/${item.id}/participants/${participantUserId}`);
                        setLocalParticipants(Array.isArray(data?.request?.participants) ? data.request.participants : []);
                    } catch (e) {
                        Alert.alert('', e?.response?.data?.message || t.actionFailed);
                    }
                }},
            ]
        );
    };

    // Çiftler: eşleşmiş bir çifti ya da partner arayan bireyseli ikili kart olarak render eder
    const renderRivalDuoCard = (p1, p2, solos, byUserId) => {
        const nameOf = (jr) => jr?.user?.fullName || jr?.user?.username || '';
        const ratingOf = (jr) => jr?.user?.interests?.find(i => i.subCategory === sub)?.skillRating;
        const Half = ({ jr }) => (
            <View>
                <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }} numberOfLines={1}>{nameOf(jr)}</Text>
                <Text style={{ color: colors.textMuted, fontSize:9 }} numberOfLines={1}>@{jr?.user?.username}{ratingOf(jr) != null ? `  ${starEmoji(Number(ratingOf(jr)))} ${Number(ratingOf(jr)).toFixed(2)}` : ''}</Text>
            </View>
        );

        let slot2;
        if (p2) {
            slot2 = <Half jr={p2} />;
        } else {
            const isMine = p1.userId === myId;
            const invitedBy = solos.find(o => o.partnerId === p1.userId && o.userId !== p1.userId);
            if (p1.partnerId) {
                const target = byUserId.get(p1.partnerId);
                slot2 = (
                    <View>
                        <Text style={{ color:'#fbbf24', fontSize:9, fontWeight:'700' }} numberOfLines={1}>⏳ {nameOf(target) || '...'} (Bekliyor)</Text>
                        {isMine && (
                            <TouchableOpacity onPress={() => setMyRivalJoinPartner(null)} disabled={partnerActionLoading} style={{ marginTop:2 }}>
                                <Text style={{ color:'#f87171', fontSize:9, fontWeight:'700' }}>✕ Geri Çek</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                );
            } else if (invitedBy) {
                slot2 = (
                    <View>
                        <Text style={{ color:'#4ade80', fontSize:9, fontWeight:'700' }} numberOfLines={1}>{nameOf(invitedBy)} davet etti</Text>
                        {isMine && (
                            <TouchableOpacity onPress={() => setMyRivalJoinPartner(invitedBy.userId)} disabled={partnerActionLoading} style={{ marginTop:2, backgroundColor:'#16a34a30', borderRadius:5, paddingHorizontal:6, paddingVertical:2, alignSelf:'flex-start', borderWidth:1, borderColor:'#16a34a50' }}>
                                <Text style={{ color:'#4ade80', fontSize:9, fontWeight:'700' }}>✓ Kabul Et</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                );
            } else {
                slot2 = (
                    <View>
                        <Text style={{ color: colors.textMuted, fontSize:9 }} numberOfLines={1}>Partner aranıyor</Text>
                        {isMine && (
                            <TouchableOpacity
                                onPress={() => { setJoinInviteCandidates(solos.filter(s => s.userId !== myId)); setShowJoinInvitePicker(true); }}
                                disabled={partnerActionLoading}
                                style={{ marginTop:2, backgroundColor: cfg.color+'20', borderRadius:5, paddingHorizontal:6, paddingVertical:2, alignSelf:'flex-start', borderWidth:1, borderColor: cfg.color+'40' }}>
                                <Text style={{ color: cfg.color, fontSize:9, fontWeight:'700' }}>+ Davet Et</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                );
            }
        }

        return (
            <View key={p1.id} style={{ width:'48%', backgroundColor:'#1e293b', borderRadius:8, borderWidth:1, borderColor: colors.border+'40', paddingVertical:6, paddingHorizontal:8, marginBottom:6 }}>
                <Half jr={p1} />
                <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'900', textAlign:'center', marginVertical:2 }}>+</Text>
                {slot2}
                {isOwner && (
                    <View style={{ flexDirection:'row', gap:4, marginTop:4 }}>
                        <TouchableOpacity onPress={() => acceptLocal(p1.id)} style={{ flex:1, backgroundColor:'#16a34a30', borderRadius:5, paddingVertical:3, alignItems:'center', borderWidth:1, borderColor:'#16a34a50' }}>
                            <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'700' }}>Kabul</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => rejectLocal(p1.id)} style={{ flex:1, backgroundColor:'#dc262630', borderRadius:5, paddingVertical:3, alignItems:'center', borderWidth:1, borderColor:'#dc262650' }}>
                            <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>Red</Text>
                        </TouchableOpacity>
                    </View>
                )}
            </View>
        );
    };

    const sendComment = async () => {
        if (!commentText.trim()) return;
        setSendingComment(true);
        try {
            const res = await api.post(`/rivals/${item.id}/comments`, { content: commentText.trim() });
            setComments(p => [...p, res.data]);
            setCommentText('');
        } catch(e) { Alert.alert('Hata', e?.response?.data?.message || 'Yorum gönderilemedi'); }
        finally { setSendingComment(false); }
    };

    const deleteComment = async (commentId) => {
        try {
            await api.delete(`/rivals/comments/${commentId}`);
            setComments(p => p.filter(c => c.id !== commentId));
        } catch(e) { Alert.alert('Hata', e?.response?.data?.message || 'Yorum silinemedi'); }
    };

    return (
        <>
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={{ flex:1, backgroundColor: colors.bg }}>
                {/* Header */}
                <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:8, paddingTop: Platform.OS==='ios' ? 56 : 24, paddingBottom:moderateScale(14), borderBottomWidth:1, borderBottomColor: colors.border }}>
                    <TouchableOpacity onPress={onClose} style={{ marginRight:14, padding:4 }}>
                        <Text style={{ color:'#fff', fontSize:moderateScale(22), fontWeight:'300' }}>←</Text>
                    </TouchableOpacity>
                    <View style={{ flex:1 }}>
                        <Text style={{ color:'#fff', fontSize:moderateScale(16), fontWeight:'800' }}>{item.subCategory}</Text>
                        <Text style={{ color: colors.textMuted, fontSize:moderateScale(12), marginTop:1 }}>{senderAlias(item.sender)}</Text>
                    </View>
                    <ModeBadge mode={item.matchMode} />
                </View>

                {/* Scrollable content */}
                <ScrollView style={{ flex:1 }} contentContainerStyle={{ paddingHorizontal:8, paddingTop:16, paddingBottom:8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                    {/* Tarih / Saat / Süre — dikey, ortalı */}
                    <View style={{ alignItems:'center', marginBottom:moderateScale(12) }}>
                        {item.matchDate && (
                            <Text style={{ color:'#fff', fontSize:moderateScale(18), fontWeight:'800' }}>
                                📅 {new Date(item.matchDate).toLocaleDateString(t.dateLocale, { day:'numeric', month:'long', weekday:'long' })}
                            </Text>
                        )}
                        {item.matchTime && (
                            <Text style={{ color: cfg.color, fontSize:moderateScale(16), fontWeight:'700', marginTop:4 }}>
                                🕐 {item.matchTime}
                            </Text>
                        )}
                        {item.duration && (
                            <Text style={{ color: colors.textMuted, fontSize:moderateScale(14), marginTop:4 }}>
                                ⏱ {item.duration} {t.timeMinSuffix}
                            </Text>
                        )}
                        {item.courtName && (
                            <TouchableOpacity onPress={() => openCourtMap(item.courtName, item.courtLat, item.courtLng, item.courtAddress)}>
                                <Text style={{ color:'#60a5fa', fontSize:moderateScale(13), marginTop:6, textDecorationLine:'underline' }}>🏟️ {item.courtName}</Text>
                            </TouchableOpacity>
                        )}
                        {item.courtFeePerPerson > 0 && (
                            <Text style={{ color:'#4ade80', fontSize:moderateScale(12), marginTop:3 }}>💰 {item.courtFeePerPerson}₺ / {t.perPerson}</Text>
                        )}
                        {item.level && (
                            <View style={[s.levelRow, { marginTop:6, justifyContent:'center', gap: moderateScale(8) }]}>
                                <Text style={[s.levelBadge, { borderRadius: moderateScale(8), paddingHorizontal: moderateScale(8), paddingVertical: moderateScale(3), fontSize: moderateScale(11) }]}>{LEVEL_EMOJI[item.level]} {t.levelTr[item.level] || item.level}</Text>
                                {item.levelDetail && <Text style={[s.levelDetail, { borderRadius: moderateScale(8), paddingHorizontal: moderateScale(8), paddingVertical: moderateScale(3), fontSize: moderateScale(11) }]}>{item.levelDetail}</Text>}
                            </View>
                        )}
                    </View>

                    {/* Gönderen */}
                    <View style={{ flexDirection:'row', alignItems:'center', gap:moderateScale(10), marginBottom:item.message ? 8 : 12, paddingBottom:12, borderBottomWidth:1, borderBottomColor: colors.border }}>
                        <Avatar name={item.sender?.username} avatar={item.sender?.avatar} size={moderateScale(34)} color={cfg.color} onPress={() => item.senderId && navigation.push('Profile', { userId: item.senderId })} />
                        <View style={{ flex:1, flexDirection:'row', alignItems:'center', gap:6 }}>
                            <Text style={[s.cardName, { fontSize: moderateScale(14) }]}>{senderAlias(item.sender)}</Text>
                            {item.sender?.interests?.[0]?.assessmentCompleted && (
                                <Text style={{ color:'#facc15', fontSize:moderateScale(12), fontWeight:'800' }}>{Number(item.sender.interests[0].skillRating).toFixed(2)} ★</Text>
                            )}
                        </View>
                        <View style={[s.modeBadge, { backgroundColor:cfg.color+'20', borderColor:cfg.color+'40', borderRadius: moderateScale(8), paddingHorizontal: moderateScale(8), paddingVertical: moderateScale(3) }]}>
                            <Text style={[s.modeBadgeText, { color:cfg.color, fontSize: moderateScale(10) }]}>
                                {TEAM_SPORTS.has(sub) ? `${item.teamSize||1}v${item.teamSize||1}` : (item.matchType==='DOUBLE' ? '2v2' : '1v1')}
                            </Text>
                        </View>
                    </View>
                    {item.message && <Text style={[s.cardMsg, { marginBottom:12, fontSize: moderateScale(13) }]}>{item.message}</Text>}

                    {/* Oyuncular */}
                    <View style={det.section}>
                        <Text style={det.sectionTitle}>👥 {t.players || 'Oyuncular'} ({senderSideCount + filled} / {senderSideCount + required})</Text>
                        {item.matchType === 'DOUBLE' ? (() => {
                            const senderTeamArr = Array.isArray(item.senderTeam) ? item.senderTeam : [];
                            const TeamHalf = ({ p, fallback, sub: subLabel, onRemove }) => p ? (
                                <View>
                                    <TouchableOpacity onPress={() => p.id && navigation.push('Profile', { userId: p.id })}>
                                        <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }} numberOfLines={1}>{playerDisplayName(p)}</Text>
                                        <Text style={{ color: colors.textMuted, fontSize:9 }} numberOfLines={1}>@{p.username}{subLabel ? ` · ${subLabel}` : ''}</Text>
                                    </TouchableOpacity>
                                    {onRemove && (
                                        <TouchableOpacity onPress={onRemove} style={{ marginTop:2 }}>
                                            <Text style={{ color:'#f87171', fontSize:9, fontWeight:'700' }}>Çıkar</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            ) : (
                                <Text style={{ color: colors.textMuted, fontSize:9 }}>{fallback}</Text>
                            );
                            return (
                                <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
                                    <View style={{ width:'48%', backgroundColor:'#1e293b', borderRadius:8, borderWidth:1, borderColor: colors.border+'40', paddingVertical:8, paddingHorizontal:8, marginBottom:6 }}>
                                        <Text style={{ color: cfg.color, fontSize:9, fontWeight:'800', marginBottom:4 }}>👑 Kurucu Takımı</Text>
                                        <TeamHalf p={item.sender} />
                                        <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'900', textAlign:'center', marginVertical:2 }}>+</Text>
                                        <TeamHalf p={senderTeamArr[0]} fallback="Partner yok" />
                                    </View>
                                    <View style={{ width:'48%', backgroundColor:'#1e293b', borderRadius:8, borderWidth:1, borderColor: colors.border+'40', paddingVertical:8, paddingHorizontal:8, marginBottom:6 }}>
                                        <Text style={{ color:'#f87171', fontSize:9, fontWeight:'800', marginBottom:4 }}>⚔️ Rakip Takımı</Text>
                                        <TeamHalf p={participants[0]} fallback="Henüz katılan yok" onRemove={isOwner && participants[0] ? () => removeRivalParticipant(participants[0].id, participants[0].username) : null} />
                                        <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'900', textAlign:'center', marginVertical:2 }}>+</Text>
                                        <TeamHalf p={participants[1]} fallback="Henüz katılan yok" onRemove={isOwner && participants[1] ? () => removeRivalParticipant(participants[1].id, participants[1].username) : null} />
                                    </View>
                                </View>
                            );
                        })() : (
                            <>
                                <View style={det.playerRow}>
                                    <Avatar name={item.sender?.username} avatar={item.sender?.avatar} size={moderateScale(32)} color={cfg.color} onPress={() => item.senderId && navigation.push('Profile', { userId: item.senderId })} />
                                    <View style={{ flex:1 }}>
                                        <Text style={det.playerName}>{playerDisplayName(item.sender)}</Text>
                                        <Text style={det.playerSub}>@{item.sender?.username} · {t.founder || 'Kurucu'}</Text>
                                    </View>
                                </View>
                                {participants.map((p, i) => (
                                    <View key={p.id || i} style={det.playerRow}>
                                        <Avatar name={p.username} avatar={p.avatar} size={moderateScale(32)} color={cfg.color} onPress={() => p.id && navigation.push('Profile', { userId: p.id })} />
                                        <View style={{ flex:1 }}>
                                            <Text style={det.playerName}>{playerDisplayName(p)}</Text>
                                            <Text style={det.playerSub}>@{p.username}</Text>
                                        </View>
                                        {isOwner && (
                                            <TouchableOpacity onPress={() => removeRivalParticipant(p.id, p.username)} style={{ padding:6 }}>
                                                <Text style={{ color:'#f87171', fontSize:moderateScale(11), fontWeight:'700' }}>Çıkar</Text>
                                            </TouchableOpacity>
                                        )}
                                    </View>
                                ))}
                                {filled === 0 && <Text style={det.emptyTxt}>{t.noPlayersYet || 'Henüz katılan yok'}</Text>}
                            </>
                        )}
                    </View>

                    {/* İstekler — çiftlerde herkes görür (ikili kart + partner davet/kabul),
                        diğer türlerde sadece ilan sahibi (kabul/red) görür */}
                    {joinRequests.filter(jr => jr.initiatedBy !== 'OWNER').length > 0 && (isOwner || item.matchType === 'DOUBLE') && (
                        <View style={det.section}>
                            <Text style={det.sectionTitle}>📬 {t.requests || 'İstekler'} ({joinRequests.filter(jr => jr.initiatedBy !== 'OWNER').length})</Text>
                            {item.matchType === 'DOUBLE' ? (() => {
                                const incoming = joinRequests.filter(jr => jr.initiatedBy !== 'OWNER');
                                const { pairs, solos, byUserId } = groupDoublesPairs(incoming);
                                return (
                                    <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
                                        {pairs.map(([a, b]) => renderRivalDuoCard(a, b, solos, byUserId))}
                                        {solos.map(s => renderRivalDuoCard(s, null, solos, byUserId))}
                                    </View>
                                );
                            })() : joinRequests.filter(jr => jr.initiatedBy !== 'OWNER').map(jr => (
                                <View key={jr.id} style={det.playerRow}>
                                    <Avatar name={jr.user?.username} avatar={jr.user?.avatar} size={moderateScale(32)} color={cfg.color} onPress={() => jr.user?.id && navigation.push('Profile', { userId: jr.user.id })} />
                                    <View style={{ flex:1 }}>
                                        <Text style={det.playerName}>{jr.user?.fullName || jr.user?.username}</Text>
                                        <Text style={det.playerSub}>@{jr.user?.username}</Text>
                                    </View>
                                    <View style={{ flexDirection:'row', gap:6 }}>
                                        <TouchableOpacity style={[s.acceptBtn, { borderRadius: moderateScale(8), width: moderateScale(28), height: moderateScale(28) }]} onPress={() => acceptLocal(jr.id)}>
                                            <Text style={{ color:'#fff', fontSize:moderateScale(12), fontWeight:'700' }}>✓</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[s.declineBtn, { borderRadius: moderateScale(8), width: moderateScale(28), height: moderateScale(28) }]} onPress={() => rejectLocal(jr.id)}>
                                            <Text style={{ color:'#fff', fontSize:moderateScale(12), fontWeight:'700' }}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Katıl / İptal aksiyonu */}
                    <View style={{ marginBottom:20 }}>
                        {/* Sahibi ve maça kabul edilmiş katılımcılar başka oyuncu davet edebilir */}
                        {(isOwner || isParticipant) && !isFull && (
                            <TouchableOpacity
                                style={[s.joinBtn, { backgroundColor: cfg.color + '20', borderWidth:1, borderColor: cfg.color + '50', marginBottom:10, borderRadius: moderateScale(10), paddingVertical: moderateScale(9) }]}
                                onPress={() => setInviteModalVisible(true)}
                            >
                                <Text style={[s.joinBtnText, { color: cfg.color, fontSize: moderateScale(13) }]}>{t.inviteBtn}</Text>
                            </TouchableOpacity>
                        )}
                        {isOwner && !isFull && (sub === 'tennis' || sub === 'padel') && (
                            <TouchableOpacity
                                disabled={seedingDemoRival}
                                style={[s.joinBtn, { backgroundColor:'#7c3aed20', borderWidth:1, borderColor:'#7c3aed50', marginBottom:10, borderRadius: moderateScale(10), paddingVertical: moderateScale(9), opacity: seedingDemoRival ? 0.6 : 1 }]}
                                onPress={async () => {
                                    setSeedingDemoRival(true);
                                    try {
                                        const { data } = await api.post('/demo/rival-join', { rivalId: item.id });
                                        Alert.alert('', `Demo başvuru gönderildi: ${data.joined.join(', ')}`);
                                    } catch (e) {
                                        Alert.alert('', e?.response?.data?.message || t.actionFailed);
                                    } finally { setSeedingDemoRival(false); }
                                }}
                            >
                                <Text style={[s.joinBtnText, { color:'#a78bfa', fontSize: moderateScale(13) }]}>{seedingDemoRival ? '...' : '🤖 Demo Başvuru Gönder'}</Text>
                            </TouchableOpacity>
                        )}
                        {isOwner ? (
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <TouchableOpacity
                                    style={[s.cancelBtn, { flex: 1, backgroundColor: colors.purple + '20', borderColor: colors.purple + '40', borderRadius: moderateScale(10), paddingVertical: moderateScale(8) }]}
                                    onPress={() => { onClose(); setTimeout(onEdit, 300); }}
                                >
                                    <Text style={[s.cancelBtnText, { color: colors.purple, fontSize: moderateScale(12) }]}>✏️ Düzenle</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.cancelBtn, { flex: 1, borderRadius: moderateScale(10), paddingVertical: moderateScale(8) }]} onPress={() => { onClose(); setTimeout(handleCancel, 300); }}>
                                    <Text style={[s.cancelBtnText, { fontSize: moderateScale(12) }]}>{t.cancelAdBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : myInvite ? (
                            <View style={{ flexDirection:'row', gap:10 }}>
                                <TouchableOpacity style={[s.joinBtn, { flex:1, backgroundColor:'#16a34a', borderRadius: moderateScale(10), paddingVertical: moderateScale(9) }]} onPress={() => handleRespondJoin(myInvite.id, 'accept')}>
                                    <Text style={[s.joinBtnText, { fontSize: moderateScale(13) }]}>{t.inviteAcceptBtn}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.cancelBtn, { flex:1, borderRadius: moderateScale(10), paddingVertical: moderateScale(8) }]} onPress={() => handleRespondJoin(myInvite.id, 'reject')}>
                                    <Text style={[s.cancelBtnText, { fontSize: moderateScale(12) }]}>{t.inviteRejectBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : mySentReq === 'PENDING' ? (
                            <View style={[s.waitingBox, { borderRadius: moderateScale(10), paddingVertical: moderateScale(8) }]}><Text style={[s.waitingText, { fontSize: moderateScale(13) }]}>{t.waitingReq}</Text></View>
                        ) : mySentReq === 'ACCEPTED' ? (
                            <View style={[s.waitingBox, { backgroundColor:'#16a34a20', borderColor:'#16a34a40', borderRadius: moderateScale(10), paddingVertical: moderateScale(8) }]}>
                                <Text style={[s.waitingText, { color:'#4ade80', fontSize: moderateScale(13) }]}>{t.requestAccepted || '✓ Kabul edildiniz!'}</Text>
                            </View>
                        ) : isFull ? (
                            <View style={[s.waitingBox, { borderRadius: moderateScale(10), paddingVertical: moderateScale(8) }]}><Text style={[s.waitingText, { fontSize: moderateScale(13) }]}>{t.ilanFull || 'İlan doldu'}</Text></View>
                        ) : (
                            <TouchableOpacity style={[s.joinBtn, { backgroundColor: cfg.color, borderRadius: moderateScale(10), paddingVertical: moderateScale(9) }]} onPress={() => { onClose(); setTimeout(handleJoin, 300); }}>
                                <Text style={[s.joinBtnText, { fontSize: moderateScale(13) }]}>{t.joinBtn}</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Yorumlar bölümü */}
                    <Text style={{ color:'#fff', fontSize:moderateScale(15), fontWeight:'800', marginBottom:14 }}>
                        💬 {t.matchCommentsTitle}{comments.length > 0 ? ` (${comments.length})` : ''}
                    </Text>
                    {loadingComments ? (
                        <ActivityIndicator color={cfg.color} style={{ marginTop:16 }} />
                    ) : comments.length === 0 ? (
                        <Text style={{ color: colors.textMuted, textAlign:'center', marginTop:8, fontSize:moderateScale(13) }}>{t.matchCommentEmpty}</Text>
                    ) : (
                        comments.map(c => (
                            <View key={c.id} style={{ marginBottom:14, paddingBottom:14, borderBottomWidth:1, borderBottomColor: colors.border }}>
                                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
                                    <View style={{ flex:1 }}>
                                        <Text style={{ color: cfg.color, fontSize:moderateScale(13), fontWeight:'700', marginBottom:3 }}>@{c.user?.username}</Text>
                                        <Text style={{ color:'#fff', fontSize:moderateScale(14), lineHeight:moderateScale(21) }}>{c.content}</Text>
                                        <Text style={{ color: colors.textMuted, fontSize:moderateScale(11), marginTop:4 }}>
                                            {new Date(c.createdAt).toLocaleString(t.dateLocale, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                                        </Text>
                                    </View>
                                    {canDeleteComment(c) && (
                                        <TouchableOpacity onPress={() => deleteComment(c.id)} style={{ padding:8, marginLeft:8 }}>
                                            <Text style={{ color:'#f87171', fontSize:moderateScale(14) }}>✕</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        ))
                    )}
                </ScrollView>

                {/* Yorum yaz — bottom */}
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} keyboardVerticalOffset={0}>
                    <View style={{ flexDirection:'row', gap:10, paddingHorizontal:12, paddingVertical:10, paddingBottom: Platform.OS==='ios' ? 28 : 10, borderTopWidth:1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
                        <TextInput
                            style={[s.fieldInput, { flex:1, height:moderateScale(44), marginBottom:0, fontSize:moderateScale(14) }]}
                            placeholder={t.matchCommentPlaceholder}
                            placeholderTextColor={colors.textMuted}
                            value={commentText}
                            onChangeText={setCommentText}
                            multiline={false}
                            returnKeyType="send"
                            onSubmitEditing={sendComment}
                        />
                        <TouchableOpacity
                            style={[s.joinBtn, { paddingHorizontal:18, height:moderateScale(44), justifyContent:'center', alignSelf:'center', borderRadius: moderateScale(10) }, sendingComment && { opacity:0.6 }]}
                            onPress={sendComment}
                            disabled={sendingComment}
                        >
                            <Text style={[s.joinBtnText, { fontSize: moderateScale(13) }]}>{t.matchCommentSend}</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>

        {/* Oyuncu Davet Et — arama modali */}
        <Modal visible={inviteModalVisible} animationType="slide" transparent onRequestClose={() => setInviteModalVisible(false)}>
            <View style={{ flex:1, backgroundColor:'#00000080', justifyContent:'flex-end' }}>
                <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:20, paddingTop:20, paddingBottom:40, maxHeight:'80%' }}>
                    <View style={{ flexDirection:'row', alignItems:'center', marginBottom:14 }}>
                        <Text style={{ color:'#fff', fontSize:moderateScale(16), fontWeight:'800', flex:1 }}>{t.inviteBtn}</Text>
                        <TouchableOpacity onPress={() => { setInviteModalVisible(false); setInviteQuery(''); setInviteResults([]); }}>
                            <Text style={{ color: colors.textMuted, fontSize:moderateScale(20) }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={[s.fieldInput, { fontSize: moderateScale(14), borderRadius: moderateScale(12), paddingHorizontal: moderateScale(14), paddingVertical: moderateScale(12) }]}
                        value={inviteQuery}
                        onChangeText={setInviteQuery}
                        placeholder={t.inviteSearchPh}
                        placeholderTextColor={colors.textMuted}
                        autoFocus
                    />
                    {inviteSearching && <ActivityIndicator color={cfg.color} style={{ marginTop:12 }} />}
                    <ScrollView style={{ marginTop:8 }} keyboardShouldPersistTaps="handled">
                        {inviteResults.map(u => (
                            <View key={u.id} style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}>
                                <Avatar name={u.username} avatar={u.avatar} size={moderateScale(36)} color={cfg.color} />
                                <View style={{ flex:1 }}>
                                    <Text style={{ color:'#fff', fontWeight:'700', fontSize:moderateScale(13) }}>{u.interests?.[0]?.alias || u.fullName || u.username}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:moderateScale(11) }}>
                                        @{u.username}{u.interests?.[0]?.skillRating != null ? `  ${Number(u.interests[0].skillRating).toFixed(2)} ★` : ''}
                                    </Text>
                                </View>
                                <TouchableOpacity
                                    style={[s.joinBtn, { paddingHorizontal:moderateScale(14), paddingVertical:moderateScale(7), borderRadius: moderateScale(10) }, invitingUserId === u.id && { opacity:0.6 }]}
                                    onPress={() => handleInvite(u)}
                                    disabled={invitingUserId === u.id}
                                >
                                    <Text style={[s.joinBtnText, { fontSize: moderateScale(13) }]}>{invitingUserId === u.id ? '...' : t.inviteSendBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        ))}
                        {!inviteSearching && inviteQuery.trim().length >= 2 && inviteResults.length === 0 && (
                            <Text style={{ color: colors.textMuted, textAlign:'center', marginTop:16, fontSize:moderateScale(13) }}>{t.inviteNoResults}</Text>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>

        {/* Çiftler: partner davet picker — bireysel başvuranlar arasından seç */}
        <Modal visible={showJoinInvitePicker} animationType="fade" transparent onRequestClose={() => setShowJoinInvitePicker(false)}>
            <View style={{ flex:1, backgroundColor:'#00000080', justifyContent:'center', alignItems:'center', padding:24 }}>
                <View style={{ backgroundColor:'#1e293b', borderRadius:16, padding:20, borderWidth:1, borderColor: cfg.color+'40', width:'100%', maxHeight:'70%' }}>
                    <Text style={{ color:'#fff', fontSize:15, fontWeight:'800', marginBottom:12 }}>👥 Partner Davet Et</Text>
                    <ScrollView>
                        {joinInviteCandidates.length === 0 ? (
                            <Text style={{ color: colors.textMuted, fontSize:13, textAlign:'center', paddingVertical:16 }}>Davet edilebilecek bireysel başvuran yok</Text>
                        ) : joinInviteCandidates.map(c => (
                            <TouchableOpacity key={c.userId} onPress={() => setMyRivalJoinPartner(c.userId)} disabled={partnerActionLoading} style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}>
                                <Avatar name={c.user?.username} avatar={c.user?.avatar} size={moderateScale(34)} color={cfg.color} />
                                <View style={{ flex:1 }}>
                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{c.user?.fullName || c.user?.username}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>@{c.user?.username}{c.user?.interests?.find(i => i.subCategory === sub)?.skillRating != null ? `  ${starEmoji(Number(c.user.interests.find(i => i.subCategory === sub).skillRating))} ${Number(c.user.interests.find(i => i.subCategory === sub).skillRating).toFixed(2)}` : ''}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity onPress={() => setShowJoinInvitePicker(false)} style={{ marginTop:14, backgroundColor:'#334155', borderRadius:10, paddingVertical:11, alignItems:'center' }}>
                        <Text style={{ color:'#94a3b8', fontSize:13, fontWeight:'700' }}>Vazgeç</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
        </>
    );
}

// ─── Rival Card ────────────────────────────────────────────────────────────────

function RivalCard({ item, myId, sub, onRefresh, navigation, autoOpen, onAutoOpened, myRating = 0 }) {
    const t = useT();
    const cfg = getConfig(sub);
    const isOwner = item.senderId === myId;
    const participants = Array.isArray(item.participants) ? item.participants : [];
    const required = item.matchType === 'DOUBLE'
        ? ((Array.isArray(item.senderTeam) && item.senderTeam.length > 0) ? 2 : 3)
        : (item.teamSize || 1);
    const filled = participants.length;
    const isFull = filled >= required;
    const [localJoinStatus, setLocalJoinStatus] = useState(null);
    const mySentReq = localJoinStatus ?? item._myJoinStatus;
    const myInvite = (Array.isArray(item.joinRequests) ? item.joinRequests : []).find(jr => jr.userId === myId && jr.initiatedBy === 'OWNER');
    const [detailVisible, setDetailVisible] = useState(false);
    const [editVisible, setEditVisible] = useState(false);

    useEffect(() => {
        if (autoOpen) { setDetailVisible(true); onRefresh(); onAutoOpened?.(); }
    }, [autoOpen]);

    // Sunucudan gelen veri local override'ı geçersiz kılar
    useEffect(() => { setLocalJoinStatus(null); }, [item._myJoinStatus]);

    useEffect(() => {
        const offRejected = onSocket('joinRejected', ({ rivalId }) => {
            if (rivalId !== item.id) return;
            setLocalJoinStatus(null);
            onRefresh();
        });
        const offAccepted = onSocket('joinAccepted', ({ rivalId }) => {
            if (rivalId !== item.id) return;
            setLocalJoinStatus('ACCEPTED');
            onRefresh();
        });
        return () => { offRejected(); offAccepted(); };
    }, [item.id]);

    const handleJoin = async () => {
        if (item.minRating != null && myRating < item.minRating) {
            Alert.alert('⚠️ Puan Limiti', `Bu ilan için en az ${item.minRating}★ puan gerekiyor.\nSizin puanınız: ${Number(myRating).toFixed(2)}★`);
            return;
        }
        if (item.maxRating != null && myRating > item.maxRating) {
            Alert.alert('⚠️ Puan Limiti', `Bu ilan için en fazla ${item.maxRating}★ puan kabul ediliyor.\nSizin puanınız: ${Number(myRating).toFixed(2)}★`);
            return;
        }
        try {
            setLocalJoinStatus('PENDING'); // anlık göster
            await api.post(`/rivals/${item.id}/respond`, {});
            onRefresh();
        } catch (e) {
            if (!e?.response) { onRefresh(); return; } // network drop — sunucu aldı, yenile
            setLocalJoinStatus(null); // hata varsa geri al
            const msg = e.response.data?.message || '';
            if (msg.toLowerCase().includes('already') || msg.toLowerCase().includes('no longer')) {
                onRefresh();
                if (msg.toLowerCase().includes('no longer')) Alert.alert(t.error, t.requestNoLongerOpen || 'Bu ilan artık açık değil.');
                return;
            }
            Alert.alert(t.error, msg || t.requestFailed);
        }
    };

    // Çiftlerde de doğrudan bireysel başvuru gönderilir — partner eşleştirme, başvuru
    // gönderildikten sonra İstekler bölümündeki takım kartlarından (davet et/kabul et) yapılır.
    const handleJoinPress = () => {
        handleJoin();
    };


    const handleCancel = async () => {
        Alert.alert(t.cancelConfirmTitle, t.cancelConfirmMsg, [
            { text: t.no },
            { text: t.yes, style: 'destructive', onPress: async () => {
                try { await api.patch(`/rivals/${item.id}/cancel`, {}); onRefresh(); }
                catch(e) {
                    if (e?.response) Alert.alert(t.error, e.response.data?.message || t.deleteFailed);
                    else onRefresh(); // network drop — server likely cancelled it
                }
            }}
        ]);
    };

    const handleRespondJoin = async (jrId, action) => {
        try {
            const res = await api.patch(`/rivals/join/${jrId}`, { action });
            if (action === 'accept' && res.data?.matched) {
                setTimeout(onRefresh, 1200);
            } else {
                onRefresh();
            }
        } catch(e) {
            if (e?.response) Alert.alert(t.error, e.response.data?.message || t.actionFailed);
            else onRefresh(); // network drop — sunucu işlemi yaptı, listeyi yenile
        }
    };

    const rival = { id:item.id, subCategory:item.subCategory, matchType:item.matchType, level:item.level, matchDate:item.matchDate, matchTime:item.matchTime, location:item.location, courtName:item.courtName, flexibleSchedule:item.flexibleSchedule };

    return (
        <>
        <View style={[s.card, { width:'48%', borderRadius: moderateScale(14), paddingHorizontal:3, paddingTop:3, paddingBottom:3 }, item.flexibleSchedule && { borderColor:'#eab30840' }]}>

            {/* ── Tappable info area → opens detail modal ── */}
            <TouchableOpacity activeOpacity={0.85} onPress={() => { setDetailVisible(true); onRefresh(); }}>

                {/* Avatar + isim + puan */}
                <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:3 }}>
                    <Avatar name={item.sender?.username} avatar={item.sender?.avatar} size={moderateScale(34)} color={cfg.color} onPress={() => item.senderId && navigation.push('Profile', { userId: item.senderId })} />
                    <View style={{ flex:1, minWidth:0 }}>
                        <Text style={[s.cardName, { fontSize: moderateScale(13) }]} numberOfLines={1}>{senderAlias(item.sender)}</Text>
                        {item.sender?.interests?.[0]?.assessmentCompleted && (
                            <Text style={[s.ratingText, { color: cfg.color, fontSize: moderateScale(10) }]}>
                                {Number(item.sender.interests[0].skillRating).toFixed(2)} ★
                            </Text>
                        )}
                    </View>
                </View>

                {/* Mod + 1v1/2v2 + katılım sayısı */}
                <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:3, flexWrap:'wrap' }}>
                    <ModeBadge mode={item.matchMode} />
                    <View style={[s.modeBadge, { backgroundColor: cfg.color+'20', borderColor: cfg.color+'40', borderRadius: moderateScale(8), paddingHorizontal:3, paddingVertical:3 }]}>
                        <Text style={[s.modeBadgeText, { color: cfg.color, fontSize: moderateScale(10) }]}>
                            {TEAM_SPORTS.has(sub) ? `${item.teamSize||1}v${item.teamSize||1}` : (item.matchType==='DOUBLE' ? '2v2' : '1v1')}
                        </Text>
                    </View>
                    <Text style={[s.joinedCount, { fontSize: moderateScale(10), marginTop:0 }]}>{t.joinedCount(filled, TEAM_SPORTS.has(sub) ? item.teamSize : required)}</Text>
                </View>
                {(item.minRating != null || item.maxRating != null) && (
                    <Text style={{ color:'#facc15', fontSize:moderateScale(10), fontWeight:'700', marginBottom:3 }}>
                        ⭐ {item.minRating ?? '0'}–{item.maxRating ?? '5'}★
                    </Text>
                )}

                {/* Tarih / Saat / Süre */}
                {!item.flexibleSchedule && (item.matchDate || item.matchTime || item.duration) && (
                    <View style={{ gap:3, marginBottom:3 }}>
                        {item.matchDate && <Text style={[s.metaItemText, { fontSize: moderateScale(11) }]} numberOfLines={1}>📅 {new Date(item.matchDate).toLocaleDateString(t.dateLocale,{day:'numeric',month:'short',weekday:'short'})}</Text>}
                        {(item.matchTime || item.duration) && (
                            <Text style={[s.metaItemText, { fontSize: moderateScale(11) }]} numberOfLines={1}>
                                {item.matchTime ? `🕐 ${item.matchTime}` : ''}{item.matchTime && item.duration ? ' · ' : ''}{item.duration ? `⏱ ${item.duration} ${t.timeMinSuffix}` : ''}
                            </Text>
                        )}
                    </View>
                )}

                <Text style={{ color: colors.textMuted, fontSize:moderateScale(11), marginBottom:3 }}>
                    💬 {item.commentCount ?? 0}
                </Text>
                <Text style={{ fontSize:moderateScale(11), marginBottom:3, color: item.isCourtReserved ? '#4ade80' : '#f87171' }} numberOfLines={1}>
                    {item.isCourtReserved ? `✅ ${t.courtReservedLabel}` : `❌ ${t.courtNotReserved}`}
                </Text>
                {item.courtName && (
                    <TouchableOpacity onPress={() => openCourtMap(item.courtName, item.courtLat, item.courtLng, item.courtAddress)}>
                        <Text style={{ fontSize:moderateScale(11), marginBottom:3, color:'#60a5fa', textDecorationLine:'underline' }} numberOfLines={1}>🏟️ {item.courtName}</Text>
                    </TouchableOpacity>
                )}
                {item.courtFeePerPerson > 0 && (
                    <Text style={{ fontSize:moderateScale(11), marginBottom:3, color:'#4ade80' }} numberOfLines={1}>💰 {item.courtFeePerPerson}₺ / {t.perPerson}</Text>
                )}

                {item.flexibleSchedule && (
                    <View style={[s.flexBanner, { borderRadius: moderateScale(10), padding:3, marginBottom:3 }]}>
                        <Text style={[s.flexTitle, { fontSize: moderateScale(11), marginBottom:3 }]}>{t.flexibleBanner}</Text>
                        <Text style={[s.flexDesc, { fontSize: moderateScale(10) }]}>{t.flexibleBannerDesc}</Text>
                    </View>
                )}
                {(item.level || item.levelDetail) && (
                    <View style={[s.levelRow, { gap:3, marginBottom:3 }]}>
                        {item.level && <Text style={[s.levelBadge, { borderRadius: moderateScale(8), paddingHorizontal:3, paddingVertical:3, fontSize: moderateScale(10) }]} numberOfLines={1}>{LEVEL_EMOJI[item.level]} {t.levelTr[item.level] || item.level}</Text>}
                        {item.levelDetail && <Text style={[s.levelDetail, { borderRadius: moderateScale(8), paddingHorizontal:3, paddingVertical:3, fontSize: moderateScale(10) }]} numberOfLines={1}>{item.levelDetail}</Text>}
                    </View>
                )}
                {item.message && <Text style={[s.cardMsg, { fontSize: moderateScale(12), marginBottom:3 }]} numberOfLines={2}>{item.message}</Text>}
                {/* Kabul edilen oyuncular */}
                {participants.length > 0 && (
                    <View style={[s.participantsRow, { gap:3, marginBottom:3 }]}>
                        {participants.map((p, i) => (
                            <View key={p.id || i} style={[s.participantChip, { borderRadius: moderateScale(8), paddingHorizontal:3, paddingVertical:3 }]}>
                                <Text style={[s.participantChipText, { fontSize: moderateScale(10) }]} numberOfLines={1}>✓ {senderAlias(p)}</Text>
                            </View>
                        ))}
                    </View>
                )}
                {/* Bekleyen istek badge */}
                {isOwner && (item.joinRequests||[]).filter(jr => jr.initiatedBy !== 'OWNER').length > 0 && (
                    <View style={[s.pendingBadge, { borderRadius: moderateScale(8), paddingHorizontal:3, paddingVertical:3, marginBottom:3 }]}>
                        <Text style={[s.pendingBadgeText, { fontSize: moderateScale(11) }]} numberOfLines={1}>📬 {item.joinRequests.filter(jr => jr.initiatedBy !== 'OWNER').length} {t.requests || 'istek'}</Text>
                    </View>
                )}
            </TouchableOpacity>

            {/* Aksiyon alanı */}
            <View>
                {isOwner ? (
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                        <TouchableOpacity
                            style={[s.cancelBtn, { flex: 1, paddingHorizontal:3, paddingVertical: moderateScale(5), borderRadius: moderateScale(10), backgroundColor: colors.purple + '20', borderColor: colors.purple + '40' }]}
                            onPress={() => setEditVisible(true)}
                        >
                            <Text style={[s.cancelBtnText, { color: colors.purple, fontSize: moderateScale(11) }]}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.cancelBtn, { flex: 1, paddingHorizontal:3, paddingVertical: moderateScale(5), borderRadius: moderateScale(10) }]} onPress={handleCancel}>
                            <Text style={[s.cancelBtnText, { fontSize: moderateScale(11) }]} numberOfLines={1}>{t.cancelAdBtn}</Text>
                        </TouchableOpacity>
                    </View>
                ) : myInvite ? (
                    <TouchableOpacity
                        style={{ backgroundColor:'#16a34a', borderRadius:moderateScale(8), paddingVertical:moderateScale(5), alignItems:'center' }}
                        onPress={() => setDetailVisible(true)}
                    >
                        <Text style={{ color:'#fff', fontSize:moderateScale(11), fontWeight:'700' }} numberOfLines={1}>{t.invitedBadge}</Text>
                    </TouchableOpacity>
                ) : mySentReq === 'PENDING' ? (
                    <Text style={{ color:colors.textMuted, fontSize:moderateScale(10), textAlign:'center' }}>{t.waitingReq}</Text>
                ) : mySentReq === 'ACCEPTED' ? (
                    <Text style={{ color:'#4ade80', fontSize:moderateScale(10), fontWeight:'700', textAlign:'center' }}>✓ Kabul</Text>
                ) : isFull ? (
                    <Text style={{ color:colors.textMuted, fontSize:moderateScale(10), textAlign:'center' }}>{t.ilanFull || 'Dolu'}</Text>
                ) : (
                    <TouchableOpacity
                        style={{ backgroundColor:cfg.color, borderRadius:moderateScale(8), paddingVertical:moderateScale(5), alignItems:'center' }}
                        onPress={handleJoinPress}
                    >
                        <Text style={{ color:'#fff', fontSize:moderateScale(11), fontWeight:'700' }}>{t.joinBtn}</Text>
                    </TouchableOpacity>
                )}
            </View>
        </View>

        <RivalDetailModal
            visible={detailVisible}
            item={item}
            myId={myId}
            sub={sub}
            cfg={cfg}
            t={t}
            onClose={() => setDetailVisible(false)}
            navigation={navigation}
            handleJoin={() => { setDetailVisible(false); setTimeout(handleJoinPress, 300); }}
            handleCancel={() => { setDetailVisible(false); setTimeout(handleCancel, 300); }}
            handleRespondJoin={handleRespondJoin}
            onEdit={() => { setDetailVisible(false); setTimeout(() => setEditVisible(true), 300); }}
        />
        <EditRivalModal
            visible={editVisible}
            item={item}
            onClose={() => setEditVisible(false)}
            onSave={onRefresh}
        />

        </>
    );
}

// ─── Custom Calendar Picker ───────────────────────────────────────────────────

function CustomCalendarPicker({ visible, value, onSelect, onClose }) {
    const t = useT();
    const today = new Date();
    const init  = value || today;
    const [yr, setYr] = useState(init.getFullYear());
    const [mo, setMo] = useState(init.getMonth());

    const firstDow   = new Date(yr, mo, 1).getDay();
    const startOff   = firstDow === 0 ? 6 : firstDow - 1;
    const daysInMo   = new Date(yr, mo + 1, 0).getDate();
    const cells      = [];
    for (let i = 0; i < startOff; i++) cells.push(null);
    for (let d = 1; d <= daysInMo; d++) cells.push(d);
    while (cells.length % 7 !== 0) cells.push(null);

    const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const isPast = (d) => d && new Date(yr, mo, d) < todayMidnight;
    const isSel  = (d) => d && value && value.getFullYear()===yr && value.getMonth()===mo && value.getDate()===d;

    const prevMo = () => mo===0 ? (setMo(11), setYr(y=>y-1)) : setMo(m=>m-1);
    const nextMo = () => mo===11 ? (setMo(0),  setYr(y=>y+1)) : setMo(m=>m+1);

    return (
        <Modal visible={visible} animationType="fade" transparent onRequestClose={onClose}>
            <TouchableOpacity style={cal.overlay} activeOpacity={1} onPress={onClose}>
                <View style={cal.box} onStartShouldSetResponder={() => true}>
                    <View style={cal.header}>
                        <TouchableOpacity onPress={prevMo} style={cal.nav}><Text style={cal.navTxt}>‹</Text></TouchableOpacity>
                        <Text style={cal.title}>{t.calMonths[mo]} {yr}</Text>
                        <TouchableOpacity onPress={nextMo} style={cal.nav}><Text style={cal.navTxt}>›</Text></TouchableOpacity>
                    </View>
                    <View style={cal.row}>
                        {t.calDays.map(d => <Text key={d} style={cal.dayLbl}>{d}</Text>)}
                    </View>
                    {Array.from({ length: cells.length/7 }).map((_, w) => (
                        <View key={w} style={cal.row}>
                            {cells.slice(w*7, w*7+7).map((d, i) => (
                                <TouchableOpacity
                                    key={i}
                                    style={[cal.cell, isSel(d) && cal.cellSel, (!d||isPast(d)) && cal.cellDis]}
                                    onPress={() => { if (d && !isPast(d)) onSelect(new Date(yr, mo, d)); }}
                                    activeOpacity={d && !isPast(d) ? 0.7 : 1}
                                >
                                    <Text style={[cal.cellTxt, isSel(d) && cal.cellTxtSel, (!d||isPast(d)) && cal.cellTxtDis]}>
                                        {d||''}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    ))}
                    <TouchableOpacity style={cal.closeBtn} onPress={onClose}>
                        <Text style={cal.closeTxt}>{t.closeCalendar}</Text>
                    </TouchableOpacity>
                </View>
            </TouchableOpacity>
        </Modal>
    );
}

const cal = StyleSheet.create({
    overlay:    { flex:1, backgroundColor:'#000000cc', justifyContent:'center', alignItems:'center', padding:20 },
    box:        { backgroundColor: colors.surface, borderRadius:20, padding:16, width:'100%' },
    header:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
    nav:        { padding:10 },
    navTxt:     { color:'#fff', fontSize:24, fontWeight:'700', lineHeight:26 },
    title:      { color:'#fff', fontSize:16, fontWeight:'900' },
    row:        { flexDirection:'row', marginBottom:2 },
    dayLbl:     { flex:1, textAlign:'center', color: colors.textMuted, fontSize:11, fontWeight:'700', paddingVertical:8 },
    cell:       { flex:1, aspectRatio:1, justifyContent:'center', alignItems:'center', borderRadius:8 },
    cellSel:    { backgroundColor: colors.purple },
    cellDis:    { opacity:0.2 },
    cellTxt:    { color:'#fff', fontSize:13, fontWeight:'600' },
    cellTxtSel: { fontWeight:'900' },
    cellTxtDis: { color: colors.textMuted },
    closeBtn:   { marginTop:12, backgroundColor: colors.surface2, borderRadius:10, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor: colors.border },
    closeTxt:   { color: colors.textSecondary, fontWeight:'700' },
});

// ─── Edit Rival Modal ─────────────────────────────────────────────────────────

function EditRivalModal({ visible, item, onClose, onSave }) {
    const t = useT();
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [calVisible, setCalVisible] = useState(false);

    useEffect(() => {
        if (visible && item) {
            setForm({
                message:   item.message   || '',
                matchDate: item.matchDate ? new Date(item.matchDate) : null,
                matchTime: item.matchTime || '',
                location:  item.location  || '',
                courtName: item.courtName || '',
                minRating: item.minRating != null ? String(item.minRating) : '',
                maxRating: item.maxRating != null ? String(item.maxRating) : '',
                matchMode: item.matchMode || 'FREE',
            });
        }
    }, [visible, item?.id]);

    const handleSave = async () => {
        setSaving(true);
        try {
            await api.patch(`/rivals/${item.id}`, {
                message:   form.message   || null,
                matchDate: form.matchDate ? form.matchDate.toISOString() : null,
                matchTime: form.matchTime || null,
                location:  form.location  || null,
                courtName: form.courtName || null,
                minRating: form.minRating !== '' ? form.minRating : null,
                maxRating: form.maxRating !== '' ? form.maxRating : null,
                matchMode: form.matchMode || 'FREE',
            });
            onSave();
            onClose();
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || t.actionFailed);
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={{ flex: 1, backgroundColor: colors.bg }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: Platform.OS === 'ios' ? 56 : 24, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <TouchableOpacity onPress={onClose} style={{ marginRight: 14, padding: 4 }}>
                        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '300' }}>←</Text>
                    </TouchableOpacity>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', flex: 1 }}>✏️ İlanı Düzenle</Text>
                    <TouchableOpacity
                        style={[s.joinBtn, { paddingHorizontal: 16, paddingVertical: 8, opacity: saving ? 0.6 : 1 }]}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        <Text style={s.joinBtnText}>{saving ? '...' : 'Kaydet'}</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
                    <Text style={s.fieldLabel}>📅 Tarih</Text>
                    <TouchableOpacity style={[s.fieldInput, { justifyContent: 'center' }]} onPress={() => setCalVisible(true)}>
                        <Text style={{ color: form.matchDate ? '#fff' : colors.textMuted, fontSize: 14 }}>
                            {form.matchDate
                                ? form.matchDate.toLocaleDateString(t.dateLocale, { day: 'numeric', month: 'long', weekday: 'long' })
                                : 'Tarih seçin...'}
                        </Text>
                    </TouchableOpacity>

                    <Text style={s.fieldLabel}>🕐 Saat</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                        {TIME_OPTS.slice(0, 50).map(o => (
                            <TouchableOpacity
                                key={o.value || 'none'}
                                style={{ paddingHorizontal: 10, paddingVertical: 7, borderRadius: 8, marginRight: 6, backgroundColor: form.matchTime === o.value ? colors.purple : colors.surface2, borderWidth: 1, borderColor: form.matchTime === o.value ? colors.purple : colors.border }}
                                onPress={() => setForm(f => ({ ...f, matchTime: o.value }))}
                            >
                                <Text style={{ color: form.matchTime === o.value ? '#fff' : colors.textMuted, fontSize: 12, fontWeight: '700' }}>{o.label}</Text>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>

                    <Text style={s.fieldLabel}>📍 Konum</Text>
                    <CityAutocomplete
                        value={form.location || ''}
                        onChangeText={v => setForm(f => ({ ...f, location: v }))}
                        placeholder="Konum girin..."
                        style={{ marginBottom: 14 }}
                        inputStyle={{ borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14 }}
                    />

                    <Text style={s.fieldLabel}>🏟️ Saha Adı</Text>
                    <TextInput
                        style={s.fieldInput}
                        value={form.courtName}
                        onChangeText={v => setForm(f => ({ ...f, courtName: v }))}
                        placeholder="Saha adı girin..."
                        placeholderTextColor={colors.textMuted}
                    />

                    <Text style={s.fieldLabel}>💬 Mesaj</Text>
                    <TextInput
                        style={[s.fieldInput, { height: 80, textAlignVertical: 'top', paddingTop: 10 }]}
                        value={form.message}
                        onChangeText={v => setForm(f => ({ ...f, message: v }))}
                        placeholder="Mesajınızı girin..."
                        placeholderTextColor={colors.textMuted}
                        multiline
                    />

                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 0 }}>
                        <View style={{ flex: 1 }}>
                            <Text style={s.fieldLabel}>⭐ Min Puan</Text>
                            <TextInput
                                style={s.fieldInput}
                                value={form.minRating}
                                onChangeText={v => setForm(f => ({ ...f, minRating: v }))}
                                placeholder="0"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="decimal-pad"
                            />
                        </View>
                        <View style={{ flex: 1 }}>
                            <Text style={s.fieldLabel}>⭐ Max Puan</Text>
                            <TextInput
                                style={s.fieldInput}
                                value={form.maxRating}
                                onChangeText={v => setForm(f => ({ ...f, maxRating: v }))}
                                placeholder="5"
                                placeholderTextColor={colors.textMuted}
                                keyboardType="decimal-pad"
                            />
                        </View>
                    </View>

                    <Text style={s.fieldLabel}>💰 Maç Modu</Text>
                    <View style={{ flexDirection: 'row', gap: 10, marginBottom: 24 }}>
                        {['FREE', 'PAID'].map(mode => (
                            <TouchableOpacity
                                key={mode}
                                style={{ flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center', backgroundColor: form.matchMode === mode ? colors.purple : colors.surface2, borderWidth: 1, borderColor: form.matchMode === mode ? colors.purple : colors.border }}
                                onPress={() => setForm(f => ({ ...f, matchMode: mode }))}
                            >
                                <Text style={{ color: form.matchMode === mode ? '#fff' : colors.textMuted, fontWeight: '700' }}>
                                    {mode === 'FREE' ? '🆓 Ücretsiz' : '💰 Ücretli'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>
                </ScrollView>

                <CustomCalendarPicker
                    visible={calVisible}
                    value={form.matchDate}
                    onSelect={date => { setForm(f => ({ ...f, matchDate: date })); setCalVisible(false); }}
                    onClose={() => setCalVisible(false)}
                />
            </View>
        </Modal>
    );
}

// ─── Text Post Card ────────────────────────────────────────────────────────────

function TextPostCard({ post, cfg }) {
    const t = useT();
    const [liked, setLiked] = useState(Array.isArray(post.likes) && post.likes.length > 0);
    const [likesCount, setLikesCount] = useState(post._count?.likes || 0);
    const [showComments, setShowComments] = useState(false);
    const [comments, setComments] = useState(post.comments || []);
    const [commentText, setCommentText] = useState('');
    const [sendingComment, setSendingComment] = useState(false);

    const toggleLike = async () => {
        const next = !liked;
        setLiked(next);
        setLikesCount(c => next ? c + 1 : Math.max(0, c - 1));
        try { await api.post(`/posts/${post.id}/like`); }
        catch { setLiked(!next); setLikesCount(c => next ? Math.max(0, c - 1) : c + 1); }
    };

    const openComments = async () => {
        setShowComments(v => !v);
        if (!showComments && comments.length === 0) {
            try {
                const { data } = await api.get(`/posts/${post.id}/comments`);
                setComments(data);
            } catch {}
        }
    };

    const sendComment = async () => {
        const text = commentText.trim();
        if (!text) return;
        setSendingComment(true);
        try {
            const { data } = await api.post(`/posts/${post.id}/comment`, { content: text });
            setCommentText('');
            setComments(prev => [...prev, data]);
        } catch {}
        finally { setSendingComment(false); }
    };

    const timeAgo = (dateStr) => {
        const diff = Date.now() - new Date(dateStr).getTime();
        const m = Math.floor(diff / 60000);
        if (m < 1) return t.timeNow;
        if (m < 60) return `${m}${t.timeMinSuffix}`;
        const h = Math.floor(m / 60);
        if (h < 24) return `${h}${t.timeHourSuffix}`;
        return `${Math.floor(h / 24)}${t.timeDaySuffix}`;
    };

    return (
        <View style={s.card}>
            <View style={s.cardHeader}>
                <Avatar name={post.user?.username} size={38} color={cfg.color} />
                <View style={{ flex: 1 }}>
                    <Text style={s.cardName}>{post.user?.fullName || post.user?.username}</Text>
                    <Text style={s.cardSub}>@{post.user?.username} · {timeAgo(post.createdAt)}</Text>
                </View>
            </View>
            <Text style={[s.cardMsg, { marginBottom: 12, lineHeight: 20 }]}>{post.content}</Text>
            <View style={{ flexDirection: 'row', gap: 20, marginBottom: showComments ? 10 : 0 }}>
                <TouchableOpacity onPress={toggleLike} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={{ color: liked ? '#f43f5e' : colors.textMuted, fontSize: 16 }}>♥</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>{likesCount}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={openComments} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={{ color: showComments ? cfg.color : colors.textMuted, fontSize: 14 }}>💬</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>{comments.length || post._count?.comments || 0}</Text>
                </TouchableOpacity>
            </View>
            {showComments && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 }}>
                    {comments.map((c, i) => (
                        <View key={c.id || i} style={{ flexDirection: 'row', gap: 6, marginBottom: 5 }}>
                            <Text style={{ color: cfg.color, fontSize: 12, fontWeight: '800' }}>@{c.user?.username}</Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>{c.content}</Text>
                        </View>
                    ))}
                    <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                        <TextInput
                            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: '#fff', fontSize: 12, borderWidth: 1, borderColor: colors.border }}
                            placeholder="Yorum yaz..."
                            placeholderTextColor={colors.textMuted}
                            value={commentText}
                            onChangeText={setCommentText}
                        />
                        <TouchableOpacity onPress={sendComment} disabled={sendingComment || !commentText.trim()}
                            style={{ backgroundColor: cfg.color, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center', opacity: !commentText.trim() ? 0.4 : 1 }}>
                            <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>{sendingComment ? '…' : '↑'}</Text>
                        </TouchableOpacity>
                    </View>
                </View>
            )}
        </View>
    );
}

// ─── Upcoming Match Card ────────────────────────────────────────────────────────

const sc = StyleSheet.create({
    box:          { backgroundColor: colors.surface2, borderRadius:12, padding:12, marginTop:8, borderWidth:1, borderColor: colors.border },
    headerRow:    { flexDirection:'row', alignItems:'center', marginBottom:6 },
    colMe:        { flex:1, color:'#fff', fontSize:12, fontWeight:'800', textAlign:'center' },
    colLabel:     { width:64, color: colors.textMuted, fontSize:11, fontWeight:'700', textAlign:'center' },
    colOpp:       { flex:1, color:'#fff', fontSize:12, fontWeight:'800', textAlign:'center' },
    setRow:       { flexDirection:'row', alignItems:'center', paddingVertical:5 },
    setScore:     { flex:1, fontSize:22, fontWeight:'900', textAlign:'center' },
    setInputRow:  { flexDirection:'row', alignItems:'center', gap:6, marginBottom:8 },
    setInput:     { flex:1, backgroundColor:'#ffffff0d', borderRadius:8, borderWidth:1, borderColor: colors.border, color:'#fff', fontSize:22, fontWeight:'900', textAlign:'center', paddingVertical:10 },
    divider:      { height:1, backgroundColor: colors.border, marginVertical:6 },
    totalRow:     { flexDirection:'row', alignItems:'center', paddingVertical:4 },
    totalScore:   { flex:1, fontSize:18, fontWeight:'900', color:'#fff', textAlign:'center' },
    totalLabel:   { width:64, color: colors.textMuted, fontSize:11, fontWeight:'800', textAlign:'center' },
    winnerRow:    { alignItems:'center', paddingTop:6 },
    winnerText:   { fontSize:13, fontWeight:'800' },
    addBtn:       { flexDirection:'row', justifyContent:'center', alignItems:'center', paddingVertical:8, borderRadius:8, borderWidth:1, borderColor: colors.border, borderStyle:'dashed', marginBottom:4 },
    addBtnTxt:    { color: colors.purple, fontSize:13, fontWeight:'700' },
    removeBtn:    { padding:6, marginLeft:2 },
    removeTxt:    { color: colors.textMuted, fontSize:13 },
    radioRow:     { flexDirection:'row', alignItems:'center', gap:10, padding:12, borderRadius:12, borderWidth:1, borderColor: colors.border, marginBottom:8 },
    radioActive:  { borderColor: colors.purple },
    radio:        { width:18, height:18, borderRadius:9, borderWidth:2, borderColor: colors.border },
    radioChecked: { borderColor: colors.purple, backgroundColor: colors.purple },
    radioLabel:   { color:'#fff', fontSize:14, fontWeight:'700', flex:1 },
    warningText:  { color:'#facc15', fontSize:12, fontWeight:'600', backgroundColor:'#facc1510', borderRadius:10, padding:10, marginBottom:8, borderWidth:1, borderColor:'#facc1540' },
    lockedTxt:    { color: colors.textMuted, fontSize:11, textAlign:'center', marginTop:6 },
});

function UpcomingCard({ match, myId, onRefresh, isMatched, onOpenComments, onUserPress }) {
    const t = useT();
    const [showScore, setShowScore] = useState(false);
    const [sets, setSets] = useState([{ my: '', opp: '' }]);
    const [submitting, setSubmitting] = useState(false);
    const [showCantScore, setShowCantScore] = useState(false);
    const [abandonReason, setAbandonReason] = useState(null);
    const [abandoning, setAbandoning] = useState(false);
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelling, setCancelling] = useState(false);
    const [abanDate, setAbanDate] = useState(null);
    const [abanTime, setAbanTime] = useState('');
    const [abanSets, setAbanSets] = useState([{ my: '', opp: '' }]);
    const [showAbanDatePicker, setShowAbanDatePicker] = useState(false);
    const [showAbanTimePicker, setShowAbanTimePicker] = useState(false);
    const [abanCourtText, setAbanCourtText] = useState('');
    const [abanCourtResults, setAbanCourtResults] = useState([]);
    const [abanSelectedCourt, setAbanSelectedCourt] = useState(null);
    const [abanShowManual, setAbanShowManual] = useState(false);
    const [abanManualName, setAbanManualName] = useState('');
    const [abanManualCity, setAbanManualCity] = useState('');
    const [abanManualAddress, setAbanManualAddress] = useState('');
    const [abanSearching, setAbanSearching] = useState(false);
    const [showNoShow, setShowNoShow] = useState(false);
    const [noShowAbsent, setNoShowAbsent] = useState([]);
    const [noShowPhoto, setNoShowPhoto] = useState(null);
    const [noShowUploading, setNoShowUploading] = useState(false);
    const [noShowSubmitting, setNoShowSubmitting] = useState(false);
    // Flexible schedule proposal
    const [showScheduleForm, setShowScheduleForm] = useState(false);
    const [propDate, setPropDate] = useState(null);
    const [propTime, setPropTime] = useState('');
    const [propLocation, setPropLocation] = useState('');
    const [propSubmitting, setPropSubmitting] = useState(false);
    const [propAccepting, setPropAccepting] = useState(false);
    const [showPropDatePicker, setShowPropDatePicker] = useState(false);
    const [showPropTimePicker, setShowPropTimePicker] = useState(false);
    const [propCourtText, setPropCourtText] = useState('');
    const [propCourtResults, setPropCourtResults] = useState([]);
    const [propCourtSearching, setPropCourtSearching] = useState(false);
    const [propSelectedCourt, setPropSelectedCourt] = useState(null);
    const [propShowManual, setPropShowManual] = useState(false);
    const [propManualName, setPropManualName] = useState('');
    const [propManualCity, setPropManualCity] = useState('');
    const isOwner = match.senderId === myId;
    const cfg = getConfig(match.subCategory);
    const opponent = isOwner ? match.participants?.[0] : match.sender;

    // Build player list with skill rating: sender first, then participants in order
    const allPlayers = [
        { ...match.sender, skillRating: match.senderSkillRating, alias: match.senderAlias },
        ...(Array.isArray(match.participants) ? match.participants : []),
    ].filter(Boolean);

    const getMatchEnd = (m) => {
        if (!m.matchDate || !m.matchTime) return null;
        const [h, min] = m.matchTime.split(':').map(Number);
        const d = new Date(m.matchDate);
        d.setHours(h, min, 0, 0);
        return new Date(d.getTime() + (m.duration || 90) * 60 * 1000);
    };
    const matchEnd = getMatchEnd(match);
    const scoreUnlocked = matchEnd ? new Date() >= matchEnd : false;

    // Penalty window: < 5 hours before match start
    const getMatchStart = (m) => {
        if (!m.matchDate || !m.matchTime) return null;
        const [h, min] = m.matchTime.split(':').map(Number);
        const d = new Date(m.matchDate);
        d.setHours(h, min, 0, 0);
        return d;
    };
    const matchStart = getMatchStart(match);
    const hoursUntilMatch = matchStart ? (matchStart - new Date()) / (1000 * 60 * 60) : null;
    const withinPenaltyWindow = hoursUntilMatch !== null && hoursUntilMatch > 0 && hoursUntilMatch <= 5;

    // Mutual cancel state
    const mutualReqs = Array.isArray(match.mutualCancelRequests) ? match.mutualCancelRequests : [];
    const otherRequestedMutual = mutualReqs.includes(opponent?.id);
    const iAlreadyRequestedMutual = mutualReqs.includes(myId);

    const addSet    = () => setSets(p => [...p, { my: '', opp: '' }]);
    const removeSet = (i) => { if (sets.length > 1) setSets(p => p.filter((_, idx) => idx !== i)); };
    const updateSet = (i, field, val) => setSets(p => p.map((r, idx) => idx === i ? { ...r, [field]: val } : r));

    const totalMy  = sets.reduce((s, r) => s + (parseInt(r.my)  || 0), 0);
    const totalOpp = sets.reduce((s, r) => s + (parseInt(r.opp) || 0), 0);
    const mySetWins  = sets.filter(r => parseInt(r.my)  > parseInt(r.opp)).length;
    const oppSetWins = sets.filter(r => parseInt(r.opp) > parseInt(r.my)).length;
    const hasAnyInput = sets.some(r => r.my !== '' || r.opp !== '');
    const autoWinner = mySetWins === oppSetWins && totalMy === totalOpp
        ? 'draw'
        : (mySetWins > oppSetWins || (mySetWins === oppSetWins && totalMy > totalOpp))
            ? (isOwner ? 'sender' : 'opponent')
            : (isOwner ? 'opponent' : 'sender');
    const iWin = autoWinner === (isOwner ? 'sender' : 'opponent');

    const submitScore = async () => {
        if (!hasAnyInput) { Alert.alert('', t.missingScore); return; }
        if (match.subCategory === 'tennis' || match.subCategory === 'padel') {
            for (const r of sets) {
                const p1 = parseInt(r.my) || 0, p2 = parseInt(r.opp) || 0;
                if (p1 === 0 && p2 === 0) continue;
                const hi = Math.max(p1, p2), lo = Math.min(p1, p2);
                const valid = (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
                if (!valid) {
                    Alert.alert('Geçersiz Set Skoru', `${p1}-${p2} geçersiz. Tenis/Padel setinde kazanan 6 (max 6-4) veya 7-5/7-6 ile bitmelidir.`);
                    return;
                }
            }
        }
        setSubmitting(true);
        try {
            const apiSets = sets.map(r => ({
                sender:   isOwner ? (parseInt(r.my) || 0) : (parseInt(r.opp) || 0),
                opponent: isOwner ? (parseInt(r.opp) || 0) : (parseInt(r.my) || 0),
            }));
            const doRequest = () => api.patch(`/rivals/${match.id}/score`, { sets: apiSets, winner: autoWinner });
            try {
                await doRequest();
            } catch (firstErr) {
                if (!firstErr.response) await doRequest();
                else throw firstErr;
            }
            Alert.alert('', t.scoreSent);
            setShowScore(false);
            setSets([{ my: '', opp: '' }]);
            onRefresh();
        } catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.sendFailed); }
        finally { setSubmitting(false); }
    };

    const confirmScore = async () => {
        try {
            await api.patch(`/rivals/${match.id}/confirm-score`, {});
            Alert.alert('', t.scoreConfirmed);
            onRefresh();
        } catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.confirmFailed); }
    };

    const searchAbanCourts = async (text) => {
        setAbanCourtText(text);
        setAbanSelectedCourt(null);
        if (text.length < 2) { setAbanCourtResults([]); return; }
        setAbanSearching(true);
        try {
            const { data } = await api.get('/courts/search', { params: { q: text, sport: match.subCategory } });
            setAbanCourtResults(Array.isArray(data) ? data : []);
        } catch { setAbanCourtResults([]); }
        finally { setAbanSearching(false); }
    };

    const selectAbanCourt = (court) => {
        setAbanSelectedCourt(court);
        setAbanCourtText(court.name);
        setAbanCourtResults([]);
        setAbanShowManual(false);
        setAbanManualCity(court.city || '');
    };

    const submitAbandon = async () => {
        setAbandoning(true);
        try {
            const body = { reason: abandonReason };
            if (abandonReason === 'abandoned') {
                if (abanDate) body.newDate = `${abanDate.getFullYear()}-${String(abanDate.getMonth()+1).padStart(2,'0')}-${String(abanDate.getDate()).padStart(2,'0')}`;
                if (abanTime) body.newTime = abanTime;
                const courtName = abanSelectedCourt?.name || (abanShowManual ? abanManualName : null) || abanCourtText || null;
                const courtLoc  = abanSelectedCourt?.city || abanManualCity || null;
                if (courtName) body.newCourtName = courtName;
                if (courtLoc)  body.newLocation  = courtLoc;
                const validSets = abanSets.filter(r => r.my !== '' || r.opp !== '');
                if (validSets.length > 0) {
                    body.partialSets = validSets.map(r => ({
                        sender:   isOwner ? (parseInt(r.my)||0) : (parseInt(r.opp)||0),
                        opponent: isOwner ? (parseInt(r.opp)||0) : (parseInt(r.my)||0),
                    }));
                }
            }
            await api.patch(`/rivals/${match.id}/abandon`, body);
            Alert.alert('', abandonReason === 'other' ? t.otherSuccess : t.abandonSuccess);
            setShowCantScore(false);
            setAbandonReason(null);
            onRefresh();
        } catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.abandonFailed); }
        finally { setAbandoning(false); }
    };

    const doCancel = async () => {
        setCancelling(true);
        try {
            await api.patch(`/rivals/${match.id}/cancel-match`, { mutual: false });
            Alert.alert('', t.cancelMatchSuccess);
            onRefresh();
        } catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.cancelMatchFailed); }
        finally { setCancelling(false); }
    };

    const handleCancelPress = () => {
        const msg = withinPenaltyWindow
            ? t.cancelMatchPenaltyWarning
            : t.cancelMatchConfirmMsg;
        Alert.alert(
            t.cancelMatchTitle,
            msg,
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: withinPenaltyWindow ? `${t.cancelMatchBtn} (-0.20)` : t.cancelMatchBtn,
                    onPress: doCancel,
                    style: 'destructive',
                },
            ]
        );
    };

    const searchPropCourts = async (text) => {
        setPropCourtText(text);
        setPropSelectedCourt(null);
        setPropShowManual(false);
        if (text.length < 2) { setPropCourtResults([]); return; }
        setPropCourtSearching(true);
        try {
            const { data } = await api.get('/courts/search', { params: { q: text, sport: match.subCategory } });
            setPropCourtResults(Array.isArray(data) ? data : []);
        } catch { setPropCourtResults([]); }
        finally { setPropCourtSearching(false); }
    };

    const selectPropCourt = (court) => {
        setPropSelectedCourt(court);
        setPropCourtText(court.name);
        setPropCourtResults([]);
        setPropShowManual(false);
    };

    const clearPropCourt = () => {
        setPropSelectedCourt(null);
        setPropCourtText('');
        setPropCourtResults([]);
        setPropShowManual(false);
        setPropManualName('');
        setPropManualCity('');
    };

    const submitProposal = async () => {
        if (!propDate || !propTime) { Alert.alert('', 'Tarih ve saat seçin'); return; }
        setPropSubmitting(true);
        try {
            const courtName = propSelectedCourt?.name || (propShowManual ? propManualName.trim() : null) || propCourtText.trim() || null;
            const location  = propSelectedCourt?.city  || (propShowManual ? propManualCity.trim()  : null) || null;

            if (propShowManual && propManualName.trim() && !propSelectedCourt) {
                api.post('/courts', {
                    name: propManualName.trim(),
                    city: propManualCity.trim() || '',
                    sport: match.subCategory,
                }).catch(() => {});
            }

            const dateStr = `${propDate.getFullYear()}-${String(propDate.getMonth()+1).padStart(2,'0')}-${String(propDate.getDate()).padStart(2,'0')}`;
            await api.post(`/rivals/${match.id}/propose-schedule`, {
                date: dateStr,
                time: propTime,
                courtName: courtName || undefined,
                location: location || courtName || undefined,
            });
            setShowScheduleForm(false);
            onRefresh();
        } catch(e) { Alert.alert('', e?.response?.data?.message || 'Gönderilemedi'); }
        finally { setPropSubmitting(false); }
    };

    const acceptProposal = async () => {
        setPropAccepting(true);
        try {
            await api.post(`/rivals/${match.id}/accept-schedule`, {});
            onRefresh();
        } catch(e) { Alert.alert('', e?.response?.data?.message || 'Kabul edilemedi'); }
        finally { setPropAccepting(false); }
    };

    const getScheduleCountdown = () => {
        if (!match.schedulingDeadline) return null;
        const diff = new Date(match.schedulingDeadline) - new Date();
        if (diff <= 0) return '⏰ Süre doldu';
        const h = Math.floor(diff / (1000 * 60 * 60));
        const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        return `${h}s ${m}dk kaldı`;
    };

    const doMutualCancel = async () => {
        setCancelling(true);
        try {
            const res = await api.patch(`/rivals/${match.id}/cancel-match`, { mutual: true });
            if (res.data?.cancelled) {
                Alert.alert('', t.cancelMatchSuccess);
                onRefresh();
            } else {
                Alert.alert('', t.mutualCancelSentMsg);
                onRefresh();
            }
            setShowCancelModal(false);
        } catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.cancelMatchFailed); }
        finally { setCancelling(false); }
    };

    const handleMutualCancelPress = (isConfirming) => {
        const msg = isConfirming
            ? t.mutualCancelConfirmOther
            : t.mutualCancelConfirmSelf;
        Alert.alert('🤝 Karşılıklı İptal', msg, [
            { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
            { text: t.confirmBtn || 'Onayla', onPress: doMutualCancel },
        ]);
    };

    // ── No-show ────────────────────────────────────────────────────────────────
    const otherPlayers = allPlayers.filter(p => p.id !== myId);
    const matchStarted = matchStart ? new Date() >= matchStart : false;
    const canReportNoShow = matchStarted && match.scoreStatus !== 'CONFIRMED' && !match._myNoShowPending;

    const toggleAbsent = (id) => setNoShowAbsent(prev =>
        prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );

    const pickNoShowPhoto = async () => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('', 'Galeri izni gerekli'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ImagePicker.MediaTypeOptions.Images,
            quality: 0.7,
        });
        if (!result.canceled && result.assets?.[0]) {
            setNoShowPhoto(result.assets[0]);
        }
    };

    const submitNoShow = async () => {
        if (noShowAbsent.length === 0) { Alert.alert('', 'En az bir oyuncu seçin'); return; }
        setNoShowSubmitting(true);
        try {
            let courtPhotoUrl = null;
            if (noShowPhoto) {
                setNoShowUploading(true);
                const form = new FormData();
                form.append('file', { uri: noShowPhoto.uri, name: 'court.jpg', type: 'image/jpeg' });
                const up = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
                courtPhotoUrl = up.data.url;
                setNoShowUploading(false);
            }
            await api.post(`/rivals/${match.id}/no-show`, { absentUserIds: noShowAbsent, courtPhotoUrl });
            Alert.alert('✅', 'Bildirim admin onayına gönderildi');
            setShowNoShow(false);
            setNoShowAbsent([]);
            setNoShowPhoto(null);
            onRefresh();
        } catch(e) {
            setNoShowUploading(false);
            Alert.alert('Hata', e?.response?.data?.message || 'Gönderilemedi');
        }
        finally { setNoShowSubmitting(false); }
    };

    // Parse existing score
    const existingSets = Array.isArray(match.score?.sets) ? match.score.sets : null;
    const existingWinner = match.score?.winner;
    const hasScore = !!existingSets;
    const dispMyTotal  = hasScore ? existingSets.filter(r => (isOwner ? r.sender : r.opponent) > (isOwner ? r.opponent : r.sender)).length : 0;
    const dispOppTotal = hasScore ? existingSets.filter(r => (isOwner ? r.opponent : r.sender) > (isOwner ? r.sender : r.opponent)).length : 0;
    const dispIWin = existingWinner === (isOwner ? 'sender' : 'opponent');
    const dispDraw = existingWinner === 'draw';

    const expanded = showScore || showScheduleForm;
    return (
        <View style={[s.card, { width: '100%', paddingHorizontal:3, paddingTop:3, paddingBottom:3, borderColor: isMatched ? '#16a34a60' : '#a855f740', backgroundColor: isMatched ? '#16a34a08' : undefined }]}>
            {/* Tappable info — opens comments modal */}
            <TouchableOpacity activeOpacity={0.75} onPress={() => onOpenComments?.(match)}>
                <View>
                    {allPlayers.map((p, idx) => (
                        <View key={p.id || idx} style={{ flexDirection:'row', alignItems:'center', gap:4, flexWrap:'wrap', marginBottom: idx < allPlayers.length - 1 ? 2 : 0 }}>
                            <TouchableOpacity onPress={() => p.id && onUserPress?.(p.id)} activeOpacity={0.7} style={{ flexShrink:1 }}>
                                <Text style={s.cardName}>{senderAlias(p)}</Text>
                            </TouchableOpacity>
                            {p.skillRating != null && (
                                <Text style={{ color:'#facc15', fontSize:11, fontWeight:'800' }}>
                                    {Number(p.skillRating).toFixed(2)} ★
                                </Text>
                            )}
                        </View>
                    ))}
                </View>
                <View style={{ flexDirection:'row', alignItems:'center', gap:3, flexWrap:'wrap', marginTop:3 }}>
                    <View style={[s.modeBadge, { backgroundColor: cfg.color+'20', borderColor: cfg.color+'40' }]}>
                        <Text style={[s.modeBadgeText, { color: cfg.color }]}>
                            {match.matchType === 'DOUBLE' ? '2v2' : (match.teamSize||1) > 1 ? `${match.teamSize}v${match.teamSize}` : '1v1'}
                        </Text>
                    </View>
                    {match.matchMode?.toUpperCase() === 'COMPETITIVE' && (
                        <View style={[s.modeBadge, { backgroundColor:'#ef444420', borderColor:'#ef444440' }]}>
                            <Text style={[s.modeBadgeText, { color:'#ef4444' }]}>{t.modeCompetitive}</Text>
                        </View>
                    )}
                    {match.matchMode?.toUpperCase() === 'PRACTICE' && (
                        <View style={[s.modeBadge, { backgroundColor:'#22c55e20', borderColor:'#22c55e40' }]}>
                            <Text style={[s.modeBadgeText, { color:'#22c55e' }]}>{t.modePractice}</Text>
                        </View>
                    )}
                    {match.flexibleSchedule && (
                        <View style={[s.modeBadge, { backgroundColor:'#f59e0b20', borderColor:'#f59e0b40' }]}>
                            <Text style={[s.modeBadgeText, { color:'#f59e0b' }]}>📅 Esnek</Text>
                        </View>
                    )}
                </View>
                <Text style={[s.cardSub, { marginTop:3 }]}>
                    {match.flexibleSchedule ? t.unknownDate : match.matchDate ? new Date(match.matchDate).toLocaleDateString(t.dateLocale, { day:'numeric', month:'short', weekday:'short' }) : t.unknownDate}
                    {!match.flexibleSchedule && match.matchTime ? ` · ${match.matchTime}` : ''}
                    {match.duration  ? ` · ${match.duration} ${t.timeMinSuffix}` : ''}
                </Text>
                {match.courtName && (
                    <TouchableOpacity onPress={() => openCourtMap(match.courtName, match.courtLat, match.courtLng, match.courtAddress)}>
                        <Text style={[s.cardSub, { color:'#60a5fa', textDecorationLine:'underline', marginTop:3 }]}>🏟️ {match.courtName}</Text>
                    </TouchableOpacity>
                )}
                <Text style={{ color: colors.textMuted, fontSize:11, marginTop:3 }}>
                    💬 {t.matchCommentsBtn} {match.commentCount ?? 0}
                </Text>
                {match.level && (
                    <View style={{ flexDirection:'row', marginTop:3 }}>
                        <View style={[s.modeBadge, { backgroundColor:'#ffffff10', borderColor:'#ffffff20' }]}>
                            <Text style={[s.modeBadgeText, { color: colors.textSecondary }]}>
                                {LEVEL_EMOJI[match.level]} {t.levelTr?.[match.level] || match.level}
                            </Text>
                        </View>
                    </View>
                )}
            </TouchableOpacity>

            {/* Aksiyon butonları — kart genişliğine sığacak şekilde alta, sarmalı */}
            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginTop:3 }}>
                {!hasScore && scoreUnlocked && (
                    <>
                        <TouchableOpacity style={[s.scoreBtn, { paddingHorizontal:3, paddingVertical:3 }]} onPress={() => setShowScore(v => !v)}>
                            <Text style={s.scoreBtnText}>{showScore ? '▲' : t.enterScore}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={{ paddingHorizontal:3, paddingVertical:3, borderRadius:7, borderWidth:1, borderColor:'#dc262630', backgroundColor:'#dc262612' }}
                            onPress={() => setShowCantScore(true)}
                        >
                            <Text style={{ color:'#f87171', fontSize:9, fontWeight:'700' }}>{t.cantScoreBtn}</Text>
                        </TouchableOpacity>
                    </>
                )}
                {match.scoreStatus !== 'CONFIRMED' && (
                    <>
                        {withinPenaltyWindow && (
                            !iAlreadyRequestedMutual ? (
                                <TouchableOpacity
                                    style={{ paddingHorizontal:3, paddingVertical:3, borderRadius:8, borderWidth:1, borderColor:'#2563eb40', backgroundColor:'#2563eb18' }}
                                    onPress={() => handleMutualCancelPress(false)}
                                    disabled={cancelling}
                                >
                                    <Text style={{ color:'#60a5fa', fontSize:10, fontWeight:'700' }}>🤝 Karşılıklı</Text>
                                </TouchableOpacity>
                            ) : (
                                <View style={{ paddingHorizontal:3, paddingVertical:3, borderRadius:8, borderWidth:1, borderColor:'#2563eb30', backgroundColor:'#2563eb10' }}>
                                    <Text style={{ color:'#60a5fa', fontSize:10 }}>⏳ İstendi</Text>
                                </View>
                            )
                        )}
                        <TouchableOpacity
                            style={{ paddingHorizontal:3, paddingVertical:3, borderRadius:8, borderWidth:1, borderColor:'#dc262640', backgroundColor:'#dc262618' }}
                            onPress={handleCancelPress}
                            disabled={cancelling}
                        >
                            <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>
                                ✕ İptal{withinPenaltyWindow ? ' ⚠️' : ''}
                            </Text>
                        </TouchableOpacity>
                    </>
                )}
                {canReportNoShow && (
                    <TouchableOpacity
                        style={{ paddingHorizontal:3, paddingVertical:3, borderRadius:8, borderWidth:1, borderColor:'#f9731640', backgroundColor:'#f9731618' }}
                        onPress={() => { setNoShowAbsent([]); setNoShowPhoto(null); setShowNoShow(true); }}
                    >
                        <Text style={{ color:'#fb923c', fontSize:10, fontWeight:'700' }}>🚫 Gelmedi</Text>
                    </TouchableOpacity>
                )}
                {match._myNoShowPending && (
                    <View style={{ paddingHorizontal:3, paddingVertical:3, borderRadius:8, borderWidth:1, borderColor:'#f9731630', backgroundColor:'#f9731610' }}>
                        <Text style={{ color:'#fb923c', fontSize:10 }}>⏳ Bildirildi</Text>
                    </View>
                )}
            </View>

            {/* Flexible schedule proposal panel */}
            {match.flexibleSchedule && !match.matchDate && (
                <View style={{ backgroundColor:'#f59e0b10', borderRadius:10, padding:10, marginTop:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                    <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <Text style={{ color:'#f59e0b', fontSize:12, fontWeight:'800' }}>📅 Tarih/Saat/Yer Belirle</Text>
                        {match.schedulingDeadline && (
                            <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>{getScheduleCountdown()}</Text>
                        )}
                    </View>

                    {match.scheduleProposal ? (
                        match.scheduleProposal.userId === myId ? (
                            <View>
                                <Text style={{ color: colors.textMuted, fontSize:11 }}>Öneriniz bekleniyor:</Text>
                                <Text style={{ color:'#fff', fontSize:12, fontWeight:'700', marginTop:2 }}>
                                    {`📅 ${match.scheduleProposal.date}  🕐 ${match.scheduleProposal.time}${match.scheduleProposal.location ? `  📍 ${match.scheduleProposal.location}` : ''}`}
                                </Text>
                                <TouchableOpacity onPress={() => setShowScheduleForm(v => !v)} style={{ marginTop:6 }}>
                                    <Text style={{ color:'#f59e0b', fontSize:11, fontWeight:'700' }}>✏️ Değiştir</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            <View>
                                <Text style={{ color: colors.textMuted, fontSize:11 }}>Rakibinizin önerisi:</Text>
                                <Text style={{ color:'#fff', fontSize:12, fontWeight:'700', marginTop:2 }}>
                                    {`📅 ${match.scheduleProposal.date}  🕐 ${match.scheduleProposal.time}${match.scheduleProposal.location ? `  📍 ${match.scheduleProposal.location}` : ''}`}
                                </Text>
                                <View style={{ flexDirection:'row', gap:8, marginTop:8 }}>
                                    <TouchableOpacity
                                        style={{ flex:1, backgroundColor:'#16a34a20', borderRadius:8, paddingVertical:7, borderWidth:1, borderColor:'#16a34a50', alignItems:'center' }}
                                        onPress={acceptProposal} disabled={propAccepting}>
                                        <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'800' }}>{propAccepting ? '...' : '✅ Kabul Et'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{ flex:1, backgroundColor:'#f59e0b15', borderRadius:8, paddingVertical:7, borderWidth:1, borderColor:'#f59e0b40', alignItems:'center' }}
                                        onPress={() => setShowScheduleForm(v => !v)}>
                                        <Text style={{ color:'#f59e0b', fontSize:12, fontWeight:'700' }}>📅 Farklı Öner</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        )
                    ) : (
                        <TouchableOpacity
                            style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingVertical:8, borderWidth:1, borderColor:'#f59e0b50', alignItems:'center' }}
                            onPress={() => setShowScheduleForm(v => !v)}>
                            <Text style={{ color:'#f59e0b', fontSize:12, fontWeight:'700' }}>📅 Tarih/Saat/Yer Öner</Text>
                        </TouchableOpacity>
                    )}

                    {showScheduleForm && (
                        <View style={{ marginTop:10, gap:8 }}>
                            <TouchableOpacity
                                style={{ backgroundColor: colors.surface2, borderRadius:8, padding:10, borderWidth:1, borderColor: propDate ? '#f59e0b60' : colors.border }}
                                onPress={() => setShowPropDatePicker(true)}>
                                <Text style={{ color: propDate ? '#fff' : colors.textMuted, fontSize:13 }}>
                                    {propDate ? `📅 ${String(propDate.getDate()).padStart(2,'0')}/${String(propDate.getMonth()+1).padStart(2,'0')}/${propDate.getFullYear()}` : '📅 Tarih Seç'}
                                </Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ backgroundColor: colors.surface2, borderRadius:8, padding:10, borderWidth:1, borderColor: propTime ? '#f59e0b60' : colors.border }}
                                onPress={() => setShowPropTimePicker(true)}>
                                <Text style={{ color: propTime ? '#fff' : colors.textMuted, fontSize:13 }}>
                                    {propTime ? `🕐 ${propTime}` : '🕐 Saat Seç'}
                                </Text>
                            </TouchableOpacity>
                            {/* Court search */}
                            {propSelectedCourt ? (
                                <View style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#16a34a15', borderRadius:8, padding:10, borderWidth:1, borderColor:'#16a34a50', gap:8 }}>
                                    <Text style={{ color:'#4ade80', fontSize:13, flex:1 }} numberOfLines={1}>🏟️ {propSelectedCourt.name}{propSelectedCourt.city ? `  · ${propSelectedCourt.city}` : ''}</Text>
                                    <TouchableOpacity onPress={clearPropCourt}><Text style={{ color: colors.textMuted, fontSize:14 }}>✕</Text></TouchableOpacity>
                                </View>
                            ) : (
                                <TextInput
                                    style={{ backgroundColor: colors.surface2, borderRadius:8, padding:10, borderWidth:1, borderColor: propCourtText ? '#f59e0b60' : colors.border, color:'#fff', fontSize:13 }}
                                    placeholder="🔍 Kort Ara (isteğe bağlı)"
                                    placeholderTextColor={colors.textMuted}
                                    value={propCourtText}
                                    onChangeText={searchPropCourts}
                                />
                            )}
                            {propCourtSearching && <ActivityIndicator size="small" color={cfg.color} style={{ marginTop:4 }} />}
                            {propCourtResults.length > 0 && (
                                <View style={{ backgroundColor: colors.surface2, borderRadius:8, marginTop:4, borderWidth:1, borderColor: colors.border }}>
                                    {propCourtResults.map((court, i) => (
                                        <TouchableOpacity key={court.id}
                                            style={{ padding:10, borderBottomWidth: i < propCourtResults.length - 1 ? 1 : 0, borderBottomColor: colors.border + '40' }}
                                            onPress={() => selectPropCourt(court)}>
                                            <Text style={{ color:'#fff', fontSize:13, fontWeight:'600' }}>{court.name}</Text>
                                            {court.city && <Text style={{ color: colors.textMuted, fontSize:11, marginTop:1 }}>{court.city}</Text>}
                                        </TouchableOpacity>
                                    ))}
                                    <TouchableOpacity
                                        style={{ padding:10, borderTopWidth:1, borderTopColor: colors.border + '40' }}
                                        onPress={() => { setPropCourtResults([]); setPropShowManual(true); }}>
                                        <Text style={{ color:'#f59e0b', fontSize:12 }}>+ "{propCourtText}" olarak ekle → admin onayına gider</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                            {!propSelectedCourt && !propCourtSearching && propCourtText.length >= 2 && propCourtResults.length === 0 && !propShowManual && (
                                <TouchableOpacity style={{ marginTop:4, paddingVertical:6, paddingHorizontal:2 }} onPress={() => setPropShowManual(true)}>
                                    <Text style={{ color:'#f59e0b', fontSize:12 }}>+ Kort bulunamadı — manuel ekle (onay bekler)</Text>
                                </TouchableOpacity>
                            )}
                            {propShowManual && (
                                <View style={{ backgroundColor:'#1e293b', borderRadius:8, padding:10, marginTop:4, borderWidth:1, borderColor:'#f59e0b40', gap:6 }}>
                                    <Text style={{ color:'#f59e0b', fontSize:11, fontWeight:'700' }}>⚠️ Admin onayına gönderilecek</Text>
                                    <TextInput
                                        style={{ backgroundColor: colors.surface2, borderRadius:6, padding:8, borderWidth:1, borderColor: colors.border, color:'#fff', fontSize:13 }}
                                        placeholder="Kort / Tesis Adı"
                                        placeholderTextColor={colors.textMuted}
                                        value={propManualName}
                                        onChangeText={setPropManualName}
                                    />
                                    <TextInput
                                        style={{ backgroundColor: colors.surface2, borderRadius:6, padding:8, borderWidth:1, borderColor: colors.border, color:'#fff', fontSize:13 }}
                                        placeholder="İl / Adres"
                                        placeholderTextColor={colors.textMuted}
                                        value={propManualCity}
                                        onChangeText={setPropManualCity}
                                    />
                                    <TouchableOpacity onPress={() => setPropShowManual(false)} style={{ alignSelf:'flex-start' }}>
                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>✕ İptal</Text>
                                    </TouchableOpacity>
                                </View>
                            )}
                            <TouchableOpacity
                                style={{ backgroundColor:'#f59e0b30', borderRadius:8, paddingVertical:9, borderWidth:1, borderColor:'#f59e0b60', alignItems:'center' }}
                                onPress={submitProposal} disabled={propSubmitting}>
                                <Text style={{ color:'#fbbf24', fontSize:13, fontWeight:'800' }}>{propSubmitting ? '...' : '📤 Öneriyi Gönder'}</Text>
                            </TouchableOpacity>
                            <CustomCalendarPicker
                                visible={showPropDatePicker}
                                value={propDate}
                                onSelect={(d) => { setPropDate(d); setShowPropDatePicker(false); }}
                                onClose={() => setShowPropDatePicker(false)}
                            />
                            <OptionPickerModal
                                visible={showPropTimePicker}
                                title="Saat Seç"
                                options={TIME_OPTS.filter(o => o.value)}
                                value={propTime}
                                onSelect={(v) => { setPropTime(v); setShowPropTimePicker(false); }}
                                onClose={() => setShowPropTimePicker(false)}
                            />
                        </View>
                    )}
                </View>
            )}

            {/* Existing score display */}
            {hasScore && (
                <View style={sc.box}>
                    <View style={sc.headerRow}>
                        <Text style={sc.colMe}>Sen</Text>
                        <Text style={sc.colLabel}></Text>
                        <Text style={sc.colOpp}>Rakip</Text>
                    </View>
                    {existingSets.map((row, i) => {
                        const mySc  = isOwner ? row.sender : row.opponent;
                        const oppSc = isOwner ? row.opponent : row.sender;
                        return (
                            <View key={i} style={sc.setRow}>
                                <Text style={[sc.setScore, { color: mySc > oppSc ? '#4ade80' : mySc < oppSc ? '#f87171' : '#fff' }]}>{mySc}</Text>
                                <Text style={sc.colLabel}>Set {i + 1}</Text>
                                <Text style={[sc.setScore, { color: oppSc > mySc ? '#4ade80' : oppSc < mySc ? '#f87171' : '#fff' }]}>{oppSc}</Text>
                            </View>
                        );
                    })}
                    <View style={sc.divider} />
                    <View style={sc.totalRow}>
                        <Text style={sc.totalScore}>{dispMyTotal}</Text>
                        <Text style={sc.totalLabel}>{t.totalScore}</Text>
                        <Text style={sc.totalScore}>{dispOppTotal}</Text>
                    </View>
                    <View style={sc.winnerRow}>
                        <Text style={[sc.winnerText, { color: dispDraw ? '#facc15' : dispIWin ? '#4ade80' : '#f87171' }]}>
                            {dispDraw ? t.drawResult : dispIWin ? t.winnerMe : t.winnerOpp}
                        </Text>
                    </View>
                    {match.scoreStatus === 'CONFIRMED' ? (
                        <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700', textAlign:'center', marginTop:8 }}>{t.confirmedScore}</Text>
                    ) : match.scoreEnteredBy !== myId ? (
                        <TouchableOpacity style={[s.joinBtn, { marginTop:8 }]} onPress={confirmScore}>
                            <Text style={s.joinBtnText}>{t.confirmScoreBtn}</Text>
                        </TouchableOpacity>
                    ) : (
                        <Text style={{ color: colors.textMuted, fontSize:11, textAlign:'center', marginTop:8 }}>{t.waitingConfirm}</Text>
                    )}
                </View>
            )}

            {/* Score entry form */}
            {showScore && !hasScore && (
                <View style={sc.box}>
                    <View style={sc.headerRow}>
                        <Text style={sc.colMe}>Sen</Text>
                        <Text style={sc.colLabel}></Text>
                        <Text style={sc.colOpp}>Rakip</Text>
                    </View>
                    {sets.map((row, i) => (
                        <View key={i} style={sc.setInputRow}>
                            <TextInput
                                style={sc.setInput}
                                value={row.my}
                                onChangeText={v => updateSet(i, 'my', v)}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={colors.textMuted}
                                maxLength={2}
                            />
                            <Text style={sc.colLabel}>Set {i + 1}</Text>
                            <TextInput
                                style={sc.setInput}
                                value={row.opp}
                                onChangeText={v => updateSet(i, 'opp', v)}
                                keyboardType="numeric"
                                placeholder="0"
                                placeholderTextColor={colors.textMuted}
                                maxLength={2}
                            />
                            {sets.length > 1 && (
                                <TouchableOpacity style={sc.removeBtn} onPress={() => removeSet(i)}>
                                    <Text style={sc.removeTxt}>✕</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    ))}
                    <TouchableOpacity style={sc.addBtn} onPress={addSet}>
                        <Text style={sc.addBtnTxt}>+ {t.addSet}</Text>
                    </TouchableOpacity>
                    {hasAnyInput && (
                        <>
                            <View style={sc.divider} />
                            <View style={sc.totalRow}>
                                <Text style={sc.totalScore}>{mySetWins}</Text>
                                <Text style={sc.totalLabel}>{t.totalScore}</Text>
                                <Text style={sc.totalScore}>{oppSetWins}</Text>
                            </View>
                            <View style={sc.winnerRow}>
                                <Text style={[sc.winnerText, { color: autoWinner === 'draw' ? '#facc15' : iWin ? '#4ade80' : '#f87171' }]}>
                                    {autoWinner === 'draw' ? t.drawResult : iWin ? t.winnerMe : t.winnerOpp}
                                </Text>
                            </View>
                        </>
                    )}
                    <TouchableOpacity
                        style={[s.joinBtn, { marginTop:10 }, submitting && { opacity:0.6 }]}
                        onPress={submitScore}
                        disabled={submitting}
                    >
                        <Text style={s.joinBtnText}>{submitting ? t.sending : t.sendScore}</Text>
                    </TouchableOpacity>
                </View>
            )}


            {/* Opponent requested mutual cancel — banner (only relevant within penalty window) */}
            {withinPenaltyWindow && otherRequestedMutual && !iAlreadyRequestedMutual && (
                <TouchableOpacity
                    style={{ backgroundColor:'#eab30820', borderRadius:10, padding:10, marginTop:6, borderWidth:1, borderColor:'#eab30840' }}
                    onPress={() => handleMutualCancelPress(true)}
                >
                    <Text style={{ color:'#fbbf24', fontSize:12, fontWeight:'700' }}>{t.mutualCancelOtherRequested}</Text>
                </TouchableOpacity>
            )}

            {/* Lock message */}
            {!hasScore && !scoreUnlocked && matchEnd && (
                <Text style={sc.lockedTxt}>{t.matchNotStarted}</Text>
            )}

            {/* Skor Giremiyoruz Modal */}
            <Modal visible={showCantScore} animationType="slide" transparent onRequestClose={() => { setShowCantScore(false); setAbandonReason(null); }}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { paddingBottom:40 }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t.cantScoreTitle}</Text>
                            <TouchableOpacity onPress={() => { setShowCantScore(false); setAbandonReason(null); }}>
                                <Text style={s.modalClose}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            <TouchableOpacity style={[sc.radioRow, abandonReason === 'abandoned' && sc.radioActive]} onPress={() => setAbandonReason('abandoned')}>
                                <View style={[sc.radio, abandonReason === 'abandoned' && sc.radioChecked]} />
                                <Text style={sc.radioLabel}>{t.matchAbandoned}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[sc.radioRow, abandonReason === 'other' && sc.radioActive]} onPress={() => setAbandonReason('other')}>
                                <View style={[sc.radio, abandonReason === 'other' && sc.radioChecked]} />
                                <Text style={sc.radioLabel}>{t.otherReasons}</Text>
                            </TouchableOpacity>

                            {abandonReason === 'other' && (
                                <Text style={sc.warningText}>{t.otherReasonsWarning}</Text>
                            )}

                            {abandonReason === 'abandoned' && (
                                <>
                                    <Text style={[s.fieldLabel, { marginTop:12 }]}>{t.newDate}</Text>
                                    <TouchableOpacity style={[s.fieldInput, { justifyContent:'center' }]} onPress={() => setShowAbanDatePicker(true)}>
                                        <Text style={{ color: abanDate ? '#fff' : colors.textMuted }}>
                                            {abanDate ? `${String(abanDate.getDate()).padStart(2,'0')}/${String(abanDate.getMonth()+1).padStart(2,'0')}/${abanDate.getFullYear()}` : '—'}
                                        </Text>
                                    </TouchableOpacity>
                                    <CustomCalendarPicker visible={showAbanDatePicker} value={abanDate} onSelect={(d) => { setAbanDate(d); setShowAbanDatePicker(false); }} onClose={() => setShowAbanDatePicker(false)} />

                                    <Text style={s.fieldLabel}>{t.newTime}</Text>
                                    <TouchableOpacity style={[s.fieldInput, { justifyContent:'center' }]} onPress={() => setShowAbanTimePicker(true)}>
                                        <Text style={{ color: abanTime ? '#fff' : colors.textMuted }}>{abanTime || '—'}</Text>
                                    </TouchableOpacity>
                                    <OptionPickerModal visible={showAbanTimePicker} title={t.selectTime} options={TIME_OPTS.filter(o => o.value)} value={abanTime} onSelect={setAbanTime} onClose={() => setShowAbanTimePicker(false)} />

                                    <Text style={s.fieldLabel}>{t.courtLabel}</Text>
                                    <View style={{ flexDirection:'row', gap:8, marginBottom:6 }}>
                                        <TextInput
                                            style={[s.fieldInput, { flex:1, marginBottom:0 }]}
                                            value={abanCourtText}
                                            onChangeText={searchAbanCourts}
                                            placeholder={t.courtSearchPlaceholder}
                                            placeholderTextColor={colors.textMuted}
                                        />
                                        {abanSearching && <ActivityIndicator color={cfg.color} style={{ alignSelf:'center' }} />}
                                    </View>

                                    {abanCourtResults.length > 0 && !abanSelectedCourt && (
                                        <View style={s.courtResultsBox}>
                                            {abanCourtResults.map(c => (
                                                <TouchableOpacity key={c.id} style={s.courtResultRow} onPress={() => selectAbanCourt(c)}>
                                                    <View style={{ flex:1 }}>
                                                        <Text style={s.courtResultName}>{c.name}</Text>
                                                        {c.city && <Text style={s.courtResultCity}>{c.city}</Text>}
                                                    </View>
                                                    {c.verified && <Text style={{ color:'#4ade80', fontSize:11 }}>{t.courtVerified}</Text>}
                                                </TouchableOpacity>
                                            ))}
                                            <TouchableOpacity
                                                style={[s.courtResultRow, { borderBottomWidth:0, backgroundColor:'#a855f710' }]}
                                                onPress={() => { setAbanCourtResults([]); setAbanShowManual(true); setAbanManualName(abanCourtText); }}
                                            >
                                                <Text style={{ color:'#c084fc', fontSize:13, fontWeight:'700' }}>{t.useThisName(abanCourtText)}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {abanSelectedCourt && (
                                        <View style={s.selectedCourtBox}>
                                            <Text style={s.selectedCourtText}>✅ {abanSelectedCourt.name}</Text>
                                            <TouchableOpacity onPress={() => { setAbanSelectedCourt(null); setAbanCourtText(''); setAbanCourtResults([]); }}>
                                                <Text style={{ color: colors.textMuted, fontSize:12 }}>✕</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {!abanSelectedCourt && abanCourtText.length >= 2 && abanCourtResults.length === 0 && !abanSearching && (
                                        <TouchableOpacity style={s.addCourtBtn} onPress={() => setAbanShowManual(v => !v)}>
                                            <Text style={s.addCourtBtnText}>{abanShowManual ? t.closeCourt : t.addCityAddress(abanCourtText)}</Text>
                                        </TouchableOpacity>
                                    )}

                                    {!abanSelectedCourt && abanShowManual && (
                                        <View style={s.manualCourtBox}>
                                            <Text style={s.manualCourtNote}>{t.courtSubmitNote}</Text>
                                            <TextInput style={s.fieldInput} value={abanManualName} onChangeText={setAbanManualName} placeholder={t.manualCourtLabel} placeholderTextColor={colors.textMuted} />
                                            <TextInput style={s.fieldInput} value={abanManualCity} onChangeText={setAbanManualCity} placeholder={t.manualCityLabel} placeholderTextColor={colors.textMuted} />
                                            <TextInput style={s.fieldInput} value={abanManualAddress} onChangeText={setAbanManualAddress} placeholder={t.manualAddressLabel} placeholderTextColor={colors.textMuted} />
                                        </View>
                                    )}

                                    <Text style={[s.fieldLabel, { marginTop:4 }]}>{t.currentScore}</Text>
                                    {abanSets.map((row, i) => (
                                        <View key={i} style={sc.setInputRow}>
                                            <TextInput style={sc.setInput} value={row.my} onChangeText={v => setAbanSets(p => p.map((r, idx) => idx === i ? { ...r, my: v } : r))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} maxLength={2} />
                                            <Text style={sc.colLabel}>Set {i + 1}</Text>
                                            <TextInput style={sc.setInput} value={row.opp} onChangeText={v => setAbanSets(p => p.map((r, idx) => idx === i ? { ...r, opp: v } : r))} keyboardType="numeric" placeholder="0" placeholderTextColor={colors.textMuted} maxLength={2} />
                                            {abanSets.length > 1 && (
                                                <TouchableOpacity style={sc.removeBtn} onPress={() => setAbanSets(p => p.filter((_, idx) => idx !== i))}>
                                                    <Text style={sc.removeTxt}>✕</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    ))}
                                    <TouchableOpacity style={sc.addBtn} onPress={() => setAbanSets(p => [...p, { my: '', opp: '' }])}>
                                        <Text style={sc.addBtnTxt}>+ {t.addSet}</Text>
                                    </TouchableOpacity>
                                </>
                            )}

                            {abandonReason && (
                                <TouchableOpacity
                                    style={[s.joinBtn, { marginTop:12 }, abandoning && { opacity:0.6 }]}
                                    onPress={submitAbandon}
                                    disabled={abandoning}
                                >
                                    <Text style={s.joinBtnText}>{abandoning ? t.sending : abandonReason === 'other' ? t.saveDraw : t.reschedule}</Text>
                                </TouchableOpacity>
                            )}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* ── No-Show Report Modal ── */}
            <Modal visible={showNoShow} animationType="slide" transparent onRequestClose={() => setShowNoShow(false)}>
                <View style={{ flex:1, backgroundColor:'#000000cc', justifyContent:'flex-end' }}>
                    <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':'height'}>
                        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:20, paddingBottom:36 }}>
                            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                                <Text style={{ color:'#fff', fontSize:16, fontWeight:'900' }}>🚫 Gelmeme Bildirimi</Text>
                                <TouchableOpacity onPress={() => setShowNoShow(false)}>
                                    <Text style={{ color: colors.textMuted, fontSize:22 }}>✕</Text>
                                </TouchableOpacity>
                            </View>

                            <Text style={{ color: colors.textMuted, fontSize:12, marginBottom:12 }}>
                                Kortа gelmeyen oyuncu/oyuncuları seçin. Admin onayıyla 0.40 puan kesilir.
                            </Text>

                            {/* Player selection */}
                            {otherPlayers.map(p => {
                                const selected = noShowAbsent.includes(p.id);
                                return (
                                    <TouchableOpacity
                                        key={p.id}
                                        onPress={() => toggleAbsent(p.id)}
                                        style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}
                                    >
                                        <View style={{ width:22, height:22, borderRadius:6, borderWidth:2, borderColor: selected ? '#fb923c' : colors.border, backgroundColor: selected ? '#fb923c30' : 'transparent', justifyContent:'center', alignItems:'center' }}>
                                            {selected && <Text style={{ color:'#fb923c', fontSize:12, fontWeight:'900' }}>✓</Text>}
                                        </View>
                                        <Text style={{ color:'#fff', fontWeight:'700' }}>@{p.username}</Text>
                                        {p.skillRating != null && (
                                            <Text style={{ color:'#facc15', fontSize:11 }}>{Number(p.skillRating).toFixed(2)} ★</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}

                            {/* Photo picker */}
                            <TouchableOpacity
                                onPress={pickNoShowPhoto}
                                style={{ marginTop:16, flexDirection:'row', alignItems:'center', gap:8, paddingVertical:10, paddingHorizontal:14, borderRadius:10, borderWidth:1, borderColor: noShowPhoto ? '#fb923c80' : colors.border, backgroundColor: noShowPhoto ? '#fb923c15' : colors.surface2 }}
                            >
                                <Text style={{ fontSize:18 }}>📷</Text>
                                <Text style={{ color: noShowPhoto ? '#fb923c' : colors.textMuted, fontSize:13, fontWeight:'700', flex:1 }}>
                                    {noShowPhoto ? 'Fotoğraf seçildi ✓' : 'Kort fotoğrafı ekle (opsiyonel)'}
                                </Text>
                                {noShowPhoto && (
                                    <TouchableOpacity onPress={() => setNoShowPhoto(null)}>
                                        <Text style={{ color: colors.textMuted, fontSize:16 }}>✕</Text>
                                    </TouchableOpacity>
                                )}
                            </TouchableOpacity>
                            {noShowPhoto && (
                                <Image source={{ uri: noShowPhoto.uri }} style={{ width:'100%', height:140, borderRadius:10, marginTop:8 }} resizeMode="cover" />
                            )}

                            <TouchableOpacity
                                style={{ marginTop:18, backgroundColor: noShowSubmitting || noShowAbsent.length===0 ? colors.surface2 : '#ea580c', borderRadius:12, paddingVertical:13, alignItems:'center' }}
                                onPress={submitNoShow}
                                disabled={noShowSubmitting || noShowAbsent.length===0}
                            >
                                <Text style={{ color:'#fff', fontWeight:'900', fontSize:14 }}>
                                    {noShowUploading ? 'Fotoğraf yükleniyor...' : noShowSubmitting ? 'Gönderiliyor...' : 'Admin Onayına Gönder'}
                                </Text>
                            </TouchableOpacity>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

        </View>
    );
}

// ─── Option Picker Modal (Time / Duration) ────────────────────────────────────

function OptionPickerModal({ visible, title, options, value, onSelect, onClose }) {
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={opt.overlay}>
                <View style={opt.box}>
                    <View style={opt.header}>
                        <Text style={opt.title}>{title}</Text>
                        <TouchableOpacity onPress={onClose}><Text style={opt.close}>✕</Text></TouchableOpacity>
                    </View>
                    <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 320 }}>
                        {options.map(o => (
                            <TouchableOpacity
                                key={o.value}
                                style={[opt.item, value === o.value && opt.itemActive]}
                                onPress={() => { onSelect(o.value); onClose(); }}
                            >
                                <Text style={[opt.itemText, value === o.value && opt.itemTextActive]}>{o.label}</Text>
                                {value === o.value && <Text style={{ color: colors.purple, fontSize: 16 }}>✓</Text>}
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const opt = StyleSheet.create({
    overlay:      { flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' },
    box:          { backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:20, paddingTop:20, paddingBottom:40 },
    header:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
    title:        { color:'#fff', fontSize:16, fontWeight:'900' },
    close:        { color: colors.textMuted, fontSize:22 },
    item:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:14, borderBottomWidth:1, borderBottomColor: colors.border },
    itemActive:   { },
    itemText:     { color: colors.textSecondary, fontSize:15, fontWeight:'600' },
    itemTextActive:{ color:'#fff', fontWeight:'800' },
});

function TimeGridModal({ visible, title, value, onSelect, onClose }) {
    const times = [];
    for (let h = 0; h < 24; h++) {
        for (let m = 0; m < 60; m += 15) {
            times.push(`${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`);
        }
    }
    const rows = [];
    for (let i = 0; i < times.length; i += 4) rows.push(times.slice(i, i + 4));
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={tg.overlay}>
                <View style={tg.box}>
                    <View style={tg.header}>
                        <Text style={tg.title}>{title}</Text>
                        <TouchableOpacity onPress={onClose}><Text style={tg.close}>✕</Text></TouchableOpacity>
                    </View>
                    {/* Small fixed-size grid (96 items) — plain ScrollView avoids FlatList's
                        windowed rendering, which only drew the first ~10 rows up front and
                        needed extra scroll nudges to render the rest. */}
                    <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={true}>
                        {rows.map((row, i) => (
                            <View key={i} style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
                                {row.map(item => (
                                    <TouchableOpacity
                                        key={item}
                                        style={[tg.cell, value === item && tg.cellActive]}
                                        onPress={() => { onSelect(item); onClose(); }}
                                    >
                                        <Text style={[tg.cellText, value === item && tg.cellTextActive]}>{item}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                        ))}
                    </ScrollView>
                </View>
            </View>
        </Modal>
    );
}

const tg = StyleSheet.create({
    overlay:        { flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' },
    box:            { height:'75%', backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:16, paddingTop:20, paddingBottom:40 },
    header:         { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
    title:          { color:'#fff', fontSize:16, fontWeight:'900' },
    close:          { color: colors.textMuted, fontSize:22 },
    cell:           { flex:1, paddingVertical:12, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border, alignItems:'center', justifyContent:'center' },
    cellActive:     { backgroundColor: colors.purple, borderColor: colors.purple },
    cellText:       { color: colors.textSecondary, fontSize:12, fontWeight:'700' },
    cellTextActive: { color:'#fff' },
});

function RatingPickerModal({ visible, title, value, onSelect, onClose }) {
    const ratings = ['', '0.5','1.0','1.5','2.0','2.5','3.0','3.5','4.0','4.5','5.0','5.5','6.0','6.5','7.0','7.5','8.0','8.5','9.0','9.5','10.0'];
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={tg.overlay}>
                <View style={tg.box}>
                    <View style={tg.header}>
                        <Text style={tg.title}>{title}</Text>
                        <TouchableOpacity onPress={onClose}><Text style={tg.close}>✕</Text></TouchableOpacity>
                    </View>
                    <FlatList
                        data={ratings}
                        keyExtractor={item => item === '' ? 'none' : item}
                        numColumns={4}
                        style={{ flex: 1 }}
                        columnWrapperStyle={{ gap:8, marginBottom:8 }}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[tg.cell, value === item && tg.cellActive]}
                                onPress={() => { onSelect(item); onClose(); }}
                            >
                                <Text style={[tg.cellText, value === item && tg.cellTextActive]}>
                                    {item === '' ? 'Serbest' : `${item} ★`}
                                </Text>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </View>
        </Modal>
    );
}

// ─── Create Rival Modal ────────────────────────────────────────────────────────

const DURATIONS_FULL_VALUES = ['30','60','90','120','150','180'];

const TENNIS_SURFACES = [
    { id: 'HARD',   emoji: '🔵' },
    { id: 'CLAY',   emoji: '🟤' },
    { id: 'GRASS',  emoji: '🟩' },
    { id: 'CARPET', emoji: '🟥' },
];
const PADEL_SURFACES = [
    { id: 'ARTIFICIAL', emoji: '🟩' },
    { id: 'HARD',       emoji: '🔵' },
    { id: 'GLASS',      emoji: '⬜' },
    { id: 'INDOOR',     emoji: '🏛️' },
];

function CreateRivalModal({ visible, onClose, category, sub, onCreated }) {
    const t = useT();
    const isTeamSport = TEAM_SPORTS.has(sub);
    const isFootball  = sub === 'football';
    const isVolleyball = sub === 'volleyball';
    const isPadel     = sub === 'padel';
    const teamSizes   = isFootball ? FOOTBALL_SIZES : isVolleyball ? VOLLEYBALL_SIZES : [];
    const cfg         = getConfig(sub);

    const INIT = {
        matchType: isPadel ? 'DOUBLE' : 'SINGLE', teamSize: isFootball ? 5 : 1,
        matchMode: 'PRACTICE', flexibleSchedule: false,
        matchDate: null, matchTime: '', duration: '60',
        showDatePicker: false, showTimePicker: false, showDurationPicker: false,
        courtSearchText: '', courtResults: [], selectedCourt: null,
        showManualCourt: false,
        manualCourtName: '', manualCity: '', manualAddress: '',
        surface: '', venueType: '', courtReserved: false, courtMutual: false,
        courtFeePerPerson: '',
        message: '',
        minRating: '', maxRating: '',
        partner: null,
    };
    const [f, setF]               = useState(INIT);
    const [showPartnerSearch, setShowPartnerSearch] = useState(false);
    const [partnerQuery, setPartnerQuery] = useState('');
    const [partnerResults, setPartnerResults] = useState([]);
    const [partnerSearching, setPartnerSearching] = useState(false);
    const [searching, setSearching] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [ratingPickerTarget, setRatingPickerTarget] = useState(null);
    const set = (key, val) => setF(p => ({ ...p, [key]: val }));

    useEffect(() => {
        if (!showPartnerSearch) return;
        if (!partnerQuery.trim() || partnerQuery.trim().length < 2) { setPartnerResults([]); return; }
        setPartnerSearching(true);
        const task = setTimeout(() => {
            api.get(`/users/search?q=${encodeURIComponent(partnerQuery.trim())}&subCategory=${sub}&category=${category}`)
                .then(res => setPartnerResults(Array.isArray(res.data) ? res.data : []))
                .catch(() => setPartnerResults([]))
                .finally(() => setPartnerSearching(false));
        }, 400);
        return () => clearTimeout(task);
    }, [partnerQuery, showPartnerSearch]);

    const choosePartner = (user) => {
        set('partner', user);
        setShowPartnerSearch(false);
        setPartnerQuery('');
        setPartnerResults([]);
    };

    const searchCourts = async (text) => {
        set('courtSearchText', text);
        set('selectedCourt', null);
        if (text.length < 2) { set('courtResults', []); return; }
        setSearching(true);
        try {
            const { data } = await api.get('/courts/search', { params: { q: text, sport: sub } });
            set('courtResults', Array.isArray(data) ? data : []);
        } catch { set('courtResults', []); }
        finally { setSearching(false); }
    };

    const selectCourt = (court) => {
        setF(p => ({
            ...p,
            selectedCourt: court,
            courtSearchText: court.name,
            courtResults: [],
            showManualCourt: false,
            manualCity: court.city || '',
            surface: court.surface || p.surface,
            venueType: court.venueType || p.venueType,
        }));
    };

    const reset = () => setF(INIT);

    const submit = async () => {
        if (!isTeamSport && f.matchType === 'DOUBLE' && !f.partner) {
            Alert.alert('', t.missingPartner); return;
        }
        if (!f.flexibleSchedule) {
            if (!f.matchDate)  { Alert.alert('', t.missingDate); return; }
            if (!f.matchTime)  { Alert.alert('', t.missingTime); return; }
            if (!f.courtMutual && !f.selectedCourt && !f.manualCourtName.trim() && !f.courtSearchText.trim()) {
                Alert.alert('', t.missingCourt); return;
            }
        }

        const matchDateStr = f.matchDate
            ? `${f.matchDate.getFullYear()}-${String(f.matchDate.getMonth()+1).padStart(2,'0')}-${String(f.matchDate.getDate()).padStart(2,'0')}`
            : undefined;

        // If manual court not in DB → submit for approval first
        if (f.showManualCourt && f.manualCourtName && !f.selectedCourt) {
            if (!f.manualCity) { Alert.alert('', t.missingCity); return; }
            try {
                await api.post('/courts', {
                    name: f.manualCourtName,
                    city: f.manualCity,
                    address: f.manualAddress || undefined,
                    sport: sub,
                    surface: f.surface || undefined,
                    venueType: f.venueType || undefined,
                });
            } catch { /* court submit failed silently, continue */ }
        }

        setSubmitting(true);
        try {
            await api.post('/rivals', {
                category,
                subCategory: sub,
                matchType: isTeamSport ? 'FIND_OPPONENT' : f.matchType === 'DOUBLE' ? 'DOUBLE' : 'SINGLE',
                teamSize: f.teamSize,
                matchMode: f.matchMode,
                flexibleSchedule: f.flexibleSchedule,
                matchDate: f.flexibleSchedule ? undefined : matchDateStr,
                matchTime: f.flexibleSchedule ? undefined : f.matchTime || undefined,
                duration:  f.flexibleSchedule ? undefined : f.duration,
                courtName: f.selectedCourt?.name || (f.showManualCourt ? f.manualCourtName : undefined) || f.courtSearchText || undefined,
                courtId:   f.selectedCourt?.id || undefined,
                location:  f.selectedCourt?.city || f.manualCity || undefined,
                courtAddress: f.selectedCourt?.address || f.manualAddress || undefined,
                surface:   f.surface || undefined,
                venueType: f.venueType || undefined,
                isCourtReserved: f.courtReserved,
                courtFeePerPerson: f.courtFeePerPerson !== '' ? parseInt(f.courtFeePerPerson, 10) : undefined,
                message:   f.message || undefined,
                minRating: f.minRating !== '' ? parseFloat(f.minRating) : undefined,
                maxRating: f.maxRating !== '' ? parseFloat(f.maxRating) : undefined,
                senderTeam: !isTeamSport && f.matchType === 'DOUBLE' && f.partner
                    ? [{ id: f.partner.id, username: f.partner.username, fullName: f.partner.fullName, skillRating: f.partner.interests?.[0]?.skillRating || 0 }]
                    : undefined,
            });
            onCreated();
            onClose();
            reset();
        } catch(e) {
            if (e?.response) {
                Alert.alert(t.error, e.response.data?.message || t.sendFailed);
            } else {
                // Network drop after server processed — listing likely created
                onCreated();
                onClose();
                reset();
            }
        }
        finally { setSubmitting(false); }
    };

    const courtSurfaces = isFootball ? FOOTBALL_SURFACES : isVolleyball ? VOLLEYBALL_SURFACES : isPadel ? PADEL_SURFACES : TENNIS_SURFACES;

    return (
        <>
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.modalOverlay}>
                <KeyboardAvoidingView behavior={Platform.OS==='ios' ? 'padding':'height'} style={{ flex:1, justifyContent:'flex-end' }}>
                    <View style={s.modalBox}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t.createTitle}</Text>
                            <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* 1+2 - Mod + Format yan yana (non-team) / Mod + Takım (team) */}
                            {!isTeamSport ? (
                                <>
                                    <View style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
                                        <View style={{ flex:1 }}>
                                            <Text style={s.fieldLabel}>{t.modLabel}</Text>
                                            <View style={[s.chipRow, { marginBottom:0 }]}>
                                                {((sub === 'tennis' || sub === 'padel') ? ['PRACTICE','COMPETITIVE'] : ['PRACTICE','COMPETITIVE','BOTH']).map(mode => {
                                                    const isActive = (sub === 'tennis' || sub === 'padel')
                                                        ? (f.matchMode === mode || f.matchMode === 'BOTH')
                                                        : f.matchMode === mode;
                                                    const handleModePress = () => {
                                                        if ((sub !== 'tennis' && sub !== 'padel') || !f.flexibleSchedule) { set('matchMode', mode); return; }
                                                        if (mode === 'PRACTICE') {
                                                            if (f.matchMode === 'PRACTICE') return;
                                                            set('matchMode', f.matchMode === 'BOTH' ? 'COMPETITIVE' : 'BOTH');
                                                        } else {
                                                            if (f.matchMode === 'COMPETITIVE') return;
                                                            set('matchMode', f.matchMode === 'BOTH' ? 'PRACTICE' : 'BOTH');
                                                        }
                                                    };
                                                    return (
                                                        <TouchableOpacity key={mode} onPress={handleModePress}
                                                            style={[s.chipBtn, { paddingHorizontal:3, paddingVertical:3 }, isActive && {
                                                                backgroundColor: mode==='COMPETITIVE' ? '#dc262620' : mode==='BOTH' ? '#a855f720' : '#2563eb20',
                                                                borderColor:     mode==='COMPETITIVE' ? '#dc2626'   : mode==='BOTH' ? '#a855f7'   : '#2563eb',
                                                            }]}>
                                                            <Text style={[s.chipBtnText, isActive && { color:'#fff' }]}>
                                                                {mode==='PRACTICE' ? t.practiceMode : mode==='COMPETITIVE' ? t.competitiveMode : t.bothMode}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    );
                                                })}
                                            </View>
                                        </View>
                                        <View style={{ flex:1 }}>
                                            <Text style={s.fieldLabel}>{t.formatLabel}</Text>
                                            <View style={[s.chipRow, { marginBottom:0 }]}>
                                                {[{id:'SINGLE',label:t.singleFormat},{id:'DOUBLE',label:t.doubleFormat}].map(fmt => (
                                                    <TouchableOpacity key={fmt.id} onPress={() => setF(p => ({ ...p, matchType: fmt.id, partner: fmt.id === 'DOUBLE' ? p.partner : null }))}
                                                        style={[s.chipBtn, { paddingHorizontal:3, paddingVertical:3 }, f.matchType===fmt.id && s.chipBtnActive]}>
                                                        <Text style={[s.chipBtnText, f.matchType===fmt.id && s.chipBtnTextActive]}>{fmt.label}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    </View>
                                    {!isTeamSport && f.matchType === 'DOUBLE' && (
                                        f.partner ? (
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:8, backgroundColor: cfg.color+'15', borderRadius:10, borderWidth:1, borderColor: cfg.color+'40', paddingHorizontal:10, paddingVertical:8, marginBottom:8 }}>
                                                <Text style={{ color:'#fff', fontSize:12, fontWeight:'700', flex:1 }}>👥 {t.partnerLabel}: {f.partner.fullName || f.partner.username}</Text>
                                                <TouchableOpacity onPress={() => set('partner', null)}>
                                                    <Text style={{ color: colors.textMuted, fontSize:16 }}>✕</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <TouchableOpacity onPress={() => setShowPartnerSearch(true)}
                                                style={{ backgroundColor: cfg.color+'15', borderRadius:10, borderWidth:1, borderColor: cfg.color+'40', paddingHorizontal:10, paddingVertical:8, marginBottom:8, alignItems:'center' }}>
                                                <Text style={{ color: cfg.color, fontSize:12, fontWeight:'700' }}>👥+ {t.choosePartnerBtn}</Text>
                                            </TouchableOpacity>
                                        )
                                    )}
                                    {(sub === 'tennis' || sub === 'padel') && f.flexibleSchedule && (
                                        <Text style={s.modeHint}>{t.multiSelectHint}</Text>
                                    )}
                                    {(f.matchMode === 'COMPETITIVE' || f.matchMode === 'BOTH') && (
                                        <View style={s.eloWarning}>
                                            <Text style={s.eloWarningText}>{t.eloWarning}</Text>
                                        </View>
                                    )}
                                </>
                            ) : (
                                <>
                                    <Text style={s.fieldLabel}>{t.modLabel}</Text>
                                    <View style={s.chipRow}>
                                        {['PRACTICE','COMPETITIVE','BOTH'].map(mode => {
                                            const isActive = f.matchMode === mode;
                                            return (
                                                <TouchableOpacity key={mode} onPress={() => set('matchMode', mode)}
                                                    style={[s.chipBtn, { paddingHorizontal:3, paddingVertical:3 }, isActive && {
                                                        backgroundColor: mode==='COMPETITIVE' ? '#dc262620' : mode==='BOTH' ? '#a855f720' : '#2563eb20',
                                                        borderColor:     mode==='COMPETITIVE' ? '#dc2626'   : mode==='BOTH' ? '#a855f7'   : '#2563eb',
                                                    }]}>
                                                    <Text style={[s.chipBtnText, isActive && { color:'#fff' }]}>
                                                        {mode==='PRACTICE' ? t.practiceMode : mode==='COMPETITIVE' ? t.competitiveMode : t.bothMode}
                                                    </Text>
                                                </TouchableOpacity>
                                            );
                                        })}
                                    </View>
                                    {(f.matchMode === 'COMPETITIVE' || f.matchMode === 'BOTH') && (
                                        <View style={s.eloWarning}>
                                            <Text style={s.eloWarningText}>{t.eloWarning}</Text>
                                        </View>
                                    )}
                                    {teamSizes.length > 0 && (
                                        <>
                                            <Text style={s.fieldLabel}>{t.teamSizeLabel}</Text>
                                            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:14 }}>
                                                <View style={s.chipRow}>
                                                    {teamSizes.map(n => (
                                                        <TouchableOpacity key={n} onPress={() => set('teamSize', n)}
                                                            style={[s.chipBtn, f.teamSize===n && s.chipBtnActive]}>
                                                            <Text style={[s.chipBtnText, f.teamSize===n && s.chipBtnTextActive]}>{n}v{n}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </ScrollView>
                                        </>
                                    )}
                                </>
                            )}

                            {/* Puan Limiti + Esnek Program yan yana */}
                            <View style={{ flexDirection:'row', gap:8, marginBottom:14 }}>
                                <View style={{ flex:1 }}>
                                    <Text style={s.fieldLabel}>{t.ratingLimitLabel}</Text>
                                    <View style={{ flexDirection:'row', gap:6 }}>
                                        <TouchableOpacity style={{ flex:1, backgroundColor:colors.surface2, borderRadius:10, padding:3, borderWidth:1, borderColor: f.minRating ? colors.purple+'80' : colors.border, alignItems:'center' }} onPress={() => setRatingPickerTarget('min')}>
                                            <Text style={s.triLabel}>{t.minRatingLabel}</Text>
                                            <Text style={[s.triValue, !f.minRating && s.triPlaceholder]}>{f.minRating ? `${f.minRating} ★` : 'Serbest'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={{ flex:1, backgroundColor:colors.surface2, borderRadius:10, padding:3, borderWidth:1, borderColor: f.maxRating ? colors.purple+'80' : colors.border, alignItems:'center' }} onPress={() => setRatingPickerTarget('max')}>
                                            <Text style={s.triLabel}>{t.maxRatingLabel}</Text>
                                            <Text style={[s.triValue, !f.maxRating && s.triPlaceholder]}>{f.maxRating ? `${f.maxRating} ★` : 'Serbest'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={[s.switchRow, { flex:1, marginBottom:0, padding:3 }]}>
                                    <View style={{ flex:1 }}>
                                        <Text style={[s.fieldLabel, { marginBottom:2 }]}>{t.flexLabel}</Text>
                                        <Text style={[s.fieldHint, { marginBottom:0 }]}>{t.flexHint}</Text>
                                    </View>
                                    <Switch value={f.flexibleSchedule} onValueChange={v => setF(p => ({ ...p, flexibleSchedule: v, matchMode: !v && p.matchMode === 'BOTH' ? 'PRACTICE' : p.matchMode }))}
                                        trackColor={{ false: colors.border, true: '#eab308' }}
                                        thumbColor={f.flexibleSchedule ? '#fff' : colors.textMuted} />
                                </View>
                            </View>
                            <RatingPickerModal
                                visible={ratingPickerTarget !== null}
                                title={ratingPickerTarget === 'min' ? '⭐ Alt Puan Limiti' : '⭐ Üst Puan Limiti'}
                                value={ratingPickerTarget === 'min' ? f.minRating : f.maxRating}
                                onSelect={(v) => { set(ratingPickerTarget === 'min' ? 'minRating' : 'maxRating', v); setRatingPickerTarget(null); }}
                                onClose={() => setRatingPickerTarget(null)}
                            />

                            {/* 4 - Geri kalanlar sadece esnek program KAPALI ise */}
                            {!f.flexibleSchedule && (
                                <>
                                    {/* Tarih / Saat / Süre — yan yana */}
                                    <Text style={s.fieldLabel}>{t.dateTimeLabel}</Text>
                                    <View style={s.triRow}>
                                        <TouchableOpacity style={[s.triBtn, f.matchDate && s.triBtnFilled]} onPress={() => set('showDatePicker', true)}>
                                            <Text style={s.triLabel}>{t.dateLabel}</Text>
                                            <Text style={[s.triValue, !f.matchDate && s.triPlaceholder]} numberOfLines={1}>
                                                {f.matchDate ? `${String(f.matchDate.getDate()).padStart(2,'0')}/${String(f.matchDate.getMonth()+1).padStart(2,'0')}/${f.matchDate.getFullYear()}` : '—'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[s.triBtn, f.matchTime && s.triBtnFilled]} onPress={() => set('showTimePicker', true)}>
                                            <Text style={s.triLabel}>{t.timeLabel}</Text>
                                            <Text style={[s.triValue, !f.matchTime && s.triPlaceholder]}>{f.matchTime || '—'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={[s.triBtn, f.duration && s.triBtnFilled]} onPress={() => set('showDurationPicker', true)}>
                                            <Text style={s.triLabel}>{t.durationFieldLabel}</Text>
                                            <Text style={[s.triValue, !f.duration && s.triPlaceholder]}>{f.duration ? `${f.duration}${t.minuteSuffix}` : '—'}</Text>
                                        </TouchableOpacity>
                                    </View>

                                    {/* Picker modalleri */}
                                    <CustomCalendarPicker
                                        visible={f.showDatePicker}
                                        value={f.matchDate}
                                        onSelect={(date) => setF(p => ({ ...p, matchDate: date, showDatePicker: false }))}
                                        onClose={() => set('showDatePicker', false)}
                                    />
                                    <TimeGridModal
                                        visible={f.showTimePicker}
                                        title={t.selectTime}
                                        value={f.matchTime}
                                        onSelect={(v) => set('matchTime', v)}
                                        onClose={() => set('showTimePicker', false)}
                                    />
                                    <OptionPickerModal
                                        visible={f.showDurationPicker}
                                        title={t.selectDuration}
                                        options={DURATIONS_FULL_VALUES.map(v => ({ value: v, label: `${v} ${t.minuteSuffix}` }))}
                                        value={f.duration}
                                        onSelect={(v) => set('duration', v)}
                                        onClose={() => set('showDurationPicker', false)}
                                    />

                                    {/* Kort Ara */}
                                    <Text style={s.fieldLabel}>{t.courtLabel}{!f.flexibleSchedule && !f.courtMutual ? ' *' : ''}</Text>
                                    {!f.courtMutual && <View style={{ flexDirection:'row', gap:8, marginBottom:6 }}>
                                        <TextInput
                                            style={[s.fieldInput, { flex:1, marginBottom:0 }]}
                                            value={f.courtSearchText}
                                            onChangeText={searchCourts}
                                            placeholder={t.courtSearchPlaceholder}
                                            placeholderTextColor={colors.textMuted}
                                        />
                                        {searching && <ActivityIndicator color={cfg.color} style={{ alignSelf:'center' }} />}
                                    </View>}

                                    {!f.courtMutual && <>
                                    {/* DB Sonuçları */}
                                    {f.courtResults.length > 0 && !f.selectedCourt && (
                                        <View style={s.courtResultsBox}>
                                            {f.courtResults.map(c => (
                                                <TouchableOpacity key={c.id} style={s.courtResultRow} onPress={() => selectCourt(c)}>
                                                    <View style={{ flex:1 }}>
                                                        <Text style={s.courtResultName}>{c.name}</Text>
                                                        {c.city && <Text style={s.courtResultCity}>{c.city}</Text>}
                                                    </View>
                                                    {c.verified && <Text style={{ color:'#4ade80', fontSize:11 }}>{t.courtVerified}</Text>}
                                                </TouchableOpacity>
                                            ))}
                                            {/* Yazdığı adı doğrudan kullanma seçeneği */}
                                            <TouchableOpacity
                                                style={[s.courtResultRow, { borderBottomWidth:0, backgroundColor:'#a855f710' }]}
                                                onPress={() => setF(p => ({ ...p, courtResults:[], showManualCourt:true, manualCourtName: p.courtSearchText }))}
                                            >
                                                <Text style={{ color:'#c084fc', fontSize:13, fontWeight:'700', flex:1 }}>
                                                    {t.useThisName(f.courtSearchText)}
                                                </Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {/* Seçilen kort */}
                                    {f.selectedCourt && (
                                        <View style={s.selectedCourtBox}>
                                            <Text style={s.selectedCourtText}>✅ {f.selectedCourt.name}</Text>
                                            <TouchableOpacity onPress={() => setF(p => ({ ...p, selectedCourt:null, courtSearchText:'', courtResults:[] }))}>
                                                <Text style={{ color: colors.textMuted, fontSize:12 }}>✕</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}

                                    {/* Kort bulunamadı → Manuel giriş */}
                                    {!f.selectedCourt && f.courtSearchText.length >= 2 && f.courtResults.length === 0 && !searching && (
                                        <TouchableOpacity style={s.addCourtBtn} onPress={() => set('showManualCourt', !f.showManualCourt)}>
                                            <Text style={s.addCourtBtnText}>
                                                {f.showManualCourt ? t.closeCourt : t.addCityAddress(f.courtSearchText)}
                                            </Text>
                                        </TouchableOpacity>
                                    )}

                                    </>}

                                    {/* Ortaklaşa kararlaştırılır seçeneği */}
                                    <TouchableOpacity
                                        onPress={() => set('courtMutual', !f.courtMutual)}
                                        style={{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:10, paddingVertical:8, paddingHorizontal:10, borderRadius:10, backgroundColor: f.courtMutual ? cfg.color+'18' : '#ffffff08', borderWidth:1, borderColor: f.courtMutual ? cfg.color+'60' : '#ffffff15' }}
                                    >
                                        <View style={{ width:18, height:18, borderRadius:9, borderWidth:2, borderColor: f.courtMutual ? cfg.color : '#6b7280', alignItems:'center', justifyContent:'center' }}>
                                            {f.courtMutual && <View style={{ width:8, height:8, borderRadius:4, backgroundColor: cfg.color }} />}
                                        </View>
                                        <Text style={{ color: f.courtMutual ? cfg.color : colors.textMuted, fontSize:13, fontWeight:'700', flex:1 }}>
                                            🤝 {t.courtMutualBtn}
                                        </Text>
                                    </TouchableOpacity>

                                    {/* Manuel kort girişi */}
                                    {!f.courtMutual && !f.selectedCourt && f.showManualCourt && (
                                        <View style={s.manualCourtBox}>
                                            <Text style={s.manualCourtNote}>{t.courtSubmitNote}</Text>
                                            <TextInput style={s.fieldInput} value={f.manualCourtName}
                                                onChangeText={v => set('manualCourtName', v)}
                                                placeholder={t.manualCourtLabel} placeholderTextColor={colors.textMuted} />
                                            <TextInput style={s.fieldInput} value={f.manualCity}
                                                onChangeText={v => set('manualCity', v)}
                                                placeholder={t.manualCityLabel} placeholderTextColor={colors.textMuted} />
                                            <TextInput style={s.fieldInput} value={f.manualAddress}
                                                onChangeText={v => set('manualAddress', v)}
                                                placeholder={t.manualAddressLabel} placeholderTextColor={colors.textMuted} />
                                        </View>
                                    )}

                                    {/* Kişi Başı Kort Ücreti */}
                                    {!f.courtMutual && (f.selectedCourt || f.courtSearchText.length >= 2 || (f.showManualCourt && f.manualCourtName)) && (
                                        <View style={{ marginBottom:10 }}>
                                            <Text style={s.fieldLabel}>{t.courtFeeLabel}</Text>
                                            <TextInput
                                                style={s.fieldInput}
                                                value={f.courtFeePerPerson}
                                                onChangeText={v => set('courtFeePerPerson', v.replace(/[^0-9]/g, ''))}
                                                placeholder={t.courtFeePh}
                                                placeholderTextColor={colors.textMuted}
                                                keyboardType="numeric"
                                            />
                                        </View>
                                    )}

                                    {/* Kort Zemini */}
                                    <Text style={[s.fieldLabel, { marginTop:4 }]}>{t.surfaceLabel}</Text>
                                    <View style={s.chipRow}>
                                        {courtSurfaces.map(sf => (
                                            <TouchableOpacity key={sf.id} onPress={() => set('surface', sf.id)}
                                                style={[s.chipBtn, f.surface===sf.id && s.chipBtnActive]}>
                                                <Text style={[s.chipBtnText, f.surface===sf.id && s.chipBtnTextActive]}>{sf.emoji} {sf.label || getSurface(t, sf.id)}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>

                                    {/* Mekan Tipi */}
                                    <View style={{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:14 }}>
                                        <View>
                                            <Text style={[s.fieldLabel, { marginTop:-6 }]}>{t.venueLabel}</Text>
                                            <View style={[s.chipRow, { marginBottom:0 }]}>
                                                {[{id:'OUTDOOR',label:t.outdoor},{id:'INDOOR',label:t.indoor}].map(vt => (
                                                    <TouchableOpacity key={vt.id} onPress={() => set('venueType', vt.id)}
                                                        style={[s.chipBtn, f.venueType===vt.id && s.chipBtnActive]}>
                                                        <Text style={[s.chipBtnText, f.venueType===vt.id && s.chipBtnTextActive]}>{vt.label}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                        <TouchableOpacity style={[s.checkRow, { marginBottom:0, flex:1 }]} onPress={() => set('courtReserved', !f.courtReserved)}>
                                            <View style={[s.checkbox, f.courtReserved && s.checkboxChecked]}>
                                                {f.courtReserved && <Text style={{ color:'#fff', fontSize:12 }}>✓</Text>}
                                            </View>
                                            <Text style={s.checkLabel}>{t.courtReservedLabel}</Text>
                                        </TouchableOpacity>
                                    </View>

                                </>
                            )}

                            {/* Açıklama */}
                            <Text style={[s.fieldLabel, { marginTop:4 }]}>{t.messageFieldLabel}</Text>
                            <TextInput style={[s.fieldInput, { height:80, textAlignVertical:'top' }]}
                                value={f.message} onChangeText={v => set('message', v)}
                                placeholder={t.messagePh}
                                placeholderTextColor={colors.textMuted} multiline />

                            <TouchableOpacity style={[s.submitBtn, { backgroundColor: cfg.color }, submitting && { opacity:0.6 }]}
                                onPress={submit} disabled={submitting}>
                                <Text style={s.submitBtnText}>{submitting ? t.submittingBtn : t.createListingBtn}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>

        {/* Çift maç partneri — arama modali */}
        <Modal visible={showPartnerSearch} animationType="slide" transparent onRequestClose={() => setShowPartnerSearch(false)}>
            <View style={{ flex:1, backgroundColor:'#00000080', justifyContent:'flex-end' }}>
                <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:20, paddingTop:20, paddingBottom:40, maxHeight:'80%' }}>
                    <View style={{ flexDirection:'row', alignItems:'center', marginBottom:14 }}>
                        <Text style={{ color:'#fff', fontSize:16, fontWeight:'800', flex:1 }}>{t.choosePartnerBtn}</Text>
                        <TouchableOpacity onPress={() => { setShowPartnerSearch(false); setPartnerQuery(''); setPartnerResults([]); }}>
                            <Text style={{ color: colors.textMuted, fontSize:20 }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={s.fieldInput}
                        value={partnerQuery}
                        onChangeText={setPartnerQuery}
                        placeholder={t.inviteSearchPh}
                        placeholderTextColor={colors.textMuted}
                        autoFocus
                    />
                    {partnerSearching && <ActivityIndicator color={cfg.color} style={{ marginTop:12 }} />}
                    <ScrollView style={{ marginTop:8 }} keyboardShouldPersistTaps="handled">
                        {partnerResults.map(u => (
                            <TouchableOpacity key={u.id} onPress={() => choosePartner(u)} style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}>
                                <Avatar name={u.username} avatar={u.avatar} size={36} color={cfg.color} />
                                <View style={{ flex:1 }}>
                                    <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>{u.interests?.[0]?.alias || u.fullName || u.username}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                        @{u.username}{u.interests?.[0]?.skillRating != null ? `  ${Number(u.interests[0].skillRating).toFixed(2)} ★` : ''}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                        {!partnerSearching && partnerQuery.trim().length >= 2 && partnerResults.length === 0 && (
                            <Text style={{ color: colors.textMuted, textAlign:'center', marginTop:16, fontSize:13 }}>{t.inviteNoResults}</Text>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
        </>
    );
}

// ─── Player Wanted Modal ───────────────────────────────────────────────────────

function CreatePlayerWantedModal({ visible, onClose, category, sub, onCreated }) {
    const t = useT();
    const sizes = sub==='football' ? FOOTBALL_SIZES : sub==='volleyball' ? VOLLEYBALL_SIZES : [];
    const [f, setF] = useState({ message:'', matchDate:'', matchTime:'', teamSize:5, position:'ANY', location:'' });
    const [submitting, setSubmitting] = useState(false);
    const set = (key,val) => setF(p => ({...p,[key]:val}));

    const submit = async () => {
        setSubmitting(true);
        try {
            await api.post('/rivals', {
                category, subCategory:sub, matchType:'PLAYER_WANTED',
                teamSize: f.teamSize,
                message: f.message,
                matchDate: f.matchDate || undefined,
                matchTime: f.matchTime || undefined,
                location: f.location || undefined,
                positions: f.position==='ANY' ? [] : [f.position],
            });
            onCreated(); onClose();
        } catch(e) { Alert.alert(t.error, e?.response?.data?.message || t.sendFailed); }
        finally { setSubmitting(false); }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.modalOverlay}>
                <KeyboardAvoidingView behavior={Platform.OS==='ios' ? 'padding':'height'} style={{ flex:1, justifyContent:'flex-end' }}>
                    <View style={s.modalBox}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t.createPlayerWantedTitle}</Text>
                            <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false}>
                            {sub==='football' && (
                                <>
                                    <Text style={s.fieldLabel}>{t.positionLabel}</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:14 }}>
                                        <View style={s.chipRow}>
                                            {[
                                                {id:'ANY',label:t.posAllrounder},
                                                {id:'GOALKEEPER',label:t.posGoalkeeper},
                                                {id:'DEFENDER',label:t.posDefender},
                                                {id:'MIDFIELDER',label:t.posMidfielder},
                                                {id:'FORWARD',label:t.posForward},
                                            ].map(p => (
                                                <TouchableOpacity key={p.id} onPress={() => set('position',p.id)}
                                                    style={[s.chipBtn, f.position===p.id && s.chipBtnActive]}>
                                                    <Text style={[s.chipBtnText, f.position===p.id && s.chipBtnTextActive]}>{p.label}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </ScrollView>
                                </>
                            )}
                            {sizes.length > 0 && (
                                <>
                                    <Text style={s.fieldLabel}>{t.teamSizeLabel}</Text>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:14 }}>
                                        <View style={s.chipRow}>
                                            {sizes.map(n => (
                                                <TouchableOpacity key={n} onPress={() => set('teamSize',n)}
                                                    style={[s.chipBtn, f.teamSize===n && s.chipBtnActive]}>
                                                    <Text style={[s.chipBtnText, f.teamSize===n && s.chipBtnTextActive]}>{n}v{n}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </ScrollView>
                                </>
                            )}
                            <Text style={s.fieldLabel}>{t.dateFieldLabel}</Text>
                            <TextInput style={s.fieldInput} value={f.matchDate} onChangeText={v=>set('matchDate',v)}
                                placeholder="2026-06-20" placeholderTextColor={colors.textMuted} />
                            <Text style={s.fieldLabel}>{t.locationLabel}</Text>
                            <TextInput style={s.fieldInput} value={f.location} onChangeText={v=>set('location',v)}
                                placeholder="İstanbul / Kadıköy" placeholderTextColor={colors.textMuted} />
                            <Text style={s.fieldLabel}>{t.messageFieldLabel}</Text>
                            <TextInput style={[s.fieldInput,{height:80,textAlignVertical:'top'}]}
                                value={f.message} onChangeText={v=>set('message',v)}
                                placeholder={t.playerWantedMsgPh}
                                placeholderTextColor={colors.textMuted} multiline />
                            <TouchableOpacity style={[s.submitBtn, submitting&&{opacity:0.6}]} onPress={submit} disabled={submitting}>
                                <Text style={s.submitBtnText}>{submitting ? t.submittingBtn : t.publishAdBtn}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>
    );
}

// ─── Tournament Card ──────────────────────────────────────────────────────────

const TOURN_TYPE_LABELS = (t) => ({ '1': t.tournType1, '2': t.tournType2, '3': t.tournType3 });
const SCOPE_EMOJI  = { YEREL: '📍', ULUSAL: '🇹🇷', ULUSLARARASI: '🌍' };
const getSurface = (t, id) => t['surface' + (id?.toUpperCase())] || id || '';
const GENDER_EMOJI = { KADIN: '👩', ERKEK: '👨', MIX: '🤝' };

function TournamentCard({ item, myId, myIsAdmin, t, cfg, onJoin, onCancelJoin, onDelete, onUpdated, openChatTournamentId, onChatOpened }) {
    const myPart = item.participants?.[0];
    const [myStatus, setMyStatus] = useState(myPart?.status ?? null);
    useEffect(() => { setMyStatus(myPart?.status ?? null); }, [myPart?.status]);
    const isCreator = item.creatorId === myId;
    const [collapsed, setCollapsed] = useState(item.status === 'IN_PROGRESS');
    // Çiftler Rekabetçi (type '2'): partner seçerek başvuru
    const [showPartnerSearch, setShowPartnerSearch] = useState(false);
    const [partnerQuery, setPartnerQuery] = useState('');
    const [partnerResults, setPartnerResults] = useState([]);
    const [partnerSearching, setPartnerSearching] = useState(false);

    const handleJoinPress = () => {
        if (item.type !== '2') { onJoin(item); return; }
        Alert.alert(
            t.tournPartnerTitle || 'Çiftler Rekabetçi',
            t.tournPartnerMsg || 'Bireysel mi başvuracaksın yoksa bir partner mi seçeceksin?',
            [
                { text: t.tournPartnerSolo || 'Bireysel Başvur', onPress: () => onJoin(item) },
                { text: t.tournPartnerChoose || 'Partner Seç', onPress: () => setShowPartnerSearch(true) },
                { text: t.cancelBtn || 'Vazgeç', style: 'cancel' },
            ],
        );
    };

    useEffect(() => {
        if (!showPartnerSearch) return;
        if (!partnerQuery.trim() || partnerQuery.trim().length < 2) { setPartnerResults([]); return; }
        setPartnerSearching(true);
        const task = setTimeout(() => {
            api.get(`/users/search?q=${encodeURIComponent(partnerQuery.trim())}&subCategory=${item.subCategory}&category=${item.category}`)
                .then(res => setPartnerResults(Array.isArray(res.data) ? res.data : []))
                .catch(() => setPartnerResults([]))
                .finally(() => setPartnerSearching(false));
        }, 400);
        return () => clearTimeout(task);
    }, [partnerQuery, showPartnerSearch]);

    const choosePartner = (user) => {
        setShowPartnerSearch(false);
        setPartnerQuery('');
        setPartnerResults([]);
        onJoin(item, user.id);
    };
    const typeLabels = TOURN_TYPE_LABELS(t);
    const [showRules, setShowRules] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [editName, setEditName] = useState(item.name || '');
    const [editDescription, setEditDescription] = useState(item.description || '');
    const [editContactPhone, setEditContactPhone] = useState(item.contactPhone || '');
    const [editScope, setEditScope] = useState(item.scope || 'YEREL');
    const [editGenderType, setEditGenderType] = useState(item.genderType || 'MIX');
    const [editMin, setEditMin] = useState(String(item.minPlayers || 2));
    const [editMax, setEditMax] = useState(String(item.maxPlayers || 32));
    const [editMinRating, setEditMinRating] = useState(item.minRating !== null && item.minRating !== undefined ? String(item.minRating) : '');
    const [editMaxRating, setEditMaxRating] = useState(item.maxRating !== null && item.maxRating !== undefined ? String(item.maxRating) : '');
    const [editMatches, setEditMatches] = useState(String(item.matchesBeforePlayoff || ''));
    const [editQualifiers, setEditQualifiers] = useState(String(item.playoffQualifiers || ''));
    const [editSetsPerMatch, setEditSetsPerMatch] = useState(String(item.setsPerMatch || 3));
    const [editAdvantageScoring, setEditAdvantageScoring] = useState(item.advantageScoring !== undefined ? item.advantageScoring : null);
    const [editLocation, setEditLocation] = useState(item.location || '');
    const [editSurface, setEditSurface] = useState(item.surface || '');
    const [editIsIndoor, setEditIsIndoor] = useState(!!item.isIndoor);
    const [editIsPaid, setEditIsPaid] = useState(!!item.isPaid);
    const [editFeeType, setEditFeeType] = useState(item.feeType || 'INCLUDED');
    const [editPlayerFee, setEditPlayerFee] = useState(String(item.playerFee || ''));
    const [editPaymentMethod, setEditPaymentMethod] = useState(item.paymentMethod || '');
    const [editIbanNumber, setEditIbanNumber] = useState(item.ibanNumber || '');
    const [editIbanHolder, setEditIbanHolder] = useState(item.ibanHolder || '');
    const [editPrize1, setEditPrize1] = useState(item.prize1 || '');
    const [editPrize2, setEditPrize2] = useState(item.prize2 || '');
    const [editPrize3, setEditPrize3] = useState(item.prize3 || '');
    const [editEventDate, setEditEventDate] = useState(item.eventDate ? new Date(item.eventDate) : null);
    const [editEventTime, setEditEventTime] = useState(item.eventTime || '');
    const [editEventEndDate, setEditEventEndDate] = useState(item.eventEndDate ? new Date(item.eventEndDate) : null);
    const [editEventEndTime, setEditEventEndTime] = useState(item.eventEndTime || '');
    const [editRegEndDate, setEditRegEndDate] = useState(item.endDate ? new Date(item.endDate) : null);
    const [editRegEndTime, setEditRegEndTime] = useState(item.endTime || '');
    const [editDp, setEditDp] = useState(null);
    const [editTf, setEditTf] = useState(null);
    const [editRf, setEditRf] = useState(null); // 'min' | 'max'
    const [saving, setSaving] = useState(false);
    const fmtD = (d) => d ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}` : undefined;

    // Late-cancel reason modal (24h rule)
    const [showCancelModal, setShowCancelModal] = useState(false);
    const [cancelReasonText, setCancelReasonText] = useState('');

    // Reject reason modal
    const [rejectTarget, setRejectTarget] = useState(null); // { userId, name }
    const [rejectReason, setRejectReason] = useState('');

    // Requests / participants modal (shared for creator and non-creator)
    const [showListModal, setShowListModal] = useState(false);
    const [requests, setRequests] = useState([]);
    const [loadingRequests, setLoadingRequests] = useState(false);

    // Participants data (non-creator view)
    const [participants, setParticipants] = useState([]);
    const [loadingParticipants, setLoadingParticipants] = useState(false);

    // Çiftler Rekabetçi: katılımcılar penceresi içinden partner davet/kabul/bireysele dön
    const [partnerActionLoading, setPartnerActionLoading] = useState(false);
    const [showInvitePicker, setShowInvitePicker] = useState(false);
    const [inviteCandidates, setInviteCandidates] = useState([]);

    // Use accepted count from local requests list if loaded; otherwise fall back to server _count
    const participantCount = requests.length > 0
        ? requests.filter(r => r.status === 'ACCEPTED').length
        : participants.length > 0
            ? participants.length
            : item._count?.participants || 0;

    // Demo auto-join
    const [demoRunning, setDemoRunning] = useState(false);
    const [demoIdx, setDemoIdx] = useState(0);
    const demoStop = useRef(false);
    const [tournMatches, setTournMatches] = useState([]);
    const [myTeamId, setMyTeamId] = useState(null); // Çiftler Rekabetçi: maçlarda p1Id/p2Id benim değil takımımın id'si
    const [tournTeams, setTournTeams] = useState([]); // Çiftler Rekabetçi: takım id -> avgRating (skorlanmamış maçlarda da puan göstermek için)
    const [tournPlayerRatings, setTournPlayerRatings] = useState({}); // userId -> güncel bireysel skillRating (backend'den canlı)
    const [matchesError, setMatchesError] = useState(false); // /matches isteği başarısız oldu — "maç yok" ile karıştırılmasın
    const mySideId = item.type === '2' ? myTeamId : myId;
    const [loadingMatches, setLoadingMatches] = useState(false);
    const [showMatchesModal, setShowMatchesModal] = useState(false);
    const [matchTab, setMatchTab] = useState('matches');
    const [selectedRoundKey, setSelectedRoundKey] = useState(null); // "GROUP|1" gibi — Maçlar sekmesinde hangi tur açık
    const [starting, setStarting] = useState(false);
    const [scoreEntry, setScoreEntry] = useState(null);
    const [scoreSets, setScoreSets] = useState([]);
    const [submittingScore, setSubmittingScore] = useState(false);

    // Turnuva grup sohbeti — sahip + AS/yedek onaylanmış katılımcılar
    const [showChatModal, setShowChatModal] = useState(false);
    const [chatMessages, setChatMessages] = useState([]);
    const [loadingChat, setLoadingChat] = useState(false);
    const [chatInput, setChatInput] = useState('');
    const [sendingChat, setSendingChat] = useState(false);

    const fetchChat = useCallback(async () => {
        setLoadingChat(true);
        try {
            const { data } = await api.get(`/tournaments/${item.id}/chat`);
            setChatMessages(Array.isArray(data) ? data : []);
        } catch { /* silent */ }
        finally { setLoadingChat(false); }
    }, [item.id]);

    const sendChatMessage = async () => {
        const content = chatInput.trim();
        if (!content) return;
        setSendingChat(true);
        try {
            const { data } = await api.post(`/tournaments/${item.id}/chat`, { content });
            setChatMessages(prev => [...prev, data]);
            setChatInput('');
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setSendingChat(false); }
    };

    const [chatNotifyEnabled, setChatNotifyEnabled] = useState(false);
    const [togglingChatNotify, setTogglingChatNotify] = useState(false);

    const fetchChatNotifyPref = useCallback(async () => {
        try {
            const { data } = await api.get(`/tournaments/${item.id}/chat/notify`);
            setChatNotifyEnabled(!!data.enabled);
        } catch { /* silent */ }
    }, [item.id]);

    const toggleChatNotify = async () => {
        const next = !chatNotifyEnabled;
        setTogglingChatNotify(true);
        try {
            await api.patch(`/tournaments/${item.id}/chat/notify`, { enabled: next });
            setChatNotifyEnabled(next);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setTogglingChatNotify(false); }
    };

    // Mesaj bildirimine tıklanınca bu turnuvanın sohbeti otomatik açılsın
    useEffect(() => {
        if (openChatTournamentId && openChatTournamentId === item.id) {
            fetchChat();
            fetchChatNotifyPref();
            setShowChatModal(true);
            onChatOpened?.();
        }
    }, [openChatTournamentId, item.id]);

    useEffect(() => {
        const off = onSocket('tournament:chat_message', ({ tournamentId, message }) => {
            if (tournamentId !== item.id) return;
            setChatMessages(prev => prev.some(m => m.id === message.id) ? prev : [...prev, message]);
        });
        return off;
    }, [item.id]);

    const fetchRequests = useCallback(async () => {
        setLoadingRequests(true);
        try {
            const { data } = await api.get(`/tournaments/${item.id}/requests`);
            setRequests(Array.isArray(data) ? data : []);
        } catch { /* silent */ }
        finally { setLoadingRequests(false); }
    }, [item.id]);

    const fetchParticipants = useCallback(async () => {
        setLoadingParticipants(true);
        try {
            const { data } = await api.get(`/tournaments/${item.id}/participants`);
            setParticipants(Array.isArray(data) ? data : []);
        } catch { /* silent */ }
        finally { setLoadingParticipants(false); }
    }, [item.id]);

    // Auto-load requests for creator so participantCount is always accurate
    useEffect(() => { if (isCreator) fetchRequests(); }, [isCreator, fetchRequests]);

    // Real-time: when another user is accepted, update the modal instantly
    useEffect(() => {
        const off = onSocket('tournament:participant_accepted', ({ tournamentId, participant }) => {
            if (tournamentId !== item.id) return;
            if (isCreator) {
                setRequests(prev =>
                    prev.some(r => r.userId === participant.userId)
                        ? prev.map(r => r.userId === participant.userId ? { ...r, ...participant } : r)
                        : [...prev, participant]
                );
            } else {
                setParticipants(prev =>
                    prev.some(p => p.userId === participant.userId)
                        ? prev
                        : [...prev, participant]
                );
                setRequests(prev =>
                    prev.some(r => r.userId === participant.userId)
                        ? prev.map(r => r.userId === participant.userId ? { ...r, ...participant } : r)
                        : [...prev, participant]
                );
                if (participant.userId === myId) setMyStatus('ACCEPTED');
            }
        });
        return off;
    }, [item.id, isCreator, myId]);

    // Real-time: when a participant requests cancel, show it instantly in creator's modal
    useEffect(() => {
        if (!isCreator) return;
        const off = onSocket('tournament:cancel_requested', ({ tournamentId, userId }) => {
            if (tournamentId !== item.id) return;
            setRequests(prev => prev.map(r => r.userId === userId ? { ...r, cancelRequested: true } : r));
        });
        return off;
    }, [item.id, isCreator]);

    // Real-time: a participant sent a join request → add to creator's list instantly
    useEffect(() => {
        if (!isCreator) return;
        const off = onSocket('tournament:join_requested', ({ tournamentId, participant }) => {
            if (tournamentId !== item.id) return;
            setRequests(prev => prev.some(r => r.userId === participant.userId) ? prev : [...prev, participant]);
        });
        return off;
    }, [item.id, isCreator]);

    // Real-time: a participant cancelled their join request → remove from creator's list
    useEffect(() => {
        if (!isCreator) return;
        const off = onSocket('tournament:join_cancelled', ({ tournamentId, userId }) => {
            if (tournamentId !== item.id) return;
            setRequests(prev => prev.filter(r => r.userId !== userId));
        });
        return off;
    }, [item.id, isCreator]);

    // Real-time: tournament started by creator → refresh card so Maçlar butonu görünsün
    useEffect(() => {
        const off = onSocket('tournament:started', ({ tournamentId }) => {
            if (tournamentId !== item.id) return;
            onUpdated?.();
        });
        return off;
    }, [item.id]);

    // Real-time: a match score was entered → update matches instantly
    useEffect(() => {
        const off = onSocket('tournament:match_scored', ({ tournamentId, matches }) => {
            if (tournamentId !== item.id) return;
            setTournMatches(Array.isArray(matches) ? matches : []);
        });
        return off;
    }, [item.id]);

    const updateRequest = async (userId, status, reason) => {
        try {
            await api.patch(`/tournaments/${item.id}/requests/${userId}`, { status, reason });
            setRequests(prev => prev.map(r => r.userId === userId ? { ...r, status } : r));
        } catch (e) {
            if (!e?.response) {
                // Ağ kopması — sunucu işlemi yapmış olabilir; gerçek durumu almak için yenile
                fetchRequests();
                return;
            }
            Alert.alert('', e.response.data?.message || t.actionFailed);
        }
    };

    const approveCancelRequest = async (userId, approve) => {
        try {
            await api.post(`/tournaments/${item.id}/participants/${userId}/cancel-approve`, { approve });
            if (approve) {
                setRequests(prev => prev.filter(r => r.userId !== userId));
            } else {
                setRequests(prev => prev.map(r => r.userId === userId ? { ...r, cancelRequested: false } : r));
            }
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        }
    };

    const removeParticipant = async (userId) => {
        Alert.alert('Oyuncuyu Çıkar', 'Bu oyuncuyu turnuvadan çıkarmak istediğinizden emin misiniz?', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Çıkar', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/tournaments/${item.id}/participants/${userId}`);
                    setRequests(prev => prev.filter(r => r.userId !== userId));
                } catch (e) {
                    Alert.alert('', e?.response?.data?.message || t.actionFailed);
                }
            }},
        ]);
    };

    // Çiftler Rekabetçi: partner davet et / daveti kabul et / bireysele dön — hepsi aynı endpoint
    const setMyTournamentPartner = async (partnerId) => {
        setPartnerActionLoading(true);
        try {
            await api.patch(`/tournaments/${item.id}/partner`, { partnerId: partnerId || null });
            if (isCreator || item.type === '2') await fetchRequests();
            if (!isCreator) await fetchParticipants();
            setShowInvitePicker(false);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally {
            setPartnerActionLoading(false);
        }
    };

    // Real-time: partner daveti gönderildi/eşleşti → listeyi tazele
    useEffect(() => {
        const off = onSocket('tournament:partner_request', ({ tournamentId }) => {
            if (tournamentId !== item.id) return;
            if (isCreator || item.type === '2') fetchRequests();
            if (!isCreator) fetchParticipants();
        });
        return off;
    }, [item.id, isCreator, fetchRequests, fetchParticipants]);

    // Çiftler Rekabetçi: kabul edilmiş bir satırı (eşleşmiş çift ya da bireysel) ikili kart
    // olarak render eder. p2 null ise p1 bireyseldir — slot 2'de davet/kabul/bekleme durumu gösterilir.
    const renderDuoCard = (p1, p2, solos, byUserId, isCreatorView, label) => {
        const regEnded = isRegEnded();
        const nameOf = (p) => p?.manualName || p?.user?.fullName || p?.user?.username || '';
        const ratingOf = (p) => p?.user?.interests?.[0]?.skillRating;
        const PlayerHalf = ({ p }) => (
            <View>
                <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }} numberOfLines={1}>{nameOf(p)}</Text>
                {p?.manualName
                    ? <Text style={{ color:'#3b82f6', fontSize:9, fontWeight:'700' }}>✏️ Manuel</Text>
                    : <Text style={{ color: colors.textMuted, fontSize:9 }} numberOfLines={1}>@{p?.user?.username}{ratingOf(p) != null ? `  ${starEmoji(Number(ratingOf(p)))} ${Number(ratingOf(p)).toFixed(2)}` : ''}</Text>
                }
                {isCreatorView && (
                    <TouchableOpacity onPress={() => p?.manualName ? removeManualParticipant(p.id) : removeParticipant(p.userId)} style={{ marginTop:2 }}>
                        <Text style={{ color:'#f87171', fontSize:9, fontWeight:'700' }}>Çıkar</Text>
                    </TouchableOpacity>
                )}
            </View>
        );

        let slot2;
        if (p2) {
            slot2 = <PlayerHalf p={p2} />;
        } else {
            const isMine = p1.userId === myId;
            const invitedBy = solos.find(o => o.partnerId === p1.userId && o.userId !== p1.userId);
            if (p1.partnerId) {
                const target = byUserId.get(p1.partnerId);
                slot2 = (
                    <View>
                        <Text style={{ color:'#fbbf24', fontSize:9, fontWeight:'700' }} numberOfLines={1}>⏳ {nameOf(target) || '...'} (Bekliyor)</Text>
                        {isMine && !regEnded && (
                            <TouchableOpacity onPress={() => setMyTournamentPartner(null)} disabled={partnerActionLoading} style={{ marginTop:2 }}>
                                <Text style={{ color:'#f87171', fontSize:9, fontWeight:'700' }}>✕ Geri Çek</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                );
            } else if (invitedBy) {
                slot2 = (
                    <View>
                        <Text style={{ color:'#4ade80', fontSize:9, fontWeight:'700' }} numberOfLines={1}>{nameOf(invitedBy)} davet etti</Text>
                        {isMine && !regEnded && (
                            <TouchableOpacity onPress={() => setMyTournamentPartner(invitedBy.userId)} disabled={partnerActionLoading} style={{ marginTop:2, backgroundColor:'#16a34a30', borderRadius:5, paddingHorizontal:6, paddingVertical:2, alignSelf:'flex-start', borderWidth:1, borderColor:'#16a34a50' }}>
                                <Text style={{ color:'#4ade80', fontSize:9, fontWeight:'700' }}>✓ Kabul Et</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                );
            } else {
                slot2 = (
                    <View>
                        <Text style={{ color: colors.textMuted, fontSize:9 }} numberOfLines={1}>Partner aranıyor</Text>
                        {isMine && !regEnded && (
                            <TouchableOpacity
                                onPress={() => { setInviteCandidates(solos.filter(s => s.userId !== myId)); setShowInvitePicker(true); }}
                                style={{ marginTop:2, backgroundColor: cfg.color+'20', borderRadius:5, paddingHorizontal:6, paddingVertical:2, alignSelf:'flex-start', borderWidth:1, borderColor: cfg.color+'40' }}>
                                <Text style={{ color: cfg.color, fontSize:9, fontWeight:'700' }}>+ Davet Et</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                );
            }
        }

        const isMineCard = p1.userId === myId || p2?.userId === myId;
        return (
            <View key={p1.userId} style={{ width:'48%', backgroundColor: isMineCard ? cfg.color+'10' : '#0f172a', borderRadius:8, borderWidth:1, borderColor: isMineCard ? cfg.color+'40' : colors.border+'40', paddingVertical:6, paddingHorizontal:8, marginBottom:6 }}>
                {label && (
                    <View style={{ backgroundColor: label.bg, borderRadius:4, paddingHorizontal:5, paddingVertical:1, alignSelf:'flex-start', marginBottom:3, borderWidth:1, borderColor: label.border }}>
                        <Text style={{ color: label.color, fontSize:8, fontWeight:'800' }}>{label.text}</Text>
                    </View>
                )}
                <PlayerHalf p={p1} />
                <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'900', textAlign:'center', marginVertical:2 }}>+</Text>
                {slot2}
                {p2 && isMineCard && !regEnded && (
                    <TouchableOpacity onPress={() => setMyTournamentPartner(null)} disabled={partnerActionLoading} style={{ marginTop:3 }}>
                        <Text style={{ color:'#f87171', fontSize:11, fontWeight:'800' }}>✕</Text>
                    </TouchableOpacity>
                )}
            </View>
        );
    };

    const [manualName, setManualName] = useState('');
    const [addingManual, setAddingManual] = useState(false);

    const addManualParticipant = async () => {
        const name = manualName.trim();
        if (!name) return;
        setAddingManual(true);
        try {
            const { data } = await api.post(`/tournaments/${item.id}/participants/manual`, { name });
            setRequests(prev => [...prev, { ...data, user: null }]);
            setManualName('');
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setAddingManual(false); }
    };

    const removeManualParticipant = async (participantId) => {
        Alert.alert('Manuel Oyuncuyu Çıkar', 'Bu oyuncuyu listeden kaldırmak istediğinizden emin misiniz?', [
            { text: 'Vazgeç', style: 'cancel' },
            { text: 'Kaldır', style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/tournaments/${item.id}/participants/manual/${participantId}`);
                    setRequests(prev => prev.filter(r => r.id !== participantId));
                } catch (e) {
                    Alert.alert('', e?.response?.data?.message || t.actionFailed);
                }
            }},
        ]);
    };

    const runDemo = useCallback(async (idx) => {
        if (demoStop.current || idx >= 40) { setDemoRunning(false); return; }
        try {
            const { data } = await api.post('/demo/tournament-join', { tournamentId: item.id, playerIndex: idx });
            setDemoIdx(idx + 1);
            setRequests(prev => prev.some(r => r.userId === data.participant.userId) ? prev : [...prev, data.participant]);
            if (demoStop.current) { setDemoRunning(false); return; }
            const delay = 1000 + Math.random() * 1000;
            setTimeout(() => runDemo(idx + 1), delay);
        } catch (e) {
            if (e?.response?.status === 409) {
                // Already sent — skip to next
                setTimeout(() => runDemo(idx + 1), 300);
            } else {
                setDemoRunning(false);
            }
        }
    }, [item.id]);

    const startDemo = () => {
        demoStop.current = false;
        setDemoRunning(true);
        setShowListModal(true);
        if (requests.length === 0) fetchRequests();
        runDemo(demoIdx);
    };

    const stopDemo = () => {
        demoStop.current = true;
        setDemoRunning(false);
    };

    const numSets = item.setsPerMatch || 3;

    const fetchMatches = useCallback(async () => {
        setLoadingMatches(true);
        setMatchesError(false);
        try {
            const { data } = await api.get(`/tournaments/${item.id}/matches`);
            setTournMatches(Array.isArray(data?.matches) ? data.matches : []);
            setMyTeamId(data?.myTeamId || null);
            setTournTeams(Array.isArray(data?.teams) ? data.teams : []);
            setTournPlayerRatings(data?.playerRatings || {});
        } catch (e) {
            // Önceden burada hata sessizce yutuluyordu — geçici bir ağ hatasında ekran
            // "Maç yok" gösteriyordu (gerçekten maç olmamasıyla ayırt edilemiyordu),
            // kullanıcı modalı kapatıp tekrar açınca (fetchMatches yeniden tetiklenince)
            // düzeliyordu. Artık hata durumu ayrı gösteriliyor ve "Tekrar Dene" ile aynı
            // modalı kapatmadan yeniden denenebiliyor.
            console.log('[fetchMatches] failed:', e?.message);
            setMatchesError(true);
        }
        finally { setLoadingMatches(false); }
    }, [item.id]);

    const [confirmingMatchId, setConfirmingMatchId] = useState(null);
    const confirmTournamentScore = async (match) => {
        setConfirmingMatchId(match.id);
        try {
            const { data } = await api.post(`/tournaments/${item.id}/matches/${match.id}/confirm`);
            setTournMatches(Array.isArray(data) ? data : tournMatches);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setConfirmingMatchId(null); }
    };

    const handleStartTournament = () => {
        Alert.alert('Turnuvayı Başlat', 'Eşleşmeler otomatik oluşturulacak ve turnuva başlayacak. Onaylıyor musunuz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Başlat', style: 'destructive', onPress: async () => {
                setStarting(true);
                try {
                    await api.post(`/tournaments/${item.id}/start`);
                    onUpdated?.();
                } catch (e) {
                    Alert.alert('', e?.response?.data?.message || t.actionFailed);
                } finally { setStarting(false); }
            }},
        ]);
    };

    const handleFixDeadlines = async () => {
        try {
            const { data } = await api.post(`/tournaments/${item.id}/fix-deadlines`);
            setTournMatches(Array.isArray(data.matches) ? data.matches : []);
            Alert.alert('✅', `${data.fixed} maçın süresi turnuva başlangıcına göre düzeltildi.`);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        }
    };

    const handleRegenRound = () => {
        Alert.alert('Turu Yeniden Oluştur', 'Mevcut PENDING tur silinip 1. turdaki oyuncularla yeniden eşleştirilecek. Onaylıyor musunuz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Yeniden Oluştur', style: 'destructive', onPress: async () => {
                try {
                    const { data } = await api.post(`/tournaments/${item.id}/regen-round`);
                    setTournMatches(Array.isArray(data) ? data : []);
                    Alert.alert('✅', 'Tur yeniden oluşturuldu!');
                } catch (e) {
                    Alert.alert('', e?.response?.data?.message || t.actionFailed);
                }
            }},
        ]);
    };

    const handleRematch = () => {
        Alert.alert('Tekrar Eşleştir', 'Tamamlanmamış maçlar silinip ELO\'ya göre yeniden eşleştirilecek. Onaylıyor musunuz?', [
            { text: 'İptal', style: 'cancel' },
            { text: 'Eşleştir', style: 'destructive', onPress: async () => {
                try {
                    const { data } = await api.post(`/tournaments/${item.id}/rematch`);
                    setTournMatches(Array.isArray(data) ? data : []);
                    if (!showMatchesModal) { fetchMatches(); setShowMatchesModal(true); }
                    Alert.alert('✅', 'Eşleşmeler yenilendi!');
                } catch (e) {
                    Alert.alert('', e?.response?.data?.message || t.actionFailed);
                }
            }},
        ]);
    };

    const openScoreEntry = (match) => {
        setScoreEntry({ matchId: match.id, p1Name: match.p1Name, p2Name: match.p2Name });
        const initialCount = numSets >= 3 ? 2 : numSets;
        setScoreSets(Array.from({ length: initialCount }, () => ({ p1: '', p2: '' })));
    };

    const updateTournSet = (si, field, val) => {
        setScoreSets(prev => {
            if (numSets < 3) {
                return prev.map((s, i) => i === si ? { ...s, [field]: val.replace(/[^0-9]/, '') } : s);
            }
            if (si < 2) {
                const updated = prev.slice(0, 2).map((s, i) => i === si ? { ...s, [field]: val.replace(/[^0-9]/, '') } : s);
                let p1W = 0, p2W = 0;
                updated.forEach(s => {
                    const p1 = parseInt(s.p1) || 0, p2 = parseInt(s.p2) || 0;
                    if (p1 > p2) p1W++; else if (p2 > p1) p2W++;
                });
                if (p1W === 1 && p2W === 1) return [...updated, { p1: '', p2: '' }];
                return updated;
            }
            return prev.map((s, i) => i === si ? { ...s, [field]: val.replace(/[^0-9]/, '') } : s);
        });
    };

    const submitScore = async () => {
        if (!scoreEntry) return;
        const sets = scoreSets.map(s => ({ p1: parseInt(s.p1) || 0, p2: parseInt(s.p2) || 0 }));
        if (item.subCategory === 'tennis' || item.subCategory === 'padel') {
            for (const s of sets) {
                if (s.p1 === 0 && s.p2 === 0) continue;
                const hi = Math.max(s.p1, s.p2), lo = Math.min(s.p1, s.p2);
                const valid = (hi === 6 && lo <= 4) || (hi === 7 && (lo === 5 || lo === 6));
                if (!valid) {
                    Alert.alert('Geçersiz Set Skoru', `${s.p1}-${s.p2} geçersiz. Tenis/Padel setinde kazanan 6 (max 6-4) veya 7-5/7-6 ile bitmelidir.`);
                    return;
                }
            }
        }
        let p1Wins = 0, p2Wins = 0;
        for (const s of sets) {
            if (s.p1 > s.p2) p1Wins++; else if (s.p2 > s.p1) p2Wins++;
        }
        if (p1Wins === p2Wins) { Alert.alert('', 'Geçersiz sonuç: eşitlik kabul edilmiyor.'); return; }
        const winner = p1Wins > p2Wins ? 'p1' : 'p2';
        setSubmittingScore(true);
        try {
            const { data } = await api.patch(`/tournaments/${item.id}/matches/${scoreEntry.matchId}/score`, { sets, winner });
            setTournMatches(Array.isArray(data) ? data : []);
            setScoreEntry(null);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setSubmittingScore(false); }
    };

    const saveEdit = async () => {
        setSaving(true);
        try {
            await api.patch(`/tournaments/${item.id}`, {
                name: editName || item.name,
                description: editDescription || null,
                contactPhone: editContactPhone || null,
                scope: editScope,
                genderType: editGenderType,
                minRating: editMinRating !== '' ? parseFloat(editMinRating) : null,
                maxRating: editMaxRating !== '' ? parseFloat(editMaxRating) : null,
                minPlayers: parseInt(editMin) || item.minPlayers,
                maxPlayers: parseInt(editMax) || item.maxPlayers,
                setsPerMatch: editSetsPerMatch ? parseInt(editSetsPerMatch) : null,
                advantageScoring: editAdvantageScoring,
                matchesBeforePlayoff: editMatches ? parseInt(editMatches) : null,
                playoffQualifiers: editQualifiers ? parseInt(editQualifiers) : null,
                location: editLocation || null,
                surface: editSurface || null,
                isIndoor: editIsIndoor,
                isPaid: editIsPaid,
                feeType: editFeeType || null,
                playerFee: editIsPaid && editPlayerFee ? parseFloat(editPlayerFee) : null,
                paymentMethod: editIsPaid ? editPaymentMethod : null,
                ibanNumber: editIsPaid && editPaymentMethod === 'EFT' ? editIbanNumber : null,
                ibanHolder: editIsPaid && editPaymentMethod === 'EFT' ? editIbanHolder : null,
                prize1: editPrize1 || null,
                prize2: editPrize2 || null,
                prize3: editPrize3 || null,
                eventDate: fmtD(editEventDate),
                eventTime: editEventTime || null,
                eventEndDate: fmtD(editEventEndDate),
                eventEndTime: editEventEndTime || null,
                endDate: fmtD(editRegEndDate),
                endTime: editRegEndTime || null,
            });
            setShowEditModal(false);
            onUpdated?.();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setSaving(false); }
    };

    const isEventWithin24h = () => {
        if (!item.eventDate) return false;
        const eventStart = new Date(item.eventDate);
        if (item.eventTime) {
            const [h, m] = item.eventTime.split(':').map(Number);
            eventStart.setHours(h, m, 0, 0);
        }
        const ms = eventStart.getTime() - Date.now();
        return ms > 0 && ms < 24 * 60 * 60 * 1000;
    };

    const isEventStarted = () => {
        if (!item.eventDate) return false;
        const eventStart = new Date(item.eventDate);
        if (item.eventTime) {
            const [h, m] = item.eventTime.split(':').map(Number);
            eventStart.setHours(h, m, 0, 0);
        }
        return Date.now() >= eventStart.getTime();
    };

    const isRegEnded = () => {
        if (!item.endDate) return false;
        const regEnd = new Date(item.endDate);
        if (item.endTime) {
            const [h, m] = item.endTime.split(':').map(Number);
            regEnd.setHours(h, m, 0, 0);
        }
        return Date.now() >= regEnd.getTime();
    };

    const handleCancelAttempt = () => {
        if (myStatus === 'ACCEPTED' && isEventWithin24h()) {
            setShowCancelModal(true);
        } else {
            Alert.alert('Katılımı İptal Et', 'Katılımı iptal etmek istediğinizden emin misiniz?', [
                { text: 'Vazgeç', style: 'cancel' },
                { text: 'İptal Et', style: 'destructive', onPress: () => onCancelJoin(item.id) },
            ]);
        }
    };

    const submitCancelWithReason = () => {
        if (!cancelReasonText.trim()) {
            Alert.alert('', 'Lütfen bir mazeret yazın.');
            return;
        }
        setShowCancelModal(false);
        onCancelJoin(item.id, cancelReasonText.trim());
        setCancelReasonText('');
    };

    const infoColor = cfg.color;

    const skillRatingMap = (() => {
        const map = {};
        const src = requests.length > 0 ? requests : participants;
        src.forEach(r => {
            if (r.userId && r.user?.interests?.[0]?.skillRating != null)
                map[r.userId] = r.user.interests[0].skillRating;
        });
        // /matches endpoint'inden gelen canlı bireysel puanlar — requests/participants
        // bayatlamış olsa bile (skor girildikten sonra requests yeniden çekilmiyor) en
        // güncel değeri burada görürüz.
        Object.entries(tournPlayerRatings).forEach(([uid, r]) => { if (r != null) map[uid] = r; });
        // Çiftler Rekabetçi: takım ortalama ELO'su — henüz skorlanmamış maçlarda da
        // takım yıldız puanı gösterilsin (skorlanan maçlar aşağıda daha güncel değerle ezer)
        tournTeams.forEach(t => { if (t.avgRating != null) map[t.id] = t.avgRating; });
        // Override with latest ratings from completed match scores
        const done = [...tournMatches].filter(m => m.status === "COMPLETED" && m.score);
        done.sort((a, b) => (a.round||0) - (b.round||0) || (a.matchIndex||0) - (b.matchIndex||0));
        for (const m of done) {
            if (m.p1Id && m.score.p1RatingAfter != null) map[m.p1Id] = m.score.p1RatingAfter;
            if (m.p2Id && m.score.p2RatingAfter != null) map[m.p2Id] = m.score.p2RatingAfter;
        }
        return map;
    })();

    const standings = (() => {
        const stats = {};
        for (const m of tournMatches) {
            if (m.phase !== 'GROUP') continue;
            if (m.p1Id && !stats[m.p1Id]) stats[m.p1Id] = { id:m.p1Id, name:m.p1Name, played:0, won:0, lost:0, setsWon:0, setsLost:0, gamesWon:0, gamesLost:0, points:0 };
            if (m.p2Id && !stats[m.p2Id]) stats[m.p2Id] = { id:m.p2Id, name:m.p2Name, played:0, won:0, lost:0, setsWon:0, setsLost:0, gamesWon:0, gamesLost:0, points:0 };
            if (m.status !== 'COMPLETED' || !m.score || !m.p2Id) continue;
            const sc = m.score;
            const s1 = stats[m.p1Id], s2 = stats[m.p2Id];
            if (!s1 || !s2) continue;
            s1.played++; s2.played++;
            let p1s=0,p2s=0,p1g=0,p2g=0;
            for (const set of (sc.sets||[])) {
                p1g+=set.p1||0; p2g+=set.p2||0;
                if ((set.p1||0)>(set.p2||0)) p1s++; else if ((set.p2||0)>(set.p1||0)) p2s++;
            }
            s1.setsWon+=p1s; s1.setsLost+=p2s; s1.gamesWon+=p1g; s1.gamesLost+=p2g;
            s2.setsWon+=p2s; s2.setsLost+=p1s; s2.gamesWon+=p2g; s2.gamesLost+=p1g;
            if (sc.winner==='p1') { s1.won++; s1.points+=3; s2.lost++; } else { s2.won++; s2.points+=3; s1.lost++; }
        }
        return Object.values(stats).sort((a,b) => {
            if (b.points!==a.points) return b.points-a.points;
            const sr=x=>x.setsLost===0?(x.setsWon===0?0:Infinity):x.setsWon/x.setsLost;
            if (Math.abs(sr(b)-sr(a))>0.001) return sr(b)-sr(a);
            const gr=x=>x.gamesLost===0?(x.gamesWon===0?0:Infinity):x.gamesWon/x.gamesLost;
            return gr(b)-gr(a);
        });
    })();

    return (
        <>
        <View style={[s.card, { marginBottom:10 }]}>
            {/* Header */}
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
                <View style={{ flex:1, gap:2 }}>
                    {item.status === 'IN_PROGRESS' ? (
                        <TouchableOpacity style={{ flexDirection:'row', alignItems:'center', gap:6 }} onPress={() => setCollapsed(c => !c)}>
                            <Text style={{ color:'#fff', fontSize:15, fontWeight:'900' }}>{item.name}</Text>
                            <Text style={{ color: colors.textMuted, fontSize:13 }}>{collapsed ? '▶' : '▼'}</Text>
                        </TouchableOpacity>
                    ) : (
                        <Text style={{ color:'#fff', fontSize:15, fontWeight:'900' }}>{item.name}</Text>
                    )}
                    {!collapsed && (<>
                    <Text style={{ color: colors.textMuted, fontSize:11 }}>
                        {SCOPE_EMOJI[item.scope] || '📍'} {item.city || ''}{item.city && ' · '}{typeLabels[item.type] || item.type}
                        {item.genderType ? ` · ${t['tournGender' + item.genderType.charAt(0) + item.genderType.slice(1).toLowerCase()] || item.genderType}` : ''}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize:11, marginTop:2 }}>
                        👤 {item.creator?.fullName || item.creator?.username}
                        {item.contactPhone ? `  📞 ${item.contactPhone}` : ''}
                    </Text>
                    {item.isPaid ? (
                        <View style={{ gap:1 }}>
                            <Text style={{ color:'#fbbf24', fontSize:10, fontWeight:'800' }}>
                                💰 Ücretli{item.playerFee ? ` · ${item.playerFee}₺/oyuncu` : ''}
                            </Text>
                            {item.feeType === 'INCLUDED'
                                ? <Text style={{ color: colors.textMuted, fontSize:10 }}>Kort ücreti dahil</Text>
                                : item.feeType === 'SHARED'
                                ? <Text style={{ color: colors.textMuted, fontSize:10 }}>Kort ücreti ortaklaşa karşılanır</Text>
                                : null}
                            {item.paymentMethod === 'CASH' && <Text style={{ color:'#4ade80', fontSize:10 }}>💵 Kortta nakit ödeme</Text>}
                            {item.paymentMethod === 'EFT' && <Text style={{ color:'#60a5fa', fontSize:10 }}>🏦 EFT ile ödeme</Text>}
                            {item.paymentMethod === 'EFT' && item.ibanHolder && <Text style={{ color: colors.textMuted, fontSize:10 }}>Hesap: {item.ibanHolder}</Text>}
                            {item.paymentMethod === 'EFT' && item.ibanNumber && <Text style={{ color: colors.textMuted, fontSize:10 }}>IBAN: {item.ibanNumber}</Text>}
                        </View>
                    ) : (
                        (item.feeType === 'SHARED' || item.feeType === 'SPONSORED') && (
                            <Text style={{ color: colors.textMuted, fontSize:10 }}>
                                {item.feeType === 'SPONSORED' ? '🏟️ Kort ücretleri sponsorlar tarafından karşılanır' : '🏟️ Kort ücretleri oyuncular tarafından ortaklaşa karşılanır'}
                            </Text>
                        )
                    )}
                    {item.endDate && (
                        <Text style={{ color: colors.textMuted, fontSize:11 }}>
                            📅 Son başvuru: {new Date(item.endDate).toLocaleDateString('tr-TR')}{item.endTime ? ` ${item.endTime}` : ''}
                        </Text>
                    )}
                    <Text style={{ color: colors.textMuted, fontSize:11 }}>
                        {(() => {
                            const max = item.maxPlayers;
                            const asCount = max ? Math.min(participantCount, max) : participantCount;
                            const yedek = max ? Math.max(0, participantCount - max) : 0;
                            const base = max ? `👥 ${asCount}/${max}` : `👥 ${participantCount}`;
                            return yedek > 0 ? `${base} + yedek: ${yedek}` : base;
                        })()}
                        {item.minPlayers > 2 ? `  (min ${item.minPlayers})` : ''}
                    </Text>
                    {item.location
                        ? <Text style={{ color:'#60a5fa', fontSize:11 }}>🏟️ {item.location}</Text>
                        : <Text style={{ color: colors.textMuted, fontSize:11 }}>🤝 {t.tournCourtPlayersDecide}</Text>
                    }
                    {item.surface && <Text style={{ color: colors.textMuted, fontSize:11 }}>⬜ {getSurface(t, item.surface)}</Text>}
                    {(item.minRating !== null && item.minRating !== undefined) || (item.maxRating !== null && item.maxRating !== undefined) ? (
                        <Text style={{ color:'#fbbf24', fontSize:11 }}>
                            ⭐ {item.minRating !== null && item.minRating !== undefined ? `${item.minRating}★` : '0★'} – {item.maxRating !== null && item.maxRating !== undefined ? `${item.maxRating}★` : '5★'}
                        </Text>
                    ) : null}
                    {/* Rules badge */}
                    {item.matchFrequency && item.matchFrequency !== 'FLEXIBLE' && (
                        <View style={{ backgroundColor:'#1e3a8a20', borderRadius:7, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#1e3a8a50', marginTop:2 }}>
                            <Text style={{ color:'#93c5fd', fontSize:10, fontWeight:'800' }}>
                                {item.matchFrequency === 'WEEKLY_1'
                                    ? '📅 Haftada 1 Maç  •  🃏 1 joker (+10 gün)'
                                    : '📅 Haftada 2 Maç  •  🃏 2 joker (+14 gün)'}
                            </Text>
                        </View>
                    )}
                    {(item.prize1 || item.prize2 || item.prize3) && (
                        <View style={{ gap:1 }}>
                            {item.prize1 && <Text style={{ color:'#fbbf24', fontSize:11 }}>🥇 {item.prize1}</Text>}
                            {item.prize2 && <Text style={{ color:'#94a3b8', fontSize:11 }}>🥈 {item.prize2}</Text>}
                            {item.prize3 && <Text style={{ color:'#cd7f32', fontSize:11 }}>🥉 {item.prize3}</Text>}
                        </View>
                    )}
                    {item.eventDate && (<>
                        <Text style={{ color: colors.textMuted, fontSize:11 }}>
                            🗓️ {t.tournEventStartLabel}: {new Date(item.eventDate).toLocaleDateString('tr-TR')}{item.eventTime ? ` ${item.eventTime}` : ''}
                        </Text>
                        {item.eventEndDate && (
                            <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                🏁 {t.tournEventEndLabel}: {new Date(item.eventEndDate).toLocaleDateString('tr-TR')}{item.eventEndTime ? ` ${item.eventEndTime}` : ''}
                            </Text>
                        )}
                    </>)}
                    {(item.type === '1' || item.type === '2') && (item.setsPerMatch || item.matchesBeforePlayoff || item.playoffQualifiers) && (
                        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:4, marginTop:2 }}>
                            {item.setsPerMatch && (
                                <View style={{ backgroundColor: infoColor+'15', borderRadius:6, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor: infoColor+'40' }}>
                                    <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>
                                        {`Set Sayısı: ${item.setsPerMatch}`}
                                    </Text>
                                </View>
                            )}
                            {item.advantageScoring !== undefined && (
                                <View style={{ backgroundColor: infoColor+'15', borderRadius:6, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor: infoColor+'40' }}>
                                    <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>
                                        {item.advantageScoring === null ? t.tournFreeScoring : item.advantageScoring ? t.tournAdvantage : t.tournDeciding}
                                    </Text>
                                </View>
                            )}
                            <View style={{ backgroundColor: infoColor+'15', borderRadius:6, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor: infoColor+'40' }}>
                                <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>🔢 Play-Off Öncesi Maç Sayısı: {item.matchesBeforePlayoff || 3}</Text>
                            </View>
                            {item.playoffQualifiers && (
                                <View style={{ backgroundColor: infoColor+'15', borderRadius:6, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor: infoColor+'40' }}>
                                    <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>🏆 {t.tournPlayoffQualifiers}: {item.playoffQualifiers}</Text>
                                </View>
                            )}
                        </View>
                    )}
                    </>)}
                </View>
                {!collapsed && (
                <View style={{ alignItems:'flex-end', gap:4 }}>
                    <View style={{ backgroundColor: item.status === 'IN_PROGRESS' ? '#16a34a20' : item.status === 'COMPLETED' ? '#64748b20' : infoColor + '20', borderRadius:8, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor: item.status === 'IN_PROGRESS' ? '#16a34a50' : item.status === 'COMPLETED' ? '#64748b50' : infoColor + '50' }}>
                        <Text style={{ color: item.status === 'IN_PROGRESS' ? '#4ade80' : item.status === 'COMPLETED' ? '#94a3b8' : infoColor, fontSize:10, fontWeight:'800' }}>
                            {item.status === 'IN_PROGRESS' ? '🏆 Devam Ediyor' : item.status === 'COMPLETED' ? '✅ Tamamlandı' : t.tournStatusOpen}
                        </Text>
                    </View>
                    {isCreator ? (<>
                        {myStatus === null && !isEventStarted() && (
                            <TouchableOpacity style={{ backgroundColor: infoColor + '20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor: infoColor + '50' }} onPress={handleJoinPress}>
                                <Text style={{ color: infoColor, fontSize:10, fontWeight:'700' }}>+ {t.tournJoinBtn}</Text>
                            </TouchableOpacity>
                        )}
                        {myStatus === 'ACCEPTED' && (
                            <View style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor:'#16a34a50' }}>
                                <Text style={{ color:'#4ade80', fontSize:10 }}>✓ Katıldın</Text>
                            </View>
                        )}
                        <TouchableOpacity style={{ backgroundColor: infoColor + '20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor: infoColor + '50' }} onPress={() => setShowEditModal(true)}>
                            <Text style={{ color: infoColor, fontSize:10, fontWeight:'700' }}>{t.tournEditBtn}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ backgroundColor:'#dc262620', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#dc262650', alignItems:'center' }} onPress={() => onDelete(item.id)}>
                            <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700', textAlign:'center' }}>Turnuvayı{'\n'}🗑️ Sil</Text>
                        </TouchableOpacity>
                        {item.status === 'OPEN' && participantCount >= (item.minPlayers || 2) && (
                            <TouchableOpacity
                                style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#16a34a50' }}
                                onPress={handleStartTournament}
                                disabled={starting}>
                                <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'700' }}>
                                    {starting ? '...' : '🏆 Başlat'}
                                </Text>
                            </TouchableOpacity>
                        )}
                        {item.status === 'IN_PROGRESS' && item.type !== '2' && (
                            <TouchableOpacity
                                style={{ backgroundColor:'#f59e0b20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#f59e0b50' }}
                                onPress={handleRematch}>
                                <Text style={{ color:'#fbbf24', fontSize:10, fontWeight:'700' }}>🔀 Tekrar{'\n'}Eşleştir</Text>
                            </TouchableOpacity>
                        )}
                        {item.status === 'IN_PROGRESS' && item.type === '1' && (
                            <>
                                <TouchableOpacity
                                    style={{ backgroundColor:'#0e7490' + '30', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#0e7490' + '60' }}
                                    onPress={handleFixDeadlines}>
                                    <Text style={{ color:'#67e8f9', fontSize:10, fontWeight:'700' }}>⏱️ Süre{'\n'}Düzelt</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={{ backgroundColor:'#7c3aed20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#7c3aed50' }}
                                    onPress={handleRegenRound}>
                                    <Text style={{ color:'#a78bfa', fontSize:10, fontWeight:'700' }}>🔁 Turu{'\n'}Düzelt</Text>
                                </TouchableOpacity>
                            </>
                        )}
                        <View style={{ flexDirection:'row', gap:6 }}>
                            <TouchableOpacity
                                style={{ alignItems:'center', backgroundColor:'#16a34a15', borderRadius:6, paddingHorizontal:6, paddingVertical:5, borderWidth:1, borderColor:'#16a34a40' }}
                                onPress={() => { fetchChat(); fetchChatNotifyPref(); setShowChatModal(true); }}>
                                <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'600', textAlign:'center', lineHeight:13 }}>
                                    {'Mesajlar'.split('').join('\n')}
                                </Text>
                                <Text style={{ color:'#4ade80', fontSize:10, marginTop:3 }}>›</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ alignItems:'center', backgroundColor:'#1e40af15', borderRadius:6, paddingHorizontal:6, paddingVertical:5, borderWidth:1, borderColor:'#1e40af40' }}
                                onPress={() => { fetchRequests(); setShowListModal(true); }}>
                                {requests.length > 0 && <Text style={{ color:'#60a5fa', fontSize:9, fontWeight:'800', marginBottom:2 }}>{requests.length}</Text>}
                                <Text style={{ color:'#60a5fa', fontSize:10, fontWeight:'600', textAlign:'center', lineHeight:13 }}>
                                    {'Başvurular'.split('').join('\n')}
                                </Text>
                                <Text style={{ color:'#60a5fa', fontSize:10, marginTop:3 }}>›</Text>
                            </TouchableOpacity>
                        </View>
                    </>) : (<>
                        {myStatus === null && ['OPEN', 'IN_PROGRESS'].includes(item.status) && !isEventStarted() && !isRegEnded() && (
                            <TouchableOpacity style={{ backgroundColor: infoColor + '20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor: infoColor + '50' }} onPress={handleJoinPress}>
                                <Text style={{ color: infoColor, fontSize:10, fontWeight:'700' }}>{t.tournJoinBtn}</Text>
                            </TouchableOpacity>
                        )}
                        {myStatus === 'PENDING' && (<>
                            <View style={{ backgroundColor:'#a855f720', borderRadius:6, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor:'#a855f750', maxWidth:120 }}>
                                <Text style={{ color:'#c084fc', fontSize:10, flexWrap:'wrap' }}>{t.tournJoinPending}</Text>
                            </View>
                            {!isEventStarted() && (
                                <TouchableOpacity style={{ backgroundColor:'#dc262620', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#dc262650' }} onPress={() => onCancelJoin(item.id)}>
                                    <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>{t.tournCancelJoinBtn}</Text>
                                </TouchableOpacity>
                            )}
                        </>)}
                        {myStatus === 'ACCEPTED' && !myPart?.cancelRequested && (
                            <View style={{ gap:4 }}>
                                <View style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor:'#16a34a50' }}>
                                    <Text style={{ color:'#4ade80', fontSize:10 }}>{t.tournJoinAccepted}</Text>
                                </View>
                                {!isEventStarted() && (
                                    <TouchableOpacity style={{ backgroundColor:'#dc262615', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#dc262640' }} onPress={handleCancelAttempt}>
                                        <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>İptal</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                        {myStatus === 'ACCEPTED' && myPart?.cancelRequested && (
                            <View style={{ backgroundColor:'#f59e0b15', borderRadius:6, paddingHorizontal:6, paddingVertical:4, borderWidth:1, borderColor:'#f59e0b40' }}>
                                <Text style={{ color:'#fbbf24', fontSize:10, fontWeight:'700' }}>⏳ İptal onay bekliyor</Text>
                            </View>
                        )}
                        <View style={{ flexDirection:'row', gap:6 }}>
                            {myStatus === 'ACCEPTED' && (
                                <TouchableOpacity
                                    style={{ alignItems:'center', backgroundColor:'#16a34a15', borderRadius:6, paddingHorizontal:6, paddingVertical:5, borderWidth:1, borderColor:'#16a34a40' }}
                                    onPress={() => { fetchChat(); fetchChatNotifyPref(); setShowChatModal(true); }}>
                                    <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'600', textAlign:'center', lineHeight:13 }}>
                                        {'Mesajlar'.split('').join('\n')}
                                    </Text>
                                    <Text style={{ color:'#4ade80', fontSize:10, marginTop:3 }}>›</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={{ alignItems:'center', backgroundColor:'#1e40af15', borderRadius:6, paddingHorizontal:6, paddingVertical:5, borderWidth:1, borderColor:'#1e40af40' }}
                                onPress={() => { item.type === '2' ? fetchRequests() : fetchParticipants(); setShowListModal(true); }}>
                                {participantCount > 0 && <Text style={{ color:'#60a5fa', fontSize:9, fontWeight:'800', marginBottom:2 }}>{participantCount}</Text>}
                                <Text style={{ color:'#60a5fa', fontSize:10, fontWeight:'600', textAlign:'center', lineHeight:13 }}>
                                    {'Katılımcı'.split('').join('\n')}
                                </Text>
                                <Text style={{ color:'#60a5fa', fontSize:10, marginTop:3 }}>›</Text>
                            </TouchableOpacity>
                        </View>
                    </>)}
                </View>
                )}
            </View>

        {/* IN_PROGRESS / COMPLETED: matches modal open button */}
        {(item.status === 'IN_PROGRESS' || item.status === 'COMPLETED') && (
            <TouchableOpacity
                style={{ backgroundColor:'#16a34a15', borderRadius:8, paddingHorizontal:10, paddingVertical:7, borderWidth:1, borderColor:'#16a34a40', marginTop:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}
                onPress={() => { fetchMatches(); if (!isCreator && participants.length === 0) fetchParticipants(); setShowMatchesModal(true); }}>
                <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'700' }}>📋 Maçlar & Puan Tablosu</Text>
                <Text style={{ color:'#4ade80', fontSize:12 }}>›</Text>
            </TouchableOpacity>
        )}

        {/* IN_PROGRESS: matches & standings Modal */}
        <Modal visible={showMatchesModal} animationType="slide" transparent onRequestClose={() => setShowMatchesModal(false)}>
            <View style={[s.modalOverlay, { justifyContent:'flex-end' }]}>
                <View style={[s.modalBox, { maxHeight:'90%' }]}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>📋 Maçlar & Puan Tablosu</Text>
                        <TouchableOpacity onPress={() => setShowMatchesModal(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                    </View>
                    {/* Rules summary bar */}
                    {item.matchFrequency && item.matchFrequency !== 'FLEXIBLE' && (
                        <View style={{ backgroundColor:'#1e3a8a18', borderRadius:8, padding:8, marginBottom:10, borderWidth:1, borderColor:'#1e3a8a40' }}>
                            <Text style={{ color:'#93c5fd', fontSize:11, fontWeight:'800' }}>
                                {item.matchFrequency === 'WEEKLY_1'
                                    ? '📅 Haftada 1 Maç  •  🃏 1 joker hakkı (+10 gün)'
                                    : '📅 Haftada 2 Maç  •  🃏 2 joker hakkı (+14 gün)'}
                            </Text>
                        </View>
                    )}
                    {(item.type === '1' || item.type === '3') && (
                        <View style={{ flexDirection:'row', gap:6, marginBottom:10 }}>
                            {['matches','standings'].map(tab => (
                                <TouchableOpacity key={tab} onPress={() => setMatchTab(tab)}
                                    style={{ paddingHorizontal:14, paddingVertical:6, borderRadius:8, backgroundColor: matchTab===tab ? '#16a34a40' : 'transparent', borderWidth:1, borderColor: matchTab===tab ? '#16a34a60' : colors.border }}>
                                    <Text style={{ color: matchTab===tab ? '#4ade80' : colors.textMuted, fontSize:12, fontWeight:'700' }}>
                                        {tab === 'matches' ? 'Maçlar' : 'Puan Tablosu'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                    )}
                    <ScrollView showsVerticalScrollIndicator={false}>
                {loadingMatches ? (
                    <ActivityIndicator size="small" color="#4ade80" style={{ marginVertical:8 }} />
                ) : matchesError ? (
                    <View style={{ alignItems:'center', paddingVertical:10 }}>
                        <Text style={{ color:'#f87171', fontSize:12, marginBottom:8 }}>Maçlar yüklenemedi (bağlantı sorunu olabilir)</Text>
                        <TouchableOpacity onPress={fetchMatches} style={{ backgroundColor:'#16a34a30', borderRadius:8, paddingHorizontal:14, paddingVertical:6, borderWidth:1, borderColor:'#16a34a60' }}>
                            <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'700' }}>↻ Tekrar Dene</Text>
                        </TouchableOpacity>
                    </View>
                ) : matchTab === 'standings' ? (
                    standings.length === 0
                        ? <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', paddingVertical:6 }}>Henüz maç sonucu yok</Text>
                        : <View>
                            <View style={{ flexDirection:'row', paddingVertical:4, borderBottomWidth:1, borderBottomColor: colors.border, marginBottom:2 }}>
                                <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'700', flex:1 }}>Oyuncu</Text>
                                {['O','G','M','Av','P'].map(h => (
                                    <Text key={h} style={{ color: colors.textMuted, fontSize:10, fontWeight:'700', width:28, textAlign:'center' }}>{h}</Text>
                                ))}
                            </View>
                            {standings.map((row, i) => (
                                <View key={row.id} style={{ flexDirection:'row', alignItems:'center', paddingVertical:5, borderBottomWidth: i < standings.length-1 ? 1 : 0, borderBottomColor: colors.border+'30' }}>
                                    <Text style={{ color:'#fff', fontSize:11, flex:1 }} numberOfLines={1}>
                                        {i+1}. {row.name}{skillRatingMap[row.id] != null ? `  ${starEmoji(Number(skillRatingMap[row.id]))} ${Number(skillRatingMap[row.id]).toFixed(2)}` : ''}
                                    </Text>
                                    {[row.played, row.won, row.lost, (() => { const d = row.setsWon - row.setsLost; return (d >= 0 ? "+" : "") + d; })(), row.points].map((v,j) => (
                                        <Text key={j} style={{ color: j===4 ? '#4ade80' : '#fff', fontSize:11, fontWeight: j===4 ? '800' : '400', width:28, textAlign:'center' }}>{String(v)}</Text>
                                    ))}
                                </View>
                            ))}
                          </View>
                ) : (
                    tournMatches.length === 0
                        ? <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', paddingVertical:6 }}>Maç yok</Text>
                        : (() => {
                            const playoffMs = tournMatches.filter(m => m.phase === 'PLAYOFF');
                            const playoffMaxRound = playoffMs.length ? Math.max(...playoffMs.map(m => m.round)) : 0;
                            const getRoundLabel = (round, phase) => {
                                if (phase === 'GROUP') return `Grup - Tur ${round}`;
                                const fromEnd = playoffMaxRound - round;
                                if (fromEnd === 0) return 'Final';
                                if (fromEnd === 1) return 'Yarı Final';
                                if (fromEnd === 2) return 'Çeyrek Final';
                                return `Playoff - Tur ${round}`;
                            };
                            const seen = new Set();
                            const roundKeys = tournMatches
                                .filter(m => { const k=`${m.phase}|${m.round}`; if (seen.has(k)) return false; seen.add(k); return true; })
                                .map(m => ({ phase:m.phase, round:m.round }));

                            // Her tur için hafta aralığı: bitiş = o turun deadline'ı, başlangıç = önceki
                            // turun deadline'ı (1. tur için turnuva başlangıç tarihi).
                            const fmtD = (d) => d.toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit' });
                            let prevDeadline = item.eventDate ? new Date(item.eventDate) : null;
                            const roundRanges = {};
                            for (const { phase, round } of roundKeys) {
                                const rm = tournMatches.find(m => m.phase === phase && m.round === round && m.deadline);
                                const key = `${phase}|${round}`;
                                if (rm) {
                                    const end = new Date(rm.deadline);
                                    roundRanges[key] = prevDeadline ? `${fmtD(prevDeadline)} - ${fmtD(end)}` : fmtD(end);
                                    prevDeadline = end;
                                } else {
                                    roundRanges[key] = null;
                                }
                            }

                            const activeKey = (selectedRoundKey && roundKeys.some(({ phase, round }) => `${phase}|${round}` === selectedRoundKey))
                                ? selectedRoundKey
                                : (roundKeys.length > 0 ? `${roundKeys[roundKeys.length - 1].phase}|${roundKeys[roundKeys.length - 1].round}` : null);
                            const [activePhase, activeRoundStr] = (activeKey || '').split('|');
                            const activeRound = parseInt(activeRoundStr);
                            const rMatches = tournMatches.filter(m => m.phase === activePhase && m.round === activeRound);

                            return (
                                <>
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:8 }}>
                                        <View style={{ flexDirection:'row', gap:6 }}>
                                            {roundKeys.map(({ phase, round }) => {
                                                const key = `${phase}|${round}`;
                                                const isActive = key === activeKey;
                                                return (
                                                    <TouchableOpacity key={key} onPress={() => setSelectedRoundKey(key)}
                                                        style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8, backgroundColor: isActive ? infoColor+'30' : '#1e293b', borderWidth:1, borderColor: isActive ? infoColor+'60' : colors.border, alignItems:'center' }}>
                                                        <Text style={{ color: isActive ? infoColor : colors.textMuted, fontSize:11, fontWeight:'800' }}>{getRoundLabel(round, phase)}</Text>
                                                        {roundRanges[key] && (
                                                            <Text style={{ color: isActive ? infoColor : colors.textMuted, fontSize:8, marginTop:1 }}>{roundRanges[key]}</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                );
                                            })}
                                        </View>
                                    </ScrollView>
                                        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
                                        {rMatches.map(match => {
                                            const isBye = match.status === 'BYE';
                                            const isDone = match.status === 'COMPLETED';
                                            const isReady = match.status === 'PENDING' && match.p1Id && match.p2Id;
                                            const isTBD = match.status === 'PENDING' && (!match.p1Id || !match.p2Id);
                                            const isEntering = scoreEntry?.matchId === match.id;
                                            const mSets = match.score?.sets || [];
                                            const p1SW = mSets.filter(s=>(s.p1||0)>(s.p2||0)).length;
                                            const p2SW = mSets.filter(s=>(s.p2||0)>(s.p1||0)).length;
                                            return (
                                                <View key={match.id} style={{ width: isEntering ? '100%' : '48.5%', backgroundColor:'#0f172a', borderRadius:8, padding:3, marginBottom:3, borderWidth:1, borderColor: isDone ? '#16a34a30' : isBye || isTBD ? '#64748b20' : '#334155' }}>
                                                        <View style={{ flex:1 }}>
                                                            {(() => {
                                                                const isW = isDone && match.winnerId === match.p1Id;
                                                                const setsRow = isDone && mSets.length > 0 && (
                                                                    <View style={{ flexDirection:'row', gap:3, paddingLeft:3 }}>
                                                                        {mSets.map((s,i) => <Text key={i} style={{ color: isW ? '#4ade80' : '#94a3b8', fontSize:12, fontWeight:'900', minWidth:16, textAlign:'center' }}>{s.p1}</Text>)}
                                                                        <Text style={{ color: isW ? '#4ade80' : '#475569', fontSize:10, fontWeight:'800', minWidth:12, textAlign:'center' }}>{p1SW}</Text>
                                                                    </View>
                                                                );
                                                                if (item.type === '2') {
                                                                    const team = tournTeams.find(tm => tm.id === match.p1Id);
                                                                    const memberRatings = match.score?.p1MemberRatings || [];
                                                                    const playerLine = (uid, name) => {
                                                                        const mr = memberRatings.find(x => x.userId === uid);
                                                                        if (isDone && mr) return `${name}  ${starEmoji(mr.after)} ${mr.before.toFixed(2)}→${mr.after.toFixed(2)}`;
                                                                        return skillRatingMap[uid] != null ? `${name}  ${starEmoji(Number(skillRatingMap[uid]))} ${Number(skillRatingMap[uid]).toFixed(2)}` : name;
                                                                    };
                                                                    const rB = match.score?.p1RatingBefore, rA = match.score?.p1RatingAfter;
                                                                    const avgLine = (isDone && rB != null && rA != null)
                                                                        ? `Takım Ort: ${rB.toFixed(2)}→${rA.toFixed(2)}`
                                                                        : (team?.avgRating != null ? `Takım Ort: ${Number(team.avgRating).toFixed(2)}` : '');
                                                                    return (
                                                                        <View style={{ flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between' }}>
                                                                            <View style={{ flex:1 }}>
                                                                                {team ? (
                                                                                    <>
                                                                                        <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:10, fontWeight:'700' }} numberOfLines={1}>{playerLine(team.player1Id, team.player1Name)}</Text>
                                                                                        <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:10, fontWeight:'700' }} numberOfLines={1}>{playerLine(team.player2Id, team.player2Name)}</Text>
                                                                                        {avgLine ? <Text style={{ color:'#a78bfa', fontSize:9, fontWeight:'800' }}>{avgLine}</Text> : null}
                                                                                    </>
                                                                                ) : (
                                                                                    <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:11, fontWeight:'700' }} numberOfLines={1}>{match.p1Name || 'TBD'}</Text>
                                                                                )}
                                                                            </View>
                                                                            {setsRow}
                                                                        </View>
                                                                    );
                                                                }
                                                                const rB = match.score?.p1RatingBefore, rA = match.score?.p1RatingAfter;
                                                                const hasRating = rB != null && rA != null;
                                                                const diff = hasRating ? parseFloat((rA - rB).toFixed(2)) : 0;
                                                                const eloStr = hasRating
                                                                    ? `  ${starEmoji(rA)} ${rB.toFixed(2)}  ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}${diff >= 0 ? '📈' : '📉'}  ${rA.toFixed(2)}`
                                                                    : (match.p1Id && skillRatingMap[match.p1Id] != null ? `  ${starEmoji(Number(skillRatingMap[match.p1Id]))} ${Number(skillRatingMap[match.p1Id]).toFixed(2)}` : '');
                                                                return (
                                                                    <View style={{ flexDirection:'row', alignItems:'center' }}>
                                                                        <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:11, fontWeight:'700', flex:1 }} numberOfLines={1}>
                                                                            {match.p1Name || 'TBD'}{eloStr}
                                                                        </Text>
                                                                        {setsRow}
                                                                    </View>
                                                                );
                                                            })()}
                                                            <Text style={{ color: colors.textMuted, fontSize:9, marginVertical:3 }}>vs</Text>
                                                            {(() => {
                                                                const isW = isDone && match.winnerId === match.p2Id;
                                                                const setsRow = isDone && mSets.length > 0 && (
                                                                    <View style={{ flexDirection:'row', gap:3, paddingLeft:3 }}>
                                                                        {mSets.map((s,i) => <Text key={i} style={{ color: isW ? '#4ade80' : '#94a3b8', fontSize:12, fontWeight:'900', minWidth:16, textAlign:'center' }}>{s.p2}</Text>)}
                                                                        <Text style={{ color: isW ? '#4ade80' : '#475569', fontSize:10, fontWeight:'800', minWidth:12, textAlign:'center' }}>{p2SW}</Text>
                                                                    </View>
                                                                );
                                                                if (item.type === '2') {
                                                                    const team = tournTeams.find(tm => tm.id === match.p2Id);
                                                                    const memberRatings = match.score?.p2MemberRatings || [];
                                                                    const playerLine = (uid, name) => {
                                                                        const mr = memberRatings.find(x => x.userId === uid);
                                                                        if (isDone && mr) return `${name}  ${starEmoji(mr.after)} ${mr.before.toFixed(2)}→${mr.after.toFixed(2)}`;
                                                                        return skillRatingMap[uid] != null ? `${name}  ${starEmoji(Number(skillRatingMap[uid]))} ${Number(skillRatingMap[uid]).toFixed(2)}` : name;
                                                                    };
                                                                    const rB = match.score?.p2RatingBefore, rA = match.score?.p2RatingAfter;
                                                                    const avgLine = (isDone && rB != null && rA != null)
                                                                        ? `Takım Ort: ${rB.toFixed(2)}→${rA.toFixed(2)}`
                                                                        : (team?.avgRating != null ? `Takım Ort: ${Number(team.avgRating).toFixed(2)}` : '');
                                                                    return (
                                                                        <View style={{ flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between' }}>
                                                                            <View style={{ flex:1 }}>
                                                                                {team ? (
                                                                                    <>
                                                                                        <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:10, fontWeight:'700' }} numberOfLines={1}>{playerLine(team.player1Id, team.player1Name)}</Text>
                                                                                        <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:10, fontWeight:'700' }} numberOfLines={1}>{playerLine(team.player2Id, team.player2Name)}</Text>
                                                                                        {avgLine ? <Text style={{ color:'#a78bfa', fontSize:9, fontWeight:'800' }}>{avgLine}</Text> : null}
                                                                                    </>
                                                                                ) : (
                                                                                    <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:11, fontWeight:'700' }} numberOfLines={1}>{match.p2Name || 'TBD'}</Text>
                                                                                )}
                                                                            </View>
                                                                            {setsRow}
                                                                        </View>
                                                                    );
                                                                }
                                                                const rB = match.score?.p2RatingBefore, rA = match.score?.p2RatingAfter;
                                                                const hasRating = rB != null && rA != null;
                                                                const diff = hasRating ? parseFloat((rA - rB).toFixed(2)) : 0;
                                                                const eloStr = hasRating
                                                                    ? `  ${starEmoji(rA)} ${rB.toFixed(2)}  ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}${diff >= 0 ? '📈' : '📉'}  ${rA.toFixed(2)}`
                                                                    : (match.p2Id && skillRatingMap[match.p2Id] != null ? `  ${starEmoji(Number(skillRatingMap[match.p2Id]))} ${Number(skillRatingMap[match.p2Id]).toFixed(2)}` : '');
                                                                return (
                                                                    <View style={{ flexDirection:'row', alignItems:'center' }}>
                                                                        <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:11, fontWeight:'700', flex:1 }} numberOfLines={1}>
                                                                            {match.p2Name || 'TBD'}{eloStr}
                                                                        </Text>
                                                                        {setsRow}
                                                                    </View>
                                                                );
                                                            })()}
                                                        </View>
                                                        <View style={{ flexDirection:'row', flexWrap:'wrap', alignItems:'center', gap:3, marginTop:3 }}>
                                                            {(isBye || isTBD) && <Text style={{ color: colors.textMuted, fontSize:9 }}>{isBye ? 'BYE' : 'TBD'}</Text>}
                                                            {match.deadline && !isDone && (() => {
                                                                const dl = new Date(match.deadline);
                                                                const overdue = dl < new Date();
                                                                const dateStr = dl.toLocaleDateString('tr-TR', { day:'2-digit', month:'2-digit' });
                                                                const timeStr = dl.toLocaleTimeString('tr-TR', { hour:'2-digit', minute:'2-digit' });
                                                                const dayLabel = item.type === '1' && match.round ? `${match.round * 7}. Gün · ` : '';
                                                                return (
                                                                    <Text style={{ color: overdue ? '#f87171' : '#fbbf24', fontSize:9, fontWeight:'700' }}>
                                                                        {'⏳'} {dayLabel}{dateStr} {timeStr}
                                                                    </Text>
                                                                );
                                                            })()}
                                                            {isReady && (isCreator || myIsAdmin || match.p1Id === mySideId || match.p2Id === mySideId) && !isEntering && (
                                                                <TouchableOpacity onPress={() => openScoreEntry(match)}
                                                                    style={{ backgroundColor: infoColor+'20', borderRadius:6, paddingHorizontal:3, paddingVertical:3, borderWidth:1, borderColor: infoColor+'50' }}>
                                                                    <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>Skor Gir</Text>
                                                                </TouchableOpacity>
                                                            )}
                                                            {/* Joker butonu — Bireysel Rekabetçi (oyuncu) ve Çiftler Rekabetçi (takım) */}
                                                            {(item.type === '1' || item.type === '2') && isReady && mySideId && (match.p1Id === mySideId || match.p2Id === mySideId) && !isEntering && (() => {
                                                                const myJokerRequested = match.p1Id === mySideId ? match.p1JokerRequested : match.p2JokerRequested;
                                                                const otherJokerRequested = match.p1Id === mySideId ? match.p2JokerRequested : match.p1JokerRequested;
                                                                if (myJokerRequested) return null;
                                                                const jokerLabel = otherJokerRequested ? '🃏 Karşılıklı Joker' : '🃏 Joker';
                                                                const confirmMsg = otherJokerRequested
                                                                    ? 'Rakibiniz joker kullanarak süreyi zaten 7 gün uzattı. Onaylarsanız karşılıklı sayılır — süre tekrar uzamaz ama iki tarafın da joker hakkı tükenmez. Emin misiniz?'
                                                                    : 'Joker hakkınızı bu maç için kullanmak istediğinizden emin misiniz? Süre 7 gün uzatılacak ve joker hakkınız tükenecek.';
                                                                return (
                                                                    <TouchableOpacity
                                                                        onPress={() => Alert.alert(jokerLabel, confirmMsg, [
                                                                            { text: 'Vazgeç', style: 'cancel' },
                                                                            { text: 'Evet, Kullan', style: 'destructive', onPress: async () => {
                                                                                try {
                                                                                    const { data } = await api.post(`/tournaments/${item.id}/matches/${match.id}/joker`);
                                                                                    await fetchMatches();
                                                                                    Alert.alert('🃏 Joker', data.message);
                                                                                } catch (e) {
                                                                                    Alert.alert('Hata', e?.response?.data?.message || 'Joker kullanılamadı.');
                                                                                }
                                                                            }},
                                                                        ])}
                                                                        style={{ backgroundColor: otherJokerRequested ? '#7c3aed20' : '#1e40af20', borderRadius:6, paddingHorizontal:3, paddingVertical:3, borderWidth:1, borderColor: otherJokerRequested ? '#7c3aed60' : '#1e40af60' }}>
                                                                        <Text style={{ color: otherJokerRequested ? '#c084fc' : '#93c5fd', fontSize:9, fontWeight:'700' }}>
                                                                            {jokerLabel}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                );
                                                            })()}
                                                            {(() => {
                                                                if (!isDone) return null;
                                                                const bothConfirmed = match.p1Confirmed && match.p2Confirmed;
                                                                const myUnconfirmedSide = (match.p1Id === mySideId && !match.p1Confirmed) ? 'p1'
                                                                    : (match.p2Id === mySideId && !match.p2Confirmed) ? 'p2' : null;
                                                                return (
                                                                    <>
                                                                        {!bothConfirmed && myUnconfirmedSide && !isEntering && (
                                                                            <TouchableOpacity onPress={() => confirmTournamentScore(match)} disabled={confirmingMatchId === match.id}
                                                                                style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:3, paddingVertical:3, borderWidth:1, borderColor:'#16a34a60', alignItems:'center' }}>
                                                                                <Text style={{ color:'#4ade80', fontSize:12 }}>✓</Text>
                                                                                <Text style={{ color:'#4ade80', fontSize:8, fontWeight:'700' }}>Onayla</Text>
                                                                            </TouchableOpacity>
                                                                        )}
                                                                        {!bothConfirmed && (isCreator || myIsAdmin) && !isEntering && (
                                                                            <TouchableOpacity onPress={() => openScoreEntry(match)}
                                                                                style={{ backgroundColor:'#f59e0b20', borderRadius:6, paddingHorizontal:3, paddingVertical:3, borderWidth:1, borderColor:'#f59e0b50', alignItems:'center' }}>
                                                                                <Text style={{ color:'#fbbf24', fontSize:12 }}>✏️</Text>
                                                                                <Text style={{ color:'#fbbf24', fontSize:8, fontWeight:'700' }}>Düzelt</Text>
                                                                            </TouchableOpacity>
                                                                        )}
                                                                        {bothConfirmed ? (
                                                                            <Text style={{ color:'#4ade80', fontSize:8, fontWeight:'700' }}>✓ Onaylandı</Text>
                                                                        ) : (
                                                                            <Text style={{ color: colors.textMuted, fontSize:8 }}>
                                                                                {match.p1Confirmed && !match.p2Confirmed ? 'Rakip onayı bekleniyor' : !match.p1Confirmed && match.p2Confirmed ? 'Rakip onayı bekleniyor' : 'Onay bekleniyor'}
                                                                            </Text>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </View>
                                                    {isEntering && (
                                                        <View style={{ marginTop:8, borderTopWidth:1, borderTopColor: colors.border, paddingTop:8 }}>
                                                            <View style={{ flexDirection:'row', marginBottom:4 }}>
                                                                <Text style={{ color: colors.textMuted, fontSize:10, width:54 }}>Set</Text>
                                                                <Text style={{ color: colors.textMuted, fontSize:10, flex:1, textAlign:'center' }}>{match.p1Name}</Text>
                                                                <Text style={{ color: colors.textMuted, fontSize:10, flex:1, textAlign:'center' }}>{match.p2Name}</Text>
                                                            </View>
                                                            {scoreSets.map((set, si) => (
                                                                <View key={si} style={{ flexDirection:'row', alignItems:'center', marginBottom:4 }}>
                                                                    <Text style={{ color: si === 2 ? '#f59e0b' : colors.textMuted, fontSize:11, width:54 }}>{si === 2 ? '🔥 3.' : `${si+1}.`} Set</Text>
                                                                    <TextInput
                                                                        style={{ flex:1, backgroundColor:'#1e293b', color:'#fff', borderRadius:6, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor: colors.border, fontSize:13, textAlign:'center', marginRight:6 }}
                                                                        value={set.p1}
                                                                        onChangeText={v => updateTournSet(si, 'p1', v)}
                                                                        keyboardType="numeric" maxLength={2} placeholder="0" placeholderTextColor={colors.textMuted} />
                                                                    <TextInput
                                                                        style={{ flex:1, backgroundColor:'#1e293b', color:'#fff', borderRadius:6, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor: colors.border, fontSize:13, textAlign:'center' }}
                                                                        value={set.p2}
                                                                        onChangeText={v => updateTournSet(si, 'p2', v)}
                                                                        keyboardType="numeric" maxLength={2} placeholder="0" placeholderTextColor={colors.textMuted} />
                                                                </View>
                                                            ))}
                                                            <View style={{ flexDirection:'row', gap:8, marginTop:6 }}>
                                                                <TouchableOpacity onPress={submitScore} disabled={submittingScore}
                                                                    style={{ backgroundColor:'#16a34a30', borderRadius:8, paddingHorizontal:14, paddingVertical:5, borderWidth:1, borderColor:'#16a34a60' }}>
                                                                    <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'800' }}>{submittingScore ? '...' : 'Kaydet'}</Text>
                                                                </TouchableOpacity>
                                                                <TouchableOpacity onPress={() => setScoreEntry(null)} style={{ paddingHorizontal:10, paddingVertical:5 }}>
                                                                    <Text style={{ color: colors.textMuted, fontSize:12 }}>✕ İptal</Text>
                                                                </TouchableOpacity>
                                                            </View>
                                                        </View>
                                                    )}
                                                </View>
                                            );
                                        })}
                                        </View>
                                </>
                            );
                          })()
                )}
                    <View style={{ height:16 }} />
                    </ScrollView>
                </View>
            </View>
        </Modal>

            {/* Full Edit Modal */}
            <Modal visible={showEditModal} animationType="slide" transparent onRequestClose={() => setShowEditModal(false)}>
                <View style={[s.modalOverlay, { justifyContent:'flex-end' }]}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width:'100%' }}>
                        <View style={[s.modalBox, { maxHeight:'92%' }]}>
                            <View style={s.modalHeader}>
                                <Text style={s.modalTitle}>Turnuvayı Düzenle</Text>
                                <TouchableOpacity onPress={() => setShowEditModal(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                            </View>
                            <ScrollView showsVerticalScrollIndicator={false}>
                                {/* Name */}
                                <Text style={s.fieldLabel}>Turnuva Adı</Text>
                                <TextInput style={s.fieldInput} value={editName} onChangeText={setEditName} placeholderTextColor={colors.textMuted} />

                                {/* Description */}
                                <Text style={s.fieldLabel}>Açıklama</Text>
                                <TextInput style={[s.fieldInput, { height:70, textAlignVertical:'top' }]} value={editDescription} onChangeText={setEditDescription} multiline placeholderTextColor={colors.textMuted} />

                                {/* Contact phone */}
                                <Text style={s.fieldLabel}>İletişim Telefonu</Text>
                                <TextInput style={s.fieldInput} value={editContactPhone} onChangeText={setEditContactPhone} keyboardType="phone-pad" placeholderTextColor={colors.textMuted} />

                                {/* Scope */}
                                <Text style={s.fieldLabel}>Kapsam</Text>
                                <View style={s.chipRow}>
                                    {['YEREL','ULUSAL','ULUSLARARASI'].map(sc => (
                                        <TouchableOpacity key={sc} onPress={() => setEditScope(sc)} style={[s.chipBtn, { flex:1 }, editScope===sc && s.chipBtnActive]}>
                                            <Text style={[s.chipBtnText, editScope===sc && s.chipBtnTextActive]}>{sc==='YEREL'?'📍 Yerel':sc==='ULUSAL'?'🇹🇷 Ulusal':'🌍 Uluslararası'}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Gender */}
                                <Text style={s.fieldLabel}>Cinsiyet</Text>
                                <View style={s.chipRow}>
                                    {['MIX','ERKEK','KADIN'].map(g => (
                                        <TouchableOpacity key={g} onPress={() => setEditGenderType(g)} style={[s.chipBtn, { flex:1 }, editGenderType===g && s.chipBtnActive]}>
                                            <Text style={[s.chipBtnText, editGenderType===g && s.chipBtnTextActive]}>{g==='MIX'?'🤝 Mix':g==='ERKEK'?'👨 Erkek':'👩 Kadın'}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                {/* Min / Max players + Rating limits — 4 in a row */}
                                <View style={{ flexDirection:'row', gap:6, marginBottom:14, marginTop:4 }}>
                                    <View style={{ flex:1 }}>
                                        <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>Min Oyuncu</Text>
                                        <TextInput style={[s.fieldInput, { paddingVertical:6, textAlign:'center', fontSize:12 }]} value={editMin} onChangeText={setEditMin} keyboardType="numeric" maxLength={3} />
                                    </View>
                                    <View style={{ flex:1 }}>
                                        <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>Max Oyuncu</Text>
                                        <TextInput style={[s.fieldInput, { paddingVertical:6, textAlign:'center', fontSize:12 }]} value={editMax} onChangeText={setEditMax} keyboardType="numeric" maxLength={3} />
                                    </View>
                                    <TouchableOpacity onPress={() => setEditRf('min')} style={{ flex:1 }}>
                                        <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>⭐ Alt Derece</Text>
                                        <View style={{ backgroundColor: colors.surface2, borderRadius:8, paddingVertical:7, alignItems:'center', borderWidth:1, borderColor: editMinRating ? infoColor : colors.border }}>
                                            <Text style={{ color: editMinRating ? infoColor : colors.textSecondary, fontSize:12, fontWeight:'800' }}>
                                                {editMinRating ? `${editMinRating}★` : '—'}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setEditRf('max')} style={{ flex:1 }}>
                                        <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>⭐ Üst Derece</Text>
                                        <View style={{ backgroundColor: colors.surface2, borderRadius:8, paddingVertical:7, alignItems:'center', borderWidth:1, borderColor: editMaxRating ? infoColor : colors.border }}>
                                            <Text style={{ color: editMaxRating ? infoColor : colors.textSecondary, fontSize:12, fontWeight:'800' }}>
                                                {editMaxRating ? `${editMaxRating}★` : '—'}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                </View>

                                {/* Location */}
                                <Text style={s.fieldLabel}>Konum / Kort</Text>
                                <TextInput style={s.fieldInput} value={editLocation} onChangeText={setEditLocation} placeholder="Kort adı veya adres" placeholderTextColor={colors.textMuted} />

                                {/* Surface */}
                                <Text style={s.fieldLabel}>Zemin</Text>
                                <TextInput style={s.fieldInput} value={editSurface} onChangeText={setEditSurface} placeholder="Kil, Sert, Çim..." placeholderTextColor={colors.textMuted} />

                                {/* Indoor toggle */}
                                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:13 }}>Kapalı Alan</Text>
                                    <Switch value={editIsIndoor} onValueChange={setEditIsIndoor} trackColor={{ true: infoColor }} />
                                </View>

                                {/* Bireysel ve Çiftler Rekabetçi'de geçerli */}
                                {(item.type === '1' || item.type === '2') && (<>
                                    <Text style={s.fieldLabel}>Set Sayısı</Text>
                                    <View style={s.chipRow}>
                                        {['1','3','5'].map(n => (
                                            <TouchableOpacity key={n} onPress={() => setEditSetsPerMatch(n)} style={[s.chipBtn, { flex:1 }, editSetsPerMatch===n && s.chipBtnActive]}>
                                                <Text style={[s.chipBtnText, editSetsPerMatch===n && s.chipBtnTextActive]}>{`Set Sayısı: ${n}`}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <Text style={{ color: colors.textMuted, fontSize:13, marginBottom:6 }}>Sayı Sistemi</Text>
                                    <View style={{ flexDirection:'row', gap:6, marginBottom:14 }}>
                                        {[{v:true,l:'⚡ Avantajlı'},{v:false,l:'🎯 Karar Puanı'},{v:null,l:'🔓 Serbest'}].map(({v,l}) => (
                                            <TouchableOpacity key={String(v)} onPress={() => setEditAdvantageScoring(v)}
                                                style={{ flex:1, borderRadius:8, paddingVertical:6, alignItems:'center', borderWidth:1, backgroundColor: editAdvantageScoring === v ? infoColor+'30' : colors.surface2, borderColor: editAdvantageScoring === v ? infoColor : colors.border }}>
                                                <Text style={{ color: editAdvantageScoring === v ? infoColor : colors.textMuted, fontSize:10, fontWeight:editAdvantageScoring===v?'800':'500' }}>{l}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <Text style={s.fieldLabel}>Play-Off Öncesi Maç Sayısı</Text>
                                    <View style={{ flexDirection:'row', gap:10, alignItems:'center', marginBottom:14 }}>
                                        <TextInput style={[s.fieldInput, { flex:1, textAlign:'center' }]} value={editMatches} onChangeText={v => setEditMatches(v.replace(/[^0-9]/g,''))} keyboardType="numeric" maxLength={2} placeholder="3" placeholderTextColor={colors.textMuted} />
                                        <Text style={{ color: colors.textMuted, fontSize:12 }}>Play-Off Oyuncu:</Text>
                                        <TextInput style={[s.fieldInput, { flex:1, textAlign:'center' }]} value={editQualifiers} onChangeText={v => setEditQualifiers(v.replace(/[^0-9]/g,''))} keyboardType="numeric" maxLength={2} placeholder="4" placeholderTextColor={colors.textMuted} />
                                    </View>
                                </>)}

                                {/* Registration deadline */}
                                <Text style={s.fieldLabel}>📋 Son Başvuru Tarihi</Text>
                                <View style={{ flexDirection:'row', gap:8, marginBottom:14 }}>
                                    <TouchableOpacity onPress={() => { setEditTf(null); setEditDp('regEnd'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor: editRegEndDate ? infoColor+'60' : colors.border, flex:1 }}>
                                        <Text style={{ color: editRegEndDate ? '#fff' : colors.textMuted, fontSize:12 }}>{editRegEndDate ? `${String(editRegEndDate.getDate()).padStart(2,'0')}/${String(editRegEndDate.getMonth()+1).padStart(2,'0')}/${editRegEndDate.getFullYear()}` : 'Tarih'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => { setEditDp(null); setEditTf('regEnd'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor: editRegEndTime ? infoColor+'60' : colors.border }}>
                                        <Text style={{ color: editRegEndTime ? '#fff' : colors.textMuted, fontSize:12 }}>{editRegEndTime || 'Saat'}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Event start date */}
                                <Text style={s.fieldLabel}>🗓️ Etkinlik Başlangıcı</Text>
                                <View style={{ flexDirection:'row', gap:8, marginBottom:14 }}>
                                    <TouchableOpacity onPress={() => { setEditTf(null); setEditDp('evStart'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor: editEventDate ? infoColor+'60' : colors.border, flex:1 }}>
                                        <Text style={{ color: editEventDate ? '#fff' : colors.textMuted, fontSize:12 }}>{editEventDate ? `${String(editEventDate.getDate()).padStart(2,'0')}/${String(editEventDate.getMonth()+1).padStart(2,'0')}/${editEventDate.getFullYear()}` : 'Tarih'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => { setEditDp(null); setEditTf('evStart'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor: editEventTime ? infoColor+'60' : colors.border }}>
                                        <Text style={{ color: editEventTime ? '#fff' : colors.textMuted, fontSize:12 }}>{editEventTime || 'Saat'}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Event end date */}
                                <Text style={s.fieldLabel}>🏁 Tahmini Bitiş</Text>
                                <View style={{ flexDirection:'row', gap:8, marginBottom:14 }}>
                                    <TouchableOpacity onPress={() => { setEditTf(null); setEditDp('evEnd'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor: editEventEndDate ? infoColor+'60' : colors.border, flex:1 }}>
                                        <Text style={{ color: editEventEndDate ? '#fff' : colors.textMuted, fontSize:12 }}>{editEventEndDate ? `${String(editEventEndDate.getDate()).padStart(2,'0')}/${String(editEventEndDate.getMonth()+1).padStart(2,'0')}/${editEventEndDate.getFullYear()}` : 'Tarih'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => { setEditDp(null); setEditTf('evEnd'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, borderWidth:1, borderColor: editEventEndTime ? infoColor+'60' : colors.border }}>
                                        <Text style={{ color: editEventEndTime ? '#fff' : colors.textMuted, fontSize:12 }}>{editEventEndTime || 'Saat'}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Paid toggle */}
                                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:13 }}>💰 Ücretli Turnuva</Text>
                                    <Switch value={editIsPaid} onValueChange={(v) => { setEditIsPaid(v); if (v && editFeeType === 'SPONSORED') setEditFeeType('SHARED'); if (!v && editFeeType === 'INCLUDED') setEditFeeType('SHARED'); }} trackColor={{ true: '#fbbf24' }} />
                                </View>
                                <View style={s.chipRow}>
                                    {(editIsPaid
                                        ? [{id:'INCLUDED',label:'Kort dahil'},{id:'SHARED',label:'Ortaklaşa'}]
                                        : [{id:'SHARED',label:'Ortaklaşa'},{id:'SPONSORED',label:'Sponsorlu'}]
                                    ).map(ft => (
                                        <TouchableOpacity key={ft.id} onPress={() => setEditFeeType(ft.id)} style={[s.chipBtn, { flex:1 }, editFeeType===ft.id && s.chipBtnActive]}>
                                            <Text style={[s.chipBtnText, editFeeType===ft.id && s.chipBtnTextActive]}>{ft.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {editIsPaid && (<>
                                    <View style={{ flexDirection:'row', gap:8, marginBottom:14 }}>
                                        <TextInput style={[s.fieldInput, { flex:1 }]} value={editPlayerFee} onChangeText={setEditPlayerFee} keyboardType="numeric" placeholder="Oyuncu başı ücret (₺)" placeholderTextColor={colors.textMuted} />
                                    </View>
                                    <View style={s.chipRow}>
                                        {[{id:'CASH',label:'💵 Nakit'},{id:'EFT',label:'🏦 EFT'}].map(pm => (
                                            <TouchableOpacity key={pm.id} onPress={() => setEditPaymentMethod(pm.id)} style={[s.chipBtn, { flex:1 }, editPaymentMethod===pm.id && s.chipBtnActive]}>
                                                <Text style={[s.chipBtnText, editPaymentMethod===pm.id && s.chipBtnTextActive]}>{pm.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    {editPaymentMethod === 'EFT' && (<>
                                        <TextInput style={[s.fieldInput, { marginBottom:8 }]} value={editIbanHolder} onChangeText={setEditIbanHolder} placeholder="Hesap Sahibi" placeholderTextColor={colors.textMuted} />
                                        <TextInput style={s.fieldInput} value={editIbanNumber} onChangeText={setEditIbanNumber} placeholder="IBAN" placeholderTextColor={colors.textMuted} />
                                    </>)}
                                </>)}

                                {/* Prizes */}
                                <Text style={s.fieldLabel}>🏆 Ödüller</Text>
                                <TextInput style={[s.fieldInput, { marginBottom:8 }]} value={editPrize1} onChangeText={setEditPrize1} placeholder="🥇 1. Ödül" placeholderTextColor={colors.textMuted} />
                                <TextInput style={[s.fieldInput, { marginBottom:8 }]} value={editPrize2} onChangeText={setEditPrize2} placeholder="🥈 2. Ödül" placeholderTextColor={colors.textMuted} />
                                <TextInput style={s.fieldInput} value={editPrize3} onChangeText={setEditPrize3} placeholder="🥉 3. Ödül" placeholderTextColor={colors.textMuted} />

                                <TouchableOpacity
                                    style={[s.submitBtn, { backgroundColor: infoColor, marginTop:20 }, saving && { opacity:0.6 }]}
                                    onPress={saveEdit} disabled={saving}>
                                    <Text style={s.submitBtnText}>{saving ? 'Kaydediliyor...' : '💾 Kaydet'}</Text>
                                </TouchableOpacity>
                                <View style={{ height:16 }} />
                            </ScrollView>
                        </View>
                    </KeyboardAvoidingView>
                </View>
                {/* Date / time pickers rendered outside the inner modal so they stack on top */}
                <CustomCalendarPicker
                    visible={!!editDp}
                    value={editDp === 'evStart' ? editEventDate : editDp === 'evEnd' ? editEventEndDate : editRegEndDate}
                    onSelect={(date) => {
                        if (editDp === 'evStart') setEditEventDate(date);
                        else if (editDp === 'evEnd') setEditEventEndDate(date);
                        else setEditRegEndDate(date);
                        setEditDp(null);
                    }}
                    onClose={() => setEditDp(null)}
                />
                <TimeGridModal
                    visible={!!editTf}
                    title="Saat Seçin"
                    value={editTf === 'evStart' ? editEventTime : editTf === 'evEnd' ? editEventEndTime : editRegEndTime}
                    onSelect={(v) => {
                        if (editTf === 'evStart') setEditEventTime(v);
                        else if (editTf === 'evEnd') setEditEventEndTime(v);
                        else setEditRegEndTime(v);
                        setEditTf(null);
                    }}
                    onClose={() => setEditTf(null)}
                />
                <RatingPickerModal
                    visible={!!editRf}
                    title={editRf === 'min' ? '⭐ Alt Derece Limiti' : '⭐ Üst Derece Limiti'}
                    value={editRf === 'min' ? editMinRating : editMaxRating}
                    onSelect={(v) => {
                        if (editRf === 'min') setEditMinRating(v);
                        else setEditMaxRating(v);
                        setEditRf(null);
                    }}
                    onClose={() => setEditRf(null)}
                />
            </Modal>

            {/* 24h Late Cancel Reason Modal */}
            <Modal visible={showCancelModal} animationType="slide" transparent onRequestClose={() => setShowCancelModal(false)}>
                <View style={[s.modalOverlay, { justifyContent:'flex-end' }]}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                        <View style={[s.modalBox, { maxHeight:'75%' }]}>
                            <View style={s.modalHeader}>
                                <Text style={s.modalTitle}>⚠️ Geç İptal Talebi</Text>
                                <TouchableOpacity onPress={() => setShowCancelModal(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                            </View>
                            <View style={{ backgroundColor:'#dc262615', borderRadius:10, padding:12, marginBottom:14, borderWidth:1, borderColor:'#dc262640' }}>
                                <Text style={{ color:'#f87171', fontSize:12, fontWeight:'800', marginBottom:6 }}>⚠️ 24 Saat Geç İptal Kuralı</Text>
                                <Text style={{ color:'#fca5a5', fontSize:11, lineHeight:18 }}>
                                    Turnuva başlangıcına 24 saatten az kaldığı için iptal talebiniz turnuva düzenleyicisine iletilecek ve onayına sunulacaktır.
                                    {'\n\n'}Turnuva katılımlarında üçten fazla 24 saat kala iptal ettiğiniz takdirde dördüncü ve sonraki turnuva katılımlarında 24 saatten az kala iptallerinizde -0.50 ELO puanınız düşücek ve beş turnuva katılım yasağınız olucaktır.
                                </Text>
                            </View>
                            <Text style={[s.fieldLabel, { marginBottom:8 }]}>Mazeret (zorunlu)</Text>
                            <TextInput
                                style={[s.fieldInput, { height:90, textAlignVertical:'top', marginBottom:16 }]}
                                value={cancelReasonText}
                                onChangeText={setCancelReasonText}
                                placeholder="İptal nedeninizi açıklayın..."
                                placeholderTextColor={colors.textMuted}
                                multiline
                                maxLength={300}
                            />
                            <TouchableOpacity
                                style={{ backgroundColor:'#dc262630', borderRadius:10, paddingVertical:13, alignItems:'center', borderWidth:1, borderColor:'#dc262660' }}
                                onPress={submitCancelWithReason}>
                                <Text style={{ color:'#f87171', fontSize:14, fontWeight:'800' }}>İptal Talebini Gönder</Text>
                            </TouchableOpacity>
                            <View style={{ height:8 }} />
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {/* Participants / Requests Modal */}
            <Modal visible={showListModal} animationType="slide" onRequestClose={() => setShowListModal(false)}>
                <View style={{ flex:1, backgroundColor: colors.surface, paddingTop: Platform.OS === 'ios' ? 50 : 24 }}>
                    <View style={[s.modalBox, { flex:1, borderRadius:0, maxHeight:undefined }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{isCreator ? 'Başvurular' : 'Katılımcılar'}</Text>
                            <TouchableOpacity onPress={() => setShowListModal(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal:2, flex:1 }}>
                        {isCreator ? (() => {
                            if (loadingRequests) return <ActivityIndicator size="small" color={cfg.color} style={{ marginVertical:16 }} />;
                            if (requests.length === 0) return <Text style={{ color: colors.textMuted, fontSize:13, textAlign:'center', paddingVertical:16 }}>Henüz başvuru yok</Text>;
                            const acceptedEntries = requests.filter(r => r.status === 'ACCEPTED');
                            const mainListCount = item.maxPlayers || acceptedEntries.length;

                            if (item.status === 'IN_PROGRESS') {
                                // Show AS LİSTE / YEDEK LİSTE sections
                                const mainList = acceptedEntries.slice(0, mainListCount);
                                const waitList = acceptedEntries.slice(mainListCount);
                                return (
                                    <View>
                                        <View style={{ backgroundColor:'#16a34a20', borderRadius:8, paddingVertical:6, paddingHorizontal:10, marginBottom:8, borderWidth:1, borderColor:'#16a34a40' }}>
                                            <Text style={{ color:'#4ade80', fontSize:13, fontWeight:'800' }}>✅ AS LİSTE</Text>
                                        </View>
                                        {mainList.length === 0
                                            ? <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', paddingVertical:6 }}>—</Text>
                                            : mainList.map((r, i) => (
                                            <View key={r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth: i < mainList.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40', backgroundColor: r.cancelRequested ? '#f59e0b08' : 'transparent', borderRadius:6 }}>
                                                <View style={{ backgroundColor:'#16a34a20', borderRadius:4, paddingHorizontal:5, paddingVertical:2, marginRight:8, borderWidth:1, borderColor:'#16a34a40' }}>
                                                    <Text style={{ color:'#4ade80', fontSize:9, fontWeight:'800' }}>AS {i+1}</Text>
                                                </View>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.user?.fullName || r.user?.username}</Text>
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                    {r.cancelRequested && <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'700', marginTop:2 }}>⚠️ İptal talep etti</Text>}
                                                </View>
                                                {r.cancelRequested && (
                                                    <View style={{ flexDirection:'row', gap:4 }}>
                                                        <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Onayla', `${r.user?.fullName || r.user?.username} turnuvadan çıkarılacak. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Onayla', style:'destructive', onPress: () => approveCancelRequest(r.userId, true) }])} style={{ backgroundColor:'#16a34a30', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#16a34a50' }}>
                                                            <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Onayla</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Reddet', `${r.user?.fullName || r.user?.username} turnuvada kalmaya devam edecek. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Reddet', style:'destructive', onPress: () => approveCancelRequest(r.userId, false) }])} style={{ backgroundColor:'#dc262630', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#dc262650' }}>
                                                            <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Reddet</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                            </View>
                                        ))}
                                        {waitList.length > 0 && <>
                                            <View style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingVertical:6, paddingHorizontal:10, marginTop:14, marginBottom:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                <Text style={{ color:'#fbbf24', fontSize:13, fontWeight:'800' }}>⏳ YEDEK LİSTE</Text>
                                            </View>
                                            {waitList.map((r, i) => (
                                                <View key={r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth: i < waitList.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40', backgroundColor: r.cancelRequested ? '#f59e0b08' : 'transparent', borderRadius:6 }}>
                                                    <View style={{ backgroundColor:'#f59e0b20', borderRadius:4, paddingHorizontal:5, paddingVertical:2, marginRight:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                        <Text style={{ color:'#fbbf24', fontSize:9, fontWeight:'800' }}>YDK {i+1}</Text>
                                                    </View>
                                                    <View style={{ flex:1 }}>
                                                        <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.user?.fullName || r.user?.username}</Text>
                                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                        {r.cancelRequested && <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'700', marginTop:2 }}>⚠️ İptal talep etti</Text>}
                                                    </View>
                                                    {r.cancelRequested && (
                                                        <View style={{ flexDirection:'row', gap:4 }}>
                                                            <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Onayla', `${r.user?.fullName || r.user?.username} turnuvadan çıkarılacak. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Onayla', style:'destructive', onPress: () => approveCancelRequest(r.userId, true) }])} style={{ backgroundColor:'#16a34a30', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#16a34a50' }}>
                                                                <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Onayla</Text>
                                                            </TouchableOpacity>
                                                            <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Reddet', `${r.user?.fullName || r.user?.username} turnuvada kalmaya devam edecek. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Reddet', style:'destructive', onPress: () => approveCancelRequest(r.userId, false) }])} style={{ backgroundColor:'#dc262630', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#dc262650' }}>
                                                                <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Reddet</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    )}
                                                </View>
                                            ))}
                                        </>}
                                    </View>
                                );
                            }

                            // OPEN status — show AS/YDK labels + PENDING section with action buttons
                            let mainIdx = 0;
                            const isDoubles = item.type === '2';
                            const listRows = isDoubles ? requests.filter(r => r.status !== 'ACCEPTED') : requests;
                            return (
                                <View>
                                {/* Manual participant add input */}
                                <View style={{ flexDirection:'row', gap:8, marginBottom:12 }}>
                                    <TextInput
                                        style={{ flex:1, backgroundColor:'#0f172a', borderRadius:10, borderWidth:1, borderColor:'#3b82f640', color:'#fff', fontSize:13, paddingHorizontal:12, paddingVertical:8 }}
                                        placeholder="İsim gir (manuel ekle)"
                                        placeholderTextColor="#475569"
                                        value={manualName}
                                        onChangeText={setManualName}
                                        returnKeyType="done"
                                        onSubmitEditing={addManualParticipant}
                                    />
                                    <TouchableOpacity onPress={addManualParticipant} disabled={addingManual || !manualName.trim()} style={{ backgroundColor: manualName.trim() ? '#3b82f6' : '#1e293b', borderRadius:10, paddingHorizontal:14, justifyContent:'center', borderWidth:1, borderColor:'#3b82f640' }}>
                                        <Text style={{ color: manualName.trim() ? '#fff' : '#475569', fontSize:12, fontWeight:'800' }}>{addingManual ? '...' : '+ Ekle'}</Text>
                                    </TouchableOpacity>
                                </View>
                                {listRows.map((r, i) => {
                                    const isAccepted = r.status === 'ACCEPTED';
                                    let posLabel = null;
                                    if (isAccepted) {
                                        mainIdx++;
                                        const isMain = mainIdx <= mainListCount;
                                        posLabel = isMain
                                            ? { text: `AS ${mainIdx}`, bg:'#16a34a20', color:'#4ade80', border:'#16a34a40' }
                                            : { text: `YDK ${mainIdx - mainListCount}`, bg:'#f59e0b20', color:'#fbbf24', border:'#f59e0b40' };
                                    }
                                    const prevIsAccepted = i > 0 && listRows[i-1].status === 'ACCEPTED';
                                    const showDivider = i > 0 && r.status === 'PENDING' && prevIsAccepted;
                                    return (
                                        <View key={r.id || r.userId}>
                                        {showDivider && (
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginVertical:8 }}>
                                                <View style={{ flex:1, height:1, backgroundColor: colors.border }} />
                                                <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'700' }}>⏳ Bekleyen Başvurular</Text>
                                                <View style={{ flex:1, height:1, backgroundColor: colors.border }} />
                                            </View>
                                        )}
                                        <View style={{ flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth: i < listRows.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40', backgroundColor: r.cancelRequested ? '#f59e0b08' : 'transparent', borderRadius:6 }}>
                                            {posLabel ? (
                                                <View style={{ backgroundColor: posLabel.bg, borderRadius:4, paddingHorizontal:5, paddingVertical:2, marginRight:8, borderWidth:1, borderColor: posLabel.border }}>
                                                    <Text style={{ color: posLabel.color, fontSize:9, fontWeight:'800' }}>{posLabel.text}</Text>
                                                </View>
                                            ) : (
                                                <Text style={{ color: colors.textMuted, fontSize:11, width:22 }}>{i+1}.</Text>
                                            )}
                                            <View style={{ flex:1 }}>
                                                <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.manualName || r.user?.fullName || r.user?.username}</Text>
                                                {r.manualName
                                                    ? <Text style={{ color:'#3b82f6', fontSize:10, fontWeight:'700' }}>✏️ Manuel</Text>
                                                    : <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                }
                                                {r.cancelRequested && <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'700', marginTop:2 }}>⚠️ İptal talep etti (24s kuralı)</Text>}
                                            </View>
                                            <View style={{ alignItems:'flex-end', gap:4 }}>
                                                {!r.cancelRequested && (
                                                    <View style={{ backgroundColor: r.status === 'ACCEPTED' ? '#16a34a30' : r.status === 'REJECTED' ? '#dc262630' : '#a855f720', borderRadius:6, paddingHorizontal:8, paddingVertical:2 }}>
                                                        <Text style={{ color: r.status === 'ACCEPTED' ? '#4ade80' : r.status === 'REJECTED' ? '#f87171' : '#c084fc', fontSize:10, fontWeight:'700' }}>
                                                            {r.status === 'ACCEPTED' ? '✅ Kabul' : r.status === 'REJECTED' ? '❌ Red' : r.userId === myId ? '⏳ Yönetici onayı bekleniyor' : '⏳ Bekliyor'}
                                                        </Text>
                                                    </View>
                                                )}
                                                {r.cancelRequested && (
                                                    <View style={{ flexDirection:'row', gap:4 }}>
                                                        <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Onayla', `${r.user?.fullName || r.user?.username} turnuvadan çıkarılacak. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Onayla', style:'destructive', onPress: () => approveCancelRequest(r.userId, true) }])} style={{ backgroundColor:'#16a34a30', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#16a34a50' }}>
                                                            <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Onayla</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Reddet', `${r.user?.fullName || r.user?.username} turnuvada kalmaya devam edecek. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Reddet', style:'destructive', onPress: () => approveCancelRequest(r.userId, false) }])} style={{ backgroundColor:'#dc262630', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#dc262650' }}>
                                                            <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Reddet</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                                {r.status === 'PENDING' && !r.cancelRequested && (
                                                    <View style={{ flexDirection:'row', gap:4 }}>
                                                        <TouchableOpacity onPress={() => updateRequest(r.userId, 'ACCEPTED')} style={{ backgroundColor:'#16a34a30', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#16a34a50' }}>
                                                            <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Kabul</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => { setRejectReason(''); setRejectTarget({ userId: r.userId, name: r.user?.fullName || r.user?.username }); }} style={{ backgroundColor:'#dc262630', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#dc262650' }}>
                                                            <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Red</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                                {r.status === 'ACCEPTED' && !r.cancelRequested && (
                                                    <TouchableOpacity onPress={() => r.manualName ? removeManualParticipant(r.id) : removeParticipant(r.userId)} style={{ backgroundColor:'#dc262615', borderRadius:6, paddingHorizontal:6, paddingVertical:3, borderWidth:1, borderColor:'#dc262640' }}>
                                                        <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>Çıkar</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                        </View>
                                    );
                                })}
                                {isDoubles && (() => {
                                    const accepted = requests.filter(r => r.status === 'ACCEPTED');
                                    if (accepted.length === 0) return null;
                                    const { pairs, solos, byUserId } = groupDoublesPairs(accepted);
                                    const { mainSlots, waitSlots } = splitDoublesSlots(pairs, solos, byUserId, item.maxPlayers);
                                    return (
                                        <View style={{ marginTop:14 }}>
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:8 }}>
                                                <View style={{ flex:1, height:1, backgroundColor: colors.border }} />
                                                <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'700' }}>✅ Kabul Edilenler — Çiftler</Text>
                                                <View style={{ flex:1, height:1, backgroundColor: colors.border }} />
                                            </View>
                                            {isRegEnded() && (
                                                <Text style={{ color:'#fbbf24', fontSize:11, textAlign:'center', marginBottom:8 }}>⏳ Son başvuru saati geçti — eşleşmeler otomatik oluşturulacak</Text>
                                            )}
                                            <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
                                                {mainSlots.map((slot, i) => renderDuoCard(slot.a, slot.b, solos, byUserId, true, { text:`AS ${i+1}`, bg:'#16a34a20', color:'#4ade80', border:'#16a34a40' }))}
                                            </View>
                                            {waitSlots.length > 0 && <>
                                                <View style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingVertical:6, paddingHorizontal:10, marginTop:10, marginBottom:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                    <Text style={{ color:'#fbbf24', fontSize:12, fontWeight:'800' }}>⏳ YEDEK LİSTE</Text>
                                                </View>
                                                <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
                                                    {waitSlots.map((slot, i) => renderDuoCard(slot.a, slot.b, solos, byUserId, true, { text:`YDK ${i+1}`, bg:'#f59e0b20', color:'#fbbf24', border:'#f59e0b40' }))}
                                                </View>
                                            </>}
                                        </View>
                                    );
                                })()}
                                </View>
                            );
                        })() : (() => {
                            if (item.type === '2' ? loadingRequests : loadingParticipants) return <ActivityIndicator size="small" color={cfg.color} style={{ marginVertical:16 }} />;
                            const maxP = item.maxPlayers || participants.length;

                            if (item.status === 'IN_PROGRESS') {
                                const mainList = participants.slice(0, maxP);
                                const waitList = participants.slice(maxP);
                                return (
                                    <View>
                                        {myStatus === 'PENDING' && (
                                            <View style={{ backgroundColor:'#a855f715', borderRadius:10, padding:12, marginBottom:12, borderWidth:1, borderColor:'#a855f740', flexDirection:'row', alignItems:'center', gap:8 }}>
                                                <Text style={{ fontSize:20 }}>⏳</Text>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#c084fc', fontSize:13, fontWeight:'800' }}>Başvurunuz alındı</Text>
                                                    <Text style={{ color:'#c084fc', fontSize:11, marginTop:2, opacity:0.85 }}>Turnuva yöneticisinin onayı bekleniyor. Onaylandığında bildirim alacaksınız.</Text>
                                                </View>
                                            </View>
                                        )}
                                        <View style={{ backgroundColor:'#16a34a20', borderRadius:8, paddingVertical:6, paddingHorizontal:10, marginBottom:8, borderWidth:1, borderColor:'#16a34a40' }}>
                                            <Text style={{ color:'#4ade80', fontSize:13, fontWeight:'800' }}>✅ AS LİSTE</Text>
                                        </View>
                                        {mainList.length === 0
                                            ? <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', paddingVertical:6 }}>—</Text>
                                            : mainList.map((r, i) => (
                                            <View key={r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth: i < mainList.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40' }}>
                                                <View style={{ backgroundColor:'#16a34a20', borderRadius:4, paddingHorizontal:5, paddingVertical:2, marginRight:8, borderWidth:1, borderColor:'#16a34a40' }}>
                                                    <Text style={{ color:'#4ade80', fontSize:9, fontWeight:'800' }}>AS {i+1}</Text>
                                                </View>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.user?.fullName || r.user?.username}</Text>
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                </View>
                                            </View>
                                        ))}
                                        {waitList.length > 0 && <>
                                            <View style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingVertical:6, paddingHorizontal:10, marginTop:14, marginBottom:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                <Text style={{ color:'#fbbf24', fontSize:13, fontWeight:'800' }}>⏳ YEDEK LİSTE</Text>
                                            </View>
                                            {waitList.map((r, i) => (
                                                <View key={r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth: i < waitList.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40' }}>
                                                    <View style={{ backgroundColor:'#f59e0b20', borderRadius:4, paddingHorizontal:5, paddingVertical:2, marginRight:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                        <Text style={{ color:'#fbbf24', fontSize:9, fontWeight:'800' }}>YDK {i+1}</Text>
                                                    </View>
                                                    <View style={{ flex:1 }}>
                                                        <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.user?.fullName || r.user?.username}</Text>
                                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                    </View>
                                                </View>
                                            ))}
                                        </>}
                                    </View>
                                );
                            }

                            // OPEN — show AS/YDK labels read-only (or duo-cards for Çiftler Rekabetçi)
                            return (
                                <View>
                                {myStatus === 'PENDING' && (
                                    <View style={{ backgroundColor:'#a855f715', borderRadius:10, padding:12, marginBottom:12, borderWidth:1, borderColor:'#a855f740', flexDirection:'row', alignItems:'center', gap:8 }}>
                                        <Text style={{ fontSize:20 }}>⏳</Text>
                                        <View style={{ flex:1 }}>
                                            <Text style={{ color:'#c084fc', fontSize:13, fontWeight:'800' }}>Başvurunuz alındı</Text>
                                            <Text style={{ color:'#c084fc', fontSize:11, marginTop:2, opacity:0.85 }}>Turnuva yöneticisinin onayı bekleniyor. Onaylandığında bildirim alacaksınız.</Text>
                                        </View>
                                    </View>
                                )}
                                {item.type === '2' ? (() => {
                                    const pending = requests.filter(r => r.status === 'PENDING');
                                    const accepted = requests.filter(r => r.status === 'ACCEPTED');
                                    const { pairs, solos, byUserId } = groupDoublesPairs(accepted);
                                    const { mainSlots, waitSlots } = splitDoublesSlots(pairs, solos, byUserId, item.maxPlayers);
                                    return (
                                        <View>
                                            {pending.length > 0 && (
                                                <View style={{ marginBottom:14 }}>
                                                    <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'700', marginBottom:6 }}>⏳ Bekleyen Başvurular ({pending.length})</Text>
                                                    {pending.map((r, i) => (
                                                        <View key={r.id || r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:6, borderBottomWidth: i < pending.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40' }}>
                                                            <View style={{ flex:1 }}>
                                                                <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }} numberOfLines={1}>{r.user?.fullName || r.user?.username}</Text>
                                                                <Text style={{ color: colors.textMuted, fontSize:10 }} numberOfLines={1}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                            </View>
                                                            <Text style={{ color:'#c084fc', fontSize:10, fontWeight:'700' }}>⏳ Bekliyor</Text>
                                                        </View>
                                                    ))}
                                                </View>
                                            )}
                                            {isRegEnded() && (
                                                <Text style={{ color:'#fbbf24', fontSize:11, textAlign:'center', marginBottom:8 }}>⏳ Son başvuru saati geçti — eşleşmeler otomatik oluşturulacak</Text>
                                            )}
                                            <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
                                                {mainSlots.map((slot, i) => renderDuoCard(slot.a, slot.b, solos, byUserId, false, { text:`AS ${i+1}`, bg:'#16a34a20', color:'#4ade80', border:'#16a34a40' }))}
                                            </View>
                                            {waitSlots.length > 0 && <>
                                                <View style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingVertical:6, paddingHorizontal:10, marginTop:10, marginBottom:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                    <Text style={{ color:'#fbbf24', fontSize:12, fontWeight:'800' }}>⏳ YEDEK LİSTE</Text>
                                                </View>
                                                <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
                                                    {waitSlots.map((slot, i) => renderDuoCard(slot.a, slot.b, solos, byUserId, false, { text:`YDK ${i+1}`, bg:'#f59e0b20', color:'#fbbf24', border:'#f59e0b40' }))}
                                                </View>
                                            </>}
                                        </View>
                                    );
                                })() : participants.map((r, i) => {
                                    const isMain = i < maxP;
                                    const label = isMain ? `AS ${i+1}` : `YDK ${i+1-maxP}`;
                                    const labelColor = isMain ? '#4ade80' : '#fbbf24';
                                    const labelBg = isMain ? '#16a34a20' : '#f59e0b20';
                                    const labelBorder = isMain ? '#16a34a40' : '#f59e0b40';
                                    return (
                                        <View key={r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth: i < participants.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40' }}>
                                            <View style={{ backgroundColor: labelBg, borderRadius:4, paddingHorizontal:5, paddingVertical:2, marginRight:8, borderWidth:1, borderColor: labelBorder }}>
                                                <Text style={{ color: labelColor, fontSize:9, fontWeight:'800' }}>{label}</Text>
                                            </View>
                                            <View style={{ flex:1 }}>
                                                <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.user?.fullName || r.user?.username}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                            </View>
                                        </View>
                                    );
                                })}
                                </View>
                            );
                        })()}
                        <View style={{ height:16 }} />
                        </ScrollView>

                        {/* Reject reason modal (nested) */}
                        <Modal visible={!!rejectTarget} animationType="fade" transparent onRequestClose={() => setRejectTarget(null)}>
                            <View style={{ flex:1, backgroundColor:'#00000080', justifyContent:'center', alignItems:'center', padding:24 }}>
                                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width:'100%' }}>
                                    <View style={{ backgroundColor:'#1e293b', borderRadius:16, padding:20, borderWidth:1, borderColor:'#dc262650' }}>
                                        <Text style={{ color:'#f87171', fontSize:15, fontWeight:'800', marginBottom:4 }}>❌ Başvuruyu Reddet</Text>
                                        <Text style={{ color:'#94a3b8', fontSize:12, marginBottom:14 }}>{rejectTarget?.name} adlı oyuncunun başvurusu reddedilecek.</Text>
                                        <Text style={{ color:'#94a3b8', fontSize:12, marginBottom:6 }}>Red nedeni (opsiyonel):</Text>
                                        <TextInput
                                            style={{ backgroundColor:'#0f172a', borderRadius:10, borderWidth:1, borderColor:'#dc262650', color:'#fff', fontSize:13, padding:12, minHeight:60, textAlignVertical:'top' }}
                                            placeholder="Neden reddediyorsunuz? (isteğe bağlı)"
                                            placeholderTextColor="#475569"
                                            value={rejectReason}
                                            onChangeText={setRejectReason}
                                            multiline
                                            maxLength={200}
                                        />
                                        <View style={{ flexDirection:'row', gap:10, marginTop:16 }}>
                                            <TouchableOpacity onPress={() => setRejectTarget(null)} style={{ flex:1, backgroundColor:'#334155', borderRadius:10, paddingVertical:11, alignItems:'center' }}>
                                                <Text style={{ color:'#94a3b8', fontSize:13, fontWeight:'700' }}>Vazgeç</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={async () => { const t2 = rejectTarget; setRejectTarget(null); await updateRequest(t2.userId, 'REJECTED', rejectReason.trim() || undefined); }} style={{ flex:1, backgroundColor:'#dc262640', borderRadius:10, paddingVertical:11, alignItems:'center', borderWidth:1, borderColor:'#dc262660' }}>
                                                <Text style={{ color:'#f87171', fontSize:13, fontWeight:'800' }}>Reddet</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </KeyboardAvoidingView>
                            </View>
                        </Modal>

                        {/* Partner davet picker (nested) — Çiftler Rekabetçi */}
                        <Modal visible={showInvitePicker} animationType="fade" transparent onRequestClose={() => setShowInvitePicker(false)}>
                            <View style={{ flex:1, backgroundColor:'#00000080', justifyContent:'center', alignItems:'center', padding:24 }}>
                                <View style={{ backgroundColor:'#1e293b', borderRadius:16, padding:20, borderWidth:1, borderColor: cfg.color+'40', width:'100%', maxHeight:'70%' }}>
                                    <Text style={{ color:'#fff', fontSize:15, fontWeight:'800', marginBottom:12 }}>👥 Partner Davet Et</Text>
                                    <ScrollView>
                                        {inviteCandidates.length === 0 ? (
                                            <Text style={{ color: colors.textMuted, fontSize:13, textAlign:'center', paddingVertical:16 }}>Davet edilebilecek bireysel başvuran yok</Text>
                                        ) : inviteCandidates.map(c => (
                                            <TouchableOpacity key={c.userId} onPress={() => setMyTournamentPartner(c.userId)} disabled={partnerActionLoading} style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}>
                                                <Avatar name={c.user?.username} avatar={c.user?.avatar} size={moderateScale(34)} color={cfg.color} />
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{c.user?.fullName || c.user?.username}</Text>
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>@{c.user?.username}{c.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(c.user.interests[0].skillRating))} ${Number(c.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                    <TouchableOpacity onPress={() => setShowInvitePicker(false)} style={{ marginTop:14, backgroundColor:'#334155', borderRadius:10, paddingVertical:11, alignItems:'center' }}>
                                        <Text style={{ color:'#94a3b8', fontSize:13, fontWeight:'700' }}>Vazgeç</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </Modal>
                    </View>
                </View>
            </Modal>

            {/* Turnuva grup sohbeti — sahip + AS/yedek onaylanmış katılımcılar */}
            <Modal visible={showChatModal} animationType="slide" transparent onRequestClose={() => setShowChatModal(false)}>
                <View style={{ flex:1, backgroundColor:'#00000080', justifyContent:'flex-end' }}>
                    <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
                        <View style={{ backgroundColor:'#0f172a', borderTopLeftRadius:20, borderTopRightRadius:20, padding:16, height:520 }}>
                            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                                <Text style={{ color:'#fff', fontSize:15, fontWeight:'900' }}>💬 Turnuva Sohbeti</Text>
                                <View style={{ flexDirection:'row', alignItems:'center', gap:14 }}>
                                    <TouchableOpacity onPress={toggleChatNotify} disabled={togglingChatNotify}>
                                        <Text style={{ fontSize:20, opacity: togglingChatNotify ? 0.5 : 1 }}>{chatNotifyEnabled ? '🔔' : '🔕'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowChatModal(false)}><Text style={{ color: colors.textMuted, fontSize:20 }}>✕</Text></TouchableOpacity>
                                </View>
                            </View>
                            {loadingChat ? (
                                <ActivityIndicator color="#4ade80" style={{ marginTop:30 }} />
                            ) : (
                                <ScrollView style={{ flex:1 }} contentContainerStyle={{ paddingBottom:10 }}>
                                    {chatMessages.length === 0
                                        ? <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:30 }}>Henüz mesaj yok</Text>
                                        : chatMessages.map(m => {
                                            const mine = (m.sender?.id || m.senderId) === myId;
                                            return (
                                                <View key={m.id} style={{ marginBottom:10, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                                                    {!mine && <Text style={{ color: colors.textMuted, fontSize:10, marginBottom:2 }}>{m.sender?.fullName || m.sender?.username}</Text>}
                                                    <View style={{ backgroundColor: mine ? '#16a34a30' : '#1e293b', borderRadius:10, paddingHorizontal:10, paddingVertical:7, maxWidth:'80%', borderWidth:1, borderColor: mine ? '#16a34a50' : colors.border }}>
                                                        <Text style={{ color:'#fff', fontSize:13 }}>{m.content}</Text>
                                                    </View>
                                                </View>
                                            );
                                        })
                                    }
                                </ScrollView>
                            )}
                            <View style={{ flexDirection:'row', gap:8, marginTop:8, alignItems:'flex-end' }}>
                                <TextInput
                                    style={{ flex:1, backgroundColor:'#1e293b', color:'#fff', borderRadius:10, paddingHorizontal:12, paddingVertical:9, borderWidth:1, borderColor: colors.border, fontSize:13, maxHeight:80 }}
                                    placeholder="Mesaj yaz..."
                                    placeholderTextColor="#475569"
                                    value={chatInput}
                                    onChangeText={setChatInput}
                                    multiline
                                    maxLength={500}
                                />
                                <TouchableOpacity
                                    onPress={sendChatMessage}
                                    disabled={sendingChat || !chatInput.trim()}
                                    style={{ backgroundColor:'#16a34a', borderRadius:10, paddingHorizontal:14, paddingVertical:10, opacity: (sendingChat || !chatInput.trim()) ? 0.5 : 1 }}>
                                    <Text style={{ color:'#fff', fontWeight:'800', fontSize:13 }}>{sendingChat ? '...' : t.sendBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        </View>
                    </KeyboardAvoidingView>
                </View>
            </Modal>

            {item.description && <Text style={{ color: colors.textSecondary, fontSize:12, marginTop:6 }}>{item.description}</Text>}

            {/* Rules toggle */}
            <TouchableOpacity onPress={() => setShowRules(v => !v)} style={{ marginTop:8 }}>
                <Text style={{ color: infoColor, fontSize:11, fontWeight:'700' }}>
                    {showRules ? '▲ ' : '▼ '}{t.tournRulesLabel}
                </Text>
            </TouchableOpacity>
            {showRules && (
                <View style={{ backgroundColor:'#1e293b', borderRadius:8, padding:10, marginTop:6, borderWidth:1, borderColor: colors.border }}>
                        <Text style={{ color: colors.textSecondary, fontSize:11, lineHeight:17 }}>{t['tournRules' + item.type]}</Text>
                </View>
            )}

            {/* Demo button (creator only) */}
            {isCreator && (
                <TouchableOpacity
                    style={[s.joinBtn, { marginTop:10, backgroundColor: demoRunning ? '#dc262620' : '#7c3aed20', borderColor: demoRunning ? '#dc262650' : '#7c3aed50' }]}
                    onPress={demoRunning ? stopDemo : startDemo}>
                    <Text style={[s.joinBtnText, { color: demoRunning ? '#f87171' : '#a78bfa' }]}>
                        {demoRunning ? `⏸ Durdur (${demoIdx}/40)` : `🤖 Demo (${demoIdx}/40)`}
                    </Text>
                </TouchableOpacity>
            )}
        </View>

        {/* Çiftler Rekabetçi — partner arama modali */}
        <Modal visible={showPartnerSearch} animationType="slide" transparent onRequestClose={() => setShowPartnerSearch(false)}>
            <View style={{ flex:1, backgroundColor:'#00000080', justifyContent:'flex-end' }}>
                <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:20, paddingTop:20, paddingBottom:40, maxHeight:'80%' }}>
                    <View style={{ flexDirection:'row', alignItems:'center', marginBottom:14 }}>
                        <Text style={{ color:'#fff', fontSize:16, fontWeight:'800', flex:1 }}>{t.tournPartnerChoose || 'Partner Seç'}</Text>
                        <TouchableOpacity onPress={() => { setShowPartnerSearch(false); setPartnerQuery(''); setPartnerResults([]); }}>
                            <Text style={{ color: colors.textMuted, fontSize:20 }}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <TextInput
                        style={s.fieldInput}
                        value={partnerQuery}
                        onChangeText={setPartnerQuery}
                        placeholder={t.inviteSearchPh}
                        placeholderTextColor={colors.textMuted}
                        autoFocus
                    />
                    {partnerSearching && <ActivityIndicator color={cfg.color} style={{ marginTop:12 }} />}
                    <ScrollView style={{ marginTop:8 }} keyboardShouldPersistTaps="handled">
                        {partnerResults.map(u => (
                            <TouchableOpacity key={u.id} onPress={() => choosePartner(u)} style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:10, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}>
                                <Avatar name={u.username} avatar={u.avatar} size={36} color={cfg.color} />
                                <View style={{ flex:1 }}>
                                    <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>{u.interests?.[0]?.alias || u.fullName || u.username}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                        @{u.username}{u.interests?.[0]?.skillRating != null ? `  ${Number(u.interests[0].skillRating).toFixed(2)} ★` : ''}
                                    </Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                        {!partnerSearching && partnerQuery.trim().length >= 2 && partnerResults.length === 0 && (
                            <Text style={{ color: colors.textMuted, textAlign:'center', marginTop:16, fontSize:13 }}>{t.inviteNoResults}</Text>
                        )}
                    </ScrollView>
                </View>
            </View>
        </Modal>
        </>
    );
}

// ─── Create Tournament Modal ───────────────────────────────────────────────────
const TIME_SLOTS = Array.from({ length: 48 }, (_, i) =>
    `${String(Math.floor(i / 2)).padStart(2, '0')}:${i % 2 === 0 ? '00' : '30'}`
);

function TournamentPermissionModal({ visible, onClose, onStatusChange }) {
    const t = useT();
    const [status, setStatus] = useState(null);
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setLoading(true);
        api.get('/tournaments/permission-status')
            .then(r => { setStatus(r.data.status); onStatusChange?.(r.data.status); })
            .catch(() => setStatus('NONE'))
            .finally(() => setLoading(false));
    }, [visible]);

    const sendRequest = async () => {
        setSending(true);
        try {
            const r = await api.post('/tournaments/permission-request');
            setStatus(r.data.status);
            onStatusChange?.(r.data.status);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setSending(false); }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={tp.overlay}>
                <View style={tp.box}>
                    <View style={tp.header}>
                        <Text style={tp.title}>🏆 Turnuva Oluşturma</Text>
                        <TouchableOpacity onPress={onClose}><Text style={tp.close}>✕</Text></TouchableOpacity>
                    </View>

                    {loading ? (
                        <ActivityIndicator color={colors.purple} style={{ marginVertical: 40 }} />
                    ) : (
                        <>
                            <Text style={tp.desc}>
                                Turnuva oluşturmak için admin onayı gereklidir.
                            </Text>

                            {status === 'NONE' && (
                                <>
                                    <Text style={tp.sub}>
                                        Admin'e başvurarak turnuva oluşturma izni talep edebilirsiniz.
                                    </Text>
                                    <TouchableOpacity style={tp.btn} onPress={sendRequest} disabled={sending}>
                                        {sending
                                            ? <ActivityIndicator color="#fff" />
                                            : <Text style={tp.btnText}>📩 Admin'e Başvur</Text>
                                        }
                                    </TouchableOpacity>
                                </>
                            )}

                            {status === 'PENDING' && (
                                <View style={tp.statusBox}>
                                    <Text style={tp.statusEmoji}>⏳</Text>
                                    <Text style={tp.statusTitle}>Başvurunuz İnceleniyor</Text>
                                    <Text style={tp.statusDesc}>Admin talebinizi değerlendirdiğinde bildirim alacaksınız.</Text>
                                </View>
                            )}

                            {status === 'REJECTED' && (
                                <>
                                    <View style={[tp.statusBox, { borderColor: '#ef444440' }]}>
                                        <Text style={tp.statusEmoji}>❌</Text>
                                        <Text style={[tp.statusTitle, { color: '#ef4444' }]}>Başvuru Reddedildi</Text>
                                        <Text style={tp.statusDesc}>Talebiniz admin tarafından reddedildi. Yeniden başvurabilirsiniz.</Text>
                                    </View>
                                    <TouchableOpacity style={tp.btn} onPress={sendRequest} disabled={sending}>
                                        {sending
                                            ? <ActivityIndicator color="#fff" />
                                            : <Text style={tp.btnText}>📩 Yeniden Başvur</Text>
                                        }
                                    </TouchableOpacity>
                                </>
                            )}
                        </>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const tp = StyleSheet.create({
    overlay:     { flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' },
    box:         { backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:20, paddingTop:20, paddingBottom:48 },
    header:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
    title:       { color:'#fff', fontSize:17, fontWeight:'900' },
    close:       { color: colors.textMuted, fontSize:22 },
    desc:        { color:'#fff', fontSize:14, fontWeight:'700', marginBottom:8 },
    sub:         { color: colors.textSecondary, fontSize:13, lineHeight:19, marginBottom:24 },
    btn:         { backgroundColor: colors.purple, borderRadius:14, paddingVertical:15, alignItems:'center' },
    btnText:     { color:'#fff', fontSize:15, fontWeight:'800' },
    statusBox:   { borderWidth:1, borderColor: colors.border, borderRadius:16, padding:20, alignItems:'center', marginBottom:24, gap:8 },
    statusEmoji: { fontSize:36 },
    statusTitle: { color:'#fff', fontSize:15, fontWeight:'800' },
    statusDesc:  { color: colors.textSecondary, fontSize:13, textAlign:'center', lineHeight:18 },
});

const TOURN_TYPES   = ['1', '2', '3'];
const TOURN_SCOPES  = ['YEREL', 'ULUSAL', 'ULUSLARARASI'];
const TOURN_GENDERS = ['KADIN', 'ERKEK', 'MIX'];

const TOURNAMENT_RULES = [];

function CreateTournamentModal({ visible, onClose, category, sub, onCreated }) {
    const t = useT();
    const cfg = getConfig(sub);

    const INIT = {
        name: '', scope: 'YEREL', scopeCity: '', scopeDistrict: '', scopeCountry: '',
        type: '1', minPlayers: '', maxPlayers: '', minRating: '', maxRating: '',
        matchmakingType: 'ELO', matchFrequency: 'FLEXIBLE', matchTimeStart: '', matchTimeEnd: '',
        eventStartDate: null, eventStartTime: '',
        eventEndDate:   null, eventEndTime:   '',
        regEndDate: null, regEndTime: '',
        courtDecidedByPlayers: true,
        courtSearchText: '', courtResults: [], selectedCourt: null,
        showManualCourt: false, manualCourtName: '', manualCourtCity: '',
        isIndoor: false,
        genderType: 'MIX',
        surface: '', isPaid: false,
        feeType: 'SHARED', playerFee: '', paymentMethod: '', ibanNumber: '', ibanHolder: '',
        prize1: '', prize2: '', prize3: '', contactPhone: '', description: '',
        setsPerMatch: '3', advantageScoring: true,
        matchesBeforePlayoff: '', playoffQualifiers: '',
        rules: [],
    };

    const [f, setF] = useState(INIT);
    const [searching, setSearching] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [citySuggestions, setCitySuggestions] = useState([]);
    const [districtSuggestions, setDistrictSuggestions] = useState([]);
    const set = (key, val) => setF(p => ({ ...p, [key]: val }));

    const searchCityProvince = async (text) => {
        set('scopeCity', text);
        set('scopeDistrict', '');
        if (text.length < 1) { setCitySuggestions([]); return; }
        try {
            const { data } = await api.get('/cities', { params: { q: text } });
            const provinces = [...new Set(data.map(c => c.province))];
            setCitySuggestions(provinces);
        } catch { setCitySuggestions([]); }
    };

    const searchDistrict = async (text) => {
        set('scopeDistrict', text);
        if (!f.scopeCity.trim() || text.length < 1) { setDistrictSuggestions([]); return; }
        try {
            const { data } = await api.get('/cities', { params: { province: f.scopeCity.trim(), q: text } });
            setDistrictSuggestions(data.filter(c => c.district).map(c => c.district));
        } catch { setDistrictSuggestions([]); }
    };

    // null | 'evStart' | 'evEnd' | 'start' | 'end'
    const [dpField, setDpField] = useState(null);
    const [timeField, setTimeField] = useState(null);
    const [ratingField, setRatingField] = useState(null); // null | 'min' | 'max'

    const fmtISO = (d) => d
        ? `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
        : undefined;

    // Compact input style for this modal
    const ti = { paddingVertical:7, paddingHorizontal:10, fontSize:12, marginBottom:8 };

    const searchCourts = async (text) => {
        set('courtSearchText', text);
        set('selectedCourt', null);
        if (text.length < 2) { set('courtResults', []); return; }
        setSearching(true);
        try {
            const { data } = await api.get('/courts/search', { params: { q: text, sport: sub } });
            set('courtResults', Array.isArray(data) ? data : []);
        } catch { set('courtResults', []); }
        finally { setSearching(false); }
    };

    const selectCourt = (court) => {
        setF(p => ({
            ...p, selectedCourt: court, courtSearchText: court.name,
            courtResults: [], showManualCourt: false,
            manualCourtCity: court.city || '',
            surface: court.surface || p.surface,
        }));
    };

    const reset = () => setF(INIT);

    const submit = async () => {
        if (!f.name.trim()) { Alert.alert('', t.tournMissingName); return; }
        if (f.scope === 'YEREL' && !f.scopeCity.trim()) { Alert.alert('', t.tournMissingCity); return; }
        if (f.scope === 'ULUSAL' && !f.scopeCountry.trim()) { Alert.alert('', t.tournMissingCountry); return; }
        if (!f.regEndDate) { Alert.alert('', t.tournMissingRegEnd); return; }

        if (f.isPaid && (!f.prize1.trim() || !f.prize2.trim() || !f.prize3.trim())) { Alert.alert('', t.tournMissingPrizes); return; }
        if (f.isPaid && !f.paymentMethod) { Alert.alert('', 'Ödeme yöntemini seçin.'); return; }
        if (f.isPaid && f.paymentMethod === 'EFT' && (!f.ibanNumber.trim() || !f.ibanHolder.trim())) { Alert.alert('', 'IBAN numarası ve hesap sahibi adını girin.'); return; }

        const province = f.scopeCity.trim();
        const district = f.scopeDistrict.trim();
        const cityVal = f.scope === 'YEREL'
            ? (district ? `${province} / ${district}` : province)
            : f.scope === 'ULUSAL' ? f.scopeCountry.trim() : 'Dünya';

        // Auto-submit city for approval (silent — don't block tournament creation)
        if (f.scope === 'YEREL' && province) {
            api.post('/cities', { province, district: district || undefined }).catch(() => {});
        }

        const courtName = f.courtDecidedByPlayers ? null
            : f.selectedCourt?.name || (f.showManualCourt ? f.manualCourtName : null) || f.courtSearchText || null;

        if (!f.courtDecidedByPlayers && f.showManualCourt && f.manualCourtName && !f.selectedCourt) {
            try {
                await api.post('/courts', {
                    name: f.manualCourtName, city: f.manualCourtCity || cityVal || '',
                    sport: sub, surface: f.surface || undefined,
                });
            } catch { /* silent */ }
        }

        setSubmitting(true);
        try {
            await api.post('/tournaments', {
                name: f.name.trim(), type: f.type, category, subCategory: sub,
                scope: f.scope, genderType: f.genderType, city: cityVal,
                minRating: f.minRating !== '' ? parseFloat(f.minRating) : undefined,
                maxRating: f.maxRating !== '' ? parseFloat(f.maxRating) : undefined,
                matchmakingType: f.matchmakingType || 'ELO',
                matchFrequency: f.matchFrequency || 'FLEXIBLE',
                matchTimeStart: f.matchTimeStart || undefined,
                matchTimeEnd: f.matchTimeEnd || undefined,
                minPlayers: f.minPlayers ? parseInt(f.minPlayers) : undefined,
                maxPlayers: f.maxPlayers ? parseInt(f.maxPlayers) : undefined,
                location: courtName || undefined,
                surface: f.surface || undefined,
                isIndoor: f.courtDecidedByPlayers ? undefined : f.isIndoor,
                isPaid: f.isPaid,
                feeType: f.feeType,
                ...(f.isPaid && {
                    playerFee: f.playerFee ? parseFloat(f.playerFee) : undefined,
                    paymentMethod: f.paymentMethod || undefined,
                    ibanNumber: f.paymentMethod === 'EFT' ? f.ibanNumber.trim() || undefined : undefined,
                    ibanHolder: f.paymentMethod === 'EFT' ? f.ibanHolder.trim() || undefined : undefined,
                }),
                prize1: f.prize1.trim() || undefined,
                prize2: f.prize2.trim() || undefined,
                prize3: f.prize3.trim() || undefined,
                contactPhone: f.contactPhone.trim() || undefined,
                ...((f.type === '1' || f.type === '2') && {
                    setsPerMatch: f.setsPerMatch ? parseInt(f.setsPerMatch) : undefined,
                    advantageScoring: f.advantageScoring,
                    matchesBeforePlayoff: f.matchesBeforePlayoff ? parseInt(f.matchesBeforePlayoff) : undefined,
                    playoffQualifiers: f.playoffQualifiers ? parseInt(f.playoffQualifiers) : undefined,
                }),
                eventDate: fmtISO(f.eventStartDate),
                eventTime: f.eventStartTime || undefined,
                eventEndDate: fmtISO(f.eventEndDate),
                eventEndTime: f.eventEndTime || undefined,
                endDate: fmtISO(f.regEndDate),
                endTime: f.regEndTime || undefined,
                rules: f.rules,
                description: f.description.trim() || undefined,
            });
            reset();
            onClose();
            onCreated();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        } finally { setSubmitting(false); }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={s.modalOverlay}>
                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex:1, justifyContent:'flex-end' }}>
                    <View style={s.modalBox}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t.createTournamentTitle}</Text>
                            <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* Name */}
                            <Text style={s.fieldLabel}>{t.tournNameLabel}</Text>
                            <TextInput style={[s.fieldInput, ti]} value={f.name} onChangeText={v => set('name', v)}
                                placeholder={t.tournNamePh} placeholderTextColor={colors.textMuted} />

                            {/* Scope */}
                            <Text style={s.fieldLabel}>{t.tournScopeLabel}</Text>
                            <View style={[s.chipRow, { marginBottom:8 }]}>
                                {TOURN_SCOPES.map(sc => (
                                    <TouchableOpacity key={sc}
                                        style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, f.scope === sc && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                        onPress={() => set('scope', sc)}>
                                        <Text style={[s.chipText, f.scope === sc && { color: cfg.color, fontWeight:'800' }]}>
                                            {t['tournScope' + sc.charAt(0) + sc.slice(1).toLowerCase()]}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {f.scope === 'YEREL' && (
                                <>
                                    <Text style={s.fieldLabel}>{t.tournCityLabel}</Text>
                                    <TextInput style={[s.fieldInput, ti]} value={f.scopeCity}
                                        onChangeText={searchCityProvince}
                                        placeholder={t.tournCityPh} placeholderTextColor={colors.textMuted} />
                                    {citySuggestions.length > 0 && (
                                        <View style={s.courtResultsBox}>
                                            {citySuggestions.map(p => (
                                                <TouchableOpacity key={p} style={s.courtResultRow}
                                                    onPress={() => { set('scopeCity', p); setCitySuggestions([]); }}>
                                                    <Text style={s.courtResultName}>📍 {p}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                    <Text style={s.fieldLabel}>{t.tournDistrictLabel}</Text>
                                    <TextInput style={[s.fieldInput, ti]} value={f.scopeDistrict}
                                        onChangeText={searchDistrict}
                                        placeholder={t.tournDistrictPh} placeholderTextColor={colors.textMuted} />
                                    {districtSuggestions.length > 0 && (
                                        <View style={s.courtResultsBox}>
                                            {districtSuggestions.map(d => (
                                                <TouchableOpacity key={d} style={s.courtResultRow}
                                                    onPress={() => { set('scopeDistrict', d); setDistrictSuggestions([]); }}>
                                                    <Text style={s.courtResultName}>🏘️ {d}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    )}
                                </>
                            )}
                            {f.scope === 'ULUSAL' && (
                                <>
                                    <Text style={s.fieldLabel}>{t.tournCountryLabel}</Text>
                                    <TextInput style={[s.fieldInput, ti]} value={f.scopeCountry} onChangeText={v => set('scopeCountry', v)}
                                        placeholder={t.tournCountryPh} placeholderTextColor={colors.textMuted} />
                                </>
                            )}
                            {f.scope === 'ULUSLARARASI' && (
                                <View style={{ backgroundColor: cfg.color + '15', borderRadius:8, padding:8, marginBottom:8, borderWidth:1, borderColor: cfg.color + '40' }}>
                                    <Text style={{ color: cfg.color, fontSize:12, fontWeight:'700' }}>{t.tournWorldAuto}</Text>
                                </View>
                            )}

                            {/* Court */}
                            <Text style={s.fieldLabel}>{t.tournCourtLabel}</Text>
                            <View style={[s.chipRow, { marginBottom:8 }]}>
                                <TouchableOpacity
                                    style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, !f.courtDecidedByPlayers && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                    onPress={() => set('courtDecidedByPlayers', false)}>
                                    <Text style={[s.chipText, !f.courtDecidedByPlayers && { color: cfg.color, fontWeight:'800' }]}>{t.tournCourtSpecific}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, f.courtDecidedByPlayers && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                    onPress={() => { set('courtDecidedByPlayers', true); if (f.paymentMethod === 'CASH') set('paymentMethod', ''); }}>
                                    <Text style={[s.chipText, f.courtDecidedByPlayers && { color: cfg.color, fontWeight:'800' }]}>{t.tournCourtPlayersDecide}</Text>
                                </TouchableOpacity>
                            </View>
                            {!f.courtDecidedByPlayers && (
                                <>
                                    <View style={{ flexDirection:'row', alignItems:'center', gap:4, marginBottom:6 }}>
                                        <TextInput style={[s.fieldInput, ti, { flex:1, marginBottom:0 }]} value={f.courtSearchText}
                                            onChangeText={searchCourts} placeholder={t.courtSearchPlaceholder}
                                            placeholderTextColor={colors.textMuted} />
                                        {searching && <ActivityIndicator size="small" color={cfg.color} />}
                                    </View>
                                    {f.courtResults.length > 0 && !f.selectedCourt && (
                                        <View style={s.courtResultsBox}>
                                            {f.courtResults.map(c => (
                                                <TouchableOpacity key={c.id} style={s.courtResultRow} onPress={() => selectCourt(c)}>
                                                    <Text style={s.courtResultName}>{c.name}</Text>
                                                    {c.city ? <Text style={s.courtResultCity}>{c.city}</Text> : null}
                                                </TouchableOpacity>
                                            ))}
                                            {f.courtSearchText.length > 1 && (
                                                <TouchableOpacity style={s.courtResultRow}
                                                    onPress={() => { set('showManualCourt', true); set('courtResults', []); }}>
                                                    <Text style={{ color: cfg.color, fontSize:12, fontWeight:'700' }}>{t.useThisName(f.courtSearchText)}</Text>
                                                </TouchableOpacity>
                                            )}
                                        </View>
                                    )}
                                    {f.selectedCourt && (
                                        <View style={s.selectedCourtBox}>
                                            <Text style={s.selectedCourtText}>✅ {f.selectedCourt.name}</Text>
                                            <TouchableOpacity onPress={() => { set('selectedCourt', null); set('courtSearchText', ''); set('courtResults', []); }}>
                                                <Text style={{ color: colors.textMuted, fontSize:12 }}>✕</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    {f.showManualCourt && !f.selectedCourt && (
                                        <View style={{ backgroundColor: colors.surface2, borderRadius:8, padding:10, marginBottom:8, borderWidth:1, borderColor: colors.border }}>
                                            <TextInput style={[s.fieldInput, ti]} value={f.manualCourtName}
                                                onChangeText={v => set('manualCourtName', v)}
                                                placeholder={t.manualCourtLabel} placeholderTextColor={colors.textMuted} />
                                            <TextInput style={[s.fieldInput, ti]} value={f.manualCourtCity}
                                                onChangeText={v => set('manualCourtCity', v)}
                                                placeholder={t.manualCityLabel} placeholderTextColor={colors.textMuted} />
                                            <TouchableOpacity onPress={() => set('showManualCourt', false)}>
                                                <Text style={{ color: colors.textMuted, fontSize:11, marginTop:2 }}>{t.closeCourt}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    {/* Surface (tennis / padel) */}
                                    {(sub === 'tennis' || sub === 'padel') && (
                                        <>
                                            <Text style={s.fieldLabel}>{t.tournSurfaceLabel}</Text>
                                            <View style={[s.chipRow, { marginBottom:8 }]}>
                                                {(sub === 'padel' ? PADEL_SURFACES : TENNIS_SURFACES).map(sf => (
                                                    <TouchableOpacity key={sf.id}
                                                        style={[s.chip, { paddingVertical:5, paddingHorizontal:8 }, f.surface === sf.id && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                                        onPress={() => set('surface', f.surface === sf.id ? '' : sf.id)}>
                                                        <Text style={[s.chipText, f.surface === sf.id && { color: cfg.color, fontWeight:'800' }]}>{sf.emoji} {t['surface' + sf.id]}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </>
                                    )}
                                    {/* Indoor / Outdoor */}
                                    <Text style={s.fieldLabel}>{t.venueLabel}</Text>
                                    <View style={[s.chipRow, { marginBottom:8 }]}>
                                        <TouchableOpacity
                                            style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, !f.isIndoor && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('isIndoor', false)}>
                                            <Text style={[s.chipText, !f.isIndoor && { color: cfg.color, fontWeight:'800' }]}>{t.outdoor}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, f.isIndoor && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('isIndoor', true)}>
                                            <Text style={[s.chipText, f.isIndoor && { color: cfg.color, fontWeight:'800' }]}>{t.indoor}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}

                            {/* Son Başvuru | Cinsiyet | Set — tek satır */}
                            <View style={{ flexDirection:'row', gap:5, alignItems:'flex-end', marginBottom:8 }}>
                                {/* Son Başvuru */}
                                <View style={{ width:110 }}>
                                    <Text style={s.fieldLabel}>{t.tournRegEndLabel} *</Text>
                                    <View style={{ flexDirection:'row', gap:2 }}>
                                        <TouchableOpacity
                                            style={[s.triBtn, f.regEndDate && s.triBtnFilled, { flex:1, paddingVertical:6, paddingHorizontal:4 }]}
                                            onPress={() => { setTimeField(null); setDpField('end'); }}>
                                            <Text style={[s.triLabel, { fontSize:8 }]}>{t.dateLabel}</Text>
                                            <Text style={[s.triValue, !f.regEndDate && s.triPlaceholder, { fontSize:10 }]} numberOfLines={1}>
                                                {f.regEndDate ? `${String(f.regEndDate.getDate()).padStart(2,'0')}/${String(f.regEndDate.getMonth()+1).padStart(2,'0')}` : '—'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.triBtn, f.regEndTime && s.triBtnFilled, { paddingVertical:6, paddingHorizontal:5 }]}
                                            onPress={() => { setDpField(null); setTimeField('end'); }}>
                                            <Text style={[s.triLabel, { fontSize:8 }]}>{t.timeLabel}</Text>
                                            <Text style={[s.triValue, !f.regEndTime && s.triPlaceholder, { fontSize:10 }]}>{f.regEndTime || '—'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                {/* Cinsiyet */}
                                <View style={{ flex:1 }}>
                                    <Text style={s.fieldLabel}>{t.tournGenderLabel}</Text>
                                    <View style={{ flexDirection:'row', gap:2 }}>
                                        {TOURN_GENDERS.map(g => (
                                            <TouchableOpacity key={g}
                                                style={[s.chip, { flex:1, paddingVertical:5, paddingHorizontal:2, justifyContent:'center', alignItems:'center' }, f.genderType === g && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                                onPress={() => set('genderType', g)}>
                                                <Text style={[s.chipText, { fontSize:10, textAlign:'center' }, f.genderType === g && { color: cfg.color, fontWeight:'800' }]}>
                                                    {t['tournGender' + g.charAt(0) + g.slice(1).toLowerCase()]}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                                {/* Set */}
                                <View style={{ width:48 }}>
                                    <Text style={s.fieldLabel}>{t.tournSetsLabel}</Text>
                                    <TextInput
                                        style={[s.fieldInput, ti, { marginBottom:0, textAlign:'center', paddingHorizontal:4 }]}
                                        value={f.setsPerMatch}
                                        onChangeText={v => set('setsPerMatch', v.replace(/[^0-9]/g, '').slice(0, 1))}
                                        placeholder="3"
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType="numeric"
                                        maxLength={1}
                                    />
                                </View>
                            </View>
                            <CustomCalendarPicker
                                visible={dpField === 'end'}
                                value={f.regEndDate}
                                onSelect={(date) => { set('regEndDate', date); setDpField(null); }}
                                onClose={() => setDpField(null)}
                            />
                            <TimeGridModal
                                visible={timeField === 'end'}
                                title={t.tournRegEndLabel}
                                value={f.regEndTime}
                                onSelect={(v) => { set('regEndTime', v); setTimeField(null); }}
                                onClose={() => setTimeField(null)}
                            />

                            {/* Event start | end — side by side */}
                            <View style={{ flexDirection:'row', gap:6, marginBottom:8 }}>
                                {[
                                    { field:'evStart', label: t.tournEventStartLabel, dateVal: f.eventStartDate, timeVal: f.eventStartTime },
                                    { field:'evEnd',   label: t.tournEventEndLabel,   dateVal: f.eventEndDate,   timeVal: f.eventEndTime   },
                                ].map(({ field, label, dateVal, timeVal }) => (
                                    <View key={field} style={{ flex:1 }}>
                                        <Text style={s.fieldLabel}>{label}</Text>
                                        <View style={{ flexDirection:'row', gap:3 }}>
                                            <TouchableOpacity
                                                style={[s.triBtn, dateVal && s.triBtnFilled, { flex:1, paddingVertical:7, paddingHorizontal:6 }]}
                                                onPress={() => { setTimeField(null); setDpField(field); }}>
                                                <Text style={[s.triLabel, { fontSize:9 }]}>{t.dateLabel}</Text>
                                                <Text style={[s.triValue, !dateVal && s.triPlaceholder, { fontSize:11 }]} numberOfLines={1}>
                                                    {dateVal ? `${String(dateVal.getDate()).padStart(2,'0')}/${String(dateVal.getMonth()+1).padStart(2,'0')}/${dateVal.getFullYear()}` : '—'}
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[s.triBtn, timeVal && s.triBtnFilled, { paddingVertical:7, paddingHorizontal:8 }]}
                                                onPress={() => { setDpField(null); setTimeField(field); }}>
                                                <Text style={[s.triLabel, { fontSize:9 }]}>{t.timeLabel}</Text>
                                                <Text style={[s.triValue, !timeVal && s.triPlaceholder, { fontSize:11 }]}>{timeVal || '—'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                            <CustomCalendarPicker
                                visible={dpField === 'evStart' || dpField === 'evEnd'}
                                value={dpField === 'evStart' ? f.eventStartDate : f.eventEndDate}
                                onSelect={(date) => { set(dpField === 'evStart' ? 'eventStartDate' : 'eventEndDate', date); setDpField(null); }}
                                onClose={() => setDpField(null)}
                            />
                            <TimeGridModal
                                visible={timeField === 'evStart' || timeField === 'evEnd'}
                                title={timeField === 'evStart' ? t.tournEventStartLabel : t.tournEventEndLabel}
                                value={timeField === 'evStart' ? f.eventStartTime : f.eventEndTime}
                                onSelect={(v) => { set(timeField === 'evStart' ? 'eventStartTime' : 'eventEndTime', v); setTimeField(null); }}
                                onClose={() => setTimeField(null)}
                            />

                            {/* Entry fee */}
                            <Text style={s.fieldLabel}>{t.tournFeeLabel}</Text>
                            <View style={[s.chipRow, { marginBottom:6 }]}>
                                <TouchableOpacity
                                    style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, !f.isPaid && { backgroundColor: '#16a34a30', borderColor: '#16a34a' }]}
                                    onPress={() => { set('isPaid', false); if (f.feeType === 'INCLUDED') set('feeType', 'SHARED'); }}>
                                    <Text style={[s.chipText, !f.isPaid && { color: '#4ade80', fontWeight:'800' }]}>{t.tournFreeOption}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, f.isPaid && { backgroundColor: '#d9770630', borderColor: '#d97706' }]}
                                    onPress={() => { set('isPaid', true); if (f.feeType === 'SPONSORED') set('feeType', 'SHARED'); }}>
                                    <Text style={[s.chipText, f.isPaid && { color: '#fbbf24', fontWeight:'800' }]}>{t.tournPaidOption}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ backgroundColor: f.isPaid ? '#d9770615' : '#16a34a15', borderRadius:8, padding:8, marginBottom:8, borderWidth:1, borderColor: f.isPaid ? '#d9770640' : '#16a34a40' }}>
                                <Text style={{ color: f.isPaid ? '#fbbf24' : '#4ade80', fontSize:11, lineHeight:17 }}>
                                    {f.isPaid ? t.tournPaidNote : t.tournFreeNote}
                                </Text>
                            </View>

                            {/* Kort ücreti kim öder — ücretsizde ve ücretlide farklı seçenekler */}
                            <Text style={s.fieldLabel}>{t.tournCourtFeeWho}</Text>
                            <View style={[s.chipRow, { marginBottom:10 }]}>
                                {(f.isPaid
                                    ? [{ id:'INCLUDED', label: t.tournFeeIncluded }, { id:'SHARED', label: t.tournFeeShared }]
                                    : [{ id:'SHARED', label: t.tournFeeShared }, { id:'SPONSORED', label: t.tournFeeSponsored }]
                                ).map(ft => (
                                    <TouchableOpacity key={ft.id}
                                        style={[s.chip, { flex:1, paddingVertical:5, paddingHorizontal:10 }, f.feeType === ft.id && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                        onPress={() => set('feeType', ft.id)}>
                                        <Text style={[s.chipText, { textAlign:'center' }, f.feeType === ft.id && { color: cfg.color, fontWeight:'800' }]}>{ft.label}</Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Payment options — only when paid */}
                            {f.isPaid && (<>
                                <Text style={s.fieldLabel}>Turnuva Katılım Ücreti (₺)</Text>
                                <TextInput
                                    style={[s.fieldInput, ti, { marginBottom:10 }]}
                                    value={f.playerFee}
                                    onChangeText={v => set('playerFee', v.replace(/[^0-9.]/g,''))}
                                    keyboardType="numeric" maxLength={8}
                                    placeholder="örn. 150"
                                    placeholderTextColor={colors.textMuted} />

                                <Text style={[s.fieldLabel, { marginTop:4 }]}>Ödeme Yöntemi</Text>
                                {/* Online payment — disabled */}
                                <View style={{ opacity:0.4, marginBottom:6 }}>
                                    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor: colors.surface2, borderRadius:10, padding:10, borderWidth:1, borderColor: colors.border }}>
                                        <View style={{ flexDirection:'row', alignItems:'center', gap:8 }}>
                                            <View style={{ width:18, height:18, borderRadius:9, borderWidth:2, borderColor: colors.border }} />
                                            <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>🌐 Online Ödeme</Text>
                                        </View>
                                        <View style={{ backgroundColor:'#334155', borderRadius:6, paddingHorizontal:6, paddingVertical:2 }}>
                                            <Text style={{ color:'#94a3b8', fontSize:10, fontWeight:'700' }}>Yakında</Text>
                                        </View>
                                    </View>
                                </View>
                                {/* EFT */}
                                <TouchableOpacity
                                    style={{ flexDirection:'row', alignItems:'center', gap:10, backgroundColor: f.paymentMethod==='EFT' ? '#2563eb15' : colors.surface2, borderRadius:10, padding:10, marginBottom:6, borderWidth:1, borderColor: f.paymentMethod==='EFT' ? '#2563eb' : colors.border }}
                                    onPress={() => set('paymentMethod', 'EFT')}>
                                    <View style={{ width:18, height:18, borderRadius:9, borderWidth:2, borderColor: f.paymentMethod==='EFT' ? '#60a5fa' : colors.border, backgroundColor: f.paymentMethod==='EFT' ? '#60a5fa' : 'transparent', alignItems:'center', justifyContent:'center' }}>
                                        {f.paymentMethod==='EFT' && <View style={{ width:8, height:8, borderRadius:4, backgroundColor:'#1e40af' }} />}
                                    </View>
                                    <Text style={{ color: f.paymentMethod==='EFT' ? '#60a5fa' : '#fff', fontSize:12, fontWeight:'700' }}>🏦 EFT ile Ödeme</Text>
                                </TouchableOpacity>
                                {/* Cash — only when a specific court is chosen */}
                                {!f.courtDecidedByPlayers && (
                                <TouchableOpacity
                                    style={{ flexDirection:'row', alignItems:'center', gap:10, backgroundColor: f.paymentMethod==='CASH' ? '#16a34a15' : colors.surface2, borderRadius:10, padding:10, marginBottom:8, borderWidth:1, borderColor: f.paymentMethod==='CASH' ? '#16a34a' : colors.border }}
                                    onPress={() => set('paymentMethod', 'CASH')}>
                                    <View style={{ width:18, height:18, borderRadius:9, borderWidth:2, borderColor: f.paymentMethod==='CASH' ? '#4ade80' : colors.border, backgroundColor: f.paymentMethod==='CASH' ? '#4ade80' : 'transparent', alignItems:'center', justifyContent:'center' }}>
                                        {f.paymentMethod==='CASH' && <View style={{ width:8, height:8, borderRadius:4, backgroundColor:'#14532d' }} />}
                                    </View>
                                    <Text style={{ color: f.paymentMethod==='CASH' ? '#4ade80' : '#fff', fontSize:12, fontWeight:'700' }}>💵 Kortta Nakit Ödeme</Text>
                                </TouchableOpacity>
                                )}

                                {/* EFT fields */}
                                {f.paymentMethod === 'EFT' && (<>
                                    <Text style={s.fieldLabel}>IBAN Numarası</Text>
                                    <TextInput
                                        style={[s.fieldInput, ti]}
                                        value={f.ibanNumber}
                                        onChangeText={v => set('ibanNumber', v.toUpperCase().replace(/\s/g,''))}
                                        placeholder="TR00 0000 0000 0000 0000 0000 00"
                                        placeholderTextColor={colors.textMuted}
                                        autoCapitalize="characters" maxLength={32} />
                                    <Text style={s.fieldLabel}>Hesap Sahibi (Ad Soyad)</Text>
                                    <TextInput
                                        style={[s.fieldInput, ti]}
                                        value={f.ibanHolder}
                                        onChangeText={v => set('ibanHolder', v)}
                                        placeholder="Ad Soyad"
                                        placeholderTextColor={colors.textMuted}
                                        autoCapitalize="words" />
                                </>)}
                            </>)}

                            {/* Prizes — required for paid, optional for free */}
                            {[
                                { key:'prize1', label: f.isPaid ? t.tournPrize1 : t.tournPrize1Opt },
                                { key:'prize2', label: f.isPaid ? t.tournPrize2 : t.tournPrize2Opt },
                                { key:'prize3', label: f.isPaid ? t.tournPrize3 : t.tournPrize3Opt },
                            ].map(({ key, label }) => (
                                <View key={key}>
                                    <Text style={s.fieldLabel}>{label}</Text>
                                    <TextInput style={[s.fieldInput, ti]} value={f[key]}
                                        onChangeText={v => set(key, v)}
                                        placeholder={t.tournPrizePh} placeholderTextColor={colors.textMuted} />
                                </View>
                            ))}


                            {/* Tournament type */}
                            <Text style={s.fieldLabel}>{t.tournTypeLabel}</Text>
                            <View style={[s.chipRow, { marginBottom:8 }]}>
                                {TOURN_TYPES.map(tp => (
                                    <TouchableOpacity key={tp}
                                        style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, f.type === tp && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                        onPress={() => set('type', tp)}>
                                        <Text style={[s.chipText, f.type === tp && { color: cfg.color, fontWeight:'800' }]}>
                                            {TOURN_TYPE_LABELS(t)[tp]}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Bireysel Rekabetçi kuralları */}
                            {f.type === '1' && (
                                <View style={{ backgroundColor:'#1e293b', borderRadius:8, padding:10, marginBottom:10, borderWidth:1, borderColor: cfg.color + '40' }}>
                                    <Text style={{ color: cfg.color, fontSize:11, fontWeight:'900', marginBottom:8 }}>📋 Bireysel Rekabetçi Kuralları</Text>
                                    {[
                                        'Oyuncular bireysel katılır. Play-off öncesi her tur bittikten sonra güncel ELO\'ya göre en yakın, daha önce eşleşmemiş rakiplerle yeni tur oluşturulur.',
                                        'Play-off\'larda da ELO puanı en yakın oyuncular eşleşir.',
                                        'Her oyuncunun 1 joker hakkı vardır. Haftada 1 maç zorunludur. Joker kullanılan maça +7 gün ek süre tanınır; süre dolmasına rağmen maç bitmezse joker kullanan oyuncu hükmen yenilir.',
                                        'İki oyuncu da aynı maç için joker kullanır ya da karşılıklı joker yaparsa +7 +7 değil sadece +7 olarak uzar; sadece iki taraf da karşılıklı yaptığı için joker hakları tükenmez.',
                                        'Aynı puanlı oyuncular play-off\'a geldiğinde averajı (galibiyet oyunu / toplam oyun) yüksek olan önce alınır.',
                                    ].map((kural, i) => (
                                        <View key={i} style={{ flexDirection:'row', gap:8, marginBottom:6 }}>
                                            <Text style={{ color: cfg.color, fontSize:11, fontWeight:'900', minWidth:16 }}>{i + 1}.</Text>
                                            <Text style={{ color:'#cbd5e1', fontSize:11, lineHeight:17, flex:1 }}>{kural}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Çiftler Rekabetçi kuralları */}
                            {f.type === '2' && (
                                <View style={{ backgroundColor:'#1e293b', borderRadius:8, padding:10, marginBottom:10, borderWidth:1, borderColor: cfg.color + '40' }}>
                                    <Text style={{ color: cfg.color, fontSize:11, fontWeight:'900', marginBottom:8 }}>📋 Çiftler Rekabetçi Kuralları</Text>
                                    {[
                                        'Oyuncular turnuvaya çift olarak (takım halinde) katılabilir ya da bireysel başvurabilir — bireysel başvuranlar turnuva başlarken ELO puanı birbirine en yakın olanlarla eşleştirilerek takım yapılır. Tek kalan en düşük ELO puanlı oyuncu turnuvaya katılım sağlayamaz.',
                                        'Karışık (mix) turnuvalarda bireysel katılımcılardan sistem aynı takımda iki kadın oluşturacak şekilde eşleşme yapmaz.',
                                        'Takımların ELO puan ortalaması alınır ve play-off\'lara kadar kaç maç seçildiyse, her takım diğer her takımla en fazla bir kez eşleşecek şekilde, ortalama puanı en yakın olandan başlanarak her turda rakip eşleşmesi sağlanır.',
                                        'Her takımın 1 kez joker hakkı vardır. Haftada bir maç zorunluluğu olup joker hakkı kullanılırsa takıma +7 gün ek süre tanınır. Joker kullanan takım bu sürede maçı bitirmek için gerekli tavizi vermekle yükümlüdür; bitiremezse joker kullanan takım hükmen yenilir.',
                                        'Jokeri kullanan takımın rakibi de aynı maç için karşılıklı joker yaparsa joker hakkı tükenmez, sadece 7 günlük süre bir kez eklenmiş olur (hava şartları, kort temin edilememesi vb. durumlar için).',
                                        'Play-off öncesi lig tablosunda puanı eşit olan takımlar varsa averaj (oynanan oyun oranı) dikkate alınır.',
                                        'Bir takım kazandığında/kaybettiğinde iki oyuncu da bireysel olarak ELO puanı kazanır/kaybeder — miktar, diğer rekabetçi maçlarla aynı puan tablosu kullanılarak iki takımın ortalama ELO farkına göre belirlenir.',
                                    ].map((kural, i) => (
                                        <View key={i} style={{ flexDirection:'row', gap:8, marginBottom:6 }}>
                                            <Text style={{ color: cfg.color, fontSize:11, fontWeight:'900', minWidth:16 }}>{i + 1}.</Text>
                                            <Text style={{ color:'#cbd5e1', fontSize:11, lineHeight:17, flex:1 }}>{kural}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}


                            {/* Gender | Sets — side by side */}
                            <View style={{ flexDirection:'row', gap:6, alignItems:'flex-end', marginBottom:8 }}>
                                <View style={{ flex:1 }}>
                                    <Text style={s.fieldLabel}>{t.tournGenderLabel}</Text>
                                    <View style={{ flexDirection:'row', gap:3 }}>
                                        {TOURN_GENDERS.map(g => (
                                            <TouchableOpacity key={g}
                                                style={[s.chip, { flex:1, paddingVertical:5, paddingHorizontal:4, justifyContent:'center', alignItems:'center' }, f.genderType === g && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                                onPress={() => set('genderType', g)}>
                                                <Text style={[s.chipText, { fontSize:11, textAlign:'center' }, f.genderType === g && { color: cfg.color, fontWeight:'800' }]}>
                                                    {t['tournGender' + g.charAt(0) + g.slice(1).toLowerCase()]}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                </View>
                                <View style={{ width:72 }}>
                                    <Text style={s.fieldLabel}>{t.tournSetsLabel}</Text>
                                    <TextInput
                                        style={[s.fieldInput, ti, { marginBottom:0, textAlign:'center' }]}
                                        value={f.setsPerMatch}
                                        onChangeText={v => set('setsPerMatch', v.replace(/[^0-9]/g, '').slice(0, 1))}
                                        placeholder="3"
                                        placeholderTextColor={colors.textMuted}
                                        keyboardType="numeric"
                                        maxLength={1}
                                    />
                                </View>
                            </View>

                            {/* Scoring + matches/qualifiers — Bireysel ve Çiftler Rekabetçi'de geçerli */}
                            {(f.type === '1' || f.type === '2') && (
                                <>
                                    <Text style={s.fieldLabel}>{t.tournScoringLabel}</Text>
                                    <View style={[s.chipRow, { marginBottom:8 }]}>
                                        <TouchableOpacity
                                            style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, f.advantageScoring === true && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('advantageScoring', true)}>
                                            <Text style={[s.chipText, f.advantageScoring === true && { color: cfg.color, fontWeight:'800' }]}>{t.tournAdvantage}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, f.advantageScoring === false && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('advantageScoring', false)}>
                                            <Text style={[s.chipText, f.advantageScoring === false && { color: cfg.color, fontWeight:'800' }]}>{t.tournDeciding}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, f.advantageScoring === null && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('advantageScoring', null)}>
                                            <Text style={[s.chipText, f.advantageScoring === null && { color: cfg.color, fontWeight:'800' }]}>{t.tournFreeScoring}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={{ flexDirection:'row', gap:6 }}>
                                        <View style={{ flex:1 }}>
                                            <Text style={s.fieldLabel}>{t.tournMatchesBeforePlayoff}</Text>
                                            <TextInput style={[s.fieldInput, ti]} value={f.matchesBeforePlayoff}
                                                onChangeText={v => set('matchesBeforePlayoff', v.replace(/[^0-9]/g,''))}
                                                placeholder={t.tournMatchesPh} placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                                        </View>
                                        <View style={{ flex:1 }}>
                                            <Text style={s.fieldLabel}>{t.tournPlayoffQualifiers}</Text>
                                            <TextInput style={[s.fieldInput, ti]} value={f.playoffQualifiers}
                                                onChangeText={v => set('playoffQualifiers', v.replace(/[^0-9]/g,''))}
                                                placeholder={t.tournPlayoffPh} placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                                        </View>
                                    </View>
                                </>
                            )}

                            {/* Min / Max players + Rating limits — 4 in a row */}
                            <View style={{ flexDirection:'row', gap:6, marginBottom:8, marginTop:4 }}>
                                <View style={{ flex:1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>{t.tournMinPlayers}</Text>
                                    <TextInput style={[s.fieldInput, ti, { paddingVertical:6, textAlign:'center', fontSize:12 }]} value={f.minPlayers}
                                        onChangeText={v => set('minPlayers', v.replace(/[^0-9]/g,''))}
                                        placeholder="2" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                                </View>
                                <View style={{ flex:1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>{t.tournMaxPlayers}</Text>
                                    <TextInput style={[s.fieldInput, ti, { paddingVertical:6, textAlign:'center', fontSize:12 }]} value={f.maxPlayers}
                                        onChangeText={v => set('maxPlayers', v.replace(/[^0-9]/g,''))}
                                        placeholder="32" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                                </View>
                                <TouchableOpacity onPress={() => setRatingField('min')} style={{ flex:1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>⭐ Alt Derece</Text>
                                    <View style={{ backgroundColor: colors.surface2, borderRadius:8, paddingVertical:7, alignItems:'center', borderWidth:1, borderColor: f.minRating ? cfg.color : colors.border }}>
                                        <Text style={{ color: f.minRating ? cfg.color : colors.textSecondary, fontSize:12, fontWeight:'800' }}>
                                            {f.minRating ? `${f.minRating}★` : 'Serbest'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setRatingField('max')} style={{ flex:1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>⭐ Üst Derece</Text>
                                    <View style={{ backgroundColor: colors.surface2, borderRadius:8, paddingVertical:7, alignItems:'center', borderWidth:1, borderColor: f.maxRating ? cfg.color : colors.border }}>
                                        <Text style={{ color: f.maxRating ? cfg.color : colors.textSecondary, fontSize:12, fontWeight:'800' }}>
                                            {f.maxRating ? `${f.maxRating}★` : 'Serbest'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                            </View>

                            {/* Contact phone */}
                            <Text style={s.fieldLabel}>{t.tournContactPhoneLabel}</Text>
                            <TextInput style={[s.fieldInput, ti]} value={f.contactPhone}
                                onChangeText={v => set('contactPhone', v)}
                                placeholder={t.tournContactPhonePh}
                                placeholderTextColor={colors.textMuted}
                                keyboardType="phone-pad" />

                            {/* Description */}
                            <Text style={s.fieldLabel}>{t.tournDescLabel}</Text>
                            <TextInput style={[s.fieldInput, ti, { minHeight:55, textAlignVertical:'top' }]} value={f.description}
                                onChangeText={v => set('description', v)} placeholder={t.tournDescPh}
                                placeholderTextColor={colors.textMuted} multiline />

                            <TouchableOpacity
                                style={[s.submitBtn, { backgroundColor: cfg.color }, submitting && { opacity:0.6 }]}
                                onPress={submit} disabled={submitting}>
                                <Text style={s.submitBtnText}>{submitting ? t.submittingBtn : t.tournSubmitBtn}</Text>
                            </TouchableOpacity>
                        </ScrollView>
                    </View>
                </KeyboardAvoidingView>
            </View>
            <RatingPickerModal
                visible={ratingField === 'min' || ratingField === 'max'}
                title={ratingField === 'min' ? '⭐ Alt Derece Limiti' : '⭐ Üst Derece Limiti'}
                value={ratingField === 'min' ? f.minRating : f.maxRating}
                onSelect={(v) => { set(ratingField === 'min' ? 'minRating' : 'maxRating', v); setRatingField(null); }}
                onClose={() => setRatingField(null)}
            />
            <TimeGridModal
                visible={ratingField === 'timeStart' || ratingField === 'timeEnd'}
                title={ratingField === 'timeStart' ? '⏰ En Erken Maç Saati' : '⏰ En Geç Maç Saati'}
                value={ratingField === 'timeStart' ? f.matchTimeStart : f.matchTimeEnd}
                onSelect={(v) => { set(ratingField === 'timeStart' ? 'matchTimeStart' : 'matchTimeEnd', v); setRatingField(null); }}
                onClose={() => setRatingField(null)}
            />
        </Modal>
    );
}

// ─── Günün Tenisçisi (Digimon kart) ────────────────────────────────────────────

function SpotlightTierRow({ label, entry }) {
    return (
        <View style={spot.tierRow}>
            <Text style={spot.tierLabel}>{label}</Text>
            {entry ? (
                <>
                    <Text style={spot.tierName} numberOfLines={1}>{entry.name || '—'}</Text>
                    <Text style={spot.tierDetail} numberOfLines={2}>
                        {entry.type === 'tournament'
                            ? `🏆 ${entry.tournamentName} — ${entry.placement}.`
                            : `⚔️ ${entry.wins} galibiyet`}
                        {entry.date ? ` · ${new Date(entry.date).toLocaleDateString('tr-TR', { day:'numeric', month:'long' })}` : ''}
                    </Text>
                </>
            ) : (
                <Text style={spot.tierEmpty}>Henüz veri yok</Text>
            )}
        </View>
    );
}

function TennisSpotlightModal({ visible, onClose, cfg }) {
    const [data, setData] = useState(null);
    const [loading, setLoading] = useState(true);
    const [flipped, setFlipped] = useState(false);

    useEffect(() => {
        if (!visible) return;
        setFlipped(false);
        setLoading(true);
        api.get('/spotlight/daily', { params: { subCategory: 'tennis' } })
            .then(res => setData(res.data))
            .catch(() => setData(null))
            .finally(() => setLoading(false));
    }, [visible]);

    return (
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={[spot.overlay, { paddingTop: Platform.OS==='ios' ? 56 : 30 }]}>
                <View style={[spot.card, { borderColor: cfg.color }]}>
                    <ScrollView contentContainerStyle={spot.cardScroll} showsVerticalScrollIndicator={false}>
                        {loading ? (
                            <ActivityIndicator color={cfg.color} style={{ marginTop:60 }} />
                        ) : !flipped ? (
                            <>
                                <Text style={spot.cardEmoji}>🎾</Text>
                                <Text style={[spot.cardTitle, { color: cfg.color }]}>Günün Tenisçisi</Text>
                                {data?.pro?.available ? (
                                    <>
                                        <Text style={spot.proName}>{data.pro.name}</Text>
                                        <Text style={spot.proAchievements}>{data.pro.achievements}</Text>
                                    </>
                                ) : (
                                    <Text style={spot.comingSoon}>Çok yakında — güncel ATP/WTA verileri burada görünecek 🎾</Text>
                                )}
                            </>
                        ) : (
                            <>
                                <Text style={[spot.cardTitle, { color: cfg.color }]}>Activity'de Dün</Text>
                                <SpotlightTierRow label="🌍 Uluslararası" entry={data?.app?.international} />
                                <SpotlightTierRow label="🇹🇷 Ulusal" entry={data?.app?.national} />
                                <SpotlightTierRow label="📍 Yerel" entry={data?.app?.local} />
                            </>
                        )}
                    </ScrollView>
                </View>
                <View style={spot.actions}>
                    <TouchableOpacity style={spot.actionBtn} onPress={() => setFlipped(v => !v)}>
                        <Text style={spot.actionBtnText}>🔄 Çevir</Text>
                    </TouchableOpacity>
                    <TouchableOpacity style={[spot.actionBtn, spot.closeBtn]} onPress={onClose}>
                        <Text style={spot.actionBtnText}>✕ Kapat</Text>
                    </TouchableOpacity>
                </View>
            </View>
        </Modal>
    );
}

const spot = StyleSheet.create({
    overlay:      { flex:1, backgroundColor: colors.bg, paddingHorizontal:16, paddingBottom:20 },
    card:         { flex:1, backgroundColor: colors.surface, borderRadius:24, borderWidth:3, marginBottom:14, overflow:'hidden' },
    cardScroll:   { padding:24, alignItems:'center', flexGrow:1, justifyContent:'center' },
    cardEmoji:    { fontSize:56, marginBottom:10 },
    cardTitle:    { fontSize:20, fontWeight:'900', marginBottom:18, textAlign:'center' },
    proName:      { color:'#fff', fontSize:24, fontWeight:'900', marginBottom:10, textAlign:'center' },
    proAchievements: { color: colors.textSecondary, fontSize:14, textAlign:'center', lineHeight:21 },
    comingSoon:   { color: colors.textMuted, fontSize:14, textAlign:'center', lineHeight:21 },
    tierRow:      { width:'100%', backgroundColor: colors.surface2, borderRadius:14, padding:16, marginBottom:12 },
    tierLabel:    { color: colors.textMuted, fontSize:12, fontWeight:'700', marginBottom:6 },
    tierName:     { color:'#fff', fontSize:17, fontWeight:'800', marginBottom:3 },
    tierDetail:   { color: colors.textSecondary, fontSize:12 },
    tierEmpty:    { color: colors.textMuted, fontSize:13, fontStyle:'italic' },
    actions:      { flexDirection:'row', gap:10 },
    actionBtn:    { flex:1, backgroundColor: colors.surface2, borderRadius:12, paddingHorizontal:20, paddingVertical:14, borderWidth:1, borderColor: colors.border, alignItems:'center' },
    closeBtn:     { backgroundColor:'#dc262620', borderColor:'#dc262640' },
    actionBtnText:{ color:'#fff', fontSize:14, fontWeight:'700' },
});

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function SubCategoryScreen({ route, navigation }) {
    const { category, sub, initialTab, highlightRivalId, initialTournSubTab, openChatTournamentId } = route.params;
    const myId = useSelector(s => s.auth.user?.id);
    const myIsAdmin = useSelector(s => s.auth.user?.isAdmin);
    const myInterests = useSelector(s => s.auth.user?.interests || []);
    const myRating = myInterests.find(i => i.subCategory === sub)?.skillRating ?? 0;
    const lang = useSelector(s => s.lang?.lang || 'en');
    const t = useT();
    const cfg = getConfig(sub);
    const sportDisplayName = lang === 'tr' ? (cfg.nameTR || cfg.name) : cfg.name;
    const tabs = getTabs(sub);

    const [activeTab, setActiveTab] = useState(initialTab && tabs.includes(initialTab) ? initialTab : 'rivals');

    useEffect(() => {
        if (route.params?.initialTab && tabs.includes(route.params.initialTab)) {
            setActiveTab(route.params.initialTab);
        }
    }, [route.params?.initialTab]);

    // Tenis sekmesine her girişte (günde en fazla 3 kez) "Günün Tenisçisi" kartını otomatik göster
    const [showSpotlight, setShowSpotlight] = useState(false);
    useEffect(() => {
        if (sub !== 'tennis') return;
        const today = new Date().toISOString().slice(0, 10);
        AsyncStorage.getItem('tennis_spotlight_shown').then(raw => {
            let { date, count } = raw ? JSON.parse(raw) : { date: today, count: 0 };
            if (date !== today) { date = today; count = 0; }
            if (count < 3) {
                setShowSpotlight(true);
                AsyncStorage.setItem('tennis_spotlight_shown', JSON.stringify({ date, count: count + 1 }));
            }
        });
    }, [sub]);

    const [autoOpenId, setAutoOpenId] = useState(null);
    const autoOpenHandledRef = useRef(null);

    const [rivals, setRivals] = useState([]);
    const [playerWanted, setPlayerWanted] = useState([]);
    const [matchedUpcoming, setMatchedUpcoming] = useState([]);
    const [textPosts, setTextPosts] = useState([]);
    const [mediaPosts, setMediaPosts] = useState([]);
    const [mediaStories, setMediaStories] = useState([]);
    const [storyViewer, setStoryViewer] = useState({ visible: false, userIdx: 0, storyIdx: 0 });
    const [mediaViewIdx, setMediaViewIdx] = useState(null);
    const [mediaLiked, setMediaLiked] = useState({});
    const [mediaLikeCounts, setMediaLikeCounts] = useState({});
    const [mediaShowComments, setMediaShowComments] = useState(false);
    const [mediaComments, setMediaComments] = useState([]);
    const [mediaCommentText, setMediaCommentText] = useState('');
    const [sendingMediaComment, setSendingMediaComment] = useState(false);
    const [mediaCity, setMediaCity] = useState('');
    const [mediaTimeFilter, setMediaTimeFilter] = useState('ALL');
    const [showMediaShare, setShowMediaShare] = useState(false);
    const [mediaShareUri, setMediaShareUri] = useState(null);
    const [mediaShareCaption, setMediaShareCaption] = useState('');
    const [submittingMediaShare, setSubmittingMediaShare] = useState(false);
    const [equipmentListings, setEquipmentListings] = useState([]);
    const [equipmentCondition, setEquipmentCondition] = useState('ALL');
    const [loadingEquipment, setLoadingEquipment] = useState(false);
    const [showEquipmentForm, setShowEquipmentForm] = useState(false);
    const [equipmentForm, setEquipmentForm] = useState({ title:'', price:'', condition:'NEW', description:'', location:'', images:[] });
    const [submittingEquipment, setSubmittingEquipment] = useState(false);
    const [equipmentMedia, setEquipmentMedia] = useState([]);
    const [uploadingEquipmentMedia, setUploadingEquipmentMedia] = useState(false);
    const [equipmentSearch, setEquipmentSearch] = useState('');
    const [equipmentCity, setEquipmentCity] = useState('');
    const [equipmentMinPrice, setEquipmentMinPrice] = useState('');
    const [equipmentMaxPrice, setEquipmentMaxPrice] = useState('');
    const [selectedEquipment, setSelectedEquipment] = useState(null);
    const [reportingListingId, setReportingListingId] = useState(null);
    const [news, setNews] = useState([]);
    const [loadingNews, setLoadingNews] = useState(false);
    const [newPostText, setNewPostText] = useState('');
    const [submittingPost, setSubmittingPost] = useState(false);
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [archiveRivals, setArchiveRivals] = useState([]);
    const [loadingArchive, setLoadingArchive] = useState(false);
    const [pendingScore, setPendingScore] = useState([]);
    const [archiveCity, setArchiveCity] = useState('');
    const [archiveDateFrom, setArchiveDateFrom] = useState('');
    const [archiveDateTo, setArchiveDateTo] = useState('');
    const [archiveSubTab, setArchiveSubTab] = useState('rivals');
    const [tournSubTab, setTournSubTab] = useState(['open','inprogress','completed'].includes(initialTournSubTab) ? initialTournSubTab : 'open');

    useEffect(() => {
        if (['open','inprogress','completed'].includes(route.params?.initialTournSubTab)) {
            setTournSubTab(route.params.initialTournSubTab);
        }
    }, [route.params?.initialTournSubTab]);
    const [archiveTournaments, setArchiveTournaments] = useState([]);
    const [loadingArchiveTournaments, setLoadingArchiveTournaments] = useState(false);
    const [selectedArchiveTournament, setSelectedArchiveTournament] = useState(null);
    const [archiveModalMatches, setArchiveModalMatches] = useState([]);
    const [archiveModalLoading, setArchiveModalLoading] = useState(false);
    const [archiveModalTab, setArchiveModalTab] = useState('details');

    const [filterCity, setFilterCity] = useState('');
    const [filterDate, setFilterDate] = useState('all');
    const [showCityFilter, setShowCityFilter] = useState(false);
    const [locationLoading, setLocationLoading] = useState(false);
    const [cityAlertCity, setCityAlertCity] = useState(null);
    // Tüm sekmeler için abone olunan il listesi
    const [tabSubCities, setTabSubCities] = useState({ rivals: [], tournaments: [], coaches: [], equipment: [] });
    const [cityAlertLoading, setCityAlertLoading] = useState(null); // toggling tab or null
    const [cityPickerTab, setCityPickerTab] = useState(null); // hangi sekme için picker açık
    const [cityPickerTogglingCity, setCityPickerTogglingCity] = useState(null);

    // Coaches data
    const [coachListings, setCoachListings] = useState([]);
    const [loadingCoaches, setLoadingCoaches] = useState(false);
    const [coachSubTab, setCoachSubTab] = useState('listings'); // 'listings' | 'cvs'
    const [showCreateCoach, setShowCreateCoach] = useState(false);
    const [submittingCoach, setSubmittingCoach] = useState(false);
    const [uploadingCoachMedia, setUploadingCoachMedia] = useState(false);
    const [coachForm, setCoachForm] = useState({
        credentialLevel: 'INDEPENDENT', certName: '', experience: '',
        achievements: '', individual: true, group: false,
        priceIndividual: '', priceGroup: '', maxGroupSize: '4',
        location: '', city: '', days: [], timeFrom: '09:00', timeTo: '21:00', description: '',
        locationMutual: false,
    });
    const [coachCertImage, setCoachCertImage] = useState(null);
    const [coachCvImage, setCoachCvImage] = useState(null);
    const [coachAchievementImages, setCoachAchievementImages] = useState([]);
    const [showCvUploadModal, setShowCvUploadModal] = useState(false);
    const [cvUploadListingId, setCvUploadListingId] = useState(null);
    const [standaloneCvImage, setStandaloneCvImage] = useState(null);
    const [uploadingStandaloneCv, setUploadingStandaloneCv] = useState(false);

    const [showCreateRival, setShowCreateRival] = useState(false);
    const [upcomingExpanded, setUpcomingExpanded] = useState(true);
    const [showCreatePW, setShowCreatePW] = useState(false);
    const [showCreateTournament, setShowCreateTournament] = useState(false);
    const [showTournamentPermission, setShowTournamentPermission] = useState(false);
    const [tournamentPermStatus, setTournamentPermStatus] = useState(null);
    const [tournaments, setTournaments] = useState([]);
    const [loadingTournaments, setLoadingTournaments] = useState(false);
    const [profileUserId, setProfileUserId] = useState(null);

    // Mesaj bildirimine tıklanınca doğru alt sekmeye geçip ilgili kartın render olmasını sağla
    useEffect(() => {
        if (!openChatTournamentId || tournaments.length === 0) return;
        const target = tournaments.find(tn => tn.id === openChatTournamentId);
        if (target) {
            setTournSubTab(target.status === 'OPEN' ? 'open' : target.status === 'COMPLETED' ? 'completed' : 'inprogress');
        }
    }, [openChatTournamentId, tournaments]);

    // Comments modal — lifted out of UpcomingCard so it renders outside ScrollView
    const [commentMatch, setCommentMatch] = useState(null);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [sendingComment, setSendingComment] = useState(false);

    const openComments = useCallback(async (match) => {
        setCommentMatch(match);
        setComments([]);
        setLoadingComments(true);
        try {
            const res = await api.get(`/rivals/${match.id}/comments`);
            setComments(res.data || []);
        } catch(e) {
            Alert.alert('Hata', e?.response?.data?.message || e?.message || 'Yorumlar yüklenemedi');
        }
        finally { setLoadingComments(false); }
    }, []);

    const sendComment = useCallback(async () => {
        if (!commentText.trim() || !commentMatch) return;
        setSendingComment(true);
        try {
            const res = await api.post(`/rivals/${commentMatch.id}/comments`, { content: commentText.trim() });
            setComments(p => [...p, res.data]);
            setCommentText('');
            // Update local count on the card
            setCommentMatch(prev => prev ? { ...prev, _count: { ...prev._count, matchComments: (prev._count?.matchComments ?? 0) + 1 } } : prev);
        } catch(e) {
            Alert.alert('Hata', e?.response?.data?.message || e?.message || 'Yorum gönderilemedi');
        }
        finally { setSendingComment(false); }
    }, [commentText, commentMatch]);

    const deleteComment = useCallback(async (commentId) => {
        try {
            await api.delete(`/rivals/comments/${commentId}`);
            setComments(p => p.filter(c => c.id !== commentId));
        } catch(e) {
            Alert.alert('Hata', e?.response?.data?.message || e?.message || 'Yorum silinemedi');
        }
    }, []);

    // Real-time new comment for upcoming match modal
    useEffect(() => {
        if (!commentMatch?.id) return;
        const off = onSocket('newComment', ({ rivalId, comment }) => {
            if (rivalId !== commentMatch.id) return;
            setComments(prev => prev.some(c => c.id === comment.id) ? prev : [...prev, comment]);
        });
        return off;
    }, [commentMatch?.id]);

    const load = useCallback(async () => {
        try {
            const [rvRes, pwRes, postsRes, mediaRes, storiesRes, upcomingRes, pendingRes] = await Promise.all([
                api.get(`/rivals?category=${category}&subCategory=${sub}`),
                api.get(`/rivals?category=${category}&subCategory=${sub}&matchType=PLAYER_WANTED`).catch(() => ({ data:[] })),
                api.get(`/posts?category=${category}&subCategory=${sub}&communityOnly=true&limit=30`).catch(() => ({ data:[] })),
                api.get(`/posts?category=${category}&subCategory=${sub}&mediaOnly=true&limit=50`).catch(() => ({ data:[] })),
                api.get(`/posts?category=${category}&subCategory=${sub}&type=STORY&limit=100`).catch(() => ({ data:[] })),
                api.get(`/rivals/upcoming?category=${category}&subCategory=${sub}`).catch(() => ({ data:[] })),
                api.get(`/rivals/completed?category=${category}&subCategory=${sub}`).catch(() => ({ data:[] })),
            ]);

            const allRivals = rvRes.data;
            const openRivals = allRivals.filter(r => r.matchType !== 'PLAYER_WANTED');
            setRivals(openRivals);
            setPlayerWanted(pwRes.data.filter(p =>
                !Array.isArray(p.positions) ||
                (!p.positions.includes('REFEREE') && !p.positions.includes('REFEREE_OFFER'))
            ));
            const upcomingList = Array.isArray(upcomingRes.data) ? upcomingRes.data : [];
            setMatchedUpcoming(upcomingList);
            setPendingScore(Array.isArray(pendingRes.data) ? pendingRes.data : []);

            const allPosts = Array.isArray(postsRes.data) ? postsRes.data : [];
            setTextPosts(allPosts.filter(p => p.type === 'POST' && !p.imageUrl && !p.videoUrl));
            setMediaPosts((Array.isArray(mediaRes.data) ? mediaRes.data : []).filter(p => p.type !== 'STORY'));

            const storyMap = {};
            (Array.isArray(storiesRes.data) ? storiesRes.data : []).forEach(s => {
                if (!storyMap[s.userId]) storyMap[s.userId] = { user: s.user, stories: [] };
                storyMap[s.userId].stories.push(s);
            });
            setMediaStories(Object.values(storyMap));

            if (highlightRivalId && autoOpenHandledRef.current !== highlightRivalId) {
                const found = openRivals.find(r => r.id === highlightRivalId)
                    || upcomingList.find(r => r.id === highlightRivalId);
                if (found) {
                    autoOpenHandledRef.current = highlightRivalId;
                    setAutoOpenId(highlightRivalId);
                }
            }
        } catch(e) { console.warn(e?.message); }
        finally { setLoading(false); setRefreshing(false); }
    }, [category, sub, myId, highlightRivalId]);

    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => { load(); });
        return () => task.cancel();
    }, [load]);
    const onRefresh = () => { setRefreshing(true); load(); };

    useEffect(() => {
        ['rivals', 'tournaments', 'coaches', 'equipment'].forEach(tab => {
            api.get(`/city-alerts/${encodeURIComponent(sub)}?tab=${tab}`)
                .then(res => {
                    if (res.data.city) setCityAlertCity(res.data.city);
                    setTabSubCities(prev => ({ ...prev, [tab]: res.data.subscribedCities || [] }));
                })
                .catch(() => {});
        });
    }, [sub]);

    // Picker'dan il toggle (herhangi bir sekme için)
    const toggleTabCity = async (tab, city) => {
        setCityPickerTogglingCity(city);
        try {
            const res = await api.post('/city-alerts', { subCategory: sub, tab, city });
            setTabSubCities(prev => ({ ...prev, [tab]: res.data.subscribedCities || [] }));
            if (res.data.city) setCityAlertCity(res.data.city);
        } catch (e) {
            const serverMsg = e?.response?.data?.message;
            if (serverMsg) Alert.alert('', serverMsg);
            else {
                api.get(`/city-alerts/${encodeURIComponent(sub)}?tab=${tab}`)
                    .then(r => { setTabSubCities(prev => ({ ...prev, [tab]: r.data.subscribedCities || [] })); })
                    .catch(() => {});
            }
        } finally { setCityPickerTogglingCity(null); }
    };

    // Kısa bas: profil ilini hızlıca aç/kapat
    const quickToggleTab = async (tab) => {
        if (!cityAlertCity) return Alert.alert('', t.cityAlertNoCity);
        setCityAlertLoading(tab);
        try {
            const res = await api.post('/city-alerts', { subCategory: sub, tab, city: cityAlertCity });
            setTabSubCities(prev => ({ ...prev, [tab]: res.data.subscribedCities || [] }));
        } catch (e) {
            const serverMsg = e?.response?.data?.message;
            if (serverMsg) Alert.alert('', serverMsg);
            else {
                api.get(`/city-alerts/${encodeURIComponent(sub)}?tab=${tab}`)
                    .then(r => { setTabSubCities(prev => ({ ...prev, [tab]: r.data.subscribedCities || [] })); })
                    .catch(() => {});
            }
        } finally { setCityAlertLoading(null); }
    };

    // Refresh data whenever screen comes into focus (e.g. navigating back from notification)
    const isMounted = useRef(false);
    useFocusEffect(useCallback(() => {
        if (!isMounted.current) { isMounted.current = true; return; }
        load();
    }, [load]));

    const loadArchive = useCallback(() => {
        if (activeTab !== 'archive') return;
        setLoadingArchive(true);
        const params = new URLSearchParams({ category, subCategory: sub, scope: 'all' });
        if (archiveCity) params.set('city', archiveCity);
        if (archiveDateFrom) params.set('dateFrom', archiveDateFrom);
        if (archiveDateTo) params.set('dateTo', archiveDateTo);
        api.get(`/archive?${params.toString()}`)
            .then(res => setArchiveRivals(res.data?.rivals || []))
            .catch(() => {})
            .finally(() => setLoadingArchive(false));
    }, [activeTab, category, sub, archiveCity, archiveDateFrom, archiveDateTo]);

    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => { loadArchive(); });
        return () => task.cancel();
    }, [loadArchive]);

    const loadArchiveTournaments = useCallback(async () => {
        if (activeTab !== 'archive' || archiveSubTab !== 'tournaments') return;
        setLoadingArchiveTournaments(true);
        try {
            const params = new URLSearchParams({ category, subCategory: sub });
            if (archiveCity) params.set('city', archiveCity);
            if (archiveDateFrom) params.set('dateFrom', archiveDateFrom);
            if (archiveDateTo) params.set('dateTo', archiveDateTo);
            const { data } = await api.get(`/tournaments/archived?${params.toString()}`);
            setArchiveTournaments(Array.isArray(data) ? data : []);
        } catch { /* silent */ }
        finally { setLoadingArchiveTournaments(false); }
    }, [activeTab, archiveSubTab, category, sub, archiveCity, archiveDateFrom, archiveDateTo]);

    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => { loadArchiveTournaments(); });
        return () => task.cancel();
    }, [loadArchiveTournaments]);

    useEffect(() => {
        if (!selectedArchiveTournament) { setArchiveModalMatches([]); return; }
        setArchiveModalTab('details');
        setArchiveModalLoading(true);
        api.get(`/tournaments/${selectedArchiveTournament.id}/matches`)
            .then(res => setArchiveModalMatches(Array.isArray(res.data?.matches) ? res.data.matches : []))
            .catch(() => setArchiveModalMatches([]))
            .finally(() => setArchiveModalLoading(false));
    }, [selectedArchiveTournament?.id]);

    const loadTournaments = useCallback(async () => {
        if (activeTab !== 'tournaments') return;
        setLoadingTournaments(true);
        try {
            const { data } = await api.get(`/tournaments?category=${category}&subCategory=${sub}`);
            setTournaments(Array.isArray(data) ? data : []);
        } catch { /* silent */ }
        finally { setLoadingTournaments(false); }
    }, [activeTab, category, sub]);

    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => { loadTournaments(); });
        return () => task.cancel();
    }, [loadTournaments]);

    useEffect(() => {
        if (activeTab !== 'tournaments' || myIsAdmin) return;
        api.get('/tournaments/permission-status')
            .then(r => setTournamentPermStatus(r.data.status))
            .catch(() => {});
    }, [activeTab, myIsAdmin]);

    const loadCoaches = useCallback(async () => {
        if (activeTab !== 'coaches') return;
        setLoadingCoaches(true);
        try {
            const { data } = await api.get(`/coaches?category=${category}&subCategory=${sub}`);
            setCoachListings(Array.isArray(data) ? data : []);
        } catch { /* silent */ }
        finally { setLoadingCoaches(false); }
    }, [activeTab, category, sub]);

    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => { loadCoaches(); });
        return () => task.cancel();
    }, [loadCoaches]);

    const pickCoachSingleImage = async (setter) => {
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('', 'Galeri izni gerekli'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], quality: 0.85 });
        if (!result.canceled) setter(result.assets[0].uri);
    };

    const pickCoachAchievementImages = async () => {
        if (coachAchievementImages.length >= 5) return Alert.alert('', 'En fazla 5 görsel ekleyebilirsiniz');
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('', 'Galeri izni gerekli'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images'], allowsMultipleSelection: true, quality: 0.85,
            selectionLimit: 5 - coachAchievementImages.length,
        });
        if (!result.canceled) {
            setCoachAchievementImages(prev => [...prev, ...result.assets.map(a => a.uri)].slice(0, 5));
        }
    };

    const uploadCoachImage = async (uri, name) => {
        const form = new FormData();
        form.append('file', { uri, name, type: 'image/jpeg' });
        const { data } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
        return data.url;
    };

    const resetCoachForm = () => {
        setCoachForm({
            credentialLevel: 'INDEPENDENT', certName: '', experience: '',
            achievements: '', individual: true, group: false,
            priceIndividual: '', priceGroup: '', maxGroupSize: '4',
            location: '', city: '', days: [], timeFrom: '09:00', timeTo: '21:00', description: '',
        });
        setCoachCertImage(null);
        setCoachCvImage(null);
        setCoachAchievementImages([]);
    };

    const submitCoach = async () => {
        if (!coachForm.locationMutual && !coachForm.location.trim()) return Alert.alert('', 'Konum zorunludur');
        setSubmittingCoach(true);
        try {
            setUploadingCoachMedia(true);
            const certificateUrl = coachCertImage ? await uploadCoachImage(coachCertImage, 'cert.jpg') : undefined;
            const cvUrl = coachCvImage ? await uploadCoachImage(coachCvImage, 'cv.jpg') : undefined;
            const achievementUrls = [];
            for (const uri of coachAchievementImages) {
                achievementUrls.push(await uploadCoachImage(uri, 'achievement.jpg'));
            }
            setUploadingCoachMedia(false);

            await api.post('/coaches', {
                ...coachForm,
                category, subCategory: sub,
                experience: parseInt(coachForm.experience) || 0,
                priceIndividual: parseInt(coachForm.priceIndividual) || 0,
                priceGroup: parseInt(coachForm.priceGroup) || 0,
                maxGroupSize: parseInt(coachForm.maxGroupSize) || 4,
                certificateUrl, cvUrl, achievementUrls,
            });
            setShowCreateCoach(false);
            resetCoachForm();
            loadCoaches();
        } catch (e) { Alert.alert('', e?.response?.data?.message || t.actionFailed); }
        finally { setSubmittingCoach(false); setUploadingCoachMedia(false); }
    };

    const submitStandaloneCv = async () => {
        if (!standaloneCvImage || !cvUploadListingId) return;
        setUploadingStandaloneCv(true);
        try {
            const cvUrl = await uploadCoachImage(standaloneCvImage, 'cv.jpg');
            await api.patch(`/coaches/${cvUploadListingId}`, { cvUrl });
            setShowCvUploadModal(false);
            setStandaloneCvImage(null);
            setCvUploadListingId(null);
            loadCoaches();
            Alert.alert('', 'CV yüklendi.');
        } catch (e) { Alert.alert('', e?.response?.data?.message || t.actionFailed); }
        finally { setUploadingStandaloneCv(false); }
    };

    const loadEquipment = useCallback(async () => {
        if (activeTab !== 'equipment') return;
        setLoadingEquipment(true);
        try {
            const params = new URLSearchParams({ category, subCategory: sub });
            if (equipmentCondition !== 'ALL') params.set('condition', equipmentCondition);
            const { data } = await api.get(`/equipment?${params.toString()}`);
            setEquipmentListings(Array.isArray(data) ? data : []);
        } catch { /* silent */ }
        finally { setLoadingEquipment(false); }
    }, [activeTab, category, sub, equipmentCondition]);

    useEffect(() => {
        const task = InteractionManager.runAfterInteractions(() => { loadEquipment(); });
        return () => task.cancel();
    }, [loadEquipment]);

    const pickEquipmentMedia = async () => {
        if (equipmentMedia.length >= 5) return Alert.alert('', 'En fazla 5 medya ekleyebilirsiniz');
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) { Alert.alert('', 'Galeri izni gerekli'); return; }
        const result = await ImagePicker.launchImageLibraryAsync({
            mediaTypes: ['images', 'videos'],
            allowsMultipleSelection: true,
            quality: 0.85,
            videoMaxDuration: 60,
            selectionLimit: 5 - equipmentMedia.length,
        });
        if (!result.canceled) {
            const picked = result.assets.map(a => ({ uri: a.uri, type: a.type === 'video' ? 'video' : 'image' }));
            setEquipmentMedia(prev => [...prev, ...picked].slice(0, 5));
        }
    };

    const submitEquipment = async () => {
        if (!equipmentForm.title.trim()) return Alert.alert('', 'Ürün adı zorunludur');
        setSubmittingEquipment(true);
        try {
            let uploadedUrls = [];
            if (equipmentMedia.length > 0) {
                setUploadingEquipmentMedia(true);
                for (const media of equipmentMedia) {
                    const form = new FormData();
                    const isVideo = media.type === 'video';
                    form.append('file', { uri: media.uri, name: isVideo ? 'eq.mp4' : 'eq.jpg', type: isVideo ? 'video/mp4' : 'image/jpeg' });
                    const { data } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
                    uploadedUrls.push(data.url);
                }
                setUploadingEquipmentMedia(false);
            }
            await api.post('/equipment', { ...equipmentForm, category, subCategory: sub, price: parseInt(equipmentForm.price) || 0, images: uploadedUrls });
            setShowEquipmentForm(false);
            setEquipmentForm({ title:'', price:'', condition:'NEW', description:'', location:'', images:[] });
            setEquipmentMedia([]);
            loadEquipment();
        } catch (e) { Alert.alert('', e?.response?.data?.message || t.actionFailed); }
        finally { setSubmittingEquipment(false); setUploadingEquipmentMedia(false); }
    };

    const loadNews = useCallback(async () => {
        if (loadingNews) return;
        setLoadingNews(true);
        try {
            const { data } = await api.get(`/news/${sub}`, { params: { lang } });
            setNews(Array.isArray(data) ? data : []);
        } catch { setNews([]); }
        finally { setLoadingNews(false); }
    }, [sub, lang]);

    useEffect(() => {
        if (activeTab === 'news') loadNews();
    }, [activeTab, lang]);

    const [mediaShareType, setMediaShareType] = useState('POST'); // POST | STORY | REEL
    const [showMediaTypeSheet, setShowMediaTypeSheet] = useState(false);
    const [shareMusic, setShareMusic] = useState(null);
    const [musicSheetOpen, setMusicSheetOpen] = useState(false);
    const [musicTrimOpen, setMusicTrimOpen] = useState(false);
    const [musicQuery, setMusicQuery] = useState('');
    const [musicResults, setMusicResults] = useState([]);
    const [searchingMusic, setSearchingMusic] = useState(false);
    const musicTimer = useRef(null);
    const [trimStart, setTrimStart] = useState('0');
    const [trimEnd, setTrimEnd] = useState('30');
    const [musicDuration, setMusicDuration] = useState(null);
    const [previewPlaying, setPreviewPlaying] = useState(false);
    const musicSoundRef = useRef(null);
    const [shareLocation, setShareLocation] = useState('');
    const [gettingLocation, setGettingLocation] = useState(false);

    const stopMusicPreview = async () => {
        try {
            if (musicSoundRef.current) {
                await musicSoundRef.current.stopAsync();
                await musicSoundRef.current.unloadAsync();
                musicSoundRef.current = null;
            }
        } catch {}
        setPreviewPlaying(false);
    };

    const openTrimFor = async (music) => {
        await stopMusicPreview();
        setShareMusic(music);
        setTrimStart('0');
        setTrimEnd(music.duration ? String(Math.min(30, Math.floor(music.duration))) : '30');
        setMusicDuration(music.duration || null);
        setMusicTrimOpen(true);
        setMusicSheetOpen(false);
    };

    const previewTrim = async () => {
        if (previewPlaying) { await stopMusicPreview(); return; }
        if (!shareMusic?.previewUrl) return;
        try {
            await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
            const start = Math.max(0, parseFloat(trimStart) || 0);
            const end = Math.max(start + 1, parseFloat(trimEnd) || 30);
            const { sound } = await Audio.Sound.createAsync(
                { uri: shareMusic.previewUrl },
                { shouldPlay: true, positionMillis: Math.floor(start * 1000) }
            );
            musicSoundRef.current = sound;
            setPreviewPlaying(true);
            sound.setOnPlaybackStatusUpdate(status => {
                if (status.didJustFinish || (status.isPlaying && status.positionMillis >= end * 1000)) {
                    stopMusicPreview();
                }
            });
            setTimeout(() => stopMusicPreview(), (end - start) * 1000 + 300);
        } catch { Alert.alert('', 'Önizleme oynatılamadı'); }
    };

    const pickPhoneAudio = async () => {
        try {
            const result = await DocumentPicker.getDocumentAsync({ type: 'audio/*', copyToCacheDirectory: true });
            if (result.canceled) return;
            const asset = result.assets[0];
            const music = {
                title: asset.name.replace(/\.[^.]+$/, ''),
                artist: 'Telefon',
                coverUrl: null,
                previewUrl: asset.uri,
                isLocal: true,
                localUri: asset.uri,
            };
            await openTrimFor(music);
        } catch { Alert.alert('', 'Ses dosyası seçilemedi'); }
    };

    const searchDeezer = (q) => {
        setMusicQuery(q);
        clearTimeout(musicTimer.current);
        if (!q.trim()) { setMusicResults([]); return; }
        musicTimer.current = setTimeout(async () => {
            setSearchingMusic(true);
            try {
                const res = await fetch(`https://api.deezer.com/search?q=${encodeURIComponent(q)}&limit=15&output=json`);
                const json = await res.json();
                setMusicResults(json.data || []);
            } catch { setMusicResults([]); }
            finally { setSearchingMusic(false); }
        }, 500);
    };

    const selectTrack = (track) => {
        const music = { title: track.title, artist: track.artist.name, coverUrl: track.album.cover_small, previewUrl: track.preview, duration: 30 };
        setMusicQuery('');
        setMusicResults([]);
        openTrimFor(music);
    };

    const getGpsLocation = async () => {
        setGettingLocation(true);
        try {
            const perm = await Location.requestForegroundPermissionsAsync();
            if (!perm.granted) { Alert.alert('', 'Konum izni gerekli'); return; }
            const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const [geo] = await Location.reverseGeocodeAsync({ latitude: pos.coords.latitude, longitude: pos.coords.longitude });
            const parts = [geo.district || geo.subregion, geo.city || geo.region, geo.country].filter(Boolean);
            setShareLocation(parts.join(', '));
        } catch { Alert.alert('', 'Konum alınamadı'); }
        finally { setGettingLocation(false); }
    };

    const pickMediaShare = async (type) => {
        setMediaShareType(type);
        setShowMediaTypeSheet(false);
        const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (!perm.granted) return Alert.alert('', 'Galeri izni gerekli');
        const result = await ImagePicker.launchImageLibraryAsync({ mediaTypes: type === 'REEL' ? ['videos'] : ['images', 'videos'], quality: 0.85 });
        if (!result.canceled) { setMediaShareUri(result.assets[0].uri); setShowMediaShare(true); }
    };

    const submitMediaShare = async () => {
        if (!mediaShareUri) return;
        setSubmittingMediaShare(true);
        try {
            const form = new FormData();
            const isVideo = mediaShareUri.includes('.mp4') || mediaShareUri.includes('.mov') || mediaShareUri.includes('video');
            form.append('file', { uri: mediaShareUri, name: isVideo ? 'media.mp4' : 'media.jpg', type: isVideo ? 'video/mp4' : 'image/jpeg' });
            const { data: uploadData } = await api.post('/upload', form, { headers: { 'Content-Type': 'multipart/form-data' } });
            const { data: newPost } = await api.post('/posts', {
                category, subCategory: sub,
                type: mediaShareType === 'STORY' ? 'STORY' : 'POST',
                content: mediaShareCaption || '',
                ...(isVideo ? { videoUrl: uploadData.url } : { imageUrl: uploadData.url }),
                ...(shareMusic && {
                    musicName: shareMusic.title,
                    musicArtist: shareMusic.artist,
                    musicCoverUrl: shareMusic.coverUrl || undefined,
                    musicUrl: shareMusic.uploadedUrl || shareMusic.previewUrl,
                    musicStartTime: parseFloat(trimStart) || 0,
                    musicEndTime: parseFloat(trimEnd) || 30,
                }),
                ...(shareLocation && { location: shareLocation }),
            });
            if (mediaShareType === 'STORY') {
                const storyUserId = newPost.userId;
                setMediaStories(prev => {
                    const idx = prev.findIndex(g => g.user?.id === storyUserId);
                    if (idx >= 0) {
                        const updated = [...prev];
                        updated[idx] = { ...updated[idx], stories: [newPost, ...updated[idx].stories] };
                        return updated;
                    }
                    return [{ user: newPost.user, stories: [newPost] }, ...prev];
                });
            } else {
                setMediaPosts(prev => [newPost, ...prev]);
            }
            setShowMediaShare(false);
            setMediaShareUri(null);
            setMediaShareCaption('');
            setShareMusic(null);
            setShareLocation('');
            setTrimStart('0');
            setTrimEnd('30');
            await stopMusicPreview();
        } catch (e) { Alert.alert('', e?.response?.data?.message || t.actionFailed); }
        finally { setSubmittingMediaShare(false); }
    };

    const submitTextPost = async () => {
        const text = newPostText.trim();
        if (!text) return;
        setSubmittingPost(true);
        try {
            const { data: newPost } = await api.post('/posts', { category, subCategory: sub, content: text, type: 'POST' });
            setNewPostText('');
            setTextPosts(prev => [newPost, ...prev]);
        } catch (e) { Alert.alert('', e?.response?.data?.message || t.actionFailed); }
        finally { setSubmittingPost(false); }
    };

    const deleteEquipment = async (id) => {
        try {
            await api.delete(`/equipment/${id}`);
            setEquipmentListings(prev => prev.filter(e => e.id !== id));
            setSelectedEquipment(null);
        } catch (e) { Alert.alert('', e?.response?.data?.message || t.actionFailed); }
    };

    const reportListing = (type, id) => {
        const reasons = ['Yanıltıcı içerik', 'Uygunsuz görsel', 'Sahte ilan', 'Diğer'];
        Alert.alert('İlanı Bildir', 'Bildiri sebebini seçin:', [
            ...reasons.map(r => ({
                text: r,
                onPress: async () => {
                    try {
                        setReportingListingId(id);
                        await api.post(`/${type}/${id}/report`, { reason: r });
                        Alert.alert('', 'Bildiriminiz alındı. Teşekkürler.');
                        if (type === 'equipment') setSelectedEquipment(null);
                    } catch (e) {
                        Alert.alert('', e?.response?.data?.message || 'Bir hata oluştu');
                    } finally { setReportingListingId(null); }
                },
            })),
            { text: 'İptal', style: 'cancel' },
        ]);
    };

    const handleJoinTournament = useCallback(async (item, partnerId) => {
        try {
            await api.post(`/tournaments/${item.id}/join`, partnerId ? { partnerId } : undefined);
            Alert.alert('', t.tournJoinSent);
            loadTournaments();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.tournJoinFailed);
        }
    }, [loadTournaments, t]);

    const handleCancelJoinTournament = useCallback(async (id, reason) => {
        try {
            const { data } = await api.delete(`/tournaments/${id}/join`, reason ? { data: { reason } } : undefined);
            if (data?.cancelRequested) {
                const penaltyMsg = data.penaltyApplied
                    ? '\n\n🚨 Ceza uygulandı: −0.50 ELO puanı ve 5 turnuva katılım yasağı aldınız.'
                    : '';
                Alert.alert('⚠️ İptal Talebi Gönderildi', 'Talebiniz turnuva düzenleyicisine iletildi. Onaylaması bekleniyor.' + penaltyMsg);
            }
            loadTournaments();
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || t.actionFailed);
        }
    }, [loadTournaments, t]);

    const handleDeleteTournament = useCallback((id) => {
        Alert.alert('', t.tournDeleteConfirm, [
            { text: t.no, style: 'cancel' },
            { text: t.yes, style: 'destructive', onPress: async () => {
                try {
                    await api.delete(`/tournaments/${id}`);
                    loadTournaments();
                } catch (e) {
                    Alert.alert('', e?.response?.data?.message || t.actionFailed);
                }
            }},
        ]);
    }, [loadTournaments, t]);

    // Real-time: tournament deleted by creator → remove from list instantly
    useEffect(() => {
        const off = onSocket('tournament:deleted', ({ tournamentId }) => {
            setTournaments(prev => prev.filter(t => t.id !== tournamentId));
        });
        return off;
    }, []);

    // Real-time updates via socket
    useEffect(() => {
        const offUpdate = onSocket('rivalUpdate', (updated) => {
            if (updated.category?.toUpperCase() !== category?.toUpperCase() || updated.subCategory !== sub) return;
            setRivals(prev => {
                const exists = prev.some(r => r.id === updated.id);
                if (updated.status === 'MATCHED' || updated.status === 'CANCELLED') {
                    return prev.filter(r => r.id !== updated.id);
                }
                if (exists) return prev.map(r => r.id === updated.id ? { ...r, ...updated } : r);
                return [updated, ...prev];
            });
            setMatchedUpcoming(prev => {
                if (updated.status !== 'MATCHED') return prev;
                const exists = prev.some(r => r.id === updated.id);
                if (exists) return prev.map(r => r.id === updated.id ? { ...r, ...updated } : r);
                return [updated, ...prev];
            });
            // Score confirmed → move from pendingScore to archiveRivals
            if (updated.scoreStatus === 'CONFIRMED') {
                setPendingScore(prev => prev.filter(r => r.id !== updated.id));
                setArchiveRivals(prev => {
                    if (prev.some(r => r.id === updated.id)) return prev;
                    return [updated, ...prev];
                });
            } else if (updated.scoreStatus === 'PENDING') {
                // Score just submitted → add to pendingScore if it belongs there
                setPendingScore(prev => {
                    if (prev.some(r => r.id === updated.id)) return prev.map(r => r.id === updated.id ? { ...r, ...updated } : r);
                    return [updated, ...prev];
                });
            }
        });
        const offDeleted = onSocket('rivalDeleted', ({ rivalId, subCategory }) => {
            if (subCategory && subCategory !== sub) return;
            setRivals(prev => prev.filter(r => r.id !== rivalId));
            setPlayerWanted(prev => prev.filter(r => r.id !== rivalId));
            setMatchedUpcoming(prev => prev.filter(r => r.id !== rivalId));
        });
        const offReconnect = onSocketReconnect(() => load());
        return () => { offUpdate(); offDeleted(); offReconnect(); };
    }, [category, sub]);

    const handleNearMe = async () => {
        setLocationLoading(true);
        try {
            const { status } = await Location.requestForegroundPermissionsAsync();
            if (status !== 'granted') { Alert.alert(t.locationPermTitle, t.locationPermMsg); return; }
            const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
            const [geo] = await Location.reverseGeocodeAsync(loc.coords);
            const city = geo.region || geo.subregion || geo.city || '';
            if (city) setFilterCity(city);
            else Alert.alert(t.error, t.cityNotFoundMsg);
        } catch { Alert.alert(t.error, t.locationFailedMsg); }
        finally { setLocationLoading(false); }
    };

    const today = new Date();
    const applyFilter = (item) => {
        if (filterCity.trim()) {
            const q = filterCity.trim().toLowerCase();
            const loc = (item.location || '').toLowerCase();
            const court = (item.courtName || '').toLowerCase();
            const addr = (item.courtAddress || '').toLowerCase();
            // Esnek programda konum boş olur; gönderenin ilini baz al
            const senderCity = item.flexibleSchedule ? (item.sender?.city || '').toLowerCase() : '';
            if (!loc.includes(q) && !court.includes(q) && !addr.includes(q) && !senderCity.includes(q)) return false;
        }
        if (filterDate !== 'all' && item.matchDate) {
            const d = new Date(item.matchDate);
            if (filterDate === 'today') {
                if (d.toDateString() !== today.toDateString()) return false;
            } else if (filterDate === 'week') {
                const weekEnd = new Date(today); weekEnd.setDate(today.getDate() + 7);
                if (d < today || d > weekEnd) return false;
            }
        }
        return true;
    };
    const filteredRivals = rivals.filter(applyFilter);
    const filteredMatchedUpcoming = matchedUpcoming.filter(applyFilter);

    const filteredTournaments = tournaments.filter(tourn => {
        if (filterCity) {
            const q = filterCity.trim().toLowerCase();
            const inCity = (tourn.city || '').toLowerCase().includes(q);
            const inLoc = (tourn.location || '').toLowerCase().includes(q);
            if (!inCity && !inLoc) return false;
        }
        if (filterDate !== 'all') {
            const d = new Date(tourn.startDate || tourn.eventDate);
            if (isNaN(d)) return true;
            if (filterDate === 'today') { if (d.toDateString() !== today.toDateString()) return false; }
            else if (filterDate === 'week') { const w = new Date(today); w.setDate(today.getDate() + 7); if (d < today || d > w) return false; }
        }
        return true;
    });

    const filteredCoaches = coachListings.filter(c => {
        if (!filterCity) return true;
        const q = filterCity.trim().toLowerCase();
        return (c.city || '').toLowerCase().includes(q) || (c.location || '').toLowerCase().includes(q);
    });

    // Compact filter bar rendered in each tab (single row)
    // Ortak bildirim butonu — kısa bas profil ilini toggle, uzun bas picker açar
    const cityAlertDesc = {
        rivals:      lang === 'tr'
            ? `Seçtiğin illerde yeni ${sub} ile ilgili rakip arayan ilanların bildirimini alırsın.`
            : `You'll get notified about new ${sub} opponent listings in your selected cities.`,
        tournaments: lang === 'tr'
            ? `Seçtiğin illerde yeni ${sub} turnuva ilanlarının bildirimini alırsın.`
            : `You'll get notified about new ${sub} tournament listings in your selected cities.`,
        coaches:     lang === 'tr'
            ? `Seçtiğin illerde yeni ${sub} antrenör ilanlarının bildirimini alırsın.`
            : `You'll get notified about new ${sub} coach listings in your selected cities.`,
        equipment:   lang === 'tr'
            ? `Seçtiğin illerde yeni ${sub} ekipman ilanlarının bildirimini alırsın.`
            : `You'll get notified about new ${sub} equipment listings in your selected cities.`,
        player_wanted: lang === 'tr'
            ? `Seçtiğin illerde yeni ${sub} oyuncu arama ilanlarının bildirimini alırsın.`
            : `You'll get notified about new ${sub} player wanted listings in your selected cities.`,
    };

    const CityAlertBtn = ({ tab }) => {
        const cities = tabSubCities[tab] || [];
        const active = cities.length > 0;
        const isLoading = cityAlertLoading === tab;
        return (
            <TouchableOpacity
                onPress={() => isLoading ? null : quickToggleTab(tab)}
                onLongPress={() => setCityPickerTab(tab)}
                delayLongPress={400}
                disabled={isLoading}
                style={{ paddingVertical:3, paddingHorizontal:5, borderRadius:6, backgroundColor: active ? cfg.color+'20' : '#ffffff10', borderWidth:1, borderColor: active ? cfg.color+'60' : '#ffffff20', alignItems:'center', justifyContent:'center' }}
            >
                {isLoading
                    ? <ActivityIndicator size="small" color={cfg.color} style={{ width:18 }} />
                    : <>
                        <Text style={{ fontSize:11 }}>{active ? '🔔' : '🔕'}</Text>
                        {active && <Text style={{ color:cfg.color, fontSize:8, fontWeight:'800' }}>{t.cityBellCount(cities.length)}</Text>}
                      </>
                }
            </TouchableOpacity>
        );
    };

    const CityAlertRow = ({ tab, children }) => {
        const cities = tabSubCities[tab] || [];
        const active = cities.length > 0;
        const desc = cityAlertDesc[tab] || '';
        return (
            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 }}>
                {children}
                <CityAlertBtn tab={tab} />
                <Text numberOfLines={3} style={{ color: active ? cfg.color : '#6b7280', fontSize:9, lineHeight:13, flex:1 }}>{desc}</Text>
            </View>
        );
    };

    const CompactFilter = ({ showDateChips = true, showNearMe = true }) => (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 2, paddingVertical: 2 }}>
            <TouchableOpacity
                onPress={() => setShowCityFilter(true)}
                style={{ flexDirection:'row', alignItems:'center', gap:4, backgroundColor:colors.surface2, borderRadius:7, paddingVertical:5, paddingHorizontal:8, borderWidth:1, borderColor: filterCity ? cfg.color+'60' : colors.border, minWidth:70 }}
            >
                <Text style={{ color: filterCity ? cfg.color : colors.textMuted, fontSize:11, fontWeight:'700' }} numberOfLines={1}>
                    {filterCity ? filterCity : '📍 İl'}
                </Text>
                {filterCity
                    ? <TouchableOpacity onPress={(e) => { e.stopPropagation?.(); setFilterCity(''); }} hitSlop={{ top:6, bottom:6, left:6, right:6 }}>
                        <Text style={{ color: colors.textMuted, fontSize:11 }}>✕</Text>
                      </TouchableOpacity>
                    : <Text style={{ color:colors.textMuted, fontSize:10 }}>▾</Text>
                }
            </TouchableOpacity>
            {showNearMe && <TouchableOpacity
                onPress={handleNearMe}
                disabled={locationLoading}
                style={{ backgroundColor:cfg.color+'15', borderRadius:7, paddingVertical:5, paddingHorizontal:8, borderWidth:1, borderColor:cfg.color+'30' }}
            >
                {locationLoading
                    ? <ActivityIndicator size="small" color={cfg.color} style={{ width:30 }} />
                    : <Text style={{ color:cfg.color, fontSize:11, fontWeight:'700' }}>{t.nearMeBtn}</Text>
                }
            </TouchableOpacity>}
            {showDateChips && [['all',t.allFilter],['today',t.todayFilter],['week',t.weekFilter]].map(([val, label]) => (
                <TouchableOpacity
                    key={val}
                    onPress={() => setFilterDate(val)}
                    style={{ backgroundColor: filterDate===val ? cfg.color+'25' : colors.surface2, borderRadius:7, paddingVertical:5, paddingHorizontal:8, borderWidth:1, borderColor: filterDate===val ? cfg.color : colors.border }}
                >
                    <Text style={{ color: filterDate===val ? cfg.color : colors.textMuted, fontSize:11, fontWeight:'700' }}>{label}</Text>
                </TouchableOpacity>
            ))}
        </ScrollView>
    );

    return (
        <>
        <View style={[s.container, { paddingTop: Platform.OS==='ios' ? 56 : 40 }]}>
            <CityPickerModal
                visible={showCityFilter}
                onClose={() => setShowCityFilter(false)}
                onSelect={setFilterCity}
                currentValue={filterCity}
            />

            {/* Bildirim il seçici — tüm sekmeler için ortak */}
            <Modal visible={cityPickerTab !== null} animationType="slide" transparent onRequestClose={() => setCityPickerTab(null)}>
                <View style={{ flex:1, backgroundColor:'#00000090', justifyContent:'flex-end' }}>
                    <View style={{ backgroundColor:colors.surface, borderTopLeftRadius:18, borderTopRightRadius:18, maxHeight:'75%' }}>
                        <View style={{ flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:colors.border }}>
                            <Text style={{ color:'#fff', fontSize:15, fontWeight:'800', flex:1 }}>
                                🔔 {sportDisplayName} — Bildirim İlleri
                            </Text>
                            <TouchableOpacity onPress={() => setCityPickerTab(null)}>
                                <Text style={{ color:colors.textMuted, fontSize:20 }}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={{ color:colors.textMuted, fontSize:12, paddingHorizontal:16, paddingTop:8, paddingBottom:4 }}>
                            Seçtiğin illerden yeni {sportDisplayName} bildirimi alırsın
                        </Text>
                        <ScrollView contentContainerStyle={{ paddingVertical:8 }}>
                            {TR_PROVINCES.map(province => {
                                const isChecked = cityPickerTab ? (tabSubCities[cityPickerTab] || []).includes(province) : false;
                                const isLoading = cityPickerTogglingCity === province;
                                return (
                                    <TouchableOpacity
                                        key={province}
                                        onPress={() => cityPickerTab && toggleTabCity(cityPickerTab, province)}
                                        disabled={cityPickerTogglingCity !== null}
                                        style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:16, paddingVertical:11, borderBottomWidth:1, borderBottomColor:colors.border+'40' }}
                                    >
                                        <Text style={{ flex:1, color:'#fff', fontSize:14, fontWeight: isChecked ? '700' : '400' }}>{province}</Text>
                                        {isLoading
                                            ? <ActivityIndicator size="small" color={cfg.color} />
                                            : <Text style={{ color: isChecked ? cfg.color : colors.textMuted, fontSize:18 }}>{isChecked ? '●' : '○'}</Text>
                                        }
                                    </TouchableOpacity>
                                );
                            })}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Header */}
            <View style={s.header}>
                <TouchableOpacity onPress={() => navigation.goBack()}>
                    <Text style={[s.back, { color: cfg.color }]}>{t.back}</Text>
                </TouchableOpacity>
                <Text style={s.title}>{cfg.emoji} {cfg.name}</Text>
                {sub === 'tennis' && (
                    <TouchableOpacity onPress={() => setShowSpotlight(true)}>
                        <Text style={{ fontSize:22 }}>🃏</Text>
                    </TouchableOpacity>
                )}
            </View>

            {/* Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={s.tabBar} contentContainerStyle={s.tabBarInner}>
                {tabs.map(tab => (
                    <TouchableOpacity key={tab} onPress={() => setActiveTab(tab)}
                        style={[s.tab, activeTab===tab && { backgroundColor: cfg.color, borderColor: cfg.color }]}>
                        <Text style={[s.tabText, activeTab===tab && s.tabTextActive]}>{t[tab+'Tab']}</Text>
                    </TouchableOpacity>
                ))}
            </ScrollView>

            {loading ? (
                <ActivityIndicator color={cfg.color} style={{ marginTop:40 }} />
            ) : (
                <ScrollView
                    contentContainerStyle={s.list}
                    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={cfg.color} />}
                >
                    {/* ── RIVALS ── */}
                    {activeTab === 'rivals' && (
                        <>
                            {/* İlan oluştur + bildirim butonu yan yana */}
                            <CityAlertRow tab="rivals">
                                <TouchableOpacity style={[s.createBtn, { marginBottom:0 }]} onPress={() => setShowCreateRival(true)}>
                                    <Text style={[s.createBtnText, { color: cfg.color }]}>{t.createAdBtn}</Text>
                                </TouchableOpacity>
                            </CityAlertRow>

                            {/* Kompakt tek satır filtre */}
                            <CompactFilter showDateChips={true} />

                            {filteredRivals.length === 0
                                ? <EmptyState emoji="⚔️" text={rivals.length > 0 ? t.noFilterMatch : t.emptyRivals} />
                                : (
                                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
                                        {filteredRivals.map(item => (
                                            <RivalCard key={item.id} item={item} myId={myId} sub={sub} onRefresh={load} navigation={navigation} autoOpen={item.id === autoOpenId} onAutoOpened={() => setAutoOpenId(null)} myRating={myRating} />
                                        ))}
                                    </View>
                                )
                            }

                            {/* Yaklaşan Maçlar — tüm ilanların altında, filtreye tabi */}
                            {filteredMatchedUpcoming.length > 0 && (
                                <>
                                    <TouchableOpacity
                                        onPress={() => setUpcomingExpanded(v => !v)}
                                        style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom: upcomingExpanded ? 8 : 4 }}
                                    >
                                        <Text style={s.sectionTitle}>{t.upcomingMatchesTitle} ({filteredMatchedUpcoming.length})</Text>
                                        <Text style={{ color: colors.textSecondary, fontSize:18, fontWeight:'700', marginTop:-4 }}>
                                            {upcomingExpanded ? '▼' : '›'}
                                        </Text>
                                    </TouchableOpacity>
                                    {upcomingExpanded && (
                                        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
                                            {filteredMatchedUpcoming.map(m => (
                                                <UpcomingCard key={m.id} match={m} myId={myId} onRefresh={load} isMatched onOpenComments={openComments} onUserPress={setProfileUserId} />
                                            ))}
                                        </View>
                                    )}
                                </>
                            )}

                            {/* Skor Bekleyen Maçlar */}
                            {pendingScore.length > 0 && (
                                <>
                                    <Text style={[s.sectionTitle, { color: '#f97316' }]}>⏳ {t.pendingScoreTitle}</Text>
                                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
                                        {pendingScore.map(m => (
                                            <UpcomingCard key={m.id} match={m} myId={myId} onRefresh={load} isMatched onOpenComments={openComments} onUserPress={setProfileUserId} />
                                        ))}
                                    </View>
                                </>
                            )}
                        </>
                    )}

                    {/* ── PLAYER WANTED ── */}
                    {activeTab === 'player_wanted' && (
                        <>
                            <TouchableOpacity style={[s.createBtn, { borderColor: cfg.color+'60' }]} onPress={() => setShowCreatePW(true)}>
                                <Text style={[s.createBtnText, { color: cfg.color }]}>{t.createPlayerWantedBtn}</Text>
                            </TouchableOpacity>
                            <CompactFilter showDateChips={true} />
                            {playerWanted.length === 0
                                ? <EmptyState emoji="👤" text={t.emptyPlayerWanted} />
                                : (
                                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
                                        {playerWanted.map(item => (
                                            <RivalCard key={item.id} item={item} myId={myId} sub={sub} onRefresh={load} navigation={navigation} myRating={myRating} />
                                        ))}
                                    </View>
                                )
                            }
                        </>
                    )}

                    {/* ── TOURNAMENTS ── */}
                    {activeTab === 'tournaments' && (() => {
                        const inProgress = filteredTournaments.filter(t => t.status === 'IN_PROGRESS');
                        const open = filteredTournaments.filter(t => t.status === 'OPEN');
                        const completed = filteredTournaments.filter(t => t.status === 'COMPLETED');
                        const shown = tournSubTab === 'open' ? open : tournSubTab === 'inprogress' ? inProgress : completed;
                        const renderCard = (item) => (
                            <TournamentCard
                                key={item.id}
                                item={item}
                                myId={myId}
                                myIsAdmin={myIsAdmin}
                                t={t}
                                cfg={cfg}
                                onJoin={handleJoinTournament}
                                onCancelJoin={handleCancelJoinTournament}
                                onDelete={handleDeleteTournament}
                                onUpdated={loadTournaments}
                                openChatTournamentId={openChatTournamentId}
                                onChatOpened={() => navigation.setParams({ openChatTournamentId: undefined })}
                            />
                        );
                        return (
                            <>
                                <CityAlertRow tab="tournaments">
                                    <TouchableOpacity
                                        style={[s.createBtn, { marginBottom:0, borderColor: cfg.color + '60' }]}
                                        onPress={() => {
                                            if (myIsAdmin || tournamentPermStatus === 'APPROVED') setShowCreateTournament(true);
                                            else setShowTournamentPermission(true);
                                        }}
                                    >
                                        <Text style={[s.createBtnText, { color: cfg.color }]}>{t.createTournamentBtn}</Text>
                                    </TouchableOpacity>
                                </CityAlertRow>

                                {/* Sub-tab: Açık İlanlar / Devam Eden */}
                                <View style={{ flexDirection:'row', gap:6, marginBottom:8 }}>
                                    {[
                                        { key:'open',       label: t.tournOpenTab,       count: open.length },
                                        { key:'inprogress', label: t.tournInProgressTab, count: inProgress.length },
                                        ...(completed.length > 0 ? [{ key:'completed', label:`✅ Tamamlanan`, count: completed.length }] : []),
                                    ].map(st => (
                                        <TouchableOpacity key={st.key} onPress={() => setTournSubTab(st.key)}
                                            style={{ flex:1, paddingVertical:7, borderRadius:8, alignItems:'center', backgroundColor: tournSubTab===st.key ? cfg.color : colors.surface2, borderWidth:1, borderColor: tournSubTab===st.key ? cfg.color : colors.border }}>
                                            <Text style={{ color: tournSubTab===st.key ? '#fff' : colors.textMuted, fontSize:12, fontWeight:'800' }}>
                                                {st.label}{st.count > 0 ? `  ${st.count}` : ''}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>

                                <CompactFilter showDateChips={true} />

                                {(loadingTournaments && tournaments.length === 0)
                                    ? <ActivityIndicator color={cfg.color} style={{ marginTop:40 }} />
                                    : (<>
                                        {shown.map(renderCard)}
                                        {shown.length === 0 && (
                                            <EmptyState emoji="🏆" text={tournSubTab === 'open' ? t.emptyTournOpen : tournSubTab === 'inprogress' ? t.emptyTournInProgress : t.emptyTournCompleted} />
                                        )}
                                    </>)
                                }
                            </>
                        );
                    })()}

                    {/* ── COACHES ── */}

                    {/* ── EKİPMAN ── */}
                    {activeTab === 'equipment' && (() => {
                        const filteredEquipment = equipmentListings.filter(eq => {
                            if (equipmentSearch && !eq.title.toLowerCase().includes(equipmentSearch.toLowerCase())) return false;
                            // unified city filter — filterCity overrides equipmentCity
                            const cityQ = filterCity || equipmentCity;
                            if (cityQ) {
                                const city = cityQ.toLowerCase();
                                const inLoc = (eq.location||'').toLowerCase().includes(city);
                                const inCity = (eq.city||'').toLowerCase().includes(city);
                                if (!inLoc && !inCity) return false;
                            }
                            if (equipmentMinPrice && eq.price < parseInt(equipmentMinPrice)) return false;
                            if (equipmentMaxPrice && eq.price > parseInt(equipmentMaxPrice)) return false;
                            return true;
                        });
                        return (
                        <View>
                            {/* Kompakt filtre + bildirim butonu */}
                            {/* Ekipman: İl filtresi + zil + yazı tek hizada */}
                            {(() => {
                                const cities = tabSubCities['equipment'] || [];
                                const active = cities.length > 0;
                                return (
                                    <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:8 }}>
                                        <TouchableOpacity
                                            onPress={() => setShowCityFilter(true)}
                                            style={{ flexDirection:'row', alignItems:'center', gap:4, backgroundColor:colors.surface2, borderRadius:7, paddingVertical:5, paddingHorizontal:8, borderWidth:1, borderColor: filterCity ? cfg.color+'60' : colors.border }}
                                        >
                                            <Text style={{ color: filterCity ? cfg.color : colors.textMuted, fontSize:11, fontWeight:'700' }}>
                                                {filterCity ? filterCity : '📍 İl'}
                                            </Text>
                                            {filterCity
                                                ? <TouchableOpacity onPress={() => setFilterCity('')} hitSlop={{ top:6, bottom:6, left:6, right:6 }}>
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>✕</Text>
                                                  </TouchableOpacity>
                                                : <Text style={{ color:colors.textMuted, fontSize:10 }}>▾</Text>
                                            }
                                        </TouchableOpacity>
                                        <CityAlertBtn tab="equipment" />
                                        <Text numberOfLines={2} style={{ color: active ? cfg.color : '#6b7280', fontSize:10, lineHeight:14, flex:1 }}>{cityAlertDesc['equipment']}</Text>
                                    </View>
                                );
                            })()}
                            {/* Durum filtresi */}
                            <View style={{ flexDirection:'row', gap:6, marginBottom:10 }}>
                                {['ALL','NEW','USED'].map(c => (
                                    <TouchableOpacity key={c} onPress={() => setEquipmentCondition(c)}
                                        style={{ flex:1, paddingVertical:7, borderRadius:8, alignItems:'center', backgroundColor: equipmentCondition===c ? cfg.color : colors.surface2, borderWidth:1, borderColor: equipmentCondition===c ? cfg.color : colors.border }}>
                                        <Text style={{ color: equipmentCondition===c ? '#fff' : colors.textSecondary, fontSize:12, fontWeight:'700' }}>
                                            {c==='ALL' ? t.conditionAll : c==='NEW' ? t.conditionNew : t.conditionUsed}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {/* Filtre alanları */}
                            <View style={{ backgroundColor: colors.surface2, borderRadius:10, padding:10, marginBottom:10, borderWidth:1, borderColor: colors.border, gap:8 }}>
                                <TextInput
                                    placeholder={t.equipSearchPh}
                                    placeholderTextColor={colors.textMuted}
                                    value={equipmentSearch}
                                    onChangeText={setEquipmentSearch}
                                    style={{ backgroundColor: colors.surface, borderRadius:8, paddingHorizontal:10, paddingVertical:7, color:'#fff', borderWidth:1, borderColor: colors.border, fontSize:13 }}
                                />
                                <TextInput
                                    placeholder={t.equipCityPh}
                                    placeholderTextColor={colors.textMuted}
                                    value={equipmentCity}
                                    onChangeText={setEquipmentCity}
                                    style={{ backgroundColor: colors.surface, borderRadius:8, paddingHorizontal:10, paddingVertical:7, color:'#fff', borderWidth:1, borderColor: colors.border, fontSize:13 }}
                                />
                                <View style={{ flexDirection:'row', gap:8 }}>
                                    <TextInput
                                        placeholder="Min ₺"
                                        placeholderTextColor={colors.textMuted}
                                        value={equipmentMinPrice}
                                        onChangeText={v => setEquipmentMinPrice(v.replace(/[^0-9]/g,''))}
                                        keyboardType="numeric"
                                        style={{ flex:1, backgroundColor: colors.surface, borderRadius:8, paddingHorizontal:10, paddingVertical:7, color:'#fff', borderWidth:1, borderColor: colors.border, fontSize:13 }}
                                    />
                                    <TextInput
                                        placeholder="Max ₺"
                                        placeholderTextColor={colors.textMuted}
                                        value={equipmentMaxPrice}
                                        onChangeText={v => setEquipmentMaxPrice(v.replace(/[^0-9]/g,''))}
                                        keyboardType="numeric"
                                        style={{ flex:1, backgroundColor: colors.surface, borderRadius:8, paddingHorizontal:10, paddingVertical:7, color:'#fff', borderWidth:1, borderColor: colors.border, fontSize:13 }}
                                    />
                                    {(equipmentSearch || equipmentCity || equipmentMinPrice || equipmentMaxPrice) && (
                                        <TouchableOpacity
                                            onPress={() => { setEquipmentSearch(''); setEquipmentCity(''); setEquipmentMinPrice(''); setEquipmentMaxPrice(''); }}
                                            style={{ justifyContent:'center', paddingHorizontal:10, backgroundColor:'#ef444420', borderRadius:8, borderWidth:1, borderColor:'#ef444440' }}>
                                            <Text style={{ color:'#ef4444', fontSize:11, fontWeight:'700' }}>{t.clearFilter}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                            {/* İlan ekle butonu */}
                            <TouchableOpacity onPress={() => setShowEquipmentForm(true)}
                                style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor: cfg.color+'20', borderRadius:10, paddingVertical:9, marginBottom:10, borderWidth:1, borderColor: cfg.color+'50' }}>
                                <Text style={{ color: cfg.color, fontSize:13, fontWeight:'800' }}>{t.postListingBtn}</Text>
                            </TouchableOpacity>
                            {/* Liste */}
                            {loadingEquipment ? (
                                <ActivityIndicator size="small" color={cfg.color} style={{ marginVertical:10 }} />
                            ) : filteredEquipment.length === 0 ? (
                                <EmptyState emoji="🎾" text={equipmentListings.length === 0 ? "Henüz ekipman ilanı yok" : "Filtreyle eşleşen ilan bulunamadı"} />
                            ) : (
                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8 }}>
                                    {filteredEquipment.map(eq => (
                                        <TouchableOpacity key={eq.id} onPress={() => setSelectedEquipment(eq)}
                                            style={{ width:'48%', backgroundColor: colors.surface2, borderRadius:12, overflow:'hidden', borderWidth:1, borderColor: colors.border }}>
                                            {eq.images?.[0] ? (
                                                <Image source={{ uri: eq.images[0] }} style={{ width:'100%', height:120 }} resizeMode="cover" />
                                            ) : (
                                                <View style={{ width:'100%', height:120, alignItems:'center', justifyContent:'center', backgroundColor: colors.surface }}>
                                                    <Text style={{ fontSize:36 }}>🎾</Text>
                                                </View>
                                            )}
                                            <View style={{ position:'absolute', top:6, left:6, backgroundColor: eq.condition==='NEW' ? '#16a34a' : '#f59e0b', borderRadius:6, paddingHorizontal:5, paddingVertical:2 }}>
                                                <Text style={{ color:'#fff', fontSize:9, fontWeight:'800' }}>{eq.condition==='NEW' ? 'Sıfır' : '2.El'}</Text>
                                            </View>
                                            <View style={{ padding:8 }}>
                                                <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }} numberOfLines={1}>{eq.title}</Text>
                                                <Text style={{ color: cfg.color, fontSize:13, fontWeight:'900', marginTop:2 }}>{eq.price > 0 ? eq.price + ' ₺' : 'Fiyat sor'}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize:10, marginTop:1 }}>@{eq.user?.username}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                            {/* İlan ver formu Modal */}
                            <Modal visible={showEquipmentForm} animationType="slide" onRequestClose={() => { setShowEquipmentForm(false); setEquipmentMedia([]); }}>
                                <View style={{ flex:1, backgroundColor: colors.bg, justifyContent:'flex-end' }}>
                                    <View style={{ backgroundColor: colors.card, borderTopLeftRadius:20, borderTopRightRadius:20, paddingBottom:36, maxHeight:'92%' }}>
                                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding:20 }}>
                                            <Text style={{ color:'#fff', fontSize:16, fontWeight:'900', marginBottom:12 }}>🎾 Ekipman İlanı Ver</Text>
                                            <View style={{ flexDirection:'row', gap:8, marginBottom:10 }}>
                                                {['NEW','USED'].map(c => (
                                                    <TouchableOpacity key={c} onPress={() => setEquipmentForm(f => ({...f, condition:c}))}
                                                        style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:'center', backgroundColor: equipmentForm.condition===c ? cfg.color : colors.surface2, borderWidth:1, borderColor: equipmentForm.condition===c ? cfg.color : colors.border }}>
                                                        <Text style={{ color: equipmentForm.condition===c ? '#fff' : colors.textSecondary, fontSize:13, fontWeight:'700' }}>{c==='NEW' ? '🆕 Sıfır' : '♻️ İkinci El'}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                            <TextInput placeholder="Ürün adı *" placeholderTextColor={colors.textMuted} value={equipmentForm.title} onChangeText={v => setEquipmentForm(f=>({...f,title:v}))} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border }} />
                                            <TextInput placeholder="Fiyat (₺)" placeholderTextColor={colors.textMuted} value={String(equipmentForm.price)} onChangeText={v => setEquipmentForm(f=>({...f,price:v.replace(/[^0-9]/,'')}))} keyboardType="numeric" style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border }} />
                                            <TextInput placeholder="Açıklama (opsiyonel)" placeholderTextColor={colors.textMuted} value={equipmentForm.description} onChangeText={v => setEquipmentForm(f=>({...f,description:v}))} multiline numberOfLines={3} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border, minHeight:70, textAlignVertical:'top' }} />
                                            <CityAutocomplete
                                                value={equipmentForm.location || ''}
                                                onChangeText={v => setEquipmentForm(f=>({...f,location:v}))}
                                                placeholder="Konum / Şehir"
                                                style={{ marginBottom: 10 }}
                                            />

                                            {/* Medya seçici */}
                                            {equipmentMedia.length > 0 && (
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:10 }}>
                                                    {equipmentMedia.map((m, idx) => (
                                                        <View key={idx} style={{ marginRight:8, position:'relative' }}>
                                                            {m.type === 'video'
                                                                ? <View style={{ width:90, height:90, borderRadius:8, backgroundColor:'#1e293b', borderWidth:1, borderColor:colors.border, justifyContent:'center', alignItems:'center' }}>
                                                                    <Text style={{ fontSize:28 }}>🎬</Text>
                                                                    <Text style={{ color:colors.textMuted, fontSize:10, marginTop:2 }}>Video</Text>
                                                                  </View>
                                                                : <Image source={{ uri:m.uri }} style={{ width:90, height:90, borderRadius:8 }} resizeMode="cover" />
                                                            }
                                                            <TouchableOpacity
                                                                onPress={() => setEquipmentMedia(prev => prev.filter((_,i) => i !== idx))}
                                                                style={{ position:'absolute', top:-6, right:-6, backgroundColor:'#ef4444', borderRadius:10, width:20, height:20, justifyContent:'center', alignItems:'center' }}>
                                                                <Text style={{ color:'#fff', fontSize:11, fontWeight:'900' }}>✕</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    ))}
                                                </ScrollView>
                                            )}
                                            {equipmentMedia.length < 5 && (
                                                <TouchableOpacity onPress={pickEquipmentMedia}
                                                    style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:10, borderRadius:8, borderWidth:1, borderColor:colors.border, borderStyle:'dashed', backgroundColor:colors.surface2, marginBottom:14 }}>
                                                    <Text style={{ fontSize:16 }}>📷</Text>
                                                    <Text style={{ color:colors.textSecondary, fontSize:13, fontWeight:'700' }}>
                                                        Fotoğraf / Video Ekle {equipmentMedia.length > 0 ? `(${equipmentMedia.length}/5)` : ''}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}

                                            <View style={{ flexDirection:'row', gap:8 }}>
                                                <TouchableOpacity onPress={() => { setShowEquipmentForm(false); setEquipmentMedia([]); }} style={{ flex:1, paddingVertical:11, borderRadius:10, alignItems:'center', backgroundColor:colors.surface2, borderWidth:1, borderColor:colors.border }}>
                                                    <Text style={{ color:colors.textMuted, fontWeight:'700' }}>İptal</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={submitEquipment} disabled={submittingEquipment || uploadingEquipmentMedia} style={{ flex:2, paddingVertical:11, borderRadius:10, alignItems:'center', backgroundColor: cfg.color }}>
                                                    <Text style={{ color:'#fff', fontWeight:'900', fontSize:14 }}>
                                                        {uploadingEquipmentMedia ? 'Yükleniyor...' : submittingEquipment ? '...' : 'İlanı Yayınla'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
                                        </ScrollView>
                                    </View>
                                </View>
                            </Modal>

                            {/* İlan detay Modal */}
                            <Modal visible={!!selectedEquipment} animationType="slide" transparent onRequestClose={() => setSelectedEquipment(null)}>
                                <View style={{ flex:1, backgroundColor:'#00000090', justifyContent:'flex-end' }}>
                                    <View style={{ backgroundColor: colors.card, borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, paddingBottom:36, maxHeight:'85%' }}>
                                        <ScrollView showsVerticalScrollIndicator={false}>
                                            {selectedEquipment?.images?.length > 0 && (
                                                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:12 }}>
                                                    {(selectedEquipment.images||[]).map((img,idx) => {
                                                        const isVideo = typeof img === 'string' && img.includes('/video/upload/');
                                                        return isVideo
                                                            ? <View key={idx} style={{ width:220, height:160, borderRadius:10, marginRight:8, backgroundColor:'#1e293b', borderWidth:1, borderColor:colors.border, justifyContent:'center', alignItems:'center' }}>
                                                                <Text style={{ fontSize:40 }}>🎬</Text>
                                                                <Text style={{ color:colors.textMuted, fontSize:12, marginTop:4 }}>Video</Text>
                                                              </View>
                                                            : <Image key={idx} source={{ uri:img }} style={{ width:220, height:160, borderRadius:10, marginRight:8 }} resizeMode="cover" />;
                                                    })}
                                                </ScrollView>
                                            )}
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 }}>
                                                <View style={{ backgroundColor: selectedEquipment?.condition==='NEW' ? '#16a34a' : '#f59e0b', borderRadius:6, paddingHorizontal:8, paddingVertical:3 }}>
                                                    <Text style={{ color:'#fff', fontSize:11, fontWeight:'800' }}>{selectedEquipment?.condition==='NEW' ? 'Sıfır' : 'İkinci El'}</Text>
                                                </View>
                                                <Text style={{ color:'#fff', fontSize:16, fontWeight:'900', flex:1 }}>{selectedEquipment?.title}</Text>
                                            </View>
                                            <Text style={{ color: cfg.color, fontSize:20, fontWeight:'900', marginBottom:8 }}>{selectedEquipment?.price > 0 ? selectedEquipment.price + ' ₺' : 'Fiyat sor'}</Text>
                                            {selectedEquipment?.description ? <Text style={{ color:colors.textSecondary, fontSize:13, marginBottom:8 }}>{selectedEquipment.description}</Text> : null}
                                            {selectedEquipment?.location ? <Text style={{ color:colors.textMuted, fontSize:12, marginBottom:4 }}>📍 {selectedEquipment.location}</Text> : null}
                                            <Text style={{ color:colors.textMuted, fontSize:12, marginBottom:12 }}>👤 {selectedEquipment?.user?.fullName || selectedEquipment?.user?.username}</Text>
                                            {selectedEquipment?.userId === myId ? (
                                                <TouchableOpacity onPress={() => Alert.alert('İlanı Sil', 'Bu ilanı silmek istiyor musunuz?', [
                                                    { text:'İptal', style:'cancel' },
                                                    { text:'Sil', style:'destructive', onPress:() => deleteEquipment(selectedEquipment.id) }
                                                ])} style={{ backgroundColor:'#ef444420', borderRadius:10, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:'#ef444450' }}>
                                                    <Text style={{ color:'#ef4444', fontWeight:'800' }}>🗑️ İlanı Sil</Text>
                                                </TouchableOpacity>
                                            ) : (
                                                <TouchableOpacity
                                                    onPress={() => reportListing('equipment', selectedEquipment.id)}
                                                    disabled={reportingListingId === selectedEquipment?.id}
                                                    style={{ backgroundColor:'#f59e0b20', borderRadius:10, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:'#f59e0b50' }}>
                                                    <Text style={{ color:'#f59e0b', fontWeight:'800' }}>🚩 Bildır</Text>
                                                </TouchableOpacity>
                                            )}
                                        </ScrollView>
                                        <TouchableOpacity onPress={() => setSelectedEquipment(null)} style={{ marginTop:12, paddingVertical:10, borderRadius:10, alignItems:'center', backgroundColor:colors.surface2, borderWidth:1, borderColor:colors.border }}>
                                            <Text style={{ color:colors.textMuted, fontWeight:'700' }}>Kapat</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            </Modal>
                        </View>
                        );
                    })()}


                    {activeTab === 'coaches' && (() => {
                        const coachesWithCv = filteredCoaches.filter(c => c.cvUrl);
                        const shown = coachSubTab === 'cvs' ? coachesWithCv : filteredCoaches;
                        return (
                        <>
                            <CityAlertRow tab="coaches">
                                <TouchableOpacity
                                    style={[s.createBtn, { marginBottom:0, borderColor: cfg.color + '60' }]}
                                    onPress={() => setShowCreateCoach(true)}>
                                    <Text style={[s.createBtnText, { color: cfg.color }]} numberOfLines={1}>{t.createCoachBtn}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.createBtn, { marginBottom:0, borderColor:'#16a34a60' }]}
                                    onPress={() => {
                                        const myListing = coachListings.find(c => c.userId === myId);
                                        if (!myListing) return Alert.alert('', 'Önce "İlan Oluştur" ile bir antrenör ilanı açmanız gerekiyor.');
                                        setCvUploadListingId(myListing.id);
                                        setShowCvUploadModal(true);
                                    }}>
                                    <Text style={[s.createBtnText, { color:'#4ade80' }]} numberOfLines={1}>{t.uploadCvBtn}</Text>
                                </TouchableOpacity>
                            </CityAlertRow>

                            <View style={{ flexDirection:'row', gap:6, marginBottom:8 }}>
                                {[
                                    { key:'listings', label: t.coachListingsTab, count: filteredCoaches.length },
                                    { key:'cvs',      label: t.coachCvsTab,     count: coachesWithCv.length },
                                ].map(st => (
                                    <TouchableOpacity key={st.key} onPress={() => setCoachSubTab(st.key)}
                                        style={{ flex:1, paddingVertical:7, borderRadius:8, alignItems:'center', backgroundColor: coachSubTab===st.key ? cfg.color : colors.surface2, borderWidth:1, borderColor: coachSubTab===st.key ? cfg.color : colors.border }}>
                                        <Text style={{ color: coachSubTab===st.key ? '#fff' : colors.textMuted, fontSize:11, fontWeight:'800' }}>
                                            {st.label}{st.count > 0 ? `  ${st.count}` : ''}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            <CompactFilter showDateChips={false} />
                            {loadingCoaches
                                ? <ActivityIndicator color={cfg.color} style={{ marginTop:40 }} />
                                : shown.length === 0
                                    ? <EmptyState emoji="🎓" text={coachSubTab === 'cvs' ? t.noCvYet : (coachListings.length > 0 ? t.noFilterMatch : t.emptyCoaches)} />
                                    : coachSubTab === 'cvs'
                                        ? shown.map(c => (
                                            <View key={c.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor:colors.surface2, borderRadius:12, padding:12, marginBottom:8, borderWidth:1, borderColor:colors.border }}>
                                                <Text style={{ fontSize:22, marginRight:8 }}>📄</Text>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'800' }}>{c.user?.fullName || c.user?.username}</Text>
                                                    <Text style={{ color:colors.textMuted, fontSize:11 }}>{c.credentialLevel}{c.experience > 0 ? ` · ${c.experience} yıl deneyim` : ''}</Text>
                                                </View>
                                                <TouchableOpacity onPress={() => Linking.openURL(c.cvUrl)} style={{ backgroundColor: cfg.color+'20', borderRadius:8, paddingHorizontal:10, paddingVertical:7, borderWidth:1, borderColor: cfg.color+'50' }}>
                                                    <Text style={{ color: cfg.color, fontSize:11, fontWeight:'700' }}>CV'yi Aç</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ))
                                        : shown.map(c => (
                                        <View key={c.id} style={{ backgroundColor:colors.surface2, borderRadius:12, padding:12, marginBottom:8, borderWidth:1, borderColor:colors.border }}>
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 }}>
                                                <Text style={{ fontSize:22 }}>🎓</Text>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'800' }}>{c.credentialLevel}</Text>
                                                    {c.certName && <Text style={{ color:colors.textMuted, fontSize:11 }}>{c.certName}</Text>}
                                                </View>
                                                <TouchableOpacity onPress={() => setProfileUserId(c.userId)}>
                                                    <Text style={{ color:cfg.color, fontSize:11, fontWeight:'700' }}>@{c.user?.username}</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:4 }}>
                                                {c.individual && <View style={{ backgroundColor:cfg.color+'20', borderRadius:6, paddingHorizontal:8, paddingVertical:3 }}><Text style={{ color:cfg.color, fontSize:11, fontWeight:'700' }}>Bireysel {c.priceIndividual > 0 ? `${c.priceIndividual}₺` : ''}</Text></View>}
                                                {c.group && <View style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:8, paddingVertical:3 }}><Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Grup {c.priceGroup > 0 ? `${c.priceGroup}₺` : ''}</Text></View>}
                                                {c.experience > 0 && <Text style={{ color:colors.textMuted, fontSize:11 }}>{c.experience} yıl deneyim</Text>}
                                            </View>
                                            {(c.timeFrom || c.timeTo) && <Text style={{ color:colors.textMuted, fontSize:11 }}>⏰ {c.timeFrom} - {c.timeTo}</Text>}
                                            {c.city && <Text style={{ color:colors.textMuted, fontSize:11 }}>📍 {c.city}{c.location ? ` / ${c.location}` : ''}</Text>}
                                            {c.description && <Text style={{ color:colors.textSecondary, fontSize:12, marginTop:4 }} numberOfLines={2}>{c.description}</Text>}
                                            {c.achievements && <Text style={{ color:'#fbbf24', fontSize:11, marginTop:4 }} numberOfLines={2}>🏆 {c.achievements}</Text>}
                                            {c.userId !== myId && (
                                                <TouchableOpacity
                                                    onPress={() => reportListing('coaches', c.id)}
                                                    disabled={reportingListingId === c.id}
                                                    style={{ alignSelf:'flex-end', marginTop:6, paddingHorizontal:10, paddingVertical:4, borderRadius:6, backgroundColor:'#f59e0b15', borderWidth:1, borderColor:'#f59e0b40' }}>
                                                    <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'700' }}>🚩 Bildir</Text>
                                                </TouchableOpacity>
                                            )}
                                            {(c.certificateUrl || c.cvUrl || (c.achievementUrls || []).length > 0) && (
                                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6, marginTop:6 }}>
                                                    {c.certificateUrl && (
                                                        <TouchableOpacity onPress={() => Linking.openURL(c.certificateUrl)} style={{ backgroundColor:'#1e40af20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#1e40af50' }}>
                                                            <Text style={{ color:'#60a5fa', fontSize:10, fontWeight:'700' }}>📜 Belge</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    {(c.achievementUrls || []).length > 0 && (
                                                        <TouchableOpacity onPress={() => Linking.openURL(c.achievementUrls[0])} style={{ backgroundColor:'#f59e0b20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#f59e0b50' }}>
                                                            <Text style={{ color:'#fbbf24', fontSize:10, fontWeight:'700' }}>🏆 Başarılar ({c.achievementUrls.length})</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    {c.cvUrl && (
                                                        <TouchableOpacity onPress={() => Linking.openURL(c.cvUrl)} style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#16a34a50' }}>
                                                            <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'700' }}>📄 CV</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            )}
                                        </View>
                                    ))
                            }
                        </>
                        );
                    })()}

                    {/* ── Antrenör İlanı Oluştur ── */}
                    <Modal visible={showCreateCoach} animationType="slide" onRequestClose={() => setShowCreateCoach(false)}>
                        <View style={{ flex:1, backgroundColor: colors.bg, justifyContent:'flex-end' }}>
                            <View style={{ backgroundColor: colors.card, borderTopLeftRadius:20, borderTopRightRadius:20, paddingBottom:36, maxHeight:'92%' }}>
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding:20 }}>
                                    <Text style={{ color:'#fff', fontSize:16, fontWeight:'900', marginBottom:12 }}>🎓 Antrenör İlanı Oluştur</Text>

                                    <Text style={{ color:colors.textMuted, fontSize:11, fontWeight:'700', marginBottom:6 }}>Kimlik / Belge</Text>
                                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:10 }}>
                                        {[
                                            { key:'CERTIFIED',   label: t.credCertified },
                                            { key:'LICENSED',    label: t.credLicensed },
                                            { key:'CLUB_COACH',  label: t.credClubCoach },
                                            { key:'INDEPENDENT', label: t.credIndependent },
                                            { key:'AMATEUR',     label: t.credAmateur },
                                        ].map(lvl => (
                                            <TouchableOpacity key={lvl.key} onPress={() => setCoachForm(f => ({...f, credentialLevel:lvl.key}))}
                                                style={{ paddingHorizontal:10, paddingVertical:6, borderRadius:8, backgroundColor: coachForm.credentialLevel===lvl.key ? cfg.color : colors.surface2, borderWidth:1, borderColor: coachForm.credentialLevel===lvl.key ? cfg.color : colors.border }}>
                                                <Text style={{ color: coachForm.credentialLevel===lvl.key ? '#fff' : colors.textSecondary, fontSize:11, fontWeight:'700' }}>{lvl.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <TextInput placeholder="Belge/Sertifika adı (örn. ITF Level 2)" placeholderTextColor={colors.textMuted} value={coachForm.certName} onChangeText={v => setCoachForm(f=>({...f,certName:v}))} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border }} />
                                    <TouchableOpacity onPress={() => pickCoachSingleImage(setCoachCertImage)}
                                        style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:9, borderRadius:8, borderWidth:1, borderColor:colors.border, borderStyle:'dashed', backgroundColor:colors.surface2, marginBottom:10 }}>
                                        <Text style={{ fontSize:14 }}>📜</Text>
                                        <Text style={{ color:colors.textSecondary, fontSize:12, fontWeight:'700' }}>{coachCertImage ? 'Belge Fotoğrafı Seçildi ✓' : 'Belge Fotoğrafı Yükle (opsiyonel)'}</Text>
                                    </TouchableOpacity>
                                    <TextInput placeholder="Deneyim (yıl)" placeholderTextColor={colors.textMuted} value={coachForm.experience} onChangeText={v => setCoachForm(f=>({...f,experience:v.replace(/[^0-9]/,'')}))} keyboardType="numeric" style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', marginBottom:14, borderWidth:1, borderColor:colors.border }} />

                                    <Text style={{ color:colors.textMuted, fontSize:11, fontWeight:'700', marginBottom:6 }}>Ders Tipleri & Ücret</Text>
                                    <View style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
                                        <TouchableOpacity onPress={() => setCoachForm(f => ({...f, individual: !f.individual}))}
                                            style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:'center', backgroundColor: coachForm.individual ? cfg.color : colors.surface2, borderWidth:1, borderColor: coachForm.individual ? cfg.color : colors.border }}>
                                            <Text style={{ color: coachForm.individual ? '#fff' : colors.textSecondary, fontSize:12, fontWeight:'700' }}>{t.individualLesson}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setCoachForm(f => ({...f, group: !f.group}))}
                                            style={{ flex:1, paddingVertical:8, borderRadius:8, alignItems:'center', backgroundColor: coachForm.group ? cfg.color : colors.surface2, borderWidth:1, borderColor: coachForm.group ? cfg.color : colors.border }}>
                                            <Text style={{ color: coachForm.group ? '#fff' : colors.textSecondary, fontSize:12, fontWeight:'700' }}>{t.groupLesson}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {coachForm.individual && (
                                        <TextInput placeholder="Bireysel ders ücreti (₺/saat)" placeholderTextColor={colors.textMuted} value={coachForm.priceIndividual} onChangeText={v => setCoachForm(f=>({...f,priceIndividual:v.replace(/[^0-9]/,'')}))} keyboardType="numeric" style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border }} />
                                    )}
                                    {coachForm.group && (
                                        <View style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
                                            <TextInput placeholder="Grup ücreti (₺/kişi)" placeholderTextColor={colors.textMuted} value={coachForm.priceGroup} onChangeText={v => setCoachForm(f=>({...f,priceGroup:v.replace(/[^0-9]/,'')}))} keyboardType="numeric" style={{ flex:1, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', borderWidth:1, borderColor:colors.border }} />
                                            <TextInput placeholder="Maks. grup" placeholderTextColor={colors.textMuted} value={coachForm.maxGroupSize} onChangeText={v => setCoachForm(f=>({...f,maxGroupSize:v.replace(/[^0-9]/,'')}))} keyboardType="numeric" style={{ width:100, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', borderWidth:1, borderColor:colors.border }} />
                                        </View>
                                    )}

                                    <Text style={{ color:colors.textMuted, fontSize:11, fontWeight:'700', marginTop:6, marginBottom:6 }}>Yer / Zaman</Text>
                                    <View style={{ flexDirection:'row', gap:8, marginBottom:8 }}>
                                        {[
                                            { val: false, label: t.courtSpecifyBtn || 'Kort / Tesis Belirt' },
                                            { val: true,  label: t.courtMutualBtn || 'Ortaklaşa Kararlaştırılır' },
                                        ].map(({ val, label }) => (
                                            <TouchableOpacity key={String(val)}
                                                onPress={() => setCoachForm(f => ({ ...f, locationMutual: val }))}
                                                style={{ flex:1, flexDirection:'row', alignItems:'center', gap:6, backgroundColor: coachForm.locationMutual===val ? cfg.color+'20' : '#ffffff08', borderRadius:8, paddingVertical:7, paddingHorizontal:8, borderWidth:1, borderColor: coachForm.locationMutual===val ? cfg.color : '#ffffff15' }}
                                            >
                                                <View style={{ width:12, height:12, borderRadius:6, borderWidth:2, borderColor: coachForm.locationMutual===val ? cfg.color : '#6b7280', alignItems:'center', justifyContent:'center' }}>
                                                    {coachForm.locationMutual===val && <View style={{ width:5, height:5, borderRadius:3, backgroundColor: cfg.color }} />}
                                                </View>
                                                <Text style={{ color: coachForm.locationMutual===val ? cfg.color : '#6b7280', fontSize:10, fontWeight:'700', flex:1 }}>{label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    {!coachForm.locationMutual && <TextInput placeholder="Konum (kort/tesis adı) *" placeholderTextColor={colors.textMuted} value={coachForm.location} onChangeText={v => setCoachForm(f=>({...f,location:v}))} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border }} />}
                                    <CityAutocomplete
                                        value={coachForm.city || ''}
                                        onChangeText={v => setCoachForm(f=>({...f,city:v}))}
                                        placeholder="Şehir"
                                        style={{ marginBottom: 8 }}
                                    />
                                    <View style={{ flexDirection:'row', gap:8, marginBottom:14 }}>
                                        <TextInput placeholder="Başlangıç saati (09:00)" placeholderTextColor={colors.textMuted} value={coachForm.timeFrom} onChangeText={v => setCoachForm(f=>({...f,timeFrom:v}))} style={{ flex:1, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', borderWidth:1, borderColor:colors.border }} />
                                        <TextInput placeholder="Bitiş saati (21:00)" placeholderTextColor={colors.textMuted} value={coachForm.timeTo} onChangeText={v => setCoachForm(f=>({...f,timeTo:v}))} style={{ flex:1, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', borderWidth:1, borderColor:colors.border }} />
                                    </View>

                                    <Text style={{ color:colors.textMuted, fontSize:11, fontWeight:'700', marginBottom:6 }}>Başarılar</Text>
                                    <TextInput placeholder="Başarılarınız (örn. 2023 Bölge Şampiyonu)" placeholderTextColor={colors.textMuted} value={coachForm.achievements} onChangeText={v => setCoachForm(f=>({...f,achievements:v}))} multiline numberOfLines={2} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border, minHeight:50, textAlignVertical:'top' }} />
                                    {coachAchievementImages.length > 0 && (
                                        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom:8 }}>
                                            {coachAchievementImages.map((uri, idx) => (
                                                <View key={idx} style={{ marginRight:8, position:'relative' }}>
                                                    <Image source={{ uri }} style={{ width:80, height:80, borderRadius:8 }} resizeMode="cover" />
                                                    <TouchableOpacity onPress={() => setCoachAchievementImages(prev => prev.filter((_,i) => i !== idx))}
                                                        style={{ position:'absolute', top:-6, right:-6, backgroundColor:'#ef4444', borderRadius:10, width:20, height:20, justifyContent:'center', alignItems:'center' }}>
                                                        <Text style={{ color:'#fff', fontSize:11, fontWeight:'900' }}>✕</Text>
                                                    </TouchableOpacity>
                                                </View>
                                            ))}
                                        </ScrollView>
                                    )}
                                    {coachAchievementImages.length < 5 && (
                                        <TouchableOpacity onPress={pickCoachAchievementImages}
                                            style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:9, borderRadius:8, borderWidth:1, borderColor:colors.border, borderStyle:'dashed', backgroundColor:colors.surface2, marginBottom:14 }}>
                                            <Text style={{ fontSize:14 }}>🏆</Text>
                                            <Text style={{ color:colors.textSecondary, fontSize:12, fontWeight:'700' }}>Başarı Fotoğrafı Ekle {coachAchievementImages.length > 0 ? `(${coachAchievementImages.length}/5)` : ''}</Text>
                                        </TouchableOpacity>
                                    )}

                                    <Text style={{ color:colors.textMuted, fontSize:11, fontWeight:'700', marginBottom:6 }}>CV</Text>
                                    <TouchableOpacity onPress={() => pickCoachSingleImage(setCoachCvImage)}
                                        style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:9, borderRadius:8, borderWidth:1, borderColor:colors.border, borderStyle:'dashed', backgroundColor:colors.surface2, marginBottom:8 }}>
                                        <Text style={{ fontSize:14 }}>📄</Text>
                                        <Text style={{ color:colors.textSecondary, fontSize:12, fontWeight:'700' }}>{coachCvImage ? 'CV Fotoğrafı Seçildi ✓' : 'CV Fotoğrafı Yükle (opsiyonel)'}</Text>
                                    </TouchableOpacity>

                                    <TextInput placeholder="Açıklama (opsiyonel)" placeholderTextColor={colors.textMuted} value={coachForm.description} onChangeText={v => setCoachForm(f=>({...f,description:v}))} multiline numberOfLines={3} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', marginBottom:14, borderWidth:1, borderColor:colors.border, minHeight:70, textAlignVertical:'top' }} />

                                    <View style={{ flexDirection:'row', gap:8 }}>
                                        <TouchableOpacity onPress={() => { setShowCreateCoach(false); resetCoachForm(); }} style={{ flex:1, paddingVertical:11, borderRadius:10, alignItems:'center', backgroundColor:colors.surface2, borderWidth:1, borderColor:colors.border }}>
                                            <Text style={{ color:colors.textMuted, fontWeight:'700' }}>İptal</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={submitCoach} disabled={submittingCoach || uploadingCoachMedia} style={{ flex:2, paddingVertical:11, borderRadius:10, alignItems:'center', backgroundColor: cfg.color }}>
                                            <Text style={{ color:'#fff', fontWeight:'900', fontSize:14 }}>
                                                {uploadingCoachMedia ? 'Yükleniyor...' : submittingCoach ? '...' : 'İlanı Yayınla'}
                                            </Text>
                                        </TouchableOpacity>
                                    </View>
                                </ScrollView>
                            </View>
                        </View>
                    </Modal>

                    {/* ── Antrenör CV Yükle (tekil hızlı yükleme) ── */}
                    <Modal visible={showCvUploadModal} animationType="fade" transparent onRequestClose={() => setShowCvUploadModal(false)}>
                        <View style={{ flex:1, backgroundColor:'#00000090', justifyContent:'center', padding:24 }}>
                            <View style={{ backgroundColor: colors.card, borderRadius:16, padding:20 }}>
                                <Text style={{ color:'#fff', fontSize:15, fontWeight:'900', marginBottom:10 }}>📄 CV Yükle</Text>
                                <Text style={{ color:colors.textMuted, fontSize:12, marginBottom:14 }}>İlanınıza eklenecek CV fotoğrafını seçin.</Text>
                                {standaloneCvImage ? (
                                    <Image source={{ uri: standaloneCvImage }} style={{ width:'100%', height:160, borderRadius:10, marginBottom:10 }} resizeMode="cover" />
                                ) : null}
                                <TouchableOpacity onPress={() => pickCoachSingleImage(setStandaloneCvImage)}
                                    style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, paddingVertical:9, borderRadius:8, borderWidth:1, borderColor:colors.border, borderStyle:'dashed', backgroundColor:colors.surface2, marginBottom:14 }}>
                                    <Text style={{ fontSize:14 }}>📷</Text>
                                    <Text style={{ color:colors.textSecondary, fontSize:12, fontWeight:'700' }}>{standaloneCvImage ? 'Fotoğrafı Değiştir' : 'CV Fotoğrafı Seç'}</Text>
                                </TouchableOpacity>
                                <View style={{ flexDirection:'row', gap:8 }}>
                                    <TouchableOpacity onPress={() => { setShowCvUploadModal(false); setStandaloneCvImage(null); }} style={{ flex:1, paddingVertical:11, borderRadius:10, alignItems:'center', backgroundColor:colors.surface2, borderWidth:1, borderColor:colors.border }}>
                                        <Text style={{ color:colors.textMuted, fontWeight:'700' }}>İptal</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={submitStandaloneCv} disabled={!standaloneCvImage || uploadingStandaloneCv} style={{ flex:2, paddingVertical:11, borderRadius:10, alignItems:'center', backgroundColor: standaloneCvImage ? '#16a34a' : colors.surface2 }}>
                                        <Text style={{ color:'#fff', fontWeight:'900', fontSize:14 }}>{uploadingStandaloneCv ? 'Yükleniyor...' : 'CV\'yi Kaydet'}</Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </View>
                    </Modal>

                    {/* ── ARCHIVE ── */}
                    {activeTab === 'archive' && (
                        <>
                        {/* Sub-tabs */}
                        <View style={{ flexDirection:'row', gap:6, marginBottom:10 }}>
                            {['rivals','tournaments'].map(st => (
                                <TouchableOpacity key={st} onPress={() => setArchiveSubTab(st)}
                                    style={{ flex:1, paddingVertical:7, borderRadius:8, alignItems:'center', backgroundColor: archiveSubTab===st ? cfg.color : colors.surface2, borderWidth:1, borderColor: archiveSubTab===st ? cfg.color : colors.border }}>
                                    <Text style={{ color: archiveSubTab===st ? '#fff' : colors.textSecondary, fontSize:12, fontWeight:'700' }}>
                                        {st === 'rivals' ? '⚔️ Bireysel Maçlar' : '🏆 Turnuvalar'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {/* Filter bar */}
                        <View style={{ flexDirection:'row', gap:6, marginBottom:8, alignItems:'center' }}>
                            <TextInput
                                style={{ flex:1, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:8, paddingVertical:5, color:'#fff', fontSize:11, borderWidth:1, borderColor:colors.border }}
                                placeholder="📍 Şehir"
                                placeholderTextColor={colors.textMuted}
                                value={archiveCity}
                                onChangeText={setArchiveCity}
                                onSubmitEditing={archiveSubTab==='rivals' ? loadArchive : loadArchiveTournaments}
                                returnKeyType="search"
                            />
                            <TextInput
                                style={{ width:80, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:8, paddingVertical:5, color:'#fff', fontSize:11, borderWidth:1, borderColor:colors.border }}
                                placeholder="📅 Başl."
                                placeholderTextColor={colors.textMuted}
                                value={archiveDateFrom}
                                onChangeText={setArchiveDateFrom}
                                onSubmitEditing={archiveSubTab==='rivals' ? loadArchive : loadArchiveTournaments}
                                returnKeyType="search"
                            />
                            <TextInput
                                style={{ width:70, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:8, paddingVertical:5, color:'#fff', fontSize:11, borderWidth:1, borderColor:colors.border }}
                                placeholder="Bitiş"
                                placeholderTextColor={colors.textMuted}
                                value={archiveDateTo}
                                onChangeText={setArchiveDateTo}
                                onSubmitEditing={archiveSubTab==='rivals' ? loadArchive : loadArchiveTournaments}
                                returnKeyType="search"
                            />
                            <TouchableOpacity onPress={archiveSubTab==='rivals' ? loadArchive : loadArchiveTournaments} style={{ backgroundColor: cfg.color, borderRadius:8, paddingHorizontal:10, paddingVertical:5 }}>
                                <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }}>🔍</Text>
                            </TouchableOpacity>
                            {(archiveCity || archiveDateFrom || archiveDateTo) && (
                                <TouchableOpacity onPress={() => { setArchiveCity(''); setArchiveDateFrom(''); setArchiveDateTo(''); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:8, paddingVertical:5, borderWidth:1, borderColor:colors.border }}>
                                    <Text style={{ color: colors.textMuted, fontSize:11, fontWeight:'700' }}>✕</Text>
                                </TouchableOpacity>
                            )}
                        </View>

                        {/* Bireysel Maçlar */}
                        {archiveSubTab === 'rivals' && (
                            loadingArchive ? (
                                <ActivityIndicator color={cfg.color} style={{ marginTop: 40 }} />
                            ) : archiveRivals.length === 0 ? (
                                <EmptyState emoji="🗃️" text={t.emptyArchive} />
                            ) : (
                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, paddingVertical: 8 }}>
                                    {archiveRivals.map(m => {
                                        const isOwner = m.senderId === myId;
                                        const parts = Array.isArray(m.participants) ? m.participants : [];
                                        const allP = [m.sender, ...parts].filter(Boolean);
                                        const snapshot = m.score?.ratingSnapshot || {};
                                        const sets = m.score?.sets;
                                        const winner = m.score?.winner;
                                        const myResult = winner === 'draw' ? '🤝' : winner === (isOwner ? 'sender' : 'opponent') ? '✅' : winner ? '❌' : '';
                                        const isTeam = m.matchMode?.toUpperCase() === 'TEAM';
                                        const sizeTxt = isTeam ? `👥 ${m.teamSize || '?'}v${m.teamSize || '?'}` : '⚔️ 1v1';
                                        const modeTxt = m.matchMode?.toUpperCase() === 'COMPETITIVE' ? t.modeCompetitive : m.matchMode?.toUpperCase() === 'PRACTICE' ? t.modePractice : '';
                                        return (
                                            <View key={m.id} style={[s.card, { width:'48%', paddingHorizontal:3, paddingTop:3, paddingBottom:3 }]}>
                                                <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:3, flexWrap:'wrap' }}>
                                                    <Text style={{ color: cfg.color, fontSize:11, fontWeight:'800' }}>{sizeTxt}</Text>
                                                    {modeTxt ? <Text style={{ color: colors.textMuted, fontSize:11 }}>·</Text> : null}
                                                    {modeTxt ? <Text style={{ color: m.matchMode?.toUpperCase() === 'COMPETITIVE' ? '#ef4444' : '#22c55e', fontSize:11, fontWeight:'700' }}>{modeTxt}</Text> : null}
                                                    {myResult ? <Text style={{ fontSize:14, marginLeft:'auto' }}>{myResult}</Text> : null}
                                                </View>
                                                <Text style={{ color: colors.textMuted, fontSize:11, marginBottom:3 }} numberOfLines={1}>
                                                    {m.flexibleSchedule ? '📅 Esnek' : m.matchDate ? new Date(m.matchDate).toLocaleDateString('tr-TR', { day:'numeric', month:'short' }) : ''}
                                                    {!m.flexibleSchedule && m.matchTime ? ` ${m.matchTime}` : ''}
                                                </Text>
                                                {(m.courtName || m.location) ? (
                                                    <Text style={{ color: colors.textMuted, fontSize:11, marginBottom:3 }} numberOfLines={1}>
                                                        🏟️ {m.courtName || m.location}
                                                        {m.courtName && m.location ? `  📍 ${m.location}` : ''}
                                                    </Text>
                                                ) : null}
                                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginBottom: sets ? 3 : 0 }}>
                                                    {allP.map(p => {
                                                        const isSender = p.id === m.senderId;
                                                        const hist = snapshot[p.id];
                                                        const rBefore = hist?.skillRating_before;
                                                        const pts = hist?.change ?? null;
                                                        const pSets = sets ? sets.map(s2 => isSender ? s2.sender : s2.opponent) : null;
                                                        const pWins = sets ? sets.filter(s2 => (isSender ? s2.sender : s2.opponent) > (isSender ? s2.opponent : s2.sender)).length : null;
                                                        return (
                                                            <View key={p.id || p.username} style={{ alignItems:'flex-start', gap:3 }}>
                                                                <TouchableOpacity onPress={() => p.id && setProfileUserId(p.id)} activeOpacity={0.7} style={{ backgroundColor: colors.surface2, borderRadius:6, paddingHorizontal:3, paddingVertical:3, flexDirection:'row', alignItems:'center', gap:3 }}>
                                                                    <Text style={{ color:'#fff', fontSize:12, fontWeight:'600' }} numberOfLines={1}>{senderAlias(p)}</Text>
                                                                    {rBefore != null && rBefore > 0 && <Text style={{ color:'#facc15', fontSize:11, fontWeight:'800' }}>{Number(rBefore).toFixed(2)} ★</Text>}
                                                                    {pts != null && pts !== 0 && <Text style={{ color: pts > 0 ? '#4ade80' : '#f87171', fontSize:11, fontWeight:'800' }}>{pts > 0 ? '+' : ''}{pts}p</Text>}
                                                                </TouchableOpacity>
                                                                {pSets && (
                                                                    <Text style={{ color: colors.textMuted, fontSize:11, paddingLeft:3 }}>
                                                                        {pSets.join('  ')}
                                                                        {'  '}<Text style={{ color: pWins != null && pWins > (sets.length - pWins) ? '#4ade80' : pWins != null && pWins < (sets.length - pWins) ? '#f87171' : colors.textMuted, fontWeight:'800' }}>({pWins})</Text>
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                            </View>
                                        );
                                    })}
                                </View>
                            )
                        )}

                        {/* Turnuvalar arşivi */}
                        {archiveSubTab === 'tournaments' && (
                            loadingArchiveTournaments ? (
                                <ActivityIndicator color={cfg.color} style={{ marginTop:40 }} />
                            ) : archiveTournaments.length === 0 ? (
                                <EmptyState emoji="🏆" text="Henüz tamamlanmış turnuva yok" />
                            ) : (
                                <View style={{ gap:10, paddingVertical:8 }}>
                                    {archiveTournaments.map(tourn => {
                                        const typeLabel = TOURN_TYPE_LABELS(t)[tourn.type] || tourn.type;
                                        const participated = tourn.participants?.length > 0 || tourn.creatorId === myId;
                                        return (
                                            <View key={tourn.id} style={[s.card, { padding:12 }]}>
                                                <View style={{ flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between', gap:8 }}>
                                                    <View style={{ flex:1 }}>
                                                        <Text style={{ color:'#fff', fontSize:14, fontWeight:'800', marginBottom:2 }}>{tourn.name}</Text>
                                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                                            {typeLabel}{tourn.city ? `  📍 ${tourn.city}` : ''}
                                                        </Text>
                                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                                            👤 {tourn.creator?.fullName || tourn.creator?.username}
                                                            {'  '}👥 {tourn._count?.participants || 0} katılımcı
                                                        </Text>
                                                        {tourn.completedAt && (
                                                            <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                                                🏁 {new Date(tourn.completedAt).toLocaleDateString('tr-TR', { day:'numeric', month:'short', year:'numeric' })}
                                                            </Text>
                                                        )}
                                                    </View>
                                                    <View style={{ alignItems:'flex-end', gap:4 }}>
                                                        <View style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#16a34a50' }}>
                                                            <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'800' }}>✅ Tamamlandı</Text>
                                                        </View>
                                                        {participated && (
                                                            <View style={{ backgroundColor: cfg.color+'20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor: cfg.color+'50' }}>
                                                                <Text style={{ color: cfg.color, fontSize:10, fontWeight:'700' }}>Katıldım</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>
                                                <TouchableOpacity
                                                    style={{ backgroundColor:'#a855f715', borderRadius:8, paddingHorizontal:10, paddingVertical:7, borderWidth:1, borderColor:'#a855f740', marginTop:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}
                                                    onPress={() => setSelectedArchiveTournament(tourn)}
                                                >
                                                    <Text style={{ color:'#c084fc', fontSize:12, fontWeight:'700' }}>📋 Turnuva Detayları</Text>
                                                    <Text style={{ color:'#c084fc', fontSize:14 }}>›</Text>
                                                </TouchableOpacity>
                                            </View>
                                        );
                                    })}
                                </View>
                            )
                        )}
                        </>
                    )}

                    {/* ── REFEREE ── */}
                    {activeTab === 'referee' && (
                        <EmptyState emoji="🟨" text={t.emptyRivals} />
                    )}

                    {/* ── MEDIA ── */}
                    {activeTab === 'media' && (() => {
                        const now = Date.now();
                        const filtered = mediaPosts.filter(p => {
                            if (mediaCity) {
                                const c = (p.user?.city || '').toLowerCase();
                                if (!c.includes(mediaCity.toLowerCase())) return false;
                            }
                            if (mediaTimeFilter !== 'ALL') {
                                const age = now - new Date(p.createdAt).getTime();
                                if (mediaTimeFilter === 'TODAY'  && age > 86400000)     return false;
                                if (mediaTimeFilter === 'WEEK'   && age > 604800000)    return false;
                                if (mediaTimeFilter === 'MONTH'  && age > 2592000000)   return false;
                            }
                            return true;
                        });
                        return (
                            <>
                                {/* Hikayeler satırı */}
                                {mediaStories.length > 0 && (
                                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
                                        {mediaStories.map((group, i) => (
                                            <TouchableOpacity key={group.user?.id || i}
                                                onPress={() => setStoryViewer({ visible: true, userIdx: i, storyIdx: 0 })}
                                                style={{ alignItems: 'center', marginRight: 14 }}>
                                                <View style={{ width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, borderColor: cfg.color, padding: 2, backgroundColor: colors.surface2 }}>
                                                    <Avatar name={group.user?.username} size={54} color={cfg.color} />
                                                </View>
                                                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4, maxWidth: 62, textAlign: 'center' }} numberOfLines={1}>
                                                    @{group.user?.username}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                )}
                                {/* Filtreler + paylaş */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap' }}>
                                    <TextInput
                                        style={{ flex: 1, minWidth: 100, backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: '#fff', fontSize: 12, borderWidth: 1, borderColor: colors.border }}
                                        placeholder={t.mediaCityPh}
                                        placeholderTextColor={colors.textMuted}
                                        value={mediaCity}
                                        onChangeText={setMediaCity}
                                    />
                                    <TouchableOpacity onPress={() => setShowMediaTypeSheet(true)}
                                        style={{ backgroundColor: cfg.color + '20', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 7, borderWidth: 1, borderColor: cfg.color + '50' }}>
                                        <Text style={{ color: cfg.color, fontWeight: '800', fontSize: 12 }}>{t.mediaShareBtn}</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 6, marginBottom: 10 }}>
                                    {[['ALL',t.allFilter],['TODAY',t.todayFilter],['WEEK',t.weekFilter],['MONTH',t.monthFilter]].map(([v, label]) => (
                                        <TouchableOpacity key={v} onPress={() => setMediaTimeFilter(v)}
                                            style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8, backgroundColor: mediaTimeFilter === v ? cfg.color : colors.surface2, borderWidth: 1, borderColor: mediaTimeFilter === v ? cfg.color : colors.border }}>
                                            <Text style={{ color: mediaTimeFilter === v ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {/* Grid */}
                                {filtered.length === 0
                                    ? <EmptyState emoji="📸" text={t.emptyMedia} />
                                    : <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                        {filtered.map((post, idx) => (
                                            <TouchableOpacity key={post.id}
                                                style={{ width: '31.5%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface2 }}
                                                onPress={() => setMediaViewIdx(idx)}>
                                                {post.imageUrl
                                                    ? <Image source={{ uri: post.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                    : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 30 }}>🎬</Text></View>
                                                }
                                                {post.type === 'STORY' && (
                                                    <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: colors.purple, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 }}>
                                                        <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>24s</Text>
                                                    </View>
                                                )}
                                            </TouchableOpacity>
                                        ))}
                                      </View>
                                }
                                {/* Hikaye görüntüleyici */}
                                <Modal visible={storyViewer.visible} animationType="fade" statusBarTranslucent onRequestClose={() => setStoryViewer(v => ({ ...v, visible: false }))}>
                                    {storyViewer.visible && (() => {
                                        const group = mediaStories[storyViewer.userIdx];
                                        if (!group) return null;
                                        const story = group.stories[storyViewer.storyIdx];
                                        if (!story) return null;

                                        const goNext = () => {
                                            if (storyViewer.storyIdx < group.stories.length - 1) {
                                                setStoryViewer(v => ({ ...v, storyIdx: v.storyIdx + 1 }));
                                            } else if (storyViewer.userIdx < mediaStories.length - 1) {
                                                setStoryViewer(v => ({ ...v, userIdx: v.userIdx + 1, storyIdx: 0 }));
                                            } else {
                                                setStoryViewer(v => ({ ...v, visible: false }));
                                            }
                                        };
                                        const goPrev = () => {
                                            if (storyViewer.storyIdx > 0) {
                                                setStoryViewer(v => ({ ...v, storyIdx: v.storyIdx - 1 }));
                                            } else if (storyViewer.userIdx > 0) {
                                                const prevUserIdx = storyViewer.userIdx - 1;
                                                setStoryViewer(v => ({ ...v, userIdx: prevUserIdx, storyIdx: mediaStories[prevUserIdx].stories.length - 1 }));
                                            }
                                        };

                                        return (
                                            <View style={{ flex: 1, backgroundColor: '#000' }}>
                                                {/* Progress bars */}
                                                <View style={{ flexDirection: 'row', gap: 3, paddingHorizontal: 12, paddingTop: 52, paddingBottom: 8 }}>
                                                    {group.stories.map((_, i) => (
                                                        <View key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, backgroundColor: i < storyViewer.storyIdx ? '#fff' : i === storyViewer.storyIdx ? cfg.color : '#ffffff30' }} />
                                                    ))}
                                                </View>
                                                {/* Header */}
                                                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingBottom: 8 }}>
                                                    <View style={{ width: 36, height: 36, borderRadius: 18, overflow: 'hidden', borderWidth: 2, borderColor: cfg.color }}>
                                                        <Avatar name={group.user?.username} size={32} color={cfg.color} />
                                                    </View>
                                                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13, marginLeft: 8, flex: 1 }}>@{group.user?.username}</Text>
                                                    <TouchableOpacity onPress={() => setStoryViewer(v => ({ ...v, visible: false }))} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                                                        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '700' }}>✕</Text>
                                                    </TouchableOpacity>
                                                </View>
                                                {/* Görüntü */}
                                                <View style={{ flex: 1, position: 'relative' }}>
                                                    {story.imageUrl
                                                        ? <Image source={{ uri: story.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                        : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 60 }}>🎬</Text></View>
                                                    }
                                                    {/* Dokunma bölgeleri */}
                                                    <TouchableOpacity style={{ position: 'absolute', left: 0, top: 0, bottom: 0, width: '35%' }} onPress={goPrev} activeOpacity={1} />
                                                    <TouchableOpacity style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: '65%' }} onPress={goNext} activeOpacity={1} />
                                                </View>
                                                {/* Altyazı */}
                                                {!!story.content && (
                                                    <View style={{ padding: 16, paddingBottom: 40, backgroundColor: '#00000060' }}>
                                                        <Text style={{ color: '#fff', fontSize: 14, lineHeight: 20 }}>{story.content}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        );
                                    })()}
                                </Modal>

                                {/* Tip seçim sheet */}
                                <Modal visible={showMediaTypeSheet} animationType="slide" transparent onRequestClose={() => setShowMediaTypeSheet(false)}>
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000080' }} activeOpacity={1} onPress={() => setShowMediaTypeSheet(false)}>
                                        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 40 }}>
                                            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 16 }}>Ne paylaşmak istiyorsun?</Text>
                                            {[
                                                { type: 'POST',  emoji: '🖼️', label: 'Gönderi',  desc: 'Fotoğraf veya video paylaş' },
                                                { type: 'STORY', emoji: '⭕', label: 'Hikaye',   desc: '24 saat sonra kaybolur' },
                                                { type: 'REEL',  emoji: '🎬', label: lang === 'tr' ? 'Film Rulosu' : 'Reels', desc: lang === 'tr' ? 'Kısa video paylaş' : 'Share a short video' },
                                            ].map(opt => (
                                                <TouchableOpacity key={opt.type} onPress={() => pickMediaShare(opt.type)}
                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                                    <Text style={{ fontSize: 28 }}>{opt.emoji}</Text>
                                                    <View>
                                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 15 }}>{opt.label}</Text>
                                                        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>{opt.desc}</Text>
                                                    </View>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                    </TouchableOpacity>
                                </Modal>

                                {/* Medya paylaş modal */}
                                <Modal visible={showMediaShare} animationType="slide" transparent onRequestClose={() => setShowMediaShare(false)}>
                                    <View style={{ flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' }}>
                                        <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 }}>
                                            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 12 }}>
                                                {mediaShareType === 'STORY' ? '⭕ Hikaye Paylaş' : mediaShareType === 'REEL' ? `🎬 ${lang === 'tr' ? 'Film Rulosu' : 'Reels'} Paylaş` : '🖼️ Gönderi Paylaş'}
                                            </Text>
                                            {mediaShareUri && (
                                                <Image source={{ uri: mediaShareUri }} style={{ width: '100%', height: 200, borderRadius: 12, marginBottom: 12 }} resizeMode="cover" />
                                            )}
                                            <TextInput
                                                style={{ backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: colors.border, marginBottom: 14 }}
                                                placeholder="Açıklama ekle (opsiyonel)..."
                                                placeholderTextColor={colors.textMuted}
                                                value={mediaShareCaption}
                                                onChangeText={setMediaShareCaption}
                                                multiline
                                            />
                                            {/* Müzik + Konum butonları */}
                                            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
                                                <TouchableOpacity onPress={() => shareMusic ? setMusicTrimOpen(true) : setMusicSheetOpen(true)}
                                                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, backgroundColor: shareMusic ? '#7c3aed20' : colors.surface2, borderWidth: 1, borderColor: shareMusic ? '#7c3aed60' : colors.border }}>
                                                    {shareMusic?.coverUrl
                                                        ? <Image source={{ uri: shareMusic.coverUrl }} style={{ width: 22, height: 22, borderRadius: 4 }} />
                                                        : <Text style={{ fontSize: 16 }}>🎵</Text>}
                                                    <View style={{ flex: 1 }}>
                                                        <Text style={{ color: shareMusic ? '#a78bfa' : colors.textMuted, fontSize: 11, fontWeight: '700' }} numberOfLines={1}>
                                                            {shareMusic ? `${shareMusic.title} – ${shareMusic.artist}` : 'Müzik Ekle'}
                                                        </Text>
                                                        {shareMusic && <Text style={{ color: '#7c3aed90', fontSize: 10 }}>{trimStart}s – {trimEnd}s · düzenle</Text>}
                                                    </View>
                                                    {shareMusic && <TouchableOpacity onPress={() => { setShareMusic(null); stopMusicPreview(); }} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>✕</Text>
                                                    </TouchableOpacity>}
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={getGpsLocation} disabled={gettingLocation}
                                                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 9, paddingHorizontal: 10, borderRadius: 10, backgroundColor: shareLocation ? '#16a34a20' : colors.surface2, borderWidth: 1, borderColor: shareLocation ? '#16a34a60' : colors.border }}>
                                                    <Text style={{ fontSize: 14 }}>📍</Text>
                                                    <Text style={{ color: shareLocation ? '#4ade80' : colors.textMuted, fontSize: 11, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                                                        {gettingLocation ? 'Alınıyor...' : shareLocation || 'Konum Ekle'}
                                                    </Text>
                                                    {shareLocation && <TouchableOpacity onPress={() => setShareLocation('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>✕</Text>
                                                    </TouchableOpacity>}
                                                </TouchableOpacity>
                                            </View>
                                            <View style={{ flexDirection: 'row', gap: 8 }}>
                                                <TouchableOpacity onPress={() => { setShowMediaShare(false); setMediaShareUri(null); setMediaShareCaption(''); setShareMusic(null); setShareLocation(''); }}
                                                    style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                                                    <Text style={{ color: colors.textMuted, fontWeight: '700' }}>İptal</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={submitMediaShare} disabled={submittingMediaShare}
                                                    style={{ flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: cfg.color, opacity: submittingMediaShare ? 0.6 : 1 }}>
                                                    <Text style={{ color: '#fff', fontWeight: '900' }}>{submittingMediaShare ? 'Yükleniyor...' : 'Paylaş'}</Text>
                                                </TouchableOpacity>
                                            </View>

                                            {/* Müzik Kırp Modal */}
                                            <Modal visible={musicTrimOpen} animationType="slide" transparent onRequestClose={() => { setMusicTrimOpen(false); stopMusicPreview(); }}>
                                                <View style={{ flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' }}>
                                                    <View style={{ backgroundColor: colors.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 }}>
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 16 }}>
                                                            {shareMusic?.coverUrl
                                                                ? <Image source={{ uri: shareMusic.coverUrl }} style={{ width: 44, height: 44, borderRadius: 8, marginRight: 10 }} />
                                                                : <Text style={{ fontSize: 30, marginRight: 10 }}>🎵</Text>}
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 13 }} numberOfLines={1}>{shareMusic?.title}</Text>
                                                                <Text style={{ color: colors.textMuted, fontSize: 11 }}>{shareMusic?.artist}</Text>
                                                            </View>
                                                            <TouchableOpacity onPress={() => { setMusicTrimOpen(false); stopMusicPreview(); }}>
                                                                <Text style={{ color: colors.textMuted, fontSize: 22 }}>✕</Text>
                                                            </TouchableOpacity>
                                                        </View>

                                                        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700', marginBottom: 10 }}>
                                                            ✂️ Kullanılacak aralık {musicDuration ? `(toplam ${Math.floor(musicDuration)}sn)` : ''}
                                                        </Text>

                                                        <View style={{ flexDirection: 'row', gap: 12, marginBottom: 16 }}>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>Başlangıç (sn)</Text>
                                                                <TextInput
                                                                    style={{ backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 16, fontWeight: '800', borderWidth: 1, borderColor: colors.border, textAlign: 'center' }}
                                                                    value={trimStart}
                                                                    onChangeText={v => setTrimStart(v.replace(/[^0-9.]/g, ''))}
                                                                    keyboardType="numeric"
                                                                    placeholder="0"
                                                                    placeholderTextColor={colors.textMuted}
                                                                />
                                                            </View>
                                                            <View style={{ justifyContent: 'flex-end', paddingBottom: 10 }}>
                                                                <Text style={{ color: colors.textMuted, fontSize: 18 }}>→</Text>
                                                            </View>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>Bitiş (sn)</Text>
                                                                <TextInput
                                                                    style={{ backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 10, color: '#fff', fontSize: 16, fontWeight: '800', borderWidth: 1, borderColor: colors.border, textAlign: 'center' }}
                                                                    value={trimEnd}
                                                                    onChangeText={v => setTrimEnd(v.replace(/[^0-9.]/g, ''))}
                                                                    keyboardType="numeric"
                                                                    placeholder="30"
                                                                    placeholderTextColor={colors.textMuted}
                                                                />
                                                            </View>
                                                        </View>

                                                        <Text style={{ color: colors.textMuted, fontSize: 11, textAlign: 'center', marginBottom: 14 }}>
                                                            Seçilen aralık: <Text style={{ color: '#a78bfa', fontWeight: '800' }}>{Math.max(0, (parseFloat(trimEnd) || 0) - (parseFloat(trimStart) || 0)).toFixed(1)} saniye</Text>
                                                        </Text>

                                                        <View style={{ flexDirection: 'row', gap: 8 }}>
                                                            <TouchableOpacity onPress={previewTrim}
                                                                style={{ flex: 1, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: previewPlaying ? '#ef444420' : '#7c3aed20', borderWidth: 1, borderColor: previewPlaying ? '#ef444450' : '#7c3aed50' }}>
                                                                <Text style={{ color: previewPlaying ? '#ef4444' : '#a78bfa', fontWeight: '800' }}>
                                                                    {previewPlaying ? '⏹ Durdur' : '▶ Önizle'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                            <TouchableOpacity onPress={() => { stopMusicPreview(); setMusicTrimOpen(false); }}
                                                                style={{ flex: 2, paddingVertical: 12, borderRadius: 10, alignItems: 'center', backgroundColor: cfg.color }}>
                                                                <Text style={{ color: '#fff', fontWeight: '900' }}>✓ Onayla</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                </View>
                                            </Modal>

                                            {/* Müzik seçici sheet */}
                                            <Modal visible={musicSheetOpen} animationType="slide" onRequestClose={() => setMusicSheetOpen(false)}>
                                                <View style={{ flex: 1, backgroundColor: colors.bg }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 16, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16, flex: 1 }}>🎵 Müzik Seç</Text>
                                                        <TouchableOpacity onPress={() => setMusicSheetOpen(false)}>
                                                            <Text style={{ color: colors.textMuted, fontSize: 22 }}>✕</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                    <TouchableOpacity onPress={pickPhoneAudio}
                                                        style={{ margin: 12, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, borderWidth: 1, borderColor: colors.border }}>
                                                        <Text style={{ fontSize: 20 }}>📱</Text>
                                                        <View>
                                                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Telefondan Yükle</Text>
                                                            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>MP3, AAC, M4A...</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                    <View style={{ margin: 12, marginTop: 8, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
                                                        <Text style={{ fontSize: 16, marginRight: 8 }}>🔍</Text>
                                                        <TextInput
                                                            style={{ flex: 1, color: '#fff', fontSize: 14 }}
                                                            placeholder="Şarkı veya sanatçı ara..."
                                                            placeholderTextColor={colors.textMuted}
                                                            value={musicQuery}
                                                            onChangeText={searchDeezer}
                                                            autoFocus
                                                        />
                                                        {searchingMusic && <ActivityIndicator size="small" color={cfg.color} />}
                                                    </View>
                                                    <ScrollView contentContainerStyle={{ padding: 12 }}>
                                                        {musicResults.map(track => (
                                                            <TouchableOpacity key={track.id} onPress={() => selectTrack(track)}
                                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                                                <Image source={{ uri: track.album.cover_small }} style={{ width: 44, height: 44, borderRadius: 6 }} />
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ color: '#fff', fontWeight: '700', fontSize: 13 }} numberOfLines={1}>{track.title}</Text>
                                                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{track.artist.name}</Text>
                                                                </View>
                                                                <Text style={{ color: cfg.color, fontSize: 11, fontWeight: '700' }}>Seç</Text>
                                                            </TouchableOpacity>
                                                        ))}
                                                        {!searchingMusic && musicQuery && musicResults.length === 0 && (
                                                            <Text style={{ color: colors.textMuted, textAlign: 'center', marginTop: 30 }}>Sonuç bulunamadı</Text>
                                                        )}
                                                    </ScrollView>
                                                </View>
                                            </Modal>
                                        </View>
                                    </View>
                                </Modal>
                            </>
                        );
                    })()}

                    {/* ── NEWS ── */}
                    {activeTab === 'news' && (
                        loadingNews
                            ? <ActivityIndicator color={cfg.color} style={{ marginTop: 40 }} />
                            : news.length === 0
                                ? <EmptyState emoji="📰" text={t.emptyNews} />
                                : <>
                                    <TouchableOpacity onPress={loadNews} style={{ alignSelf: 'flex-end', marginBottom: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>🔄 {lang === 'tr' ? 'Yenile' : 'Refresh'}</Text>
                                    </TouchableOpacity>
                                    {news.map((item, i) => (
                                        <TouchableOpacity key={i} onPress={() => item.link && Linking.openURL(item.link)}
                                            style={{ backgroundColor: colors.surface2, borderRadius: 12, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                                            {!!item.thumbnail && (
                                                <Image source={{ uri: item.thumbnail }} style={{ width: '100%', height: 150 }} resizeMode="cover" />
                                            )}
                                            <View style={{ padding: 12 }}>
                                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '800', lineHeight: 19 }} numberOfLines={3}>{item.title}</Text>
                                                {!!item.description && (
                                                    <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 5, lineHeight: 16 }} numberOfLines={2}>{item.description}</Text>
                                                )}
                                                {!!item.pubDate && (
                                                    <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 6 }}>
                                                        {new Date(item.pubDate).toLocaleDateString(lang === 'tr' ? 'tr-TR' : 'en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                                                    </Text>
                                                )}
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                  </>
                    )}

                    {/* ── TEXT POSTS ── */}
                    {activeTab === 'posts' && (
                        <>
                            <View style={{ backgroundColor: colors.surface2, borderRadius: 12, padding: 12, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
                                <TextInput
                                    style={{ color: '#fff', fontSize: 14, minHeight: 70, textAlignVertical: 'top', lineHeight: 20 }}
                                    placeholder={lang === 'tr' ? 'Bir şeyler yaz...' : 'Write something...'}
                                    placeholderTextColor={colors.textMuted}
                                    value={newPostText}
                                    onChangeText={setNewPostText}
                                    multiline
                                    maxLength={1000}
                                />
                                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 8 }}>
                                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{newPostText.length}/1000</Text>
                                    <TouchableOpacity
                                        onPress={submitTextPost}
                                        disabled={submittingPost || !newPostText.trim()}
                                        style={{ backgroundColor: newPostText.trim() ? cfg.color : colors.surface, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7, opacity: (!newPostText.trim() || submittingPost) ? 0.5 : 1 }}>
                                        <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>
                                            {submittingPost ? '...' : (lang === 'tr' ? 'Paylaş' : 'Post')}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                            {textPosts.length === 0
                                ? <EmptyState emoji="✏️" text={t.emptyPosts} />
                                : textPosts.map(post => (
                                    <TextPostCard key={post.id} post={post} cfg={cfg} />
                                ))
                            }
                        </>
                    )}
                </ScrollView>
            )}

            {showCreateRival && <CreateRivalModal visible onClose={() => setShowCreateRival(false)} category={category} sub={sub} onCreated={load} />}
            {showCreatePW && <CreatePlayerWantedModal visible onClose={() => setShowCreatePW(false)} category={category} sub={sub} onCreated={load} />}
            {showCreateTournament && <CreateTournamentModal visible onClose={() => setShowCreateTournament(false)} category={category} sub={sub} onCreated={loadTournaments} />}
            {showTournamentPermission && <TournamentPermissionModal visible onClose={() => setShowTournamentPermission(false)} onStatusChange={setTournamentPermStatus} />}
            {!!profileUserId && <UserProfileModal visible userId={profileUserId} onClose={() => setProfileUserId(null)} navigation={navigation} />}

            {/* ── Yorumlar — tam ekran modal ── */}
            {(() => {
                if (!commentMatch) return null;
                const cfg2 = getConfig(commentMatch.subCategory);
                const allP2 = [
                    { ...commentMatch.sender, skillRating: commentMatch.senderSkillRating },
                    ...(Array.isArray(commentMatch.participants) ? commentMatch.participants : []),
                ].filter(Boolean);
                const matchParticipantIds = new Set(allP2.map(p => p.id));
                const canDelete = (c) => {
                    const isAuthor = c.user?.id === myId;
                    const iAmParticipant = matchParticipantIds.has(myId);
                    const commenterIsParticipant = matchParticipantIds.has(c.user?.id);
                    return isAuthor || (iAmParticipant && !commenterIsParticipant);
                };
                return (
                    <Modal visible animationType="slide" onRequestClose={() => setCommentMatch(null)}>
                        <View style={{ flex:1, backgroundColor: colors.bg }}>
                            {/* Header */}
                            <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:8, paddingTop: Platform.OS === 'ios' ? 56 : 24, paddingBottom:14, borderBottomWidth:1, borderBottomColor: colors.border }}>
                                <TouchableOpacity onPress={() => setCommentMatch(null)} style={{ marginRight:14, padding:4 }}>
                                    <Text style={{ color:'#fff', fontSize:22, fontWeight:'300' }}>←</Text>
                                </TouchableOpacity>
                                <View style={{ flex:1 }}>
                                    <Text style={{ color:'#fff', fontSize:16, fontWeight:'800' }}>{commentMatch.subCategory}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:12, marginTop:1 }}>
                                        {allP2.map(p => senderAlias(p)).join(' · ')}
                                    </Text>
                                </View>
                            </View>

                            {/* ScrollView — match details + comments */}
                            <ScrollView
                                style={{ flex:1 }}
                                contentContainerStyle={{ paddingHorizontal:8, paddingVertical:16, paddingBottom:16 }}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                {/* Maç detayları */}
                                <View style={{ backgroundColor: colors.surface2, borderRadius:14, padding:14, marginBottom:20, borderWidth:1, borderColor: colors.border }}>
                                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:8 }}>
                                        {allP2.map((p, idx) => (
                                            <View key={p.id || idx} style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
                                                {idx > 0 && <Text style={{ color: colors.textMuted }}>·</Text>}
                                                <Text style={{ color:'#fff', fontSize:14, fontWeight:'700' }}>{senderAlias(p)}</Text>
                                                {p.skillRating != null && (
                                                    <Text style={{ color:'#facc15', fontSize:12, fontWeight:'800' }}>{Number(p.skillRating).toFixed(2)} ★</Text>
                                                )}
                                            </View>
                                        ))}
                                    </View>
                                    <Text style={{ color: colors.textMuted, fontSize:13 }}>
                                        {commentMatch.matchDate ? new Date(commentMatch.matchDate).toLocaleDateString(t.dateLocale, { day:'numeric', month:'long', weekday:'long' }) : ''}
                                        {commentMatch.matchTime ? ` · ${commentMatch.matchTime}` : ''}
                                        {commentMatch.duration  ? ` · ${commentMatch.duration} ${t.timeMinSuffix}` : ''}
                                    </Text>
                                    {commentMatch.location  && <Text style={{ color:'#60a5fa', fontSize:13, marginTop:4 }}>📍 {commentMatch.location}</Text>}
                                    {commentMatch.courtName && <Text style={{ color:'#60a5fa', fontSize:13, marginTop:4 }}>🏟️ {commentMatch.courtName}</Text>}
                                    {commentMatch.level && (
                                        <Text style={{ color: colors.textMuted, fontSize:13, marginTop:4 }}>
                                            {LEVEL_EMOJI[commentMatch.level]} {t.levelTr?.[commentMatch.level] || commentMatch.level}
                                        </Text>
                                    )}
                                </View>

                                {/* Yorumlar bölümü */}
                                <Text style={{ color:'#fff', fontSize:15, fontWeight:'800', marginBottom:14 }}>
                                    💬 {t.matchCommentsTitle}{comments.length > 0 ? ` (${comments.length})` : ''}
                                </Text>
                                {loadingComments ? (
                                    <ActivityIndicator color={cfg2.color} style={{ marginTop:20 }} />
                                ) : comments.length === 0 ? (
                                    <Text style={{ color: colors.textMuted, textAlign:'center', marginTop:8, fontSize:13 }}>{t.matchCommentEmpty}</Text>
                                ) : (
                                    comments.map(c => (
                                        <View key={c.id} style={{ marginBottom:14, paddingBottom:14, borderBottomWidth:1, borderBottomColor: colors.border }}>
                                            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color: cfg2.color, fontSize:13, fontWeight:'700', marginBottom:3 }}>@{c.user?.username}</Text>
                                                    <Text style={{ color:'#fff', fontSize:14, lineHeight:21 }}>{c.content}</Text>
                                                    <Text style={{ color: colors.textMuted, fontSize:11, marginTop:4 }}>
                                                        {new Date(c.createdAt).toLocaleString(t.dateLocale, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                                                    </Text>
                                                </View>
                                                {canDelete(c) && (
                                                    <TouchableOpacity onPress={() => deleteComment(c.id)} style={{ padding:8, marginLeft:8 }}>
                                                        <Text style={{ color:'#f87171', fontSize:14 }}>✕</Text>
                                                    </TouchableOpacity>
                                                )}
                                            </View>
                                        </View>
                                    ))
                                )}
                            </ScrollView>

                            {/* Yorum yaz — bottom input */}
                            <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'padding'} keyboardVerticalOffset={0}>
                                <View style={{ flexDirection:'row', gap:10, paddingHorizontal:12, paddingVertical:10, paddingBottom: Platform.OS === 'ios' ? 28 : 10, borderTopWidth:1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
                                    <TextInput
                                        style={[s.fieldInput, { flex:1, height:44, marginBottom:0, fontSize:14 }]}
                                        placeholder={t.matchCommentPlaceholder}
                                        placeholderTextColor={colors.textMuted}
                                        value={commentText}
                                        onChangeText={setCommentText}
                                        multiline={false}
                                        returnKeyType="send"
                                        onSubmitEditing={sendComment}
                                    />
                                    <TouchableOpacity
                                        style={[s.joinBtn, { paddingHorizontal:18, height:44, justifyContent:'center', alignSelf:'center' }, sendingComment && { opacity:0.6 }]}
                                        onPress={sendComment}
                                        disabled={sendingComment}
                                    >
                                        <Text style={s.joinBtnText}>{t.matchCommentSend}</Text>
                                    </TouchableOpacity>
                                </View>
                            </KeyboardAvoidingView>
                        </View>
                    </Modal>
                );
            })()}

            {/* ── Archive Tournament Detail Modal ── */}
            <Modal visible={!!selectedArchiveTournament} animationType="slide" transparent onRequestClose={() => setSelectedArchiveTournament(null)}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { maxHeight:'92%' }]}>
                        {selectedArchiveTournament && (() => {
                            const tourn = selectedArchiveTournament;
                            const typeLabel = TOURN_TYPE_LABELS(t)[tourn.type] || tourn.type;
                            const row = (label, value) => value ? (
                                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', paddingVertical:10, borderBottomWidth:1, borderBottomColor:colors.border }}>
                                    <Text style={{ color:colors.textMuted, fontSize:13, fontWeight:'600', flex:1 }}>{label}</Text>
                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700', flex:1.2, textAlign:'right' }}>{value}</Text>
                                </View>
                            ) : null;
                            const archiveStandings = (() => {
                                const stats = {};
                                for (const m of archiveModalMatches) {
                                    if (m.phase !== 'GROUP') continue;
                                    if (m.p1Id && !stats[m.p1Id]) stats[m.p1Id] = { id:m.p1Id, name:m.p1Name, played:0, won:0, lost:0, setsWon:0, setsLost:0, gamesWon:0, gamesLost:0, points:0 };
                                    if (m.p2Id && !stats[m.p2Id]) stats[m.p2Id] = { id:m.p2Id, name:m.p2Name, played:0, won:0, lost:0, setsWon:0, setsLost:0, gamesWon:0, gamesLost:0, points:0 };
                                    if (m.status !== 'COMPLETED' || !m.score || !m.p2Id) continue;
                                    const sc = m.score;
                                    const s1 = stats[m.p1Id], s2 = stats[m.p2Id];
                                    if (!s1 || !s2) continue;
                                    s1.played++; s2.played++;
                                    let p1s=0,p2s=0,p1g=0,p2g=0;
                                    for (const set of (sc.sets||[])) {
                                        p1g+=set.p1||0; p2g+=set.p2||0;
                                        if ((set.p1||0)>(set.p2||0)) p1s++; else if ((set.p2||0)>(set.p1||0)) p2s++;
                                    }
                                    s1.setsWon+=p1s; s1.setsLost+=p2s; s1.gamesWon+=p1g; s1.gamesLost+=p2g;
                                    s2.setsWon+=p2s; s2.setsLost+=p1s; s2.gamesWon+=p2g; s2.gamesLost+=p1g;
                                    if (sc.winner==='p1') { s1.won++; s1.points+=3; s2.lost++; } else { s2.won++; s2.points+=3; s1.lost++; }
                                }
                                return Object.values(stats).sort((a,b) => {
                                    if (b.points!==a.points) return b.points-a.points;
                                    const sr=x=>x.setsLost===0?(x.setsWon===0?0:Infinity):x.setsWon/x.setsLost;
                                    if (Math.abs(sr(b)-sr(a))>0.001) return sr(b)-sr(a);
                                    const gr=x=>x.gamesLost===0?(x.gamesWon===0?0:Infinity):x.gamesWon/x.gamesLost;
                                    return gr(b)-gr(a);
                                });
                            })();
                            const hasGroup = archiveModalMatches.some(m => m.phase === 'GROUP');
                            const tabs = ['details', 'matches', ...(hasGroup ? ['standings'] : [])];
                            const tabLabel = { details:'Detaylar', matches:'Maçlar', standings:'Puan Tablosu' };
                            const playoffMs = archiveModalMatches.filter(m => m.phase === 'PLAYOFF');
                            const playoffMaxRound = playoffMs.length ? Math.max(...playoffMs.map(m => m.round)) : 0;
                            const getRoundLabel = (round, phase) => {
                                if (phase === 'GROUP') return `Grup - Tur ${round}`;
                                const fromEnd = playoffMaxRound - round;
                                if (fromEnd === 0) return 'Final';
                                if (fromEnd === 1) return 'Yarı Final';
                                if (fromEnd === 2) return 'Çeyrek Final';
                                return `Playoff - Tur ${round}`;
                            };
                            return (
                                <>
                                    <View style={[s.modalHeader, { paddingHorizontal:24 }]}>
                                        <Text style={[s.modalTitle, { flex:1 }]} numberOfLines={2}>🏆 {tourn.name}</Text>
                                        <TouchableOpacity onPress={() => setSelectedArchiveTournament(null)}>
                                            <Text style={s.modalClose}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={{ flexDirection:'row', gap:6, marginBottom:10, paddingHorizontal:24 }}>
                                        {tabs.map(tab => (
                                            <TouchableOpacity key={tab} onPress={() => setArchiveModalTab(tab)}
                                                style={{ paddingHorizontal:12, paddingVertical:6, borderRadius:8, backgroundColor: archiveModalTab===tab ? '#a855f740' : 'transparent', borderWidth:1, borderColor: archiveModalTab===tab ? '#a855f760' : colors.border }}>
                                                <Text style={{ color: archiveModalTab===tab ? '#c084fc' : colors.textMuted, fontSize:12, fontWeight:'700' }}>{tabLabel[tab]}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:24, paddingBottom:24 }}>
                                        {archiveModalTab === 'details' && (
                                            <>
                                                <View style={{ backgroundColor:'#16a34a20', borderRadius:8, paddingHorizontal:12, paddingVertical:6, alignSelf:'flex-start', borderWidth:1, borderColor:'#16a34a50', marginBottom:14 }}>
                                                    <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'800' }}>✅ Tamamlandı</Text>
                                                </View>
                                                {row('📋 Format', typeLabel)}
                                                {row('👤 Organizatör', tourn.creator?.fullName || tourn.creator?.username)}
                                                {tourn.city ? row('📍 Şehir', tourn.city) : null}
                                                {tourn.location ? row('🏟️ Mekan', tourn.location) : null}
                                                {tourn.surface ? row('🎾 Zemin', tourn.surface) : null}
                                                {typeof tourn.isIndoor === 'boolean' ? row('🏠 Alan', tourn.isIndoor ? 'Kapalı' : 'Açık') : null}
                                                {tourn.eventDate ? row('📅 Başlangıç', new Date(tourn.eventDate).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })) : null}
                                                {tourn.eventEndDate ? row('📅 Bitiş', new Date(tourn.eventEndDate).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })) : null}
                                                {row('👥 Katılımcı', `${tourn._count?.participants || 0} kişi`)}
                                                {tourn.setsPerMatch ? row('🎯 Set/Maç', `${tourn.setsPerMatch} set`) : null}
                                                {tourn.playoffQualifiers ? row('🏆 Playoff', `İlk ${tourn.playoffQualifiers} takım`) : null}
                                                {tourn.prize1 ? row('🥇 1. Ödül', tourn.prize1) : null}
                                                {tourn.prize2 ? row('🥈 2. Ödül', tourn.prize2) : null}
                                                {tourn.prize3 ? row('🥉 3. Ödül', tourn.prize3) : null}
                                                {tourn.isPaid ? row('💰 Katılım Ücreti', `${tourn.playerFee} ₺`) : null}
                                                {tourn.completedAt ? row('🏁 Tamamlandı', new Date(tourn.completedAt).toLocaleDateString('tr-TR', { day:'numeric', month:'long', year:'numeric' })) : null}
                                            </>
                                        )}
                                        {archiveModalTab === 'matches' && (
                                            archiveModalLoading
                                                ? <ActivityIndicator color="#c084fc" style={{ marginTop:20 }} />
                                                : archiveModalMatches.length === 0
                                                    ? <Text style={{ color:colors.textMuted, textAlign:'center', marginTop:20, fontSize:13 }}>Maç bulunamadı</Text>
                                                    : (() => {
                                                        const seen = new Set();
                                                        const roundKeys = archiveModalMatches
                                                            .filter(m => { const k=`${m.phase}|${m.round}`; if (seen.has(k)) return false; seen.add(k); return true; })
                                                            .map(m => ({ phase:m.phase, round:m.round }));
                                                        return roundKeys.map(({ phase, round }) => {
                                                            const rMatches = archiveModalMatches.filter(m => m.phase === phase && m.round === round);
                                                            return (
                                                                <View key={`${phase}|${round}`} style={{ marginBottom:10 }}>
                                                                    <Text style={{ color:'#c084fc', fontSize:11, fontWeight:'800', marginBottom:6 }}>{getRoundLabel(round, phase)}</Text>
                                                                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
                                                                    {rMatches.map(match => {
                                                                        const isDone = match.status === 'COMPLETED';
                                                                        const isBye = match.status === 'BYE';
                                                                        const isTBD = !match.p1Id || !match.p2Id;
                                                                        const mSets2 = match.score?.sets || [];
                                                                        const p1SW2 = mSets2.filter(s=>(s.p1||0)>(s.p2||0)).length;
                                                                        const p2SW2 = mSets2.filter(s=>(s.p2||0)>(s.p1||0)).length;
                                                                        return (
                                                                            <View key={match.id} style={{ width:'48.5%', backgroundColor:'#0f172a', borderRadius:8, padding:3, marginBottom:3, borderWidth:1, borderColor: isDone ? '#16a34a30' : '#334155' }}>
                                                                                <View style={{ flexDirection:'row', alignItems:'center' }}>
                                                                                    <Text style={{ color: isDone && match.winnerId===match.p1Id ? '#4ade80' : '#fff', fontSize:11, fontWeight:'700', flex:1 }} numberOfLines={1}>{match.p1Name || 'TBD'}</Text>
                                                                                    {isDone && mSets2.length > 0 && (
                                                                                        <View style={{ flexDirection:'row', gap:3 }}>
                                                                                            {mSets2.map((s,i) => <Text key={i} style={{ color: isDone && match.winnerId===match.p1Id ? '#4ade80' : '#94a3b8', fontSize:12, fontWeight:'900', minWidth:16, textAlign:'center' }}>{s.p1}</Text>)}
                                                                                            <Text style={{ color: isDone && match.winnerId===match.p1Id ? '#4ade80' : '#475569', fontSize:10, fontWeight:'800', minWidth:12, textAlign:'center' }}>{p1SW2}</Text>
                                                                                        </View>
                                                                                    )}
                                                                                </View>
                                                                                <Text style={{ color:colors.textMuted, fontSize:9, marginVertical:3 }}>vs</Text>
                                                                                <View style={{ flexDirection:'row', alignItems:'center' }}>
                                                                                    <Text style={{ color: isDone && match.winnerId===match.p2Id ? '#4ade80' : '#fff', fontSize:11, fontWeight:'700', flex:1 }} numberOfLines={1}>{match.p2Name || 'TBD'}</Text>
                                                                                    {isDone && mSets2.length > 0 && (
                                                                                        <View style={{ flexDirection:'row', gap:3 }}>
                                                                                            {mSets2.map((s,i) => <Text key={i} style={{ color: isDone && match.winnerId===match.p2Id ? '#4ade80' : '#94a3b8', fontSize:12, fontWeight:'900', minWidth:16, textAlign:'center' }}>{s.p2}</Text>)}
                                                                                            <Text style={{ color: isDone && match.winnerId===match.p2Id ? '#4ade80' : '#475569', fontSize:10, fontWeight:'800', minWidth:12, textAlign:'center' }}>{p2SW2}</Text>
                                                                                        </View>
                                                                                    )}
                                                                                </View>
                                                                                {(isBye || isTBD) && (
                                                                                    <Text style={{ color:colors.textMuted, fontSize:9, marginTop:3 }}>{isBye ? 'BYE' : 'TBD'}</Text>
                                                                                )}
                                                                            </View>
                                                                        );
                                                                    })}
                                                                    </View>
                                                                </View>
                                                            );
                                                        });
                                                    })()
                                        )}
                                        {archiveModalTab === 'standings' && (
                                            archiveModalLoading
                                                ? <ActivityIndicator color="#c084fc" style={{ marginTop:20 }} />
                                                : archiveStandings.length === 0
                                                    ? <Text style={{ color:colors.textMuted, textAlign:'center', marginTop:20, fontSize:13 }}>Henüz maç sonucu yok</Text>
                                                    : <View>
                                                        <View style={{ flexDirection:'row', paddingVertical:4, borderBottomWidth:1, borderBottomColor:colors.border, marginBottom:2 }}>
                                                            <Text style={{ color:colors.textMuted, fontSize:10, fontWeight:'700', flex:1 }}>Oyuncu</Text>
                                                            {['O','G','M','Av','P'].map(h => (
                                                                <Text key={h} style={{ color:colors.textMuted, fontSize:10, fontWeight:'700', width:28, textAlign:'center' }}>{h}</Text>
                                                            ))}
                                                        </View>
                                                        {archiveStandings.map((row2, i) => (
                                                            <View key={row2.id} style={{ flexDirection:'row', alignItems:'center', paddingVertical:5, borderBottomWidth: i < archiveStandings.length-1 ? 1 : 0, borderBottomColor:colors.border+'30' }}>
                                                                <Text style={{ color:'#fff', fontSize:11, flex:1 }} numberOfLines={1}>{i+1}. {row2.name}</Text>
                                                                {[row2.played, row2.won, row2.lost, (() => { const d=row2.setsWon-row2.setsLost; return (d>=0?'+':'')+d; })(), row2.points].map((v,j) => (
                                                                    <Text key={j} style={{ color: j===4 ? '#4ade80' : '#fff', fontSize:11, fontWeight: j===4 ? '800' : '400', width:28, textAlign:'center' }}>{String(v)}</Text>
                                                                ))}
                                                            </View>
                                                        ))}
                                                    </View>
                                        )}
                                    </ScrollView>
                                </>
                            );
                        })()}
                    </View>
                </View>
            </Modal>

            {/* ── Media Viewer ── */}
            <Modal visible={mediaViewIdx !== null} animationType="fade" transparent onRequestClose={() => { setMediaViewIdx(null); setMediaShowComments(false); setMediaComments([]); setMediaCommentText(''); }}>
                <View style={{ flex: 1, backgroundColor: '#000000ee' }}>
                    <TouchableOpacity style={{ position: 'absolute', top: 56, right: 20, zIndex: 10 }} onPress={() => { setMediaViewIdx(null); setMediaShowComments(false); setMediaComments([]); setMediaCommentText(''); }}>
                        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>✕</Text>
                    </TouchableOpacity>
                    {mediaViewIdx !== null && mediaPosts[mediaViewIdx] && (() => {
                        const mp = mediaPosts[mediaViewIdx];
                        const isLiked = mediaLiked[mp.id] ?? (Array.isArray(mp.likes) && mp.likes.length > 0);
                        const likeCount = mediaLikeCounts[mp.id] ?? (mp._count?.likes || 0);

                        const toggleMediaLike = async () => {
                            const next = !isLiked;
                            setMediaLiked(prev => ({ ...prev, [mp.id]: next }));
                            setMediaLikeCounts(prev => ({ ...prev, [mp.id]: next ? likeCount + 1 : Math.max(0, likeCount - 1) }));
                            try { await api.post(`/posts/${mp.id}/like`); }
                            catch {
                                setMediaLiked(prev => ({ ...prev, [mp.id]: !next }));
                                setMediaLikeCounts(prev => ({ ...prev, [mp.id]: next ? Math.max(0, likeCount - 1) : likeCount + 1 }));
                            }
                        };

                        const openMediaComments = async () => {
                            const next = !mediaShowComments;
                            setMediaShowComments(next);
                            if (next && mediaComments.length === 0) {
                                try { const { data } = await api.get(`/posts/${mp.id}/comments`); setMediaComments(data); } catch {}
                            }
                        };

                        const sendMediaComment = async () => {
                            const text = mediaCommentText.trim();
                            if (!text) return;
                            setSendingMediaComment(true);
                            try {
                                const { data } = await api.post(`/posts/${mp.id}/comment`, { content: text });
                                setMediaCommentText('');
                                setMediaComments(prev => [...prev, data]);
                            } catch {}
                            finally { setSendingMediaComment(false); }
                        };

                        return (
                            <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                {mp.imageUrl
                                    ? <Image source={{ uri: mp.imageUrl }} style={{ width: '100%', height: mediaShowComments ? '50%' : '75%' }} resizeMode="contain" />
                                    : <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 60 }}>🎬</Text><Text style={{ color: '#fff', marginTop: 8 }}>Video</Text></View>
                                }
                                <Text style={{ color: '#ffffff90', fontSize: 12, fontWeight: '700', marginTop: 8 }}>
                                    @{mp.user?.username} · {mp.subCategory}
                                </Text>

                                {/* Like + Comment bar */}
                                <View style={{ flexDirection: 'row', gap: 24, marginTop: 14 }}>
                                    <TouchableOpacity onPress={toggleMediaLike} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ color: isLiked ? '#f43f5e' : '#ffffff80', fontSize: 22 }}>♥</Text>
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{likeCount}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={openMediaComments} style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                        <Text style={{ color: mediaShowComments ? cfg.color : '#ffffff80', fontSize: 20 }}>💬</Text>
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{mediaComments.length || mp._count?.comments || 0}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Inline comments */}
                                {mediaShowComments && (
                                    <View style={{ width: '90%', marginTop: 10, backgroundColor: '#00000060', borderRadius: 12, padding: 10, maxHeight: 180 }}>
                                        <ScrollView style={{ maxHeight: 100 }} showsVerticalScrollIndicator={false}>
                                            {mediaComments.map((c, i) => (
                                                <View key={c.id || i} style={{ flexDirection: 'row', gap: 6, marginBottom: 5 }}>
                                                    <Text style={{ color: cfg.color, fontSize: 12, fontWeight: '800' }}>@{c.user?.username}</Text>
                                                    <Text style={{ color: '#ffffffcc', fontSize: 12, flex: 1 }}>{c.content}</Text>
                                                </View>
                                            ))}
                                        </ScrollView>
                                        <View style={{ flexDirection: 'row', gap: 8, marginTop: 6 }}>
                                            <TextInput
                                                style={{ flex: 1, backgroundColor: '#ffffff15', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: '#fff', fontSize: 12, borderWidth: 1, borderColor: '#ffffff30' }}
                                                placeholder="Yorum yaz..."
                                                placeholderTextColor="#ffffff50"
                                                value={mediaCommentText}
                                                onChangeText={setMediaCommentText}
                                            />
                                            <TouchableOpacity onPress={sendMediaComment} disabled={sendingMediaComment || !mediaCommentText.trim()}
                                                style={{ backgroundColor: cfg.color, borderRadius: 8, paddingHorizontal: 14, justifyContent: 'center', opacity: !mediaCommentText.trim() ? 0.4 : 1 }}>
                                                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>{sendingMediaComment ? '…' : '↑'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                {/* Prev/Next nav */}
                                <View style={{ flexDirection: 'row', gap: 20, marginTop: 16 }}>
                                    {mediaViewIdx > 0 && (
                                        <TouchableOpacity style={s.storyNavBtn} onPress={() => { setMediaShowComments(false); setMediaComments([]); setMediaCommentText(''); setMediaViewIdx(i => i - 1); }}>
                                            <Text style={{ color: '#fff', fontWeight: '700' }}>‹ Önceki</Text>
                                        </TouchableOpacity>
                                    )}
                                    {mediaViewIdx < mediaPosts.length - 1 && (
                                        <TouchableOpacity style={s.storyNavBtn} onPress={() => { setMediaShowComments(false); setMediaComments([]); setMediaCommentText(''); setMediaViewIdx(i => i + 1); }}>
                                            <Text style={{ color: '#fff', fontWeight: '700' }}>Sonraki ›</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                        );
                    })()}
                </View>
            </Modal>
        </View>
        <TennisSpotlightModal visible={showSpotlight} onClose={() => setShowSpotlight(false)} cfg={cfg} />
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container:        { flex:1, backgroundColor: colors.bg },
    header:           { flexDirection:'row', alignItems:'center', paddingHorizontal:20, marginBottom:14, gap:14 },
    back:             { fontSize:15, fontWeight:'700' },
    title:            { color:'#fff', fontSize:20, fontWeight:'900', flex:1 },

    tabBar:           { flexGrow:0, marginBottom:12 },
    tabBarInner:      { paddingHorizontal:16, gap:8 },
    tab:              { paddingHorizontal:14, paddingTop:7, paddingBottom:11, borderRadius:20, backgroundColor: colors.surface, borderWidth:1, borderColor: colors.border, alignItems:'center', justifyContent:'center' },
    tabText:          { color: colors.textSecondary, fontSize:12, fontWeight:'700', lineHeight:20, includeFontPadding: false },
    tabTextActive:    { color:'#fff' },

    list:             { paddingHorizontal:4, gap:8, paddingBottom:60 },
    sectionTitle:     { color: colors.textSecondary, fontSize:12, fontWeight:'800', marginTop:4, marginBottom:4 },

    createBtn:        { backgroundColor: colors.surface, borderRadius:10, paddingVertical:6, paddingHorizontal:10, alignItems:'center', borderWidth:1, borderStyle:'dashed' },
    createBtnText:    { fontWeight:'700', fontSize:14 },

    filterBox:        { backgroundColor: colors.surface, borderRadius:12, padding:8, borderWidth:1, borderColor: colors.border, gap:6 },
    filterInputRow:   { flexDirection:'row', gap:6, alignItems:'center' },
    filterInput:      { flex:1, backgroundColor: colors.surface2, color:'#fff', borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor: colors.border, fontSize:12 },
    nearBtn:          { backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:6, borderWidth:1, borderColor: colors.border, justifyContent:'center' },
    nearBtnText:      { fontSize:11, fontWeight:'700' },
    dateChips:        { flexDirection:'row', gap:5, flexWrap:'wrap' },
    dateChip:         { paddingHorizontal:9, paddingVertical:4, borderRadius:8, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    dateChipText:     { color: colors.textSecondary, fontSize:11, fontWeight:'700' },
    clearChip:        { paddingHorizontal:9, paddingVertical:4, borderRadius:8, backgroundColor:'#dc262620', borderWidth:1, borderColor:'#dc262640' },
    clearChipText:    { color:'#f87171', fontSize:11, fontWeight:'700' },

    empty:            { alignItems:'center', paddingTop:60, paddingBottom:40 },
    emptyEmoji:       { fontSize:48, marginBottom:12 },
    emptyText:        { color: colors.textSecondary, fontSize:15, fontWeight:'600' },
    emptyBtn:         { marginTop:16, backgroundColor: colors.purple, borderRadius:12, paddingHorizontal:20, paddingVertical:10 },
    emptyBtnText:     { color:'#fff', fontWeight:'700' },

    card:             { backgroundColor: colors.surface, borderRadius:14, paddingHorizontal:10, paddingTop:8, paddingBottom:8, borderWidth:1, borderColor: colors.border },
    cardHeader:       { flexDirection:'row', alignItems:'flex-start', gap:10, marginBottom:2 },
    avatar:           { justifyContent:'center', alignItems:'center', borderWidth:1 },
    avatarText:       { fontWeight:'800' },
    cardName:         { color:'#fff', fontWeight:'700', fontSize:14 },
    cardSub:          { color: colors.textMuted, fontSize:11 },
    ratingText:       { fontSize:11, fontWeight:'900' },

    modeBadge:        { borderRadius:8, paddingHorizontal:8, paddingVertical:3, borderWidth:1, alignSelf:'flex-start' },
    modeBadgeText:    { fontSize:10, fontWeight:'700' },
    joinedCount:      { color: colors.textMuted, fontSize:10, marginTop:2 },

    flexBanner:       { backgroundColor:'#eab30815', borderRadius:10, padding:8, marginBottom:4, borderWidth:1, borderColor:'#eab30840' },
    flexTitle:        { color:'#fbbf24', fontSize:11, fontWeight:'700', marginBottom:2 },
    flexDesc:         { color:'#fcd34d99', fontSize:10 },

    levelRow:         { flexDirection:'row', gap:8, marginBottom:4, flexWrap:'wrap' },
    levelBadge:       { backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:8, paddingVertical:3, color:'#d1d5db', fontSize:11, fontWeight:'700', borderWidth:1, borderColor: colors.border },
    levelDetail:      { backgroundColor:'#a855f720', borderRadius:8, paddingHorizontal:8, paddingVertical:3, color:'#c084fc', fontSize:11, fontWeight:'700', borderWidth:1, borderColor:'#a855f740' },

    cardMsg:          { color: colors.textSecondary, fontSize:13, marginBottom:4 },
    cardMeta:         { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:10 },
    metaItem:         { backgroundColor: colors.surface2, paddingHorizontal:8, paddingVertical:3, borderRadius:8, borderWidth:1, borderColor: colors.border },
    metaItemText:     { color: colors.text, fontSize:11, fontWeight:'600' },

    joinBtn:          { borderRadius:10, paddingVertical:9, alignItems:'center', backgroundColor: colors.purple },
    joinBtnText:      { color:'#fff', fontWeight:'800', fontSize:13 },
    msgBtn:           { backgroundColor:'#2563eb20', borderRadius:10, paddingVertical:8, alignItems:'center', borderWidth:1, borderColor:'#2563eb40', flex:1 },
    msgBtnText:       { color:'#60a5fa', fontWeight:'700', fontSize:12 },
    cancelBtn:        { backgroundColor:'#dc262620', borderRadius:10, paddingVertical:8, alignItems:'center', borderWidth:1, borderColor:'#dc262640', flex:1 },
    cancelBtnText:    { color:'#f87171', fontWeight:'700', fontSize:12 },
    waitingBox:       { backgroundColor: colors.surface2, borderRadius:10, paddingVertical:8, alignItems:'center', borderWidth:1, borderColor: colors.border },
    waitingText:      { color: colors.textMuted, fontSize:13, fontWeight:'600' },

    ownerActions:     { gap:8 },
    ownerBtnRow:      { flexDirection:'row', gap:8 },
    joinRequestsBox:  { backgroundColor: colors.surface2, borderRadius:12, padding:12, borderWidth:1, borderColor: colors.border },
    joinRequestsTitle:{ color:'#fff', fontSize:12, fontWeight:'700', marginBottom:8 },
    joinRequestRow:   { flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 },
    joinRequestName:  { flex:1, color: colors.textSecondary, fontSize:12 },
    acceptBtn:        { backgroundColor:'#16a34a', borderRadius:8, width:28, height:28, justifyContent:'center', alignItems:'center' },
    declineBtn:       { backgroundColor:'#dc2626', borderRadius:8, width:28, height:28, justifyContent:'center', alignItems:'center' },

    participantsRow:      { flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:6 },
    participantChip:      { backgroundColor:'#16a34a15', borderRadius:8, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#16a34a40' },
    participantChipText:  { color:'#4ade80', fontSize:11, fontWeight:'700' },
    pendingBadge:         { backgroundColor:'#a855f715', borderRadius:8, paddingHorizontal:10, paddingVertical:5, borderWidth:1, borderColor:'#a855f740', marginBottom:4 },
    pendingBadgeText:     { color:'#c084fc', fontSize:12, fontWeight:'700' },

    scoreText:        { color:'#fff', fontSize:16, fontWeight:'900' },
    scoreBtn:         { backgroundColor:'#a855f720', borderRadius:10, paddingHorizontal:12, paddingVertical:6, borderWidth:1, borderColor:'#a855f750' },
    scoreBtnText:     { color:'#c084fc', fontSize:12, fontWeight:'700' },
    commentBtn:       { backgroundColor:'#0ea5e920', borderRadius:10, paddingHorizontal:12, paddingVertical:6, borderWidth:1, borderColor:'#0ea5e950' },
    commentBtnText:   { color:'#38bdf8', fontSize:12, fontWeight:'700' },
    confirmBtn:       { backgroundColor:'#16a34a30', borderRadius:8, paddingHorizontal:10, paddingVertical:4, marginTop:4, borderWidth:1, borderColor:'#16a34a60' },
    confirmBtnText:   { color:'#4ade80', fontSize:11, fontWeight:'700' },
    scoreForm:        { marginTop:10 },
    scoreInputRow:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:8 },
    scoreInput:       { backgroundColor: colors.surface2, color:'#fff', borderRadius:10, paddingHorizontal:12, paddingVertical:10, borderWidth:1, borderColor: colors.border, fontSize:18, fontWeight:'800', width:60, textAlign:'center' },

    modalOverlay:     { flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' },
    modalBox:         { backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:24, paddingLeft:2, paddingRight:2, paddingBottom:40, maxHeight:'92%' },
    modalHeader:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
    modalTitle:       { color:'#fff', fontSize:18, fontWeight:'900' },
    modalClose:       { color: colors.textMuted, fontSize:22 },

    fieldLabel:       { color: colors.textSecondary, fontSize:12, fontWeight:'700', marginBottom:6 },
    fieldHint:        { color: colors.textMuted, fontSize:10, marginBottom:8 },
    fieldInput:       { backgroundColor: colors.surface2, color:'#fff', borderRadius:12, paddingHorizontal:14, paddingVertical:12, borderWidth:1, borderColor: colors.border, fontSize:14, marginBottom:14 },
    chipRow:          { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:14 },
    chipBtn:          { paddingHorizontal:10, paddingVertical:6, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    chipBtnActive:    { backgroundColor: colors.purple, borderColor: colors.purple },
    chipBtnText:      { color: colors.textSecondary, fontSize:12, fontWeight:'700' },
    chipBtnTextActive:{ color:'#fff' },
    submitBtn:        { backgroundColor: colors.purple, borderRadius:14, paddingVertical:14, alignItems:'center', marginTop:8 },
    submitBtnText:    { color:'#fff', fontWeight:'800', fontSize:15 },

    switchRow:        { flexDirection:'row', alignItems:'center', backgroundColor: colors.surface2, borderRadius:14, padding:14, marginBottom:14, borderWidth:1, borderColor: colors.border },

    eloWarning:       { backgroundColor:'#dc262615', borderRadius:12, padding:12, marginBottom:14, borderWidth:1, borderColor:'#dc262640' },
    eloWarningText:   { color:'#fca5a5', fontSize:12, fontWeight:'600', lineHeight:18 },
    modeHint:         { color:'#60a5fa', fontSize:11, fontWeight:'600', marginBottom:10, marginTop:-6 },

    profileHeader:    { alignItems:'center', paddingVertical:20, gap:6 },
    profileName:      { color:'#fff', fontSize:20, fontWeight:'900', textAlign:'center' },
    profileUsername:  { color: colors.textMuted, fontSize:13 },
    profileMeta:      { color: colors.textSecondary, fontSize:12, marginTop:4 },
    profileBioBox:    { backgroundColor: colors.surface2, borderRadius:12, padding:14, marginBottom:14, borderWidth:1, borderColor: colors.border },
    profileBioText:   { color: colors.textSecondary, fontSize:13, lineHeight:20 },
    profileSection:   { backgroundColor: colors.surface2, borderRadius:14, padding:14, marginBottom:14, borderWidth:1, borderColor: colors.border, gap:10 },
    profileSectionTitle:{ color:'#fff', fontSize:13, fontWeight:'800', marginBottom:4 },
    profileInterestRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:6, borderTopWidth:1, borderTopColor: colors.border },
    profileInterestName:{ color:'#fff', fontSize:14, fontWeight:'700', textTransform:'capitalize' },
    profileWL:        { color: colors.textMuted, fontSize:11, marginTop:2 },
    profileRating:    { fontSize:15, fontWeight:'900' },
    levelPill:        { borderRadius:8, paddingHorizontal:8, paddingVertical:3, borderWidth:1 },
    levelPillText:    { fontSize:10, fontWeight:'700' },
    privateBox:       { backgroundColor:'#374151', borderRadius:12, paddingHorizontal:16, paddingVertical:10, marginTop:8 },
    privateText:      { color:'#9ca3af', fontSize:13, fontWeight:'700' },

    courtResultsBox:  { backgroundColor: colors.surface2, borderRadius:12, borderWidth:1, borderColor: colors.border, marginBottom:10, overflow:'hidden' },
    courtResultRow:   { padding:12, borderBottomWidth:1, borderBottomColor: colors.border, flexDirection:'row', alignItems:'center' },
    courtResultName:  { color:'#fff', fontSize:13, fontWeight:'700' },
    courtResultCity:  { color: colors.textMuted, fontSize:11, marginTop:2 },
    selectedCourtBox: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:'#16a34a20', borderRadius:10, padding:10, marginBottom:10, borderWidth:1, borderColor:'#16a34a50' },
    selectedCourtText:{ color:'#4ade80', fontSize:13, fontWeight:'700', flex:1 },
    addCourtBtn:      { paddingVertical:10, alignItems:'center', marginBottom:10 },
    addCourtBtnText:  { color: colors.purple, fontSize:13, fontWeight:'700' },
    manualCourtBox:   { backgroundColor: colors.surface2, borderRadius:12, padding:12, marginBottom:10, borderWidth:1, borderColor: colors.border },
    manualCourtNote:  { color:'#fbbf24', fontSize:11, marginBottom:10, lineHeight:16 },

    checkRow:         { flexDirection:'row', alignItems:'center', gap:10, marginBottom:14 },
    checkbox:         { width:22, height:22, borderRadius:6, borderWidth:2, borderColor: colors.border, justifyContent:'center', alignItems:'center' },
    checkboxChecked:  { backgroundColor: colors.purple, borderColor: colors.purple },
    checkLabel:       { color: colors.textSecondary, fontSize:13, fontWeight:'600' },

    triRow:           { flexDirection:'row', gap:8, marginBottom:12 },
    triBtn:           { flex:1, backgroundColor: colors.surface2, borderRadius:10, paddingVertical:7, paddingHorizontal:8, borderWidth:1, borderColor: colors.border, alignItems:'center' },
    triBtnFilled:     { borderColor: colors.purple+'80' },
    triLabel:         { color: colors.textMuted, fontSize:10, fontWeight:'700', marginBottom:2 },
    triValue:         { color:'#fff', fontSize:12, fontWeight:'800', textAlign:'center' },
    triPlaceholder:   { color: colors.textMuted, fontSize:13 },

    storyNavBtn:      { backgroundColor:'#ffffff20', borderRadius:12, paddingHorizontal:20, paddingVertical:10 },

    chip:             { paddingHorizontal:12, paddingVertical:7, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    chipText:         { color: colors.textSecondary, fontSize:12, fontWeight:'700' },
});
