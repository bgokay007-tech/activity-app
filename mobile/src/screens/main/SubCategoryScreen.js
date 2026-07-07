import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet,
    RefreshControl, ActivityIndicator, TextInput, Modal,
    Alert, KeyboardAvoidingView, Platform, Switch, Linking, Image,
    InteractionManager, PanResponder, Animated,
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

// Tüm istatistikler eşit olduğunda kullanılan sabit (deterministik) kura — backend'deki
// stableTiebreakHash ile birebir aynı, böylece sıralama her açılışta değişmez.
function stableTiebreakHash(tournamentId, playerId) {
    const str = `${tournamentId}:${playerId}`;
    let h = 0;
    for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) >>> 0;
    return h;
}

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
const senderAlias = (p) => p?.alias || p?.interests?.[0]?.alias || `${p?.username}`;
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
                        <View style={{ alignItems: 'center', paddingVertical: 37, gap: 3 }}>
                            <Avatar name={profile.username} size={64} />
                            <Text style={{ color: '#fff', fontSize: 18, fontWeight: '800' }}>{profile.fullName || profile.username}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 13 }}>{profile.username}</Text>
                            <View style={s.privateBox}>
                                <Text style={s.privateText}>{t.privateAccount}</Text>
                            </View>
                            {profile.interests?.some(i => i.lateCancelCount > 0) && (
                                <View style={{ gap: 3, width: '100%' }}>
                                    {profile.interests.filter(i => i.lateCancelCount > 0).map(i => (
                                        <View key={i.id} style={{ backgroundColor:'#dc262615', borderRadius:10, paddingHorizontal:9, paddingVertical:5, borderWidth:1, borderColor:'#dc262640', flexDirection:'row', justifyContent:'space-between' }}>
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
                                <Text style={s.profileUsername}>{profile.username}</Text>
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
                                            <View style={{ alignItems: 'flex-end', gap: 3 }}>
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
                                                    <View style={{ backgroundColor:'#dc262615', borderRadius:8, paddingHorizontal:3, paddingVertical:0, borderWidth:1, borderColor:'#dc262640' }}>
                                                        <Text style={{ color:'#f87171', fontSize:10, fontWeight:'800' }}>{t.lateCancelLabel(i.lateCancelCount)}</Text>
                                                    </View>
                                                )}
                                            </View>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Contact buttons */}
                            {(profile.contactPhone || profile.contactTelegram || profile.contactEmail || profile.contactInstagram) && (
                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:6, marginBottom:10, paddingHorizontal:2 }}>
                                    {profile.contactPhone && (<>
                                        <TouchableOpacity onPress={() => Linking.openURL(`tel:${profile.contactPhone}`)} style={{ flexDirection:'row', alignItems:'center', gap:4, backgroundColor:'#16a34a20', borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:'#16a34a50' }}>
                                            <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'700' }}>📞 Ara</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => Linking.openURL(`whatsapp://send?phone=${profile.contactPhone.replace(/\D/g,'')}`)} style={{ flexDirection:'row', alignItems:'center', gap:4, backgroundColor:'#16a34a20', borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:'#16a34a50' }}>
                                            <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'700' }}>💬 WhatsApp</Text>
                                        </TouchableOpacity>
                                    </>)}
                                    {profile.contactTelegram && (
                                        <TouchableOpacity onPress={() => Linking.openURL(`https://t.me/${profile.contactTelegram.replace(/^@/,'')}`)} style={{ backgroundColor:'#1d4ed820', borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:'#1d4ed850' }}>
                                            <Text style={{ color:'#60a5fa', fontSize:12, fontWeight:'700' }}>✈️ Telegram</Text>
                                        </TouchableOpacity>
                                    )}
                                    {profile.contactEmail && (
                                        <TouchableOpacity onPress={() => Linking.openURL(`mailto:${profile.contactEmail}`)} style={{ backgroundColor:'#78350f20', borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:'#78350f50' }}>
                                            <Text style={{ color:'#fbbf24', fontSize:12, fontWeight:'700' }}>✉️ E-Posta</Text>
                                        </TouchableOpacity>
                                    )}
                                    {profile.contactInstagram && (
                                        <TouchableOpacity onPress={() => { const u = profile.contactInstagram.replace(/^@/,''); Linking.openURL(`instagram://user?username=${u}`).catch(() => Linking.openURL(`https://instagram.com/${u}`)); }} style={{ backgroundColor:'#be185d20', borderRadius:8, paddingHorizontal:10, paddingVertical:6, borderWidth:1, borderColor:'#be185d50' }}>
                                            <Text style={{ color:'#f472b6', fontSize:12, fontWeight:'700' }}>📸 Instagram</Text>
                                        </TouchableOpacity>
                                    )}
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

function RivalDetailModal({ visible, item, myId, sub, cfg, t, onClose, navigation, handleJoin, handleCancel, handleRespondJoin, onEdit, onRefresh }) {
    const [localParticipants, setLocalParticipants] = useState(null);
    const [localJoinRequests, setLocalJoinRequests] = useState(null);
    const [localGender, setLocalGender] = useState(null); // {genderReq, partnerGenderReq, opp1GenderReq, opp2GenderReq}
    const [swapSlot, setSwapSlot] = useState(null); // 'partner'|'opp1'|'opp2' — seçili slot
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
    const seedingDemoRivalRef = useRef(false);

    useEffect(() => {
        setLocalParticipants(null);
        setLocalJoinRequests(null);
        setLocalGender(null);
        setSwapSlot(null);
        setComments([]);
        setCommentText('');
        if (item?.id && visible) {
            // Fresh fetch: güncel cinsiyet, katılımcılar ve istekler
            api.get(`/rivals/${item.id}`)
                .then(({ data }) => {
                    setLocalGender({
                        genderReq: data.genderReq ?? item.genderReq,
                        partnerGenderReq: data.partnerGenderReq ?? item.partnerGenderReq,
                        opp1GenderReq: data.opp1GenderReq ?? item.opp1GenderReq,
                        opp2GenderReq: data.opp2GenderReq ?? item.opp2GenderReq,
                    });
                    if (Array.isArray(data.joinRequests)) setLocalJoinRequests(data.joinRequests);
                    if (Array.isArray(data.participants)) setLocalParticipants(data.participants);
                })
                .catch(() => {});
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
            if (updated.genderReq !== undefined || updated.opp1GenderReq !== undefined) {
                setLocalGender({
                    genderReq: updated.genderReq ?? item.genderReq,
                    partnerGenderReq: updated.partnerGenderReq ?? item.partnerGenderReq,
                    opp1GenderReq: updated.opp1GenderReq ?? item.opp1GenderReq,
                    opp2GenderReq: updated.opp2GenderReq ?? item.opp2GenderReq,
                });
            }
        });
        return off;
    }, [visible, item?.id]);

    const isOwner = item.senderId === myId;
    const participants = localParticipants ?? (Array.isArray(item.participants) ? item.participants : []);
    const joinRequests = localJoinRequests ?? (Array.isArray(item.joinRequests) ? item.joinRequests : []);
    const genderReq = localGender?.genderReq ?? item.genderReq ?? 'MIX';
    const partnerGenderReq = localGender?.partnerGenderReq ?? item.partnerGenderReq ?? 'MIX';
    const opp1GenderReq = localGender?.opp1GenderReq ?? item.opp1GenderReq ?? 'MIX';
    const opp2GenderReq = localGender?.opp2GenderReq ?? item.opp2GenderReq ?? 'MIX';
    const genderLabel = (g) => g === 'MALE' ? '♂ Erkek' : g === 'FEMALE' ? '♀ Kadın' : null;
    const required = item.matchType === 'DOUBLE'
        ? ((Array.isArray(item.senderTeam) && item.senderTeam.length > 0) ? 2 : 3)
        : (item.teamSize || 1);
    const senderSideCount = 1 + (Array.isArray(item.senderTeam) ? item.senderTeam.length : 0);
    const filled = participants.filter(p => p && p.id).length;
    const mySentReq = item._myJoinStatus;
    const isFull = filled >= required;
    const isParticipant = participants.some(p => p?.id === myId);
    const myInvite = joinRequests.find(jr => jr.userId === myId && jr.initiatedBy === 'OWNER');
    const isInvolved = isOwner || isParticipant || (mySentReq !== null && mySentReq !== undefined);
    const participantIds = new Set([item.senderId, ...participants.filter(p => p?.id).map(p => p.id)]);
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

    const acceptLocal = async (jrId) => {
        const prevLocalJoinRequests = joinRequests;
        setLocalJoinRequests(joinRequests.filter(r => r.id !== jrId));
        try {
            const res = await api.patch(`/rivals/join/${jrId}`, { action: 'accept' });
            if (res.data?.matched) {
                setTimeout(onRefresh, 1200);
            } else {
                onRefresh();
            }
        } catch(e) {
            if (e?.response) Alert.alert(t.error, e.response.data?.message || t.actionFailed);
            setLocalJoinRequests(prevLocalJoinRequests);
            setLocalParticipants(null);
        }
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
            `${participantName ? participantName : 'Bu kullanıcı'} maçtan çıkarılacak, ilan tekrar açık hâle gelecek. Emin misiniz?`,
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

    // DOUBLE: iki slot arasında oyuncu taşı (seç + taşı)
    const handleSlotTap = async (slot) => {
        if (!isOwner) return;
        if (!swapSlot) { setSwapSlot(slot); return; }
        if (swapSlot === slot) { setSwapSlot(null); return; }
        const s1 = swapSlot; const s2 = slot;
        setSwapSlot(null);
        try {
            const { data } = await api.patch(`/rivals/${item.id}/swap-positions`, { slot1: s1, slot2: s2 });
            if (Array.isArray(data.participants)) setLocalParticipants(data.participants);
            onRefresh(); // senderTeam (partner) dahil tüm veriyi yenile
        } catch (e) { Alert.alert('', e?.response?.data?.message || t.actionFailed); }
    };

    // Çiftler: eşleşmiş bir çifti ya da partner arayan bireyseli ikili kart olarak render eder
    const renderRivalDuoCard = (p1, p2, solos, byUserId) => {
        const nameOf = (jr) => jr?.user?.fullName || jr?.user?.username || '';
        const ratingOf = (jr) => jr?.user?.interests?.find(i => i.subCategory === sub)?.skillRating;
        const Half = ({ jr }) => (
            <View>
                <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }} numberOfLines={1}>{nameOf(jr)}</Text>
                <Text style={{ color: colors.textMuted, fontSize:9 }} numberOfLines={1}>{jr?.user?.username}{ratingOf(jr) != null ? `  ${starEmoji(Number(ratingOf(jr)))} ${Number(ratingOf(jr)).toFixed(2)}` : ''}</Text>
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
                            <TouchableOpacity onPress={() => setMyRivalJoinPartner(invitedBy.userId)} disabled={partnerActionLoading} style={{ marginTop:2, backgroundColor:'#16a34a30', borderRadius:5, paddingHorizontal:3, paddingVertical:0, alignSelf:'flex-start', borderWidth:1, borderColor:'#16a34a50' }}>
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
                                style={{ marginTop:2, backgroundColor: cfg.color+'20', borderRadius:5, paddingHorizontal:3, paddingVertical:0, alignSelf:'flex-start', borderWidth:1, borderColor: cfg.color+'40' }}>
                                <Text style={{ color: cfg.color, fontSize:9, fontWeight:'700' }}>+ Davet Et</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                );
            }
        }

        return (
            <View key={p1.id} style={{ width:'48%', backgroundColor:'#1e293b', borderRadius:8, borderWidth:1, borderColor: colors.border+'40', paddingVertical:3, paddingHorizontal:5, marginBottom:6 }}>
                <Half jr={p1} />
                <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'900', textAlign:'center', marginVertical:2 }}>+</Text>
                {slot2}
                {isOwner && (
                    <View style={{ flexDirection:'row', gap:3, marginTop:4 }}>
                        <TouchableOpacity onPress={() => acceptLocal(p1.id)} style={{ flex:1, backgroundColor:'#16a34a30', borderRadius:5, paddingVertical:0, alignItems:'center', borderWidth:1, borderColor:'#16a34a50' }}>
                            <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'700' }}>Kabul</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => rejectLocal(p1.id)} style={{ flex:1, backgroundColor:'#dc262630', borderRadius:5, paddingVertical:0, alignItems:'center', borderWidth:1, borderColor:'#dc262650' }}>
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
                <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:5, paddingTop: Platform.OS==='ios' ? 56 : 24, paddingBottom:moderateScale(14), borderBottomWidth:1, borderBottomColor: colors.border }}>
                    <TouchableOpacity onPress={onClose} style={{ marginRight:14, padding:1 }}>
                        <Text style={{ color:'#fff', fontSize:moderateScale(22), fontWeight:'300' }}>←</Text>
                    </TouchableOpacity>
                    <View style={{ flex:1 }}>
                        <Text style={{ color:'#fff', fontSize:moderateScale(16), fontWeight:'800' }}>{item.subCategory}</Text>
                        <Text style={{ color: colors.textMuted, fontSize:moderateScale(12), marginTop:1 }}>{senderAlias(item.sender)}</Text>
                    </View>
                    <ModeBadge mode={item.matchMode} />
                </View>

                {/* Scrollable content */}
                <ScrollView style={{ flex:1 }} contentContainerStyle={{ paddingHorizontal:5, paddingTop:13, paddingBottom:5 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

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
                    <View style={{ flexDirection:'row', alignItems:'center', gap:moderateScale(10), marginBottom:item.message ? 8 : 12, paddingBottom:9, borderBottomWidth:1, borderBottomColor: colors.border }}>
                        <Avatar name={item.sender?.username} avatar={item.sender?.avatar} size={moderateScale(34)} color={cfg.color} onPress={() => item.senderId && navigation.push('Profile', { userId: item.senderId })} />
                        <View style={{ flex:1, flexDirection:'row', alignItems:'center', gap:3 }}>
                            <Text style={[s.cardName, { fontSize: moderateScale(14) }]}>{senderAlias(item.sender)}</Text>
                            {item.sender?.gender && item.sender.gender !== 'OTHER' && (
                                <Text style={{ fontSize: moderateScale(11), fontWeight:'700', color: item.sender.gender === 'MALE' ? '#3b82f6' : '#ec4899' }}>
                                    {item.sender.gender === 'MALE' ? '♂' : '♀'}
                                </Text>
                            )}
                            {item.sender?.interests?.[0]?.assessmentCompleted && (
                                <Text style={{ color:'#facc15', fontSize:moderateScale(12), fontWeight:'800' }}>{Number(item.sender.interests[0].skillRating).toFixed(2)} ★</Text>
                            )}
                        </View>
                        <View style={[s.modeBadge, { backgroundColor:cfg.color+'20', borderColor:cfg.color+'40', borderRadius: moderateScale(8), paddingHorizontal: moderateScale(8), paddingVertical: moderateScale(3) }]}>
                            <Text style={[s.modeBadgeText, { color:cfg.color, fontSize: moderateScale(10) }]}>
                                {TEAM_SPORTS.has(sub) ? `${item.teamSize||1}v${item.teamSize||1}` : (item.matchType==='DOUBLE' ? '2v2' : '1v1')}
                            </Text>
                        </View>
                        {item.genderReq && item.genderReq !== 'MIX' && (
                            <View style={{ backgroundColor: item.genderReq === 'MALE' ? '#3b82f620' : '#ec489920', borderColor: item.genderReq === 'MALE' ? '#3b82f6' : '#ec4899', borderWidth:1, borderRadius: moderateScale(8), paddingHorizontal: moderateScale(6), paddingVertical: moderateScale(3) }}>
                                <Text style={{ color: item.genderReq === 'MALE' ? '#3b82f6' : '#ec4899', fontSize: moderateScale(10), fontWeight:'800' }}>
                                    {item.genderReq === 'MALE' ? '👨 Erkek' : '👩 Kadın'}
                                </Text>
                            </View>
                        )}
                        {item.matchType === 'DOUBLE' && (item.partnerGenderReq !== 'MIX' || item.opp1GenderReq !== 'MIX' || item.opp2GenderReq !== 'MIX') && (() => {
                            const gL = (g) => g === 'MALE' ? '♂' : g === 'FEMALE' ? '♀' : '⚥';
                            const allSame = item.opp1GenderReq === item.opp2GenderReq && item.opp2GenderReq === item.partnerGenderReq;
                            const label = allSame && item.opp1GenderReq !== 'MIX'
                                ? `${gL(item.opp1GenderReq)} ${item.opp1GenderReq === 'MALE' ? 'Erkek' : 'Kadın'}`
                                : `${gL(item.partnerGenderReq)}+${gL(item.opp1GenderReq)}+${gL(item.opp2GenderReq)}`;
                            return (
                                <View style={{ backgroundColor:'#a855f715', borderColor:'#a855f740', borderWidth:1, borderRadius: moderateScale(8), paddingHorizontal: moderateScale(6), paddingVertical: moderateScale(3) }}>
                                    <Text style={{ color:'#a855f7', fontSize: moderateScale(9), fontWeight:'800' }}>{label}</Text>
                                </View>
                            );
                        })()}
                    </View>
                    {item.message && <Text style={[s.cardMsg, { marginBottom:12, fontSize: moderateScale(13) }]}>{item.message}</Text>}

                    {/* Oyuncular */}
                    <View style={det.section}>
                        <Text style={det.sectionTitle}>👥 {t.players || 'Oyuncular'} ({senderSideCount + filled} / {senderSideCount + required})</Text>
                        {item.matchType === 'DOUBLE' ? (() => {
                            const senderTeamArr = Array.isArray(item.senderTeam) ? item.senderTeam : [];
                            const allJoinReqs = localJoinRequests ?? (Array.isArray(item.joinRequests) ? item.joinRequests : []);
                            const pendingPartnerInvite = allJoinReqs.find(jr => jr.isPartnerInvite && jr.initiatedBy === 'OWNER' && jr.status === 'PENDING');

                            // Slot kutusu: seçiliyse altın border, doluysa dokunulabilir
                            const SlotBox = ({ slot, gReqLabel, p, fallback, onRemove, locked }) => {
                                const isSelected = swapSlot === slot;
                                const isTarget   = !!swapSlot && !locked && !!p && swapSlot !== slot;
                                const borderColor = isSelected ? '#f59e0b' : isTarget ? '#a855f7' : colors.border + '40';
                                const bg = isSelected ? '#f59e0b18' : isTarget ? '#a855f710' : undefined;
                                return (
                                    <TouchableOpacity
                                        onPress={() => { if (!locked && p && isOwner && swapSlot) handleSlotTap(slot); }}
                                        onLongPress={() => { if (!locked && p && isOwner && !swapSlot) handleSlotTap(slot); }}
                                        delayLongPress={400}
                                        activeOpacity={locked || !p || !isOwner ? 1 : 0.7}
                                        style={{ borderWidth: isSelected || isTarget ? 1.5 : 0, borderColor, borderRadius:6, padding:1, backgroundColor: bg }}
                                    >
                                        {gReqLabel && <Text style={{ color:'#a855f7', fontSize:8, fontWeight:'700', marginBottom:1 }}>{gReqLabel}</Text>}
                                        {p ? (
                                            <View>
                                                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                                                    <TouchableOpacity onPress={() => !swapSlot && p.id && navigation.push('Profile', { userId: p.id })} style={{ flex:1 }}>
                                                        <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }} numberOfLines={1}>{playerDisplayName(p)}</Text>
                                                        <Text style={{ color: colors.textMuted, fontSize:9 }} numberOfLines={1}>{p.username}</Text>
                                                    </TouchableOpacity>
                                                    {isSelected && <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'900', marginLeft:4 }}>✓</Text>}
                                                    {isTarget  && <Text style={{ color:'#a855f7', fontSize:10, fontWeight:'900', marginLeft:4 }}>⇄</Text>}
                                                </View>
                                                {!locked && isOwner && !swapSlot && onRemove && (
                                                    <TouchableOpacity onPress={onRemove} style={{ marginTop:2 }}>
                                                        <Text style={{ color:'#f87171', fontSize:9, fontWeight:'700' }}>Çıkar</Text>
                                                    </TouchableOpacity>
                                                )}
                                                {!locked && isOwner && !swapSlot && (
                                                    <Text style={{ color:'#f59e0b44', fontSize:8, marginTop:2 }}>↕ taşımak için basılı tut</Text>
                                                )}
                                            </View>
                                        ) : (
                                            <Text style={{ color: colors.textMuted, fontSize:9 }}>{fallback}</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            };

                            const PartnerContent = senderTeamArr[0]
                                ? senderTeamArr[0]
                                : pendingPartnerInvite
                                    ? null // pending state özel gösterim
                                    : null;

                            return (
                                <View>
                                    {swapSlot && (
                                        <View style={{ backgroundColor:'#f59e0b18', borderRadius:6, padding:3, marginBottom:6, alignItems:'center' }}>
                                            <Text style={{ color:'#f59e0b', fontSize:11, fontWeight:'700' }}>Taşınacak oyuncu seçildi — hedef slota dokun</Text>
                                            <TouchableOpacity onPress={() => setSwapSlot(null)} style={{ marginTop:3 }}>
                                                <Text style={{ color: colors.textMuted, fontSize:10 }}>İptal</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
                                        <View style={{ width:'48%', backgroundColor:'#1e293b', borderRadius:8, borderWidth:1, borderColor: colors.border+'40', paddingVertical:5, paddingHorizontal:5, marginBottom:6 }}>
                                            <Text style={{ color: cfg.color, fontSize:9, fontWeight:'800', marginBottom:4 }}>👑 Kurucu Takımı</Text>
                                            {/* Kurucu sabit — taşınamaz */}
                                            <SlotBox slot="__owner" locked p={item.sender} fallback="" />
                                            <View style={{ flexDirection:'row', alignItems:'center', marginVertical:2 }}>
                                                <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'900', flex:1, textAlign:'center' }}>+</Text>
                                                {genderLabel(partnerGenderReq) && <Text style={{ color:'#a855f7', fontSize:8, fontWeight:'700' }}>{genderLabel(partnerGenderReq)}</Text>}
                                            </View>
                                            {PartnerContent ? (
                                                <SlotBox slot="partner" p={PartnerContent} fallback="Partner yok" gReqLabel={null} />
                                            ) : pendingPartnerInvite ? (
                                                <View>
                                                    <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }} numberOfLines={1}>{pendingPartnerInvite.user?.fullName || pendingPartnerInvite.user?.username}</Text>
                                                    <Text style={{ color:'#fbbf24', fontSize:9, fontWeight:'700' }}>⏳ Onay Bekleniyor</Text>
                                                </View>
                                            ) : (
                                                <Text style={{ color: colors.textMuted, fontSize:9 }}>Partner yok</Text>
                                            )}
                                        </View>
                                        <View style={{ width:'48%', backgroundColor:'#1e293b', borderRadius:8, borderWidth:1, borderColor: colors.border+'40', paddingVertical:5, paddingHorizontal:5, marginBottom:6 }}>
                                            <Text style={{ color:'#f87171', fontSize:9, fontWeight:'800', marginBottom:4 }}>⚔️ Rakip Takımı</Text>
                                            <SlotBox slot="opp1" p={participants[0]} fallback="Henüz katılan yok"
                                                gReqLabel={genderLabel(opp1GenderReq)}
                                                onRemove={isOwner && participants[0] ? () => removeRivalParticipant(participants[0].id, participants[0].username) : null}
                                            />
                                            <View style={{ flexDirection:'row', alignItems:'center', marginVertical:2 }}>
                                                <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'900', flex:1, textAlign:'center' }}>+</Text>
                                                {genderLabel(opp2GenderReq) && <Text style={{ color:'#a855f7', fontSize:8, fontWeight:'700' }}>{genderLabel(opp2GenderReq)}</Text>}
                                            </View>
                                            <SlotBox slot="opp2" p={participants[1]} fallback="Henüz katılan yok"
                                                gReqLabel={genderLabel(opp2GenderReq)}
                                                onRemove={isOwner && participants[1] ? () => removeRivalParticipant(participants[1].id, participants[1].username) : null}
                                            />
                                        </View>
                                    </View>
                                </View>
                            );
                        })() : (
                            <>
                                <View style={det.playerRow}>
                                    <Avatar name={item.sender?.username} avatar={item.sender?.avatar} size={moderateScale(32)} color={cfg.color} onPress={() => item.senderId && navigation.push('Profile', { userId: item.senderId })} />
                                    <View style={{ flex:1 }}>
                                        <Text style={det.playerName}>{playerDisplayName(item.sender)}</Text>
                                        <Text style={det.playerSub}>{item.sender?.username} · {t.founder || 'Kurucu'}</Text>
                                    </View>
                                </View>
                                {participants.filter(p => p?.id).map((p, i) => (
                                    <View key={p.id || i} style={det.playerRow}>
                                        <Avatar name={p.username} avatar={p.avatar} size={moderateScale(32)} color={cfg.color} onPress={() => p.id && navigation.push('Profile', { userId: p.id })} />
                                        <View style={{ flex:1 }}>
                                            <Text style={det.playerName}>{playerDisplayName(p)}</Text>
                                            <Text style={det.playerSub}>{p.username}</Text>
                                        </View>
                                        {isOwner && (
                                            <TouchableOpacity onPress={() => removeRivalParticipant(p.id, p.username)} style={{ padding:3 }}>
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
                                const solosWithPartnerLink = solos.filter(s => s.partnerId || solos.some(o => o.partnerId === s.userId && o.userId !== s.userId));
                                const solosIndividual = solos.filter(s => !s.partnerId && !solos.some(o => o.partnerId === s.userId && o.userId !== s.userId));
                                return (
                                    <View>
                                        <View style={{ flexDirection:'row', flexWrap:'wrap', justifyContent:'space-between' }}>
                                            {pairs.map(([a, b]) => renderRivalDuoCard(a, b, solos, byUserId))}
                                            {solosWithPartnerLink.map(s => renderRivalDuoCard(s, null, solos, byUserId))}
                                        </View>
                                        {solosIndividual.map(jr => (
                                            <View key={jr.id} style={det.playerRow}>
                                                <Avatar name={jr.user?.username} avatar={jr.user?.avatar} size={moderateScale(32)} color={cfg.color} onPress={() => jr.user?.id && navigation.push('Profile', { userId: jr.user.id })} />
                                                <View style={{ flex:1 }}>
                                                    <Text style={det.playerName}>{jr.user?.fullName || jr.user?.username}</Text>
                                                    <Text style={det.playerSub}>{jr.user?.username}</Text>
                                                </View>
                                                {isOwner && (
                                                    <View style={{ flexDirection:'row', gap:3 }}>
                                                        <TouchableOpacity style={[s.acceptBtn, { borderRadius: moderateScale(8), width: moderateScale(28), height: moderateScale(28) }]} onPress={() => acceptLocal(jr.id)}>
                                                            <Text style={{ color:'#fff', fontSize:moderateScale(12), fontWeight:'700' }}>✓</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity style={[s.declineBtn, { borderRadius: moderateScale(8), width: moderateScale(28), height: moderateScale(28) }]} onPress={() => rejectLocal(jr.id)}>
                                                            <Text style={{ color:'#fff', fontSize:moderateScale(12), fontWeight:'700' }}>✕</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                            </View>
                                        ))}
                                    </View>
                                );
                            })() : joinRequests.filter(jr => jr.initiatedBy !== 'OWNER').map(jr => (
                                <View key={jr.id} style={det.playerRow}>
                                    <Avatar name={jr.user?.username} avatar={jr.user?.avatar} size={moderateScale(32)} color={cfg.color} onPress={() => jr.user?.id && navigation.push('Profile', { userId: jr.user.id })} />
                                    <View style={{ flex:1 }}>
                                        <Text style={det.playerName}>{jr.user?.fullName || jr.user?.username}</Text>
                                        <Text style={det.playerSub}>{jr.user?.username}</Text>
                                    </View>
                                    <View style={{ flexDirection:'row', gap:3 }}>
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
                    {/* Ilan sahibinin gönderdiği (OWNER) rakip davetler — partner davetleri kurucu takımı panelinde gösterilir */}
                    {isOwner && joinRequests.filter(jr => jr.initiatedBy === 'OWNER' && !jr.isPartnerInvite).length > 0 && (
                        <View style={det.section}>
                            <Text style={det.sectionTitle}>📨 Gönderilen Davetler</Text>
                            {joinRequests.filter(jr => jr.initiatedBy === 'OWNER' && !jr.isPartnerInvite).map(jr => (
                                <View key={jr.id} style={det.playerRow}>
                                    <Avatar name={jr.user?.username} avatar={jr.user?.avatar} size={moderateScale(32)} color={cfg.color} onPress={() => jr.user?.id && navigation.push('Profile', { userId: jr.user.id })} />
                                    <View style={{ flex:1 }}>
                                        <Text style={det.playerName}>{jr.user?.fullName || jr.user?.username}</Text>
                                        <Text style={{ color:'#fbbf24', fontSize: moderateScale(10), fontWeight:'700' }}>⏳ Onay Bekleniyor</Text>
                                    </View>
                                    <TouchableOpacity onPress={() => rejectLocal(jr.id)} style={{ backgroundColor:'#dc262620', borderRadius: moderateScale(8), width: moderateScale(28), height: moderateScale(28), justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:'#dc262650' }}>
                                        <Text style={{ color:'#f87171', fontSize: moderateScale(12), fontWeight:'700' }}>✕</Text>
                                    </TouchableOpacity>
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
                                    if (seedingDemoRivalRef.current) return;
                                    seedingDemoRivalRef.current = true;
                                    setSeedingDemoRival(true);
                                    try {
                                        const { data } = await api.post('/demo/rival-join', { rivalId: item.id });
                                        Alert.alert('', `Demo başvuru gönderildi: ${data.joined.join(', ')}`);
                                    } catch (e) {
                                        Alert.alert('', e?.response?.data?.message || t.actionFailed);
                                    } finally {
                                        seedingDemoRivalRef.current = false;
                                        setSeedingDemoRival(false);
                                    }
                                }}
                            >
                                <Text style={[s.joinBtnText, { color:'#a78bfa', fontSize: moderateScale(13) }]}>{seedingDemoRival ? '...' : '🤖 Demo Başvuru Gönder'}</Text>
                            </TouchableOpacity>
                        )}
                        {isOwner ? (
                            <View style={{ flexDirection: 'row', gap: 3 }}>
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
                            <View style={{ gap:3 }}>
                                {myInvite.isPartnerInvite && (
                                    <Text style={{ color:'#a78bfa', fontSize: moderateScale(11), fontWeight:'700', textAlign:'center' }}>🤝 Partner Daveti</Text>
                                )}
                                <View style={{ flexDirection:'row', gap:3 }}>
                                    <TouchableOpacity style={[s.joinBtn, { flex:1, backgroundColor:'#16a34a', borderRadius: moderateScale(10), paddingVertical: moderateScale(9) }]} onPress={() => handleRespondJoin(myInvite.id, 'accept')}>
                                        <Text style={[s.joinBtnText, { fontSize: moderateScale(13) }]}>{myInvite.isPartnerInvite ? 'Partner Ol' : t.inviteAcceptBtn}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity style={[s.cancelBtn, { flex:1, borderRadius: moderateScale(10), paddingVertical: moderateScale(8) }]} onPress={() => handleRespondJoin(myInvite.id, 'reject')}>
                                        <Text style={[s.cancelBtnText, { fontSize: moderateScale(12) }]}>{t.inviteRejectBtn}</Text>
                                    </TouchableOpacity>
                                </View>
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
                            <View key={c.id} style={{ marginBottom:14, paddingBottom:11, borderBottomWidth:1, borderBottomColor: colors.border }}>
                                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
                                    <View style={{ flex:1 }}>
                                        <Text style={{ color: cfg.color, fontSize:moderateScale(13), fontWeight:'700', marginBottom:3 }}>{c.user?.username}</Text>
                                        <Text style={{ color:'#fff', fontSize:moderateScale(14), lineHeight:moderateScale(21) }}>{c.content}</Text>
                                        <Text style={{ color: colors.textMuted, fontSize:moderateScale(11), marginTop:4 }}>
                                            {new Date(c.createdAt).toLocaleString(t.dateLocale, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                                        </Text>
                                    </View>
                                    {canDeleteComment(c) && (
                                        <TouchableOpacity onPress={() => deleteComment(c.id)} style={{ padding:5, marginLeft:8 }}>
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
                    <View style={{ flexDirection:'row', gap:3, paddingHorizontal:9, paddingVertical:7, paddingBottom: Platform.OS==='ios' ? 28 : 10, borderTopWidth:1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
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
                            style={[s.joinBtn, { paddingHorizontal:15, height:moderateScale(44), justifyContent:'center', alignSelf:'center', borderRadius: moderateScale(10) }, sendingComment && { opacity:0.6 }]}
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
                <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:17, paddingTop:17, paddingBottom:37, maxHeight:'80%' }}>
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
                            <View key={u.id} style={{ flexDirection:'row', alignItems:'center', gap:3, paddingVertical:7, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}>
                                <Avatar name={u.username} avatar={u.avatar} size={moderateScale(36)} color={cfg.color} />
                                <View style={{ flex:1 }}>
                                    <Text style={{ color:'#fff', fontWeight:'700', fontSize:moderateScale(13) }}>{u.interests?.[0]?.alias || u.fullName || u.username}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:moderateScale(11) }}>
                                        {u.username}{u.interests?.[0]?.skillRating != null ? `  ${Number(u.interests[0].skillRating).toFixed(2)} ★` : ''}
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
            <View style={{ flex:1, backgroundColor:'#00000080', justifyContent:'center', alignItems:'center', padding:21 }}>
                <View style={{ backgroundColor:'#1e293b', borderRadius:16, padding:17, borderWidth:1, borderColor: cfg.color+'40', width:'100%', maxHeight:'70%' }}>
                    <Text style={{ color:'#fff', fontSize:15, fontWeight:'800', marginBottom:12 }}>👥 Partner Davet Et</Text>
                    <ScrollView>
                        {joinInviteCandidates.length === 0 ? (
                            <Text style={{ color: colors.textMuted, fontSize:13, textAlign:'center', paddingVertical:13 }}>Davet edilebilecek bireysel başvuran yok</Text>
                        ) : joinInviteCandidates.map(c => (
                            <TouchableOpacity key={c.userId} onPress={() => setMyRivalJoinPartner(c.userId)} disabled={partnerActionLoading} style={{ flexDirection:'row', alignItems:'center', gap:3, paddingVertical:7, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}>
                                <Avatar name={c.user?.username} avatar={c.user?.avatar} size={moderateScale(34)} color={cfg.color} />
                                <View style={{ flex:1 }}>
                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{c.user?.fullName || c.user?.username}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>{c.user?.username}{c.user?.interests?.find(i => i.subCategory === sub)?.skillRating != null ? `  ${starEmoji(Number(c.user.interests.find(i => i.subCategory === sub).skillRating))} ${Number(c.user.interests.find(i => i.subCategory === sub).skillRating).toFixed(2)}` : ''}</Text>
                                </View>
                            </TouchableOpacity>
                        ))}
                    </ScrollView>
                    <TouchableOpacity onPress={() => setShowJoinInvitePicker(false)} style={{ marginTop:14, backgroundColor:'#334155', borderRadius:10, paddingVertical:8, alignItems:'center' }}>
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
    const filled = participants.filter(p => p?.id).length;
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
        const offLate = onSocket('joinLateAccepted', ({ rivalId }) => {
            if (rivalId !== item.id) return;
            setLocalJoinStatus('AWAITING_JOINER_CONFIRM');
            onRefresh();
        });
        return () => { offRejected(); offAccepted(); offLate(); };
    }, [item.id]);

    const handleConfirmLateJoin = async (action) => {
        try {
            const myReqId = item._myJoinRequestId;
            if (!myReqId) { onRefresh(); return; }
            await api.patch(`/rivals/join/${myReqId}/confirm`, { action });
            if (action === 'confirm') { setLocalJoinStatus('ACCEPTED'); setTimeout(onRefresh, 1200); }
            else { setLocalJoinStatus(null); onRefresh(); }
        } catch (e) {
            if (e?.response) Alert.alert(t.error, e.response.data?.message || t.actionFailed);
            else onRefresh();
        }
    };

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
            onRefresh(); // her durumda yenile — iyimser güncellemeyi geri al
        }
    };

    const rival = { id:item.id, subCategory:item.subCategory, matchType:item.matchType, level:item.level, matchDate:item.matchDate, matchTime:item.matchTime, location:item.location, courtName:item.courtName, flexibleSchedule:item.flexibleSchedule };

    return (
        <>
        <View style={[s.card, { width:'48%', borderRadius: moderateScale(14), paddingHorizontal:0, paddingTop:0, paddingBottom:0 }, item.flexibleSchedule && { borderColor:'#eab30840' }]}>

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
                    <View style={[s.modeBadge, { backgroundColor: cfg.color+'20', borderColor: cfg.color+'40', borderRadius: moderateScale(8), paddingHorizontal:0, paddingVertical:0 }]}>
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
                    <View style={[s.flexBanner, { borderRadius: moderateScale(10), padding:0, marginBottom:3 }]}>
                        <Text style={[s.flexTitle, { fontSize: moderateScale(11), marginBottom:3 }]}>{t.flexibleBanner}</Text>
                        <Text style={[s.flexDesc, { fontSize: moderateScale(10) }]}>{t.flexibleBannerDesc}</Text>
                    </View>
                )}
                {(item.level || item.levelDetail) && (
                    <View style={[s.levelRow, { gap:3, marginBottom:3 }]}>
                        {item.level && <Text style={[s.levelBadge, { borderRadius: moderateScale(8), paddingHorizontal:0, paddingVertical:0, fontSize: moderateScale(10) }]} numberOfLines={1}>{LEVEL_EMOJI[item.level]} {t.levelTr[item.level] || item.level}</Text>}
                        {item.levelDetail && <Text style={[s.levelDetail, { borderRadius: moderateScale(8), paddingHorizontal:0, paddingVertical:0, fontSize: moderateScale(10) }]} numberOfLines={1}>{item.levelDetail}</Text>}
                    </View>
                )}
                {item.message && <Text style={[s.cardMsg, { fontSize: moderateScale(12), marginBottom:3 }]} numberOfLines={2}>{item.message}</Text>}
                {/* Kabul edilen oyuncular */}
                {participants.filter(p => p?.id).length > 0 && (
                    <View style={[s.participantsRow, { gap:3, marginBottom:3 }]}>
                        {participants.filter(p => p?.id).map((p, i) => (
                            <View key={p.id || i} style={[s.participantChip, { borderRadius: moderateScale(8), paddingHorizontal:0, paddingVertical:0 }]}>
                                <Text style={[s.participantChipText, { fontSize: moderateScale(10) }]} numberOfLines={1}>✓ {senderAlias(p)}</Text>
                            </View>
                        ))}
                    </View>
                )}
                {/* Bekleyen istek badge */}
                {isOwner && (item.joinRequests||[]).filter(jr => jr.initiatedBy !== 'OWNER').length > 0 && (
                    <View style={[s.pendingBadge, { borderRadius: moderateScale(8), paddingHorizontal:0, paddingVertical:0, marginBottom:3 }]}>
                        <Text style={[s.pendingBadgeText, { fontSize: moderateScale(11) }]} numberOfLines={1}>📬 {item.joinRequests.filter(jr => jr.initiatedBy !== 'OWNER').length} {t.requests || 'istek'}</Text>
                    </View>
                )}
            </TouchableOpacity>

            {/* Aksiyon alanı */}
            <View>
                {isOwner ? (
                    <View style={{ flexDirection: 'row', gap: 3 }}>
                        <TouchableOpacity
                            style={[s.cancelBtn, { flex: 1, paddingHorizontal:0, paddingVertical: moderateScale(5), borderRadius: moderateScale(10), backgroundColor: colors.purple + '20', borderColor: colors.purple + '40' }]}
                            onPress={() => setEditVisible(true)}
                        >
                            <Text style={[s.cancelBtnText, { color: colors.purple, fontSize: moderateScale(11) }]}>✏️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={[s.cancelBtn, { flex: 1, paddingHorizontal:0, paddingVertical: moderateScale(5), borderRadius: moderateScale(10) }]} onPress={handleCancel}>
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
                ) : mySentReq === 'AWAITING_JOINER_CONFIRM' ? (
                    <View style={{ gap:3 }}>
                        <Text style={{ color:'#f59e0b', fontSize:moderateScale(9), textAlign:'center', marginBottom:2 }}>{t.awaitingYourConfirm}</Text>
                        <View style={{ flexDirection:'row', gap:3 }}>
                            <TouchableOpacity style={{ flex:1, backgroundColor:'#16a34a', borderRadius:moderateScale(8), paddingVertical:moderateScale(5), alignItems:'center' }} onPress={() => handleConfirmLateJoin('confirm')}>
                                <Text style={{ color:'#fff', fontSize:moderateScale(11), fontWeight:'700' }}>{t.confirmJoinBtn}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={{ flex:1, backgroundColor:'#ef444420', borderRadius:moderateScale(8), paddingVertical:moderateScale(5), alignItems:'center', borderWidth:1, borderColor:'#ef444440' }} onPress={() => handleConfirmLateJoin('cancel')}>
                                <Text style={{ color:'#f87171', fontSize:moderateScale(11), fontWeight:'700' }}>{t.cancelJoinBtn}</Text>
                            </TouchableOpacity>
                        </View>
                    </View>
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
            onRefresh={onRefresh}
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
    overlay:    { flex:1, backgroundColor:'#000000cc', justifyContent:'center', alignItems:'center', padding:17 },
    box:        { backgroundColor: colors.surface, borderRadius:20, padding:13, width:'100%' },
    header:     { flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:12 },
    nav:        { padding:7 },
    navTxt:     { color:'#fff', fontSize:24, fontWeight:'700', lineHeight:26 },
    title:      { color:'#fff', fontSize:16, fontWeight:'900' },
    row:        { flexDirection:'row', marginBottom:2 },
    dayLbl:     { flex:1, textAlign:'center', color: colors.textMuted, fontSize:11, fontWeight:'700', paddingVertical:5 },
    cell:       { flex:1, aspectRatio:1, justifyContent:'center', alignItems:'center', borderRadius:8 },
    cellSel:    { backgroundColor: colors.purple },
    cellDis:    { opacity:0.2 },
    cellTxt:    { color:'#fff', fontSize:13, fontWeight:'600' },
    cellTxtSel: { fontWeight:'900' },
    cellTxtDis: { color: colors.textMuted },
    closeBtn:   { marginTop:12, backgroundColor: colors.surface2, borderRadius:10, paddingVertical:7, alignItems:'center', borderWidth:1, borderColor: colors.border },
    closeTxt:   { color: colors.textSecondary, fontWeight:'700' },
});

// ─── Edit Rival Modal ─────────────────────────────────────────────────────────

function EditRivalModal({ visible, item, onClose, onSave }) {
    const t = useT();
    const [form, setForm] = useState({});
    const [saving, setSaving] = useState(false);
    const [calVisible, setCalVisible] = useState(false);
    const isTennisPadel = item?.subCategory === 'tennis' || item?.subCategory === 'padel';
    const isDouble = item?.matchType === 'DOUBLE';

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
                genderReq: item.genderReq || 'MIX',
                partnerGenderReq: item.partnerGenderReq || 'MIX',
                opp1GenderReq: item.opp1GenderReq || 'MIX',
                opp2GenderReq: item.opp2GenderReq || 'MIX',
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
                ...(isTennisPadel && { genderReq: form.genderReq }),
                ...(isTennisPadel && isDouble && { partnerGenderReq: form.partnerGenderReq, opp1GenderReq: form.opp1GenderReq, opp2GenderReq: form.opp2GenderReq }),
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
                <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 13, paddingTop: Platform.OS === 'ios' ? 56 : 24, paddingBottom: 11, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                    <TouchableOpacity onPress={onClose} style={{ marginRight: 14, padding: 1 }}>
                        <Text style={{ color: '#fff', fontSize: 22, fontWeight: '300' }}>←</Text>
                    </TouchableOpacity>
                    <Text style={{ color: '#fff', fontSize: 16, fontWeight: '800', flex: 1 }}>✏️ İlanı Düzenle</Text>
                    <TouchableOpacity
                        style={[s.joinBtn, { paddingHorizontal: 13, paddingVertical: 5, opacity: saving ? 0.6 : 1 }]}
                        onPress={handleSave}
                        disabled={saving}
                    >
                        <Text style={s.joinBtnText}>{saving ? '...' : 'Kaydet'}</Text>
                    </TouchableOpacity>
                </View>

                <ScrollView style={{ flex: 1 }} contentContainerStyle={{ padding: 13 }} keyboardShouldPersistTaps="handled">
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
                                style={{ paddingHorizontal: 7, paddingVertical: 4, borderRadius: 8, marginRight: 6, backgroundColor: form.matchTime === o.value ? colors.purple : colors.surface2, borderWidth: 1, borderColor: form.matchTime === o.value ? colors.purple : colors.border }}
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
                        inputStyle={{ borderRadius: 12, paddingHorizontal: 11, paddingVertical: 9, fontSize: 14 }}
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
                        style={[s.fieldInput, { height: 80, textAlignVertical: 'top', paddingTop: 7 }]}
                        value={form.message}
                        onChangeText={v => setForm(f => ({ ...f, message: v }))}
                        placeholder="Mesajınızı girin..."
                        placeholderTextColor={colors.textMuted}
                        multiline
                    />

                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 0 }}>
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
                    <View style={{ flexDirection: 'row', gap: 3, marginBottom: 16 }}>
                        {['FREE', 'PAID'].map(mode => (
                            <TouchableOpacity
                                key={mode}
                                style={{ flex: 1, paddingVertical: 7, borderRadius: 10, alignItems: 'center', backgroundColor: form.matchMode === mode ? colors.purple : colors.surface2, borderWidth: 1, borderColor: form.matchMode === mode ? colors.purple : colors.border }}
                                onPress={() => setForm(f => ({ ...f, matchMode: mode }))}
                            >
                                <Text style={{ color: form.matchMode === mode ? '#fff' : colors.textMuted, fontWeight: '700' }}>
                                    {mode === 'FREE' ? '🆓 Ücretsiz' : '💰 Ücretli'}
                                </Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {isTennisPadel && (() => {
                        const GENDERS = [{ id:'MIX', label:'⚥ Mix' }, { id:'MALE', label:'♂ Erkek' }, { id:'FEMALE', label:'♀ Kadın' }];
                        const GenderRow = ({ label, field }) => (
                            <View style={{ marginBottom: 12 }}>
                                <Text style={s.fieldLabel}>{label}</Text>
                                <View style={{ flexDirection:'row', gap:3 }}>
                                    {GENDERS.map(g => (
                                        <TouchableOpacity
                                            key={g.id}
                                            style={{ flex:1, paddingVertical:5, borderRadius:8, alignItems:'center', backgroundColor: form[field] === g.id ? colors.purple : colors.surface2, borderWidth:1, borderColor: form[field] === g.id ? colors.purple : colors.border }}
                                            onPress={() => setForm(f => ({ ...f, [field]: g.id }))}
                                        >
                                            <Text style={{ color: form[field] === g.id ? '#fff' : colors.textMuted, fontSize:12, fontWeight:'700' }}>{g.label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        );
                        return (
                            <View style={{ marginBottom: 24 }}>
                                {isDouble ? (
                                    <>
                                        <GenderRow label="Takım Arkadaşı Cinsiyeti" field="partnerGenderReq" />
                                        <GenderRow label="Rakip 1 Cinsiyeti" field="opp1GenderReq" />
                                        <GenderRow label="Rakip 2 Cinsiyeti" field="opp2GenderReq" />
                                    </>
                                ) : (
                                    <GenderRow label="Rakip Cinsiyeti" field="genderReq" />
                                )}
                            </View>
                        );
                    })()}
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
                    <Text style={s.cardSub}>{post.user?.username} · {timeAgo(post.createdAt)}</Text>
                </View>
            </View>
            <Text style={[s.cardMsg, { marginBottom: 12, lineHeight: 20 }]}>{post.content}</Text>
            <View style={{ flexDirection: 'row', gap: 3, marginBottom: showComments ? 10 : 0 }}>
                <TouchableOpacity onPress={toggleLike} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={{ color: liked ? '#f43f5e' : colors.textMuted, fontSize: 16 }}>♥</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>{likesCount}</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={openComments} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                    <Text style={{ color: showComments ? cfg.color : colors.textMuted, fontSize: 14 }}>💬</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>{comments.length || post._count?.comments || 0}</Text>
                </TouchableOpacity>
            </View>
            {showComments && (
                <View style={{ borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 5 }}>
                    {comments.map((c, i) => (
                        <View key={c.id || i} style={{ flexDirection: 'row', gap: 3, marginBottom: 5 }}>
                            <Text style={{ color: cfg.color, fontSize: 12, fontWeight: '800' }}>{c.user?.username}</Text>
                            <Text style={{ color: colors.textSecondary, fontSize: 12, flex: 1 }}>{c.content}</Text>
                        </View>
                    ))}
                    <View style={{ flexDirection: 'row', gap: 3, marginTop: 6 }}>
                        <TextInput
                            style={{ flex: 1, backgroundColor: colors.surface, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, color: '#fff', fontSize: 12, borderWidth: 1, borderColor: colors.border }}
                            placeholder="Yorum yaz..."
                            placeholderTextColor={colors.textMuted}
                            value={commentText}
                            onChangeText={setCommentText}
                        />
                        <TouchableOpacity onPress={sendComment} disabled={sendingComment || !commentText.trim()}
                            style={{ backgroundColor: cfg.color, borderRadius: 8, paddingHorizontal: 11, justifyContent: 'center', opacity: !commentText.trim() ? 0.4 : 1 }}>
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
    box:          { backgroundColor: colors.surface2, borderRadius:12, padding:9, marginTop:8, borderWidth:1, borderColor: colors.border },
    headerRow:    { flexDirection:'row', alignItems:'center', marginBottom:6 },
    colMe:        { flex:1, color:'#fff', fontSize:12, fontWeight:'800', textAlign:'center' },
    colLabel:     { width:64, color: colors.textMuted, fontSize:11, fontWeight:'700', textAlign:'center' },
    colOpp:       { flex:1, color:'#fff', fontSize:12, fontWeight:'800', textAlign:'center' },
    setRow:       { flexDirection:'row', alignItems:'center', paddingVertical:2 },
    setScore:     { flex:1, fontSize:22, fontWeight:'900', textAlign:'center' },
    setInputRow:  { flexDirection:'row', alignItems:'center', gap:3, marginBottom:8 },
    setInput:     { flex:1, backgroundColor:'#ffffff0d', borderRadius:8, borderWidth:1, borderColor: colors.border, color:'#fff', fontSize:22, fontWeight:'900', textAlign:'center', paddingVertical:7 },
    divider:      { height:1, backgroundColor: colors.border, marginVertical:6 },
    totalRow:     { flexDirection:'row', alignItems:'center', paddingVertical:1 },
    totalScore:   { flex:1, fontSize:18, fontWeight:'900', color:'#fff', textAlign:'center' },
    totalLabel:   { width:64, color: colors.textMuted, fontSize:11, fontWeight:'800', textAlign:'center' },
    winnerRow:    { alignItems:'center', paddingTop:3 },
    winnerText:   { fontSize:13, fontWeight:'800' },
    addBtn:       { flexDirection:'row', justifyContent:'center', alignItems:'center', paddingVertical:5, borderRadius:8, borderWidth:1, borderColor: colors.border, borderStyle:'dashed', marginBottom:4 },
    addBtnTxt:    { color: colors.purple, fontSize:13, fontWeight:'700' },
    removeBtn:    { padding:3, marginLeft:2 },
    removeTxt:    { color: colors.textMuted, fontSize:13 },
    radioRow:     { flexDirection:'row', alignItems:'center', gap:3, padding:9, borderRadius:12, borderWidth:1, borderColor: colors.border, marginBottom:8 },
    radioActive:  { borderColor: colors.purple },
    radio:        { width:18, height:18, borderRadius:9, borderWidth:2, borderColor: colors.border },
    radioChecked: { borderColor: colors.purple, backgroundColor: colors.purple },
    radioLabel:   { color:'#fff', fontSize:14, fontWeight:'700', flex:1 },
    warningText:  { color:'#facc15', fontSize:12, fontWeight:'600', backgroundColor:'#facc1510', borderRadius:10, padding:7, marginBottom:8, borderWidth:1, borderColor:'#facc1540' },
    lockedTxt:    { color: colors.textMuted, fontSize:11, textAlign:'center', marginTop:6 },
    drawBtn:      { flexDirection:'row', justifyContent:'center', alignItems:'center', paddingVertical:5, borderRadius:8, borderWidth:1, borderColor:'#facc1540', backgroundColor:'#facc1510', marginBottom:4 },
    drawBtnTxt:   { color:'#facc15', fontSize:13, fontWeight:'700' },
});

function UpcomingCard({ match, myId, onRefresh, isMatched, onOpenComments, onUserPress }) {
    const t = useT();
    const [showScore, setShowScore] = useState(false);
    const [swapSlot, setSwapSlot] = useState(null); // 'partner'|'opp1'|'opp2'
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
    const [showDetail, setShowDetail] = useState(false);
    const [localComments, setLocalComments] = useState([]);
    const [loadingLocalComments, setLoadingLocalComments] = useState(false);
    const [localCommentsLoaded, setLocalCommentsLoaded] = useState(false);
    const [localCommentText, setLocalCommentText] = useState('');
    const [sendingLocalComment, setSendingLocalComment] = useState(false);
    const [orderVenueId, setOrderVenueId] = useState(null);
    const isOwner = match.senderId === myId;
    const cfg = getConfig(match.subCategory);
    const opponent = isOwner ? match.participants?.[0] : match.sender;

    const participantsArr = (Array.isArray(match.participants) ? match.participants : []).filter(p => p?.id);
    const senderTeamArr   = (Array.isArray(match.senderTeam)   ? match.senderTeam   : []).filter(p => p?.id);

    // Build player list: sender → partner (DOUBLE) → opponents
    const allPlayers = [
        { ...match.sender, skillRating: match.senderSkillRating, alias: match.senderAlias },
        ...(match.matchType === 'DOUBLE'
            ? senderTeamArr.length > 0
                ? senderTeamArr
                : [{ id: '__empty_partner__', _emptySlot: true }]
            : []),
        ...participantsArr,
    ];

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

    // DOUBLE slot swap — herhangi bir katılımcı yapabilir
    const handleSwapTap = async (slot) => {
        if (!swapSlot) { setSwapSlot(slot); return; }
        if (swapSlot === slot) { setSwapSlot(null); return; }
        const s1 = swapSlot, s2 = slot;
        setSwapSlot(null);
        try {
            await api.patch(`/rivals/${match.id}/swap-positions`, { slot1: s1, slot2: s2 });
            onRefresh();
        } catch(e) { Alert.alert('', e?.response?.data?.message || 'Yer değiştirme başarısız'); }
    };

    const removePlayer = (userId, name) => {
        Alert.alert('Katılımcıyı Çıkar', `${name} ilanınızdan çıkarılsın mı? İlan tekrar açık hale gelir.`, [
            { text: 'Vazgeç', style:'cancel' },
            { text: 'Çıkar', style:'destructive', onPress: async () => {
                try { await api.delete(`/rivals/${match.id}/participants/${userId}`); onRefresh(); }
                catch(e) { Alert.alert('', e?.response?.data?.message || 'Hata'); }
            }},
        ]);
    };

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

    const openDetail = useCallback(async () => {
        setShowDetail(true);
        if (localCommentsLoaded) return;
        setLoadingLocalComments(true);
        try {
            const res = await api.get(`/rivals/${match.id}/comments`);
            setLocalComments(res.data || []);
            setLocalCommentsLoaded(true);
        } catch(e) { console.warn(e?.message); }
        finally { setLoadingLocalComments(false); }
    }, [match.id, localCommentsLoaded]);

    const sendLocalComment = async () => {
        if (!localCommentText.trim()) return;
        setSendingLocalComment(true);
        try {
            const res = await api.post(`/rivals/${match.id}/comments`, { content: localCommentText.trim() });
            setLocalComments(prev => [...prev, res.data]);
            setLocalCommentText('');
            onRefresh?.();
        } catch(e) { Alert.alert('', e?.response?.data?.message || 'Yorum gönderilemedi'); }
        finally { setSendingLocalComment(false); }
    };

    return (
        <>
        {/* Compact card — tap opens detail */}
        <TouchableOpacity
            style={[s.card, { flex:1, paddingHorizontal:3, paddingTop:3, paddingBottom:3,
                borderColor: isMatched ? '#16a34a60' : '#a855f740',
                backgroundColor: isMatched ? '#16a34a08' : undefined }]}
            activeOpacity={0.75}
            onPress={openDetail}
        >
            {/* Players + ratings */}
            {allPlayers.map((p, idx) => (
                <View key={p.id || idx} style={{ flexDirection:'row', alignItems:'center', gap:3, flexWrap:'wrap', marginBottom: idx < allPlayers.length - 1 ? 2 : 0 }}>
                    {p._emptySlot ? (
                        <Text style={{ color: colors.textMuted, fontSize:13, fontStyle:'italic' }}>— ortak slot boş —</Text>
                    ) : (
                        <>
                            <Text style={s.cardName}>{senderAlias(p)}</Text>
                            {p.skillRating != null && (
                                <Text style={{ color:'#facc15', fontSize:11, fontWeight:'800' }}>{Number(p.skillRating).toFixed(2)} ★</Text>
                            )}
                        </>
                    )}
                </View>
            ))}
            {/* Format / mode badges */}
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
            {/* Date / time */}
            <Text style={[s.cardSub, { marginTop:3 }]}>
                {match.flexibleSchedule ? t.unknownDate : match.matchDate ? new Date(match.matchDate).toLocaleDateString(t.dateLocale, { day:'numeric', month:'short', weekday:'short' }) : t.unknownDate}
                {!match.flexibleSchedule && match.matchTime ? ` · ${match.matchTime}` : ''}
                {match.duration ? ` · ${match.duration} ${t.timeMinSuffix}` : ''}
            </Text>
            {/* Court */}
            {match.courtName && (
                <Text style={[s.cardSub, { color:'#60a5fa', marginTop:2 }]}>🏟️ {match.courtName}</Text>
            )}
            {match.venueId && (
                <TouchableOpacity onPress={() => setOrderVenueId(match.venueId)} style={{ marginTop:4 }}>
                    <Text style={{ color:'#22c55e', fontSize:12, fontWeight:'600' }}>📋 Sipariş Ver</Text>
                </TouchableOpacity>
            )}
            {/* Comment count */}
            <Text style={{ color: colors.textMuted, fontSize:11, marginTop:3 }}>
                💬 {t.matchCommentsBtn} {match.commentCount ?? 0}
            </Text>
        </TouchableOpacity>

        {/* Full-screen Detail Modal */}
        <Modal visible={showDetail} animationType="slide" onRequestClose={() => setShowDetail(false)}>
            <View style={{ flex:1, backgroundColor: colors.bg }}>
                {/* Header */}
                <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:9,
                    paddingTop: Platform.OS==='ios' ? 56 : 24, paddingBottom:11,
                    borderBottomWidth:1, borderBottomColor: colors.border }}>
                    <TouchableOpacity onPress={() => setShowDetail(false)} style={{ marginRight:14, padding:1 }}>
                        <Text style={{ color:'#fff', fontSize:22, fontWeight:'300' }}>←</Text>
                    </TouchableOpacity>
                    <View style={{ flex:1 }}>
                        <Text style={{ color:'#fff', fontSize:16, fontWeight:'800' }}>{match.subCategory}</Text>
                        <Text style={{ color: colors.textMuted, fontSize:12 }}>
                            {allPlayers.filter(p => !p._emptySlot).map(p => senderAlias(p)).join(' · ')}
                        </Text>
                    </View>
                </View>

                <ScrollView style={{ flex:1 }} contentContainerStyle={{ padding:9, paddingBottom:21 }}
                    keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>

                    {/* Match info box */}
                    <View style={{ backgroundColor: colors.surface2, borderRadius:14, padding:11, marginBottom:12, borderWidth:1, borderColor: colors.border }}>
                        <Text style={{ color: colors.textMuted, fontSize:13 }}>
                            {match.flexibleSchedule ? t.unknownDate : match.matchDate ? new Date(match.matchDate).toLocaleDateString(t.dateLocale, { day:'numeric', month:'long', weekday:'long' }) : t.unknownDate}
                            {!match.flexibleSchedule && match.matchTime ? ` · ${match.matchTime}` : ''}
                            {match.duration ? ` · ${match.duration} ${t.timeMinSuffix}` : ''}
                        </Text>
                        {match.location && <Text style={{ color:'#60a5fa', fontSize:13, marginTop:4 }}>📍 {match.location}</Text>}
                        {match.courtName && (
                            <TouchableOpacity onPress={() => openCourtMap(match.courtName, match.courtLat, match.courtLng, match.courtAddress)}>
                                <Text style={{ color:'#60a5fa', fontSize:13, marginTop:4, textDecorationLine:'underline' }}>🏟️ {match.courtName}</Text>
                            </TouchableOpacity>
                        )}
                        {match.venueId && (
                            <TouchableOpacity onPress={() => setOrderVenueId(match.venueId)} style={{ marginTop:6 }}>
                                <Text style={{ color:'#22c55e', fontSize:13, fontWeight:'600' }}>📋 Sipariş Ver</Text>
                            </TouchableOpacity>
                        )}
                        {match.level && (
                            <Text style={{ color: colors.textMuted, fontSize:13, marginTop:4 }}>
                                {LEVEL_EMOJI[match.level]} {t.levelTr?.[match.level] || match.level}
                            </Text>
                        )}
                    </View>

                    {/* DOUBLE team management */}
                    {match.matchType === 'DOUBLE' && (() => {
                        const partner = senderTeamArr[0] || null;
                        const opp1 = participantsArr[0] || null;
                        const opp2 = participantsArr[1] || null;
                        const mkSlot = (slot, p, color) => {
                            const isSel = swapSlot === slot;
                            const isTgt = !!swapSlot && swapSlot !== slot;
                            if (!p) {
                                // Boş slot: swap modu aktifse tıklanabilir hedef göster
                                if (isTgt) return (
                                    <TouchableOpacity
                                        key={slot}
                                        onPress={() => handleSwapTap(slot)}
                                        activeOpacity={0.7}
                                        style={{ borderRadius:8, paddingHorizontal:5, paddingVertical:5, marginBottom:4, backgroundColor:'#4ade8012', borderWidth:1.5, borderColor:'#4ade80', alignItems:'center' }}>
                                        <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>
                                            {slot === 'partner' ? '↔ Partner olarak taşı' : '↔ Rakip olarak taşı'}
                                        </Text>
                                    </TouchableOpacity>
                                );
                                return (
                                    <View key={slot} style={{ borderRadius:8, paddingHorizontal:5, paddingVertical:3, marginBottom:4, backgroundColor:'#1e293b', borderWidth:1, borderColor:'#ffffff10' }}>
                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                            {slot === 'partner' ? '— Partner bekleniyor —' : slot === 'opp1' ? '— Rakip 1 bekleniyor —' : '— Rakip 2 bekleniyor —'}
                                        </Text>
                                    </View>
                                );
                            }
                            return (
                                <View key={slot} style={{ marginBottom:4 }}>
                                    <TouchableOpacity
                                        onPress={() => {
                                            if (!swapSlot) { setSwapSlot(slot); return; }
                                            if (swapSlot === slot) { setSwapSlot(null); return; }
                                            handleSwapTap(slot);
                                        }}
                                        activeOpacity={0.7}
                                        style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between',
                                            borderRadius:8, paddingHorizontal:5, paddingVertical:3,
                                            borderWidth:1,
                                            borderColor: isSel ? '#f59e0b' : isTgt ? '#4ade80' : '#ffffff15',
                                            backgroundColor: isSel ? '#f59e0b18' : isTgt ? '#4ade8015' : '#1e293b' }}
                                    >
                                        <Text style={{ color, fontSize:12, fontWeight:'700', flex:1 }} numberOfLines={1}>
                                            {senderAlias(p)}
                                        </Text>
                                        <Text style={{ color: isSel ? '#f59e0b' : isTgt ? '#4ade80' : colors.textMuted, fontSize:10 }}>
                                            {isSel ? '✓ seçildi' : isTgt ? '↔ taşı' : '↕'}
                                        </Text>
                                    </TouchableOpacity>
                                    {!swapSlot && isOwner && (
                                        <TouchableOpacity
                                            onPress={() => removePlayer(p.id, senderAlias(p))}
                                            style={{ marginTop:2, paddingVertical:0, alignItems:'center', backgroundColor:'#dc262612', borderRadius:6, borderWidth:1, borderColor:'#dc262630' }}>
                                            <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>Çıkar</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            );
                        };
                        return (
                            <View style={{ marginBottom:12 }}>
                                {swapSlot && (
                                    <View style={{ backgroundColor:'#f59e0b10', borderRadius:5, padding:1, marginBottom:4, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}>
                                        <Text style={{ color:'#f59e0b', fontSize:9, fontWeight:'700' }}>Hedef slota dokun</Text>
                                        <TouchableOpacity onPress={() => setSwapSlot(null)}><Text style={{ color: colors.textMuted, fontSize:9 }}>İptal</Text></TouchableOpacity>
                                    </View>
                                )}
                                <View style={{ flexDirection:'row', gap:3 }}>
                                    <View style={{ flex:1, backgroundColor:'#0f172a', borderRadius:6, padding:2, borderWidth:1, borderColor:'#a855f720' }}>
                                        <Text style={{ color:'#a855f7', fontSize:8, fontWeight:'800', marginBottom:3 }}>👑 Kurucu</Text>
                                        <View style={{ borderRadius:5, paddingHorizontal:2, paddingVertical:0, marginBottom:2, backgroundColor:'#1e293b' }}>
                                            <Text style={{ color:'#94a3b8', fontSize:10 }} numberOfLines={1}>{senderAlias(match.sender)} 🔒</Text>
                                        </View>
                                        {mkSlot('partner', partner, '#c084fc')}
                                    </View>
                                    <View style={{ flex:1, backgroundColor:'#0f172a', borderRadius:6, padding:2, borderWidth:1, borderColor:'#f8717120' }}>
                                        <Text style={{ color:'#f87171', fontSize:8, fontWeight:'800', marginBottom:3 }}>⚔️ Rakip</Text>
                                        {mkSlot('opp1', opp1, '#fca5a5')}
                                        {mkSlot('opp2', opp2, '#fca5a5')}
                                    </View>
                                </View>
                                {(senderTeamArr.length > 0 || participantsArr.length > 0) && !swapSlot && (
                                    <Text style={{ color: colors.textMuted, fontSize:10, marginTop:4, textAlign:'center' }}>↕ Oyuncuya dokun → seç → diğerine dokun → yer değiştir</Text>
                                )}
                            </View>
                        );
                    })()}

                    {/* Non-DOUBLE: owner remove */}
                    {isOwner && match.matchType !== 'DOUBLE' && participantsArr.length > 0 && (
                        <View style={{ marginBottom:12, gap:3 }}>
                            {participantsArr.map(p => (
                                <View key={p.id} style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:'#1e293b', borderRadius:8, paddingHorizontal:7, paddingVertical:3 }}>
                                    <Text style={{ color:'#94a3b8', fontSize:13 }} numberOfLines={1}>{senderAlias(p)}</Text>
                                    <TouchableOpacity onPress={() => removePlayer(p.id, senderAlias(p))}>
                                        <Text style={{ color:'#f87171', fontSize:12, fontWeight:'700' }}>Çıkar</Text>
                                    </TouchableOpacity>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Flexible schedule panel */}
                    {match.flexibleSchedule && !match.matchDate && (
                        <View style={{ backgroundColor:'#f59e0b10', borderRadius:10, padding:7, marginBottom:12, borderWidth:1, borderColor:'#f59e0b40' }}>
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
                                        <View style={{ flexDirection:'row', gap:3, marginTop:8 }}>
                                            <TouchableOpacity
                                                style={{ flex:1, backgroundColor:'#16a34a20', borderRadius:8, paddingVertical:4, borderWidth:1, borderColor:'#16a34a50', alignItems:'center' }}
                                                onPress={acceptProposal} disabled={propAccepting}>
                                                <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'800' }}>{propAccepting ? '...' : '✅ Kabul Et'}</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={{ flex:1, backgroundColor:'#f59e0b15', borderRadius:8, paddingVertical:4, borderWidth:1, borderColor:'#f59e0b40', alignItems:'center' }}
                                                onPress={() => setShowScheduleForm(v => !v)}>
                                                <Text style={{ color:'#f59e0b', fontSize:12, fontWeight:'700' }}>📅 Farklı Öner</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )
                            ) : (
                                <TouchableOpacity
                                    style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingVertical:5, borderWidth:1, borderColor:'#f59e0b50', alignItems:'center' }}
                                    onPress={() => setShowScheduleForm(v => !v)}>
                                    <Text style={{ color:'#f59e0b', fontSize:12, fontWeight:'700' }}>📅 Tarih/Saat/Yer Öner</Text>
                                </TouchableOpacity>
                            )}
                            {showScheduleForm && (
                                <View style={{ marginTop:10, gap:3 }}>
                                    <TouchableOpacity
                                        style={{ backgroundColor: colors.surface2, borderRadius:8, padding:7, borderWidth:1, borderColor: propDate ? '#f59e0b60' : colors.border }}
                                        onPress={() => setShowPropDatePicker(true)}>
                                        <Text style={{ color: propDate ? '#fff' : colors.textMuted, fontSize:13 }}>
                                            {propDate ? `📅 ${String(propDate.getDate()).padStart(2,'0')}/${String(propDate.getMonth()+1).padStart(2,'0')}/${propDate.getFullYear()}` : '📅 Tarih Seç'}
                                        </Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        style={{ backgroundColor: colors.surface2, borderRadius:8, padding:7, borderWidth:1, borderColor: propTime ? '#f59e0b60' : colors.border }}
                                        onPress={() => setShowPropTimePicker(true)}>
                                        <Text style={{ color: propTime ? '#fff' : colors.textMuted, fontSize:13 }}>
                                            {propTime ? `🕐 ${propTime}` : '🕐 Saat Seç'}
                                        </Text>
                                    </TouchableOpacity>
                                    {/* Court search */}
                                    {propSelectedCourt ? (
                                        <View style={{ flexDirection:'row', alignItems:'center', backgroundColor:'#16a34a15', borderRadius:8, padding:7, borderWidth:1, borderColor:'#16a34a50', gap:3 }}>
                                            <Text style={{ color:'#4ade80', fontSize:13, flex:1 }} numberOfLines={1}>🏟️ {propSelectedCourt.name}{propSelectedCourt.city ? `  · ${propSelectedCourt.city}` : ''}</Text>
                                            <TouchableOpacity onPress={clearPropCourt}><Text style={{ color: colors.textMuted, fontSize:14 }}>✕</Text></TouchableOpacity>
                                        </View>
                                    ) : (
                                        <TextInput
                                            style={{ backgroundColor: colors.surface2, borderRadius:8, padding:7, borderWidth:1, borderColor: propCourtText ? '#f59e0b60' : colors.border, color:'#fff', fontSize:13 }}
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
                                                    style={{ padding:7, borderBottomWidth: i < propCourtResults.length - 1 ? 1 : 0, borderBottomColor: colors.border + '40' }}
                                                    onPress={() => selectPropCourt(court)}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'600' }}>{court.name}</Text>
                                                    {court.city && <Text style={{ color: colors.textMuted, fontSize:11, marginTop:1 }}>{court.city}</Text>}
                                                </TouchableOpacity>
                                            ))}
                                            <TouchableOpacity
                                                style={{ padding:7, borderTopWidth:1, borderTopColor: colors.border + '40' }}
                                                onPress={() => { setPropCourtResults([]); setPropShowManual(true); }}>
                                                <Text style={{ color:'#f59e0b', fontSize:12 }}>+ "{propCourtText}" olarak ekle → admin onayına gider</Text>
                                            </TouchableOpacity>
                                        </View>
                                    )}
                                    {!propSelectedCourt && !propCourtSearching && propCourtText.length >= 2 && propCourtResults.length === 0 && !propShowManual && (
                                        <TouchableOpacity style={{ marginTop:4, paddingVertical:3, paddingHorizontal:0 }} onPress={() => setPropShowManual(true)}>
                                            <Text style={{ color:'#f59e0b', fontSize:12 }}>+ Kort bulunamadı — manuel ekle (onay bekler)</Text>
                                        </TouchableOpacity>
                                    )}
                                    {propShowManual && (
                                        <View style={{ backgroundColor:'#1e293b', borderRadius:8, padding:7, marginTop:4, borderWidth:1, borderColor:'#f59e0b40', gap:3 }}>
                                            <Text style={{ color:'#f59e0b', fontSize:11, fontWeight:'700' }}>⚠️ Admin onayına gönderilecek</Text>
                                            <TextInput
                                                style={{ backgroundColor: colors.surface2, borderRadius:6, padding:5, borderWidth:1, borderColor: colors.border, color:'#fff', fontSize:13 }}
                                                placeholder="Kort / Tesis Adı"
                                                placeholderTextColor={colors.textMuted}
                                                value={propManualName}
                                                onChangeText={setPropManualName}
                                            />
                                            <TextInput
                                                style={{ backgroundColor: colors.surface2, borderRadius:6, padding:5, borderWidth:1, borderColor: colors.border, color:'#fff', fontSize:13 }}
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
                                        style={{ backgroundColor:'#f59e0b30', borderRadius:8, paddingVertical:6, borderWidth:1, borderColor:'#f59e0b60', alignItems:'center' }}
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
                            {sets.some(r => r.my !== '') && (
                                <TouchableOpacity style={sc.drawBtn} onPress={() => setSets(prev => prev.map(row => ({ ...row, opp: row.my })))}>
                                    <Text style={sc.drawBtnTxt}>🤝 Beraberlik</Text>
                                </TouchableOpacity>
                            )}
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

                    {/* Lock message */}
                    {!hasScore && !scoreUnlocked && matchEnd && (
                        <Text style={sc.lockedTxt}>{t.matchNotStarted}</Text>
                    )}

                    {/* Mutual cancel banner */}
                    {withinPenaltyWindow && otherRequestedMutual && !iAlreadyRequestedMutual && (
                        <TouchableOpacity
                            style={{ backgroundColor:'#eab30820', borderRadius:10, padding:7, marginBottom:8, borderWidth:1, borderColor:'#eab30840' }}
                            onPress={() => handleMutualCancelPress(true)}
                        >
                            <Text style={{ color:'#fbbf24', fontSize:12, fontWeight:'700' }}>{t.mutualCancelOtherRequested}</Text>
                        </TouchableOpacity>
                    )}

                    {/* Action buttons */}
                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginTop:8, marginBottom:20 }}>
                        {!hasScore && scoreUnlocked && (
                            <>
                                <TouchableOpacity
                                    style={{ paddingHorizontal:11, paddingVertical:6, borderRadius:10, borderWidth:1, borderColor: colors.purple+'60', backgroundColor: colors.purple+'18', flex:1, alignItems:'center' }}
                                    onPress={() => setShowScore(v => !v)}>
                                    <Text style={{ color: colors.purple, fontSize:13, fontWeight:'700' }}>{showScore ? '▲ Kapat' : t.enterScore}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={{ paddingHorizontal:11, paddingVertical:6, borderRadius:10, borderWidth:1, borderColor:'#dc262640', backgroundColor:'#dc262615', flex:1, alignItems:'center' }}
                                    onPress={() => setShowCantScore(true)}>
                                    <Text style={{ color:'#f87171', fontSize:13, fontWeight:'700' }}>{t.cantScoreBtn}</Text>
                                </TouchableOpacity>
                            </>
                        )}
                        {match.scoreStatus !== 'CONFIRMED' && (
                            <>
                                {withinPenaltyWindow && !iAlreadyRequestedMutual && (
                                    <TouchableOpacity
                                        style={{ paddingHorizontal:11, paddingVertical:6, borderRadius:10, borderWidth:1, borderColor:'#2563eb50', backgroundColor:'#2563eb18', alignItems:'center' }}
                                        onPress={() => handleMutualCancelPress(false)} disabled={cancelling}>
                                        <Text style={{ color:'#60a5fa', fontSize:13, fontWeight:'700' }}>🤝 Karşılıklı</Text>
                                    </TouchableOpacity>
                                )}
                                {withinPenaltyWindow && iAlreadyRequestedMutual && (
                                    <View style={{ paddingHorizontal:11, paddingVertical:6, borderRadius:10, borderWidth:1, borderColor:'#2563eb30', backgroundColor:'#2563eb10', alignItems:'center' }}>
                                        <Text style={{ color:'#60a5fa', fontSize:13 }}>⏳ İstendi</Text>
                                    </View>
                                )}
                                <TouchableOpacity
                                    style={{ paddingHorizontal:11, paddingVertical:6, borderRadius:10, borderWidth:1, borderColor:'#dc262650', backgroundColor:'#dc262618', alignItems:'center' }}
                                    onPress={handleCancelPress} disabled={cancelling}>
                                    <Text style={{ color:'#f87171', fontSize:13, fontWeight:'700' }}>✕ İptal{withinPenaltyWindow ? ' ⚠️' : ''}</Text>
                                </TouchableOpacity>
                            </>
                        )}
                        {canReportNoShow && (
                            <TouchableOpacity
                                style={{ paddingHorizontal:11, paddingVertical:6, borderRadius:10, borderWidth:1, borderColor:'#f9731650', backgroundColor:'#f9731618', alignItems:'center' }}
                                onPress={() => { setNoShowAbsent([]); setNoShowPhoto(null); setShowNoShow(true); }}>
                                <Text style={{ color:'#fb923c', fontSize:13, fontWeight:'700' }}>🚫 Gelmedi</Text>
                            </TouchableOpacity>
                        )}
                        {match._myNoShowPending && (
                            <View style={{ paddingHorizontal:11, paddingVertical:6, borderRadius:10, borderWidth:1, borderColor:'#f9731630', backgroundColor:'#f9731610', alignItems:'center' }}>
                                <Text style={{ color:'#fb923c', fontSize:13 }}>⏳ Bildirildi</Text>
                            </View>
                        )}
                    </View>

                    {/* Comments section */}
                    <Text style={{ color:'#fff', fontSize:15, fontWeight:'800', marginBottom:12 }}>
                        💬 Yorumlar{localComments.length > 0 ? ` (${localComments.length})` : ''}
                    </Text>
                    {loadingLocalComments ? (
                        <ActivityIndicator color={cfg.color} style={{ marginVertical:16 }} />
                    ) : localComments.length === 0 ? (
                        <Text style={{ color: colors.textMuted, fontSize:13, textAlign:'center', marginVertical:12 }}>Henüz yorum yok.</Text>
                    ) : (
                        localComments.map(c => (
                            <View key={c.id} style={{ backgroundColor: colors.surface2, borderRadius:10, padding:7, marginBottom:8, borderWidth:1, borderColor: colors.border }}>
                                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:4 }}>
                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{c.user?.username || '?'}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:10 }}>
                                        {c.createdAt ? new Date(c.createdAt).toLocaleDateString(t.dateLocale, { day:'numeric', month:'short' }) : ''}
                                    </Text>
                                </View>
                                <Text style={{ color: colors.textSecondary, fontSize:13 }}>{c.content}</Text>
                            </View>
                        ))
                    )}
                </ScrollView>

                {/* Comment input */}
                <KeyboardAvoidingView behavior={Platform.OS==='ios' ? 'padding' : undefined}>
                    <View style={{ flexDirection:'row', gap:3, paddingHorizontal:9, paddingVertical:7,
                        paddingBottom: Platform.OS==='ios' ? 28 : 10,
                        borderTopWidth:1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
                        <TextInput
                            style={{ flex:1, backgroundColor: colors.surface2, borderRadius:10, paddingHorizontal:9,
                                paddingVertical:5, color:'#fff', fontSize:14, borderWidth:1, borderColor: colors.border }}
                            placeholder="Yorum yaz..."
                            placeholderTextColor={colors.textMuted}
                            value={localCommentText}
                            onChangeText={setLocalCommentText}
                            multiline
                        />
                        <TouchableOpacity
                            style={{ backgroundColor: sendingLocalComment || !localCommentText.trim() ? colors.surface2 : colors.purple,
                                borderRadius:10, paddingHorizontal:11, justifyContent:'center', alignItems:'center' }}
                            onPress={sendLocalComment}
                            disabled={sendingLocalComment || !localCommentText.trim()}>
                            <Text style={{ color:'#fff', fontWeight:'800', fontSize:13 }}>Gönder</Text>
                        </TouchableOpacity>
                    </View>
                </KeyboardAvoidingView>
            </View>
        </Modal>

        {/* Skor Giremiyoruz Modal */}
            <Modal visible={showCantScore} animationType="slide" transparent onRequestClose={() => { setShowCantScore(false); setAbandonReason(null); }}>
                <View style={s.modalOverlay}>
                    <View style={[s.modalBox, { paddingBottom:37 }]}>
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
                                    <View style={{ flexDirection:'row', gap:3, marginBottom:6 }}>
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
                        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:17, paddingBottom:33 }}>
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
                                        style={{ flexDirection:'row', alignItems:'center', gap:3, paddingVertical:7, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}
                                    >
                                        <View style={{ width:22, height:22, borderRadius:6, borderWidth:2, borderColor: selected ? '#fb923c' : colors.border, backgroundColor: selected ? '#fb923c30' : 'transparent', justifyContent:'center', alignItems:'center' }}>
                                            {selected && <Text style={{ color:'#fb923c', fontSize:12, fontWeight:'900' }}>✓</Text>}
                                        </View>
                                        <Text style={{ color:'#fff', fontWeight:'700' }}>{p.username}</Text>
                                        {p.skillRating != null && (
                                            <Text style={{ color:'#facc15', fontSize:11 }}>{Number(p.skillRating).toFixed(2)} ★</Text>
                                        )}
                                    </TouchableOpacity>
                                );
                            })}

                            {/* Photo picker */}
                            <TouchableOpacity
                                onPress={pickNoShowPhoto}
                                style={{ marginTop:16, flexDirection:'row', alignItems:'center', gap:3, paddingVertical:7, paddingHorizontal:11, borderRadius:10, borderWidth:1, borderColor: noShowPhoto ? '#fb923c80' : colors.border, backgroundColor: noShowPhoto ? '#fb923c15' : colors.surface2 }}
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
                                style={{ marginTop:18, backgroundColor: noShowSubmitting || noShowAbsent.length===0 ? colors.surface2 : '#ea580c', borderRadius:12, paddingVertical:10, alignItems:'center' }}
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

        <VenueMenuOrderModal
            visible={!!orderVenueId}
            venueId={orderVenueId}
            onClose={() => setOrderVenueId(null)}
        />
        </>
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
    box:          { backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:17, paddingTop:17, paddingBottom:37 },
    header:       { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
    title:        { color:'#fff', fontSize:16, fontWeight:'900' },
    close:        { color: colors.textMuted, fontSize:22 },
    item:         { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:11, borderBottomWidth:1, borderBottomColor: colors.border },
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
                            <View key={i} style={{ flexDirection:'row', gap:3, marginBottom:8 }}>
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
    box:            { height:'75%', backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:13, paddingTop:17, paddingBottom:37 },
    header:         { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
    title:          { color:'#fff', fontSize:16, fontWeight:'900' },
    close:          { color: colors.textMuted, fontSize:22 },
    cell:           { flex:1, paddingVertical:9, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border, alignItems:'center', justifyContent:'center' },
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
                        columnWrapperStyle={{ gap:3, marginBottom:8 }}
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
    { id: 'ARTIFICIAL', emoji: '🟩', label: 'Suni Çim' },
];

// ─── Venue Menu Order Modal ───────────────────────────────────────────────────

const CAT_LABELS = { EQUIPMENT: '🎾 Ekipman', FOOD: '🍔 Yiyecek', DRINK: '☕ İçecek', OTHER: '🛍 Diğer' };

function VenueMenuOrderModal({ visible, venueId, onClose }) {
    const [items, setItems]   = useState([]);
    const [loading, setLoading] = useState(false);
    const [cart, setCart]     = useState({});
    const [notes, setNotes]   = useState('');
    const [placing, setPlacing] = useState(false);

    useEffect(() => {
        if (!visible || !venueId) return;
        setCart({});
        setNotes('');
        setLoading(true);
        api.get(`/venues/${venueId}/menu`)
            .then(r => setItems(r.data.items || []))
            .catch(() => setItems([]))
            .finally(() => setLoading(false));
    }, [visible, venueId]);

    const addItem    = (id) => setCart(c => ({ ...c, [id]: (c[id] || 0) + 1 }));
    const removeItem = (id) => setCart(c => {
        const n = { ...c };
        if (n[id] > 1) n[id] -= 1; else delete n[id];
        return n;
    });
    const totalPrice = items.reduce((s, it) => s + (cart[it.id] || 0) * it.price, 0);
    const cartCount  = Object.values(cart).reduce((a, b) => a + b, 0);
    const cats       = [...new Set(items.map(i => i.category))];

    const placeOrder = async () => {
        const orderItems = Object.entries(cart).filter(([, q]) => q > 0).map(([id, quantity]) => ({ menuItemId: id, quantity }));
        if (!orderItems.length) return;
        setPlacing(true);
        try {
            await api.post(`/venues/${venueId}/orders`, { items: orderItems, notes: notes || undefined });
            Alert.alert('✅ Sipariş Verildi', 'İşletme siparişinizi aldı.');
            onClose();
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Sipariş verilemedi');
        } finally { setPlacing(false); }
    };

    return (
        <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
            <View style={vm.overlay}>
                <View style={vm.sheet}>
                    <View style={vm.header}>
                        <Text style={vm.title}>📋 Ekstra Hizmetler</Text>
                        <TouchableOpacity onPress={onClose} style={vm.closeBtn}>
                            <Text style={vm.closeX}>✕</Text>
                        </TouchableOpacity>
                    </View>
                    <ScrollView style={vm.body} showsVerticalScrollIndicator={false}>
                        {loading && <ActivityIndicator color="#22c55e" style={{ marginVertical: 24 }} />}
                        {!loading && items.length === 0 && (
                            <Text style={vm.emptyTxt}>Menü bulunamadı</Text>
                        )}
                        {!loading && cats.map(cat => (
                            <View key={cat} style={{ marginBottom: 12 }}>
                                <Text style={vm.catLabel}>{CAT_LABELS[cat] || cat}</Text>
                                {items.filter(i => i.category === cat && i.available).map(item => (
                                    <View key={item.id} style={vm.itemRow}>
                                        <View style={{ flex: 1 }}>
                                            <Text style={vm.itemName}>{item.name}</Text>
                                            <Text style={vm.itemPrice}>{item.price} ₺</Text>
                                        </View>
                                        <View style={vm.qtyRow}>
                                            <TouchableOpacity style={vm.qtyBtn} onPress={() => removeItem(item.id)}>
                                                <Text style={vm.qtyBtnTxt}>−</Text>
                                            </TouchableOpacity>
                                            <Text style={vm.qty}>{cart[item.id] || 0}</Text>
                                            <TouchableOpacity style={vm.qtyBtn} onPress={() => addItem(item.id)}>
                                                <Text style={vm.qtyBtnTxt}>＋</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                ))}
                            </View>
                        ))}
                        {!loading && items.length > 0 && (
                            <View style={{ marginTop: 8 }}>
                                <Text style={vm.catLabel}>Not (isteğe bağlı)</Text>
                                <TextInput
                                    style={vm.notesInput}
                                    placeholder="Özel istek..."
                                    placeholderTextColor="#555"
                                    value={notes}
                                    onChangeText={setNotes}
                                    multiline
                                />
                            </View>
                        )}
                        <View style={{ height: 20 }} />
                    </ScrollView>
                    {cartCount > 0 && (
                        <View style={vm.footer}>
                            <View style={{ flex: 1 }}>
                                <Text style={vm.totalLabel}>Toplam</Text>
                                <Text style={vm.totalPrice}>{totalPrice} ₺</Text>
                            </View>
                            <TouchableOpacity style={vm.orderBtn} onPress={placeOrder} disabled={placing}>
                                {placing
                                    ? <ActivityIndicator color="#fff" />
                                    : <Text style={vm.orderBtnTxt}>Sipariş Ver ({cartCount})</Text>}
                            </TouchableOpacity>
                        </View>
                    )}
                </View>
            </View>
        </Modal>
    );
}

const vm = StyleSheet.create({
    overlay:    { flex:1, backgroundColor:'#000b', justifyContent:'flex-end' },
    sheet:      { backgroundColor:'#12121e', borderTopLeftRadius:20, borderTopRightRadius:20, maxHeight:'85%' },
    header:     { flexDirection:'row', alignItems:'center', padding:16, borderBottomWidth:1, borderBottomColor:'#ffffff12' },
    title:      { flex:1, color:'#fff', fontSize:16, fontWeight:'700' },
    closeBtn:   { padding:4 },
    closeX:     { color:'#888', fontSize:18 },
    body:       { padding:16 },
    emptyTxt:   { color:'#555', textAlign:'center', marginTop:24, fontSize:13 },
    catLabel:   { color:'#888', fontSize:11, fontWeight:'700', marginBottom:8, letterSpacing:0.5, textTransform:'uppercase' },
    itemRow:    { flexDirection:'row', alignItems:'center', backgroundColor:'#ffffff08', borderRadius:10, padding:12, marginBottom:8 },
    itemName:   { color:'#fff', fontSize:14, fontWeight:'600' },
    itemPrice:  { color:'#22c55e', fontSize:13, marginTop:2 },
    qtyRow:     { flexDirection:'row', alignItems:'center', gap:10 },
    qtyBtn:     { width:30, height:30, borderRadius:15, backgroundColor:'#ffffff12', alignItems:'center', justifyContent:'center' },
    qtyBtnTxt:  { color:'#fff', fontSize:18, fontWeight:'700', lineHeight:20 },
    qty:        { color:'#fff', fontSize:15, fontWeight:'700', minWidth:20, textAlign:'center' },
    notesInput: { backgroundColor:'#ffffff08', borderRadius:8, borderWidth:1, borderColor:'#ffffff14', color:'#fff', padding:10, fontSize:13, minHeight:60, marginTop:4 },
    footer:     { flexDirection:'row', alignItems:'center', padding:14, borderTopWidth:1, borderTopColor:'#ffffff12' },
    totalLabel: { color:'#888', fontSize:11 },
    totalPrice: { color:'#fff', fontSize:16, fontWeight:'700' },
    orderBtn:   { backgroundColor:'#22c55e', borderRadius:10, paddingHorizontal:18, paddingVertical:12, alignItems:'center', minWidth:130 },
    orderBtnTxt:{ color:'#fff', fontSize:14, fontWeight:'700' },
});

// ─── Venue Multi-Court Booking Modal ─────────────────────────────────────────
// Tüm kortları sekme olarak gösterir; boş=yeşil, dolu=kırmızı

function VenueBookingModal({ visible, venueId, initialCourtId, onClose, onBooked }) {
    const todayStr = () => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    };
    const addMins = (t, m) => {
        const [h, min] = t.split(':').map(Number);
        const tot = h * 60 + min + m;
        return `${String(Math.floor(tot/60)).padStart(2,'0')}:${String(tot%60).padStart(2,'0')}`;
    };
    const fmtDate = (str) => new Date(str + 'T12:00:00').toLocaleDateString('tr-TR',
        { weekday: 'short', day: 'numeric', month: 'short' });

    const [venue,       setVenue]       = useState(null);
    const [loadingV,    setLoadingV]    = useState(false);
    const [selDate,     setSelDate]     = useState(todayStr);
    // courtsSlots: { [courtId]: { loading: bool, data: slotsData | null } }
    const [courtsSlots, setCourtsSlots] = useState({});
    // selSlot: { courtId, slot, flexDur } | null
    const [selSlot,     setSelSlot]     = useState(null);
    const [payMethod,   setPayMethod]   = useState('CASH');
    const [booking,     setBooking]     = useState(false);
    const [booked,      setBooked]      = useState(false);

    // Tesis verisi yükle
    useEffect(() => {
        if (!visible || !venueId) return;
        setVenue(null); setCourtsSlots({}); setSelSlot(null); setSelDate(todayStr()); setBooked(false);
        setLoadingV(true);
        api.get(`/venues/${venueId}`)
            .then(r => {
                setVenue(r.data);
                const acc = Array.isArray(r.data.acceptedPayments) ? r.data.acceptedPayments : ['CASH', 'EFT'];
                if (!acc.includes('CASH')) setPayMethod(acc[0] || 'CASH');
            })
            .catch(() => setVenue(null))
            .finally(() => setLoadingV(false));
    }, [visible, venueId]);

    // Tüm kortların slotlarını paralel yükle
    useEffect(() => {
        if (!venue || !venueId) return;
        setSelSlot(null);
        const courts = venue.courts || [];
        const initMap = {};
        courts.forEach(c => { initMap[c.id] = { loading: true, data: null }; });
        setCourtsSlots(initMap);
        Promise.all(
            courts.map(c =>
                api.get(`/venues/${venueId}/courts/${c.id}/slots`, { params: { date: selDate } })
                    .then(r => ({ id: c.id, data: r.data }))
                    .catch(() => ({ id: c.id, data: null }))
            )
        ).then(results => {
            const next = {};
            results.forEach(({ id, data }) => { next[id] = { loading: false, data }; });
            setCourtsSlots(next);
        });
    }, [venue, selDate]);

    const selectSlot = (cId, slot) => {
        setSelSlot(prev =>
            prev?.courtId === cId && prev?.slot?.start === slot.start
                ? null
                : { courtId: cId, slot, flexDur: 60 }
        );
    };

    const confirmBooking = async () => {
        if (!selSlot) return;
        const { courtId, slot, flexDur } = selSlot;
        const activeCourt = venue?.courts?.find(c => c.id === courtId);
        const courtData = courtsSlots[courtId]?.data;
        const endTime = (courtData?.type === 'FLEXIBLE' || courtData?.type === 'VAR_DURATION')
            ? addMins(slot.start, flexDur)
            : slot.end;
        setBooking(true);
        try {
            const resResp = await api.post(`/venues/${venueId}/courts/${courtId}/reserve`, {
                date: selDate, startTime: slot.start, endTime, paymentMethod: payMethod,
            });
            const reservationId = resResp.data?.reservation?.id || null;
            const slotDurMins = (courtData?.type === 'FLEXIBLE' || courtData?.type === 'VAR_DURATION') ? flexDur : 60;
            const courtTotalPrice = venue?.pricePerSlot ? Math.round((slotDurMins / 60) * venue.pricePerSlot) : 0;
            const courtObj = { name: activeCourt?.name || '', venueName: venue?.name || '', venueId, courtId, id: courtId, city: venue?.city, totalPrice: courtTotalPrice };
            onBooked?.(courtObj, selDate, slot.start, endTime, reservationId);
            setBooked(true);
        } catch (e) {
            Alert.alert('Hata', e?.response?.data?.message || 'Rezervasyon yapılamadı');
        } finally { setBooking(false); }
    };

    const renderCourtCol = (court) => {
        const cs = courtsSlots[court.id];
        const cData = cs?.data;
        const isStructured = cData && (cData.type === 'FULL_HOUR' || cData.type === 'HALF_HOUR' || cData.type === 'NINETY_MIN');
        const isWindow = cData && (cData.type === 'FLEXIBLE' || cData.type === 'VAR_DURATION');

        return (
            <View key={court.id} style={vb.courtCol}>
                <Text style={vb.courtColTitle}>{court.name}</Text>
                {court.lightsFrom && (
                    <TouchableOpacity style={vb.lightsRow} activeOpacity={0.7}
                        onPress={() => Alert.alert('💡 Gece Işıkları', `Bu kortta gece ışıkları ${court.lightsFrom} itibarıyla açılır.\nGündüz saatlerinde ışık olmayabilir.`)}>
                        <Text style={vb.courtColLight}>💡 {court.lightsFrom}</Text>
                        <View style={vb.lightsInfoBtn}><Text style={vb.lightsInfoTxt}>i</Text></View>
                    </TouchableOpacity>
                )}
                {cs?.loading && <ActivityIndicator color="#22c55e" style={{ marginTop: 8 }} size="small" />}
                {!cs?.loading && !cData && <Text style={vb.colEmpty}>Bilgi yok</Text>}

                <ScrollView nestedScrollEnabled showsVerticalScrollIndicator={false} style={{ flex: 1 }}>
                    {!cs?.loading && isStructured && cData.slots.map((sl, i) => {
                        const isSel = selSlot?.courtId === court.id && selSlot?.slot?.start === sl.start;
                        const slotPrice = sl.price != null ? sl.price : venue?.pricePerSlot;
                        return (
                            <TouchableOpacity key={i} disabled={!sl.free}
                                style={[vb.colSlot, sl.free ? vb.colSlotFree : vb.colSlotTaken, isSel && vb.colSlotSel]}
                                onPress={() => selectSlot(court.id, sl)} activeOpacity={0.75}>
                                <Text style={[vb.colSlotT, !sl.free && { color:'#ef4444' }, isSel && { color:'#fff' }]}>
                                    {sl.start}
                                </Text>
                                <Text style={[vb.colSlotSub, !sl.free && { color:'#ef444466' }, isSel && { color:'#fff', opacity:0.8 }]}>
                                    {sl.end}
                                </Text>
                                {sl.free && slotPrice > 0 && (
                                    <Text style={[vb.colSlotPrice, isSel && { color:'#bbf7d0' }]}>{slotPrice}₺</Text>
                                )}
                            </TouchableOpacity>
                        );
                    })}

                    {!cs?.loading && isWindow && (
                        cData.windows?.length === 0
                            ? <Text style={vb.colEmpty}>Müsait yok</Text>
                            : cData.windows.map((w, i) => {
                                const isSel = selSlot?.courtId === court.id && selSlot?.slot?.start === w.start;
                                return (
                                    <TouchableOpacity key={i}
                                        style={[vb.colSlot, vb.colSlotFree, isSel && vb.colSlotSel]}
                                        onPress={() => selectSlot(court.id, w)} activeOpacity={0.75}>
                                        <Text style={[vb.colSlotT, isSel && { color:'#fff' }]}>{w.start}</Text>
                                        <Text style={[vb.colSlotSub, isSel && { color:'#fff', opacity:0.8 }]}>{w.end}</Text>
                                    </TouchableOpacity>
                                );
                            })
                    )}
                    <View style={{ height: 8 }} />
                </ScrollView>
            </View>
        );
    };

    return (
        <>
        <Modal visible={visible} transparent={false} animationType="slide" onRequestClose={onClose} statusBarTranslucent>
            <View style={vb.overlay}>
                <View style={vb.sheet}>
                    {/* Header */}
                    <View style={vb.header}>
                        <View style={{ flex: 1 }}>
                            <Text style={vb.title} numberOfLines={1}>{venue?.name || 'Tesis'}</Text>
                            {venue && <Text style={vb.subtitle}>{venue.branch} · {venue.city}</Text>}
                        </View>
                        <TouchableOpacity onPress={onClose} style={vb.closeBtn}>
                            <Text style={vb.closeX}>✕</Text>
                        </TouchableOpacity>
                    </View>

                    {loadingV && <ActivityIndicator color="#22c55e" style={{ marginVertical: 28 }} />}

                    {!loadingV && venue && (
                        <View style={{ flex:1 }}>
                            {/* Tarih Seçici — 14 günlük yatay strip */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}
                                style={vb.dateStrip}
                                contentContainerStyle={{ paddingHorizontal:10, paddingVertical:8, gap:6 }}>
                                {Array.from({length:14}, (_,i) => {
                                    const d = new Date();
                                    d.setDate(d.getDate() + i);
                                    const yStr = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
                                    const isSel = selDate === yStr;
                                    return (
                                        <TouchableOpacity key={yStr} onPress={() => setSelDate(yStr)}
                                            style={[vb.dateChip, isSel && vb.dateChipSel]}>
                                            <Text style={[vb.dateChipDay, isSel && vb.dateChipDaySel]}>
                                                {d.toLocaleDateString('tr-TR', { weekday:'short' })}
                                            </Text>
                                            <Text style={[vb.dateChipNum, isSel && vb.dateChipNumSel]}>
                                                {d.getDate()}
                                            </Text>
                                            <Text style={[vb.dateChipMonth, isSel && vb.dateChipMonthSel]}>
                                                {d.toLocaleDateString('tr-TR', { month:'short' })}
                                            </Text>
                                        </TouchableOpacity>
                                    );
                                })}
                            </ScrollView>

                            {/* Legend */}
                            <View style={[vb.legend, { paddingHorizontal:14, marginBottom:4 }]}>
                                <View style={vb.legendItem}>
                                    <View style={[vb.legendDot, { backgroundColor:'#16a34a' }]} />
                                    <Text style={vb.legendTxt}>Boş</Text>
                                </View>
                                <View style={vb.legendItem}>
                                    <View style={[vb.legendDot, { backgroundColor:'#dc2626' }]} />
                                    <Text style={vb.legendTxt}>Dolu</Text>
                                </View>
                            </View>

                            {/* Tüm kortlar yan yana */}
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}
                                contentContainerStyle={[vb.courtsRow, { alignItems:'stretch', flexGrow:1 }]}
                                style={{ flex:1, borderBottomWidth:1, borderBottomColor:'#ffffff10' }}>
                                {[...(venue.courts || [])].sort((a, b) => a.name.localeCompare(b.name, 'tr', { numeric: true })).map(c => renderCourtCol(c))}
                            </ScrollView>

                            {/* Seçim + Ödeme + Rezervasyon — sadece slot seçiliyken */}
                            {!selSlot && !booked && (
                                <Text style={[vb.emptyTxt, { textAlign:'center', paddingVertical:10 }]}>Yukarıdan bir saat seçin</Text>
                            )}
                            {selSlot && (() => {
                                const courtData = courtsSlots[selSlot.courtId]?.data;
                                const needsDur = courtData?.type === 'FLEXIBLE' || courtData?.type === 'VAR_DURATION';
                                const selCourt = venue.courts?.find(c => c.id === selSlot.courtId);
                                return (
                                    <ScrollView style={vb.body} showsVerticalScrollIndicator={false}>
                                        <View style={vb.selSummary}>
                                            <Text style={vb.selSummaryTxt}>
                                                ✅ {selCourt?.name} · {selSlot.slot.start}{selSlot.slot.end ? ` – ${selSlot.slot.end}` : ''}
                                            </Text>
                                            {(() => { const p = selSlot.slot.price != null ? selSlot.slot.price : venue?.pricePerSlot; return p > 0 ? <Text style={vb.selSummaryPrice}>💰 {p}₺</Text> : null; })()}
                                        </View>
                                        {needsDur && (
                                            <>
                                                <Text style={vb.sectionLabel}>Süre Seçin</Text>
                                                <View style={vb.durRow}>
                                                    {[60,90,120,150,180].filter(m => m <= selSlot.slot.durationMins).map(m => (
                                                        <TouchableOpacity key={m}
                                                            style={[vb.durBtn, selSlot.flexDur===m && vb.durBtnSel]}
                                                            onPress={() => setSelSlot(p => ({ ...p, flexDur: m }))}>
                                                            <Text style={[vb.durTxt, selSlot.flexDur===m && vb.durTxtSel]}>
                                                                {m<60?m+'dk':m===60?'1s':m===90?'1.5s':m===120?'2s':m===150?'2.5s':'3s'}
                                                            </Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </>
                                        )}
                                        <Text style={vb.sectionLabel}>Ödeme Yöntemi</Text>
                                        <View style={vb.payRow}>
                                            {[['CASH','💵 Kortta Öde'],['EFT','🏦 EFT / Havale'],['ONLINE','💳 Online']].filter(([m]) => {
                                                const acc = Array.isArray(venue?.acceptedPayments) ? venue.acceptedPayments : ['CASH','EFT'];
                                                return acc.includes(m);
                                            }).map(([m, label]) => (
                                                <TouchableOpacity key={m}
                                                    style={[vb.payBtn, payMethod===m && vb.payBtnSel]}
                                                    onPress={() => setPayMethod(m)}>
                                                    <Text style={[vb.payBtnTxt, payMethod===m && vb.payBtnTxtSel]}>{label}</Text>
                                                </TouchableOpacity>
                                            ))}
                                        </View>
                                        {payMethod === 'ONLINE' && (
                                            <View style={vb.ibanBox}>
                                                <Text style={[vb.ibanRow, { color:'#a78bfa' }]}>💳 Online ödeme yakında aktif olacak.</Text>
                                            </View>
                                        )}
                                        {payMethod === 'EFT' && (
                                            <View style={vb.ibanBox}>
                                                {venue?.user?.businessIban ? (
                                                    <>
                                                        {venue.user.businessIbanHolder && (
                                                            <Text style={vb.ibanRow}>Hesap Sahibi: <Text style={vb.ibanVal}>{venue.user.businessIbanHolder}</Text></Text>
                                                        )}
                                                        <Text style={vb.ibanRow}>IBAN: <Text style={[vb.ibanVal,{fontFamily:'monospace'}]} selectable>{venue.user.businessIban}</Text></Text>
                                                    </>
                                                ) : (
                                                    <Text style={[vb.ibanRow, { color:'#f59e0b' }]}>📞 EFT bilgisi için lütfen tesis ile iletişime geçin.</Text>
                                                )}
                                            </View>
                                        )}
                                        <TouchableOpacity style={vb.bookBtn} onPress={confirmBooking} disabled={booking}>
                                            {booking
                                                ? <ActivityIndicator color="#fff" />
                                                : <Text style={vb.bookBtnTxt}>Rezervasyon Yap</Text>}
                                        </TouchableOpacity>
                                        <View style={{ height: 24 }} />
                                    </ScrollView>
                                );
                            })()}

                            {booked && (
                                <TouchableOpacity style={vb.continueBtn} onPress={onClose} activeOpacity={0.85}>
                                    <Text style={vb.continueBtnTxt}>📌 Kaldığın yerden devam et</Text>
                                </TouchableOpacity>
                            )}
                        </View>
                    )}
                </View>
            </View>
        </Modal>
        </>
    );
}

const vb = StyleSheet.create({
    overlay:      { flex:1, backgroundColor:'#12121e' },
    sheet:        { flex:1, backgroundColor:'#12121e' },
    header:       { flexDirection:'row', alignItems:'flex-start', padding:16, borderBottomWidth:1, borderBottomColor:'#ffffff12' },
    title:        { color:'#fff', fontSize:16, fontWeight:'800' },
    subtitle:     { color:'#888', fontSize:12, marginTop:2 },
    closeBtn:     { width:32, height:32, alignItems:'center', justifyContent:'center', borderRadius:16, backgroundColor:'#ffffff10' },
    closeX:       { color:'#888', fontSize:16, fontWeight:'700' },

    tabs:         { paddingHorizontal:14, paddingVertical:8, gap:8 },
    tab:          { paddingVertical:6, paddingHorizontal:14, borderRadius:20, backgroundColor:'#ffffff08', borderWidth:1, borderColor:'#ffffff15' },
    tabActive:    { backgroundColor:'#9333ea22', borderColor:'#9333ea' },
    tabTxt:       { color:'#888', fontSize:13, fontWeight:'600' },
    tabTxtActive: { color:'#c084fc', fontWeight:'700' },

    dateStrip:        { height:72, borderBottomWidth:1, borderBottomColor:'#ffffff10' },
    dateChip:         { alignItems:'center', paddingVertical:6, paddingHorizontal:8, borderRadius:10, backgroundColor:'#ffffff08', borderWidth:1, borderColor:'#ffffff12', minWidth:46 },
    dateChipSel:      { backgroundColor:'#16a34a30', borderColor:'#22c55e' },
    dateChipDay:      { color:'#888', fontSize:9, fontWeight:'700', textTransform:'uppercase', marginBottom:1 },
    dateChipDaySel:   { color:'#4ade80' },
    dateChipNum:      { color:'#fff', fontSize:15, fontWeight:'800', lineHeight:18 },
    dateChipNumSel:   { color:'#22c55e' },
    dateChipMonth:    { color:'#888', fontSize:9, marginTop:1 },
    dateChipMonthSel: { color:'#4ade80' },

    body:         { padding:16, maxHeight:420 },

    legend:       { flexDirection:'row', gap:14, marginBottom:10 },
    legendItem:   { flexDirection:'row', alignItems:'center', gap:5 },
    legendDot:    { width:11, height:11, borderRadius:6 },
    legendTxt:    { color:'#888', fontSize:12 },

    slotGrid:     { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:4 },
    slot:         { width:'22%', aspectRatio:1.15, borderRadius:10, alignItems:'center', justifyContent:'center', borderWidth:1.5 },
    slotFree:     { backgroundColor:'#14532d', borderColor:'#16a34a' },
    slotTaken:    { backgroundColor:'#450a0a', borderColor:'#7f1d1d', opacity:0.75 },
    slotSel:      { backgroundColor:'#581c87', borderColor:'#c084fc', borderWidth:2.5 },
    slotT:        { color:'#4ade80', fontSize:12, fontWeight:'700' },
    slotTakenT:   { color:'#ef4444' },
    colSlotPrice: { color:'#86efac', fontSize:9, fontWeight:'700', marginTop:1 },
    selSummaryPrice: { color:'#4ade80', fontSize:12, fontWeight:'700', marginTop:3 },

    sectionLabel: { color:'#888', fontSize:11, fontWeight:'700', marginBottom:8, letterSpacing:0.5, textTransform:'uppercase' },
    takenRow:     { color:'#ef4444', fontSize:13, marginBottom:4 },
    flexWin:      { backgroundColor:'#16a34a18', borderRadius:8, borderWidth:1, borderColor:'#22c55e55', padding:12, marginBottom:8 },
    flexWinSel:   { borderColor:'#22c55e', backgroundColor:'#16a34a30' },
    flexWinTxt:   { color:'#22c55e', fontSize:14, fontWeight:'700' },
    flexWinSub:   { color:'#86efac', fontSize:11, marginTop:2 },
    durRow:       { flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom:4 },
    durBtn:       { paddingHorizontal:14, paddingVertical:8, borderRadius:8, borderWidth:1, borderColor:'#ffffff20', backgroundColor:'#ffffff08' },
    durBtnSel:    { borderColor:'#22c55e', backgroundColor:'#16a34a30' },
    durTxt:       { color:'#aaa', fontSize:13, fontWeight:'600' },
    durTxtSel:    { color:'#22c55e' },
    emptyTxt:     { color:'#555', textAlign:'center', marginTop:24, fontSize:13 },
    payRow:       { flexDirection:'row', gap:10, marginBottom:10 },
    payBtn:       { flex:1, padding:10, borderRadius:8, borderWidth:1, borderColor:'#ffffff18', backgroundColor:'#ffffff06', alignItems:'center' },
    payBtnSel:    { borderColor:'#22c55e', backgroundColor:'#16a34a25' },
    payBtnTxt:    { color:'#888', fontSize:13, fontWeight:'600' },
    payBtnTxtSel: { color:'#22c55e' },
    ibanBox:      { backgroundColor:'#ffffff08', borderRadius:8, padding:10, marginBottom:10 },
    ibanRow:      { color:'#888', fontSize:12, marginBottom:4 },
    ibanVal:      { color:'#fff', fontWeight:'600' },
    bookBtn:      { backgroundColor:'#22c55e', borderRadius:10, padding:14, alignItems:'center', marginTop:4 },
    bookBtnTxt:   { color:'#fff', fontSize:15, fontWeight:'700' },
    continueBtn:  { backgroundColor:'#7c3aed', borderRadius:10, padding:14, alignItems:'center', margin:16, marginTop:8 },
    continueBtnTxt: { color:'#fff', fontSize:15, fontWeight:'700' },

    // Çok sütunlu kort görünümü
    courtsRow:    { flexDirection:'row', alignItems:'stretch', paddingHorizontal:8, paddingVertical:8, gap:8 },
    courtCol:     { width:120, backgroundColor:'#ffffff08', borderRadius:10, padding:8, borderWidth:1, borderColor:'#ffffff12' },
    courtColTitle:{ color:'#fff', fontSize:13, fontWeight:'800', textAlign:'center', marginBottom:5, letterSpacing:0.3 },
    lightsRow:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:4, marginBottom:5 },
    courtColLight:{ color:'#fbbf24', fontSize:10 },
    lightsInfoBtn:{ width:15, height:15, borderRadius:8, backgroundColor:'#fbbf2430', borderWidth:1, borderColor:'#fbbf2460', alignItems:'center', justifyContent:'center' },
    lightsInfoTxt:{ color:'#fbbf24', fontSize:9, fontWeight:'800', lineHeight:13 },
    colSlot:      { borderRadius:5, paddingTop:3, paddingBottom:3, paddingLeft:3, paddingRight:3, marginBottom:3, alignItems:'center', borderWidth:1 },
    colSlotFree:  { backgroundColor:'#14532d', borderColor:'#16a34a' },
    colSlotTaken: { backgroundColor:'#450a0a', borderColor:'#7f1d1d', opacity:0.7 },
    colSlotSel:   { backgroundColor:'#581c87', borderColor:'#c084fc', borderWidth:2 },
    colSlotT:     { color:'#4ade80', fontSize:12, fontWeight:'700' },
    colSlotSub:   { color:'#4ade80', fontSize:9, opacity:0.7 },
    colEmpty:     { color:'#555', fontSize:11, textAlign:'center', marginTop:8 },
    selSummary:   { backgroundColor:'#22c55e18', borderRadius:8, padding:10, marginBottom:10, borderWidth:1, borderColor:'#22c55e40' },
    selSummaryTxt:{ color:'#4ade80', fontSize:13, fontWeight:'700', textAlign:'center' },
});

// ─── Create Rival Modal ────────────────────────────────────────────────────────

function CreateRivalModal({ visible, onClose, category, sub, onCreated, prefill = null }) {
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
        genderReq: 'MIX',
        partnerGenderReq: 'MIX',
        opp1GenderReq: 'MIX',
        opp2GenderReq: 'MIX',
        venueId: null,
        venueCourtId: null,
        reservationId: null,
    };

    const buildInitialState = () => {
        if (!prefill) return INIT;
        const preCourtObj = prefill.courtName
            ? { id: null, name: prefill.courtName, city: prefill.city || '' }
            : null;
        return {
            ...INIT,
            matchDate:        prefill.matchDate ? new Date(prefill.matchDate) : null,
            matchTime:        prefill.matchTime || '',
            duration:         prefill.duration  || '60',
            courtSearchText:  prefill.courtName || '',
            selectedCourt:    preCourtObj,
            manualCity:       prefill.city || '',
            courtReserved:    true,
            venueId:          prefill.venueId      || null,
            venueCourtId:     prefill.venueCourtId || null,
            courtFeePerPerson: prefill.courtFee ? String(prefill.courtFee) : '',
        };
    };

    const [f, setF]               = useState(() => buildInitialState());
    const [showPartnerSearch, setShowPartnerSearch] = useState(false);
    const [partnerQuery, setPartnerQuery] = useState('');
    const [partnerResults, setPartnerResults] = useState([]);
    const [partnerSearching, setPartnerSearching] = useState(false);
    const [searching, setSearching] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [ratingPickerTarget, setRatingPickerTarget] = useState(null);
    const [venueBooking, setVenueBooking] = useState({ visible: false, venueId: null, initialCourtId: null });
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
            const raw = Array.isArray(data) ? data : [];
            const seenVenues = new Set();
            const deduped = [];
            for (const c of raw) {
                if (c.isBusinessVenue && c.venueId) {
                    if (seenVenues.has(c.venueId)) continue;
                    seenVenues.add(c.venueId);
                    deduped.push({ ...c, name: c.venueName || c.name });
                } else {
                    deduped.push(c);
                }
            }
            set('courtResults', deduped);
        } catch { set('courtResults', []); }
        finally { setSearching(false); }
    };

    const selectCourt = (court) => {
        if (court.isBusinessVenue) {
            setVenueBooking({ visible: true, venueId: court.venueId, initialCourtId: court.courtId });
            set('courtResults', []);
            return;
        }
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

    const cancelCourt = async () => {
        if (!f.reservationId) {
            setF(p => ({ ...p, selectedCourt: null, courtSearchText: '', courtResults: [], reservationId: null, venueId: null, venueCourtId: null }));
            return;
        }
        try {
            await api.delete(`/venues/reservations/${f.reservationId}`);
            setF(p => ({ ...p, selectedCourt: null, courtSearchText: '', courtResults: [], reservationId: null, venueId: null, venueCourtId: null }));
        } catch (e) {
            Alert.alert('İptal Edilemiyor', e?.response?.data?.message || 'Rezervasyon iptal edilemedi');
        }
    };

    const changeCourt = async () => {
        const vid = f.venueId;
        if (f.reservationId) {
            try {
                await api.delete(`/venues/reservations/${f.reservationId}`);
            } catch (e) {
                Alert.alert('Değiştirilemiyor', e?.response?.data?.message || 'Mevcut rezervasyon iptal edilemedi');
                return;
            }
        }
        setF(p => ({ ...p, selectedCourt: null, courtSearchText: '', courtResults: [], reservationId: null, venueCourtId: null }));
        if (vid) setVenueBooking({ visible: true, venueId: vid, initialCourtId: null });
    };

    const submit = async () => {
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
                courtName: f.selectedCourt ? [f.selectedCourt.venueName, f.selectedCourt.name].filter(Boolean).join(' ') : (f.showManualCourt ? f.manualCourtName : undefined) || f.courtSearchText || undefined,
                courtId:   f.selectedCourt?.id || undefined,
                location:  f.selectedCourt?.city || f.manualCity || undefined,
                courtAddress: f.selectedCourt?.address || f.manualAddress || undefined,
                surface:   isPadel ? 'ARTIFICIAL' : (f.surface || undefined),
                venueType: f.venueType || undefined,
                isCourtReserved: f.courtReserved,
                courtFeePerPerson: f.courtFeePerPerson !== '' ? parseInt(f.courtFeePerPerson, 10) : undefined,
                message:   f.message || undefined,
                minRating: f.minRating !== '' ? parseFloat(f.minRating) : undefined,
                maxRating: f.maxRating !== '' ? parseFloat(f.maxRating) : undefined,
                genderReq: (sub === 'tennis' || sub === 'padel') ? f.genderReq : undefined,
                partnerGenderReq: (sub === 'tennis' || sub === 'padel') && f.matchType === 'DOUBLE' ? f.partnerGenderReq : undefined,
                opp1GenderReq: (sub === 'tennis' || sub === 'padel') && f.matchType === 'DOUBLE' ? f.opp1GenderReq : undefined,
                opp2GenderReq: (sub === 'tennis' || sub === 'padel') && f.matchType === 'DOUBLE' ? f.opp2GenderReq : undefined,
                partnerInviteId: !isTeamSport && f.matchType === 'DOUBLE' && f.partner
                    ? f.partner.id
                    : undefined,
                venueId:      f.venueId || undefined,
                venueCourtId: f.venueCourtId || undefined,
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
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose} android_keyboardInputMode="adjustNothing">
            <View style={s.modalOverlay}>
                <KeyboardAvoidingView behavior="padding" style={{ flex:1, justifyContent:'flex-end' }}>
                    <View style={s.modalBox}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{t.createTitle}</Text>
                            <TouchableOpacity onPress={onClose}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                            {/* 1+2 - Mod + Format yan yana (non-team) / Mod + Takım (team) */}
                            {!isTeamSport ? (
                                <>
                                    <View style={{ flexDirection:'row', gap:3, marginBottom:8 }}>
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
                                                            style={[s.chipBtn, { paddingHorizontal:0, paddingVertical:0 }, isActive && {
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
                                                        style={[s.chipBtn, { paddingHorizontal:0, paddingVertical:0 }, f.matchType===fmt.id && s.chipBtnActive]}>
                                                        <Text style={[s.chipBtnText, f.matchType===fmt.id && s.chipBtnTextActive]}>{fmt.label}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    </View>
                                    {!isTeamSport && f.matchType === 'DOUBLE' && (
                                        f.partner ? (
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:3, backgroundColor: cfg.color+'15', borderRadius:10, borderWidth:1, borderColor: cfg.color+'40', paddingHorizontal:7, paddingVertical:5, marginBottom:8 }}>
                                                <Text style={{ color:'#fff', fontSize:12, fontWeight:'700', flex:1 }}>👥 {t.partnerLabel}: {f.partner.fullName || f.partner.username}</Text>
                                                <TouchableOpacity onPress={() => set('partner', null)}>
                                                    <Text style={{ color: colors.textMuted, fontSize:16 }}>✕</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ) : (
                                            <TouchableOpacity onPress={() => setShowPartnerSearch(true)}
                                                style={{ backgroundColor: cfg.color+'15', borderRadius:10, borderWidth:1, borderColor: cfg.color+'40', paddingHorizontal:7, paddingVertical:5, marginBottom:8, alignItems:'center' }}>
                                                <Text style={{ color: cfg.color, fontSize:12, fontWeight:'700' }}>👥+ {t.choosePartnerBtn}</Text>
                                            </TouchableOpacity>
                                        )
                                    )}
                                    {(sub === 'tennis' || sub === 'padel') && (() => {
                                        const GENDERS = [
                                            { id:'MIX', label: t.genderMix || '🤝 Mix' },
                                            { id:'MALE', label: t.genderMale || '👨 Erkek' },
                                            { id:'FEMALE', label: t.genderFemale || '👩 Kadın' },
                                        ];
                                        const GenderRow = ({ label, field }) => (
                                            <View style={{ flex:1 }}>
                                                <Text style={[s.fieldLabel, { marginBottom:4, fontSize:11 }]}>{label}</Text>
                                                <View style={{ flexDirection:'row', gap:3 }}>
                                                    {GENDERS.map(g => (
                                                        <TouchableOpacity key={g.id} onPress={() => set(field, g.id)}
                                                            style={[s.chipBtn, { flex:1, paddingHorizontal:0, paddingVertical:1 }, f[field]===g.id && s.chipBtnActive]}>
                                                            <Text style={[s.chipBtnText, { fontSize:10 }, f[field]===g.id && s.chipBtnTextActive]} numberOfLines={1}>{g.label}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </View>
                                        );
                                        if (f.matchType === 'SINGLE') {
                                            return (
                                                <View style={{ marginBottom:8 }}>
                                                    <GenderRow label={t.genderReqLabel || 'Rakip Cinsiyeti'} field="genderReq" />
                                                </View>
                                            );
                                        }
                                        return (
                                            <View style={{ marginBottom:8, gap:3 }}>
                                                <GenderRow label={t.partnerGenderLabel || 'Takım Arkadaşı Cinsiyeti'} field="partnerGenderReq" />
                                                <View style={{ flexDirection:'row', gap:3 }}>
                                                    <GenderRow label={t.opp1GenderLabel || 'Rakip 1 Cinsiyeti'} field="opp1GenderReq" />
                                                    <GenderRow label={t.opp2GenderLabel || 'Rakip 2 Cinsiyeti'} field="opp2GenderReq" />
                                                </View>
                                            </View>
                                        );
                                    })()}
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
                                                    style={[s.chipBtn, { paddingHorizontal:0, paddingVertical:0 }, isActive && {
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
                            <View style={{ flexDirection:'row', gap:3, marginBottom:14 }}>
                                <View style={{ flex:1 }}>
                                    <Text style={s.fieldLabel}>{t.ratingLimitLabel}</Text>
                                    <View style={{ flexDirection:'row', gap:3 }}>
                                        <TouchableOpacity style={{ flex:1, backgroundColor:colors.surface2, borderRadius:10, padding:0, borderWidth:1, borderColor: f.minRating ? colors.purple+'80' : colors.border, alignItems:'center' }} onPress={() => setRatingPickerTarget('min')}>
                                            <Text style={s.triLabel}>{t.minRatingLabel}</Text>
                                            <Text style={[s.triValue, !f.minRating && s.triPlaceholder]}>{f.minRating ? `${f.minRating} ★` : 'Serbest'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={{ flex:1, backgroundColor:colors.surface2, borderRadius:10, padding:0, borderWidth:1, borderColor: f.maxRating ? colors.purple+'80' : colors.border, alignItems:'center' }} onPress={() => setRatingPickerTarget('max')}>
                                            <Text style={s.triLabel}>{t.maxRatingLabel}</Text>
                                            <Text style={[s.triValue, !f.maxRating && s.triPlaceholder]}>{f.maxRating ? `${f.maxRating} ★` : 'Serbest'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                <View style={[s.switchRow, { flex:1, marginBottom:0, padding:0 }]}>
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
                                    {/* Kort Ara */}
                                    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:6 }}>
                                        <Text style={[s.fieldLabel, { marginBottom:0 }]}>{t.courtLabel}{!f.flexibleSchedule && !f.courtMutual ? ' *' : ''}</Text>
                                        <TouchableOpacity
                                            onPress={() => set('courtMutual', !f.courtMutual)}
                                            style={{ flexDirection:'row', alignItems:'center', gap:4, paddingVertical:4, paddingHorizontal:8, borderRadius:10, backgroundColor: f.courtMutual ? cfg.color+'18' : '#ffffff08', borderWidth:1, borderColor: f.courtMutual ? cfg.color+'60' : '#ffffff15' }}
                                        >
                                            <View style={{ width:14, height:14, borderRadius:7, borderWidth:2, borderColor: f.courtMutual ? cfg.color : '#6b7280', alignItems:'center', justifyContent:'center' }}>
                                                {f.courtMutual && <View style={{ width:6, height:6, borderRadius:3, backgroundColor: cfg.color }} />}
                                            </View>
                                            <Text style={{ color: f.courtMutual ? cfg.color : colors.textMuted, fontSize:12, fontWeight:'700' }}>🤝 {t.courtMutualBtn}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {!f.courtMutual && <View style={{ flexDirection:'row', gap:3, marginBottom:6 }}>
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
                                                        {c.isBusinessVenue && <Text style={{ color:'#22c55e', fontSize:10, marginTop:1 }}>🏢 İşletme · Rezerve Et</Text>}
                                                    </View>
                                                    {c.verified && !c.isBusinessVenue && <Text style={{ color:'#4ade80', fontSize:11 }}>{t.courtVerified}</Text>}
                                                    {c.isBusinessVenue && <Text style={{ color:'#22c55e', fontSize:14 }}>›</Text>}
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
                                            <View style={{ flex:1 }}>
                                                <Text style={s.selectedCourtText}>✅ {[f.selectedCourt.venueName, f.selectedCourt.name].filter(Boolean).join(' ')}</Text>
                                                {f.reservationId && f.matchDate && (
                                                    <Text style={{ color:'#22c55e', fontSize:10, marginTop:2 }}>
                                                        📅 {f.matchDate.toLocaleDateString('tr-TR')} · {f.matchTime}{f.reservationEndTime ? `–${f.reservationEndTime}` : ''}{f.selectedCourt.totalPrice ? `  💰 ${f.selectedCourt.totalPrice}₺` : ''}
                                                    </Text>
                                                )}
                                            </View>
                                            <View style={{ flexDirection:'row', gap:6 }}>
                                                {f.venueId && (
                                                    <TouchableOpacity
                                                        onPress={changeCourt}
                                                        style={{ backgroundColor:'#3b82f620', borderRadius:7, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor:'#3b82f650' }}>
                                                        <Text style={{ color:'#60a5fa', fontSize:11, fontWeight:'700' }}>🔄 Değiştir</Text>
                                                    </TouchableOpacity>
                                                )}
                                                <TouchableOpacity
                                                    onPress={cancelCourt}
                                                    style={{ backgroundColor:'#ef444420', borderRadius:7, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor:'#ef444450' }}>
                                                    <Text style={{ color:'#ef4444', fontSize:11, fontWeight:'700' }}>
                                                        {f.reservationId ? '🗑 Sil' : '✕'}
                                                    </Text>
                                                </TouchableOpacity>
                                            </View>
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

                                    {/* Kort Rezerve Edildi */}
                                    <TouchableOpacity style={[s.checkRow, { marginBottom:10 }]} onPress={() => set('courtReserved', !f.courtReserved)}>
                                        <View style={[s.checkbox, f.courtReserved && s.checkboxChecked]}>
                                            {f.courtReserved && <Text style={{ color:'#fff', fontSize:12 }}>✓</Text>}
                                        </View>
                                        <Text style={s.checkLabel}>{t.courtReservedLabel}</Text>
                                    </TouchableOpacity>

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

                                    {/* Zemin + Mekan Tipi */}
                                    {isPadel ? (
                                        <View style={{ flexDirection:'row', alignItems:'flex-start', gap:12, marginBottom:14 }}>
                                            <View>
                                                <Text style={[s.fieldLabel, { marginTop:4 }]}>{t.surfaceLabel}</Text>
                                                <View style={[s.chipRow, { marginBottom:0 }]}>
                                                    <View style={[s.chipBtn, s.chipBtnActive]}>
                                                        <Text style={[s.chipBtnText, s.chipBtnTextActive]}>🟩 Suni Çim</Text>
                                                    </View>
                                                </View>
                                            </View>
                                            <View style={{ flex:1 }}>
                                                <Text style={[s.fieldLabel, { marginTop:4 }]}>{t.venueLabel}</Text>
                                                <View style={[s.chipRow, { marginBottom:0, flexWrap:'wrap' }]}>
                                                    {[{id:'OUTDOOR',label:t.outdoor},{id:'INDOOR',label:t.indoor},{id:'INDOOR_AC',label:t.indoorAc}].map(vt => (
                                                        <TouchableOpacity key={vt.id} onPress={() => set('venueType', vt.id)}
                                                            style={[s.chipBtn, f.venueType===vt.id && s.chipBtnActive]}>
                                                            <Text style={[s.chipBtnText, f.venueType===vt.id && s.chipBtnTextActive]}>{vt.label}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </View>
                                        </View>
                                    ) : (
                                        <>
                                            <Text style={[s.fieldLabel, { marginTop:4 }]}>{t.surfaceLabel}</Text>
                                            <View style={s.chipRow}>
                                                {courtSurfaces.map(sf => (
                                                    <TouchableOpacity key={sf.id} onPress={() => set('surface', sf.id)}
                                                        style={[s.chipBtn, f.surface===sf.id && s.chipBtnActive]}>
                                                        <Text style={[s.chipBtnText, f.surface===sf.id && s.chipBtnTextActive]}>{sf.emoji} {sf.label || getSurface(t, sf.id)}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                            <View style={{ marginBottom:14 }}>
                                                <Text style={[s.fieldLabel, { marginTop:0 }]}>{t.venueLabel}</Text>
                                                <View style={[s.chipRow, { marginBottom:0 }]}>
                                                    {[{id:'OUTDOOR',label:t.outdoor},{id:'INDOOR',label:t.indoor}].map(vt => (
                                                        <TouchableOpacity key={vt.id} onPress={() => set('venueType', vt.id)}
                                                            style={[s.chipBtn, f.venueType===vt.id && s.chipBtnActive]}>
                                                            <Text style={[s.chipBtnText, f.venueType===vt.id && s.chipBtnTextActive]}>{vt.label}</Text>
                                                        </TouchableOpacity>
                                                    ))}
                                                </View>
                                            </View>
                                        </>
                                    )}

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
                <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:17, paddingTop:17, paddingBottom:37, maxHeight:'80%' }}>
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
                            <TouchableOpacity key={u.id} onPress={() => choosePartner(u)} style={{ flexDirection:'row', alignItems:'center', gap:3, paddingVertical:7, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}>
                                <Avatar name={u.username} avatar={u.avatar} size={36} color={cfg.color} />
                                <View style={{ flex:1 }}>
                                    <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>{u.interests?.[0]?.alias || u.fullName || u.username}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                        {u.username}{u.interests?.[0]?.skillRating != null ? `  ${Number(u.interests[0].skillRating).toFixed(2)} ★` : ''}
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
        <VenueBookingModal
            visible={venueBooking.visible}
            venueId={venueBooking.venueId}
            initialCourtId={venueBooking.initialCourtId}
            onClose={() => setVenueBooking({ visible: false, venueId: null, initialCourtId: null })}
            onBooked={(court, date, startTime, endTime, reservationId) => {
                setF(p => ({
                    ...p,
                    selectedCourt: court,
                    courtSearchText: [court.venueName, court.name].filter(Boolean).join(' '),
                    courtResults: [],
                    matchDate: new Date(date + 'T12:00:00'),
                    matchTime: startTime,
                    reservationEndTime: endTime || null,
                    venueId: court.venueId || null,
                    venueCourtId: court.courtId || null,
                    reservationId: reservationId || null,
                }));
            }}
        />
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

function TournamentCard({ item, myId, myIsAdmin, t, cfg, onJoin, onCancelJoin, onDelete, onUpdated, openChatTournamentId, onChatOpened, openMatchId, openMatchTournamentId, onMatchOpened }) {
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
    const [highlightMatchId, setHighlightMatchId] = useState(null); // skor onayı bildiriminden açılan maç — kartı vurgula
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

    // "Skor girildi, onaylar mısın?" bildirimine tıklanınca onay bekleyen maç otomatik açılsın
    useEffect(() => {
        if (openMatchId && openMatchTournamentId === item.id) {
            (async () => {
                const matches = await fetchMatches();
                const target = matches.find(m => m.id === openMatchId);
                if (target) {
                    setSelectedRoundKey(`${target.phase}|${target.round}`);
                    setMatchTab('matches');
                    setHighlightMatchId(target.id);
                }
                setShowMatchesModal(true);
                onMatchOpened?.();
            })();
        }
    }, [openMatchId, openMatchTournamentId, item.id]);

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
                    : <Text style={{ color: colors.textMuted, fontSize:9 }} numberOfLines={1}>{p?.user?.username}{ratingOf(p) != null ? `  ${starEmoji(Number(ratingOf(p)))} ${Number(ratingOf(p)).toFixed(2)}` : ''}</Text>
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
                            <TouchableOpacity onPress={() => setMyTournamentPartner(invitedBy.userId)} disabled={partnerActionLoading} style={{ marginTop:2, backgroundColor:'#16a34a30', borderRadius:5, paddingHorizontal:3, paddingVertical:0, alignSelf:'flex-start', borderWidth:1, borderColor:'#16a34a50' }}>
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
                                style={{ marginTop:2, backgroundColor: cfg.color+'20', borderRadius:5, paddingHorizontal:3, paddingVertical:0, alignSelf:'flex-start', borderWidth:1, borderColor: cfg.color+'40' }}>
                                <Text style={{ color: cfg.color, fontSize:9, fontWeight:'700' }}>+ Davet Et</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                );
            }
        }

        const isMineCard = p1.userId === myId || p2?.userId === myId;
        return (
            <View key={p1.userId} style={{ width:'48%', backgroundColor: isMineCard ? cfg.color+'10' : '#0f172a', borderRadius:8, borderWidth:1, borderColor: isMineCard ? cfg.color+'40' : colors.border+'40', paddingVertical:3, paddingHorizontal:5, marginBottom:6 }}>
                {label && (
                    <View style={{ backgroundColor: label.bg, borderRadius:4, paddingHorizontal:2, paddingVertical:0, alignSelf:'flex-start', marginBottom:3, borderWidth:1, borderColor: label.border }}>
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
            const matches = Array.isArray(data?.matches) ? data.matches : [];
            setTournMatches(matches);
            setMyTeamId(data?.myTeamId || null);
            setTournTeams(Array.isArray(data?.teams) ? data.teams : []);
            setTournPlayerRatings(data?.playerRatings || {});
            return matches;
        } catch (e) {
            // Önceden burada hata sessizce yutuluyordu — geçici bir ağ hatasında ekran
            // "Maç yok" gösteriyordu (gerçekten maç olmamasıyla ayırt edilemiyordu),
            // kullanıcı modalı kapatıp tekrar açınca (fetchMatches yeniden tetiklenince)
            // düzeliyordu. Artık hata durumu ayrı gösteriliyor ve "Tekrar Dene" ile aynı
            // modalı kapatmadan yeniden denenebiliyor.
            console.log('[fetchMatches] failed:', e?.message);
            setMatchesError(true);
            return [];
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
            if (item.type === '1' || item.type === '2') {
                const averaj=x=>(x.gamesWon+x.gamesLost)===0?0:x.gamesWon/(x.gamesWon+x.gamesLost);
                if (Math.abs(averaj(b)-averaj(a))>0.001) return averaj(b)-averaj(a);
            }
            const sr=x=>x.setsLost===0?(x.setsWon===0?0:Infinity):x.setsWon/x.setsLost;
            if (Math.abs(sr(b)-sr(a))>0.001) return sr(b)-sr(a);
            const gr=x=>x.gamesLost===0?(x.gamesWon===0?0:Infinity):x.gamesWon/x.gamesLost;
            if (gr(b)!==gr(a)) return gr(b)-gr(a);
            return stableTiebreakHash(item.id, b.id) - stableTiebreakHash(item.id, a.id);
        });
    })();

    return (
        <>
        <View style={[s.card, { marginBottom:10 }]}>
            {/* Header */}
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
                <View style={{ flex:1, gap:3 }}>
                    {item.status === 'IN_PROGRESS' ? (
                        <TouchableOpacity style={{ flexDirection:'row', alignItems:'center', gap:3 }} onPress={() => setCollapsed(c => !c)}>
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
                        <View style={{ gap:3 }}>
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
                        <View style={{ backgroundColor:'#1e3a8a20', borderRadius:7, paddingHorizontal:4, paddingVertical:1, borderWidth:1, borderColor:'#1e3a8a50', marginTop:2 }}>
                            <Text style={{ color:'#93c5fd', fontSize:10, fontWeight:'800' }}>
                                {item.matchFrequency === 'WEEKLY_1'
                                    ? '📅 Haftada 1 Maç  •  🃏 1 joker (+10 gün)'
                                    : '📅 Haftada 2 Maç  •  🃏 2 joker (+14 gün)'}
                            </Text>
                        </View>
                    )}
                    {(item.prize1 || item.prize2 || item.prize3) && (
                        <View style={{ gap:3 }}>
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
                        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginTop:2 }}>
                            {item.setsPerMatch && (
                                <View style={{ backgroundColor: infoColor+'15', borderRadius:6, paddingHorizontal:3, paddingVertical:0, borderWidth:1, borderColor: infoColor+'40' }}>
                                    <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>
                                        {`Set Sayısı: ${item.setsPerMatch}`}
                                    </Text>
                                </View>
                            )}
                            {item.advantageScoring !== undefined && (
                                <View style={{ backgroundColor: infoColor+'15', borderRadius:6, paddingHorizontal:3, paddingVertical:0, borderWidth:1, borderColor: infoColor+'40' }}>
                                    <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>
                                        {item.advantageScoring === null ? t.tournFreeScoring : item.advantageScoring ? t.tournAdvantage : t.tournDeciding}
                                    </Text>
                                </View>
                            )}
                            <View style={{ backgroundColor: infoColor+'15', borderRadius:6, paddingHorizontal:3, paddingVertical:0, borderWidth:1, borderColor: infoColor+'40' }}>
                                <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>🔢 Play-Off Öncesi Maç Sayısı: {item.matchesBeforePlayoff || 3}</Text>
                            </View>
                            {item.playoffQualifiers && (
                                <View style={{ backgroundColor: infoColor+'15', borderRadius:6, paddingHorizontal:3, paddingVertical:0, borderWidth:1, borderColor: infoColor+'40' }}>
                                    <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>🏆 {t.tournPlayoffQualifiers}: {item.playoffQualifiers}</Text>
                                </View>
                            )}
                        </View>
                    )}
                    </>)}
                </View>
                {!collapsed && (
                <View style={{ alignItems:'flex-end', gap:3 }}>
                    <View style={{ backgroundColor: item.status === 'IN_PROGRESS' ? '#16a34a20' : item.status === 'COMPLETED' ? '#64748b20' : infoColor + '20', borderRadius:8, paddingHorizontal:5, paddingVertical:1, borderWidth:1, borderColor: item.status === 'IN_PROGRESS' ? '#16a34a50' : item.status === 'COMPLETED' ? '#64748b50' : infoColor + '50' }}>
                        <Text style={{ color: item.status === 'IN_PROGRESS' ? '#4ade80' : item.status === 'COMPLETED' ? '#94a3b8' : infoColor, fontSize:10, fontWeight:'800' }}>
                            {item.status === 'IN_PROGRESS' ? '🏆 Devam Ediyor' : item.status === 'COMPLETED' ? '✅ Tamamlandı' : t.tournStatusOpen}
                        </Text>
                    </View>
                    {isCreator ? (<>
                        {myStatus === null && !isEventStarted() && (
                            <TouchableOpacity style={{ backgroundColor: infoColor + '20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor: infoColor + '50' }} onPress={handleJoinPress}>
                                <Text style={{ color: infoColor, fontSize:10, fontWeight:'700' }}>+ {t.tournJoinBtn}</Text>
                            </TouchableOpacity>
                        )}
                        {myStatus === 'ACCEPTED' && (
                            <View style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:3, paddingVertical:0, borderWidth:1, borderColor:'#16a34a50' }}>
                                <Text style={{ color:'#4ade80', fontSize:10 }}>✓ Katıldın</Text>
                            </View>
                        )}
                        <TouchableOpacity style={{ backgroundColor: infoColor + '20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor: infoColor + '50' }} onPress={() => setShowEditModal(true)}>
                            <Text style={{ color: infoColor, fontSize:10, fontWeight:'700' }}>{t.tournEditBtn}</Text>
                        </TouchableOpacity>
                        <TouchableOpacity style={{ backgroundColor:'#dc262620', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#dc262650', alignItems:'center' }} onPress={() => onDelete(item.id)}>
                            <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700', textAlign:'center' }}>Turnuvayı{'\n'}🗑️ Sil</Text>
                        </TouchableOpacity>
                        {item.status === 'OPEN' && participantCount >= (item.minPlayers || 2) && (
                            <TouchableOpacity
                                style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#16a34a50' }}
                                onPress={handleStartTournament}
                                disabled={starting}>
                                <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'700' }}>
                                    {starting ? '...' : '🏆 Başlat'}
                                </Text>
                            </TouchableOpacity>
                        )}
                        {item.status === 'IN_PROGRESS' && item.type !== '2' && (
                            <TouchableOpacity
                                style={{ backgroundColor:'#f59e0b20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#f59e0b50' }}
                                onPress={handleRematch}>
                                <Text style={{ color:'#fbbf24', fontSize:10, fontWeight:'700' }}>🔀 Tekrar{'\n'}Eşleştir</Text>
                            </TouchableOpacity>
                        )}
                        {item.status === 'IN_PROGRESS' && item.type === '1' && (
                            <>
                                <TouchableOpacity
                                    style={{ backgroundColor:'#0e7490' + '30', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#0e7490' + '60' }}
                                    onPress={handleFixDeadlines}>
                                    <Text style={{ color:'#67e8f9', fontSize:10, fontWeight:'700' }}>⏱️ Süre{'\n'}Düzelt</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={{ backgroundColor:'#7c3aed20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#7c3aed50' }}
                                    onPress={handleRegenRound}>
                                    <Text style={{ color:'#a78bfa', fontSize:10, fontWeight:'700' }}>🔁 Turu{'\n'}Düzelt</Text>
                                </TouchableOpacity>
                            </>
                        )}
                        <View style={{ flexDirection:'row', gap:3 }}>
                            <TouchableOpacity
                                style={{ alignItems:'center', backgroundColor:'#16a34a15', borderRadius:6, paddingHorizontal:3, paddingVertical:2, borderWidth:1, borderColor:'#16a34a40' }}
                                onPress={() => { fetchChat(); fetchChatNotifyPref(); setShowChatModal(true); }}>
                                <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'600', textAlign:'center', lineHeight:13 }}>
                                    {'Mesajlar'.split('').join('\n')}
                                </Text>
                                <Text style={{ color:'#4ade80', fontSize:10, marginTop:3 }}>›</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ alignItems:'center', backgroundColor:'#1e40af15', borderRadius:6, paddingHorizontal:3, paddingVertical:2, borderWidth:1, borderColor:'#1e40af40' }}
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
                            <TouchableOpacity style={{ backgroundColor: infoColor + '20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor: infoColor + '50' }} onPress={handleJoinPress}>
                                <Text style={{ color: infoColor, fontSize:10, fontWeight:'700' }}>{t.tournJoinBtn}</Text>
                            </TouchableOpacity>
                        )}
                        {myStatus === 'PENDING' && (<>
                            <View style={{ backgroundColor:'#a855f720', borderRadius:6, paddingHorizontal:5, paddingVertical:1, borderWidth:1, borderColor:'#a855f750', maxWidth:120 }}>
                                <Text style={{ color:'#c084fc', fontSize:10, flexWrap:'wrap' }}>{t.tournJoinPending}</Text>
                            </View>
                            {!isEventStarted() && (
                                <TouchableOpacity style={{ backgroundColor:'#dc262620', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#dc262650' }} onPress={() => onCancelJoin(item.id)}>
                                    <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>{t.tournCancelJoinBtn}</Text>
                                </TouchableOpacity>
                            )}
                        </>)}
                        {myStatus === 'ACCEPTED' && !myPart?.cancelRequested && (
                            <View style={{ gap:3 }}>
                                <View style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:3, paddingVertical:0, borderWidth:1, borderColor:'#16a34a50' }}>
                                    <Text style={{ color:'#4ade80', fontSize:10 }}>{t.tournJoinAccepted}</Text>
                                </View>
                                {!isEventStarted() && (
                                    <TouchableOpacity style={{ backgroundColor:'#dc262615', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#dc262640' }} onPress={handleCancelAttempt}>
                                        <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>İptal</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        )}
                        {myStatus === 'ACCEPTED' && myPart?.cancelRequested && (
                            <View style={{ backgroundColor:'#f59e0b15', borderRadius:6, paddingHorizontal:3, paddingVertical:1, borderWidth:1, borderColor:'#f59e0b40' }}>
                                <Text style={{ color:'#fbbf24', fontSize:10, fontWeight:'700' }}>⏳ İptal onay bekliyor</Text>
                            </View>
                        )}
                        <View style={{ flexDirection:'row', gap:3 }}>
                            {myStatus === 'ACCEPTED' && (
                                <TouchableOpacity
                                    style={{ alignItems:'center', backgroundColor:'#16a34a15', borderRadius:6, paddingHorizontal:3, paddingVertical:2, borderWidth:1, borderColor:'#16a34a40' }}
                                    onPress={() => { fetchChat(); fetchChatNotifyPref(); setShowChatModal(true); }}>
                                    <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'600', textAlign:'center', lineHeight:13 }}>
                                        {'Mesajlar'.split('').join('\n')}
                                    </Text>
                                    <Text style={{ color:'#4ade80', fontSize:10, marginTop:3 }}>›</Text>
                                </TouchableOpacity>
                            )}
                            <TouchableOpacity
                                style={{ alignItems:'center', backgroundColor:'#1e40af15', borderRadius:6, paddingHorizontal:3, paddingVertical:2, borderWidth:1, borderColor:'#1e40af40' }}
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
                style={{ backgroundColor:'#16a34a15', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#16a34a40', marginTop:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}
                onPress={() => { fetchMatches(); if (!isCreator && participants.length === 0) fetchParticipants(); setShowMatchesModal(true); }}>
                <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'700' }}>📋 Maçlar & Puan Tablosu</Text>
                <Text style={{ color:'#4ade80', fontSize:12 }}>›</Text>
            </TouchableOpacity>
        )}

        {/* IN_PROGRESS: matches & standings Modal */}
        <Modal visible={showMatchesModal} animationType="slide" transparent onRequestClose={() => { setShowMatchesModal(false); setHighlightMatchId(null); }}>
            <View style={[s.modalOverlay, { justifyContent:'flex-end' }]}>
                <View style={[s.modalBox, { maxHeight:'90%' }]}>
                    <View style={s.modalHeader}>
                        <Text style={s.modalTitle}>📋 Maçlar & Puan Tablosu</Text>
                        <TouchableOpacity onPress={() => { setShowMatchesModal(false); setHighlightMatchId(null); }}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                    </View>
                    {/* Rules summary bar */}
                    {item.matchFrequency && item.matchFrequency !== 'FLEXIBLE' && (
                        <View style={{ backgroundColor:'#1e3a8a18', borderRadius:8, padding:5, marginBottom:10, borderWidth:1, borderColor:'#1e3a8a40' }}>
                            <Text style={{ color:'#93c5fd', fontSize:11, fontWeight:'800' }}>
                                {item.matchFrequency === 'WEEKLY_1'
                                    ? '📅 Haftada 1 Maç  •  🃏 1 joker hakkı (+10 gün)'
                                    : '📅 Haftada 2 Maç  •  🃏 2 joker hakkı (+14 gün)'}
                            </Text>
                        </View>
                    )}
                    {(item.type === '1' || item.type === '3') && (
                        <View style={{ flexDirection:'row', gap:3, marginBottom:10 }}>
                            {['matches','standings'].map(tab => (
                                <TouchableOpacity key={tab} onPress={() => setMatchTab(tab)}
                                    style={{ paddingHorizontal:11, paddingVertical:3, borderRadius:8, backgroundColor: matchTab===tab ? '#16a34a40' : 'transparent', borderWidth:1, borderColor: matchTab===tab ? '#16a34a60' : colors.border }}>
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
                    <View style={{ alignItems:'center', paddingVertical:7 }}>
                        <Text style={{ color:'#f87171', fontSize:12, marginBottom:8 }}>Maçlar yüklenemedi (bağlantı sorunu olabilir)</Text>
                        <TouchableOpacity onPress={fetchMatches} style={{ backgroundColor:'#16a34a30', borderRadius:8, paddingHorizontal:11, paddingVertical:3, borderWidth:1, borderColor:'#16a34a60' }}>
                            <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'700' }}>↻ Tekrar Dene</Text>
                        </TouchableOpacity>
                    </View>
                ) : matchTab === 'standings' ? (
                    standings.length === 0
                        ? <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', paddingVertical:3 }}>Henüz maç sonucu yok</Text>
                        : <View>
                            <View style={{ flexDirection:'row', paddingVertical:1, borderBottomWidth:1, borderBottomColor: colors.border, marginBottom:2 }}>
                                <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'700', flex:1 }}>Oyuncu</Text>
                                {['O','G','M','Av','P'].map(h => (
                                    <Text key={h} style={{ color: colors.textMuted, fontSize:10, fontWeight:'700', width:28, textAlign:'center' }}>{h}</Text>
                                ))}
                            </View>
                            {standings.map((row, i) => (
                                <View key={row.id} style={{ flexDirection:'row', alignItems:'center', paddingVertical:2, borderBottomWidth: i < standings.length-1 ? 1 : 0, borderBottomColor: colors.border+'30' }}>
                                    <Text style={{ color:'#fff', fontSize:11, flex:1 }} numberOfLines={1}>
                                        {i+1}. {row.name}{skillRatingMap[row.id] != null ? `  ${starEmoji(Number(skillRatingMap[row.id]))} ${Number(skillRatingMap[row.id]).toFixed(2)}` : ''}
                                    </Text>
                                    {[row.played, row.won, row.lost, (() => { const t = row.gamesWon + row.gamesLost; return t === 0 ? '-' : `${Math.round((row.gamesWon / t) * 100)}%`; })(), row.points].map((v,j) => (
                                        <Text key={j} style={{ color: j===4 ? '#4ade80' : '#fff', fontSize:11, fontWeight: j===4 ? '800' : '400', width:28, textAlign:'center' }}>{String(v)}</Text>
                                    ))}
                                </View>
                            ))}
                          </View>
                ) : (
                    tournMatches.length === 0
                        ? <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', paddingVertical:3 }}>Maç yok</Text>
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
                                        <View style={{ flexDirection:'row', gap:3 }}>
                                            {roundKeys.map(({ phase, round }) => {
                                                const key = `${phase}|${round}`;
                                                const isActive = key === activeKey;
                                                return (
                                                    <TouchableOpacity key={key} onPress={() => setSelectedRoundKey(key)}
                                                        style={{ paddingHorizontal:7, paddingVertical:3, borderRadius:8, backgroundColor: isActive ? infoColor+'30' : '#1e293b', borderWidth:1, borderColor: isActive ? infoColor+'60' : colors.border, alignItems:'center' }}>
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
                                                <View key={match.id} style={{ width: isEntering ? '100%' : (item.type === '2' ? '48.5%' : '100%'), backgroundColor:'#0f172a', borderRadius:8, padding:0, marginBottom:3, borderWidth: match.id === highlightMatchId ? 2 : 1, borderColor: match.id === highlightMatchId ? '#f59e0b' : isDone ? '#16a34a30' : isBye || isTBD ? '#64748b20' : '#334155' }}>
                                                        <View style={{ flex:1 }}>
                                                            {(() => {
                                                                const isW = isDone && match.winnerId === match.p1Id;
                                                                const setsRow = isDone && mSets.length > 0 && (
                                                                    <View style={{ flexDirection:'row', gap:3, paddingLeft:0 }}>
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
                                                                                        <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:10, fontWeight:'700', flexWrap:'wrap' }}>{playerLine(team.player1Id, team.player1Name)}</Text>
                                                                                        <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:10, fontWeight:'700', flexWrap:'wrap' }}>{playerLine(team.player2Id, team.player2Name)}</Text>
                                                                                        {avgLine ? <Text style={{ color:'#a78bfa', fontSize:9, fontWeight:'800' }}>{avgLine}</Text> : null}
                                                                                    </>
                                                                                ) : (
                                                                                    <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:11, fontWeight:'700', flexWrap:'wrap' }}>{match.p1Name || 'TBD'}</Text>
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
                                                                    ? `${starEmoji(rA)} ${rB.toFixed(2)}  ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}${diff >= 0 ? '📈' : '📉'}  ${rA.toFixed(2)}`
                                                                    : (match.p1Id && skillRatingMap[match.p1Id] != null ? `${starEmoji(Number(skillRatingMap[match.p1Id]))} ${Number(skillRatingMap[match.p1Id]).toFixed(2)}` : '');
                                                                return (
                                                                    <View style={{ flexDirection:'row', alignItems:'flex-start' }}>
                                                                        <View style={{ flex:1, flexShrink:1 }}>
                                                                            <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:11, fontWeight:'700', flexWrap:'wrap' }}>
                                                                                {match.p1Name || 'TBD'}
                                                                            </Text>
                                                                            {eloStr ? <Text style={{ color: isW ? '#4ade80' : '#94a3b8', fontSize:10, flexWrap:'wrap' }}>{eloStr}</Text> : null}
                                                                        </View>
                                                                        {setsRow}
                                                                    </View>
                                                                );
                                                            })()}
                                                            <Text style={{ color: colors.textMuted, fontSize:9, marginVertical:3 }}>vs</Text>
                                                            {(() => {
                                                                const isW = isDone && match.winnerId === match.p2Id;
                                                                const setsRow = isDone && mSets.length > 0 && (
                                                                    <View style={{ flexDirection:'row', gap:3, paddingLeft:0 }}>
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
                                                                                        <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:10, fontWeight:'700', flexWrap:'wrap' }}>{playerLine(team.player1Id, team.player1Name)}</Text>
                                                                                        <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:10, fontWeight:'700', flexWrap:'wrap' }}>{playerLine(team.player2Id, team.player2Name)}</Text>
                                                                                        {avgLine ? <Text style={{ color:'#a78bfa', fontSize:9, fontWeight:'800' }}>{avgLine}</Text> : null}
                                                                                    </>
                                                                                ) : (
                                                                                    <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:11, fontWeight:'700', flexWrap:'wrap' }}>{match.p2Name || 'TBD'}</Text>
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
                                                                    ? `${starEmoji(rA)} ${rB.toFixed(2)}  ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}${diff >= 0 ? '📈' : '📉'}  ${rA.toFixed(2)}`
                                                                    : (match.p2Id && skillRatingMap[match.p2Id] != null ? `${starEmoji(Number(skillRatingMap[match.p2Id]))} ${Number(skillRatingMap[match.p2Id]).toFixed(2)}` : '');
                                                                return (
                                                                    <View style={{ flexDirection:'row', alignItems:'flex-start' }}>
                                                                        <View style={{ flex:1, flexShrink:1 }}>
                                                                            <Text style={{ color: isW ? '#4ade80' : '#fff', fontSize:11, fontWeight:'700', flexWrap:'wrap' }}>
                                                                                {match.p2Name || 'TBD'}
                                                                            </Text>
                                                                            {eloStr ? <Text style={{ color: isW ? '#4ade80' : '#94a3b8', fontSize:10, flexWrap:'wrap' }}>{eloStr}</Text> : null}
                                                                        </View>
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
                                                                    style={{ backgroundColor: infoColor+'20', borderRadius:6, paddingHorizontal:0, paddingVertical:0, borderWidth:1, borderColor: infoColor+'50' }}>
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
                                                                        style={{ backgroundColor: otherJokerRequested ? '#7c3aed20' : '#1e40af20', borderRadius:6, paddingHorizontal:0, paddingVertical:0, borderWidth:1, borderColor: otherJokerRequested ? '#7c3aed60' : '#1e40af60' }}>
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
                                                                                style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:0, paddingVertical:0, borderWidth:1, borderColor:'#16a34a60', alignItems:'center' }}>
                                                                                <Text style={{ color:'#4ade80', fontSize:12 }}>✓</Text>
                                                                                <Text style={{ color:'#4ade80', fontSize:8, fontWeight:'700' }}>Onayla</Text>
                                                                            </TouchableOpacity>
                                                                        )}
                                                                        {!bothConfirmed && (isCreator || myIsAdmin) && !isEntering && (
                                                                            <TouchableOpacity onPress={() => openScoreEntry(match)}
                                                                                style={{ backgroundColor:'#f59e0b20', borderRadius:6, paddingHorizontal:0, paddingVertical:0, borderWidth:1, borderColor:'#f59e0b50', alignItems:'center' }}>
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
                                                        <View style={{ marginTop:8, borderTopWidth:1, borderTopColor: colors.border, paddingTop:5 }}>
                                                            <View style={{ flexDirection:'row', marginBottom:4 }}>
                                                                <Text style={{ color: colors.textMuted, fontSize:10, width:54 }}>Set</Text>
                                                                <Text style={{ color: colors.textMuted, fontSize:10, flex:1, textAlign:'center' }}>{match.p1Name}</Text>
                                                                <Text style={{ color: colors.textMuted, fontSize:10, flex:1, textAlign:'center' }}>{match.p2Name}</Text>
                                                            </View>
                                                            {scoreSets.map((set, si) => (
                                                                <View key={si} style={{ flexDirection:'row', alignItems:'center', marginBottom:4 }}>
                                                                    <Text style={{ color: si === 2 ? '#f59e0b' : colors.textMuted, fontSize:11, width:54 }}>{si === 2 ? '🔥 3.' : `${si+1}.`} Set</Text>
                                                                    <TextInput
                                                                        style={{ flex:1, backgroundColor:'#1e293b', color:'#fff', borderRadius:6, paddingHorizontal:5, paddingVertical:1, borderWidth:1, borderColor: colors.border, fontSize:13, textAlign:'center', marginRight:6 }}
                                                                        value={set.p1}
                                                                        onChangeText={v => updateTournSet(si, 'p1', v)}
                                                                        keyboardType="numeric" maxLength={2} placeholder="0" placeholderTextColor={colors.textMuted} />
                                                                    <TextInput
                                                                        style={{ flex:1, backgroundColor:'#1e293b', color:'#fff', borderRadius:6, paddingHorizontal:5, paddingVertical:1, borderWidth:1, borderColor: colors.border, fontSize:13, textAlign:'center' }}
                                                                        value={set.p2}
                                                                        onChangeText={v => updateTournSet(si, 'p2', v)}
                                                                        keyboardType="numeric" maxLength={2} placeholder="0" placeholderTextColor={colors.textMuted} />
                                                                </View>
                                                            ))}
                                                            <View style={{ flexDirection:'row', gap:3, marginTop:6 }}>
                                                                <TouchableOpacity onPress={submitScore} disabled={submittingScore}
                                                                    style={{ backgroundColor:'#16a34a30', borderRadius:8, paddingHorizontal:11, paddingVertical:2, borderWidth:1, borderColor:'#16a34a60' }}>
                                                                    <Text style={{ color:'#4ade80', fontSize:12, fontWeight:'800' }}>{submittingScore ? '...' : 'Kaydet'}</Text>
                                                                </TouchableOpacity>
                                                                <TouchableOpacity onPress={() => setScoreEntry(null)} style={{ paddingHorizontal:7, paddingVertical:2 }}>
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
                                <View style={{ flexDirection:'row', gap:3, marginBottom:14, marginTop:4 }}>
                                    <View style={{ flex:1 }}>
                                        <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>Min Oyuncu</Text>
                                        <TextInput style={[s.fieldInput, { paddingVertical:3, textAlign:'center', fontSize:12 }]} value={editMin} onChangeText={setEditMin} keyboardType="numeric" maxLength={3} />
                                    </View>
                                    <View style={{ flex:1 }}>
                                        <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>Max Oyuncu</Text>
                                        <TextInput style={[s.fieldInput, { paddingVertical:3, textAlign:'center', fontSize:12 }]} value={editMax} onChangeText={setEditMax} keyboardType="numeric" maxLength={3} />
                                    </View>
                                    <TouchableOpacity onPress={() => setEditRf('min')} style={{ flex:1 }}>
                                        <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>⭐ Alt Derece</Text>
                                        <View style={{ backgroundColor: colors.surface2, borderRadius:8, paddingVertical:4, alignItems:'center', borderWidth:1, borderColor: editMinRating ? infoColor : colors.border }}>
                                            <Text style={{ color: editMinRating ? infoColor : colors.textSecondary, fontSize:12, fontWeight:'800' }}>
                                                {editMinRating ? `${editMinRating}★` : '—'}
                                            </Text>
                                        </View>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setEditRf('max')} style={{ flex:1 }}>
                                        <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>⭐ Üst Derece</Text>
                                        <View style={{ backgroundColor: colors.surface2, borderRadius:8, paddingVertical:4, alignItems:'center', borderWidth:1, borderColor: editMaxRating ? infoColor : colors.border }}>
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
                                    <View style={{ flexDirection:'row', gap:3, marginBottom:14 }}>
                                        {[{v:true,l:'⚡ Avantajlı'},{v:false,l:'🎯 Karar Puanı'},{v:null,l:'🔓 Serbest'}].map(({v,l}) => (
                                            <TouchableOpacity key={String(v)} onPress={() => setEditAdvantageScoring(v)}
                                                style={{ flex:1, borderRadius:8, paddingVertical:3, alignItems:'center', borderWidth:1, backgroundColor: editAdvantageScoring === v ? infoColor+'30' : colors.surface2, borderColor: editAdvantageScoring === v ? infoColor : colors.border }}>
                                                <Text style={{ color: editAdvantageScoring === v ? infoColor : colors.textMuted, fontSize:10, fontWeight:editAdvantageScoring===v?'800':'500' }}>{l}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <Text style={s.fieldLabel}>Play-Off Öncesi Maç Sayısı</Text>
                                    <View style={{ flexDirection:'row', gap:3, alignItems:'center', marginBottom:14 }}>
                                        <TextInput style={[s.fieldInput, { flex:1, textAlign:'center' }]} value={editMatches} onChangeText={v => setEditMatches(v.replace(/[^0-9]/g,''))} keyboardType="numeric" maxLength={2} placeholder="3" placeholderTextColor={colors.textMuted} />
                                        <Text style={{ color: colors.textMuted, fontSize:12 }}>Play-Off Oyuncu:</Text>
                                        <TextInput style={[s.fieldInput, { flex:1, textAlign:'center' }]} value={editQualifiers} onChangeText={v => setEditQualifiers(v.replace(/[^0-9]/g,''))} keyboardType="numeric" maxLength={2} placeholder="4" placeholderTextColor={colors.textMuted} />
                                    </View>
                                </>)}

                                {/* Registration deadline */}
                                <Text style={s.fieldLabel}>📋 Son Başvuru Tarihi</Text>
                                <View style={{ flexDirection:'row', gap:3, marginBottom:14 }}>
                                    <TouchableOpacity onPress={() => { setEditTf(null); setEditDp('regEnd'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, borderWidth:1, borderColor: editRegEndDate ? infoColor+'60' : colors.border, flex:1 }}>
                                        <Text style={{ color: editRegEndDate ? '#fff' : colors.textMuted, fontSize:12 }}>{editRegEndDate ? `${String(editRegEndDate.getDate()).padStart(2,'0')}/${String(editRegEndDate.getMonth()+1).padStart(2,'0')}/${editRegEndDate.getFullYear()}` : 'Tarih'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => { setEditDp(null); setEditTf('regEnd'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, borderWidth:1, borderColor: editRegEndTime ? infoColor+'60' : colors.border }}>
                                        <Text style={{ color: editRegEndTime ? '#fff' : colors.textMuted, fontSize:12 }}>{editRegEndTime || 'Saat'}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Event start date */}
                                <Text style={s.fieldLabel}>🗓️ Etkinlik Başlangıcı</Text>
                                <View style={{ flexDirection:'row', gap:3, marginBottom:14 }}>
                                    <TouchableOpacity onPress={() => { setEditTf(null); setEditDp('evStart'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, borderWidth:1, borderColor: editEventDate ? infoColor+'60' : colors.border, flex:1 }}>
                                        <Text style={{ color: editEventDate ? '#fff' : colors.textMuted, fontSize:12 }}>{editEventDate ? `${String(editEventDate.getDate()).padStart(2,'0')}/${String(editEventDate.getMonth()+1).padStart(2,'0')}/${editEventDate.getFullYear()}` : 'Tarih'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => { setEditDp(null); setEditTf('evStart'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, borderWidth:1, borderColor: editEventTime ? infoColor+'60' : colors.border }}>
                                        <Text style={{ color: editEventTime ? '#fff' : colors.textMuted, fontSize:12 }}>{editEventTime || 'Saat'}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Event end date */}
                                <Text style={s.fieldLabel}>🏁 Tahmini Bitiş</Text>
                                <View style={{ flexDirection:'row', gap:3, marginBottom:14 }}>
                                    <TouchableOpacity onPress={() => { setEditTf(null); setEditDp('evEnd'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, borderWidth:1, borderColor: editEventEndDate ? infoColor+'60' : colors.border, flex:1 }}>
                                        <Text style={{ color: editEventEndDate ? '#fff' : colors.textMuted, fontSize:12 }}>{editEventEndDate ? `${String(editEventEndDate.getDate()).padStart(2,'0')}/${String(editEventEndDate.getMonth()+1).padStart(2,'0')}/${editEventEndDate.getFullYear()}` : 'Tarih'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => { setEditDp(null); setEditTf('evEnd'); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, borderWidth:1, borderColor: editEventEndTime ? infoColor+'60' : colors.border }}>
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
                                    <View style={{ flexDirection:'row', gap:3, marginBottom:14 }}>
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
                            <View style={{ backgroundColor:'#dc262615', borderRadius:10, padding:9, marginBottom:14, borderWidth:1, borderColor:'#dc262640' }}>
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
                                style={{ backgroundColor:'#dc262630', borderRadius:10, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:'#dc262660' }}
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
                        <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal:0, flex:1 }}>
                        {isCreator ? (() => {
                            if (loadingRequests) return <ActivityIndicator size="small" color={cfg.color} style={{ marginVertical:16 }} />;
                            if (requests.length === 0) return <Text style={{ color: colors.textMuted, fontSize:13, textAlign:'center', paddingVertical:13 }}>Henüz başvuru yok</Text>;
                            const acceptedEntries = requests.filter(r => r.status === 'ACCEPTED');
                            const mainListCount = item.maxPlayers || acceptedEntries.length;

                            if (item.status === 'IN_PROGRESS') {
                                // Show AS LİSTE / YEDEK LİSTE sections
                                const mainList = acceptedEntries.slice(0, mainListCount);
                                const waitList = acceptedEntries.slice(mainListCount);
                                return (
                                    <View>
                                        <View style={{ backgroundColor:'#16a34a20', borderRadius:8, paddingVertical:3, paddingHorizontal:7, marginBottom:8, borderWidth:1, borderColor:'#16a34a40' }}>
                                            <Text style={{ color:'#4ade80', fontSize:13, fontWeight:'800' }}>✅ AS LİSTE</Text>
                                        </View>
                                        {mainList.length === 0
                                            ? <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', paddingVertical:3 }}>—</Text>
                                            : mainList.map((r, i) => (
                                            <View key={r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:5, borderBottomWidth: i < mainList.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40', backgroundColor: r.cancelRequested ? '#f59e0b08' : 'transparent', borderRadius:6 }}>
                                                <View style={{ backgroundColor:'#16a34a20', borderRadius:4, paddingHorizontal:2, paddingVertical:0, marginRight:8, borderWidth:1, borderColor:'#16a34a40' }}>
                                                    <Text style={{ color:'#4ade80', fontSize:9, fontWeight:'800' }}>AS {i+1}</Text>
                                                </View>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.user?.fullName || r.user?.username}</Text>
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                    {r.cancelRequested && <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'700', marginTop:2 }}>⚠️ İptal talep etti</Text>}
                                                </View>
                                                {r.cancelRequested && (
                                                    <View style={{ flexDirection:'row', gap:3 }}>
                                                        <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Onayla', `${r.user?.fullName || r.user?.username} turnuvadan çıkarılacak. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Onayla', style:'destructive', onPress: () => approveCancelRequest(r.userId, true) }])} style={{ backgroundColor:'#16a34a30', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#16a34a50' }}>
                                                            <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Onayla</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Reddet', `${r.user?.fullName || r.user?.username} turnuvada kalmaya devam edecek. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Reddet', style:'destructive', onPress: () => approveCancelRequest(r.userId, false) }])} style={{ backgroundColor:'#dc262630', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#dc262650' }}>
                                                            <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Reddet</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                            </View>
                                        ))}
                                        {waitList.length > 0 && <>
                                            <View style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingVertical:3, paddingHorizontal:7, marginTop:14, marginBottom:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                <Text style={{ color:'#fbbf24', fontSize:13, fontWeight:'800' }}>⏳ YEDEK LİSTE</Text>
                                            </View>
                                            {waitList.map((r, i) => (
                                                <View key={r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:5, borderBottomWidth: i < waitList.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40', backgroundColor: r.cancelRequested ? '#f59e0b08' : 'transparent', borderRadius:6 }}>
                                                    <View style={{ backgroundColor:'#f59e0b20', borderRadius:4, paddingHorizontal:2, paddingVertical:0, marginRight:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                        <Text style={{ color:'#fbbf24', fontSize:9, fontWeight:'800' }}>YDK {i+1}</Text>
                                                    </View>
                                                    <View style={{ flex:1 }}>
                                                        <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.user?.fullName || r.user?.username}</Text>
                                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                        {r.cancelRequested && <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'700', marginTop:2 }}>⚠️ İptal talep etti</Text>}
                                                    </View>
                                                    {r.cancelRequested && (
                                                        <View style={{ flexDirection:'row', gap:3 }}>
                                                            <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Onayla', `${r.user?.fullName || r.user?.username} turnuvadan çıkarılacak. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Onayla', style:'destructive', onPress: () => approveCancelRequest(r.userId, true) }])} style={{ backgroundColor:'#16a34a30', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#16a34a50' }}>
                                                                <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Onayla</Text>
                                                            </TouchableOpacity>
                                                            <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Reddet', `${r.user?.fullName || r.user?.username} turnuvada kalmaya devam edecek. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Reddet', style:'destructive', onPress: () => approveCancelRequest(r.userId, false) }])} style={{ backgroundColor:'#dc262630', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#dc262650' }}>
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
                                <View style={{ flexDirection:'row', gap:3, marginBottom:12 }}>
                                    <TextInput
                                        style={{ flex:1, backgroundColor:'#0f172a', borderRadius:10, borderWidth:1, borderColor:'#3b82f640', color:'#fff', fontSize:13, paddingHorizontal:9, paddingVertical:5 }}
                                        placeholder="İsim gir (manuel ekle)"
                                        placeholderTextColor="#475569"
                                        value={manualName}
                                        onChangeText={setManualName}
                                        returnKeyType="done"
                                        onSubmitEditing={addManualParticipant}
                                    />
                                    <TouchableOpacity onPress={addManualParticipant} disabled={addingManual || !manualName.trim()} style={{ backgroundColor: manualName.trim() ? '#3b82f6' : '#1e293b', borderRadius:10, paddingHorizontal:11, justifyContent:'center', borderWidth:1, borderColor:'#3b82f640' }}>
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
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginVertical:8 }}>
                                                <View style={{ flex:1, height:1, backgroundColor: colors.border }} />
                                                <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'700' }}>⏳ Bekleyen Başvurular</Text>
                                                <View style={{ flex:1, height:1, backgroundColor: colors.border }} />
                                            </View>
                                        )}
                                        <View style={{ flexDirection:'row', alignItems:'center', paddingVertical:5, borderBottomWidth: i < listRows.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40', backgroundColor: r.cancelRequested ? '#f59e0b08' : 'transparent', borderRadius:6 }}>
                                            {posLabel ? (
                                                <View style={{ backgroundColor: posLabel.bg, borderRadius:4, paddingHorizontal:2, paddingVertical:0, marginRight:8, borderWidth:1, borderColor: posLabel.border }}>
                                                    <Text style={{ color: posLabel.color, fontSize:9, fontWeight:'800' }}>{posLabel.text}</Text>
                                                </View>
                                            ) : (
                                                <Text style={{ color: colors.textMuted, fontSize:11, width:22 }}>{i+1}.</Text>
                                            )}
                                            <View style={{ flex:1 }}>
                                                <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.manualName || r.user?.fullName || r.user?.username}</Text>
                                                {r.manualName
                                                    ? <Text style={{ color:'#3b82f6', fontSize:10, fontWeight:'700' }}>✏️ Manuel</Text>
                                                    : <Text style={{ color: colors.textMuted, fontSize:11 }}>{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                }
                                                {r.cancelRequested && <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'700', marginTop:2 }}>⚠️ İptal talep etti (24s kuralı)</Text>}
                                            </View>
                                            <View style={{ alignItems:'flex-end', gap:3 }}>
                                                {!r.cancelRequested && (
                                                    <View style={{ backgroundColor: r.status === 'ACCEPTED' ? '#16a34a30' : r.status === 'REJECTED' ? '#dc262630' : '#a855f720', borderRadius:6, paddingHorizontal:5, paddingVertical:0 }}>
                                                        <Text style={{ color: r.status === 'ACCEPTED' ? '#4ade80' : r.status === 'REJECTED' ? '#f87171' : '#c084fc', fontSize:10, fontWeight:'700' }}>
                                                            {r.status === 'ACCEPTED' ? '✅ Kabul' : r.status === 'REJECTED' ? '❌ Red' : r.userId === myId ? '⏳ Yönetici onayı bekleniyor' : '⏳ Bekliyor'}
                                                        </Text>
                                                    </View>
                                                )}
                                                {r.cancelRequested && (
                                                    <View style={{ flexDirection:'row', gap:3 }}>
                                                        <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Onayla', `${r.user?.fullName || r.user?.username} turnuvadan çıkarılacak. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Onayla', style:'destructive', onPress: () => approveCancelRequest(r.userId, true) }])} style={{ backgroundColor:'#16a34a30', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#16a34a50' }}>
                                                            <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Onayla</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => Alert.alert('İptal Talebini Reddet', `${r.user?.fullName || r.user?.username} turnuvada kalmaya devam edecek. Emin misiniz?`, [{ text:'Vazgeç', style:'cancel' }, { text:'Reddet', style:'destructive', onPress: () => approveCancelRequest(r.userId, false) }])} style={{ backgroundColor:'#dc262630', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#dc262650' }}>
                                                            <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Reddet</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                                {r.status === 'PENDING' && !r.cancelRequested && (
                                                    <View style={{ flexDirection:'row', gap:3 }}>
                                                        <TouchableOpacity onPress={() => updateRequest(r.userId, 'ACCEPTED')} style={{ backgroundColor:'#16a34a30', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#16a34a50' }}>
                                                            <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Kabul</Text>
                                                        </TouchableOpacity>
                                                        <TouchableOpacity onPress={() => { setRejectReason(''); setRejectTarget({ userId: r.userId, name: r.user?.fullName || r.user?.username }); }} style={{ backgroundColor:'#dc262630', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#dc262650' }}>
                                                            <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Red</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                                {r.status === 'ACCEPTED' && !r.cancelRequested && (
                                                    <TouchableOpacity onPress={() => r.manualName ? removeManualParticipant(r.id) : removeParticipant(r.userId)} style={{ backgroundColor:'#dc262615', borderRadius:6, paddingHorizontal:3, paddingVertical:0, borderWidth:1, borderColor:'#dc262640' }}>
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
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:8 }}>
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
                                                <View style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingVertical:3, paddingHorizontal:7, marginTop:10, marginBottom:8, borderWidth:1, borderColor:'#f59e0b40' }}>
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
                                            <View style={{ backgroundColor:'#a855f715', borderRadius:10, padding:9, marginBottom:12, borderWidth:1, borderColor:'#a855f740', flexDirection:'row', alignItems:'center', gap:3 }}>
                                                <Text style={{ fontSize:20 }}>⏳</Text>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#c084fc', fontSize:13, fontWeight:'800' }}>Başvurunuz alındı</Text>
                                                    <Text style={{ color:'#c084fc', fontSize:11, marginTop:2, opacity:0.85 }}>Turnuva yöneticisinin onayı bekleniyor. Onaylandığında bildirim alacaksınız.</Text>
                                                </View>
                                            </View>
                                        )}
                                        <View style={{ backgroundColor:'#16a34a20', borderRadius:8, paddingVertical:3, paddingHorizontal:7, marginBottom:8, borderWidth:1, borderColor:'#16a34a40' }}>
                                            <Text style={{ color:'#4ade80', fontSize:13, fontWeight:'800' }}>✅ AS LİSTE</Text>
                                        </View>
                                        {mainList.length === 0
                                            ? <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', paddingVertical:3 }}>—</Text>
                                            : mainList.map((r, i) => (
                                            <View key={r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:5, borderBottomWidth: i < mainList.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40' }}>
                                                <View style={{ backgroundColor:'#16a34a20', borderRadius:4, paddingHorizontal:2, paddingVertical:0, marginRight:8, borderWidth:1, borderColor:'#16a34a40' }}>
                                                    <Text style={{ color:'#4ade80', fontSize:9, fontWeight:'800' }}>AS {i+1}</Text>
                                                </View>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.user?.fullName || r.user?.username}</Text>
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                </View>
                                            </View>
                                        ))}
                                        {waitList.length > 0 && <>
                                            <View style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingVertical:3, paddingHorizontal:7, marginTop:14, marginBottom:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                <Text style={{ color:'#fbbf24', fontSize:13, fontWeight:'800' }}>⏳ YEDEK LİSTE</Text>
                                            </View>
                                            {waitList.map((r, i) => (
                                                <View key={r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:5, borderBottomWidth: i < waitList.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40' }}>
                                                    <View style={{ backgroundColor:'#f59e0b20', borderRadius:4, paddingHorizontal:2, paddingVertical:0, marginRight:8, borderWidth:1, borderColor:'#f59e0b40' }}>
                                                        <Text style={{ color:'#fbbf24', fontSize:9, fontWeight:'800' }}>YDK {i+1}</Text>
                                                    </View>
                                                    <View style={{ flex:1 }}>
                                                        <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.user?.fullName || r.user?.username}</Text>
                                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
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
                                    <View style={{ backgroundColor:'#a855f715', borderRadius:10, padding:9, marginBottom:12, borderWidth:1, borderColor:'#a855f740', flexDirection:'row', alignItems:'center', gap:3 }}>
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
                                                        <View key={r.id || r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:3, borderBottomWidth: i < pending.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40' }}>
                                                            <View style={{ flex:1 }}>
                                                                <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }} numberOfLines={1}>{r.user?.fullName || r.user?.username}</Text>
                                                                <Text style={{ color: colors.textMuted, fontSize:10 }} numberOfLines={1}>{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
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
                                                <View style={{ backgroundColor:'#f59e0b20', borderRadius:8, paddingVertical:3, paddingHorizontal:7, marginTop:10, marginBottom:8, borderWidth:1, borderColor:'#f59e0b40' }}>
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
                                        <View key={r.userId} style={{ flexDirection:'row', alignItems:'center', paddingVertical:5, borderBottomWidth: i < participants.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40' }}>
                                            <View style={{ backgroundColor: labelBg, borderRadius:4, paddingHorizontal:2, paddingVertical:0, marginRight:8, borderWidth:1, borderColor: labelBorder }}>
                                                <Text style={{ color: labelColor, fontSize:9, fontWeight:'800' }}>{label}</Text>
                                            </View>
                                            <View style={{ flex:1 }}>
                                                <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{r.user?.fullName || r.user?.username}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize:11 }}>{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(r.user.interests[0].skillRating))} ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
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
                            <View style={{ flex:1, backgroundColor:'#00000080', justifyContent:'center', alignItems:'center', padding:21 }}>
                                <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ width:'100%' }}>
                                    <View style={{ backgroundColor:'#1e293b', borderRadius:16, padding:17, borderWidth:1, borderColor:'#dc262650' }}>
                                        <Text style={{ color:'#f87171', fontSize:15, fontWeight:'800', marginBottom:4 }}>❌ Başvuruyu Reddet</Text>
                                        <Text style={{ color:'#94a3b8', fontSize:12, marginBottom:14 }}>{rejectTarget?.name} adlı oyuncunun başvurusu reddedilecek.</Text>
                                        <Text style={{ color:'#94a3b8', fontSize:12, marginBottom:6 }}>Red nedeni (opsiyonel):</Text>
                                        <TextInput
                                            style={{ backgroundColor:'#0f172a', borderRadius:10, borderWidth:1, borderColor:'#dc262650', color:'#fff', fontSize:13, padding:9, minHeight:60, textAlignVertical:'top' }}
                                            placeholder="Neden reddediyorsunuz? (isteğe bağlı)"
                                            placeholderTextColor="#475569"
                                            value={rejectReason}
                                            onChangeText={setRejectReason}
                                            multiline
                                            maxLength={200}
                                        />
                                        <View style={{ flexDirection:'row', gap:3, marginTop:16 }}>
                                            <TouchableOpacity onPress={() => setRejectTarget(null)} style={{ flex:1, backgroundColor:'#334155', borderRadius:10, paddingVertical:8, alignItems:'center' }}>
                                                <Text style={{ color:'#94a3b8', fontSize:13, fontWeight:'700' }}>Vazgeç</Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity onPress={async () => { const t2 = rejectTarget; setRejectTarget(null); await updateRequest(t2.userId, 'REJECTED', rejectReason.trim() || undefined); }} style={{ flex:1, backgroundColor:'#dc262640', borderRadius:10, paddingVertical:8, alignItems:'center', borderWidth:1, borderColor:'#dc262660' }}>
                                                <Text style={{ color:'#f87171', fontSize:13, fontWeight:'800' }}>Reddet</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                </KeyboardAvoidingView>
                            </View>
                        </Modal>

                        {/* Partner davet picker (nested) — Çiftler Rekabetçi */}
                        <Modal visible={showInvitePicker} animationType="fade" transparent onRequestClose={() => setShowInvitePicker(false)}>
                            <View style={{ flex:1, backgroundColor:'#00000080', justifyContent:'center', alignItems:'center', padding:21 }}>
                                <View style={{ backgroundColor:'#1e293b', borderRadius:16, padding:17, borderWidth:1, borderColor: cfg.color+'40', width:'100%', maxHeight:'70%' }}>
                                    <Text style={{ color:'#fff', fontSize:15, fontWeight:'800', marginBottom:12 }}>👥 Partner Davet Et</Text>
                                    <ScrollView>
                                        {inviteCandidates.length === 0 ? (
                                            <Text style={{ color: colors.textMuted, fontSize:13, textAlign:'center', paddingVertical:13 }}>Davet edilebilecek bireysel başvuran yok</Text>
                                        ) : inviteCandidates.map(c => (
                                            <TouchableOpacity key={c.userId} onPress={() => setMyTournamentPartner(c.userId)} disabled={partnerActionLoading} style={{ flexDirection:'row', alignItems:'center', gap:3, paddingVertical:7, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}>
                                                <Avatar name={c.user?.username} avatar={c.user?.avatar} size={moderateScale(34)} color={cfg.color} />
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{c.user?.fullName || c.user?.username}</Text>
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>{c.user?.username}{c.user?.interests?.[0]?.skillRating != null ? `  ${starEmoji(Number(c.user.interests[0].skillRating))} ${Number(c.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                </View>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                    <TouchableOpacity onPress={() => setShowInvitePicker(false)} style={{ marginTop:14, backgroundColor:'#334155', borderRadius:10, paddingVertical:8, alignItems:'center' }}>
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
                        <View style={{ backgroundColor:'#0f172a', borderTopLeftRadius:20, borderTopRightRadius:20, padding:13, height:520 }}>
                            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                                <Text style={{ color:'#fff', fontSize:15, fontWeight:'900' }}>💬 Turnuva Sohbeti</Text>
                                <View style={{ flexDirection:'row', alignItems:'center', gap:3 }}>
                                    <TouchableOpacity onPress={toggleChatNotify} disabled={togglingChatNotify}>
                                        <Text style={{ fontSize:20, opacity: togglingChatNotify ? 0.5 : 1 }}>{chatNotifyEnabled ? '🔔' : '🔕'}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={() => setShowChatModal(false)}><Text style={{ color: colors.textMuted, fontSize:20 }}>✕</Text></TouchableOpacity>
                                </View>
                            </View>
                            {loadingChat ? (
                                <ActivityIndicator color="#4ade80" style={{ marginTop:30 }} />
                            ) : (
                                <ScrollView style={{ flex:1 }} contentContainerStyle={{ paddingBottom:7 }}>
                                    {chatMessages.length === 0
                                        ? <Text style={{ color: colors.textMuted, fontSize:12, textAlign:'center', marginTop:30 }}>Henüz mesaj yok</Text>
                                        : chatMessages.map(m => {
                                            const mine = (m.sender?.id || m.senderId) === myId;
                                            return (
                                                <View key={m.id} style={{ marginBottom:10, alignItems: mine ? 'flex-end' : 'flex-start' }}>
                                                    {!mine && <Text style={{ color: colors.textMuted, fontSize:10, marginBottom:2 }}>{m.sender?.fullName || m.sender?.username}</Text>}
                                                    <View style={{ backgroundColor: mine ? '#16a34a30' : '#1e293b', borderRadius:10, paddingHorizontal:7, paddingVertical:4, maxWidth:'80%', borderWidth:1, borderColor: mine ? '#16a34a50' : colors.border }}>
                                                        <Text style={{ color:'#fff', fontSize:13 }}>{m.content}</Text>
                                                    </View>
                                                </View>
                                            );
                                        })
                                    }
                                </ScrollView>
                            )}
                            <View style={{ flexDirection:'row', gap:3, marginTop:8, alignItems:'flex-end' }}>
                                <TextInput
                                    style={{ flex:1, backgroundColor:'#1e293b', color:'#fff', borderRadius:10, paddingHorizontal:9, paddingVertical:6, borderWidth:1, borderColor: colors.border, fontSize:13, maxHeight:80 }}
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
                                    style={{ backgroundColor:'#16a34a', borderRadius:10, paddingHorizontal:11, paddingVertical:7, opacity: (sendingChat || !chatInput.trim()) ? 0.5 : 1 }}>
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
                <View style={{ backgroundColor:'#1e293b', borderRadius:8, padding:7, marginTop:6, borderWidth:1, borderColor: colors.border }}>
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
                <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:17, paddingTop:17, paddingBottom:37, maxHeight:'80%' }}>
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
                            <TouchableOpacity key={u.id} onPress={() => choosePartner(u)} style={{ flexDirection:'row', alignItems:'center', gap:3, paddingVertical:7, borderBottomWidth:1, borderBottomColor: colors.border+'40' }}>
                                <Avatar name={u.username} avatar={u.avatar} size={36} color={cfg.color} />
                                <View style={{ flex:1 }}>
                                    <Text style={{ color:'#fff', fontWeight:'700', fontSize:13 }}>{u.interests?.[0]?.alias || u.fullName || u.username}</Text>
                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                        {u.username}{u.interests?.[0]?.skillRating != null ? `  ${Number(u.interests[0].skillRating).toFixed(2)} ★` : ''}
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
    box:         { backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:17, paddingTop:17, paddingBottom:45 },
    header:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
    title:       { color:'#fff', fontSize:17, fontWeight:'900' },
    close:       { color: colors.textMuted, fontSize:22 },
    desc:        { color:'#fff', fontSize:14, fontWeight:'700', marginBottom:8 },
    sub:         { color: colors.textSecondary, fontSize:13, lineHeight:19, marginBottom:24 },
    btn:         { backgroundColor: colors.purple, borderRadius:14, paddingVertical:12, alignItems:'center' },
    btnText:     { color:'#fff', fontSize:15, fontWeight:'800' },
    statusBox:   { borderWidth:1, borderColor: colors.border, borderRadius:16, padding:17, alignItems:'center', marginBottom:24, gap:3 },
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
    const ti = { paddingVertical:4, paddingHorizontal:7, fontSize:12, marginBottom:8 };

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
            : f.selectedCourt ? [f.selectedCourt.venueName, f.selectedCourt.name].filter(Boolean).join(' ') : (f.showManualCourt ? f.manualCourtName : null) || f.courtSearchText || null;

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
                                        style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, f.scope === sc && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
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
                                <View style={{ backgroundColor: cfg.color + '15', borderRadius:8, padding:5, marginBottom:8, borderWidth:1, borderColor: cfg.color + '40' }}>
                                    <Text style={{ color: cfg.color, fontSize:12, fontWeight:'700' }}>{t.tournWorldAuto}</Text>
                                </View>
                            )}

                            {/* Court */}
                            <Text style={s.fieldLabel}>{t.tournCourtLabel}</Text>
                            <View style={[s.chipRow, { marginBottom:8 }]}>
                                <TouchableOpacity
                                    style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, !f.courtDecidedByPlayers && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                    onPress={() => set('courtDecidedByPlayers', false)}>
                                    <Text style={[s.chipText, !f.courtDecidedByPlayers && { color: cfg.color, fontWeight:'800' }]}>{t.tournCourtSpecific}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, f.courtDecidedByPlayers && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                    onPress={() => { set('courtDecidedByPlayers', true); if (f.paymentMethod === 'CASH') set('paymentMethod', ''); }}>
                                    <Text style={[s.chipText, f.courtDecidedByPlayers && { color: cfg.color, fontWeight:'800' }]}>{t.tournCourtPlayersDecide}</Text>
                                </TouchableOpacity>
                            </View>
                            {!f.courtDecidedByPlayers && (
                                <>
                                    <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:6 }}>
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
                                        <View style={{ backgroundColor: colors.surface2, borderRadius:8, padding:7, marginBottom:8, borderWidth:1, borderColor: colors.border }}>
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
                                                        style={[s.chip, { paddingVertical:2, paddingHorizontal:5 }, f.surface === sf.id && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
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
                                            style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, !f.isIndoor && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('isIndoor', false)}>
                                            <Text style={[s.chipText, !f.isIndoor && { color: cfg.color, fontWeight:'800' }]}>{t.outdoor}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, f.isIndoor && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('isIndoor', true)}>
                                            <Text style={[s.chipText, f.isIndoor && { color: cfg.color, fontWeight:'800' }]}>{t.indoor}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </>
                            )}

                            {/* Son Başvuru | Cinsiyet | Set — tek satır */}
                            <View style={{ flexDirection:'row', gap:3, alignItems:'flex-end', marginBottom:8 }}>
                                {/* Son Başvuru */}
                                <View style={{ width:110 }}>
                                    <Text style={s.fieldLabel}>{t.tournRegEndLabel} *</Text>
                                    <View style={{ flexDirection:'row', gap:3 }}>
                                        <TouchableOpacity
                                            style={[s.triBtn, f.regEndDate && s.triBtnFilled, { flex:1, paddingVertical:3, paddingHorizontal:1 }]}
                                            onPress={() => { setTimeField(null); setDpField('end'); }}>
                                            <Text style={[s.triLabel, { fontSize:8 }]}>{t.dateLabel}</Text>
                                            <Text style={[s.triValue, !f.regEndDate && s.triPlaceholder, { fontSize:10 }]} numberOfLines={1}>
                                                {f.regEndDate ? `${String(f.regEndDate.getDate()).padStart(2,'0')}/${String(f.regEndDate.getMonth()+1).padStart(2,'0')}` : '—'}
                                            </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.triBtn, f.regEndTime && s.triBtnFilled, { paddingVertical:3, paddingHorizontal:2 }]}
                                            onPress={() => { setDpField(null); setTimeField('end'); }}>
                                            <Text style={[s.triLabel, { fontSize:8 }]}>{t.timeLabel}</Text>
                                            <Text style={[s.triValue, !f.regEndTime && s.triPlaceholder, { fontSize:10 }]}>{f.regEndTime || '—'}</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                                {/* Cinsiyet */}
                                <View style={{ flex:1 }}>
                                    <Text style={s.fieldLabel}>{t.tournGenderLabel}</Text>
                                    <View style={{ flexDirection:'row', gap:3 }}>
                                        {TOURN_GENDERS.map(g => (
                                            <TouchableOpacity key={g}
                                                style={[s.chip, { flex:1, paddingVertical:2, paddingHorizontal:0, justifyContent:'center', alignItems:'center' }, f.genderType === g && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
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
                                        style={[s.fieldInput, ti, { marginBottom:0, textAlign:'center', paddingHorizontal:1 }]}
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
                            <View style={{ flexDirection:'row', gap:3, marginBottom:8 }}>
                                {[
                                    { field:'evStart', label: t.tournEventStartLabel, dateVal: f.eventStartDate, timeVal: f.eventStartTime },
                                    { field:'evEnd',   label: t.tournEventEndLabel,   dateVal: f.eventEndDate,   timeVal: f.eventEndTime   },
                                ].map(({ field, label, dateVal, timeVal }) => (
                                    <View key={field} style={{ flex:1 }}>
                                        <Text style={s.fieldLabel}>{label}</Text>
                                        <View style={{ flexDirection:'row', gap:3 }}>
                                            <TouchableOpacity
                                                style={[s.triBtn, dateVal && s.triBtnFilled, { flex:1, paddingVertical:4, paddingHorizontal:3 }]}
                                                onPress={() => { setTimeField(null); setDpField(field); }}>
                                                <Text style={[s.triLabel, { fontSize:9 }]}>{t.dateLabel}</Text>
                                                <Text style={[s.triValue, !dateVal && s.triPlaceholder, { fontSize:11 }]} numberOfLines={1}>
                                                    {dateVal ? `${String(dateVal.getDate()).padStart(2,'0')}/${String(dateVal.getMonth()+1).padStart(2,'0')}/${dateVal.getFullYear()}` : '—'}
                                                </Text>
                                            </TouchableOpacity>
                                            <TouchableOpacity
                                                style={[s.triBtn, timeVal && s.triBtnFilled, { paddingVertical:4, paddingHorizontal:5 }]}
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
                                    style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, !f.isPaid && { backgroundColor: '#16a34a30', borderColor: '#16a34a' }]}
                                    onPress={() => { set('isPaid', false); if (f.feeType === 'INCLUDED') set('feeType', 'SHARED'); }}>
                                    <Text style={[s.chipText, !f.isPaid && { color: '#4ade80', fontWeight:'800' }]}>{t.tournFreeOption}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, f.isPaid && { backgroundColor: '#d9770630', borderColor: '#d97706' }]}
                                    onPress={() => { set('isPaid', true); if (f.feeType === 'SPONSORED') set('feeType', 'SHARED'); }}>
                                    <Text style={[s.chipText, f.isPaid && { color: '#fbbf24', fontWeight:'800' }]}>{t.tournPaidOption}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ backgroundColor: f.isPaid ? '#d9770615' : '#16a34a15', borderRadius:8, padding:5, marginBottom:8, borderWidth:1, borderColor: f.isPaid ? '#d9770640' : '#16a34a40' }}>
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
                                        style={[s.chip, { flex:1, paddingVertical:2, paddingHorizontal:7 }, f.feeType === ft.id && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
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
                                    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor: colors.surface2, borderRadius:10, padding:7, borderWidth:1, borderColor: colors.border }}>
                                        <View style={{ flexDirection:'row', alignItems:'center', gap:3 }}>
                                            <View style={{ width:18, height:18, borderRadius:9, borderWidth:2, borderColor: colors.border }} />
                                            <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>🌐 Online Ödeme</Text>
                                        </View>
                                        <View style={{ backgroundColor:'#334155', borderRadius:6, paddingHorizontal:3, paddingVertical:0 }}>
                                            <Text style={{ color:'#94a3b8', fontSize:10, fontWeight:'700' }}>Yakında</Text>
                                        </View>
                                    </View>
                                </View>
                                {/* EFT */}
                                <TouchableOpacity
                                    style={{ flexDirection:'row', alignItems:'center', gap:3, backgroundColor: f.paymentMethod==='EFT' ? '#2563eb15' : colors.surface2, borderRadius:10, padding:7, marginBottom:6, borderWidth:1, borderColor: f.paymentMethod==='EFT' ? '#2563eb' : colors.border }}
                                    onPress={() => set('paymentMethod', 'EFT')}>
                                    <View style={{ width:18, height:18, borderRadius:9, borderWidth:2, borderColor: f.paymentMethod==='EFT' ? '#60a5fa' : colors.border, backgroundColor: f.paymentMethod==='EFT' ? '#60a5fa' : 'transparent', alignItems:'center', justifyContent:'center' }}>
                                        {f.paymentMethod==='EFT' && <View style={{ width:8, height:8, borderRadius:4, backgroundColor:'#1e40af' }} />}
                                    </View>
                                    <Text style={{ color: f.paymentMethod==='EFT' ? '#60a5fa' : '#fff', fontSize:12, fontWeight:'700' }}>🏦 EFT ile Ödeme</Text>
                                </TouchableOpacity>
                                {/* Cash — only when a specific court is chosen */}
                                {!f.courtDecidedByPlayers && (
                                <TouchableOpacity
                                    style={{ flexDirection:'row', alignItems:'center', gap:3, backgroundColor: f.paymentMethod==='CASH' ? '#16a34a15' : colors.surface2, borderRadius:10, padding:7, marginBottom:8, borderWidth:1, borderColor: f.paymentMethod==='CASH' ? '#16a34a' : colors.border }}
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
                                        style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, f.type === tp && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                        onPress={() => set('type', tp)}>
                                        <Text style={[s.chipText, f.type === tp && { color: cfg.color, fontWeight:'800' }]}>
                                            {TOURN_TYPE_LABELS(t)[tp]}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>

                            {/* Bireysel Rekabetçi kuralları */}
                            {f.type === '1' && (
                                <View style={{ backgroundColor:'#1e293b', borderRadius:8, padding:7, marginBottom:10, borderWidth:1, borderColor: cfg.color + '40' }}>
                                    <Text style={{ color: cfg.color, fontSize:11, fontWeight:'900', marginBottom:8 }}>📋 Bireysel Rekabetçi Kuralları</Text>
                                    {[
                                        'Oyuncular bireysel katılır. Play-off öncesi her tur bittikten sonra güncel ELO\'ya göre en yakın, daha önce eşleşmemiş rakiplerle yeni tur oluşturulur.',
                                        'Play-off\'larda da ELO puanı en yakın oyuncular eşleşir.',
                                        'Her oyuncunun 1 joker hakkı vardır. Haftada 1 maç zorunludur. Joker kullanılan maça +7 gün ek süre tanınır; süre dolmasına rağmen maç bitmezse joker kullanan oyuncu hükmen yenilir.',
                                        'İki oyuncu da aynı maç için joker kullanır ya da karşılıklı joker yaparsa +7 +7 değil sadece +7 olarak uzar; sadece iki taraf da karşılıklı yaptığı için joker hakları tükenmez.',
                                        'Aynı puanlı oyuncular play-off\'a geldiğinde averajı (galibiyet oyunu / toplam oyun) yüksek olan önce alınır.',
                                        'Play-off kontenjanı sınırında puan, averaj, set oranı ve oyun oranının tamamı eşit olan oyuncular varsa, kura çekilmeden önce bir tur daha eklenir; eşitliğe karışan oyuncular henüz oynamadıkları, puanı en yakın rakiplerle eşleştirilir. Eşitlik bozulana kadar bu tekrarlanır; kura yalnızca uygun eşleşme kalmadığında son çare olarak kullanılır.',
                                    ].map((kural, i) => (
                                        <View key={i} style={{ flexDirection:'row', gap:3, marginBottom:6 }}>
                                            <Text style={{ color: cfg.color, fontSize:11, fontWeight:'900', minWidth:16 }}>{i + 1}.</Text>
                                            <Text style={{ color:'#cbd5e1', fontSize:11, lineHeight:17, flex:1 }}>{kural}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}

                            {/* Çiftler Rekabetçi kuralları */}
                            {f.type === '2' && (
                                <View style={{ backgroundColor:'#1e293b', borderRadius:8, padding:7, marginBottom:10, borderWidth:1, borderColor: cfg.color + '40' }}>
                                    <Text style={{ color: cfg.color, fontSize:11, fontWeight:'900', marginBottom:8 }}>📋 Çiftler Rekabetçi Kuralları</Text>
                                    {[
                                        'Oyuncular turnuvaya çift olarak (takım halinde) katılabilir ya da bireysel başvurabilir — bireysel başvuranlar turnuva başlarken ELO puanı birbirine en yakın olanlarla eşleştirilerek takım yapılır. Tek kalan en düşük ELO puanlı oyuncu turnuvaya katılım sağlayamaz.',
                                        'Karışık (mix) turnuvalarda bireysel katılımcılardan sistem aynı takımda iki kadın oluşturacak şekilde eşleşme yapmaz.',
                                        'Takımların ELO puan ortalaması alınır ve play-off\'lara kadar kaç maç seçildiyse, her takım diğer her takımla en fazla bir kez eşleşecek şekilde, ortalama puanı en yakın olandan başlanarak her turda rakip eşleşmesi sağlanır.',
                                        'Her takımın 1 kez joker hakkı vardır. Haftada bir maç zorunluluğu olup joker hakkı kullanılırsa takıma +7 gün ek süre tanınır. Joker kullanan takım bu sürede maçı bitirmek için gerekli tavizi vermekle yükümlüdür; bitiremezse joker kullanan takım hükmen yenilir.',
                                        'Jokeri kullanan takımın rakibi de aynı maç için karşılıklı joker yaparsa joker hakkı tükenmez, sadece 7 günlük süre bir kez eklenmiş olur (hava şartları, kort temin edilememesi vb. durumlar için).',
                                        'Play-off öncesi lig tablosunda puanı eşit olan takımlar varsa averaj (oynanan oyun oranı) dikkate alınır.',
                                        'Bir takım kazandığında/kaybettiğinde iki oyuncu da bireysel olarak ELO puanı kazanır/kaybeder — miktar, diğer rekabetçi maçlarla aynı puan tablosu kullanılarak iki takımın ortalama ELO farkına göre belirlenir.',
                                        'Play-off kontenjanı sınırında puan, averaj, set oranı ve oyun oranının tamamı eşit olan takımlar varsa, kura çekilmeden önce bir tur daha eklenir; eşitliğe karışan takımlar henüz oynamadıkları, ortalama ELO\'su en yakın rakiplerle eşleştirilir. Eşitlik bozulana kadar bu tekrarlanır; kura yalnızca uygun eşleşme kalmadığında son çare olarak kullanılır.',
                                    ].map((kural, i) => (
                                        <View key={i} style={{ flexDirection:'row', gap:3, marginBottom:6 }}>
                                            <Text style={{ color: cfg.color, fontSize:11, fontWeight:'900', minWidth:16 }}>{i + 1}.</Text>
                                            <Text style={{ color:'#cbd5e1', fontSize:11, lineHeight:17, flex:1 }}>{kural}</Text>
                                        </View>
                                    ))}
                                </View>
                            )}


                            {/* Gender | Sets — side by side */}
                            <View style={{ flexDirection:'row', gap:3, alignItems:'flex-end', marginBottom:8 }}>
                                <View style={{ flex:1 }}>
                                    <Text style={s.fieldLabel}>{t.tournGenderLabel}</Text>
                                    <View style={{ flexDirection:'row', gap:3 }}>
                                        {TOURN_GENDERS.map(g => (
                                            <TouchableOpacity key={g}
                                                style={[s.chip, { flex:1, paddingVertical:2, paddingHorizontal:1, justifyContent:'center', alignItems:'center' }, f.genderType === g && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
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
                                            style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, f.advantageScoring === true && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('advantageScoring', true)}>
                                            <Text style={[s.chipText, f.advantageScoring === true && { color: cfg.color, fontWeight:'800' }]}>{t.tournAdvantage}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, f.advantageScoring === false && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('advantageScoring', false)}>
                                            <Text style={[s.chipText, f.advantageScoring === false && { color: cfg.color, fontWeight:'800' }]}>{t.tournDeciding}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.chip, { paddingVertical:2, paddingHorizontal:7 }, f.advantageScoring === null && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('advantageScoring', null)}>
                                            <Text style={[s.chipText, f.advantageScoring === null && { color: cfg.color, fontWeight:'800' }]}>{t.tournFreeScoring}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={{ flexDirection:'row', gap:3 }}>
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
                            <View style={{ flexDirection:'row', gap:3, marginBottom:8, marginTop:4 }}>
                                <View style={{ flex:1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>{t.tournMinPlayers}</Text>
                                    <TextInput style={[s.fieldInput, ti, { paddingVertical:3, textAlign:'center', fontSize:12 }]} value={f.minPlayers}
                                        onChangeText={v => set('minPlayers', v.replace(/[^0-9]/g,''))}
                                        placeholder="2" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                                </View>
                                <View style={{ flex:1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>{t.tournMaxPlayers}</Text>
                                    <TextInput style={[s.fieldInput, ti, { paddingVertical:3, textAlign:'center', fontSize:12 }]} value={f.maxPlayers}
                                        onChangeText={v => set('maxPlayers', v.replace(/[^0-9]/g,''))}
                                        placeholder="32" placeholderTextColor={colors.textMuted} keyboardType="numeric" />
                                </View>
                                <TouchableOpacity onPress={() => setRatingField('min')} style={{ flex:1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>⭐ Alt Derece</Text>
                                    <View style={{ backgroundColor: colors.surface2, borderRadius:8, paddingVertical:4, alignItems:'center', borderWidth:1, borderColor: f.minRating ? cfg.color : colors.border }}>
                                        <Text style={{ color: f.minRating ? cfg.color : colors.textSecondary, fontSize:12, fontWeight:'800' }}>
                                            {f.minRating ? `${f.minRating}★` : 'Serbest'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setRatingField('max')} style={{ flex:1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>⭐ Üst Derece</Text>
                                    <View style={{ backgroundColor: colors.surface2, borderRadius:8, paddingVertical:4, alignItems:'center', borderWidth:1, borderColor: f.maxRating ? cfg.color : colors.border }}>
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

// ─── Puan Bilgilendirme Modali ────────────────────────────────────────────────

const RATING_DOM = [
    { range:'0.03 ve altı',  lowWin:'0.03',  lowLose:'0.02',   highWin:'0.02',   highLose:'0.03'  },
    { range:'0.03 – 0.05',   lowWin:'0.04',  lowLose:'0.0175', highWin:'0.0175', highLose:'0.04'  },
    { range:'0.05 – 0.10',   lowWin:'0.05',  lowLose:'0.03',   highWin:'0.03',   highLose:'0.05'  },
    { range:'0.10 – 0.25',   lowWin:'0.10',  lowLose:'0.05',   highWin:'0.05',   highLose:'0.10'  },
    { range:'0.25 – 0.50',   lowWin:'0.25',  lowLose:'0.04',   highWin:'0.04',   highLose:'0.25'  },
    { range:'0.50 – 1',      lowWin:'0.50',  lowLose:'0.03',   highWin:'0.03',   highLose:'0.50'  },
    { range:'1 – 1.5',       lowWin:'1.00',  lowLose:'0.02',   highWin:'0.02',   highLose:'1.00'  },
    { range:'1.5 – 2',       lowWin:'1.50',  lowLose:'0.01',   highWin:'0.01',   highLose:'1.50'  },
    { range:'2.00+',         lowWin:'2.00',  lowLose:'0.005',  highWin:'0.005',  highLose:'2.00'  },
];
const RATING_REC = [
    { range:'0.03 ve altı',  lowWin:'0.03',  lowLose:'0.0175', highWin:'0.0175', highLose:'0.03'  },
    { range:'0.03 – 0.05',   lowWin:'0.02',  lowLose:'0.0125', highWin:'0.0125', highLose:'0.02'  },
    { range:'0.05 – 0.10',   lowWin:'0.035', lowLose:'0.015',  highWin:'0.015',  highLose:'0.035' },
    { range:'0.10 – 0.25',   lowWin:'0.06',  lowLose:'0.03',   highWin:'0.03',   highLose:'0.06'  },
    { range:'0.25 – 0.50',   lowWin:'0.15',  lowLose:'0.025',  highWin:'0.025',  highLose:'0.15'  },
    { range:'0.50 – 1',      lowWin:'0.40',  lowLose:'0.02',   highWin:'0.02',   highLose:'0.40'  },
    { range:'1 – 1.5',       lowWin:'0.90',  lowLose:'0.015',  highWin:'0.015',  highLose:'0.90'  },
    { range:'1.5 – 2',       lowWin:'1.30',  lowLose:'0.01',   highWin:'0.01',   highLose:'1.30'  },
    { range:'2.00+',         lowWin:'1.80',  lowLose:'0.008',  highWin:'0.008',  highLose:'1.80'  },
];

function RatingInfoModal({ visible, onClose, cfg }) {
    const [section, setSection] = useState('dominant');
    const rows = section === 'dominant' ? RATING_DOM : RATING_REC;
    const label = section === 'dominant' ? '🏆 DOMİNANT  (6-0, 6-1, 6-2)' : '⚔️ REKABETÇİ  (6-3, 6-4, 7-5)';

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={{ flex:1, backgroundColor:'#000000cc', justifyContent:'flex-end' }}>
                <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, maxHeight:'92%', paddingBottom:24 }}>
                    {/* Başlık */}
                    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', padding:16, borderBottomWidth:1, borderColor: colors.border }}>
                        <Text style={{ color:'#fff', fontSize:15, fontWeight:'900' }}>📊 Rekabetçi Maç Puan Sistemi</Text>
                        <TouchableOpacity onPress={onClose}><Text style={{ color: colors.textMuted, fontSize:18, fontWeight:'700' }}>✕</Text></TouchableOpacity>
                    </View>

                    {/* Açıklama */}
                    {section !== 'kalibrasyon' && (
                        <View style={{ paddingHorizontal:14, paddingTop:10, paddingBottom:8 }}>
                            <Text style={{ color: colors.textSecondary, fontSize:12, lineHeight:18 }}>
                                Puanlar oyuncular arasındaki <Text style={{ color:'#fbbf24', fontWeight:'800' }}>FARK</Text>'a ve maç tipine göre değişir.{'\n'}
                                <Text style={{ color:'#4ade80', fontWeight:'700' }}>Yeşil</Text> = kazanılan puan  ·  <Text style={{ color:'#f87171', fontWeight:'700' }}>Kırmızı</Text> = kaybedilen puan
                            </Text>
                        </View>
                    )}

                    {/* Segment: Dominant / Rekabetçi / Kalibrasyon */}
                    <View style={{ flexDirection:'row', gap:3, marginHorizontal:14, marginBottom:10, marginTop: section === 'kalibrasyon' ? 10 : 0 }}>
                        {[['dominant','🏆 Dominant'],['rekabetci','⚔️ Rekabetçi'],['kalibrasyon','🎯 Kalibrasyon']].map(([key, lbl]) => (
                            <TouchableOpacity key={key} onPress={() => setSection(key)}
                                style={{ flex:1, paddingVertical:7, borderRadius:10, alignItems:'center', backgroundColor: section===key ? cfg.color : colors.surface2, borderWidth:1, borderColor: section===key ? cfg.color : colors.border }}>
                                <Text style={{ color: section===key ? '#fff' : colors.textMuted, fontSize:11, fontWeight:'800' }}>{lbl}</Text>
                            </TouchableOpacity>
                        ))}
                    </View>

                    {section === 'kalibrasyon' ? (
                        <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal:14 }}>
                            {/* Kalibrasyon açıklama kartı */}
                            <View style={{ backgroundColor:'#fbbf2412', borderRadius:14, borderWidth:1, borderColor:'#fbbf2440', padding:14, marginBottom:12 }}>
                                <Text style={{ color:'#fbbf24', fontSize:13, fontWeight:'900', marginBottom:8 }}>🎯 Derece Kalibrasyon Koruması</Text>
                                <Text style={{ color: colors.textSecondary, fontSize:13, lineHeight:21 }}>
                                    Bir oyuncu <Text style={{ color:'#fff', fontWeight:'800' }}>derecelendirme anketini</Text> tamamladıktan sonra rekabetçi modda oynadığı{' '}
                                    <Text style={{ color:'#fbbf24', fontWeight:'800' }}>ilk 3 maçta</Text> şu koşul değerlendirilir:
                                </Text>
                            </View>

                            <View style={{ backgroundColor: colors.surface2, borderRadius:12, borderWidth:1, borderColor: colors.border, padding:12, marginBottom:12 }}>
                                <View style={{ flexDirection:'row', alignItems:'flex-start', gap:3, marginBottom:10 }}>
                                    <Text style={{ fontSize:18 }}>⚠️</Text>
                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'800', flex:1, lineHeight:20 }}>
                                        Tetikleyici Koşul
                                    </Text>
                                </View>
                                <Text style={{ color: colors.textSecondary, fontSize:13, lineHeight:21 }}>
                                    Oyuncu bireysel ve/veya takım olarak <Text style={{ color:'#fbbf24', fontWeight:'800' }}>ortalama derece puanından 1 puan veya daha fazla fark</Text> ile kazanıyorsa sistem bu maçın derecesinin yanlış hesaplandığını tespit eder.
                                </Text>
                            </View>

                            <View style={{ backgroundColor:'#ef444412', borderRadius:12, borderWidth:1, borderColor:'#ef444440', padding:12, marginBottom:12 }}>
                                <View style={{ flexDirection:'row', alignItems:'flex-start', gap:3, marginBottom:8 }}>
                                    <Text style={{ fontSize:18 }}>🚫</Text>
                                    <Text style={{ color:'#f87171', fontSize:13, fontWeight:'800', flex:1, lineHeight:20 }}>
                                        Puan Sayılmaz
                                    </Text>
                                </View>
                                <Text style={{ color: colors.textSecondary, fontSize:13, lineHeight:21 }}>
                                    Bu durumda maç sonucundan <Text style={{ color:'#f87171', fontWeight:'800' }}>kazanılan/kaybedilen hiçbir puan uygulanmaz.</Text> Oyuncu ve rakip için derece puanları değişmez.
                                </Text>
                            </View>

                            <View style={{ backgroundColor:'#4ade8012', borderRadius:12, borderWidth:1, borderColor:'#4ade8040', padding:12, marginBottom:12 }}>
                                <View style={{ flexDirection:'row', alignItems:'flex-start', gap:3, marginBottom:8 }}>
                                    <Text style={{ fontSize:18 }}>🔄</Text>
                                    <Text style={{ color:'#4ade80', fontSize:13, fontWeight:'800', flex:1, lineHeight:20 }}>
                                        Ankete Yönlendirme
                                    </Text>
                                </View>
                                <Text style={{ color: colors.textSecondary, fontSize:13, lineHeight:21 }}>
                                    Oyuncu doğru derece puanlaması yapılabilmesi için <Text style={{ color:'#4ade80', fontWeight:'800' }}>otomatik olarak derecelendirme anketine yönlendirilir</Text> ve anketi yeniden tamamlaması istenir.
                                </Text>
                            </View>

                            <View style={{ backgroundColor:'#a855f712', borderRadius:12, borderWidth:1, borderColor:'#a855f740', padding:12, marginBottom:16 }}>
                                <Text style={{ color:'#c084fc', fontSize:12, fontWeight:'800', marginBottom:6 }}>💡 Neden böyle?</Text>
                                <Text style={{ color: colors.textMuted, fontSize:12, lineHeight:19 }}>
                                    Anket cevapları oyuncunun gerçek seviyesini her zaman tam yansıtmayabilir. Bu koruma sistemi, yanlış derece ile başlayan oyuncuların rakiplerini etkilemesini önler ve tüm oyuncular için adil bir rekabet ortamı sağlar.
                                </Text>
                            </View>
                        </ScrollView>
                    ) : (
                        <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal:14 }}>
                            <Text style={{ color: colors.textMuted, fontSize:10, textAlign:'center', marginBottom:8 }}>{label}</Text>
                            {/* Tablo başlığı */}
                            <View style={{ flexDirection:'row', backgroundColor: colors.surface2, borderRadius:8, padding:6, marginBottom:4 }}>
                                <Text style={{ flex:1.4, color: colors.textMuted, fontSize:9, fontWeight:'800' }}>FARK</Text>
                                <Text style={{ flex:1, color:'#4ade80', fontSize:9, fontWeight:'800', textAlign:'center' }}>⬆ Düşük{'\n'}Kazanır</Text>
                                <Text style={{ flex:1, color:'#f87171', fontSize:9, fontWeight:'800', textAlign:'center' }}>⬇ Düşük{'\n'}Kaybeder</Text>
                                <Text style={{ flex:1, color:'#4ade80', fontSize:9, fontWeight:'800', textAlign:'center' }}>⬆ Yüksek{'\n'}Kazanır</Text>
                                <Text style={{ flex:1, color:'#f87171', fontSize:9, fontWeight:'800', textAlign:'center' }}>⬇ Yüksek{'\n'}Kaybeder</Text>
                            </View>

                            {rows.map((r, i) => (
                                <View key={i} style={{ flexDirection:'row', alignItems:'center', paddingVertical:6, paddingHorizontal:6, borderRadius:8, marginBottom:2, backgroundColor: i%2===0 ? '#ffffff06' : 'transparent', borderWidth:1, borderColor: colors.border+'44' }}>
                                    <Text style={{ flex:1.4, color: colors.textSecondary, fontSize:10, fontWeight:'700' }}>{r.range}</Text>
                                    <Text style={{ flex:1, color:'#4ade80', fontSize:11, fontWeight:'800', textAlign:'center' }}>+{r.lowWin}</Text>
                                    <Text style={{ flex:1, color:'#f87171', fontSize:11, fontWeight:'800', textAlign:'center' }}>-{r.lowLose}</Text>
                                    <Text style={{ flex:1, color:'#4ade80', fontSize:11, fontWeight:'800', textAlign:'center' }}>+{r.highWin}</Text>
                                    <Text style={{ flex:1, color:'#f87171', fontSize:11, fontWeight:'800', textAlign:'center' }}>-{r.highLose}</Text>
                                </View>
                            ))}

                            <View style={{ height:16 }} />
                        </ScrollView>
                    )}
                </View>
            </View>
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
    overlay:      { flex:1, backgroundColor: colors.bg, paddingHorizontal:13, paddingBottom:17 },
    card:         { flex:1, backgroundColor: colors.surface, borderRadius:24, borderWidth:3, marginBottom:14, overflow:'hidden' },
    cardScroll:   { padding:21, alignItems:'center', flexGrow:1, justifyContent:'center' },
    cardEmoji:    { fontSize:56, marginBottom:10 },
    cardTitle:    { fontSize:20, fontWeight:'900', marginBottom:18, textAlign:'center' },
    proName:      { color:'#fff', fontSize:24, fontWeight:'900', marginBottom:10, textAlign:'center' },
    proAchievements: { color: colors.textSecondary, fontSize:14, textAlign:'center', lineHeight:21 },
    comingSoon:   { color: colors.textMuted, fontSize:14, textAlign:'center', lineHeight:21 },
    tierRow:      { width:'100%', backgroundColor: colors.surface2, borderRadius:14, padding:13, marginBottom:12 },
    tierLabel:    { color: colors.textMuted, fontSize:12, fontWeight:'700', marginBottom:6 },
    tierName:     { color:'#fff', fontSize:17, fontWeight:'800', marginBottom:3 },
    tierDetail:   { color: colors.textSecondary, fontSize:12 },
    tierEmpty:    { color: colors.textMuted, fontSize:13, fontStyle:'italic' },
    actions:      { flexDirection:'row', gap:3 },
    actionBtn:    { flex:1, backgroundColor: colors.surface2, borderRadius:12, paddingHorizontal:17, paddingVertical:11, borderWidth:1, borderColor: colors.border, alignItems:'center' },
    closeBtn:     { backgroundColor:'#dc262620', borderColor:'#dc262640' },
    actionBtnText:{ color:'#fff', fontSize:14, fontWeight:'700' },
});

// ─── Story Viewer ──────────────────────────────────────────────────────────────

function StoryViewerContent({ group, storyViewer, setStoryViewer, mediaStories, cfg }) {
    const story = group?.stories[storyViewer.storyIdx];
    const storyDuration = story?.musicName
        ? Math.max(1000, ((story.musicEndTime || 15) - (story.musicStartTime || 0)) * 1000)
        : 15000;

    const [progress, setProgress] = useState(0);
    const soundRef = useRef(null);
    const goNextRef = useRef(null);

    const goNext = useCallback(() => {
        if (storyViewer.storyIdx < group.stories.length - 1) {
            setStoryViewer(v => ({ ...v, storyIdx: v.storyIdx + 1 }));
        } else if (storyViewer.userIdx < mediaStories.length - 1) {
            setStoryViewer(v => ({ ...v, userIdx: v.userIdx + 1, storyIdx: 0 }));
        } else {
            setStoryViewer(v => ({ ...v, visible: false }));
        }
    }, [storyViewer.storyIdx, storyViewer.userIdx, group, mediaStories]);

    const goPrev = useCallback(() => {
        if (storyViewer.storyIdx > 0) {
            setStoryViewer(v => ({ ...v, storyIdx: v.storyIdx - 1 }));
        } else if (storyViewer.userIdx > 0) {
            const prevIdx = storyViewer.userIdx - 1;
            setStoryViewer(v => ({ ...v, userIdx: prevIdx, storyIdx: mediaStories[prevIdx].stories.length - 1 }));
        }
    }, [storyViewer.storyIdx, storyViewer.userIdx, mediaStories]);

    useEffect(() => { goNextRef.current = goNext; }, [goNext]);

    useEffect(() => {
        setProgress(0);
        const TICK = 100;
        const interval = setInterval(() => {
            setProgress(p => {
                const next = p + TICK / storyDuration;
                if (next >= 1) { clearInterval(interval); goNextRef.current?.(); return 1; }
                return next;
            });
        }, TICK);

        // Music playback
        let stopTimeout;
        const startMs = (story?.musicStartTime || 0) * 1000;
        const endMs = (story?.musicEndTime || 30) * 1000;
        if (story?.musicUrl) {
            Audio.setAudioModeAsync({ playsInSilentModeIOS: true })
                .then(() => Audio.Sound.createAsync({ uri: story.musicUrl }, { shouldPlay: true, positionMillis: startMs }))
                .then(({ sound }) => {
                    soundRef.current = sound;
                    stopTimeout = setTimeout(() => sound.stopAsync().catch(() => {}), endMs - startMs + 500);
                }).catch(() => {});
        }

        return () => {
            clearInterval(interval);
            if (stopTimeout) clearTimeout(stopTimeout);
            soundRef.current?.stopAsync().catch(() => {});
            soundRef.current?.unloadAsync().catch(() => {});
            soundRef.current = null;
        };
    }, [storyViewer.userIdx, storyViewer.storyIdx]);

    if (!story) return null;

    return (
        <View style={{ flex: 1, backgroundColor: '#000' }}>
            {/* Tam ekran görsel */}
            <View style={{ flex: 1 }}>
                {story.imageUrl
                    ? <Image source={{ uri: story.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                    : story.videoUrl
                        ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><Text style={{ fontSize: 60 }}>🎬</Text></View>
                        : <View style={{ flex: 1, backgroundColor: '#111' }} />
                }

                {/* Müzik — sol üst */}
                {!!story.musicName && (
                    <View style={{ position: 'absolute', top: 90, left: 14, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#00000075', borderRadius: 20, paddingHorizontal: 9, paddingVertical: 4, maxWidth: '65%' }}>
                        <Text style={{ fontSize: 14 }}>🎵</Text>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '700' }} numberOfLines={1}>{story.musicName}{story.musicArtist ? ` – ${story.musicArtist}` : ''}</Text>
                    </View>
                )}

                {/* Konum — sağ alt */}
                {!!story.location && (
                    <View style={{ position: 'absolute', bottom: 72, right: 14, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#00000075', borderRadius: 16, paddingHorizontal: 7, paddingVertical: 3 }}>
                        <Text style={{ fontSize: 12 }}>📍</Text>
                        <Text style={{ color: '#fff', fontSize: 12, fontWeight: '600' }} numberOfLines={1}>{story.location}</Text>
                    </View>
                )}

                {/* Yazı overlay — ortada */}
                {!!story.content && (
                    <View style={{ position: 'absolute', left: 20, right: 20, bottom: story.location ? 130 : 72, alignItems: 'center' }}>
                        <View style={{ backgroundColor: '#00000065', borderRadius: 12, paddingHorizontal: 13, paddingVertical: 7 }}>
                            <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700', textAlign: 'center', lineHeight: 23 }}>{story.content}</Text>
                        </View>
                    </View>
                )}

                {/* Dokunma bölgeleri */}
                <TouchableOpacity style={{ position: 'absolute', left: 0, top: 60, bottom: 0, width: '35%' }} onPress={goPrev} activeOpacity={1} />
                <TouchableOpacity style={{ position: 'absolute', right: 0, top: 60, bottom: 0, width: '65%' }} onPress={goNext} activeOpacity={1} />
            </View>

            {/* İlerleme çubukları — en üstte absolute */}
            <View style={{ position: 'absolute', top: 0, left: 0, right: 0, flexDirection: 'row', gap: 3, paddingHorizontal: 9, paddingTop: 49, paddingBottom: 5 }}>
                {group.stories.map((_, i) => (
                    <View key={i} style={{ flex: 1, height: 2.5, borderRadius: 2, backgroundColor: '#ffffff35', overflow: 'hidden' }}>
                        {i < storyViewer.storyIdx
                            ? <View style={{ flex: 1, backgroundColor: '#fff' }} />
                            : i === storyViewer.storyIdx
                                ? <View style={{ width: `${Math.min(progress * 100, 100)}%`, height: '100%', backgroundColor: '#fff' }} />
                                : null
                        }
                    </View>
                ))}
            </View>
        </View>
    );
}

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function SubCategoryScreen({ route, navigation }) {
    const { category, sub, initialTab, highlightRivalId, initialTournSubTab, openChatTournamentId, openMatchId, openMatchTournamentId,
            openCreateRival, prefillDate, prefillTime, prefillDuration, prefillCourtName, prefillCity, prefillVenueId, prefillVenueCourtId, prefillCourtFee } = route.params;
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

    useEffect(() => {
        if (!openCreateRival) return;
        setRivalPrefill({
            matchDate:    prefillDate,
            matchTime:    prefillTime,
            duration:     prefillDuration,
            courtName:    prefillCourtName,
            city:         prefillCity,
            venueId:      prefillVenueId,
            venueCourtId: prefillVenueCourtId,
            courtFee:     prefillCourtFee,
        });
        setShowCreateRival(true);
        navigation.setParams({ openCreateRival: undefined });
    }, [openCreateRival]);

    // Tenis sekmesine her girişte (günde en fazla 3 kez) "Günün Tenisçisi" kartını otomatik göster
    const [showSpotlight, setShowSpotlight] = useState(false);
    const [showRatingInfo, setShowRatingInfo] = useState(false);
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
    // Dakikada bir tick → zaman bazlı filtreler (matchHasEnded) yeniden hesaplanır
    const [, setTimeTick] = useState(0);
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
    const [reportModal, setReportModal] = useState({ visible: false, type: null, id: null, reason: null, explanation: '' });
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
    const [tournSubTab, setTournSubTab] = useState(['open','inprogress'].includes(initialTournSubTab) ? initialTournSubTab : 'open');

    useEffect(() => {
        if (['open','inprogress'].includes(route.params?.initialTournSubTab)) {
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
    const [rivalPrefill, setRivalPrefill] = useState(null);
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
            setTournSubTab(target.status === 'OPEN' ? 'open' : 'inprogress');
        }
    }, [openChatTournamentId, tournaments]);

    // Skor onayı bildirimine tıklanınca doğru alt sekmeye geçip ilgili kartın render olmasını sağla
    useEffect(() => {
        if (!openMatchTournamentId || tournaments.length === 0) return;
        const target = tournaments.find(tn => tn.id === openMatchTournamentId);
        if (target) {
            setTournSubTab(target.status === 'OPEN' ? 'open' : 'inprogress');
        }
    }, [openMatchTournamentId, tournaments]);

    // Comments modal — lifted out of UpcomingCard so it renders outside ScrollView
    const [commentMatch, setCommentMatch] = useState(null);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [sendingComment, setSendingComment] = useState(false);
    const [commentSwapSlot, setCommentSwapSlot] = useState(null);

    const handleCommentSwap = useCallback(async (slot) => {
        if (!commentMatch || commentMatch.senderId !== myId) return;
        if (!commentSwapSlot) { setCommentSwapSlot(slot); return; }
        if (commentSwapSlot === slot) { setCommentSwapSlot(null); return; }
        const s1 = commentSwapSlot, s2 = slot;
        setCommentSwapSlot(null);
        try {
            const res = await api.patch(`/rivals/${commentMatch.id}/swap-positions`, { slot1: s1, slot2: s2 });
            setCommentMatch(prev => prev ? { ...prev, participants: res.data.participants, senderTeam: res.data.senderTeam } : prev);
            setMatchedUpcoming(prev => prev.map(m => m.id === res.data.id ? { ...m, participants: res.data.participants, senderTeam: res.data.senderTeam } : m));
        } catch(e) { Alert.alert('', e?.response?.data?.message || 'Yer değiştirme başarısız'); }
    }, [commentMatch, commentSwapSlot, myId]);

    const openComments = useCallback(async (match) => {
        setCommentMatch(match);
        setCommentSwapSlot(null);
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

    const handleAppeal = useCallback((match) => {
        Alert.alert(
            '⚠️ Skora İtiraz Et',
            'Otomatik onaylanan skora itiraz etmek istediğinizden emin misiniz? Admin konuya el atacak.',
            [
                { text: 'Vazgeç', style: 'cancel' },
                {
                    text: 'İtiraz Et',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await api.post(`/rivals/${match.id}/appeal-score`, {});
                            setArchiveRivals(prev => prev.map(m => m.id === match.id ? { ...m, scoreAppeal: true } : m));
                            Alert.alert('✅ İtiraz İletildi', 'Admin konuya en kısa sürede el atacak.');
                        } catch (e) {
                            Alert.alert('Hata', e?.response?.data?.message || 'İtiraz gönderilemedi');
                        }
                    }
                }
            ]
        );
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
                location: coachForm.locationMutual ? 'Ortaklaşa Kararlaştırılır' : coachForm.location,
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
    const [detectingImage, setDetectingImage] = useState(false);
    const [imageSuggestions, setImageSuggestions] = useState([]);
    // Trim bar drag refs
    const trimBarWidthRef = useRef(0);
    const trimStartCapturedRef = useRef(0);
    const trimEndCapturedRef = useRef(30);
    const trimStartRef = useRef(0);
    const trimEndRef = useRef(30);
    const musicDurationRef = useRef(30);
    const [previewPlaying, setPreviewPlaying] = useState(false);
    const musicSoundRef = useRef(null);
    const [shareLocation, setShareLocation] = useState('');
    const [gettingLocation, setGettingLocation] = useState(false);

    const detectImageMusic = async () => {
        if (!mediaShareUri) return;
        setDetectingImage(true);
        setImageSuggestions([]);
        try {
            const resp = await fetch(mediaShareUri);
            const blob = await resp.blob();
            const base64 = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => resolve(reader.result.split(',')[1]);
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
            const { data } = await api.post('/posts/suggest-music', {
                imageBase64: base64,
                mimeType: 'image/jpeg',
                subCategory: sub,
            });
            setImageSuggestions(data.keywords || []);
        } catch { Alert.alert('', 'Görsel analiz edilemedi'); }
        finally { setDetectingImage(false); }
    };

    // Trim bar PanResponders — refs kullanarak closure sorununu önle
    const startHandlePan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => { trimStartCapturedRef.current = trimStartRef.current; },
        onPanResponderMove: (_, { dx }) => {
            const w = trimBarWidthRef.current;
            if (!w) return;
            const totalDur = musicDurationRef.current || 30;
            const pxPerSec = w / totalDur;
            const newS = Math.max(0, Math.min(trimEndRef.current - 1, trimStartCapturedRef.current + dx / pxPerSec));
            const rounded = Math.round(newS);
            trimStartRef.current = rounded;
            setTrimStart(String(rounded));
        },
    })).current;

    const endHandlePan = useRef(PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => { trimEndCapturedRef.current = trimEndRef.current; },
        onPanResponderMove: (_, { dx }) => {
            const w = trimBarWidthRef.current;
            if (!w) return;
            const totalDur = musicDurationRef.current || 30;
            const pxPerSec = w / totalDur;
            const newE = Math.max(trimStartRef.current + 1, Math.min(totalDur, trimEndCapturedRef.current + dx / pxPerSec));
            const rounded = Math.round(newE);
            trimEndRef.current = rounded;
            setTrimEnd(String(rounded));
        },
    })).current;

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
        const endSec = music.duration ? Math.min(30, Math.floor(music.duration)) : 30;
        const dur = music.duration || 30;
        setTrimStart('0');
        setTrimEnd(String(endSec));
        setMusicDuration(dur);
        trimStartRef.current = 0;
        trimEndRef.current = endSec;
        musicDurationRef.current = dur;
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
        if (!result.canceled) {
            const asset = result.assets[0];
            if (type === 'STORY' && asset.type === 'video') {
                const dur = asset.duration || 0;
                const durSec = dur > 1000 ? dur / 1000 : dur; // expo returns seconds, but handle ms too
                if (durSec > 90) {
                    Alert.alert('⚠️ Video Çok Uzun', 'Hikaye videoları en fazla 1.5 dakika (90 saniye) olabilir.');
                    return;
                }
            }
            setMediaShareUri(asset.uri);
            setShowMediaShare(true);
        }
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
        setReportModal({ visible: true, type, id, reason: null, explanation: '' });
    };

    const submitReport = async () => {
        const { type, id, reason, explanation } = reportModal;
        if (!reason) return;
        try {
            setReportingListingId(id);
            await api.post(`/${type}/${id}/report`, { reason, explanation });
            Alert.alert('', 'Bildiriminiz alındı. Teşekkürler.');
            setReportModal({ visible: false, type: null, id: null, reason: null, explanation: '' });
            if (type === 'equipment') setSelectedEquipment(null);
        } catch (e) {
            Alert.alert('', e?.response?.data?.message || 'Bir hata oluştu');
        } finally { setReportingListingId(null); }
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
        // Fallback: socket missed event → periyodik yenileme (30s)
        const pollInterval = setInterval(() => load(), 30000);
        // Dakikada bir tick → maç saati geçince yaklaşan→skor bekleniyor geçişini anlık yansıt
        const tickInterval = setInterval(() => setTimeTick(n => n + 1), 60000);
        return () => { offUpdate(); offDeleted(); offReconnect(); clearInterval(pollInterval); clearInterval(tickInterval); };
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

    // Maç saati geçmiş MATCHED maçları yaklaşan listesinden çıkar, skor bekleniyor olarak göster
    const matchHasEnded = (m) => {
        if (!m.matchDate || !m.matchTime) return false;
        const [h, min] = m.matchTime.split(':').map(Number);
        const d = new Date(m.matchDate);
        d.setHours(h, min, 0, 0);
        return new Date() >= new Date(d.getTime() + 60 * 1000); // maç başladıktan 1 dk sonra
    };
    const allFiltered = matchedUpcoming.filter(applyFilter);
    const filteredMatchedUpcoming = allFiltered.filter(m => !matchHasEnded(m));
    const clientEndedMatches = allFiltered.filter(m => matchHasEnded(m));
    // Birleştir: sunucudan gelen + client-side biten (id çakışmasını önle)
    const pendingScoreIds = new Set(pendingScore.map(m => m.id));
    const pendingScoreAll = [...pendingScore, ...clientEndedMatches.filter(m => !pendingScoreIds.has(m.id))];

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
                style={{ paddingVertical:0, paddingHorizontal:2, borderRadius:6, backgroundColor: active ? cfg.color+'20' : '#ffffff10', borderWidth:1, borderColor: active ? cfg.color+'60' : '#ffffff20', alignItems:'center', justifyContent:'center' }}
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
            <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:8 }}>
                {children}
                <CityAlertBtn tab={tab} />
                <Text numberOfLines={3} style={{ color: active ? cfg.color : '#6b7280', fontSize:9, lineHeight:13, flex:1 }}>{desc}</Text>
            </View>
        );
    };

    const CompactFilter = ({ showDateChips = true, showNearMe = true }) => (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }} contentContainerStyle={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 0, paddingVertical: 0 }}>
            <TouchableOpacity
                onPress={() => setShowCityFilter(true)}
                style={{ flexDirection:'row', alignItems:'center', gap:3, backgroundColor:colors.surface2, borderRadius:7, paddingVertical:2, paddingHorizontal:5, borderWidth:1, borderColor: filterCity ? cfg.color+'60' : colors.border, minWidth:70 }}
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
                style={{ backgroundColor:cfg.color+'15', borderRadius:7, paddingVertical:2, paddingHorizontal:5, borderWidth:1, borderColor:cfg.color+'30' }}
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
                    style={{ backgroundColor: filterDate===val ? cfg.color+'25' : colors.surface2, borderRadius:7, paddingVertical:2, paddingHorizontal:5, borderWidth:1, borderColor: filterDate===val ? cfg.color : colors.border }}
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
                        <View style={{ flexDirection:'row', alignItems:'center', padding:13, borderBottomWidth:1, borderBottomColor:colors.border }}>
                            <Text style={{ color:'#fff', fontSize:15, fontWeight:'800', flex:1 }}>
                                🔔 {sportDisplayName} — Bildirim İlleri
                            </Text>
                            <TouchableOpacity onPress={() => setCityPickerTab(null)}>
                                <Text style={{ color:colors.textMuted, fontSize:20 }}>✕</Text>
                            </TouchableOpacity>
                        </View>
                        <Text style={{ color:colors.textMuted, fontSize:12, paddingHorizontal:13, paddingTop:5, paddingBottom:1 }}>
                            Seçtiğin illerden yeni {sportDisplayName} bildirimi alırsın
                        </Text>
                        <ScrollView contentContainerStyle={{ paddingVertical:5 }}>
                            {TR_PROVINCES.map(province => {
                                const isChecked = cityPickerTab ? (tabSubCities[cityPickerTab] || []).includes(province) : false;
                                const isLoading = cityPickerTogglingCity === province;
                                return (
                                    <TouchableOpacity
                                        key={province}
                                        onPress={() => cityPickerTab && toggleTabCity(cityPickerTab, province)}
                                        disabled={cityPickerTogglingCity !== null}
                                        style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:13, paddingVertical:8, borderBottomWidth:1, borderBottomColor:colors.border+'40' }}
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
                    <View style={{ flexDirection:'row', alignItems:'center', gap:3 }}>
                        <TouchableOpacity onPress={() => setShowRatingInfo(true)}>
                            <Text style={{ fontSize:20 }}>ℹ️</Text>
                        </TouchableOpacity>
                        <TouchableOpacity onPress={() => setShowSpotlight(true)}>
                            <Text style={{ fontSize:22 }}>🃏</Text>
                        </TouchableOpacity>
                    </View>
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
                            {/* İlan oluştur + Kort Rezervasyonu + bildirim butonu yan yana */}
                            <CityAlertRow tab="rivals">
                                <TouchableOpacity style={s.courtResBtn} onPress={() => navigation.navigate('VenueSearch', { branch: sub })} activeOpacity={0.8}>
                                    <Text style={s.courtResBtnText}>🏟️ Kort Rez.</Text>
                                </TouchableOpacity>
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
                                                <View key={m.id} style={{ width:'48.5%' }}>
                                                    <UpcomingCard match={m} myId={myId} onRefresh={load} isMatched onOpenComments={openComments} onUserPress={setProfileUserId} />
                                                </View>
                                            ))}
                                        </View>
                                    )}
                                </>
                            )}

                            {/* Skor Bekleyen Maçlar */}
                            {pendingScoreAll.length > 0 && (
                                <>
                                    <Text style={[s.sectionTitle, { color: '#f97316' }]}>⏳ {t.pendingScoreTitle}</Text>
                                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
                                        {pendingScoreAll.map(m => (
                                            <View key={m.id} style={{ width:'48.5%' }}>
                                                <UpcomingCard match={m} myId={myId} onRefresh={load} isMatched onOpenComments={openComments} onUserPress={setProfileUserId} />
                                            </View>
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
                        const shown = tournSubTab === 'open' ? open : inProgress;
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
                                openMatchId={openMatchId}
                                openMatchTournamentId={openMatchTournamentId}
                                onMatchOpened={() => navigation.setParams({ openMatchId: undefined, openMatchTournamentId: undefined })}
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
                                <View style={{ flexDirection:'row', gap:3, marginBottom:8 }}>
                                    {[
                                        { key:'open',       label: t.tournOpenTab,       count: open.length },
                                        { key:'inprogress', label: t.tournInProgressTab, count: inProgress.length },
                                    ].map(st => (
                                        <TouchableOpacity key={st.key} onPress={() => setTournSubTab(st.key)}
                                            style={{ flex:1, paddingVertical:4, borderRadius:8, alignItems:'center', backgroundColor: tournSubTab===st.key ? cfg.color : colors.surface2, borderWidth:1, borderColor: tournSubTab===st.key ? cfg.color : colors.border }}>
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
                                            <EmptyState emoji="🏆" text={tournSubTab === 'open' ? t.emptyTournOpen : t.emptyTournInProgress} />
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
                                    <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:8 }}>
                                        <TouchableOpacity
                                            onPress={() => setShowCityFilter(true)}
                                            style={{ flexDirection:'row', alignItems:'center', gap:3, backgroundColor:colors.surface2, borderRadius:7, paddingVertical:2, paddingHorizontal:5, borderWidth:1, borderColor: filterCity ? cfg.color+'60' : colors.border }}
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
                            <View style={{ flexDirection:'row', gap:3, marginBottom:10 }}>
                                {['ALL','NEW','USED'].map(c => (
                                    <TouchableOpacity key={c} onPress={() => setEquipmentCondition(c)}
                                        style={{ flex:1, paddingVertical:4, borderRadius:8, alignItems:'center', backgroundColor: equipmentCondition===c ? cfg.color : colors.surface2, borderWidth:1, borderColor: equipmentCondition===c ? cfg.color : colors.border }}>
                                        <Text style={{ color: equipmentCondition===c ? '#fff' : colors.textSecondary, fontSize:12, fontWeight:'700' }}>
                                            {c==='ALL' ? t.conditionAll : c==='NEW' ? t.conditionNew : t.conditionUsed}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {/* Filtre alanları */}
                            <View style={{ backgroundColor: colors.surface2, borderRadius:10, padding:7, marginBottom:10, borderWidth:1, borderColor: colors.border, gap:3 }}>
                                <TextInput
                                    placeholder={t.equipSearchPh}
                                    placeholderTextColor={colors.textMuted}
                                    value={equipmentSearch}
                                    onChangeText={setEquipmentSearch}
                                    style={{ backgroundColor: colors.surface, borderRadius:8, paddingHorizontal:7, paddingVertical:4, color:'#fff', borderWidth:1, borderColor: colors.border, fontSize:13 }}
                                />
                                <TextInput
                                    placeholder={t.equipCityPh}
                                    placeholderTextColor={colors.textMuted}
                                    value={equipmentCity}
                                    onChangeText={setEquipmentCity}
                                    style={{ backgroundColor: colors.surface, borderRadius:8, paddingHorizontal:7, paddingVertical:4, color:'#fff', borderWidth:1, borderColor: colors.border, fontSize:13 }}
                                />
                                <View style={{ flexDirection:'row', gap:3 }}>
                                    <TextInput
                                        placeholder="Min ₺"
                                        placeholderTextColor={colors.textMuted}
                                        value={equipmentMinPrice}
                                        onChangeText={v => setEquipmentMinPrice(v.replace(/[^0-9]/g,''))}
                                        keyboardType="numeric"
                                        style={{ flex:1, backgroundColor: colors.surface, borderRadius:8, paddingHorizontal:7, paddingVertical:4, color:'#fff', borderWidth:1, borderColor: colors.border, fontSize:13 }}
                                    />
                                    <TextInput
                                        placeholder="Max ₺"
                                        placeholderTextColor={colors.textMuted}
                                        value={equipmentMaxPrice}
                                        onChangeText={v => setEquipmentMaxPrice(v.replace(/[^0-9]/g,''))}
                                        keyboardType="numeric"
                                        style={{ flex:1, backgroundColor: colors.surface, borderRadius:8, paddingHorizontal:7, paddingVertical:4, color:'#fff', borderWidth:1, borderColor: colors.border, fontSize:13 }}
                                    />
                                    {(equipmentSearch || equipmentCity || equipmentMinPrice || equipmentMaxPrice) && (
                                        <TouchableOpacity
                                            onPress={() => { setEquipmentSearch(''); setEquipmentCity(''); setEquipmentMinPrice(''); setEquipmentMaxPrice(''); }}
                                            style={{ justifyContent:'center', paddingHorizontal:7, backgroundColor:'#ef444420', borderRadius:8, borderWidth:1, borderColor:'#ef444440' }}>
                                            <Text style={{ color:'#ef4444', fontSize:11, fontWeight:'700' }}>{t.clearFilter}</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                            {/* İlan ekle butonu */}
                            <TouchableOpacity onPress={() => setShowEquipmentForm(true)}
                                style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, backgroundColor: cfg.color+'20', borderRadius:10, paddingVertical:6, marginBottom:10, borderWidth:1, borderColor: cfg.color+'50' }}>
                                <Text style={{ color: cfg.color, fontSize:13, fontWeight:'800' }}>{t.postListingBtn}</Text>
                            </TouchableOpacity>
                            {/* Liste */}
                            {loadingEquipment ? (
                                <ActivityIndicator size="small" color={cfg.color} style={{ marginVertical:10 }} />
                            ) : filteredEquipment.length === 0 ? (
                                <EmptyState emoji="🎾" text={equipmentListings.length === 0 ? "Henüz ekipman ilanı yok" : "Filtreyle eşleşen ilan bulunamadı"} />
                            ) : (
                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3 }}>
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
                                            <View style={{ position:'absolute', top:6, left:6, backgroundColor: eq.condition==='NEW' ? '#16a34a' : '#f59e0b', borderRadius:6, paddingHorizontal:2, paddingVertical:0 }}>
                                                <Text style={{ color:'#fff', fontSize:9, fontWeight:'800' }}>{eq.condition==='NEW' ? 'Sıfır' : '2.El'}</Text>
                                            </View>
                                            <View style={{ padding:5 }}>
                                                <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }} numberOfLines={1}>{eq.title}</Text>
                                                <Text style={{ color: cfg.color, fontSize:13, fontWeight:'900', marginTop:2 }}>{eq.price > 0 ? eq.price + ' ₺' : 'Fiyat sor'}</Text>
                                                <Text style={{ color: colors.textMuted, fontSize:10, marginTop:1 }}>{eq.user?.username}</Text>
                                            </View>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )}
                            {/* İlan ver formu Modal */}
                            <Modal visible={showEquipmentForm} animationType="slide" onRequestClose={() => { setShowEquipmentForm(false); setEquipmentMedia([]); }}>
                                <View style={{ flex:1, backgroundColor: colors.bg, justifyContent:'flex-end' }}>
                                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:20, borderTopRightRadius:20, paddingBottom:33, maxHeight:'92%' }}>
                                        <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding:17 }}>
                                            <Text style={{ color:'#fff', fontSize:16, fontWeight:'900', marginBottom:12 }}>🎾 Ekipman İlanı Ver</Text>
                                            <View style={{ flexDirection:'row', gap:3, marginBottom:10 }}>
                                                {['NEW','USED'].map(c => (
                                                    <TouchableOpacity key={c} onPress={() => setEquipmentForm(f => ({...f, condition:c}))}
                                                        style={{ flex:1, paddingVertical:5, borderRadius:8, alignItems:'center', backgroundColor: equipmentForm.condition===c ? cfg.color : colors.surface2, borderWidth:1, borderColor: equipmentForm.condition===c ? cfg.color : colors.border }}>
                                                        <Text style={{ color: equipmentForm.condition===c ? '#fff' : colors.textSecondary, fontSize:13, fontWeight:'700' }}>{c==='NEW' ? '🆕 Sıfır' : '♻️ İkinci El'}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                            <TextInput placeholder="Ürün adı *" placeholderTextColor={colors.textMuted} value={equipmentForm.title} onChangeText={v => setEquipmentForm(f=>({...f,title:v}))} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border }} />
                                            <TextInput placeholder="Fiyat (₺)" placeholderTextColor={colors.textMuted} value={String(equipmentForm.price)} onChangeText={v => setEquipmentForm(f=>({...f,price:v.replace(/[^0-9]/,'')}))} keyboardType="numeric" style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border }} />
                                            <TextInput placeholder="Açıklama (opsiyonel)" placeholderTextColor={colors.textMuted} value={equipmentForm.description} onChangeText={v => setEquipmentForm(f=>({...f,description:v}))} multiline numberOfLines={3} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border, minHeight:70, textAlignVertical:'top' }} />
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
                                                    style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, paddingVertical:7, borderRadius:8, borderWidth:1, borderColor:colors.border, borderStyle:'dashed', backgroundColor:colors.surface2, marginBottom:14 }}>
                                                    <Text style={{ fontSize:16 }}>📷</Text>
                                                    <Text style={{ color:colors.textSecondary, fontSize:13, fontWeight:'700' }}>
                                                        Fotoğraf / Video Ekle {equipmentMedia.length > 0 ? `(${equipmentMedia.length}/5)` : ''}
                                                    </Text>
                                                </TouchableOpacity>
                                            )}

                                            <View style={{ flexDirection:'row', gap:3 }}>
                                                <TouchableOpacity onPress={() => { setShowEquipmentForm(false); setEquipmentMedia([]); }} style={{ flex:1, paddingVertical:8, borderRadius:10, alignItems:'center', backgroundColor:colors.surface2, borderWidth:1, borderColor:colors.border }}>
                                                    <Text style={{ color:colors.textMuted, fontWeight:'700' }}>İptal</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={submitEquipment} disabled={submittingEquipment || uploadingEquipmentMedia} style={{ flex:2, paddingVertical:8, borderRadius:10, alignItems:'center', backgroundColor: cfg.color }}>
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
                                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:20, borderTopRightRadius:20, padding:17, paddingBottom:33, maxHeight:'85%' }}>
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
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:6 }}>
                                                <View style={{ backgroundColor: selectedEquipment?.condition==='NEW' ? '#16a34a' : '#f59e0b', borderRadius:6, paddingHorizontal:5, paddingVertical:0 }}>
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
                                                ])} style={{ backgroundColor:'#ef444420', borderRadius:10, paddingVertical:7, alignItems:'center', borderWidth:1, borderColor:'#ef444450' }}>
                                                    <Text style={{ color:'#ef4444', fontWeight:'800' }}>🗑️ İlanı Sil</Text>
                                                </TouchableOpacity>
                                            ) : (
                                                <TouchableOpacity
                                                    onPress={() => reportListing('equipment', selectedEquipment.id)}
                                                    disabled={reportingListingId === selectedEquipment?.id}
                                                    style={{ backgroundColor:'#f59e0b20', borderRadius:10, paddingVertical:7, alignItems:'center', borderWidth:1, borderColor:'#f59e0b50' }}>
                                                    <Text style={{ color:'#f59e0b', fontWeight:'800' }}>🚩 Bildır</Text>
                                                </TouchableOpacity>
                                            )}
                                        </ScrollView>
                                        <TouchableOpacity onPress={() => setSelectedEquipment(null)} style={{ marginTop:12, paddingVertical:7, borderRadius:10, alignItems:'center', backgroundColor:colors.surface2, borderWidth:1, borderColor:colors.border }}>
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

                            <View style={{ flexDirection:'row', gap:3, marginBottom:8 }}>
                                {[
                                    { key:'listings', label: t.coachListingsTab, count: filteredCoaches.length },
                                    { key:'cvs',      label: t.coachCvsTab,     count: coachesWithCv.length },
                                ].map(st => (
                                    <TouchableOpacity key={st.key} onPress={() => setCoachSubTab(st.key)}
                                        style={{ flex:1, paddingVertical:4, borderRadius:8, alignItems:'center', backgroundColor: coachSubTab===st.key ? cfg.color : colors.surface2, borderWidth:1, borderColor: coachSubTab===st.key ? cfg.color : colors.border }}>
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
                                            <View key={c.id} style={{ flexDirection:'row', alignItems:'center', backgroundColor:colors.surface2, borderRadius:12, padding:9, marginBottom:8, borderWidth:1, borderColor:colors.border }}>
                                                <Text style={{ fontSize:22, marginRight:8 }}>📄</Text>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'800' }}>{c.user?.fullName || c.user?.username}</Text>
                                                    <Text style={{ color:colors.textMuted, fontSize:11 }}>{c.credentialLevel}{c.experience > 0 ? ` · ${c.experience} yıl deneyim` : ''}</Text>
                                                </View>
                                                <TouchableOpacity onPress={() => Linking.openURL(c.cvUrl)} style={{ backgroundColor: cfg.color+'20', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor: cfg.color+'50' }}>
                                                    <Text style={{ color: cfg.color, fontSize:11, fontWeight:'700' }}>CV'yi Aç</Text>
                                                </TouchableOpacity>
                                            </View>
                                        ))
                                        : shown.map(c => (
                                        <View key={c.id} style={{ backgroundColor:colors.surface2, borderRadius:12, padding:9, marginBottom:8, borderWidth:1, borderColor:colors.border }}>
                                            <View style={{ flexDirection:'row', alignItems:'center', gap:3, marginBottom:6 }}>
                                                <Text style={{ fontSize:22 }}>🎓</Text>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color:'#fff', fontSize:13, fontWeight:'800' }}>{c.credentialLevel}</Text>
                                                    {c.certName && <Text style={{ color:colors.textMuted, fontSize:11 }}>{c.certName}</Text>}
                                                </View>
                                                <TouchableOpacity onPress={() => setProfileUserId(c.userId)}>
                                                    <Text style={{ color:cfg.color, fontSize:11, fontWeight:'700' }}>{c.user?.username}</Text>
                                                </TouchableOpacity>
                                            </View>
                                            <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginBottom:4 }}>
                                                {c.individual && <View style={{ backgroundColor:cfg.color+'20', borderRadius:6, paddingHorizontal:5, paddingVertical:0 }}><Text style={{ color:cfg.color, fontSize:11, fontWeight:'700' }}>Bireysel {c.priceIndividual > 0 ? `${c.priceIndividual}₺` : ''}</Text></View>}
                                                {c.group && <View style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:5, paddingVertical:0 }}><Text style={{ color:'#4ade80', fontSize:11, fontWeight:'700' }}>Grup {c.priceGroup > 0 ? `${c.priceGroup}₺` : ''}</Text></View>}
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
                                                    style={{ alignSelf:'flex-end', marginTop:6, paddingHorizontal:7, paddingVertical:1, borderRadius:6, backgroundColor:'#f59e0b15', borderWidth:1, borderColor:'#f59e0b40' }}>
                                                    <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'700' }}>🚩 Bildir</Text>
                                                </TouchableOpacity>
                                            )}
                                            {(c.certificateUrl || c.cvUrl || (c.achievementUrls || []).length > 0) && (
                                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginTop:6 }}>
                                                    {c.certificateUrl && (
                                                        <TouchableOpacity onPress={() => Linking.openURL(c.certificateUrl)} style={{ backgroundColor:'#1e40af20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#1e40af50' }}>
                                                            <Text style={{ color:'#60a5fa', fontSize:10, fontWeight:'700' }}>📜 Belge</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    {(c.achievementUrls || []).length > 0 && (
                                                        <TouchableOpacity onPress={() => Linking.openURL(c.achievementUrls[0])} style={{ backgroundColor:'#f59e0b20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#f59e0b50' }}>
                                                            <Text style={{ color:'#fbbf24', fontSize:10, fontWeight:'700' }}>🏆 Başarılar ({c.achievementUrls.length})</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                    {c.cvUrl && (
                                                        <TouchableOpacity onPress={() => Linking.openURL(c.cvUrl)} style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#16a34a50' }}>
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
                            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:20, borderTopRightRadius:20, paddingBottom:33, maxHeight:'92%' }}>
                                <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ padding:17 }}>
                                    <Text style={{ color:'#fff', fontSize:16, fontWeight:'900', marginBottom:12 }}>🎓 Antrenör İlanı Oluştur</Text>

                                    <Text style={{ color:colors.textMuted, fontSize:11, fontWeight:'700', marginBottom:6 }}>Kimlik / Belge</Text>
                                    <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginBottom:10 }}>
                                        {[
                                            { key:'CERTIFIED',   label: t.credCertified },
                                            { key:'LICENSED',    label: t.credLicensed },
                                            { key:'CLUB_COACH',  label: t.credClubCoach },
                                            { key:'INDEPENDENT', label: t.credIndependent },
                                            { key:'AMATEUR',     label: t.credAmateur },
                                        ].map(lvl => (
                                            <TouchableOpacity key={lvl.key} onPress={() => setCoachForm(f => ({...f, credentialLevel:lvl.key}))}
                                                style={{ paddingHorizontal:7, paddingVertical:3, borderRadius:8, backgroundColor: coachForm.credentialLevel===lvl.key ? cfg.color : colors.surface2, borderWidth:1, borderColor: coachForm.credentialLevel===lvl.key ? cfg.color : colors.border }}>
                                                <Text style={{ color: coachForm.credentialLevel===lvl.key ? '#fff' : colors.textSecondary, fontSize:11, fontWeight:'700' }}>{lvl.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <TextInput placeholder="Belge/Sertifika adı (örn. ITF Level 2)" placeholderTextColor={colors.textMuted} value={coachForm.certName} onChangeText={v => setCoachForm(f=>({...f,certName:v}))} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border }} />
                                    <TouchableOpacity onPress={() => pickCoachSingleImage(setCoachCertImage)}
                                        style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:colors.border, borderStyle:'dashed', backgroundColor:colors.surface2, marginBottom:10 }}>
                                        <Text style={{ fontSize:14 }}>📜</Text>
                                        <Text style={{ color:colors.textSecondary, fontSize:12, fontWeight:'700' }}>{coachCertImage ? 'Belge Fotoğrafı Seçildi ✓' : 'Belge Fotoğrafı Yükle (opsiyonel)'}</Text>
                                    </TouchableOpacity>
                                    <TextInput placeholder="Deneyim (yıl)" placeholderTextColor={colors.textMuted} value={coachForm.experience} onChangeText={v => setCoachForm(f=>({...f,experience:v.replace(/[^0-9]/,'')}))} keyboardType="numeric" style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', marginBottom:14, borderWidth:1, borderColor:colors.border }} />

                                    <Text style={{ color:colors.textMuted, fontSize:11, fontWeight:'700', marginBottom:6 }}>Ders Tipleri & Ücret</Text>
                                    <View style={{ flexDirection:'row', gap:3, marginBottom:8 }}>
                                        <TouchableOpacity onPress={() => setCoachForm(f => ({...f, individual: !f.individual}))}
                                            style={{ flex:1, paddingVertical:5, borderRadius:8, alignItems:'center', backgroundColor: coachForm.individual ? cfg.color : colors.surface2, borderWidth:1, borderColor: coachForm.individual ? cfg.color : colors.border }}>
                                            <Text style={{ color: coachForm.individual ? '#fff' : colors.textSecondary, fontSize:12, fontWeight:'700' }}>{t.individualLesson}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={() => setCoachForm(f => ({...f, group: !f.group}))}
                                            style={{ flex:1, paddingVertical:5, borderRadius:8, alignItems:'center', backgroundColor: coachForm.group ? cfg.color : colors.surface2, borderWidth:1, borderColor: coachForm.group ? cfg.color : colors.border }}>
                                            <Text style={{ color: coachForm.group ? '#fff' : colors.textSecondary, fontSize:12, fontWeight:'700' }}>{t.groupLesson}</Text>
                                        </TouchableOpacity>
                                    </View>
                                    {coachForm.individual && (
                                        <TextInput placeholder="Bireysel ders ücreti (₺/saat)" placeholderTextColor={colors.textMuted} value={coachForm.priceIndividual} onChangeText={v => setCoachForm(f=>({...f,priceIndividual:v.replace(/[^0-9]/,'')}))} keyboardType="numeric" style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border }} />
                                    )}
                                    {coachForm.group && (
                                        <View style={{ flexDirection:'row', gap:3, marginBottom:8 }}>
                                            <TextInput placeholder="Grup ücreti (₺/kişi)" placeholderTextColor={colors.textMuted} value={coachForm.priceGroup} onChangeText={v => setCoachForm(f=>({...f,priceGroup:v.replace(/[^0-9]/,'')}))} keyboardType="numeric" style={{ flex:1, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', borderWidth:1, borderColor:colors.border }} />
                                            <TextInput placeholder="Maks. grup" placeholderTextColor={colors.textMuted} value={coachForm.maxGroupSize} onChangeText={v => setCoachForm(f=>({...f,maxGroupSize:v.replace(/[^0-9]/,'')}))} keyboardType="numeric" style={{ width:100, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', borderWidth:1, borderColor:colors.border }} />
                                        </View>
                                    )}

                                    <Text style={{ color:colors.textMuted, fontSize:11, fontWeight:'700', marginTop:6, marginBottom:6 }}>Yer / Zaman</Text>
                                    <View style={{ flexDirection:'row', gap:3, marginBottom:8 }}>
                                        {[
                                            { val: false, label: t.courtSpecifyBtn || 'Kort / Tesis Belirt' },
                                            { val: true,  label: t.courtMutualBtn || 'Ortaklaşa Kararlaştırılır' },
                                        ].map(({ val, label }) => (
                                            <TouchableOpacity key={String(val)}
                                                onPress={() => setCoachForm(f => ({ ...f, locationMutual: val }))}
                                                style={{ flex:1, flexDirection:'row', alignItems:'center', gap:3, backgroundColor: coachForm.locationMutual===val ? cfg.color+'20' : '#ffffff08', borderRadius:8, paddingVertical:4, paddingHorizontal:5, borderWidth:1, borderColor: coachForm.locationMutual===val ? cfg.color : '#ffffff15' }}
                                            >
                                                <View style={{ width:12, height:12, borderRadius:6, borderWidth:2, borderColor: coachForm.locationMutual===val ? cfg.color : '#6b7280', alignItems:'center', justifyContent:'center' }}>
                                                    {coachForm.locationMutual===val && <View style={{ width:5, height:5, borderRadius:3, backgroundColor: cfg.color }} />}
                                                </View>
                                                <Text style={{ color: coachForm.locationMutual===val ? cfg.color : '#6b7280', fontSize:10, fontWeight:'700', flex:1 }}>{label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    {!coachForm.locationMutual && <TextInput placeholder="Konum (kort/tesis adı) *" placeholderTextColor={colors.textMuted} value={coachForm.location} onChangeText={v => setCoachForm(f=>({...f,location:v}))} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border }} />}
                                    <CityAutocomplete
                                        value={coachForm.city || ''}
                                        onChangeText={v => setCoachForm(f=>({...f,city:v}))}
                                        placeholder="Şehir"
                                        style={{ marginBottom: 8 }}
                                    />
                                    <View style={{ flexDirection:'row', gap:3, marginBottom:14 }}>
                                        <TextInput placeholder="Başlangıç saati (09:00)" placeholderTextColor={colors.textMuted} value={coachForm.timeFrom} onChangeText={v => setCoachForm(f=>({...f,timeFrom:v}))} style={{ flex:1, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', borderWidth:1, borderColor:colors.border }} />
                                        <TextInput placeholder="Bitiş saati (21:00)" placeholderTextColor={colors.textMuted} value={coachForm.timeTo} onChangeText={v => setCoachForm(f=>({...f,timeTo:v}))} style={{ flex:1, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', borderWidth:1, borderColor:colors.border }} />
                                    </View>

                                    <Text style={{ color:colors.textMuted, fontSize:11, fontWeight:'700', marginBottom:6 }}>Başarılar</Text>
                                    <TextInput placeholder="Başarılarınız (örn. 2023 Bölge Şampiyonu)" placeholderTextColor={colors.textMuted} value={coachForm.achievements} onChangeText={v => setCoachForm(f=>({...f,achievements:v}))} multiline numberOfLines={2} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', marginBottom:8, borderWidth:1, borderColor:colors.border, minHeight:50, textAlignVertical:'top' }} />
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
                                            style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:colors.border, borderStyle:'dashed', backgroundColor:colors.surface2, marginBottom:14 }}>
                                            <Text style={{ fontSize:14 }}>🏆</Text>
                                            <Text style={{ color:colors.textSecondary, fontSize:12, fontWeight:'700' }}>Başarı Fotoğrafı Ekle {coachAchievementImages.length > 0 ? `(${coachAchievementImages.length}/5)` : ''}</Text>
                                        </TouchableOpacity>
                                    )}

                                    <Text style={{ color:colors.textMuted, fontSize:11, fontWeight:'700', marginBottom:6 }}>CV</Text>
                                    <TouchableOpacity onPress={() => pickCoachSingleImage(setCoachCvImage)}
                                        style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:colors.border, borderStyle:'dashed', backgroundColor:colors.surface2, marginBottom:8 }}>
                                        <Text style={{ fontSize:14 }}>📄</Text>
                                        <Text style={{ color:colors.textSecondary, fontSize:12, fontWeight:'700' }}>{coachCvImage ? 'CV Fotoğrafı Seçildi ✓' : 'CV Fotoğrafı Yükle (opsiyonel)'}</Text>
                                    </TouchableOpacity>

                                    <TextInput placeholder="Açıklama (opsiyonel)" placeholderTextColor={colors.textMuted} value={coachForm.description} onChangeText={v => setCoachForm(f=>({...f,description:v}))} multiline numberOfLines={3} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:9, paddingVertical:5, color:'#fff', marginBottom:14, borderWidth:1, borderColor:colors.border, minHeight:70, textAlignVertical:'top' }} />

                                    <View style={{ flexDirection:'row', gap:3 }}>
                                        <TouchableOpacity onPress={() => { setShowCreateCoach(false); resetCoachForm(); }} style={{ flex:1, paddingVertical:8, borderRadius:10, alignItems:'center', backgroundColor:colors.surface2, borderWidth:1, borderColor:colors.border }}>
                                            <Text style={{ color:colors.textMuted, fontWeight:'700' }}>İptal</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity onPress={submitCoach} disabled={submittingCoach || uploadingCoachMedia} style={{ flex:2, paddingVertical:8, borderRadius:10, alignItems:'center', backgroundColor: cfg.color }}>
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
                        <View style={{ flex:1, backgroundColor:'#00000090', justifyContent:'center', padding:21 }}>
                            <View style={{ backgroundColor: colors.surface, borderRadius:16, padding:17 }}>
                                <Text style={{ color:'#fff', fontSize:15, fontWeight:'900', marginBottom:10 }}>📄 CV Yükle</Text>
                                <Text style={{ color:colors.textMuted, fontSize:12, marginBottom:14 }}>İlanınıza eklenecek CV fotoğrafını seçin.</Text>
                                {standaloneCvImage ? (
                                    <Image source={{ uri: standaloneCvImage }} style={{ width:'100%', height:160, borderRadius:10, marginBottom:10 }} resizeMode="cover" />
                                ) : null}
                                <TouchableOpacity onPress={() => pickCoachSingleImage(setStandaloneCvImage)}
                                    style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3, paddingVertical:6, borderRadius:8, borderWidth:1, borderColor:colors.border, borderStyle:'dashed', backgroundColor:colors.surface2, marginBottom:14 }}>
                                    <Text style={{ fontSize:14 }}>📷</Text>
                                    <Text style={{ color:colors.textSecondary, fontSize:12, fontWeight:'700' }}>{standaloneCvImage ? 'Fotoğrafı Değiştir' : 'CV Fotoğrafı Seç'}</Text>
                                </TouchableOpacity>
                                <View style={{ flexDirection:'row', gap:3 }}>
                                    <TouchableOpacity onPress={() => { setShowCvUploadModal(false); setStandaloneCvImage(null); }} style={{ flex:1, paddingVertical:8, borderRadius:10, alignItems:'center', backgroundColor:colors.surface2, borderWidth:1, borderColor:colors.border }}>
                                        <Text style={{ color:colors.textMuted, fontWeight:'700' }}>İptal</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={submitStandaloneCv} disabled={!standaloneCvImage || uploadingStandaloneCv} style={{ flex:2, paddingVertical:8, borderRadius:10, alignItems:'center', backgroundColor: standaloneCvImage ? '#16a34a' : colors.surface2 }}>
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
                        <View style={{ flexDirection:'row', gap:3, marginBottom:10 }}>
                            {['rivals','tournaments'].map(st => (
                                <TouchableOpacity key={st} onPress={() => setArchiveSubTab(st)}
                                    style={{ flex:1, paddingVertical:4, borderRadius:8, alignItems:'center', backgroundColor: archiveSubTab===st ? cfg.color : colors.surface2, borderWidth:1, borderColor: archiveSubTab===st ? cfg.color : colors.border }}>
                                    <Text style={{ color: archiveSubTab===st ? '#fff' : colors.textSecondary, fontSize:12, fontWeight:'700' }}>
                                        {st === 'rivals' ? '⚔️ Bireysel Maçlar' : '🏆 Turnuvalar'}
                                    </Text>
                                </TouchableOpacity>
                            ))}
                        </View>
                        {/* Filter bar */}
                        <View style={{ flexDirection:'row', gap:3, marginBottom:8, alignItems:'center' }}>
                            <TextInput
                                style={{ flex:1, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:5, paddingVertical:2, color:'#fff', fontSize:11, borderWidth:1, borderColor:colors.border }}
                                placeholder="📍 Şehir"
                                placeholderTextColor={colors.textMuted}
                                value={archiveCity}
                                onChangeText={setArchiveCity}
                                onSubmitEditing={archiveSubTab==='rivals' ? loadArchive : loadArchiveTournaments}
                                returnKeyType="search"
                            />
                            <TextInput
                                style={{ width:80, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:5, paddingVertical:2, color:'#fff', fontSize:11, borderWidth:1, borderColor:colors.border }}
                                placeholder="📅 Başl."
                                placeholderTextColor={colors.textMuted}
                                value={archiveDateFrom}
                                onChangeText={setArchiveDateFrom}
                                onSubmitEditing={archiveSubTab==='rivals' ? loadArchive : loadArchiveTournaments}
                                returnKeyType="search"
                            />
                            <TextInput
                                style={{ width:70, backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:5, paddingVertical:2, color:'#fff', fontSize:11, borderWidth:1, borderColor:colors.border }}
                                placeholder="Bitiş"
                                placeholderTextColor={colors.textMuted}
                                value={archiveDateTo}
                                onChangeText={setArchiveDateTo}
                                onSubmitEditing={archiveSubTab==='rivals' ? loadArchive : loadArchiveTournaments}
                                returnKeyType="search"
                            />
                            <TouchableOpacity onPress={archiveSubTab==='rivals' ? loadArchive : loadArchiveTournaments} style={{ backgroundColor: cfg.color, borderRadius:8, paddingHorizontal:7, paddingVertical:2 }}>
                                <Text style={{ color:'#fff', fontSize:11, fontWeight:'700' }}>🔍</Text>
                            </TouchableOpacity>
                            {(archiveCity || archiveDateFrom || archiveDateTo) && (
                                <TouchableOpacity onPress={() => { setArchiveCity(''); setArchiveDateFrom(''); setArchiveDateTo(''); }} style={{ backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:5, paddingVertical:2, borderWidth:1, borderColor:colors.border }}>
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
                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, paddingVertical: 5 }}>
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
                                            <View key={m.id} style={[s.card, { width:'48%', paddingHorizontal:0, paddingTop:0, paddingBottom:0 }, m.id === highlightRivalId && { borderColor:'#f97316', borderWidth:2 }]}>
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
                                                                <TouchableOpacity onPress={() => p.id && setProfileUserId(p.id)} activeOpacity={0.7} style={{ backgroundColor: colors.surface2, borderRadius:6, paddingHorizontal:0, paddingVertical:0, flexDirection:'row', alignItems:'center', gap:3 }}>
                                                                    <Text style={{ color:'#fff', fontSize:12, fontWeight:'600' }} numberOfLines={1}>{senderAlias(p)}</Text>
                                                                    {rBefore != null && rBefore > 0 && <Text style={{ color:'#facc15', fontSize:11, fontWeight:'800' }}>{Number(rBefore).toFixed(2)} ★</Text>}
                                                                    {pts != null && pts !== 0 && <Text style={{ color: pts > 0 ? '#4ade80' : '#f87171', fontSize:11, fontWeight:'800' }}>{pts > 0 ? '+' : ''}{pts}p</Text>}
                                                                </TouchableOpacity>
                                                                {pSets && (
                                                                    <Text style={{ color: colors.textMuted, fontSize:11, paddingLeft:0 }}>
                                                                        {pSets.join('  ')}
                                                                        {'  '}<Text style={{ color: pWins != null && pWins > (sets.length - pWins) ? '#4ade80' : pWins != null && pWins < (sets.length - pWins) ? '#f87171' : colors.textMuted, fontWeight:'800' }}>({pWins})</Text>
                                                                    </Text>
                                                                )}
                                                            </View>
                                                        );
                                                    })}
                                                </View>
                                                {m.scoreStatus === 'CONFIRMED' && !m.scoreAppeal && (
                                                    <TouchableOpacity
                                                        onPress={() => handleAppeal(m)}
                                                        style={{ marginTop:4, backgroundColor:'#f9731620', borderRadius:6, paddingVertical:3, paddingHorizontal:6, borderWidth:1, borderColor:'#f9731650', alignSelf:'flex-start' }}>
                                                        <Text style={{ color:'#f97316', fontSize:10, fontWeight:'700' }}>⚠️ İtiraz Et</Text>
                                                    </TouchableOpacity>
                                                )}
                                                {m.scoreAppeal && (
                                                    <Text style={{ color:'#f59e0b', fontSize:10, fontWeight:'700', marginTop:4 }}>⏳ İtiraz İnceleniyor</Text>
                                                )}
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
                                <View style={{ gap:3, paddingVertical:5 }}>
                                    {archiveTournaments.map(tourn => {
                                        const typeLabel = TOURN_TYPE_LABELS(t)[tourn.type] || tourn.type;
                                        const participated = tourn.participants?.length > 0 || tourn.creatorId === myId;
                                        return (
                                            <View key={tourn.id} style={[s.card, { padding:9 }]}>
                                                <View style={{ flexDirection:'row', alignItems:'flex-start', justifyContent:'space-between', gap:3 }}>
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
                                                    <View style={{ alignItems:'flex-end', gap:3 }}>
                                                        <View style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#16a34a50' }}>
                                                            <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'800' }}>✅ Tamamlandı</Text>
                                                        </View>
                                                        {participated && (
                                                            <View style={{ backgroundColor: cfg.color+'20', borderRadius:6, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor: cfg.color+'50' }}>
                                                                <Text style={{ color: cfg.color, fontSize:10, fontWeight:'700' }}>Katıldım</Text>
                                                            </View>
                                                        )}
                                                    </View>
                                                </View>
                                                <TouchableOpacity
                                                    style={{ backgroundColor:'#a855f715', borderRadius:8, paddingHorizontal:7, paddingVertical:4, borderWidth:1, borderColor:'#a855f740', marginTop:8, flexDirection:'row', justifyContent:'space-between', alignItems:'center' }}
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
                                                <View style={{ width: 62, height: 62, borderRadius: 31, borderWidth: 2.5, borderColor: cfg.color, padding: 0, backgroundColor: colors.surface2 }}>
                                                    <Avatar name={group.user?.username} size={54} color={cfg.color} />
                                                </View>
                                                <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 4, maxWidth: 62, textAlign: 'center' }} numberOfLines={1}>
                                                    {group.user?.username}
                                                </Text>
                                            </TouchableOpacity>
                                        ))}
                                    </ScrollView>
                                )}
                                {/* Filtreler + paylaş */}
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 8, flexWrap: 'wrap' }}>
                                    <TextInput
                                        style={{ flex: 1, minWidth: 100, backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, color: '#fff', fontSize: 12, borderWidth: 1, borderColor: colors.border }}
                                        placeholder={t.mediaCityPh}
                                        placeholderTextColor={colors.textMuted}
                                        value={mediaCity}
                                        onChangeText={setMediaCity}
                                    />
                                    <TouchableOpacity onPress={() => setShowMediaTypeSheet(true)}
                                        style={{ backgroundColor: cfg.color + '20', borderRadius: 8, paddingHorizontal: 9, paddingVertical: 4, borderWidth: 1, borderColor: cfg.color + '50' }}>
                                        <Text style={{ color: cfg.color, fontWeight: '800', fontSize: 12 }}>{t.mediaShareBtn}</Text>
                                    </TouchableOpacity>
                                </View>
                                <View style={{ flexDirection: 'row', gap: 3, marginBottom: 10 }}>
                                    {[['ALL',t.allFilter],['TODAY',t.todayFilter],['WEEK',t.weekFilter],['MONTH',t.monthFilter]].map(([v, label]) => (
                                        <TouchableOpacity key={v} onPress={() => setMediaTimeFilter(v)}
                                            style={{ paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8, backgroundColor: mediaTimeFilter === v ? cfg.color : colors.surface2, borderWidth: 1, borderColor: mediaTimeFilter === v ? cfg.color : colors.border }}>
                                            <Text style={{ color: mediaTimeFilter === v ? '#fff' : colors.textMuted, fontSize: 11, fontWeight: '700' }}>{label}</Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                                {/* Instagram akışı */}
                                {filtered.length === 0
                                    ? <EmptyState emoji="📸" text={t.emptyMedia} />
                                    : (() => {
                                        const fmtAgo = (d) => {
                                            const diff = Date.now() - new Date(d).getTime();
                                            const m = Math.floor(diff / 60000);
                                            if (m < 1) return t.timeNow || 'şimdi';
                                            if (m < 60) return `${m}${t.timeMinSuffix || 'dk'}`;
                                            const h = Math.floor(m / 60);
                                            if (h < 24) return `${h}${t.timeHourSuffix || 's'}`;
                                            return `${Math.floor(h / 24)}${t.timeDaySuffix || 'g'}`;
                                        };
                                        return (
                                            <View style={{ gap: 3 }}>
                                                {filtered.map((post) => {
                                                    const actualIdx = mediaPosts.findIndex(p => p.id === post.id);
                                                    const isLiked = mediaLiked[post.id] ?? (Array.isArray(post.likes) && post.likes.length > 0);
                                                    const likeCount = mediaLikeCounts[post.id] ?? (post._count?.likes || 0);
                                                    const commentCount = post._count?.comments || 0;
                                                    const toggleLike = async () => {
                                                        const next = !isLiked;
                                                        setMediaLiked(prev => ({ ...prev, [post.id]: next }));
                                                        setMediaLikeCounts(prev => ({ ...prev, [post.id]: next ? likeCount + 1 : Math.max(0, likeCount - 1) }));
                                                        try { await api.post(`/posts/${post.id}/like`); }
                                                        catch {
                                                            setMediaLiked(prev => ({ ...prev, [post.id]: !next }));
                                                            setMediaLikeCounts(prev => ({ ...prev, [post.id]: next ? Math.max(0, likeCount - 1) : likeCount + 1 }));
                                                        }
                                                    };
                                                    return (
                                                        <View key={post.id} style={{ backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border, marginBottom: 8 }}>
                                                            {/* Başlık: avatar + kullanıcı + zaman */}
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingVertical: 7 }}>
                                                                <Avatar name={post.user?.username} avatar={post.user?.avatar} size={36} color={cfg.color} />
                                                                <View style={{ flex: 1 }}>
                                                                    <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }} numberOfLines={1}>{post.user?.fullName || post.user?.username}</Text>
                                                                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>{post.user?.username} · {fmtAgo(post.createdAt)}</Text>
                                                                </View>
                                                                {post.type === 'REEL' && <Text style={{ color: colors.purple, fontSize: 11, fontWeight: '800' }}>🎬</Text>}
                                                            </View>
                                                            {/* Görsel */}
                                                            <TouchableOpacity activeOpacity={0.95} onPress={() => setMediaViewIdx(actualIdx)}>
                                                                {post.imageUrl
                                                                    ? <Image source={{ uri: post.imageUrl }} style={{ width: '100%', aspectRatio: 1 }} resizeMode="cover" />
                                                                    : <View style={{ width: '100%', aspectRatio: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0a0a14' }}>
                                                                        <Text style={{ fontSize: 52 }}>🎬</Text>
                                                                      </View>
                                                                }
                                                            </TouchableOpacity>
                                                            {/* Aksiyon satırı */}
                                                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingHorizontal: 9, paddingTop: 7, paddingBottom: 3 }}>
                                                                <TouchableOpacity onPress={toggleLike} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                                    <Text style={{ color: isLiked ? '#f43f5e' : colors.textMuted, fontSize: 22 }}>♥</Text>
                                                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{likeCount}</Text>
                                                                </TouchableOpacity>
                                                                <TouchableOpacity onPress={() => setMediaViewIdx(actualIdx)} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                                                    <Text style={{ color: colors.textMuted, fontSize: 20 }}>💬</Text>
                                                                    <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{commentCount}</Text>
                                                                </TouchableOpacity>
                                                            </View>
                                                            {/* Açıklama */}
                                                            {post.content ? (
                                                                <View style={{ paddingHorizontal: 9, paddingBottom: 9 }}>
                                                                    <Text style={{ color: '#fff', fontSize: 13, lineHeight: 19 }}>
                                                                        <Text style={{ fontWeight: '800' }}>{post.user?.username} </Text>
                                                                        {post.content}
                                                                    </Text>
                                                                </View>
                                                            ) : <View style={{ paddingBottom: 1 }} />}
                                                        </View>
                                                    );
                                                })}
                                            </View>
                                        );
                                    })()
                                }
                                {/* Hikaye görüntüleyici */}
                                <Modal visible={storyViewer.visible} animationType="fade" statusBarTranslucent onRequestClose={() => setStoryViewer(v => ({ ...v, visible: false }))}>
                                    {storyViewer.visible && (() => {
                                        const group = mediaStories[storyViewer.userIdx];
                                        if (!group) return null;
                                        return (
                                            <StoryViewerContent
                                                group={group}
                                                storyViewer={storyViewer}
                                                setStoryViewer={setStoryViewer}
                                                mediaStories={mediaStories}
                                                cfg={cfg}
                                            />
                                        );
                                    })()}
                                </Modal>

                                {/* Tip seçim sheet */}
                                <Modal visible={showMediaTypeSheet} animationType="slide" transparent onRequestClose={() => setShowMediaTypeSheet(false)}>
                                    <TouchableOpacity style={{ flex: 1, backgroundColor: '#00000080' }} activeOpacity={1} onPress={() => setShowMediaTypeSheet(false)}>
                                        <View style={{ position: 'absolute', bottom: 0, left: 0, right: 0, backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 17, paddingBottom: 37 }}>
                                            <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700', textAlign: 'center', marginBottom: 16 }}>Ne paylaşmak istiyorsun?</Text>
                                            {[
                                                { type: 'POST',  emoji: '🖼️', label: 'Gönderi',  desc: 'Fotoğraf veya video paylaş' },
                                                { type: 'STORY', emoji: '⭕', label: 'Hikaye',   desc: '24 saat sonra kaybolur' },
                                                { type: 'REEL',  emoji: '🎬', label: lang === 'tr' ? 'Film Rulosu' : 'Reels', desc: lang === 'tr' ? 'Kısa video paylaş' : 'Share a short video' },
                                            ].map(opt => (
                                                <TouchableOpacity key={opt.type} onPress={() => pickMediaShare(opt.type)}
                                                    style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 11, borderBottomWidth: 1, borderBottomColor: colors.border }}>
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
                                        <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 17, paddingBottom: 33 }}>
                                            <Text style={{ color: '#fff', fontSize: 15, fontWeight: '900', marginBottom: 12 }}>
                                                {mediaShareType === 'STORY' ? '⭕ Hikaye Paylaş' : mediaShareType === 'REEL' ? `🎬 ${lang === 'tr' ? 'Film Rulosu' : 'Reels'} Paylaş` : '🖼️ Gönderi Paylaş'}
                                            </Text>
                                            {mediaShareUri && (
                                                <View style={{ width: '100%', height: 200, borderRadius: 12, marginBottom: shareMusic ? 0 : 12, overflow: 'hidden' }}>
                                                    <Image source={{ uri: mediaShareUri }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                    {mediaShareType === 'STORY' && !!mediaShareCaption && (
                                                        <View style={{ position: 'absolute', left: 12, right: 12, bottom: 12, alignItems: 'center' }}>
                                                            <View style={{ backgroundColor: '#00000065', borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5 }}>
                                                                <Text style={{ color: '#fff', fontSize: 14, fontWeight: '700', textAlign: 'center' }}>{mediaShareCaption}</Text>
                                                            </View>
                                                        </View>
                                                    )}
                                                </View>
                                            )}
                                            {/* Müzik trim çizgisi — fotoğrafın hemen altında */}
                                            {shareMusic && (() => {
                                                const totalDur = musicDurationRef.current || 30;
                                                const s = trimStartRef.current;
                                                const e = trimEndRef.current;
                                                const leftPct = (s / totalDur) * 100;
                                                const rightPct = (1 - e / totalDur) * 100;
                                                return (
                                                    <View style={{ backgroundColor: '#0a0a14', borderRadius: 10, paddingHorizontal: 11, paddingTop: 7, paddingBottom: 11, marginBottom: 12 }}>
                                                        {/* Müzik başlığı + süre */}
                                                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginBottom: 10 }}>
                                                            {shareMusic.coverUrl && <Image source={{ uri: shareMusic.coverUrl }} style={{ width: 26, height: 26, borderRadius: 4 }} />}
                                                            <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: '800', flex: 1 }} numberOfLines={1}>🎵 {shareMusic.title}</Text>
                                                            <Text style={{ color: '#6b7280', fontSize: 11 }}>{s}s – {e}s ({e - s}sn)</Text>
                                                        </View>
                                                        {/* Trim bar */}
                                                        <View
                                                            onLayout={ev => { trimBarWidthRef.current = ev.nativeEvent.layout.width; }}
                                                            style={{ height: 36, justifyContent: 'center' }}
                                                        >
                                                            {/* Arka plan izi */}
                                                            <View style={{ height: 5, backgroundColor: '#1f2937', borderRadius: 3 }}>
                                                                {/* Seçili aralık */}
                                                                <View style={{ position: 'absolute', left: `${leftPct}%`, right: `${rightPct}%`, height: 5, backgroundColor: '#7c3aed', borderRadius: 3 }} />
                                                            </View>
                                                            {/* Başlangıç tutacağı */}
                                                            <View
                                                                {...startHandlePan.panHandlers}
                                                                style={{ position: 'absolute', left: `${leftPct}%`, width: 22, height: 22, borderRadius: 11, backgroundColor: '#7c3aed', borderWidth: 2.5, borderColor: '#fff', marginLeft: -11, alignSelf: 'center' }}
                                                            />
                                                            {/* Bitiş tutacağı */}
                                                            <View
                                                                {...endHandlePan.panHandlers}
                                                                style={{ position: 'absolute', left: `${(e / totalDur) * 100}%`, width: 22, height: 22, borderRadius: 11, backgroundColor: '#a78bfa', borderWidth: 2.5, borderColor: '#fff', marginLeft: -11, alignSelf: 'center' }}
                                                            />
                                                        </View>
                                                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 4 }}>
                                                            <Text style={{ color: '#6b7280', fontSize: 10 }}>0s</Text>
                                                            <Text style={{ color: '#6b7280', fontSize: 10 }}>{totalDur}s</Text>
                                                        </View>
                                                    </View>
                                                );
                                            })()}
                                            <TextInput
                                                style={{ backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 7, color: '#fff', fontSize: 13, borderWidth: 1, borderColor: colors.border, marginBottom: 14 }}
                                                placeholder={mediaShareType === 'STORY' ? '✏️ Üzerine yazı ekle...' : 'Açıklama ekle (opsiyonel)...'}
                                                placeholderTextColor={colors.textMuted}
                                                value={mediaShareCaption}
                                                onChangeText={setMediaShareCaption}
                                                multiline
                                            />
                                            {/* Müzik + Konum butonları */}
                                            <View style={{ flexDirection: 'row', gap: 3, marginBottom: 12 }}>
                                                <TouchableOpacity onPress={() => shareMusic ? setMusicTrimOpen(true) : setMusicSheetOpen(true)}
                                                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 6, paddingHorizontal: 7, borderRadius: 10, backgroundColor: shareMusic ? '#7c3aed20' : colors.surface2, borderWidth: 1, borderColor: shareMusic ? '#7c3aed60' : colors.border }}>
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
                                                    style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 6, paddingHorizontal: 7, borderRadius: 10, backgroundColor: shareLocation ? '#16a34a20' : colors.surface2, borderWidth: 1, borderColor: shareLocation ? '#16a34a60' : colors.border }}>
                                                    <Text style={{ fontSize: 14 }}>📍</Text>
                                                    <Text style={{ color: shareLocation ? '#4ade80' : colors.textMuted, fontSize: 11, fontWeight: '700', flex: 1 }} numberOfLines={1}>
                                                        {gettingLocation ? 'Alınıyor...' : shareLocation || 'Konum Ekle'}
                                                    </Text>
                                                    {shareLocation && <TouchableOpacity onPress={() => setShareLocation('')} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
                                                        <Text style={{ color: colors.textMuted, fontSize: 12 }}>✕</Text>
                                                    </TouchableOpacity>}
                                                </TouchableOpacity>
                                            </View>
                                            <View style={{ flexDirection: 'row', gap: 3 }}>
                                                <TouchableOpacity onPress={() => { setShowMediaShare(false); setMediaShareUri(null); setMediaShareCaption(''); setShareMusic(null); setShareLocation(''); }}
                                                    style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                                                    <Text style={{ color: colors.textMuted, fontWeight: '700' }}>İptal</Text>
                                                </TouchableOpacity>
                                                <TouchableOpacity onPress={submitMediaShare} disabled={submittingMediaShare}
                                                    style={{ flex: 2, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: cfg.color, opacity: submittingMediaShare ? 0.6 : 1 }}>
                                                    <Text style={{ color: '#fff', fontWeight: '900' }}>{submittingMediaShare ? 'Yükleniyor...' : 'Paylaş'}</Text>
                                                </TouchableOpacity>
                                            </View>

                                            {/* Müzik Kırp Modal */}
                                            <Modal visible={musicTrimOpen} animationType="slide" transparent onRequestClose={() => { setMusicTrimOpen(false); stopMusicPreview(); }}>
                                                <View style={{ flex: 1, backgroundColor: '#00000090', justifyContent: 'flex-end' }}>
                                                    <View style={{ backgroundColor: colors.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 17, paddingBottom: 33 }}>
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

                                                        <View style={{ flexDirection: 'row', gap: 3, marginBottom: 16 }}>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>Başlangıç (sn)</Text>
                                                                <TextInput
                                                                    style={{ backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, color: '#fff', fontSize: 16, fontWeight: '800', borderWidth: 1, borderColor: colors.border, textAlign: 'center' }}
                                                                    value={trimStart}
                                                                    onChangeText={v => setTrimStart(v.replace(/[^0-9.]/g, ''))}
                                                                    keyboardType="numeric"
                                                                    placeholder="0"
                                                                    placeholderTextColor={colors.textMuted}
                                                                />
                                                            </View>
                                                            <View style={{ justifyContent: 'flex-end', paddingBottom: 7 }}>
                                                                <Text style={{ color: colors.textMuted, fontSize: 18 }}>→</Text>
                                                            </View>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: '700', marginBottom: 4 }}>Bitiş (sn)</Text>
                                                                <TextInput
                                                                    style={{ backgroundColor: colors.surface2, borderRadius: 8, paddingHorizontal: 9, paddingVertical: 7, color: '#fff', fontSize: 16, fontWeight: '800', borderWidth: 1, borderColor: colors.border, textAlign: 'center' }}
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

                                                        <View style={{ flexDirection: 'row', gap: 3 }}>
                                                            <TouchableOpacity onPress={previewTrim}
                                                                style={{ flex: 1, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: previewPlaying ? '#ef444420' : '#7c3aed20', borderWidth: 1, borderColor: previewPlaying ? '#ef444450' : '#7c3aed50' }}>
                                                                <Text style={{ color: previewPlaying ? '#ef4444' : '#a78bfa', fontWeight: '800' }}>
                                                                    {previewPlaying ? '⏹ Durdur' : '▶ Önizle'}
                                                                </Text>
                                                            </TouchableOpacity>
                                                            <TouchableOpacity onPress={() => { stopMusicPreview(); setMusicTrimOpen(false); }}
                                                                style={{ flex: 2, paddingVertical: 9, borderRadius: 10, alignItems: 'center', backgroundColor: cfg.color }}>
                                                                <Text style={{ color: '#fff', fontWeight: '900' }}>✓ Onayla</Text>
                                                            </TouchableOpacity>
                                                        </View>
                                                    </View>
                                                </View>
                                            </Modal>

                                            {/* Müzik seçici sheet */}
                                            <Modal visible={musicSheetOpen} animationType="slide" onRequestClose={() => setMusicSheetOpen(false)}>
                                                <View style={{ flex: 1, backgroundColor: colors.bg }}>
                                                    <View style={{ flexDirection: 'row', alignItems: 'center', padding: 13, borderBottomWidth: 1, borderBottomColor: colors.border }}>
                                                        <Text style={{ color: '#fff', fontWeight: '900', fontSize: 16, flex: 1 }}>🎵 Müzik Seç</Text>
                                                        <TouchableOpacity onPress={() => setMusicSheetOpen(false)}>
                                                            <Text style={{ color: colors.textMuted, fontSize: 22 }}>✕</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                    <TouchableOpacity onPress={pickPhoneAudio}
                                                        style={{ margin: 12, marginBottom: 4, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 11, paddingVertical: 9, borderWidth: 1, borderColor: colors.border }}>
                                                        <Text style={{ fontSize: 20 }}>📱</Text>
                                                        <View>
                                                            <Text style={{ color: '#fff', fontWeight: '800', fontSize: 13 }}>Telefondan Yükle</Text>
                                                            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>MP3, AAC, M4A...</Text>
                                                        </View>
                                                    </TouchableOpacity>
                                                    <View style={{ margin: 12, marginTop: 8, backgroundColor: colors.surface2, borderRadius: 10, paddingHorizontal: 9, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: colors.border }}>
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
                                                    {/* Resmi Algıla butonu */}
                                                    {mediaShareUri && (
                                                        <TouchableOpacity
                                                            onPress={detectImageMusic}
                                                            disabled={detectingImage}
                                                            style={{ marginHorizontal: 12, marginBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: '#7c3aed20', borderRadius: 10, paddingHorizontal: 11, paddingVertical: 8, borderWidth: 1, borderColor: '#7c3aed50', opacity: detectingImage ? 0.6 : 1 }}
                                                        >
                                                            <Text style={{ fontSize: 18 }}>🎨</Text>
                                                            <View style={{ flex: 1 }}>
                                                                <Text style={{ color: '#a78bfa', fontWeight: '800', fontSize: 13 }}>Resmi Algıla</Text>
                                                                <Text style={{ color: '#6b7280', fontSize: 11, marginTop: 1 }}>Görsele göre müzik önerileri al</Text>
                                                            </View>
                                                            {detectingImage && <ActivityIndicator size="small" color="#a78bfa" />}
                                                        </TouchableOpacity>
                                                    )}
                                                    {/* Görsel önerileri */}
                                                    {imageSuggestions.length > 0 && (
                                                        <View style={{ marginHorizontal: 12, marginBottom: 10 }}>
                                                            <Text style={{ color: '#6b7280', fontSize: 11, fontWeight: '700', marginBottom: 6 }}>✨ Önerilen aramalar:</Text>
                                                            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 3 }}>
                                                                {imageSuggestions.map((kw, i) => (
                                                                    <TouchableOpacity key={i} onPress={() => searchDeezer(kw)}
                                                                        style={{ backgroundColor: '#7c3aed20', borderRadius: 16, paddingHorizontal: 9, paddingVertical: 3, borderWidth: 1, borderColor: '#7c3aed40' }}>
                                                                        <Text style={{ color: '#a78bfa', fontSize: 12, fontWeight: '700' }}>{kw}</Text>
                                                                    </TouchableOpacity>
                                                                ))}
                                                            </View>
                                                        </View>
                                                    )}
                                                    <ScrollView contentContainerStyle={{ padding: 9 }}>
                                                        {musicResults.map(track => (
                                                            <TouchableOpacity key={track.id} onPress={() => selectTrack(track)}
                                                                style={{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: colors.border }}>
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
                                    <TouchableOpacity onPress={loadNews} style={{ alignSelf: 'flex-end', marginBottom: 8, paddingHorizontal: 7, paddingVertical: 1, borderRadius: 8, backgroundColor: colors.surface2, borderWidth: 1, borderColor: colors.border }}>
                                        <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: '700' }}>🔄 {lang === 'tr' ? 'Yenile' : 'Refresh'}</Text>
                                    </TouchableOpacity>
                                    {news.map((item, i) => (
                                        <TouchableOpacity key={i} onPress={() => item.link && Linking.openURL(item.link)}
                                            style={{ backgroundColor: colors.surface2, borderRadius: 12, marginBottom: 10, overflow: 'hidden', borderWidth: 1, borderColor: colors.border }}>
                                            {!!item.thumbnail && (
                                                <Image source={{ uri: item.thumbnail }} style={{ width: '100%', height: 150 }} resizeMode="cover" />
                                            )}
                                            <View style={{ padding: 9 }}>
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
                            <View style={{ backgroundColor: colors.surface2, borderRadius: 12, padding: 9, marginBottom: 12, borderWidth: 1, borderColor: colors.border }}>
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
                                        style={{ backgroundColor: newPostText.trim() ? cfg.color : colors.surface, borderRadius: 8, paddingHorizontal: 13, paddingVertical: 4, opacity: (!newPostText.trim() || submittingPost) ? 0.5 : 1 }}>
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

            {showCreateRival && <CreateRivalModal visible onClose={() => { setShowCreateRival(false); setRivalPrefill(null); }} category={category} sub={sub} onCreated={load} prefill={rivalPrefill} />}
            {showCreatePW && <CreatePlayerWantedModal visible onClose={() => setShowCreatePW(false)} category={category} sub={sub} onCreated={load} />}
            {showCreateTournament && <CreateTournamentModal visible onClose={() => setShowCreateTournament(false)} category={category} sub={sub} onCreated={loadTournaments} />}
            {showTournamentPermission && <TournamentPermissionModal visible onClose={() => setShowTournamentPermission(false)} onStatusChange={setTournamentPermStatus} />}
            {!!profileUserId && <UserProfileModal visible userId={profileUserId} onClose={() => setProfileUserId(null)} navigation={navigation} />}

            {/* ── İlan Bildir Modal ── */}
            {reportModal.visible && (
                <Modal visible animationType="slide" transparent onRequestClose={() => setReportModal(p => ({...p, visible:false}))}>
                    <View style={{ flex:1, backgroundColor:'#00000090', justifyContent:'flex-end' }}>
                        <KeyboardAvoidingView behavior={Platform.OS==='ios'?'padding':undefined}>
                            <View style={{ backgroundColor: colors.surface, borderTopLeftRadius:20, borderTopRightRadius:20, padding:20, paddingBottom:34 }}>
                                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
                                    <Text style={{ color:'#fff', fontSize:16, fontWeight:'900' }}>🚩 İlanı Bildir</Text>
                                    <TouchableOpacity onPress={() => setReportModal(p => ({...p, visible:false}))}>
                                        <Text style={{ color: colors.textMuted, fontSize:22 }}>✕</Text>
                                    </TouchableOpacity>
                                </View>
                                {['Yanıltıcı içerik', 'Uygunsuz görsel', 'Sahte ilan', 'Diğer'].map(r => (
                                    <TouchableOpacity key={r}
                                        onPress={() => setReportModal(p => ({...p, reason: r, explanation: ''}))}
                                        style={{ flexDirection:'row', alignItems:'center', gap:10, paddingVertical:11, borderBottomWidth:1, borderBottomColor: colors.border }}>
                                        <View style={{ width:18, height:18, borderRadius:9, borderWidth:2, borderColor: reportModal.reason===r ? '#f59e0b' : '#6b7280', alignItems:'center', justifyContent:'center' }}>
                                            {reportModal.reason===r && <View style={{ width:8, height:8, borderRadius:4, backgroundColor:'#f59e0b' }} />}
                                        </View>
                                        <Text style={{ color: reportModal.reason===r ? '#fbbf24' : '#fff', fontSize:14, fontWeight: reportModal.reason===r ? '700' : '400' }}>{r}</Text>
                                    </TouchableOpacity>
                                ))}
                                {reportModal.reason && (
                                    <View style={{ marginTop:12 }}>
                                        <Text style={{ color: colors.textMuted, fontSize:12, marginBottom:6 }}>
                                            Açıklama{reportModal.reason === 'Diğer' ? ' *' : ' (isteğe bağlı)'}
                                        </Text>
                                        <TextInput
                                            style={{ backgroundColor: colors.surface2, borderRadius:10, padding:10, color:'#fff', minHeight:72, textAlignVertical:'top', borderWidth:1, borderColor: colors.border }}
                                            placeholder={reportModal.reason === 'Diğer' ? 'Lütfen açıklayın...' : 'Daha fazla bilgi ekleyebilirsiniz...'}
                                            placeholderTextColor={colors.textMuted}
                                            multiline
                                            value={reportModal.explanation}
                                            onChangeText={v => setReportModal(p => ({...p, explanation: v}))}
                                        />
                                    </View>
                                )}
                                <View style={{ flexDirection:'row', gap:10, marginTop:16 }}>
                                    <TouchableOpacity
                                        onPress={() => setReportModal(p => ({...p, visible:false}))}
                                        style={{ flex:1, paddingVertical:11, borderRadius:12, alignItems:'center', backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border }}>
                                        <Text style={{ color: colors.textMuted, fontWeight:'700' }}>Kapat</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                        onPress={submitReport}
                                        disabled={!reportModal.reason || (reportModal.reason==='Diğer' && !reportModal.explanation.trim()) || reportingListingId===reportModal.id}
                                        style={{ flex:2, paddingVertical:11, borderRadius:12, alignItems:'center', backgroundColor: (reportModal.reason && !(reportModal.reason==='Diğer' && !reportModal.explanation.trim())) ? '#f59e0b' : '#f59e0b40' }}>
                                        <Text style={{ color:'#000', fontWeight:'900', fontSize:14 }}>
                                            {reportingListingId===reportModal.id ? '...' : 'Yöneticiye Gönder'}
                                        </Text>
                                    </TouchableOpacity>
                                </View>
                            </View>
                        </KeyboardAvoidingView>
                    </View>
                </Modal>
            )}

            {/* ── Yorumlar — tam ekran modal ── */}
            {(() => {
                if (!commentMatch) return null;
                const cfg2 = getConfig(commentMatch.subCategory);
                const cmSenderTeamArr = (Array.isArray(commentMatch.senderTeam) ? commentMatch.senderTeam : []).filter(p => p?.id);
                const cmParticipantsArr = (Array.isArray(commentMatch.participants) ? commentMatch.participants : []).filter(p => p?.id);
                const allP2 = [
                    { ...commentMatch.sender, skillRating: commentMatch.senderSkillRating },
                    ...(commentMatch.matchType === 'DOUBLE' ? cmSenderTeamArr : []),
                    ...cmParticipantsArr,
                ].filter(Boolean);
                const isCommentOwner = commentMatch.senderId === myId;
                const matchParticipantIds = new Set(allP2.map(p => p.id));
                const canDelete = (c) => {
                    const isAuthor = c.user?.id === myId;
                    const iAmParticipant = matchParticipantIds.has(myId);
                    const commenterIsParticipant = matchParticipantIds.has(c.user?.id);
                    return isAuthor || (iAmParticipant && !commenterIsParticipant);
                };
                return (
                    <Modal visible animationType="slide" onRequestClose={() => { setCommentMatch(null); setCommentSwapSlot(null); }}>
                        <View style={{ flex:1, backgroundColor: colors.bg }}>
                            {/* Header */}
                            <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:5, paddingTop: Platform.OS === 'ios' ? 56 : 24, paddingBottom:11, borderBottomWidth:1, borderBottomColor: colors.border }}>
                                <TouchableOpacity onPress={() => { setCommentMatch(null); setCommentSwapSlot(null); }} style={{ marginRight:14, padding:1 }}>
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
                                contentContainerStyle={{ paddingHorizontal:5, paddingVertical:13, paddingBottom:13 }}
                                showsVerticalScrollIndicator={false}
                                keyboardShouldPersistTaps="handled"
                            >
                                {/* Maç detayları */}
                                <View style={{ backgroundColor: colors.surface2, borderRadius:14, padding:11, marginBottom:20, borderWidth:1, borderColor: colors.border }}>
                                    {commentMatch.matchType === 'DOUBLE' ? (() => {
                                        const cmPartner = cmSenderTeamArr[0] || null;
                                        const cmOpp1 = cmParticipantsArr[0] || null;
                                        const cmOpp2 = cmParticipantsArr[1] || null;
                                        const removeCmPlayer = (userId, name) => {
                                            Alert.alert('Katılımcıyı Çıkar', `${name} maçtan çıkarılsın mı? İlan tekrar açık hale gelir.`, [
                                                { text: 'Vazgeç', style:'cancel' },
                                                { text: 'Çıkar', style:'destructive', onPress: async () => {
                                                    try {
                                                        await api.delete(`/rivals/${commentMatch.id}/participants/${userId}`);
                                                        const res = await api.get(`/rivals/${commentMatch.id}`);
                                                        setCommentMatch(prev => prev ? { ...prev, participants: res.data.participants, senderTeam: res.data.senderTeam, status: res.data.status } : prev);
                                                        setMatchedUpcoming(prev => prev.map(m => m.id === res.data.id ? { ...m, participants: res.data.participants, senderTeam: res.data.senderTeam, status: res.data.status } : m));
                                                    } catch(e) { Alert.alert('', e?.response?.data?.message || 'Hata'); }
                                                }},
                                            ]);
                                        };
                                        const mkCmSlot = (slot, player, accentCol) => {
                                            const isSource = commentSwapSlot === slot;
                                            const isTarget = !!commentSwapSlot && commentSwapSlot !== slot;
                                            return (
                                                <View key={slot} style={{ marginBottom:4 }}>
                                                    <TouchableOpacity
                                                        onLongPress={() => isCommentOwner && player && !commentSwapSlot && setCommentSwapSlot(slot)}
                                                        onPress={() => isCommentOwner && commentSwapSlot && handleCommentSwap(slot)}
                                                        delayLongPress={400}
                                                        activeOpacity={0.75}
                                                        style={{ borderRadius:8, padding:5, borderWidth:1, borderColor: isSource ? '#facc15' : isTarget ? '#4ade80' : accentCol + '50', backgroundColor: isSource ? '#facc1520' : isTarget ? '#4ade8015' : accentCol + '10' }}
                                                    >
                                                        {player ? (
                                                            <>
                                                                <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{senderAlias(player)}</Text>
                                                                {player.skillRating != null && <Text style={{ color:'#facc15', fontSize:11, fontWeight:'800' }}>{Number(player.skillRating).toFixed(2)} ★</Text>}
                                                                {isCommentOwner && !commentSwapSlot && <Text style={{ color: colors.textMuted, fontSize:10, marginTop:2 }}>• uzun bas → taşı</Text>}
                                                                {isCommentOwner && commentSwapSlot && <Text style={{ color:'#4ade80', fontSize:10, marginTop:2 }}>• buraya taşı</Text>}
                                                                {isSource && <Text style={{ color:'#facc15', fontSize:10, marginTop:2 }}>• seçildi</Text>}
                                                            </>
                                                        ) : (
                                                            <Text style={{ color: colors.textMuted, fontSize:13 }}>— boş slot —</Text>
                                                        )}
                                                    </TouchableOpacity>
                                                    {isCommentOwner && player && !commentSwapSlot && (
                                                        <TouchableOpacity
                                                            onPress={() => removeCmPlayer(player.id, senderAlias(player))}
                                                            style={{ marginTop:3, paddingVertical:1, alignItems:'center', backgroundColor:'#dc262615', borderRadius:6, borderWidth:1, borderColor:'#dc262640' }}
                                                        >
                                                            <Text style={{ color:'#f87171', fontSize:11, fontWeight:'700' }}>Çıkar</Text>
                                                        </TouchableOpacity>
                                                    )}
                                                </View>
                                            );
                                        };
                                        return (
                                            <View style={{ marginBottom:8 }}>
                                                {isCommentOwner && commentSwapSlot && (
                                                    <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'center', backgroundColor:'#1e293b', borderRadius:8, padding:5, marginBottom:8 }}>
                                                        <Text style={{ color:'#facc15', fontSize:12, fontWeight:'700' }}>Hedef slota dokun</Text>
                                                        <TouchableOpacity onPress={() => setCommentSwapSlot(null)}>
                                                            <Text style={{ color:'#f87171', fontSize:12, fontWeight:'700' }}>İptal</Text>
                                                        </TouchableOpacity>
                                                    </View>
                                                )}
                                                <View style={{ flexDirection:'row', gap:3 }}>
                                                    <View style={{ flex:1 }}>
                                                        <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'700', marginBottom:4 }}>KURUCU TAKIMI</Text>
                                                        <View style={{ borderRadius:8, padding:5, marginBottom:4, borderWidth:1, borderColor:'#6d28d930', backgroundColor:'#6d28d910' }}>
                                                            <Text style={{ color:'#fff', fontSize:13, fontWeight:'700' }}>{senderAlias(commentMatch.sender)}</Text>
                                                            {commentMatch.senderSkillRating != null && <Text style={{ color:'#facc15', fontSize:11, fontWeight:'800' }}>{Number(commentMatch.senderSkillRating).toFixed(2)} ★</Text>}
                                                            <Text style={{ color: colors.textMuted, fontSize:10, marginTop:2 }}>• kurucu</Text>
                                                        </View>
                                                        {mkCmSlot('partner', cmPartner, '#6d28d9')}
                                                    </View>
                                                    <View style={{ flex:1 }}>
                                                        <Text style={{ color: colors.textMuted, fontSize:10, fontWeight:'700', marginBottom:4 }}>RAKİP TAKIM</Text>
                                                        {mkCmSlot('opp1', cmOpp1, '#dc2626')}
                                                        {mkCmSlot('opp2', cmOpp2, '#dc2626')}
                                                    </View>
                                                </View>
                                            </View>
                                        );
                                    })() : (
                                        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:3, marginBottom:8 }}>
                                            {allP2.map((p, idx) => (
                                                <View key={p.id || idx} style={{ flexDirection:'row', alignItems:'center', gap:3 }}>
                                                    {idx > 0 && <Text style={{ color: colors.textMuted }}>·</Text>}
                                                    <Text style={{ color:'#fff', fontSize:14, fontWeight:'700' }}>{senderAlias(p)}</Text>
                                                    {p.skillRating != null && (
                                                        <Text style={{ color:'#facc15', fontSize:12, fontWeight:'800' }}>{Number(p.skillRating).toFixed(2)} ★</Text>
                                                    )}
                                                </View>
                                            ))}
                                        </View>
                                    )}
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
                                        <View key={c.id} style={{ marginBottom:14, paddingBottom:11, borderBottomWidth:1, borderBottomColor: colors.border }}>
                                            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
                                                <View style={{ flex:1 }}>
                                                    <Text style={{ color: cfg2.color, fontSize:13, fontWeight:'700', marginBottom:3 }}>{c.user?.username}</Text>
                                                    <Text style={{ color:'#fff', fontSize:14, lineHeight:21 }}>{c.content}</Text>
                                                    <Text style={{ color: colors.textMuted, fontSize:11, marginTop:4 }}>
                                                        {new Date(c.createdAt).toLocaleString(t.dateLocale, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                                                    </Text>
                                                </View>
                                                {canDelete(c) && (
                                                    <TouchableOpacity onPress={() => deleteComment(c.id)} style={{ padding:5, marginLeft:8 }}>
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
                                <View style={{ flexDirection:'row', gap:3, paddingHorizontal:9, paddingVertical:7, paddingBottom: Platform.OS === 'ios' ? 28 : 10, borderTopWidth:1, borderTopColor: colors.border, backgroundColor: colors.bg }}>
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
                                        style={[s.joinBtn, { paddingHorizontal:15, height:44, justifyContent:'center', alignSelf:'center' }, sendingComment && { opacity:0.6 }]}
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
                                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start', paddingVertical:7, borderBottomWidth:1, borderBottomColor:colors.border }}>
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
                                    if (tourn.type === '1' || tourn.type === '2') {
                                        const averaj=x=>(x.gamesWon+x.gamesLost)===0?0:x.gamesWon/(x.gamesWon+x.gamesLost);
                                        if (Math.abs(averaj(b)-averaj(a))>0.001) return averaj(b)-averaj(a);
                                    }
                                    const sr=x=>x.setsLost===0?(x.setsWon===0?0:Infinity):x.setsWon/x.setsLost;
                                    if (Math.abs(sr(b)-sr(a))>0.001) return sr(b)-sr(a);
                                    const gr=x=>x.gamesLost===0?(x.gamesWon===0?0:Infinity):x.gamesWon/x.gamesLost;
                                    if (gr(b)!==gr(a)) return gr(b)-gr(a);
                                    return stableTiebreakHash(tourn.id, b.id) - stableTiebreakHash(tourn.id, a.id);
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
                                    <View style={[s.modalHeader, { paddingHorizontal:21 }]}>
                                        <Text style={[s.modalTitle, { flex:1 }]} numberOfLines={2}>🏆 {tourn.name}</Text>
                                        <TouchableOpacity onPress={() => setSelectedArchiveTournament(null)}>
                                            <Text style={s.modalClose}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                    <View style={{ flexDirection:'row', gap:3, marginBottom:10, paddingHorizontal:21 }}>
                                        {tabs.map(tab => (
                                            <TouchableOpacity key={tab} onPress={() => setArchiveModalTab(tab)}
                                                style={{ paddingHorizontal:9, paddingVertical:3, borderRadius:8, backgroundColor: archiveModalTab===tab ? '#a855f740' : 'transparent', borderWidth:1, borderColor: archiveModalTab===tab ? '#a855f760' : colors.border }}>
                                                <Text style={{ color: archiveModalTab===tab ? '#c084fc' : colors.textMuted, fontSize:12, fontWeight:'700' }}>{tabLabel[tab]}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal:21, paddingBottom:21 }}>
                                        {archiveModalTab === 'details' && (
                                            <>
                                                <View style={{ backgroundColor:'#16a34a20', borderRadius:8, paddingHorizontal:9, paddingVertical:3, alignSelf:'flex-start', borderWidth:1, borderColor:'#16a34a50', marginBottom:14 }}>
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
                                                                            <View key={match.id} style={{ width:'48.5%', backgroundColor:'#0f172a', borderRadius:8, padding:0, marginBottom:3, borderWidth:1, borderColor: isDone ? '#16a34a30' : '#334155' }}>
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
                                                        <View style={{ flexDirection:'row', paddingVertical:1, borderBottomWidth:1, borderBottomColor:colors.border, marginBottom:2 }}>
                                                            <Text style={{ color:colors.textMuted, fontSize:10, fontWeight:'700', flex:1 }}>Oyuncu</Text>
                                                            {['O','G','M','Av','P'].map(h => (
                                                                <Text key={h} style={{ color:colors.textMuted, fontSize:10, fontWeight:'700', width:28, textAlign:'center' }}>{h}</Text>
                                                            ))}
                                                        </View>
                                                        {archiveStandings.map((row2, i) => (
                                                            <View key={row2.id} style={{ flexDirection:'row', alignItems:'center', paddingVertical:2, borderBottomWidth: i < archiveStandings.length-1 ? 1 : 0, borderBottomColor:colors.border+'30' }}>
                                                                <Text style={{ color:'#fff', fontSize:11, flex:1 }} numberOfLines={1}>{i+1}. {row2.name}</Text>
                                                                {[row2.played, row2.won, row2.lost, (() => { const t = row2.gamesWon + row2.gamesLost; return t === 0 ? '-' : `${Math.round((row2.gamesWon / t) * 100)}%`; })(), row2.points].map((v,j) => (
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
                                    {mp.user?.username} · {mp.subCategory}
                                </Text>

                                {/* Like + Comment bar */}
                                <View style={{ flexDirection: 'row', gap: 3, marginTop: 14 }}>
                                    <TouchableOpacity onPress={toggleMediaLike} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                        <Text style={{ color: isLiked ? '#f43f5e' : '#ffffff80', fontSize: 22 }}>♥</Text>
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{likeCount}</Text>
                                    </TouchableOpacity>
                                    <TouchableOpacity onPress={openMediaComments} style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                                        <Text style={{ color: mediaShowComments ? cfg.color : '#ffffff80', fontSize: 20 }}>💬</Text>
                                        <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700' }}>{mediaComments.length || mp._count?.comments || 0}</Text>
                                    </TouchableOpacity>
                                </View>

                                {/* Inline comments */}
                                {mediaShowComments && (
                                    <View style={{ width: '90%', marginTop: 10, backgroundColor: '#00000060', borderRadius: 12, padding: 7, maxHeight: 180 }}>
                                        <ScrollView style={{ maxHeight: 100 }} showsVerticalScrollIndicator={false}>
                                            {mediaComments.map((c, i) => (
                                                <View key={c.id || i} style={{ flexDirection: 'row', gap: 3, marginBottom: 5 }}>
                                                    <Text style={{ color: cfg.color, fontSize: 12, fontWeight: '800' }}>{c.user?.username}</Text>
                                                    <Text style={{ color: '#ffffffcc', fontSize: 12, flex: 1 }}>{c.content}</Text>
                                                </View>
                                            ))}
                                        </ScrollView>
                                        <View style={{ flexDirection: 'row', gap: 3, marginTop: 6 }}>
                                            <TextInput
                                                style={{ flex: 1, backgroundColor: '#ffffff15', borderRadius: 8, paddingHorizontal: 7, paddingVertical: 3, color: '#fff', fontSize: 12, borderWidth: 1, borderColor: '#ffffff30' }}
                                                placeholder="Yorum yaz..."
                                                placeholderTextColor="#ffffff50"
                                                value={mediaCommentText}
                                                onChangeText={setMediaCommentText}
                                            />
                                            <TouchableOpacity onPress={sendMediaComment} disabled={sendingMediaComment || !mediaCommentText.trim()}
                                                style={{ backgroundColor: cfg.color, borderRadius: 8, paddingHorizontal: 11, justifyContent: 'center', opacity: !mediaCommentText.trim() ? 0.4 : 1 }}>
                                                <Text style={{ color: '#fff', fontWeight: '900', fontSize: 14 }}>{sendingMediaComment ? '…' : '↑'}</Text>
                                            </TouchableOpacity>
                                        </View>
                                    </View>
                                )}

                                {/* Prev/Next nav */}
                                <View style={{ flexDirection: 'row', gap: 3, marginTop: 16 }}>
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
        <RatingInfoModal visible={showRatingInfo} onClose={() => setShowRatingInfo(false)} cfg={cfg} />
        </>
    );
}

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
    container:        { flex:1, backgroundColor: colors.bg },
    header:           { flexDirection:'row', alignItems:'center', paddingHorizontal:17, marginBottom:14, gap:3 },
    back:             { fontSize:15, fontWeight:'700' },
    title:            { color:'#fff', fontSize:20, fontWeight:'900', flex:1 },

    tabBar:           { flexGrow:0, marginBottom:12 },
    tabBarInner:      { paddingHorizontal:13, gap:3 },
    tab:              { paddingHorizontal:11, paddingTop:4, paddingBottom:8, borderRadius:20, backgroundColor: colors.surface, borderWidth:1, borderColor: colors.border, alignItems:'center', justifyContent:'center' },
    tabText:          { color: colors.textSecondary, fontSize:12, fontWeight:'700', lineHeight:20, includeFontPadding: false },
    tabTextActive:    { color:'#fff' },

    list:             { paddingHorizontal:1, gap:3, paddingBottom:57 },
    sectionTitle:     { color: colors.textSecondary, fontSize:12, fontWeight:'800', marginTop:4, marginBottom:4 },

    createBtn:        { backgroundColor: colors.surface, borderRadius:10, paddingVertical:3, paddingHorizontal:7, alignItems:'center', borderWidth:1, borderStyle:'dashed' },
    createBtnText:    { fontWeight:'700', fontSize:14 },

    courtResBtn:      { backgroundColor: '#9333ea20', borderRadius:10, paddingVertical:3, paddingHorizontal:7, alignItems:'center', borderWidth:1, borderColor: '#9333ea50' },
    courtResBtnText:  { color: '#a855f7', fontWeight:'800', fontSize:12 },

    filterBox:        { backgroundColor: colors.surface, borderRadius:12, padding:5, borderWidth:1, borderColor: colors.border, gap:3 },
    filterInputRow:   { flexDirection:'row', gap:3, alignItems:'center' },
    filterInput:      { flex:1, backgroundColor: colors.surface2, color:'#fff', borderRadius:8, paddingHorizontal:7, paddingVertical:3, borderWidth:1, borderColor: colors.border, fontSize:12 },
    nearBtn:          { backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:6, paddingVertical:3, borderWidth:1, borderColor: colors.border, justifyContent:'center' },
    nearBtnText:      { fontSize:11, fontWeight:'700' },
    dateChips:        { flexDirection:'row', gap:3, flexWrap:'wrap' },
    dateChip:         { paddingHorizontal:6, paddingVertical:1, borderRadius:8, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    dateChipText:     { color: colors.textSecondary, fontSize:11, fontWeight:'700' },
    clearChip:        { paddingHorizontal:6, paddingVertical:1, borderRadius:8, backgroundColor:'#dc262620', borderWidth:1, borderColor:'#dc262640' },
    clearChipText:    { color:'#f87171', fontSize:11, fontWeight:'700' },

    empty:            { alignItems:'center', paddingTop:57, paddingBottom:37 },
    emptyEmoji:       { fontSize:48, marginBottom:12 },
    emptyText:        { color: colors.textSecondary, fontSize:15, fontWeight:'600' },
    emptyBtn:         { marginTop:16, backgroundColor: colors.purple, borderRadius:12, paddingHorizontal:17, paddingVertical:7 },
    emptyBtnText:     { color:'#fff', fontWeight:'700' },

    card:             { backgroundColor: colors.surface, borderRadius:14, paddingHorizontal:7, paddingTop:5, paddingBottom:5, borderWidth:1, borderColor: colors.border },
    cardHeader:       { flexDirection:'row', alignItems:'flex-start', gap:3, marginBottom:2 },
    avatar:           { justifyContent:'center', alignItems:'center', borderWidth:1 },
    avatarText:       { fontWeight:'800' },
    cardName:         { color:'#fff', fontWeight:'700', fontSize:14 },
    cardSub:          { color: colors.textMuted, fontSize:11 },
    ratingText:       { fontSize:11, fontWeight:'900' },

    modeBadge:        { borderRadius:8, paddingHorizontal:5, paddingVertical:0, borderWidth:1, alignSelf:'flex-start' },
    modeBadgeText:    { fontSize:10, fontWeight:'700' },
    joinedCount:      { color: colors.textMuted, fontSize:10, marginTop:2 },

    flexBanner:       { backgroundColor:'#eab30815', borderRadius:10, padding:5, marginBottom:4, borderWidth:1, borderColor:'#eab30840' },
    flexTitle:        { color:'#fbbf24', fontSize:11, fontWeight:'700', marginBottom:2 },
    flexDesc:         { color:'#fcd34d99', fontSize:10 },

    levelRow:         { flexDirection:'row', gap:3, marginBottom:4, flexWrap:'wrap' },
    levelBadge:       { backgroundColor: colors.surface2, borderRadius:8, paddingHorizontal:5, paddingVertical:0, color:'#d1d5db', fontSize:11, fontWeight:'700', borderWidth:1, borderColor: colors.border },
    levelDetail:      { backgroundColor:'#a855f720', borderRadius:8, paddingHorizontal:5, paddingVertical:0, color:'#c084fc', fontSize:11, fontWeight:'700', borderWidth:1, borderColor:'#a855f740' },

    cardMsg:          { color: colors.textSecondary, fontSize:13, marginBottom:4 },
    cardMeta:         { flexDirection:'row', flexWrap:'wrap', gap:3, marginBottom:10 },
    metaItem:         { backgroundColor: colors.surface2, paddingHorizontal:5, paddingVertical:0, borderRadius:8, borderWidth:1, borderColor: colors.border },
    metaItemText:     { color: colors.text, fontSize:11, fontWeight:'600' },

    joinBtn:          { borderRadius:10, paddingVertical:6, alignItems:'center', backgroundColor: colors.purple },
    joinBtnText:      { color:'#fff', fontWeight:'800', fontSize:13 },
    msgBtn:           { backgroundColor:'#2563eb20', borderRadius:10, paddingVertical:5, alignItems:'center', borderWidth:1, borderColor:'#2563eb40', flex:1 },
    msgBtnText:       { color:'#60a5fa', fontWeight:'700', fontSize:12 },
    cancelBtn:        { backgroundColor:'#dc262620', borderRadius:10, paddingVertical:5, alignItems:'center', borderWidth:1, borderColor:'#dc262640', flex:1 },
    cancelBtnText:    { color:'#f87171', fontWeight:'700', fontSize:12 },
    waitingBox:       { backgroundColor: colors.surface2, borderRadius:10, paddingVertical:5, alignItems:'center', borderWidth:1, borderColor: colors.border },
    waitingText:      { color: colors.textMuted, fontSize:13, fontWeight:'600' },

    ownerActions:     { gap:3 },
    ownerBtnRow:      { flexDirection:'row', gap:3 },
    joinRequestsBox:  { backgroundColor: colors.surface2, borderRadius:12, padding:9, borderWidth:1, borderColor: colors.border },
    joinRequestsTitle:{ color:'#fff', fontSize:12, fontWeight:'700', marginBottom:8 },
    joinRequestRow:   { flexDirection:'row', alignItems:'center', gap:3, marginBottom:6 },
    joinRequestName:  { flex:1, color: colors.textSecondary, fontSize:12 },
    acceptBtn:        { backgroundColor:'#16a34a', borderRadius:8, width:28, height:28, justifyContent:'center', alignItems:'center' },
    declineBtn:       { backgroundColor:'#dc2626', borderRadius:8, width:28, height:28, justifyContent:'center', alignItems:'center' },

    participantsRow:      { flexDirection:'row', flexWrap:'wrap', gap:3, marginBottom:6 },
    participantChip:      { backgroundColor:'#16a34a15', borderRadius:8, paddingHorizontal:5, paddingVertical:0, borderWidth:1, borderColor:'#16a34a40' },
    participantChipText:  { color:'#4ade80', fontSize:11, fontWeight:'700' },
    pendingBadge:         { backgroundColor:'#a855f715', borderRadius:8, paddingHorizontal:7, paddingVertical:2, borderWidth:1, borderColor:'#a855f740', marginBottom:4 },
    pendingBadgeText:     { color:'#c084fc', fontSize:12, fontWeight:'700' },

    scoreText:        { color:'#fff', fontSize:16, fontWeight:'900' },
    scoreBtn:         { backgroundColor:'#a855f720', borderRadius:10, paddingHorizontal:9, paddingVertical:3, borderWidth:1, borderColor:'#a855f750' },
    scoreBtnText:     { color:'#c084fc', fontSize:12, fontWeight:'700' },
    commentBtn:       { backgroundColor:'#0ea5e920', borderRadius:10, paddingHorizontal:9, paddingVertical:3, borderWidth:1, borderColor:'#0ea5e950' },
    commentBtnText:   { color:'#38bdf8', fontSize:12, fontWeight:'700' },
    confirmBtn:       { backgroundColor:'#16a34a30', borderRadius:8, paddingHorizontal:7, paddingVertical:1, marginTop:4, borderWidth:1, borderColor:'#16a34a60' },
    confirmBtnText:   { color:'#4ade80', fontSize:11, fontWeight:'700' },
    scoreForm:        { marginTop:10 },
    scoreInputRow:    { flexDirection:'row', alignItems:'center', justifyContent:'center', gap:3 },
    scoreInput:       { backgroundColor: colors.surface2, color:'#fff', borderRadius:10, paddingHorizontal:9, paddingVertical:7, borderWidth:1, borderColor: colors.border, fontSize:18, fontWeight:'800', width:60, textAlign:'center' },

    modalOverlay:     { flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' },
    modalBox:         { backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, padding:21, paddingLeft:0, paddingRight:0, paddingBottom:37, maxHeight:'92%' },
    modalHeader:      { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:20 },
    modalTitle:       { color:'#fff', fontSize:18, fontWeight:'900' },
    modalClose:       { color: colors.textMuted, fontSize:22 },

    fieldLabel:       { color: colors.textSecondary, fontSize:12, fontWeight:'700', marginBottom:6 },
    fieldHint:        { color: colors.textMuted, fontSize:10, marginBottom:8 },
    fieldInput:       { backgroundColor: colors.surface2, color:'#fff', borderRadius:12, paddingHorizontal:11, paddingVertical:9, borderWidth:1, borderColor: colors.border, fontSize:14, marginBottom:14 },
    chipRow:          { flexDirection:'row', flexWrap:'wrap', gap:3, marginBottom:14 },
    chipBtn:          { paddingHorizontal:7, paddingVertical:3, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    chipBtnActive:    { backgroundColor: colors.purple, borderColor: colors.purple },
    chipBtnText:      { color: colors.textSecondary, fontSize:12, fontWeight:'700' },
    chipBtnTextActive:{ color:'#fff' },
    submitBtn:        { backgroundColor: colors.purple, borderRadius:14, paddingVertical:11, alignItems:'center', marginTop:8 },
    submitBtnText:    { color:'#fff', fontWeight:'800', fontSize:15 },

    switchRow:        { flexDirection:'row', alignItems:'center', backgroundColor: colors.surface2, borderRadius:14, padding:11, marginBottom:14, borderWidth:1, borderColor: colors.border },

    eloWarning:       { backgroundColor:'#dc262615', borderRadius:12, padding:9, marginBottom:14, borderWidth:1, borderColor:'#dc262640' },
    eloWarningText:   { color:'#fca5a5', fontSize:12, fontWeight:'600', lineHeight:18 },
    modeHint:         { color:'#60a5fa', fontSize:11, fontWeight:'600', marginBottom:10, marginTop:-6 },

    profileHeader:    { alignItems:'center', paddingVertical:17, gap:3 },
    profileName:      { color:'#fff', fontSize:20, fontWeight:'900', textAlign:'center' },
    profileUsername:  { color: colors.textMuted, fontSize:13 },
    profileMeta:      { color: colors.textSecondary, fontSize:12, marginTop:4 },
    profileBioBox:    { backgroundColor: colors.surface2, borderRadius:12, padding:11, marginBottom:14, borderWidth:1, borderColor: colors.border },
    profileBioText:   { color: colors.textSecondary, fontSize:13, lineHeight:20 },
    profileSection:   { backgroundColor: colors.surface2, borderRadius:14, padding:11, marginBottom:14, borderWidth:1, borderColor: colors.border, gap:3 },
    profileSectionTitle:{ color:'#fff', fontSize:13, fontWeight:'800', marginBottom:4 },
    profileInterestRow: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', paddingVertical:3, borderTopWidth:1, borderTopColor: colors.border },
    profileInterestName:{ color:'#fff', fontSize:14, fontWeight:'700', textTransform:'capitalize' },
    profileWL:        { color: colors.textMuted, fontSize:11, marginTop:2 },
    profileRating:    { fontSize:15, fontWeight:'900' },
    levelPill:        { borderRadius:8, paddingHorizontal:5, paddingVertical:0, borderWidth:1 },
    levelPillText:    { fontSize:10, fontWeight:'700' },
    privateBox:       { backgroundColor:'#374151', borderRadius:12, paddingHorizontal:13, paddingVertical:7, marginTop:8 },
    privateText:      { color:'#9ca3af', fontSize:13, fontWeight:'700' },

    courtResultsBox:  { backgroundColor: colors.surface2, borderRadius:12, borderWidth:1, borderColor: colors.border, marginBottom:10, overflow:'hidden' },
    courtResultRow:   { padding:9, borderBottomWidth:1, borderBottomColor: colors.border, flexDirection:'row', alignItems:'center' },
    courtResultName:  { color:'#fff', fontSize:13, fontWeight:'700' },
    courtResultCity:  { color: colors.textMuted, fontSize:11, marginTop:2 },
    selectedCourtBox: { flexDirection:'row', alignItems:'center', justifyContent:'space-between', backgroundColor:'#16a34a20', borderRadius:10, padding:7, marginBottom:10, borderWidth:1, borderColor:'#16a34a50' },
    selectedCourtText:{ color:'#4ade80', fontSize:13, fontWeight:'700', flex:1 },
    addCourtBtn:      { paddingVertical:7, alignItems:'center', marginBottom:10 },
    addCourtBtnText:  { color: colors.purple, fontSize:13, fontWeight:'700' },
    manualCourtBox:   { backgroundColor: colors.surface2, borderRadius:12, padding:9, marginBottom:10, borderWidth:1, borderColor: colors.border },
    manualCourtNote:  { color:'#fbbf24', fontSize:11, marginBottom:10, lineHeight:16 },

    checkRow:         { flexDirection:'row', alignItems:'center', gap:3, marginBottom:14 },
    checkbox:         { width:22, height:22, borderRadius:6, borderWidth:2, borderColor: colors.border, justifyContent:'center', alignItems:'center' },
    checkboxChecked:  { backgroundColor: colors.purple, borderColor: colors.purple },
    checkLabel:       { color: colors.textSecondary, fontSize:13, fontWeight:'600' },

    triRow:           { flexDirection:'row', gap:3, marginBottom:12 },
    triBtn:           { flex:1, backgroundColor: colors.surface2, borderRadius:10, paddingVertical:4, paddingHorizontal:5, borderWidth:1, borderColor: colors.border, alignItems:'center' },
    triBtnFilled:     { borderColor: colors.purple+'80' },
    triLabel:         { color: colors.textMuted, fontSize:10, fontWeight:'700', marginBottom:2 },
    triValue:         { color:'#fff', fontSize:12, fontWeight:'800', textAlign:'center' },
    triPlaceholder:   { color: colors.textMuted, fontSize:13 },

    storyNavBtn:      { backgroundColor:'#ffffff20', borderRadius:12, paddingHorizontal:17, paddingVertical:7 },

    chip:             { paddingHorizontal:9, paddingVertical:4, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border },
    chipText:         { color: colors.textSecondary, fontSize:12, fontWeight:'700' },
});
