import { useEffect, useState, useCallback, useRef } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import {
    View, Text, ScrollView, FlatList, TouchableOpacity, StyleSheet,
    RefreshControl, ActivityIndicator, TextInput, Modal,
    Alert, KeyboardAvoidingView, Platform, Switch, Linking, Image,
    InteractionManager,
} from 'react-native';
import { useSelector } from 'react-redux';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import api from '../../services/api';
import { onSocket, onSocketReconnect } from '../../services/socket';
import colors from '../../theme/colors';
import useT from '../../hooks/useT';
import CityPickerModal from '../../components/CityPickerModal';

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

const DURATIONS = [
    { value: '60',  label: '60 dk' },
    { value: '90',  label: '90 dk' },
    { value: '120', label: '120 dk' },
    { value: '150', label: '120+ES' },
];

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
    if (sub === 'tennis')
        return ['rivals', 'tournaments', 'coaches', 'equipment', 'media', 'news', 'posts', 'archive'];
    return ['rivals', 'tournaments', 'coaches', 'archive', 'media'];
}

// ─── Small helpers ─────────────────────────────────────────────────────────────

// Returns sport alias if set, otherwise falls back to @username
const senderAlias = (sender) => sender?.interests?.[0]?.alias || `@${sender?.username}`;

function Avatar({ name, size=40, color=colors.purple }) {
    return (
        <View style={[s.avatar, { width:size, height:size, borderRadius:size/2, backgroundColor: color+'40', borderColor: color+'60' }]}>
            <Text style={[s.avatarText, { fontSize:size*0.38, color:color }]}>{name?.[0]?.toUpperCase()||'?'}</Text>
        </View>
    );
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
                                                {i.skillRating > 0 && (
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
    section:      { backgroundColor: colors.surface2, borderRadius:14, padding:12, marginBottom:12, borderWidth:1, borderColor: colors.border },
    sectionTitle: { color:'#fff', fontSize:13, fontWeight:'800', marginBottom:10 },
    playerRow:    { flexDirection:'row', alignItems:'center', gap:10, paddingVertical:7, borderTopWidth:1, borderTopColor: colors.border },
    playerName:   { color:'#fff', fontSize:13, fontWeight:'700' },
    playerSub:    { color: colors.textMuted, fontSize:11, marginTop:1 },
    emptyTxt:     { color: colors.textMuted, fontSize:12, textAlign:'center', paddingVertical:8 },
    chatBtn:      { backgroundColor:'#2563eb30', borderRadius:8, width:28, height:28, justifyContent:'center', alignItems:'center', borderWidth:1, borderColor:'#2563eb50' },
    chatBtnTxt:   { fontSize:13 },
});

function RivalDetailModal({ visible, item, myId, sub, cfg, t, onClose, navigation, handleJoin, handleCancel, handleRespondJoin, onEdit }) {
    const [localParticipants, setLocalParticipants] = useState(null);
    const [localJoinRequests, setLocalJoinRequests] = useState(null);
    const [comments, setComments] = useState([]);
    const [loadingComments, setLoadingComments] = useState(false);
    const [commentText, setCommentText] = useState('');
    const [sendingComment, setSendingComment] = useState(false);

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
    const required = item.matchType === 'DOUBLE' ? 3 : (item.teamSize || 1);
    const filled = participants.length;
    const mySentReq = item._myJoinStatus;
    const isFull = filled >= required;
    const isParticipant = participants.some(p => p.id === myId);
    const isInvolved = isOwner || isParticipant || (mySentReq !== null && mySentReq !== undefined);
    const participantIds = new Set([item.senderId, ...participants.map(p => p.id)]);
    const canDeleteComment = (c) => {
        const isAuthor = c.user?.id === myId;
        const iAmParticipant = participantIds.has(myId);
        const commenterIsParticipant = participantIds.has(c.user?.id);
        return isAuthor || (iAmParticipant && !commenterIsParticipant);
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
        <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
            <View style={{ flex:1, backgroundColor: colors.bg }}>
                {/* Header */}
                <View style={{ flexDirection:'row', alignItems:'center', paddingHorizontal:8, paddingTop: Platform.OS==='ios' ? 56 : 24, paddingBottom:14, borderBottomWidth:1, borderBottomColor: colors.border }}>
                    <TouchableOpacity onPress={onClose} style={{ marginRight:14, padding:4 }}>
                        <Text style={{ color:'#fff', fontSize:22, fontWeight:'300' }}>←</Text>
                    </TouchableOpacity>
                    <View style={{ flex:1 }}>
                        <Text style={{ color:'#fff', fontSize:16, fontWeight:'800' }}>{item.subCategory}</Text>
                        <Text style={{ color: colors.textMuted, fontSize:12, marginTop:1 }}>{senderAlias(item.sender)}</Text>
                    </View>
                    <ModeBadge mode={item.matchMode} />
                </View>

                {/* Scrollable content */}
                <ScrollView style={{ flex:1 }} contentContainerStyle={{ paddingHorizontal:8, paddingTop:16, paddingBottom:8 }} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">

                    {/* Tarih / Saat / Süre — dikey, ortalı */}
                    <View style={{ alignItems:'center', marginBottom:12 }}>
                        {item.matchDate && (
                            <Text style={{ color:'#fff', fontSize:18, fontWeight:'800' }}>
                                📅 {new Date(item.matchDate).toLocaleDateString(t.dateLocale, { day:'numeric', month:'long', weekday:'long' })}
                            </Text>
                        )}
                        {item.matchTime && (
                            <Text style={{ color: cfg.color, fontSize:16, fontWeight:'700', marginTop:4 }}>
                                🕐 {item.matchTime}
                            </Text>
                        )}
                        {item.duration && (
                            <Text style={{ color: colors.textMuted, fontSize:14, marginTop:4 }}>
                                ⏱ {item.duration} {t.timeMinSuffix}
                            </Text>
                        )}
                        {item.courtName && (
                            <Text style={{ color:'#60a5fa', fontSize:13, marginTop:6 }}>🏟️ {item.courtName}</Text>
                        )}
                        {item.level && (
                            <View style={[s.levelRow, { marginTop:6, justifyContent:'center' }]}>
                                <Text style={s.levelBadge}>{LEVEL_EMOJI[item.level]} {t.levelTr[item.level] || item.level}</Text>
                                {item.levelDetail && <Text style={s.levelDetail}>{item.levelDetail}</Text>}
                            </View>
                        )}
                    </View>

                    {/* Gönderen */}
                    <View style={{ flexDirection:'row', alignItems:'center', gap:10, marginBottom:item.message ? 8 : 12, paddingBottom:12, borderBottomWidth:1, borderBottomColor: colors.border }}>
                        <Avatar name={item.sender?.username} size={34} color={cfg.color} />
                        <View style={{ flex:1, flexDirection:'row', alignItems:'center', gap:6 }}>
                            <Text style={s.cardName}>{senderAlias(item.sender)}</Text>
                            {item.sender?.interests?.[0]?.skillRating > 0 && (
                                <Text style={{ color:'#facc15', fontSize:12, fontWeight:'800' }}>{Number(item.sender.interests[0].skillRating).toFixed(2)} ★</Text>
                            )}
                        </View>
                        <View style={[s.modeBadge, { backgroundColor:cfg.color+'20', borderColor:cfg.color+'40' }]}>
                            <Text style={[s.modeBadgeText, { color:cfg.color }]}>
                                {TEAM_SPORTS.has(sub) ? `${item.teamSize||1}v${item.teamSize||1}` : (item.matchType==='DOUBLE' ? '2v2' : '1v1')}
                            </Text>
                        </View>
                    </View>
                    {item.message && <Text style={[s.cardMsg, { marginBottom:12 }]}>{item.message}</Text>}

                    {/* Oyuncular */}
                    <View style={det.section}>
                        <Text style={det.sectionTitle}>👥 {t.players || 'Oyuncular'} ({1 + filled} / {1 + required})</Text>
                        <View style={det.playerRow}>
                            <Avatar name={item.sender?.username} size={32} color={cfg.color} />
                            <View style={{ flex:1 }}>
                                <Text style={det.playerName}>{item.sender?.fullName || item.sender?.username}</Text>
                                <Text style={det.playerSub}>@{item.sender?.username} · {t.founder || 'Kurucu'}</Text>
                            </View>
                        </View>
                        {participants.map((p, i) => (
                            <View key={p.id || i} style={det.playerRow}>
                                <Avatar name={p.username} size={32} color={cfg.color} />
                                <View style={{ flex:1 }}>
                                    <Text style={det.playerName}>{p.fullName || p.username}</Text>
                                    <Text style={det.playerSub}>@{p.username}</Text>
                                </View>
                            </View>
                        ))}
                        {filled === 0 && <Text style={det.emptyTxt}>{t.noPlayersYet || 'Henüz katılan yok'}</Text>}
                    </View>

                    {/* İstekler (sadece ilan sahibine) */}
                    {isOwner && joinRequests.length > 0 && (
                        <View style={det.section}>
                            <Text style={det.sectionTitle}>📬 {t.requests || 'İstekler'} ({joinRequests.length})</Text>
                            {joinRequests.map(jr => (
                                <View key={jr.id} style={det.playerRow}>
                                    <Avatar name={jr.user?.username} size={32} color={cfg.color} />
                                    <View style={{ flex:1 }}>
                                        <Text style={det.playerName}>{jr.user?.fullName || jr.user?.username}</Text>
                                        <Text style={det.playerSub}>@{jr.user?.username}</Text>
                                    </View>
                                    <View style={{ flexDirection:'row', gap:6 }}>
                                        <TouchableOpacity style={s.acceptBtn} onPress={() => acceptLocal(jr.id)}>
                                            <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>✓</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={s.declineBtn} onPress={() => rejectLocal(jr.id)}>
                                            <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>✕</Text>
                                        </TouchableOpacity>
                                    </View>
                                </View>
                            ))}
                        </View>
                    )}

                    {/* Katıl / İptal aksiyonu */}
                    <View style={{ marginBottom:20 }}>
                        {isOwner ? (
                            <View style={{ flexDirection: 'row', gap: 10 }}>
                                <TouchableOpacity
                                    style={[s.cancelBtn, { flex: 1, backgroundColor: colors.purple + '20', borderColor: colors.purple + '40' }]}
                                    onPress={() => { onClose(); setTimeout(onEdit, 300); }}
                                >
                                    <Text style={[s.cancelBtnText, { color: colors.purple }]}>✏️ Düzenle</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.cancelBtn, { flex: 1 }]} onPress={() => { onClose(); setTimeout(handleCancel, 300); }}>
                                    <Text style={s.cancelBtnText}>{t.cancelAdBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : mySentReq === 'PENDING' ? (
                            <View style={s.waitingBox}><Text style={s.waitingText}>{t.waitingReq}</Text></View>
                        ) : mySentReq === 'ACCEPTED' ? (
                            <View style={[s.waitingBox, { backgroundColor:'#16a34a20', borderColor:'#16a34a40' }]}>
                                <Text style={[s.waitingText, { color:'#4ade80' }]}>{t.requestAccepted || '✓ Kabul edildiniz!'}</Text>
                            </View>
                        ) : isFull ? (
                            <View style={s.waitingBox}><Text style={s.waitingText}>{t.ilanFull || 'İlan doldu'}</Text></View>
                        ) : (
                            <TouchableOpacity style={[s.joinBtn, { backgroundColor: cfg.color }]} onPress={() => { onClose(); setTimeout(handleJoin, 300); }}>
                                <Text style={s.joinBtnText}>{t.joinBtn}</Text>
                            </TouchableOpacity>
                        )}
                    </View>

                    {/* Yorumlar bölümü */}
                    <Text style={{ color:'#fff', fontSize:15, fontWeight:'800', marginBottom:14 }}>
                        💬 {t.matchCommentsTitle}{comments.length > 0 ? ` (${comments.length})` : ''}
                    </Text>
                    {loadingComments ? (
                        <ActivityIndicator color={cfg.color} style={{ marginTop:16 }} />
                    ) : comments.length === 0 ? (
                        <Text style={{ color: colors.textMuted, textAlign:'center', marginTop:8, fontSize:13 }}>{t.matchCommentEmpty}</Text>
                    ) : (
                        comments.map(c => (
                            <View key={c.id} style={{ marginBottom:14, paddingBottom:14, borderBottomWidth:1, borderBottomColor: colors.border }}>
                                <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
                                    <View style={{ flex:1 }}>
                                        <Text style={{ color: cfg.color, fontSize:13, fontWeight:'700', marginBottom:3 }}>@{c.user?.username}</Text>
                                        <Text style={{ color:'#fff', fontSize:14, lineHeight:21 }}>{c.content}</Text>
                                        <Text style={{ color: colors.textMuted, fontSize:11, marginTop:4 }}>
                                            {new Date(c.createdAt).toLocaleString(t.dateLocale, { day:'numeric', month:'short', hour:'2-digit', minute:'2-digit' })}
                                        </Text>
                                    </View>
                                    {canDeleteComment(c) && (
                                        <TouchableOpacity onPress={() => deleteComment(c.id)} style={{ padding:8, marginLeft:8 }}>
                                            <Text style={{ color:'#f87171', fontSize:14 }}>✕</Text>
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
}

// ─── Rival Card ────────────────────────────────────────────────────────────────

function RivalCard({ item, myId, sub, onRefresh, navigation, onUserPress, autoOpen, onAutoOpened, myRating = 0 }) {
    const t = useT();
    const cfg = getConfig(sub);
    const isOwner = item.senderId === myId;
    const participants = Array.isArray(item.participants) ? item.participants : [];
    const required = item.matchType === 'DOUBLE' ? 3 : (item.teamSize || 1);
    const filled = participants.length;
    const isFull = filled >= required;
    const [localJoinStatus, setLocalJoinStatus] = useState(null);
    const mySentReq = localJoinStatus ?? item._myJoinStatus;
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
        <View style={[s.card, item.flexibleSchedule && { borderColor:'#eab30840' }]}>

            {/* ── Tappable info area → opens detail modal ── */}
            <TouchableOpacity activeOpacity={0.85} onPress={() => { setDetailVisible(true); onRefresh(); }}>

                {/* Header */}
                <View style={s.cardHeader}>
                    <Avatar name={item.sender?.username} size={42} color={cfg.color} />
                    <View style={{ flex:1, minWidth:0 }}>
                        <View style={{ flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                            <Text style={s.cardName} numberOfLines={1}>{senderAlias(item.sender)}</Text>
                            {item.sender?.interests?.[0]?.skillRating > 0 && (
                                <Text style={[s.ratingText, { color: cfg.color }]}>
                                    {Number(item.sender.interests[0].skillRating).toFixed(2)} ★
                                </Text>
                            )}
                        </View>
                        {!item.flexibleSchedule && (item.matchDate || item.matchTime || item.duration) && (
                            <View style={{ flexDirection:'row', gap:6, marginTop:2, flexWrap:'wrap' }}>
                                {item.matchDate && <Text style={s.metaItemText}>📅 {new Date(item.matchDate).toLocaleDateString(t.dateLocale,{day:'numeric',month:'short',weekday:'short'})}</Text>}
                                {item.matchTime && <Text style={s.metaItemText}>🕐 {item.matchTime}</Text>}
                                {item.duration && <Text style={s.metaItemText}>⏱ {item.duration} {t.timeMinSuffix}</Text>}
                            </View>
                        )}
                        <Text style={{ color: colors.textMuted, fontSize:11, marginTop:2 }}>
                            💬 Yorumlar {item.commentCount ?? 0}
                        </Text>
                        <Text style={{ fontSize:11, marginTop:2, color: item.isCourtReserved ? '#4ade80' : '#f87171' }}>
                            {item.isCourtReserved ? `✅ ${t.courtReservedLabel}` : `❌ ${t.courtNotReserved}`}
                        </Text>
                        {item.courtName && (
                            <Text style={{ fontSize:11, marginTop:2, color:'#60a5fa' }}>🏟️ {item.courtName}</Text>
                        )}
                    </View>
                    <View style={{ alignItems:'flex-end', gap:4 }}>
                        <View style={{ flexDirection:'row', alignItems:'center', gap:6 }}>
                            {(item.minRating != null || item.maxRating != null) && (
                                <Text style={{ color:'#facc15', fontSize:10, fontWeight:'700' }}>
                                    ⭐ {item.minRating ?? '0'}–{item.maxRating ?? '5'}★
                                </Text>
                            )}
                            <ModeBadge mode={item.matchMode} />
                        </View>
                        <View style={{ flexDirection:'row', alignItems:'center', gap:4 }}>
                            <View style={[s.modeBadge, { backgroundColor: cfg.color+'20', borderColor: cfg.color+'40' }]}>
                                <Text style={[s.modeBadgeText, { color: cfg.color }]}>
                                    {TEAM_SPORTS.has(sub) ? `${item.teamSize||1}v${item.teamSize||1}` : (item.matchType==='DOUBLE' ? '2v2' : '1v1')}
                                </Text>
                            </View>
                            <Text style={s.joinedCount}>{t.joinedCount(filled, TEAM_SPORTS.has(sub) ? item.teamSize : required)}</Text>
                        </View>
                        {isOwner ? (
                            <View style={{ flexDirection: 'row', gap: 5 }}>
                                <TouchableOpacity
                                    style={[s.cancelBtn, { flex: 0, paddingHorizontal: 10, paddingVertical: 5, backgroundColor: colors.purple + '20', borderColor: colors.purple + '40' }]}
                                    onPress={() => setEditVisible(true)}
                                >
                                    <Text style={[s.cancelBtnText, { color: colors.purple }]}>✏️ Düzenle</Text>
                                </TouchableOpacity>
                                <TouchableOpacity style={[s.cancelBtn, { flex: 0, paddingHorizontal: 10, paddingVertical: 5 }]} onPress={handleCancel}>
                                    <Text style={s.cancelBtnText}>{t.cancelAdBtn}</Text>
                                </TouchableOpacity>
                            </View>
                        ) : (
                            mySentReq === 'PENDING' ? (
                                <Text style={{ color:colors.textMuted, fontSize:10 }}>{t.waitingReq}</Text>
                            ) : mySentReq === 'ACCEPTED' ? (
                                <Text style={{ color:'#4ade80', fontSize:10, fontWeight:'700' }}>✓ Kabul</Text>
                            ) : isFull ? (
                                <Text style={{ color:colors.textMuted, fontSize:10 }}>{t.ilanFull || 'Dolu'}</Text>
                            ) : (
                                <TouchableOpacity
                                    style={{ backgroundColor:cfg.color, borderRadius:8, paddingHorizontal:12, paddingVertical:5 }}
                                    onPress={handleJoin}
                                >
                                    <Text style={{ color:'#fff', fontSize:12, fontWeight:'700' }}>{t.joinBtn}</Text>
                                </TouchableOpacity>
                            )
                        )}
                    </View>
                </View>

                {item.flexibleSchedule && (
                    <View style={s.flexBanner}>
                        <Text style={s.flexTitle}>{t.flexibleBanner}</Text>
                        <Text style={s.flexDesc}>{t.flexibleBannerDesc}</Text>
                    </View>
                )}
                {(item.level || item.levelDetail) && (
                    <View style={s.levelRow}>
                        {item.level && <Text style={s.levelBadge}>{LEVEL_EMOJI[item.level]} {t.levelTr[item.level] || item.level}</Text>}
                        {item.levelDetail && <Text style={s.levelDetail}>{item.levelDetail}</Text>}
                    </View>
                )}
                {item.message && <Text style={s.cardMsg}>{item.message}</Text>}
                {/* Kabul edilen oyuncular */}
                {participants.length > 0 && (
                    <View style={s.participantsRow}>
                        {participants.map((p, i) => (
                            <View key={p.id || i} style={s.participantChip}>
                                <Text style={s.participantChipText}>✓ @{p.username}</Text>
                            </View>
                        ))}
                    </View>
                )}
                {/* Bekleyen istek badge */}
                {isOwner && (item.joinRequests||[]).length > 0 && (
                    <View style={s.pendingBadge}>
                        <Text style={s.pendingBadgeText}>📬 {item.joinRequests.length} {t.requests || 'istek'} — {t.tapToSee || 'görmek için tıkla'}</Text>
                    </View>
                )}
            </TouchableOpacity>

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
            handleJoin={() => { setDetailVisible(false); setTimeout(handleJoin, 300); }}
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
                    <TextInput
                        style={s.fieldInput}
                        value={form.location}
                        onChangeText={v => setForm(f => ({ ...f, location: v }))}
                        placeholder="Konum girin..."
                        placeholderTextColor={colors.textMuted}
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

function TextPostCard({ post, cfg, onRefresh }) {
    const t = useT();
    const isLiked = Array.isArray(post.likes) && post.likes.length > 0;

    const toggleLike = async () => {
        try { await api.post(`/posts/${post.id}/like`); onRefresh(); } catch {}
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
            <View style={{ flexDirection: 'row', gap: 20 }}>
                <TouchableOpacity onPress={toggleLike} style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={{ color: isLiked ? '#f43f5e' : colors.textMuted, fontSize: 16 }}>♥</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>{post._count?.likes || 0}</Text>
                </TouchableOpacity>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                    <Text style={{ color: colors.textMuted, fontSize: 14 }}>💬</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 12, fontWeight: '700' }}>{post._count?.comments || 0}</Text>
                </View>
            </View>
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
        { ...match.sender, skillRating: match.senderSkillRating },
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

    return (
        <View style={[s.card, { borderColor: isMatched ? '#16a34a60' : '#a855f740', backgroundColor: isMatched ? '#16a34a08' : undefined }]}>
            {/* Header: left=tappable info, right=small action buttons */}
            <View style={{ flexDirection:'row', alignItems:'flex-start', gap:8 }}>
                {/* Left: tappable — opens comments modal */}
                <TouchableOpacity style={{ flex:1 }} activeOpacity={0.75} onPress={() => onOpenComments?.(match)}>
                    <View style={{ flexDirection:'row', alignItems:'center', gap:6, flexWrap:'wrap' }}>
                        {allPlayers.map((p, idx) => (
                            <View key={p.id || idx} style={{ flexDirection:'row', alignItems:'center', gap:3 }}>
                                {idx > 0 && <Text style={{ color: colors.textMuted, fontSize:12 }}>·</Text>}
                                <TouchableOpacity onPress={() => p.id && onUserPress?.(p.id)} activeOpacity={0.7}>
                                    <Text style={s.cardName}>@{p.username}</Text>
                                </TouchableOpacity>
                                {p.skillRating != null && (
                                    <Text style={{ color:'#facc15', fontSize:11, fontWeight:'800' }}>
                                        {Number(p.skillRating).toFixed(2)} ★
                                    </Text>
                                )}
                            </View>
                        ))}
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
                    <Text style={s.cardSub}>
                        {match.flexibleSchedule ? t.unknownDate : match.matchDate ? new Date(match.matchDate).toLocaleDateString(t.dateLocale, { day:'numeric', month:'short', weekday:'short' }) : t.unknownDate}
                        {!match.flexibleSchedule && match.matchTime ? ` · ${match.matchTime}` : ''}
                        {match.duration  ? ` · ${match.duration} ${t.timeMinSuffix}` : ''}
                    </Text>
                    {match.courtName && (
                        <TouchableOpacity onPress={() => {
                            if (match.courtLat && match.courtLng) {
                                const url = Platform.OS === 'ios'
                                    ? `maps://?ll=${match.courtLat},${match.courtLng}&q=${encodeURIComponent(match.courtName)}`
                                    : `geo:${match.courtLat},${match.courtLng}?q=${encodeURIComponent(match.courtName)}`;
                                Linking.openURL(url).catch(() => {
                                    Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${match.courtLat},${match.courtLng}`);
                                });
                            } else if (match.courtAddress || match.courtName) {
                                const q = encodeURIComponent(match.courtAddress || match.courtName);
                                Linking.openURL(`https://www.google.com/maps/search/?api=1&query=${q}`);
                            }
                        }}>
                            <Text style={[s.cardSub, { color:'#60a5fa', textDecorationLine:'underline' }]}>🏟️ {match.courtName}</Text>
                        </TouchableOpacity>
                    )}
                    <Text style={{ color: colors.textMuted, fontSize:11, marginTop:4 }}>
                        💬 {t.matchCommentsBtn} {match.commentCount ?? 0}
                    </Text>
                    {match.level && (
                        <View style={{ flexDirection:'row', marginTop:4 }}>
                            <View style={[s.modeBadge, { backgroundColor:'#ffffff10', borderColor:'#ffffff20' }]}>
                                <Text style={[s.modeBadgeText, { color: colors.textSecondary }]}>
                                    {LEVEL_EMOJI[match.level]} {t.levelTr?.[match.level] || match.level}
                                </Text>
                            </View>
                        </View>
                    )}
                </TouchableOpacity>

                {/* Right: small stacked action buttons */}
                <View style={{ gap:5, alignItems:'flex-end' }}>
                    {!hasScore && scoreUnlocked && (
                        <View style={{ alignItems:'flex-end', gap:4 }}>
                            <TouchableOpacity style={s.scoreBtn} onPress={() => setShowScore(v => !v)}>
                                <Text style={s.scoreBtnText}>{showScore ? '▲' : t.enterScore}</Text>
                            </TouchableOpacity>
                            <TouchableOpacity
                                style={{ paddingHorizontal:8, paddingVertical:3, borderRadius:7, borderWidth:1, borderColor:'#dc262630', backgroundColor:'#dc262612' }}
                                onPress={() => setShowCantScore(true)}
                            >
                                <Text style={{ color:'#f87171', fontSize:9, fontWeight:'700' }}>{t.cantScoreBtn}</Text>
                            </TouchableOpacity>
                        </View>
                    )}
                    {match.scoreStatus !== 'CONFIRMED' && (
                        <>
                            {withinPenaltyWindow && (
                                !iAlreadyRequestedMutual ? (
                                    <TouchableOpacity
                                        style={{ paddingHorizontal:8, paddingVertical:5, borderRadius:8, borderWidth:1, borderColor:'#2563eb40', backgroundColor:'#2563eb18' }}
                                        onPress={() => handleMutualCancelPress(false)}
                                        disabled={cancelling}
                                    >
                                        <Text style={{ color:'#60a5fa', fontSize:10, fontWeight:'700' }}>🤝 Karşılıklı</Text>
                                    </TouchableOpacity>
                                ) : (
                                    <View style={{ paddingHorizontal:8, paddingVertical:5, borderRadius:8, borderWidth:1, borderColor:'#2563eb30', backgroundColor:'#2563eb10' }}>
                                        <Text style={{ color:'#60a5fa', fontSize:10 }}>⏳ İstendi</Text>
                                    </View>
                                )
                            )}
                            <TouchableOpacity
                                style={{ paddingHorizontal:8, paddingVertical:5, borderRadius:8, borderWidth:1, borderColor:'#dc262640', backgroundColor:'#dc262618' }}
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
                            style={{ paddingHorizontal:8, paddingVertical:5, borderRadius:8, borderWidth:1, borderColor:'#f9731640', backgroundColor:'#f9731618' }}
                            onPress={() => { setNoShowAbsent([]); setNoShowPhoto(null); setShowNoShow(true); }}
                        >
                            <Text style={{ color:'#fb923c', fontSize:10, fontWeight:'700' }}>🚫 Gelmedi</Text>
                        </TouchableOpacity>
                    )}
                    {match._myNoShowPending && (
                        <View style={{ paddingHorizontal:8, paddingVertical:5, borderRadius:8, borderWidth:1, borderColor:'#f9731630', backgroundColor:'#f9731610' }}>
                            <Text style={{ color:'#fb923c', fontSize:10 }}>⏳ Bildirildi</Text>
                        </View>
                    )}
                </View>
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
    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={tg.overlay}>
                <View style={tg.box}>
                    <View style={tg.header}>
                        <Text style={tg.title}>{title}</Text>
                        <TouchableOpacity onPress={onClose}><Text style={tg.close}>✕</Text></TouchableOpacity>
                    </View>
                    <FlatList
                        data={times}
                        keyExtractor={item => item}
                        numColumns={4}
                        columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[tg.cell, value === item && tg.cellActive]}
                                onPress={() => { onSelect(item); onClose(); }}
                            >
                                <Text style={[tg.cellText, value === item && tg.cellTextActive]}>{item}</Text>
                            </TouchableOpacity>
                        )}
                    />
                </View>
            </View>
        </Modal>
    );
}

const tg = StyleSheet.create({
    overlay:        { flex:1, backgroundColor:'#000000bb', justifyContent:'flex-end' },
    box:            { backgroundColor: colors.surface, borderTopLeftRadius:24, borderTopRightRadius:24, paddingHorizontal:16, paddingTop:20, paddingBottom:40, maxHeight:'80%' },
    header:         { flexDirection:'row', justifyContent:'space-between', alignItems:'center', marginBottom:16 },
    title:          { color:'#fff', fontSize:16, fontWeight:'900' },
    close:          { color: colors.textMuted, fontSize:22 },
    cell:           { flex:1, paddingVertical:12, borderRadius:10, backgroundColor: colors.surface2, borderWidth:1, borderColor: colors.border, alignItems:'center', justifyContent:'center' },
    cellActive:     { backgroundColor: colors.purple, borderColor: colors.purple },
    cellText:       { color: colors.textSecondary, fontSize:12, fontWeight:'700' },
    cellTextActive: { color:'#fff' },
});

function RatingPickerModal({ visible, title, value, onSelect, onClose }) {
    const ratings = ['', '0.5','1.0','1.5','2.0','2.5','3.0','3.5','4.0','4.5','5.0'];
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
                        columnWrapperStyle={{ gap:8, marginBottom:8 }}
                        showsVerticalScrollIndicator={false}
                        renderItem={({ item }) => (
                            <TouchableOpacity
                                style={[tg.cell, value === item && tg.cellActive]}
                                onPress={() => { onSelect(item); onClose(); }}
                            >
                                <Text style={[tg.cellText, value === item && tg.cellTextActive]}>
                                    {item === '' ? 'Yok' : `${item} ★`}
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

const DURATIONS_FULL = [
    { value: '30',  label: '30 dk'  },
    { value: '60',  label: '60 dk'  },
    { value: '90',  label: '90 dk'  },
    { value: '120', label: '120 dk' },
    { value: '150', label: '150 dk' },
    { value: '180', label: '180 dk' },
];

const TENNIS_SURFACES = [
    { id: 'HARD',   label: 'Sert Zemin', emoji: '🔵' },
    { id: 'CLAY',   label: 'Toprak',     emoji: '🟤' },
    { id: 'GRASS',  label: 'Çim',        emoji: '🟩' },
    { id: 'CARPET', label: 'Suni',       emoji: '🟥' },
];

function CreateRivalModal({ visible, onClose, category, sub, onCreated }) {
    const t = useT();
    const isTeamSport = TEAM_SPORTS.has(sub);
    const isFootball  = sub === 'football';
    const isVolleyball = sub === 'volleyball';
    const teamSizes   = isFootball ? FOOTBALL_SIZES : isVolleyball ? VOLLEYBALL_SIZES : [];
    const cfg         = getConfig(sub);

    const INIT = {
        matchType: 'SINGLE', teamSize: isFootball ? 5 : 1,
        matchMode: 'PRACTICE', flexibleSchedule: false,
        matchDate: null, matchTime: '', duration: '60',
        showDatePicker: false, showTimePicker: false, showDurationPicker: false,
        courtSearchText: '', courtResults: [], selectedCourt: null,
        showManualCourt: false,
        manualCourtName: '', manualCity: '', manualAddress: '',
        surface: '', venueType: '', courtReserved: false,
        message: '',
        minRating: '', maxRating: '',
    };
    const [f, setF]               = useState(INIT);
    const [searching, setSearching] = useState(false);
    const [submitting, setSubmitting] = useState(false);
    const [ratingPickerTarget, setRatingPickerTarget] = useState(null);
    const set = (key, val) => setF(p => ({ ...p, [key]: val }));

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
        if (!f.flexibleSchedule) {
            if (!f.matchDate)  { Alert.alert('', t.missingDate); return; }
            if (!f.matchTime)  { Alert.alert('', t.missingTime); return; }
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
                message:   f.message || undefined,
                minRating: f.minRating !== '' ? parseFloat(f.minRating) : undefined,
                maxRating: f.maxRating !== '' ? parseFloat(f.maxRating) : undefined,
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

    const courtSurfaces = isFootball ? FOOTBALL_SURFACES : isVolleyball ? VOLLEYBALL_SURFACES : TENNIS_SURFACES;

    return (
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
                                                {(sub === 'tennis' ? ['PRACTICE','COMPETITIVE'] : ['PRACTICE','COMPETITIVE','BOTH']).map(mode => {
                                                    const isActive = sub === 'tennis'
                                                        ? (f.matchMode === mode || f.matchMode === 'BOTH')
                                                        : f.matchMode === mode;
                                                    const handleModePress = () => {
                                                        if (sub !== 'tennis' || !f.flexibleSchedule) { set('matchMode', mode); return; }
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
                                                    <TouchableOpacity key={fmt.id} onPress={() => set('matchType', fmt.id)}
                                                        style={[s.chipBtn, { paddingHorizontal:3, paddingVertical:3 }, f.matchType===fmt.id && s.chipBtnActive]}>
                                                        <Text style={[s.chipBtnText, f.matchType===fmt.id && s.chipBtnTextActive]}>{fmt.label}</Text>
                                                    </TouchableOpacity>
                                                ))}
                                            </View>
                                        </View>
                                    </View>
                                    {sub === 'tennis' && f.flexibleSchedule && (
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
                                            <Text style={[s.triValue, !f.minRating && s.triPlaceholder]}>{f.minRating ? `${f.minRating} ★` : '—'}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity style={{ flex:1, backgroundColor:colors.surface2, borderRadius:10, padding:3, borderWidth:1, borderColor: f.maxRating ? colors.purple+'80' : colors.border, alignItems:'center' }} onPress={() => setRatingPickerTarget('max')}>
                                            <Text style={s.triLabel}>{t.maxRatingLabel}</Text>
                                            <Text style={[s.triValue, !f.maxRating && s.triPlaceholder]}>{f.maxRating ? `${f.maxRating} ★` : '—'}</Text>
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
                                            <Text style={[s.triValue, !f.duration && s.triPlaceholder]}>{f.duration ? `${f.duration}dk` : '—'}</Text>
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
                                        options={DURATIONS_FULL}
                                        value={f.duration}
                                        onSelect={(v) => set('duration', v)}
                                        onClose={() => set('showDurationPicker', false)}
                                    />

                                    {/* Kort Ara */}
                                    <Text style={s.fieldLabel}>{t.courtLabel}</Text>
                                    <View style={{ flexDirection:'row', gap:8, marginBottom:6 }}>
                                        <TextInput
                                            style={[s.fieldInput, { flex:1, marginBottom:0 }]}
                                            value={f.courtSearchText}
                                            onChangeText={searchCourts}
                                            placeholder={t.courtSearchPlaceholder}
                                            placeholderTextColor={colors.textMuted}
                                        />
                                        {searching && <ActivityIndicator color={cfg.color} style={{ alignSelf:'center' }} />}
                                    </View>

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

                                    {/* Manuel kort girişi */}
                                    {!f.selectedCourt && f.showManualCourt && (
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

                                    {/* Kort Zemini */}
                                    <Text style={[s.fieldLabel, { marginTop:4 }]}>{t.surfaceLabel}</Text>
                                    <View style={s.chipRow}>
                                        {courtSurfaces.map(sf => (
                                            <TouchableOpacity key={sf.id} onPress={() => set('surface', sf.id)}
                                                style={[s.chipBtn, f.surface===sf.id && s.chipBtnActive]}>
                                                <Text style={[s.chipBtnText, f.surface===sf.id && s.chipBtnTextActive]}>{sf.emoji} {sf.label}</Text>
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
const SURFACE_LABEL = { CLAY:'Toprak', HARD:'Sert Zemin', GRASS:'Çim', CARPET:'Suni Zemin', HALI_SAHA:'Halı Saha', CIM_SAHA:'Çim Saha', FUTSAL:'Futsal', SOKAK:'Sokak', INDOOR:'Kapalı Salon', BEACH:'Plaj' };
const GENDER_EMOJI = { KADIN: '👩', ERKEK: '👨', MIX: '🤝' };

function TournamentCard({ item, myId, myIsAdmin, t, cfg, onJoin, onCancelJoin, onDelete, onUpdated }) {
    const myPart = item.participants?.[0];
    const [myStatus, setMyStatus] = useState(myPart?.status ?? null);
    useEffect(() => { setMyStatus(myPart?.status ?? null); }, [myPart?.status]);
    const isCreator = item.creatorId === myId;
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
    const [editAdvantageScoring, setEditAdvantageScoring] = useState(item.advantageScoring !== false);
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
    const [loadingMatches, setLoadingMatches] = useState(false);
    const [showMatchesModal, setShowMatchesModal] = useState(false);
    const [matchTab, setMatchTab] = useState('matches');
    const [starting, setStarting] = useState(false);
    const [scoreEntry, setScoreEntry] = useState(null);
    const [scoreSets, setScoreSets] = useState([]);
    const [submittingScore, setSubmittingScore] = useState(false);

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
        try {
            const { data } = await api.get(`/tournaments/${item.id}/matches`);
            setTournMatches(Array.isArray(data) ? data : []);
        } catch { /* silent */ }
        finally { setLoadingMatches(false); }
    }, [item.id]);

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
        setScoreSets(Array.from({ length: numSets }, () => ({ p1: '', p2: '' })));
    };

    const submitScore = async () => {
        if (!scoreEntry) return;
        const sets = scoreSets.map(s => ({ p1: parseInt(s.p1) || 0, p2: parseInt(s.p2) || 0 }));
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
                feeType: editIsPaid ? editFeeType : null,
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
        <View style={[s.card, { marginBottom:10 }]}>
            {/* Header */}
            <View style={{ flexDirection:'row', justifyContent:'space-between', alignItems:'flex-start' }}>
                <View style={{ flex:1, gap:2 }}>
                    <Text style={{ color:'#fff', fontSize:15, fontWeight:'900' }}>{item.name}</Text>
                    <Text style={{ color: colors.textMuted, fontSize:11 }}>
                        {SCOPE_EMOJI[item.scope] || '📍'} {item.city || ''}{item.city && ' · '}{typeLabels[item.type] || item.type}
                        {item.genderType ? ` · ${t['tournGender' + item.genderType.charAt(0) + item.genderType.slice(1).toLowerCase()] || item.genderType}` : ''}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize:11, marginTop:2 }}>
                        👤 {item.creator?.fullName || item.creator?.username}
                        {item.contactPhone ? `  📞 ${item.contactPhone}` : ''}
                    </Text>
                    {item.isPaid && (
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
                    {item.surface && <Text style={{ color: colors.textMuted, fontSize:11 }}>⬜ {SURFACE_LABEL[item.surface?.toUpperCase()] || item.surface}</Text>}
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
                    {item.type === '1' && (item.setsPerMatch || item.matchesBeforePlayoff || item.playoffQualifiers) && (
                        <View style={{ flexDirection:'row', flexWrap:'wrap', gap:4, marginTop:2 }}>
                            {item.setsPerMatch && (
                                <View style={{ backgroundColor: infoColor+'15', borderRadius:6, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor: infoColor+'40' }}>
                                    <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>
                                        {item.setsPerMatch === 1 ? '1 Set' : `En İyi ${item.setsPerMatch}`}
                                    </Text>
                                </View>
                            )}
                            {item.advantageScoring !== undefined && (
                                <View style={{ backgroundColor: infoColor+'15', borderRadius:6, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor: infoColor+'40' }}>
                                    <Text style={{ color: infoColor, fontSize:9, fontWeight:'700' }}>
                                        {item.advantageScoring ? t.tournAdvantage : t.tournDeciding}
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
                </View>
                <View style={{ alignItems:'flex-end', gap:4 }}>
                    <View style={{ backgroundColor: item.status === 'IN_PROGRESS' ? '#16a34a20' : infoColor + '20', borderRadius:8, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor: item.status === 'IN_PROGRESS' ? '#16a34a50' : infoColor + '50' }}>
                        <Text style={{ color: item.status === 'IN_PROGRESS' ? '#4ade80' : infoColor, fontSize:10, fontWeight:'800' }}>
                            {item.status === 'IN_PROGRESS' ? '🏆 Devam Ediyor' : t.tournStatusOpen}
                        </Text>
                    </View>
                    {isCreator ? (<>
                        {myStatus === null && !isEventStarted() && (
                            <TouchableOpacity style={{ backgroundColor: infoColor + '20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor: infoColor + '50' }} onPress={() => onJoin(item)}>
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
                        <TouchableOpacity
                            style={{ alignItems:'center', backgroundColor:'#1e40af15', borderRadius:6, paddingHorizontal:6, paddingVertical:5, borderWidth:1, borderColor:'#1e40af40' }}
                            onPress={() => { fetchRequests(); setShowListModal(true); }}>
                            {requests.length > 0 && <Text style={{ color:'#60a5fa', fontSize:9, fontWeight:'800', marginBottom:2 }}>{requests.length}</Text>}
                            <Text style={{ color:'#60a5fa', fontSize:10, fontWeight:'600', textAlign:'center', lineHeight:13 }}>
                                {'Başvurular'.split('').join('\n')}
                            </Text>
                            <Text style={{ color:'#60a5fa', fontSize:10, marginTop:3 }}>›</Text>
                        </TouchableOpacity>
                    </>) : (<>
                        {myStatus === null && ['OPEN', 'IN_PROGRESS'].includes(item.status) && !isEventStarted() && (
                            <TouchableOpacity style={{ backgroundColor: infoColor + '20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor: infoColor + '50' }} onPress={() => onJoin(item)}>
                                <Text style={{ color: infoColor, fontSize:10, fontWeight:'700' }}>{t.tournJoinBtn}</Text>
                            </TouchableOpacity>
                        )}
                        {myStatus === 'PENDING' && (<>
                            <View style={{ backgroundColor:'#a855f720', borderRadius:6, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor:'#a855f750', maxWidth:120 }}>
                                <Text style={{ color:'#c084fc', fontSize:10, flexWrap:'wrap' }}>{t.tournJoinPending}</Text>
                            </View>
                            <TouchableOpacity style={{ backgroundColor:'#dc262620', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#dc262650' }} onPress={() => onCancelJoin(item.id)}>
                                <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>{t.tournCancelJoinBtn}</Text>
                            </TouchableOpacity>
                        </>)}
                        {myStatus === 'ACCEPTED' && !myPart?.cancelRequested && (
                            <View style={{ gap:4 }}>
                                <View style={{ backgroundColor:'#16a34a20', borderRadius:6, paddingHorizontal:6, paddingVertical:2, borderWidth:1, borderColor:'#16a34a50' }}>
                                    <Text style={{ color:'#4ade80', fontSize:10 }}>{t.tournJoinAccepted}</Text>
                                </View>
                                <TouchableOpacity style={{ backgroundColor:'#dc262615', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#dc262640' }} onPress={handleCancelAttempt}>
                                    <Text style={{ color:'#f87171', fontSize:10, fontWeight:'700' }}>İptal</Text>
                                </TouchableOpacity>
                            </View>
                        )}
                        {myStatus === 'ACCEPTED' && myPart?.cancelRequested && (
                            <View style={{ backgroundColor:'#f59e0b15', borderRadius:6, paddingHorizontal:6, paddingVertical:4, borderWidth:1, borderColor:'#f59e0b40' }}>
                                <Text style={{ color:'#fbbf24', fontSize:10, fontWeight:'700' }}>⏳ İptal onay bekliyor</Text>
                            </View>
                        )}
                        <TouchableOpacity
                            style={{ alignItems:'center', backgroundColor:'#1e40af15', borderRadius:6, paddingHorizontal:6, paddingVertical:5, borderWidth:1, borderColor:'#1e40af40' }}
                            onPress={() => { fetchParticipants(); setShowListModal(true); }}>
                            {participantCount > 0 && <Text style={{ color:'#60a5fa', fontSize:9, fontWeight:'800', marginBottom:2 }}>{participantCount}</Text>}
                            <Text style={{ color:'#60a5fa', fontSize:10, fontWeight:'600', textAlign:'center', lineHeight:13 }}>
                                {'Katılımcı'.split('').join('\n')}
                            </Text>
                            <Text style={{ color:'#60a5fa', fontSize:10, marginTop:3 }}>›</Text>
                        </TouchableOpacity>
                    </>)}
                </View>
            </View>

        {/* IN_PROGRESS: matches modal open button */}
        {item.status === 'IN_PROGRESS' && (
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
                                        {i+1}. {row.name}{skillRatingMap[row.id] != null ? `  ⭐ ${Number(skillRatingMap[row.id]).toFixed(2)}` : ''}
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
                            return roundKeys.map(({ phase, round }) => {
                                const rMatches = tournMatches.filter(m => m.phase === phase && m.round === round);
                                return (
                                    <View key={`${phase}|${round}`} style={{ marginBottom:8 }}>
                                        <Text style={{ color: infoColor, fontSize:11, fontWeight:'800', marginBottom:4 }}>{getRoundLabel(round, phase)}</Text>
                                        {rMatches.map(match => {
                                            const isBye = match.status === 'BYE';
                                            const isDone = match.status === 'COMPLETED';
                                            const isReady = match.status === 'PENDING' && match.p1Id && match.p2Id;
                                            const isTBD = match.status === 'PENDING' && (!match.p1Id || !match.p2Id);
                                            const isEntering = scoreEntry?.matchId === match.id;
                                            return (
                                                <View key={match.id} style={{ backgroundColor:'#0f172a', borderRadius:8, padding:8, marginBottom:5, borderWidth:1, borderColor: isDone ? '#16a34a30' : isBye || isTBD ? '#64748b20' : '#334155' }}>
                                                    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                                                        <View style={{ flex:1 }}>
                                                            {(() => {
                                                                const sc = match.score;
                                                                const rB = sc?.p1RatingBefore;
                                                                const rA = sc?.p1RatingAfter;
                                                                const hasRating = rB != null && rA != null;
                                                                const diff = hasRating ? parseFloat((rA - rB).toFixed(2)) : 0;
                                                                return (
                                                                    <Text style={{ color: isDone && match.winnerId === match.p1Id ? '#4ade80' : '#fff', fontSize:12, fontWeight:'700' }}>
                                                                        {match.p1Name || 'TBD'}
                                                                        {hasRating ? `  ⭐ ${rB.toFixed(2)}  ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}${diff >= 0 ? '📈' : '📉'}  ${rA.toFixed(2)}` : match.p1Id && skillRatingMap[match.p1Id] != null ? `  ⭐ ${Number(skillRatingMap[match.p1Id]).toFixed(2)}` : ''}
                                                                    </Text>
                                                                );
                                                            })()}
                                                            <Text style={{ color: colors.textMuted, fontSize:10 }}>vs</Text>
                                                            {(() => {
                                                                const sc = match.score;
                                                                const rB = sc?.p2RatingBefore;
                                                                const rA = sc?.p2RatingAfter;
                                                                const hasRating = rB != null && rA != null;
                                                                const diff = hasRating ? parseFloat((rA - rB).toFixed(2)) : 0;
                                                                return (
                                                                    <Text style={{ color: isDone && match.winnerId === match.p2Id ? '#4ade80' : '#fff', fontSize:12, fontWeight:'700' }}>
                                                                        {match.p2Name || 'TBD'}
                                                                        {hasRating ? `  ⭐ ${rB.toFixed(2)}  ${diff >= 0 ? '+' : ''}${diff.toFixed(2)}${diff >= 0 ? '📈' : '📉'}  ${rA.toFixed(2)}` : match.p2Id && skillRatingMap[match.p2Id] != null ? `  ⭐ ${Number(skillRatingMap[match.p2Id]).toFixed(2)}` : ''}
                                                                    </Text>
                                                                );
                                                            })()}
                                                        </View>
                                                        <View style={{ alignItems:'flex-end', gap:3 }}>
                                                            {(isBye || isTBD) && <Text style={{ color: colors.textMuted, fontSize:10 }}>{isBye ? 'BYE' : 'TBD'}</Text>}
                                                            {match.deadline && !isDone && (
                                                                <Text style={{ color: new Date(match.deadline) < new Date() ? '#f87171' : '#fbbf24', fontSize:9, fontWeight:'700' }}>
                                                                    ⏳ {new Date(match.deadline).toLocaleDateString('tr-TR')}
                                                                </Text>
                                                            )}
                                                            {isDone && match.score && (
                                                                <Text style={{ color:'#94a3b8', fontSize:11 }}>
                                                                    {(match.score.sets||[]).map(s=>`${s.p1}-${s.p2}`).join(', ')}
                                                                </Text>
                                                            )}
                                                            {isReady && (isCreator || myIsAdmin || match.p1Id === myId || match.p2Id === myId) && !isEntering && (
                                                                <TouchableOpacity onPress={() => openScoreEntry(match)}
                                                                    style={{ backgroundColor: infoColor+'20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor: infoColor+'50' }}>
                                                                    <Text style={{ color: infoColor, fontSize:10, fontWeight:'700' }}>Skor Gir</Text>
                                                                </TouchableOpacity>
                                                            )}
                                                            {/* Joker butonu — sadece Bireysel Rekabetçi, oyuncu kendi maçı */}
                                                            {item.type === '1' && isReady && (match.p1Id === myId || match.p2Id === myId) && !isEntering && (() => {
                                                                const myJokerRequested = match.p1Id === myId ? match.p1JokerRequested : match.p2JokerRequested;
                                                                const otherJokerRequested = match.p1Id === myId ? match.p2JokerRequested : match.p1JokerRequested;
                                                                if (myJokerRequested) return null; // zaten talep edildi
                                                                return (
                                                                    <TouchableOpacity
                                                                        onPress={async () => {
                                                                            try {
                                                                                const { data } = await api.post(`/tournaments/${item.id}/matches/${match.id}/joker`);
                                                                                Alert.alert('🃏 Joker', data.message);
                                                                                fetchMatches();
                                                                            } catch (e) {
                                                                                Alert.alert('Hata', e?.response?.data?.message || 'Joker kullanılamadı.');
                                                                            }
                                                                        }}
                                                                        style={{ backgroundColor: otherJokerRequested ? '#7c3aed20' : '#1e40af20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor: otherJokerRequested ? '#7c3aed60' : '#1e40af60' }}>
                                                                        <Text style={{ color: otherJokerRequested ? '#c084fc' : '#93c5fd', fontSize:10, fontWeight:'700' }}>
                                                                            {otherJokerRequested ? '🃏 Karşılıklı Joker' : '🃏 Joker'}
                                                                        </Text>
                                                                    </TouchableOpacity>
                                                                );
                                                            })()}
                                                            {isDone && isCreator && !isEntering && (
                                                                <TouchableOpacity onPress={() => openScoreEntry(match)}
                                                                    style={{ backgroundColor:'#f59e0b20', borderRadius:6, paddingHorizontal:8, paddingVertical:3, borderWidth:1, borderColor:'#f59e0b50' }}>
                                                                    <Text style={{ color:'#fbbf24', fontSize:10, fontWeight:'700' }}>✏️ Düzelt</Text>
                                                                </TouchableOpacity>
                                                            )}
                                                        </View>
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
                                                                    <Text style={{ color: colors.textMuted, fontSize:11, width:54 }}>{si+1}. Set</Text>
                                                                    <TextInput
                                                                        style={{ flex:1, backgroundColor:'#1e293b', color:'#fff', borderRadius:6, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor: colors.border, fontSize:13, textAlign:'center', marginRight:6 }}
                                                                        value={set.p1}
                                                                        onChangeText={v => setScoreSets(prev => prev.map((s,i2) => i2===si ? {...s, p1:v.replace(/[^0-9]/,'')} : s))}
                                                                        keyboardType="numeric" maxLength={2} placeholder="0" placeholderTextColor={colors.textMuted} />
                                                                    <TextInput
                                                                        style={{ flex:1, backgroundColor:'#1e293b', color:'#fff', borderRadius:6, paddingHorizontal:8, paddingVertical:4, borderWidth:1, borderColor: colors.border, fontSize:13, textAlign:'center' }}
                                                                        value={set.p2}
                                                                        onChangeText={v => setScoreSets(prev => prev.map((s,i2) => i2===si ? {...s, p2:v.replace(/[^0-9]/,'')} : s))}
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
                                );
                            });
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

                                {/* Type-1 specific */}
                                {item.type === '1' && (<>
                                    <Text style={s.fieldLabel}>Set Sayısı</Text>
                                    <View style={s.chipRow}>
                                        {['1','3','5'].map(n => (
                                            <TouchableOpacity key={n} onPress={() => setEditSetsPerMatch(n)} style={[s.chipBtn, { flex:1 }, editSetsPerMatch===n && s.chipBtnActive]}>
                                                <Text style={[s.chipBtnText, editSetsPerMatch===n && s.chipBtnTextActive]}>{n==='1'?'1 Set':`En İyi ${n}`}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
                                    <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
                                        <Text style={{ color: colors.textMuted, fontSize:13 }}>Avantaj Puanı</Text>
                                        <Switch value={editAdvantageScoring} onValueChange={setEditAdvantageScoring} trackColor={{ true: infoColor }} />
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
                                    <Switch value={editIsPaid} onValueChange={setEditIsPaid} trackColor={{ true: '#fbbf24' }} />
                                </View>
                                {editIsPaid && (<>
                                    <View style={s.chipRow}>
                                        {[{id:'INCLUDED',label:'Kort dahil'},{id:'SHARED',label:'Ortaklaşa'}].map(ft => (
                                            <TouchableOpacity key={ft.id} onPress={() => setEditFeeType(ft.id)} style={[s.chipBtn, { flex:1 }, editFeeType===ft.id && s.chipBtnActive]}>
                                                <Text style={[s.chipBtnText, editFeeType===ft.id && s.chipBtnTextActive]}>{ft.label}</Text>
                                            </TouchableOpacity>
                                        ))}
                                    </View>
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
            <Modal visible={showListModal} animationType="slide" transparent onRequestClose={() => setShowListModal(false)}>
                <View style={[s.modalOverlay, { justifyContent:'flex-end' }]}>
                    <View style={[s.modalBox, { maxHeight:'80%' }]}>
                        <View style={s.modalHeader}>
                            <Text style={s.modalTitle}>{isCreator ? 'Başvurular' : 'Katılımcılar'}</Text>
                            <TouchableOpacity onPress={() => setShowListModal(false)}><Text style={s.modalClose}>✕</Text></TouchableOpacity>
                        </View>
                        <ScrollView showsVerticalScrollIndicator={false} style={{ paddingHorizontal:2 }}>
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
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ⭐ ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
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
                                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ⭐ ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
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
                                {requests.map((r, i) => {
                                    const isAccepted = r.status === 'ACCEPTED';
                                    let posLabel = null;
                                    if (isAccepted) {
                                        mainIdx++;
                                        const isMain = mainIdx <= mainListCount;
                                        posLabel = isMain
                                            ? { text: `AS ${mainIdx}`, bg:'#16a34a20', color:'#4ade80', border:'#16a34a40' }
                                            : { text: `YDK ${mainIdx - mainListCount}`, bg:'#f59e0b20', color:'#fbbf24', border:'#f59e0b40' };
                                    }
                                    const prevIsAccepted = i > 0 && requests[i-1].status === 'ACCEPTED';
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
                                        <View style={{ flexDirection:'row', alignItems:'center', paddingVertical:8, borderBottomWidth: i < requests.length - 1 ? 1 : 0, borderBottomColor: colors.border+'40', backgroundColor: r.cancelRequested ? '#f59e0b08' : 'transparent', borderRadius:6 }}>
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
                                                    : <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ⭐ ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
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
                                </View>
                            );
                        })() : (() => {
                            if (loadingParticipants) return <ActivityIndicator size="small" color={cfg.color} style={{ marginVertical:16 }} />;
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
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ⭐ ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
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
                                                        <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ⭐ ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
                                                    </View>
                                                </View>
                                            ))}
                                        </>}
                                    </View>
                                );
                            }

                            // OPEN — show AS/YDK labels read-only
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
                                {participants.map((r, i) => {
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
                                                <Text style={{ color: colors.textMuted, fontSize:11 }}>@{r.user?.username}{r.user?.interests?.[0]?.skillRating != null ? `  ⭐ ${Number(r.user.interests[0].skillRating).toFixed(2)}` : ''}</Text>
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
                    </View>
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
                    {item.type === '1' ? (
                        [
                            'Oyuncular bireysel katılır. Play-off öncesi her tur bittikten sonra güncel ELO\'ya göre en yakın, daha önce eşleşmemiş rakiplerle yeni tur oluşturulur.',
                            'Play-off\'larda da ELO puanı en yakın oyuncular eşleşir.',
                            'Her oyuncunun 1 joker hakkı vardır. Haftada 1 maç zorunludur. Joker kullanılan maça +7 gün ek süre tanınır; süre dolmasına rağmen maç bitmezse joker kullanan oyuncu hükmen yenilir.',
                            'İki oyuncu da joker talep ederse deadline +7 gün uzar, joker hakkı tüketilmez (hava, kort vs. zorunluluk sayılır).',
                            'Aynı puanlı oyuncular play-off\'a geldiğinde averajı (galibiyet oyunu / toplam oyun) yüksek olan önce alınır.',
                        ].map((kural, i) => (
                            <View key={i} style={{ flexDirection:'row', gap:8, marginBottom: i < 4 ? 6 : 0 }}>
                                <Text style={{ color: infoColor, fontSize:11, fontWeight:'900', minWidth:16 }}>{i + 1}.</Text>
                                <Text style={{ color: colors.textSecondary, fontSize:11, lineHeight:17, flex:1 }}>{kural}</Text>
                            </View>
                        ))
                    ) : (
                        <Text style={{ color: colors.textSecondary, fontSize:11, lineHeight:17 }}>{t['tournRules' + item.type]}</Text>
                    )}
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
                ...(f.isPaid && {
                    feeType: f.feeType,
                    playerFee: f.playerFee ? parseFloat(f.playerFee) : undefined,
                    paymentMethod: f.paymentMethod || undefined,
                    ibanNumber: f.paymentMethod === 'EFT' ? f.ibanNumber.trim() || undefined : undefined,
                    ibanHolder: f.paymentMethod === 'EFT' ? f.ibanHolder.trim() || undefined : undefined,
                }),
                prize1: f.prize1.trim() || undefined,
                prize2: f.prize2.trim() || undefined,
                prize3: f.prize3.trim() || undefined,
                contactPhone: f.contactPhone.trim() || undefined,
                ...(f.type === '1' && {
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
                                    {/* Surface (tennis) */}
                                    {sub === 'tennis' && (
                                        <>
                                            <Text style={s.fieldLabel}>{t.tournSurfaceLabel}</Text>
                                            <View style={[s.chipRow, { marginBottom:8 }]}>
                                                {TENNIS_SURFACES.map(sf => (
                                                    <TouchableOpacity key={sf.id}
                                                        style={[s.chip, { paddingVertical:5, paddingHorizontal:8 }, f.surface === sf.id && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                                        onPress={() => set('surface', f.surface === sf.id ? '' : sf.id)}>
                                                        <Text style={[s.chipText, f.surface === sf.id && { color: cfg.color, fontWeight:'800' }]}>{sf.emoji} {sf.label}</Text>
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
                                    onPress={() => set('isPaid', false)}>
                                    <Text style={[s.chipText, !f.isPaid && { color: '#4ade80', fontWeight:'800' }]}>{t.tournFreeOption}</Text>
                                </TouchableOpacity>
                                <TouchableOpacity
                                    style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, f.isPaid && { backgroundColor: '#d9770630', borderColor: '#d97706' }]}
                                    onPress={() => set('isPaid', true)}>
                                    <Text style={[s.chipText, f.isPaid && { color: '#fbbf24', fontWeight:'800' }]}>{t.tournPaidOption}</Text>
                                </TouchableOpacity>
                            </View>
                            <View style={{ backgroundColor: f.isPaid ? '#d9770615' : '#16a34a15', borderRadius:8, padding:8, marginBottom:8, borderWidth:1, borderColor: f.isPaid ? '#d9770640' : '#16a34a40' }}>
                                <Text style={{ color: f.isPaid ? '#fbbf24' : '#4ade80', fontSize:11, lineHeight:17 }}>
                                    {f.isPaid ? t.tournPaidNote : t.tournFreeNote}
                                </Text>
                            </View>

                            {/* Payment options — only when paid */}
                            {f.isPaid && (<>
                                <View style={{ backgroundColor:'#1e3a5f', borderRadius:8, padding:10, marginBottom:10, borderWidth:1, borderColor:'#1e40af50' }}>
                                    <Text style={{ color:'#93c5fd', fontSize:11, lineHeight:17 }}>
                                        🏟️ Kortları oyuncular ortaklaşa öder.
                                    </Text>
                                </View>
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
                                        'İki oyuncu da joker talep ederse deadline +7 gün uzar, joker hakkı tüketilmez (hava, kort vs. zorunluluk sayılır).',
                                        'Aynı puanlı oyuncular play-off\'a geldiğinde averajı (galibiyet oyunu / toplam oyun) yüksek olan önce alınır.',
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

                            {/* Type-1 specific config (scoring + matches/qualifiers) */}
                            {f.type === '1' && (
                                <>
                                    <Text style={s.fieldLabel}>{t.tournScoringLabel}</Text>
                                    <View style={[s.chipRow, { marginBottom:8 }]}>
                                        <TouchableOpacity
                                            style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, f.advantageScoring && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('advantageScoring', true)}>
                                            <Text style={[s.chipText, f.advantageScoring && { color: cfg.color, fontWeight:'800' }]}>{t.tournAdvantage}</Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={[s.chip, { paddingVertical:5, paddingHorizontal:10 }, !f.advantageScoring && { backgroundColor: cfg.color + '30', borderColor: cfg.color }]}
                                            onPress={() => set('advantageScoring', false)}>
                                            <Text style={[s.chipText, !f.advantageScoring && { color: cfg.color, fontWeight:'800' }]}>{t.tournDeciding}</Text>
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
                                            {f.minRating ? `${f.minRating}★` : '—'}
                                        </Text>
                                    </View>
                                </TouchableOpacity>
                                <TouchableOpacity onPress={() => setRatingField('max')} style={{ flex:1 }}>
                                    <Text style={{ color: colors.textMuted, fontSize:9, marginBottom:3 }}>⭐ Üst Derece</Text>
                                    <View style={{ backgroundColor: colors.surface2, borderRadius:8, paddingVertical:7, alignItems:'center', borderWidth:1, borderColor: f.maxRating ? cfg.color : colors.border }}>
                                        <Text style={{ color: f.maxRating ? cfg.color : colors.textSecondary, fontSize:12, fontWeight:'800' }}>
                                            {f.maxRating ? `${f.maxRating}★` : '—'}
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

// ─── Main Screen ───────────────────────────────────────────────────────────────

export default function SubCategoryScreen({ route, navigation }) {
    const { category, sub, initialTab, highlightRivalId } = route.params;
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

    const [autoOpenId, setAutoOpenId] = useState(null);
    const autoOpenHandledRef = useRef(null);

    const [rivals, setRivals] = useState([]);
    const [playerWanted, setPlayerWanted] = useState([]);
    const [matchedUpcoming, setMatchedUpcoming] = useState([]);
    const [textPosts, setTextPosts] = useState([]);
    const [mediaPosts, setMediaPosts] = useState([]);
    const [mediaViewIdx, setMediaViewIdx] = useState(null);
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
    const [loading, setLoading] = useState(true);
    const [refreshing, setRefreshing] = useState(false);
    const [archiveRivals, setArchiveRivals] = useState([]);
    const [loadingArchive, setLoadingArchive] = useState(false);
    const [pendingScore, setPendingScore] = useState([]);
    const [archiveCity, setArchiveCity] = useState('');
    const [archiveDateFrom, setArchiveDateFrom] = useState('');
    const [archiveDateTo, setArchiveDateTo] = useState('');
    const [archiveSubTab, setArchiveSubTab] = useState('rivals');
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

    const [showCreateRival, setShowCreateRival] = useState(false);
    const [upcomingExpanded, setUpcomingExpanded] = useState(true);
    const [showCreatePW, setShowCreatePW] = useState(false);
    const [showCreateTournament, setShowCreateTournament] = useState(false);
    const [showTournamentPermission, setShowTournamentPermission] = useState(false);
    const [tournamentPermStatus, setTournamentPermStatus] = useState(null);
    const [tournaments, setTournaments] = useState([]);
    const [loadingTournaments, setLoadingTournaments] = useState(false);
    const [profileUserId, setProfileUserId] = useState(null);

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
            const [rvRes, pwRes, postsRes, mediaRes, upcomingRes, pendingRes] = await Promise.all([
                api.get(`/rivals?category=${category}&subCategory=${sub}`),
                api.get(`/rivals?category=${category}&subCategory=${sub}&matchType=PLAYER_WANTED`).catch(() => ({ data:[] })),
                api.get(`/posts?category=${category}&subCategory=${sub}&communityOnly=true&limit=30`).catch(() => ({ data:[] })),
                api.get(`/posts?category=${category}&subCategory=${sub}&mediaOnly=true&limit=50`).catch(() => ({ data:[] })),
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
            setMediaPosts(Array.isArray(mediaRes.data) ? mediaRes.data : []);

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
            .then(res => setArchiveModalMatches(Array.isArray(res.data) ? res.data : []))
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

    const deleteEquipment = async (id) => {
        try {
            await api.delete(`/equipment/${id}`);
            setEquipmentListings(prev => prev.filter(e => e.id !== id));
            setSelectedEquipment(null);
        } catch (e) { Alert.alert('', e?.response?.data?.message || t.actionFailed); }
    };

    const handleJoinTournament = useCallback(async (item) => {
        try {
            await api.post(`/tournaments/${item.id}/join`);
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
                style={{ paddingVertical:7, paddingHorizontal:10, borderRadius:8, backgroundColor: active ? cfg.color+'20' : '#ffffff10', borderWidth:1, borderColor: active ? cfg.color+'60' : '#ffffff20', minWidth:44, alignItems:'center', justifyContent:'center' }}
            >
                {isLoading
                    ? <ActivityIndicator size="small" color={cfg.color} style={{ width:18 }} />
                    : <>
                        <Text style={{ fontSize:16 }}>{active ? '🔔' : '🔕'}</Text>
                        {active && <Text style={{ color:cfg.color, fontSize:9, fontWeight:'800', marginTop:1 }}>{cities.length} il</Text>}
                      </>
                }
            </TouchableOpacity>
        );
    };

    const CompactFilter = ({ showDateChips = true }) => (
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
            <TouchableOpacity
                onPress={handleNearMe}
                disabled={locationLoading}
                style={{ backgroundColor:cfg.color+'15', borderRadius:7, paddingVertical:5, paddingHorizontal:8, borderWidth:1, borderColor:cfg.color+'30' }}
            >
                {locationLoading
                    ? <ActivityIndicator size="small" color={cfg.color} style={{ width:30 }} />
                    : <Text style={{ color:cfg.color, fontSize:11, fontWeight:'700' }}>{t.nearMeBtn}</Text>
                }
            </TouchableOpacity>
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
                            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:8 }}>
                                <TouchableOpacity style={[s.createBtn, { flex:1, marginBottom:0 }]} onPress={() => setShowCreateRival(true)}>
                                    <Text style={[s.createBtnText, { color: cfg.color }]}>{t.createAdBtn}</Text>
                                </TouchableOpacity>
                                <CityAlertBtn tab="rivals" />
                            </View>

                            {/* Kompakt tek satır filtre */}
                            <CompactFilter showDateChips={true} />

                            {filteredRivals.length === 0
                                ? <EmptyState emoji="⚔️" text={rivals.length > 0 ? t.noFilterMatch : t.emptyRivals} />
                                : filteredRivals.map(item => (
                                    <RivalCard key={item.id} item={item} myId={myId} sub={sub} onRefresh={load} navigation={navigation} onUserPress={setProfileUserId} autoOpen={item.id === autoOpenId} onAutoOpened={() => setAutoOpenId(null)} myRating={myRating} />
                                ))
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
                                    {upcomingExpanded && filteredMatchedUpcoming.map(m => (
                                        <UpcomingCard key={m.id} match={m} myId={myId} onRefresh={load} isMatched onOpenComments={openComments} onUserPress={setProfileUserId} />
                                    ))}
                                </>
                            )}

                            {/* Skor Bekleyen Maçlar */}
                            {pendingScore.length > 0 && (
                                <>
                                    <Text style={[s.sectionTitle, { color: '#f97316' }]}>⏳ {t.pendingScoreTitle}</Text>
                                    {pendingScore.map(m => (
                                        <UpcomingCard key={m.id} match={m} myId={myId} onRefresh={load} isMatched onOpenComments={openComments} onUserPress={setProfileUserId} />
                                    ))}
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
                                : playerWanted.map(item => (
                                    <RivalCard key={item.id} item={item} myId={myId} sub={sub} onRefresh={load} navigation={navigation} onUserPress={setProfileUserId} myRating={myRating} />
                                ))
                            }
                        </>
                    )}

                    {/* ── TOURNAMENTS ── */}
                    {activeTab === 'tournaments' && (() => {
                        const inProgress = filteredTournaments.filter(t => t.status === 'IN_PROGRESS');
                        const open = filteredTournaments.filter(t => t.status === 'OPEN');
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
                            />
                        );
                        return (
                            <>
                                <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 }}>
                                    <TouchableOpacity
                                        style={[s.createBtn, { flex:1, marginBottom:0, borderColor: cfg.color + '60' }]}
                                        onPress={() => {
                                            if (myIsAdmin || tournamentPermStatus === 'APPROVED') setShowCreateTournament(true);
                                            else setShowTournamentPermission(true);
                                        }}
                                    >
                                        <Text style={[s.createBtnText, { color: cfg.color }]}>{t.createTournamentBtn}</Text>
                                    </TouchableOpacity>
                                    <CityAlertBtn tab="tournaments" />
                                </View>
                                <CompactFilter showDateChips={true} />

                                {loadingTournaments
                                    ? <ActivityIndicator color={cfg.color} style={{ marginTop:40 }} />
                                    : (<>
                                        {inProgress.length > 0 && (
                                            <>
                                                <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginTop:8, marginBottom:4 }}>
                                                    <View style={{ flex:1, height:1, backgroundColor:'#16a34a40' }} />
                                                    <Text style={{ color:'#4ade80', fontSize:11, fontWeight:'800' }}>🏆 Devam Eden Turnuvalar</Text>
                                                    <View style={{ flex:1, height:1, backgroundColor:'#16a34a40' }} />
                                                </View>
                                                {inProgress.map(renderCard)}
                                            </>
                                        )}
                                        {open.length > 0 && (
                                            <>
                                                {inProgress.length > 0 && (
                                                    <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginTop:12, marginBottom:4 }}>
                                                        <View style={{ flex:1, height:1, backgroundColor: cfg.color+'40' }} />
                                                        <Text style={{ color: cfg.color, fontSize:11, fontWeight:'800' }}>📋 Açık Turnuvalar</Text>
                                                        <View style={{ flex:1, height:1, backgroundColor: cfg.color+'40' }} />
                                                    </View>
                                                )}
                                                {open.map(renderCard)}
                                            </>
                                        )}
                                        {tournaments.length === 0 && <EmptyState emoji="🏆" text={t.emptyTournaments} />}
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
                            <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:6 }}>
                                <View style={{ flex:1 }}>
                                    <CompactFilter showDateChips={false} />
                                </View>
                                <CityAlertBtn tab="equipment" />
                            </View>
                            {/* Durum filtresi */}
                            <View style={{ flexDirection:'row', gap:6, marginBottom:10 }}>
                                {['ALL','NEW','USED'].map(c => (
                                    <TouchableOpacity key={c} onPress={() => setEquipmentCondition(c)}
                                        style={{ flex:1, paddingVertical:7, borderRadius:8, alignItems:'center', backgroundColor: equipmentCondition===c ? cfg.color : colors.surface2, borderWidth:1, borderColor: equipmentCondition===c ? cfg.color : colors.border }}>
                                        <Text style={{ color: equipmentCondition===c ? '#fff' : colors.textSecondary, fontSize:12, fontWeight:'700' }}>
                                            {c==='ALL' ? 'Tümü' : c==='NEW' ? '🆕 Sıfır' : '♻️ İkinci El'}
                                        </Text>
                                    </TouchableOpacity>
                                ))}
                            </View>
                            {/* Filtre alanları */}
                            <View style={{ backgroundColor: colors.surface2, borderRadius:10, padding:10, marginBottom:10, borderWidth:1, borderColor: colors.border, gap:8 }}>
                                <TextInput
                                    placeholder="Ürün adı ara..."
                                    placeholderTextColor={colors.textMuted}
                                    value={equipmentSearch}
                                    onChangeText={setEquipmentSearch}
                                    style={{ backgroundColor: colors.surface, borderRadius:8, paddingHorizontal:10, paddingVertical:7, color:'#fff', borderWidth:1, borderColor: colors.border, fontSize:13 }}
                                />
                                <TextInput
                                    placeholder="İl / Konum"
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
                                            <Text style={{ color:'#ef4444', fontSize:11, fontWeight:'700' }}>Sıfırla</Text>
                                        </TouchableOpacity>
                                    )}
                                </View>
                            </View>
                            {/* İlan ekle butonu */}
                            <TouchableOpacity onPress={() => setShowEquipmentForm(true)}
                                style={{ flexDirection:'row', alignItems:'center', justifyContent:'center', gap:6, backgroundColor: cfg.color+'20', borderRadius:10, paddingVertical:9, marginBottom:10, borderWidth:1, borderColor: cfg.color+'50' }}>
                                <Text style={{ color: cfg.color, fontSize:13, fontWeight:'800' }}>+ İlan Ver</Text>
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
                            <Modal visible={showEquipmentForm} animationType="slide" transparent onRequestClose={() => { setShowEquipmentForm(false); setEquipmentMedia([]); }}>
                                <View style={{ flex:1, backgroundColor:'#00000090', justifyContent:'flex-end' }}>
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
                                            <TextInput placeholder="Konum / Şehir" placeholderTextColor={colors.textMuted} value={equipmentForm.location} onChangeText={v => setEquipmentForm(f=>({...f,location:v}))} style={{ backgroundColor:colors.surface2, borderRadius:8, paddingHorizontal:12, paddingVertical:8, color:'#fff', marginBottom:10, borderWidth:1, borderColor:colors.border }} />

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
                                            {selectedEquipment?.userId === myId && (
                                                <TouchableOpacity onPress={() => Alert.alert('İlanı Sil', 'Bu ilanı silmek istiyor musunuz?', [
                                                    { text:'İptal', style:'cancel' },
                                                    { text:'Sil', style:'destructive', onPress:() => deleteEquipment(selectedEquipment.id) }
                                                ])} style={{ backgroundColor:'#ef444420', borderRadius:10, paddingVertical:10, alignItems:'center', borderWidth:1, borderColor:'#ef444450' }}>
                                                    <Text style={{ color:'#ef4444', fontWeight:'800' }}>🗑️ İlanı Sil</Text>
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


                    {activeTab === 'coaches' && (
                        <>
                            <View style={{ flexDirection:'row', alignItems:'center', gap:8, marginBottom:6 }}>
                                <View style={{ flex:1 }} />
                                <CityAlertBtn tab="coaches" />
                            </View>
                            <CompactFilter showDateChips={false} />
                            {loadingCoaches
                                ? <ActivityIndicator color={cfg.color} style={{ marginTop:40 }} />
                                : filteredCoaches.length === 0
                                    ? <EmptyState emoji="🎓" text={coachListings.length > 0 ? t.noFilterMatch : t.emptyCoaches} />
                                    : filteredCoaches.map(c => (
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
                                            {c.city && <Text style={{ color:colors.textMuted, fontSize:11 }}>📍 {c.city}{c.location ? ` / ${c.location}` : ''}</Text>}
                                            {c.description && <Text style={{ color:colors.textSecondary, fontSize:12, marginTop:4 }} numberOfLines={2}>{c.description}</Text>}
                                        </View>
                                    ))
                            }
                        </>
                    )}

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
                                <View style={{ gap: 10, paddingVertical: 8 }}>
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
                                            <View key={m.id} style={[s.card, { padding: 12 }]}>
                                                <View style={{ flexDirection:'row', alignItems:'center', gap:6, marginBottom:6, flexWrap:'wrap' }}>
                                                    <Text style={{ color: cfg.color, fontSize:11, fontWeight:'800' }}>{sizeTxt}</Text>
                                                    {modeTxt ? <Text style={{ color: colors.textMuted, fontSize:11 }}>·</Text> : null}
                                                    {modeTxt ? <Text style={{ color: m.matchMode?.toUpperCase() === 'COMPETITIVE' ? '#ef4444' : '#22c55e', fontSize:11, fontWeight:'700' }}>{modeTxt}</Text> : null}
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>·</Text>
                                                    <Text style={{ color: colors.textMuted, fontSize:11 }}>
                                                        {m.flexibleSchedule ? '📅 Esnek' : m.matchDate ? new Date(m.matchDate).toLocaleDateString('tr-TR', { day:'numeric', month:'short' }) : ''}
                                                        {!m.flexibleSchedule && m.matchTime ? ` ${m.matchTime}` : ''}
                                                    </Text>
                                                    {myResult ? <Text style={{ fontSize:14, marginLeft:'auto' }}>{myResult}</Text> : null}
                                                </View>
                                                {(m.courtName || m.location) ? (
                                                    <Text style={{ color: colors.textMuted, fontSize:11, marginBottom:6 }}>
                                                        🏟️ {m.courtName || m.location}
                                                        {m.courtName && m.location ? `  📍 ${m.location}` : ''}
                                                    </Text>
                                                ) : null}
                                                <View style={{ flexDirection:'row', flexWrap:'wrap', gap:8, marginBottom: sets ? 4 : 0 }}>
                                                    {allP.map(p => {
                                                        const isSender = p.id === m.senderId;
                                                        const hist = snapshot[p.id];
                                                        const rBefore = hist?.skillRating_before;
                                                        const pts = hist?.change ?? null;
                                                        const pSets = sets ? sets.map(s2 => isSender ? s2.sender : s2.opponent) : null;
                                                        const pWins = sets ? sets.filter(s2 => (isSender ? s2.sender : s2.opponent) > (isSender ? s2.opponent : s2.sender)).length : null;
                                                        return (
                                                            <View key={p.id || p.username} style={{ alignItems:'flex-start', gap:2 }}>
                                                                <TouchableOpacity onPress={() => p.id && setProfileUserId(p.id)} activeOpacity={0.7} style={{ backgroundColor: colors.surface2, borderRadius:6, paddingHorizontal:8, paddingVertical:4, flexDirection:'row', alignItems:'center', gap:4 }}>
                                                                    <Text style={{ color:'#fff', fontSize:12, fontWeight:'600' }}>@{p.username}</Text>
                                                                    {rBefore != null && rBefore > 0 && <Text style={{ color:'#facc15', fontSize:11, fontWeight:'800' }}>{Number(rBefore).toFixed(2)} ★</Text>}
                                                                    {pts != null && pts !== 0 && <Text style={{ color: pts > 0 ? '#4ade80' : '#f87171', fontSize:11, fontWeight:'800' }}>{pts > 0 ? '+' : ''}{pts}p</Text>}
                                                                </TouchableOpacity>
                                                                {pSets && (
                                                                    <Text style={{ color: colors.textMuted, fontSize:11, paddingLeft:4 }}>
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
                    {activeTab === 'media' && (
                        mediaPosts.length === 0
                            ? <EmptyState emoji="📸" text={t.emptyMedia} />
                            : (
                                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 4 }}>
                                    {mediaPosts.map((post, idx) => (
                                        <TouchableOpacity
                                            key={post.id}
                                            style={{ width: '31.5%', aspectRatio: 1, borderRadius: 10, overflow: 'hidden', backgroundColor: colors.surface2 }}
                                            onPress={() => setMediaViewIdx(idx)}
                                        >
                                            {post.imageUrl
                                                ? <Image source={{ uri: post.imageUrl }} style={{ width: '100%', height: '100%' }} resizeMode="cover" />
                                                : <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
                                                    <Text style={{ fontSize: 30 }}>🎬</Text>
                                                  </View>
                                            }
                                            {post.type === 'STORY' && (
                                                <View style={{ position: 'absolute', top: 4, right: 4, backgroundColor: colors.purple, borderRadius: 6, paddingHorizontal: 4, paddingVertical: 1 }}>
                                                    <Text style={{ color: '#fff', fontSize: 9, fontWeight: '800' }}>24s</Text>
                                                </View>
                                            )}
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            )
                    )}

                    {/* ── NEWS ── */}
                    {activeTab === 'news' && (
                        <EmptyState emoji="📰" text={t.emptyNews} />
                    )}

                    {/* ── TEXT POSTS ── */}
                    {activeTab === 'posts' && (
                        textPosts.length === 0
                            ? <EmptyState emoji="✏️" text={t.emptyPosts} />
                            : textPosts.map(post => (
                                <TextPostCard key={post.id} post={post} cfg={cfg} onRefresh={load} />
                            ))
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
                                        {allP2.map(p => '@'+p.username).join(' · ')}
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
                                                <Text style={{ color:'#fff', fontSize:14, fontWeight:'700' }}>@{p.username}</Text>
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
                                                                    {rMatches.map(match => {
                                                                        const isDone = match.status === 'COMPLETED';
                                                                        const isBye = match.status === 'BYE';
                                                                        const isTBD = !match.p1Id || !match.p2Id;
                                                                        return (
                                                                            <View key={match.id} style={{ backgroundColor:'#0f172a', borderRadius:8, padding:8, marginBottom:5, borderWidth:1, borderColor: isDone ? '#16a34a30' : '#334155' }}>
                                                                                <View style={{ flexDirection:'row', alignItems:'center', justifyContent:'space-between' }}>
                                                                                    <View style={{ flex:1 }}>
                                                                                        <Text style={{ color: isDone && match.winnerId===match.p1Id ? '#4ade80' : '#fff', fontSize:12, fontWeight:'700' }}>{match.p1Name || 'TBD'}</Text>
                                                                                        <Text style={{ color:colors.textMuted, fontSize:10 }}>vs</Text>
                                                                                        <Text style={{ color: isDone && match.winnerId===match.p2Id ? '#4ade80' : '#fff', fontSize:12, fontWeight:'700' }}>{match.p2Name || 'TBD'}</Text>
                                                                                    </View>
                                                                                    <View style={{ alignItems:'flex-end' }}>
                                                                                        {(isBye || isTBD) && <Text style={{ color:colors.textMuted, fontSize:10 }}>{isBye ? 'BYE' : 'TBD'}</Text>}
                                                                                        {isDone && match.score && (
                                                                                            <Text style={{ color:'#94a3b8', fontSize:12, fontWeight:'700' }}>
                                                                                                {(match.score.sets||[]).map(s=>`${s.p1}-${s.p2}`).join(', ')}
                                                                                            </Text>
                                                                                        )}
                                                                                    </View>
                                                                                </View>
                                                                            </View>
                                                                        );
                                                                    })}
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
            <Modal visible={mediaViewIdx !== null} animationType="fade" transparent onRequestClose={() => setMediaViewIdx(null)}>
                <View style={{ flex: 1, backgroundColor: '#000000ee', justifyContent: 'center', alignItems: 'center' }}>
                    <TouchableOpacity style={{ position: 'absolute', top: 56, right: 20, zIndex: 10 }} onPress={() => setMediaViewIdx(null)}>
                        <Text style={{ color: '#fff', fontSize: 28, fontWeight: '700' }}>✕</Text>
                    </TouchableOpacity>
                    {mediaViewIdx !== null && mediaPosts[mediaViewIdx] && (
                        <>
                            {mediaPosts[mediaViewIdx].imageUrl
                                ? <Image source={{ uri: mediaPosts[mediaViewIdx].imageUrl }} style={{ width: '100%', height: '80%' }} resizeMode="contain" />
                                : <View style={{ alignItems: 'center' }}><Text style={{ fontSize: 60 }}>🎬</Text><Text style={{ color: '#fff', marginTop: 8 }}>Video</Text></View>
                            }
                            <View style={{ position: 'absolute', bottom: 80, left: 20, right: 20 }}>
                                <Text style={{ color: '#fff', fontSize: 13, fontWeight: '700', textAlign: 'center', opacity: 0.7 }}>
                                    @{mediaPosts[mediaViewIdx].user?.username} · {mediaPosts[mediaViewIdx].subCategory}
                                </Text>
                            </View>
                            <View style={{ position: 'absolute', flexDirection: 'row', bottom: 40, gap: 20 }}>
                                {mediaViewIdx > 0 && (
                                    <TouchableOpacity style={s.storyNavBtn} onPress={() => setMediaViewIdx(i => i - 1)}>
                                        <Text style={{ color: '#fff', fontWeight: '700' }}>‹ Önceki</Text>
                                    </TouchableOpacity>
                                )}
                                {mediaViewIdx < mediaPosts.length - 1 && (
                                    <TouchableOpacity style={s.storyNavBtn} onPress={() => setMediaViewIdx(i => i + 1)}>
                                        <Text style={{ color: '#fff', fontWeight: '700' }}>Sonraki ›</Text>
                                    </TouchableOpacity>
                                )}
                            </View>
                        </>
                    )}
                </View>
            </Modal>
        </View>
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

    createBtn:        { backgroundColor: colors.surface, borderRadius:14, paddingVertical:14, alignItems:'center', borderWidth:1, borderStyle:'dashed' },
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
